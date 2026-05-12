const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getGiveaway, rigGiveaway } = require('../utils/giveawayManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('brig')
    .setDescription('Force a specific user to win a giveaway (they must have entered)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(opt =>
      opt.setName('id')
        .setDescription('The giveaway message ID (right-click the giveaway embed → Copy Message ID)')
        .setRequired(true)
    )
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('The user who should win (must have reacted with 🎉)')
        .setRequired(true)
    ),

  async execute(interaction) {
    const messageId = interaction.options.getString('id').trim();
    const targetUser = interaction.options.getUser('user');

    const giveaway = getGiveaway(messageId);
    if (!giveaway) {
      return interaction.reply({
        content: '❌ No active giveaway found with that ID.',
        ephemeral: true,
      });
    }

    await interaction.reply({ content: `⏳ Checking if <@${targetUser.id}> entered...`, ephemeral: true });

    const result = await rigGiveaway(messageId, interaction.client, targetUser.id);

    if (!result.ok) {
      const messages = {
        not_entered: `❌ <@${targetUser.id}> hasn't entered the giveaway (no 🎉 reaction found).`,
        not_found: '❌ Giveaway not found.',
        channel_not_found: '❌ Could not find the giveaway channel.',
        message_not_found: '❌ Could not find the giveaway message.',
        error: '❌ Something went wrong while rigging the giveaway.',
      };
      return interaction.editReply({ content: messages[result.reason] ?? '❌ Unknown error.' });
    }

    return interaction.editReply({
      content: `✅ Done! <@${targetUser.id}> has been set as the winner of **${giveaway.prize}**.`,
    });
  },
};
