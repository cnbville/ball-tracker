// ESPN's public scoreboard and summary feeds, turned into the shapes the screens use.
// Inside the app the Rust side does the request; in a plain browser (tests) we fetch directly.

import { teamFill, teamGlow } from "./util.js";

const BASE = "https://site.api.espn.com/apis/site/v2/sports/football/";

export const LEAGUES = {
  cfb: { path: "college-football", label: "College", extra: { groups: "80", limit: "400" }, minutes: 210 },
  nfl: { path: "nfl", label: "NFL", extra: {}, minutes: 195 },
};

async function espn(league, endpoint, params = {}) {
  const L = LEAGUES[league];
  const query = { ...(endpoint === "scoreboard" ? L.extra : {}), ...params };
  const tauri = window.__TAURI__;
  if (tauri?.core) {
    return tauri.core.invoke("espn", {
      league: L.path,
      endpoint,
      query: Object.entries(query).map(([k, v]) => [k, String(v)]),
    });
  }
  const res = await fetch(`${BASE}${L.path}/${endpoint}?${new URLSearchParams(query)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`ESPN answered ${res.status}`);
  return res.json();
}

function team(c) {
  const t = c.team || {};
  const color = t.color ? "#" + t.color : "";
  const alt = t.alternateColor ? "#" + t.alternateColor : "";
  const logos = t.logos || [];
  const dark = logos.find((l) => (l.rel || []).includes("dark"));
  const fill = teamFill(color, alt);
  const rank = c.curatedRank?.current ?? c.rank;
  return {
    id: String(t.id ?? ""),
    abbr: t.abbreviation || "",
    name: t.shortDisplayName || t.displayName || t.name || "",
    full: t.displayName || t.name || "",
    logo: dark?.href || t.logo || logos[0]?.href || "",
    fill,
    glow: teamGlow(fill),
    score: c.score == null || c.score === "" ? null : Number(c.score?.value ?? c.score),
    rank: rank && rank <= 25 ? rank : null,
    record: c.records?.[0]?.summary || c.record?.[0]?.summary || c.record?.[0]?.displayValue || "",
    homeAway: c.homeAway,
    linescores: (c.linescores || []).map((l) => l.displayValue ?? String(l.value ?? "")),
  };
}

function channelsOf(comp) {
  const names = (comp.broadcasts || []).flatMap((b) => b.names || []);
  const geo = (comp.geoBroadcasts || []).map((g) => g.media?.shortName).filter(Boolean);
  return [...new Set(names.length ? names : geo)];
}

/** One game from a scoreboard event. */
export function gameFromEvent(e, league) {
  const comp = e.competitions?.[0] || {};
  const status = e.status || comp.status || {};
  const st = status.type || {};
  const competitors = (comp.competitors || []).map(team);
  const away = competitors.find((c) => c.homeAway === "away") || competitors[0];
  const home = competitors.find((c) => c.homeAway === "home") || competitors[1];
  const sit = comp.situation || {};
  const venue = comp.venue || {};
  const city = [venue.address?.city, venue.address?.state || venue.address?.country].filter(Boolean).join(", ");
  return {
    id: String(e.id),
    league,
    date: Date.parse(e.date || comp.date),
    state: st.state || "pre",
    detail: st.shortDetail || st.detail || "",
    away,
    home,
    channels: channelsOf(comp),
    venue: [venue.fullName, city].filter(Boolean).join(", "),
    neutral: !!comp.neutralSite,
    possession: sit.possession ? String(sit.possession) : null,
    downDistance: sit.downDistanceText || "",
    lastPlay: sit.lastPlay?.text || "",
    redZone: !!sit.isRedZone,
  };
}

export async function scoreboard(league, params = {}) {
  const data = await espn(league, "scoreboard", params);
  return {
    league,
    week: data.week?.number ?? null,
    seasonType: data.season?.type ?? 2,
    games: (data.events || []).map((e) => gameFromEvent(e, league)),
  };
}

function playKind(p) {
  const t = `${p.type?.text || ""} ${p.type?.abbreviation || ""}`;
  const text = p.text || "";
  if (/kickoff/i.test(t)) return "kick";
  if (/punt/i.test(t)) return "punt";
  if (/field goal/i.test(t)) return "fg";
  if (/extra point|two[- ]point|2pt/i.test(t)) return "pat";
  if (/sack/i.test(t)) return "sack";
  if (/pass|interception/i.test(t)) return "pass";
  if (/rush|run/i.test(t)) return "run";
  if (/penalty/i.test(t)) return "penalty";
  if (/timeout|end of|end period|halftime|coin toss/i.test(t)) return "break";
  if (/pass/i.test(text)) return "pass";
  if (/\brun\b|rush/i.test(text)) return "run";
  return "other";
}

function laneOf(text) {
  const s = (text || "").toLowerCase();
  if (/\bleft\b/.test(s)) return "left";
  if (/\bright\b/.test(s)) return "right";
  return "middle";
}

/** A whole game from the summary feed: header, drives with plays, win probability, box score. */
export async function gameSummary(league, id) {
  const data = await espn(league, "summary", { event: id });
  const comp = data.header?.competitions?.[0];
  if (!comp) throw new Error("Game not found");
  const competitors = (comp.competitors || []).map(team);
  const away = competitors.find((c) => c.homeAway === "away") || competitors[0];
  const home = competitors.find((c) => c.homeAway === "home") || competitors[1];
  const st = comp.status?.type || {};
  const teamSide = (tid) => (String(tid) === home.id ? "home" : String(tid) === away.id ? "away" : null);

  const prev = data.drives?.previous || [];
  const cur = data.drives?.current;
  const rawDrives = [...prev];
  if (cur && !prev.some((d) => d.id === cur.id)) rawDrives.push({ ...cur, inProgress: true });

  const wpByPlay = new Map((data.winprobability || []).map((w) => [String(w.playId), w.homeWinPercentage]));
  const drives = rawDrives.map((d, di) => {
    const side = teamSide(d.team?.id);
    const plays = (d.plays || []).map((p) => {
      const offense = teamSide(p.start?.team?.id) || side;
      const endSide = teamSide(p.end?.team?.id) || offense;
      return {
        id: String(p.id),
        driveIndex: di,
        side: offense,
        endSide,
        kind: playKind(p),
        lane: laneOf(p.text),
        text: p.text || p.type?.text || "",
        typeText: p.type?.text || "",
        period: p.period?.number ?? null,
        clock: p.clock?.displayValue || "",
        down: p.start?.down ?? 0,
        distance: p.start?.distance ?? 0,
        downText: p.start?.shortDownDistanceText || p.start?.downDistanceText || "",
        spot: p.start?.possessionText || "",
        startYte: p.start?.yardsToEndzone,
        endYte: p.end?.yardsToEndzone,
        yards: typeof p.statYardage === "number" ? p.statYardage : null,
        scoring: !!p.scoringPlay,
        touchdown: !!p.scoringPlay && /touchdown/i.test(`${p.text} ${p.type?.text} ${p.scoringType?.name || ""}`),
        incomplete: /incomplet/i.test(p.text || p.type?.text || ""),
        turnover: /interception|fumble/i.test(`${p.type?.text} ${p.text}`) && side !== teamSide(p.end?.team?.id),
        awayScore: p.awayScore,
        homeScore: p.homeScore,
        wp: wpByPlay.has(String(p.id)) ? wpByPlay.get(String(p.id)) : null,
      };
    });
    return {
      id: String(d.id ?? di),
      side,
      team: side === "home" ? home : away,
      result: d.inProgress ? "In progress" : d.displayResult || d.result || "",
      isScore: !!d.isScore,
      description: d.description || "",
      inProgress: !!d.inProgress,
      plays,
    };
  });

  const stats = {};
  for (const t of data.boxscore?.teams || []) {
    const side = teamSide(t.team?.id);
    if (!side) continue;
    for (const s of t.statistics || []) {
      stats[s.name] ??= { label: s.label || s.name, away: "", home: "" };
      stats[s.name][side] = s.displayValue ?? "";
    }
  }

  const leaders = (data.leaders || []).flatMap((group) => {
    const side = teamSide(group.team?.id);
    return (group.leaders || []).map((cat) => {
      const top = cat.leaders?.[0];
      return top
        ? { side, category: cat.displayName || cat.name, athlete: top.athlete?.shortName || top.athlete?.displayName || "", value: top.displayValue || "" }
        : null;
    });
  }).filter(Boolean);

  const sit = data.situation || comp.situation || {};
  const venue = data.gameInfo?.venue;
  return {
    id: String(id),
    league,
    state: st.state || "pre",
    detail: st.shortDetail || st.detail || "",
    date: Date.parse(comp.date),
    away,
    home,
    channels: channelsOf(comp),
    venue: venue ? [venue.fullName, venue.address?.city].filter(Boolean).join(", ") : "",
    possession: sit.possession ? teamSide(sit.possession) : null,
    downDistance: sit.downDistanceText || "",
    drives,
    stats,
    leaders,
    hasWinProbability: wpByPlay.size > 1,
  };
}
