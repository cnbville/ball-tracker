// App shell: title bar, sidebar of games, routing between the schedule and a game, and polling.

import { LEAGUES, scoreboard } from "./api.js";
import { renderSchedule, scheduleAction, scheduleState } from "./schedule.js";
import { flowClick, flowHover, flowLeave, gameAction, gameState, loadGame, renderGame } from "./game.js";
import { setOpenGame, toggleFollow, toggleReminder, updateMenuBar, watchScores } from "./alerts.js";
import { clock, kickoffText } from "./time.js";
import { $, esc, load, save, teamLogo } from "./util.js";

const app = {
  league: load("league", "all"),
  boards: {},
  route: { name: "schedule" },
  updated: null,
  boardError: "",
  render,
};
window.gridiron = app;

const KEEP_SCROLL = [".playside-body", ".slist-rows", ".guide-scroll", "#sidebar .side-scroll"];

// ---- data ----
async function refreshBoards() {
  const results = await Promise.allSettled(Object.keys(LEAGUES).map((lg) => scoreboard(lg)));
  results.forEach((r, i) => {
    if (r.status === "fulfilled") app.boards[Object.keys(LEAGUES)[i]] = r.value;
  });
  const failed = results.filter((r) => r.status === "rejected");
  app.boardError = failed.length === results.length ? `Can't reach the score feed (${failed[0].reason?.message || failed[0].reason}). Retrying.` : "";
  const games = allGames();
  watchScores(games);
  updateMenuBar(games);
  app.updated = Date.now();
}

const allGames = () => [...(app.boards.cfb?.games || []), ...(app.boards.nfl?.games || [])];

let boardTimer, gameTimer;
async function boardLoop() {
  clearTimeout(boardTimer);
  await refreshBoards();
  render();
  const live = allGames().some((g) => g.state === "in");
  boardTimer = setTimeout(boardLoop, live ? 30000 : 300000);
}

async function gameLoop() {
  clearTimeout(gameTimer);
  if (app.route.name !== "game") return;
  const { league, id } = app.route;
  await loadGame(league, id);
  if (app.route.name !== "game" || app.route.id !== id) return;
  render();
  gameTimer = setTimeout(gameLoop, gameState.data?.state === "in" ? 10000 : 120000);
}

// ---- routing ----
function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "game" && LEAGUES[parts[1]] && parts[2]) return { name: "game", league: parts[1], id: parts[2] };
  return { name: "schedule" };
}

function onRoute() {
  app.route = parseRoute();
  if (app.route.name !== "game") setOpenGame(null);
  render();
  if (app.route.name === "game") gameLoop();
}

// ---- rendering ----
function render() {
  const kept = KEEP_SCROLL.map((sel) => {
    const el = document.querySelector(sel);
    return el ? [sel, el.scrollTop, el.scrollLeft] : null;
  }).filter(Boolean);

  renderTitle();
  renderSidebar();
  const view = $("#view");
  const room = $("#room");
  const g = app.route.name === "game" ? gameState.data : null;
  room.style.setProperty("--accent", g ? (g.possession === "home" ? g.home.fill : g.away.fill) : "#24345e");
  room.style.setProperty("--accent-2", g ? (g.possession === "home" ? g.away.fill : g.home.fill) : "#4a1a2c");
  if (app.route.name === "game") {
    view.dataset.screen = "game";
    renderGame(view);
  } else {
    view.dataset.screen = "schedule";
    renderSchedule(view, app).then(() => restore(kept, true));
  }
  restore(kept, false);
}

function restore(kept, scheduleOnly) {
  for (const [sel, top, left] of kept) {
    if (scheduleOnly && sel !== ".guide-scroll" && sel !== ".slist-rows") continue;
    const el = document.querySelector(sel);
    if (!el) continue;
    if (sel === ".guide-scroll" && !scheduleState.keepScroll) continue;
    el.scrollTop = top;
    el.scrollLeft = left;
  }
}

function renderTitle() {
  for (const b of document.querySelectorAll("[data-league]")) b.setAttribute("aria-selected", String(b.dataset.league === app.league));
  $("#updated").textContent = app.boardError || (app.updated ? `Updated ${clock(app.updated)}` : "Connecting…");
  $("#updated").classList.toggle("bad", !!app.boardError);
  $("#nav-schedule").setAttribute("aria-current", String(app.route.name === "schedule"));
}

