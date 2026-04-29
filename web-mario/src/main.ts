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

  drawBackground();

  // Draw Platforms (Grass & Dirt)
  for (const plat of platforms) {
    // Dirt
    ctx.fillStyle = '#92400e';
    ctx.beginPath();
    ctx.roundRect(plat.x, plat.y + 8, plat.w, plat.h - 8, 4);
    ctx.fill();
    
    // Grass Top
    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.roundRect(plat.x, plat.y, plat.w, 12, 4);
    ctx.fill();
    
    // Highlights
    ctx.fillStyle = '#bef264';
    ctx.fillRect(plat.x + 5, plat.y + 3, plat.w - 10, 3);
  }

  // Draw Goal (Cute Candy Door)
  ctx.fillStyle = '#fb7185';
  ctx.beginPath();
  ctx.roundRect(goal.x, goal.y, goal.w, goal.h, [20, 20, 0, 0]);
  ctx.fill();
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 4;
  ctx.stroke();
  
  // Heart on Door
  ctx.fillStyle = 'white';
  ctx.font = '20px serif';
  ctx.fillText('❤️', goal.x + 10, goal.y + 35);

  // Draw Meteorites (Angry Suns)
  meteorites.forEach(m => {
    if (m.active) {
      const radius = m.w / 2;
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(m.x + radius, m.y + radius, radius, 0, Math.PI * 2);
      ctx.fill();
      
      // Angry Eyes
      ctx.fillStyle = 'black';
      ctx.fillRect(m.x + radius - 10, m.y + radius - 5, 4, 4);
      ctx.fillRect(m.x + radius + 6, m.y + radius - 5, 4, 4);
      
      // Mouth
      ctx.beginPath();
      ctx.arc(m.x + radius, m.y + radius + 8, 5, 0, Math.PI, true);
      ctx.stroke();
      
      // Sun Rays (Simple)
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 4;
      for(let i=0; i<8; i++) {
        ctx.save();
        ctx.translate(m.x + radius, m.y + radius);
        ctx.rotate(i * Math.PI / 4);
        ctx.beginPath(); ctx.moveTo(0, -radius - 5); ctx.lineTo(0, -radius - 12); ctx.stroke();
        ctx.restore();
      }
    }
  });

  // Draw NPC (Cute Robot)
  ctx.fillStyle = '#e2e8f0';
  ctx.beginPath();
  ctx.roundRect(npc.x, npc.y, npc.w, npc.h, 10);
  ctx.fill();
  ctx.strokeStyle = '#94a3b8';
  ctx.stroke();
  
  // NPC Eyes
  ctx.fillStyle = '#38bdf8';
  ctx.beginPath();
  ctx.arc(npc.x + 8, npc.y + 15, 3, 0, Math.PI * 2);
  ctx.arc(npc.x + 22, npc.y + 15, 3, 0, Math.PI * 2);
  ctx.fill();

  // Gun (Water Gun)
  ctx.save();
  ctx.translate(npc.x + npc.w / 2, npc.y + npc.h / 2);
  const angle = Math.atan2((player.y + player.height / 2) - (npc.y + npc.h / 2), (player.x + player.width / 2) - (npc.x + npc.w / 2));
  ctx.rotate(angle);
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(12, -4, 18, 8);
  ctx.restore();

  // Draw Bullets (Bubbles)
  ctx.fillStyle = 'rgba(56, 189, 248, 0.5)';
  ctx.strokeStyle = 'white';
  bullets.forEach(b => {
    if (b.active) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  });

  // Draw Player (Doraemon Style)
  ctx.save();
  ctx.translate(player.x + player.width / 2, player.y + player.height / 2);
  
  let scaleX = 1;
  let scaleY = 1;
  if (!player.isGrounded) {
    scaleY = 1.1;
    scaleX = 0.9;
  }
  ctx.scale(scaleX, scaleY);

  const r = player.width / 2;

  // Blue Body/Head
  ctx.fillStyle = '#38bdf8';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  
  // White Face
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.arc(0, 4, r * 0.8, 0, Math.PI * 2);
  ctx.fill();

  const lookDir = Math.sign(player.velX || 0.1);

  // Eyes
  ctx.fillStyle = 'white';
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 1;
  // Left Eye
  ctx.beginPath(); ctx.ellipse(lookDir * 4 - 5, -8, 6, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // Right Eye
  ctx.beginPath(); ctx.ellipse(lookDir * 4 + 5, -8, 6, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  
  // Pupils
  ctx.fillStyle = 'black';
  ctx.beginPath(); ctx.arc(lookDir * 4 - 3, -6, 2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(lookDir * 4 + 7, -6, 2, 0, Math.PI * 2); ctx.fill();

  // Red Nose
  ctx.fillStyle = '#ef4444';
  ctx.beginPath(); ctx.arc(lookDir * 6, 0, 4, 0, Math.PI * 2); ctx.fill();

  // Whiskers
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 1;
  // Right side
  ctx.beginPath(); ctx.moveTo(lookDir * 6 + 4, 2); ctx.lineTo(lookDir * 6 + 15, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(lookDir * 6 + 4, 4); ctx.lineTo(lookDir * 6 + 15, 6); ctx.stroke();
  // Left side
  ctx.beginPath(); ctx.moveTo(lookDir * 6 - 4, 2); ctx.lineTo(lookDir * 6 - 15, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(lookDir * 6 - 4, 4); ctx.lineTo(lookDir * 6 - 15, 6); ctx.stroke();

  // Red Collar
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.roundRect(-r * 0.7, r * 0.6, r * 1.4, 6, 3);
  ctx.fill();

  // Yellow Bell
  ctx.fillStyle = '#facc15';
  ctx.strokeStyle = '#854d0e';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(lookDir * 2, r * 0.85, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

const clouds = Array.from({ length: 5 }, () => ({
  x: Math.random() * 800,
  y: Math.random() * 150 + 50,
  w: Math.random() * 100 + 80,
  speed: Math.random() * 10 + 5
}));

function drawBackground() {
  // Draw Clouds
  ctx.fillStyle = 'white';
  clouds.forEach(c => {
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.w/3, 0, Math.PI * 2);
    ctx.arc(c.x + c.w/4, c.y - 10, c.w/3, 0, Math.PI * 2);
    ctx.arc(c.x + c.w/2, c.y, c.w/3, 0, Math.PI * 2);
    ctx.fill();
    c.x -= c.speed * 0.01;
    if (c.x + c.w < 0) c.x = 800;
  });
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
