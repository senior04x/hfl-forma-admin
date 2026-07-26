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

  const [leagues, setLeagues] = useState([]);

  useEffect(() => {
    fetchSponsors();
    fetchLeagues();
  }, [orgId]);

  const fetchLeagues = async () => {
    try {
      let query = supabase.from('leagues').select('*').order('created_at', { ascending: true });
      if (orgId) {
        query = query.or(`organization_id.eq.${orgId},organization_id.is.null`);
      }
      const { data, error } = await query;
      if (!error && data) {
        const processed = data.map(l => {
          let showSponsorsVal = l.show_sponsors;
          if (showSponsorsVal === undefined || showSponsorsVal === null) {
            const savedLocal = localStorage.getItem(`hfl_league_show_sponsors_${l.id}`) || localStorage.getItem(`hfl_league_show_sponsors_${l.name}`);
            showSponsorsVal = savedLocal !== 'false';
          }
          return {
            ...l,
            show_sponsors: showSponsorsVal !== false
          };
        });
        setLeagues(processed);
      }
    } catch (e) {
      console.error('Error fetching leagues in Sponsors:', e);
    }
  };

  const toggleLeagueSponsors = async (league) => {
    const nextVal = !league.show_sponsors;
    setLeagues(prev => prev.map(l => l.id === league.id ? { ...l, show_sponsors: nextVal } : l));

    try {
      localStorage.setItem(`hfl_league_show_sponsors_${league.id}`, String(nextVal));
      localStorage.setItem(`hfl_league_show_sponsors_${league.name}`, String(nextVal));

      await supabase
        .from('leagues')
        .update({ show_sponsors: nextVal })
        .eq('id', league.id);
    } catch (e) {
      console.error('Error toggling league sponsors:', e);
    }
  };

  const fetchSponsors = async () => {
    setLoading(true);
    try {
      let loadedSponsors = [];

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
        const { data } = await supabase.from('sponsors').select('*').order('created_at', { ascending: false });
        loadedSponsors = data || [];
      }
      
      setSponsors(loadedSponsors);

      // 1. Restore main sponsor directly from DB
      const mainFromDb = loadedSponsors.find(s => s.is_main === true);
      if (mainFromDb) {
        setMainSponsorState(mainFromDb);
        try { localStorage.setItem(`hfl_main_sponsor_${orgId}`, JSON.stringify(mainFromDb)); } catch (e) {}
      } else {
        try {
          const savedMain = localStorage.getItem(`hfl_main_sponsor_${orgId}`);
          if (savedMain) setMainSponsorState(JSON.parse(savedMain));
          else setMainSponsorState(null);
        } catch (e) {
          setMainSponsorState(null);
        }
      }

      // 2. Restore selected secondary sponsors directly from DB
      const selectedFromDb = loadedSponsors.filter(s => s.is_selected === true && !s.is_main);
      if (selectedFromDb.length > 0) {
        setSelectedSponsors(selectedFromDb);
        try { localStorage.setItem(`hfl_selectedSponsors_${orgId}`, JSON.stringify(selectedFromDb)); } catch (e) {}
      } else {
        try {
          const savedSelected = localStorage.getItem(`hfl_selectedSponsors_${orgId}`);
          if (savedSelected) {
            setSelectedSponsors(JSON.parse(savedSelected));
          } else {
            // Default to all non-main sponsors
            const nonMain = loadedSponsors.filter(s => !s.is_main);
            setSelectedSponsors(nonMain);
          }
        } catch (e) {
          const nonMain = loadedSponsors.filter(s => !s.is_main);
          setSelectedSponsors(nonMain);
        }
      }

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
            { name: file.name, logo_url: publicUrl, organization_id: orgId, is_main: false, is_selected: true }
          ])
          .select();
        if (error) throw error;
        insertData = data;
      } catch (e) {
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
        setSelectedSponsors([insertData[0], ...selectedSponsors]);
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
      try { localStorage.setItem(`hfl_main_sponsor_${orgId}`, JSON.stringify(targetMain)); } catch (e) {}
      const filteredSelected = selectedSponsors.filter(s => s.id !== targetMain.id);
      setSelectedSponsors(filteredSelected);
      try { localStorage.setItem(`hfl_selectedSponsors_${orgId}`, JSON.stringify(filteredSelected)); } catch (e) {}
    } else {
      try { localStorage.removeItem(`hfl_main_sponsor_${orgId}`); } catch (e) {}
    }

    try {
      if (orgId) {
        await supabase.from('sponsors').update({ is_main: false }).or(`organization_id.eq.${orgId},organization_id.is.null`);
      } else {
        await supabase.from('sponsors').update({ is_main: false }).is('organization_id', null);
      }

      if (targetMain) {
        await supabase.from('sponsors').update({ is_main: true, is_selected: false }).eq('id', targetMain.id);
      }
    } catch (e) {
      console.error("Error updating main sponsor in DB:", e);
    }
  };

  const toggleSelectSponsor = async (sponsor) => {
    if (mainSponsor?.id === sponsor.id) return;

    const isSelected = selectedSponsors.some(s => s.id === sponsor.id);
    const nextSelectedState = !isSelected;

    let newSelected = [];
    if (isSelected) {
      newSelected = selectedSponsors.filter(s => s.id !== sponsor.id);
    } else {
      newSelected = [...selectedSponsors, sponsor];
    }
    setSelectedSponsors(newSelected);
    try { localStorage.setItem(`hfl_selectedSponsors_${orgId}`, JSON.stringify(newSelected)); } catch (e) {}

    try {
      await supabase.from('sponsors').update({ is_selected: nextSelectedState }).eq('id', sponsor.id);
    } catch (e) {
      console.error("Error updating is_selected in DB:", e);
    }
  };

  const [deletingId, setDeletingId] = useState(null);

  const handleDelete = async (e, id, logoUrl) => {
    e.stopPropagation();
    if (!window.confirm("Haqiqatan ham ushbu homiyni o'chirmoqchimisiz?")) return;
    
    setDeletingId(id);
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
    } finally {
      setDeletingId(null);
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
        {/* League Sponsors Toggles Section */}
        {leagues.length > 0 && (
          <div style={{ marginBottom: '30px', background: 'rgba(255, 255, 255, 0.03)', padding: '24px', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <Sparkles size={22} style={{ color: '#00ff66' }} />
              <h2 style={{ color: '#ffffff', fontSize: '18px', fontWeight: '800', margin: 0 }}>Ligalarda Homiy Ko'rinishi Sozlamasi</h2>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', margin: '0 0 20px 0', lineHeight: '1.5' }}>
              ⭐ <b>Bosh Homiy</b> har doim barcha ligalar shablonlarida (yuqori o'ng burchakda) ko'rinaveradi.<br />
              👇 Quyidagi ligalar ro'yxatidan pastki <b>qolgan homiylar stripini</b> ko'rsatish yoki yashirishni tanlang:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
              {leagues.map(league => {
                const isShow = league.show_sponsors !== false;
                return (
                  <div 
                    key={league.id} 
                    onClick={() => toggleLeagueSponsors(league)}
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justify: 'space-between', 
                      padding: '14px 18px', 
                      borderRadius: '12px', 
                      background: isShow ? 'rgba(0, 255, 102, 0.08)' : 'rgba(255, 255, 255, 0.03)', 
                      border: isShow ? '1px solid rgba(0, 255, 102, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      boxShadow: isShow ? '0 0 15px rgba(0, 255, 102, 0.1)' : 'none'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {league.logo_url && (
                        <img src={league.logo_url} alt={league.name} style={{ width: '32px', height: '32px', objectFit: 'contain' }} />
                      )}
                      <span style={{ color: '#ffffff', fontWeight: '700', fontSize: '15px' }}>{league.name}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '12px', fontWeight: '800', color: isShow ? '#00ff66' : 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {isShow ? 'YONIQLIK' : 'O\'CHIQ'}
                      </span>
                      <input 
                        type="checkbox" 
                        checked={isShow} 
                        onChange={() => {}} 
                        style={{ width: '20px', height: '20px', accentColor: '#00ff66', cursor: 'pointer' }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="upload-section-page">
          <label className={`upload-btn-page ${uploading ? 'disabled' : ''}`}>
            {uploading ? <><span className="btn-spinner"></span> Yuklanmoqda...</> : <><Upload size={18} /> Yangi homiy logotipini qo'shish</>}
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
                    <img src={sponsor.logo_url} alt={sponsor.name || "Sponsor"} />
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
                      disabled={deletingId === sponsor.id}
                      title="O'chirish"
                    >
                      {deletingId === sponsor.id ? <span className="btn-spinner"></span> : <Trash2 size={16} />}
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
