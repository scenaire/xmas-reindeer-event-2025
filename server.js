import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import crypto from 'crypto';
import 'dotenv/config';
import fs from 'fs-extra';
import { GachaManager } from './src/backend/gachaManager.js';
import tmi from 'tmi.js';

// --- Configuration ---
const PORT = process.env.PORT || 8080;
const TWITCH_SECRET = process.env.TWITCH_SIGNING_SECRET;
const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const USER_ACCESS_TOKEN = process.env.TWITCH_USER_ACCESS_TOKEN;
const CHANNEL_NAME = process.env.CHANNEL_NAME;
const ONLINE_CHECK_INTERVAL = 20000;

// --- File Paths ---
const REINDEER_LOG_PATH = './data/reindeers.json';
const GAME_STATE_PATH = './data/gameState.json';
const COLLECTION_PATH = './data/collection.json';
const EMOTE_CACHE_PATH = './data/emoteCache.json'; // 📁 เพิ่ม Path Cache

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
const userLastActive = {};

// ✅ สมุดจด Emote (รวมทั้งจาก API และ TMI)
let emoteDictionary = {};

// --- 💾 Helper Functions ---

function loadGameState() {
    fs.ensureFileSync(GAME_STATE_PATH);
    try { return fs.readJsonSync(GAME_STATE_PATH); } catch (err) { return {}; }
}

function updateGameState(userData) {
    if (!userData || !userData.owner) return;
    const currentState = loadGameState();
    currentState[userData.owner] = userData;
    fs.writeJsonSync(GAME_STATE_PATH, currentState, { spaces: 2 });
}

// ---------------------------------------------------------
// 🖼️ EMOTE SYSTEM (Ported from Krathongs Project)
// ---------------------------------------------------------

async function fetchChannelEmotes() {
    // 1. ลองโหลดจาก Cache ก่อน
    if (fs.existsSync(EMOTE_CACHE_PATH)) {
        try {
            const cache = fs.readJsonSync(EMOTE_CACHE_PATH);
            const age = Date.now() - cache.timestamp;
            // ถ้า Cache อายุไม่เกิน 24 ชม. ให้ใช้เลย
            if (age < 24 * 60 * 60 * 1000) {
                console.log("💾 Loaded emotes from cache.");
                // Merge เข้า Dictionary หลัก
                Object.assign(emoteDictionary, cache.data);
                return;
            }
        } catch (e) { console.warn("Cache invalid, fetching new..."); }
    }

    // 2. ถ้าไม่มี Cache ต้องยิง API
    if (!CLIENT_ID || !USER_ACCESS_TOKEN || !CHANNEL_NAME) return;

    try {
        console.log("🌐 Fetching channel emotes from Twitch API...");

        // A. หา ID ช่อง (Broadcaster ID)
        const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${CHANNEL_NAME}`, {
            headers: { 'Client-Id': CLIENT_ID, 'Authorization': `Bearer ${USER_ACCESS_TOKEN}` }
        });
        const userData = await userRes.json();
        if (!userData.data || userData.data.length === 0) return;
        const broadcasterId = userData.data[0].id;

        // B. ดึง Emote ของช่อง
        const emoteRes = await fetch(`https://api.twitch.tv/helix/chat/emotes?broadcaster_id=${broadcasterId}`, {
            headers: { 'Client-Id': CLIENT_ID, 'Authorization': `Bearer ${USER_ACCESS_TOKEN}` }
        });
        const emoteData = await emoteRes.json();

        const newEmotes = {};
        if (emoteData.data) {
            emoteData.data.forEach(emote => {
                // เก็บเป็น Name -> ID (เช่น "nairsLove": "12345")
                newEmotes[emote.name] = emote.id;
            });
        }

        // C. บันทึกลงไฟล์และ Memory
        Object.assign(emoteDictionary, newEmotes); // รวมร่าง
        fs.ensureFileSync(EMOTE_CACHE_PATH);
        fs.writeJsonSync(EMOTE_CACHE_PATH, {
            timestamp: Date.now(),
            data: newEmotes
        }, { spaces: 2 });

        console.log(`✅ Cached ${Object.keys(newEmotes).length} channel emotes.`);

    } catch (err) {
        console.error("⚠️ Error fetching emotes:", err.message);
    }
}

// เรียกทำงานตอนเริ่ม Server ทันที
fetchChannelEmotes();

// ---------------------------------------------------------

