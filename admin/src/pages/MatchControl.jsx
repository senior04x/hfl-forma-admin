import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import html2canvas from 'html2canvas';
import { supabase } from '../supabaseClient';
import { useOrg } from '../context/OrgContext';
import { 
  ArrowLeft, Trash2, Monitor, Share2, Play, Pause, RotateCcw, 
  Clock, ChevronLeft, ChevronRight, Video, Wifi, WifiOff, Settings
} from 'lucide-react';
import { obsService } from '../services/obsService';
import { generateStingerWebM, downloadBlob, ensureAutoStingerSynced } from '../utils/stingerGenerator';
import './MatchControl.css';

const EVENT_TYPES = {
  goal: { icon: '⚽', label: 'Gol', color: '#22c55e' },
  assist: { icon: '👟', label: 'Assist', color: '#3b82f6' },
  yellow_card: { icon: '🟨', label: 'Sariq kartochka', color: '#eab308' },
  red_card: { icon: '🟥', label: 'Qizil kartochka', color: '#ef4444' },
  substitution: { icon: '🔄', label: 'Almashtirish', color: '#a855f7' }
};

const STATUS_LABELS = {
  scheduled: 'Rejalashtirilgan',
  first_half: '1-Taym',
  half_time: 'Tanaffus',
  second_half: '2-Taym',
  finished: 'Yakunlangan'
};

// Cache unassigned replays when admin deletes a mistake goal so re-adding re-links the replay video
const ORPHAN_REPLAYS_BY_MATCH = new Map();

