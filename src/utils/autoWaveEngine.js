/**
 * autoWaveEngine.js
 *
 * Automatically exchanges partner ads between every server the bot is in.
 *
 * Flow (every 30 min):
 *  1. Collect all guilds with partner_channel + ad_channel configured.
 *  2. Round-robin: pick ONE source guild for this tick.
 *  3. Read the most recent message from that guild's ad_channel.
 *  4. Find ONE eligible target guild (next in line that passes all checks).
 *  5. Build the ad message + ping (based on member count tiers) + Add WaveBot button.
 *  6. Send to target's partner_channel, log to target's log_channel.
 *  7. Update cooldown timestamp.
 */

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const setupStore     = require('./setupStore');
const autoWaveStore  = require('./autoWaveStore');

const TICK_MS          = 30 * 60 * 1000;   // 30 minutes
const MIN_MEMBERS      = 25;               // minimum members to receive a partner
const MIN_COOLDOWN_MS  = 30 * 60 * 1000;   // minimum 30-minute cooldown

// ─── Ping tier thresholds ────────────────────────────────────────────────────
// Tier is determined by the LARGER of the two guild member counts.
//
//  Nano   < 100     → no ping
//  Small  100–499   → @here
//  Medium 500–999   → @here + partner_ping_role
//  Large  1 000+    → member_role mention
//
// Role safety checks:
//   member_role      must cover ≥ 90 % of guild members  (else fallback to @here)
//   partner_ping_role must cover ≤ 10 % of guild members (else fallback to @here)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves the ping string to append to the partner ad in targetGuild.
 * @param {import('discord.js').Guild} sourceGuild
 * @param {import('discord.js').Guild} targetGuild
 * @param {object}  targetCfg  – setupStore config for targetGuild
 * @returns {Promise<string>}  ping string (may be empty)
 */
async function resolvePing(sourceGuild, targetGuild, targetCfg) {
  const memberCount = targetGuild.memberCount;

  // ── Nano ────────────────────────────────────────────────────────────────────
  if (memberCount < 100) return '';

  // ── Small ───────────────────────────────────────────────────────────────────
  if (memberCount < 500) return '@here';

  // ── Medium ──────────────────────────────────────────────────────────────────
  if (memberCount < 1000) {
    const partnerPingRoleId = targetCfg.partnerPingRoleId;
    if (partnerPingRoleId) {
      const role = targetGuild.roles.cache.get(partnerPingRoleId);
      if (role) {
        const roleMemberCount = role.members.size;
        const rolePct = roleMemberCount / memberCount;
        if (rolePct <= 0.10) {
          // Safe — role is ≤ 10 % of the server
          return `@here <@&${partnerPingRoleId}>`;
        }
      }
    }
    // Fallback if no partner role or role is too large
    return '@here';
  }

  // ── Large (1 000+) ──────────────────────────────────────────────────────────
  const memberRoleId = targetCfg.memberRoleId;
  if (memberRoleId) {
    const role = targetGuild.roles.cache.get(memberRoleId);
    if (role) {
      const roleMemberCount = role.members.size;
      const rolePct = roleMemberCount / memberCount;
      if (rolePct >= 0.90) {
        // Safe — role covers ≥ 90 % of the server
        return `<@&${memberRoleId}>`;
      }
      // Role doesn't cover 90 %+ — warn in log and fall back
      await logToGuild(targetGuild, targetCfg,
        `⚠️ **Auto-Wave ping warning:** \`member_role\` (<@&${memberRoleId}>) only covers ` +
        `**${Math.round(rolePct * 100)}%** of members (need ≥ 90%). Falling back to \`@here\`.`
      );
    }
  }
  return '@here';
}

/**
 * Posts a message to the guild's log_channel (silently fails if not configured).
 */
async function logToGuild(guild, cfg, message) {
  try {
    if (!cfg.logChannelId) return;
    const ch = guild.channels.cache.get(cfg.logChannelId);
    if (ch?.isTextBased()) await ch.send(message);
  } catch { /* swallow */ }
}

/**
 * Builds the "Add WaveBot" link button row.
 */
function buildAddBotRow(clientId) {
  const inviteUrl =
    `https://discord.com/oauth2/authorize?client_id=${clientId}` +
    `&permissions=8&scope=bot%20applications.commands`;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('➕ Add WaveBot')
      .setStyle(ButtonStyle.Link)
      .setURL(inviteUrl)
  );
}

/**
 * Main engine tick — runs every 30 minutes.
 * Picks ONE source guild (round-robin) and sends its ad to ONE eligible target.
 */
