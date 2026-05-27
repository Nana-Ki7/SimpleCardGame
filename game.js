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

let selectedCards = []; // 当前选中牌的索引

// ===== 认证成功后加入房间 =====
window.onAuthOk = function() {
    // 加入房间
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
            if (p.id === myId) slot.querySelector(".player-name").style.color = "#ffd700";
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
    const p = { id: msg.player_id, name: msg.player_name || `玩家${msg.player_id}`, ready: false };
    roomPlayers.push(p);
    updatePlayers();
    dom.statusText.textContent = `等待中 (${msg.player_count}/4)`;
};

window.onPlayerLeft = function(msg) {
    roomPlayers = roomPlayers.filter(p => p.id !== msg.player_id);
    // 重新填充空位
    while (roomPlayers.length < 4) roomPlayers.push(null);
    updatePlayers();
};

window.onPlayerName = function(msg) {
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
    // 更新活跃玩家
    roomPlayers.forEach(p => { if (p) p.isActive = (p.id === msg.player_id); });
    updatePlayers();

    // 显示上一次出的牌
    if (msg.last_play && msg.last_play.length > 0) {
        dom.lastPlayArea.innerHTML = msg.last_play.map(c =>
            `<img src="${cardImg(c.num, c.suit)}" alt="card">`
        ).join("");
    } else {
        dom.lastPlayArea.innerHTML = "";
    }

    if (msg.player_id === myId) {
        dom.turnHint.textContent = msg.is_free ? "自由出牌（清牌桌）" : "轮到你了";
        dom.handActions.classList.remove("hidden");
    } else {
        const p = roomPlayers.find(x => x && x.id === msg.player_id);
        dom.turnHint.textContent = `等待 ${p ? p.name : '对方'} 出牌...`;
        dom.handActions.classList.add("hidden");
    }
};

// ===== 手牌渲染 =====
function renderHand() {
    dom.handCards.innerHTML = myHand.map((c, i) => {
        const sel = selectedCards.includes(i) ? "selected" : "";
        return `<img src="${cardImg(c.num, c.suit)}" class="${sel}" data-idx="${i}" alt="card">`;
    }).join("");

    // 点击选牌
    dom.handCards.querySelectorAll("img").forEach(img => {
        img.addEventListener("click", () => {
            const idx = parseInt(img.dataset.idx);
            const pos = selectedCards.indexOf(idx);
            if (pos === -1) {
                selectedCards.push(idx);
            } else {
                selectedCards.splice(pos, 1);
            }
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
    // 如果是我出的，从手牌移除
    if (msg.player_id === myId) {
        // 按 num,suit 匹配移除（简单处理）
        msg.cards.forEach(c => {
            const idx = myHand.findIndex(h => h.num === c.num && h.suit === c.suit);
            if (idx !== -1) myHand.splice(idx, 1);
        });
        renderHand();
        dom.handActions.classList.add("hidden");
    }
    // 更新牌面
    dom.lastPlayArea.innerHTML = msg.cards.map(c =>
        `<img src="${cardImg(c.num, c.suit)}" alt="card">`
    ).join("");
    // 更新剩余牌数
    const p = roomPlayers.find(x => x && x.id === msg.player_id);
    if (p) p.cardsLeft = msg.cards_left;
    updatePlayers();
    dom.turnHint.textContent = "";
};

window.onPlayInvalid = function(msg) {
    alert("出牌无效：" + (msg.reason || "不合法的牌型"));
};

window.onPlayerPass = function(msg) {
    dom.turnHint.textContent = "";
    dom.lastPlayArea.innerHTML = "";
};

window.onPlayerFinish = function(msg) {
    const p = roomPlayers.find(x => x && x.id === msg.player_id);
    dom.turnHint.textContent = `${p ? p.name : '玩家'} 出完了！第 ${msg.rank} 名`;
};

window.onGameOver = function(msg) {
    const winner = roomPlayers.find(x => x && x.id === msg.winner_id);
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
    const isMe = msg.player_id === myId;
    const name = isMe ? myName : (msg.player_name || `玩家${msg.player_id}`);
    const el = document.createElement("div");
    el.className = "chat-msg";
    el.innerHTML = `<span class="sender ${isMe ? 'me' : ''}">${name}:</span>${escapeHtml(msg.text)}`;
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
    console.warn("server error:", msg.message);
};
