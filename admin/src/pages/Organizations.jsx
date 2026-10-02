import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Building2, Plus, Pencil, Trash2, X, Check, Globe, Mail, Lock, Eye, EyeOff, ShieldAlert, AlertTriangle, Crop } from 'lucide-react';
import ImageCropperModal from '../components/ImageCropperModal';
import { submitOrganizationProvisioning, submitOrganizationUpdate } from '../utils/organizationProvisioning';
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
  const savingRef = useRef(false);
  const provisioningAttempt = useRef(null);

  // Cropper states
  const fileInputRef = useRef(null);
  const [cropperRawImage, setCropperRawImage] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingOrg, setDeletingOrg] = useState(null);

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
    provisioningAttempt.current = null;
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

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCropperRawImage(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleCroppedSave = async (croppedBase64) => {
    setUploadingImage(true);
    setCropperRawImage(null);
    try {
      const response = await fetch(croppedBase64);
      const blob = await response.blob();
      const fileName = `org_logo_${Date.now()}_${Math.random().toString(36).substring(7)}.png`;

      const { error } = await supabase.storage.from('player-photos').upload(fileName, blob, {
        contentType: 'image/png',
        upsert: true
      });
      if (error) throw error;

      const { data } = supabase.storage.from('player-photos').getPublicUrl(fileName);
      setFormData(prev => ({ ...prev, logo_url: data.publicUrl }));
    } catch (err) {
      console.error('Logo upload error:', err);
      alert('Rasm yuklashda xatolik yuz berdi: ' + (err.message || ''));
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async () => {
    if (savingRef.current || !formData.name.trim() || !formData.slug.trim()) return;
    savingRef.current = true;
    setSaving(true);

    try {
      if (editingOrg) {
        await submitOrganizationUpdate(supabase, {
          organizationId: editingOrg.id, name: formData.name.trim(), slug: formData.slug.trim(), logoUrl: formData.logo_url || null,
          expected: { name: editingOrg.name, slug: editingOrg.slug, logoUrl: editingOrg.logo_url || null },
        });
      } else {
        if (!formData.admin_email.trim() || !formData.admin_password.trim()) {
          alert('Admin email va parolni kiriting!');
          return;
        }
        if (formData.admin_password.length < 12 || formData.admin_password.length > 128) {
          alert('Parol 12–128 ta belgidan iborat bo‘lishi kerak!');
          return;
        }

        const payload = { name: formData.name.trim(), slug: formData.slug.trim(),
          email: formData.admin_email.trim().toLowerCase(), logoUrl: formData.logo_url || null };
        const fingerprint = JSON.stringify(payload); // No password in retry metadata.
        if (provisioningAttempt.current && provisioningAttempt.current.fingerprint !== fingerprint) {
          alert('Avvalgi so‘rov natijasini tekshirmasdan ma’lumotlarni o‘zgartirmang.');
          return;
        }
        provisioningAttempt.current ??= { fingerprint, requestId: crypto.randomUUID() };
        await submitOrganizationProvisioning(supabase, { ...payload,
          requestId: provisioningAttempt.current.requestId, password: formData.admin_password });
      }
      setShowModal(false);
      setFormData(prev => ({ ...prev, admin_password: '' }));
      fetchOrganizations();
    } catch (err) {
      alert('Kutilmagan xato: ' + err.message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const openDeleteModal = (org) => {
    if (org.id === 1) {
      alert('Asosiy tashkilotni o\'chirish mumkin emas!');
      return;
    }
    setDeletingOrg(org);
    setDeleteModalOpen(true);
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

              {/* Logo Crop Upload Picker */}
              <div className="org-form-group">
                <label>Tashkilot logotipi</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '6px' }}>
                  <div style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '12px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    flexShrink: 0
                  }}>
                    {formData.logo_url ? (
                      <img src={formData.logo_url} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <Building2 size={24} style={{ color: 'rgba(255,255,255,0.4)' }} />
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImage}
                    style={{
                      padding: '10px 16px',
                      background: 'rgba(0, 170, 255, 0.12)',
                      border: '1px solid rgba(0, 170, 255, 0.3)',
                      color: '#00aaff',
                      borderRadius: '10px',
                      fontWeight: '600',
                      fontSize: '13px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <Crop size={16} />
                    <span>{uploadingImage ? 'Yuklanmoqda...' : (formData.logo_url ? 'Logotipni almashtirish' : 'Logotip tanlash (1:1)')}</span>
                  </button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleFileSelect}
                  />
                </div>
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
                        placeholder="Kamida 12 belgi"
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

      {/* Image Cropper Modal */}
      {cropperRawImage && (
        <ImageCropperModal
          isOpen={!!cropperRawImage}
          imageSrc={cropperRawImage}
          onClose={() => setCropperRawImage(null)}
          onSave={handleCroppedSave}
          title="Tashkilot Logotipini 1:1 Qirqish"
        />
      )}

      {/* Destructive actions blocked until server workflow is reviewed */}
      {deleteModalOpen && deletingOrg && (
        <div className="org-modal-overlay" onClick={() => setDeleteModalOpen(false)}>
          <div className="org-modal org-delete-modal" onClick={e => e.stopPropagation()}>
            <div className="org-delete-header">
              <div className="org-delete-icon">
                <ShieldAlert size={26} />
              </div>
              <h2>O‘chirish vaqtincha yopiq</h2>
              <button className="org-modal-close" onClick={() => setDeleteModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="org-delete-body">
              <div className="org-delete-warning">
                <AlertTriangle size={16} />
                <span>Ma’lumotlarni himoyalash uchun tashkilotni o‘chirish vaqtincha yopiq. Xavfsiz server jarayoni va zaxira nusxa tekshirilgach yoqiladi.</span>
              </div>

              <p className="org-delete-target">
                Tashkilot: <strong>"{deletingOrg.name}"</strong>
              </p>

              <p>Hech qanday ma’lumot o‘chirilmaydi.</p>
            </div>

            <div className="org-modal-footer">
              <button className="org-btn-cancel" onClick={() => setDeleteModalOpen(false)}>Tushunarli</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Organizations;
