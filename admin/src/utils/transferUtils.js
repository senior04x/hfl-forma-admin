import { supabase } from '../supabaseClient';

export const isTransferWindowOpen = async (orgId) => {
  try {
    const targetOrgId = orgId || 1;
    const { data, error } = await supabase
      .from('organizations')
      .select('transfer_window_open')
      .eq('id', targetOrgId)
      .maybeSingle();

    if (error) {
      console.error('Error checking transfer window:', error);
      return false;
    }

    if (!data) return false;
    return !!data.transfer_window_open;
  } catch (err) {
    console.error('Error in isTransferWindowOpen:', err);
    return false;
  }
};