async function getOnlineViewers() {
    // ... (ใช้ฟังก์ชันเดิมของคุณ) ...
    // เนื่องจากเรามี fetchChannelEmotes แยกแล้ว ฟังก์ชันนี้ใช้แค่เช็คคนดูพอครับ
    if (!CLIENT_ID || !USER_ACCESS_TOKEN || !CHANNEL_NAME) return null;
    try {
        const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${CHANNEL_NAME}`, {
            headers: { 'Client-Id': CLIENT_ID, 'Authorization': `Bearer ${USER_ACCESS_TOKEN}` }
        });
        const userData = await userRes.json();
        if (!userData.data || !userData.data[0]) return null;
        const broadcasterId = userData.data[0].id;

        const chattersRes = await fetch(`https://api.twitch.tv/helix/chat/chatters?broadcaster_id=${broadcasterId}&moderator_id=${broadcasterId}&first=1000`, {
            headers: { 'Client-Id': CLIENT_ID, 'Authorization': `Bearer ${USER_ACCESS_TOKEN}` }
        });
        if (!chattersRes.ok) return null;
        const chattersData = await chattersRes.json();
        return new Set(chattersData.data.map(user => user.user_login.toLowerCase()));
    } catch (error) { return null; }
}

// --- Loop เช็คชื่ออัตโนมัติ (เหมือนเดิม) ---
setInterval(async () => {
    // ... (Logic เดิม: เช็คคนหาย / คนกลับมา) ...
    const onlineUsers = await getOnlineViewers();
    if (!onlineUsers) return;

    const currentState = loadGameState();

    // A. เช็คคนหาย (พร้อม Immunity 2 นาที)
    visibleUsers.forEach(owner => {
        const isOfflineInAPI = !onlineUsers.has(owner.toLowerCase());
        const lastSeen = userLastActive[owner] || 0;
        const isInactive = (Date.now() - lastSeen) > 120000;

        if (isOfflineInAPI && isInactive) {
            io.emit('game_event', { type: 'DISMISS', owner: owner });
            visibleUsers.delete(owner);
        }
    });

    // B. เช็คคนกลับมา
    Object.values(currentState).forEach(deer => {
        if (!deer || !deer.owner) return;
        if (onlineUsers.has(deer.owner.toLowerCase()) && !visibleUsers.has(deer.owner)) {
            io.emit('game_event', { type: 'SPAWN', ...deer, isRestore: true });
            visibleUsers.add(deer.owner);
        }
    });
}, ONLINE_CHECK_INTERVAL);

// --- Socket.io ---
io.on('connection', async (socket) => {
    // ... (Logic เดิม) ...
});

