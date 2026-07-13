import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { X, Trash2, Save, Eye } from 'lucide-react';
import './Modal.css';

const PlayerModal = ({ player, mode, onClose, onRefresh }) => {
  const [currentMode, setCurrentMode] = useState(mode);
  const [status, setStatus] = useState(player.status);
  const [loading, setLoading] = useState(false);

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
    player_number: player.player_number || ''
  });

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
