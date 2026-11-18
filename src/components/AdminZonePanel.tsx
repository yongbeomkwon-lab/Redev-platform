"use client";
// ─────────────────────────────────────────────────────────────────────────────
// 관리자 모드 패널 — 대표님 전용(지도 위 구역 그리기·경계 수정)
//
//   · 왼쪽 위 카드(검색 아래)에 붙는다: 새 구역 그리기 / 선택 구역 경계 수정 / 메타 입력 /
//     저장된 구역 목록 / JSON 내보내기.
//   · 그리는 동안에는 지도 위에 작은 도구 막대(AdminDrawToolbar)를 띄워, 꼭짓점을 찍는 자리에서
//     바로 실행취소·완료·취소와 실시간 면적을 볼 수 있게 한다(오른쪽 상세 패널을 보지 않아도 되게).
//   · 일반 방문자에게는 이 컴포넌트가 아예 렌더되지 않는다.
// ─────────────────────────────────────────────────────────────────────────────
import { useId } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import {
  CUSTOM_ZONE_STAGES,
  CUSTOM_ZONE_TYPES,
  SEOUL_GU,
  formatArea,
  ringAreaSqm,
  type CustomZone,
  type CustomZoneType,
} from "@/lib/custom-zones";

export type AdminMetaForm = {
  name: string;
  type: CustomZoneType;
  stage: string;
  gu: string;
  note: string;
};

export type AdminPanelProps = {
  /** 저장된 관리자 구역(이 브라우저) */
  zones: CustomZone[];
  /** 지금 그리는/고치는 초안이 있는지 */
  draftPoints: [number, number][] | null;
  /** 지도 탭으로 점을 추가하는 중인지 */
  adding: boolean;
  /** 지금 고치는 구역(있으면 저장 시 덮어쓴다) */
  editing: { id?: string; replacesName?: string; officialArea?: number } | null;
  /** 메타 입력 폼이 열려 있는지(완료를 누른 뒤) */
  meta: AdminMetaForm | null;
  /** 안내·결과 문구 */
  message: string | null;
  /** 선택된 구역(관리자 구역 id) */
  selectedCustomId?: string;
  /** 선택된 구역(공식·대표)의 이름 — 경계 수정 대상 안내 */
  selectedZoneName?: string;
  /** 선택된 구역에 경계 도형이 있는지 */
  canEditSelectedRing: boolean;
  onStartNew: () => void;
  onStartEditSelected: () => void;
  onUndo: () => void;
  onFinish: () => void;
  onCancel: () => void;
  onCancelMeta: () => void;
  onMetaChange: (patch: Partial<AdminMetaForm>) => void;
  onSave: () => void;
  onSelectCustom: (id: string) => void;
  onEditCustomGeometry: (id: string) => void;
  onDeleteCustom: (id: string) => void;
  onExportDownload: () => void;
  onExportCopy: () => void;
  onExit: () => void;
};

const BTN =
  "rounded-lg border px-2.5 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40";
const BTN_DARK = `${BTN} border-slate-800 bg-slate-900 text-white hover:bg-slate-800`;
const BTN_LIGHT = `${BTN} border-slate-300 bg-white text-slate-700 hover:border-slate-500 hover:text-slate-900`;

/**
 * 지도 위 도구 막대 버튼 — 포인터·마우스·클릭이 지도까지 올라가 꼭짓점이 찍히지 않게 막는다.
 * (지도는 DOM 리스너로 click/dblclick/contextmenu 를 받으므로 버튼에서 끊어 둔다)
 */
const guardProps = {
  onPointerDown: (e: ReactPointerEvent) => e.stopPropagation(),
  onMouseDown: (e: ReactMouseEvent) => e.stopPropagation(),
  onContextMenu: (e: ReactMouseEvent) => e.stopPropagation(),
} as const;

