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
  licenseStatus,
  storedPromoCode,
  onSavePromoCode,
  onRefreshStatus,
}: Props) {
  const [tab, setTab] = useState<"code" | "request">("code");
  const [codeDraft, setCodeDraft] = useState(storedPromoCode);
  const [contact, setContact] = useState("");
  const [plan, setPlan] = useState<"single_vin" | "pro_month" | "pro_year">("single_vin");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!open) return null;

  const settings = licenseStatus?.settings ?? {
    enforcePaywall: false,
    singleVinPriceKzt: 3000,
    proMonthPriceKzt: 8000,
    proYearPriceKzt: 30000,
    paymentInstructions:
      "Переведите сумму выбранного тарифа на Kaspi и укажите ваш телефон или Telegram в заявке ниже. После подтверждения доступ к VIN или PRO-код активируется мгновенно.",
    kaspiPhoneOrLink: "По номеру Kaspi / в Telegram",
  };

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const clean = codeDraft.trim().toUpperCase();
      const res = await redeemEtacsCodeApi({
        code: clean,
        vin,
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
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await requestEtacsUnlockApi({
        vin,
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
    if (licenseStatus.reason === "admin") return "Администратор (Полный доступ)";
    if (licenseStatus.reason === "vin_unlocked") return `VIN ${licenseStatus.vin} разблокирован`;
    if (licenseStatus.reason === "pro_code") {
      return `Активен PRO-код (${licenseStatus.promoRecord?.code || storedPromoCode})`;
    }
    if (!licenseStatus.enforcePaywall) return "Открытый доступ (Free + запись)";
    return "Бесплатный режим (Только просмотр и выгрузка бэкапа)";
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
              Доступ и активация ETACS Coding (Free / PRO)
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Чтение с блока, сохранение заводского оригинала и просмотр всех параметров —{" "}
              <strong className="text-gray-700">бесплатно</strong>. Сохранение изменённых файлов и запись в блок — по VIN или PRO-доступу.
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
            {vin ? (
              <span className="rounded bg-white/80 px-2 py-0.5 font-mono text-[11px] font-bold text-gray-800">
                VIN: {vin}
              </span>
            ) : null}
          </div>
        </div>

        {/* Переключатель вкладок */}
        <div className="mt-3.5 grid grid-cols-2 gap-1.5 rounded-xl bg-gray-100 p-1">
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
            Ввести код активации
          </button>
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
            Открыть доступ (Kaspi / PRO)
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

        {tab === "code" ? (
          <form onSubmit={handleRedeem} className="mt-3.5 space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700">
                Промокод на 1 VIN или ключ PRO Мастер
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  type="text"
                  value={codeDraft}
                  onChange={(e) => setCodeDraft(e.target.value.toUpperCase())}
                  placeholder="Например: VIN-8K4M2P или PRO-..."
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
                    Сохранённый на устройстве код: <code className="font-mono font-bold">{storedPromoCode}</code>
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
              <p className="font-semibold text-gray-800">Как работают коды:</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                <li>
                  <strong>Код на автомобиль (VIN)</strong> — навсегда привязывается к VIN открытого файла ({vin || "откройте файл в слоте A"}) и открывает безлимитное сохранение и запись в блок для этой машины.
                </li>
                <li>
                  <strong>Код PRO Мастер</strong> — сохраняется в вашем браузере и открывает доступ к любым автомобилям без ограничений по VIN.
                </li>
              </ul>
            </div>
          </form>
        ) : (
          <form onSubmit={handleRequest} className="mt-3.5 space-y-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => setPlan("single_vin")}
                className={`flex flex-col rounded-xl border p-2.5 text-left transition ${
                  plan === "single_vin"
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 bg-white text-gray-900 hover:border-gray-300"
                }`}
              >
                <span className="text-[10px] font-semibold uppercase opacity-75">Мой авто (1 VIN)</span>
                <span className="mt-0.5 text-sm font-bold">
                  {settings.singleVinPriceKzt.toLocaleString("ru")} ₸
                </span>
                <span className="mt-1 text-[10.5px] opacity-80">Навсегда для 1 VIN</span>
              </button>

              <button
                type="button"
                onClick={() => setPlan("pro_month")}
                className={`flex flex-col rounded-xl border p-2.5 text-left transition ${
                  plan === "pro_month"
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 bg-white text-gray-900 hover:border-gray-300"
                }`}
              >
                <span className="text-[10px] font-semibold uppercase opacity-75">PRO Мастер (30 дн)</span>
                <span className="mt-0.5 text-sm font-bold">
                  {settings.proMonthPriceKzt.toLocaleString("ru")} ₸
                </span>
                <span className="mt-1 text-[10.5px] opacity-80">Безлимит по VIN</span>
              </button>

              <button
                type="button"
                onClick={() => setPlan("pro_year")}
                className={`flex flex-col rounded-xl border p-2.5 text-left transition ${
                  plan === "pro_year"
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 bg-white text-gray-900 hover:border-gray-300"
                }`}
              >
                <span className="text-[10px] font-semibold uppercase opacity-75">PRO СТО (1 год)</span>
                <span className="mt-0.5 text-sm font-bold">
                  {settings.proYearPriceKzt.toLocaleString("ru")} ₸
                </span>
                <span className="mt-1 text-[10.5px] opacity-80">Все авто 365 дней</span>
              </button>
            </div>

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
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="+7 701 ... или @username"
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-xs text-gray-900 focus:border-gray-900 focus:outline-none sm:text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700">
                Комментарий (последние 4 цифры карты / имя отправителя)
              </label>
              <input
                type="text"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Например: перевод с Kaspi от Армана"
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-xs text-gray-900 focus:border-gray-900 focus:outline-none sm:text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={busy || !contact.trim()}
              className="w-full rounded-xl bg-gray-900 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-gray-800 disabled:opacity-50"
            >
              {busy
                ? "Отправка заявки…"
                : plan === "single_vin"
                  ? `Отправить заявку на разблокировку VIN ${vin || ""}`
                  : "Отправить заявку на получение ключа PRO"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
