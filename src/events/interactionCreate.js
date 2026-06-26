const waveStore = require('../utils/waveStore');
const { sendWaveMessages, dmWaveToUser, executeCopy, copySessions, buildPageContent, buildNextRow } = require('../commands/wave');
const { STEPS, buildStepMessage, buildSummary } = require('../commands/config');
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
              .setDescription('thx so much\nyou will get a **custom role** in our discord'),
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
                `Allowing paid ads costs you nothing, it just means the occasional sponsored post shows up in your partner channel, exactly like a regular partner ad.\n\n` +
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
                .setDescription('thx so much\nyou will get a **custom role** in our discord'),
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
              .setDescription('thx so much\nyou will get a **custom role** in our discord'),
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

      // ── Button interactions ───────────────────────────────────────────────────
      if (interaction.isButton()) {

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

    // ── /owner invite — select menu response ─────────────────────────────────
    if (interaction.isStringSelectMenu() && interaction.customId === 'owner_invite_select') {
      try {
        const { checkOwner } = require('../utils/ownerGuard');
        if (!await checkOwner(interaction)) return;

        const guildId = interaction.values[0];
        const guild   = interaction.client.guilds.cache.get(guildId);
        if (!guild) return interaction.update({ content: '❌ Server not found.', components: [] });

        // Find a text channel the bot can create invites in
        const channel = guild.channels.cache.find(c =>
          c.isTextBased() && guild.members.me.permissionsIn(c).has('CreateInstantInvite')
        );
        if (!channel) {
          return interaction.update({ content: `❌ No channel found in **${guild.name}** where the bot can create an invite.`, components: [] });
        }
        const invite = await channel.createInvite({ maxAge: 0, maxUses: 1, reason: 'Owner requested via /owner invite' });
        return interaction.update({
          content: `🔗 **Invite for ${guild.name}:**\n${invite.url}\n\n*Single use, never expires.*`,
          components: [],
        });
      } catch (err) {
        console.error('[owner_invite_select]', err);
        return interaction.update({ content: `❌ Failed to create invite: ${err.message}`, components: [] }).catch(() => {});
      }
    }

    // ── /owner leave — select menu response ──────────────────────────────────
    if (interaction.isStringSelectMenu() && interaction.customId === 'owner_leave_select') {
      try {
        const { checkOwner } = require('../utils/ownerGuard');
        if (!await checkOwner(interaction)) return;

        const guildId = interaction.values[0];
        const guild   = interaction.client.guilds.cache.get(guildId);
        if (!guild) return interaction.update({ content: '❌ Server not found.', components: [] });

        const name = guild.name;
        try {
          await guild.leave();
          return interaction.update({ content: `👋 Successfully left **${name}**.`, components: [] });
        } catch (err) {
          return interaction.update({ content: `❌ Failed to leave **${name}**: ${err.message}`, components: [] });
        }
      } catch (err) {
        console.error('[owner_leave_select]', err);
        return interaction.update({ content: `❌ Error: ${err.message}`, components: [] }).catch(() => {});
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
