import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "판례 리포트 — 리디브(redev)",
  description:
    "정비사업 판례를 매주 월요일 한 편씩 정리합니다 — 물딱지(무허가 건축물) 인정, 관리처분계획 취소, 조합원 자격·입주권 승계, 토지거래허가구역 위반까지.",
};

// ─────────────────────────────────────────────────────────────────────────────
// /cases — 판례 리포트 (2026-11-21 신설)
//   · 매주 월요일 한 편씩 올리는 자리. 지금은 첫 편을 준비 중이라 '무엇을 다룰지'만
//     정직하게 적어 둔다 — 아직 없는 판례·사건번호를 지어내지 않는다.
//   · 상단 메뉴 '판례 리포트'에서 바로 들어온다.
// ─────────────────────────────────────────────────────────────────────────────

const TOPICS: { no: string; title: string; desc: string }[] = [
  {
    no: "01",
    title: "물딱지(무허가 건축물) 인정",
    desc: "1970년대 이후 무허가로 지어진 건축물이 조합원 자격·종전자산 평가에서 어떻게 인정되는지, 인정 요건과 증거(항공사진·과세대장·사실조사)가 문제된 사례.",
  },
  {
    no: "02",
    title: "관리처분계획 취소·무효",
    desc: "분양대상자 선정, 감정평가 기준일, 비례율 산정이 위법하다는 주장이 어디서 갈렸는지 — 처분의 하자와 손해배우지 못한 범위.",
  },
  {
    no: "03",
    title: "조합원 자격과 입주권 승계",
    desc: "관리처분 인가 이후 취득자는 왜 조합원이 될 수 없는지(도시정비법 제39조), 매매·상속·이혼으로 권리가 옮겨갈 때의 판단 기준.",
  },
  {
    no: "04",
    title: "토지거래허가구역 위반",
    desc: "허가 없이 체결한 매매계약의 효력, 실거주 요건, 허가 전 계약금·중도금 반환 책임을 다룬 판결.",
  },
  {
    no: "05",
    title: "시공사 선정·계약 해지",
    desc: "총회 결의 하자, 입찰 조건 변경, 공사비 증액을 둘러싼 시공사와 조합의 분쟁 — 계약이 유지되는 경우와 해지되는 경우.",
  },
  {
    no: "06",
    title: "정비구역 지정·해제 소송",
    desc: "구역계·기반시설·용도지역 판단의 재량 범위, 주민 동의율 산정과 절차적 하자.",
  },
];

const HOW = [
  {
    k: "근거",
    t: "판결문 원문 기준",
    d: "사건번호·법원·선고일을 적고, 보도 요약이 아니라 판결 이유에 적힌 문장을 근거로 삼습니다.",
  },
  {
    k: "순서",
    t: "요지 → 조문 → 실무",
    d: "무엇이 문제였고(사실관계) → 어떤 조문으로 판단했고(법리) → 매물·상담에서 무엇을 확인해야 하는지(실무) 순서로 정리합니다.",
  },
  {
    k: "한계",
    t: "사례 하나는 정답이 아님",
    d: "같은 쟁점도 구역·시점·증거에 따라 결론이 달라집니다. 리포트는 참고자료이고, 개별 사안의 법률 자문이 아닙니다.",
  },
];

