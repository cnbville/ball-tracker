// Builds sample ESPN-shaped feeds for the UI tests. The cloud test machine can't reach ESPN,
// so these mirror the fields the app reads from the real scoreboard and summary endpoints.
// Run: node tests/make-fixtures.mjs

import { writeFileSync, mkdirSync } from "node:fs";

const out = new URL("./fixtures/", import.meta.url);
mkdirSync(out, { recursive: true });

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const T = {
  PSU: { id: "213", abbreviation: "PSU", displayName: "Penn State Nittany Lions", shortDisplayName: "Penn State", color: "061440", alternateColor: "ffffff" },
  OSU: { id: "194", abbreviation: "OSU", displayName: "Ohio State Buckeyes", shortDisplayName: "Ohio State", color: "ba0c2f", alternateColor: "a7b1b7" },
  ALA: { id: "333", abbreviation: "ALA", displayName: "Alabama Crimson Tide", shortDisplayName: "Alabama", color: "9e1b32", alternateColor: "828a8f" },
  TENN: { id: "2633", abbreviation: "TENN", displayName: "Tennessee Volunteers", shortDisplayName: "Tennessee", color: "ff8200", alternateColor: "58595b" },
  MICH: { id: "130", abbreviation: "MICH", displayName: "Michigan Wolverines", shortDisplayName: "Michigan", color: "00274c", alternateColor: "ffcb05" },
  MSU: { id: "127", abbreviation: "MSU", displayName: "Michigan State Spartans", shortDisplayName: "Michigan St", color: "18453b", alternateColor: "ffffff" },
  ORE: { id: "2483", abbreviation: "ORE", displayName: "Oregon Ducks", shortDisplayName: "Oregon", color: "154733", alternateColor: "fee123" },
  UW: { id: "264", abbreviation: "UW", displayName: "Washington Huskies", shortDisplayName: "Washington", color: "33006f", alternateColor: "e8d3a2" },
  LSU: { id: "99", abbreviation: "LSU", displayName: "LSU Tigers", shortDisplayName: "LSU", color: "461d7c", alternateColor: "fdd023" },
  MISS: { id: "145", abbreviation: "MISS", displayName: "Ole Miss Rebels", shortDisplayName: "Ole Miss", color: "13294b", alternateColor: "c8102e" },
  CLEM: { id: "228", abbreviation: "CLEM", displayName: "Clemson Tigers", shortDisplayName: "Clemson", color: "f56600", alternateColor: "522d80" },
  VT: { id: "259", abbreviation: "VT", displayName: "Virginia Tech Hokies", shortDisplayName: "Virginia Tech", color: "630031", alternateColor: "cf4420" },
  BUF: { id: "2", abbreviation: "BUF", displayName: "Buffalo Bills", shortDisplayName: "Bills", color: "00338d", alternateColor: "d50a0a" },
  MIA: { id: "15", abbreviation: "MIA", displayName: "Miami Dolphins", shortDisplayName: "Dolphins", color: "008e97", alternateColor: "fc4c02" },
  GB: { id: "9", abbreviation: "GB", displayName: "Green Bay Packers", shortDisplayName: "Packers", color: "204e32", alternateColor: "ffb612" },
  DET: { id: "8", abbreviation: "DET", displayName: "Detroit Lions", shortDisplayName: "Lions", color: "0076b6", alternateColor: "bbbbbb" },
  KC: { id: "12", abbreviation: "KC", displayName: "Kansas City Chiefs", shortDisplayName: "Chiefs", color: "e31837", alternateColor: "ffb612" },
  LV: { id: "13", abbreviation: "LV", displayName: "Las Vegas Raiders", shortDisplayName: "Raiders", color: "000000", alternateColor: "a5acaf" },
  DAL: { id: "6", abbreviation: "DAL", displayName: "Dallas Cowboys", shortDisplayName: "Cowboys", color: "002a5c", alternateColor: "b0b7bc" },
  PHI: { id: "21", abbreviation: "PHI", displayName: "Philadelphia Eagles", shortDisplayName: "Eagles", color: "06424d", alternateColor: "a5acaf" },
};
const logo = (league, t) => `https://a.espncdn.com/i/teamlogos/${league}/500/${t.id}.png`;