export function AdminZonePanel(props: AdminPanelProps) {
  const {
    zones,
    draftPoints,
    adding,
    editing,
    meta,
    message,
    selectedCustomId,
    selectedZoneName,
    canEditSelectedRing,
  } = props;

  const draftArea = draftPoints && draftPoints.length >= 3 ? areaOf(draftPoints) : 0;
  const listId = useId();
  // 서울시 단계 이름이 목록에 없어도(예: '사업시행인가' 개편 전 이름) 그 값이 그대로 보이게
  const stageOptions = meta && !(CUSTOM_ZONE_STAGES as readonly string[]).includes(meta.stage)
    ? [...CUSTOM_ZONE_STAGES, meta.stage]
    : [...CUSTOM_ZONE_STAGES];

  return (
    <div
      data-testid="admin-panel"
      className="pointer-events-auto max-h-[calc(100dvh-140px)] overflow-y-auto rounded-2xl border-2 border-sky-500/70 bg-white/97 p-3 shadow-xl backdrop-blur"
    >
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-sky-600 px-1.5 py-0.5 text-[10px] font-bold text-white">관리자</span>
        <b className="text-xs font-bold text-slate-900">구역 경계 그리기·수정</b>
        <button
          type="button"
          data-testid="admin-exit"
          onClick={() => props.onExit()}
          title="관리자 모드를 끄면 이 브라우저에서 다시 열기 전까지 일반 화면으로 돌아갑니다"
          className="ml-auto shrink-0 rounded-lg border border-slate-300 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 hover:border-slate-500 hover:text-slate-800"
        >
          관리자 모드 종료 ✕
        </button>
      </div>

      <p className="mt-1 text-[10px] leading-snug text-slate-500">
        지도에서 직접 그린 구역은 <b className="text-slate-700">이 브라우저에만</b> 저장됩니다. 마음에 들면
        JSON으로 내려받아 대표 데이터에 병합하세요.
      </p>

      {/* ── 시작 버튼 ─────────────────────────────────────────────── */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          data-testid="admin-start-draw"
          onClick={props.onStartNew}
          className={draftPoints ? BTN_LIGHT : BTN_DARK}
        >
          ✏ 새 구역 그리기
        </button>
        <button
          type="button"
          data-testid="admin-edit-selected"
          onClick={props.onStartEditSelected}
          disabled={!canEditSelectedRing}
          title={
            canEditSelectedRing
              ? "지금 선택한 구역의 경계를 핸들로 고칩니다"
              : "먼저 지도나 검색에서 경계가 있는 구역을 선택하세요"
          }
          className={BTN_LIGHT}
        >
          경계 수정{selectedZoneName ? ` · ${selectedZoneName}` : ""}
        </button>
      </div>

      {/* ── 진행 중인 초안 ─────────────────────────────────────────── */}
      {draftPoints && (
        <div className="mt-2 rounded-xl border border-sky-200 bg-sky-50/70 p-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-bold text-sky-900">
              {editing?.id || editing?.replacesName ? "경계 수정 중" : "그리는 중"}
            </span>
            <span className="shrink-0 text-[10px] font-semibold text-sky-700">
              꼭짓점 {draftPoints.length}개
            </span>
          </div>
          <p
            data-testid="admin-draft-area"
            className="mt-0.5 text-sm font-extrabold tabular-nums text-sky-950"
          >
            {draftPoints.length >= 3 ? formatArea(draftArea) : "면적 —"}
          </p>
          {editing?.officialArea ? (
            <p className="mt-0.5 text-[10px] text-sky-800/80">
              고시면적 {Math.round(editing.officialArea).toLocaleString()}㎡
              {draftPoints.length >= 3 && (
                <span className="ml-1">
                  (차이 {signed(draftArea - editing.officialArea)})
                </span>
              )}
            </p>
          ) : null}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <button
              type="button"
              data-testid="admin-undo"
              onClick={props.onUndo}
              disabled={draftPoints.length === 0}
              className={BTN_LIGHT}
            >
              ↶ 실행취소
            </button>
            <button
              type="button"
              data-testid="admin-finish"
              onClick={props.onFinish}
              disabled={draftPoints.length < 3 || !!meta}
              title="그리기 완료 (지도에서 더블클릭·우클릭·Enter 도 같다)"
              className={BTN_DARK}
            >
              ✓ 완료
            </button>
            <button type="button" data-testid="admin-cancel" onClick={props.onCancel} className={BTN_LIGHT}>
              취소
            </button>
          </div>
          <p className="mt-1 text-[10px] leading-snug text-sky-900/80">
            {adding
              ? "지도 탭: 점 추가 · 더블클릭/우클릭/Enter: 완료(그 자리에서) · Esc: 취소"
              : "꼭짓점 핸들을 끌어 옮기고, 변 가운데 + 로 점을 추가하세요."}{" "}
            점의 ✕ 배지(또는 우클릭)로 삭제합니다.
          </p>
        </div>
      )}

      {/* ── 메타 정보 입력 ─────────────────────────────────────────── */}
      {meta && (
        <div data-testid="admin-meta-form" className="mt-2 rounded-xl border border-slate-300 bg-white p-2">
          <p className="text-[11px] font-bold text-slate-800">구역 정보 입력</p>
          <label className="mt-1.5 block text-[10px] font-semibold text-slate-500">
            구역명 <span className="text-rose-500">*</span>
            <input
              data-testid="admin-zone-name"
              value={meta.name}
              onChange={(e) => props.onMetaChange({ name: e.target.value })}
              placeholder="예: 신림11구역"
              className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-900 focus:border-sky-500 focus:outline-none"
            />
          </label>
          {/* 사업유형 — ‘민간도심복합(성장거점형)’처럼 이름이 길어 반폭 칸에서는 잘린다. 한 줄 전체를 쓴다. */}
          <label className="mt-1.5 block text-[10px] font-semibold text-slate-500">
            사업유형
            <select
              data-testid="admin-zone-type"
              value={meta.type}
              onChange={(e) => props.onMetaChange({ type: e.target.value as CustomZoneType })}
              className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-1.5 py-1 text-xs font-medium text-slate-900 focus:border-sky-500 focus:outline-none"
            >
              {CUSTOM_ZONE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <label className="block text-[10px] font-semibold text-slate-500">
              추진단계
              <select
                data-testid="admin-zone-stage"
                value={meta.stage}
                onChange={(e) => props.onMetaChange({ stage: e.target.value })}
                className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-1.5 py-1 text-xs font-medium text-slate-900 focus:border-sky-500 focus:outline-none"
              >
                {stageOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[10px] font-semibold text-slate-500">
              자치구
              <input
                data-testid="admin-zone-gu"
                list={`${listId}-gu`}
                value={meta.gu}
                onChange={(e) => props.onMetaChange({ gu: e.target.value })}
                placeholder="예: 관악구"
                className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-900 focus:border-sky-500 focus:outline-none"
              />
              <datalist id={`${listId}-gu`}>
                {SEOUL_GU.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </label>
          </div>
          <label className="mt-1.5 block text-[10px] font-semibold text-slate-500">
            비고
            <textarea
              data-testid="admin-zone-note"
              value={meta.note}
              onChange={(e) => props.onMetaChange({ note: e.target.value })}
              rows={2}
              placeholder="근거 도면·공고 번호·확인 사항"
              className="mt-0.5 w-full resize-y rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
            />
          </label>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <button type="button" data-testid="admin-save" onClick={props.onSave} className={BTN_DARK}>
              저장
            </button>
            <button type="button" data-testid="admin-cancel-meta" onClick={props.onCancelMeta} className={BTN_LIGHT}>
              취소
            </button>
          </div>
        </div>
      )}

      {message && (
        <p
          data-testid="admin-message"
          className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-medium leading-snug text-amber-900"
        >
          {message}
        </p>
      )}

      {/* ── 저장된 관리자 구역 ─────────────────────────────────────── */}
      <div className="mt-2.5 border-t border-slate-200 pt-2">
        <p className="flex items-baseline gap-1.5 text-[11px] font-bold text-slate-700">
          내가 그린 구역 <span className="font-normal text-slate-400">{zones.length}곳</span>
        </p>
        {zones.length === 0 ? (
          <p className="mt-1 rounded-lg border border-dashed border-slate-300 px-2 py-3 text-center text-[10px] text-slate-400">
            아직 없습니다. ‘새 구역 그리기’로 시작하세요.
          </p>
        ) : (
          <ul className="mt-1 space-y-1">
            {zones.map((z) => (
              <li
                key={z.id}
                data-testid="admin-zone-item"
                className={
                  "rounded-lg border px-2 py-1.5 " +
                  (selectedCustomId === z.id ? "border-sky-500 bg-sky-50" : "border-slate-200 bg-white")
                }
              >
                <button
                  type="button"
                  onClick={() => props.onSelectCustom(z.id)}
                  className="block w-full text-left"
                  title="지도에서 이 구역으로 이동합니다"
                >
                  <span className="flex items-baseline gap-1">
                    <span className="truncate text-[11px] font-bold text-slate-900">{z.name}</span>
                    <span className="ml-auto shrink-0 text-[9px] text-slate-500">
                      {z.type} · {z.stage}
                    </span>
                  </span>
                  <span className="mt-0.5 flex items-baseline gap-1 text-[10px] text-slate-500">
                    <span>{formatArea(z.areaSqm)}</span>
                    {z.gu && <span className="ml-auto shrink-0">{z.gu}</span>}
                  </span>
                  {z.replacesName && (
                    <span className="mt-0.5 block truncate text-[9px] font-semibold text-emerald-700">
                      {z.replacesName} 경계 보정
                    </span>
                  )}
                </button>
                <div className="mt-1 flex gap-1">
                  <button
                    type="button"
                    onClick={() => props.onEditCustomGeometry(z.id)}
                    className="rounded border border-slate-300 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600 hover:border-slate-500 hover:text-slate-900"
                  >
                    경계 수정
                  </button>
                  <button
                    type="button"
                    data-testid="admin-delete-zone"
                    onClick={() => props.onDeleteCustom(z.id)}
                    className="rounded border border-rose-200 px-1.5 py-0.5 text-[9px] font-semibold text-rose-600 hover:border-rose-400 hover:bg-rose-50"
                  >
                    삭제
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── 내보내기 ───────────────────────────────────────────────── */}
      <div className="mt-2 flex flex-wrap gap-1.5 border-t border-slate-200 pt-2">
        <button
          type="button"
          data-testid="admin-export-json"
          onClick={props.onExportDownload}
          disabled={zones.length === 0}
          className={BTN_LIGHT}
        >
          ⤓ JSON 다운로드
        </button>
        <button
          type="button"
          data-testid="admin-export-copy"
          onClick={props.onExportCopy}
          disabled={zones.length === 0}
          className={BTN_LIGHT}
        >
          ⧉ 클립보드 복사
        </button>
      </div>
      <p className="mt-1 text-[9px] leading-snug text-slate-400">
        GeoJSON FeatureCollection — zones.geojson 의 feature 모양과 official-*.json 의 [위도, 경도] 링을 함께
        담습니다.
      </p>
    </div>
  );
}

/** 지도 위 도구 막대 — 꼭짓점을 찍는 동안 손 가까이에 둔다(데스크톱·아이패드 가로) */
export function AdminDrawToolbar(props: AdminPanelProps) {
  const { draftPoints, adding, editing } = props;
  if (!draftPoints) return null;
  const area = draftPoints.length >= 3 ? areaOf(draftPoints) : 0;
  return (
    <div
      data-testid="admin-toolbar"
      className="pointer-events-auto flex items-center gap-1 rounded-full border border-sky-300 bg-white/95 px-1.5 py-1 shadow-xl backdrop-blur"
    >
      <span className="ml-0.5 hidden text-[10px] font-bold text-sky-800 lg:inline">
        {editing?.id || editing?.replacesName ? "경계 수정" : "그리기"}
      </span>
      <span className="text-[10px] font-semibold text-slate-600">{draftPoints.length}점</span>
      <span
        data-testid="admin-toolbar-area"
        className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-extrabold tabular-nums text-sky-950"
      >
        {draftPoints.length >= 3 ? formatArea(area) : "면적 —"}
      </span>
      <button
        type="button"
        {...guardProps}
        onClick={(e) => {
          e.stopPropagation();
          props.onUndo();
        }}
        disabled={draftPoints.length === 0}
        aria-label="실행취소 — 마지막 점 삭제"
        title="실행취소 — 마지막 점 삭제"
        className="rounded-full border border-slate-300 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700 hover:border-slate-500 disabled:opacity-40"
      >
        ↶
      </button>
      <button
        type="button"
        {...guardProps}
        data-testid="admin-toolbar-finish"
        onClick={(e) => {
          e.stopPropagation();
          props.onFinish();
        }}
        disabled={draftPoints.length < 3 || !!props.meta}
        title="그리기 완료 — 구역 정보 입력으로 (지도에서 더블클릭·우클릭·Enter 도 같다)"
        className="rounded-full bg-slate-900 px-2.5 py-0.5 text-[11px] font-bold text-white hover:bg-slate-800 disabled:opacity-40"
      >
        ✓ 완료
      </button>
      <button
        type="button"
        {...guardProps}
        onClick={(e) => {
          e.stopPropagation();
          props.onCancel();
        }}
        aria-label="취소"
        title="그리기 취소 (Esc)"
        className="rounded-full border border-slate-300 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 hover:border-slate-500"
      >
        ✕
      </button>
      <span className="mr-1 text-[10px] text-slate-500">
        {adding ? "지도 탭: 점 추가 · 더블클릭/우클릭/Enter: 완료" : "핸들을 끌어 옮기기 · 변 +: 점 추가"}
      </span>
    </div>
  );
}

/** 면적 — lib 의 계산을 그대로 쓴다(패널·막대가 같은 값을 보이도록) */
function areaOf(ring: [number, number][]): number {
  return ringAreaSqm(ring);
}

function signed(diff: number): string {
  const pct = diff >= 0 ? "+" : "−";
  return `${pct}${Math.abs(Math.round(diff)).toLocaleString()}㎡`;
}
