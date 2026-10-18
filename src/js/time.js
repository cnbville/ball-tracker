// Every time the user sees is Berlin time. US Eastern is shown only for reference.

export const BERLIN = "Europe/Berlin";
export const EASTERN = "America/New_York";

const cache = new Map();
function formatter(tz, opts) {
  const key = tz + JSON.stringify(opts);
  if (!cache.has(key)) cache.set(key, new Intl.DateTimeFormat("en-GB", { timeZone: tz, ...opts }));
  return cache.get(key);
}

export const fmt = (ms, opts, tz = BERLIN) => formatter(tz, opts).format(new Date(ms));

/** "18:00" */
export const clock = (ms, tz = BERLIN) => fmt(ms, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }, tz);
/** "Sat" */
export const weekday = (ms, tz = BERLIN) => fmt(ms, { weekday: "short" }, tz);
/** "Saturday 24 October" */
export const longDay = (ms, tz = BERLIN) => fmt(ms, { weekday: "long", day: "numeric", month: "long" }, tz);
/** "24 Oct" */
export const shortDate = (ms, tz = BERLIN) => fmt(ms, { day: "numeric", month: "short" }, tz);

/** Calendar day in a zone, "2026-10-24", used to group games by their US game day. */
export function dayKey(ms, tz) {
  const p = Object.fromEntries(
    formatter(tz, { year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}

/** UTC offset of a zone at a moment, in minutes (Berlin summer time = 120). */
export function offsetMinutes(ms, tz) {
  const part = formatter(tz, { timeZoneName: "longOffset" })
    .formatToParts(new Date(ms))
    .find((x) => x.type === "timeZoneName");
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(part?.value || "");
  if (!m) return 0;
  const v = Number(m[2]) * 60 + Number(m[3] || 0);
  return m[1] === "-" ? -v : v;
}

/** Hours Berlin is ahead of US Eastern at a moment. Usually 6, sometimes 5 around clock changes. */
export const berlinLead = (ms) => (offsetMinutes(ms, BERLIN) - offsetMinutes(ms, EASTERN)) / 60;

/** "CEST, UTC+2" style label for the header. */
export function zoneLabel(ms) {
  const off = offsetMinutes(ms, BERLIN) / 60;
  return `${off === 2 ? "CEST" : "CET"}, UTC+${off}`;
}

/** Relative text for an upcoming kickoff: "in 25 min", "Sat 18:00". */
export function kickoffText(ms, now = Date.now()) {
  const mins = Math.round((ms - now) / 60000);
  if (mins > 0 && mins < 60) return `in ${mins} min`;
  if (dayKey(ms, BERLIN) === dayKey(now, BERLIN)) return `Today ${clock(ms)}`;
  return `${weekday(ms)} ${clock(ms)}`;
}
