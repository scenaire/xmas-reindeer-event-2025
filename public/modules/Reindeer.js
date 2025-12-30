import { CONFIG, STATES } from './Constants.js';
import { ChatBubble } from './ChatBubble.js';

export class Reindeer extends PIXI.AnimatedSprite {
    constructor(data, assetManager) {
        // ... (ส่วนโหลดเฟรมเดิม) ...
        let initialFrames = assetManager.getAnimation(data.rarity, 'idle');
        if (!initialFrames || initialFrames.length === 0) {
            initialFrames = [PIXI.Texture.WHITE];
        }
        super(initialFrames);

        this.data = data;
        this.assetManager = assetManager;
        this.autoUpdate = false;
        this.animationSpeed = CONFIG.ANIMATION.SPEED || 0.1;
        this.loop = true;

        // ตั้งค่าตำแหน่งและสถานะ
        const startAtLeft = Math.random() < 0.5;
        this.x = startAtLeft ? -100 : CONFIG.SCREEN_WIDTH + 100;
        this.y = CONFIG.GROUND_Y + (Math.random() * 30);
        this.state = 'moving';
        this.targetX = 50 + Math.random() * (CONFIG.SCREEN_WIDTH - 100);
        this.idleTimer = null;

        this.baseY = this.y;
        this.vy_jump = 0;
        this.isJumping = false;
        this.zeroGravAlpha = 0;
        this.floatTimer = Math.random() * 10;
        this.driftVx = (Math.random() - 0.5) * 2;

        //NameTag
        this.nameTagVisibleTime = 0;

        this.setupProperties();

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

        // ✅ 2. แก้ไขการเช็คสถานะให้ตรงกับ Constants (STATES.ZERO_GRAVITY)
        if (this.state === STATES.ZERO_GRAVITY) {
            this.handleZeroGravity(delta);
        } else {
            // Logic การเดินเดิม
            this.handleWalkingAndRunning(delta);
        }

        const inverseScaleX = Math.sign(this.scale.x);
        // ✅ ลบการกลับด้านป้ายชื่อออก (ชื่อจะตรงตลอดเวลา)
        if (this.bubble) this.bubble.scale.x = inverseScaleX;

        // ระบบ Fade Out (เช็คชื่อตัวแปรให้ตรงกับ Constants)
        if (this.nameTag && this.nameTag.visible) {
            if (this.nameTagVisibleTime > 0) {
                this.nameTagVisibleTime -= delta * 16.66;
            } else {
                this.nameTag.alpha -= CONFIG.NAME_TAG.FADE_SPEED * delta;
                if (this.nameTag.alpha <= 0) {
                    this.nameTag.alpha = 0;
                    this.nameTag.visible = false;
                }
            }
        }

        // Logic กระโดด
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

    runAway(direction) {
        if (this.idleTimer) clearTimeout(this.idleTimer);
        this.state = direction === 'left' ? 'running_left' : 'running_right';
    }

    handleWalkingAndRunning(delta) {
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
        this.rotation = 0; // คืนค่าตัวตรงเมื่อไม่อยู่ในอวกาศ
    }

    handleZeroGravity(delta) {
        // ✅ 1. ค่อยๆ เพิ่มแรงลอยตัว (0 -> 1) เพื่อให้กวางค่อยๆ ลอยขึ้นจากพื้น
        if (this.zeroGravAlpha < 1) {
            this.zeroGravAlpha += 0.01 * delta; // ปรับตัวเลขนี้ให้ลอยขึ้นช้าหรือเร็วตามใจชอบค่ะ
        }

        this.floatTimer += CONFIG.ZERO_GRAVITY_SPEED * delta;

        // ✅ 2. คำนวณความสูง (Lift height) 
        // ให้ลอยขึ้นจากพื้น baseY ประมาณ 100-150px แบบนุ่มนวลตามค่า Alpha
        const liftTarget = 120 * this.zeroGravAlpha;
        const bobbing = Math.sin(this.floatTimer) * CONFIG.ZERO_GRAVITY_AMPLITUDE;
        this.y = this.baseY - liftTarget + bobbing;

        // ✅ 3. ลอยไปลอยมาในจอ (Drifting)
        // เคลื่อนที่ตามแรงเฉื่อย driftVx
        this.x += this.driftVx * delta;

        // กันชนขอบจอ: ถ้าลอยไปชนขอบ ให้เด้งกลับนุ่มๆ
        if (this.x < 100) {
            this.driftVx = Math.abs(this.driftVx);
        } else if (this.x > CONFIG.SCREEN_WIDTH - 100) {
            this.driftVx = -Math.abs(this.driftVx);
        }

        // ✅ 4. หมุนเอียงตัว (Space rotation)
        // จะเอียงมากขึ้นเมื่อลอยสูงขึ้น
        this.rotation = Math.sin(this.floatTimer * 0.7) * (0.2 * this.zeroGravAlpha);

        this.updateAnimation('idle'); // ใช้ท่า Idle ตอนลอย
        this.vx = 0; // หยุดเดินปกติ
    }

    // ฟังก์ชันเปิดโหมดอวกาศ
    enableZeroGravity(duration = CONFIG.ZERO_GRAVITY_DURATION) {
        this.zeroGravAlpha = 0; // รีเซ็ตค่าการเริ่มลอยใหม่ทุกครั้ง
        this.state = STATES.ZERO_GRAVITY;

        // สุ่มทิศทางการลอยใหม่ให้ดูไม่ซ้ำกัน
        this.driftVx = (Math.random() - 0.5) * 1.5;

        if (this.zeroGravTimeout) clearTimeout(this.zeroGravTimeout);
        this.zeroGravTimeout = setTimeout(() => {
            if (!this.destroyed && this.state === STATES.ZERO_GRAVITY) {
                this.returnToGround();
            }
        }, duration);
    }

    returnToGround() {
        this.state = 'moving';
        this.y = this.baseY;
        this.rotation = 0;
        this.zeroGravAlpha = 0;
    }

    destroy(options) {
        if (this.idleTimer) clearTimeout(this.idleTimer);
        super.destroy(options);
    }

    // ... (ส่วน createUI และ addWish เหมือนเดิม) ...
    createUI() {
        const nameStyle = new PIXI.TextStyle({
            fontFamily: CONFIG.NAME_TAG.FONT_FAMILY,
            fontSize: CONFIG.NAME_TAG.FONT_SIZE,
            fontWeight: CONFIG.NAME_TAG.FONT_WEIGHT,
            fill: CONFIG.NAME_TAG.FONT_COLOR,
            stroke: CONFIG.NAME_TAG.FONT_STROKE,
            strokeThickness: CONFIG.NAME_TAG.FONT_STROKE_THICKNESS,
            padding: CONFIG.NAME_TAG.PADDING
        });

        this.nameTag = new PIXI.Text(this.data.owner, nameStyle);
        this.nameTag.anchor.set(0.5);
        this.nameTag.visible = false;

        // เพิ่มความคมชัด ( resolution และ Linear)
        this.nameTag.resolution = 2;
        this.nameTag.texture.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR;

        // ✅ 1. สร้าง Bubble คำอธิษฐานก่อน (ย้ายขึ้นมา)
        if (this.data.wish) {
            this.addWish(this.data.wish, this.data.bubbleType);
        }

        // ✅ 2. คืนค่าป้ายชื่อออกไป (ย้ายมาไว้บรรทัดสุดท้าย)
        return this.nameTag;
    }

    showNametag() {
        if (this.nameTag) {
            this.nameTag.visible = true;
            this.nameTag.alpha = 1;
            this.nameTagVisibleTime = CONFIG.NAME_TAG.DISPLAY_DURATION;
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