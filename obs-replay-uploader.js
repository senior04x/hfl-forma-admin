const fs = require('fs');
const path = require('path');
const https = require('https');

const SUPABASE_URL = 'xzzyhfyazwohdqqbjiiy.supabase.co';
const SUPABASE_SERVICE_ROLE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6enloZnlhendvaGRxcWJqaWl5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzEwMzU1MSwiZXhwIjoyMDk4Njc5NTUxfQ.Z_qdzR5mYepOEyW57WXl9fb1v5FV4xEYDP-LvihiU6I';

const REPLAY_DIR = 'C:\\Replays';

console.log('================================================');
console.log('🎬 OBS Replay Auto-Uploader Service Ishga Tushdi!');
console.log(`📁 Kuzatilayotgan papka: ${REPLAY_DIR}`);
console.log('================================================');

if (!fs.existsSync(REPLAY_DIR)) {
  fs.mkdirSync(REPLAY_DIR, { recursive: true });
}

let uploadedFiles = new Set();
let bucketReady = false;

function initBucket() {
  return new Promise((resolve) => {
    const postData = JSON.stringify({ id: 'replays', name: 'replays', public: true });
    const req = https.request({
      hostname: SUPABASE_URL,
      path: '/storage/v1/bucket',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE}`,
        'apikey': SUPABASE_SERVICE_ROLE,
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        bucketReady = true;
        console.log('📦 Supabase Replays papkasi (Bucket) tayyor!');
        resolve();
      });
    });

    req.on('error', () => {
      bucketReady = true;
      resolve();
    });

    req.write(postData);
    req.end();
  });
}

async function uploadFile(filename) {
  const filePath = path.join(REPLAY_DIR, filename);
  if (uploadedFiles.has(filename)) return;

  try {
    uploadedFiles.add(filename);
    console.log(`🚀 Yangi Replay topildi: ${filename}, Supabase-ga yuklanmoqda...`);

    const fileBuffer = fs.readFileSync(filePath);
    const safeName = filename.replace(/\s+/g, '_');
    const storagePath = `/storage/v1/object/replays/${safeName}`;

    const req = https.request({
      hostname: SUPABASE_URL,
      path: storagePath,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE}`,
        'apikey': SUPABASE_SERVICE_ROLE,
        'Content-Type': 'video/mp4',
        'Content-Length': fileBuffer.length,
        'x-upsert': 'true'
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', async () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const publicUrl = `https://${SUPABASE_URL}/storage/v1/object/public/replays/${safeName}`;
          console.log('================================================');
          console.log('✅ REPLAY MUVAFFAQIYATLI SUPABASE-GA YUKLANDI!');
          console.log('🌐 Public Video URL:', publicUrl);
          console.log('================================================');

          attachToLatestMatchEvent(publicUrl);
        } else {
          console.error('❌ Supabase Yuklash xatoligi:', res.statusCode, body);
        }
      });
    });

    req.on('error', (e) => {
      console.error('❌ Tarmoq xatoligi:', e.message);
    });

    req.write(fileBuffer);
    req.end();
  } catch (err) {
    console.error('Yuklashda xatolik yuz berdi:', err.message);
  }
}

function attachToLatestMatchEvent(publicUrl) {
  const queryPath = `/rest/v1/match_events?select=id,match_id&order=id.desc&limit=1`;
  const req = https.request({
    hostname: SUPABASE_URL,
    path: queryPath,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE}`,
      'apikey': SUPABASE_SERVICE_ROLE
    }
  }, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      try {
        const events = JSON.parse(body);
        if (events && events.length > 0) {
          const eventId = events[0].id;
          updateEventRecord(eventId, publicUrl);
        }
      } catch (e) {}
    });
  });
  req.end();
}

function updateEventRecord(eventId, publicUrl) {
  const updateData = JSON.stringify({ replay_video_url: publicUrl });
  const req = https.request({
    hostname: SUPABASE_URL,
    path: `/rest/v1/match_events?id=eq.${eventId}`,
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE}`,
      'apikey': SUPABASE_SERVICE_ROLE,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    }
  }, (res) => {
    console.log(`🔗 Replay video havolasi match_event #${eventId} ga muvaffaqiyatli biriktirildi!`);
  });
  req.write(updateData);
  req.end();
}

async function scanDirectory() {
  if (!bucketReady) return;
  try {
    const files = fs.readdirSync(REPLAY_DIR);
    for (const filename of files) {
      if ((filename.endsWith('.mp4') || filename.endsWith('.mov') || filename.endsWith('.mkv')) && !uploadedFiles.has(filename)) {
        await uploadFile(filename);
      }
    }
  } catch (e) {}
}

async function start() {
  await initBucket();
  fs.watch(REPLAY_DIR, (eventType, filename) => {
    if (filename) {
      setTimeout(scanDirectory, 1000);
    }
  });
  scanDirectory();
}

start();
