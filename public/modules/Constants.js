/**
 * Constants.js - สมุดตั้งค่าตัวเลขและค่าคงที่ทั้งหมดของระบบ Reindeer
 * Nair สามารถปรับแต่งความเร็ว ขนาด และระยะเวลาต่างๆ ได้จากที่นี่เลยค่ะ
 */

export const CONFIG = {
    // --- 🖥️ Display Settings ---
    SCREEN_WIDTH: 1920,
    SCREEN_HEIGHT: 1080,
    GROUND_Y: 880, // ระดับพื้นดินที่กวางจะเดิน

    // --- 🦌 Reindeer Physics ---
    SPEED: {
        MIN: 1.5,
        MAX: 3.5,
        RUN_MULTIPLIER: 2.5 // ความเร็วเวลาตกใจวิ่งหนี
    },
    GRAVITY: 0.6,
    JUMP_FORCE: -12,
    ZERO_GRAVITY_SPEED: 0.05, //ความเร็วการลอย
    ZERO_GRAVITY_AMPLITUDE: 30, //ระยะการลอย (px)
    ZERO_GRAVITY_DURATION: 30000, //เวลาลอย

    // --- 🎨 Visuals & Scales ---
    SCALES: {
        'Common': 2.0,
        'Uncommon': 2.0,
        'Rare': 2.2,
        'Epic': 2.2,
        'Mythic': 2.2
    },

    // --- ⏳ Timings (Milliseconds) ---
    WISH_DURATION: 15000,    // ข้อความขอพรค้างไว้ 15 วินาที
    DESPAWN_TIME: 3600000,   // กวางจะหายไปหลังจาก 1 ชั่วโมง (ถ้าอยากให้ค้างไว้นานๆ)

    // --- 🎨 Animation Settings ---
    ANIMATION: {
        FRAME_COUNT: 6, // แก้จาก 4 เป็น 6 ตามที่คุณ Nair บอกค่ะ
        FRAME_WIDTH: 48,
        FRAME_HEIGHT: 48,
        SPEED: 0.1
    },

    // --- 🎨 UI Settings ---
    NAME_TAG: {
        DISPLAY_DURATION: 10000,
        FONT_FAMILY: 'Daydream',
        FONT_SIZE: 14,
        FONT_WEIGHT: 'normal',
        FONT_COLOR: '#352520ff',
        FADE_SPEED: 0.02,
        FONT_STROKE: '#ffffffff',
        FONT_STROKE_THICKNESS: 3,
        PADDING: 5,
    },

    // --- 📂 Asset Paths ---
    ASSETS: {
        BASE_PATH: './assets/',
        BUBBLE_BOX: './assets/bubble/bubble_box.png',
        BUBBLE_TAIL: './assets/bubble/bubble_tail.png',
        // รายชื่อไฟล์ที่มีอยู่จริง (ตอนนี้ใช้ texture_0 เป็นหลักไปก่อนค่ะ)
        TEXTURES: {
            'Common': 'texture_0',
            'Uncommon': 'texture_0', // Fallback ไปใช้ 0 ก่อนเพราะยังวาดไม่เสร็จ
            'Rare': 'texture_0',
            'Epic': 'texture_0',
            'Mythic': 'texture_0'
        }
    },

    BUBBLE_TYPES: {
        default: {
            class: 'bubble-default',
            fontColor: '#352520',
            box: 'bubble_box.png',
            tail: 'bubble_tail.png',
            backgroundColor: '#ffffff',
        },
        chaos: {
            class: 'bubble-chaos',
            fontColor: '#ffffff',
            box: 'bubble_box_chaos.png',
            tail: 'bubble_tail_chaos.png',
            backgroundColor: '#48256d',
        },
        love: {
            class: 'bubble-love',
            fontColor: '#ff4b82',
            box: 'bubble_box_love.png',
            tail: 'bubble_tail_love.png',
            backgroundColor: '#facde4',
        },
        money: {
            class: 'bubble-money',
            fontColor: '#a7690dff',
            box: 'bubble_box_money.png',
            tail: 'bubble_tail_money.png',
            backgroundColor: '#ffeca1',
        }
    },

};

// สถานะการเคลื่อนที่ของกวาง
export const STATES = {
    ENTERING: 'ENTERING', // กำลังเดินเข้าฉาก
    IDLE: 'IDLE',         // ยืนนิ่งๆ
    WALKING: 'WALKING',   // เดินไปมา
    JUMPING: 'JUMPING',   // กำลังโดด
    RUNNING: 'RUNNING',    // วิ่งหนีออกซ้าย
    ZERO_GRAVITY: 'ZERO_GRAVITY' // ไม่มีแรงโน้มถ่วง
};