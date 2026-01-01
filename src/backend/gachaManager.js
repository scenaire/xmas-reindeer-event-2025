import { dataManager } from './DataManager.js';

export class GachaManager {
    constructor() {
        this.CONFIG = {
            FIVE_STAR: {
                BASE_RATE: 0.01,    // 1% (Mythic)
                SOFT_PITY: 36,
                HARD_PITY: 50,
                INCREMENT: 0.07     // เพิ่มทีละ 7% ตั้งแต่โรลที่ 36 เป็นต้นไป
            },
            FOUR_STAR: {
                BASE_RATE: 0.05,    // 5% (Epic/Rare) - ลดลงตามคำขอค่ะ
                HARD_PITY: 12       // การันตีทุก 12 โรล (เพิ่มความยาก)
            }
        };
    }

    roll(userName) {
        const history = dataManager.getGachaHistory();
        const userKey = userName.toLowerCase();
        let userData = history[userKey] || { pity4: 0, pity5: 0, totalRolls: 0 };

        userData.pity4++;
        userData.pity5++;
        userData.totalRolls++;

        let result = null;

        // ✅ 1. เช็ค Mythic (5-Star)
        if (this.isFiveStarHit(userData.pity5)) {
            result = { rarity: "Mythic", image: "texture_4.png" };
            userData.pity5 = 0;
        }
        // ✅ 2. เช็ค Epic/Rare (4-Star)
        else if (this.isFourStarHit(userData.pity4)) {
            // สุ่มแยก: Epic (30%) vs Rare (70%)
            const isEpic = Math.random() < 0.3;
            result = isEpic
                ? { rarity: "Epic", image: "texture_3.png" }
                : { rarity: "Rare", image: "texture_2.png" };
            userData.pity4 = 0;
        }
        // ✅ 3. เกลือ (3-Star)
        else {
            // สุ่มแยก: Uncommon (40%) vs Common (60%)
            const isUncommon = Math.random() < 0.4;
            result = isUncommon
                ? { rarity: "Uncommon", image: "texture_1.png" }
                : { rarity: "Common", image: "texture_0.png" };
        }

        history[userKey] = userData;
        dataManager.saveGachaHistory(history);

        return {
            ...result,
            behavior: this.getBehavior(result.rarity),
            pity4: userData.pity4,
            pity5: userData.pity5,
            totalRolls: userData.totalRolls
        };
    }

    isFiveStarHit(pity) {
        const { BASE_RATE, SOFT_PITY, HARD_PITY, INCREMENT } = this.CONFIG.FIVE_STAR;
        if (pity >= HARD_PITY) return true;

        // ✅ แก้ไข Logic: ค่อยๆ ไต่ระดับจาก Base Rate
        let currentRate = BASE_RATE;
        if (pity >= SOFT_PITY) {
            // โรลที่ 36 จะเป็น 1% + 7% = 8%
            // โรลที่ 37 จะเป็น 1% + 14% = 15%... ไปจนถึง 100% ที่โรลที่ 50
            currentRate = BASE_RATE + ((pity - SOFT_PITY + 1) * INCREMENT);
        }
        return Math.random() < currentRate;
    }

    isFourStarHit(pity) {
        const { BASE_RATE, HARD_PITY } = this.CONFIG.FOUR_STAR;
        if (pity >= HARD_PITY) return true;
        return Math.random() < BASE_RATE;
    }

    getBehavior(rarity) {
        const behaviors = { 'Mythic': 'glowing', 'Epic': 'brave', 'Rare': 'shy', 'default': 'normal' };
        return behaviors[rarity] || behaviors.default;
    }
}