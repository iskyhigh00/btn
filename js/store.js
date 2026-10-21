// Único dueño de la persistencia (localStorage). No hay backend: todo el
// estado vive acá. Store.init() carga (con defaults si no hay nada guardado)
// y cada Store.setX()/crearX()/etc. mezcla el cambio, guarda, y devuelve el
// estado completo.
const Store = (function () {
  const KEY = "botonera_estado";

  function _ultimoUsadoDefault() {
    return { arriba: "", abajo: "", numeroPrefijo: "", forma: "cuadrado", w: 40, h: 40, radioMm: 3, paddingHMm: 3, paddingVMm: 3, fondo: "#ffffff", color: "#000000" };
  }

  function _defaults() {
    const hojaId = uid();
    return {
      config: { margenMm: 1.2, ultimoUsado: _ultimoUsadoDefault() },
      logos: {}, // { [logoId]: dataURL }
      plantillas: [], // { id, nombre, w, h, forma, radioMm } - tamaños con nombre (ej: "MK6", "BB1")
      panel: { celdas: {} }, // solo lo editable del panel fijo: { [celdaId]: { top, tam_top, numero, ... } }
      hojaActualId: hojaId,
      hojas: [{ id: hojaId, nombre: "Hoja 1", botones: [] }],
    };
  }

  // Completa config/ultimoUsado/plantillas/panel si vienen de una versión
  // anterior (o de un JSON importado) sin esos campos.
  function _completar(estado) {
    estado.config = { ..._defaults().config, ...estado.config };
    estado.config.ultimoUsado = { ..._ultimoUsadoDefault(), ...estado.config.ultimoUsado };
    estado.plantillas = estado.plantillas || [];
    estado.panel = estado.panel || {};
    estado.panel.celdas = estado.panel.celdas || {};
    return estado;
  }

  function _leer() {
    try {
      const raw = localStorage.getItem(KEY);
      return _completar(raw ? JSON.parse(raw) : _defaults());
    } catch (e) {
      return _defaults();
    }
  }

  function _guardar(estado) {
    try {
      localStorage.setItem(KEY, JSON.stringify(estado));
    } catch (e) {
      toast("No se pudo guardar (¿localStorage lleno? probá borrar algún logo).");
    }
    return estado;
  }

  let _estado = null;

  function init() {
    _estado = _leer();
    return _estado;
  }

  function hojaActual() {
    return _estado.hojas.find((h) => h.id === _estado.hojaActualId) || _estado.hojas[0];
  }

  function setHojaActual(id) {
    _estado.hojaActualId = id;
    return _guardar(_estado);
  }

  function crearHoja(nombre) {
    const h = { id: uid(), nombre: nombre || `Hoja ${_estado.hojas.length + 1}`, botones: [] };
    _estado.hojas.push(h);
    _estado.hojaActualId = h.id;
    return _guardar(_estado);
  }

  function renombrarHoja(id, nombre) {
    const h = _estado.hojas.find((x) => x.id === id);
    if (h) h.nombre = nombre;
    return _guardar(_estado);
  }

  function eliminarHoja(id) {
    _estado.hojas = _estado.hojas.filter((h) => h.id !== id);
    if (!_estado.hojas.length) {
      const h = { id: uid(), nombre: "Hoja 1", botones: [] };
      _estado.hojas.push(h);
    }
    if (_estado.hojaActualId === id) _estado.hojaActualId = _estado.hojas[0].id;
    return _guardar(_estado);
  }

  function duplicarHoja(id) {
    const h = _estado.hojas.find((x) => x.id === id);
    if (!h) return _estado;
    const copia = JSON.parse(JSON.stringify(h));
    copia.id = uid();
    copia.nombre = `${h.nombre} (copia)`;
    copia.botones.forEach((b) => (b.id = uid()));
    _estado.hojas.push(copia);
    _estado.hojaActualId = copia.id;
    return _guardar(_estado);
  }

  function agregarBoton(hojaId, boton) {
    const h = _estado.hojas.find((x) => x.id === hojaId);
    if (!h) return _estado;
    h.botones.push(boton);
    return _guardar(_estado);
  }

  function actualizarBoton(hojaId, botonId, cambios) {
    const h = _estado.hojas.find((x) => x.id === hojaId);
    if (!h) return _estado;
    const b = h.botones.find((x) => x.id === botonId);
    if (b) Object.assign(b, cambios);
    return _guardar(_estado);
  }

  function eliminarBoton(hojaId, botonId) {
    const h = _estado.hojas.find((x) => x.id === hojaId);
    if (!h) return _estado;
    h.botones = h.botones.filter((b) => b.id !== botonId);
    return _guardar(_estado);
  }

  function duplicarBoton(hojaId, botonId) {
    const h = _estado.hojas.find((x) => x.id === hojaId);
    if (!h) return _estado;
    const b = h.botones.find((x) => x.id === botonId);
    if (!b) return _estado;
    const copia = JSON.parse(JSON.stringify(b));
    copia.id = uid();
    delete copia.grupoId; // se independiza del grupo original
    const pos = empacarPosicion(h.botones, copia.w, copia.h);
    copia.x = pos.x;
    copia.y = pos.y;
    h.botones.push(copia);
    return _guardar(_estado);
  }

  // Plantillas de tamaño con nombre (ej: "MK6", "BB1"): mismo formato de
  // botón reutilizable entre distintas máquinas/juegos.
  function guardarPlantilla(nombre, datos) {
    const nombreLimpio = String(nombre ?? "").trim();
    if (!nombreLimpio) return _estado;
    const existente = _estado.plantillas.find((p) => p.nombre.toLowerCase() === nombreLimpio.toLowerCase());
    if (existente) Object.assign(existente, datos, { nombre: nombreLimpio });
    else _estado.plantillas.push({ id: uid(), nombre: nombreLimpio, ...datos });
    return _guardar(_estado);
  }

  function eliminarPlantilla(id) {
    _estado.plantillas = _estado.plantillas.filter((p) => p.id !== id);
    return _guardar(_estado);
  }

  // Persiste el estado actual tal cual está (para cuando el código de la vista
  // ya mutó un objeto de _estado directamente, por ejemplo durante un drag).
  function guardar() {
    return _guardar(_estado);
  }

  // Recuerda los últimos valores usados al crear/editar un botón, para
  // precargarlos la próxima vez y no tener que reescribirlos.
  function actualizarUltimoUsado(cambios) {
    Object.entries(cambios).forEach(([k, v]) => {
      if (v !== undefined) _estado.config.ultimoUsado[k] = v;
    });
    return _guardar(_estado);
  }

  function agregarLogo(dataURL) {
    const id = uid();
    _estado.logos[id] = dataURL;
    _guardar(_estado);
    return id;
  }

  function eliminarLogosNoUsados() {
    const usados = new Set();
    _estado.hojas.forEach((h) =>
      h.botones.forEach((b) => {
        if (b.contenido?.tipo === "logo" && b.contenido.logoId) usados.add(b.contenido.logoId);
      })
    );
    Object.keys(_estado.logos).forEach((id) => {
      if (!usados.has(id)) delete _estado.logos[id];
    });
    return _guardar(_estado);
  }

  // Panel fijo: solo se guardan textos y tamaños por celda; null borra el
  // valor guardado (vuelve al original).
  function panelCelda(id) {
    return _estado.panel.celdas[id] || {};
  }

  function actualizarPanelCelda(id, cambios) {
    const actual = { ...(_estado.panel.celdas[id] || {}) };
    Object.entries(cambios).forEach(([k, v]) => {
      if (v === null) delete actual[k];
      else actual[k] = v;
    });
    if (Object.keys(actual).length) _estado.panel.celdas[id] = actual;
    else delete _estado.panel.celdas[id];
    return _guardar(_estado);
  }

  function reiniciarPanel(id) {
    if (id) delete _estado.panel.celdas[id];
    else {
      _estado.panel.celdas = {};
      ["anchoMm", "altoMm", "proporcion"].forEach((k) => delete _estado.panel[k]);
    }
    return _guardar(_estado);
  }

  // Tamaño del panel completo (mm); sin valor guardado se usa el original.
  function panelConfig() {
    const p = _estado.panel;
    return { anchoMm: p.anchoMm || null, altoMm: p.altoMm || null, proporcion: p.proporcion !== false };
  }

  function actualizarPanelConfig(cambios) {
    Object.entries(cambios).forEach(([k, v]) => {
      if (v === null) delete _estado.panel[k];
      else _estado.panel[k] = v;
    });
    return _guardar(_estado);
  }

  function exportarJSON() {
    return JSON.stringify(_estado, null, 2);
  }

  function importarJSON(json, modo) {
    let nuevo;
    try {
      nuevo = JSON.parse(json);
    } catch (e) {
      toast("El archivo no es un JSON válido.");
      return _estado;
    }
    if (!nuevo || !Array.isArray(nuevo.hojas)) {
      toast("El JSON no tiene el formato esperado.");
      return _estado;
    }
    if (modo === "reemplazar") {
      _estado = _completar(nuevo);
    } else {
      // agregar: mete las hojas nuevas y sus logos, sin pisar lo existente
      nuevo.hojas.forEach((h) => _estado.hojas.push(h));
      Object.assign(_estado.logos, nuevo.logos || {});
      _estado.hojaActualId = nuevo.hojas[0]?.id || _estado.hojaActualId;
    }
    return _guardar(_estado);
  }

  return {
    init, hojaActual, setHojaActual, guardar, actualizarUltimoUsado,
    crearHoja, renombrarHoja, eliminarHoja, duplicarHoja,
    agregarBoton, actualizarBoton, eliminarBoton, duplicarBoton,
    agregarLogo, eliminarLogosNoUsados,
    guardarPlantilla, eliminarPlantilla,
    panelCelda, actualizarPanelCelda, reiniciarPanel, panelConfig, actualizarPanelConfig,
    exportarJSON, importarJSON,
  };
})();
