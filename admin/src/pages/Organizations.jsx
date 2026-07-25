import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Building2, Plus, Pencil, Trash2, X, Check, Globe } from 'lucide-react';
import './Organizations.css';

const Organizations = () => {
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingOrg, setEditingOrg] = useState(null);
  const [formData, setFormData] = useState({ name: '', slug: '', logo_url: '' });
  const [stats, setStats] = useState({});

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
    setFormData({ name: '', slug: '', logo_url: '' });
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

    if (editingOrg) {
      const { error } = await supabase
        .from('organizations')
        .update({ name: formData.name, slug: formData.slug, logo_url: formData.logo_url || null })
        .eq('id', editingOrg.id);
      if (error) {
        alert('Xato: ' + error.message);
        return;
      }
    } else {
      const { error } = await supabase
        .from('organizations')
        .insert({ name: formData.name, slug: formData.slug, logo_url: formData.logo_url || null });
      if (error) {
        alert('Xato: ' + error.message);
        return;
      }
    }
    setShowModal(false);
    fetchOrganizations();
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
            </div>

            <div className="org-modal-footer">
              <button className="org-btn-cancel" onClick={() => setShowModal(false)}>Bekor qilish</button>
              <button className="org-btn-save" onClick={handleSave}>
                <Check size={16} />
                <span>{editingOrg ? 'Saqlash' : 'Yaratish'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Organizations;
