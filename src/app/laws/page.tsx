import type { Metadata } from "next";
import Link from "next/link";
import LawSearch from "@/components/LawSearch";
import { LAWS, LAW_ARTICLES } from "@/data/laws";

export const metadata: Metadata = {
  title: "정비사업 법령·조례 조문 검색 — 리디브(redev)",
  description:
    "도정법·서울특별시 도시 및 주거환경정비 조례·빈집 및 소규모주택 정비 특례법·시행령·서울시 조례의 핵심 조문을 키워드로 찾습니다 — 5년 재당첨, 권리산정기준일, 과소필지, 노후도, 호수밀도, 현금청산, 지분쪼개기, 1+1, 동의율. 조문 원문과 국가법령정보센터 링크를 함께.",
};

// ─────────────────────────────────────────────────────────────────────────────
// /laws — 정비사업 법령·조례 조문 검색 (2026-11-28 신설)
//   · 상담 자리에서 조문 번호가 바로 필요할 때 쓰는 화면이다. 법령 전문을 다 싣지 않고
//     실무에서 자주 찾는 조문만 골라 요약 + 원문 + 원문 링크로 묶었다.
//   · 원문은 국가법령정보센터(law.go.kr)의 2026-11-28 기준 시행본을 그대로 옮겼고,
//     법령별 시행일을 카드와 아래 표에 함께 적어 개정 시점을 확인할 수 있게 했다.
//   · 경계 데이터(seoul-zones.json·zones.geojson)는 이 화면과 무관하다 — 건드리지 않는다.
// ─────────────────────────────────────────────────────────────────────────────

