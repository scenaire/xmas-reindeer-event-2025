const socket = io();
const app = new PIXI.Application({
    width: 1920,
    height: 1080,
    backgroundAlpha: 0,
    antialias: true
});
PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.NEAREST;
const GLOBAL_ANIMS = {
    common_idle: null,
    common_walk: null
};

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
        // 1. Snapshot: เก็บข้อมูลกวาง"ที่ยังอยู่บนจอ"จริงๆ
        respawnQueue = Object.values(activeReindeers)
            .filter(deer => !deer.destroyed && deer.state !== 'LEAVING')
            .map(deer => deer.data);

        // 2. สั่งวิ่ง (ไม่ต้องลบจาก activeReindeers ที่นี่ เดี๋ยวให้ destroyReindeerSprite ลบเองตอนพ้นจอ)
        Object.values(activeReindeers).forEach(deer => {
            if (deer.state === 'LEAVING') return; // ตัวไหนวิ่งอยู่แล้ว อย่าไปยุ่ง

            deer.state = 'LEAVING';
            if (data.type === 'RUN_LEFT') {
                deer.forceDirection = -1;
                deer.scale.x = -Math.abs(deer.scale.x);
            } else {
                deer.forceDirection = 1;
                deer.scale.x = Math.abs(deer.scale.x);
            }

            // 🚨 ลบบรรทัด delete activeReindeers[...] ออก! 
            // ให้ระบบมันจัดการตามธรรมชาติ เพื่อป้องกัน error การเข้าถึงตัวแปร
        });

        // 3. เริ่มนับถอยหลังเกิดใหม่
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

