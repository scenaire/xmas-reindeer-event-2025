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
        let startAtLeft;

        if (data.forceSide === 'right') {
            startAtLeft = false; // บังคับเกิดขวา
        } else if (data.forceSide === 'left') {
            startAtLeft = true;  // บังคับเกิดซ้าย
        } else {
            startAtLeft = Math.random() < 0.5; // สุ่มปกติ
        }
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

        //bubble
        this.bubble = null;

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
        if (this.isRGB) { console.log("RGB Updating:", this.rgbHue); }

        // ✅ 2. แก้ไขการเช็คสถานะให้ตรงกับ Constants (STATES.ZERO_GRAVITY)
        if (this.state === STATES.ZERO_GRAVITY) {
            this.handleZeroGravity(delta);
        } else if (this.state === STATES.FALLING) {
            this.handleFalling(delta);
        } else {
            // Logic การเดินเดิม
            this.handleWalkingAndRunning(delta);
        }

        // อัปเดตตำแหน่ง Bubble (เรียกผ่าน Class wrapper)
        if (this.bubble) {
            this.syncBubblePosition();
        }

        const inverseScaleX = Math.sign(this.scale.x);

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
        // ✅ 1. ช่วง Transition: ค่อยๆ ลอยขึ้นจากพื้นก่อน (กันจมดิน)
        if (this.zeroGravAlpha < 1) {
            this.zeroGravAlpha += 0.02 * delta; // เพิ่มความเร็วตอนขึ้นนิดนึง
            this.y -= 2 * delta; // ดึงตัวขึ้นจากพื้นทันที
        }

        // ✅ 2. Free Float: เคลื่อนที่อิสระแบบไร้แรงดึงดูด
        // บวกค่า x และ y ไปเรื่อยๆ ตามความเร็วที่สุ่มไว้
        this.x += this.driftVx * delta;
        this.y += this.driftVy * delta;

        // ✅ 3. หมุนติ้ว (Continuous Rotation)
        // บวกค่ามุมไปเรื่อยๆ ให้หมุนครบรอบได้ (กลับหัวได้แล้ว!)
        this.rotation += this.rotSpeed * delta;

        // ✅ 4. ระบบฟิสิกส์การชนขอบจอ (Bouncing 4 ด้าน)
        const padding = 50; // ระยะขอบจอ

        // ชนซ้าย-ขวา
        if (this.x < padding) {
            this.x = padding; // ดันกลับเข้ามาไม่ให้ทะลุ
            this.driftVx = Math.abs(this.driftVx); // เด้งไปขวา
        } else if (this.x > CONFIG.SCREEN_WIDTH - padding) {
            this.x = CONFIG.SCREEN_WIDTH - padding;
            this.driftVx = -Math.abs(this.driftVx); // เด้งไปซ้าย
        }

        // ชนบน-ล่าง (เพิ่มส่วนนี้)
        if (this.y < padding) {
            this.y = padding;
            this.driftVy = Math.abs(this.driftVy); // เด้งลง
        } else if (this.y > CONFIG.SCREEN_HEIGHT - padding) {
            this.y = CONFIG.SCREEN_HEIGHT - padding;
            this.driftVy = -Math.abs(this.driftVy); // เด้งขึ้น
        }

        this.updateAnimation('idle');
        this.vx = 0;
    }

    // ฟังก์ชันเปิดโหมดอวกาศ
    enableZeroGravity(duration = CONFIG.ZERO_GRAVITY_DURATION) {
        // 1. ตั้งค่าสถานะ
        this.state = STATES.ZERO_GRAVITY;
        this.zeroGravAlpha = 0; // เริ่มต้น Effect (ถ้ามี)

        // 2. 🚀 สูตรความเร็ว (ใช้สูตรเดิมที่คุณท่านชอบ)
        // driftVx, driftVy คือตัวแปรที่ใช้ใน handleZeroGravity
        this.driftVx = (Math.random() - 0.5) * 3;
        this.driftVy = (Math.random() - 0.5) * 3;

        // 3. 🌀 สูตรการหมุน (ปรับปรุงใหม่!)
        const spinChance = Math.random(); // สุ่มค่า 0.0 - 1.0

        if (spinChance < 0.4) {
            // 40% ให้ลอยนิ่งๆ ไม่หมุน (เท่ไปอีกแบบ)
            this.rotSpeed = 0;
        } else {
            // 60% ที่เหลือ ให้หมุน (ซ้ายบ้าง ขวาบ้าง ตามสูตรเดิม)
            // เพิ่มความหลากหลาย: บางตัวหมุนช้าๆ บางตัวหมุนติ้ว
            this.rotSpeed = (Math.random() - 0.5) * 0.05;
        }

        // 4. ⏳ ตั้งเวลาจบของใครของมัน (แก้บั๊กเวลาไม่เท่ากัน)
        if (this.zeroGravTimeout) clearTimeout(this.zeroGravTimeout); // ล้างอันเก่าก่อนกันพลาด

        this.zeroGravTimeout = setTimeout(() => {
            if (!this.destroyed && this.state === STATES.ZERO_GRAVITY) {
                this.returnToGround();
            }
        }, duration);
    }

    returnToGround() {
        // เปลี่ยนสถานะเป็น "กำลังตก"
        this.state = STATES.FALLING;

        // รีเซ็ตค่าหมุน และ Effect อวกาศ
        this.zeroGravAlpha = 0;

        // ✅ สำคัญ: เราไม่รีเซ็ต this.y ที่นี่แล้ว ปล่อยให้มันค้างที่เดิมแล้วค่อยๆ ร่วงใน update

        // ลดความเร็วแนวนอนลงหน่อย ตอนตกจะได้ไม่พุ่งไปไกลเกิน
        this.driftVx = this.driftVx * 0.5;

        // เริ่มต้นความเร็วการตก (ถ้ากำลังลอยขึ้น ให้เปลี่ยนเป็น 0 ก่อนจะทิ้งดิ่ง)
        this.driftVy = 0;
    }

    handleFalling(delta) {
        // 1. แรงโน้มถ่วง (Gravity) ดึงลงมาเรื่อยๆ
        // ใช้ค่า CONFIG.GRAVITY จากไฟล์ Constants (ปกติคือ 0.6)
        this.driftVy += CONFIG.GRAVITY * delta;

        // 2. อัปเดตตำแหน่ง
        this.x += this.driftVx * delta; // ยังให้ไหลไปข้างๆ ได้นิดหน่อยตามแรงเฉื่อย
        this.y += this.driftVy * delta; // ร่วงลงมา

        // 3. หมุนตัวกลับมาตั้งตรง (Lerp rotation to 0)
        // ค่อยๆ ปรับค่า rotation ให้เข้าหา 0 ทีละนิด ให้ดูเหมือนพยายามทรงตัว
        this.rotation = this.rotation * 0.9;

        // 4. เช็คว่าถึงพื้นหรือยัง?
        if (this.y >= this.baseY) {
            // โป๊ะเชะ! ถึงพื้นแล้ว
            this.y = this.baseY; // ล็อคขาให้ติดพื้น
            this.rotation = 0;   // ตัวตรงเป๊ะ
            this.driftVy = 0;    // หยุดตก
            this.driftVx = 0;    // หยุดไหล

            this.state = STATES.WALKING; // กลับไปเดินตามปกติ
        }

        this.updateAnimation('idle'); // ทำท่าตกใจหรือ Idle ตอนตกก็ได้
    }

    destroy(options) {
        if (this.idleTimer) clearTimeout(this.idleTimer);
        this.removeBubble(true);
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

    /**
     * 1. ฟังก์ชันแสดงผล (Core Render)
     * ทำหน้าที่แค่สร้าง DOM และแปะลงหน้าจอ ไม่บันทึกค่าใดๆ
     */
    displayBubble(text, type = 'default') {
        // ลบอันเก่าก่อนเสมอ (เพื่อไม่ให้ซ้อนกัน)
        this.removeBubble(true);

        // ✅ สร้างใหม่ผ่าน Class ChatBubble
        this.bubble = new ChatBubble(text, type);

        // ✅ จัดตำแหน่งครั้งแรกทันที
        this.syncBubblePosition();

        // ✅ สั่งให้เล่น Animation เด้งดึ๋ง
        this.bubble.show();
    }

    /**
     * 2. ฟังก์ชันเพิ่มพร (Save & Show)
     * ใช้สำหรับคำสั่ง !wish หรือ Redeem ที่ต้องการบันทึกถาวร
     */
    addWish(text, type = 'default') {
        // บันทึกข้อมูลลง Memory ของกวาง
        this.wish = text;
        this.bubbleType = type;

        // สั่งแสดงผล
        this.displayBubble(text, type);

        // ตั้งเวลาลบ (Auto Remove)
        if (this.bubbleTimer) clearTimeout(this.bubbleTimer);
        this.bubbleTimer = setTimeout(() => {
            this.removeBubble(false); // false = ให้ค่อยๆ Fade out
        }, CONFIG.WISH_DURATION || 15000);
    }

    /**
     * 3. ฟังก์ชันพูดชั่วคราว (System Message)
     * ใช้สำหรับบ่น, บอกลา, หรือแจ้งเตือน (ไม่ทับ Wish เดิม)
     */
    sayTemporary(text, type = 'cloud') {
        // ยกเลิก Timer ของ addWish เดิมก่อน
        if (this.bubbleTimer) clearTimeout(this.bubbleTimer);

        // แสดงผล (แต่ไม่บันทึกลง this.wish)
        this.displayBubble(text, type);

        // ตั้งเวลาคืนค่าเดิม
        if (this.tempTimer) clearTimeout(this.tempTimer);
        this.tempTimer = setTimeout(() => {
            if (!this.destroyed) {
                // จบเวลาชั่วคราว -> กู้คืนของเดิม หรือ ลบไปเลยถ้าไม่มีของเดิม
                this.removeBubble(false);
            }
        }, CONFIG.TEMPORARY_MESSAGE_DURATION || 3000);
    }

    /**
     * 4. ฟังก์ชันกู้คืนพร (Restore)
     * ใช้ดึงพรล่าสุดกลับมาแสดง (ใช้กับ Find My Deer ได้ด้วย!)
     */
    restoreWish() {
        if (this.wish) {
            this.displayBubble(this.wish, this.bubbleType);

            // ตั้งเวลานับถอยหลังใหม่
            if (this.bubbleTimer) clearTimeout(this.bubbleTimer);
            this.bubbleTimer = setTimeout(() => {
                this.removeBubble(false);
            }, CONFIG.WISH_DURATION || 15000);
        } else {
            this.removeBubble(false);
        }
    }

    deleteWish() {
        this.wish = null;
        this.bubbleType = 'default';
        this.removeBubble(false); // false เพื่อให้ค่อยๆ Fade out สวยๆ ค่ะ
    }

    syncBubblePosition() {
        if (!this.bubble) return;

        const globalPos = this.getGlobalPosition();
        // ส่งพิกัดไปให้ ChatBubble อัปเดต CSS เอาเอง
        this.bubble.updatePosition(globalPos.x, globalPos.y);
    }

    removeBubble(immediate = true) {
        // เคลียร์ Timer กันพลาด
        if (this.bubbleTimer) {
            clearTimeout(this.bubbleTimer);
            this.bubbleTimer = null;
        }

        if (this.bubble) {
            if (immediate) {
                this.bubble.destroy(); // ลบทันที
            } else {
                this.bubble.hide(); // ค่อยๆ Fade out (แล้วมันจะ destroy ตัวเองทีหลัง)
            }

            // ตัดการเชื่อมต่อทันที (เพื่อให้ update loop หยุด sync)
            if (immediate) this.bubble = null;
        }
    }
}