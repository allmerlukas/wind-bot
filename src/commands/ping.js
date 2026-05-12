const { SlashCommandBuilder, EmbedBuilder, ApplicationIntegrationType, InteractionContextType } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot latency and API response time')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
    .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]),

  async execute(interaction) {
    const sent = await interaction.reply({ content: '🏓 Pinging...', fetchReply: true });
    const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;
    const wsLatency = interaction.client.ws.ping;

    const embed = new EmbedBuilder()
      .setColor(wsLatency < 100 ? '#57F287' : wsLatency < 200 ? '#FEE75C' : '#ED4245')
      .setTitle('🏓 Pong!')
      .addFields(
        { name: '⏱️ Roundtrip', value: `${roundtrip}ms`, inline: true },
        { name: '💓 WebSocket', value: `${wsLatency}ms`, inline: true },
      )
      .setTimestamp();

    return interaction.editReply({ content: '', embeds: [embed] });
  },
};
