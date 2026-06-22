/*
 * Game engine — 횡스크롤 러너 코어 메커니즘.
 *
 * 책임(grain-3):
 *  - requestAnimationFrame 고정 타임스텝 루프(누적 보간 없는 결정적 시뮬레이션)
 *  - 횡스크롤 월드: 하늘 그라데이션 + 다층 파랄랙스 배경 + 스크롤 지면
 *  - 플레이어: 중력/접지 점프 물리 + 달리기 애니메이션
 *  - 재료 수집물 / 장애물의 절차적 스폰, AABB 충돌 판정
 *  - 거리 기반 점수 + 난이도 램프(스크롤 속도 가속)
 *  - 수집/충돌 시 파티클·플래시 시각 피드백
 *  - 게임 상태(점수·재료별 카운트·생존 여부·거리·속도)를 외부가 구독할 수 있도록 노출
 *
 * 색상은 전부 tokens.css의 시맨틱 토큰을 token()으로 읽어 사용한다(하드코딩 금지).
 * 시뮬레이션 상수(중력/속도/스폰 간격/파티클 수명/캔버스 도형 치수 등)는 구현 설정값이며
 * 디자인 토큰이 아니다 — motion Token Group이 정의한 "UI 전환 시간/이징 + 앰비언트 루프
 * 시간축"에 속하지 않는 게임플레이 튜닝값이기 때문이다.
 *
 * 상태 노출(grain-4 HUD / grain-5 상태머신이 구독):
 *  1) getState(): 현재 상태 스냅샷 폴링용(렌더 프레임마다 점수를 읽을 때)
 *  2) document CustomEvent: game:start / game:collect / game:over
 *     (title.js의 `start` 이벤트 버스 컨벤션과 동일한 방식)
 */

/* ---- 시뮬레이션 상수 (구현 설정값 — 디자인 토큰 아님) ---- */
const STEP_MS = 1000 / 60; // 고정 타임스텝
const MAX_FRAME_MS = 250; // spiral-of-death 방지 상한

const GROUND_RATIO = 0.82; // 지면 상단 위치 비율 (grain-1 drawStage와 동일)
const PLAYER_X = 240;
const PLAYER_W = 60;
const PLAYER_H = 64;

const GRAVITY = 2800; // px/s^2
const JUMP_VELOCITY = 1080; // px/s (접지에서 점프 시 위쪽 초기 속도)
const COYOTE_S = 0.09; // 접지 직후 점프 허용 유예(초)

const BASE_SPEED = 360; // px/s 초기 스크롤
const MAX_SPEED = 920; // px/s 가속 상한
const ACCEL = 8; // px/s per second (난이도 램프)

const DISTANCE_PER_POINT = 12; // 거리 → 점수 환산(px당)
const COLLECT_SCORE = 25; // 재료 1개당 점수

const SPAWN_GAP_BASE = 520; // 스폰 간 기본 거리(px)
const SPAWN_GAP_JITTER = 220; // 스폰 간격 랜덤 가산
const SPAWN_GAP_MIN = 300; // 난이도 최고에서의 최소 간격

const INGREDIENT_TYPES = ["tomato", "egg", "rice", "scallion"];

/** tokens.css의 시맨틱 색 토큰을 한 번에 읽어 팔레트로 캐시한다. */
function readPalette(token) {
  return {
    skyTop: token("--color-bg-canvas-top"),
    skyBottom: token("--color-bg-canvas-bottom"),
    parallaxFar: token("--color-bg-parallax-far"),
    parallaxNear: token("--color-bg-parallax-near"),
    ground: token("--color-surface-ground"),
    groundEdge: token("--color-surface-ground-edge"),
    playerBody: token("--color-player-body"),
    playerAccent: token("--color-player-accent"),
    hazard: token("--color-hazard"),
    hazardAccent: token("--color-hazard-accent"),
    ingredient: {
      tomato: token("--color-ingredient-tomato"),
      egg: token("--color-ingredient-egg"),
      rice: token("--color-ingredient-rice"),
      scallion: token("--color-ingredient-scallion"),
    },
  };
}

