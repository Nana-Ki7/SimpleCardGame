/**
 * game.js — 房间 + 游戏逻辑
 */

// ===== 初始化 =====
const urlParams = new URLSearchParams(window.location.search);
const roomId = parseInt(urlParams.get("room")) || 0;

document.getElementById("room-id").textContent = roomId;

// DOM 引用
const dom = {
    statusText: document.getElementById("game-status-text"),
    playersInfo: document.getElementById("players-info"),
    lastPlayArea: document.getElementById("last-play-area"),
    turnHint: document.getElementById("turn-hint"),
    handCards: document.getElementById("hand-cards"),
    handActions: document.getElementById("hand-actions"),
    playBtn: document.getElementById("play-btn"),
    passBtn: document.getElementById("pass-btn"),
    readyArea: document.getElementById("ready-area"),
    readyBtn: document.getElementById("ready-btn"),
    chatMsgs: document.getElementById("chat-msgs"),
    chatInput: document.getElementById("chat-input"),
    chatSend: document.getElementById("chat-send-btn"),
    leaveBtn: document.getElementById("leave-btn"),
};

let selectedCards = [];

// 新协议：auth_ok 不再返回 player_id，通过 token 对应玩家身份
// 登录后立即加入房间
window.onAuthOk = function() {
    send({ type: "join_room", room_id: roomId });
    loadNick();
};

function loadNick() {
    myName = getStored("nanaki_name", "");
    if (myName) send({ type: "change_name", name: myName });
}

// ===== 玩家信息更新 =====
function updatePlayers() {
    const slots = dom.playersInfo.querySelectorAll(".player-slot");
    for (let i = 0; i < 4; i++) {
        const slot = slots[i];
        const p = roomPlayers[i];
        if (p) {
            slot.querySelector(".player-name").textContent = p.name || `玩家${p.id}`;
            slot.querySelector(".player-status").textContent = p.ready ? "✓ 已准备" : "";
            slot.querySelector(".player-cards-left").textContent = p.cardsLeft != null ? `${p.cardsLeft}张` : "";
            slot.classList.toggle("player-active", p.isActive);
            // 用 token 标识自己（新协议无 player_id）
            slot.querySelector(".player-name").style.color = p.isMe ? "#ffd700" : "";
        } else {
            slot.querySelector(".player-name").textContent = "-";
            slot.querySelector(".player-status").textContent = "";
            slot.querySelector(".player-cards-left").textContent = "";
            slot.classList.remove("player-active");
        }
    }
}

// ===== 房间事件 =====
window.onPlayerJoined = function(msg) {
    roomPlayers.push({ 
        id: msg.player_id, 
        name: msg.player_name || `玩家${msg.player_id}`, 
        ready: false 
    });
    updatePlayers();
    dom.statusText.textContent = `等待中 (${msg.player_count}/4)`;
};

window.onPlayerLeft = function(msg) {
    roomPlayers = roomPlayers.filter(p => p.id !== msg.player_id);
    while (roomPlayers.length < 4) roomPlayers.push(null);
    updatePlayers();
};

// 新协议：player_name → player_name_changed
window.onPlayerNameChanged = function(msg) {
    const p = roomPlayers.find(x => x && x.id === msg.player_id);
    if (p) p.name = msg.name;
    updatePlayers();
};

window.onPlayerReady = function(msg) {
    const p = roomPlayers.find(x => x && x.id === msg.player_id);
    if (p) p.ready = true;
    updatePlayers();
};

// ===== 准备按钮 =====
dom.readyBtn.addEventListener("click", () => {
    send({ type: "ready" });
    dom.readyBtn.disabled = true;
    dom.readyBtn.textContent = "已准备";
});

// ===== 游戏开始 =====
window.onGameStart = function(msg) {
    dom.readyArea.classList.add("hidden");
    dom.handActions.classList.remove("hidden");
    myHand = msg.hand || [];
    dom.statusText.textContent = "游戏进行中";
    renderHand();
    updatePlayers();
};

// ===== 轮到谁 =====
window.onYourTurn = function(msg) {
    roomPlayers.forEach(p => { if (p) p.isActive = (p.id === msg.player_id); });
    updatePlayers();

    if (msg.last_play && msg.last_play.length > 0) {
        dom.lastPlayArea.innerHTML = msg.last_play.map(c =>
            `<img src="${cardImg(c.num, c.suit)}" alt="card">`
        ).join("");
    } else {
        dom.lastPlayArea.innerHTML = "";
    }

    // 新协议：用 player_id 判断是否是我 —— 通过 token 对应，暂用比对 
    // 这里需要后端在 your_turn 时能让我知道哪个 id 是我
    // 临时方案：看 last_player 或 player_id 是否等于某个已知的我的 id
    // 后端 join_room 时返回 player_id，我们存一下
    if (msg.player_id === myPlayerId) {
        dom.turnHint.textContent = msg.is_free ? "自由出牌" : "轮到你了";
        dom.handActions.classList.remove("hidden");
    } else {
        const p = roomPlayers.find(x => x && x.id === msg.player_id);
        dom.turnHint.textContent = `等待 ${p ? p.name : '对方'} 出牌...`;
        dom.handActions.classList.add("hidden");
    }
};

