const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

// Parses "1d", "2h", "30m" etc. into milliseconds
function parseDuration(str) {
  const regex = /^(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i;
  const match = str.trim().match(regex);
  if (!match) return null;
  const [, d, h, m, s] = match;
  const ms = (parseInt(d ?? 0) * 86_400_000) + (parseInt(h ?? 0) * 3_600_000) +
             (parseInt(m ?? 0) * 60_000) + (parseInt(s ?? 0) * 1_000);
  return ms > 0 ? ms : null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout (mute) a member for a set duration')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(opt =>
      opt.setName('user').setDescription('The member to timeout').setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('duration').setDescription('Duration — e.g. 10m, 1h, 1d (max 28d)').setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('reason').setDescription('Reason for the timeout').setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getMember('user');
    const durationStr = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    if (!target) return interaction.reply({ content: '❌ User not found in this server.', ephemeral: true });
    if (!target.moderatable) return interaction.reply({ content: '❌ I cannot timeout this user.', ephemeral: true });

    const durationMs = parseDuration(durationStr);
    if (!durationMs) {
      return interaction.reply({ content: '❌ Invalid duration. Use `10m`, `1h`, `2h30m`, `1d`, etc.', ephemeral: true });
    }

    const MAX = 28 * 24 * 60 * 60 * 1000; // 28 days (Discord limit)
    if (durationMs > MAX) return interaction.reply({ content: '❌ Maximum timeout duration is **28 days**.', ephemeral: true });

    try {
      await target.timeout(durationMs, reason);
      const endsAt = Math.floor((Date.now() + durationMs) / 1000);
      return interaction.reply({
        content: `⏱️ **${target.user.tag}** has been timed out until <t:${endsAt}:f>.\n**Reason:** ${reason}`,
      });
    } catch {
      return interaction.reply({ content: '❌ Failed to timeout the user.', ephemeral: true });
    }
  },
};
