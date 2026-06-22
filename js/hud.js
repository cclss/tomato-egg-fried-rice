/* ==========================================================================
   HUD — 점수 / 생명력 표시 컴포넌트 + 갱신 API
   --------------------------------------------------------------------------
   표시 UI와 갱신 API(updateScore / updateLife)만 담당한다.
   실제 채점·생명력 차감 게임 로직은 이 모듈의 책임이 아니다(범위 밖).
   비주얼(색/애니메이션)은 css/hud.css가 담당하고, 여기서는 값 갱신과
   상태 클래스 토글, 접근성 라벨 갱신만 관리한다.
   ========================================================================== */
(function () {
  "use strict";

  var MAX_LIFE = 3; // 생명력 하트 개수 기본값

  // 토마토(하트) 모티프 SVG. 색은 CSS(fill: var(--color-life)*)이 결정한다.
  var HEART_PATH =
    "M12 21s-7.5-4.9-10-9.2C.4 9 1.3 5.5 4.3 4.6 6.6 3.9 8.7 5 12 8.1 " +
    "15.3 5 17.4 3.9 19.7 4.6c3 .9 3.9 4.4 2.3 7.2C19.5 16.1 12 21 12 21z";

  var scoreEl = document.getElementById("hud-score");
  var heartsEl = document.getElementById("hud-hearts");

  var state = {
    score: 0,
    life: MAX_LIFE,
    maxLife: MAX_LIFE,
  };

  /**
   * 하트 아이콘을 maxLife 개수만큼 그린다. (최초 1회)
   */
  function renderHearts() {
    if (!heartsEl) return;
    heartsEl.innerHTML = "";
    for (var i = 0; i < state.maxLife; i++) {
      var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "hud__heart");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("aria-hidden", "true");
      var path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
      );
      path.setAttribute("d", HEART_PATH);
      svg.appendChild(path);
      heartsEl.appendChild(svg);
    }
    paintHearts();
  }

  /**
   * 현재 life 값에 따라 채워진/소진된 하트 상태를 반영한다.
   */
  function paintHearts() {
    if (!heartsEl) return;
    var hearts = heartsEl.querySelectorAll(".hud__heart");
    for (var i = 0; i < hearts.length; i++) {
      hearts[i].classList.toggle("is-empty", i >= state.life);
    }
    heartsEl.setAttribute(
      "aria-label",
      "생명력 " + state.life + "개 남음 (전체 " + state.maxLife + "개)"
    );
  }

  /**
   * 애니메이션 클래스를 재생할 수 있도록 토글한다.
   * (이미 붙어 있으면 떼었다가 다시 붙여 재생을 강제한다)
   * @param {Element} el 대상 요소
   * @param {string} cls 애니메이션 트리거 클래스
   */
  function replayAnimation(el, cls) {
    if (!el) return;
    el.classList.remove(cls);
    // 강제 리플로우로 애니메이션 재시작을 보장한다.
    void el.offsetWidth;
    el.classList.add(cls);
    el.addEventListener(
      "animationend",
      function handler() {
        el.classList.remove(cls);
        el.removeEventListener("animationend", handler);
      }
    );
  }

  /**
   * 점수를 갱신하고 증가 시 강조 애니메이션을 재생한다.
   * @param {number} value 새 점수
   */
  function updateScore(value) {
    var next = Number(value) || 0;
    var increased = next > state.score;
    state.score = next;
    if (scoreEl) {
      scoreEl.textContent = String(next);
      if (increased) {
        replayAnimation(scoreEl, "is-bumped");
      }
    }
    return state.score;
  }

  /**
   * 생명력을 갱신하고 감소 시 시각 피드백(흔들림 + 소진 페이드)을 재생한다.
   * @param {number} value 새 생명력(하트 개수). 0~maxLife로 클램프된다.
   */
  function updateLife(value) {
    var next = Number(value);
    if (isNaN(next)) next = state.life;
    next = Math.max(0, Math.min(state.maxLife, Math.round(next)));
    var decreased = next < state.life;
    state.life = next;
    paintHearts();
    if (decreased) {
      replayAnimation(heartsEl, "is-hit");
    }
    return state.life;
  }

  // 초기 렌더 — 하트 그리기 + 점수 표시.
  renderHearts();
  if (scoreEl) {
    scoreEl.textContent = String(state.score);
  }

  // 후속 grain(게임 로직)에서 점수/생명력을 갱신할 수 있도록 노출한다.
  window.Hud = {
    updateScore: updateScore,
    updateLife: updateLife,
    getState: function () {
      return { score: state.score, life: state.life, maxLife: state.maxLife };
    },
  };
})();
