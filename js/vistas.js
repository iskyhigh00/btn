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
  const arriba = c.numero != null && c.numero !== "" ? pluralizar(c.numero, c.arribaSingular, c.arribaPlural) : c.arribaSingular;
  const abajo = c.numero != null && c.numero !== "" ? pluralizar(c.numero, c.abajoSingular, c.abajoPlural) : c.abajoSingular;
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

// ---------- Panel lateral (agregar / editar) ----------

function _renderPanel() {
  const panel = document.getElementById("panel");
  const b = _botonSeleccionado();
  panel.innerHTML = b ? _formEditar(b) : _formAgregar();
  if (b) _enlazarFormEditar(b);
  else _enlazarFormAgregar();
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

function _formAgregar() {
  return `
    <h3>Agregar botón</h3>
    <div class="tabs">
      <button class="tab-btn activo" data-tab="texto">Texto</button>
      <button class="tab-btn" data-tab="lista">Lista de números</button>
      <button class="tab-btn" data-tab="logo">Imagen / logo</button>
    </div>

    <form id="f-texto" class="panel-form">
      <label class="campo">Texto arriba (singular)<input id="t-arriba-s" placeholder="JUEGUE"></label>
      <label class="campo">Texto arriba (plural, opcional)<input id="t-arriba-p" placeholder=""></label>
      <label class="campo">Número grande (opcional)<input id="t-numero" type="number"></label>
      <label class="campo">Texto abajo (singular)<input id="t-abajo-s" placeholder="CRÉDITO"></label>
      <label class="campo">Texto abajo (plural, opcional)<input id="t-abajo-p" placeholder="CRÉDITOS"></label>
      ${_bloqueFormaTamano("t")}
      ${_bloqueColores("t")}
      <button class="btn" type="submit">+ Agregar botón</button>
    </form>

    <form id="f-lista" class="panel-form" style="display:none">
      <label class="campo">Lista de números (separados por coma)<input id="l-lista" placeholder="1, 2, 3, 5, 10"></label>
      <label class="campo">Texto arriba (singular)<input id="l-arriba-s" placeholder="JUEGUE"></label>
      <label class="campo">Texto arriba (plural, opcional)<input id="l-arriba-p"></label>
      <label class="campo">Texto abajo (singular)<input id="l-abajo-s" placeholder="LÍNEA"></label>
      <label class="campo">Texto abajo (plural, opcional)<input id="l-abajo-p" placeholder="LÍNEAS"></label>
      ${_bloqueFormaTamano("l")}
      ${_bloqueColores("l")}
      <button class="btn" type="submit">+ Generar botones</button>
    </form>

    <form id="f-logo" class="panel-form" style="display:none">
      <label class="campo">Imagen<input id="g-file" type="file" accept="image/*"></label>
      <div class="logos-existentes" id="g-existentes"></div>
      ${_bloqueFormaTamano("g")}
      <label class="campo">Color de fondo<input id="g-fondo" type="color" value="#ffffff"></label>
      <button class="btn" type="submit" id="g-submit" disabled>+ Agregar botón</button>
    </form>
  `;
}

function _bloqueFormaTamano(pfx) {
  return `
    <div class="fila-2">
      <label class="campo">Ancho (mm)<input id="${pfx}-w" type="number" min="5" step="0.5" value="40"></label>
      <label class="campo">Alto (mm)<input id="${pfx}-h" type="number" min="5" step="0.5" value="40"></label>
    </div>
    <label class="campo">Forma ${_selectForma(pfx + "-forma", "cuadrado")}</label>
    <div id="${pfx}-radio-wrap" style="display:none">${_campoRadio(3)}</div>
  `;
}

function _bloqueColores(pfx) {
  return `
    <div class="fila-2">
      <label class="campo">Fondo<input id="${pfx}-fondo" type="color" value="#ffffff"></label>
      <label class="campo">Texto<input id="${pfx}-color" type="color" value="#000000"></label>
    </div>`;
}

function _enlazarRadioToggle(pfx) {
  const formaSel = document.getElementById(`${pfx}-forma`);
  const wrap = document.getElementById(`${pfx}-radio-wrap`);
  const actualizar = () => (wrap.style.display = formaSel.value === "redondeado" ? "" : "none");
  formaSel.onchange = actualizar;
  actualizar();
}

let _logoIdPendiente = null;

function _enlazarFormAgregar() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("activo"));
      btn.classList.add("activo");
      ["texto", "lista", "logo"].forEach((t) => {
        document.getElementById(`f-${t}`).style.display = t === btn.dataset.tab ? "" : "none";
      });
    };
  });

  _enlazarRadioToggle("t");
  _enlazarRadioToggle("l");
  _enlazarRadioToggle("g");

  document.getElementById("f-texto").onsubmit = (e) => {
    e.preventDefault();
    const w = Number(document.getElementById("t-w").value);
    const h = Number(document.getElementById("t-h").value);
    const boton = {
      id: uid(),
      forma: document.getElementById("t-forma").value,
      radioMm: Number(document.getElementById("c-radio")?.value) || 3,
      w, h,
      fondo: document.getElementById("t-fondo").value,
      color: document.getElementById("t-color").value,
      contenido: {
        tipo: "texto",
        arribaSingular: document.getElementById("t-arriba-s").value,
        arribaPlural: document.getElementById("t-arriba-p").value,
        numero: document.getElementById("t-numero").value === "" ? null : Number(document.getElementById("t-numero").value),
        abajoSingular: document.getElementById("t-abajo-s").value,
        abajoPlural: document.getElementById("t-abajo-p").value,
      },
    };
    const pos = empacarPosicion(_hojaActual().botones, w, h);
    boton.x = pos.x;
    boton.y = pos.y;
    S = Store.agregarBoton(_hojaActual().id, boton);
    _renderHoja();
    toast("Botón agregado.");
  };

  document.getElementById("f-lista").onsubmit = (e) => {
    e.preventDefault();
    const numeros = parseListaNumeros(document.getElementById("l-lista").value);
    if (!numeros.length) return toast("Ingresá al menos un número (ej: 1, 2, 3).");
    const w = Number(document.getElementById("l-w").value);
    const h = Number(document.getElementById("l-h").value);
    const base = {
      forma: document.getElementById("l-forma").value,
      radioMm: Number(document.getElementById("c-radio")?.value) || 3,
      w, h,
      fondo: document.getElementById("l-fondo").value,
      color: document.getElementById("l-color").value,
    };
    const arribaS = document.getElementById("l-arriba-s").value;
    const arribaP = document.getElementById("l-arriba-p").value;
    const abajoS = document.getElementById("l-abajo-s").value;
    const abajoP = document.getElementById("l-abajo-p").value;
    numeros.forEach((n) => {
      const boton = {
        id: uid(), ...base,
        contenido: { tipo: "texto", arribaSingular: arribaS, arribaPlural: arribaP, numero: n, abajoSingular: abajoS, abajoPlural: abajoP },
      };
      const pos = empacarPosicion(_hojaActual().botones, w, h);
      boton.x = pos.x;
      boton.y = pos.y;
      S = Store.agregarBoton(_hojaActual().id, boton);
    });
    _renderHoja();
    toast(`${numeros.length} botones generados.`);
  };

  _renderLogosExistentes();

  document.getElementById("g-file").onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      _logoIdPendiente = Store.agregarLogo(reader.result);
      document.getElementById("g-submit").disabled = false;
      _renderLogosExistentes();
      toast("Imagen cargada.");
    };
    reader.readAsDataURL(file);
  };

  document.getElementById("f-logo").onsubmit = (e) => {
    e.preventDefault();
    if (!_logoIdPendiente) return toast("Subí o elegí una imagen primero.");
    const w = Number(document.getElementById("g-w").value);
    const h = Number(document.getElementById("g-h").value);
    const boton = {
      id: uid(),
      forma: document.getElementById("g-forma").value,
      radioMm: Number(document.getElementById("c-radio")?.value) || 3,
      w, h,
      fondo: document.getElementById("g-fondo").value,
      color: "#000000",
      contenido: { tipo: "logo", logoId: _logoIdPendiente, zoom: 1, offsetX: 0, offsetY: 0 },
    };
    const pos = empacarPosicion(_hojaActual().botones, w, h);
    boton.x = pos.x;
    boton.y = pos.y;
    S = Store.agregarBoton(_hojaActual().id, boton);
    _renderHoja();
    toast("Botón agregado.");
  };
}

