"use client";

// ─────────────────────────────────────────────────────────────────────────────
// LawSearch — 정비사업 법령·조례 조문 검색 (2026-11-28 신설)
//   · 도정법 · 서울시 도정법 조례 · 빈집법 · 빈집법 시행령 · 서울시 빈집 조례의
//     핵심 조문을 한 화면에서 키워드로 찾는다(예: 5년 재당첨, 권리산정기준일,
//     과소필지, 노후도, 호수밀도, 현금청산, 지분쪼개기, 1+1, 동의율).
//   · 검색은 ①조문 번호 ②제목 ③요약·실무 체크 ④검색 키워드 ⑤원문 문단을 모두 본다.
//     띄어쓰기·가운뎃점을 지우고 비교하므로 "5년재당첨"과 "5년 재당첨"이 같이 걸린다.
//   · 결과 카드는 요약 → 실무 체크 → 원문(접었다 펴는 details) 순서다. 원문은
//     국가법령정보센터에서 받은 그대로이고, 요약·체크는 리디브가 쓴 것이다.
//   · 검색어가 없을 때는 법령별로 묶어 수록 조문 전체를 보여 준다.
// ─────────────────────────────────────────────────────────────────────────────
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import { LAWS, LAW_ARTICLES, type LawArticle, type LawKey } from "@/data/laws";

const LAW_ORDER: LawKey[] = LAWS.map((l) => l.key);
const LAW_BY_KEY = new Map(LAWS.map((l) => [l.key, l]));

