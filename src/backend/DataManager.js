import fs from 'fs-extra';
import path from 'path';

/**
 * DataManager - ผู้ดูแลการอ่านและบันทึกข้อมูลทั้งหมดของคุณ Nair
 * ใช้หลักการ Singleton ในการจัดการเพื่อให้มั่นใจว่าการเขียนไฟล์จะเป็นระเบียบค่ะ
 */
class DataManager {
    constructor() {
        this.DATA_DIR = './data';
        this.PATHS = {
            GAME_STATE: path.join(this.DATA_DIR, 'gameState.json'),
            COLLECTION: path.join(this.DATA_DIR, 'collection.json'),
            GACHA_HISTORY: path.join(this.DATA_DIR, 'gachaHistory.json'),
            LOGS: path.join(this.DATA_DIR, 'reindeers.json'),
            EMOTE_CACHE: path.join(this.DATA_DIR, 'emoteCache.json')
        };
        this.ensureDataFiles();
    }

    // ตรวจสอบว่าโฟลเดอร์และไฟล์มีอยู่จริง ถ้าไม่มีให้สร้างใหม่แบบว่างๆ ค่ะ
    ensureDataFiles() {
        fs.ensureDirSync(this.DATA_DIR);
        if (!fs.existsSync(this.PATHS.GAME_STATE)) fs.writeJsonSync(this.PATHS.GAME_STATE, {});
        if (!fs.existsSync(this.PATHS.COLLECTION)) fs.writeJsonSync(this.PATHS.COLLECTION, {});
        if (!fs.existsSync(this.PATHS.GACHA_HISTORY)) fs.writeJsonSync(this.PATHS.GACHA_HISTORY, {});
        if (!fs.existsSync(this.PATHS.LOGS)) fs.writeJsonSync(this.PATHS.LOGS, []);
        if (!fs.existsSync(this.PATHS.EMOTE_CACHE)) fs.writeJsonSync(this.PATHS.EMOTE_CACHE, { timestamp: 0, data: {} });
    }

    // --- Helper Methods สำหรับอ่าน/เขียน (เพื่อลดโค้ดซ้ำซ้อน) ---
    readJson(filePath) {
        try {
            // เช็คก่อนว่าไฟล์มีขนาดมากกว่า 0 หรือไม่
            const stats = fs.statSync(filePath);
            if (stats.size === 0) {
                // ถ้าไฟล์ว่างเปล่า ให้คืนค่า default ตามชื่อไฟล์ค่ะ
                return filePath.includes('reindeers.json') ? [] : {};
            }
            return fs.readJsonSync(filePath);
        } catch (err) {
            console.error(`⚠️ [DataManager] Issue with ${filePath}:`, err.message);
            // ถ้าอ่านไม่ได้เลย ให้คืนค่าว่างเพื่อไม่ให้ระบบล่ม (Safe Fallback)
            return filePath.includes('reindeers.json') ? [] : {};
        }
    }

    writeJson(filePath, data) {
        try {
            fs.writeJsonSync(filePath, data, { spaces: 2 });
            return true;
        } catch (err) {
            console.error(`❌ Error writing ${filePath}:`, err);
            return false;
        }
    }

    // --- Game State Logic ---
    getGameState() {
        return this.readJson(this.PATHS.GAME_STATE) || {};
    }

    updateGameState(owner, data) {
        const state = this.getGameState();
        state[owner] = data;
        this.writeJson(this.PATHS.GAME_STATE, state);
    }

    deleteUserWish(owner) {
        const state = this.getGameState();

        const realKey = Object.keys(state).find(key => key.toLowerCase() === owner.toLowerCase());

        if (realKey && state[realKey]) {
            state[realKey].wish = null;
            state[realKey].bubbleType = 'default';
            return this.writeJson(this.PATHS.GAME_STATE, state);
        }

        console.warn(`⚠️ [DataManager] User not found for deletion: ${owner}`);
        return false;
    }

    // --- Collection & Gacha Logic ---
    getCollection() {
        return this.readJson(this.PATHS.COLLECTION) || {};
    }

    unlockRarity(username, rarity) {
        const collection = this.getCollection();
        const userKey = username.toLowerCase();
        if (!collection[userKey]) collection[userKey] = [];

        if (!collection[userKey].includes(rarity)) {
            collection[userKey].push(rarity);
            this.writeJson(this.PATHS.COLLECTION, collection);
            console.log(`🔓 [Collection] ${username} unlocked: ${rarity}`);
        }
    }

    getGachaHistory() {
        return this.readJson(this.PATHS.GACHA_HISTORY) || {};
    }

    saveGachaHistory(history) {
        this.writeJson(this.PATHS.GACHA_HISTORY, history);
    }

    // --- Logging ---
    logReindeerEvent(payload) {
        const logs = this.readJson(this.PATHS.LOGS) || [];
        logs.push(payload);
        this.writeJson(this.PATHS.LOGS, logs);
    }

    // --- ปรับปรุงการตรวจสอบไฟล์เริ่มต้น ---
    ensureDataFiles() {
        fs.ensureDirSync(this.DATA_DIR);

        // ฟังก์ชันช่วยเช็คและสร้างไฟล์ถ้ามันว่างหรือไม่มีอยู่จริง
        const checkAndInit = (path, defaultValue) => {
            if (!fs.existsSync(path) || fs.statSync(path).size === 0) {
                fs.writeJsonSync(path, defaultValue, { spaces: 2 });
            }
        };

        checkAndInit(this.PATHS.GAME_STATE, {});
        checkAndInit(this.PATHS.COLLECTION, {});
        checkAndInit(this.PATHS.GACHA_HISTORY, {});
        checkAndInit(this.PATHS.LOGS, []);
        checkAndInit(this.PATHS.EMOTE_CACHE, { timestamp: 0, data: {} });
    }
}

// ส่งออกเป็น Instance เดียวเพื่อให้ใช้ร่วมกันทั้งโปรเจกต์ (Singleton)
export const dataManager = new DataManager();