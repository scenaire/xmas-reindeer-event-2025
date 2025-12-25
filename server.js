import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import crypto from 'crypto';
import 'dotenv/config';
import fs from 'fs-extra';
import { GachaManager } from './src/backend/gachaManager.js';

// --- Configuration ---
const PORT = process.env.PORT || 8080;
// ✅ ดึงค่าจาก .env ตามชื่อใหม่ที่คุณตั้ง
const TWITCH_SECRET = process.env.TWITCH_SIGNING_SECRET; // อย่าลืมบรรทัดนี้ใน .env นะคะ (สำหรับ Webhook)
const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const USER_ACCESS_TOKEN = process.env.TWITCH_USER_ACCESS_TOKEN; // ใช้ User Token
const CHANNEL_NAME = process.env.CHANNEL_NAME;

const ONLINE_CHECK_INTERVAL = 20000; // เช็คชื่อทุก 20 วินาที

// --- File Paths ---
const REINDEER_LOG_PATH = './data/reindeers.json';
const GAME_STATE_PATH = './data/gameState.json';

// --- Setup Server ---
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

app.use(express.static('public'));
app.use(express.json({
    verify: (req, res, buf) => { req.rawBody = buf }
}));

const gachaSystem = new GachaManager();
let visibleUsers = new Set();

// --- 💾 Helper Functions ---

function loadGameState() {
    fs.ensureFileSync(GAME_STATE_PATH);
    try { return fs.readJsonSync(GAME_STATE_PATH); } catch (err) { return {}; }
}

function updateGameState(userData) {
    const currentState = loadGameState();
    currentState[userData.owner] = userData;
    fs.writeJsonSync(GAME_STATE_PATH, currentState, { spaces: 2 });
}

// ✅ แก้ไขฟังก์ชันนี้ให้ใช้ USER_ACCESS_TOKEN
async function getOnlineViewers() {
    if (!CLIENT_ID || !USER_ACCESS_TOKEN || !CHANNEL_NAME) {
        console.warn("⚠️ Warning: Missing Twitch Credentials in .env (Check CLIENT_ID / USER_ACCESS_TOKEN)");
        return null;
    }

    try {
        // 1. หา ID ของช่องก่อน (Broadcaster ID)
        const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${CHANNEL_NAME}`, {
            headers: {
                'Client-Id': CLIENT_ID,
                'Authorization': `Bearer ${USER_ACCESS_TOKEN}` // ✅ ใช้ User Token
            }
        });

        const userData = await userRes.json();
        if (!userData.data || userData.data.length === 0) {
            console.warn(`⚠️ Channel '${CHANNEL_NAME}' not found.`);
            return null;
        }
        const broadcasterId = userData.data[0].id;

        // 2. ดึงรายชื่อคนดู (Get Chatters)
        const chattersRes = await fetch(`https://api.twitch.tv/helix/chat/chatters?broadcaster_id=${broadcasterId}&moderator_id=${broadcasterId}&first=1000`, {
            headers: {
                'Client-Id': CLIENT_ID,
                'Authorization': `Bearer ${USER_ACCESS_TOKEN}` // ✅ ใช้ User Token
            }
        });

        if (!chattersRes.ok) {
            const err = await chattersRes.json();
            console.warn(`⚠️ Cannot get chatters: ${err.message} (Status: ${chattersRes.status})`);
            return null;
        }

        const chattersData = await chattersRes.json();
        const onlineNames = chattersData.data.map(user => user.user_login.toLowerCase());

        return new Set(onlineNames);

    } catch (error) {
        console.error("❌ Helix API Error:", error.message);
        return null;
    }
}

// --- Loop เช็คชื่ออัตโนมัติ ---
setInterval(async () => {
    const onlineUsers = await getOnlineViewers();
    if (!onlineUsers) return;

    const currentState = loadGameState();

    // A. เช็คคนหาย
    visibleUsers.forEach(owner => {
        if (!onlineUsers.has(owner.toLowerCase())) {
            console.log(`👋 ${owner} left the stream.`);
            io.emit('game_event', { type: 'DISMISS', owner: owner });
            visibleUsers.delete(owner);
        }
    });

    // B. เช็คคนกลับมา
    Object.values(currentState).forEach(deer => {
        const ownerLower = deer.owner.toLowerCase();
        if (onlineUsers.has(ownerLower) && !visibleUsers.has(deer.owner)) {
            console.log(`✨ ${deer.owner} returned!`);
            io.emit('game_event', { type: 'SPAWN', ...deer, isRestore: true });
            visibleUsers.add(deer.owner);
        }
    });

}, ONLINE_CHECK_INTERVAL);

