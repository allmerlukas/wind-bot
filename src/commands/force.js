/**
 * /force — Owner-only manual partner trigger
 *
 * Subcommands:
 *   /force partner source:<guild_id> destination:<guild_id>
 *     → Immediately sends source guild's ad to one destination guild
 *
 *   /force partnerall source:<guild_id>
 *     → Immediately sends source guild's ad to ALL other configured guilds
 *       (bypasses cooldown)
 */

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const { checkOwner } = require('../utils/ownerGuard');
const setupStore     = require('../utils/setupStore');
const autoWaveStore  = require('../utils/autoWaveStore');
const { recordPair } = require('../utils/pairStore');
const { logError }   = require('../utils/errorStore');

// ─── Shared helpers ───────────────────────────────────────────────────────────

function buildAddBotRow(clientId) {
  const url = `https://discord.gg/2H39ahH3sB`;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('➕ Add Wind Bot').setStyle(ButtonStyle.Link).setURL(url)
  );
}

async function fetchAd(guild, cfg) {
  try {
    const ch = guild.channels.cache.get(cfg.adChannelId);
    if (!ch?.isTextBased()) return null;
    const msgs = await ch.messages.fetch({ limit: 5 });
    return msgs.find(m => m.content?.trim().length > 0)?.content ?? null;
  } catch { return null; }
}

async function resolvePing(targetGuild, targetCfg) {
  const mc = targetGuild.memberCount;
  if (mc < 100) return '';
  if (mc < 500) return '@here';
  if (mc < 1000) {
    const role = targetGuild.roles.cache.get(targetCfg.partnerPingRoleId);
    if (role && role.members.size / mc >= 0.10) return `@here <@&${role.id}>`;
    return '@here';
  }
  const role = targetGuild.roles.cache.get(targetCfg.memberRoleId);
  if (role && role.members.size / mc >= 0.90) return `<@&${role.id}>`;
  return '@here';
}

async function sendAdToTarget(sourceGuild, targetGuild, targetCfg, adContent, clientId) {
  const ping    = await resolvePing(targetGuild, targetCfg);
  const content = ping ? `${adContent}\n\n${ping}` : adContent;
  const ch      = targetGuild.channels.cache.get(targetCfg.partnerChannelId);
  if (!ch?.isTextBased()) return { ok: false, reason: 'no channel' };

  try {
    await ch.send({
      content,
      components: [buildAddBotRow(clientId)],
      allowedMentions: {
        parse: ping.includes('@everyone') ? ['everyone'] :
               ping.includes('@here')     ? ['here']     : ['roles'],
      },
    });
    autoWaveStore.setLastReceived(targetGuild.id);
    recordPair(sourceGuild.id, targetGuild.id);
    return { ok: true, ping };
  } catch (err) {
    logError(`Force/Partner→${targetGuild.name}`, err, targetGuild.id);
    return { ok: false, reason: err.message };
  }
}

