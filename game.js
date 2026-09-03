const canvas = document.querySelector('#world');
const context = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
const regenerateButton = document.querySelector('#regenerate');
const seedReadout = document.querySelector('#seed-readout');
const frontReadout = document.querySelector('#front-readout');
const objective = document.querySelector('#objective');
const artilleryReadout = document.querySelector('#artillery-readout');
const versionReadout = document.querySelector('#version-readout');

const GAME_VERSION = '0.9.0';
const VERSION_HISTORY = [{ version: '0.9.0', title: 'Player-Centered Side View' }, { version: '0.8.0', title: 'Fullscreen Terrain Build' }, { version: '0.7.0', title: 'Frontline Artillery Build' }, { version: '0.6.0', title: 'Campaign Weather Build' }];
const TILE = 4;
const WORLD_WIDTH = 720;
const WORLD_HEIGHT = 240;
const NORMAL_VIEW_WIDTH = canvas.width / TILE;
const ARTILLERY_VIEW_WIDTH = 220;
const palette = { sky: '#334440', cloud: '#263532', mist: '#708078', grass: '#6c725c', mud: '#59463a', darkMud: '#3e3530', wetMud: '#695143', timber: '#8e5b3e', timberDark: '#51392f', metal: '#9a9276', green: '#6f805e', greenDark: '#4f624c', blue: '#73a6a6', blueDark: '#416b6d', red: '#c27656', redDark: '#7e493d' };
const skinTones = ['#c29a78', '#ae8066', '#d0a681', '#9e705d'];
const keys = new Set();
let seed = Math.floor(Math.random() * 1000000);
let terrain = [];
let surfaceHeights = [];
let trenches = [];
let rain = [];
let bullets = [];
let explosions = [];
let particles = [];
let units = [];
let cameraX = 0;
let cameraY = 0;
let gameOver = false;
let artilleryMode = false;
let audioContext;
let lastTime = 0;

const player = { x: 48, y: 90, velocityY: 0, grounded: false, direction: 1, team: 'allied', skin: skinTones[0], health: 100, cooldown: 0, artilleryCooldown: 0, player: true, alive: true };

function random() { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }

function generateWorld() {
  const groundLine = 110;
  surfaceHeights = Array.from({ length: WORLD_WIDTH }, (_, x) => groundLine + Math.floor(Math.sin(x * .055) * 4 + Math.sin(x * .017) * 7 + (random() - .5) * 4));
  terrain = Array.from({ length: WORLD_HEIGHT }, (_, y) => Array.from({ length: WORLD_WIDTH }, (_, x) => {
    const surface = surfaceHeights[x];
    if (y < surface) return y > 58 && random() > .84 ? 'mist' : 'sky';
    const depth = y - surface;
    if (depth > 18 && depth < 56 && random() < .026) return 'sky';
    return depth < 4 ? (random() > .7 ? 'grass' : 'mud') : depth % 9 === 0 ? 'wetMud' : depth > 40 ? 'darkMud' : 'mud';
  }));
  trenches = [];
  [48, 180, 312, 444, 576].forEach((start, index) => {
    const width = 34 + Math.floor(random() * 12);
    const bottom = groundLine + 25 + Math.floor(random() * 9);
    trenches.push({ start, width, bottom, owner: index === 0 ? 'allied' : 'enemy', capture: 0, original: index === 0 });
    for (let x = start; x < start + width; x += 1) {
      const depth = Math.floor(Math.sin(((x - start) / width) * Math.PI) * 18);
      const trenchFloor = groundLine + depth;
      for (let y = surfaceHeights[x]; y < Math.min(WORLD_HEIGHT, trenchFloor + 1); y += 1) terrain[y][x] = y > trenchFloor - 3 ? 'darkMud' : 'mud';
    }
  });
  rain = Array.from({ length: 180 }, () => ({ x: random() * WORLD_WIDTH, y: random() * 180, length: 3 + random() * 7, speed: 60 + random() * 90 }));
  bullets = []; explosions = []; particles = []; units = [];
  player.x = 86; player.y = groundHeightAt(86) - 3; player.velocityY = 0; player.health = 100; player.skin = skinTones[Math.floor(random() * skinTones.length)]; player.direction = 1; player.cooldown = 0; player.artilleryCooldown = 0; player.alive = true;
  for (let index = 0; index < 6; index += 1) units.push(makeUnit(98 + index * 10, 'allied'));
  for (let index = 0; index < 9; index += 1) units.push(makeUnit(610 + index * 8, 'enemy'));
  if (seedReadout) seedReadout.textContent = `SEED ${String(Math.abs(Math.floor(seed))).padStart(6, '0').slice(-6)}`;
  cameraX = Math.max(0, player.x - viewWidth() / 2); cameraY = Math.max(0, player.y - viewHeight() / 2); gameOver = false; artilleryMode = false; if (objective) objective.textContent = 'Advance through the trenches. Keep the original line.'; updateArtilleryReadout();
  if (versionReadout) versionReadout.textContent = `v${GAME_VERSION}`;
}