// --- Socket.io ---
io.on('connection', async (socket) => {
    console.log('🔌 Overlay connected! Checking online users...');
    visibleUsers.clear();

    const currentState = loadGameState();
    const onlineUsers = await getOnlineViewers();
    let activeDeers = Object.values(currentState);

    // กรองเอาเฉพาะคนออนไลน์
    if (onlineUsers) {
        const total = activeDeers.length;
        activeDeers = activeDeers.filter(deer => onlineUsers.has(deer.owner.toLowerCase()));
        console.log(`✨ Filtered: Show ${activeDeers.length}/${total} deers (Online Only)`);
    } else {
        console.log(`⚠️ Online check skipped/failed. Showing all deers.`);
    }

    if (activeDeers.length > 0) {
        activeDeers.forEach((deer, index) => {
            visibleUsers.add(deer.owner);
            setTimeout(() => {
                socket.emit('game_event', { type: 'SPAWN', ...deer, isRestore: true });
            }, index * 100);
        });
    }
});

// --- Webhook Route ---
app.post('/eventsub/callback', (req, res) => {
    const { 'twitch-eventsub-message-type': messageType } = req.headers;

    // (เช็ค Signature ต้องใช้ TWITCH_SECRET จาก .env ซึ่งต้องตั้งแยกต่างหากนะคะ)
    if (!verifyTwitchSignature(req)) return res.status(403).send("Forbidden");
    if (messageType === 'webhook_callback_verification') return res.send(req.body.challenge);

    if (messageType === 'notification') {
        const event = req.body.event;
        const rewardTitle = event.reward.title.toLowerCase().trim();
        const userName = event.user_name;
        const userInput = event.user_input || "";

        console.log(`🎁 Check Reward: [${rewardTitle}] by ${userName}`);

        if (rewardTitle.includes("reindeer: run left")) io.emit('command', { type: 'RUN_LEFT' });
        else if (rewardTitle.includes("reindeer: run right")) io.emit('command', { type: 'RUN_RIGHT' });
        else if (rewardTitle.includes("reindeer: jump all")) io.emit('command', { type: 'JUMP_ALL' });
        else if (rewardTitle.includes("reindeer: find my deer")) io.emit('command', { type: 'FIND_MY_DEER', targetOwner: userName });
        else if (rewardTitle.includes("reindeer: zero gravity")) io.emit('command', { type: 'ZERO_GRAVITY' });
        else if (rewardTitle.includes("spawn reindeer")) {
            console.log("🦌 SPAWN: Rolling Gacha...");
            const result = gachaSystem.roll(userName);
            const bubbleType = analyzeWish(userInput);
            const payload = {
                type: 'SPAWN', id: Date.now(), owner: userName, wish: userInput,
                rarity: result.rarity, image: result.image, bubbleType: bubbleType,
                behavior: result.behavior, pityCount: result.pityCount,
                isNewYear: process.env.EVENT_MODE === 'new_year'
            };

            io.emit('game_event', payload);
            updateGameState(payload);
            visibleUsers.add(userName);
            logReindeer(payload);
        }
        return res.sendStatus(200);
    }
    res.sendStatus(200);
});

// --- Helpers ---
function verifyTwitchSignature(req) {
    const messageId = req.headers['twitch-eventsub-message-id'];
    const timestamp = req.headers['twitch-eventsub-message-timestamp'];
    const signature = req.headers['twitch-eventsub-message-signature'];
    if (!TWITCH_SECRET || !signature || !messageId || !timestamp) return false;
    const hmacMessage = messageId + timestamp + req.rawBody;
    const hmac = 'sha256=' + crypto.createHmac('sha256', TWITCH_SECRET).update(hmacMessage).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(signature));
}
function analyzeWish(text) {
    const t = text.toLowerCase();
    if (/เงิน|รวย|หวย|กาชา|เกลือ|เรท|เพชร|โชค|divine|สาธุ/.test(t)) return 'money';
    if (/รัก|แฟน|หัวใจ|ชอบ|โสด|แต่งงาน|love|heart/.test(t)) return 'love';
    if (/กิน|อร่อย|หิว|หมูกระทะ|ชาบู|ข้าว|ขนม|น้ำเงี้ยว|มิ้นช็อค|ไก่/.test(t)) return 'food';
    if (/ผี|บิด|ปวดหลัง|นอน|งาน|ทุบ|สยอง|ตาย|horror|ghost|scam/.test(t)) return 'chaos';
    return 'default';
}
function logReindeer(data) {
    fs.ensureFileSync(REINDEER_LOG_PATH);
    const logs = fs.readJsonSync(REINDEER_LOG_PATH, { throws: false }) || [];
    logs.push(data);
    fs.writeJsonSync(REINDEER_LOG_PATH, logs);
}

httpServer.listen(PORT, () => {
    console.log(`🎄 Xmas Server running on port ${PORT}`);
    console.log(`📡 Online Check enabled using Helix API`);
});