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
        if (adminData.role === 'super_admin') {
          // Super admin — barcha tashkilotlarni ko'radi, default Havas (ID=1)
          setCurrentOrg({ id: adminData.organization_id || 1, name: adminData.organizations?.name || 'Havas Futbol Ligasi' });
        } else {
          // Oddiy admin — faqat o'z tashkilotini ko'radi
          setCurrentOrg({ id: adminData.organization_id, name: adminData.organizations?.name || 'Tashkilot' });
        }
      } else {
        // admin_users da yo'q — eski admin hisoblanadi, Havas (ID=1) ga biriktirish
        setAdminRole('super_admin');
        setCurrentOrg({ id: 1, name: 'Havas Futbol Ligasi' });
      }
    } catch (err) {
      console.error('OrgContext load error:', err);
      setAdminRole('super_admin');
      setCurrentOrg({ id: 1, name: 'Havas Futbol Ligasi' });
    } finally {
      setLoading(false);
    }
  };

  const switchOrg = (orgId, orgName) => {
    setCurrentOrg({ id: orgId, name: orgName });
  };

  const isSuperAdmin = adminRole === 'super_admin';
  const orgId = currentOrg?.id || 1;

  return (
    <OrgContext.Provider value={{ currentOrg, orgId, adminRole, isSuperAdmin, loading, switchOrg }}>
      {children}
    </OrgContext.Provider>
  );
};

export default OrgContext;
