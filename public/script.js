const socket = io();
const app = new PIXI.Application({
    width: 1920,
    height: 1080,
    backgroundAlpha: 0,
    antialias: true
});
document.getElementById('overlay-container').appendChild(app.view);

// ✅ เปิดระบบจัดเรียงลำดับ (Z-Index Sorting)
app.stage.sortableChildren = true;

const activeReindeers = {};
const rarityValue = { 'Common': 1, 'Uncommon': 2, 'Rare': 3, 'Epic': 4, 'Mythic': 5 };

// --- 0. ส่วนรับข้อมูลจาก Server (Socket) ---

socket.on('game_event', (data) => {
    // 1. กรณีสั่งเกิด (SPAWN)
    if (data.type === 'SPAWN') {
        handleSpawnLogic(data);
    }

    // ✅ 2. กรณีสั่งลบ (DISMISS) - เพิ่มใหม่!
    else if (data.type === 'DISMISS') {
        const deer = activeReindeers[data.owner];
        if (deer) {
            console.log(`👋 Dismissing ${data.owner} (Offline)`);
            // ใช้ฟังก์ชันวิ่งหนีที่เรามีอยู่แล้ว
            dismissReindeer(deer, () => {
                console.log(`${data.owner} has left the screen.`);
            });
        }
    }

    // ✅ 3. กรณีสั่ง update wish (UPDATE_WISH) - เพิ่มใหม่!
    else if (data.type === 'UPDATE_WISH') {
        const deer = activeReindeers[data.owner];
        if (deer && !deer.destroyed) {
            // update wish
            deer.wish = data.wish;

            //NO BUBBLE YET BUT I WILL ADD IT LATER

            deer.nameTag.text = `${data.owner}\n"${data.wish}"`; // update name tag
            deer.nameTag.alpha = 1;
            deer.nameTagFadeDelay = 300;

            //EFFECT: Reindeer Jump
            deer.velocityY = -10;

            console.log('update wish for ' + data.owner);
        }
    }
});

let respawnQueue = [];
let isRespawning = false;

socket.on('command', (data) => {
    if (data.type === 'JUMP_ALL') {
        // ... (Logic กระโดดเดิม) ...
        Object.values(activeReindeers).forEach(deer => {
            deer.velocityY = -15;
            if (deer.nameTag) { deer.nameTag.alpha = 1; deer.nameTagFadeDelay = 180; }
        });
    }
    else if (data.type === 'RUN_LEFT' || data.type === 'RUN_RIGHT') {
        // 1. 💾 Snapshot: เก็บข้อมูลกวางทั้งหมดไว้เตรียมเกิดใหม่
        // (เฉพาะตัวที่ยังไม่ตายและไม่ได้กำลังวิ่งหนีอยู่แล้ว)
        respawnQueue = Object.values(activeReindeers)
            .filter(deer => !deer.destroyed && deer.state !== 'LEAVING')
            .map(deer => deer.data);

        // 2. 🏃‍♂️ Evacuate: สั่งทุกตัววิ่งหนี!
        Object.values(activeReindeers).forEach(deer => {
            deer.state = 'LEAVING'; // เข้าโหมดวิ่งหนี

            if (data.type === 'RUN_LEFT') {
                deer.forceDirection = -1; // วิ่งซ้าย
                deer.scale.x = -Math.abs(deer.scale.x); // หันซ้าย
            } else {
                deer.forceDirection = 1; // วิ่งขวา
                deer.scale.x = Math.abs(deer.scale.x); // หันขวา
            }

            // ลบออกจาก Active List ทันที (เพื่อให้ Logic การเกิดใหม่ไม่มองว่าซ้ำ)
            // แต่ตัว Sprite ยังอยู่บนจอจนกว่าจะวิ่งพ้นจอตาม Logic ใน tick
            delete activeReindeers[deer.data.owner];
        });

        // 3. ⏳ Start Respawn Sequence: เริ่มกระบวนการทยอยเกิดใหม่
        if (!isRespawning) {
            isRespawning = true;
            processRespawnQueue();
        }
    }
    else if (data.type === 'FIND_MY_DEER') {
        const ownerName = data.targetOwner;
        const targetDeer = activeReindeers[ownerName]; // หยิบกวางออกมาเลย

        if (targetDeer && !targetDeer.destroyed) {
            // 1. 🏷️ โชว์ชื่อชัดๆ (ค้างไว้ 5 วินาที)
            if (targetDeer.nameTag) {
                targetDeer.nameTag.alpha = 1;
                targetDeer.nameTagFadeDelay = 300;
            }

            // 2. 🦘 กระโดดสูงๆ ให้เด่นกว่าเพื่อน (High Jump)
            // (ใส่แรงกระโดดมากกว่าปกตินิดนึง เพื่อนโดด -15 เราโดด -20)
            targetDeer.velocityY = -20;

            console.log(`Found deer for ${ownerName}!`);
        } else {
            console.log(`Deer for ${ownerName} not found (maybe not spawned yet).`);
        }
    }
    else if (data.type === 'ZERO_GRAVITY') {
        Object.values(activeReindeers).forEach(deer => {
            if (deer.destroyed) return;

            deer.isZeroGravity = true;

            // 🚀 Speed Up: ปรับตัวคูณกลับเป็น 3 (ให้ไวเท่าเวอร์ชันแรก)
            // แต่เดี๋ยวเราจะไปใส่ความนุ่มใน tick แทน
            deer.driftX = (Math.random() - 0.5) * 3;
            deer.driftY = (Math.random() - 0.5) * 3;

            // หมุนตัว: เอาความเร็วปานกลาง (ไม่เร็วไป ไม่ช้าไป)
            deer.rotSpeed = (Math.random() - 0.5) * 0.05;

            // ค่าสุ่มสำหรับคลื่น (เหมือนเดิม)
            deer.floatOffset = Math.random() * 100;
        });

        // เวลา 25 วินาที เหมือนเดิม
        setTimeout(() => {
            Object.values(activeReindeers).forEach(deer => {
                if (deer.destroyed) return;
                deer.isZeroGravity = false;
                deer.rotation = 0;
                deer.velocityY = 0;
            });
        }, 25000);
    }
});

