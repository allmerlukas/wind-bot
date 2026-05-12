const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Lock or unlock a channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand(sub =>
      sub.setName('channel')
        .setDescription('Lock this channel — prevents @everyone from sending messages')
        .addStringOption(opt =>
          opt.setName('reason').setDescription('Reason for locking').setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub.setName('unlock')
        .setDescription('Unlock this channel — restore @everyone send permissions')
        .addStringOption(opt =>
          opt.setName('reason').setDescription('Reason for unlocking').setRequired(false)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const reason = interaction.options.getString('reason') ?? 'No reason provided';
    const everyone = interaction.guild.roles.everyone;

    if (sub === 'channel') {
      await interaction.channel.permissionOverwrites.edit(everyone, { SendMessages: false });
      return interaction.reply(`🔒 **Channel locked!**\n**Reason:** ${reason}\nOnly staff can send messages here.`);
    }

    if (sub === 'unlock') {
      await interaction.channel.permissionOverwrites.edit(everyone, { SendMessages: null });
      return interaction.reply(`🔓 **Channel unlocked!**\n**Reason:** ${reason}`);
    }
  },
};
