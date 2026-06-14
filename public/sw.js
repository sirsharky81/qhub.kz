const CACHE_NAME = "qhub-v4";
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
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(fetch(request));
});

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
