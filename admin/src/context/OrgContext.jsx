import { parseOrganizationId } from '../utils/organizationId';
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
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
  const [brandColors, setBrandColors] = useState(['#00FF66', '#10B981']);
  const [loading, setLoading] = useState(true);
  const requestRef = useRef(0);
  const userIdRef = useRef(null);
  const [sessionAvailable, setSessionAvailable] = useState(false);

  useEffect(() => {
    loadAdminOrg();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || event === 'USER_UPDATED' || session?.user?.id !== userIdRef.current) {
        loadAdminOrg();
      }
    });

    return () => { requestRef.current += 1; subscription.unsubscribe(); };
  }, []);

  const loadAdminOrg = async (selectedOrgId) => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setCurrentOrg(null);
    setAdminRole(null);
    setSessionAvailable(false);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        if (requestId === requestRef.current) userIdRef.current = null;
        throw new Error('Admin session unavailable');
      }
      if (requestId !== requestRef.current) return;
      userIdRef.current = user.id;
      setSessionAvailable(true);
      const { data: adminData, error: adminError } = await supabase
        .from('admin_users').select('id,role,organization_id').eq('id', user.id).maybeSingle();
      if (adminError || !adminData || adminData.id !== user.id || !['org_admin', 'super_admin'].includes(adminData.role)) {
        throw new Error('Admin identity unavailable');
      }
      const defaultOrgId = parseOrganizationId(adminData.organization_id);
      const savedOrgId = selectedOrgId === undefined
        ? parseOrganizationId(localStorage.getItem('hfl_active_org_id'))
        : parseOrganizationId(selectedOrgId);
      if (selectedOrgId !== undefined && (adminData.role !== 'super_admin' || !savedOrgId)) {
        throw new Error('Organization selection unavailable');
      }
      const effectiveOrgId = adminData.role === 'super_admin' && savedOrgId ? savedOrgId : defaultOrgId;
      if (!effectiveOrgId) throw new Error('Organization unresolved');
      const { data: orgData, error: orgError } = await supabase
        .from('organizations').select('*').eq('id', effectiveOrgId).maybeSingle();
      if (orgError || !orgData || parseOrganizationId(orgData.id) !== effectiveOrgId) {
        throw new Error('Organization unavailable');
      }
      if (requestId !== requestRef.current) return;
      setAdminRole(adminData.role);
      setCurrentOrg(orgData);
      if (adminData.role === 'super_admin') localStorage.setItem('hfl_active_org_id', String(effectiveOrgId));
      const colors = orgData.brand_colors || ['#00FF66', '#10B981'];
      setBrandColors(colors);
      document.documentElement.style.setProperty('--org-primary', colors[0] || '#00FF66');
      document.documentElement.style.setProperty('--org-gradient', colors.length > 1
        ? 'linear-gradient(135deg, ' + colors.join(', ') + ')' : colors[0] || '#00FF66');
    } catch {
      if (requestId !== requestRef.current) return;
      setAdminRole(null);
      setCurrentOrg(null);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  };

  const switchOrg = (orgOrId) => {
    if (adminRole !== 'super_admin') return;
    const id = parseOrganizationId(typeof orgOrId === 'object' && orgOrId !== null ? orgOrId.id : orgOrId);
    if (id) loadAdminOrg(id);
  };

  const updateCurrentOrg = (updatedFields) => {
    setCurrentOrg(prev => (prev ? { ...prev, ...updatedFields } : prev));
  };

  const isSuperAdmin = adminRole === 'super_admin';
  const orgId = parseOrganizationId(currentOrg?.id);
  const primaryColor = brandColors[0] || '#00FF66';
  const gradientCSS = brandColors.length > 1
    ? `linear-gradient(135deg, ${brandColors.join(', ')})`
    : primaryColor;

  return (
    <OrgContext.Provider value={{
      currentOrg,
      orgId,
      adminRole,
      isSuperAdmin,
      brandColors,
      primaryColor,
      gradientCSS,
      loading,
      sessionAvailable,
      switchOrg,
      updateCurrentOrg,
      retryOrganization: () => loadAdminOrg()
    }}>
      {children}
    </OrgContext.Provider>
  );
};

export default OrgContext;
