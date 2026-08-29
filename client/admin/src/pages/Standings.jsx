import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useOrg } from '../context/OrgContext';
import { getActiveOrgLeagues, applyOrgAndCollabFilter } from '../utils/leagueUtils';
import { Download, Save, ShieldAlert, Upload, Sparkles, AlertCircle, X, Check, Trophy, Edit, RefreshCw } from 'lucide-react';
import html2canvas from 'html2canvas';
import './Standings.css';

const DEFAULT_LEAGUE_LOGOS = {
  'Super liga': '/super-liga.PNG',
  'Pro liga': '/Pro-liga.PNG',
  '3-liga': '/3-liga.PNG',
  'Europa ligasi': '/europen-liga.PNG',
  'Chempionlar ligasi': '/chemp-liga.PNG',
  '7x7 liga': '/7x7-liga.png'
};

export const isRealSponsor = (s) => {
  if (!s || !s.name) return false;
  const uName = String(s.name).trim().toUpperCase();
  const rawUrl = String(s.logo_url || '').trim();
  const uUrl = rawUrl.toUpperCase();

  // 1. Filter out all system config keys, banners, tokens, timers, remote triggers, overrides
  if (
    uName.startsWith('BANNER_') ||
    uName.startsWith('SCHEDULE_BANNER') ||
    uName.startsWith('YT_BANNER') ||
    uName.startsWith('YT_OAUTH') ||
    uName.startsWith('MATCH_TIMER') ||
    uName.startsWith('REMOTE_') ||
    uName.includes('REMOTE_FINISH') ||
    uName.includes('REMOTE_GOAL') ||
    uName.includes('MATCH_TIMER') ||
    uName.startsWith('LEAGUE_SHOW_SPONSORS') ||
    uName.startsWith('STANDINGS_OVERRIDE') ||
    uName.startsWith('LEAGUE_BG') ||
    uName.startsWith('EXPORT_BG') ||
    uName.startsWith('BG_') ||
    uName.endsWith('_BG') ||
    uName.includes('BACKGROUND') ||
    uUrl.includes('LEAGUE-BACKGROUNDS') ||
    uUrl.includes('LEAGUE_BG') ||
    uUrl.includes('EXPORT_BG') ||
    uUrl.includes('EXPORT-BG')
  ) {
    return false;
  }

  // 2. Must have a valid image URL (not JSON string or boolean)
  if (
    rawUrl.startsWith('{') ||
    rawUrl.startsWith('[') ||
    rawUrl === 'true' ||
    rawUrl === 'false' ||
    (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://') && !rawUrl.startsWith('data:') && !rawUrl.startsWith('blob:'))
  ) {
    return false;
  }

  return true;
};

export default function Standings() {
  const [teams, setTeams] = useState([]);
  const [matches, setMatches] = useState([]);
  const [events, setEvents] = useState([]);
  const [activeLeagues, setActiveLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const { currentOrg, orgId } = useOrg();
  
  const [selectedLeague, setSelectedLeague] = useState('');
  const [selectedRound, setSelectedRound] = useState('');

  const [standings, setStandings] = useState([]);
  const [recentMatches, setRecentMatches] = useState([]);
  const [topScorers, setTopScorers] = useState([]);
  const [topAssists, setTopAssists] = useState([]);
  const [topYellowCards, setTopYellowCards] = useState([]);
  const [topRedCards, setTopRedCards] = useState([]);
  
  const [penalties, setPenalties] = useState({});
  const [standingsOverridesMap, setStandingsOverridesMap] = useState({});
  const [editingTeam, setEditingTeam] = useState(null);
  const [editForm, setEditForm] = useState({ played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 });
  const [savingOverride, setSavingOverride] = useState(false);

  const [savingPenalty, setSavingPenalty] = useState(null);
  const [isExporting, setIsExporting] = useState(false);

  const [mainSponsor, setMainSponsor] = useState(null);
  const [selectedSponsors, setSelectedSponsors] = useState([]);
  const [leagueSponsorsSettingsMap, setLeagueSponsorsSettingsMap] = useState({});

  useEffect(() => {
    fetchSponsorsData();
  }, [orgId]);

  const fetchSponsorsData = async () => {
    try {
      let loadedSponsors = [];
      const dbClient = supabase || supabase;
      if (orgId) {
        const { data: orgSponsors } = await dbClient
          .from('sponsors')
          .select('*')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false });
        if (orgSponsors && orgSponsors.length > 0) {
          loadedSponsors = orgSponsors;
        }
      }

      if (loadedSponsors.length === 0) {
        let query = dbClient.from('sponsors').select('*').order('created_at', { ascending: false });
        if (orgId) {
          query = query.eq('organization_id', orgId);
        }
        const { data } = await query;
        loadedSponsors = data || [];
      }

      const settingsMap = {};
      const overridesMap = {};
      loadedSponsors.forEach(s => {
        if (s.name && s.name.startsWith('LEAGUE_SHOW_SPONSORS_')) {
          const key = s.name.replace('LEAGUE_SHOW_SPONSORS_', '');
          settingsMap[key] = s.logo_url === 'true';
        }
        if (s.name && s.name.startsWith('STANDINGS_OVERRIDE_')) {
          const teamId = s.name.replace('STANDINGS_OVERRIDE_', '');
          try {
            overridesMap[teamId] = JSON.parse(s.logo_url);
          } catch (e) {}
        }
      });
      setLeagueSponsorsSettingsMap(settingsMap);
      setStandingsOverridesMap(overridesMap);

      const realSponsors = loadedSponsors.filter(isRealSponsor);

      const mainFromDb = realSponsors.find(s => s.is_main === true);
      if (mainFromDb) {
        setMainSponsor(mainFromDb);
      }

      const selectedFromDb = realSponsors.filter(s => s.id !== mainFromDb?.id && s.is_selected !== false);
      setSelectedSponsors(selectedFromDb);
    } catch (e) {
      console.error('Error fetching sponsors in Standings:', e);
    }
  };

  const mainSponsorLogo = mainSponsor?.logo_url || '';

  const checkIsShowSponsors = (leagueObj, leagueName) => {
    if (!leagueName && !leagueObj) return true;
    const nameToUse = leagueName || leagueObj?.name;
    const idToUse = leagueObj?.id;

    // 1. Check DB settings map FIRST (synced across devices)
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

  const exportRef = useRef(null);

  useEffect(() => {
    loadLeaguesAndData();
  }, [orgId]);

  const getLeagueBgForOrg = (targetOrgId, leagueName) => {
    try {
      const saved = localStorage.getItem(`hfl_export_bg_${targetOrgId}_${leagueName}`);
      if (saved) return saved;
    } catch (e) {}
    return null;
  };

  const loadLeaguesAndData = async () => {
    const fetched = await getActiveOrgLeagues(orgId);
    const withOrgBgs = fetched.map(l => ({
      ...l,
      export_bg_url: l.export_bg_url || getLeagueBgForOrg(orgId, l.name)
    }));
    setActiveLeagues(withOrgBgs);
    if (withOrgBgs.length > 0) {
      setSelectedLeague(withOrgBgs[0].name);
    }
    fetchData(withOrgBgs);
  };

  const fetchData = async (leaguesList = activeLeagues) => {
    setLoading(true);
    try {
      // Fetch Teams with collab filter
      let teamsQuery = supabase
        .from('teams')
        .select('*')
        .in('status', ['approved', 'partially_approved']);

      teamsQuery = applyOrgAndCollabFilter(teamsQuery, orgId, leaguesList);

      const { data: teamsData, error: teamsError } = await teamsQuery;
      if (teamsError) throw teamsError;
      setTeams(teamsData || []);
      
      // Initialize penalties state
      const initialPenalties = {};
      (teamsData || []).forEach(t => {
        initialPenalties[t.id] = t.penalty_points || 0;
      });
      setPenalties(initialPenalties);

      // Fetch Matches with collab filter
      let matchesQuery = supabase
        .from('matches')
        .select('*')
        .eq('status', 'finished')
        .order('match_date', { ascending: false });

      matchesQuery = applyOrgAndCollabFilter(matchesQuery, orgId, leaguesList);

      const { data: matchesData, error: matchesError } = await matchesQuery;
      if (matchesError) throw matchesError;
      setMatches(matchesData || []);

      // Fetch Events (goals, assists, yellow cards, red cards)
      const { data: eventsData, error: eventsError } = await supabase
        .from('match_events')
        .select('id, event_type, player_id, team_id, match_id, player:player_id(first_name, last_name, photo_url), team:team_id(name, logo_url, league)')
        .in('event_type', ['goal', 'assist', 'yellow_card', 'red_card']);

      if (eventsError) throw eventsError;
      setEvents(eventsData || []);

    } catch (err) {
      console.error("Error fetching standings data:", err);
    } finally {
      setLoading(false);
    }
  };

  // Auto-set selectedRound to max finished round for the SPECIFIC active league
  useEffect(() => {
    if (!selectedLeague || teams.length === 0) return;
    const currentLeagueTeams = teams.filter(t => (t.league || '').includes(selectedLeague));
    const currentLeagueTeamIds = new Set(currentLeagueTeams.map(t => t.id));
    const currentLeagueMatches = matches.filter(m => currentLeagueTeamIds.has(m.home_team_id));

    let maxR = 0;
    currentLeagueMatches.forEach(m => {
      if (m.round && parseInt(m.round) > maxR) maxR = parseInt(m.round);
    });

    const defaultRound = maxR > 0 ? maxR.toString() : '1';
    setSelectedRound(defaultRound);
  }, [selectedLeague, teams, matches]);

  useEffect(() => {
    computeStandings();
  }, [teams, matches, events, selectedLeague, selectedRound, penalties]);

  const computeStandings = () => {
    // Filter teams by selected league
    const filteredTeams = teams.filter(t => (t.league || 'Super liga').includes(selectedLeague));
    const filteredTeamIds = new Set(filteredTeams.map(t => t.id));

    // All finished matches for the selected league (cumulative across ALL rounds)
    const allLeagueMatches = matches.filter(m => filteredTeamIds.has(m.home_team_id));

    // Find max round for the active league
    let maxLeagueRound = 0;
    allLeagueMatches.forEach(m => {
      if (m.round && parseInt(m.round) > maxLeagueRound) maxLeagueRound = parseInt(m.round);
    });

    // Target round for recent matches card display (defaults to max/latest round)
    let targetRound = selectedRound;
    if (!targetRound || targetRound === 'all') {
      targetRound = maxLeagueRound > 0 ? maxLeagueRound.toString() : '1';
    }

    const roundMatches = allLeagueMatches.filter(m => String(m.round) === String(targetRound));

    // Filter events across all league matches
    const filteredEvents = events.filter(e => filteredTeamIds.has(e.team_id));

    // 1. Standings Table - calculates cumulative totals across ALL rounds in the league
    const tableMap = {};
    filteredTeams.forEach(t => {
      tableMap[t.id] = {
        ...t,
        raw_played: 0,
        raw_won: 0,
        raw_drawn: 0,
        raw_lost: 0,
        raw_gf: 0,
        raw_ga: 0,
        raw_pts: 0,
      };
    });

    allLeagueMatches.forEach(m => {
      const hId = m.home_team_id;
      const aId = m.away_team_id;
      const hScore = parseInt(m.home_score || 0);
      const aScore = parseInt(m.away_score || 0);

      if (tableMap[hId]) {
        tableMap[hId].raw_played += 1;
        tableMap[hId].raw_gf += hScore;
        tableMap[hId].raw_ga += aScore;
        if (hScore > aScore) {
          tableMap[hId].raw_won += 1;
          tableMap[hId].raw_pts += 3;
        } else if (hScore === aScore) {
          tableMap[hId].raw_drawn += 1;
          tableMap[hId].raw_pts += 1;
        } else {
          tableMap[hId].raw_lost += 1;
        }
      }

      if (tableMap[aId]) {
        tableMap[aId].raw_played += 1;
        tableMap[aId].raw_gf += aScore;
        tableMap[aId].raw_ga += hScore;
        if (aScore > hScore) {
          tableMap[aId].raw_won += 1;
          tableMap[aId].raw_pts += 3;
        } else if (aScore === hScore) {
          tableMap[aId].raw_drawn += 1;
          tableMap[aId].raw_pts += 1;
        } else {
          tableMap[aId].raw_lost += 1;
        }
      }
    });

    const computedStandings = Object.values(tableMap)
      .filter(t => !t.is_archived)
      .map(t => {
        const ovr = standingsOverridesMap[t.id] || {};
        const played_offset = parseInt(ovr.played_offset || 0);
        const won_offset = parseInt(ovr.won_offset || 0);
        const draw_offset = parseInt(ovr.draw_offset || 0);
        const lost_offset = parseInt(ovr.lost_offset || 0);
        const gf_offset = parseInt(ovr.gf_offset || 0);
        const ga_offset = parseInt(ovr.ga_offset || 0);
        const pts_offset = parseInt(ovr.pts_offset || penalties[t.id] || 0);

        t.played = Math.max(0, t.raw_played + played_offset);
        t.won = Math.max(0, t.raw_won + won_offset);
        t.drawn = Math.max(0, t.raw_drawn + draw_offset);
        t.lost = Math.max(0, t.raw_lost + lost_offset);
        t.gf = Math.max(0, t.raw_gf + gf_offset);
        t.ga = Math.max(0, t.raw_ga + ga_offset);
        t.points = t.raw_pts + pts_offset;
        t.gd = t.gf - t.ga;
        t.offsets = { pts_offset, played_offset, won_offset, draw_offset, lost_offset, gf_offset, ga_offset };
        return t;
      })
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.gd !== a.gd) return b.gd - a.gd;
        if (b.gf !== a.gf) return b.gf - a.gf;
        return b.won - a.won;
      });

    setStandings(computedStandings);
    setRecentMatches(roundMatches.length > 0 ? roundMatches : allLeagueMatches.slice(0, 6));

    // 2. Top Scorers, Assists & Cards - cumulative across ALL rounds
    const playerStats = {};
    filteredEvents.forEach(e => {
      if (!e.player || !e.player_id) return;
      if (!playerStats[e.player_id]) {
        playerStats[e.player_id] = {
          id: e.player_id,
          name: `${e.player.first_name} ${e.player.last_name}`,
          teamId: e.team_id,
          teamLogo: e.team?.logo_url || '',
          playerPhoto: e.player?.photo_url || '',
          goals: 0,
          assists: 0,
          yellowCards: 0,
          redCards: 0,
          matchIds: new Set()
        };
      }
      if (e.match_id) {
        playerStats[e.player_id].matchIds.add(e.match_id);
      }
      if (e.event_type === 'goal') playerStats[e.player_id].goals += 1;
      if (e.event_type === 'assist') playerStats[e.player_id].assists += 1;
      if (e.event_type === 'yellow_card') playerStats[e.player_id].yellowCards += 1;
      if (e.event_type === 'red_card') playerStats[e.player_id].redCards += 1;
    });

    const scorers = Object.values(playerStats)
      .filter(p => p.goals > 0)
      .map(p => ({
        ...p,
        playedMatches: p.matchIds.size > 0 ? p.matchIds.size : (tableMap[p.teamId]?.played || 1)
      }))
      .sort((a, b) => b.goals - a.goals)
      .slice(0, 5);

    const assists = Object.values(playerStats)
      .filter(p => p.assists > 0)
      .map(p => ({
        ...p,
        playedMatches: p.matchIds.size > 0 ? p.matchIds.size : (tableMap[p.teamId]?.played || 1)
      }))
      .sort((a, b) => b.assists - a.assists)
      .slice(0, 5);

    const yellowCardsList = Object.values(playerStats)
      .filter(p => p.yellowCards > 0)
      .map(p => ({
        ...p,
        playedMatches: p.matchIds.size > 0 ? p.matchIds.size : (tableMap[p.teamId]?.played || 1)
      }))
      .sort((a, b) => b.yellowCards - a.yellowCards)
      .slice(0, 8);

    const redCardsList = Object.values(playerStats)
      .filter(p => p.redCards > 0)
      .map(p => ({
        ...p,
        playedMatches: p.matchIds.size > 0 ? p.matchIds.size : (tableMap[p.teamId]?.played || 1)
      }))
      .sort((a, b) => b.redCards - a.redCards)
      .slice(0, 8);

    setTopScorers(scorers);
    setTopAssists(assists);
    setTopYellowCards(yellowCardsList);
    setTopRedCards(redCardsList);
  };

  const handleOpenEditModal = (team) => {
    setEditingTeam(team);
    setEditForm({
      played: team.played ?? team.raw_played ?? 0,
      won: team.won ?? team.raw_won ?? 0,
      drawn: team.drawn ?? team.raw_drawn ?? 0,
      lost: team.lost ?? team.raw_lost ?? 0,
      gf: team.gf ?? team.raw_gf ?? 0,
      ga: team.ga ?? team.raw_ga ?? 0,
      points: team.points ?? team.raw_pts ?? 0,
    });
  };

  const handleSaveOverride = async () => {
    if (!editingTeam || savingOverride) return;
    setSavingOverride(true);
    try {
      const dbClient = supabase || supabase;
      const teamId = editingTeam.id;

      // Offsets relative to raw match calculations
      const raw_played = editingTeam.raw_played || 0;
      const raw_won = editingTeam.raw_won || 0;
      const raw_drawn = editingTeam.raw_drawn || 0;
      const raw_lost = editingTeam.raw_lost || 0;
      const raw_gf = editingTeam.raw_gf || 0;
      const raw_ga = editingTeam.raw_ga || 0;
      const raw_pts = editingTeam.raw_pts || 0;

      const played_offset = (parseInt(editForm.played) || 0) - raw_played;
      const won_offset = (parseInt(editForm.won) || 0) - raw_won;
      const draw_offset = (parseInt(editForm.drawn) || 0) - raw_drawn;
      const lost_offset = (parseInt(editForm.lost) || 0) - raw_lost;
      const gf_offset = (parseInt(editForm.gf) || 0) - raw_gf;
      const ga_offset = (parseInt(editForm.ga) || 0) - raw_ga;
      const pts_offset = (parseInt(editForm.points) || 0) - raw_pts;

      const overridePayload = {
        played_offset,
        won_offset,
        draw_offset,
        lost_offset,
        gf_offset,
        ga_offset,
        pts_offset
      };

      const key = `STANDINGS_OVERRIDE_${teamId}`;
      const jsonStr = JSON.stringify(overridePayload);

      // Check if entry exists in sponsors table
      const { data: existing } = await dbClient
        .from('sponsors')
        .select('id')
        .eq('name', key)
        .maybeSingle();

      if (existing?.id) {
        await dbClient.from('sponsors').update({ logo_url: jsonStr }).eq('id', existing.id);
      } else {
        await dbClient.from('sponsors').insert([{
          name: key,
          logo_url: jsonStr,
          organization_id: orgId || null,
          is_main: false
        }]);
      }

      // Also update penalty_points in teams for backward compatibility
      try {
        await dbClient.from('teams').update({ penalty_points: pts_offset }).eq('id', teamId);
      } catch (e) {}

      // Update local state
      setStandingsOverridesMap(prev => ({
        ...prev,
        [teamId]: overridePayload
      }));

      setPenalties(prev => ({
        ...prev,
        [teamId]: pts_offset
      }));

      alert("Jamoa ko'rsatkichlari muvaffaqiyatli saqlandi! Keyingi o'yinlar ushbu bazadan hisoblanadi. ⚽");
      setEditingTeam(null);
    } catch (e) {
      console.error('Error saving standings override:', e);
      alert("Natijalarni saqlashda xatolik yuz berdi!");
    } finally {
      setSavingOverride(false);
    }
  };

  const handleExportWithCheck = () => {
    executeExport();
  };

  const executeExport = async () => {
    if (!exportRef.current || isExporting) return;
    setIsExporting(true);
    try {
      const canvas = await html2canvas(exportRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: null
      });
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `turnir_jadvali_${selectedLeague}_${selectedRound}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Export error:", err);
      alert("Rasmni yuklab olishda xatolik yuz berdi.");
    } finally {
      setIsExporting(false);
    }
  };

  // Get dynamic rounds specifically for the active selected league
  const activeLeagueTeams = teams.filter(t => (t.league || '').includes(selectedLeague));
  const activeLeagueTeamIds = new Set(activeLeagueTeams.map(t => t.id));
  const activeLeagueMatches = matches.filter(m => activeLeagueTeamIds.has(m.home_team_id));

  let maxRound = 0;
  activeLeagueMatches.forEach(m => {
    if (m.round && parseInt(m.round) > maxRound) maxRound = parseInt(m.round);
  });
  if (maxRound === 0) maxRound = 1;

  const roundOptions = [];
  for (let i = 1; i <= maxRound; i++) roundOptions.push(i);

  const displayRound = (selectedRound && selectedRound !== 'all') ? selectedRound : (maxRound > 0 ? maxRound.toString() : '1');

  // Background theme mapping for export
  let exportThemeClass = 'theme-export-Super';
  if (selectedLeague.includes('Pro')) exportThemeClass = 'theme-export-Pro';
  else if (selectedLeague.includes('3-liga') || selectedLeague.includes('3 liga')) exportThemeClass = 'theme-export-3-liga';
  else if (selectedLeague.includes('Europa')) exportThemeClass = 'theme-export-Europa';
  else if (selectedLeague.includes('Chempion')) exportThemeClass = 'theme-export-Chempion';
  else if (selectedLeague.includes('7x7')) exportThemeClass = 'theme-export-7x7';

  const currentLeagueObj = activeLeagues.find(l => String(l.name || '').trim().toLowerCase() === String(selectedLeague || '').trim().toLowerCase()) || activeLeagues.find(l => l.name === selectedLeague);
  const currentLeagueBg = currentLeagueObj?.export_bg_url || getLeagueBgForOrg(orgId, selectedLeague);

  if (loading) {
    return (
      <div className="standings-page">
        <div className="standings-header">
          <div className="skeleton-pulse skeleton-title"></div>
          <div className="standings-header-actions" style={{ display: 'flex', gap: '10px' }}>
            <div className="skeleton-pulse skeleton-btn"></div>
            <div className="skeleton-pulse skeleton-btn"></div>
            <div className="skeleton-pulse skeleton-btn"></div>
          </div>
        </div>

        <div className="skeleton-pulse skeleton-filter-box" style={{ marginBottom: '24px' }}></div>

        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Jamoa</th>
                <th>O'yin</th>
                <th>Farq</th>
                <th>Ochko</th>
                <th>Jarima / Bonus (Ochko)</th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5, 6, 7, 8].map(idx => (
                <tr key={idx}>
                  <td><div className="skeleton-pulse skeleton-circle"></div></td>
                  <td>
                    <div className="team-info" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div className="skeleton-pulse skeleton-circle"></div>
                      <div className="skeleton-pulse skeleton-text" style={{ width: '120px' }}></div>
                    </div>
                  </td>
                  <td><div className="skeleton-pulse skeleton-text" style={{ width: '30px' }}></div></td>
                  <td><div className="skeleton-pulse skeleton-text" style={{ width: '30px' }}></div></td>
                  <td><div className="skeleton-pulse skeleton-text" style={{ width: '30px' }}></div></td>
                  <td><div className="skeleton-pulse skeleton-text" style={{ width: '100px' }}></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="standings-page">
      <div className="standings-header">
        <div className="standings-title-box">
          <Trophy size={26} className="standings-title-icon" />
          <h1>Turnir Jadvali va Export</h1>
        </div>
      </div>

      {/* 1x1 Poster Preview Box & Action Buttons below it (matches Schedule / O'yinlar page design) */}
      <div className="schedule-filter-banner-card">
        <div className="filter-header-bar">
          <div className="filter-title-group">
            <Trophy size={18} className="filter-icon" />
            <span>Eksport va Fon Rasmi Boshqaruvi ({selectedLeague})</span>
          </div>
        </div>

        <div className="filter-expanded-content" style={{ marginTop: '16px' }}>
          <div className="filter-row">
            <div className="filter-field">
              <label>Liga tanlang</label>
              <div className="custom-select-wrapper">
                <select value={selectedLeague} onChange={(e) => setSelectedLeague(e.target.value)}>
                  {activeLeagues.map(l => (
                    <option key={l.id} value={l.name}>{l.name} {l.isCollab ? '(Co-Host)' : ''}</option>
                  ))}
                  {activeLeagues.length === 0 && <option value="">Hali ligalar yo'q</option>}
                </select>
              </div>
            </div>
            <div className="filter-field">
              <label>Tur</label>
              <div className="custom-select-wrapper">
                <select value={selectedRound} onChange={(e) => setSelectedRound(e.target.value)}>
                  <option value="all">Barchasi (Umumiy)</option>
                  {roundOptions.map(r => <option key={r} value={r}>{r}-tur</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* 1x1 Poster Image Box & Buttons */}
        <div className="poster-banner-section" style={{ justifyContent: 'flex-start' }}>
          <div style={{ display: 'flex', gap: '12px', width: '100%', flexWrap: 'wrap' }}>
            <button className="btn-download" onClick={() => handleExportWithCheck('standings')} disabled={isExporting} style={{ flex: 1, minWidth: '180px' }}>
              <Download size={18} /> <span>{isExporting ? 'Yuklanmoqda...' : 'Jadvalni yuklab olish'}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="admin-table-container">
        <table className="admin-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Jamoa</th>
              <th>O'yin</th>
              <th>G'alaba</th>
              <th>Durang</th>
              <th>Mag'lubiyat</th>
              <th>UG</th>
              <th>OG</th>
              <th>Farq</th>
              <th>Ochko</th>
              <th>Tahrirlash</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((t, i) => (
              <tr key={t.id}>
                <td>
                  <span className={`rank-badge rank-${i + 1}`}>
                    {i + 1}
                  </span>
                </td>
                <td>
                  <div className="team-info">
                    <img src={t.logo_url} alt="" onError={(e) => { e.target.onerror = null; e.target.src = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30'%3E%3Crect width='30' height='30' fill='%23ccc' rx='15'/%3E%3C/svg%3E"; }} />
                    {t.name}
                  </div>
                </td>
                <td>{t.played}</td>
                <td>{t.won}</td>
                <td>{t.drawn}</td>
                <td>{t.lost}</td>
                <td>{t.gf}</td>
                <td>{t.ga}</td>
                <td>{t.gd > 0 ? `+${t.gd}` : t.gd}</td>
                <td><strong>{t.points}</strong></td>
                <td>
                  <button 
                    style={{
                      padding: '6px 12px',
                      borderRadius: '8px',
                      background: 'rgba(59, 130, 246, 0.15)',
                      border: '1px solid #3b82f6',
                      color: '#60a5fa',
                      fontWeight: '700',
                      fontSize: '12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.2s ease',
                    }}
                    onClick={() => handleOpenEditModal(t)}
                    title="Jamoa o'yinlari va gollar farqini tahrirlash"
                  >
                    <Edit size={14} /> Tahrirlash
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* STANDINGS EDIT OVERRIDE MODAL */}
      {editingTeam && (
        <div className="logout-modal-overlay" style={{ background: 'rgba(0, 0, 0, 0.75)', zIndex: 9999 }}>
          <div className="logout-modal" style={{ maxWidth: '520px', width: '92%', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <img src={editingTeam.logo_url} alt="" style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} />
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#ffffff' }}>
                  {editingTeam.name} — Natijalarni Tahrirlash
                </h3>
              </div>
              <button onClick={() => setEditingTeam(null)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: '12.5px', color: '#94a3b8', marginBottom: '20px', lineHeight: '1.5' }}>
              ℹ️ Bu yerda kiritilgan ko'rsatkichlar jamoa uchun bazaviy natija hisoblanadi. 
              <strong> Keyingi bo'lib o'tadigan o'yinlar natijasi ushbu tahrirlangan raqamlarning ustiga avtomatik qo'shiladi!</strong>
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '4px', fontWeight: '700' }}>O'ynagan o'yini (P)</label>
                <input
                  type="number"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '14px' }}
                  value={editForm.played}
                  onChange={(e) => setEditForm({ ...editForm, played: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '4px', fontWeight: '700' }}>Ochko (PTS)</label>
                <input
                  type="number"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: '#0f172a', border: '1px solid #3b82f6', color: '#60a5fa', fontSize: '14px', fontWeight: '800' }}
                  value={editForm.points}
                  onChange={(e) => setEditForm({ ...editForm, points: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '4px', fontWeight: '700' }}>G'alaba (W)</label>
                <input
                  type="number"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '14px' }}
                  value={editForm.won}
                  onChange={(e) => setEditForm({ ...editForm, won: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '4px', fontWeight: '700' }}>Durang (D)</label>
                <input
                  type="number"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '14px' }}
                  value={editForm.drawn}
                  onChange={(e) => setEditForm({ ...editForm, drawn: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '4px', fontWeight: '700' }}>Mag'lubiyat (L)</label>
                <input
                  type="number"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '14px' }}
                  value={editForm.lost}
                  onChange={(e) => setEditForm({ ...editForm, lost: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '4px', fontWeight: '700' }}>Urgan Goli (GF)</label>
                <input
                  type="number"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '14px' }}
                  value={editForm.gf}
                  onChange={(e) => setEditForm({ ...editForm, gf: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '4px', fontWeight: '700' }}>O'tkazgan Goli (GA)</label>
                <input
                  type="number"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '14px' }}
                  value={editForm.ga}
                  onChange={(e) => setEditForm({ ...editForm, ga: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '4px', fontWeight: '700' }}>Gollar Farqi (GD)</label>
                <div style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#f59e0b', fontSize: '14px', fontWeight: '800' }}>
                  {(parseInt(editForm.gf || 0) - parseInt(editForm.ga || 0)) > 0 ? `+${parseInt(editForm.gf || 0) - parseInt(editForm.ga || 0)}` : (parseInt(editForm.gf || 0) - parseInt(editForm.ga || 0))}
                </div>
              </div>
            </div>

            <div className="logout-modal-actions">
              <button className="btn-cancel" onClick={() => setEditingTeam(null)}>Bekor qilish</button>
              <button className="btn-confirm" onClick={handleSaveOverride} disabled={savingOverride} style={{ background: '#3b82f6' }}>
                {savingOverride ? 'Saqlanmoqda...' : 'Saqlash va Hisoblash'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HIDDEN EXPORT TEMPLATE */}
      <div style={{ position: 'fixed', left: '-9999px', top: 0, opacity: 1, pointerEvents: 'none', zIndex: -100 }}>
        {(() => {
          const currentLeagueObj = activeLeagues.find(l => String(l.name || '').trim().toLowerCase() === String(selectedLeague || '').trim().toLowerCase()) || activeLeagues.find(l => l.name === selectedLeague);
          const isCollab = currentLeagueObj?.isCollab;

          const teamCount = standings.length;
          let rowPadding = '10px 14px';
          let fontSize = '21px';
          let logoSize = '38px';
          let headerPadding = '12px 16px';
          let headerFontSize = '19px';

          if (teamCount > 18) {
            rowPadding = '4px 8px';
            fontSize = '14.5px';
            logoSize = '24px';
            headerPadding = '6px 10px';
            headerFontSize = '15px';
          } else if (teamCount > 14) {
            rowPadding = '6px 10px';
            fontSize = '16.5px';
            logoSize = '30px';
            headerPadding = '8px 12px';
            headerFontSize = '16.5px';
          } else if (teamCount > 11) {
            rowPadding = '8px 12px';
            fontSize = '18.5px';
            logoSize = '34px';
            headerPadding = '10px 14px';
            headerFontSize = '18px';
          }

          return (
            <div 
              ref={exportRef} 
              className={`export-wrapper ${exportThemeClass}`}
              style={currentLeagueObj?.export_bg_url ? {
                backgroundImage: `linear-gradient(rgba(10, 13, 18, 0.75), rgba(10, 13, 18, 0.88)), url(${currentLeagueObj.export_bg_url})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat'
              } : {}}
            >
              <div className="export-container">
                
                {/* Header */}
                <div className="export-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', width: '100%' }}>
                  <div className="export-logo-left" style={{ width: '250px', minWidth: '250px', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '10px', justifyContent: 'flex-start' }}>
                    {isCollab ? (
                      <>
                        <img src={currentLeagueObj.org1?.logo_url || '/logo-for-jadval.png'} alt="Org 1" crossOrigin="anonymous" style={{ height: '85px', objectFit: 'contain', background: 'transparent' }} />
                        <img src="/x.png" crossOrigin="anonymous" style={{ height: '16px', objectFit: 'contain', opacity: 0.7, background: 'transparent' }} />
                        <img src={currentLeagueObj.org2?.logo_url || '/llf-logo.png'} alt="Org 2" crossOrigin="anonymous" style={{ height: '75px', objectFit: 'contain', background: 'transparent' }} />
                      </>
                    ) : (
                      <img src={currentOrg?.logo_url || '/logo-for-jadval.png'} alt={currentOrg?.name || 'HFL'} crossOrigin="anonymous" style={{ height: '90px', objectFit: 'contain', background: 'transparent' }} />
                    )}
                  </div>

                  <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                    {currentLeagueObj?.logo_url ? (
                      <img src={currentLeagueObj.logo_url} alt={selectedLeague} style={{ maxHeight: '95px', maxWidth: '380px', width: 'auto', height: 'auto', objectFit: 'contain', background: 'transparent', border: 'none', display: 'block', margin: '0 auto' }} crossOrigin="anonymous" />
                    ) : (
                      <h2 style={{ color: '#fff', fontSize: '36px', fontWeight: '900', textTransform: 'uppercase', margin: 0 }}>{selectedLeague}</h2>
                    )}
                  </div>

                  <div className="export-logo-right" style={{ width: '250px', minWidth: '250px', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                    {mainSponsorLogo ? (
                      <img src={mainSponsorLogo} alt="Bosh Homiy" crossOrigin="anonymous" style={{ maxHeight: '85px', maxWidth: '240px', width: 'auto', height: 'auto', objectFit: 'contain', background: 'transparent', margin: '0 0 0 auto', display: 'block' }} />
                    ) : null}
                  </div>
                </div>

                <div className="export-main-content">
                  {/* Body */}
                  <div className="export-body">
                    
                    {/* Left Col: Standings Table */}
                    <div className="export-table-container">
                      <div className="export-table-header" style={{ padding: headerPadding, fontSize: headerFontSize }}>
                        <div className="export-col-hash">#</div>
                        <div className="export-col-team">JAMOA</div>
                        <div className="export-col-stat">O'</div>
                        <div className="export-col-stat">T/N</div>
                        <div className="export-col-stat">O</div>
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        {standings.map((t, idx) => (
                          <div className="export-table-row" key={t.id} style={{ padding: rowPadding, fontSize: fontSize }}>
                            <div className="export-col-hash">{idx + 1}</div>
                            <div className="export-col-team" style={{display: 'flex', alignItems: 'center'}}>
                              <img src={t.logo_url} className="team-img" alt="" crossOrigin="anonymous" style={{ width: logoSize, height: logoSize, borderRadius: '50%', marginRight: '10px', objectFit: 'cover' }} onError={(e) => { e.target.onerror = null; e.target.src = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30'%3E%3Crect width='30' height='30' fill='%23ccc' rx='15'/%3E%3C/svg%3E"; }} />
                              <span style={{textTransform: 'uppercase', fontWeight: '900', letterSpacing: '0.3px'}}>{t.name}</span>
                            </div>
                            <div className="export-col-stat">{t.played}</div>
                            <div className="export-col-stat">{t.gd}</div>
                            <div className="export-col-stat">{t.points}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Right Col: Results, Top Scorers, Assists */}
                    <div className="export-right-col">
                      
                      {/* Results */}
                      <div className="export-card" style={{ flex: recentMatches.length > 4 ? 1.15 : 1 }}>
                        <div className="export-card-title">{displayRound}-TUR NATIJALARI</div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '4px 8px' }}>
                          {recentMatches.length === 0 ? (
                            <div style={{ textAlign: 'center', opacity: 0.6, fontSize: '13.5px', fontWeight: '600', padding: '16px 0', textTransform: 'uppercase' }}>NATIJALAR KIRITILMAGAN</div>
                          ) : (() => {
                            const matchCount = recentMatches.length;
                            let resultRowPadding = '4px 6px';
                            let resultFontSize = '13.5px';
                            let resultLogoSize = '24px';
                            let resultScoreFontSize = '16px';

                            if (matchCount > 6) {
                              resultRowPadding = '2px 4px';
                              resultFontSize = '12px';
                              resultLogoSize = '20px';
                              resultScoreFontSize = '14.5px';
                            } else if (matchCount <= 4) {
                              resultRowPadding = '6px 8px';
                              resultFontSize = '14.5px';
                              resultLogoSize = '26px';
                              resultScoreFontSize = '17px';
                            }

                            return recentMatches.map(m => {
                              const hTeam = teams.find(t => t.id === m.home_team_id);
                              const aTeam = teams.find(t => t.id === m.away_team_id);
                              if(!hTeam || !aTeam) return null;
                              return (
                                <div className="export-result-row" key={m.id} style={{ padding: resultRowPadding }}>
                                  <div className="export-result-team">
                                    <img src={hTeam.logo_url} alt="" crossOrigin="anonymous" style={{ width: resultLogoSize, height: resultLogoSize, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} onError={(e) => { e.target.onerror = null; e.target.src = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30'%3E%3Crect width='30' height='30' fill='%23ccc' rx='15'/%3E%3C/svg%3E"; }} />
                                    <span style={{textTransform:'uppercase', fontSize: resultFontSize, fontWeight: '800', wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'normal'}}>{hTeam.name}</span>
                                  </div>
                                  <div className="export-result-score" style={{ fontSize: resultScoreFontSize, padding: '0 4px', flexShrink: 0 }}>{m.home_score}-{m.away_score}</div>
                                  <div className="export-result-team away">
                                    <img src={aTeam.logo_url} alt="" crossOrigin="anonymous" style={{ width: resultLogoSize, height: resultLogoSize, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} onError={(e) => { e.target.onerror = null; e.target.src = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30'%3E%3Crect width='30' height='30' fill='%23ccc' rx='15'/%3E%3C/svg%3E"; }} />
                                    <span style={{textTransform:'uppercase', fontSize: resultFontSize, fontWeight: '800', wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'normal'}}>{aTeam.name}</span>
                                  </div>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>

                      {/* Top Scorers */}
                      <div className="export-card" style={{ flex: 1 }}>
                        <div className="export-card-title">TO'PURARLAR <span style={{float:'right', fontSize:'15px'}}>O'   G</span></div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                          {topScorers.length === 0 ? (
                            <div style={{ textAlign: 'center', opacity: 0.6, fontSize: '13.5px', fontWeight: '600', padding: '16px 0', textTransform: 'uppercase' }}>TO'PURARLAR MAVJUD EMAS</div>
                          ) : (
                            topScorers.slice(0, 3).map(p => (
                              <div className="export-stats-row" key={p.id}>
                                <img 
                                  src={p.playerPhoto || p.teamLogo || "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30'%3E%3Crect width='30' height='30' fill='%23ccc' rx='15'/%3E%3C/svg%3E"} 
                                  className="stat-img" 
                                  alt="" 
                                  crossOrigin="anonymous" 
                                  onError={(e) => { 
                                    e.target.onerror = null; 
                                    e.target.src = p.teamLogo || "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30'%3E%3Crect width='30' height='30' fill='%23ccc' rx='15'/%3E%3C/svg%3E"; 
                                  }} 
                                />
                                <div style={{flex: 1, textTransform: 'uppercase', fontSize: '15.5px', fontWeight: '800', wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'normal'}}>{p.name}</div>
                                <div style={{width: '30px', textAlign: 'center', fontSize: '16px', fontWeight: '800'}}>{p.playedMatches || 1}</div>
                                <div style={{width: '30px', textAlign: 'center', fontWeight: '900', fontSize: '17.5px'}}>{p.goals}</div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Top Assists */}
                      <div className="export-card" style={{ flex: 1 }}>
                        <div className="export-card-title">ASSISTENTLAR <span style={{float:'right', fontSize:'15px'}}>O'   A</span></div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                          {topAssists.length === 0 ? (
                            <div style={{ textAlign: 'center', opacity: 0.6, fontSize: '13.5px', fontWeight: '600', padding: '16px 0', textTransform: 'uppercase' }}>ASSISTENTLAR MAVJUD EMAS</div>
                          ) : (
                            topAssists.slice(0, 3).map(p => (
                              <div className="export-stats-row" key={p.id}>
                                <img 
                                  src={p.playerPhoto || p.teamLogo || "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30'%3E%3Crect width='30' height='30' fill='%23ccc' rx='15'/%3E%3C/svg%3E"} 
                                  className="stat-img" 
                                  alt="" 
                                  crossOrigin="anonymous" 
                                  onError={(e) => { 
                                    e.target.onerror = null; 
                                    e.target.src = p.teamLogo || "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30'%3E%3Crect width='30' height='30' fill='%23ccc' rx='15'/%3E%3C/svg%3E"; 
                                  }} 
                                />
                                <div style={{flex: 1, textTransform: 'uppercase', fontSize: '15.5px', fontWeight: '800', wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'normal'}}>{p.name}</div>
                                <div style={{width: '30px', textAlign: 'center', fontSize: '16px', fontWeight: '800'}}>{p.playedMatches || 1}</div>
                                <div style={{width: '30px', textAlign: 'center', fontWeight: '900', fontSize: '17.5px'}}>{p.assists}</div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                    </div>
                  </div>
                </div>

                {/* Footer Group (Secondary Sponsors) */}
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: '20px' }}>
                  {(() => {
                    const currentLeagueObj = activeLeagues.find(l => String(l.name || '').trim().toLowerCase() === String(selectedLeague || '').trim().toLowerCase()) || activeLeagues.find(l => l.name === selectedLeague);
                    const isShowSponsors = checkIsShowSponsors(currentLeagueObj, selectedLeague);
                    if (!isShowSponsors) return null;
                    const secondarySponsors = selectedSponsors.filter(s => s.id !== mainSponsor?.id);
                    if (secondarySponsors.length === 0) return null;
                    return (
                      <div style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', boxSizing: 'border-box' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '36px' }}>
                          {secondarySponsors.map((s, idx) => (
                            <React.Fragment key={s.id || idx}>
                              <img src={s.logo_url} alt={s.name} crossOrigin="anonymous" style={{ height: '44px', maxWidth: '140px', objectFit: 'contain', filter: 'grayscale(100%) brightness(1.2)', opacity: 0.85 }} />
                              {idx < secondarySponsors.length - 1 && (
                                <div style={{ height: '24px', width: '1.5px', backgroundColor: '#ffffff', opacity: 0.4 }}></div>
                              )}
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>

              </div>
            </div>
          );
        })()}
      </div>

    </div>
  );
}
