const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const startOverlay = document.getElementById('start-overlay');
const hpInner = document.getElementById('hp-bar-inner');
const friendlyEl = document.getElementById('friendly-val');
const scoreEl = document.getElementById('score-val');
const progressBarInner = document.getElementById('progress-bar-inner');
const progressLabel = document.getElementById('progress-label');
const stallWarning = document.getElementById('stall-warning');
const eventBanner = document.getElementById('event-banner');

// Audio Synthesizer Engine
let audioCtx = null;
let engineOsc = null;
let engineFilter = null;
let engineGain = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (!engineOsc) {
    engineOsc = audioCtx.createOscillator();
    engineFilter = audioCtx.createBiquadFilter();
    engineGain = audioCtx.createGain();

    engineOsc.type = 'sawtooth';
    engineOsc.frequency.setValueAtTime(48, audioCtx.currentTime);

    engineFilter.type = 'lowpass';
    engineFilter.frequency.setValueAtTime(120, audioCtx.currentTime);

    engineGain.gain.setValueAtTime(0.025, audioCtx.currentTime);

    engineOsc.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(audioCtx.destination);
    engineOsc.start();
  }
}

function updateEngineSound(speed, isBoosting, isStalled) {
  if (!engineOsc || !audioCtx) return;
  const now = audioCtx.currentTime;
  let targetFreq = 40 + speed * 4.5;
  if (isBoosting) targetFreq += 22;
  if (isStalled) targetFreq = 30;

  let targetGain = isStalled ? 0.01 : (isBoosting ? 0.045 : 0.025);

  engineOsc.frequency.setTargetAtTime(targetFreq, now, 0.1);
  engineFilter.frequency.setTargetAtTime(targetFreq * 2.2, now, 0.1);
  engineGain.gain.setTargetAtTime(targetGain, now, 0.1);
}

function playSound(type) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  
  if (type === 'shoot') {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.08);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.08);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(now); osc.stop(now + 0.08);
  } else if (type === 'ricochet') {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.12);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.12);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(now); osc.stop(now + 0.12);
  } else if (type === 'explosion') {
    const bufferSize = audioCtx.sampleRate * 0.3;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.linearRampToValueAtTime(50, now + 0.3);
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.3);
    noise.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination);
    noise.start(now);
  } else if (type === 'transfer') {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.25);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.25);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(now); osc.stop(now + 0.25);
  }
}

// Global World Config
let gameState = 'START';
let keys = {};
let score = 0;
let camX = 0, camY = 0;
let gameTime = 0;
let screenShake = 0;
let totalTargetsEliminated = 0;
const WIN_KILL_TARGET = 20;
let halfTimeTriggered = false;

let currentWeather = 'CLEAR';
let rainDrops = [];

let mouseX = canvas.width / 2;
let mouseY = canvas.height / 2;

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  mouseX = (e.clientX - rect.left) * scaleX;
  mouseY = (e.clientY - rect.top) * scaleY;
});

const MAP_MIN_X = -2400;
const MAP_MAX_X = 4400;
const LEFT_OCEAN_END = -800;
const LEFT_BEACH_END = -300;
const RIGHT_BEACH_START = 2100;
const RIGHT_OCEAN_START = 2600;

const WORLD_HEIGHT = 1800;
const BASE_GROUND_Y = 1600;
const CARRIER_WEST_X = -1800;
const CARRIER_EAST_X = 3500;

let craters = [];

const PIXEL_PLANE = [
  "22......22......",
  "221111112211....",
  "111111111111111.",
  ".11111133111114.",
  "111111111111111.",
  "22......11......"
];

const PIXEL_CARRIER = [
  "............................3333........................",
  "............................3333........................",
  "..........................33333333......................",
  "11111111111111111111111111111111111111111111111111111111",
  "22222222222222222222222222222222222222222222222222222222",
  ".222222222222222222222222222222222222222222222222222222.",
  "..222222222222222222222222222222222222222222222222222..."
];

const PIXEL_TURRET = [
  "....1111....",
  "....1111....",
  "...222222...",
  "..22222222..",
  ".3333333333."
];

const PIXEL_GUNBOAT = [
  ".....11.....",
  "..22222222..",
  "333333333333",
  ".3333333333."
];

const PIXEL_PERSON = [
  "..11..",
  "..11..",
  ".2222.",
  "222222",
  "..33..",
  "..33.."
];

const PIXEL_CLOUD = [
  "..111111111.....",
  ".1111111111111..",
  "1111111111111111",
  "1111111111111111",
  ".11111111111111."
];

const PIXEL_TREE = [
  "....1111....",
  "..11111111..",
  ".1111111111.",
  ".1111111111.",
  "..11111111..",
  "....2222....",
  "....2222...."
];

const SPRITE_SIZE = 3;

function drawPixelMatrix(matrix, x, y, scale, angle, colorPalette) {
  ctx.save();
  ctx.translate(Math.floor(x), Math.floor(y));
  
  if (Math.abs(angle) > Math.PI / 2) {
    ctx.rotate(angle);
    ctx.scale(1, -1);
  } else {
    ctx.rotate(angle);
  }

  const rows = matrix.length;
  const cols = matrix[0].length;
  const offX = -(cols * scale) / 2;
  const offY = -(rows * scale) / 2;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const char = matrix[r][c];
      if (char !== '.') {
        ctx.fillStyle = colorPalette[char] || '#ffffff';
        ctx.fillRect(Math.floor(offX + c * scale), Math.floor(offY + r * scale), scale, scale);
      }
    }
  }
  ctx.restore();
}

