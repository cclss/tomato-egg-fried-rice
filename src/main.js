/**
 * 부트스트랩 — 데이터 + 스토어 + 드라이버를 연결한다.
 *
 * grain-2 경계: 상태/데이터/부트스트랩 계층까지만.
 *  - Inventory HUD 의 실제 렌더링은 grain-3 (#inventory-hud-root 는 빈 채로 둔다).
 *  - 여기서는 스토어 동작을 콘솔과 디버그 오버레이로 "관찰만" 한다.
 */
(function (GAME) {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    const ingredients = GAME.INGREDIENTS;
    const store = GAME.createInventoryStore(ingredients);

    // 콘솔에서 직접 점검할 수 있도록 노출 (예: GAME.store.collect('egg')).
    GAME.store = store;

    // Inventory HUD (grain-3) — 스토어를 읽기/구독하여 상단 중앙 HUD를 렌더한다.
    // 상태 변경은 스토어를 통해서만 일어나고, HUD는 구독으로 실시간 갱신만 한다.
    const hudRoot = document.getElementById('inventory-hud-root');
    if (hudRoot && typeof GAME.createInventoryHUD === 'function') {
      GAME.inventoryHUD = GAME.createInventoryHUD({
        store: store,
        ingredients: ingredients,
        mount: hudRoot,
      });
    }

    const readout = document.getElementById('demo-readout');
    if (readout) {
      readout.hidden = false;
      readout.setAttribute('aria-hidden', 'false');
    }

    // 데모 관찰용 렌더 — 실제 HUD 컴포넌트가 아니다 (grain-3가 #inventory-hud-root에 구현).
    function renderDemoReadout(state) {
      if (!readout) return;
      const parts = ingredients.map((it) => {
        const n = state.counts[it.id];
        return (it.icon || it.fallbackIcon) + (n > 0 ? '×' + n : '·');
      });
      readout.textContent =
        state.collectedTypes + '/' + state.totalTypes +
        (state.isComplete ? '  ✓ COMPLETE' : '') +
        '   ' + parts.join('  ');
    }

    // 스토어 변경을 실시간 구독 (immediate: 등록 직후 현재 상태 1회 반영).
    store.subscribe(function (e) {
      console.log('[inventory]', e.type, e.id || '', e.state);
      if (e.justCollected) {
        console.log('  → 처음 수집됨:', e.id);
      }
      if (e.state.isComplete) {
        console.log('  → 전체 6종 수집 완료! 🎉 (complete)');
      }
      renderDemoReadout(e.state);
    }, { immediate: true });

    // 얇은 데모 드라이버 시작.
    const driver = GAME.createCollectionDriver({
      store: store,
      ingredients: ingredients,
      stage: document.getElementById('game-stage'),
    });
    GAME.driver = driver;
    driver.start();

    console.log('%c도마도 달걀 볶음밥 — 인벤토리 스토어 준비됨', 'color:#43d17a; font-weight:bold');
    console.log('데모: 화면의 재료 아이콘을 클릭해 수집하세요. (Space=다음 재료 자동수집, R=리셋)');
  });
})(window.GAME = window.GAME || {});
