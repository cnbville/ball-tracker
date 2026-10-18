// The "What's on" screen: every game of the week on a Berlin-time TV guide, one row per US network.

import { LEAGUES, scoreboard } from "./api.js";
import { EASTERN, berlinLead, clock, dayKey, fmt, longDay, shortDate, weekday, zoneLabel } from "./time.js";
import { esc, plural, teamLogo } from "./util.js";
import { hasReminder } from "./alerts.js";

const PX_PER_HOUR = 120;
const LABEL_W = 170;
const CHANNEL_ORDER = ["ABC", "CBS", "FOX", "NBC", "ESPN", "ESPN2", "FS1", "Peacock", "Prime Video", "Netflix", "NFL Net", "NFL Network", "BTN", "SECN", "ACCN", "CW", "ESPNU", "CBSSN", "ESPN+"];

const state = { shift: 0, day: null, sel: null, weeks: {}, loading: false, error: "" };

export const scheduleState = state;

function weekParams(board, shift) {
  if (!board || board.week == null) return null;
  return { week: board.week + shift, seasontype: board.seasonType };
}

/** Games for the week being shown. Week 0 comes from the app's live scoreboards. */
async function weekGames(app) {
  if (state.shift === 0) return [...(app.boards.cfb?.games || []), ...(app.boards.nfl?.games || [])];
  const key = String(state.shift);
  if (!state.weeks[key]) {
    state.loading = true;
    const results = await Promise.allSettled(
      Object.keys(LEAGUES).map((lg) => {
        const p = weekParams(app.boards[lg], state.shift);
        return p ? scoreboard(lg, p) : Promise.resolve({ games: [] });
      }),
    );
    state.loading = false;
    const ok = results.filter((r) => r.status === "fulfilled").map((r) => r.value.games);
    state.error = ok.length ? "" : "Couldn't load that week. Check your connection.";
    state.weeks[key] = ok.flat();
  }
  return state.weeks[key];
}

function channelOf(g) {
  return g.channels[0] || "No TV listed";
}

function rank(ch) {
  const i = CHANNEL_ORDER.indexOf(ch);
  return i === -1 ? (ch === "No TV listed" ? 999 : 500) : i;
}

function titleOf(g) {
  const r = (t) => (t.rank ? `No. ${t.rank} ` : "");
  return `${r(g.away)}${g.away.name} ${g.neutral ? "vs" : "at"} ${r(g.home)}${g.home.name}`;
}

function statusText(g) {
  if (g.state === "in") return `${g.away.abbr} ${g.away.score ?? 0}, ${g.home.abbr} ${g.home.score ?? 0} · ${g.detail}`;
  if (g.state === "post") return `Final · ${g.away.abbr} ${g.away.score ?? 0}, ${g.home.abbr} ${g.home.score ?? 0}`;
  return `${weekday(g.date)} ${clock(g.date)}`;
}