function getGroundY(worldX) {
  if (worldX < LEFT_OCEAN_END || worldX > RIGHT_OCEAN_START) {
    return BASE_GROUND_Y + 70;
  }
  let baseLand = BASE_GROUND_Y + Math.sin(worldX * 0.003) * 35 + Math.cos(worldX * 0.008) * 15;
  if (worldX >= LEFT_OCEAN_END && worldX < LEFT_BEACH_END) {
    let ratio = (worldX - LEFT_OCEAN_END) / (LEFT_BEACH_END - LEFT_OCEAN_END);
    baseLand = (BASE_GROUND_Y + 70) * (1 - ratio) + baseLand * ratio;
  } else if (worldX > RIGHT_BEACH_START && worldX <= RIGHT_OCEAN_START) {
    let ratio = (worldX - RIGHT_BEACH_START) / (RIGHT_OCEAN_START - RIGHT_BEACH_START);
    baseLand = baseLand * (1 - ratio) + (BASE_GROUND_Y + 70) * ratio;
  }

  for (let i = 0; i < craters.length; i++) {
    const c = craters[i];
    const dist = Math.abs(worldX - c.x);
    if (dist < c.radius) {
      const depthFactor = Math.cos((dist / c.radius) * (Math.PI / 2));
      baseLand += c.depth * depthFactor * depthFactor;
    }
  }
  return baseLand;
}

let player;
let friendlies = [];
let enemies = [];
let groundTargets = [];
let people = [];
let bullets = [];
let particles = [];
let clouds = [];

class GroundTarget {
  constructor(x, type) {
    this.x = x;
    this.type = type;
    this.y = getGroundY(this.x) - (type === 'gunboat' ? 10 : 12);
    this.hp = type === 'gunboat' ? 160 : 120;
    this.gunTimer = Math.floor(Math.random() * 60);
    this.dead = false;

    this.palette = type === 'gunboat'
      ? { '1': '#0284c7', '2': '#475569', '3': '#1e293b' }
      : { '1': '#475569', '2': '#334155', '3': '#0f172a' };
  }

  update() {
    if (this.dead) return;
    this.gunTimer++;
    if (this.gunTimer >= 90) {
      this.gunTimer = 0;
      let target = player;
      if (target && !target.isDying) {
        let dist = Math.hypot(target.x - this.x, target.y - this.y);
        if (dist < 650) {
          let timeToTarget = dist / 18;
          let predX = target.x + target.vx * timeToTarget;
          let predY = target.y + target.vy * timeToTarget;
          let angle = Math.atan2(predY - this.y, predX - this.x);
          bullets.push(new Bullet(this.x, this.y - 10, angle));
        }
      }
    }
  }

  draw() {
    const matrix = this.type === 'gunboat' ? PIXEL_GUNBOAT : PIXEL_TURRET;
    drawPixelMatrix(matrix, this.x, this.y, 3, 0, this.palette);
  }
}

class Person {
  constructor(x, isHostile) {
    this.x = x;
    this.isHostile = isHostile;
    this.y = getGroundY(this.x) - 8;
    this.dir = Math.random() < 0.5 ? 1 : -1;
    this.speed = 0.4 + Math.random() * 0.3;
    this.dead = false;
    this.palette = isHostile 
      ? { '1': '#f87171', '2': '#991b1b', '3': '#450a0a' } 
      : { '1': '#38bdf8', '2': '#1e40af', '3': '#1e1b4b' };
  }

  update() {
    this.x += this.dir * this.speed;
    this.y = getGroundY(this.x) - 8;
    if (Math.random() < 0.005) this.dir *= -1;
  }

  draw() {
    drawPixelMatrix(PIXEL_PERSON, this.x, this.y, 2, 0, this.palette);
  }
}

class Plane {
  constructor(x, y, isPlayer, isFriendly) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.angle = 0;
    this.speed = 6.0;
    this.isPlayer = isPlayer;
    this.isFriendly = isFriendly;
    this.maxHp = 300;
    this.hp = 300;
    this.gunTimer = 0;
    this.isStalled = false;
    this.isDying = false;

