import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = 'https://xzzyhfyazwohdqqbjiiy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6enloZnlhendvaGRxcWJqaWl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxMDM1NTEsImV4cCI6MjA5ODY3OTU1MX0.8KPZxd060ps2pc3oeDzBA9UG3fdHj_lPjnLhq0Q5eaM';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function check() {
  const phone = '+998998237043';
  const { data: appData, error: appError } = await supabase
      .from('applications')
      .select('*, teams(name, league)')
      .eq('phone', phone)
      .order('created_at', { ascending: false });

  console.log('App Data:', appData);
  console.log('App Error:', appError);
  
  const { data: teamData, error: teamError } = await supabase
      .from('teams')
      .select('*')
      .eq('captain_phone', phone)
      .single();

  console.log('Team Data:', teamData);
  console.log('Team Error:', teamError);
}
check();
