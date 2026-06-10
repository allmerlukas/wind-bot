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
 *       a. Has ≥ 25 members
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
const { stripPings }                               = require('./pingStripper');
const { logError }                                 = require('./errorStore');

const TICK_MS         = 30 * 60 * 1000;
const MIN_MEMBERS     = 25;
const MIN_COOLDOWN_MS = 30 * 60 * 1000;

// Invite patterns that are always allowed in ads
const INVITE_RE     = /discord\.gg\/[a-zA-Z0-9-]+|discord\.com\/invite\/[a-zA-Z0-9-]+/gi;
// Any URL in the message
const ANY_URL_RE    = /https?:\/\/[^\s<>"]+|www\.[^\s<>"]+/gi;
// Ping patterns to strip before sending
const PING_RE       = /@everyone|@here|<@&\d+>/g;
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

  // Note: @mentions are automatically stripped to prevent ping abuse
  const stripped = stripPings(adMsg.content);
  return stripped || null;
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
// Tiers: basic (no ping) | here | partnerhere | member

async function resolvePing(sourceGuild, targetGuild, targetCfg) {
  const diff = targetGuild.memberCount - sourceGuild.memberCount;

  let tier = 0; // Tier 0: Member Role
  if (diff >= 300) tier = 1; // Tier 1: @here
  if (diff >= 1000) tier = 2; // Tier 2: Partner Ping Role
  if (diff >= 6000) tier = 3; // Tier 3: Nothing
  // diff >= 10000 is still Tier 3 (Nothing)

  if (tier === 0) {
    const role = targetGuild.roles.cache.get(targetCfg.memberRoleId);
    if (role) {
      const pct = role.members.size / targetGuild.memberCount;
      if (pct >= 0.80) return `[Placeholder for ${role.name} ping]`;
    }
    tier = 1; // Fallback to Tier 1 if role is missing or fails 80% rule
  }

  if (tier === 1) {
    return '[Placeholder for here ping]';
  }

  if (tier === 2) {
    const role = targetGuild.roles.cache.get(targetCfg.partnerPingRoleId);
    if (role) return `[Placeholder for ${role.name} ping]`;
    tier = 3; // Fallback to Tier 3 if role is missing
  }

  return ''; // Tier 3 (Nothing)
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
          await logToGuild(guild, cfg, `⚠️ **Auto-Wave:** No valid ad found in <#${cfg.adChannelId}>. Make sure your most recent message contains a \`discord.gg\` invite link.`);
          continue;
        }

        const whitelisted = await getWhitelistedDomains();
        const adReason = validateAd(rawAd, whitelisted);
        if (adReason) {
          await logToGuild(guild, cfg, `⚠️ **Auto-Wave:** Your ad was skipped this tick because it failed a content validation check. Check that it only contains server invite links. Non-invite links must be whitelisted.`);
          continue;
        }

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
      await logToGuild(serverA.guild, serverA.cfg, `⏳ **Auto-Wave:** We searched the network, but no eligible partners were found this tick. The network will try again later.`);
      return;
    }

    // 4. Execute Bilateral Trade ──────────────────────────────────────────────
    const pingAForB = await resolvePing(matchedB.guild, serverA.guild, serverA.cfg);
    const finalAdB  = pingAForB ? `${matchedB.rawAd}\n\n${pingAForB}` : matchedB.rawAd;

    const pingBForA = await resolvePing(serverA.guild, matchedB.guild, matchedB.cfg);
    const finalAdA  = pingBForA ? `${serverA.rawAd}\n\n${pingBForA}` : serverA.rawAd;

    const channelA = serverA.guild.channels.cache.get(serverA.cfg.partnerChannelId);
    const channelB = matchedB.guild.channels.cache.get(matchedB.cfg.partnerChannelId);

    let successA = false;
    let msgA = null;
    try {
      msgA = await channelA.send({
        content: finalAdB,
        components: [buildAddBotRow(client.user.id)],
        allowedMentions: { parse: [] }
      });
      successA = true;
    } catch {
      await logToGuild(serverA.guild, serverA.cfg, `⚠️ **Auto-Wave:** Failed to post incoming partner ad. Check bot permissions in <#${serverA.cfg.partnerChannelId}>.`);
    }

    let successB = false;
    let msgB = null;
    try {
      msgB = await channelB.send({
        content: finalAdA,
        components: [buildAddBotRow(client.user.id)],
        allowedMentions: { parse: [] }
      });
      successB = true;
    } catch {
      await logToGuild(matchedB.guild, matchedB.cfg, `⚠️ **Auto-Wave:** Failed to post incoming partner ad. Check bot permissions in <#${matchedB.cfg.partnerChannelId}>.`);
    }

    if (successA && successB) {
      await recordPair(serverA.guildId, matchedB.guildId);
      await autoWaveStore.setLastReceived(serverA.guildId);
      await autoWaveStore.setLastReceived(matchedB.guildId);
      
      await logToGuild(serverA.guild, serverA.cfg, `✅ **Auto-Wave:** You partnered with **${matchedB.guild.name}**! Their ad was posted in <#${serverA.cfg.partnerChannelId}>, and your ad was posted in their server.`);
      await logToGuild(matchedB.guild, matchedB.cfg, `✅ **Auto-Wave:** You partnered with **${serverA.guild.name}**! Their ad was posted in <#${matchedB.cfg.partnerChannelId}>, and your ad was posted in their server.`);
    } else {
      // Rollback any successful ad if the other failed
      if (successA && msgA) await msgA.delete().catch(() => {});
      if (successB && msgB) await msgB.delete().catch(() => {});
      
      await logToGuild(serverA.guild, serverA.cfg, `⏳ **Auto-Wave:** We found a match (**${matchedB.guild.name}**), but the trade failed due to permission errors on one side. The trade was safely cancelled.`);
      await logToGuild(matchedB.guild, matchedB.cfg, `⏳ **Auto-Wave:** We found a match (**${serverA.guild.name}**), but the trade failed due to permission errors on one side. The trade was safely cancelled.`);
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

module.exports = { startAutoWave, tick, isEngineRunning, setEngineState };
