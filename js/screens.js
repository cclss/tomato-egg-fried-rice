/* ==========================================================================
   Screens — 화면 상태 전환 메커니즘
   --------------------------------------------------------------------------
   #screen-start ↔ #screen-play 사이를 크로스페이드로 전환한다.
   비주얼(투명도/visibility 전환)은 CSS가 담당하고, 여기서는 상태(is-active)와
   접근성 속성(aria-hidden), 포커스 이동만 관리한다.
   ========================================================================== */
(function () {
  "use strict";

  var screens = Array.prototype.slice.call(
    document.querySelectorAll(".screen")
  );

  /**
   * 지정한 id의 화면을 활성화하고 나머지는 비활성화한다.
   * @param {string} targetId 활성화할 화면 요소의 id
   */
  function showScreen(targetId) {
    screens.forEach(function (screen) {
      var isActive = screen.id === targetId;
      screen.classList.toggle("is-active", isActive);
      screen.setAttribute("aria-hidden", isActive ? "false" : "true");
    });
  }

  function startGame() {
    showScreen("screen-play");

    // 전환된 플레이 화면으로 포커스를 옮겨 스크린리더 맥락을 갱신한다.
    var playRoot = document.getElementById("play-root");
    if (playRoot) {
      playRoot.focus();
    }
  }

  var startButton = document.getElementById("btn-start");
  if (startButton) {
    // 네이티브 <button>이므로 클릭과 Enter/Space 활성화를 모두 처리한다.
    startButton.addEventListener("click", startGame);
  }

  // 초기 상태: 시작 화면 활성, 플레이 화면 숨김.
  showScreen("screen-start");

  // 외부(후속 grain)에서 화면 전환을 재사용할 수 있도록 노출한다.
  window.Screens = { show: showScreen };
})();
