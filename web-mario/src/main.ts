import './style.css'

const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

// --- Configuration (Matching Unity Script) ---
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
  
  defaultGravity: 25 * PIXELS_PER_UNIT, // Base gravity in px/s^2
};

// --- State ---
const player = {
  x: 50,
  y: 400,
  width: 32,
  height: 48,
  velX: 0,
  velY: 0,
  
  isGrounded: false,
  isJumping: false,
  jumpReleased: false,
  
  coyoteTimeCounter: 0,
  jumpBufferCounter: 0,
  jumpsRemaining: 2, // Support for double jump
};

const keys: { [key: string]: boolean } = {};
const platforms = [
  { x: 0, y: 450, w: 150, h: 50 }, // Start
  { x: 200, y: 380, w: 40, h: 20 },  // Precision Step 1
  { x: 300, y: 320, w: 40, h: 20 },  // Precision Step 2
  { x: 100, y: 240, w: 40, h: 20 },  // Precision Step 3 (Backtrack)
  { x: 250, y: 160, w: 200, h: 20, isMoving: true, startX: 250, range: 200 }, // Moving Platform
  { x: 550, y: 220, w: 80, h: 20 },  // Mid Rest
  { x: 700, y: 150, w: 40, h: 20 },  // High precision
  { x: 500, y: 80, w: 100, h: 20 },  // Near Goal
  { x: 700, y: 50, w: 60, h: 20 },   // Goal Platform
  { x: 0, y: 480, w: 800, h: 20 },  // Death pit visualization
];

const goal = { x: 710, y: -10, w: 40, h: 60 }; 

// --- Troll Logic ---
const meteorites: { x: number, y: number, w: number, h: number, active: boolean }[] = [];
const trollTriggers = [
  { x: 220, spawned: false }, 
  { x: 500, spawned: false }, 
  { x: 680, spawned: false }, 
];

// --- NPC Shooter ---
const npc = { x: 550, y: 180, w: 30, h: 40, shootTimer: 0 }; 
const bullets: { x: number, y: number, vx: number, vy: number, active: boolean }[] = [];

let isFakeWinning = false;
let fakeWinTimer = 0;
let animationTime = 0;

// --- Audio System ---
const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
// ... (audio functions stay same)

// --- Input Handling ---
window.addEventListener('keydown', (e) => {
  if (keys[e.code]) return;
  keys[e.code] = true;
  if (e.code === 'KeyR') respawn(); // Quick restart
  if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') {
    player.jumpBufferCounter = config.jumpBufferTime;
    if (!player.isGrounded && player.jumpsRemaining > 0 && player.isJumping) {
      executeJump(true);
    }
  }
});

// ... (keyup stays same)

// --- UI Elements ---
const badges = {
  grounded: document.getElementById('grounded-badge')!,
  coyote: document.getElementById('coyote-badge')!,
  buffer: document.getElementById('buffer-badge')!,
  apex: document.getElementById('apex-badge')!,
  double: document.getElementById('double-jump-badge')!,
};

function playJumpSound() {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(150, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.1);
  gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.1);
}

function playDeathSound() {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(300, audioCtx.currentTime);
  osc.frequency.linearRampToValueAtTime(50, audioCtx.currentTime + 0.3);
  gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.3);
}

// --- Input Handling ---
window.addEventListener('keydown', (e) => {
  if (keys[e.code]) return; // Prevent repeat jump on hold
  keys[e.code] = true;
  if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') {
    player.jumpBufferCounter = config.jumpBufferTime;
    
    // Immediate Air Jump Logic (Double Jump)
    if (!player.isGrounded && player.jumpsRemaining > 0 && player.isJumping) {
      executeJump(true);
    }
  }
});

window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
  if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') {
    player.jumpReleased = true;
  }
});

// --- UI Elements ---
const badges = {
  grounded: document.getElementById('grounded-badge')!,
  coyote: document.getElementById('coyote-badge')!,
  buffer: document.getElementById('buffer-badge')!,
  apex: document.getElementById('apex-badge')!,
  double: document.getElementById('double-jump-badge')!,
};

const BULLET_SPEED = 400;
const SHOOT_INTERVAL = 1.0;