/** 축 정렬 사각형(AABB) 겹침 판정. */
function overlap(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

/**
 * 게임 인스턴스를 만든다.
 * @param {object} deps
 * @param {HTMLCanvasElement} deps.canvas
 * @param {CanvasRenderingContext2D} deps.ctx
 * @param {{width:number,height:number}} deps.stage 논리 무대 해상도
 * @param {(name:string)=>string} deps.token CSS 커스텀 프로퍼티 읽기 함수
 * @param {EventTarget} [deps.emitter] 상태 이벤트 발행 대상(기본: document)
 */
export function createGame({ canvas, ctx, stage, token, emitter }) {
  const bus = emitter || document;
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let palette = readPalette(token);
  let skyGradient = null;
  // 지면 가장자리 두께는 grain-1이 spacing 토큰으로 정한 값을 재사용한다(파편화 방지).
  const groundEdge = parseFloat(token("--space-2xs")) || 4;
  const groundY = stage.height * GROUND_RATIO;

  /* ---- 가변 월드 상태 ---- */
  const player = {
    x: PLAYER_X,
    y: groundY - PLAYER_H,
    w: PLAYER_W,
    h: PLAYER_H,
    vy: 0,
    grounded: true,
    runPhase: 0,
  };
  let coyote = COYOTE_S;
  let speed = BASE_SPEED;
  let distance = 0; // 누적 스크롤 거리(px)
  let worldX = 0; // 파랄랙스 누적 오프셋(px)
  let collectScore = 0;
  let distanceToSpawn = SPAWN_GAP_BASE;
  const collectibles = [];
  const obstacles = [];
  const particles = [];
  const flash = { color: null, alpha: 0 };

  /* ---- 외부 노출 상태 ---- */
  const state = {
    status: "idle", // idle | running | over
    isAlive: true,
    score: 0,
    distance: 0,
    speed: BASE_SPEED,
    collected: 0,
    ingredients: { tomato: 0, egg: 0, rice: 0, scallion: 0 },
  };

  function emit(type, detail) {
    bus.dispatchEvent(new CustomEvent(type, { detail, bubbles: true }));
  }

  function syncScore() {
    state.score = Math.floor(distance / DISTANCE_PER_POINT) + collectScore;
  }

  /** 약간 안쪽으로 줄인 플레이어 충돌 박스(판정을 너그럽게). */
  function playerHitbox() {
    return {
      x: player.x + 8,
      y: player.y + 6,
      w: player.w - 16,
      h: player.h - 10,
    };
  }

  /* ---- 입력 ---- */
  function jump() {
    if (state.status !== "running" || !state.isAlive) return;
    if (coyote <= 0) return; // 접지 또는 코요테 유예 중에만
    player.vy = -JUMP_VELOCITY;
    player.grounded = false;
    coyote = 0;
  }

  /* ---- 스폰 ---- */
  function spawnEntity() {
    const difficulty = (speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED); // 0..1
    const obstacleChance = 0.34 + difficulty * 0.18; // 난이도 따라 0.34→0.52
    if (Math.random() < obstacleChance) spawnObstacle();
    else spawnCollectible();
  }

  function spawnObstacle() {
    const h = 56 + Math.random() * 64; // 56..120
    const w = 38 + Math.random() * 26;
    obstacles.push({ x: stage.width + 60, y: groundY - h, w, h });
  }

  function spawnCollectible() {
    const type = INGREDIENT_TYPES[(Math.random() * INGREDIENT_TYPES.length) | 0];
    const size = 38;
    // 약 45%는 공중에 배치해 점프 수집을 유도(점프 정점 ≈ 212px).
    const elevated = Math.random() < 0.45;
    const lift = elevated ? 150 + Math.random() * 70 : 8;
    collectibles.push({
      x: stage.width + 60,
      y: groundY - size - lift,
      w: size,
      h: size,
      type,
      phase: Math.random() * Math.PI * 2,
    });
  }

  function moveAndCull(arr, dx) {
    for (let i = arr.length - 1; i >= 0; i--) {
      arr[i].x -= dx;
      if (arr[i].x + arr[i].w < -40) arr.splice(i, 1);
    }
  }

  /* ---- 피드백 ---- */
  function triggerFlash(color, alpha) {
    if (reduceMotion) return;
    flash.color = color;
    flash.alpha = Math.max(flash.alpha, alpha);
  }

  function spawnBurst(x, y, color, count) {
    if (reduceMotion) count = Math.min(count, 4);
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 120 + Math.random() * 260;
      const life = 0.4 + Math.random() * 0.4;
      particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 80,
        life,
        maxLife: life,
        size: 4 + Math.random() * 5,
        color,
      });
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += GRAVITY * 0.4 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  /* ---- 충돌 → 수집 / 게임오버 ---- */
  function collect(c) {
    state.ingredients[c.type] += 1;
    state.collected += 1;
    collectScore += COLLECT_SCORE;
    syncScore();
    spawnBurst(c.x + c.w / 2, c.y + c.h / 2, palette.ingredient[c.type], 12);
    triggerFlash(palette.playerAccent, 0.28);
    emit("game:collect", {
      type: c.type,
      ingredients: { ...state.ingredients },
      collected: state.collected,
      score: state.score,
    });
  }

  function gameOver() {
    if (!state.isAlive) return;
    state.isAlive = false;
    state.status = "over";
    spawnBurst(
      player.x + player.w / 2,
      player.y + player.h / 2,
      palette.hazardAccent,
      18,
    );
    triggerFlash(palette.hazard, 0.5);
    emit("game:over", {
      score: state.score,
      ingredients: { ...state.ingredients },
      collected: state.collected,
      distance: Math.round(distance),
    });
  }

  function handleCollisions() {
    const hit = playerHitbox();
    for (let i = collectibles.length - 1; i >= 0; i--) {
      if (overlap(hit, collectibles[i])) {
        collect(collectibles[i]);
        collectibles.splice(i, 1);
      }
    }
    for (const o of obstacles) {
      if (overlap(hit, o)) {
        gameOver();
        break;
      }
    }
  }

  /* ---- 시뮬레이션 ---- */
  function update(dt) {
    if (state.status === "running") {
      // 난이도 램프: 스크롤 속도 가속
      speed = Math.min(MAX_SPEED, speed + ACCEL * dt);
      const dx = speed * dt;
      distance += dx;
      worldX += dx;

      // 플레이어 물리(중력/접지)
      player.vy += GRAVITY * dt;
      player.y += player.vy * dt;
      const floorY = groundY - player.h;
      if (player.y >= floorY) {
        player.y = floorY;
        player.vy = 0;
        player.grounded = true;
        coyote = COYOTE_S;
      } else {
        player.grounded = false;
        coyote = Math.max(0, coyote - dt);
      }
      // 달리기 다리 스윙 위상(접지 중에만 진행)
      player.runPhase += dt * (player.grounded ? 14 : 0);

      // 절차적 스폰(거리 기반 → 공간 밀도 일정, 난이도는 속도로)
      distanceToSpawn -= dx;
      if (distanceToSpawn <= 0) {
        spawnEntity();
        const gap =
          Math.max(SPAWN_GAP_MIN, SPAWN_GAP_BASE - (speed - BASE_SPEED) * 0.25) +
          Math.random() * SPAWN_GAP_JITTER;
        distanceToSpawn += gap;
      }

      moveAndCull(collectibles, dx);
      moveAndCull(obstacles, dx);
      for (const c of collectibles) c.phase += dt * 4;

      handleCollisions();

      syncScore();
      state.distance = distance;
      state.speed = speed;
    }

    // 파티클·플래시는 게임오버 후에도 감쇠 애니메이션을 이어간다.
    updateParticles(dt);
    if (flash.alpha > 0) flash.alpha = Math.max(0, flash.alpha - dt * 3.2);
  }

  /* ---- 렌더 ---- */
  function roundRectPath(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawSky() {
    if (!skyGradient) {
      skyGradient = ctx.createLinearGradient(0, 0, 0, stage.height);
      skyGradient.addColorStop(0, palette.skyTop);
      skyGradient.addColorStop(1, palette.skyBottom);
    }
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, stage.width, stage.height);
  }

  function drawHills(color, factor, baseY, amp, wavelength) {
    const offset = (worldX * factor) % wavelength;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-wavelength, stage.height);
    for (let x = -wavelength; x <= stage.width + wavelength; x += 12) {
      const y = baseY + Math.sin(((x + offset) / wavelength) * Math.PI * 2) * amp;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(stage.width + wavelength, stage.height);
    ctx.closePath();
    ctx.fill();
  }

  function drawParallax() {
    drawHills(palette.parallaxFar, 0.18, groundY - 130, 42, 520);
    drawHills(palette.parallaxNear, 0.42, groundY - 60, 30, 360);
  }

  function drawGround() {
    ctx.fillStyle = palette.ground;
    ctx.fillRect(0, groundY, stage.width, stage.height - groundY);
    ctx.fillStyle = palette.groundEdge;
    ctx.fillRect(0, groundY, stage.width, groundEdge);
    // 스크롤 텍스처(속도감). 도형 치수는 구현 설정값.
    const tile = 96;
    const off = worldX % tile;
    for (let x = -off; x < stage.width; x += tile) {
      ctx.fillRect(x, groundY + 18, 40, 6);
    }
  }

  function drawIngredient(cx, cy, r, type) {
    ctx.fillStyle = palette.ingredient[type];
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    // 광택 하이라이트(재사용: player-body). 합성 알파는 렌더 설정값.
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = palette.playerBody;
    ctx.beginPath();
    ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawCollectibles() {
    for (const c of collectibles) {
      const cx = c.x + c.w / 2;
      const cy = c.y + c.h / 2 + Math.sin(c.phase) * 6;
      drawIngredient(cx, cy, c.w / 2, c.type);
    }
  }

  function drawObstacles() {
    for (const o of obstacles) {
      ctx.fillStyle = palette.hazard;
      roundRectPath(o.x, o.y, o.w, o.h, 6);
      ctx.fill();
      // 상단 강조 스파이크(맵게/탄 기름 위험).
      ctx.fillStyle = palette.hazardAccent;
      ctx.beginPath();
      const tips = 3;
      const seg = o.w / tips;
      ctx.moveTo(o.x, o.y);
      for (let i = 0; i < tips; i++) {
        ctx.lineTo(o.x + seg * i + seg / 2, o.y - 16);
        ctx.lineTo(o.x + seg * (i + 1), o.y);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawPlayer() {
    const cx = player.x + player.w / 2;
    const bottom = player.y + player.h;

    // 다리: 접지 시 달리기 스윙, 공중 시 모음.
    const swing = player.grounded ? Math.sin(player.runPhase) * 10 : -6;
    ctx.strokeStyle = palette.playerAccent;
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx - 10, bottom - 14);
    ctx.lineTo(cx - 10 + swing, bottom);
    ctx.moveTo(cx + 10, bottom - 14);
    ctx.lineTo(cx + 10 - swing, bottom);
    ctx.stroke();

    // 본체(계란 흰자): 둥근 블롭.
    ctx.fillStyle = palette.playerBody;
    ctx.beginPath();
    ctx.ellipse(cx, player.y + player.h * 0.45, player.w * 0.5, player.h * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();

    // 노른자(강조).
    ctx.fillStyle = palette.playerAccent;
    ctx.beginPath();
    ctx.arc(cx + 6, player.y + player.h * 0.4, player.w * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawFlash() {
    if (flash.alpha <= 0 || !flash.color) return;
    ctx.globalAlpha = flash.alpha;
    ctx.fillStyle = flash.color;
    ctx.fillRect(0, 0, stage.width, stage.height);
    ctx.globalAlpha = 1;
  }

  function render() {
    ctx.clearRect(0, 0, stage.width, stage.height);
    drawSky();
    drawParallax();
    drawGround();
    drawCollectibles();
    drawObstacles();
    drawPlayer();
    drawParticles();
    drawFlash();
  }

  /* ---- 고정 타임스텝 루프 ---- */
  let rafId = null;
  let running = false;
  let lastTime = 0;
  let acc = 0;

  function frame(now) {
    if (!running) return;
    if (lastTime === 0) lastTime = now;
    let delta = now - lastTime;
    lastTime = now;
    if (delta > MAX_FRAME_MS) delta = MAX_FRAME_MS;
    acc += delta;
    while (acc >= STEP_MS) {
      update(STEP_MS / 1000);
      acc -= STEP_MS;
    }
    render();
    rafId = requestAnimationFrame(frame);
  }

  /* ---- 공개 API ---- */
  function reset() {
    speed = BASE_SPEED;
    distance = 0;
    worldX = 0;
    collectScore = 0;
    distanceToSpawn = SPAWN_GAP_BASE;
    collectibles.length = 0;
    obstacles.length = 0;
    particles.length = 0;
    flash.alpha = 0;
    flash.color = null;
    player.y = groundY - player.h;
    player.vy = 0;
    player.grounded = true;
    player.runPhase = 0;
    coyote = COYOTE_S;
    state.status = "idle";
    state.isAlive = true;
    state.score = 0;
    state.distance = 0;
    state.speed = BASE_SPEED;
    state.collected = 0;
    state.ingredients = { tomato: 0, egg: 0, rice: 0, scallion: 0 };
  }

  function start() {
    // reset() 후 running 으로 전환한다. 게임오버 뒤 재시작(grain-5)도 이 경로를 쓴다.
    reset();
    state.status = "running";
    emit("game:start", {});
    // 이미 루프가 살아 있으면(예: 게임오버 후 잔여 프레임) 새 rAF를 중복 예약하지 않는다.
    if (!running) {
      running = true;
      lastTime = 0;
      acc = 0;
      rafId = requestAnimationFrame(frame);
    }
  }

  function stop() {
    running = false;
    if (rafId != null) cancelAnimationFrame(rafId);
    rafId = null;
  }

  /** 루프를 돌리지 않고 한 프레임만 그린다(시작 전/리사이즈 시 정적 프레임). */
  function renderOnce() {
    render();
  }

  /** 토큰/팔레트를 다시 읽는다(테마 변경 등 대비). */
  function refresh() {
    palette = readPalette(token);
    skyGradient = null;
  }

  /** 외부 구독용 상태 스냅샷. */
  function getState() {
    return {
      status: state.status,
      isAlive: state.isAlive,
      score: state.score,
      distance: Math.round(state.distance),
      speed: Math.round(state.speed),
      collected: state.collected,
      ingredients: { ...state.ingredients },
    };
  }

  return { start, stop, reset, jump, render: renderOnce, refresh, getState };
}