function _renderLogosExistentes() {
  const cont = document.getElementById("g-existentes");
  const ids = Object.keys(S.logos);
  if (!ids.length) { cont.innerHTML = ""; return; }
  cont.innerHTML = `<div class="muted" style="margin:6px 0 4px">o reusar una ya subida:</div>
    <div class="logos-grid">${ids.map((id) => `<img src="${S.logos[id]}" data-logo-id="${id}" class="logo-thumb">`).join("")}</div>`;
  cont.querySelectorAll(".logo-thumb").forEach((img) => {
    img.onclick = () => {
      _logoIdPendiente = img.dataset.logoId;
      cont.querySelectorAll(".logo-thumb").forEach((x) => x.classList.toggle("elegido", x === img));
      document.getElementById("g-submit").disabled = false;
    };
  });
}

// ---------- Editar botón seleccionado ----------

function _formEditar(b) {
  const c = b.contenido;
  const esLogo = c.tipo === "logo";
  return `
    <div class="panel-header">
      <h3>Editar botón</h3>
      <button class="btn sm sec" id="e-cerrar">✕ Cerrar</button>
    </div>
    <div class="panel-form">
      <div class="fila-2">
        <label class="campo">Ancho (mm)<input id="e-w" type="number" min="5" step="0.5" value="${b.w}"></label>
        <label class="campo">Alto (mm)<input id="e-h" type="number" min="5" step="0.5" value="${b.h}"></label>
      </div>
      <label class="campo">Forma ${_selectForma("e-forma", b.forma)}</label>
      <div id="e-radio-wrap" style="display:${b.forma === "redondeado" ? "" : "none"}">${_campoRadio(b.radioMm)}</div>
      <div class="fila-2">
        <label class="campo">Fondo<input id="e-fondo" type="color" value="${b.fondo}"></label>
        <label class="campo">Texto<input id="e-color" type="color" value="${b.color}" ${esLogo ? "disabled" : ""}></label>
      </div>
      ${esLogo ? _bloqueEdicionLogo(c) : _bloqueEdicionTexto(c)}
      <div class="fila-2">
        <button class="btn" id="e-duplicar">Duplicar</button>
        <button class="btn sec" id="e-eliminar">Eliminar</button>
      </div>
    </div>`;
}

