import jsPDF from 'jspdf';
import 'jspdf-autotable';

/**
 * Convert image URL to base64 string
 */
const getBase64ImageFromURL = (url) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.setAttribute('crossOrigin', 'anonymous');
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const dataURL = canvas.toDataURL('image/jpeg');
      resolve(dataURL);
    };
    img.onerror = (error) => reject(error);
    img.src = url;
  });
};

/**
 * Load Roboto font for better Uzbek character support
 */
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
    console.error('Font loading failed, using default font:', e);
    return false;
  }
};

/**
 * Export team players to PDF
 * @param {Array} teams - Array of team objects
 * @param {Array} applications - Array of player applications
 * @param {String} selectedTeamId - ID of selected team or 'all'
 */
export const exportTeamsToPDF = async (teams, applications, selectedTeamId = 'all') => {
  try {
    const doc = new jsPDF({ orientation: 'landscape', format: 'a4' });
    const fontLoaded = await loadRobotoFont(doc);

    let teamsToProcess = [];
    if (selectedTeamId === 'all') {
      teamsToProcess = teams;
    } else {
      const team = teams.find((t) => t.id === selectedTeamId);
      if (team) teamsToProcess.push(team);
    }

    let currentY = 15;
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();

    for (let team of teamsToProcess) {
      const teamPlayers = applications.filter((a) => a.team_id === team.id);

      // Add page break if needed
      if (currentY > pageHeight - 60) {
        doc.addPage();
        currentY = 15;
      }

      // Draw team header with logo
      if (team.logo_url) {
        try {
          const logoB64 = await getBase64ImageFromURL(team.logo_url);
          doc.addImage(logoB64, 'JPEG', 14, currentY, 12, 12);
          doc.setFontSize(14);
          doc.text(`Jamoa: ${team.name}`, 30, currentY + 8);
        } catch (e) {
          doc.setFontSize(14);
          doc.text(`Jamoa: ${team.name}`, 14, currentY + 8);
        }
      } else {
        doc.setFontSize(14);
        doc.text(`Jamoa: ${team.name}`, 14, currentY + 8);
      }

      currentY += 15;

      if (teamPlayers.length === 0) {
        doc.setFontSize(10);
        doc.text('O\'yinchi topilmadi', 14, currentY);
        currentY += 10;
        continue;
      }

      // Prepare table data
      const tableBody = [];
      for (let i = 0; i < teamPlayers.length; i++) {
        const app = teamPlayers[i];
        let imgData = null;

        if (app.photo_url) {
          try {
            imgData = await getBase64ImageFromURL(app.photo_url);
          } catch (e) {
            console.warn('Failed to load player photo:', e);
          }
        }

        let statusTxt = '⏳ Kutilmoqda';
        if (app.status === 'approved') statusTxt = '✓ Tasdiqlangan';
        if (app.status === 'rejected') statusTxt = '✗ Rad etilgan';

        const dateObj = new Date(app.created_at);
        const dateStr = `${dateObj
          .getDate()
          .toString()
          .padStart(2, '0')}.${(dateObj.getMonth() + 1)
          .toString()
          .padStart(2, '0')}.${dateObj.getFullYear()}`;

        const pSeries = app.passport_series || '';
        const pNum = app.passport_number || '';
        const passStr = pSeries || pNum ? `${pSeries}${pNum}` : '-';

        tableBody.push([
          i + 1,
          { content: '', styles: { minCellHeight: 18 }, imgData: imgData },
          `${app.last_name} ${app.first_name}\n${app.father_name || ''}`,
          app.birth_date || '-',
          app.position || '-',
          app.player_number || '-',
          passStr,
          app.phone || '-',
          app.comment || '-',
          statusTxt,
        ]);
      }

      // Draw table
      doc.autoTable({
        startY: currentY,
        head: [['#', 'Rasm', 'F.I.SH', 'Tug.Sana', 'Amplua', 'Raqam', 'Pasport', 'Telefon', 'Izoh', 'Status']],
        body: tableBody,
        rowPageBreak: 'avoid',
        styles: {
          valign: 'middle',
          halign: 'center',
          fontSize: 7,
          font: fontLoaded ? 'Roboto' : 'helvetica',
          cellPadding: 1.5,
          lineColor: [200, 200, 200],
          lineWidth: 0.1,
        },
        headStyles: {
          fillColor: [15, 23, 42],
          textColor: [255, 255, 255],
          fontSize: 8,
          font: fontLoaded ? 'Roboto' : 'helvetica',
          fontStyle: 'bold',
        },
        columnStyles: {
          0: { cellWidth: 8 },
          1: { cellWidth: 15 },
          2: { cellWidth: 40 },
          3: { cellWidth: 18 },
          4: { cellWidth: 20 },
          5: { cellWidth: 12 },
          6: { cellWidth: 20 },
          7: { cellWidth: 25 },
          8: { cellWidth: 90 },
          9: { cellWidth: 20 },
        },
        didDrawCell: function (data) {
          if (data.column.index === 1 && data.cell.section === 'body') {
            const cellData = data.row.raw[1];
            if (cellData && cellData.imgData) {
              const imgSize = 14;
              const xPos = data.cell.x + (data.cell.width - imgSize) / 2;
              const yPos = data.cell.y + (data.cell.height - imgSize) / 2;
              doc.addImage(cellData.imgData, 'JPEG', xPos, yPos, imgSize, imgSize);
            }
          }
        },
      });

      currentY = doc.lastAutoTable.finalY + 15;
    }

    doc.save('Jamoalar_va_Oyinchilar.pdf');
    return true;
  } catch (error) {
    console.error('PDF export error:', error);
    throw error;
  }
};

