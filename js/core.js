// Helpers puros / lógica de negocio. No toca el DOM directamente (eso vive en
// vistas.js). Todo lo que exponga este archivo queda disponible en el mismo
// scope global para vistas.js y app.js (sin imports, scripts clásicos).
const APP_VERSION = "0.5.1";

// Tamaño de hoja carta en mm y margen de seguridad para las marcas de corte.
const HOJA_ANCHO_MM = 215.9;
const HOJA_ALTO_MM = 279.4;
const CORTE_GAP_MM = 0.6;
const CORTE_LARGO_MM = 3;
const CORTE_GROSOR_MM = 0.15;
const PX_POR_MM = 96 / 25.4;
// Separación por defecto entre botones: tiene que ser mayor que
// CORTE_GAP_MM + CORTE_LARGO_MM (3.6mm) o la marca de corte de un botón queda
// tapada por el botón de al lado.
const SEPARACION_MM = 5;

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
  let cursorX = gap;
  let cursorY = gap;
  let altoFila = 0;

  // Si no hay botones, arranca en la esquina superior izquierda.
  if (!botonesExistentes.length) return { x: gap, y: gap };

  // Reconstruye el "estante" actual a partir del último botón agregado.
  const ultimo = botonesExistentes[botonesExistentes.length - 1];
  cursorX = ultimo.x + ultimo.w + gap;
  cursorY = ultimo.y;
  altoFila = Math.max(...botonesExistentes.map((b) => (b.y === ultimo.y ? b.h : 0)));

  if (cursorX + w > HOJA_ANCHO_MM - gap) {
    cursorX = gap;
    cursorY = ultimo.y + altoFila + gap;
  }
  if (cursorY + h > HOJA_ALTO_MM - gap) {
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

// Reacomoda todos los botones de una hoja en filas prolijas (igual alto por
// fila) para que se pueda cortar con guillotina: primero cortes horizontales
// de lado a lado, después cada fila se corta en columnas por separado.
// Muta boton.x/boton.y de cada botón recibido.
function reorganizarBotones(botones, gapMm) {
  const gap = gapMm ?? SEPARACION_MM;
  const ordenados = [...botones].sort((a, b) => {
    if (b.h !== a.h) return b.h - a.h;
    const ga = a.grupoId || a.id, gb = b.grupoId || b.id;
    if (ga !== gb) return ga < gb ? -1 : 1;
    return (a.contenido.numero ?? 0) - (b.contenido.numero ?? 0);
  });
  let x = gap, y = gap, altoFila = 0;
  ordenados.forEach((b) => {
    if (x + b.w > HOJA_ANCHO_MM - gap) {
      x = gap;
      y += altoFila + gap;
      altoFila = 0;
    }
    b.x = x;
    b.y = y;
    x += b.w + gap;
    altoFila = Math.max(altoFila, b.h);
  });
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
