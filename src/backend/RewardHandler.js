import { dataManager } from './DataManager.js';
import { TwitchService } from './TwitchService.js';
import { analyzeWish } from '../../public/modules/WishAnalyzer.js';


const RARITY_SCORE = {
    'Common': 0,
    'Uncommon': 1,
    'Rare': 2,
    'Epic': 3,
    'Mythic': 4
};

/**
 * RewardHandler - ผู้จัดการระบบรางวัลและคำสั่งพิเศษ
 * ทำหน้าที่เปลี่ยน Event จาก Twitch ให้กลายเป็นการกระทำในเกมค่ะ
 */
export class RewardHandler {
    constructor(io, gachaManager, TwitchService) {
        this.io = io;
        this.gacha = gachaManager;
        this.twitch = TwitchService;

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

        // 1. สุ่มกาชา (ได้ผลลัพธ์ใหม่มา)
        const gachaResult = this.gacha.roll(userName);

        // 2. ดึงข้อมูล "คอลเลกชันกวางทั้งหมด" ของคนนี้ (History)
        // ต้องเช็คก่อน Unlock ของใหม่นะคะ จะได้รู้ว่าของเก่าสูงสุดเท่าไหร่
        const userCollection = dataManager.getCollection()[userName.toLowerCase()] || [];

        // หา "คะแนนสูงสุด" ที่เคยทำได้ (Max Score from History)
        let maxPreviousScore = 0;
        userCollection.forEach(rarity => {
            const score = RARITY_SCORE[rarity] || 0;
            if (score > maxPreviousScore) {
                maxPreviousScore = score;
            }
        });

        // 3. คำนวณคะแนนของตัวใหม่ที่เพิ่งได้
        const newScore = RARITY_SCORE[gachaResult.rarity] || 0;

        // ดึงตัวที่ยืนอยู่ปัจจุบัน (เอาไว้เช็คเพื่อเล่น Animation)
        const gameState = dataManager.getGameState();
        const currentDeer = gameState[userName];

        console.log(`🎲 ${userName} Rolled: ${gachaResult.rarity} (${newScore}) vs Best Ever: ${maxPreviousScore}`);

        // ✅ 4. ปลดล็อกของใหม่ลง Database (Unlock)
        // ต้องทำตรงนี้เพื่อให้แน่ใจว่าบันทึกของใหม่แล้ว ไม่ว่าผลลัพธ์จะเป็นยังไง
        dataManager.unlockRarity(userName, gachaResult.rarity);

        // 5. เงื่อนไข: ถ้าคะแนนใหม่ "น้อยกว่าหรือเท่ากับ" สถิติสูงสุดเดิม (New <= Max History)
        // และต้องมีกวางยืนอยู่บนจอด้วยนะ (currentDeer) ถึงจะสั่งกระโดดได้
        if (currentDeer && newScore <= maxPreviousScore) {
            console.log(`🧂 Salt! ${userName} didn't beat their record.`);

            // ส่งคำสั่ง DUPLICATE -> ให้ตัวเดิมกระโดด (ไม่เปลี่ยนตัวแสดงผล)
            this.io.emit('game_event', {
                type: 'DUPLICATE',
                owner: userName,
                wish: currentDeer.wish,
                bubbleType: currentDeer.bubbleType,
            });
            return;
        }

        // 6. เงื่อนไข: ทำลายสถิติใหม่! (New > Max History) หรือ เพิ่งเคยเล่นครั้งแรก
        console.log(`✨ New Record! ${userName} upgraded their best deer.`);

        const payload = {
            owner: userName,
            wish: userInput,
            rarity: gachaResult.rarity,
            image: gachaResult.image,
            behavior: gachaResult.behavior,
            bubbleType: analyzeWish(userInput), //
            timestamp: Date.now()
        };

        // อัปเดตให้ตัวนี้เป็นตัวแสดงผลปัจจุบัน (Active)
        dataManager.updateGameState(userName, payload);
        dataManager.logReindeerEvent(payload);

        // ส่งคำสั่ง SPAWN
        // isUpgrade: true คือบอก Frontend ว่า "ช่วยเล่นท่าวิ่งเปลี่ยนตัวหน่อย"
        this.io.emit('game_event', {
            type: 'SPAWN',
            data: payload,
            isUpgrade: !!currentDeer
        });
    }

    handleFindDeer(eventData) {
        // ดึงชื่อคนแลกรางวัล (Twitch ส่งมาใน user_name)
        const ownerName = eventData.user_name;

        //ไปค้นข้อมูลล่าสุดของกวางตัวนี้มาจาก Database (Memory)
        const gameState = dataManager.getGameState();
        const deerData = gameState[ownerName];

        console.log(`🔍 [Reward] Finding deer for: ${ownerName}`);

        // ส่งคำสั่งไปที่หน้าจอให้กวางแสดงตัว
        this.io.emit('game_event', {
            type: 'FIND_DEER',
            owner: ownerName,
            wish: deerData ? deerData.wish : null,           // ข้อความ HTML
            bubbleType: deerData ? deerData.bubbleType : 'default' // สี Bubble
        });
    }

    // --- ✨ Handler สำหรับการขอพร (Wish) ---
    handleWish(data) {
        const userName = data.user_name;
        const rawWish = data.user_input || ""; // ข้อความดิบที่พิมพ์มา

        // ✅ 1. ตรวจสอบกวาง (เหมือนเดิม)
        const gameState = dataManager.getGameState();
        const reindeerData = gameState[userName];

        if (!reindeerData) {
            console.log(`⚠️ [Wish] ${userName} พยายามอธิษฐานแต่ไม่มีกวางในจอค่ะ`);
            return;
        }

        // ✅ 2. แปลงข้อความให้มีรูป Emote (ใช้ TwitchService ที่เราทำไว้)
        // ต้องมั่นใจว่าใน constructor รับ this.twitch มาแล้วนะคะ
        const htmlWish = this.twitch.parseCachedEmotes(rawWish);

        // ✅ 3. วิเคราะห์ประเภท Bubble (ใช้ข้อความดิบวิเคราะห์)
        const bubbleType = analyzeWish(rawWish);

        console.log(`💬 [Wish] ${userName} (${bubbleType}): ${rawWish}`);

        // ✅ 4. อัปเดตข้อมูล (บันทึกทั้ง html และ raw เผื่อใช้)
        reindeerData.wish = htmlWish;
        reindeerData.bubbleType = bubbleType;

        dataManager.updateGameState(userName, reindeerData);

        // ✅ 5. ส่ง Event ไปที่หน้าจอ
        // ใช้ type: 'wish' เพื่อให้ตรงกับที่ script.js ฝั่งหน้าบ้านรอรับ (ถ้าหน้าบ้านแก้แล้ว)
        this.io.emit('game_event', {
            type: 'wish',
            owner: userName,
            wish: htmlWish,       // ส่งข้อความที่เป็น HTML (มีรูป) ไปแสดง
            rawWish: rawWish,     // ส่งข้อความดิบไปด้วยเผื่อใช้
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

}