// ─────────────────────────────────────────────────────────────────────────────
// trade-card — 실거래 1건을 카톡·문자로 바로 보낼 수 있는 카드 PNG 로 그린다
//
//  · 외부 라이브러리 없이 HTML5 Canvas 2D 로만 그린다(서버 의존성·폰트 다운로드 없음).
//  · 2배 해상도(Retina)로 그려서 카톡에 붙여도 글씨가 뭉개지지 않는다.
//  · 구성은 첨부 시안(래미안 옥수 리버젠 카드) 그대로 —
//      왼쪽 빨간 세로선 · 흰 카드 · 제목 + 🔥평형신고가 배지 · 큰 빨간 금액 + 직전대비 배지
//      · 면적/층/계약일 한 줄 · 4칸 지표(최고가대비·3개월건수·평형최고·평당가)
//      · 하단 실거래 추이 미니 차트 · 맨 아래 출처 워터마크
// ─────────────────────────────────────────────────────────────────────────────

export type TradeCardStat = { label: string; value: string; tone?: "red" | "violet" | "slate" };

export type TradeCardData = {
  /** 단지·건물명 (카드 제목) */
  name: string;
  /** 제목 아래 첫 줄 — 준공연차·동·지번 등 */
  subline: string;
  /** 큰 금액 — main("32억") + sub("5,000만") */
  price: { main: string; sub: string };
  /** 직전 거래 대비 증감 문구 ("3억 5,000만") — 없으면 null */
  delta: string | null;
  /** 증감 방향 (true = 상승) */
  up: boolean;
  /** 금액 아래 한 줄 — "113.52m² 44평 · 14층 중개거래 · 26.11.03 계약" */
  meta: string;
  /** 오른쪽 위 배지 — "🔥 평형신고가" / "신고가 대비 96%" */
  badge: string;
  /** 배지를 빨갛게(신고가) 칠할지 */
  hot: boolean;
  /** 지표 4칸 */
  stats: TradeCardStat[];
  /** 추이 차트 시계열 (만원) — 오래된 순 */
  series: { t: number; v: number }[];
  /** 차트 위 작은 제목 ("최근 3년") */
  chartTitle: string;
  /** 차트 아래 왼쪽/오른쪽 문구 (기간·총건수) */
  chartFooter: string;
  /** 맨 아래 워터마크 */
  watermark: string;
  /** 워터마크 오른쪽(사이트 주소·기준일) */
  watermarkRight: string;
};

export const CARD_W = 760;
export const CARD_H = 1040;

const RED = "#c9302c";
const RED_SOFT = "#fdecec";
const INK = "#0f172a";
const MUTED = "#64748b";
const LINE = "#e8edf2";
const VIOLET = "#6d28d9";
const FONT =
  '"Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", system-ui, sans-serif';

/** 만원 → "32억 5,000만" 형태의 두 조각 (큰 글씨에서 '억'은 크게, 나머지는 작게) */
export function splitEokWon(man: number): { main: string; sub: string } {
  if (!Number.isFinite(man) || man <= 0) return { main: "-", sub: "" };
  if (man >= 10000) {
    const eok = Math.floor(man / 10000);
    const rest = man - eok * 10000;
    const manPart = Math.round(rest / 10) * 10; // 10만원 단위
    if (manPart >= 10000) {
      // 반올림으로 1억이 넘어간 경우
      return { main: `${eok + 1}억`, sub: "" };
    }
    return { main: `${eok}억`, sub: manPart > 0 ? `${manPart.toLocaleString()}만` : "" };
  }
  return { main: `${Math.round(man).toLocaleString()}만`, sub: "" };
}