function update(dt: number) {
  animationTime += dt;
  // 1. Timers
  if (player.jumpBufferCounter > 0) player.jumpBufferCounter -= dt;
  if (player.coyoteTimeCounter > 0) player.coyoteTimeCounter -= dt;

  // Update Moving Platforms
  platforms.forEach((p: any) => {
    if (p.isMoving) {
      p.x = p.startX + Math.sin(animationTime * 2) * p.range;
    }
  });

  // 2. Horizontal Movement
  let inputX = 0;
  if (!isFakeWinning) {
    if (keys['ArrowLeft'] || keys['KeyA']) inputX -= 1;
    if (keys['ArrowRight'] || keys['KeyD']) inputX += 1;
  }

  let targetSpeed = inputX * config.maxSpeed;
  
  // Apex Bonus
  const isAtApex = !player.isGrounded && Math.abs(player.velY) < config.apexThreshold;
  if (isAtApex) {
    targetSpeed += inputX * config.apexBonusSpeed;
  }

  let accelRate;
  if (Math.abs(targetSpeed) > 0.01) {
    const isTurning = Math.sign(targetSpeed) !== Math.sign(player.velX) && Math.abs(player.velX) > 0.1;
    accelRate = isTurning ? config.friction : config.acceleration;
  } else {
    accelRate = config.deceleration;
  }

  const speedDif = targetSpeed - player.velX;
  player.velX += speedDif * accelRate * dt / config.maxSpeed; // Normalized feel

  // Simple clamping for web
  const currentMax = config.maxSpeed + (isAtApex ? config.apexBonusSpeed : 0);
  if (player.velX > currentMax) player.velX = currentMax;
  if (player.velX < -currentMax) player.velX = -currentMax;

  // 3. Gravity & Vertical Movement
  let gravScale = 1;

  if (!player.isGrounded) {
    if (isAtApex) {
      gravScale = config.apexGravityMultiplier;
    } else if (player.velY < 0) { // Jumping Up (Y is down in canvas)
      if (player.jumpReleased) {
        gravScale = config.jumpCutMultiplier;
      } else {
        gravScale = config.riseGravityMultiplier;
      }
    } else {
      gravScale = config.fallGravityMultiplier;
    }
  }

  if (!player.isGrounded) {
    player.velY += config.defaultGravity * gravScale * dt;
  }

  // 4. Jump Execution (Ground/Coyote)
  if (!isFakeWinning && player.jumpBufferCounter > 0 && player.coyoteTimeCounter > 0 && !player.isJumping) {
    executeJump(false);
  }

  // 5. Collision Detection
  player.x += player.velX * dt;
  checkPlatformCollisions(true);

  player.y += player.velY * dt;
  player.isGrounded = false;
  checkPlatformCollisions(false);

  // 6. Respawn Logic (Fall into hole)
  if (player.y > canvas.height + 100) {
    playDeathSound();
    showMessage(`${playerName} Gà Quá Haha`, 1500);
    respawn();
  }

  // 7. Goal Detection
  if (
    !isFakeWinning &&
    player.x < goal.x + goal.w &&
    player.x + player.width > goal.x &&
    player.y < goal.y + goal.h &&
    player.y + player.height > goal.y
  ) {
    isFakeWinning = true;
    fakeWinTimer = 0;
    player.velX = 0;
    player.velY = 0;
    showMessage("🖕", 5000); // 5 seconds of provocation
    messageText.classList.add('huge');
  }

  if (isFakeWinning) {
    fakeWinTimer += dt;
    player.velX = 0;
    player.velY = 0;
    
    // Spawn Giant Circular Meteorite after 3 seconds, so it hits around 5 seconds
    if (fakeWinTimer >= 3 && meteorites.filter(m => m.w > 100).length === 0) {
      meteorites.push({ x: player.x - 80, y: -400, w: 200, h: 200, active: true });
    }
  }

  // 8. Troll Logic
  trollTriggers.forEach(t => {
    if (!t.spawned && player.x > t.x) {
      t.spawned = true;
      meteorites.push({ x: player.x, y: -100, w: 40, h: 40, active: true });
    }
  });

  meteorites.forEach(m => {
    if (m.active) {
      m.y += 600 * dt; // Fall fast
      // Collision with player
      if (
        player.x < m.x + m.w &&
        player.x + player.width > m.x &&
        player.y < m.y + m.h &&
        player.y + player.height > m.y
      ) {
        playDeathSound();
        showMessage(`${playerName} Gà Quá Haha`, 1500);
        respawn();
        m.active = false;
        isFakeWinning = false;
      }
      if (m.y > canvas.height) {
        m.active = false;
        if (isFakeWinning) isFakeWinning = false; 
      }
    }
  });

  // 9. NPC Shooting
  npc.shootTimer -= dt;
  if (npc.shootTimer <= 0) {
    npc.shootTimer = SHOOT_INTERVAL;
    const dx = (player.x + player.width / 2) - (npc.x + npc.w / 2);
    const dy = (player.y + player.height / 2) - (npc.y + npc.h / 2);
    const dist = Math.sqrt(dx * dx + dy * dy);
    bullets.push({
      x: npc.x + npc.w / 2,
      y: npc.y + npc.h / 2,
      vx: (dx / dist) * BULLET_SPEED,
      vy: (dy / dist) * BULLET_SPEED,
      active: true
    });
  }

  bullets.forEach(b => {
    if (b.active) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (
        player.x < b.x + 8 &&
        player.x + player.width > b.x - 8 &&
        player.y < b.y + 8 &&
        player.y + player.height > b.y - 8
      ) {
        playDeathSound();
        showMessage(`${playerName} Gà Quá Haha`, 1500);
        respawn();
        b.active = false;
      }
      if (b.x < 0 || b.x > canvas.width || b.y < 0 || b.y > canvas.height) {
        b.active = false;
      }
    }
  });

  if (player.isGrounded) {
    player.coyoteTimeCounter = config.coyoteTime;
    player.isJumping = false;
    player.velY = 0;
    player.jumpsRemaining = 2; // Reset jumps on ground
  }

  updateUI(isAtApex);
}

