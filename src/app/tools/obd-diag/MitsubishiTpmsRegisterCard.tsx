"use client";

import { useRef, useState } from "react";
import type { CatalogVehicle } from "@/lib/etacs-coding/diag-catalog";
import { parseMitsubishiModuleIdentity } from "@/lib/obd/mitsubishi-mut-monitor";
import type { TpmsModuleReport } from "@/lib/obd/mitsubishi-modules";
import type { ObdBleSession, ObdConnectionPhase } from "@/lib/obd/obd-session";
import {
  defaultRegistrationMode,
  formatRegistrationClock,
  orderedDidWheels,
  parseRegistrationAddress,
  tpmsEcusForAddress,
  TPMS_REGISTRATION_WINDOW_MS,
  type TpmsDidRecipe,
  type TpmsRegistrationRecipe,
  type TpmsRoutineProgress,
  type TpmsRoutineRecipe,
} from "@/lib/obd/mitsubishi-tpms-registration";

interface Props {
  session: ObdBleSession;
  phase: ObdConnectionPhase;
  vehicle: CatalogVehicle | null;
  disabled: boolean;
  onReport: (report: TpmsModuleReport) => void;
}

const ID_LABELS = ["ПЛ", "ПП", "ЗП", "ЗЛ", "Запас"];

interface LoadedRecipe {
  tx: number;
  rx: number;
  recipe: TpmsRegistrationRecipe;
  note: string | null;
}

async function readIdentity(
  session: ObdBleSession,
  tx: string,
  rx: string,
): Promise<{ partNumber: string | null; diagVersion: string | null }> {
  const readOnce = async () => {
    let partNumber: string | null = null;
    let diagVersion: string | null = null;
    for (const request of ["1A 9C", "1A 87", "21 87"]) {
      try {
        const { parsed } = await session.sendUds("6", tx, rx, request, false);
        if (parsed.kind !== "positive") continue;
        const identity = parseMitsubishiModuleIdentity(request, parsed.payload);
        partNumber = partNumber ?? identity.partNumber;
        diagVersion = diagVersion ?? identity.diagVersion;
      } catch {
        /* the next identification request */
      }
    }
    return { partNumber, diagVersion };
  };
  let identity = await readOnce();
  if (!identity.partNumber && !identity.diagVersion) {
    try {
      await session.sendUds("6", tx, rx, "10 92", false);
    } catch {
      /* the catalog profile is the fallback */
    }
    identity = await readOnce();
  }
  return identity;
}

function isRoutine(recipe: TpmsRegistrationRecipe): recipe is TpmsRoutineRecipe {
  return recipe.kind === "routine";
}

