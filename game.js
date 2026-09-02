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
const battleBrief = document.getElementById('battle-brief');
const crtOverlay = document.getElementById('crt-overlay');
const crtToggle = document.getElementById('crt-toggle');
const hangarToggle = document.getElementById('hangar-toggle');
const hangarHonor = document.getElementById('hangar-honor');
const aircraftOptions = document.getElementById('aircraft-options');
const achievementList = document.getElementById('achievement-list');
const versionBadge = document.getElementById('version-badge');
const versionPanel = document.getElementById('version-panel');
const modifierBrief = document.getElementById('modifier-brief');
const upgradeHonor = document.getElementById('upgrade-honor');
const upgradeOptions = document.getElementById('upgrade-options');

// Audio Synthesizer Engine
let audioCtx = null;
let engineOsc = null;
let engineFilter = null;
let engineGain = null;
let honorBank = Number(localStorage.getItem('pixelSkyWarsHonor') || 0);
let selectedAircraft = localStorage.getItem('pixelSkyWarsAircraft') || 'scout';
let crtEnabled = localStorage.getItem('pixelSkyWarsCRT') === 'true';
const unlockedAircraft = JSON.parse(localStorage.getItem('pixelSkyWarsUnlocks') || '["scout"]');
const achievements = {
  ace: { label: 'ACE', detail: '5 kills / 30 sec', earned: false },
  touchAndGo: { label: 'TOUCH & GO', detail: 'Carrier deck landing', earned: false },
  closeCall: { label: 'CLOSE CALL', detail: 'Survive under 5% hull', earned: false }
};
const savedAchievements = JSON.parse(localStorage.getItem('pixelSkyWarsAchievements') || '{}');
Object.keys(achievements).forEach(id => { achievements[id].earned = savedAchievements[id] === true; });
let recentKills = [];
let smokeTrails = [];
let muzzleFlashes = [];
let radioCooldown = 0;
const VERSION = {
  number: '0.7.0',
  label: 'CAMPAIGN WEATHER BUILD',
  changes: 'Mission modifiers, Ace pilots, carrier upgrades'
};
const lastSeenVersion = localStorage.getItem('pixelSkyWarsVersion');
let campaignIndex = Number(localStorage.getItem('pixelSkyWarsCampaign') || 0);
let currentTerrain = 'HYBRID';
let enemyReserve = 0;
let friendlyReserve = 0;
let flakTimer = 0;
const carrierUpgrades = {
  repair: { name: 'DECK CREW', cost: 450, description: '+60 landing repair', level: 0, max: 3 },
  reserves: { name: 'RESERVE WINGS', cost: 600, description: '+1 squad replacement', level: 0, max: 3 },
  flak: { name: 'CARRIER FLAK', cost: 750, description: 'Carrier defense battery', level: 0, max: 2 }
};
const savedUpgrades = JSON.parse(localStorage.getItem('pixelSkyWarsCarrierUpgrades') || '{}');
Object.keys(carrierUpgrades).forEach(id => { carrierUpgrades[id].level = Math.min(carrierUpgrades[id].max, Number(savedUpgrades[id] || 0)); });

const CAMPAIGN = [
  { name: 'Battle of Ember Coast', terrain: 'HYBRID', weather: 'CLEAR', modifiers: ['WIND EAST', 'FLAK LOW'], kills: 20, enemies: 4, aces: 0, brief: 'Break the coastal air screen.' },
  { name: 'Battle of Dust Meridian', terrain: 'DESERT', weather: 'CLEAR', modifiers: ['DUST FOG', 'WIND SOUTH'], kills: 22, enemies: 5, aces: 1, brief: 'Cross the dry basin under open skies.' },
  { name: 'Battle of Iron Rain', terrain: 'LAND', weather: 'RAIN', modifiers: ['HEAVY FLAK', 'LOW VISIBILITY'], kills: 24, enemies: 6, aces: 1, brief: 'Hold the mainland through a downpour.' },
  { name: 'Battle of Cloud Citadel', terrain: 'HYBRID', weather: 'CLOUDY', modifiers: ['CLOUD BANKS', 'WIND WEST'], kills: 26, enemies: 6, aces: 2, brief: 'Find the enemy fleet above the cloud shelf.' },
  { name: 'Battle of Moonlit Straits', terrain: 'HYBRID', weather: 'NIGHT', modifiers: ['NIGHT FOG', 'HEAVY FLAK'], kills: 28, enemies: 7, aces: 2, brief: 'Finish the campaign in the dark.' }
];

