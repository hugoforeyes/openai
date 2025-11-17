const ROACH_SIZE = 48;
const MAX_HANDS = 5;
const cssVars = getComputedStyle(document.documentElement);
const BOTTOM_SAFE_ZONE = parseFloat(cssVars.getPropertyValue("--ground-height")) || 80;
const MAX_LIVES = 3;

const area = document.getElementById("game-area");
const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const statusEl = document.getElementById("status");
const startBtn = document.getElementById("start-btn");
const handNodes = Array.from(document.querySelectorAll(".hand"));

const hands = handNodes.map((el, index) => ({
  el,
  busy: false,
  baseLeft: 0,
}));

let roaches = [];
let lastTime = null;
let active = false;
let spawnTimer = null;
let score = 0;
let lives = MAX_LIVES;

function random(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function resetHands() {
  const areaWidth = area.clientWidth;
  hands.forEach((hand, idx) => {
    const slotWidth = areaWidth / MAX_HANDS;
    const baseX = slotWidth * idx + slotWidth / 2 - hand.el.clientWidth / 2;
    hand.baseLeft = baseX;
    hand.el.style.left = `${baseX}px`;
    hand.el.classList.remove("hand--active");
    hand.busy = false;
  });
}

function buildRoach() {
  const wrapper = document.createElement("div");
  wrapper.className = "roach";
  wrapper.innerHTML = `
    <div class="legs"></div>
    <div class="body"></div>
    <div class="antenna"></div>
  `;
  return wrapper;
}

function spawnRoach() {
  const el = buildRoach();
  const areaWidth = area.clientWidth;
  const x = random(24, Math.max(24, areaWidth - ROACH_SIZE - 24));
  const speed = random(140, 240);
  const roach = {
    el,
    x,
    y: -ROACH_SIZE,
    speed,
    squashed: false,
    destroyed: false,
  };

  el.style.transform = `translate(${roach.x}px, ${roach.y}px)`;
  el.addEventListener("click", (event) => {
    event.stopPropagation();
    attemptSlam(roach);
  });

  roaches.push(roach);
  area.appendChild(el);
}

function attemptSlam(roach) {
  if (!active || roach.squashed || roach.destroyed) return;

  const hand = hands.find((h) => !h.busy);
  if (!hand) {
    flashStatus("Hết bàn tay! Đợi quay lại...", true);
    return;
  }

  roach.squashed = true;
  roach.el.classList.add("roach--squashed");

  const areaRect = area.getBoundingClientRect();
  const roachRect = roach.el.getBoundingClientRect();
  const targetX = clamp(roachRect.left - areaRect.left - hand.el.clientWidth / 2 + ROACH_SIZE / 2, 0, area.clientWidth - hand.el.clientWidth);
  const lift = clamp(area.clientHeight - BOTTOM_SAFE_ZONE - (roach.y + ROACH_SIZE / 2), 60, area.clientHeight - BOTTOM_SAFE_ZONE);

  hand.busy = true;
  hand.el.style.left = `${targetX}px`;
  hand.el.style.setProperty("--target-lift", `${lift}px`);
  hand.el.classList.add("hand--active");

  hand.el.addEventListener(
    "animationend",
    () => {
      hand.busy = false;
      hand.el.classList.remove("hand--active");
      hand.el.style.left = `${hand.baseLeft}px`;
    },
    { once: true }
  );

  setTimeout(() => squashRoach(roach), 200);
}

function squashRoach(roach) {
  if (roach.destroyed) return;
  roach.destroyed = true;
  roach.el.remove();
  score += 1;
  scoreEl.textContent = score.toString();
  flashStatus("Đập trúng!", false);
}

function endLife(message) {
  lives -= 1;
  livesEl.textContent = lives.toString();
  flashStatus(message, true);
  if (lives <= 0) {
    stopGame();
    statusEl.textContent = `${message} Hết lượt, bấm Bắt đầu để chơi lại.`;
  }
}

function flashStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function resetState() {
  roaches.forEach((r) => r.el.remove());
  roaches = [];
  score = 0;
  lives = MAX_LIVES;
  scoreEl.textContent = "0";
  livesEl.textContent = MAX_LIVES.toString();
  flashStatus("Chuẩn bị đập gián!", false);
  resetHands();
}

function update(timestamp) {
  if (!active) return;
  if (!lastTime) lastTime = timestamp;
  const delta = (timestamp - lastTime) / 1000;
  lastTime = timestamp;
  const areaHeight = area.clientHeight;

  roaches.forEach((roach) => {
    if (roach.destroyed) return;
    roach.y += roach.speed * delta;
    if (!roach.squashed && roach.y + ROACH_SIZE >= areaHeight - BOTTOM_SAFE_ZONE) {
      roach.destroyed = true;
      roach.el.remove();
      endLife("Gián chạm đất!");
      return;
    }
    roach.el.style.transform = `translate(${roach.x}px, ${roach.y}px)`;
  });

  roaches = roaches.filter((r) => !r.destroyed);

  if (active) {
    requestAnimationFrame(update);
  }
}

function startSpawning() {
  if (spawnTimer) clearInterval(spawnTimer);
  spawnTimer = setInterval(() => {
    if (!active) return;
    spawnRoach();
  }, 650);
}

function startGame() {
  resetState();
  active = true;
  lastTime = null;
  startSpawning();
  requestAnimationFrame(update);
}

function stopGame() {
  active = false;
  if (spawnTimer) clearInterval(spawnTimer);
  spawnTimer = null;
}

startBtn.addEventListener("click", () => {
  startGame();
});

window.addEventListener("resize", () => {
  resetHands();
});

// Initialize layout
resetHands();
flashStatus("Bấm Bắt đầu để chơi.");
