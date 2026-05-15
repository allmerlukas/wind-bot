/**
 * ownerGuard.js
 *
 * Shared utility for owner-only commands.
 * Call isOwner(interaction) before doing anything in an owner command.
 */

/**
 * Returns true if the interaction is from the bot owner.
 */
function isOwner(interaction) {
  return interaction.user.id === process.env.OWNER_ID;
}

/**
 * Replies with a permission error and returns false if not the owner.
 * Usage:
 *   if (!await checkOwner(interaction)) return;
 */
async function checkOwner(interaction) {
  if (isOwner(interaction)) return true;
  await interaction.reply({
    content: '🔒 This command is restricted to the bot owner.',
    ephemeral: true,
  });
  return false;
}

module.exports = { isOwner, checkOwner };
