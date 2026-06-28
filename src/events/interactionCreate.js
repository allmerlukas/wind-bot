const waveStore = require('../utils/waveStore');
const { sendWaveMessages, dmWaveToUser, executeCopy, copySessions, buildPageContent, buildNextRow } = require('../commands/wave');
const { STEPS, buildStepMessage, buildSummary } = require('../commands/config');
const { handleDashboardSelect, handleServerSelect, handleModalSubmit } = require('../commands/owner');
const adminCmd = require('../commands/admin');
const utilityCmd = require('../commands/utility');
const staffCmd = require('../commands/staff');
const setupStore = require('../utils/setupStore');
const partnerCmd = require('../commands/partner');
const helpCmd    = require('../commands/help');
const {
  ChannelType, PermissionsBitField, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, EmbedBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    // We wrap all non-slash command component processing in a try/catch
    // because if an interaction expires, it throws DiscordAPIError[10062]
    // and crashes the bot otherwise.
    try {
      // ── Config wizard: modal submit (delay hours) ─────────────────────────────
      if (interaction.isModalSubmit() && interaction.customId.startsWith('cfg_delay_modal:')) {
        const stepIndex = parseInt(interaction.customId.split(':')[1], 10);
        const raw       = interaction.fields.getTextInputValue('cfg_delay_input');
        const hours     = parseInt(raw, 10);

        if (isNaN(hours) || hours < 1) {
          await interaction.reply({ content: '❌ Please enter a valid number of hours (minimum 1).', ephemeral: true });
          return;
        }

        await setupStore.set(interaction.guildId, 'partnerDelayHours', Math.max(hours, 1));

        const nextStep = stepIndex + 1;
        if (nextStep >= STEPS.length) {
          return interaction.update({ embeds: [await buildSummary(interaction.guildId, interaction)], components: [] });
        }
        return interaction.update(await buildStepMessage(interaction.guildId, nextStep));
      }

      // ── Config wizard: modal submit (member range) ───────────────────────────────
      if (interaction.isModalSubmit() && interaction.customId.startsWith('cfg_memberrange_modal:')) {
        const stepIndex = parseInt(interaction.customId.split(':')[1], 10);
        const raw       = interaction.fields.getTextInputValue('cfg_memberrange_input').trim();

        if (!raw) {
          // Blank input = clear restriction
          await setupStore.set(interaction.guildId, 'minMembers', null);
          await setupStore.set(interaction.guildId, 'maxMembers', null);
        } else {
          const parts = raw.split('-');
          const minVal = parseInt(parts[0], 10);
          const maxVal = parseInt(parts[1], 10);

          if (parts.length !== 2 || isNaN(minVal) || isNaN(maxVal) || minVal < 1 || maxVal < minVal) {
            await interaction.reply({
              content: '❌ Invalid format. Use `min-max` (e.g. `100-5000`) where min ≥ 1 and max ≥ min.',
              ephemeral: true,
            });
            return;
          }

          await setupStore.set(interaction.guildId, 'minMembers', minVal);
          await setupStore.set(interaction.guildId, 'maxMembers', maxVal);
        }

        const nextStep = stepIndex + 1;
        if (nextStep >= STEPS.length) {
          return interaction.update({ embeds: [await buildSummary(interaction.guildId, interaction)], components: [] });
        }
        return interaction.update(await buildStepMessage(interaction.guildId, nextStep));
      }

      // ── Partner edit: modal submit ────────────────────────────────────────────────
      if (interaction.isModalSubmit() && interaction.customId.startsWith('pm_edit_modal:')) {
        return partnerCmd.handleModal(interaction);
      }

      // ── Owner dashboard: modal submit ──────────────────────────────────────────
      if (interaction.isModalSubmit() && interaction.customId.startsWith('owner_modal:')) {
        return handleModalSubmit(interaction);
      }

      // ── Admin dashboard: modal submit ─────────────────────────────────────────
      if (interaction.isModalSubmit() && interaction.customId.startsWith('admin_modal:')) {
        return adminCmd.handleModalSubmit(interaction);
      }

      // ── Staff dashboard: modal submit ─────────────────────────────────────────
      if (interaction.isModalSubmit() && interaction.customId.startsWith('staff_modal:')) {
        return staffCmd.handleModalSubmit(interaction);
      }

      // ── Config wizard: channel select ─────────────────────────────────────────
      if (interaction.isChannelSelectMenu() && interaction.customId.startsWith('cfg_')) {
        const [stepId, stepIndexStr] = interaction.customId.split(':');
        const stepIndex = parseInt(stepIndexStr, 10);
        const step      = STEPS[stepIndex];
        const channelId = interaction.values[0];

        // Run safety check if defined
        if (step.checkFn && channelId) {
          await interaction.deferUpdate();
          const channel = interaction.guild.channels.cache.get(channelId);
          const err = await step.checkFn(channel, interaction.guild);
          if (err) {
            const msg = await buildStepMessage(interaction.guildId, stepIndex);
            msg.embeds[0] = EmbedBuilder.from(msg.embeds[0]).addFields({ name: '\u274c Error', value: err, inline: false });
            return interaction.editReply(msg);
          }
        }

        await setupStore.set(interaction.guildId, step.storeKey, channelId);

        const nextStep = stepIndex + 1;
        if (nextStep >= STEPS.length) {
          if (interaction.deferred) {
            return interaction.editReply({ embeds: [await buildSummary(interaction.guildId, interaction)], components: [] });
          }
          return interaction.update({ embeds: [await buildSummary(interaction.guildId, interaction)], components: [] });
        }
        
        if (interaction.deferred) {
          return interaction.editReply(await buildStepMessage(interaction.guildId, nextStep));
        }
        return interaction.update(await buildStepMessage(interaction.guildId, nextStep));
      }

      // ── Admin dashboard: channel select ───────────────────────────────────────
      if (interaction.isChannelSelectMenu() && interaction.customId.startsWith('admin_channel_select:')) {
        return adminCmd.handleChannelSelect(interaction);
      }

      // ── Config wizard: role select ────────────────────────────────────────────
      if (interaction.isRoleSelectMenu() && interaction.customId.startsWith('cfg_')) {
        const [stepId, stepIndexStr] = interaction.customId.split(':');
        const stepIndex = parseInt(stepIndexStr, 10);
        const step      = STEPS[stepIndex];
        const roleId    = interaction.values[0];
        const role      = interaction.guild.roles.cache.get(roleId);

        // Run safety check if defined
        if (step.checkFn && role) {
          await interaction.deferUpdate();
          // Fetch all members so role.members.size is accurate (cache may be incomplete)
          try { await interaction.guild.members.fetch(); } catch { /* ignore, best-effort */ }
          const err = await step.checkFn(role, interaction.guild);
          if (err) {
            const msg = await buildStepMessage(interaction.guildId, stepIndex);
            msg.embeds[0] = EmbedBuilder.from(msg.embeds[0]).addFields({ name: '\u274c Error', value: err, inline: false });
            return interaction.editReply(msg);
          }
        }

        await setupStore.set(interaction.guildId, step.storeKey, roleId);

        const nextStep = stepIndex + 1;
        if (nextStep >= STEPS.length) {
          if (interaction.deferred) {
            return interaction.editReply({ embeds: [await buildSummary(interaction.guildId, interaction)], components: [] });
          }
          return interaction.update({ embeds: [await buildSummary(interaction.guildId, interaction)], components: [] });
        }
        const nextMsg = await buildStepMessage(interaction.guildId, nextStep);
        if (interaction.deferred) return interaction.editReply(nextMsg);
        return interaction.update(nextMsg);
      }

      // ── Config wizard: delay button (opens modal) ─────────────────────────────
      if (interaction.isButton() && interaction.customId.startsWith('cfg_delay_hours:')) {
        const stepIndex = interaction.customId.split(':')[1];
        const modal = new ModalBuilder()
          .setCustomId(`cfg_delay_modal:${stepIndex}`)
          .setTitle('Set Partner Delay');

        const input = new TextInputBuilder()
          .setCustomId('cfg_delay_input')
          .setLabel('Minimum hours between partner ads')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g. 24')
          .setMinLength(1)
          .setMaxLength(4)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }

      // ── Config wizard: member range button (opens modal) ──────────────────────────
      if (interaction.isButton() && interaction.customId.startsWith('cfg_memberrange:')) {
        const stepIndex = interaction.customId.split(':')[1];
        const modal = new ModalBuilder()
          .setCustomId(`cfg_memberrange_modal:${stepIndex}`)
          .setTitle('Set Member Count Range');

        const input = new TextInputBuilder()
          .setCustomId('cfg_memberrange_input')
          .setLabel('Member range (e.g. 100-5000, or leave blank)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g. 100-5000')
          .setMinLength(0)
          .setMaxLength(20)
          .setRequired(false);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }

      // ── Config wizard: skip step ──────────────────────────────────────────────
      if (interaction.isButton() && interaction.customId.startsWith('cfg_skip:')) {
        const stepIndex = parseInt(interaction.customId.split(':')[1], 10);
        const nextStep  = stepIndex + 1;
        if (nextStep >= STEPS.length) {
          return interaction.update({ embeds: [await buildSummary(interaction.guildId, interaction)], components: [] });
        }
        return interaction.update(await buildStepMessage(interaction.guildId, nextStep));
      }

      // ── Config wizard: finish early ───────────────────────────────────────────
      if (interaction.isButton() && interaction.customId === 'cfg_done') {
        return interaction.update({ embeds: [await buildSummary(interaction.guildId, interaction)], components: [] });
      }

      // ── Config wizard: paid ads — Yes (first screen) ───────────────────────
      if (interaction.isButton() && interaction.customId.startsWith('cfg_paid_ads_yes:')) {
        const stepIndex = parseInt(interaction.customId.split(':')[1], 10);
        await setupStore.set(interaction.guildId, 'allowPaidAds', true);
        return interaction.update({
          embeds: [
            new EmbedBuilder()
              .setColor(0x57F287)
              .setTitle('🙏 thx so much!')
              .setDescription('thx so much\nalright you will get **2 partners per tick** now and a **custom role** in our discord'),
          ],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`cfg_paid_ads_thanks_continue:${stepIndex}`)
                .setLabel('Continue Setup ➡️')
                .setStyle(ButtonStyle.Primary),
            ),
          ],
        });
      }

      if (interaction.isButton() && interaction.customId.startsWith('cfg_paid_ads_no:')) {
        const stepIndex = interaction.customId.split(':')[1];
        return interaction.update({
          embeds: [
            new EmbedBuilder()
              .setColor(0xED4245)
              .setTitle('🙏 Are you sure?')
              .setDescription(
                `I host this bot for **$5 a month** out of my own pocket.\n` +
                `The bot is **completely free** for you to use.\n\n` +
                `Allowing paid ads costs you nothing, and **you get 2 partners per tick** if you allow paid ads!\n\n` +
                `Help a brother out 😭🙏`
              ),
          ],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`cfg_paid_ads_confirm_yes:${stepIndex}`)
                .setLabel('Fine, I\'ll allow it 🙏')
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId(`cfg_paid_ads_confirm_no:${stepIndex}`)
                .setLabel('No, I\'m heartless')
                .setStyle(ButtonStyle.Danger),
            ),
          ],
        });
      }

      // ── Config wizard: paid ads — guilt-trip confirmation ────────────────────
      if (interaction.isButton() && (interaction.customId.startsWith('cfg_paid_ads_confirm_yes:') || interaction.customId.startsWith('cfg_paid_ads_confirm_no:'))) {
        const stepIndex = parseInt(interaction.customId.split(':')[1], 10);
        const allow     = interaction.customId.startsWith('cfg_paid_ads_confirm_yes:');

        if (allow) {
          // They gave in — save true and move on
          await setupStore.set(interaction.guildId, 'allowPaidAds', true);
          return interaction.update({
            embeds: [
              new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle('🙏 thx so much!')
                .setDescription('thx so much\nalright you will get **2 partners per tick** now and a **custom role** in our discord'),
            ],
            components: [
              new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId(`cfg_paid_ads_thanks_continue:${stepIndex}`)
                  .setLabel('Continue Setup ➡️')
                  .setStyle(ButtonStyle.Primary),
              ),
            ],
          });
        }

        // They said "No, I'm heartless" — hit them with one more plea
        return interaction.update({
          embeds: [
            new EmbedBuilder()
              .setColor(0xFEE75C)
              .setTitle('😭 Please bro')
              .setDescription(
                `please bro i need this\n\n` +
                `this will happen **once a month**\n\n` +
                `i run this bot for you guys for **$5 a month**\n\n` +
                `i need this 🙏😭`
              ),
          ],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`cfg_paid_ads_final_yes:${stepIndex}`)
                .setLabel('Okay fine 🙏')
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId(`cfg_paid_ads_final_no:${stepIndex}`)
                .setLabel('Absolutely not 💔')
                .setStyle(ButtonStyle.Danger),
            ),
          ],
        });
      }

      // ── Config wizard: paid ads — final answer ───────────────────────────────
      if (interaction.isButton() && interaction.customId.startsWith('cfg_paid_ads_final_yes:')) {
        const stepIndex = parseInt(interaction.customId.split(':')[1], 10);
        await setupStore.set(interaction.guildId, 'allowPaidAds', true);
        return interaction.update({
          embeds: [
            new EmbedBuilder()
              .setColor(0x57F287)
              .setTitle('🙏 thx so much!')
              .setDescription('thx so much\nalright you will get **2 partners per tick** now and a **custom role** in our discord'),
          ],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`cfg_paid_ads_thanks_continue:${stepIndex}`)
                .setLabel('Continue Setup ➡️')
                .setStyle(ButtonStyle.Primary),
            ),
          ],
        });
      }

      if (interaction.isButton() && interaction.customId.startsWith('cfg_paid_ads_final_no:')) {
        const stepIndex = parseInt(interaction.customId.split(':')[1], 10);
        await setupStore.set(interaction.guildId, 'allowPaidAds', false);
        await setupStore.syncOwnerRoles(interaction.guild.ownerId, interaction.client);
        const nextStep = stepIndex + 1;
        if (nextStep >= STEPS.length) {
          return interaction.update({ embeds: [await buildSummary(interaction.guildId, interaction)], components: [] });
        }
        return interaction.update(await buildStepMessage(interaction.guildId, nextStep));
      }

      // ── Config wizard: paid ads — thank-you continue button ────────────────────
      if (interaction.isButton() && interaction.customId.startsWith('cfg_paid_ads_thanks_continue:')) {
        const stepIndex = parseInt(interaction.customId.split(':')[1], 10);
        const nextStep = stepIndex + 1;
        if (nextStep >= STEPS.length) {
          return interaction.update({ embeds: [await buildSummary(interaction.guildId, interaction)], components: [] });
        }
        return interaction.update(await buildStepMessage(interaction.guildId, nextStep));
      }

      // ── Config remove: confirm/cancel ───────────────────────────────────────────
      if (interaction.isButton() && interaction.customId === 'cfg_remove_confirm') {
        await setupStore.remove(interaction.guildId);
        await setupStore.syncOwnerRoles(interaction.guild.ownerId, interaction.client);
        return interaction.update({
          embeds: [
            new EmbedBuilder()
              .setColor(0xED4245)
              .setTitle('🗑️ Removed from Auto-Wave')
              .setDescription(
                `**${interaction.guild.name}** has been removed from the Auto-Wave network.\n` +
                `All config has been wiped. Run \`/config setup\` to re-enroll anytime.`
              )
              .setTimestamp(),
          ],
          components: [],
        });
      }

      if (interaction.isButton() && interaction.customId === 'cfg_remove_cancel') {
        return interaction.update({
          embeds: [
            new EmbedBuilder()
              .setColor(0x57F287)
              .setTitle('✅ Cancelled')
              .setDescription('No changes were made. Your Auto-Wave config is intact.'),
          ],
          components: [],
        });
      }

      // ── Select menu: wave paste picker ───────────────────────────────────────
      if (interaction.isStringSelectMenu()) {
        // ── Owner / VIP Dashboard ──────────────────────────────────────────────
        if (interaction.customId === 'owner_dashboard_select' || interaction.customId === 'vip_dashboard_select') {
          return handleDashboardSelect(interaction);
        }
        if (interaction.customId.startsWith('owner_server_select:')) {
          return handleServerSelect(interaction);
        }

        // ── Admin / Utility Dashboard ──────────────────────────────────────────
        if (interaction.customId === 'admin_dashboard_select') {
          return adminCmd.handleDashboardSelect(interaction);
        }
        if (interaction.customId === 'utility_dashboard_select') {
          return utilityCmd.handleDashboardSelect(interaction);
        }

        // ── Staff Dashboard ────────────────────────────────────────────────────
        if (interaction.customId === 'staff_dashboard_select') {
          return staffCmd.handleDashboardSelect(interaction);
        }
        if (interaction.customId.startsWith('staff_server_select:')) {
          return staffCmd.handleServerSelect(interaction);
        }

        if (interaction.customId === 'wave_paste_select') {
          const waveKey = interaction.values[0];
          const wave = await waveStore.getWave(interaction.user.id, waveKey);

          if (!wave) {
            return interaction.update({ content: '❌ Wave not found.', components: [] });
          }

          // Remove the select menu, then send each ad separately with validation
          await interaction.update({ content: '✅ Sending wave...', components: [] });
          await sendWaveMessages(interaction, wave, true, waveKey);
        }

        if (interaction.customId === 'wave_dm_select') {
          const waveKey = interaction.values[0];
          const wave = await waveStore.getWave(interaction.user.id, waveKey);

          if (!wave) {
            return interaction.update({ content: '❌ Wave not found.', components: [] });
          }

          await interaction.update({ content: '📬 Sending to your DMs...', components: [] });
          await dmWaveToUser(interaction, waveKey, wave);
        }

        if (interaction.customId === 'wave_copy_select') {
          const waveKey = interaction.values[0];
          const wave = await waveStore.getWave(interaction.user.id, waveKey);

          if (!wave) {
            return interaction.update({ content: '❌ Wave not found.', components: [] });
          }

          // deferUpdate keeps it ephemeral while we validate links
          await interaction.deferUpdate();
          await executeCopy(interaction, wave);
        }

        // ── Partner wave: pick which server gets double ───────────────────────
        if (interaction.customId.startsWith('pm_wave_double_select:')) {
          return partnerCmd.handleSelect(interaction);
        }

        // ── Help category picker ───────────────────────────────────────────────
        if (interaction.customId.startsWith('help_category:')) {
          return helpCmd.handleSelect(interaction);
        }

        // ── Partner edit: guild picker ──────────────────────────────────────────
        if (interaction.customId.startsWith('pm_edit_select:')) {
          const [, userId] = interaction.customId.split(':');
          if (interaction.user.id !== userId) {
            return interaction.reply({ content: '❌ This is not your session.', ephemeral: true });
          }

          const pmStore  = require('../utils/pmStore');
          const guildId  = interaction.values[0];
          const guilds   = await pmStore.getGuilds(userId);
          const guild    = guilds.find(g => g.guild_id === guildId);

          const modal = new ModalBuilder()
            .setCustomId(`pm_edit_modal:${userId}:${guildId}`)
            .setTitle('Edit Guild');

          const channelInput = new TextInputBuilder()
            .setCustomId('pm_edit_channel')
            .setLabel('Partner Channel ID')
            .setStyle(TextInputStyle.Short)
            .setValue(guild?.channel_id ?? '')
            .setPlaceholder('e.g. 123456789012345678')
            .setRequired(true)
            .setMaxLength(19);

          const labelInput = new TextInputBuilder()
            .setCustomId('pm_edit_label')
            .setLabel('Nickname (leave blank to clear)')
            .setStyle(TextInputStyle.Short)
            .setValue(guild?.label ?? '')
            .setPlaceholder('e.g. My Main Server')
            .setRequired(false)
            .setMaxLength(40);

          modal.addComponents(
            new ActionRowBuilder().addComponents(channelInput),
            new ActionRowBuilder().addComponents(labelInput),
          );

          return interaction.showModal(modal);
        }
      }

      // ── User select menus ─────────────────────────────────────────────────────
      if (interaction.isUserSelectMenu()) {
        if (interaction.customId.startsWith('utility_user_select:')) {
          return utilityCmd.handleUserSelect(interaction);
        }
      }

      // ── Button interactions ───────────────────────────────────────────────────
      if (interaction.isButton()) {

        // ── Dashboard Return ────────────────────────────────────────────────────
        if (interaction.customId.startsWith('dash_return:')) {
          const dashType = interaction.customId.split(':')[1];
          let cmd;
          if (dashType === 'owner') cmd = require('../commands/owner');
          else if (dashType === 'vip') cmd = require('../commands/vip');
          else if (dashType === 'staff') cmd = require('../commands/staff');
          else if (dashType === 'admin') cmd = require('../commands/admin');
          else if (dashType === 'utility') cmd = require('../commands/utility');
          
          if (cmd && cmd.renderDashboard) {
            return cmd.renderDashboard(interaction, true);
          }
        }

        // ── Owner Strike Approval ───────────────────────────────────────────────
        if (interaction.customId.startsWith('staff_strike_accept:') || interaction.customId.startsWith('staff_strike_deny:')) {
          if (interaction.user.id !== process.env.OWNER_ID) {
            return interaction.reply({ content: '🔒 Only the bot owner can approve or deny strike requests.', ephemeral: true });
          }
          
          await interaction.deferUpdate();
          const parts = interaction.customId.split(':');
          const action = parts[0]; 
          const guildId = parts[1];
          const staffId = parts[2];
          
          if (action === 'staff_strike_accept') {
            const { addStrike } = require('../utils/strikeLogic');
            const { newStrikes, strikeBar, warn, name } = await addStrike(interaction.client, guildId, "Approved by Owner");
            
            const embed = EmbedBuilder.from(interaction.message.embeds[0])
              .setColor('#00FF00')
              .setTitle('✅ Strike Request Accepted')
              .addFields({ name: 'Result', value: `Strike **${newStrikes}/3** added to **${name}** ${strikeBar}${warn}` });
              
            await interaction.message.edit({ embeds: [embed], components: [] });
          } else {
            const embed = EmbedBuilder.from(interaction.message.embeds[0])
              .setColor('#FF0000')
              .setTitle('❌ Strike Request Denied');
              
            await interaction.message.edit({ embeds: [embed], components: [] });
          }
          return;
        }

        // ── Wave copy: page through ads one at a time ─────────────────────────
        if (interaction.customId.startsWith('wave_copy_next:')) {
          const parts = interaction.customId.split(':');
          const ownerId = parts[1];
          const nextIdx = parseInt(parts[2], 10);

          if (interaction.user.id !== ownerId) {
            return interaction.reply({ content: '❌ This is not your wave copy session.', ephemeral: true });
          }

          const session = copySessions.get(ownerId);
          if (!session || session.expiresAt < Date.now()) {
            return interaction.update({ content: '❌ Session expired (10 min limit). Run `/wave copy` again.', components: [] });
          }

          const { chunks } = session;
          const totalPages = chunks.length;
          const isLast = nextIdx >= totalPages - 1;
          const content = buildPageContent(chunks[nextIdx], nextIdx + 1, totalPages);

          // Strip the button from the old message so it stays where it is (no scrolling)
          // Then send the new chunk as a fresh message at the bottom
          await interaction.update({ components: [] });

          if (isLast) {
            copySessions.delete(ownerId);
            return interaction.followUp({ ephemeral: true, content: content + '\n\n✅ **Last page! That\'s all of them.**', components: [] });
          }

          return interaction.followUp({
            ephemeral: true,
            content,
            components: [buildNextRow(ownerId, nextIdx + 1, totalPages)],
          });
        }

        // ── Partner manager: all pm_ buttons ─────────────────────────────────
        if (interaction.customId.startsWith('pm_')) {
          return partnerCmd.handleButton(interaction);
        }
      }
    } catch (err) {
      // 10062 = Unknown interaction (expired or already handled)
      if (err.code !== 10062) {
        console.error(`❌ Component handling error [${interaction.customId}]:`, err);
      }
    }

    // ── Slash commands ───────────────────────────────────────────────────────
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`❌ Error in /${interaction.commandName}:`, error);
      const reply = { content: `❌ Something went wrong: \`${error.message}\``, ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply).catch(() => {});
      } else {
        await interaction.reply(reply).catch(() => {});
      }
    }
  }
};
