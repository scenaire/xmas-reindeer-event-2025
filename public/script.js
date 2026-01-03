import { CONFIG, STATES } from './modules/Constants.js';
import { AssetManager } from './modules/AssetManager.js';
import { Reindeer } from './modules/Reindeer.js';

// ลดการสั่นสะเทือนของ PIXI
PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.NEAREST;

/**
 * Main Application - หัวใจของระบบหน้าจอ
 */
class ReindeerApp {
    constructor() {
        this.app = null;
        this.assets = new AssetManager();
        this.reindeerMap = new Map();
        this.socket = null;
        this.isReady = false;
        this.init();
    }

    async init() {
        console.log("🚀 [System] กำลังเริ่มระบบงานฉลองปีใหม่ของคุณ Nair...");

        // 1. สร้าง PIXI Application
        this.app = new PIXI.Application({
            width: CONFIG.SCREEN_WIDTH,
            height: CONFIG.SCREEN_HEIGHT,
            backgroundAlpha: 0,
            antialias: true
        });
        document.body.appendChild(this.app.view);

        // ✅ แยกเลเยอร์
        this.reindeerLayer = new PIXI.Container();
        this.uiLayer = new PIXI.Container();

        this.app.stage.addChild(this.reindeerLayer);
        this.app.stage.addChild(this.uiLayer);

        // ✅ Step สำคัญ: รอให้ฟอนต์และรูปโหลดเสร็จก่อน 100%!
        await document.fonts.ready;
        await this.assets.init();

        console.log("✅ [System] Assets Loaded!");
        this.isReady = true; // พร้อมแล้วจ้า

        // ✅ ย้ายมาไว้ตรงนี้: เชื่อมต่อ Socket หลังจากของพร้อมแล้วเท่านั้น
        // (แก้ปัญหากวางหายเพราะไม่มีรูป)
        this.initSocket();

        // 4. เริ่ม Game Loop
        this.app.ticker.add((delta) => {
            this.update(delta)
        });
    }

