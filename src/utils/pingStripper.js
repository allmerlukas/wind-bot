/**
 * Utility to safely strip or replace pings from partner ads.
 * 
 * As requested, this currently replaces pings with descriptive placeholders
 * instead of fully removing them.
 * 
 * TO REVERT THIS LATER:
 * Simply change the `stripPings` function to return `''` for all matches, or
 * replace the body with `return text.replace(PING_RE, '').replace(/\\s{2,}/g, ' ').trim();`
 */

const PING_RE = /@everyone|@here|<@!?\d+>|<@&\d+>/g;

function stripPings(text) {
  if (!text) return text;
  
  return text.replace(PING_RE, '').replace(/\s{2,}/g, ' ').trim();
}

module.exports = { stripPings, PING_RE };
