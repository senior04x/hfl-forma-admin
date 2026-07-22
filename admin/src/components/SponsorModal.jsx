import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { X, Upload, Trash2, CheckCircle } from 'lucide-react';
import './SponsorModal.css';

const SponsorModal = ({ isOpen, onClose, selectedSponsors, onSelectSponsors }) => {
  const [sponsors, setSponsors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [localSelected, setLocalSelected] = useState([]);

  useEffect(() => {
    if (isOpen) {
      fetchSponsors();
      setLocalSelected(selectedSponsors || []);
    }
  }, [isOpen, selectedSponsors]);

  const fetchSponsors = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('sponsors').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setSponsors(data || []);
    } catch (err) {
      console.error("Error fetching sponsors:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('sponsors')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('sponsors')
        .getPublicUrl(filePath);

      const publicUrl = publicUrlData.publicUrl;

      const { data: insertData, error: insertError } = await supabase.from('sponsors').insert([
        { name: file.name, logo_url: publicUrl }
      ]).select();

      if (insertError) throw insertError;

      if (insertData && insertData.length > 0) {
        setSponsors([insertData[0], ...sponsors]);
      }
    } catch (err) {
      console.error("Error uploading sponsor:", err);
      alert("Xatolik yuz berdi: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (e, id, logoUrl) => {
    e.stopPropagation();
    if (!window.confirm("Haqiqatan ham ushbu homiyni o'chirmoqchimisiz?")) return;
    
    try {
      const fileName = logoUrl.split('/').pop();
      if (fileName) {
        await supabase.storage.from('sponsors').remove([fileName]);
      }
      
      const { error } = await supabase.from('sponsors').delete().eq('id', id);
      if (error) throw error;
      
      setSponsors(sponsors.filter(s => s.id !== id));
      setLocalSelected(localSelected.filter(s => s.id !== id));
    } catch (err) {
      console.error("Error deleting sponsor:", err);
    }
  };

  const toggleSelect = (sponsor) => {
    const isSelected = localSelected.find(s => s.id === sponsor.id);
    if (isSelected) {
      setLocalSelected(localSelected.filter(s => s.id !== sponsor.id));
    } else {
      setLocalSelected([...localSelected, sponsor]);
    }
  };

  const handleSave = () => {
    onSelectSponsors(localSelected);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="sponsor-modal-overlay">
      <div className="sponsor-modal-content">
        <div className="sponsor-modal-header">
          <h3>Homiylarni Boshqarish</h3>
          <button onClick={onClose} className="close-btn"><X size={20} /></button>
        </div>
        
        <div className="sponsor-modal-body">
          <div className="upload-section">
            <label className="upload-btn">
              {uploading ? "Yuklanmoqda..." : <><Upload size={16} /> Yangi homiy qo'shish</>}
              <input type="file" accept="image/*" onChange={handleUpload} disabled={uploading} hidden />
            </label>
          </div>

          {loading ? (
            <div className="loading-state">Kutilmoqda...</div>
          ) : (
            <div className="sponsors-grid">
              {sponsors.map(sponsor => {
                const isSelected = localSelected.some(s => s.id === sponsor.id);
                return (
                  <div 
                    key={sponsor.id} 
                    className={`sponsor-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggleSelect(sponsor)}
                  >
                    <div className="sponsor-img-container">
                      <img src={sponsor.logo_url} alt="Sponsor" />
                    </div>
                    {isSelected && <div className="sponsor-check"><CheckCircle size={24} color="#10b981" /></div>}
                    <button className="sponsor-delete-btn" onClick={(e) => handleDelete(e, sponsor.id, sponsor.logo_url)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
              {sponsors.length === 0 && (
                <div className="empty-state">Homiylar topilmadi. Tizimga rasm yuklang.</div>
              )}
            </div>
          )}
        </div>

        <div className="sponsor-modal-footer">
          <button className="btn-cancel" onClick={onClose}>Bekor qilish</button>
          <button className="btn-save" onClick={handleSave}>Saqlash ({localSelected.length} ta tanlandi)</button>
        </div>
      </div>
    </div>
  );
};

export default SponsorModal;
