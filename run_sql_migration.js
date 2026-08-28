require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// 🔒 SECURITY FIX: service_role kaliti .env faylidan o'qiladi
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xzzyhfyazwohdqqbjiiy.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ FATAL: SUPABASE_SERVICE_ROLE_KEY .env faylida topilmadi.');
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function runMigration() {
  console.log('Running SQL Migration...');
  try {
    // 1. Ensure REGISTRATION_OPEN keys exist in sponsors table
    const keys = ['REGISTRATION_OPEN_1', 'REGISTRATION_OPEN'];
    for (const key of keys) {
      const { data: existing } = await supabaseAdmin.from('sponsors').select('id').eq('name', key).maybeSingle();
      if (!existing) {
        await supabaseAdmin.from('sponsors').insert([{
          name: key,
          logo_url: 'true',
          organization_id: 1,
          is_main: false,
          is_selected: false
        }]);
        console.log(`Created default sponsor key: ${key}`);
      }
    }

    // 2. Check if is_registration_open column can be updated in organizations table
    const { error: orgErr } = await supabaseAdmin.from('organizations').update({ is_registration_open: true }).eq('id', 1);
    if (orgErr) {
      console.log('Notice regarding organizations.is_registration_open:', orgErr.message);
    } else {
      console.log('Successfully verified organizations.is_registration_open column!');
    }
  } catch (err) {
    console.error('Migration error:', err);
  }
}

runMigration();
