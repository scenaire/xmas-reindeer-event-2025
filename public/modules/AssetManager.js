import { CONFIG } from './Constants.js';

export class AssetManager {
    constructor() {
        this.cache = new Map();
    }

    async init() {
        console.log("🎨 [AssetManager] Start loading...");
        await this.loadUI(); // โหลด Bubble

        // 1. โหลดตัวหลัก (Common / texture_0) ให้ได้ก่อน
        // ถ้าตัวนี้โหลดไม่ได้ คือจบเห่ เราต้องรู้ทันที
        try {
            const commonIdle = await PIXI.Assets.load(CONFIG.ASSETS.BASE_PATH + 'texture_0_idle.png');
            const commonWalk = await PIXI.Assets.load(CONFIG.ASSETS.BASE_PATH + 'texture_0_walk.png');

            const commonSet = {
                idle: this.splitFrames(commonIdle, 6),
                walk: this.splitFrames(commonWalk, 6)
            };
            this.cache.set('Common', commonSet);
            console.log("✅ Base Texture Loaded!");

            // 2. พยายามโหลดตัวอื่นๆ (1-4)
            const rarities = ['Uncommon', 'Rare', 'Epic', 'Mythic'];
            for (let i = 0; i < rarities.length; i++) {
                const index = i + 1; // texture_1, texture_2...
                try {
                    // ใช้ Promise.all เพื่อโหลดคู่
                    const [idle, walk] = await Promise.all([
                        PIXI.Assets.load(`${CONFIG.ASSETS.BASE_PATH}texture_${index}_idle.png`),
                        PIXI.Assets.load(`${CONFIG.ASSETS.BASE_PATH}texture_${index}_walk.png`)
                    ]);

                    this.cache.set(rarities[i], {
                        idle: this.splitFrames(idle, 6),
                        walk: this.splitFrames(walk, 6)
                    });
                } catch (err) {
                    console.warn(`⚠️ Load failed for ${rarities[i]}, using Common.`);
                    // ถ้าโหลดไม่เจอ ให้ใช้ Common แทนทันที
                    this.cache.set(rarities[i], commonSet);
                }
            }

        } catch (criticalError) {
            console.error("❌ CRITICAL: Cannot load texture_0 (Base texture)!", criticalError);
        }
    }

    splitFrames(texture, frameCount) {
        if (!texture) return [PIXI.Texture.WHITE]; // กันตาย

        const frames = [];
        const frameWidth = texture.width / frameCount;
        const frameHeight = texture.height;

        for (let i = 0; i < frameCount; i++) {
            const rect = new PIXI.Rectangle(i * frameWidth, 0, frameWidth, frameHeight);
            frames.push(new PIXI.Texture(texture.baseTexture, rect));
        }
        return frames;
    }

    getAnimation(rarity, type) {
        // พยายามหาตาม Rarity ก่อน ถ้าไม่มีเอา Common
        const set = this.cache.get(rarity) || this.cache.get('Common');

        // ถ้ายังไม่มีอีก (กรณี Base โหลดไม่ติด) ส่งภาพเปล่ากัน Error
        if (!set || !set[type]) return [PIXI.Texture.WHITE];

        return set[type];
    }

    // ... loadUI / getBubbleAssets เหมือนเดิม
    async loadUI() {
        const [box, tail] = await Promise.all([
            PIXI.Assets.load(CONFIG.ASSETS.BUBBLE_BOX),
            PIXI.Assets.load(CONFIG.ASSETS.BUBBLE_TAIL)
        ]);
        this.cache.set('bubbleBox', box);
        this.cache.set('bubbleTail', tail);
    }
    getBubbleAssets() {
        return { box: this.cache.get('bubbleBox'), tail: this.cache.get('bubbleTail') };
    }
}