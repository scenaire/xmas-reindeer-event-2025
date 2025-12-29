import { CONFIG } from './Constants.js';

/**
 * ChatBubble - กล่องข้อความขอพรสุดน่ารัก
 * สามารถปรับขนาดได้อัตโนมัติ (Dynamic Resizing) ตามความยาวข้อความค่ะ
 */
export class ChatBubble extends PIXI.Container {
    constructor(text, type, assets) {
        super();
        this.assets = assets; // รับ { box, tail } มาจาก AssetManager
        this.type = type;
        this.visible = false; // ซ่อนไว้ก่อนจนกว่าจะสร้างเสร็จค่ะ

        this.setupBubble(text);
    }

    setupBubble(text) {
        // 1. สร้างข้อความ (Text)
        const textStyle = new PIXI.TextStyle({
            fontFamily: 'Arial',
            fontSize: 20,
            fill: '#333333',
            align: 'center',
            wordWrap: true,
            wordWrapWidth: 200
        });

        const message = new PIXI.Text(text, textStyle);
        message.anchor.set(0.5);

        // 2. เลือกสีกล่องตามประเภท (Type)
        const tintColor = this.getTintColor(this.type);

        // 3. สร้างตัวกล่อง (ใช้ NineSlicePlane เพื่อให้ขอบไม่เบลอเวลาขยายค่ะ)
        const padding = 20;
        const boxWidth = Math.max(60, message.width + padding * 2);
        const boxHeight = message.height + padding * 1.5;

        const box = new PIXI.NineSlicePlane(this.assets.box, 15, 15, 15, 15);
        box.width = boxWidth;
        box.height = boxHeight;
        box.tint = tintColor;
        box.pivot.set(boxWidth / 2, boxHeight); // ให้จุดหมุนอยู่กลางล่าง

        // 4. สร้างหางของ Bubble
        const tail = new PIXI.Sprite(this.assets.tail);
        tail.anchor.set(0.5, 0);
        tail.tint = tintColor;
        tail.y = -2; // เชื่อมกับก้นกล่อง

        // 5. ประกอบร่าง!
        this.addChild(box);
        this.addChild(tail);
        this.addChild(message);

        // จัดตำแหน่งข้อความให้อยู่กลางกล่อง
        message.y = -boxHeight / 2;

        // ขยับ Bubble ขึ้นไปเหนือหัวกวาง
        this.y = -120;

        this.visible = true;
        this.animateIn();
    }

    getTintColor(type) {
        const colors = {
            'love': 0xFFB7CE,  // สีชมพูหวานๆ
            'lucky': 0xFFD700, // สีทองรวยๆ
            'normal': 0xFFFFFF // สีขาวสะอาดตา
        };
        return colors[type] || colors.normal;
    }

    animateIn() {
        this.scale.set(0);
        // ใช้ Simple Animation (ในโปรเจกต์จริงอาจใช้ GSAP ได้ค่ะ)
        const ticker = (delta) => {
            if (this.scale.x < 1) {
                this.scale.x += 0.1 * delta;
                this.scale.y += 0.1 * delta;
            } else {
                this.scale.set(1);
                PIXI.Ticker.shared.remove(ticker);
            }
        };
        PIXI.Ticker.shared.add(ticker);
    }

    // ทำลายตัวเองเมื่อหมดเวลา
    destroyWithDelay(ms) {
        setTimeout(() => {
            if (this.parent) this.parent.removeChild(this);
        }, ms);
    }
}