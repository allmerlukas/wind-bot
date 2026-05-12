const setupStore = require('../utils/setupStore');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member) {
    const cfg = setupStore.get(member.guild.id);

    // ── Autorole ──────────────────────────────────────────────────────────────
    if (cfg.autoroleId) {
      const role = member.guild.roles.cache.get(cfg.autoroleId);
      if (role) await member.roles.add(role).catch(() => {});
    }

    // ── Welcome message ───────────────────────────────────────────────────────
    if (cfg.welcomeChannelId && cfg.welcomeMessage) {
      const channel = member.guild.channels.cache.get(cfg.welcomeChannelId);
      if (channel) {
        const text = cfg.welcomeMessage
          .replace(/{user}/g, `<@${member.id}>`)
          .replace(/{server}/g, member.guild.name)
          .replace(/{count}/g, member.guild.memberCount);
        await channel.send(text).catch(() => {});
      }
    }
  },
};
