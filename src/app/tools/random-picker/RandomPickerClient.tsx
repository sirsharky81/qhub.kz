"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EventInfo, ParticipantTable, PickerMode, PickNumbering, ResultTable, VerificationRecord } from "@/lib/random-picker";
import {
  PICKER_MODES,
  fisherYatesShuffle,
  splitIntoGroups,
  formatGroupsResult,
  createVerificationRecord,
  addOperationHistory,
  getOperationHistory,
  findDuplicates,
  PERFORMANCE_WARN_THRESHOLD,
  getActionDisabledReason,
  isActionEnabled,
  loadEventFromSession,
  saveEventToSession,
  loadTableFromSession,
  saveTableToSession,
  loadPickCountFromSession,
  savePickCountToSession,
  loadSequentialFromSession,
  saveSequentialToSession,
  loadPickNumberingFromSession,
  savePickNumberingToSession,
  isLegalAcceptedInSession,
  setLegalAcceptedInSession,
  saveLastModeToSession,
  createEmptyTable,
  deserializeTable,
  serializeTable,
  extractParticipants,
  tableRowCount,
  formatPickResult,
  formatPickLine,
  pickPlaceNumber,
  buildResultTable,
  pickRowIndices,
  getKeyColumn,
} from "@/lib/random-picker";
import { PrivacyBanner } from "@/app/tools/file-converter/components/PrivacyBanner";
import { ModeGrid } from "./components/ModeGrid";
import { EventInfoForm, isEventInfoValid } from "./components/EventInfoForm";
import { LegalConsent } from "./components/LegalConsent";
import { NumberGenerator, useVideoRecorder } from "./components/NumberGenerator";
import { ResultPanel } from "./components/ResultPanel";
import { HistoryPanel } from "./components/HistoryPanel";
import { FooterBranding } from "./components/FooterBranding";
import { Toast, useToast } from "./components/Toast";
import { PickerButton, PickerSection } from "./components/PickerButton";
import { ParticipantTableEditor } from "./components/ParticipantTableEditor";
import { DiceRoller } from "./components/DiceRoller";

const EMPTY_EVENT: EventInfo = { eventName: "", description: "", contact: "" };