function respawn() {
  player.x = 50;
  player.y = 400;
  player.velX = 0;
  player.velY = 0;
  // Reset trolls
  trollTriggers.forEach(t => t.spawned = false);
  meteorites.length = 0;
  bullets.length = 0;
  npc.shootTimer = SHOOT_INTERVAL;
}

const messageOverlay = document.getElementById('message-overlay')!;
const messageText = document.getElementById('message-text')!;
const loginScreen = document.getElementById('login-screen')!;
const nameInput = document.getElementById('player-name-input') as HTMLInputElement;
const startBtn = document.getElementById('start-game-btn')!;

let playerName = "Ngân";
let gameStarted = false;
let messageTimeout: number | undefined;

startBtn.addEventListener('click', () => {
  const input = nameInput.value.trim();
  if (input) {
    playerName = input;
    loginScreen.classList.add('hidden');
    gameStarted = true;
  } else {
    alert("Vui lòng nhập tên!");
  }
});

function showMessage(text: string, duration: number) {
  messageText.innerText = text;
  messageText.classList.remove('huge');
  messageOverlay.classList.remove('hidden');
  
  if (messageTimeout) clearTimeout(messageTimeout);
  messageTimeout = window.setTimeout(() => {
    messageOverlay.classList.add('hidden');
  }, duration);
}

function executeJump(isDoubleJump: boolean) {
  playJumpSound();
  player.isJumping = true;
  player.jumpBufferCounter = 0;
  player.coyoteTimeCounter = 0;
  player.jumpReleased = false;
  player.jumpsRemaining--;

  // Double jump is 1.2x stronger for that "twice as high" feel
  const force = isDoubleJump ? config.jumpForce * 1.2 : config.jumpForce;
  player.velY = -force;
}

function checkPlatformCollisions(horizontal: boolean) {
  for (const plat of platforms) {
    if (
      player.x < plat.x + plat.w &&
      player.x + player.width > plat.x &&
      player.y < plat.y + plat.h &&
      player.y + player.height > plat.y
    ) {
      if (horizontal) {
        if (player.velX > 0) player.x = plat.x - player.width;
        else if (player.velX < 0) player.x = plat.x + plat.w;
        player.velX = 0;
      } else {
        if (player.velY > 0) {
          player.y = plat.y - player.height;
          player.isGrounded = true;
          // Stick to moving platform
          if ((plat as any).isMoving) {
            player.x += Math.cos(animationTime * 2) * (plat as any).range * 2 * (1/60); 
          }
        } else if (player.velY < 0) {
          player.y = plat.y + plat.h;
        }
        player.velY = 0;
      }
    }
  }
}

