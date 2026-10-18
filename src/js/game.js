// The game screen: scoreboard, the broadcast field with the selected play drawn on it,
// the game-flow chart and the play-by-play list.

import { LEAGUES, gameSummary } from "./api.js";
import { fieldSvg, miniSvg } from "./field.js";
import { EASTERN, clock, longDay } from "./time.js";
import { esc, teamLogo } from "./util.js";
import { isFollowed, notify, setOpenGame } from "./alerts.js";

const state = { key: "", data: null, sel: null, follow: true, seen: new Set(), fresh: new Set(), flash: null, tab: "plays", error: "", loadedOnce: false };
export const gameState = state;

const sideTeam = (g, side) => (side === "home" ? g.home : g.away);
const quarter = (n) => (n == null ? "" : n > 4 ? (n === 5 ? "OT" : `${n - 4}OT`) : `Q${n}`);

/** Plays in game order, with the win probability change each one caused. */
function timeline(g) {
  const plays = g.drives.flatMap((d) => d.plays.filter((p) => p.kind !== "break"));
  let prev = null;
  for (const p of plays) {
    p.wpDelta = p.wp != null && prev != null ? p.wp - prev : null;
    if (p.wp != null) prev = p.wp;
  }
  return plays;
}

export async function loadGame(league, id) {
  const key = `${league}/${id}`;
  if (state.key !== key) {
    Object.assign(state, { key, data: null, sel: null, follow: true, seen: new Set(), fresh: new Set(), flash: null, tab: "plays", error: "", loadedOnce: false });
    setOpenGame(id);
  }
  try {
    const g = await gameSummary(league, id);
    const plays = timeline(g);
    const firstLoad = !state.loadedOnce;
    state.fresh = new Set();
    const scores = [];
    for (const p of plays) {
      if (!state.seen.has(p.id)) {
        if (!firstLoad) {
          state.fresh.add(p.id);
          if (p.scoring && p.kind !== "pat") scores.push(p);
        }
        state.seen.add(p.id);
      }
    }
    // One alert per poll: a touchdown beats a field goal, which beats anything else. Extra points ride along.
    const rank = (p) => (p.touchdown ? 2 : p.kind === "fg" ? 1 : 0);
    const best = scores.reduce((a, p) => (!a || rank(p) >= rank(a) ? p : a), null);
    if (best) scored(g, best);
    state.data = g;
    state.error = "";
    state.loadedOnce = true;
    if (state.follow || !plays.some((p) => p.id === state.sel)) state.sel = plays.at(-1)?.id ?? null;
  } catch (e) {
    state.error = `Couldn't load this game (${e.message || e}). Retrying.`;
  }
  return state.data;
}

function scored(g, p) {
  const team = sideTeam(g, p.side);
  const label = p.touchdown ? "Touchdown" : p.kind === "fg" ? "Field goal" : "Score";
  const score = `${g.away.abbr} ${g.away.score ?? p.awayScore}, ${g.home.abbr} ${g.home.score ?? p.homeScore}`;
  state.flash = { label, team, text: p.text, score, until: Date.now() + 9000 };
  notify(`${label}, ${team.name}`, `${score} · ${quarter(p.period)} ${p.clock}\n${p.text}`);
}

export function renderGame(el) {
  const g = state.data;
  if (!g) {
    el.innerHTML = state.error ? `<div class="empty">${esc(state.error)}</div>` : `<div class="empty">Loading the game…</div>`;
    return;
  }
  const plays = timeline(g);
  const sel = plays.find((p) => p.id === state.sel) || plays.at(-1) || null;
  if (state.flash && Date.now() > state.flash.until) state.flash = null;
  el.innerHTML = `<div class="game" style="--a:${esc(g.away.fill)};--h:${esc(g.home.fill)}">
    ${scorebug(g, plays)}
    ${state.error ? `<div class="banner-note bad">${esc(state.error)}</div>` : ""}
    <div class="game-grid">
      <div class="game-main">
        ${fieldPanel(g, plays, sel)}
        ${flowPanel(g, plays, sel)}
      </div>
      ${sidePanel(g, plays, sel)}
    </div>
  </div>`;
}