/**
 * Export players by league to PDF
 * @param {Array} applications - Array of player applications
 * @param {Array} teams - Array of team objects
 * @param {String} selectedLeague - League name or 'all'
 */
export const exportPlayersByLeagueToPDF = async (applications, teams, selectedLeague = 'all') => {
  try {
    const doc = new jsPDF({ orientation: 'landscape', format: 'a4' });
    const fontLoaded = await loadRobotoFont(doc);

    let playersToExport = applications;

    if (selectedLeague !== 'all') {
      const leagueTeams = teams.filter((t) => t.league && t.league.includes(selectedLeague));
      const leagueTeamIds = new Set(leagueTeams.map((t) => t.id));
      playersToExport = applications.filter((a) => leagueTeamIds.has(a.team_id));
    }

    let currentY = 15;
    const pageHeight = doc.internal.pageSize.getHeight();

    // Add title
    doc.setFontSize(16);
    doc.text(selectedLeague === 'all' ? 'Barcha O\'yinchilar' : `${selectedLeague} - O'yinchilar`, 14, currentY);
    currentY += 10;

    if (playersToExport.length === 0) {
      doc.setFontSize(10);
      doc.text('O\'yinchi topilmadi', 14, currentY);
      doc.save('Oyinchilar.pdf');
      return true;
    }

    // Prepare table data
    const tableBody = [];
    for (let i = 0; i < playersToExport.length; i++) {
      const app = playersToExport[i];
      let imgData = null;

      if (app.photo_url) {
        try {
          imgData = await getBase64ImageFromURL(app.photo_url);
        } catch (e) {
          console.warn('Failed to load player photo:', e);
        }
      }

      const team = teams.find((t) => t.id === app.team_id);
      const teamName = team ? team.name : 'Yakkaxon';

      let statusTxt = '⏳ Kutilmoqda';
      if (app.status === 'approved') statusTxt = '✓ Tasdiqlangan';
      if (app.status === 'rejected') statusTxt = '✗ Rad etilgan';

      const dateObj = new Date(app.created_at);
      const dateStr = `${dateObj
        .getDate()
        .toString()
        .padStart(2, '0')}.${(dateObj.getMonth() + 1)
        .toString()
        .padStart(2, '0')}.${dateObj.getFullYear()}`;

      const pSeries = app.passport_series || '';
      const pNum = app.passport_number || '';
      const passStr = pSeries || pNum ? `${pSeries}${pNum}` : '-';

      tableBody.push([
        i + 1,
        { content: '', styles: { minCellHeight: 18 }, imgData: imgData },
        `${app.last_name} ${app.first_name}\n${app.father_name || ''}`,
        teamName,
        app.birth_date || '-',
        app.position || '-',
        app.player_number || '-',
        passStr,
        app.phone || '-',
        statusTxt,
      ]);
    }

    // Draw table
    doc.autoTable({
      startY: currentY,
      head: [['#', 'Rasm', 'F.I.SH', 'Jamoa', 'Tug.Sana', 'Amplua', 'Raqam', 'Pasport', 'Telefon', 'Status']],
      body: tableBody,
      rowPageBreak: 'avoid',
      styles: {
        valign: 'middle',
        halign: 'center',
        fontSize: 7,
        font: fontLoaded ? 'Roboto' : 'helvetica',
        cellPadding: 1.5,
        lineColor: [200, 200, 200],
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontSize: 8,
        font: fontLoaded ? 'Roboto' : 'helvetica',
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 8 },
        1: { cellWidth: 15 },
        2: { cellWidth: 35 },
        3: { cellWidth: 25 },
        4: { cellWidth: 16 },
        5: { cellWidth: 18 },
        6: { cellWidth: 12 },
        7: { cellWidth: 18 },
        8: { cellWidth: 20 },
        9: { cellWidth: 20 },
      },
      didDrawCell: function (data) {
        if (data.column.index === 1 && data.cell.section === 'body') {
          const cellData = data.row.raw[1];
          if (cellData && cellData.imgData) {
            const imgSize = 14;
            const xPos = data.cell.x + (data.cell.width - imgSize) / 2;
            const yPos = data.cell.y + (data.cell.height - imgSize) / 2;
            doc.addImage(cellData.imgData, 'JPEG', xPos, yPos, imgSize, imgSize);
          }
        }
      },
    });

    doc.save('Oyinchilar_Royxati.pdf');
    return true;
  } catch (error) {
    console.error('PDF export error:', error);
    throw error;
  }
};
