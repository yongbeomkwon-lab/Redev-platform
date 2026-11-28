"use client";
// ─────────────────────────────────────────────────────────────────────────────
// ZoneBriefingCard — 구역 상세 패널의 「📢 주민설명회 일정」 카드
//
//   구역 데이터(seoul-zones.json → zones.geojson)의 `briefings` 배열을 그대로 읽어
//   일정·장소·주관·포스터·안내 링크를 한 카드에 보여준다. 다른 구역 설명회도
//   데이터에 `briefings` 한 덩이만 넣으면 같은 카드로 뜬다(컴포넌트는 구역을 모른다).
//
//   · 일정은 데이터의 `date`(YYYY-MM-DD)로 D-day를 계산한다 — 한국 시간 자정 기준.
//     지난 일정은 '종료'로 흐리게 남긴다(포스터·안내 링크는 그대로 열린다).
//   · 포스터는 작은 썸네일로 붙이고 누르면 새 탭에서 원본을 연다(패널이 400px라
//     큰 이미지를 카드 안에 넣으면 일정 글자가 밀린다).
//   · 오픈채팅 링크는 초대 링크라 **로그인 없이** 열린다 — `target="_blank"` + noopener.
// ─────────────────────────────────────────────────────────────────────────────
import type { ZoneBriefing } from "@/lib/seoul-zones";

/** 한국 시간(UTC+9) 자정 기준 남은 날짜 — 오늘이면 0, 지났으면 음수 */
function daysUntil(date: string, now = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!m) return null;
  const target = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000); // UTC 필드가 곧 KST 날짜
  const today = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate());
  return Math.round((target - today) / 86_400_000);
}

/** "2026-12-19" + "10:00" → "2026년 12월 19일 (토) 오전 10:00" (데이터에 표기가 있으면 그것을 쓴다) */
function dateText(b: ZoneBriefing): string {
  if (b.dateLabel) return b.dateLabel;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(b.date ?? "");
  if (!m) return b.date ?? "";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const dow = "일월화수목금토"[d.getUTCDay()];
  const head = `${Number(m[1])}년 ${Number(m[2])}월 ${Number(m[3])}일 (${dow})`;
  if (!b.time) return head;
  const [hh, mm] = b.time.split(":").map(Number);
  const ampm = hh < 12 ? "오전" : "오후";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${head} ${ampm} ${h12}:${String(mm ?? 0).padStart(2, "0")}`;
}

function DDay({ date }: { date: string }) {
  const days = daysUntil(date);
  if (days === null) return null;
  if (days < 0) {
    return (
      <span className="shrink-0 rounded-full bg-slate-200 px-1.5 py-[1px] text-[10px] font-bold text-slate-600">
        종료
      </span>
    );
  }
  const label = days === 0 ? "오늘" : `D-${days}`;
  const tone =
    days <= 3
      ? "bg-rose-600 text-white"
      : days <= 7
        ? "bg-rose-100 text-rose-800 ring-1 ring-rose-200"
        : "bg-amber-500 text-white";
  return <span className={`shrink-0 rounded-full px-1.5 py-[1px] text-[10px] font-bold ${tone}`}>{label}</span>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[34px_minmax(0,1fr)] gap-x-1.5">
      <span className="pt-[1px] text-[10px] font-bold leading-[1.45] text-amber-700/80">{label}</span>
      <span className="break-keep text-[11px] leading-[1.45] text-slate-800">{children}</span>
    </div>
  );
}

export default function ZoneBriefingCard({ briefings }: { briefings?: ZoneBriefing[] | null }) {
  const list = (briefings ?? []).filter((b) => b && b.title && b.date);
  if (list.length === 0) return null;

  // 가까운 일정이 위로 — 데이터 순서와 무관하게 날짜로 정렬한다
  const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-2" data-testid="zone-briefing-card">
      {sorted.map((b) => {
        const past = (daysUntil(b.date) ?? 0) < 0;
        return (
          <section
            key={`${b.date}-${b.title}`}
            data-testid="zone-briefing-item"
            data-briefing-date={b.date}
            className={
              "overflow-hidden rounded-xl border-2 " +
              (past ? "border-slate-200 bg-slate-50/70" : "border-amber-400 bg-amber-50/70")
            }
          >
            {/* 머리 — 무엇에 대한 안내인지 한 줄로 먼저 */}
            <div
              className={
                "flex items-center gap-1.5 px-2.5 py-1.5 " +
                (past ? "bg-slate-100" : "bg-amber-400/90")
              }
            >
              <span className={"text-[11px] font-bold " + (past ? "text-slate-600" : "text-amber-950")}>
                📢 {b.kind ?? "주민설명회"} 일정
              </span>
              <span className="ml-auto" />
              <DDay date={b.date} />
            </div>

            <div className="space-y-2 p-2.5">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <h3 className="break-keep text-[13px] font-bold leading-snug text-slate-900">{b.title}</h3>
                  <div className="space-y-1">
                    <Row label="일시">
                      <b className="font-bold">{dateText(b)}</b>
                    </Row>
                    {b.place && (
                      <Row label="장소">
                        <b className="font-semibold">{b.place}</b>
                        {b.placeNote && (
                          <span className="block text-[10.5px] font-normal text-slate-500">{b.placeNote}</span>
                        )}
                      </Row>
                    )}
                    {(b.host || b.note) && (
                      <Row label="주관">
                        {b.host && <span className="font-semibold">{b.host}</span>}
                        {b.host && b.note && <span className="text-slate-400"> · </span>}
                        {b.note && <span className="text-[10.5px] text-slate-500">{b.note}</span>}
                      </Row>
                    )}
                  </div>
                </div>

                {/* 포스터 썸네일 — 누르면 새 탭에서 원본 크기로 */}
                {b.poster && (
                  <a
                    href={b.poster}
                    target="_blank"
                    rel="noreferrer"
                    title="포스터 크게 보기(새 탭)"
                    className="group relative block shrink-0 overflow-hidden rounded-lg border border-amber-300 bg-white shadow-sm"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={b.poster}
                      alt={`${b.title} 포스터`}
                      width={88}
                      height={88}
                      loading="lazy"
                      className="h-[88px] w-[88px] object-cover object-top transition group-hover:brightness-95"
                    />
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 hidden bg-slate-900/70 py-[2px] text-center text-[9px] font-semibold text-white group-hover:block">
                      크게 보기
                    </span>
                  </a>
                )}
              </div>

              {b.links && b.links.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {b.links.map((l) => (
                    <a
                      key={l.url + l.label}
                      href={l.url}
                      target="_blank"
                      rel="noreferrer"
                      className={
                        "rounded-lg px-2.5 py-1.5 text-[11.5px] font-bold transition " +
                        (l.kind === "kakao"
                          ? "bg-[#FEE500] text-[#3C1E1E] hover:brightness-95"
                          : "bg-slate-800 text-white hover:bg-slate-900")
                      }
                    >
                      {l.kind === "kakao" ? "💬 " : "↗ "}
                      {l.label}
                    </a>
                  ))}
                </div>
              )}

              {b.source && <p className="text-[10px] leading-snug text-slate-400">{b.source}</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
