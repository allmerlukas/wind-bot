// In-memory sessions: { userId -> session }
// create:  { type: 'create', waveName, ads: [] }
// edit:    { type: 'edit', waveName, serverIndex }
// insert:  { type: 'insert', waveName, spliceIndex }
// dmFix:  { type: 'dmFix', waveKey, displayName, deadLinks: [{adIndex}], queueIdx }
const sessions = new Map();

// Run a cleanup interval every 5 minutes to clear sessions older than 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [userId, session] of sessions.entries()) {
    if (now - session.createdAt > 15 * 60 * 1000) {
      sessions.delete(userId);
    }
  }
}, 5 * 60 * 1000);

function startSession(userId, channelId, waveName) {
  sessions.set(userId, { type: 'create', channelId, waveName, ads: [], createdAt: Date.now() });
}

// Like startSession but pre-fills with existing ads so the user continues from where they left off
function startAddSession(userId, channelId, waveName, existingAds) {
  sessions.set(userId, { type: 'create', channelId, waveName, ads: [...existingAds], createdAt: Date.now() });
}

function startEditSession(userId, channelId, waveName, serverIndex) {
  sessions.set(userId, { type: 'edit', channelId, waveName, serverIndex, createdAt: Date.now() });
}

function startDmFixSession(userId, channelId, waveKey, displayName, deadLinks) {
  sessions.set(userId, { type: 'dmFix', channelId, waveKey, displayName, deadLinks, queueIdx: 0, createdAt: Date.now() });
}

function startInsertSession(userId, channelId, waveName, spliceIndex) {
  sessions.set(userId, { type: 'insert', channelId, waveName, spliceIndex, createdAt: Date.now() });
}

function getSession(userId) {
  return sessions.get(userId) ?? null;
}

function addAd(userId, adText) {
  const session = sessions.get(userId);
  if (!session || session.type !== 'create') return false;
  session.ads.push(adText);
  return true;
}

function endSession(userId) {
  const session = sessions.get(userId) ?? null;
  sessions.delete(userId);
  return session;
}

module.exports = { startSession, startAddSession, startEditSession, startInsertSession, startDmFixSession, getSession, addAd, endSession };