export default function CasesPage() {
  return (
    <div className="mx-auto w-full max-w-[980px] px-4 py-10 sm:px-6 sm:py-14">
      {/* ── 머리 ─────────────────────────────────────────────────────────── */}
      <p className="text-[11px] font-bold tracking-[0.14em] text-brand">REDEV · CASE REPORT</p>
      <h1 className="mt-2 text-[26px] font-extrabold leading-[1.28] tracking-[-0.035em] text-ink sm:text-[32px]">
        정비사업 판례를
        <br className="sm:hidden" /> 매주 월요일 한 편씩
      </h1>
      <p className="mt-3 max-w-[640px] text-[14px] leading-[1.75] text-slate-600">
        재개발·재건축 계약서를 검토하다 보면 결국 판례가 답을 주는 순간이 있습니다. 물딱지 인정,
        관리처분계획의 하자, 조합원 자격과 입주권 승계처럼 실제 상담에서 자주 부딪히는 쟁점을
        판결문 기준으로 정리해 올립니다.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-2 text-[11px] font-semibold">
        <span className="rounded-full border border-line bg-white px-2.5 py-1 text-slate-600">
          매주 월요일 업데이트
        </span>
        <span className="rounded-full border border-line bg-white px-2.5 py-1 text-slate-600">
          판결문 원문 기준
        </span>
        <span className="rounded-full bg-brand-tint px-2.5 py-1 text-brand">첫 편 준비 중</span>
      </div>

      {/* ── 예고 카드 ────────────────────────────────────────────────────── */}
      <section className="mt-8 overflow-hidden rounded-xl border border-line bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
          <h2 className="text-[13px] font-bold text-ink">다음 리포트</h2>
          <span className="text-[11px] font-medium text-slate-500">2026년 11월 넷째 주 월요일</span>
        </div>
        <div className="flex flex-col gap-3 px-4 py-5 sm:flex-row sm:items-center sm:px-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-[15px] font-extrabold text-brand">
            01
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold tracking-[-0.02em] text-ink">
              물딱지, 어디까지 조합원으로 인정되나
            </p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-600">
              무허가 건축물의 인정 요건과 증거 — 항공사진·과세대장·사실조사를 어떻게 다뤘는지.
            </p>
          </div>
          <span className="shrink-0 rounded-md border border-line px-2 py-1 text-[11px] font-semibold text-slate-500">
            준비 중
          </span>
        </div>
      </section>

      {/* ── 다루는 판례 ──────────────────────────────────────────────────── */}
      <h2 className="mt-10 text-[13px] font-bold tracking-[-0.01em] text-ink">다루는 판례</h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {TOPICS.map((t) => (
          <li key={t.no} className="rounded-xl border border-line bg-white p-4">
            <div className="flex items-baseline gap-2">
              <span className="text-[11px] font-extrabold text-brand">{t.no}</span>
              <h3 className="text-[13.5px] font-bold tracking-[-0.02em] text-ink">{t.title}</h3>
            </div>
            <p className="mt-1.5 text-[12px] leading-[1.7] text-slate-600">{t.desc}</p>
          </li>
        ))}
      </ul>

      {/* ── 읽는 방법 ────────────────────────────────────────────────────── */}
      <h2 className="mt-10 text-[13px] font-bold tracking-[-0.01em] text-ink">이렇게 정리합니다</h2>
      <dl className="mt-3 divide-y divide-line rounded-xl border border-line bg-white">
        {HOW.map((h) => (
          <div key={h.k} className="grid gap-1 px-4 py-3.5 sm:grid-cols-[88px_1fr] sm:gap-3">
            <dt className="text-[11px] font-bold text-slate-400">{h.k}</dt>
            <dd>
              <p className="text-[13px] font-bold text-ink">{h.t}</p>
              <p className="mt-0.5 text-[12px] leading-[1.7] text-slate-600">{h.d}</p>
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-8 flex flex-col gap-3 rounded-xl border border-line bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[12px] leading-relaxed text-slate-600">
          리포트에서 다뤘으면 하는 판례·쟁점이 있으면 알려 주세요. 상담에서 자주 나온 순서대로
          올리겠습니다.
        </p>
        <Link
          href="/"
          className="shrink-0 rounded-md bg-brand px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-brand-deep"
        >
          지도에서 구역 보기
        </Link>
      </div>

      <p className="mt-6 text-[11px] leading-relaxed text-slate-400">
        리디브의 판례 리포트는 공개된 판결문을 정리한 참고자료입니다. 개별 사안의 결론은 사실관계와
        증거에 따라 달라지므로, 계약·소송 전에는 변호사 등 전문가의 확인을 받으세요.
      </p>
    </div>
  );
}