export async function renderSchedule(el, app) {
  const all = (await weekGames(app)).filter((g) => app.league === "all" || g.league === app.league);
  const now = Date.now();

  // US game days: a late kickoff on Saturday night in the US is still "Saturday", even though it's Sunday in Berlin.
  const byDay = new Map();
  for (const g of [...all].sort((a, b) => a.date - b.date)) {
    const k = dayKey(g.date, EASTERN);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(g);
  }
  const keys = [...byDay.keys()];
  if (!keys.includes(state.day)) {
    state.day =
      keys.find((k) => byDay.get(k).some((g) => g.state === "in")) ||
      keys.find((k) => byDay.get(k).some((g) => g.date + LEAGUES[g.league].minutes * 60000 > now)) ||
      keys[0] ||
      null;
  }
  const games = state.day ? byDay.get(state.day) : [];
  if (!games.some((g) => g.id === state.sel)) state.sel = (games.find((g) => g.state === "in") || games[0])?.id ?? null;
  const sel = games.find((g) => g.id === state.sel);

  const first = all.length ? Math.min(...all.map((g) => g.date)) : now;
  const last = all.length ? Math.max(...all.map((g) => g.date)) : now;
  const odd = all.filter((g) => berlinLead(g.date) !== 6);

  const dayTabs = keys
    .map((k) => {
      const list = byDay.get(k);
      const a = list[0].date;
      const b = Math.max(...list.map((g) => g.date + LEAGUES[g.league].minutes * 60000));
      const live = list.some((g) => g.state === "in");
      return `<button class="daytab" role="tab" aria-selected="${k === state.day}" data-action="day" data-day="${esc(k)}">
        <span>${esc(fmt(a, { weekday: "long" }, EASTERN))}${live ? ' <span class="dot"></span>' : ""}</span>
        <small>${plural(list.length, "game")} · ${esc(weekday(a))} ${esc(clock(a))} to ${esc(clock(b))}</small>
      </button>`;
    })
    .join("");

  el.innerHTML = `
  <div class="sched">
    <div class="sched-head">
      <div>
        <span class="lbl">${esc(state.shift === 0 ? "This week" : state.shift > 0 ? `${state.shift} week${state.shift > 1 ? "s" : ""} ahead` : `${-state.shift} week${state.shift < -1 ? "s" : ""} ago`)}${all.length ? ` · ${esc(shortDate(first))} to ${esc(shortDate(last))}` : ""}</span>
        <h1 class="st-wide">What's on</h1>
      </div>
      <div class="weeknav">
        <button class="st-icon-btn" data-action="week" data-step="-1" aria-label="Previous week"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>
        <button class="st-btn glass small" data-action="week" data-step="0" ${state.shift === 0 ? "disabled" : ""}>This week</button>
        <button class="st-icon-btn" data-action="week" data-step="1" aria-label="Next week"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>
      </div>
      <div class="tzcard">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
        <div><b>Berlin time</b><small>${esc(zoneLabel(sel?.date ?? now))}</small></div>
      </div>
    </div>
    ${odd.length ? `<div class="banner-note" role="note">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/></svg>
      <span><b>Berlin and the US change clocks on different weekends.</b> For ${plural(odd.length, "game")} this week, US kickoffs are ${berlinLead(odd[0].date) < 6 ? "one hour earlier" : "one hour later"} than usual for you. The times below already account for it.</span>
    </div>` : ""}
    ${state.error ? `<div class="banner-note bad">${esc(state.error)}</div>` : ""}
    <div class="daytabs" role="tablist" aria-label="Game day">${dayTabs || ""}</div>
    ${games.length ? body(games, sel, now) : `<div class="empty">${state.loading ? "Loading the schedule…" : "No games this week for this filter."}</div>`}
  </div>`;

  const grid = el.querySelector(".guide-scroll");
  if (grid) {
    const nowX = grid.dataset.nowx ? Number(grid.dataset.nowx) : null;
    const target = sel ? Number(el.querySelector(`[data-id="${CSS.escape(sel.id)}"]`)?.dataset.x || 0) : 0;
    grid.scrollLeft = Math.max(0, (nowX ?? target) - 220);
  }
}

