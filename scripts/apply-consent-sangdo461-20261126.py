#!/usr/bin/env python3
"""2026-11-26 — 리디브에 「(가)상도동 461」 모아타운 추가 + 구역 동의율(consentRate) 채우기

## 1) (가)상도동 461 모아타운 (동작구 상도동 461·469 일대, 주민제안 추진지)
  · 경계: 갈타맵이 추진준비 구역으로 공개한 경계(`map.galta.kr/redevelopment/prelim.geojson`,
    pz_id=MAN-4bd1788b64) — 갈타맵 지도에 실제로 그려지는 도형 그대로. 18점, 계측 13,297㎡.
    갈타맵도 "공식 정보 후보지"로 표시하고 구역계가 달라질 수 있다고 밝히므로 geom="가상경계".
  · 수치: 갈타맵 표기 13,312㎡·62필지 / 공유 자료(2026-11-25) 소유자 약 243명·기존 227세대·
    계획 445세대 구상·노후도 65% / 동의율 60%(2026-11-25 기준).
  · 동의율: 11/10 약 56% → 11/25 60% 도달, 12월 동작구청 주민제안 접수 준비.

## 2) 동의율 데이터 (모든 구역 공통)
  · 지금까지 구역 설명(note)에 문장으로만 들어 있던 '동의율 N%'를 consentRate/consentDate/
    consentNote 로 옮긴다. 문장의 맥락(승인 당시·후보지 신청 당시·연번부여 시점)을 확인해
    기준일을 함께 적었고, '요건 70% 이상'·'반대동의율'처럼 **측정값이 아닌 것**은 넣지 않는다.
  · 값이 없는 구역은 그대로 둔다(화면은 '미공개'로 보여 준다).

실행: python3 scripts/apply-consent-sangdo461-20261126.py [--check]
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
META = ROOT / "src" / "data" / "zones-meta.json"
INDEX = ROOT / "public" / "data" / "zone-index.json"

NEW_ID = "dj-sangdo-461"

EXPECTED_BEFORE = 2387
EXPECTED_AFTER = 2388

# 갈타맵 prelim.geojson 의 MAN-4bd1788b64 링(경도, 위도) — 폐합점 제거 후 [위도, 경도]로 뒤집는다
GALTA_RING_LNGLAT = [
    [126.95025265338035, 37.497325250883286],
    [126.95011204545234, 37.49738900755185],
    [126.95017461981163, 37.49763012408355],
    [126.95052510064245, 37.49817572038057],
    [126.95041313353212, 37.498135940201564],
    [126.95060761724704, 37.49843784078412],
    [126.95063600551538, 37.498432537120024],
    [126.95063714705883, 37.49852632588235],
    [126.95085918705882, 37.498548243529406],
    [126.95101772999686, 37.49846306624333],
    [126.95102694463733, 37.49847388012954],
    [126.95115846149476, 37.49847046777457],
    [126.95170620588236, 37.49783928588236],
    [126.95148282984147, 37.49770368429196],
    [126.95127127764707, 37.49751711529412],
    [126.95104235294117, 37.49713524235294],
    [126.95086130083031, 37.497086099936546],
    [126.95025970213327, 37.49733560246517],
]

NEW_ZONE = {
    "sid": "갈타맵 추진준비 구역 공개(MAN-4bd1788b64) · 상도동 461·469 일대 주민제안 추진지",
    "name": "(가)상도동 461",
    "cls": "MAN",
    "guCode": "11590",
    "gu": "동작구",
    "date": "2026-11-25",
    "areaNotice": 13312,
    "area": 13312,
    "kind": "모아타운",
    "type": "모아타운",
    "stage": "추진준비",
    "spec": 1,
    "prog": 5,
    "alias": [
        "상도동 461",
        "상도동 461·469",
        "상도동 461·469 일대",
        "상도동 461 모아타운",
        "가칭 상도동 461",
        "(가칭)상도동 461",
        "상도461",
        "상도동 469",
    ],
    "featured": False,
    "geom": "가상경계",
    "asOf": "2026-11-25",
    "areaShape": 13297,
    "boundaryApprox": False,
    "areaNote": (
        "갈타맵 표기 13,312㎡(약 4,027평) — 주민제안 추진지의 검토 구역면적이며 아직 고시 면적이 아닙니다. "
        "지도 도형은 같은 구역의 경계(18점)를 그대로 옮겨 계측한 13,297㎡(갈타맵 표기와 0.1% 차이)입니다."
    ),
    "boundaryNote": (
        "갈타맵이 추진준비 구역으로 공개한 경계(비공식·현장 제보 기반, 2026-11-25)를 그대로 옮김 — "
        "정비구역 지정 전이라 법정 구역계가 없고, 주민제안 접수·구역계 확정 시 달라질 수 있습니다."
    ),
    "note": (
        "동작구 상도동 461·469 일대 모아타운 주민제안 추진지입니다(2026-09-17 주민설명회). "
        "토지등소유자 약 243명·기존 227세대, 노후도 65%, 용도지역은 2종 71.7%·3종 28.3%이고 "
        "445세대 규모를 구상하고 있습니다. 토지등소유자 동의율은 11/10 약 56%에서 11/25 60%에 도달했고, "
        "12월 중 동작구청에 주민제안을 접수할 준비를 하고 있습니다. 아직 구역계가 고시되지 않아 "
        "지도의 경계는 갈타맵 공개 경계를 옮긴 참고 경계입니다."
    ),
    "consentRate": 60,
    "consentDate": "2026-11-25",
    "consentNote": "11/10 약 56% → 11/25 60% 도달 · 12월 동작구청 주민제안 접수 준비",
    "owners": 243,
    "householdsNow": 227,
    "householdsPlan": 445,
    "deterioration": 65,
    "sources": [
        {
            "label": "갈타맵 — (가) 상도동 461 모아타운(추진준비) 구역·경계·시세",
            "url": "https://map.galta.kr/z/MAN-4bd1788b64/%EA%B0%80%EC%B9%AD%20%EC%83%81%EB%8F%84%EB%8F%99%20461",
        }
    ],
}

# ── 기존 구역의 문장 속 동의율 → consentRate/consentDate/consentNote ──────────────
#   (문장에서 확인한 값만. '동의율 70% 이상' 같은 요건·'반대동의율'은 넣지 않는다)
CONSENT = {
    # 2026-04-30 추진위 승인(승인 당시 동의율 64.88%)
    "11230UQ120PS202605210001": (64.88, "2026-04-30", "조합설립추진위원회 승인 당시 동의율"),
    # 2026-03-16 추진위 승인(승인 당시 55.7%)
    "11000UQ120PS202411014521": (55.7, "2026-03-16", "조합설립추진위원회 승인 당시 동의율"),
    # 2023-09-21 신통기 획 후보지 선정(353명 중 263명 동의)
    "11410UQ120PS202605210002": (74.5, "2023-09-21", "신속통합기획 후보지 선정 당시 동의율(353명 중 263명)"),
    # 2026-09 추진준비위 주민설명회에서 '70%를 넘기고' 협의 마무리 단계
    "noryangjin-14": (70, "2026-09", "2026-09 추진준비위 주민설명회 — 동의율 70% 넘김"),
    # 후보지 신청 당시 약 55%
    "sadang-19": (55, None, "신속통합기획 후보지 신청 당시 약 55%(추진위 승인 요건 충족)"),
    # 2026-07 조합설립 동의율 75.3% 넘김(보도)
    "wonhyo1ga-yeoksegwon": (75.3, "2026-07", "조합설립 동의율 75.3% 돌파(2026-07 보도)"),
    # 2025-12-16 후보지 조건부 선정(동의율 74%)
    "mp-shinsu-250": (74, "2025-12-16", "신속통합기획 후보지 조건부 선정 당시 동의율"),
    # 2026-04-24 추진위 승인(동의율 68.61%)
    "sy-cheongpa-46": (68.61, "2026-04-24", "조합설립추진위원회 승인 동의율"),
    # 2026-03 기준 약 35%
    "sy-yongsan4": (35, "2026-03", "2026-03 기준 약 35% — 추진준비위 교체 후 동의서 재징구 중"),
    # 2025-09-12 신통기획 자문사업 신청(주민 동의율 57.49%)
    "rest17gu-nw-상계주공2단지": (57.49, "2025-09-12", "신속통합기획 자문사업 신청 당시 주민 동의율"),
    # 2026-03 1차 자문(입안제안 동의율 53%)
    "rest17gu-nw-상계주공3단지": (53, "2026-03", "입안제안 동의율(2026-03 신통기획 1차 자문)"),
    # 2026-11-13 후보지 선정 — '주민 동의율 70% 이상을 확보'
    "rest17gu-ddm-용두동-39": (70, "2026-11-13", "주민 동의율 70% 이상 확보해 후보지 선정(2026-11-13)"),
}


def _ring() -> list[list[float]]:
    ring = [[lat, lng] for lng, lat in GALTA_RING_LNGLAT]
    if ring[0] == ring[-1]:
        ring = ring[:-1]
    return ring


def _zone() -> dict:
    z = dict(NEW_ZONE)
    z["id"] = NEW_ID
    z["featureId"] = NEW_ID
    z["polygon"] = _ring()
    z["center"] = [37.497812, 126.950855]
    z["ringPts"] = len(z["polygon"])
    return z


def check(before_commit: bool) -> int:
    bad = 0
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    ids = [z.get("id") for z in src]
    gids = [f["properties"].get("id") for f in geo["features"]]
    print(f"    seoul-zones {len(ids)}곳 · zones.geojson {len(gids)}곳 (기대 {EXPECTED_AFTER})")
    ok = len(ids) == len(gids) == EXPECTED_AFTER == len(set(ids))
    print(f"[{'OK' if ok else 'FAIL'}] 구역 수·중복 id")
    bad += 0 if ok else 1

    nz = next((z for z in src if z.get("id") == NEW_ID), None)
    print(f"[{'OK' if nz else 'FAIL'}] {NEW_ID} seoul-zones 포함")
    bad += 0 if nz else 1
    if nz:
        ok = (
            nz.get("name") == "(가)상도동 461"
            and nz.get("type") == "모아타운"
            and nz.get("stage") == "추진준비"
            and nz.get("consentRate") == 60
            and nz.get("consentDate") == "2026-11-25"
            and len(nz.get("polygon") or []) == 18
        )
        print(f"[{'OK' if ok else 'FAIL'}] 이름·유형·단계·동의율·정점 18")
        bad += 0 if ok else 1

    feat = next((f for f in geo["features"] if f["properties"].get("id") == NEW_ID), None)
    if feat:
        p = feat["properties"]
        ring = feat["geometry"]["coordinates"][0]
        print(
            f"[{'OK' if p.get('consentRate') == 60 else 'FAIL'}] zones.geojson properties — 동의율 {p.get('consentRate')}% · "
            f"정점 {len(ring)}(폐합 {ring[0] == ring[-1]}) · {p.get('geom')}"
        )
        bad += 0 if p.get("consentRate") == 60 and len(ring) == 19 else 1
    else:
        print("[FAIL] zones.geojson 에 새 구역 없음")
        bad += 1

    idx = json.loads(INDEX.read_text(encoding="utf-8"))
    entry = next((z for z in idx["zones"] if z.get("id") == NEW_ID), None)
    print(f"[{'OK' if entry else 'FAIL'}] zone-index 포함 ({len(idx['zones'])}곳)")
    bad += 0 if entry else 1

    # 동의율 옮긴 구역 수
    with_rate = [z for z in src if isinstance(z.get("consentRate"), (int, float))]
    ok = len(with_rate) >= len(CONSENT) + 1
    print(f"[{'OK' if ok else 'FAIL'}] 동의율 있는 구역 {len(with_rate)}곳 (기대 {len(CONSENT) + 1}곳 이상)")
    bad += 0 if ok else 1
    for k, (rate, date, note) in CONSENT.items():
        z = next((z for z in src if z.get("id") == k), None)
        if not z:
            print(f"[FAIL] {k} 구역 없음")
            bad += 1
            continue
        okz = z.get("consentRate") == rate and (z.get("consentDate") or None) == date
        print(f"[{'OK' if okz else 'FAIL'}] {z.get('name')} — {z.get('consentRate')}% · {z.get('consentDate')}")
        bad += 0 if okz else 1

    if not before_commit:
        # 기존 구역은 동의율 필드 말고는 바뀌면 안 된다 — HEAD 와 통째 비교
        head = json.loads(
            subprocess.run(
                ["git", "show", "HEAD:src/data/seoul-zones.json"], cwd=ROOT, capture_output=True, text=True, check=True
            ).stdout
        )
        old = {z["id"]: z for z in head}
        changed = []
        for z in src:
            if z["id"] == NEW_ID:
                continue
            h = old.get(z["id"])
            if h is None:
                changed.append(f"{z['id']}(신규)")
                continue
            a = {k: v for k, v in z.items() if k not in ("consentRate", "consentDate", "consentNote")}
            b = {k: v for k, v in h.items() if k not in ("consentRate", "consentDate", "consentNote")}
            if a != b:
                changed.append(z["id"])
        print(f"[{'OK' if not changed else 'FAIL'}] 기존 구역 변경(동의율 외) {len(changed)}곳"
              + ("" if not changed else " — " + ", ".join(changed[:10])))
        bad += 0 if not changed else 1
    print("결과:", "통과" if bad == 0 else f"실패 {bad}건")
    return bad


def main() -> int:
    apply = "--apply" in sys.argv
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    print(f"전: {len(src)}곳")

    if NEW_ID in {z.get("id") for z in src}:
        print("이미 반영된 새 구역이 있어 새 구역 추가는 건너뜁니다.")
    else:
        src.append(_zone())

    touched = 0
    for z in src:
        c = CONSENT.get(z.get("id"))
        if not c:
            continue
        rate, date, note = c
        z["consentRate"] = rate
        if date:
            z["consentDate"] = date
        else:
            z.pop("consentDate", None)
        z["consentNote"] = note
        touched += 1
    print(f"동의율 채운 구역: {touched}곳 · 후: {len(src)}곳")

    if apply:
        SOURCE.write_text(json.dumps(src, ensure_ascii=False), encoding="utf-8")
        meta = json.loads(META.read_text(encoding="utf-8"))
        meta["consent"] = {
            "asOf": "2026-11-26",
            "note": (
                "구역별 토지등소유자 동의율(consentRate·consentDate·consentNote). 구역 설명에 문장으로 있던 "
                "값을 옮기고, 공개된 값이 없는 구역은 비워 두어 화면에서 '미공개'로 보입니다."
            ),
        }
        META.write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print("seoul-zones.json · zones-meta.json 저장")

    return check(before_commit=not apply) if "--apply" in sys.argv else 0


if __name__ == "__main__":
    sys.exit(main())
