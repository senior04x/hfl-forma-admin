import React from 'react';
import { Navigate } from 'react-router-dom';
import { useOrg } from '../context/OrgContext';
import { supabase } from '../supabaseClient';

export default function OrganizationGuard({ children }) {
  const { loading, sessionAvailable, currentOrg, orgId, retryOrganization, gradientCSS, organizationError } = useOrg();
  if (loading) return <div style={{ padding: 32, textAlign: 'center' }} role="status">Yuklanmoqda...</div>;
  if (!sessionAvailable) return <Navigate to="/login" replace />;
  if (currentOrg && orgId) return children;
  return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#0b1018', color: '#f6f7fa' }}>
    <section role="alert" style={{ maxWidth: 440, textAlign: 'center', background: '#151b25', padding: 28, borderRadius: 16, border: '1px solid #303a48' }}>
      <h2>Tashkilotingiz aniqlanmadi</h2>
      <p style={{ color: '#cbd5e1', lineHeight: 1.6 }}>{organizationError || 'Hisobingiz va tashkilot ruxsatini tekshiring.'}</p>
      <button onClick={retryOrganization} style={{ background: gradientCSS, padding: 12 }}>Qayta urinish</button>
      <button onClick={async () => { await supabase.auth.signOut(); window.location.assign('/login'); }} style={{ marginLeft: 12, padding: 12 }}>Hisobdan chiqish</button>
    </section>
  </div>;
}
