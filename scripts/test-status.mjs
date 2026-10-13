import assert from "node:assert/strict";
import { normalizeScheduleEvents, workStatus, spotifyView, discordView, parseScheduleTime } from "../src/scripts/status-logic.js";
const tz = "America/New_York";
const cfg = { timezone: tz };
const raw = [
  { summary: "Dylan's Shift: 1:00 PM-10:00 PM", start: "2026-10-12T13:00:00", end: "2026-10-12T22:00:00", source: "walmart" },
  { summary: "Dylan's Shift", start: "2026-10-14T07:00:00", end: "2026-10-14T16:00:00", source: "walmart" },
];
const ev = normalizeScheduleEvents(raw, cfg);
assert.equal(ev.length, 2, "all events from the Dylan-only endpoint are kept");
assert.equal(normalizeScheduleEvents(raw, { timezone: tz, includedScheduleSources: ["x"] }).length, 0, "optional generic source filter still works");
assert.equal(parseScheduleTime("2026-10-12T13:00:00", tz), Date.parse("2026-10-12T17:00:00Z"), "EDT offset");
assert.equal(parseScheduleTime("2026-11-02T13:00:00", tz), Date.parse("2026-11-02T18:00:00Z"), "EST after DST end");
assert.equal(parseScheduleTime("2026-11-01T13:00:00", tz), Date.parse("2026-11-01T18:00:00Z"));
const at = (s) => Date.parse(s);
const t0 = at("2026-10-12T11:35:00Z"); // 7:35 AM EDT
assert.equal(workStatus(ev, t0, tz), "Working in 5h 25m.");
assert.equal(workStatus(ev, t0 + 30_000 * 20, tz), "Working in 5h 15m.", "30s ticks from cache, no refetch");
assert.equal(workStatus(ev, at("2026-10-12T17:00:00Z"), tz), "Working for another 9 hours.", "boundary: shift starts");
assert.equal(workStatus(ev, at("2026-10-12T21:00:00Z"), tz), "Working for another 5 hours.");
assert.equal(workStatus(ev, at("2026-10-13T02:00:00Z"), tz), "Off for the day. Next shift Oct 14, 7:00 AM.", "boundary: shift ended");
assert.equal(workStatus(ev, at("2026-10-13T16:00:00Z"), tz), "Working tomorrow at 7:00 AM.");
assert.equal(workStatus([], t0, tz), "Off for the day.");
assert.equal(spotifyView({ spotify: { track: "a", artist: "b", isPlaying: false } }), null);
assert.equal(spotifyView({ spotify: null }), null);
const sv = spotifyView({ spotify: { track: "Song [with X]", artist: "A; B", isPlaying: true, url: "javascript:alert(1)" } });
assert.deepEqual(sv, { text: "Song by A, B", url: null }, "unsafe url dropped");
assert.equal(spotifyView({ spotify: { track: "t", artist: "a", url: "https://open.spotify.com/track/1" } }).url, "https://open.spotify.com/track/1");
assert.equal(discordView({ data: { discord_status: "idle", activities: [{ name: "Game", type: 0 }] } }), null);
assert.equal(discordView({ data: { discord_status: "offline", activities: [] } }), null);
assert.equal(discordView({ data: { discord_status: "online", activities: [] } }), null);
assert.deepEqual(discordView({ data: { discord_status: "dnd", activities: [{ name: "Overwatch 2", type: 0, details: "Ana" }] } }), { label: "playing", text: "Overwatch 2 - Ana" });
console.log("status logic ok");
// DST edges: nonexistent and ambiguous wall times still parse to a finite instant within an hour of the neighbours
const gap = parseScheduleTime("2027-03-14T02:30:00", tz), amb = parseScheduleTime("2026-11-01T01:30:00", tz);
assert.ok(Number.isFinite(gap) && Math.abs(gap - Date.parse("2027-03-14T07:30:00Z")) <= 3600e3, "spring-forward gap");
assert.ok(Number.isFinite(amb) && Math.abs(amb - Date.parse("2026-11-01T05:30:00Z")) <= 3600e3, "fall-back ambiguity");
assert.ok(parseScheduleTime("2026-10-12T13:00:00-04:00", tz) === Date.parse("2026-10-12T17:00:00Z"), "explicit offsets honored");
// minute-granularity countdown: a 30s tick changes text only when the minute rolls
const w1 = workStatus(ev, t0, tz), w2 = workStatus(ev, t0 + 30000, tz), w3 = workStatus(ev, t0 + 60000, tz);
assert.notEqual(w1, w3); console.log("countdown", w1, "|", w2, "|", w3);
