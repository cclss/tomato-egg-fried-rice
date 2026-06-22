/*
 * GameOver 화면 동작.
 * grain-5 범위: 게임오버 오버레이의 렌더·제어만. 게임 시뮬레이션(engine.js)은 수정하지 않는다.
 *
 * 책임:
 *  - 최종 점수·거리·재료 현황을 game:over 디테일로 채운다.
 *  - 액션 버튼을 이벤트 버스로 배선한다(다시 하기 → `start`, 타이틀로 → `to-title`).
 *    이는 title.js의 `start` 이벤트 컨벤션과 동일한 방식이며, 상태머신이 구독해 전환을 수행한다.
 *  - show(detail)/hide()로 표시 전환(상태머신이 호출).
 *
 * 표시 재료는 HUD와 동일하게 토마토/계란/밥 3종(테마 핵심 재료, 일관성 유지).
 */

// 게임오버 재료 현황으로 노출하는 재료. HUD와 동일 집합·표기(ui-text 용어 사전).
const MATERIALS = [
  { type: "tomato", name: "토마토" },
  { type: "egg", name: "계란" },
  { type: "rice", name: "밥" },
];

// 구현 설정값(디자인 토큰 아님) — HUD와 동일 환산.
const DISTANCE_PER_METER = 100;

/**
 * 게임오버 화면을 초기화한다. 재료 타일을 만들고 액션 버튼을 이벤트로 배선한다.
 * @param {EventTarget} [bus] 이벤트 발행 대상(기본: document — engine/title과 동일 버스)
 * @returns {{ show: (detail: object) => void, hide: () => void }}
 */
export function initGameOver(bus = document) {
  const screen = document.querySelector("[data-gameover]");
  if (!screen || screen.dataset.ready === "true") {
    return { show() {}, hide() {} };
  }

  const scoreEl = screen.querySelector("[data-gameover-score]");
  const distanceEl = screen.querySelector("[data-gameover-distance]");
  const materialsEl = screen.querySelector("[data-gameover-materials]");
  const restartBtn = screen.querySelector("[data-gameover-restart]");
  const titleBtn = screen.querySelector("[data-gameover-title]");

  // 재료 타일 생성(type → {count, name} 참조 보관).
  const tiles = new Map();
  if (materialsEl) {
    const fragment = document.createDocumentFragment();
    MATERIALS.forEach(({ type, name }) => {
      const tile = document.createElement("div");
      tile.className = "gameover-tile";
      tile.dataset.gameoverTile = type;
      tile.setAttribute("aria-label", `${name} 0`);

      const icon = document.createElement("span");
      icon.className = `gameover-tile__icon gameover-tile__icon--${type}`;
      icon.setAttribute("aria-hidden", "true");

      const count = document.createElement("span");
      count.className = "gameover-tile__count";
      count.textContent = "0";

      tile.append(icon, count);
      fragment.appendChild(tile);
      tiles.set(type, { tile, count, name });
    });
    materialsEl.appendChild(fragment);
  }

  // 액션 배선: 다시 하기 → `start`(상태머신이 playing으로), 타이틀로 → `to-title`.
  if (restartBtn) {
    restartBtn.addEventListener("click", () => {
      bus.dispatchEvent(new CustomEvent("start", { bubbles: true }));
    });
  }
  if (titleBtn) {
    titleBtn.addEventListener("click", () => {
      bus.dispatchEvent(new CustomEvent("to-title", { bubbles: true }));
    });
  }

  function show(detail = {}) {
    const score = detail.score || 0;
    const distance = detail.distance || 0;
    const ingredients = detail.ingredients || {};

    if (scoreEl) scoreEl.textContent = String(Math.round(score));
    if (distanceEl) {
      distanceEl.textContent = `${Math.round(distance / DISTANCE_PER_METER)}m`;
    }
    tiles.forEach((ref, type) => {
      const n = ingredients[type] || 0;
      ref.count.textContent = String(n);
      ref.tile.setAttribute("aria-label", `${ref.name} ${n}`);
    });

    screen.dataset.status = "visible";
    screen.setAttribute("aria-hidden", "false");
    // 등장 직후 기본 포커스를 다시 하기에 둔다(키보드 흐름).
    if (restartBtn) restartBtn.focus();
  }

  function hide() {
    screen.dataset.status = "hidden";
    screen.setAttribute("aria-hidden", "true");
  }

  screen.dataset.ready = "true";
  return { show, hide };
}
