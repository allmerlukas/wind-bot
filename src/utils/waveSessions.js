// In-memory sessions: { userId -> session }
// create:  { type: 'create', waveName, ads: [] }
// edit:    { type: 'edit', waveName, serverIndex }
// insert:  { type: 'insert', waveName, spliceIndex }
// dmFix:  { type: 'dmFix', waveKey, displayName, deadLinks: [{adIndex}], queueIdx }
const sessions = new Map();

function startSession(userId, waveName) {
  sessions.set(userId, { type: 'create', waveName, ads: [] });
}

// Like startSession but pre-fills with existing ads so the user continues from where they left off
function startAddSession(userId, waveName, existingAds) {
  sessions.set(userId, { type: 'create', waveName, ads: [...existingAds] });
}

function startEditSession(userId, waveName, serverIndex) {
  sessions.set(userId, { type: 'edit', waveName, serverIndex });
}

function startDmFixSession(userId, waveKey, displayName, deadLinks) {
  sessions.set(userId, { type: 'dmFix', waveKey, displayName, deadLinks, queueIdx: 0 });
}

function startInsertSession(userId, waveName, spliceIndex) {
  sessions.set(userId, { type: 'insert', waveName, spliceIndex });
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
