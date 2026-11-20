#!/usr/bin/env python3
"""
신정역1구역(신정4동 922 일대) 반영 검증 — 2026-11-20

· 운영 https://redev-platform-iota.vercel.app 이 내려주는 zones.geojson 을 직접 받아
  단계·면적·별칭·선정일·출처·문구가 반영됐는지 확인한다(캐시 무력화 쿼리 사용).
· 드로어가 그리는 값(ZoneOfficialPanel)과 검색 규칙(별칭 평탄화 포함 검색)을 같은 방식으로
  재현해, '신정역1구역' 입력이 이 구역에 걸리는지까지 본다.
· 화면 확인(검색→선택→드로어 스크린샷)은 브라우저에서 따로 했고, 결과 파일은
  downloads/리디브-신정역1구역-검색·드로어·상세데이터-2026-11-20.png 이다.

실행: python3 scripts/verify-sinjeong1-20261120.py
"""
import json
import re
import sys
import time
import urllib.request

BASE = "https://redev-platform-iota.vercel.app"
ZONE_ID = "11000UQ120PS202505310025"
EXPECT_STAGE = "정비구역지정(공람)"
EXPECT_AREA = 95476
EXPECT_ALIASES = ["신정역1구역", "신정역1"]
EXPECT_SELECTED = "2025-04-28"

bad = 0


def ok(cond: bool, msg: str) -> None:
    global bad
    print(f"[{'OK' if cond else 'FAIL'}] {msg}")
    if not cond:
        bad += 1


def flat(s: str) -> str:
    return re.sub(r"\s+", "", s or "")


# 1) 운영 데이터
url = f"{BASE}/data/zones.geojson?verify={int(time.time())}"
with urllib.request.urlopen(url, timeout=90) as r:
    cb = r.headers.get("cache-control", "")
    fc = json.loads(r.read().decode("utf-8"))
print("cache-control:", cb)
feat = next((f for f in fc["features"] if f["properties"].get("id") == ZONE_ID), None)
ok(bool(feat), f"운영 데이터에 구역 {ZONE_ID} 존재")
p = (feat or {}).get("properties", {})

ok(p.get("stage") == EXPECT_STAGE, f"단계 = {p.get('stage')}")
ok(p.get("area") == EXPECT_AREA, f"구역면적 = {p.get('area')}")
ok((p.get("alias") or [])[:2] == EXPECT_ALIASES, f"별칭 = {(p.get('alias') or [])[:2]}")
ok(p.get("selectedAt") == EXPECT_SELECTED, f"후보지 선정일 = {p.get('selectedAt')}")
ok(p.get("gu") == "양천구", f"자치구 = {p.get('gu')}")
ok(p.get("geom") == "UQ120", f"경계 도형 출처 유지 = {p.get('geom')}")

note = p.get("note") or ""
for needle in ["양천구 공고 제2026-1788호", "95,476㎡", "2,177세대", "267.9%", "지상 25층",
               "권리산정기준일은 2025-03-14", "2026-11-19 서울시 도시계획과"]:
    ok(needle in note, f"본문 문구 '{needle}'")

area_note = p.get("areaNote") or ""
for needle in ["95,476㎡", "2,177세대", "85,218㎡"]:
    ok(needle in area_note, f"면적 기준 문구 '{needle}'")

srcs = p.get("sources") or []
urls = [s.get("url", "") for s in srcs]
ok(len(srcs) >= 5, f"확인 출처 {len(srcs)}건")
for host in ["yangcheon.go.kr", "opengov.seoul.go.kr", "eum.go.kr", "jaegebal.com", "arunews.com"]:
    ok(any(host in u for u in urls), f"출처 링크 포함: {host}")

ok("sinjeong1Notice20261120" in fc.get("metadata", {}), "배치 이력 metadata.sinjeong1Notice20261120")
ok(fc["metadata"].get("count") == 2420, f"구역 수 유지 = {fc['metadata'].get('count')}")

# 2) 검색 규칙 재현 — ZoneExplorer.search: 띄어쓰기 무시 includes, 별칭도 같은 규칙
for term in ["신정역1구역", "신정역1", "신정4동 922", "신정4동922"]:
    f = flat(term)
    hit = flat(p.get("name", "")).__contains__(f) or any(f in flat(a) for a in (p.get("alias") or []))
    ok(hit, f"검색어 '{term}' → 이 구역에 걸림")

print("RESULT:", "PASS" if bad == 0 else f"{bad} FAIL")
sys.exit(0 if bad == 0 else 1)