function competitor(league, abbr, homeAway, score, extra = {}) {
  const t = T[abbr];
  return {
    homeAway,
    score: score == null ? "0" : String(score),
    team: { ...t, logo: logo(league, t), logos: [{ href: logo(league, t), rel: ["full", "default"] }] },
    records: [{ summary: extra.record || "5-2" }],
    curatedRank: { current: extra.rank ?? 99 },
  };
}

function event(league, id, away, home, iso, channel, state, scores = [], extra = {}) {
  const detail = { pre: "Sat, October 24th", in: extra.detail || "2nd - 8:14", post: "Final" }[state];
  return {
    id,
    date: iso,
    name: `${T[away].displayName} at ${T[home].displayName}`,
    status: { type: { state, shortDetail: detail, completed: state === "post" } },
    competitions: [{
      date: iso,
      neutralSite: false,
      venue: { fullName: extra.venue || "Stadium", address: { city: extra.city || "City", state: extra.st || "ST" } },
      broadcasts: channel ? [{ market: "national", names: [channel] }] : [],
      competitors: [
        competitor(league, home, "home", scores[1], extra.home),
        competitor(league, away, "away", scores[0], extra.away),
      ],
      situation: state === "in" ? { possession: extra.possession || T[away].id, downDistanceText: extra.dd || "1st & 10 at 50", lastPlay: { text: extra.last || "" } } : undefined,
    }],
  };
}

const cfb = {
  week: { number: 9 },
  season: { type: 2 },
  events: [
    event("ncaa", "401900001", "PSU", "OSU", "2026-10-24T19:30:00Z", "FOX", "in", [21, 24], { detail: "5:58 - 4th", possession: "213", dd: "2nd & 6 at PSU 41", last: "Kaytron Allen run to the left for 4 yards", venue: "Ohio Stadium", city: "Columbus", st: "OH", home: { rank: 3, record: "7-0" }, away: { rank: 7, record: "6-1" } }),
    event("ncaa", "401900002", "CLEM", "VT", "2026-10-24T16:00:00Z", "ESPN", "post", [31, 17], { venue: "Lane Stadium", city: "Blacksburg", st: "VA" }),
    event("ncaa", "401900003", "ALA", "TENN", "2026-10-24T19:30:00Z", "ABC", "in", [17, 20], { detail: "2:10 - 4th", venue: "Neyland Stadium", city: "Knoxville", st: "TN", away: { rank: 9 } }),
    event("ncaa", "401900004", "MICH", "MSU", "2026-10-24T19:30:00Z", "CBS", "in", [14, 10], { detail: "11:20 - 3rd", venue: "Spartan Stadium", city: "East Lansing", st: "MI" }),
    event("ncaa", "401900005", "LSU", "MISS", "2026-10-24T23:00:00Z", "ESPN", "pre", [], { venue: "Vaught-Hemingway Stadium", city: "Oxford", st: "MS", away: { rank: 14 } }),
    event("ncaa", "401900006", "ORE", "UW", "2026-10-24T23:30:00Z", "NBC", "pre", [], { venue: "Husky Stadium", city: "Seattle", st: "WA", away: { rank: 5 } }),
  ],
};
const nfl = {
  week: { number: 8 },
  season: { type: 2 },
  events: [
    event("nfl", "401910001", "BUF", "MIA", "2026-10-25T17:00:00Z", "CBS", "pre", [], { venue: "Hard Rock Stadium", city: "Miami Gardens", st: "FL" }),
    event("nfl", "401910002", "GB", "DET", "2026-10-25T17:00:00Z", "FOX", "pre", [], { venue: "Ford Field", city: "Detroit", st: "MI" }),
    event("nfl", "401910003", "KC", "LV", "2026-10-25T20:25:00Z", "CBS", "pre", [], { venue: "Allegiant Stadium", city: "Las Vegas", st: "NV" }),
    event("nfl", "401910004", "DAL", "PHI", "2026-10-26T00:20:00Z", "NBC", "pre", [], { venue: "Lincoln Financial Field", city: "Philadelphia", st: "PA" }),
  ],
};