function body(games, sel, now) {
  const minutes = (g) => LEAGUES[g.league].minutes * 60000;
  const origin = Math.floor(Math.min(...games.map((g) => g.date)) / 3600000) * 3600000 - 1800000;
  const endAll = Math.max(...games.map((g) => g.date + minutes(g)));
  const hours = Math.ceil((endAll - origin) / 3600000) + 1;
  const width = hours * PX_PER_HOUR;
  const x = (ms) => ((ms - origin) / 3600000) * PX_PER_HOUR;

  const channels = new Map();
  for (const g of games) {
    const ch = channelOf(g);
    if (!channels.has(ch)) channels.set(ch, []);
    channels.get(ch).push(g);
  }
  const rows = [...channels.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
    .flatMap(([ch, list]) => {
      const lanes = [];
      for (const g of list.sort((a, b) => a.date - b.date)) {
        let i = lanes.findIndex((l) => l.end <= g.date);
        if (i === -1) {
          lanes.push({ end: 0, games: [] });
          i = lanes.length - 1;
        }
        lanes[i].end = g.date + minutes(g);
        lanes[i].games.push(g);
      }
      return lanes.map((l, i) => ({ ch, first: i === 0, games: l.games }));
    });

  let ticks = "";
  for (let i = 0; i < hours; i++) {
    const t = origin + 1800000 + i * 3600000;
    ticks += `<span class="tick" style="left:${x(t)}px">${esc(clock(t))}</span>`;
  }
  const nowX = now >= origin && now <= origin + hours * 3600000 ? x(now) : null;

  const rowHtml = rows
    .map(
      (r) => `<div class="guide-row">
      <div class="guide-ch">${r.first ? `<span class="chbadge">${esc(r.ch)}</span>` : ""}</div>
      <div class="guide-track" style="width:${width}px">${r.games
        .map((g) => {
          const on = sel && g.id === sel.id;
          return `<button class="blk${on ? " on" : ""}${g.state === "in" ? " live" : ""}${g.state === "post" ? " done" : ""}" data-action="select" data-id="${esc(g.id)}" data-x="${x(g.date)}"
            style="left:${x(g.date) + 2}px;width:${(minutes(g) / 3600000) * PX_PER_HOUR - 4}px;background:linear-gradient(100deg, ${esc(g.away.fill)}, ${esc(g.home.fill)})"
            aria-pressed="${on}" aria-label="${esc(titleOf(g))}, ${esc(weekday(g.date))} ${esc(clock(g.date))} Berlin time on ${esc(r.ch)}">
            <span class="blk-logos">${teamLogo(g.away, 22)}${teamLogo(g.home, 22)}</span>
            <span class="blk-text"><b>${esc(titleOf(g))}</b><small>${esc(statusText(g))}</small></span>
          </button>`;
        })
        .join("")}</div></div>`,
    )
    .join("");

  const list = [...games]
    .sort((a, b) => a.date - b.date)
    .map((g) => {
      const on = sel && g.id === sel.id;
      return `<button class="srow${on ? " on" : ""}" data-action="select" data-id="${esc(g.id)}" aria-pressed="${on}">
        <span class="srow-time"><b>${esc(clock(g.date))}</b><small>${esc(weekday(g.date))}</small></span>
        <span class="srow-logos">${teamLogo(g.away, 22)}${teamLogo(g.home, 22)}</span>
        <span class="srow-title"><b>${esc(titleOf(g))}</b><small>${g.state === "in" ? '<span class="dot"></span> ' : ""}${esc(g.state === "pre" ? LEAGUES[g.league].label : statusText(g))}</small></span>
        <span class="chbadge sm">${esc(channelOf(g))}</span>
      </button>`;
    })
    .join("");

  return `<div class="sched-body">
    <section class="st-glass guide" aria-label="TV guide in Berlin time">
      <div class="guide-scroll" ${nowX != null ? `data-nowx="${nowX}"` : ""}>
        <div class="guide-inner" style="width:${width + LABEL_W}px">
          <div class="guide-row head"><div class="guide-ch"><span class="lbl">Network</span></div><div class="guide-track ticks" style="width:${width}px">${ticks}</div></div>
          ${rowHtml}
          ${nowX != null ? `<div class="nowline" style="left:${LABEL_W + nowX}px"><span>${esc(clock(now))}</span></div>` : ""}
        </div>
      </div>
    </section>
    <aside class="sched-side">
      ${sel ? detail(sel) : ""}
      <section class="st-glass slist" aria-label="Games this day">
        <div class="slist-head"><span class="lbl">All games</span><small>${plural(games.length, "game")}</small></div>
        <div class="slist-rows">${list}</div>
      </section>
    </aside>
  </div>`;
}

function detail(g) {
  const reminder = hasReminder(g.id);
  const scoreLine =
    g.state === "pre"
      ? ""
      : `<div class="det-score"><b>${esc(g.away.score ?? 0)}</b><span>${g.state === "in" ? `<span class="st-pill live">${esc(g.detail)}</span>` : esc(g.detail)}</span><b>${esc(g.home.score ?? 0)}</b></div>`;
  return `<section class="st-glass det" aria-label="Selected game" style="--a:${esc(g.away.fill)};--h:${esc(g.home.fill)}">
    <div class="det-bg" aria-hidden="true"></div>
    <div class="det-in">
      <div class="det-top"><span class="st-pill">${esc(LEAGUES[g.league].label)}</span><small>${esc(g.venue)}</small></div>
      <div class="det-teams">
        <div>${teamLogo(g.away, 56)}<b>${esc(g.away.name)}</b><small>${esc(g.away.record)}</small></div>
        <span class="lbl">${g.neutral ? "vs" : "at"}</span>
        <div>${teamLogo(g.home, 56)}<b>${esc(g.home.name)}</b><small>${esc(g.home.record)}</small></div>
      </div>
      ${scoreLine}
      <div class="det-times">
        <div><span class="lbl">Berlin</span><b>${esc(clock(g.date))}</b><small>${esc(longDay(g.date))}</small></div>
        <div class="et"><span class="lbl">US Eastern</span><b>${esc(clock(g.date, EASTERN))}</b><small>${esc(fmt(g.date, { weekday: "long" }, EASTERN))}</small></div>
      </div>
      <div class="det-ch"><span class="chbadge">${esc(channelOf(g))}</span><div><b>${esc(g.channels.join(", ") || "No TV listed yet")}</b><small>US network</small></div></div>
      <div class="det-actions">
        ${g.state === "pre" ? `<button class="st-btn ${reminder ? "glass" : "primary"} small" data-action="remind" data-id="${esc(g.id)}">${reminder ? "Reminder set · Cancel" : "Remind me 15 min before"}</button>` : ""}
        <a class="st-btn ${g.state === "pre" ? "glass" : "primary"} small" href="#/game/${esc(g.league)}/${esc(g.id)}">${g.state === "pre" ? "Preview" : g.state === "in" ? "Watch play-by-play" : "Recap"}</a>
      </div>
    </div>
  </section>`;
}

/** Click handling for this screen. Returns true when it handled the event. */
export function scheduleAction(action, target, app) {
  if (action === "day") {
    state.day = target.dataset.day;
    state.sel = null;
  } else if (action === "select") {
    state.sel = target.dataset.id;
  } else if (action === "week") {
    const step = Number(target.dataset.step);
    state.shift = step === 0 ? 0 : state.shift + step;
    state.day = null;
    state.sel = null;
  } else {
    return false;
  }
  app.render();
  return true;
}

export function findGame(app, id) {
  const pool = [...(app.boards.cfb?.games || []), ...(app.boards.nfl?.games || []), ...Object.values(state.weeks).flat()];
  return pool.find((g) => g.id === id);
}

