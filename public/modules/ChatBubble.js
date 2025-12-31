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

        // Inject CSS Variables เพื่อเปลี่ยนรูปและสี
        div.style.setProperty('--box-bg', `url('${bubbleConfig.box}')`);
        div.style.setProperty('--tail-bg', `url('${bubbleConfig.tail}')`);
        div.style.setProperty('--font-color', bubbleConfig.fontColor);
        div.style.setProperty('--font-family', fontConfig.FONT_FAMILY);
        div.style.setProperty('--font-size', `${fontConfig.FONT_SIZE}px`);

        // เอาไปแปะใน Container หน้าเว็บ
        document.getElementById('bubble-container').appendChild(div);
        this.element = div;
    }

    /**
     * ฟังก์ชันสำคัญ! อัปเดตตำแหน่ง div ให้ตรงกับกวาง
     * @param {number} x - พิกัด X ของกวาง
     * @param {number} y - พิกัด Y ของกวาง
     */
    updatePosition(x, y) {
        if (!this.element || this.isDestroyed) return;

        // คำนวณตำแหน่ง (ปรับ offset ตรงนี้ได้)
        const bubbleX = x;
        const bubbleY = y - 130; // ลอยเหนือหัวกวาง 130px

        // ใช้ transform: translate จะลื่นกว่า top/left มากๆ
        // ลบ 50% ของความกว้างตัวเองออก เพื่อให้จุดกึ่งกลางตรงกับหัวกวาง
        const offsetX = this.element.offsetWidth / 2;
        const offsetY = this.element.offsetHeight;

        this.element.style.left = `${bubbleX - offsetX}px`;
        this.element.style.top = `${bubbleY - offsetY}px`;
    }

    destroy() {
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        this.element = null;
        this.isDestroyed = true;
    }
}