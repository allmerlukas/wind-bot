const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Show information about this server'),

  async execute(interaction) {
    const guild = interaction.guild;
    await guild.members.fetch(); // ensure member cache is populated

    const owner = await guild.fetchOwner().catch(() => null);
    const createdAt = `<t:${Math.floor(guild.createdTimestamp / 1000)}:D> (<t:${Math.floor(guild.createdTimestamp / 1000)}:R>)`;

    const verificationLevels = ['None', 'Low', 'Medium', 'High', 'Very High'];
    const boostTier = guild.premiumTier ? `Level ${guild.premiumTier}` : 'No boost';

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(`🏠 ${guild.name}`)
      .setThumbnail(guild.iconURL({ size: 256 }) ?? null)
      .addFields(
        { name: '🆔 Server ID', value: guild.id, inline: true },
        { name: '👑 Owner', value: owner ? `<@${owner.id}>` : 'Unknown', inline: true },
        { name: '📅 Created', value: createdAt, inline: false },
        { name: '👥 Members', value: `${guild.memberCount}`, inline: true },
        { name: '📢 Channels', value: `${guild.channels.cache.size}`, inline: true },
        { name: '😀 Emojis', value: `${guild.emojis.cache.size}`, inline: true },
        { name: '🚀 Boost', value: `${boostTier} (${guild.premiumSubscriptionCount} boosts)`, inline: true },
        { name: '🔒 Verification', value: verificationLevels[guild.verificationLevel] ?? 'Unknown', inline: true },
      )
      .setFooter({ text: `Requested by ${interaction.user.tag}` })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  },
};