/** "▲3억 5,000만" 처럼 증감을 짧게 */
export function deltaEokWon(man: number): string {
  const { main, sub } = splitEokWon(Math.abs(man));
  return `${main}${sub ? " " + sub : ""}`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function font(ctx: CanvasRenderingContext2D, weight: number, size: number) {
  ctx.font = `${weight} ${size}px ${FONT}`;
}

/** 넘치는 글자는 …로 자른다 (카드 폭이 고정이라 제목이 길면 반드시 잘라야 한다) */
function fit(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(text.slice(0, mid) + "…").width <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + "…";
}

/** 카드 한 장을 ctx 에 그린다 (좌표는 논리 픽셀 기준) */
export function drawTradeCard(ctx: CanvasRenderingContext2D, d: TradeCardData) {
  const W = CARD_W;
  const H = CARD_H;
  const PAD = 40;
  const left = PAD + 14; // 빨간 세로선 오른쪽
  const right = W - PAD;
  const innerW = right - left;

  ctx.save();
  ctx.textBaseline = "alphabetic";

  // ── 카드 바탕 ────────────────────────────────────────────────────────────
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, 4, 18, W - 8, H - 36, 26);
  ctx.shadowColor = "rgba(15,23,42,0.10)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.5;
  roundRect(ctx, 4, 18, W - 8, H - 36, 26);
  ctx.stroke();

  // 왼쪽 빨간 세로선
  ctx.fillStyle = RED;
  roundRect(ctx, 20, 44, 9, H - 44 - 56, 5);
  ctx.fill();

  // ── 제목 + 배지 ─────────────────────────────────────────────────────────
  font(ctx, 800, 40);
  ctx.fillStyle = INK;
  const badgePadX = 20;
  font(ctx, 700, 24);
  const badgeW = ctx.measureText(d.badge).width + badgePadX * 2;
  const badgeH = 52;
  const badgeX = right - badgeW;
  const badgeY = 46;

  font(ctx, 800, 40);
  ctx.fillStyle = INK;
  const titleMax = badgeX - left - 22;
  ctx.fillText(fit(ctx, d.name, titleMax), left, 92);

  // 배지
  ctx.fillStyle = d.hot ? RED : "#eef2f7";
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 14);
  ctx.fill();
  font(ctx, 800, 24);
  ctx.fillStyle = d.hot ? "#ffffff" : "#334155";
  ctx.textAlign = "center";
  ctx.fillText(d.badge, badgeX + badgeW / 2, badgeY + 35);
  ctx.textAlign = "left";

  // ── 부제(준공·위치) ─────────────────────────────────────────────────────
  font(ctx, 500, 25);
  ctx.fillStyle = MUTED;
  const subLines = wrap(ctx, d.subline, innerW, 2);
  let y = 150;
  for (const line of subLines) {
    ctx.fillText(line, left, y);
    y += 34;
  }
  const subEnd = y - 34;

  // ── 큰 금액 + 증감 배지 ─────────────────────────────────────────────────
  const priceTop = subEnd + 86;
  const bigSize = 76;
  font(ctx, 800, bigSize);
  const mainW = ctx.measureText(d.price.main).width;
  ctx.fillStyle = RED;
  ctx.fillText(d.price.main, left, priceTop);
  let cursor = left + mainW + 8;
  if (d.price.sub) {
    font(ctx, 800, Math.round(bigSize * 0.62));
    const subW = ctx.measureText(d.price.sub).width;
    // '억'과 '만' 사이를 살짝 띄운다
    ctx.fillText(d.price.sub, cursor, priceTop);
    cursor += subW + 18;
  }

  if (d.delta) {
    font(ctx, 700, 26);
    const sign = d.up ? "▲ " : "▼ ";
    const label = sign + d.delta;
    const dw = ctx.measureText(label).width + 30;
    const dh = 50;
    const dx = Math.min(cursor + 6, right - dw);
    ctx.fillStyle = d.up ? RED_SOFT : "#eef2f7";
    roundRect(ctx, dx, priceTop - 36, dw, dh, 14);
    ctx.fill();
    font(ctx, 700, 26);
    ctx.fillStyle = d.up ? "#b3261e" : "#334155";
    ctx.fillText(label, dx + 15, priceTop - 1);
  }

  // ── 면적·층·계약일 ──────────────────────────────────────────────────────
  font(ctx, 600, 26);
  ctx.fillStyle = "#1e293b";
  ctx.fillText(fit(ctx, d.meta, innerW), left, priceTop + 52);

  // ── 지표 4칸 (2×2) ─────────────────────────────────────────────────────
  const statTop = priceTop + 106;
  const colW = innerW / 2;
  const rowH = 54;
  d.stats.slice(0, 4).forEach((s, i) => {
    const cx = left + (i % 2) * colW;
    const cy = statTop + Math.floor(i / 2) * rowH;
    font(ctx, 600, 23);
    ctx.fillStyle = MUTED;
    ctx.fillText(s.label, cx, cy);
    const lw = ctx.measureText(s.label).width;
    font(ctx, 800, 27);
    ctx.fillStyle = s.tone === "red" ? RED : s.tone === "violet" ? VIOLET : INK;
    ctx.fillText(fit(ctx, s.value, colW - lw - 24), cx + lw + 12, cy);
  });

  // ── 추이 차트 ───────────────────────────────────────────────────────────
  const chartX = left;
  const chartY = statTop + rowH * 2 + 16;
  const chartW = innerW;
  const chartH = H - 128 - chartY;

  ctx.fillStyle = "#fbfcfe";
  roundRect(ctx, chartX, chartY, chartW, chartH, 18);
  ctx.fill();
  ctx.strokeStyle = "#eef2f7";
  ctx.lineWidth = 1;
  roundRect(ctx, chartX, chartY, chartW, chartH, 18);
  ctx.stroke();

  font(ctx, 700, 20);
  ctx.fillStyle = "#94a3b8";
  ctx.fillText(d.chartTitle, chartX + 18, chartY + 30);

  drawSeries(ctx, d, chartX + 16, chartY + 46, chartW - 32, chartH - 46 - 44);

  font(ctx, 600, 19);
  ctx.fillStyle = "#94a3b8";
  ctx.fillText(d.chartFooter, chartX + 18, chartY + chartH - 16);

  // ── 워터마크 ────────────────────────────────────────────────────────────
  font(ctx, 700, 19);
  ctx.fillStyle = "#94a3b8";
  ctx.fillText(d.watermark, left, H - 34);
  font(ctx, 500, 18);
  ctx.textAlign = "right";
  ctx.fillStyle = "#b6c1cd";
  ctx.fillText(d.watermarkRight, right, H - 34);
  ctx.textAlign = "left";

  ctx.restore();
}

