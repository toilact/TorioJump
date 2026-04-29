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
  { x: 0, y: 450, w: 200, h: 50 }, // Starting Floor
  { x: 300, y: 400, w: 100, h: 20 }, // Step 1
  { x: 500, y: 350, w: 100, h: 20 }, // Step 2
  { x: 250, y: 250, w: 80, h: 20 },  // High ledge left
  { x: 100, y: 180, w: 60, h: 20 },  // Tiny platform
  { x: 400, y: 150, w: 150, h: 20 }, // Long middle
  { x: 650, y: 100, w: 100, h: 20 }, // Goal Platform
  { x: 50, y: 80, w: 100, h: 20 },   // Top left secret
  { x: 450, y: 450, w: 350, h: 50 }, // End floor
  { x: 700, y: 300, w: 20, h: 100 }, // Vertical wall test
];

const goal = { x: 700, y: 40, w: 40, h: 60 }; // The Yellow Door

// --- Troll Logic ---
const meteorites: { x: number, y: number, w: number, h: number, active: boolean }[] = [];
const trollTriggers = [
  { x: 350, spawned: false }, // Trigger near first jump
  { x: 550, spawned: false }, // Trigger near goal platform
  { x: 150, spawned: false }, // Early game surprise
];

// --- NPC Shooter ---
const npc = { x: 450, y: 110, w: 30, h: 40, shootTimer: 0 }; // Sitting on the long middle platform
const bullets: { x: number, y: number, vx: number, vy: number, active: boolean }[] = [];
const BULLET_SPEED = 300;
const SHOOT_INTERVAL = 1.5;

let isFakeWinning = false;
let fakeWinTimer = 0;

// --- Audio System (Synthesized) ---
const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

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

// --- Game Loop ---
let lastTime = 0;

function update(dt: number) {
  // 1. Timers
  if (player.jumpBufferCounter > 0) player.jumpBufferCounter -= dt;
  if (player.coyoteTimeCounter > 0) player.coyoteTimeCounter -= dt;

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
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw Platforms
  ctx.fillStyle = '#475569';
  for (const plat of platforms) {
    ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
    // Bevel
    ctx.fillStyle = '#64748b';
    ctx.fillRect(plat.x, plat.y, plat.w, 4);
    ctx.fillStyle = '#475569';
  }

  // Draw Goal (Yellow Door)
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(goal.x, goal.y, goal.w, goal.h);
  // Door frame
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 4;
  ctx.strokeRect(goal.x, goal.y, goal.w, goal.h);
  // Knob
  ctx.fillStyle = '#92400e';
  ctx.beginPath();
  ctx.arc(goal.x + goal.w - 10, goal.y + goal.h / 2, 3, 0, Math.PI * 2);
  ctx.fill();

  // Draw Meteorites
  meteorites.forEach(m => {
    if (m.active) {
      ctx.beginPath();
      // Draw as circle
      const radius = m.w / 2;
      ctx.arc(m.x + radius, m.y + radius, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#475569';
      ctx.fill();
      // Add texture/crater
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.arc(m.x + radius * 0.6, m.y + radius * 0.6, radius * 0.2, 0, Math.PI * 2);
      ctx.fill();
      // Glow/Fire effect
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(m.x + radius, m.y - 5, radius * 0.8, 0, Math.PI, true);
      ctx.fill();
    }
  });

  // Draw NPC
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.roundRect(npc.x, npc.y, npc.w, npc.h, 4);
  ctx.fill();
  // Eyes (Evil)
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(npc.x + 5, npc.y + 10, 5, 5);
  ctx.fillRect(npc.x + 20, npc.y + 10, 5, 5);
  // Gun
  ctx.fillStyle = '#334155';
  ctx.save();
  ctx.translate(npc.x + npc.w / 2, npc.y + npc.h / 2);
  const angle = Math.atan2((player.y + player.height / 2) - (npc.y + npc.h / 2), (player.x + player.width / 2) - (npc.x + npc.w / 2));
  ctx.rotate(angle);
  ctx.fillRect(10, -4, 20, 8);
  ctx.restore();

  // Draw Bullets
  ctx.fillStyle = '#fbbf24';
  bullets.forEach(b => {
    if (b.active) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // Draw Player
  ctx.save();
  ctx.translate(player.x + player.width / 2, player.y + player.height / 2);
  
  // Squash and stretch effect (Simple)
  let scaleX = 1;
  let scaleY = 1;
  if (!player.isGrounded) {
    scaleY = 1.1;
    scaleX = 0.9;
  }
  ctx.scale(scaleX, scaleY);

  // Character Body
  const gradient = ctx.createLinearGradient(-16, -24, 16, 24);
  gradient.addColorStop(0, '#f87171');
  gradient.addColorStop(1, '#ef4444');
  ctx.fillStyle = gradient;
  
  // Rounded rect for player
  const r = 8;
  ctx.beginPath();
  ctx.roundRect(-player.width/2, -player.height/2, player.width, player.height, r);
  ctx.fill();
  
  // Eyes
  ctx.fillStyle = 'white';
  const eyeOffset = Math.sign(player.velX || 1) * 5;
  ctx.fillRect(eyeOffset + 2, -10, 6, 6);
  ctx.fillRect(eyeOffset - 8, -10, 6, 6);

  ctx.restore();
}

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
