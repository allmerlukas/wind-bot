const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle } = require('discord.js');
const { handleStatus, handleAutowave, handleCheck, handleError } = require('./owner');
const setupStore = require('../utils/setupStore');
const { buildBackButtonRow, buildStatusEmbed } = require('../utils/dashboardUtils');

const STAFF_ROLE_ID = '1461421179347931340';

// ─── Dashboards ───────────────────────────────────────────────────────────────

function buildStaffMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('staff_dashboard_select')
      .setPlaceholder('Select an action...')
      .addOptions(
                new StringSelectMenuOptionBuilder().setLabel('Auto-Wave Check').setValue('autowave').setDescription('Check your Auto-Wave channels').setEmoji('🌊'),
        new StringSelectMenuOptionBuilder().setLabel('Server Check').setValue('check').setDescription('Look up a server by ID').setEmoji('🔍'),
        new StringSelectMenuOptionBuilder().setLabel('View Errors').setValue('error').setDescription('See recent bot errors').setEmoji('⚠️'),
        new StringSelectMenuOptionBuilder().setLabel('Generate Invite').setValue('invite').setDescription('Generate an invite link for a server').setEmoji('🔗'),
        new StringSelectMenuOptionBuilder().setLabel('Strike Server Request').setValue('strike-request').setDescription('Request owner approval to strike a server').setEmoji('🛑'),
        new StringSelectMenuOptionBuilder().setLabel('Strike Remove Request').setValue('strike-remove-request').setDescription('Request owner approval to remove a strike').setEmoji('🟢')
      )
  );
}

function buildGuildMenu(client, customId) {
  const guilds = Array.from(client.guilds.cache.values()).slice(0, 25);
  const options = guilds.map(g => {
    return new StringSelectMenuOptionBuilder()
      .setLabel(g.name.substring(0, 100))
      .setDescription(`ID: ${g.id}`)
      .setValue(g.id);
  });
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder('Select a server...')
      .addOptions(options)
  );
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function editReplyWithBack(interaction, dashType, payload) {
  let opts = typeof payload === 'string' ? { content: payload } : { ...payload };
  if (!opts.components) opts.components = [];
  opts.components.push(buildBackButtonRow(dashType));
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(opts);
  }
  return interaction.update(opts); // use update if not deferred!
}


async function handleDashboardSelect(interaction) {
  const action = interaction.values[0];

  if (['status', 'autowave', 'check', 'error'].includes(action)) {
    await interaction.update({ content: `⏳ Loading ${action}...`, components: [] });
    // We can reuse the owner.js handlers because they just take interaction and client
    
    if (action === 'autowave') return handleAutowave(interaction.client, interaction, 'staff');
    if (action === 'check') return handleCheck(interaction.client, interaction, 'staff');
    if (action === 'error') return handleError(interaction.client, interaction, 'staff');
  }

  if (action === 'invite' || action === 'strike-request' || action === 'strike-remove-request') {
    if (interaction.client.guilds.cache.size === 0) return interaction.reply({ content: '❌ The bot is not in any servers.', ephemeral: true });
    return interaction.update({
      content: `👇 **Select a server:**`,
      embeds: [],
      components: [buildGuildMenu(interaction.client, `staff_server_select:${action}`)]
    });
  }
}

async function handleServerSelect(interaction) {
  const [_, action] = interaction.customId.split(':');
  const guildId = interaction.values[0];
  const guild = interaction.client.guilds.cache.get(guildId);
  const name = guild?.name ?? guildId;

  if (action === 'invite') {
    await interaction.deferUpdate();
    if (!guild) return editReplyWithBack(interaction, 'staff', { content: '❌ Server not found.', components: [] });
    let invite = null;
    const channel = guild.channels.cache.find(c => c.isTextBased() && c.permissionsFor(guild.members.me).has('CreateInstantInvite'));
    if (channel) {
      invite = await channel.createInvite({ maxAge: 86400, maxUses: 1 }).catch(() => null);
    }
    if (!invite) return editReplyWithBack(interaction, 'staff', { content: `❌ Could not generate invite for **${name}**.`, components: [] });
    return editReplyWithBack(interaction, 'staff', { content: `🔗 **Invite for ${name}:** ${invite.url}`, components: [] });
  }

  if (action === 'strike-request' || action === 'strike-remove-request') {
    const isRemove = action === 'strike-remove-request';
    const modal = new ModalBuilder()
      .setCustomId(`staff_modal:${action}:${guildId}`)
      .setTitle(isRemove ? 'Strike Removal Request' : 'Strike Request');
    
    const reasonInput = new TextInputBuilder()
      .setCustomId('reason')
      .setLabel(isRemove ? 'Reason for removing strike' : 'Reason for the strike')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);
      
    modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
    return interaction.showModal(modal);
  }
}

