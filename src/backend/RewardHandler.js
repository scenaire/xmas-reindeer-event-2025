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
            // ใช้คำสำคัญที่อยู่ในชื่อรางวัลของคุณ Nair ค่ะ
            'spawn reindeer': (data) => this.handleSpawn(data),
            'make a wish': (data) => this.handleWish(data),
            'run left': () => this.io.emit('command', { type: 'RUN_LEFT' }),
            'run right': () => this.io.emit('command', { type: 'RUN_RIGHT' }), // เพิ่มอันนี้ที่คุณ Nair มี
            'jump all': () => this.io.emit('command', { type: 'JUMP_ALL' }),
            'zero gravity': () => this.io.emit('command', { type: 'ZERO_GRAVITY' }), // เพิ่มอันนี้ที่คุณ Nair มี
            'find my deer': (data) => this.handleFindDeer(data) // เพิ่มฟังก์ชันรองรับรางวัลใหม่
        };
    }

    /**
     * ฟังก์ชันหลักสำหรับรับ Event จาก Webhook
     */
    // เปลี่ยนจาก find เป็นการวนลูปเช็คคำสำคัญค่ะ
    async handle(rewardTitle, eventData) {
        const title = rewardTitle.toLowerCase();

        // ค้นหาคีย์ที่ "อยู่ใน" ชื่อรางวัล
        const commandKey = Object.keys(this.commands).find(key => title.includes(key));

        if (commandKey) {
            console.log(`🎁 [Reward] Matched: ${commandKey}`);
            return this.commands[commandKey](eventData);
        } else {
            console.log(`⚠️ [Reward] No match for: ${rewardTitle}`);
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

    handleFindDeer(eventData) {
        // ดึงชื่อคนแลกรางวัล (Twitch ส่งมาใน user_name)
        const ownerName = eventData.user_name;

        console.log(`🔍 [Reward] Finding deer for: ${ownerName}`);

        // ส่งคำสั่งไปที่หน้าจอให้กวางแสดงตัว
        this.io.emit('game_event', {
            type: 'FIND_DEER',
            owner: ownerName
        });
    }

    // --- ✨ Handler สำหรับการขอพร (Wish) ---
    handleWish(data) {
        const userName = data.user_name;
        const wishText = data.user_input;

        // ✅ 1. แก้ไขการเรียก DataManager (ลบ this. ออก และใช้ getGameState)
        const gameState = dataManager.getGameState();
        const reindeerData = gameState[userName]; // ดึงข้อมูลกวางจาก State กลาง

        if (!reindeerData) {
            console.log(`⚠️ [Wish] ${userName} พยายามอธิษฐานแต่ไม่มีกวางในจอค่ะ`);
            return; // จบการทำงาน ไม่ส่ง Event ไปที่หน้าจอ
        }

        // ✅ 2. วิเคราะห์และอัปเดตข้อมูล
        const bubbleType = this.analyzeWishType(wishText);

        reindeerData.wish = wishText;
        reindeerData.bubbleType = bubbleType;

        // ✅ 3. บันทึก (ลบ this. ออก และใช้ updateGameState)
        dataManager.updateGameState(userName, reindeerData);

        // ส่งข้อมูลไปที่หน้าจอ
        this.io.emit('game_event', {
            type: 'UPDATE_WISH',
            owner: userName,
            wish: wishText,
            bubbleType: bubbleType
        });
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