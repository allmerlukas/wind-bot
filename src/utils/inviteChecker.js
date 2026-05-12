/**
 * Extracts all Discord invite codes from a text string.
 */
function extractInviteCodes(text) {
  const regex = /discord(?:\.gg|(?:app)?\.com\/invite)\/([a-zA-Z0-9-]+)/gi;
  const codes = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    codes.push(match[1]);
  }
  return [...new Set(codes)];
}

/**
 * Checks all ads for dead invite links.
 * Returns array of { adIndex, code } for each dead link found (max one per ad).
 */
async function checkAdsForDeadLinks(client, ads) {
  const deadLinks = [];

  for (let i = 0; i < ads.length; i++) {
    const codes = extractInviteCodes(ads[i]);
    if (codes.length === 0) continue;

    for (const code of codes) {
      try {
        await client.fetchInvite(code);
      } catch (err) {
        // Only flag as dead on actual "Unknown Invite" (10006) or 404 errors.
        // Ignore network timeouts, rate limits, or any other transient errors.
        const isReallyDead = err?.code === 10006 || err?.status === 404 ||
          (err?.message ?? '').toLowerCase().includes('unknown invite');

        if (isReallyDead) {
          deadLinks.push({ adIndex: i, code });
          break;
        }
        // Transient error — skip this code, don't falsely flag
      }
    }
  }

  return deadLinks;
}

async function getValidAdsForGuild(client, ads, guildId) {
  const filtered = [];

  for (const ad of ads) {
    const codes = extractInviteCodes(ad);
    let skip = false;

    for (const code of codes) {
      try {
        const invite = await client.fetchInvite(code);
        // Skip if this invite belongs to the current server
        if (guildId && invite.guild?.id === guildId) {
          skip = true;
          break;
        }
      } catch (err) {
        // Only skip on real dead invite (not network errors)
        const isReallyDead = err?.code === 10006 || err?.status === 404 ||
          (err?.message ?? '').toLowerCase().includes('unknown invite');
        if (isReallyDead) {
          skip = true;
          break;
        }
      }
    }

    if (!skip) filtered.push(ad);
  }

  return filtered;
}

module.exports = { extractInviteCodes, checkAdsForDeadLinks, getValidAdsForGuild };
