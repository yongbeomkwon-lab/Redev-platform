#!/usr/bin/env python3
"""중곡·군자·송정 일대 필지 캐시 받기 (2026-11-28)

배포된 리디브 /api/parcels-box(서울 리전 → 브이월드)를 경유해 격자로 나눠 받는다.
결과: scripts/data/parcels-junggok-20261128.json  {pnu: {jibun,num,tail,addr,jimok,ring}}
"""
from __future__ import annotations

import json
import math
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "https://redev-platform-iota.vercel.app/api/parcels-box"
ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "scripts" / "data" / "parcels-junggok-20261128.json"

MINLAT, MAXLAT = 37.5538, 37.5684
MINLNG, MAXLNG = 127.0722, 127.0975


def get(params: dict) -> dict:
    url = BASE + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"accept": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        body = r.read().decode("utf-8", "replace")
    d = json.loads(body)
    if not d.get("ok"):
        raise RuntimeError(f"proxy error: {d}")
    return d


def fetch_box(minlat, minlng, maxlat, maxlng) -> list[dict]:
    out = []
    page = 1
    while True:
        d = get(
            {
                "minlat": f"{minlat:.6f}",
                "minlng": f"{minlng:.6f}",
                "maxlat": f"{maxlat:.6f}",
                "maxlng": f"{maxlng:.6f}",
                "page": str(page),
                "size": "1000",
            }
        )
        for p in d.get("parcels") or []:
            rings = p.get("rings") or []
            if not rings:
                continue
            ring = [[pt[0], pt[1]] for pt in rings[0]]
            raw = str(p.get("jibun") or "").strip()
            m = re.match(r"^(\d+(?:-\d+)?)\s*(.*)$", raw)
            num = m.group(1) if m else raw
            tail = (m.group(2).strip() if m else "") or str(p.get("jimok") or "").strip()
            out.append(
                {
                    "jibun": raw,
                    "num": num,
                    "tail": tail,
                    "addr": str(p.get("addr") or "").strip(),
                    "jimok": str(p.get("jimok") or "").strip(),
                    "pnu": str(p.get("pnu") or "").strip(),
                    "ring": ring,
                }
            )
        total = int(d.get("total") or 0)
        if not d.get("count") or page * 1000 >= total or page >= 20:
            break
        page += 1
        time.sleep(0.15)
    return out


def main():
    step_lat = 0.0022  # ~245m
    step_lng = 0.0029  # ~255m
    allp: dict[str, dict] = {}
    la = MINLAT
    tiles = 0
    while la < MAXLAT:
        lb = min(MAXLAT, la + step_lat)
        ln = MINLNG
        while ln < MAXLNG:
            le = min(MAXLNG, ln + step_lng)
            try:
                got = fetch_box(la, ln, lb, le)
            except Exception as e:  # noqa: BLE001
                print(f"FAIL {la:.4f},{ln:.4f} {e}", flush=True)
                time.sleep(1.0)
                got = fetch_box(la, ln, lb, le)
            tiles += 1
            for p in got:
                allp[p["pnu"] or f'{p["addr"]}|{p["jibun"]}'] = p
            print(f"tile {tiles} {la:.4f},{ln:.4f} +{len(got)} total={len(allp)}", flush=True)
            ln = le
            time.sleep(0.12)
        la = lb
    CACHE.write_text(json.dumps(allp, ensure_ascii=False), encoding="utf-8")
    print("저장:", CACHE, len(allp))


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "report":
        d = json.loads(CACHE.read_text(encoding="utf-8"))
        print(len(d))
    else:
        main()
