"use client";
// ─────────────────────────────────────────────────────────────────────────────
// WriteForm — 새 글 쓰기 창 (2026-11-22)
//   · 카테고리(자유·질문·정보) + 구역 연결(선택) + 제목 + 내용.
//   · 구역을 연결하면 「구역별 이야기」에도 함께 모이고, 카드에서 그 구역으로 바로 갈 수 있다.
//   · 처음 열 때 구역을 미리 정해 둘 수 있다(지도에서 「이 구역에 글쓰기」로 들어온 경우).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import ZonePicker, { type ZoneRef } from "@/components/community/ZonePicker";
import type { CommunityCategory, CommunityPost } from "@/lib/community";
import { LIMITS } from "@/lib/community";
import { createPost } from "@/lib/community-client";

const CATS: { key: CommunityCategory; label: string; hint: string }[] = [
  { key: "free", label: "자유", hint: "아무 이야기나" },
  { key: "question", label: "질문", hint: "매수·절차·권리" },
  { key: "info", label: "정보", hint: "공고·소식·자료" },
];

export default function WriteForm({
  open,
  onClose,
  presetZone,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  presetZone?: ZoneRef | null;
  onCreated: (post: CommunityPost) => void;
}) {
  const { session, openAuth } = useAuth();
  const [category, setCategory] = useState<CommunityCategory>("free");
  const [zone, setZone] = useState<ZoneRef | null>(presetZone ?? null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [picker, setPicker] = useState(false);

  useEffect(() => {
    if (!open) return;
    setZone(presetZone ?? null);
    setError("");
  }, [open, presetZone]);

  // Esc 로 닫기 — 구역 고르기 창이 떠 있을 때는 그 창만 닫는다
  const pickerOpen = useRef(false);
  pickerOpen.current = picker;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pickerOpen.current) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = async () => {
    if (!session) {
      openAuth("login", "글쓰기는 로그인한 회원만 할 수 있습니다.");
      return;
    }
    const t = title.trim();
    const b = body.trim();
    if (t.length < LIMITS.titleMin) {
      setError("제목을 2자 이상 적어 주세요.");
      return;
    }
    if (b.length < LIMITS.bodyMin) {
      setError("내용을 2자 이상 적어 주세요.");
      return;
    }
    if (busy) return;
    setBusy(true);
    const res = await createPost(
      {
        category: zone && category === "free" ? "zone" : category,
        title: t,
        content: b,
        zoneId: zone?.id ?? null,
        zoneName: zone?.name ?? null,
      },
      session
    );
    setBusy(false);
    if (!res.ok || !res.item) {
      setError(res.message ?? "글을 저장하지 못했습니다.");
      return;
    }
    setTitle("");
    setBody("");
    setCategory("free");
    setZone(null);
    onCreated(res.item);
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[1200] flex items-end justify-center bg-[#0b1725]/45 sm:items-center sm:p-4"
        onClick={onClose}
        role="presentation"
      >
        <div
          className="flex max-h-[92vh] w-full max-w-[560px] flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="새 글 쓰기"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-[15px] font-extrabold tracking-[-0.02em] text-ink">새 글 쓰기</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="rounded-md px-2 py-0.5 text-[18px] leading-none text-slate-400 hover:bg-slate-100"
            >
              ×
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3.5">
            <div>
              <p className="mb-1.5 text-[11px] font-bold text-slate-600">분류</p>
              <div className="flex gap-1.5">
                {CATS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setCategory(c.key)}
                    className={
                      "flex-1 rounded-lg border px-2 py-1.5 text-left transition-colors " +
                      (category === c.key
                        ? "border-brand bg-brand-tint text-brand"
                        : "border-line text-slate-600 hover:border-slate-300")
                    }
                  >
                    <span className="block text-[12.5px] font-bold">{c.label}</span>
                    <span className="block text-[9.5px] font-medium opacity-70">{c.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-bold text-slate-600">구역 연결 (선택)</p>
              {zone ? (
                <div className="flex items-center gap-1.5 rounded-lg border border-brand/30 bg-brand-tint px-2.5 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-brand">
                    📍 {zone.name}
                    {zone.gu ? <span className="ml-1 font-medium text-brand/70">{zone.gu}</span> : null}
                  </span>
                  <button
                    type="button"
                    onClick={() => setZone(null)}
                    className="shrink-0 rounded px-1.5 text-[11px] font-bold text-brand/70 hover:bg-white"
                  >
                    해제
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setPicker(true)}
                  className="w-full rounded-lg border border-dashed border-slate-300 px-3 py-2 text-left text-[12px] font-medium text-slate-500 hover:border-brand hover:text-brand"
                >
                  구역을 고르면 「구역별 이야기」에도 함께 올라갑니다
                </button>
              )}
            </div>

            <label className="block">
              <span className="mb-1 block text-[11px] font-bold text-slate-600">제목</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={LIMITS.titleMax}
                placeholder="예: 신림1구역 30평형 입주권 지금 들어가도 될까요?"
                className="w-full rounded-lg border border-line px-3 py-2 text-[13.5px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-bold text-slate-600">내용</span>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={8}
                maxLength={LIMITS.bodyMax}
                placeholder="상황·물건·궁금한 점을 적어 주세요. 구체적일수록 답이 정확해집니다."
                className="w-full resize-none rounded-lg border border-line px-3 py-2 text-[13px] leading-[1.7] outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
              />
            </label>

            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[11.5px] text-rose-700">{error}</p>}

            <p className="text-[10.5px] leading-relaxed text-slate-400">
              글은 닉네임으로 공개됩니다. 연락처·주민등록번호 같은 개인정보는 적지 마세요.
            </p>
          </div>

          <div className="flex items-center justify-end gap-1.5 border-t border-line px-4 py-2.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-line px-3 py-1.5 text-[12.5px] font-bold text-slate-600"
            >
              취소
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="rounded-lg bg-brand px-4 py-1.5 text-[12.5px] font-bold text-white hover:bg-brand-deep disabled:opacity-60"
            >
              {busy ? "올리는 중…" : "올리기"}
            </button>
          </div>
        </div>
      </div>

      <ZonePicker
        open={picker}
        onClose={() => setPicker(false)}
        onPick={(z) => setZone(z)}
        title="어느 구역 이야기인가요?"
        selectedId={zone?.id ?? null}
      />
    </>
  );
}