// ฟังก์ชันสำหรับทยอยปล่อยกวางออกมาใหม่
function processRespawnQueue() {
    // รอ 4 วินาที (ให้ตัวเก่าวิ่งหายไปจนหมดจอก่อน)
    setTimeout(() => {
        const interval = setInterval(() => {
            if (respawnQueue.length === 0) {
                clearInterval(interval);
                isRespawning = false;
                return;
            }

            // ดึงข้อมูลออกมาทีละคน
            const nextDeerData = respawnQueue.shift();

            // สร้างใหม่ (จะเข้าสู่โหมด ENTERING เดินมาจากซ้ายตามปกติ)
            createReindeer(nextDeerData);

        }, 800); // ปล่อยออกมาทุกๆ 0.8 วินาที (ปรับความถี่ตรงนี้)
    }, 4000);
}

// --- 1. Logic การตัดสินใจ (Director) ---

function handleSpawnLogic(newData) {
    const owner = newData.owner;
    const existingDeer = activeReindeers[owner];

    // กรณีที่ 1: ยังไม่เคยมีกวาง -> เดินหล่อๆ เข้ามาจากซ้ายเลย
    if (!existingDeer) {
        createReindeer(newData);
        return;
    }

    // กรณีที่ 2: มีกวางอยู่แล้ว -> เช็คระดับ
    const oldRarityVal = rarityValue[existingDeer.data.rarity] || 0;
    const newRarityVal = rarityValue[newData.rarity] || 0;

    console.log(`🔍 Check: ${owner} (${existingDeer.data.rarity} -> ${newData.rarity})`);

    if (newRarityVal > oldRarityVal) {
        // ✨ Upgrade Effect: สั่งตัวเก่าวิ่งออกขวา -> รอจนหายไป -> สร้างตัวใหม่เดินเข้าซ้าย
        console.log('👋 Dismissing old deer...');

        dismissReindeer(existingDeer, () => {
            console.log('✨ Creating new upgraded deer!');
            createReindeer(newData);
        });

    } else {
        // ถ้าระดับเท่าเดิมหรือต่ำกว่า -> อัปเดตแค่คำอธิษฐาน
        updateWishDisplay(existingDeer, newData.wish);
        existingDeer.velocityY = -10; // เด้งรับทราบ

        // ✨ อัปเดตข้อมูลแล้ว ให้ชื่อเด้งขึ้นมาโชว์ด้วย
        if (existingDeer.nameTag) {
            existingDeer.nameTag.alpha = 1;
            existingDeer.nameTagFadeDelay = 180;
        }
    }
}

// --- 2. การสร้างและควบคุมกวาง (Core) ---