export function MitsubishiTpmsRegisterCard({ session, phase, vehicle, disabled, onReport }: Props) {
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<LoadedRecipe | null>(null);
  const [modeId, setModeId] = useState<string>("");
  const [progress, setProgress] = useState<TpmsRoutineProgress | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [didIds, setDidIds] = useState<Record<string, string>>({});
  const stopRef = useRef(false);

  const mode = loaded && isRoutine(loaded.recipe) ? loaded.recipe.modes.find((item) => item.id === modeId) ?? null : null;

  const prepare = async () => {
    if (disabled || busy || running) return;
    if (!vehicle) {
      setError("Сначала выберите машину в каталоге.");
      return;
    }
    if (phase !== "vehicle") {
      setError("Нужно соединение с автомобилем.");
      return;
    }
    setBusy(true);
    setError(null);
    setNote(null);
    setProgress(null);
    setLoaded(null);
    try {
      const report = await session.readTpmsSensors("mitsubishi-auto");
      onReport(report);
      const tx = parseRegistrationAddress(report.txHex);
      const rx = Number.parseInt(report.rxHex.replace(/^0x/i, ""), 16);
      if (tx == null || !Number.isInteger(rx)) {
        setError("Этот блок не входит в прописку Mitsubishi. Чтение ID остаётся.");
        return;
      }
      const candidates = tpmsEcusForAddress(vehicle.ecus, report.txHex);
      let next: LoadedRecipe | null = null;
      for (const ecu of candidates) {
        const identity = await readIdentity(session, ecu.txCanId, ecu.rxCanId);
        const query = new URLSearchParams({ vkey: vehicle.vkey, sysKey: String(ecu.sysKey) });
        if (identity.diagVersion) query.set("diagVersion", identity.diagVersion);
        if (identity.partNumber) query.set("partNumber", identity.partNumber);
        const response = await fetch(`/api/etacs-coding/diag/tpms-registration?${query.toString()}`);
        if (!response.ok) continue;
        const body = (await response.json()) as { recipe?: TpmsRegistrationRecipe; profileNoteRu?: string };
        if (!body.recipe) continue;
        next = { tx, rx, recipe: body.recipe, note: body.profileNoteRu ?? null };
        break;
      }
      if (!next) {
        setError("Для этой версии блока прописка не описана. Чтение давления и ID остаётся.");
        return;
      }
      setLoaded(next);
      if (isRoutine(next.recipe)) {
        setModeId(defaultRegistrationMode(next.recipe.modes)?.id ?? "");
      } else {
        const current = await session.readMitsubishiTpmsDidIds(next.tx, next.rx, next.recipe);
        const fields: Record<string, string> = {};
        for (const [position, id] of Object.entries(current)) fields[position] = id ?? "";
        setDidIds(fields);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось подготовить прописку");
    } finally {
      setBusy(false);
    }
  };

  const startRoutine = async () => {
    if (!loaded || !isRoutine(loaded.recipe) || !mode || running) return;
    const confirmed = window.confirm(
      `Набор ${mode.set}: ${mode.nameRu}.\n\nЗажигание включено, машина стоит. Этот набор будет перезаписан. Все ID нужно принять за 20 минут. Если не успеть, блок сотрёт ID, которые были прописаны раньше.`,
    );
    if (!confirmed) return;
    stopRef.current = false;
    setRunning(true);
    setError(null);
    setNote(null);
    setProgress({
      elapsedMs: 0,
      remainingMs: TPMS_REGISTRATION_WINDOW_MS,
      reception: [],
      ids: [null, null, null, null, null],
    });
    try {
      const result = await session.runMitsubishiTpmsRoutine({
        tx: loaded.tx,
        rx: loaded.rx,
        recipe: loaded.recipe,
        modeId: mode.id,
        shouldStop: () => stopRef.current,
        onProgress: setProgress,
      });
      setProgress(result);
      setNote(result.noteRu);
      onReport(await session.readTpmsSensors("mitsubishi-auto"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Прописка не выполнена");
    } finally {
      setRunning(false);
      stopRef.current = false;
    }
  };

  const writeDids = async (recipe: TpmsDidRecipe) => {
    if (!loaded || running) return;
    const confirmed = window.confirm(
      "Записать изменённые ID?\n\nПустые поля, 00000000 и FFFFFFFF не отправляются. Порядок: переднее левое, переднее правое, заднее правое, заднее левое.",
    );
    if (!confirmed) return;
    setRunning(true);
    setError(null);
    setNote(null);
    try {
      const result = await session.writeMitsubishiTpmsIds(loaded.tx, loaded.rx, recipe, didIds);
      const fields = { ...didIds };
      for (const item of result.written) fields[item.position] = item.readBack ?? item.id;
      setDidIds(fields);
      setNote(result.noteRu);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Запись ID не выполнена");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled || busy || running}
          onClick={() => void prepare()}
          className="rounded-lg border border-gray-900 px-3 py-1.5 text-[11px] font-medium text-gray-900 disabled:opacity-40"
        >
          {busy ? "Ищу рецепт…" : "Прописать датчики"}
        </button>
        {running && loaded && isRoutine(loaded.recipe) ? (
          <button
            type="button"
            onClick={() => {
              stopRef.current = true;
            }}
            className="rounded-lg bg-amber-600 px-3 py-1.5 text-[11px] font-medium text-white"
          >
            Стоп
          </button>
        ) : null}
      </div>
      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
      {loaded?.note ? <p className="mt-2 text-[11px] text-gray-500">{loaded.note}</p> : null}

      {loaded && isRoutine(loaded.recipe) ? (
        <div className="mt-2 space-y-2">
          <label className="block text-[11px] text-gray-700">
            Режим
            <select
              value={modeId}
              disabled={running}
              onChange={(event) => setModeId(event.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900"
            >
              {loaded.recipe.modes.map((item) => (
                <option key={item.id} value={item.id}>
                  Набор {item.set}: {item.nameRu}
                </option>
              ))}
            </select>
          </label>
          <p className="text-[11px] leading-snug text-gray-600">
            {mode?.method === "tool"
              ? "Держите триггер у вентиля около 5 секунд. Порядок: ПЛ, ПП, ЗП, ЗЛ."
              : "Сбросьте давление минимум на 20 кПа, до 174 кПа или ниже. ID может появиться примерно через минуту. Порядок колёс любой."}
          </p>
          <button
            type="button"
            disabled={running || !mode}
            onClick={() => void startRoutine()}
            className="rounded-lg border border-emerald-700 px-3 py-1.5 text-[11px] text-emerald-800 disabled:opacity-40"
          >
            Начать прописку
          </button>
          {progress ? (
            <div className="rounded-lg bg-gray-50 p-2">
              <div className="font-mono text-2xl font-bold text-gray-900">
                {formatRegistrationClock(progress.remainingMs)}
              </div>
              <ul className="mt-1 space-y-0.5 text-[11px] text-gray-700">
                {progress.reception.map((item, index) => (
                  <li key={item.lid}>
                    Датчик {index + 1}: {item.state === "received" ? "принят" : item.state === "waiting" ? "ждёт" : "нет ответа"}
                  </li>
                ))}
              </ul>
              <div className="mt-1 font-mono text-[10px] text-gray-600">
                {progress.ids.map((id, index) => `${ID_LABELS[index] ?? index + 1} ${id ?? "—"}`).join(" · ")}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {loaded && loaded.recipe.kind === "did" ? (
        <div className="mt-2 space-y-2">
          {orderedDidWheels(loaded.recipe.wheels).map((wheel) => (
            <label key={wheel.position} className="block text-[11px] text-gray-700">
              {wheel.labelRu}
              <input
                value={didIds[wheel.position] ?? ""}
                disabled={running}
                onChange={(event) =>
                  setDidIds((current) => ({ ...current, [wheel.position]: event.target.value.toUpperCase() }))
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 font-mono text-xs uppercase"
                spellCheck={false}
              />
            </label>
          ))}
          <button
            type="button"
            disabled={running}
            onClick={() => {
              if (loaded.recipe.kind === "did") void writeDids(loaded.recipe);
            }}
            className="rounded-lg border border-emerald-700 px-3 py-1.5 text-[11px] text-emerald-800 disabled:opacity-40"
          >
            Записать изменённые
          </button>
        </div>
      ) : null}
      {note ? <p className="mt-2 text-xs text-gray-800">{note}</p> : null}
    </div>
  );
}