    this.updatePalette();
  }

  updatePalette() {
    if (this.isPlayer) {
      this.palette = { '1': '#15803d', '2': '#22c55e', '3': '#38bdf8', '4': '#f97316' };
    } else if (this.isFriendly) {
      this.palette = { '1': '#166534', '2': '#4ade80', '3': '#38bdf8', '4': '#f97316' };
    } else {
      this.palette = { '1': '#991b1b', '2': '#ef4444', '3': '#fdba74', '4': '#f97316' };
    }
  }

  update() {
    if (this.isDying) {
      this.angle += 0.08;
      this.vy += 0.22;
      this.x += Math.cos(this.angle) * 3;
      this.y += this.vy;

      if (Math.random() < 0.9) {
        particles.push(new PixelParticle(
          this.x + (Math.random() - 0.5) * 15,
          this.y + (Math.random() - 0.5) * 15,
          Math.random() < 0.5 ? '#ef4444' : '#1e293b',
          Math.random() * 5 + 3
        ));
      }

      const groundAtPos = getGroundY(this.x);
      if (this.y >= groundAtPos - 5) {
        if (this.x >= LEFT_BEACH_END && this.x <= RIGHT_BEACH_START) {
          craters.push({ x: this.x, radius: 55, depth: 40 });
        }
        spawnExplosion(this.x, groundAtPos, 50);

        const isWater = this.x < LEFT_OCEAN_END || this.x > RIGHT_OCEAN_START;
        for (let i = 0; i < 30; i++) {
          particles.push(new PixelParticle(
            this.x, groundAtPos,
            isWater ? '#38bdf8' : '#78350f',
            Math.random() * 6 + 4
          ));
        }

        screenShake = 22;
        this.dead = true;

        if (this.isPlayer) switchSquadMember();
      }
      return;
    }

    if (currentWeather === 'STORM') this.x -= 0.6;

    if (this.isPlayer) {
      const targetWorldX = mouseX + camX;
      const targetWorldY = mouseY + camY;
      const targetAngle = Math.atan2(targetWorldY - this.y, targetWorldX - this.x);

      const pitchUp = -Math.sin(this.angle);
      let altitudeDrag = Math.max(0, (500 - this.y) * 0.00012);
      let turnSpeed = 0.038;

      if (keys['shift']) {
        this.speed = Math.min(11.5, this.speed + 0.18 - altitudeDrag);
        turnSpeed = 0.026;
        particles.push(new PixelParticle(
          this.x - Math.cos(this.angle) * 22,
          this.y - Math.sin(this.angle) * 22,
          Math.random() < 0.5 ? '#f97316' : '#facc15',
          Math.random() * 4 + 2
        ));
      } else if (keys['s']) {
        this.speed = Math.max(2.8, this.speed - 0.15);
        turnSpeed = 0.062;
      } else {
        if (pitchUp > 0.45) {
          this.speed = Math.max(1.2, this.speed - (0.08 + altitudeDrag) * pitchUp);
        } else if (pitchUp < -0.3) {
          this.speed = Math.min(8.8, this.speed + 0.07 * Math.abs(pitchUp));
        } else {
          if (this.speed < 6.0) this.speed += 0.04;
          if (this.speed > 6.0) this.speed -= 0.04;
        }
      }

      if (this.speed <= 2.2 && pitchUp > 0.3) this.isStalled = true;

      if (this.isStalled) {
        let pitchDownDiff = 1.57 - this.angle;
        while (pitchDownDiff < -Math.PI) pitchDownDiff += Math.PI * 2;
        while (pitchDownDiff > Math.PI) pitchDownDiff -= Math.PI * 2;
        this.angle += Math.sign(pitchDownDiff) * 0.08;
        this.speed = Math.min(8.0, this.speed + 0.12);
        if (this.speed > 4.8) this.isStalled = false;
      } else {
        let diff = targetAngle - this.angle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;

        if (Math.abs(diff) < turnSpeed) {
          this.angle = targetAngle;
        } else {
          this.angle += Math.sign(diff) * turnSpeed;
        }

        if (Math.abs(diff) > 0.022 || keys['shift']) {
          const wingOffset = 18;
          const perpAngle = this.angle + Math.PI / 2;
          particles.push(new PixelParticle(
            this.x - Math.cos(this.angle) * 8 + Math.cos(perpAngle) * wingOffset,
            this.y - Math.sin(this.angle) * 8 + Math.sin(perpAngle) * wingOffset,
            'rgba(240, 249, 255, 0.6)', 2
          ));
          particles.push(new PixelParticle(
            this.x - Math.cos(this.angle) * 8 - Math.cos(perpAngle) * wingOffset,
            this.y - Math.sin(this.angle) * 8 - Math.sin(perpAngle) * wingOffset,
            'rgba(240, 249, 255, 0.6)', 2
          ));
        }
      }

      updateEngineSound(this.speed, keys['shift'], this.isStalled);

      this.vx = Math.cos(this.angle) * this.speed;
      this.vy = Math.sin(this.angle) * this.speed;
      this.x += this.vx;
      this.y += this.vy;

      if (this.hp / this.maxHp <= 0.35 && Math.random() < 0.7) {
        particles.push(new PixelParticle(
          this.x - Math.cos(this.angle) * 18,
          this.y - Math.sin(this.angle) * 18,
          Math.random() < 0.4 ? '#ef4444' : '#334155',
          Math.random() * 4 + 3
        ));
      }

      if (this.gunTimer > 0) this.gunTimer--;
      if (keys['w'] && this.gunTimer <= 0) {
        bullets.push(new Bullet(this.x, this.y, this.angle));
        this.gunTimer = 6;
        screenShake = Math.max(screenShake, 3.5);
        playSound('shoot');
      }

    } else {
      let target = null;
      let minDist = Infinity;

      if (this.isFriendly) {
        enemies.forEach(e => {
          if (!e.isDying) {
            let d = Math.hypot(e.x - this.x, e.y - this.y);
            if (d < minDist) { minDist = d; target = e; }
          }
        });
      } else {
        const targets = [player, ...friendlies].filter(t => t && !t.isDying);
        targets.forEach(t => {
          let d = Math.hypot(t.x - this.x, t.y - this.y);
          if (d < minDist) { minDist = d; target = t; }
        });
      }

      let avoidTurn = 0;
      const allPlanes = [player, ...friendlies, ...enemies];
      for (let other of allPlanes) {
        if (other && other !== this && !other.isDying && !other.dead) {
          let dist = Math.hypot(other.x - this.x, other.y - this.y);
          if (dist < 220 && dist > 1) {
            let angleToOther = Math.atan2(other.y - this.y, other.x - this.x);
            let diff = angleToOther - this.angle;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;

            if (Math.abs(diff) < 1.4) {
              avoidTurn += (diff > 0 ? -0.06 : 0.06) * (1 - dist / 220);
            }
          }
        }
      }

      const pitchUp = -Math.sin(this.angle);
      if (pitchUp > 0.45) {
        this.speed = Math.max(1.8, this.speed - 0.06 * pitchUp);
      } else if (pitchUp < -0.3) {
        this.speed = Math.min(8.2, this.speed + 0.06 * Math.abs(pitchUp));
      } else {
        if (this.speed < 5.5) this.speed += 0.04;
        if (this.speed > 5.5) this.speed -= 0.04;
      }

      if (this.speed <= 2.2 && pitchUp > 0.3) this.isStalled = true;

      if (this.isStalled) {
        let pitchDownDiff = 1.57 - this.angle;
        while (pitchDownDiff < -Math.PI) pitchDownDiff += Math.PI * 2;
        while (pitchDownDiff > Math.PI) pitchDownDiff -= Math.PI * 2;
        this.angle += Math.sign(pitchDownDiff) * 0.07;
        this.speed = Math.min(7.0, this.speed + 0.1);
        if (this.speed > 4.5) this.isStalled = false;
      } else {
        if (Math.abs(avoidTurn) > 0.001) {
          this.angle += avoidTurn;
        } else if (target) {
          let bulletSpeed = 18;
          let timeToTarget = minDist / bulletSpeed;
          let predX = target.x + target.vx * timeToTarget;
          let predY = target.y + target.vy * timeToTarget;

          let targetAngle = Math.atan2(predY - this.y, predX - this.x);
          let diff = targetAngle - this.angle;
          while (diff < -Math.PI) diff += Math.PI * 2;
          while (diff > Math.PI) diff -= Math.PI * 2;

          if (diff > 0.038) this.angle += 0.038;
          else if (diff < -0.038) this.angle -= 0.038;

          if (this.gunTimer > 0) this.gunTimer--;
          if (minDist < 520 && minDist > 100 && Math.abs(diff) < 0.22 && this.gunTimer <= 0) {
            bullets.push(new Bullet(this.x, this.y, this.angle));
            this.gunTimer = 16;
          }
        }
      }

      const groundAtPos = getGroundY(this.x);
      if (this.y > groundAtPos - 220 && Math.sin(this.angle) > 0) {
        this.angle -= 0.06;
      }

      this.vx = Math.cos(this.angle) * this.speed;
      this.vy = Math.sin(this.angle) * this.speed;
      this.x += this.vx;
      this.y += this.vy;
    }

    if (this.x < MAP_MIN_X + 100) {
      this.x = MAP_MIN_X + 100;
      this.angle = 0;
    } else if (this.x > MAP_MAX_X - 100) {
      this.x = MAP_MAX_X - 100;
      this.angle = Math.PI;
    }

    const currentGroundY = getGroundY(this.x);
    if (this.hp <= 0 || this.y >= currentGroundY - 10) {
      this.isDying = true;
      this.hp = 0;
    }

    if (this.y < 80) this.y = 80;
  }

  draw() {
    drawPixelMatrix(PIXEL_PLANE, this.x, this.y, SPRITE_SIZE, this.angle, this.palette);
  }
}

