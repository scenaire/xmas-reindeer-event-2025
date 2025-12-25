import axios from 'axios';
import 'dotenv/config';

async function createSub() {
    // 1. ดึงข้อมูลและทำความสะอาด (Trim) เพื่อป้องกันช่องว่าง
    const appToken = process.env.TWITCH_APP_ACCESS_TOKEN?.trim();
    const clientId = process.env.TWITCH_CLIENT_ID?.trim();
    const userId = process.env.TWITCH_USER_ID?.trim();
    const callbackUrl = process.env.CALLBACK_URL?.trim();
    const secret = process.env.TWITCH_SIGNING_SECRET?.trim();

    // 2. ตรวจสอบเบื้องต้นว่าค่าสำคัญมาครบไหม
    console.log('--- 🔍 ตรวจสอบค่าก่อนส่ง ---');
    console.log('Client ID:', clientId ? '✅ พบแล้ว' : '❌ ไม่พบ');
    console.log('User ID:', userId ? '✅ พบแล้ว' : '❌ ไม่พบ');
    console.log('App Token:', appToken ? '✅ พบแล้ว' : '❌ ไม่พบ');
    console.log('Callback URL:', callbackUrl);
    console.log('---------------------------');

    if (!appToken || !clientId || !userId || !callbackUrl || !secret) {
        console.error("❌ ข้อมูลใน .env ไม่ครบถ้วนค่ะ! กรุณาตรวจสอบว่าใส่ครบทุกช่องนะคะ");
        return;
    }

    const config = {
        headers: {
            'Client-ID': clientId,
            'Authorization': `Bearer ${appToken}`, // ใช้ App Token ในการลงทะเบียน
            'Content-Type': 'application/json'
        }
    };

    const body = {
        type: 'channel.channel_points_custom_reward_redemption.add',
        version: '1',
        condition: { broadcaster_user_id: userId },
        transport: {
            method: 'webhook',
            callback: callbackUrl,
            secret: secret
        }
    };

    try {
        const res = await axios.post('https://api.twitch.tv/helix/eventsub/subscriptions', body, config);
        console.log('🚀 สำเร็จแล้วค่ะ! Nair พร้อมรับกวางแล้ว!');
        console.log('Subscription ID:', res.data.data[0].id);
    } catch (err) {
        // จัดการกรณี 409 (ซ้ำ) และ Error อื่นๆ
        if (err.response?.status === 409) {
            console.log('ℹ️ URL นี้เชื่อมต่อไว้แล้วค่ะ พร้อมทำงานต่อได้เลย!');
        } else {
            console.error('❌ เกิดข้อผิดพลาดจาก Twitch:');
            console.error(JSON.stringify(err.response?.data || err.message, null, 2));
        }
    }
}

createSub();