function updateUI(isAtApex: boolean) {
  badges.grounded.classList.toggle('active', player.isGrounded);
  badges.coyote.classList.toggle('active', player.coyoteTimeCounter > 0 && !player.isGrounded);
  badges.buffer.classList.toggle('active', player.jumpBufferCounter > 0);
  badges.apex.classList.toggle('active', isAtApex);
  badges.double.classList.toggle('active', player.jumpsRemaining > 0 && !player.isGrounded);
  
  const fps = document.getElementById('fps-counter');
  if (fps) fps.innerText = `${Math.round(1/0.016)} FPS`; // Fixed display for "Live" feel
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawBackground();

  // Draw Platforms (High Tech Style)
  for (const plat of platforms) {
    const isPit = plat.y > 470;
    ctx.fillStyle = isPit ? '#f43f5e' : '#1e293b';
    ctx.beginPath();
    ctx.roundRect(plat.x, plat.y, plat.w, plat.h, 4);
    ctx.fill();
    
    if (!isPit) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1;
      ctx.stroke();
      // Glow line
      ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
      ctx.fillRect(plat.x, plat.y, plat.w, 4);
    }
  }

  // Draw Goal (Data Core)
  ctx.save();
  ctx.shadowBlur = 30;
  ctx.shadowColor = '#38bdf8';
  ctx.fillStyle = '#0f172a';
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(goal.x, goal.y, goal.w, goal.h, 10);
  ctx.fill();
  ctx.stroke();
  
  // Rotating Core inside Goal
  ctx.translate(goal.x + goal.w/2, goal.y + goal.h/2);
  ctx.rotate(animationTime * 2);
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(-10, -10, 20, 20);
  ctx.restore();

  // Draw Meteorites (Lava Orbs)
  meteorites.forEach(m => {
    if (m.active) {
      const radius = m.w / 2;
      ctx.save();
      ctx.shadowBlur = m.w > 100 ? 50 : 20; // Extra glow for giant one
      ctx.shadowColor = '#f43f5e';
      
      const grad = ctx.createRadialGradient(m.x + radius, m.y + radius, 0, m.x + radius, m.y + radius, radius);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.3, '#f43f5e');
      grad.addColorStop(1, '#450a0a');
      
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(m.x + radius, m.y + radius, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  });

  // Draw NPC (Turret)
  ctx.fillStyle = '#334155';
  ctx.beginPath();
  ctx.roundRect(npc.x, npc.y, npc.w, npc.h, 2);
  ctx.fill();
  ctx.fillStyle = '#f43f5e';
  ctx.fillRect(npc.x + 10, npc.y + 10, 10, 10);

  // Draw Bullets (Lasers)
  ctx.fillStyle = '#f43f5e';
  bullets.forEach(b => {
    if (b.active) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // Draw Player (Professional Character with Limbs)
  ctx.save();
  ctx.translate(player.x + player.width / 2, player.y + player.height / 2);
  
  const lookDir = Math.sign(player.velX || 1);
  const isMoving = Math.abs(player.velX) > 10;
  const swing = isMoving ? Math.sin(animationTime * 15) : 0;
  const jumpOffset = !player.isGrounded ? -5 : 0;

  // Legs
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  // Left Leg
  ctx.beginPath();
  ctx.moveTo(-6, 10);
  ctx.lineTo(-8 + (isMoving ? swing * 10 : 0), 22 + jumpOffset);
  ctx.stroke();
  // Right Leg
  ctx.beginPath();
  ctx.moveTo(6, 10);
  ctx.lineTo(8 - (isMoving ? swing * 10 : 0), 22 + jumpOffset);
  ctx.stroke();

  // Arms
  // Back Arm
  ctx.beginPath();
  ctx.moveTo(-12 * lookDir, -5);
  ctx.lineTo(-18 * lookDir - (isMoving ? swing * 10 : 0), 5);
  ctx.stroke();

  // Body
  ctx.fillStyle = '#f1f5f9';
  ctx.beginPath();
  ctx.roundRect(-12, -18, 24, 30, 8);
  ctx.fill();
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Front Arm
  ctx.beginPath();
  ctx.moveTo(12 * lookDir, -5);
  ctx.lineTo(18 * lookDir + (isMoving ? swing * 10 : 0), 5);
  ctx.stroke();

  // Head
  ctx.fillStyle = '#f1f5f9';
  ctx.beginPath();
  ctx.arc(0, -28, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Eyes
  ctx.fillStyle = '#0f172a';
  ctx.beginPath(); ctx.arc(lookDir * 4 + 3, -30, 2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(lookDir * 4 - 3, -30, 2, 0, Math.PI * 2); ctx.fill();

  ctx.restore();
}

function drawBackground() {
  // Dark Sky with red glow from bottom
  const grad = ctx.createLinearGradient(0, 0, 0, 500);
  grad.addColorStop(0, '#020617');
  grad.addColorStop(0.8, '#0f172a');
  grad.addColorStop(1, '#450a0a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Digital Rain / Grid
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.03)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 800; i += 50) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 500); ctx.stroke();
  }
}

let lastTime = 0;
function loop(time: number) {
  const dt = Math.min((time - lastTime) / 1000, 0.1);
  lastTime = time;

  if (gameStarted) {
    update(dt);
  }
  draw();

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
