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
  if (mc < 500) return '[Placeholder for here ping]';
  if (mc < 1000) {
    const role = targetGuild.roles.cache.get(targetCfg.partnerPingRoleId);
    if (role && role.members.size / mc >= 0.10) return `[Placeholder for here ping] [Placeholder for ${role.name} ping]`;
    return '[Placeholder for here ping]';
  }
  const role = targetGuild.roles.cache.get(targetCfg.memberRoleId);
  if (role && role.members.size / mc >= 0.90) return `[Placeholder for ${role.name} ping]`;
  return '[Placeholder for here ping]';
}

async function sendAdToTarget(sourceGuild, targetGuild, targetCfg, adContent, clientId) {
  const ping    = await resolvePing(targetGuild, targetCfg);
  const content = ping ? `${adContent}\n\n${ping}` : adContent;
  const ch      = targetGuild.channels.cache.get(targetCfg.partnerChannelId);
  if (!ch?.isTextBased()) return { ok: false, reason: 'no channel' };

  try {
    const msg = await ch.send({
      content,
      components: [buildAddBotRow(clientId)],
      allowedMentions: { parse: [] },
    });
    return { ok: true, ping, msg };
  } catch (err) {
    logError(`Force/Partner→${targetGuild.name}`, err, targetGuild.id);
    return { ok: false, reason: err.message };
  }
}

// ─── Command definition ───────────────────────────────────────────────────────

async function handleForcePartnerSubmit(client, interaction) {
  const sourceId = interaction.fields.getTextInputValue('source');
  const destId   = interaction.fields.getTextInputValue('destination');

  const sourceGuild = client.guilds.cache.get(sourceId);
  const destGuild   = client.guilds.cache.get(destId);

  if (!sourceGuild) return interaction.editReply(`❌ Source guild \`${sourceId}\` not found — is the bot in that server?`);
  if (!destGuild)   return interaction.editReply(`❌ Destination guild \`${destId}\` not found — is the bot in that server?`);

  const sourceCfg = await setupStore.get(sourceId);
  const destCfg   = await setupStore.get(destId);

  if (!sourceCfg.adChannelId)      return interaction.editReply(`❌ **${sourceGuild.name}** has no \`ad_channel\` configured. Run \`/config set\` there first.`);
  if (!destCfg.partnerChannelId)   return interaction.editReply(`❌ **${destGuild.name}** has no \`partner_channel\` configured. Run \`/config set\` there first.`);

  const ad = await fetchAd(sourceGuild, sourceCfg);
  if (!ad) return interaction.editReply(`❌ Could not find an ad in **${sourceGuild.name}**'s ad channel.`);

  const result = await sendAdToTarget(sourceGuild, destGuild, destCfg, ad, client.user.id);

  if (result.ok) {
    await autoWaveStore.setLastReceived(destGuild.id);
    await recordPair(sourceGuild.id, destGuild.id);
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

async function handleForcePartnerAll(client, interaction) {
  const activeGuilds = [];

  for (const [guildId, guild] of client.guilds.cache) {
    const cfg = await setupStore.get(guildId);
    if (cfg.partnerChannelId && cfg.adChannelId && cfg.logChannelId && cfg.memberRoleId && cfg.partnerPingRoleId) {
      const ad = await fetchAd(guild, cfg);
      if (ad) activeGuilds.push({ guild, cfg, guildId, ad });
    }
  }

  if (activeGuilds.length < 2) {
    return interaction.editReply(`❌ Not enough fully configured guilds with valid ads to run a mass wave.`);
  }

  // Shuffle the pool
  const pool = [...activeGuilds].sort(() => Math.random() - 0.5);
  const pairs = [];
  const usedIds = new Set();

  for (let i = 0; i < pool.length; i++) {
    const serverA = pool[i];
    if (usedIds.has(serverA.guildId)) continue;

    let matchedB = null;
    for (let j = i + 1; j < pool.length; j++) {
      const serverB = pool[j];
      if (usedIds.has(serverB.guildId)) continue;

      // Check member bounds
      const aCount = serverA.guild.memberCount;
      const bCount = serverB.guild.memberCount;
      const aMin = serverA.cfg.minMembers ?? null;
      const aMax = serverA.cfg.maxMembers ?? null;
      const bMin = serverB.cfg.minMembers ?? null;
      const bMax = serverB.cfg.maxMembers ?? null;

      let ok = true;
      if (aMin !== null && aMax !== null && (aCount < aMin || aCount > aMax || bCount < aMin || bCount > aMax)) ok = false;
      if (bMin !== null && bMax !== null && (bCount < bMin || bCount > bMax || aCount < bMin || aCount > bMax)) ok = false;
      if (bCount < 25 || aCount < 25) ok = false;

      if (ok) {
        matchedB = serverB;
        break;
      }
    }

    if (matchedB) {
      usedIds.add(serverA.guildId);
      usedIds.add(matchedB.guildId);
      pairs.push([serverA, matchedB]);
    }
  }

  if (pairs.length === 0) {
    return interaction.editReply(`❌ Checked ${pool.length} guilds but found 0 valid pairs that meet each other's member requirements.`);
  }

  const results = { ok: 0, lines: [] };

  for (const [srvA, srvB] of pairs) {
    const r1 = await sendAdToTarget(srvA.guild, srvB.guild, srvB.cfg, srvA.ad, client.user.id);
    const r2 = await sendAdToTarget(srvB.guild, srvA.guild, srvA.cfg, srvB.ad, client.user.id);

    if (r1.ok && r2.ok) {
      await autoWaveStore.setLastReceived(srvA.guild.id);
      await autoWaveStore.setLastReceived(srvB.guild.id);
      await recordPair(srvA.guild.id, srvB.guild.id);
      await recordPair(srvB.guild.id, srvA.guild.id);
      results.ok++;
      results.lines.push(`✅ **${srvA.guild.name}** ↔ **${srvB.guild.name}**`);
    } else {
      // Rollback if partial failure
      if (r1.ok && r1.msg) await r1.msg.delete().catch(() => {});
      if (r2.ok && r2.msg) await r2.msg.delete().catch(() => {});
      results.lines.push(`⚠️ **${srvA.guild.name}** ↔ **${srvB.guild.name}** (Failed/Rolled back)`);
    }
  }

  const embed = new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('🌊 Force Partner All — Bilateral Results')
    .setDescription(
      `Analyzed **${pool.length}** active servers.\n` +
      `Successfully paired **${results.ok * 2}** servers into **${results.ok}** bilateral matches!\n\n` +
      results.lines.join('\n')
    )
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}

module.exports = { handleForcePartnerSubmit, handleForcePartnerAll };
