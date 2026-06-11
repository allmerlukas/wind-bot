/**
 * linkTracker.js — Partner link tracking store (Supabase)
 */

const supabase = require('./supabase');

function getDateKey(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function extractLinks(content) {
  const urlRegex = /https?:\/\/[^\s<>")\]]+/gi;
  const matches  = content.match(urlRegex) || [];
  const normalized = matches.map(url => url.replace(/[.,;!?'"]+$/, '').toLowerCase());
  return [...new Set(normalized)];
}

/**
 * Tries to add links for a user.
 * Skips links already posted within the last 2 days (today or yesterday).
 * @returns {{ newLinksAdded: number, totalPartners: number }}
 */
async function addLinks(userId, username, links) {
  const today     = getDateKey(0);
  const yesterday = getDateKey(-1);

  // Ensure user exists
  await supabase.from('partner_links').upsert(
    { user_id: userId, username, total_partners: 0 },
    { onConflict: 'user_id', ignoreDuplicates: true }
  );
  // Always update username
  await supabase.from('partner_links').update({ username }).eq('user_id', userId);

  let newLinksAdded = 0;

  for (const link of links) {
    // Check if already posted today OR yesterday (2-day cooldown)
    const { data: existing } = await supabase
      .from('partner_daily')
      .select('link')
      .eq('user_id', userId)
      .in('date_key', [today, yesterday])
      .eq('link', link)
      .maybeSingle();

    if (!existing) {
      // Insert record under today's date key
      const { error } = await supabase.from('partner_daily').insert({ user_id: userId, date_key: today, link });
      if (!error) {
        // Increment total
        const { data: current } = await supabase
          .from('partner_links')
          .select('total_partners')
          .eq('user_id', userId)
          .single();
        await supabase.from('partner_links')
          .update({ total_partners: (current?.total_partners ?? 0) + 1 })
          .eq('user_id', userId);
        newLinksAdded++;
      }
    }
  }

  // Prune old daily records (keep last 30 days)
  const cutoff = getDateKey(-30);
  await supabase.from('partner_daily').delete().eq('user_id', userId).lt('date_key', cutoff);

  const { data: row } = await supabase
    .from('partner_links')
    .select('total_partners')
    .eq('user_id', userId)
    .single();

  return { newLinksAdded, totalPartners: row?.total_partners ?? 0 };
}

async function getPartners(userId) {
  const { data } = await supabase
    .from('partner_links')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (!data) return { totalPartners: 0, username: null };
  return { totalPartners: data.total_partners, username: data.username };
}

async function getAllPartners() {
  const { data } = await supabase
    .from('partner_links')
    .select('*')
    .order('total_partners', { ascending: false });
  const out = {};
  for (const row of (data ?? [])) {
    out[row.user_id] = { username: row.username, totalPartners: row.total_partners };
  }
  return out;
}

module.exports = { extractLinks, addLinks, getPartners, getAllPartners };
