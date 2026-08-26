import React, { useState, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { X, Download, Shield, Trophy, Users, FileText, CheckCircle2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { fetchAllApplications, fetchAllTeams } from '../utils/supabaseHelpers';
import { useOrg } from '../context/OrgContext';
import './ExportPdfModal.css';

// Transliterates Uzbek Cyrillic text to Latin to prevent corrupt characters in jsPDF
export function cyrillicToLatin(text) {
  if (!text || typeof text !== 'string') return '';
  const map = {
    'А': 'A', 'а': 'a',
    'Б': 'B', 'б': 'b',
    'В': 'V', 'в': 'v',
    'Г': 'G', 'г': 'g',
    'Д': 'D', 'д': 'd',
    'Е': 'E', 'е': 'e',
    'Ё': 'Yo', 'ё': 'yo',
    'Ж': 'Zh', 'ж': 'zh',
    'З': 'Z', 'з': 'z',
    'И': 'I', 'и': 'i',
    'Й': 'Y', 'й': 'y',
    'К': 'K', 'к': 'k',
    'Л': 'L', 'л': 'l',
    'М': 'M', 'м': 'm',
    'Н': 'N', 'н': 'n',
    'О': 'O', 'о': 'o',
    'П': 'P', 'п': 'p',
    'Р': 'R', 'р': 'r',
    'С': 'S', 'с': 's',
    'Т': 'T', 'т': 't',
    'У': 'U', 'у': 'u',
    'Ф': 'F', 'ф': 'f',
    'Х': 'Kh', 'х': 'kh',
    'Ц': 'Ts', 'ц': 'ts',
    'Ч': 'Ch', 'ч': 'ch',
    'Ш': 'Sh', 'ш': 'sh',
    'Щ': 'Shch', 'щ': 'shch',
    'Ъ': '', 'ъ': '',
    'Ы': 'I', 'ы': 'i',
    'Ь': '', 'ь': '',
    'Э': 'E', 'э': 'e',
    'Ю': 'Yu', 'ю': 'yu',
    'Я': 'Ya', 'я': 'ya',
    'Ў': "O'", 'ў': "o'",
    'Қ': 'Q', 'қ': 'q',
    'Ғ': "G'", 'ғ': "g'",
    'Ҳ': 'H', 'ҳ': 'h'
  };
  return text.split('').map(char => map[char] || char).join('');
}

// Converts image blob to PNG base64 (preserves transparency — for logos)
const blobToPngBase64 = (blob) => {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width || 200;
        canvas.height = img.naturalHeight || img.height || 200;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const pngBase64 = canvas.toDataURL('image/png');
        URL.revokeObjectURL(objectUrl);
        resolve(pngBase64);
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        resolve(null);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
    img.src = objectUrl;
  });
};

// Converts image blob to JPEG base64 (white background — for player photos)
const blobToJpegBase64 = (blob) => {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width || 200;
        canvas.height = img.naturalHeight || img.height || 200;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        const jpegBase64 = canvas.toDataURL('image/jpeg', 0.85);
        URL.revokeObjectURL(objectUrl);
        resolve(jpegBase64);
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        resolve(null);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
    img.src = objectUrl;
  });
};

const parseStorageUrl = (url) => {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(/\/storage\/v1\/object\/(?:public|authenticated)\/([^/]+)\/(.+)$/);
  if (match) {
    return { bucket: match[1], path: decodeURIComponent(match[2].split('?')[0]) };
  }
  return null;
};

// Convert image URL to Base64 via Canvas for jsPDF compatibility
// preserveTransparency=true → PNG (for logos), false → JPEG with white bg (for player photos)
const loadImageAsBase64 = async (url, preserveTransparency = false) => {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('data:image/jpeg') || url.startsWith('data:image/png')) return url;

  const convertBlob = preserveTransparency ? blobToPngBase64 : blobToJpegBase64;

  // Strategy 1: Supabase Storage SDK download
  const storageInfo = parseStorageUrl(url);
  if (storageInfo) {
    try {
      const { data: blob, error } = await supabase.storage
        .from(storageInfo.bucket)
        .download(storageInfo.path);

      if (!error && blob) {
        const b64 = await convertBlob(blob);
        if (b64) return b64;
      }
    } catch (e) {
      console.warn('Supabase SDK download notice:', e);
    }
  }

  // Strategy 2: Fetch API
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (response.ok) {
      const blob = await response.blob();
      const b64 = await convertBlob(blob);
      if (b64) return b64;
    }
  } catch (e) {}

  // Strategy 3: Direct Image Element -> Canvas
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width || 200;
        canvas.height = img.naturalHeight || img.height || 200;
        const ctx = canvas.getContext('2d');
        if (!preserveTransparency) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL(preserveTransparency ? 'image/png' : 'image/jpeg', 0.85));
      } catch (err) {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
};

