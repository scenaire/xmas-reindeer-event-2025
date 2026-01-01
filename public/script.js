import { CONFIG, STATES } from './modules/Constants.js';
import { AssetManager } from './modules/AssetManager.js';
import { Reindeer } from './modules/Reindeer.js';
import { analyzeWish } from './modules/WishAnalyzer.js';

// ลดการสั่นสะเทือนของ PIXI
PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.NEAREST;

/**
 * Main Application - หัวใจของระบบหน้าจอ
 * ประสานงานทุกอย่างให้ทำงานร่วมกันอย่างราบรื่นค่ะ
 */
class ReindeerApp {
    constructor() {
        this.app = null;
        this.assets = new AssetManager();
        this.reindeerMap = new Map();
        this.socket = null;
        this.isReady = false; // ✅ เพิ่มตัวแปรเช็คความพร้อม
        this.init();
    }

    async init() {
        console.log("🚀 [System] กำลังเริ่มระบบงานฉลองปีใหม่ของคุณ Nair...");

        // 1. สร้าง PIXI Application
        this.app = new PIXI.Application({
            width: CONFIG.SCREEN_WIDTH,
            height: CONFIG.SCREEN_HEIGHT,
            backgroundAlpha: 0, // ทำพื้นหลังโปร่งใสสำหรับสตรีม
            antialias: true
        });
        document.body.appendChild(this.app.view);

        // ✅ แยกเลเยอร์ให้ชัดเจน
        this.reindeerLayer = new PIXI.Container(); // เลเยอร์กวาง (จัดเรียง Y)
        this.uiLayer = new PIXI.Container();       // เลเยอร์ชื่อ (อยู่บนสุดเสมอ)

        this.app.stage.addChild(this.reindeerLayer);
        this.app.stage.addChild(this.uiLayer);

        // 2. เชื่อมต่อ Socket.io
        this.initSocket();

        // 3. โหลด Assets ทั้งหมด
        await document.fonts.ready; // รอให้ Daydream พร้อม
        await this.assets.init();
        this.isReady = true;

        // 4. เริ่ม Game Loop
        this.app.ticker.add((delta) => {
            this.update(delta)
        });

        console.log("✨ [System] ทุกอย่างพร้อมแล้ว! ขอให้เป็นสตรีมที่ยอดเยี่ยมนะคะ");
    }

