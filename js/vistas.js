// Funciones vistaX(): arman app.innerHTML y enganchan sus propios listeners
// justo después de renderizar (no hay delegación global de eventos).
//
// Para no perder el foco de los inputs mientras se edita un botón, el editor
// usa dos "islas" de render en vez de re-pintar toda la vista en cada tecla:
//   - #hoja: el lienzo con los botones (se repinta solo en cambios estructurales:
//     agregar/borrar/duplicar botón, cambiar de hoja, importar).
//   - #panel: el panel lateral (se repinta al seleccionar un botón, cambiar de
//     forma/tipo, etc.). Los inputs de texto/número/color hacen "input" directo
//     sobre el DOM del botón + Store.guardar(), sin re-render.

let _seleccion = new Set(); // ids de botones seleccionados en el lienzo
let _zoom = 0.85;

function _hojaActual() {
  return Store.hojaActual();
}

// Devuelve el botón seleccionado solo cuando la selección es de exactamente
// uno (para 0 o 2+ el panel muestra "agregar" o "selección múltiple").
function _botonSeleccionado() {
  if (_seleccion.size !== 1) return null;
  const id = [..._seleccion][0];
  return _hojaActual().botones.find((b) => b.id === id) || null;
}

// Un botón se pinta como "seleccionado" si está en la selección, o si la
// selección es un único botón de un grupo (entonces se resalta el grupo
// completo, ya que el panel edita a todos sus miembros a la vez).
function _estaResaltado(b) {
  if (_seleccion.has(b.id)) return true;
  if (_seleccion.size === 1) {
    const solo = _botonSeleccionado();
    if (solo && solo.grupoId && solo.grupoId === b.grupoId) return true;
  }
  return false;
}

function vistaInicio() {
  _seleccion = new Set();
  app.innerHTML = `
    <div class="editor">
      <aside class="panel-lateral card" id="panel"></aside>
      <section class="lienzo-wrap">
        <div class="aviso-impresion">Para imprimir, usa <b>márgenes: ninguno</b> y <b>escala: 100 %</b>. <span id="estado-impresion" role="status"></span></div>
        <div class="lienzo-toolbar card">
          <div class="barra-hoja">
            <label class="zoom-label" for="sel-hoja">Hoja</label>
            <select id="sel-hoja"></select>
            <details class="menu-editor">
              <summary class="btn sm">Gestionar hojas</summary>
              <div class="menu-editor-opciones">
                <button class="btn sm" id="btn-hoja-nueva">Nueva hoja</button>
                <button class="btn sm" id="btn-hoja-renombrar">Renombrar hoja</button>
                <button class="btn sm" id="btn-hoja-duplicar">Duplicar hoja completa</button>
                <button class="btn sm" id="btn-guardar-juego">Guardar hoja como juego</button>
                <button class="btn sm" id="btn-cargar-juego">Abrir biblioteca de juegos</button>
                <button class="btn sm sec" id="btn-hoja-eliminar">Eliminar hoja</button>
              </div>
            </details>
          </div>
          <div class="barra-hoja">
            <button class="btn sm" id="btn-duplicar-seleccion" disabled>Duplicar selección</button>
            <button class="btn sm" id="btn-reorganizar">Reorganizar botones</button>
            <button class="btn sm" id="btn-deshacer">Deshacer</button>
            <button class="btn sm" id="btn-rehacer">Rehacer</button>
          </div>
          <span class="spacer"></span>
          <label class="zoom-label">Zoom <input type="range" id="zoom" min="0.3" max="1.3" step="0.05" value="${_zoom}"></label>
          <details class="menu-editor">
            <summary class="btn sm">Archivo</summary>
            <div class="menu-editor-opciones">
              <button class="btn sm" id="btn-exportar">Exportar proyecto JSON</button>
              <button class="btn sm" id="btn-importar">Importar proyecto JSON</button>
              <button class="btn sm" id="btn-calibrar">Imprimir prueba de escala</button>
            </div>
          </details>
          <input type="file" id="input-importar" accept="application/json" style="display:none">
          <button class="btn" id="btn-imprimir" title="Márgenes: Ninguno · Escala: 100% / Tamaño real">🖨️ Imprimir</button>
        </div>
        <dialog id="biblioteca-juegos">
          <form method="dialog" class="panel-form">
            <h3>Biblioteca de juegos</h3>
            <label class="campo">Juego guardado<select id="juego-guardado"></select></label>
            <div class="barra-hoja">
              <button class="btn" type="button" id="juego-crear">Crear hoja desde juego</button>
              <button class="btn sec" type="button" id="juego-eliminar">Eliminar juego guardado</button>
              <button class="btn sec">Cerrar</button>
            </div>
          </form>
        </dialog>
        <div class="lienzo-scroll">
          <div class="hoja" id="hoja" style="transform:scale(${_zoom})"></div>
        </div>
      </section>
    </div>`;

  _renderSelectorHojas();
  _renderHoja();
  _renderPanel();
  _enlazarToolbar();
}

// ---------- Toolbar (selector de hoja, zoom, exportar/importar, imprimir) ----------

function _renderSelectorHojas() {
  const sel = document.getElementById("sel-hoja");
  sel.innerHTML = S.hojas
    .map((h) => `<option value="${h.id}" ${h.id === S.hojaActualId ? "selected" : ""}>${esc(h.nombre)}</option>`)
    .join("");
}

function _capturarJuego(hoja, logos, nombre) {
  const botones = JSON.parse(JSON.stringify(hoja.botones));
  const ids = new Set();
  botones.forEach(({ contenido }) => {
    if (contenido.logoId) ids.add(contenido.logoId);
    (contenido.bloques || []).forEach((b) => { if (b.logoId) ids.add(b.logoId); });
  });
  return { id: uid(), nombre, botones, logos: Object.fromEntries([...ids].filter((id) => logos[id]).map((id) => [id, logos[id]])) };
}

function _copiarJuego(juego, logosActuales) {
  const grupos = new Map();
  const logos = {};
  const nuevosIds = new Map(Object.entries(juego.logos).map(([id, src]) => {
    const nuevo = Object.keys(logosActuales).find((clave) => logosActuales[clave] === src) || uid();
    logos[nuevo] = src;
    return [id, nuevo];
  }));
  const botones = JSON.parse(JSON.stringify(juego.botones));
  botones.forEach((b) => {
    b.id = uid();
    if (b.grupoId) {
      if (!grupos.has(b.grupoId)) grupos.set(b.grupoId, uid());
      b.grupoId = grupos.get(b.grupoId);
    }
    [b.contenido, ...(b.contenido.bloques || [])].forEach((c) => {
      if (nuevosIds.has(c.logoId)) c.logoId = nuevosIds.get(c.logoId);
    });
  });
  return { botones, logos };
}

function _enlazarBibliotecaJuegos() {
  const juegos = () => S.config.juegos ?? (S.config.juegos = []);
  const dialogo = document.getElementById("biblioteca-juegos");
  const selector = document.getElementById("juego-guardado");
  const crear = document.getElementById("juego-crear");
  const eliminar = document.getElementById("juego-eliminar");
  const pintar = () => {
    selector.innerHTML = juegos().map((j) => `<option value="${esc(j.id)}">${esc(j.nombre)} · ${j.botones.length} botones</option>`).join("");
    crear.disabled = eliminar.disabled = !juegos().length;
  };
  document.getElementById("btn-guardar-juego").onclick = () => {
    const hoja = _hojaActual();
    if (!hoja.botones.length) return toast("Agrega botones antes de guardar el juego.");
    const nombre = prompt("Nombre del juego", hoja.nombre)?.trim();
    if (!nombre) return;
    const anterior = juegos().findIndex((j) => j.nombre.toLowerCase() === nombre.toLowerCase());
    if (anterior >= 0 && !confirm(`¿Actualizar el juego guardado «${nombre}»?`)) return;
    const juego = _capturarJuego(hoja, S.logos, nombre);
    if (anterior < 0) juegos().push(juego);
    else juegos()[anterior] = juego;
    Store.guardar();
    toast("Juego guardado.");
  };
  document.getElementById("btn-cargar-juego").onclick = () => { pintar(); dialogo.showModal(); };
  crear.onclick = () => {
    const juego = juegos().find((j) => j.id === selector.value);
    if (!juego) return;
    const copia = _copiarJuego(juego, S.logos);
    S = Store.crearHoja(juego.nombre);
    Object.assign(S.logos, copia.logos);
    _hojaActual().botones = copia.botones;
    Store.guardar();
    _seleccion = new Set();
    dialogo.close();
    _renderSelectorHojas();
    _renderHoja();
    _renderPanel();
  };
  eliminar.onclick = () => {
    const indice = juegos().findIndex((j) => j.id === selector.value);
    if (indice < 0 || !confirm(`¿Eliminar el juego guardado «${juegos()[indice].nombre}»?`)) return;
    juegos().splice(indice, 1);
    Store.guardar();
    pintar();
  };
}

