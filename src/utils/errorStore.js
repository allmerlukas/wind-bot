/**
 * errorStore.js — Persistent error logger (Supabase)
 *
 * Stores bot errors in the `bot_errors` table.
 * Keeps a rolling window of the last 200 errors.
 */

const supabase = require('./supabase');

const MAX_ERRORS = 200;

/**
 * Log an error to the database.
 * Fire-and-forget (non-blocking) — errors in error logging are swallowed.
 */
function logError(source, err, guildId = null) {
  const message = err instanceof Error ? err.message : String(err);
  const stack   = err instanceof Error ? (err.stack ?? null) : null;

  // Insert then prune — non-blocking, fire-and-forget
  supabase.from('bot_errors').insert({
    occurred_at: Date.now(),
    source,
    guild_id: guildId,
    message,
    stack,
  }).then(async () => {
    // Prune: keep only the newest MAX_ERRORS rows
    const { data } = await supabase
      .from('bot_errors')
      .select('id')
      .order('id', { ascending: false })
      .range(MAX_ERRORS, MAX_ERRORS + 1000);

    if (data && data.length > 0) {
      const ids = data.map(r => r.id);
      await supabase.from('bot_errors').delete().in('id', ids);
    }
  }).catch(() => { /* swallow */ });
}

/**
 * Fetch the most recent errors.
 */
async function getRecentErrors(limit = 20) {
  const { data } = await supabase
    .from('bot_errors')
    .select('*')
    .order('id', { ascending: false })
    .limit(Math.min(limit, MAX_ERRORS));
  return data ?? [];
}

/**
 * Total number of errors currently stored.
 */
async function getErrorCount() {
  const { count } = await supabase
    .from('bot_errors')
    .select('*', { count: 'exact', head: true });
  return count ?? 0;
}

module.exports = { logError, getRecentErrors, getErrorCount };
