"use client";
// ─────────────────────────────────────────────────────────────────────────────
// ZoneOfficialPanel — 서울시 전수 정비구역 중 '대표 구역'이 아닌 구역의 상세 카드
//   서울 열린데이터광장 고시 데이터(구역명·사업유형·추진단계·고시면적·기준일)를 그대로 보여준다.
//   · 같은 구역의 다른 이름(지번·가칭)은 `alias`로 함께 보여주고, 이름의 출처(동작구청·정보몽땅 등)를 밝힌다.
//   · 구역계가 아직 고시되지 않은 후보지(geom: "미고시", 예: 사당21구역)는 경계 대신
//     서울시(정보몽땅) 위치도 링크와 '미고시' 상태를 보여준다 — 지도에도 폴리곤을 그리지 않는다.
//   실거래·매물·세대수는 대표 구역에만 샘플로 붙어 있어 여기서는 "미등록"으로 안내한다.
//
// ▶ 레이아웃: 이 패널은 **400px 오른쪽 드로어 안에서만** 쓰인다. 예전에는 화면 폭 기준
//   `lg:grid-cols-2` 2단 배치라, 넓은 화면에서 드로어 안이 170px 씩 쪼개져 라벨이
//   한 글자씩 세로로 쌓이고 고시레코드가 상자를 넘쳤다. 지금은 **항상 1단(위아래로 쌓기)**,
//   라벨은 줄바꿈 금지, 값은 필요할 때만 단어 단위로 감싼다.
// ─────────────────────────────────────────────────────────────────────────────
import type { SeoulZonesMeta, SeoulZone } from "@/lib/seoul-zones";
import type { Listing } from "@/lib/types";
import { TYPE_COLORS } from "./map/colors";
import ZoneTransactions from "./ZoneTransactions";
import { ZoneListingCards } from "./ZoneListingCards";
import LandPermitNotice from "./LandPermitNotice";
import type { TxMapPin } from "./map/props";

const PYEONG = 3.305785;

