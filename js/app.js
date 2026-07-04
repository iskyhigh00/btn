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
  S = Store.init();
  router();
  window.addEventListener("hashchange", () => { window.scrollTo(0, 0); router(); });
})();
