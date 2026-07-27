import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useOrg } from '../context/OrgContext';
import { Upload, Trash2, Star, Award, Sparkles, ChevronDown, CheckCircle2, XCircle, Eye, EyeOff } from 'lucide-react';
import './Sponsors.css';

export default function Sponsors() {
  const { orgId, currentOrg } = useOrg();
  const [sponsors, setSponsors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedSponsors, setSelectedSponsors] = useState([]);
  const [mainSponsor, setMainSponsorState] = useState(null);

  const [leagues, setLeagues] = useState([]);
  const [showLeagueSettings, setShowLeagueSettings] = useState(false);
  const [showSponsorsSection, setShowSponsorsSection] = useState(true);

  useEffect(() => {
    fetchSponsors();
    fetchLeagues();
  }, [orgId]);

  const fetchLeagues = async () => {
    try {
      let data = null;
      if (orgId) {
        const { data: orgLeagues } = await supabase
          .from('leagues')
          .select('*')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: true });
        if (orgLeagues && orgLeagues.length > 0) {
          data = orgLeagues;
        }
      }
      if (!data) {
        let query = supabase.from('leagues').select('*').order('created_at', { ascending: true });
        if (orgId) {
          query = query.or(`organization_id.eq.${orgId},organization_id.is.null`);
        }
        const res = await query;
        data = res.data || [];
      }

      const processed = (data || []).map(l => {
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

      if (orgId) {
        const { data: orgSponsors } = await supabase
          .from('sponsors')
          .select('*')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false });
        loadedSponsors = orgSponsors || [];
      } else {
        const { data } = await supabase
          .from('sponsors')
          .select('*')
          .is('organization_id', null)
          .order('created_at', { ascending: false });
        loadedSponsors = data || [];
      }

      // Filter out system internal banner keys
      const realSponsors = loadedSponsors.filter(s => 
        s.name && 
        !s.name.startsWith('SCHEDULE_BANNER_') && 
        !s.name.startsWith('YT_BANNER_') && 
        !s.name.startsWith('YT_OAUTH_TOKENS_')
      );

      setSponsors(realSponsors);

      // 1. Restore main sponsor directly from DB
      const mainFromDb = realSponsors.find(s => s.is_main === true);
      if (mainFromDb) {
        setMainSponsorState(mainFromDb);
        try { localStorage.setItem(`hfl_main_sponsor_${orgId}`, JSON.stringify(mainFromDb)); } catch (e) {}
      } else {
        setMainSponsorState(null);
        try { localStorage.removeItem(`hfl_main_sponsor_${orgId}`); } catch (e) {}
      }

      // 2. Restore selected secondary sponsors directly from DB
      const selectedFromDb = realSponsors.filter(s => s.is_selected === true && !s.is_main);
      setSelectedSponsors(selectedFromDb);
      try { localStorage.setItem(`hfl_selectedSponsors_${orgId}`, JSON.stringify(selectedFromDb)); } catch (e) {}

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
            { name: file.name, logo_url: publicUrl, is_main: false, is_selected: true }
          ])
          .select();
        insertData = data;
      }

      if (insertData && insertData.length > 0) {
        const newSponsor = insertData[0];
        setSponsors(prev => [newSponsor, ...prev]);
        setSelectedSponsors(prev => [newSponsor, ...prev]);
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
    
    // Update local state
    setSponsors(prev => prev.map(s => {
      if (targetMain && s.id === targetMain.id) {
        return { ...s, is_main: true, is_selected: false };
      }
      return { ...s, is_main: false };
    }));

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
        await supabase.from('sponsors').update({ is_main: false }).eq('organization_id', orgId);
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

  const toggleSelectSponsor = async (sponsor, e) => {
    if (e) e.stopPropagation();
    if (mainSponsor?.id === sponsor.id) return;

    const currentSelected = !!sponsor.is_selected;
    const nextSelectedState = !currentSelected;

    // Update local sponsors state
    setSponsors(prev => prev.map(s => s.id === sponsor.id ? { ...s, is_selected: nextSelectedState } : s));

    // Update selectedSponsors array
    let newSelected = [];
    if (nextSelectedState) {
      newSelected = [...selectedSponsors.filter(s => s.id !== sponsor.id), { ...sponsor, is_selected: true }];
    } else {
      newSelected = selectedSponsors.filter(s => s.id !== sponsor.id);
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
      
      setSponsors(prev => prev.filter(s => s.id !== id));
      
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
      
      <div className="sponsors-content" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* League Sponsors Toggles Section */}
        {leagues.length > 0 && (
          <div style={{ background: 'rgba(255, 255, 255, 0.03)', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.08)', overflow: 'hidden' }}>
            <button 
              type="button"
              onClick={() => setShowLeagueSettings(!showLeagueSettings)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 24px',
                background: showLeagueSettings ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
                border: 'none',
                color: '#ffffff',
                fontWeight: '800',
                fontSize: '15px',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Sparkles size={22} style={{ color: '#00ff66' }} />
                <span>Ligalarda Homiy Ko'rinishi Sozlamalari</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', opacity: 0.6, color: showLeagueSettings ? '#00ff66' : '#ffffff' }}>
                  {showLeagueSettings ? 'Yopish' : 'Ochish'}
                </span>
                <ChevronDown size={20} style={{ transform: showLeagueSettings ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease', color: showLeagueSettings ? '#00ff66' : '#ffffff' }} />
              </div>
            </button>

            {showLeagueSettings && (
              <div style={{ padding: '24px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
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
                          justifyContent: 'space-between', 
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
          </div>
        )}

        {/* Sponsor Logos & Image Upload Section */}
        <div style={{ background: 'rgba(255, 255, 255, 0.03)', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.08)', overflow: 'hidden' }}>
          <button 
            type="button"
            onClick={() => setShowSponsorsSection(!showSponsorsSection)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 24px',
              background: showSponsorsSection ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
              border: 'none',
              color: '#ffffff',
              fontWeight: '800',
              fontSize: '15px',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Upload size={22} style={{ color: '#00ff66' }} />
              <span>Homiylar Rasmlari va Yangi Homiy Yuklash ({sponsors.length} ta homiy)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', opacity: 0.6, color: showSponsorsSection ? '#00ff66' : '#ffffff' }}>
                {showSponsorsSection ? 'Yopish' : 'Ochish'}
              </span>
              <ChevronDown size={20} style={{ transform: showSponsorsSection ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease', color: showSponsorsSection ? '#00ff66' : '#ffffff' }} />
            </div>
          </button>

          {showSponsorsSection && (
            <div style={{ padding: '24px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
              {/* Main Sponsor Direct Select Bar */}
              <div className="main-sponsor-quick-select-bar" style={{
                background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.15), rgba(202, 138, 4, 0.05))',
                border: '1.5px solid rgba(234, 179, 8, 0.4)',
                borderRadius: '14px',
                padding: '16px 20px',
                marginBottom: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContract: 'space-between',
                flexWrap: 'wrap',
                gap: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    background: 'rgba(234, 179, 8, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#eab308'
                  }}>
                    <Star size={24} fill="#eab308" />
                  </div>
                  <div>
                    <h3 style={{ margin: '0 0 2px 0', fontSize: '15px', color: '#fef08a', fontWeight: '800' }}>Tashkilot Bosh Homiysi</h3>
                    <p style={{ margin: 0, fontSize: '12px', color: 'rgba(255, 255, 255, 0.7)' }}>Yuqori o'ng burchakda turadigan asosiy homiyni tanlang:</p>
                  </div>
                </div>

                <div style={{ flex: 1, minWidth: '220px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <select 
                    value={mainSponsor?.id || ''} 
                    onChange={(e) => {
                      const selectedId = e.target.value;
                      if (!selectedId) {
                        handleSetMainSponsor(mainSponsor); // toggle off
                      } else {
                        const target = sponsors.find(s => String(s.id) === String(selectedId));
                        if (target) handleSetMainSponsor(target);
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      background: '#0b1221',
                      border: '1px solid rgba(234, 179, 8, 0.5)',
                      color: '#ffffff',
                      fontWeight: '700',
                      fontSize: '14px',
                      cursor: 'pointer',
                      outline: 'none'
                    }}
                  >
                    <option value="">-- Bosh homiy yo'q (Tanlanmagan) --</option>
                    {sponsors.map(s => (
                      <option key={s.id} value={s.id}>
                        ⭐ {s.name || `Homiy #${s.id}`} {mainSponsor?.id === s.id ? '(Bosh Homiy)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="upload-section-page" style={{ marginBottom: '24px' }}>
                <label className={`upload-btn-page ${uploading ? 'disabled' : ''}`}>
                  {uploading ? <><span className="btn-spinner"></span> Yuklanmoqda...</> : <><Upload size={18} /> Yangi homiy logotipini qo'shish</>}
                  <input type="file" accept="image/*" onChange={handleUpload} disabled={uploading} hidden />
                </label>
              </div>

              {loading ? (
                <div className="sponsors-grid-page">
                  {[1, 2, 3, 4, 5, 6].map(idx => (
                    <div key={idx} className="skeleton-pulse" style={{ height: '240px' }}></div>
                  ))}
                </div>
              ) : (
                <div className="sponsors-grid-page">
                  {sponsors.map(sponsor => {
                    const isMain = mainSponsor?.id === sponsor.id;
                    const isSelected = !isMain && (sponsor.is_selected !== false);

                    return (
                      <div 
                        key={sponsor.id} 
                        className={`sponsor-card-page ${isMain ? 'main-sponsor' : isSelected ? 'selected' : 'inactive'}`}
                      >
                        {isMain ? (
                          <div className="main-sponsor-badge">
                            <Star size={12} fill="#000" /> BOSH HOMIY
                          </div>
                        ) : (
                          <div className={`sponsor-status-badge ${isSelected ? 'active' : 'inactive'}`}>
                            {isSelected ? (
                              <><CheckCircle2 size={12} /> AKTIV</>
                            ) : (
                              <><XCircle size={12} /> NOFAOL</>
                            )}
                          </div>
                        )}

                        <div className="sponsor-img-container-page" onClick={(e) => toggleSelectSponsor(sponsor, e)}>
                          <img src={sponsor.logo_url} alt={sponsor.name || "Sponsor"} />
                        </div>

                        <div className="sponsor-name-tag">
                          {sponsor.name && !sponsor.name.startsWith('sponsor_') ? sponsor.name : 'Homiy logotipi'}
                        </div>

                        <div className="sponsor-actions-footer">
                          <button 
                            type="button"
                            className={`btn-toggle-main ${isMain ? 'is-main' : ''}`}
                            onClick={(e) => handleSetMainSponsor(sponsor, e)}
                            title={isMain ? "Bosh homiylikdan chiqarish" : "Tashkilot bosh homiysi qilib belgilash"}
                          >
                            <Star size={14} fill={isMain ? "#000" : "#fef08a"} /> 
                            {isMain ? "Bosh Homiy" : "Bosh Homiy Qilish"}
                          </button>

                          {!isMain && (
                            <button 
                              type="button"
                              className={`btn-toggle-active ${isSelected ? 'active' : 'inactive'}`}
                              onClick={(e) => toggleSelectSponsor(sponsor, e)}
                              title={isSelected ? "Nofaol qilish" : "Aktiv qilish"}
                            >
                              {isSelected ? <Eye size={14} /> : <EyeOff size={14} />} {isSelected ? "Aktiv" : "Nofaol"}
                            </button>
                          )}

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
          )}
        </div>
      </div>
    </div>
  );
}
