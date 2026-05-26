#include <websocketpp/config/asio_no_tls.hpp>
#include <websocketpp/server.hpp>

#include <unordered_map>
#include <iostream>
#include <set>
#include <map>
#include <vector>
#include <string>

#include <nlohmann/json.hpp>
#include "game.h"

using json = nlohmann::json;
using websocketpp::connection_hdl;

typedef websocketpp::server<websocketpp::config::asio> server;

struct Player{
    Player(connection_hdl a,std::string b):hdl(a),token(b){}
    connection_hdl hdl;
    std::string token;
    std::string name="NONE";
    bool ready=0;
};

struct Room {
    int id;
    Game game;
    std::vector<Player> players;
};

server ws_server;

std::string cha="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

std::vector<Room> rooms;
std::unordered_map<std::string,Player> auth_players;
std::map<connection_hdl,Player*> hdl_to_players;
int next_player_id = 1;
int next_room_id = 1;

std::string romdom_token(){
    std::string s;
    for(int i=0;i<48;i++){
        s+=cha[tt()%62];
    }
    return s;
} 

// 广播给房间所有人
void broadcast(Room& room, const std::string& msg) {
    for (auto& p : room.players) {
        ws_server.send(p.hdl, msg, websocketpp::frame::opcode::text);
    }
}


// 新连接
// void on_open(connection_hdl hdl) {
//     int now=next_player_id++;
//     playerid[hdl]=now;
//     json j={{"type","connected"},{"date",{"player_id",now}}};
//     ws_server.send(hdl,j.dump(),websocketpp::frame::opcode::text);
//     std::cout<<"Player"<<now<<" connected\n";
// }

// 收到消息
std::unordered_map<std::string,int> ty={{"auth",0},{"change_name",1}}; 

void on_message(connection_hdl hdl, server::message_ptr msg) {
    json j=json::parse(msg->get_payload());
    if(!j.contains("type"))return;
    std::string type=j.at("type").get<std::string>();
    switch(ty[type]){
        case 0:{
            if(!j.contains("token")||j["token"]==""){
                std::string token=romdom_token();
                auto [it, inserted] = auth_players.emplace(token, Player{hdl, token});
                if (inserted) {
                    hdl_to_players[hdl] = &it->second;
                }
            }
            else{
                auto it =auth_players.find(j["token"]);
                if (it!=auth_players.end()){
                    it->second.hdl=hdl;
                    hdl_to_players[hdl] = &it->second;
                }
                else{
                    auto [it, inserted] = auth_players.emplace(j["token"], Player{hdl, j["token"]});
                    if (inserted) {
                    hdl_to_players[hdl] = &it->second;
                    }
                }
                json msgs;
                msgs["name"]=auth_players[j["token"]].name;
                msgs["type"]="player_name";
                ws_server.send(hdl, msgs.dump(), websocketpp::frame::opcode::text);
            }
            break;
        }
        case 1:{
            hdl_to_players[hdl]->name=j["name"];
            break;
        }
    }
}

// 断开连接
void on_close(connection_hdl hdl) {
    
}

int main() {
    ws_server.init_asio();

   // ws_server.set_open_handler(&on_open);
    ws_server.set_message_handler(&on_message);
    ws_server.set_close_handler(&on_close);

    ws_server.listen(9002);
    ws_server.start_accept();

    std::cout << "Server started on ws://localhost:9002\n";

    ws_server.run();
}