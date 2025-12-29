import { CONFIG, STATES } from './Constants.js';
import { ChatBubble } from './ChatBubble.js';

/**
 * Reindeer Class - ตัวแทนความสดใสในสตรีมของคุณ Nair
 * น้องกวางแต่ละตัวจะมีนิสัยและความรับผิดชอบเป็นของตัวเองค่ะ
 */
export class Reindeer extends PIXI.AnimatedSprite {
    constructor(data, assetManager) {
        // 1. ตั้งค่า Texture เริ่มต้น (Idle)
        const idleFrames = assetManager.getAnimation(data.rarity, 'idle');
        super(idleFrames);

        this.data = data; // { owner, rarity, wish, behavior, image, bubbleType }
        this.assetManager = assetManager;

        this.state = STATES.ENTERING;
        this.vx = 0;
        this.vy = 0;
        this.targetX = Math.random() * (CONFIG.SCREEN_WIDTH - 200) + 100;

        this.setupProperties();
        this.createUI();

        this.animationSpeed = 0.15;
        this.play();
    }

    setupProperties() {
        this.anchor.set(0.5, 1); // ให้จุดหมุนอยู่กึ่งกลางเท้า
        this.x = -150; // เริ่มจากนอกจอซ้าย
        this.y = CONFIG.GROUND_Y + (Math.random() * 50); // กระจายแถวตอนยืน

        const scale = CONFIG.SCALES[this.data.rarity] || 2.0;
        this.scale.set(scale);

        // ความเร็วตามแรร์ริตี้ หรือนิสัย
        this.baseSpeed = CONFIG.SPEED.MIN + Math.random() * (CONFIG.SPEED.MAX - CONFIG.SPEED.MIN);

        // ถ้าเป็นกวาง Mythic จะมี Effect เรืองแสง (Glowing)
        if (this.data.behavior === 'glowing') {
            this.filters = [new PIXI.filters.ColorMatrixFilter()];
            this.filters[0].brightness(1.5);
        }
    }

    createUI() {
        // 1. ป้ายชื่อเจ้าของ (Owner Name)
        const nameStyle = new PIXI.TextStyle({
            fontFamily: 'Arial',
            fontSize: 14,
            fontWeight: 'bold',
            fill: '#ffffff',
            stroke: '#000000',
            strokeThickness: 3
        });
        this.nameTag = new PIXI.Text(this.data.owner, nameStyle);
        this.nameTag.anchor.set(0.5);
        this.nameTag.y = 20; // อยู่ใต้เท้าน้องกวาง
        this.addChild(this.nameTag);

        // 2. สร้าง Bubble ถ้ามีความปรารถนา (Wish)
        if (this.data.wish) {
            this.addWish(this.data.wish, this.data.bubbleType);
        }
    }

    addWish(text, type) {
        if (this.bubble) this.removeChild(this.bubble);

        const assets = this.assetManager.getBubbleAssets();
        this.bubble = new ChatBubble(text, type, assets);
        this.addChild(this.bubble);

        // ตั้งเวลาหายไปตามที่กำหนดใน Config
        this.bubble.destroyWithDelay(CONFIG.WISH_DURATION);
    }

    /**
     * ระบบอัปเดตตำแหน่งและ Logic ในแต่ละเฟรม (Game Loop)
     */
    update(delta) {
        switch (this.state) {
            case STATES.ENTERING:
                this.handleEntering(delta);
                break;
            case STATES.WALKING:
                this.handleWalking(delta);
                break;
            case STATES.RUNNING:
                this.handleRunning(delta);
                break;
        }

        // จัดการเรื่องการหันซ้าย-ขวาตามความเร็ว
        if (this.vx !== 0) {
            this.scale.x = Math.abs(this.scale.x) * (this.vx > 0 ? 1 : -1);
        }
    }

    handleEntering(delta) {
        this.vx = this.baseSpeed;
        this.x += this.vx * delta;
        this.changeAnimation('walk');

        if (this.x >= this.targetX) {
            this.state = STATES.IDLE;
            this.vx = 0;
            this.changeAnimation('idle');
        }
    }

    handleRunning(delta) {
        this.vx = -this.baseSpeed * CONFIG.SPEED.RUN_MULTIPLIER;
        this.x += this.vx * delta;
        this.changeAnimation('walk');

        // วิ่งออกจากจอแล้วลบตัวเอง
        if (this.x < -200) {
            this.destroy();
        }
    }

    changeAnimation(type) {
        const newFrames = this.assetManager.getAnimation(this.data.rarity, type);
        if (this.textures !== newFrames) {
            this.textures = newFrames;
            this.play();
        }
    }

    jump() {
        if (this.state === STATES.JUMPING) return;

        const originalY = this.y;
        this.vy = CONFIG.JUMP_FORCE;

        const jumpTicker = (delta) => {
            this.vy += CONFIG.GRAVITY * delta;
            this.y += this.vy * delta;

            if (this.y >= originalY) {
                this.y = originalY;
                PIXI.Ticker.shared.remove(jumpTicker);
            }
        };
        PIXI.Ticker.shared.add(jumpTicker);
    }
}