class Bullet {
  constructor(x, y, angle) {
    this.x = x + Math.cos(angle) * 22;
    this.y = y + Math.sin(angle) * 22;
    const bulletSpeed = 18;
    this.vx = Math.cos(angle) * bulletSpeed;
    this.vy = Math.sin(angle) * bulletSpeed;
    this.gravity = 0.18;
    this.life = 70;
    this.ricochetsLeft = 2;
  }

  update() {
    this.vy += this.gravity;
    this.x += this.vx;
    this.y += this.vy;
    this.life--;
  }

  ricochet(nx, ny) {
    const dot = this.vx * nx + this.vy * ny;
    this.vx = (this.vx - 2 * dot * nx) * 0.75 + (Math.random() - 0.5) * 3;
    this.vy = (this.vy - 2 * dot * ny) * 0.75 + (Math.random() - 0.5) * 3;
    this.ricochetsLeft--;

    playSound('ricochet');

    for (let i = 0; i < 8; i++) {
      particles.push(new PixelParticle(this.x, this.y, '#fef08a', Math.random() * 3 + 2));
    }
  }

  draw() {
    ctx.save();
    ctx.translate(Math.floor(this.x), Math.floor(this.y));
    ctx.rotate(Math.atan2(this.vy, this.vx));
    ctx.fillStyle = this.ricochetsLeft < 2 ? '#f97316' : '#facc15';
    ctx.fillRect(-3, -1, 7, 3);
    ctx.restore();
  }
}

