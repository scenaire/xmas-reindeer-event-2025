// public/modules/ChatBubble.js
import { CONFIG } from './Constants.js';

export class ChatBubble {
    constructor(text, type = 'default') {
        this.element = null;
        this.isDestroyed = false;

        // 1. ดึง Config
        const bubbleConfig = CONFIG.BUBBLE_TYPES[type] || CONFIG.BUBBLE_TYPES['default'];
        const fontConfig = CONFIG.CHAT_BUBBLE || { FONT_FAMILY: 'Arial', FONT_SIZE: 16 };

        // 2. สร้าง DOM Element
        this.createDOM(text, bubbleConfig, fontConfig);
    }

    createDOM(text, bubbleConfig, fontConfig) {
        const div = document.createElement('div');
        div.className = `wish-bubble bubble-${bubbleConfig.class || 'default'}`;

        // ใส่ข้อความ (รองรับ HTML Emote ได้เลย!)
        div.innerHTML = text;

        const basePath = CONFIG.BUBBLE_TYPES.BASE_PATH || './assets/bubble/';
        const boxUrl = `url('${basePath}${bubbleConfig.box}')`;
        const tailUrl = `url('${basePath}${bubbleConfig.tail}')`;

        // Inject CSS Variables
        div.style.setProperty('--box-bg', boxUrl);
        div.style.setProperty('--tail-bg', tailUrl);
        div.style.setProperty('--font-color', bubbleConfig.fontColor);
        div.style.setProperty('--font-family', fontConfig.FONT_FAMILY);
        div.style.setProperty('--font-size', `${fontConfig.FONT_SIZE}px`);
        div.style.setProperty('--bg-color', bubbleConfig.backgroundColor || '#ffffff');

        const container = document.getElementById('bubble-container');
        if (container) container.appendChild(div);

        this.element = div;
    }

    /**
     * สั่งให้บับเบิ้ล "เด้ง" ออกมา (Entrance Animation)
     */
    show() {
        if (!this.element) return;

        // รอเฟรมถัดไปเพื่อให้ Browser รับรู้ State เริ่มต้นก่อน แล้วค่อยเติม class
        requestAnimationFrame(() => {
            if (this.element) this.element.classList.add('show');
        });
    }

    /**
     * สั่งให้บับเบิ้ล "ค่อยๆ หายไป" (Exit Animation)
     */
    hide() {
        if (!this.element) return;

        this.element.classList.remove('show');
        this.element.classList.add('fade-out'); // ต้องมีคลาสนี้ใน style.css นะคะ

        // รอ Animation จบ (0.5s) แล้วค่อยลบจาก DOM จริงๆ
        setTimeout(() => {
            this.destroy();
        }, 500);
    }

    /**
     * อัปเดตตำแหน่ง (รับพิกัด Global ของกวางมา)
     */
    updatePosition(x, y) {
        if (!this.element || this.isDestroyed) return;
        this.element.style.left = `${x}px`;
        this.element.style.top = `${y - 120}px`;
    }

    /**
     * ลบทิ้งทันที (ไม่มี Animation)
     */
    destroy() {
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        this.element = null;
        this.isDestroyed = true;
    }
}