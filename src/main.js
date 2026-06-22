/*
 * Entry point — buildless ES module.
 * grain-1 범위: 반응형 캔버스 스케일 베이스만 책임진다.
 * 게임 루프 / 플레이어 / 충돌 / 타이틀 / HUD 는 후속 grain에서 추가한다.
 */

// 논리 무대 해상도 (16:9). 구현 설정값 — 디자인 토큰 아님.
const STAGE = { width: 1280, height: 720 };
const STAGE_RATIO = STAGE.width / STAGE.height;
// 화면 가장자리 여백 비율(스케일 계산용 구현 설정값).
const VIEWPORT_FILL = 0.94;

const canvas = document.getElementById("game-canvas");
const overlay = document.getElementById("overlay-root");
const ctx = canvas.getContext("2d");

/** tokens.css에 정의된 시맨틱 색상 토큰을 읽어 캔버스 렌더에 사용한다(값 하드코딩 방지). */
function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** 뷰포트에 비율을 유지한 채 캔버스를 맞추고, devicePixelRatio로 선명도를 보정한다. */
function resize() {
  const availW = window.innerWidth * VIEWPORT_FILL;
  const availH = window.innerHeight * VIEWPORT_FILL;

  let displayW = availW;
  let displayH = displayW / STAGE_RATIO;
  if (displayH > availH) {
    displayH = availH;
    displayW = displayH * STAGE_RATIO;
  }

  // 화면상 크기(CSS).
  canvas.style.width = `${displayW}px`;
  canvas.style.height = `${displayH}px`;

  // 내부 버퍼: 논리 해상도 × DPR. 컨텍스트를 DPR로 스케일해 논리 좌표로 그린다.
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(STAGE.width * dpr);
  canvas.height = Math.round(STAGE.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  syncOverlay(displayW, displayH);
  drawStage();
}

/** 오버레이 루트를 캔버스 표시 영역에 정확히 겹친다(타이틀/HUD 배치 기준). */
function syncOverlay(displayW, displayH) {
  overlay.style.width = `${displayW}px`;
  overlay.style.height = `${displayH}px`;
  overlay.style.left = `${canvas.offsetLeft}px`;
  overlay.style.top = `${canvas.offsetTop}px`;
}

/** 정적 무대 배경(하늘 그라데이션 + 지면). 게임 오브젝트는 그리지 않는다. */
function drawStage() {
  ctx.clearRect(0, 0, STAGE.width, STAGE.height);

  const sky = ctx.createLinearGradient(0, 0, 0, STAGE.height);
  sky.addColorStop(0, token("--color-bg-canvas-top"));
  sky.addColorStop(1, token("--color-bg-canvas-bottom"));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, STAGE.width, STAGE.height);

  const groundTop = STAGE.height * 0.82;
  ctx.fillStyle = token("--color-surface-ground");
  ctx.fillRect(0, groundTop, STAGE.width, STAGE.height - groundTop);
  ctx.fillStyle = token("--color-surface-ground-edge");
  ctx.fillRect(0, groundTop, STAGE.width, parseFloat(token("--space-2xs")));
}

function boot() {
  window.addEventListener("resize", resize);
  resize();
  // 폰트 로딩 완료 후 한 번 더 그려 폰트 메트릭 반영(오버레이 텍스트).
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(resize);
  }
}

boot();
