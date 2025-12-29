import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

// นำเข้า Modules ที่เราสร้างไว้ค่ะ
import { dataManager } from './src/backend/DataManager.js';
import { GachaManager } from './src/backend/gachaManager.js';
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

const gacha = new GachaManager();
const rewardHandler = new RewardHandler(io, gacha);
const twitch = new TwitchService(io);
const presence = new PresenceManager(io, twitch);
presence.start(); // เริ่ม Loop เช็คคนออนไลน์

// --- 🌐 API Routes ---

// รับข้อมูลจาก Twitch EventSub
app.post('/eventsub', async (req, res) => {
    // 1. ตรวจสอบว่าข้อมูลส่งมาจาก Twitch จริงหรือไม่ (Security First!)
    if (!twitch.verifySignature(req)) {
        return res.status(403).send('Invalid signature');
    }

    const messageType = req.headers['twitch-eventsub-message-type'];

    // 2. ตอบกลับการยืนยัน Webhook (Challenge)
    if (messageType === 'webhook_callback_verification') {
        return res.status(200).send(req.body.challenge);
    }

    // 3. จัดการข้อมูล Notification
    if (messageType === 'notification') {
        const { event, subscription } = req.body;

        // ตรวจสอบว่าเป็นรางวัล Channel Points หรือไม่
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

    // ส่งข้อมูลกวางที่มีอยู่เดิมไปให้ Client ที่เพิ่งเปิดหน้าจอ
    socket.emit('init_state', dataManager.getGameState());

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