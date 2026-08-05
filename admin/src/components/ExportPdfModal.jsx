import React, { useState, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { X, Download, Shield, Trophy, Users, FileText, CheckCircle2 } from 'lucide-react';
import { fetchAllApplications, fetchAllTeams } from '../utils/supabaseHelpers';
import { useOrg } from '../context/OrgContext';
import './ExportPdfModal.css';

// Convert image URL to base64 for jsPDF
const loadImageAsBase64 = (url) => {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const dataURL = canvas.toDataURL('image/jpeg');
        resolve(dataURL);
      } catch (e) {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
};

// Helper to extract all metadata from player comment / object
const extractFullPlayerInfo = (p) => {
  let citizenship = p.citizenship || '';
  let height = p.height || '';
  let weight = p.weight || '';
  let instaUser = p.instagram_username || '';

  if (p.comment) {
    if (!instaUser) {
      const match = p.comment.match(/\[INSTAGRAM:https?:\/\/[^/]+\/([^/\]]+)/);
      if (match?.[1]) instaUser = match[1];
    }
    const metaMatch = p.comment.match(/\[METADATA:({[^\]]+})\]/);
    if (metaMatch?.[1]) {
      try {
        const obj = JSON.parse(metaMatch[1]);
        if (obj.citizenship) citizenship = obj.citizenship;
        if (obj.height) height = obj.height;
        if (obj.weight) weight = obj.weight;
      } catch (e) {}
    }
  }

  const fullName = `${p.last_name || ''} ${p.first_name || ''} ${p.father_name || ''}`.trim() || '—';
  const passport = `${p.passport_series || ''}${p.passport_number || ''}`.trim() || '—';
  const phone = p.phone || '—';
  const birthDate = p.birth_date || '—';
  const position = p.position || '—';
  const number = p.player_number ? `#${p.player_number}` : '—';
  const heightWeight = (height || weight) ? `${height ? `${height}sm` : ''} ${weight ? `${weight}kg` : ''}`.trim() : '—';
  const instagram = instaUser ? `@${instaUser}` : '—';

  return {
    fullName,
    birthDate,
    passport,
    phone,
    position,
    number,
    citizenship: citizenship || '—',
    heightWeight,
    instagram,
    photoUrl: p.photo_url,
    status: p.status
  };
};

