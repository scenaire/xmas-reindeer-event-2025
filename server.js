import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import tmi from 'tmi.js';


// นำเข้า Modules ที่เราสร้างไว้ค่ะ
import { dataManager } from './src/backend/DataManager.js';
import { GachaManager } from './src/backend/GachaManager.js';
import { TwitchService } from './src/backend/TwitchService.js';
import { RewardHandler } from './src/backend/RewardHandler.js';
import { PresenceManager } from './src/backend/PresenceManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const PORT = process.env.PORT || 3000;

// --- ⚙️ Middleware Setup ---

// สำคัญมาก: เก็บ Raw Body ไว้สำหรับตรวจสอบ Twitch Signature ค่ะ
app.use(bodyParser.json({
    verify: (req, res, buf) => { req.rawBody = buf; }
}));
app.use(express.static('public'));

// --- 🚀 Initialize Services ---

// 1. สร้าง TwitchService ก่อน (ต้องอยู่บรรทัดบนสุดในกลุ่มนี้)
const twitch = new TwitchService(io);
const gacha = new GachaManager();


// 2. สร้าง RewardHandler โดยส่ง twitch เข้าไปเป็นตัวที่ 3
// ✅ ต้องมีครบ 3 ตัว: (io, gacha, twitch)
const presence = new PresenceManager(io, twitch);
const rewardHandler = new RewardHandler(io, gacha, twitch, presence);

presence.start(); // เริ่ม Loop เช็คคนออนไลน์

// --- 💬 TMI.js Setup (Chat Listener) ---
const chatClient = new tmi.Client({
    connection: {
        secure: true,
        reconnect: true
    },
    // ✅ แก้ให้ตรงกับ .env (TWITCH_CHANNEL_NAME)
    channels: [process.env.TWITCH_CHANNEL_NAME]
});

chatClient.connect().catch(console.error);

chatClient.on('message', (channel, tags, message, self) => {

    const msg = message.toLowerCase();

    // เช็คว่าขึ้นต้นด้วย !reindeer change หรือไม่
    if (msg.startsWith('!reindeer change')) {
        console.log(`💬 [Chat Command] ${tags['display-name']} used: ${message}`);

        // ส่งเข้า RewardHandler ไปจัดการต่อเลย (Logic ตัดคำอยู่ในนั้นแล้ว)
        rewardHandler.handleChange({
            user_name: tags['display-name'], // ชื่อคนพิมพ์
            user_input: message,             // ข้อความเต็มๆ
            message: message
        });
    }
});

// --- 🌐 API Routes ---

// รับข้อมูลจาก Twitch EventSub
app.post('/eventsub/callback', async (req, res) => {
    // --- 🔍 เพิ่ม Log ตรงนี้เพื่อเช็คว่า Twitch เคาะประตูบ้านเราไหม ---
    const messageType = req.headers['twitch-eventsub-message-type'];
    console.log(`📥 [Webhook] Incoming Request: ${messageType}`);

    if (!twitch.verifySignature(req)) {
        console.error("❌ [Webhook] Signature Verification Failed! เช็ค TWITCH_SIGNING_SECRET ใน .env นะคะ");
        return res.status(403).send('Invalid signature');
    }

    if (messageType === 'webhook_callback_verification') {
        console.log("✅ [Webhook] URL Verified by Twitch!");
        return res.status(200).send(req.body.challenge);
    }

    if (messageType === 'notification') {
        const { event, subscription } = req.body;
        console.log(`🎁 [Webhook] Reward Received: ${event.reward.title}`); // เช็คว่าชื่อรางวัลที่ส่งมาคืออะไร

        if (subscription.type === 'channel.channel_points_custom_reward_redemption.add') {
            await rewardHandler.handle(event.reward.title, event);
        }
        return res.status(204).send();
    }

    res.status(200).send();
});

// Endpoint สำหรับดึงสถานะเริ่มต้น (Initial Load)
app.get('/api/game-state', (req, res) => {
    res.json(dataManager.getGameState());
});

// Endpoint สำหรับดึงคนดูที่ออนไลน์ (Helper สำหรับ UI)
app.get('/api/online-viewers', async (req, res) => {
    const viewers = await twitch.getOnlineViewers();
    res.json({ viewers: viewers ? Array.from(viewers) : [] });
});

// --- 🔌 Socket.io Connection ---

io.on('connection', (socket) => {
    console.log(`🔌 [Socket] New client connected: ${socket.id}`);

    presence.handleInitialSync(socket);

    socket.on('disconnect', () => {
        console.log(`🔌 [Socket] Client disconnected`);
    });
});

io.on('connection', (socket) => {
    // ใช้ PresenceManager จัดการส่งกวางเฉพาะคนที่ออนไลน์ให้ Client ใหม่ค่ะ
    presence.handleInitialSync(socket);
});

// --- 🏁 Start Server ---

httpServer.listen(PORT, () => {
    console.log(`
    ✨========================================✨
    🎄 Xmas Reindeer Event 2025 is Online! 🎄
    🚀 Server running at: http://localhost:${PORT}
    📡 Webhook URL: /eventsub
    ✨========================================✨
    `);
});