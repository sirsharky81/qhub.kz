"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  EtacsBillingStoreData,
  EtacsPromoCodeRecord,
} from "@/lib/etacs-coding/licensing";

export function EtacsAdminSection() {
  const [store, setStore] = useState<EtacsBillingStoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Ручная разблокировка VIN
  const [newVin, setNewVin] = useState("");
  const [newVinNote, setNewVinNote] = useState("");

  // Генерация промокода / PRO-ключа
  const [promoKind, setPromoKind] = useState<EtacsPromoCodeRecord["kind"]>("single_vin");
  const [promoMaxUses, setPromoMaxUses] = useState(5);
  const [promoDays, setPromoDays] = useState(30);
  const [promoCustomCode, setPromoCustomCode] = useState("");
  const [promoNote, setPromoNote] = useState("");

  // Настройки цен и реквизитов
  const [singlePrice, setSinglePrice] = useState(3000);
  const [proMonthPrice, setProMonthPrice] = useState(8000);
  const [proYearPrice, setProYearPrice] = useState(30000);
  const [kaspiContact, setKaspiContact] = useState("");
  const [instructions, setInstructions] = useState("");

  const applyStoreState = useCallback((data: EtacsBillingStoreData) => {
    setStore(data);
    setSinglePrice(data.settings.singleVinPriceKzt);
    setProMonthPrice(data.settings.proMonthPriceKzt);
    setProYearPrice(data.settings.proYearPriceKzt);
    setKaspiContact(data.settings.kaspiPhoneOrLink);
    setInstructions(data.settings.paymentInstructions);
  }, []);

  useEffect(() => {
    fetch("/api/admin/etacs-licenses", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Не удалось загрузить данные ETACS");
        return (await res.json()) as EtacsBillingStoreData;
      })
      .then((data) => applyStoreState(data))
      .catch((err) => setError(err instanceof Error ? err.message : "Ошибка загрузки"))
      .finally(() => setLoading(false));
  }, [applyStoreState]);

  const postAction = async (payload: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/etacs-licenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as EtacsBillingStoreData & { error?: string };
      if (!res.ok) throw new Error(data.error || "Ошибка операции");
      applyStoreState(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  if (loading && !store) {
    return <p className="text-sm text-gray-500">Загрузка управления ETACS Coding…</p>;
  }

  if (!store) {
    return <p className="text-sm text-red-600">{error || "Нет данных"}</p>;
  }

  const unlockedList = Object.values(store.unlockedVins).sort((a, b) =>
    b.unlockedAt.localeCompare(a.unlockedAt),
  );
  const promoList = Object.values(store.promoCodes).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  const pendingRequests = store.requests.filter((r) => r.status === "pending");

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {/* 1. Режим монетизации (Paywall Вкл / Выкл) и тарифы */}
      <section className="rounded-2xl border border-gray-200 bg-white p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              Режим монетизации ETACS Coding (Free / PRO)
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Когда платный режим включён, сохранение изменённого .kon/.cuf и запись в блок требуют разблокированного VIN или PRO-ключа. Чтение и просмотр остаются бесплатными.
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-900">
            <input
              type="checkbox"
              checked={store.settings.enforcePaywall}
              disabled={busy}
              onChange={(e) =>
                void postAction({
                  action: "update_settings",
                  enforcePaywall: e.target.checked,
                })
              }
              className="h-4 w-4 rounded border-gray-300"
            />
            {store.settings.enforcePaywall
              ? "🔒 Платный режим ВКЛЮЧЁН (Free / PRO)"
              : "🔓 Открытый режим (Все функции бесплатны)"}
          </label>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void postAction({
              action: "update_settings",
              singleVinPriceKzt: Number(singlePrice) || 3000,
              proMonthPriceKzt: Number(proMonthPrice) || 8000,
              proYearPriceKzt: Number(proYearPrice) || 30000,
              kaspiPhoneOrLink: kaspiContact,
              paymentInstructions: instructions,
            });
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-3"
        >
          <div>
            <label className="block text-xs text-gray-500">Цена за 1 VIN (₸)</label>
            <input
              type="number"
              value={singlePrice}
              onChange={(e) => setSinglePrice(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500">PRO Мастер 30 дней (₸)</label>
            <input
              type="number"
              value={proMonthPrice}
              onChange={(e) => setProMonthPrice(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500">PRO СТО 1 год (₸)</label>
            <input
              type="number"
              value={proYearPrice}
              onChange={(e) => setProYearPrice(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-1.5 text-sm"
            />
          </div>
          <div className="sm:col-span-3">
            <label className="block text-xs text-gray-500">
              Реквизиты Kaspi / Телефон / Ссылка для перевода
            </label>
            <input
              type="text"
              value={kaspiContact}
              onChange={(e) => setKaspiContact(e.target.value)}
              placeholder="+7 701 ... (Имя И.) или ссылка Kaspi"
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-1.5 text-sm"
            />
          </div>
          <div className="sm:col-span-3">
            <label className="block text-xs text-gray-500">Инструкция по оплате в окне клиента</label>
            <textarea
              rows={2}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-1.5 text-sm"
            />
          </div>
          <div className="sm:col-span-3">
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-gray-900 px-4 py-2 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
            >
              Сохранить тарифы и реквизиты
            </button>
          </div>
        </form>
      </section>

      {/* 2. Входящие заявки на активацию */}
      <section className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">
          Заявки на активацию ({pendingRequests.length} ожидают)
        </h2>
        {store.requests.length === 0 ? (
          <p className="text-xs text-gray-400">Заявок пока нет.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {store.requests.slice(0, 25).map((req) => (
              <div
                key={req.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs"
              >
                <div className="space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-gray-900">{req.id}</span>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-gray-800">
                      VIN: {req.vin}
                    </span>
                    <span className="font-medium text-blue-700">{req.contact}</span>
                    <span className="text-gray-400">
                      {new Date(req.createdAt).toLocaleString("ru")}
                    </span>
                  </div>
                  {req.comment ? <p className="text-gray-500">Комментарий: {req.comment}</p> : null}
                  {req.grantedPromoCode ? (
                    <p className="text-emerald-700">
                      Выдан PRO-ключ: <code className="font-mono font-bold">{req.grantedPromoCode}</code>
                    </p>
                  ) : null}
                </div>
                <div>
                  {req.status === "pending" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void postAction({ action: "approve_request", requestId: req.id })
                      }
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                    >
                      ✓ Подтвердить доступ
                    </button>
                  ) : (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                      ✓ Подтверждена
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 3. Генератор промокодов и ключей PRO */}
      <section className="rounded-2xl border border-gray-200 bg-white p-4 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">
            Промокоды и ключи PRO ({promoList.length})
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Создавайте коды на 1 VIN, пакеты на несколько авто или безлимитные PRO-ключи для СТО и мастеров.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void postAction({
              action: "create_promo",
              kind: promoKind,
              maxUses: promoKind === "multi_vin" ? promoMaxUses : undefined,
              durationDays: promoKind === "pro_unlimited" ? promoDays : null,
              customCode: promoCustomCode.trim() || undefined,
              note: promoNote.trim() || undefined,
            }).then(() => {
              setPromoCustomCode("");
              setPromoNote("");
            });
          }}
          className="grid grid-cols-1 gap-2.5 sm:grid-cols-4"
        >
          <select
            value={promoKind}
            onChange={(e) => setPromoKind(e.target.value as EtacsPromoCodeRecord["kind"])}
            className="rounded-xl border border-gray-200 px-3 py-2 text-xs"
          >
            <option value="single_vin">Код на 1 VIN (навсегда)</option>
            <option value="multi_vin">Пакет на несколько VIN</option>
            <option value="pro_unlimited">PRO Безлимит (по сроку)</option>
          </select>

          {promoKind === "multi_vin" ? (
            <input
              type="number"
              min={2}
              max={500}
              value={promoMaxUses}
              onChange={(e) => setPromoMaxUses(Number(e.target.value))}
              placeholder="Кол-во VIN"
              className="rounded-xl border border-gray-200 px-3 py-2 text-xs"
            />
          ) : promoKind === "pro_unlimited" ? (
            <input
              type="number"
              min={1}
              max={3650}
              value={promoDays}
              onChange={(e) => setPromoDays(Number(e.target.value))}
              placeholder="Дней (30 / 365)"
              className="rounded-xl border border-gray-200 px-3 py-2 text-xs"
            />
          ) : (
            <input
              type="text"
              value={promoCustomCode}
              onChange={(e) => setPromoCustomCode(e.target.value.toUpperCase())}
              placeholder="Свой код (необяз.)"
              className="rounded-xl border border-gray-200 px-3 py-2 font-mono text-xs uppercase"
            />
          )}

          <input
            type="text"
            value={promoNote}
            onChange={(e) => setPromoNote(e.target.value)}
            placeholder="Заметка (кому выдан)"
            className="rounded-xl border border-gray-200 px-3 py-2 text-xs"
          />

          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-gray-900 px-4 py-2 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
          >
            + Сгенерировать код
          </button>
        </form>

        {promoList.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {promoList.map((p) => (
              <div
                key={p.code}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <code className="rounded bg-gray-100 px-2 py-0.5 font-mono font-bold text-gray-900 select-all">
                    {p.code}
                  </code>
                  <span className="text-gray-600">
                    {p.kind === "pro_unlimited"
                      ? `PRO Безлимит (${p.usedCount} авто)`
                      : `VIN: ${p.usedCount} / ${p.maxUses}`}
                  </span>
                  {p.expiresAt ? (
                    <span className="text-gray-400">
                      до {new Date(p.expiresAt).toLocaleDateString("ru")}
                    </span>
                  ) : null}
                  {p.note ? <span className="text-gray-500">· {p.note}</span> : null}
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void postAction({ action: "delete_promo", code: p.code })}
                  className="text-red-600 hover:underline"
                >
                  Удалить
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {/* 4. Разблокированные автомобили (VIN) */}
      <section className="rounded-2xl border border-gray-200 bg-white p-4 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">
            Разблокированные VIN ({unlockedList.length})
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Добавьте VIN вручную или управляйте уже открытыми автомобилями.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newVin.trim()) return;
            void postAction({
              action: "unlock_vin",
              vin: newVin,
              note: newVinNote,
            }).then(() => {
              setNewVin("");
              setNewVinNote("");
            });
          }}
          className="flex flex-wrap gap-2"
        >
          <input
            type="text"
            value={newVin}
            onChange={(e) => setNewVin(e.target.value.toUpperCase())}
            placeholder="VIN автомобиля (17 символов)"
            className="min-w-[220px] flex-1 rounded-xl border border-gray-200 px-3 py-2 font-mono text-xs uppercase"
          />
          <input
            type="text"
            value={newVinNote}
            onChange={(e) => setNewVinNote(e.target.value)}
            placeholder="Заметка / телефон владельца"
            className="min-w-[180px] flex-1 rounded-xl border border-gray-200 px-3 py-2 text-xs"
          />
          <button
            type="submit"
            disabled={busy || !newVin.trim()}
            className="rounded-xl bg-gray-900 px-4 py-2 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
          >
            + Открыть VIN
          </button>
        </form>

        {unlockedList.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {unlockedList.map((item) => (
              <div
                key={item.vin}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <code className="font-mono font-bold text-gray-900">{item.vin}</code>
                  {item.ecuId ? <span className="text-gray-500">({item.ecuId})</span> : null}
                  {item.contact ? <span className="text-blue-700">{item.contact}</span> : null}
                  {item.note ? <span className="text-gray-500">· {item.note}</span> : null}
                  <span className="text-gray-400">
                    {new Date(item.unlockedAt).toLocaleDateString("ru")}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void postAction({ action: "remove_vin", vin: item.vin })}
                  className="text-red-600 hover:underline"
                >
                  Закрыть доступ
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
