"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { QrGenerationResult, QrSettings, QrFormData } from "@/lib/qr-generator/types";
import { buildPayload } from "@/lib/qr-generator/qrUtils";
import { hasSufficientContrast } from "@/lib/qr-generator/contrast";
import { applyLogoOverlay, effectiveErrorCorrection } from "@/lib/qr-generator/logoOverlay";
import { decodeQrFromDataUrl } from "@/lib/qr-generator/qrSelfCheck";

const DEBOUNCE_MS = 200;

export function useQRCode(form: QrFormData, settings: QrSettings) {
  const [result, setResult] = useState<QrGenerationResult>({
    dataUrl: null,
    svg: null,
    payload: "",
    error: null,
    contrastWarning: false,
    decodeOk: null,
    effectiveEcc: settings.errorCorrectionLevel,
  });
  const [generating, setGenerating] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const genIdRef = useRef(0);

  const generate = useCallback(async () => {
    const payload = buildPayload(form);
    const hasLogo = Boolean(settings.logoDataUrl);
    const ecc = effectiveErrorCorrection(settings.errorCorrectionLevel, hasLogo);
    const contrastOk = hasSufficientContrast(settings.foreground, settings.background);

    if (!payload.trim()) {
      setResult({
        dataUrl: null,
        svg: null,
        payload: "",
        error: null,
        contrastWarning: false,
        decodeOk: null,
        effectiveEcc: ecc,
      });
      return;
    }

    const id = ++genIdRef.current;
    setGenerating(true);

    try {
      const QRCode = (await import("qrcode")).default;
      const opts = {
        errorCorrectionLevel: ecc,
        margin: 4,
        width: settings.size,
        color: {
          dark: settings.foreground,
          light: settings.background,
        },
      };

      let dataUrl: string;
      let svg: string;
      try {
        [dataUrl, svg] = await Promise.all([
          QRCode.toDataURL(payload, opts),
          QRCode.toString(payload, { ...opts, type: "svg" }),
        ]);
      } catch (err) {
        if (id !== genIdRef.current) return;
        const msg =
          err instanceof Error && err.message.includes("too long")
            ? "tooLong"
            : "generateFailed";
        setResult({
          dataUrl: null,
          svg: null,
          payload,
          error: msg,
          contrastWarning: !contrastOk,
          decodeOk: null,
          effectiveEcc: ecc,
        });
        setGenerating(false);
        return;
      }

      if (hasLogo && settings.logoDataUrl) {
        dataUrl = await applyLogoOverlay(
          dataUrl,
          settings.logoDataUrl,
          settings.size,
          settings.logoSizePercent,
        );
      }

      if (id !== genIdRef.current) return;

      let decodeOk: boolean | null = null;
      decodeOk = await decodeQrFromDataUrl(dataUrl);

      setResult({
        dataUrl,
        svg,
        payload,
        error: null,
        contrastWarning: !contrastOk,
        decodeOk,
        effectiveEcc: ecc,
      });
    } catch {
      if (id !== genIdRef.current) return;
      setResult((prev) => ({ ...prev, error: "generateFailed" }));
    } finally {
      if (id === genIdRef.current) setGenerating(false);
    }
  }, [form, settings]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(generate, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [generate]);

  return { result, generating };
}
