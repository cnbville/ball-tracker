// Turns a play into shapes on the field. The away team always attacks to the right,
// so x = 0 is the away goal line and x = 100 is the home goal line.

import { esc } from "./util.js";

const W = 1200, H = 533;
const X = (yd) => 100 + yd * 10;
const LANE_Y = { left: 140, middle: 266, right: 392 };

/** Field position (0 to 100 from the away goal line) of a "yards to end zone" value. */
function pos(side, yte) {
  if (typeof yte !== "number") return null;
  return side === "home" ? yte : 100 - yte;
}

export function geometry(play) {
  const side = play.side || "away";
  const dir = side === "home" ? -1 : 1;
  const start = pos(side, play.startYte);
  let end = pos(play.endSide || side, play.endYte);
  if (end == null && start != null && play.yards != null) end = start + dir * play.yards;
  if (start == null) return null;
  if (end == null) end = start;
  const laneY = LANE_Y[play.lane] ?? LANE_Y.middle;
  const sx = X(start);
  let ex = X(end), ey = laneY;
  if (play.touchdown) ex = X(dir > 0 ? 100 : 0) + dir * 40;

  const g = { start, end, dir, los: sx, firstDown: null, air: "", ground: "", from: [sx, 266], to: [ex, ey], carrier: true, marker: "ball" };
  if (play.down > 0 && play.distance > 0 && !play.touchdown) g.firstDown = X(Math.max(0, Math.min(100, start + dir * play.distance)));

  const arc = (x1, y1, x2, y2, lift) => {
    const cy = Math.max(12, Math.min(H - 12, Math.min(y1, y2) - lift));
    return `M${x1} ${y1} Q${Math.round((x1 + x2) / 2)} ${cy} ${x2} ${y2}`;
  };

  switch (play.kind) {
    case "pass": {
      const qb = X(start - dir * 6);
      g.from = [qb, 266];
      if (play.incomplete) {
        const tx = X(start + dir * 12);
        g.air = arc(qb, 266, tx, laneY, 140);
        g.to = [tx, laneY];
        g.carrier = false;
        g.marker = "miss";
      } else {
        // The feed doesn't split air yards from yards after the catch, so the ball
        // is drawn in the air for the first part of the gain and on the ground after.
        const gain = end - start;
        const catchYd = start + gain * (Math.abs(gain) > 15 ? 0.75 : 0.6);
        const cx = X(catchYd);
        g.air = arc(qb, 266, cx, laneY, 150);
        g.ground = `M${cx} ${laneY} L${ex} ${ey}`;
      }
      break;
    }
    case "sack": {
      g.ground = `M${sx} 266 L${ex} 266`;
      g.to = [ex, 266];
      g.marker = "sack";
      break;
    }
    case "kick":
    case "punt": {
      g.air = arc(sx, 266, ex, laneY, 230);
      g.from = [sx, 266];
      g.carrier = false;
      g.firstDown = null;
      break;
    }
    case "fg":
    case "pat": {
      const post = X(dir > 0 ? 100 : 0) + dir * 100;
      g.air = arc(sx, 266, post, 266, 200);
      g.to = [post, 266];
      g.carrier = false;
      g.marker = play.scoring ? "good" : "miss";
      g.firstDown = null;
      break;
    }
    case "run": {
      g.ground = `M${sx} 266 C${sx + dir * 30} 266 ${ex - dir * 50} ${ey} ${ex} ${ey}`;
      break;
    }
    default:
      g.carrier = false;
      g.marker = "none";
  }
  return g;
}

const STRIPES = (() => {
  let d = "";
  for (let i = 0; i < 20; i += 2) d += `M${X(i * 5)} 0h50v${H}h-50z`;
  return d;
})();
const LINES = (() => {
  let d = "";
  for (let y = 5; y < 100; y += 5) d += `M${X(y)} 0V${H}`;
  return d + `M100 0V${H}M1100 0V${H}`;
})();
const HASHES = (() => {
  let d = "";
  for (let y = 1; y < 100; y++) if (y % 5) d += `M${X(y)} 8v12M${X(y)} 513v12M${X(y)} 200v12M${X(y)} 321v12`;
  return d;
})();
const NUMBERS = [10, 20, 30, 40, 50, 40, 30, 20, 10]
  .map((n, i) => `<text x="${200 + i * 100}" y="66">${n}</text><text x="${200 + i * 100}" y="492">${n}</text>`)
  .join("");

function endZone(team, x, rotate) {
  return `<rect x="${x}" y="0" width="100" height="${H}" fill="${esc(team.fill)}"></rect>
    <text x="${x + 50}" y="266" class="ez" transform="rotate(${rotate} ${x + 50} 266)">${esc((team.name || team.abbr).toUpperCase())}</text>`;
}

