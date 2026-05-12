const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getGiveaway, endGiveaway } = require('../utils/giveawayManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bend')
    .setDescription('End a giveaway early')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(opt =>
      opt.setName('id')
        .setDescription('The giveaway message ID (right-click the giveaway embed → Copy Message ID)')
        .setRequired(true)
    ),

  async execute(interaction) {
    const messageId = interaction.options.getString('id').trim();

    const giveaway = getGiveaway(messageId);
    if (!giveaway) {
      return interaction.reply({
        content: '❌ No active giveaway found with that ID. Make sure you copied the **message ID** of the giveaway embed (not the host\'s user ID).',
        ephemeral: true,
      });
    }

    await interaction.reply({ content: '⏳ Ending giveaway...', ephemeral: true });
    await endGiveaway(messageId, interaction.client);

    return interaction.editReply({ content: `✅ Giveaway for **${giveaway.prize}** ended!` });
  },
};
