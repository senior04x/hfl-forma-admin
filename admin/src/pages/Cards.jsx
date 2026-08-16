import React, { useState, useEffect } from 'react';
import { supabase, supabaseAdmin } from '../supabaseClient';
import { useOrg } from '../context/OrgContext';
import { getActiveOrgLeagues, applyOrgAndCollabFilter } from '../utils/leagueUtils';
import { 
  ShieldAlert, 
  Search, 
  ShieldCheck, 
  FileText
} from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import './Cards.css';

const DEFAULT_PLAYER_AVATAR = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40' fill='%2364748b'%3E%3Cpath d='M20 20a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm0 4c-7.33 0-14 3.67-14 11v2h28v-2c0-7.33-6.67-11-14-11z'/%3E%3C/svg%3E";

const loadRobotoFont = async (doc) => {
  try {
    const fontRes = await fetch(
      'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/fonts/Roboto/Roboto-Regular.ttf'
    );
    const fontBlob = await fontRes.blob();
    const base64Font = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.readAsDataURL(fontBlob);
    });
    doc.addFileToVFS('Roboto-Regular.ttf', base64Font);
    doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
    doc.setFont('Roboto');
    return true;
  } catch (e) {
    console.warn('Roboto font loading failed, using default font:', e);
    return false;
  }
};

