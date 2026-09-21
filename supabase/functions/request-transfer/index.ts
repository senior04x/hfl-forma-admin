// Edge Function: request-transfer
// Purpose: Create team-initiated transfer request with security validation
// Called by: Team captain from client site (after OTP verification)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

interface TransferRequest {
  player_id: string;
  captain_phone: string; // OTP-verified phone from client
  new_team_id: string; // Team requesting the player
  reason: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Parse request body
    const { player_id, captain_phone, new_team_id, reason }: TransferRequest = await req.json();

    // Validate required fields
    if (!player_id || !captain_phone || !new_team_id || !reason) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with service role (bypasses RLS)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // ============================================
    // 1. Verify captain authorization
    // ============================================
    // Captain must be the one who requested (phone matches team captain_phone)
    const cleanPhone = captain_phone.replace(/\D/g, '').slice(-9);

    const { data: requestingTeam, error: teamError } = await supabaseAdmin
      .from('teams')
      .select('id, name, organization_id, captain_phone')
      .eq('id', new_team_id)
      .single();

    if (teamError || !requestingTeam) {
      return new Response(
        JSON.stringify({ error: 'Requesting team not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify captain phone matches
    const teamCaptainPhone = requestingTeam.captain_phone?.replace(/\D/g, '').slice(-9);
    if (teamCaptainPhone !== cleanPhone) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Not the team captain' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================
    // 2. Verify player is in another team
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
    // 3. Verify transfer window is open
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
    // 4. Check for existing pending transfer
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
    // 5. Create transfer request
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
    // 6. Success response
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