class PixelParticle {
  constructor(x, y, color, size = null) {
    this.x = x; this.y = y;
    this.vx = (Math.random() - 0.5) * 4;
    this.vy = (Math.random() - 0.5) * 4;
    this.size = size || (Math.floor(Math.random() * 4) + 3);
    this.color = color;
    this.life = 25;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.life--;
  }

  draw() {
    ctx.fillStyle = this.color;
    ctx.fillRect(Math.floor(this.x), Math.floor(this.y), this.size, this.size);
  }
}

class ParallaxCloud {
  constructor(layer) {
    this.layer = layer;
    this.x = MAP_MIN_X + Math.random() * (MAP_MAX_X - MAP_MIN_X);
    this.y = Math.random() * 800 + 40;
    this.scale = layer === 1 ? Math.floor(Math.random() * 2) + 3 : Math.floor(Math.random() * 3) + 5;
    this.opacity = layer === 1 ? 0.45 : 0.75;
    this.palette = { '1': `rgba(255, 255, 255, ${this.opacity})` };
  }

  draw(camX, camY) {
    const factor = this.layer === 1 ? 0.3 : 0.6;
    const renderX = this.x + camX * (1 - factor);
    const renderY = this.y + camY * (1 - factor);
    drawPixelMatrix(PIXEL_CLOUD, renderX, renderY, this.scale, 0, this.palette);
  }
}

function spawnExplosion(x, y, count = 25) {
  playSound('explosion');
  const colors = ['#ef4444', '#f97316', '#facc15', '#334155'];
  for (let i = 0; i < count; i++) {
    particles.push(new PixelParticle(x, y, colors[Math.floor(Math.random() * colors.length)]));
  }
}

function switchSquadMember() {
  const activeWingmen = friendlies.filter(f => !f.isDying && !f.dead);
  if (activeWingmen.length > 0) {
    const newLeader = activeWingmen.shift();
    friendlies = friendlies.filter(f => f !== newLeader);
    newLeader.isPlayer = true;
    newLeader.updatePalette();
    player = newLeader;
    
    playSound('transfer');
    eventBanner.textContent = "SQUAD TRANSFER! TAKING CONTROL OF WINGMAN!";
    eventBanner.style.display = "block";
    setTimeout(() => { eventBanner.style.display = "none"; }, 3000);
  } else {
    gameOver();
  }
}

function registerTargetEliminated(scoreValue) {
  score += scoreValue;
  totalTargetsEliminated++;

  const progressRatio = Math.min(1.0, totalTargetsEliminated / WIN_KILL_TARGET);
  progressBarInner.style.width = `${progressRatio * 100}%`;
  progressLabel.textContent = `MISSION PROGRESS: ${Math.floor(progressRatio * 100)}% (${totalTargetsEliminated}/${WIN_KILL_TARGET} TARGETS)`;

  if (totalTargetsEliminated >= WIN_KILL_TARGET) victory();
}

function startGame() {
  initAudio();
  score = 0; gameTime = 0; craters = []; totalTargetsEliminated = 0;
  bullets = []; particles = []; clouds = []; friendlies = []; enemies = []; people = []; groundTargets = [];
  halfTimeTriggered = false; currentWeather = 'CLEAR';

  progressBarInner.style.width = '0%';
  progressLabel.textContent = `MISSION PROGRESS: 0% (0/${WIN_KILL_TARGET} TARGETS)`;

  player = new Plane(800, 500, true, true);

  for (let i = 0; i < 30; i++) clouds.push(new ParallaxCloud(1));
  for (let i = 0; i < 25; i++) clouds.push(new ParallaxCloud(2));

  for (let i = 0; i < 7; i++) {
    friendlies.push(new Plane(600 - i * 120, 450 + (i % 3) * 60, false, true));
  }

  for (let i = 0; i < 4; i++) {
    enemies.push(new Plane(1600 + i * 200, 400 + i * 120, false, false));
  }

  for (let i = 0; i < 6; i++) {
    people.push(new Person(i * 300 + Math.random() * 100, Math.random() < 0.5));
  }

  groundTargets.push(new GroundTarget(200, 'turret'));
  groundTargets.push(new GroundTarget(800, 'turret'));
  groundTargets.push(new GroundTarget(1400, 'turret'));
  groundTargets.push(new GroundTarget(-1200, 'gunboat'));
  groundTargets.push(new GroundTarget(3000, 'gunboat'));

  rainDrops = [];
  for (let i = 0; i < 120; i++) {
    rainDrops.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      l: Math.random() * 15 + 10,
      v: Math.random() * 10 + 12
    });
  }

  startOverlay.style.display = 'none';
  gameState = 'PLAYING';
}

function gameOver() {
  gameState = 'GAMEOVER';
  stallWarning.style.display = 'none';
  document.querySelector('#start-overlay h1').textContent = 'SQUAD WIPED OUT';
  document.querySelector('#start-overlay p').innerHTML = `Final Score: <strong>${score}</strong> | Mission Progress: <strong>${totalTargetsEliminated}/${WIN_KILL_TARGET} Targets</strong>`;
  document.querySelector('.start-btn').textContent = 'RETRY BATTLE';
  startOverlay.style.display = 'flex';
}

