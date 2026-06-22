/*
 * TitleScreen 동작.
 * grain-2 범위: 배경 부유 재료 생성 + 시작 액션 → `start` 이벤트 발행까지만.
 * 상태 전환(타이틀 → 플레이) 배선은 grain-5에서 이 이벤트를 구독해 연결한다.
 */

// 부유 재료 배치(구현 설정값 — 화면상 위치 %). 시각적 깊이는 CSS의 near/far 레이어가 만든다.
const AMBIENT_SPOTS = [
  { left: 10, top: 22 },
  { left: 26, top: 64 },
  { left: 40, top: 30 },
  { left: 56, top: 70 },
  { left: 70, top: 24 },
  { left: 86, top: 58 },
  { left: 18, top: 46 },
  { left: 64, top: 46 },
  { left: 90, top: 34 },
];
const AMBIENT_TYPES = ["tomato", "egg", "rice"];
const AMBIENT_LAYERS = ["far", "near"];

/** 배경 부유 재료(토마토/계란/밥)를 ambient 레이어에 채운다. */
function buildAmbient(container) {
  const fragment = document.createDocumentFragment();
  AMBIENT_SPOTS.forEach((spot, i) => {
    const type = AMBIENT_TYPES[i % AMBIENT_TYPES.length];
    const layer = AMBIENT_LAYERS[i % AMBIENT_LAYERS.length];
    const el = document.createElement("span");
    el.className = `float-ingredient float-ingredient--${layer} float-ingredient--${type}`;
    el.style.left = `${spot.left}%`;
    el.style.top = `${spot.top}%`;
    // 음수 지연으로 각 재료의 부유 위상을 어긋나게 한다(구현 설정값 — 위상 스태거).
    el.style.animationDelay = `${-(i * 0.9).toFixed(2)}s`;
    fragment.appendChild(el);
  });
  container.appendChild(fragment);
}

/**
 * 시작 액션을 `start` 커스텀 이벤트로 발행한다.
 * 네이티브 <button>의 click은 포인터 클릭과 키보드(Enter/Space) 양쪽에서 발생하므로
 * 단일 click 리스너로 두 입력 경로를 모두 커버한다.
 */
function emitStart() {
  document.dispatchEvent(new CustomEvent("start", { bubbles: true }));
}

/** 타이틀 화면을 초기화한다(부유 재료 생성 + 시작 이벤트 배선). 중복 초기화는 무시한다. */
export function initTitleScreen() {
  const screen = document.querySelector("[data-title-screen]");
  if (!screen || screen.dataset.ready === "true") return;

  const ambient = screen.querySelector("[data-title-ambient]");
  if (ambient) buildAmbient(ambient);

  const startButton = screen.querySelector("[data-start-button]");
  if (startButton) {
    startButton.addEventListener("click", emitStart);
  }

  screen.dataset.ready = "true";
}
