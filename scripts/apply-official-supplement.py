#!/usr/bin/env python3
"""
현재 산출물에 공식 구역명·별칭과 미수록 후보지를 보강한다(멱등).

  python3 scripts/apply-official-supplement.py

  · 대상: public/data/zones.geojson, src/data/seoul-zones.json, src/data/zones-meta.json
  · 보강 내용: scripts/data/official-supplement.json (서울시 고시·정비사업 정보몽땅·자치구 자료)
  · SHP 전체를 다시 받지 않고 이름·신규 후보지만 얹을 때 쓴다.
    (전체 재생성은 scripts/import-seoul-zones.py — 끝에서 같은 함수를 부른다)
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from official_supplement import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main())
