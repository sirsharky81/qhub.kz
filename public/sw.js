const CACHE_NAME = "qhub-v13";
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

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || "/icon-192.png",
      badge: data.badge || "/icon-192.png",
      data: {
        url: data.url,
        action: data.action,
        requestId: data.requestId || undefined,
      },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  const action = event.notification.data?.action;
  const requestId = event.notification.data?.requestId;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (action === "family:locate") {
          client.postMessage({
            type: "qhub:family-locate",
            action,
            requestId,
          });
        }
        if (client.url.includes(url) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    }),
  );
});
