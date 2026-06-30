import type { WebPushPayload } from "@/lib/family/push-server";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

interface FcmTarget {
  token: string;
  platform: "ios" | "android";
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
    if (process.env.NODE_ENV !== "production" && targets.length > 0) {
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
    await Promise.allSettled(
      targets.map((target) =>
        messaging.send({
          token: target.token,
          notification: {
            title: payload.title,
            body: payload.body,
          },
          data: {
            url: payload.url,
            ...(payload.icon ? { icon: payload.icon } : {}),
          },
          android: { priority: "high" },
          apns: { payload: { aps: { sound: "default" } } },
        }),
      ),
    );
  } catch (err) {
    console.error("[FCM] send failed:", err);
  }
}
