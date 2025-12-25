import fs from 'fs-extra';
const PITY_DB_PATH = './data/soft_pity.json';

export class GachaManager {
    constructor() {
        this.baseRates = {
            Common: 65,
            Uncommon: 20,
            Rare: 10,
            Epic: 4,
            Mythic: 1
        };

        fs.ensureFileSync(PITY_DB_PATH);
        try {
            this.pityData = fs.readJsonSync(PITY_DB_PATH);
        } catch (error) {
            this.pityData = {};
        }
    }

    roll(username) {
        let count = this.pityData[username] || 0;
        count++;

        let resultRarity = "Common";
        let isReset = false;

        // 1. Hard Pity Check (50 รอบ)
        if (count >= 50) {
            resultRarity = "Mythic";
            isReset = true;
        } else {
            // 2. Soft Pity Logic
            let currentRates = { ...this.baseRates };
            if (count > 5) {
                const bonus = (count - 5) * 2;
                currentRates.Common = Math.max(0, currentRates.Common - bonus);
                currentRates.Rare += bonus * 0.6;
                currentRates.Epic += bonus * 0.3;
                currentRates.Mythic += bonus * 0.1;
            }

            const rng = Math.random() * 100;
            let cumulative = 0;
            for (const [rarity, rate] of Object.entries(currentRates)) {
                cumulative += rate;
                if (rng < cumulative) {
                    resultRarity = rarity;
                    break;
                }
            }

            if (["Rare", "Epic", "Mythic"].includes(resultRarity)) isReset = true;
        }

        // 3. Save Pity
        this.pityData[username] = isReset ? 0 : count;
        this.savePityData();

        // 4. Return ผลลัพธ์พร้อมนิสัยกวาง (Behavior)
        return {
            rarity: resultRarity,
            pityCount: isReset ? 0 : count,
            image: this.getImageName(resultRarity),
            behavior: this.getBehavior(resultRarity) // เพิ่มตรงนี้ค่ะ
        };
    }

    getBehavior(rarity) {
        const behaviors = {
            "Common": "normal",
            "Uncommon": "shy",
            "Rare": "normal",
            "Epic": "energetic",
            "Mythic": "energetic"
        };
        return behaviors[rarity];
    }

    getImageName(rarity) {
        const map = {
            "Common": "texture_0.png",
            "Uncommon": "texture_1.png",
            "Rare": "texture_2.png",
            "Epic": "texture_3.png",
            "Mythic": "texture_4.png"
        };
        return map[rarity];
    }

    savePityData() {
        fs.writeJsonSync(PITY_DB_PATH, this.pityData, { spaces: 2 });
    }
}