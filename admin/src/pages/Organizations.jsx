import React, { useState, useEffect } from 'react';
import { supabase, supabaseAdmin } from '../supabaseClient';
import { Building2, Plus, Pencil, Trash2, X, Check, Globe, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import './Organizations.css';

const Organizations = () => {
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingOrg, setEditingOrg] = useState(null);
  const [formData, setFormData] = useState({ name: '', slug: '', logo_url: '', admin_email: '', admin_password: '' });
  const [stats, setStats] = useState({});
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    fetchOrganizations();
  }, []);

  const fetchOrganizations = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .order('id');

    if (!error && data) {
      setOrganizations(data);
      // Har bir tashkilot uchun statistika olish
      const statsMap = {};
      for (const org of data) {
        const [teamsRes, playersRes, matchesRes] = await Promise.all([
          supabase.from('teams').select('id', { count: 'exact', head: true }).eq('organization_id', org.id),
          supabase.from('applications').select('id', { count: 'exact', head: true }).eq('organization_id', org.id),
          supabase.from('matches').select('id', { count: 'exact', head: true }).eq('organization_id', org.id),
        ]);
        statsMap[org.id] = {
          teams: teamsRes.count || 0,
          players: playersRes.count || 0,
          matches: matchesRes.count || 0,
        };
      }
      setStats(statsMap);
    }
    setLoading(false);
  };

  const openCreateModal = () => {
    setEditingOrg(null);
    setFormData({ name: '', slug: '', logo_url: '', admin_email: '', admin_password: '' });
    setShowPassword(false);
    setShowModal(true);
  };

  const openEditModal = (org) => {
    setEditingOrg(org);
    setFormData({ name: org.name, slug: org.slug, logo_url: org.logo_url || '' });
    setShowModal(true);
  };

  const generateSlug = (name) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  };

  const handleNameChange = (val) => {
    setFormData(prev => ({
      ...prev,
      name: val,
      slug: editingOrg ? prev.slug : generateSlug(val)
    }));
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.slug.trim()) return;
    setSaving(true);

    try {
      if (editingOrg) {
        // Tahrirlash rejimi — faqat tashkilot ma'lumotlarini yangilash
        const { error } = await supabase
          .from('organizations')
          .update({ name: formData.name, slug: formData.slug, logo_url: formData.logo_url || null })
          .eq('id', editingOrg.id);
        if (error) { alert('Xato: ' + error.message); return; }
      } else {
        // Yangi tashkilot yaratish + Admin akkaunt
        if (!formData.admin_email.trim() || !formData.admin_password.trim()) {
          alert('Admin email va parolni kiriting!');
          return;
        }
        if (formData.admin_password.length < 6) {
          alert('Parol kamida 6 ta belgidan iborat bo\'lishi kerak!');
          return;
        }

        // 1. Tashkilotni bazaga kiritish
        const { data: newOrg, error: orgError } = await supabase
          .from('organizations')
          .insert({ name: formData.name, slug: formData.slug, logo_url: formData.logo_url || null })
          .select()
          .single();
        if (orgError) { alert('Tashkilot yaratishda xato: ' + orgError.message); return; }

        // 2. Supabase Auth Admin API orqali admin foydalanuvchi yaratish (auto-confirm email, current session is preserved)
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: formData.admin_email.trim(),
          password: formData.admin_password,
          email_confirm: true,
          user_metadata: { role: 'org_admin', organization_id: newOrg.id }
        });
        if (authError) { 
          // Revert created org if auth user creation fails
          await supabase.from('organizations').delete().eq('id', newOrg.id);
          alert('Admin akkaunt yaratishda xato: ' + authError.message); 
          return; 
        }

        // 3. admin_users jadvaliga yozish
        if (authData.user) {
          const { error: adminUserErr } = await supabase.from('admin_users').insert({
            id: authData.user.id,
            email: formData.admin_email.trim(),
            role: 'org_admin',
            organization_id: newOrg.id,
          });
          if (adminUserErr) {
            console.error('admin_users insert error:', adminUserErr);
          }
        }
      }
      setShowModal(false);
      fetchOrganizations();
    } catch (err) {
      alert('Kutilmagan xato: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (org) => {
    if (org.id === 1) {
      alert('Asosiy tashkilotni o\'chirish mumkin emas!');
      return;
    }
    const orgStats = stats[org.id] || {};
    if ((orgStats.teams || 0) > 0 || (orgStats.players || 0) > 0) {
      alert(`"${org.name}" tashkilotida hali ${orgStats.teams} ta jamoa va ${orgStats.players} ta o'yinchi bor. Avval ularni o'chiring.`);
      return;
    }
    if (!window.confirm(`"${org.name}" tashkilotini o'chirmoqchimisiz?`)) return;

    await supabase.from('organizations').delete().eq('id', org.id);
    fetchOrganizations();
  };

  if (loading) {
    return (
      <div className="org-loading">
        <div className="org-spinner"></div>
        <p>Tashkilotlar yuklanmoqda...</p>
      </div>
    );
  }

  return (
    <div className="organizations-page">
      <div className="org-header">
        <div className="org-header-left">
          <Building2 size={28} />
          <div>
            <h1>Tashkilotlar</h1>
            <p>Barcha tashkilotlarni boshqaring va kuzating</p>
          </div>
        </div>
        <button className="org-add-btn" onClick={openCreateModal}>
          <Plus size={18} />
          <span>Yangi tashkilot</span>
        </button>
      </div>

      <div className="org-grid">
        {organizations.map(org => {
          const orgStats = stats[org.id] || {};
          return (
            <div key={org.id} className={`org-card ${org.id === 1 ? 'org-card-primary' : ''}`}>
              <div className="org-card-header">
                <div className="org-card-avatar">
                  {org.logo_url ? (
                    <img src={org.logo_url} alt={org.name} />
                  ) : (
                    <Building2 size={28} />
                  )}
                </div>
                <div className="org-card-actions">
                  <button className="org-action-btn" onClick={() => openEditModal(org)} title="Tahrirlash">
                    <Pencil size={14} />
                  </button>
                  {org.id !== 1 && (
                    <button className="org-action-btn org-action-delete" onClick={() => handleDelete(org)} title="O'chirish">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              <h3 className="org-card-name">{org.name}</h3>
              <div className="org-card-slug">
                <Globe size={12} />
                <span>{org.slug}</span>
              </div>

              <div className="org-card-stats">
                <div className="org-stat">
                  <span className="org-stat-value">{orgStats.teams || 0}</span>
                  <span className="org-stat-label">Jamoalar</span>
                </div>
                <div className="org-stat">
                  <span className="org-stat-value">{orgStats.players || 0}</span>
                  <span className="org-stat-label">O'yinchilar</span>
                </div>
                <div className="org-stat">
                  <span className="org-stat-value">{orgStats.matches || 0}</span>
                  <span className="org-stat-label">O'yinlar</span>
                </div>
              </div>

              {org.id === 1 && (
                <div className="org-card-badge">ASOSIY TASHKILOT</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="org-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="org-modal" onClick={e => e.stopPropagation()}>
            <div className="org-modal-header">
              <h2>{editingOrg ? 'Tashkilotni tahrirlash' : 'Yangi tashkilot yaratish'}</h2>
              <button className="org-modal-close" onClick={() => setShowModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="org-modal-body">
              <div className="org-form-group">
                <label>Tashkilot nomi</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => handleNameChange(e.target.value)}
                  placeholder="Masalan: Farg'ona Futbol Ligasi"
                />
              </div>
              <div className="org-form-group">
                <label>Slug (URL identifikatori)</label>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={e => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                  placeholder="masalan: fergana-league"
                />
              </div>
              <div className="org-form-group">
                <label>Logo URL (ixtiyoriy)</label>
                <input
                  type="text"
                  value={formData.logo_url}
                  onChange={e => setFormData(prev => ({ ...prev, logo_url: e.target.value }))}
                  placeholder="https://example.com/logo.png"
                />
              </div>

              {!editingOrg && (
                <>
                  <div className="org-form-divider">
                    <span>Admin hisob ma'lumotlari</span>
                  </div>
                  <div className="org-form-group">
                    <label><Mail size={12} style={{marginRight: 4, verticalAlign: 'middle'}} />Admin Email</label>
                    <input
                      type="email"
                      value={formData.admin_email}
                      onChange={e => setFormData(prev => ({ ...prev, admin_email: e.target.value }))}
                      placeholder="admin@tashkilot.uz"
                    />
                  </div>
                  <div className="org-form-group">
                    <label><Lock size={12} style={{marginRight: 4, verticalAlign: 'middle'}} />Admin Parol</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={formData.admin_password}
                        onChange={e => setFormData(prev => ({ ...prev, admin_password: e.target.value }))}
                        placeholder="Kamida 6 belgi"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="org-modal-footer">
              <button className="org-btn-cancel" onClick={() => setShowModal(false)}>Bekor qilish</button>
              <button className="org-btn-save" onClick={handleSave} disabled={saving}>
                <Check size={16} />
                <span>{saving ? 'Saqlanmoqda...' : (editingOrg ? 'Saqlash' : 'Yaratish')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Organizations;
