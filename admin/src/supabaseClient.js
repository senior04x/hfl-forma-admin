import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xzzyhfyazwohdqqbjiiy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6enloZnlhendvaGRxcWJqaWl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxMDM1NTEsImV4cCI6MjA5ODY3OTU1MX0.8KPZxd060ps2pc3oeDzBA9UG3fdHj_lPjnLhq0Q5eaM';
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6enloZnlhendvaGRxcWJqaWl5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzEwMzU1MSwiZXhwIjoyMDk4Njc5NTUxfQ.Z_qdzR5mYepOEyW57WXl9fb1v5FV4xEYDP-LvihiU6I';

// Oddiy client — foydalanuvchi sessiyasi bilan ishlaydi
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Admin client — foydalanuvchi yaratish/o'chirish uchun (service_role)
// Bu client RLS ni chetlab o'tadi va auth.admin API ga kirish imkonini beradi
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
