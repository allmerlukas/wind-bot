const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const DATA_FILE = path.join(__dirname, '../../data/giveaways.json');

// ─── Persistence ──────────────────────────────────────────────────────────────

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify([]));
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function saveData(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ─── Duration Parsing ─────────────────────────────────────────────────────────

/**
 * Parses a duration string like "1d2h30m10s" into milliseconds.
 * Returns null if invalid or zero.
 */
function parseDuration(str) {
  const regex = /^(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i;
  const match = str.trim().match(regex);
  if (!match) return null;

  const [, d, h, m, s] = match;
  const ms =
    (parseInt(d ?? 0) * 86_400_000) +
    (parseInt(h ?? 0) * 3_600_000) +
    (parseInt(m ?? 0) * 60_000) +
    (parseInt(s ?? 0) * 1_000);

  return ms > 0 ? ms : null;
}

// ─── Embed Builder ────────────────────────────────────────────────────────────

function buildGiveawayEmbed(giveaway, ended = false) {
  const { prize, winnersCount, description, endsAt, hostId, winners } = giveaway;
  const unixEnd = Math.floor(endsAt / 1000);

  if (ended) {
    const winnerList = (winners ?? []).map(id => `<@${id}>`).join(', ') || 'No valid entries';
    return new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle(`🎊 GIVEAWAY ENDED: ${prize}`)
      .setDescription(
        [
          description ? `📝 ${description}\n` : null,
          `🏆 **Winner(s):** ${winnerList}`,
          `🎟️ **Hosted by:** <@${hostId}>`,
        ].filter(Boolean).join('\n')
      )
      .setFooter({ text: 'Giveaway has ended' })
      .setTimestamp(new Date(endsAt));
  }

  return new EmbedBuilder()
    .setColor(0xFF6B6B)
    .setTitle(`🎉 GIVEAWAY: ${prize}`)
    .setDescription(
      [
        description ? `📝 ${description}\n` : null,
        `🏆 **Winners:** ${winnersCount}`,
        `⏰ **Ends:** <t:${unixEnd}:R> (<t:${unixEnd}:f>)`,
        `🎟️ **Hosted by:** <@${hostId}>`,
        '',
        '**React with 🎉 to enter!**',
      ].filter(Boolean).join('\n')
    )
    .setFooter({ text: `${winnersCount} winner(s) will be chosen • Ends` })
    .setTimestamp(new Date(endsAt));
}

// ─── Core Logic ───────────────────────────────────────────────────────────────

function createGiveaway(data) {
  const all = loadData();
  all.push(data);
  saveData(all);
}

function removeGiveaway(messageId) {
  const all = loadData().filter(g => g.messageId !== messageId);
  saveData(all);
}

async function endGiveaway(messageId, client) {
  const all = loadData();
  const giveaway = all.find(g => g.messageId === messageId);
  if (!giveaway) return; // Already ended or doesn't exist

  try {
    const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
    if (!channel) {
      removeGiveaway(messageId);
      return;
    }

    const message = await channel.messages.fetch(messageId).catch(() => null);

    let winnerIds = [];

    if (message) {
      const reaction = message.reactions.cache.get('🎉');
      if (reaction) {
        const users = await reaction.users.fetch();
        const entries = users.filter(u => !u.bot).map(u => u);

        // Shuffle and pick
        const shuffled = [...entries].sort(() => Math.random() - 0.5);
        const picked = shuffled.slice(0, Math.min(giveaway.winnersCount, shuffled.length));
        winnerIds = picked.map(u => u.id);
      }

      // Update the original embed
      const endedEmbed = buildGiveawayEmbed({ ...giveaway, winners: winnerIds }, true);
      await message.edit({ embeds: [endedEmbed] }).catch(() => {});
    }

    // Announce winners
    const winnerMentions = winnerIds.map(id => `<@${id}>`).join(', ');
    const announceLine = winnerIds.length > 0
      ? `🎊 Congratulations ${winnerMentions}! You won **${giveaway.prize}**!\n> [Jump to giveaway](${message?.url ?? ''})`
      : `📭 The giveaway for **${giveaway.prize}** ended but nobody entered.`;

    await channel.send(announceLine);
  } catch (err) {
    console.error('⚠️ Error ending giveaway:', err.message);
  }

  removeGiveaway(messageId);
}

/**
 * Called on bot startup — reschedules any giveaways that are still active.
 */
async function initGiveaways(client) {
  const all = loadData();
  const now = Date.now();

  if (all.length > 0) {
    console.log(`🎁 Resuming ${all.length} active giveaway(s)...`);
  }

  for (const giveaway of all) {
    const remaining = giveaway.endsAt - now;
    if (remaining <= 0) {
      // Ended while bot was offline — end it now
      await endGiveaway(giveaway.messageId, client);
    } else {
      setTimeout(() => endGiveaway(giveaway.messageId, client), remaining);
      console.log(`⏳ Giveaway "${giveaway.prize}" ends in ${Math.round(remaining / 1000)}s`);
    }
  }
}

function getGiveaway(messageId) {
  return loadData().find(g => g.messageId === messageId) ?? null;
}

async function rigGiveaway(messageId, client, forcedWinnerId) {
  const giveaway = getGiveaway(messageId);
  if (!giveaway) return { ok: false, reason: 'not_found' };

  try {
    const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
    if (!channel) return { ok: false, reason: 'channel_not_found' };

    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message) return { ok: false, reason: 'message_not_found' };

    // Verify the user actually entered
    const reaction = message.reactions.cache.get('🎉');
    if (reaction) await reaction.users.fetch(); // populate cache
    const entered = reaction?.users.cache.has(forcedWinnerId) ?? false;
    if (!entered) return { ok: false, reason: 'not_entered' };

    // Update embed and announce
    const endedEmbed = buildGiveawayEmbed({ ...giveaway, winners: [forcedWinnerId] }, true);
    await message.edit({ embeds: [endedEmbed] }).catch(() => {});
    await channel.send(
      `🎊 Congratulations <@${forcedWinnerId}>! You won **${giveaway.prize}**!\n> [Jump to giveaway](${message.url})`
    );

    removeGiveaway(messageId);
    return { ok: true };
  } catch (err) {
    console.error('rigGiveaway error:', err.message);
    return { ok: false, reason: 'error' };
  }
}

module.exports = {
  parseDuration,
  buildGiveawayEmbed,
  createGiveaway,
  endGiveaway,
  initGiveaways,
  getGiveaway,
  rigGiveaway,
};