async function createReindeer(config) { // ⚠️ เพิ่ม async ตรงนี้ด้วยนะคะ
    let reindeer;

    // --- CASE 1: กวาง Common (ตัวดุ๊กดิ๊ก) ---
    if (config.image === 'texture_0.png') {
        const staticPath = `/assets/${config.image}`;
        const staticTexture = PIXI.Texture.from(staticPath);

        // สร้างตัวเปล่าๆ รอไว้ก่อน
        reindeer = new PIXI.AnimatedSprite([staticTexture]);

        // ตั้งค่า animData เริ่มต้น
        reindeer.animData = {
            idle: [staticTexture],
            walk: [staticTexture]
        };

        // ⚡ ฟังก์ชันโหลดท่า (แบบฉลาด: เช็คของกลางก่อน)
        const setupAnimations = async () => {
            // A. ท่า IDLE
            if (!GLOBAL_ANIMS.common_idle) {
                // ถ้าของกลางยังไม่มี -> ไปโหลดมาเก็บ
                GLOBAL_ANIMS.common_idle = await loadSpriteSheet('texture_0_idle.png', 6);
            }
            // เอาจากของกลางมาใส่ตัวกวาง
            if (GLOBAL_ANIMS.common_idle) {
                reindeer.animData.idle = GLOBAL_ANIMS.common_idle;
                // ถ้าสถานะเป็น IDLE อยู่ -> อัปเดตทันที
                if (reindeer.state === 'IDLE') {
                    reindeer.textures = reindeer.animData.idle;
                    reindeer.play();
                }
            }

            // B. ท่า WALK (ตัวปัญหา!)
            if (!GLOBAL_ANIMS.common_walk) {
                // ถ้าของกลางยังไม่มี -> ไปโหลดมาเก็บ
                GLOBAL_ANIMS.common_walk = await loadSpriteSheet('texture_0_walk.png', 6);
            }
            if (GLOBAL_ANIMS.common_walk) {
                reindeer.animData.walk = GLOBAL_ANIMS.common_walk;
                // ถ้ากำลังวิ่งหรือเดินอยู่ -> อัปเดตทันที
                if (reindeer.state === 'WALK' || reindeer.state === 'ENTERING' || reindeer.state === 'LEAVING') {
                    reindeer.textures = reindeer.animData.walk;
                    reindeer.play();
                }
            }
        };

        setupAnimations(); // เรียกทำงาน
    }
    else {
        // --- CASE 2: กวาง Rare/Epic/Mythic ---
        const texture = PIXI.Texture.from(`/assets/${config.image}`);

        // ✅ สร้าง "กล่องเดียว" ใช้ร่วมกัน (Shared Array)
        const sharedAnim = [texture];

        reindeer = new PIXI.AnimatedSprite(sharedAnim);

        // ชี้ไปที่กล่องเดียวกันเป๊ะๆ (Reference เดียวกัน)
        reindeer.animData = {
            idle: sharedAnim,
            walk: sharedAnim, // ใช้รูปเดิมแทนท่าเดิน
            run: sharedAnim
        };

        // ✅ ถ้ามีเฟรมเดียว ไม่ต้องสั่ง play() และปรับ speed เป็น 0
        reindeer.animationSpeed = 0;
        // reindeer.play(); // ไม่ต้อง play
    }

    // ตั้งค่าพื้นฐาน (เหมือนเดิม)
    reindeer.texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
    reindeer.anchor.set(0.5);

    // Scale
    let scaleValue = 2;
    if (config.rarity === 'Mythic') scaleValue = 2.3;
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

    // ✅ แก้ไข: ถ้ามี wish ให้โชว์บรรทัดล่าง ถ้าไม่มีให้โชว์แค่ชื่อ
    let tagText = config.owner;
    if (config.wish && config.wish !== "") {
        tagText += `\n"${config.wish}"`;
    }

    const nameTag = new PIXI.Text(tagText, nameStyle); // ใช้ข้อความที่จัดแล้ว

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

    // --- Animation Loop (ฉบับแก้ไข: ลื่นไหล + ตัดส่วนเกิน) ---
    const tick = (delta) => {
        if (reindeer.destroyed) return;

        // 1. จัดลำดับความลึก (Z-Index)
        reindeer.zIndex = reindeer.y;

        // ------------------------------------------------------------------
        // 🎞️ A. ส่วนจัดการอนิเมชั่น (บังคับใช้ Walk ตลอดกาล เพื่อความลื่น)
        // ------------------------------------------------------------------
        if (reindeer.animData) {
            // ค่า Default
            let targetAnim = reindeer.animData.idle;
            let targetAnimSpeed = 0.05;

            // เช็คสถานะ: ถ้าเดิน, เข้าฉาก, หรือวิ่งหนี -> ใช้ท่า WALK ทั้งหมด
            if (reindeer.state === 'WALK' || reindeer.state === 'ENTERING' || reindeer.state === 'LEAVING') {

                // กันเหนียว: ถ้าไม่มีท่า Walk ให้ใช้ Idle แทน (กัน Error)
                targetAnim = reindeer.animData.walk || reindeer.animData.idle;

                // ปรับความเร็วขา (Animation Speed)
                if (reindeer.state === 'LEAVING') {
                    targetAnimSpeed = 0.2;  // วิ่งหนี: ซอยขาเร็วๆ
                } else {
                    targetAnimSpeed = 0.1;  // เดินปกติ: ซอยขานุ่มๆ
                }
            }

            // สลับรูป (Switch Texture) แค่ครั้งเดียวตอนเปลี่ยนท่า
            if (targetAnim && targetAnim.length > 0 && reindeer.textures !== targetAnim) {
                reindeer.textures = targetAnim;
                reindeer.play();
            }

            // ✅ แก้ไข: ถ้ามีแค่ 1 เฟรม (กวาง Rare) ให้ความเร็วเป็น 0 ไปเลย (ประหยัด CPU)
            if (reindeer.textures.length === 1) {
                reindeer.animationSpeed = 0;
            } else {
                reindeer.animationSpeed = targetAnimSpeed; // ใช้ความเร็วที่คำนวณมา (0.1 หรือ 0.2)
            }
        }

        // ------------------------------------------------------------------
        // 🏃‍♂️ B. ส่วนการเคลื่อนที่ (Physics & Movement)
        // ------------------------------------------------------------------

        // 1. แรงโน้มถ่วง / ลอยตัว (Zero Gravity)
        if (reindeer.isZeroGravity) {
            reindeer.x += (reindeer.driftX || 0) * delta;
            reindeer.y += (reindeer.driftY || 0) * delta;

            // Sine Wave นุ่มๆ
            const floatY = Math.sin((Date.now() / 600) + reindeer.floatOffset) * 0.5;
            reindeer.y += floatY * delta;

            reindeer.rotation += (reindeer.rotSpeed || 0) * delta;

            // กันหลุดขอบบน-ล่าง
            const topLimit = -100;
            const floorLimit = reindeer.startY;
            if (reindeer.y < topLimit) { reindeer.y = topLimit; reindeer.driftY = Math.abs(reindeer.driftY); }
            if (reindeer.y > floorLimit) { reindeer.y = floorLimit; reindeer.driftY = -Math.abs(reindeer.driftY); }
        }
        else {
            // โหมดปกติ: แรงโน้มถ่วง
            if (reindeer.rotation !== 0) reindeer.rotation = 0; // รีเซ็ตมุม

            if (reindeer.velocityY !== 0 || reindeer.y < reindeer.startY) {
                reindeer.y += reindeer.velocityY * delta;
                reindeer.velocityY += 0.8 * delta; // Gravity

                if (reindeer.y > reindeer.startY) {
                    reindeer.y = reindeer.startY;
                    reindeer.velocityY = 0;
                }
            }
        }

        // 2. การเคลื่อนที่ตามสถานะ (State Movement)
        if (reindeer.state === 'ENTERING') {
            // 🟢 เดินเข้าฉาก
            reindeer.x += 2 * delta; // ความเร็วคงที่ (2)
            reindeer.scale.x = Math.abs(reindeer.scale.x); // หันขวา

            if (reindeer.x >= reindeer.targetX) {
                reindeer.state = 'IDLE';
                reindeer.waitTime = 30;
            }
            nameTag.alpha = 1;
        }
        else if (reindeer.state === 'LEAVING') {
            // 🔴 วิ่งออกจากฉาก (กลับมาใช้แบบ Linear ไม่มีการเร่งเครื่อง)
            nameTag.alpha = 1;

            const runSpeed = 10; // ความเร็วคงที่ (ปรับลดจาก 12 เพื่อความนุ่ม)
            const dir = reindeer.forceDirection || 1;

            reindeer.x += dir * runSpeed * delta;

            // หันหน้าตามทิศ
            if (dir > 0) reindeer.scale.x = Math.abs(reindeer.scale.x);
            else reindeer.scale.x = -Math.abs(reindeer.scale.x);

            // เช็คพ้นจอ (Check Out of Bounds)
            const isGoneRight = (dir > 0 && reindeer.x > 2100);
            const isGoneLeft = (dir < 0 && reindeer.x < -300);

            if (isGoneRight || isGoneLeft) {
                if (reindeer.onGoneCallback) reindeer.onGoneCallback();
                destroyReindeerSprite(reindeer);
            }
        }
        else if (reindeer.forceDirection !== 0) {
            // กรณีโดนสั่งแต่ไม่ได้เข้า state LEAVING (เผื่อไว้)
            reindeer.x += reindeer.forceDirection * 8 * delta;
        }
        else {
            // 🔵 เดินเล่นปกติ (Wander)
            updateWanderBehavior(reindeer, delta);

            // Fade ชื่อ
            if (reindeer.nameTagFadeDelay > 0) {
                reindeer.nameTagFadeDelay -= delta;
                nameTag.alpha = 1;
            } else if (nameTag.alpha > 0) {
                nameTag.alpha -= 0.02 * delta;
            }
        }

        // ------------------------------------------------------------------
        // 📺 C. ส่วนจัดการหน้าจอ (Screen Wrap & UI)
        // ------------------------------------------------------------------

        // วาร์ปข้ามจอ (ทำงานเฉพาะตอนไม่ได้ลอย และไม่ได้กำลังเข้า/ออก)
        if (reindeer.state !== 'LEAVING' && reindeer.state !== 'ENTERING' && !reindeer.isZeroGravity) {
            const screenWidth = 1920;
            const buffer = 50;
            if (reindeer.x > screenWidth + buffer) { reindeer.x = -buffer; reindeer.state = 'IDLE'; }
            else if (reindeer.x < -buffer) { reindeer.x = screenWidth + buffer; reindeer.state = 'IDLE'; }
        }

        // จัดการ NameTag
        if (reindeer.scale.x < 0) nameTag.scale.x = -1;
        else nameTag.scale.x = 1;

        nameTag.rotation = -reindeer.rotation; // ชื่อตั้งตรงตลอด
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

// 🛠️ Helper: โหลดและตัด Sprite Sheet แบบสำเร็จรูป
async function loadSpriteSheet(path, frameCount) {
    const url = `/assets/${path}?v=${Date.now()}`; // กัน Cache

    try {
        const sheetTexture = await PIXI.Assets.load(url);
        const base = sheetTexture.baseTexture;

        if (!base.valid || base.width === 0) return null;

        const frameWidth = Math.floor(base.width / frameCount);
        const frameHeight = base.height;
        const frames = [];

        for (let i = 0; i < frameCount; i++) {
            const rect = new PIXI.Rectangle(i * frameWidth, 0, frameWidth, frameHeight);
            frames.push(new PIXI.Texture(base, rect));
        }
        return frames;
    } catch (err) {
        console.error(`Failed to load ${path}:`, err);
        return null;
    }
}

// --- 🧪 DEV TOOLS: แผงควบคุมการทดสอบ ---

function createTestPanel() {
    // สร้างกล่องเครื่องมือมุมจอ
    const panel = document.createElement('div');
    panel.style.cssText = "position: fixed; top: 10px; left: 10px; z-index: 9999; background: rgba(0,0,0,0.7); padding: 10px; border-radius: 8px; color: white; font-family: sans-serif; display: flex; flex-direction: column; gap: 5px;";

    // หัวข้อ
    const title = document.createElement('div');
    title.innerText = "🦌 Reindeer Debugger";
    title.style.fontWeight = "bold";
    title.style.marginBottom = "5px";
    panel.appendChild(title);

    // ฟังก์ชันสร้างปุ่ม
    const addBtn = (label, color, onClick) => {
        const btn = document.createElement('button');
        btn.innerText = label;
        btn.style.cssText = `cursor: pointer; background: ${color}; border: none; padding: 5px 10px; color: white; border-radius: 4px; font-size: 12px;`;
        btn.onclick = onClick;
        panel.appendChild(btn);
    };

    // 1. ปุ่มเสก Common (เช็คท่าเดิน)
    addBtn("🟢 Spawn Common (Walk Test)", "#2ecc71", () => {
        spawnTestDeer('Common');
    });

    // 2. ปุ่มเสก Rare (เช็คเอฟเฟคหิมะ)
    addBtn("❄️ Spawn Rare (Snow)", "#3498db", () => {
        spawnTestDeer('Rare');
    });

    // 3. ปุ่มเสก Mythic (เช็ค RGB)
    addBtn("🌈 Spawn Mythic (RGB)", "#9b59b6", () => {
        spawnTestDeer('Mythic');
    });

    // 4. ปุ่ม Run Left (เช็คบัคค้าง)
    addBtn("🏃‍♂️ Run Left", "#e67e22", () => {
        console.log("🧪 Testing Run Left...");
        // จำลองข้อมูลเหมือนส่งมาจาก Server เป๊ะๆ
        const socketData = { type: 'RUN_LEFT' };

        // เรียกใช้ logic เดียวกับที่รับจาก socket (ต้องแก้โค้ด socket ให้แยกฟังก์ชัน handleCommand ออกมาจะดีมาก)
        // แต่เพื่อความง่าย เราจะ emit event ปลอมๆ เข้า socket client เลย
        socket.io.engine.emit('packet', { type: 2, data: ['command', socketData], nsp: '/' });
        // หมายเหตุ: บรรทัดบนเป็นการ Hack Socket นิดหน่อย ถ้าไม่ได้ผล ให้ใช้วิธีเรียกฟังก์ชันตรงๆ แทน

        // วิธีสำรอง: เรียกผ่านตัวแปร global (ถ้าเราแยกฟังก์ชันไว้)
        // หรือจะก๊อป logic มาเทสตรงนี้ก็ได้ แต่แนะนำให้ลองกดผ่าน Twitch จริงๆ ด้วย
        alert("กดปุ่มนี้อาจจะไม่เหมือนจริง 100% แนะนำให้พิมพ์ !reindeer run left ในแชท Twitch ดีกว่าครับ");
    });

    // 5. ปุ่ม Clear All
    addBtn("❌ Kill All", "#c0392b", () => {
        Object.values(activeReindeers).forEach(deer => destroyReindeerSprite(deer));
        // เคลียร์ค่าใน Object ด้วย
        for (let key in activeReindeers) delete activeReindeers[key];
    });

    document.body.appendChild(panel);
}

// ฟังก์ชันช่วยเสก (Helper)
function spawnTestDeer(rarity) {
    const imageMap = {
        'Common': 'texture_0.png',
        'Rare': 'texture_2.png',
        'Mythic': 'texture_4.png'
    };

    // สุ่มชื่อและคำขอ
    const wishes = ["เดินสวยไหม?", "เทสๆ 123", "ขอกินขนมหน่อย", ""];
    const randomWish = wishes[Math.floor(Math.random() * wishes.length)];

    const payload = {
        owner: `TestUser_${Math.floor(Math.random() * 1000)}`,
        wish: randomWish,
        rarity: rarity,
        image: imageMap[rarity] || 'texture_0.png',
        bubbleType: randomWish ? 'default' : 'none',
        behavior: 'normal'
    };

    console.log(`🧪 Spawning ${rarity}...`);
    handleSpawnLogic(payload);
}

// เรียกสร้างปุ่มทันที
createTestPanel();
