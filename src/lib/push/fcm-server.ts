import type { WebPushPayload } from "@/lib/family/push-server";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

interface FcmTarget {
  token: string;
  platform: "ios" | "android";
}

function buildFcmData(payload: WebPushPayload): Record<string, string> {
  return {
    title: payload.title,
    body: payload.body,
    url: payload.url,
    action: payload.action ?? "default",
    ...(payload.requestId ? { requestId: payload.requestId } : {}),
    ...(payload.icon ? { icon: payload.icon } : {}),
    ...(payload.callId ? { callId: payload.callId } : {}),
    ...(payload.callMedia ? { callMedia: payload.callMedia } : {}),
  };
}

/** Firebase Cloud Messaging — requires FIREBASE_* env vars (see .env.example). */
export async function sendFcmPush(
  targets: FcmTarget[],
  payload: WebPushPayload,
): Promise<void> {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();

  if (!projectId || !clientEmail || !privateKey || targets.length === 0) {
    if (targets.length > 0) {
      console.warn("[FCM] Skipping native push — Firebase credentials not configured");
    }
    return;
  }

  try {
    if (!getApps().length) {
      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
    }

    const messaging = getMessaging();
    const data = buildFcmData(payload);

    await Promise.allSettled(
      targets.map((target) => {
        const silentAndroid =
          payload.silent === true && payload.action === "family:locate" && target.platform === "android";

        if (silentAndroid) {
          return messaging.send({
            token: target.token,
            data,
            android: {
              priority: "high",
              ttl: 30_000,
              collapseKey: "family-locate",
            },
          });
        }

        const customAndroidNotification =
          target.platform === "android" &&
          (payload.action === "messenger:call" ||
            payload.action === "messenger:message" ||
            payload.action === "family:sos" ||
            payload.action === "default");

        if (customAndroidNotification) {
          return messaging.send({
            token: target.token,
            data,
            android: {
              priority: "high",
              ttl: payload.action === "messenger:call" ? 45_000 : 86_400_000,
              collapseKey:
                payload.action === "messenger:call" && payload.callId
                  ? `call-${payload.callId}`
                  : payload.action ?? "qhub-default",
            },
          });
        }

        return messaging.send({
          token: target.token,
          notification: {
            title: payload.title,
            body: payload.body,
          },
          data,
          android: {
            priority: "high",
            notification: {
              channelId: "qhub_default",
            },
          },
          apns: { payload: { aps: { sound: "default" } } },
        });
      }),
    );
  } catch (err) {
    console.error("[FCM] send failed:", err);
  }
}