function getCurrentBattle() { return CAMPAIGN[Math.min(campaignIndex, CAMPAIGN.length - 1)]; }
function hasModifier(name) { return getCurrentBattle().modifiers.some(modifier => modifier.includes(name)); }
function renderBattleBrief() {
  const battle = getCurrentBattle();
  battleBrief.textContent = `${battle.name} / ${battle.terrain} / ${battle.weather} / ${battle.brief}`;
  modifierBrief.textContent = `MODIFIERS: ${battle.modifiers.join(' / ')}`;
}
function renderVersionTracker() {
  versionBadge.textContent = `BUILD ${VERSION.number}`;
  versionPanel.innerHTML = `<strong>VERSION ${VERSION.number}</strong> / ${VERSION.label}<br>${VERSION.changes}${lastSeenVersion && lastSeenVersion !== VERSION.number ? '<br><strong>UPDATE DETECTED</strong>' : ''}`;
  localStorage.setItem('pixelSkyWarsVersion', VERSION.number);
}
renderBattleBrief();
renderVersionTracker();

const AIRCRAFT = {
  scout: { name: 'SCOUT', cost: 0, speed: 6, hp: 300, turn: 0.038, description: 'Balanced flight' },
  interceptor: { name: 'INTERCEPTOR', cost: 500, speed: 8.7, hp: 220, turn: 0.055, description: 'Nimble / high speed' },
  bomber: { name: 'BOMBER', cost: 900, speed: 4.8, hp: 520, turn: 0.024, description: 'Heavy / high health' }
};

function renderHangar() {
  hangarHonor.textContent = honorBank;
  upgradeHonor.textContent = honorBank;
  aircraftOptions.innerHTML = Object.entries(AIRCRAFT).map(([id, craft]) => {
    const unlocked = unlockedAircraft.includes(id);
    return `<button class="aircraft-card ${selectedAircraft === id ? 'selected' : ''} ${unlocked ? '' : 'locked'}" data-aircraft="${id}"><strong>${craft.name}</strong><small>${unlocked ? craft.description : `UNLOCK ${craft.cost} HONOR`}</small></button>`;
  }).join('');
  achievementList.innerHTML = Object.values(achievements).map(badge => `<span class="badge ${badge.earned ? 'earned' : ''}">${badge.earned ? '★ ' : ''}${badge.label}<br><small>${badge.detail}</small></span>`).join('');
  aircraftOptions.querySelectorAll('[data-aircraft]').forEach(button => button.addEventListener('click', () => {
    const aircraftId = button.dataset.aircraft;
    if (!unlockedAircraft.includes(aircraftId)) {
      const craft = AIRCRAFT[aircraftId];
      if (honorBank < craft.cost) return;
      honorBank -= craft.cost;
      unlockedAircraft.push(aircraftId);
      localStorage.setItem('pixelSkyWarsHonor', honorBank);
      localStorage.setItem('pixelSkyWarsUnlocks', JSON.stringify(unlockedAircraft));
    }
    selectedAircraft = aircraftId;
    localStorage.setItem('pixelSkyWarsAircraft', selectedAircraft);
    renderHangar();
  }));
  upgradeOptions.innerHTML = Object.entries(carrierUpgrades).map(([id, upgrade]) => {
    const maxed = upgrade.level >= upgrade.max;
    const cost = upgrade.cost * (upgrade.level + 1);
    return `<button class="upgrade-card ${maxed ? 'maxed' : ''}" data-upgrade="${id}" ${maxed ? 'disabled' : ''}><strong>${upgrade.name} LV ${upgrade.level}/${upgrade.max}</strong><small>${maxed ? 'MAXIMUM READY' : `${upgrade.description} / ${cost} HONOR`}</small></button>`;
  }).join('');
  upgradeOptions.querySelectorAll('[data-upgrade]').forEach(button => button.addEventListener('click', () => {
    const upgrade = carrierUpgrades[button.dataset.upgrade];
    const cost = upgrade.cost * (upgrade.level + 1);
    if (upgrade.level >= upgrade.max || honorBank < cost) return;
    honorBank -= cost;
    upgrade.level++;
    localStorage.setItem('pixelSkyWarsHonor', honorBank);
    localStorage.setItem('pixelSkyWarsCarrierUpgrades', JSON.stringify(Object.fromEntries(Object.entries(carrierUpgrades).map(([id, item]) => [id, item.level]))));
    renderHangar();
  }));
}

