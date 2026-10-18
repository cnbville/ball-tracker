// Mac notifications for scores and kickoff reminders, and the score shown in the menu bar.

import { load, save } from "./util.js";
import { clock } from "./time.js";

const tauri = window.__TAURI__;
let permission = null;

async function allowed() {
  if (permission !== null) return permission;
  try {
    if (tauri?.notification) {
      permission = await tauri.notification.isPermissionGranted();
      if (!permission) permission = (await tauri.notification.requestPermission()) === "granted";
    } else if ("Notification" in window) {
      permission = Notification.permission === "granted" || (await Notification.requestPermission()) === "granted";
    } else {
      permission = false;
    }
  } catch {
    permission = false;
  }
  return permission;
}

export async function notify(title, body) {
  if (!(await allowed())) return;
  if (tauri?.notification) tauri.notification.sendNotification({ title, body });
  else new Notification(title, { body });
}

export function setMenuBarScore(text) {
  if (tauri?.core) tauri.core.invoke("set_menu_bar_score", { text }).catch(() => {});
}

// ---- followed teams ----
const followKey = (league, teamId) => `${league}:${teamId}`;
export const follows = () => new Set(load("follows", []));
export function isFollowed(league, teamId) {
  return follows().has(followKey(league, teamId));
}
export function toggleFollow(league, teamId) {
  const set = follows();
  const k = followKey(league, teamId);
  set.has(k) ? set.delete(k) : set.add(k);
  save("follows", [...set]);
  return set.has(k);
}
const gameFollowed = (g) => isFollowed(g.league, g.away.id) || isFollowed(g.league, g.home.id);

// ---- kickoff reminders ----
export const reminders = () => load("reminders", {});
export function hasReminder(id) {
  return !!reminders()[id];
}
export function toggleReminder(game) {
  const all = reminders();
  if (all[game.id]) delete all[game.id];
  else {
    all[game.id] = {
      at: game.date,
      title: `${game.away.name} at ${game.home.name}`,
      channel: game.channels[0] || "",
    };
    allowed();
  }
  save("reminders", all);
  return !!all[game.id];
}

function checkReminders(now = Date.now()) {
  const all = reminders();
  let changed = false;
  for (const [id, r] of Object.entries(all)) {
    if (now >= r.at - 15 * 60000) {
      if (now < r.at + 30 * 60000) {
        notify(`Kickoff at ${clock(r.at)}`, `${r.title}${r.channel ? " on " + r.channel : ""}`);
      }
      delete all[id];
      changed = true;
    }
  }
  if (changed) save("reminders", all);
}

// ---- score changes ----
const lastScores = new Map();
let openGameId = null;
let onScore = () => {};

export function setOpenGame(id) {
  openGameId = id;
}
export function onScoreChange(fn) {
  onScore = fn;
}

function scoreLabel(points) {
  if (points >= 6) return "Touchdown";
  if (points === 3) return "Field goal";
  if (points === 2) return "Safety or two-point try";
  return null;
}

/** Called with every fresh scoreboard. Sends a notification when a watched game's score goes up. */
export function watchScores(games) {
  for (const g of games) {
    if (g.state !== "in" && g.state !== "post") continue;
    const now = [g.away.score ?? 0, g.home.score ?? 0];
    const before = lastScores.get(g.id);
    lastScores.set(g.id, now);
    if (!before) continue;
    // The open game notifies from its own, faster play-by-play feed.
    const watched = g.id !== openGameId && gameFollowed(g);
    [g.away, g.home].forEach((t, i) => {
      const pts = now[i] - before[i];
      const label = pts > 0 && scoreLabel(pts);
      if (!label) return;
      const score = `${g.away.abbr} ${now[0]}, ${g.home.abbr} ${now[1]} · ${g.detail}`;
      if (watched) notify(`${label}, ${t.name}`, g.lastPlay ? `${score}\n${g.lastPlay}` : score);
      onScore({ game: g, team: t, label, score });
    });
  }
}

/** Menu bar text: the open game if it's live, else the first live game of a followed team. */
export function updateMenuBar(games) {
  const live = games.filter((g) => g.state === "in");
  const pick = live.find((g) => g.id === openGameId) || live.find(gameFollowed);
  setMenuBarScore(pick ? `${pick.away.abbr} ${pick.away.score ?? 0} ${pick.home.abbr} ${pick.home.score ?? 0} · ${pick.detail}` : "");
}

setInterval(checkReminders, 30000);
checkReminders();
