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
  const [organizationError, setOrganizationError] = useState('');

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
    setOrganizationError('');
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        if (requestId === requestRef.current) userIdRef.current = null;
        throw new Error('Admin session unavailable');
      }
      if (requestId !== requestRef.current) return;
      userIdRef.current = user.id;
      setSessionAvailable(true);
      // Organization administrators belong to organizations, not ecosystem admin_users.
      const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
      if (!email || !user.email_confirmed_at) throw new Error('ADMIN_BINDING_MISSING');
      const escapedEmail = email.replace(/[\\%_]/g, character => '\\' + character);
      const { data: organizations, error: orgError } = await supabase
        .from('organizations').select('*').ilike('admin_email', escapedEmail).limit(2);
      if (orgError) throw new Error('ORGANIZATION_LOOKUP_FAILED');
      if (!Array.isArray(organizations) || organizations.length !== 1) throw new Error('ADMIN_BINDING_MISSING');
      const orgData = organizations[0];
      const effectiveOrgId = parseOrganizationId(orgData.id);
      if (!effectiveOrgId || typeof orgData.admin_email !== 'string' || orgData.admin_email.toLowerCase() !== email) {
        throw new Error('ADMIN_ORGANIZATION_MISSING');
      }
      if (selectedOrgId !== undefined && parseOrganizationId(selectedOrgId) !== effectiveOrgId) {
        throw new Error('Organization selection unavailable');
      }
      if (requestId !== requestRef.current) return;
      setAdminRole('org_admin');
      setCurrentOrg(orgData);
      const colors = orgData.brand_colors || ['#00FF66', '#10B981'];
      setBrandColors(colors);
      document.documentElement.style.setProperty('--org-primary', colors[0] || '#00FF66');
      document.documentElement.style.setProperty('--org-gradient', colors.length > 1
        ? 'linear-gradient(135deg, ' + colors.join(', ') + ')' : colors[0] || '#00FF66');
    } catch (error) {
      if (requestId !== requestRef.current) return;
      setAdminRole(null);
      setCurrentOrg(null);
      const messages = {
        ADMIN_BINDING_MISSING: 'Hisobingiz uchun admin ruxsati topilmadi. Tizim egasi hisobingizni tegishli tashkilotga bog‘lashi kerak.',
        ADMIN_ORGANIZATION_MISSING: 'Admin hisobingizga tashkilot biriktirilmagan. Tizim egasi bog‘lanishni tekshirishi kerak.',
        ADMIN_LOOKUP_FAILED: 'Admin ruxsatini tekshirib bo‘lmadi. Internet yoki serverdagi kirish ruxsatini tekshiring.',
        ORGANIZATION_LOOKUP_FAILED: 'Hisobga biriktirilgan tashkilotni yuklab bo‘lmadi. Serverdagi kirish ruxsatini tekshiring.'
      };
      setOrganizationError(messages[error?.message] || 'Hisobingiz va tashkilot ruxsatini tekshiring.');
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
      organizationError,
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
