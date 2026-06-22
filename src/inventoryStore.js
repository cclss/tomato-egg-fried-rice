/**
 * 재료 수집 상태 스토어 (실시간 pub/sub).
 *
 * 역할
 *  - 현재 재료별 수집 개수를 단일 소스로 보관한다.
 *  - collect() 호출 시 즉시 변경 이벤트를 구독자에게 발행한다.
 *  - 전체 완료(complete) 여부를 계산한다.
 *
 * 설계 의도: view와 결합하지 않는다.
 *  - 스토어는 DOM/렌더링을 전혀 모른다. 순수 상태 + 이벤트만 다룬다.
 *  - 본 게임의 수집 로직(캐릭터 접촉, 자동 줍기 등)은 이 스토어의 collect()만
 *    호출하면 그대로 붙는다. 데모 드라이버와 동일한 인터페이스다.
 *
 * 이벤트 페이로드 (구독자 listener 인자)
 *  - type:        'collect' | 'reset' | 'init'
 *  - id:          변경된 재료 id (collect 한정)
 *  - amount:      증가량 (collect 한정)
 *  - prevCount:   변경 전 개수 (collect 한정)
 *  - count:       변경 후 개수 (collect 한정)
 *  - justCollected: 이 재료가 uncollected → collected 로 "처음" 전이했는지
 *                   (HUD의 slot-pop / highlight-flash 트리거 지점)
 *  - state:       getState() 스냅샷 (모든 이벤트 공통)
 */
(function (GAME) {
  'use strict';

  function createInventoryStore(ingredients) {
    if (!Array.isArray(ingredients) || ingredients.length === 0) {
      throw new Error('createInventoryStore: ingredients[] 가 필요합니다.');
    }

    // 정의에서 id/required 만 추출 (스토어는 표시 정보 icon/label에 의존하지 않는다).
    const defs = ingredients.map((it) => ({
      id: it.id,
      required: it.required != null ? it.required : 1,
    }));
    const requiredById = {};
    defs.forEach((d) => { requiredById[d.id] = d.required; });

    const counts = {};
    defs.forEach((d) => { counts[d.id] = 0; });

    const listeners = new Set();

    const isKnown = (id) => Object.prototype.hasOwnProperty.call(counts, id);

    // 한 재료가 "수집됨"으로 간주되는 기준: 필요 수량 이상.
    const isMaterialComplete = (id) => isKnown(id) && counts[id] >= requiredById[id];

    const collectedTypeCount = () =>
      defs.reduce((n, d) => n + (isMaterialComplete(d.id) ? 1 : 0), 0);

    // 전체 완료: 6종 모두 필요 수량을 충족.
    const isComplete = () => defs.every((d) => isMaterialComplete(d.id));

    const getCount = (id) => (isKnown(id) ? counts[id] : 0);

    function getState() {
      return {
        counts: Object.assign({}, counts),
        totalTypes: defs.length,
        collectedTypes: collectedTypeCount(),
        isComplete: isComplete(),
      };
    }

    function emit(event) {
      // 구독자 한 명이 던져도 나머지 구독자에게는 통지가 이어지도록 격리한다.
      listeners.forEach((fn) => {
        try {
          fn(event);
        } catch (err) {
          console.error('[inventoryStore] 구독자 처리 중 오류', err);
        }
      });
    }

    /**
     * 재료 1종을 amount 개 수집한다. 변경 이벤트를 즉시 발행한다.
     * @returns 변경 후 state 스냅샷
     */
    function collect(id, amount) {
      if (!isKnown(id)) {
        console.warn('[inventoryStore] 알 수 없는 재료 id:', id);
        return getState();
      }
      const inc = amount == null ? 1 : amount;
      const prev = counts[id];
      counts[id] = prev + inc;

      const event = {
        type: 'collect',
        id,
        amount: inc,
        prevCount: prev,
        count: counts[id],
        justCollected: prev < requiredById[id] && counts[id] >= requiredById[id],
        state: getState(),
      };
      emit(event);
      return event.state;
    }

    /** 모든 수집 개수를 0으로 되돌리고 reset 이벤트를 발행한다. */
    function reset() {
      defs.forEach((d) => { counts[d.id] = 0; });
      emit({ type: 'reset', state: getState() });
      return getState();
    }

    /**
     * 변경 통지를 구독한다.
     * @param listener 이벤트를 받을 함수
     * @param options.immediate true면 등록 직후 현재 state로 한 번 호출(type:'init')
     * @returns 구독 해제 함수
     */
    function subscribe(listener, options) {
      if (typeof listener !== 'function') {
        throw new Error('subscribe: listener 는 함수여야 합니다.');
      }
      listeners.add(listener);
      if (options && options.immediate) {
        listener({ type: 'init', state: getState() });
      }
      return function unsubscribe() {
        listeners.delete(listener);
      };
    }

    return {
      // 읽기 전용 정의 사본 (드라이버/뷰가 참조)
      ingredients: defs.map((d) => ({ id: d.id, required: d.required })),
      collect,
      getCount,
      getState,
      isComplete,
      isMaterialComplete,
      reset,
      subscribe,
    };
  }

  GAME.createInventoryStore = createInventoryStore;
})(window.GAME = window.GAME || {});