function scorebug(g, plays) {
  const lastWp = [...plays].reverse().find((p) => p.wp != null)?.wp;
  const t = (team, side) => `<div class="sb-team ${side}">
      ${teamLogo(team, 58)}
      <div class="sb-name"><b>${team.rank ? `<span class="rk">${team.rank}</span>` : ""}${esc(team.name)}${g.possession === side && g.state === "in" ? ' <span class="poss" title="Has the ball"></span>' : ""}</b>
        <small>${esc(team.record)}</small>
        <button class="follow${isFollowed(g.league, team.id) ? " on" : ""}" data-action="follow" data-team="${esc(team.id)}" aria-pressed="${isFollowed(g.league, team.id)}">${isFollowed(g.league, team.id) ? "Following" : "Follow"}</button>
      </div>
      <b class="sb-score">${g.state === "pre" ? "" : esc(team.score ?? 0)}</b>
    </div>`;
  const mid =
    g.state === "pre"
      ? `<span class="st-pill">Kickoff ${esc(clock(g.date))}</span><b class="sb-dd">${esc(longDay(g.date))}</b><small>${esc(clock(g.date, EASTERN))} US Eastern · ${esc(g.channels[0] || "")}</small>`
      : `<span class="st-pill ${g.state === "in" ? "live" : ""}">${esc(g.detail)}</span><b class="sb-dd">${esc(g.state === "in" ? g.downDistance : "Final")}</b><small>${esc(g.channels.join(", "))}</small>`;
  const wp =
    lastWp != null
      ? `<div class="sb-wp"><div class="sb-wp-head"><span class="lbl">Win probability</span><span>${esc(g.home.abbr)} <b>${Math.round(lastWp * 100)}%</b></span></div>
        <div class="wpbar" role="img" aria-label="${esc(g.away.name)} ${Math.round((1 - lastWp) * 100)} percent, ${esc(g.home.name)} ${Math.round(lastWp * 100)} percent"><span style="width:${((1 - lastWp) * 100).toFixed(1)}%;background:${esc(g.away.glow)}"></span><span style="flex-grow:1;background:${esc(g.home.glow)}"></span></div>
        <div class="sb-wp-foot"><span>${esc(g.away.abbr)} ${Math.round((1 - lastWp) * 100)}%</span><span>${esc(g.venue)}</span></div></div>`
      : `<div class="sb-wp"><span class="lbl">Venue</span><small>${esc(g.venue)}</small></div>`;
  return `<section class="st-glass scorebug" aria-label="Scoreboard">${t(g.away, "away")}<div class="sb-mid">${mid}</div>${t(g.home, "home")}${wp}</section>`;
}