export default function Cards() {
  const { currentOrg, orgId } = useOrg();

  const [loading, setLoading] = useState(true);
  const [activeLeagues, setActiveLeagues] = useState([]);
  const [selectedLeague, setSelectedLeague] = useState('');
  const [selectedRound, setSelectedRound] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [teams, setTeams] = useState([]);
  const [matches, setMatches] = useState([]);
  const [events, setEvents] = useState([]);
  const [playersList, setPlayersList] = useState([]);

  const [isExportingPDF, setIsExportingPDF] = useState(false);

  useEffect(() => {
    loadLeaguesAndData();
  }, [orgId]);

  const loadLeaguesAndData = async () => {
    const fetched = await getActiveOrgLeagues(orgId);
    setActiveLeagues(fetched);
    if (fetched.length > 0 && !selectedLeague) {
      setSelectedLeague(fetched[0].name);
    }
    fetchData(fetched);
  };

  const fetchData = async (leaguesList = activeLeagues) => {
    setLoading(true);
    try {
      const dbClient = supabaseAdmin || supabase;

      // 1. Fetch Teams
      let teamsQuery = dbClient.from('teams').select('*');
      if (orgId) {
        teamsQuery = applyOrgAndCollabFilter(teamsQuery, orgId, leaguesList);
      }
      const { data: teamsData } = await teamsQuery;
      setTeams(teamsData || []);

      // 2. Fetch Matches
      let matchesQuery = dbClient.from('matches').select('*');
      if (orgId) {
        matchesQuery = applyOrgAndCollabFilter(matchesQuery, orgId, leaguesList);
      }
      const { data: matchesData } = await matchesQuery;
      setMatches(matchesData || []);

      // 3. Fetch Events (yellow and red cards)
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

      // 4. Fetch Players for fallback info
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

  const matchMap = {};
  matches.forEach(m => {
    matchMap[m.id] = m;
  });

  const playerAppMap = {};
  playersList.forEach(p => {
    playerAppMap[p.id] = p;
  });

  const teamMap = {};
  teams.forEach(t => {
    teamMap[t.id] = t;
  });

  // Dynamic rounds for active selected league
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

      // 1. League Filter
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
          photoUrl: photoUrl || '',
          playerNumber: playerNumber ? `#${playerNumber}` : '',
          teamId: e.team_id,
          teamName: eventTeam?.name || 'Noma\'lum jamoa',
          teamLogo: eventTeam?.logo_url || '',
          yellowCards: 0,
          redCards: 0,
          totalCards: 0
        };
      }

      if (e.event_type === 'yellow_card') {
        cardMap[e.player_id].yellowCards += 1;
        cardMap[e.player_id].totalCards += 1;
      } else if (e.event_type === 'red_card') {
        cardMap[e.player_id].redCards += 1;
        cardMap[e.player_id].totalCards += 1;
      }
    });

    let list = Object.values(cardMap);

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

  // Export Clean PDF
  const handleExportPDF = async () => {
    if (isExportingPDF) return;
    setIsExportingPDF(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const fontLoaded = await loadRobotoFont(doc);

      const titleText = `${selectedLeague} — ${selectedRound === 'all' ? 'Barcha Turlar' : `${selectedRound}-tur`} Kartochkalar Ro'yxati`;
      const orgName = currentOrg?.name || 'Havas Futbol Ligasi';

      // Header Banner
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, 210, 24, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(13);
      doc.setFont(fontLoaded ? 'Roboto' : 'helvetica', 'bold');
      doc.text(titleText, 14, 11);

      doc.setFontSize(8.5);
      doc.setFont(fontLoaded ? 'Roboto' : 'helvetica', 'normal');
      doc.setTextColor(148, 163, 184);
      const dateStr = new Date().toLocaleDateString('uz-UZ', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      doc.text(`Tashkilot: ${orgName}  |  Sana: ${dateStr}`, 14, 18);

      // AutoTable data
      const tableRows = processedCardPlayers.map((p, idx) => [
        idx + 1,
        p.name,
        p.playerNumber || '-',
        p.teamName,
        p.yellowCards > 0 ? `${p.yellowCards}` : '-',
        p.redCards > 0 ? `${p.redCards}` : '-',
        `${p.totalCards}`
      ]);

      doc.autoTable({
        head: [['#', "O'yinchi (F.I.Sh)", 'Forma', 'Jamoa', 'Sariq (🟨)', 'Qizil (🟥)', 'Jami']],
        body: tableRows,
        startY: 30,
        theme: 'grid',
        styles: {
          font: fontLoaded ? 'Roboto' : 'helvetica',
          fontSize: 8.5,
          cellPadding: 2.5,
          textColor: [15, 23, 42],
          valign: 'middle',
          overflow: 'linebreak'
        },
        headStyles: {
          fillColor: [30, 41, 59],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'center'
        },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 62, halign: 'left' },
          2: { cellWidth: 16, halign: 'center' },
          3: { cellWidth: 58, halign: 'left' },
          4: { cellWidth: 16, halign: 'center' },
          5: { cellWidth: 16, halign: 'center' },
          6: { cellWidth: 12, halign: 'center' }
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252]
        },
        margin: { left: 10, right: 10 }
      });

      doc.save(`kartochkalar_${selectedLeague}_tur_${selectedRound}.pdf`);
    } catch (err) {
      console.error('PDF export error:', err);
      alert('PDF yaratishda xatolik yuz berdi: ' + err.message);
    } finally {
      setIsExportingPDF(false);
    }
  };

  if (loading) {
    return (
      <div className="cards-page">
        <div className="cards-header">
          <div className="skeleton-pulse skeleton-title" style={{ width: '160px', height: '30px' }}></div>
        </div>
        <div className="skeleton-pulse skeleton-filter-box" style={{ height: '80px', borderRadius: '12px', marginBottom: '14px' }}></div>
        <div className="cards-table-card">
          <div className="skeleton-pulse" style={{ height: '350px', width: '100%' }}></div>
        </div>
      </div>
    );
  }

  return (
    <div className="cards-page">
      {/* Header with Title and PDF Export Button */}
      <div className="cards-header">
        <div className="cards-title-box">
          <ShieldAlert size={24} className="cards-title-icon" />
          <h1>Kartochkalar</h1>
        </div>
        <button 
          className="btn-export-pdf"
          onClick={handleExportPDF}
          disabled={isExportingPDF}
        >
          <FileText size={15} />
          <span>{isExportingPDF ? 'Yuklanmoqda...' : 'PDF Yuklab Olish'}</span>
        </button>
      </div>

      {/* Filter & Controls Card */}
      <div className="cards-filter-card">
        <div className="cards-filter-row">
          {/* League Filter */}
          <div className="filter-field">
            <label>Liga</label>
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
            <label>Tur</label>
            <div className="custom-select-wrapper">
              <select value={selectedRound} onChange={(e) => setSelectedRound(e.target.value)}>
                <option value="all">Barcha turlar</option>
                {roundOptions.map(r => (
                  <option key={r} value={r}>{r}-tur</option>
                ))}
              </select>
            </div>
          </div>

          {/* Search Input */}
          <div className="filter-field">
            <label>Qidiruv</label>
            <div className="filter-search-box">
              <Search size={15} className="filter-search-icon" />
              <input
                type="text"
                className="filter-search-input"
                placeholder="Ism, forma yoki jamoa..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Table: No side scroll, ample room for names, team below name, crisp dividers */}
      <div className="cards-table-card">
        {processedCardPlayers.length === 0 ? (
          <div className="cards-empty-container">
            <div className="cards-empty-icon">
              <ShieldCheck size={30} />
            </div>
            <h3>Kartochkalar mavjud emas</h3>
            <p>
              {selectedRound === 'all' 
                ? `${selectedLeague}da kartochka olgan o'yinchilar yo'q.`
                : `${selectedLeague} ${selectedRound}-turida kartochkalar qayd etilmagan.`
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
                </tr>
              </thead>
              <tbody>
                {processedCardPlayers.map((player, idx) => (
                  <tr key={player.id || idx}>
                    <td className="td-rank">
                      <span className={`rank-pill ${idx === 0 ? 'top-1' : idx === 1 ? 'top-2' : idx === 2 ? 'top-3' : ''}`}>
                        {idx + 1}
                      </span>
                    </td>

                    <td className="td-player">
                      <div className="player-info-compound">
                        {/* Player Photo (Never falls back to team logo) */}
                        <img 
                          src={player.photoUrl || DEFAULT_PLAYER_AVATAR}
                          alt=""
                          className="player-avatar"
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = DEFAULT_PLAYER_AVATAR;
                          }}
                        />
                        <div className="player-text-details">
                          {/* Top Line: Player Name + Kit Number */}
                          <div className="player-top-line">
                            <span className="player-full-name">{player.name}</span>
                            {player.playerNumber && (
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
