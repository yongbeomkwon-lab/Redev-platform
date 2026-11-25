// ─────────────────────────────────────────────────────────────────────────────
// 관리자 구역(공용 DB) → 서울시 고시 구역 덮어쓰기
//
//   · 관리자 화면(?admin=1)에서 구역을 골라 「경계·정보 수정」으로 저장하면
//     그 구역은 `replacesZoneId`(덮어쓸 서울시 구역 id)를 달고 공용 DB에 남는다.
//   · 이 파일이 그 저장본을 **지도·상세·검색이 함께 보는 구역 목록**에 적용한다.
//     (예전에는 관리자 화면의 반투명 도형으로만 보여서, 사업유형을 '모아타운통합기획'으로
//      고쳐 저장해도 상세 패널·지도 칩은 서울시 원본 '모아타운' 그대로였다 — 2026-11-25 제보)
//   · 적용 항목: 이름·사업유형·추진단계·자치구·면적·경계(링)·메모.
//     별칭·출처·고시 메모처럼 **서울시 원본에만 있는 정보는 그대로 둔다**(지우지 않는다).
//   · leaflet·kakao·React 를 임포트하지 않는 순수 모듈.
// ─────────────────────────────────────────────────────────────────────────────
import { CUSTOM_ZONE_TYPES, type CustomZone } from "@/lib/custom-zones";
import type { SeoulZone } from "@/lib/seoul-zones";
import type { MapZoneType } from "@/lib/types";

/** 링의 첫 점을 끝에 한 번 더 찍은 닫힌 링이면 떼어 낸다([위도, 경도] 쌍) */
function openRing(ring: [number, number][] | undefined): [number, number][] | undefined {
  if (!ring || ring.length < 3) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (ring.length > 3 && Math.abs(first[0] - last[0]) < 1e-9 && Math.abs(first[1] - last[1]) < 1e-9) {
    return ring.slice(0, -1);
  }
  return ring;
}

/** 두 링이 같은 도형인지(소수 6자리 반올림 비교) */
function sameRing(a: [number, number][] | undefined, b: [number, number][] | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (Math.abs(a[i][0] - b[i][0]) > 1e-6 || Math.abs(a[i][1] - b[i][1]) > 1e-6) return false;
  }
  return true;
}

/** 링의 면적 가중 무게중심 — 지도 이름표·화면 맞춤에 쓰는 center */
function ringCentroid(ring: [number, number][]): [number, number] {
  let a = 0;
  let cx = 0;
  let cy = 0;
  const n = ring.length;
  for (let i = 0; i < n; i += 1) {
    const [y1, x1] = ring[i];
    const [y2, x2] = ring[(i + 1) % n];
    const f = x1 * y2 - x2 * y1;
    a += f;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  if (Math.abs(a) < 1e-12) {
    return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n];
  }
  const k = 1 / (3 * a);
  return [cy * k, cx * k];
}

/** 이 구역을 덮어쓰는 관리자 저장본 — 없으면 undefined */
export function customOverrideFor(custom: CustomZone[], zoneId: string): CustomZone | undefined {
  return custom.find((z) => z.replacesZoneId === zoneId);
}

/**
 * 서울시 구역 목록에 관리자 저장본을 덮어쓴 새 목록.
 *   · 덮어쓸 저장본이 없으면 **원본 배열을 그대로** 돌려준다(불필요한 재렌더 방지).
 */
export function applyCustomZoneOverrides(zones: SeoulZone[], custom: CustomZone[]): SeoulZone[] {
  const overrides = custom.filter((z) => !!z.replacesZoneId);
  if (!overrides.length || !zones.length) return zones;
  const byZone = new Map<string, CustomZone>();
  for (const o of overrides) {
    const id = o.replacesZoneId as string;
    // 같은 구역에 저장본이 여럿이면 마지막(최근 수정) 것을 쓴다.
    byZone.set(id, o);
  }
  let touched = false;
  const out = zones.map((z) => {
    const o = byZone.get(z.id);
    if (!o) return z;
    touched = true;
    const ring = openRing(o.ring);
    const hasRing = !!ring && ring.length >= 3;
    const boundaryChanged = hasRing && !sameRing(ring, z.polygon);
    const type =
      (CUSTOM_ZONE_TYPES as readonly string[]).includes(o.type) && o.type !== "기타"
        ? (o.type as MapZoneType)
        : z.type;
    const note = o.note.trim()
      ? [z.note?.trim(), `[관리자 보정] ${o.note.trim()}`].filter(Boolean).join("\n\n")
      : z.note;
    return {
      ...z,
      name: o.name.trim() || z.name,
      type,
      stage: o.stage || z.stage,
      gu: o.gu || z.gu,
      area: o.areaSqm > 0 ? Math.round(o.areaSqm) : z.area,
      ...(hasRing ? { polygon: ring, center: ringCentroid(ring) } : {}),
      // 경계를 실제로 고친 경우에만 원본 도형을 지운다 — 정보만 고쳤으면 원본 경계·출처를 지킨다.
      ...(boundaryChanged
        ? { parts: undefined, holes: undefined, geom: "직접작도" as SeoulZone["geom"] }
        : {}),
      note,
      adminEdited: true,
    } satisfies SeoulZone;
  });
  return touched ? out : zones;
}
