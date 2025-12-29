import tmi from 'tmi.js';
import crypto from 'crypto';
import 'dotenv/config';

/**
 * TwitchService - ผู้ช่วยส่วนตัวจัดการการเชื่อมต่อกับ Twitch ทั้งหมดของคุณ Nair
 * ทำหน้าที่คุยกับ API, ตรวจสอบความปลอดภัย และฟังสั่งการจากแชทค่ะ
 */
export class TwitchService {
    constructor(io) {
        this.io = io;
        this.credentials = {
            clientId: process.env.TWITCH_CLIENT_ID,
            userToken: process.env.TWITCH_USER_ACCESS_TOKEN,
            channelName: process.env.CHANNEL_NAME,
            signingSecret: process.env.TWITCH_SIGNING_SECRET
        };

        this.chatClient = null;
        this.initChatBot();
    }

    // --- 🛡️ Webhook Security: ตรวจสอบความถูกต้องของข้อมูลจาก Twitch ---
    verifySignature(req) {
        const messageId = req.headers['twitch-eventsub-message-id'];
        const timestamp = req.headers['twitch-eventsub-message-timestamp'];
        const signature = req.headers['twitch-eventsub-message-signature'];
        const secret = this.credentials.signingSecret;

        if (!secret || !signature || !messageId || !timestamp) return false;

        const hmacMessage = messageId + timestamp + req.rawBody;
        const hmac = 'sha256=' + crypto.createHmac('sha256', secret).update(hmacMessage).digest('hex');

        return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(signature));
    }

    // --- 📊 Helix API: ดึงรายชื่อคนดูที่ออนไลน์อยู่ ---
    async getOnlineViewers() {
        const { clientId, userToken, channelName } = this.credentials;
        if (!clientId || !userToken || !channelName) {
            console.warn("⚠️ [Twitch] Missing Credentials in .env");
            return null;
        }

        try {
            // 1. หา Broadcaster ID จากชื่อช่อง
            const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${channelName}`, {
                headers: { 'Client-Id': clientId, 'Authorization': `Bearer ${userToken}` }
            });
            const userData = await userRes.json();
            if (!userData.data?.length) return null;
            const broadcasterId = userData.data[0].id;

            // 2. ดึงรายชื่อ Chatters
            const chattersRes = await fetch(`https://api.twitch.tv/helix/chat/chatters?broadcaster_id=${broadcasterId}&moderator_id=${broadcasterId}&first=1000`, {
                headers: { 'Client-Id': clientId, 'Authorization': `Bearer ${userToken}` }
            });

            if (!chattersRes.ok) throw new Error(await chattersRes.text());

            const chattersData = await chattersRes.json();
            return new Set(chattersData.data.map(user => user.user_login.toLowerCase()));

        } catch (error) {
            console.error("❌ [Twitch API] Error:", error.message);
            return null;
        }
    }

    // --- 💬 TMI.js: ระบบ Chat Bot สำหรับคำสั่งลับของคุณ Nair ---
    initChatBot() {
        this.chatClient = new tmi.Client({
            channels: [this.credentials.channelName]
        });

        this.chatClient.connect().catch(console.error);

        this.chatClient.on('message', (channel, tags, message, self) => {
            if (self) return;

            // ส่งต่อเหตุการณ์แชทไปยัง Command Handler (ที่เราจะเขียนในไฟล์ถัดไปค่ะ)
            this.io.emit('chat_message', {
                username: tags.username,
                message: message
            });
        });
    }

    async getOnlineViewers() {
        const { clientId, userToken, channelName } = this.credentials;
        if (!clientId || !userToken || !channelName) return null;

        try {
            // 1. ดึง Broadcaster ID (ควรทำ Cache ไว้จะดีมากค่ะ)
            const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${channelName}`, {
                headers: { 'Client-Id': clientId, 'Authorization': `Bearer ${userToken}` }
            });
            const userData = await userRes.json();
            if (!userData.data?.length) return null;
            const broadcasterId = userData.data[0].id;

            // 2. ดึง Chatters (คนที่อยู่ในแชท)
            const chattersRes = await fetch(`https://api.twitch.tv/helix/chat/chatters?broadcaster_id=${broadcasterId}&moderator_id=${broadcasterId}&first=1000`, {
                headers: { 'Client-Id': clientId, 'Authorization': `Bearer ${userToken}` }
            });

            if (!chattersRes.ok) return null;

            const chattersData = await chattersRes.json();
            // คืนค่าเป็น Set ของชื่อตัวเล็ก (toLowerCase) เพื่อให้เช็ค $O(1)$ ได้ไวที่สุดค่ะ
            return new Set(chattersData.data.map(user => user.user_login.toLowerCase()));
        } catch (error) {
            console.error("❌ [Twitch API] Sync Error:", error.message);
            return null;
        }
    }
}