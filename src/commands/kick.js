const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member from the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(opt =>
      opt.setName('user').setDescription('The user to kick').setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('reason').setDescription('Reason for the kick').setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    if (!target) return interaction.reply({ content: '❌ User not found in this server.', ephemeral: true });
    if (!target.kickable) return interaction.reply({ content: '❌ I cannot kick this user (missing permissions or higher role).', ephemeral: true });
    if (target.id === interaction.user.id) return interaction.reply({ content: '❌ You cannot kick yourself.', ephemeral: true });

    try {
      await target.send(`👢 You have been **kicked** from **${interaction.guild.name}**.\n**Reason:** ${reason}`).catch(() => {});
      await target.kick(reason);
      return interaction.reply({ content: `✅ **${target.user.tag}** has been kicked.\n**Reason:** ${reason}`, ephemeral: false });
    } catch {
      return interaction.reply({ content: '❌ Failed to kick the user.', ephemeral: true });
    }
  },
};
