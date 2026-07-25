import { supabase } from '../supabaseClient';

/**
 * Fetches all available leagues for an organization,
 * including own created leagues AND accepted co-hosted (collab) leagues.
 * Returns array of league objects with collab info and org logos.
 */
export async function getActiveOrgLeagues(orgId) {
  try {
    // 1. Fetch own created leagues
    const { data: ownLeagues } = await supabase
      .from('leagues')
      .select('*, organization:organization_id (id, name, logo_url)')
      .eq('organization_id', orgId);

    // 2. Fetch accepted collabs where current org is sender or receiver
    const [asReceiver, asSender] = await Promise.all([
      supabase
        .from('league_collabs')
        .select('*, league:league_id (*), sender_org:sender_org_id (id, name, logo_url), receiver_org:receiver_org_id (id, name, logo_url)')
        .eq('receiver_org_id', orgId)
        .eq('status', 'accepted'),
      supabase
        .from('league_collabs')
        .select('*, league:league_id (*), sender_org:sender_org_id (id, name, logo_url), receiver_org:receiver_org_id (id, name, logo_url)')
        .eq('sender_org_id', orgId)
        .eq('status', 'accepted')
    ]);

    const collabLeagues = [];
    const processCollab = (c) => {
      if (!c.league) return;
      collabLeagues.push({
        ...c.league,
        isCollab: true,
        org1: c.sender_org,
        org2: c.receiver_org,
      });
    };

    (asReceiver.data || []).forEach(processCollab);
    (asSender.data || []).forEach(processCollab);

    // Combine and remove duplicates by league ID or Name
    const map = new Map();
    (ownLeagues || []).forEach(l => map.set(l.name, { ...l, isCollab: false }));
    collabLeagues.forEach(l => map.set(l.name, l));

    return Array.from(map.values());
  } catch (err) {
    console.error('Error fetching org leagues:', err);
    return [];
  }
}
