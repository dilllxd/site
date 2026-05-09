const localTimeNode = document.querySelector("[data-local-time]");
const workStatusNode = document.querySelector("[data-work-status]");
const discordNode = document.querySelector("[data-discord-status]");
const spotifyNode = document.querySelector("[data-spotify-status]");
const nowRow = document.querySelector("[data-now-row]");
const workChip = document.querySelector("[data-work-chip]");
const discordChip = document.querySelector("[data-discord-chip]");
const spotifyChip = document.querySelector("[data-spotify-chip]");
const widgetRoot = document.querySelector("[data-widget-config]");

const fallbackText = {
  work: "Work schedule unavailable.",
  discord: "Presence unavailable right now.",
  spotify: "Nothing playing at the moment.",
};

function setChipVisibility(chip, shouldShow) {
  if (!chip) return;
  chip.hidden = !shouldShow;
}

function syncNowRowVisibility() {
  if (!nowRow) return;

  const chips = [workChip, discordChip, spotifyChip].filter(Boolean);
  const hasVisibleChip = chips.some((chip) => !chip.hidden);
  nowRow.hidden = !hasVisibleChip;
}

function setLocalTime(timezone) {
  if (!localTimeNode) return;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const render = () => {
    localTimeNode.textContent = formatter.format(new Date());
  };

  render();
  setInterval(render, 30_000);
}

function shouldIgnoreScheduleEntry(entry, ignoredSources = [], ignoredSummaryPrefixes = []) {
  if (!entry) return true;

  const source = String(entry.source || "").trim().toLowerCase();
  if (source && ignoredSources.map((value) => String(value).trim().toLowerCase()).includes(source)) {
    return true;
  }

  const summary = String(entry.summary || "").trim();
  if (
    summary &&
    ignoredSummaryPrefixes.some((prefix) =>
      summary.toLowerCase().startsWith(String(prefix).trim().toLowerCase()),
    )
  ) {
    return true;
  }

  return false;
}

function getScheduleFilters(config = {}) {
  const ignoredSources = Array.isArray(config.ignoredScheduleSources)
    ? config.ignoredScheduleSources
    : [];
  const ignoredSummaryPrefixes = Array.isArray(config.ignoredScheduleSummaryPrefixes)
    ? config.ignoredScheduleSummaryPrefixes
    : [];

  return { ignoredSources, ignoredSummaryPrefixes };
}

function normalizeScheduleEvents(events = [], config = {}) {
  const { ignoredSources, ignoredSummaryPrefixes } = getScheduleFilters(config);

  return events
    .filter((entry) => !shouldIgnoreScheduleEntry(entry, ignoredSources, ignoredSummaryPrefixes))
    .map((entry) => ({
      ...entry,
      startDate: new Date(entry.start),
      endDate: new Date(entry.end),
    }))
    .filter((entry) => !Number.isNaN(entry.startDate.valueOf()) && !Number.isNaN(entry.endDate.valueOf()))
    .sort((a, b) => a.startDate.valueOf() - b.startDate.valueOf());
}

function getWorkStatusTextFromEvents(events) {
  if (!Array.isArray(events) || events.length === 0) {
    return "Off today.";
  }

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(todayStart.getDate() + 1);
  const dayAfterTomorrowStart = new Date(tomorrowStart);
  dayAfterTomorrowStart.setDate(tomorrowStart.getDate() + 1);

  const currentShift = events.find((entry) => entry.startDate <= now && entry.endDate > now);
  if (currentShift) {
    return `At work until ${formatScheduleTime(currentShift.end)}.`;
  }

  const nextShift = events.find((entry) => entry.startDate > now);
  if (!nextShift) {
    return "Off today.";
  }

  if (nextShift.startDate < tomorrowStart) {
    return `Working later today at ${formatScheduleTime(nextShift.start)}.`;
  }

  if (nextShift.startDate < dayAfterTomorrowStart) {
    return `Work tomorrow at ${formatScheduleTime(nextShift.start)}.`;
  }

  return `Off today. Next shift ${formatScheduleDateTime(nextShift.start)}.`;
}

function formatScheduleTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return value;
  }

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatScheduleDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return value;
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function cleanSpotifyArtists(artistText) {
  if (!artistText) return "";

  return artistText
    .split(";")
    .map((artist) => artist.trim())
    .filter(Boolean)
    .join(", ");
}

