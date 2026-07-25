import React, { useState, useEffect } from 'react';
import { supabase, supabaseAdmin } from '../supabaseClient';
import { Building2, Plus, Pencil, Trash2, X, Check, Globe, Mail, Lock, Eye, EyeOff, ShieldAlert, AlertTriangle } from 'lucide-react';
import './Organizations.css';

const generateRandomCode = (length = 8) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const Organizations = () => {
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingOrg, setEditingOrg] = useState(null);
  const [formData, setFormData] = useState({ name: '', slug: '', logo_url: '', admin_email: '', admin_password: '' });
  const [stats, setStats] = useState({});
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingOrg, setDeletingOrg] = useState(null);
  const [confirmCode, setConfirmCode] = useState('');
  const [userInputCode, setUserInputCode] = useState('');
  const [deletingLoading, setDeletingLoading] = useState(false);

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
    setFormData({ name: org.name, slug: org.slug, logo_url: org.logo_url || '', admin_email: '', admin_password: '' });
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
        const { error } = await supabase
          .from('organizations')
          .update({ name: formData.name, slug: formData.slug, logo_url: formData.logo_url || null })
          .eq('id', editingOrg.id);
        if (error) { alert('Xato: ' + error.message); return; }
      } else {
        if (!formData.admin_email.trim() || !formData.admin_password.trim()) {
          alert('Admin email va parolni kiriting!');
          return;
        }
        if (formData.admin_password.length < 6) {
          alert('Parol kamida 6 ta belgidan iborat bo\'lishi kerak!');
          return;
        }

        const { data: newOrg, error: orgError } = await supabase
          .from('organizations')
          .insert({ name: formData.name, slug: formData.slug, logo_url: formData.logo_url || null })
          .select()
          .single();
        if (orgError) { alert('Tashkilot yaratishda xato: ' + orgError.message); return; }

        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: formData.admin_email.trim(),
          password: formData.admin_password,
          email_confirm: true,
          user_metadata: { role: 'org_admin', organization_id: newOrg.id }
        });
        if (authError) { 
          await supabase.from('organizations').delete().eq('id', newOrg.id);
          alert('Admin akkaunt yaratishda xato: ' + authError.message); 
          return; 
        }

        if (authData.user) {
          await supabase.from('admin_users').insert({
            id: authData.user.id,
            email: formData.admin_email.trim(),
            role: 'org_admin',
            organization_id: newOrg.id,
          });
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

  const openDeleteModal = (org) => {
    if (org.id === 1) {
      alert('Asosiy tashkilotni o\'chirish mumkin emas!');
      return;
    }
    const code = generateRandomCode(8);
    setDeletingOrg(org);
    setConfirmCode(code);
    setUserInputCode('');
    setDeleteModalOpen(true);
  };

  const confirmDeleteOrganization = async () => {
    if (!deletingOrg || userInputCode.trim().toUpperCase() !== confirmCode) return;
    setDeletingLoading(true);

    try {
      const orgId = deletingOrg.id;
      const { data: adminUsers } = await supabase.from('admin_users').select('id').eq('organization_id', orgId);
      if (adminUsers && adminUsers.length > 0) {
        for (const admin of adminUsers) {
          await supabaseAdmin.auth.admin.deleteUser(admin.id).catch(() => {});
        }
        await supabase.from('admin_users').delete().eq('organization_id', orgId);
      }

      await supabase.from('league_collabs').delete().or(`sender_org_id.eq.${orgId},receiver_org_id.eq.${orgId}`);
      await supabase.from('leagues').delete().eq('organization_id', orgId);
      await supabase.from('applications').delete().eq('organization_id', orgId);
      await supabase.from('matches').delete().eq('organization_id', orgId);
      await supabase.from('teams').delete().eq('organization_id', orgId);

      const { error: deleteOrgErr } = await supabase.from('organizations').delete().eq('id', orgId);
      if (deleteOrgErr) throw deleteOrgErr;

      setDeleteModalOpen(false);
      setDeletingOrg(null);
      fetchOrganizations();
    } catch (err) {
      alert('O\'chirishda xatolik: ' + err.message);
    } finally {
      setDeletingLoading(false);
    }
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
                    <button className="org-action-btn org-action-delete" onClick={() => openDeleteModal(org)} title="O'chirish">
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

      {/* Security Confirmation Delete Modal */}
      {deleteModalOpen && deletingOrg && (
        <div className="org-modal-overlay" onClick={() => setDeleteModalOpen(false)}>
          <div className="org-modal org-delete-modal" onClick={e => e.stopPropagation()}>
            <div className="org-delete-header">
              <div className="org-delete-icon">
                <ShieldAlert size={26} />
              </div>
              <h2>Tashkilotni O'chirish</h2>
              <button className="org-modal-close" onClick={() => setDeleteModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="org-delete-body">
              <div className="org-delete-warning">
                <AlertTriangle size={16} />
                <span>Ushbu harakat <strong>qaytarib bo'lmaydi!</strong> Tashkilot va unga tegishli barcha jamoa, o'yinchi hamda ligalar o'chiriladi.</span>
              </div>

              <p className="org-delete-target">
                O'chirilayotgan tashkilot: <strong>"{deletingOrg.name}"</strong>
              </p>

              <div className="org-delete-code-box">
                <label>Tasdiqlash uchun ushbu 8 xonali kodni kiriting:</label>
                <div className="org-delete-code-badge">{confirmCode}</div>
                <input
                  type="text"
                  className="org-delete-input"
                  placeholder="Kodni kiriting..."
                  value={userInputCode}
                  onChange={e => setUserInputCode(e.target.value.toUpperCase())}
                  maxLength={8}
                  autoFocus
                />
              </div>
            </div>

            <div className="org-modal-footer">
              <button className="org-btn-cancel" onClick={() => setDeleteModalOpen(false)}>Bekor qilish</button>
              <button
                className="org-btn-danger"
                onClick={confirmDeleteOrganization}
                disabled={userInputCode.trim().toUpperCase() !== confirmCode || deletingLoading}
              >
                <Trash2 size={16} />
                <span>{deletingLoading ? "O'chirilmoqda..." : "O'chirish"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Organizations;
