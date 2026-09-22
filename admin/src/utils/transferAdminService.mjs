export const TRANSFER_PAGE_SIZE = 30;
const columns = 'id,created_at,player_id,player_name,player_photo,old_team_id,old_team_name,old_team_logo,new_team_id,new_team_name,new_team_logo,reason,status,organization_id,requested_by_team_id';

export async function loadAdminTransfers(client, orgId, filter, page) {
  let query = client.from('transfers').select(columns).eq('organization_id', orgId);
  if (filter !== 'all') query = query.eq('status', filter);
  const start = page * TRANSFER_PAGE_SIZE;
  const { data, error } = await query.order('created_at', { ascending: false })
    .order('id', { ascending: false }).range(start, start + TRANSFER_PAGE_SIZE);
  if (error) throw error;
  return { items: (data || []).slice(0, TRANSFER_PAGE_SIZE), hasMore: data?.length > TRANSFER_PAGE_SIZE };
}

// A single status UPDATE runs the DB membership/career trigger transaction.
// Status matching rejects stale admin screens; SELECT detects RLS/no-row results.
export async function saveAdminTransfer(client, orgId, transfer, changes) {
  const { data, error } = await client.from('transfers').update(changes)
    .eq('id', transfer.id).eq('organization_id', orgId).eq('status', transfer.status)
    .select('id').single();
  if (error) throw error;
  if (!data) throw new Error('Transfer was not updated');
}

export async function deleteAdminTransfer(client, orgId, transfer) {
  const { data, error } = await client.from('transfers').delete()
    .eq('id', transfer.id).eq('organization_id', orgId).eq('status', transfer.status)
    .select('id').single();
  if (error) throw error;
  if (!data) throw new Error('Transfer was not deleted');
}
