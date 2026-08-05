import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xzzyhfyazwohdqqbjiiy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6enloZnlhendvaGRxcWJqaWl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxMDM1NTEsImV4cCI6MjA5ODY3OTU1MX0.8KPZxd060ps2pc3oeDzBA9UG3fdHj_lPjnLhq0Q5eaM';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function inspectPhotos() {
  const { data, error } = await supabase
    .from('applications')
    .select('id, first_name, last_name, photo_url')
    .not('photo_url', 'is', null)
    .limit(20);

  if (error) {
    console.error(error);
    return;
  }

  console.log('Sample player photo URLs:');
  data.forEach((p, idx) => {
    console.log(`${idx + 1}. [${p.first_name} ${p.last_name}] photo_url:`, p.photo_url);
  });
}

inspectPhotos();