function makeUnit(x, team) { return { x, y: 80, velocityY: 0, direction: team === 'allied' ? 1 : -1, team, skin: skinTones[Math.floor(random() * skinTones.length)], health: 100, cooldown: random() * 1.5, alive: true }; }
function groundHeightAt(x) { const column = terrain[Math.max(0, Math.min(WORLD_WIDTH - 1, Math.floor(x)))]; for (let y = 0; y < WORLD_HEIGHT; y += 1) if (column?.[y] !== 'sky' && column?.[y] !== 'cloud' && column?.[y] !== 'mist') return y; return 112; }
function viewWidth() { return artilleryMode ? Math.min(ARTILLERY_VIEW_WIDTH, WORLD_WIDTH) : canvas.width / TILE; }
function viewHeight() { return canvas.height / TILE; }
function screenScale() { return artilleryMode ? .72 : 1; }
function screenX(worldX) { return (worldX - cameraX) * TILE * screenScale(); }
function screenY(worldY) { return (worldY - cameraY) * TILE; }

function drawWorld() {
  context.fillStyle = palette.sky; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = palette.cloud; context.fillRect(0, screenY(38), canvas.width, 22 * TILE);
  context.fillStyle = '#475850'; context.fillRect(0, screenY(70), canvas.width, 10 * TILE);
  const startX = Math.max(0, Math.floor(cameraX)); const endX = Math.min(WORLD_WIDTH, startX + viewWidth() + 2); const startY = Math.max(0, Math.floor(cameraY)); const endY = Math.min(WORLD_HEIGHT, startY + viewHeight() + 2); const scaledTile = TILE * screenScale();
  for (let y = startY; y < endY; y += 1) for (let x = startX; x < endX; x += 1) { const material = terrain[y][x]; if (material !== 'sky') { context.fillStyle = palette[material]; context.fillRect(screenX(x), screenY(y), scaledTile, TILE); } }
  trenches.forEach(drawTrench); drawArtilleryStation(); drawRain(); drawExplosions(); drawBullets(); units.filter(unit => unit.alive).forEach(drawUnit); drawUnit(player); if (gameOver) drawGameOver();
}

function drawTrench(trench) {
  const top = groundHeightAt(trench.start + 3); const color = trench.owner === 'allied' ? palette.blue : trench.owner === 'enemy' ? palette.red : palette.metal;
  const scaledTile = TILE * screenScale(); context.fillStyle = palette.timberDark; context.fillRect(screenX(trench.start), screenY(top - 2), trench.width * scaledTile, TILE);
  context.fillStyle = palette.timber; for (let x = trench.start + 2; x < trench.start + trench.width - 1; x += 5) context.fillRect(screenX(x), screenY(top - 2), scaledTile, (trench.bottom - top + 1) * TILE);
  context.fillStyle = color; context.fillRect(screenX(trench.start + 2), screenY(top - 3), (trench.width - 4) * scaledTile, TILE);
}

