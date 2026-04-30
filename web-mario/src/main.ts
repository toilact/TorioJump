import './style.css'

const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

// --- Configuration ---
const PIXELS_PER_UNIT = 40;
const config = {
  maxSpeed: 10 * PIXELS_PER_UNIT,
  acceleration: 50 * PIXELS_PER_UNIT,
  deceleration: 50 * PIXELS_PER_UNIT,
  friction: 70 * PIXELS_PER_UNIT,
  jumpForce: 15 * PIXELS_PER_UNIT,
  jumpCutMultiplier: 3.5,
  fallGravityMultiplier: 4.5,
  riseGravityMultiplier: 2.2,
  apexThreshold: 2 * PIXELS_PER_UNIT,
  apexGravityMultiplier: 0.4,
  apexBonusSpeed: 2 * PIXELS_PER_UNIT,
  coyoteTime: 0.15,
  jumpBufferTime: 0.15,
  defaultGravity: 25 * PIXELS_PER_UNIT,
};

// --- State ---
const player = {
  x: 50, y: 700, width: 32, height: 48,
  velX: 0, velY: 0,
  isGrounded: false, isJumping: false, jumpReleased: false,
  coyoteTimeCounter: 0, jumpBufferCounter: 0, jumpsRemaining: 2,
};

const keys: { [key: string]: boolean } = {};
const platforms = [
  { x: 0, y: 750, w: 200, h: 50 },
  { x: 250, y: 680, w: 60, h: 20 },
  { x: 400, y: 600, w: 60, h: 20 },
  { x: 200, y: 520, w: 60, h: 20 },
  { x: 450, y: 440, w: 300, h: 20, isMoving: true, startX: 450, range: 250 },
  { x: 850, y: 520, w: 120, h: 20 },
  { x: 1050, y: 450, w: 60, h: 20 },
  { x: 800, y: 350, w: 150, h: 20 },
  { x: 1050, y: 250, w: 100, h: 20 },
  { x: 0, y: 795, w: 1200, h: 10 }, // Pit floor
];

const goal = { x: 1080, y: 180, w: 40, h: 60 };
const meteorites: { x: number, y: number, w: number, h: number, active: boolean }[] = [];
const trollTriggers = [ { x: 300, spawned: false }, { x: 700, spawned: false }, { x: 950, spawned: false } ];
const npc = { x: 850, y: 480, w: 30, h: 40, shootTimer: 0 };
const bullets: { x: number, y: number, vx: number, vy: number, active: boolean }[] = [];

const BULLET_SPEED = 400;
const SHOOT_INTERVAL = 1.2;

let playerName = "Challenger";
let gameStarted = false;
let isFakeWinning = false;
let fakeWinTimer = 0;
let animationTime = 0;
let lastTime = 0;
let messageTimeout: number | undefined;

const airBullets: {x: number, y: number, vx: number, vy: number, active: boolean}[] = [];

let deathCount = parseInt(localStorage.getItem('torio_deaths') || '0');
let bestGoalScore = parseInt(localStorage.getItem('torio_best_goal') || '0');
let isGunEvolved = false;
let gunEvolutionLevel = 0;

const lavaParticles: {x: number, y: number, vx: number, vy: number, active: boolean}[] = [];
let volcanoTimer = 7;

const dragon = { 
  x: 600, y: -200, active: true, phase: 'chase' as 'chase' | 'snap', 
  segments: Array.from({length: 40}, (_, i) => ({x: 600, y: -200 - i * 20})),
};

// --- Audio ---
const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
function playJumpSound() {
  const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
  osc.type = 'triangle'; osc.frequency.setValueAtTime(150, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.1);
  gain.gain.setValueAtTime(0.05, audioCtx.currentTime); gain.connect(audioCtx.destination);
  osc.connect(gain); osc.start(); osc.stop(audioCtx.currentTime + 0.1);
}
function playDeathSound() {
  const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
  osc.type = 'sawtooth'; osc.frequency.setValueAtTime(300, audioCtx.currentTime);
  osc.frequency.linearRampToValueAtTime(50, audioCtx.currentTime + 0.3);
  gain.gain.setValueAtTime(0.05, audioCtx.currentTime); gain.connect(audioCtx.destination);
  osc.connect(gain);    osc.start(); osc.stop(audioCtx.currentTime + 0.3);
}