function cleanSpotifySongTitle(songTitle) {
  if (!songTitle) return "";

  return songTitle
    .replace(/\s*\[(with|feat\.?|featuring)\s+[^\]]+\]/gi, "")
    .replace(/\s*\((with|feat\.?|featuring)\s+[^)]+\)/gi, "")
    .trim();
}

async function loadWorkStatus(workScheduleEventsUrl, config = {}) {
  if (!workStatusNode || !workScheduleEventsUrl) return;

  try {
    const response = await fetch(workScheduleEventsUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Work schedule request failed: ${response.status}`);
    const payload = await response.json();
    const events = normalizeScheduleEvents(payload?.events ?? [], config);
    workStatusNode.textContent = getWorkStatusTextFromEvents(events);
    setChipVisibility(workChip, true);
  } catch (error) {
    console.warn("[widgets] work schedule unavailable", error);
    workStatusNode.textContent = fallbackText.work;
    setChipVisibility(workChip, false);
  }

  syncNowRowVisibility();
}

async function loadWorkStatusFromSummary(workScheduleUrl, config = {}) {
  if (!workStatusNode || !workScheduleUrl) return;

  try {
    const response = await fetch(workScheduleUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Work schedule request failed: ${response.status}`);
    const schedule = await response.json();
    const normalizedEvents = normalizeScheduleEvents(
      [schedule.current, schedule.next].filter(Boolean),
      config,
    );
    workStatusNode.textContent = getWorkStatusTextFromEvents(normalizedEvents);
    setChipVisibility(workChip, true);
  } catch (error) {
    console.warn("[widgets] work schedule unavailable", error);
    workStatusNode.textContent = fallbackText.work;
    setChipVisibility(workChip, false);
  }

  syncNowRowVisibility();
}

function getActivityText(activities) {
  const interestingActivity = activities.find((activity) => {
    if (!activity?.name) return false;
    if (activity.type === 2 || activity.type === 4) return false;
    return true;
  });

  if (!interestingActivity) {
    return "";
  }

  if (interestingActivity.type === 0) {
    return `Playing ${interestingActivity.name}`;
  }

  if (interestingActivity.details) {
    return interestingActivity.details;
  }

  return interestingActivity.name;
}

function formatDiscordPresence(payload) {
  const data = payload?.d ?? payload?.data ?? null;
  if (!data) {
    discordNode.textContent = fallbackText.discord;
    setChipVisibility(discordChip, false);
    syncNowRowVisibility();
    return;
  }

  const discordStatus = data.discord_status || "offline";
  const statusLabel = discordStatus.charAt(0).toUpperCase() + discordStatus.slice(1);
  setChipVisibility(discordChip, discordStatus !== "offline");

  const activities = Array.isArray(data.activities) ? data.activities : [];
  const activityText = getActivityText(activities);
  discordNode.textContent = activityText || statusLabel;
  setChipVisibility(discordChip, Boolean(activityText));

  syncNowRowVisibility();
}

function getSpotifyTextFromNowPlaying(payload) {
  const spotify = payload?.spotify ?? null;
  if (!spotify?.track || !spotify?.artist || spotify.isPlaying === false) {
    return "";
  }

  const songTitle = cleanSpotifySongTitle(spotify.track);
  const artistText = cleanSpotifyArtists(spotify.artist);
  return `${songTitle || spotify.track} by ${artistText || spotify.artist}`;
}

function getSpotifyTextFromCurrentPlayback(payload) {
  const spotify = payload?.spotify ?? null;
  const item = spotify?.item ?? null;
  if (!item?.name || !Array.isArray(item.artists) || spotify?.is_playing === false) {
    return "";
  }

  const songTitle = cleanSpotifySongTitle(item.name);
  const artistText = cleanSpotifyArtists(item.artists.map((artist) => artist?.name).filter(Boolean).join("; "));
  return `${songTitle || item.name} by ${artistText}`;
}

function applySpotifyText(text) {
  if (!spotifyNode) return;

  if (text) {
    spotifyNode.textContent = text;
    setChipVisibility(spotifyChip, true);
  } else {
    spotifyNode.textContent = fallbackText.spotify;
    setChipVisibility(spotifyChip, false);
  }

  syncNowRowVisibility();
}