function _enlazarToolbar() {
  _enlazarBibliotecaJuegos();
  for (const accion of ["deshacer", "rehacer"]) {
    document.getElementById(`btn-${accion}`).onclick = () => {
      const estado = Store[accion]();
      if (!estado) return toast(`No hay cambios para ${accion}.`);
      S = estado;
      _seleccion = new Set();
      document.getElementById("toasts").replaceChildren();
      _renderSelectorHojas();
      _renderHoja();
      _renderPanel();
    };
  }
  document.getElementById("sel-hoja").onchange = (e) => {
    S = Store.setHojaActual(e.target.value);
    _seleccion = new Set();
    _renderHoja();
    _renderPanel();
  };
  document.getElementById("btn-hoja-nueva").onclick = () => {
    S = Store.crearHoja();
    _seleccion = new Set();
    _renderSelectorHojas();
    _renderHoja();
    _renderPanel();
  };
  document.getElementById("btn-hoja-renombrar").onclick = () => {
    const h = _hojaActual();
    const nombre = prompt("Nombre de la hoja:", h.nombre);
    if (nombre) {
      S = Store.renombrarHoja(h.id, nombre);
      _renderSelectorHojas();
    }
  };
  document.getElementById("btn-hoja-duplicar").onclick = () => {
    S = Store.duplicarHoja(_hojaActual().id);
    _seleccion = new Set();
    _renderSelectorHojas();
    _renderHoja();
    _renderPanel();
  };
  document.getElementById("btn-hoja-eliminar").onclick = () => {
    const h = _hojaActual();
    if (!confirm(`¿Eliminar "${h.nombre}" y todos sus botones?`)) return;
    S = Store.eliminarHoja(h.id);
    _seleccion = new Set();
    _renderSelectorHojas();
    _renderHoja();
    _renderPanel();
  };
  document.getElementById("btn-duplicar-seleccion").onclick = _duplicarSeleccion;
  document.querySelectorAll(".menu-editor").forEach((menu) => {
    menu.addEventListener("click", (e) => { if (e.target.closest("button")) menu.open = false; });
    menu.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && menu.open) {
        menu.open = false;
        menu.querySelector("summary").focus();
      }
    });
  });
  document.getElementById("btn-reorganizar").onclick = () => {
    const hoja = _hojaActual();
    if (!hoja.botones.length) return toast("Agrega botones a la hoja para reorganizarlos.");
    const posiciones = new Map(hoja.botones.map((b) => [b.id, { x: b.x, y: b.y }]));
    reorganizarBotones(hoja.botones);
    const cambios = hoja.botones.filter((b) => {
      const anterior = posiciones.get(b.id);
      return b.x !== anterior.x || b.y !== anterior.y;
    }).map((b) => ({ id: b.id, x: b.x, y: b.y }));
    if (!cambios.length) return toast("La hoja ya está organizada.");
    Store.guardar();
    _renderHoja();
    toastAccion("Hoja reorganizada para corte.", "Deshacer", () => {
      const actual = S.hojas.find((h) => h.id === hoja.id);
      if (!actual) return;
      const porId = new Map(actual.botones.map((b) => [b.id, b]));
      cambios.forEach(({ id, x, y }) => {
        const b = porId.get(id);
        if (b && b.x === x && b.y === y) Object.assign(b, posiciones.get(id));
      });
      Store.guardar();
      if (_hojaActual().id === actual.id) _renderHoja();
    }, 12000);
  };
  document.getElementById("zoom").oninput = (e) => {
    _zoom = Number(e.target.value);
    document.getElementById("hoja").style.transform = `scale(${_zoom})`;
  };
  document.getElementById("btn-exportar").onclick = () => {
    const blob = new Blob([Store.exportarJSON()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "botonera.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  document.getElementById("btn-importar").onclick = () => document.getElementById("input-importar").click();
  document.getElementById("input-importar").onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const modo = confirm("Aceptar = reemplazar todo.\nCancelar = agregar como hojas nuevas (sin borrar lo actual).")
      ? "reemplazar"
      : "agregar";
    const reader = new FileReader();
    reader.onload = () => {
      S = Store.importarJSON(reader.result, modo);
      _seleccion = new Set();
      _renderSelectorHojas();
      _renderHoja();
      _renderPanel();
      toast("Importado.");
    };
    reader.readAsText(file);
    e.target.value = "";
  };
  document.getElementById("btn-calibrar").onclick = _imprimirPruebaEscala;
  document.getElementById("btn-imprimir").onclick = () => {
    if (!_hojaActual().botones.length) return toast("Esta hoja no tiene botones para imprimir.");
    const problemas = _revisarImpresion();
    if (problemas.length && !confirm(`Revisa antes de imprimir:\n${problemas.join("\n")}\n\n¿Imprimir de todos modos?`)) return;
    window.print();
  };
}

function _imprimirPruebaEscala() {
  const prueba = document.createElement("section");
  prueba.id = "prueba-escala";
  prueba.innerHTML = `<h1>Prueba de escala</h1>
    <p>Imprime al 100 % y mide entre marcas. Cada eje debe medir 50 mm.</p>
    <svg viewBox="0 0 75 75" role="img" aria-label="Dos referencias perpendiculares de 50 milímetros">
      <path d="M10 10H60 M10 10V60 M10 7V13 M60 7V13 M7 10H13 M7 60H13" fill="none" stroke="black" stroke-width=".25"/>
      <text x="35" y="6" text-anchor="middle" font-size="3.5">50 mm</text>
      <text x="14" y="38" font-size="3.5">50 mm</text>
    </svg>`;
  document.body.append(prueba);
  document.body.classList.add("imprimiendo-calibracion");
  window.addEventListener("afterprint", () => {
    prueba.remove();
    document.body.classList.remove("imprimiendo-calibracion");
  }, { once: true });
  window.print();
}

// ---------- Lienzo (hoja + botones + marcas de corte) ----------

function _marcasHtml(botones) {
  const deCorte = botones.flatMap(marcasDeCorteBoton).map((m) => `<div class="marca-corte" style="left:${m.x}mm;top:${m.y}mm;width:${m.w}mm;height:${m.h}mm"></div>`);
  const deBorde = marcasDeBordeHoja(botones).map((m) => `<div class="marca-borde" style="left:${m.x}mm;top:${m.y}mm;width:${m.w}mm;height:${m.h}mm"></div>`);
  return deCorte.join("") + deBorde.join("");
}

function _bloqueFueraDelBoton(bloque, boton) {
  const bordes = boton.getBoundingClientRect();
  const rango = document.createRange();
  rango.selectNodeContents(bloque);
  const lineas = [...rango.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
  const path = boton.querySelector(".contorno-boton path");
  const inversa = typeof path?.isPointInFill === "function" ? path.getScreenCTM()?.inverse() : null;
  return lineas.some((rect) => {
    if (rect.left < bordes.left - 1 || rect.right > bordes.right + 1 ||
        rect.top < bordes.top - 1 || rect.bottom > bordes.bottom + 1) return true;
    return inversa && [[rect.left,rect.top],[rect.right,rect.top],[rect.left,rect.bottom],[rect.right,rect.bottom]]
      .some(([x,y]) => !path.isPointInFill(new DOMPoint(x,y).matrixTransform(inversa)));
  });
}

function _revisarImpresion() {
  const botones = _hojaActual().botones;
  const tolerancia = 0.01;
  const fuera = botones.filter((b) => b.x < -tolerancia || b.y < -tolerancia ||
    b.x + b.w > HOJA_ANCHO_MM + tolerancia || b.y + b.h > HOJA_ALTO_MM + tolerancia).length;
  const solapados = botones.filter((a, i) => botones.some((b, j) => i !== j &&
    Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > tolerancia &&
    Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > tolerancia)).length;
  const recortados = [...document.querySelectorAll("#hoja .boton-print")].filter((el) =>
    [...el.querySelectorAll(".boton-linea, .boton-numero, .bloque-texto")].some((linea) =>
      linea.scrollWidth > linea.clientWidth + 1 || linea.scrollHeight > linea.clientHeight + 1 ||
      (linea.classList.contains("bloque-texto") && _bloqueFueraDelBoton(linea, el)))
  ).length;
  return [
    fuera && `${fuera} con desborde de la hoja`,
    solapados && `${solapados} con solapamiento`,
    recortados && `${recortados} con texto recortado`,
  ].filter(Boolean);
}

function _actualizarEstadoImpresion() {
  const cantidad = _hojaActual().botones.length;
  const problemas = _revisarImpresion();
  document.getElementById("estado-impresion").textContent = problemas.length
    ? ` · ${cantidad} en la hoja. Revisar: ${problemas.join(", ")}.`
    : ` · ${cantidad} ${cantidad === 1 ? "botón" : "botones"} en la hoja.`;
}

function _renderHoja() {
  const hojaEl = document.getElementById("hoja");
  const h = _hojaActual();
  hojaEl.innerHTML = _marcasHtml(h.botones) + h.botones.map((b) => `<div class="boton-print" data-id="${b.id}"></div>`).join("");
  h.botones.forEach((b) => _pintarBoton(document.querySelector(`.boton-print[data-id="${b.id}"]`), b));
  _sincronizarTextoGrupos(h);
  _enlazarBotones();
  _actualizarEstadoImpresion();
}

// Dentro de un mismo grupo (lista de números), cada botón achica su letra
// según el largo de SU propia palabra (ej. "LÍNEA" vs "LÍNEAS"), lo que deja
// tamaños de letra distintos entre botones que deberían verse iguales. Acá
// se empareja: cada línea usa el tamaño más chico que necesitó cualquier
// miembro del grupo, para que el grupo entero se vea uniforme.
function _sincronizarTextoGrupos(hoja) {
  const gruposIds = new Set(hoja.botones.filter((b) => b.grupoId).map((b) => b.grupoId));
  gruposIds.forEach((gid) => {
    const miembros = hoja.botones.filter((b) => b.grupoId === gid);
    const els = miembros.map((m) => document.querySelector(`.boton-print[data-id="${m.id}"]`)).filter(Boolean);
    if (els.length < 2) return;
    [".boton-linea-arriba", ".boton-numero", ".boton-linea-abajo"].forEach((selector) => _sincronizarRol(els, selector));
  });
}

function _sincronizarRol(els, selector) {
  const nodos = els.map((el) => el.querySelector(selector)).filter(Boolean);
  if (nodos.length < 2) return;
  const minSize = Math.min(...nodos.map((n) => parseFloat(n.style.fontSize) || Infinity));
  if (!isFinite(minSize)) return;
  nodos.forEach((n) => { n.style.fontSize = `${minSize.toFixed(2)}mm`; });
}

function _codigosBoton(texto, porComas = false) {
  const separador = porComas ? "," : /\r?\n/;
  return [...new Set(texto.split(separador).map((codigo) => codigo.trim()).filter(Boolean))];
}

function _escalaTexto(valor) {
  return Math.max(50, Math.min(150, Number(valor) || 100));
}

const ORIENTACIONES_TEXTO = [
  ["horizontal", "Horizontal"],
  ["vertical", "Girado 90° hacia abajo"],
  ["vertical-inverso", "Girado 90° hacia arriba"],
  ["apilado", "Letras una debajo de otra"],
];

function _orientacionTexto(valor) {
  return ORIENTACIONES_TEXTO.some(([id]) => id === valor) ? valor : "horizontal";
}

function _controlesTexto(prefijo, contenido, literalPorDefecto = false) {
  const literal = contenido.textoLiteral ?? literalPorDefecto;
  return `
    <label class="campo">Orientación del texto
      <select id="${prefijo}-orientacion">${ORIENTACIONES_TEXTO.map(([id, nombre]) =>
        `<option value="${id}" ${_orientacionTexto(contenido.orientacionTexto) === id ? "selected" : ""}>${nombre}</option>`
      ).join("")}</select>
    </label>
    <details class="opciones-texto">
      <summary>Tamaño de las letras y plural</summary>
      <label class="campo"><span><input id="${prefijo}-literal" type="checkbox" ${literal ? "checked" : ""}> Mantener el texto inferior tal como se escribe</span></label>
      ${[["arriba", "Superior"], ["centro", "Central"], ["abajo", "Inferior"]].map(([rol, etiqueta]) => `
        <label class="campo">${etiqueta} (%)<input id="${prefijo}-escala-${rol}" type="number" min="50" max="150" step="1" value="${_escalaTexto(contenido.escalasTexto?.[rol])}"></label>
      `).join("")}
    </details>`;
}

function _leerControlesTexto(prefijo) {
  return {
    orientacionTexto: _orientacionTexto(document.getElementById(`${prefijo}-orientacion`).value),
    textoLiteral: document.getElementById(`${prefijo}-literal`).checked,
    escalasTexto: Object.fromEntries(["arriba", "centro", "abajo"].map((rol) => [
      rol, _escalaTexto(document.getElementById(`${prefijo}-escala-${rol}`).value),
    ])),
  };
}

function _enlazarControlesTexto(prefijo, botones, refrescar, persistir) {
  const aplicar = () => {
    const opciones = _leerControlesTexto(prefijo);
    botones().forEach((b) => Object.assign(b.contenido, opciones));
    refrescar();
    persistir();
  };
  document.getElementById(`${prefijo}-literal`).closest("details").onchange = aplicar;
  document.getElementById(`${prefijo}-orientacion`).onchange = aplicar;
}

function _numeroAcotado(valor, defecto, min, max) {
  const n = valor === "" || valor == null ? NaN : Number(valor);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : defecto;
}

function _puntosContorno(texto) {
  const filas = String(texto ?? "").trim().split(/[\r\n;]+/);
  if (filas.length < 3 || filas.length > 64) return null;
  const puntos = filas.map((fila) => fila.trim().split(/\s*,\s*/).map((valor) => valor ? Number(valor) : NaN));
  if (!puntos.every((p) => p.length === 2 && p.every((v) => Number.isFinite(v) && v >= 0 && v <= 100))) return null;
  const area = puntos.reduce((total, [x,y], i) => {
    const [sigX,sigY] = puntos[(i + 1) % puntos.length];
    return total + x * sigY - sigX * y;
  }, 0);
  if (Math.abs(area) <= 0.01 || new Set(puntos.map((p) => p.join(","))).size !== puntos.length) return null;
  const orientacion = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < puntos.length; i++) {
    const a = puntos[i], b = puntos[(i + 1) % puntos.length];
    for (let j = i + 2; j < puntos.length; j++) {
      if (i === 0 && j === puntos.length - 1) continue;
      const c = puntos[j], d = puntos[(j + 1) % puntos.length];
      const solapa = [0, 1].every((eje) => Math.max(Math.min(a[eje], b[eje]), Math.min(c[eje], d[eje])) <=
        Math.min(Math.max(a[eje], b[eje]), Math.max(c[eje], d[eje])));
      if (solapa && orientacion(a,b,c) * orientacion(a,b,d) <= 0 && orientacion(c,d,a) * orientacion(c,d,b) <= 0) return null;
    }
  }
  return puntos;
}

const PUNTOS_INICIALES = "50,0\n100,50\n50,100\n0,50";

function _contornoEspecial(b) {
  if (b.forma === "triangulo") return "M44 7 Q50 -2 56 7 L96 80 Q105 98 87 98 H13 Q-5 98 4 80 Z";
  if (b.forma !== "personalizado") return "";
  const puntos = _puntosContorno(b.puntosContorno ?? PUNTOS_INICIALES);
  return puntos ? `M${puntos.map((p) => p.join(" ")).join(" L")} Z` : "";
}

function _resolverBloque(texto, c) {
  const inferior = c.textoLiteral || !Number.isFinite(Number(c.numero))
    ? c.abajo || "" : pluralizar(c.numero, c.abajo);
  const valores = { "código": c.numero, prefijo: c.numeroPrefijo, superior: c.arriba, inferior };
  return String(texto ?? "").replace(/\{(código|prefijo|superior|inferior)\}/g, (_, clave) => String(valores[clave] ?? ""));
}

function _bloquesLibresHTML(c) {
  return c.bloques.map((b) => {
    const x = _numeroAcotado(b.x, 50, 0, 100);
    const y = _numeroAcotado(b.y, 50, 0, 100);
    const ancho = _numeroAcotado(b.ancho, 90, 1, 100);
    const tam = _numeroAcotado(b.tam, 4, 0.5, 50);
    const giro = _numeroAcotado(b.giro, 0, -180, 180);
    const pos = `left:${x}%;top:${y}%;width:${ancho}%;transform:translate(-50%,-50%) rotate(${giro}deg)`;
    if (b.tipo === "linea") return `<span class="bloque-libre bloque-separador" style="${pos};height:${tam}mm"></span>`;
    if (b.tipo === "logo") {
      const src = S.logos[b.logoId];
      return src ? `<span class="bloque-libre" style="${pos};height:${tam}mm"><img alt="" src="${esc(src)}"></span>` : "";
    }
    const alineacion = ["left", "center", "right"].includes(b.alineacion) ? b.alineacion : "center";
    return `<span class="bloque-libre bloque-texto" style="${pos};font-size:${tam}mm;font-weight:${b.negrita === false ? 400 : 700};text-align:${alineacion}">${esc(_resolverBloque(b.texto, c))}</span>`;
  }).join("");
}

function _bloquesIniciales(contenido) {
  const lineas = [
    [contenido.arriba, "{superior}"],
    [contenido.numero != null && contenido.numero !== "", "{prefijo}{código}"],
    [contenido.abajo, "{inferior}"],
  ].filter(([visible]) => visible);
  return lineas.map(([, texto], i) => ({ tipo:"texto", texto, x:50, y:100 * (i + 1) / (lineas.length + 1), ancho:90, tam:4, giro:0, negrita:true }));
}

function _editorComposicion(prefijo, c) {
  return `<details class="opciones-texto">
    <summary>Composición libre</summary>
    <label class="campo"><span><input type="checkbox" id="${prefijo}-libre" ${c.composicionLibre ? "checked" : ""}> Usar bloques posicionables</span></label>
    <div id="${prefijo}-bloques"></div>
  </details>`;
}

function _enlazarComposicion(prefijo, botones, refrescar, persistir) {
  const toggle = document.getElementById(`${prefijo}-libre`);
  const panel = document.getElementById(`${prefijo}-bloques`);
  const leer = () => botones()[0].contenido;
  const aplicar = (cambio) => {
    botones().forEach((b) => Object.assign(b.contenido, cambio));
    refrescar();
    persistir();
  };
  const campo = (b, nombre, etiqueta, defecto, min, max, paso) =>
    `<label class="campo">${etiqueta}<input data-campo="${nombre}" type="number" min="${min}" max="${max}" step="${paso}" value="${_numeroAcotado(b[nombre], defecto, min, max)}"></label>`;
  const pintar = () => {
    const c = leer();
    panel.hidden = !c.composicionLibre;
    if (panel.hidden) return;
    panel.innerHTML = `
      <p class="muted">Posición X/Y en porcentaje desde la esquina superior izquierda hasta el centro del bloque. Para series usa {código} o {prefijo}.</p>
      ${c.bloques.map((b, i) => `<fieldset class="bloque-campos" data-indice="${i}">
        <legend>${b.tipo === "linea" ? "Separador" : b.tipo === "logo" ? "Imagen" : "Texto"} ${i + 1}</legend>
        ${b.tipo === "texto" ? `<label class="campo">Texto<textarea rows="2" data-campo="texto">${esc(b.texto || "")}</textarea></label>
        <label class="campo">Alineación<select data-campo="alineacion">${[["left","Izquierda"],["center","Centro"],["right","Derecha"]].map(([id,label]) => `<option value="${id}" ${(b.alineacion || "center") === id ? "selected" : ""}>${label}</option>`).join("")}</select></label>
        <label class="campo"><span><input type="checkbox" data-campo="negrita" ${b.negrita === false ? "" : "checked"}> Negrita</span></label>` : ""}
        ${b.tipo === "logo" ? `<label class="campo">Imagen guardada<select data-campo="logoId"><option value="">Elegir imagen</option>${Object.keys(S.logos).map((id, n) => `<option value="${esc(id)}" ${b.logoId === id ? "selected" : ""}>Imagen ${n + 1}</option>`).join("")}</select></label>` : ""}
        <div class="fila-2">${campo(b,"x","X (%)",50,0,100,0.5)}${campo(b,"y","Y (%)",50,0,100,0.5)}
        ${campo(b,"ancho","Ancho (%)",90,1,100,0.5)}${campo(b,"tam",b.tipo === "linea" ? "Grosor (mm)" : b.tipo === "logo" ? "Alto (mm)" : "Tamaño (mm)",4,0.5,50,0.1)}
        ${campo(b,"giro","Giro (°)",0,-180,180,1)}</div>
        <button type="button" data-quitar="${i}" class="btn sm sec">Quitar bloque</button>
      </fieldset>`).join("")}
      <div class="barra-hoja">
        <button type="button" data-agregar="texto" class="btn sm">+ Texto</button>
        <button type="button" data-agregar="linea" class="btn sm">+ Separador</button>
        <button type="button" data-agregar="logo" class="btn sm">+ Imagen</button>
      </div>`;
  };
  toggle.onchange = () => {
    aplicar({ composicionLibre: toggle.checked, bloques: leer().bloques ?? _bloquesIniciales(leer()) });
    pintar();
  };
  panel.onchange = (e) => {
    const input = e.target;
    const nombre = input.dataset.campo;
    if (!nombre) return;
    const indice = Number(input.closest("fieldset").dataset.indice);
    const bloques = leer().bloques.map((b, i) => i === indice ? { ...b, [nombre]: input.type === "checkbox"
      ? input.checked : input.type === "number" ? _numeroAcotado(input.value, b[nombre], Number(input.min), Number(input.max)) : input.value } : b);
    aplicar({ bloques });
  };
  panel.onclick = (e) => {
    const boton = e.target.closest("button");
    if (!boton) return;
    const bloques = [...leer().bloques];
    if (boton.dataset.agregar) {
      const tipo = boton.dataset.agregar;
      bloques.push({ tipo, texto:"", x:50, y:50, ancho:90, tam:tipo === "linea" ? 0.5 : tipo === "logo" ? 10 : 4, giro:0, negrita:true });
    } else if (boton.dataset.quitar != null) {
      bloques.splice(Number(boton.dataset.quitar), 1);
    } else return;
    aplicar({ bloques });
    pintar();
  };
  pintar();
}

function _contenidoHTML(b) {
  const c = b.contenido;
  if (c.tipo === "logo") {
    const src = S.logos[c.logoId] || "";
    return `<div class="boton-logo-wrap">
      <img src="${src}" style="transform: translate(${c.offsetX || 0}%, ${c.offsetY || 0}%) scale(${c.zoom || 1})">
    </div>`;
  }
  if (c.composicionLibre && Array.isArray(c.bloques)) return _bloquesLibresHTML(c);
  // El plural automático es opcional y solo se aplica a códigos numéricos.
  const arriba = c.arriba || "";
  const abajo = c.textoLiteral || !Number.isFinite(Number(c.numero)) ? (c.abajo || "") : pluralizar(c.numero, c.abajo);
  const tieneNumero = c.numero != null && c.numero !== "";
  // El tamaño de letra se calcula sobre el alto ÚTIL (descontando el padding
  // vertical), no el alto total del botón: así "separación arriba/abajo" se
  // nota siempre, aunque el texto sea corto y nunca llegara a desbordar.
  const vertical = _orientacionTexto(c.orientacionTexto) !== "horizontal";
  const altoUtil = Math.max(4, vertical ? b.w - 2 * (b.paddingHMm ?? 3) : b.h - 2 * (b.paddingVMm ?? 3));
  // Cuantas menos líneas tenga el botón, más grande puede ir cada una: un
  // botón de una sola línea ("SERVICIO") no debe verse chico como si fuera
  // la etiqueta superior de un diseño de 3 líneas.
  const lineasActivas = [!!arriba, tieneNumero, !!abajo].filter(Boolean).length;
  // Valores por defecto (diseño de 3 líneas); las ramas de abajo solo pisan
  // los que correspondan, así el que no se usa nunca queda "undefined".
  let fsArriba = altoUtil * 0.16, fsNumero = altoUtil * 0.4, fsAbajo = altoUtil * 0.16;
  if (lineasActivas <= 1) {
    fsArriba = fsNumero = fsAbajo = altoUtil * 0.5;
  } else if (lineasActivas === 2 && tieneNumero) {
    fsNumero = altoUtil * 0.5;
    fsArriba = fsAbajo = altoUtil * 0.22;
  } else if (lineasActivas === 2) {
    fsArriba = fsAbajo = altoUtil * 0.3;
  }
  fsArriba *= _escalaTexto(c.escalasTexto?.arriba) / 100;
  fsNumero *= _escalaTexto(c.escalasTexto?.centro) / 100;
  fsAbajo *= _escalaTexto(c.escalasTexto?.abajo) / 100;
  const altoTexto = (arriba ? fsArriba * 1.1 : 0) + (tieneNumero ? fsNumero : 0) + (abajo ? fsAbajo * 1.1 : 0);
  const ajuste = altoTexto > 0 ? Math.min(1, (altoUtil - 1) / altoTexto) : 1;
  fsArriba = (fsArriba * ajuste).toFixed(2);
  fsNumero = (fsNumero * ajuste).toFixed(2);
  fsAbajo = (fsAbajo * ajuste).toFixed(2);
  let html = "";
  if (arriba) html += `<div class="boton-linea boton-linea-arriba" style="font-size:${fsArriba}mm">${esc(arriba)}</div>`;
  if (c.numero != null && c.numero !== "") html += `<div class="boton-numero" style="font-size:${fsNumero}mm">${esc(c.numeroPrefijo || "")}${esc(c.numero)}</div>`;
  if (abajo) html += `<div class="boton-linea boton-linea-abajo" style="font-size:${fsAbajo}mm">${esc(abajo)}</div>`;
  return html;
}

function _pintarBoton(el, b) {
  if (!el) return;
  el.style.left = `${b.x}mm`;
  el.style.top = `${b.y}mm`;
  el.style.width = `${b.w}mm`;
  el.style.height = `${b.h}mm`;
  el.style.background = b.fondo;
  el.style.color = b.color;
  el.style.borderRadius = b.forma === "capsula" ? "999mm" : formaRadioCss(b);
  el.dataset.orientacion = b.contenido.tipo === "texto" ? _orientacionTexto(b.contenido.orientacionTexto) : "horizontal";
  el.style.padding = `${b.paddingVMm ?? 3}mm ${b.paddingHMm ?? 3}mm`;
  el.classList.toggle("seleccionado", _estaResaltado(b));
  const contorno = _contornoEspecial(b);
  el.dataset.contorno = contorno ? "especial" : "";
  const guia = contorno ? `<svg class="contorno-boton" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="${contorno}" vector-effect="non-scaling-stroke"></path></svg>` : "";
  if (contorno) el.style.setProperty("--fondo-contorno", b.fondo);
  el.innerHTML = guia + _contenidoHTML(b);
  _ajustarTextoAncho(el);
}

// Si el texto no entra en el ancho del botón (sin saltos de línea), achica
// la tipografía hasta que quepa en una sola línea.
function _ajustarTextoAncho(el) {
  el.querySelectorAll(".boton-linea, .boton-numero").forEach((linea) => {
    let intentos = 0;
    const desborda = () => el.dataset.orientacion === "horizontal"
      ? linea.scrollWidth > linea.clientWidth + 0.5
      : linea.scrollHeight > linea.clientHeight + 0.5;
    while (desborda() && intentos < 40) {
      const actual = parseFloat(linea.style.fontSize) || 3;
      const nuevo = actual * 0.92;
      if (nuevo < 1.5) break; // no bajar de ~1.5mm, quedaría ilegible
      linea.style.fontSize = `${nuevo.toFixed(2)}mm`;
      intentos++;
    }
  });
}

function _pintarSeleccionEnCanvas() {
  document.querySelectorAll(".boton-print").forEach((el) => {
    const b = _hojaActual().botones.find((x) => x.id === el.dataset.id);
    el.classList.toggle("seleccionado", b ? _estaResaltado(b) : false);
  });
}

function _enlazarBotones() {
  document.querySelectorAll(".boton-print").forEach((el) => {
    el.onpointerdown = (e) => _iniciarDrag(e, el);
    el.onclick = (e) => {
      if (el.dataset.arrastrado === "1") { el.dataset.arrastrado = "0"; return; }
      const id = el.dataset.id;
      if (e.ctrlKey || e.metaKey || e.shiftKey) {
        if (_seleccion.has(id)) _seleccion.delete(id);
        else _seleccion.add(id);
      } else {
        _seleccion = new Set([id]);
      }
      _pintarSeleccionEnCanvas();
      _renderPanel();
    };
  });
}

function _iniciarDrag(e, el) {
  e.preventDefault();
  const id = el.dataset.id;
  const h = _hojaActual();
  const b = h.botones.find((x) => x.id === id);
  if (!b) return;
  const startX = e.clientX, startY = e.clientY;
  const moverGrupo = b.grupoId && !(e.ctrlKey || e.metaKey || e.shiftKey);
  const miembros = (moverGrupo ? h.botones.filter((otro) => otro.grupoId === b.grupoId) : [b])
    .map((boton) => ({ boton, x: boton.x, y: boton.y, nodo: document.querySelector(`.boton-print[data-id="${boton.id}"]`) }));
  const izq = Math.min(...miembros.map((m) => m.x));
  const arriba = Math.min(...miembros.map((m) => m.y));
  const der = Math.max(...miembros.map((m) => m.x + m.boton.w));
  const abajo = Math.max(...miembros.map((m) => m.y + m.boton.h));
  el.dataset.arrastrado = "0";
  el.setPointerCapture(e.pointerId);
  const factor = PX_POR_MM * _zoom;
  function mover(ev) {
    const dx = (ev.clientX - startX) / factor;
    const dy = (ev.clientY - startY) / factor;
    if (Math.abs(ev.clientX - startX) > 3 || Math.abs(ev.clientY - startY) > 3) el.dataset.arrastrado = "1";
    if (el.dataset.arrastrado !== "1") return;
    const moverX = clamp(dx, Math.min(0, -izq), Math.max(0, HOJA_ANCHO_MM - der));
    const moverY = clamp(dy, Math.min(0, -arriba), Math.max(0, HOJA_ALTO_MM - abajo));
    miembros.forEach(({ boton, x, y, nodo }) => {
      boton.x = x + moverX;
      boton.y = y + moverY;
      nodo.style.left = `${boton.x}mm`;
      nodo.style.top = `${boton.y}mm`;
    });
    _renderMarcasCorte();
  }
  function soltar() {
    el.removeEventListener("pointermove", mover);
    el.removeEventListener("pointerup", soltar);
    el.removeEventListener("pointercancel", soltar);
    Store.guardar();
  }
  el.addEventListener("pointermove", mover);
  el.addEventListener("pointerup", soltar);
  el.addEventListener("pointercancel", soltar);
}

function _renderMarcasCorte() {
  const hojaEl = document.getElementById("hoja");
  const h = _hojaActual();
  hojaEl.querySelectorAll(".marca-corte, .marca-borde").forEach((m) => m.remove());
  hojaEl.insertAdjacentHTML("afterbegin", _marcasHtml(h.botones));
  _actualizarEstadoImpresion();
}

// Elimina botones sin pedir confirmación (para atajos como Supr) pero permite
// deshacer: se guarda una copia y un toast ofrece restaurarla.
function _eliminarConDeshacer(botones, hojaId) {
  if (!botones.length) return;
  hojaId = hojaId || _hojaActual().id;
  const copias = botones.map((b) => JSON.parse(JSON.stringify(b)));
  botones.forEach((b) => { S = Store.eliminarBoton(hojaId, b.id); });
  toastAccion(
    copias.length === 1 ? "Botón eliminado." : `${copias.length} botones eliminados.`,
    "Deshacer",
    () => {
      copias.forEach((boton) => { S = Store.agregarBoton(hojaId, boton); });
      _seleccion = new Set(copias.map((b) => b.id));
      _renderHoja();
      _renderPanel();
    }
  );
}

// Atajo de teclado: Supr/Backspace borra lo que está resaltado en el lienzo
// (el botón clickeado, o el grupo completo si lo que está resaltado es un
// grupo), sin confirmar, pero con deshacer disponible en el toast.
function _manejarBorradoTeclado() {
  if (!_seleccion.size) return;
  const resaltados = _hojaActual().botones.filter(_estaResaltado);
  if (!resaltados.length) return;
  _eliminarConDeshacer(resaltados);
  _seleccion = new Set();
  _renderHoja();
  _renderPanel();
}

// ---------- Panel lateral (agregar / editar botón / editar grupo) ----------

function _duplicarSeleccion() {
  const boton = _botonSeleccionado();
  if (boton?.grupoId) return _duplicarGrupo(boton.grupoId);
  const botones = _hojaActual().botones.filter((b) => _seleccion.has(b.id));
  _duplicarBloque(botones, boton ? "Botón duplicado" : "Selección duplicada", false);
}

function _renderPanel() {
  const seleccionado = _botonSeleccionado();
  const duplicar = document.getElementById("btn-duplicar-seleccion");
  duplicar.disabled = !_seleccion.size;
  duplicar.textContent = seleccionado ? (seleccionado.grupoId ? "Duplicar grupo" : "Duplicar botón") : "Duplicar selección";
  const panel = document.getElementById("panel");
  if (_seleccion.size > 1) {
    panel.innerHTML = _formSeleccionMultiple();
    _enlazarFormSeleccionMultiple();
    return;
  }
  const b = seleccionado;
  if (b && b.grupoId) {
    panel.innerHTML = _formEditarGrupo(b.grupoId);
    _enlazarFormEditarGrupo(b.grupoId);
  } else if (b) {
    panel.innerHTML = _formEditar(b);
    _enlazarFormEditar(b);
  } else {
    panel.innerHTML = _formAgregar();
    _enlazarFormAgregar();
  }
}

// ---------- Selección múltiple (varios botones, incluso de grupos distintos) ----------

function _formSeleccionMultiple() {
  const ids = [..._seleccion];
  const primero = _hojaActual().botones.find((b) => b.id === ids[0]);
  return `
    <div class="panel-header">
      <h3>Selección múltiple (${ids.length} botones)</h3>
      <button class="btn sm sec" id="ms-cerrar">✕ Cerrar</button>
    </div>
    <div class="panel-form">
      <p class="muted" style="font-size:12px;margin:0">Se aplica a los ${ids.length} botones seleccionados, aunque sean de grupos distintos.</p>
      ${_bloqueFormaTamano("ms", primero)}
      ${_bloqueColores("ms", primero)}
      <button class="btn sec" id="ms-eliminar">Eliminar seleccionados</button>
    </div>`;
}

function _enlazarFormSeleccionMultiple() {
  const ids = [..._seleccion];
  const hojaId = _hojaActual().id;
  const seleccionados = () => _hojaActual().botones.filter((b) => ids.includes(b.id));
  const refrescarTodos = () => {
    seleccionados().forEach((b) => _pintarBoton(document.querySelector(`.boton-print[data-id="${b.id}"]`), b));
    _renderMarcasCorte();
  };
  const persistir = () => Store.guardar();

  document.getElementById("ms-cerrar").onclick = () => {
    _seleccion = new Set();
    _pintarSeleccionEnCanvas();
    _renderPanel();
  };

  document.getElementById("ms-w").oninput = (e) => { const v = Number(e.target.value); if (v) seleccionados().forEach((b) => (b.w = v)); refrescarTodos(); };
  document.getElementById("ms-w").onchange = persistir;
  document.getElementById("ms-h").oninput = (e) => { const v = Number(e.target.value); if (v) seleccionados().forEach((b) => (b.h = v)); refrescarTodos(); };
  document.getElementById("ms-h").onchange = persistir;
  document.getElementById("ms-paddingh").oninput = (e) => { const v = Number(e.target.value) || 0; seleccionados().forEach((b) => (b.paddingHMm = v)); refrescarTodos(); };
  document.getElementById("ms-paddingh").onchange = persistir;
  document.getElementById("ms-paddingv").oninput = (e) => { const v = Number(e.target.value) || 0; seleccionados().forEach((b) => (b.paddingVMm = v)); refrescarTodos(); };
  document.getElementById("ms-paddingv").onchange = persistir;

  document.getElementById("ms-forma").onchange = (e) => {
    seleccionados().forEach((b) => (b.forma = e.target.value));
    document.getElementById("ms-radio-wrap").style.display = e.target.value === "redondeado" ? "" : "none";
    refrescarTodos();
    persistir();
  };
  const radio = document.getElementById("c-radio");
  if (radio) {
    radio.oninput = (e) => { const v = Number(e.target.value) || 0; seleccionados().forEach((b) => (b.radioMm = v)); refrescarTodos(); };
    radio.onchange = persistir;
  }

  document.getElementById("ms-fondo").oninput = (e) => { seleccionados().forEach((b) => (b.fondo = e.target.value)); refrescarTodos(); };
  document.getElementById("ms-fondo").onchange = persistir;
  document.getElementById("ms-color").oninput = (e) => { seleccionados().forEach((b) => (b.color = e.target.value)); refrescarTodos(); };
  document.getElementById("ms-color").onchange = persistir;

  _enlazarPlantillas("ms");
  _enlazarContorno("ms", (puntos) => { seleccionados().forEach((b) => { b.puntosContorno = puntos; }); refrescarTodos(); persistir(); });

  document.getElementById("ms-eliminar").onclick = () => {
    if (!confirm(`¿Eliminar los ${seleccionados().length} botones seleccionados?`)) return;
    _eliminarConDeshacer(seleccionados(), hojaId);
    _seleccion = new Set();
    _renderHoja();
    _renderPanel();
  };
}

function _miembrosGrupo(grupoId) {
  return _hojaActual()
    .botones.filter((b) => b.grupoId === grupoId)
    .sort((a, b) => (a.contenido.numero ?? 0) - (b.contenido.numero ?? 0));
}

const FORMAS = [
  ["cuadrado", "Rectángulo o cuadrado"],
  ["redondeado", "Bordes redondeados"],
  ["circulo", "Círculo"],
  ["ovalo", "Óvalo"],
  ["capsula", "Cápsula (extremos semicirculares)"],
  ["triangulo", "Triángulo redondeado"],
  ["personalizado", "Contorno por puntos"],
];

function _selectForma(id, valor) {
  return `<select id="${id}">${FORMAS.map(([v, l]) => `<option value="${v}" ${v === valor ? "selected" : ""}>${l}</option>`).join("")}</select>`;
}

function _campoRadio(valor) {
  return `<label class="campo campo-radio">Radio esquinas (mm)
    <input type="number" id="c-radio" min="0" step="0.5" value="${valor ?? 3}"></label>`;
}

// d = valores por defecto a precargar: { w, h, forma, radioMm }
function _puntoEnContorno(svg, evento) {
  const rect = svg.getBoundingClientRect();
  const porcentaje = (valor, inicio, largo) => Math.round(clamp((valor - inicio) / largo * 100, 0, 100) * 10) / 10;
  return [porcentaje(evento.clientX, rect.left, rect.width), porcentaje(evento.clientY, rect.top, rect.height)];
}

function _bordeMasCercano(puntos, punto) {
  let menor = Infinity, borde = 0;
  puntos.forEach(([x, y], i) => {
    const [sigX, sigY] = puntos[(i + 1) % puntos.length];
    const dx = sigX - x, dy = sigY - y;
    const avance = clamp(((punto[0] - x) * dx + (punto[1] - y) * dy) / (dx * dx + dy * dy), 0, 1);
    const distancia = Math.hypot(punto[0] - x - avance * dx, punto[1] - y - avance * dy);
    if (distancia < menor) { menor = distancia; borde = i; }
  });
  return borde;
}

function _enlazarContorno(prefijo, aplicar) {
  const forma = document.getElementById(`${prefijo}-forma`);
  const contorno = document.getElementById(`${prefijo}-contorno`);
  const wrap = document.getElementById(`${prefijo}-contorno-wrap`);
  const ancho = document.getElementById(`${prefijo}-w`);
  const alto = document.getElementById(`${prefijo}-h`);
  const validar = () => {
    wrap.hidden = forma.value !== "personalizado";
    contorno.setCustomValidity(!wrap.hidden && !_puntosContorno(contorno.value) ? "Ingresa al menos tres puntos válidos que formen un área." : "");
  };
  const actualizarDiametro = (sincronizar) => {
    const circulo = forma.value === "circulo";
    ancho.labels[0].firstChild.textContent = circulo ? "Diámetro (mm)" : "Ancho (mm)";
    alto.labels[0].hidden = circulo;
    if (sincronizar && circulo && Number(ancho.value) >= 5 && alto.value !== ancho.value) {
      alto.value = ancho.value;
      alto.dispatchEvent(new Event("input"));
      alto.dispatchEvent(new Event("change"));
    }
  };
  forma.addEventListener("change", () => { validar(); actualizarDiametro(true); });
  ancho.addEventListener("change", () => actualizarDiametro(true));
  actualizarDiametro(false);
  const dibujo = wrap.querySelector("svg");
  const poligono = dibujo.querySelector("polygon");
  const nodos = dibujo.querySelector("g");
  const estado = wrap.querySelector("output");
  let seleccionado = null;
  let arrastre = null;
  const dibujar = () => {
    const puntos = arrastre?.puntos ?? _puntosContorno(contorno.value);
    const w = Number(ancho.value), h = Number(alto.value);
    dibujo.style.aspectRatio = `${w > 0 ? w : 1} / ${h > 0 ? h : 1}`;
    poligono.setAttribute("points", puntos?.map((p) => p.join(",")).join(" ") || "");
    nodos.innerHTML = puntos?.map(([x,y], i) => `<circle data-vertice="${i}" cx="${x}" cy="${y}" r="2.2" class="${i === seleccionado ? "activo" : ""}"></circle>`).join("") || "";
    wrap.querySelector("[data-quitar-vertice]").disabled = seleccionado === null || !puntos || puntos.length < 4;
    estado.textContent = puntos ? `${puntos.length} puntos. ${seleccionado === null ? "" : `Punto ${seleccionado + 1} seleccionado.`}` : "El contorno debe cerrar sin cruces.";
  };
  const confirmar = (puntos) => {
    const texto = puntos.map((p) => p.join(",")).join("\n");
    if (!_puntosContorno(texto)) {
      estado.textContent = "No se aplicó el cambio. El contorno debe cerrar sin cruces.";
      return false;
    }
    contorno.value = texto;
    validar();
    aplicar(texto);
    return true;
  };
  dibujo.onpointerdown = (evento) => {
    if (evento.button !== 0) return;
    const puntos = _puntosContorno(contorno.value);
    if (!puntos) return;
    const vertice = evento.target.dataset.vertice;
    if (vertice != null) {
      seleccionado = Number(vertice);
      arrastre = { id: evento.pointerId, puntos, movido: false };
      dibujo.setPointerCapture(evento.pointerId);
      dibujar();
      return;
    }
    if (puntos.length >= 64) return;
    const punto = _puntoEnContorno(dibujo, evento);
    const indice = _bordeMasCercano(puntos, punto) + 1;
    puntos.splice(indice, 0, punto);
    if (confirmar(puntos)) { seleccionado = indice; dibujar(); }
  };
  dibujo.onpointermove = (evento) => {
    if (!arrastre || evento.pointerId !== arrastre.id) return;
    arrastre.movido = true;
    arrastre.puntos[seleccionado] = _puntoEnContorno(dibujo, evento);
    dibujar();
  };
  dibujo.onpointerup = (evento) => {
    if (!arrastre || evento.pointerId !== arrastre.id) return;
    const { puntos, movido } = arrastre;
    arrastre = null;
    dibujar();
    if (movido && confirmar(puntos)) dibujar();
  };
  dibujo.onpointercancel = () => { arrastre = null; dibujar(); };
  wrap.querySelector("[data-quitar-vertice]").onclick = () => {
    const puntos = _puntosContorno(contorno.value);
    if (!puntos || puntos.length < 4 || seleccionado === null) return;
    puntos.splice(seleccionado, 1);
    if (confirmar(puntos)) { seleccionado = null; dibujar(); }
  };
  wrap.querySelector("[data-ajustar-contorno]").onclick = () => {
    const puntos = _puntosContorno(contorno.value);
    if (!puntos) return;
    const min = [0,1].map((i) => Math.min(...puntos.map((p) => p[i])));
    const max = [0,1].map((i) => Math.max(...puntos.map((p) => p[i])));
    if (confirmar(puntos.map((p) => p.map((v,i) => Math.round((v - min[i]) / (max[i] - min[i]) * 1000) / 10)))) dibujar();
  };
  [forma, ancho, alto].forEach((campo) => campo.addEventListener("change", dibujar));
  contorno.oninput = () => { seleccionado = null; validar(); dibujar(); };
  contorno.onchange = () => {
    if (!contorno.reportValidity()) return;
    aplicar(contorno.value);
    dibujar();
  };
  validar();
  dibujar();
}

function _bloqueFormaTamano(pfx, d) {
  d = d || {};
  return `
    <div class="fila-2">
      <label class="campo">Ancho (mm)<input id="${pfx}-w" type="number" min="5" step="0.5" value="${d.w ?? 40}"></label>
      <label class="campo">Alto (mm)<input id="${pfx}-h" type="number" min="5" step="0.5" value="${d.h ?? 40}"></label>
    </div>
    <label class="campo">Forma ${_selectForma(pfx + "-forma", d.forma ?? "cuadrado")}</label>
    <section class="editor-contorno" id="${pfx}-contorno-wrap" ${d.forma === "personalizado" ? "" : "hidden"}>
      <small>Haz clic para agregar un punto. Arrastra los puntos para ajustar el contorno.</small>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon></polygon><g></g></svg>
      <div class="barra-hoja">
        <button type="button" class="btn sm" data-quitar-vertice>Quitar punto</button>
        <button type="button" class="btn sm" data-ajustar-contorno>Ajustar al ancho y alto</button>
      </div>
      <output aria-live="polite"></output>
      <details>
        <summary>Editar coordenadas</summary>
        <label class="campo">Puntos del contorno (%)
          <textarea id="${pfx}-contorno" rows="4" aria-describedby="${pfx}-contorno-ayuda">${esc(d.puntosContorno ?? PUNTOS_INICIALES)}</textarea>
          <small id="${pfx}-contorno-ayuda">Escribe un punto X,Y por línea, en el orden del borde. Los valores van de 0 a 100.</small>
        </label>
      </details>
    </section>
    <div class="fila-2">
      <label class="campo">Margen interior lateral (mm)<input id="${pfx}-paddingh" type="number" min="0" step="0.5" value="${d.paddingHMm ?? 3}"></label>
      <label class="campo">Margen interior vertical (mm)<input id="${pfx}-paddingv" type="number" min="0" step="0.5" value="${d.paddingVMm ?? 3}"></label>
    </div>
    <div id="${pfx}-radio-wrap" style="display:${(d.forma ?? "cuadrado") === "redondeado" ? "" : "none"}">${_campoRadio(d.radioMm)}</div>
    <div class="fila-plantilla">
      <select id="${pfx}-plantilla"></select>
      <button type="button" class="btn sm" id="${pfx}-plantilla-guardar">Guardar plantilla</button>
    </div>
  `;
}

// d = valores por defecto: { fondo, color }
function _bloqueColores(pfx, d) {
  d = d || {};
  return `
    <div class="fila-2">
      <label class="campo">Fondo<input id="${pfx}-fondo" type="color" value="${d.fondo ?? "#ffffff"}"></label>
      <label class="campo">Texto<input id="${pfx}-color" type="color" value="${d.color ?? "#000000"}"></label>
    </div>`;
}

function _enlazarRadioToggle(pfx) {
  const formaSel = document.getElementById(`${pfx}-forma`);
  const wrap = document.getElementById(`${pfx}-radio-wrap`);
  const actualizar = () => (wrap.style.display = formaSel.value === "redondeado" ? "" : "none");
  formaSel.onchange = actualizar;
  actualizar();
}

// Plantillas de tamaño con nombre (ej: "MK6", "BB1"): mismo formato de botón
// reutilizable entre distintas máquinas/juegos, sin tener que reescribir mm.
function _enlazarPlantillas(pfx) {
  const sel = document.getElementById(`${pfx}-plantilla`);
  const btnGuardar = document.getElementById(`${pfx}-plantilla-guardar`);
  if (!sel) return;

  const pintarOpciones = () => {
    sel.innerHTML =
      `<option value="">Plantilla de tamaño…</option>` +
      S.plantillas.map((p) => `<option value="${p.id}">${esc(p.nombre)}</option>`).join("");
  };
  pintarOpciones();

  sel.onchange = () => {
    const p = S.plantillas.find((x) => x.id === sel.value);
    if (!p) return;
    const campoW = document.getElementById(`${pfx}-w`);
    const campoH = document.getElementById(`${pfx}-h`);
    const campoForma = document.getElementById(`${pfx}-forma`);
    const campoRadio = document.getElementById("c-radio");
    const campoPaddingH = document.getElementById(`${pfx}-paddingh`);
    const campoPaddingV = document.getElementById(`${pfx}-paddingv`);
    campoW.value = p.w;
    campoH.value = p.h;
    campoForma.value = p.forma;
    const campoContorno = document.getElementById(`${pfx}-contorno`);
    campoContorno.value = p.puntosContorno ?? PUNTOS_INICIALES;
    if (campoRadio) campoRadio.value = p.radioMm || 0;
    if (campoPaddingH) campoPaddingH.value = p.paddingHMm ?? 3;
    if (campoPaddingV) campoPaddingV.value = p.paddingVMm ?? 3;
    // Dispara los eventos para que los listeners ya enganchados (vivos o no) reaccionen.
    [campoW, campoH].forEach((c) => { c.dispatchEvent(new Event("input")); c.dispatchEvent(new Event("change")); });
    campoForma.dispatchEvent(new Event("change"));
    if (p.forma === "personalizado") campoContorno.dispatchEvent(new Event("change"));
    if (campoRadio) { campoRadio.dispatchEvent(new Event("input")); campoRadio.dispatchEvent(new Event("change")); }
    [campoPaddingH, campoPaddingV].forEach((c) => { if (c) { c.dispatchEvent(new Event("input")); c.dispatchEvent(new Event("change")); } });
    sel.value = "";
  };

  if (btnGuardar) {
    btnGuardar.onclick = () => {
      const nombre = prompt('Nombre para esta plantilla de tamaño (ej: "MK6", "BB1"):');
      if (!nombre) return;
      const datos = {
        w: Number(document.getElementById(`${pfx}-w`).value),
        h: Number(document.getElementById(`${pfx}-h`).value),
        forma: document.getElementById(`${pfx}-forma`).value,
        puntosContorno: document.getElementById(`${pfx}-contorno`).value,
        radioMm: Number(document.getElementById("c-radio")?.value) || 0,
        paddingHMm: Number(document.getElementById(`${pfx}-paddingh`)?.value) || 0,
        paddingVMm: Number(document.getElementById(`${pfx}-paddingv`)?.value) || 0,
      };
      S = Store.guardarPlantilla(nombre, datos);
      pintarOpciones();
      toast(`Plantilla "${nombre}" guardada.`);
    };
  }
}

function _crearYSeleccionar(boton) {
  if (boton.forma === "circulo") boton.h = boton.w;
  const pos = empacarPosicion(_hojaActual().botones, boton.w, boton.h);
  boton.x = pos.x;
  boton.y = pos.y;
  S = Store.agregarBoton(_hojaActual().id, boton);
  _seleccion = new Set([boton.id]);
  _renderHoja();
  _renderPanel();
}

function _formAgregar() {
  const u = S.config.ultimoUsado;
  return `
    <h3>Agregar botón</h3>
    <div class="acciones-agregar">
      <button class="btn" id="btn-nuevo-texto">+ Botón de texto</button>
      <button class="btn" id="btn-nuevo-logo">+ Botón con imagen</button>
      <input type="file" id="input-nuevo-logo" accept="image/*" style="display:none">
    </div>
    <div id="logos-existentes-agregar"></div>

    <hr class="separador">
    <h4>Generar una serie</h4>
    <form id="f-lista" class="panel-form">
      <label class="campo">Códigos o textos centrales<textarea id="l-lista" rows="3" placeholder="01&#10;A-02&#10;BONUS&#10;×5"></textarea></label>
      <label class="campo">Separador<select id="l-separador"><option value="lineas">Un código por línea</option><option value="comas">Comas</option></select></label>
      <div class="muted conteo" id="l-conteo">0 botones</div>
      <label class="campo">Texto arriba<input id="l-arriba" placeholder="JUEGUE" value="${esc(u.arriba)}"></label>
      <div class="fila-2">
        <label class="campo">Prefijo (opcional)<input id="l-numero-prefijo" value="${esc(u.numeroPrefijo || "")}"></label>
      </div>
      <label class="campo">Texto abajo<input id="l-abajo" placeholder="LÍNEA" value="${esc(u.abajo)}"></label>
      ${_controlesTexto("l", u, true)}
      ${_bloqueFormaTamano("l", u)}
      ${_bloqueColores("l", u)}
      <button class="btn" type="submit">+ Generar botones</button>
    </form>
  `;
}

function _enlazarFormAgregar() {
  const u = S.config.ultimoUsado;

  document.getElementById("btn-nuevo-texto").onclick = () => {
    _crearYSeleccionar({
      id: uid(), forma: u.forma, radioMm: u.radioMm, paddingHMm: u.paddingHMm, paddingVMm: u.paddingVMm, w: u.w, h: u.h, fondo: u.fondo, color: u.color, puntosContorno: u.puntosContorno,
      contenido: { tipo: "texto", arriba: u.arriba, numero: null, numeroPrefijo: u.numeroPrefijo, abajo: u.abajo, textoLiteral: u.textoLiteral ?? true, escalasTexto: u.escalasTexto, orientacionTexto: u.orientacionTexto },
    });
  };

  document.getElementById("btn-nuevo-logo").onclick = () => document.getElementById("input-nuevo-logo").click();
  document.getElementById("input-nuevo-logo").onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const logoId = Store.agregarLogo(reader.result);
      _crearYSeleccionar({
        id: uid(), forma: u.forma, radioMm: u.radioMm, paddingHMm: u.paddingHMm, paddingVMm: u.paddingVMm, w: u.w, h: u.h, fondo: u.fondo, color: "#000000",
        contenido: { tipo: "logo", logoId, zoom: 1, offsetX: 0, offsetY: 0 },
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  _renderLogosExistentesAgregar();
  _enlazarRadioToggle("l");
  _enlazarContorno("l", () => {});
  _enlazarPlantillas("l");

  const listaInput = document.getElementById("l-lista");
  const conteo = document.getElementById("l-conteo");
  const textoConteo = (n) => (n === 1 ? "1 botón" : `${n} botones`);
  const separador = document.getElementById("l-separador");
  const leerCodigos = () => _codigosBoton(listaInput.value, separador.value === "comas");
  const actualizarConteo = () => (conteo.textContent = textoConteo(leerCodigos().length));
  listaInput.oninput = actualizarConteo;
  separador.onchange = actualizarConteo;
  actualizarConteo();

  document.getElementById("f-lista").onsubmit = (e) => {
    e.preventDefault();
    const numeros = leerCodigos();
    if (!numeros.length) return toast("Ingresa al menos un código o texto central.");
    const w = Number(document.getElementById("l-w").value);
    const forma = document.getElementById("l-forma").value;
    const h = forma === "circulo" ? w : Number(document.getElementById("l-h").value);
    const puntosContorno = document.getElementById("l-contorno").value;
    const radioMm = Number(document.getElementById("c-radio")?.value) || 3;
    const paddingHMm = Number(document.getElementById("l-paddingh")?.value) || 0;
    const paddingVMm = Number(document.getElementById("l-paddingv")?.value) || 0;
    const fondo = document.getElementById("l-fondo").value;
    const color = document.getElementById("l-color").value;
    const arriba = document.getElementById("l-arriba").value;
    const abajo = document.getElementById("l-abajo").value;
    const numeroPrefijo = document.getElementById("l-numero-prefijo").value;
    const opcionesTexto = _leerControlesTexto("l");
    const grupoId = uid();
    let primero = null;
    numeros.forEach((n) => {
      const boton = {
        id: uid(), forma, radioMm, paddingHMm, paddingVMm, w, h, fondo, color, grupoId, puntosContorno,
        contenido: { tipo: "texto", arriba, numero: n, numeroPrefijo, abajo, ...opcionesTexto },
      };
      const pos = empacarPosicion(_hojaActual().botones, w, h);
      boton.x = pos.x;
      boton.y = pos.y;
      S = Store.agregarBoton(_hojaActual().id, boton);
      if (!primero) primero = boton.id;
    });
    S = Store.actualizarUltimoUsado({ arriba, abajo, numeroPrefijo, ...opcionesTexto, forma, puntosContorno, w, h, radioMm, paddingHMm, paddingVMm, fondo, color });
    _seleccion = new Set([primero]);
    _renderHoja();
    _renderPanel();
    toast(`${textoConteo(numeros.length)} generados.`);
  };
}

function _renderLogosExistentesAgregar() {
  const cont = document.getElementById("logos-existentes-agregar");
  const ids = Object.keys(S.logos);
  if (!ids.length) { cont.innerHTML = ""; return; }
  const u = S.config.ultimoUsado;
  cont.innerHTML = `<div class="muted" style="margin:6px 0 4px;font-size:12px">o reusar una imagen ya subida:</div>
    <div class="logos-grid">${ids.map((id) => `<img src="${S.logos[id]}" data-logo-id="${id}" class="logo-thumb">`).join("")}</div>`;
  cont.querySelectorAll(".logo-thumb").forEach((img) => {
    img.onclick = () => {
      _crearYSeleccionar({
        id: uid(), forma: u.forma, radioMm: u.radioMm, paddingHMm: u.paddingHMm, paddingVMm: u.paddingVMm, w: u.w, h: u.h, fondo: u.fondo, color: "#000000",
        contenido: { tipo: "logo", logoId: img.dataset.logoId, zoom: 1, offsetX: 0, offsetY: 0 },
      });
    };
  });
}

// ---------- Editar un botón individual (sin grupo) ----------

function _formEditar(b) {
  const c = b.contenido;
  const esLogo = c.tipo === "logo";
  return `
    <div class="panel-header">
      <h3>Editar botón</h3>
      <button class="btn sm sec" id="e-cerrar">✕ Cerrar</button>
    </div>
    <div class="panel-form">
      ${esLogo ? _bloqueEdicionLogo(c) : _bloqueEdicionTexto(c)}
      ${_bloqueFormaTamano("e", b)}
      ${_bloqueColores("e", b)}
      <div class="fila-2">
        <button class="btn" id="e-duplicar">Duplicar botón</button>
        <button class="btn sec" id="e-eliminar">Eliminar botón</button>
      </div>
    </div>`;
}

function _bloqueEdicionTexto(c) {
  return `
    <label class="campo">Texto arriba<input id="e-arriba" value="${esc(c.arriba || "")}"></label>
    <div class="fila-2">
      <label class="campo">Prefijo (opcional)<input id="e-numero-prefijo" value="${esc(c.numeroPrefijo || "")}"></label>
      <label class="campo">Texto central (opcional)<input id="e-numero" value="${esc(c.numero ?? "")}"></label>
    </div>
    <label class="campo">Texto abajo<input id="e-abajo" value="${esc(c.abajo || "")}"></label>
    ${_controlesTexto("e", c)}
    ${_editorComposicion("e", c)}
  `;
}

function _bloqueEdicionLogo(c) {
  const zoom = c.zoom ?? 1, offX = c.offsetX ?? 0, offY = c.offsetY ?? 0;
  return `
    <label class="campo">Zoom <span id="e-zoom-val" class="valor-slider">${zoom.toFixed(2)}x</span><input id="e-zoom" type="range" min="0.3" max="4" step="0.05" value="${zoom}"></label>
    <label class="campo">Desplazar horizontal <span id="e-offx-val" class="valor-slider">${offX}%</span><input id="e-offx" type="range" min="-50" max="50" step="1" value="${offX}"></label>
    <label class="campo">Desplazar vertical <span id="e-offy-val" class="valor-slider">${offY}%</span><input id="e-offy" type="range" min="-50" max="50" step="1" value="${offY}"></label>
    <button type="button" class="btn sm" id="e-centrar">Centrar (zoom 1x, sin desplazar)</button>
    <label class="campo">Cambiar imagen<input id="e-file" type="file" accept="image/*"></label>
  `;
}

function _enlazarFormEditar(b) {
  const hojaId = _hojaActual().id;
  const el = () => document.querySelector(`.boton-print[data-id="${b.id}"]`);

  document.getElementById("e-cerrar").onclick = () => {
    _seleccion = new Set();
    document.querySelectorAll(".boton-print").forEach((x) => x.classList.remove("seleccionado"));
    _renderPanel();
  };

  document.getElementById("e-duplicar").onclick = _duplicarSeleccion;
  document.getElementById("e-eliminar").onclick = () => {
    if (!confirm("¿Eliminar este botón?")) return;
    S = Store.eliminarBoton(hojaId, b.id);
    _seleccion = new Set();
    _renderHoja();
    _renderPanel();
  };

  const refrescar = () => { _pintarBoton(el(), b); _renderMarcasCorte(); };
  const persistir = () => {
    Store.guardar();
    Store.actualizarUltimoUsado({
      forma: b.forma, radioMm: b.radioMm, paddingHMm: b.paddingHMm, paddingVMm: b.paddingVMm, w: b.w, h: b.h, fondo: b.fondo,
      color: b.contenido.tipo === "texto" ? b.color : undefined,
      arriba: b.contenido.tipo === "texto" ? b.contenido.arriba : undefined,
      abajo: b.contenido.tipo === "texto" ? b.contenido.abajo : undefined,
      numeroPrefijo: b.contenido.tipo === "texto" ? b.contenido.numeroPrefijo : undefined,
      orientacionTexto: b.contenido.orientacionTexto,
      textoLiteral: b.contenido.textoLiteral,
      escalasTexto: b.contenido.escalasTexto,
    });
  };

  document.getElementById("e-w").oninput = (e) => { b.w = Number(e.target.value) || b.w; refrescar(); };
  document.getElementById("e-w").onchange = persistir;
  document.getElementById("e-h").oninput = (e) => { b.h = Number(e.target.value) || b.h; refrescar(); };
  document.getElementById("e-h").onchange = persistir;
  document.getElementById("e-paddingh").oninput = (e) => { b.paddingHMm = Number(e.target.value) || 0; refrescar(); };
  document.getElementById("e-paddingh").onchange = persistir;
  document.getElementById("e-paddingv").oninput = (e) => { b.paddingVMm = Number(e.target.value) || 0; refrescar(); };
  document.getElementById("e-paddingv").onchange = persistir;

  document.getElementById("e-forma").onchange = (e) => {
    b.forma = e.target.value;
    document.getElementById("e-radio-wrap").style.display = b.forma === "redondeado" ? "" : "none";
    refrescar();
    persistir();
  };
  const radio = document.getElementById("c-radio");
  if (radio) {
    radio.oninput = (e) => { b.radioMm = Number(e.target.value) || 0; refrescar(); };
    radio.onchange = persistir;
  }

  document.getElementById("e-fondo").oninput = (e) => { b.fondo = e.target.value; refrescar(); };
  document.getElementById("e-fondo").onchange = persistir;
  document.getElementById("e-color").oninput = (e) => { b.color = e.target.value; refrescar(); };
  document.getElementById("e-color").onchange = persistir;

  _enlazarPlantillas("e");
  _enlazarContorno("e", (puntos) => { b.puntosContorno = puntos; refrescar(); persistir(); });

  if (b.contenido.tipo === "logo") {
    document.getElementById("e-zoom").oninput = (e) => {
      b.contenido.zoom = Number(e.target.value);
      document.getElementById("e-zoom-val").textContent = `${b.contenido.zoom.toFixed(2)}x`;
      refrescar();
    };
    document.getElementById("e-zoom").onchange = persistir;
    document.getElementById("e-offx").oninput = (e) => {
      b.contenido.offsetX = Number(e.target.value);
      document.getElementById("e-offx-val").textContent = `${b.contenido.offsetX}%`;
      refrescar();
    };
    document.getElementById("e-offx").onchange = persistir;
    document.getElementById("e-offy").oninput = (e) => {
      b.contenido.offsetY = Number(e.target.value);
      document.getElementById("e-offy-val").textContent = `${b.contenido.offsetY}%`;
      refrescar();
    };
    document.getElementById("e-offy").onchange = persistir;
    document.getElementById("e-centrar").onclick = () => {
      b.contenido.zoom = 1;
      b.contenido.offsetX = 0;
      b.contenido.offsetY = 0;
      document.getElementById("e-zoom").value = 1;
      document.getElementById("e-offx").value = 0;
      document.getElementById("e-offy").value = 0;
      document.getElementById("e-zoom-val").textContent = "1.00x";
      document.getElementById("e-offx-val").textContent = "0%";
      document.getElementById("e-offy-val").textContent = "0%";
      refrescar();
      persistir();
    };
    document.getElementById("e-file").onchange = (ev) => {
      const file = ev.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        b.contenido.logoId = Store.agregarLogo(reader.result);
        S = Store.eliminarLogosNoUsados();
        refrescar();
      };
      reader.readAsDataURL(file);
    };
  } else {
    document.getElementById("e-arriba").oninput = (e) => { b.contenido.arriba = e.target.value; refrescar(); };
    document.getElementById("e-arriba").onchange = persistir;
    document.getElementById("e-abajo").oninput = (e) => { b.contenido.abajo = e.target.value; refrescar(); };
    document.getElementById("e-abajo").onchange = persistir;
    document.getElementById("e-numero-prefijo").oninput = (e) => { b.contenido.numeroPrefijo = e.target.value; refrescar(); };
    document.getElementById("e-numero-prefijo").onchange = persistir;
    document.getElementById("e-numero").oninput = (e) => {
      b.contenido.numero = e.target.value === "" ? null : e.target.value;
      refrescar();
    };
    document.getElementById("e-numero").onchange = persistir;
    _enlazarControlesTexto("e", () => [b], refrescar, persistir);
    _enlazarComposicion("e", () => [b], refrescar, persistir);
  }
}

// ---------- Editar un grupo (botones generados por lista de números) ----------

function _posicionCopiaGrupo(botones, ancho, alto) {
  const margen = MARGEN_HOJA_MM;
  const limiteX = HOJA_ANCHO_MM - margen;
  const limiteY = HOJA_ALTO_MM - margen;
  const porX = [...botones].sort((a, b) => a.x - b.x);
  const filas = [...new Set([margen, ...botones.map((b) => b.y + b.h)])].sort((a, b) => a - b);
  for (const y of filas) {
    if (y < margen || y + alto > limiteY) continue;
    let x = margen;
    for (const b of porX) {
      if (b.y >= y + alto || b.y + b.h <= y) continue;
      if (x + ancho <= b.x) break;
      x = Math.max(x, b.x + b.w);
    }
    if (x + ancho <= limiteX) return { x, y };
  }
  return null;
}

function _duplicarGrupo(grupoId) {
  const originales = _hojaActual().botones.filter((b) => b.grupoId === grupoId);
  _duplicarBloque(originales, "Grupo duplicado", true);
}

function _duplicarBloque(originales, mensaje, seleccionarGrupo) {
  if (!originales.length) return;
  const hoja = _hojaActual();
  const x = Math.min(...originales.map((b) => b.x));
  const y = Math.min(...originales.map((b) => b.y));
  const ancho = Math.max(...originales.map((b) => b.x + b.w)) - x;
  const alto = Math.max(...originales.map((b) => b.y + b.h)) - y;

  const grupos = new Map();
  const copias = JSON.parse(JSON.stringify(originales));
  const posicion = _posicionCopiaGrupo(hoja.botones, ancho, alto);
  const destino = posicion || { x: MARGEN_HOJA_MM, y: MARGEN_HOJA_MM };
  copias.forEach((b) => {
    b.id = uid();
    if (b.grupoId) {
      if (!grupos.has(b.grupoId)) grupos.set(b.grupoId, uid());
      b.grupoId = grupos.get(b.grupoId);
    }
    b.x = destino.x + (b.x - x);
    b.y = destino.y + (b.y - y);
  });

  if (!posicion) S = Store.crearHoja();
  _hojaActual().botones.push(...copias);
  S = Store.guardar();
  _seleccion = new Set(seleccionarGrupo ? [copias[0].id] : copias.map((b) => b.id));
  _renderSelectorHojas();
  _renderHoja();
  _renderPanel();
  toast(posicion ? `${mensaje}.` : `${mensaje} en una hoja nueva.`);
}

function _formEditarGrupo(grupoId) {
  const miembros = _miembrosGrupo(grupoId);
  const base = miembros[0];
  const n = miembros.length;
  const numeros = miembros.map((m) => m.contenido.numero).join("\n");
  return `
    <div class="panel-header">
      <h3>Grupo de ${n === 1 ? "1 botón" : n + " botones"}</h3>
      <button class="btn sm sec" id="e-cerrar">✕ Cerrar</button>
    </div>
    <div class="panel-form">
      <label class="campo">Códigos o textos centrales (uno por línea)<textarea id="gr-numeros" rows="3">${esc(numeros)}</textarea></label>
      <label class="campo">Texto arriba<input id="gr-arriba" value="${esc(base.contenido.arriba || "")}"></label>
      <div class="fila-2">
        <label class="campo">Prefijo (opcional)<input id="gr-numero-prefijo" value="${esc(base.contenido.numeroPrefijo || "")}"></label>
      </div>
      <label class="campo">Texto abajo<input id="gr-abajo" value="${esc(base.contenido.abajo || "")}"></label>
      ${_controlesTexto("gr", base.contenido)}
      ${_editorComposicion("gr", base.contenido)}
      ${_bloqueFormaTamano("gr", base)}
      ${_bloqueColores("gr", base)}
      <div class="chips">
        ${miembros.map((m) => `<span class="chip">${esc(m.contenido.numeroPrefijo || "")}${esc(m.contenido.numero)}<button type="button" class="chip-x" data-id="${m.id}" title="Quitar del grupo">✕</button></span>`).join("")}
      </div>
      <button class="btn" id="gr-duplicar" type="button">Duplicar grupo</button>
      <button class="btn sec" id="gr-eliminar">Eliminar grupo completo</button>
    </div>`;
}

function _enlazarFormEditarGrupo(grupoId) {
  const hojaId = _hojaActual().id;
  const miembros = () => _miembrosGrupo(grupoId);

  document.getElementById("e-cerrar").onclick = () => {
    _seleccion = new Set();
    document.querySelectorAll(".boton-print").forEach((x) => x.classList.remove("seleccionado"));
    _renderPanel();
  };

  const refrescarTodos = () => {
    miembros().forEach((m) => _pintarBoton(document.querySelector(`.boton-print[data-id="${m.id}"]`), m));
    _sincronizarTextoGrupos(_hojaActual());
    _renderMarcasCorte();
  };
  const persistir = () => {
    Store.guardar();
    const base = miembros()[0];
    if (base) {
      Store.actualizarUltimoUsado({
        forma: base.forma, radioMm: base.radioMm, paddingHMm: base.paddingHMm, paddingVMm: base.paddingVMm, w: base.w, h: base.h, fondo: base.fondo, color: base.color,
        arriba: base.contenido.arriba, abajo: base.contenido.abajo, numeroPrefijo: base.contenido.numeroPrefijo,
        orientacionTexto: base.contenido.orientacionTexto,
        textoLiteral: base.contenido.textoLiteral, escalasTexto: base.contenido.escalasTexto,
      });
    }
  };

  document.getElementById("gr-arriba").oninput = (e) => { miembros().forEach((m) => (m.contenido.arriba = e.target.value)); refrescarTodos(); };
  document.getElementById("gr-arriba").onchange = persistir;
  document.getElementById("gr-abajo").oninput = (e) => { miembros().forEach((m) => (m.contenido.abajo = e.target.value)); refrescarTodos(); };
  document.getElementById("gr-abajo").onchange = persistir;
  document.getElementById("gr-numero-prefijo").oninput = (e) => { miembros().forEach((m) => (m.contenido.numeroPrefijo = e.target.value)); refrescarTodos(); };
  document.getElementById("gr-numero-prefijo").onchange = persistir;
  _enlazarControlesTexto("gr", miembros, refrescarTodos, persistir);
  _enlazarComposicion("gr", miembros, refrescarTodos, persistir);

  document.getElementById("gr-w").oninput = (e) => { const v = Number(e.target.value); if (v) miembros().forEach((m) => (m.w = v)); refrescarTodos(); };
  document.getElementById("gr-w").onchange = persistir;
  document.getElementById("gr-h").oninput = (e) => { const v = Number(e.target.value); if (v) miembros().forEach((m) => (m.h = v)); refrescarTodos(); };
  document.getElementById("gr-h").onchange = persistir;
  document.getElementById("gr-paddingh").oninput = (e) => { const v = Number(e.target.value) || 0; miembros().forEach((m) => (m.paddingHMm = v)); refrescarTodos(); };
  document.getElementById("gr-paddingh").onchange = persistir;
  document.getElementById("gr-paddingv").oninput = (e) => { const v = Number(e.target.value) || 0; miembros().forEach((m) => (m.paddingVMm = v)); refrescarTodos(); };
  document.getElementById("gr-paddingv").onchange = persistir;

  document.getElementById("gr-forma").onchange = (e) => {
    miembros().forEach((m) => (m.forma = e.target.value));
    document.getElementById("gr-radio-wrap").style.display = e.target.value === "redondeado" ? "" : "none";
    refrescarTodos();
    persistir();
  };
  const radio = document.getElementById("c-radio");
  if (radio) {
    radio.oninput = (e) => { const v = Number(e.target.value) || 0; miembros().forEach((m) => (m.radioMm = v)); refrescarTodos(); };
    radio.onchange = persistir;
  }

  document.getElementById("gr-fondo").oninput = (e) => { miembros().forEach((m) => (m.fondo = e.target.value)); refrescarTodos(); };
  document.getElementById("gr-fondo").onchange = persistir;
  document.getElementById("gr-color").oninput = (e) => { miembros().forEach((m) => (m.color = e.target.value)); refrescarTodos(); };
  document.getElementById("gr-color").onchange = persistir;

  _enlazarPlantillas("gr");
  _enlazarContorno("gr", (puntos) => { miembros().forEach((b) => { b.puntosContorno = puntos; }); refrescarTodos(); persistir(); });

  document.getElementById("gr-numeros").onchange = (e) => {
    const nuevos = _codigosBoton(e.target.value);
    if (!nuevos.length) return toast("Ingresa al menos un código o texto central.");
    const actuales = miembros();
    const actualesNums = actuales.map((m) => String(m.contenido.numero));
    const base = actuales[0];
    actuales.forEach((m) => { if (!nuevos.includes(String(m.contenido.numero))) S = Store.eliminarBoton(hojaId, m.id); });
    nuevos.forEach((n) => {
      if (actualesNums.includes(n)) return;
      const nuevoBoton = {
        id: uid(), forma: base.forma, radioMm: base.radioMm, paddingHMm: base.paddingHMm, paddingVMm: base.paddingVMm, w: base.w, h: base.h, fondo: base.fondo, color: base.color, grupoId, puntosContorno: base.puntosContorno,
        contenido: { ...base.contenido, numero: n },
      };
      const pos = empacarPosicion(_hojaActual().botones, nuevoBoton.w, nuevoBoton.h);
      nuevoBoton.x = pos.x;
      nuevoBoton.y = pos.y;
      S = Store.agregarBoton(hojaId, nuevoBoton);
    });
    _seleccion = new Set(miembros()[0] ? [miembros()[0].id] : []);
    _renderHoja();
    _renderPanel();
    toast("Grupo actualizado.");
  };

  document.getElementById("gr-duplicar").onclick = () => _duplicarGrupo(grupoId);

  document.getElementById("gr-eliminar").onclick = () => {
    const cant = miembros().length;
    if (!confirm(`¿Eliminar los ${cant} botones de este grupo?`)) return;
    miembros().forEach((m) => { S = Store.eliminarBoton(hojaId, m.id); });
    _seleccion = new Set();
    _renderHoja();
    _renderPanel();
  };

  document.querySelectorAll(".chip-x").forEach((btn) => {
    btn.onclick = () => {
      S = Store.eliminarBoton(hojaId, btn.dataset.id);
      if (_seleccion.has(btn.dataset.id)) {
        _seleccion = new Set(miembros()[0] ? [miembros()[0].id] : []);
      }
      _renderHoja();
      _renderPanel();
    };
  });
}

// ---------- Pestaña "Panel" (diseño fijo; textos, tamaños y posiciones editables) ----------

let _panelSel = null; // id de la celda seleccionada en el panel
let _panelMover = "celda"; // qué mueven las flechas: "celda" (todo el botón) o el nombre de un texto
let _zoomPanel = 0.9;

function _panelCelda(id) {
  return PANEL_CELDAS.find((x) => x.id === id);
}

function vistaPanel() {
  _seleccion = new Set(); // evita que Supr borre botones de la otra pestaña
  if (!_panelCelda(_panelSel)) _panelSel = null;
  const e = panelEscala(Store.panelConfig());
  app.innerHTML = `
    <div class="editor">
      <aside class="panel-lateral card" id="panel"></aside>
      <section class="lienzo-wrap">
        <div class="aviso-impresion">⚠️ Al imprimir: <b>Orientación = Horizontal</b>, <b>Márgenes = Ninguno</b> y <b>Escala = 100% / Tamaño real</b> (no "Ajustar"). El navegador no deja preseleccionar esto desde la página, revísalo en el diálogo de impresión.</div>
        <div class="lienzo-toolbar card">
          <span class="muted">Textos, tamaños y posiciones editables; flechas del teclado para mover.</span>
          <span class="spacer"></span>
          <label class="zoom-label">Zoom <input type="range" id="zoom-panel" min="0.3" max="1.3" step="0.05" value="${_zoomPanel}"></label>
          <button class="btn sm sec" id="btn-panel-reiniciar">Restaurar todo</button>
          <button class="btn" id="btn-panel-imprimir" title="Orientación: Horizontal · Márgenes: Ninguno · Escala: 100% / Tamaño real">🖨️ Imprimir</button>
        </div>
        <div class="lienzo-scroll">
          <div class="panel-hoja" id="panel-hoja" style="width:${e.aMm.toFixed(3)}mm;height:${e.hMm.toFixed(3)}mm;--u:${e.uf.toFixed(5)}mm;transform:scale(${_zoomPanel})"></div>
        </div>
      </section>
    </div>`;
  _renderPanelHoja();
  _renderPanelLateral();
  document.getElementById("zoom-panel").oninput = (ev) => {
    _zoomPanel = Number(ev.target.value);
    document.getElementById("panel-hoja").style.transform = `scale(${_zoomPanel})`;
  };
  document.getElementById("btn-panel-reiniciar").onclick = () => {
    if (!confirm("¿Restaurar todos los textos, tamaños y posiciones del panel a los originales?")) return;
    S = Store.reiniciarPanel();
    _panelAplicarTamano();
    _renderPanelHoja();
    _renderPanelLateral();
  };
  document.getElementById("btn-panel-imprimir").onclick = () => window.print();
}

// Tamaño del panel completo (caja + patrón de fondo) según lo guardado.
function _panelAplicarTamano() {
  const e = panelEscala(Store.panelConfig());
  const hoja = document.getElementById("panel-hoja");
  hoja.style.width = `${e.aMm.toFixed(3)}mm`;
  hoja.style.height = `${e.hMm.toFixed(3)}mm`;
  hoja.style.setProperty("--u", `${e.uf.toFixed(5)}mm`);
}

function _panelLineas(t) {
  return String(t).split("\n").map(esc).join("<br>");
}

// Marco de un botón (SVG a la medida exacta de su caja): placa amarilla a
// naranja, anillo rojo, cara azul (o roja) y barras naranjas que sobresalen.
function _panelMarcoSVG(c, geo) {
  const B = PANEL_BARRA, w = geo.w, h = geo.h;
  const pw = w - 2 * B, ph = h - 2 * B;
  const [fx, fy, fw, fh] = geo.cara;
  const g = `m${c.id}`;
  const bw = Math.round(pw * 0.67), bh = Math.round(ph * 0.63), sol = c.solape;
  const r = (n) => Math.round(n * 100) / 100;
  const barra = (x, y, bw2, bh2) => `<rect x="${r(x + 0.5)}" y="${r(y + 0.5)}" width="${r(bw2 - 1)}" height="${r(bh2 - 1)}" fill="#ff8000" stroke="#892500" stroke-width="1"/>`;
  const cx = (w - bw) / 2, cy = (h - bh) / 2;
  return `<svg class="panel-marco" viewBox="0 0 ${r(w)} ${r(h)}" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id="${g}p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe600"/><stop offset=".3" stop-color="#ffb000"/><stop offset=".7" stop-color="#ff8000"/><stop offset="1" stop-color="#ff8000"/></linearGradient>
      <linearGradient id="${g}f" x1="0" y1="0" x2="0" y2="1">${c.rojo
        ? '<stop offset="0" stop-color="#ff0000"/><stop offset="1" stop-color="#d80000"/>'
        : '<stop offset="0" stop-color="#007bff"/><stop offset="1" stop-color="#0029ff"/>'}</linearGradient>
    </defs>
    <rect x="${B + 0.5}" y="${B + 0.5}" width="${r(pw - 1)}" height="${r(ph - 1)}" fill="url(#${g}p)" stroke="#892500" stroke-width="1"/>
    ${barra(cx, sol, bw, B)}${barra(cx, h - B - sol, bw, B)}${barra(sol, cy, B, bh)}${barra(w - B - sol, cy, B, bh)}
    <rect x="${r(fx - 3)}" y="${r(fy - 3)}" width="${r(fw + 6)}" height="${r(fh + 6)}" fill="#f00000" stroke="#a00000" stroke-width=".8"/>
    <rect x="${fx}" y="${fy}" width="${r(fw)}" height="${r(fh)}" fill="url(#${g}f)"/>
  </svg>`;
}

function _panelCeldaHTML(c) {
  const e = panelEscala(Store.panelConfig());
  const guardado = Store.panelCelda(c.id);
  const geo = panelGeom(c, guardado);
  const v = panelValoresCelda(c, guardado);
  const anchoCara = geo.cara ? geo.cara[2] : geo.w;
  const caraX = geo.cara ? geo.cara[0] : 0;
  const textos = Object.keys(c.slots).map((slot) => {
    const def = c.slots[slot];
    const s = v[slot];
    if (!String(s.texto).trim()) return "";
    const sdx = guardado[`dx_${slot}`] || 0, sdy = guardado[`dy_${slot}`] || 0;
    const sx = def.sx || 1;
    const centrado = def.ax === "c";
    const hx = (n) => (n * e.ux).toFixed(3), vy = (n) => (n * e.uy).toFixed(3);
    const pos = [
      centrado ? `left:calc(50% + ${hx(def.ox + sdx)}mm)` : `left:${hx(def.ox + sdx)}mm`,
      def.ay === "b" ? `bottom:${vy(def.oy - sdy)}mm` : def.ay === "m" ? `top:calc(50% + ${vy(def.oy + sdy)}mm)` : `top:${vy(def.oy + sdy)}mm`,
    ].join(";");
    const disponible = centrado ? anchoCara : geo.w - caraX - def.ox;
    const transform = `translate(${centrado ? "-50%" : "0"},${def.ay === "m" ? "-50%" : "0"})${sx !== 1 ? ` scaleX(${sx})` : ""}`;
    const origen = `${centrado ? "50%" : "0"} ${def.ay === "m" ? "50%" : def.ay === "b" ? "100%" : "0"}`;
    return `<div class="panel-txt rol-${def.rol}" data-slot="${slot}" style="${pos};font-size:${(def.base * s.tam * e.uf).toFixed(3)}mm;line-height:${def.lh};max-width:${((disponible / sx) * e.ux).toFixed(3)}mm;text-align:${centrado ? "center" : "left"};transform:${transform};transform-origin:${origen}">${_panelLineas(s.texto)}</div>`;
  }).join("");
  return (c.sinMarco ? "" : _panelMarcoSVG(c, geo)) + textos;
}

// Si un texto no entra en el ancho de su botón, achica la letra hasta que quepa.
function _panelAjustar(el) {
  el.querySelectorAll(".panel-txt").forEach((t) => {
    let intentos = 0;
    while (t.scrollWidth > t.clientWidth + 0.5 && intentos < 40) {
      const nuevo = (parseFloat(t.style.fontSize) || 3) * 0.94;
      if (nuevo < 0.8) break;
      t.style.fontSize = `${nuevo.toFixed(3)}mm`;
      intentos++;
    }
  });
}

function _panelEstiloCelda(c) {
  const e = panelEscala(Store.panelConfig());
  const geo = panelGeom(c, Store.panelCelda(c.id));
  return `left:${(geo.x * e.ux).toFixed(3)}mm;top:${(geo.y * e.uy).toFixed(3)}mm;width:${(geo.w * e.ux).toFixed(3)}mm;height:${(geo.h * e.uy).toFixed(3)}mm`;
}

// Líneas doradas exteriores del panel con un adorno cuadrado en cada esquina.
function _panelBordeSVG() {
  const W = PANEL_REF_W, H = PANEL_REF_H;
  const esquina = (x, y, dx, dy) => `<g transform="translate(${x} ${y}) scale(${dx} ${dy})">
      <rect x="1.5" y="1.5" width="12" height="12" fill="none" stroke="#ff8000" stroke-width="3"/>
      <path d="M-3 22.5H22.5V-3" fill="none" stroke="#ffe600" stroke-width="3"/>
    </g>`;
  return `<svg class="panel-borde" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <rect x="10" y="10" width="${W - 20}" height="${H - 20}" fill="none" stroke="#ffe600" stroke-width="4"/>
    <rect x="15" y="15" width="${W - 30}" height="${H - 30}" fill="none" stroke="#ff8000" stroke-width="2"/>
    ${esquina(0, 0, 1, 1)}${esquina(W, 0, -1, 1)}${esquina(0, H, 1, -1)}${esquina(W, H, -1, -1)}
  </svg>`;
}

function _renderPanelHoja() {
  const hoja = document.getElementById("panel-hoja");
  hoja.innerHTML = _panelBordeSVG() + PANEL_CELDAS.map((c) =>
    `<div class="panel-celda ${c.id === _panelSel ? "seleccionada" : ""}" data-id="${c.id}" style="${_panelEstiloCelda(c)}">${_panelCeldaHTML(c)}</div>`
  ).join("");
  hoja.querySelectorAll(".panel-celda").forEach((el) => {
    _panelAjustar(el);
    el.onclick = () => {
      _panelSel = el.dataset.id;
      hoja.querySelectorAll(".panel-celda").forEach((x) => x.classList.toggle("seleccionada", x === el));
      _renderPanelLateral();
    };
  });
}

// Repinta el contenido (marco y textos) de un botón.
function _pintarPanelCelda(id) {
  const c = _panelCelda(id);
  const el = document.querySelector(`.panel-celda[data-id="${id}"]`);
  if (!c || !el) return;
  el.innerHTML = _panelCeldaHTML(c);
  _panelAjustar(el);
}

// Posición y tamaño de la caja de un botón, y su contenido, sin tocar el resto.
function _panelRepintarCelda(id) {
  const c = _panelCelda(id);
  const el = document.querySelector(`.panel-celda[data-id="${id}"]`);
  if (!c || !el) return;
  el.setAttribute("style", _panelEstiloCelda(c));
  _pintarPanelCelda(id);
}

function _panelEtiqueta(c) {
  const s = c.slots.numero || c.slots.texto;
  return s.texto.replace(/\n/g, " ");
}

const _MM = (n) => (Math.round(n * 10) / 10).toString().replace(".", ",");

function _renderPanelLateral() {
  const cont = document.getElementById("panel");
  const chips = (titulo, celdas) => `
    <h4>${titulo}</h4>
    <div class="chips">${celdas.map((c) => `<button class="btn sm ${c.id === _panelSel ? "activo" : ""}" data-sel="${c.id}">${esc(_panelEtiqueta(c))}</button>`).join("")}</div>`;
  const selector = chips("Fila de arriba", PANEL_CELDAS.filter((c) => c.id.startsWith("simbolo")))
    + chips("Fila de abajo", PANEL_CELDAS.filter((c) => c.id.startsWith("juegue")))
    + chips("Otros", PANEL_CELDAS.filter((c) => c.slots.texto));

  const tamanoPanel = `
    <h4>Tamaño del panel</h4>
    <div class="fila-2">
      <label class="campo">Ancho (mm)<input id="pn-ancho" type="number" min="40" max="600" step="0.5"></label>
      <label class="campo">Alto (mm)<input id="pn-alto" type="number" min="10" max="400" step="0.5"></label>
    </div>
    <label class="campo" style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" id="pn-prop" style="width:auto"> Mantener proporción</label>
    <div class="muted" style="font-size:12px" id="pn-aviso"></div>
    <button class="btn sm sec" id="pn-reset">Tamaño original del panel</button>`;

  const c = _panelCelda(_panelSel);
  let form = `<p class="muted" style="font-size:12px">Haz clic en un botón del panel (o aquí) para editar su texto, tamaño y posición.</p>`;
  if (c) {
    const v = panelValoresCelda(c, Store.panelCelda(c.id));
    const etiquetas = { texto: "Texto", top: "Texto de arriba", numero: "Número / texto grande", bottom: "Texto de abajo" };
    const slots = Object.keys(c.slots);
    const multi = (slot) => slot === "texto" || c.slots[slot].multi;
    form = `<hr class="separador"><h3>Editar botón</h3><div class="panel-form">` + slots.map((slot) => `
      <label class="campo">${etiquetas[slot]}${multi(slot)
        ? `<textarea id="p-${slot}" rows="2">${esc(v[slot].texto)}</textarea>`
        : `<input id="p-${slot}" type="text" value="${esc(v[slot].texto)}">`}</label>
      <label class="campo">Tamaño de la letra <span class="valor-slider" id="p-tam-val-${slot}">${Math.round(v[slot].tam * 100)}%</span>
        <input id="p-tam-${slot}" type="range" min="30" max="200" step="5" value="${Math.round(v[slot].tam * 100)}"></label>`).join("")
      + (c.cara ? `
        <h4>Tamaño del botón</h4>
        <div class="fila-2">
          <label class="campo">Ancho (mm)<input id="b-ancho" type="number" min="5" max="200" step="0.5"></label>
          <label class="campo">Alto (mm)<input id="b-alto" type="number" min="5" max="200" step="0.5"></label>
        </div>
        <button class="btn sm sec" id="b-reset">Tamaño original del botón</button>` : "")
      + `<h4>Posición</h4>
        <label class="campo">Mover con las flechas del teclado
          <select id="p-mover"><option value="celda">Todo el botón</option>${slots.map((sl) => `<option value="${sl}">${etiquetas[sl]}</option>`).join("")}</select></label>
        <div class="muted" style="font-size:12px" id="p-mover-info"></div>
        <button class="btn sm sec" id="p-mover-reset">Restablecer posición</button>
        <p class="muted" style="font-size:12px;margin:0">Flechas: 1 px · Shift + flechas: 5 px${c.cara ? " · Ctrl + flechas: cambian el tamaño del botón" : ""}. Si el cursor está en un campo, haz clic en el panel o pulsa Esc primero.</p>
        <button class="btn sm sec" id="p-restaurar">Restaurar este botón</button></div>`;
  }
  cont.innerHTML = `<h3>Panel</h3>${selector}${tamanoPanel}${form}`;

  cont.querySelectorAll("[data-sel]").forEach((b) => {
    b.onclick = () => {
      _panelSel = b.dataset.sel;
      document.querySelectorAll(".panel-celda").forEach((x) => x.classList.toggle("seleccionada", x.dataset.id === _panelSel));
      _renderPanelLateral();
    };
  });

  // --- tamaño del panel completo ---
  const inA = document.getElementById("pn-ancho"), inH = document.getElementById("pn-alto"), inP = document.getElementById("pn-prop");
  const refrescarPanel = () => {
    const cfg = Store.panelConfig(), e = panelEscala(cfg);
    if (document.activeElement !== inA) inA.value = _MM(e.aMm).replace(",", ".");
    if (document.activeElement !== inH) inH.value = _MM(e.hMm).replace(",", ".");
    inP.checked = cfg.proporcion;
    const excede = e.aMm > HOJA_ALTO_MM - 12 || e.hMm > HOJA_ANCHO_MM - 7;
    document.getElementById("pn-aviso").textContent = excede
      ? `⚠️ Es más grande que una hoja carta horizontal (${_MM(HOJA_ALTO_MM)} × ${_MM(HOJA_ANCHO_MM)} mm): se cortará al imprimir.`
      : `Original: ${_MM(PANEL_ANCHO_MM)} × ${_MM((PANEL_ANCHO_MM * PANEL_REF_H) / PANEL_REF_W)} mm.`;
  };
  const cambiarPanel = (campo) => {
    const cfg = Store.panelConfig(), e = panelEscala(cfg);
    const val = Number(campo === "a" ? inA.value : inH.value);
    if (!(val > 0)) return;
    const razon = e.hMm / e.aMm;
    let aMm = campo === "a" ? val : cfg.proporcion ? val / razon : e.aMm;
    let hMm = campo === "h" ? val : cfg.proporcion ? val * razon : e.hMm;
    S = Store.actualizarPanelConfig({ anchoMm: Math.round(aMm * 100) / 100, altoMm: Math.round(hMm * 100) / 100 });
    _panelAplicarTamano();
    _renderPanelHoja();
    refrescarPanel();
  };
  inA.oninput = () => cambiarPanel("a");
  inH.oninput = () => cambiarPanel("h");
  inP.onchange = () => { S = Store.actualizarPanelConfig({ proporcion: inP.checked }); };
  document.getElementById("pn-reset").onclick = () => {
    S = Store.actualizarPanelConfig({ anchoMm: null, altoMm: null });
    _panelAplicarTamano();
    _renderPanelHoja();
    refrescarPanel();
  };
  refrescarPanel();

  if (!c) return;
  Object.keys(c.slots).forEach((slot) => {
    document.getElementById(`p-${slot}`).oninput = (ev) => {
      S = Store.actualizarPanelCelda(c.id, { [slot]: ev.target.value });
      _pintarPanelCelda(c.id);
    };
    document.getElementById(`p-tam-${slot}`).oninput = (ev) => {
      const tam = Number(ev.target.value) / 100;
      document.getElementById(`p-tam-val-${slot}`).textContent = `${ev.target.value}%`;
      S = Store.actualizarPanelCelda(c.id, { [`tam_${slot}`]: tam });
      _pintarPanelCelda(c.id);
    };
  });
  document.getElementById("p-restaurar").onclick = () => {
    S = Store.reiniciarPanel(c.id);
    _panelRepintarCelda(c.id);
    _renderPanelLateral();
  };

  // --- tamaño del botón ---
  if (c.cara) {
    const bA = document.getElementById("b-ancho"), bH = document.getElementById("b-alto");
    const cambiarBoton = () => {
      const e = panelEscala(Store.panelConfig());
      const ancho = Number(bA.value) / e.ux, alto = Number(bH.value) / e.uy;
      if (!(ancho > 0) || !(alto > 0)) return;
      S = Store.actualizarPanelCelda(c.id, { dw: Math.round((ancho - c.w) * 10) / 10, dh: Math.round((alto - c.h) * 10) / 10 });
      _panelRepintarCelda(c.id);
    };
    bA.oninput = cambiarBoton;
    bH.oninput = cambiarBoton;
    document.getElementById("b-reset").onclick = () => {
      S = Store.actualizarPanelCelda(c.id, { dw: null, dh: null });
      _panelRepintarCelda(c.id);
      _panelInfoTamano(c);
    };
  }

  if (_panelMover !== "celda" && !c.slots[_panelMover]) _panelMover = "celda";
  const selMover = document.getElementById("p-mover");
  selMover.value = _panelMover;
  selMover.onchange = (ev) => { _panelMover = ev.target.value; _panelInfoMover(c); ev.target.blur(); };
  document.getElementById("p-mover-reset").onclick = () => {
    const claves = _panelMover === "celda" ? { dx: null, dy: null } : { [`dx_${_panelMover}`]: null, [`dy_${_panelMover}`]: null };
    S = Store.actualizarPanelCelda(c.id, claves);
    _panelRepintarCelda(c.id);
    _panelInfoMover(c);
  };
  cont.querySelectorAll('input[type="range"]').forEach((r) => { r.onchange = () => r.blur(); });
  _panelInfoMover(c);
  _panelInfoTamano(c);
}

// Muestra en los campos el tamaño actual del botón (en mm).
function _panelInfoTamano(c) {
  const bA = document.getElementById("b-ancho"), bH = document.getElementById("b-alto");
  if (!bA || !bH) return;
  const e = panelEscala(Store.panelConfig());
  const geo = panelGeom(c, Store.panelCelda(c.id));
  if (document.activeElement !== bA) bA.value = (Math.round(geo.w * e.ux * 10) / 10).toString();
  if (document.activeElement !== bH) bH.value = (Math.round(geo.h * e.uy * 10) / 10).toString();
}

function _panelInfoMover(c) {
  const el = document.getElementById("p-mover-info");
  if (!el) return;
  const e = panelEscala(Store.panelConfig());
  const g = Store.panelCelda(c.id);
  const dx = _panelMover === "celda" ? g.dx || 0 : g[`dx_${_panelMover}`] || 0;
  const dy = _panelMover === "celda" ? g.dy || 0 : g[`dy_${_panelMover}`] || 0;
  const sg = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v);
  el.textContent = `Desplazamiento: X ${sg(dx)} px (${_MM(dx * e.ux)} mm), Y ${sg(dy)} px (${_MM(dy * e.uy)} mm)`;
}

// Flechas del teclado: mueven el botón seleccionado (o uno de sus textos);
// con Ctrl cambian el tamaño del botón. Shift = pasos de 5 px.
function _panelFlechas(ev) {
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  const c = _panelCelda(_panelSel);
  if (!c) return;
  ev.preventDefault();
  const paso = ev.shiftKey ? 5 : 1;
  const ddx = ev.key === "ArrowLeft" ? -paso : ev.key === "ArrowRight" ? paso : 0;
  const ddy = ev.key === "ArrowUp" ? -paso : ev.key === "ArrowDown" ? paso : 0;
  if (!ddx && !ddy) return;
  const g = Store.panelCelda(c.id);
  if (ev.ctrlKey) {
    if (!c.cara) return;
    const min = panelMinimo(c);
    const dw = clamp((g.dw || 0) + ddx, min.w - c.w, PANEL_REF_W - 20 - c.w);
    const dh = clamp((g.dh || 0) + ddy, min.h - c.h, PANEL_REF_H - 20 - c.h);
    S = Store.actualizarPanelCelda(c.id, { dw, dh });
    _panelRepintarCelda(c.id);
    _panelInfoTamano(c);
    return;
  }
  if (_panelMover === "celda" || !c.slots[_panelMover]) {
    const geo = panelGeom(c, g);
    const dx = clamp((g.dx || 0) + ddx, (g.dx || 0) - geo.x, (g.dx || 0) + PANEL_REF_W - geo.w - geo.x);
    const dy = clamp((g.dy || 0) + ddy, (g.dy || 0) - geo.y, (g.dy || 0) + PANEL_REF_H - geo.h - geo.y);
    S = Store.actualizarPanelCelda(c.id, { dx, dy });
    _panelRepintarCelda(c.id);
  } else {
    const kx = `dx_${_panelMover}`, ky = `dy_${_panelMover}`;
    S = Store.actualizarPanelCelda(c.id, { [kx]: (g[kx] || 0) + ddx, [ky]: (g[ky] || 0) + ddy });
    _pintarPanelCelda(c.id);
  }
  _panelInfoMover(c);
}






