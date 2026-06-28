const fs = require('fs');
const path = require('path');

function processFile(filename, dashType) {
  const file = path.join(__dirname, '../src/commands/' + filename);
  let code = fs.readFileSync(file, 'utf8');

  // 1. imports
  code = code.replace(
    "const setupStore = require('../utils/setupStore');",
    "const setupStore = require('../utils/setupStore');\nconst { buildBackButtonRow, buildStatusEmbed } = require('../utils/dashboardUtils');"
  );
  
  if (filename === 'staff.js' || filename === 'vip.js') {
    code = code.replace(
      "new StringSelectMenuOptionBuilder().setLabel('Status Overview').setValue('status').setDescription('View bot and Auto-Wave stats').setEmoji('📈'),\n",
      ""
    );
    // remove handleStatus if it exists (vip.js has it, wait, vip and staff import it from owner!)
    code = code.replace("if (action === 'status') return handleStatus(interaction.client, interaction);", "");
  }

  // 2. update execute and renderDashboard
  let newExecute = "";
  if (filename === 'staff.js') {
    newExecute = `
  async execute(interaction) {
    if (!interaction.member?.roles?.cache?.has(STAFF_ROLE_ID)) {
      return interaction.reply({ content: '🔒 You do not have permission to use the staff dashboard.', ephemeral: true });
    }
    return this.renderDashboard(interaction);
  },

  async renderDashboard(interaction, isUpdate = false) {
    const embed = await buildStatusEmbed(interaction.client, '🛡️ Staff Dashboard');
    const components = [buildStaffMenu()];
    
    if (isUpdate) return interaction.update({ embeds: [embed], components });
    return interaction.reply({ embeds: [embed], components, ephemeral: true });
  },`;
    code = code.replace(/async execute\(interaction\) \{[\s\S]*?handleDashboardSelect,/m, newExecute + "\n\n  handleDashboardSelect,");
  } 
  else if (filename === 'vip.js') {
    newExecute = `
  async execute(interaction) {
    if (!await checkOwner(interaction, 'vip-dashboard')) return;
    return this.renderDashboard(interaction);
  },

  async renderDashboard(interaction, isUpdate = false) {
    const embed = await buildStatusEmbed(interaction.client, '💎 VIP Dashboard');
    const components = [buildDashboardMenu(true)];
    
    if (isUpdate) return interaction.update({ embeds: [embed], components });
    return interaction.reply({ embeds: [embed], components, ephemeral: true });
  },`;
    code = code.replace(/async execute\(interaction\) \{[\s\S]*?\},/, newExecute);
  }
  else if (filename === 'admin.js') {
    newExecute = `
  async execute(interaction) {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '🔒 You do not have permission to use this command.', ephemeral: true });
    }
    return this.renderDashboard(interaction);
  },

  async renderDashboard(interaction, isUpdate = false) {
    const embed = new EmbedBuilder()
      .setColor('#E74C3C')
      .setTitle('🛠️ Admin Dashboard')
      .setDescription('Select an administrative action from the dropdown menu below.')
      .setTimestamp();
    const components = [buildAdminMenu()];
    
    if (isUpdate) return interaction.update({ embeds: [embed], components });
    return interaction.reply({ embeds: [embed], components, ephemeral: true });
  },`;
    code = code.replace(/async execute\(interaction\) \{[\s\S]*?handleDashboardSelect,/m, newExecute + "\n\n  handleDashboardSelect,");
  }
  else if (filename === 'utility.js') {
    newExecute = `
  async execute(interaction) {
    return this.renderDashboard(interaction);
  },

  async renderDashboard(interaction, isUpdate = false) {
    const embed = new EmbedBuilder()
      .setColor('#3498DB')
      .setTitle('🔧 Utility Dashboard')
      .setDescription('Select a utility tool from the dropdown menu below.')
      .setTimestamp();
    const components = [buildUtilityMenu()];
    
    if (isUpdate) return interaction.update({ embeds: [embed], components });
    return interaction.reply({ embeds: [embed], components, ephemeral: true });
  },`;
    code = code.replace(/async execute\(interaction\) \{[\s\S]*?handleDashboardSelect,/m, newExecute + "\n\n  handleDashboardSelect,");
  }

  // 3. editReply helper
  const editReplyHelper = `
async function editReplyWithBack(interaction, dashType, payload) {
  let opts = typeof payload === 'string' ? { content: payload } : { ...payload };
  if (!opts.components) opts.components = [];
  opts.components.push(buildBackButtonRow(dashType));
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(opts);
  }
  return interaction.update(opts); // use update if not deferred!
}
`;
  code = code.replace("// ─── Handlers ─────────────────────────────────────────────────────────────────", "// ─── Handlers ─────────────────────────────────────────────────────────────────\n" + editReplyHelper);

  // 4. Update handlers to take dashType and use editReplyWithBack
  // We'll replace interaction.update, interaction.reply, interaction.editReply with editReplyWithBack
  // For files calling owner handlers (vip, staff), we need to pass dashType
  if (filename === 'staff.js' || filename === 'vip.js') {
    code = code.replace(/handle([a-zA-Z]+)\(interaction\.client, interaction\)/g, `handle$1(interaction.client, interaction, '${dashType}')`);
  }

  // Replace terminal returns
  code = code.replace(/return interaction\.update\(\{ content: /g, `return editReplyWithBack(interaction, '${dashType}', { content: `);
  code = code.replace(/return interaction\.update\(\{ embeds: /g, `return editReplyWithBack(interaction, '${dashType}', { embeds: `);
  code = code.replace(/return interaction\.editReply\(\{ content: /g, `return editReplyWithBack(interaction, '${dashType}', { content: `);
  code = code.replace(/return interaction\.editReply\(\{ embeds: /g, `return editReplyWithBack(interaction, '${dashType}', { embeds: `);
  code = code.replace(/return interaction\.editReply\('/g, `return editReplyWithBack(interaction, '${dashType}', '`);
  
  // Note: some updates don't have return (await interaction.update), wait I'll just change interaction.update directly
  // Actually, replacing `.update` to `editReplyWithBack` is safe if we match the pattern.
  
  fs.writeFileSync(file, code);
  console.log('done ' + filename);
}

processFile('staff.js', 'staff');
processFile('vip.js', 'vip');
processFile('admin.js', 'admin');
processFile('utility.js', 'utility');
