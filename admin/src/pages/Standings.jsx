import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useOrg } from '../context/OrgContext';
import { getActiveOrgLeagues, applyOrgAndCollabFilter } from '../utils/leagueUtils';
import { getActiveOrgTournaments, getTournamentLeagues, getTournamentTeams, getStageDisplayTitle } from '../utils/tournamentUtils';
import { Download, Save, ShieldAlert, Upload, Sparkles, AlertCircle, X, Check, Trophy, Edit, RefreshCw } from 'lucide-react';
import html2canvas from 'html2canvas';
import { buildPlayoffBracket } from '../utils/playoffBracketUtils';
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
  const [tournaments, setTournaments] = useState([]);
  const [tournamentLeaguesMap, setTournamentLeaguesMap] = useState({});
  const [viewMode, setViewMode] = useState('league'); // 'league' | 'tournament'
  const [selectedTournamentId, setSelectedTournamentId] = useState('');
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
  const [tournamentSubTab, setTournamentSubTab] = useState('standings'); // 'standings' | 'bracket'
  const [tournamentPlayoffMatches, setTournamentPlayoffMatches] = useState([]);
  const bracketExportRef = useRef(null);

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

    // Fetch tournaments & their linked leagues
    const fetchedTournaments = await getActiveOrgTournaments(orgId);
    setTournaments(fetchedTournaments);
    if (fetchedTournaments.length > 0) {
      setSelectedTournamentId(fetchedTournaments[0].id);
    }

    const tLeaguesMap = {};
    await Promise.all(
      fetchedTournaments.map(async (t) => {
        const lgs = await getTournamentLeagues(t.id);
        tLeaguesMap[t.id] = lgs;
      })
    );
    setTournamentLeaguesMap(tLeaguesMap);

    fetchData(withOrgBgs, fetchedTournaments);
  };

  const fetchData = async (leaguesList = activeLeagues, tournsList = tournaments) => {
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

      // Fetch Matches with collab and tournament filter
      const collabLeagueNames = (leaguesList || []).filter(l => l.isCollab).map(l => l.name);
      const collabTournIds = (tournsList || []).filter(t => t.isCollab).map(t => t.id);

      let orConditions = [`organization_id.eq.${orgId}`];
      if (collabLeagueNames.length > 0) {
        const escapedNames = collabLeagueNames.map(n => `"${n.replace(/"/g, '""')}"`).join(',');
        orConditions.push(`league.in.(${escapedNames})`);
      }
      if (collabTournIds.length > 0) {
        orConditions.push(`tournament_id.in.(${collabTournIds.join(',')})`);
      }

      let matchesQuery = supabase
        .from('matches')
        .select('*')
        .eq('status', 'finished')
        .or(orConditions.join(','))
        .order('match_date', { ascending: false });

      const { data: matchesData, error: matchesError } = await matchesQuery;
      if (matchesError) throw matchesError;
      setMatches(matchesData || []);

      // Extract organization team IDs to only fetch relevant events (scalable to 100k+ events)
      const targetTeamIds = (teamsData || []).map(t => t.id).filter(Boolean);

      // Fetch Events (goals, assists, yellow cards, red cards) with pagination and team filter
      let allEvents = [];
      if (targetTeamIds.length > 0) {
        let page = 0;
        const PAGE_SIZE = 1000;
        while (true) {
          let eventsQuery = supabase
            .from('match_events')
            .select('id, event_type, player_id, team_id, match_id, player:player_id(first_name, last_name, photo_url), team:team_id(name, logo_url, league)')
            .in('team_id', targetTeamIds)
            .in('event_type', ['goal', 'assist', 'yellow_card', 'red_card'])
            .order('id', { ascending: true })
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

          const { data: pageData, error: pageError } = await eventsQuery;
          if (pageError) throw pageError;
          if (!pageData || pageData.length === 0) break;
          allEvents.push(...pageData);
          if (pageData.length < PAGE_SIZE) break;
          page++;
        }
      }
      setEvents(allEvents);

    } catch (err) {
      console.error("Error fetching standings data:", err);
    } finally {
      setLoading(false);
    }
  };

  // Auto-set selectedRound to max finished round for the SPECIFIC active league
  useEffect(() => {
    if (viewMode === 'tournament') return;
    if (!selectedLeague || teams.length === 0) return;
    const currentLeagueTeams = teams.filter(t => (t.league || '').includes(selectedLeague));
    const currentLeagueTeamIds = new Set(currentLeagueTeams.map(t => t.id));
    const currentLeagueMatches = matches.filter(m => !m.tournament_id && currentLeagueTeamIds.has(m.home_team_id));

    let maxR = 0;
    currentLeagueMatches.forEach(m => {
      if (m.round && parseInt(m.round) > maxR) maxR = parseInt(m.round);
    });

    const defaultRound = maxR > 0 ? maxR.toString() : '1';
    setSelectedRound(defaultRound);
  }, [selectedLeague, teams, matches, viewMode]);

  useEffect(() => {
    if (viewMode === 'tournament' && selectedTournamentId) {
      const fetchPlayoffs = async () => {
        try {
          const { data, error } = await supabase
            .from('matches')
            .select('*, home_team:home_team_id(id, name, logo_url), away_team:away_team_id(id, name, logo_url)')
            .eq('tournament_id', selectedTournamentId)
            .in('stage', ['quarterfinal', 'semifinal', 'final'])
            .order('id', { ascending: true });
          if (!error && data) {
            setTournamentPlayoffMatches(data);
          }
        } catch (e) {
          console.warn('Error fetching playoff matches:', e);
        }
      };
      fetchPlayoffs();
    } else {
      setTournamentPlayoffMatches([]);
    }
  }, [viewMode, selectedTournamentId]);

  const bracketData = React.useMemo(() => buildPlayoffBracket(tournamentPlayoffMatches, teams), [tournamentPlayoffMatches, teams]);

  useEffect(() => {
    computeStandings();
  }, [teams, matches, events, selectedLeague, selectedRound, penalties, viewMode, selectedTournamentId, tournamentLeaguesMap]);

  const computeStandings = () => {
    const isTournament = viewMode === 'tournament';
    let filteredTeams = [];
    let relevantMatches = [];

    if (isTournament) {
      if (!selectedTournamentId) {
        setStandings([]);
        setRecentMatches([]);
        setTopScorers([]);
        setTopAssists([]);
        setTopYellowCards([]);
        setTopRedCards([]);
        return;
      }
      const tournLeagues = tournamentLeaguesMap[selectedTournamentId] || [];
      filteredTeams = getTournamentTeams(tournLeagues, teams);
      const filteredTeamIds = new Set(filteredTeams.map(t => t.id));
      // In tournament view, strictly only include matches belonging to this tournament
      relevantMatches = matches.filter(m => String(m.tournament_id) === String(selectedTournamentId));
    } else {
      // Filter teams by selected league
      filteredTeams = teams.filter(t => (t.league || 'Super liga').includes(selectedLeague));
      const filteredTeamIds = new Set(filteredTeams.map(t => t.id));
      // In league view, strictly only include non-tournament league matches
      relevantMatches = matches.filter(m => !m.tournament_id && filteredTeamIds.has(m.home_team_id));
    }

    const relevantTeamIds = new Set(filteredTeams.map(t => t.id));
    const relevantMatchIds = new Set(relevantMatches.map(m => m.id));

    let roundMatches = [];
    if (!isTournament) {
      // Find max round for the active league
      let maxLeagueRound = 0;
      relevantMatches.forEach(m => {
        if (m.round && parseInt(m.round) > maxLeagueRound) maxLeagueRound = parseInt(m.round);
      });

      // Target round for recent matches card display (defaults to max/latest round)
      let targetRound = selectedRound;
      if (!targetRound || targetRound === 'all') {
        targetRound = maxLeagueRound > 0 ? maxLeagueRound.toString() : '1';
      }
      roundMatches = relevantMatches.filter(m => String(m.round) === String(targetRound));
    } else {
      roundMatches = relevantMatches.slice(0, 8);
    }

    // Filter events strictly across relevant matches so tournament & league stats NEVER mix
    const filteredEvents = events.filter(e => e.match_id && relevantMatchIds.has(e.match_id));

    // 1. Standings Table - calculates cumulative totals across ALL relevant matches
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

    relevantMatches.forEach(m => {
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
        const ovrKey = isTournament ? `TOURN_${selectedTournamentId}_${t.id}` : t.id;
        const ovr = standingsOverridesMap[ovrKey] || (!isTournament ? standingsOverridesMap[t.id] : {}) || {};
        const played_offset = parseInt(ovr.played_offset || 0);
        const won_offset = parseInt(ovr.won_offset || 0);
        const draw_offset = parseInt(ovr.draw_offset || 0);
        const lost_offset = parseInt(ovr.lost_offset || 0);
        const gf_offset = parseInt(ovr.gf_offset || 0);
        const ga_offset = parseInt(ovr.ga_offset || 0);
        const pts_offset = parseInt(ovr.pts_offset || (!isTournament ? (penalties[t.id] || 0) : 0));

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
    setRecentMatches(roundMatches.length > 0 ? roundMatches : relevantMatches.slice(0, 6));

    // 2. Top Scorers, Assists & Cards - cumulative across ALL relevant matches
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

  const selectedTournObj = tournaments.find(t => String(t.id) === String(selectedTournamentId));

  const executeExport = async () => {
    const isTourn = viewMode === 'tournament';
    const isBracket = isTourn && tournamentSubTab === 'bracket';
    const targetRef = isBracket ? bracketExportRef.current : exportRef.current;
    if (!targetRef || isExporting) return;
    if (isTourn && !selectedTournamentId) {
      alert("Iltimos, eksport qilish uchun turnirni tanlang.");
      return;
    }
    setIsExporting(true);
    try {
      const canvas = await html2canvas(targetRef, {
        scale: 2,
        useCORS: true,
        backgroundColor: null
      });
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      const targetName = (isTourn ? (selectedTournObj?.name || 'turnir') : selectedLeague).replace(/\s+/g, '_');
      const targetSub = isBracket ? 'pley_off_tori' : (isTourn ? 'umumiy' : selectedRound);
      link.download = `${targetSub}_${targetName}.png`;
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

  const renderWebBracketPill = (team, align = 'left', width = '100%') => {
    if (!team) {
      return (
        <div style={{
          width,
          height: '42px',
          borderRadius: '12px',
          background: 'rgba(56, 189, 248, 0.08)',
          border: '1px solid rgba(56, 189, 248, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(255, 255, 255, 0.4)',
          fontSize: '12px',
          fontWeight: '700'
        }}>
          Kutilmoqda...
        </div>
      );
    }

    const isWinner = team.isWinner;
    const isLoser = team.isLoser;

    return (
      <div style={{
        width,
        height: '42px',
        borderRadius: '12px',
        background: isWinner ? 'rgba(56, 189, 248, 0.32)' : isLoser ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.12)',
        border: isWinner ? '2px solid #38BDF8' : isLoser ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(255, 255, 255, 0.22)',
        opacity: isLoser ? 0.35 : 1,
        display: 'flex',
        flexDirection: align === 'right' ? 'row-reverse' : 'row',
        alignItems: 'center',
        padding: '0 8px',
        gap: '8px',
        boxSizing: 'border-box'
      }}>
        {team.logo_url ? (
          <img src={team.logo_url} alt="" style={{ width: '28px', height: '28px', borderRadius: '14px', objectFit: 'contain', background: 'rgba(255,255,255,0.1)' }} onError={(e) => { e.target.style.display = 'none'; }} />
        ) : (
          <div style={{ width: '28px', height: '28px', borderRadius: '14px', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '12px', fontWeight: '900' }}>
            {(team.name || '?')[0]}
          </div>
        )}
        <span style={{
          flex: 1,
          color: isWinner ? '#38BDF8' : '#ffffff',
          fontSize: '13px',
          fontWeight: isWinner ? '900' : '800',
          textAlign: align === 'right' ? 'right' : 'left',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}>
          {team.name}
        </span>
        {team.score !== null && team.score !== undefined && (
          <div style={{
            minWidth: '24px',
            height: '24px',
            borderRadius: '6px',
            background: isWinner ? '#38BDF8' : 'rgba(255,255,255,0.2)',
            color: isWinner ? '#050c1f' : '#ffffff',
            fontSize: '13px',
            fontWeight: '900',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 4px'
          }}>
            {team.score}{team.penalty_score !== null && team.penalty_score !== undefined ? `(${team.penalty_score})` : ''}
          </div>
        )}
      </div>
    );
  };

  const renderWebBracketMatchPair = (match, align = 'left', width = '100%') => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width }}>
      {renderWebBracketPill(match?.team1, align, '100%')}
      {renderWebBracketPill(match?.team2, align, '100%')}
    </div>
  );

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
  if (viewMode === 'tournament') {
    exportThemeClass = 'theme-export-Chempion';
  } else if (selectedLeague.includes('Pro')) {
    exportThemeClass = 'theme-export-Pro';
  } else if (selectedLeague.includes('3-liga') || selectedLeague.includes('3 liga')) {
    exportThemeClass = 'theme-export-3-liga';
  } else if (selectedLeague.includes('Europa')) {
    exportThemeClass = 'theme-export-Europa';
  } else if (selectedLeague.includes('Chempion')) {
    exportThemeClass = 'theme-export-Chempion';
  } else if (selectedLeague.includes('7x7')) {
    exportThemeClass = 'theme-export-7x7';
  }

  const currentLeagueObj = activeLeagues.find(l => String(l.name || '').trim().toLowerCase() === String(selectedLeague || '').trim().toLowerCase()) || activeLeagues.find(l => l.name === selectedLeague);
  const currentLeagueBg = currentLeagueObj?.export_bg_url || getLeagueBgForOrg(orgId, selectedLeague);
  const currentTournBg = selectedTournObj?.bg_url || selectedTournObj?.banner_url;
  const activeExportBg = viewMode === 'tournament' ? currentTournBg : currentLeagueBg;

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
            <span>
              Eksport va Fon Rasmi Boshqaruvi ({viewMode === 'tournament' ? (selectedTournObj?.name || 'Turnir') : selectedLeague})
            </span>
          </div>
        </div>

        <div className="filter-expanded-content" style={{ marginTop: '16px' }}>
          {/* View Mode Toggle: Ligalar / Turnirlar */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <button
              type="button"
              onClick={() => setViewMode('league')}
              style={{
                flex: 1,
                padding: '9px 14px',
                borderRadius: '10px',
                border: viewMode === 'league' ? '2px solid #00FF66' : '1px solid rgba(255,255,255,0.1)',
                background: viewMode === 'league' ? 'rgba(0, 255, 102, 0.15)' : 'rgba(255,255,255,0.03)',
                color: viewMode === 'league' ? '#00FF66' : '#94a3b8',
                fontWeight: '800',
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.2s'
              }}
            >
              🏆 Ligalar
            </button>
            <button
              type="button"
              onClick={() => setViewMode('tournament')}
              style={{
                flex: 1,
                padding: '9px 14px',
                borderRadius: '10px',
                border: viewMode === 'tournament' ? '2px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
                background: viewMode === 'tournament' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.03)',
                color: viewMode === 'tournament' ? '#60a5fa' : '#94a3b8',
                fontWeight: '800',
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.2s'
              }}
            >
              ⭐ Turnirlar ({tournaments.length})
            </button>
          </div>

          <div className="filter-row">
            {viewMode === 'league' ? (
              <>
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
              </>
            ) : (
              <div className="filter-field" style={{ flex: 1 }}>
                <label>Turnir tanlang</label>
                <div className="custom-select-wrapper">
                  <select value={selectedTournamentId} onChange={(e) => setSelectedTournamentId(e.target.value)}>
                    {tournaments.map(t => (
                      <option key={t.id} value={t.id}>{t.name} {t.isCollab ? '(Co-Host)' : ''}</option>
                    ))}
                    {tournaments.length === 0 && <option value="">Faol turnirlar mavjud emas</option>}
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        {viewMode === 'tournament' && (
          <div style={{ display: 'flex', gap: '10px', marginTop: '14px', marginBottom: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setTournamentSubTab('standings')}
              style={{
                padding: '9px 18px',
                borderRadius: '10px',
                border: tournamentSubTab === 'standings' ? '2px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
                background: tournamentSubTab === 'standings' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.04)',
                color: tournamentSubTab === 'standings' ? '#60a5fa' : '#94a3b8',
                fontWeight: '800',
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s ease'
              }}
            >
              📊 Guruh / Umumiy Jadval
            </button>
            <button
              type="button"
              onClick={() => setTournamentSubTab('bracket')}
              style={{
                padding: '9px 18px',
                borderRadius: '10px',
                border: tournamentSubTab === 'bracket' ? '2px solid #38bdf8' : '1px solid rgba(255,255,255,0.1)',
                background: tournamentSubTab === 'bracket' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.04)',
                color: tournamentSubTab === 'bracket' ? '#38bdf8' : '#94a3b8',
                fontWeight: '800',
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s ease'
              }}
            >
              ⚡ Pley-off To'ri (1/4 ➡️ Final)
            </button>
          </div>
        )}

        {/* 1x1 Poster Image Box & Buttons */}
        <div className="poster-banner-section" style={{ justifyContent: 'flex-start' }}>
          <div style={{ display: 'flex', gap: '12px', width: '100%', flexWrap: 'wrap' }}>
            <button className="btn-download" onClick={() => handleExportWithCheck('standings')} disabled={isExporting} style={{ flex: 1, minWidth: '180px' }}>
              <Download size={18} /> <span>{isExporting ? 'Yuklanmoqda...' : (viewMode === 'tournament' && tournamentSubTab === 'bracket' ? "Pley-off To'rini yuklab olish (PNG)" : 'Jadvalni yuklab olish')}</span>
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'tournament' && tournamentSubTab === 'bracket' ? (
        <div style={{
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '16px',
          padding: '24px',
          overflowX: 'auto',
          minHeight: '400px',
          marginBottom: '32px'
        }}>
          {!bracketData.hasPlayoffMatches ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
              <Trophy size={48} style={{ opacity: 0.4, marginBottom: '16px', color: '#38bdf8' }} />
              <h3 style={{ color: '#fff', fontSize: '18px', fontWeight: '800', marginBottom: '8px' }}>Pley-off o'yinlari hali boshlanmagan</h3>
              <p style={{ fontSize: '14px', maxWidth: '480px', margin: '0 auto' }}>Ushbu turnir uchun 1/4, 1/2 yoki Final bosqichidagi o'yinlar ro'yxatida "quarterfinal", "semifinal", "final" deb kiritilmagan.</p>
            </div>
          ) : (
            <div style={{ minWidth: '960px' }}>
              <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                <h2 style={{ color: '#fff', fontSize: '24px', fontWeight: '900', letterSpacing: '3px', margin: 0, textTransform: 'uppercase' }}>
                  Pley-off To'ri (1/4 ➡️ Final)
                </h2>
                <p style={{ color: '#38bdf8', fontSize: '14px', fontWeight: '700', marginTop: '6px' }}>
                  {selectedTournObj?.name || 'Turnir'}
                </p>
              </div>

              {/* Responsive Bracket Field on screen */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px', padding: '20px 0' }}>
                {/* 1. Left Wing */}
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', maxWidth: '340px' }}>
                  {/* QF Column */}
                  <div style={{ width: '190px', display: 'flex', flexDirection: 'column', gap: '40px' }}>
                    <div>
                      <div style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '14px', fontWeight: '900', textAlign: 'center', marginBottom: '6px' }}>1/4 FINAL</div>
                      {renderWebBracketMatchPair(bracketData.qf[0], 'left', '100%')}
                    </div>
                    <div>
                      <div style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '14px', fontWeight: '900', textAlign: 'center', marginBottom: '6px' }}>1/4 FINAL</div>
                      {renderWebBracketMatchPair(bracketData.qf[1], 'left', '100%')}
                    </div>
                  </div>

                  {/* Connectors */}
                  <div style={{ width: '30px', height: '220px', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: '15px', height: '150px', borderTop: '2px solid rgba(56, 189, 248, 0.5)', borderBottom: '2px solid rgba(56, 189, 248, 0.5)', borderRight: '2px solid rgba(56, 189, 248, 0.5)', boxSizing: 'border-box' }} />
                    <div style={{ position: 'absolute', right: 0, width: '15px', height: '2px', background: 'rgba(56, 189, 248, 0.5)' }} />
                  </div>

                  {/* SF1 Column */}
                  <div style={{ width: '120px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div style={{ color: '#38bdf8', fontSize: '14px', fontWeight: '900', textAlign: 'center', marginBottom: '6px' }}>1/2 FINAL</div>
                    {renderWebBracketMatchPair(bracketData.sf[0], 'left', '100%')}
                  </div>
                </div>

                {/* 2. Center Final */}
                <div style={{ width: '280px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: '80px', height: '80px', borderRadius: '40px', background: 'rgba(56, 189, 248, 0.12)', border: '2px solid rgba(56, 189, 248, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px' }}>
                    <Trophy size={42} color="#38bdf8" />
                  </div>
                  <div style={{ color: '#ffffff', fontSize: '22px', fontWeight: '900', letterSpacing: '3px', marginBottom: '14px' }}>FINAL</div>
                  <div style={{ width: '100%' }}>
                    {renderWebBracketMatchPair(bracketData.final, 'center', '100%')}
                  </div>
                  {bracketData.champion && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px', padding: '8px 16px', borderRadius: '12px', background: 'rgba(255, 215, 0, 0.2)', border: '1.5px solid #ffd700' }}>
                      <Trophy size={18} color="#ffd700" />
                      <span style={{ color: '#ffd700', fontSize: '13px', fontWeight: '900', letterSpacing: '1px', textTransform: 'uppercase' }}>
                        Chempion: {bracketData.champion.name}
                      </span>
                    </div>
                  )}
                </div>

                {/* 3. Right Wing */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'row-reverse', alignItems: 'center', maxWidth: '340px' }}>
                  {/* QF Column */}
                  <div style={{ width: '190px', display: 'flex', flexDirection: 'column', gap: '40px' }}>
                    <div>
                      <div style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '14px', fontWeight: '900', textAlign: 'center', marginBottom: '6px' }}>1/4 FINAL</div>
                      {renderWebBracketMatchPair(bracketData.qf[2], 'right', '100%')}
                    </div>
                    <div>
                      <div style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '14px', fontWeight: '900', textAlign: 'center', marginBottom: '6px' }}>1/4 FINAL</div>
                      {renderWebBracketMatchPair(bracketData.qf[3], 'right', '100%')}
                    </div>
                  </div>

                  {/* Connectors */}
                  <div style={{ width: '30px', height: '220px', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: '15px', height: '150px', borderTop: '2px solid rgba(56, 189, 248, 0.5)', borderBottom: '2px solid rgba(56, 189, 248, 0.5)', borderLeft: '2px solid rgba(56, 189, 248, 0.5)', boxSizing: 'border-box' }} />
                    <div style={{ position: 'absolute', left: 0, width: '15px', height: '2px', background: 'rgba(56, 189, 248, 0.5)' }} />
                  </div>

                  {/* SF2 Column */}
                  <div style={{ width: '120px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div style={{ color: '#38bdf8', fontSize: '14px', fontWeight: '900', textAlign: 'center', marginBottom: '6px' }}>1/2 FINAL</div>
                    {renderWebBracketMatchPair(bracketData.sf[1], 'right', '100%')}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
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
      )}

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
          const isTourn = viewMode === 'tournament';
          const currentLeagueObj = activeLeagues.find(l => String(l.name || '').trim().toLowerCase() === String(selectedLeague || '').trim().toLowerCase()) || activeLeagues.find(l => l.name === selectedLeague);
          const currentTournObj = tournaments.find(t => String(t.id) === String(selectedTournamentId));
          const isCollab = isTourn ? currentTournObj?.isCollab : currentLeagueObj?.isCollab;

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
              style={activeExportBg ? {
                backgroundImage: `linear-gradient(rgba(10, 13, 18, 0.75), rgba(10, 13, 18, 0.88)), url(${activeExportBg})`,
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
                        <img src={(isTourn ? currentTournObj?.org1?.logo_url : currentLeagueObj?.org1?.logo_url) || '/logo-for-jadval.png'} alt="Org 1" crossOrigin="anonymous" style={{ height: '85px', objectFit: 'contain', background: 'transparent' }} />
                        <img src="/x.png" crossOrigin="anonymous" style={{ height: '16px', objectFit: 'contain', opacity: 0.7, background: 'transparent' }} />
                        <img src={(isTourn ? currentTournObj?.org2?.logo_url : currentLeagueObj?.org2?.logo_url) || '/llf-logo.png'} alt="Org 2" crossOrigin="anonymous" style={{ height: '75px', objectFit: 'contain', background: 'transparent' }} />
                      </>
                    ) : (
                      <img src={currentOrg?.logo_url || '/logo-for-jadval.png'} alt={currentOrg?.name || 'HFL'} crossOrigin="anonymous" style={{ height: '90px', objectFit: 'contain', background: 'transparent' }} />
                    )}
                  </div>

                  <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                    {isTourn ? (
                      currentTournObj?.logo_url ? (
                        <img src={currentTournObj.logo_url} alt={currentTournObj.name} style={{ maxHeight: '95px', maxWidth: '380px', width: 'auto', height: 'auto', objectFit: 'contain', background: 'transparent', border: 'none', display: 'block', margin: '0 auto' }} crossOrigin="anonymous" />
                      ) : (
                        <h2 style={{ color: '#fff', fontSize: '36px', fontWeight: '900', textTransform: 'uppercase', margin: 0 }}>{currentTournObj?.name || 'TURNIR'}</h2>
                      )
                    ) : (
                      currentLeagueObj?.logo_url ? (
                        <img src={currentLeagueObj.logo_url} alt={selectedLeague} style={{ maxHeight: '95px', maxWidth: '380px', width: 'auto', height: 'auto', objectFit: 'contain', background: 'transparent', border: 'none', display: 'block', margin: '0 auto' }} crossOrigin="anonymous" />
                      ) : (
                        <h2 style={{ color: '#fff', fontSize: '36px', fontWeight: '900', textTransform: 'uppercase', margin: 0 }}>{selectedLeague}</h2>
                      )
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
                      <div className="export-card">
                        <div className="export-card-title">{isTourn ? 'OXIRGI O\'YINLAR NATIJALARI' : `${displayRound}-TUR NATIJALARI`}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', paddingTop: '2px', paddingBottom: '4px', paddingLeft: '8px', paddingRight: '8px' }}>
                          {recentMatches.length === 0 ? (
                            <div style={{ textAlign: 'center', opacity: 0.6, fontSize: '13.5px', fontWeight: '600', padding: '16px 0', textTransform: 'uppercase' }}>NATIJALAR KIRITILMAGAN</div>
                          ) : (() => {
                            const listToRender = recentMatches;
                            const matchCount = listToRender.length;
                            let resultRowPadding = '7px 6px';
                            let resultFontSize = 18.5;
                            let resultLogoSize = '32px';
                            let resultScoreFontSize = '20px';

                            if (matchCount > 6) {
                              resultRowPadding = '4.5px 6px';
                              resultFontSize = 15;
                              resultLogoSize = '24px';
                              resultScoreFontSize = '16.5px';
                            } else if (matchCount === 5 || matchCount === 6) {
                              resultRowPadding = '6px 6px';
                              resultFontSize = 16.5;
                              resultLogoSize = '28px';
                              resultScoreFontSize = '18.5px';
                            } else if (matchCount <= 4) {
                              resultRowPadding = '9.5px 8px';
                              resultFontSize = 19.5;
                              resultLogoSize = '36px';
                              resultScoreFontSize = '22px';
                            }

                            const getDynamicResultTeamFontSize = (name, baseSize) => {
                              const len = String(name || '').trim().length;
                              if (len > 15) return Math.round(baseSize * 0.62 * 10) / 10;
                              if (len > 12) return Math.round(baseSize * 0.74 * 10) / 10;
                              if (len > 9) return Math.round(baseSize * 0.84 * 10) / 10;
                              if (len > 7) return Math.round(baseSize * 0.92 * 10) / 10;
                              return baseSize;
                            };

                            return listToRender.slice(0, 8).map((m, idx) => {
                              const hTeam = teams.find(t => t.id === m.home_team_id);
                              const aTeam = teams.find(t => t.id === m.away_team_id);
                              const homeName = hTeam?.name || m.home_team || m.home_team_name || 'Jamoa 1';
                              const awayName = aTeam?.name || m.away_team || m.away_team_name || 'Jamoa 2';
                              const homeLogo = hTeam?.logo_url || m.home_team_logo;
                              const awayLogo = aTeam?.logo_url || m.away_team_logo;
                              const homeFontSize = getDynamicResultTeamFontSize(homeName, resultFontSize);
                              const awayFontSize = getDynamicResultTeamFontSize(awayName, resultFontSize);

                              return (
                                <div 
                                  className="export-result-row" 
                                  key={m.id || idx} 
                                  style={{ 
                                    padding: resultRowPadding,
                                    borderBottom: idx < Math.min(8, listToRender.length) - 1 ? '1px solid rgba(255, 255, 255, 0.1)' : 'none' 
                                  }}
                                >
                                  <div className="export-result-team">
                                    {homeLogo ? (
                                      <img 
                                        src={homeLogo} 
                                        alt="" 
                                        crossOrigin="anonymous" 
                                        style={{ width: resultLogoSize, height: resultLogoSize, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} 
                                        onError={(e) => { e.target.onerror = null; e.target.src = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30'%3E%3Crect width='30' height='30' fill='%23ccc' rx='15'/%3E%3C/svg%3E"; }} 
                                      />
                                    ) : (
                                      <div style={{ width: resultLogoSize, height: resultLogoSize, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <span style={{ color: '#fff', fontSize: '13px', fontWeight: '900' }}>{(homeName || '?')[0]}</span>
                                      </div>
                                    )}
                                    <span style={{ textTransform: 'uppercase', fontSize: `${homeFontSize}px`, fontWeight: '800', lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 1 }}>{homeName}</span>
                                  </div>

                                  <div className="export-result-score" style={{ fontSize: resultScoreFontSize, padding: '0 6px', flexShrink: 0 }}>
                                    {m.home_score !== undefined && m.home_score !== null ? `${m.home_score}-${m.away_score}` : 'VS'}
                                  </div>

                                  <div className="export-result-team away">
                                    {awayLogo ? (
                                      <img 
                                        src={awayLogo} 
                                        alt="" 
                                        crossOrigin="anonymous" 
                                        style={{ width: resultLogoSize, height: resultLogoSize, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} 
                                        onError={(e) => { e.target.onerror = null; e.target.src = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30'%3E%3Crect width='30' height='30' fill='%23ccc' rx='15'/%3E%3C/svg%3E"; }} 
                                      />
                                    ) : (
                                      <div style={{ width: resultLogoSize, height: resultLogoSize, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <span style={{ color: '#fff', fontSize: '13px', fontWeight: '900' }}>{(awayName || '?')[0]}</span>
                                      </div>
                                    )}
                                    <span style={{ textTransform: 'uppercase', fontSize: `${awayFontSize}px`, fontWeight: '800', lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 1, textAlign: 'right' }}>{awayName}</span>
                                  </div>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>

                      {/* Top Scorers */}
                      <div className="export-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', background: 'rgba(255, 255, 255, 0.14)', borderBottom: '1px solid rgba(255, 255, 255, 0.25)' }}>
                          <span style={{ fontSize: '16px', fontWeight: '900', color: '#ffffff', textTransform: 'uppercase' }}>TO'PURARLAR</span>
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            <span style={{ width: '30px', textAlign: 'center', fontSize: '15px', fontWeight: '800', color: '#ffffff' }}>O'</span>
                            <span style={{ width: '30px', textAlign: 'center', fontSize: '15px', fontWeight: '800', color: '#ffffff' }}>G</span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
                          {topScorers.length === 0 ? (
                            <div style={{ textAlign: 'center', opacity: 0.6, fontSize: '13.5px', fontWeight: '600', padding: '12px 0', textTransform: 'uppercase' }}>TO'PURARLAR MAVJUD EMAS</div>
                          ) : (
                            topScorers.slice(0, 3).map((p, idx) => (
                              <div className="export-stats-row" key={p.id || idx} style={{ borderBottom: idx < Math.min(3, topScorers.length) - 1 ? '1px solid rgba(255, 255, 255, 0.1)' : 'none' }}>
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
                                <div style={{ flex: 1, textTransform: 'uppercase', fontSize: '15.5px', fontWeight: '800', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                                <div style={{ width: '30px', textAlign: 'center', fontSize: '16px', fontWeight: '800' }}>{p.playedMatches || 1}</div>
                                <div style={{ width: '30px', textAlign: 'center', fontWeight: '900', fontSize: '17.5px' }}>{p.goals}</div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Top Assists */}
                      <div className="export-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', background: 'rgba(255, 255, 255, 0.14)', borderBottom: '1px solid rgba(255, 255, 255, 0.25)' }}>
                          <span style={{ fontSize: '16px', fontWeight: '900', color: '#ffffff', textTransform: 'uppercase' }}>ASSISTENTLAR</span>
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            <span style={{ width: '30px', textAlign: 'center', fontSize: '15px', fontWeight: '800', color: '#ffffff' }}>O'</span>
                            <span style={{ width: '30px', textAlign: 'center', fontSize: '15px', fontWeight: '800', color: '#ffffff' }}>A</span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
                          {topAssists.length === 0 ? (
                            <div style={{ textAlign: 'center', opacity: 0.6, fontSize: '13.5px', fontWeight: '600', padding: '12px 0', textTransform: 'uppercase' }}>ASSISTENTLAR MAVJUD EMAS</div>
                          ) : (
                            topAssists.slice(0, 3).map((p, idx) => (
                              <div className="export-stats-row" key={p.id || idx} style={{ borderBottom: idx < Math.min(3, topAssists.length) - 1 ? '1px solid rgba(255, 255, 255, 0.1)' : 'none' }}>
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
                                <div style={{ flex: 1, textTransform: 'uppercase', fontSize: '15.5px', fontWeight: '800', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                                <div style={{ width: '30px', textAlign: 'center', fontSize: '16px', fontWeight: '800' }}>{p.playedMatches || 1}</div>
                                <div style={{ width: '30px', textAlign: 'center', fontWeight: '900', fontSize: '17.5px' }}>{p.assists}</div>
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

        {/* 1080x1080 Playoff Bracket Export Canvas */}
        <div 
          ref={bracketExportRef}
          style={{
            width: '1080px',
            height: '1080px',
            background: activeExportBg
              ? `linear-gradient(rgba(5, 12, 31, 0.88), rgba(5, 12, 31, 0.94)), url(${activeExportBg})`
              : 'linear-gradient(135deg, #050c1f 0%, #0a1931 50%, #050c1f 100%)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            padding: '36px 36px 24px 36px',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            fontFamily: "'Inter', sans-serif",
            color: '#ffffff'
          }}
        >
          {/* Top Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '100px', borderBottom: '1px solid rgba(255, 255, 255, 0.15)', paddingBottom: '12px' }}>
            <div style={{ width: '220px', display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
              {mainSponsor?.logo_url ? (
                <img src={mainSponsor.logo_url} crossOrigin="anonymous" alt="" style={{ height: '50px', maxWidth: '180px', objectFit: 'contain' }} />
              ) : currentOrg?.logo_url ? (
                <img src={currentOrg.logo_url} crossOrigin="anonymous" alt="" style={{ height: '55px', maxWidth: '180px', objectFit: 'contain' }} />
              ) : (
                <div style={{ color: '#00FF66', fontSize: '24px', fontWeight: '900', letterSpacing: '1.5px' }}>AMATORA</div>
              )}
            </div>

            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ color: '#ffffff', fontSize: '32px', fontWeight: '900', letterSpacing: '4px', textTransform: 'uppercase' }}>
                TURNIR JADVALI
              </div>
              <div style={{ color: '#38BDF8', fontSize: '16px', fontWeight: '800', letterSpacing: '2px', textTransform: 'uppercase', marginTop: '4px' }}>
                {selectedTournObj?.name || 'CHAMPIONS LEAGUE'}
              </div>
            </div>

            <div style={{ width: '220px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
              {selectedTournObj?.logo_url ? (
                <img src={selectedTournObj.logo_url} crossOrigin="anonymous" alt="" style={{ width: '64px', height: '64px', objectFit: 'contain' }} />
              ) : currentOrg?.logo_url ? (
                <img src={currentOrg.logo_url} crossOrigin="anonymous" alt="" style={{ width: '64px', height: '64px', objectFit: 'contain' }} />
              ) : (
                <div style={{ width: '64px', height: '64px', borderRadius: '32px', background: 'rgba(56, 189, 248, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Trophy size={32} color="#38BDF8" />
                </div>
              )}
            </div>
          </div>

          {/* Main Bracket Field (Left Wing, Center Final, Right Wing) */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '14px 0' }}>
            {/* 1. LEFT WING (QF1, QF2 -> SF1) */}
            <div style={{ width: '340px', height: '680px', display: 'flex', alignItems: 'center' }}>
              {/* QF Column */}
              <div style={{ width: '190px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-around' }}>
                <div>
                  <div style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '16px', fontWeight: '900', textAlign: 'center', marginBottom: '8px', letterSpacing: '1px' }}>1/4</div>
                  {renderWebBracketMatchPair(bracketData.qf[0], 'left', '190px')}
                </div>
                <div>
                  <div style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '16px', fontWeight: '900', textAlign: 'center', marginBottom: '8px', letterSpacing: '1px' }}>1/4</div>
                  {renderWebBracketMatchPair(bracketData.qf[1], 'left', '190px')}
                </div>
              </div>

              {/* Connector lines Left */}
              <div style={{ width: '30px', height: '380px', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '15px', height: '260px', borderTop: '2px solid rgba(56, 189, 248, 0.5)', borderBottom: '2px solid rgba(56, 189, 248, 0.5)', borderRight: '2px solid rgba(56, 189, 248, 0.5)', boxSizing: 'border-box' }} />
                <div style={{ position: 'absolute', right: 0, width: '15px', height: '2px', background: 'rgba(56, 189, 248, 0.5)' }} />
              </div>

              {/* SF1 Column */}
              <div style={{ width: '120px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ color: '#38BDF8', fontSize: '16px', fontWeight: '900', textAlign: 'center', marginBottom: '8px', letterSpacing: '1px' }}>1/2</div>
                {renderWebBracketMatchPair(bracketData.sf[0], 'left', '120px')}
              </div>
            </div>

            {/* 2. CENTER FINAL (Trophy + Final Match) */}
            <div style={{ width: '280px', height: '680px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: '120px', height: '120px', borderRadius: '60px', background: 'rgba(56, 189, 248, 0.12)', border: '2px solid rgba(56, 189, 248, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>
                <Trophy size={72} color="#38BDF8" />
              </div>
              <div style={{ color: '#ffffff', fontSize: '26px', fontWeight: '900', letterSpacing: '4px', marginBottom: '16px' }}>
                FINAL
              </div>
              <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                {renderWebBracketMatchPair(bracketData.final, 'center', '240px')}
              </div>

              {bracketData.champion && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px', padding: '8px 16px', borderRadius: '14px', background: 'rgba(255, 215, 0, 0.2)', border: '1.5px solid #FFD700' }}>
                  <Trophy size={20} color="#FFD700" />
                  <span style={{ color: '#FFD700', fontSize: '15px', fontWeight: '900', letterSpacing: '1px', textTransform: 'uppercase' }}>
                    Chempion: {bracketData.champion.name}
                  </span>
                </div>
              )}
            </div>

            {/* 3. RIGHT WING (SF2 <- QF3, QF4) */}
            <div style={{ width: '340px', height: '680px', display: 'flex', flexDirection: 'row-reverse', alignItems: 'center' }}>
              {/* QF Column */}
              <div style={{ width: '190px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-around' }}>
                <div>
                  <div style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '16px', fontWeight: '900', textAlign: 'center', marginBottom: '8px', letterSpacing: '1px' }}>1/4</div>
                  {renderWebBracketMatchPair(bracketData.qf[2], 'right', '190px')}
                </div>
                <div>
                  <div style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '16px', fontWeight: '900', textAlign: 'center', marginBottom: '8px', letterSpacing: '1px' }}>1/4</div>
                  {renderWebBracketMatchPair(bracketData.qf[3], 'right', '190px')}
                </div>
              </div>

              {/* Connector lines Right */}
              <div style={{ width: '30px', height: '380px', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '15px', height: '260px', borderTop: '2px solid rgba(56, 189, 248, 0.5)', borderBottom: '2px solid rgba(56, 189, 248, 0.5)', borderLeft: '2px solid rgba(56, 189, 248, 0.5)', boxSizing: 'border-box' }} />
                <div style={{ position: 'absolute', left: 0, width: '15px', height: '2px', background: 'rgba(56, 189, 248, 0.5)' }} />
              </div>

              {/* SF2 Column */}
              <div style={{ width: '120px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ color: '#38BDF8', fontSize: '16px', fontWeight: '900', textAlign: 'center', marginBottom: '8px', letterSpacing: '1px' }}>1/2</div>
                {renderWebBracketMatchPair(bracketData.sf[1], 'right', '120px')}
              </div>
            </div>
          </div>

          {/* Bottom Footer */}
          <div style={{ height: '50px', borderTop: '1px solid rgba(255, 255, 255, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
            <span style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '16px', fontWeight: '800', letterSpacing: '1px' }}>
              @{((currentOrg?.name || selectedTournObj?.name || 'havas_football')).toLowerCase().replace(/\s+/g, '_')}
            </span>
          </div>
        </div>
      </div>

    </div>
  );
}
