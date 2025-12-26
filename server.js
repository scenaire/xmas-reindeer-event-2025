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
// ✅ ดึงค่าจาก .env ตามชื่อใหม่ที่คุณตั้ง
const TWITCH_SECRET = process.env.TWITCH_SIGNING_SECRET; // อย่าลืมบรรทัดนี้ใน .env นะคะ (สำหรับ Webhook)
const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const USER_ACCESS_TOKEN = process.env.TWITCH_USER_ACCESS_TOKEN; // ใช้ User Token
const CHANNEL_NAME = process.env.CHANNEL_NAME;
const ONLINE_CHECK_INTERVAL = 20000; // เช็คชื่อทุก 20 วินาที

// --- File Paths ---
const REINDEER_LOG_PATH = './data/reindeers.json';
const GAME_STATE_PATH = './data/gameState.json';
const COLLECTION_PATH = './data/collection.json';

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
            unlockRarity(userName, result.rarity);
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
        else if (rewardTitle.includes("reindeer: make a wish")) {
            const currentState = loadGameState();
            const currentDeer = currentState[userName];

            if (currentDeer) {
                console.log(`✨ ${userName} made a new wish: "${userInput}"`);

                //1. update wish
                currentDeer.wish = userInput;
                currentDeer.bubbleType = analyzeWish(userInput);

                //2. save state
                updateGameState(currentDeer);

                //3. emit event
                io.emit('game_event', { type: 'UPDATE_WISH', owner: userName, wish: currentDeer.wish, bubbleType: currentDeer.bubbleType });
            } else {
                console.log(`❌ ${userName} tried to wish, but has no reindeer.`);
            }
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

// 1. โหลดสมุดสะสม
function loadCollection() {
    fs.ensureFileSync(COLLECTION_PATH);
    try { return fs.readJsonSync(COLLECTION_PATH); } catch (err) { return {}; }
}

// 2. บันทึกระดับใหม่ลงสมุด (ใช้ตอนสุ่มกาชา)
function unlockRarity(username, rarity) {
    const collection = loadCollection();
    const user = username.toLowerCase();

    if (!collection[user]) {
        collection[user] = [];
    }

    // ถ้ายังไม่เคยมีระดับนี้ ให้เพิ่มเข้าไป
    if (!collection[user].includes(rarity)) {
        collection[user].push(rarity);
        fs.writeJsonSync(COLLECTION_PATH, collection, { spaces: 2 });
        console.log(`🔓 ${username} unlocked new rarity: ${rarity}`);
    }
}

function logReindeer(data) {
    fs.ensureFileSync(REINDEER_LOG_PATH);
    const logs = fs.readJsonSync(REINDEER_LOG_PATH, { throws: false }) || [];
    logs.push(data);
    fs.writeJsonSync(REINDEER_LOG_PATH, logs);
}

// --- 💬 TMI.js (Chat Bot System) ---

// ตั้งค่า Bot เพื่อฟังแชท
const client = new tmi.Client({
    channels: [process.env.CHANNEL_NAME] // ฟังห้องเราเอง
});

client.connect().catch(console.error);

client.on('message', (channel, tags, message, self) => {
    if (self) return; // ไม่คุยกับตัวเอง

    // เช็คคำสั่ง !reindeer change [rarity]
    if (message.toLowerCase().startsWith('!reindeer change')) {
        const args = message.split(' ');
        if (args.length < 3) return; // พิมพ์มาไม่ครบ

        const targetRarity = args[2].toLowerCase(); // ระดับที่อยากเปลี่ยน (common, rare, mythic)
        const userName = tags.username; // ชื่อคนพิมพ์
        const userNameKey = userName.toLowerCase();

        // 1. เช็คว่ามีของไหม? (ใน Collection)
        const collection = loadCollection();
        const userUnlocks = collection[userNameKey] || [];

        // แปลง unlock ของ user เป็นตัวเล็กให้หมดเพื่อเช็ค
        const hasUnlocked = userUnlocks.some(r => r.toLowerCase() === targetRarity);

        if (hasUnlocked) {
            console.log(`🔄 ${userName} switching to ${targetRarity}...`);
            changeReindeerSkin(userName, targetRarity);
        } else {
            console.log(`❌ ${userName} try to switch to ${targetRarity} but doesn't own it.`);
            // (Optional) อาจจะให้ Bot พิมพ์ตอบกลับไปว่า "ยังไม่มีนะจ๊ะ" ก็ได้
        }
    }
});

// 🎮 ฟังก์ชันเปลี่ยนร่าง (Animation: Leave -> Enter)
function changeReindeerSkin(ownerName, targetRarity) {
    const currentState = loadGameState();
    const currentDeer = currentState[ownerName];

    // ถ้าไม่มีกวางอยู่บนจอ เปลี่ยนไม่ได้นะ
    if (!currentDeer) return;

    // 1. สั่งตัวเก่าวิ่งออกไป (Dismiss)
    io.emit('game_event', { type: 'DISMISS', owner: ownerName });

    // 2. สร้างข้อมูลตัวใหม่ (เอาข้อมูลเดิมมาแก้แค่ Image/Rarity)
    // (เราต้องถาม GachaSystem ว่า Rarity นี้ใช้รูปอะไร)
    // ** หมายเหตุ: ต้องเพิ่มฟังก์ชัน getImageForRarity ใน GachaManager หรือเขียน Logic ง่ายๆ ตรงนี้ **

    // สมมติ Logic การเลือกรูปง่ายๆ ตาม Rarity (หรือคุณจะดึงจาก Config ก็ได้)
    let newImage = 'texture_0.png'; // Default Common
    if (targetRarity === 'uncommon') newImage = 'texture_1.png';
    else if (targetRarity === 'rare') newImage = 'texture_2.png';
    else if (targetRarity === 'epic') newImage = 'texture_3.png';
    else if (targetRarity === 'mythic') newImage = 'texture_4.png';
    else if (targetRarity === 'legendary') newImage = 'texture_5.png';

    const newPayload = {
        ...currentDeer, // ก๊อปข้อมูลเดิม (คำอธิษฐาน, ชื่อ)
        id: Date.now(),
        rarity: targetRarity.charAt(0).toUpperCase() + targetRarity.slice(1), // ทำให้ตัวแรกใหญ่สวยๆ
        image: newImage,
        isRestore: false // ให้เดินเข้าใหม่เหมือนสุ่มมา
    };

    // 3. รอแป๊บนึง แล้วสั่งตัวใหม่เดินเข้ามา (Spawn)
    setTimeout(() => {
        io.emit('game_event', { type: 'SPAWN', ...newPayload });
        updateGameState(newPayload); // บันทึก State ใหม่
        logReindeer(newPayload); // (Optional) จะบันทึก Log การเปลี่ยนร่างไหม แล้วแต่ชอบ
    }, 4000); // รอ 4 วินาที (ให้ตัวเก่าวิ่งพ้นจอก่อน)
}

httpServer.listen(PORT, () => {
    console.log(`🎄 Xmas Server running on port ${PORT}`);
    console.log(`📡 Online Check enabled using Helix API`);
});

