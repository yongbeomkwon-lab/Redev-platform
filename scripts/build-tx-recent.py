#!/usr/bin/env python3
"""지도 전체 실거래 가격표(public/data/tx-recent.json) 만들기

  · 1단계 — 서울 25개 구의 법정동 전체를 구 단위로 받아 온다.
      기본은 **운영 사이트의 /api/transactions** 를 쓴다. 그 라우트가 국토부 API 키로
      (구·월·유형) 캐시를 채워 두므로, 키 없이도 같은 결과를 얻고 호출도 아낀다.
       `--base https://...` 로 다른 배포본을 쓸 수 있다.
  · 2단계 — 같은 건물(법정동+지번)은 최신 거래 1건 + 거래 건수로 묶는다.
  · 3단계 — 카카오 주소검색으로 지번 좌표를 붙인다(캐시: tmp/tx-geocode-cache.json).
      키는 .env.local 의 NEXT_PUBLIC_KAKAO_MAP_APP_KEY(지도 SDK 공개 키)를 쓴다.
      지도 SDK 키도 `KA: origin/<등록 도메인>` 헤더를 붙이면 로컬 API가 응답한다.
  · 결과: public/data/tx-recent.json — [lat, lng, kind(0아파트·1연립·2단독), name, dong, jibun,
      price(만원), areaSqm, floor, dealDate, count] (최신 거래일 순)

사용법
  python3 scripts/build-tx-recent.py                # 받아 와서 좌표까지(수 분)
  python3 scripts/build-tx-recent.py --budget 240   # 한 번에 4분만 지오코딩하고 저장(셸 제한 대응)
  python3 scripts/build-tx-recent.py --raw tmp/molit_seoul_3m.json   # 이미 받아 둔 원본 재사용
"""
from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import subprocess
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "public/data/tx-recent.json")
CACHE = os.path.join(ROOT, "tmp/tx-geocode-cache.json")
DONGS = os.path.join(HERE, "data/bjdong-codes.json")
ORIGIN = "https://redev-platform-iota.vercel.app"
KIND_CODE = {"아파트": 0, "연립·다세대": 1, "단독·다가구": 2}
GU = {
    "11110": "종로구", "11140": "중구", "11170": "용산구", "11200": "성동구",
    "11215": "광진구", "11230": "동대문구", "11260": "중랑구", "11290": "성북구",
    "11305": "강북구", "11320": "도봉구", "11350": "노원구", "11380": "은평구",
    "11410": "서대문구", "11440": "마포구", "11470": "양천구", "11500": "강서구",
    "11530": "구로구", "11545": "금천구", "11560": "영등포구", "11590": "동작구",
    "11620": "관악구", "11650": "서초구", "11680": "강남구", "11710": "송파구", "11740": "강동구",
}


