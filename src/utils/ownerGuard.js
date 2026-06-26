/**
 * ownerGuard.js
 *
 * Shared utility for owner-only commands.
 * Call isOwner(interaction) before doing anything in an owner command.
 */

const VIP_ROLE_ID = '1520138560374833385';
const VIP_ALLOWED_SUBS = ['status', 'autowave', 'error', 'invite', 'check'];

/**
 * Returns true if the interaction is from the bot owner or a permitted VIP.
 */
function isOwner(interaction, subcommand = null) {
  if (interaction.user.id === process.env.OWNER_ID) return true;
  
  if (subcommand && VIP_ALLOWED_SUBS.includes(subcommand)) {
    if (interaction.member?.roles?.cache?.has(VIP_ROLE_ID)) return true;
  }
  
  return false;
}

/**
 * Replies with a permission error and returns false if not authorized.
 * Usage:
 *   if (!await checkOwner(interaction, sub)) return;
 */
async function checkOwner(interaction, subcommand = null) {
  if (isOwner(interaction, subcommand)) return true;
  
  // If we're checking a subcommand and it's in the allowed list but they don't have the role
  if (subcommand && VIP_ALLOWED_SUBS.includes(subcommand)) {
    await interaction.reply({
      content: '🔒 This command is restricted to the bot owner or authorized VIPs.',
      ephemeral: true,
    });
  } else {
    await interaction.reply({
      content: '🔒 This command is restricted to the bot owner.',
      ephemeral: true,
    });
  }
  return false;
}

module.exports = { isOwner, checkOwner };
