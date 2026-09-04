import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useOrg } from '../context/OrgContext';
import { Settings as SettingsIcon, KeyRound, Mail, Check, AlertCircle, Trophy, Plus, Users, Send, X, ShieldAlert, Building2, Pencil, Trash2, Save, Crop, Upload, Award, Layers, Calendar, CheckSquare, Square } from 'lucide-react';
import ImageCropperModal from '../components/ImageCropperModal';
import './Settings.css';

function parseTournamentTier(t) {
  let tier = t?.tier ? Number(t.tier) : 1;
  let parentId = t?.parent_tournament_id ? Number(t.parent_tournament_id) : null;
  let cleanDesc = t?.description || '';

  if (cleanDesc && cleanDesc.includes('[TIER:')) {
    const match = cleanDesc.match(/\[TIER:(\d+)(?:\|PARENT:(\d+|null)?)?\]\s*(.*)/s);
    if (match) {
      if (!t?.tier) tier = Number(match[1]) || 1;
      if (!t?.parent_tournament_id && match[2] && match[2] !== 'null') {
        parentId = Number(match[2]);
      }
      cleanDesc = match[3] || '';
    }
  }

  return { tier, parentId, cleanDescription: cleanDesc };
}

function formatTournamentDescription(tier, parentId, userDesc) {
  const meta = `[TIER:${tier}|PARENT:${parentId || ''}]`;
  const trimmed = (userDesc || '').trim();
  return trimmed ? `${meta}\n${trimmed}` : meta;
}

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
      const client = supabase || supabase;
      
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

  // Tournaments state
  const [tournaments, setTournaments] = useState([]);
  const [allTournamentLeagues, setAllTournamentLeagues] = useState([]);
  const [allTournamentCollabs, setAllTournamentCollabs] = useState([]);
  const [incomingTournCollabs, setIncomingTournCollabs] = useState([]);
  const [isTournamentModalOpen, setIsTournamentModalOpen] = useState(false);
  const [editingTournament, setEditingTournament] = useState(null);
  const [tournamentName, setTournamentName] = useState('');
  const [tournamentLogo, setTournamentLogo] = useState('');
  const [tournamentBg, setTournamentBg] = useState('');
  const [tournamentStartDate, setTournamentStartDate] = useState('');
  const [tournamentEndDate, setTournamentEndDate] = useState('');
  const [tournamentDesc, setTournamentDesc] = useState('');
  const [tournamentDuration, setTournamentDuration] = useState(90);
  const [tournamentTier, setTournamentTier] = useState(1);
  const [tournamentParentId, setTournamentParentId] = useState(null);
  const [tournamentStatus, setTournamentStatus] = useState('active');
  const [savingTournament, setSavingTournament] = useState(false);
  const [deletingTournamentId, setDeletingTournamentId] = useState(null);

  // Tournament Leagues management modal
  const [isTournLeaguesModalOpen, setIsTournLeaguesModalOpen] = useState(false);
  const [selectedTournForLeagues, setSelectedTournForLeagues] = useState(null);
  const [tournSelectedLeagueIds, setTournSelectedLeagueIds] = useState([]);
  const [savingTournLeagues, setSavingTournLeagues] = useState(false);

  // Tournament Collab modal
  const [selectedTournForCollab, setSelectedTournForCollab] = useState(null);
  const [targetTournOrgEmail, setTargetTournOrgEmail] = useState('');
  const [sendingTournCollab, setSendingTournCollab] = useState(false);

  // Teams for team count in leagues
  const [allOrgTeams, setAllOrgTeams] = useState([]);

  // Direct upload refs for tournament
  const directTournLogoInputRef = useRef(null);
  const tournBgFileInputRef = useRef(null);
  const [logoUploadTournId, setLogoUploadTournId] = useState(null);
  const [bgUploadTournId, setBgUploadTournId] = useState(null);

  useEffect(() => {
    loadAllSettingsData();
  }, [orgId]);

  const loadAllSettingsData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchUserData(),
        fetchLeaguesAndOrgs(),
        fetchTournamentsData()
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
        const { data: dateSponsors } = await (supabase || supabase)
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

  const fetchTournamentsData = async () => {
    try {
      // 1. Fetch own tournaments
      const { data: ownTourns, error: ownErr } = await supabase
        .from('tournaments')
        .select('*')
        .eq('organization_id', orgId)
        .order('id', { ascending: true });

      if (ownErr && ownErr.code !== 'PGRST205') {
        console.warn('Error fetching own tournaments:', ownErr.message);
      }

      // 2. Fetch tournament collabs
      const { data: tournCollabs } = await supabase
        .from('tournament_cohosts')
        .select(`
          *,
          tournament:tournament_id (*),
          sender_org:sender_org_id (id, name, logo_url),
          receiver_org:receiver_org_id (id, name, logo_url)
        `)
        .or(`receiver_org_id.eq.${orgId},sender_org_id.eq.${orgId}`)
        .order('created_at', { ascending: false });

      if (tournCollabs) {
        setAllTournamentCollabs(tournCollabs);
        setIncomingTournCollabs(tournCollabs.filter(c => c.receiver_org_id === orgId && c.status === 'pending'));
      } else {
        setAllTournamentCollabs([]);
        setIncomingTournCollabs([]);
      }

      // Merge own and accepted collab tournaments
      const acceptedCollabs = (tournCollabs || []).filter(c => c.status === 'accepted');
      const collabTournaments = acceptedCollabs
        .map(c => c.tournament)
        .filter(t => t && t.organization_id !== orgId);

      const allTournMap = new Map();
      (ownTourns || []).forEach(t => allTournMap.set(t.id, { ...t, isOwn: true }));
      collabTournaments.forEach(t => {
        if (!allTournMap.has(t.id)) {
          allTournMap.set(t.id, { ...t, isOwn: false, isCollab: true });
        }
      });
      setTournaments(Array.from(allTournMap.values()));

      // 3. Fetch tournament leagues
      const { data: tLeagues } = await supabase
        .from('tournament_leagues')
        .select('*, league:league_id (id, name, logo_url)');
      setAllTournamentLeagues(tLeagues || []);

      // 4. Fetch teams for counting
      const { data: teamsData } = await supabase
        .from('teams')
        .select('id, name, league, organization_id');
      setAllOrgTeams(teamsData || []);
    } catch (err) {
      console.warn('Notice regarding tournaments fetch:', err);
    }
  };

  const startEditTournament = (tourn) => {
    const parsed = parseTournamentTier(tourn);
    setEditingTournament(tourn);
    setTournamentName(tourn.name || '');
    setTournamentLogo(tourn.logo_url || '');
    setTournamentBg(tourn.export_bg_url || '');
    setTournamentStartDate(tourn.start_date || '');
    setTournamentEndDate(tourn.end_date || '');
    setTournamentDesc(parsed.cleanDescription || '');
    setTournamentDuration(tourn.match_duration || 90);
    setTournamentTier(parsed.tier);
    setTournamentParentId(parsed.parentId);
    setTournamentStatus(tourn.status || 'active');
    setIsTournamentModalOpen(true);
  };

  const cancelEditTournament = () => {
    setEditingTournament(null);
    setTournamentName('');
    setTournamentLogo('');
    setTournamentBg('');
    setTournamentStartDate('');
    setTournamentEndDate('');
    setTournamentDesc('');
    setTournamentDuration(90);
    setTournamentTier(1);
    setTournamentParentId(null);
    setTournamentStatus('active');
    setIsTournamentModalOpen(false);
  };

  const handleSaveTournament = async (e) => {
    e.preventDefault();
    if (!tournamentName.trim()) return;
    setSavingTournament(true);

    try {
      const descToSave = formatTournamentDescription(tournamentTier, tournamentTier === 2 ? tournamentParentId : null, tournamentDesc);

      const basePayload = {
        name: tournamentName.trim(),
        logo_url: tournamentLogo.trim() || null,
        export_bg_url: tournamentBg.trim() || null,
        start_date: tournamentStartDate || null,
        end_date: tournamentEndDate || null,
        description: descToSave || null,
        match_duration: Number(tournamentDuration) || 90,
        status: tournamentStatus || 'active'
      };

      const fullPayload = {
        ...basePayload,
        tier: Number(tournamentTier) || 1,
        parent_tournament_id: tournamentTier === 2 ? tournamentParentId : null,
      };

      if (editingTournament) {
        let { error } = await supabase
          .from('tournaments')
          .update(fullPayload)
          .eq('id', editingTournament.id);

        if (error && (error.code === '42703' || error.message?.includes('column'))) {
          const retry = await supabase
            .from('tournaments')
            .update(basePayload)
            .eq('id', editingTournament.id);
          if (retry.error) throw retry.error;
        } else if (error) {
          throw error;
        }
      } else {
        let { error } = await supabase
          .from('tournaments')
          .insert([{ ...fullPayload, organization_id: orgId }]);

        if (error && (error.code === '42703' || error.message?.includes('column'))) {
          const retry = await supabase
            .from('tournaments')
            .insert([{ ...basePayload, organization_id: orgId }]);
          if (retry.error) throw retry.error;
        } else if (error) {
          throw error;
        }
      }

      cancelEditTournament();
      await fetchTournamentsData();
    } catch (err) {
      console.error('Error saving tournament:', err);
      alert('Turnirni saqlashda xatolik yuz berdi: ' + err.message);
    } finally {
      setSavingTournament(false);
    }
  };

  const handleDeleteTournament = async (tourn) => {
    if (!window.confirm(`"${tourn.name}" turnirini o'chirishni tasdiqlaysizmi? Unga bog'langan ligalar va o'yinlar ham ajratiladi.`)) {
      return;
    }
    setDeletingTournamentId(tourn.id);
    try {
      const { error } = await supabase
        .from('tournaments')
        .delete()
        .eq('id', tourn.id);
      if (error) throw error;
      await fetchTournamentsData();
    } catch (err) {
      console.error('Error deleting tournament:', err);
      alert('Turnirni o\'chirishda xatolik: ' + err.message);
    } finally {
      setDeletingTournamentId(null);
    }
  };

  const handleUpdateTournDurationDirect = async (tournId, newDuration) => {
    const durNum = Number(newDuration);
    setTournaments(prev => prev.map(t => t.id === tournId ? { ...t, match_duration: durNum } : t));
    try {
      await supabase.from('tournaments').update({ match_duration: durNum }).eq('id', tournId);
    } catch (e) {
      console.error('Error updating tournament duration:', e);
    }
  };

  const handleTournLogoDirectUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !logoUploadTournId) return;

    try {
      const fileExt = file.name.split('.').pop() || 'png';
      const fileName = `tourn_logo_${logoUploadTournId}_${Date.now()}.${fileExt}`;
      const filePath = `tournaments/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('applications')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('applications')
        .getPublicUrl(filePath);

      await supabase.from('tournaments').update({ logo_url: publicUrl }).eq('id', logoUploadTournId);
      await fetchTournamentsData();
    } catch (err) {
      console.error('Error uploading tournament logo:', err);
      alert('Logo yuklashda xatolik: ' + err.message);
    } finally {
      setLogoUploadTournId(null);
      if (directTournLogoInputRef.current) directTournLogoInputRef.current.value = '';
    }
  };

  const handleTournBgDirectUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !bgUploadTournId) return;

    try {
      const fileExt = file.name.split('.').pop() || 'png';
      const fileName = `tourn_bg_${bgUploadTournId}_${Date.now()}.${fileExt}`;
      const filePath = `tournaments/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('applications')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('applications')
        .getPublicUrl(filePath);

      await supabase.from('tournaments').update({ export_bg_url: publicUrl }).eq('id', bgUploadTournId);
      await fetchTournamentsData();
    } catch (err) {
      console.error('Error uploading tournament background:', err);
      alert('Fon rasm yuklashda xatolik: ' + err.message);
    } finally {
      setBgUploadTournId(null);
      if (tournBgFileInputRef.current) tournBgFileInputRef.current.value = '';
    }
  };

  const handleDeleteTournBg = async (tourn) => {
    if (!window.confirm(`"${tourn.name}" turnirining fon rasmini o'chirmoqchimisiz?`)) return;
    try {
      await supabase.from('tournaments').update({ export_bg_url: null }).eq('id', tourn.id);
      await fetchTournamentsData();
    } catch (e) {
      console.error('Error deleting tourn bg:', e);
    }
  };

  const handleOpenTournLeaguesModal = (tourn) => {
    setSelectedTournForLeagues(tourn);
    const linkedLeagueIds = allTournamentLeagues
      .filter(tl => tl.tournament_id === tourn.id)
      .map(tl => tl.league_id);
    setTournSelectedLeagueIds(linkedLeagueIds);
    setIsTournLeaguesModalOpen(true);
  };

  const toggleLeagueForTournament = (leagueId) => {
    setTournSelectedLeagueIds(prev => 
      prev.includes(leagueId) ? prev.filter(id => id !== leagueId) : [...prev, leagueId]
    );
  };

  const handleSaveTournLeagues = async () => {
    if (!selectedTournForLeagues) return;
    setSavingTournLeagues(true);

    try {
      const tournId = selectedTournForLeagues.id;
      // 1. Delete removed links
      await supabase
        .from('tournament_leagues')
        .delete()
        .eq('tournament_id', tournId);

      // 2. Insert selected links
      if (tournSelectedLeagueIds.length > 0) {
        const rowsToInsert = tournSelectedLeagueIds.map(lId => ({
          tournament_id: tournId,
          league_id: lId
        }));
        const { error: insErr } = await supabase
          .from('tournament_leagues')
          .insert(rowsToInsert);
        if (insErr) throw insErr;
      }

      setIsTournLeaguesModalOpen(false);
      setSelectedTournForLeagues(null);
      await fetchTournamentsData();
    } catch (err) {
      console.error('Error updating tournament leagues:', err);
      alert('Ligalarni biriktirishda xatolik: ' + err.message);
    } finally {
      setSavingTournLeagues(false);
    }
  };

  const handleSendTournCollab = async (e) => {
    e.preventDefault();
    if (!targetTournOrgEmail.trim() || !selectedTournForCollab) return;
    setSendingTournCollab(true);

    try {
      const { data: targetOrg } = await supabase
        .from('organizations')
        .select('id, name')
        .eq('admin_email', targetTournOrgEmail.trim().toLowerCase())
        .maybeSingle();

      if (!targetOrg) {
        alert("Bunday emailga ega tashkilot topilmadi.");
        return;
      }

      if (targetOrg.id === orgId) {
        alert("O'z tashkilotingizga hamkorlik taklifini yubora olmaysiz.");
        return;
      }

      const { error: insErr } = await supabase
        .from('tournament_cohosts')
        .insert([{
          tournament_id: selectedTournForCollab.id,
          sender_org_id: orgId,
          receiver_org_id: targetOrg.id,
          status: 'pending'
        }]);

      if (insErr) throw insErr;

      alert(`Hamkorlik taklifi "${targetOrg.name}" tashkilotiga muvaffaqiyatli yuborildi!`);
      setSelectedTournForCollab(null);
      setTargetTournOrgEmail('');
      await fetchTournamentsData();
    } catch (err) {
      console.error('Error sending tournament collab:', err);
      alert('Taklif yuborishda xatolik: ' + err.message);
    } finally {
      setSendingTournCollab(false);
    }
  };

  const handleAcceptTournCollab = async (collabId) => {
    try {
      await supabase.from('tournament_cohosts').update({ status: 'accepted' }).eq('id', collabId);
      await fetchTournamentsData();
    } catch (e) {
      console.error('Error accepting collab:', e);
    }
  };

  const handleRejectTournCollab = async (collabId) => {
    try {
      await supabase.from('tournament_cohosts').update({ status: 'rejected' }).eq('id', collabId);
      await fetchTournamentsData();
    } catch (e) {
      console.error('Error rejecting collab:', e);
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
      const client = supabase || supabase;
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
          is_junior: isJunior,
          duration: matchDuration ? Number(matchDuration) : 60,
          start_date: startDate ? startDate : null,
        };

        const fullPayload = {
          ...safePayload,
          season: cleanSeason,
          status: leagueStatus,
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

        if (matchDuration && targetId) {
          localStorage.setItem(`hfl_league_duration_${targetId}`, String(matchDuration));
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
          is_junior: isJunior,
          duration: matchDuration ? Number(matchDuration) : 60,
          start_date: startDate ? startDate : null,
        };

        const fullInsertPayload = {
          ...safeInsertPayload,
          season: cleanSeason,
          status: leagueStatus,
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

        if (newLeague && matchDuration) {
          localStorage.setItem(`hfl_league_duration_${newLeague.id}`, String(matchDuration));
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

            {/* Hidden file inputs for Tournaments */}
            <input 
              type="file" 
              ref={directTournLogoInputRef} 
              style={{ display: 'none' }} 
              accept="image/*" 
              onChange={handleTournLogoDirectUpload} 
            />
            <input 
              type="file" 
              ref={tournBgFileInputRef} 
              style={{ display: 'none' }} 
              accept="image/*" 
              onChange={handleTournBgDirectUpload} 
            />

            {/* ========================================================================= */}
            {/* TASHKILOT TURNIRLARI BOSHQARUVI                                           */}
            {/* ========================================================================= */}
            <div className="settings-card" style={{ marginTop: '30px' }}>
              <div className="settings-card-header" style={{ justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Award size={22} color="#00FF66" />
                  <div>
                    <h2>Tashkilot Turnirlari Boshqaruvi</h2>
                    <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
                      Turnir jamoalardan emas, mavjud ligalardan tashkil topadi. Liga qo'shilganda uning barcha jamoalari avtomatik turnirga o'tadi.
                    </p>
                  </div>
                </div>
              </div>

              {/* Kiruvchi hamkorlik so'rovlari (Turnirlar) */}
              {incomingTournCollabs.length > 0 && (
                <div style={{ marginBottom: '20px', padding: '12px 16px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '12px' }}>
                  <h4 style={{ color: '#60a5fa', margin: '0 0 10px 0', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Send size={16} /> Kutilayotgan Turnir Hamkorlik Takliflari ({incomingTournCollabs.length})
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {incomingTournCollabs.map(c => (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.3)', padding: '8px 12px', borderRadius: '8px' }}>
                        <div>
                          <strong style={{ color: '#fff' }}>{c.tournament?.name}</strong>
                          <span style={{ color: '#94a3b8', fontSize: '12px', marginLeft: '8px' }}>
                            ({c.sender_org?.name || 'Tashkilot'}dan taklif)
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={() => handleAcceptTournCollab(c.id)}
                            style={{ background: '#10b981', color: '#fff', border: 'none', padding: '5px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                          >
                            Qabul qilish
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRejectTournCollab(c.id)}
                            style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '5px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
                          >
                            Rad etish
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Turnirlar Ro'yxati */}
              <div className="leagues-list-container">
                <h3>Mavjud Turnirlar ({tournaments.length})</h3>
                {tournaments.length === 0 ? (
                  <p className="no-data-text" style={{ padding: '24px 0', textAlign: 'center' }}>
                    Hali turnirlar yaratilmagan. Quyidagi tugma orqali yangi turnir qo'shing.
                  </p>
                ) : (
                  <div className="leagues-grid">
                    {tournaments.map(t => {
                      const isOwner = t.isOwn !== false && t.organization_id === orgId;
                      const linkedLeagues = allTournamentLeagues
                        .filter(tl => tl.tournament_id === t.id)
                        .map(tl => tl.league)
                        .filter(Boolean);

                      // Calculate teams count from linked leagues
                      const linkedLeagueNames = linkedLeagues.map(l => l.name.trim().toLowerCase());
                      const matchingTeams = allOrgTeams.filter(team => {
                        if (!team.league) return false;
                        const tLeagues = team.league.split(',').map(s => s.trim().toLowerCase());
                        return tLeagues.some(lName => linkedLeagueNames.includes(lName));
                      });

                      return (
                        <div key={t.id} className={`league-card-drawn ${editingTournament?.id === t.id ? 'editing' : ''}`}>
                          {/* Banner / Bg */}
                          <div 
                            className="league-card-bg-banner"
                            style={t.export_bg_url ? { backgroundImage: `linear-gradient(180deg, rgba(0, 0, 0, 0.45) 0%, rgba(0, 0, 0, 0.8) 100%), url(${t.export_bg_url})` } : {}}
                          >
                            {/* Logo */}
                            <div 
                              className={`league-card-logo-area ${isOwner ? 'clickable' : ''}`}
                              onClick={(e) => {
                                if (!isOwner) return;
                                e.stopPropagation();
                                setLogoUploadTournId(t.id);
                                directTournLogoInputRef.current?.click();
                              }}
                              title={isOwner ? "Turnir logotipini almashtirish uchun bosing" : ""}
                            >
                              {t.logo_url ? (
                                <img src={t.logo_url} alt={t.name} className="league-card-logo-img" />
                              ) : (
                                <div className="league-card-logo-placeholder">
                                  <Award size={24} color="#00FF66" />
                                </div>
                              )}
                              {isOwner && (
                                <div className="logo-hover-badge">
                                  <Upload size={12} />
                                </div>
                              )}
                            </div>

                            {/* Bg upload button */}
                            {isOwner && (
                              <button
                                type="button"
                                className="btn-upload-bg-trigger"
                                onClick={() => {
                                  setBgUploadTournId(t.id);
                                  tournBgFileInputRef.current?.click();
                                }}
                              >
                                <Upload size={14} />
                                <span>{t.export_bg_url ? "Fonni almashtirish" : "Fon rasmi yuklash"}</span>
                              </button>
                            )}

                            {/* Delete Bg button */}
                            {isOwner && t.export_bg_url && (
                              <button
                                type="button"
                                className="btn-delete-bg-corner"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteTournBg(t);
                                }}
                                title="Fon rasmini o'chirish"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>

                          {/* Info Section */}
                          <div className="league-card-bottom">
                            <div className="league-card-name-section">
                              <h4 className="league-title">{t.name}</h4>
                              <div className="league-badges-wrap">
                                {(() => {
                                  const parsed = parseTournamentTier(t);
                                  const pObj = parsed.parentId ? tournaments.find(x => Number(x.id) === Number(parsed.parentId)) : null;
                                  return (
                                    <>
                                      {parsed.tier === 1 ? (
                                        <span className="junior-badge" style={{ background: 'rgba(0, 255, 102, 0.15)', color: '#00FF66', borderColor: 'rgba(0, 255, 102, 0.3)' }}>
                                          🏆 1-DARAJALI
                                        </span>
                                      ) : (
                                        <span className="junior-badge" style={{ background: 'rgba(192, 132, 252, 0.15)', color: '#C084FC', borderColor: 'rgba(192, 132, 252, 0.35)' }}>
                                          🥈 2-DARAJALI {pObj ? `(${pObj.name})` : ''}
                                        </span>
                                      )}
                                    </>
                                  );
                                })()}

                                {t.status === 'completed' ? (
                                  <span className="junior-badge" style={{ background: 'rgba(255, 170, 0, 0.15)', color: '#ffaa00', borderColor: 'rgba(255, 170, 0, 0.3)' }}>
                                    📦 YAKUNLANGAN
                                  </span>
                                ) : (
                                  <span className="junior-badge" style={{ background: 'rgba(0, 255, 102, 0.15)', color: '#00FF66', borderColor: 'rgba(0, 255, 102, 0.3)' }}>
                                    ⚡ FAOL
                                  </span>
                                )}

                                {t.start_date && (
                                  <span className="junior-badge" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', borderColor: 'rgba(59, 130, 246, 0.3)' }}>
                                    📅 {t.start_date}
                                  </span>
                                )}

                                {isOwner ? (
                                  <select
                                    value={t.match_duration || 90}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      handleUpdateTournDurationDirect(t.id, e.target.value);
                                    }}
                                    style={{
                                      background: 'rgba(59, 130, 246, 0.2)',
                                      color: '#60a5fa',
                                      border: '1px solid rgba(59, 130, 246, 0.4)',
                                      borderRadius: '8px',
                                      padding: '3px 8px',
                                      fontSize: '11px',
                                      fontWeight: '700',
                                      cursor: 'pointer'
                                    }}
                                    title="O'yin vaqti"
                                  >
                                    <option value={90} style={{ background: '#1e293b' }}>⏱️ 90 daq</option>
                                    <option value={80} style={{ background: '#1e293b' }}>⏱️ 80 daq</option>
                                    <option value={70} style={{ background: '#1e293b' }}>⏱️ 70 daq</option>
                                    <option value={60} style={{ background: '#1e293b' }}>⏱️ 60 daq</option>
                                    <option value={50} style={{ background: '#1e293b' }}>⏱️ 50 daq</option>
                                    <option value={40} style={{ background: '#1e293b' }}>⏱️ 40 daq</option>
                                    <option value={30} style={{ background: '#1e293b' }}>⏱️ 30 daq</option>
                                    <option value={20} style={{ background: '#1e293b' }}>⏱️ 20 daq</option>
                                  </select>
                                ) : (
                                  <span className="junior-badge">⏱️ {t.match_duration || 90} daq</span>
                                )}
                              </div>

                              {/* Biriktirilgan Ligalar va Jamoalar Ko'rsatkichi */}
                              <div style={{ marginTop: '10px', padding: '8px 10px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                                  <span style={{ color: '#94a3b8' }}>Biriktirilgan ligalar:</span>
                                  <strong style={{ color: '#00FF66' }}>{linkedLeagues.length} ta liga</strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', marginTop: '4px' }}>
                                  <span style={{ color: '#94a3b8' }}>Ishtirokchi jamoalar:</span>
                                  <strong style={{ color: '#38bdf8' }}>{matchingTeams.length} ta jamoa</strong>
                                </div>
                                {linkedLeagues.length > 0 && (
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                                    {linkedLeagues.map(l => (
                                      <span key={l.id} style={{ fontSize: '10px', background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px', color: '#e2e8f0' }}>
                                        {l.name}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="league-card-action-tabs">
                              {isOwner && (
                                <button
                                  type="button"
                                  className="action-tab"
                                  style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.3)' }}
                                  onClick={() => handleOpenTournLeaguesModal(t)}
                                  title="Turnirga ligalarni biriktirish"
                                >
                                  <Layers size={13} /> <span>Ligalar ({linkedLeagues.length})</span>
                                </button>
                              )}

                              {isOwner && (
                                <button
                                  type="button"
                                  className="action-tab btn-tab-collab"
                                  onClick={() => setSelectedTournForCollab(t)}
                                  title="Hamkorlik taklifi yuborish"
                                >
                                  <Send size={13} /> <span>Collab</span>
                                </button>
                              )}

                              {isOwner && (
                                <>
                                  <button
                                    type="button"
                                    className="action-tab btn-tab-edit"
                                    onClick={() => startEditTournament(t)}
                                    title="Tahrirlash"
                                  >
                                    <Pencil size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    className="action-tab btn-tab-delete"
                                    onClick={() => handleDeleteTournament(t)}
                                    disabled={deletingTournamentId === t.id}
                                    title="O'chirish"
                                  >
                                    {deletingTournamentId === t.id ? <span className="btn-spinner"></span> : <Trash2 size={14} />}
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

                {/* Add Tournament Button */}
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
                      cancelEditTournament();
                      setIsTournamentModalOpen(true);
                    }}
                  >
                    <Plus size={18} />
                    <span>TURNIR QO'SHISH</span>
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

      {/* ========================================================================= */}
      {/* 1. TURNIR YARATISH / TAHRIRLASH MODALI                                    */}
      {/* ========================================================================= */}
      {isTournamentModalOpen && (
        <div className="settings-modal-overlay" onClick={cancelEditTournament}>
          <div className="settings-modal league-management-modal" style={{ maxWidth: '520px' }} onClick={e => e.stopPropagation()}>
            <div className="settings-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Award size={22} color="#00FF66" />
                <h3>{editingTournament ? 'Turnirni Tahrirlash' : 'Yangi Turnir Yaratish'}</h3>
              </div>
              <button type="button" className="btn-close-modal" onClick={cancelEditTournament}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveTournament} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
              <div className="form-group">
                <label style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '6px', display: 'block' }}>Turnir Nomi *</label>
                <input
                  type="text"
                  value={tournamentName}
                  onChange={e => setTournamentName(e.target.value)}
                  placeholder="Masalan: Qishki Chempionlar Kubogi 2026"
                  required
                  style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', color: '#fff' }}
                />
              </div>

              {/* Turnir Darajasi (Tier Selection) */}
              <div className="form-group">
                <label style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '8px', display: 'block' }}>Turnir Darajasi *</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setTournamentTier(1);
                      setTournamentParentId(null);
                    }}
                    style={{
                      padding: '12px',
                      borderRadius: '10px',
                      border: tournamentTier === 1 ? '1px solid #00FF66' : '1px solid rgba(255,255,255,0.15)',
                      background: tournamentTier === 1 ? 'rgba(0, 255, 102, 0.12)' : 'rgba(255,255,255,0.04)',
                      color: tournamentTier === 1 ? '#00FF66' : '#fff',
                      textAlign: 'left',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ fontWeight: '800', fontSize: '13px', marginBottom: '2px' }}>🏆 1-Darajali</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>Asosiy (Chempionlar Ligasi)</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTournamentTier(2);
                      if (!tournamentParentId) {
                        const firstT1 = tournaments.find(t => {
                          if (editingTournament && t.id === editingTournament.id) return false;
                          const p = parseTournamentTier(t);
                          return p.tier === 1;
                        });
                        if (firstT1) setTournamentParentId(firstT1.id);
                      }
                    }}
                    style={{
                      padding: '12px',
                      borderRadius: '10px',
                      border: tournamentTier === 2 ? '1px solid #C084FC' : '1px solid rgba(255,255,255,0.15)',
                      background: tournamentTier === 2 ? 'rgba(192, 132, 252, 0.12)' : 'rgba(255,255,255,0.04)',
                      color: tournamentTier === 2 ? '#C084FC' : '#fff',
                      textAlign: 'left',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ fontWeight: '800', fontSize: '13px', marginBottom: '2px' }}>🥈 2-Darajali</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>Quyi (Europa Ligasi)</div>
                  </button>
                </div>
              </div>

              {/* If Tier 2: Parent Tournament Selector */}
              {tournamentTier === 2 && (
                <div style={{ padding: '12px', borderRadius: '10px', background: 'rgba(192, 132, 252, 0.08)', border: '1px solid rgba(192, 132, 252, 0.3)' }}>
                  <label style={{ fontSize: '12px', color: '#E9D5FF', fontWeight: '700', marginBottom: '4px', display: 'block' }}>
                    Bog'langan 1-darajali (asosiy) turnir *
                  </label>
                  <p style={{ fontSize: '11px', color: '#94a3b8', margin: '0 0 8px 0' }}>
                    Ushbu 2-darajali turnirga tanlangan 1-darajali turnirning 1/4 finaliga o'tolmagan jamoalari biriktiriladi.
                  </p>
                  <select
                    value={tournamentParentId || ''}
                    onChange={e => setTournamentParentId(Number(e.target.value) || null)}
                    style={{ width: '100%', padding: '10px 14px', background: '#1e293b', border: '1px solid rgba(192, 132, 252, 0.4)', borderRadius: '8px', color: '#fff' }}
                  >
                    <option value="">1-darajali turnirni tanlang...</option>
                    {tournaments
                      .filter(t => {
                        if (editingTournament && t.id === editingTournament.id) return false;
                        const p = parseTournamentTier(t);
                        return p.tier === 1;
                      })
                      .map(t1 => (
                        <option key={t1.id} value={t1.id}>
                          🏆 {t1.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '6px', display: 'block' }}>Boshlanish Sanasi</label>
                  <input
                    type="date"
                    value={tournamentStartDate}
                    onChange={e => setTournamentStartDate(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', color: '#fff' }}
                  />
                </div>
                <div className="form-group">
                  <label style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '6px', display: 'block' }}>Tugash Sanasi</label>
                  <input
                    type="date"
                    value={tournamentEndDate}
                    onChange={e => setTournamentEndDate(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', color: '#fff' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '6px', display: 'block' }}>O'yin Davomiyligi</label>
                  <select
                    value={tournamentDuration}
                    onChange={e => setTournamentDuration(Number(e.target.value))}
                    style={{ width: '100%', padding: '10px 14px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', color: '#fff' }}
                  >
                    <option value={90}>⏱️ 90 daqiqa</option>
                    <option value={80}>⏱️ 80 daqiqa</option>
                    <option value={70}>⏱️ 70 daqiqa</option>
                    <option value={60}>⏱️ 60 daqiqa</option>
                    <option value={50}>⏱️ 50 daqiqa</option>
                    <option value={40}>⏱️ 40 daqiqa</option>
                    <option value={30}>⏱️ 30 daqiqa</option>
                    <option value={20}>⏱️ 20 daqiqa</option>
                  </select>
                </div>
                <div className="form-group">
                  <label style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '6px', display: 'block' }}>Holati</label>
                  <select
                    value={tournamentStatus}
                    onChange={e => setTournamentStatus(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', color: '#fff' }}
                  >
                    <option value="active">⚡ Faol</option>
                    <option value="completed">📦 Yakunlangan</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '6px', display: 'block' }}>Tavsif (ixtiyoriy)</label>
                <textarea
                  value={tournamentDesc}
                  onChange={e => setTournamentDesc(e.target.value)}
                  placeholder="Turnir qoidalari, sovrin jamg'armasi yoki maqsadi..."
                  rows={3}
                  style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', color: '#fff', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={cancelEditTournament}
                  style={{ padding: '10px 18px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '10px', color: '#fff', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={savingTournament}
                  style={{ padding: '10px 22px', background: '#00FF66', border: 'none', borderRadius: '10px', color: '#000', cursor: 'pointer', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  {savingTournament ? <span className="btn-spinner"></span> : <Save size={16} />}
                  <span>{editingTournament ? 'Saqlash' : 'Yaratish'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. TURNIRGA LIGALAR BIRIKTIRISH MODALI                                     */}
      {/* ========================================================================= */}
      {isTournLeaguesModalOpen && selectedTournForLeagues && (
        <div className="settings-modal-overlay" onClick={() => setIsTournLeaguesModalOpen(false)}>
          <div className="settings-modal league-management-modal" style={{ maxWidth: '580px' }} onClick={e => e.stopPropagation()}>
            <div className="settings-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Layers size={22} color="#38bdf8" />
                <div>
                  <h3 style={{ margin: 0 }}>Turnirga Ligalarni Biriktirish</h3>
                  <span style={{ fontSize: '13px', color: '#38bdf8' }}>{selectedTournForLeagues.name}</span>
                </div>
              </div>
              <button type="button" className="btn-close-modal" onClick={() => setIsTournLeaguesModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '13px', color: '#94a3b8', margin: '14px 0 16px 0' }}>
              Turnir jamoalardan emas, ligalardan iborat. Bitta ligani tanlasangiz, o'sha liganing barcha jamoalari <strong>avtomatik</strong> ushbu turnir ishtirokchisiga aylanadi.
            </p>

            <div style={{ maxHeight: '350px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
              {leagues.length === 0 ? (
                <p style={{ color: '#94a3b8', textAlign: 'center', padding: '20px' }}>Tashkilotda hali ligalar mavjud emas.</p>
              ) : (
                leagues.map(l => {
                  const isSelected = tournSelectedLeagueIds.includes(l.id);
                  // Count teams in this league
                  const lTeams = allOrgTeams.filter(t => (t.league || '').split(',').map(s => s.trim().toLowerCase()).includes(l.name.trim().toLowerCase()));

                  return (
                    <div
                      key={l.id}
                      onClick={() => toggleLeagueForTournament(l.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        borderRadius: '10px',
                        background: isSelected ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255,255,255,0.04)',
                        border: isSelected ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.08)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ color: isSelected ? '#38bdf8' : '#64748b' }}>
                          {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
                        </div>
                        {l.logo_url && (
                          <img src={l.logo_url} alt="" style={{ width: '28px', height: '28px', objectFit: 'contain' }} />
                        )}
                        <div>
                          <strong style={{ color: '#fff', fontSize: '14px' }}>{l.name}</strong>
                          <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                            {l.season || '2026/2027'} {l.is_junior ? '• Junior' : ''}
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '12px', fontWeight: 'bold', color: isSelected ? '#38bdf8' : '#94a3b8', background: 'rgba(255,255,255,0.08)', padding: '4px 8px', borderRadius: '6px' }}>
                          {lTeams.length} ta jamoa
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div style={{ marginTop: '20px', padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: '#94a3b8' }}>
                Tanlangan: <strong style={{ color: '#38bdf8' }}>{tournSelectedLeagueIds.length} ta liga</strong>
              </span>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsTournLeaguesModalOpen(false)}
                  style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer' }}
                >
                  Yopish
                </button>
                <button
                  type="button"
                  onClick={handleSaveTournLeagues}
                  disabled={savingTournLeagues}
                  style={{ padding: '8px 20px', background: '#38bdf8', border: 'none', borderRadius: '8px', color: '#000', fontWeight: '900', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  {savingTournLeagues ? <span className="btn-spinner"></span> : <Save size={16} />}
                  <span>Saqlash</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. TURNIR HAMKORLIGI (COLLAB) MODALI                                      */}
      {/* ========================================================================= */}
      {selectedTournForCollab && (
        <div className="settings-modal-overlay" onClick={() => setSelectedTournForCollab(null)}>
          <div className="settings-modal league-management-modal" style={{ maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
            <div className="settings-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Send size={20} color="#60a5fa" />
                <h3>Turnir Hamkorlik Taklifi</h3>
              </div>
              <button type="button" className="btn-close-modal" onClick={() => setSelectedTournForCollab(null)}>
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '13px', color: '#94a3b8', margin: '12px 0 16px 0' }}>
              <strong>"{selectedTournForCollab.name}"</strong> turnirini boshqa tashkilot bilan birgalikda o'tkazish uchun uning admin email manzilini kiriting:
            </p>

            <form onSubmit={handleSendTournCollab} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-group">
                <label style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '6px', display: 'block' }}>Hamkor Tashkilot Admin Emaili</label>
                <input
                  type="email"
                  value={targetTournOrgEmail}
                  onChange={e => setTargetTournOrgEmail(e.target.value)}
                  placeholder="admin@hamkor-liga.uz"
                  required
                  style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', color: '#fff' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setSelectedTournForCollab(null)}
                  style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer' }}
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={sendingTournCollab}
                  style={{ padding: '8px 20px', background: '#3b82f6', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  {sendingTournCollab ? <span className="btn-spinner"></span> : <Send size={15} />}
                  <span>Taklif Yuborish</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
