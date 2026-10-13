// Pure status logic (no DOM). Shared by live-widgets.js and scripts/test-status.mjs.
const NAIVE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

function tzOffsetMs(utcMs, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(utcMs / 1000) * 1000;
}

// The events feed returns wall-clock times with no offset; they are in the schedule timezone, not the visitor's.
export function parseScheduleTime(value, tz) {
  const s = String(value || "").trim();
  const m = NAIVE.exec(s);
  if (!m) { const d = new Date(s); return Number.isNaN(d.valueOf()) ? null : d.valueOf(); }
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  let t = wall - tzOffsetMs(wall, tz);
  t = wall - tzOffsetMs(t, tz);
  return t;
}

export function normalizeScheduleEvents(events, config = {}) {
  const tz = config.timezone || "America/New_York";
  const low = (v) => String(v || "").trim().toLowerCase();
  const included = (config.includedScheduleSources || []).map(low);
  const ignored = (config.ignoredScheduleSources || []).map(low);
  const prefixes = (config.ignoredScheduleSummaryPrefixes || []).map(low);
  return (Array.isArray(events) ? events : [])
    .filter((e) => e && (!included.length || included.includes(low(e.source))))
    .filter((e) => !ignored.includes(low(e.source)) && !prefixes.some((p) => low(e.summary).startsWith(p)))
    .map((e) => ({ start: parseScheduleTime(e.start, tz), end: parseScheduleTime(e.end, tz) }))
    .filter((e) => e.start != null && e.end != null && e.end > e.start)
    .sort((a, b) => a.start - b.start);
}

export function formatDuration(ms) {
  const total = Math.max(1, Math.round(ms / 60000));
  const h = Math.floor(total / 60), m = total % 60;
  if (h > 0 && m > 0) return h + "h " + m + "m";
  if (h > 0) return h === 1 ? "1 hour" : h + " hours";
  return m === 1 ? "1 minute" : m + " minutes";
}

function dayNumber(ms, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return Math.floor(Date.UTC(+p.year, +p.month - 1, +p.day) / 86400000);
}
const fmtTime = (ms, tz) => new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(ms));
const fmtDateTime = (ms, tz) => new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(ms));

// events: output of normalizeScheduleEvents (Dylan only). Pure function of (events, now).
export function workStatus(events, now, tz = "America/New_York") {
  const cur = events.find((e) => e.start <= now && e.end > now);
  if (cur) return "Working for another " + formatDuration(cur.end - now) + ".";
  const next = events.find((e) => e.start > now);
  if (!next) return "Off for the day.";
  const days = dayNumber(next.start, tz) - dayNumber(now, tz);
  if (days <= 0) return "Working in " + formatDuration(next.start - now) + ".";
  if (days === 1) return "Working tomorrow at " + fmtTime(next.start, tz) + ".";
  return "Off for the day. Next shift " + fmtDateTime(next.start, tz) + ".";
}

export function cleanSpotifyTitle(t) {
  return String(t || "").replace(/\s*\[(with|feat\.?|featuring)\s+[^\]]+\]/gi, "").replace(/\s*\((with|feat\.?|featuring)\s+[^)]+\)/gi, "").trim();
}

export function safeHttpUrl(u) {
  try { const x = new URL(String(u)); return x.protocol === "https:" || x.protocol === "http:" ? x.href : null; } catch { return null; }
}

// -> null (hide) or { text, url }
export function spotifyView(payload) {
  const s = payload && payload.spotify;
  if (!s || !s.track || !s.artist || s.isPlaying === false) return null;
  const title = cleanSpotifyTitle(s.track) || String(s.track);
  const artist = String(s.artist).split(";").map((a) => a.trim()).filter(Boolean).join(", ") || String(s.artist);
  return { text: s.itemType === "episode" ? title + " - " + artist : title + " by " + artist, url: safeHttpUrl(s.url) };
}

// -> null (hide) or { label, text }. Hidden when idle/offline or nothing to show.
export function discordView(payload) {
  const d = payload && (payload.data || payload.d);
  if (!d || (d.discord_status !== "online" && d.discord_status !== "dnd")) return null;
  const a = (Array.isArray(d.activities) ? d.activities : []).find((x) => x && x.name && x.type !== 2 && x.type !== 4);
  if (!a) return null;
  const label = { 0: "playing", 1: "streaming", 3: "watching", 5: "competing in" }[a.type] || "using";
  const detail = String(a.details || a.state || "").trim();
  return { label, text: detail ? a.name + " - " + detail : String(a.name) };
}
