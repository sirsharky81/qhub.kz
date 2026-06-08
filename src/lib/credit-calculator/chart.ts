import type { ScheduleRow } from "./types";
import { formatShort } from "./format";

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

function getLayout(containerW: number, barCount: number) {
  const compact = containerW < 640;
  const h = compact ? 168 : 200;
  const pad = {
    top: compact ? 10 : 14,
    right: compact ? 4 : 12,
    bottom: compact ? 20 : 26,
    left: compact ? 30 : 46,
  };
  const plotAreaW = Math.max(40, containerW - pad.left - pad.right);
  const gap = barCount > 1 ? (compact ? 1 : 3) : 0;
  const minBarW = compact ? 3 : 6;
  const barW = Math.max(minBarW, Math.floor((plotAreaW - gap * (barCount - 1)) / barCount));
  const plotW = barCount * barW + gap * Math.max(0, barCount - 1);
  const plotLeft = pad.left + Math.max(0, (plotAreaW - plotW) / 2);
  const font = compact ? 9 : 10;
  const labelFont = compact ? 8 : 9;

  return { compact, h, pad, barW, gap, plotW, plotLeft, plotRight: plotLeft + plotW, font, labelFont, w: containerW };
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

  const containerW = wrap && wrap.clientWidth > 0 ? wrap.clientWidth : 320;
  const maxPay = maxPayment(sampled);
  const n = sampled.length;
  const layout = getLayout(containerW, n);
  const { h, pad, barW, gap, plotLeft, plotRight, font, labelFont, w } = layout;
  const chartH = h - pad.top - pad.bottom;

  canvas.style.width = "100%";
  canvas.style.height = `${h}px`;
  canvas.style.maxWidth = "100%";
  if (w < 50 || h < 50) return;

  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  ctx.strokeStyle = "#e5e7eb";
  ctx.fillStyle = "#6b7280";
  ctx.font = `${font}px var(--font-geist-sans), system-ui, sans-serif`;

  const gridLines = layout.compact ? 3 : 4;
  for (let i = 0; i <= gridLines; i++) {
    const y = pad.top + (chartH * i) / gridLines;
    ctx.beginPath();
    ctx.moveTo(plotLeft, y);
    ctx.lineTo(plotRight, y);
    ctx.stroke();
    ctx.textAlign = "right";
    ctx.fillText(formatShort(maxPay * (1 - i / gridLines)), plotLeft - 4, y + 3);
  }

  const labelEvery = layout.compact
    ? n <= 8
      ? 1
      : Math.ceil(n / 6)
    : n <= 12
      ? 1
      : Math.ceil(n / 12);

  sampled.forEach((row, i) => {
    const x = plotLeft + i * (barW + gap);
    const totalH = (row.payment / maxPay) * chartH;
    const principalH = (row.principal / maxPay) * chartH;
    const deferAmt = row.deferred || 0;
    const pureInterest = Math.max(0, row.interest - deferAmt);
    const pureInterestH = (pureInterest / maxPay) * chartH;
    const deferredH = (deferAmt / maxPay) * chartH;

    ctx.fillStyle = COLORS.principal;
    ctx.fillRect(x, pad.top + chartH - principalH, barW, principalH);
    ctx.fillStyle = COLORS.interest;
    ctx.fillRect(x, pad.top + chartH - principalH - pureInterestH, barW, pureInterestH);
    if (deferredH > 0.5) {
      ctx.fillStyle = COLORS.deferred;
      ctx.fillRect(x, pad.top + chartH - totalH, barW, deferredH);
    }
    if (i % labelEvery === 0 || i === n - 1) {
      ctx.textAlign = "center";
      ctx.font = `${labelFont}px var(--font-geist-sans), system-ui, sans-serif`;
      ctx.fillStyle = "#6b7280";
      ctx.fillText(String(row.month), x + barW / 2, h - 5);
    }
  });

  ctx.textAlign = "left";
  ctx.font = `${font}px var(--font-geist-sans), system-ui, sans-serif`;
  ctx.fillStyle = "#6b7280";
  ctx.fillText("₸", 4, pad.top + 8);
}
