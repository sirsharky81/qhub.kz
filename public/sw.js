const CACHE_NAME = "qhub-v15";
const PRECACHE = [
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/track-placeholder.png",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const { pathname } = url;

  if (pathname.startsWith("/api/")) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) {
    event.respondWith(fetch(request));
    return;
  }

  if (
    pathname.startsWith("/apps/") ||
    pathname.startsWith("/tools/") ||
    pathname.startsWith("/qhub-ctrl-7k2m") ||
    pathname.startsWith("/_next/")
  ) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(handleNavigate(request));
    return;
  }

  if (PRECACHE.includes(pathname)) {
    // Плейсхолдер обложки: network-first — iOS lock screen иначе может получить устаревший SW-кэш.
    if (pathname === "/track-placeholder.png") {
      event.respondWith(networkFirst(request));
      return;
    }
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(fetch(request));
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error("offline");
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
  }
  return response;
}

async function handleNavigate(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;

    if (new URL(request.url).pathname === "/") {
      const home = await cache.match("/");
      if (home) return home;
    }

    return new Response("Нет подключения к интернету", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

self.addEventListener("push", (event) => {
  let data = {
    title: "QHub",
    body: "Новое уведомление",
    url: "/",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    action: "default",
    silent: false,
    requestId: "",
  };
  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch {
    /* use defaults */
  }

  if (data.action === "family:locate" && data.silent) {
    event.waitUntil(
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
        if (clients.length === 0) return;
        for (const client of clients) {
          client.postMessage({
            type: "qhub:family-locate",
            action: data.action,
            requestId: data.requestId || undefined,
          });
        }
      }),
    );
    return;
  }

  const notificationData = {
    url: data.url,
    action: data.action,
    requestId: data.requestId || undefined,
    callId: data.callId || undefined,
    callMedia: data.callMedia || undefined,
  };

  const notificationOptions = {
    body: data.body,
    icon: data.icon || "/icon-192.png",
    badge: data.badge || "/icon-192.png",
    data: notificationData,
  };

  if (data.action === "messenger:call" && data.callId) {
    notificationOptions.tag = `call-${data.callId}`;
    notificationOptions.requireInteraction = true;
    notificationOptions.actions = [
      { action: "call-accept", title: "Принять" },
      { action: "call-decline", title: "Отклонить" },
    ];
  }

  event.waitUntil(
    self.registration.showNotification(data.title, notificationOptions),
  );
});

async function declineIncomingCall(callId) {
  if (!callId) return;
  try {
    await fetch("/api/messenger/call/end", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId, reason: "reject" }),
    });
  } catch {
    /* ignore */
  }
}

async function openNotificationUrl(rawUrl, action, requestId) {
  const path = rawUrl || "/tools/family";
  const targetUrl = new URL(path, self.location.origin).href;
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

  for (const client of clients) {
    if (action === "family:locate") {
      client.postMessage({
        type: "qhub:family-locate",
        action,
        requestId,
      });
    }
  }

  for (const client of clients) {
    if (!client.url.startsWith(self.location.origin)) continue;
    if ("focus" in client) {
      await client.focus();
    }
    if ("navigate" in client) {
      return client.navigate(targetUrl);
    }
  }

  if (self.clients.openWindow) {
    return self.clients.openWindow(targetUrl);
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data ?? {};
  const url = data.url;
  const action = data.action;
  const requestId = data.requestId;
  const callId = data.callId;

  if (event.action === "call-decline") {
    event.waitUntil(declineIncomingCall(callId));
    return;
  }

  if (event.action === "call-accept" || action === "messenger:call") {
    event.waitUntil(openNotificationUrl(url, action, requestId));
    return;
  }

  event.waitUntil(openNotificationUrl(url, action, requestId));
});