/** 줄바꿈(최대 n줄) — 마지막 줄은 …로 줄인다 */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width <= maxW) cur = next;
    else {
      if (cur) lines.push(cur);
      cur = w;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (!lines.length) return [];
  // 남은 단어가 있으면 마지막 줄을 자른다
  const used = lines.join(" ");
  if (used.length < text.length) lines[lines.length - 1] = fit(ctx, lines[lines.length - 1] + "…", maxW);
  return lines;
}

/** 실거래 추이 — 매매 선 + 그라데이션 면, 마지막 거래 점과 금액 라벨 */
function drawSeries(
  ctx: CanvasRenderingContext2D,
  d: TradeCardData,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const pts = d.series.filter((p) => Number.isFinite(p.v) && p.v > 0);
  if (pts.length === 0) {
    font(ctx, 600, 22);
    ctx.fillStyle = "#b6c1cd";
    ctx.fillText("표시할 거래 이력이 없습니다", x + 10, y + h / 2);
    return;
  }

  const tMin = pts[0].t;
  const tMax = pts[pts.length - 1].t;
  const vals = pts.map((p) => p.v);
  let vMin = Math.min(...vals);
  let vMax = Math.max(...vals);
  const span = vMax - vMin || Math.max(2000, vMax * 0.15);
  vMin = Math.max(0, vMin - span * 0.18);
  vMax = vMax + span * 0.18;

  const px = (t: number) => x + (tMax === tMin ? w / 2 : ((t - tMin) / (tMax - tMin)) * w);
  const py = (v: number) => y + h - ((v - vMin) / (vMax - vMin || 1)) * h;

  const coords = pts.map((p) => ({ x: px(p.t), y: py(p.v) }));

  // 면 그라데이션
  const grad = ctx.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, "rgba(224,65,63,0.22)");
  grad.addColorStop(1, "rgba(224,65,63,0.02)");
  ctx.beginPath();
  ctx.moveTo(coords[0].x, y + h);
  for (const c of coords) ctx.lineTo(c.x, c.y);
  ctx.lineTo(coords[coords.length - 1].x, y + h);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // 선
  ctx.beginPath();
  ctx.moveTo(coords[0].x, coords[0].y);
  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1];
    const cur = coords[i];
    const mx = (prev.x + cur.x) / 2;
    ctx.bezierCurveTo(mx, prev.y, mx, cur.y, cur.x, cur.y);
  }
  ctx.strokeStyle = "#e0413f";
  ctx.lineWidth = 3.4;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();

  // 마지막 거래 점 + 금액 — 오른쪽 끝에 걸리면 왼쪽으로 밀어 넣는다
  const last = coords[coords.length - 1];
  const lastVal = pts[pts.length - 1].v;
  ctx.beginPath();
  ctx.arc(last.x, last.y, 6, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = 3.2;
  ctx.strokeStyle = "#e0413f";
  ctx.stroke();

  font(ctx, 800, 22);
  ctx.fillStyle = "#c9302c";
  const sp = splitEokWon(lastVal);
  const label = `매매 ${sp.main}${sp.sub ? " " + sp.sub : ""}`;
  const lw = ctx.measureText(label).width;
  const lx = Math.min(x + w - lw, Math.max(x + 4, last.x - lw - 14));
  const ly = Math.max(y + 18, last.y - 16);
  ctx.fillText(label, lx, ly);
}

/** 실제로 그려서 PNG Blob 을 만든다 (Retina 2배) */
export async function renderTradeCardPng(data: TradeCardData): Promise<Blob> {
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W * scale;
  canvas.height = CARD_H * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 를 만들 수 없습니다");
  ctx.scale(scale, scale);
  drawTradeCard(ctx, data);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png")
  );
  if (!blob) throw new Error("PNG 변환에 실패했습니다");
  return blob;
}