    initSocket() {
        this.socket = io();

        // รับสถานะเริ่มต้นเมื่อเปิดหน้าจอ
        this.socket.on('init_state', (state) => {
            Object.values(state).forEach(data => this.spawnReindeer(data));
        });

        // รับ Event การกระทำต่างๆ
        this.socket.on('game_event', (event) => {

            if (!this.isReady) return; // ✅ เช็คสถานะพร้อมก่อน

            const { type, data, owner, wish, bubbleType } = event;

            switch (type) {
                case 'DUPLICATE':
                    // กรณีได้ตัวซ้ำ/เกลือ -> ให้ตัวเดิมกระโดด 1 ที
                    const dupDeer = this.reindeerMap.get(owner);
                    if (dupDeer) {
                        dupDeer.jump();
                        dupDeer.showNametag();

                        if (event.wish) {
                            dupDeer.addWish(event.wish, event.bubbleType);
                        }
                    }
                    break;
                case 'SPAWN':
                    // เช็คว่าเป็น Upgrade ไหม?
                    if (event.isUpgrade) {
                        const oldDeer = this.reindeerMap.get(owner);
                        if (oldDeer) {
                            // 1. สั่งตัวเก่าวิ่งหนีไปทางขวา (Leaving)
                            oldDeer.runAway('right');

                            // 2. รอ 2 วินาที (ให้วิ่งพ้นจอ) แล้วค่อยลบ + สร้างตัวใหม่
                            setTimeout(() => {
                                this.removeReindeer(owner);

                                // 3. สร้างตัวใหม่ โดยบังคับให้เข้าจากทางขวา (forceSide: 'right')
                                // เราต้องแก้ spawnReindeer ให้รับ parameter เพิ่ม หรือยัดลง data
                                data.forceSide = 'right';
                                this.spawnReindeer(data);
                            }, 2000);
                        } else {
                            this.spawnReindeer(data);
                        }
                    } else {
                        // ถ้าเพิ่งเกิดครั้งแรก ก็เกิดปกติ
                        this.spawnReindeer(data);
                    }
                    break;
                case 'FIND_DEER':
                    const wishToShow = event.wish;
                    const typeToShow = event.bubbleType;

                    // หาตัวกวาง (แก้ this.reindeerMap ให้ตรงกับตัวแปรของคุณ)
                    const foundDeer = this.reindeerMap.get(owner);

                    if (foundDeer) {
                        // ท่าทางพื้นฐาน
                        foundDeer.jump();
                        foundDeer.showNametag();

                        // ✅ 2. เพิ่มเงื่อนไข: ถ้ามีคำขอพรส่งมาด้วย ให้โชว์ Bubble เลย!
                        if (wishToShow) {
                            foundDeer.addWish(wishToShow, typeToShow);
                        }
                    }
                    break;
                case 'wish':
                    if (this.reindeerMap.has(owner)) {
                        // ส่ง HTML (wish) และประเภท (bubbleType) เข้าไปตรงๆ
                        this.reindeerMap.get(owner).addWish(wish, bubbleType);
                    } else {
                        console.warn(`⚠️ ไม่พบตัวน้องกวางของ ${owner} ไม่สามารถเพิ่มคำอวยพรได้`);
                    }
                    break;
                case 'UPDATE_SKIN':
                    // ลบตัวเก่าสร้างตัวใหม่เพื่อเปลี่ยนชุด (วิธีที่เสถียรที่สุดค่ะ)
                    this.removeReindeer(owner);
                    this.spawnReindeer(data);
                    break;
                case 'DISMISS':
                    if (this.reindeerMap.has(owner)) {
                        // ทำให้น้องกวางวิ่งหนีออกไปเอง (ดูเป็นธรรมชาติกว่าหายวับไปค่ะ)
                        const reindeer = this.reindeerMap.get(owner);
                        reindeer.state = STATES.RUNNING;
                    }
                    break;
            }
        });

        // รับคำสั่งพิเศษ (Commands)
        this.socket.on('command', (cmd) => {
            if (cmd.type === 'JUMP_ALL') {
                this.reindeerMap.forEach(r => r.jump());
            } else if (cmd.type === 'RUN_LEFT') {
                this.reindeerMap.forEach(r => r.runAway('left'));
            } else if (cmd.type === 'RUN_RIGHT') {
                this.reindeerMap.forEach(r => r.runAway('right'));
            } else if (cmd.type === 'ZERO_GRAVITY') {
                this.reindeerMap.forEach(reindeer => reindeer.enableZeroGravity());
            }
        });
    }

    spawnReindeer(data) {
        if (this.reindeerMap.has(data.owner)) {
            this.removeReindeer(data.owner);
        }

        const reindeer = new Reindeer(data, this.assets);
        const nameTag = reindeer.createUI(); // สร้างป้ายชื่อ

        // ✅ แยกบ้านให้กวางกับชื่อ
        this.reindeerLayer.addChild(reindeer);
        this.uiLayer.addChild(nameTag);

        // ✅ สั่งให้โชว์ชื่อทันทีที่เกิด
        reindeer.showNametag();

        this.reindeerMap.set(data.owner, reindeer);
    }

    removeReindeer(owner) {
        const reindeer = this.reindeerMap.get(owner);
        if (reindeer) {
            // ✅ ต้องลบทั้งกวางและชื่อ ไม่งั้นจะเกิด "ป้ายชื่อผี" ค้างขอบจอค่ะ
            if (reindeer.nameTag) this.uiLayer.removeChild(reindeer.nameTag);
            this.reindeerLayer.removeChild(reindeer);

            reindeer.destroy({ children: true });
            this.reindeerMap.delete(owner);
        }
    }

    update(delta) {
        this.reindeerMap.forEach((reindeer, owner) => {
            reindeer.update(delta);
            if (reindeer.nameTag) {
                reindeer.nameTag.x = reindeer.x;
                reindeer.nameTag.y = reindeer.y + 10; // อยู่ใต้เท้าตามใจคุณ Nair ค่ะ
            }
            if (reindeer.destroyed) this.reindeerMap.delete(owner);
        });

        // ✅ Sort เฉพาะเลเยอร์กวาง ไม่ต้องมายุ่งกับชื่อ (ชื่อจะได้อยู่บนสุดตลอด)
        this.reindeerLayer.children.sort((a, b) => a.y - b.y);
    }
}

// เริ่มการทำงานทันทีที่โหลดไฟล์นี้ค่ะ
new ReindeerApp();