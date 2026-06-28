const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { checkOwner } = require('../utils/ownerGuard');
const { buildDashboardMenu } = require('./owner');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vip')
    .setDescription('VIP-only dashboard')
    .setDefaultMemberPermissions(0n)
    .addSubcommand(sub => sub.setName('dashboard').setDescription('Open the VIP control panel')),

  async execute(interaction) {
    if (!await checkOwner(interaction, 'dashboard')) return;
    
    const embed = new EmbedBuilder()
      .setColor(0xFEE75C)
      .setTitle('🌟 VIP Dashboard')
      .setDescription('Select an action from the dropdown menu below.')
      .setTimestamp();

    return interaction.reply({ 
      embeds: [embed], 
      components: [buildDashboardMenu(true)], // true = isVip
      ephemeral: true 
    });
  }
};
