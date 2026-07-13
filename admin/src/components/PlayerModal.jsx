import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { X, Trash2, Save, Eye } from 'lucide-react';
import './Modal.css';

const PlayerModal = ({ player, mode, onClose, onRefresh }) => {
  const [currentMode, setCurrentMode] = useState(mode);
  const [status, setStatus] = useState(player.status);
  const [loading, setLoading] = useState(false);

  const [teams, setTeams] = useState([]);
  const [selectedLeague, setSelectedLeague] = useState('');

  useEffect(() => {
    const fetchTeams = async () => {
      const { data } = await supabase.from('teams').select('id, name, league');
      if (data) setTeams(data);
    };
    fetchTeams();
  }, []);

  useEffect(() => {
    if (player.team_id && teams.length > 0) {
      const t = teams.find(t => t.id === player.team_id);
      if (t) setSelectedLeague(t.league);
    }
  }, [player.team_id, teams]);

  // Form states for edit mode
  const [formData, setFormData] = useState({
    first_name: player.first_name || '',
    last_name: player.last_name || '',
    father_name: player.father_name || '',
    phone: player.phone || '',
    passport_series: player.passport_series || '',
    passport_number: player.passport_number || '',
    birth_date: player.birth_date || '',
    position: player.position || '',
    player_number: player.player_number || '',
    photo_url: player.photo_url || '',
    team_id: player.team_id || ''
  });

  const [uploadingImage, setUploadingImage] = useState(false);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `admin_edit_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const { error } = await supabase.storage.from('player-photos').upload(fileName, file);
      if (error) throw error;
      
      const { data } = supabase.storage.from('player-photos').getPublicUrl(fileName);
      setFormData(prev => ({...prev, photo_url: data.publicUrl}));
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
    try {
      setStatus(newStatus);
      const { error } = await supabase.from('applications').update({ status: newStatus }).eq('id', player.id);
      if (error) throw error;
      onRefresh();
    } catch (error) {
      console.error(error);
      alert('Xatolik yuz berdi');
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.from('applications').update(formData).eq('id', player.id);
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
    if (window.confirm("Rostdan ham o'chirmoqchimisiz?")) {
      try {
        await supabase.from('applications').delete().eq('id', player.id);
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
              <img src={player.photo_url} alt="Profile" className="modal-avatar" onClick={() => window.openImageViewer(player.photo_url)} />
              <h2>{player.first_name} {player.last_name} {player.father_name}</h2>
              <p>{player.phone || 'Telefon kiritilmagan'}</p>
              {teams.length > 0 && player.team_id ? (() => {
                const pTeam = teams.find(t => t.id === player.team_id);
                return pTeam ? (
                  <p style={{ marginTop: '5px', fontSize: '14px', fontWeight: 'bold', color: '#3b82f6' }}>
                    {pTeam.name} ({pTeam.league || 'Liga yo\'q'})
                  </p>
                ) : null;
              })() : null}
            </div>
            
            <div className="modal-details-grid">
              <div className="detail-item">
                <span className="label">Pasport:</span>
                <span className="value">{player.passport_series} {player.passport_number}</span>
              </div>
              <div className="detail-item">
                <span className="label">Tug'ilgan sana:</span>
                <span className="value">{player.birth_date}</span>
              </div>
              <div className="detail-item">
                <span className="label">Pozitsiya:</span>
                <span className="value">{player.position}</span>
              </div>
              <div className="detail-item">
                <span className="label">Raqam:</span>
                <span className="value">{player.player_number}</span>
              </div>
            </div>

            <div className="modal-actions">
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
            <h2>O'yinchini Tahrirlash</h2>
            <div className="edit-form-grid">
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Rasm (Yangi rasm yuklash)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  {formData.photo_url && <img src={formData.photo_url} alt="Preview" style={{ width: 50, height: 50, borderRadius: '50%', objectFit: 'cover' }} />}
                  <input type="file" accept="image/*" onChange={handleFileUpload} disabled={uploadingImage} />
                  {uploadingImage && <span style={{fontSize: 12, color: '#666'}}>Yuklanmoqda...</span>}
                </div>
              </div>
              <div className="form-group">
                <label>Ism</label>
                <input name="first_name" value={formData.first_name} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Familiya</label>
                <input name="last_name" value={formData.last_name} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Otasining ismi</label>
                <input name="father_name" value={formData.father_name} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Telefon</label>
                <input name="phone" value={formData.phone} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Pasport seriya</label>
                <input name="passport_series" value={formData.passport_series} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Pasport raqam</label>
                <input name="passport_number" value={formData.passport_number} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Tug'ilgan sana</label>
                <input type="date" name="birth_date" value={formData.birth_date} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Pozitsiya</label>
                <input name="position" value={formData.position} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Raqam</label>
                <input type="number" name="player_number" value={formData.player_number} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Liga</label>
                <select 
                  value={selectedLeague} 
                  onChange={(e) => {
                    setSelectedLeague(e.target.value);
                    setFormData({...formData, team_id: ''});
                  }}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none' }}
                >
                  <option value="">Ligani tanlang</option>
                  {[...new Set(teams.map(t => t.league).filter(Boolean))].map(l => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Jamoa</label>
                <select 
                  name="team_id" 
                  value={formData.team_id} 
                  onChange={handleChange}
                  disabled={!selectedLeague}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none' }}
                >
                  <option value="">Jamoani tanlang</option>
                  {teams.filter(t => t.league === selectedLeague).map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
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

export default PlayerModal;
