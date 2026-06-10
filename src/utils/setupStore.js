/**
 * setupStore.js — Guild configuration store (Supabase)
 */

const supabase = require('./supabase');

const KEY_MAP = {
  welcomeChannelId:  'welcome_channel_id',
  welcomeMessage:    'welcome_message',
  autoroleId:        'autorole_id',
  partnerChannelId:  'partner_channel_id',
  adChannelId:       'ad_channel_id',
  logChannelId:      'log_channel_id',
  memberRoleId:      'member_role_id',
  partnerPingRoleId: 'partner_ping_role_id',
  partnerDelayHours: 'partner_delay_hours',
  minMembers:        'min_members',
  maxMembers:        'max_members',
  strikes:           'strikes',
};

const COL_MAP = Object.fromEntries(Object.entries(KEY_MAP).map(([k, v]) => [v, k]));

function rowToCamel(row) {
  if (!row) return {};
  const out = {};
  for (const [col, camel] of Object.entries(COL_MAP)) {
    if (row[col] !== null && row[col] !== undefined) out[camel] = row[col];
  }
  return out;
}

/**
 * Returns the full config object for a guild (camelCase keys).
 */
async function get(guildId) {
  const { data } = await supabase
    .from('guild_config')
    .select('*')
    .eq('guild_id', guildId)
    .single();
  return rowToCamel(data);
}

/**
 * Sets a single config key for a guild.
 */
async function set(guildId, key, value) {
  const col = KEY_MAP[key];
  if (!col) throw new Error(`setupStore: unknown key "${key}"`);

  await supabase
    .from('guild_config')
    .upsert({ guild_id: guildId, [col]: value }, { onConflict: 'guild_id' });
}

/**
 * Returns configs for ALL guilds that have at least one field set.
 */
async function getAll() {
  const { data } = await supabase.from('guild_config').select('*');
  return (data ?? []).map(row => ({ guild_id: row.guild_id, ...rowToCamel(row) }));
}

module.exports = { get, set, getAll };
