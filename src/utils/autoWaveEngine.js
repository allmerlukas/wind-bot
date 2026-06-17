/**
 * autoWaveEngine.js — Auto-partner wave engine (v3)
 *
 * Algorithm (every 30 min):
 *
 *  1. Collect all configured guilds. Need at least 2.
 *
 *  2. SOURCE — pop next from persistent shuffled queue (random, no repeats
 *     until all guilds have gone).
 *
 *  3. Cache the ad: find the most recent message in the ad_channel that
 *     contains a discord.gg invite link. Strip all @mentions from the text.
 *     Validate the ad for non-whitelisted external links.
 *
 *  4. TARGET — shuffle remaining guilds, iterate until we find one that:
 *       a. Has ≥ 10 members
 *       b. Per-server receive cooldown has passed
 *       c. Source↔target pair hasn't partnered in the last 3 days
 *       d. Neither guild is blacklisted
 *       e. Target channel is accessible
 *
 *  5. Build ping (based on member count tier), send, record pair, log.
 *
 * Validation failures are logged to the guild's log_channel silently.
 * We intentionally don't expose the exact checks to end users.
 */

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const setupStore                                   = require('./setupStore');
const autoWaveStore                                = require('./autoWaveStore');
const { recordPair, pairedRecently, nextSource }   = require('./pairStore');
const { isBlacklisted, getWhitelistedDomains }     = require('./blacklistStore');
const { logError }                                 = require('./errorStore');

const TICK_MS         = 30 * 60 * 1000;
const MIN_MEMBERS     = 10;
const MIN_COOLDOWN_MS = 30 * 60 * 1000;

/**
 * Set of message IDs the bot intentionally deleted (e.g. rollback).
 * messageDelete.js checks this to avoid issuing false strikes.
 */
const botDeletedMessages = new Set();

// Invite patterns that are always allowed in ads
const INVITE_RE     = /discord\.gg\/[a-zA-Z0-9-]+|discord\.com\/invite\/[a-zA-Z0-9-]+/gi;
// Any URL in the message
const ANY_URL_RE    = /https?:\/\/[^\s<>"]+|www\.[^\s<>"]+/gi;
// Require at least one discord.gg link in the ad
const NEEDS_INVITE  = /discord\.gg\/[a-zA-Z0-9-]+|discord\.com\/invite\/[a-zA-Z0-9-]+/i;

// ─── Shuffle ──────────────────────────────────────────────────────────────────

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Log to guild ─────────────────────────────────────────────────────────────

async function logToGuild(guild, cfg, message) {
  try {
    if (!cfg?.logChannelId) return;
    const ch = guild.channels.cache.get(cfg.logChannelId);
    if (ch?.isTextBased()) await ch.send(message);
  } catch { /* swallow */ }
}

// ─── Ad caching ───────────────────────────────────────────────────────────────
// Takes the most recent message in ad_channel that contains a discord.gg link.
// Strips all pings from the content before returning.

async function fetchAndCacheAd(guild, cfg) {
  const ch = guild.channels.cache.get(cfg.adChannelId);
  if (!ch?.isTextBased()) return null;

  let messages;
  try {
    messages = await ch.messages.fetch({ limit: 50 });
  } catch {
    return null;
  }

  // Find most recent message with a discord.gg invite
  const adMsg = [...messages.values()].find(m =>
    m.content?.trim().length > 0 && NEEDS_INVITE.test(m.content)
  );

  if (!adMsg) return null;

  return adMsg.content.trim() || null;
}

// ─── Ad validation ────────────────────────────────────────────────────────────
// Returns null if valid, or an internal reason string if invalid.
// Reasons are logged to the owner; generic message shown to guild.

