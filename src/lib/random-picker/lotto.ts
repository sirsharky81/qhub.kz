import { getSecureRandomInt } from "./crypto";
import {
  DEFAULT_LOTTO_WIN_RULES,
  LOTTO_WIN_LABELS,
  type LottoPlayer,
  type LottoWinAlert,
  type LottoWinRules,
  type LottoWinType,
} from "./lotto-tickets";

export type { LottoPlayer, LottoWinAlert, LottoWinRules, LottoWinType, LottoTicket } from "./lotto-tickets";
export {
  DEFAULT_LOTTO_WIN_RULES,
  LOTTO_WIN_LABELS,
  generateLottoTicket,
  generateTicketsForPlayers,
  createPlayer,
  detectWinsAmongPlayers,
  formatTicketText,
  printTicket,
  shareTicket,
  getCompletedLineIndices,
  isFullCardComplete,
} from "./lotto-tickets";

export const LOTTO_POOL_MIN = 1;
export const LOTTO_POOL_MAX = 90;
export const LOTTO_INTERVAL_MIN = 2;
export const LOTTO_INTERVAL_MAX = 15;
export const LOTTO_INTERVAL_DEFAULT = 5;

export type LottoGameStatus = "idle" | "playing" | "paused" | "finished";
export type LottoVoiceMode = "number" | "barrel";

export interface LottoSettings {
  intervalSec: number;
  voiceEnabled: boolean;
  voiceMode: LottoVoiceMode;
}

export interface LottoGameState {
  status: LottoGameStatus;
  remaining: number[];
  drawn: number[];
  current: number | null;
  settings: LottoSettings;
  countdownSec: number;
  players: LottoPlayer[];
  winRules: LottoWinRules;
  cardsGenerated: boolean;
  activeWinAlert: LottoWinAlert | null;
  network: { roomCode: string; hostSecret: string } | null;
}

export const LOTTO_STORAGE_KEY = "qhub_lotto_state";

export const DEFAULT_LOTTO_SETTINGS: LottoSettings = {
  intervalSec: LOTTO_INTERVAL_DEFAULT,
  voiceEnabled: true,
  voiceMode: "number",
};

export function createFullPool(): number[] {
  return Array.from({ length: LOTTO_POOL_MAX - LOTTO_POOL_MIN + 1 }, (_, i) => i + LOTTO_POOL_MIN);
}

export function createNewGame(settings: LottoSettings): LottoGameState {
  return {
    status: "idle",
    remaining: createFullPool(),
    drawn: [],
    current: null,
    settings,
    countdownSec: settings.intervalSec,
    players: [],
    winRules: { ...DEFAULT_LOTTO_WIN_RULES },
    cardsGenerated: false,
    activeWinAlert: null,
    network: null,
  };
}

export function drawBarrel(remaining: readonly number[]): {
  number: number;
  newRemaining: number[];
} {
  if (remaining.length === 0) throw new Error("Мешок пуст");
  const index = getSecureRandomInt(0, remaining.length - 1);
  const number = remaining[index]!;
  return {
    number,
    newRemaining: [...remaining.slice(0, index), ...remaining.slice(index + 1)],
  };
}

const ONES = [
  "",
  "один",
  "два",
  "три",
  "четыре",
  "пять",
  "шесть",
  "семь",
  "восемь",
  "девять",
] as const;

const TEENS = [
  "десять",
  "одиннадцать",
  "двенадцать",
  "тринадцать",
  "четырнадцать",
  "пятнадцать",
  "шестнадцать",
  "семнадцать",
  "восемнадцать",
  "девятнадцать",
] as const;

const TENS = [
  "",
  "",
  "двадцать",
  "тридцать",
  "сорок",
  "пятьдесят",
  "шестьдесят",
  "семьдесят",
  "восемьдесят",
  "девяносто",
] as const;

export function numberToRussian(n: number): string {
  if (n < 1 || n > 99) return String(n);
  if (n < 10) return ONES[n]!;
  if (n < 20) return TEENS[n - 10]!;
  const ten = Math.floor(n / 10);
  const one = n % 10;
  if (one === 0) return TENS[ten]!;
  // Запятая помогает TTS чётче разделить десятки и единицы
  return `${TENS[ten]}, ${ONES[one]}`;
}

export function lottoSpeechText(number: number, mode: LottoVoiceMode): string {
  const words = numberToRussian(number);
  return mode === "barrel" ? `Бочка номер ${words}` : words;
}

export function lottoWinSpeechText(
  playerName: string,
  winType: LottoWinType,
  number: number,
  voiceMode: LottoVoiceMode,
): string {
  const numberPart =
    voiceMode === "barrel"
      ? `Бочка номер ${numberToRussian(number)}`
      : numberToRussian(number);
  return `Выигрыш! ${playerName}. ${LOTTO_WIN_LABELS[winType]}. ${numberPart}`;
}

export function lottoDrawSpeechText(
  number: number,
  voiceMode: LottoVoiceMode,
  win?: { playerName: string; winType: LottoWinType } | null,
): string {
  const drawPart = lottoSpeechText(number, voiceMode);
  if (!win) return drawPart;
  return `${drawPart}. ${lottoWinSpeechText(win.playerName, win.winType, number, voiceMode)}`;
}

function pickRussianVoice(): SpeechSynthesisVoice | undefined {
  if (typeof window === "undefined") return undefined;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang === "ru-RU") ??
    voices.find((v) => v.lang.startsWith("ru")) ??
    undefined
  );
}

export function speakLottoNumber(text: string): Promise<void> {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    return Promise.resolve();
  }

  const speak = (): Promise<void> =>
    new Promise((resolve) => {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "ru-RU";
      utterance.rate = 0.88;
      const voice = pickRussianVoice();
      if (voice) utterance.voice = voice;
      const done = () => resolve();
      utterance.onend = done;
      utterance.onerror = done;
      window.speechSynthesis.speak(utterance);
    });

  if (window.speechSynthesis.getVoices().length > 0) {
    return speak();
  }

  return new Promise((resolve) => {
    const onVoices = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", onVoices);
      void speak().then(resolve);
    };
    window.speechSynthesis.addEventListener("voiceschanged", onVoices);
    window.speechSynthesis.getVoices();
  });
}

export function loadLottoState(): LottoGameState | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(LOTTO_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LottoGameState>;
    if (!Array.isArray(parsed.remaining) || !Array.isArray(parsed.drawn)) return null;
    return {
      status: parsed.status ?? "idle",
      remaining: parsed.remaining,
      drawn: parsed.drawn,
      current: parsed.current ?? null,
      settings: { ...DEFAULT_LOTTO_SETTINGS, ...parsed.settings },
      countdownSec: parsed.countdownSec ?? DEFAULT_LOTTO_SETTINGS.intervalSec,
      players: Array.isArray(parsed.players) ? parsed.players : [],
      winRules: {
        ...DEFAULT_LOTTO_WIN_RULES,
        ...parsed.winRules,
        pauseOnWin:
          parsed.winRules?.pauseOnWin ??
          (parsed.winRules as { stopOnFullCard?: boolean } | undefined)?.stopOnFullCard ??
          true,
      },
      cardsGenerated: parsed.cardsGenerated ?? false,
      activeWinAlert: parsed.activeWinAlert ?? null,
      network: parsed.network ?? null,
    };
  } catch {
    return null;
  }
}

export function saveLottoState(state: LottoGameState): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(LOTTO_STORAGE_KEY, JSON.stringify(state));
}

export function clearLottoState(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(LOTTO_STORAGE_KEY);
}
