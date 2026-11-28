#!/usr/bin/env python3
"""
온비드 공매 물건 지번 → 좌표 (카카오 로컬 주소검색 API)

  · 입력: scripts/data/onbid-gongmae/latest.json  (fetch-onbid-gongmae.py 결과)
  · 출력: 물건마다 lat/lng 채움 + scripts/data/onbid-gongmae/geocode.json 캐시
  · 카카오 JavaScript 키(NEXT_PUBLIC_KAKAO_MAP_APP_KEY)를 지도 SDK 와 같은 방식으로 쓴다
    (geocode-auctions.py 와 같은 방법 — REST 키 발급 없이 동작).

질의 주소 만드는 순서
  1) 지번PNU(ltnoPnu)가 있으면 PNU 를 풀어 `시도 시군구 읍면동 [산]본번-부번` 을 만든다(가장 정확).
  2) 없으면 물건명(onbidCltrNm)에서 `…동/가/리 번지` 토큰을 뽑아 쓴다.
     (집합건물은 PNU 가 비어 있고 물건명에만 지번이 있다 — 2026-11-28 응답 기준 약 절반)

사용법
  python3 scripts/geocode-onbid.py                 # 서울 전체
  python3 scripts/geocode-onbid.py --limit 20      # 앞 20개 질의만(속도 확인)
  python3 scripts/geocode-onbid.py --retry-failed  # 지난번 실패한 주소만 다시
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import time
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DIR = os.path.join(HERE, "data", "onbid-gongmae")
LATEST = os.path.join(DIR, "latest.json")
CACHE = os.path.join(DIR, "geocode.json")

ORIGIN = "https://redev-platform-iota.vercel.app"


def env_key() -> str:
    path = os.path.join(ROOT, ".env.local")
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if line.startswith("NEXT_PUBLIC_KAKAO_MAP_APP_KEY="):
            return line.split("=", 1)[1].strip().strip('"')
    raise SystemExit("NEXT_PUBLIC_KAKAO_MAP_APP_KEY 없음")


def jibun_from_pnu(pnu: str) -> str | None:
    """19자리 PNU → `산181-11` / `242-15`"""
    s = re.sub(r"\D", "", str(pnu or ""))
    if len(s) < 19:
        return None
    san = s[10]
    bon = int(s[11:15])
    bu = int(s[15:19])
    if bon == 0:
        return None
    return f"{'산' if san == '1' else ''}{bon}" + (f"-{bu}" if bu else "")


DONG_LOT = re.compile(r"(\S*(?:동|가|리))\s+((?:산\s?)?\d{1,4}(?:-\d{1,4})?)")
# 도로명주소 — `통일로65길 4`, `마장로1길 21`, `중앙로 100-3`
ROAD_LOT = re.compile(r"([가-힣]{1,8}(?:대로|로)\s?\d{1,4}(?:길)?(?:\s?\d{1,4})?(?:-\d{1,4})?)")


def query_of(it: dict) -> str | None:
    sido = (it.get("lctnSdnm") or "서울특별시").strip()
    sgg = (it.get("lctnSggnm") or "").strip()
    emd = (it.get("lctnEmdNm") or "").strip()

    jibun = jibun_from_pnu(it.get("ltnoPnu") or "")
    if jibun and sgg and emd:
        return " ".join(x for x in (sido, sgg, emd, jibun) if x)

    nm = (it.get("onbidCltrNm") or "").strip()
    m = DONG_LOT.search(nm)
    if m and sgg:
        dong = re.sub(r"^.*\s", "", m.group(1)) or m.group(1)
        lot = m.group(2).replace(" ", "")
        return f"{sido} {sgg} {dong} {lot}"
    m = ROAD_LOT.search(nm)
    if m and sgg:
        return f"{sido} {sgg} {m.group(1)}"
    # 지번도 도로명도 못 뽑으면 좌표를 만들지 않는다 — 동 중심점은 다른 구역에 떨어질 수 있다
    return None


def lookup(key: str, query: str) -> tuple[float, float] | None:
    for path, param in (("/v2/local/search/address.json", "query"),
                        ("/v2/local/search/keyword.json", "query")):
        url = "https://dapi.kakao.com" + path + "?" + urllib.parse.urlencode({param: query, "size": "1"})
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
            continue
        docs = data.get("documents") or []
        if not docs:
            continue
        d = docs[0]
        try:
            return float(d["y"]), float(d["x"])
        except (KeyError, TypeError, ValueError):
            continue
    return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--sleep", type=float, default=0.2)
    ap.add_argument("--retry-failed", action="store_true")
    args = ap.parse_args()

    data = json.load(open(LATEST, encoding="utf-8"))
    items = data["items"]
    cache: dict[str, list[float] | None] = {}
    if os.path.exists(CACHE):
        cache = json.load(open(CACHE, encoding="utf-8"))

    todo: list[str] = []
    for it in items:
        q = query_of(it)
        if not q:
            continue
        if q in cache and not (args.retry_failed and cache[q] is None):
            continue
        if q not in todo:
            todo.append(q)
    if args.limit:
        todo = todo[: args.limit]
    print(f"지오코딩 대상 질의 {len(todo)}건 (캐시 {len(cache)}건, 물건 {len(items)}건)")

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
        if n % 100 == 0:
            json.dump(cache, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False)
            print(f"  … {n}/{len(todo)} (성공 {ok} / 실패 {fail})", flush=True)
        time.sleep(args.sleep)

    json.dump(cache, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False)

    filled = 0
    for it in items:
        q = query_of(it)
        it["geoQuery"] = q
        c = cache.get(q) if q else None
        if c:
            it["lat"], it["lng"] = c[0], c[1]
            filled += 1
    data["meta"]["geocoded"] = filled
    json.dump(data, open(LATEST, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"좌표 채움 {filled} / {len(items)}")


if __name__ == "__main__":
    main()