function createReindeer(config) {
    const texture = PIXI.Texture.from(`/assets/${config.image}`);
    const reindeer = new PIXI.Sprite(texture);

    texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
    reindeer.anchor.set(0.5);

    // Scale
    let scaleValue = 2;
    if (config.rarity === 'Mythic') scaleValue = 3;
    reindeer.scale.set(scaleValue);

    // 📍 Spawn Position: เริ่มที่ "นอกจอฝั่งซ้าย"
    reindeer.x = -150;

    // Random Y Position
    const startY = 880 + (Math.random() * 100);
    reindeer.y = startY;

    // --- Name Tag (ใต้เท้า + ระบบ Fade) ---
    const nameStyle = new PIXI.TextStyle({
        fontFamily: 'Daydream, "Courier New", monospace',
        fontSize: 6, fill: '#4B3621', stroke: '#FFFFFF', strokeThickness: 2,
        align: 'center', fontWeight: 'bold'
    });
    const nameTag = new PIXI.Text(config.owner, nameStyle);
    nameTag.anchor.set(0.5);
    nameTag.y = 28; // ใต้เท้า
    nameTag.texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
    nameTag.resolution = 2;

    reindeer.addChild(nameTag);

    // ✨ เก็บ Reference และตัวนับเวลาสำหรับ Fade Out
    reindeer.nameTag = nameTag;
    reindeer.nameTagFadeDelay = 300; // 5 วินาที (60fps * 5)

    // --- Setup Data & State ---
    reindeer.data = config;
    reindeer.startY = startY;
    reindeer.velocityY = 0;

    // ✨ State เริ่มต้นคือ 'ENTERING' (กำลังเดินเข้าฉาก)
    reindeer.state = 'ENTERING';
    reindeer.targetX = 100 + Math.random() * 1500; // จุดหมายแรก
    reindeer.waitTime = 0;
    reindeer.forceDirection = 0;

    app.stage.addChild(reindeer);
    activeReindeers[config.owner] = reindeer;

    // --- Animation Loop ---
    const tick = (delta) => {
        if (reindeer.destroyed) return;

        // 1. เรียงลำดับความลึก
        reindeer.zIndex = reindeer.y;

        // 2. Physics & Gravity Control
        if (reindeer.isZeroGravity) {
            // 🚀 โหมดอวกาศ (แก้ไขใหม่)

            // เคลื่อนที่เร็ว (ตามค่า drift ที่ตั้งไว้)
            reindeer.x += (reindeer.driftX || 0) * delta;
            reindeer.y += (reindeer.driftY || 0) * delta;

            // ✨ ความนุ่ม: ใส่ Sine Wave เบาๆ ซ้อนเข้าไป
            const floatY = Math.sin((Date.now() / 600) + reindeer.floatOffset) * 0.5;
            reindeer.y += floatY * delta;

            // หมุนตัว
            reindeer.rotation += (reindeer.rotSpeed || 0) * delta;

            // 🛡️ ระบบกำแพงกั้น (กันหลุดจอ)
            const topLimit = -100; // ขอบบน (เผื่อเขานิดนึง)
            const floorLimit = reindeer.startY; // ขอบล่าง (ห้ามต่ำกว่าพื้นเดิม)

            // ⬆️ เช็คขอบบน: ถ้าลอยสูงเกิน ให้ดึงกลับมาแล้วเด้งลง
            if (reindeer.y < topLimit) {
                reindeer.y = topLimit;
                reindeer.driftY = Math.abs(reindeer.driftY); // บังคับค่าบวก (ลง)
            }

            // ⬇️ เช็คขอบล่าง: ถ้าลอยต่ำกว่าพื้น ให้ดึงกลับมาที่พื้นแล้วเด้งขึ้น
            // (อันนี้สำคัญมาก กันจมดินตอนจบ)
            if (reindeer.y > floorLimit) {
                reindeer.y = floorLimit;
                reindeer.driftY = -Math.abs(reindeer.driftY); // บังคับค่าลบ (ขึ้น)
            }
        }
        else {
            // 🌏 โหมดปกติ: ใช้แรงโน้มถ่วงโลก

            // รีเซ็ตมุมให้กลับมาตั้งตรง (เผื่อเพิ่งลงมาจากอวกาศ)
            if (reindeer.rotation !== 0) reindeer.rotation = 0;

            // Logic แรงโน้มถ่วงเดิมของคุณ
            if (reindeer.velocityY !== 0 || reindeer.y < reindeer.startY) {
                reindeer.y += reindeer.velocityY * delta;
                reindeer.velocityY += 0.8 * delta;
                if (reindeer.y > reindeer.startY) {
                    reindeer.y = reindeer.startY;
                    reindeer.velocityY = 0;
                }
            }
        }

        // 3. State Machine Control (สมองกล) 
        // (ยังคงทำงานต่อเพื่อให้ขากวางขยับดุ๊กดิ๊กแม้จะลอยอยู่)
        if (reindeer.forceDirection !== 0) {
            // โดนสั่ง (Command)
            const runSpeed = 8;
            reindeer.x += reindeer.forceDirection * runSpeed * delta;
        }
        else if (reindeer.state === 'ENTERING') {
            // 🟢 เดินเข้าฉาก
            const speed = 2;
            reindeer.x += speed * delta;
            reindeer.scale.x = Math.abs(reindeer.scale.x);

            if (reindeer.x >= reindeer.targetX) {
                reindeer.state = 'IDLE';
                reindeer.waitTime = 30;
            }
            // ตอนเดินเข้า ให้โชว์ชื่อตลอด
            nameTag.alpha = 1;
        }
        else if (reindeer.state === 'LEAVING') {
            // 🔴 วิ่งออกจากฉาก (เร็วๆ)
            nameTag.alpha = 1;
            const runSpeed = 12;

            // วิ่งตามทิศที่ถูกสั่ง (forceDirection)
            const dir = reindeer.forceDirection || 1;

            reindeer.x += dir * runSpeed * delta;

            // หันหน้าตามทิศที่วิ่ง
            if (dir > 0) reindeer.scale.x = Math.abs(reindeer.scale.x);
            else reindeer.scale.x = -Math.abs(reindeer.scale.x);

            // เช็คว่าพ้นจอหรือยัง (เช็คทั้ง 2 ฝั่ง)
            const isGoneRight = (dir > 0 && reindeer.x > 2100);
            const isGoneLeft = (dir < 0 && reindeer.x < -300);

            if (isGoneRight || isGoneLeft) {
                if (reindeer.onGoneCallback) reindeer.onGoneCallback();
                destroyReindeerSprite(reindeer);
            }
        }
        else {
            // 🔵 เดินเล่นปกติ (Wander)
            updateWanderBehavior(reindeer, delta);

            // ✨ Logic การจางของชื่อ (ทำงานเฉพาะตอนเดินเล่น)
            if (reindeer.nameTagFadeDelay > 0) {
                reindeer.nameTagFadeDelay -= delta;
                nameTag.alpha = 1; // ยังไม่หมดเวลาก็โชว์ชัดๆ
            } else {
                // หมดเวลาแล้ว ให้ค่อยๆ จาง
                if (nameTag.alpha > 0) {
                    nameTag.alpha -= 0.02 * delta;
                }
            }
        }

        // 4. วาร์ป (Screen Wrapping)
        // (ทำงานเฉพาะตอนไม่ได้วิ่งหนี ไม่ได้เดินเข้า และ *ไม่ได้ลอยอยู่*)
        // เพิ่มเงื่อนไข !reindeer.isZeroGravity เข้าไป กันมันวาร์ปตอนลอย
        if (reindeer.state !== 'LEAVING' && reindeer.state !== 'ENTERING' && !reindeer.isZeroGravity) {
            const screenWidth = 1920;
            const buffer = 50;

            if (reindeer.x > screenWidth + buffer) {
                reindeer.x = -buffer;
                reindeer.state = 'IDLE';
                reindeer.waitTime = 10;
                reindeer.scale.x = Math.abs(reindeer.scale.x);
            }
            else if (reindeer.x < -buffer) {
                reindeer.x = screenWidth + buffer;
                reindeer.state = 'IDLE';
                reindeer.waitTime = 10;
                reindeer.scale.x = -Math.abs(reindeer.scale.x);
            }
        }

        // 5. กันชื่อกลับด้าน
        // (และกันชื่อหมุนตามตัวกวางตอนลอย)
        if (reindeer.scale.x < 0) nameTag.scale.x = -1;
        else nameTag.scale.x = 1;

        // ✅ เพิ่ม: ให้ชื่อตั้งตรงตลอดเวลา แม้ตัวกวางจะหมุนติ้ว
        nameTag.rotation = -reindeer.rotation;
    };

    reindeer.tickFunction = tick;
    app.ticker.add(tick);
}