async function handleModalSubmit(interaction) {
  const parts = interaction.customId.split(':');
  const action = parts[1];
  const guildId = parts[2];

  if (action === 'strike-request' || action === 'strike-remove-request') {
    await interaction.deferReply({ ephemeral: true });
    const isRemove = action === 'strike-remove-request';
    const reason = interaction.fields.getTextInputValue('reason');
    const targetGuild = interaction.client.guilds.cache.get(guildId);
    const targetName = targetGuild?.name ?? guildId;

    // Find Owner's server log channel
    if (!process.env.GUILD_ID) return editReplyWithBack(interaction, 'staff', '❌ Bot is missing GUILD_ID in .env');
    const ownerGuild = interaction.client.guilds.cache.get(process.env.GUILD_ID);
    if (!ownerGuild) return editReplyWithBack(interaction, 'staff', '❌ Bot is not in the Owner server.');
    
    const cfg = await setupStore.get(process.env.GUILD_ID);
    if (!cfg || !cfg.logChannelId) return editReplyWithBack(interaction, 'staff', '❌ The owner server does not have a log channel configured.');

    const logChannel = ownerGuild.channels.cache.get(cfg.logChannelId);
    if (!logChannel || !logChannel.isTextBased()) return editReplyWithBack(interaction, 'staff', '❌ The owner server log channel is invalid.');

    const embed = new EmbedBuilder()
      .setColor(isRemove ? '#57F287' : '#FFA500')
      .setTitle(isRemove ? '🟢 Pending Strike Removal Request' : '🛑 Pending Strike Request')
      .setDescription(`**Requested by:** <@${interaction.user.id}>\n**Target Server:** ${targetName} (\`${guildId}\`)\n\n**Reason:**\n> ${reason}`)
      .setTimestamp();

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(isRemove ? `staff_strike_rem_accept:${guildId}:${interaction.user.id}` : `staff_strike_accept:${guildId}:${interaction.user.id}`).setLabel(isRemove ? 'Accept Removal' : 'Accept Strike').setStyle(ButtonStyle.Success).setEmoji('✅'),
      new ButtonBuilder().setCustomId(isRemove ? `staff_strike_rem_deny:${guildId}:${interaction.user.id}` : `staff_strike_deny:${guildId}:${interaction.user.id}`).setLabel(isRemove ? 'Deny Removal' : 'Deny Strike').setStyle(ButtonStyle.Danger).setEmoji('❌')
    );

    try {
      await logChannel.send({ content: `<@${process.env.OWNER_ID}>`, embeds: [embed], components: [buttons] });
      return editReplyWithBack(interaction, 'staff', `✅ Strike ${isRemove ? 'removal ' : ''}request sent to the owner for approval!`);
    } catch (err) {
      return interaction.editReply(`❌ Failed to send request to owner's log channel: ${err.message}`);
    }
  }
}

// ─── Module exports ───────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('staff')
    .setDescription('Staff dashboard')
    .addSubcommand(sub => sub.setName('dashboard').setDescription('Open the staff dashboard')),

  
  async execute(interaction) {
    if (!interaction.member?.roles?.cache?.has(STAFF_ROLE_ID)) {
      return interaction.reply({ content: '🔒 You do not have permission to use the staff dashboard.', ephemeral: true });
    }
    return this.renderDashboard(interaction);
  },

  async renderDashboard(interaction, isUpdate = false) {
    const embed = await buildStatusEmbed(interaction.client, '🛡️ Staff Dashboard');
    const components = [buildStaffMenu()];
    
    if (isUpdate) return editReplyWithBack(interaction, 'staff', { embeds: [embed], components });
    return interaction.reply({ embeds: [embed], components, ephemeral: true });
  },

  handleDashboardSelect,
  handleServerSelect,
  handleModalSubmit
};
