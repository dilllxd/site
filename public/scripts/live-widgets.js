const localTimeNode = document.querySelector("[data-local-time]");
const workStatusNode = document.querySelector("[data-work-status]");
const workLabelNode = document.querySelector("[data-work-label]");
const discordNode = document.querySelector("[data-discord-status]");
const spotifyNode = document.querySelector("[data-spotify-status]");
const nowRow = document.querySelector("[data-now-row]");
const workChip = document.querySelector("[data-work-chip]");
const discordChip = document.querySelector("[data-discord-chip]");
const spotifyChip = document.querySelector("[data-spotify-chip]");
const discordLabelNode = discordChip?.querySelector("span") || null;
const spotifyLabelNode = spotifyChip?.querySelector("span") || null;
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

  const chips = [discordChip, spotifyChip].filter(Boolean);
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

function formatRelativeDuration(milliseconds) {
  const totalMinutes = Math.max(1, Math.round(milliseconds / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (hours > 0) {
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }

  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

function getWorkStatusFromEvents(events) {
  if (!Array.isArray(events) || events.length === 0) {
    return {
      label: "Schedule",
      text: "Off for the day.",
      visible: true,
    };
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
    return {
      label: "At work",
      text: `Working for another ${formatRelativeDuration(currentShift.endDate.valueOf() - now.valueOf())}.`,
      visible: true,
    };
  }

  const nextShift = events.find((entry) => entry.startDate > now);
  if (!nextShift) {
    return {
      label: "Schedule",
      text: "Off for the day.",
      visible: true,
    };
  }

  if (nextShift.startDate < tomorrowStart) {
    return {
      label: "Later today",
      text: `Working in ${formatRelativeDuration(nextShift.startDate.valueOf() - now.valueOf())}.`,
      visible: true,
    };
  }

  if (nextShift.startDate < dayAfterTomorrowStart) {
    return {
      label: "Tomorrow",
      text: `Working at ${formatScheduleTime(nextShift.start)}.`,
      visible: true,
    };
  }

  return {
    label: "Schedule",
    text: `Off for the day. Next shift ${formatScheduleDateTime(nextShift.start)}.`,
    visible: true,
  };
}

function applyWorkStatus(status) {
  if (!workStatusNode || !workChip) return;

  const nextStatus = status || {
    label: "Schedule",
    text: fallbackText.work,
    visible: false,
  };

  if (workLabelNode) {
    workLabelNode.textContent = nextStatus.label;
  }

  workStatusNode.textContent = nextStatus.text;
  setChipVisibility(workChip, nextStatus.visible);
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
    applyWorkStatus(getWorkStatusFromEvents(events));
  } catch (error) {
    console.warn("[widgets] work schedule unavailable", error);
    applyWorkStatus({
      label: "Schedule",
      text: fallbackText.work,
      visible: false,
    });
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
    applyWorkStatus(getWorkStatusFromEvents(normalizedEvents));
  } catch (error) {
    console.warn("[widgets] work schedule unavailable", error);
    applyWorkStatus({
      label: "Schedule",
      text: fallbackText.work,
      visible: false,
    });
  }

  syncNowRowVisibility();
}

function getDiscordActivityPresence(activities) {
  const interestingActivity = activities.find((activity) => {
    if (!activity?.name) return false;
    if (activity.type === 2 || activity.type === 4) return false;
    return true;
  });

  if (!interestingActivity) {
    return null;
  }

  const typeLabel = {
    0: "Playing",
    1: "Streaming",
    3: "Watching",
    5: "Competing in",
  }[interestingActivity.type] || "Using";

  const sourceName = interestingActivity.name;
  const details = String(interestingActivity.details || "").trim();
  const state = String(interestingActivity.state || "").trim();
  const episodeInfo = String(interestingActivity.assets?.large_text || "").trim();
  const parts = [];

  if (details) {
    parts.push(details);
  } else if (state) {
    parts.push(state);
  }

  if (
    episodeInfo &&
    episodeInfo !== details &&
    episodeInfo !== state &&
    !/spotify/i.test(sourceName)
  ) {
    parts.push(episodeInfo);
  }

  return {
    label: sourceName ? `${typeLabel} ${sourceName}` : typeLabel,
    text: parts.join(" - ") || sourceName || typeLabel,
  };
}

function formatDiscordPresence(payload) {
  const data = payload?.d ?? payload?.data ?? null;
  if (!data) {
    if (discordLabelNode) {
      discordLabelNode.textContent = "Discord";
    }
    if (discordChip) {
      delete discordChip.dataset.richPresence;
    }
    discordNode.textContent = fallbackText.discord;
    setChipVisibility(discordChip, false);
    syncNowRowVisibility();
    return;
  }

  const discordStatus = data.discord_status || "offline";
  const activities = Array.isArray(data.activities) ? data.activities : [];
  const presence = getDiscordActivityPresence(activities);

  if (presence) {
    if (discordLabelNode) {
      discordLabelNode.textContent = presence.label;
    }
    if (discordChip) {
      discordChip.dataset.richPresence = "true";
    }
    discordNode.textContent = presence.text;
    setChipVisibility(discordChip, true);
  } else {
    if (discordLabelNode) {
      discordLabelNode.textContent = "Discord";
    }
    if (discordChip) {
      delete discordChip.dataset.richPresence;
    }
    discordNode.textContent = discordStatus.charAt(0).toUpperCase() + discordStatus.slice(1);
    setChipVisibility(discordChip, false);
  }

  syncNowRowVisibility();
}

function getSpotifyTextFromNowPlaying(payload) {
  const spotify = payload?.spotify ?? null;
  if (!spotify?.track || !spotify?.artist || spotify.isPlaying === false) {
    return "";
  }

  const songTitle = cleanSpotifySongTitle(spotify.track);
  const artistText = cleanSpotifyArtists(spotify.artist);
  if (spotify.itemType === "episode") {
    return `${songTitle || spotify.track} — ${artistText || spotify.artist}`;
  }
  return `${songTitle || spotify.track} by ${artistText || spotify.artist}`;
}

function applySpotifyText(text) {
  if (!spotifyNode) return;

  if (text) {
    if (spotifyLabelNode) {
      spotifyLabelNode.textContent = "Listening to";
    }
    if (spotifyChip) {
      spotifyChip.dataset.richPresence = "true";
    }
    spotifyNode.textContent = text;
    setChipVisibility(spotifyChip, true);
  } else {
    if (spotifyLabelNode) {
      spotifyLabelNode.textContent = "Listening";
    }
    if (spotifyChip) {
      delete spotifyChip.dataset.richPresence;
    }
    spotifyNode.textContent = fallbackText.spotify;
    setChipVisibility(spotifyChip, false);
  }

  syncNowRowVisibility();
}

async function loadSpotifyStatus(nowPlayingUrl) {
  if (!spotifyNode || !nowPlayingUrl) return;

  try {
    const response = await fetch(nowPlayingUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Spotify request failed: ${response.status}`);
    }

    const payload = await response.json();
    applySpotifyText(getSpotifyTextFromNowPlaying(payload));
  } catch (error) {
    console.warn("[widgets] spotify status unavailable", error);
    applySpotifyText("");
  }
}

function initSpotifySocket(spotifyWebSocketUrl, nowPlayingUrl) {
  if (!spotifyNode) return;

  const pollInterval = 30_000;
  const reconnectBaseDelay = 2_000;
  const reconnectMaxDelay = 30_000;
  let socket = null;
  let reconnectTimer = null;
  let reconnectDelay = reconnectBaseDelay;
  let pollingTimer = null;
  let stopped = false;

  const refresh = () => loadSpotifyStatus(nowPlayingUrl);

  const scheduleReconnect = () => {
    if (!spotifyWebSocketUrl || stopped || reconnectTimer) return;

    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, reconnectMaxDelay);
  };

  const connect = () => {
    if (!spotifyWebSocketUrl || stopped) return;

    try {
      socket = new WebSocket(spotifyWebSocketUrl);

      socket.addEventListener("open", () => {
        reconnectDelay = reconnectBaseDelay;
        refresh();
      });

      socket.addEventListener("message", (event) => {
        try {
          const payload = JSON.parse(event.data);
          const text = getSpotifyTextFromNowPlaying(payload);
          applySpotifyText(text);
        } catch (error) {
          console.warn("[widgets] spotify websocket payload invalid", error);
        }
      });

      socket.addEventListener("error", (error) => {
        console.warn("[widgets] spotify websocket unavailable", error);
        scheduleReconnect();
      });

      socket.addEventListener("close", () => {
        scheduleReconnect();
      });
    } catch (error) {
      console.warn("[widgets] spotify websocket setup failed", error);
      scheduleReconnect();
    }
  };

  refresh();
  pollingTimer = window.setInterval(refresh, pollInterval);
  connect();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    refresh();
    if (!socket || socket.readyState === WebSocket.CLOSED) connect();
  });

  window.addEventListener(
    "pagehide",
    () => {
      stopped = true;
      if (pollingTimer) window.clearInterval(pollingTimer);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socket?.close();
    },
    { once: true },
  );
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
  );
  initLanyard(config.discordUserId);
}
