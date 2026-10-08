const CACHE = "workout-tracker-v20";
const ASSETS = [
  "./",
  "./index.html",
  "./therapy.js",
  "./notifications.js",
  "./push-config.js",
  "./therapy-demo.js",
  "./images/therapy-heel-dig-frames.png",
  "./images/therapy-heel-slide-frames.png",
  "./images/therapy-bridge-frames.png",
  "./images/therapy-heel-dig.png",
  "./images/therapy-heel-slide.png",
  "./images/ex-glute-bridge.png",
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
  "./images/demo-legs.png"
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
  if (new URL(event.request.url).origin !== self.location.origin) return;
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

self.addEventListener("push", event => {
  event.waitUntil((async()=>{
    let data = {};
    try {data = event.data?.json() || {};} catch {}
    await self.registration.showNotification(data.title || "Workout Tracker",{
      body:data.body || "Your workout notification is ready.",
      tag:data.tag || "gym-rest",icon:"./icon.svg",badge:"./icon.svg",
      data:{url:new URL("./index.html",self.registration.scope).href}
    });
  })());
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async()=>{
    const windows = await self.clients.matchAll({type:"window",includeUncontrolled:true});
    const existing = windows.find(client=>new URL(client.url).origin===self.location.origin);
    if (existing) return existing.focus();
    return self.clients.openWindow(new URL("./index.html",self.registration.scope).href);
  })());
});
