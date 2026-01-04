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
            channelName: process.env.TWITCH_CHANNEL_NAME,
            signingSecret: process.env.TWITCH_SIGNING_SECRET
        };

        this.emoteMap = new Map(); // เก็บ Cache Emote สำหรับ Redeem
        this.loadAllEmotes(); // โหลด Emote รอไว้ให้ RewardHandler ใช้
    }

    // --- 📥 โหลด Emote ทุกอย่าง (Twitch + 7TV) ---
    async loadAllEmotes() {
        console.log("⏳ [Emotes] Fetching all emotes...");
        try {
            const broadcasterId = await this.getBroadcasterId();
            if (!broadcasterId) return;

            // โหลด Global & Channel Emotes
            await this.fetchTwitchEmotes(`https://api.twitch.tv/helix/chat/emotes/global`);
            await this.fetchTwitchEmotes(`https://api.twitch.tv/helix/chat/emotes?broadcaster_id=${broadcasterId}`);

            // โหลด 7TV
            await this.fetch7TVEmotes(broadcasterId);

            console.log(`✅ [Emotes] Ready! Cached ${this.emoteMap.size} emotes.`);
        } catch (error) {
            console.error("❌ [Emotes] Failed:", error.message);
        }
    }

    // Helper: ดึง Twitch Emotes และบันทึกลง Map
    // src/backend/TwitchService.js

    async fetchTwitchEmotes(url) {
        const { clientId, userToken } = this.credentials;
        const res = await fetch(url, {
            headers: { 'Client-Id': clientId, 'Authorization': `Bearer ${userToken}` }
        });
        const data = await res.json();

        if (data.data) {
            data.data.forEach(e => {
                // 🔴 ของเดิม (ลบทิ้ง): this.emoteMap.set(e.name, e.images.url_4x ...

                // 🟢 ของใหม่ (บังคับขยับ):
                // ใช้ ID สร้างลิงก์เอง -> /default/ คือขอแบบขยับได้
                const animatedUrl = `https://static-cdn.jtvnw.net/emoticons/v2/${e.id}/default/dark/3.0`;

                this.emoteMap.set(e.name, animatedUrl);
            });
        }
    }

    // Helper: ดึง 7TV Emotes
    async fetch7TVEmotes(userId) {
        try {
            const res = await fetch(`https://7tv.io/v3/users/twitch/${userId}`);
            if (!res.ok) return;
            const data = await res.json();
            const emoteSet = data.emote_set?.emotes || [];

            emoteSet.forEach(emote => {
                const host = emote.data.host;
                // ใช้ไฟล์ WebP ขนาด 2x
                this.emoteMap.set(emote.name, `https:${host.url}/2x.webp`);
            });
        } catch (e) {
            console.warn("⚠️ [7TV] Could not fetch emotes:", e.message);
        }
    }

    // --- 🎨 ฟังก์ชันแปลงข้อความธรรมดา ให้มีรูป Emote (Smart Parser) ---
    parseMessage(text) {
        if (!text) return "";

        // แยกคำด้วยช่องว่าง (แต่เก็บช่องว่างไว้)
        return text.split(/(\s+)/).map(word => {
            const cleanWord = word.trim();
            if (this.emoteMap.has(cleanWord)) {
                const url = this.emoteMap.get(cleanWord);
                // สร้าง HTML <img> Tag
                return `<img src="${url}" class="emote" style="height:1.2em; vertical-align:middle;">`;
            }
            return word;
        }).join('');
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

    parseCachedEmotes(text) {
        if (!text) return "";
        return text.split(/(\s+)/).map(word => {
            const cleanWord = word.trim();
            if (this.emoteMap.has(cleanWord)) {
                return `<img src="${this.emoteMap.get(cleanWord)}" class="emote">`;
            }
            return word;
        }).join('');
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

    // Helper ที่ต้องมีแน่ๆ คือ getBroadcasterId (ใช้ซ้ำบ่อย)
    async getBroadcasterId() {
        const { clientId, userToken, channelName } = this.credentials;
        if (!clientId || !userToken) return null;
        try {
            const res = await fetch(`https://api.twitch.tv/helix/users?login=${channelName}`, {
                headers: { 'Client-Id': clientId, 'Authorization': `Bearer ${userToken}` }
            });
            const data = await res.json();
            return data.data?.[0]?.id;
        } catch (e) { return null; }
    }

}