function validateAd(adContent, whitelistedDomains) {
  if (!adContent || adContent.length < 10) return 'ad_too_short';

  // Must still contain an invite link after ping stripping
  if (!NEEDS_INVITE.test(adContent)) return 'no_invite_link';

  // Find all URLs in the ad
  const allUrls     = adContent.match(ANY_URL_RE) ?? [];
  const inviteUrls  = adContent.match(INVITE_RE)  ?? [];

  for (const url of allUrls) {
    if (inviteUrls.some(inv => url.includes(inv.replace(/https?:\/\//i, '')))) continue;
    const hostname = url.replace(/^https?:\/\//i, '').split('/')[0].toLowerCase();
    const allowed  =
      hostname.includes('discord.gg') ||
      hostname.includes('discord.com') ||
      hostname.includes('discordapp.com') ||
      whitelistedDomains.some(d => hostname === d || hostname.endsWith('.' + d));
    if (!allowed) return `non_whitelisted_link:${hostname}`;
  }

  return null; // valid
}

// ─── Ping resolver ────────────────────────────────────────────────────────────
// Returns { ping: string|null, allowedMentions: object }
//
// Ping level is based on the RATIO of source (sender) to target (receiver).
// The bigger the incoming server is relative to yours, the more you ping.
// Thresholds scale with the receiving server's absolute size:
//
//  Large  (500+)  : < 0.38 nothing | 0.38 partner | 0.51 @here | 0.71 p+here | 0.92 member
//  Medium (200+)  : < 0.20 nothing | 0.20 partner | 0.40 @here | 0.60 p+here | 0.90 member
//  Sm-Med  (50+)  : < 0.50 partner | 0.50 @here   | 0.85 member
//  Small  (< 50)  : < 0.85 partner | 0.85 member

async function resolvePing(sourceGuild, targetGuild, targetCfg) {
  // Check global ping kill-switch (set via /owner ping on/off)
  const globalCfg = await setupStore.get('global');
  if (globalCfg?.pingEnabled === false) {
    return { ping: null, allowedMentions: { parse: [] } };
  }

  // Ping disabled for this specific server
  if (targetCfg.pingEnabled === false) {
    return { ping: null, allowedMentions: { parse: [] } };
  }

  const n     = targetGuild.memberCount;      // receiving server size
  const m     = sourceGuild.memberCount;      // sending server size
  const ratio = m / Math.max(n, 1);          // how big is sender relative to receiver

  // Level: 0=nothing, 1=partner ping, 2=@here, 3=partner+@here, 4=member role
  let level;

  if (n >= 500) {
    if      (ratio >= 0.92) level = 4;
    else if (ratio >= 0.71) level = 3;
    else if (ratio >= 0.51) level = 2;
    else if (ratio >= 0.38) level = 1;
    else                    level = 0;
  } else if (n >= 200) {
    if      (ratio >= 0.90) level = 4;
    else if (ratio >= 0.60) level = 3;
    else if (ratio >= 0.40) level = 2;
    else if (ratio >= 0.20) level = 1;
    else                    level = 0;
  } else if (n >= 50) {
    if      (ratio >= 0.85) level = 4;
    else if (ratio >= 0.50) level = 2;
    else                    level = 1;
  } else {
    // Small server (< 50)
    level = ratio >= 0.85 ? 4 : 1;
  }

  if (level === 0) return { ping: null, allowedMentions: { parse: [] } };

  const partnerRole = targetCfg.partnerPingRoleId
    ? targetGuild.roles.cache.get(targetCfg.partnerPingRoleId) : null;
  const memberRole = targetCfg.memberRoleId
    ? targetGuild.roles.cache.get(targetCfg.memberRoleId) : null;

  if (level === 1) {
    if (partnerRole) return { ping: `<@&${partnerRole.id}>`, allowedMentions: { roles: [partnerRole.id] } };
    return { ping: null, allowedMentions: { parse: [] } };
  }
  if (level === 2) {
    return { ping: '@here', allowedMentions: { parse: ['everyone'] } };
  }
  if (level === 3) {
    const parts = [], roles = [];
    if (partnerRole) { parts.push(`<@&${partnerRole.id}>`); roles.push(partnerRole.id); }
    parts.push('@here');
    return { ping: parts.join(' '), allowedMentions: { parse: ['everyone'], roles } };
  }
  // level 4 — member role
  if (memberRole) return { ping: `<@&${memberRole.id}>`, allowedMentions: { roles: [memberRole.id] } };
  return { ping: '@here', allowedMentions: { parse: ['everyone'] } };
}

// ─── Add Wind Bot button ─────────────────────────────────────────────────────

function buildAddBotRow(clientId) {
  const url = 'https://discord.gg/2H39ahH3sB';

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('➕ Add Wind Bot')
      .setStyle(ButtonStyle.Link)
      .setURL(url)
  );
}

// ─── Runtime validation ───────────────────────────────────────────────────────
// Returns null if ok, or an internal failure code.
// Intentionally vague in guild-facing messages.

async function validateGuild(guildId, guild, cfg) {
  if (!cfg.partnerChannelId) return 'no_partner_channel';
  if (!cfg.adChannelId)      return 'no_ad_channel';
  if (!cfg.logChannelId)     return 'no_log_channel';
  if (!cfg.memberRoleId)     return 'no_member_role';
  if (!cfg.partnerPingRoleId) return 'no_ping_role';
  if (!cfg.partnerDelayHours) return 'no_delay_hours';
  if (!guild.channels.cache.get(cfg.partnerChannelId)?.isTextBased()) return 'partner_channel_inaccessible';
  if (!guild.channels.cache.get(cfg.adChannelId)?.isTextBased())      return 'ad_channel_inaccessible';
  if (await isBlacklisted(guildId))  return 'blacklisted';
  return null;
}

let engineRunning = true;

function isEngineRunning() {
  return engineRunning;
}

function setEngineState(state) {
  engineRunning = state;
}

const incompleteDmCache = new Map();

// Tracks repeated log messages per guild to avoid spam.
// Key: `${guildId}:${messageType}`, value: number of times sent.
// After 2 sends we go silent until the issue is resolved (counter deleted).
const spamCache = new Map();

function logOnce(guildId, type, guild, cfg, firstMsg, secondMsg) {
  const key   = `${guildId}:${type}`;
  const count = (spamCache.get(key) ?? 0) + 1;
  spamCache.set(key, count);
  if (count === 1) return logToGuild(guild, cfg, firstMsg);
  if (count === 2) return logToGuild(guild, cfg, secondMsg);
  return Promise.resolve(); // silent from here on
}

function clearSpam(guildId, type) {
  spamCache.delete(`${guildId}:${type}`);
}

// ─── Main tick ────────────────────────────────────────────────────────────────

async function tick(client) {
  if (!engineRunning) return;

  try {
    const now = Date.now();
    const readyGuilds = [];

    // 1. Collect all guilds passing runtime validation ─────────────────────────
    for (const [guildId, guild] of client.guilds.cache) {
      const cfg    = await setupStore.get(guildId);
      const reason = await validateGuild(guildId, guild, cfg);

      if (reason) {
        if (reason !== 'blacklisted') {
          if (!cfg.logChannelId) {
            const lastDm = incompleteDmCache.get(guildId) || 0;
            if (now - lastDm > 4 * 60 * 60 * 1000) {
              try {
                const owner = await client.users.fetch(guild.ownerId);
                await owner.send(`⚠️ **Wind Bot Auto-Wave:** Your server **${guild.name}** was skipped from the partner network because your \`/config setup\` is incomplete.\nPlease finish the setup in your server to start receiving partners!`);
                incompleteDmCache.set(guildId, now);
              } catch { /* ignore */ }
            }
          } else if (reason !== 'no_partner_channel' && reason !== 'no_ad_channel') {
            const lastLog = incompleteDmCache.get(guildId) || 0;
            if (now - lastLog > 4 * 60 * 60 * 1000) {
              await logToGuild(guild, cfg, `⚠️ **Auto-Wave:** This server was skipped because your \`/config setup\` is incomplete. Please finish the setup to start receiving partners!`);
              incompleteDmCache.set(guildId, now);
            }
          }
        }
        continue;
      }

      // Check per-server cooldown
      const delayMs = Math.max((cfg.partnerDelayHours ?? 24) * 3_600_000, MIN_COOLDOWN_MS);
      const lastRecv = await autoWaveStore.getLastReceived(guildId);

      if (now - lastRecv >= delayMs) {
        const rawAd = await fetchAndCacheAd(guild, cfg);
        if (!rawAd) {
          await logOnce(
            guildId, 'no_ad', guild, cfg,
            `⚠️ **Auto-Wave:** No valid ad found in <#${cfg.adChannelId}>. Make sure your most recent message contains a \`discord.gg\` invite link.`,
            `⚠️ **Auto-Wave:** Still no valid ad in <#${cfg.adChannelId}>. We’ll keep checking silently — we won’t notify you again until it’s fixed.`,
          );
          continue;
        }

        const whitelisted = await getWhitelistedDomains();
        const adReason = validateAd(rawAd, whitelisted);
        if (adReason) {
          await logOnce(
            guildId, 'bad_ad', guild, cfg,
            `⚠️ **Auto-Wave:** Your ad was skipped because it contains a non-whitelisted link. Make sure your ad only contains \`discord.gg\` invite links.`,
            `⚠️ **Auto-Wave:** Ad still failing validation. We’ll keep checking silently — we won’t notify you again until it’s fixed.`,
          );
          continue;
        }

        // Ad is valid — clear any previous ad-related spam counters
        clearSpam(guildId, 'no_ad');
        clearSpam(guildId, 'bad_ad');

        readyGuilds.push({ guildId, guild, cfg, rawAd });
      }
    }

    if (readyGuilds.length < 2) return;

    // 2. Pick A (source) ──────────────────────────────────────────────────────
    const sourceIds = readyGuilds.map(g => g.guildId);
    const sourceId  = await nextSource(sourceIds);
    const serverA   = readyGuilds.find(g => g.guildId === sourceId);
    if (!serverA) return;

    // 3. Find B (target) ──────────────────────────────────────────────────────
    const poolB = shuffle(readyGuilds.filter(g => g.guildId !== sourceId));
    let matchedB = null;

    for (const serverB of poolB) {
      if (await pairedRecently(serverA.guildId, serverB.guildId)) continue;

      const aCount = serverA.guild.memberCount;
      const bCount = serverB.guild.memberCount;
      const aMin = serverA.cfg.minMembers ?? null;
      const aMax = serverA.cfg.maxMembers ?? null;
      const bMin = serverB.cfg.minMembers ?? null;
      const bMax = serverB.cfg.maxMembers ?? null;

      // Server A's range preference: filter what B's count must be
      if (aMin !== null && aMax !== null) {
        if (bCount < aMin || bCount > aMax) continue;
      }
      // Server B's range preference: filter what A's count must be
      if (bMin !== null && bMax !== null) {
        if (aCount < bMin || aCount > bMax) continue;
      }

      if (bCount < MIN_MEMBERS || aCount < MIN_MEMBERS) continue;

      matchedB = serverB;
      break;
    }

    if (!matchedB) {
      await logOnce(
        serverA.guildId, 'no_match', serverA.guild, serverA.cfg,
        `⏳ **Auto-Wave:** We searched the network, but no eligible partners were found this tick. The network will try again later.`,
        `⏳ **Auto-Wave:** Still no eligible partners found. We’ll keep trying silently — we won’t notify you again until a match is found.`,
      );
      return;
    }

    // 4. Execute Bilateral Trade ──────────────────────────────────────────────
    const pingAForB = await resolvePing(matchedB.guild, serverA.guild, serverA.cfg);
    const finalAdB  = pingAForB.ping ? `${matchedB.rawAd}\n\n${pingAForB.ping}` : matchedB.rawAd;

    const pingBForA = await resolvePing(serverA.guild, matchedB.guild, matchedB.cfg);
    const finalAdA  = pingBForA.ping ? `${serverA.rawAd}\n\n${pingBForA.ping}` : serverA.rawAd;

    const channelA = serverA.guild.channels.cache.get(serverA.cfg.partnerChannelId);
    const channelB = matchedB.guild.channels.cache.get(matchedB.cfg.partnerChannelId);

    let successA = false;
    let msgA = null;
    try {
      msgA = await channelA.send({
        content: finalAdB,
        components: [buildAddBotRow(client.user.id)],
        allowedMentions: pingAForB.allowedMentions,
      });
      successA = true;
    } catch {
      await logOnce(
        serverA.guildId, 'post_fail', serverA.guild, serverA.cfg,
        `⚠️ **Auto-Wave:** Failed to post an incoming partner ad. Check bot permissions in <#${serverA.cfg.partnerChannelId}>.`,
        `⚠️ **Auto-Wave:** Still failing to post ads. Fix permissions in <#${serverA.cfg.partnerChannelId}> — we won't notify you again until it's resolved.`,
      );
    }

    let successB = false;
    let msgB = null;
    try {
      msgB = await channelB.send({
        content: finalAdA,
        components: [buildAddBotRow(client.user.id)],
        allowedMentions: pingBForA.allowedMentions,
      });
      successB = true;
    } catch {
      await logOnce(
        matchedB.guildId, 'post_fail', matchedB.guild, matchedB.cfg,
        `⚠️ **Auto-Wave:** Failed to post an incoming partner ad. Check bot permissions in <#${matchedB.cfg.partnerChannelId}>.`,
        `⚠️ **Auto-Wave:** Still failing to post ads. Fix permissions in <#${matchedB.cfg.partnerChannelId}> — we won't notify you again until it's resolved.`,
      );
    }

    if (successA && successB) {
      await recordPair(serverA.guildId, matchedB.guildId);
      await autoWaveStore.setLastReceived(serverA.guildId);
      await autoWaveStore.setLastReceived(matchedB.guildId);

      // Reset all spam counters on successful trade
      clearSpam(serverA.guildId, 'no_match');
      clearSpam(matchedB.guildId, 'no_match');
      clearSpam(serverA.guildId, 'post_fail');
      clearSpam(matchedB.guildId, 'post_fail');
      clearSpam(serverA.guildId, 'trade_fail');
      clearSpam(matchedB.guildId, 'trade_fail');
    } else {
      // Rollback: mark messages as bot-deleted so messageDelete won't issue strikes
      if (successA && msgA) {
        botDeletedMessages.add(msgA.id);
        await msgA.delete().catch(() => {});
      }
      if (successB && msgB) {
        botDeletedMessages.add(msgB.id);
        await msgB.delete().catch(() => {});
      }

      await logOnce(
        serverA.guildId, 'trade_fail', serverA.guild, serverA.cfg,
        `⏳ **Auto-Wave:** We found a match (**${matchedB.guild.name}**), but the trade failed due to a permission error on one side. The trade was safely cancelled.`,
        `⏳ **Auto-Wave:** Trades are still failing. Fix bot permissions — we won't notify you again until a trade succeeds.`,
      );
      await logOnce(
        matchedB.guildId, 'trade_fail', matchedB.guild, matchedB.cfg,
        `⏳ **Auto-Wave:** We found a match (**${serverA.guild.name}**), but the trade failed due to a permission error on one side. The trade was safely cancelled.`,
        `⏳ **Auto-Wave:** Trades are still failing. Fix bot permissions — we won't notify you again until a trade succeeds.`,
      );
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

module.exports = { startAutoWave, tick, isEngineRunning, setEngineState, botDeletedMessages };
