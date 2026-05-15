/**
 * blacklistStore.js — Server and link blacklist management
 *
 * blacklisted_guilds — guilds banned from the Auto-Wave network
 * link_whitelist     — extra domains permitted in ads beyond discord.gg
 */

const db = require('./db');

// ─── Guild blacklist ──────────────────────────────────────────────────────────

const stmtBlacklistAdd    = db.prepare(`
  INSERT OR REPLACE INTO blacklisted_guilds (guild_id, reason, blacklisted_at)
  VALUES (?, ?, ?)
`);
const stmtBlacklistRemove = db.prepare('DELETE FROM blacklisted_guilds WHERE guild_id = ?');
const stmtBlacklistGet    = db.prepare('SELECT * FROM blacklisted_guilds WHERE guild_id = ?');
const stmtBlacklistAll    = db.prepare('SELECT * FROM blacklisted_guilds ORDER BY blacklisted_at DESC');

function blacklistGuild(guildId, reason) {
  stmtBlacklistAdd.run(guildId, reason, Date.now());
}

function unblacklistGuild(guildId) {
  stmtBlacklistRemove.run(guildId);
}

function isBlacklisted(guildId) {
  return !!stmtBlacklistGet.get(guildId);
}

function getAllBlacklisted() {
  return stmtBlacklistAll.all();
}

// ─── Link whitelist ───────────────────────────────────────────────────────────

const stmtWhitelistAdd    = db.prepare(`
  INSERT OR IGNORE INTO link_whitelist (domain, added_at) VALUES (?, ?)
`);
const stmtWhitelistRemove = db.prepare('DELETE FROM link_whitelist WHERE domain = ?');
const stmtWhitelistAll    = db.prepare('SELECT domain FROM link_whitelist');

function addWhitelistedDomain(domain) {
  // Normalise: strip protocol/path, keep bare domain
  const bare = domain.replace(/^https?:\/\//i, '').split('/')[0].toLowerCase();
  stmtWhitelistAdd.run(bare, Date.now());
  return bare;
}

function removeWhitelistedDomain(domain) {
  const bare = domain.replace(/^https?:\/\//i, '').split('/')[0].toLowerCase();
  stmtWhitelistRemove.run(bare);
}

function getWhitelistedDomains() {
  return stmtWhitelistAll.all().map(r => r.domain);
}

module.exports = {
  blacklistGuild,
  unblacklistGuild,
  isBlacklisted,
  getAllBlacklisted,
  addWhitelistedDomain,
  removeWhitelistedDomain,
  getWhitelistedDomains,
};
