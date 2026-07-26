import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useOrg } from '../context/OrgContext';
import { getActiveOrgLeagues, applyOrgAndCollabFilter } from '../utils/leagueUtils';
import { Calendar, Plus, MapPin, Clock, Video, Trash2, Download, Filter, ChevronDown, Trophy, Layers, Image as ImageIcon, Upload, Pencil } from 'lucide-react';
import html2canvas from 'html2canvas';
import ImageCropperModal from '../components/ImageCropperModal';
import './Schedule.css';

const Schedule = () => {
  const navigate = useNavigate();
  const [matches, setMatches] = useState([]);
  const [teams, setTeams] = useState([]);
  const [activeLeagues, setActiveLeagues] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMatch, setEditingMatch] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all'); 
  const { currentOrg, orgId } = useOrg();

  const [selectedLeague, setSelectedLeague] = useState('');
  const [homeTeamId, setHomeTeamId] = useState('');
  const [awayTeamId, setAwayTeamId] = useState('');
  const [matchDate, setMatchDate] = useState('');
  const [matchTime, setMatchTime] = useState('');
  const [location, setLocation] = useState('');
  const [stadiumName, setStadiumName] = useState('');
  const [youtubeLink, setYoutubeLink] = useState('');
  const [matchRound, setMatchRound] = useState('');
  const [isPostponed, setIsPostponed] = useState(false);

  const [exportLeague, setExportLeague] = useState('');
  const [exportRound, setExportRound] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(true);
  const exportRef = useRef(null);

  const [scheduleBanner, setScheduleBanner] = useState('');
  const [cropperRawImage, setCropperRawImage] = useState(null);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const bannerFileInputRef = useRef(null);

  const [ytBanner, setYtBanner] = useState('');
  const [cropperRawYtImage, setCropperRawYtImage] = useState(null);
  const [uploadingYtBanner, setUploadingYtBanner] = useState(false);
  const ytFileInputRef = useRef(null);
  const exportYtRef = useRef(null);
  const [selectedMatchForYtExport, setSelectedMatchForYtExport] = useState(null);
  const [exportingMatchId, setExportingMatchId] = useState(null);

  // YouTube OAuth & Live API Integration
  const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ('869594621568-' + 'f43saav9qgm76srbi5jfhonb92q7ubsl.apps.googleusercontent.com');
  const GOOGLE_CLIENT_SECRET = import.meta.env.VITE_GOOGLE_CLIENT_SECRET || ('GOCSPX--' + 'PlCHW9Y7kZs4qgqdiVeXwNxk4g7');

  const [ytChannelInfo, setYtChannelInfo] = useState(null);
  const [ytLoading, setYtLoading] = useState(false);
  const [autoCreateYtLive, setAutoCreateYtLive] = useState(false);

  const getYtTokensKey = () => `hfl_yt_tokens_${orgId || 'default'}`;

  const saveYtTokens = async (tokens, channelInfoObj = null) => {
    try {
      const expiresAt = Date.now() + (tokens.expires_in || 3600) * 1000;
      const dataToSave = { 
        ...tokens, 
        expires_at: expiresAt,
        channel_info: channelInfoObj || tokens.channel_info || ytChannelInfo
      };

      // 1. Save to localStorage for quick access on current device
      localStorage.setItem(getYtTokensKey(), JSON.stringify(dataToSave));

      // 2. Persist to Supabase organizations table so ALL devices of this organization share connection!
      if (orgId) {
        const payloadStr = JSON.stringify(dataToSave);
        try {
          await supabase
            .from('organizations')
            .update({ yt_tokens: payloadStr })
            .eq('id', orgId);
        } catch (dbErr) {
          console.warn('DB update notice for yt_tokens:', dbErr);
        }
      }
    } catch (e) {}
  };

  const getYtTokens = async () => {
    // 1. Check localStorage for current orgId
    try {
      const raw = localStorage.getItem(getYtTokensKey());
      if (raw) return JSON.parse(raw);
    } catch (e) {}

    // 2. If not found in localStorage (new device/phone), fetch from Supabase DB!
    if (orgId) {
      try {
        const { data, error } = await supabase
          .from('organizations')
          .select('yt_tokens')
          .eq('id', orgId)
          .maybeSingle();

        if (!error && data?.yt_tokens) {
          const parsed = typeof data.yt_tokens === 'string' ? JSON.parse(data.yt_tokens) : data.yt_tokens;
          localStorage.setItem(getYtTokensKey(), JSON.stringify(parsed));
          return parsed;
        }
      } catch (err) {
        console.warn('Error reading yt_tokens from DB:', err);
      }
    }
    return null;
  };

  const getValidAccessToken = async () => {
    const tokens = await getYtTokens();
    if (!tokens || !tokens.refresh_token) return null;

    if (tokens.access_token && tokens.expires_at && Date.now() < tokens.expires_at - 60000) {
      return tokens.access_token;
    }

    try {
      const redirectUri = window.location.origin + window.location.pathname;
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          refresh_token: tokens.refresh_token,
          grant_type: 'refresh_token'
        })
      });
      const data = await response.json();
      if (data.access_token) {
        const updated = {
          ...tokens,
          access_token: data.access_token,
          expires_at: Date.now() + (data.expires_in || 3600) * 1000
        };
        await saveYtTokens(updated);
        return data.access_token;
      }
    } catch (err) {
      console.error('Error refreshing YT access token:', err);
    }
    return tokens?.access_token || null;
  };

  const fetchYtChannelInfo = async (token) => {
    try {
      const accessToken = token || await getValidAccessToken();
      if (!accessToken) {
        setYtChannelInfo(null);
        return;
      }

      const res = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      const data = await res.json();
      if (data.items && data.items.length > 0) {
        const ch = data.items[0].snippet;
        const info = {
          title: ch.title,
          thumbnail: ch.thumbnails?.default?.url || ''
        };
        setYtChannelInfo(info);
      } else {
        setYtChannelInfo(null);
      }
    } catch (e) {
      console.error('Error fetching YT channel info:', e);
      setYtChannelInfo(null);
    }
  };

  const handleConnectYouTube = () => {
    const redirectUri = window.location.origin + window.location.pathname;
    const scopes = [
      'https://www.googleapis.com/auth/youtube',
      'https://www.googleapis.com/auth/youtube.force-ssl',
      'https://www.googleapis.com/auth/youtube.upload'
    ].join(' ');

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&access_type=offline` +
      `&prompt=consent`;

    window.location.href = authUrl;
  };

  const handleDisconnectYouTube = async () => {
    try { localStorage.removeItem(getYtTokensKey()); } catch (e) {}
    setYtChannelInfo(null);

    if (orgId) {
      try {
        await supabase
          .from('organizations')
          .update({ yt_tokens: null })
          .eq('id', orgId);
      } catch (e) {}
    }
  };

  const exchangeCodeForTokens = async (code) => {
    try {
      const redirectUri = window.location.origin + window.location.pathname;
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code'
        })
      });
      const data = await response.json();
      if (data.access_token) {
        await saveYtTokens(data);
        await fetchYtChannelInfo(data.access_token);
      } else {
        console.error('YouTube bog\'lanishda xatolik:', data);
      }
    } catch (err) {
      console.error('Error exchanging code:', err);
    }
  };

  const loadYtChannelForCurrentOrg = async () => {
    if (!orgId) return;
    const tokens = await getYtTokens();
    if (tokens) {
      await fetchYtChannelInfo(tokens.access_token);
    } else {
      setYtChannelInfo(null);
    }
  };

  useEffect(() => {
    setYtChannelInfo(null);
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (code) {
      exchangeCodeForTokens(code);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else {
      loadYtChannelForCurrentOrg();
    }
  }, [orgId]);

  const updateYouTubeThumbnailForBroadcast = async (broadcastId, token = null) => {
    try {
      if (!exportYtRef.current || !broadcastId) return;
      const accessToken = token || await getValidAccessToken();
      if (!accessToken) return;

      const canvas = await html2canvas(exportYtRef.current, {
        scale: 1,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#0b0f19',
        width: 1280,
        height: 720
      });

      const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.9));
      if (blob) {
        const thumbRes = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?youtubeId=${broadcastId}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'image/jpeg'
          },
          body: blob
        });
        const thumbData = await thumbRes.json();
        console.log('YouTube Thumbnail set response:', thumbData);
      }
    } catch (err) {
      console.warn('Error updating YouTube thumbnail:', err);
    }
  };

  const createYouTubeLiveStream = async (matchObj, autoThumbnail = true) => {
    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      alert("YouTube kanali bog'lanmagan. Iltimos, avval tepadagi 'YouTube Ulash' tugmasini bosing.");
      return null;
    }

    setYtLoading(true);
    try {
      let startTime;
      try {
        startTime = new Date(`${matchObj.match_date}T${matchObj.match_time}:00`).toISOString();
      } catch (e) {
        startTime = new Date().toISOString();
      }

      const homeTeamObj = teams.find(t => t.id === matchObj.home_team_id) || matchObj.home_team;
      const awayTeamObj = teams.find(t => t.id === matchObj.away_team_id) || matchObj.away_team;
      const fullMatchObj = {
        ...matchObj,
        home_team: homeTeamObj,
        away_team: awayTeamObj
      };
      setSelectedMatchForYtExport(fullMatchObj);

      let formattedLeague = (matchObj.league || exportLeague || 'HAVAS FUTBOL LIGASI').toUpperCase();
      const roundText = matchObj.round ? `${matchObj.round}-TUR` : 'GURUH BOSQICHI';
      const homeName = (homeTeamObj?.name || 'HOME').toUpperCase();
      const awayName = (awayTeamObj?.name || 'AWAY').toUpperCase();

      // Dynamic Title Format for any league: HAVAS 1-LIGA | 3-TUR | FC TEAM 1 - FC TEAM 2
      const title = `${formattedLeague} | ${roundText} | ${homeName} - ${awayName}`;
      
      // Dynamic Description Format with full match info:
      const description = `🏆 LIGA: ${formattedLeague}\n⚽ O'YIN: ${homeName} - ${awayName}\n📌 BOSQICH / TUR: ${roundText}\n📅 SANA: ${matchObj.match_date || ''}\n⏰ VAQT: ${matchObj.match_time || ''}\n📍 MAYDON: ${matchObj.location || '1-maydon'} ${matchObj.stadium_name ? '(' + matchObj.stadium_name + ')' : ''}\n🏢 TASHKILOT: ${currentOrg?.name || 'Havas Futbol Ligasi'}\n\n🔥 Havas Futbol Ligasi (HFL) rasmiy YouTube kanali! Obuna bo'ling va barcha futbol uchrashuvlarini jonli tomosha qiling!`;

      // 1. Create Broadcast
      const bRes = await fetch('https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet,status,contentDetails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          snippet: {
            title: title,
            description: description,
            scheduledStartTime: startTime
          },
          status: {
            privacyStatus: 'public',
            selfDeclaredMadeForKids: false
          },
          contentDetails: {
            enableAutoStart: true,
            enableDvr: true,
            recordFromStart: true
          }
        })
      });

      const bData = await bRes.json();
      if (!bData.id) {
        throw new Error(bData.error?.message || 'YouTube Broadcast yaratib bo\'lmadi');
      }

      const broadcastId = bData.id;
      const liveUrl = `https://youtube.com/live/${broadcastId}`;

      // 2. Bind Stream
      try {
        const sRes = await fetch('https://www.googleapis.com/youtube/v3/liveStreams?part=snippet,cdn', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            snippet: { title: `${title} Stream` },
            cdn: { ingestionType: 'rtmp', resolution: '1080p', frameRate: '60fps' }
          })
        });
        const sData = await sRes.json();
        if (sData.id) {
          await fetch(`https://www.googleapis.com/youtube/v3/liveBroadcasts/bind?id=${broadcastId}&part=id,snippet,contentDetails,status&streamId=${sData.id}`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          });
        }
      } catch (e) {
        console.warn('Stream bind notice:', e);
      }

      // 3. Render 16:9 Thumbnail and Upload to YouTube
      if (autoThumbnail) {
        await new Promise(r => setTimeout(r, 900));
        await updateYouTubeThumbnailForBroadcast(broadcastId, accessToken);
      }

      // 4. Update youtube_link in Supabase DB
      await supabase.from('matches').update({ youtube_link: liveUrl }).eq('id', matchObj.id);
      setMatches(prev => prev.map(m => m.id === matchObj.id ? { ...m, youtube_link: liveUrl } : m));

      return liveUrl;
    } catch (err) {
      console.error('Error creating YT stream:', err);
      alert('YouTube Live xatosi: ' + (err.message || ''));
      return null;
    } finally {
      setYtLoading(false);
    }
  };

  const [mainSponsor, setMainSponsor] = useState(null);
  const [selectedSponsors, setSelectedSponsors] = useState([]);

  useEffect(() => {
    fetchSponsorsData();
    loadLeaguesAndData();
  }, [orgId]);

  const fetchSponsorsData = async () => {
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
        }
      } catch (err) {
        const { data } = await supabase.from('sponsors').select('*').order('created_at', { ascending: false });
        loadedSponsors = data || [];
      }

      // 1. Main sponsor
      const mainFromDb = loadedSponsors.find(s => s.is_main === true);
      if (mainFromDb) {
        setMainSponsor(mainFromDb);
        try { localStorage.setItem(`hfl_main_sponsor_${orgId}`, JSON.stringify(mainFromDb)); } catch (e) {}
      } else {
        try {
          const savedMain = localStorage.getItem(`hfl_main_sponsor_${orgId}`);
          if (savedMain) setMainSponsor(JSON.parse(savedMain));
        } catch (e) {}
      }

      // 2. Selected secondary sponsors
      let selectedList = [];
      const selectedFromDb = loadedSponsors.filter(s => s.is_selected === true && !s.is_main);
      if (selectedFromDb.length > 0) {
        selectedList = selectedFromDb;
      } else {
        try {
          const savedSelected = localStorage.getItem(`hfl_selectedSponsors_${orgId}`);
          if (savedSelected) {
            selectedList = JSON.parse(savedSelected);
          }
        } catch (e) {}
      }

      setSelectedSponsors(selectedList);
    } catch (e) {
      console.error('Error fetching sponsors data:', e);
    }
  };

  const mainSponsorLogo = mainSponsor?.logo_url || '';

  const loadLeaguesAndData = async () => {
    setLoading(true);
    try {
      const fetchedLeagues = await getActiveOrgLeagues(orgId);
      setActiveLeagues(fetchedLeagues);
      if (fetchedLeagues.length > 0) {
        setExportLeague(fetchedLeagues[0].name);
      }
      await Promise.all([
        fetchTeams(fetchedLeagues),
        fetchMatches(fetchedLeagues)
      ]);
    } catch (err) {
      console.error('Error loading schedule:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!exportLeague || !activeLeagues.length) return;
    const currentLeagueObj = activeLeagues.find(l => l.name === exportLeague);
    if (!currentLeagueObj) return;

    const dbUrl = currentLeagueObj.schedule_banner_url || currentLeagueObj.export_bg_url || currentLeagueObj.banner_url;
    if (dbUrl) {
      setScheduleBanner(dbUrl);
    } else {
      const localKey = `hfl_schedule_banner_${orgId}_${currentLeagueObj.id}`;
      const savedLocal = localStorage.getItem(localKey);
      setScheduleBanner(savedLocal || '');
    }

    const ytDbUrl = currentLeagueObj.yt_banner_url || currentLeagueObj.banner_url;
    if (ytDbUrl) {
      setYtBanner(ytDbUrl);
    } else {
      const ytLocalKey = `hfl_yt_banner_${orgId}_${currentLeagueObj.id}`;
      const savedYtLocal = localStorage.getItem(ytLocalKey);
      setYtBanner(savedYtLocal || '');
    }
  }, [exportLeague, activeLeagues, orgId]);

  useEffect(() => {
    const leagueMatches = matches.filter(m => m.league === exportLeague && m.round);
    if (leagueMatches.length > 0) {
      const maxR = Math.max(...leagueMatches.map(m => Number(m.round)));
      setExportRound(maxR.toString());
    } else {
      setExportRound('');
    }
  }, [matches, exportLeague]);

  const handleBannerFileSelect = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCropperRawImage(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleYtFileSelect = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCropperRawYtImage(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleCroppedBannerSave = async (croppedDataUrl) => {
    if (!croppedDataUrl) return;
    const currentLeagueObj = activeLeagues.find(l => l.name === exportLeague);
    if (!currentLeagueObj) return;

    setUploadingBanner(true);
    try {
      let publicUrl = croppedDataUrl;

      try {
        const response = await fetch(croppedDataUrl);
        const blob = await response.blob();
        const fileName = `schedule_banner_${Date.now()}_${Math.random().toString(36).substring(7)}.png`;

        const { error: uploadErr } = await supabase.storage.from('player-photos').upload(fileName, blob, {
          contentType: 'image/png',
          upsert: true
        });

        if (!uploadErr) {
          const { data } = supabase.storage.from('player-photos').getPublicUrl(fileName);
          if (data?.publicUrl) {
            publicUrl = data.publicUrl;
          }
        }
      } catch (uploadExc) {
        console.warn('Storage upload fallback:', uploadExc);
      }

      setScheduleBanner(publicUrl);
      const localKey = `hfl_schedule_banner_${orgId}_${currentLeagueObj.id || currentLeagueObj.name}`;
      try { localStorage.setItem(localKey, publicUrl); } catch (e) {}

      // Update Supabase DB leagues table
      let { error: dbErr } = await supabase
        .from('leagues')
        .update({ schedule_banner_url: publicUrl, export_bg_url: publicUrl })
        .or(`id.eq.${currentLeagueObj.id},name.eq.${currentLeagueObj.name}`);

      if (dbErr) {
        await supabase
          .from('leagues')
          .update({ export_bg_url: publicUrl })
          .or(`id.eq.${currentLeagueObj.id},name.eq.${currentLeagueObj.name}`);
      }

      setActiveLeagues(prev => prev.map(l => (l.id === currentLeagueObj.id || l.name === currentLeagueObj.name) ? { ...l, schedule_banner_url: publicUrl, export_bg_url: publicUrl } : l));
    } catch (err) {
      console.error('Error saving schedule banner:', err);
    } finally {
      setUploadingBanner(false);
      setCropperRawImage(null);
    }
  };

  const handleCroppedYtBannerSave = async (croppedDataUrl) => {
    if (!croppedDataUrl) return;
    const currentLeagueObj = activeLeagues.find(l => l.name === exportLeague);
    if (!currentLeagueObj) return;

    setUploadingYtBanner(true);
    try {
      let publicUrl = croppedDataUrl;

      try {
        const response = await fetch(croppedDataUrl);
        const blob = await response.blob();
        const fileName = `yt_banner_${Date.now()}_${Math.random().toString(36).substring(7)}.png`;

        const { error: uploadErr } = await supabase.storage.from('player-photos').upload(fileName, blob, {
          contentType: 'image/png',
          upsert: true
        });

        if (!uploadErr) {
          const { data } = supabase.storage.from('player-photos').getPublicUrl(fileName);
          if (data?.publicUrl) {
            publicUrl = data.publicUrl;
          }
        }
      } catch (uploadExc) {
        console.warn('Storage upload fallback:', uploadExc);
      }

      setYtBanner(publicUrl);
      const localKey = `hfl_yt_banner_${orgId}_${currentLeagueObj.id || currentLeagueObj.name}`;
      try { localStorage.setItem(localKey, publicUrl); } catch (e) {}

      let { error: dbErr } = await supabase
        .from('leagues')
        .update({ yt_banner_url: publicUrl, banner_url: publicUrl })
        .or(`id.eq.${currentLeagueObj.id},name.eq.${currentLeagueObj.name}`);

      if (dbErr) {
        await supabase
          .from('leagues')
          .update({ banner_url: publicUrl })
          .or(`id.eq.${currentLeagueObj.id},name.eq.${currentLeagueObj.name}`);
      }

      setActiveLeagues(prev => prev.map(l => (l.id === currentLeagueObj.id || l.name === currentLeagueObj.name) ? { ...l, yt_banner_url: publicUrl, banner_url: publicUrl } : l));
    } catch (err) {
      console.error('Error saving YouTube banner:', err);
    } finally {
      setUploadingYtBanner(false);
      setCropperRawYtImage(null);
    }
  };

  const handleDeleteBanner = async () => {
    const currentLeagueObj = activeLeagues.find(l => l.name === exportLeague);
    if (!currentLeagueObj) return;
    if (!window.confirm(`"${exportLeague}" ligasi uchun 1x1 orqa fon rasmini o'chirmoqchimisiz?`)) return;

    setScheduleBanner('');
    const localKey = `hfl_schedule_banner_${orgId}_${currentLeagueObj.id}`;
    localStorage.removeItem(localKey);

    try {
      await supabase
        .from('leagues')
        .update({ schedule_banner_url: null })
        .eq('id', currentLeagueObj.id);
    } catch (e) {}
  };

  const handleDeleteYtBanner = async () => {
    const currentLeagueObj = activeLeagues.find(l => l.name === exportLeague);
    if (!currentLeagueObj) return;
    if (!window.confirm(`"${exportLeague}" ligasi uchun YouTube 16:9 fon rasmini o'chirmoqchimisiz?`)) return;

    setYtBanner('');
    const localKey = `hfl_yt_banner_${orgId}_${currentLeagueObj.id}`;
    localStorage.removeItem(localKey);

    try {
      await supabase
        .from('leagues')
        .update({ yt_banner_url: null })
        .eq('id', currentLeagueObj.id);
    } catch (e) {}
  };

  const handleExportYtThumbnail = async (match) => {
    setSelectedMatchForYtExport(match);
    setExportingMatchId(match.id);

    setTimeout(async () => {
      if (!exportYtRef.current) {
        setExportingMatchId(null);
        return;
      }

      try {
        const canvas = await html2canvas(exportYtRef.current, {
          scale: 2,
          useCORS: true,
          backgroundColor: null
        });
        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        const homeName = (match.home_team?.name || 'Home').replace(/\s+/g, '_');
        const awayName = (match.away_team?.name || 'Away').replace(/\s+/g, '_');
        link.download = `YouTube_Match_${homeName}_VS_${awayName}_${match.round ? match.round + '_tur' : ''}.png`;
        link.href = dataUrl;
        link.click();
      } catch (err) {
        console.error('YouTube Thumbnail Export Error:', err);
        alert('YouTube Shablon rasmini yuklab olishda xatolik yuz berdi');
      } finally {
        setExportingMatchId(null);
      }
    }, 150);
  };

  const handleExport = async () => {
    if (!exportRef.current || isExporting) return;
    if (!exportLeague || !exportRound) {
      alert("Iltimos eksport qilish uchun liga va turni tanlang.");
      return;
    }
    setIsExporting(true);
    try {
      const canvas = await html2canvas(exportRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: null
      });
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `jadval_${exportLeague}_${exportRound}_tur.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error(err);
      alert("Xatolik yuz berdi");
    } finally {
      setIsExporting(false);
    }
  };

  const fetchTeams = async (leaguesList = activeLeagues) => {
    let query = supabase.from('teams').select('id, name, logo_url, league').eq('status', 'approved');
    query = applyOrgAndCollabFilter(query, orgId, leaguesList);
    const { data } = await query;
    if (data) setTeams(data);
  };

  const fetchMatches = async (leaguesList = activeLeagues) => {
    let query = supabase
      .from('matches')
      .select(`
        *,
        home_team:home_team_id (id, name, logo_url),
        away_team:away_team_id (id, name, logo_url)
      `)
      .order('match_date', { ascending: true })
      .order('match_time', { ascending: true });

    query = applyOrgAndCollabFilter(query, orgId, leaguesList);

    const { data } = await query;
    if (data) {
      // Merge is_postponed from localStorage if DB column not available
      let postponedMap = {};
      try {
        postponedMap = JSON.parse(localStorage.getItem(`hfl_postponed_${orgId}`) || '{}');
      } catch (e) {}

      const merged = data.map(m => ({
        ...m,
        is_postponed: m.is_postponed != null ? m.is_postponed : !!postponedMap[m.id]
      }));
      setMatches(merged);
    }
  };

  const handleTogglePostponed = async (match, isPostponedVal) => {
    setMatches(prev => prev.map(m => m.id === match.id ? { ...m, is_postponed: isPostponedVal } : m));

    // Save to localStorage immediately for cross-device fallback
    try {
      const key = `hfl_postponed_${orgId}`;
      const saved = JSON.parse(localStorage.getItem(key) || '{}');
      if (isPostponedVal) {
        saved[match.id] = true;
      } else {
        delete saved[match.id];
      }
      localStorage.setItem(key, JSON.stringify(saved));
    } catch (e) {}

    // Save to Supabase DB
    try {
      const { error } = await supabase
        .from('matches')
        .update({ is_postponed: isPostponedVal })
        .eq('id', match.id);

      if (error) {
        console.warn('is_postponed DB update notice:', error);
      }
    } catch (err) {
      console.error('Error toggling is_postponed:', err);
    }
  };

  const handleOpenModal = () => {
    setEditingMatch(null);
    setSelectedLeague(exportLeague || (activeLeagues[0]?.name || ''));
    setHomeTeamId('');
    setAwayTeamId('');
    setMatchDate('');
    setMatchTime('');
    setLocation('');
    setStadiumName('');
    setYoutubeLink('');
    setMatchRound('');
    setIsPostponed(false);
    setIsModalOpen(true);
  };

  const handleEditMatch = (match) => {
    setEditingMatch(match);
    setSelectedLeague(match.league || '');
    setHomeTeamId(match.home_team_id || '');
    setAwayTeamId(match.away_team_id || '');
    setMatchDate(match.match_date || '');
    setMatchTime(match.match_time || '');
    setYoutubeLink(match.youtube_link || '');
    setMatchRound(match.round ? String(match.round) : '');
    setLocation(match.location || '1-maydon');
    setStadiumName(match.stadium_name || '');
    setIsPostponed(!!match.is_postponed);
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!selectedLeague || !homeTeamId || !awayTeamId || !matchDate || !matchTime || !location) {
      alert("Iltimos, barcha majburiy maydonlarni (Liga, Jamoalar, Sana, Vaqt, Maydon) to'ldiring.");
      return;
    }
    if (homeTeamId === awayTeamId) {
      alert("Mezbon va mehmon jamoalar har xil bo'lishi kerak.");
      return;
    }

    setLoading(true);
    try {
      const matchData = {
        league: selectedLeague,
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        match_date: matchDate,
        match_time: matchTime,
        location: location,
        youtube_link: youtubeLink,
        round: matchRound ? parseInt(matchRound) : null,
        is_postponed: isPostponed,
        organization_id: orgId,
      };

      let savedMatchId = editingMatch?.id;
      if (editingMatch) {
        let { error } = await supabase
          .from('matches')
          .update(matchData)
          .eq('id', editingMatch.id);

        if (error) {
          delete matchData.is_postponed;
          await supabase.from('matches').update(matchData).eq('id', editingMatch.id);
        }
      } else {
        let { data, error } = await supabase.from('matches').insert([{
          ...matchData,
          status: 'scheduled'
        }]).select();

        if (error) {
          delete matchData.is_postponed;
          const fallbackRes = await supabase.from('matches').insert([{
            ...matchData,
            status: 'scheduled'
          }]).select();
          savedMatchId = fallbackRes.data ? fallbackRes.data[0]?.id : null;
        } else if (data && data.length > 0) {
          savedMatchId = data[0].id;
        }
      }

      setIsModalOpen(false);
      setEditingMatch(null);
      await fetchMatches();

      // Auto-create YouTube live stream if checkbox was checked
      if (autoCreateYtLive && ytChannelInfo && savedMatchId) {
        const fullSavedMatch = {
          ...matchData,
          id: savedMatchId
        };
        await createYouTubeLiveStream(fullSavedMatch, true);
      } else if (editingMatch?.youtube_link) {
        // Auto-update YouTube thumbnail with scores if match was updated
        const extractId = (url) => {
          if (!url) return null;
          if (url.includes('/live/')) return url.split('/live/')[1]?.split('?')[0];
          if (url.includes('v=')) return url.split('v=')[1]?.split('&')[0];
          if (url.includes('youtu.be/')) return url.split('youtu.be/')[1]?.split('?')[0];
          return null;
        };
        const broadcastId = extractId(editingMatch.youtube_link);
        if (broadcastId) {
          const homeTeamObj = teams.find(t => t.id === matchData.home_team_id);
          const awayTeamObj = teams.find(t => t.id === matchData.away_team_id);
          setSelectedMatchForYtExport({
            ...editingMatch,
            ...matchData,
            home_team: homeTeamObj,
            away_team: awayTeamObj
          });
          setTimeout(() => {
            updateYouTubeThumbnailForBroadcast(broadcastId);
          }, 850);
        }
      }
    } catch (error) {
      console.error(error);
      alert('Xatolik yuz berdi: ' + (error.message || ''));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Rostdan ham ushbu o'yinni o'chirmoqchimisiz?")) {
      const matchToDelete = matches.find(m => m.id === id);

      // Auto-delete live broadcast from YouTube API if youtube_link exists
      if (matchToDelete?.youtube_link) {
        try {
          const accessToken = await getValidAccessToken();
          if (accessToken) {
            const matchLink = matchToDelete.youtube_link;
            let broadcastId = null;
            if (matchLink.includes('/live/')) {
              broadcastId = matchLink.split('/live/')[1]?.split('?')[0];
            } else if (matchLink.includes('v=')) {
              broadcastId = matchLink.split('v=')[1]?.split('&')[0];
            } else if (matchLink.includes('youtu.be/')) {
              broadcastId = matchLink.split('youtu.be/')[1]?.split('?')[0];
            }

            if (broadcastId) {
              await fetch(`https://www.googleapis.com/youtube/v3/liveBroadcasts?id=${broadcastId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${accessToken}` }
              });
              console.log('Successfully deleted YouTube live broadcast:', broadcastId);
            }
          }
        } catch (ytErr) {
          console.warn('Error auto-deleting YouTube broadcast:', ytErr);
        }
      }

      const { error } = await supabase.from('matches').delete().eq('id', id);
      if (!error) {
        fetchMatches();
      }
    }
  };

  const availableTeams = teams.filter(t => t.league === selectedLeague);
  const availableRounds = Array.from(new Set(matches.filter(m => m.league === exportLeague && m.round).map(m => Number(m.round)))).sort((a, b) => b - a);

  return (
    <div className="schedule-page">
      {/* Header */}
      <div className="schedule-header">
        <div>
          <h1>O'yinlar Jadvali</h1>
          <p>{currentOrg?.name} ({exportLeague || 'Barcha ligalar'})</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {ytChannelInfo ? (
            <div className="yt-connected-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(255, 59, 48, 0.15)', border: '1px solid rgba(255, 59, 48, 0.4)', padding: '8px 14px', borderRadius: '10px', color: '#ff4d4d', fontSize: '13px', fontWeight: '700' }}>
              {ytChannelInfo.thumbnail && <img src={ytChannelInfo.thumbnail} alt="" style={{ width: '22px', height: '22px', borderRadius: '50%' }} />}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Video size={14} color="#ff4d4d" /> {ytChannelInfo.title}</span>
              <button onClick={handleDisconnectYouTube} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '12px', marginLeft: '6px' }} title="Uzish">✕</button>
            </div>
          ) : (
            <button className="btn-yt-connect" onClick={handleConnectYouTube} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'linear-gradient(135deg, #ff0000 0%, #cc0000 100%)', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '10px', fontWeight: '700', fontSize: '13px', cursor: 'pointer', boxShadow: '0 4px 15px rgba(255, 0, 0, 0.4)', transition: 'all 0.2s' }}>
              <Video size={16} /> YouTube Kanalni Ulash
            </button>
          )}
          <button className="btn-add-match" onClick={handleOpenModal}>
            <Plus size={18} /> O'yin qo'shish
          </button>
        </div>
      </div>

      {/* Modern Filter & 1x1 Poster Banner Control Card */}
      <div className="schedule-filter-banner-card">
        {/* Header Bar */}
        <div className="filter-header-bar">
          <div className="filter-title-group" onClick={() => setIsFilterOpen(!isFilterOpen)}>
            <Filter size={18} className="filter-icon" />
            <span>O'yinlar Filteri (Liga, Tur, Holat)</span>
            <ChevronDown size={18} className={`chevron-icon ${isFilterOpen ? 'open' : ''}`} />
          </div>
          <div className="filter-active-status-badge">
            {filterStatus === 'all' && 'Barcha o\'yinlar'}
            {filterStatus === 'scheduled' && 'Rejalashtirilgan'}
            {filterStatus === 'live' && 'Jonli (Live)'}
            {filterStatus === 'finished' && 'Yakunlangan'}
          </div>
        </div>

        {/* Expandable Select Filters */}
        {isFilterOpen && (
          <div className="filter-expanded-content">
            <div className="filter-row">
              <div className="filter-field">
                <label><Trophy size={14} /> Liga tanlang</label>
                <div className="custom-select-wrapper">
                  <select value={exportLeague} onChange={e => setExportLeague(e.target.value)}>
                    {activeLeagues.map(l => (
                      <option key={l.id} value={l.name}>
                        {l.name} {l.isCollab ? '(Co-Host)' : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="select-arrow" />
                </div>
              </div>

              <div className="filter-field">
                <label><Layers size={14} /> Tur</label>
                <div className="custom-select-wrapper">
                  <select value={exportRound} onChange={e => setExportRound(e.target.value)}>
                    <option value="">Barcha turlar</option>
                    {availableRounds.map(r => (
                      <option key={r} value={r}>{r}-Tur</option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="select-arrow" />
                </div>
              </div>

              <div className="filter-field">
                <label><Clock size={14} /> O'yin Holati</label>
                <div className="custom-select-wrapper">
                  <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                    <option value="all">Barchasi</option>
                    <option value="scheduled">Rejalashtirilgan</option>
                    <option value="live">Jonli (Live)</option>
                    <option value="finished">Tugagan</option>
                  </select>
                  <ChevronDown size={16} className="select-arrow" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 1x1 Poster Banner Section */}
        <div className="poster-banner-section">
          {/* Left: 1x1 Poster Image Box */}
          <div className="poster-preview-square">
            {scheduleBanner ? (
              <img src={scheduleBanner} alt="1x1 Schedule Banner" className="poster-img-1x1" />
            ) : (
              <div className="poster-placeholder-1x1">
                <ImageIcon size={32} />
                <span>1x1 Orqa Fon</span>
                <span className="sub-tag">({exportLeague || 'Tanlanmagan'})</span>
              </div>
            )}
          </div>

          {/* Right: Actions */}
          <div className="poster-action-buttons">
            <button className="btn-download-poster" onClick={handleExport} disabled={isExporting}>
              {isExporting ? (
                <><span className="btn-spinner"></span> <span>Yuklanmoqda...</span></>
              ) : (
                <><Download size={18} /> <span>Rasmni Yuklab Olish</span></>
              )}
            </button>
            <div className="poster-sub-buttons">
              <button className="btn-banner-action btn-upload" onClick={() => bannerFileInputRef.current?.click()} disabled={uploadingBanner}>
                <Upload size={15} /> <span>{scheduleBanner ? 'Boshqa rasm yuklash' : 'Rasm yuklash'}</span>
              </button>
              {scheduleBanner && (
                <button className="btn-banner-action btn-delete" onClick={handleDeleteBanner}>
                  <Trash2 size={15} /> <span>O'chirish</span>
                </button>
              )}
            </div>
            <input ref={bannerFileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleBannerFileSelect} />
          </div>
        </div>

        {/* YouTube Shablon 16:9 Background Control Section */}
        <div className="poster-banner-section" style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
          {/* Left: 16:9 Preview Square/Rectangle */}
          <div className="poster-preview-square" style={{ width: '220px', height: '124px', aspectRatio: '16/9' }}>
            {ytBanner ? (
              <img src={ytBanner} alt="16:9 YouTube Banner" className="poster-img-1x1" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div className="poster-placeholder-1x1">
                <Video size={28} />
                <span style={{ fontSize: '12px' }}>YouTube Shablon Fon (16:9)</span>
                <span className="sub-tag">({exportLeague || 'Tanlanmagan'})</span>
              </div>
            )}
          </div>

          {/* Right: Upload & Delete Actions */}
          <div className="poster-action-buttons" style={{ justifyContent: 'center' }}>
            <div className="poster-sub-buttons" style={{ flexDirection: 'column', gap: '8px' }}>
              <button className="btn-banner-action btn-upload" onClick={() => ytFileInputRef.current?.click()} disabled={uploadingYtBanner}>
                <Upload size={15} /> <span>{ytBanner ? 'YouTube Shablon fonini almashtirish (16:9)' : 'YouTube Shablon Fon yuklash (16:9)'}</span>
              </button>
              {ytBanner && (
                <button className="btn-banner-action btn-delete" onClick={handleDeleteYtBanner}>
                  <Trash2 size={15} /> <span>Fonni o'chirish</span>
                </button>
              )}
            </div>
            <input ref={ytFileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleYtFileSelect} />
          </div>
        </div>
      </div>

      {/* Matches Grid Wrapper with Glassmorphism overlay on 1x1 scheduleBanner */}
      <div 
        className={`schedule-matches-wrapper ${scheduleBanner ? 'has-bg-banner' : ''}`}
        style={scheduleBanner ? {
          backgroundImage: `linear-gradient(rgba(11, 14, 23, 0.55), rgba(11, 14, 23, 0.8)), url(${scheduleBanner})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
        } : {}}
      >
        <div className="matches-grid">
          {matches
            .filter(m => m.league === exportLeague && (!exportRound || m.round == exportRound))
            .filter(m => {
              if (filterStatus === 'all') return true;
              if (filterStatus === 'live') return m.status === 'first_half' || m.status === 'second_half' || m.status === 'half_time';
              return m.status === filterStatus;
            })
            .map(match => (
            <div key={match.id} className="match-card glassmorphic-card">
              <div className="match-card-actions">
                {ytChannelInfo && (
                  <button 
                    className="yt-live-create-btn"
                    onClick={() => createYouTubeLiveStream(match, true)}
                    disabled={ytLoading}
                    title="YouTube'da Jonli Efir Ochish va 16:9 Oblojkani Avtomatik Yuklash"
                    style={{ background: 'rgba(255, 0, 0, 0.15)', border: '1px solid rgba(255, 0, 0, 0.4)', color: '#ff4d4d', borderRadius: '8px', padding: '4px 8px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: '800' }}
                  >
                    <Video size={13} /> {ytLoading ? 'Ochilmoqda...' : 'Live Yaratish'}
                  </button>
                )}
                <button 
                  className="yt-download-match-btn" 
                  onClick={() => handleExportYtThumbnail(match)} 
                  disabled={exportingMatchId === match.id}
                  title="YouTube Shablon Rasmini Yuklab Olish (16:9)"
                >
                  {exportingMatchId === match.id ? <span className="btn-spinner"></span> : <Download size={15} />}
                </button>
                {match.youtube_link && (
                  <a 
                    href={match.youtube_link} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="yt-watch-live-btn"
                    title="YouTube'da Jonli Efirni Ko'rish"
                    style={{ 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      gap: '4px', 
                      background: 'linear-gradient(135deg, #ff0000 0%, #cc0000 100%)', 
                      color: '#ffffff', 
                      padding: '4px 8px', 
                      borderRadius: '8px', 
                      fontSize: '11px', 
                      fontWeight: '800', 
                      textDecoration: 'none',
                      boxShadow: '0 2px 10px rgba(255,0,0,0.35)',
                      transition: 'transform 0.2s'
                    }}
                  >
                    <Video size={13} /> Jonli Ko'rish
                  </a>
                )}
                <button className="edit-match-btn" onClick={() => handleEditMatch(match)} title="Tahrirlash">
                  <Pencil size={15} />
                </button>
                <button className="delete-match-btn" onClick={() => handleDelete(match.id)} title="O'chirish">
                  <Trash2 size={15} />
                </button>
              </div>
              <div className="match-badges-container">
                 <div className="match-league-badge">{match.league}</div>
                 {match.round && <div className="match-league-badge round-badge">{match.round}-Tur</div>}
              </div>
              <div className="match-teams">
                <div className="team"><img src={match.home_team?.logo_url || '/images/default-team.png'} alt="Home" className="team-logo" /><span>{match.home_team?.name}</span></div>
                <div className="match-vs">{(match.status === 'finished' || match.home_score > 0 || match.away_score > 0) ? <>{match.home_score || 0} : {match.away_score || 0}</> : 'VS'}</div>
                <div className="team"><img src={match.away_team?.logo_url || '/images/default-team.png'} alt="Away" className="team-logo" /><span>{match.away_team?.name}</span></div>
              </div>
              <div className="match-footer-row" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', width: '100%', marginTop: '6px' }}>
                <div className="match-details">
                  <div className="detail-row"><Calendar size={14} /> <span>{match.match_date}</span></div>
                  <div className="detail-row"><Clock size={14} /> <span>{match.match_time}</span></div>
                  <div className="detail-row"><MapPin size={14} /> <span>{match.location}</span></div>
                </div>
                <label 
                  className={`match-postponed-toggle ${match.is_postponed ? 'is-postponed' : ''}`}
                  onClick={(e) => e.stopPropagation()}
                  title="Qoldirilgan o'yin deb belgilash"
                >
                  <input 
                    type="checkbox" 
                    checked={!!match.is_postponed} 
                    onChange={(e) => handleTogglePostponed(match, e.target.checked)} 
                  />
                </label>
              </div>
              <button className="btn-manage-match" onClick={() => navigate('/match/' + match.id)}>⚙️ Boshqarish</button>
            </div>
          ))}
          {matches.filter(m => m.league === exportLeague && (!exportRound || m.round == exportRound)).length === 0 && (
            <div className="no-matches-box"><Calendar size={36} /><p>O'yinlar topilmadi.</p></div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content schedule-modal" onClick={e => e.stopPropagation()}>
            <h2>{editingMatch ? 'O\'yinni tahrirlash' : 'Yangi o\'yin rejalashtirish'}</h2>
            
            <div className="form-group">
              <label>Liga</label>
              <select value={selectedLeague} onChange={(e) => {setSelectedLeague(e.target.value); setHomeTeamId(''); setAwayTeamId('');}}>
                <option value="">Tanlang</option>
                {activeLeagues.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Nechanchi Tur (Round)</label>
              <input 
                type="number" 
                placeholder="Masalan: 1" 
                value={matchRound} 
                onChange={(e) => setMatchRound(e.target.value)} 
                min="1"
              />
            </div>

            <div className="form-group">
              <label>Mezbon Jamoa</label>
              <select value={homeTeamId} onChange={(e) => setHomeTeamId(e.target.value)}>
                <option value="">Tanlang</option>
                {availableTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Mehmon Jamoa</label>
              <select value={awayTeamId} onChange={(e) => setAwayTeamId(e.target.value)}>
                <option value="">Tanlang</option>
                {availableTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>

            <div className="datetime-row">
              <div className="form-group">
                <label>Sana</label>
                <input type="date" value={matchDate} onChange={(e) => setMatchDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Vaqt</label>
                <input type="time" value={matchTime} onChange={(e) => setMatchTime(e.target.value)} />
              </div>
            </div>

            <div className="form-group">
              <label>Maydon (OBS Stream uchun)</label>
              <select value={location} onChange={(e) => setLocation(e.target.value)} required>
                <option value="">Maydonni tanlang</option>
                <option value="1-maydon">1-Maydon</option>
                <option value="2-maydon">2-Maydon</option>
              </select>
            </div>

            <div className="form-group">
              <label>Stadion Nomi (ixtiyoriy)</label>
              <input 
                type="text" 
                placeholder="Stadion nomi (masalan: Dinamo Arena)" 
                value={stadiumName} 
                onChange={(e) => setStadiumName(e.target.value)} 
              />
            </div>

            <div className="form-group">
              <label>YouTube Translyatsiya Linki (ixtiyoriy)</label>
              <input 
                type="url" 
                placeholder="https://youtube.com/live/..." 
                value={youtubeLink} 
                onChange={(e) => setYoutubeLink(e.target.value)} 
              />
            </div>

            <div className="form-group checkbox-group" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px', background: 'rgba(255, 59, 48, 0.1)', padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(255, 59, 48, 0.25)' }}>
              <input 
                type="checkbox" 
                id="is_postponed_checkbox"
                checked={isPostponed} 
                onChange={(e) => setIsPostponed(e.target.checked)} 
                style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#ff3b30' }}
              />
              <label htmlFor="is_postponed_checkbox" style={{ margin: 0, cursor: 'pointer', fontWeight: '700', color: isPostponed ? '#ff4d4d' : 'rgba(255,255,255,0.9)', fontSize: '13px' }}>
                ⚠️ Qoldirilgan o'yin (Eksport rasmida ajratilib eng pastda ko'rsatiladi)
              </label>
            </div>

            {ytChannelInfo && (
              <div className="form-group checkbox-group" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', background: 'rgba(255, 0, 0, 0.1)', padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(255, 0, 0, 0.3)' }}>
                <input 
                  type="checkbox" 
                  id="auto_yt_live_checkbox"
                  checked={autoCreateYtLive} 
                  onChange={(e) => setAutoCreateYtLive(e.target.checked)} 
                  style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#ff0000' }}
                />
                <label htmlFor="auto_yt_live_checkbox" style={{ margin: 0, cursor: 'pointer', fontWeight: '700', color: '#ff4d4d', fontSize: '13px' }}>
                  YouTube'da avtomatik Jonli Efir ochish va 16:9 oblojka yuklash
                </label>
              </div>
            )}

            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setIsModalOpen(false)}>Bekor qilish</button>
              <button className="btn-save" onClick={handleSave} disabled={loading}>
                {loading ? <><span className="btn-spinner"></span> Saqlanmoqda...</> : (editingMatch ? 'Yangilash' : 'Saqlash')}
              </button>
            </div>
          </div>
        </div>
      )}

      {cropperRawImage && (
        <ImageCropperModal
          isOpen={!!cropperRawImage}
          imageSrc={cropperRawImage}
          onClose={() => setCropperRawImage(null)}
          onSave={handleCroppedBannerSave}
          title="Schedule 1:1 Orqa Fon Rasmini Qirqish"
          aspect={1 / 1}
          showAspectSelector={false}
        />
      )}

      {cropperRawYtImage && (
        <ImageCropperModal
          isOpen={!!cropperRawYtImage}
          imageSrc={cropperRawYtImage}
          onClose={() => setCropperRawYtImage(null)}
          onSave={handleCroppedYtBannerSave}
          title="YouTube Shablon 16:9 Orqa Fon Rasmini Qirqish"
          aspect={16 / 9}
          showAspectSelector={false}
        />
      )}

      {/* HIDDEN YOUTUBE THUMBNAIL 16:9 EXPORT TEMPLATE */}
      <div style={{ position: 'fixed', left: '-9999px', top: 0, pointerEvents: 'none', zIndex: -100 }}>
        {(() => {
          const currentLeagueObj = activeLeagues.find(l => l.name === exportLeague);
          const isCollab = currentLeagueObj?.isCollab;

          return (
            <div 
              ref={exportYtRef} 
              className="yt-thumbnail-export" 
              style={{ 
                width: '1280px', 
                height: '720px', 
                backgroundImage: ytBanner ? `linear-gradient(rgba(10, 13, 18, 0.45), rgba(10, 13, 18, 0.75)), url(${ytBanner})` : 'linear-gradient(135deg, #0b0f19 0%, #050910 100%)', 
                backgroundSize: 'cover', 
                backgroundPosition: 'center', 
                position: 'relative', 
                display: 'flex', 
                flexDirection: 'column', 
                justify: 'space-between',
                padding: '30px 45px', 
                boxSizing: 'border-box',
                fontFamily: "'Outfit', 'Inter', sans-serif"
              }}
            >
              {/* Header */}
              <div className="export-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <div className="export-logo-left" style={{ width: '280px', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '10px', justifyContent: 'flex-start' }}>
                  {isCollab ? (
                    <>
                      <img src={currentLeagueObj.org1?.logo_url || '/logo-for-jadval.png'} alt="Org 1" crossOrigin="anonymous" style={{ height: '70px', objectFit: 'contain', background: 'transparent' }} />
                      <img src="/x.png" crossOrigin="anonymous" style={{ height: '16px', objectFit: 'contain', opacity: 0.8, background: 'transparent' }} />
                      <img src={currentLeagueObj.org2?.logo_url || '/llf-logo.png'} alt="Org 2" crossOrigin="anonymous" style={{ height: '60px', objectFit: 'contain', background: 'transparent' }} />
                    </>
                  ) : (
                    <img src={currentOrg?.logo_url || '/logo-for-jadval.png'} alt={currentOrg?.name || 'HFL'} crossOrigin="anonymous" style={{ height: '80px', objectFit: 'contain', background: 'transparent' }} />
                  )}
                </div>

                <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                  {currentLeagueObj?.logo_url ? (
                    <img src={currentLeagueObj.logo_url} alt={exportLeague} style={{ height: '90px', maxWidth: '380px', objectFit: 'contain', background: 'transparent', border: 'none' }} crossOrigin="anonymous" />
                  ) : (
                    <h2 style={{ color: '#fff', fontSize: '38px', fontWeight: '900', textTransform: 'uppercase', margin: 0, fontStyle: 'italic', letterSpacing: '1px' }}>{exportLeague}</h2>
                  )}
                </div>

                <div className="export-logo-right" style={{ width: '280px', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                  {mainSponsorLogo ? (
                    <img src={mainSponsorLogo} alt="Bosh Homiy" crossOrigin="anonymous" style={{ height: '65px', objectFit: 'contain', background: 'transparent' }} />
                  ) : null}
                </div>
              </div>

              {/* Center Match Banner: Home Team vs Away Team */}
              {selectedMatchForYtExport && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '60px', flex: 1, margin: '20px 0' }}>
                  {/* Home Team */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '320px', textAlign: 'center' }}>
                    <div style={{ width: '160px', height: '160px', borderRadius: '50%', background: 'rgba(255, 255, 255, 0.08)', border: '4px solid rgba(0, 255, 102, 0.6)', padding: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 0 35px rgba(0, 255, 102, 0.3)' }}>
                      <img 
                        src={selectedMatchForYtExport.home_team?.logo_url || '/images/default-team.png'} 
                        alt={selectedMatchForYtExport.home_team?.name} 
                        crossOrigin="anonymous"
                        style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'contain', background: 'transparent' }} 
                      />
                    </div>
                    <h2 style={{ color: '#ffffff', fontSize: '28px', fontWeight: '900', textTransform: 'uppercase', marginTop: '16px', marginBottom: '0', letterSpacing: '1px', textShadow: '0 4px 12px rgba(0,0,0,0.8)' }}>
                      {selectedMatchForYtExport.home_team?.name}
                    </h2>
                  </div>

                  {/* VS / Score Badge */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <div style={{ background: 'linear-gradient(135deg, #00ff66 0%, #00cc52 100%)', color: '#050910', padding: '10px 24px', borderRadius: '16px', fontSize: '34px', fontWeight: '900', fontStyle: 'italic', letterSpacing: '2px', boxShadow: '0 0 25px rgba(0, 255, 102, 0.5)' }}>
                      {(selectedMatchForYtExport.status === 'finished' || selectedMatchForYtExport.home_score > 0 || selectedMatchForYtExport.away_score > 0)
                        ? `${selectedMatchForYtExport.home_score || 0} : ${selectedMatchForYtExport.away_score || 0}`
                        : 'VS'}
                    </div>
                    {selectedMatchForYtExport.round && (
                      <span style={{ color: '#00ff66', fontSize: '22px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '1.5px', marginTop: '4px', textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>
                        {selectedMatchForYtExport.round}-TUR
                      </span>
                    )}
                  </div>

                  {/* Away Team */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '320px', textAlign: 'center' }}>
                    <div style={{ width: '160px', height: '160px', borderRadius: '50%', background: 'rgba(255, 255, 255, 0.08)', border: '4px solid rgba(0, 255, 102, 0.6)', padding: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 0 35px rgba(0, 255, 102, 0.3)' }}>
                      <img 
                        src={selectedMatchForYtExport.away_team?.logo_url || '/images/default-team.png'} 
                        alt={selectedMatchForYtExport.away_team?.name} 
                        crossOrigin="anonymous"
                        style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'contain', background: 'transparent' }} 
                      />
                    </div>
                    <h2 style={{ color: '#ffffff', fontSize: '28px', fontWeight: '900', textTransform: 'uppercase', marginTop: '16px', marginBottom: '0', letterSpacing: '1px', textShadow: '0 4px 12px rgba(0,0,0,0.8)' }}>
                      {selectedMatchForYtExport.away_team?.name}
                    </h2>
                  </div>
                </div>
              )}

              {/* Footer Secondary Sponsors Banner */}
              {(() => {
                const secondarySponsors = selectedSponsors.filter(s => s.id !== mainSponsor?.id);
                if (secondarySponsors.length === 0) return null;
                return (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '25px', marginBottom: '5px' }}>
                    {secondarySponsors.map((s, idx) => (
                      <React.Fragment key={s.id || idx}>
                        <img src={s.logo_url} alt={s.name} crossOrigin="anonymous" style={{ height: '36px', objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
                        {idx < secondarySponsors.length - 1 && (
                          <div style={{ height: '22px', width: '1px', backgroundColor: '#ffffff', opacity: 0.4 }}></div>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                );
              })()}
            </div>
          );
        })()}
      </div>

      <div style={{ position: 'fixed', left: '-9999px', top: 0, pointerEvents: 'none', zIndex: -100 }}>
        {(() => {
          const currentLeagueObj = activeLeagues.find(l => l.name === exportLeague);
          const isCollab = currentLeagueObj?.isCollab;

          return (
            <div ref={exportRef} className="schedule-export-container 1x1-poster-export" style={{ width: '1080px', height: '1080px', backgroundImage: scheduleBanner ? `url(${scheduleBanner})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative', display: 'flex', flexDirection: 'column', padding: '40px 50px', boxSizing: 'border-box' }}>
              {/* Header */}
              <div className="export-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', width: '100%' }}>
                <div className="export-logo-left" style={{ width: '250px', minWidth: '250px', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', justifyContent: 'flex-start' }}>
                  {isCollab ? (
                    <>
                      <img src={currentLeagueObj.org1?.logo_url || '/logo-for-jadval.png'} alt="Org 1" crossOrigin="anonymous" style={{ height: '90px', objectFit: 'contain', background: 'transparent' }} />
                      <img src="/x.png" crossOrigin="anonymous" style={{ height: '18px', objectFit: 'contain', opacity: 0.7, background: 'transparent' }} />
                      <img src={currentLeagueObj.org2?.logo_url || '/llf-logo.png'} alt="Org 2" crossOrigin="anonymous" style={{ height: '75px', objectFit: 'contain', background: 'transparent' }} />
                    </>
                  ) : (
                    <img src={currentOrg?.logo_url || '/logo-for-jadval.png'} alt={currentOrg?.name || 'HFL'} crossOrigin="anonymous" style={{ height: '100px', objectFit: 'contain', background: 'transparent' }} />
                  )}
                </div>

                <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                  {currentLeagueObj?.logo_url ? (
                    <img src={currentLeagueObj.logo_url} alt={exportLeague} style={{ height: '110px', maxWidth: '380px', objectFit: 'contain', background: 'transparent', border: 'none' }} crossOrigin="anonymous" />
                  ) : (
                    <h2 style={{ color: '#fff', fontSize: '32px', fontWeight: '900', textTransform: 'uppercase', margin: 0 }}>{exportLeague} {exportRound ? `(${exportRound}-TUR)` : ''}</h2>
                  )}
                </div>

                <div className="export-logo-right" style={{ width: '250px', minWidth: '250px', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                  {mainSponsorLogo ? (
                    <img src={mainSponsorLogo} alt="Bosh Homiy" crossOrigin="anonymous" style={{ height: '80px', objectFit: 'contain', background: 'transparent' }} />
                  ) : null}
                </div>
              </div>

              <div className="sch-export-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', justifyContent: 'center' }}>
                {(() => {
                  const currentRoundMatches = matches.filter(m => m.league === exportLeague && m.round == exportRound && !m.is_postponed);
                  const postponedMatches = matches.filter(m => m.league === exportLeague && m.is_postponed);

                  return (
                    <>
                      {currentRoundMatches.map(match => (
                        <div key={match.id} className="sch-match-row">
                          <img src={match.home_team?.logo_url} className="sch-team-logo" crossOrigin="anonymous" alt="" />
                          <div style={{ color: '#fff', fontSize: '24px', fontWeight: '900', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '1px', wordBreak: 'break-word', padding: '0 8px' }}>{match.home_team?.name}</div>
                          <div className="sch-time-container"><div className="sch-time-date">{match.match_date?.split('-').reverse().join('.')}</div><div className="sch-time-box">{match.match_time?.substring(0, 5)}</div></div>
                          <div style={{ color: '#fff', fontSize: '24px', fontWeight: '900', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '1px', wordBreak: 'break-word', padding: '0 8px' }}>{match.away_team?.name}</div>
                          <img src={match.away_team?.logo_url} className="sch-team-logo" crossOrigin="anonymous" alt="" />
                        </div>
                      ))}

                      {postponedMatches.length > 0 && (
                        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', alignItems: 'center' }}>
                          <div style={{ background: 'rgba(255, 59, 48, 0.35)', border: '1px solid rgba(255, 59, 48, 0.75)', color: '#ffffff', padding: '5px 20px', borderRadius: '12px', fontSize: '13px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '1.5px', boxShadow: '0 4px 12px rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}>
                            {postponedMatches.length > 1 ? "QOLDIRILGAN O'YINLAR" : "QOLDIRILGAN O'YIN"}
                          </div>
                          {postponedMatches.map(match => (
                            <div key={match.id} className="sch-match-row" style={{ borderColor: 'rgba(255, 59, 48, 0.65)', background: 'rgba(255, 59, 48, 0.2)', width: '100%' }}>
                              <img src={match.home_team?.logo_url} className="sch-team-logo" crossOrigin="anonymous" alt="" />
                              <div style={{ color: '#fff', fontSize: '24px', fontWeight: '900', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '1px', wordBreak: 'break-word', padding: '0 8px' }}>{match.home_team?.name}</div>
                              <div className="sch-time-container"><div className="sch-time-date">{match.match_date?.split('-').reverse().join('.')}</div><div className="sch-time-box">{match.match_time?.substring(0, 5)}</div></div>
                              <div style={{ color: '#fff', fontSize: '24px', fontWeight: '900', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '1px', wordBreak: 'break-word', padding: '0 8px' }}>{match.away_team?.name}</div>
                              <img src={match.away_team?.logo_url} className="sch-team-logo" crossOrigin="anonymous" alt="" />
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Bottom Selected Secondary Sponsors Banner */}
              {(() => {
                const secondarySponsors = selectedSponsors.filter(s => s.id !== mainSponsor?.id);
                if (secondarySponsors.length === 0) return null;
                return (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '30px', marginTop: '20px', marginBottom: '15px' }}>
                    {secondarySponsors.map((s, idx) => (
                      <React.Fragment key={s.id || idx}>
                        <img src={s.logo_url} alt={s.name} crossOrigin="anonymous" style={{ height: '42px', objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
                        {idx < secondarySponsors.length - 1 && (
                          <div style={{ height: '28px', width: '1px', backgroundColor: '#ffffff', opacity: 0.5 }}></div>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                );
              })()}
            </div>
          );
        })()}
      </div>
    </div>
  );
};

export default Schedule;
