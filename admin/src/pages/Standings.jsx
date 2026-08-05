import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useOrg } from '../context/OrgContext';
import { getActiveOrgLeagues, applyOrgAndCollabFilter } from '../utils/leagueUtils';
import { Download, Save, ShieldAlert, Upload, Sparkles, AlertCircle, X, Check, Trophy } from 'lucide-react';
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
  const [savingPenalty, setSavingPenalty] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingCards, setIsExportingCards] = useState(false);

  const [mainSponsor, setMainSponsor] = useState(null);
  const [selectedSponsors, setSelectedSponsors] = useState([]);

  useEffect(() => {
    fetchSponsorsData();
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
          query = query.or(`organization_id.eq.${orgId},organization_id.is.null`);
        }
        const { data } = await query;
        loadedSponsors = data || [];
      }

      const realSponsors = loadedSponsors.filter(s => 
        s.name && 
        !s.name.startsWith('SCHEDULE_BANNER_') && 
        !s.name.startsWith('YT_BANNER_') && 
        !s.name.startsWith('YT_OAUTH_TOKENS_') &&
        !s.name.startsWith('MATCH_TIMER_')
      );

      const mainFromDb = realSponsors.find(s => s.is_main === true);
      if (mainFromDb) {
        setMainSponsor(mainFromDb);
      }

      const selectedFromDb = realSponsors.filter(s => !s.is_main && s.is_selected !== false);
      setSelectedSponsors(selectedFromDb);
    } catch (e) {
      console.error('Error fetching sponsors in Standings:', e);
    }
  };

  const mainSponsorLogo = mainSponsor?.logo_url || '';

  const exportRef = useRef(null);
  const cardsExportRef = useRef(null);

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
      export_bg_url: getLeagueBgForOrg(orgId, l.name) || l.export_bg_url
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
        .select('id, name, logo_url, league, penalty_points')
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

      if (matchesData && matchesData.length > 0) {
        let maxR = 0;
        matchesData.forEach(m => {
          if (m.round && parseInt(m.round) > maxR) maxR = parseInt(m.round);
        });
        setSelectedRound(maxR.toString());
      }

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
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        gf: 0,
        ga: 0,
        gd: 0,
        points: penalties[t.id] || 0
      };
    });

    allLeagueMatches.forEach(m => {
      const hId = m.home_team_id;
      const aId = m.away_team_id;
      const hScore = parseInt(m.home_score || 0);
      const aScore = parseInt(m.away_score || 0);

      if (tableMap[hId]) {
        tableMap[hId].played += 1;
        tableMap[hId].gf += hScore;
        tableMap[hId].ga += aScore;
        if (hScore > aScore) {
          tableMap[hId].won += 1;
          tableMap[hId].points += 3;
        } else if (hScore === aScore) {
          tableMap[hId].drawn += 1;
          tableMap[hId].points += 1;
        } else {
          tableMap[hId].lost += 1;
        }
      }

      if (tableMap[aId]) {
        tableMap[aId].played += 1;
        tableMap[aId].gf += aScore;
        tableMap[aId].ga += hScore;
        if (aScore > hScore) {
          tableMap[aId].won += 1;
          tableMap[aId].points += 3;
        } else if (aScore === hScore) {
          tableMap[aId].drawn += 1;
          tableMap[aId].points += 1;
        } else {
          tableMap[aId].lost += 1;
        }
      }
    });

    const computedStandings = Object.values(tableMap).map(t => {
      t.gd = t.gf - t.ga;
      return t;
    }).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.gd !== a.gd) return b.gd - a.gd;
      return b.gf - a.gf;
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

  const handleSavePenalty = async (teamId) => {
    setSavingPenalty(teamId);
    try {
      const pval = parseInt(penalties[teamId]) || 0;
      const { error } = await supabase
        .from('teams')
        .update({ penalty_points: pval })
        .eq('id', teamId);
      
      if (error) throw error;
      alert('Muvaffaqiyatli saqlandi!');
      setTeams(prev => prev.map(t => t.id === teamId ? { ...t, penalty_points: pval } : t));
    } catch (error) {
      console.error(error);
    } finally {
      setSavingPenalty(null);
    }
  };

  const handleExportWithCheck = (type) => {
    executeExport(type);
  };

  const executeExport = async (type) => {
    if (type === 'standings') {
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
    } else if (type === 'cards') {
      if (!cardsExportRef.current || isExportingCards) return;
      setIsExportingCards(true);
      try {
        const canvas = await html2canvas(cardsExportRef.current, {
          scale: 2,
          useCORS: true,
          backgroundColor: null
        });
        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `kartochkalar_${selectedLeague}_${selectedRound}.png`;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (err) {
        console.error("Export cards error:", err);
        alert("Kartochkalar rasmini yuklab olishda xatolik yuz berdi.");
      } finally {
        setIsExportingCards(false);
      }
    }
  };

  // Get dynamic rounds
  let maxRound = 0;
  matches.forEach(m => {
    if (m.round && parseInt(m.round) > maxRound) maxRound = parseInt(m.round);
  });
  const roundOptions = [];
  for (let i = 1; i <= maxRound; i++) roundOptions.push(i);

  const displayRound = selectedRound || '1';

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
            <button className="btn-download cards-btn" onClick={() => handleExportWithCheck('cards')} disabled={isExportingCards} style={{ flex: 1, minWidth: '180px' }}>
              <ShieldAlert size={18} /> <span>{isExportingCards ? 'Yuklanmoqda...' : 'Kartochkalarni yuklab olish'}</span>
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
              <th>Farq</th>
              <th>Ochko</th>
              <th>Jarima / Bonus (Ochko)</th>
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
                <td>{t.gd > 0 ? `+${t.gd}` : t.gd}</td>
                <td><strong>{t.points}</strong></td>
                <td>
                  <input 
                    type="number" 
                    className="penalty-input"
                    value={penalties[t.id] ?? 0}
                    onChange={(e) => setPenalties({...penalties, [t.id]: e.target.value})}
                  />
                  <button 
                    className="btn-save-penalty"
                    onClick={() => handleSavePenalty(t.id)}
                    disabled={savingPenalty === t.id}
                  >
                    <Save size={14} /> Saqlash
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* HIDDEN EXPORT TEMPLATE */}
      <div style={{ position: 'fixed', left: '-9999px', top: 0, opacity: 1, pointerEvents: 'none', zIndex: -100 }}>
        {(() => {
          const currentLeagueObj = activeLeagues.find(l => String(l.name || '').trim().toLowerCase() === String(selectedLeague || '').trim().toLowerCase()) || activeLeagues.find(l => l.name === selectedLeague);
          const isCollab = currentLeagueObj?.isCollab;

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
                <div className="export-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', width: '100%' }}>
                  <div className="export-logo-left" style={{ width: '230px', minWidth: '230px', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', justifyContent: 'flex-start' }}>
                    {isCollab ? (
                      <>
                        <img src={currentLeagueObj.org1?.logo_url || '/logo-for-jadval.png'} alt="Org 1" crossOrigin="anonymous" style={{ height: '70px', objectFit: 'contain', background: 'transparent' }} />
                        <img src="/x.png" crossOrigin="anonymous" style={{ height: '14px', objectFit: 'contain', opacity: 0.7, background: 'transparent' }} />
                        <img src={currentLeagueObj.org2?.logo_url || '/llf-logo.png'} alt="Org 2" crossOrigin="anonymous" style={{ height: '60px', objectFit: 'contain', background: 'transparent' }} />
                      </>
                    ) : (
                      <img src={currentOrg?.logo_url || '/logo-for-jadval.png'} alt={currentOrg?.name || 'HFL'} crossOrigin="anonymous" style={{ height: '75px', objectFit: 'contain', background: 'transparent' }} />
                    )}
                  </div>

                  <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                    {currentLeagueObj?.logo_url ? (
                      <img src={currentLeagueObj.logo_url} alt={selectedLeague} style={{ maxHeight: '75px', maxWidth: '320px', width: 'auto', height: 'auto', objectFit: 'contain', background: 'transparent', border: 'none', display: 'block', margin: '0 auto' }} crossOrigin="anonymous" />
                    ) : (
                      <h2 style={{ color: '#fff', fontSize: '28px', fontWeight: '900', textTransform: 'uppercase', margin: 0 }}>{selectedLeague}</h2>
                    )}
                  </div>

                  <div className="export-logo-right" style={{ width: '230px', minWidth: '230px', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                    {mainSponsorLogo ? (
                      <img src={mainSponsorLogo} alt="Bosh Homiy" crossOrigin="anonymous" style={{ height: '65px', objectFit: 'contain', background: 'transparent' }} />
                    ) : null}
                  </div>
                </div>

            {/* Body */}
            <div className="export-body">
              
              {/* Left Col: Standings Table */}
              <div className="export-table-container">
                <div className="export-table-header">
                  <div className="export-col-hash">#</div>
                  <div className="export-col-team">JAMOA</div>
                  <div className="export-col-stat">O'</div>
                  <div className="export-col-stat">T/N</div>
                  <div className="export-col-stat">O</div>
                </div>
                {standings.slice(0, 13).map((t, idx) => (
                  <div className="export-table-row" key={t.id}>
                    <div className="export-col-hash">{idx + 1}</div>
                    <div className="export-col-team" style={{display: 'flex', alignItems: 'center'}}>
                      <img src={t.logo_url} className="team-img" alt="" crossOrigin="anonymous" onError={(e) => { e.target.onerror = null; e.target.src = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30'%3E%3Crect width='30' height='30' fill='%23ccc' rx='15'/%3E%3C/svg%3E"; }} />
                      <span style={{textTransform: 'uppercase'}}>{t.name}</span>
                    </div>
                    <div className="export-col-stat">{t.played}</div>
                    <div className="export-col-stat">{t.gd}</div>
                    <div className="export-col-stat">{t.points}</div>
                  </div>
                ))}
              </div>

              {/* Right Col: Results, Top Scorers, Assists */}
              <div className="export-right-col">
                
                {/* Results */}
                <div className="export-card">
                  <div className="export-card-title">{displayRound}-TUR NATIJALARI</div>
                  <div style={{padding: '6px 10px'}}>
                    {recentMatches.slice(0, 6).map(m => {
                      const hTeam = teams.find(t => t.id === m.home_team_id);
                      const aTeam = teams.find(t => t.id === m.away_team_id);
                      if(!hTeam || !aTeam) return null;
                      return (
                        <div className="export-result-row" key={m.id}>
                          <div className="export-result-team">
                            <img src={hTeam.logo_url} alt="" crossOrigin="anonymous" onError={(e) => { e.target.onerror = null; e.target.src = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30'%3E%3Crect width='30' height='30' fill='%23ccc' rx='15'/%3E%3C/svg%3E"; }} />
                            <span style={{textTransform:'uppercase', fontSize: '13px'}}>{hTeam.name}</span>
                          </div>
                          <div className="export-result-score">{m.home_score}-{m.away_score}</div>
                          <div className="export-result-team away">
                            <img src={aTeam.logo_url} alt="" crossOrigin="anonymous" onError={(e) => { e.target.onerror = null; e.target.src = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30'%3E%3Crect width='30' height='30' fill='%23ccc' rx='15'/%3E%3C/svg%3E"; }} />
                            <span style={{textTransform:'uppercase', fontSize: '13px'}}>{aTeam.name}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Top Scorers */}
                <div className="export-card">
                  <div className="export-card-title">TO'PURARLAR <span style={{float:'right', fontSize:'14px'}}>O'   G</span></div>
                  <div>
                    {topScorers.slice(0, 3).map(p => (
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
                        <div style={{flex: 1, textTransform: 'uppercase'}}>{p.name}</div>
                        <div style={{width: '30px', textAlign: 'center'}}>{p.playedMatches || 1}</div>
                        <div style={{width: '30px', textAlign: 'center', fontWeight: '900'}}>{p.goals}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Top Assists */}
                <div className="export-card">
                  <div className="export-card-title">ASSISTENTLAR <span style={{float:'right', fontSize:'14px'}}>O'   A</span></div>
                  <div>
                    {topAssists.slice(0, 3).map(p => (
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
                        <div style={{flex: 1, textTransform: 'uppercase'}}>{p.name}</div>
                        <div style={{width: '30px', textAlign: 'center'}}>{p.playedMatches || 1}</div>
                        <div style={{width: '30px', textAlign: 'center', fontWeight: '900'}}>{p.assists}</div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </div>

            {(() => {
              const currentLeagueObj = activeLeagues.find(l => String(l.name || '').trim().toLowerCase() === String(selectedLeague || '').trim().toLowerCase()) || activeLeagues.find(l => l.name === selectedLeague);
              const isShowSponsors = currentLeagueObj ? (currentLeagueObj.show_sponsors !== false) : (localStorage.getItem('hfl_league_show_sponsors_' + selectedLeague) !== 'false');
              if (!isShowSponsors) return null;
              const secondarySponsors = selectedSponsors.filter(s => s.id !== mainSponsor?.id);
              if (secondarySponsors.length === 0) return null;
              return (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justify: 'center',
                  gap: '24px',
                  margin: '10px auto 12px auto',
                  padding: '8px 24px',
                  background: 'rgba(0, 0, 0, 0.45)',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255, 255, 255, 0.18)',
                  borderRadius: '25px',
                  width: 'fit-content',
                  boxShadow: '0 4px 15px rgba(0, 0, 0, 0.3)'
                }}>
                  {secondarySponsors.map((s, idx) => (
                    <React.Fragment key={s.id || idx}>
                      <img src={s.logo_url} alt={s.name} crossOrigin="anonymous" style={{ height: '34px', maxWidth: '110px', objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
                      {idx < secondarySponsors.length - 1 && (
                        <div style={{ height: '20px', width: '1px', backgroundColor: '#ffffff', opacity: 0.35 }}></div>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              );
            })()}

            <div style={{
              textAlign: 'center', 
              color: '#ffffff', 
              opacity: 0.7, 
              fontSize: '11px', 
              marginTop: '4px',
              marginBottom: '20px',
              textTransform: 'uppercase',
              letterSpacing: '2px',
              fontWeight: '600'
            }}>
              {matches.length > 0 ? new Date(matches[0].match_date).getFullYear() : new Date().getFullYear()}/
              {matches.length > 0 ? new Date(matches[0].match_date).getFullYear() + 1 : new Date().getFullYear() + 1}-MAVSUM {displayRound}-TUR
            </div>

          </div>
        </div>
        );
      })()}
      </div>

      {/* 2. CARDS EXPORT TEMPLATE (YELLOW & RED CARDS GLASSMORPHISM DESIGN) */}
      <div style={{ position: 'relative', height: 0, overflow: 'hidden' }}>
        {(() => {
          const currentLeagueObj = activeLeagues.find(l => String(l.name || '').trim().toLowerCase() === String(selectedLeague || '').trim().toLowerCase()) || activeLeagues.find(l => l.name === selectedLeague);
          const isCollab = currentLeagueObj?.isCollab;

          return (
            <div 
              className={`export-wrapper ${exportThemeClass}`} 
              ref={cardsExportRef}
              style={currentLeagueObj?.export_bg_url ? {
                backgroundImage: `linear-gradient(rgba(10, 13, 18, 0.75), rgba(10, 13, 18, 0.88)), url(${currentLeagueObj.export_bg_url})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat'
              } : {}}
            >
              <div className="export-container">
                <div className="export-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', width: '100%' }}>
                  <div className="export-logo-left" style={{ width: '230px', minWidth: '230px', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', justifyContent: 'flex-start' }}>
                    {isCollab ? (
                      <>
                        <img src={currentLeagueObj.org1?.logo_url || '/logo-for-jadval.png'} alt="Org 1" crossOrigin="anonymous" style={{ height: '70px', objectFit: 'contain', background: 'transparent' }} />
                        <img src="/x.png" crossOrigin="anonymous" style={{ height: '14px', objectFit: 'contain', opacity: 0.7, background: 'transparent' }} />
                        <img src={currentLeagueObj.org2?.logo_url || '/llf-logo.png'} alt="Org 2" crossOrigin="anonymous" style={{ height: '60px', objectFit: 'contain', background: 'transparent' }} />
                      </>
                    ) : (
                      <img src={currentOrg?.logo_url || '/logo-for-jadval.png'} alt={currentOrg?.name || 'HFL'} crossOrigin="anonymous" style={{ height: '75px', objectFit: 'contain', background: 'transparent' }} />
                    )}
                  </div>

                  <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                    {currentLeagueObj?.logo_url ? (
                      <img src={currentLeagueObj.logo_url} alt={selectedLeague} style={{ maxHeight: '75px', maxWidth: '320px', width: 'auto', height: 'auto', objectFit: 'contain', background: 'transparent', border: 'none', display: 'block', margin: '0 auto' }} crossOrigin="anonymous" />
                    ) : (
                      <h2 style={{ color: '#fff', fontSize: '28px', fontWeight: '900', textTransform: 'uppercase', margin: 0 }}>{selectedLeague}</h2>
                    )}
                  </div>

                  <div className="export-logo-right" style={{ width: '230px', minWidth: '230px', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                    {mainSponsorLogo ? (
                      <img src={mainSponsorLogo} alt="Bosh Homiy" crossOrigin="anonymous" style={{ height: '65px', objectFit: 'contain', background: 'transparent' }} />
                    ) : null}
                  </div>
                </div>

            {/* Title Banner */}
            <div className="cards-export-title-banner">
              <span>🟨 🟥 SARIQ VA QIZIL KARTOCHKALAR</span>
            </div>

            {/* Glassmorphism Yellow & Red Card Tables */}
            <div className="export-body" style={{ gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              
              {/* Yellow Cards Table */}
              <div className="export-card cards-glass-card">
                <div className="export-card-title yellow-title">
                  🟨 SARIQ KARTOCHKALAR <span style={{ float: 'right', fontSize: '14px' }}>SONI</span>
                </div>
                <div>
                  {topYellowCards.length === 0 ? (
                    <div className="cards-empty">Sariq kartochka olganlar yo'q</div>
                  ) : (
                    topYellowCards.map(p => (
                      <div className="export-stats-row card-player-row" key={p.id}>
                        <img 
                          src={p.playerPhoto || p.teamLogo || "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30'%3E%3Crect width='30' height='30' fill='%23ccc' rx='15'/%3E%3C/svg%3E"} 
                          className="stat-img" 
                          alt="" 
                          crossOrigin="anonymous" 
                          onError={(e) => { e.target.onerror = null; e.target.src = p.teamLogo || ''; }} 
                        />
                        <div style={{ flex: 1, textTransform: 'uppercase' }}>
                          <div style={{ fontWeight: '800', fontSize: '15px' }}>{p.name}</div>
                        </div>
                        {p.teamLogo && (
                          <img src={p.teamLogo} alt="" style={{ width: '22px', height: '22px', borderRadius: '50%', marginRight: '10px' }} crossOrigin="anonymous" />
                        )}
                        <div className="card-badge yellow-badge">
                          🟨 {p.yellowCards}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Red Cards Table */}
              <div className="export-card cards-glass-card">
                <div className="export-card-title red-title">
                  🟥 QIZIL KARTOCHKALAR <span style={{ float: 'right', fontSize: '14px' }}>SONI</span>
                </div>
                <div>
                  {topRedCards.length === 0 ? (
                    <div className="cards-empty">Qizil kartochka olganlar yo'q</div>
                  ) : (
                    topRedCards.map(p => (
                      <div className="export-stats-row card-player-row" key={p.id}>
                        <img 
                          src={p.playerPhoto || p.teamLogo || "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30'%3E%3Crect width='30' height='30' fill='%23ccc' rx='15'/%3E%3C/svg%3E"} 
                          className="stat-img" 
                          alt="" 
                          crossOrigin="anonymous" 
                          onError={(e) => { e.target.onerror = null; e.target.src = p.teamLogo || ''; }} 
                        />
                        <div style={{ flex: 1, textTransform: 'uppercase' }}>
                          <div style={{ fontWeight: '800', fontSize: '15px' }}>{p.name}</div>
                        </div>
                        {p.teamLogo && (
                          <img src={p.teamLogo} alt="" style={{ width: '22px', height: '22px', borderRadius: '50%', marginRight: '10px' }} crossOrigin="anonymous" />
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

            {(() => {
              const currentLeagueObj = activeLeagues.find(l => String(l.name || '').trim().toLowerCase() === String(selectedLeague || '').trim().toLowerCase()) || activeLeagues.find(l => l.name === selectedLeague);
              const isShowSponsors = currentLeagueObj ? (currentLeagueObj.show_sponsors !== false) : (localStorage.getItem('hfl_league_show_sponsors_' + selectedLeague) !== 'false');
              if (!isShowSponsors) return null;
              const secondarySponsors = selectedSponsors.filter(s => s.id !== mainSponsor?.id);
              if (secondarySponsors.length === 0) return null;
              return (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justify: 'center',
                  gap: '24px',
                  margin: '10px auto 12px auto',
                  padding: '8px 24px',
                  background: 'rgba(0, 0, 0, 0.45)',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255, 255, 255, 0.18)',
                  borderRadius: '25px',
                  width: 'fit-content',
                  boxShadow: '0 4px 15px rgba(0, 0, 0, 0.3)'
                }}>
                  {secondarySponsors.map((s, idx) => (
                    <React.Fragment key={s.id || idx}>
                      <img src={s.logo_url} alt={s.name} crossOrigin="anonymous" style={{ height: '34px', maxWidth: '110px', objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
                      {idx < secondarySponsors.length - 1 && (
                        <div style={{ height: '20px', width: '1px', backgroundColor: '#ffffff', opacity: 0.35 }}></div>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              );
            })()}

            <div style={{
              textAlign: 'center', 
              color: '#ffffff', 
              opacity: 0.7, 
              fontSize: '11px', 
              marginTop: '4px',
              marginBottom: '20px',
              textTransform: 'uppercase',
              letterSpacing: '2px',
              fontWeight: '600'
            }}>
              {matches.length > 0 ? new Date(matches[0].match_date).getFullYear() : new Date().getFullYear()}/
              {matches.length > 0 ? new Date(matches[0].match_date).getFullYear() + 1 : new Date().getFullYear() + 1}-MAVSUM INTIZOM JADVALI
            </div>

          </div>
        </div>
        );
      })()}
      </div>

    </div>
  );
}