// 新协议：room_joined 时记录自己的 player_id
let myPlayerId = null;

// 覆盖 lobby.js 的 onRoomJoined（game.html 会先加载 ws.js 再加载 game.js）
window.onRoomJoined = function(msg) {
    // 协议里 room_joined 没有 player_id，暂时用已知方式
    // 如果后端 room_joined 返回 player_id，这里存一下
    // 否则通过 token 无法知道自己在 roomPlayers 里的 id
    // 临时：等待后端完善
};

// ===== 手牌渲染 =====
function renderHand() {
    dom.handCards.innerHTML = myHand.map((c, i) => {
        const sel = selectedCards.includes(i) ? "selected" : "";
        return `<img src="${cardImg(c.num, c.suit)}" class="${sel}" data-idx="${i}" alt="card">`;
    }).join("");

    dom.handCards.querySelectorAll("img").forEach(img => {
        img.addEventListener("click", () => {
            const idx = parseInt(img.dataset.idx);
            const pos = selectedCards.indexOf(idx);
            if (pos === -1) selectedCards.push(idx);
            else selectedCards.splice(pos, 1);
            renderHand();
        });
    });
}

// ===== 出牌/过牌 =====
dom.playBtn.addEventListener("click", () => {
    if (selectedCards.length === 0) return;
    const cards = selectedCards.map(i => myHand[i]);
    send({ type: "play", cards: cards });
    selectedCards = [];
});

dom.passBtn.addEventListener("click", () => {
    send({ type: "pass" });
    selectedCards = [];
    dom.handActions.classList.add("hidden");
});

// ===== 出牌结果 =====
window.onPlayResult = function(msg) {
    if (msg.player_id === myPlayerId) {
        msg.cards.forEach(c => {
            const idx = myHand.findIndex(h => h.num === c.num && h.suit === c.suit);
            if (idx !== -1) myHand.splice(idx, 1);
        });
        renderHand();
        dom.handActions.classList.add("hidden");
    }
    dom.lastPlayArea.innerHTML = msg.cards.map(c =>
        `<img src="${cardImg(c.num, c.suit)}" alt="card">`
    ).join("");
    const p = roomPlayers.find(x => x && x.id === msg.player_id);
    if (p) p.cardsLeft = msg.cards_left;
    updatePlayers();
    dom.turnHint.textContent = "";
};

window.onPlayInvalid = function(msg) {
    alert("出牌无效：" + (msg.message || "不合法的牌型"));
};

window.onPlayerPass = function(msg) {
    dom.turnHint.textContent = "";
    dom.lastPlayArea.innerHTML = "";
};

window.onPlayerFinish = function(msg) {
    const p = roomPlayers.find(x => x && x.id === msg.player_id);
    dom.turnHint.textContent = `${p ? p.name : '玩家'} 出完了！第 ${msg.rank} 名`;
};

// 新协议：game_over 用 ranking 数组，不用 winner_id
window.onGameOver = function(msg) {
    const ranking = msg.ranking || [];
    const winnerId = ranking[0];
    const winner = roomPlayers.find(x => x && x.id === winnerId);
    dom.turnHint.textContent = `游戏结束！${winner ? winner.name : '玩家'} 获胜！`;
    dom.handActions.classList.add("hidden");
    selectedCards = [];
};

// ===== 聊天 =====
dom.chatSend.addEventListener("click", sendChat);
dom.chatInput.addEventListener("keydown", (e) => { if (e.key === "Enter") sendChat(); });

function sendChat() {
    const text = dom.chatInput.value.trim();
    if (!text) return;
    send({ type: "chat", text: text });
    dom.chatInput.value = "";
}

window.onChatMsg = function(msg) {
    const isMe = msg.player_id === myPlayerId;
    const name = isMe ? myName : (msg.player_name || `玩家${msg.player_id}`);
    const el = document.createElement("div");
    el.className = "chat-msg";
    el.innerHTML = `<span class="sender ${isMe ? 'me' : ''}">${escapeHtml(name)}:</span>${escapeHtml(msg.text)}`;
    dom.chatMsgs.appendChild(el);
    dom.chatMsgs.scrollTop = dom.chatMsgs.scrollHeight;
};

function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ===== 退出房间 =====
dom.leaveBtn.addEventListener("click", () => {
    send({ type: "leave_room" });
    window.location.href = "index.html";
});

window.onError = function(msg) {
    console.warn("server error:", msg.message || msg.code);
};