function drawArtilleryStation() {
  const trench = trenches[0];
  if (!trench) return;
  const top = groundHeightAt(trench.start + 10);
  const x = screenX(trench.start + 10);
  context.fillStyle = palette.timberDark; context.fillRect(x - 4, screenY(top - 9), 10, TILE * 7);
  context.fillStyle = palette.metal; context.fillRect(x - 2, screenY(top - 10), 14, TILE * 2);
  context.fillStyle = palette.timber; context.fillRect(x + 6, screenY(top - 13), 3, TILE * 5);
}

function drawRain() { context.strokeStyle = 'rgba(183, 203, 193, .36)'; context.lineWidth = 1; rain.forEach(drop => { const x = screenX(drop.x); if (x > -10 && x < canvas.width + 10) { context.beginPath(); context.moveTo(x, screenY(drop.y)); context.lineTo(x - 2, screenY(drop.y) + drop.length); context.stroke(); } }); }
function drawBullets() { context.fillStyle = '#f0d59a'; bullets.forEach(bullet => context.fillRect(screenX(bullet.x), screenY(bullet.y), 1, 1)); }
function drawUnit(unit) { const x = Math.round(screenX(unit.x)); const y = Math.round(screenY(unit.y)); const scaledTile = TILE * screenScale(); if (x < -8 || x > canvas.width + 8) return; context.fillStyle = unit.skin; context.fillRect(x, y, scaledTile, TILE); context.fillStyle = unit.team === 'allied' ? palette.green : palette.redDark; context.fillRect(x, y + TILE, scaledTile, TILE); context.fillStyle = unit.team === 'allied' ? palette.greenDark : palette.red; context.fillRect(x, y + TILE * 2, scaledTile, TILE); context.fillStyle = unit.team === 'allied' ? palette.blue : palette.red; context.fillRect(x + (unit.direction > 0 ? scaledTile : -scaledTile), y + TILE * 2, scaledTile, TILE); }
function drawExplosions() { explosions.forEach(explosion => { context.fillStyle = `rgba(236, 169, 91, ${explosion.life})`; context.beginPath(); context.arc(screenX(explosion.x), screenY(explosion.y), explosion.radius * TILE, 0, Math.PI * 2); context.fill(); }); particles.forEach(particle => { context.fillStyle = particle.color; context.fillRect(screenX(particle.x), screenY(particle.y), TILE, TILE); }); }
function drawGameOver() { context.fillStyle = 'rgba(8, 12, 12, .78)'; context.fillRect(0, 0, canvas.width, canvas.height); context.fillStyle = '#e2d8bf'; context.font = '700 28px Barlow Condensed, sans-serif'; context.textAlign = 'center'; context.fillText('THE ORIGINAL LINE HAS FALLEN', canvas.width / 2, canvas.height / 2 - 8); context.font = '14px DM Mono, monospace'; context.fillText('PRESS NEW BATTLE TO RETURN TO THE FRONT', canvas.width / 2, canvas.height / 2 + 21); context.textAlign = 'left'; }
function updateArtilleryReadout() { if (artilleryReadout) artilleryReadout.textContent = artilleryMode ? 'ARTILLERY VIEW / LEFT CLICK TO FIRE / E TO EXIT' : 'RIFLE READY / FIND THE GUN'; }
function canEnterArtillery() { const trench = trenches[0]; return trench?.owner === 'allied' && Math.abs(player.x - (trench.start + 10)) < 15; }
function toggleArtillery() { if (artilleryMode) { artilleryMode = false; updateArtilleryReadout(); return; } if (canEnterArtillery()) { artilleryMode = true; cameraX = Math.max(0, player.x - viewWidth() / 2); updateArtilleryReadout(); } }

function startAudio() { if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)(); if (audioContext.state === 'suspended') audioContext.resume(); }
function sound(type) { if (!audioContext) return; const oscillator = audioContext.createOscillator(); const gain = audioContext.createGain(); oscillator.connect(gain); gain.connect(audioContext.destination); const now = audioContext.currentTime; const settings = type === 'shot' ? [150, .045, 'square'] : type === 'hit' ? [75, .1, 'sawtooth'] : [42, .35, 'sine']; oscillator.frequency.setValueAtTime(settings[0], now); oscillator.frequency.exponentialRampToValueAtTime(settings[0] * .35, now + settings[1]); oscillator.type = settings[2]; gain.gain.setValueAtTime(.045, now); gain.gain.exponentialRampToValueAtTime(.001, now + settings[1]); oscillator.start(now); oscillator.stop(now + settings[1]); }

