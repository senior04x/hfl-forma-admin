// Edge Function: request-transfer
// Purpose: Create team-initiated transfer request with security validation
// Called by: Team captain from client site (after OTP verification)
// Auth: Bearer token from team_sessions (created after OTP verification)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

interface TransferRequest {
  player_id: string;
  new_team_id: string; // Team requesting the player (must match session)
  reason: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ============================================
    // 1. Verify Bearer token from Authorization header
    // ============================================
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Empty authorization token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with service role (bypasses RLS)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify token in team_sessions
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('team_sessions')
      .select('id, phone, team_id, expires_at')
      .eq('token', token)
      .maybeSingle();

    if (sessionError || !session) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired session token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if token expired
    const now = new Date();
    const expiresAt = new Date(session.expires_at);
    if (expiresAt < now) {
      return new Response(
        JSON.stringify({ error: 'Session token expired. Please verify OTP again.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { player_id, new_team_id, reason }: TransferRequest = await req.json();

    // Validate required fields
    if (!player_id || !new_team_id || !reason) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: player_id, new_team_id, reason' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================
    // 2. Verify requesting team matches session team
    // ============================================
    if (session.team_id !== new_team_id) {
      return new Response(
        JSON.stringify({
          error: 'Unauthorized: Token belongs to different team',
          sessionTeamId: session.team_id,
          requestedTeamId: new_team_id
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================
    // 3. Get requesting team details
    // ============================================
    const { data: requestingTeam, error: teamError } = await supabaseAdmin
      .from('teams')
      .select('id, name, logo_url, organization_id, captain_phone')
      .eq('id', new_team_id)
      .single();

    if (teamError || !requestingTeam) {
      return new Response(
        JSON.stringify({ error: 'Requesting team not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Double-check: session phone matches team captain phone (extra security layer)
    const sessionPhone = session.phone.replace(/\D/g, '').slice(-9);
    const teamCaptainPhone = requestingTeam.captain_phone?.replace(/\D/g, '').slice(-9);
    if (sessionPhone !== teamCaptainPhone) {
      return new Response(
        JSON.stringify({ error: 'Session phone mismatch with team captain' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================
    // 4. Verify player is in another team
    // ============================================
    const { data: player, error: playerError } = await supabaseAdmin
      .from('applications')
      .select('id, team_id, first_name, last_name, photo, teams(id, name, logo_url, organization_id)')
      .eq('id', player_id)
      .single();

    if (playerError || !player) {
      return new Response(
        JSON.stringify({ error: 'Player not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!player.team_id) {
      return new Response(
        JSON.stringify({ error: 'Player is not currently in any team' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (player.team_id === new_team_id) {
      return new Response(
        JSON.stringify({ error: 'Player is already in your team' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================
    // 5. Verify transfer window is open
    // ============================================
    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .select('id, name, transfer_window_open')
      .eq('id', requestingTeam.organization_id)
      .single();

    if (orgError || !org) {
      return new Response(
        JSON.stringify({ error: 'Organization not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!org.transfer_window_open) {
      return new Response(
        JSON.stringify({ error: 'Transfer window is currently closed' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================
    // 6. Check for existing pending transfer
    // ============================================
    const { data: existingTransfer } = await supabaseAdmin
      .from('transfers')
      .select('id, status')
      .eq('player_id', player_id)
      .eq('status', 'pending')
      .maybeSingle();

    if (existingTransfer) {
      return new Response(
        JSON.stringify({ error: 'Player already has a pending transfer request' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================
    // 7. Create transfer request
    // ============================================
    const transferData = {
      player_id: player.id,
      old_team_id: player.team_id,
      old_team_name: player.teams?.name || '',
      old_team_logo: player.teams?.logo_url || '',
      new_team_id: new_team_id,
      new_team_name: requestingTeam.name,
      new_team_logo: requestingTeam.logo_url || '',
      player_name: `${player.first_name || ''} ${player.last_name || ''}`.trim(),
      player_photo: player.photo || '',
      reason: reason,
      status: 'pending',
      player_confirmed: false,
      requested_by_team_id: new_team_id,
      organization_id: requestingTeam.organization_id,
    };

    const { data: newTransfer, error: insertError } = await supabaseAdmin
      .from('transfers')
      .insert(transferData)
      .select()
      .single();

    if (insertError) {
      console.error('Transfer insert error:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to create transfer request', details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================
    // 8. Success response
    // ============================================
    // Note: Bot will be notified via Supabase Realtime
    // (bot listens to transfers table INSERT events)

    return new Response(
      JSON.stringify({
        success: true,
        transfer: newTransfer,
        message: 'Transfer request created. Player will be notified via bot.'
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in request-transfer function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
