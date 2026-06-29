const fs = require('fs');
const path = require('path');

const icFile = path.join(__dirname, '../src/events/interactionCreate.js');
let icCode = fs.readFileSync(icFile, 'utf8');

const cfgStartMarker = "      // ── Config wizard: modal submit (delay hours) ─────────────────────────────";
const cfgEndMarker = "      // ── Partner edit: modal submit ────────────────────────────────────────────────";

const startIndex = icCode.indexOf(cfgStartMarker);
const endIndex = icCode.indexOf(cfgEndMarker);

if (startIndex === -1 || endIndex === -1) {
  console.error("Markers not found");
  process.exit(1);
}

const cfgLogic = icCode.slice(startIndex, endIndex);

// Remove the cfg logic from interactionCreate.js
// but keep the handler call.
const newCfgLogic = `      if (interaction.customId && interaction.customId.startsWith('cfg_')) {
        const configCmd = require('../commands/config');
        return configCmd.handleComponent(interaction);
      }
      
`;
icCode = icCode.slice(0, startIndex) + newCfgLogic + icCode.slice(endIndex);

fs.writeFileSync(icFile, icCode);

const cfgFile = path.join(__dirname, '../src/commands/config.js');
let cfgCode = fs.readFileSync(cfgFile, 'utf8');

// Insert handleComponent at the bottom
const handleComponentFn = `

async function handleComponent(interaction) {
${cfgLogic}
}

module.exports.handleComponent = handleComponent;
`;
cfgCode += handleComponentFn;

// Replace `await buildSummary` and `await buildStepMessage` with `this.buildSummary`?
// No, config.js has them as local functions `async function buildSummary(guildId, interaction)` and `async function buildStepMessage(guildId, stepIndex)`.
// They are not exported on `module.exports` necessarily, but they are in scope if we put handleComponent in `config.js`!
// Wait, `setupStore` needs to be in scope. `const setupStore = require('../utils/setupStore');` is already in `config.js`.

fs.writeFileSync(cfgFile, cfgCode);
console.log("Moved config routing");
