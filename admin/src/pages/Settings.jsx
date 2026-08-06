import React, { useState, useEffect, useRef } from 'react';
import { supabase, supabaseAdmin } from '../supabaseClient';
import { useOrg } from '../context/OrgContext';
import { Settings as SettingsIcon, KeyRound, Mail, Check, AlertCircle, Trophy, Plus, Users, Send, X, ShieldAlert, Building2, Pencil, Trash2, Save, Crop, Upload } from 'lucide-react';
import ImageCropperModal from '../components/ImageCropperModal';
import './Settings.css';

const Settings = () => {
  const { currentOrg, orgId, adminRole, updateCurrentOrg } = useOrg();
  const [userEmail, setUserEmail] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [orgLogo, setOrgLogo] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });

  // Org Logo Cropper
  const orgFileInputRef = useRef(null);
  const [orgCropperRawImage, setOrgCropperRawImage] = useState(null);
  const [uploadingOrgLogo, setUploadingOrgLogo] = useState(false);

  // League Logo Direct Upload
  const leagueFileInputRef = useRef(null);
  const leagueFormRef = useRef(null);
  const leagueInputRef = useRef(null);
  const [uploadingLeagueLogo, setUploadingLeagueLogo] = useState(false);
  const [bgUploadLeagueId, setBgUploadLeagueId] = useState(null);
  const [bgCropperImage, setBgCropperImage] = useState(null);
  const [uploadingLeagueBg, setUploadingLeagueBg] = useState(false);
  const leagueBgFileInputRef = useRef(null);

  const [logoUploadLeagueId, setLogoUploadLeagueId] = useState(null);
  const directLeagueLogoInputRef = useRef(null);

  const [brandColors, setBrandColors] = useState(['#00FF66', '#10B981']);
  const [savingBrandColors, setSavingBrandColors] = useState(false);

  useEffect(() => {
    fetchBrandColors();
  }, [orgId, currentOrg]);

  const fetchBrandColors = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const metaColors = user?.user_metadata?.brand_colors;
      if (Array.isArray(metaColors) && metaColors.length > 0) {
        setBrandColors(metaColors);
      } else if (currentOrg?.brand_colors && Array.isArray(currentOrg.brand_colors)) {
        setBrandColors(currentOrg.brand_colors);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddBrandColor = () => {
    setBrandColors(prev => [...prev, '#3B82F6']);
  };

  const handleUpdateBrandColor = (index, val) => {
    const updated = [...brandColors];
    updated[index] = val;
    setBrandColors(updated);
  };

  const handleRemoveBrandColor = (index) => {
    if (brandColors.length <= 1) return;
    setBrandColors(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleSaveBrandColors = async (e) => {
    e.preventDefault();
    setSavingBrandColors(true);
    try {
      const { error: authErr } = await supabase.auth.updateUser({
        data: { brand_colors: brandColors }
      });
      if (authErr) throw authErr;

      const primaryColor = brandColors[0] || '#00FF66';
      const gradientCSS = brandColors.length > 1
        ? `linear-gradient(135deg, ${brandColors.join(', ')})`
        : primaryColor;

      document.documentElement.style.setProperty('--org-primary', primaryColor);
      document.documentElement.style.setProperty('--org-gradient', gradientCSS);

      setMessage({ type: 'success', text: 'Tashkilot brand ranglari va gradient muvaffaqiyatli saqlandi!' });
    } catch (err) {
      console.error('Error saving brand colors:', err);
      setMessage({ type: 'error', text: 'Saqlashda xatolik: ' + (err.message || '') });
    } finally {
      setSavingBrandColors(false);
    }
  };

  useEffect(() => {
    if (currentOrg) {
      setOrgLogo(currentOrg.logo_url || '');
    }
  }, [currentOrg]);

  const handleOrgFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setOrgCropperRawImage(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleOrgCroppedSave = async (croppedBase64) => {
    setUploadingOrgLogo(true);
    setOrgCropperRawImage(null);
    try {
      const response = await fetch(croppedBase64);
      const blob = await response.blob();
      const fileName = `org_logo_${orgId}_${Date.now()}.png`;

      const { error } = await supabase.storage.from('player-photos').upload(fileName, blob, {
        contentType: 'image/png',
        upsert: true
      });
      if (error) throw error;

      const { data } = supabase.storage.from('player-photos').getPublicUrl(fileName);
      const publicUrl = data.publicUrl;

      const { error: dbErr } = await supabase
        .from('organizations')
        .update({ logo_url: publicUrl })
        .eq('id', orgId);

      if (dbErr) throw dbErr;

      setOrgLogo(publicUrl);
      updateCurrentOrg({ logo_url: publicUrl });
      setMessage({ type: 'success', text: 'Tashkilot logotipi muvaffaqiyatli saqlandi!' });
    } catch (err) {
      console.error('Org logo upload error:', err);
      setMessage({ type: 'error', text: 'Logotip yuklashda xatolik: ' + (err.message || '') });
    } finally {
      setUploadingOrgLogo(false);
    }
  };

  const handleLeagueFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingLeagueLogo(true);
    try {
      const fileExt = file.name.split('.').pop() || 'png';
      const fileName = `league_logo_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { error } = await supabase.storage.from('player-photos').upload(fileName, file, {
        contentType: file.type || 'image/png',
        upsert: true
      });

      if (error) throw error;

      const { data } = supabase.storage.from('player-photos').getPublicUrl(fileName);
      setLeagueLogo(data.publicUrl);
      setMessage({ type: 'success', text: 'Liga logotipi muvaffaqiyatli yuklandi!' });
    } catch (err) {
      console.error('League logo upload error:', err);
      setMessage({ type: 'error', text: 'Liga logotipini yuklashda xatolik: ' + (err.message || '') });
    } finally {
      setUploadingLeagueLogo(false);
      e.target.value = '';
    }
  };

  // Handle league BG file selection
  const handleLeagueBgFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setBgCropperImage(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Save cropped 1:1 BG and auto-generate 16:9 YT cover from center
  const handleSaveCroppedLeagueBg = async (croppedBase64) => {
    if (!bgUploadLeagueId) return;
    setUploadingLeagueBg(true);
    setBgCropperImage(null);

    try {
      // Convert base64 to blob
      const res = await fetch(croppedBase64);
      const blob = await res.blob();

      // Upload 1:1 image
      const fileName1x1 = `league_bg_1x1_${bgUploadLeagueId}_${Date.now()}.jpg`;
      const { error: uploadErr } = await supabase.storage.from('player-photos').upload(fileName1x1, blob, {
        contentType: 'image/jpeg',
        upsert: true
      });
      if (uploadErr) throw uploadErr;
      const { data: urlData1x1 } = supabase.storage.from('player-photos').getPublicUrl(fileName1x1);
      const bgUrl1x1 = urlData1x1.publicUrl;

      // Auto-generate 16:9 from center of 1:1 image
      const ytBlob = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const targetW = img.width;
          const targetH = Math.round(img.width * 9 / 16);
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          const sy = Math.round((img.height - targetH) / 2);
          ctx.drawImage(img, 0, sy, img.width, targetH, 0, 0, targetW, targetH);
          canvas.toBlob(resolve, 'image/jpeg', 0.92);
        };
        img.src = croppedBase64;
      });

      let ytBannerUrl = null;
      if (ytBlob) {
        const fileName16x9 = `league_bg_16x9_${bgUploadLeagueId}_${Date.now()}.jpg`;
        const { error: ytErr } = await supabase.storage.from('player-photos').upload(fileName16x9, ytBlob, {
          contentType: 'image/jpeg',
          upsert: true
        });
        if (!ytErr) {
          const { data: ytUrlData } = supabase.storage.from('player-photos').getPublicUrl(fileName16x9);
          ytBannerUrl = ytUrlData.publicUrl;
        }
      }

      // Update league record in DB — only use export_bg_url (guaranteed column)
      const { error: dbErr } = await supabase
        .from('leagues')
        .update({ export_bg_url: bgUrl1x1 })
        .eq('id', bgUploadLeagueId);

      if (dbErr) {
        console.warn('League BG DB update error:', dbErr);
      }

      // Save all URLs to localStorage for cross-page compatibility
      const leagueObj = leagues.find(l => l.id === bgUploadLeagueId);
      if (leagueObj) {
        localStorage.setItem(`hfl_export_bg_${orgId}_${leagueObj.name}`, bgUrl1x1);
        localStorage.setItem(`hfl_schedule_banner_${orgId}_${leagueObj.id || leagueObj.name}`, bgUrl1x1);
        if (ytBannerUrl) {
          localStorage.setItem(`hfl_yt_banner_${orgId}_${leagueObj.id || leagueObj.name}`, ytBannerUrl);
        }
      }

      setMessage({ type: 'success', text: 'Liga fon rasmi muvaffaqiyatli yuklandi! (1:1 + 16:9 YT)' });
      fetchLeaguesAndOrgs();
    } catch (err) {
      console.error('League BG upload error:', err);
      setMessage({ type: 'error', text: 'Fon rasmini yuklashda xatolik: ' + (err.message || '') });
    } finally {
      setUploadingLeagueBg(false);
      setBgUploadLeagueId(null);
    }
  };

  // Delete league BG
  const handleDeleteLeagueBg = async (league) => {
    try {
      const { error: delErr } = await supabase
        .from('leagues')
        .update({ export_bg_url: null })
        .eq('id', league.id);

      if (delErr) console.warn('League BG delete warning:', delErr);

      localStorage.removeItem(`hfl_export_bg_${orgId}_${league.name}`);
      localStorage.removeItem(`hfl_schedule_banner_${orgId}_${league.id || league.name}`);
      localStorage.removeItem(`hfl_yt_banner_${orgId}_${league.id || league.name}`);

      setMessage({ type: 'success', text: `"${league.name}" liga fon rasmi o'chirildi!` });
      fetchLeaguesAndOrgs();
    } catch (err) {
      setMessage({ type: 'error', text: 'Fon rasmini o\'chirishda xatolik: ' + err.message });
    }
  };

  // Update match duration directly from league card badge
  const handleUpdateLeagueDurationDirect = async (leagueId, newDuration) => {
    try {
      const durationNum = Number(newDuration);
      const client = supabaseAdmin || supabase;
      
      setLeagues(prev => prev.map(leg => leg.id === leagueId ? { ...leg, match_duration: durationNum } : leg));

      try {
        await client.from('leagues').update({ match_duration: durationNum }).eq('id', leagueId);
      } catch (e) {}

      try {
        const nameKey = `LEAGUE_DURATION_${leagueId}`;
        const { data: existing } = await client.from('sponsors').select('id').eq('name', nameKey).maybeSingle();
        if (existing) {
          await client.from('sponsors').update({ logo_url: String(durationNum) }).eq('id', existing.id);
        } else {
          await client.from('sponsors').insert({ name: nameKey, logo_url: String(durationNum) });
        }
      } catch (e) {}

      localStorage.setItem(`hfl_league_duration_${leagueId}`, String(durationNum));
      setMessage({ type: 'success', text: `O'yin vaqti ${durationNum} daqiqaga o'zgartirildi!` });
      fetchLeaguesAndOrgs();
    } catch (err) {
      console.error('Duration update error:', err);
      setMessage({ type: 'error', text: 'Vaqtni yangilashda xatolik: ' + (err.message || '') });
    }
  };

  // Handle direct league logo selection from league card
  const handleDirectLeagueLogoSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !logoUploadLeagueId) return;

    setUploadingLeagueLogo(true);
    try {
      const fileExt = file.name.split('.').pop() || 'png';
      const fileName = `league_logo_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { error: uploadErr } = await supabase.storage.from('player-photos').upload(fileName, file, {
        contentType: file.type || 'image/png',
        upsert: true
      });
      if (uploadErr) throw uploadErr;

      const { data } = supabase.storage.from('player-photos').getPublicUrl(fileName);
      const logoUrl = data.publicUrl;

      const { error: dbErr } = await supabase
        .from('leagues')
        .update({ logo_url: logoUrl })
        .eq('id', logoUploadLeagueId);

      if (dbErr) throw dbErr;

      setMessage({ type: 'success', text: 'Liga logotipi muvaffaqiyatli yangilandi!' });
      fetchLeaguesAndOrgs();
    } catch (err) {
      setMessage({ type: 'error', text: 'Logo yuklashda xatolik: ' + (err.message || '') });
    } finally {
      setUploadingLeagueLogo(false);
      setLogoUploadLeagueId(null);
      e.target.value = '';
    }
  };

  // Leagues state
  const [leagues, setLeagues] = useState([]);
  const [otherOrgs, setOtherOrgs] = useState([]);
  const [leagueName, setLeagueName] = useState('');
  const [leagueLogo, setLeagueLogo] = useState('');
  const [isJunior, setIsJunior] = useState(false);
  const [matchDuration, setMatchDuration] = useState(90);
  const [leagueSeason, setLeagueSeason] = useState('2026/2027');
  const [leagueStatus, setLeagueStatus] = useState('active');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [creatingLeague, setCreatingLeague] = useState(false);

  // League Edit/Delete state
  const [editingLeague, setEditingLeague] = useState(null);
  const [isLeagueModalOpen, setIsLeagueModalOpen] = useState(false);

  // Collab modal / action state
  const [selectedLeagueForCollab, setSelectedLeagueForCollab] = useState(null);
  const [targetOrgEmail, setTargetOrgEmail] = useState('');
  const [sendingCollab, setSendingCollab] = useState(false);
  const [incomingCollabs, setIncomingCollabs] = useState([]);
  const [allCollabs, setAllCollabs] = useState([]);
  const [collabToDisconnect, setCollabToDisconnect] = useState(null);
  const [disconnectingCollab, setDisconnectingCollab] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAllSettingsData();
  }, [orgId]);

  const loadAllSettingsData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchUserData(),
        fetchLeaguesAndOrgs()
      ]);
    } catch (err) {
      console.error('Error loading settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUserEmail(user.email || '');
      setNewEmail(user.email || '');
    }
  };

  const fetchLeaguesAndOrgs = async () => {
    try {
      const { data: ownLeagues } = await supabase
        .from('leagues')
        .select('*')
        .eq('organization_id', orgId)
        .order('id', { ascending: true });

      setLeagues(ownLeagues || []);

      const { data: orgs } = await supabase
        .from('organizations')
        .select('id, name, slug, logo_url')
        .neq('id', orgId);
      setOtherOrgs(orgs || []);

      const { data: collabs } = await supabase
        .from('league_collabs')
        .select(`
          *,
          league:league_id (*),
          sender_org:sender_org_id (id, name, logo_url),
          receiver_org:receiver_org_id (id, name, logo_url)
        `)
        .or(`receiver_org_id.eq.${orgId},sender_org_id.eq.${orgId}`)
        .order('created_at', { ascending: false });

      if (collabs) {
        setAllCollabs(collabs);
        setIncomingCollabs(collabs.filter(c => c.receiver_org_id === orgId));
      } else {
        setAllCollabs([]);
        setIncomingCollabs([]);
      }

      // Merge own leagues and accepted collab leagues
      const acceptedCollabs = (collabs || []).filter(c => c.status === 'accepted');
      const collabLeagues = acceptedCollabs
        .map(c => c.league)
        .filter(l => l && l.organization_id !== orgId);

      const allLeaguesMap = new Map();
      (ownLeagues || []).forEach(l => allLeaguesMap.set(l.id, { ...l, isOwn: true }));
      collabLeagues.forEach(l => {
        if (!allLeaguesMap.has(l.id)) {
          allLeaguesMap.set(l.id, { ...l, isOwn: false, isCollab: true });
        }
      });

      let durationMap = {};
      let startDateMap = {};
      let endDateMap = {};
      try {
        const { data: dateSponsors } = await (supabaseAdmin || supabase)
          .from('sponsors')
          .select('name, logo_url')
          .or('name.like.LEAGUE_DURATION_%,name.like.LEAGUE_START_DATE_%,name.like.LEAGUE_END_DATE_%');

        if (dateSponsors) {
          dateSponsors.forEach(s => {
            if (s.name.startsWith('LEAGUE_DURATION_')) {
              const lId = Number(s.name.replace('LEAGUE_DURATION_', ''));
              if (lId) durationMap[lId] = Number(s.logo_url);
            } else if (s.name.startsWith('LEAGUE_START_DATE_')) {
              const lId = Number(s.name.replace('LEAGUE_START_DATE_', ''));
              if (lId) startDateMap[lId] = s.logo_url;
            } else if (s.name.startsWith('LEAGUE_END_DATE_')) {
              const lId = Number(s.name.replace('LEAGUE_END_DATE_', ''));
              if (lId) endDateMap[lId] = s.logo_url;
            }
          });
        }
      } catch (e) {}

      const allMerged = Array.from(allLeaguesMap.values());
      const withDurations = allMerged.map(l => ({
        ...l,
        match_duration: l.match_duration || durationMap[l.id] || Number(localStorage.getItem(`hfl_league_duration_${l.id}`)) || 90,
        start_date: l.start_date || startDateMap[l.id] || '',
        end_date: l.end_date || endDateMap[l.id] || ''
      }));

      setLeagues(withDurations);
    } catch (err) {
      console.error('Error fetching leagues/collabs:', err);
    }
  };

  const startEditLeague = (league) => {
    setEditingLeague(league);
    setLeagueName(league.name);
    setLeagueLogo(league.logo_url || '');
    setIsJunior(!!league.is_junior);
    setMatchDuration(league.match_duration || 90);
    setLeagueSeason(league.season || '2026/2027');
    setLeagueStatus(league.status || 'active');
    setStartDate(league.start_date || league.startDate || '');
    setEndDate(league.end_date || league.endDate || '');
    setMessage({ type: '', text: '' });
    setIsLeagueModalOpen(true);
  };

  const cancelEditLeague = () => {
    setEditingLeague(null);
    setLeagueName('');
    setLeagueLogo('');
    setIsJunior(false);
    setMatchDuration(90);
    setLeagueSeason('2026/2027');
    setLeagueStatus('active');
    setStartDate('');
    setEndDate('');
    setIsLeagueModalOpen(false);
  };

  const handleSaveLeague = async (e) => {
    e.preventDefault();
    if (!leagueName.trim()) return;
    setCreatingLeague(true);
    setMessage({ type: '', text: '' });

    try {
      const client = supabaseAdmin || supabase;
      // Auto-derive season from start/end dates
      let cleanSeason = leagueSeason.trim() || '2026/2027';
      if (startDate && endDate) {
        const sYear = new Date(startDate).getFullYear();
        const eYear = new Date(endDate).getFullYear();
        cleanSeason = sYear === eYear ? `${sYear}` : `${sYear}/${eYear}`;
      } else if (startDate) {
        cleanSeason = `${new Date(startDate).getFullYear()}`;
      }
      const cleanName = leagueName.trim();

      if (editingLeague) {
        const oldName = editingLeague.name;
        const targetId = editingLeague.id;

        // Safe update payload containing columns guaranteed to exist
        const safePayload = {
          name: cleanName,
          logo_url: leagueLogo.trim() || null,
          is_junior: isJunior
        };

        const fullPayload = {
          ...safePayload,
          season: cleanSeason,
          status: leagueStatus,
          start_date: startDate ? startDate : null,
          end_date: endDate ? endDate : null
        };

        // Try updating full payload first; fallback to safePayload if optional columns don't exist
        try {
          const { error: sErr } = await client.from('leagues').update(fullPayload).eq('id', targetId);
          if (sErr) throw sErr;
        } catch (e) {
          const { error: baseErr } = await client.from('leagues').update(safePayload).eq('id', targetId);
          if (baseErr) console.warn('Base update warning:', baseErr);
        }

        // Save match duration and start/end dates in sponsors table / localStorage helper
        if (targetId) {
          try {
            if (matchDuration) {
              const nameKey = `LEAGUE_DURATION_${targetId}`;
              const { data: existing } = await client.from('sponsors').select('id').eq('name', nameKey).maybeSingle();
              if (existing) {
                await client.from('sponsors').update({ logo_url: String(matchDuration) }).eq('id', existing.id);
              } else {
                await client.from('sponsors').insert({ name: nameKey, logo_url: String(matchDuration) });
              }
            }
            if (startDate) {
              const startKey = `LEAGUE_START_DATE_${targetId}`;
              const { data: exStart } = await client.from('sponsors').select('id').eq('name', startKey).maybeSingle();
              if (exStart) {
                await client.from('sponsors').update({ logo_url: startDate }).eq('id', exStart.id);
              } else {
                await client.from('sponsors').insert({ name: startKey, logo_url: startDate });
              }
            }
            if (endDate) {
              const endKey = `LEAGUE_END_DATE_${targetId}`;
              const { data: exEnd } = await client.from('sponsors').select('id').eq('name', endKey).maybeSingle();
              if (exEnd) {
                await client.from('sponsors').update({ logo_url: endDate }).eq('id', exEnd.id);
              } else {
                await client.from('sponsors').insert({ name: endKey, logo_url: endDate });
              }
            }
          } catch (e) {}
          if (matchDuration) localStorage.setItem(`hfl_league_duration_${targetId}`, String(matchDuration));
        }

        if (oldName !== cleanName) {
          await client.from('teams').update({ league: cleanName }).eq('league', oldName).eq('organization_id', orgId);
          await client.from('matches').update({ league: cleanName }).eq('league', oldName).eq('organization_id', orgId);
          await client.from('applications').update({ league: cleanName }).eq('league', oldName).eq('organization_id', orgId);
        }

        setMessage({ type: 'success', text: 'Liga ma\'lumotlari va sanalari muvaffaqiyatli yangilandi!' });
        cancelEditLeague();
        setIsLeagueModalOpen(false);
      } else {
        const safeInsertPayload = {
          name: cleanName,
          logo_url: leagueLogo.trim() || null,
          organization_id: orgId,
          is_junior: isJunior
        };

        const fullInsertPayload = {
          ...safeInsertPayload,
          season: cleanSeason,
          status: leagueStatus,
          start_date: startDate ? startDate : null,
          end_date: endDate ? endDate : null
        };

        let newLeague = null;
        try {
          const { data, error } = await client.from('leagues').insert(fullInsertPayload).select().single();
          if (error) throw error;
          newLeague = data;
        } catch (e) {
          const { data, error: baseErr } = await client.from('leagues').insert(safeInsertPayload).select().single();
          if (baseErr) console.warn('Base insert warning:', baseErr);
          newLeague = data;
        }

        if (newLeague) {
          try {
            if (matchDuration) {
              const nameKey = `LEAGUE_DURATION_${newLeague.id}`;
              await client.from('sponsors').insert({ name: nameKey, logo_url: String(matchDuration) });
            }
            if (startDate) {
              const startKey = `LEAGUE_START_DATE_${newLeague.id}`;
              await client.from('sponsors').insert({ name: startKey, logo_url: startDate });
            }
            if (endDate) {
              const endKey = `LEAGUE_END_DATE_${newLeague.id}`;
              await client.from('sponsors').insert({ name: endKey, logo_url: endDate });
            }
          } catch (e) {}
          if (matchDuration) localStorage.setItem(`hfl_league_duration_${newLeague.id}`, String(matchDuration));
        }

        setMessage({ type: 'success', text: `"${cleanName}" ligasi muvaffaqiyatli yaratildi!` });
        setLeagueName('');
        setLeagueLogo('');
        setIsJunior(false);
        setMatchDuration(90);
        setLeagueSeason('2026/2027');
        setLeagueStatus('active');
        setStartDate('');
        setEndDate('');
        setIsLeagueModalOpen(false);
      }
      fetchLeaguesAndOrgs();
    } catch (err) {
      console.error('Save league error:', err);
      setMessage({ type: 'error', text: 'Liga saqlashda xato: ' + (err.message || JSON.stringify(err)) });
    } finally {
      setCreatingLeague(false);
    }
  };

  const [deletingLeagueId, setDeletingLeagueId] = useState(null);

  const handleDeleteLeague = async (league) => {
    if (!window.confirm(`"${league.name}" ligasini o'chirmoqchimisiz? Ushbu ligaga tegishli collab sherikchiliklari ham o'chib ketadi.`)) {
      return;
    }
    setDeletingLeagueId(league.id);
    setMessage({ type: '', text: '' });
    try {
      await supabase.from('league_collabs').delete().eq('league_id', league.id);
      const { error } = await supabase.from('leagues').delete().eq('id', league.id);
      if (error) throw error;

      setMessage({ type: 'success', text: `"${league.name}" ligasi o'chirildi.` });
      fetchLeaguesAndOrgs();
    } catch (err) {
      setMessage({ type: 'error', text: 'O\'chirishda xato: ' + err.message });
    } finally {
      setDeletingLeagueId(null);
    }
  };

  const handleSendCollab = async (e) => {
    e.preventDefault();
    const emailToSearch = targetOrgEmail.trim().toLowerCase();
    if (!selectedLeagueForCollab || !emailToSearch) return;

    setSendingCollab(true);
    setMessage({ type: '', text: '' });

    try {
      let foundOrgId = null;
      let foundOrgName = '';

      // 1. Search for target organization by email in admin_users
      const { data: adminUser } = await supabase
        .from('admin_users')
        .select('organization_id, email')
        .ilike('email', emailToSearch)
        .maybeSingle();

      if (adminUser?.organization_id) {
        foundOrgId = adminUser.organization_id;
      } else {
        // 2. Search organizations table by admin_email
        const { data: orgByEmail } = await supabase
          .from('organizations')
          .select('id, name')
          .ilike('admin_email', emailToSearch)
          .maybeSingle();

        if (orgByEmail?.id) {
          foundOrgId = orgByEmail.id;
          foundOrgName = orgByEmail.name;
        }
      }

      if (!foundOrgId) {
        setMessage({
          type: 'error',
          text: `"${targetOrgEmail}" e-mail manzili bo'yicha hech qanday tashkilot topilmadi! Email manzilini to'g'ri kiritganingizga ishonch hosil qiling.`
        });
        setSendingCollab(false);
        return;
      }

      if (Number(foundOrgId) === Number(orgId)) {
        setMessage({
          type: 'error',
          text: "O'z tashkilotingizga sherikchilik taklifini yubora olmaysiz!"
        });
        setSendingCollab(false);
        return;
      }

      if (!foundOrgName) {
        const { data: orgObj } = await supabase
          .from('organizations')
          .select('name')
          .eq('id', foundOrgId)
          .maybeSingle();
        foundOrgName = orgObj?.name || 'Tashkilot';
      }

      // Check if a collab request already exists
      const { data: existingCollab } = await supabase
        .from('league_collabs')
        .select('id, status')
        .eq('league_id', selectedLeagueForCollab.id)
        .or(`and(sender_org_id.eq.${orgId},receiver_org_id.eq.${foundOrgId}),and(sender_org_id.eq.${foundOrgId},receiver_org_id.eq.${orgId})`)
        .maybeSingle();

      if (existingCollab) {
        const statusText = existingCollab.status === 'accepted' ? 'qabul qilingan' : 'kutilayotgan takliflar ro\'yxatida mavjud';
        setMessage({
          type: 'error',
          text: `"${foundOrgName}" tashkilotiga ushbu liga bo'yicha sherikchilik taklifi allaqachon ${statusText}!`
        });
        setSendingCollab(false);
        return;
      }

      // Send the collab request
      const { error } = await supabase.from('league_collabs').insert({
        league_id: selectedLeagueForCollab.id,
        sender_org_id: orgId,
        receiver_org_id: foundOrgId,
        status: 'pending',
      });

      if (error) throw error;

      setMessage({
        type: 'success',
        text: `"${selectedLeagueForCollab.name}" ligasi bo'yicha sherikchilik taklifi "${foundOrgName}" (${targetOrgEmail}) tashkilotiga muvaffaqiyatli yuborildi!`
      });
      setSelectedLeagueForCollab(null);
      setTargetOrgEmail('');
      fetchLeaguesAndOrgs();
    } catch (err) {
      console.error('Send collab error:', err);
      setMessage({ type: 'error', text: 'Taklif yuborishda xato: ' + (err.message || '') });
    } finally {
      setSendingCollab(false);
    }
  };

  const handleRespondCollab = async (collabId, status) => {
    try {
      const { error } = await supabase
        .from('league_collabs')
        .update({ status })
        .eq('id', collabId);

      if (error) throw error;

      setMessage({ type: 'success', text: status === 'accepted' ? 'Sheriklik taklifi qabul qilindi!' : 'Taklif rad etildi.' });
      fetchLeaguesAndOrgs();
    } catch (err) {
      setMessage({ type: 'error', text: 'Xatolik: ' + err.message });
    }
  };

  const handleConfirmDisconnectCollab = async () => {
    if (!collabToDisconnect) return;
    setDisconnectingCollab(true);
    try {
      const { error } = await supabase
        .from('league_collabs')
        .delete()
        .eq('id', collabToDisconnect.id);

      if (error) throw error;

      setMessage({ type: 'success', text: `"${collabToDisconnect.leagueName}" ligasi bo'yicha sheriklik bitimi muvaffaqiyatli uzildi!` });
      setCollabToDisconnect(null);
      fetchLeaguesAndOrgs();
    } catch (err) {
      setMessage({ type: 'error', text: 'Sheriklikni uzishda xatolik: ' + err.message });
    } finally {
      setDisconnectingCollab(false);
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });

    if (!oldPassword) {
      setMessage({ type: 'error', text: 'Eski parolingizni kiriting!' });
      return;
    }
    if (!newPassword) {
      setMessage({ type: 'error', text: 'Yangi parolni kiriting!' });
      return;
    }
    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Parol kamida 6 ta belgidan iborat bo\'lishi kerak!' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Parollar mos kelmadi!' });
      return;
    }

    setLoading(true);
    try {
      // 1. Check old password correctness
      const { data: { user } } = await supabase.auth.getUser();
      if (user && user.email) {
        const { error: verifyErr } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: oldPassword,
        });

        if (verifyErr) {
          setMessage({ type: 'error', text: 'Eski parol noto\'g\'ri kiritildi!' });
          setLoading(false);
          return;
        }
      }

      // 2. Set new password
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      setMessage({ type: 'success', text: 'Parolingiz muvaffaqiyatli almashtirildi!' });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setMessage({ type: 'error', text: 'Xato: ' + (err.message || '') });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateEmail = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });

    if (!newEmail || newEmail === userEmail) return;

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail });
      if (error) throw error;

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('admin_users').update({ email: newEmail }).eq('id', user.id);
      }

      setMessage({ type: 'success', text: 'Email yangilandi! Tasdiqlash havolasi yuborildi.' });
      setUserEmail(newEmail);
    } catch (err) {
      setMessage({ type: 'error', text: 'Xato: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="settings-page">
      <div className="settings-header">
        <SettingsIcon size={28} />
        <div>
          <h1>Hisob va Ligalar Sozlamalari</h1>
          <p>{currentOrg?.name} ({adminRole === 'super_admin' ? 'Super Admin' : 'Tashkilot Admini'})</p>
        </div>
      </div>

      {message.text && (
        <div className={`settings-alert ${message.type}`}>
          {message.type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
          <span>{message.text}</span>
        </div>
      )}

      {loading ? (
        <>
          {/* Settings Grid Skeleton (1:1 identical to real cards) */}
          <div className="settings-grid">
            <div className="settings-card full-width">
              <div className="settings-card-header">
                <div className="skeleton-box" style={{ width: '20px', height: '20px', borderRadius: '4px' }}></div>
                <div className="skeleton-box" style={{ width: '220px', height: '20px' }}></div>
              </div>

              <div className="create-league-form">
                <div className="form-row">
                  <div className="settings-form-group flex-2">
                    <div className="skeleton-box" style={{ width: '120px', height: '14px', marginBottom: '8px' }}></div>
                    <div className="skeleton-box" style={{ width: '100%', height: '42px', borderRadius: '10px' }}></div>
                  </div>
                  <div className="settings-form-group flex-2">
                    <div className="skeleton-box" style={{ width: '90px', height: '14px', marginBottom: '8px' }}></div>
                    <div className="skeleton-box" style={{ width: '160px', height: '38px', borderRadius: '10px' }}></div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                    <div className="skeleton-box" style={{ width: '120px', height: '42px', borderRadius: '10px' }}></div>
                  </div>
                </div>
              </div>

              <div className="leagues-list-container">
                <div className="skeleton-box" style={{ width: '140px', height: '14px', marginBottom: '14px' }}></div>
                <div className="leagues-grid">
                  <div className="league-card">
                    <div className="league-card-header">
                      <div className="skeleton-box" style={{ width: '36px', height: '36px', borderRadius: '50%' }}></div>
                      <div className="skeleton-box" style={{ width: '110px', height: '16px' }}></div>
                    </div>
                    <div className="league-card-actions">
                      <div className="skeleton-box" style={{ width: '65px', height: '32px', borderRadius: '8px' }}></div>
                      <div className="skeleton-box" style={{ width: '32px', height: '32px', borderRadius: '8px' }}></div>
                      <div className="skeleton-box" style={{ width: '32px', height: '32px', borderRadius: '8px' }}></div>
                    </div>
                  </div>
                  <div className="league-card">
                    <div className="league-card-header">
                      <div className="skeleton-box" style={{ width: '36px', height: '36px', borderRadius: '50%' }}></div>
                      <div className="skeleton-box" style={{ width: '130px', height: '16px' }}></div>
                    </div>
                    <div className="league-card-actions">
                      <div className="skeleton-box" style={{ width: '65px', height: '32px', borderRadius: '8px' }}></div>
                      <div className="skeleton-box" style={{ width: '32px', height: '32px', borderRadius: '8px' }}></div>
                      <div className="skeleton-box" style={{ width: '32px', height: '32px', borderRadius: '8px' }}></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="settings-card">
              <div className="settings-card-header">
                <div className="skeleton-box" style={{ width: '20px', height: '20px', borderRadius: '4px' }}></div>
                <div className="skeleton-box" style={{ width: '160px', height: '20px' }}></div>
              </div>
              <div className="settings-org-logo-preview">
                <div className="skeleton-box" style={{ width: '90px', height: '90px', borderRadius: '16px' }}></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <div className="skeleton-box" style={{ width: '180px', height: '42px', borderRadius: '10px' }}></div>
              </div>
            </div>

            <div className="settings-card">
              <div className="settings-card-header">
                <div className="skeleton-box" style={{ width: '20px', height: '20px', borderRadius: '4px' }}></div>
                <div className="skeleton-box" style={{ width: '150px', height: '20px' }}></div>
              </div>
              <div className="settings-form">
                <div className="settings-form-group">
                  <div className="skeleton-box" style={{ width: '100px', height: '14px', marginBottom: '8px' }}></div>
                  <div className="skeleton-box" style={{ width: '100%', height: '42px', borderRadius: '10px' }}></div>
                </div>
                <div className="skeleton-box" style={{ width: '130px', height: '40px', borderRadius: '10px', marginTop: '12px' }}></div>
              </div>

              <div className="settings-divider"></div>

              <div className="settings-card-header" style={{ border: 'none', padding: '0', marginBottom: '16px' }}>
                <div className="skeleton-box" style={{ width: '20px', height: '20px', borderRadius: '4px' }}></div>
                <div className="skeleton-box" style={{ width: '160px', height: '20px' }}></div>
              </div>
              <div className="settings-form">
                <div className="settings-form-group">
                  <div className="skeleton-box" style={{ width: '90px', height: '14px', marginBottom: '8px' }}></div>
                  <div className="skeleton-box" style={{ width: '100%', height: '42px', borderRadius: '10px' }}></div>
                </div>
                <div className="settings-form-group">
                  <div className="skeleton-box" style={{ width: '110px', height: '14px', marginBottom: '8px' }}></div>
                  <div className="skeleton-box" style={{ width: '100%', height: '42px', borderRadius: '10px' }}></div>
                </div>
                <div className="skeleton-box" style={{ width: '130px', height: '40px', borderRadius: '10px', marginTop: '12px' }}></div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Incoming Collab Requests Banner */}
          {incomingCollabs.filter(c => c.status === 'pending').length > 0 && (
            <div className="collab-incoming-banner">
              <div className="collab-incoming-header">
                <Users size={20} />
                <div>
                  <h3>Yangi Sheriklik (Collab) Takliflari</h3>
                  <p>Boshqa tashkilotlar sizga ligani birga olib borish taklifini yuborgan:</p>
                </div>
              </div>
              <div className="collab-incoming-list">
                {incomingCollabs.filter(c => c.status === 'pending').map(collab => (
                  <div key={collab.id} className="collab-incoming-item">
                    <div className="collab-incoming-info">
                      <strong>{collab.sender_org?.name}</strong> tashkiloti <span>"{collab.league?.name}"</span> ligasini birgalikda (co-host) olib borishni taklif qilmoqda.
                    </div>
                    <div className="collab-incoming-actions">
                      <button className="btn-accept" onClick={() => handleRespondCollab(collab.id, 'accepted')} title="Qabul qilish">
                        <Check size={18} color="#0b0e17" />
                      </button>
                      <button className="btn-reject" onClick={() => handleRespondCollab(collab.id, 'rejected')} title="Rad etish">
                        <X size={18} color="#ffffff" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="settings-grid">
            {/* Dynamic League Management Card */}
            <div className="settings-card full-width">
              <div className="settings-card-header">
                <Trophy size={20} />
                <h2>Tashkilot Ligalari Boshqaruvi</h2>
              </div>

              {/* Current Leagues List */}
              <div className="leagues-list-container">
                <h3>Mavjud Ligalar ({leagues.length})</h3>
                {leagues.length === 0 ? (
                  <p className="no-data-text">Hali ligalar qo'shilmagan.</p>
                ) : (
                  <div className="leagues-grid">
                    {leagues.map(l => {
                      const activeCollab = (allCollabs || []).find(c => c.league_id === l.id && c.status === 'accepted');
                      const partnerOrg = activeCollab 
                        ? (activeCollab.sender_org_id === orgId ? activeCollab.receiver_org : activeCollab.sender_org)
                        : null;

                      // Faqat ligani asl yaratgan/egasi bo'lgan tashkilot (owner) boshqaruv huquqiga ega
                      const isOwner = l.isOwn !== false && l.organization_id === orgId;

                      return (
                        <div key={l.id} className={`league-card-drawn ${editingLeague?.id === l.id ? 'editing' : ''}`}>
                          {/* Top Background Section (hand drawing design) */}
                          <div 
                            className="league-card-bg-banner"
                            style={l.export_bg_url ? { backgroundImage: `linear-gradient(180deg, rgba(0, 0, 0, 0.45) 0%, rgba(0, 0, 0, 0.8) 100%), url(${l.export_bg_url})` } : {}}
                          >
                            {/* Logo Clickable Area at Top */}
                            <div 
                              className={`league-card-logo-area ${isOwner ? 'clickable' : ''}`}
                              onClick={(e) => {
                                if (!isOwner) return;
                                e.stopPropagation();
                                setLogoUploadLeagueId(l.id);
                                directLeagueLogoInputRef.current?.click();
                              }}
                              title={isOwner ? "Liga logotipini almashtirish uchun bosing" : ""}
                            >
                              {l.logo_url ? (
                                <img src={l.logo_url} alt={l.name} className="league-card-logo-img" />
                              ) : (
                                <div className="league-card-logo-placeholder">
                                  <Trophy size={24} />
                                </div>
                              )}
                              {isOwner && (
                                <div className="logo-hover-badge">
                                  <Upload size={12} />
                                </div>
                              )}
                            </div>

                            {/* Center Upload BG Trigger */}
                            {isOwner && (
                              <button
                                type="button"
                                className="btn-upload-bg-trigger"
                                onClick={() => {
                                  setBgUploadLeagueId(l.id);
                                  leagueBgFileInputRef.current?.click();
                                }}
                              >
                                <Upload size={15} />
                                <span>{l.export_bg_url ? 'Bg image (Orqa fonni almashtirish)' : 'Bg image ↑ upload img'}</span>
                              </button>
                            )}

                            {/* Delete BG button if BG exists */}
                            {isOwner && l.export_bg_url && (
                              <button
                                type="button"
                                className="btn-delete-bg-corner"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteLeagueBg(l);
                                }}
                                title="Fon rasmini o'chirish"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>

                          {/* Bottom Info Section */}
                          <div className="league-card-bottom">
                            <div className="league-card-name-section">
                              <h4 className="league-title">{l.name}</h4>
                              <div className="league-badges-wrap">
                                <span className="junior-badge" style={{ background: 'rgba(0, 255, 135, 0.15)', color: '#00ff87', borderColor: 'rgba(0, 255, 135, 0.3)' }}>
                                  📅 {l.season || '2026/2027'}
                                </span>
                                {l.status === 'archived' && (
                                  <span className="junior-badge" style={{ background: 'rgba(255, 170, 0, 0.15)', color: '#ffaa00', borderColor: 'rgba(255, 170, 0, 0.3)' }}>
                                    📦 YAKUNLANGAN
                                  </span>
                                )}
                                {l.is_junior && <span className="junior-badge">JUNIOR U-14</span>}
                                {isOwner ? (
                                  <select
                                    value={l.match_duration || 90}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      handleUpdateLeagueDurationDirect(l.id, e.target.value);
                                    }}
                                    style={{
                                      background: 'rgba(59, 130, 246, 0.2)',
                                      color: '#60a5fa',
                                      border: '1px solid rgba(59, 130, 246, 0.4)',
                                      borderRadius: '8px',
                                      padding: '3px 8px',
                                      fontSize: '11px',
                                      fontWeight: '800',
                                      cursor: 'pointer',
                                      outline: 'none'
                                    }}
                                    title="O'yin davomiyligini tanlang"
                                  >
                                    <option value={90} style={{ background: '#0b0e17', color: '#fff' }}>⏱️ 90 daq (45x2)</option>
                                    <option value={80} style={{ background: '#0b0e17', color: '#fff' }}>⏱️ 80 daq (40x2)</option>
                                    <option value={70} style={{ background: '#0b0e17', color: '#fff' }}>⏱️ 70 daq (35x2)</option>
                                    <option value={60} style={{ background: '#0b0e17', color: '#fff' }}>⏱️ 60 daq (30x2)</option>
                                    <option value={50} style={{ background: '#0b0e17', color: '#fff' }}>⏱️ 50 daq (25x2)</option>
                                    <option value={40} style={{ background: '#0b0e17', color: '#fff' }}>⏱️ 40 daq (20x2)</option>
                                    <option value={30} style={{ background: '#0b0e17', color: '#fff' }}>⏱️ 30 daq (15x2)</option>
                                  </select>
                                ) : (
                                  <span className="junior-badge" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', borderColor: 'rgba(59, 130, 246, 0.3)' }}>
                                    ⏱️ {l.match_duration || 90} daq ({Math.round((l.match_duration || 90) / 2)}x2)
                                  </span>
                                )}
                                {!isOwner && <span className="junior-badge collab-badge">SHERIKLIK (CO-HOST)</span>}
                              </div>
                            </div>

                            {partnerOrg && (
                              <div className="league-collab-partner-badge">
                                <div className="partner-logo-box">
                                  {partnerOrg.logo_url ? (
                                    <img src={partnerOrg.logo_url} alt={partnerOrg.name} />
                                  ) : (
                                    <Building2 size={12} />
                                  )}
                                </div>
                                <span className="partner-text">
                                  Sherik: <strong>{partnerOrg.name}</strong>
                                </span>
                                {isOwner && activeCollab && (
                                  <button
                                    type="button"
                                    className="btn-collab-disconnect"
                                    onClick={() => setCollabToDisconnect({ id: activeCollab.id, leagueName: l.name, partnerName: partnerOrg.name })}
                                    title="Sheriklikni uzish"
                                  >
                                    <X size={14} />
                                  </button>
                                )}
                              </div>
                            )}

                            {/* Bottom Button Bar matching hand drawing tabs */}
                            <div className="league-card-action-tabs">
                              {isOwner && !activeCollab && (
                                <button
                                  type="button"
                                  className="action-tab btn-tab-collab"
                                  onClick={() => setSelectedLeagueForCollab(l)}
                                  title="Sheriklik taklifi"
                                >
                                  <Send size={13} /> <span>Collab</span>
                                </button>
                              )}

                              {isOwner && (
                                <>
                                  <button
                                    type="button"
                                    className="action-tab btn-tab-edit"
                                    onClick={() => startEditLeague(l)}
                                    title="Tahrirlash"
                                  >
                                    <Pencil size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    className="action-tab btn-tab-delete"
                                    onClick={() => handleDeleteLeague(l)}
                                    disabled={deletingLeagueId === l.id}
                                    title="O'chirish"
                                  >
                                    {deletingLeagueId === l.id ? <span className="btn-spinner"></span> : <Trash2 size={14} />}
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Add League Button placed at the VERY BOTTOM of the leagues list! */}
                <div style={{ marginTop: '28px', display: 'flex', justifyContent: 'center' }}>
                  <button
                    type="button"
                    className="settings-btn settings-btn-primary"
                    style={{
                      width: '100%',
                      maxWidth: '340px',
                      height: '46px',
                      fontSize: '14px',
                      fontWeight: '800',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      boxShadow: '0 8px 20px rgba(0, 255, 102, 0.25)'
                    }}
                    onClick={() => {
                      cancelEditLeague();
                      setIsLeagueModalOpen(true);
                    }}
                  >
                    <Plus size={18} />
                    <span>LIGA QO'SHISH</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Organization Logo Card */}
            <div className="settings-card">
              <div className="settings-card-header">
                <Building2 size={20} />
                <h2>Tashkilot Logotipi</h2>
              </div>
              <div className="settings-org-logo-preview">
                {orgLogo ? (
                  <img src={orgLogo} alt={currentOrg?.name} />
                ) : (
                  <div className="no-logo-placeholder">
                    <Building2 size={24} />
                    <span>Logo yo'q</span>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => orgFileInputRef.current?.click()}
                  disabled={uploadingOrgLogo}
                  style={{
                    padding: '10px 18px',
                    background: 'rgba(0, 255, 102, 0.12)',
                    border: '1px solid rgba(0, 255, 102, 0.3)',
                    color: '#00ff66',
                    borderRadius: '10px',
                    fontWeight: '700',
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Crop size={16} />
                  <span>{uploadingOrgLogo ? 'Yuklanmoqda...' : (orgLogo ? 'Logotipni Almashtirish' : 'Logo Yuklash va Qirqish')}</span>
                </button>

                <input
                  ref={orgFileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleOrgFileSelect}
                />
              </div>
            </div>

            {/* Brand Colors & Gradient Picker */}
            <div className="settings-card shadow-xl" style={{ marginTop: '20px' }}>
              <div className="settings-card-header">
                <Building2 size={20} />
                <h2>Tashkilot Brand Ranglari & Gradient</h2>
              </div>

              <div style={{ padding: '12px 0' }}>
                <label style={{ fontSize: '12px', fontWeight: '700', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>
                  Canli Gradient Prevyusi (Forma Sayti)
                </label>
                <div
                  style={{
                    background: brandColors.length > 1 ? `linear-gradient(135deg, ${brandColors.join(', ')})` : brandColors[0] || '#00FF66',
                    height: '90px',
                    borderRadius: '16px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    border: '1px solid rgba(255,255,255,0.2)',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                    transition: 'all 0.3s'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: '900', textTransform: 'uppercase', background: 'rgba(0,0,0,0.4)', padding: '4px 10px', borderRadius: '8px' }}>
                      {currentOrg?.name || 'Tashkilot Sayti'}
                    </span>
                    <span style={{ fontSize: '10px', fontFamily: 'monospace', background: 'rgba(0,0,0,0.4)', padding: '2px 8px', borderRadius: '4px' }}>
                      {brandColors.length} ta rang
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.9)', background: 'rgba(0,0,0,0.4)', padding: '4px 8px', borderRadius: '6px' }}>
                      {brandColors.length > 1 ? `linear-gradient(135deg, ${brandColors.join(', ')})` : brandColors[0]}
                    </span>
                    <button type="button" style={{ padding: '4px 12px', background: '#ffffff', color: '#000000', fontWeight: '900', fontSize: '10px', textTransform: 'uppercase', borderRadius: '6px', border: 'none' }}>
                      Tugma Namunasi
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' }}>
                    Ranglar Ro'yxati
                  </label>
                  <button
                    type="button"
                    onClick={handleAddBrandColor}
                    style={{
                      padding: '6px 12px',
                      background: 'rgba(0,255,102,0.1)',
                      border: '1px solid rgba(0,255,102,0.3)',
                      color: '#00ff66',
                      borderRadius: '10px',
                      fontWeight: '700',
                      fontSize: '12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <Plus size={14} /> Rang Qo'shish
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px', marginBottom: '16px' }}>
                  {brandColors.map((colorHex, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: '#0b0f19', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}>
                      <input
                        type="color"
                        value={colorHex}
                        onChange={e => handleUpdateBrandColor(idx, e.target.value)}
                        style={{ width: '30px', height: '30px', borderRadius: '8px', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                      />
                      <input
                        type="text"
                        value={colorHex}
                        onChange={e => handleUpdateBrandColor(idx, e.target.value)}
                        style={{ flex: 1, background: 'transparent', border: 'none', color: '#ffffff', fontFamily: 'monospace', fontSize: '12px', textTransform: 'uppercase', outline: 'none', width: '60px' }}
                      />
                      {brandColors.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveBrandColor(idx)}
                          style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                          title="Rangni o'chirish"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleSaveBrandColors}
                  disabled={savingBrandColors}
                  className="settings-btn settings-btn-primary"
                  style={{ width: '100%' }}
                >
                  <Save size={16} />
                  <span>{savingBrandColors ? 'Saqlanmoqda...' : 'Ranglarni Saqlash'}</span>
                </button>
              </div>
            </div>

            {/* Account Settings */}
            <div className="settings-card">
              <div className="settings-card-header">
                <Mail size={20} />
                <h2>Hisob Sozlamalari</h2>
              </div>
              <form onSubmit={handleUpdateEmail} className="settings-form">
                <div className="settings-form-group">
                  <label>Email Manzili</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    placeholder="yangi@email.com"
                    required
                  />
                </div>
                <button type="submit" className="settings-btn settings-btn-primary" disabled={loading || newEmail === userEmail}>
                  Emailni Saqlash
                </button>
              </form>

              <div className="settings-divider"></div>

              <div className="settings-card-header" style={{ marginBottom: '16px', border: 'none', padding: 0 }}>
                <KeyRound size={20} />
                <h2>Parolni O'zgartirish</h2>
              </div>
              <form onSubmit={handleUpdatePassword} className="settings-form">
                <div className="settings-form-group">
                  <label>Eski Parol</label>
                  <input
                    type="password"
                    value={oldPassword}
                    onChange={e => setOldPassword(e.target.value)}
                    placeholder="Hozirgi parolingizni kiriting"
                    required
                  />
                </div>
                <div className="settings-form-group">
                  <label>Yangi Parol</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Kamida 6 ta belgi"
                    required
                  />
                </div>
                <div className="settings-form-group">
                  <label>Parolni Tasdiqlang</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Yangi parolni qayta kiriting"
                    required
                  />
                </div>
                <button type="submit" className="settings-btn settings-btn-primary" disabled={loading || !oldPassword || !newPassword}>
                  Parolni Saqlash
                </button>
              </form>
            </div>
          </div>
        </>
      )}

      {/* League Create/Edit Modal Popup */}
      {isLeagueModalOpen && (
        <div className="league-modal-overlay" onClick={() => setIsLeagueModalOpen(false)}>
          <div className="league-modal-card" onClick={e => e.stopPropagation()}>
            <div className="league-modal-header">
              <h3>
                {editingLeague ? <Pencil size={18} color="#00aaff" /> : <Plus size={18} color="#00ff66" />}
                <span>{editingLeague ? `"${editingLeague.name}" Ligasini Tahrirlash` : 'Yangi Liga Qo\'shish'}</span>
              </h3>
              <button type="button" className="league-modal-close" onClick={() => setIsLeagueModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={(e) => {
              handleSaveLeague(e);
            }} className="league-modal-form">
              <div className="league-modal-grid">
                {/* Liga Nomi */}
                <div className="settings-form-group">
                  <label>{editingLeague ? 'Liga Nomi' : 'Yangi Liga Nomi'}</label>
                  <input
                    ref={leagueInputRef}
                    type="text"
                    placeholder="Masalan: Super Liga"
                    value={leagueName}
                    onChange={e => setLeagueName(e.target.value)}
                    required
                  />
                </div>

                {/* Liga Logosi */}
                <div className="settings-form-group">
                  <label>Liga Logosi</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                    {leagueLogo && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                        <img src={leagueLogo} alt="Logo" style={{ width: '36px', height: '36px', borderRadius: '8px', objectFit: 'contain', border: '1px solid rgba(255,255,255,0.2)' }} />
                        <button
                          type="button"
                          onClick={() => setLeagueLogo('')}
                          title="Logotipni o'chirish"
                          style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', width: '36px', height: '36px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => leagueFileInputRef.current?.click()}
                      disabled={uploadingLeagueLogo}
                      style={{
                        height: '42px',
                        padding: '0 14px',
                        background: 'rgba(0, 170, 255, 0.12)',
                        border: '1px solid rgba(0, 170, 255, 0.3)',
                        color: '#00aaff',
                        borderRadius: '10px',
                        fontWeight: '600',
                        fontSize: '13px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        flex: 1
                      }}
                    >
                      <Upload size={15} />
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {uploadingLeagueLogo ? 'Yuklanmoqda...' : (leagueLogo ? 'Logo almashtirish' : 'Logo yuklash (PNG)')}
                      </span>
                    </button>
                    <input
                      ref={leagueFileInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handleLeagueFileSelect}
                    />
                  </div>
                </div>

                {/* O'yin Davomiyligi */}
                <div className="settings-form-group">
                  <label>O'yin Davomiyligi</label>
                  <select
                    value={matchDuration}
                    onChange={e => setMatchDuration(Number(e.target.value))}
                  >
                    <option value={90}>90 daqiqa (45 + 45)</option>
                    <option value={80}>80 daqiqa (40 + 40)</option>
                    <option value={70}>70 daqiqa (35 + 35)</option>
                    <option value={60}>60 daqiqa (30 + 30)</option>
                    <option value={50}>50 daqiqa (25 + 25)</option>
                    <option value={40}>40 daqiqa (20 + 20)</option>
                    <option value={30}>30 daqiqa (15 + 15)</option>
                  </select>
                </div>


                {/* Boshlanish Sanasi */}
                <div className="settings-form-group">
                  <label>Boshlanish Sanasi</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                  />
                </div>

                {/* Tugash Sanasi */}
                <div className="settings-form-group">
                  <label>Tugash Sanasi</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                  />
                </div>

                {/* Liga Holati */}
                <div className="settings-form-group" style={{ gridColumn: 'span 2' }}>
                  <label>Liga Holati</label>
                  <select
                    value={leagueStatus}
                    onChange={e => setLeagueStatus(e.target.value)}
                  >
                    <option value="active">🟢 FAOL MAVSUM</option>
                    <option value="archived">📦 YAKUNLANGAN</option>
                  </select>
                </div>
              </div>

              <div className="league-modal-actions">
                <button type="button" className="league-modal-close" onClick={() => setIsLeagueModalOpen(false)} title="Bekor qilish">
                  <X size={18} />
                </button>
                <button type="submit" className="settings-btn settings-btn-primary" disabled={creatingLeague} style={{ minWidth: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  {creatingLeague ? (
                    <><span className="btn-spinner"></span> Saqlanmoqda...</>
                  ) : (editingLeague ? 'Saqlash' : 'Liga qo\'shish')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Collab Request Modal */}
      {selectedLeagueForCollab && (
        <div className="settings-modal-overlay" onClick={() => { setSelectedLeagueForCollab(null); setTargetOrgEmail(''); }}>
          <div className="settings-modal" onClick={e => e.stopPropagation()}>
            <div className="settings-modal-header">
              <h2>Sherikchilik Taklifi Yuborish (Co-host)</h2>
              <button className="close-btn" onClick={() => { setSelectedLeagueForCollab(null); setTargetOrgEmail(''); }}><X size={18} /></button>
            </div>
            <form onSubmit={handleSendCollab} className="settings-modal-body">
              <p><strong>"{selectedLeagueForCollab.name}"</strong> ligasini birgalikda (co-host) olib borish uchun hamkor tashkilotning email manzilini kiriting:</p>
              <div className="settings-form-group" style={{ marginTop: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Mail size={14} color="#00ff66" />
                  <span>Tashkilot Admin Email Manzili</span>
                </label>
                <input
                  type="email"
                  placeholder="masalan: admin@tashkilot.uz"
                  value={targetOrgEmail}
                  onChange={e => setTargetOrgEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="settings-modal-footer" style={{ marginTop: '20px' }}>
                <button type="button" className="btn-cancel" onClick={() => { setSelectedLeagueForCollab(null); setTargetOrgEmail(''); }}>Bekor qilish</button>
                <button type="submit" className="settings-btn settings-btn-primary" disabled={sendingCollab || !targetOrgEmail.trim()}>
                  <Send size={14} /> {sendingCollab ? 'Yuborilmoqda...' : 'Taklifni Yuborish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Org Logo Cropper Modal */}
      {orgCropperRawImage && (
        <ImageCropperModal
          isOpen={!!orgCropperRawImage}
          imageSrc={orgCropperRawImage}
          onClose={() => setOrgCropperRawImage(null)}
          onSave={handleOrgCroppedSave}
          title="Tashkilot Logotipini 1:1 Qirqish"
        />
      )}

      {/* Direct League Logo File Input */}
      <input
        ref={directLeagueLogoInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleDirectLeagueLogoSelect}
      />

      {/* League BG file input */}
      <input
        ref={leagueBgFileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleLeagueBgFileSelect}
      />

      {/* League BG Cropper Modal */}
      {bgCropperImage && (
        <ImageCropperModal
          isOpen={!!bgCropperImage}
          imageSrc={bgCropperImage}
          onClose={() => { setBgCropperImage(null); setBgUploadLeagueId(null); }}
          onSave={handleSaveCroppedLeagueBg}
          title="Liga Fon Rasmini 1:1 Qirqish"
          aspect={1 / 1}
          showAspectSelector={false}
        />
      )}
      {/* Collab Disconnect Confirmation Modal */}
      {collabToDisconnect && (
        <div className="settings-modal-overlay" onClick={() => setCollabToDisconnect(null)}>
          <div className="settings-modal disconnect-confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="disconnect-modal-icon-box">
              <ShieldAlert size={36} color="#ff3b30" />
            </div>
            <h2 className="disconnect-modal-title">Sheriklikni Uzish</h2>
            <p className="disconnect-modal-desc">
              Siz rostdan ham <strong>"{collabToDisconnect.leagueName}"</strong> ligasi bo'yicha <span>{collabToDisconnect.partnerName}</span> tashkiloti bilan tuzilgan sheriklikni (co-host) bekor qilmoqchimisiz?
            </p>
            <div className="disconnect-modal-actions">
              <button
                type="button"
                className="btn-disconnect-cancel"
                onClick={() => setCollabToDisconnect(null)}
                disabled={disconnectingCollab}
              >
                Yo'q, bekor qilish
              </button>
              <button
                type="button"
                className="btn-disconnect-confirm"
                onClick={handleConfirmDisconnectCollab}
                disabled={disconnectingCollab}
              >
                {disconnectingCollab ? 'Uzilmoqda...' : 'Ha, sheriklikni uzish'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
