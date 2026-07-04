# Notas del proyecto (NOMBRE_DE_LA_APP)

App estática (PWA, sin build) servida en GitHub Pages desde este repo. Sin backend:
todo el estado vive en `localStorage` (ver `js/store.js`). Versionado: subir
`APP_VERSION` en `js/core.js` y `CACHE` en `sw.js` juntos en cada cambio visible.

## Arquitectura

- Sin build ni bundler: son `<script>` clásicos cargados en orden desde `index.html`,
  todos comparten el mismo scope léxico (variables/funciones de un archivo son
  visibles en los siguientes). Orden actual: `js/store.js`, `js/core.js`, `js/vistas.js`,
  `js/app.js`.
- `js/store.js`: único dueño de la persistencia. Expone `Store.init()` (carga desde
  localStorage con defaults), `Store.set...()` (helpers que mutan una parte del
  estado y guardan), y devuelve siempre el objeto de estado actualizado.
- `js/core.js`: helpers puros y de lógica de negocio (fechas, permisos, cálculos).
  No toca el DOM.
- `js/vistas.js`: funciones `vistaX()` que arman `app.innerHTML` y enganchan sus
  propios listeners después de renderizar.
- `js/app.js`: arranque (`start()`), router por hash (`router()`, un solo listener
  de `hashchange`), navegación.

## Convención de versionado (OBLIGATORIA en cada cambio visible/funcional)

1. Subir `APP_VERSION` en `js/core.js` (semver simple: patch para fixes chicos,
   minor para features).
2. Subir `CACHE` en `sw.js` a **el mismo valor** (`"nombre-vX.Y.Z"`).
3. Probar el cambio (ver sección de testing) antes de subir.
4. Commit → push a la rama de trabajo → `git checkout main` → `git merge --ff-only`
   → push a main → volver a la rama de trabajo.

## Service Worker (`sw.js`)

Patrón "network-first" para que nunca quede pegado en una versión vieja:

- HTML: siempre se pide a la red con `{cache: "no-store"}`; si falla (offline),
  cae a la copia cacheada de `index.html`.
- Assets (JS/CSS/datos/imágenes): red primero (sin caché HTTP del navegador),
  se actualiza la caché del SW con la respuesta fresca; si falla, cae a la caché.
- `install`: precachea todo con `Promise.allSettled` (no `addAll`), para que si
  UN recurso falla no se caiga toda la instalación y la app se quede sin poder
  funcionar offline.
- `activate`: borra cachés viejas (cualquier nombre distinto de `CACHE`).
- `skipWaiting()` en `install` + `clients.claim()` en `activate`: la versión
  nueva se activa sola, sin banner de "hay una actualización, recarga".

## Testing antes de cada cambio

Esta es una PWA sin build: probarla significa levantarla como archivos estáticos
(`python3 -m http.server`) y abrirla en un navegador real (o vía Playwright),
NO solo revisar que el código "se vea bien". Antes de dar un cambio por
terminado:

1. Copiar el repo a una carpeta aparte (para no ensuciar el working tree).
2. Servir esa copia con `python3 -m http.server <puerto>`.
3. Abrir con un navegador (headless o no) y ejercitar el flujo afectado de
   principio a fin — no solo confirmar que la función existe.
4. Limpiar (matar el server, borrar la copia) al terminar.

## Recordatorios (agregar aquí lo que corresponda a esta app)

- Si en algún momento el usuario pide una idea que no se implementa de
  inmediato pero se quiere retomar más adelante, anotarla en esta sección para
  no perderla entre sesiones (temáticas visuales, features pendientes, deudas
  técnicas, etc.).
