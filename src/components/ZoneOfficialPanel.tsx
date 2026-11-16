"use client";
// ─────────────────────────────────────────────────────────────────────────────
// ZoneOfficialPanel — 서울시 전수 정비구역 중 '대표 구역'이 아닌 구역의 상세 카드
//   서울 열린데이터광장 고시 데이터(구역명·사업유형·추진단계·고시면적·기준일)를 그대로 보여준다.
//   · 같은 구역의 다른 이름(지번·가칭)은 `alias`로 함께 보여주고, 이름의 출처(동작구청·정보몽땅 등)를 밝힌다.
//   · 구역계가 아직 고시되지 않은 후보지(geom: "미고시", 예: 사당21구역)는 경계 대신
//     서울시(정보몽땅) 위치도 링크와 '미고시' 상태를 보여준다 — 지도에도 폴리곤을 그리지 않는다.
//   실거래·매물·세대수는 대표 구역에만 샘플로 붙어 있어 여기서는 "미등록"으로 안내한다.
// ─────────────────────────────────────────────────────────────────────────────
import type { SeoulZonesMeta, SeoulZone } from "@/lib/seoul-zones";
import { TYPE_COLORS } from "./map/colors";

const PYEONG = 3.305785;

export default function ZoneOfficialPanel({
  zone,
  meta,
  onClose,
}: {
  zone: SeoulZone;
  meta: SeoulZonesMeta;
  onClose: () => void;
}) {
  const color = TYPE_COLORS[zone.type] ?? "#64748b";
  const pyeong = Math.round(zone.area / PYEONG);
  const aliases = (zone.alias ?? []).filter((a) => a !== zone.name);
  const boundaryMissing = !zone.polygon || zone.geom === "미고시";
  const sources = [...(zone.sources ?? []), ...(zone.nameSources ?? [])].filter(
    (s, i, arr) => arr.findIndex((x) => x.url === s.url && x.label === s.label) === i
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-bold text-slate-900">{zone.name}</h2>
        <span
          className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
          style={{ backgroundColor: color }}
        >
          {zone.type}
        </span>
        <span className="rounded-full border border-slate-300 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
          {zone.stage}
        </span>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{zone.gu}</span>
        {boundaryMissing && (
          <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
            구역계 미고시
          </span>
        )}
        <button
          onClick={onClose}
          className="ml-auto rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:border-slate-500"
        >
          닫기
        </button>
      </div>

      {aliases.length > 0 && (
        <p className="mb-3 text-xs text-slate-500">
          <span className="font-semibold text-slate-600">별칭·지번</span>{" "}
          {aliases.map((a) => (
            <span key={a} className="mr-1.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
              {a}
            </span>
          ))}
          <span className="ml-1 text-slate-400">· 검색창에서 어느 표기로도 찾을 수 있습니다</span>
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 text-sm">
          <div className="mb-2 flex items-center justify-between text-xs font-semibold text-emerald-800">
            <span>서울시 고시 데이터</span>
            <span className="font-normal text-emerald-700/70">{meta.asOf} 기준</span>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-emerald-900">
            <dt className="text-emerald-700/80">구역명</dt>
            <dd className="font-medium">{zone.name}</dd>
            {zone.selectedAt && (
              <>
                <dt className="text-emerald-700/80">후보지 선정</dt>
                <dd>{zone.selectedAt}</dd>
              </>
            )}
            <dt className="text-emerald-700/80">자치구</dt>
            <dd>{zone.gu}</dd>
            <dt className="text-emerald-700/80">사업유형</dt>
            <dd>{zone.kind}</dd>
            <dt className="text-emerald-700/80">추진단계</dt>
            <dd>{zone.stage}</dd>
            <dt className="text-emerald-700/80">구역면적</dt>
            <dd>
              {zone.area.toLocaleString()}㎡
              <span className="ml-1 text-xs text-emerald-700/80">
                ({(zone.area / 10000).toFixed(1)}만㎡ · {pyeong.toLocaleString()}평)
              </span>
            </dd>
            <dt className="text-emerald-700/80">경계 도형</dt>
            <dd className="text-xs">
              {zone.geom === "UQ181" ? (
                <>
                  의제처리구역 실경계(필지선 추종)
                  <span className="text-emerald-700/70"> · {meta.asOfDetail} 기준</span>
                </>
              ) : zone.geom === "미고시" ? (
                <>
                  미고시 — 정비구역 지정 전이라 법정 구역계가 없습니다
                  {zone.centerLabel && <span className="text-emerald-700/70"> · 지도 표시: {zone.centerLabel}</span>}
                </>
              ) : (
                <>도시계획사업 고시 경계</>
              )}
            </dd>
            <dt className="text-emerald-700/80">고시 레코드</dt>
            <dd className="font-mono text-[11px] text-emerald-800/80">{zone.sourceId}</dd>
          </dl>
          {zone.areaNote && <p className="mt-2 text-[11px] text-emerald-700/80">면적 기준: {zone.areaNote}</p>}
          {zone.locationMap && (
            <a
              href={zone.locationMap}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:border-emerald-500"
            >
              서울시 위치도 보기 ↗
            </a>
          )}
        </div>

        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-4 text-sm text-slate-600">
          <h3 className="mb-1.5 text-sm font-bold text-slate-700">
            {boundaryMissing ? "경계·사업 정보" : "상세 데이터"}
          </h3>
          {zone.note && <p className="text-xs leading-relaxed">{zone.note}</p>}
          {zone.nameNote && zone.nameNote !== zone.note && (
            <p className="mt-2 text-xs leading-relaxed text-slate-500">이름 근거: {zone.nameNote}</p>
          )}
          <p className="mt-2 text-xs leading-relaxed">
            세대수·비례율·시공사·실거래가·중개사 매물은 앱의 <b>대표 구역 6곳</b>(신림1·반포주공1단지 3주구·
            노량진1·한남뉴타운·성수전략2·북아현1-1)에 샘플로 붙어 있습니다.
          </p>
          <p className="mt-2 text-xs leading-relaxed">
            이 구역은 서울시 고시 데이터(경계·사업유형·추진단계·면적)만 표시합니다. 매물·실거래 연동은
            중개사 등록과 실거래 API 연결 후 채워집니다.
          </p>
          {sources.length > 0 && (
            <div className="mt-3 border-t border-slate-200 pt-2 text-[11px] text-slate-500">
              <p className="mb-1 font-semibold text-slate-600">확인 출처</p>
              <ul className="space-y-0.5">
                {sources.map((s) => (
                  <li key={s.url + s.label}>
                    <a href={s.url} target="_blank" rel="noreferrer" className="underline decoration-slate-300 hover:text-slate-700">
                      {s.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-3 text-[11px] text-slate-400">
            출처: {meta.source}
            {meta.supplement?.asOf && ` · 구역명·신규 후보지 보강 ${meta.supplement.asOf}`}
          </p>
        </div>
      </div>
    </section>
  );
}
