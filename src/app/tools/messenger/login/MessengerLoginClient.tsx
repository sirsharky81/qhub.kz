"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PinInput } from "../components/PinInput";
import { MessengerInstallModal } from "../components/MessengerInstallModal";
import { MessengerShell } from "../components/MessengerShell";
import {
  LAST_PHONE_STORAGE,
  MESSENGER_INSTALL_PROMPT_SHOWN,
  PIN_LENGTH,
} from "@/lib/messenger/constants";
import {
  fetchAccessCheck,
  identifyMessenger,
  loginMessenger,
  setMessengerPin,
} from "@/lib/messenger/client";
import { ensureDeviceKeyPublished } from "@/lib/messenger/device-keys";
import { isStandalone } from "@/lib/pwa-utils";
import { TurnstileWidget, turnstileRequiredOnClient } from "@/components/TurnstileWidget";
import { CAPTCHA_REQUIRED_MSG } from "@/lib/captcha/turnstile-client";
import { useMessengerUnlock } from "../components/MessengerUnlockProvider";

type Step = "phone" | "login" | "setPin";

function loadLastPhone(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(LAST_PHONE_STORAGE) ?? "";
}

function saveLastPhone(phone: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LAST_PHONE_STORAGE, phone);
}

export function MessengerLoginClient() {
  const router = useRouter();
  const { setStorageKeyFromPin } = useMessengerUnlock();
  const [step, setStep] = useState<Step>("phone");
  const [phoneInput, setPhoneInput] = useState("");
  const [phone, setPhone] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [passwordSet, setPasswordSet] = useState(false);
  const [mustChangePin, setMustChangePin] = useState(false);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [phoneCaptchaToken, setPhoneCaptchaToken] = useState<string | null>(null);
  const [loginCaptchaToken, setLoginCaptchaToken] = useState<string | null>(null);
  const [phoneCaptchaReset, setPhoneCaptchaReset] = useState(0);
  const [loginCaptchaReset, setLoginCaptchaReset] = useState(0);
  const captchaRequired = turnstileRequiredOnClient();
  const phoneInputRef = useRef<HTMLInputElement>(null);

  function scrollPhoneInputIntoView() {
    requestAnimationFrame(() => {
      phoneInputRef.current?.scrollIntoView({ block: "center", inline: "nearest" });
    });
  }

  useEffect(() => {
    setPhoneInput(loadLastPhone());
    void fetchAccessCheck(true).then((data) => {
      if (data.messengerLoggedIn && !data.mustChangePin) {
        router.replace("/tools/messenger/home");
        return;
      }
      setCheckingSession(false);
    });
  }, [router]);

  async function handleIdentify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (captchaRequired && !phoneCaptchaToken) {
      setError(CAPTCHA_REQUIRED_MSG);
      return;
    }
    setLoading(true);
    try {
      const res = await identifyMessenger(phoneInput, phoneCaptchaToken ?? undefined);
      if (!res.ok) {
        setError(res.error ?? "Доступ недоступен");
        setPhoneCaptchaToken(null);
        setPhoneCaptchaReset((k) => k + 1);
        return;
      }
      setPhone(res.phone ?? phoneInput);
      setMaskedPhone(res.maskedPhone ?? "");
      setPasswordSet(!!res.passwordSet);
      setMustChangePin(!!res.mustChangePin);
      saveLastPhone(res.phone ?? phoneInput);
      if (!res.passwordSet || res.mustChangePin) {
        setStep("setPin");
      } else {
        setStep("login");
      }
    } finally {
      setLoading(false);
    }
  }

  function finishAfterSetPin() {
    const alreadyShown = localStorage.getItem(MESSENGER_INSTALL_PROMPT_SHOWN);
    if (!isStandalone() && !alreadyShown) {
      setShowInstallModal(true);
      return;
    }
    router.replace("/tools/messenger/home");
  }

  function handleInstallContinue() {
    localStorage.setItem(MESSENGER_INSTALL_PROMPT_SHOWN, "1");
    setShowInstallModal(false);
    router.replace("/tools/messenger/home");
  }

  async function handleLogin() {
    setError(null);
    if (captchaRequired && !loginCaptchaToken) {
      setError(CAPTCHA_REQUIRED_MSG);
      return;
    }
    setLoading(true);
    try {
      const res = await loginMessenger(phone, pin, loginCaptchaToken ?? undefined);
      if (!res.ok) {
        setError(res.error ?? "Ошибка входа");
        setLoginCaptchaToken(null);
        setLoginCaptchaReset((k) => k + 1);
        return;
      }
      if (res.mustChangePin) {
        setMustChangePin(true);
        setStep("setPin");
        setPin("");
        return;
      }
      await ensureDeviceKeyPublished().catch(() => {});
      await setStorageKeyFromPin(pin).catch(() => {});
      router.replace("/tools/messenger/home");
    } finally {
      setLoading(false);
    }
  }

  async function handleSetPin() {
    setError(null);
    if (pin !== confirmPin) {
      setError("PIN не совпадает");
      return;
    }
    setLoading(true);
    try {
      const res = await setMessengerPin(phone, pin, confirmPin);
      if (!res.ok) {
        setError(res.error ?? "Ошибка");
        return;
      }
      await ensureDeviceKeyPublished().catch(() => {});
      await setStorageKeyFromPin(pin).catch(() => {});
      finishAfterSetPin();
    } finally {
      setLoading(false);
    }
  }

  function handleChangePhone() {
    setStep("phone");
    setPin("");
    setConfirmPin("");
    setError(null);
    setPhoneCaptchaToken(null);
    setLoginCaptchaToken(null);
    setPhoneCaptchaReset((k) => k + 1);
  }

  if (checkingSession) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center text-sm text-gray-500">
        Загрузка…
      </div>
    );
  }

  return (
    <>
      <MessengerInstallModal open={showInstallModal} onContinue={handleInstallContinue} />
      <MessengerShell variant="app" title="Мессенджер" backHref="/" keyboardAware>
      <div
        className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain px-4 max-w-md mx-auto w-full pt-4 pb-6 [-webkit-overflow-scrolling:touch]"
      >
        <div className="w-full md:min-h-full md:flex md:flex-col md:justify-center md:py-4">
        <div className="w-full rounded-3xl border border-gray-200 bg-white p-6 shadow-sm space-y-6">
          {step === "phone" && (
            <>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Вход в мессенджер</h2>
                <p className="text-xs text-gray-500 mt-2">
                  Введите номер телефона, который добавил администратор. Ссылку на этот экран вам
                  должен был выслать админ.
                </p>
              </div>
              <form onSubmit={(e) => void handleIdentify(e)} className="space-y-4">
                <input
                  ref={phoneInputRef}
                  type="tel"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  onFocus={scrollPhoneInputIntoView}
                  placeholder="+7XXXXXXXXXX"
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-base scroll-mt-4"
                  style={{ fontSize: "16px" }}
                  required
                  autoComplete="tel"
                  enterKeyHint="done"
                />
                <TurnstileWidget
                  resetKey={phoneCaptchaReset}
                  onToken={setPhoneCaptchaToken}
                  onExpire={() => setPhoneCaptchaToken(null)}
                  onError={() => setPhoneCaptchaToken(null)}
                />
                <button
                  type="submit"
                  disabled={
                    loading || !phoneInput.trim() || (captchaRequired && !phoneCaptchaToken)
                  }
                  className="w-full rounded-2xl bg-gray-900 text-white py-3 text-sm font-semibold disabled:opacity-50"
                >
                  {loading ? "Проверка…" : "Продолжить"}
                </button>
              </form>
            </>
          )}

          {(step === "login" || step === "setPin") && (
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs text-gray-500">Номер</p>
                <p className="text-lg font-semibold">{maskedPhone || phone}</p>
              </div>
              <button
                type="button"
                onClick={handleChangePhone}
                className="text-xs text-gray-500 underline shrink-0"
              >
                Сменить номер
              </button>
            </div>
          )}

          {step === "setPin" && (
            <>
              <h2 className="text-center text-sm font-semibold">
                {passwordSet || mustChangePin ? "Задайте новый PIN" : "Установите PIN-код"}
              </h2>
              {(passwordSet || mustChangePin) && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-center">
                  После смены PIN сохранённая на этом устройстве переписка может стать недоступна.
                </p>
              )}
              <div className="space-y-4">
                <PinInput value={pin} onChange={setPin} autoFocus />
                <p className="text-xs text-center text-gray-500">Повторите PIN</p>
                <PinInput value={confirmPin} onChange={setConfirmPin} />
              </div>
              <button
                type="button"
                disabled={loading || pin.length < PIN_LENGTH || confirmPin.length < PIN_LENGTH}
                onClick={() => void handleSetPin()}
                className="w-full rounded-2xl bg-gray-900 text-white py-3 text-sm font-semibold disabled:opacity-50"
              >
                {loading ? "Сохранение…" : "Сохранить PIN"}
              </button>
            </>
          )}

          {step === "login" && (
            <>
              <h2 className="text-center text-sm font-semibold">Введите PIN</h2>
              <PinInput value={pin} onChange={setPin} autoFocus />
              <TurnstileWidget
                resetKey={loginCaptchaReset}
                onToken={setLoginCaptchaToken}
                onExpire={() => setLoginCaptchaToken(null)}
                onError={() => setLoginCaptchaToken(null)}
              />
              <button
                type="button"
                disabled={
                  loading || pin.length < PIN_LENGTH || (captchaRequired && !loginCaptchaToken)
                }
                onClick={() => void handleLogin()}
                className="w-full rounded-2xl bg-gray-900 text-white py-3 text-sm font-semibold disabled:opacity-50"
              >
                {loading ? "Вход…" : "Войти"}
              </button>
            </>
          )}

          {error && (
            <p className="text-sm text-red-600 text-center bg-red-50 rounded-xl px-3 py-2">{error}</p>
          )}
        </div>
        </div>
      </div>
    </MessengerShell>
    </>
  );
}
