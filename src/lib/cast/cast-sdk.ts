"use client";

import type { CastResolvedMedia } from "./types";
import { getCastReceiverId } from "./urls";

// Ambient `cast` / `chrome.cast` global type declarations for the Google Cast
// Web Sender SDK live in ./google-cast.d.ts.

const CAST_SCRIPT = "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
const CAST_READY_POLL_MS = 50;
const CAST_READY_TIMEOUT_MS = 10_000;

let loadPromise: Promise<boolean> | null = null;

export type CastSenderSupport =
  | { ok: true }
  | { ok: false; reason: "ios" | "safari" | "firefox" | "standalone" | "webview" | "unsupported" };

/** Google Cast Web Sender works in Chromium (Chrome/Edge/Opera) on desktop & Android — not iOS/Safari/WebView. */
export function getCastSenderSupport(): CastSenderSupport {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { ok: false, reason: "unsupported" };
  }

  const ua = navigator.userAgent || "";
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIos) return { ok: false, reason: "ios" };

  if (/Firefox\//i.test(ua)) return { ok: false, reason: "firefox" };

  // Desktop Safari (not Chrome/Edge/Opera disguised)
  const isSafari =
    /Safari\//i.test(ua) && !/Chrome\//i.test(ua) && !/Chromium\//i.test(ua) && !/Edg\//i.test(ua);
  if (isSafari) return { ok: false, reason: "safari" };

  // Capacitor / Android WebView — Cast framework is not available
  if (/; wv\)/i.test(ua) || /\bwv\b/i.test(ua) || /Capacitor/i.test(ua)) {
    return { ok: false, reason: "webview" };
  }

  // Installed PWA / TWA: Cast framework often never becomes available
  const standalone =
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
  if (standalone) return { ok: false, reason: "standalone" };

  return { ok: true };
}

export function getCastUnsupportedMessage(
  reason: Extract<CastSenderSupport, { ok: false }>["reason"],
): string {
  switch (reason) {
    case "ios":
      return "На iPhone/iPad Cast в браузере недоступен. Откройте эту страницу в Chrome на Android или на ноутбуке (Chrome/Edge) в той же Wi‑Fi.";
    case "safari":
      return "Safari не поддерживает Google Cast. Откройте страницу в Chrome или Edge.";
    case "firefox":
      return "Firefox не поддерживает Google Cast. Откройте страницу в Chrome или Edge.";
    case "standalone":
      return "В установленном приложении (PWA) Cast часто не работает. Откройте qhub.kz/cast в Chrome (не с домашнего экрана).";
    case "webview":
      return "В Android-приложении QHub Cast на TV недоступен. Откройте ту же ссылку в Chrome на телефоне или ноутбуке — в одной Wi‑Fi с TV.";
    default:
      return "Google Cast недоступен в этом браузере. Нужны Chrome, Edge или Opera на Android/ПК.";
  }
}

function isCastFrameworkReady(): boolean {
  return Boolean(window.cast?.framework?.CastContext && window.chrome?.cast);
}

function waitForCastFramework(timeoutMs: number): Promise<boolean> {
  if (isCastFrameworkReady()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const started = Date.now();
    const id = window.setInterval(() => {
      if (isCastFrameworkReady()) {
        window.clearInterval(id);
        resolve(true);
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        window.clearInterval(id);
        resolve(false);
      }
    }, CAST_READY_POLL_MS);
  });
}

function loadCastScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (isCastFrameworkReady()) return Promise.resolve(true);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    const prev = window.__onGCastApiAvailable;
    window.__onGCastApiAvailable = (isAvailable) => {
      try {
        prev?.(isAvailable);
      } catch {
        /* ignore prior callback errors */
      }
      if (!isAvailable) {
        finish(false);
        return;
      }
      void waitForCastFramework(CAST_READY_TIMEOUT_MS).then(finish);
    };

    if (document.querySelector(`script[src^="https://www.gstatic.com/cv/js/sender"]`)) {
      void waitForCastFramework(CAST_READY_TIMEOUT_MS).then(finish);
      return;
    }

    const script = document.createElement("script");
    script.src = CAST_SCRIPT;
    script.async = true;
    script.onerror = () => finish(false);
    document.head.appendChild(script);

    window.setTimeout(() => {
      finish(isCastFrameworkReady());
    }, CAST_READY_TIMEOUT_MS);
  });

  return loadPromise;
}

export async function initCastSdk(): Promise<boolean> {
  if (getCastSenderSupport().ok === false) return false;

  const ok = await loadCastScript();
  if (!ok || !isCastFrameworkReady()) return false;

  const ctx = window.cast!.framework.CastContext.getInstance();
  ctx.setOptions({
    receiverApplicationId: getCastReceiverId(),
    autoJoinPolicy: window.chrome!.cast!.AutoJoinPolicy.ORIGIN_SCOPED,
  });
  return true;
}

export function isCastApiAvailable(): boolean {
  return isCastFrameworkReady();
}

export async function loadMediaOnCast(media: CastResolvedMedia): Promise<void> {
  const support = getCastSenderSupport();
  if (!support.ok) {
    throw new Error(getCastUnsupportedMessage(support.reason));
  }

  const ready = await initCastSdk();
  if (!ready || !window.cast?.framework || !window.chrome?.cast) {
    throw new Error("Google Cast недоступен в этом браузере");
  }

  const ctx = window.cast.framework.CastContext.getInstance();
  let session = ctx.getCurrentSession();
  if (!session) {
    session = await ctx.requestSession();
  }

  const info = new window.chrome.cast.media.MediaInfo(media.streamUrl, media.contentType);
  info.streamType = window.chrome.cast.media.StreamType.BUFFERED;
  const metadata = new window.chrome.cast.media.MovieMediaMetadata();
  metadata.title = media.title;
  if (media.poster) {
    metadata.images = [{ url: media.poster }];
  }
  info.metadata = metadata;

  const request = new window.chrome.cast.media.LoadRequest(info);
  await session.loadMedia(request);
}

export function createRemotePlayerController(): {
  player: cast.framework.RemotePlayer;
  controller: cast.framework.RemotePlayerController;
} | null {
  if (!window.cast?.framework) return null;
  const player = new window.cast.framework.RemotePlayer();
  const controller = new window.cast.framework.RemotePlayerController(player);
  return { player, controller };
}

export function getCastStateLabel(state: string): string {
  switch (state) {
    case "NO_DEVICES_AVAILABLE":
      return "Устройства Cast не найдены — телефон/ПК и TV должны быть в одной Wi‑Fi";
    case "NOT_CONNECTED":
      return "Не подключено — нажмите «Cast на TV» и выберите приставку";
    case "CONNECTING":
      return "Подключение…";
    case "CONNECTED":
      return "Подключено к TV";
    default:
      return state;
  }
}