// 자주 찾는 말 — 누르면 그대로 검색된다(원문에 없는 실무 용어도 키워드로 걸리게 해 둠)
const QUICK = [
  "5년 재당첨",
  "지분쪼개기",
  "1+1",
  "권리산정기준일",
  "과소필지",
  "노후도",
  "호수밀도",
  "현금청산",
  "동의율",
  "매도청구",
  "청산금",
  "관리처분계획",
];

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[\s\u00a0\u3000·ㆍ,.'"“”‘’()\[\]{}<>《》〈〉‧・:;!?~\-–—/\\|]/g, "");

type Row = { a: LawArticle; hay: string; titleHay: string; keyHay: string; sumHay: string };

const ROWS: Row[] = LAW_ARTICLES.map((a) => {
  const law = LAW_BY_KEY.get(a.law)!;
  const body = a.paras.join(" ");
  return {
    a,
    hay: norm([law.name, law.short, a.article, a.title, a.topic, a.summary, a.practice, a.keywords.join(" "), body].join(" ")),
    titleHay: norm([a.article, a.title, a.topic].join(" ")),
    keyHay: norm(a.keywords.join(" ")),
    sumHay: norm([a.summary, a.practice].join(" ")),
  };
});

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 검색어를 <mark>로 감싼다 — 원문·제목 어디에나 쓸 수 있게 토큰 배열을 받는다
function highlight(text: string, tokens: string[]) {
  const toks = tokens.filter((t) => t.length >= 1).sort((a, b) => b.length - a.length);
  if (!toks.length) return text;
  const re = new RegExp(`(${toks.map(escapeRe).join("|")})`, "gi");
  const parts = text.split(re);
  if (parts.length === 1) return text;
  return parts.map((p, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded-[2px] bg-[#FFE9A8] px-[1px] text-ink">
        {p}
      </mark>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}

function score(a: Row, q: string, tokens: string[]) {
  const phrase = norm(q);
  let s = 0;
  // 통짜 구절 일치 — 제목 > 키워드 > 요약 > 원문 순으로 무겁게
  if (phrase.length >= 2) {
    if (a.titleHay.includes(phrase)) s += 120;
    if (a.keyHay.includes(phrase)) s += 90;
    if (a.sumHay.includes(phrase)) s += 55;
    if (a.hay.includes(phrase)) s += 25;
  }
  // 토큰은 전부 있어야 결과에 넣는다(AND). 각 토큰이 어디에 걸리는지로 순서를 정한다.
  for (const t of tokens) {
    if (a.titleHay.includes(t)) s += 14;
    if (a.keyHay.includes(t)) s += 11;
    if (a.sumHay.includes(t)) s += 6;
    s += Math.min(6, a.hay.split(t).length - 1);
  }
  if (norm(a.a.article) === phrase) s += 200;
  return s;
}

export default function LawSearch() {
  const [q, setQ] = useState("");
  const [law, setLaw] = useState<LawKey | "all">("all");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);

  // 주소에 #dojung-72 처럼 조문을 달고 들어오면 그 카드를 펴고 그리로 이동한다
  useEffect(() => {
    const jump = () => {
      const id = decodeURIComponent(window.location.hash.replace(/^#/, ""));
      if (!id) return;
      if (!LAW_ARTICLES.some((a) => a.id === id)) return;
      setOpen((o) => ({ ...o, [id]: true }));
      window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "smooth" }), 60);
    };
    jump();
    window.addEventListener("hashchange", jump);
    return () => window.removeEventListener("hashchange", jump);
  }, []);

  const tokens = useMemo(() => {
    const raw = q.trim().split(/\s+/).filter(Boolean);
    const merged = raw.length > 1 ? [q.trim(), ...raw] : raw;
    return Array.from(new Set(merged.map(norm).filter((t) => t.length >= 1)));
  }, [q]);

  const searched = q.trim().length > 0;

  const results = useMemo(() => {
    const pool = law === "all" ? ROWS : ROWS.filter((r) => r.a.law === law);
    if (!searched) return pool;
    const toks = q.trim().split(/\s+/).map(norm).filter(Boolean);
    return pool
      .filter((r) => toks.every((t) => r.hay.includes(t)))
      .map((r) => ({ r, s: score(r, q, toks) }))
      .sort((x, y) => y.s - x.s || LAW_ORDER.indexOf(x.r.a.law) - LAW_ORDER.indexOf(y.r.a.law))
      .map((x) => x.r);
  }, [q, law, searched]);

  const grouped = useMemo(
    () => LAWS.map((l) => ({ law: l, rows: results.filter((r) => r.a.law === l.key) })).filter((g) => g.rows.length),
    [results]
  );

  const copyLink = async (id: string) => {
    const url = `${window.location.origin}/laws#${id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
      window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 1600);
    } catch {
      window.location.hash = id;
    }
  };

  const chip = (label: string, on: boolean, onClick: () => void) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      className={
        "rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition-colors " +
        (on
          ? "border-brand bg-brand text-white"
          : "border-line bg-white text-slate-600 hover:border-brand/40 hover:text-brand")
      }
    >
      {label}
    </button>
  );

  const renderCard = (a: LawArticle) => {
    const info = LAW_BY_KEY.get(a.law)!;
    const isOpen = !!open[a.id];
    return (
      <article key={a.id} id={a.id} className="mt-3 scroll-mt-[120px] overflow-hidden rounded-xl border border-line bg-white">
        <header className="border-b border-line bg-brand-tint px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="rounded bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">{info.short}</span>
            <a href={`#${a.id}`} className="text-[12px] font-extrabold text-brand hover:underline" title="이 조문 링크">
              {a.article}
            </a>
            <span className="rounded border border-line bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
              {a.topic}
            </span>
            <span className="ml-auto text-[10.5px] font-medium text-slate-400">시행 {info.enforced}</span>
          </div>
          <h3 className="mt-1.5 text-[15px] font-bold leading-[1.45] tracking-[-0.02em] text-ink">
            {highlight(a.title, tokens)}
          </h3>
        </header>

        <div className="space-y-2.5 px-4 py-3.5 sm:px-5">
          <p className="text-[12.5px] leading-[1.75] text-slate-700">{highlight(a.summary, tokens)}</p>
          <div className="rounded-lg border border-brand/15 bg-brand-tint/60 px-3 py-2">
            <p className="text-[10.5px] font-bold text-brand">실무 체크</p>
            <p className="mt-0.5 text-[12px] leading-[1.7] text-slate-700">{highlight(a.practice, tokens)}</p>
          </div>
          <div className="flex flex-wrap gap-1">
            {a.keywords.slice(0, 8).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setQ(k);
                  setLaw("all");
                }}
                className="rounded border border-line bg-slate-50 px-1.5 py-0.5 text-[10.5px] font-medium text-slate-500 hover:border-brand/40 hover:text-brand"
              >
                #{k}
              </button>
            ))}
          </div>
        </div>

        <details
          className="group border-t border-line"
          open={isOpen}
          onToggle={(e) => {
            const el = e.currentTarget as HTMLDetailsElement;
            setOpen((o) => (o[a.id] === el.open ? o : { ...o, [a.id]: el.open }));
          }}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-[11.5px] font-semibold text-slate-600 hover:bg-slate-50 sm:px-5">
            <span>
              조문 원문 보기 <span className="font-normal text-slate-400">· {a.paras.length}개 항</span>
            </span>
            <span className="text-[11px] text-brand group-open:hidden">펼치기</span>
            <span className="hidden text-[11px] text-brand group-open:inline">접기</span>
          </summary>
          <div className="border-t border-line bg-slate-50/70 px-4 py-3 sm:px-5">
            <p className="mb-2 text-[10.5px] font-semibold text-slate-400">
              {info.name} {a.article}({a.title}) — {info.no}, 시행 {info.enforced}
            </p>
            <div className="space-y-1.5">
              {a.paras.map((p, i) => (
                <p key={i} className="text-[12px] leading-[1.8] text-slate-700">
                  {highlight(p, tokens)}
                </p>
              ))}
            </div>
          </div>
        </details>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-white px-4 py-2.5 sm:px-5">
          <a
            href={info.url}
            target="_blank"
            rel="noreferrer"
            className="text-[11.5px] font-semibold text-brand underline decoration-brand/30 underline-offset-2 hover:decoration-brand"
          >
            국가법령정보센터 원문 ↗
          </a>
          <button
            type="button"
            onClick={() => copyLink(a.id)}
            className="rounded border border-line px-2 py-1 text-[11px] font-semibold text-slate-500 hover:border-brand/40 hover:text-brand"
          >
            {copied === a.id ? "링크 복사됨" : "이 조문 링크 복사"}
          </button>
        </footer>
      </article>
    );
  };

  return (
    <div>
      {/* 검색 바 — 스크롤해도 헤더 아래에 붙어 있는다 */}
      <div className="sticky top-[52px] z-[300] -mx-4 border-y border-line bg-canvas/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 focus-within:border-brand/50">
          <Icon name="search" size={15} className="text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            inputMode="search"
            placeholder="5년 재당첨, 권리산정기준일, 과소필지, 호수밀도…"
            aria-label="법령·조례 조문 검색"
            className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-ink outline-none placeholder:font-normal placeholder:text-slate-400"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label="검색어 지우기"
              className="shrink-0 rounded px-1 text-[16px] leading-none text-slate-400 hover:text-ink"
            >
              ×
            </button>
          )}
        </div>

        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {chip(`전체 ${LAW_ARTICLES.length}`, law === "all", () => setLaw("all"))}
          {LAWS.map((l) => (
            <span key={l.key} className="shrink-0">
              {chip(l.short, law === l.key, () => setLaw(l.key))}
            </span>
          ))}
        </div>

        <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {QUICK.map((k) => (
            <span key={k} className="shrink-0">
              {chip(k, norm(q) === norm(k), () => setQ(q === k ? "" : k))}
            </span>
          ))}
        </div>

        <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
          <span>
            {searched || law !== "all" ? (
              <>
                조문 <b className="font-bold text-brand">{results.length}</b>
                개 <span className="text-slate-400">/ 수록 {ROWS.length}개</span>
              </>
            ) : (
              <>수록 조문 {ROWS.length}개 · 법령·조례 {LAWS.length}개</>
            )}
          </span>
          {(searched || law !== "all") && (
            <button
              type="button"
              onClick={() => {
                setQ("");
                setLaw("all");
              }}
              className="font-semibold text-slate-500 hover:text-brand"
            >
              초기화
            </button>
          )}
        </div>
      </div>

      {/* 결과 */}
      {searched && results.length === 0 && (
        <div className="mt-8 rounded-xl border border-line bg-white px-4 py-8 text-center">
          <p className="text-[13.5px] font-bold text-ink">'{q.trim()}'로 찾은 조문이 없습니다</p>
          <p className="mt-1.5 text-[12px] leading-[1.7] text-slate-500">
            수록 조문은 상담에서 자주 찾는 것만 담았습니다. 다른 말로 다시 찾아보세요 —
            예: 재당첨 · 지분쪼개기 · 과소필지 · 노후도 · 호수밀도 · 현금청산 · 동의율
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {["재당첨", "지분쪼개기", "현금청산", "동의율"].map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setQ(k)}
                className="rounded-full border border-line bg-white px-2.5 py-1 text-[11.5px] font-semibold text-slate-600 hover:border-brand/40 hover:text-brand"
              >
                {k}
              </button>
            ))}
          </div>
        </div>
      )}

      {grouped.map((g) => (
        <section key={g.law.key} className="mt-7">
          <div className="flex flex-wrap items-end justify-between gap-2 border-b border-line pb-2">
            <div>
              <h2 className="text-[14px] font-bold tracking-[-0.02em] text-ink">
                {g.law.name}
                <span className="ml-1.5 text-[11px] font-semibold text-slate-400">{g.rows.length}개 조문</span>
              </h2>
              <p className="mt-0.5 text-[10.5px] font-medium text-slate-400">
                {g.law.kind} {g.law.no} · 시행 {g.law.enforced} · {g.law.ministry}
              </p>
            </div>
            <a
              href={g.law.url}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] font-semibold text-brand underline decoration-brand/30 underline-offset-2 hover:decoration-brand"
            >
              원문 ↗
            </a>
          </div>
          {g.rows.map((r) => renderCard(r.a))}
        </section>
      ))}

      {/* 안내 */}
      <div className="mt-8 flex flex-col gap-3 rounded-xl border border-line bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[12px] leading-relaxed text-slate-600">
          찾는 조문이 없으면 알려 주세요. 상담에서 자주 나온 순서대로 추가하겠습니다.
        </p>
        <Link
          href="/cases"
          className="shrink-0 rounded-md bg-brand px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-brand-deep"
        >
          현금청산 판례 리포트 보기
        </Link>
      </div>
    </div>
  );
}