function awardAchievement(id) {
  if (achievements[id].earned) return;
  achievements[id].earned = true;
  localStorage.setItem('pixelSkyWarsAchievements', JSON.stringify(Object.fromEntries(Object.entries(achievements).map(([key, badge]) => [key, badge.earned]))));
  renderHangar();
  eventBanner.textContent = `BADGE EARNED: ${achievements[id].label}`;
  eventBanner.style.display = 'block';
  setTimeout(() => { eventBanner.style.display = 'none'; }, 2500);
}

function playRadioChatter() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();
  osc.type = 'square';
  osc.frequency.setValueAtTime(180 + Math.random() * 80, now);
  osc.frequency.setValueAtTime(520 + Math.random() * 160, now + 0.055);
  osc.frequency.setValueAtTime(260, now + 0.11);
  filter.type = 'lowpass'; filter.frequency.value = 1200;
  gain.gain.setValueAtTime(0.0001, now); gain.gain.linearRampToValueAtTime(0.07, now + 0.012); gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
  osc.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination); osc.start(now); osc.stop(now + 0.17);
}

function spawnEngineSmoke(plane) {
  if (smokeTrails.length > 80) smokeTrails.shift();
  smokeTrails.push({
    x: plane.x - Math.cos(plane.angle) * 18 + (Math.random() - 0.5) * 8,
    y: plane.y - Math.sin(plane.angle) * 18 + (Math.random() - 0.5) * 8,
    size: 3 + Math.random() * 5, life: 42
  });
}

function spawnMuzzleFlash(plane) {
  muzzleFlashes.push({ x: plane.x + Math.cos(plane.angle) * 24, y: plane.y + Math.sin(plane.angle) * 24, angle: plane.angle, life: 4 });
}

function fireCannon(plane) {
  bullets.push(new Bullet(plane.x, plane.y, plane.angle, plane));
  spawnMuzzleFlash(plane);
}

crtToggle.classList.toggle('active', crtEnabled);
crtOverlay.classList.toggle('active', crtEnabled);
crtToggle.textContent = `CRT: ${crtEnabled ? 'ON' : 'OFF'}`;
crtToggle.addEventListener('click', () => {
  crtEnabled = !crtEnabled; localStorage.setItem('pixelSkyWarsCRT', crtEnabled);
  crtOverlay.classList.toggle('active', crtEnabled); crtToggle.textContent = `CRT: ${crtEnabled ? 'ON' : 'OFF'}`;
});
hangarToggle.addEventListener('click', () => {
  if (gameState !== 'PLAYING') return;
  gameState = 'HANGAR';
  document.querySelector('.start-btn').textContent = 'RESUME SORTIE';
  startOverlay.style.display = 'flex';
});
renderHangar();

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
let winKillTarget = 20;
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

const MAP_MIN_X = -3000;
const MAP_MAX_X = 5000;
const LEFT_OCEAN_END = -1100;
const LEFT_BEACH_END = -450;
const RIGHT_BEACH_START = 2550;
const RIGHT_OCEAN_START = 3100;

