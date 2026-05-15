/**
 * autoWaveEngine.js — Auto-partner wave engine (v2)
 *
 * Algorithm (every 30 min):
 *
 *  1. Collect all guilds with partner_channel + ad_channel configured.
 *     Need at least 2 to do anything.
 *
 *  2. SOURCE SELECTION — shuffled queue (random, no repeats until all served)
 *     Pop from a persisted shuffled queue. When the queue runs out, reshuffle
 *     all active guilds and start again. This prevents the same guild from
 *     always sending first, while avoiding pure randomness where one guild
 *     might never be picked.
 *
 *  3. Fetch the latest ad from source's ad_channel.
 *
 *  4. TARGET SELECTION — randomized with 2-day pair cooldown
 *     Shuffle all other configured guilds. Iterate through the shuffled list
 *     and pick the FIRST guild that passes ALL of:
 *       a. Has ≥ 25 members
 *       b. Per-server receive cooldown has passed (from /config partner_delay_hours)
 *       c. This specific source↔target pair has NOT partnered in the last 2 days
 *
 *  5. Build ad + ping (based on target member count tiers) + Add Oblivion button.
 *
 *  6. Send to target's partner_channel.
 *     Record the pair (source, target, timestamp).
 *     Log success to both guilds' log_channel.
 *
 *  7. Update per-server cooldown for the target.
 */

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const setupStore    = require('./setupStore');
const autoWaveStore = require('./autoWaveStore');
const { recordPair, pairedRecently, nextSource } = require('./pairStore');
const { logError }  = require('./errorStore');

const TICK_MS         = 30 * 60 * 1000;   // 30 minutes
const MIN_MEMBERS     = 25;
const MIN_COOLDOWN_MS = 30 * 60 * 1000;   // hard floor: 30 min

// ─── Shuffle helper ───────────────────────────────────────────────────────────

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Ping tier resolver ───────────────────────────────────────────────────────

async function resolvePing(targetGuild, targetCfg) {
  const mc = targetGuild.memberCount;

  if (mc < 100) return '';

  if (mc < 500) return '@here';

  if (mc < 1000) {
    const role = targetGuild.roles.cache.get(targetCfg.partnerPingRoleId);
    if (role) {
      const pct = role.members.size / mc;
      if (pct >= 0.10) return `@here <@&${role.id}>`;
    }
    return '@here';
  }

  // Large (1000+) — use member role if it covers ≥90%
  const role = targetGuild.roles.cache.get(targetCfg.memberRoleId);
  if (role) {
    const pct = role.members.size / mc;
    if (pct >= 0.90) return `<@&${role.id}>`;

    await logToGuild(targetGuild, targetCfg,
      `⚠️ **Auto-Wave ping warning:** \`member_role\` (<@&${role.id}>) only covers ` +
      `**${Math.round(pct * 100)}%** of members (needs ≥ 90%). Falling back to \`@here\`.`
    );
  }
  return '@here';
}

// ─── Log to guild ─────────────────────────────────────────────────────────────

async function logToGuild(guild, cfg, message) {
  try {
    if (!cfg.logChannelId) return;
    const ch = guild.channels.cache.get(cfg.logChannelId);
    if (ch?.isTextBased()) await ch.send(message);
  } catch { /* swallow */ }
}

// ─── Add Oblivion button ──────────────────────────────────────────────────────

function buildAddBotRow(clientId) {
  const url =
    `https://discord.com/oauth2/authorize?client_id=${clientId}` +
    `&permissions=8&scope=bot%20applications.commands`;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('➕ Add Oblivion')
      .setStyle(ButtonStyle.Link)
      .setURL(url)
  );
}

// ─── Main tick ────────────────────────────────────────────────────────────────