export default function LawsPage() {
  return (
    <div className="mx-auto w-full max-w-[980px] px-4 py-10 sm:px-6 sm:py-14">
      {/* ── 머리 ─────────────────────────────────────────────────────────── */}
      <p className="text-[11px] font-bold tracking-[0.14em] text-brand">REDEV · LAW &amp; ORDINANCE FINDER</p>
      <h1 className="mt-2 text-[26px] font-extrabold leading-[1.28] tracking-[-0.035em] text-ink sm:text-[32px]">
        정비사업
        <br className="sm:hidden" /> 법령·조례 조문 검색
      </h1>
      <p className="mt-3 max-w-[680px] text-[14px] leading-[1.75] text-slate-600">
        &lsquo;5년 재당첨이 언제 풀리나&rsquo;, &lsquo;권리산정기준일 이후 지분은 어떻게 되나&rsquo; —
        상담에서 바로 나오는 질문을 조문으로 확인합니다. 도정법과 서울시 조례, 소규모주택정비
        특례법(빈집법)과 그 시행령·서울시 조례의 핵심 조문 {LAW_ARTICLES.length}개를 한 곳에
        모았습니다. 조문 원문과 국가법령정보센터 링크를 함께 둡니다.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-2 text-[11px] font-semibold">
        <span className="rounded-full bg-brand-tint px-2.5 py-1 text-brand">2026. 11. 28. 기준 시행본</span>
        <span className="rounded-full bg-brand px-2.5 py-1 text-white">조문 {LAW_ARTICLES.length}개 수록</span>
        <span className="rounded-full border border-line bg-white px-2.5 py-1 text-slate-600">
          법령·조례 {LAWS.length}개
        </span>
        <span className="rounded-full border border-line bg-white px-2.5 py-1 text-slate-600">원문 대조 완료</span>
        {/* 판례 리포트로 바로 — 폰은 하단 탭이 「법령·판례」 하나라 이 링크가 다리 역할을 한다 */}
        <Link
          href="/cases"
          className="rounded-full border border-brand/35 bg-white px-2.5 py-1 text-brand transition-colors hover:bg-brand-tint"
        >
          판례 리포트 →
        </Link>
      </div>

      {/* ── 검색 + 결과 ──────────────────────────────────────────────────── */}
      <LawSearch />

      {/* ── 법령 정보 ────────────────────────────────────────────────────── */}
      <h2 className="mt-12 text-[13px] font-bold tracking-[-0.01em] text-ink">수록 법령·조례</h2>
      <div className="mt-3 overflow-hidden rounded-xl border border-line bg-white">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-line bg-slate-50 text-[10.5px] font-bold text-slate-500">
              <th className="px-3 py-2 sm:px-4">법령·조례</th>
              <th className="hidden px-3 py-2 sm:table-cell sm:px-4">공포번호</th>
              <th className="px-3 py-2 text-right sm:px-4">시행일</th>
              <th className="px-3 py-2 text-right sm:px-4">원문</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {LAWS.map((l) => (
              <tr key={l.key} className="align-top">
                <td className="px-3 py-2.5 sm:px-4">
                  <p className="text-[12px] font-bold leading-snug text-ink">{l.name}</p>
                  <p className="mt-0.5 text-[10.5px] font-medium text-slate-400">
                    {l.kind} · {l.ministry}
                    <span className="sm:hidden"> · {l.no}</span>
                  </p>
                </td>
                <td className="hidden px-3 py-2.5 text-[11.5px] text-slate-600 sm:table-cell sm:px-4">{l.no}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right text-[11.5px] font-semibold text-slate-700 sm:px-4">
                  {l.enforced}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right sm:px-4">
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11.5px] font-semibold text-brand underline decoration-brand/30 underline-offset-2 hover:decoration-brand"
                  >
                    국가법령정보센터 ↗
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── 읽는 방법 ────────────────────────────────────────────────────── */}
      <h2 className="mt-10 text-[13px] font-bold tracking-[-0.01em] text-ink">이렇게 정리했습니다</h2>
      <dl className="mt-3 divide-y divide-line rounded-xl border border-line bg-white">
        <div className="grid gap-1 px-4 py-3.5 sm:grid-cols-[88px_1fr] sm:gap-3">
          <dt className="text-[11px] font-bold text-slate-400">원문</dt>
          <dd className="text-[12.5px] leading-[1.75] text-slate-700">
            국가법령정보센터에서 받은 조문 본문을 고치지 않고 그대로 옮겼습니다. 항·호 번호와
            &lsquo;개정 2021. 3. 16.&rsquo; 같은 개정 표시도 원문 그대로입니다.
          </dd>
        </div>
        <div className="grid gap-1 px-4 py-3.5 sm:grid-cols-[88px_1fr] sm:gap-3">
          <dt className="text-[11px] font-bold text-slate-400">요약·실무 체크</dt>
          <dd className="text-[12.5px] leading-[1.75] text-slate-700">
            리디브가 쓴 부분입니다. 조문을 상담 말로 풀어 쓴 요약과, 계약 전에 확인할 점을
            적었습니다. 숫자는 원문과 대조했습니다.
          </dd>
        </div>
        <div className="grid gap-1 px-4 py-3.5 sm:grid-cols-[88px_1fr] sm:gap-3">
          <dt className="text-[11px] font-bold text-slate-400">범위</dt>
          <dd className="text-[12.5px] leading-[1.75] text-slate-700">
            법령 전문이 아니라 상담에서 자주 찾는 조문만 골랐습니다. 조문 사이에 걸친 사항(예:
            분양대상자 세부 기준)은 시행령·조례를 함께 봐야 하므로, 카드의 원문 링크에서 해당
            법령 전체를 확인하세요.
          </dd>
        </div>
      </dl>

      <p className="mt-6 text-[11px] leading-relaxed text-slate-400">
        리디브의 법령·조례 검색은 공개된 조문을 정리한 참고자료이며 법률 자문이 아닙니다. 조문은
        개정될 수 있고, 같은 조문이라도 사업 방식·시점·개별 정관에 따라 결론이 달라집니다. 실제
        계약·소송 전에는 국가법령정보센터의 현행 원문과 변호사 등 전문가의 확인을 받으세요.
      </p>
    </div>
  );
}
