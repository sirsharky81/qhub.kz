"use client";

import { useState } from "react";
import type { EtacsAccessCheckResult } from "@/lib/etacs-coding/licensing";
import { PickerButton } from "../random-picker/components/PickerButton";
import { redeemEtacsCodeApi, requestEtacsUnlockApi } from "./api-client";

interface Props {
  open: boolean;
  onClose: () => void;
  vin?: string;
  ecuId?: string;
  model?: string;
  fileKind?: "kon" | "cuf";
  licenseStatus: EtacsAccessCheckResult | null;
  storedPromoCode: string;
  onSavePromoCode: (code: string) => void;
  onRefreshStatus: () => Promise<void>;
}

export function EtacsUnlockModal({
  open,
  onClose,
  vin,
  ecuId,
  model,
  fileKind = "cuf",
  licenseStatus,
  storedPromoCode,
  onSavePromoCode,
  onRefreshStatus,
}: Props) {
  const [tab, setTab] = useState<"request" | "code">("request");
  const [codeDraft, setCodeDraft] = useState(storedPromoCode);
  const [contact, setContact] = useState("");
  const [plan, setPlan] = useState<"cuf_vin" | "single_vin" | "pro_month" | "pro_year">(() =>
    fileKind === "kon" ? "single_vin" : "cuf_vin",
  );
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!open) return null;

  const settings = licenseStatus?.settings ?? {
    enforcePaywall: false,
    cufVinPriceKzt: 1500,
    singleVinPriceKzt: 3500,
    proMonthPriceKzt: 8000,
    proYearPriceKzt: 30000,
    paymentInstructions:
      "Переведите сумму выбранного тарифа на Kaspi и укажите ваш телефон или Telegram в заявке ниже. После подтверждения доступ к VIN или PRO-код активируется мгновенно.",
    kaspiPhoneOrLink: "По номеру Kaspi / в Telegram",
  };

  const cleanVin = (vin ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const hasValidVin = cleanVin.length >= 6 && cleanVin !== "PROTARIFF";
  const isSingleVinPlan = plan === "cuf_vin" || plan === "single_vin";
  const isVinMissingForPlan = isSingleVinPlan && !hasValidVin;

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const clean = codeDraft.trim().toUpperCase();
      if (!clean.startsWith("PRO-") && !hasValidVin) {
        throw new Error(
          "Для активации кода на 1 автомобиль сначала откройте файл .kon / .cuf в слоте A или выгрузите кодировку с блока, чтобы определить ваш VIN.",
        );
      }
      if (!clean.startsWith("PRO-") && hasValidVin) {
        const agreed = window.confirm(
          `Внимание! Код активации ${clean} будет навсегда привязан к выгруженному вами VIN:\n\n${cleanVin}\n\nПродолжить активацию?`,
        );
        if (!agreed) {
          setBusy(false);
          return;
        }
      }
      const res = await redeemEtacsCodeApi({
        code: clean,
        vin: cleanVin || undefined,
        ecuId,
      });
      onSavePromoCode(clean);
      setSuccessMsg(res.message);
      await onRefreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось активировать код");
    } finally {
      setBusy(false);
    }
  };

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (isSingleVinPlan && !hasValidVin) {
      setError(
        "Сначала откройте файл .kon / .cuf в слоте A или выгрузите кодировку с блока, чтобы определить VIN вашего автомобиля.",
      );
      return;
    }

    if (isSingleVinPlan && hasValidVin) {
      const tariffName =
        plan === "cuf_vin"
          ? `Custom Coding (.cuf) — ${settings.cufVinPriceKzt.toLocaleString("ru")} ₸`
          : `Полный доступ (.kon + .cuf) — ${settings.singleVinPriceKzt.toLocaleString("ru")} ₸`;
      const agreed = window.confirm(
        `Внимание! Доступ по тарифу «${tariffName}» будет привязан к открытому/выгруженному вами VIN:\n\nVIN: ${cleanVin}\n\nОтправить заявку на этот VIN?`,
      );
      if (!agreed) return;
    }

    setBusy(true);
    try {
      const res = await requestEtacsUnlockApi({
        vin: cleanVin || undefined,
        ecuId: [ecuId, model].filter(Boolean).join(" · "),
        contact,
        plan,
        comment,
      });
      setSuccessMsg(res.message);
      setComment("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отправить заявку");
    } finally {
      setBusy(false);
    }
  };

  const reasonLabel = () => {
    if (!licenseStatus) return "Проверка…";
    if (licenseStatus.reason === "admin") return "Администратор (Полный доступ .kon + .cuf)";
    if (licenseStatus.reason === "vin_unlocked_full") {
      return `VIN ${licenseStatus.vin} открыт полностью (.kon + .cuf)`;
    }
    if (licenseStatus.reason === "vin_unlocked_cuf") {
      return `VIN ${licenseStatus.vin}: открыт Custom (.cuf — зеркала и комфорт)`;
    }
    if (licenseStatus.reason === "cuf_only_need_kon_upgrade") {
      return `VIN ${licenseStatus.vin}: открыт .cuf (для .kon нужен полный доступ)`;
    }
    if (licenseStatus.reason === "pro_code") {
      return `Активен PRO-ключ (${licenseStatus.promoRecord?.code || storedPromoCode})`;
    }
    if (!licenseStatus.enforcePaywall) return "Открытый доступ (Free + запись)";
    return "Бесплатный режим (Чтение с блока, бэкап и просмотр параметров)";
  };

  return (
    <div
      className="fixed inset-0 z-[65] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="max-h-[92dvh] w-full max-w-lg overflow-auto rounded-t-2xl border border-gray-200 bg-white p-4 shadow-2xl sm:rounded-2xl sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b border-gray-100 pb-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              Доступ к сохранению и записи в блок
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Чтение с блока, сохранение заводского оригинала и просмотр всех параметров —{" "}
              <strong className="text-gray-700">всегда бесплатно</strong>. Для записи изменений выберите народный тариф{" "}
              <code className="font-mono font-semibold text-emerald-700">.cuf</code> (зеркала, комфорт) или полный{" "}
              <code className="font-mono font-semibold text-blue-700">.kon + .cuf</code>.
            </p>
          </div>
          <PickerButton variant="ghost" onClick={onClose} disabled={busy} ariaLabel="Закрыть">
            ✕
          </PickerButton>
        </div>

        {/* Текущий статус */}
        <div
          className={`mt-3 rounded-xl border px-3 py-2.5 text-xs ${
            licenseStatus?.allowed
              ? "border-emerald-200 bg-emerald-50 text-emerald-950"
              : "border-amber-200 bg-amber-50 text-amber-950"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-[11px] uppercase tracking-wider opacity-75">Статус: </span>
              <strong className="font-semibold">{reasonLabel()}</strong>
            </div>
            {hasValidVin ? (
              <span className="rounded bg-white/80 px-2 py-0.5 font-mono text-[11px] font-bold text-gray-800">
                VIN: {cleanVin}
              </span>
            ) : (
              <span className="rounded bg-red-100 px-2 py-0.5 text-[10.5px] font-semibold text-red-800">
                Файл не открыт (VIN не определён)
              </span>
            )}
          </div>
        </div>

        {/* Переключатель вкладок */}
        <div className="mt-3.5 grid grid-cols-2 gap-1.5 rounded-xl bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => {
              setTab("request");
              setError(null);
              setSuccessMsg(null);
            }}
            className={`rounded-lg py-1.5 text-xs font-semibold transition ${
              tab === "request"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Выбрать тариф (Kaspi)
          </button>
          <button
            type="button"
            onClick={() => {
              setTab("code");
              setError(null);
              setSuccessMsg(null);
            }}
            className={`rounded-lg py-1.5 text-xs font-semibold transition ${
              tab === "code" ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            У меня есть код
          </button>
        </div>

        {error ? (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            {error}
          </div>
        ) : null}

        {successMsg ? (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-medium text-emerald-900">
            {successMsg}
          </div>
        ) : null}

        {tab === "request" ? (
          <form onSubmit={handleRequest} className="mt-3.5 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {/* Народный тариф CUF */}
              <button
                type="button"
                onClick={() => setPlan("cuf_vin")}
                className={`relative flex flex-col rounded-xl border p-2.5 text-left transition ${
                  plan === "cuf_vin"
                    ? "border-emerald-700 bg-emerald-900 text-white ring-1 ring-emerald-700"
                    : "border-emerald-200 bg-emerald-50/50 text-gray-900 hover:border-emerald-300"
                }`}
              >
                <span className="flex items-center justify-between gap-1 text-[10px] font-bold uppercase">
                  <span>Custom (.cuf)</span>
                  <span
                    className={`rounded px-1.5 py-0.2 text-[9px] ${
                      plan === "cuf_vin"
                        ? "bg-emerald-500 text-white"
                        : "bg-emerald-200 text-emerald-900"
                    }`}
                  >
                    ХИТ
                  </span>
                </span>
                <span className="mt-0.5 text-base font-extrabold">
                  {settings.cufVinPriceKzt.toLocaleString("ru")} ₸
                </span>
                <span className="mt-1 text-[10.5px] leading-tight opacity-85">
                  Зеркала, свет, замки, дворники (1 VIN навсегда)
                </span>
              </button>

              {/* Полный тариф KON + CUF */}
              <button
                type="button"
                onClick={() => setPlan("single_vin")}
                className={`flex flex-col rounded-xl border p-2.5 text-left transition ${
                  plan === "single_vin"
                    ? "border-gray-900 bg-gray-900 text-white ring-1 ring-gray-900"
                    : "border-gray-200 bg-white text-gray-900 hover:border-gray-300"
                }`}
              >
                <span className="text-[10px] font-bold uppercase opacity-80">
                  Полный (.kon + .cuf)
                </span>
                <span className="mt-0.5 text-base font-extrabold">
                  {settings.singleVinPriceKzt.toLocaleString("ru")} ₸
                </span>
                <span className="mt-1 text-[10.5px] leading-tight opacity-85">
                  Все скрытые опции ETACS + ДВС + .cuf (1 VIN)
                </span>
              </button>

              {/* PRO Мастер 30 дней */}
              <button
                type="button"
                onClick={() => setPlan("pro_month")}
                className={`flex flex-col rounded-xl border p-2.5 text-left transition ${
                  plan === "pro_month"
                    ? "border-gray-900 bg-gray-900 text-white ring-1 ring-gray-900"
                    : "border-gray-200 bg-white text-gray-900 hover:border-gray-300"
                }`}
              >
                <span className="text-[10px] font-semibold uppercase opacity-75">
                  PRO Мастер (30 дн)
                </span>
                <span className="mt-0.5 text-sm font-bold">
                  {settings.proMonthPriceKzt.toLocaleString("ru")} ₸
                </span>
                <span className="mt-0.5 text-[10px] opacity-80">Любые авто без лимита VIN</span>
              </button>

              {/* PRO СТО 1 год */}
              <button
                type="button"
                onClick={() => setPlan("pro_year")}
                className={`flex flex-col rounded-xl border p-2.5 text-left transition ${
                  plan === "pro_year"
                    ? "border-gray-900 bg-gray-900 text-white ring-1 ring-gray-900"
                    : "border-gray-200 bg-white text-gray-900 hover:border-gray-300"
                }`}
              >
                <span className="text-[10px] font-semibold uppercase opacity-75">
                  PRO СТО (1 год)
                </span>
                <span className="mt-0.5 text-sm font-bold">
                  {settings.proYearPriceKzt.toLocaleString("ru")} ₸
                </span>
                <span className="mt-0.5 text-[10px] opacity-80">Все авто (.kon + .cuf) 365 дн</span>
              </button>
            </div>

            {/* Блок предупреждения о привязке к VIN (или блокировки, если файл ещё не открыт) */}
            {isSingleVinPlan ? (
              hasValidVin ? (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950">
                  <strong>Внимание:</strong> после подтверждения оплаты доступ будет навсегда привязан к выгруженному/открытому вами автомобилю:
                  <div className="mt-1 font-mono text-xs font-bold text-gray-900">
                    VIN: {cleanVin}
                    {ecuId ? ` (${ecuId}${model ? ` · ${model}` : ""})` : ""}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-xs leading-relaxed text-red-900">
                  <strong>Внимание — файл ещё не открыт!</strong>
                  <p className="mt-1">
                    Чтобы привязать доступ к вашему автомобилю, сначала нажмите{" "}
                    <strong>«Выгрузить с блока»</strong> или <strong>«Открыть»</strong> файл{" "}
                    <code>.cuf</code> / <code>.kon</code> в слоте A. Как только в редакторе появится ваш VIN, отправка заявки станет доступна.
                  </p>
                </div>
              )
            ) : null}

            <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-3 text-xs text-blue-950">
              <p className="font-semibold">Реквизиты / как активировать:</p>
              <p className="mt-1 leading-relaxed">{settings.paymentInstructions}</p>
              {settings.kaspiPhoneOrLink ? (
                <p className="mt-1.5 font-mono text-xs font-bold text-blue-900">
                  Kaspi / Контакт: {settings.kaspiPhoneOrLink}
                </p>
              ) : null}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700">
                Ваш телефон (Kaspi / WhatsApp) или @username в Telegram
              </label>
              <input
                type="text"
                required
                disabled={isVinMissingForPlan}
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="+7 701 ... или @username"
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-xs text-gray-900 focus:border-gray-900 focus:outline-none disabled:bg-gray-100 disabled:text-gray-400 sm:text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700">
                Комментарий (имя отправителя в Kaspi)
              </label>
              <input
                type="text"
                disabled={isVinMissingForPlan}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Например: перевод с Kaspi от Армана"
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-xs text-gray-900 focus:border-gray-900 focus:outline-none disabled:bg-gray-100 disabled:text-gray-400 sm:text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={busy || !contact.trim() || isVinMissingForPlan}
              className="w-full rounded-xl bg-gray-900 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-gray-800 disabled:opacity-40"
            >
              {isVinMissingForPlan
                ? "Сначала откройте или выгрузите файл с вашим VIN"
                : busy
                  ? "Отправка заявки…"
                  : plan === "cuf_vin"
                    ? `Открыть Custom (.cuf) для VIN ${cleanVin} (${settings.cufVinPriceKzt.toLocaleString("ru")} ₸)`
                    : plan === "single_vin"
                      ? `Открыть Полный (.kon + .cuf) для VIN ${cleanVin} (${settings.singleVinPriceKzt.toLocaleString("ru")} ₸)`
                      : "Отправить заявку на получение ключа PRO"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRedeem} className="mt-3.5 space-y-3">
            {hasValidVin ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-950">
                Внимание: код на 1 авто (<code>CUF-...</code> или <code>VIN-...</code>) будет привязан к открытому вами VIN:{" "}
                <strong className="font-mono">{cleanVin}</strong>
              </div>
            ) : (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-950">
                Для активации кода на 1 авто (<code>CUF-...</code> / <code>VIN-...</code>) сначала откройте или выгрузите файл с вашим VIN в слот A.
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-700">
                Код активации (`CUF-...`, `VIN-...` или `PRO-...`)
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  type="text"
                  value={codeDraft}
                  onChange={(e) => setCodeDraft(e.target.value.toUpperCase())}
                  placeholder="Например: CUF-8K4M2P или VIN-..."
                  className="min-w-0 flex-1 rounded-xl border border-gray-300 px-3 py-2 font-mono text-xs uppercase text-gray-900 focus:border-gray-900 focus:outline-none sm:text-sm"
                />
                <button
                  type="submit"
                  disabled={busy || !codeDraft.trim()}
                  className="rounded-xl bg-gray-900 px-4 py-2 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {busy ? "Проверка…" : "Активировать"}
                </button>
              </div>
              {storedPromoCode ? (
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-gray-500">
                  <span>
                    Сохранённый на устройстве код:{" "}
                    <code className="font-mono font-bold">{storedPromoCode}</code>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setCodeDraft("");
                      onSavePromoCode("");
                    }}
                    className="text-red-600 hover:underline"
                  >
                    Сбросить код
                  </button>
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs leading-relaxed text-gray-600">
              <p className="font-semibold text-gray-800">Типы кодов активации:</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                <li>
                  <strong>CUF-... (Custom Coding .cuf)</strong> — открывает сохранение и запись кастомных настроек (зеркала, замки, дворники, свет) для вашего VIN навсегда.
                </li>
                <li>
                  <strong>VIN-... (Полный .kon + .cuf)</strong> — открывает сохранение и запись любых файлов (`.kon` и `.cuf`) для вашего VIN навсегда.
                </li>
                <li>
                  <strong>PRO-... (Мастер / СТО)</strong> — открывает работу с любыми автомобилями без ограничений по VIN.
                </li>
              </ul>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