const WORLD_HEIGHT = 1800;
const BASE_GROUND_Y = 1600;
const CARRIER_WEST_X = -2200;
const CARRIER_EAST_X = 4100;

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
const PIXEL_CLOUD_WISP = [
  ".....1111........",
  "..1111111111.....",
  ".1111111111111...",
  "111111111111111..",
  "..111111111111..."
];
const PIXEL_CLOUD_TOWER = [
  "......1111.......",
  "...111111111.....",
  ".1111111111111...",
  "1111111111111111.",
  "1111111111111111.",
  "...1111111111...."
];
const PIXEL_CLOUD_STREAK = [
  "1111111111111111.",
  ".111111111111111.",
  "...1111111111111.",
  ".....11111111111."
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
    this.aircraftId = isPlayer ? selectedAircraft : 'scout';
    this.aircraft = AIRCRAFT[this.aircraftId];
    this.spriteScale = this.aircraftId === 'bomber' ? 4 : (this.aircraftId === 'interceptor' ? 2 : SPRITE_SIZE);
    this.speed = this.aircraft.speed;
    this.isPlayer = isPlayer;
    this.isFriendly = isFriendly;
    this.maxHp = this.aircraft.hp;
    this.hp = this.maxHp;
    this.gunTimer = 0;
    this.isStalled = false;
    this.isDying = false;
    this.landingCooldown = 0;
    this.isRetreating = false;
    this.kills = 0;
    this.collisionCooldown = 0;
    this.isAce = false;

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
    if (this.collisionCooldown > 0) this.collisionCooldown--;
    if (this.landingCooldown > 0) {
      this.landingCooldown--;
      this.vx = 0;
      this.vy = 0;
      if (keys['w'] || keys['shift']) this.landingCooldown = 0;
      return;
    }
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
    if (this.isAce && !this.isRetreating) this.angle += Math.sin(gameTime * 0.08) * 0.012;

    if (this.isPlayer) {
      const targetWorldX = mouseX + camX;
      const targetWorldY = mouseY + camY;
      const targetAngle = Math.atan2(targetWorldY - this.y, targetWorldX - this.x);

      const pitchUp = -Math.sin(this.angle);
      let altitudeDrag = Math.max(0, (500 - this.y) * 0.00012);
      let turnSpeed = this.aircraft.turn;

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
          this.speed = Math.min(this.aircraft.speed * 1.45, this.speed + 0.07 * Math.abs(pitchUp));
        } else {
          if (this.speed < this.aircraft.speed) this.speed += 0.04;
          if (this.speed > this.aircraft.speed) this.speed -= 0.04;
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

      const overCarrier = (Math.abs(this.x - CARRIER_WEST_X) < 270 || Math.abs(this.x - CARRIER_EAST_X) < 270) && this.y > BASE_GROUND_Y - 180 && this.y < BASE_GROUND_Y - 20 && this.vy > 0;
      if (overCarrier && this.speed < 4.5) {
        this.y = BASE_GROUND_Y - 120;
        this.speed = 0;
        this.hp = Math.min(this.maxHp, this.hp + 120 + carrierUpgrades.repair.level * 60);
        this.landingCooldown = 45;
        awardAchievement('touchAndGo');
        eventBanner.textContent = 'CARRIER DECK LANDING: HULL REPAIRED';
        eventBanner.style.display = 'block';
        setTimeout(() => { eventBanner.style.display = 'none'; }, 2200);
      }

      if (this.hp / this.maxHp <= 0.35 && Math.random() < 0.7) spawnEngineSmoke(this);

      if (this.gunTimer > 0) this.gunTimer--;
      if (keys['w'] && this.gunTimer <= 0) {
        fireCannon(this);
        this.gunTimer = 6;
        screenShake = Math.max(screenShake, 3.5);
        playSound('shoot');
      }

    } else {
      if (this.hp / this.maxHp <= 0.3) this.isRetreating = true;
      let target = null;
      let minDist = Infinity;

      if (this.isRetreating) {
        target = { x: this.isFriendly ? CARRIER_WEST_X : CARRIER_EAST_X, y: BASE_GROUND_Y - 160, vx: 0, vy: 0 };
        minDist = Math.hypot(target.x - this.x, target.y - this.y);
      } else if (this.isFriendly) {
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
          if (dist < 340 && dist > 1) {
            let angleToOther = Math.atan2(other.y - this.y, other.x - this.x);
            let diff = angleToOther - this.angle;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;

            if (Math.abs(diff) < 2.2) {
              avoidTurn += (diff > 0 ? -0.12 : 0.12) * (1 - dist / 340);
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
          if (!this.isRetreating && minDist < 520 && minDist > 100 && Math.abs(diff) < 0.22 && this.gunTimer <= 0) {
            fireCannon(this);
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
      if (this.isRetreating && Math.hypot(this.x - (this.isFriendly ? CARRIER_WEST_X : CARRIER_EAST_X), this.y - (BASE_GROUND_Y - 160)) < 120) {
        this.hp = Math.max(this.hp, this.maxHp * 0.7);
        this.isRetreating = false;
      }
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
    drawPixelMatrix(PIXEL_PLANE, this.x, this.y, this.spriteScale, this.angle, this.palette);
    const visibleKills = Math.min(this.kills, 20);
    if (visibleKills > 0) {
      ctx.save();
      ctx.translate(Math.floor(this.x), Math.floor(this.y));
      ctx.rotate(this.angle);
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 2;
      for (let i = 0; i < visibleKills; i++) {
        const group = Math.floor(i / 5);
        const mark = i % 5;
        const markX = -30 + group * 18 + mark * 3;
        ctx.beginPath();
        ctx.moveTo(markX, -25);
        ctx.lineTo(markX, -17);
        if (mark === 4) {
          ctx.moveTo(markX - 2, -26);
          ctx.lineTo(markX + 2, -16);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}

class Bullet {
  constructor(x, y, angle, owner = null) {
    this.x = x + Math.cos(angle) * 22;
    this.y = y + Math.sin(angle) * 22;
    const bulletSpeed = 18;
    this.vx = Math.cos(angle) * bulletSpeed;
    this.vy = Math.sin(angle) * bulletSpeed;
    this.gravity = 0.18;
    this.life = 70;
    this.ricochetsLeft = 2;
    this.owner = owner;
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
    this.variant = [PIXEL_CLOUD, PIXEL_CLOUD_WISP, PIXEL_CLOUD_TOWER, PIXEL_CLOUD_STREAK][Math.floor(Math.random() * 4)];
    if (currentWeather === 'CLOUDY') this.opacity = Math.min(0.9, this.opacity + 0.15);
    this.palette = { '1': `rgba(255, 255, 255, ${this.opacity})` };
  }

  draw(camX, camY) {
    const factor = this.layer === 1 ? 0.3 : 0.6;
    const renderX = this.x + camX * (1 - factor);
    const renderY = this.y + camY * (1 - factor);
    drawPixelMatrix(this.variant, renderX, renderY, this.scale, 0, this.palette);
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
    playRadioChatter();
    eventBanner.textContent = "SQUAD TRANSFER! TAKING CONTROL OF WINGMAN!";
    eventBanner.style.display = "block";
    setTimeout(() => { eventBanner.style.display = "none"; }, 3000);
  } else {
    gameOver();
  }
}

function registerTargetEliminated(scoreValue, isAirKill = false) {
  score += scoreValue;
  honorBank += scoreValue;
  localStorage.setItem('pixelSkyWarsHonor', honorBank);
  renderHangar();
  totalTargetsEliminated++;

  if (isAirKill) {
    recentKills.push(gameTime);
    recentKills = recentKills.filter(killTime => gameTime - killTime <= 1800);
    if (recentKills.length >= 5) awardAchievement('ace');
  }

  const progressRatio = Math.min(1.0, totalTargetsEliminated / winKillTarget);
  progressBarInner.style.width = `${progressRatio * 100}%`;
  progressLabel.textContent = `MISSION PROGRESS: ${Math.floor(progressRatio * 100)}% (${totalTargetsEliminated}/${winKillTarget} TARGETS)`;

  if (totalTargetsEliminated >= winKillTarget) victory();
}

function startGame() {
  if (gameState === 'HANGAR') {
    startOverlay.style.display = 'none';
    gameState = 'PLAYING';
    document.querySelector('.start-btn').textContent = 'ENTER BATTLE';
    return;
  }
  if (gameState === 'VICTORY') {
    campaignIndex = (campaignIndex + 1) % CAMPAIGN.length;
    localStorage.setItem('pixelSkyWarsCampaign', campaignIndex);
  }
  initAudio();
  const battle = getCurrentBattle();
  winKillTarget = battle.kills;
  currentTerrain = battle.terrain;
  currentWeather = battle.weather;
  renderBattleBrief();
  enemyReserve = Math.max(0, battle.kills + 4 - battle.enemies);
  friendlyReserve = 3 + carrierUpgrades.reserves.level;
  flakTimer = 0;
  score = 0; gameTime = 0; craters = []; totalTargetsEliminated = 0;
  bullets = []; particles = []; smokeTrails = []; muzzleFlashes = []; clouds = []; friendlies = []; enemies = []; people = []; groundTargets = [];
  recentKills = []; radioCooldown = 0;
  halfTimeTriggered = false;

  progressBarInner.style.width = '0%';
  progressLabel.textContent = `MISSION PROGRESS: 0% (0/${winKillTarget} TARGETS)`;

  player = new Plane(800, 500, true, true);

  for (let i = 0; i < 30; i++) clouds.push(new ParallaxCloud(1));
  for (let i = 0; i < 25; i++) clouds.push(new ParallaxCloud(2));

  for (let i = 0; i < 7; i++) {
    friendlies.push(new Plane(600 - i * 120, 450 + (i % 3) * 60, false, true));
  }

  for (let i = 0; i < battle.enemies; i++) {
    const enemy = new Plane(1600 + i * 200, 400 + i * 120, false, false);
    if (i < battle.aces) {
      enemy.isAce = true;
      enemy.maxHp = 420;
      enemy.hp = enemy.maxHp;
      enemy.speed += 1.2;
      enemy.palette = { '1': '#7c3aed', '2': '#c084fc', '3': '#fef08a', '4': '#f97316' };
    }
    enemies.push(enemy);
  }

  for (let i = 0; i < 6; i++) {
    people.push(new Person(i * 300 + Math.random() * 100, Math.random() < 0.5));
  }

  groundTargets.push(new GroundTarget(200, 'turret'));
  groundTargets.push(new GroundTarget(800, 'turret'));
  groundTargets.push(new GroundTarget(1400, 'turret'));
  groundTargets.push(new GroundTarget(-1200, currentTerrain === 'HYBRID' ? 'gunboat' : 'turret'));
  groundTargets.push(new GroundTarget(3000, currentTerrain === 'HYBRID' ? 'gunboat' : 'turret'));

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
  document.querySelector('#start-overlay p').innerHTML = `Final Score: <strong>${score}</strong> | Mission Progress: <strong>${totalTargetsEliminated}/${winKillTarget} Targets</strong>`;
  document.querySelector('.start-btn').textContent = 'RETRY BATTLE';
  startOverlay.style.display = 'flex';
}

function victory() {
  gameState = 'VICTORY';
  stallWarning.style.display = 'none';
  const nextBattle = CAMPAIGN[(campaignIndex + 1) % CAMPAIGN.length];
  document.querySelector('#start-overlay h1').textContent = 'BATTLE WON';
  document.querySelector('#start-overlay p').innerHTML = `${getCurrentBattle().name} secured.<br>Final Score: <strong>${score}</strong><br>Next operation: <strong>${nextBattle.name}</strong>`;
  document.querySelector('.start-btn').textContent = 'NEXT BATTLE';
  startOverlay.style.display = 'flex';
}

window.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

function update() {
  if (gameState !== 'PLAYING') return;

  gameTime++;
  if (screenShake > 0) screenShake *= 0.88;
  if (radioCooldown > 0) radioCooldown--;
  flakTimer++;

  if (hasModifier('WIND')) {
    const windDirection = hasModifier('EAST') || hasModifier('WEST') ? (hasModifier('WEST') ? -1 : 1) : 0;
    const windStrength = windDirection || (hasModifier('SOUTH') ? 0.5 : 0);
    player.x += windStrength * 0.18;
    friendlies.forEach(plane => { plane.x += windStrength * 0.18; });
    enemies.forEach(plane => { plane.x += windStrength * 0.18; });
  }

  player.update();
  if (player.hp > 0 && player.hp / player.maxHp <= 0.05) awardAchievement('closeCall');
  if (radioCooldown === 0 && enemies.some(enemy => !enemy.isDying && Math.hypot(enemy.x - player.x, enemy.y - player.y) < 500)) {
    playRadioChatter();
    radioCooldown = 240;
  }
  stallWarning.style.display = (player.isStalled && !player.isDying) ? 'block' : 'none';

  camX = player.x - canvas.width / 2;
  camY = player.y - canvas.height / 2;
  camY = Math.max(0, Math.min(WORLD_HEIGHT - canvas.height, camY));

  if (currentTerrain === 'HYBRID' && currentWeather === 'CLEAR' && totalTargetsEliminated >= 10 && !halfTimeTriggered) {
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
      if (p1.collisionCooldown === 0 && p2.collisionCooldown === 0 && Math.hypot(p1.x - p2.x, p1.y - p2.y) < 26) {
        const separationAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        p1.hp -= 45;
        p2.hp -= 45;
        p1.collisionCooldown = 30;
        p2.collisionCooldown = 30;
        p1.x -= Math.cos(separationAngle) * 18;
        p1.y -= Math.sin(separationAngle) * 18;
        p2.x += Math.cos(separationAngle) * 18;
        p2.y += Math.sin(separationAngle) * 18;
        p1.angle -= 0.35;
        p2.angle += 0.35;
        spawnExplosion((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, 14);
        screenShake = 8;
      }
    }
  }

  groundTargets.forEach(gt => gt.update());
  people.forEach(p => p.update());

  for (let i = friendlies.length - 1; i >= 0; i--) {
    const f = friendlies[i];
    f.update();
    if (f.dead) {
      friendlies.splice(i, 1);
      if (friendlyReserve > 0) {
        friendlies.push(new Plane(CARRIER_WEST_X + 140, BASE_GROUND_Y - 150, false, true));
        friendlyReserve--;
      }
    }
  }

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.update();
    if (e.dead) {
      enemies.splice(i, 1);
      registerTargetEliminated(200, true);
      if (gameState !== 'PLAYING') return;
    }
  }

  if (enemies.length < 3 && enemyReserve > 0 && totalTargetsEliminated < winKillTarget) {
    const enemy = new Plane(player.x + 1000 + Math.random() * 300, Math.random() * 800 + 200, false, false);
    enemy.isAce = Math.random() < getCurrentBattle().aces / Math.max(1, getCurrentBattle().enemies);
    if (enemy.isAce) {
      enemy.maxHp = 420;
      enemy.hp = enemy.maxHp;
      enemy.speed += 1.2;
      enemy.palette = { '1': '#7c3aed', '2': '#c084fc', '3': '#fef08a', '4': '#f97316' };
    }
    enemies.push(enemy);
    enemyReserve--;
  }

  if (flakTimer >= 45) {
    flakTimer = 0;
    if (hasModifier('HEAVY FLAK') || carrierUpgrades.flak.level > 0) {
      enemies.forEach(enemy => {
        if (!enemy.isDying && Math.abs(enemy.x - CARRIER_WEST_X) < 520) {
          enemy.hp -= hasModifier('HEAVY FLAK') ? 5 : carrierUpgrades.flak.level * 8;
          spawnExplosion(enemy.x, enemy.y, 3);
        }
      });
    }
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
          if (e.hp <= 0) {
            e.hp = 0;
            e.isDying = true;
            if (b.owner) b.owner.kills++;
          }
        } else {
          e.hp -= 12;
          spawnExplosion(b.x, b.y, 6);
          if (e.hp <= 0) {
            e.hp = 0;
            e.isDying = true;
            if (b.owner) b.owner.kills++;
          }
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

  for (let i = smokeTrails.length - 1; i >= 0; i--) {
    smokeTrails[i].life--;
    smokeTrails[i].size += 0.08;
    if (smokeTrails[i].life <= 0) smokeTrails.splice(i, 1);
  }
  for (let i = muzzleFlashes.length - 1; i >= 0; i--) {
    muzzleFlashes[i].life--;
    if (muzzleFlashes[i].life <= 0) muzzleFlashes.splice(i, 1);
  }

  if (currentWeather === 'RAIN' || currentWeather === 'STORM') {
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
  } else if (currentWeather === 'NIGHT') {
    skyGradient.addColorStop(0.0, '#020617');
    skyGradient.addColorStop(0.55, '#172554');
    skyGradient.addColorStop(1.0, '#334155');
  } else if (currentWeather === 'CLOUDY') {
    skyGradient.addColorStop(0.0, '#334155');
    skyGradient.addColorStop(0.55, '#64748b');
    skyGradient.addColorStop(1.0, '#cbd5e1');
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

  if (currentTerrain !== 'HYBRID') {
    const terrainStart = Math.floor(camX - 200);
    const terrainEnd = Math.floor(camX + canvas.width + 200);
    ctx.fillStyle = currentTerrain === 'DESERT' ? '#c28b4b' : '#166534';
    ctx.beginPath();
    ctx.moveTo(terrainStart, getGroundY(terrainStart));
    for (let x = terrainStart; x <= terrainEnd; x += 8) ctx.lineTo(x, getGroundY(x));
    ctx.lineTo(terrainEnd, BASE_GROUND_Y + 600);
    ctx.lineTo(terrainStart, BASE_GROUND_Y + 600);
    ctx.fill();
  }

  clouds.filter(c => c.layer === 1).forEach(c => c.draw(camX, camY));
  clouds.filter(c => c.layer === 2).forEach(c => c.draw(camX, camY));

  const startX = Math.floor(camX - 200);
  const endX = Math.floor(camX + canvas.width + 200);

  if (currentTerrain === 'HYBRID' && startX < LEFT_BEACH_END) {
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

  if (currentTerrain === 'HYBRID' && endX >= LEFT_OCEAN_END && startX < LEFT_BEACH_END) {
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

  if (currentTerrain === 'HYBRID' && endX >= LEFT_BEACH_END && startX < RIGHT_BEACH_START) {
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

  if (currentTerrain === 'HYBRID' && endX >= RIGHT_BEACH_START && startX < RIGHT_OCEAN_START) {
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

  if (currentTerrain === 'HYBRID' && endX >= RIGHT_OCEAN_START) {
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
    smokeTrails.forEach(smoke => {
      ctx.fillStyle = `rgba(30, 41, 59, ${smoke.life / 70})`;
      ctx.fillRect(Math.floor(smoke.x), Math.floor(smoke.y), smoke.size, smoke.size);
    });
    particles.forEach(p => p.draw());
    bullets.forEach(b => b.draw());
    muzzleFlashes.forEach(flash => {
      ctx.save();
      ctx.translate(Math.floor(flash.x), Math.floor(flash.y));
      ctx.rotate(flash.angle);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(0, -3, 22, 6);
      ctx.fillStyle = '#f97316';
      ctx.fillRect(7, -5, 13, 10);
      ctx.restore();
    });
    friendlies.forEach(f => f.draw());
    enemies.forEach(e => e.draw());
    if (player) player.draw();
  }

  ctx.restore();

  if ((currentWeather === 'RAIN' || currentWeather === 'STORM') && gameState === 'PLAYING') {
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    rainDrops.forEach(r => {
      ctx.moveTo(r.x, r.y);
      ctx.lineTo(r.x - 6, r.y + r.l);
    });
    ctx.stroke();
  }

  if ((hasModifier('FOG') || hasModifier('VISIBILITY')) && gameState === 'PLAYING') {
    ctx.fillStyle = currentWeather === 'NIGHT' ? 'rgba(2, 6, 23, 0.38)' : 'rgba(203, 213, 225, 0.2)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
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