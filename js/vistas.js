// Funciones vistaX(): arman app.innerHTML y enganchan sus propios listeners
// justo después de renderizar (no hay delegación global de eventos).
function vistaInicio() {
  app.innerHTML = `
    <div class="card">
      <h2>Bienvenido</h2>
      <p class="muted">Reemplaza esta vista por el contenido real de la app.</p>
    </div>`;
}
