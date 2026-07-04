const app = document.getElementById("app");
let S;

function router() {
  const h = location.hash || "#/";
  switch (h) {
    case "#/": case "": return vistaInicio();
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
