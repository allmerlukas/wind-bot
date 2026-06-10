/**
 * pmStore.js — Partner Manager store (Supabase)
 */

const supabase = require('./supabase');

const PM_COOLDOWN_MS = 2 * 24 * 60 * 60 * 1000; // 2 days

function pairKey(a, b) {
  return a < b ? [a, b] : [b, a];
}

async function addGuild(userId, guildId, channelId, label = null, readChannelId = null) {
  await supabase.from('pm_guilds').upsert({
    user_id:         userId,
    guild_id:        guildId,
    channel_id:      channelId,
    read_channel_id: readChannelId,
    label,
    added_at:        Date.now(),
  }, { onConflict: 'user_id,guild_id' });
}

async function removeGuild(userId, guildId) {
  const existing = await getGuild(userId, guildId);
  if (!existing) return false;
  await supabase.from('pm_guilds').delete().eq('user_id', userId).eq('guild_id', guildId);
  return true;
}

async function getGuilds(userId) {
  const { data } = await supabase
    .from('pm_guilds')
    .select('*')
    .eq('user_id', userId)
    .order('added_at', { ascending: true });
  return data ?? [];
}

async function getGuild(userId, guildId) {
  const { data } = await supabase
    .from('pm_guilds')
    .select('*')
    .eq('user_id', userId)
    .eq('guild_id', guildId)
    .single();
  return data ?? null;
}

async function hasGuild(userId, guildId) {
  return !!(await getGuild(userId, guildId));
}

async function setReadChannel(userId, guildId, readChannelId) {
  await supabase
    .from('pm_guilds')
    .update({ read_channel_id: readChannelId })
    .eq('user_id', userId)
    .eq('guild_id', guildId);
}

async function recordPair(userId, guildA, guildB) {
  const [a, b] = pairKey(guildA, guildB);
  await supabase.from('pm_pairs').upsert({
    user_id:        userId,
    guild_a:        a,
    guild_b:        b,
    last_paired_at: Date.now(),
  }, { onConflict: 'user_id,guild_a,guild_b' });
}

async function pairedRecently(userId, guildA, guildB) {
  const [a, b] = pairKey(guildA, guildB);
  const { data } = await supabase
    .from('pm_pairs')
    .select('last_paired_at')
    .eq('user_id', userId)
    .eq('guild_a', a)
    .eq('guild_b', b)
    .single();
  if (!data) return false;
  return Date.now() - data.last_paired_at < PM_COOLDOWN_MS;
}

module.exports = {
  addGuild,
  removeGuild,
  getGuilds,
  getGuild,
  hasGuild,
  setReadChannel,
  recordPair,
  pairedRecently,
  PM_COOLDOWN_MS,
};
