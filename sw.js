const CACHE = "nutrick-v0.6.14-cache";
const CACHE_PREFIX = "nutrick-";
const ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg", "./apple-touch-icon.png", "./data/taco.json"]
  .map(path => new URL(path, self.registration.scope).href);
const FALLBACK_URL = new URL("./index.html", self.registration.scope).href;

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const obsoleteAppCaches = keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE);
    await Promise.all(obsoleteAppCaches.map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const requestUrl = new URL(request.url);
  const scopeUrl = new URL(self.registration.scope);
  const inAppScope = requestUrl.origin === scopeUrl.origin && requestUrl.pathname.startsWith(scopeUrl.pathname);
  if (!inAppScope) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request);
      if (response && response.ok && response.type !== "opaque") {
        try {
          await cache.put(request, response.clone());
        } catch (cacheError) {
          // A cache quota or write error must not turn a successful network response into a failure.
        }
      }
      return response;
    } catch (networkError) {
      const cachedResponse = await cache.match(request);
      if (cachedResponse) return cachedResponse;

      if (request.mode === "navigate") {
        const appShell = await cache.match(FALLBACK_URL);
        if (appShell) return appShell;
      }

      return new Response("NuTrick está offline e este recurso ainda não foi armazenado.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }
  })());
});
