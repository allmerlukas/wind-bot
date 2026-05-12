const { initGiveaways } = require('../utils/giveawayManager');

module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    console.log(`\n✅ Oblivion Bot is online!`);
    console.log(`🤖 Logged in as: ${client.user.tag}`);
    console.log(`📡 Tracking partner links in all channels`);
    console.log(`🎁 Checking for active giveaways...\n`);

    client.user.setPresence({
      activities: [{ name: 'partner links 🔗', type: 3 }], // 3 = Watching
      status: 'online',
    });

    // Resume any giveaways that were running before the bot restarted
    await initGiveaways(client);
  }
};

