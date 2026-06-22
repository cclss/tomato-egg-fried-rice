/**
 * Inventory HUD — 시각 컴포넌트 (grain-3).
 *
 * 역할
 *  - 인벤토리 스토어를 "읽기/구독"만 하여 6종 재료 수집 현황 + 전체 진행도를
 *    화면 상단 중앙 HUD로 실시간 렌더링한다.
 *  - 상태 변경은 전적으로 스토어를 통해 일어난다. 이 컴포넌트는 상태를 바꾸지 않는다
 *    (store.collect / reset 등 변경 API를 호출하지 않는다).
 *
 * 경계 (grain-2 계약)
 *  - store.subscribe / store.getState / store.isMaterialComplete 와 mount 컨테이너만 사용한다.
 *  - 스토어의 내부 상태에 직접 접근하지 않는다.
 *
 * Design Spec: components/inventory-hud/base.md
 *  - 상태(empty / partially-collected / complete)와 마이크로 인터랙션
 *    (slot-pop / highlight-flash)을 Spec 토큰값으로 구현한다.
 *  - 모든 디자인 값은 inventory.css 의 CSS 변수(Token)로만 적용된다 (JS는 클래스 토글만).
 */
(function (GAME) {
  'use strict';

  function createInventoryHUD(options) {
    const opts = options || {};
    const store = opts.store;
    const mount = opts.mount;
    const ingredients = opts.ingredients || (store && store.ingredients) || [];

    if (!store || typeof store.subscribe !== 'function') {
      throw new Error('createInventoryHUD: store(subscribe 포함) 가 필요합니다.');
    }
    if (!mount) {
      throw new Error('createInventoryHUD: mount 컨테이너가 필요합니다.');
    }

    // 미지원 환경 폴백 아이콘은 정의(ingredients)에 위임 — 여기선 표시만 한다.
    function iconFor(def) {
      return def.icon || def.fallbackIcon || '?';
    }

    // ── DOM 구성 ──────────────────────────────────────────────────────────
    const panel = document.createElement('section');
    panel.className = 'inv-hud';
    panel.setAttribute('aria-label', '재료 수집 현황');

    const progress = document.createElement('p');
    progress.className = 'inv-hud__progress';
    progress.setAttribute('role', 'status');     // 진행도 변화를 보조기기에 알림
    progress.setAttribute('aria-live', 'polite');

    const slotsRow = document.createElement('div');
    slotsRow.className = 'inv-hud__slots';

    const slotById = {};   // id -> { slot, badge, label }

    ingredients.forEach(function (def) {
      const slot = document.createElement('div');
      slot.className = 'inv-slot';
      slot.dataset.id = def.id;
      slot.setAttribute('role', 'img');

      const icon = document.createElement('span');
      icon.className = 'inv-slot__icon';
      icon.textContent = iconFor(def);
      icon.setAttribute('aria-hidden', 'true');

      const badge = document.createElement('span');
      badge.className = 'inv-slot__badge';
      badge.hidden = true;

      slot.appendChild(icon);
      slot.appendChild(badge);
      slotsRow.appendChild(slot);

      slotById[def.id] = { slot: slot, badge: badge, label: def.label || def.id };
    });

    panel.appendChild(progress);
    panel.appendChild(slotsRow);
    mount.appendChild(panel);

    // ── 렌더 ──────────────────────────────────────────────────────────────
    function renderState(state) {
      // 전체 진행도 (예: 4/6) + complete 강조
      progress.textContent = state.collectedTypes + '/' + state.totalTypes;
      panel.classList.toggle('is-complete', state.isComplete);

      ingredients.forEach(function (def) {
        const ref = slotById[def.id];
        const count = state.counts[def.id] || 0;
        const collected = store.isMaterialComplete(def.id);

        ref.slot.classList.toggle('is-collected', collected);

        // Count Badge: 같은 재료를 2개 이상 모은 경우에만 노출 (Spec: 선택 요소)
        if (count >= 2) {
          ref.badge.textContent = '×' + count;
          ref.badge.hidden = false;
        } else {
          ref.badge.hidden = true;
        }

        ref.slot.setAttribute(
          'aria-label',
          ref.label + ': ' + (collected ? '수집됨' : '미수집') +
            (count >= 2 ? ' ' + count + '개' : '')
        );
      });
    }

    // ── 마이크로 인터랙션 ──────────────────────────────────────────────────
    // 수집 순간(uncollected → collected 최초 전이)에만 slot-pop + highlight-flash 재생.
    // prefers-reduced-motion 환경에서는 모션을 재생하지 않는다 (CSS도 animation:none).
    const reduceMotion = window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;

    function playCollect(id) {
      if (reduceMotion && reduceMotion.matches) return;
      const ref = slotById[id];
      if (!ref) return;
      ref.slot.classList.remove('is-collecting');
      // 동일 클래스 재부여 시 애니메이션 재시작을 위한 강제 reflow (impl).
      void ref.slot.offsetWidth;
      ref.slot.classList.add('is-collecting');
    }

    // 슬롯에는 pop + flash 두 애니메이션이 동시에 걸린다. flash(긴 쪽)가 끝날 때
    // 정리해야 pop(짧은 쪽) 종료 시점에 flash가 잘리지 않는다.
    function onAnimationEnd(e) {
      const t = e.target;
      if (e.animationName === 'inv-slot-flash' &&
          t.classList && t.classList.contains('inv-slot')) {
        t.classList.remove('is-collecting');
      }
    }
    slotsRow.addEventListener('animationend', onAnimationEnd);

    // ── 구독 ── 실시간 갱신 (immediate: 등록 직후 현재 상태 1회 반영) ───────
    const unsubscribe = store.subscribe(function (e) {
      renderState(e.state);
      if (e.type === 'collect' && e.justCollected) {
        playCollect(e.id);
      }
    }, { immediate: true });

    function destroy() {
      unsubscribe();
      slotsRow.removeEventListener('animationend', onAnimationEnd);
      if (panel.parentNode) panel.parentNode.removeChild(panel);
    }

    return { destroy: destroy, el: panel };
  }

  GAME.createInventoryHUD = createInventoryHUD;
})(window.GAME = window.GAME || {});
