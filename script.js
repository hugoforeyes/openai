const ROACH_SIZE = 48;
const MAX_HANDS = 5;
const cssVars = getComputedStyle(document.documentElement);
const BOTTOM_SAFE_ZONE = parseFloat(cssVars.getPropertyValue("--ground-height")) || 80;

const area = document.getElementById("game-area");
const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const statusEl = document.getElementById("status");
const startBtn = document.getElementById("start-btn");
const difficultyModal = document.getElementById("difficulty-modal");
const currentDifficultyEl = document.getElementById("current-difficulty");
const handNodes = Array.from(document.querySelectorAll(".hand"));
const highscoreEl = document.getElementById("highscore");
const skillBtn = document.getElementById("skill-btn");
const skillCooldownEl = document.getElementById("skill-cooldown");
const explosionContainer = document.getElementById("explosion-container");
const topbar = document.getElementById("topbar");
const menuToggle = document.getElementById("menu-toggle");
const mobileScoreEl = document.getElementById("mobile-score");
const mobileLivesEl = document.getElementById("mobile-lives");
const instructions = document.getElementById("instructions");

const hands = handNodes.map((el, index) => ({
  el,
  busy: false,
  baseLeft: 0,
}));

// Difficulty settings
const DIFFICULTY_LEVELS = {
  easy: {
    name: "Dễ",
    spawnInterval: 1000,
    speedMin: 100,
    speedMax: 180,
    lives: 5,
  },
  medium: {
    name: "Trung bình",
    spawnInterval: 650,
    speedMin: 140,
    speedMax: 240,
    lives: 3,
  },
  hard: {
    name: "Khó",
    spawnInterval: 450,
    speedMin: 200,
    speedMax: 320,
    lives: 2,
  },
  extreme: {
    name: "Cực khó",
    spawnInterval: 300,
    speedMin: 280,
    speedMax: 420,
    lives: 1,
  },
};

let roaches = [];
let lastTime = null;
let active = false;
let spawnTimer = null;
let score = 0;
let lives = 3;
let currentDifficulty = null;
let highscore = 0;
let skillCooldown = 0;
let skillCooldownTimer = null;

// Roach types
const ROACH_TYPES = {
  NORMAL: 'normal',
  FAST: 'fast',
  BOSS: 'boss'
};

// Audio context for sound effects
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

