#!/usr/bin/env python3
"""필지 캐시 받기 — 배포된 리디브 API(/api/parcels-box) 경유 (2026-11-28)

## 왜
  브이월드(api.vworld.kr)는 **해외 IP를 막는다**. 이 리눅스 셸은 해외라 연결이 거부되고,
  한국 IP 브라우저로는 받을 수 있지만 대량 전송이 어렵다.
  리디브 Vercel 함수는 서울(icn1) 리전에서 돌아 브이월드에 정상 응답하므로,
  2026-11-28 추가한 `/api/parcels-box`(필지 상자 조회 프록시)로 필지를 받아 캐시한다.

## 쓰는 법
  python3 scripts/fetch-parcels-proxy-20261128.py fetch   # 구역별 필지 캐시
  python3 scripts/fetch-parcels-proxy-20261128.py report  # 구역별 필지 수 표
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

sys.path.insert(0, str(Path(__file__).resolve().parent))
from importlib import import_module

BASE = "https://redev-platform-iota.vercel.app/api/parcels-box"
ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "scripts" / "data" / "parcels-20261128.json"

cfg = import_module("fetch-parcels-seongdong-20261127")
ZONES = cfg.ZONES


def dlat(m: float) -> float:
    return m / 111132.0


def dlng(m: float, lat: float) -> float:
    return m / (111132.0 * math.cos(math.radians(lat)))


def get(params: dict) -> dict:
    url = BASE + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"accept": "application/json"})
    with urllib.request.urlopen(req, timeout=90) as r:
        body = r.read().decode("utf-8", "replace")
    d = json.loads(body)
    if not d.get("ok"):
        raise RuntimeError(f"proxy error: {d}")
    return d


def fetch_box(minlat, minlng, maxlat, maxlng, page=1, size=1000) -> dict:
    return get(
        {
            "minlat": f"{minlat:.6f}",
            "minlng": f"{minlng:.6f}",
            "maxlat": f"{maxlat:.6f}",
            "maxlng": f"{maxlng:.6f}",
            "page": str(page),
            "size": str(size),
        }
    )


def collect(d: dict, box) -> list[dict]:
    minlat, minlng, maxlat, maxlng = box
    out = []
    for p in d.get("parcels") or []:
        rings = p.get("rings") or []
        if not rings:
            continue
        ring = rings[0]
        lat = sum(pt[0] for pt in ring) / len(ring)
        lng = sum(pt[1] for pt in ring) / len(ring)
        if not (minlat <= lat <= maxlat and minlng <= lng <= maxlng):
            continue
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
                "pnu": str(p.get("pnu") or "").strip(),
                "ring": [[pt[0], pt[1]] for pt in ring],  # [lat, lng]
            }
        )
    return out


def cmd_fetch():
    allp = {}
    for zid, z in ZONES.items():
        lat, lng = z["center"]
        r = z["radius"]
        box = (lat - dlat(r), lng - dlng(r, lat), lat + dlat(r), lng + dlng(r, lat))
        got, page = [], 1
        while True:
            d = fetch_box(*box, page=page)
            got.extend(collect(d, box))
            total = int(d.get("total") or 0)
            if not d.get("count") or page * int(d.get("size") or 1000) >= total:
                break
            page += 1
            time.sleep(0.2)
        uniq = {}
        for p in got:
            uniq[p["pnu"] or f'{p["addr"]}|{p["jibun"]}'] = p
        allp[zid] = list(uniq.values())
        print(f"{zid}: 필지 {len(allp[zid])}개 (반경 {r}m, 페이지 {page}, total {total})", flush=True)
        time.sleep(0.3)
    CACHE.write_text(json.dumps(allp, ensure_ascii=False), encoding="utf-8")
    print("저장:", CACHE)


def cmd_report():
    cache = json.loads(CACHE.read_text(encoding="utf-8"))
    for zid, parcels in cache.items():
        nums = sorted(p["num"] for p in parcels)
        print(f"{zid:28s} {len(parcels):5d}필지  {nums[:6]}{' …' if len(nums) > 6 else ''}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "fetch"
    if cmd == "fetch":
        cmd_fetch()
    elif cmd == "report":
        cmd_report()