function fieldPanel(g, plays, sel) {
  if (!sel) {
    return `<section class="st-glass fieldpanel"><div class="empty">No plays yet. The field comes alive at kickoff.</div></section>`;
  }
  const team = sideTeam(g, sel.side);
  const drive = g.drives[sel.driveIndex];
  const idx = plays.indexOf(sel);
  const wpTeam = sel.wp == null ? null : sel.side === "home" ? sel.wp : 1 - sel.wp;
  const delta = sel.wpDelta == null ? null : Math.round((sel.side === "home" ? sel.wpDelta : -sel.wpDelta) * 100);
  const kindLabel = { pass: "Pass", run: "Run", sack: "Sack", kick: "Kickoff", punt: "Punt", fg: "Field goal", pat: "Extra point", penalty: "Penalty", other: "Play" }[sel.kind] || "Play";
  const flash = state.flash
    ? `<div class="flash" role="status"><b>${esc(state.flash.label.toUpperCase())}</b><span><b>${esc(state.flash.team.name)}</b> ${esc(state.flash.text)}</span><b class="flash-score">${esc(state.flash.score)}</b></div>`
    : "";
  return `<section class="st-glass fieldpanel" aria-label="Field view">
    ${flash}
    <div class="fp-head">
      <div class="fp-title">
        <span class="lbl">${esc(team.name)} · ${esc(quarter(sel.period))} ${esc(sel.clock)}${sel.downText ? ` · ${esc(sel.downText)}` : ""}${sel.spot ? ` at ${esc(sel.spot)}` : ""}</span>
        <b>${esc(sel.text)}</b>
      </div>
      <div class="fp-tiles">
        <div class="tile"><b class="${sel.touchdown ? "gold" : ""}">${sel.yards == null ? "–" : (sel.yards > 0 ? "+" : "") + esc(sel.yards)}</b><span class="lbl">Yards</span></div>
        <div class="tile"><b>${esc(kindLabel)}</b><span class="lbl">Play</span></div>
        <div class="tile"><b>${wpTeam == null ? "–" : Math.round(wpTeam * 100) + "%"}</b><span class="lbl">Win prob. ${esc(team.abbr)}</span></div>
        <div class="tile"><b class="${delta > 0 ? "up" : delta < 0 ? "down" : ""}">${delta == null ? "–" : (delta > 0 ? "+" : "") + delta + "%"}</b><span class="lbl">Swing</span></div>
      </div>
    </div>
    <div class="fp-field"><div class="tilt">${fieldSvg(g, sel, drive?.plays)}</div></div>
    <div class="fp-foot">
      <div class="legend">
        <span><i style="background:#3ea6ff"></i>Line of scrimmage</span>
        <span><i style="background:#ffd23f"></i>First down</span>
        <span><i class="dash"></i>Ball in the air</span>
        <span><i style="background:${esc(team.glow)}"></i>Ball carrier</span>
      </div>
      <div class="stepper">
        <button class="st-icon-btn" data-action="step" data-step="-1" ${idx <= 0 ? "disabled" : ""} aria-label="Previous play"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>
        <button class="st-btn small ${state.follow ? "primary" : "glass"}" data-action="live">${g.state === "in" ? (state.follow ? "Following live" : "Jump to live") : "Latest play"}</button>
        <button class="st-icon-btn" data-action="step" data-step="1" ${idx >= plays.length - 1 ? "disabled" : ""} aria-label="Next play"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>
      </div>
    </div>
  </section>`;
}

// ---- game flow chart ----
const CW = 1000, CH = 200;
const cy = (w) => 12 + (1 - w) * 176;