// ---- a full play-by-play for Penn State at Ohio State ----
const ids = { PSU: "213", OSU: "194" };
const drivesPlan = [
  // team, quarter, result, plays, startYte
  ["OSU", 1, "Punt", 5, 75], ["PSU", 1, "Touchdown", 8, 75], ["OSU", 1, "Field Goal", 10, 75], ["PSU", 1, "Punt", 4, 80],
  ["OSU", 2, "Punt", 5, 70], ["PSU", 2, "Touchdown", 7, 72], ["OSU", 2, "Touchdown", 11, 75], ["PSU", 2, "End of Half", 4, 75],
  ["OSU", 3, "Touchdown", 9, 75], ["PSU", 3, "Touchdown", 9, 75], ["OSU", 4, "Interception", 6, 75], ["PSU", 4, "Fumble", 6, 60],
];
const names = {
  PSU: { qb: "Ethan Grunkemeyer", rb: "Kaytron Allen", wr: "Trebor Pena", te: "Luke Reynolds", k: "Ryan Barker" },
  OSU: { qb: "Julian Sayin", rb: "Bo Jackson", wr: "Jeremiah Smith", te: "Max Klare", k: "Jayden Fielding" },
};
let pid = 1000, score = { PSU: 0, OSU: 0 }, clockSec = 900, period = 1;
const wp = [];
let homeWp = 0.5;
const fmtClock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const spotText = (team, yte) => {
  const own = 100 - yte;
  if (yte === 50) return "50";
  return own < 50 ? `${team} ${own}` : `${team === "PSU" ? "OSU" : "PSU"} ${yte}`;
};
const ord = (d) => ["", "1st", "2nd", "3rd", "4th"][d];

function play(team, kind, startYte, gain, opts = {}) {
  const other = team === "PSU" ? "OSU" : "PSU";
  const n = names[team];
  const side = Math.floor(rnd() * 3);
  const dirWord = ["left", "middle", "right"][side];
  let text = "", type = "";
  if (kind === "run") { type = "Rush"; text = `${n.rb} run ${dirWord === "middle" ? "up the middle" : "to the " + dirWord} for ${gain} yard${gain === 1 ? "" : "s"}`; }
  if (kind === "pass") { type = "Pass Reception"; text = `${n.qb} pass ${gain > 15 ? "deep" : "short"} ${dirWord} complete to ${rnd() > .5 ? n.wr : n.te} for ${gain} yards`; }
  if (kind === "inc") { type = "Pass Incompletion"; text = `${n.qb} pass incomplete ${dirWord}`; gain = 0; }
  if (kind === "punt") { type = "Punt"; text = `${n.k} punt for ${gain} yards, fair catch`; }
  if (kind === "fg") { type = "Field Goal Good"; text = `${n.k} ${startYte + 17} yd field goal GOOD`; }
  if (kind === "kick") { type = "Kickoff"; text = `${n.k} kickoff for 65 yards, touchback`; }
  if (kind === "pat") { type = "Extra Point Good"; text = `${n.k} extra point GOOD`; }
  if (kind === "int") { type = "Pass Interception Return"; text = `${n.qb} pass intercepted by ${names[other].wr}`; }
  if (kind === "fum") { type = "Fumble Recovery (Opponent)"; text = `${n.rb} run for 3 yards, FUMBLES, recovered by ${other}`; }
  if (opts.td) { type = kind === "pass" ? "Passing Touchdown" : "Rushing Touchdown"; text += " for a TD"; }
  const endYte = kind === "punt" ? 100 - Math.max(5, startYte - gain) : kind === "kick" ? 75 : Math.max(0, startYte - gain);
  const endTeam = kind === "punt" || kind === "kick" || kind === "int" || kind === "fum" ? other : team;
  clockSec = Math.max(0, clockSec - (kind === "inc" ? 6 : 28 + Math.floor(rnd() * 14)));
  const p = {
    id: String(++pid),
    type: { text: type },
    text,
    period: { number: period },
    clock: { displayValue: fmtClock(clockSec) },
    start: { down: opts.down || 1, distance: opts.distance || 10, yardsToEndzone: startYte, team: { id: ids[team] }, shortDownDistanceText: opts.down ? `${ord(opts.down)} & ${opts.distance}` : "", possessionText: spotText(team, startYte) },
    end: { yardsToEndzone: kind === "int" || kind === "fum" ? 100 - endYte : endYte, team: { id: ids[endTeam] } },
    statYardage: ["kick", "pat"].includes(kind) ? 0 : gain,
    scoringPlay: !!opts.score,
    awayScore: score.PSU,
    homeScore: score.OSU,
  };
  return p;
}