async function tick(client) {
  try {
    // ── 1. Collect all configured guilds ──────────────────────────────────────
    const configuredGuilds = [];
    for (const [guildId, guild] of client.guilds.cache) {
      const cfg = setupStore.get(guildId);
      if (cfg.partnerChannelId && cfg.adChannelId) {
        configuredGuilds.push({ guild, cfg, guildId });
      }
    }

    if (configuredGuilds.length < 2) return; // need at least 2 servers

    // ── 2. Round-robin: pick source ───────────────────────────────────────────
    const idx    = autoWaveStore.getRoundRobinIndex();
    const source = configuredGuilds[idx % configuredGuilds.length];
    autoWaveStore.advanceRoundRobin(configuredGuilds.length);

    const { guild: sourceGuild, cfg: sourceCfg } = source;

    // ── 3. Read the most recent message from source's ad_channel ─────────────
    const adChannel = sourceGuild.channels.cache.get(sourceCfg.adChannelId);
    if (!adChannel?.isTextBased()) return;

    let adContent;
    try {
      const messages = await adChannel.messages.fetch({ limit: 5 });
      // Find first non-empty, non-bot message (the actual ad)
      const adMsg = messages.find(m => m.content && m.content.trim().length > 0);
      if (!adMsg) {
        await logToGuild(sourceGuild, sourceCfg,
          `⚠️ **Auto-Wave:** Could not find an ad in <#${sourceCfg.adChannelId}>. Skipping this tick.`
        );
        return;
      }
      adContent = adMsg.content;
    } catch {
      return;
    }

    // ── 4. Find ONE eligible target ───────────────────────────────────────────
    // Try each guild in order starting after source, until one is eligible.
    const now = Date.now();

    for (let i = 1; i < configuredGuilds.length; i++) {
      const targetEntry = configuredGuilds[(idx + i) % configuredGuilds.length];
      const { guild: targetGuild, cfg: targetCfg, guildId: targetId } = targetEntry;

      // Must have 25+ members
      if (targetGuild.memberCount < MIN_MEMBERS) continue;

      // Cooldown check
      const delayMs   = Math.max((targetCfg.partnerDelayHours ?? 24) * 60 * 60 * 1000, MIN_COOLDOWN_MS);
      const lastRecv  = autoWaveStore.getLastReceived(targetId);
      if (now - lastRecv < delayMs) continue;

      // ── 5. Resolve ping ───────────────────────────────────────────────────
      const ping = await resolvePing(sourceGuild, targetGuild, targetCfg);

      // ── 6. Send ad to target ──────────────────────────────────────────────
      const partnerChannel = targetGuild.channels.cache.get(targetCfg.partnerChannelId);
      if (!partnerChannel?.isTextBased()) continue;

      const finalContent = ping ? `${adContent}\n\n${ping}` : adContent;
      const addBotRow    = buildAddBotRow(client.user.id);

      try {
        await partnerChannel.send({
          content: finalContent,
          components: [addBotRow],
          allowedMentions: {
            parse: ping.includes('@everyone') ? ['everyone'] :
                   ping.includes('@here')     ? ['here']     : ['roles'],
          },
        });

        // ── 7. Update cooldown ──────────────────────────────────────────────
        autoWaveStore.setLastReceived(targetId);

        // Log success to both guilds
        const successMsg =
          `✅ **Auto-Wave sent:** Ad from **${sourceGuild.name}** → <#${targetCfg.partnerChannelId}> ` +
          `(${targetGuild.name}) | Ping: \`${ping || 'none'}\``;

        await logToGuild(sourceGuild, sourceCfg, successMsg);
        await logToGuild(targetGuild, targetCfg,
          `📨 **Auto-Wave received:** Ad from **${sourceGuild.name}** posted in <#${targetCfg.partnerChannelId}>.`
        );

        console.log(`[AutoWave] ✅ ${sourceGuild.name} → ${targetGuild.name} (ping: ${ping || 'none'})`);
      } catch (err) {
        await logToGuild(sourceGuild, sourceCfg,
          `❌ **Auto-Wave failed:** Could not send ad to **${targetGuild.name}**: ${err.message}`
        );
        console.error(`[AutoWave] ❌ Failed to send to ${targetGuild.name}:`, err.message);
      }

      // Only one target per tick (round-robin)
      break;
    }
  } catch (err) {
    console.error('[AutoWave] ❌ Tick error:', err);
  }
}

/**
 * Start the auto-wave engine. Called once from ready.js.
 */
function startAutoWave(client) {
  console.log(`🌊 Auto-Wave engine started — ticking every 30 minutes.`);
  // Run first tick after 30 min (don't blast on startup)
  setTimeout(() => {
    tick(client);
    setInterval(() => tick(client), TICK_MS);
  }, TICK_MS);
}

module.exports = { startAutoWave };
