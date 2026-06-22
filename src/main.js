/*
 * Entry point — buildless ES module.
 * 반응형 캔버스 스케일 + 게임 엔진 부트스트랩 + 입력 배선을 책임진다.
 *
 * grain-3: 캔버스 게임 루프를 만들어 구동하고, 입력(Space/탭)을 점프로 연결한다.
 *   게임 상태는 engine.getState()와 document CustomEvent(game:start/collect/over)로 노출되어
 *   grain-4(HUD) / grain-5(상태머신)가 구독한다. 아래 `game` export도 동일 목적의 구독 경로다.
 *
 * 경계: 타이틀↔플레이↔게임오버 화면 전환(상태머신 배선)과 HUD 오버레이는 grain-5/grain-4가 맡는다.
 *   현재는 엔진을 즉시 start()해 루프·물리·수집·충돌·가속을 검증 가능하게 둔다. grain-5에서
 *   이 무조건 start()를 타이틀 `start` 이벤트 기반 전환으로 교체하고 화면 가시성을 관리한다.
 */

import { initTitleScreen } from "./title.js";
import { createGame } from "./engine.js";

// 논리 무대 해상도 (16:9). 구현 설정값 — 디자인 토큰 아님.
const STAGE = { width: 1280, height: 720 };
const STAGE_RATIO = STAGE.width / STAGE.height;
// 화면 가장자리 여백 비율(스케일 계산용 구현 설정값).
const VIEWPORT_FILL = 0.94;

const canvas = document.getElementById("game-canvas");
const overlay = document.getElementById("overlay-root");
const ctx = canvas.getContext("2d");

/** tokens.css에 정의된 시맨틱 토큰을 읽어 캔버스 렌더에 사용한다(값 하드코딩 방지). */
function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// 게임 엔진 인스턴스. 외부(grain-4/5)가 import해 getState()/start()/stop() 등을 구독·제어한다.
export const game = createGame({ canvas, ctx, stage: STAGE, token });

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
  // 버퍼 재설정으로 화면이 지워지므로 한 프레임 다시 그린다(루프가 돌면 다음 프레임이 덮어쓴다).
  game.render();
}

/** 오버레이 루트를 캔버스 표시 영역에 정확히 겹친다(타이틀/HUD 배치 기준). */
function syncOverlay(displayW, displayH) {
  overlay.style.width = `${displayW}px`;
  overlay.style.height = `${displayH}px`;
  overlay.style.left = `${canvas.offsetLeft}px`;
  overlay.style.top = `${canvas.offsetTop}px`;
}

/** 입력 → 점프. Space/↑/W 키와 캔버스 포인터(탭/클릭) 양쪽을 커버한다. */
function wireInput() {
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
      e.preventDefault(); // Space 페이지 스크롤 방지
      game.jump();
    }
  });
  // 캔버스 영역 포인터 입력(타이틀 오버레이가 가려지면 grain-5에서 캔버스로 도달).
  canvas.addEventListener("pointerdown", () => game.jump());
}

function boot() {
  window.addEventListener("resize", resize);
  resize();
  wireInput();
  // 캔버스 위에 메인 타이틀 오버레이를 초기화한다(엔트런스 + 시작 이벤트 발행).
  initTitleScreen();
  // 코어 루프 구동(검증 가능 상태). grain-5에서 타이틀 전환 기반 start로 교체한다.
  game.start();
  // 폰트 로딩 완료 후 한 번 더 그려 폰트 메트릭 반영(오버레이 텍스트).
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(resize);
  }
}

boot();
