const fs = require('fs');
const path = require('path');
const https = require('https');

const SUPABASE_URL = 'xzzyhfyazwohdqqbjiiy.supabase.co';
const SUPABASE_SERVICE_ROLE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6enloZnlhendvaGRxcWJqaWl5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzEwMzU1MSwiZXhwIjoyMDk4Njc5NTUxfQ.Z_qdzR5mYepOEyW57WXl9fb1v5FV4xEYDP-LvihiU6I';

const REPLAY_DIR = 'C:\\Replays';

console.log('================================================');
console.log('🎬 OBS Replay Auto-Uploader Service (Chronological Fix)');
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
      bucketReady = true;
      console.log('📦 Supabase Replays papkasi (Bucket) tayyor!');
      resolve();
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

  // Wait 3 seconds to ensure OBS completes writing MP4 file
  await new Promise(r => setTimeout(r, 3000));

  try {
    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
      console.log(`⏳ ${filename} hajmi 0 bayt, kutilmoqda...`);
      return;
    }

    uploadedFiles.add(filename);
    console.log(`🚀 Yangi Replay topildi (${(stats.size / 1024 / 1024).toFixed(2)} MB): ${filename}, Supabase-ga yuklanmoqda...`);

    const fileBuffer = fs.readFileSync(filePath);
    const safeName = `${Date.now()}_${filename.replace(/\s+/g, '_')}`;
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

          attachToExactMatchEvent(publicUrl);
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

function attachToExactMatchEvent(publicUrl) {
  // Query EXACT latest match_event sorted by created_at DESC (Chronological, NOT UUID string)
  const queryPath = `/rest/v1/match_events?select=id,match_id,created_at&replay_video_url=is.null&order=created_at.desc&limit=1`;
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
          const targetEvent = events[0];
          updateEventRecord(targetEvent.id, publicUrl);
        } else {
          // If no pending event exists, fallback to latest created match_event OR live match
          attachToLatestAnyEvent(publicUrl);
        }
      } catch (e) {
        console.error('Event biriktirish xatosi:', e);
      }
    });
  });
  req.end();
}

function attachToLatestAnyEvent(publicUrl) {
  const queryPath = `/rest/v1/match_events?select=id,match_id,created_at&order=created_at.desc&limit=1`;
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
          updateEventRecord(events[0].id, publicUrl);
        } else {
          createEventForActiveMatch(publicUrl);
        }
      } catch (e) {}
    });
  });
  req.end();
}

function createEventForActiveMatch(publicUrl) {
  const queryPath = `/rest/v1/matches?select=id,home_team_id&status=in.(live,first_half,second_half,half_time,scheduled)&order=id.desc&limit=1`;
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
        const matches = JSON.parse(body);
        if (matches && matches.length > 0) {
          const match = matches[0];
          const newEventData = JSON.stringify({
            match_id: match.id,
            team_id: match.home_team_id,
            event_type: 'goal',
            minute: 1,
            replay_video_url: publicUrl
          });

          const postReq = https.request({
            hostname: SUPABASE_URL,
            path: `/rest/v1/match_events`,
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE}`,
              'apikey': SUPABASE_SERVICE_ROLE,
              'Content-Type': 'application/json'
            }
          }, (postRes) => {
            console.log(`⚽ Yangi replay voqeasi match #${match.id} ga muvaffaqiyatli qo'shildi!`);
          });
          postReq.write(newEventData);
          postReq.end();
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
      setTimeout(scanDirectory, 2000);
    }
  });
  scanDirectory();
}

start();
