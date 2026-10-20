// Helpers puros / lógica de negocio. No toca el DOM directamente (eso vive en
// vistas.js). Todo lo que exponga este archivo queda disponible en el mismo
// scope global para vistas.js y app.js (sin imports, scripts clásicos).
const APP_VERSION = "0.10.1";

// Tamaño de hoja carta en mm y margen de seguridad para las marcas de corte.
const HOJA_ANCHO_MM = 215.9;
const HOJA_ALTO_MM = 279.4;
const CORTE_GAP_MM = 0.6;
const CORTE_LARGO_MM = 3;
const CORTE_GROSOR_MM = 0.15;
const PX_POR_MM = 96 / 25.4;
// Separación por defecto entre botones: 0 para que queden pegados y un solo
// corte (guillotina o el propio borde impreso del botón) separe a los dos
// lados de una sola pasada, en vez de dejar una tira de papel en blanco para
// recortar. Las marcas de esquina entre botones pegados quedan tapadas por
// el vecino (no hacen falta ahí: el borde impreso ya marca el corte); siguen
// viéndose en los bordes que dan a un espacio libre.
const SEPARACION_MM = 0;
// Margen entre el bloque de botones y el borde físico de la hoja (distinto
// de la separación entre botones, que es 0): dejar aire para manipular la
// hoja/guillotina y por si la impresora no llega a imprimir hasta el borde.
const MARGEN_HOJA_MM = 8;

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function toast(msg, duracionMs) {
  const cont = document.getElementById("toasts");
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  cont.appendChild(t);
  setTimeout(() => t.remove(), duracionMs || 2200);
}

