import { dataManager } from './DataManager.js';

/**
 * PresenceManager - ผู้ดูแลการเข้า-ออกของคนดู
 * จัดการเรื่องการ Spawn และ Dismiss กวางตามสถานะออนไลน์จริงค่ะ
 */
export class PresenceManager {
    constructor(io, twitchService) {
        this.io = io;
        this.twitch = twitchService;
        this.visibleUsers = new Set(); // เก็บเฉพาะคนที่กวางกำลังแสดงบนจอ
        this.immunityMap = new Map(); // ✅ เก็บเวลาเริ่มหาย (User -> Timestamp)
        this.CHECK_INTERVAL = 20000;   // เช็คทุก 20 วินาที
        this.IMMUNITY_DURATION = 120000; // ✅ 2 นาที (120,000 ms)
    }

    start() {
        console.log("🕵️ [Presence] Start monitoring online viewers...");
        // รันครั้งแรกทันที
        this.syncOnlineStatus();
        setInterval(() => this.syncOnlineStatus(), this.CHECK_INTERVAL);
    }

    // ✅ ฟังก์ชันนี้ให้ RewardHandler เรียกใช้เมื่อมีการกดแลกของ (Instant Online)
    markActivity(owner) {
        const ownerLower = owner.toLowerCase();

        // 1. ล้างโทษทันที (ถ้ากำลังนับถอยหลังจะลบ)
        if (this.immunityMap.has(ownerLower)) {
            console.log(`🛡️ [Immunity] ${owner} is active! Timer reset.`);
            this.immunityMap.delete(ownerLower);
        }

        // 2. ถ้ากวางยังไม่แสดงบนจอ (เช่น เพิ่งเข้าสตรีมมาแต่ API ยังไม่อัปเดต) -> สั่ง Spawn เลย
        if (!this.visibleUsers.has(owner)) {
            const gameState = dataManager.getGameState();
            const deerData = gameState[owner];
            if (deerData) {
                console.log(`⚡ [Instant Online] Spawning ${owner} immediately.`);
                this.spawnReindeer(deerData);
            }
        }
    }

    async syncOnlineStatus() {
        const onlineUsers = await this.twitch.getOnlineViewers();
        if (!onlineUsers) return;

        const gameState = dataManager.getGameState();
        const now = Date.now();

        // A. เช็คคนหาย (Visible -> Offline check)
        this.visibleUsers.forEach(owner => {
            const ownerLower = owner.toLowerCase();

            if (!onlineUsers.has(ownerLower)) {
                // ❌ ไม่เจอชื่อใน Twitch API
                if (!this.immunityMap.has(ownerLower)) {
                    // เริ่มจับเวลา Immunity
                    console.log(`⏳ [Presence] ${owner} is missing. Starting 2m immunity.`);
                    this.immunityMap.set(ownerLower, now);
                } else {
                    // เช็คว่าหมดเวลาหรือยัง
                    const missingSince = this.immunityMap.get(ownerLower);
                    if (now - missingSince > this.IMMUNITY_DURATION) {
                        console.log(`👋 [Presence] ${owner} timed out (${this.IMMUNITY_DURATION / 1000}s). Goodbye!`);
                        this.dismissReindeer(owner); // เชิญออก
                        this.immunityMap.delete(ownerLower);
                    }
                }
            } else {
                // ✅ เจอชื่ออยู่ (อาจจะกลับมาแล้ว หรือ API ปกติ) -> ล้าง Immunity
                if (this.immunityMap.has(ownerLower)) {
                    this.immunityMap.delete(ownerLower);
                }
            }
        });

        // B. เช็คคนมาใหม่ (Offline -> Online)
        // (ส่วนนี้ทำงานปกติ ถ้า API เห็นว่ามา ก็ Spawn)
        Object.values(gameState).forEach(deer => {
            const ownerLower = deer.owner.toLowerCase();
            if (onlineUsers.has(ownerLower) && !this.visibleUsers.has(deer.owner)) {
                console.log(`✨ [Presence] ${deer.owner} returned!`);
                this.spawnReindeer(deer);
            }
        });
    }

    spawnReindeer(data) {
        this.visibleUsers.add(data.owner);
        this.io.emit('game_event', { type: 'SPAWN', data, isRestore: true });
    }

    dismissReindeer(owner) {
        this.visibleUsers.delete(owner);
        // ✅ ส่ง Event ใหม่ USER_OFFLINE เพื่อเล่นท่าบอกลาสวยๆ
        this.io.emit('game_event', {
            type: 'USER_OFFLINE',
            owner: owner,
            exitDirection: Math.random() < 0.5 ? 'left' : 'right'
        });
    }

    // ฟังก์ชันช่วยสำหรับ Socket เชื่อมต่อใหม่
    async handleInitialSync(socket) {
        const onlineUsers = await this.twitch.getOnlineViewers();
        const gameState = dataManager.getGameState();

        const activeDeers = Object.values(gameState).filter(deer =>
            onlineUsers ? onlineUsers.has(deer.owner.toLowerCase()) : true
        );

        activeDeers.forEach((deer, index) => {
            this.visibleUsers.add(deer.owner);
            // หน่วงเวลานิดหน่อยเพื่อให้กวางค่อยๆ เดินออกมา ไม่ทับกันค่ะ
            setTimeout(() => {
                socket.emit('game_event', { type: 'SPAWN', data: deer, isRestore: true });
            }, index * 200);
        });
    }
}