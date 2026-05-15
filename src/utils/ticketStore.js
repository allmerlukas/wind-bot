/**
 * ticketStore.js — Ticket system store (SQLite)
 *
 * Replaces data/tickets.json.
 * Uses two tables:
 *   tickets        — open ticket channels
 *   ticket_configs — per-guild ticket panel config
 */

const db = require('./db');

// ─── Prepared statements ─────────────────────────────────────────────────────

const stmtSetConfig = db.prepare(`
  INSERT INTO ticket_configs (guild_id, channel_id, message_id, category_id, staff_role_id)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(guild_id) DO UPDATE SET
    channel_id    = excluded.channel_id,
    message_id    = excluded.message_id,
    category_id   = excluded.category_id,
    staff_role_id = excluded.staff_role_id
`);
const stmtGetConfig = db.prepare(
  'SELECT * FROM ticket_configs WHERE guild_id = ?'
);
const stmtAddTicket = db.prepare(`
  INSERT OR REPLACE INTO tickets (channel_id, user_id, guild_id, number)
  VALUES (?, ?, ?, ?)
`);
const stmtRemoveTicket = db.prepare(
  'DELETE FROM tickets WHERE channel_id = ?'
);
const stmtGetTicket = db.prepare(
  'SELECT * FROM tickets WHERE channel_id = ?'
);
const stmtGetAllForGuild = db.prepare(
  'SELECT * FROM tickets WHERE guild_id = ?'
);
const stmtMaxNumber = db.prepare(
  'SELECT MAX(number) AS max_num FROM tickets WHERE guild_id = ?'
);

// ─── Public API (same as old ticketStore) ────────────────────────────────────

function setConfig(guildId, config) {
  stmtSetConfig.run(
    guildId,
    config.channelId    ?? null,
    config.messageId    ?? null,
    config.categoryId   ?? null,
    config.staffRoleId  ?? null,
  );
}

function getConfig(guildId) {
  const row = stmtGetConfig.get(guildId);
  if (!row) return null;
  return {
    channelId:   row.channel_id,
    messageId:   row.message_id,
    categoryId:  row.category_id,
    staffRoleId: row.staff_role_id,
  };
}

function addTicket(channelId, userId, guildId, number) {
  stmtAddTicket.run(channelId, userId, guildId, number);
}

function removeTicket(channelId) {
  stmtRemoveTicket.run(channelId);
}

function getTicket(channelId) {
  const row = stmtGetTicket.get(channelId);
  if (!row) return null;
  return { userId: row.user_id, guildId: row.guild_id, number: row.number };
}

function getAllTicketsForGuild(guildId) {
  return stmtGetAllForGuild.all(guildId).map(row => ({
    channelId: row.channel_id,
    userId:    row.user_id,
    guildId:   row.guild_id,
    number:    row.number,
  }));
}

function nextTicketNumber(guildId) {
  const row = stmtMaxNumber.get(guildId);
  return (row?.max_num ?? 0) + 1;
}

module.exports = { setConfig, getConfig, addTicket, removeTicket, getTicket, getAllTicketsForGuild, nextTicketNumber };
