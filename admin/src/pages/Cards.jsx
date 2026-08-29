import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useOrg } from '../context/OrgContext';
import { getActiveOrgLeagues, applyOrgAndCollabFilter } from '../utils/leagueUtils';
import { 
  ShieldAlert, 
  Search, 
  ShieldCheck, 
  FileText,
  X,
  Calendar,
  Clock
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import './Cards.css';

const DEFAULT_PLAYER_AVATAR = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40' fill='%2364748b'%3E%3Cpath d='M20 20a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm0 4c-7.33 0-14 3.67-14 11v2h28v-2c0-7.33-6.67-11-14-11z'/%3E%3C/svg%3E";
const DEFAULT_TEAM_LOGO = "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=100&auto=format&fit=crop&q=80";

// Transliterates Uzbek Cyrillic text to Latin to prevent corrupt characters in jsPDF
function cyrillicToLatin(text) {
  if (!text || typeof text !== 'string') return '';
  const map = {
    'А': 'A', 'а': 'a', 'Б': 'B', 'б': 'b', 'В': 'V', 'в': 'v', 'Г': 'G', 'г': 'g',
    'Д': 'D', 'д': 'd', 'Е': 'E', 'е': 'e', 'Ё': 'Yo', 'ё': 'yo', 'Ж': 'Zh', 'ж': 'zh',
    'З': 'Z', 'з': 'z', 'И': 'I', 'и': 'i', 'Й': 'Y', 'й': 'y', 'К': 'K', 'к': 'k',
    'Л': 'L', 'л': 'l', 'М': 'M', 'м': 'm', 'Н': 'N', 'н': 'n', 'О': 'O', 'о': 'o',
    'П': 'P', 'п': 'p', 'Р': 'R', 'р': 'r', 'С': 'S', 'с': 's', 'Т': 'T', 't': 't',
    'У': 'U', 'у': 'u', 'Ф': 'F', 'ф': 'f', 'Х': 'Kh', 'х': 'kh', 'Ц': 'Ts', 'ц': 'ts',
    'Ч': 'Ch', 'ch': 'ch', 'Ш': 'Sh', 'sh': 'sh', 'Щ': 'Shch', 'щ': 'shch', 'Ъ': '', 'ъ': '',
    'Ы': 'I', 'ы': 'i', 'Ь': '', 'ь': '', 'Э': 'E', 'э': 'e', 'Ю': 'Yu', 'ю': 'yu',
    'Я': 'Ya', 'я': 'ya', 'Ў': "O'", 'ў': "o'", 'Қ': 'Q', 'қ': 'q', 'Ғ': "G'", 'ғ': "g'",
    'Ҳ': 'H', 'ҳ': 'h'
  };
  return text.split('').map(char => map[char] || char).join('');
}

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
  const [selectedPlayerModal, setSelectedPlayerModal] = useState(null);
  const [modalEvents, setModalEvents] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);

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
      const dbClient = supabase || supabase;

      // 1. Fetch Teams (Lightweight)
      let teamsQuery = dbClient.from('teams').select('id, name, logo_url, league');
      if (orgId) {
        teamsQuery = applyOrgAndCollabFilter(teamsQuery, orgId, leaguesList);
      }
      const { data: teamsData } = await teamsQuery;
      setTeams(teamsData || []);

      // 2. Fetch Matches (Lightweight)
      let matchesQuery = dbClient.from('matches').select('id, round, league, organization_id');
      if (orgId) {
        matchesQuery = applyOrgAndCollabFilter(matchesQuery, orgId, leaguesList);
      }
      const { data: matchesData } = await matchesQuery;
      setMatches(matchesData || []);

      // 3. Fetch Events (Lightweight: NO deep joins upfront!)
      const { data: eventsData, error: eventsError } = await dbClient
        .from('match_events')
        .select('id, event_type, player_id, team_id, match_id')
        .in('event_type', ['yellow_card', 'red_card']);

      let loadedEvents = eventsData || [];
      setEvents(loadedEvents);

      // 4. Fetch Players for fallback info (Lightweight)
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

  // Fetch player match card events on-demand ONLY when modal is opened
  const handlePlayerClick = async (player) => {
    setSelectedPlayerModal(player);
    setModalLoading(true);
    setModalEvents([]);

    try {
      const pId = String(player.id);
      const { data } = await supabase
        .from('match_events')
        .select(`
          id, 
          event_type, 
          minute, 
          match:match_id(
            id, round, league, match_date, match_time, home_score, away_score, 
            home_team_id, away_team_id,
            home_team:home_team_id(id, name, logo_url), 
            away_team:away_team_id(id, name, logo_url)
          )
        `)
        .eq('player_id', pId)
        .in('event_type', ['yellow_card', 'red_card']);

      if (data && data.length > 0) {
        const formatted = data.map((e) => {
          const m = e.match || matchMap[e.match_id] || matchMap[String(e.match_id)] || {};
          const homeTeamObj = (typeof m.home_team === 'object' && m.home_team) || teamMap[m.home_team_id] || teamMap[String(m.home_team_id)];
          const awayTeamObj = (typeof m.away_team === 'object' && m.away_team) || teamMap[m.away_team_id] || teamMap[String(m.away_team_id)];

          const homeTeamName = homeTeamObj?.name || m.home_team_name || "1-jamoa";
          const homeTeamLogo = homeTeamObj?.logo_url || "";
          const awayTeamName = awayTeamObj?.name || m.away_team_name || "2-jamoa";
          const awayTeamLogo = awayTeamObj?.logo_url || "";

          const roundMatch = String(m.round || m.tour || '').match(/\d+/);
          const roundNum = roundMatch ? parseInt(roundMatch[0], 10) : 0;
          const dateStr = m.match_date || '';
          const timeStr = m.match_time || '';
          let formattedDate = '';
          if (dateStr) {
            try {
              const d = new Date(dateStr);
              formattedDate = d.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
            } catch { formattedDate = dateStr; }
          }
          let formattedTime = '';
          if (timeStr) {
            formattedTime = timeStr.slice(0, 5);
          }

          const hasScore = m.home_score !== null && m.home_score !== undefined && m.away_score !== null && m.away_score !== undefined;
          const homeScore = m.home_score ?? 0;
          const awayScore = m.away_score ?? 0;

          return {
            id: e.id,
            type: e.event_type,
            minute: e.minute,
            homeTeamName,
            homeTeamLogo,
            awayTeamName,
            awayTeamLogo,
            hasScore,
            homeScore,
            awayScore,
            league: m.league || '',
            round: roundNum > 0 ? `${roundNum}-tur` : '',
            date: formattedDate,
            time: formattedTime,
          };
        }).sort((a, b) => {
          const rA = parseInt(a.round) || 0;
          const rB = parseInt(b.round) || 0;
          return rA - rB;
        });

        setModalEvents(formatted);
      } else {
        setModalEvents([]);
      }
    } catch (err) {
      console.error('Error fetching player modal events:', err);
    } finally {
      setModalLoading(false);
    }
  };

  // PDF Export Modal State
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfLeague, setPdfLeague] = useState('all');
  const [pdfRound, setPdfRound] = useState('all');
  const [pdfTeamId, setPdfTeamId] = useState('all');

  // Available teams for PDF modal (dynamically filtered by selected PDF league)
  const pdfAvailableTeams = React.useMemo(() => {
    if (!pdfLeague || pdfLeague === 'all') return teams;
    return teams.filter(t => (t.league || '').toLowerCase().trim() === pdfLeague.toLowerCase().trim());
  }, [teams, pdfLeague]);

  // Filtered players list strictly for PDF Export according to selected modal filters
  const pdfFilteredPlayers = React.useMemo(() => {
    const cardMap = {};

    events.forEach((e) => {
      if (!e.player_id) return;
      if (e.event_type !== 'yellow_card' && e.event_type !== 'red_card') return;

      const teamObj = teamMap[e.team_id] || teamMap[String(e.team_id)];
      const matchObj = matchMap[e.match_id] || matchMap[String(e.match_id)];

      // 1. League Filter
      const teamLeague = teamObj?.league || matchObj?.league || '';
      if (pdfLeague && pdfLeague !== 'all' && teamLeague.toLowerCase().trim() !== pdfLeague.toLowerCase().trim()) {
        return;
      }

      // 2. Round Filter
      if (pdfRound && pdfRound !== 'all') {
        const roundMatch = String(matchObj?.round || matchObj?.tour || '').match(/\d+/);
        const evRound = roundMatch ? parseInt(roundMatch[0], 10) : 0;
        if (evRound > 0 && String(evRound) !== String(pdfRound)) {
          return;
        }
      }

      // 3. Team Filter
      if (pdfTeamId && pdfTeamId !== 'all') {
        if (String(e.team_id) !== String(pdfTeamId)) {
          return;
        }
      }

      const pId = String(e.player_id);
      if (!cardMap[pId]) {
        const appInfo = playerAppMap[pId];
        const firstName = appInfo?.first_name || '';
        const lastName = appInfo?.last_name || '';
        const fullName = `${firstName} ${lastName}`.trim() || `O'yinchi #${pId.slice(0, 5)}`;
        const photoUrl = appInfo?.photo_url || '';
        const playerNumber = appInfo?.player_number || '';
        const teamName = teamObj?.name || `Jamoa #${e.team_id ? String(e.team_id).slice(0, 5) : '?'}`;

        cardMap[pId] = {
          id: pId,
          name: fullName,
          photoUrl,
          playerNumber: playerNumber ? String(playerNumber) : '',
          teamId: e.team_id,
          teamName,
          teamLogo: teamObj?.logo_url,
          yellowCards: 0,
          redCards: 0,
          totalCards: 0,
        };
      }

      if (e.event_type === 'yellow_card') {
        cardMap[pId].yellowCards += 1;
      } else if (e.event_type === 'red_card') {
        cardMap[pId].redCards += 1;
      }
      cardMap[pId].totalCards = cardMap[pId].yellowCards + cardMap[pId].redCards;
    });

    const list = Object.values(cardMap).filter((p) => p.totalCards > 0);
    list.sort((a, b) => {
      if (b.redCards !== a.redCards) return b.redCards - a.redCards;
      if (b.yellowCards !== a.yellowCards) return b.yellowCards - a.yellowCards;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [events, teamMap, matchMap, playerAppMap, pdfLeague, pdfRound, pdfTeamId]);

  // Open PDF Modal
  const handleOpenPdfModal = () => {
    setPdfLeague(selectedLeague || 'all');
    setPdfRound(selectedRound || 'all');
    setPdfTeamId('all');
    setShowPdfModal(true);
  };

  // Execute PDF Export
  const executeExportPDF = () => {
    if (isExportingPDF) return;
    setIsExportingPDF(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();

      const leagueTitle = pdfLeague === 'all' ? 'Barcha Ligalar' : pdfLeague;
      const roundTitle = pdfRound === 'all' ? 'Barcha turlar' : `${pdfRound}-tur`;
      const selectedTeamObj = teams.find(t => String(t.id) === String(pdfTeamId));
      const teamTitle = pdfTeamId === 'all' ? 'Barcha jamoalar' : (selectedTeamObj?.name || 'Jamoa');

      const titleText = `${cyrillicToLatin(leagueTitle)} - ${cyrillicToLatin(roundTitle)} - ${cyrillicToLatin(teamTitle)}`;
      const orgName = cyrillicToLatin(currentOrg?.name || 'Havas Futbol Ligasi');

      // Top Banner
      doc.setFillColor(15, 23, 42); // #0f172a
      doc.rect(0, 0, pageWidth, 22, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(titleText, 14, 10);

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);
      const dateStr = new Date().toLocaleDateString('uz-UZ', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      doc.text(`Tashkilot: ${orgName}  |  Sana: ${dateStr}`, 14, 17);

      // AutoTable data with safe latin characters
      const tableRows = pdfFilteredPlayers.map((p, idx) => [
        idx + 1,
        cyrillicToLatin(p.name),
        p.playerNumber || '—',
        cyrillicToLatin(p.teamName),
        p.yellowCards > 0 ? String(p.yellowCards) : '0',
        p.redCards > 0 ? String(p.redCards) : '0',
        String(p.totalCards)
      ]);

      if (tableRows.length === 0) {
        tableRows.push(['—', 'Tanlangan parametrlar boyicha kartochkalar mavjud emas', '—', '—', '0', '0', '0']);
      }

      autoTable(doc, {
        head: [['#', "O'yinchi (F.I.Sh)", 'Forma', 'Jamoa', 'Sariq', 'Qizil', 'Jami']],
        body: tableRows,
        startY: 28,
        theme: 'grid',
        styles: {
          font: 'helvetica',
          fontSize: 8.5,
          cellPadding: 2.5,
          textColor: [15, 23, 42],
          valign: 'middle',
          overflow: 'linebreak'
        },
        headStyles: {
          fillColor: [30, 41, 59], // #1e293b
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'center'
        },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' }, // #
          1: { cellWidth: 62, halign: 'left' },   // Name
          2: { cellWidth: 16, halign: 'center' }, // Kit number
          3: { cellWidth: 58, halign: 'left' },   // Team
          4: { cellWidth: 16, halign: 'center' }, // Yellow
          5: { cellWidth: 16, halign: 'center' }, // Red
          6: { cellWidth: 12, halign: 'center' }  // Total
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252]
        },
        margin: { left: 10, right: 10 }
      });

      doc.save(`kartochkalar_${leagueTitle}_tur_${roundTitle}.pdf`);
      setShowPdfModal(false);
    } catch (err) {
      console.error('PDF export error:', err);
      alert('PDF yuklab olishda xatolik: ' + err.message);
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
          onClick={handleOpenPdfModal}
          disabled={isExportingPDF}
        >
          <FileText size={15} />
          <span>{'PDF Yuklab Olish'}</span>
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
                  <tr 
                    key={player.id || idx}
                    onClick={() => handlePlayerClick(player)}
                    className="cards-clickable-row"
                    title="Batafsil ma'lumotlarni ko'rish"
                  >
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

      {/* Player Detail Modal */}
      {selectedPlayerModal && (
        <div className="cards-modal-overlay" onClick={() => setSelectedPlayerModal(null)}>
          <div className="cards-modal-box" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="cards-modal-header">
              <div className="cards-modal-player-left">
                <img
                  src={selectedPlayerModal.photoUrl || DEFAULT_PLAYER_AVATAR}
                  alt=""
                  className="cards-modal-player-avatar"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = DEFAULT_PLAYER_AVATAR;
                  }}
                />
                <div className="cards-modal-player-details">
                  <div className="cards-modal-player-name-row">
                    <span className="cards-modal-player-name">{selectedPlayerModal.name}</span>
                    {selectedPlayerModal.playerNumber && (
                      <span className="cards-modal-kit-badge">{selectedPlayerModal.playerNumber}</span>
                    )}
                  </div>
                  <div className="cards-modal-player-team-row">
                    {selectedPlayerModal.teamLogo && (
                      <img src={selectedPlayerModal.teamLogo} alt="" className="cards-modal-team-logo" />
                    )}
                    <span className="cards-modal-team-name">{selectedPlayerModal.teamName}</span>
                  </div>
                </div>
              </div>

              <button className="cards-modal-close-btn" onClick={() => setSelectedPlayerModal(null)}>
                <X size={20} />
              </button>
            </div>

            {/* Modal KPI Row */}
            <div className="cards-modal-kpi-row">
              <div className="cards-modal-kpi-box yellow">
                <span className="kpi-num yellow">{selectedPlayerModal.yellowCards}</span>
                <span className="kpi-label">Sariq kartochka</span>
              </div>
              <div className="cards-modal-kpi-box red">
                <span className="kpi-num red">{selectedPlayerModal.redCards}</span>
                <span className="kpi-label">Qizil kartochka</span>
              </div>
            </div>

            {/* Modal Events Section */}
            <div className="cards-modal-events-title">Qayd etilgan kartochkalar</div>
            <div className="cards-modal-events-list">
              {modalLoading ? (
                <div className="cards-modal-empty-events">O'yin ma'lumotlari yuklanmoqda...</div>
              ) : modalEvents.length === 0 ? (
                <div className="cards-modal-empty-events">Kartochkalar tafsilotlari topilmadi</div>
              ) : (
                modalEvents.map((ev, idx) => {
                  const isYellow = ev.type === 'yellow_card';
                  return (
                    <div key={ev.id || idx} className={`cards-modal-match-card ${isYellow ? 'yellow-border' : 'red-border'}`}>
                      {/* Match Top Bar */}
                      <div className="match-card-top-bar">
                        <span className="match-card-round-badge">{ev.round || (ev.league ? ev.league : "O'yin")}</span>
                        <div className="match-card-datetime">
                          {ev.date && (
                            <span className="datetime-item">
                              <Calendar size={13} /> {ev.date}
                            </span>
                          )}
                          {ev.time && (
                            <span className="datetime-item">
                              <Clock size={13} /> {ev.time}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Teams Row */}
                      <div className="match-card-teams-row">
                        <div className="match-card-team-col">
                          {ev.homeTeamLogo ? (
                            <img src={ev.homeTeamLogo} alt="" className="match-card-team-logo" />
                          ) : (
                            <div className="match-card-team-placeholder" />
                          )}
                          <span className="match-card-team-name">{ev.homeTeamName}</span>
                        </div>

                        <div className="match-card-score-box">
                          {ev.hasScore ? (
                            <span className="match-card-score-val">{ev.homeScore} : {ev.awayScore}</span>
                          ) : (
                            <span className="match-card-vs-val">VS</span>
                          )}
                        </div>

                        <div className="match-card-team-col">
                          {ev.awayTeamLogo ? (
                            <img src={ev.awayTeamLogo} alt="" className="match-card-team-logo" />
                          ) : (
                            <div className="match-card-team-placeholder" />
                          )}
                          <span className="match-card-team-name">{ev.awayTeamName}</span>
                        </div>
                      </div>

                      {/* Bottom Banner with Minute */}
                      <div className={`match-card-bottom-banner ${isYellow ? 'yellow-banner' : 'red-banner'}`}>
                        <span className="banner-card-badge">{isYellow ? '🟨' : '🟥'}</span>
                        <span className="banner-card-text">
                          {isYellow ? 'Sariq kartochka' : 'Qizil kartochka'}
                          {ev.minute ? ` — ${ev.minute}'-daqiqada` : ''}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* PDF Export Filter Modal */}
      {showPdfModal && (
        <div className="cards-modal-overlay" onClick={() => setShowPdfModal(false)}>
          <div className="cards-modal-box pdf-export-box" onClick={(e) => e.stopPropagation()}>
            <div className="cards-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={22} color="#38bdf8" />
                <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '18px', fontWeight: 800 }}>PDF Eksport parametrlari</h3>
              </div>
              <button className="cards-modal-close-btn" onClick={() => setShowPdfModal(false)}>
                <X size={20} />
              </button>
            </div>

            <p style={{ color: '#94a3b8', fontSize: '13px', margin: '4px 0 16px 0', lineHeight: 1.5 }}>
              Kerakli liga, tur va jamoani tanlab, mos kartochkalar hisobotini PDF formatda yuklab oling.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
              {/* League Selector */}
              <div className="filter-field">
                <label style={{ color: '#cbd5e1', fontSize: '12.5px', fontWeight: 700, marginBottom: '4px', display: 'block' }}>1. Liga</label>
                <select
                  className="filter-select"
                  style={{ width: '100%', height: '42px', backgroundColor: '#1e293b', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: '10px', padding: '0 12px' }}
                  value={pdfLeague}
                  onChange={(e) => {
                    setPdfLeague(e.target.value);
                    setPdfTeamId('all'); // reset team when league changes
                  }}
                >
                  <option value="all">Barcha ligalar</option>
                  {activeLeagues.map((l) => (
                    <option key={l.id} value={l.name}>{l.name}</option>
                  ))}
                </select>
              </div>

              {/* Round Selector */}
              <div className="filter-field">
                <label style={{ color: '#cbd5e1', fontSize: '12.5px', fontWeight: 700, marginBottom: '4px', display: 'block' }}>2. Tur</label>
                <select
                  className="filter-select"
                  style={{ width: '100%', height: '42px', backgroundColor: '#1e293b', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: '10px', padding: '0 12px' }}
                  value={pdfRound}
                  onChange={(e) => setPdfRound(e.target.value)}
                >
                  <option value="all">Barcha turlar</option>
                  {roundsList.map((r) => (
                    <option key={r} value={r}>{r}-tur</option>
                  ))}
                </select>
              </div>

              {/* Team Selector */}
              <div className="filter-field">
                <label style={{ color: '#cbd5e1', fontSize: '12.5px', fontWeight: 700, marginBottom: '4px', display: 'block' }}>3. Jamoa</label>
                <select
                  className="filter-select"
                  style={{ width: '100%', height: '42px', backgroundColor: '#1e293b', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: '10px', padding: '0 12px' }}
                  value={pdfTeamId}
                  onChange={(e) => setPdfTeamId(e.target.value)}
                >
                  <option value="all">Barcha jamoalar</option>
                  {pdfAvailableTeams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Results Count Preview */}
            <div style={{ padding: '10px 14px', borderRadius: '10px', backgroundColor: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.25)', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <ShieldAlert size={18} color="#38bdf8" />
              <span style={{ fontSize: '13px', color: '#e2e8f0' }}>
                Tanlangan parametrlar bo'yicha: <strong style={{ color: '#38bdf8' }}>{pdfFilteredPlayers.length} nafar o'yinchi</strong>
              </span>
            </div>

            {/* Download Button */}
            <button
              className="btn-export-pdf"
              style={{ width: '100%', height: '46px', justifyContent: 'center', fontSize: '14px', borderRadius: '12px' }}
              onClick={executeExportPDF}
              disabled={isExportingPDF}
            >
              <FileText size={18} />
              <span>{isExportingPDF ? 'Hujjat yaratilmoqda...' : 'PDF Yuklab Olish'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
