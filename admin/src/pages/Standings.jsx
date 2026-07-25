import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useOrg } from '../context/OrgContext';
import { getActiveOrgLeagues, applyOrgAndCollabFilter } from '../utils/leagueUtils';
import { Download, Save, ShieldAlert, Crop, Image as ImageIcon, Upload, Sparkles, AlertCircle, X, Check } from 'lucide-react';
import html2canvas from 'html2canvas';
import ImageCropperModal from '../components/ImageCropperModal';
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

  // Background Image Cropper & Prompt Modal states
  const [isCropperOpen, setIsCropperOpen] = useState(false);
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [pendingExportType, setPendingExportType] = useState(null); // 'standings' | 'cards'
  
  const [selectedSponsors, setSelectedSponsors] = useState(() => {
    try {
      const saved = localStorage.getItem('hfl_selectedSponsors');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [];
  });

  useEffect(() => {
    localStorage.setItem('hfl_selectedSponsors', JSON.stringify(selectedSponsors));
  }, [selectedSponsors]);

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
        .select('id, event_type, player_id, team_id, player:player_id(first_name, last_name, photo_url), team:team_id(name, logo_url, league)')
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

    // Filter matches
    let filteredMatches = matches.filter(m => filteredTeamIds.has(m.home_team_id));
    if (selectedRound && selectedRound !== 'all') {
      filteredMatches = filteredMatches.filter(m => String(m.round) === String(selectedRound));
    }

    // Filter events
    const filteredEvents = events.filter(e => filteredTeamIds.has(e.team_id));

    // 1. Standings Table
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

    filteredMatches.forEach(m => {
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
    setRecentMatches(filteredMatches.slice(0, 6));

    // 2. Top Scorers, Assists & Cards
    const playerStats = {};
    filteredEvents.forEach(e => {
      if (!e.player || !e.player_id) return;
      if (!playerStats[e.player_id]) {
        playerStats[e.player_id] = {
          id: e.player_id,
          name: `${e.player.first_name} ${e.player.last_name}`,
          teamLogo: e.team?.logo_url || '',
          playerPhoto: e.player?.photo_url || '',
          goals: 0,
          assists: 0,
          yellowCards: 0,
          redCards: 0
        };
      }
      if (e.event_type === 'goal') playerStats[e.player_id].goals += 1;
      if (e.event_type === 'assist') playerStats[e.player_id].assists += 1;
      if (e.event_type === 'yellow_card') playerStats[e.player_id].yellowCards += 1;
      if (e.event_type === 'red_card') playerStats[e.player_id].redCards += 1;
    });

    const scorers = Object.values(playerStats)
      .filter(p => p.goals > 0)
      .sort((a, b) => b.goals - a.goals)
      .slice(0, 5);

    const assists = Object.values(playerStats)
      .filter(p => p.assists > 0)
      .sort((a, b) => b.assists - a.assists)
      .slice(0, 5);

    const yellowCardsList = Object.values(playerStats)
      .filter(p => p.yellowCards > 0)
      .sort((a, b) => b.yellowCards - a.yellowCards)
      .slice(0, 8);

    const redCardsList = Object.values(playerStats)
      .filter(p => p.redCards > 0)
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
    const currentLeagueObj = activeLeagues.find(l => l.name === selectedLeague);
    if (!currentLeagueObj?.export_bg_url) {
      setPendingExportType(type);
      setIsPromptModalOpen(true);
    } else {
      executeExport(type);
    }
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

  const handleSaveCroppedBg = async (croppedDataUrl) => {
    const currentLeagueObj = activeLeagues.find(l => l.name === selectedLeague);
    if (!currentLeagueObj) return;

    try {
      // 1. Save individually per organization & league in local storage
      const storageKey = `hfl_export_bg_${orgId}_${selectedLeague}`;
      try {
        localStorage.setItem(storageKey, croppedDataUrl);
      } catch (e) {}

      // 2. If org owns the league, sync to Supabase table
      if (currentLeagueObj.organization_id === orgId) {
        await supabase
          .from('leagues')
          .update({ export_bg_url: croppedDataUrl })
          .eq('id', currentLeagueObj.id)
          .catch(() => {});
      }

      // 3. Update local state for current org view
      setActiveLeagues(prev => prev.map(l => l.name === selectedLeague ? { ...l, export_bg_url: croppedDataUrl } : l));
      setIsCropperOpen(false);

      if (pendingExportType) {
        executeExport(pendingExportType);
        setPendingExportType(null);
      }
    } catch (err) {
      console.error('Error saving background:', err);
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

  if (loading) return <div>Yuklanmoqda...</div>;

  return (
    <div className="standings-page">
      <div className="standings-header">
        <h1>Turnir Jadvali va Export</h1>
        <div className="standings-header-actions" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button className="btn-download bg-upload-btn" onClick={() => setIsCropperOpen(true)} title="1:1 formatda liga uchun fon rasmi yuklash va qirqish">
            <Crop size={18} /> <span>1:1 Fon Rasmi</span>
          </button>
          <button className="btn-download" onClick={() => handleExportWithCheck('standings')} disabled={isExporting}>
            <Download size={18} /> <span>{isExporting ? 'Yuklanmoqda...' : 'Jadvalni yuklab olish'}</span>
          </button>
          <button className="btn-download cards-btn" onClick={() => handleExportWithCheck('cards')} disabled={isExportingCards}>
            <ShieldAlert size={18} /> <span>{isExportingCards ? 'Yuklanmoqda...' : 'Kartochkalarni yuklab olish'}</span>
          </button>
        </div>
      </div>

      <div className="filters-row">
        <div className="filter-group">
          <label>Liga</label>
          <select value={selectedLeague} onChange={(e) => setSelectedLeague(e.target.value)}>
            {activeLeagues.map(l => (
              <option key={l.id} value={l.name}>{l.name}</option>
            ))}
            {activeLeagues.length === 0 && <option value="">Hali ligalar yo'q</option>}
          </select>
        </div>
        <div className="filter-group">
          <label>Tur</label>
          <select value={selectedRound} onChange={(e) => setSelectedRound(e.target.value)}>
            {roundOptions.map(r => <option key={r} value={r}>{r}-tur</option>)}
          </select>
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
                <td>{i + 1}</td>
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
          const currentLeagueObj = activeLeagues.find(l => l.name === selectedLeague);
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
                <div className="export-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div className="export-logo-left" style={{ width: 'auto', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
                    {isCollab ? (
                      <>
                        <img src={currentLeagueObj.org1?.logo_url || '/logo-for-jadval.png'} alt="Org 1" crossOrigin="anonymous" style={{ height: '90px', objectFit: 'contain' }} />
                        <img src="/x.png" crossOrigin="anonymous" style={{ height: '18px', objectFit: 'contain', opacity: 0.7 }} />
                        <img src={currentLeagueObj.org2?.logo_url || '/llf-logo.png'} alt="Org 2" crossOrigin="anonymous" style={{ height: '75px', objectFit: 'contain' }} />
                      </>
                    ) : (
                      <img src={currentOrg?.logo_url || '/logo-for-jadval.png'} alt={currentOrg?.name || 'HFL'} crossOrigin="anonymous" style={{ height: '100px', objectFit: 'contain' }} />
                    )}
                  </div>

                  <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    {currentLeagueObj?.logo_url ? (
                      <img src={currentLeagueObj.logo_url} alt={selectedLeague} style={{ height: '110px', maxWidth: '380px', objectFit: 'contain' }} crossOrigin="anonymous" />
                    ) : DEFAULT_LEAGUE_LOGOS[selectedLeague] ? (
                      <img src={DEFAULT_LEAGUE_LOGOS[selectedLeague]} alt={selectedLeague} style={{ height: '110px', maxWidth: '380px', objectFit: 'contain' }} crossOrigin="anonymous" />
                    ) : (
                      <h2 style={{ color: '#fff', fontSize: '32px', fontWeight: '900', textTransform: 'uppercase' }}>{selectedLeague}</h2>
                    )}
                  </div>

                  <div className="export-logo-right" style={{ width: '220px', textAlign: 'right', display: 'flex', justifyContent: 'flex-end' }}>
                    <img src="/Joma-logo.png" alt="Joma" crossOrigin="anonymous" style={{ height: '80px', objectFit: 'contain' }} />
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
                        <div style={{width: '30px', textAlign: 'center'}}>{matches.length > 0 ? matches[0].round : 1}</div>
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
                        <div style={{width: '30px', textAlign: 'center'}}>{matches.length > 0 ? matches[0].round : 1}</div>
                        <div style={{width: '30px', textAlign: 'center', fontWeight: '900'}}>{p.assists}</div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </div>

            {selectedLeague !== '7x7 liga' && selectedSponsors.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '30px', marginTop: '15px' }}>
                {selectedSponsors.map((s, idx) => (
                  <React.Fragment key={s.id}>
                    <img src={s.logo_url} alt={s.name} crossOrigin="anonymous" style={{ height: '42px', objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
                    {idx < selectedSponsors.length - 1 && (
                      <div style={{ height: '28px', width: '1px', backgroundColor: '#ffffff', opacity: 0.5 }}></div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            )}

            <div style={{
              textAlign: 'center', 
              color: '#ffffff', 
              opacity: 0.7, 
              fontSize: '12px', 
              marginTop: selectedLeague !== '7x7 liga' && selectedSponsors.length > 0 ? '25px' : '15px',
              marginBottom: '20px',
              textTransform: 'uppercase',
              letterSpacing: '2px',
              fontWeight: '500'
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
          const currentLeagueObj = activeLeagues.find(l => l.name === selectedLeague);
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
                <div className="export-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div className="export-logo-left" style={{ width: 'auto', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
                    {isCollab ? (
                      <>
                        <img src={currentLeagueObj.org1?.logo_url || '/logo-for-jadval.png'} alt="Org 1" crossOrigin="anonymous" style={{ height: '90px', objectFit: 'contain' }} />
                        <img src="/x.png" crossOrigin="anonymous" style={{ height: '18px', objectFit: 'contain', opacity: 0.7 }} />
                        <img src={currentLeagueObj.org2?.logo_url || '/llf-logo.png'} alt="Org 2" crossOrigin="anonymous" style={{ height: '75px', objectFit: 'contain' }} />
                      </>
                    ) : (
                      <img src={currentOrg?.logo_url || '/logo-for-jadval.png'} alt={currentOrg?.name || 'HFL'} crossOrigin="anonymous" style={{ height: '100px', objectFit: 'contain' }} />
                    )}
                  </div>

                  <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    {currentLeagueObj?.logo_url ? (
                      <img src={currentLeagueObj.logo_url} alt={selectedLeague} style={{ height: '110px', maxWidth: '380px', objectFit: 'contain' }} crossOrigin="anonymous" />
                    ) : DEFAULT_LEAGUE_LOGOS[selectedLeague] ? (
                      <img src={DEFAULT_LEAGUE_LOGOS[selectedLeague]} alt={selectedLeague} style={{ height: '110px', maxWidth: '380px', objectFit: 'contain' }} crossOrigin="anonymous" />
                    ) : (
                      <h2 style={{ color: '#fff', fontSize: '32px', fontWeight: '900', textTransform: 'uppercase' }}>{selectedLeague}</h2>
                    )}
                  </div>

                  <div className="export-logo-right" style={{ width: '220px', textAlign: 'right', display: 'flex', justifyContent: 'flex-end' }}>
                    <img src="/Joma-logo.png" alt="Joma" crossOrigin="anonymous" style={{ height: '80px', objectFit: 'contain' }} />
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

            {selectedLeague !== '7x7 liga' && selectedSponsors.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '30px', marginTop: '15px' }}>
                {selectedSponsors.map((s, idx) => (
                  <React.Fragment key={s.id}>
                    <img src={s.logo_url} alt={s.name} crossOrigin="anonymous" style={{ height: '42px', objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
                    {idx < selectedSponsors.length - 1 && (
                      <div style={{ height: '28px', width: '1px', backgroundColor: '#ffffff', opacity: 0.5 }}></div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            )}

            <div style={{
              textAlign: 'center', 
              color: '#ffffff', 
              opacity: 0.7, 
              fontSize: '12px', 
              marginTop: '15px',
              marginBottom: '20px',
              textTransform: 'uppercase',
              letterSpacing: '2px',
              fontWeight: '500'
            }}>
              {matches.length > 0 ? new Date(matches[0].match_date).getFullYear() : new Date().getFullYear()}/
              {matches.length > 0 ? new Date(matches[0].match_date).getFullYear() + 1 : new Date().getFullYear() + 1}-MAVSUM INTIZOM JADVALI
            </div>

          </div>
        </div>
        );
      })()}
      </div>
      
      {/* 1:1 Image Cropper Modal */}
      <ImageCropperModal
        isOpen={isCropperOpen}
        onClose={() => setIsCropperOpen(false)}
        onSave={handleSaveCroppedBg}
        title={`"${selectedLeague}" Ligasi Uchun Fon Rasmini 1:1 Formatda Qirqish`}
      />

      {/* Background Prompt Modal */}
      {isPromptModalOpen && (
        <div className="cropper-modal-overlay" onClick={() => setIsPromptModalOpen(false)}>
          <div className="cropper-modal" style={{ maxWidth: '460px' }} onClick={e => e.stopPropagation()}>
            <div className="cropper-header">
              <div className="cropper-title">
                <ImageIcon size={22} />
                <h2>Eksport Fon Rasmi Yo'q</h2>
              </div>
              <button className="cropper-close-btn" onClick={() => setIsPromptModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="cropper-body" style={{ textAlign: 'center', gap: '16px' }}>
              <div style={{ background: 'rgba(0, 255, 102, 0.1)', border: '1px solid rgba(0, 255, 102, 0.25)', padding: '16px', borderRadius: '14px', color: '#fff' }}>
                <Sparkles size={32} style={{ color: '#00ff66', marginBottom: '8px' }} />
                <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.5' }}>
                  <strong>"{selectedLeague}"</strong> ligasi uchun hali maxsus 1:1 eksport fon rasmi yuklanmagan.
                </p>
              </div>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', margin: 0 }}>
                Hozir rasm yuklab 1:1 formatda qirqasizmi yoki odatiy to'q fon bilan yuklab olasizmi?
              </p>
            </div>
            <div className="cropper-footer" style={{ justifyContent: 'space-between' }}>
              <button
                className="cropper-cancel-btn"
                onClick={() => {
                  setIsPromptModalOpen(false);
                  if (pendingExportType) {
                    executeExport(pendingExportType);
                    setPendingExportType(null);
                  }
                }}
              >
                Odatiy fon bilan yuklab olish
              </button>
              <button
                className="cropper-save-btn"
                onClick={() => {
                  setIsPromptModalOpen(false);
                  setIsCropperOpen(true);
                }}
              >
                <Crop size={16} /> Rasm Yuklash & Qirqish
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