async function tick(client) {
  try {
    // 1. Collect all guilds with a full config ─────────────────────────────────
    const configured = [];
    for (const [guildId, guild] of client.guilds.cache) {
      const cfg = setupStore.get(guildId);
      if (cfg.partnerChannelId && cfg.adChannelId) {
        configured.push({ guild, cfg, guildId });
      }
    }

    if (configured.length < 2) return; // need at least 2

    const activeIds = configured.map(e => e.guildId);

    // 2. Pick source from shuffled queue ───────────────────────────────────────
    const sourceId    = nextSource(activeIds);
    const sourceEntry = configured.find(e => e.guildId === sourceId);

    if (!sourceEntry) return; // shouldn't happen but guard

    const { guild: sourceGuild, cfg: sourceCfg } = sourceEntry;

    // 3. Fetch the latest ad from source ───────────────────────────────────────
    const adChannel = sourceGuild.channels.cache.get(sourceCfg.adChannelId);
    if (!adChannel?.isTextBased()) return;

    let adContent;
    try {
      const messages = await adChannel.messages.fetch({ limit: 5 });
      const adMsg    = messages.find(m => m.content?.trim().length > 0);
      if (!adMsg) {
        await logToGuild(sourceGuild, sourceCfg,
          `⚠️ **Auto-Wave:** No ad found in <#${sourceCfg.adChannelId}>. Skipping this tick.`
        );
        return;
      }
      adContent = adMsg.content;
    } catch {
      return;
    }

    // 4. Find a target — shuffled, with 2-day pair cooldown check ──────────────
    const now      = Date.now();
    const targets  = shuffle(configured.filter(e => e.guildId !== sourceId));

    for (const { guild: targetGuild, cfg: targetCfg, guildId: targetId } of targets) {

      // a. Member minimum
      if (targetGuild.memberCount < MIN_MEMBERS) continue;

      // b. Per-server cooldown (configured delay, min 30 min)
      const delayMs  = Math.max((targetCfg.partnerDelayHours ?? 24) * 3_600_000, MIN_COOLDOWN_MS);
      const lastRecv = autoWaveStore.getLastReceived(targetId);
      if (now - lastRecv < delayMs) continue;

      // c. 2-day pair cooldown — skip if these two already partnered recently
      if (pairedRecently(sourceId, targetId)) {
        console.log(`[AutoWave] ⏭  Skipping ${sourceGuild.name} → ${targetGuild.name} (partnered within last 2 days)`);
        continue;
      }

      // 5. Resolve ping ──────────────────────────────────────────────────────────
      const ping = await resolvePing(targetGuild, targetCfg);

      // 6. Send ad ──────────────────────────────────────────────────────────────
      const partnerChannel = targetGuild.channels.cache.get(targetCfg.partnerChannelId);
      if (!partnerChannel?.isTextBased()) continue;

      const finalContent = ping ? `${adContent}\n\n${ping}` : adContent;

      try {
        await partnerChannel.send({
          content: finalContent,
          components: [buildAddBotRow(client.user.id)],
          allowedMentions: {
            parse: ping.includes('@everyone') ? ['everyone'] :
                   ping.includes('@here')     ? ['here']     : ['roles'],
          },
        });

        // 7. Record pair + update cooldowns + log ─────────────────────────────
        recordPair(sourceId, targetId);
        autoWaveStore.setLastReceived(targetId);

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
          `❌ **Auto-Wave failed:** Could not send to **${targetGuild.name}**: ${err.message}`
        );
        logError('AutoWave', err, targetGuild.id);
        console.error(`[AutoWave] ❌ Failed to send to ${targetGuild.name}:`, err.message);
      }

      // Only one pair per tick
      break;
    }

  } catch (err) {
    logError('AutoWave/Tick', err);
    console.error('[AutoWave] ❌ Tick error:', err);
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────

function startAutoWave(client) {
  console.log(`🌊 Auto-Wave engine started — ticking every 30 minutes.`);
  setTimeout(() => {
    tick(client);
    setInterval(() => tick(client), TICK_MS);
  }, TICK_MS);
}

module.exports = { startAutoWave, tick };