const drives = [];
let lastWp = 0.5;
function addWp(p, target) {
  lastWp = Math.max(0.03, Math.min(0.97, target));
  wp.push({ playId: p.id, homeWinPercentage: Number(lastWp.toFixed(3)) });
}

for (const [team, q, result, n, startYte] of drivesPlan) {
  if (q !== period) { period = q; clockSec = 900; }
  const plays = [];
  let yte = startYte, down = 1, togo = 10;
  for (let i = 0; i < n; i++) {
    const last = i === n - 1;
    let p;
    if (last && result === "Touchdown") {
      p = play(team, "pass", yte, yte, { down, distance: togo, td: true, score: true });
      score[team] += 6; p.awayScore = score.PSU; p.homeScore = score.OSU;
      plays.push(p); addWp(p, lastWp + (team === "OSU" ? 0.12 : -0.12));
      score[team] += 1;
      const x = play(team, "pat", 3, 0, { score: true }); x.awayScore = score.PSU; x.homeScore = score.OSU; plays.push(x); addWp(x, lastWp);
      break;
    }
    if (last && result === "Field Goal") { score[team] += 3; p = play(team, "fg", yte, 0, { down: 4, distance: togo, score: true }); p.awayScore = score.PSU; p.homeScore = score.OSU; plays.push(p); addWp(p, lastWp + (team === "OSU" ? 0.05 : -0.05)); break; }
    if (last && result === "Punt") { p = play(team, "punt", yte, 42, { down: 4, distance: togo }); plays.push(p); addWp(p, lastWp); break; }
    if (last && result === "Interception") { p = play(team, "int", yte, 0, { down, distance: togo }); plays.push(p); addWp(p, lastWp + (team === "OSU" ? -0.09 : 0.09)); break; }
    if (last && result === "Fumble") { p = play(team, "fum", yte, 3, { down, distance: togo }); plays.push(p); addWp(p, lastWp + (team === "OSU" ? -0.09 : 0.09)); break; }
    const kind = rnd() < 0.15 ? "inc" : rnd() < 0.5 ? "run" : "pass";
    const gain = kind === "inc" ? 0 : Math.max(-2, Math.round(rnd() * (kind === "pass" ? 16 : 9)));
    p = play(team, kind, yte, Math.min(gain, yte - 1), { down, distance: togo });
    plays.push(p);
    addWp(p, lastWp + (team === "OSU" ? 1 : -1) * (gain - 4) * 0.004);
    yte = Math.max(1, yte - p.statYardage);
    togo -= p.statYardage;
    if (togo <= 0) { down = 1; togo = 10; } else down = Math.min(4, down + 1);
  }
  drives.push({ id: String(drives.length + 1), team: { id: ids[team], abbreviation: team }, result, displayResult: result, isScore: result === "Touchdown" || result === "Field Goal", description: `${plays.length} plays`, plays });
}

// The fourth-quarter Ohio State touchdown drive and Penn State's current drive, as in the mockup.
period = 4; clockSec = 600;
const osu = [];
const add = (arr, p, w) => { arr.push(p); addWp(p, w); };
add(osu, play("OSU", "pass", 75, 12, { down: 1, distance: 10 }), 0.49);
add(osu, play("OSU", "run", 63, 6, { down: 1, distance: 10 }), 0.5);
add(osu, play("OSU", "pass", 57, 12, { down: 2, distance: 4 }), 0.55);
add(osu, play("OSU", "run", 45, 5, { down: 1, distance: 10 }), 0.56);
add(osu, play("OSU", "run", 40, 2, { down: 2, distance: 5 }), 0.53);
score.OSU += 6;
const td = play("OSU", "pass", 38, 38, { down: 3, distance: 3, td: true, score: true });
td.text = "Julian Sayin pass deep left complete to Jeremiah Smith for 38 yards for a TD";
td.awayScore = score.PSU; td.homeScore = score.OSU; td.clock.displayValue = "6:46";
add(osu, td, 0.71);
score.OSU += 1;
const pat = play("OSU", "pat", 3, 0, { score: true }); pat.awayScore = score.PSU; pat.homeScore = score.OSU; add(osu, pat, 0.71);
drives.push({ id: "90", team: { id: ids.OSU, abbreviation: "OSU" }, result: "Touchdown", displayResult: "Touchdown", isScore: true, description: "7 plays, 75 yards, 3:12", plays: osu });

