// Small helpers shared by every screen.

export const $ = (sel, root = document) => root.querySelector(sel);

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

export function load(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable; the app still works without persistence.
  }
}

function rgb(hex) {
  const h = String(hex || "").replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

export function luminance(hex) {
  const c = rgb(hex);
  if (!c) return 0;
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function colorDistance(a, b) {
  const x = rgb(a), y = rgb(b);
  if (!x || !y) return 999;
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

/** A team color dark enough to carry white text: the primary, else the alternate, else grey. */
export function teamFill(primary, alt) {
  if (rgb(primary) && luminance(primary) < 0.4) return primary;
  if (rgb(alt) && luminance(alt) < 0.4) return alt;
  return "#3a3f4b";
}

/** A brighter version of a team color for lines and glows on the dark field. */
export function teamGlow(hex) {
  const c = rgb(hex);
  if (!c) return "#9aa3b5";
  const l = luminance(hex);
  if (l > 0.12) return hex;
  const k = 0.45;
  const mix = c.map((v) => Math.round(v + (255 - v) * k));
  return "#" + mix.map((v) => v.toString(16).padStart(2, "0")).join("");
}

export function teamLogo(team, size = 28) {
  const fallback = `<span class="st-mark" style="--s:${size}px;--accent:${esc(team.fill)}">${esc(team.abbr)}</span>`;
  if (!team.logo) return fallback;
  return `<img class="logo" src="${esc(team.logo)}" alt="" width="${size}" height="${size}" loading="lazy" data-abbr="${esc(team.abbr)}" data-fill="${esc(team.fill)}" data-size="${size}">`;
}

// A logo that fails to load turns into the team's colored badge.
document.addEventListener(
  "error",
  (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.classList.contains("logo")) return;
    const span = document.createElement("span");
    span.className = "st-mark";
    span.style.setProperty("--s", img.dataset.size + "px");
    span.style.setProperty("--accent", img.dataset.fill || "#3a3f4b");
    span.textContent = img.dataset.abbr || "";
    img.replaceWith(span);
  },
  true,
);

export const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
