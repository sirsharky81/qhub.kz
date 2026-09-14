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
import { maskPhone } from "@/lib/messenger/phone-format";
import { ensureDeviceKeyPublished } from "@/lib/messenger/device-keys";
import {
  ensureMessengerPushSubscription,
  subscribeMessengerPush,
} from "@/lib/messenger/push";
import { isStandalone } from "@/lib/pwa-utils";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { CAPTCHA_REQUIRED_MSG } from "@/lib/captcha/turnstile-client";
import { useTurnstileConfig } from "@/lib/captcha/useTurnstileConfig";
import { useMessengerUnlock } from "../components/MessengerUnlockProvider";

type Step = "phone" | "name" | "otp" | "login" | "setPin";
type OtpPurpose = "register" | "pin_recovery";
type OtpChannel = "push" | "call";

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
  const [otpPurpose, setOtpPurpose] = useState<OtpPurpose>("register");
  const [otpChannel, setOtpChannel] = useState<OtpChannel>("call");
  const [otpSending, setOtpSending] = useState(false);
  const [resendAfterSec, setResendAfterSec] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [phoneCaptchaToken, setPhoneCaptchaToken] = useState<string | null>(null);
  const [loginCaptchaToken, setLoginCaptchaToken] = useState<string | null>(null);
  const [otpCaptchaToken, setOtpCaptchaToken] = useState<string | null>(null);
  const [phoneCaptchaReset, setPhoneCaptchaReset] = useState(0);
  const [loginCaptchaReset, setLoginCaptchaReset] = useState(0);
  const [otpCaptchaReset, setOtpCaptchaReset] = useState(0);
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
      if (data.messengerLoggedIn && data.phone) {
        const resetRequested =
          typeof window !== "undefined" &&
          new URLSearchParams(window.location.search).get("reset") === "1";
        if (resetRequested || data.mustChangePin) {
          setPhone(data.phone);
          setMaskedPhone(maskPhone(data.phone));
          setPasswordSet(!!data.passwordSet);
          setMustChangePin(true);
          setCheckingSession(false);
          setStep("setPin");
          return;
        }
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
      const identifiedPhone = res.phone ?? phoneInput;
      if (!res.passwordSet || res.otpRequired) {
        const access = await fetchAccessCheck(true).catch(() => null);
        if (access?.messengerLoggedIn && access.phone === identifiedPhone) {
          setMustChangePin(true);
          setPin("");
          setConfirmPin("");
          setStep("setPin");
          return;
        }
        setOtpPurpose("register");
        setOtpChannel("call");
        setOtpCode("");
        setOtpToken(undefined);
        if (res.selfRegistration) {
          setStep("name");
        } else {
          setStep("otp");
          void requestOtp(identifiedPhone, "register");
        }
      } else {
        setStep("login");
      }
    } finally {
      setLoading(false);
    }
  }

  async function requestOtp(
    targetPhone = phone,
    purpose: OtpPurpose = otpPurpose,
    captchaToken?: string | null,
  ) {
    setOtpSending(true);
    setError(null);
    try {
      const res = await sendMessengerOtp(targetPhone, purpose, captchaToken ?? undefined);
      if (purpose === "pin_recovery") {
        setOtpCaptchaToken(null);
        setOtpCaptchaReset((k) => k + 1);
        setLoginCaptchaToken(null);
        setLoginCaptchaReset((k) => k + 1);
      }
      if (!res.ok) {
        setError(res.error ?? "Не удалось отправить код");
        return false;
      }
      setOtpPurpose(purpose);
      setOtpChannel(res.channel ?? "call");
      setResendAfterSec(res.resendAfterSec ?? OTP_RESEND_COOLDOWN_SEC);
      return true;
    } finally {
      setOtpSending(false);
    }
  }

  async function handleForgotPin() {
    setError(null);
    if (captchaRequired && !loginCaptchaToken) {
      setError(CAPTCHA_REQUIRED_MSG);
      return;
    }
    setLoading(true);
    try {
      const ok = await requestOtp(phone, "pin_recovery", loginCaptchaToken);
      if (!ok) return;
      setOtpCode("");
      setOtpToken(undefined);
      setStep("otp");
    } finally {
      setLoading(false);
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
    setOtpPurpose("register");
    setOtpChannel("call");
    setStep("otp");
    void requestOtp(phone, "register");
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
      if (otpPurpose === "pin_recovery") {
        setMustChangePin(true);
      }
      setStep("setPin");
      setPin("");
      setConfirmPin("");
    } finally {
      setLoading(false);
    }
  }

  function finishAfterSetPin() {
    const alreadyShown = localStorage.getItem(MESSENGER_INSTALL_PROMPT_SHOWN);
    const enablePushByDefault =
      selfRegistration || (!passwordSet && !mustChangePin && otpPurpose !== "pin_recovery");
    if (enablePushByDefault) {
      void subscribeMessengerPush().catch(() => {});
    } else {
      void ensureMessengerPushSubscription();
    }
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
    setOtpPurpose("register");
    setOtpChannel("call");
    setDisplayName("");
    setSelfRegistration(false);
    setMustChangePin(false);
    setResendAfterSec(0);
    setError(null);
    setPhoneCaptchaToken(null);
    setLoginCaptchaToken(null);
    setOtpCaptchaToken(null);
    setPhoneCaptchaReset((k) => k + 1);
    setLoginCaptchaReset((k) => k + 1);
    setOtpCaptchaReset((k) => k + 1);
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
              <h2 className="text-center text-sm font-semibold">
                {otpPurpose === "pin_recovery" && otpChannel === "push"
                  ? "Код сброса PIN"
                  : "Подтвердите номер"}
              </h2>
              <p className="text-xs text-gray-500 text-center">
                {otpChannel === "push"
                  ? `Мы отправили код в уведомление. Откройте его и введите ${OTP_DIGITS} цифры.`
                  : `Сейчас поступит звонок. Отвечать не нужно — введите последние ${OTP_DIGITS} цифры входящего номера.`}
              </p>
              {otpPurpose === "pin_recovery" && otpChannel === "call" && (
                <p className="text-xs text-gray-500 text-center">
                  Если звонка нет — напишите администратору.
                </p>
              )}
              <PinInput
                value={otpCode}
                onChange={setOtpCode}
                length={OTP_DIGITS}
                masked={false}
                label={otpChannel === "push" ? "Код из уведомления" : "Код из звонка"}
                autoFocus
              />
              {otpPurpose === "pin_recovery" && (
                <TurnstileWidget
                  siteKey={turnstile.siteKey}
                  enabled={captchaRequired}
                  loading={turnstile.loading}
                  resetKey={otpCaptchaReset}
                  onToken={setOtpCaptchaToken}
                  onExpire={() => setOtpCaptchaToken(null)}
                  onError={() => setOtpCaptchaToken(null)}
                />
              )}
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
                disabled={
                  otpSending ||
                  resendAfterSec > 0 ||
                  (otpPurpose === "pin_recovery" && captchaRequired && !otpCaptchaToken)
                }
                onClick={() =>
                  void requestOtp(
                    phone,
                    otpPurpose,
                    otpPurpose === "pin_recovery" ? otpCaptchaToken : undefined,
                  )
                }
                className="w-full text-xs text-gray-500 underline disabled:no-underline disabled:opacity-60"
              >
                {otpSending
                  ? otpChannel === "push"
                    ? "Отправляем…"
                    : "Звоним…"
                  : resendAfterSec > 0
                    ? otpChannel === "push"
                      ? `Повторить отправку через ${resendAfterSec} с`
                      : `Повторить звонок через ${resendAfterSec} с`
                    : otpChannel === "push"
                      ? "Отправить ещё раз"
                      : "Позвонить ещё раз"}
              </button>
            </>
          )}

          {step === "setPin" && (
            <>
              <h2 className="text-center text-sm font-semibold">
                {passwordSet || mustChangePin || otpPurpose === "pin_recovery"
                  ? "Задайте новый PIN"
                  : "Установите PIN-код"}
              </h2>
              {(passwordSet || mustChangePin || otpPurpose === "pin_recovery") && (
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
              <button
                type="button"
                disabled={loading || otpSending}
                onClick={() => void handleForgotPin()}
                className="w-full text-xs text-gray-500 underline disabled:opacity-60"
              >
                Забыл PIN?
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
