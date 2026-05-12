const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a user by their ID')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption(opt =>
      opt.setName('userid').setDescription('The user ID to unban').setRequired(true)
    ),

  async execute(interaction) {
    const userId = interaction.options.getString('userid').trim();

    const ban = await interaction.guild.bans.fetch(userId).catch(() => null);
    if (!ban) return interaction.reply({ content: `❌ No ban found for user ID \`${userId}\`.`, ephemeral: true });

    try {
      await interaction.guild.members.unban(userId);
      return interaction.reply({ content: `✅ **${ban.user.tag}** has been unbanned.`, ephemeral: false });
    } catch {
      return interaction.reply({ content: '❌ Failed to unban the user.', ephemeral: true });
    }
  },
};
