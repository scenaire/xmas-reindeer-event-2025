import { dataManager } from './DataManager.js';

/**
 * RewardHandler - ผู้จัดการระบบรางวัลและคำสั่งพิเศษ
 * ทำหน้าที่เปลี่ยน Event จาก Twitch ให้กลายเป็นการกระทำในเกมค่ะ
 */
export class RewardHandler {
    constructor(io, gachaManager) {
        this.io = io;
        this.gacha = gachaManager;

        // การจับคู่ชื่อรางวัลกับฟังก์ชัน (Command Mapping)
        // ถ้าคุณ Nair เพิ่มรางวัลใน Twitch ก็แค่มาเพิ่มชื่อตรงนี้ค่ะ
        this.commands = {
            'spawn reindeer': (data) => this.handleSpawn(data),
            'reindeer: make a wish': (data) => this.handleWish(data),
            'reindeer: change skin': (data) => this.handleChangeSkin(data),
            'reindeer: run left': () => this.io.emit('command', { type: 'RUN_LEFT' }),
            'reindeer: jump all': () => this.io.emit('command', { type: 'JUMP_ALL' })
        };
    }

    /**
     * ฟังก์ชันหลักสำหรับรับ Event จาก Webhook
     */
    async handle(rewardTitle, eventData) {
        const title = rewardTitle.toLowerCase();

        // ค้นหา Command ที่ตรงกับชื่อรางวัล (ใช้ partial match เพื่อความยืดหยุ่นค่ะ)
        const commandKey = Object.keys(this.commands).find(key => title.includes(key));

        if (this.commands[commandKey]) {
            console.log(`🎁 [Reward] Executing: ${commandKey} for ${eventData.user_name}`);
            return this.commands[commandKey](eventData);
        }
    }

    // --- 🦌 Handler สำหรับการเกิดของกวาง (Spawn) ---
    handleSpawn(data) {
        const userName = data.user_name;
        const userInput = data.user_input || "";

        // 1. สุ่มกาชา
        const gachaResult = this.gacha.roll(userName);

        // 2. ปลดล็อกของสะสม (Collection)
        dataManager.unlockRarity(userName, gachaResult.rarity);

        const payload = {
            owner: userName,
            wish: userInput,
            rarity: gachaResult.rarity,
            image: gachaResult.image,
            behavior: gachaResult.behavior,
            bubbleType: this.analyzeWishType(userInput),
            timestamp: Date.now()
        };

        // 3. บันทึกสถานะลงฐานข้อมูล และ Log
        dataManager.updateGameState(userName, payload);
        dataManager.logReindeerEvent(payload);

        // 4. ส่งคำสั่งไปที่หน้าจอ (Frontend)
        this.io.emit('game_event', { type: 'SPAWN', data: payload });
    }

    // --- ✨ Handler สำหรับการขอพร (Wish) ---
    handleWish(data) {
        const userName = data.user_name;
        const gameState = dataManager.getGameState();

        if (gameState[userName]) {
            gameState[userName].wish = data.user_input;
            gameState[userName].bubbleType = this.analyzeWishType(data.user_input);

            dataManager.updateGameState(userName, gameState[userName]);
            this.io.emit('game_event', {
                type: 'UPDATE_WISH',
                owner: userName,
                wish: data.user_input,
                bubbleType: gameState[userName].bubbleType
            });
        }
    }

    // --- 🎨 Handler สำหรับการเปลี่ยนชุด (Change Skin) ---
    handleChangeSkin(data) {
        const userName = data.user_name;
        const requestedRarity = data.user_input; // สมมติว่าพิมพ์ชื่อ Rarity มา
        const collection = dataManager.getCollection()[userName.toLowerCase()] || [];

        if (collection.includes(requestedRarity)) {
            const gameState = dataManager.getGameState();
            if (gameState[userName]) {
                gameState[userName].rarity = requestedRarity;
                // Mapping รูปภาพตาม Rarity (สามารถแยกไปไว้ใน Constants ได้ค่ะ)
                const skinMap = { 'Common': 'texture_0.png', 'Rare': 'texture_2.png', 'Mythic': 'texture_4.png' };
                gameState[userName].image = skinMap[requestedRarity] || 'texture_0.png';

                dataManager.updateGameState(userName, gameState[userName]);
                this.io.emit('game_event', { type: 'UPDATE_SKIN', owner: userName, data: gameState[userName] });
            }
        }
    }

    // --- 🧠 Helper: วิเคราะห์ข้อความเพื่อเลือกสี Bubble ---
    analyzeWishType(text) {
        if (!text) return 'normal';
        const loveKeywords = ['รัก', 'love', 'heart', '<3', 'แฟน'];
        const luckyKeywords = ['รวย', 'เงิน', 'ทอง', 'luck', 'gacha'];

        if (loveKeywords.some(k => text.toLowerCase().includes(k))) return 'love';
        if (luckyKeywords.some(k => text.toLowerCase().includes(k))) return 'lucky';
        return 'normal';
    }
}