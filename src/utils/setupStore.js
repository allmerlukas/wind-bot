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
  pingEnabled:       'ping_enabled',
  allowPaidAds:      'allow_paid_ads',
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

/**
 * Deletes all config for a guild (removes them from the Auto-Wave system).
 */
async function remove(guildId) {
  await supabase
    .from('guild_config')
    .delete()
    .eq('guild_id', guildId);
}

/**
 * Synchronizes support server roles for a guild owner based on all their servers' configs.
 */
async function syncOwnerRoles(ownerId, client) {
  try {
    const supportGuildId = process.env.GUILD_ID;
    if (!supportGuildId) return;
    
    const supportGuild = await client.guilds.fetch(supportGuildId).catch(() => null);
    if (!supportGuild) return;

    const member = await supportGuild.members.fetch(ownerId).catch(() => null);
    if (!member) return;

    const allCfgs = await getAll();
    const userRoleId = '1520083899655520335';
    const paidAdRoleId = '1467132255485952031';
    
    let shouldHaveUserRole = false;
    let shouldHavePaidAdRole = false;

    for (const g of client.guilds.cache.values()) {
      if (g.ownerId === ownerId) {
        const cfg = allCfgs.find(c => c.guild_id === g.id);
        if (cfg && cfg.partnerChannelId && cfg.adChannelId) {
          shouldHaveUserRole = true;
          if (cfg.allowPaidAds) {
            shouldHavePaidAdRole = true;
          }
        }
      }
    }

    if (shouldHaveUserRole && !member.roles.cache.has(userRoleId)) {
      await member.roles.add(userRoleId).catch(() => {});
    } else if (!shouldHaveUserRole && member.roles.cache.has(userRoleId)) {
      await member.roles.remove(userRoleId).catch(() => {});
    }

    if (shouldHavePaidAdRole && !member.roles.cache.has(paidAdRoleId)) {
      await member.roles.add(paidAdRoleId).catch(() => {});
    } else if (!shouldHavePaidAdRole && member.roles.cache.has(paidAdRoleId)) {
      await member.roles.remove(paidAdRoleId).catch(() => {});
    }
  } catch (error) {
    console.error('Failed to sync owner roles:', error);
  }
}

module.exports = { get, set, getAll, remove, syncOwnerRoles };


