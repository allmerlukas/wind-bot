const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');
const setupStore = require('./setupStore');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

/**
 * Builds the Status Overview embed dynamically.
 * @param {Client} client
 * @param {string} title
 * @returns {Promise<EmbedBuilder>}
 */
async function buildStatusEmbed(client, title = '🤖 Bot Status') {
  const uptime = process.uptime();
  const d = Math.floor(uptime / (3600 * 24));
  const h = Math.floor((uptime % (3600 * 24)) / 3600);
  const m = Math.floor((uptime % 3600) / 60);
  const uptimeStr = `${d}d ${h}h ${m}m`;
  
  const ping = client.ws.ping;
  const mem = process.memoryUsage().heapUsed;
  const memMB = Math.round(mem / 1024 / 1024);
  const guildCount = client.guilds.cache.size;

  const { count: totalPartnerships } = await supabase.from('wave_pairs').select('*', { count: 'exact', head: true });
  const totalMembers = client.guilds.cache.reduce((sum, g) => sum + (g.memberCount || 0), 0);
  const allCfgs = await setupStore.getAll();
  const paidAdsGuilds = allCfgs.filter(c => c.allowPaidAds).map(c => c.guild_id);
  const paidAdsMembers = client.guilds.cache.filter(g => paidAdsGuilds.includes(g.id)).reduce((sum, g) => sum + (g.memberCount || 0), 0);

  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(title)
    .addFields(
      { name: '⏱️ Uptime', value: uptimeStr, inline: true },
      { name: '🏓 Ping', value: `${ping}ms`, inline: true },
      { name: '🧠 Memory', value: `${memMB} MB`, inline: true },
      { name: '🌐 Guilds', value: `${guildCount}`, inline: true },
      { name: '👥 Members (all servers)', value: totalMembers.toLocaleString(), inline: true },
      { name: '📦 Node.js', value: process.version, inline: true },
      { name: '🤝 Total Partnerships', value: `${totalPartnerships ?? 0}`, inline: true },
      { name: '📣 Paid Ads Enabled', value: `${paidAdsGuilds.length} servers\n(${paidAdsMembers.toLocaleString()} members)`, inline: true },
    )
    .setTimestamp();
}

/**
 * Returns an ActionRow containing a "Return to Dashboard" button.
 * @param {string} dashType - 'owner', 'staff', 'vip', 'admin', 'utility'
 * @returns {ActionRowBuilder}
 */
function buildBackButtonRow(dashType) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`dash_return:${dashType}`)
      .setLabel('Return to Dashboard')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔙')
  );
}

module.exports = {
  buildStatusEmbed,
  buildBackButtonRow
};