const psu = [];
const ko = play("OSU", "kick", 65, 0); ko.clock.displayValue = "6:46"; add(psu, ko, 0.72);
add(psu, play("PSU", "run", 75, 3, { down: 1, distance: 10 }), 0.72);
add(psu, play("PSU", "pass", 72, 9, { down: 2, distance: 7 }), 0.69);
const last = play("PSU", "run", 63, 4, { down: 1, distance: 10 }); last.text = "Kaytron Allen run to the left for 4 yards"; last.clock.displayValue = "6:01"; add(psu, last, 0.71);
const current = { id: "91", team: { id: ids.PSU, abbreviation: "PSU" }, description: "3 plays, 16 yards, 0:44", plays: psu };

const summary = {
  header: {
    competitions: [{
      date: "2026-10-24T19:30:00Z",
      status: { type: { state: "in", shortDetail: "5:58 - 4th" } },
      broadcasts: [{ names: ["FOX"] }],
      competitors: [
        { ...competitor("ncaa", "OSU", "home", score.OSU, { record: "7-0" }), rank: 3, record: [{ summary: "7-0" }], linescores: [3, 7, 7, 7].map((v) => ({ displayValue: String(v) })) },
        { ...competitor("ncaa", "PSU", "away", score.PSU, { record: "6-1" }), rank: 7, record: [{ summary: "6-1" }], linescores: [7, 7, 7, 0].map((v) => ({ displayValue: String(v) })) },
      ],
    }],
  },
  situation: { possession: ids.PSU, downDistanceText: "2nd & 6 at PSU 41" },
  drives: { previous: drives, current },
  winprobability: wp,
  gameInfo: { venue: { fullName: "Ohio Stadium", address: { city: "Columbus" } } },
  boxscore: {
    teams: [
      { team: { id: ids.PSU }, statistics: [["totalYards", "Total Yards", "356"], ["netPassingYards", "Passing", "201"], ["rushingYards", "Rushing", "155"], ["firstDowns", "1st Downs", "19"], ["thirdDownEff", "3rd down efficiency", "5-12"], ["turnovers", "Turnovers", "1"], ["possessionTime", "Possession", "25:52"]].map(([name, label, displayValue]) => ({ name, label, displayValue })) },
      { team: { id: ids.OSU }, statistics: [["totalYards", "Total Yards", "412"], ["netPassingYards", "Passing", "268"], ["rushingYards", "Rushing", "144"], ["firstDowns", "1st Downs", "22"], ["thirdDownEff", "3rd down efficiency", "6-11"], ["turnovers", "Turnovers", "1"], ["possessionTime", "Possession", "28:10"]].map(([name, label, displayValue]) => ({ name, label, displayValue })) },
    ],
  },
  leaders: [
    { team: { id: ids.OSU }, leaders: [{ displayName: "Passing Yards", leaders: [{ displayValue: "21/29, 268 YDS, 2 TD", athlete: { shortName: "J. Sayin" } }] }, { displayName: "Receiving Yards", leaders: [{ displayValue: "7 REC, 121 YDS, 1 TD", athlete: { shortName: "J. Smith" } }] }] },
    { team: { id: ids.PSU }, leaders: [{ displayName: "Rushing Yards", leaders: [{ displayValue: "18 CAR, 97 YDS", athlete: { shortName: "K. Allen" } }] }] },
  ],
};

writeFileSync(new URL("cfb-scoreboard.json", out), JSON.stringify(cfb, null, 1));
writeFileSync(new URL("nfl-scoreboard.json", out), JSON.stringify(nfl, null, 1));
writeFileSync(new URL("summary-401900001.json", out), JSON.stringify(summary, null, 1));
console.log("fixtures written:", drives.length + 1, "drives,", wp.length, "win probability points, score", score);