function fire(unit, direction = unit.direction) { if (unit.cooldown > 0 || !unit.alive) return; startAudio(); unit.direction = direction < 0 ? -1 : 1; unit.cooldown = unit.player ? .22 : .9 + Math.random() * .7; bullets.push({ x: unit.x + (unit.direction > 0 ? 2 : -1), y: unit.y + 1.5, velocityX: unit.direction * 105, team: unit.team, damage: unit.player ? 35 : 25 }); sound('shot'); }
function artillery(worldX, worldY) { if (player.artilleryCooldown > 0 || gameOver) return; startAudio(); player.artilleryCooldown = 5; explosions.push({ x: worldX, y: worldY, radius: 1, life: 1 }); for (let y = Math.max(0, Math.floor(worldY - 15)); y < Math.min(WORLD_HEIGHT, Math.ceil(worldY + 15)); y += 1) for (let x = Math.max(0, Math.floor(worldX - 15)); x < Math.min(WORLD_WIDTH, Math.ceil(worldX + 15)); x += 1) if (Math.hypot(x - worldX, y - worldY) < 12 && ['grass', 'mud', 'wetMud', 'darkMud'].includes(terrain[y][x])) terrain[y][x] = 'sky'; trenches.forEach(trench => { if (worldX > trench.start && worldX < trench.start + trench.width && Math.abs(worldY - groundHeightAt(worldX)) < 25) trench.owner = 'neutral'; }); units.forEach(unit => { if (unit.alive && Math.hypot(unit.x - worldX, unit.y - worldY) < 15) unit.health -= 70; }); sound('blast'); }

function updateBullets(delta) { bullets = bullets.filter(bullet => { const steps = Math.max(1, Math.ceil(Math.abs(bullet.velocityX * delta) / 2)); for (let step = 0; step < steps; step += 1) { bullet.x += bullet.velocityX * delta / steps; const tileX = Math.floor(bullet.x); const tileY = Math.floor(bullet.y); const material = terrain[tileY]?.[tileX]; if (['grass', 'mud', 'wetMud', 'darkMud'].includes(material)) { terrain[tileY][tileX] = 'sky'; particles.push({ x: bullet.x, y: bullet.y, color: palette.mud }); sound('hit'); return false; } const target = units.find(unit => unit.alive && unit.team !== bullet.team && Math.abs(unit.x - bullet.x) < 2 && Math.abs(unit.y - bullet.y) < 4); if (target) { target.health -= bullet.damage; sound('hit'); if (target.health <= 0) target.alive = false; return false; } if (bullet.x < 0 || bullet.x >= WORLD_WIDTH) return false; } return true; }); }

function updateUnit(unit, delta) { if (!unit.alive) return; const enemies = units.concat(player).filter(candidate => candidate !== unit && candidate.alive && candidate.team !== unit.team); const target = enemies.sort((first, second) => Math.abs(first.x - unit.x) - Math.abs(second.x - unit.x))[0]; if (target) { const distance = target.x - unit.x; if (Math.abs(distance) > 45) unit.x += Math.sign(distance) * delta * 5; else if (Math.abs(distance) < 105) fire(unit, Math.sign(distance)); } unit.velocityY += 12 * delta; unit.y += unit.velocityY * delta; const floor = groundHeightAt(unit.x) - 3; if (unit.y >= floor) { unit.y = floor; unit.velocityY = 0; unit.grounded = true; } else unit.grounded = false; }
function updateTrenches(delta) { trenches.forEach(trench => { const occupants = units.concat(player).filter(unit => unit.alive && unit.x > trench.start + 3 && unit.x < trench.start + trench.width - 3); const allied = occupants.filter(unit => unit.team === 'allied').length; const enemy = occupants.filter(unit => unit.team === 'enemy').length; if (allied && !enemy && trench.owner !== 'allied') trench.capture = Math.min(100, trench.capture + delta * 12); if (enemy && !allied && trench.owner !== 'enemy') trench.capture = Math.max(-100, trench.capture - delta * 12); if (trench.capture >= 100) trench.owner = 'allied'; if (trench.capture <= -100) trench.owner = 'enemy'; }); const original = trenches[0]; if (frontReadout) frontReadout.textContent = `FRONT LINE / ${String(trenches.filter(trench => trench.owner === 'allied').length).padStart(2, '0')}`; if (original.owner === 'enemy' && !gameOver) { gameOver = true; if (objective) objective.textContent = 'The original trench was captured.'; sound('blast'); } }

