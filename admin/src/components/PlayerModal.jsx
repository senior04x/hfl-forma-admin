import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { X, Trash2, Save, Eye, Crop } from 'lucide-react';
import ImageCropperModal from './ImageCropperModal';
import DeleteConfirmModal from './DeleteConfirmModal';
import './Modal.css';

const PlayerModal = ({ player, mode, onClose, onRefresh }) => {
  const [currentMode, setCurrentMode] = useState(mode);
  const [status, setStatus] = useState(player.status);
  const [loading, setLoading] = useState(false);
  const [teams, setTeams] = useState([]);
  const [selectedLeague, setSelectedLeague] = useState('');
  const fileInputRef = useRef(null);

  // Cropper and Delete confirm states
  const [cropperRawImage, setCropperRawImage] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

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
      if (t && t.league) {
        const teamLeagues = t.league.split(',').map(s => s.trim()).filter(Boolean);
        if (teamLeagues.length > 0 && !teamLeagues.includes(selectedLeague)) {
          setSelectedLeague(teamLeagues[0]);
        }
      }
    }
  }, [player.team_id, teams]);

  const getInstaUsername = (p) => {
    if (p.instagram_username) return p.instagram_username;
    if (p.comment) {
      const match = p.comment.match(/\[INSTAGRAM:https?:\/\/[^/]+\/([^/\]]+)/);
      if (match?.[1]) return match[1];
    }
    return '';
  };

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
    team_id: player.team_id || '',
    instagram_username: getInstaUsername(player),
    citizenship: player.citizenship || '',
    height: player.height || '',
    weight: player.weight || ''
  });

  useEffect(() => {
    setFormData({
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
      team_id: player.team_id || '',
      instagram_username: getInstaUsername(player),
      citizenship: player.citizenship || '',
      height: player.height || '',
      weight: player.weight || ''
    });
  }, [player]);

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
    // 1. Immediately show cropped preview image
    setFormData(prev => ({ ...prev, photo_url: croppedBase64 }));
    setUploadingImage(true);
    setCropperRawImage(null);
    try {
      const response = await fetch(croppedBase64);
      const blob = await response.blob();
      const fileName = `player_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;

      const { error } = await supabase.storage.from('player-photos').upload(fileName, blob, {
        contentType: 'image/jpeg',
        upsert: true
      });
      if (error) throw error;

      const { data } = supabase.storage.from('player-photos').getPublicUrl(fileName);
      setFormData(prev => ({ ...prev, photo_url: data.publicUrl }));
    } catch (err) {
      console.error('Photo upload error:', err);
      alert('Rasm yuklashda xatolik yuz berdi: ' + (err.message || ''));
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

  const handleConfirmDelete = async () => {
    try {
      await supabase.from('applications').delete().eq('id', player.id);
      onRefresh();
      setShowDeleteModal(false);
      onClose();
    } catch (error) {
      console.error(error);
      alert("O'chirishda xatolik yuz berdi");
    }
  };

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
          <button className="close-btn" onClick={onClose}><X size={24} /></button>
          
          {currentMode === 'view' ? (
            <div className="modal-view">
              <div className="modal-header-profile">
                <img 
                  src={formData.photo_url || player.photo_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop'} 
                  alt="Profile" 
                  className="modal-avatar" 
                />
                <h2>{player.first_name} {player.last_name}</h2>
                <p>{player.phone || 'Telefon kiritilmagan'}</p>
                <p className="league-badge-text">
                  {teams.find(t => t.id === player.team_id)?.name || 'Yakkaxon'} 
                  {selectedLeague ? ` (${selectedLeague})` : ''}
                </p>
              </div>

              <div className="modal-details-grid">
                <div className="detail-item">
                  <span className="label">Pasport</span>
                  <span className="value">{player.passport_series || '—'} {player.passport_number || '—'}</span>
                </div>
                <div className="detail-item">
                  <span className="label">Tug'ilgan sana</span>
                  <span className="value">{player.birth_date || '—'}</span>
                </div>
                <div className="detail-item">
                  <span className="label">Pozitsiya</span>
                  <span className="value">{player.position || '—'}</span>
                </div>
                <div className="detail-item">
                  <span className="label">Raqam</span>
                  <span className="value">#{player.player_number || '—'}</span>
                </div>
                <div className="detail-item">
                  <span className="label">Instagram</span>
                  <span className="value" style={{ color: '#E1306C', fontWeight: '800' }}>
                    {getInstaUsername(player) ? `@${getInstaUsername(player)}` : '—'}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="label">Millati</span>
                  <span className="value">{player.citizenship || '—'}</span>
                </div>
                <div className="detail-item">
                  <span className="label">Bo'yi</span>
                  <span className="value">{player.height ? `${player.height} SM` : '—'}</span>
                </div>
                <div className="detail-item">
                  <span className="label">Vazni</span>
                  <span className="value">{player.weight ? `${player.weight} KG` : '—'}</span>
                </div>
              </div>

              <div className="modal-actions">
                <select 
                  className="status-select" 
                  value={status} 
                  onChange={(e) => handleStatusChange(e.target.value)}
                >
                  <option value="pending">Kutilmoqda</option>
                  <option value="approved">Tasdiqlandi</option>
                  <option value="rejected">Rad etildi</option>
                </select>
                <button className="btn-edit" onClick={() => setCurrentMode('edit')}>Tahrirlash</button>
                <button className="btn-delete" onClick={() => setShowDeleteModal(true)}><Trash2 size={16} /> O'chirish</button>
              </div>
            </div>
          ) : (
            <div className="modal-edit">
              <h2 className="modal-edit-title">O'yinchini Tahrirlash</h2>
              
              {/* Photo 1:1 Crop Section */}
              <div className="crop-photo-picker">
                <img 
                  src={formData.photo_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop'} 
                  alt="Avatar" 
                  className="crop-preview-avatar"
                />
                <button type="button" className="btn-crop-upload" onClick={() => fileInputRef.current?.click()}>
                  <Crop size={16} /> {uploadingImage ? 'Yuklanmoqda...' : "1:1 Rasm Almashtirish"}
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  accept="image/*" 
                  onChange={handleFileSelect} 
                  style={{ display: 'none' }} 
                />
              </div>

              <div className="edit-form-grid">
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
                  <input type="text" name="birth_date" value={formData.birth_date} onChange={handleChange} placeholder="masalan: 10.07.1991" />
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
                  >
                    <option value="">Ligani tanlang</option>
                    {Array.from(new Set(
                      teams
                        .flatMap(t => t.league ? t.league.split(',').map(s => s.trim()) : [])
                        .filter(Boolean)
                    )).sort().map(l => (
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
                  >
                    <option value="">Jamoani tanlang</option>
                    {teams.filter(t => t.league && t.league.split(',').map(s => s.trim()).includes(selectedLeague)).map(t => (
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

      {/* 1:1 Image Cropper Modal */}
      {cropperRawImage && (
        <ImageCropperModal
          isOpen={!!cropperRawImage}
          imageSrc={cropperRawImage}
          onSave={handleCroppedSave}
          onClose={() => setCropperRawImage(null)}
          title="O'yinchi Rasmini 1:1 Formatda Qirqish"
        />
      )}

      {/* 5s Countdown Delete Confirm Modal */}
      <DeleteConfirmModal
        isOpen={showDeleteModal}
        title="O'yinchini o'chirish"
        message="O'chirsangiz o'yinchining barcha ma'lumotlari o'chib ketadi!"
        onConfirm={handleConfirmDelete}
        onClose={() => setShowDeleteModal(false)}
      />
    </>
  );
};

export default PlayerModal;
