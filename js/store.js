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

  const deshacerPila = [];
  const rehacerPila = [];
  const limiteHistorial = 15;
  let _estado = null;
  let guardado = "";
  let anteriorPendiente = null;

  function persistir(json) {
    try {
      localStorage.setItem(KEY, json);
      return true;
    } catch (e) {
      toast("No se pudo guardar. Revisa el espacio disponible del navegador.");
      return false;
    }
  }

  function cerrarCambio() {
    if (anteriorPendiente === null) return;
    if (anteriorPendiente !== guardado) {
      deshacerPila.push(anteriorPendiente);
      if (deshacerPila.length > limiteHistorial) deshacerPila.shift();
      rehacerPila.length = 0;
    }
    anteriorPendiente = null;
  }

  function _guardar(estado, registrar = true, exigirPersistencia = false) {
    const json = JSON.stringify(estado);
    if (json === guardado) return estado;
    if (exigirPersistencia && !persistir(json)) return null;
    if (registrar && anteriorPendiente === null) {
      anteriorPendiente = guardado;
      queueMicrotask(cerrarCambio);
    }
    guardado = json;
    if (!exigirPersistencia) persistir(json);
    return estado;
  }

  function _recuperar(origen, destino) {
    cerrarCambio();
    if (!origen.length) return null;
    const siguiente = origen.pop();
    destino.push(guardado);
    return _guardar(_estado = JSON.parse(siguiente), false);
  }

  function deshacer() { return _recuperar(deshacerPila, rehacerPila); }
  function rehacer() { return _recuperar(rehacerPila, deshacerPila); }

  function init() {
    _estado = _leer();
    guardado = JSON.stringify(_estado);
    anteriorPendiente = null;
    deshacerPila.length = rehacerPila.length = 0;
    return _estado;
  }

  function hojaActual() {
    return _estado.hojas.find((h) => h.id === _estado.hojaActualId) || _estado.hojas[0];
  }

  function setHojaActual(id) {
    cerrarCambio();
    _estado.hojaActualId = id;
    return _guardar(_estado, false);
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
        (b.contenido?.bloques || []).forEach((bloque) => {
          if (bloque.tipo === "logo" && bloque.logoId) usados.add(bloque.logoId);
        });
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

  function esRegistro(valor) {
    return valor !== null && typeof valor === "object" && !Array.isArray(valor);
  }

  function validarObjeto(valor, etiqueta) {
    if (!esRegistro(valor)) throw new Error(`Falta un objeto válido en ${etiqueta}.`);
  }

  function validarCampos(objeto, etiqueta) {
    const numeros = ["x", "y", "w", "h", "radioMm", "paddingHMm", "paddingVMm",
      "offsetX", "offsetY", "zoom", "anchoMm", "altoMm", "ancho", "tam", "giro"];
    for (const campo of numeros) {
      if (objeto[campo] != null && !Number.isFinite(objeto[campo])) {
        throw new Error(`El campo ${campo} de ${etiqueta} debe ser un número.`);
      }
    }
    for (const campo of ["fondo", "color"]) {
      if (objeto[campo] != null && !/^#[\da-f]{6}$/i.test(objeto[campo])) {
        throw new Error(`El campo ${campo} de ${etiqueta} debe ser un color hexadecimal.`);
      }
    }
  }

  function validarBoton(boton, etiqueta) {
    validarObjeto(boton, etiqueta);
    validarCampos(boton, etiqueta);
    if (![boton.x, boton.y, boton.w, boton.h].every(Number.isFinite) || boton.w <= 0 || boton.h <= 0) {
      throw new Error(`La posición o el tamaño de un botón de ${etiqueta} no es válido.`);
    }
    const contenido = boton.contenido;
    validarObjeto(contenido, `el contenido de un botón de ${etiqueta}`);
    if (contenido.tipo !== undefined && !["texto", "logo"].includes(contenido.tipo)) {
      throw new Error(`Hay un botón de tipo desconocido en ${etiqueta}.`);
    }
    validarCampos(contenido, etiqueta);
    if (contenido.bloques != null && !Array.isArray(contenido.bloques)) {
      throw new Error(`Los bloques de un botón de ${etiqueta} deben ser una lista.`);
    }
    (contenido.bloques || []).forEach((bloque) => {
      validarObjeto(bloque, `un bloque de ${etiqueta}`);
      validarCampos(bloque, etiqueta);
    });
    if (contenido.composicionLibre && contenido.bloques == null) contenido.bloques = [];
    if (contenido.tipo === undefined) contenido.tipo = contenido.logoId ? "logo" : "texto";
  }

  function listaImportada(valor, etiqueta) {
    if (valor == null) return [];
    if (!Array.isArray(valor)) throw new Error(`La sección ${etiqueta} debe ser una lista.`);
    return valor;
  }

  function validarProyecto(nuevo) {
    validarObjeto(nuevo, "el proyecto");
    if (!Array.isArray(nuevo.hojas) || !nuevo.hojas.length) {
      throw new Error("El respaldo debe contener al menos una hoja.");
    }
    nuevo.hojas.forEach((hoja) => {
      validarObjeto(hoja, "una hoja");
      if (typeof hoja.nombre !== "string" || !Array.isArray(hoja.botones)) {
        throw new Error("Cada hoja debe tener un nombre y una lista de botones.");
      }
      hoja.botones.forEach((boton) => validarBoton(boton, hoja.nombre));
    });
    if (nuevo.config != null) {
      validarObjeto(nuevo.config, "la configuración");
      if (nuevo.config.ultimoUsado != null) {
        validarObjeto(nuevo.config.ultimoUsado, "el último formato usado");
        validarCampos(nuevo.config.ultimoUsado, "el último formato usado");
      }
      listaImportada(nuevo.config.juegos, "juegos").forEach((juego) => {
        validarObjeto(juego, "un juego");
        if (typeof juego.nombre !== "string" || !Array.isArray(juego.botones)) {
          throw new Error("Cada juego debe tener un nombre y una lista de botones.");
        }
        juego.botones.forEach((boton) => validarBoton(boton, juego.nombre));
      });
    }
    if (nuevo.panel != null) {
      validarObjeto(nuevo.panel, "el panel");
      validarCampos(nuevo.panel, "el panel");
      if (nuevo.panel.celdas != null) {
        validarObjeto(nuevo.panel.celdas, "las celdas del panel");
        Object.values(nuevo.panel.celdas).forEach((celda) => validarObjeto(celda, "una celda del panel"));
      }
    }
    listaImportada(nuevo.plantillas, "plantillas").forEach((plantilla) => {
      validarObjeto(plantilla, "una plantilla");
      if (typeof plantilla.nombre !== "string") throw new Error("Cada plantilla debe tener un nombre.");
      validarCampos(plantilla, plantilla.nombre);
    });
    return _completar(nuevo);
  }

  function copiarLogos(logos, destino) {
    if (logos != null) validarObjeto(logos, "las imágenes");
    const porImagen = new Map(Object.entries(destino).map(([id, imagen]) => [imagen, id]));
    const ids = new Map();
    for (const [anterior, imagen] of Object.entries(logos ?? {})) {
      if (typeof imagen !== "string" || !/^data:image\/[a-z0-9.+-]+;base64,[a-z\d+/]+={0,2}$/i.test(imagen)) {
        throw new Error("El respaldo contiene una imagen sin un formato compatible.");
      }
      let id = porImagen.get(imagen);
      if (!id) {
        id = uid();
        destino[id] = imagen;
        porImagen.set(imagen, id);
      }
      ids.set(anterior, id);
    }
    return ids;
  }

  function copiarBotones(botones, logos) {
    const grupos = new Map();
    return botones.map((boton) => {
      const contenido = { ...boton.contenido };
      if (contenido.logoId != null) contenido.logoId = logos.get(String(contenido.logoId)) || "";
      if (Array.isArray(contenido.bloques)) {
        contenido.bloques = contenido.bloques.map((bloque) => {
          const copia = { ...bloque };
          if (copia.logoId != null) copia.logoId = logos.get(String(copia.logoId)) || "";
          return copia;
        });
      }
      const copia = { ...boton, id: uid(), contenido };
      if (boton.grupoId) {
        if (!grupos.has(boton.grupoId)) grupos.set(boton.grupoId, uid());
        copia.grupoId = grupos.get(boton.grupoId);
      }
      return copia;
    });
  }

  function asignarNombre(nombre, usados) {
    let candidato = nombre;
    for (let numero = 2; usados.has(candidato.toLowerCase()); numero++) {
      candidato = `${nombre} (${numero})`;
    }
    usados.add(candidato.toLowerCase());
    return candidato;
  }

  function importarJSON(json, modo) {
    let nuevo;
    try {
      nuevo = JSON.parse(json);
    } catch (e) {
      toast("El archivo no es un JSON válido.");
      return null;
    }

    try {
      validarProyecto(nuevo);
      const agregar = modo === "agregar";
      const logos = agregar ? { ..._estado.logos } : {};
      const idsLogo = copiarLogos(nuevo.logos, logos);

      const hojas = agregar ? [..._estado.hojas] : [];
      const nombresHojas = new Set(hojas.map((h) => h.nombre.toLowerCase()));
      const nuevas = nuevo.hojas.map((h) => ({
        ...h,
        id: uid(),
        nombre: agregar ? asignarNombre(h.nombre, nombresHojas) : h.nombre,
        botones: copiarBotones(h.botones, idsLogo),
      }));
      const indice = nuevo.hojas.findIndex((h) => h.id === nuevo.hojaActualId);
      const hojaActualId = nuevas[Math.max(0, indice)].id;

      const plantillas = agregar ? [..._estado.plantillas] : [];
      const nombresPlantillas = new Set(plantillas.map((p) => p.nombre.toLowerCase()));
      listaImportada(nuevo.plantillas, "plantillas").forEach((p) => plantillas.push({
        ...p, id: uid(), nombre: agregar ? asignarNombre(p.nombre, nombresPlantillas) : p.nombre,
      }));

      const juegos = agregar ? [...(_estado.config.juegos || [])] : [];
      const nombresJuegos = new Set(juegos.map((j) => j.nombre.toLowerCase()));
      listaImportada(nuevo.config.juegos, "juegos").forEach((j) => {
        const imagenes = {};
        const ids = copiarLogos(j.logos, imagenes);
        juegos.push({
          ...j, id: uid(),
          nombre: agregar ? asignarNombre(j.nombre, nombresJuegos) : j.nombre,
          botones: copiarBotones(j.botones, ids), logos: imagenes,
        });
      });

      const base = agregar ? _estado : nuevo;
      const config = { ...base.config, juegos };
      const estado = { ...base, config, logos, hojas: [...hojas, ...nuevas], hojaActualId, plantillas };
      const guardado = _guardar(estado, true, true);
      if (guardado) _estado = guardado;
      return guardado;
    } catch (e) {
      toast(e.message || "El archivo no tiene el formato esperado.");
      return null;
    }
  }

  return {
    init, hojaActual, setHojaActual, guardar, actualizarUltimoUsado, deshacer, rehacer,
    crearHoja, renombrarHoja, eliminarHoja, duplicarHoja,
    agregarBoton, actualizarBoton, eliminarBoton, duplicarBoton,
    agregarLogo, eliminarLogosNoUsados,
    guardarPlantilla, eliminarPlantilla,
    panelCelda, actualizarPanelCelda, reiniciarPanel, panelConfig, actualizarPanelConfig,
    exportarJSON, importarJSON,
  };
})();