function playAirCannonSound() {
  const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
  osc.type = 'sine'; osc.frequency.setValueAtTime(200, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.2);
  gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
  osc.connect(gain); gain.connect(audioCtx.destination);
  osc.start(); osc.stop(audioCtx.currentTime + 0.2);
}

function playBackgroundMusic() {
  const notes = [261.63, 329.63, 392.00, 523.25, 349.23, 440.00, 523.25, 659.25]; 
  const sequence = [0, 2, 1, 3, 4, 6, 5, 7];
  let step = 0;
  function nextNote() {
    if (!gameStarted) return;
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.type = 'square'; osc.frequency.setValueAtTime(notes[sequence[step % sequence.length]], audioCtx.currentTime);
    gain.gain.setValueAtTime(0.015, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.4);
    step++; setTimeout(nextNote, 250);
  }
  nextNote();
}

function updateDeathCount() {
  const el = document.getElementById('death-count');
  if (el) el.innerText = deathCount.toString();
  localStorage.setItem('torio_deaths', deathCount.toString());
}
function updateBestScore() {
  const el = document.getElementById('best-goal');
  if (el) el.innerText = bestGoalScore.toString();
  localStorage.setItem('torio_best_goal', bestGoalScore.toString());
}
updateDeathCount();
updateBestScore();

// --- UI & Logic ---
const messageOverlay = document.getElementById('message-overlay')!;
const messageText = document.getElementById('message-text')!;
const loginScreen = document.getElementById('login-screen')!;
const nameInput = document.getElementById('player-name-input') as HTMLInputElement;
const startBtn = document.getElementById('start-game-btn')!;
const badges = {
  grounded: document.getElementById('grounded-badge')!,
  coyote: document.getElementById('coyote-badge')!,
  buffer: document.getElementById('buffer-badge')!,
  apex: document.getElementById('apex-badge')!,
  double: document.getElementById('double-jump-badge')!,
};

startBtn.addEventListener('click', () => {
  playerName = nameInput.value.trim() || "Challenger";
  loginScreen.classList.add('hidden');
  gameStarted = true;
  audioCtx.resume().then(() => playBackgroundMusic());
});

window.addEventListener('keydown', (e) => {
  if (keys[e.code]) return;
  keys[e.code] = true;
  if (e.code === 'KeyR') respawn();
  if (['Space', 'KeyW', 'ArrowUp'].includes(e.code)) {
    player.jumpBufferCounter = config.jumpBufferTime;
    if (!player.isGrounded && player.jumpsRemaining > 0) executeJump(true);
  }
  if (e.code === 'KeyB') shootAirCannon();
});
window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
  if (['Space', 'KeyW', 'ArrowUp'].includes(e.code)) player.jumpReleased = true;
});

function showMessage(text: string, duration: number) {
  messageText.innerText = text; messageText.classList.remove('huge');
  messageOverlay.classList.remove('hidden');
  if (messageTimeout) clearTimeout(messageTimeout);
  messageTimeout = window.setTimeout(() => messageOverlay.classList.add('hidden'), duration);
}

function executeJump(isDoubleJump: boolean) {
  playJumpSound();
  player.isJumping = true; player.jumpBufferCounter = 0;
  player.coyoteTimeCounter = 0; player.jumpReleased = false; player.jumpsRemaining--;
  player.velY = isDoubleJump ? -config.jumpForce * 1.2 : -config.jumpForce;
}

function shootAirCannon() {
  playAirCannonSound();
  const lookDir = Math.sign(player.velX || 1);
  airBullets.push({
    x: player.x + player.width / 2 + 20 * lookDir,
    y: player.y + player.height / 2,
    vx: lookDir * 800,
    vy: 0,
    active: true
  });
}