function victory() {
  gameState = 'VICTORY';
  stallWarning.style.display = 'none';
  document.querySelector('#start-overlay h1').textContent = 'VICTORY ACHIEVED!';
  document.querySelector('#start-overlay p').innerHTML = `Island airspace secured!<br>Final Score: <strong>${score}</strong>`;
  document.querySelector('.start-btn').textContent = 'PLAY AGAIN';
  startOverlay.style.display = 'flex';
}

window.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

function update() {
  if (gameState !== 'PLAYING') return;

  gameTime++;
  if (screenShake > 0) screenShake *= 0.88;

  player.update();
  stallWarning.style.display = (player.isStalled && !player.isDying) ? 'block' : 'none';

  camX = player.x - canvas.width / 2;
  camY = player.y - canvas.height / 2;
  camY = Math.max(0, Math.min(WORLD_HEIGHT - canvas.height, camY));

  if (totalTargetsEliminated >= 10 && !halfTimeTriggered) {
    halfTimeTriggered = true;
    currentWeather = 'STORM';
    eventBanner.textContent = "CARRIER REINFORCEMENTS & STORM APPROACHING FROM BOTH OCEANS!";
    eventBanner.style.display = "block";
    setTimeout(() => { eventBanner.style.display = "none"; }, 4000);

    friendlies.push(new Plane(CARRIER_WEST_X + 200, BASE_GROUND_Y - 60, false, true));
    friendlies.push(new Plane(CARRIER_WEST_X + 350, BASE_GROUND_Y - 80, false, true));

    enemies.push(new Plane(CARRIER_EAST_X - 200, BASE_GROUND_Y - 60, false, false));
    enemies.push(new Plane(CARRIER_EAST_X - 400, BASE_GROUND_Y - 80, false, false));
  }

  const activePlanes = [player, ...friendlies, ...enemies].filter(p => p && !p.isDying && !p.dead);
  for (let i = 0; i < activePlanes.length; i++) {
    for (let j = i + 1; j < activePlanes.length; j++) {
      const p1 = activePlanes[i];
      const p2 = activePlanes[j];
      if (Math.hypot(p1.x - p2.x, p1.y - p2.y) < 26) {
        p1.hp = 0; p1.isDying = true;
        p2.hp = 0; p2.isDying = true;
        spawnExplosion((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, 45);
        screenShake = 22;
      }
    }
  }

  groundTargets.forEach(gt => gt.update());
  people.forEach(p => p.update());

  for (let i = friendlies.length - 1; i >= 0; i--) {
    const f = friendlies[i];
    f.update();
    if (f.dead) friendlies.splice(i, 1);
  }

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.update();
    if (e.dead) {
      enemies.splice(i, 1);
      registerTargetEliminated(200);
      if (gameState !== 'PLAYING') return;
    }
  }

  if (enemies.length < 3 && totalTargetsEliminated < WIN_KILL_TARGET) {
    enemies.push(new Plane(player.x + 1000 + Math.random() * 300, Math.random() * 800 + 200, false, false));
  }

  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.update();

    if (b.life <= 0) { bullets.splice(i, 1); continue; }

    const isWater = b.x < LEFT_OCEAN_END || b.x > RIGHT_OCEAN_START;
    if (b.y >= getGroundY(b.x)) {
      if (b.ricochetsLeft > 0 && !isWater) {
        b.ricochet(0, -1);
      } else {
        if (!isWater) craters.push({ x: b.x, radius: 12, depth: 8 });
        spawnExplosion(b.x, b.y, 4);
        bullets.splice(i, 1);
        continue;
      }
    }

    for (let j = groundTargets.length - 1; j >= 0; j--) {
      const gt = groundTargets[j];
      if (!gt.dead && Math.hypot(gt.x - b.x, gt.y - b.y) < 26) {
        gt.hp -= 20;
        spawnExplosion(b.x, b.y, 6);
        bullets.splice(i, 1);
        if (gt.hp <= 0) {
          gt.dead = true;
          spawnExplosion(gt.x, gt.y, 35);
          groundTargets.splice(j, 1);
          registerTargetEliminated(150);
        }
        break;
      }
    }

    if (!bullets[i]) continue;

    for (let j = people.length - 1; j >= 0; j--) {
      const p = people[j];
      if (Math.hypot(p.x - b.x, p.y - b.y) < 14) {
        if (b.ricochetsLeft > 0) {
          const angle = Math.atan2(b.y - p.y, b.x - p.x);
          b.ricochet(Math.cos(angle), Math.sin(angle));
          score += 25;
        } else {
          spawnExplosion(b.x, b.y, 6);
          bullets.splice(i, 1);
        }
        break;
      }
    }

    if (!bullets[i]) continue;

    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      if (!e.isDying && Math.hypot(e.x - b.x, e.y - b.y) < 22) {
        if (b.ricochetsLeft > 0 && Math.random() < 0.25) {
          const angle = Math.atan2(b.y - e.y, b.x - e.x);
          b.ricochet(Math.cos(angle), Math.sin(angle));
          e.hp -= 5;
        } else {
          e.hp -= 12;
          spawnExplosion(b.x, b.y, 6);
          bullets.splice(i, 1);
        }
        break;
      }
    }

    if (!bullets[i]) continue;

    if (!player.isDying && Math.hypot(player.x - b.x, player.y - b.y) < 22) {
      player.hp -= 3;
      spawnExplosion(b.x, b.y, 6);
      screenShake = 6;
      bullets.splice(i, 1);
      continue;
    }

    for (let j = friendlies.length - 1; j >= 0; j--) {
      const f = friendlies[j];
      if (!f.isDying && Math.hypot(f.x - b.x, f.y - b.y) < 22) {
        f.hp -= 10;
        spawnExplosion(b.x, b.y, 6);
        bullets.splice(i, 1);
        break;
      }
    }
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    particles[i].update();
    if (particles[i].life <= 0) particles.splice(i, 1);
  }

  if (currentWeather === 'STORM') {
    rainDrops.forEach(r => {
      r.y += r.v;
      r.x -= 4;
      if (r.y > canvas.height) { r.y = -20; r.x = Math.random() * canvas.width; }
      if (r.x < 0) r.x = canvas.width;
    });
  }

  const hpRatio = player.hp / player.maxHp;
  hpInner.style.width = `${Math.max(0, hpRatio * 100)}%`;
  hpInner.style.background = hpRatio <= 0.35 ? 'linear-gradient(180deg, #ef4444 0%, #991b1b 100%)' : 'linear-gradient(180deg, #22c55e 0%, #15803d 100%)';

  friendlyEl.textContent = friendlies.filter(f => !f.isDying).length + 1;
  scoreEl.textContent = score;
}

