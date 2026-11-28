"use client";
// ─────────────────────────────────────────────────────────────────────────────
// ZoneOfficialPanel — 서울시 전수 정비구역 중 '대표 구역'이 아닌 구역의 상세 카드
//   사업 진행단계·구역현황(추정)·매물·경매·국토부 실거래가를 한 카드에 위아래로 쌓아 보여준다.
//   · 같은 구역의 다른 이름(지번·가칭)은 `alias`로 함께 보여주고, 이름의 출처(동작구청·정보몽땅 등)를 밝힌다.
//   · 구역계가 아직 고시되지 않은 후보지(geom: "미고시", 예: 사당21구역)는 경계 대신
//     '미고시' 배지로 알린다 — 지도에도 폴리곤을 그리지 않는다.
//   세대수·비례율·시공사 같은 샘플 값은 대표 구역에만 붙어 있다.
//
// ▶ 레이아웃: 이 패널은 **400px 오른쪽 드로어 안에서만** 쓰인다. 예전에는 화면 폭 기준
//   `lg:grid-cols-2` 2단 배치라, 넓은 화면에서 드로어 안이 170px 씩 쪼개져 라벨이
//   한 글자씩 세로로 쌓이고 값이 상자를 넘쳤다. 지금은 **항상 1단(위아래로 쌓기)**,
//   라벨은 줄바꿈 금지, 값은 필요할 때만 단어 단위로 감싼다.
// ─────────────────────────────────────────────────────────────────────────────
import type { SeoulZonesMeta, SeoulZone } from "@/lib/seoul-zones";
import type { Listing } from "@/lib/types";
import { TYPE_COLORS } from "./map/colors";
import ZoneTransactions from "./ZoneTransactions";
import ZoneTalk from "./community/ZoneTalk";
import { ZoneListingCards } from "./ZoneListingCards";
import LandPermitNotice from "./LandPermitNotice";
import type { TxMapPin } from "./map/props";
import type { BuildingTradeTarget } from "@/lib/molit";
import StageTimeline from "./StageTimeline";
import ZonePlanSummary from "./ZonePlanSummary";
import ZoneConsent from "./ZoneConsent";
import ZoneVitalStats from "./ZoneVitalStats";
import ZoneBriefingCard from "./ZoneBriefingCard";