function random(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Sound effects using Web Audio API
function playSound(type) {
  try {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    switch(type) {
      case 'slam':
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(200, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(50, audioContext.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.1);
        break;
      case 'roach':
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(150, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(100, audioContext.currentTime + 0.15);
        gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.15);
        break;
      case 'lose':
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(150, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(80, audioContext.currentTime + 0.3);
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.3);
        break;
      case 'explosion':
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(100, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(30, audioContext.currentTime + 0.2);
        gainNode.gain.setValueAtTime(0.4, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.2);
        break;
    }
  } catch (e) {
    // Silently fail if audio context is not available
  }
}

// Create explosion effect
function createExplosion(x, y, type = 'normal') {
  const explosion = document.createElement('div');
  explosion.className = `explosion explosion-${type}`;
  explosion.style.left = `${x}px`;
  explosion.style.top = `${y}px`;
  explosionContainer.appendChild(explosion);
  
  playSound('explosion');
  
  setTimeout(() => {
    explosion.remove();
  }, 600);
}

// Load highscore from localStorage
function loadHighscore() {
  const saved = localStorage.getItem('roachGameHighscore');
  if (saved) {
    highscore = parseInt(saved, 10);
    highscoreEl.textContent = highscore.toString();
  }
}

// Save highscore to localStorage
function saveHighscore() {
  if (score > highscore) {
    highscore = score;
    localStorage.setItem('roachGameHighscore', highscore.toString());
    highscoreEl.textContent = highscore.toString();
    return true;
  }
  return false;
}

function resetHands() {
  const areaWidth = area.clientWidth;
  hands.forEach((hand, idx) => {
    const slotWidth = areaWidth / MAX_HANDS;
    const baseX = slotWidth * idx + slotWidth / 2 - hand.el.clientWidth / 2;
    hand.baseLeft = baseX;
    // Reset transform for flexbox layout
    hand.el.style.transform = '';
    hand.el.style.left = 'auto';
    hand.el.classList.remove("hand--active");
    hand.busy = false;
  });
}

function buildRoach(type = ROACH_TYPES.NORMAL) {
  const wrapper = document.createElement("div");
  wrapper.className = `roach roach-${type}`;
  return wrapper;
}

function getRoachType() {
  const rand = Math.random();
  if (rand < 0.05) { // 5% chance for boss
    return ROACH_TYPES.BOSS;
  } else if (rand < 0.25) { // 20% chance for fast
    return ROACH_TYPES.FAST;
  }
  return ROACH_TYPES.NORMAL; // 75% normal
}

function spawnRoach() {
  if (!currentDifficulty) return;
  
  const roachType = getRoachType();
  const el = buildRoach(roachType);
  const areaWidth = area.clientWidth;
  const difficulty = DIFFICULTY_LEVELS[currentDifficulty];
  
  let speedMultiplier = 1;
  let points = 1;
  const size = roachType === ROACH_TYPES.BOSS ? 96 : ROACH_SIZE;
  
  if (roachType === ROACH_TYPES.FAST) {
    speedMultiplier = 1.5;
    points = 2;
  } else if (roachType === ROACH_TYPES.BOSS) {
    speedMultiplier = 0.7;
    points = 5;
  }
  
  const speed = random(difficulty.speedMin, difficulty.speedMax) * speedMultiplier;
  const x = random(24, Math.max(24, areaWidth - size - 24));
  
  const roach = {
    el,
    x,
    y: -size,
    speed,
    squashed: false,
    destroyed: false,
    type: roachType,
    points: points,
  };

  el.style.transform = `translate(${roach.x}px, ${roach.y}px)`;
  
  // Play roach sound when spawning
  if (roachType === ROACH_TYPES.BOSS) {
    playSound('roach');
  }
  
  // Click event for desktop
  el.addEventListener("click", (event) => {
    event.stopPropagation();
    attemptSlam(roach);
  });
  
  // Touch events for mobile
  el.addEventListener("touchstart", (event) => {
    event.preventDefault();
    event.stopPropagation();
    attemptSlam(roach);
  }, { passive: false });

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
  playSound('slam');

  const areaRect = area.getBoundingClientRect();
  const roachRect = roach.el.getBoundingClientRect();
  const handRect = hand.el.getBoundingClientRect();
  const roachSize = roach.type === ROACH_TYPES.BOSS ? 96 : ROACH_SIZE;
  
  // Calculate target position relative to hand's current position
  const roachCenterX = roachRect.left - areaRect.left + roachSize / 2;
  const handCenterX = handRect.left - areaRect.left + hand.el.clientWidth / 2;
  const targetX = roachCenterX - handCenterX;
  
  // Calculate target Y position (move hand up to roach position)
  const roachCenterY = roachRect.top - areaRect.top + roachSize / 2;
  const handBottomY = handRect.bottom - areaRect.top;
  const handCenterY = handBottomY - hand.el.clientHeight / 2;
  const targetY = -(handCenterY - roachCenterY);

  hand.busy = true;
  hand.el.style.setProperty("--target-x", `${targetX}px`);
  hand.el.style.setProperty("--target-y", `${targetY}px`);
  hand.el.classList.add("hand--active");

  // Reset hand after animation
  setTimeout(() => {
    hand.busy = false;
    hand.el.classList.remove("hand--active");
    hand.el.style.setProperty("--target-x", "0px");
    hand.el.style.setProperty("--target-y", "0px");
    squashRoach(roach);
  }, 250);
}

function squashRoach(roach) {
  if (roach.destroyed) return;
  roach.destroyed = true;
  
  // Create explosion effect
  const areaRect = area.getBoundingClientRect();
  const roachRect = roach.el.getBoundingClientRect();
  const roachSize = roach.type === ROACH_TYPES.BOSS ? 96 : ROACH_SIZE;
  const explosionX = roachRect.left - areaRect.left + roachSize / 2;
  const explosionY = roachRect.top - areaRect.top + roachSize / 2;
  createExplosion(explosionX, explosionY, roach.type);
  
  roach.el.remove();
  score += roach.points || 1;
  scoreEl.textContent = score.toString();
  if (mobileScoreEl) mobileScoreEl.textContent = score.toString();
  
  const messages = {
    [ROACH_TYPES.NORMAL]: "Đập trúng!",
    [ROACH_TYPES.FAST]: "Gián nhanh! +2 điểm",
    [ROACH_TYPES.BOSS]: "BOSS! +5 điểm!"
  };
  flashStatus(messages[roach.type] || "Đập trúng!", false);
  
  // Check for new highscore
  if (saveHighscore()) {
    flashStatus("Kỷ lục mới! 🎉", false);
  }
}

function endLife(message) {
  lives -= 1;
  livesEl.textContent = lives.toString();
  if (mobileLivesEl) mobileLivesEl.textContent = lives.toString();
  playSound('lose');
  flashStatus(message, true);
  if (lives <= 0) {
    stopGame();
    saveHighscore();
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
  skillCooldown = 0;
  skillBtn.disabled = false;
  skillCooldownEl.textContent = '';
  if (skillCooldownTimer) {
    clearInterval(skillCooldownTimer);
    skillCooldownTimer = null;
  }
  if (currentDifficulty) {
    lives = DIFFICULTY_LEVELS[currentDifficulty].lives;
  }
  scoreEl.textContent = "0";
  livesEl.textContent = lives.toString();
  if (mobileScoreEl) mobileScoreEl.textContent = "0";
  if (mobileLivesEl) mobileLivesEl.textContent = lives.toString();
  flashStatus("Chuẩn bị đập gián!", false);
  resetHands();
}

function useSkill() {
  if (!active || skillCooldown > 0) return;
  
  // Kill all roaches on screen
  const killedCount = roaches.filter(r => !r.destroyed && !r.squashed).length;
  
  roaches.forEach((roach) => {
    if (!roach.destroyed && !roach.squashed) {
      const areaRect = area.getBoundingClientRect();
      const roachRect = roach.el.getBoundingClientRect();
      const roachSize = roach.type === ROACH_TYPES.BOSS ? 96 : ROACH_SIZE;
      const explosionX = roachRect.left - areaRect.left + roachSize / 2;
      const explosionY = roachRect.top - areaRect.top + roachSize / 2;
      createExplosion(explosionX, explosionY, 'skill');
      
      roach.destroyed = true;
      roach.el.remove();
      score += roach.points || 1;
    }
  });
  
  scoreEl.textContent = score.toString();
  flashStatus(`Skill! Đập ${killedCount} con gián! 💥`, false);
  
  // Set cooldown (15 seconds)
  skillCooldown = 15;
  skillBtn.disabled = true;
  updateSkillCooldown();
  
  if (skillCooldownTimer) clearInterval(skillCooldownTimer);
  skillCooldownTimer = setInterval(() => {
    skillCooldown -= 1;
    updateSkillCooldown();
    if (skillCooldown <= 0) {
      skillBtn.disabled = false;
      skillCooldownEl.textContent = '';
      clearInterval(skillCooldownTimer);
    }
  }, 1000);
  
  saveHighscore();
}

function updateSkillCooldown() {
  if (skillCooldown > 0) {
    skillCooldownEl.textContent = skillCooldown;
  } else {
    skillCooldownEl.textContent = '';
  }
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
    const roachSize = roach.type === ROACH_TYPES.BOSS ? 64 : ROACH_SIZE;
    if (!roach.squashed && roach.y + roachSize >= areaHeight - BOTTOM_SAFE_ZONE) {
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
  if (!currentDifficulty) return;
  
  const difficulty = DIFFICULTY_LEVELS[currentDifficulty];
  spawnTimer = setInterval(() => {
    if (!active) return;
    spawnRoach();
  }, difficulty.spawnInterval);
}

function showDifficultyModal() {
  difficultyModal.classList.add("active");
}

function hideDifficultyModal() {
  difficultyModal.classList.remove("active");
}

function selectDifficulty(difficulty) {
  currentDifficulty = difficulty;
  const difficultyInfo = DIFFICULTY_LEVELS[difficulty];
  currentDifficultyEl.textContent = difficultyInfo.name;
  hideDifficultyModal();
  startBtn.disabled = false;
  startBtn.textContent = "Bắt đầu";
}

function startGame() {
  if (!currentDifficulty) {
    showDifficultyModal();
    return;
  }
  
  resetState();
  active = true;
  lastTime = null;
  startSpawning();
  requestAnimationFrame(update);
  startBtn.disabled = true;
  startBtn.textContent = "Đang chơi...";
  
  // Collapse menu on mobile when game starts
  if (window.innerWidth <= 768 && topbar) {
    topbar.classList.add('collapsed');
  }
}

function stopGame() {
  active = false;
  if (spawnTimer) clearInterval(spawnTimer);
  spawnTimer = null;
  startBtn.disabled = false;
  startBtn.textContent = "Bắt đầu";
}

// Difficulty selection
document.querySelectorAll(".difficulty-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const difficulty = btn.dataset.difficulty;
    selectDifficulty(difficulty);
  });
  
  // Touch support for difficulty buttons
  btn.addEventListener("touchstart", (event) => {
    event.preventDefault();
    const difficulty = btn.dataset.difficulty;
    selectDifficulty(difficulty);
  }, { passive: false });
});

startBtn.addEventListener("click", () => {
  startGame();
});

// Allow changing difficulty by clicking the indicator
currentDifficultyEl.addEventListener("click", () => {
  if (!active) {
    showDifficultyModal();
  }
});

currentDifficultyEl.addEventListener("touchstart", (event) => {
  if (!active) {
    event.preventDefault();
    showDifficultyModal();
  }
}, { passive: false });

currentDifficultyEl.style.cursor = "pointer";
currentDifficultyEl.title = "Nhấn để đổi mức độ khó";

// Show difficulty modal on first load
window.addEventListener("load", () => {
  showDifficultyModal();
});

window.addEventListener("resize", () => {
  resetHands();
});

// Skill button event
skillBtn.addEventListener("click", () => {
  useSkill();
});

skillBtn.addEventListener("touchstart", (event) => {
  event.preventDefault();
  useSkill();
}, { passive: false });

// Keyboard shortcut for skill (Space)
document.addEventListener("keydown", (event) => {
  if (event.code === "Space" && active) {
    event.preventDefault();
    useSkill();
  }
});

// Menu toggle for mobile
if (menuToggle) {
  menuToggle.addEventListener("click", () => {
    if (topbar) {
      topbar.classList.toggle('collapsed');
    }
  });
  
  menuToggle.addEventListener("touchstart", (event) => {
    event.preventDefault();
    if (topbar) {
      topbar.classList.toggle('collapsed');
    }
  }, { passive: false });
}

// Auto-collapse menu on mobile when clicking outside
if (window.innerWidth <= 768) {
  document.addEventListener("click", (event) => {
    if (active && topbar && !topbar.contains(event.target) && !menuToggle.contains(event.target)) {
      topbar.classList.add('collapsed');
    }
  });
}

// Load highscore on page load
loadHighscore();

// Initialize layout
resetHands();
startBtn.disabled = true;
flashStatus("Chọn mức độ khó để bắt đầu.");