function flowPanel(g, plays, sel) {
  const pts = plays.filter((p) => p.wp != null);
  if (pts.length < 2) {
    return `<section class="st-glass flow"><div class="flow-head"><span class="lbl">Game flow</span></div><div class="empty small">The win probability chart fills in once the game is under way.</div></section>`;
  }
  const n = pts.length - 1;
  const cx = (i) => (i / n) * CW;
  const line = pts.map((p, i) => `${i ? "L" : "M"}${cx(i).toFixed(1)} ${cy(p.wp).toFixed(1)}`).join(" ");
  const area = `${line} L${CW} 100 L0 100 Z`;
  let quarters = "";
  let qLabels = "";
  let prevQ = pts[0].period;
  let qStart = 0;
  pts.forEach((p, i) => {
    if (p.period !== prevQ) {
      quarters += `M${cx(i).toFixed(1)} 0V${CH}`;
      qLabels += `<span style="left:${((qStart + i) / 2 / n) * 100}%">${esc(quarter(prevQ))}</span>`;
      qStart = i;
      prevQ = p.period;
    }
  });
  qLabels += `<span style="left:${((qStart + n) / 2 / n) * 100}%">${esc(quarter(prevQ))}</span>`;

  const markers = pts
    .map((p, i) => (p.scoring ? { p, i } : null))
    .filter(Boolean)
    .map(({ p, i }) => {
      const team = sideTeam(g, p.side);
      const tag = p.touchdown ? "TD" : p.kind === "fg" ? "FG" : p.kind === "pat" ? "" : "S";
      if (!tag) return "";
      return `<button class="fmark" data-action="pick" data-id="${esc(p.id)}" style="left:${(i / n) * 100}%;top:${(cy(p.wp) / CH) * 100}%;background:${esc(team.fill)}" aria-label="${esc(team.name)} ${tag === "TD" ? "touchdown" : "score"}, ${esc(quarter(p.period))} ${esc(p.clock)}">${tag}</button>`;
    })
    .join("");

  const selI = sel ? pts.indexOf(sel) : -1;
  const selLine = selI >= 0 ? `<path d="M${cx(selI).toFixed(1)} 0V${CH}" stroke="#ffd23f" stroke-width="1.5" vector-effect="non-scaling-stroke"></path>` : "";

  // Drives as bars under the chart, positioned by their plays on the same axis.
  const drives = g.drives
    .map((d) => {
      const idx = d.plays.map((p) => pts.indexOf(p)).filter((i) => i >= 0);
      if (!idx.length) return "";
      const a = Math.min(...idx), b = Math.max(...idx);
      const left = (Math.max(0, a - 0.5) / n) * 100;
      const width = Math.max(0.6, ((Math.min(n, b + 0.5) - Math.max(0, a - 0.5)) / n) * 100);
      const short = shortResult(d);
      return `<span class="dbar${d.isScore ? " score" : ""}${d.inProgress ? " now" : ""}" style="left:${left}%;width:${width}%;background:${esc(d.team.fill)}" title="${esc(d.team.name)}: ${esc(d.result)}${d.description ? " · " + esc(d.description) : ""}">${esc(short)}</span>`;
    })
    .join("");

  return `<section class="st-glass flow" aria-label="Game flow">
    <div class="flow-head">
      <span class="lbl">Game flow</span>
      <span class="key"><i style="background:${esc(g.home.glow)}"></i>${esc(g.home.name)} ahead</span>
      <span class="key"><i style="background:${esc(g.away.glow)}"></i>${esc(g.away.name)} ahead</span>
      <small>Hover the chart for any play, click to show it on the field.</small>
    </div>
    <div class="flow-chart" data-n="${n}">
      <svg viewBox="0 0 ${CW} ${CH}" preserveAspectRatio="none" role="img" aria-label="Win probability over the game">
        <defs><clipPath id="up"><rect width="${CW}" height="100"></rect></clipPath><clipPath id="dn"><rect y="100" width="${CW}" height="100"></rect></clipPath></defs>
        <path d="${quarters}" stroke="rgba(255,255,255,.1)" stroke-width="1" vector-effect="non-scaling-stroke"></path>
        <path d="M0 100H${CW}" stroke="rgba(255,255,255,.3)" stroke-dasharray="4 4" stroke-width="1" vector-effect="non-scaling-stroke"></path>
        <path d="${area}" fill="${esc(g.home.glow)}" fill-opacity=".3" clip-path="url(#up)"></path>
        <path d="${area}" fill="${esc(g.away.glow)}" fill-opacity=".3" clip-path="url(#dn)"></path>
        <path d="${line}" stroke="#f4f5f7" stroke-width="2" fill="none" stroke-linejoin="round" vector-effect="non-scaling-stroke"></path>
        ${selLine}
      </svg>
      <span class="axis top">${esc(g.home.abbr)} 100%</span><span class="axis bottom">${esc(g.away.abbr)} 100%</span>
      ${markers}
      <div class="flow-hit" data-ids="${esc(pts.map((p) => p.id).join(","))}"><div class="cross"></div><div class="tip"></div></div>
    </div>
    <div class="drivebars">${drives}</div>
    <div class="qlabels">${qLabels}</div>
  </section>`;
}

