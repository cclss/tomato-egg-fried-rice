/**
 * 재료 정의 — '도마도 달걀 볶음밥' 6종.
 *
 * 슬롯 배열 순서와 아이콘/표시명은 Design Spec(components/inventory-hud)을 따른다.
 * 각 재료의 `required`는 complete(전체 완료) 판정에 쓰이는 "필요 수량"이며,
 * 본 게임에서 같은 재료를 여러 개 모으는 모드로 확장할 때 이 값만 조정하면 된다.
 *
 * 아이콘은 이모지 글리프이며 픽셀화 렌더링(image-rendering: pixelated)을 의도한다.
 * 후속 단계에서 동일 식별자(id)로 픽셀 스프라이트로 교체할 수 있다.
 */
(function (GAME) {
  'use strict';

  GAME.INGREDIENTS = [
    { id: 'tomato',       label: '토마토',  icon: '🍅', required: 1 },
    { id: 'egg',          label: '달걀',    icon: '🥚', required: 1 },
    { id: 'rice',         label: '밥',      icon: '🍚', required: 1 },
    // 전용 파/대파 이모지가 없어 양파 글리프로 대체 (Spec 비고).
    { id: 'green-onion',  label: '파',      icon: '🧅', required: 1 },
    { id: 'salt',         label: '소금',    icon: '🧂', required: 1 },
    // 기름 따르기 표현. 미지원 환경 폴백: 🛢️ (Spec 비고).
    { id: 'cooking-oil',  label: '식용유',  icon: '🫗', fallbackIcon: '🛢️', required: 1 },
  ];
})(window.GAME = window.GAME || {});
