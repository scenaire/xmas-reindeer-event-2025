import { CONFIG, STATES } from './modules/Constants.js';
import { AssetManager } from './modules/AssetManager.js';
import { Reindeer } from './modules/Reindeer.js';

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

        // 2. เชื่อมต่อ Socket.io
        this.initSocket();

        // 3. โหลด Assets ทั้งหมด
        await this.assets.init();
        this.isReady = true; // ✅ ตั้งค่าเป็นพร้อม

        // 4. เริ่ม Game Loop (ใช้ชื่อ update ตามมาตรฐานค่ะ)
        this.app.ticker.add((delta) => this.update(delta));

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
                case 'SPAWN':
                    this.spawnReindeer(data);
                    break;
                case 'FIND_DEER':
                    const reindeer = this.reindeerMap.get(owner);
                    if (reindeer) {
                        reindeer.jump();
                        reindeer.showNametag();
                    }
                    break;
                case 'UPDATE_WISH':
                    if (this.reindeerMap.has(owner)) {
                        this.reindeerMap.get(owner).addWish(wish, bubbleType);
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
        // ถ้าคนเดิมมีกวางอยู่แล้ว ให้ลบออกก่อน (กันซ้ำค่ะ)
        if (this.reindeerMap.has(data.owner)) {
            this.removeReindeer(data.owner);
        }

        const reindeer = new Reindeer(data, this.assets);
        this.app.stage.addChild(reindeer);
        this.reindeerMap.set(data.owner, reindeer);
    }

    removeReindeer(owner) {
        const reindeer = this.reindeerMap.get(owner);
        if (reindeer) {
            this.app.stage.removeChild(reindeer);
            reindeer.destroy();
            this.reindeerMap.delete(owner);
        }
    }

    update(delta) {
        // สั่งให้น้องกวางทุกตัวอัปเดตตัวเอง
        this.reindeerMap.forEach((reindeer, owner) => {
            reindeer.update(delta);

            // ถ้ากวางทำลายตัวเองไปแล้ว (เช่น วิ่งลับจอไป) ให้ลบออกจาก Map
            if (reindeer.destroyed) {
                this.reindeerMap.delete(owner);
            }
        });

        // เรียงลำดับการแสดงผลตามค่า Y (Y-Sorting) 
        // กวางที่อยู่ล่างสุดจะทับกวางที่อยู่ด้านบน ทำให้ดูมีมิติค่ะ
        this.app.stage.children.sort((a, b) => a.y - b.y);
    }
}

// เริ่มการทำงานทันทีที่โหลดไฟล์นี้ค่ะ
new ReindeerApp();