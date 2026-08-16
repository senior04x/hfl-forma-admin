import React, { useState, useEffect, useRef } from 'react';
import { supabase, supabaseAdmin } from '../supabaseClient';
import { useOrg } from '../context/OrgContext';
import { getActiveOrgLeagues, applyOrgAndCollabFilter } from '../utils/leagueUtils';
import { 
  ShieldAlert, 
  Download, 
  Search, 
  Trophy, 
  Filter, 
  Users, 
  AlertTriangle, 
  ShieldCheck, 
  CheckCircle,
  X
} from 'lucide-react';
import html2canvas from 'html2canvas';
import './Cards.css';

export default function Cards() {
  const { currentOrg, orgId } = useOrg();

  const [loading, setLoading] = useState(true);
  const [activeLeagues, setActiveLeagues] = useState([]);
  const [selectedLeague, setSelectedLeague] = useState('');
  const [selectedRound, setSelectedRound] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [cardTypeFilter, setCardTypeFilter] = useState('all'); // 'all', 'yellow', 'red'

  const [teams, setTeams] = useState([]);
  const [matches, setMatches] = useState([]);
  const [events, setEvents] = useState([]);
  const [playersList, setPlayersList] = useState([]);

  const [isExportingPoster, setIsExportingPoster] = useState(false);

  const [mainSponsor, setMainSponsor] = useState(null);
  const [selectedSponsors, setSelectedSponsors] = useState([]);
  const [leagueSponsorsSettingsMap, setLeagueSponsorsSettingsMap] = useState({});

  const posterExportRef = useRef(null);

  useEffect(() => {
    fetchSponsorsData();
  }, [orgId]);

  const fetchSponsorsData = async () => {
    try {
      let loadedSponsors = [];
      const dbClient = supabaseAdmin || supabase;
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
          query = query.or(`organization_id.eq.${orgId},organization_id.is.null`);
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

      const realSponsors = loadedSponsors.filter(s => 
        s.name && 
        !s.name.startsWith('SCHEDULE_BANNER_') && 
        !s.name.startsWith('YT_BANNER_') && 
        !s.name.startsWith('YT_OAUTH_TOKENS_') &&
        !s.name.startsWith('MATCH_TIMER_') &&
        !s.name.startsWith('LEAGUE_SHOW_SPONSORS_') &&
        !s.name.startsWith('STANDINGS_OVERRIDE_')
      );

      const mainFromDb = realSponsors.find(s => s.is_main === true);
      if (mainFromDb) {
        setMainSponsor(mainFromDb);
      }

      const selectedFromDb = realSponsors.filter(s => !s.is_main && s.is_selected !== false);
      setSelectedSponsors(selectedFromDb);
    } catch (e) {
      console.error('Error fetching sponsors in Cards:', e);
    }
  };

  const getLeagueBgForOrg = (targetOrgId, leagueName) => {
    try {
      const saved = localStorage.getItem(`hfl_export_bg_${targetOrgId}_${leagueName}`);
      if (saved) return saved;
    } catch (e) {}
    return null;
  };

  const checkIsShowSponsors = (leagueObj, leagueName) => {
    if (!leagueName && !leagueObj) return true;
    const nameToUse = leagueName || leagueObj?.name;
    const idToUse = leagueObj?.id;

    if (idToUse !== undefined && idToUse !== null && leagueSponsorsSettingsMap[`${idToUse}`] !== undefined) {
      return leagueSponsorsSettingsMap[`${idToUse}`];
    }
    if (nameToUse && leagueSponsorsSettingsMap[nameToUse] !== undefined) {
      return leagueSponsorsSettingsMap[nameToUse];
    }
    if (leagueObj && leagueObj.show_sponsors !== undefined && leagueObj.show_sponsors !== null) {
      return leagueObj.show_sponsors !== false;
    }
    const localByName = nameToUse ? localStorage.getItem(`hfl_league_show_sponsors_${nameToUse}`) : null;
    if (localByName === 'false') return false;
    if (localByName === 'true') return true;

    return true;
  };

  useEffect(() => {
    loadLeaguesAndData();
  }, [orgId]);

  const loadLeaguesAndData = async () => {
    const fetched = await getActiveOrgLeagues(orgId);
    const withOrgBgs = fetched.map(l => ({
      ...l,
      export_bg_url: l.export_bg_url || getLeagueBgForOrg(orgId, l.name)
    }));
    setActiveLeagues(withOrgBgs);
    if (withOrgBgs.length > 0 && !selectedLeague) {
      setSelectedLeague(withOrgBgs[0].name);
    }
    fetchData(withOrgBgs);
  };

  const fetchData = async (leaguesList = activeLeagues) => {
    setLoading(true);
    try {
      const dbClient = supabaseAdmin || supabase;

      // 1. Fetch Teams
      let teamsQuery = dbClient
        .from('teams')
        .select('*');
      if (orgId) {
        teamsQuery = applyOrgAndCollabFilter(teamsQuery, orgId, leaguesList);
      }
      const { data: teamsData, error: teamsError } = await teamsQuery;
      if (teamsError) console.warn("Teams fetch warning:", teamsError);
      setTeams(teamsData || []);

      // 2. Fetch Matches
      let matchesQuery = dbClient
        .from('matches')
        .select('*');
      if (orgId) {
        matchesQuery = applyOrgAndCollabFilter(matchesQuery, orgId, leaguesList);
      }
      const { data: matchesData, error: matchesError } = await matchesQuery;
      if (matchesError) console.warn("Matches fetch warning:", matchesError);
      setMatches(matchesData || []);

      // 3. Fetch Events (yellow and red cards) with joined player, team, and match round
      const { data: eventsData, error: eventsError } = await dbClient
        .from('match_events')
        .select(`
          id, 
          event_type, 
          minute, 
          player_id, 
          team_id, 
          match_id, 
          player:player_id(id, first_name, last_name, photo_url, player_number), 
          team:team_id(id, name, logo_url, league),
          match:match_id(id, round, league)
        `)
        .in('event_type', ['yellow_card', 'red_card']);

      if (eventsError) {
        console.error("Events fetch error:", eventsError);
        const { data: fallbackEvents } = await dbClient
          .from('match_events')
          .select('*')
          .in('event_type', ['yellow_card', 'red_card']);
        setEvents(fallbackEvents || []);
      } else {
        setEvents(eventsData || []);
      }

      // 4. Fetch Approved Players (Applications) for full data enrichment
      const { data: appsData } = await dbClient
        .from('applications')
        .select('id, first_name, last_name, player_number, photo_url, team_id');
      setPlayersList(appsData || []);

    } catch (err) {
      console.error("Error fetching cards data:", err);
    } finally {
      setLoading(false);
    }
  };

  // Map match_id to match object for fast round lookup
  const matchMap = {};
  matches.forEach(m => {
    matchMap[m.id] = m;
  });

  // Map player_id to applications object for fallback
  const playerAppMap = {};
  playersList.forEach(p => {
    playerAppMap[p.id] = p;
  });

  // Map team_id to team object for fast lookup
  const teamMap = {};
  teams.forEach(t => {
    teamMap[t.id] = t;
  });

  // Compute dynamic rounds specifically for the active selected league
  let maxRound = 0;
  matches.forEach(m => {
    const isLeagueMatch = (m.league || '').includes(selectedLeague) || 
      (teamMap[m.home_team_id]?.league || '').includes(selectedLeague);
    if (isLeagueMatch && m.round && parseInt(m.round) > maxRound) {
      maxRound = parseInt(m.round);
    }
  });

  events.forEach(e => {
    const teamLeague = e.team?.league || teamMap[e.team_id]?.league || e.match?.league || '';
    if (selectedLeague && teamLeague.includes(selectedLeague)) {
      const r = e.match?.round || matchMap[e.match_id]?.round;
      if (r && parseInt(r) > maxRound) {
        maxRound = parseInt(r);
      }
    }
  });

  if (maxRound === 0) maxRound = 1;

  const roundOptions = [];
  for (let i = 1; i <= maxRound; i++) roundOptions.push(i);

  // Process and Filter Cards
  const processedCardPlayers = (() => {
    const cardMap = {};

    events.forEach(e => {
      if (!e.player_id) return;
      if (e.event_type !== 'yellow_card' && e.event_type !== 'red_card') return;

      // 1. League Filter: Check event's team league or match league
      const eventTeam = teamMap[e.team_id] || e.team;
      const teamLeague = eventTeam?.league || e.match?.league || '';
      
      const isLeagueMatch = !selectedLeague || teamLeague.includes(selectedLeague);
      if (!isLeagueMatch) return;

      // 2. Round Filter
      if (selectedRound && selectedRound !== 'all') {
        const evRound = e.match?.round !== undefined && e.match?.round !== null 
          ? e.match.round 
          : matchMap[e.match_id]?.round;
        if (evRound !== undefined && evRound !== null && String(evRound) !== String(selectedRound)) {
          return;
        }
      }

      // Aggregate
      if (!cardMap[e.player_id]) {
        const appInfo = playerAppMap[e.player_id];
        const pObj = e.player || {};

        const firstName = pObj.first_name || appInfo?.first_name || '';
        const lastName = pObj.last_name || appInfo?.last_name || '';
        const fullName = `${firstName} ${lastName}`.trim() || "Noma'lum o'yinchi";
        const photoUrl = pObj.photo_url || appInfo?.photo_url || '';
        const playerNumber = pObj.player_number || appInfo?.player_number || '';

        cardMap[e.player_id] = {
          id: e.player_id,
          name: fullName,
          firstName,
          lastName,
          photoUrl,
          playerNumber: playerNumber ? `#${playerNumber}` : '-',
          teamId: e.team_id,
          teamName: eventTeam?.name || 'Noma\'lum jamoa',
          teamLogo: eventTeam?.logo_url || '',
          yellowCards: 0,
          redCards: 0,
          totalCards: 0,
          events: []
        };
      }

      cardMap[e.player_id].events.push(e);
      if (e.event_type === 'yellow_card') {
        cardMap[e.player_id].yellowCards += 1;
        cardMap[e.player_id].totalCards += 1;
      } else if (e.event_type === 'red_card') {
        cardMap[e.player_id].redCards += 1;
        cardMap[e.player_id].totalCards += 1;
      }
    });

    let list = Object.values(cardMap);

    // Apply Card Type Tab Filter
    if (cardTypeFilter === 'yellow') {
      list = list.filter(p => p.yellowCards > 0);
    } else if (cardTypeFilter === 'red') {
      list = list.filter(p => p.redCards > 0);
    } else {
      list = list.filter(p => p.totalCards > 0);
    }

    // Apply Search Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(p => 
        p.name.toLowerCase().includes(q) ||
        p.teamName.toLowerCase().includes(q) ||
        p.playerNumber.includes(q)
      );
    }

    // Sort: Red Cards DESC, then Yellow Cards DESC, then Name ASC
    list.sort((a, b) => {
      if (b.redCards !== a.redCards) return b.redCards - a.redCards;
      if (b.yellowCards !== a.yellowCards) return b.yellowCards - a.yellowCards;
      return a.name.localeCompare(b.name);
    });

    return list;
  })();

  // Calculate Summary Statistics
  const totalYellowCardsCount = processedCardPlayers.reduce((acc, p) => acc + p.yellowCards, 0);
  const totalRedCardsCount = processedCardPlayers.reduce((acc, p) => acc + p.redCards, 0);
  const totalPenalizedPlayersCount = processedCardPlayers.length;

  // Most carded team
  const teamCardCountMap = {};
  processedCardPlayers.forEach(p => {
    if (!teamCardCountMap[p.teamName]) {
      teamCardCountMap[p.teamName] = 0;
    }
    teamCardCountMap[p.teamName] += (p.yellowCards + p.redCards * 2);
  });
  let mostCardedTeamName = '-';
  let maxTeamCards = 0;
  Object.entries(teamCardCountMap).forEach(([tName, count]) => {
    if (count > maxTeamCards) {
      maxTeamCards = count;
      mostCardedTeamName = tName;
    }
  });

  // Export 1:1 Poster as PNG
  const handleExportPoster = async () => {
    if (!posterExportRef.current || isExportingPoster) return;
    setIsExportingPoster(true);
    try {
      const canvas = await html2canvas(posterExportRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: null
      });
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `kartochkalar_${selectedLeague}_tur_${selectedRound}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Poster Export error:", err);
      alert("Kartochkalar posterini yuklab olishda xatolik yuz berdi.");
    } finally {
      setIsExportingPoster(false);
    }
  };

  // Top Yellow & Red for Poster Visual
  const posterYellowCardsList = processedCardPlayers.filter(p => p.yellowCards > 0).slice(0, 8);
  const posterRedCardsList = processedCardPlayers.filter(p => p.redCards > 0).slice(0, 8);

  const currentLeagueObj = activeLeagues.find(l => String(l.name || '').trim().toLowerCase() === String(selectedLeague || '').trim().toLowerCase()) || activeLeagues.find(l => l.name === selectedLeague);
  const isCollab = currentLeagueObj?.isCollab;

  let exportThemeClass = 'theme-export-Super';
  if (selectedLeague.includes('Pro')) exportThemeClass = 'theme-export-Pro';
  else if (selectedLeague.includes('3-liga') || selectedLeague.includes('3 liga')) exportThemeClass = 'theme-export-3-liga';
  else if (selectedLeague.includes('Europa')) exportThemeClass = 'theme-export-Europa';
  else if (selectedLeague.includes('Chempion')) exportThemeClass = 'theme-export-Chempion';
  else if (selectedLeague.includes('7x7')) exportThemeClass = 'theme-export-7x7';

  const mainSponsorLogo = mainSponsor?.logo_url || '';

  if (loading) {
    return (
      <div className="cards-page">
        <div className="cards-header">
          <div className="skeleton-pulse skeleton-title" style={{ width: '280px', height: '36px' }}></div>
        </div>
        <div className="cards-stats-grid">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="skeleton-pulse" style={{ height: '70px', borderRadius: '14px' }}></div>
          ))}
        </div>
        <div className="skeleton-pulse skeleton-filter-box" style={{ height: '120px', borderRadius: '16px', marginBottom: '20px' }}></div>
        <div className="cards-table-card">
          <div className="skeleton-pulse" style={{ height: '350px', width: '100%' }}></div>
        </div>
      </div>
    );
  }

  return (
    <div className="cards-page">
      {/* Header */}
      <div className="cards-header">
        <div className="cards-title-box">
          <ShieldAlert size={28} className="cards-title-icon" />
          <div>
            <h1>Qoidabuzarliklar va Kartochkalar</h1>
            <p>Sariq va qizil kartochka olgan barcha o'yinchilarning to'liq intizom ro'yxati</p>
          </div>
        </div>
      </div>

      {/* Stats Summary Widgets */}
      <div className="cards-stats-grid">
        <div className="stat-card yellow">
          <div className="stat-card-icon">🟨</div>
          <div className="stat-card-info">
            <span className="stat-card-label">Sariq kartochkalar</span>
            <span className="stat-card-value">{totalYellowCardsCount}</span>
          </div>
        </div>

        <div className="stat-card red">
          <div className="stat-card-icon">🟥</div>
          <div className="stat-card-info">
            <span className="stat-card-label">Qizil kartochkalar</span>
            <span className="stat-card-value">{totalRedCardsCount}</span>
          </div>
        </div>

        <div className="stat-card players">
          <div className="stat-card-icon">
            <Users size={18} />
          </div>
          <div className="stat-card-info">
            <span className="stat-card-label">O'yinchilar soni</span>
            <span className="stat-card-value">{totalPenalizedPlayersCount}</span>
          </div>
        </div>

        <div className="stat-card danger">
          <div className="stat-card-icon">
            <AlertTriangle size={18} />
          </div>
          <div className="stat-card-info">
            <span className="stat-card-label">Eng ko'p qoidabuzar</span>
            <span className="stat-card-value" style={{ fontSize: '13px', fontWeight: '700' }}>
              {mostCardedTeamName}
            </span>
          </div>
        </div>
      </div>

      {/* Filter & Controls Card */}
      <div className="cards-filter-card">
        <div className="cards-filter-header">
          <div className="cards-filter-title">
            <Filter size={16} style={{ color: '#f59e0b' }} />
            <span>Filtr va Qidiruv ({selectedLeague || 'Barcha ligalar'})</span>
          </div>
        </div>

        <div className="cards-filter-row">
          {/* League Filter */}
          <div className="filter-field">
            <label>Liga tanlang</label>
            <div className="custom-select-wrapper">
              <select value={selectedLeague} onChange={(e) => { setSelectedLeague(e.target.value); setSelectedRound('all'); }}>
                {activeLeagues.map(l => (
                  <option key={l.id} value={l.name}>{l.name} {l.isCollab ? '(Co-Host)' : ''}</option>
                ))}
                {activeLeagues.length === 0 && <option value="">Ligalar yo'q</option>}
              </select>
            </div>
          </div>

          {/* Round / Tur Filter */}
          <div className="filter-field">
            <label>Tur (Bosqich)</label>
            <div className="custom-select-wrapper">
              <select value={selectedRound} onChange={(e) => setSelectedRound(e.target.value)}>
                <option value="all">Barcha turlar (Umumiy)</option>
                {roundOptions.map(r => (
                  <option key={r} value={r}>{r}-tur</option>
                ))}
              </select>
            </div>
          </div>

          {/* Search Input */}
          <div className="filter-field">
            <label>O'yinchi yoki jamoani qidirish</label>
            <div className="filter-search-box">
              <Search size={16} className="filter-search-icon" />
              <input
                type="text"
                className="filter-search-input"
                placeholder="Ism, forma raqami yoki jamoa..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Tab filters and Export action buttons */}
        <div className="cards-actions-row">
          <div className="card-type-tabs">
            <button 
              className={`tab-btn ${cardTypeFilter === 'all' ? 'active' : ''}`}
              onClick={() => setCardTypeFilter('all')}
            >
              Barchasi ({processedCardPlayers.length})
            </button>
            <button 
              className={`tab-btn yellow-tab ${cardTypeFilter === 'yellow' ? 'active' : ''}`}
              onClick={() => setCardTypeFilter('yellow')}
            >
              🟨 Sariq ({processedCardPlayers.filter(p => p.yellowCards > 0).length})
            </button>
            <button 
              className={`tab-btn red-tab ${cardTypeFilter === 'red' ? 'active' : ''}`}
              onClick={() => setCardTypeFilter('red')}
            >
              🟥 Qizil ({processedCardPlayers.filter(p => p.redCards > 0).length})
            </button>
          </div>

          <div className="cards-export-buttons">
            <button 
              className="btn-export-poster"
              onClick={handleExportPoster}
              disabled={isExportingPoster}
            >
              <Download size={15} />
              <span>{isExportingPoster ? 'Tayyorlanmoqda...' : 'Rasmni Yuklab Olish'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Table (Ultra-responsive, no side scroll, clear separators, team below player name) */}
      <div className="cards-table-card">
        {processedCardPlayers.length === 0 ? (
          <div className="cards-empty-container">
            <div className="cards-empty-icon">
              <ShieldCheck size={32} />
            </div>
            <h3>Kartochkalar mavjud emas</h3>
            <p>
              {selectedRound === 'all' 
                ? `Ushbu ligada (${selectedLeague}) hozircha sariq yoki qizil kartochka olgan o'yinchilar qayd etilmagan.`
                : `${selectedLeague} ${selectedRound}-turida sariq yoki qizil kartochka olgan o'yinchilar qayd etilmagan.`
              }
            </p>
          </div>
        ) : (
          <div className="cards-table-wrapper">
            <table className="cards-table">
              <thead>
                <tr>
                  <th className="th-rank">#</th>
                  <th className="th-player">O'yinchi va Jamoasi</th>
                  <th className="th-yellow">🟨 Sariq</th>
                  <th className="th-red">🟥 Qizil</th>
                  <th className="th-status">Holati</th>
                </tr>
              </thead>
              <tbody>
                {processedCardPlayers.map((player, idx) => {
                  const isRedBanned = player.redCards > 0;
                  const isYellowWarned = player.yellowCards >= 2;

                  return (
                    <tr key={player.id || idx}>
                      <td className="td-rank">
                        <span className={`rank-pill ${idx === 0 ? 'top-1' : idx === 1 ? 'top-2' : idx === 2 ? 'top-3' : ''}`}>
                          {idx + 1}
                        </span>
                      </td>

                      <td className="td-player">
                        <div className="player-info-compound">
                          <img 
                            src={player.photoUrl || player.teamLogo || "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30'%3E%3Crect width='30' height='30' fill='%23334155' rx='15'/%3E%3C/svg%3E"}
                            alt={player.name}
                            className="player-avatar"
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.src = player.teamLogo || "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30'%3E%3Crect width='30' height='30' fill='%23334155' rx='15'/%3E%3C/svg%3E";
                            }}
                          />
                          <div className="player-text-details">
                            {/* Top Line: Player Name + Kit Number */}
                            <div className="player-top-line">
                              <span className="player-full-name">{player.name}</span>
                              {player.playerNumber !== '-' && (
                                <span className="player-kit-tag">{player.playerNumber}</span>
                              )}
                            </div>
                            {/* Bottom Line: Team Logo + Team Name right below name */}
                            <div className="player-team-line">
                              {player.teamLogo && (
                                <img 
                                  src={player.teamLogo} 
                                  alt="" 
                                  className="team-micro-logo" 
                                  onError={(e) => { e.target.style.display = 'none'; }}
                                />
                              )}
                              <span className="team-micro-name">{player.teamName}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="td-yellow">
                        {player.yellowCards > 0 ? (
                          <span className="badge-yellow-compact">
                            🟨 {player.yellowCards}
                          </span>
                        ) : (
                          <span className="badge-zero">—</span>
                        )}
                      </td>

                      <td className="td-red">
                        {player.redCards > 0 ? (
                          <span className="badge-red-compact">
                            🟥 {player.redCards}
                          </span>
                        ) : (
                          <span className="badge-zero">—</span>
                        )}
                      </td>

                      <td className="td-status">
                        {isRedBanned ? (
                          <span className="status-pill banned">
                            🟥 Chetlash
                          </span>
                        ) : isYellowWarned ? (
                          <span className="status-pill warned">
                            ⚠️ {player.yellowCards} ta
                          </span>
                        ) : (
                          <span className="status-pill active-status">
                            Faol
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* HIDDEN 1:1 POSTER EXPORT TEMPLATE */}
      <div style={{ position: 'fixed', left: '-9999px', top: 0, opacity: 1, pointerEvents: 'none', zIndex: -100 }}>
        <div 
          className={`export-wrapper ${exportThemeClass}`} 
          ref={posterExportRef}
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

            {/* Poster Content */}
            <div className="export-main-content">
              <div className="cards-export-title-banner">
                <span>🟨 🟥 SARIQ VA QIZIL KARTOCHKALAR {selectedRound !== 'all' ? `(${selectedRound}-TUR)` : ''}</span>
              </div>

              <div className="export-body" style={{ gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                {/* Yellow Cards Glass Table */}
                <div className="export-card cards-glass-card">
                  <div className="export-card-title yellow-title">
                    🟨 SARIQ KARTOCHKALAR <span style={{ float: 'right', fontSize: '16px' }}>SONI</span>
                  </div>
                  <div>
                    {posterYellowCardsList.length === 0 ? (
                      <div className="cards-empty">Sariq kartochka olganlar yo'q</div>
                    ) : (
                      posterYellowCardsList.map(p => (
                        <div className="export-stats-row card-player-row" key={p.id}>
                          <img 
                            src={p.photoUrl || p.teamLogo || "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30'%3E%3Crect width='30' height='30' fill='%23ccc' rx='15'/%3E%3C/svg%3E"} 
                            className="stat-img" 
                            alt="" 
                            crossOrigin="anonymous" 
                            onError={(e) => { e.target.onerror = null; e.target.src = p.teamLogo || ''; }} 
                          />
                          <div style={{ flex: 1, textTransform: 'uppercase' }}>
                            <div style={{ fontWeight: '800', fontSize: '17px' }}>{p.name}</div>
                            <div style={{ fontSize: '12px', opacity: 0.8 }}>{p.teamName} {p.playerNumber !== '-' ? `(${p.playerNumber})` : ''}</div>
                          </div>
                          {p.teamLogo && (
                            <img src={p.teamLogo} alt="" style={{ width: '28px', height: '28px', borderRadius: '50%', marginRight: '10px', objectFit: 'cover' }} crossOrigin="anonymous" />
                          )}
                          <div className="card-badge yellow-badge">
                            🟨 {p.yellowCards}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Red Cards Glass Table */}
                <div className="export-card cards-glass-card">
                  <div className="export-card-title red-title">
                    🟥 QIZIL KARTOCHKALAR <span style={{ float: 'right', fontSize: '16px' }}>SONI</span>
                  </div>
                  <div>
                    {posterRedCardsList.length === 0 ? (
                      <div className="cards-empty">Qizil kartochka olganlar yo'q</div>
                    ) : (
                      posterRedCardsList.map(p => (
                        <div className="export-stats-row card-player-row" key={p.id}>
                          <img 
                            src={p.photoUrl || p.teamLogo || "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30'%3E%3Crect width='30' height='30' fill='%23ccc' rx='15'/%3E%3C/svg%3E"} 
                            className="stat-img" 
                            alt="" 
                            crossOrigin="anonymous" 
                            onError={(e) => { e.target.onerror = null; e.target.src = p.teamLogo || ''; }} 
                          />
                          <div style={{ flex: 1, textTransform: 'uppercase' }}>
                            <div style={{ fontWeight: '800', fontSize: '17px' }}>{p.name}</div>
                            <div style={{ fontSize: '12px', opacity: 0.8 }}>{p.teamName} {p.playerNumber !== '-' ? `(${p.playerNumber})` : ''}</div>
                          </div>
                          {p.teamLogo && (
                            <img src={p.teamLogo} alt="" style={{ width: '28px', height: '28px', borderRadius: '50%', marginRight: '10px', objectFit: 'cover' }} crossOrigin="anonymous" />
                          )}
                          <div className="card-badge red-badge">
                            🟥 {p.redCards}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Secondary Sponsors */}
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: '20px' }}>
              {(() => {
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
      </div>
    </div>
  );
}
