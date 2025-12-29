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
        this.CHECK_INTERVAL = 20000;   // เช็คทุกๆ 20 วินาที (ปรับได้ใน .env ค่ะ)
    }

    start() {
        console.log("🕵️ [Presence] Start monitoring online viewers...");
        setInterval(() => this.syncOnlineStatus(), this.CHECK_INTERVAL);
    }

    async syncOnlineStatus() {
        const onlineUsers = await this.twitch.getOnlineViewers();
        if (!onlineUsers) return;

        const gameState = dataManager.getGameState();

        // A. เช็คคนหาย (Visible -> Offline)
        this.visibleUsers.forEach(owner => {
            if (!onlineUsers.has(owner.toLowerCase())) {
                console.log(`👋 [Presence] ${owner} left the stream.`);
                this.dismissReindeer(owner);
            }
        });

        // B. เช็คคนกลับมา (Offline -> Online)
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
        this.io.emit('game_event', { type: 'DISMISS', owner });
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