function shortResult(d) {
  const r = (d.result || "").toUpperCase();
  if (d.inProgress) return "";
  if (r.includes("TOUCHDOWN") || r === "TD") return "TD";
  if (r.includes("FIELD GOAL") && !r.includes("MISS")) return "FG";
  if (r.includes("PUNT")) return "P";
  if (r.includes("INT")) return "INT";
  if (r.includes("FUMBLE")) return "FUM";
  if (r.includes("DOWNS")) return "DWN";
  if (r.includes("MISS")) return "MFG";
  return "";
}

// ---- play list and box score ----
function sidePanel(g, plays, sel) {
  const tabs = `<div class="seg-tabs" role="tablist" aria-label="Game details">
    <button role="tab" aria-selected="${state.tab === "plays"}" data-action="tab" data-tab="plays">Play-by-play</button>
    <button role="tab" aria-selected="${state.tab === "box"}" data-action="tab" data-tab="box">Box score</button>
  </div>`;
  return `<aside class="st-glass playside" aria-label="Game details">${tabs}<div class="playside-body">${state.tab === "box" ? boxScore(g) : playList(g, sel)}</div></aside>`;
}

function playList(g, sel) {
  if (!g.drives.length) return `<div class="empty small">No plays yet.</div>`;
  const upNext =
    g.state === "in" && g.downDistance
      ? `<div class="upnext"><b>${esc(g.downDistance)}</b><span>Up next${g.possession ? `, ${esc(sideTeam(g, g.possession).name)} ball` : ""}</span><span class="st-pill live">Live</span></div>`
      : "";
  const drives = [...g.drives]
    .reverse()
    .map((d) => {
      const list = d.plays.filter((p) => p.kind !== "break");
      if (!list.length) return "";
      return `<div class="drive">
        <div class="drive-head">${teamLogo(d.team, 26)}<b>${esc(d.team.name)}</b><small>${esc([d.result, d.description].filter(Boolean).join(" · "))}</small></div>
        ${[...list].reverse().map((p) => playCard(g, p, sel)).join("")}
      </div>`;
    })
    .join("");
  return upNext + drives;
}

function playCard(g, p, sel) {
  const on = sel && sel.id === p.id;
  const delta = p.wpDelta == null ? null : Math.round((p.side === "home" ? p.wpDelta : -p.wpDelta) * 100);
  const cls = ["pcard", on && "on", p.scoring && "score", p.turnover && "turnover", state.fresh.has(p.id) && "new"].filter(Boolean).join(" ");
  const team = sideTeam(g, p.side);
  return `<button class="${cls}" data-action="pick" data-id="${esc(p.id)}" aria-pressed="${!!on}">
    ${miniSvg(g, p)}
    <span class="pc-text"><small>${esc([p.downText && `${p.downText}${p.spot ? " at " + p.spot : ""}`, `${quarter(p.period)} ${p.clock}`].filter(Boolean).join(" · "))}</small>
      <span>${esc(p.text)}</span></span>
    <span class="pc-num"><b class="${p.touchdown ? "gold" : ""}">${p.yards == null || p.kind === "pat" ? "" : (p.yards > 0 ? "+" : "") + esc(p.yards)}</b>${delta ? `<small>${delta > 0 ? "+" : ""}${delta}% ${esc(team.abbr)}</small>` : ""}</span>
  </button>`;
}

