"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PinInput } from "../components/PinInput";
import { MessengerInstallModal } from "../components/MessengerInstallModal";
import { MessengerShell } from "../components/MessengerShell";
import {
  LAST_PHONE_STORAGE,
  MAX_DISPLAY_NAME_LENGTH,
  MESSENGER_INSTALL_PROMPT_SHOWN,
  OTP_DIGITS,
  OTP_RESEND_COOLDOWN_SEC,
  PIN_LENGTH,
} from "@/lib/messenger/constants";
import {
  fetchAccessCheck,
  identifyMessenger,
  loginMessenger,
  sendMessengerOtp,
  setMessengerPin,
  verifyMessengerOtp,
} from "@/lib/messenger/client";
import { ensureDeviceKeyPublished } from "@/lib/messenger/device-keys";
import {
  ensureMessengerPushSubscription,
} from "@/lib/messenger/push";
import { isStandalone } from "@/lib/pwa-utils";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { CAPTCHA_REQUIRED_MSG } from "@/lib/captcha/turnstile-client";
import { useTurnstileConfig } from "@/lib/captcha/useTurnstileConfig";
import { useMessengerUnlock } from "../components/MessengerUnlockProvider";

type Step = "phone" | "name" | "otp" | "login" | "setPin";

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
  const [displayName, setDisplayName] = useState("");
  const [selfRegistration, setSelfRegistration] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpToken, setOtpToken] = useState<string | undefined>(undefined);
  const [otpSending, setOtpSending] = useState(false);
  const [resendAfterSec, setResendAfterSec] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [phoneCaptchaToken, setPhoneCaptchaToken] = useState<string | null>(null);
  const [loginCaptchaToken, setLoginCaptchaToken] = useState<string | null>(null);
  const [phoneCaptchaReset, setPhoneCaptchaReset] = useState(0);
  const [loginCaptchaReset, setLoginCaptchaReset] = useState(0);
  const turnstile = useTurnstileConfig();
  const captchaRequired = turnstile.enabled;
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
    }).catch(() => {
      setCheckingSession(false);
      setError("Сервис мессенджера временно недоступен. Повторите чуть позже.");
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
      setSelfRegistration(!!res.selfRegistration);
      saveLastPhone(res.phone ?? phoneInput);
      if (!res.passwordSet || res.otpRequired) {
        setOtpCode("");
        setOtpToken(undefined);
        if (res.selfRegistration) {
          setStep("name");
        } else {
          setStep("otp");
          void requestOtp(res.phone ?? phoneInput);
        }
      } else {
        setStep("login");
      }
    } finally {
      setLoading(false);
    }
  }

  async function requestOtp(targetPhone = phone) {
    setOtpSending(true);
    setError(null);
    try {
      const res = await sendMessengerOtp(targetPhone);
      if (!res.ok) {
        setError(res.error ?? "Не удалось заказать звонок");
        return;
      }
      setResendAfterSec(res.resendAfterSec ?? OTP_RESEND_COOLDOWN_SEC);
    } finally {
      setOtpSending(false);
    }
  }

  function handleContinueName(e: React.FormEvent) {
    e.preventDefault();
    const name = displayName.trim();
    if (!name) {
      setError("Введите имя");
      return;
    }
    setError(null);
    setDisplayName(name);
    setStep("otp");
    void requestOtp();
  }

  async function handleVerifyOtp() {
    setError(null);
    setLoading(true);
    try {
      const res = await verifyMessengerOtp(phone, otpCode);
      if (!res.ok) {
        setError(res.error ?? "Неверный код");
        setOtpCode("");
        return;
      }
      setOtpToken(res.otpToken);
      setStep("setPin");
      setPin("");
      setConfirmPin("");
    } finally {
      setLoading(false);
    }
  }

  function finishAfterSetPin() {
    const alreadyShown = localStorage.getItem(MESSENGER_INSTALL_PROMPT_SHOWN);
    void ensureMessengerPushSubscription();
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
      void ensureMessengerPushSubscription();
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
    if (selfRegistration && !displayName.trim()) {
      setError("Введите имя");
      return;
    }
    setLoading(true);
    try {
      const res = await setMessengerPin(
        phone,
        pin,
        confirmPin,
        otpToken,
        selfRegistration ? displayName : undefined,
      );
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
    setOtpCode("");
    setOtpToken(undefined);
    setDisplayName("");
    setSelfRegistration(false);
    setResendAfterSec(0);
    setError(null);
    setPhoneCaptchaToken(null);
    setLoginCaptchaToken(null);
    setPhoneCaptchaReset((k) => k + 1);
  }

  useEffect(() => {
    if (resendAfterSec <= 0) return;
    const timer = window.setTimeout(() => {
      setResendAfterSec((sec) => Math.max(0, sec - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [resendAfterSec]);

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
                  Введите казахстанский номер. Если вы здесь впервые, сразу укажем имя и подтвердим
                  его коротким звонком — отвечать не нужно.
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
                  siteKey={turnstile.siteKey}
                  enabled={captchaRequired}
                  loading={turnstile.loading}
                  resetKey={phoneCaptchaReset}
                  onToken={setPhoneCaptchaToken}
                  onExpire={() => setPhoneCaptchaToken(null)}
                  onError={() => setPhoneCaptchaToken(null)}
                />
                <button
                  type="submit"
                  disabled={
                    loading ||
                    turnstile.loading ||
                    !phoneInput.trim() ||
                    (captchaRequired && !phoneCaptchaToken)
                  }
                  className="w-full rounded-2xl bg-gray-900 text-white py-3 text-sm font-semibold disabled:opacity-50"
                >
                  {loading ? "Проверка…" : "Продолжить"}
                </button>
              </form>
            </>
          )}

          {(step === "name" || step === "otp" || step === "login" || step === "setPin") && (
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

          {step === "name" && (
            <>
              <h2 className="text-center text-sm font-semibold">Как вас называть?</h2>
              <p className="text-xs text-gray-500 text-center">
                Это имя увидят в чатах. Его нужно указать сразу.
              </p>
              <form onSubmit={handleContinueName} className="space-y-4">
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value.slice(0, MAX_DISPLAY_NAME_LENGTH))}
                  placeholder="Имя"
                  maxLength={MAX_DISPLAY_NAME_LENGTH}
                  autoComplete="name"
                  autoFocus
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-base"
                  style={{ fontSize: "16px" }}
                  required
                />
                <p className="text-[11px] text-gray-400 text-right">
                  {displayName.trim().length}/{MAX_DISPLAY_NAME_LENGTH}
                </p>
                <button
                  type="submit"
                  disabled={!displayName.trim()}
                  className="w-full rounded-2xl bg-gray-900 text-white py-3 text-sm font-semibold disabled:opacity-50"
                >
                  Продолжить
                </button>
              </form>
            </>
          )}

          {step === "otp" && (
            <>
              <h2 className="text-center text-sm font-semibold">Подтвердите номер</h2>
              <p className="text-xs text-gray-500 text-center">
                Сейчас поступит звонок. Отвечать не нужно — введите последние {OTP_DIGITS} цифры
                входящего номера.
              </p>
              <PinInput
                value={otpCode}
                onChange={setOtpCode}
                length={OTP_DIGITS}
                masked={false}
                label="Код из звонка"
                autoFocus
              />
              <button
                type="button"
                disabled={loading || otpSending || otpCode.length < OTP_DIGITS}
                onClick={() => void handleVerifyOtp()}
                className="w-full rounded-2xl bg-gray-900 text-white py-3 text-sm font-semibold disabled:opacity-50"
              >
                {loading ? "Проверка…" : "Подтвердить"}
              </button>
              <button
                type="button"
                disabled={otpSending || resendAfterSec > 0}
                onClick={() => void requestOtp()}
                className="w-full text-xs text-gray-500 underline disabled:no-underline disabled:opacity-60"
              >
                {otpSending
                  ? "Звоним…"
                  : resendAfterSec > 0
                    ? `Повторить звонок через ${resendAfterSec} с`
                    : "Позвонить ещё раз"}
              </button>
            </>
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
                siteKey={turnstile.siteKey}
                enabled={captchaRequired}
                loading={turnstile.loading}
                resetKey={loginCaptchaReset}
                onToken={setLoginCaptchaToken}
                onExpire={() => setLoginCaptchaToken(null)}
                onError={() => setLoginCaptchaToken(null)}
              />
              <button
                type="button"
                disabled={
                  loading ||
                  turnstile.loading ||
                  pin.length < PIN_LENGTH ||
                  (captchaRequired && !loginCaptchaToken)
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
