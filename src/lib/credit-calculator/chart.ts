import type { ScheduleRow } from "./types";
import { formatShort } from "./format";

const CHART_HEIGHT = 200;
const CHART_BAR_W = 12;
const CHART_BAR_GAP = 3;
const CHART_MAX_BARS = 24;

const COLORS = {
  principal: "#059669",
  interest: "#ea580c",
  deferred: "#d97706",
};

function maxPayment(sampled: ScheduleRow[]): number {
  let maxPay = 1;
  for (const row of sampled) {
    if (row.payment > maxPay) maxPay = row.payment;
  }
  return maxPay;
}

export function drawBreakdownChart(
  canvas: HTMLCanvasElement | null,
  rows: ScheduleRow[] | undefined,
  visible: boolean
): void {
  if (!canvas || !rows?.length || !visible) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const wrap = canvas.parentElement;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const step = Math.max(1, Math.ceil(rows.length / CHART_MAX_BARS));
  const sampled = rows.filter((_, i) => i % step === 0 || i === rows.length - 1);
  if (!sampled.length) return;

  const maxPay = maxPayment(sampled);
  const n = sampled.length;
  const pad = { top: 14, right: 12, bottom: 26, left: 46 };
  const plotW = n * CHART_BAR_W + Math.max(0, n - 1) * CHART_BAR_GAP;
  const containerW = wrap && wrap.clientWidth > 0 ? wrap.clientWidth : 600;
  const w = Math.max(pad.left + pad.right + plotW, containerW);
  const h = CHART_HEIGHT;
  const chartH = h - pad.top - pad.bottom;
  const plotLeft = pad.left + Math.max(0, (w - pad.left - pad.right - plotW) / 2);
  const plotRight = plotLeft + plotW;

  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  if (w < 50 || h < 50) return;

  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  ctx.strokeStyle = "#e5e7eb";
  ctx.fillStyle = "#6b7280";
  ctx.font = "10px var(--font-geist-sans), system-ui, sans-serif";

  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (chartH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(plotLeft, y);
    ctx.lineTo(plotRight, y);
    ctx.stroke();
    ctx.textAlign = "right";
    ctx.fillText(formatShort(maxPay * (1 - i / 4)), plotLeft - 5, y + 3);
  }

  const labelEvery = n <= 12 ? 1 : Math.ceil(n / 12);
  sampled.forEach((row, i) => {
    const x = plotLeft + i * (CHART_BAR_W + CHART_BAR_GAP);
    const totalH = (row.payment / maxPay) * chartH;
    const principalH = (row.principal / maxPay) * chartH;
    const deferAmt = row.deferred || 0;
    const pureInterest = Math.max(0, row.interest - deferAmt);
    const pureInterestH = (pureInterest / maxPay) * chartH;
    const deferredH = (deferAmt / maxPay) * chartH;

    ctx.fillStyle = COLORS.principal;
    ctx.fillRect(x, pad.top + chartH - principalH, CHART_BAR_W, principalH);
    ctx.fillStyle = COLORS.interest;
    ctx.fillRect(x, pad.top + chartH - principalH - pureInterestH, CHART_BAR_W, pureInterestH);
    if (deferredH > 0.5) {
      ctx.fillStyle = COLORS.deferred;
      ctx.fillRect(x, pad.top + chartH - totalH, CHART_BAR_W, deferredH);
    }
    if (i % labelEvery === 0 || i === n - 1) {
      ctx.textAlign = "center";
      ctx.font = "9px var(--font-geist-sans), system-ui, sans-serif";
      ctx.fillStyle = "#6b7280";
      ctx.fillText(String(row.month), x + CHART_BAR_W / 2, h - 6);
    }
  });

  ctx.textAlign = "left";
  ctx.font = "10px var(--font-geist-sans), system-ui, sans-serif";
  ctx.fillStyle = "#6b7280";
  ctx.fillText("₸", 6, pad.top + 8);
}