// ─── Command definition ───────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('force')
    .setDescription('Owner: manually trigger partner sends')
    .setDefaultMemberPermissions(0n)

    // /force partner source destination
    .addSubcommand(sub =>
      sub.setName('partner')
        .setDescription('Force send one guild\'s ad to another guild right now')
        .addStringOption(opt =>
          opt.setName('source')
            .setDescription('Guild ID whose ad to send')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('destination')
            .setDescription('Guild ID to send the ad to')
            .setRequired(true)
        )
    )

    // /force partnerall source
    .addSubcommand(sub =>
      sub.setName('partnerall')
        .setDescription('Force send one guild\'s ad to ALL other configured guilds right now')
        .addStringOption(opt =>
          opt.setName('source')
            .setDescription('Guild ID whose ad to send everywhere')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    if (!await checkOwner(interaction)) return;
    await interaction.deferReply({ ephemeral: true });

    const sub    = interaction.options.getSubcommand();
    const client = interaction.client;

    // ── /force partner ────────────────────────────────────────────────────────
    if (sub === 'partner') {
      const sourceId = interaction.options.getString('source');
      const destId   = interaction.options.getString('destination');

      const sourceGuild = client.guilds.cache.get(sourceId);
      const destGuild   = client.guilds.cache.get(destId);

      if (!sourceGuild) return interaction.editReply(`❌ Source guild \`${sourceId}\` not found — is the bot in that server?`);
      if (!destGuild)   return interaction.editReply(`❌ Destination guild \`${destId}\` not found — is the bot in that server?`);

      const sourceCfg = setupStore.get(sourceId);
      const destCfg   = setupStore.get(destId);

      if (!sourceCfg.adChannelId)      return interaction.editReply(`❌ **${sourceGuild.name}** has no \`ad_channel\` configured. Run \`/config set\` there first.`);
      if (!destCfg.partnerChannelId)   return interaction.editReply(`❌ **${destGuild.name}** has no \`partner_channel\` configured. Run \`/config set\` there first.`);

      const ad = await fetchAd(sourceGuild, sourceCfg);
      if (!ad) return interaction.editReply(`❌ Could not find an ad in **${sourceGuild.name}**'s ad channel.`);

      const result = await sendAdToTarget(sourceGuild, destGuild, destCfg, ad, client.user.id);

      if (result.ok) {
        return interaction.editReply(
          `✅ **Forced partner sent!**\n` +
          `📤 **From:** ${sourceGuild.name}\n` +
          `📥 **To:** ${destGuild.name} — <#${destCfg.partnerChannelId}>\n` +
          `🔔 **Ping:** \`${result.ping || 'none'}\``
        );
      } else {
        return interaction.editReply(`❌ Failed to send to **${destGuild.name}**: ${result.reason}`);
      }
    }

    // ── /force partnerall ─────────────────────────────────────────────────────
    if (sub === 'partnerall') {
      const sourceId = interaction.options.getString('source');
      const sourceGuild = client.guilds.cache.get(sourceId);

      if (!sourceGuild) return interaction.editReply(`❌ Source guild \`${sourceId}\` not found — is the bot in that server?`);

      const sourceCfg = setupStore.get(sourceId);
      if (!sourceCfg.adChannelId) return interaction.editReply(`❌ **${sourceGuild.name}** has no \`ad_channel\` configured.`);

      const ad = await fetchAd(sourceGuild, sourceCfg);
      if (!ad) return interaction.editReply(`❌ Could not find an ad in **${sourceGuild.name}**'s ad channel.`);

      // Collect all OTHER guilds that have a partner_channel configured
      const targets = [];
      for (const [guildId, guild] of client.guilds.cache) {
        if (guildId === sourceId) continue;
        const cfg = setupStore.get(guildId);
        if (cfg.partnerChannelId) targets.push({ guild, cfg });
      }

      if (targets.length === 0) {
        return interaction.editReply(`❌ No other guilds have a \`partner_channel\` configured.`);
      }

      const results = { ok: 0, failed: 0, lines: [] };

      for (const { guild: tGuild, cfg: tCfg } of targets) {
        const r = await sendAdToTarget(sourceGuild, tGuild, tCfg, ad, client.user.id);
        if (r.ok) {
          results.ok++;
          results.lines.push(`✅ **${tGuild.name}** (ping: \`${r.ping || 'none'}\`)`);
        } else {
          results.failed++;
          results.lines.push(`❌ **${tGuild.name}** — ${r.reason}`);
        }
      }

      const embed = new EmbedBuilder()
        .setColor(results.failed === 0 ? 0x57F287 : 0xFEE75C)
        .setTitle('🌊 Force Partner All — Results')
        .setDescription(
          `📤 **Source:** ${sourceGuild.name}\n` +
          `✅ Sent: **${results.ok}** | ❌ Failed: **${results.failed}**\n\n` +
          results.lines.join('\n')
        )
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }
  },
};
