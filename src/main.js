/*
 * Entry point — buildless ES module.
 * 반응형 캔버스 스케일 + 게임 엔진 부트스트랩 + 입력 배선을 책임진다.
 *
 * grain-3: 캔버스 게임 루프를 만들어 구동하고, 입력(Space/탭)을 점프로 연결한다.
 *   게임 상태는 engine.getState()와 document CustomEvent(game:start/collect/over)로 노출되어
 *   grain-4(HUD) / grain-5(상태머신)가 구독한다. 아래 `game` export도 동일 목적의 구독 경로다.
 *
 * grain-5: 무조건 start()를 제거하고 중앙 상태머신(state-machine.js)에 화면 전환을 위임한다.
 *   타이틀 `start` 이벤트로 플레이가 시작되고, `game:over`로 게임오버 화면이 뜨며, 다시 하기/타이틀로
 *   액션으로 루프가 재시작·복귀한다. 입력(점프)은 playing 상태에서만 동작하도록 게이팅한다.
 */

import { initTitleScreen } from "./title.js";
import { initHud } from "./hud.js";
import { initStateMachine } from "./state-machine.js";
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
      // 플레이 중에만 점프 입력을 가로챈다. 타이틀/게임오버에서는 기본 동작(버튼 키보드 활성화 등)을 보존한다.
      if (game.getState().status !== "running") return;
      e.preventDefault(); // Space 페이지 스크롤 방지
      game.jump();
    }
  });
  // 캔버스 영역 포인터 입력(플레이 중 타이틀/게임오버 오버레이가 숨겨져 캔버스로 도달).
  canvas.addEventListener("pointerdown", () => game.jump());
}

function boot() {
  window.addEventListener("resize", resize);
  resize();
  wireInput();
  // 캔버스 위에 메인 타이틀 오버레이를 초기화한다(엔트런스 + 시작 이벤트 발행).
  initTitleScreen();
  // 플레이 중 점수·재료 현황 HUD를 초기화한다(game 상태 구독 — 폴링 + game:* 이벤트).
  initHud(game);
  // 중앙 상태머신: 타이틀↔플레이↔게임오버 전환·게임오버 화면·일시정지를 배선한다.
  initStateMachine(game);
  // 타이틀 뒤로 보이는 정적 무대를 한 번 그린다(루프는 start 이벤트에서 구동).
  game.render();
  // 폰트 로딩 완료 후 한 번 더 그려 폰트 메트릭 반영(오버레이 텍스트).
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(resize);
  }
}

boot();
