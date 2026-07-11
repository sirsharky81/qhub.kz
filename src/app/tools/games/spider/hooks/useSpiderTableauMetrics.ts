"use client";

import { useLayoutEffect, useState, type RefObject } from "react";
import { SPIDER_CARD_OFFSET_RATIO } from "../constants";

const CARD_ASPECT = 312 / 223;
const COLUMN_COUNT = 10;
const COLUMN_GAP = 2;
const MIN_CARD_W = 26;
const MAX_CARD_W = 92;
const MIN_CARD_H = 28;
const MIN_OFFSET_RATIO = 0.04;

export interface SpiderTableauMetrics {
  cardW: number;
  cardH: number;
  offset: number;
  offsetRatio: number;
  fitsWidth: boolean;
}

function emptyMetrics(): SpiderTableauMetrics {
  const cardW = 62;
  const cardH = cardW * CARD_ASPECT;
  return {
    cardW,
    cardH,
    offset: cardH * SPIDER_CARD_OFFSET_RATIO,
    offsetRatio: SPIDER_CARD_OFFSET_RATIO,
    fitsWidth: true,
  };
}

export function computeSpiderTableauMetrics(options: {
  availableW: number;
  availableH: number;
  maxColumnDepth: number;
  preferredOffsetRatio: number;
}): SpiderTableauMetrics {
  const { availableW, availableH, maxColumnDepth, preferredOffsetRatio } = options;
  const depth = Math.max(1, maxColumnDepth);
  const horizontalPad = 8;

  const maxCardWFromWidth =
    (Math.max(0, availableW - horizontalPad) - COLUMN_GAP * (COLUMN_COUNT - 1)) / COLUMN_COUNT;

  let cardW = Math.min(MAX_CARD_W, maxCardWFromWidth);
  cardW = Math.max(MIN_CARD_W, cardW);

  let cardH = cardW * CARD_ASPECT;
  let offsetRatio = preferredOffsetRatio;

  if (depth > 1 && availableH > 0) {
    const maxRatioForHeight = Math.max(
      MIN_OFFSET_RATIO,
      (availableH / cardH - 1) / (depth - 1),
    );
    offsetRatio = Math.min(preferredOffsetRatio, maxRatioForHeight);
  }

  let columnHeight = cardH + (depth - 1) * cardH * offsetRatio;

  if (availableH > 0 && columnHeight > availableH) {
    const maxCardH = availableH / (1 + (depth - 1) * offsetRatio);
    cardH = Math.max(MIN_CARD_H, maxCardH);
    cardW = Math.max(MIN_CARD_W, Math.min(maxCardWFromWidth, cardH / CARD_ASPECT));
    cardH = cardW * CARD_ASPECT;
    columnHeight = cardH + (depth - 1) * cardH * offsetRatio;

    if (depth > 1 && columnHeight > availableH) {
      offsetRatio = Math.max(
        MIN_OFFSET_RATIO,
        (availableH / cardH - 1) / (depth - 1),
      );
      columnHeight = cardH + (depth - 1) * cardH * offsetRatio;
    }

    if (columnHeight > availableH && depth > 1) {
      const targetCardH = availableH / (1 + (depth - 1) * offsetRatio);
      cardH = Math.max(MIN_CARD_H, targetCardH);
      cardW = Math.max(MIN_CARD_W, Math.min(maxCardWFromWidth, cardH / CARD_ASPECT));
      cardH = cardW * CARD_ASPECT;
      columnHeight = cardH + (depth - 1) * cardH * offsetRatio;
    }
  }

  const offset = cardH * offsetRatio;
  const fitsWidth = maxCardWFromWidth >= MIN_CARD_W && cardW <= maxCardWFromWidth + 0.5;

  return { cardW, cardH, offset, offsetRatio, fitsWidth };
}

export function useSpiderTableauMetrics(
  hostRef: RefObject<HTMLElement | null>,
  maxColumnDepth: number,
  preferredOffsetRatio: number,
  enabled: boolean,
): SpiderTableauMetrics {
  const [metrics, setMetrics] = useState(emptyMetrics);

  useLayoutEffect(() => {
    if (!enabled) return;

    const host = hostRef.current;
    if (!host) return;

    const update = () => {
      const rect = host.getBoundingClientRect();
      setMetrics(
        computeSpiderTableauMetrics({
          availableW: rect.width,
          availableH: rect.height,
          maxColumnDepth,
          preferredOffsetRatio,
        }),
      );
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(host);

    window.addEventListener("orientationchange", update);
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);

    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", update);
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, [hostRef, maxColumnDepth, preferredOffsetRatio, enabled]);

  return metrics;
}
