// Helpers puros / lógica de negocio. No toca el DOM directamente (eso vive en
// vistas.js). Todo lo que exponga este archivo queda disponible en el mismo
// scope global para vistas.js y app.js (sin imports, scripts clásicos).
const APP_VERSION = "0.3.0";

// Tamaño de hoja carta en mm y margen de seguridad para las marcas de corte.
const HOJA_ANCHO_MM = 215.9;
const HOJA_ALTO_MM = 279.4;
const CORTE_GAP_MM = 0.6;
const CORTE_LARGO_MM = 3;
const CORTE_GROSOR_MM = 0.15;
const PX_POR_MM = 96 / 25.4;

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
  const gap = gapMm ?? CORTE_GAP_MM * 2;
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
  const cx = x + w / 2, cy = y + h / 2;
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

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
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