async function loadSpotifyStatus(nowPlayingUrl, currentPlaybackUrl) {
  if (!spotifyNode) return;

  const urls = [nowPlayingUrl, currentPlaybackUrl].filter(Boolean);

  for (const [index, url] of urls.entries()) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Spotify request failed: ${response.status}`);
      }

      const payload = await response.json();
      const text =
        index === 0
          ? getSpotifyTextFromNowPlaying(payload)
          : getSpotifyTextFromCurrentPlayback(payload);

      if (text) {
        applySpotifyText(text);
        return;
      }
    } catch (error) {
      console.warn("[widgets] spotify status unavailable", error);
    }
  }

  applySpotifyText("");
}

function initSpotifySocket(spotifyWebSocketUrl, nowPlayingUrl, currentPlaybackUrl) {
  if (!spotifyWebSocketUrl || !spotifyNode) {
    loadSpotifyStatus(nowPlayingUrl, currentPlaybackUrl);
    return;
  }

  let hasReceivedSocketPayload = false;

  try {
    const socket = new WebSocket(spotifyWebSocketUrl);

    socket.addEventListener("message", (event) => {
      hasReceivedSocketPayload = true;

      try {
        const payload = JSON.parse(event.data);
        const text = getSpotifyTextFromNowPlaying(payload);
        applySpotifyText(text);
      } catch (error) {
        console.warn("[widgets] spotify websocket payload invalid", error);
      }
    });

    socket.addEventListener("open", () => {
      // Seed the UI quickly while waiting for the first streamed update.
      loadSpotifyStatus(nowPlayingUrl, currentPlaybackUrl);
    });

    socket.addEventListener("error", (error) => {
      console.warn("[widgets] spotify websocket unavailable", error);
      if (!hasReceivedSocketPayload) {
        loadSpotifyStatus(nowPlayingUrl, currentPlaybackUrl);
      }
    });

    socket.addEventListener("close", () => {
      if (!hasReceivedSocketPayload) {
        loadSpotifyStatus(nowPlayingUrl, currentPlaybackUrl);
      }
    });
  } catch (error) {
    console.warn("[widgets] spotify websocket setup failed", error);
    loadSpotifyStatus(nowPlayingUrl, currentPlaybackUrl);
  }
}

async function initLanyard(discordUserId) {
  if (!discordUserId || !discordNode) return;

  try {
    const initialResponse = await fetch(`https://api.lanyard.rest/v1/users/${discordUserId}`, {
      cache: "no-store",
    });
    if (initialResponse.ok) {
      const payload = await initialResponse.json();
      formatDiscordPresence(payload);
    }
  } catch (error) {
    console.warn("[widgets] initial discord presence unavailable", error);
  }

  try {
    const socket = new WebSocket("wss://api.lanyard.rest/socket");
    let heartbeatId = null;

    socket.addEventListener("message", (event) => {
      const payload = JSON.parse(event.data);

      if (payload.op === 1) {
        heartbeatId = window.setInterval(() => {
          socket.send(JSON.stringify({ op: 3 }));
        }, payload.d.heartbeat_interval);

        socket.send(JSON.stringify({ op: 2, d: { subscribe_to_id: discordUserId } }));
        return;
      }

      if (payload.t === "INIT_STATE" || payload.t === "PRESENCE_UPDATE") {
        formatDiscordPresence(payload);
      }
    });

    socket.addEventListener("close", () => {
      if (heartbeatId) window.clearInterval(heartbeatId);
    });
  } catch (error) {
    console.warn("[widgets] lanyard websocket unavailable", error);
  }
}

if (widgetRoot) {
  const config = JSON.parse(widgetRoot.dataset.widgetConfig || "{}");
  setChipVisibility(workChip, false);
  setChipVisibility(discordChip, false);
  setChipVisibility(spotifyChip, false);
  syncNowRowVisibility();
  setLocalTime(config.timezone || "America/New_York");
  if (config.workScheduleEventsUrl) {
    loadWorkStatus(config.workScheduleEventsUrl, config);
  } else {
    loadWorkStatusFromSummary(config.workScheduleUrl, config);
  }
  initSpotifySocket(
    config.spotifyWebSocketUrl,
    config.spotifyNowPlayingUrl,
    config.spotifyCurrentPlaybackUrl,
  );
  initLanyard(config.discordUserId);
}
