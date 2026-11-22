#!/usr/bin/env python3
# ─────────────────────────────────────────────────────────────────────────────
# 커뮤니티 API 자체 점검 (2026-11-22)
#   로컬 `next start` 서버(기본 http://localhost:3100)를 띄운 상태에서 실행한다.
#   · 비로그인 읽기 허용 / 비로그인 쓰기 401
#   · 글 작성 → 목록(최신·인기·자유·구역) → 상세 → 좋아요 토글 → 댓글 → 수정 → 삭제
#   QA 계정(리디브 운영)은 Supabase Admin API 로 만든 확인된 계정이다.
# ─────────────────────────────────────────────────────────────────────────────
import json
import os
import sys
import urllib.error
from urllib.parse import quote
import urllib.request

BASE = os.environ.get("BASE", "http://localhost:3100")
SUPA = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
ANON = os.environ["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
EMAIL = os.environ.get("QA_EMAIL", "qa.redev@redev-platform.test")
PASSWORD = os.environ.get("QA_PASSWORD", "RedevQa2026!")

passed, failed = 0, 0


def check(name, cond, extra=""):
    global passed, failed
    if cond:
        passed += 1
        print(f"  ✓ {name}")
    else:
        failed += 1
        print(f"  ✗ {name} {extra}")


def call(method, url, body=None, token=None, base=BASE, extra_headers=None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"}
    if extra_headers:
        headers.update(extra_headers)
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw[:300]}


def login():
    status, body = call(
        "POST",
        f"{SUPA}/auth/v1/token?grant_type=password",
        {"email": EMAIL, "password": PASSWORD},
        base=SUPA,
        extra_headers={"apikey": ANON},
    )
    if status != 200:
        print("로그인 실패:", status, body)
        sys.exit(1)
    return body["access_token"]


print("커뮤니티 API 점검 —", BASE)
token = login()

# 1) 읽기(비로그인)
status, body = call("GET", f"{BASE}/api/community/posts?limit=5")
check("비로그인 목록 조회 200", status == 200, f"({status})")
check("목록 응답 형식", isinstance(body.get("items"), list) and "total" in body)

# 2) 비로그인 쓰기 차단
status, body = call(
    "POST", f"{BASE}/api/community/posts", {"category": "free", "title": "무단 글", "content": "안 됩니다"}
)
check("비로그인 글쓰기 401", status == 401, f"({status} {body})")
status, _ = call("POST", f"{BASE}/api/community/likes", {"postId": "00000000-0000-0000-0000-000000000000"})
check("비로그인 좋아요 401", status == 401, f"({status})")

# 3) 글 작성
status, body = call(
    "POST",
    f"{BASE}/api/community/posts",
    {
        "category": "question",
        "title": "신림1구역 30평형 입주권, 지금 들어가도 될까요?",
        "content": "감정가 대비 프리미엄이 2억 정도 붙은 물건입니다. 비례율과 추가분담금을 어디까지 봐야 할까요?",
        "zoneId": "sillim-1",
        "zoneName": "신림1구역",
    },
    token=token,
)
check("로그인 글쓰기 201/200", status in (200, 201), f"({status} {body})")
post = body.get("item") or {}
post_id = post.get("id")
check("작성 글에 구역 id·닉네임", post.get("zoneId") == "sillim-1" and post.get("authorNickname") == "리디브 운영", str(post)[:200])

# 4) 목록 필터
status, body = call("GET", f"{BASE}/api/community/posts?tab=zone", token=token)
check("구역별 이야기 탭에 노출", any(p["id"] == post_id for p in body.get("items", [])), f"total={body.get('total')}")
status, body = call("GET", f"{BASE}/api/community/posts?zoneId=sillim-1", token=token)
check("zoneId 필터", body.get("total", 0) >= 1)
check("로그인 사용자 liked/mine 표시", body["items"][0].get("mine") is True and body["items"][0].get("liked") is False, str(body["items"][0])[:200])
status, body = call("GET", f"{BASE}/api/community/posts?tab=free")
check("자유게시판 탭은 구역 글 제외", all(p.get("zoneId") is None for p in body.get("items", [])), f"total={body.get('total')}")
status, body = call("GET", f"{BASE}/api/community/posts?q={quote('신림1')}")
check("검색(구역 이름)", body.get("total", 0) >= 1, f"total={body.get('total')}")

# 5) 상세
status, body = call("GET", f"{BASE}/api/community/posts/{post_id}", token=token)
check("상세 조회", status == 200 and body.get("item", {}).get("id") == post_id)
check("상세에 댓글 배열", isinstance(body.get("comments"), list))

# 6) 좋아요 토글
status, body = call("POST", f"{BASE}/api/community/likes", {"postId": post_id}, token=token)
check("좋아요 추가", status == 200 and body.get("liked") is True and body.get("likesCount") == 1, str(body))
status, body = call("POST", f"{BASE}/api/community/likes", {"postId": post_id}, token=token)
check("좋아요 취소(1인 1회 토글)", status == 200 and body.get("liked") is False and body.get("likesCount") == 0, str(body))

# 7) 댓글
status, body = call("POST", f"{BASE}/api/community/comments", {"postId": post_id, "content": "비례율보다 추가분담금 상한을 먼저 확인하세요."}, token=token)
check("댓글 작성", status in (200, 201) and body.get("item", {}).get("content"), str(body)[:200])
comment_id = body.get("item", {}).get("id")
status, body = call("GET", f"{BASE}/api/community/posts/{post_id}", token=token)
check("댓글 수 반영", body.get("item", {}).get("commentsCount") == 1, f"count={body.get('item', {}).get('commentsCount')}")
status, body = call("DELETE", f"{BASE}/api/community/comments/{comment_id}", token=token)
check("댓글 삭제(본인)", status == 200, f"({status} {body})")

# 8) 수정
status, body = call("PATCH", f"{BASE}/api/community/posts/{post_id}", {"title": "신림1구역 30평형 — 추가분담금 질문"}, token=token)
check("본인 글 수정", status == 200 and "추가분담금" in body.get("item", {}).get("title", ""), f"({status} {body})")

# 9) 삭제
status, body = call("DELETE", f"{BASE}/api/community/posts/{post_id}", token=token)
check("본인 글 삭제", status == 200, f"({status} {body})")
status, body = call("GET", f"{BASE}/api/community/posts/{post_id}")
check("삭제 뒤 404", status == 404, f"({status})")

print(f"\n결과: {passed} 통과 / {failed} 실패")
sys.exit(0 if failed == 0 else 1)
