const { startAutoWave }  = require('../utils/autoWaveEngine');

module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    console.log(`\n✅ Wind Bot is online!`);
    console.log(`🤖 Logged in as: ${client.user.tag}`);
    console.log(`📡 Tracking partner links in all channels\n`);

    client.user.setPresence({
      activities: [{ name: 'partner links 🔗', type: 3 }], // 3 = Watching
      status: 'online',
    });

    // Start the Auto-Wave engine (first tick after 30 min)
    startAutoWave(client);
  }
};