function drawRadar() {
  const rX = canvas.width - 80;
  const rY = 85;
  const rSize = 55;

  ctx.save();
  ctx.fillStyle = 'rgba(12, 9, 7, 0.92)';
  ctx.strokeStyle = '#b45309';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(rX, rY, rSize, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = 'rgba(254, 240, 138, 0.5)';
  ctx.beginPath();
  ctx.moveTo(rX, rY);
  ctx.lineTo(rX + Math.cos(gameTime * 0.05) * rSize, rY + Math.sin(gameTime * 0.05) * rSize);
  ctx.stroke();

  ctx.fillStyle = '#22c55e';
  ctx.fillRect(rX - 2, rY - 2, 4, 4);

  ctx.fillStyle = '#38bdf8';
  friendlies.forEach(f => {
    if (!f.isDying) {
      let dx = (f.x - player.x) * 0.03;
      let dy = (f.y - player.y) * 0.03;
      if (Math.hypot(dx, dy) < rSize - 4) ctx.fillRect(rX + dx - 2, rY + dy - 2, 4, 4);
    }
  });

  ctx.fillStyle = '#ef4444';
  enemies.forEach(e => {
    if (!e.isDying) {
      let dx = (e.x - player.x) * 0.03;
      let dy = (e.y - player.y) * 0.03;
      if (Math.hypot(dx, dy) < rSize - 4) ctx.fillRect(rX + dx - 2, rY + dy - 2, 4, 4);
    }
  });

  ctx.restore();
}

function render() {
  let skyGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  if (currentWeather === 'CLEAR') {
    skyGradient.addColorStop(0.0, '#0c1938');
    skyGradient.addColorStop(0.4, '#1d4ed8');
    skyGradient.addColorStop(0.85, '#60a5fa');
    skyGradient.addColorStop(1.0, '#93c5fd');
  } else {
    skyGradient.addColorStop(0.0, '#090d16');
    skyGradient.addColorStop(0.5, '#1e293b');
    skyGradient.addColorStop(1.0, '#334155');
  }

  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  const shakeX = (Math.random() - 0.5) * screenShake;
  const shakeY = (Math.random() - 0.5) * screenShake;
  ctx.translate(-Math.floor(camX + shakeX), -Math.floor(camY + shakeY));

  clouds.filter(c => c.layer === 1).forEach(c => c.draw(camX, camY));
  clouds.filter(c => c.layer === 2).forEach(c => c.draw(camX, camY));

  const startX = Math.floor(camX - 200);
  const endX = Math.floor(camX + canvas.width + 200);

  if (startX < LEFT_BEACH_END) {
    const lOceanEndX = Math.min(endX, LEFT_OCEAN_END);
    if (startX < lOceanEndX) {
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(startX, BASE_GROUND_Y + 70, lOceanEndX - startX, 600);

      ctx.fillStyle = '#38bdf8';
      for (let wx = startX; wx < lOceanEndX; wx += 40) {
        const waveY = BASE_GROUND_Y + 70 + Math.sin(gameTime * 0.08 + wx * 0.02) * 3;
        ctx.fillRect(wx, waveY, 18, 3);
      }
    }
    drawPixelMatrix(PIXEL_CARRIER, CARRIER_WEST_X, BASE_GROUND_Y + 50, 3, 0, {
      '1': '#334155', '2': '#1e293b', '3': '#facc15'
    });
  }

  if (endX >= LEFT_OCEAN_END && startX < LEFT_BEACH_END) {
    const bStartX = Math.max(startX, LEFT_OCEAN_END);
    const bEndX = Math.min(endX, LEFT_BEACH_END);

    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.moveTo(bStartX, getGroundY(bStartX));
    for (let x = bStartX; x <= bEndX; x += 8) ctx.lineTo(x, getGroundY(x));
    ctx.lineTo(bEndX, BASE_GROUND_Y + 600);
    ctx.lineTo(bStartX, BASE_GROUND_Y + 600);
    ctx.fill();
  }

  if (endX >= LEFT_BEACH_END && startX < RIGHT_BEACH_START) {
    const landStartX = Math.max(startX, LEFT_BEACH_END);
    const landEndX = Math.min(endX, RIGHT_BEACH_START);

    ctx.fillStyle = currentWeather === 'CLEAR' ? '#16a34a' : '#14532d';
    ctx.beginPath();
    ctx.moveTo(landStartX, getGroundY(landStartX));
    for (let x = landStartX; x <= landEndX; x += 8) ctx.lineTo(x, getGroundY(x));
    ctx.lineTo(landEndX, BASE_GROUND_Y + 600);
    ctx.lineTo(landStartX, BASE_GROUND_Y + 600);
    ctx.fill();

    ctx.fillStyle = '#78350f';
    ctx.beginPath();
    ctx.moveTo(landStartX, getGroundY(landStartX) + 12);
    for (let x = landStartX; x <= landEndX; x += 8) ctx.lineTo(x, getGroundY(x) + 12);
    ctx.lineTo(landEndX, BASE_GROUND_Y + 600);
    ctx.lineTo(landStartX, BASE_GROUND_Y + 600);
    ctx.fill();

    const treeSpacing = 280;
    const firstTreeIdx = Math.floor(landStartX / treeSpacing);
    const lastTreeIdx = Math.floor(landEndX / treeSpacing);

    for (let i = firstTreeIdx; i <= lastTreeIdx; i++) {
      const treeX = i * treeSpacing;
      if (treeX >= LEFT_BEACH_END && treeX <= RIGHT_BEACH_START) {
        const treeY = getGroundY(treeX) - 20;
        drawPixelMatrix(PIXEL_TREE, treeX, treeY, 3, 0, { '1': '#15803d', '2': '#451a03' });
      }
    }
  }

  if (endX >= RIGHT_BEACH_START && startX < RIGHT_OCEAN_START) {
    const bStartX = Math.max(startX, RIGHT_BEACH_START);
    const bEndX = Math.min(endX, RIGHT_OCEAN_START);

    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.moveTo(bStartX, getGroundY(bStartX));
    for (let x = bStartX; x <= bEndX; x += 8) ctx.lineTo(x, getGroundY(x));
    ctx.lineTo(bEndX, BASE_GROUND_Y + 600);
    ctx.lineTo(bStartX, BASE_GROUND_Y + 600);
    ctx.fill();
  }

  if (endX >= RIGHT_OCEAN_START) {
    const rOceanStartX = Math.max(startX, RIGHT_OCEAN_START);
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(rOceanStartX, BASE_GROUND_Y + 70, endX - rOceanStartX + 200, 600);

    ctx.fillStyle = '#38bdf8';
    for (let wx = rOceanStartX; wx < endX + 200; wx += 40) {
      const waveY = BASE_GROUND_Y + 70 + Math.sin(gameTime * 0.08 + wx * 0.02) * 3;
      ctx.fillRect(wx, waveY, 18, 3);
    }

    drawPixelMatrix(PIXEL_CARRIER, CARRIER_EAST_X, BASE_GROUND_Y + 50, 3, 0, {
      '1': '#334155', '2': '#1e293b', '3': '#facc15'
    });
  }

  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 4;
  ctx.setLineDash([12, 12]);

  ctx.beginPath();
  ctx.moveTo(MAP_MIN_X, 0); ctx.lineTo(MAP_MIN_X, WORLD_HEIGHT);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(MAP_MAX_X, 0); ctx.lineTo(MAP_MAX_X, WORLD_HEIGHT);
  ctx.stroke();

  ctx.setLineDash([]);

  if (gameState !== 'START') {
    groundTargets.forEach(gt => gt.draw());
    people.forEach(p => p.draw());
    particles.forEach(p => p.draw());
    bullets.forEach(b => b.draw());
    friendlies.forEach(f => f.draw());
    enemies.forEach(e => e.draw());
    if (player) player.draw();
  }

  ctx.restore();

  if (currentWeather === 'STORM' && gameState === 'PLAYING') {
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    rainDrops.forEach(r => {
      ctx.moveTo(r.x, r.y);
      ctx.lineTo(r.x - 6, r.y + r.l);
    });
    ctx.stroke();
  }

  if (gameState === 'PLAYING') drawRadar();
}

let lastTime = 0;
const targetFPS = 60;
const frameInterval = 1000 / targetFPS;

function loop(currentTime) {
  requestAnimationFrame(loop);
  if (!lastTime) lastTime = currentTime;
  const deltaTime = currentTime - lastTime;
  if (deltaTime >= frameInterval) {
    lastTime = currentTime - (deltaTime % frameInterval);
    update();
    render();
  }
}

requestAnimationFrame(loop);