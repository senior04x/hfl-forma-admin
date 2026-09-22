import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useOrg } from '../context/OrgContext';
import { getActiveOrgLeagues } from '../utils/leagueUtils';
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
import { getActiveOrgTournaments } from '../utils/tournamentUtils';
import { CARD_PAGE_SIZE, loadCardPage } from '../utils/cardsData';

const DEFAULT_PLAYER_AVATAR = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40' fill='%2364748b'%3E%3Cpath d='M20 20a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm0 4c-7.33 0-14 3.67-14 11v2h28v-2c0-7.33-6.67-11-14-11z'/%3E%3C/svg%3E";

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

  const [loading, setLoading] = useState(false);
  const [activeLeagues, setActiveLeagues] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [mode, setMode] = useState('league');
  const [selectedLeague, setSelectedLeague] = useState('');
  const [selectedTournament, setSelectedTournament] = useState('');
  const [selectedRound, setSelectedRound] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [processedCardPlayers, setPlayers] = useState([]);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [catalogOrg, setCatalogOrg] = useState(null);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [selectedPlayerModal, setSelectedPlayerModal] = useState(null);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const exportAbort = React.useRef(null);

  const competition = mode === 'league'
    ? activeLeagues.find(item => item.name === selectedLeague)
    : tournaments.find(item => String(item.id) === String(selectedTournament));
  const competitionTitle = competition?.name || '';
  const scope = React.useMemo(() => ({ orgId, competition, mode, round: selectedRound }),
    [orgId, competition, mode, selectedRound]);

  useEffect(() => {
    let cancelled = false;
    setCatalogOrg(null);
    setPlayers([]);
    setEvents([]);
    setSelectedPlayerModal(null);
    setShowPdfModal(false);
    setPage(0);
    if (!orgId) return;
    Promise.all([getActiveOrgLeagues(orgId), getActiveOrgTournaments(orgId)])
      .then(([leagues, cups]) => {
        if (cancelled) return;
        setActiveLeagues(leagues);
        setTournaments(cups);
        setSelectedLeague(leagues[0]?.name || '');
        setSelectedTournament(cups[0]?.id || '');
        setSelectedRound('all');
        setCatalogOrg(orgId);
      }).catch(() => {
        if (!cancelled) setError("Musobaqalarni yuklab bo'lmadi.");
      });
    return () => { cancelled = true; };
  }, [orgId]);

  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchQuery); setPage(0); }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const controller = new AbortController();
    setPlayers([]);
    setEvents([]);
    setHasNext(false);
    setError('');
    setSelectedPlayerModal(null);
    if (!competition || catalogOrg !== orgId) { setLoading(false); return; }
    setLoading(true);
    loadCardPage(supabase, scope, page, search, controller.signal)
      .then(result => {
        if (controller.signal.aborted) return;
        setPlayers(result.players);
        setEvents(result.events);
        setHasNext(result.hasNext);
      }).catch(() => {
        if (!controller.signal.aborted) setError("Kartochkalarni yuklab bo'lmadi. Qayta urinib ko'ring.");
      }).finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [scope, competition, catalogOrg, orgId, page, search, retry]);

  useEffect(() => () => exportAbort.current?.abort(), [scope, search]);

  const modalLoading = false;
  const modalEvents = events.filter(event => event.player_id === selectedPlayerModal?.id).map(event => {
    const match = event.match || {};
    return {
      id: event.id, type: event.event_type, minute: event.minute,
      homeTeamName: match.home_team?.name || '1-jamoa',
      homeTeamLogo: match.home_team?.logo_url,
      awayTeamName: match.away_team?.name || '2-jamoa',
      awayTeamLogo: match.away_team?.logo_url,
      hasScore: match.home_score != null && match.away_score != null,
      homeScore: match.home_score, awayScore: match.away_score,
      league: competitionTitle, round: match.round ? match.round + '-tur' : '',
      date: match.match_date ? new Date(match.match_date).toLocaleDateString('uz-UZ') : '',
      time: match.match_time?.slice(0, 5) || '',
    };
  });
  const handlePlayerClick = player => setSelectedPlayerModal(player);
  const handleOpenPdfModal = () => setShowPdfModal(true);

  // Execute PDF Export
  const executeExportPDF = async () => {
    if (isExportingPDF || !competition) return;
    setIsExportingPDF(true);
    const controller = new AbortController();
    exportAbort.current = controller;
    try {
      const pdfFilteredPlayers = [];
      for (let exportPage = 0; ; exportPage++) {
        const result = await loadCardPage(supabase, scope, exportPage, search, controller.signal);
        if (controller.signal.aborted) return;
        pdfFilteredPlayers.push(...result.players);
        if (!result.hasNext) break;
      }
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();

      const leagueTitle = competitionTitle;
      const roundTitle = selectedRound === 'all' ? 'Barcha turlar' : selectedRound + '-tur';
      const titleText = cyrillicToLatin(leagueTitle + ' - ' + roundTitle);
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
      if (!controller.signal.aborted) alert('PDF yuklab olishda xatolik. Qayta urinib ko‘ring.');
    } finally {
      setIsExportingPDF(false);
    }
  };

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
          disabled={isExportingPDF || loading || !competition}
        >
          <FileText size={15} />
          <span>{'PDF Yuklab Olish'}</span>
        </button>
      </div>

      {/* Filter & Controls Card */}
      <div className="cards-filter-card">
        <div className="cards-filter-row">
          <div className="filter-field">
            <label>Musobaqa turi</label>
            <div className="custom-select-wrapper">
              <select value={mode} onChange={e => { setMode(e.target.value); setSelectedRound('all'); setPage(0); }}>
                <option value="league">Liga</option>
                <option value="tournament">Turnir</option>
              </select>
            </div>
          </div>
          {/* Competition Filter */}
          <div className="filter-field">
            <label>{mode === 'league' ? 'Liga' : 'Turnir'}</label>
            <div className="custom-select-wrapper">
              <select value={mode === 'league' ? selectedLeague : selectedTournament} onChange={e => {
                if (mode === 'league') setSelectedLeague(e.target.value);
                else setSelectedTournament(e.target.value);
                setSelectedRound('all'); setPage(0);
              }}>
                {(mode === 'league' ? activeLeagues : tournaments).map(item => (
                  <option key={item.id} value={mode === 'league' ? item.name : item.id}>
                    {item.name} {item.isCollab ? '(Co-Host)' : ''}
                  </option>
                ))}
                {!(mode === 'league' ? activeLeagues : tournaments).length && <option value="">Musobaqalar yo'q</option>}
              </select>
            </div>
          </div>
          <div className="filter-field">
            <label htmlFor="cards-round">Tur (bo'sh — barcha turlar)</label>
            <input id="cards-round" className="filter-search-input" type="number" min="1" step="1"
              value={selectedRound === 'all' ? '' : selectedRound} placeholder="Barcha turlar"
              onChange={e => {
                const value = e.target.value;
                if (!value || /^[1-9]\d*$/.test(value)) { setSelectedRound(value || 'all'); setPage(0); }
              }} />
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
        {loading ? <div className="cards-empty-container" role="status">Yuklanmoqda...</div> : error ? (
          <div className="cards-empty-container" role="alert">{error}<button onClick={() => setRetry(value => value + 1)}>Qayta urinish</button></div>
        ) : processedCardPlayers.length === 0 ? (
          <div className="cards-empty-container">
            <div className="cards-empty-icon">
              <ShieldCheck size={30} />
            </div>
            <h3>Kartochkalar mavjud emas</h3>
            <p>
              {selectedRound === 'all' 
                ? `${competitionTitle}da kartochka olgan o'yinchilar yo'q.`
                : `${competitionTitle} ${selectedRound}-turida kartochkalar qayd etilmagan.`
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
                      <span className="rank-pill">
                        {page * CARD_PAGE_SIZE + idx + 1}
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

      <div className="cards-pagination" aria-label="Sahifalash">
        <button disabled={loading || page === 0} onClick={() => setPage(value => value - 1)}>Oldingi</button>
        <span>{page + 1}-sahifa · {CARD_PAGE_SIZE} tadan · Familiya bo'yicha</span>
        <button disabled={loading || !hasNext} onClick={() => setPage(value => value + 1)}>Keyingi</button>
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

            <p className="cards-export-summary">
              {competitionTitle} · {selectedRound === 'all' ? 'Barcha turlar' : selectedRound + '-tur'}
              {search ? ' · Qidiruv: ' + search : ''}
              <br />Tanlangan filtrlar bo'yicha barcha sahifalar PDFga yuklanadi.
            </p>
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