export default function ZoneOfficialPanel({
  zone,
  meta,
  onClose,
  listings = [],
  onTxPins,
}: {
  zone: SeoulZone;
  meta: SeoulZonesMeta;
  onClose: () => void;
  /** 이 구역의 매물(zoneId 또는 zoneName 매칭) — 있으면 고시 데이터 아래에 카드로 붙는다 */
  listings?: Listing[];
  /** 실거래 좌표를 지도 가격 핀으로 넘긴다 */
  onTxPins?: (pins: TxMapPin[]) => void;
}) {
  const color = TYPE_COLORS[zone.type] ?? "#64748b";
  const pyeong = Math.round(zone.area / PYEONG);
  const aliases = (zone.alias ?? []).filter((a) => a !== zone.name);
  const boundaryMissing = !zone.polygon || zone.geom === "미고시";
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
        <button
          onClick={onClose}
          className="ml-auto shrink-0 whitespace-nowrap rounded-lg border border-slate-300 px-2 py-0.5 text-[11px] text-slate-600 hover:border-slate-500 hover:text-slate-900"
        >
          닫기
        </button>
      </div>

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

      {/* 서울시 고시 데이터 — 1단. 라벨은 줄바꿈 금지, 값은 칸 안에서만 감싼다 */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <span className="whitespace-nowrap text-[11px] font-semibold text-emerald-800">서울시 고시 데이터</span>
          <span className="whitespace-nowrap text-[10px] text-emerald-700/70">{meta.asOf} 기준</span>
        </div>
        <dl className="grid grid-cols-[5.2rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs text-emerald-900">
          <dt className="whitespace-nowrap text-emerald-700/80">구역명</dt>
          <dd className="min-w-0 break-words font-medium">{zone.name}</dd>
          {zone.selectedAt && (
            <>
              <dt className="whitespace-nowrap text-emerald-700/80">후보지 선정</dt>
              <dd className="min-w-0 break-words">{zone.selectedAt}</dd>
            </>
          )}
          <dt className="whitespace-nowrap text-emerald-700/80">자치구</dt>
          <dd className="min-w-0 break-words">{zone.gu}</dd>
          <dt className="whitespace-nowrap text-emerald-700/80">사업유형</dt>
          <dd className="min-w-0 break-words">{zone.kind}</dd>
          <dt className="whitespace-nowrap text-emerald-700/80">추진단계</dt>
          <dd className="min-w-0 break-words">{zone.stage}</dd>
          <dt className="whitespace-nowrap text-emerald-700/80">구역면적</dt>
          <dd className="min-w-0">
            {zone.area.toLocaleString()}㎡
            <span className="ml-1 text-[10px] text-emerald-700/80">
              ({(zone.area / 10000).toFixed(1)}만㎡ · {pyeong.toLocaleString()}평)
            </span>
          </dd>
          <dt className="whitespace-nowrap text-emerald-700/80">경계 도형</dt>
          <dd className="min-w-0 break-words text-[11px] leading-relaxed">
            {zone.geom === "UQ181" ? (
              <>
                의제처리구역 실경계(필지선 추종)
                <span className="text-emerald-700/70"> · {meta.asOfDetail} 기준</span>
              </>
            ) : zone.geom === "공고도면" ? (
              <>
                구청·서울시 공고 도면에서 옮긴 경계
                <span className="text-emerald-700/70">
                  {zone.boundaryNote ? ` · ${zone.boundaryNote}` : ""} · 정비구역 지정 전이라 확정 전
                </span>
              </>
            ) : zone.geom === "고시도면" ? (
              <>
                구청·서울시 고시 지형도면에서 옮긴 경계
                <span className="text-emerald-700/70">
                  {zone.boundaryNote ? ` · ${zone.boundaryNote}` : ""} · 정비구역 지정 전이라 확정 전
                </span>
              </>
            ) : zone.geom === "가상경계" ? (
              <>
                검토 중인 가상 경계(확정 전)
                <span className="text-emerald-700/70">
                  {zone.boundaryNote ? ` · ${zone.boundaryNote}` : ""} · 사업지 선정 전이라 실제 경계와 다를 수 있음
                </span>
              </>
            ) : zone.geom === "미고시" ? (
              <>
                미고시 — 정비구역 지정 전이라 법정 구역계가 없습니다
                {zone.centerLabel && <span className="text-emerald-700/70"> · 지도 표시: {zone.centerLabel}</span>}
              </>
            ) : zone.geom === "UQ120보정" ? (
              <>
                서울시 고시 경계(일반화 도형)를 인접 구역에 맞춰 보정
                <span className="text-emerald-700/70">
                  {zone.boundaryNote ? ` · ${zone.boundaryNote}` : ""}
                </span>
              </>
            ) : (
              <>도시계획사업 고시 경계</>
            )}
          </dd>
          <dt className="whitespace-nowrap text-emerald-700/80">고시 레코드</dt>
          <dd className="min-w-0">
            <span className="block break-all rounded bg-white/70 px-1.5 py-1 font-mono text-[10px] leading-relaxed text-emerald-800/90">
              {zone.sourceId}
            </span>
          </dd>
        </dl>
        {zone.areaNote && <p className="mt-2 text-[10px] leading-relaxed text-emerald-700/80">면적 기준: {zone.areaNote}</p>}
        {zone.locationMap && (
          <a
            href={zone.locationMap}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-800 hover:border-emerald-500"
          >
            서울시 위치도 보기 ↗
          </a>
        )}
      </div>

      {/* 검증 매물 — 실거래가 위에 붙여 '지금 나온 물건'을 먼저 보여준다 */}
      <ZoneListingCards listings={listings} zoneId={zone.id} zoneName={zone.name} />

      {/* 국토부 실거래가 — 서울시 고시 데이터 바로 아래에 붙여 경계·면적과 시세를 함께 본다 */}
      <ZoneTransactions
        gu={zone.gu}
        names={[zone.name, ...(zone.alias ?? [])]}
        center={zone.center}
        polygon={zone.polygon}
        parts={zone.parts}
        holes={zone.holes}
        onTxPins={onTxPins}
      />

      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-3 text-slate-600">
        <h3 className="mb-1.5 text-xs font-bold text-slate-700">{boundaryMissing ? "경계·사업 정보" : "상세 데이터"}</h3>
        {zone.note && <p className="text-[11px] leading-relaxed">{zone.note}</p>}
        {zone.nameNote && zone.nameNote !== zone.note && (
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">이름 근거: {zone.nameNote}</p>
        )}
        <p className="mt-2 text-[11px] leading-relaxed">
          세대수·비례율·시공사는 앱의 <b>대표 구역 6곳</b>(신림1·반포주공1단지 3주구·
          노량진1·한남뉴타운·성수전략2·북아현1-1)에 샘플로 붙어 있습니다.
        </p>
        <p className="mt-2 text-[11px] leading-relaxed">
          이 구역은 서울시 고시 데이터(경계·사업유형·추진단계·면적)와 위의 국토부 실거래가를 함께
          보여줍니다. 매물은 중개사가 <b>/register</b> 에 등록하면 이 패널과 지도에 바로 표시됩니다.
        </p>
        {sources.length > 0 && (
          <div className="mt-3 border-t border-slate-200 pt-2 text-[10px] text-slate-500">
            <p className="mb-1 font-semibold text-slate-600">확인 출처</p>
            <ul className="space-y-0.5">
              {sources.map((s) => (
                <li key={s.url + s.label} className="break-words">
                  <a href={s.url} target="_blank" rel="noreferrer" className="underline decoration-slate-300 hover:text-slate-700">
                    {s.label}
                  </a>
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
