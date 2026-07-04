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

let _seleccionId = null;
let _zoom = 0.85;

function _hojaActual() {
  return Store.hojaActual();
}

function _botonSeleccionado() {
  const h = _hojaActual();
  return h.botones.find((b) => b.id === _seleccionId) || null;
}

function vistaInicio() {
  _seleccionId = null;
  app.innerHTML = `
    <div class="editor">
      <aside class="panel-lateral card" id="panel"></aside>
      <section class="lienzo-wrap">
        <div class="lienzo-toolbar card">
          <select id="sel-hoja"></select>
          <button class="btn sm" id="btn-hoja-nueva">+ Hoja</button>
          <button class="btn sm" id="btn-hoja-renombrar">Renombrar</button>
          <button class="btn sm" id="btn-hoja-duplicar">Duplicar</button>
          <button class="btn sm sec" id="btn-hoja-eliminar">Eliminar hoja</button>
          <span class="spacer"></span>
          <label class="zoom-label">Zoom <input type="range" id="zoom" min="0.3" max="1.3" step="0.05" value="${_zoom}"></label>
          <button class="btn sm" id="btn-exportar">Exportar JSON</button>
          <button class="btn sm" id="btn-importar">Importar JSON</button>
          <input type="file" id="input-importar" accept="application/json" style="display:none">
          <button class="btn" id="btn-imprimir">🖨️ Imprimir</button>
        </div>
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

function _enlazarToolbar() {
  document.getElementById("sel-hoja").onchange = (e) => {
    S = Store.setHojaActual(e.target.value);
    _seleccionId = null;
    _renderHoja();
    _renderPanel();
  };
  document.getElementById("btn-hoja-nueva").onclick = () => {
    S = Store.crearHoja();
    _seleccionId = null;
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
    _seleccionId = null;
    _renderSelectorHojas();
    _renderHoja();
    _renderPanel();
  };
  document.getElementById("btn-hoja-eliminar").onclick = () => {
    const h = _hojaActual();
    if (!confirm(`¿Eliminar "${h.nombre}" y todos sus botones?`)) return;
    S = Store.eliminarHoja(h.id);
    _seleccionId = null;
    _renderSelectorHojas();
    _renderHoja();
    _renderPanel();
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
      _seleccionId = null;
      _renderSelectorHojas();
      _renderHoja();
      _renderPanel();
      toast("Importado.");
    };
    reader.readAsText(file);
    e.target.value = "";
  };
  document.getElementById("btn-imprimir").onclick = () => window.print();
}

// ---------- Lienzo (hoja + botones + marcas de corte) ----------

function _renderHoja() {
  const hojaEl = document.getElementById("hoja");
  const h = _hojaActual();
  const marcas = h.botones.flatMap(marcasDeCorteBoton);
  hojaEl.innerHTML =
    marcas.map((m) => `<div class="marca-corte" style="left:${m.x}mm;top:${m.y}mm;width:${m.w}mm;height:${m.h}mm"></div>`).join("") +
    h.botones.map((b) => `<div class="boton-print" data-id="${b.id}"></div>`).join("");
  h.botones.forEach((b) => _pintarBoton(document.querySelector(`.boton-print[data-id="${b.id}"]`), b));
  _enlazarBotones();
}

function _contenidoHTML(b) {
  const c = b.contenido;
  if (c.tipo === "logo") {
    const src = S.logos[c.logoId] || "";
    return `<div class="boton-logo-wrap">
      <img src="${src}" style="transform: translate(${c.offsetX || 0}%, ${c.offsetY || 0}%) scale(${c.zoom || 1})">
    </div>`;
  }
  // Arriba suele ser una orden ("JUEGUE") que no se pluraliza; solo el texto
  // de abajo (el sustantivo contable, "CRÉDITO/S") cambia según el número.
  const arriba = c.arriba || "";
  const abajo = pluralizar(c.numero, c.abajo);
  const fsArriba = (b.h * 0.16).toFixed(2);
  const fsNumero = (b.h * 0.4).toFixed(2);
  const fsAbajo = (b.h * 0.16).toFixed(2);
  let html = "";
  if (arriba) html += `<div class="boton-linea" style="font-size:${fsArriba}mm">${esc(arriba)}</div>`;
  if (c.numero != null && c.numero !== "") html += `<div class="boton-numero" style="font-size:${fsNumero}mm">${esc(c.numero)}</div>`;
  if (abajo) html += `<div class="boton-linea" style="font-size:${fsAbajo}mm">${esc(abajo)}</div>`;
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
  el.style.borderRadius = formaRadioCss(b);
  el.classList.toggle("seleccionado", b.id === _seleccionId);
  el.innerHTML = _contenidoHTML(b);
}

function _enlazarBotones() {
  document.querySelectorAll(".boton-print").forEach((el) => {
    el.onpointerdown = (e) => _iniciarDrag(e, el);
    el.onclick = (e) => {
      if (el.dataset.arrastrado === "1") { el.dataset.arrastrado = "0"; return; }
      _seleccionId = el.dataset.id;
      document.querySelectorAll(".boton-print").forEach((x) => x.classList.toggle("seleccionado", x === el));
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
  const startBX = b.x, startBY = b.y;
  el.dataset.arrastrado = "0";
  el.setPointerCapture(e.pointerId);
  const factor = PX_POR_MM * _zoom;
  function mover(ev) {
    const dx = (ev.clientX - startX) / factor;
    const dy = (ev.clientY - startY) / factor;
    if (Math.abs(ev.clientX - startX) > 3 || Math.abs(ev.clientY - startY) > 3) el.dataset.arrastrado = "1";
    b.x = clamp(startBX + dx, 0, Math.max(0, HOJA_ANCHO_MM - b.w));
    b.y = clamp(startBY + dy, 0, Math.max(0, HOJA_ALTO_MM - b.h));
    el.style.left = `${b.x}mm`;
    el.style.top = `${b.y}mm`;
    _renderMarcasCorte();
  }
  function soltar() {
    el.removeEventListener("pointermove", mover);
    el.removeEventListener("pointerup", soltar);
    Store.guardar();
  }
  el.addEventListener("pointermove", mover);
  el.addEventListener("pointerup", soltar);
}

function _renderMarcasCorte() {
  const hojaEl = document.getElementById("hoja");
  const h = _hojaActual();
  hojaEl.querySelectorAll(".marca-corte").forEach((m) => m.remove());
  const marcas = h.botones.flatMap(marcasDeCorteBoton);
  const frag = marcas
    .map((m) => `<div class="marca-corte" style="left:${m.x}mm;top:${m.y}mm;width:${m.w}mm;height:${m.h}mm"></div>`)
    .join("");
  hojaEl.insertAdjacentHTML("afterbegin", frag);
}

// ---------- Panel lateral (agregar / editar botón / editar grupo) ----------

function _renderPanel() {
  const panel = document.getElementById("panel");
  const b = _botonSeleccionado();
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

function _miembrosGrupo(grupoId) {
  return _hojaActual()
    .botones.filter((b) => b.grupoId === grupoId)
    .sort((a, b) => (a.contenido.numero ?? 0) - (b.contenido.numero ?? 0));
}

const FORMAS = [
  ["cuadrado", "Cuadrado"],
  ["redondeado", "Bordes redondeados"],
  ["circulo", "Círculo"],
  ["ovalo", "Óvalo"],
];

function _selectForma(id, valor) {
  return `<select id="${id}">${FORMAS.map(([v, l]) => `<option value="${v}" ${v === valor ? "selected" : ""}>${l}</option>`).join("")}</select>`;
}

function _campoRadio(valor) {
  return `<label class="campo campo-radio">Radio esquinas (mm)
    <input type="number" id="c-radio" min="0" step="0.5" value="${valor ?? 3}"></label>`;
}

// d = valores por defecto a precargar: { w, h, forma, radioMm }
function _bloqueFormaTamano(pfx, d) {
  d = d || {};
  return `
    <div class="fila-2">
      <label class="campo">Ancho (mm)<input id="${pfx}-w" type="number" min="5" step="0.5" value="${d.w ?? 40}"></label>
      <label class="campo">Alto (mm)<input id="${pfx}-h" type="number" min="5" step="0.5" value="${d.h ?? 40}"></label>
    </div>
    <label class="campo">Forma ${_selectForma(pfx + "-forma", d.forma ?? "cuadrado")}</label>
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
    campoW.value = p.w;
    campoH.value = p.h;
    campoForma.value = p.forma;
    if (campoRadio) campoRadio.value = p.radioMm || 0;
    // Dispara los eventos para que los listeners ya enganchados (vivos o no) reaccionen.
    [campoW, campoH].forEach((c) => { c.dispatchEvent(new Event("input")); c.dispatchEvent(new Event("change")); });
    campoForma.dispatchEvent(new Event("change"));
    if (campoRadio) { campoRadio.dispatchEvent(new Event("input")); campoRadio.dispatchEvent(new Event("change")); }
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
        radioMm: Number(document.getElementById("c-radio")?.value) || 0,
      };
      S = Store.guardarPlantilla(nombre, datos);
      pintarOpciones();
      toast(`Plantilla "${nombre}" guardada.`);
    };
  }
}

