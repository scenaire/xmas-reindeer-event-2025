import { jest, describe, test, expect } from '@jest/globals';

import { RewardHandler } from '../src/backend/RewardHandler.js';
import { GachaManager } from '../src/backend/GachaManager.js';
import { dataManager } from '../src/backend/DataManager.js';

describe('Concurrency Integration Test', () => {
    // จำลอง Mock Objects
    const mockIo = { emit: jest.fn() };
    const mockTwitch = { parseCachedEmotes: (text) => text };
    const gacha = new GachaManager();
    const handler = new RewardHandler(mockIo, gacha, mockTwitch);

    test('Should handle 20 simultaneous spawns without data loss', async () => {
        const users = Array.from({ length: 20 }, (_, i) => `user_${i}`);

        // ✅ จำลองการกดแลกพร้อมกัน 20 คน
        await Promise.all(users.map(user =>
            handler.handleSpawn({ user_name: user, user_input: 'ขอให้โชคดี!' })
        ));

        const gameState = dataManager.getGameState();
        const collection = dataManager.getCollection();

        // ตรวจสอบว่าทุกคนต้องมีกวางในระบบ
        users.forEach(user => {
            expect(gameState).toHaveProperty(user); // ต้องมีสถานะกวางบนจอ
            expect(collection).toHaveProperty(user.toLowerCase()); // ต้องมีประวัติในคอลเลกชัน
        });
    });
});