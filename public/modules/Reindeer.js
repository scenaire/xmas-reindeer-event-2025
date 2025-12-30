import { CONFIG, STATES } from './Constants.js';
import { ChatBubble } from './ChatBubble.js';

export class Reindeer extends PIXI.AnimatedSprite {
    constructor(data, assetManager) {
        // 1. ดึงเฟรมมาเช็คก่อน ถ้าไม่มี ให้ใช้ภาพขาวเปล่าๆ แก้ขัด (กัน Error ตอนเริ่ม)
        let initialFrames = assetManager.getAnimation(data.rarity, 'idle');
        if (!initialFrames || initialFrames.length === 0) {
            console.warn(`⚠️ Texture missing for ${data.rarity}, using fallback.`);
            initialFrames = [PIXI.Texture.WHITE];
        }

        super(initialFrames);

        this.data = data;
        this.assetManager = assetManager;
        this.autoUpdate = false; // ปิด autoUpdate เพื่อคุมเอง
        this.animationSpeed = CONFIG.ANIMATION.SPEED || 0.1;
        this.loop = true;

        // ... (ส่วนตั้งค่าตำแหน่งเดิมของคุณ Nair) ...
        const startAtLeft = Math.random() < 0.5;
        this.x = startAtLeft ? -100 : CONFIG.SCREEN_WIDTH + 100;
        this.y = CONFIG.GROUND_Y + (Math.random() * 30);
        this.state = 'moving';
        this.targetX = 50 + Math.random() * (CONFIG.SCREEN_WIDTH - 100);
        this.idleTimer = null;

        // ...jumping
        this.baseY = this.y;
        this.vy_jump = 0;
        this.isJumping = false;

        //zero gravity
        this.floatTimer = Math.random() * 10; //สุ่มจุดเริ่มต้นการลอย

        this.setupProperties();

        // เช็คว่ามีเฟรมจริงไหมค่อยสั่งเล่น
        if (initialFrames.length > 1) this.play();
    }

    setupProperties() {
        this.anchor.set(0.5, 1);
        const scale = CONFIG.SCALES[this.data.rarity] || 2.0;
        this.scale.set(scale);

        const speedBonus = (this.data.rarity === 'Mythic' || this.data.rarity === 'Epic') ? 0.5 : 0;
        this.walkSpeed = (1.5 + Math.random() + speedBonus);

        this.y = CONFIG.GROUND_Y + (Math.random() * 30);
        this.baseY = this.y;
    }

    update(delta) {
        if (this.destroyed) return;

        // ... (Logic การเดินเดิมของคุณ Nair) ...
        if (this.state === 'zero_gravity') {
            this.handleZeroGravity(delta);
        } else {
            if (this.state === 'moving') {
                const dx = this.targetX - this.x;
                if (Math.abs(dx) < 5) {
                    this.x = this.targetX;
                    this.startIdle();
                } else {
                    this.vx = Math.sign(dx) * this.walkSpeed;
                    this.x += this.vx * delta;
                    this.updateAnimation('walk');
                }
            }
            else if (this.state.startsWith('running')) {
                this.vx = (this.state === 'running_left') ? -5 : 5;
                this.x += this.vx * delta;
                this.updateAnimation('walk');

                if (this.x < -300 || this.x > CONFIG.SCREEN_WIDTH + 300) {
                    this.state = 'moving';
                    this.targetX = 50 + Math.random() * (CONFIG.SCREEN_WIDTH - 100);
                }
            }
            this.rotation = 0;
        }

        if (this.isJumping) {
            this.vy_jump += CONFIG.GRAVITY * delta;
            this.y += this.vy_jump * delta;

            if (this.y >= this.baseY) {
                this.y = this.baseY;
                this.isJumping = false;
                this.vy_jump = 0;
                this.updateAnimation('walk');
            }
        }

        if (this.vx !== 0 && this.state !== 'idle') {
            this.scale.x = Math.sign(this.vx) * Math.abs(this.scale.x);
        }

        // ✅ จุดแก้สำคัญ: เช็คก่อนว่ามี Texture ให้เล่นไหม
        // ถ้า Texture หาย หรือ array ว่างเปล่า ห้ามเรียก super.update เด็ดขาด!
        if (this.playing && this.textures && this.textures.length > 0 && this.textures[this.currentFrame]) {
            super.update(delta);
        }
    }

    updateAnimation(type) {
        const newFrames = this.assetManager.getAnimation(this.data.rarity, type);

        // กันเหนียว: ถ้าได้มาเป็น null หรือ array ว่าง ไม่ต้องทำอะไร (ใช้ของเดิมไปก่อน)
        if (!newFrames || newFrames.length === 0) return;

        if (this.textures !== newFrames) {
            this.textures = newFrames;
            this.play();
        }
    }