function sideRow(g) {
  const on = app.route.name === "game" && app.route.id === g.id;
  const score = (t) => (g.state === "pre" ? "" : esc(t.score ?? 0));
  const status =
    g.state === "in"
      ? `<span class="dot"></span>${esc(g.detail)}`
      : g.state === "pre"
        ? `${esc(kickoffText(g.date))}${g.channels[0] ? " · " + esc(g.channels[0]) : ""}`
        : esc(g.detail);
  const lead = (a, b) => g.state === "post" && (a.score ?? 0) < (b.score ?? 0);
  return `<a class="side-game${on ? " on" : ""}" href="#/game/${esc(g.league)}/${esc(g.id)}" ${on ? 'aria-current="true"' : ""}>
    <span class="sg-team${lead(g.away, g.home) ? " lost" : ""}">${teamLogo(g.away, 22)}<span>${g.away.rank ? `<i>${g.away.rank}</i>` : ""}${esc(g.away.name)}</span><b>${score(g.away)}</b></span>
    <span class="sg-team${lead(g.home, g.away) ? " lost" : ""}">${teamLogo(g.home, 22)}<span>${g.home.rank ? `<i>${g.home.rank}</i>` : ""}${esc(g.home.name)}</span><b>${score(g.home)}</b></span>
    <small>${status}</small>
  </a>`;
}

function renderSidebar() {
  const games = allGames().filter((g) => app.league === "all" || g.league === app.league);
  const now = Date.now();
  const live = games.filter((g) => g.state === "in");
  const soon = games.filter((g) => g.state === "pre" && g.date - now < 36 * 3600000).sort((a, b) => a.date - b.date);
  const done = games.filter((g) => g.state === "post" && now - g.date < 30 * 3600000).sort((a, b) => b.date - a.date);
  const section = (title, list) => (list.length ? `<div class="side-h">${title} · ${list.length}</div>${list.map(sideRow).join("")}` : "");
  const body = section("Live", live) + section("Next 36 hours", soon) + section("Final", done);
  $("#sidebar .side-scroll").innerHTML = body || `<div class="empty small">${Object.keys(app.boards).length ? "No games right now." : "Loading games…"}</div>`;
}

// ---- events ----
document.addEventListener("click", (e) => {
  const league = e.target.closest("[data-league]");
  if (league) {
    app.league = league.dataset.league;
    save("league", app.league);
    scheduleState.day = null;
    render();
    return;
  }
  if (flowClick(e, app)) return;
  const t = e.target.closest("[data-action]");
  if (!t) return;
  const action = t.dataset.action;
  if (action === "remind") {
    const g = allGames().concat(Object.values(scheduleState.weeks).flat()).find((x) => x.id === t.dataset.id);
    if (g) toggleReminder(g);
    render();
    return;
  }
  if (action === "follow" && gameState.data) {
    toggleFollow(gameState.data.league, t.dataset.team);
    render();
    return;
  }
  if (app.route.name === "game" ? gameAction(action, t, app) : false) return;
  if (action === "day" || action === "week") scheduleState.keepScroll = false;
  else scheduleState.keepScroll = true;
  scheduleAction(action, t, app);
});

document.addEventListener("mousemove", flowHover);
document.addEventListener("mouseout", (e) => {
  if (e.target.classList?.contains("flow-hit")) flowLeave(e);
});

document.addEventListener("keydown", (e) => {
  if (app.route.name !== "game" || e.target.closest("input, textarea")) return;
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    const fake = { dataset: { step: e.key === "ArrowLeft" ? "-1" : "1" } };
    gameAction("step", fake, app);
    e.preventDefault();
  } else if (e.key === "Escape") {
    location.hash = "#/schedule";
  }
});

window.addEventListener("hashchange", onRoute);
setInterval(() => {
  // Keeps "in 12 min" labels and the touchdown flash current between polls.
  if (gameState.flash || app.route.name === "schedule") render();
}, 60000);

onRoute();
boardLoop();
