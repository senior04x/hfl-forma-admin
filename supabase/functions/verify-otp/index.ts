// Edge Function: verify-otp
// Purpose: Verify OTP code and create team captain session token
// Called by: Team captain from client site after receiving OTP from Telegram bot

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

interface VerifyOTPRequest {
  phone: string;
  code: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Parse request body
    const { phone, code }: VerifyOTPRequest = await req.json();

    // Validate required fields
    if (!phone || !code) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: phone, code' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Clean phone number (last 9 digits)
    const cleanPhone = phone.replace(/\D/g, '').slice(-9);
    if (cleanPhone.length !== 9) {
      return new Response(
        JSON.stringify({ error: 'Invalid phone number format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with service role
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // ============================================
    // 1. Verify OTP code from otp_codes table
    // ============================================
    const { data: otpRecord, error: otpError } = await supabaseAdmin
      .from('otp_codes')
      .select('phone, code, expires_at, is_used')
      .eq('phone', cleanPhone)
      .eq('code', code)
      .maybeSingle();

    if (otpError || !otpRecord) {
      return new Response(
        JSON.stringify({ error: 'Invalid OTP code' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if code already used
    if (otpRecord.is_used) {
      return new Response(
        JSON.stringify({ error: 'OTP code already used' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if code expired
    const now = new Date();
    const expiresAt = new Date(otpRecord.expires_at);
    if (expiresAt < now) {
      return new Response(
        JSON.stringify({ error: 'OTP code expired' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================
    // 2. Find team where this phone is captain
    // ============================================
    // Only manager (captain) role gets session token
    // Players do NOT get transfer request privileges
    const { data: captainTeam, error: teamError } = await supabaseAdmin
      .from('teams')
      .select('id, name, logo_url, organization_id, captain_phone')
      .ilike('captain_phone', `%${cleanPhone}%`)
      .maybeSingle();

    if (teamError) {
      console.error('Team lookup error:', teamError);
      return new Response(
        JSON.stringify({ error: 'Database error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!captainTeam) {
      // Phone verified but user is NOT a team captain
      // Mark OTP as used but don't create session
      await supabaseAdmin
        .from('otp_codes')
        .update({ is_used: true })
        .eq('phone', cleanPhone)
        .eq('code', code);

      return new Response(
        JSON.stringify({
          success: true,
          role: 'player',
          message: 'OTP verified, but you are not a team captain',
          canRequestTransfers: false
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================
    // 3. Create team session token for captain
    // ============================================
    const sessionToken = crypto.randomUUID();
    const sessionExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const { error: sessionError } = await supabaseAdmin
      .from('team_sessions')
      .insert({
        token: sessionToken,
        phone: cleanPhone,
        team_id: captainTeam.id,
        expires_at: sessionExpiresAt.toISOString()
      });

    if (sessionError) {
      console.error('Session creation error:', sessionError);
      return new Response(
        JSON.stringify({ error: 'Failed to create session', details: sessionError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================
    // 4. Mark OTP as used
    // ============================================
    await supabaseAdmin
      .from('otp_codes')
      .update({ is_used: true })
      .eq('phone', cleanPhone)
      .eq('code', code);

    // ============================================
    // 5. Success response with session token
    // ============================================
    return new Response(
      JSON.stringify({
        success: true,
        role: 'captain',
        sessionToken: sessionToken,
        expiresAt: sessionExpiresAt.toISOString(),
        team: {
          id: captainTeam.id,
          name: captainTeam.name,
          logo_url: captainTeam.logo_url,
          organization_id: captainTeam.organization_id
        },
        canRequestTransfers: true,
        message: 'OTP verified. Session token created.'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in verify-otp function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
