import { dataManager } from '../src/backend/DataManager.js';

describe('DataManager Integrity Test', () => {
    const testUser = 'nair_test';

    test('Should correctly unlock rarity in collection', () => {
        dataManager.unlockRarity(testUser, 'Mythic');
        const collection = dataManager.getCollection();

        expect(collection[testUser]).toContain('Mythic');
    });

    test('Should update and retrieve game state correctly', () => {
        const payload = { owner: testUser, rarity: 'Mythic', wish: 'ขอให้โปรเจกต์ผ่านฉลุย!' };
        dataManager.updateGameState(testUser, payload);

        const state = dataManager.getGameState();
        expect(state[testUser].rarity).toBe('Mythic');
        expect(state[testUser].wish).toBe(payload.wish);
    });
});