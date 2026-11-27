#!/usr/bin/env python3
"""경매 상세 수집 큐 — 다음에 볼 사건을 알려 주고, 끝난 사건을 표시한다.

  python3 scripts/auction-queue.py next 5
  python3 scripts/auction-queue.py done B000210 2024타경1997 [--note "상세버튼 비활성"]
  python3 scripts/auction-queue.py status
"""
import json
import os
import sys
import datetime as dt

HERE = os.path.dirname(os.path.abspath(__file__))
Q = os.path.join(HERE, "data", "court-auction", "queue.json")
P = os.path.join(HERE, "data", "court-auction", "progress.json")
COURT_NAME = {"B000210": "서울중앙지방법원", "B000211": "서울동부지방법원", "B000212": "서울남부지방법원",
              "B000213": "서울북부지방법원", "B000215": "서울서부지방법원"}


def load():
    q = json.load(open(Q, encoding="utf-8"))["cases"]
    prog = json.load(open(P, encoding="utf-8")) if os.path.exists(P) else {"done": {}}
    return q, prog


def save(prog):
    json.dump(prog, open(P, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


def key(c):
    return f"{c['court']}|{c['caseNo']}"


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    q, prog = load()
    done = prog.get("done", {})
    if cmd == "next":
        n = int(sys.argv[2]) if len(sys.argv) > 2 else 5
        pend = [c for c in q if key(c) not in done]
        print(f"남은 사건 {len(pend)} / 전체 {len(q)}")
        for c in pend[:n]:
            print(f"{c['court']} {c['caseYear']} {c['caseNo'].split('타경')[-1]} items={','.join(c['items'])} "
                  f"sale={c['futureSaleDate'] or c['saleDate']} {c['zones'][:1]} {key(c)}")
        return
    if cmd == "done":
        court, case_no = sys.argv[2], sys.argv[3]
        note = ""
        if "--note" in sys.argv:
            note = sys.argv[sys.argv.index("--note") + 1]
        k = f"{court}|{case_no}"
        done[k] = {"at": dt.datetime.now().astimezone().isoformat(timespec="seconds"), "note": note}
        prog["done"] = done
        save(prog)
        print(f"done {k} {note} · 남은 {len([c for c in q if key(c) not in done])}")
        return
    print(f"전체 {len(q)} · 완료 {len(done)} · 남음 {len([c for c in q if key(c) not in done])}")
    notes = {}
    for k, v in done.items():
        if v.get("note"):
            notes[v["note"]] = notes.get(v["note"], 0) + 1
    for n, c in notes.items():
        print(f"  {n}: {c}")


if __name__ == "__main__":
    main()
