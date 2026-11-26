#!/usr/bin/env python3
"""
방배동 858-1번지 일대 모아타운 — 구역계 배치 정정 (2026-11-26)

계기: 사용자 지적 — "방배동 858-1 전체적으로 구역계가 내려오고 왼쪽으로 움직여야 해.
      요기도 오른쪽 대로변 침범 중"

원인: 2026-11-22 반영분은 서울시 고시 관계도면(고시 제2026-481호, 서울시보 제4175호)의
      빨간 점선을 0.5144m/px 로 옮겨 카카오 지적편집도 위에 눈대중으로 얹은 것이라
      배치가 서쪽 약 8m·남쪽 약 19m 어긋났고, 그 결과 동쪽 변이 대로변(서초대로 방면) 필지와
      도로를 덮었다.

정정 방법(이번에는 눈대중이 아니라 정합):
 1) 브이월드 연속지적도(LP_PA_CBND_BUBUN) 필지를 앱 `/api/parcel` 로 10m·20m 격자 샘플링해
    주변 1,300여 필지의 실제 경계 링을 확보.
 2) 고시 도면의 필지선(검은 선)과 연속지적도 경계를 거리변환(chamfer)+FFT 상관으로
    맞춰 도면 픽셀→위경도 유사변환을 구함: 0.5109 m/px, 회전 +0.3°, 평균 잔차 1.7m.
 3) 기존 16정점 구역계 모양은 도면 점선과 평균 0.67px(≈0.35m), 꼭짓점 최대 0.6px 로
    일치 — 모양은 맞고 배치만 틀렸음을 확인하고, ICP 로 점선에 맞춘 뒤 위 변환으로 위경도화.
 4) 계측 면적이 고시 면적(25,522.4㎡)과 같아지도록 중심 기준 0.303% 확대(경계 이동 0.35m 이내).

검증: 방배초등학교(방배동 861-1, 10,523㎡)는 구역 안에 0.4%만 걸린다(예전 11.4%) — 고시대로
      학교 블록은 ㄷ자 홈 안에 있고 구역 밖이다. 인접 구역과 겹침 없음(가장 가까운 방5 90m).

실행: python3 scripts/apply-bangbae858-1-realign-20261126.py [--check]   (멱등)
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
META_KEY = "bangbae858Realign20261126"

ZID = "bangbae-858-1"

# [위도, 경도] — 고시 관계도면 구역계(점선 중심선)를 연속지적도에 정합한 뒤 16정점
RING = [
    [37.488394, 126.988256], [37.488374, 126.988122], [37.487626, 126.986270],
    [37.487533, 126.986094], [37.487367, 126.986071], [37.486522, 126.986081],
    [37.486622, 126.987073], [37.486655, 126.987163], [37.487397, 126.986687],
    [37.487446, 126.986754], [37.487779, 126.987551], [37.487750, 126.987663],
    [37.486788, 126.988255], [37.486766, 126.988395], [37.486974, 126.989077],
    [37.487059, 126.989116],
]

PROPS = {
    "center": [37.487418, 126.987539],
    "areaNote": (
        "고시 면적 25,522.4㎡(서울시 고시 제2026-481호·서초구 2026-01-13 공고 모두 같은 값)에 맞춰 "
        "경계를 잡았습니다. 도면 점선 중심선을 그대로 옮긴 계측값은 25,368㎡(-0.6%)였고, 도면 점선 자체가 "
        "폭 3.5m(7px)로 그려져 있어 중심선만으로는 ±수백㎡가 흔들리므로, 고시 면적에 맞도록 중심 기준 "
        "0.30% 확대했습니다(각 변 0.35m 이내 이동). 사전조사 결과 공고의 동의율 기준면적 1구역 "
        "9,018.6㎡+2구역 12,347.1㎡=21,365.7㎡와의 차이 약 4,156㎡는 구역 안 도로 등 국·공유지입니다."
    ),
    "boundaryNote": (
        "서울시보 제4175호(2026. 8. 27.) 수록 서울특별시고시 제2026-481호 붙임 「관계도면 — 서초구 방배동 "
        "858-1번지 일원」의 붉은 점선(구역계)이 기준입니다. 2026-11-26에 배치를 다시 잡았습니다: 브이월드 "
        "연속지적도 필지 경계를 도면의 필지선에 거리변환·상관으로 정합해 도면 픽셀→위경도 변환을 구하고"
        "(0.5109m/px·회전 +0.3°·필지선 평균 잔차 1.7m), 구역계 16정점은 점선 중심선에 평균 0.67px(≈0.35m)·"
        "꼭짓점 최대 0.6px로 맞췄습니다. 2026-11-22 판본은 같은 도면을 눈대중으로 얹어 서쪽 약 8m·남쪽 약 "
        "19m 어긋나 있었고, 그 때문에 동쪽 변이 대로변(서초대로 방면) 필지·도로를 덮었습니다. 지금 경계는 동쪽 변이 "
        "대로변 필지선 안쪽에 들어가고, 남쪽이 열린 ㄷ자 홈에 방배초등학교(방배동 861-1) 블록이 들어갑니다"
        "(학교 필지는 구역 안 0.4%, 즉 구역 밖). 관리계획 승인·고시로 지형도면이 나오면 그것 기준으로 다시 "
        "맞춰야 합니다."
    ),
    "asOf": "2026-11-26",
}

META = {
    "asOf": "2026-11-26",
    "note": (
        "방배동 858-1 모아타운 구역계 배치 정정 — 고시 관계도면 점선을 브이월드 연속지적도에 정합"
        "(0.5109m/px·+0.3°, 잔차 1.7m)한 좌표계로 다시 옮김. 이전 판본 대비 서쪽 약 8m·남쪽 약 19m 이동, "
        "동쪽 대로변 침범 해소. 계측 25,522.4㎡(고시 일치)."
    ),
}


def _ring_lnglat() -> list[list[float]]:
    ring = [[lng, lat] for lat, lng in RING]
    ring.append(ring[0])
    return ring


def _area() -> float:
    from shapely.geometry import Polygon as _Poly

    p = _Poly([(lo, la) for la, lo in RING])
    return abs(p.area) * (111320 * math.cos(math.radians(p.centroid.y))) * 110950


def check() -> int:
    bad = 0
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    feat = next((f for f in geo["features"] if f["properties"].get("id") == ZID), None)
    ok = (
        bool(feat)
        and (feat.get("geometry") or {}).get("type") == "Polygon"
        and len(feat["geometry"]["coordinates"][0]) == len(RING) + 1
        and abs(abs(feat["geometry"]["coordinates"][0][0][0]) - abs(RING[0][1])) < 1e-9
    )
    print(f"[{'OK' if ok else 'FAIL'}] geojson {ZID} rings={len(feat['geometry']['coordinates'][0]) - 1 if feat and feat.get('geometry') else 0}")
    bad += 0 if ok else 1
    entry = next((z for z in src if z.get("id") == ZID), None)
    ok2 = bool(entry) and len(entry.get("polygon") or []) == len(RING) and entry.get("asOf") == "2026-11-26"
    print(f"[{'OK' if ok2 else 'FAIL'}] seoul-zones {ZID} polygon={len(entry.get('polygon') or []) if entry else 0}")
    bad += 0 if ok2 else 1
    ok3 = geo["metadata"].get(META_KEY) is not None and geo["metadata"].get("count") == len(geo["features"])
    print(f"[{'OK' if ok3 else 'FAIL'}] metadata.count={geo['metadata'].get('count')} features={len(geo['features'])}")
    bad += 0 if ok3 else 1
    return bad


def apply() -> int:
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    before = len(geo["features"])
    feat = next((f for f in geo["features"] if f["properties"].get("id") == ZID), None)
    entry = next((z for z in src if z.get("id") == ZID), None)
    if feat is None or entry is None:
        print("[실패] 구역 없음:", ZID)
        return 1
    feat["properties"] = {**feat["properties"], **PROPS}
    feat["geometry"] = {"type": "Polygon", "coordinates": [_ring_lnglat()]}
    entry.update(PROPS)
    entry["polygon"] = [list(p) for p in RING]
    entry.pop("parts", None)
    geo["metadata"][META_KEY] = META
    geo["metadata"]["count"] = len(geo["features"])
    GEOJSON.write_text(json.dumps(geo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    SOURCE.write_text(json.dumps(src, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[반영] {ZID} — {len(RING)}정점, features {before}->{len(geo['features'])}, 계측 {_area():,.1f}㎡")
    return 0


if __name__ == "__main__":
    sys.exit(check() if "--check" in sys.argv else apply())
