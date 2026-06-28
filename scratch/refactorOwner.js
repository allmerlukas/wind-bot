const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../src/commands/owner.js');
let code = fs.readFileSync(file, 'utf8');

// 1. Add imports
code = code.replace(
  "const { addStrike } = require('../utils/strikeLogic');",
  "const { addStrike } = require('../utils/strikeLogic');\nconst { buildStatusEmbed, buildBackButtonRow } = require('../utils/dashboardUtils');"
);

// 2. Remove Status option
code = code.replace(
  "  { label: 'Status', value: 'status', description: 'Bot stats: uptime, memory, guilds', emoji: '📊', vip: true },\n",
  ""
);

// 3. Remove handleStatus
code = code.replace(/async function handleStatus[\s\S]*?return interaction\.editReply[\s\S]*?\}\n/, "");

// 4. Update execute to use renderDashboard
const newExecute = `
  async execute(interaction) {
    if (!await checkOwner(interaction, 'dashboard')) return;
    return this.renderDashboard(interaction);
  },

  async renderDashboard(interaction, isUpdate = false) {
    const embed = await buildStatusEmbed(interaction.client, '👑 Owner Dashboard');
    const components = [buildDashboardMenu(false)];
    
    if (isUpdate) {
      return interaction.update({ embeds: [embed], components });
    }
    return interaction.reply({ embeds: [embed], components, ephemeral: true });
  },
`;
code = code.replace(/async execute\(interaction\) \{[\s\S]*?\},/, newExecute);

// 5. Update editReply wrappers
const editReplyHelper = `
async function editReplyWithBack(interaction, dashType, payload) {
  let opts = typeof payload === 'string' ? { content: payload } : { ...payload };
  if (!opts.components) opts.components = [];
  opts.components.push(buildBackButtonRow(dashType));
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(opts);
  }
  return interaction.reply({ ...opts, ephemeral: true });
}
`;
code = code.replace("// ─── Logic Handlers ───────────────────────────────────────────────────────────", "// ─── Logic Handlers ───────────────────────────────────────────────────────────\n" + editReplyHelper);

// 6. Replace interaction.editReply with editReplyWithBack in all handlers
// but we have to pass dashType.
// Instead of that, let's just use replace on `interaction.editReply(` -> `editReplyWithBack(interaction, dashType, `
// But wait, where does dashType come from?
// The handlers need to receive dashType.
// Currently they look like: async function handleGuilds(client, interaction)
code = code.replace(/async function handle([a-zA-Z]+)\(client, interaction\)/g, "async function handle$1(client, interaction, dashType)");

// For handleServerSelect and handleModalSubmit, dashType can be parsed from interaction.customId if they are prefixed, but they aren't!
// Wait, customId for server select is: owner_server_select:action. So dashType is 'owner'.
// Modal is: owner_modal:action. So dashType is 'owner'.

// Actually, let's just do manual string replacements for the editReply calls.
code = code.replace(/return interaction\.editReply\(/g, "return editReplyWithBack(interaction, dashType, ");
code = code.replace(/await interaction\.editReply\(/g, "await editReplyWithBack(interaction, dashType, ");

// For handleDashboardSelect
code = code.replace(/async function handleDashboardSelect\(interaction\)/, "async function handleDashboardSelect(interaction, dashType = 'owner')");
code = code.replace(/return handle([a-zA-Z]+)\(interaction\.client, interaction\)/g, "return handle$1(interaction.client, interaction, dashType)");

// For handleServerSelect
code = code.replace(/async function handleServerSelect\(interaction\)/, "async function handleServerSelect(interaction, dashType = 'owner')");

// For handleModalSubmit
code = code.replace(/async function handleModalSubmit\(interaction\)/, "async function handleModalSubmit(interaction, dashType = 'owner')");

// Fix handleCheck's pagination:
// await i.update({ embeds: [generateEmbed(currentPage)], components: [generateButtons(currentPage)] });
// needs the back button!
code = code.replace(/await i\.update\(\{ embeds: \[generateEmbed\(currentPage\)\], components: \[generateButtons\(currentPage\)\] \}\);/g, "await i.update({ embeds: [generateEmbed(currentPage)], components: [generateButtons(currentPage), buildBackButtonRow(dashType)] });");
// Also handleCheck initial call:
// await editReplyWithBack(interaction, dashType, { embeds: [generateEmbed(currentPage)], components: totalPages > 1 ? [generateButtons(currentPage)] : [] });
// editReplyWithBack will push the back button.

fs.writeFileSync(file, code);
console.log('done owner');
