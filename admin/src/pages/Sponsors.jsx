import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useOrg } from '../context/OrgContext';
import { Upload, Trash2, CheckCircle, Star, Award, Sparkles } from 'lucide-react';
import './Sponsors.css';

export default function Sponsors() {
  const { orgId, currentOrg } = useOrg();
  const [sponsors, setSponsors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedSponsors, setSelectedSponsors] = useState([]);
  const [mainSponsor, setMainSponsorState] = useState(null);

  useEffect(() => {
    fetchSponsors();
  }, [orgId]);

  const fetchSponsors = async () => {
    setLoading(true);
    try {
      let loadedSponsors = [];

      // 1. Try fetching with organization_id filter
      try {
        let query = supabase.from('sponsors').select('*').order('created_at', { ascending: false });
        if (orgId) {
          query = query.or(`organization_id.eq.${orgId},organization_id.is.null`);
        }
        const { data, error } = await query;
        if (!error && data) {
          loadedSponsors = data;
        } else {
          throw error;
        }
      } catch (err) {
        // Fallback if organization_id column doesn't exist yet in Supabase
        const { data } = await supabase.from('sponsors').select('*').order('created_at', { ascending: false });
        loadedSponsors = data || [];
      }
      
      setSponsors(loadedSponsors);

      // Restore main sponsor
      const mainFromDb = loadedSponsors.find(s => s.is_main === true);
      if (mainFromDb) {
        setMainSponsorState(mainFromDb);
        localStorage.setItem(`hfl_main_sponsor_${orgId}`, JSON.stringify(mainFromDb));
      } else {
        try {
          const savedMain = localStorage.getItem(`hfl_main_sponsor_${orgId}`);
          if (savedMain) setMainSponsorState(JSON.parse(savedMain));
        } catch (e) {}
      }

      // Restore selected secondary sponsors
      try {
        const savedSelected = localStorage.getItem(`hfl_selectedSponsors_${orgId}`);
        if (savedSelected) {
          setSelectedSponsors(JSON.parse(savedSelected));
        }
      } catch (e) {}

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
      const fileName = `sponsor_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('sponsors')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('sponsors')
        .getPublicUrl(filePath);

      const publicUrl = publicUrlData.publicUrl;

      let insertData = null;
      try {
        const { data, error } = await supabase
          .from('sponsors')
          .insert([
            { name: file.name, logo_url: publicUrl, organization_id: orgId, is_main: false }
          ])
          .select();
        if (error) throw error;
        insertData = data;
      } catch (e) {
        // Fallback insert without organization_id/is_main columns if DB not migrated yet
        const { data } = await supabase
          .from('sponsors')
          .insert([
            { name: file.name, logo_url: publicUrl }
          ])
          .select();
        insertData = data;
      }

      if (insertData && insertData.length > 0) {
        setSponsors([insertData[0], ...sponsors]);
      }
    } catch (err) {
      console.error("Error uploading sponsor:", err);
      alert("Xatolik yuz berdi: " + (err.message || ''));
    } finally {
      setUploading(false);
    }
  };

  const handleSetMainSponsor = async (sponsor, e) => {
    if (e) e.stopPropagation();

    const isCurrentMain = mainSponsor?.id === sponsor.id;
    const targetMain = isCurrentMain ? null : sponsor;

    setMainSponsorState(targetMain);
    if (targetMain) {
      localStorage.setItem(`hfl_main_sponsor_${orgId}`, JSON.stringify(targetMain));
    } else {
      localStorage.removeItem(`hfl_main_sponsor_${orgId}`);
    }

    // Try updating DB columns if available
    try {
      await supabase.from('sponsors').update({ is_main: false }).eq('organization_id', orgId);
      if (targetMain) {
        await supabase.from('sponsors').update({ is_main: true }).eq('id', targetMain.id);
      }
    } catch (e) {}
  };

  const toggleSelectSponsor = (sponsor) => {
    let newSelected = [];
    const isSelected = selectedSponsors.some(s => s.id === sponsor.id);
    if (isSelected) {
      newSelected = selectedSponsors.filter(s => s.id !== sponsor.id);
    } else {
      newSelected = [...selectedSponsors, sponsor];
    }
    setSelectedSponsors(newSelected);
    localStorage.setItem(`hfl_selectedSponsors_${orgId}`, JSON.stringify(newSelected));
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
      
      if (mainSponsor?.id === id) {
        setMainSponsorState(null);
        localStorage.removeItem(`hfl_main_sponsor_${orgId}`);
      }

      const newSelected = selectedSponsors.filter(s => s.id !== id);
      setSelectedSponsors(newSelected);
      localStorage.setItem(`hfl_selectedSponsors_${orgId}`, JSON.stringify(newSelected));
      
    } catch (err) {
      console.error("Error deleting sponsor:", err);
    }
  };

  return (
    <div className="sponsors-page">
      <div className="sponsors-header">
        <div>
          <div className="sponsors-title-box">
            <Award size={26} className="sponsors-title-icon" />
            <h1>Homiylar va Bosh Homiy Boshqaruvi</h1>
          </div>
          <p>Tashkilot ({currentOrg?.name || 'Asosiy'}) uchun Bosh Homiy (yuqori o'ng burchak logotipi) va jadval osti homiylarini belgilash.</p>
        </div>
      </div>
      
      <div className="sponsors-content">
        <div className="upload-section-page">
          <label className="upload-btn-page">
            {uploading ? "Yuklanmoqda..." : <><Upload size={18} /> Yangi homiy logotipini qo'shish</>}
            <input type="file" accept="image/*" onChange={handleUpload} disabled={uploading} hidden />
          </label>
        </div>

        {loading ? (
          <div className="sponsors-grid-page">
            {[1, 2, 3, 4, 5, 6].map(idx => (
              <div key={idx} className="skeleton-pulse" style={{ height: '200px' }}></div>
            ))}
          </div>
        ) : (
          <div className="sponsors-grid-page">
            {sponsors.map(sponsor => {
              const isMain = mainSponsor?.id === sponsor.id;
              const isSelected = selectedSponsors.some(s => s.id === sponsor.id);

              return (
                <div 
                  key={sponsor.id} 
                  className={`sponsor-card-page ${isMain ? 'main-sponsor' : isSelected ? 'selected' : ''}`}
                  onClick={() => toggleSelectSponsor(sponsor)}
                >
                  {isMain && (
                    <div className="main-sponsor-badge">
                      <Star size={12} fill="#000" /> BOSH HOMIY
                    </div>
                  )}

                  <div className="sponsor-img-container-page">
                    <img src={sponsor.logo_url} alt="Sponsor" crossOrigin="anonymous" />
                  </div>

                  <div className="sponsor-actions-footer">
                    <button 
                      type="button"
                      className="btn-toggle-main" 
                      onClick={(e) => handleSetMainSponsor(sponsor, e)}
                      title={isMain ? "Bosh homiylikdan chiqarish" : "Tashkilot bosh homiysi qilib belgilash"}
                    >
                      <Star size={14} fill={isMain ? "#fef08a" : "none"} /> {isMain ? "Bosh Homiy" : "Bosh Homiy qilish"}
                    </button>
                    <button 
                      type="button"
                      className="sponsor-delete-btn-page" 
                      onClick={(e) => handleDelete(e, sponsor.id, sponsor.logo_url)}
                      title="O'chirish"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}

            {sponsors.length === 0 && (
              <div className="empty-state-page">
                <Sparkles size={32} style={{ marginBottom: '12px', color: '#00ff66' }} />
                <p>Hali bu tashkilot uchun homiylar kiritilmagan. Yuqoridagi tugma orqali yangi homiy yuklang.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
