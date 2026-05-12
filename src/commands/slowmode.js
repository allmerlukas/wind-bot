const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Set slowmode for this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption(opt =>
      opt.setName('seconds')
        .setDescription('Slowmode delay in seconds (0 to disable, max 21600)')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(21600)
    ),

  async execute(interaction) {
    const seconds = interaction.options.getInteger('seconds');
    await interaction.channel.setRateLimitPerUser(seconds);

    if (seconds === 0) {
      return interaction.reply('✅ Slowmode **disabled** in this channel.');
    }

    const readable = seconds >= 3600
      ? `${Math.floor(seconds / 3600)}h ${seconds % 3600 > 0 ? `${Math.floor((seconds % 3600) / 60)}m` : ''}`.trim()
      : seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60 > 0 ? `${seconds % 60}s` : ''}`.trim()
      : `${seconds}s`;

    return interaction.reply(`⏱️ Slowmode set to **${readable}** in this channel.`);
  },
};
