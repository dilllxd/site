import { normalizeScheduleEvents, workStatus, spotifyView, discordView } from "/scripts/status-logic.js";

const $ = (s) => document.querySelector(s);
const root = $("[data-widget-config]");
const timeNode = $("[data-local-time]");
const workChip = $("[data-work-chip]");
const workNode = $("[data-work-status]");
const spChip = $("[data-spotify-chip]");
const spNode = $("[data-spotify-status]");
const dcChip = $("[data-discord-chip]");
const dcNode = $("[data-discord-status]");
const dcLabel = $("[data-discord-label]");

if (root) {
  const config = JSON.parse(root.dataset.widgetConfig || "{}");
  const tz = config.timezone || "America/New_York";
  const clock = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true });
  const TICK = 30_000, SCHEDULE_EVERY = 300_000, FETCH_TIMEOUT = 8_000;
  const lanyard = config.discordUserId ? "https://api.lanyard.rest/v1/users/" + encodeURIComponent(config.discordUserId) : null;
  let events = null; // cached, filtered to Dylan only
  const last = { schedule: 0, spotify: 0, discord: 0 };
  const busy = { schedule: false, spotify: false, discord: false };

  async function getJson(url) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT);
    try {
      const res = await fetch(url, { cache: "no-store", signal: ctl.signal, credentials: "omit" });
      if (!res.ok) throw new Error(String(res.status));
      return await res.json();
    } finally { clearTimeout(timer); }
  }

  function renderClock() { if (timeNode) timeNode.textContent = clock.format(new Date()); }
  function renderWork() {
    if (!workChip || !workNode) return;
    if (!events) { workChip.hidden = true; return; }
    workNode.textContent = workStatus(events, Date.now(), tz);
    workChip.hidden = false;
  }
  function renderSpotify(v) {
    if (!spChip || !spNode) return;
    if (!v) { spChip.hidden = true; spNode.textContent = ""; spNode.removeAttribute("href"); spNode.removeAttribute("title"); return; }
    spNode.textContent = v.text; spNode.title = v.text;
    if (v.url) { spNode.href = v.url; spNode.target = "_blank"; spNode.rel = "noopener noreferrer"; } else spNode.removeAttribute("href");
    spChip.hidden = false;
  }
  function renderDiscord(v) {
    if (!dcChip || !dcNode) return;
    if (!v) { dcChip.hidden = true; dcNode.textContent = ""; dcNode.removeAttribute("title"); return; }
    if (dcLabel) dcLabel.textContent = v.label;
    dcNode.textContent = v.text; dcNode.title = v.label + " " + v.text;
    dcChip.hidden = false;
  }

  // network failures keep the last known state; Spotify/Discord hide only on a real "not active" answer
  async function load(name, url, apply) {
    if (!url || busy[name] || document.hidden) return;
    busy[name] = true;
    try { apply(await getJson(url)); last[name] = Date.now(); }
    catch (e) { console.warn("[status] " + name + " unavailable", e); last[name] = Date.now(); }
    finally { busy[name] = false; }
  }
  const loadSchedule = () => load("schedule", config.workScheduleEventsUrl, (p) => { events = normalizeScheduleEvents(p && p.events, config); renderWork(); });
  const loadSpotify = () => load("spotify", config.spotifyNowPlayingUrl, (p) => renderSpotify(spotifyView(p)));
  const loadDiscord = () => load("discord", lanyard, (p) => renderDiscord(discordView(p)));

  function tick() {
    if (document.hidden) return;
    renderClock(); renderWork();
    const now = Date.now();
    if (now - last.schedule >= SCHEDULE_EVERY) loadSchedule();
    if (now - last.spotify >= TICK - 1000) loadSpotify();
    if (now - last.discord >= TICK - 1000) loadDiscord();
  }
  function refreshAll() { renderClock(); renderWork(); loadSchedule(); loadSpotify(); loadDiscord(); }

  renderClock();
  if (workChip) workChip.hidden = true;
  refreshAll();
  setInterval(tick, TICK);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshAll(); });
}