/** The big tilted field with the selected play drawn on it, and faint trails for the rest of its drive. */
export function fieldSvg(game, play, drivePlays) {
  const g = play ? geometry(play) : null;
  const offense = play?.side === "home" ? game.home : game.away;
  const color = offense?.glow || "#f4f5f7";
  const trail = (drivePlays || [])
    .filter((p) => p !== play)
    .map((p) => geometry(p))
    .filter(Boolean)
    .map((x) => x.ground || x.air)
    .filter(Boolean)
    .join(" ");

  let marks = "";
  if (g) {
    marks += `<rect x="${g.los - 2}" y="0" width="5" height="${H}" fill="#3ea6ff" opacity=".9"></rect>`;
    if (g.firstDown != null) marks += `<rect x="${g.firstDown - 2}" y="0" width="5" height="${H}" fill="#ffd23f" opacity=".95"></rect>`;
    if (trail) marks += `<path d="${trail}" stroke="${esc(color)}" stroke-width="6" stroke-linecap="round" fill="none" opacity=".3"></path>`;
    if (g.air) marks += `<path d="${g.air}" class="draw" stroke="#ffffff" stroke-width="5" stroke-dasharray="14 12" stroke-linecap="round" fill="none" opacity=".9"></path>`;
    if (g.ground) marks += `<path d="${g.ground}" class="draw" stroke="${esc(color)}" stroke-width="9" stroke-linecap="round" fill="none" filter="url(#glow)"></path>`;
    marks += `<circle cx="${g.from[0]}" cy="${g.from[1]}" r="13" fill="#0b0c0f" stroke="#ffffff" stroke-width="4"></circle>`;
    const [tx, ty] = g.to;
    if (g.marker === "miss") {
      marks += `<path d="M${tx - 16} ${ty - 16}L${tx + 16} ${ty + 16}M${tx + 16} ${ty - 16}L${tx - 16} ${ty + 16}" stroke="#ff375f" stroke-width="7" stroke-linecap="round"></path>`;
    } else if (g.marker !== "none") {
      marks += `<circle cx="${tx}" cy="${ty}" r="30" fill="${esc(color)}" opacity=".25"></circle>
        <circle cx="${tx}" cy="${ty}" r="20" fill="${esc(offense.fill)}" stroke="#ffffff" stroke-width="4" filter="url(#glow)"></circle>
        <text x="${tx}" y="${ty}" class="tag">${esc(g.marker === "good" ? "GOOD" : offense.abbr)}</text>`;
    }
  }

  return `<svg class="field" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(play ? play.text : "Field")}">
    <defs>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" result="b"></feGaussianBlur><feMerge><feMergeNode in="b"></feMergeNode><feMergeNode in="SourceGraphic"></feMergeNode></feMerge></filter>
      <linearGradient id="turf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14532f"></stop><stop offset="1" stop-color="#0c3a20"></stop></linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#turf)"></rect>
    <path d="${STRIPES}" fill="rgba(255,255,255,.035)"></path>
    ${endZone(game.away, 0, -90)}${endZone(game.home, 1100, 90)}
    <path d="${LINES}" stroke="rgba(255,255,255,.55)" stroke-width="2" fill="none"></path>
    <path d="${HASHES}" stroke="rgba(255,255,255,.45)" stroke-width="2" fill="none"></path>
    <rect width="${W}" height="${H}" fill="none" stroke="rgba(255,255,255,.8)" stroke-width="6"></rect>
    <g class="nums">${NUMBERS}</g>
    ${marks}
  </svg>`;
}

/** A thumbnail of the play for the list. */
export function miniSvg(game, play) {
  const g = geometry(play);
  const offense = play.side === "home" ? game.home : game.away;
  let d = "";
  if (g) {
    if (g.air) d += `<path d="${g.air}" stroke="#ffffff" stroke-width="1.5" stroke-dasharray="3 3" fill="none" vector-effect="non-scaling-stroke"></path>`;
    if (g.ground) d += `<path d="${g.ground}" stroke="${esc(offense.glow)}" stroke-width="3" stroke-linecap="round" fill="none" vector-effect="non-scaling-stroke"></path>`;
    if (g.marker !== "none") d += `<circle cx="${g.to[0]}" cy="${g.to[1]}" r="42" fill="${g.marker === "miss" ? "#ff375f" : esc(offense.glow)}"></circle>`;
    d += `<path d="M${g.los} 0V${H}" stroke="#3ea6ff" stroke-width="1" vector-effect="non-scaling-stroke"></path>`;
  }
  return `<svg class="mini" viewBox="0 0 ${W} ${H}" aria-hidden="true">
    <rect width="100" height="${H}" fill="${esc(game.away.fill)}"></rect><rect x="1100" width="100" height="${H}" fill="${esc(game.home.fill)}"></rect>
    <path d="M600 0V${H}" stroke="rgba(255,255,255,.3)" stroke-width="1" vector-effect="non-scaling-stroke"></path>${d}</svg>`;
}
