"use client";

import { useCallback, useState } from "react";
import type {
  ObdBleSession,
} from "@/lib/obd/obd-session";
import { parseUdsResponse } from "@/lib/obd/uds";
import type {
  SubaruResProbeResult,
  SubaruResRegistrationResult,
  SubaruResSystemType,
} from "@/lib/obd/subaru-res-cm-registration";

type ImmoSubTab = "read-keys" | "register-key" | "register-res";

interface Props {
  session: ObdBleSession;
  ready: boolean;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  setError: (error: string | null) => void;
}

export function SubaruImmoSection({
  session,
  ready,
  busy,
  setBusy,
  setError,
}: Props) {
  const [subTab, setSubTab] = useState<ImmoSubTab>("read-keys");
  const [resSystemType, setResSystemType] = useState<SubaruResSystemType>("auto");
  const [immoKeyCountRead, setImmoKeyCountRead] = useState<{
    ecuTx: string;
    did: string;
    count: number | null;
    rawHex: string;
    historyHex: string | null;
    lastFailureCodeHex: string | null;
  } | null>(null);
  const [immoLogLines, setImmoLogLines] = useState<string[]>([]);
  const [immoWizardStep, setImmoWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [immoDeleteConfirmOpen, setImmoDeleteConfirmOpen] = useState(false);
  const [immoDeleteConfirmTyped, setImmoDeleteConfirmTyped] = useState("");
  const [immoSeedHex, setImmoSeedHex] = useState<string | null>(null);
  const [immoKeyInputHex, setImmoKeyInputHex] = useState("");
  const [resProbe, setResProbe] = useState<SubaruResProbeResult | null>(null);
  const [resRegisterResult, setResRegisterResult] = useState<SubaruResRegistrationResult | null>(null);
  const [resConfirmOpen, setResConfirmOpen] = useState(false);
  const [resConfirmTyped, setResConfirmTyped] = useState("");

  const handleReadActualKeyCountOnly = useCallback(async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const logs: string[] = [];
    try {
      const elm = session.getElm();
      if (!elm) throw new Error("Адаптер vLinker не подключён");
      const targets =
        resSystemType === "h-type-7b4"
          ? [{ tx: 0x7b4, rx: 0x7bc, label: "7B4→7BC (H-type Smart Key)" }]
          : resSystemType === "d-type-751"
            ? [{ tx: 0x751, rx: 0x759, label: "751→759 (D-type Keyless)" }]
            : resSystemType === "key-biu-752"
              ? [{ tx: 0x752, rx: 0x75a, label: "752→75A (BIU Key-Start)" }]
              : [
                  { tx: 0x7b4, rx: 0x7bc, label: "7B4→7BC (H-type Smart Key)" },
                  { tx: 0x751, rx: 0x759, label: "751→759 (D-type Keyless)" },
                  { tx: 0x752, rx: 0x75a, label: "752→75A (BIU Key-Start)" },
                  { tx: 0x750, rx: 0x758, label: "750→758 (Keyless)" },
                ];

      let found = false;
      for (const t of targets) {
        await elm.setCanHeader(t.tx, t.rx);
        try {
          await elm.sendPayload("1003", 1000);
        } catch {
          /* ignore */
        }
        const didList = t.tx === 0x752 ? ["1158", "1378"] : ["1378", "1044"];
        for (const did of didList) {
          const raw = await elm.sendPayload(`22${did}`, 1200);
          const p = parseUdsResponse(raw, 0x22);
          if (p.kind === "positive" && p.payload.length >= 3) {
            const countByte = p.payload[2] ?? 0;
            const count = countByte >= 8 ? 0 : countByte;
            const rawHex = p.payload
              .slice(2)
              .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
              .join(" ");
            let historyHex: string | null = null;
            let lastFailureCodeHex: string | null = null;
            try {
              const r60 = await elm.sendPayload("221360", 1000);
              const p60 = parseUdsResponse(r60, 0x22);
              if (p60.kind === "positive") {
                historyHex = p60.payload
                  .slice(2)
                  .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
                  .join(" ");
              }
              const r7a = await elm.sendPayload("22137A", 1000);
              const p7a = parseUdsResponse(r7a, 0x22);
              if (p7a.kind === "positive") {
                lastFailureCodeHex = p7a.payload
                  .slice(2)
                  .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
                  .join(" ");
              }
            } catch {
              /* ignore */
            }
            setImmoKeyCountRead({
              ecuTx: t.label,
              did,
              count,
              rawHex,
              historyHex,
              lastFailureCodeHex,
            });
            logs.push(`✓ ${t.label} DID ${did}: прописано ключей = ${count} шт. (${rawHex})`);
            found = true;
            break;
          }
        }
        if (found) break;
      }
      if (!found) {
        logs.push("Блок иммобилайзера не вернул DID 1378 / 1158. Проверьте IG ON и тип системы.");
      }
      setImmoLogLines((prev) => [...prev, ...logs]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка чтения количества ключей");
    } finally {
      setBusy(false);
    }
  }, [ready, busy, resSystemType, session, setBusy, setError]);

  const handleExecuteDeleteOtherKeys = useCallback(async () => {
    if (!ready || busy) return;
    if (immoDeleteConfirmTyped.trim().toUpperCase() !== "DELETE") return;
    setImmoDeleteConfirmOpen(false);
    setImmoDeleteConfirmTyped("");
    setBusy(true);
    setError(null);
    const logs: string[] = [
      "=== Удаление всех ключей кроме присутствующего в салоне (IMM-070.srp / IMM-016.srp) ===",
    ];
    try {
      const elm = session.getElm();
      if (!elm) throw new Error("Адаптер не подключён");

      if (resSystemType === "key-biu-752") {
        await elm.setCanHeader(0x752, 0x75a);
        await elm.sendPayload("1003", 1000);
        const rStart = await elm.sendPayload("31014004", 4000);
        logs.push(`752→75A: 31 01 40 04 → ${rStart.replace(/>/g, "").trim()}`);
        const pStart = parseUdsResponse(rStart, 0x31);
        if (pStart.kind === "positive") {
          const rPoll = await elm.sendPayload("31034004", 4000);
          logs.push(`752→75A: 31 03 40 04 → ${rPoll.replace(/>/g, "").trim()}`);
        }
        await elm.sendPayload("1001", 800);
      } else {
        const target =
          resSystemType === "d-type-751"
            ? { tx: 0x751, rx: 0x759, hex: "751→759 (D-type · IMM-016.srp)" }
            : { tx: 0x7b4, rx: 0x7bc, hex: "7B4→7BC (H-type · IMM-070.srp)" };
        await elm.setCanHeader(target.tx, target.rx);
        await elm.sendPayload("1003", 1000);
        const rDel = await elm.sendPayload("2E11C102", 3000);
        const pDel = parseUdsResponse(rDel, 0x2e);
        logs.push(`${target.hex}: 2E 11 C1 02 → ${rDel.replace(/>/g, "").trim()}`);
        if (pDel.kind === "positive") {
          logs.push("→ Поднесите ОДИН сохраняемый смарт-ключ к кнопке ENGINE START/STOP…");
          for (let i = 1; i <= 8; i++) {
            const r69 = await elm.sendPayload("221369", 2000);
            const p69 = parseUdsResponse(r69, 0x22);
            logs.push(`${target.hex}: 22 13 69 (${i}/8) → ${r69.replace(/>/g, "").trim()}`);
            if (p69.kind === "positive" && p69.payload[2] === 0x00) {
              logs.push("✓ Сохраняемый ключ распознан (62 13 69 00)! Уберите ключ от кнопки.");
              break;
            }
          }
          await elm.sendPayload("22136A", 1500);
          const r78After = await elm.sendPayload("221378", 1500);
          logs.push(`${target.hex}: 22 13 78 (остаток ключей) → ${r78After.replace(/>/g, "").trim()}`);
          await elm.sendPayload("2E11C100", 2000);
        } else if (pDel.kind === "negative" && pDel.nrc === 0x33) {
          logs.push("NRC 33 SecurityAccess: сначала разблокируйте блок (27 07/08 или 27 03/04).");
        }
        await elm.sendPayload("1001", 800);
      }
      setImmoLogLines((prev) => [...prev, ...logs]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка удаления ключей");
    } finally {
      setBusy(false);
    }
  }, [ready, busy, immoDeleteConfirmTyped, resSystemType, session, setBusy, setError]);

  const handleRunPushStartWizardStep = useCallback(
    async (step: 1 | 2 | 3 | 4) => {
      if (!ready || busy) return;
      setBusy(true);
      setError(null);
      const logs: string[] = [];
      try {
        const elm = session.getElm();
        if (!elm) throw new Error("Адаптер vLinker не подключён");
        const target =
          resSystemType === "d-type-751"
            ? { tx: 0x751, rx: 0x759, hex: "751→759 (D-type · IMM-012)" }
            : { tx: 0x7b4, rx: 0x7bc, hex: "7B4→7BC (H-type · IMM-066)" };

        await elm.setCanHeader(target.tx, target.rx);
        await elm.sendPayload("1003", 1000);
        await elm.sendPayload("3E00", 800);

        if (step === 1) {
          logs.push(`=== Шаг 1/4: Чтение числа ключей и статуса (${target.hex}) ===`);
          for (const did of ["1378", "1360", "137A"]) {
            const raw = await elm.sendPayload(`22${did}`, 1000);
            const p = parseUdsResponse(raw, 0x22);
            if (p.kind === "positive") {
              const body = p.payload.slice(2);
              const hexStr = body.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
              if (did === "1378") {
                const count = (body[0] ?? 0) >= 8 ? 0 : (body[0] ?? 0);
                logs.push(`✓ DID 1378 (Зарегистрировано ключей): ${count} шт. (${hexStr})`);
              } else {
                logs.push(`✓ DID ${did}: ${hexStr}`);
              }
            }
          }
          setImmoWizardStep(2);
        } else if (step === 2) {
          logs.push(`=== Шаг 2/4: Верификация РАБОЧЕГО ключа у кнопки START/STOP (${target.hex}) ===`);
          const rawStart = await elm.sendPayload("2E11C101", 3000);
          logs.push(`${target.hex}: 2E 11 C1 01 → ${rawStart.replace(/>/g, "").trim()}`);
          for (let poll = 1; poll <= 5; poll++) {
            const raw69 = await elm.sendPayload("221369", 2000);
            logs.push(`${target.hex}: 22 13 69 (${poll}/5) → ${raw69.replace(/>/g, "").trim()}`);
            const p69 = parseUdsResponse(raw69, 0x22);
            if (p69.kind === "positive" && p69.payload[2] === 0x00) {
              logs.push("✓ Рабочий ключ подтверждён (62 13 69 00)! Уберите его от кнопки.");
              break;
            }
          }
          setImmoWizardStep(3);
        } else if (step === 3) {
          logs.push(`=== Шаг 3/4: Приложите НОВЫЙ смарт-ключ к кнопке START/STOP (${target.hex}) ===`);
          await elm.sendPayload("22136A", 2000);
          for (let poll = 1; poll <= 5; poll++) {
            const r73 = await elm.sendPayload("221373", 2000);
            logs.push(`${target.hex}: 22 13 73 (${poll}/5) → ${r73.replace(/>/g, "").trim()}`);
            const p73 = parseUdsResponse(r73, 0x22);
            if (p73.kind === "positive" && p73.payload[2] === 0x00) {
              logs.push("✓ Новый смарт-ключ считан катушкой (62 13 73 00)!");
              break;
            }
          }
          setImmoWizardStep(4);
        } else if (step === 4) {
          logs.push(`=== Шаг 4/4: Завершение (2E 11 C1 00) и проверка числа ключей (22 13 78) ===`);
          const rEnd = await elm.sendPayload("2E11C100", 2500);
          logs.push(`${target.hex}: 2E 11 C1 00 → ${rEnd.replace(/>/g, "").trim()}`);
          const r78 = await elm.sendPayload("221378", 1500);
          logs.push(`${target.hex}: 22 13 78 → ${r78.replace(/>/g, "").trim()}`);
          await elm.sendPayload("1001", 800);
        }
        setImmoLogLines((prev) => [...prev, ...logs]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка шага мастера прописки ключа");
      } finally {
        setBusy(false);
      }
    },
    [ready, busy, resSystemType, session, setBusy, setError],
  );

  const handleRequestImmoSeed = useCallback(async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const logs: string[] = [];
    try {
      const elm = session.getElm();
      if (!elm) throw new Error("Адаптер не подключён");
      const target =
        resSystemType === "d-type-751"
          ? { tx: 0x751, rx: 0x759, hex: "751→759", subs: ["2703", "2707", "2701"] as const }
          : resSystemType === "key-biu-752"
            ? { tx: 0x752, rx: 0x75a, hex: "752→75A", subs: ["2703", "2707", "2701"] as const }
            : { tx: 0x7b4, rx: 0x7bc, hex: "7B4→7BC", subs: ["2707", "2703", "2701"] as const };

      await elm.setCanHeader(target.tx, target.rx);
      await elm.sendPayload("1003", 1200);
      for (const sub of target.subs) {
        const raw = await elm.sendPayload(sub, 2000);
        const clean = raw.replace(/>/g, "").trim();
        const p = parseUdsResponse(raw, 0x27);
        logs.push(`${target.hex}: Запрос Seed (${sub.slice(0, 2)} ${sub.slice(2)}) → ${clean}`);
        if (p.kind === "positive" && p.payload.length >= 2) {
          const seedBytes = p.payload.slice(1);
          const seedStr = seedBytes.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
          setImmoSeedHex(seedStr);
          logs.push(`✓ Получен Seed (${seedBytes.length} байт): ${seedStr}`);
          break;
        }
      }
      setImmoLogLines((prev) => [...prev, ...logs]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка запроса Seed");
    } finally {
      setBusy(false);
    }
  }, [ready, busy, resSystemType, session, setBusy, setError]);

  const handleUnlockImmoWithKey = useCallback(async () => {
    if (!ready || busy) return;
    const cleanKey = immoKeyInputHex.replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
    if (cleanKey.length < 4 || cleanKey.length % 2 !== 0) {
      setError("Введите корректный ответный Key в HEX (8 или 32 символа)");
      return;
    }
    setBusy(true);
    setError(null);
    const logs: string[] = [];
    try {
      const elm = session.getElm();
      if (!elm) throw new Error("Адаптер не подключён");
      const target =
        resSystemType === "d-type-751"
          ? { tx: 0x751, rx: 0x759, hex: "751→759", keySub: cleanKey.length === 32 ? "2708" : "2704" }
          : resSystemType === "key-biu-752"
            ? { tx: 0x752, rx: 0x75a, hex: "752→75A", keySub: cleanKey.length >= 12 ? "2708" : "2704" }
            : { tx: 0x7b4, rx: 0x7bc, hex: "7B4→7BC", keySub: cleanKey.length === 8 ? "2704" : "2708" };

      await elm.setCanHeader(target.tx, target.rx);
      await elm.sendPayload("1003", 1000);
      const raw27 = await elm.sendPayload(`${target.keySub}${cleanKey}`, 3000);
      logs.push(`${target.hex}: Отправка Key (${target.keySub}) → ${raw27.replace(/>/g, "").trim()}`);
      setImmoLogLines((prev) => [...prev, ...logs]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка отправки Key");
    } finally {
      setBusy(false);
    }
  }, [ready, busy, immoKeyInputHex, resSystemType, session, setBusy, setError]);

  const handleProbeResCm = useCallback(async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await session.probeSubaruResCm("6");
      setResProbe(result);
      setImmoLogLines((prev) => [...prev, ...result.steps]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка опроса RES CM");
    } finally {
      setBusy(false);
    }
  }, [ready, busy, session, setBusy, setError]);

  const handleRegisterResCm = useCallback(async () => {
    if (!ready || busy) return;
    if (resConfirmTyped.trim().toUpperCase() !== "YES") return;
    setResConfirmOpen(false);
    setResConfirmTyped("");
    setBusy(true);
    setError(null);
    try {
      const result = await session.registerSubaruResCm("6", { systemType: resSystemType });
      setResRegisterResult(result);
      setImmoLogLines((prev) => [...prev, ...result.steps]);
      if (!result.success) {
        setError(result.steps.at(-1) ?? "Блок не подтвердил прописку RES.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка привязки RES");
    } finally {
      setBusy(false);
    }
  }, [ready, busy, resConfirmTyped, resSystemType, session, setBusy, setError]);

  return (
    <div className="space-y-3">
      {/* Immobilizer Type Selector */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 space-y-1.5">
        <label className="block text-xs font-bold text-blue-950">
          Тип системы иммобилайзера (`IMM-000.srp`):
        </label>
        <select
          value={resSystemType}
          onChange={(e) => setResSystemType(e.target.value as SubaruResSystemType)}
          className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-semibold text-gray-900"
        >
          <option value="auto">
            Автоопределение по CAN (7B4 H-type SGP → 751 D-type → 752 BIU)
          </option>
          <option value="h-type-7b4">
            H-type · Push Start SGP (Outback BT / Forester SK / Ascent · 7B4→7BC)
          </option>
          <option value="d-type-751">
            D-type · Push Start до SGP (Outback BS / Legacy BN / Forester SJ · 751→759)
          </option>
          <option value="key-biu-752">
            B-type / G-type · Замок с ключом (BIU 752→75A)
          </option>
        </select>
      </div>

      {/* 3 Sub-tabs: Read Keys / Register Key / Register RES */}
      <div className="flex rounded-xl border border-gray-200 bg-gray-50 p-1">
        <button
          type="button"
          onClick={() => setSubTab("read-keys")}
          className={`flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition ${
            subTab === "read-keys" ? "bg-gray-900 text-white" : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Считать ключи
        </button>
        <button
          type="button"
          onClick={() => setSubTab("register-key")}
          className={`flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition ${
            subTab === "register-key" ? "bg-gray-900 text-white" : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Прописать ключ
        </button>
        <button
          type="button"
          onClick={() => setSubTab("register-res")}
          className={`flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition ${
            subTab === "register-res" ? "bg-gray-900 text-white" : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Прописать RES
        </button>
      </div>

      {subTab === "read-keys" && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-gray-900">
                Количество прописанных ключей и история (`IMM-069 / IMM-073`)
              </h3>
              <p className="text-xs text-gray-500">
                Чтение регистра `DID 1378` (число смарт-ключей), истории `DID 1360` и кода ошибки `DID 137A`.
              </p>
            </div>
            <button
              type="button"
              disabled={!ready || busy}
              onClick={() => void handleReadActualKeyCountOnly()}
              className="rounded-xl bg-emerald-700 hover:bg-emerald-800 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              Считать ключи (`22 1378`)
            </button>
          </div>

          {immoKeyCountRead && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3">
                <div className="text-[10px] font-bold uppercase text-emerald-800">
                  Зарегистрировано ключей
                </div>
                <div className="mt-1 font-mono text-2xl font-bold text-emerald-900">
                  {immoKeyCountRead.count != null ? `${immoKeyCountRead.count} шт.` : "—"}
                </div>
                <div className="font-mono text-[11px] text-gray-600">
                  {immoKeyCountRead.ecuTx} · DID {immoKeyCountRead.did}
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="text-[10px] font-bold uppercase text-gray-600">
                  История (`DID 1360`)
                </div>
                <div className="mt-1 font-mono text-sm font-bold text-gray-900">
                  {immoKeyCountRead.historyHex ?? "—"}
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="text-[10px] font-bold uppercase text-gray-600">
                  Последний отказ (`DID 137A`)
                </div>
                <div className="mt-1 font-mono text-sm font-bold text-gray-900">
                  {immoKeyCountRead.lastFailureCodeHex ?? "00 (Ошибок нет)"}
                </div>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3.5 flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-rose-950">
                Удаление утерянных ключей (`IMM-070.srp` · `2E 11 C1 02`)
              </div>
              <p className="text-[11px] text-gray-700">
                Оставляет в памяти только 1 ключ, приложенный к кнопке START/STOP, и стирает все остальные.
              </p>
            </div>
            <button
              type="button"
              disabled={!ready || busy}
              onClick={() => {
                setImmoDeleteConfirmTyped("");
                setImmoDeleteConfirmOpen(true);
              }}
              className="rounded-lg bg-rose-700 hover:bg-rose-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
            >
              Удалить остальные ключи
            </button>
          </div>
        </div>
      )}

      {subTab === "register-key" && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-gray-900">
                Прописать смарт-ключ (`IMM-066.srp` · `7B4` / `IMM-012.srp` · `751`)
              </h3>
              <p className="text-xs text-gray-500">
                Пошаговая дозапись через катушку кнопки START/STOP (`2E 11 C1 01` → `22 13 69` → `22 13 73` → `2E 11 C1 00`).
              </p>
            </div>
            <button
              type="button"
              onClick={() => setImmoWizardStep(1)}
              className="rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1 text-[11px] font-semibold text-gray-700"
            >
              Сбросить на Шаг 1
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(
              [
                {
                  step: 1 as const,
                  title: "Шаг 1. Статус и число ключей",
                  fnName: "22 13 78 / 13 60",
                  desc: "Зажигание IG ON. Чтение текущего числа ключей (DID 1378).",
                  btn: "1. Проверить статус",
                },
                {
                  step: 2 as const,
                  title: "Шаг 2. Приложите РАБОЧИЙ ключ",
                  fnName: "2E 11 C1 01 → 22 13 69",
                  desc: "Поднесите рабочий ключ эмблемой к кнопке START/STOP до 62 13 69 00.",
                  btn: "2. Верифицировать рабочий ключ",
                },
                {
                  step: 3 as const,
                  title: "Шаг 3. Приложите НОВЫЙ ключ",
                  fnName: "22 13 6A → 22 13 73",
                  desc: "Уберите старый ключ и поднесите НОВЫЙ смарт-ключ к кнопке START/STOP.",
                  btn: "3. Записать новый ключ",
                },
                {
                  step: 4 as const,
                  title: "Шаг 4. Завершение и проверка",
                  fnName: "2E 11 C1 00 → 22 13 78",
                  desc: "Выход из режима 2E 11 C1 00 и чтение нового количества ключей.",
                  btn: "4. Завершить запись",
                },
              ]
            ).map((item) => {
              const isCurrent = immoWizardStep === item.step;
              return (
                <div
                  key={item.step}
                  className={`rounded-xl border p-3 flex flex-col justify-between gap-2 ${
                    isCurrent ? "border-emerald-600 bg-emerald-50/40" : "border-gray-200 bg-gray-50/50"
                  }`}
                >
                  <div>
                    <div className="font-mono text-[10px] font-bold text-emerald-800">{item.fnName}</div>
                    <div className="text-xs font-bold text-gray-900">{item.title}</div>
                    <p className="text-[11px] text-gray-600">{item.desc}</p>
                  </div>
                  <button
                    type="button"
                    disabled={!ready || busy}
                    onClick={() => void handleRunPushStartWizardStep(item.step)}
                    className="w-full rounded-lg bg-gray-900 hover:bg-gray-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                  >
                    ▶ {item.btn}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Optional SecurityAccess 27 07/08 or 27 03/04 */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-gray-900">
                Разблокировка SecurityAccess (`27 07→27 08` / `27 03→27 04`), если блок вернул `NRC 33`:
              </span>
              <button
                type="button"
                disabled={!ready || busy}
                onClick={() => void handleRequestImmoSeed()}
                className="rounded-lg border border-gray-400 bg-white px-2.5 py-1 text-xs font-semibold text-gray-900 disabled:opacity-40"
              >
                Запросить Seed (`27 07 / 03`)
              </button>
            </div>
            {immoSeedHex && (
              <div className="rounded bg-white px-2.5 py-1.5 font-mono text-xs text-blue-900 border border-blue-200">
                Seed: <strong>{immoSeedHex}</strong>
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={immoKeyInputHex}
                onChange={(e) => setImmoKeyInputHex(e.target.value.toUpperCase())}
                placeholder="Ответный Key (HEX)"
                className="flex-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 font-mono text-xs uppercase"
              />
              <button
                type="button"
                disabled={!ready || busy || !immoKeyInputHex.trim()}
                onClick={() => void handleUnlockImmoWithKey()}
                className="rounded-lg bg-blue-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
              >
                Отправить Key
              </button>
            </div>
          </div>
        </div>
      )}

      {subTab === "register-res" && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <div>
            <h3 className="text-sm font-bold text-gray-900">
              Прописка блока автозапуска Remote Engine Start (`IMM-071 / 017 / 005 / 064`)
            </h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Push-Start (`7B4→7BC` / `751→759`): запись `2E 11 B0 01` → `6E 11 B0`. Замок с ключом (`752→75A`): рутина `31 01 40 05` → `31 03 40 05`.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleProbeResCm()}
              disabled={!ready || busy}
              className="rounded-xl bg-blue-800 hover:bg-blue-900 px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-40"
            >
              1. Опросить блоки (7B4 / 751 / 752 / 750)
            </button>
            <button
              type="button"
              onClick={() => {
                setResConfirmTyped("");
                setResConfirmOpen(true);
              }}
              disabled={!ready || busy}
              className="rounded-xl bg-gray-900 hover:bg-gray-800 px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-40"
            >
              2. Прописать RES
            </button>
          </div>

          {resProbe && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/40 px-3 py-2 text-xs space-y-1">
              {resProbe.modules.map((mod) => (
                <div key={mod.txHex} className="flex flex-wrap justify-between gap-2 font-mono text-[11px]">
                  <span className={mod.responded ? "font-bold text-emerald-800" : "text-gray-500"}>
                    {mod.txHex}→{mod.rxHex} {mod.titleRu}
                  </span>
                  <span className="text-gray-700">
                    {mod.responded ? "✓" : "—"} {mod.partNumber ?? ""} {mod.noteRu}
                  </span>
                </div>
              ))}
            </div>
          )}

          {resRegisterResult && (
            <div
              className={`rounded-lg border px-3 py-2 text-xs space-y-1 ${
                resRegisterResult.success
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-rose-200 bg-rose-50"
              }`}
            >
              <div className="font-bold">
                {resRegisterResult.success
                  ? `RES CM прописан (${resRegisterResult.acceptedTx} · ${resRegisterResult.acceptedPayload})`
                  : "Блок не подтвердил прописку RES"}
              </div>
              <ul className="max-h-32 overflow-y-auto space-y-0.5 font-mono text-[10px] text-gray-700">
                {resRegisterResult.steps.map((step, idx) => (
                  <li key={idx}>• {step}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Immobilizer Log */}
      {immoLogLines.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-700">Журнал иммобилайзера</span>
            <button
              type="button"
              onClick={() => setImmoLogLines([])}
              className="text-[11px] text-gray-500 hover:text-gray-800"
            >
              Очистить
            </button>
          </div>
          <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] text-gray-800">
            {immoLogLines.join("\n")}
          </pre>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {immoDeleteConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setImmoDeleteConfirmOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-rose-300 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-bold text-gray-900">Удалить остальные ключи?</h2>
            <p className="mt-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-950">
              Все ключи, кроме одного ключа, который вы поднесёте к кнопке ENGINE START/STOP, будут удалены.
            </p>
            <label className="mt-3 block space-y-1">
              <span className="text-xs font-medium text-gray-900">
                Введите <code className="font-mono font-bold">DELETE</code>:
              </span>
              <input
                type="text"
                value={immoDeleteConfirmTyped}
                onChange={(e) => setImmoDeleteConfirmTyped(e.target.value.toUpperCase())}
                className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 font-mono text-sm font-bold uppercase"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setImmoDeleteConfirmOpen(false)}
                className="rounded-xl border border-gray-300 bg-gray-100 px-4 py-2 text-xs font-semibold text-gray-900"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={immoDeleteConfirmTyped.trim().toUpperCase() !== "DELETE"}
                onClick={() => void handleExecuteDeleteOtherKeys()}
                className="rounded-xl bg-rose-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RES Confirm Modal */}
      {resConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setResConfirmOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-blue-300 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-bold text-gray-900">Прописать блок RES?</h2>
            <p className="mt-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-950">
              IG ON, рабочий ключ в салоне. Отправляет `2E 11 B0 01` (`7B4`/`751`) или `31 01 40 05` (`752`).
            </p>
            <label className="mt-3 block space-y-1">
              <span className="text-xs font-medium text-gray-900">
                Введите <code className="font-mono font-bold">YES</code>:
              </span>
              <input
                type="text"
                value={resConfirmTyped}
                onChange={(e) => setResConfirmTyped(e.target.value.toUpperCase())}
                className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 font-mono text-sm font-bold uppercase"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setResConfirmOpen(false)}
                className="rounded-xl border border-gray-300 bg-gray-100 px-4 py-2 text-xs font-semibold text-gray-900"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={resConfirmTyped.trim().toUpperCase() !== "YES"}
                onClick={() => void handleRegisterResCm()}
                className="rounded-xl bg-gray-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
              >
                Прописать RES
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
