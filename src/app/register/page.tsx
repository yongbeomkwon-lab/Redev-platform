"use client";
// ─────────────────────────────────────────────────────────────────────────────
// 중개사 매물 등록 (유료 모델)
// 1) 요금제 선택(단건 9만원 / 월 무제한 29만원) → 2) 매물 정보 입력
//    → 초기투자금 자동 계산 → 3) 모의 결제 → 등록 완료
// 실서비스: Supabase listings 테이블 INSERT + 결제위젯 연동 (README 참고)
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from "react";
import type { BrokerPlan, Listing } from "@/lib/types";
import { BROKER_PLANS, calcInitialInvestment } from "@/lib/types";
import { ZONES } from "@/data/sample";
import { formatMan } from "@/lib/format";
import { Badge, TypeBadge } from "@/components/Badges";

type Step = "plan" | "form" | "pay" | "done";

export default function RegisterPage() {
  const [step, setStep] = useState<Step>("plan");
  const [plan, setPlan] = useState<BrokerPlan | null>(null);
  const [paid, setPaid] = useState(false);
  const [zoneId, setZoneId] = useState(ZONES[0].id);
  const [unitType, setUnitType] = useState("84D");
  const [salePrice, setSalePrice] = useState("");
  const [appraised, setAppraised] = useState("");
  const [transferIncluded, setTransferIncluded] = useState(false);
  const [transferFee, setTransferFee] = useState("");
  const [expectedJeonse, setExpectedJeonse] = useState("");
  const [expectedAdditional, setExpectedAdditional] = useState("");
  const [brokerName, setBrokerName] = useState("");
  const [brokerAgency, setBrokerAgency] = useState("");
  const [brokerPhone, setBrokerPhone] = useState("");
  const [brokerLicense, setBrokerLicense] = useState("");

  const zone = ZONES.find((z) => z.id === zoneId) ?? ZONES[0];
  const draft: Listing = {
    id: "",
    zoneId,
    brokerName,
    brokerAgency,
    brokerPhone,
    brokerLicense,
    unitType,
    salePrice: Number(salePrice) || 0,
    appraisedValue: Number(appraised) || 0,
    transferFeeIncluded: transferIncluded,
    transferFee: Number(transferFee) || 0,
    expectedJeonse: Number(expectedJeonse) || 0,
    expectedAdditionalCost: Number(expectedAdditional) || 0,
    verified: plan?.id === "monthly",
    createdAt: "",
  };
  const initialInvestment = useMemo(() => calcInitialInvestment(draft), [draft]);

  const formValid =
    salePrice && appraised && brokerName && brokerAgency && brokerPhone && brokerLicense;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">중개사 매물 등록</h1>
        <p className="text-sm text-slate-600">
          재개발 실무 필드(불하금·감정평가액·프리미엄·초기투자금 자동계산)를 그대로 입력합니다.
        </p>
      </div>

      {/* 진행 표시 */}
      <ol className="flex flex-wrap items-center gap-2 text-xs font-semibold">
        {["요금제 선택", "매물 정보", "결제", "완료"].map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <span
              className={
                "flex h-6 w-6 items-center justify-center rounded-full " +
                (["plan", "form", "pay", "done"][i] === step ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500")
              }
            >
              {i + 1}
            </span>
            {label}
            {i < 3 && <span className="w-6 border-t border-slate-300" />}
          </li>
        ))}
      </ol>

      {/* 1. 요금제 */}
      {step === "plan" && (
        <div className="grid gap-4 sm:grid-cols-2">
          {BROKER_PLANS.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setPlan(p);
                setStep("form");
              }}
              className={
                "rounded-2xl border p-5 text-left transition hover:border-blue-500 " +
                (plan?.id === p.id ? "border-blue-500 ring-1 ring-blue-400" : "border-slate-200 bg-white")
              }
            >
              <div className="mb-1 flex items-center justify-between">
                <h2 className="font-bold">{p.name}</h2>
                <span className="text-lg font-extrabold text-blue-700">{formatMan(p.price)}</span>
              </div>
              <p className="mb-3 text-sm text-slate-500">{p.description}</p>
              <ul className="space-y-1 text-sm text-slate-600">
                {p.features.map((f) => (
                  <li key={f}>· {f}</li>
                ))}
              </ul>
            </button>
          ))}
        </div>
      )}

      {/* 2. 매물 정보 */}
      {step === "form" && plan && (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm">
            <Badge tone="blue">{plan.name}</Badge> 선택됨 · {formatMan(plan.price)}
            <button className="ml-auto text-xs text-blue-700 underline" onClick={() => setStep("plan")}>
              변경
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="구역 선택">
              <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} className="input">
                {ZONES.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name} ({z.district})
                  </option>
                ))}
              </select>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                <TypeBadge type={zone.type} />
                {zone.stage} · {zone.residenceRequired ? "실거주 의무" : "실거주 무관"}
                {zone.toehoApplied && <Badge tone="purple">토허제</Badge>}
              </div>
            </Field>
            <Field label="희망 타입 (예: 84D, 59A)">
              <input value={unitType} onChange={(e) => setUnitType(e.target.value)} className="input" />
            </Field>
            <Field label="매매가 (만원)">
              <input
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value.replace(/\D/g, ""))}
                className="input"
                placeholder="63500"
              />
            </Field>
            <Field label="감정평가액 (만원)">
              <input
                value={appraised}
                onChange={(e) => setAppraised(e.target.value.replace(/\D/g, ""))}
                className="input"
                placeholder="58000"
              />
            </Field>
            <Field label="프리미엄 (만원, 자동)">
              <input
                disabled
                value={salePrice && appraised ? String(Math.max(0, Number(salePrice) - Number(appraised))) : ""}
                className="input bg-slate-100"
              />
            </Field>
            <Field label="불하금 포함 여부">
              <label className="flex h-10 items-center gap-2 text-sm">
                <input type="checkbox" checked={transferIncluded} onChange={(e) => setTransferIncluded(e.target.checked)} />
                불하금 포함
              </label>
            </Field>
            {transferIncluded && (
              <Field label="불하금 (만원)">
                <input
                  value={transferFee}
                  onChange={(e) => setTransferFee(e.target.value.replace(/\D/g, ""))}
                  className="input"
                  placeholder="3000"
                />
              </Field>
            )}
            <Field label="예상 전세 보증금 회수액 (만원)">
              <input
                value={expectedJeonse}
                onChange={(e) => setExpectedJeonse(e.target.value.replace(/\D/g, ""))}
                className="input"
                placeholder="30000"
              />
            </Field>
            <Field label="예상 추가분담금 (만원)">
              <input
                value={expectedAdditional}
                onChange={(e) => setExpectedAdditional(e.target.value.replace(/\D/g, ""))}
                className="input"
                placeholder="8500"
              />
            </Field>
            <Field label="중개사명">
              <input value={brokerName} onChange={(e) => setBrokerName(e.target.value)} className="input" />
            </Field>
            <Field label="중개사무소">
              <input value={brokerAgency} onChange={(e) => setBrokerAgency(e.target.value)} className="input" />
            </Field>
            <Field label="직통 연락처">
              <input value={brokerPhone} onChange={(e) => setBrokerPhone(e.target.value)} className="input" placeholder="010-0000-0000" />
            </Field>
            <Field label="개설등록번호">
              <input value={brokerLicense} onChange={(e) => setBrokerLicense(e.target.value)} className="input" placeholder="서울관악-00000" />
            </Field>
          </div>

          <div className="rounded-xl bg-slate-900 p-4 text-white">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-300">초기투자금 (자동 계산: 매매가 + 불하금 + 부대비용 2%)</span>
              <b className="text-lg text-amber-300">{formatMan(initialInvestment)}</b>
            </div>
          </div>

          <button
            disabled={!formValid}
            onClick={() => setStep("pay")}
            className="w-full rounded-lg bg-blue-600 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {formValid ? plan.name + " 결제하기 — " + formatMan(plan.price) : "필수 정보를 입력하세요"}
          </button>
        </div>
      )}

      {/* 3. 결제 */}
      {step === "pay" && plan && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h2 className="mb-1 text-lg font-bold">결제 확인</h2>
          <p className="mb-4 text-sm text-slate-600">
            {plan.name} · {formatMan(plan.price)} — MVP 모의 결제입니다.
          </p>
          <div className="mb-4 rounded-xl bg-slate-50 p-4 text-left text-sm">
            <p><b>{zone.name}</b> · {unitType}</p>
            <p className="text-slate-600">
              매매가 {formatMan(Number(salePrice))} · 초기투자금 <b>{formatMan(initialInvestment)}</b>
            </p>
          </div>
          <button
            onClick={() => {
              setPaid(true);
              setStep("done");
            }}
            className="rounded-lg bg-blue-600 px-6 py-2.5 font-semibold text-white hover:bg-blue-700"
          >
            결제하기 (모의)
          </button>
        </div>
      )}

      {/* 4. 완료 */}
      {step === "done" && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
          <div className="mb-2 text-4xl">✅</div>
          <h2 className="mb-1 text-lg font-bold text-emerald-800">등록 완료</h2>
          <p className="text-sm text-emerald-700">
            {paid ? "결제가 확인되어 " : ""}{zone.name} 구역 페이지에 매물이 게시되었습니다.
            <br />
            (MVP 데모 — 실서비스에서 Supabase listings 테이블에 저장됩니다)
          </p>
        </div>
      )}

      <style jsx global>{`
        .input {
          width: 100%;
          height: 2.5rem;
          border-radius: 0.5rem;
          border: 1px solid rgb(203 213 225);
          padding: 0 0.75rem;
          font-size: 0.875rem;
          background: white;
        }
        .input:focus {
          outline: 2px solid rgb(37 99 235 / 0.4);
          border-color: rgb(37 99 235);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}
