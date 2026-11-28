// ─────────────────────────────────────────────────────────────────────────────
// featured-stage — 대표 구역 6곳의 「사업 진행단계」 카드 입력값
//
//   대표 구역(sample.ts ZONES)은 세대수·비례율·시공사 같은 데모 값을 함께 보여 주려고
//   별도 패널로 그린다. 그 패널에는 단계별 고시 날짜·권리산정기준일 카드가 없어서,
//   같은 id 의 서울시 원본 레코드(seoul-zones 의 stage·kind·stageDates·rightsDate)를
//   그대로 넘겨 일반 구역과 같은 카드를 그린다.
//
//   · 서울시 레코드를 못 받았을 때(데이터 로딩 실패)는 샘플 구역의 단계·유형으로 사다리만 그리고
//     날짜는 비운다 — 없는 날짜를 지어내지 않는다.
//   · 두 구역(북아현1-1·한남재정비촉진지구)의 비어 있던 단계 날짜는 featured-stage-dates.ts 의
//     보강값으로 채운다(정본 seoul-zones.json 에도 같은 값이 들어 있다).
// ─────────────────────────────────────────────────────────────────────────────
import type { Zone } from "@/lib/types";
import type { SeoulZone } from "@/lib/seoul-zones";
import type { StageTimelineInput } from "@/lib/stage-timeline";
import { FEATURED_STAGE_SUPPLEMENT } from "@/data/featured-stage-dates";

/** 서울시 원본 레코드에 보강 날짜를 얹은, 카드용 입력값 */
export function featuredStageInput(selected: Zone, official?: SeoulZone): StageTimelineInput {
  const extra = FEATURED_STAGE_SUPPLEMENT[selected.id];

  const base: StageTimelineInput = official
    ? {
        type: official.type,
        kind: official.kind,
        stage: official.stage,
        selectedAt: official.selectedAt,
        asOf: official.asOf,
        stageDates: official.stageDates,
        rightsDate: official.rightsDate,
        datesAsOf: official.datesAsOf,
      }
    : {
        type: selected.type,
        kind: selected.official?.kind,
        stage: selected.stage,
        asOf: selected.official?.asOf,
      };

  return {
    ...base,
    // 보강값이 있으면 비어 있는 날짜만 채운다(이미 있는 값이 우선)
    stageDates: { ...(extra?.stageDates ?? {}), ...(base.stageDates ?? {}) },
    datesAsOf: base.datesAsOf ?? extra?.datesAsOf,
  };
}