// --- Webhook Route ---
app.post('/eventsub/callback', (req, res) => {
    const { 'twitch-eventsub-message-type': messageType } = req.headers;

    if (!verifyTwitchSignature(req)) return res.status(403).send("Forbidden");
    if (messageType === 'webhook_callback_verification') return res.send(req.body.challenge);

    if (messageType === 'notification') {
        const event = req.body.event;
        const rewardTitle = event.reward.title.toLowerCase().trim();
        const userName = event.user_name;
        const userInput = event.user_input || "";

        userLastActive[userName] = Date.now();
        visibleUsers.add(userName);

        console.log(`🎁 Check Reward: [${rewardTitle}] by ${userName}`);

        // --- 🎮 ZONE COMMANDS ---
        if (rewardTitle.includes("reindeer: run left")) io.emit('command', { type: 'RUN_LEFT' });
        else if (rewardTitle.includes("reindeer: run right")) io.emit('command', { type: 'RUN_RIGHT' });
        else if (rewardTitle.includes("reindeer: jump all")) io.emit('command', { type: 'JUMP_ALL' });
        else if (rewardTitle.includes("reindeer: zero gravity")) io.emit('command', { type: 'ZERO_GRAVITY' });
        else if (rewardTitle.includes("reindeer: find my deer")) {
            // ... (Logic Find My Deer ที่เราแก้กันล่าสุด) ...
            const currentState = loadGameState();
            const targetDeer = currentState[userName];
            if (targetDeer) {
                io.emit('game_event', { type: 'SPAWN', ...targetDeer, isRestore: true });
                setTimeout(() => {
                    io.emit('command', { type: 'FIND_MY_DEER', targetOwner: userName });
                }, 200);
            }
        }

        // --- 🦌 ZONE SPAWN / WISH ---
        else if (rewardTitle.includes("spawn reindeer")) {
            const result = gachaSystem.roll(userName);
            unlockRarity(userName, result.rarity);
            const currentWish = userInput || "";
            const bubbleType = currentWish ? analyzeWish(currentWish) : "none";

            // ✅ 3. หา Emote ID จาก Dictionary ที่เราเตรียมไว้
            const foundEmotes = {};
            if (currentWish) {
                const words = currentWish.split(/\s+/);
                words.forEach(word => {
                    if (emoteDictionary[word]) {
                        foundEmotes[word] = emoteDictionary[word];
                    }
                });
            }

            const payload = {
                type: 'SPAWN',
                id: Date.now(),
                owner: userName,
                wish: currentWish,
                rarity: result.rarity,
                image: result.image,
                bubbleType: bubbleType,
                behavior: result.behavior,
                emotes: Object.keys(foundEmotes).length > 0 ? foundEmotes : null, // ส่ง map ไปให้ client
                pity4: result.pity4,
                pity5: result.pity5,
                isNewYear: process.env.EVENT_MODE === 'new_year'
            };

            io.emit('game_event', payload);
            updateGameState(payload);
            logReindeer(payload);
        }
        else if (rewardTitle.includes("reindeer: make a wish")) {
            // ... (Logic Make a Wish พร้อมหา Emote เหมือน Spawn) ...
            const currentState = loadGameState();
            const currentDeer = currentState[userName];
            if (currentDeer) {
                currentDeer.wish = userInput;
                currentDeer.bubbleType = analyzeWish(userInput);

                // หา Emote
                const foundEmotes = {};
                if (userInput) {
                    const words = userInput.split(/\s+/);
                    words.forEach(word => {
                        if (emoteDictionary[word]) foundEmotes[word] = emoteDictionary[word];
                    });
                }
                updateGameState(currentDeer);
                io.emit('game_event', {
                    type: 'UPDATE_WISH',
                    owner: userName,
                    wish: currentDeer.wish,
                    bubbleType: currentDeer.bubbleType,
                    emotes: Object.keys(foundEmotes).length > 0 ? foundEmotes : null
                });
            }
        }
        return res.sendStatus(200);
    }
    res.sendStatus(200);
});

// --- Helpers ---
function verifyTwitchSignature(req) {
    // ... (เหมือนเดิม) ...
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

function loadCollection() {
    fs.ensureFileSync(COLLECTION_PATH);
    try { return fs.readJsonSync(COLLECTION_PATH); } catch (err) { return {}; }
}
function unlockRarity(username, rarity) {
    const collection = loadCollection();
    const user = username.toLowerCase();
    if (!collection[user]) collection[user] = [];
    if (!collection[user].includes(rarity)) {
        collection[user].push(rarity);
        fs.writeJsonSync(COLLECTION_PATH, collection, { spaces: 2 });
    }
}
function logReindeer(data) {
    fs.ensureFileSync(REINDEER_LOG_PATH);
    const logs = fs.readJsonSync(REINDEER_LOG_PATH, { throws: false }) || [];
    logs.push(data);
    fs.writeJsonSync(REINDEER_LOG_PATH, logs);
}

// --- 💬 TMI.js (Chat Bot & Global Emote Harvester) ---
const client = new tmi.Client({ channels: [process.env.CHANNEL_NAME] });
client.connect().catch(console.error);

client.on('message', (channel, tags, message, self) => {
    if (self) return;

    // ✅ TMI Learning: เก็บตก Global Emote ที่ API ช่องหาไม่เจอ
    if (tags.emotes) {
        Object.keys(tags.emotes).forEach(id => {
            const range = tags.emotes[id][0];
            const [start, end] = range.split('-').map(Number);
            const msgChars = Array.from(message);
            const emoteName = msgChars.slice(start, end + 1).join('');

            // จดเพิ่มลงใน Dictionary (ถ้ายังไม่มี)
            if (!emoteDictionary[emoteName]) {
                emoteDictionary[emoteName] = id;
            }
        });
    }

    // ... (Logic !reindeer change เดิม) ...
    if (message.toLowerCase().startsWith('!reindeer change')) {
        // ... (โค้ดเปลี่ยนร่างเดิม) ...
    }
});
// ... (ฟังก์ชัน changeReindeerSkin เดิม) ...

httpServer.listen(PORT, () => {
    console.log(`🎄 Xmas Server running on port ${PORT}`);
    console.log(`📡 Emote Cache System Initialized`);
});