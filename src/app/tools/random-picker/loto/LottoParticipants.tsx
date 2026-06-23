"use client";

import { useState } from "react";
import {
  createPlayer,
  generateTicketsForPlayers,
  getCompletedLineIndices,
  printTicket,
  shareTicket,
  LOTTO_MAX_PLAYERS,
  LOTTO_MIN_PLAYERS,
  LOTTO_WIN_LABELS,
  type LottoPlayer,
  type LottoWinRules,
} from "@/lib/random-picker/lotto-tickets";
import { PickerButton } from "../components/PickerButton";
import { LottoTicketCard } from "./LottoTicketCard";
import { LottoPlayerQr } from "./LottoPlayerQr";

interface LottoParticipantsProps {
  players: LottoPlayer[];
  winRules: LottoWinRules;
  cardsGenerated: boolean;
  drawn: readonly number[];
  isActive: boolean;
  roomCode: string | null;
  onPlayersChange: (players: LottoPlayer[]) => void;
  onWinRulesChange: (rules: LottoWinRules) => void;
  onCardsGenerated: (players: LottoPlayer[]) => Promise<void>;
  onStartGame?: () => void;
}

export function LottoParticipants({
  players,
  winRules,
  cardsGenerated,
  drawn,
  isActive,
  roomCode,
  onPlayersChange,
  onWinRulesChange,
  onCardsGenerated,
  onStartGame,
}: LottoParticipantsProps) {
  const [nameInput, setNameInput] = useState("");
  const [shareHint, setShareHint] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const canEditPlayers = !isActive;
  const hasEnoughPlayers = players.length >= LOTTO_MIN_PLAYERS;
  const atPlayerLimit = players.length >= LOTTO_MAX_PLAYERS;
  const hasAnyWinRule = winRules.oneLine || winRules.twoLines || winRules.fullCard;

  const addPlayer = () => {
    const name = nameInput.trim();
    if (!name || atPlayerLimit) return;
    onPlayersChange([...players, createPlayer(name)]);
    setNameInput("");
  };

  const removePlayer = (id: string) => {
    onPlayersChange(players.filter((p) => p.id !== id));
  };

  const updateName = (id: string, name: string) => {
    onPlayersChange(players.map((p) => (p.id === id ? { ...p, name } : p)));
  };

  const handleGenerate = async () => {
    try {
      setGenerateError(null);
      await onCardsGenerated(generateTicketsForPlayers(players));
    } catch (err) {
      setGenerateError(
        err instanceof Error ? err.message : "Не удалось сформировать карточки. Попробуйте ещё раз.",
      );
    }
  };

  const handleShare = async (player: LottoPlayer) => {
    if (!player.ticket) return;
    try {
      await shareTicket(player.name, player.ticket);
      setShareHint(`Карточка «${player.name}» скопирована или отправлена`);
      setTimeout(() => setShareHint(null), 2500);
    } catch {
      setShareHint("Не удалось поделиться карточкой");
      setTimeout(() => setShareHint(null), 2500);
    }
  };

  return (
    <div className="space-y-4">
      {canEditPlayers && (
        <div className="space-y-2">
          <span className="text-[11px] text-gray-500 uppercase tracking-wide">Добавить игрока</span>
          <div className="flex gap-2">
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addPlayer();
              }}
              placeholder="Имя игрока"
              className="flex-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-xs text-gray-900 dark:text-gray-100"
            />
            <PickerButton
              variant="secondary"
              onClick={addPlayer}
              disabled={!nameInput.trim() || atPlayerLimit}
              disabledReason={atPlayerLimit ? `Максимум ${LOTTO_MAX_PLAYERS} участников` : undefined}
            >
              Добавить
            </PickerButton>
          </div>
          <p className="text-[11px] text-gray-500">
            От {LOTTO_MIN_PLAYERS} до {LOTTO_MAX_PLAYERS} игроков для игры с карточками.
          </p>
        </div>
      )}

      {roomCode && cardsGenerated && (
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Код комнаты для сетевой игры:{" "}
          <strong className="font-mono text-gray-900 dark:text-gray-100">{roomCode}</strong>
        </p>
      )}

      {players.length > 0 && (
        <div className="space-y-3">
          {players.map((player) => (
            <div
              key={player.id}
              className={`rounded-lg border p-3 space-y-2 ${
                player.left
                  ? "border-gray-300 dark:border-gray-600 opacity-60"
                  : "border-gray-200 dark:border-gray-700"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                {canEditPlayers ? (
                  <input
                    type="text"
                    value={player.name}
                    onChange={(e) => updateName(player.id, e.target.value)}
                    className="flex-1 min-w-[120px] rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-xs font-medium"
                  />
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {player.name}
                    </span>
                    {player.left && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                        вышел из игры
                      </span>
                    )}
                    {player.joined && !player.left && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300">
                        в сети
                      </span>
                    )}
                  </div>
                )}
                {canEditPlayers && (
                  <PickerButton variant="ghost" onClick={() => removePlayer(player.id)}>
                    Удалить
                  </PickerButton>
                )}
              </div>

              {player.ticket && (
                <>
                  <LottoTicketCard
                    ticket={player.ticket}
                    drawn={drawn}
                    highlightRows={getCompletedLineIndices(player.ticket, drawn)}
                    compact
                  />
                  {roomCode && player.joinCode && player.joinToken && (
                    <LottoPlayerQr
                      roomCode={roomCode}
                      playerId={player.id}
                      joinToken={player.joinToken}
                      joinCode={player.joinCode}
                    />
                  )}
                  <div className="flex flex-wrap gap-2">
                    <PickerButton
                      variant="secondary"
                      onClick={() => void handleShare(player)}
                    >
                      Поделиться
                    </PickerButton>
                    <PickerButton
                      variant="secondary"
                      onClick={() => printTicket(player.name, player.ticket!)}
                    >
                      Распечатать
                    </PickerButton>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {shareHint && <p className="text-[11px] text-emerald-600 dark:text-emerald-400">{shareHint}</p>}

      {canEditPlayers && (
        <>
          <fieldset className="space-y-2 border-t border-gray-100 dark:border-gray-800 pt-3">
            <legend className="text-[11px] text-gray-500 uppercase tracking-wide">
              Условия выигрыша
            </legend>
            {(Object.keys(LOTTO_WIN_LABELS) as Array<keyof typeof LOTTO_WIN_LABELS>).map((key) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={winRules[key]}
                  onChange={(e) => onWinRulesChange({ ...winRules, [key]: e.target.checked })}
                  className="rounded"
                />
                <span className="text-xs text-gray-700 dark:text-gray-300">
                  {LOTTO_WIN_LABELS[key]}
                </span>
              </label>
            ))}
            <label className="flex items-center gap-2 cursor-pointer mt-2">
              <input
                type="checkbox"
                checked={winRules.pauseOnWin}
                onChange={(e) =>
                  onWinRulesChange({ ...winRules, pauseOnWin: e.target.checked })
                }
                className="rounded"
              />
              <span className="text-xs text-gray-700 dark:text-gray-300">
                Автоматическая пауза при выигрыше (кнопка «Продолжить»)
              </span>
            </label>
          </fieldset>

          <PickerButton
            onClick={handleGenerate}
            className="w-full"
            disabled={!hasEnoughPlayers || !hasAnyWinRule}
            disabledReason={
              !hasEnoughPlayers
                ? "Нужно минимум 2 игрока"
                : !hasAnyWinRule
                  ? "Выберите хотя бы одно условие выигрыша"
                  : null
            }
          >
            {cardsGenerated ? "Пересформировать карточки" : "Сформировать карточки случайным образом"}
          </PickerButton>

          {cardsGenerated && onStartGame && (
            <PickerButton onClick={onStartGame} className="w-full">
              Начать игру
            </PickerButton>
          )}

          {generateError && (
            <p className="text-[11px] text-red-600 dark:text-red-400">{generateError}</p>
          )}
        </>
      )}

      {isActive && cardsGenerated && (
        <p className="text-[11px] text-gray-500">
          Выпавшие числа подсвечиваются на карточках. Выигрыш показывается на центральной панели.
        </p>
      )}
    </div>
  );
}
