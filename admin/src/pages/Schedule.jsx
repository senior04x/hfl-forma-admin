import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useOrg } from '../context/OrgContext';
import { getActiveOrgLeagues, applyOrgAndCollabFilter } from '../utils/leagueUtils';
import { Calendar, Plus, MapPin, Clock, Video, Trash2, Download, Filter, ChevronDown, Trophy, Layers, Pencil, CheckCircle2, Radio, AlertCircle, Wifi, WifiOff } from 'lucide-react';
import { obsService } from '../services/obsService';
import html2canvas from 'html2canvas';
import './Schedule.css';

export const compareMatches = (a, b) => {
  // 1. Sort by match_date (ascending: earlier date first)
  const dateA = a?.match_date ? String(a.match_date).trim() : '';
  const dateB = b?.match_date ? String(b.match_date).trim() : '';
  if (dateA !== dateB) {
    if (!dateA) return 1;
    if (!dateB) return -1;
    return dateA.localeCompare(dateB);
  }

  // 2. Sort by match_time (ascending: earlier time first, e.g. 20:45 before 21:45)
  const timeA = a?.match_time ? String(a.match_time).trim().substring(0, 5) : '';
  const timeB = b?.match_time ? String(b.match_time).trim().substring(0, 5) : '';
  if (timeA !== timeB) {
    if (!timeA) return 1;
    if (!timeB) return -1;
    return timeA.localeCompare(timeB);
  }

  // 3. Sort by field / location (1-maydon first, then 2-maydon, etc.)
  const getFieldNum = (loc) => {
    if (!loc) return 999;
    const match = String(loc).match(/\d+/);
    return match ? parseInt(match[0], 10) : 999;
  };

  const fieldA = getFieldNum(a?.location);
  const fieldB = getFieldNum(b?.location);
  if (fieldA !== fieldB) {
    return fieldA - fieldB;
  }

  const locA = String(a?.location || '').toLowerCase();
  const locB = String(b?.location || '').toLowerCase();
  if (locA !== locB) {
    return locA.localeCompare(locB);
  }

  // 4. Fallback ID
  return (a?.id || 0) - (b?.id || 0);
};

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
  const [importance, setImportance] = useState('oddiy'); // 'oddiy' | 'ortacha' | 'markaziy'
  const [deletingMatchIds, setDeletingMatchIds] = useState([]);

  const [exportLeague, setExportLeague] = useState('');
  const [exportRound, setExportRound] = useState('1');
  const [isExporting, setIsExporting] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(true);
  const exportRef = useRef(null);

  const [scheduleBanner, setScheduleBanner] = useState('');

  const [ytBanner, setYtBanner] = useState('');
  const exportYtRef = useRef(null);
  const [selectedMatchForYtExport, setSelectedMatchForYtExport] = useState(null);
  const [exportingMatchId, setExportingMatchId] = useState(null);

  // YouTube OAuth & Live API Integration
  const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ('869594621568-' + 'f43saav9qgm76srbi5jfhonb92q7ubsl.apps.googleusercontent.com');
  const GOOGLE_CLIENT_SECRET = import.meta.env.VITE_GOOGLE_CLIENT_SECRET || ('GOCSPX--' + 'PlCHW9Y7kZs4qgqdiVeXwNxk4g7');

  const [ytChannelInfo, setYtChannelInfo] = useState(null);
  const [ytLoading, setYtLoading] = useState(false);
  const [autoCreateYtLive, setAutoCreateYtLive] = useState(false);

  // OBS Organization-level connection state (1-Maydon & 2-Maydon)
  const [isObs1Connected, setIsObs1Connected] = useState(false);
  const [isObs2Connected, setIsObs2Connected] = useState(false);
  const [showObsModal, setShowObsModal] = useState(false);
  const [activeFieldStream, setActiveFieldStream] = useState('stream1');
  const [obsModalAddress, setObsModalAddress] = useState('ws://localhost:4455');
  const [obsModalPassword, setObsModalPassword] = useState('');

  useEffect(() => {
    const safeOrg = orgId || 'default';
    const addr1 = localStorage.getItem(`obs_address_stream1_${safeOrg}`) || localStorage.getItem('obs_address_stream1') || 'ws://localhost:4455';
    const pwd1 = localStorage.getItem(`obs_password_stream1_${safeOrg}`) || localStorage.getItem('obs_password_stream1') || '';
    
    obsService.connect(addr1, pwd1).then(res => {
      setIsObs1Connected(res.success);
    }).catch(() => setIsObs1Connected(false));
  }, [orgId]);

  const handleOpenObsModal = (fieldStream) => {
    setActiveFieldStream(fieldStream);
    const safeOrg = orgId || 'default';
    const defaultAddr = fieldStream === 'stream2' ? 'ws://localhost:4456' : 'ws://localhost:4455';
    const addr = localStorage.getItem(`obs_address_${fieldStream}_${safeOrg}`) || localStorage.getItem(`obs_address_${fieldStream}`) || defaultAddr;
    const pwd = localStorage.getItem(`obs_password_${fieldStream}_${safeOrg}`) || localStorage.getItem(`obs_password_${fieldStream}`) || '';
    setObsModalAddress(addr);
    setObsModalPassword(pwd);
    setShowObsModal(true);
  };

  const handleSaveObsConnection = async (e) => {
    if (e) e.preventDefault();
    const safeOrg = orgId || 'default';
    const key = activeFieldStream;
    localStorage.setItem(`obs_address_${key}_${safeOrg}`, obsModalAddress);
    localStorage.setItem(`obs_password_${key}_${safeOrg}`, obsModalPassword);
    localStorage.setItem(`obs_address_${key}`, obsModalAddress);
    localStorage.setItem(`obs_password_${key}`, obsModalPassword);

    const res = await obsService.connect(obsModalAddress, obsModalPassword);
    if (res.success) {
      if (key === 'stream1') setIsObs1Connected(true);
      else setIsObs2Connected(true);
      alert(`${key === 'stream1' ? '1-Maydon' : '2-Maydon'} OBS ga muvaffaqiyatli ulandi!`);
      setShowObsModal(false);
    } else {
      alert(`OBS Ulanish xatoligi: ${res.error}`);
    }
  };

  const getYtTokensKey = () => `hfl_yt_tokens_${orgId || 'default'}`;

  const saveYtTokens = async (tokens, channelInfoObj = null) => {
    try {
      const expiresAt = Date.now() + (tokens.expires_in || 3600) * 1000;
      const dataToSave = { 
        ...tokens, 
        expires_at: expiresAt,
        channel_info: channelInfoObj || tokens.channel_info || ytChannelInfo
      };

      const payloadStr = JSON.stringify(dataToSave);

      // 1. Save to localStorage for quick access on current device
      localStorage.setItem(getYtTokensKey(), payloadStr);

      // 2. Persist to Supabase so ALL devices of this organization share connection!
      const currentOrgId = orgId || 1;
      const configName = `YT_OAUTH_TOKENS_${currentOrgId}`;

      // a) Try updating organizations table
      try {
        await supabase
          .from('organizations')
          .update({ yt_tokens: payloadStr })
          .eq('id', currentOrgId);
      } catch (e) {}

      // b) Guaranteed cross-device storage in sponsors table
      try {
        const { data: existing } = await supabase
          .from('sponsors')
          .select('id')
          .eq('name', configName)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('sponsors')
            .update({ logo_url: payloadStr, organization_id: currentOrgId })
            .eq('id', existing.id);
        } else {
          await supabase
            .from('sponsors')
            .insert([{
              name: configName,
              logo_url: payloadStr,
              organization_id: currentOrgId,
              is_main: false,
              is_selected: false
            }]);
        }
      } catch (err) {
        console.warn('Sponsors table token sync:', err);
      }
    } catch (e) {
      console.error('Error saving YT tokens:', e);
    }
  };

  const getYtTokens = async () => {
    // 1. Check localStorage for current orgId
    try {
      const raw = localStorage.getItem(getYtTokensKey());
      if (raw) return JSON.parse(raw);
    } catch (e) {}

    // 2. If not found in localStorage (new device/phone), fetch from Supabase DB!
    const currentOrgId = orgId || 1;

    // a) Try organizations table
    try {
      const { data } = await supabase
        .from('organizations')
        .select('yt_tokens')
        .eq('id', currentOrgId)
        .maybeSingle();

      if (data?.yt_tokens) {
        const parsed = typeof data.yt_tokens === 'string' ? JSON.parse(data.yt_tokens) : data.yt_tokens;
        localStorage.setItem(getYtTokensKey(), JSON.stringify(parsed));
        return parsed;
      }
    } catch (err) {}

    // b) Guaranteed cross-device check from sponsors table
    try {
      const configName = `YT_OAUTH_TOKENS_${currentOrgId}`;
      const { data } = await supabase
        .from('sponsors')
        .select('logo_url')
        .eq('name', configName)
        .maybeSingle();

      if (data?.logo_url) {
        const parsed = JSON.parse(data.logo_url);
        localStorage.setItem(getYtTokensKey(), JSON.stringify(parsed));
        return parsed;
      }
    } catch (err) {}

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
      if (res.status === 401) {
        // Token is expired or unauthorized, clean up YouTube tokens
        const safeOrg = orgId || 'default';
        localStorage.removeItem(`yt_tokens_${safeOrg}`);
        localStorage.removeItem('yt_tokens');
        setYtChannelInfo(null);
        return;
      }
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

    const currentOrgId = orgId || 1;
    try {
      await supabase.from('organizations').update({ yt_tokens: null }).eq('id', currentOrgId);
    } catch (e) {}

    try {
      await supabase.from('sponsors').delete().eq('name', `YT_OAUTH_TOKENS_${currentOrgId}`);
    } catch (e) {}
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

  const updateYouTubeThumbnailForBroadcast = async (broadcastId, token = null, matchObj = null) => {
    try {
      if (matchObj) {
        const homeTeamObj = teams.find(t => t.id === matchObj.home_team_id) || matchObj.home_team;
        const awayTeamObj = teams.find(t => t.id === matchObj.away_team_id) || matchObj.away_team;
        setSelectedMatchForYtExport({
          ...matchObj,
          home_team: homeTeamObj,
          away_team: awayTeamObj
        });
        await new Promise(r => setTimeout(r, 850));
      }

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
        const thumbRes = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${broadcastId}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'image/jpeg'
          },
          body: blob
        });
        const thumbData = await thumbRes.json();
        console.log('✅ YouTube 16:9 Thumbnail upload response:', thumbData);
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

  const [allSponsors, setAllSponsors] = useState([]);
  const [mainSponsor, setMainSponsor] = useState(null);
  const [selectedSponsors, setSelectedSponsors] = useState([]);
  const [leagueSponsorsSettingsMap, setLeagueSponsorsSettingsMap] = useState({});

  useEffect(() => {
    fetchSponsorsData();
    loadLeaguesAndData();
  }, [orgId]);

  const fetchSponsorsData = async () => {
    try {
      let loadedSponsors = [];
      if (orgId) {
        const { data: orgSponsors } = await supabase
          .from('sponsors')
          .select('*')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false });
        if (orgSponsors && orgSponsors.length > 0) {
          loadedSponsors = orgSponsors;
        }
      }

      if (loadedSponsors.length === 0) {
        let query = supabase.from('sponsors').select('*').order('created_at', { ascending: false });
        if (orgId) {
          query = query.eq('organization_id', orgId);
        }
        const { data } = await query;
        loadedSponsors = data || [];
      }

      const settingsMap = {};
      loadedSponsors.forEach(s => {
        if (s.name && s.name.startsWith('LEAGUE_SHOW_SPONSORS_')) {
          const key = s.name.replace('LEAGUE_SHOW_SPONSORS_', '');
          settingsMap[key] = s.logo_url === 'true';
        }
      });
      setLeagueSponsorsSettingsMap(settingsMap);

      // Filter out system internal banner and settings keys
      const realSponsors = loadedSponsors.filter(s => 
        s.name && 
        !s.name.startsWith('SCHEDULE_BANNER_') && 
        !s.name.startsWith('YT_BANNER_') && 
        !s.name.startsWith('YT_OAUTH_TOKENS_') &&
        !s.name.startsWith('MATCH_TIMER_') &&
        !s.name.startsWith('LEAGUE_SHOW_SPONSORS_')
      );

      setAllSponsors(realSponsors);

      // 1. Main sponsor
      const mainFromDb = realSponsors.find(s => s.is_main === true);
      if (mainFromDb) {
        setMainSponsor(mainFromDb);
        try { localStorage.setItem(`hfl_main_sponsor_${orgId}`, JSON.stringify(mainFromDb)); } catch (e) {}
      } else {
        setMainSponsor(null);
      }

      // 2. Selected secondary sponsors directly from DB
      const selectedFromDb = realSponsors.filter(s => !s.is_main && s.is_selected !== false);
      setSelectedSponsors(selectedFromDb);
      try { localStorage.setItem(`hfl_selectedSponsors_${orgId}`, JSON.stringify(selectedFromDb)); } catch (e) {}
    } catch (e) {
      console.error('Error fetching sponsors data:', e);
    }
  };

  const mainSponsorLogo = mainSponsor?.logo_url || '';

  const checkIsShowSponsors = (leagueObj, leagueName) => {
    if (!leagueName && !leagueObj) return true;
    const nameToUse = leagueName || leagueObj?.name;
    const idToUse = leagueObj?.id;

    // 1. Check DB system settings FIRST (synced across devices)
    if (idToUse !== undefined && idToUse !== null && leagueSponsorsSettingsMap[`${idToUse}`] !== undefined) {
      return leagueSponsorsSettingsMap[`${idToUse}`];
    }
    if (nameToUse && leagueSponsorsSettingsMap[nameToUse] !== undefined) {
      return leagueSponsorsSettingsMap[nameToUse];
    }

    // 2. Check DB column if present
    if (leagueObj && leagueObj.show_sponsors !== undefined && leagueObj.show_sponsors !== null) {
      return leagueObj.show_sponsors !== false;
    }

    // 3. Fallback to localStorage
    const localByName = nameToUse ? localStorage.getItem(`hfl_league_show_sponsors_${nameToUse}`) : null;
    if (localByName === 'false') return false;
    if (localByName === 'true') return true;

    const localById = idToUse ? localStorage.getItem(`hfl_league_show_sponsors_${idToUse}`) : null;
    if (localById === 'false') return false;
    if (localById === 'true') return true;

    return true;
  };

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
    if (!exportLeague) return;
    const currentLeagueObj = activeLeagues.find(l => String(l.name || '').trim().toLowerCase() === String(exportLeague || '').trim().toLowerCase()) || activeLeagues.find(l => l.name === exportLeague);

    const scheduleSponsorKey = `BANNER_SCHEDULE_${orgId}_${exportLeague}`;
    const scheduleSponsorRow = allSponsors.find(s => s.name === scheduleSponsorKey);

    const dbUrl = currentLeagueObj?.schedule_banner_url || currentLeagueObj?.export_bg_url || scheduleSponsorRow?.logo_url;
    if (dbUrl) {
      setScheduleBanner(dbUrl);
    } else {
      const localKey = `hfl_schedule_banner_${orgId}_${currentLeagueObj?.id || exportLeague}`;
      const savedLocal = localStorage.getItem(localKey);
      setScheduleBanner(savedLocal || '');
    }

    const ytSponsorKey = `BANNER_YT_${orgId}_${exportLeague}`;
    const ytSponsorRow = allSponsors.find(s => s.name === ytSponsorKey);

    const ytDbUrl = currentLeagueObj?.yt_banner_url || currentLeagueObj?.banner_url || ytSponsorRow?.logo_url;
    if (ytDbUrl) {
      setYtBanner(ytDbUrl);
    } else {
      const ytLocalKey = `hfl_yt_banner_${orgId}_${currentLeagueObj?.id || exportLeague}`;
      const savedYtLocal = localStorage.getItem(ytLocalKey);
      setYtBanner(savedYtLocal || '');
    }
  }, [exportLeague, activeLeagues, allSponsors, orgId]);

  useEffect(() => {
    const leagueMatches = matches.filter(m => m.league === exportLeague && m.round);
    if (leagueMatches.length > 0) {
      const maxR = Math.max(...leagueMatches.map(m => Number(m.round)));
      setExportRound(maxR.toString());
    } else {
      setExportRound('1');
    }
  }, [matches, exportLeague]);

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
          allowTaint: true,
          backgroundColor: null
        });
        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        const homeName = (match.home_team?.name || 'Home').replace(/\s+/g, '_');
        const awayName = (match.away_team?.name || 'Away').replace(/\s+/g, '_');
        link.download = `YouTube_Match_${homeName}_VS_${awayName}_${match.round ? match.round + '_tur' : ''}.png`;
        link.href = dataUrl;
        link.click();

        // Also upload/set thumbnail directly to YouTube if channel is connected and match has YT link
        if (ytChannelInfo && match.youtube_link) {
          const extractId = (url) => {
            if (!url) return null;
            if (url.includes('/live/')) return url.split('/live/')[1]?.split('?')[0];
            if (url.includes('v=')) return url.split('v=')[1]?.split('&')[0];
            if (url.includes('youtu.be/')) return url.split('youtu.be/')[1]?.split('?')[0];
            return null;
          };
          const broadcastId = extractId(match.youtube_link);
          if (broadcastId) {
            await updateYouTubeThumbnailForBroadcast(broadcastId, null, match);
          }
        }
      } catch (err) {
        console.error('YouTube Thumbnail Export Error:', err);
        alert('YouTube Shablon rasmini yuklab olishda xatolik yuz berdi');
      } finally {
        setExportingMatchId(null);
      }
    }, 350);
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
    let query = supabase.from('teams').select('*').eq('status', 'approved');
    query = applyOrgAndCollabFilter(query, orgId, leaguesList);
    const { data } = await query;
    if (data) setTeams((data || []).filter(t => !t.is_archived && t.status !== 'archived'));
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
      merged.sort(compareMatches);
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
    setImportance('oddiy');
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
    setImportance(match.importance || 'oddiy');
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
      const dbClient = supabase || supabase;

      const parsedOrgId = Number(orgId);
      const validOrgId = Number.isInteger(parsedOrgId) ? parsedOrgId : undefined;

      const baseMatchData = {
        league: selectedLeague,
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        match_date: matchDate,
        match_time: matchTime,
        location: location,
        youtube_link: youtubeLink,
        round: matchRound ? parseInt(matchRound) : null,
      };

      if (validOrgId !== undefined) {
        baseMatchData.organization_id = validOrgId;
      }

      const matchData = {
        ...baseMatchData,
        importance: importance,
      };

      let savedMatchId = editingMatch?.id;
      if (editingMatch) {
        let { error } = await dbClient
          .from('matches')
          .update(matchData)
          .eq('id', editingMatch.id);

        if (error) {
          // Fallback if importance column does not exist in Supabase DB schema yet
          let { error: err2 } = await dbClient.from('matches').update(baseMatchData).eq('id', editingMatch.id);
          if (err2) {
            console.error('Match update error:', err2);
            alert('Tahrirlashda xatolik: ' + err2.message);
            return;
          }
        }
      } else {
        let { data, error } = await dbClient.from('matches').insert([{
          ...matchData,
          status: 'scheduled'
        }]).select();

        if (error) {
          // Fallback if importance column does not exist in Supabase DB schema yet
          const fallbackRes = await dbClient.from('matches').insert([{
            ...baseMatchData,
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

      // AUTOMATIC YouTube Live stream creation & thumbnail upload when YouTube is connected
      const existingYtLink = editingMatch?.youtube_link || youtubeLink;
      const fullSavedMatch = {
        ...editingMatch,
        ...matchData,
        id: savedMatchId
      };

      if (ytChannelInfo && savedMatchId && !existingYtLink) {
        await createYouTubeLiveStream(fullSavedMatch, true);
      } else if (existingYtLink) {
        // Auto-update YouTube thumbnail with scores if match was updated
        const extractId = (url) => {
          if (!url) return null;
          if (url.includes('/live/')) return url.split('/live/')[1]?.split('?')[0];
          if (url.includes('v=')) return url.split('v=')[1]?.split('&')[0];
          if (url.includes('youtu.be/')) return url.split('youtu.be/')[1]?.split('?')[0];
          return null;
        };
        const broadcastId = extractId(existingYtLink);
        if (broadcastId) {
          await updateYouTubeThumbnailForBroadcast(broadcastId, null, fullSavedMatch);
        }
      }
    } catch (error) {
      console.error(error);
      alert('Xatolik yuz berdi: ' + (error.message || ''));
    } finally {
      setLoading(false);
    }
  };

  // Delete Match Safety Modal & 5-Second Countdown State
  const [deleteModalState, setDeleteModalState] = useState({
    isOpen: false,
    matchId: null,
    matchTitle: ''
  });
  const [deleteCountdown, setDeleteCountdown] = useState(5);
  const deleteTimerRef = useRef(null);

  const openDeleteModal = (match) => {
    const home = match.home_team?.name || match.home_team_name || 'Uy jamoa';
    const away = match.away_team?.name || match.away_team_name || 'Mehmon jamoa';
    setDeleteModalState({
      isOpen: true,
      matchId: match.id,
      matchTitle: `${home} VS ${away}`
    });
    setDeleteCountdown(5);

    if (deleteTimerRef.current) clearInterval(deleteTimerRef.current);
    deleteTimerRef.current = setInterval(() => {
      setDeleteCountdown(prev => {
        if (prev <= 1) {
          clearInterval(deleteTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const confirmDeleteMatch = async () => {
    if (deleteCountdown > 0 || !deleteModalState.matchId) return;
    const targetId = deleteModalState.matchId;
    setDeleteModalState({ isOpen: false, matchId: null, matchTitle: '' });
    await executeMatchDelete(targetId);
  };

  const executeMatchDelete = async (id) => {
    if (deletingMatchIds.includes(id)) return;
    setDeletingMatchIds(prev => [...prev, id]);

    try {
      const matchToDelete = matches.find(m => m.id === id);

      // 1. Cascade cleanup: Delete ALL 20s replay video files from Supabase Storage for this match
      try {
        const orgId = matchToDelete?.organization_id || currentOrg?.id || 1;
        const matchFolder = `${orgId}/${id}`;

        // List all files inside replays/<org_id>/<match_id>/
        const { data: folderFiles } = await supabase.storage
          .from('replays')
          .list(matchFolder, { limit: 100 });

        let filesToRemove = [];

        if (folderFiles && folderFiles.length > 0) {
          filesToRemove = folderFiles
            .filter(f => f.name && !f.name.startsWith('.'))
            .map(f => `${matchFolder}/${f.name}`);
        }

        // Also collect files from match_events.replay_video_url
        const { data: events } = await supabase
          .from('match_events')
          .select('id, replay_video_url')
          .eq('match_id', id);

        if (events && events.length > 0) {
          events.forEach(e => {
            if (e.replay_video_url && e.replay_video_url.includes('/replays/')) {
              const path = e.replay_video_url.split('/replays/')[1];
              if (path && !filesToRemove.includes(path)) {
                filesToRemove.push(path);
              }
            }
          });

          // Delete match events
          await supabase.from('match_events').delete().eq('match_id', id);
        }

        if (filesToRemove.length > 0) {
          await supabase.storage.from('replays').remove(filesToRemove);
          console.log('Replay videolari Storage-dan 100% tozalandi:', filesToRemove);
        }
      } catch (storageErr) {
        console.warn('Replay fayllarini o\'chirishda xatolik:', storageErr);
      }

      // 2. Auto-delete live broadcast from YouTube API if youtube_link exists
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
            }
          }
        } catch (ytErr) {
          console.warn('Error auto-deleting YouTube broadcast:', ytErr);
        }
      }

      // 3. Delete Match Record
      const { error } = await supabase.from('matches').delete().eq('id', id);
      if (!error) {
        await fetchMatches();
      } else {
        alert("O'yinni o'chirishda xatolik: " + (error.message || ''));
      }
    } catch (err) {
      console.error('Error deleting match:', err);
    } finally {
      setDeletingMatchIds(prev => prev.filter(mId => mId !== id));
    }
  };

  const availableTeams = teams.filter(t => t.league === selectedLeague);
  const availableRounds = (() => {
    const roundsFromMatches = Array.from(new Set(matches.filter(m => m.league === exportLeague && m.round).map(m => Number(m.round)))).sort((a, b) => a - b);
    if (roundsFromMatches.length > 0) return roundsFromMatches;
    return Array.from({ length: 30 }, (_, i) => i + 1);
  })();

  return (
    <div className="schedule-page">
      {/* Header */}
      <div className="schedule-header">
        <div>
          <h1>O'yinlar Jadvali</h1>
          <p>{currentOrg?.name} ({exportLeague || 'Barcha ligalar'})</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>

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
                  <select value={exportRound || '1'} onChange={e => setExportRound(e.target.value)}>
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

        {/* PNG Eksport Buttonlari */}
        <div style={{ marginTop: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button className="btn-download-poster" onClick={handleExport} disabled={isExporting} style={{ flex: 1, minWidth: '180px' }}>
            {isExporting ? (
              <><span className="btn-spinner"></span> <span>Yuklanmoqda...</span></>
            ) : (
              <><Download size={18} /> <span>Jadvalni yuklab olish (1:1)</span></>
            )}
          </button>
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
            .sort(compareMatches)
            .map(match => {
              const isDeleting = deletingMatchIds.includes(match.id);
              const mImportance = match.importance || 'oddiy';
              const cardImportanceStyle = mImportance === 'markaziy'
                ? { border: '2px solid #ffe600', boxShadow: '0 0 16px rgba(255, 230, 0, 0.45)', background: 'linear-gradient(135deg, rgba(255, 230, 0, 0.12) 0%, rgba(15, 23, 42, 0.85) 100%)' }
                : mImportance === 'ortacha'
                ? { border: '2px solid #0ea5e9', boxShadow: '0 0 14px rgba(14, 165, 233, 0.35)', background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.1) 0%, rgba(15, 23, 42, 0.85) 100%)' }
                : {};

              return (
              <div key={match.id} className={`match-card glassmorphic-card ${isDeleting ? 'deleting-card' : ''}`} style={cardImportanceStyle}>
                <div className="match-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: '10px' }}>
                  <div className="match-badges-container" style={{ position: 'static', margin: 0, display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                     <div className="match-league-badge">{match.league}</div>
                     {match.round && <div className="match-league-badge round-badge">{match.round}-Tur</div>}
                     {mImportance === 'markaziy' && (
                       <div style={{ background: 'rgba(255, 230, 0, 0.25)', color: '#ffe600', border: '1px solid #ffe600', padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '900' }}>
                         ⭐ MARKAZIY
                       </div>
                     )}
                     {mImportance === 'ortacha' && (
                       <div style={{ background: 'rgba(14, 165, 233, 0.25)', color: '#38bdf8', border: '1px solid #0ea5e9', padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '900' }}>
                         ⚡ SHIDDATLI
                       </div>
                     )}
                  </div>
                  <div className="match-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button className="edit-match-btn" onClick={() => handleEditMatch(match)} disabled={isDeleting} title="Tahrirlash">
                      <Pencil size={15} />
                    </button>
                    <button className="delete-match-btn" onClick={() => openDeleteModal(match)} disabled={isDeleting} title="O'chirish">
                      {isDeleting ? (
                        <span className="btn-spinner delete-spinner"></span>
                      ) : (
                        <Trash2 size={15} />
                      )}
                    </button>
                  </div>
                </div>

                <div className="match-teams">
                  <div className="team"><img src={match.home_team?.logo_url || '/images/default-team.png'} alt="Home" className="team-logo" /><span>{match.home_team?.name}</span></div>
                  <div className="match-vs">{(match.status === 'finished' || match.home_score > 0 || match.away_score > 0) ? <>{match.home_score || 0} - {match.away_score || 0}</> : 'VS'}</div>
                  <div className="team"><img src={match.away_team?.logo_url || '/images/default-team.png'} alt="Away" className="team-logo" /><span>{match.away_team?.name}</span></div>
                </div>

                <div className="match-footer-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginTop: '12px' }}>
                  <div className="match-details">
                    <div className="detail-row"><Calendar size={14} /> <span>{match.match_date}</span></div>
                    <div className="detail-row"><Clock size={14} /> <span>{match.match_time}</span></div>
                    <div className="detail-row"><MapPin size={14} /> <span>{match.location}</span></div>
                  </div>

                  <div className="match-footer-actions" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {match.youtube_link ? (
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
                            padding: '6px 10px', 
                            borderRadius: '8px', 
                            fontSize: '11px', 
                            fontWeight: '800', 
                            textDecoration: 'none',
                            boxShadow: '0 2px 10px rgba(255,0,0,0.35)',
                            pointerEvents: isDeleting ? 'none' : 'auto'
                          }}
                        >
                          <Video size={13} /> Jonli Ko'rish
                        </a>
                      ) : (
                        ytChannelInfo && (
                          <button 
                            className="yt-live-create-btn"
                            onClick={() => createYouTubeLiveStream(match, true)}
                            disabled={ytLoading || isDeleting}
                            title="YouTube'da Jonli Efir Ochish va 16:9 Oblojkani Avtomatik Yuklash"
                            style={{ background: 'rgba(255, 0, 0, 0.15)', border: '1px solid rgba(255, 0, 0, 0.4)', color: '#ff4d4d', borderRadius: '8px', padding: '6px 10px', cursor: isDeleting ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: '800' }}
                          >
                            <Video size={13} /> {ytLoading ? 'Ochilmoqda...' : 'Live Yaratish'}
                          </button>
                        )
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {match.is_postponed ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(255, 59, 48, 0.2)', border: '1px solid rgba(255, 59, 48, 0.4)', color: '#ff3b30', padding: '4px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: '800' }}>
                          <AlertCircle size={13} /> Qoldirilgan
                        </div>
                      ) : match.status === 'finished' ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(0, 255, 102, 0.15)', border: '1px solid rgba(0, 255, 102, 0.4)', color: '#00ff66', padding: '4px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: '800' }}>
                          <CheckCircle2 size={13} /> Tugagan
                        </div>
                      ) : (match.status === 'first_half' || match.status === 'second_half' || match.status === 'half_time' || match.status === 'live') ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(255, 59, 48, 0.25)', border: '1px solid rgba(255, 59, 48, 0.6)', color: '#ff3b30', padding: '4px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: '800' }}>
                          <Radio size={13} /> Jonli
                        </div>
                      ) : (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.2)', color: 'rgba(255, 255, 255, 0.8)', padding: '4px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: '800' }}>
                          <Clock size={13} /> Rejalashtirilgan
                        </div>
                      )}

                      <label 
                        className={`match-postponed-toggle ${match.is_postponed ? 'is-postponed' : ''}`}
                        onClick={(e) => e.stopPropagation()}
                        title="Qoldirilgan o'yin deb belgilash"
                        style={{ margin: 0, opacity: isDeleting ? 0.5 : 1, pointerEvents: isDeleting ? 'none' : 'auto' }}
                      >
                        <input 
                          type="checkbox" 
                          checked={!!match.is_postponed} 
                          disabled={isDeleting}
                          onChange={(e) => handleTogglePostponed(match, e.target.checked)} 
                        />
                      </label>
                    </div>
                  </div>
                </div>

                <button className="btn-manage-match" disabled={isDeleting} onClick={() => navigate('/match/' + match.id)}>⚙️ Boshqarish</button>
              </div>
            );
            })}
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

            <div className="form-group" style={{ marginTop: '12px' }}>
              <label style={{ fontWeight: '700', color: '#e2e8f0', marginBottom: '6px', display: 'block' }}>
                O'yin Dolzarbligi Darajasi (Ilovalar uchun):
              </label>
              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setImportance('oddiy')}
                  style={{
                    flex: 1,
                    padding: '10px 6px',
                    borderRadius: '8px',
                    border: importance === 'oddiy' ? '2px solid #64748b' : '1px solid rgba(255,255,255,0.1)',
                    background: importance === 'oddiy' ? 'rgba(100, 116, 139, 0.3)' : 'rgba(255,255,255,0.03)',
                    color: '#ffffff',
                    fontWeight: importance === 'oddiy' ? '800' : '500',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  ⚪ Oddiy
                </button>

                <button
                  type="button"
                  onClick={() => setImportance('ortacha')}
                  style={{
                    flex: 1,
                    padding: '10px 6px',
                    borderRadius: '8px',
                    border: importance === 'ortacha' ? '2px solid #0ea5e9' : '1px solid rgba(255,255,255,0.1)',
                    background: importance === 'ortacha' ? 'rgba(14, 165, 233, 0.3)' : 'rgba(255,255,255,0.03)',
                    color: importance === 'ortacha' ? '#38bdf8' : '#ffffff',
                    fontWeight: importance === 'ortacha' ? '800' : '500',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  🔵 O'rtacha
                </button>

                <button
                  type="button"
                  onClick={() => setImportance('markaziy')}
                  style={{
                    flex: 1,
                    padding: '10px 6px',
                    borderRadius: '8px',
                    border: importance === 'markaziy' ? '2px solid #ffe600' : '1px solid rgba(255,255,255,0.1)',
                    background: importance === 'markaziy' ? 'rgba(255, 230, 0, 0.3)' : 'rgba(255,255,255,0.03)',
                    color: importance === 'markaziy' ? '#ffe600' : '#ffffff',
                    fontWeight: importance === 'markaziy' ? '800' : '500',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  ⭐ Markaziy
                </button>
              </div>
            </div>

            <div 
              onClick={() => setIsPostponed(!isPostponed)}
              style={{ 
                display: 'flex', 
                flexDirection: 'row',
                alignItems: 'center', 
                gap: '10px', 
                marginTop: '14px', 
                marginBottom: '10px',
                background: isPostponed ? 'rgba(255, 59, 48, 0.2)' : 'rgba(255, 255, 255, 0.05)', 
                padding: '10px 16px', 
                borderRadius: '10px', 
                border: isPostponed ? '1px solid rgba(255, 59, 48, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)', 
                cursor: 'pointer',
                userSelect: 'none',
                width: 'fit-content'
              }}
            >
              <input 
                type="checkbox" 
                id="is_postponed_checkbox"
                checked={isPostponed} 
                onChange={(e) => setIsPostponed(e.target.checked)} 
                onClick={(e) => e.stopPropagation()}
                style={{ width: '18px', height: '18px', margin: 0, padding: 0, cursor: 'pointer', accentColor: '#ff3b30' }}
              />
              <span style={{ cursor: 'pointer', fontWeight: '700', color: isPostponed ? '#ff4d4d' : '#ffffff', fontSize: '14px', whiteSpace: 'nowrap', display: 'inline-block' }}>
                Qoldirilgan o'yin
              </span>
            </div>

            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setIsModalOpen(false)}>Bekor qilish</button>
              <button className="btn-save" onClick={handleSave} disabled={loading}>
                {loading ? <><span className="btn-spinner"></span> Saqlanmoqda...</> : (editingMatch ? 'Yangilash' : 'Saqlash')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5-Second Confirmation Danger Modal */}
      {deleteModalState.isOpen && (
        <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', zIndex: 9999 }}>
          <div className="modal-content" style={{ maxWidth: '440px', border: '1px solid rgba(239, 68, 68, 0.4)', background: 'linear-gradient(145deg, #1e1b2e 0%, #0f172a 100%)', borderRadius: '18px', padding: '24px' }}>
            <div style={{ width: '54px', height: '54px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', border: '1px solid rgba(239, 68, 68, 0.4)' }}>
              <AlertCircle size={30} color="#ef4444" />
            </div>

            <h2 style={{ textAlign: 'center', color: '#ffffff', fontSize: '18px', fontWeight: '800', marginBottom: '8px', textTransform: 'uppercase' }}>
              O'YINNI CHINDAN HAM O'CHIRASIZMI?
            </h2>

            <p style={{ textAlign: 'center', color: '#f87171', fontSize: '14px', fontWeight: '700', marginBottom: '14px' }}>
              {deleteModalState.matchTitle}
            </p>

            <div style={{ background: 'rgba(239, 68, 68, 0.1)', borderRadius: '12px', padding: '12px', marginBottom: '20px', borderWidth: '1px', borderColor: 'rgba(239, 68, 68, 0.2)' }}>
              <p style={{ color: '#cbd5e1', fontSize: '12px', textAlign: 'center', margin: 0, lineHeight: 1.5 }}>
                ⚠️ <strong>OGOHLANTIRISH:</strong> Ushbu o'yinni o'chirsangiz, unga tegishli barcha <strong>20 soniyalik video replaylar</strong>, gollar va statistik ma'lumotlar bazadan to'liq va qaytarib bo'lmaydigan qilib tozalanadi!
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                type="button" 
                className="btn-cancel" 
                onClick={() => setDeleteModalState({ isOpen: false, matchId: null, matchTitle: '' })}
                style={{ flex: 1, padding: '12px', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}
              >
                Bekor qilish
              </button>

              <button 
                type="button" 
                disabled={deleteCountdown > 0}
                onClick={confirmDeleteMatch}
                style={{ 
                  flex: 1, 
                  padding: '12px', 
                  borderRadius: '10px', 
                  fontWeight: '800', 
                  color: '#ffffff',
                  background: deleteCountdown > 0 ? '#475569' : '#dc2626',
                  opacity: deleteCountdown > 0 ? 0.75 : 1,
                  cursor: deleteCountdown > 0 ? 'not-allowed' : 'pointer',
                  border: 'none',
                  transition: 'all 0.3s'
                }}
              >
                {deleteCountdown > 0 ? `O'chirish (${deleteCountdown}s)` : "🗑️ Ha, O'chirilsin!"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HIDDEN YOUTUBE THUMBNAIL 16:9 EXPORT TEMPLATE */}
      <div style={{ position: 'fixed', left: '-9999px', top: 0, pointerEvents: 'none', zIndex: -100 }}>
        {(() => {
          const currentLeagueObj = activeLeagues.find(l => String(l.name || '').trim().toLowerCase() === String(exportLeague || '').trim().toLowerCase()) || activeLeagues.find(l => l.name === exportLeague);
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
                padding: '10px 45px 25px 45px', 
                boxSizing: 'border-box',
                fontFamily: "'Outfit', 'Inter', sans-serif"
              }}
            >
              {/* Header */}
              <div className="export-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <div className="export-logo-left" style={{ width: '280px', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '10px', justifyContent: 'flex-start' }}>
                  {isCollab ? (
                    <>
                      <img src={currentLeagueObj.org1?.logo_url || '/logo-for-jadval.png'} alt="Org 1" crossOrigin="anonymous" style={{ height: '95px', objectFit: 'contain', background: 'transparent' }} />
                      <img src="/x.png" crossOrigin="anonymous" style={{ height: '16px', objectFit: 'contain', opacity: 0.8, background: 'transparent' }} />
                      <img src={currentLeagueObj.org2?.logo_url || '/llf-logo.png'} alt="Org 2" crossOrigin="anonymous" style={{ height: '80px', objectFit: 'contain', background: 'transparent' }} />
                    </>
                  ) : (
                    <img src={currentOrg?.logo_url || '/logo-for-jadval.png'} alt={currentOrg?.name || 'HFL'} crossOrigin="anonymous" style={{ height: '100px', objectFit: 'contain', background: 'transparent' }} />
                  )}
                </div>

                <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                  {currentLeagueObj?.logo_url ? (
                    <img src={currentLeagueObj.logo_url} alt={exportLeague} style={{ maxHeight: '110px', maxWidth: '400px', width: 'auto', height: 'auto', objectFit: 'contain', background: 'transparent', border: 'none', display: 'block', margin: '0 auto' }} crossOrigin="anonymous" />
                  ) : (
                    <h2 style={{ color: '#fff', fontSize: '42px', fontWeight: '900', textTransform: 'uppercase', margin: 0, fontStyle: 'italic', letterSpacing: '1px' }}>{exportLeague}</h2>
                  )}
                </div>

                <div className="export-logo-right" style={{ width: '280px', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', paddingRight: '20px', boxSizing: 'border-box' }}>
                  {mainSponsorLogo ? (
                    <img src={mainSponsorLogo} alt="Bosh Homiy" crossOrigin="anonymous" style={{ maxHeight: '85px', maxWidth: '240px', width: 'auto', height: 'auto', objectFit: 'contain', background: 'transparent', display: 'block' }} />
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
                        ? `${selectedMatchForYtExport.home_score || 0} - ${selectedMatchForYtExport.away_score || 0}`
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
                const targetLeagueName = selectedMatchForYtExport?.league || exportLeague;
                const currentLeagueObj = activeLeagues.find(l => l.name === targetLeagueName);
                const isShowSponsors = checkIsShowSponsors(currentLeagueObj, targetLeagueName);
                if (!isShowSponsors) return null;
                const secondarySponsors = selectedSponsors.filter(s => s.id !== mainSponsor?.id);
                if (secondarySponsors.length === 0) return null;
                return (
                  <div style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '20px 0 10px 0', boxSizing: 'border-box' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '28px' }}>
                      {secondarySponsors.map((s, idx) => (
                        <React.Fragment key={s.id || idx}>
                          <img src={s.logo_url} alt={s.name} crossOrigin="anonymous" style={{ height: '30px', maxWidth: '100px', objectFit: 'contain', filter: 'grayscale(100%) brightness(1.2)', opacity: 0.8 }} />
                          {idx < secondarySponsors.length - 1 && (
                            <div style={{ height: '18px', width: '1px', backgroundColor: '#ffffff', opacity: 0.35 }}></div>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })()}
      </div>

      <div style={{ position: 'fixed', left: '-9999px', top: 0, pointerEvents: 'none', zIndex: -100 }}>
        {(() => {
          const currentLeagueObj = activeLeagues.find(l => String(l.name || '').trim().toLowerCase() === String(exportLeague || '').trim().toLowerCase()) || activeLeagues.find(l => l.name === exportLeague);
          const isCollab = currentLeagueObj?.isCollab;

          return (
            <div ref={exportRef} className="schedule-export-container 1x1-poster-export" style={{ width: '1080px', height: '1080px', backgroundImage: scheduleBanner ? `linear-gradient(rgba(10, 13, 18, 0.75), rgba(10, 13, 18, 0.88)), url(${scheduleBanner})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '24px 45px 20px 45px', boxSizing: 'border-box' }}>
                {(() => {
                  const filteredList = matches
                    .filter(m => m.league === exportLeague && (!exportRound || m.round == exportRound))
                    .filter(m => {
                      if (filterStatus === 'all') return true;
                      if (filterStatus === 'live') return m.status === 'first_half' || m.status === 'second_half' || m.status === 'half_time';
                      return m.status === filterStatus;
                    })
                    .sort(compareMatches);

                  const currentRoundMatches = filteredList.filter(m => !m.is_postponed);
                  const postponedMatches = filteredList.filter(m => m.is_postponed);
                  const totalCount = currentRoundMatches.length + postponedMatches.length;

                  let rowPadding = '9px 18px';
                  let teamFontSize = '25px';
                  let teamLogoSize = '65px';
                  let timeBoxFontSize = '40px';
                  let timeDateFontSize = '14px';
                  let matchGap = '14px';

                  if (totalCount > 6) {
                    rowPadding = '6.5px 14px';
                    teamFontSize = '22px';
                    teamLogoSize = '58px';
                    timeBoxFontSize = '36px';
                    timeDateFontSize = '13px';
                    matchGap = '10px';
                  }

                  return (
                    <>
                      {/* Header */}
                      <div className="export-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', width: '100%' }}>
                        <div className="export-logo-left" style={{ width: '280px', minWidth: '280px', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', justifyContent: 'flex-start' }}>
                          {isCollab ? (
                            <>
                              <img src={currentLeagueObj.org1?.logo_url || '/logo-for-jadval.png'} alt="Org 1" crossOrigin="anonymous" style={{ height: totalCount > 6 ? '90px' : '95px', objectFit: 'contain', background: 'transparent' }} />
                              <img src="/x.png" crossOrigin="anonymous" style={{ height: '16px', objectFit: 'contain', opacity: 0.7, background: 'transparent' }} />
                              <img src={currentLeagueObj.org2?.logo_url || '/llf-logo.png'} alt="Org 2" crossOrigin="anonymous" style={{ height: totalCount > 6 ? '75px' : '80px', objectFit: 'contain', background: 'transparent' }} />
                            </>
                          ) : (
                            <img src={currentOrg?.logo_url || '/logo-for-jadval.png'} alt={currentOrg?.name || 'HFL'} crossOrigin="anonymous" style={{ height: totalCount > 6 ? '95px' : '100px', objectFit: 'contain', background: 'transparent' }} />
                          )}
                        </div>

                        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                          {currentLeagueObj?.logo_url ? (
                            <img src={currentLeagueObj.logo_url} alt={exportLeague} style={{ maxHeight: totalCount > 6 ? '105px' : '110px', maxWidth: '400px', width: 'auto', height: 'auto', objectFit: 'contain', background: 'transparent', border: 'none', display: 'block', margin: '0 auto' }} crossOrigin="anonymous" />
                          ) : (
                            <h2 style={{ color: '#fff', fontSize: '36px', fontWeight: '900', textTransform: 'uppercase', margin: 0 }}>{exportLeague} {exportRound ? `(${exportRound}-TUR)` : ''}</h2>
                          )}
                        </div>

                        <div className="export-logo-right" style={{ width: '280px', minWidth: '280px', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', paddingRight: '20px', boxSizing: 'border-box' }}>
                          {mainSponsorLogo ? (
                            <img src={mainSponsorLogo} alt="Bosh Homiy" crossOrigin="anonymous" style={{ maxHeight: totalCount > 6 ? '80px' : '85px', maxWidth: '240px', width: 'auto', height: 'auto', objectFit: 'contain', background: 'transparent', display: 'block' }} />
                          ) : null}
                        </div>
                      </div>

                      {/* Matches Body */}
                      <div className="sch-export-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: matchGap, justifyContent: 'center' }}>
                        {currentRoundMatches.map(match => {
                          const isMatchFinished = match.status === 'finished' || filterStatus === 'finished' || (match.home_score !== null && match.away_score !== null && (match.home_score > 0 || match.away_score > 0 || match.status === 'finished'));
                          return (
                            <div key={match.id} className="sch-match-row" style={{ padding: rowPadding, gridTemplateColumns: `${teamLogoSize} 1fr 200px 1fr ${teamLogoSize}` }}>
                              <img src={match.home_team?.logo_url} className="sch-team-logo" style={{ width: teamLogoSize, height: teamLogoSize }} crossOrigin="anonymous" alt="" />
                              <div style={{ color: '#fff', fontSize: teamFontSize, fontWeight: '900', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '1px', wordBreak: 'break-word', padding: '0 6px' }}>{match.home_team?.name}</div>
                              <div className="sch-time-container">
                                <div className="sch-time-date" style={{ fontSize: timeDateFontSize }}>{match.match_date?.split('-').reverse().join('.')}</div>
                                <div className="sch-time-box" style={{ fontSize: timeBoxFontSize }}>
                                  {isMatchFinished ? `${match.home_score || 0} - ${match.away_score || 0}` : match.match_time?.substring(0, 5)}
                                </div>
                              </div>
                              <div style={{ color: '#fff', fontSize: teamFontSize, fontWeight: '900', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '1px', wordBreak: 'break-word', padding: '0 6px' }}>{match.away_team?.name}</div>
                              <img src={match.away_team?.logo_url} className="sch-team-logo" style={{ width: teamLogoSize, height: teamLogoSize }} crossOrigin="anonymous" alt="" />
                            </div>
                          );
                        })}

                        {postponedMatches.length > 0 && (
                          <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: matchGap, width: '100%', alignItems: 'center' }}>
                            <div style={{ background: 'rgba(255, 59, 48, 0.35)', border: '1px solid rgba(255, 59, 48, 0.75)', color: '#ffffff', padding: '4px 16px', borderRadius: '10px', fontSize: '12px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '1.5px', boxShadow: '0 4px 12px rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}>
                              {postponedMatches.length > 1 ? "QOLDIRILGAN O'YINLAR" : "QOLDIRILGAN O'YIN"}
                            </div>
                            {postponedMatches.map(match => {
                              const isMatchFinished = match.status === 'finished' || filterStatus === 'finished' || (match.home_score !== null && match.away_score !== null && (match.home_score > 0 || match.away_score > 0 || match.status === 'finished'));
                              return (
                                <div key={match.id} className="sch-match-row" style={{ padding: rowPadding, gridTemplateColumns: `${teamLogoSize} 1fr 200px 1fr ${teamLogoSize}`, borderColor: 'rgba(255, 59, 48, 0.65)', background: 'rgba(255, 59, 48, 0.2)' }}>
                                  <img src={match.home_team?.logo_url} className="sch-team-logo" style={{ width: teamLogoSize, height: teamLogoSize }} crossOrigin="anonymous" alt="" />
                                  <div style={{ color: '#fff', fontSize: teamFontSize, fontWeight: '900', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '1px', wordBreak: 'break-word', padding: '0 6px' }}>{match.home_team?.name}</div>
                                  <div className="sch-time-container">
                                    <div className="sch-time-date" style={{ fontSize: timeDateFontSize }}>{match.match_date?.split('-').reverse().join('.')}</div>
                                    <div className="sch-time-box" style={{ fontSize: timeBoxFontSize }}>
                                      {isMatchFinished ? `${match.home_score || 0} - ${match.away_score || 0}` : match.match_time?.substring(0, 5)}
                                    </div>
                                  </div>
                                  <div style={{ color: '#fff', fontSize: teamFontSize, fontWeight: '900', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '1px', wordBreak: 'break-word', padding: '0 6px' }}>{match.away_team?.name}</div>
                                  <img src={match.away_team?.logo_url} className="sch-team-logo" style={{ width: teamLogoSize, height: teamLogoSize }} crossOrigin="anonymous" alt="" />
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Footer Secondary Sponsors Banner */}
                      {(() => {
                        const currentLeagueObj = activeLeagues.find(l => String(l.name || '').trim().toLowerCase() === String(exportLeague || '').trim().toLowerCase()) || activeLeagues.find(l => l.name === exportLeague);
                        const isShowSponsors = checkIsShowSponsors(currentLeagueObj, exportLeague);
                        if (!isShowSponsors) return null;
                        const secondarySponsors = selectedSponsors.filter(s => s.id !== mainSponsor?.id);
                        if (secondarySponsors.length === 0) return null;
                        return (
                          <div style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: '10px', marginBottom: '5px', boxSizing: 'border-box' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '28px' }}>
                              {secondarySponsors.map((s, idx) => (
                                <React.Fragment key={s.id || idx}>
                                  <img src={s.logo_url} alt={s.name} crossOrigin="anonymous" style={{ height: '32px', maxWidth: '105px', objectFit: 'contain', filter: 'grayscale(100%) brightness(1.2)', opacity: 0.8 }} />
                                  {idx < secondarySponsors.length - 1 && (
                                    <div style={{ height: '18px', width: '1px', backgroundColor: '#ffffff', opacity: 0.35 }}></div>
                                  )}
                                </React.Fragment>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  );
                })()}
            </div>
          );
        })()}
      </div>

      {/* OBS Settings Modal for Organization */}
      {showObsModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '420px' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Video size={24} color="#7c3aed" /> {activeFieldStream === 'stream1' ? '1-Maydon OBS Sozlamalari' : '2-Maydon OBS Sozlamalari'}
            </h2>
            <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '15px' }}>
              {currentOrg?.name || 'Tashkilot'} uchun {activeFieldStream === 'stream1' ? '1-Maydon' : '2-Maydon'} OBS WebSocket ulanishi.
            </p>
            <form onSubmit={handleSaveObsConnection}>
              <div className="form-group">
                <label>OBS WebSocket Manzili (Address):</label>
                <input
                  type="text"
                  value={obsModalAddress}
                  onChange={(e) => setObsModalAddress(e.target.value)}
                  placeholder={activeFieldStream === 'stream2' ? 'ws://localhost:4456' : 'ws://localhost:4455'}
                  required
                />
              </div>

              <div className="form-group">
                <label>OBS Paroli (Server Password):</label>
                <input
                  type="password"
                  value={obsModalPassword}
                  onChange={(e) => setObsModalPassword(e.target.value)}
                  placeholder="Agar bo'sh bo'lsa, qoldiring"
                />
              </div>

              <div className="modal-actions" style={{ marginTop: '20px' }}>
                <button type="button" className="btn-cancel" onClick={() => setShowObsModal(false)}>Yopish</button>
                <button type="submit" className="btn-save" style={{ background: '#7c3aed' }}>Saqlash va Ulanish</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Schedule;