    initSocket() {
        this.socket = io();

        // รับสถานะเริ่มต้นเมื่อเปิดหน้าจอ
        this.socket.on('init_state', (state) => {
            console.log("📥 [Socket] Received Init State:", Object.keys(state).length, "deers");
            Object.values(state).forEach(data => this.spawnReindeer(data));
        });

        // รับ Event การกระทำต่างๆ
        this.socket.on('game_event', (event) => {
            if (!this.isReady) return;

            const { type, data, owner, wish, bubbleType } = event;
            // ✅ แปลงชื่อเป็นตัวเล็กทันทีที่รับ Event เพื่อให้หาเจอแน่นอน
            const ownerKey = owner ? owner.toLowerCase() : null;

            switch (type) {
                case 'DUPLICATE':
                    const dupDeer = this.reindeerMap.get(ownerKey);
                    if (dupDeer) {
                        dupDeer.jump();
                        dupDeer.showNametag();
                        dupDeer.sayTemporary("กวางเกลือเค็มปี๋!", 'cloud');
                    }
                    break;

                case 'SPAWN':
                    if (event.isUpgrade) {
                        const oldDeer = this.reindeerMap.get(ownerKey);
                        if (oldDeer) {
                            oldDeer.runAway('right');
                            setTimeout(() => {
                                this.removeReindeer(ownerKey);
                                data.forceSide = 'right';
                                this.spawnReindeer(data);
                            }, 2000);
                        } else {
                            this.spawnReindeer(data);
                        }
                    } else {
                        this.spawnReindeer(data);
                    }
                    break;

                case 'FIND_DEER':
                    const foundDeer = this.reindeerMap.get(ownerKey);
                    if (foundDeer) {
                        foundDeer.jump();
                        foundDeer.showNametag();
                        if (event.wish) {
                            foundDeer.restoreWish();
                        }
                    }
                    break;

                case 'wish':
                    if (this.reindeerMap.has(ownerKey)) {
                        this.reindeerMap.get(ownerKey).addWish(wish, bubbleType);
                    }
                    break;

                case 'UPDATE_SKIN':
                    this.removeReindeer(ownerKey);
                    this.spawnReindeer(data);
                    break;

                case 'SWITCH_DEER':
                    const deerToSwitch = this.reindeerMap.get(ownerKey);
                    if (!event.success) {
                        if (deerToSwitch) {
                            deerToSwitch.jump();
                            deerToSwitch.showNametag();
                            deerToSwitch.sayTemporary(`ยังไม่มีน้อง ${event.targetRarity} เลย...`, 'cloud');
                        }
                        return;
                    }

                    if (deerToSwitch) {
                        const exitDir = event.exitDirection;
                        deerToSwitch.runAway(exitDir);
                        setTimeout(() => {
                            this.removeReindeer(ownerKey);
                            const newData = event.data;
                            newData.forceSide = exitDir;
                            this.spawnReindeer(newData);

                            setTimeout(() => {
                                const newDeer = this.reindeerMap.get(ownerKey);
                                if (newDeer) {
                                    newDeer.showNametag();
                                    if (newData.wish) newDeer.restoreWish();
                                }
                            }, 100);
                        }, 2000);
                    } else {
                        this.spawnReindeer(event.data);
                    }
                    break;

                case 'DELETE_WISH':
                    const targetDeer = this.reindeerMap.get(ownerKey);
                    if (targetDeer) {
                        targetDeer.showNametag();
                        // เช็คว่ามี Wish อยู่จริงไหม
                        if (targetDeer.wish && targetDeer.wish !== "") {
                            targetDeer.deleteWish();
                            targetDeer.sayTemporary('ลบคำอธิษฐานแล้วจ้า!', 'cloud', 3000);
                        } else {
                            targetDeer.sayTemporary('ยังไม่ได้ขอพรเลยนะ!', 'cloud', 3000);
                        }
                        targetDeer.jump();
                    }
                    break;

                case 'USER_OFFLINE':
                    const leavingDeer = this.reindeerMap.get(ownerKey);
                    if (leavingDeer) {
                        leavingDeer.jump();
                        leavingDeer.showNametag();
                        const byeWords = ["ไปก่อนนะ...", "ง่วงแล้ว...", "บายจ้า!", "ZZZzz.."];
                        const word = byeWords[Math.floor(Math.random() * byeWords.length)];
                        leavingDeer.sayTemporary(word, 'cloud');

                        setTimeout(() => {
                            if (leavingDeer && !leavingDeer.destroyed) {
                                leavingDeer.runAway(event.exitDirection || 'left');
                                setTimeout(() => {
                                    this.removeReindeer(ownerKey);
                                }, 2000);
                            }
                        }, 2500);
                    }
                    break;

                case 'DISMISS':
                    if (this.reindeerMap.has(ownerKey)) {
                        const reindeer = this.reindeerMap.get(ownerKey);
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
        // ✅ 1. แปลงชื่อเจ้าของเป็นตัวเล็กทันที (เพื่อใช้เป็น Key)
        const ownerKey = data.owner.toLowerCase();

        // เช็คว่ามีตัวเก่าอยู่ไหม (ใช้ Key ตัวเล็ก)
        if (this.reindeerMap.has(ownerKey)) {
            this.removeReindeer(ownerKey);
        }

        // สร้างกวาง (ส่ง data เดิมที่มีชื่อสวยๆ ไปให้ Reindeer สร้างป้ายชื่อ)
        const reindeer = new Reindeer(data, this.assets);
        const nameTag = reindeer.createUI();

        this.reindeerLayer.addChild(reindeer);
        this.uiLayer.addChild(nameTag);
        reindeer.showNametag();

        // ✅ 2. เก็บลง Map ด้วย Key ตัวเล็ก
        this.reindeerMap.set(ownerKey, reindeer);
        console.log(`✨ Spawned: ${data.owner} (Key: ${ownerKey})`);
    }

    removeReindeer(owner) {
        // ✅ แปลงเป็นตัวเล็กก่อนลบ
        const ownerKey = owner.toLowerCase();
        const reindeer = this.reindeerMap.get(ownerKey);

        if (reindeer) {
            if (reindeer.nameTag) this.uiLayer.removeChild(reindeer.nameTag);
            this.reindeerLayer.removeChild(reindeer);

            reindeer.destroy({ children: true });
            this.reindeerMap.delete(ownerKey);
        }
    }

    update(delta) {
        this.reindeerMap.forEach((reindeer, ownerKey) => {
            reindeer.update(delta);
            if (reindeer.nameTag) {
                reindeer.nameTag.x = reindeer.x;
                reindeer.nameTag.y = reindeer.y + 10;
            }
            if (reindeer.destroyed) this.reindeerMap.delete(ownerKey);
        });

        this.reindeerLayer.children.sort((a, b) => a.y - b.y);
    }
}

new ReindeerApp();