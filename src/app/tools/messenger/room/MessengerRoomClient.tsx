"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { ChatView } from "../components/ChatView";
import { PinUnlockGate } from "../components/PinUnlockGate";
import {
  fetchAccessCheck,
  fetchProfile,
  fetchProfilesMap,
  fetchRoomStatus,
  joinRoomApi,
  leaveRoomApi,
} from "@/lib/messenger/client";
import { importRoomKeyBase64Url } from "@/lib/messenger/crypto";
import { cleanupRoomLocalState, upsertLocalDialog } from "@/lib/messenger/dialogs";
import { maskPhone } from "@/lib/messenger/phone-format";
import { getRoomKey, setRoomKey } from "@/lib/messenger/room-keys";

const ROOM_STEP_TIMEOUT_MS = 10_000;
const ROOM_FLOW_WATCHDOG_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function MessengerRoomInner() {
  const getKeyFromHash = useCallback((): string | null => {
    if (typeof window === "undefined") return null;
    if (!window.location.hash.startsWith("#key=")) return null;
    try {
      const key = decodeURIComponent(window.location.hash.slice(5)).trim();
      return key || null;
    } catch {
      return null;
    }
  }, []);

  const clearHashFromUrl = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!window.location.hash) return;
    try {
      const withoutHash = `${window.location.pathname}${window.location.search}`;
      window.history.replaceState(null, "", withoutHash);
    } catch {
      // ignore
    }
  }, []);

  const searchParams = useSearchParams();
  const router = useRouter();
  const roomId = String(searchParams.get("id") ?? "").toUpperCase();
  const [myPhone, setMyPhone] = useState("");
  const [aesKey, setAesKey] = useState<CryptoKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLabels, setProfileLabels] = useState<Record<string, string>>({});
  const [retryKey, setRetryKey] = useState(0);
  const [loadingStep, setLoadingStep] = useState("Проверка сессии");

  const handleRoomEnded = useCallback(() => {
    void cleanupRoomLocalState(roomId).then(() => {
      router.replace("/tools/messenger/home");
    });
  }, [roomId, router]);

  const handleLeaveRoom = useCallback(
    async (participantCount: number) => {
      if (participantCount > 1 && !window.confirm("Покинуть комнату?")) return;
      await leaveRoomApi(roomId);
      await cleanupRoomLocalState(roomId);
      router.replace("/tools/messenger/home");
    },
    [roomId, router],
  );

  useEffect(() => {
    if (!roomId) {
      router.replace("/tools/messenger/home");
      return;
    }
    let cancelled = false;

    async function loadProfilesInBackground() {
      try {
        const profiles = await fetchProfilesMap();
        if (!cancelled) setProfileLabels(profiles);
      } catch {
        // Non-blocking: чат уже открыт, профили можно догрузить позже.
      }
    }

    async function init() {
      let currentStep = "Проверка сессии";
      try {
        if (!cancelled) {
          setError(null);
          setLoading(true);
          setLoadingStep("Проверка сессии");
        }
        const access = await withTimeout(
          fetchAccessCheck(true),
          ROOM_STEP_TIMEOUT_MS,
          "Таймаут проверки сессии",
        );
        if (!access.messengerLoggedIn) {
          if (!cancelled) {
            setError("Сессия мессенджера неактивна. Войдите снова.");
            setLoading(false);
          }
          return;
        }
        let resolvedPhone = (access.phone ?? "").trim();
        if (!resolvedPhone) {
          currentStep = "Загрузка профиля";
          if (!cancelled) setLoadingStep(currentStep);
          const profile = await withTimeout(
            fetchProfile(),
            ROOM_STEP_TIMEOUT_MS,
            "Таймаут загрузки профиля",
          );
          resolvedPhone = (profile?.phone ?? "").trim();
        }
        if (!resolvedPhone) {
          if (!cancelled) {
            setError("Не удалось определить номер в сессии. Войдите в мессенджер снова.");
            setLoading(false);
          }
          return;
        }
        if (!cancelled) setMyPhone(resolvedPhone);

        currentStep = "Проверка ключа комнаты";
        if (!cancelled) setLoadingStep(currentStep);
        let storedKey = getRoomKey(roomId);
        if (!storedKey) {
          const hashKey = getKeyFromHash();
          if (hashKey) {
            setRoomKey(roomId, hashKey);
            storedKey = hashKey;
            clearHashFromUrl();
          }
        }
        if (!storedKey) {
          if (!cancelled) {
            setError("Не найден ключ комнаты на этом устройстве. Нужен повторный вход по коду/QR.");
            setLoading(false);
          }
          return;
        }

        currentStep = "Проверка комнаты";
        if (!cancelled) setLoadingStep(currentStep);
        const status = await withTimeout(
          fetchRoomStatus(roomId),
          ROOM_STEP_TIMEOUT_MS,
          "Таймаут проверки комнаты",
        );
        if (!status) {
          await cleanupRoomLocalState(roomId);
          if (!cancelled) {
            setError("Комната завершена");
            setLoading(false);
          }
          return;
        }

        currentStep = "Проверка шифрования";
        if (!cancelled) setLoadingStep(currentStep);
        const key = await withTimeout(
          importRoomKeyBase64Url(storedKey),
          ROOM_STEP_TIMEOUT_MS,
          "Таймаут импорта ключа комнаты",
        );
        currentStep = "Вход в комнату";
        if (!cancelled) setLoadingStep(currentStep);
        const joined = await withTimeout(
          joinRoomApi(roomId),
          ROOM_STEP_TIMEOUT_MS,
          "Таймаут входа в комнату",
        );
        if (!joined.ok) {
          if (!cancelled) {
            setError(joined.error ?? "Не удалось войти в комнату");
            setLoading(false);
          }
          return;
        }
        upsertLocalDialog({
          id: `room:${roomId}`,
          kind: "room",
          title: `Комната ${roomId}`,
          roomId,
          createdAt: Date.now(),
        });
        if (!cancelled) {
          setAesKey(key);
          setLoading(false);
        }
        void loadProfilesInBackground();
      } catch {
        if (!cancelled) {
          setError(`Не удалось войти в комнату (${currentStep}). Проверьте интернет и попробуйте снова.`);
          setLoading(false);
        }
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [roomId, retryKey, router, getKeyFromHash, clearHashFromUrl]);

  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => {
      setError("Вход в комнату занял слишком долго. Проверьте интернет и нажмите «Повторить».");
      setLoading(false);
    }, ROOM_FLOW_WATCHDOG_MS);
    return () => clearTimeout(timer);
  }, [loading, retryKey]);

  if (error) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-4 p-4 text-center">
        <p className="text-sm text-gray-600">{error}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRetryKey((v) => v + 1)}
            className="rounded-2xl bg-sky-600 text-white px-6 py-2.5 text-sm font-semibold"
          >
            Повторить
          </button>
          {error.includes("ключ комнаты") ? (
            <Link
              href={`/tools/messenger/room/join?code=${encodeURIComponent(roomId)}`}
              className="rounded-2xl bg-indigo-600 text-white px-6 py-2.5 text-sm font-semibold"
            >
              Ввести код/QR
            </Link>
          ) : error.includes("сессия") ? (
            <Link
              href="/tools/messenger/login"
              className="rounded-2xl bg-indigo-600 text-white px-6 py-2.5 text-sm font-semibold"
            >
              Войти в Messenger
            </Link>
          ) : null}
          <Link
            href="/tools/messenger/home"
            className="rounded-2xl bg-gray-900 text-white px-6 py-2.5 text-sm font-semibold"
          >
            На главную
          </Link>
        </div>
      </div>
    );
  }

  if (loading || !aesKey || !myPhone) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center text-sm text-gray-500 gap-1">
        <div>Вход в комнату…</div>
        <div className="text-[11px] text-gray-400">{loadingStep}</div>
      </div>
    );
  }

  return (
    <PinUnlockGate
      phone={myPhone}
      maskedPhone={maskPhone(myPhone)}
      title={`Комната ${roomId}`}
      backHref="/tools/messenger/home"
    >
      <ChatView
        channel={`room:${roomId}`}
        title={`Комната ${roomId}`}
        backHref="/tools/messenger/home"
        myPhone={myPhone}
        aesKey={aesKey}
        isRoom
        roomId={roomId}
        onLeaveRoom={handleLeaveRoom}
        onRoomEnded={handleRoomEnded}
        profileLabels={profileLabels}
      />
    </PinUnlockGate>
  );
}

export function MessengerRoomClient() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] flex items-center justify-center text-sm text-gray-500">Загрузка…</div>}>
      <MessengerRoomInner />
    </Suspense>
  );
}
