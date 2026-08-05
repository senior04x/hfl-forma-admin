import React, { useState, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { X, Download, Shield, Trophy, Users, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { fetchAllApplications, fetchAllTeams } from '../utils/supabaseHelpers';
import { useOrg } from '../context/OrgContext';
import './ExportPdfModal.css';

const ExportPdfModal = ({ isOpen, onClose, activeLeagues = [] }) => {
  const { orgId } = useOrg();

  // Export selection states
  const [leagueForLeagueExport, setLeagueForLeagueExport] = useState('');
  const [leagueForTeamExport, setLeagueForTeamExport] = useState('');
  const [teamIdForTeamExport, setTeamIdForTeamExport] = useState('');

  // Data states
  const [teams, setTeams] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadTeams();
    }
  }, [isOpen, orgId]);

  const loadTeams = async () => {
    setLoadingData(true);
    try {
      const activeNames = (activeLeagues || []).map(l => l.name);
      const allTeamsData = await fetchAllTeams('id, name, league, organization_id, captain_phone');
      const filtered = (allTeamsData || []).filter(t =>
        t.organization_id === orgId ||
        (t.league && t.league.split(',').some(l => activeNames.includes(l.trim()))) ||
        !orgId
      );
      setTeams(filtered);
    } catch (err) {
      console.error('Error loading teams for export:', err);
    } finally {
      setLoadingData(false);
    }
  };

  // Filtered teams for single team select based on leagueForTeamExport
  const availableTeamsForSingleExport = teams.filter(t => {
    if (!leagueForTeamExport) return true;
    if (!t.league) return false;
    return t.league.split(',').map(s => s.trim()).includes(leagueForTeamExport);
  });

  const getStatusLabel = (status) => {
    if (status === 'approved' || status === 'partially_approved') return 'Tasdiqlangan';
    if (status === 'rejected') return 'Rad etilgan';
    return 'Kutilmoqda';
  };

  const generatePDF = async (exportType) => {
    setGeneratingPdf(true);
    setStatusMessage('Ma\'lumotlar yuklanmoqda...');

    try {
      // 1. Fetch all applications without 1000 cap
      const allApps = await fetchAllApplications('*');
      const activeNames = (activeLeagues || []).map(l => l.name);
      const validTeamIds = new Set(teams.map(t => t.id));

      // Filter applications for current org / leagues
      let validApps = allApps
        .filter(app => !app.comment || !app.comment.includes('[PROFILE_UPDATE]'))
        .filter(app =>
          app.organization_id === orgId ||
          (app.team_id && validTeamIds.has(app.team_id)) ||
          !orgId
        );

      // Determine targeted teams & players based on exportType
      let targetTeams = [];
      let docTitle = '';
      let fileName = '';
      const dateStr = new Date().toISOString().split('T')[0];

      if (exportType === 'all') {
        targetTeams = [...teams];
        docTitle = 'BARCHA LIGALAR VA JAMOALAR O\'YINCHILARI RO\'YXATI';
        fileName = `Barcha_Jamoalar_Oyinchilari_${dateStr}.pdf`;
      } else if (exportType === 'league') {
        if (!leagueForLeagueExport) {
          alert('Iltimos, ligani tanlang!');
          setGeneratingPdf(false);
          return;
        }
        targetTeams = teams.filter(t =>
          t.league && t.league.split(',').map(s => s.trim()).includes(leagueForLeagueExport)
        );
        docTitle = `LIGA: ${leagueForLeagueExport.toUpperCase()} - JAMOALAR O'YINCHILARI RO'YXATI`;
        fileName = `Liga_${leagueForLeagueExport.replace(/\s+/g, '_')}_Jamoalari_${dateStr}.pdf`;
      } else if (exportType === 'team') {
        if (!teamIdForTeamExport) {
          alert('Iltimos, jamoani tanlang!');
          setGeneratingPdf(false);
          return;
        }
        const selectedTeam = teams.find(t => t.id === teamIdForTeamExport);
        if (selectedTeam) {
          targetTeams = [selectedTeam];
          docTitle = `JAMOA: ${selectedTeam.name.toUpperCase()} - O'YINCHILAR RO'YXATI`;
          fileName = `Jamoa_${selectedTeam.name.replace(/\s+/g, '_')}_Oyinchilari_${dateStr}.pdf`;
        }
      }

      if (targetTeams.length === 0) {
        alert('Tanlangan mezon bo\'yicha jamoalar topilmadi!');
        setGeneratingPdf(false);
        return;
      }

      setStatusMessage('PDF hujjat shakllantirilmoqda...');

      // 2. Initialize jsPDF
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      let currentY = 15;

      // Header Branding
      doc.setFillColor(15, 23, 42); // dark navy #0f172a
      doc.rect(0, 0, pageWidth, 26, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('AMATORA ORGANIZATSIYA', 14, 12);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(203, 213, 225);
      doc.text(docTitle, 14, 19);

      doc.setFontSize(8);
      doc.text(`Sana: ${new Date().toLocaleDateString('uz-UZ')}`, pageWidth - 14, 19, { align: 'right' });

      currentY = 32;

      // 3. Render Teams and Players tables
      let totalExportedPlayers = 0;

      targetTeams.forEach((team, teamIndex) => {
        const teamPlayers = validApps.filter(app => app.team_id === team.id);
        totalExportedPlayers += teamPlayers.length;

        // Check page space for team header
        if (currentY > 260) {
          doc.addPage();
          currentY = 15;
        }

        // Team Title Banner
        doc.setFillColor(241, 245, 249); // #f1f5f9
        doc.roundedRect(14, currentY, pageWidth - 28, 10, 2, 2, 'F');

        doc.setDrawColor(203, 213, 225);
        doc.roundedRect(14, currentY, pageWidth - 28, 10, 2, 2, 'S');

        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(`${teamIndex + 1}. JAMOA: ${team.name.toUpperCase()} (Liga: ${team.league || '—'})`, 18, currentY + 6.5);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text(`O'yinchilar: ${teamPlayers.length} ta`, pageWidth - 18, currentY + 6.5, { align: 'right' });

        currentY += 13;

        // Player Table Rows
        const tableBody = teamPlayers.map((p, idx) => [
          idx + 1,
          `${p.last_name || ''} ${p.first_name || ''} ${p.father_name || ''}`.trim() || '—',
          p.position || '—',
          p.player_number ? `#${p.player_number}` : '—',
          p.birth_date || '—',
          `${p.passport_series || ''}${p.passport_number || ''}` || '—',
          p.phone || '—',
          getStatusLabel(p.status)
        ]);

        if (tableBody.length === 0) {
          tableBody.push(['—', 'O\'yinchilar ro\'yxatdan o\'tmagan', '—', '—', '—', '—', '—', '—']);
        }

        autoTable(doc, {
          startY: currentY,
          head: [['№', 'F.I.SH', 'Pozitsiya', 'Raqam', 'Tug\'ilgan yili', 'Pasport', 'Telefon', 'Holati']],
          body: tableBody,
          margin: { left: 14, right: 14 },
          styles: {
            fontSize: 8,
            cellPadding: 2,
            font: 'helvetica',
            textColor: [51, 65, 85]
          },
          headStyles: {
            fillColor: [30, 41, 59],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            halign: 'left'
          },
          columnStyles: {
            0: { cellWidth: 10, halign: 'center' },
            1: { cellWidth: 46 },
            2: { cellWidth: 22 },
            3: { cellWidth: 15, halign: 'center' },
            4: { cellWidth: 24, halign: 'center' },
            5: { cellWidth: 24, halign: 'center' },
            6: { cellWidth: 24, halign: 'center' },
            7: { cellWidth: 17, halign: 'center' }
          },
          alternateRowStyles: {
            fillColor: [248, 250, 252]
          },
          didDrawPage: (data) => {
            // Footer page numbers
            const totalPages = doc.internal.getNumberOfPages();
            doc.setFontSize(8);
            doc.setTextColor(148, 163, 184);
            doc.text(
              `Sahifa ${data.pageNumber} / ${totalPages}`,
              pageWidth / 2,
              doc.internal.pageSize.getHeight() - 8,
              { align: 'center' }
            );
          }
        });

        currentY = doc.lastAutoTable.finalY + 8;
      });

      // Save PDF
      doc.save(fileName);
      setStatusMessage(`Muvaffaqiyatli yuklandi! Jami jamoalar: ${targetTeams.length}, O'yinchilar: ${totalExportedPlayers}`);
    } catch (err) {
      console.error('Error generating PDF:', err);
      alert('PDF yaratishda xatolik yuz berdi: ' + (err.message || ''));
    } finally {
      setGeneratingPdf(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="pdf-modal-overlay" onClick={onClose}>
      <div className="pdf-modal-card" onClick={e => e.stopPropagation()}>
        <div className="pdf-modal-header">
          <div className="pdf-modal-title">
            <FileText className="header-icon" size={22} />
            <div>
              <h3>O'yinchilar Ma'lumotlarini PDF Export Qilish</h3>
              <p>Formatlangan PDF hujjat ko'rinishida yuklab olish</p>
            </div>
          </div>
          <button className="close-pdf-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="pdf-modal-body">
          {loadingData ? (
            <div className="pdf-loading-state">
              <div className="spinner"></div>
              <p>Jamoalar ro'yxati yuklanmoqda...</p>
            </div>
          ) : (
            <div className="export-options-grid">
              {/* Option 1: Export ALL Teams */}
              <div className="export-option-card">
                <div className="option-header">
                  <Users className="option-icon text-emerald" size={24} />
                  <div>
                    <h4>1. Barcha Jamoalarni Yuklab Olish</h4>
                    <p>Barcha ligalardagi barcha jamoalar va o'yinchilar ro'yxati</p>
                  </div>
                </div>
                <div className="option-action">
                  <button
                    className="btn-export export-all"
                    onClick={() => generatePDF('all')}
                    disabled={generatingPdf}
                  >
                    <Download size={18} />
                    <span>{generatingPdf ? 'Shakllantirilmoqda...' : 'Barchasini PDF yuklash'}</span>
                  </button>
                </div>
              </div>

              {/* Option 2: Export by League */}
              <div className="export-option-card">
                <div className="option-header">
                  <Trophy className="option-icon text-amber" size={24} />
                  <div>
                    <h4>2. Liga Bo'yicha Yuklab Olish</h4>
                    <p>Tanlangan ligadagi barcha jamoalar va o'yinchilarni yuklaydi</p>
                  </div>
                </div>
                <div className="option-inputs">
                  <select
                    className="pdf-select"
                    value={leagueForLeagueExport}
                    onChange={(e) => setLeagueForLeagueExport(e.target.value)}
                  >
                    <option value="">-- Ligani tanlang --</option>
                    {activeLeagues.map(l => (
                      <option key={l.name} value={l.name}>{l.name}</option>
                    ))}
                  </select>
                </div>
                <div className="option-action">
                  <button
                    className="btn-export export-league"
                    onClick={() => generatePDF('league')}
                    disabled={generatingPdf || !leagueForLeagueExport}
                  >
                    <Download size={18} />
                    <span>Liganing barcha jamoalarini yuklash</span>
                  </button>
                </div>
              </div>

              {/* Option 3: Export Single Team */}
              <div className="export-option-card">
                <div className="option-header">
                  <Shield className="option-icon text-indigo" size={24} />
                  <div>
                    <h4>3. Bitta Jamoani Yuklab Olish</h4>
                    <p>Liga va jamoani tanlab faqat shu jamoa o'yinchilarini yuklaydi</p>
                  </div>
                </div>
                <div className="option-inputs dual">
                  <select
                    className="pdf-select"
                    value={leagueForTeamExport}
                    onChange={(e) => {
                      setLeagueForTeamExport(e.target.value);
                      setTeamIdForTeamExport('');
                    }}
                  >
                    <option value="">-- Ligani tanlang --</option>
                    {activeLeagues.map(l => (
                      <option key={l.name} value={l.name}>{l.name}</option>
                    ))}
                  </select>

                  <select
                    className="pdf-select"
                    value={teamIdForTeamExport}
                    onChange={(e) => setTeamIdForTeamExport(e.target.value)}
                    disabled={!leagueForTeamExport}
                  >
                    <option value="">-- Jamoani tanlang --</option>
                    {availableTeamsForSingleExport.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div className="option-action">
                  <button
                    className="btn-export export-team"
                    onClick={() => generatePDF('team')}
                    disabled={generatingPdf || !teamIdForTeamExport}
                  >
                    <Download size={18} />
                    <span>Tanlangan jamoani yuklash</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {statusMessage && (
            <div className="pdf-status-banner">
              <CheckCircle2 size={16} />
              <span>{statusMessage}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExportPdfModal;
