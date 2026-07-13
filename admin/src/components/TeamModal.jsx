import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { X, Trash2, Save, Eye } from 'lucide-react';
import './Modal.css';

const TeamModal = ({ team, mode, onClose, onRefresh }) => {
  const [currentMode, setCurrentMode] = useState(mode);
  const [status, setStatus] = useState(team.status);
  const [loading, setLoading] = useState(false);

  // Form states for edit mode
  const [formData, setFormData] = useState({
    name: team.name || '',
    captain_phone: team.captain_phone || '',
    league: team.league || '',
    logo_url: team.logo_url || ''
  });

  const [uploadingImage, setUploadingImage] = useState(false);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `admin_edit_team_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const { error } = await supabase.storage.from('player-photos').upload(fileName, file);
      if (error) throw error;
      
      const { data } = supabase.storage.from('player-photos').getPublicUrl(fileName);
      setFormData(prev => ({...prev, logo_url: data.publicUrl}));
    } catch (error) {
      console.error(error);
      alert('Rasm yuklashda xatolik yuz berdi');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleStatusChange = async (newStatus) => {
    if (window.confirm("Jamoaning barcha o'yinchilari holati o'zgartiriladi. Tasdiqlaysizmi?")) {
      try {
        setStatus(newStatus);
        await supabase.from('teams').update({ status: newStatus }).eq('id', team.id);
        
        let pStatus = 'pending';
        if (newStatus === 'approved') pStatus = 'approved';
        if (newStatus === 'rejected') pStatus = 'rejected';
        
        await supabase.from('applications').update({ status: pStatus }).eq('team_id', team.id);
        
        onRefresh();
      } catch (error) {
        console.error(error);
        alert('Xatolik yuz berdi');
      }
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.from('teams').update(formData).eq('id', team.id);
      if (error) throw error;
      onRefresh();
      setCurrentMode('view');
    } catch (error) {
      console.error(error);
      alert('Xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm("Rostdan ham ushbu jamoani to'liq o'chirmoqchimisiz?")) {
      try {
        await supabase.from('teams').delete().eq('id', team.id);
        onRefresh();
        onClose();
      } catch (error) {
        console.error(error);
      }
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}><X size={24} /></button>
        
        {currentMode === 'view' ? (
          <div className="modal-view">
            <div className="modal-header-profile">
              <img src={team.logo_url} alt="Logo" className="modal-avatar team" onClick={() => window.openImageViewer(team.logo_url)} />
              <h2>{team.name}</h2>
              <p>{team.league || 'Liga tanlanmagan'}</p>
            </div>
            
            <div className="modal-details-grid">
              <div className="detail-item">
                <span className="label">Sardor:</span>
                <span className="value">{team.captain_name}</span>
              </div>
              <div className="detail-item">
                <span className="label">Telefon:</span>
                <span className="value">{team.captain_phone}</span>
              </div>
              <div className="detail-item">
                <span className="label">Viloyat:</span>
                <span className="value">{team.region}</span>
              </div>
            </div>
            
            {team.payment_receipt && (
              <div style={{ marginTop: '20px' }}>
                <span className="label" style={{display:'block', marginBottom: '10px'}}>To'lov cheki:</span>
                <img src={team.payment_receipt} style={{maxWidth: '100px', cursor:'pointer', borderRadius: '8px'}} onClick={() => window.openImageViewer(team.payment_receipt)} />
              </div>
            )}

            <div className="modal-actions mt-4">
              <select value={status} onChange={(e) => handleStatusChange(e.target.value)} className="status-select">
                <option value="pending">Kutilmoqda</option>
                <option value="approved">Tasdiqlash</option>
                <option value="rejected">Rad etish</option>
              </select>
              <button className="btn-edit" onClick={() => setCurrentMode('edit')}>Tahrirlash</button>
              <button className="btn-delete" onClick={handleDelete}><Trash2 size={18} /> O'chirish</button>
            </div>
          </div>
        ) : (
          <div className="modal-edit">
            <h2>Jamoani Tahrirlash</h2>
            <div className="edit-form-grid">
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Logotip (Yangi logotip yuklash)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  {formData.logo_url && <img src={formData.logo_url} alt="Preview" style={{ width: 50, height: 50, borderRadius: '50%', objectFit: 'cover' }} />}
                  <input type="file" accept="image/*" onChange={handleFileUpload} disabled={uploadingImage} />
                  {uploadingImage && <span style={{fontSize: 12, color: '#666'}}>Yuklanmoqda...</span>}
                </div>
              </div>
              <div className="form-group">
                <label>Jamoa nomi</label>
                <input name="name" value={formData.name} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Sardor telefoni</label>
                <input name="captain_phone" value={formData.captain_phone} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Liga</label>
                <input name="league" value={formData.league} onChange={handleChange} />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setCurrentMode('view')}>Bekor qilish</button>
              <button className="btn-save" onClick={handleSave} disabled={loading}>{loading ? 'Saqlanmoqda...' : 'Saqlash'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeamModal;

