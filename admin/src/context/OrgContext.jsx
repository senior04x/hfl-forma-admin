import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const OrgContext = createContext(null);

export const useOrg = () => {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used within OrgProvider');
  return ctx;
};

export const OrgProvider = ({ children }) => {
  const [currentOrg, setCurrentOrg] = useState(null);
  const [adminRole, setAdminRole] = useState(null); // 'super_admin' | 'org_admin'
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAdminOrg();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      loadAdminOrg();
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadAdminOrg = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setCurrentOrg(null);
        setAdminRole(null);
        setLoading(false);
        return;
      }

      // 1. Get role and orgId from user_metadata or admin_users
      const metaRole = user.user_metadata?.role;
      const metaOrgId = user.user_metadata?.organization_id;

      // 2. Fetch admin_users record if available
      const { data: adminData } = await supabase
        .from('admin_users')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      const effectiveRole = adminData?.role || metaRole || 'org_admin';
      const defaultOrgId = adminData?.organization_id || metaOrgId || 1;

      setAdminRole(effectiveRole);

      // Check if super_admin (or active admin) previously switched org saved in localStorage
      const savedOrgId = localStorage.getItem('hfl_active_org_id');
      const effectiveOrgId = (effectiveRole === 'super_admin' && savedOrgId) ? Number(savedOrgId) : defaultOrgId;

      // 3. Fetch organization details
      let { data: orgData } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', effectiveOrgId)
        .maybeSingle();

      if (!orgData && effectiveOrgId !== defaultOrgId) {
        const fallbackRes = await supabase.from('organizations').select('*').eq('id', defaultOrgId).maybeSingle();
        orgData = fallbackRes.data;
      }

      if (orgData) {
        setCurrentOrg(orgData);
      } else {
        if (effectiveRole === 'super_admin') {
          const { data: mainOrg } = await supabase.from('organizations').select('*').eq('id', 1).maybeSingle();
          setCurrentOrg(mainOrg || { id: 1, name: 'Havas Futbol Ligasi', logo_url: null });
        } else {
          setCurrentOrg({ id: effectiveOrgId, name: user.email ? user.email.split('@')[0] : 'Tashkilot', logo_url: null });
        }
      }
    } catch (err) {
      console.error('OrgContext load error:', err);
      setAdminRole('org_admin');
      setCurrentOrg(null);
    } finally {
      setLoading(false);
    }
  };

  const switchOrg = (orgOrId, name, logo_url) => {
    let targetOrg = null;
    if (typeof orgOrId === 'object' && orgOrId !== null) {
      targetOrg = orgOrId;
    } else {
      targetOrg = { id: orgOrId, name, logo_url };
    }
    setCurrentOrg(targetOrg);
    if (targetOrg && targetOrg.id) {
      localStorage.setItem('hfl_active_org_id', targetOrg.id);
    }
  };

  const updateCurrentOrg = (updatedFields) => {
    setCurrentOrg(prev => (prev ? { ...prev, ...updatedFields } : prev));
  };

  const isSuperAdmin = adminRole === 'super_admin';
  const orgId = currentOrg?.id || 1;

  return (
    <OrgContext.Provider value={{ currentOrg, orgId, adminRole, isSuperAdmin, loading, switchOrg, updateCurrentOrg }}>
      {children}
    </OrgContext.Provider>
  );
};

export default OrgContext;
