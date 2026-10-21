// Helpers puros / lógica de negocio. No toca el DOM directamente (eso vive en
// vistas.js). Todo lo que exponga este archivo queda disponible en el mismo
// scope global para vistas.js y app.js (sin imports, scripts clásicos).
const APP_VERSION = "0.14.0";

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
// colores, marcos, fondo) vive acá en código y NO es editable: lo único que
// guarda el usuario por celda son los textos y su tamaño (ver Store).
// Las medidas están en "px de referencia" (panel de 1568x312) y se convierten
// a mm con PANEL_MM_POR_PX, así el panel sale a tamaño real. Posiciones y
// tamaños se midieron sobre la imagen del diseño esperado.
const PANEL_REF_W = 1568;
const PANEL_REF_H = 312;
const PANEL_ANCHO_MM = 266;
const PANEL_MM_POR_PX = PANEL_ANCHO_MM / PANEL_REF_W;
// Grosor de las barras naranjas que sobresalen del marco de cada botón.
const PANEL_BARRA = 8;

// Cada celda: caja = placa del marco + barras. cara = [x, y, ancho, alto]
// absolutos de la cara de color; m = margen entre cara y borde de la placa.
// Textos (slots): ax "l" (desde la izquierda, a ox) o "c" (centrado); ay "t"
// (desde arriba), "b" (desde abajo) o "m" (centrado), a oy; base = tamaño de
// letra, lh = interlineado, sx = estiramiento horizontal, rol = color.
const PANEL_CELDAS = (function () {
  const sl = (texto, base, extra) => ({ texto, base, ax: "c", ox: 0, ay: "m", oy: 0, lh: 1, sx: 1, rol: "blanco", ...extra });
  const marco = (id, cara, opts, slots) => {
    const m = opts.m != null ? opts.m : 10;
    const pw = cara[2] + 2 * m, ph = cara[3] + 2 * m;
    return { id, x: cara[0] - m - PANEL_BARRA, y: cara[1] - m - PANEL_BARRA, w: pw + 2 * PANEL_BARRA, h: ph + 2 * PANEL_BARRA, m, cara: [m + PANEL_BARRA, m + PANEL_BARRA, cara[2], cara[3]], rojo: !!opts.rojo, solape: opts.solape || 0, slots };
  };
  const celdas = [
    { id: "titulo", x: 560, y: 12, w: 480, h: 32, sinMarco: true, slots: { texto: sl("JUEGUE 243 FORMAS", 26) } },
    marco("servicio", [76, 46, 77, 49], { m: 14, rojo: true }, { texto: sl("SERVICIO", 16) }),
    marco("cobrar", [76, 222, 76, 46], { m: 14 }, { texto: sl("COBRAR", 16) }),
    marco("maxima", [1346, 112, 162, 130], { m: 14 }, { texto: sl("MÁXIMA\nAPUESTA", 28, { lh: 1.5, multi: true }) }),
    { id: "minima", x: 200, y: 284, w: 300, h: 16, sinMarco: true, slots: { texto: sl("APUESTA MÍN. 8", 12) } },
  ];
  const arriba = [[266, 56, 128, 86], [480, 56, 128, 86], [692, 56, 128, 86], [904, 56, 124, 86], [1112, 56, 132, 86]];
  const abajo = [[264, 182, 134, 88], [480, 182, 128, 88], [692, 182, 126, 88], [904, 182, 124, 88], [1112, 182, 128, 88]];
  const creditos = ["8", "18", "38", "68", "88"];
  const giros = ["X1", "X2", "X3", "X6", "X10"];
  for (let i = 0; i < 5; i++) {
    celdas.push(marco(`simbolo${i + 1}`, arriba[i], {}, {
      numero: sl(String(i + 1), 58, { ax: "l", ox: 26, ay: "t", oy: 22 }),
      top: sl(i === 0 ? "SÍMBOLO\nDE ORO" : "SÍMBOLOS\nDE ORO", 14, { ax: "l", ox: 60, ay: "t", oy: 33, lh: 1.29, rol: "oro", multi: true }),
      bottom: sl(`(${creditos[i]} CRÉDITOS)`, 14, { ay: "b", oy: 20, rol: "oro" }),
    }));
    celdas.push(marco(`juegue${i + 1}`, abajo[i], {}, {
      top: sl("JUEGUE", 16, { ay: "t", oy: 24 }),
      numero: sl(giros[i], 52, { ay: "t", oy: 36 }),
      bottom: sl("POR GIRO", 14, { ay: "b", oy: 18, rol: "oro" }),
    }));
  }
  // Posiciones/tamaños de cada texto, ajustados contra el diseño esperado.
  const ajustes = {
  titulo: { texto: { base: 25, ox: -8, oy: -5, lh: 1, sx: 0.902 } },
  servicio: { texto: { base: 16.11, ox: -1.5, oy: -1, lh: 1, sx: 1.013 } },
  cobrar: { texto: { base: 16.11, ox: 0, oy: 0, lh: 1, sx: 0.945 } },
  maxima: { texto: { base: 27.32, ox: 0, oy: -4, lh: 1.72, sx: 0.986 } },
  minima: { texto: { base: 12, ox: -19.5, oy: 0.5, lh: 1, sx: 0.89 } },
  simbolo1: { numero: { base: 58, ox: 20, oy: 20, lh: 1, sx: 1 }, top: { base: 14, ox: 60, oy: 31, lh: 1.3, sx: 0.863 }, bottom: { base: 15.37, ox: 0, oy: 29, lh: 1, sx: 0.879 } },
  juegue1: { top: { base: 16, ox: 1, oy: 16, lh: 1, sx: 0.833 }, numero: { base: 53.37, ox: 0, oy: 35, lh: 1, sx: 0.972 }, bottom: { base: 16.94, ox: 0, oy: 14, lh: 1, sx: 0.789 } },
  simbolo2: { numero: { base: 58, ox: 20, oy: 20, lh: 1, sx: 1 }, top: { base: 14, ox: 60, oy: 31, lh: 1.3, sx: 0.863 }, bottom: { base: 15.37, ox: 0.5, oy: 29, lh: 1, sx: 0.879 } },
  juegue2: { top: { base: 16, ox: 1, oy: 16, lh: 1, sx: 0.833 }, numero: { base: 53.37, ox: 1, oy: 33, lh: 1, sx: 0.972 }, bottom: { base: 16.94, ox: 0.5, oy: 14, lh: 1, sx: 0.789 } },
  simbolo3: { numero: { base: 58, ox: 20, oy: 20, lh: 1, sx: 1 }, top: { base: 14, ox: 60, oy: 31, lh: 1.3, sx: 0.863 }, bottom: { base: 15.37, ox: 1, oy: 29, lh: 1, sx: 0.879 } },
  juegue3: { top: { base: 16, ox: 1, oy: 16, lh: 1, sx: 0.833 }, numero: { base: 53.37, ox: 0.5, oy: 33, lh: 1, sx: 0.972 }, bottom: { base: 16.94, ox: 0, oy: 14, lh: 1, sx: 0.789 } },
  simbolo4: { numero: { base: 58, ox: 20, oy: 20, lh: 1, sx: 1 }, top: { base: 14, ox: 60, oy: 31, lh: 1.3, sx: 0.863 }, bottom: { base: 15.37, ox: 0.5, oy: 29, lh: 1, sx: 0.879 } },
  juegue4: { top: { base: 16, ox: 1, oy: 16, lh: 1, sx: 0.833 }, numero: { base: 53.37, ox: 0.5, oy: 33, lh: 1, sx: 0.972 }, bottom: { base: 16.94, ox: 0.5, oy: 14, lh: 1, sx: 0.789 } },
  simbolo5: { numero: { base: 58, ox: 20, oy: 20, lh: 1, sx: 1 }, top: { base: 14, ox: 60, oy: 31, lh: 1.3, sx: 0.863 }, bottom: { base: 15.37, ox: 0.5, oy: 29, lh: 1, sx: 0.879 } },
  juegue5: { top: { base: 16, ox: 0, oy: 16, lh: 1, sx: 0.833 }, numero: { base: 53.37, ox: 0.5, oy: 33, lh: 1, sx: 0.972 }, bottom: { base: 16.94, ox: 0.5, oy: 14, lh: 1, sx: 0.789 } },
  };
  celdas.forEach((c) => Object.entries(ajustes[c.id] || {}).forEach(([k, a]) => Object.assign(c.slots[k], a)));
  return celdas;
})();