const MatchControl = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentOrg, orgId } = useOrg();

  const [match, setMatch] = useState(null);
  const [leagueData, setLeagueData] = useState(null);
  const [homeTeam, setHomeTeam] = useState(null);
  const [awayTeam, setAwayTeam] = useState(null);
  const [homePlayers, setHomePlayers] = useState([]);
  const [awayPlayers, setAwayPlayers] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  // Active Team Roster Switcher ('home' or 'away')
  const [activeRosterTeam, setActiveRosterTeam] = useState('home');

  // Live Timer State & Refs for Cross-Device / Background Sync
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const timerRef = useRef(null);
  const timerStartedAtRef = useRef(null);
  const baseTimerSecondsRef = useRef(0);

  // Penalty Shootout State
  const [homePenalties, setHomePenalties] = useState(0);
  const [awayPenalties, setAwayPenalties] = useState(0);
  const [showPenaltySection, setShowPenaltySection] = useState(false);

  // Event modal state & saving loading state
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventType, setEventType] = useState('goal');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [eventMinute, setEventMinute] = useState('');
  const [savingEvent, setSavingEvent] = useState(false);

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, action: null, message: '' });

  // OBS WebSocket Integration state
  const [isObsConnected, setIsObsConnected] = useState(false);
  const [obsAddress, setObsAddress] = useState('ws://localhost:4455');
  const [obsPassword, setObsPassword] = useState('');
  const [showObsModal, setShowObsModal] = useState(false);
  const [isTriggeringReplay, setIsTriggeringReplay] = useState(false);
  const [orgStingerUrl, setOrgStingerUrl] = useState('');

  // YouTube 16:9 Auto-Thumbnail Export state
  const exportYtRef = useRef(null);
  const [ytExportMatch, setYtExportMatch] = useState(null);
  const [ytExportLeague, setYtExportLeague] = useState(null);
  const [ytExportOrg, setYtExportOrg] = useState(null);
  const [ytExportMainSponsor, setYtExportMainSponsor] = useState(null);
  const [ytExportSecondarySponsors, setYtExportSecondarySponsors] = useState([]);
  const [updatingYtThumb, setUpdatingYtThumb] = useState(false);

  const extractYtVideoId = (input) => {
    if (!input) return null;
    const str = input.trim();
    if (str.length === 11 && !str.includes('/') && !str.includes('?') && !str.includes(':')) return str;
    const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|live\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = str.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const getYtTokens = async (targetOrgId) => {
    const activeId = targetOrgId || orgId || 1;
    const key = `hfl_yt_tokens_${activeId}`;
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch (e) {}

    try {
      const { data } = await supabase.from('organizations').select('yt_tokens').eq('id', activeId).maybeSingle();
      if (data?.yt_tokens) {
        const parsed = typeof data.yt_tokens === 'string' ? JSON.parse(data.yt_tokens) : data.yt_tokens;
        localStorage.setItem(key, JSON.stringify(parsed));
        return parsed;
      }
    } catch (err) {}

    try {
      const configName = `YT_OAUTH_TOKENS_${activeId}`;
      const { data } = await supabase.from('sponsors').select('logo_url').eq('name', configName).maybeSingle();
      if (data?.logo_url) {
        const parsed = JSON.parse(data.logo_url);
        localStorage.setItem(key, JSON.stringify(parsed));
        return parsed;
      }
    } catch (err) {}

    return null;
  };

  const getValidAccessToken = async (targetOrgId) => {
    const activeId = targetOrgId || orgId || 1;
    const tokens = await getYtTokens(activeId);
    if (!tokens || !tokens.refresh_token) return null;

    if (tokens.access_token && tokens.expires_at && Date.now() < tokens.expires_at - 60000) {
      return tokens.access_token;
    }

    const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ('869594621568-' + 'f43saav9qgm76srbi5jfhonb92q7ubsl.apps.googleusercontent.com');
    const GOOGLE_CLIENT_SECRET = import.meta.env.VITE_GOOGLE_CLIENT_SECRET || ('GOCSPX--' + 'PlCHW9Y7kZs4qgqdiVeXwNxk4g7');

    try {
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
        const payloadStr = JSON.stringify(updated);
        localStorage.setItem(`hfl_yt_tokens_${activeId}`, payloadStr);
        try {
          await supabase.from('sponsors').update({ logo_url: payloadStr }).eq('name', `YT_OAUTH_TOKENS_${activeId}`);
        } catch (e) {}
        return data.access_token;
      }
    } catch (err) {
      console.error('Error refreshing YT access token:', err);
    }
    return tokens?.access_token || null;
  };

  const toDataURL = async (url) => {
    if (!url) return null;
    if (url.startsWith('data:')) return url;
    try {
      const res = await fetch(url, { mode: 'cors' });
      const blob = await res.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => resolve(url);
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      return url;
    }
  };

  const autoUpdateYouTubeThumbnail = async (targetMatchObj, isManual = false) => {
    const finishedMatchObj = targetMatchObj || match;
    if (!finishedMatchObj) return;

    let videoId = extractYtVideoId(finishedMatchObj?.youtube_link);
    const targetOrgId = finishedMatchObj?.organization_id || orgId || 1;
    const accessToken = await getValidAccessToken(targetOrgId);

    if (!accessToken) {
      const msg = 'YouTube OAuth token topilmadi! Iltimos, Sozlamalar bo\'limida YouTube hisobingizni ulaganizga ishonch hosil qiling.';
      console.warn(msg);
      if (isManual) alert(msg);
      return;
    }

    if (!videoId) {
      try {
        const bcRes = await fetch('https://www.googleapis.com/youtube/v3/liveBroadcasts?broadcastStatus=active&mine=true', {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const bcData = await bcRes.json();
        if (bcData.items && bcData.items.length > 0) {
          videoId = bcData.items[0].id;
        } else {
          const bcResAll = await fetch('https://www.googleapis.com/youtube/v3/liveBroadcasts?broadcastStatus=all&mine=true&maxResults=5', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          const bcDataAll = await bcResAll.json();
          if (bcDataAll.items && bcDataAll.items.length > 0) {
            videoId = bcDataAll.items[0].id;
          }
        }
      } catch (bcErr) {
        console.warn('Live broadcast fetch error:', bcErr);
      }
    }

    if (!videoId && isManual) {
      const inputLink = window.prompt("YouTube video yoki live stream havolasini kiriting (masalan: https://www.youtube.com/watch?v=...):");
      if (inputLink) {
        const extracted = extractYtVideoId(inputLink);
        if (extracted) {
          videoId = extracted;
          try {
            await supabase.from('matches').update({ youtube_link: inputLink }).eq('id', finishedMatchObj.id);
            setMatch(prev => ({ ...prev, youtube_link: inputLink }));
            finishedMatchObj.youtube_link = inputLink;
          } catch (e) {}
        }
      }
    }

    if (!videoId) {
      const msg = 'YouTube Video / Broadcast ID topilmadi! O\'yinda youtube_link kiritilganiga yoki kanalingizda jonli efir borligiga ishonch hosil qiling.';
      console.warn(msg);
      if (isManual) alert(msg);
      return;
    }

    setUpdatingYtThumb(true);
    try {
      let leagueData = null;
      if (finishedMatchObj.league) {
        // First try searching league belonging to targetOrgId
        const { data: orgLeague } = await supabase
          .from('leagues')
          .select('*')
          .eq('organization_id', targetOrgId)
          .ilike('name', finishedMatchObj.league.trim())
          .maybeSingle();
        
        leagueData = orgLeague;
        if (!leagueData) {
          const { data: fallback } = await supabase
            .from('leagues')
            .select('*')
            .ilike('name', finishedMatchObj.league.trim())
            .maybeSingle();
          leagueData = fallback;
        }
      }
      const { data: orgData } = await supabase.from('organizations').select('*').eq('id', targetOrgId).maybeSingle();
      
      let loadedSponsors = [];
      const { data: spData } = await supabase.from('sponsors').select('*');
      if (spData) {
        loadedSponsors = spData.filter(s => !s.name?.startsWith('YT_OAUTH_TOKENS_') && !s.name?.startsWith('MATCH_TIMER_'));
      }

      const mainSp = loadedSponsors.find(s => s.is_main === true);
      const secondarySps = loadedSponsors.filter(s => s.is_selected === true && !s.is_main);

      // Find background banner image from league, sponsors, org, match, or localStorage
      let rawBannerUrl = leagueData?.yt_banner_url || leagueData?.banner_url || leagueData?.schedule_banner_url || leagueData?.export_bg_url;

      if (!rawBannerUrl && finishedMatchObj.league) {
        const leagueNameTrim = finishedMatchObj.league.trim();
        const sponsorKeys = [
          `BANNER_YT_${targetOrgId}_${leagueNameTrim}`,
          `YT_BANNER_${targetOrgId}_${leagueNameTrim}`,
          `BANNER_YT_${leagueNameTrim}`,
          `YT_BANNER_${leagueNameTrim}`,
          `BANNER_SCHEDULE_${targetOrgId}_${leagueNameTrim}`
        ];

        const { data: bannerRows } = await supabase
          .from('sponsors')
          .select('logo_url, name')
          .in('name', sponsorKeys);

        if (bannerRows && bannerRows.length > 0) {
          const matchRow = bannerRows.find(b => b.logo_url) || bannerRows[0];
          rawBannerUrl = matchRow?.logo_url;
        }
      }

      if (!rawBannerUrl) {
        rawBannerUrl = orgData?.yt_banner_url || orgData?.banner_url || orgData?.background_url;
      }

      if (!rawBannerUrl) {
        rawBannerUrl = finishedMatchObj?.yt_banner_url || finishedMatchObj?.banner_url;
      }

      if (!rawBannerUrl && finishedMatchObj.league) {
        try {
          const localKey = `hfl_yt_banner_${targetOrgId}_${finishedMatchObj.league.trim()}`;
          rawBannerUrl = localStorage.getItem(localKey);
        } catch (e) {}
      }

      // Preload images into Base64 Data URLs for CORS-safe HTML5 Canvas rendering
      const [
        convertedOrgLogo,
        convertedLeagueLogo,
        convertedBanner,
        convertedHomeLogo,
        convertedAwayLogo,
        convertedMainSpLogo
      ] = await Promise.all([
        toDataURL(orgData?.logo_url || '/logo-for-jadval.png'),
        toDataURL(leagueData?.logo_url),
        toDataURL(rawBannerUrl),
        toDataURL(finishedMatchObj.home_team?.logo_url || homeTeam?.logo_url || '/images/default-team.png'),
        toDataURL(finishedMatchObj.away_team?.logo_url || awayTeam?.logo_url || '/images/default-team.png'),
        toDataURL(mainSp?.logo_url)
      ]);

      const convertedSecondarySps = await Promise.all(
        secondarySps.map(async (s) => ({
          ...s,
          logo_url: await toDataURL(s.logo_url)
        }))
      );

      const preparedMatch = {
        ...finishedMatchObj,
        home_team: { ...(finishedMatchObj.home_team || homeTeam), logo_url: convertedHomeLogo },
        away_team: { ...(finishedMatchObj.away_team || awayTeam), logo_url: convertedAwayLogo }
      };

      const preparedLeague = {
        ...(leagueData || {}),
        logo_url: convertedLeagueLogo,
        yt_banner_url: convertedBanner,
        banner_url: convertedBanner
      };

      const preparedOrg = {
        ...(orgData || {}),
        logo_url: convertedOrgLogo,
        yt_banner_url: convertedBanner,
        banner_url: convertedBanner
      };

      const preparedMainSp = mainSp ? {
        ...mainSp,
        logo_url: convertedMainSpLogo
      } : null;

      setYtExportMatch(preparedMatch);
      setYtExportLeague(preparedLeague);
      setYtExportOrg(preparedOrg);
      setYtExportMainSponsor(preparedMainSp);
      setYtExportSecondarySponsors(convertedSecondarySps);

      await new Promise(r => setTimeout(r, 900));

      if (!exportYtRef.current) throw new Error("Oblojka shabloni (Canvas element) topilmadi.");

      const canvas = await html2canvas(exportYtRef.current, {
        scale: 1,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#0b0f19',
        width: 1280,
        height: 720,
        logging: false
      });

      const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.92));
      if (!blob) throw new Error("Oblojka rasmi yaratib bo'lmadi (blob error).");

      const thumbRes = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'image/jpeg'
        },
        body: blob
      });

      const thumbData = await thumbRes.json();

      if (thumbRes.ok && (thumbData.items || thumbData.kind)) {
        console.log('✅ YouTube 16:9 Thumbnail successfully updated:', thumbData);
        alert(`✅ YouTube oblojkasi muvaffaqiyatli yangilandi!\nVideo ID: ${videoId}\nO'yin hisobi: ${finishedMatchObj.home_score || 0} : ${finishedMatchObj.away_score || 0}`);
      } else {
        const errorMsg = thumbData?.error?.message || JSON.stringify(thumbData);
        console.error('YouTube Thumbnail Set API Error:', thumbData);
        alert(`⚠️ YouTube API oblojkani qabul qilmadi:\n${errorMsg}`);
      }
    } catch (err) {
      console.error('Error updating YouTube thumbnail:', err);
      alert(`❌ YouTube oblojkasini yangilashda xatolik:\n${err.message || err}`);
    } finally {
      setUpdatingYtThumb(false);
    }
  };

  const handleManualYtThumbUpdate = async () => {
    if (!match) return;
    await autoUpdateYouTubeThumbnail(match, true);
  };

  const copyObsLink = () => {
    const isField2 = String(match?.location || '').toLowerCase().includes('2');
    const streamId = isField2 ? 'stream2' : 'stream1';
    
    const targetOrgId = match?.organization_id || orgId || 1;
    const universalObsLink = `${window.location.origin}/obs/scoreboard/${streamId}?org_id=${targetOrgId}`;

    navigator.clipboard.writeText(universalObsLink);
    alert(`✅ Universal Stream OBS Linki nusxalandi!\n(${match?.location || '1-Maydon'} • Tashkilot ID: ${targetOrgId})\n\n${universalObsLink}`);
  };

  const copyControlPanelLink = () => {
    const link = `${window.location.origin}/match/${id}`;
    navigator.clipboard.writeText(link);
    alert("Boshqaruv paneli havolasi nusxalandi!\n\n" + link);
  };

  // Helper to apply persistent timer payload in countdown mode (30:00 -> 00:00)
  const applyTimerPayload = (payload) => {
    if (!payload) return;
    const isRunning = !!payload.is_timer_running;
    const startedAt = payload.timer_started_at;
    const halfSec = halfDurationSecs || 1800;
    let baseSec = payload.timer_seconds !== undefined && payload.timer_seconds !== null ? Number(payload.timer_seconds) : halfSec;

    if (baseSec === 0 && (payload.status === 'scheduled' || !isRunning)) {
      baseSec = halfSec;
    }

    setIsTimerRunning(isRunning);
    baseTimerSecondsRef.current = baseSec;
    timerStartedAtRef.current = startedAt || null;

    if (isRunning && startedAt) {
      const startedMs = new Date(startedAt).getTime();
      if (!isNaN(startedMs)) {
        const elapsedSec = Math.max(0, Math.floor((Date.now() - startedMs) / 1000));
        const remaining = Math.max(0, baseSec - elapsedSec);
        setTimerSeconds(remaining);
      } else {
        setTimerSeconds(baseSec);
      }
    } else {
      setTimerSeconds(baseSec);
    }
  };

  // Multi-tier fast broadcast setup (Local BroadcastChannel + Supabase Realtime Broadcast)
  useEffect(() => {
    if (!id) return;
    const streamName = String(match?.location || '').toLowerCase().includes('2') ? 'stream2' : 'stream1';
    let bcMatch = null;
    let bcStream = null;
    try {
      bcMatch = new BroadcastChannel(`amatora_timer_${id}`);
      bcStream = new BroadcastChannel(`amatora_${streamName}_timer`);
    } catch (e) {}

    const fastMatchChannel = supabase.channel(`obs_fast_timer_${id}`).subscribe();
    const fastStreamChannel = supabase.channel(`obs_fast_${streamName}`).subscribe();

    broadcastChannelRef.current = {
      bcMatch,
      bcStream,
      fastMatchChannel,
      fastStreamChannel
    };

    return () => {
      try { if (bcMatch) bcMatch.close(); } catch (e) {}
      try { if (bcStream) bcStream.close(); } catch (e) {}
      supabase.removeChannel(fastMatchChannel);
      supabase.removeChannel(fastStreamChannel);
    };
  }, [id, match?.location]);

  // Helper to update persistent timer state across all devices with zero latency (Non-blocking background DB write)
  const updateTimerDBAndState = (baseSec, startedAtIso, isRunning, newStatus) => {
    setTimerSeconds(baseSec);
    setIsTimerRunning(isRunning);
    baseTimerSecondsRef.current = baseSec;
    timerStartedAtRef.current = startedAtIso;

    const targetId = match?.id || id;
    const targetOrgId = match?.organization_id || orgId || 1;

    const timerPayload = {
      timer_seconds: baseSec,
      timer_started_at: startedAtIso,
      is_timer_running: isRunning,
      status: newStatus || match?.status,
      updated_at: new Date().toISOString()
    };

    // 1. Instant Fast Broadcast across ALL local & cloud channels (0ms latency!)
    try {
      if (broadcastChannelRef.current?.bcMatch) {
        broadcastChannelRef.current.bcMatch.postMessage(timerPayload);
      }
      if (broadcastChannelRef.current?.bcStream) {
        broadcastChannelRef.current.bcStream.postMessage(timerPayload);
      }
    } catch (bcErr) {}

    try {
      if (broadcastChannelRef.current?.fastMatchChannel) {
        broadcastChannelRef.current.fastMatchChannel.send({
          type: 'broadcast',
          event: 'timer_update',
          payload: timerPayload
        });
      }
      if (broadcastChannelRef.current?.fastStreamChannel) {
        broadcastChannelRef.current.fastStreamChannel.send({
          type: 'broadcast',
          event: 'timer_update',
          payload: timerPayload
        });
      }
    } catch (rtErr) {}

    // 2. Non-blocking Background DB Persistence directly to matches table
    (async () => {
      try {
        const matchUpdate = {
          timer_seconds: baseSec,
          timer_started_at: startedAtIso,
          is_timer_running: isRunning,
          updated_at: new Date().toISOString()
        };
        if (newStatus) matchUpdate.status = newStatus;

        const payloadStr = JSON.stringify(timerPayload);
        const nameKey = `MATCH_TIMER_${targetId}`;

        if (targetId) {
          await supabase.from('matches').update(matchUpdate).eq('id', targetId);
        }

        const { data: existingTimer } = await supabase
          .from('sponsors')
          .select('id')
          .eq('name', nameKey)
          .maybeSingle();

        if (existingTimer) {
          await supabase.from('sponsors').update({ logo_url: payloadStr }).eq('id', existingTimer.id);
        } else {
          await supabase.from('sponsors').insert([{ 
            name: nameKey, 
            logo_url: payloadStr, 
            organization_id: targetOrgId, 
            is_main: false 
          }]);
        }
      } catch (e) {
        console.warn('Fast timer sync error:', e);
      }
    })();
  };

  // Realtime Accurate Countdown Timer Interval (30:00 -> 00:00)
  useEffect(() => {
    if (isTimerRunning) {
      timerRef.current = setInterval(() => {
        if (timerStartedAtRef.current) {
          const startedMs = new Date(timerStartedAtRef.current).getTime();
          if (!isNaN(startedMs)) {
            const elapsedSec = Math.max(0, Math.floor((Date.now() - startedMs) / 1000));
            const remaining = Math.max(0, baseTimerSecondsRef.current - elapsedSec);
            setTimerSeconds(remaining);
            if (remaining === 0) {
              setIsTimerRunning(false);
              updateTimerDBAndState(0, null, false);
            }
            return;
          }
        }
        setTimerSeconds(prev => {
          if (prev <= 1) {
            setIsTimerRunning(false);
            updateTimerDBAndState(0, null, false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isTimerRunning]);

  // OBS WebSocket Auto-Connect Effect (Strictly routed per field: 1-maydon vs 2-maydon)
  useEffect(() => {
    if (!match) return;
    const locationKey = String(match?.location || '').toLowerCase().includes('2') ? 'stream2' : 'stream1';
    const defaultPortAddress = locationKey === 'stream2' ? 'ws://localhost:4456' : 'ws://localhost:4455';
    const savedAddress = localStorage.getItem(`obs_address_${locationKey}`) || localStorage.getItem(`obs_address_${locationKey}_${orgId}`) || defaultPortAddress;
    const savedPassword = localStorage.getItem(`obs_password_${locationKey}`) || localStorage.getItem(`obs_password_${locationKey}_${orgId}`) || '';
    
    setObsAddress(savedAddress);
    setObsPassword(savedPassword);

    const unsub = obsService.onStatusChange((connected) => {
      setIsObsConnected(connected);
    });

    const switchFieldConnection = async () => {
      if (obsService.isConnected()) {
        await obsService.disconnect();
      }
      const res = await obsService.connect(savedAddress, savedPassword);
      if (res.success) {
        localStorage.setItem('obs_connected_field', locationKey);
      }
    };

    switchFieldConnection().catch(() => {});

    return () => {
      unsub();
    };
  }, [match?.id, match?.location]);

  const broadcastChannelRef = useRef(null);

  useEffect(() => {
    fetchMatchData();

    // 1. Web BroadcastChannel for 0ms local tab/OBS sync
    let bc = null;
    try {
      bc = new BroadcastChannel(`amatora_timer_${id}`);
    } catch (e) {}

    // 2. Supabase Fast Broadcast Channel
    const fastChannel = supabase.channel(`obs_fast_timer_${id}`);
    fastChannel.subscribe();

    broadcastChannelRef.current = { bc, fastChannel };

    // 3. Supabase Realtime Postgres Subscriptions
    const matchChannel = supabase
      .channel(`match_control_${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_events', filter: `match_id=eq.${id}` }, () => {
        fetchEvents();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${id}` }, (payload) => {
        setMatch(prev => ({ ...prev, ...payload.new }));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sponsors', filter: `name=eq.MATCH_TIMER_${id}` }, (payload) => {
        const record = payload.new || payload.record;
        if (record?.logo_url) {
          try {
            const parsed = JSON.parse(record.logo_url);
            applyTimerPayload(parsed);
          } catch (e) {}
        }
      })
      .subscribe();

    return () => {
      if (bc) bc.close();
      supabase.removeChannel(fastChannel);
      supabase.removeChannel(matchChannel);
    };
  }, [id]);

  const fetchMatchData = async () => {
    setLoading(true);
    try {
      // Fetch match using supabase to bypass RLS for shared control panel links
      const { data: matchData } = await supabase
        .from('matches')
        .select('*')
        .eq('id', id)
        .single();

      if (!matchData) return;
      setMatch(matchData);

      if (matchData.league) {
        try {
          const { data: lData } = await supabase
            .from('leagues')
            .select('*')
            .ilike('name', matchData.league.trim())
            .maybeSingle();
            
          let halfDur = lData?.half_duration || lData?.half_minutes;
          let matchDur = lData?.match_duration;

          if (!halfDur && matchDur) {
            halfDur = Math.round(matchDur / 2);
          } else if (halfDur && !matchDur) {
            matchDur = halfDur * 2;
          }

          if (!matchDur && lData?.id) {
            const { data: spDur } = await supabase
              .from('sponsors')
              .select('logo_url')
              .eq('name', `LEAGUE_DURATION_${lData.id}`)
              .maybeSingle();
            if (spDur?.logo_url) {
              matchDur = Number(spDur.logo_url);
              halfDur = Math.round(matchDur / 2);
            }
          }

          if (!matchDur && lData?.id) {
            const localDur = localStorage.getItem(`hfl_league_duration_${lData.id}`);
            if (localDur) {
              matchDur = Number(localDur);
              halfDur = Math.round(matchDur / 2);
            }
          }

          if (lData) {
            setLeagueData({ 
              ...lData, 
              half_duration: halfDur || 30,
              match_duration: matchDur || ((halfDur || 30) * 2)
            });
          }
        } catch (lErr) {}
      }

      if (matchData.home_penalty_score !== undefined && matchData.away_penalty_score !== undefined) {
        setHomePenalties(matchData.home_penalty_score || 0);
        setAwayPenalties(matchData.away_penalty_score || 0);
      }

      // Fetch teams
      const { data: home } = await supabase.from('teams').select('*').eq('id', matchData.home_team_id).single();
      const { data: away } = await supabase.from('teams').select('*').eq('id', matchData.away_team_id).single();
      setHomeTeam(home);
      setAwayTeam(away);

      // Fetch approved players for each team (excluding archived players)
      const { data: hp } = await supabase
        .from('applications')
        .select('id, first_name, last_name, position, player_number, is_archived')
        .eq('team_id', matchData.home_team_id)
        .eq('status', 'approved');
      
      const { data: ap } = await supabase
        .from('applications')
        .select('id, first_name, last_name, position, player_number, is_archived')
        .eq('team_id', matchData.away_team_id)
        .eq('status', 'approved');

      setHomePlayers((hp || []).filter(p => !p.is_archived));
      setAwayPlayers((ap || []).filter(p => !p.is_archived));

      // Fetch persistent timer state from sponsors or match
      const { data: timerSp } = await supabase
        .from('sponsors')
        .select('logo_url')
        .eq('name', `MATCH_TIMER_${id}`)
        .maybeSingle();

      if (timerSp?.logo_url) {
        try {
          const parsed = JSON.parse(timerSp.logo_url);
          applyTimerPayload(parsed);
        } catch (e) {
          applyTimerPayload(matchData);
        }
      } else {
        applyTimerPayload(matchData);
      }

      // Fetch events
      await fetchEvents(matchData.id);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchEvents = async (matchId) => {
    const { data } = await supabase
      .from('match_events')
      .select('*, player:player_id(first_name, last_name, player_number), team:team_id(name)')
      .eq('match_id', matchId || id)
      .order('minute', { ascending: true });
    
    setEvents(data || []);
  };

  // Dynamic Match Duration calculation from League / Match settings
  const halfDurationMins = Number(match?.half_duration || leagueData?.half_duration || (match?.match_duration ? Math.round(match.match_duration / 2) : (leagueData?.match_duration ? Math.round(leagueData.match_duration / 2) : 30)));
  const matchDurationMins = Number(match?.match_duration || leagueData?.match_duration || (halfDurationMins * 2) || 60);
  const halfDurationSecs = halfDurationMins * 60;

  // Calculate elapsed time (Count-UP: to'g'ri sanash) for Admin Panel Display
  const getElapsedSeconds = () => {
    if (!match || match.status === 'scheduled' || match.status === 'not_started' || match.status === 'pending' || match.status === 'upcoming') {
      return 0;
    }
    if (match.status === 'half_time' || match.status === 'break') {
      return halfDurationSecs;
    }
    if (match.status === 'second_half' || match.status === 'extra_time') {
      const secondHalfElapsed = Math.max(0, halfDurationSecs - timerSeconds);
      return halfDurationSecs + secondHalfElapsed;
    }
    if (match.status === 'finished') {
      return matchDurationMins * 60;
    }
    // first_half / default
    return Math.max(0, halfDurationSecs - timerSeconds);
  };

  // Current calculated match minute (Count-UP: 1' dan 60' gacha)
  const getCurrentMinute = () => {
    const elapsedSec = getElapsedSeconds();
    const currentMin = Math.floor(elapsedSec / 60) + 1;
    return Math.min(matchDurationMins, Math.max(1, currentMin));
  };

  // Format Timer MM:SS (Count-UP display for Admin Panel)
  const formatTimer = (rawSeconds) => {
    const totalSeconds = rawSeconds !== undefined && rawSeconds !== null ? getElapsedSeconds() : getElapsedSeconds();
    const validSec = Math.max(0, Number(totalSeconds) || 0);
    const mins = Math.floor(validSec / 60);
    const secs = validSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleConnectObs = async (e) => {
    if (e) e.preventDefault();
    const locationKey = String(match?.location || '').toLowerCase().includes('2') ? 'stream2' : 'stream1';
    localStorage.setItem(`obs_address_${locationKey}`, obsAddress);
    localStorage.setItem(`obs_password_${locationKey}`, obsPassword);
    localStorage.setItem('obs_websocket_address', obsAddress);
    localStorage.setItem('obs_websocket_password', obsPassword);

    try {
      const res = await obsService.connect(obsAddress, obsPassword);
      if (res.success) {
        setIsObsConnected(true);
        alert(`${match?.location || '1-Maydon'} OBS Studio-ga va paroli muvaffaqiyatli ulandi va saqlandi!`);
        setShowObsModal(false);
      } else {
        setIsObsConnected(false);
        alert(`OBS WebSocket Sozlamalari va paroli saqlandi!\n\n(Eslatma: Hozirda OBS Studio o'chiq yoki ulanmadi: ${res.error || 'Server javob bermadi'})`);
        setShowObsModal(false);
      }
    } catch (err) {
      alert(`OBS WebSocket Sozlamalari saqlandi!`);
      setShowObsModal(false);
    }
  };

  const getOrSyncStingerUrl = async () => {
    if (orgStingerUrl) return orgStingerUrl;
    try {
      const syncedUrl = await ensureAutoStingerSynced({
        supabase,
        orgId: match?.organization_id || currentOrg?.id,
        orgLogo: currentOrg?.logo_url || '/logo-for-jadval.png',
        orgName: currentOrg?.name || match?.league || 'AMATORA'
      });
      if (syncedUrl) {
        setOrgStingerUrl(syncedUrl);
        return syncedUrl;
      }
    } catch (e) {}
    return null;
  };

  const handleManualReplay = async () => {
    const fieldNum = String(match?.location || '').toLowerCase().includes('2') ? 2 : 1;
    const fieldSignalName = `REMOTE_GOAL_FIELD_${fieldNum}`;
    setIsTriggeringReplay(true);

    try {
      const signalPayload = JSON.stringify({
        match_id: id,
        field: fieldNum,
        manual: true,
        timestamp: Date.now()
      });

      const { data: existingSignal } = await supabase
        .from('sponsors')
        .select('id')
        .eq('name', fieldSignalName)
        .maybeSingle();

      if (existingSignal) {
        await supabase.from('sponsors').update({ logo_url: signalPayload }).eq('id', existingSignal.id);
      } else {
        await supabase.from('sponsors').insert({ name: fieldSignalName, logo_url: signalPayload });
      }

      // Also trigger local OBS if connected locally
      if (obsService.isConnected()) {
        const activeStingerUrl = await getOrSyncStingerUrl();
        await obsService.triggerGoalReplay({ stingerUrl: activeStingerUrl });
      }
    } catch (err) {
      console.warn(`Manual Replay signal error:`, err);
    } finally {
      setIsTriggeringReplay(false);
    }
  };

  const toggleTimerManual = () => {
    const newRunning = !isTimerRunning;
    let curRemaining = timerSeconds;
    if (curRemaining <= 0) curRemaining = halfDurationSecs;
    const nowIso = newRunning ? new Date().toISOString() : null;
    updateTimerDBAndState(curRemaining, nowIso, newRunning);
  };

  const adjustTimerSeconds = (deltaSec) => {
    const newSec = Math.max(0, Math.min(halfDurationSecs, timerSeconds + deltaSec));
    const nowIso = isTimerRunning ? new Date().toISOString() : null;
    updateTimerDBAndState(newSec, nowIso, isTimerRunning);
  };

  const resetTimerManual = () => {
    const defaultSec = halfDurationSecs;
    const nowIso = isTimerRunning ? new Date().toISOString() : null;
    updateTimerDBAndState(defaultSec, nowIso, isTimerRunning);
  };

  // Quick Score Adjuster (+1 / -1)
  const adjustScore = async (teamType, delta) => {
    if (!match) return;
    const isHome = teamType === 'home';
    const currentScore = isHome ? (match.home_score || 0) : (match.away_score || 0);
    const newScore = Math.max(0, currentScore + delta);

    const updatePayload = isHome ? { home_score: newScore } : { away_score: newScore };

    setMatch(prev => ({
      ...prev,
      [isHome ? 'home_score' : 'away_score']: newScore
    }));

    await supabase.from('matches').update(updatePayload).eq('id', id);
  };

  // Quick Penalty Score Adjuster (+1 / -1)
  const adjustPenaltyScore = async (teamType, delta) => {
    if (!match) return;
    const isHome = teamType === 'home';
    const currentPen = isHome ? homePenalties : awayPenalties;
    const newPen = Math.max(0, currentPen + delta);

    if (isHome) setHomePenalties(newPen);
    else setAwayPenalties(newPen);

    const updatePayload = isHome ? { home_penalty_score: newPen } : { away_penalty_score: newPen };
    try {
      await supabase.from('matches').update(updatePayload).eq('id', id);
    } catch (e) {}
  };

  const executeStatusChange = (newStatus) => {
    const halfSec = halfDurationSecs || 1500;
    let newBaseSec = timerSeconds;
    let newRunning = isTimerRunning;
    let nowIso = new Date().toISOString();

    if (newStatus === 'first_half') {
      newBaseSec = halfSec;
      newRunning = true;
    } else if (newStatus === 'half_time') {
      newBaseSec = timerSeconds;
      newRunning = false;
      nowIso = null;
    } else if (newStatus === 'second_half') {
      newBaseSec = halfSec;
      newRunning = true;
    } else if (newStatus === 'scheduled') {
      newBaseSec = halfSec;
      newRunning = false;
      nowIso = null;
    }

    const updatedState = {
      status: newStatus,
      timer_seconds: newBaseSec,
      timer_started_at: nowIso,
      is_timer_running: newRunning,
    };

    // 1. Optimistically update local state immediately (0ms instant UI change)
    setMatch(prev => ({ ...prev, ...updatedState }));
    setIsTimerRunning(newRunning);
    setTimerSeconds(newBaseSec);

    // 2. Persist in a single consolidated lightweight call (0 lag!)
    updateTimerDBAndState(newBaseSec, nowIso, newRunning, newStatus);
  };

  const requestStatusUpdate = (newStatus, message) => {
    setConfirmModal({
      isOpen: true,
      message,
      action: async () => {
        try {
          await executeStatusChange(newStatus);
        } catch (err) {
          console.error('Error updating match status:', err);
        } finally {
          setConfirmModal({ isOpen: false, action: null, message: '' });
        }
      }
    });
  };

  const requestFinishMatch = () => {
    setConfirmModal({
      isOpen: true,
      message: "O'yinni yakunlashni tasdiqlaysizmi?",
      action: async () => {
        try {
          const homeGoals = events.filter(e => e.event_type === 'goal' && e.team_id === match.home_team_id).length;
          const awayGoals = events.filter(e => e.event_type === 'goal' && e.team_id === match.away_team_id).length;

          const finalHomeScore = homeGoals > 0 ? homeGoals : (match.home_score || 0);
          const finalAwayScore = awayGoals > 0 ? awayGoals : (match.away_score || 0);

          const finishData = {
            status: 'finished',
            home_score: finalHomeScore,
            away_score: finalAwayScore,
            timer_seconds: timerSeconds,
            timer_started_at: null,
            is_timer_running: false,
          };

          const baseFinishData = {
            status: 'finished',
            home_score: finalHomeScore,
            away_score: finalAwayScore,
            updated_at: new Date().toISOString()
          };

          const targetId = match?.id || id;

          setMatch(prev => ({ 
            ...prev, 
            ...baseFinishData,
            timer_seconds: timerSeconds,
            timer_started_at: null,
            is_timer_running: false,
            home_team: homeTeam,
            away_team: awayTeam
          }));
          setIsTimerRunning(false);

          await updateTimerDBAndState(timerSeconds, null, false, 'finished');

          try {
            await supabase.from('matches').update(baseFinishData).eq('id', targetId);
          } catch (errAdmin) {
            console.warn('Admin finish update error:', errAdmin);
          }

          const updatedMatch = { 
            ...match, 
            ...finishData,
            home_team: homeTeam,
            away_team: awayTeam
          };

          // Broadcast cloud signal to clean C:\Replays folder on field PC
          const fieldNum = String(match?.location || '').toLowerCase().includes('2') ? 2 : 1;
          const finishSignalName = `REMOTE_FINISH_MATCH_FIELD_${fieldNum}`;
          try {
            const signalPayload = JSON.stringify({
              match_id: targetId,
              action: 'finish_match',
              timestamp: Date.now()
            });

            const { data: existingSignal } = await supabase
              .from('sponsors')
              .select('id')
              .eq('name', finishSignalName)
              .maybeSingle();

            if (existingSignal) {
              await supabase.from('sponsors').update({ logo_url: signalPayload }).eq('id', existingSignal.id);
            } else {
              await supabase.from('sponsors').insert({ name: finishSignalName, logo_url: signalPayload });
            }
          } catch (sigErr) {
            console.warn(`[FIELD_${fieldNum}] Finish match signal error:`, sigErr);
          }

          autoUpdateYouTubeThumbnail(updatedMatch);
        } catch (err) {
          console.error('Error finishing match:', err);
        } finally {
          setConfirmModal({ isOpen: false, action: null, message: '' });
        }
      }
    });
  };

  // Open Event Modal directly or pre-filled for a specific player
  const openEventModal = (type, teamId = '', playerId = '') => {
    setEventType(type);
    setSelectedTeamId(teamId || (match?.home_team_id || ''));
    setSelectedPlayerId(playerId || '');
    setEventMinute(getCurrentMinute().toString());
    setSavingEvent(false);
    setShowEventModal(true);
  };

  const handleSaveEvent = async () => {
    if (!selectedTeamId || !selectedPlayerId || !eventMinute || savingEvent) return;

    setSavingEvent(true);
    try {
      const minuteVal = parseInt(eventMinute) || getCurrentMinute();
      const isGoal = eventType === 'goal';

      // Check if there is an existing orphan replay from a recently deleted mistake goal
      const orphanReplay = ORPHAN_REPLAYS_BY_MATCH.get(String(id));
      const isOrphanFresh = orphanReplay && (Date.now() - orphanReplay.timestamp < 10 * 60 * 1000);
      const existingReplayUrl = isGoal && isOrphanFresh ? orphanReplay.url : null;
      if (existingReplayUrl) {
        ORPHAN_REPLAYS_BY_MATCH.delete(String(id));
      }

      const { data: insertedEvents, error } = await supabase.from('match_events').insert([{
        match_id: id,
        team_id: selectedTeamId,
        player_id: selectedPlayerId,
        event_type: eventType,
        minute: minuteVal,
        replay_video_url: existingReplayUrl || null,
      }]).select('*');

      if (!error) {
        if (isGoal) {
          const isHome = selectedTeamId === match.home_team_id;
          const newHomeScore = (match.home_score || 0) + (isHome ? 1 : 0);
          const newAwayScore = (match.away_score || 0) + (isHome ? 0 : 1);
          
          await supabase.from('matches').update({
            home_score: newHomeScore,
            away_score: newAwayScore,
            updated_at: new Date().toISOString(),
          }).eq('id', id);

          setMatch(prev => ({ ...prev, home_score: newHomeScore, away_score: newAwayScore }));
        }

        await fetchEvents();
        setShowEventModal(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingEvent(false);
    }
  };

  const handleDeleteEvent = async (event) => {
    if (!window.confirm("Bu voqeani o'chirishni tasdiqlaysizmi?")) return;

    // 1. Instant optimistic local UI update
    setEvents(prev => prev.filter(e => String(e.id) !== String(event.id)));

    const isGoal = event.event_type === 'goal' || event.type === 'goal';
    const isHome = String(event.team_id) === String(match?.home_team_id);
    let newHomeScore = match?.home_score || 0;
    let newAwayScore = match?.away_score || 0;

    if (isGoal) {
      newHomeScore = Math.max(0, newHomeScore - (isHome ? 1 : 0));
      newAwayScore = Math.max(0, newAwayScore - (isHome ? 0 : 1));
      setMatch(prev => ({ ...prev, home_score: newHomeScore, away_score: newAwayScore }));

      // If this deleted goal had a recorded replay video, preserve it in orphan map so next goal can re-link it
      if (event.replay_video_url) {
        ORPHAN_REPLAYS_BY_MATCH.set(String(id), {
          url: event.replay_video_url,
          timestamp: Date.now(),
        });
      }
    }

    try {
      // 2. Direct delete via supabase
      await supabase.from('match_events').delete().eq('id', event.id);

      if (isGoal) {
        await supabase.from('matches').update({
          home_score: newHomeScore,
          away_score: newAwayScore,
          updated_at: new Date().toISOString()
        }).eq('id', id);
      }
    } catch (err) {
      console.error('Delete event error:', err);
    }
  };

  // Helper to sort team players numerically by jersey number (1, 5, 10, 15...)
  const sortPlayersByNumber = (players) => {
    return [...players].sort((a, b) => {
      const numA = parseInt(a.player_number, 10) || 999;
      const numB = parseInt(b.player_number, 10) || 999;
      if (numA !== numB) return numA - numB;
      return (a.first_name || '').localeCompare(b.first_name || '');
    });
  };

  const sortedHomePlayers = sortPlayersByNumber(homePlayers);
  const sortedAwayPlayers = sortPlayersByNumber(awayPlayers);

  const currentRosterPlayers = activeRosterTeam === 'home' ? sortedHomePlayers : sortedAwayPlayers;
  const currentRosterTeam = activeRosterTeam === 'home' ? homeTeam : awayTeam;
  const currentRosterTeamId = activeRosterTeam === 'home' ? match?.home_team_id : match?.away_team_id;

  const getPlayersForTeam = () => {
    if (selectedTeamId === match?.home_team_id) return sortedHomePlayers;
    if (selectedTeamId === match?.away_team_id) return sortedAwayPlayers;
    return [];
  };

  if (loading) return <div className="match-control" style={{display:'flex',justifyContent:'center',alignItems:'center',height:'100vh'}}>Yuklanmoqda...</div>;
  if (!match) return <div className="match-control">O'yin topilmadi</div>;

  return (
    <div className="match-control">
      {/* Header */}
      <div className="match-control-header">
        <div className="header-top-row">
          <button className="btn-back" onClick={() => navigate('/schedule')}>
            <ArrowLeft size={20} />
          </button>
          
          <div className="match-header-actions">
            {/* OBS Status Indicator Badge */}
            <button 
              className={`obs-action-btn ${isObsConnected ? 'obs-connected' : 'obs-disconnected'}`}
              onClick={() => setShowObsModal(true)}
              style={{ background: isObsConnected ? '#15803d' : '#991b1b', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
              title="OBS WebSocket Sozlamalari"
            >
              {isObsConnected ? <Wifi size={16} /> : <WifiOff size={16} />}
              <span className="btn-text-desktop">{isObsConnected ? 'OBS Ulandi' : 'OBS Sozlash'}</span>
            </button>

            <div className="obs-divider"></div>
            <button className="obs-action-btn obs-text-btn" style={{background: '#475569'}} onClick={copyControlPanelLink} title="Panelni ulashish">
              <Share2 size={16} className="btn-icon-mobile" /> <span className="btn-text-desktop">Boshqaruvni ulashish</span>
            </button>
            <div className="obs-divider"></div>
            <button className="obs-action-btn obs-text-btn" style={{background: '#1e40af'}} onClick={copyObsLink} title="OBS Linkini nusxalash">
              <Monitor size={16} className="btn-icon-mobile" /> <span className="btn-text-desktop">{String(match?.location || '').toLowerCase().includes('2') ? '2-Maydon (OBS)' : '1-Maydon (OBS)'}</span>
            </button>
            <div className="obs-divider"></div>
            <button className="obs-action-btn obs-text-btn" style={{background: '#cc1818'}} onClick={handleManualYtThumbUpdate} disabled={updatingYtThumb} title="YouTube Oblojkasini yangilash">
              <span className="btn-text-desktop">{updatingYtThumb ? '🔄 Oblojka yangilanmoqda...' : '🖼️ YT Oblojkani yangilash'}</span>
            </button>
          </div>
        </div>

        <div className="header-info-subtext">
          {match.league} • {match.location || '1-Maydon'}
        </div>
      </div>

      {/* Main Scoreboard */}
      <div className="scoreboard">
        <div className="scoreboard-teams">
          {/* Home Team */}
          <div className="scoreboard-team">
            <img src={homeTeam?.logo_url || '/images/default-team.png'} alt="" className="scoreboard-team-logo" />
            <span className="scoreboard-team-name">{homeTeam?.name}</span>
            <div className="score-adjuster-group">
              <button className="score-btn minus" onClick={() => adjustScore('home', -1)} title="Golni kamaytirish">-</button>
              <button className="score-btn plus" onClick={() => adjustScore('home', 1)} title="Gol qo'shish">+</button>
            </div>
          </div>

          {/* Main Score & Timer Display */}
          <div className="scoreboard-score-container">
            <div className="scoreboard-score">
              <span className="score-number">{match.home_score || 0}</span>
              <span className="score-separator">:</span>
              <span className="score-number">{match.away_score || 0}</span>
            </div>

            {/* Live Stopwatch Badge */}
            <div className="live-timer-badge">
              <Clock size={16} className={isTimerRunning ? 'timer-icon-pulsing' : ''} />
              <span className="timer-display">{formatTimer(timerSeconds)}</span>
              <span className="timer-minute">({getCurrentMinute()}')</span>
              <span style={{ fontSize: '11px', color: '#60a5fa', background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)', padding: '2px 6px', borderRadius: '6px', marginLeft: '6px', fontWeight: '800' }} title="Liga bo'yicha belgilangan o'yin vaqti">
                ⏱️ {matchDurationMins} daq ({halfDurationMins}x2)
              </span>
              <button 
                className="timer-control-btn"
                onClick={toggleTimerManual}
                title={isTimerRunning ? 'Sekundomerni to\'xtatish' : 'Sekundomerni yurgizish'}
              >
                {isTimerRunning ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <button 
                className="timer-control-btn reset"
                onClick={resetTimerManual}
                title="Taym boshiga qaytarish"
              >
                <RotateCcw size={12} />
              </button>
            </div>

            {/* Penalty Shootout Score Badge if present */}
            {(match.home_penalty_score > 0 || match.away_penalty_score > 0 || showPenaltySection) && (
              <div className="penalty-score-badge">
                <span>Penaltilar:</span>
                <strong>{homePenalties} : {awayPenalties}</strong>
              </div>
            )}
          </div>

          {/* Away Team */}
          <div className="scoreboard-team">
            <img src={awayTeam?.logo_url || '/images/default-team.png'} alt="" className="scoreboard-team-logo" />
            <span className="scoreboard-team-name">{awayTeam?.name}</span>
            <div className="score-adjuster-group">
              <button className="score-btn minus" onClick={() => adjustScore('away', -1)} title="Golni kamaytirish">-</button>
              <button className="score-btn plus" onClick={() => adjustScore('away', 1)} title="Gol qo'shish">+</button>
            </div>
          </div>
        </div>

        <div className="scoreboard-info">
          <span>{match.league}</span>
          <span>•</span>
          <span className={`match-status-badge ${match.status}`}>
            {STATUS_LABELS[match.status] || match.status}
          </span>
        </div>
      </div>

      {/* Match Status Controls */}
      <div className="match-controls">
        {(!match.status || match.status === 'scheduled' || match.status === 'not_started' || match.status === 'pending' || match.status === 'upcoming') && (
          <button className="control-btn start" onClick={() => requestStatusUpdate('first_half', "1-Taymni boshlashni tasdiqlaysizmi?")}>
            <Play size={16} /> 1-Taym Boshlash
          </button>
        )}
        {(match.status === 'first_half' || match.status === 'live' || match.status === 'in_progress') && (
          <button className="control-btn halftime" onClick={() => requestStatusUpdate('half_time', "Tanaffusni boshlashni tasdiqlaysizmi?")}>
            <Pause size={16} /> Tanaffus
          </button>
        )}
        {(match.status === 'half_time' || match.status === 'break') && (
          <button className="control-btn start" onClick={() => requestStatusUpdate('second_half', "2-Taymni boshlashni tasdiqlaysizmi?")}>
            <Play size={16} /> 2-Taym Boshlash
          </button>
        )}
        {(match.status === 'second_half' || match.status === 'extra_time') && (
          <button className="control-btn finish" onClick={requestFinishMatch}>
            🏁 O'yinni Yakunlash
          </button>
        )}
        {match.status === 'finished' && (
          <button className="control-btn reset-status" onClick={() => requestStatusUpdate('scheduled', "O'yinni 1-taym boshlash holatiga qaytarishni tasdiqlaysizmi?")}>
            <RotateCcw size={14} /> 1-Taym Boshlash Holatiga Qaytarish
          </button>
        )}

        <button 
          className="control-btn penalty-toggle"
          onClick={() => setShowPenaltySection(!showPenaltySection)}
        >
          ⚽ Penaltilar seriyasi {showPenaltySection ? '▲' : '▼'}
        </button>
      </div>

      {/* Penalty Shootout Section (If toggled or active) */}
      {showPenaltySection && (
        <div className="penalty-control-section">
          <h3>⚽ Penaltilar Seriyasi Boshqaruvi</h3>
          <div className="penalty-controls-grid">
            <div className="penalty-team-box">
              <span>{homeTeam?.name}</span>
              <div className="penalty-counter">
                <button onClick={() => adjustPenaltyScore('home', -1)}>-</button>
                <strong>{homePenalties}</strong>
                <button onClick={() => adjustPenaltyScore('home', 1)}>+</button>
              </div>
            </div>

            <div className="penalty-vs">vs</div>

            <div className="penalty-team-box">
              <span>{awayTeam?.name}</span>
              <div className="penalty-counter">
                <button onClick={() => adjustPenaltyScore('away', -1)}>-</button>
                <strong>{awayPenalties}</strong>
                <button onClick={() => adjustPenaltyScore('away', 1)}>+</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Single Team Roster Section with Arrow & Tab Switcher (< >) */}
      <div className="single-roster-container">
        {/* Team Switcher Bar */}
        <div className="team-switcher-header">
          <button 
            className="team-switch-arrow"
            onClick={() => setActiveRosterTeam(prev => prev === 'home' ? 'away' : 'home')}
            title="Oldingi jamoaga o'tish"
          >
            <ChevronLeft size={28} />
          </button>

          <div className="team-switch-info">
            <div className="team-tabs">
              <button 
                className={`team-tab-btn ${activeRosterTeam === 'home' ? 'active' : ''}`}
                onClick={() => setActiveRosterTeam('home')}
              >
                <img src={homeTeam?.logo_url || '/images/default-team.png'} alt="" />
                <span>{homeTeam?.name} (Mezbon)</span>
              </button>

              <button 
                className={`team-tab-btn ${activeRosterTeam === 'away' ? 'active' : ''}`}
                onClick={() => setActiveRosterTeam('away')}
              >
                <img src={awayTeam?.logo_url || '/images/default-team.png'} alt="" />
                <span>{awayTeam?.name} (Mehmon)</span>
              </button>
            </div>
          </div>

          <button 
            className="team-switch-arrow"
            onClick={() => setActiveRosterTeam(prev => prev === 'home' ? 'away' : 'home')}
            title="Keyingi jamoaga o'tish"
          >
            <ChevronRight size={28} />
          </button>
        </div>

        {/* Selected Team Roster List */}
        <div className="roster-card single-roster-card">
          <div className="roster-header">
            <img src={currentRosterTeam?.logo_url || '/images/default-team.png'} alt="" />
            <h3>{currentRosterTeam?.name} ({activeRosterTeam === 'home' ? 'Mezbon' : 'Mehmon'})</h3>
            <span className="roster-count">{currentRosterPlayers.length} ta o'yinchi</span>
          </div>

          <div className="roster-list">
            {currentRosterPlayers.length === 0 ? (
              <div className="roster-empty">Tarkib kiritilmagan</div>
            ) : (
              currentRosterPlayers.map(player => (
                <div key={player.id} className="roster-item">
                  <div className={`player-number-badge ${activeRosterTeam === 'away' ? 'away' : ''}`}>
                    #{player.player_number || '-'}
                  </div>
                  <div className="player-name-info">
                    <span className="player-full-name">{player.first_name} {player.last_name}</span>
                    <span className="player-pos">{player.position || 'O\'yinchi'}</span>
                  </div>
                  
                  {/* Quick Action Buttons for Player */}
                  <div className="player-quick-actions">
                    <button onClick={() => openEventModal('goal', currentRosterTeamId, player.id)} title="Gol ⚽">⚽ <span className="quick-btn-label">Gol</span></button>
                    <button onClick={() => openEventModal('assist', currentRosterTeamId, player.id)} title="Assist 👟">👟 <span className="quick-btn-label">Assist</span></button>
                    <button onClick={() => openEventModal('yellow_card', currentRosterTeamId, player.id)} title="Sariq kartochka 🟨">🟨</button>
                    <button onClick={() => openEventModal('red_card', currentRosterTeamId, player.id)} title="Qizil kartochka 🟥">🟥</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Events Timeline */}
      <div className="timeline-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3>O'yin Voqealari</h3>
          <span className="events-count">{events.length} ta voqea</span>
        </div>

        {events.length === 0 ? (
          <div className="timeline-empty">Hali voqealar kiritilmagan</div>
        ) : (
          <div className="timeline">
            {events.map(event => (
              <div key={event.id} className="timeline-item">
                <span className="timeline-minute">{event.minute}'</span>
                <span className="timeline-icon">{EVENT_TYPES[event.event_type]?.icon}</span>
                <div className="timeline-details">
                  <div className="timeline-player">
                    {event.player?.player_number ? `#${event.player.player_number} ` : ''}
                    {event.player?.first_name} {event.player?.last_name}
                  </div>
                  <div className="timeline-team">{event.team?.name}</div>
                </div>
                <button className="timeline-delete" onClick={() => handleDeleteEvent(event)} title="O'chirish">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sticky Bottom Timer Control Bar */}
      <div className="sticky-bottom-timer-bar">
        <div className="sticky-timer-info">
          <Clock size={20} className={isTimerRunning ? 'timer-icon-pulsing' : ''} style={{ color: isTimerRunning ? '#22c55e' : '#f59e0b' }} />
          <span className="sticky-timer-time">{formatTimer(timerSeconds)}</span>
          <span className="sticky-timer-min">({getCurrentMinute()}')</span>
          <span className={`match-status-badge ${match.status}`} style={{ margin: 0, padding: '4px 10px', fontSize: '12px' }}>
            {STATUS_LABELS[match.status] || match.status}
          </span>
          <span className="sticky-timer-duration" style={{ fontSize: '11px', color: '#94a3b8' }}>
            ⏱️ {halfDurationMins} daq x 2 ({matchDurationMins} daq)
          </span>
        </div>

        <div className="sticky-timer-actions">
          <button 
            className="btn-sticky-adjust" 
            onClick={() => adjustTimerSeconds(-60)} 
            title="1 daqiqa kamaytirish"
          >
            -1m
          </button>
          <button 
            className="btn-sticky-adjust" 
            onClick={() => adjustTimerSeconds(60)} 
            title="1 daqiqa qo'shish"
          >
            +1m
          </button>
          
          <button 
            className={`btn-sticky-toggle ${isTimerRunning ? 'pause' : 'play'}`}
            onClick={toggleTimerManual}
            title={isTimerRunning ? "Vaqtni to'xtatish (Pause)" : "Vaqtni davom ettirish (Start)"}
          >
            {isTimerRunning ? (
              <>
                <Pause size={18} /> <span>Vaqtni to'xtatish</span>
              </>
            ) : (
              <>
                <Play size={18} /> <span>Vaqtni davom ettirish</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Event Modal */}
      {showEventModal && (
        <div className="event-modal-overlay" onClick={() => !savingEvent && setShowEventModal(false)}>
          <div className="event-modal" onClick={e => e.stopPropagation()}>
            <h3>{EVENT_TYPES[eventType]?.icon} {EVENT_TYPES[eventType]?.label} qo'shish</h3>
            
            <div className="form-group">
              <label>Jamoa</label>
              <select value={selectedTeamId} onChange={e => { setSelectedTeamId(e.target.value); setSelectedPlayerId(''); }} disabled={savingEvent}>
                <option value="">Jamoani tanlang</option>
                <option value={match.home_team_id}>{homeTeam?.name} (Mezbon)</option>
                <option value={match.away_team_id}>{awayTeam?.name} (Mehmon)</option>
              </select>
            </div>

            <div className="form-group">
              <label>O'yinchi (Raqami bo'yicha tartiblangan)</label>
              <select value={selectedPlayerId} onChange={e => setSelectedPlayerId(e.target.value)} disabled={!selectedTeamId || savingEvent}>
                <option value="">O'yinchini tanlang</option>
                {getPlayersForTeam().map(p => (
                  <option key={p.id} value={p.id}>
                    #{p.player_number || '?'} - {p.first_name} {p.last_name} ({p.position || '-'})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Daqiqa (Joriy daqiqa: {getCurrentMinute()}')</label>
              <input
                type="number"
                min="1"
                max="120"
                placeholder="Daqiqani kiriting"
                value={eventMinute}
                onChange={e => setEventMinute(e.target.value)}
                disabled={savingEvent}
              />
            </div>

            <div className="event-modal-actions">
              <button className="btn-modal-cancel" onClick={() => setShowEventModal(false)} disabled={savingEvent}>Bekor</button>
              <button
                className="btn-modal-save"
                onClick={handleSaveEvent}
                disabled={savingEvent || !selectedTeamId || !selectedPlayerId || !eventMinute}
              >
                {savingEvent ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="btn-spinner">⏳</span> Saqlanmoqda...
                  </span>
                ) : (
                  'Saqlash'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="event-modal-overlay">
          <div className="event-modal confirm-modal">
            <h3>Tasdiqlash</h3>
            <p>{confirmModal.message}</p>
            <div className="event-modal-actions">
              <button className="btn-modal-cancel" onClick={() => setConfirmModal({ isOpen: false, action: null, message: '' })}>Bekor qilish</button>
              <button className="btn-modal-save" style={{background: '#ef4444'}} onClick={confirmModal.action}>Tasdiqlash</button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden 16:9 YouTube Thumbnail Canvas for Auto-updating */}
      <div style={{ position: 'fixed', top: 0, left: 0, opacity: 0, pointerEvents: 'none', zIndex: -9999, width: '1280px', height: '720px', overflow: 'hidden' }}>
        {ytExportMatch && (
          <div ref={exportYtRef} style={{ width: '1280px', height: '720px', backgroundImage: (ytExportLeague?.yt_banner_url || ytExportLeague?.banner_url || ytExportOrg?.yt_banner_url || ytExportOrg?.banner_url) ? `url("${ytExportLeague?.yt_banner_url || ytExportLeague?.banner_url || ytExportOrg?.yt_banner_url || ytExportOrg?.banner_url}")` : 'none', backgroundColor: '#0b0f19', backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative', display: 'flex', flexDirection: 'column', padding: '35px 50px', boxSizing: 'border-box' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <div style={{ width: '280px', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-start' }}>
                <img src={ytExportOrg?.logo_url || '/logo-for-jadval.png'} alt="" crossOrigin="anonymous" style={{ height: '75px', objectFit: 'contain', background: 'transparent' }} />
              </div>
              <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                {ytExportLeague?.logo_url ? (
                  <img src={ytExportLeague.logo_url} alt="" style={{ height: '80px', maxWidth: '320px', objectFit: 'contain', background: 'transparent' }} crossOrigin="anonymous" />
                ) : (
                  <h2 style={{ color: '#fff', fontSize: '30px', fontWeight: '900', textTransform: 'uppercase', margin: 0 }}>{ytExportMatch.league}</h2>
                )}
              </div>
              <div style={{ width: '280px', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                {ytExportMainSponsor?.logo_url && (
                  <img src={ytExportMainSponsor.logo_url} alt="" crossOrigin="anonymous" style={{ height: '65px', objectFit: 'contain', background: 'transparent' }} />
                )}
              </div>
            </div>

            {/* Center Match Banner: Home Team vs Away Team with Final Score */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '60px', flex: 1, margin: '20px 0' }}>
              {/* Home Team */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '320px', textAlign: 'center' }}>
                <div style={{ width: '160px', height: '160px', borderRadius: '50%', background: 'rgba(255, 255, 255, 0.08)', border: '4px solid rgba(0, 255, 102, 0.6)', padding: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 0 35px rgba(0, 255, 102, 0.3)' }}>
                  <img 
                    src={ytExportMatch.home_team?.logo_url || homeTeam?.logo_url || '/images/default-team.png'} 
                    alt="" 
                    crossOrigin="anonymous"
                    style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'contain', background: 'transparent' }} 
                  />
                </div>
                <h2 style={{ color: '#ffffff', fontSize: '28px', fontWeight: '900', textTransform: 'uppercase', marginTop: '16px', marginBottom: '0', letterSpacing: '1px', textShadow: '0 4px 12px rgba(0,0,0,0.8)' }}>
                  {ytExportMatch.home_team?.name || homeTeam?.name}
                </h2>
              </div>

              {/* Final Score Badge */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <div style={{ background: 'linear-gradient(135deg, #00ff66 0%, #00cc52 100%)', color: '#050910', padding: '10px 24px', borderRadius: '16px', fontSize: '38px', fontWeight: '900', fontStyle: 'italic', letterSpacing: '2px', boxShadow: '0 0 25px rgba(0, 255, 102, 0.5)' }}>
                  {`${ytExportMatch.home_score ?? 0} : ${ytExportMatch.away_score ?? 0}`}
                </div>
                {ytExportMatch.round && (
                  <span style={{ color: '#00ff66', fontSize: '22px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '1.5px', marginTop: '4px', textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>
                    {ytExportMatch.round}-TUR
                  </span>
                )}
              </div>

              {/* Away Team */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '320px', textAlign: 'center' }}>
                <div style={{ width: '160px', height: '160px', borderRadius: '50%', background: 'rgba(255, 255, 255, 0.08)', border: '4px solid rgba(0, 255, 102, 0.6)', padding: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 0 35px rgba(0, 255, 102, 0.3)' }}>
                  <img 
                    src={ytExportMatch.away_team?.logo_url || awayTeam?.logo_url || '/images/default-team.png'} 
                    alt="" 
                    crossOrigin="anonymous"
                    style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'contain', background: 'transparent' }} 
                  />
                </div>
                <h2 style={{ color: '#ffffff', fontSize: '28px', fontWeight: '900', textTransform: 'uppercase', marginTop: '16px', marginBottom: '0', letterSpacing: '1px', textShadow: '0 4px 12px rgba(0,0,0,0.8)' }}>
                  {ytExportMatch.away_team?.name || awayTeam?.name}
                </h2>
              </div>
            </div>

            {/* Secondary Sponsors Banner */}
            {ytExportSecondarySponsors.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '25px', marginBottom: '5px' }}>
                {ytExportSecondarySponsors.map((s, idx) => (
                  <React.Fragment key={s.id || idx}>
                    <img src={s.logo_url} alt="" crossOrigin="anonymous" style={{ height: '36px', objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
                    {idx < ytExportSecondarySponsors.length - 1 && (
                      <div style={{ height: '22px', width: '1px', backgroundColor: '#ffffff', opacity: 0.4 }}></div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {/* OBS Settings Modal */}
      {showObsModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '420px' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Video size={24} color="#7c3aed" /> OBS WebSocket Sozlamalari
            </h2>
            <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '15px' }}>
              Admin panel OBS Studio bilan WebSocket 5 (port 4455) orqali ulanadi va 20s gol takrorini efirga beradi.
            </p>
            <form onSubmit={handleConnectObs}>
              <div className="form-group">
                <label>OBS WebSocket Manzili (Address):</label>
                <input
                  type="text"
                  value={obsAddress}
                  onChange={(e) => setObsAddress(e.target.value)}
                  placeholder="ws://localhost:4455"
                  required
                />
              </div>

              <div className="form-group">
                <label>OBS Paroli (Server Password):</label>
                <input
                  type="password"
                  value={obsPassword}
                  onChange={(e) => setObsPassword(e.target.value)}
                  placeholder="Agar bo'sh bo'lsa, qoldiring"
                />
              </div>

              <div style={{ marginTop: '10px', fontSize: '12px', color: '#cbd5e1' }}>
                Holat: <strong style={{ color: isObsConnected ? '#22c55e' : '#ef4444' }}>{isObsConnected ? '🟢 Ulanib turibdi' : '🔴 Ulanmagan'}</strong>
              </div>

              <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const logoUrl = currentOrg?.logo_url || '/logo-for-jadval.png';
                      const text = currentOrg?.name || match?.league || 'AMATORA';
                      const blob = await generateStingerWebM({ logoUrl, text });
                      downloadBlob(blob, `stinger_logo.webm`);
                      alert("Stinger Video (.webm) muvaffaqiyatli yaratildi va yuklab olindi!\n\nEndi OBS Stinger Transition sozlamalaridagi 'Video File' joyiga ushbu stinger_logo.webm faylini tanlab qo'ying.");
                    } catch (err) {
                      alert("Stinger yaratishda xatolik: " + err.message);
                    }
                  }}
                  style={{ width: '100%', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 12px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  🎬 Stinger Video Yaratish (.webm yuklab olish)
                </button>
              </div>

              <div className="modal-actions" style={{ marginTop: '20px' }}>
                <button type="button" className="btn-cancel" onClick={() => setShowObsModal(false)}>Yopish</button>
                <button type="submit" className="btn-save" style={{ background: '#7c3aed' }}>Ulanish</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MatchControl;