// ฟังก์ชันสั่งกวางวิ่งออกไป (Dismiss)
function dismissReindeer(deer, callback) {
    if (!deer || deer.destroyed) {
        if (callback) callback();
        return;
    }
    deer.state = 'LEAVING';
    deer.onGoneCallback = callback;
    delete activeReindeers[deer.data.owner];
}

function destroyReindeerSprite(deer) {
    app.ticker.remove(deer.tickFunction);
    app.stage.removeChild(deer);
    deer.destroy({ children: true });
}

function updateWanderBehavior(deer, delta) {
    if (deer.state === 'IDLE') {
        deer.waitTime -= delta;
        if (deer.waitTime <= 0) {
            deer.state = 'WALK';
            const moveDist = (Math.random() * 400) - 200;
            deer.moveTarget = deer.x + moveDist;

            // อิสระเสรี! ไม่มีการเช็คขอบจอที่นี่แล้ว (เพื่อให้ Wrap ได้)

            if (moveDist > 0) deer.scale.x = Math.abs(deer.scale.x);
            else deer.scale.x = -Math.abs(deer.scale.x);
        }
    } else if (deer.state === 'WALK') {
        const speed = (deer.data.behavior === 'energetic') ? 2 : 1;
        const dx = deer.moveTarget - deer.x;
        if (Math.abs(dx) < 5) {
            deer.state = 'IDLE';
            deer.waitTime = 60 + Math.random() * 120;
        } else {
            deer.x += Math.sign(dx) * speed * delta;
        }
    }
}