// Escala del panel: mm por px de referencia en cada eje (el panel puede
// agrandarse/achicarse, con o sin mantener la proporción) y la de las letras.
function panelEscala(cfg) {
  const aMm = (cfg && cfg.anchoMm) || PANEL_ANCHO_MM;
  const hMm = (cfg && cfg.altoMm) || (PANEL_ANCHO_MM * PANEL_REF_H) / PANEL_REF_W;
  const ux = aMm / PANEL_REF_W, uy = hMm / PANEL_REF_H;
  return { aMm, hMm, ux, uy, uf: Math.min(ux, uy) };
}

// Tamaño mínimo de un botón con marco (para que le quede cara útil).
function panelMinimo(c) {
  const k = 2 * (c.m + PANEL_BARRA);
  return { w: k + 24, h: k + 16 };
}

// Geometría efectiva de una celda (px de referencia): posición y tamaño
// originales + lo que el usuario movió (dx, dy) o redimensionó (dw, dh, que
// crece o se achica alrededor del centro del botón).
function panelGeom(c, g) {
  g = g || {};
  let w = c.w, h = c.h;
  if (c.cara) {
    const min = panelMinimo(c);
    w = clamp(c.w + (g.dw || 0), min.w, PANEL_REF_W - 20);
    h = clamp(c.h + (g.dh || 0), min.h, PANEL_REF_H - 20);
  }
  const x = c.x + (g.dx || 0) - (w - c.w) / 2;
  const y = c.y + (g.dy || 0) - (h - c.h) / 2;
  const k = c.cara ? c.m + PANEL_BARRA : 0;
  return { x, y, w, h, cara: c.cara ? [k, k, w - 2 * k, h - 2 * k] : null };
}

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
