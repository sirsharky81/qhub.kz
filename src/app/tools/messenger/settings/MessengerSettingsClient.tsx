"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { MessengerShell } from "../components/MessengerShell";
import { fetchAccessCheck, fetchProfile, updateProfile } from "@/lib/messenger/client";
import { MAX_DISPLAY_NAME_LENGTH } from "@/lib/messenger/constants";
import {
  getPushSupportStatus,
  isMessengerPushEnabledLocally,
  subscribeMessengerPush,
  unsubscribeMessengerPush,
  type PushSupportStatus,
} from "@/lib/messenger/push";
import { maskPhone } from "@/lib/messenger/phone-format";

export function MessengerSettingsClient() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pushStatus, setPushStatus] = useState<PushSupportStatus>("unsupported");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

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