function update(delta) {
  if (!gameOver) { const move = (keys.has('a') ? -1 : 0) + (keys.has('d') ? 1 : 0); player.x = Math.max(2, Math.min(WORLD_WIDTH - 3, player.x + move * delta * 30)); if (move) player.direction = move; if (artilleryMode && !canEnterArtillery()) { artilleryMode = false; updateArtilleryReadout(); } player.velocityY += 12 * delta; player.y += player.velocityY * delta; const floor = groundHeightAt(player.x) - 3; if (player.y >= floor) { player.y = floor; player.velocityY = 0; player.grounded = true; } else player.grounded = false; player.cooldown = Math.max(0, player.cooldown - delta); player.artilleryCooldown = Math.max(0, player.artilleryCooldown - delta); units.forEach(unit => { unit.cooldown = Math.max(0, unit.cooldown - delta); updateUnit(unit, delta); }); updateBullets(delta); updateTrenches(delta); rain.forEach(drop => { drop.y += drop.speed * delta / TILE; drop.x -= delta * 8; if (drop.y > cameraY + viewHeight()) { drop.y = cameraY - drop.length / TILE; drop.x = cameraX + random() * viewWidth(); } }); explosions = explosions.filter(explosion => { explosion.life -= delta * 2; explosion.radius += delta * 18; return explosion.life > 0; }); particles = particles.filter(particle => { particle.y += delta * 20; particle.x += (random() - .5) * delta * 10; return particle.y < WORLD_HEIGHT; }); cameraX += (player.x - cameraX - viewWidth() / 2) * Math.min(1, delta * 4); cameraY += (player.y - cameraY - viewHeight() / 2) * Math.min(1, delta * 5); cameraX = Math.max(0, Math.min(WORLD_WIDTH - viewWidth(), cameraX)); cameraY = Math.max(0, Math.min(WORLD_HEIGHT - viewHeight(), cameraY)); }
  drawWorld(); requestAnimationFrame(frame);
}
function frame(time) { const delta = Math.min(.05, (time - lastTime) / 1000 || 0); lastTime = time; update(delta); }
function pointerWorldX(event) { const bounds = canvas.getBoundingClientRect(); return cameraX + ((event.clientX - bounds.left) * canvas.width / bounds.width) / (TILE * screenScale()); }
function pointerWorldY(event) { const bounds = canvas.getBoundingClientRect(); return cameraY + ((event.clientY - bounds.top) * canvas.height / bounds.height) / TILE; }

window.addEventListener('keydown', event => { const key = event.key.toLowerCase(); if (['a', 'd', 'w', 'e', 'f', 'r'].includes(key)) event.preventDefault(); keys.add(key); startAudio(); if (key === 'w' && player.grounded && !gameOver) player.velocityY = -5; if (key === 'e' && !event.repeat) toggleArtillery(); if (key === 'f' && !event.repeat && !artilleryMode) fire(player); if (key === 'r' && !event.repeat) { seed = Math.floor(Math.random() * 1000000); generateWorld(); } });
window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
canvas.addEventListener('pointerdown', event => { startAudio(); if (artilleryMode) artillery(pointerWorldX(event), pointerWorldY(event)); else fire(player, pointerWorldX(event) < player.x ? -1 : 1); });
if (regenerateButton) regenerateButton.addEventListener('click', () => { seed = Math.floor(Math.random() * 1000000); generateWorld(); startAudio(); });
window.addEventListener('resize', () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; });

generateWorld(); requestAnimationFrame(frame);