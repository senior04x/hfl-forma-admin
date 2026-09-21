// Temporary script to check if is_postponed column exists in matches table
const SUPABASE_URL = 'https://xzzyhfyazwohdqqbjiiy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6enloZnlhendvaGRxcWJqaWl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxMDM1NTEsImV4cCI6MjA5ODY3OTU1MX0.8KPZxd060ps2pc3oeDzBA9UG3fdHj_lPjnLhq0Q5eaM';

async function checkColumn() {
  console.log('Checking if is_postponed column exists in matches table...\n');

  // Try to select is_postponed from a single row via REST API
  const response = await fetch(`${SUPABASE_URL}/rest/v1/matches?select=id,is_postponed&limit=1`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    }
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('❌ Column does NOT exist or query failed:');
    console.error('Status:', response.status);
    console.error('Error:', data);
    console.log('\n✅ RESULT: is_postponed ustuni mavjud EMAS — migratsiya kerak!\n');
    return false;
  }

  console.log('✅ Column EXISTS!');
  console.log('Sample data:', data);
  console.log('\n✅ RESULT: is_postponed ustuni mavjud — migratsiya kerak EMAS.\n');
  return true;
}

checkColumn().catch(console.error);
