import { CONFIG } from './Constants.js';

/**
 * AssetManager - ผู้ดูแลเสบียงและเสื้อผ้าของน้องกวาง
 * ทำหน้าที่โหลดรูปภาพและเตรียมเฟรมอนิเมชั่นล่วงหน้า เพื่อความลื่นไหลระดับ 60 FPS ค่ะ!
 */
export class AssetManager {
    constructor() {
        this.cache = new Map();
    }

    /**
     * เริ่มต้นการโหลดทรัพยากรทั้งหมด
     */
    async init() {
        console.log("🎨 [AssetManager] กำลังเตรียมชุดคริสต์มาสให้น้องกวาง...");

        try {
            // 1. โหลด textures ของกวางแต่ละระดับ (แยก Idle และ Walk)
            const reindeerPromises = Object.entries(CONFIG.ASSETS.TEXTURES).map(async ([rarity, fileName]) => {
                const baseName = fileName.replace('.png', '');

                const [idleSheet, walkSheet] = await Promise.all([
                    PIXI.Assets.load(`${CONFIG.ASSETS.BASE_PATH}${baseName}_idle.png`),
                    PIXI.Assets.load(`${CONFIG.ASSETS.BASE_PATH}${baseName}_walk.png`)
                ]);

                // ตัดแบ่งเฟรม (โค้ดเดิมใช้ 4 เฟรมต่อหนึ่งแถวค่ะ)
                this.cache.set(rarity, {
                    idle: this.splitFrames(idleSheet, 4),
                    walk: this.splitFrames(walkSheet, 4)
                });
            });

            // 2. โหลดรูปภาพประกอบอื่นๆ (Bubble, UI)
            const uiPromises = [
                PIXI.Assets.load(CONFIG.ASSETS.BUBBLE_BOX).then(t => this.cache.set('bubbleBox', t)),
                PIXI.Assets.load(CONFIG.ASSETS.BUBBLE_TAIL).then(t => this.cache.set('bubbleTail', t))
            ];

            await Promise.all([...reindeerPromises, ...uiPromises]);
            console.log("✅ [AssetManager] โหลดของเสร็จหมดแล้ว พร้อมลุยสตรีมแล้วค่ะคุณ Nair!");
        } catch (error) {
            console.error("❌ [AssetManager] เกิดข้อผิดพลาดในการโหลดรูป:", error);
        }
    }

    /**
     * Helper สำหรับตัดแบ่ง Texture เป็นเฟรมๆ สำหรับ AnimatedSprite
     */
    splitFrames(texture, frameCount) {
        const frames = [];
        const frameWidth = texture.width / frameCount;
        const frameHeight = texture.height;

        for (let i = 0; i < frameCount; i++) {
            const frame = new PIXI.Texture(
                texture.baseTexture,
                new PIXI.Rectangle(i * frameWidth, 0, frameWidth, frameHeight)
            );
            frames.push(frame);
        }
        return frames;
    }

    /**
     * ดึงเฟรมอนิเมชั่นตาม Rarity และประเภท
     */
    getAnimation(rarity, type = 'idle') {
        const set = this.cache.get(rarity) || this.cache.get('Common');
        return set[type];
    }

    /**
     * ดึง Texture ของ Bubble
     */
    getBubbleAssets() {
        return {
            box: this.cache.get('bubbleBox'),
            tail: this.cache.get('bubbleTail')
        };
    }
}