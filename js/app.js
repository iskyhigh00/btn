const app = document.getElementById("app");
let S;

function _renderNav(hash) {
  const enPanel = hash === "#/panel";
  document.getElementById("nav").innerHTML = `
    <a class="nav-link ${enPanel ? "" : "activo"}" href="#/">Hojas</a>
    <a class="nav-link ${enPanel ? "activo" : ""}" href="#/panel">Panel</a>`;
}

function router() {
  const h = location.hash || "#/";
  _renderNav(h);
  switch (h) {
    case "#/panel": return vistaPanel();
    default: return vistaInicio();
  }
}

(function start() {
  document.getElementById("version").textContent = `v${APP_VERSION}`;
  S = Store.init();
  router();
  window.addEventListener("hashchange", () => { window.scrollTo(0, 0); router(); });
  // Supr/Backspace borra el botón (o grupo) seleccionado, salvo que el foco
  // esté en un campo de texto (ahí Backspace debe borrar caracteres, no botones).
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Delete" && e.key !== "Backspace") return;
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    _manejarBorradoTeclado();
  });
})();
