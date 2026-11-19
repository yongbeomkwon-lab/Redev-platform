"use client";
// ─────────────────────────────────────────────────────────────────────────────
// 주소 → 소속 정비구역 판별
//
//  · 주소 좌표(경위도)를 서울시 정비구역 전수 폴리곤에 대고 광선교차(Ray Casting)로 판정한다.
//    Polygon·MultiPolygon(parts) 모두 반영하고, 구역 안에 구멍(hole)이 있으면 GeoJSON 규칙대로
//    "홀 안 = 구역 밖"이 된다(홀 링은 별도 링으로 들어오므로 그 안에 있으면 그 링은 교차로 세지
//    않도록, 실제로는 '포함 링이 하나도 없을 때 밖'으로 판정한다 — 아래 contains 설명 참고).
//  · 판정 우선순위: ① 진행 중 구역 ② 준공 구역 ③ 경계 미고시 후보지 인근 ④ 구역 밖(최단거리 안내)
//  · 지도는 준공 구역을 기본으로 숨기지만, 판정은 **전체 구역**을 대상으로 한다 —
//    숨겨져 있다고 주소가 구역 밖이 되는 것은 아니다.
// ─────────────────────────────────────────────────────────────────────────────
import { prepareZones, zonesContaining, nearestZones, distanceM, type PreparedZones } from "@/components/map/prepare-zones";
import { isCompletedZone, type SeoulZone } from "@/lib/seoul-zones";
import type { AddressCandidate } from "@/lib/kakao-address";

/** 경계 미고시 후보지 '인근' 판정 반경(m) — 사당21구역처럼 점으로만 표시되는 후보지 */
export const NEAR_CANDIDATE_M = 250;

export type ZoneHit = { zone: SeoulZone; completed: boolean };

export type AddressVerdict = {
  /** 선택한 주소 후보 */
  address: AddressCandidate;
  /** 포함하는 진행 중 구역 (작은 구역 먼저) */
  inside: ZoneHit[];
  /** 포함하는 준공 구역 */
  completedHits: ZoneHit[];
  /** 경계 미고시 후보지 인근 (가까운 순) */
  nearCandidates: { zone: SeoulZone; distance: number }[];
  /** 구역 밖일 때 가장 가까운 구역 1~3곳 */
  nearest: { zone: SeoulZone; distance: number; completed: boolean }[];
  /** inside > completed > near-candidate > outside */
  status: "inside" | "completed" | "near-candidate" | "outside";
};

export function prepareAllZones(all: SeoulZone[]): PreparedZones {
  return prepareZones(all);
}

/** 주소 후보 하나를 전체 구역에 대고 판별한다 */
export function judgeAddress(
  address: AddressCandidate,
  allZones: SeoulZone[],
  prep?: PreparedZones
): AddressVerdict {
  const prepared = prep ?? prepareAllZones(allZones);
  const { lat, lng } = address;

  const containing = zonesContaining(prepared, lat, lng).map((z) => ({
    zone: z.zone,
    completed: z.completed || isCompletedZone(z.zone),
  }));

  const inside = containing.filter((h) => !h.completed);
  const completedHits = containing.filter((h) => h.completed);

  // 경계가 고시되지 않은 후보지는 폴리곤이 없어 안/밖을 말할 수 없다 → 반경으로만 안내
  const nearCandidates = prepared.points
    .map((z) => ({ zone: z, distance: distanceM(lat, lng, z.center[0], z.center[1]) }))
    .filter((r) => r.distance <= NEAR_CANDIDATE_M)
    .sort((a, b) => a.distance - b.distance);

  const nearest = nearestZones(prepared, lat, lng, 3).filter((r) => r.distance > 0.5);

  const status: AddressVerdict["status"] =
    inside.length > 0
      ? "inside"
      : completedHits.length > 0
        ? "completed"
        : nearCandidates.length > 0
          ? "near-candidate"
          : "outside";

  return { address, inside, completedHits, nearCandidates, nearest, status };
}

/** 말풍선·카드에 쓰는 한 줄 판정 문구 — 구역 밖은 빈 문자열(문구 없이 지점만) */
export function verdictHeadline(v: AddressVerdict): string {
  switch (v.status) {
    case "inside": {
      const z = v.inside[0].zone;
      return `✅ ${z.name} 포함`;
    }
    case "completed": {
      const z = v.completedHits[0].zone;
      return `🏁 준공 완료된 ${z.name} 내 주소`;
    }
    case "near-candidate": {
      const z = v.nearCandidates[0].zone;
      return `⚠️ 경계 미고시 후보지(${z.name}) 인근 주소`;
    }
    default:
      // 구역 밖 — 판정 문구를 싣지 않는다(핀은 주소만, 카드는 가까운 구역 목록만).
      // ‘정비구역 밖 주소입니다’는 찾은 위치를 부정하는 것처럼 읽혀 걷어냈다.
      return "";
  }
}

/** 거리 표기 — 1km 미만은 m, 이상은 km(소수 1자리) */
export function meters(m: number): string {
  if (!Number.isFinite(m)) return "-";
  if (m < 1000) return `${Math.round(m / 10) * 10}m`;
  return `${(m / 1000).toFixed(1)}km`;
}