// Toast con un botón de acción (ej. "Deshacer") para operaciones sin
// confirmación previa, tipo borrar con la tecla Supr.
function toastAccion(msg, textoAccion, accionFn, duracionMs) {
  const cont = document.getElementById("toasts");
  const t = document.createElement("div");
  t.className = "toast toast-accion";
  const span = document.createElement("span");
  span.textContent = msg;
  const btn = document.createElement("button");
  btn.className = "btn sm";
  btn.textContent = textoAccion;
  btn.onclick = () => { accionFn(); t.remove(); };
  t.append(span, btn);
  cont.appendChild(t);
  setTimeout(() => t.remove(), duracionMs || 6000);
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Pluraliza automáticamente una palabra en español (heurística simple, cubre
// los casos comunes: vocal->+S, "Z"->"CES", consonante->+ES).
function autoPluralizar(palabra) {
  const p = String(palabra ?? "");
  if (!p.trim()) return p;
  const ultima = p.slice(-1).toLowerCase();
  if ("aeiouáéíóú".includes(ultima)) return p + "S";
  if (ultima === "z") return p.slice(0, -1) + "ces";
  return p + "ES";
}

// Según el número (1 -> singular tal cual, cualquier otro valor -> plural
// automático), o el texto sin cambios si no hay número. El plural nunca se
// pide al usuario: se calcula solo.
function pluralizar(numero, texto) {
  if (numero == null || numero === "") return texto || "";
  return Math.abs(Number(numero)) === 1 ? (texto || "") : autoPluralizar(texto);
}

// border-radius efectivo según la forma del botón.
function formaRadioCss(boton) {
  switch (boton.forma) {
    case "circulo":
    case "ovalo":
      return "50%";
    case "redondeado":
      return `${Number(boton.radioMm) || 0}mm`;
    default:
      return "0";
  }
}

// Busca la próxima posición libre en la hoja usando un acomodo tipo "estantes":
// llena la fila de izquierda a derecha, salta de fila cuando no entra más.
function empacarPosicion(botonesExistentes, w, h, gapMm) {
  const gap = gapMm ?? SEPARACION_MM;
  const margen = MARGEN_HOJA_MM;
  let cursorX = margen;
  let cursorY = margen;
  let altoFila = 0;

  // Si no hay botones, arranca en la esquina superior izquierda (con margen).
  if (!botonesExistentes.length) return { x: margen, y: margen };

  // Reconstruye el "estante" actual a partir del último botón agregado.
  const ultimo = botonesExistentes[botonesExistentes.length - 1];
  cursorX = ultimo.x + ultimo.w + gap;
  cursorY = ultimo.y;
  altoFila = Math.max(...botonesExistentes.map((b) => (b.y === ultimo.y ? b.h : 0)));

  if (cursorX + w > HOJA_ANCHO_MM - margen) {
    cursorX = margen;
    cursorY = ultimo.y + altoFila + gap;
  }
  if (cursorY + h > HOJA_ALTO_MM - margen) {
    // No entra más en la hoja: se apila igual al final para que el usuario la reordene a mano.
    toast("El botón no entra en el espacio libre de la hoja: acomodalo a mano.");
  }
  return { x: cursorX, y: cursorY };
}

// Genera los segmentos (en mm, relativos a la hoja) de las marcas de corte
// tipo "escuadra" en las 4 esquinas de un botón, para guiar la guillotina.
function marcasDeCorteBoton(boton) {
  const { x, y, w, h } = boton;
  const esquinas = [
    { px: x, py: y, dx: -1, dy: -1 },
    { px: x + w, py: y, dx: 1, dy: -1 },
    { px: x, py: y + h, dx: -1, dy: 1 },
    { px: x + w, py: y + h, dx: 1, dy: 1 },
  ];
  const segmentos = [];
  for (const e of esquinas) {
    // Tick horizontal
    segmentos.push({
      x: e.dx < 0 ? e.px - CORTE_GAP_MM - CORTE_LARGO_MM : e.px + CORTE_GAP_MM,
      y: e.py - CORTE_GROSOR_MM / 2,
      w: CORTE_LARGO_MM,
      h: CORTE_GROSOR_MM,
    });
    // Tick vertical
    segmentos.push({
      x: e.px - CORTE_GROSOR_MM / 2,
      y: e.dy < 0 ? e.py - CORTE_GAP_MM - CORTE_LARGO_MM : e.py + CORTE_GAP_MM,
      w: CORTE_GROSOR_MM,
      h: CORTE_LARGO_MM,
    });
  }
  return segmentos;
}

// Marcas en los 4 bordes físicos de la hoja (una por cada línea de corte
// distinta que usan los botones), para alinear la guillotina directamente
// contra el borde del papel en vez de tener que ubicarla a ojo en el medio
// de la hoja.
function marcasDeBordeHoja(botones) {
  const ys = new Set();
  const xs = new Set();
  botones.forEach((b) => {
    ys.add(Math.round(b.y * 100) / 100);
    ys.add(Math.round((b.y + b.h) * 100) / 100);
    xs.add(Math.round(b.x * 100) / 100);
    xs.add(Math.round((b.x + b.w) * 100) / 100);
  });
  const segmentos = [];
  ys.forEach((y) => {
    segmentos.push({ x: 0, y: y - CORTE_GROSOR_MM / 2, w: CORTE_LARGO_MM, h: CORTE_GROSOR_MM });
    segmentos.push({ x: HOJA_ANCHO_MM - CORTE_LARGO_MM, y: y - CORTE_GROSOR_MM / 2, w: CORTE_LARGO_MM, h: CORTE_GROSOR_MM });
  });
  xs.forEach((x) => {
    segmentos.push({ x: x - CORTE_GROSOR_MM / 2, y: 0, w: CORTE_GROSOR_MM, h: CORTE_LARGO_MM });
    segmentos.push({ x: x - CORTE_GROSOR_MM / 2, y: HOJA_ALTO_MM - CORTE_LARGO_MM, w: CORTE_GROSOR_MM, h: CORTE_LARGO_MM });
  });
  return segmentos;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

// Junta en un mismo "bloque" los botones que se puedan cortar juntos con
// líneas rectas compartidas: los de un mismo grupo (lista de números) o,
// si están sueltos, los que compartan tamaño y forma exactos.
function _agruparEnBloques(botones) {
  const porClave = new Map();
  botones.forEach((b) => {
    const clave = b.grupoId || `${b.w}x${b.h}x${b.forma}`;
    if (!porClave.has(clave)) porClave.set(clave, []);
    porClave.get(clave).push(b);
  });
  return [...porClave.values()];
}

// Acomoda los miembros de un bloque (todos del mismo w/h) en una grilla:
// usa tantas columnas como entren en el ancho de la hoja (una sola fila si
// caben todos) y recién pasa a más filas cuando no entran, para que un corte
// recto separe a varios botones de una sola vez en vez de uno por uno.
function _armarGrillaBloque(miembros, gap) {
  miembros.sort((a, b) => (a.contenido?.numero ?? 0) - (b.contenido?.numero ?? 0));
  const n = miembros.length;
  const w = miembros[0].w, h = miembros[0].h;
  const anchoDisponible = HOJA_ANCHO_MM - 2 * MARGEN_HOJA_MM;
  const colsQueEntran = Math.max(1, Math.floor((anchoDisponible + gap) / (w + gap)));
  const cols = Math.min(n, colsQueEntran);
  return {
    ancho: cols * w + (cols - 1) * gap,
    alto: Math.ceil(n / cols) * h + (Math.ceil(n / cols) - 1) * gap,
    colocar(offsetX, offsetY) {
      miembros.forEach((b, i) => {
        b.x = offsetX + (i % cols) * (w + gap);
        b.y = offsetY + Math.floor(i / cols) * (h + gap);
      });
    },
  };
}

// Reacomoda todos los botones de una hoja agrupando los de igual tamaño en
// grillas cuadradas y esas grillas en filas prolijas, para que se pueda
// cortar con guillotina: cortes rectos que separan varios botones a la vez.
// Muta boton.x/boton.y de cada botón recibido.
function reorganizarBotones(botones, gapMm) {
  const gap = gapMm ?? SEPARACION_MM;
  const margen = MARGEN_HOJA_MM;
  const bloques = _agruparEnBloques(botones).map((miembros) => _armarGrillaBloque(miembros, gap));
  bloques.sort((a, b) => b.alto - a.alto || b.ancho - a.ancho);
  let x = margen, y = margen, altoFila = 0;
  bloques.forEach((caja) => {
    if (x + caja.ancho > HOJA_ANCHO_MM - margen) {
      x = margen;
      y += altoFila + gap;
      altoFila = 0;
    }
    caja.colocar(x, y);
    x += caja.ancho + gap;
    altoFila = Math.max(altoFila, caja.alto);
  });
}

// ---------- Panel fijo (pestaña "Panel") ----------
// Réplica de un panel de botones de una máquina. El diseño (posiciones,
// colores, bordes, fondo) vive acá en código y NO es editable: lo único que
// guarda el usuario por celda son los textos y su tamaño (ver Store).
// Las medidas están en "px de referencia" del diseño original (1158x279) y se
// convierten a mm con PANEL_MM_POR_PX, así el panel sale a tamaño real.
// Cada texto (slot) se ancla a la izquierda ("l") o derecha ("r") del interior
// del botón: ox = distancia al lado anclado, oy = distancia al borde de arriba,
// base = tamaño de letra, lh = interlineado y sx = estiramiento horizontal
// (el original tiene la letra ensanchada respecto a su alto). Los ox/oy se midieron contra el
// diseño original botón por botón (el original está armado a mano, así que
// cada botón tiene pequeñas diferencias).
const PANEL_REF_W = 1158;
const PANEL_REF_H = 279;
const PANEL_ANCHO_MM = 266;
const PANEL_MM_POR_PX = PANEL_ANCHO_MM / PANEL_REF_W;
const PANEL_BORDE_PX = 5;

const PANEL_CELDAS = [
  { id: "servicio", x: 30, y: 13, w: 84, h: 39, negrita: true, slots: {
      texto: { texto: "SERVICIO", base: 16, ax: "l", ox: -1, oy: 8, lh: 1.2, sx: 1.149 },
  } },
  { id: "cobrar", x: 28, y: 205, w: 83, h: 44, negrita: true, slots: {
      texto: { texto: "COBRAR", base: 16, ax: "l", ox: 2, oy: 4, lh: 1.2, sx: 1.127 },
  } },
  { id: "maxima", x: 957, y: 24, w: 180, h: 191, slots: {
      texto: { texto: "MAXIMA\nAPUESTA", base: 33, ax: "l", ox: 13, oy: 9, lh: 1.82, sx: 1.16 },
  } },
  { id: "simbolo1", x: 123, y: 13, w: 157, h: 115, slots: {
      top: { texto: "SIMBOLO\nDE ORO", base: 16, ax: "r", ox: 15, oy: 6, lh: 1.203, sx: 1.133, multi: true },
      numero: { texto: "1", base: 66.45, ax: "l", ox: 21, oy: 20, lh: 1, sx: 1.065 },
      bottom: { texto: "8 CREDITOS", base: 16, ax: "r", ox: 7, oy: 75, lh: 1.2, sx: 1.171 },
  } },
  { id: "juegue1", x: 124, y: 137, w: 156, h: 112, slots: {
      top: { texto: "JUEGUE", base: 16, ax: "l", ox: 19, oy: 3, lh: 1.2, sx: 1.1 },
      numero: { texto: "X1", base: 65.04, ax: "l", ox: 19, oy: 24, lh: 1, sx: 1.079 },
      bottom: { texto: "POR GIRO", base: 17.6, ax: "l", ox: 14, oy: 81, lh: 1.2, sx: 1.073 },
  } },
  { id: "simbolo2", x: 291, y: 14, w: 156, h: 117, slots: {
      top: { texto: "SIMBOLO\nDE ORO", base: 16, ax: "r", ox: 23, oy: 6, lh: 1.2, sx: 1.133, multi: true },
      numero: { texto: "2", base: 66.45, ax: "l", ox: 9, oy: 14, lh: 1, sx: 1.065 },
      bottom: { texto: "18 CREDITOS", base: 16, ax: "r", ox: 23, oy: 76, lh: 1.2, sx: 1.171 },
  } },
  { id: "juegue2", x: 291, y: 137, w: 156, h: 114, slots: {
      top: { texto: "JUEGUE", base: 16, ax: "l", ox: 12, oy: 2, lh: 1.2, sx: 1.1 },
      numero: { texto: "X2", base: 65.04, ax: "l", ox: 10, oy: 22, lh: 1, sx: 1.079 },
      bottom: { texto: "POR GIRO", base: 17.6, ax: "l", ox: 6, oy: 82, lh: 1.2, sx: 1.073 },
  } },
  { id: "simbolo3", x: 457, y: 14, w: 158, h: 119, slots: {
      top: { texto: "SIMBOLO\nDE ORO", base: 16, ax: "r", ox: 26, oy: 5, lh: 1.266, sx: 1.133, multi: true },
      numero: { texto: "3", base: 66.45, ax: "l", ox: 11, oy: 15, lh: 1, sx: 1.065 },
      bottom: { texto: "38 CREDITOS", base: 16, ax: "r", ox: 5, oy: 76, lh: 1.2, sx: 1.171 },
  } },
  { id: "juegue3", x: 459, y: 136, w: 158, h: 116, slots: {
      top: { texto: "JUEGUE", base: 16, ax: "l", ox: 11, oy: 5, lh: 1.2, sx: 1.1 },
      numero: { texto: "X3", base: 65.04, ax: "l", ox: 5, oy: 19, lh: 1, sx: 1.079 },
      bottom: { texto: "POR GIRO", base: 17.6, ax: "l", ox: 3, oy: 82, lh: 1.2, sx: 1.073 },
  } },
  { id: "simbolo4", x: 623, y: 15, w: 158, h: 116, slots: {
      top: { texto: "SIMBOLO\nDE ORO", base: 16, ax: "r", ox: 24, oy: 4, lh: 1.266, sx: 1.133, multi: true },
      numero: { texto: "4", base: 66.45, ax: "l", ox: 9, oy: 13, lh: 1, sx: 1.065 },
      bottom: { texto: "68 CREDITOS", base: 16, ax: "r", ox: 12, oy: 73, lh: 1.2, sx: 1.171 },
  } },
  { id: "juegue4", x: 623, y: 137, w: 158, h: 115, slots: {
      top: { texto: "JUEGUE", base: 16, ax: "l", ox: 14, oy: 5, lh: 1.2, sx: 1.1 },
      numero: { texto: "X6", base: 65.04, ax: "l", ox: 9, oy: 23, lh: 1, sx: 1.079 },
      bottom: { texto: "POR GIRO", base: 17.6, ax: "l", ox: 9, oy: 85, lh: 1.2, sx: 1.073 },
  } },
  { id: "simbolo5", x: 791, y: 14, w: 158, h: 115, slots: {
      top: { texto: "SIMBOLO\nDE ORO", base: 16, ax: "r", ox: 27, oy: 8, lh: 1.266, sx: 1.133, multi: true },
      numero: { texto: "5", base: 66.45, ax: "l", ox: 6, oy: 14, lh: 1, sx: 1.065 },
      bottom: { texto: "88 CREDITOS", base: 16, ax: "r", ox: 15, oy: 73, lh: 1.2, sx: 1.171 },
  } },
  { id: "juegue5", x: 791, y: 136, w: 160, h: 116, slots: {
      top: { texto: "JUEGUE", base: 16, ax: "l", ox: 6, oy: 6, lh: 1.2, sx: 1.1 },
      numero: { texto: "X10", base: 65.04, ax: "l", ox: 11, oy: 26, lh: 1, sx: 1.079 },
      bottom: { texto: "POR GIRO", base: 17.6, ax: "l", ox: 5, oy: 87, lh: 1.2, sx: 1.073 },
  } },
];

// Texto/tamaño efectivo de una celda: lo guardado por el usuario pisa los
// valores originales; el tamaño es un multiplicador (1 = tamaño original).
function panelValoresCelda(celda, guardado) {
  const g = guardado || {};
  const v = {};
  Object.keys(celda.slots).forEach((s) => {
    v[s] = { texto: g[s] != null ? g[s] : celda.slots[s].texto, tam: g[`tam_${s}`] != null ? g[`tam_${s}`] : 1 };
  });
  return v;
}

// Parsea "1, 2, 3, 5, 10" -> [1,2,3,5,10] (ignora vacíos y no-números).
function parseListaNumeros(texto) {
  return String(texto ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "")
    .map(Number)
    .filter((n) => !Number.isNaN(n));
}
