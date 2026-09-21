// Edge Function: create-player-transfer
// Purpose: Create player-initiated transfer request with security validation
// Called by: Player from mobile app (after OTP verification)
// Auth: Bearer token from player_sessions (created after OTP verification)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

interface PlayerTransferRequest {
  new_team_id: string; // Target team player wants to join
  reason: string | null;
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

    // Verify token in player_sessions
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('player_sessions')
      .select('id, phone, player_id, expires_at')
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
    const { new_team_id, reason }: PlayerTransferRequest = await req.json();

    // Validate required fields
    if (!new_team_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: new_team_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================
    // 2. Get player info from session (DO NOT trust client)
    // ============================================
    const playerId = session.player_id;

    const { data: player, error: playerError } = await supabaseAdmin
      .from('applications')
      .select('id, team_id, first_name, last_name, photo, phone, teams(id, name, logo_url, organization_id)')
      .eq('id', playerId)
      .single();

    if (playerError || !player) {
      return new Response(
        JSON.stringify({ error: 'Player not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Double-check: session phone matches player phone (extra security layer)
    const sessionPhone = session.phone.replace(/\D/g, '').slice(-9);
    const playerPhone = player.phone?.replace(/\D/g, '').slice(-9);
    if (sessionPhone !== playerPhone) {
      return new Response(
        JSON.stringify({ error: 'Session phone mismatch with player phone' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if player currently in a team
    if (!player.team_id) {
      return new Response(
        JSON.stringify({ error: 'You are not currently in any team' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if player already in target team
    if (player.team_id === new_team_id) {
      return new Response(
        JSON.stringify({ error: 'You are already in this team' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================
    // 3. Get target team details
    // ============================================
    const { data: newTeam, error: teamError } = await supabaseAdmin
      .from('teams')
      .select('id, name, logo_url, organization_id')
      .eq('id', new_team_id)
      .single();

    if (teamError || !newTeam) {
      return new Response(
        JSON.stringify({ error: 'Target team not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if player and new team in same organization
    const playerOrgId = player.teams?.organization_id;
    const newTeamOrgId = newTeam.organization_id;

    if (playerOrgId !== newTeamOrgId) {
      return new Response(
        JSON.stringify({
          error: 'Target team belongs to a different organization',
          yourOrganizationId: playerOrgId,
          targetOrganizationId: newTeamOrgId
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================
    // 4. Verify transfer window is open
    // ============================================
    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .select('id, name, transfer_window_open')
      .eq('id', playerOrgId)
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
    // 5. Check for existing pending transfer
    // ============================================
    const { data: existingTransfer } = await supabaseAdmin
      .from('transfers')
      .select('id, status')
      .eq('player_id', playerId)
      .eq('status', 'pending')
      .maybeSingle();

    if (existingTransfer) {
      return new Response(
        JSON.stringify({ error: 'You already have a pending transfer request' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================
    // 6. Create player-initiated transfer request
    // ============================================
    const transferData = {
      player_id: player.id,
      old_team_id: player.team_id,
      old_team_name: player.teams?.name || '',
      old_team_logo: player.teams?.logo_url || '',
      new_team_id: new_team_id,
      new_team_name: newTeam.name,
      new_team_logo: newTeam.logo_url || '',
      player_name: `${player.first_name || ''} ${player.last_name || ''}`.trim(),
      player_photo: player.photo || '',
      reason: reason || null,
      status: 'pending',
      player_confirmed: null, // Player-initiated: no confirmation needed
      requested_by_team_id: null, // Player-initiated (not team)
      organization_id: playerOrgId,
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
    // 7. Success response
    // ============================================
    return new Response(
      JSON.stringify({
        success: true,
        transfer: newTransfer,
        message: 'Transfer request created successfully'
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in create-player-transfer function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
