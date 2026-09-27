const worker = self as unknown as ServiceWorkerGlobalScope;
const CACHE = "atelier-mobile-v1";
const SHELL = ["/", "/manifest.webmanifest", "/apple-touch-icon.png", "/icon-192.png", "/icon-512.png"];

worker.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  worker.skipWaiting();
});

worker.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
  );
  worker.clients.claim();
});

worker.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).pathname.startsWith("/remote/")) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/").then((shell) => shell ?? Response.error()))),
  );
});
