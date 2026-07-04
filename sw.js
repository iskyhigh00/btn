const CACHE = "botonera-v0.8.0";
const HTML = ["./", "./index.html"];
const ASSETS = [
  "./css/styles.css",
  "./js/store.js", "./js/core.js", "./js/vistas.js", "./js/app.js",
  "./manifest.json",
  "./img/logo-icon.png",
];

self.addEventListener("install", (e) => {
  // Los assets son network-first, así que el contenido siempre llega fresco de la red:
  // activamos la versión nueva en silencio, sin molestar con un banner de "Actualizar".
  self.skipWaiting();
  // cache.add por recurso con allSettled: si UN asset falla (404, nombre con
  // espacios, opcional ausente) NO se cae toda la instalación del SW como
  // ocurriría con addAll (que es atómico) y nos quedaríamos sin offline.
  e.waitUntil(caches.open(CACHE).then((c) =>
    Promise.allSettled([...HTML, ...ASSETS].map((a) => c.add(a)))
  ));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  const isHTML = url.pathname === "/" || url.pathname.endsWith(".html");

  if (isHTML) {
    // HTML siempre desde la red, IGNORANDO la caché HTTP del navegador (no-store):
    // si no, fetch() puede devolver una respuesta cacheada por el navegador sin
    // siquiera llegar a la red, y la página queda "pegada" en una versión vieja.
    e.respondWith(
      fetch(e.request, { cache: "no-store" }).catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Assets: red primero (sin caché HTTP del navegador), actualizar cache; fallback a cache si offline
  e.respondWith(
    fetch(e.request, { cache: "no-store" }).then((r) => {
      if (r.ok) { const c = r.clone(); caches.open(CACHE).then((ca) => ca.put(e.request, c)); }
      return r;
    }).catch(() => caches.match(e.request))
  );
});

self.addEventListener("message", (e) => {
  if (e.data === "skipWaiting") self.skipWaiting();
});