export default function RandomPickerClient() {
  const [mode, setMode] = useState<PickerMode | null>(null);
  const [event, setEvent] = useState<EventInfo>(EMPTY_EVENT);
  const [table, setTable] = useState<ParticipantTable>(() => createEmptyTable());
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [showLegalCheckbox, setShowLegalCheckbox] = useState(true);
  const [pickCount, setPickCount] = useState(1);
  const [excludePicked, setExcludePicked] = useState(false);
  const [pickNumbering, setPickNumbering] = useState<PickNumbering>("asc");
  const [pickedRowIndices, setPickedRowIndices] = useState<number[]>([]);
  const [groupCount, setGroupCount] = useState("2");
  const [groupNames, setGroupNames] = useState<string[]>([]);
  const [showGroupNames, setShowGroupNames] = useState(false);
  const [duplicateDecision, setDuplicateDecision] = useState<"pending" | "keep" | "deduped" | null>(null);
  const [result, setResult] = useState<VerificationRecord | null>(null);
  const [history, setHistory] = useState<VerificationRecord[]>([]);

  const toast = useToast();
  const resultRef = useRef<HTMLDivElement>(null);
  const video = useVideoRecorder(resultRef);

  useEffect(() => {
    setEvent(loadEventFromSession());
    const stored = loadTableFromSession();
    if (stored) setTable(deserializeTable(stored));
    setPickCount(loadPickCountFromSession());
    setExcludePicked(loadSequentialFromSession());
    setPickNumbering(loadPickNumberingFromSession());
    const accepted = isLegalAcceptedInSession();
    setLegalAccepted(accepted);
    setShowLegalCheckbox(!accepted);
    setHistory(getOperationHistory());
  }, []);

  useEffect(() => saveEventToSession(event), [event]);
  useEffect(() => saveTableToSession(serializeTable(table)), [table]);
  useEffect(() => savePickCountToSession(pickCount), [pickCount]);
  useEffect(() => saveSequentialToSession(excludePicked), [excludePicked]);
  useEffect(() => savePickNumberingToSession(pickNumbering), [pickNumbering]);
  useEffect(() => {
    setPickedRowIndices([]);
    setResult(null);
  }, [pickCount]);

  const participants = extractParticipants(table);
  const pickComplete = pickedRowIndices.length >= pickCount;
  const currentRound = Math.min(pickedRowIndices.length + 1, pickCount);
  const currentPlace = pickPlaceNumber(pickedRowIndices.length, pickCount, pickNumbering);
  const pickInProgress = pickedRowIndices.length > 0 && !pickComplete;
  const rowCount = tableRowCount(table);
  const duplicates = useMemo(() => findDuplicates(participants), [participants]);
  const hasUnresolvedDuplicates =
    duplicates.length > 0 && duplicateDecision !== "keep" && duplicateDecision !== "deduped";

  useEffect(() => {
    if (duplicates.length === 0) setDuplicateDecision(null);
    else if (duplicateDecision === null) setDuplicateDecision("pending");
  }, [duplicates.length, duplicateDecision]);

  const needsEvent = mode !== null && mode !== "number" && mode !== "dice";
  const eventValid = isEventInfoValid(event);
  const groupCountNum = parseInt(groupCount, 10) || 0;

  const disabledReason = mode
    ? getActionDisabledReason(
        mode,
        rowCount,
        pickCount,
        groupCountNum,
        eventValid,
        legalAccepted,
        excludePicked,
      )
    : null;

  const actionBlocked =
    hasUnresolvedDuplicates || (disabledReason !== null && !isActionEnabled(disabledReason));

  const finalDisabledReason = hasUnresolvedDuplicates
    ? "Подтвердите действие с дублирующимися записями"
    : disabledReason;

  const modeConfig = PICKER_MODES.find((m) => m.id === mode);

  const validRows = useMemo(
    () =>
      table.rows
        .map((_, i) => i)
        .filter((i) => {
          const keyIdx = table.columns.findIndex((c) => c.id === table.keyColumnId);
          return (table.rows[i]?.[keyIdx] ?? "").trim().length > 0;
        }),
    [table],
  );

  const availableRows = useMemo(
    () =>
      excludePicked ? validRows.filter((i) => !pickedRowIndices.includes(i)) : validRows,
    [validRows, excludePicked, pickedRowIndices],
  );

  const saveResult = useCallback(
    async (
      modeId: PickerMode,
      resultText: string,
      list: string[],
      resultTable?: ResultTable,
    ) => {
      const keyCol = getKeyColumn(table)?.name;
      const record = await createVerificationRecord(
        modeId,
        event,
        list,
        resultText,
        keyCol,
        resultTable,
      );
      addOperationHistory(record);
      setResult(record);
      setHistory(getOperationHistory());
    },
    [event, table],
  );

  const selectMode = (next: PickerMode) => {
    setMode(next);
    saveLastModeToSession(next);
    setResult(null);
    setPickedRowIndices([]);
  };

  const handleLegalChange = (checked: boolean) => {
    setLegalAccepted(checked);
    if (checked) {
      setLegalAcceptedInSession(true);
      setShowLegalCheckbox(false);
    }
  };

  const handlePick = async () => {
    if (actionBlocked || pickComplete) return;
    if (availableRows.length < 1) return;

    try {
      const exclude = excludePicked ? pickedRowIndices : [];
      const indices = pickRowIndices(table, 1, exclude);
      const newPicked = [...pickedRowIndices, ...indices];
      setPickedRowIndices(newPicked);

      const pickIndex = newPicked.length - 1;
      const isComplete = newPicked.length >= pickCount;
      const rowIndices = isComplete ? newPicked : indices;
      const placeNumbers = isComplete
        ? newPicked.map((_, i) => pickPlaceNumber(i, pickCount, pickNumbering))
        : [pickPlaceNumber(pickIndex, pickCount, pickNumbering)];
      const resultText = isComplete
        ? formatPickResult(table, newPicked, { total: pickCount, numbering: pickNumbering })
        : formatPickLine(table, indices[0]!, pickIndex, pickCount, pickNumbering);
      const resultTable = buildResultTable(table, rowIndices, { placeNumbers });

      await saveResult("pick", resultText, extractParticipants(table), resultTable);
      if (isComplete) toast.show("Выбор завершён");
    } catch {
      toast.show("Недостаточно участников для выбора");
    }
  };

  const handleResetPick = () => {
    setPickedRowIndices([]);
    setResult(null);
  };

  const handleListReset = useCallback(() => {
    setPickedRowIndices([]);
    setResult(null);
    setDuplicateDecision(null);
  }, []);

  const handleClearEvent = useCallback(() => {
    setEvent(EMPTY_EVENT);
  }, []);

  const handleShuffle = async () => {
    if (actionBlocked) return;
    const indices = table.rows
      .map((_, i) => i)
      .filter((i) => {
        const keyIdx = table.columns.findIndex((c) => c.id === table.keyColumnId);
        return (table.rows[i]?.[keyIdx] ?? "").trim().length > 0;
      });
    const shuffled = fisherYatesShuffle(indices);
    const placeNumbers = shuffled.map((_, i) => i + 1);
    const resultText = formatPickResult(table, shuffled, { total: shuffled.length, numbering: "asc" });
    const resultTable = buildResultTable(table, shuffled, { placeNumbers });
    await saveResult("shuffle", resultText, extractParticipants(table), resultTable);
  };

  const handleGroups = async () => {
    if (actionBlocked) return;
    const p = extractParticipants(table);
    const resultGroups = splitIntoGroups(p, groupCountNum);
    const names = showGroupNames ? groupNames : undefined;
    await saveResult("groups", formatGroupsResult(resultGroups, names), p);
  };

  const goBack = () => {
    setMode(null);
    setResult(null);
    setPickedRowIndices([]);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-gray-50 dark:bg-gray-950">
      <Toast message={toast.message} onDismiss={toast.dismiss} />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
              Генератор случайных чисел
            </h1>
            <p className="text-xs text-gray-500">Жеребьёвка и случайный выбор — локально в браузере</p>
            <PrivacyBanner compact />
          </div>

          {!mode && (
            <ModeGrid
              onSelect={selectMode}
              onComingSoon={() => toast.show("Колесо выбора появится в следующем обновлении")}
            />
          )}

          {mode && (
            <div className="space-y-3">
              <PickerButton variant="ghost" onClick={goBack} className="!px-0 !border-0">
                ← Режимы
              </PickerButton>

              <div className="flex items-center gap-2">
                <span className="text-xl">{modeConfig?.emoji}</span>
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {modeConfig?.title}
                </h2>
              </div>

              {mode === "number" && <NumberGenerator />}
              {mode === "dice" && <DiceRoller />}

              {needsEvent && (
                <>
                  <PickerSection title="Мероприятие">
                    <EventInfoForm value={event} onChange={setEvent} />
                  </PickerSection>

                  <LegalConsent
                    visible={showLegalCheckbox}
                    checked={legalAccepted}
                    onChange={handleLegalChange}
                  />

                  <ParticipantTableEditor
                    table={table}
                    onChange={setTable}
                    highlightedRows={pickedRowIndices}
                    duplicateDecision={duplicateDecision}
                    onDuplicateDecision={setDuplicateDecision}
                    eventName={event.eventName}
                    onListReset={handleListReset}
                    onClearEvent={handleClearEvent}
                  />

                  {rowCount > PERFORMANCE_WARN_THRESHOLD && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400" role="status">
                      Большой список — возможны задержки при работе с колесом (скоро)
                    </p>
                  )}

                  {mode === "pick" && (
                    <PickerSection
                      title="Условия выбора"
                      hint={
                        pickCount > 1
                          ? `${pickCount} раундов — по одному участнику за нажатие`
                          : "Один раунд — один участник"
                      }
                    >
                      <div className="flex flex-wrap gap-3 items-end">
                        <label className="block">
                          <span className="text-[11px] text-gray-500 uppercase tracking-wide">
                            Количество
                          </span>
                          <input
                            type="number"
                            min={1}
                            max={excludePicked ? rowCount || 1 : undefined}
                            value={pickCount}
                            disabled={pickInProgress}
                            onChange={(e) => setPickCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                            className="mt-1 w-20 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm disabled:opacity-50"
                          />
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer pb-1.5">
                          <input
                            type="checkbox"
                            checked={excludePicked}
                            disabled={pickInProgress}
                            onChange={(e) => {
                              setExcludePicked(e.target.checked);
                              setPickedRowIndices([]);
                              setResult(null);
                            }}
                            className="rounded disabled:opacity-50"
                          />
                          <span className="text-xs text-gray-600 dark:text-gray-400">
                            Исключать выбранных из следующих раундов
                          </span>
                        </label>
                        {(pickedRowIndices.length > 0 || pickComplete) && (
                          <button
                            type="button"
                            onClick={handleResetPick}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline pb-1.5"
                          >
                            Сбросить выбор
                          </button>
                        )}
                      </div>

                      {pickCount > 1 && (
                      <fieldset className="space-y-1.5" disabled={pickInProgress}>
                        <legend className="text-[11px] text-gray-500 uppercase tracking-wide">
                          Нумерация мест
                        </legend>
                        <div className="flex flex-col gap-1.5 sm:flex-row sm:gap-4">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="pick-numbering"
                              checked={pickNumbering === "asc"}
                              onChange={() => {
                                setPickNumbering("asc");
                                setPickedRowIndices([]);
                                setResult(null);
                              }}
                              className="disabled:opacity-50"
                            />
                            <span className="text-xs text-gray-600 dark:text-gray-400">
                              С 1-го места (1 → {pickCount})
                            </span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="pick-numbering"
                              checked={pickNumbering === "desc"}
                              onChange={() => {
                                setPickNumbering("desc");
                                setPickedRowIndices([]);
                                setResult(null);
                              }}
                              className="disabled:opacity-50"
                            />
                            <span className="text-xs text-gray-600 dark:text-gray-400">
                              С {pickCount}-го места ({pickCount} → 1)
                            </span>
                          </label>
                        </div>
                      </fieldset>
                      )}

                      {pickCount > 1 && (
                        <div className="space-y-1.5" aria-live="polite">
                          <div className="flex gap-1">
                            {Array.from({ length: pickCount }, (_, i) => (
                              <div
                                key={i}
                                className={`h-1.5 flex-1 rounded-full transition-colors ${
                                  pickComplete
                                    ? "bg-emerald-500"
                                    : i < pickedRowIndices.length
                                      ? "bg-emerald-500"
                                      : i === pickedRowIndices.length
                                        ? "bg-indigo-400 dark:bg-indigo-500"
                                        : "bg-gray-200 dark:bg-gray-700"
                                }`}
                              />
                            ))}
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {pickComplete
                              ? `Завершено ${pickCount} из ${pickCount} раундов`
                              : `Раунд ${currentRound} из ${pickCount} · место ${currentPlace}`}
                          </p>
                        </div>
                      )}

                      {pickComplete && (
                        <div
                          role="status"
                          className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2.5 flex items-center gap-2"
                        >
                          <span className="text-emerald-600 dark:text-emerald-400 text-lg leading-none" aria-hidden>
                            ✓
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                              Выбор окончен
                            </p>
                            <p className="text-xs text-emerald-700/80 dark:text-emerald-300/80">
                              Выбрано {pickCount}{" "}
                              {pickCount === 1 ? "участник" : pickCount < 5 ? "участника" : "участников"}
                            </p>
                          </div>
                        </div>
                      )}

                      <PickerButton
                        onClick={handlePick}
                        disabledReason={pickComplete ? undefined : finalDisabledReason}
                        disabled={pickComplete || availableRows.length === 0}
                        className="w-full"
                      >
                        {pickComplete
                          ? "Выбор завершён"
                          : pickCount === 1
                            ? "Выбрать участника"
                            : `Раунд ${currentRound} из ${pickCount} · место ${currentPlace}`}
                      </PickerButton>
                    </PickerSection>
                  )}

                  {mode === "shuffle" && (
                    <PickerButton onClick={handleShuffle} disabledReason={finalDisabledReason} className="w-full">
                      Перемешать
                    </PickerButton>
                  )}

                  {mode === "groups" && (
                    <PickerSection title="Группы">
                      <label className="block">
                        <span className="text-[11px] text-gray-500 uppercase tracking-wide">Количество групп</span>
                        <input
                          type="number"
                          min={2}
                          value={groupCount}
                          onChange={(e) => {
                            setGroupCount(e.target.value);
                            const n = parseInt(e.target.value, 10);
                            if (Number.isFinite(n) && n > 0) {
                              setGroupNames((prev) => {
                                const next = [...prev];
                                while (next.length < n) next.push("");
                                return next.slice(0, n);
                              });
                            }
                          }}
                          className="mt-1 w-20 rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                        />
                      </label>
                      <PickerButton variant="ghost" onClick={() => setShowGroupNames((v) => !v)}>
                        {showGroupNames ? "Скрыть названия" : "Назвать группы"}
                      </PickerButton>
                      {showGroupNames &&
                        Array.from({ length: groupCountNum }, (_, i) => (
                          <input
                            key={i}
                            value={groupNames[i] ?? ""}
                            onChange={(e) => {
                              const next = [...groupNames];
                              next[i] = e.target.value;
                              setGroupNames(next);
                            }}
                            placeholder={`Группа ${i + 1}`}
                            className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                          />
                        ))}
                      <PickerButton onClick={handleGroups} disabledReason={finalDisabledReason} className="w-full">
                        Разделить
                      </PickerButton>
                    </PickerSection>
                  )}

                  <div ref={resultRef}>
                    {result && (
                      <div aria-live="polite" aria-atomic="true">
                        <ResultPanel record={result} />
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          <HistoryPanel history={history} onClear={() => setHistory([])} />
          <FooterBranding />
        </div>
      </div>
    </div>
  );
}
