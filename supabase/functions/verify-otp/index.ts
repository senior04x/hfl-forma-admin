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
      .select('phone, code, expires_at, is_used, attempts')
      .eq('phone', cleanPhone)
      .maybeSingle();

    if (otpError) {
      console.error('OTP lookup error:', otpError);
      return new Response(
        JSON.stringify({ error: 'Database error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!otpRecord) {
      return new Response(
        JSON.stringify({ error: 'No OTP code found for this phone' }),
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
    // Brute-force protection: Check attempts
    // ============================================
    const attempts = otpRecord.attempts || 0;
    if (attempts >= 5) {
      // Too many failed attempts - block this OTP
      await supabaseAdmin
        .from('otp_codes')
        .update({ is_used: true })
        .eq('phone', cleanPhone);

      return new Response(
        JSON.stringify({
          error: 'Too many failed attempts. Please request a new OTP code.',
          attemptsRemaining: 0
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if provided code matches
    if (otpRecord.code !== code) {
      // Incorrect code - increment attempts
      const newAttempts = attempts + 1;
      await supabaseAdmin
        .from('otp_codes')
        .update({ attempts: newAttempts })
        .eq('phone', cleanPhone);

      return new Response(
        JSON.stringify({
          error: 'Invalid OTP code',
          attemptsRemaining: 5 - newAttempts
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Code is correct - proceed with captain lookup

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
      // Check if user is a player (applications table)
      const { data: playerData, error: playerError } = await supabaseAdmin
        .from('applications')
        .select('id, team_id, first_name, last_name, phone')
        .ilike('phone', `%${cleanPhone}%`)
        .order('created_at', { ascending: false })
        .limit(5);

      if (playerError) {
        console.error('Player lookup error:', playerError);
      }

      // Select most relevant player record:
      // Prefer: has team_id (active player), then most recent
      let selectedPlayer = null;
      if (playerData && playerData.length > 0) {
        // First try to find active player (with team_id)
        selectedPlayer = playerData.find(p => p.team_id) || playerData[0];
      }

      if (selectedPlayer) {
        // Player found - create player session
        const sessionToken = crypto.randomUUID();
        const sessionExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        const { error: sessionError } = await supabaseAdmin
          .from('player_sessions')
          .insert({
            token: sessionToken,
            phone: cleanPhone,
            player_id: selectedPlayer.id,
            expires_at: sessionExpiresAt.toISOString()
          });

        if (sessionError) {
          console.error('Player session creation error:', sessionError);
          return new Response(
            JSON.stringify({ error: 'Failed to create player session', details: sessionError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Mark OTP as used
        await supabaseAdmin
          .from('otp_codes')
          .update({ is_used: true })
          .eq('phone', cleanPhone)
          .eq('code', code);

        return new Response(
          JSON.stringify({
            success: true,
            role: 'player',
            sessionToken: sessionToken,
            expiresAt: sessionExpiresAt.toISOString(),
            player: {
              id: selectedPlayer.id,
              firstName: selectedPlayer.first_name,
              lastName: selectedPlayer.last_name,
              hasTeam: !!selectedPlayer.team_id
            },
            canRequestTransfers: true,
            message: 'OTP verified. Player session token created.'
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Neither captain nor player found
      await supabaseAdmin
        .from('otp_codes')
        .update({ is_used: true })
        .eq('phone', cleanPhone)
        .eq('code', code);

      return new Response(
        JSON.stringify({
          success: true,
          role: 'unknown',
          message: 'OTP verified, but no captain or player account found',
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