function boxScore(g) {
  const periods = Math.max(g.away.linescores.length, g.home.linescores.length);
  const head = Array.from({ length: periods }, (_, i) => `<th>${esc(quarter(i + 1))}</th>`).join("");
  const row = (t) => `<tr><td>${esc(t.name)}</td>${Array.from({ length: periods }, (_, i) => `<td>${esc(t.linescores[i] ?? "")}</td>`).join("")}<td><b>${esc(t.score ?? "")}</b></td></tr>`;
  const want = ["totalYards", "netPassingYards", "rushingYards", "firstDowns", "thirdDownEff", "fourthDownEff", "turnovers", "totalPenaltiesYards", "possessionTime"];
  const stats = want.filter((k) => g.stats[k]).map((k) => `<tr><td>${esc(g.stats[k].label)}</td><td>${esc(g.stats[k].away)}</td><td>${esc(g.stats[k].home)}</td></tr>`).join("");
  const leaders = g.leaders.map((l) => `<tr><td>${esc(l.category)}</td><td>${esc(sideTeam(g, l.side)?.abbr || "")}</td><td>${esc(l.athlete)}</td><td>${esc(l.value)}</td></tr>`).join("");
  return `
    ${periods ? `<h3 class="lbl">Scoring</h3><div class="st-table dense"><table><thead><tr><th>Team</th>${head}<th>T</th></tr></thead><tbody>${row(g.away)}${row(g.home)}</tbody></table></div>` : ""}
    ${stats ? `<h3 class="lbl">Team stats</h3><div class="st-table dense"><table><thead><tr><th>Stat</th><th>${esc(g.away.abbr)}</th><th>${esc(g.home.abbr)}</th></tr></thead><tbody>${stats}</tbody></table></div>` : ""}
    ${leaders ? `<h3 class="lbl">Leaders</h3><div class="st-table dense"><table><thead><tr><th>Category</th><th>Team</th><th>Player</th><th>Line</th></tr></thead><tbody>${leaders}</tbody></table></div>` : ""}
    ${!periods && !stats && !leaders ? `<div class="empty small">The box score fills in once the game starts.</div>` : ""}`;
}

/** Click handling for this screen. Returns true when it handled the event. */
export function gameAction(action, target, app) {
  const g = state.data;
  if (!g) return false;
  const plays = timeline(g);
  if (action === "pick") {
    state.sel = target.dataset.id;
    state.follow = state.sel === plays.at(-1)?.id;
  } else if (action === "step") {
    const i = plays.findIndex((p) => p.id === state.sel);
    const next = plays[Math.max(0, Math.min(plays.length - 1, i + Number(target.dataset.step)))];
    state.sel = next?.id ?? state.sel;
    state.follow = state.sel === plays.at(-1)?.id;
  } else if (action === "live") {
    state.follow = true;
    state.sel = plays.at(-1)?.id ?? null;
  } else if (action === "tab") {
    state.tab = target.dataset.tab;
  } else {
    return false;
  }
  app.render();
  return true;
}

/** Crosshair and tooltip over the game-flow chart. */
export function flowHover(e) {
  const hit = e.target.closest?.(".flow-hit");
  if (!hit || !state.data) return;
  const ids = hit.dataset.ids.split(",");
  const r = hit.getBoundingClientRect();
  const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  const i = Math.round(f * (ids.length - 1));
  const p = timeline(state.data).find((x) => x.id === ids[i]);
  if (!p) return;
  const cross = hit.querySelector(".cross");
  const tip = hit.querySelector(".tip");
  const x = (i / (ids.length - 1)) * 100;
  cross.style.left = `${x}%`;
  cross.style.opacity = "1";
  const g = state.data;
  tip.innerHTML = `<small>${esc(quarter(p.period))} ${esc(p.clock)} · ${esc(g.home.abbr)} ${Math.round(p.wp * 100)}%</small><span>${esc(p.text)}</span>`;
  tip.style.left = `${Math.min(78, Math.max(0, x - 11))}%`;
  tip.style.opacity = "1";
  hit.dataset.hover = p.id;
}

export function flowLeave(e) {
  const hit = e.target.closest?.(".flow-hit");
  if (!hit) return;
  hit.querySelector(".cross").style.opacity = "0";
  hit.querySelector(".tip").style.opacity = "0";
}

export function flowClick(e, app) {
  const hit = e.target.closest?.(".flow-hit");
  if (!hit?.dataset.hover) return false;
  state.sel = hit.dataset.hover;
  state.follow = false;
  app.render();
  return true;
}

export const isLiveGame = () => state.data?.state === "in";
export const gameLeague = (league) => LEAGUES[league];
