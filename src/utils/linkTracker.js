const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../../data/partners.json');

// ─── Data Helpers ────────────────────────────────────────────────────────────

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify({}));
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveData(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Returns today's date key in YYYY-MM-DD format (local time).
 */
function getTodayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Extracts unique, normalized URLs from a message string.
 * Removes trailing punctuation and lowercases for deduplication.
 */
function extractLinks(content) {
  const urlRegex = /https?:\/\/[^\s<>")\]]+/gi;
  const matches = content.match(urlRegex) || [];
  const normalized = matches.map(url =>
    url.replace(/[.,;!?'"]+$/, '').toLowerCase()
  );
  return [...new Set(normalized)];
}

// ─── Core Logic ───────────────────────────────────────────────────────────────

/**
 * Tries to add links for a user. Skips links already posted today.
 * @returns {{ newLinksAdded: number, totalPartners: number }}
 */
function addLinks(userId, username, links) {
  const data = loadData();
  const today = getTodayKey();

  if (!data[userId]) {
    data[userId] = {
      username,
      totalPartners: 0,
      dailyLinks: {}
    };
  }

  // Keep username up-to-date
  data[userId].username = username;

  if (!data[userId].dailyLinks[today]) {
    data[userId].dailyLinks[today] = [];
  }

  let newLinksAdded = 0;
  for (const link of links) {
    const alreadyPostedToday = data[userId].dailyLinks[today].includes(link);
    if (!alreadyPostedToday) {
      data[userId].dailyLinks[today].push(link);
      data[userId].totalPartners++;
      newLinksAdded++;
    }
  }

  // Trim old daily records (keep only last 30 days to avoid bloat)
  const allDays = Object.keys(data[userId].dailyLinks).sort();
  if (allDays.length > 30) {
    for (const oldDay of allDays.slice(0, allDays.length - 30)) {
      delete data[userId].dailyLinks[oldDay];
    }
  }

  saveData(data);
  return { newLinksAdded, totalPartners: data[userId].totalPartners };
}

/**
 * Returns the total partner count for a specific user.
 */
function getPartners(userId) {
  const data = loadData();
  const entry = data[userId];
  if (!entry) return { totalPartners: 0, username: null };
  return { totalPartners: entry.totalPartners, username: entry.username };
}

/**
 * Returns the full data map (all users).
 */
function getAllPartners() {
  return loadData();
}

module.exports = { extractLinks, addLinks, getPartners, getAllPartners };
