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

      // admin_users jadvalidan admin ma'lumotlarini olish
      const { data: adminData } = await supabase
        .from('admin_users')
        .select('*, organizations(*)')
        .eq('id', user.id)
        .single();

      if (adminData) {
        setAdminRole(adminData.role);
        const orgObj = adminData.organizations || {};
        const targetOrgId = adminData.organization_id || 1;

        if (adminData.role === 'super_admin') {
          // Super admin — fetch target org details
          const { data: targetOrg } = await supabase.from('organizations').select('*').eq('id', targetOrgId).single();
          setCurrentOrg(targetOrg || { id: 1, name: 'Havas Futbol Ligasi', logo_url: null });
        } else {
          // Org admin
          setCurrentOrg({
            id: orgObj.id || targetOrgId,
            name: orgObj.name || 'Tashkilot',
            logo_url: orgObj.logo_url || null
          });
        }
      } else {
        // Fallback for primary admin
        const { data: defaultOrg } = await supabase.from('organizations').select('*').eq('id', 1).single();
        setAdminRole('super_admin');
        setCurrentOrg(defaultOrg || { id: 1, name: 'Havas Futbol Ligasi', logo_url: null });
      }
    } catch (err) {
      console.error('OrgContext load error:', err);
      setAdminRole('super_admin');
      setCurrentOrg({ id: 1, name: 'Havas Futbol Ligasi', logo_url: null });
    } finally {
      setLoading(false);
    }
  };

  const switchOrg = (orgOrId, name, logo_url) => {
    if (typeof orgOrId === 'object' && orgOrId !== null) {
      setCurrentOrg(orgOrId);
    } else {
      setCurrentOrg({ id: orgOrId, name, logo_url });
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
