/**
 * blacklistStore.js — Server and link blacklist management (Supabase)
 */

const supabase = require('./supabase');

// In-memory cache for whitelist (read often, changes rarely)
let _whitelistCache = null;

// ─── Guild blacklist ──────────────────────────────────────────────────────────

async function blacklistGuild(guildId, reason) {
  await supabase.from('blacklisted_guilds').upsert(
    { guild_id: guildId, reason, blacklisted_at: Date.now() },
    { onConflict: 'guild_id' }
  );
}

async function unblacklistGuild(guildId) {
  await supabase.from('blacklisted_guilds').delete().eq('guild_id', guildId);
}

async function isBlacklisted(guildId) {
  const { data } = await supabase
    .from('blacklisted_guilds')
    .select('guild_id')
    .eq('guild_id', guildId)
    .single();
  return !!data;
}

async function getAllBlacklisted() {
  const { data } = await supabase
    .from('blacklisted_guilds')
    .select('*')
    .order('blacklisted_at', { ascending: false });
  return data ?? [];
}

// ─── Link whitelist ───────────────────────────────────────────────────────────

async function addWhitelistedDomain(domain) {
  const bare = domain.replace(/^https?:\/\//i, '').split('/')[0].toLowerCase();
  await supabase.from('link_whitelist').upsert({ domain: bare }, { onConflict: 'domain' });
  _whitelistCache = null; // invalidate cache
  return bare;
}

async function removeWhitelistedDomain(domain) {
  const bare = domain.replace(/^https?:\/\//i, '').split('/')[0].toLowerCase();
  await supabase.from('link_whitelist').delete().eq('domain', bare);
  _whitelistCache = null; // invalidate cache
}

async function getWhitelistedDomains() {
  if (_whitelistCache) return _whitelistCache;
  const { data } = await supabase.from('link_whitelist').select('domain');
  _whitelistCache = (data ?? []).map(r => r.domain);
  return _whitelistCache;
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
