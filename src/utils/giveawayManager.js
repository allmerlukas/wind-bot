/**
 * giveawayManager.js — Giveaway system (SQLite-backed)
 *
 * Replaces data/giveaways.json.
 * All giveaway state is in the `giveaways` table.
 * Logic (embed building, winner picking, scheduling) is unchanged.
 */

const { EmbedBuilder } = require('discord.js');
const db = require('./db');

// ─── Prepared statements ─────────────────────────────────────────────────────

const stmtInsert = db.prepare(`
  INSERT OR REPLACE INTO giveaways
    (message_id, channel_id, guild_id, prize, description, winners_count, ends_at, host_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const stmtDelete = db.prepare('DELETE FROM giveaways WHERE message_id = ?');
const stmtGet    = db.prepare('SELECT * FROM giveaways WHERE message_id = ?');
const stmtAll    = db.prepare('SELECT * FROM giveaways');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rowToGiveaway(row) {
  if (!row) return null;
  return {
    messageId:    row.message_id,
    channelId:    row.channel_id,
    guildId:      row.guild_id,
    prize:        row.prize,
    description:  row.description,
    winnersCount: row.winners_count,
    endsAt:       row.ends_at,
    hostId:       row.host_id,
  };
}

// ─── Duration Parsing ─────────────────────────────────────────────────────────

function parseDuration(str) {
  const regex = /^(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i;
  const match = str.trim().match(regex);
  if (!match) return null;
  const [, d, h, m, s] = match;
  const ms =
    (parseInt(d ?? 0) * 86_400_000) +
    (parseInt(h ?? 0) * 3_600_000)  +
    (parseInt(m ?? 0) * 60_000)     +
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
  stmtInsert.run(
    data.messageId,
    data.channelId,
    data.guildId,
    data.prize,
    data.description ?? null,
    data.winnersCount,
    data.endsAt,
    data.hostId,
  );
}

function removeGiveaway(messageId) {
  stmtDelete.run(messageId);
}

function getGiveaway(messageId) {
  return rowToGiveaway(stmtGet.get(messageId));
}

async function endGiveaway(messageId, client) {
  const giveaway = getGiveaway(messageId);
  if (!giveaway) return;

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
        const users   = await reaction.users.fetch();
        const entries = users.filter(u => !u.bot).map(u => u);
        const shuffled = [...entries].sort(() => Math.random() - 0.5);
        const picked   = shuffled.slice(0, Math.min(giveaway.winnersCount, shuffled.length));
        winnerIds = picked.map(u => u.id);
      }

      const endedEmbed = buildGiveawayEmbed({ ...giveaway, winners: winnerIds }, true);
      await message.edit({ embeds: [endedEmbed] }).catch(() => {});
    }

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
  const all = stmtAll.all().map(rowToGiveaway);
  const now = Date.now();

  if (all.length > 0) {
    console.log(`🎁 Resuming ${all.length} active giveaway(s)...`);
  }

  for (const giveaway of all) {
    const remaining = giveaway.endsAt - now;
    if (remaining <= 0) {
      await endGiveaway(giveaway.messageId, client);
    } else {
      setTimeout(() => endGiveaway(giveaway.messageId, client), remaining);
      console.log(`⏳ Giveaway "${giveaway.prize}" ends in ${Math.round(remaining / 1000)}s`);
    }
  }
}

async function rigGiveaway(messageId, client, forcedWinnerId) {
  const giveaway = getGiveaway(messageId);
  if (!giveaway) return { ok: false, reason: 'not_found' };

  try {
    const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
    if (!channel) return { ok: false, reason: 'channel_not_found' };

    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message) return { ok: false, reason: 'message_not_found' };

    const reaction = message.reactions.cache.get('🎉');
    if (reaction) await reaction.users.fetch();
    const entered = reaction?.users.cache.has(forcedWinnerId) ?? false;
    if (!entered) return { ok: false, reason: 'not_entered' };

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
