// ─────────────────────────────────────────────────────────────────────────────
// 지도 도구 요청 (2026-11-28)
//   모바일 홈의 퀵메뉴(경매·공매 / 구역 그리기)가 **이미 떠 있는 지도**에
//   "이 도구를 켜 달라"고 알리는 작은 통로다.
//   · 주소(`?layer=`)로 하지 않는 이유: 같은 지도 화면에서 메뉴를 다시 눌러도 주소가
//     그대로라 아무 일도 일어나지 않는다(그리고 딥링크 주소를 지저분하게 만든다).
//   · 지도가 그 순간 마운트 중이면 `takePendingMapLayer()` 가 꺼내 간다.
// ─────────────────────────────────────────────────────────────────────────────
export type MapLayerRequest = "auction" | "gongmae" | "draw";

let pending: MapLayerRequest | null = null;
const listeners = new Set<(layer: MapLayerRequest) => void>();

/** 홈 퀵메뉴 → 지도에 도구를 켜 달라고 요청한다 */
export function requestMapLayer(layer: MapLayerRequest): void {
  pending = layer;
  for (const fn of listeners) fn(layer);
}

/** 지도가 마운트될 때 한 번 꺼내 간다 */
export function takePendingMapLayer(): MapLayerRequest | null {
  const layer = pending;
  pending = null;
  return layer;
}

/** 지도가 이미 떠 있을 때의 요청 구독 */
export function onMapLayer(fn: (layer: MapLayerRequest) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