const ExportPdfModal = ({ isOpen, onClose, activeLeagues = [] }) => {
  const { orgId } = useOrg();

  const [leagueForLeagueExport, setLeagueForLeagueExport] = useState('');
  const [leagueForTeamExport, setLeagueForTeamExport] = useState('');
  const [teamIdForTeamExport, setTeamIdForTeamExport] = useState('');

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
      const allApps = await fetchAllApplications('*');
      const validTeamIds = new Set(teams.map(t => t.id));

      let validApps = allApps
        .filter(app => !app.comment || !app.comment.includes('[PROFILE_UPDATE]'))
        .filter(app =>
          app.organization_id === orgId ||
          (app.team_id && validTeamIds.has(app.team_id)) ||
          !orgId
        );

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

      setStatusMessage('O\'yinchilar rasmlari va ma\'lumotlari shakllantirilmoqda...');

      // Landscape A4 PDF document (width: 297mm, height: 210mm)
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      let currentY = 15;

      // Header Branding
      doc.setFillColor(15, 23, 42); // #0f172a
      doc.rect(0, 0, pageWidth, 24, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('AMATORA ORGANIZATSIYA', 12, 11);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(203, 213, 225);
      doc.text(docTitle, 12, 17);

      doc.setFontSize(8);
      doc.text(`Sana: ${new Date().toLocaleDateString('uz-UZ')}`, pageWidth - 12, 17, { align: 'right' });

      currentY = 28;
      let totalExportedPlayers = 0;

      for (let teamIndex = 0; teamIndex < targetTeams.length; teamIndex++) {
        const team = targetTeams[teamIndex];
        const teamPlayers = validApps.filter(app => app.team_id === team.id);
        totalExportedPlayers += teamPlayers.length;

        // Pre-load images into base64 map
        const photoMap = new Map();
        const imageLoadPromises = teamPlayers.map(async (p) => {
          if (p.photo_url) {
            const b64 = await loadImageAsBase64(p.photo_url);
            if (b64) photoMap.set(p.id, b64);
          }
        });
        await Promise.all(imageLoadPromises);

        if (currentY > 175) {
          doc.addPage();
          currentY = 15;
        }

        // Team Header Banner
        doc.setFillColor(241, 245, 249);
        doc.roundedRect(12, currentY, pageWidth - 24, 8, 1.5, 1.5, 'F');

        doc.setDrawColor(203, 213, 225);
        doc.roundedRect(12, currentY, pageWidth - 24, 8, 1.5, 1.5, 'S');

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(`${teamIndex + 1}. JAMOA: ${team.name.toUpperCase()} (Liga: ${team.league || '—'})`, 15, currentY + 5.5);

        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text(`O'yinchilar: ${teamPlayers.length} ta`, pageWidth - 15, currentY + 5.5, { align: 'right' });

        currentY += 10;

        // Build Table rows with ALL 12 fields
        const tableBody = teamPlayers.map((p, idx) => {
          const info = extractFullPlayerInfo(p);
          return [
            idx + 1,
            '', // Rasm column (rendered via didDrawCell)
            info.fullName,
            info.birthDate,
            info.passport,
            info.phone,
            info.position,
            info.number,
            info.citizenship,
            info.heightWeight,
            info.instagram,
            getStatusLabel(info.status)
          ];
        });

        if (tableBody.length === 0) {
          tableBody.push(['—', '—', 'O\'yinchilar ro\'yxatdan o\'tmagan', '—', '—', '—', '—', '—', '—', '—', '—', '—']);
        }

        autoTable(doc, {
          startY: currentY,
          head: [['№', 'Rasm', 'F.I.SH', 'Tug\'ilgan sana', 'Pasport', 'Telefon', 'Pozitsiya', 'Raqam', 'Millati', 'Bo\'yi/Vazni', 'Instagram', 'Holati']],
          body: tableBody,
          margin: { left: 12, right: 12 },
          styles: {
            fontSize: 7.5,
            cellPadding: 2,
            font: 'helvetica',
            textColor: [51, 65, 85],
            valign: 'middle',
            overflow: 'linebreak'
          },
          headStyles: {
            fillColor: [30, 41, 59],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 7.5,
            halign: 'left',
            valign: 'middle'
          },
          columnStyles: {
            0: { cellWidth: 8, halign: 'center' },   // №
            1: { cellWidth: 14, halign: 'center' },  // Rasm
            2: { cellWidth: 42 },                    // F.I.SH
            3: { cellWidth: 24, halign: 'center' },  // Tug'ilgan sana
            4: { cellWidth: 22, halign: 'center' },  // Pasport
            5: { cellWidth: 25, halign: 'center' },  // Telefon
            6: { cellWidth: 20 },                    // Pozitsiya
            7: { cellWidth: 12, halign: 'center' },  // Raqam
            8: { cellWidth: 22 },                    // Millati
            9: { cellWidth: 22, halign: 'center' },  // Bo'yi/Vazni
            10: { cellWidth: 24 },                   // Instagram
            11: { cellWidth: 18, halign: 'center' }  // Holati
          },
          alternateRowStyles: {
            fillColor: [248, 250, 252]
          },
          didDrawCell: (data) => {
            if (data.section === 'body' && data.column.index === 1) {
              const player = teamPlayers[data.row.index];
              if (player) {
                const imgB64 = photoMap.get(player.id);
                const cellX = data.cell.x;
                const cellY = data.cell.y;
                const size = 9; // 9mm diameter
                const posX = cellX + (data.cell.width - size) / 2;
                const posY = cellY + (data.cell.height - size) / 2;
                const radius = size / 2;

                if (imgB64) {
                  try {
                    doc.saveGraphicsState();
                    doc.circle(posX + radius, posY + radius, radius, 'clip');
                    doc.addImage(imgB64, 'JPEG', posX, posY, size, size);
                    doc.restoreGraphicsState();

                    // Subtle circle border
                    doc.setDrawColor(203, 213, 225);
                    doc.setLineWidth(0.2);
                    doc.circle(posX + radius, posY + radius, radius, 'S');
                  } catch (e) {}
                } else {
                  // Fallback clean circular avatar icon
                  doc.setFillColor(226, 232, 240);
                  doc.circle(posX + radius, posY + radius, radius, 'F');
                  doc.setFontSize(6);
                  doc.setTextColor(148, 163, 184);
                  doc.text('—', posX + radius, posY + radius + 1, { align: 'center' });
                }
              }
            }
          },
          didDrawPage: (data) => {
            const totalPages = doc.internal.getNumberOfPages();
            doc.setFontSize(7.5);
            doc.setTextColor(148, 163, 184);
            doc.text(
              `Sahifa ${data.pageNumber} / ${totalPages}`,
              pageWidth / 2,
              doc.internal.pageSize.getHeight() - 6,
              { align: 'center' }
            );
          }
        });

        currentY = doc.lastAutoTable.finalY + 8;
      }

      doc.save(fileName);
      setStatusMessage(`PDF muvaffaqiyatli yuklandi! Jami jamoalar: ${targetTeams.length}, O'yinchilar: ${totalExportedPlayers}`);
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
              <p>Barcha ma'lumotlar va burchaksiz rasmlari bilan PDF saqlash</p>
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
                    <p>Barcha ligalardagi barcha jamoalar va ularning to'liq o'yinchilar ro'yxati</p>
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
                    <p>Tanlangan ligadagi barcha jamoalar va ularning o'yinchilarini yuklaydi</p>
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
                    <p>Liga va jamoani tanlab faqat shu jamoa o mezonlari bo'yicha o'yinchilarni yuklaydi</p>
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
