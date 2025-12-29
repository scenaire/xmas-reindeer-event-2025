import { dataManager } from './DataManager.js';

/**
 * GachaManager - ผู้ดูแลระบบสุ่มกวางและคำนวณ Pity
 * ออกแบบมาให้รองรับระบบ Soft Pity และ Hard Pity ตามหลัก Game Theory ค่ะ
 */
export class GachaManager {
    constructor() {
        // ตั้งค่าโอกาสดรอปและลิมิตการันตี (Configurable)
        this.CONFIG = {
            FIVE_STAR: {
                BASE_RATE: 0.01,    // 1%
                SOFT_PITY: 36,      // เริ่มเพิ่มเรทที่โรลที่ 36
                HARD_PITY: 50,      // การันตีที่โรลที่ 50
                INCREMENT: 0.06     // เพิ่มโอกาสทีละ 6% ช่วง Soft Pity
            },
            FOUR_STAR: {
                BASE_RATE: 0.10,    // 10%
                HARD_PITY: 10       // การันตีทุก 10 โรล
            }
        };
    }

    /**
     * สุ่มกวางให้ผู้เล่น
     * @param {string} userName 
     */
    roll(userName) {
        const history = dataManager.getGachaHistory();
        const userKey = userName.toLowerCase();

        // 1. ดึงข้อมูลผู้เล่นเดิมหรือสร้างใหม่
        let userData = history[userKey] || { pity4: 0, pity5: 0, totalRolls: 0 };

        userData.pity4++;
        userData.pity5++;
        userData.totalRolls++;

        let result = null;

        // 2. คำนวณหาผลลัพธ์ (Check 5-star -> Check 4-star -> Default 3-star)
        if (this.isFiveStarHit(userData.pity5)) {
            result = this.getFiveStarResult();
            userData.pity5 = 0; // Reset Pity 5 ดาว
        }
        else if (this.isFourStarHit(userData.pity4)) {
            result = this.getFourStarResult();
            userData.pity4 = 0; // Reset Pity 4 ดาว
        }
        else {
            result = this.getThreeStarResult();
        }

        // 3. บันทึกประวัติและส่งผลลัพธ์กลับ
        history[userKey] = userData;
        dataManager.saveGachaHistory(history);

        console.log(`🎰 [Gacha] ${userName} rolled: ${result.rarity} (Pity5: ${userData.pity5}, Pity4: ${userData.pity4})`);

        return {
            ...result,
            behavior: this.getBehavior(result.rarity),
            pity4: userData.pity4,
            pity5: userData.pity5,
            totalRolls: userData.totalRolls
        };
    }

    // --- Logic คำนวณดวง ---

    isFiveStarHit(pity) {
        const { BASE_RATE, SOFT_PITY, HARD_PITY, INCREMENT } = this.CONFIG.FIVE_STAR;

        if (pity >= HARD_PITY) return true;

        let currentRate = BASE_RATE;
        if (pity >= SOFT_PITY) {
            // สูตรคำนวณ Soft Pity: 36=20%, 37=26%...
            currentRate = 0.2 + ((pity - SOFT_PITY) * INCREMENT);
        }

        return Math.random() < currentRate;
    }

    isFourStarHit(pity) {
        const { BASE_RATE, HARD_PITY } = this.CONFIG.FOUR_STAR;
        if (pity >= HARD_PITY) return true;
        return Math.random() < BASE_RATE;
    }

    // --- Logic การเลือกของรางวัล ---

    getFiveStarResult() {
        return { rarity: "Mythic", image: "texture_4.png" };
    }

    getFourStarResult() {
        const isEpic = Math.random() < 0.5;
        return isEpic
            ? { rarity: "Epic", image: "texture_3.png" }
            : { rarity: "Rare", image: "texture_2.png" };
    }

    getThreeStarResult() {
        const isUncommon = Math.random() < 0.5;
        return isUncommon
            ? { rarity: "Uncommon", image: "texture_1.png" }
            : { rarity: "Common", image: "texture_0.png" };
    }

    getBehavior(rarity) {
        const behaviors = {
            'Mythic': 'glowing',
            'Epic': 'brave',
            'Rare': 'shy',
            'default': 'normal'
        };
        return behaviors[rarity] || behaviors.default;
    }
}