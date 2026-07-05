"use client";

import { useState } from "react";
import {
  LOTTO_MAX_PLAYERS,
  LOTTO_MIN_PLAYERS,
  LOTTO_WIN_LABELS,
  type LottoPlayer,
  type LottoWinRules,
} from "@/lib/random-picker/lotto-tickets";
import { PickerButton } from "../components/PickerButton";
import { LottoPlayerQr } from "./LottoPlayerQr";

interface LottoParticipantsProps {
  hostName: string;
  onHostNameChange: (name: string) => void;
  players: LottoPlayer[];
  winRules: LottoWinRules;
  cardsGenerated: boolean;
  isActive: boolean;
  roomCode: string | null;
  creatingRoom: boolean;
  onCreateRoom: () => Promise<void>;
  onWinRulesChange: (rules: LottoWinRules) => void;
  onGenerateCards: () => Promise<void>;
  onStartGame?: () => void;
}

export function LottoParticipants({
  hostName,
  onHostNameChange,
  players,
  winRules,
  cardsGenerated,
  isActive,
  roomCode,
  creatingRoom,
  onCreateRoom,
  onWinRulesChange,
  onGenerateCards,
  onStartGame,
}: LottoParticipantsProps) {
  const [generateError, setGenerateError] = useState<string | null>(null);
  const hasAnyWinRule = winRules.oneLine || winRules.twoLines || winRules.fullCard;
  const joinedPlayers = players.filter((p) => p.joined && !p.left).length;
  const canGenerateCards =
    Boolean(roomCode) && !cardsGenerated && !isActive && joinedPlayers >= LOTTO_MIN_PLAYERS && hasAnyWinRule;

  const handleGenerate = async () => {
    try {
      setGenerateError(null);
      await onGenerateCards();
    } catch (err) {
      setGenerateError(
        err instanceof Error ? err.message : "Не удалось сформировать карточки. Попробуйте ещё раз.",
      );
    }
  };

  const handleShareRoom = async () => {
    if (!roomCode) return;
    const text = `Присоединяйтесь к игре в Русское лото.\nКод комнаты: ${roomCode}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Русское лото — код комнаты", text });
        return;
      } catch {
        // fallback to clipboard
      }
    }
    await navigator.clipboard.writeText(roomCode);
  };

  return (
    <div className="space-y-4">
      {!roomCode && (
        <div className="space-y-2">
          <span className="text-[11px] text-gray-500 uppercase tracking-wide">Создать онлайн игру</span>
          <input
            type="text"
            value={hostName}
            onChange={(e) => onHostNameChange(e.target.value)}
            placeholder="Ваше имя"
            className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
          />
          <PickerButton
            onClick={() => void onCreateRoom()}
            className="w-full"
            disabled={creatingRoom || !hostName.trim()}
          >
            {creatingRoom ? "Создание…" : "Создать онлайн игру"}
          </PickerButton>
          <p className="text-[11px] text-gray-500">После создания комнаты участники смогут войти по коду комнаты.</p>
        </div>
      )}

      {roomCode && (
        <div className="space-y-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Код комнаты</p>
              <p className="text-lg font-mono font-semibold text-gray-900 dark:text-gray-100">{roomCode}</p>
            </div>
            <span className="text-[10px] px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
              Участников: {joinedPlayers}/{LOTTO_MAX_PLAYERS}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <PickerButton variant="secondary" onClick={() => void navigator.clipboard.writeText(roomCode)}>
              Скопировать код
            </PickerButton>
            <PickerButton variant="secondary" onClick={() => void handleShareRoom()}>
              Поделиться
            </PickerButton>
          </div>

          <LottoPlayerQr roomCode={roomCode} />

          <div className="space-y-1">
            {players.map((player) => (
              <div key={player.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="font-medium text-gray-800 dark:text-gray-200">{player.name}</span>
                <span
                  className={`px-1.5 py-0.5 rounded ${
                    player.left
                      ? "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                      : player.joined
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                  }`}
                >
                  {player.left ? "вышел" : player.joined ? "в комнате" : "не в сети"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {roomCode && !cardsGenerated && (
        <fieldset className="space-y-2 border-t border-gray-100 dark:border-gray-800 pt-3">
          <legend className="text-[11px] text-gray-500 uppercase tracking-wide">Условия выигрыша</legend>
          {(Object.keys(LOTTO_WIN_LABELS) as Array<keyof typeof LOTTO_WIN_LABELS>).map((key) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={winRules[key]}
                onChange={(e) => onWinRulesChange({ ...winRules, [key]: e.target.checked })}
                className="rounded"
              />
              <span className="text-xs text-gray-700 dark:text-gray-300">{LOTTO_WIN_LABELS[key]}</span>
            </label>
          ))}
          <label className="flex items-center gap-2 cursor-pointer mt-2">
            <input
              type="checkbox"
              checked={winRules.pauseOnWin}
              onChange={(e) => onWinRulesChange({ ...winRules, pauseOnWin: e.target.checked })}
              className="rounded"
            />
            <span className="text-xs text-gray-700 dark:text-gray-300">
              Автоматическая пауза при выигрыше (кнопка «Продолжить»)
            </span>
          </label>
        </fieldset>
      )}

      {roomCode && !cardsGenerated && (
        <PickerButton
          onClick={handleGenerate}
          className="w-full"
          disabled={!canGenerateCards}
          disabledReason={
            joinedPlayers < LOTTO_MIN_PLAYERS
              ? `Нужно минимум ${LOTTO_MIN_PLAYERS} участника`
              : !hasAnyWinRule
                ? "Выберите хотя бы одно условие выигрыша"
                : null
          }
        >
          Сформировать карточки случайным образом
        </PickerButton>
      )}

      {cardsGenerated && onStartGame && (
        <PickerButton onClick={onStartGame} className="w-full" disabled={isActive}>
          {isActive ? "Игра уже идёт" : "Начать игру"}
        </PickerButton>
      )}

      {generateError && <p className="text-[11px] text-red-600 dark:text-red-400">{generateError}</p>}
    </div>
  );
}
