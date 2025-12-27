import fs from 'fs-extra';

const GACHA_HISTORY_PATH = './data/gachaHistory.json';

export class GachaManager {
    constructor() {
        this.ensureHistoryFile();
    }

    ensureHistoryFile() {
        if (!fs.existsSync(GACHA_HISTORY_PATH)) {
            fs.outputJsonSync(GACHA_HISTORY_PATH, {});
        }
    }

    getHistory() {
        try {
            return fs.readJsonSync(GACHA_HISTORY_PATH);
        } catch (error) {
            return {};
        }
    }

    saveHistory(history) {
        fs.writeJsonSync(GACHA_HISTORY_PATH, history, { spaces: 2 });
    }

    roll(userName) {
        const history = this.getHistory();
        const userKey = userName.toLowerCase();

        // 1. โหลดข้อมูล Pity ของ user (ถ้าไม่มีให้เริ่มใหม่)
        let userData = history[userKey] || { pity4: 0, pity5: 0, totalRolls: 0 };

        userData.pity4++;
        userData.pity5++;
        userData.totalRolls++;

        let resultRarity = "";
        let resultImage = "";

        // --- 🌟 STEP 1: เช็คระดับ 5 ดาว (Mythic) ---
        // Base Rate: 1%
        // Soft Pity Start: 36 (เพิ่มโอกาสขึ้นเรื่อยๆ)
        // Hard Pity: 50 (การันตี 100%)

        let rate5 = 0.01; // 1%
        if (userData.pity5 >= 50) rate5 = 1.0; // Hard Pity
        else if (userData.pity5 >= 36) {
            // Soft Pity Curve: เพิ่มทีละ 6% ตั้งแต่โรลที่ 36
            // 36=20%, 37=26%, ... 49=98%
            rate5 = 0.2 + ((userData.pity5 - 36) * 0.06);
        }

        if (Math.random() < rate5) {
            // 🎉 JACKPOT! ได้ 5 ดาว
            resultRarity = "Mythic";
            resultImage = "texture_4.png";

            userData.pity5 = 0; // รีเซ็ตตัวนับ 5 ดาว
            // (ป.ล. ในเกมส่วนใหญ่ ถ้าได้ 5 ดาว ตัวนับ 4 ดาวจะไม่รีเซ็ตนะ)
        }

        // --- 🟣 STEP 2: ถ้าไม่ได้ 5 ดาว.. เช็คระดับ 4 ดาว (Rare/Epic) ---
        // Base Rate: 10%
        // Hard Pity: 10 (การันตี 100%)
        else {
            let rate4 = 0.10; // 10%
            if (userData.pity4 >= 10) rate4 = 1.0; // Hard Pity

            if (Math.random() < rate4) {
                // 🎉 ได้ 4 ดาว (สุ่มระหว่าง Epic กับ Rare 50/50)
                const isEpic = Math.random() < 0.5;
                if (isEpic) {
                    resultRarity = "Epic";
                    resultImage = "texture_3.png";
                } else {
                    resultRarity = "Rare";
                    resultImage = "texture_2.png";
                }

                userData.pity4 = 0; // รีเซ็ตตัวนับ 4 ดาว
            }

            // --- 🟦 STEP 3: ถ้าไม่ได้อะไรเลย.. เอา 3 ดาวไป (Common/Uncommon) ---
            else {
                const isUncommon = Math.random() < 0.5;
                if (isUncommon) {
                    resultRarity = "Uncommon";
                    resultImage = "texture_1.png";
                } else {
                    resultRarity = "Common";
                    resultImage = "texture_0.png";
                }
                // (ไม่ต้องรีเซ็ต Pity อะไรทั้งนั้น ฟาร์มต่อไป!)
            }
        }

        // บันทึกสถานะล่าสุดกลับลงไฟล์
        history[userKey] = userData;
        this.saveHistory(history);

        console.log(`🎰 ${userName} Rolled: [${resultRarity}] (Pity5: ${userData.pity5}, Pity4: ${userData.pity4})`);

        return {
            rarity: resultRarity,
            image: resultImage,
            behavior: this.getBehavior(resultRarity),
            pity4: userData.pity4, // ส่งกลับไปโชว์หน้าจอได้
            pity5: userData.pity5, // ส่งกลับไปโชว์หน้าจอได้
            totalRolls: userData.totalRolls
        };
    }

    getBehavior(rarity) {
        // กำหนดนิสัยตามระดับ (Optional)
        if (rarity === "Mythic") return "glowing";
        if (rarity === "Epic") return "brave";
        if (rarity === "Rare") return "shy";
        return "normal";
    }
}