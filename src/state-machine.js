/*
 * 중앙 상태 머신 — 화면 오케스트레이션.
 *
 * grain-5 범위: 타이틀(grain-2) · 게임 엔진(grain-3) · HUD(grain-4) · 게임오버를 배선하는
 * 단일 오케스트레이터. 코어 시뮬레이션은 수정하지 않고 노출된 제어/이벤트만 사용한다.
 *
 * 상태: title → playing → gameover → (restart) playing | (to-title) title
 *  - title:    타이틀 화면 표시, 엔진 idle(정적 무대만 렌더).
 *  - playing:  엔진 running. 타이틀 숨김, HUD 표시.
 *  - gameover: 엔진 over. 게임오버 화면이 최종 점수·재료를 표시(HUD는 over에서 숨김).
 *
 * 일시정지: playing 중 창 포커스를 잃으면 시뮬레이션을 멈추고(엔진 상태 보존) 안내 오버레이를
 *   띄운다. 포커스 복귀 시 자동으로 이어서 진행한다.
 *
 * 이벤트 버스(document):
 *  - `start`     : 타이틀/게임오버의 시작·다시 하기 액션 → playing
 *  - `to-title`  : 게임오버의 타이틀로 액션 → title
 *  - `game:over` : 엔진이 충돌로 게임오버에 진입 → gameover
 */

import { initGameOver } from "./gameover.js";

/**
 * 상태 머신을 초기화하고 화면 전환을 배선한다.
 * @param {object} game engine.js createGame 인스턴스(start/stop/pause/resume/reset/render/getState)
 * @param {EventTarget} [bus] 이벤트 구독·발행 대상(기본: document)
 */
export function initStateMachine(game, bus = document) {
  const titleScreen = document.querySelector("[data-title-screen]");
  const pauseScreen = document.querySelector("[data-pause]");
  const gameOver = initGameOver(bus);

  let current = "title"; // title | playing | gameover
  let paused = false;

  function setScreen(el, visible) {
    if (!el) return;
    el.dataset.status = visible ? "visible" : "hidden";
    el.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  function showPause(visible) {
    if (!pauseScreen) return;
    pauseScreen.dataset.status = visible ? "visible" : "hidden";
    pauseScreen.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  /* ---- 전환 ---- */
  function toTitle() {
    current = "title";
    // 진행 중 일시정지가 걸려 있었다면 해제하고 엔진 루프를 멈춘 뒤 정적 무대로 리셋한다.
    clearPause();
    game.stop();
    game.reset();
    game.render();
    gameOver.hide();
    setScreen(titleScreen, true);
  }

  function toPlaying() {
    current = "playing";
    clearPause();
    gameOver.hide();
    setScreen(titleScreen, false);
    // start()가 reset + running + game:start 발행을 담당한다(재시작도 동일 경로).
    game.start();
  }

  function toGameOver(detail) {
    current = "gameover";
    clearPause();
    // HUD는 over 상태에서 스스로 숨고, 게임오버 화면이 최종 점수·재료를 대신 표시한다.
    gameOver.show(detail || {});
  }

  /* ---- 일시정지(포커스 상실) ---- */
  function pauseGame() {
    if (current !== "playing" || paused) return;
    if (game.getState().status !== "running") return;
    paused = true;
    game.pause();
    showPause(true);
  }

  function resumeGame() {
    if (!paused) return;
    paused = false;
    showPause(false);
    if (current === "playing") game.resume();
  }

  /** 전환 시 잔여 일시정지 표시·플래그를 정리한다(엔진 resume은 하지 않음). */
  function clearPause() {
    paused = false;
    showPause(false);
  }

  /* ---- 이벤트 배선 ---- */
  bus.addEventListener("start", () => {
    if (current === "title" || current === "gameover") toPlaying();
  });

  bus.addEventListener("to-title", () => {
    if (current === "gameover") toTitle();
  });

  bus.addEventListener("game:over", (e) => {
    if (current === "playing") toGameOver(e.detail);
  });

  // 창 포커스를 잃으면 일시정지, 복귀하면 재개.
  window.addEventListener("blur", pauseGame);
  window.addEventListener("focus", resumeGame);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseGame();
    else resumeGame();
  });

  // 초기 화면: 타이틀 표시, 게임오버/일시정지 숨김, 엔진 idle 정적 무대.
  setScreen(titleScreen, true);
  gameOver.hide();
  showPause(false);
}
