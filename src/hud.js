/*
 * HUD — 플레이 중 점수·재료 현황 오버레이의 동작.
 *
 * grain-4 범위: 마크업/스타일/구독 갱신만. 게임 시뮬레이션(engine.js)은 수정하지 않고,
 * grain-3가 노출한 상태를 구독해 읽기만 한다.
 *
 * 구독 경로(두 가지):
 *  1) game.getState() 폴링 — 매 프레임 점수·거리·속도·재료 카운트를 읽어 실시간 갱신.
 *  2) document CustomEvent(game:start / game:collect / game:over) — 표시 전환과
 *     수집 순간 팝 피드백을 트리거.
 *
 * 표시 재료는 토마토/계란/밥 3종(테마 핵심 재료). 점수 카운트업·속도 게이지 정규화·
 * 거리 미터 환산 계수는 사용자가 디자인 축으로 인지하지 않는 구현 설정값이므로 토큰이 아니다.
 */

// HUD 타일로 노출하는 재료(아이콘 + 수량). ui-text 용어 사전 표기를 따른다.
const MATERIALS = [
  { type: "tomato", name: "토마토" },
  { type: "egg", name: "계란" },
  { type: "rice", name: "밥" },
];

// 구현 설정값(디자인 토큰 아님).
const DISTANCE_PER_METER = 100; // 스크롤 px → 미터 환산
const SPEED_MULT_MAX = 2.5; // 속도 게이지 정규화 상한(시작 속도 대비 배속)
const SCORE_ROLL = 0.18; // 점수 카운트업 보간 계수(0..1, 클수록 빠르게 수렴)

/** is-pop 클래스를 재부착해 팝 애니메이션을 (재)트리거한다. */
function pop(el) {
  if (!el) return;
  el.classList.remove("is-pop");
  // 리플로우를 강제해 동일 클래스 재추가 시에도 애니메이션이 다시 재생되도록 한다.
  void el.offsetWidth;
  el.classList.add("is-pop");
}

/**
 * HUD를 초기화한다. grain-3 엔진 인스턴스를 받아 상태를 구독·갱신한다.
 * @param {{ getState: () => object }} game
 * @param {EventTarget} [bus] 이벤트 구독 대상(기본: document — engine.js의 발행 대상과 동일)
 */
export function initHud(game, bus = document) {
  const root = document.querySelector("[data-hud]");
  if (!root || !game || typeof game.getState !== "function") return;
  if (root.dataset.ready === "true") return;

  const scoreEl = root.querySelector("[data-hud-score]");
  const distanceEl = root.querySelector("[data-hud-distance]");
  const speedEl = root.querySelector("[data-hud-speed]");
  const speedGauge = root.querySelector("[data-hud-speed-gauge]");
  const materialsEl = root.querySelector("[data-hud-materials]");

  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // 재료 타일을 생성하고 type → {tile, count} 참조를 보관한다.
  const tiles = new Map();
  if (materialsEl) {
    const fragment = document.createDocumentFragment();
    MATERIALS.forEach(({ type, name }) => {
      const tile = document.createElement("div");
      tile.className = "hud-tile";
      tile.dataset.hudTile = type;
      tile.setAttribute("aria-label", `${name} 0`);

      const icon = document.createElement("span");
      icon.className = `hud-tile__icon hud-tile__icon--${type}`;
      icon.setAttribute("aria-hidden", "true");

      const count = document.createElement("span");
      count.className = "hud-tile__count";
      count.textContent = "0";

      tile.append(icon, count);
      fragment.appendChild(tile);
      tiles.set(type, { tile, count, name });
    });
    materialsEl.appendChild(fragment);
  }

  // 표시 상태(폴링으로 갱신).
  let displayedScore = 0;
  let baseSpeed = 0; // 시작 시점 속도(배속 계산 기준)

  function setScore(target) {
    // 카운트업: 표시값을 목표값으로 보간해 굴려 올린다(모션 최소화 시 즉시 수렴).
    if (reduceMotion) {
      displayedScore = target;
    } else {
      displayedScore += (target - displayedScore) * SCORE_ROLL;
      if (Math.abs(target - displayedScore) < 0.5) displayedScore = target;
    }
    if (scoreEl) scoreEl.textContent = String(Math.round(displayedScore));
  }

  function update() {
    const s = game.getState();

    root.dataset.status = s.status;
    root.setAttribute("aria-hidden", s.status === "idle" ? "true" : "false");

    setScore(s.score);

    if (distanceEl) {
      distanceEl.textContent = `${Math.round(s.distance / DISTANCE_PER_METER)}m`;
    }

    if (!baseSpeed && s.speed > 0) baseSpeed = s.speed;
    const mult = baseSpeed ? s.speed / baseSpeed : 1;
    if (speedEl) speedEl.textContent = `${mult.toFixed(1)}x`;
    if (speedGauge) {
      const fill = Math.max(0, Math.min(1, (mult - 1) / (SPEED_MULT_MAX - 1)));
      speedGauge.style.width = `${(fill * 100).toFixed(1)}%`;
    }

    // 재료 카운트는 매 프레임 상태와 동기화(이벤트 유실 대비). 팝은 game:collect가 담당.
    tiles.forEach((ref, type) => {
      const n = s.ingredients[type] || 0;
      if (ref.count.textContent !== String(n)) {
        ref.count.textContent = String(n);
        ref.tile.setAttribute("aria-label", `${ref.name} ${n}`);
      }
    });

    requestAnimationFrame(update);
  }

  // ---- 이벤트 구독: 표시 전환 + 수집 팝 피드백 ----
  bus.addEventListener("game:start", () => {
    displayedScore = 0;
    baseSpeed = game.getState().speed || 0;
    if (scoreEl) scoreEl.textContent = "0";
  });

  bus.addEventListener("game:collect", (e) => {
    const type = e.detail && e.detail.type;
    const ref = type && tiles.get(type);
    if (ref) pop(ref.tile); // 해당 재료 타일 팝
    pop(scoreEl); // 점수도 함께 팝(수집 +점수 강조)
  });

  root.dataset.ready = "true";
  requestAnimationFrame(update);
}
