const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://xzzyhfyazwohdqqbjiiy.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6enloZnlhendvaGRxcWJqaWl5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzEwMzU1MSwiZXhwIjoyMDk4Njc5NTUxfQ.o0WfHQ310sB8R1-6sL6Kk4iQstKx66M2iN39Q2wK2z8';

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