    // ... (ส่วนอื่นๆ เหมือนเดิม) ...
    startIdle() {
        this.state = 'idle';
        this.vx = 0;
        this.updateAnimation('idle');

        if (this.idleTimer) clearTimeout(this.idleTimer);
        this.idleTimer = setTimeout(() => {
            if (this.destroyed) return;
            this.pickNewTarget();
            this.state = 'moving';
        }, 3000 + Math.random() * 4000);
    }

    pickNewTarget() { this.targetX = 50 + Math.random() * (CONFIG.SCREEN_WIDTH - 100); }

    jump() {
        if (this.isJumping) return;

        this.isJumping = true;
        this.vy_jump = CONFIG.JUMP_FORCE;
    }

    showNameTag() {
        if (this.nameTag) {
            this.nameTag.visible = true;

            if (this.nameTagTimer) clearTimeout(this.nameTagTimer);
            this.nameTagTimer = setTimeout(() => {
                if (this.nameTag && !this.destroyed) {
                    this.nameTag.visible = false;
                }
            }, CONFIG.NAME_DISPLAY_DURATION);
        }
    }

    runAway(direction) {
        if (this.idleTimer) clearTimeout(this.idleTimer);
        this.state = direction === 'left' ? 'running_left' : 'running_right';
    }

    handleZeroGravity(delta) {
        this.vx = 0; // ไม่เดินไปไหน
        this.floatTimer += CONFIG.ZERO_GRAVITY_SPEED * delta;

        // 1. ลอยขึ้น-ลงนุ่มๆ (Sine Wave)
        this.y = this.baseY - 50 + (Math.sin(this.floatTimer) * CONFIG.ZERO_GRAVITY_AMPLITUDE);

        // 2. ขยับซ้าย-ขวานิดหน่อยให้ดูไร้ทิศทาง
        this.x += Math.cos(this.floatTimer * 0.5) * 0.5;

        // 3. หมุนตัวเอียงไปมา (Space feeling)
        this.rotation = Math.sin(this.floatTimer * 0.7) * 0.15;

        this.updateAnimation('idle'); // ใช้ท่า Idle ตอนลอย
    }

    // ฟังก์ชันเปิดโหมดอวกาศ
    enableZeroGravity(duration = 30000) {
        const previousState = this.state;
        this.state = STATES.ZERO_GRAVITY;

        // ถ้าอยากให้มีเวลาจำกัด (เช่น 30 วินาทีแล้วกลับมาเดินปกติ)
        setTimeout(() => {
            if (!this.destroyed && this.state === STATES.ZERO_GRAVITY) {
                this.state = 'moving';
                this.y = this.baseY; // กลับลงพื้น
                this.rotation = 0;
            }
        }, duration);
    }

    destroy(options) {
        if (this.idleTimer) clearTimeout(this.idleTimer);
        super.destroy(options);
    }

    // ... (ส่วน createUI และ addWish เหมือนเดิม) ...
    createUI() {
        // 1. สร้างป้ายชื่อเจ้าของ
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
        this.nameTag.y = 10;
        this.addChild(this.nameTag);

        // --- ✅ เพิ่ม Logic ซ่อนชื่อหลังจาก 5 วินาที ---
        // ใช้ค่าจาก Constants ที่เราตั้งไว้ค่ะ
        setTimeout(() => {
            if (this.nameTag && !this.destroyed) {
                // จะใช้วิธีซ่อน (visible = false) หรือ ค่อยๆ จางหาย (Alpha) ก็ได้ค่ะ
                // ในที่นี้ขอใช้วิธีซ่อนเพื่อให้เรียบง่ายตามหลัก Occam's Razor นะคะ
                this.nameTag.visible = false;
                console.log(`🏷️ Name tag for ${this.data.owner} is now hidden.`);
            }
        }, CONFIG.NAME_DISPLAY_DURATION);

        // 2. สร้าง Bubble ถ้ามีคำขอพร (ส่วนนี้ยังอยู่เหมือนเดิมค่ะ)
        if (this.data.wish) {
            this.addWish(this.data.wish, this.data.bubbleType);
        }
    }

    addWish(text, type) {
        if (this.bubble) this.removeChild(this.bubble);
        const assets = this.assetManager.getBubbleAssets();
        this.bubble = new ChatBubble(text, type, assets);
        this.addChild(this.bubble);
        this.bubble.destroyWithDelay(CONFIG.WISH_DURATION || 15000);
    }
}