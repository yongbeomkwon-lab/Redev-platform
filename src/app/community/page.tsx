import type { Metadata } from "next";
import CommunityBoard from "@/components/community/CommunityBoard";

// ─────────────────────────────────────────────────────────────────────────────
// /community — 리디브 커뮤니티 (2026-11-22 신설)
//   · 구역별 이야기 + 자유게시판. 읽기는 누구나, 쓰기·댓글·좋아요는 회원만.
//   · 게시글은 Supabase(community_posts/comments/likes)에 쌓이고, 지도 구역 패널의
//     「이 구역 이야기」와 같은 zoneId 로 이어진다.
// ─────────────────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: "커뮤니티 — 리디브(redev)",
  description:
    "서울 재개발 구역별 이야기와 입주권·조합원 물건 질문을 나누는 곳. 구역 소식, 매수 질문, 공고·판례 정보를 닉네임으로 나눕니다.",
};

export default function CommunityPage() {
  return <CommunityBoard />;
}