export default function ZoneOfficialPanel({
  zone,
  meta,
  onClose,
  listings = [],
  onTxPins,
  onOpenBuilding,
}: {
  zone: SeoulZone;
  meta: SeoulZonesMeta;
  onClose: () => void;
  /** 이 구역의 매물(zoneId 또는 zoneName 매칭) — 있으면 구역현황 아래에 카드로 붙는다 */
  listings?: Listing[];
  /** 실거래 좌표를 지도 가격 핀으로 넘긴다 */
  onTxPins?: (pins: TxMapPin[]) => void;
  /** 실거래 행을 누를 때 그 단지·건물의 5년 이력을 연다 */
  onOpenBuilding?: (target: BuildingTradeTarget) => void;
}) {
  const color = TYPE_COLORS[zone.type] ?? "#64748b";
  const aliases = (zone.alias ?? []).filter((a) => a !== zone.name);
  const boundaryMissing = !zone.polygon || zone.geom === "미고시" || zone.geom === "고시미반영";
  const sources = [...(zone.sources ?? []), ...(zone.nameSources ?? [])].filter(
    (s, i, arr) => arr.findIndex((x) => x.url === s.url && x.label === s.label) === i
  );

  return (
    <section className="space-y-3">
      {/* 토허제 참고 안내 — 패널 맨 위에 조용한 배지로(확정 판정 아님을 함께 밝힌다) */}
      <LandPermitNotice gu={zone.gu} names={[zone.name, ...(zone.alias ?? [])]} type={zone.type} kind={zone.kind} />

      <div className="flex flex-wrap items-center gap-1.5">
        <h2 className="text-lg font-bold leading-tight text-slate-900">{zone.name}</h2>
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
          style={{ backgroundColor: color }}
        >
          {zone.type}
        </span>
        <span className="whitespace-nowrap rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
          {zone.stage}
        </span>
        <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
          {zone.gu}
        </span>
        {boundaryMissing && (
          <span className="whitespace-nowrap rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
            구역계 미고시
          </span>
        )}
        {zone.adminEdited && (
          <span
            data-testid="zone-admin-edited"
            title="관리자 화면에서 경계·정보를 고쳐 저장한 구역입니다(서울시 원본 위에 반영)"
            className="whitespace-nowrap rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800"
          >
            관리자 보정
          </span>
        )}
        <button
          onClick={onClose}
          className="ml-auto shrink-0 whitespace-nowrap rounded-lg border border-slate-300 px-2 py-0.5 text-[11px] text-slate-600 hover:border-slate-500 hover:text-slate-900"
        >
          닫기
        </button>
      </div>

      {/* 📢 주민설명회 일정 — 구역 상세 맨 위, 동의율·단계보다 먼저.
          날짜가 정해진 안내라 지나가면 다시 볼 수 없다 — 가장 눈에 띄는 자리에 둔다.
          데이터에 briefings 가 없으면 아무것도 그리지 않는다(다른 구역은 그대로). */}
      <ZoneBriefingCard briefings={zone.briefings} />

      {/* 동의율 — 사업 추진을 가르는 핵심 수치라 단계 타임라인보다 위에 둔다.
          값이 없는 구역은 '미공개' 한 줄로만 보여 준다(0%와 다른 상태). */}
      <ZoneConsent
        rate={zone.consentRate}
        date={zone.consentDate}
        note={zone.consentNote}
        edited={zone.adminEdited && typeof zone.consentRate === "number"}
      />

      {/* 사업 진행단계 — 지금이 어느 단계인지, 지나온 단계·남은 단계까지 한눈에.
          별칭·지번 목록보다 위에 둔다(지번이 많은 구역에서도 스크롤 없이 바로 보이도록) */}
      <StageTimeline zone={zone} />

      {aliases.length > 0 && (
        <p className="text-[11px] leading-relaxed text-slate-500">
          <span className="font-semibold text-slate-600">별칭·지번</span>{" "}
          {aliases.map((a) => (
            <span key={a} className="mr-1 mb-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
              {a}
            </span>
          ))}
          <span className="text-slate-400">· 검색창에서 어느 표기로도 찾을 수 있습니다</span>
        </p>
      )}

      {/* 사업개요 — 공개 자료로 확인한 세대수·규모·시공사·최신 진행 현황.
          값이 없는 구역은 컴포넌트가 스스로 아무것도 그리지 않는다(없는 수치를 지어내지 않음). */}
      <ZonePlanSummary zone={zone} />

      {/* 구역현황(추정) — 단계 타임라인 아래에 노후도·동수밀도를 붙여
          '이 구역이 얼마나 오래됐고 얼마나 빽빽한지'를 같은 자리에서 읽게 한다.
          경계 폴리곤이 없는 후보지(미고시)는 계산할 도형이 없어 그리지 않는다. */}
      {zone.polygon && zone.polygon.length >= 3 && (
        <ZoneVitalStats
          shape={{ polygon: zone.polygon, parts: zone.parts, holes: zone.holes }}
          areaSqm={zone.area}
          stage={zone.stage}
          geom={zone.geom}
        />
      )}

      {/* 검증 매물 — 실거래가 위에 붙여 '지금 나온 물건'을 먼저 보여준다 */}
      <ZoneListingCards listings={listings} zoneId={zone.id} zoneName={zone.name} />

      {/* 경매 물건 목록은 **여기에 그리지 않는다** — 왼쪽 경매 전용 패널 하나에서만 본다(2026-11-27 개편).
          진입은 구역 패널 헤더의 「⚖️ 경매 N건 · 보기」 버튼이다. */}

      {/* 국토부 실거래가 — '지금 법원에 걸린 물건'은 왼쪽 경매 패널, 여기서는 실제 신고 거래를 본다 */}
      <ZoneTransactions
        gu={zone.gu}
        names={[zone.name, ...(zone.alias ?? [])]}
        center={zone.center}
        polygon={zone.polygon}
        parts={zone.parts}
        holes={zone.holes}
        onTxPins={onTxPins}
        onOpenBuilding={onOpenBuilding}
      />

      {/* 이 구역 이야기 — 커뮤니티(community_posts)의 zone_id 글. 패널에서 바로 한줄 글쓰기 */}
      <ZoneTalk zoneId={zone.id} zoneName={zone.name} />

      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-3 text-slate-600">
        <h3 className="mb-1.5 text-xs font-bold text-slate-700">{boundaryMissing ? "경계·사업 정보" : "상세 데이터"}</h3>
        {zone.note && <p className="text-[11px] leading-relaxed">{zone.note}</p>}
        {/* 경계를 어떤 도면에서 옮겼는지 — 고시 지형도면 정합·필지 재작도 구역에서 근거를 밝힌다 */}
        {zone.boundaryNote && (
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            <span className="font-semibold text-slate-600">경계 근거</span> {zone.boundaryNote}
          </p>
        )}
        {zone.nameNote && zone.nameNote !== zone.note && (
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">이름 근거: {zone.nameNote}</p>
        )}
        {typeof zone.households !== "number" && !zone.contractor && (
          <p className="mt-2 text-[11px] leading-relaxed">
            세대수·비례율·시공사는 앱의 <b>대표 구역 6곳</b>(신림1·반포주공1단지 3주구·
            노량진1·한남뉴타운·성수전략2·북아현1-1)에 샘플로 붙어 있습니다.
          </p>
        )}
        <p className="mt-2 text-[11px] leading-relaxed">
          이 구역은 사업 진행단계·구역현황(추정)과 위의 국토부 실거래가를 함께 보여줍니다.
          매물은 중개사가 <b>/register</b> 에 등록하면 이 패널과 지도에 바로 표시됩니다.
        </p>
        {sources.length > 0 && (
          <div className="mt-3 border-t border-slate-200 pt-2 text-[10px] text-slate-500">
            <p className="mb-1 font-semibold text-slate-600">확인 출처</p>
            <ul className="space-y-0.5">
              {sources.map((s) => (
                <li key={s.url + s.label} className="break-words">
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer" className="underline decoration-slate-300 hover:text-slate-700">
                      {s.label}
                    </a>
                  ) : (
                    // 링크가 없는 출처(고시·공고 원문 등)는 글자로만 둔다 — 빈 링크로 두면 현재 화면을 다시 연다
                    <span>{s.label}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-3 text-[10px] leading-relaxed text-slate-400">
          출처: {meta.source}
          {meta.supplement?.asOf && ` · 구역명·신규 후보지 보강 ${meta.supplement.asOf}`}
          {meta.official80?.asOf && ` · 누락 비교리스트 ① 80곳 재검증 ${meta.official80.asOf}`}
          {meta.dongjakMapo?.asOf && ` · 동작·마포 추진준비 구역 ${meta.dongjakMapo.asOf}`}
          {meta.seongdongYongsan?.asOf && ` · 성동·용산 추진준비 구역 ${meta.seongdongYongsan.asOf}`}
          {meta.yeouidaebang2?.asOf && ` · 여의대방2역세권 지형도면 ${meta.yeouidaebang2.asOf}`}
        </p>
      </div>
    </section>
  );
}
