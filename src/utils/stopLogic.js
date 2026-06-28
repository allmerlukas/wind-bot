/**
 * /stop — Owner-only command
 * Toggles the Auto-Wave engine globally on or off.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { checkOwner }                        = require('../utils/ownerGuard');
const { isEngineRunning, setEngineState }   = require('../utils/autoWaveEngine');

async function handleStop(client, interaction) {
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

  return interaction.editReply({ embeds: [embed], components: [] });
}

module.exports = { handleStop };