function _bloqueEdicionTexto(c) {
  return `
    <label class="campo">Texto arriba (singular)<input id="e-arriba-s" value="${esc(c.arribaSingular || "")}"></label>
    <label class="campo">Texto arriba (plural)<input id="e-arriba-p" value="${esc(c.arribaPlural || "")}"></label>
    <label class="campo">Número grande<input id="e-numero" type="number" value="${c.numero ?? ""}"></label>
    <label class="campo">Texto abajo (singular)<input id="e-abajo-s" value="${esc(c.abajoSingular || "")}"></label>
    <label class="campo">Texto abajo (plural)<input id="e-abajo-p" value="${esc(c.abajoPlural || "")}"></label>
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
  const persistir = () => Store.guardar();

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
    ["arriba-s", "arriba-p", "abajo-s", "abajo-p"].forEach((campo) => {
      const input = document.getElementById(`e-${campo}`);
      input.oninput = (e) => {
        if (campo === "arriba-s") b.contenido.arribaSingular = e.target.value;
        if (campo === "arriba-p") b.contenido.arribaPlural = e.target.value;
        if (campo === "abajo-s") b.contenido.abajoSingular = e.target.value;
        if (campo === "abajo-p") b.contenido.abajoPlural = e.target.value;
        refrescar();
      };
      input.onchange = persistir;
    });
    document.getElementById("e-numero").oninput = (e) => {
      b.contenido.numero = e.target.value === "" ? null : Number(e.target.value);
      refrescar();
    };
    document.getElementById("e-numero").onchange = persistir;
  }
}