def load(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def env_key() -> str:
    for name in (".env.local", ".env"):
        path = os.path.join(ROOT, name)
        if not os.path.exists(path):
            continue
        for line in open(path, encoding="utf-8"):
            line = line.strip()
            if line.startswith("NEXT_PUBLIC_KAKAO_MAP_APP_KEY="):
                return line.split("=", 1)[1].strip().strip('"')
    raise SystemExit("NEXT_PUBLIC_KAKAO_MAP_APP_KEY 가 .env.local 에 없습니다")


def fetch_seoul(base: str) -> list[dict]:
    """구 단위(법정동 최대 8개씩)로 실거래 3개월치를 받아 온다."""
    by_gu: dict[str, list[str]] = {}
    for d in load(DONGS, {"dongs": []})["dongs"]:
        sg = d["sigungu"]
        if sg in GU and d["name"] not in by_gu.setdefault(sg, []):
            by_gu[sg].append(d["name"])

    def one(job):
        gu, dongs = job
        qs = urllib.parse.urlencode({"gu": gu, "dongs": ",".join(dongs), "months": 3})
        url = f"{base}/api/transactions?{qs}"
        for _ in range(3):
            try:
                with urllib.request.urlopen(url, timeout=180) as r:
                    d = json.loads(r.read().decode("utf-8"))
                return d.get("transactions", []) if d.get("ok") else []
            except Exception:
                continue
        return []

    jobs = [(GU[sg], names[i:i + 8]) for sg, names in by_gu.items() for i in range(0, len(names), 8)]
    rows: list[dict] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
        for tx in ex.map(one, jobs):
            rows.extend(tx)
    return rows


def buildings(rows: list[dict]) -> dict[tuple[str, str], dict]:
    best: dict[tuple[str, str], dict] = {}
    for t in rows:
        if t.get("canceled"):
            continue
        dong, jibun = (t.get("umdNm") or "").strip(), (t.get("jibun") or "").strip()
        if not dong or not jibun:
            continue
        rec = {
            "kind": KIND_CODE.get(t["kind"], 1),
            "name": (t.get("name") or "").strip(),
            "price": int(t["price"]),
            "area": round(float(t.get("areaSqm") or 0), 1),
            "floor": t.get("floor") or 0,
            "date": t.get("dealDate") or "",
            "count": 1,
        }
        key = (dong, jibun)
        prev = best.get(key)
        if prev is None:
            best[key] = rec
            continue
        prev["count"] += 1
        if rec["date"] >= prev["date"]:
            rec["count"] = prev["count"]
            best[key] = rec
    return best


def geocode(addr: str, key: str):
    url = "https://dapi.kakao.com/v2/local/search/address.json?" + urllib.parse.urlencode(
        {"query": addr, "size": "1"})
    cmd = ["curl", "-sS", "--max-time", "15", url,
           "-H", f"Authorization: KakaoAK {key}",
           "-H", f"KA: os/web; origin/{ORIGIN}",
           "-H", f"Origin: {ORIGIN}", "-H", f"Referer: {ORIGIN}/",
           "-A", "Mozilla/5.0"]
    p = subprocess.run(cmd, capture_output=True)
    try:
        docs = (json.loads(p.stdout.decode("utf-8", errors="replace")).get("documents") or [])
    except Exception:
        return None
    if not docs:
        return None
    return [float(docs[0]["x"]), float(docs[0]["y"])]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=ORIGIN, help="실거래 응답을 받을 사이트")
    ap.add_argument("--raw", help="이미 받아 둔 실거래 원본 JSON 경로")
    ap.add_argument("--budget", type=float, default=250.0, help="한 번에 지오코딩할 최대 초")
    args = ap.parse_args()

    rows = load(args.raw, None) if args.raw else fetch_seoul(args.base)
    if not rows:
        raise SystemExit("실거래 원본이 비었습니다")
    b = buildings(rows)
    print(f"거래 {len(rows):,}건 · 건물 {len(b):,}곳", file=sys.stderr)

    key = env_key()
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    cache = load(CACHE, {})
    todo = [(dong, jibun) for (dong, jibun) in b if f"서울특별시 {dong} {jibun}" not in cache]
    print(f"지오코딩 대기 {len(todo):,} (캐시 {len(cache):,})", file=sys.stderr)

    t0 = time.time()
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
        it = iter(todo)
        futs = {}
        while True:
            while len(futs) < 16:
                n = next(it, None)
                if n is None:
                    break
                addr = f"서울특별시 {n[0]} {n[1]}"
                futs[ex.submit(geocode, addr, key)] = addr
            if not futs:
                break
            done, _ = concurrent.futures.wait(list(futs), return_when=concurrent.futures.FIRST_COMPLETED)
            for f in done:
                cache[futs.pop(f)] = f.result()
            if time.time() - t0 > args.budget:
                print("예산 도달 — 좌표 캐시를 저장하고 여기까지로 파일을 씁니다", file=sys.stderr)
                break
    with open(CACHE, "w", encoding="utf-8") as f:
        json.dump(cache, f)

    out = []
    for (dong, jibun), r in b.items():
        pt = cache.get(f"서울특별시 {dong} {jibun}")
        if not pt:
            continue
        out.append([round(pt[1], 6), round(pt[0], 6), r["kind"], r["name"], dong, jibun,
                    r["price"], r["area"], r["floor"], r["date"], r["count"]])
    out.sort(key=lambda x: x[9], reverse=True)
    payload = {
        "meta": {
            "source": "국토교통부 실거래가 공개시스템(아파트·연립다세대·단독다가구 매매)",
            "asOf": time.strftime("%Y-%m-%d"),
            "months": 3,
            "buildings": len(out),
            "note": "최근 3개월 신고 거래를 건물(법정동+지번) 단위로 묶어 최신 거래 1건과 거래 건수를 담았습니다. "
                    "좌표는 카카오 주소검색(지번 중심) 기준이며, 주소를 찾지 못한 건물은 빠져 있습니다.",
            "fields": ["lat", "lng", "kind(0=아파트,1=연립다세대,2=단독다가구)", "name", "dong", "jibun",
                       "price(만원)", "areaSqm", "floor", "dealDate", "count"],
        },
        "buildings": out,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    print(f"저장 {OUT} · 건물 {len(out):,} · {os.path.getsize(OUT) / 1024:.0f}KB", file=sys.stderr)


if __name__ == "__main__":
    main()
