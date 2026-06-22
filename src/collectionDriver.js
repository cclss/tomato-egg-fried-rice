/**
 * 얇은 수집 드라이버 (데모용 스캐폴딩).
 *
 * 목적: 인벤토리 스토어가 실제로 채워지는 모습을 시연한다.
 *  - 스테이지에 재료 픽업(클릭 가능한 이모지)을 주기적으로 스폰한다.
 *  - 픽업을 클릭하면 store.collect(id) 를 호출한다 — 그게 전부다.
 *  - 키보드 보조: Space = 아직 부족한 재료 1종 자동 수집, R = 리셋.
 *
 * 교체 지점: 본 게임의 수집 로직(캐릭터 접촉 판정 등)은 이 드라이버를 제거하고
 * 동일하게 store.collect(id) 만 호출하면 된다. 드라이버는 스토어의 collect 와
 * 재료 정의 외에는 아무것도 모른다 (뷰/스토어 내부 상태에 결합하지 않음).
 */
(function (GAME) {
  'use strict';

  function createCollectionDriver(options) {
    const opts = options || {};
    const store = opts.store;
    const ingredients = opts.ingredients || (store && store.ingredients) || [];
    const stage = opts.stage || null;
    const spawnIntervalMs = opts.spawnIntervalMs || 1100;

    if (!store || typeof store.collect !== 'function') {
      throw new Error('createCollectionDriver: store(collect 포함) 가 필요합니다.');
    }

    // id -> 표시 정보(아이콘/라벨) 조회용
    const byId = {};
    ingredients.forEach((it) => { byId[it.id] = it; });

    let timer = null;
    let running = false;

    function iconFor(def) {
      return def.icon || def.fallbackIcon || '?';
    }

    /** 아직 필요 수량을 못 채운 재료 id 목록 */
    function remainingIds() {
      return ingredients
        .map((it) => it.id)
        .filter((id) => !store.isMaterialComplete(id));
    }

    function spawnPickup(def) {
      if (!stage || !def) return;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'pickup';
      el.textContent = iconFor(def);
      el.dataset.id = def.id;
      el.setAttribute('aria-label', (def.label || def.id) + ' 줍기');
      // 위치는 구현 설정값(랜덤 배치) — 디자인 토큰이 아니다.
      el.style.left = (5 + Math.floor(Math.random() * 82)) + '%';
      el.style.top = (15 + Math.floor(Math.random() * 60)) + '%';
      el.addEventListener('click', () => {
        store.collect(def.id);
        el.remove();
      });
      stage.appendChild(el);
    }

    function spawnTick() {
      const remaining = remainingIds();
      if (remaining.length === 0) {
        stop();
        return;
      }
      const id = remaining[Math.floor(Math.random() * remaining.length)];
      spawnPickup(byId[id]);
    }

    function onKeydown(e) {
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        const remaining = remainingIds();
        if (remaining.length > 0) store.collect(remaining[0]);
      } else if (e.key === 'r' || e.key === 'R') {
        store.reset();
        clearPickups();
        if (!running) start();
      }
    }

    function clearPickups() {
      if (!stage) return;
      stage.querySelectorAll('.pickup').forEach((el) => el.remove());
    }

    function start() {
      if (running) return;
      running = true;
      document.addEventListener('keydown', onKeydown);
      if (stage) {
        spawnTick();
        timer = setInterval(spawnTick, spawnIntervalMs);
      }
    }

    function stop() {
      running = false;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    function destroy() {
      stop();
      document.removeEventListener('keydown', onKeydown);
      clearPickups();
    }

    return { start, stop, destroy, isRunning: () => running };
  }

  GAME.createCollectionDriver = createCollectionDriver;
})(window.GAME = window.GAME || {});
