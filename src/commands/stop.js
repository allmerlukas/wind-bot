/**
 * /stop — Owner-only command
 * Toggles the Auto-Wave engine globally on or off.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { checkOwner }                        = require('../utils/ownerGuard');
const { isEngineRunning, setEngineState }   = require('../utils/autoWaveEngine');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Owner only: Turn off the Auto-Wave engine for all servers'),

  async execute(interaction) {
    // Only owner can use this command
    if (!await checkOwner(interaction)) return;

    // Toggle the state
    const currentlyRunning = isEngineRunning();
    const newState = !currentlyRunning;
    setEngineState(newState);

    const embed = new EmbedBuilder()
      .setColor(newState ? 0x57F287 : 0xED4245)
      .setTitle(newState ? '🌊 Auto-Wave Engine: ON' : '🛑 Auto-Wave Engine: OFF')
      .setDescription(
        newState
          ? 'The Auto-Wave engine has been resumed and will tick every 30 minutes.'
          : 'The Auto-Wave engine has been stopped. No more automated partnerships will occur until you turn it back on.'
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