function updateWishDisplay(deer, newWish) {
    console.log(`💬 Updated wish for ${deer.data.owner}: ${newWish}`);
}

// --- 🧪 Real-World Simulator Test Button ---
document.getElementById('test-btn').addEventListener('click', () => {
    // ข้อมูลจำลอง (เหมือนเดิมที่คุณมี)
    const realDataSample = [
        { owner: "Riikame_", wish: "อยากมีคนเลี้ยงไอติมมิ้นช็อคชิพทุกวัน" },
        { owner: "Chanamnom", wish: "ขอให้มีหมูกระทะหล่นมาจากฟ้า" },
        { owner: "Oolong_BrownSugar", wish: "ขอให้ผมได้เพรชสีชมพู" },
        { owner: "Misaki_SakiZ", wish: "สาธุ99 ขอให้ไม่หลุดเรทเกมกาชา" },
        { owner: "RikoPrushka", wish: "ขอให้ความรักมีแต่ความสุขใจ" },
        { owner: "ultimatealpaca_", wish: "ขอให้มีลุงหล่อๆโสดๆเข้มๆเท่ๆ" },
        { owner: "scarecrow_vpk", wish: "ลาก่อน laptop พอดีพี่จ๋า ไม่ทำงานแล้ว" },
        { owner: "Nutty1999x20", wish: "ขอให้ไม่โดนบิด" },
        { owner: "AreyouArguide", wish: "ขอให้กระทงนี้อยู่ยงคงกระพัน" },
        { owner: "Extern_ton", wish: "ขอให้พระแม่คงคาดลบรรดาลให้มีความสุข" }
    ];

    const randomUser = realDataSample[Math.floor(Math.random() * realDataSample.length)];

    const analyzeSim = (text) => {
        const t = text.toLowerCase();
        if (/เงิน|รวย|หวย|กาชา|เกลือ|เรท|เพชร|โชค|divine|สาธุ/.test(t)) return 'money';
        if (/รัก|แฟน|หัวใจ|ชอบ|โสด|แต่งงาน|love|heart/.test(t)) return 'love';
        if (/กิน|อร่อย|หิว|หมูกระทะ|ชาบู|ข้าว|ขนม|น้ำเงี้ยว|มิ้นช็อค|ไก่/.test(t)) return 'food';
        if (/ผี|บิด|ปวดหลัง|นอน|งาน|ทุบ|สยอง|ตาย|laptop|ghost/.test(t)) return 'chaos';
        return 'default';
    };

    const rarityPool = [
        ...Array(50).fill('Common'),
        ...Array(30).fill('Uncommon'),
        ...Array(15).fill('Rare'),
        ...Array(4).fill('Epic'),
        'Mythic'
    ];
    const r = rarityPool[Math.floor(Math.random() * rarityPool.length)];

    const imageMap = {
        'Common': 'texture_0.png',
        'Uncommon': 'texture_1.png',
        'Rare': 'texture_2.png',
        'Epic': 'texture_3.png',
        'Mythic': 'texture_4.png'
    };

    let behavior = 'normal';
    if (r === 'Mythic' || r === 'Epic') behavior = 'energetic';
    else if (r === 'Uncommon') behavior = 'shy';

    const simulatedPayload = {
        owner: randomUser.owner,
        wish: randomUser.wish,
        rarity: r,
        image: imageMap[r],
        behavior: behavior,
        bubbleType: analyzeSim(randomUser.wish),
        isNewYear: false
    };

    console.log(`🧪 Simulation: ${randomUser.owner} (${r})`);
    handleSpawnLogic(simulatedPayload);
});