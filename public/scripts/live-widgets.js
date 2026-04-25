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

function getWorkStatusText(schedule) {
  if (!schedule) return fallbackText.work;

  switch (schedule.status) {
    case "working":
      if (schedule.timeRemaining) {
        return `At work for another ${schedule.timeRemaining.hours}h ${schedule.timeRemaining.minutes}m.`;
      }
      return "Currently at work.";
    case "upcoming":
      if (schedule.timeRemaining) {
        return `Working in ${schedule.timeRemaining.hours}h ${schedule.timeRemaining.minutes}m.`;
      }
      return "Working later today.";
    case "done":
      return "Done with work for today.";
    case "off":
      return "Not working today.";
    default:
      return fallbackText.work;
  }
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

async function loadWorkStatus(workScheduleUrl) {
  if (!workStatusNode || !workScheduleUrl) return;

  try {
    const response = await fetch(workScheduleUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Work schedule request failed: ${response.status}`);
    const schedule = await response.json();
    workStatusNode.textContent = getWorkStatusText(schedule);
    setChipVisibility(workChip, true);
  } catch (error) {
    console.warn("[widgets] work schedule unavailable", error);
    workStatusNode.textContent = fallbackText.work;
    setChipVisibility(workChip, false);
  }

  syncNowRowVisibility();
}

function formatDiscordPresence(payload) {
  const data = payload?.d ?? payload?.data ?? null;
  if (!data) {
    discordNode.textContent = fallbackText.discord;
    spotifyNode.textContent = fallbackText.spotify;
    setChipVisibility(discordChip, false);
    setChipVisibility(spotifyChip, false);
    syncNowRowVisibility();
    return;
  }

  const discordStatus = data.discord_status || "offline";
  const statusLabel = discordStatus.charAt(0).toUpperCase() + discordStatus.slice(1);
  discordNode.textContent = statusLabel;
  setChipVisibility(discordChip, discordStatus !== "offline");

  const spotify = data.spotify;
  if (spotify?.song && spotify?.artist) {
    const songTitle = cleanSpotifySongTitle(spotify.song);
    const artistText = cleanSpotifyArtists(spotify.artist);
    spotifyNode.textContent = `${songTitle || spotify.song} by ${artistText || spotify.artist}`;
    setChipVisibility(spotifyChip, true);
    syncNowRowVisibility();
    return;
  }

  const activities = Array.isArray(data.activities) ? data.activities : [];
  const interestingActivity = activities.find((activity) => activity?.type !== 4 && activity?.name);

  if (interestingActivity?.details) {
    spotifyNode.textContent = interestingActivity.details;
    setChipVisibility(spotifyChip, true);
  } else if (interestingActivity?.name) {
    spotifyNode.textContent = interestingActivity.name;
    setChipVisibility(spotifyChip, true);
  } else {
    spotifyNode.textContent = fallbackText.spotify;
    setChipVisibility(spotifyChip, false);
  }

  syncNowRowVisibility();
}

async function initLanyard(discordUserId) {
  if (!discordUserId || !discordNode || !spotifyNode) return;

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
  loadWorkStatus(config.workScheduleUrl);
  initLanyard(config.discordUserId);
}
