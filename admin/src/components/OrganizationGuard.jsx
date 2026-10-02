import React from 'react';
import { Navigate } from 'react-router-dom';
import { useOrg } from '../context/OrgContext';
import { supabase } from '../supabaseClient';

export default function OrganizationGuard({ children }) {
  const { loading, sessionAvailable, currentOrg, orgId, retryOrganization, gradientCSS } = useOrg();
  if (loading) return <div style={{ padding: 32, textAlign: 'center' }} role="status">Yuklanmoqda...</div>;
  if (!sessionAvailable) return <Navigate to="/login" replace />;
  if (currentOrg && orgId) return children;
  return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
    <section style={{ maxWidth: 440, textAlign: 'center' }}>
      <h2>Tashkilotingiz aniqlanmadi</h2>
      <p>Admin ma’lumotlariga kirish to‘xtatildi. Hisobingiz va tashkilot ruxsatini tekshiring.</p>
      <button onClick={retryOrganization} style={{ background: gradientCSS, padding: 12 }}>Qayta urinish</button>
      <button onClick={async () => { await supabase.auth.signOut(); window.location.assign('/login'); }} style={{ marginLeft: 12, padding: 12 }}>Hisobdan chiqish</button>
    </section>
  </div>;
}
