const CACHE = "workout-tracker-v13";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg",
  "./images/demo-press.png",
  "./images/demo-fly.png",
  "./images/demo-pushdown.png",
  "./images/demo-pulldown.png",
  "./images/demo-row.png",
  "./images/demo-curl.png",
  "./images/demo-raise.png",
  "./images/demo-plank.png",
  "./images/demo-core.png",
  "./images/demo-legs.png",
  "./images/anatomy-press.png",
  "./images/anatomy-press.gif",
  "./images/anatomy-fly.png",
  "./images/anatomy-fly.gif",
  "./images/anatomy-pushdown.png",
  "./images/anatomy-pushdown.gif",
  "./images/anatomy-pulldown.png",
  "./images/anatomy-pulldown.gif",
  "./images/anatomy-row.png",
  "./images/anatomy-row.gif",
  "./images/anatomy-curl.png",
  "./images/anatomy-curl.gif",
  "./images/anatomy-raise.png",
  "./images/anatomy-raise.gif",
  "./images/anatomy-plank.png",
  "./images/anatomy-plank.gif",
  "./images/anatomy-core.png",
  "./images/anatomy-core.gif",
  "./images/anatomy-legs.png",
  "./images/anatomy-legs.gif"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
        }
        return response;
      });
    })
  );
});
