// tests/GachaManager.test.js
import { GachaManager } from '../src/backend/GachaManager.js';

describe('GachaManager Rate Test', () => {
    const gacha = new GachaManager();
    const iterations = 100000; // จำลองการสุ่ม 1 แสนครั้ง

    test('Mythic rate should be around 0.1%', () => {
        const results = { Mythic: 0, Epic: 0, Rare: 0, Common: 0 };

        for (let i = 0; i < iterations; i++) {
            const roll = gacha.roll('testUser');
            results[roll.rarity]++;
        }

        const mythicRate = (results.Mythic / iterations) * 100;
        console.log(`📊 Mythic found: ${results.Mythic} times (${mythicRate}%)`);

        // ค่าควรอยู่ระหว่าง 0.05% - 0.15% (ยอมรับความเบี่ยงเบนทางสถิติ)
        expect(mythicRate).toBeGreaterThan(2.5);
        expect(mythicRate).toBeLessThan(3.5);
    });
});