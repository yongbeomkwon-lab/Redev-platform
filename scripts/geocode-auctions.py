#!/usr/bin/env python3
"""
법원경매 물건 지번주소 → 좌표 (카카오 로컬 주소검색 API)

키: 리디브가 이미 쓰는 **카카오 JavaScript 키**(NEXT_PUBLIC_KAKAO_MAP_APP_KEY)를 그대로 쓴다.
    지도 SDK 키도 `KA: origin/<등록 도메인>` 헤더를 붙이면 로컬 API가 같은 앱 키로 응답한다
    (도메인 등록이 되어 있어야 함 — 2026-11-22 확인).
    REST 키를 따로 발급받지 않아도 되고, 응답 좌표는 지도 SDK와 같은 정밀도(지번 중심)다.

캐시: scripts/data/court-auction/geocode.json — 주소→좌표. 하루 갱신에서 새 주소만 부르면 되도록
      결과를 남긴다(같은 지번은 다시 부르지 않는다).

사용법
  python3 scripts/geocode-auctions.py            # latest.json 의 서울 물건 좌표 채우기
  python3 scripts/geocode-auctions.py --limit 50 # 앞 50건만(속도 확인)
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT_DIR = os.path.join(HERE, "data", "court-auction")
LATEST = os.path.join(OUT_DIR, "latest.json")
CACHE = os.path.join(OUT_DIR, "geocode.json")

ENDPOINT = "https://dapi.kakao.com/v2/local/search/address.json"
ORIGIN = "https://redev-platform-iota.vercel.app"
LOT_RE = re.compile(r"^(산\s?)?\d{1,4}(-\d{1,4})?$")


def env_key() -> str:
    path = os.path.join(ROOT, ".env.local")
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if line.startswith("NEXT_PUBLIC_KAKAO_MAP_APP_KEY="):
            return line.split("=", 1)[1].strip().strip('"')
    raise SystemExit("NEXT_PUBLIC_KAKAO_MAP_APP_KEY 없음")


def query_of(item: dict) -> str:
    """물건 → 지오코딩 질의. 지번이 깨끗하면 지번, 아니면 소재지(도로명) 문자열."""
    dong = (item.get("dong") or "").strip()
    lot = re.sub(r"\s*외\s*\d+\s*필지.*$", "", (item.get("lotno") or "").strip()).strip()
    if (dong.endswith("동") or dong.endswith("가")) and LOT_RE.match(lot):
        return f"서울특별시 {item['gu']} {dong} {lot}"
    addr = (item.get("address") or "").replace("사용본거지 :", "").strip()
    addr = re.sub(r"\s*제?\d+층.*$", "", addr).strip()
    if addr.startswith("서울"):
        return addr
    return f"서울특별시 {item.get('gu', '')} {dong}".strip()


def lookup(key: str, query: str) -> tuple[float, float] | None:
    url = ENDPOINT + "?" + urllib.parse.urlencode({"query": query, "size": "1"})
    p = subprocess.run([
        "curl", "-sS", "--max-time", "20", url,
        "-H", f"Authorization: KakaoAK {key}",
        "-H", f"KA: os/web; origin/{ORIGIN}",
        "-H", f"Origin: {ORIGIN}",
        "-H", f"Referer: {ORIGIN}/",
        "-A", "Mozilla/5.0",
    ], capture_output=True)
    try:
        data = json.loads(p.stdout.decode("utf-8", errors="replace"))
    except json.JSONDecodeError:
        return None
    docs = data.get("documents") or []
    if not docs:
        return None
    d = docs[0]
    try:
        return float(d["y"]), float(d["x"])
    except (KeyError, TypeError, ValueError):
        return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--sleep", type=float, default=0.22, help="요청 간 대기(초)")
    args = ap.parse_args()

    data = json.load(open(LATEST, encoding="utf-8"))
    items = data["items"]
    cache: dict[str, list[float] | None] = {}
    if os.path.exists(CACHE):
        cache = json.load(open(CACHE, encoding="utf-8"))

    todo = []
    for it in items:
        if it.get("sido") != "서울특별시":
            continue
        q = query_of(it)
        if q in cache:
            continue
        if q not in todo:
            todo.append(q)
    if args.limit:
        todo = todo[: args.limit]
    print(f"지오코딩 대상 {len(todo)}건 (캐시 {len(cache)}건)")

    key = env_key()
    ok = fail = 0
    for n, q in enumerate(todo, 1):
        res = None
        for attempt in range(2):
            res = lookup(key, q)
            if res:
                break
            time.sleep(1.0 + attempt)
        cache[q] = list(res) if res else None
        ok += 1 if res else 0
        fail += 0 if res else 1
        if n % 50 == 0:
            json.dump(cache, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False)
            print(f"  … {n}/{len(todo)} (성공 {ok} / 실패 {fail})")
        time.sleep(args.sleep)

    json.dump(cache, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False)

    # 물건에 좌표 채우기
    filled = 0
    for it in items:
        q = query_of(it)
        c = cache.get(q)
        if c:
            it["lat"], it["lng"] = c[0], c[1]
            it["geoQuery"] = q
            filled += 1
    data["meta"]["geocoded"] = filled
    json.dump(data, open(LATEST, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"좌표 채움 {filled} / {len(items)}")


if __name__ == "__main__":
    main()