function checkPlatformCollisions(horizontal: boolean) {
  for (const plat of platforms) {
    if (player.x < plat.x + plat.w && player.x + player.width > plat.x &&
        player.y < plat.y + plat.h && player.y + player.height > plat.y) {
      if (horizontal) {
        player.x = (player.velX > 0) ? plat.x - player.width : plat.x + plat.w;
        player.velX = 0;
      } else {
        if (player.velY > 0) {
          player.y = plat.y - player.height; player.isGrounded = true;
          if ((plat as any).isMoving) player.x += Math.cos(animationTime * 2) * (plat as any).range * 0.03;
        } else { player.y = plat.y + plat.h; }
        player.velY = 0;
      }
    }
  }
}

function update(dt: number) {
  animationTime += dt;
  if (player.jumpBufferCounter > 0) player.jumpBufferCounter -= dt;
  if (player.coyoteTimeCounter > 0) player.coyoteTimeCounter -= dt;

  platforms.forEach((p: any) => { if (p.isMoving) p.x = p.startX + Math.sin(animationTime * 2) * p.range; });

  let inputX = isFakeWinning ? 0 : (keys['ArrowLeft'] || keys['KeyA'] ? -1 : (keys['ArrowRight'] || keys['KeyD'] ? 1 : 0));
  const isAtApex = !player.isGrounded && Math.abs(player.velY) < config.apexThreshold;
  let targetSpeed = inputX * (config.maxSpeed + (isAtApex ? config.apexBonusSpeed : 0));
  let accelRate = Math.abs(targetSpeed) > 0.01 ? (Math.sign(targetSpeed) !== Math.sign(player.velX) ? config.friction : config.acceleration) : config.deceleration;
  player.velX += (targetSpeed - player.velX) * accelRate * dt / config.maxSpeed;

  let gravScale = player.isGrounded ? 0 : (isAtApex ? config.apexGravityMultiplier : (player.velY < 0 ? (player.jumpReleased ? config.jumpCutMultiplier : config.riseGravityMultiplier) : config.fallGravityMultiplier));
  player.velY += config.defaultGravity * gravScale * dt;

  if (!isFakeWinning && player.jumpBufferCounter > 0 && player.coyoteTimeCounter > 0 && !player.isJumping) executeJump(false);

  player.x += player.velX * dt; checkPlatformCollisions(true);
  player.y += player.velY * dt; player.isGrounded = false; checkPlatformCollisions(false);

  if (player.y > canvas.height + 100) { 
    deathCount++; updateDeathCount();
    playDeathSound(); showMessage(`${playerName} Gà Quá Haha`, 1500); respawn(); 
  }

  if (!isFakeWinning && player.x < goal.x + goal.w && player.x + player.width > goal.x && player.y < goal.y + goal.h && player.y + player.height > goal.y) {
    isFakeWinning = true; isGunEvolved = true; gunEvolutionLevel++; fakeWinTimer = 0; 
    if (gunEvolutionLevel > bestGoalScore) {
      bestGoalScore = gunEvolutionLevel;
      updateBestScore();
    }
    showMessage(`GUN EVOLVED LVL ${gunEvolutionLevel}! ⚡️⚡️`, 3000);
  }

  if (isFakeWinning) {
    fakeWinTimer += dt;
    if (fakeWinTimer > 3) isFakeWinning = false;
  }

  // Dragon Chase Logic
  if (dragon.active) {
    const targetX = player.x + player.width / 2;
    const targetY = player.y + player.height / 2;
    const dx = targetX - dragon.x;
    const dy = targetY - dragon.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const speed = 120;
    
    dragon.x += (dx / dist) * speed * dt;
    dragon.y += (dy / dist) * speed * dt;

    dragon.segments[0] = {x: dragon.x, y: dragon.y};
    for(let i = 1; i < dragon.segments.length; i++) {
      const segDx = dragon.segments[i-1].x - dragon.segments[i].x;
      const segDy = dragon.segments[i-1].y - dragon.segments[i].y;
      const segDist = Math.sqrt(segDx * segDx + segDy * segDy);
      if (segDist > 15) {
        dragon.segments[i].x += segDx * 0.2;
        dragon.segments[i].y += segDy * 0.2;
      }
      dragon.segments[i].x += Math.sin(animationTime * 3 + i) * 1.5;
    }

    // Dragon Collision
    if (dist < 40) {
      deathCount++; updateDeathCount();
      playDeathSound(); showMessage(`${playerName} Gà Quá Haha`, 1500); respawn();
    }
  }

  trollTriggers.forEach(t => { if (!t.spawned && player.x > t.x) { t.spawned = true; meteorites.push({ x: player.x, y: -100, w: 40, h: 40, active: true }); } });
  meteorites.forEach(m => {
    if (m.active) {
      m.y += 600 * dt;
      if (player.x < m.x + m.w && player.x + player.width > m.x && player.y < m.y + m.h && player.y + player.height > m.y) {
        playDeathSound(); showMessage(`${playerName} Gà Quá Haha`, 1500); respawn(); m.active = false; isFakeWinning = false;
      }
      if (m.y > canvas.height) { m.active = false; if (isFakeWinning) isFakeWinning = false; }
    }
  });

  npc.shootTimer -= dt;
  if (npc.shootTimer <= 0) {
    npc.shootTimer = isGunEvolved ? SHOOT_INTERVAL / 3 : SHOOT_INTERVAL;
    const dx = (player.x + player.width / 2) - (npc.x + npc.w / 2);
    const dy = (player.y + player.height / 2) - (npc.y + npc.h / 2);
    const dist = Math.sqrt(dx * dx + dy * dy);
    bullets.push({ x: npc.x + npc.w / 2, y: npc.y + npc.h / 2, vx: (dx / dist) * BULLET_SPEED, vy: (dy / dist) * BULLET_SPEED, active: true });
  }
  bullets.forEach(b => {
    if (b.active) {
      if (isGunEvolved) {
        const dx = (player.x + player.width / 2) - b.x;
        const dy = (player.y + player.height / 2) - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        b.vx += (dx / dist) * 500 * dt;
        b.vy += (dy / dist) * 500 * dt;
        const vDist = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        b.vx = (b.vx / vDist) * BULLET_SPEED;
        b.vy = (b.vy / vDist) * BULLET_SPEED;
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      const bRadius = 8 * Math.pow(1.5, gunEvolutionLevel);
      if (player.x < b.x + bRadius && player.x + player.width > b.x - bRadius && player.y < b.y + bRadius && player.y + player.height > b.y - bRadius) {
        deathCount++; updateDeathCount();
        playDeathSound(); showMessage(`${playerName} Gà Quá Haha`, 1500); respawn(); b.active = false;
      }
      // Collision with Air Bullets
      airBullets.forEach(ab => {
        if (ab.active) {
          const dx = ab.x - b.x; const dy = ab.y - b.y;
          if (Math.sqrt(dx*dx + dy*dy) < bRadius + 15) { b.active = false; ab.active = false; }
        }
      });
      if (b.x < -100 || b.x > canvas.width + 100 || b.y < -100 || b.y > canvas.height + 100) b.active = false;
    }
  });

  airBullets.forEach(ab => {
    if (ab.active) {
      ab.x += ab.vx * dt;
      if (ab.x < -50 || ab.x > canvas.width + 50) ab.active = false;
    }
  });

  // Volcano Eruption Logic
  volcanoTimer -= dt;
  if (volcanoTimer <= 0) {
    volcanoTimer = 7;
    showMessage("VOLCANO ERUPTION! 🌋🔥", 2000);
    for(let i=0; i<30; i++) {
      lavaParticles.push({
        x: Math.random() * canvas.width,
        y: canvas.height + 20,
        vx: (Math.random() - 0.5) * 400,
        vy: -Math.random() * 800 - 400,
        active: true
      });
    }
  }

  lavaParticles.forEach(p => {
    if (p.active) {
      p.vy += 800 * dt; // Gravity for lava
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      
      const dx = (player.x + player.width/2) - p.x;
      const dy = (player.y + player.height/2) - p.y;
      if (Math.sqrt(dx*dx + dy*dy) < 25) {
        deathCount++; updateDeathCount();
        playDeathSound(); showMessage(`${playerName} Gà Quá Haha`, 1500); respawn();
        p.active = false;
      }
      if (p.y > canvas.height + 100) p.active = false;
    }
  });

  if (player.isGrounded) { player.coyoteTimeCounter = config.coyoteTime; player.isJumping = false; player.velY = 0; player.jumpsRemaining = 2; }
  updateUI(isAtApex);
}

function respawn() {
  player.x = 50; player.y = 700; player.velX = 0; player.velY = 0;
  trollTriggers.forEach(t => t.spawned = false); meteorites.length = 0; bullets.length = 0; airBullets.length = 0; npc.shootTimer = SHOOT_INTERVAL;
  dragon.x = 600; dragon.y = -200; dragon.segments.forEach(s => { s.x = 600; s.y = -200; });
  // gunEvolutionLevel is NOT reset as per request
}

function updateUI(isAtApex: boolean) {
  badges.grounded.classList.toggle('active', player.isGrounded);
  badges.coyote.classList.toggle('active', player.coyoteTimeCounter > 0 && !player.isGrounded);
  badges.buffer.classList.toggle('active', player.jumpBufferCounter > 0);
  badges.apex.classList.toggle('active', isAtApex);
  badges.double.classList.toggle('active', player.jumpsRemaining > 0 && !player.isGrounded);
  const fps = document.getElementById('fps-counter'); if (fps) fps.innerText = "LIVE";
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground();
  for (const plat of platforms) {
    const isPit = plat.y > 470; ctx.fillStyle = isPit ? '#f43f5e' : '#1e293b';
    ctx.beginPath(); ctx.roundRect(plat.x, plat.y, plat.w, plat.h, 4); ctx.fill();
    if (!isPit) { ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1; ctx.stroke(); ctx.fillStyle = 'rgba(56, 189, 248, 0.1)'; ctx.fillRect(plat.x, plat.y, plat.w, 4); }
  }
  ctx.save(); ctx.shadowBlur = 30; ctx.shadowColor = '#38bdf8'; ctx.fillStyle = '#0f172a'; ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(goal.x, goal.y, goal.w, goal.h, 10); ctx.fill(); ctx.stroke();
  ctx.translate(goal.x + goal.w/2, goal.y + goal.h/2); ctx.rotate(animationTime * 2); ctx.fillStyle = '#38bdf8'; ctx.fillRect(-10, -10, 20, 20); ctx.restore();

  meteorites.forEach(m => {
    if (m.active) {
      const radius = m.w / 2; ctx.save(); ctx.shadowBlur = m.w > 100 ? 50 : 20; ctx.shadowColor = '#f43f5e';
      const grad = ctx.createRadialGradient(m.x + radius, m.y + radius, 0, m.x + radius, m.y + radius, radius);
      grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.3, '#f43f5e'); grad.addColorStop(1, '#450a0a');
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(m.x + radius, m.y + radius, radius, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  });
  
  drawPikachu();

  ctx.fillStyle = '#facc15'; // Golden Yellow
  bullets.forEach(b => { 
    if (b.active) { 
      const r = 4 * Math.pow(1.5, gunEvolutionLevel);
      ctx.save();
      ctx.shadowBlur = 15 + gunEvolutionLevel * 10; ctx.shadowColor = '#fef08a';
      ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.fill(); 
      // Add sparks
      ctx.strokeStyle = 'white'; ctx.lineWidth = 1;
      for(let i=0; i<3; i++) {
        ctx.beginPath();
        ctx.moveTo(b.x + (Math.random()-0.5)*r*2, b.y + (Math.random()-0.5)*r*2);
        ctx.lineTo(b.x + (Math.random()-0.5)*r*4, b.y + (Math.random()-0.5)*r*4);
        ctx.stroke();
      }
      ctx.restore();
    } 
  });

  // Draw Lava Particles
  lavaParticles.forEach(p => {
    if (p.active) {
      ctx.save();
      ctx.shadowBlur = 20; ctx.shadowColor = '#f97316';
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 10);
      grad.addColorStop(0, '#fff'); grad.addColorStop(0.5, '#fb923c'); grad.addColorStop(1, '#7c2d12');
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  });

  // Draw Player (Doraemon with Professional Limbs)
  ctx.save();
  ctx.translate(player.x + player.width / 2, player.y + player.height / 2);
  
  const lookDir = Math.sign(player.velX || 1);
  const isMov = Math.abs(player.velX) > 10;
  const swing = isMov ? Math.sin(animationTime * 15) : 0;
  const jO = !player.isGrounded ? -5 : 0;
  const r = player.width / 2;

  // Legs (White)
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  // Left Leg
  ctx.beginPath(); ctx.moveTo(-6, 10); ctx.lineTo(-8 + (isMov ? swing * 10 : 0), 22 + jO); ctx.stroke();
  // Right Leg
  ctx.beginPath(); ctx.moveTo(6, 10); ctx.lineTo(8 - (isMov ? swing * 10 : 0), 22 + jO); ctx.stroke();

  // Back Arm
  ctx.beginPath(); ctx.moveTo(-12 * lookDir, -5); ctx.lineTo(-18 * lookDir - (isMov ? swing * 10 : 0), 5); ctx.stroke();

  // Doraemon Body (Blue)
  ctx.fillStyle = '#38bdf8';
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  
  // White Belly/Face
  ctx.fillStyle = 'white';
  ctx.beginPath(); ctx.arc(0, 4, r * 0.8, 0, Math.PI * 2); ctx.fill();

  // Front Arm
  ctx.beginPath(); ctx.moveTo(12 * lookDir, -5); ctx.lineTo(18 * lookDir + (isMov ? swing * 10 : 0), 5); ctx.stroke();

  // Air Cannon (Cannon on hand)
  ctx.save();
  ctx.translate(18 * lookDir + (isMov ? swing * 10 : 0), 5);
  ctx.rotate(lookDir === 1 ? 0 : Math.PI);
  ctx.fillStyle = '#334155'; // Dark Grey
  ctx.beginPath();
  ctx.roundRect(0, -10, 25, 20, 5); ctx.fill();
  ctx.strokeStyle = '#64748b'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#1e293b'; ctx.beginPath(); ctx.arc(25, 0, 10, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // Red Nose
  ctx.fillStyle = '#ef4444';
  ctx.beginPath(); ctx.arc(lookDir * 6, 0, 4, 0, Math.PI * 2); ctx.fill();

  // Whiskers
  ctx.strokeStyle = 'black'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(lookDir * 6 + 4, 2); ctx.lineTo(lookDir * 6 + 15, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(lookDir * 6 + 4, 4); ctx.lineTo(lookDir * 6 + 15, 6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(lookDir * 6 - 4, 2); ctx.lineTo(lookDir * 6 - 15, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(lookDir * 6 - 4, 4); ctx.lineTo(lookDir * 6 - 15, 6); ctx.stroke();

  // Eyes
  ctx.fillStyle = 'white'; ctx.strokeStyle = 'black'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(lookDir * 4 - 5, -8, 6, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(lookDir * 4 + 5, -8, 6, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'black';
  ctx.beginPath(); ctx.arc(lookDir * 4 - 3, -6, 2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(lookDir * 4 + 7, -6, 2, 0, Math.PI * 2); ctx.fill();

  // Red Collar & Bell
  ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.roundRect(-r * 0.7, r * 0.6, r * 1.4, 6, 3); ctx.fill();
  ctx.fillStyle = '#facc15'; ctx.strokeStyle = '#854d0e'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(lookDir * 2, r * 0.85, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  ctx.restore();

  // Draw Air Bullets
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  airBullets.forEach(ab => {
    if (ab.active) {
      ctx.save(); ctx.shadowBlur = 10; ctx.shadowColor = 'white';
      ctx.beginPath(); ctx.arc(ab.x, ab.y, 15, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  });

  if (dragon.active) drawDragon();
}

function drawDragon() {
  ctx.save();
  // Body Segments (Shenron style)
  ctx.lineWidth = 30; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  
  // Outer Body (Dark Green)
  ctx.strokeStyle = '#064e3b'; 
  ctx.beginPath();
  ctx.moveTo(dragon.segments[0].x, dragon.segments[0].y);
  dragon.segments.forEach(s => ctx.lineTo(s.x, s.y));
  ctx.stroke();

  // Inner Body (Lighter Green)
  ctx.lineWidth = 15; ctx.strokeStyle = '#10b981';
  ctx.beginPath();
  ctx.moveTo(dragon.segments[0].x, dragon.segments[0].y);
  dragon.segments.forEach(s => ctx.lineTo(s.x, s.y));
  ctx.stroke();

  // Spikes (Red)
  ctx.fillStyle = '#ef4444';
  dragon.segments.forEach((s, i) => {
    if (i % 3 === 0) {
      ctx.beginPath();
      ctx.arc(s.x, s.y - 15, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // Dragon Head
  const head = dragon.segments[0];
  const next = dragon.segments[1];
  const angle = Math.atan2(head.y - next.y, head.x - next.x);
  
  ctx.translate(head.x, head.y);
  ctx.rotate(angle);

  // Head Shape
  ctx.fillStyle = '#065f46';
  ctx.beginPath();
  ctx.ellipse(20, 0, 35, 20, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eyes (Glow)
  ctx.fillStyle = '#facc15'; ctx.shadowBlur = 15; ctx.shadowColor = 'yellow';
  ctx.beginPath(); ctx.arc(15, -8, 5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(15, 8, 5, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;

  // Whiskers (Long)
  ctx.strokeStyle = '#fef08a'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(10, -5); ctx.bezierCurveTo(40, -40, 80, -20, 100, -60);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(10, 5); ctx.bezierCurveTo(40, 40, 80, 20, 100, 60);
  ctx.stroke();

  // Horns
  ctx.strokeStyle = '#92400e'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(-20, -30); ctx.lineTo(-15, -45); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(-20, 30); ctx.lineTo(-15, 45); ctx.stroke();

  ctx.restore();
}

function drawBackground() {
  const grad = ctx.createLinearGradient(0, 0, 0, 800); grad.addColorStop(0, '#020617'); grad.addColorStop(0.8, '#0f172a'); grad.addColorStop(1, '#450a0a');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.03)'; ctx.lineWidth = 1;
  for (let i = 0; i < 1200; i += 50) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 800); ctx.stroke(); }
}

function drawPikachu() {
  ctx.save();
  ctx.translate(npc.x + npc.w / 2, npc.y + npc.h / 2);
  
  // Body (Yellow)
  ctx.fillStyle = '#facc15';
  ctx.beginPath(); ctx.ellipse(0, 10, 15, 20, 0, 0, Math.PI * 2); ctx.fill();
  
  // Head (Yellow)
  ctx.beginPath(); ctx.arc(0, -10, 15, 0, Math.PI * 2); ctx.fill();
  
  // Ears
  ctx.lineWidth = 4; ctx.strokeStyle = '#facc15';
  // Left
  ctx.save(); ctx.rotate(-0.3);
  ctx.beginPath(); ctx.ellipse(-8, -25, 4, 12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'black'; ctx.beginPath(); ctx.ellipse(-8, -32, 4, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // Right
  ctx.save(); ctx.rotate(0.3);
  ctx.beginPath(); ctx.ellipse(8, -25, 4, 12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'black'; ctx.beginPath(); ctx.ellipse(8, -32, 4, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // Cheeks (Red)
  ctx.fillStyle = '#ef4444';
  ctx.beginPath(); ctx.arc(-10, -5, 4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(10, -5, 4, 0, Math.PI * 2); ctx.fill();

  // Eyes
  ctx.fillStyle = 'black';
  ctx.beginPath(); ctx.arc(-6, -12, 2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(6, -12, 2, 0, Math.PI * 2); ctx.fill();

  // Tail (Lightning bolt)
  ctx.strokeStyle = '#facc15'; ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(-15, 15); ctx.lineTo(-30, 5); ctx.lineTo(-25, 0); ctx.lineTo(-40, -15);
  ctx.stroke();

  ctx.restore();
}

function loop(time: number) {
  const dt = Math.min((time - lastTime) / 1000, 0.1); lastTime = time;
  if (gameStarted) update(dt);
  draw(); requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
