"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { MessengerShell } from "../components/MessengerShell";
import { PinInput } from "../components/PinInput";
import {
  changeMessengerPin,
  fetchAccessCheck,
  fetchProfile,
  updateProfile,
} from "@/lib/messenger/client";
import { MAX_DISPLAY_NAME_LENGTH, PIN_LENGTH } from "@/lib/messenger/constants";
import {
  getPushSupportStatus,
  isMessengerPushEnabledLocally,
  subscribeMessengerPush,
  unsubscribeMessengerPush,
  type PushSupportStatus,
} from "@/lib/messenger/push";
import { maskPhone } from "@/lib/messenger/phone-format";
import { useMessengerUnlock } from "../components/MessengerUnlockProvider";

export function MessengerSettingsClient() {
  const router = useRouter();
  const { setStorageKeyFromPin } = useMessengerUnlock();
  const [phone, setPhone] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pushStatus, setPushStatus] = useState<PushSupportStatus>("unsupported");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [showPinForm, setShowPinForm] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSaving, setPinSaving] = useState(false);
  const [pinSaved, setPinSaved] = useState(false);

  const refreshPushState = useCallback(() => {
    setPushStatus(getPushSupportStatus());
    setPushEnabled(isMessengerPushEnabledLocally() && getPushSupportStatus() === "granted");
  }, []);

  useEffect(() => {
    refreshPushState();
    void fetchAccessCheck().then(async (data) => {
      if (!data.messengerLoggedIn) {
        router.replace("/tools/messenger/login");
        return;
      }
      setPhone(data.phone ?? "");
      const profile = await fetchProfile();
      setDisplayName(profile?.displayName ?? "");
    });
  }, [router, refreshPushState]);

  async function handlePushToggle() {
    setPushBusy(true);
    try {
      if (pushEnabled) {
        await unsubscribeMessengerPush();
      } else {
        await subscribeMessengerPush();
      }
      refreshPushState();
    } finally {
      setPushBusy(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const ok = await updateProfile(displayName);
      if (ok) setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePin() {
    setPinError(null);
    setPinSaved(false);
    if (newPin !== confirmPin) {
      setPinError("PIN не совпадает");
      return;
    }
    setPinSaving(true);
    try {
      const res = await changeMessengerPin(currentPin, newPin, confirmPin);
      if (!res.ok) {
        setPinError(res.error ?? "Не удалось сменить PIN");
        return;
      }
      await setStorageKeyFromPin(newPin).catch(() => {});
      setPinSaved(true);
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
      setShowPinForm(false);
    } finally {
      setPinSaving(false);
    }
  }

  const pinFormComplete =
    currentPin.length >= PIN_LENGTH &&
    newPin.length >= PIN_LENGTH &&
    confirmPin.length >= PIN_LENGTH;

  return (
    <MessengerShell
      variant="app"
      title="Настройки"
      backHref="/tools/messenger/home"
    >
      <div className="p-4 space-y-6 max-w-md w-full mx-auto">
        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-500">Имя</label>
          <input
            type="text"
            value={displayName}
            maxLength={MAX_DISPLAY_NAME_LENGTH}
            onChange={(e) => setDisplayName(e.target.value)}
            onBlur={() => void handleSave()}
            placeholder="Как вас видят другие"
            className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm"
          />
          <p className="text-[11px] text-gray-400">До {MAX_DISPLAY_NAME_LENGTH} символов</p>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-500">Номер телефона</label>
          <input
            type="text"
            value={phone ? maskPhone(phone) : ""}
            readOnly
            className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-500"
          />
        </div>

        <div className="space-y-3 rounded-2xl border border-gray-200 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-gray-900">PIN-код</p>
              <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
                Для входа и расшифровки локальной истории на этом устройстве
              </p>
            </div>
            {!showPinForm && (
              <button
                type="button"
                onClick={() => {
                  setShowPinForm(true);
                  setPinError(null);
                  setPinSaved(false);
                }}
                className="text-sm font-medium text-sky-600 shrink-0"
              >
                Сменить
              </button>
            )}
          </div>

          {showPinForm && (
            <div className="space-y-4 pt-1">
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                Сохранённая на устройстве переписка, зашифрованная старым PIN, станет недоступна.
              </p>
              <div className="space-y-2">
                <p className="text-xs text-gray-500 text-center">Текущий PIN</p>
                <PinInput value={currentPin} onChange={setCurrentPin} autoFocus />
              </div>
              <div className="space-y-2">
                <p className="text-xs text-gray-500 text-center">Новый PIN</p>
                <PinInput value={newPin} onChange={setNewPin} />
              </div>
              <div className="space-y-2">
                <p className="text-xs text-gray-500 text-center">Повторите новый PIN</p>
                <PinInput value={confirmPin} onChange={setConfirmPin} />
              </div>
              {pinError && (
                <p className="text-sm text-red-600 text-center bg-red-50 rounded-xl px-3 py-2">
                  {pinError}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowPinForm(false);
                    setCurrentPin("");
                    setNewPin("");
                    setConfirmPin("");
                    setPinError(null);
                  }}
                  className="flex-1 rounded-2xl border border-gray-200 py-3 text-sm font-medium text-gray-700"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  disabled={pinSaving || !pinFormComplete}
                  onClick={() => void handleChangePin()}
                  className="flex-1 rounded-2xl bg-gray-900 text-white py-3 text-sm font-semibold disabled:opacity-50"
                >
                  {pinSaving ? "Сохранение…" : "Сохранить PIN"}
                </button>
              </div>
            </div>
          )}

          {pinSaved && !showPinForm && (
            <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
              PIN изменён
            </p>
          )}
        </div>

        <div className="space-y-2 rounded-2xl border border-gray-200 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-gray-900">Уведомления</p>
              <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
                Push о новых сообщениях, когда приложение в фоне
              </p>
            </div>
            <button
              type="button"
              disabled={pushBusy || pushStatus === "unsupported" || pushStatus === "denied"}
              onClick={() => void handlePushToggle()}
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                pushEnabled ? "bg-sky-600" : "bg-gray-200"
              } disabled:opacity-50`}
              aria-label={pushEnabled ? "Отключить уведомления" : "Включить уведомления"}
            >
              <span
                className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                  pushEnabled ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
          {pushStatus === "unsupported" && (
            <p className="text-xs text-amber-700">Браузер не поддерживает push-уведомления.</p>
          )}
          {pushStatus === "denied" && (
            <p className="text-xs text-amber-700">
              Уведомления заблокированы в настройках браузера или iOS.
            </p>
          )}
          {pushStatus === "default" && !pushEnabled && (
            <p className="text-xs text-gray-500">Нажмите переключатель, чтобы разрешить уведомления.</p>
          )}
        </div>

        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          className="w-full rounded-2xl bg-gray-900 text-white py-3 text-sm font-semibold disabled:opacity-50"
        >
          {saving ? "Сохранение…" : saved ? "Сохранено" : "Сохранить"}
        </button>

        <p className="text-xs text-gray-400 leading-relaxed">
          Имя видно участникам комнат и в списке контактов. Номер привязан к whitelist и не
          изменяется.
        </p>

        <Link href="/tools/messenger/home" className="block text-center text-sm text-gray-500 underline">
          На главную
        </Link>
      </div>
    </MessengerShell>
  );
}