function _crearYSeleccionar(boton) {
  const pos = empacarPosicion(_hojaActual().botones, boton.w, boton.h);
  boton.x = pos.x;
  boton.y = pos.y;
  S = Store.agregarBoton(_hojaActual().id, boton);
  _seleccionId = boton.id;
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
    <h4>Generar por lista de números</h4>
    <form id="f-lista" class="panel-form">
      <label class="campo">Lista de números (separados por coma)<input id="l-lista" placeholder="1, 2, 3, 5, 10"></label>
      <div class="muted conteo" id="l-conteo">0 botones</div>
      <label class="campo">Texto arriba<input id="l-arriba" placeholder="JUEGUE" value="${esc(u.arriba)}"></label>
      <label class="campo">Texto abajo<input id="l-abajo" placeholder="LÍNEA" value="${esc(u.abajo)}"></label>
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
      id: uid(), forma: u.forma, radioMm: u.radioMm, w: u.w, h: u.h, fondo: u.fondo, color: u.color,
      contenido: { tipo: "texto", arriba: u.arriba, numero: null, abajo: u.abajo },
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
        id: uid(), forma: u.forma, radioMm: u.radioMm, w: u.w, h: u.h, fondo: u.fondo, color: "#000000",
        contenido: { tipo: "logo", logoId, zoom: 1, offsetX: 0, offsetY: 0 },
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  _renderLogosExistentesAgregar();
  _enlazarRadioToggle("l");
  _enlazarPlantillas("l");

  const listaInput = document.getElementById("l-lista");
  const conteo = document.getElementById("l-conteo");
  const textoConteo = (n) => (n === 1 ? "1 botón" : `${n} botones`);
  const actualizarConteo = () => (conteo.textContent = textoConteo(parseListaNumeros(listaInput.value).length));
  listaInput.oninput = actualizarConteo;
  actualizarConteo();

  document.getElementById("f-lista").onsubmit = (e) => {
    e.preventDefault();
    const numeros = parseListaNumeros(listaInput.value);
    if (!numeros.length) return toast("Ingresá al menos un número (ej: 1, 2, 3).");
    const w = Number(document.getElementById("l-w").value);
    const h = Number(document.getElementById("l-h").value);
    const forma = document.getElementById("l-forma").value;
    const radioMm = Number(document.getElementById("c-radio")?.value) || 3;
    const fondo = document.getElementById("l-fondo").value;
    const color = document.getElementById("l-color").value;
    const arriba = document.getElementById("l-arriba").value;
    const abajo = document.getElementById("l-abajo").value;
    const grupoId = uid();
    let primero = null;
    numeros.forEach((n) => {
      const boton = {
        id: uid(), forma, radioMm, w, h, fondo, color, grupoId,
        contenido: { tipo: "texto", arriba, numero: n, abajo },
      };
      const pos = empacarPosicion(_hojaActual().botones, w, h);
      boton.x = pos.x;
      boton.y = pos.y;
      S = Store.agregarBoton(_hojaActual().id, boton);
      if (!primero) primero = boton.id;
    });
    S = Store.actualizarUltimoUsado({ arriba, abajo, forma, w, h, radioMm, fondo, color });
    _seleccionId = primero;
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
        id: uid(), forma: u.forma, radioMm: u.radioMm, w: u.w, h: u.h, fondo: u.fondo, color: "#000000",
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
      ${_bloqueFormaTamano("e", b)}
      ${_bloqueColores("e", b)}
      ${esLogo ? _bloqueEdicionLogo(c) : _bloqueEdicionTexto(c)}
      <div class="fila-2">
        <button class="btn" id="e-duplicar">Duplicar</button>
        <button class="btn sec" id="e-eliminar">Eliminar</button>
      </div>
    </div>`;
}

function _bloqueEdicionTexto(c) {
  return `
    <label class="campo">Texto arriba<input id="e-arriba" value="${esc(c.arriba || "")}"></label>
    <label class="campo">Número grande (opcional)<input id="e-numero" type="number" value="${c.numero ?? ""}"></label>
    <label class="campo">Texto abajo<input id="e-abajo" value="${esc(c.abajo || "")}"></label>
  `;
}

function _bloqueEdicionLogo(c) {
  return `
    <label class="campo">Zoom<input id="e-zoom" type="range" min="0.3" max="4" step="0.05" value="${c.zoom ?? 1}"></label>
    <label class="campo">Desplazar horizontal<input id="e-offx" type="range" min="-50" max="50" step="1" value="${c.offsetX ?? 0}"></label>
    <label class="campo">Desplazar vertical<input id="e-offy" type="range" min="-50" max="50" step="1" value="${c.offsetY ?? 0}"></label>
    <label class="campo">Cambiar imagen<input id="e-file" type="file" accept="image/*"></label>
  `;
}

function _enlazarFormEditar(b) {
  const hojaId = _hojaActual().id;
  const el = () => document.querySelector(`.boton-print[data-id="${b.id}"]`);

  document.getElementById("e-cerrar").onclick = () => {
    _seleccionId = null;
    document.querySelectorAll(".boton-print").forEach((x) => x.classList.remove("seleccionado"));
    _renderPanel();
  };

  document.getElementById("e-duplicar").onclick = () => {
    S = Store.duplicarBoton(hojaId, b.id);
    _renderHoja();
  };
  document.getElementById("e-eliminar").onclick = () => {
    if (!confirm("¿Eliminar este botón?")) return;
    S = Store.eliminarBoton(hojaId, b.id);
    _seleccionId = null;
    _renderHoja();
    _renderPanel();
  };

  const refrescar = () => { _pintarBoton(el(), b); _renderMarcasCorte(); };
  const persistir = () => {
    Store.guardar();
    Store.actualizarUltimoUsado({
      forma: b.forma, radioMm: b.radioMm, w: b.w, h: b.h, fondo: b.fondo,
      color: b.contenido.tipo === "texto" ? b.color : undefined,
      arriba: b.contenido.tipo === "texto" ? b.contenido.arriba : undefined,
      abajo: b.contenido.tipo === "texto" ? b.contenido.abajo : undefined,
    });
  };

  document.getElementById("e-w").oninput = (e) => { b.w = Number(e.target.value) || b.w; refrescar(); };
  document.getElementById("e-w").onchange = persistir;
  document.getElementById("e-h").oninput = (e) => { b.h = Number(e.target.value) || b.h; refrescar(); };
  document.getElementById("e-h").onchange = persistir;

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

  if (b.contenido.tipo === "logo") {
    document.getElementById("e-zoom").oninput = (e) => { b.contenido.zoom = Number(e.target.value); refrescar(); };
    document.getElementById("e-zoom").onchange = persistir;
    document.getElementById("e-offx").oninput = (e) => { b.contenido.offsetX = Number(e.target.value); refrescar(); };
    document.getElementById("e-offx").onchange = persistir;
    document.getElementById("e-offy").oninput = (e) => { b.contenido.offsetY = Number(e.target.value); refrescar(); };
    document.getElementById("e-offy").onchange = persistir;
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
    document.getElementById("e-numero").oninput = (e) => {
      b.contenido.numero = e.target.value === "" ? null : Number(e.target.value);
      refrescar();
    };
    document.getElementById("e-numero").onchange = persistir;
  }
}

// ---------- Editar un grupo (botones generados por lista de números) ----------

function _formEditarGrupo(grupoId) {
  const miembros = _miembrosGrupo(grupoId);
  const base = miembros[0];
  const n = miembros.length;
  const numeros = miembros.map((m) => m.contenido.numero).join(", ");
  return `
    <div class="panel-header">
      <h3>Grupo de ${n === 1 ? "1 botón" : n + " botones"}</h3>
      <button class="btn sm sec" id="e-cerrar">✕ Cerrar</button>
    </div>
    <div class="panel-form">
      <label class="campo">Números (separados por coma)<input id="gr-numeros" value="${esc(numeros)}"></label>
      <label class="campo">Texto arriba<input id="gr-arriba" value="${esc(base.contenido.arriba || "")}"></label>
      <label class="campo">Texto abajo<input id="gr-abajo" value="${esc(base.contenido.abajo || "")}"></label>
      ${_bloqueFormaTamano("gr", base)}
      ${_bloqueColores("gr", base)}
      <div class="chips">
        ${miembros.map((m) => `<span class="chip">${esc(m.contenido.numero)}<button type="button" class="chip-x" data-id="${m.id}" title="Quitar del grupo">✕</button></span>`).join("")}
      </div>
      <button class="btn sec" id="gr-eliminar">Eliminar grupo completo</button>
    </div>`;
}

function _enlazarFormEditarGrupo(grupoId) {
  const hojaId = _hojaActual().id;
  const miembros = () => _miembrosGrupo(grupoId);

  document.getElementById("e-cerrar").onclick = () => {
    _seleccionId = null;
    document.querySelectorAll(".boton-print").forEach((x) => x.classList.remove("seleccionado"));
    _renderPanel();
  };

  const refrescarTodos = () => {
    miembros().forEach((m) => _pintarBoton(document.querySelector(`.boton-print[data-id="${m.id}"]`), m));
    _renderMarcasCorte();
  };
  const persistir = () => {
    Store.guardar();
    const base = miembros()[0];
    if (base) {
      Store.actualizarUltimoUsado({
        forma: base.forma, radioMm: base.radioMm, w: base.w, h: base.h, fondo: base.fondo, color: base.color,
        arriba: base.contenido.arriba, abajo: base.contenido.abajo,
      });
    }
  };

  document.getElementById("gr-arriba").oninput = (e) => { miembros().forEach((m) => (m.contenido.arriba = e.target.value)); refrescarTodos(); };
  document.getElementById("gr-arriba").onchange = persistir;
  document.getElementById("gr-abajo").oninput = (e) => { miembros().forEach((m) => (m.contenido.abajo = e.target.value)); refrescarTodos(); };
  document.getElementById("gr-abajo").onchange = persistir;

  document.getElementById("gr-w").oninput = (e) => { const v = Number(e.target.value); if (v) miembros().forEach((m) => (m.w = v)); refrescarTodos(); };
  document.getElementById("gr-w").onchange = persistir;
  document.getElementById("gr-h").oninput = (e) => { const v = Number(e.target.value); if (v) miembros().forEach((m) => (m.h = v)); refrescarTodos(); };
  document.getElementById("gr-h").onchange = persistir;

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

  document.getElementById("gr-numeros").onchange = (e) => {
    const nuevos = parseListaNumeros(e.target.value);
    if (!nuevos.length) return toast("Ingresá al menos un número.");
    const actuales = miembros();
    const actualesNums = actuales.map((m) => m.contenido.numero);
    const base = actuales[0];
    actuales.forEach((m) => { if (!nuevos.includes(m.contenido.numero)) S = Store.eliminarBoton(hojaId, m.id); });
    nuevos.forEach((n) => {
      if (actualesNums.includes(n)) return;
      const nuevoBoton = {
        id: uid(), forma: base.forma, radioMm: base.radioMm, w: base.w, h: base.h, fondo: base.fondo, color: base.color, grupoId,
        contenido: { tipo: "texto", arriba: base.contenido.arriba, numero: n, abajo: base.contenido.abajo },
      };
      const pos = empacarPosicion(_hojaActual().botones, nuevoBoton.w, nuevoBoton.h);
      nuevoBoton.x = pos.x;
      nuevoBoton.y = pos.y;
      S = Store.agregarBoton(hojaId, nuevoBoton);
    });
    _seleccionId = miembros()[0]?.id || null;
    _renderHoja();
    _renderPanel();
    toast("Grupo actualizado.");
  };

  document.getElementById("gr-eliminar").onclick = () => {
    const cant = miembros().length;
    if (!confirm(`¿Eliminar los ${cant} botones de este grupo?`)) return;
    miembros().forEach((m) => { S = Store.eliminarBoton(hojaId, m.id); });
    _seleccionId = null;
    _renderHoja();
    _renderPanel();
  };

  document.querySelectorAll(".chip-x").forEach((btn) => {
    btn.onclick = () => {
      S = Store.eliminarBoton(hojaId, btn.dataset.id);
      if (_seleccionId === btn.dataset.id) _seleccionId = miembros()[0]?.id || null;
      _renderHoja();
      _renderPanel();
    };
  });
}