// Helper to extract and format all player information with Cyrillic to Latin conversion
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

  const rawFullName = `${p.last_name || ''} ${p.first_name || ''} ${p.father_name || ''}`.trim() || '—';
  const fullName = cyrillicToLatin(rawFullName);
  const passport = `${p.passport_series || ''}${p.passport_number || ''}`.trim() || '—';
  const phone = p.phone || '—';
  const birthDate = p.birth_date || '—';
  const position = cyrillicToLatin(p.position || '—');
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
    citizenship: cyrillicToLatin(citizenship) || '—',
    heightWeight,
    instagram,
    photoUrl: p.photo_url,
    status: p.status
  };
};

const ExportPdfModal = ({ isOpen, onClose, activeLeagues = [] }) => {
  const { currentOrg, orgId } = useOrg();

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
      const allTeamsData = await fetchAllTeams('id, name, league, organization_id, captain_phone, is_archived');
      const filtered = (allTeamsData || []).filter(t =>
        !t.is_archived &&
        (t.organization_id === orgId ||
        (t.league && t.league.split(',').some(l => activeNames.includes(l.trim()))) ||
        !orgId)
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

      let validApps = (allApps || [])
        .filter(app => !app.is_archived && app.status !== 'archived')
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
        docTitle = `LIGA: ${cyrillicToLatin(leagueForLeagueExport).toUpperCase()} - JAMOALAR O'YINCHILARI RO'YXATI`;
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
          docTitle = `JAMOA: ${cyrillicToLatin(selectedTeam.name).toUpperCase()} - O'YINCHILAR RO'YXATI`;
          fileName = `Jamoa_${selectedTeam.name.replace(/\s+/g, '_')}_Oyinchilari_${dateStr}.pdf`;
        }
      }

      if (targetTeams.length === 0) {
        alert('Tanlangan mezon bo\'yicha jamoalar topilmadi!');
        setGeneratingPdf(false);
        return;
      }

      setStatusMessage('O\'yinchi rasmlari va tashkilot logosi yuklanmoqda...');

      // Load Organization Logo base64
      const orgName = cyrillicToLatin(currentOrg?.name || 'HAVAS FUTBOL LIGASI').toUpperCase();
      const orgLogoB64 = currentOrg?.logo_url ? await loadImageAsBase64(currentOrg.logo_url, true) : null;

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

      let titleStartX = 12;

      // Render Organization Logo if available
      if (orgLogoB64) {
        try {
          const logoSize = 16;
          const logoX = 12;
          const logoY = 4;

          doc.addImage(orgLogoB64, 'PNG', logoX, logoY, logoSize, logoSize);

          titleStartX = 32;
        } catch (e) {
          titleStartX = 12;
        }
      }

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text(orgName, titleStartX, 11);

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(203, 213, 225);
      doc.text(docTitle, titleStartX, 17);

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

        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(`${teamIndex + 1}. JAMOA: ${cyrillicToLatin(team.name).toUpperCase()} (Liga: ${cyrillicToLatin(team.league || '—')})`, 15, currentY + 5.5);

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
          tableWidth: 273,
          styles: {
            fontSize: 7.2,
            cellPadding: 2,
            minCellHeight: 11, // Ensures cell has enough height for 9mm circular avatar
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
            2: { cellWidth: 50 },                    // F.I.SH
            3: { cellWidth: 23, halign: 'center' },  // Tug'ilgan sana
            4: { cellWidth: 22, halign: 'center' },  // Pasport
            5: { cellWidth: 27, halign: 'center' },  // Telefon
            6: { cellWidth: 26 },                    // Pozitsiya
            7: { cellWidth: 13, halign: 'center' },  // Raqam
            8: { cellWidth: 18 },                    // Millati
            9: { cellWidth: 20, halign: 'center' },  // Bo'yi/Vazni
            10: { cellWidth: 25 },                   // Instagram
            11: { cellWidth: 27, halign: 'center' }  // Holati (fits "Tasdiqlangan" on 1 line)
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
                const cellW = data.cell.width;
                const cellH = data.cell.height;
                const size = 9; // 9mm
                const posX = cellX + (cellW - size) / 2;
                const posY = cellY + (cellH - size) / 2;

                if (imgB64) {
                  try {
                    doc.addImage(imgB64, 'JPEG', posX, posY, size, size);
                    // Draw a thin border around the image
                    doc.setDrawColor(203, 213, 225);
                    doc.setLineWidth(0.2);
                    doc.rect(posX, posY, size, size, 'S');
                  } catch (e) {
                    console.warn('Drawing cell image notice:', e);
                  }
                } else {
                  // Placeholder gray box
                  doc.setFillColor(226, 232, 240);
                  doc.rect(posX, posY, size, size, 'F');
                  doc.setFontSize(6);
                  doc.setTextColor(148, 163, 184);
                  doc.text('—', posX + size / 2, posY + size / 2 + 1, { align: 'center' });
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
              <p>Tashkilot logosi, barcha ma'lumotlar va doiraviy rasmlari bilan PDF saqlash</p>
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
