import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Upload, Trash2, CheckCircle } from 'lucide-react';
import './Sponsors.css';

export default function Sponsors() {
  const [sponsors, setSponsors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [localSelected, setLocalSelected] = useState([]);

  useEffect(() => {
    fetchSponsors();
    try {
      const saved = localStorage.getItem('hfl_selectedSponsors');
      if (saved) {
        setLocalSelected(JSON.parse(saved));
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

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
      
      // Also remove from selected if it was selected
      const newSelected = localSelected.filter(s => s.id !== id);
      setLocalSelected(newSelected);
      localStorage.setItem('hfl_selectedSponsors', JSON.stringify(newSelected));
      
    } catch (err) {
      console.error("Error deleting sponsor:", err);
    }
  };

  const toggleSelect = (sponsor) => {
    let newSelected = [];
    const isSelected = localSelected.find(s => s.id === sponsor.id);
    if (isSelected) {
      newSelected = localSelected.filter(s => s.id !== sponsor.id);
    } else {
      newSelected = [...localSelected, sponsor];
    }
    setLocalSelected(newSelected);
    localStorage.setItem('hfl_selectedSponsors', JSON.stringify(newSelected));
  };

  return (
    <div className="sponsors-page">
      <div className="sponsors-header">
        <h1>Homiylarni Boshqarish</h1>
        <p>Bu yerdan tanlangan homiylar barcha jadvallar ostida avtomatik ko'rinadi (7x7 ligadan tashqari).</p>
      </div>
      
      <div className="sponsors-content">
        <div className="upload-section-page">
          <label className="upload-btn-page">
            {uploading ? "Yuklanmoqda..." : <><Upload size={18} /> Yangi homiy rasm qo'shish</>}
            <input type="file" accept="image/*" onChange={handleUpload} disabled={uploading} hidden />
          </label>
        </div>

        {loading ? (
          <div className="loading-state">Kutilmoqda...</div>
        ) : (
          <div className="sponsors-grid-page">
            {sponsors.map(sponsor => {
              const isSelected = localSelected.some(s => s.id === sponsor.id);
              return (
                <div 
                  key={sponsor.id} 
                  className={`sponsor-card-page ${isSelected ? 'selected' : ''}`}
                  onClick={() => toggleSelect(sponsor)}
                >
                  <div className="sponsor-img-container-page">
                    <img src={sponsor.logo_url} alt="Sponsor" crossOrigin="anonymous" />
                  </div>
                  {isSelected && <div className="sponsor-check-page"><CheckCircle size={28} color="#10b981" fill="#fff" /></div>}
                  <button className="sponsor-delete-btn-page" onClick={(e) => handleDelete(e, sponsor.id, sponsor.logo_url)}>
                    <Trash2 size={18} />
                  </button>
                </div>
              );
            })}
            {sponsors.length === 0 && (
              <div className="empty-state-page">Homiylar topilmadi. Tizimga rasm yuklang.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
