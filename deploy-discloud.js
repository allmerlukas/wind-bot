const fs = require('fs');
const path = require('path');

const DISCLOUD_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6IjI3MDAyNDE1ODk0MjUiLCJrZXkiOiJlZDdkMzlhMmQzNTY3MDdjNDUzNTZhMjZiZjA0In0.uXb2qCvMrcHpIquIzcwAOkW9osA_bLLlmPB2Jv0_QDM';
const ZIP_PATH = path.join('C:', 'Users', 'allml', '.gemini', 'antigravity', 'brain', '8d070c5e-0858-4ebd-a135-587147e4d2b5', 'scratch', 'wind-bot.zip');

async function deploy() {
  console.log('Checking Discloud connection...');
  const userRes = await fetch('https://api.discloud.app/v2/user', {
    headers: { 'api-token': DISCLOUD_TOKEN }
  });
  const userData = await userRes.json();

  if (userData.status === 'error') {
    console.error('❌ Invalid Discloud Token:', userData);
    return;
  }

  const apps = userData.user?.apps || [];
  console.log(`Logged in successfully. Found ${apps.length} apps.`);

  const fileBuffer = fs.readFileSync(ZIP_PATH);
  const fileBlob = new Blob([fileBuffer]);
  const formData = new FormData();
  formData.append('file', fileBlob, 'wind-bot.zip');

  if (apps.length > 0) {
    const appId = apps[0];
    console.log(`🚀 Committing update to existing app (${appId})...`);
    const uploadRes = await fetch(`https://api.discloud.app/v2/app/${appId}/commit`, {
      method: 'PUT',
      headers: { 'api-token': DISCLOUD_TOKEN },
      body: formData
    });
    console.log('Upload Response:', await uploadRes.json());
  } else {
    console.log('🚀 Creating new app...');
    const uploadRes = await fetch('https://api.discloud.app/v2/app/create', {
      method: 'POST',
      headers: { 'api-token': DISCLOUD_TOKEN },
      body: formData
    });
    console.log('Upload Response:', await uploadRes.json());
  }
}

deploy().catch(console.error);
