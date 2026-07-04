document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const tableBody = document.getElementById('tableBody');
    const searchInput = document.getElementById('searchInput');
    const filterBtns = document.querySelectorAll('.nav-item[data-filter]');
    
    // Stats Elements
    const statTotal = document.getElementById('statTotal');
    const statPending = document.getElementById('statPending');
    const statApproved = document.getElementById('statApproved');

    // Modal Elements
    const detailsModal = document.getElementById('detailsModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const detailPhoto = document.getElementById('detailPhoto');
    const detailName = document.getElementById('detailName');
    const detailPassport = document.getElementById('detailPassport');
    const detailPhone = document.getElementById('detailPhone');
    const detailDate = document.getElementById('detailDate');
    const detailComment = document.getElementById('detailComment');
    
    
    const modalDeleteBtn = document.getElementById('modalDeleteBtn');

    // State
    let allApplications = [];
    let allTeams = [];
    let currentFilter = 'all';
    let currentTab = 'individuals'; // 'individuals' or 'teams'
    let currentApplicationId = null;
    let currentTeamId = null;

    // Tabs
    const tabIndividuals = document.getElementById('tabIndividuals');
    const tabTeams = document.getElementById('tabTeams');
    const individualsTableContainer = document.getElementById('individualsTableContainer');
    const teamsTableContainer = document.getElementById('teamsTableContainer');
    
    // Team Modal
    const teamDetailsModal = document.getElementById('teamDetailsModal');
    const closeTeamModalBtn = document.getElementById('closeTeamModalBtn');

    // Fetch initial data
    fetchData();

    // Setup Realtime Listener
    db.channel('admin-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'applications' }, payload => {
          fetchData(); // Refresh on any change
      })
      .subscribe();

    // Functions
    async function fetchData() {
        try {
            const { data: appsData, error: appsError } = await db
                .from('applications')
                .select('*')
                .order('created_at', { ascending: false });

            if (appsError) throw appsError;
            allApplications = appsData;

            const { data: teamsData, error: teamsError } = await db
                .from('teams')
                .select('*')
                .order('created_at', { ascending: false });

            if (teamsError && teamsError.code !== '42P01') { // Ignore if teams table doesn't exist yet for some reason
                console.error(teamsError);
            } else if (teamsData) {
                allTeams = teamsData;
            }

            if (currentTab === 'individuals') {
                renderTable();
            } else {
                renderTeamsTable();
            }
            updateStats();
        } catch (error) {
            console.error('Error fetching data:', error);
            alert('Ma\'lumotlarni yuklashda xatolik yuz berdi!');
        }
    }

    function renderTable() {
        const searchTerm = searchInput.value.toLowerCase();
        
        let filteredData = allApplications.filter(app => {
            if (app.team_id) return false; // Faqat yakkaxon zayavkalar

            const matchesSearch = 
                app.first_name.toLowerCase().includes(searchTerm) || 
                app.last_name.toLowerCase().includes(searchTerm) ||
                app.phone.includes(searchTerm);
            
            const matchesFilter = currentFilter === 'all' || app.status === currentFilter;
            
            return matchesSearch && matchesFilter;
        });

        tableBody.innerHTML = '';

        if (filteredData.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 30px; color: #64748b;">Hech qanday ma\'lumot topilmadi</td></tr>';
            return;
        }

        filteredData.forEach(app => {
            const dateObj = new Date(app.created_at);
            const dateStr = dateObj.toLocaleDateString('uz-UZ', { year: 'numeric', month: '2-digit', day: '2-digit' });
            const timeStr = dateObj.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });

            const statusClass = `status-${app.status}`;
            let statusText = app.status;
            let statusIcon = 'circle-dashed';
            if (app.status === 'pending') { statusText = 'Kutilmoqda'; statusIcon = 'clock'; }
            if (app.status === 'approved') { statusText = 'Tasdiqlandi'; statusIcon = 'check-circle'; }
            if (app.status === 'rejected') { statusText = 'Rad etildi'; statusIcon = 'x-circle'; }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><img src="${app.photo_url}" alt="Rasm" class="player-avatar"></td>
                <td style="font-weight: 500; font-size: 13px;">${app.first_name} ${app.last_name}</td>
                <td class="hide-mobile"><span style="font-family: monospace; background: #f1f5f9; padding: 4px 8px; border-radius: 4px;">${(app.passport_series || app.passport_number) ? (app.passport_series || '') + (app.passport_number || '') : '-'}</span></td>
                <td class="hide-mobile">${app.phone || '-'}</td>
                <td style="color: #64748b; font-size: 12px; text-align: center;">
                    <div style="white-space: nowrap;">${dateStr}</div>
                    <div style="font-size: 11px; opacity: 0.7; margin-top: 2px;">${timeStr}</div>
                </td>
                <td style="text-align: center;"><span class="status-icon-badge ${statusClass}" title="${statusText}"><i data-lucide="${statusIcon}" style="width: 18px; height: 18px;"></i></span></td>
                <td style="text-align: center; white-space: nowrap;">
                    <button class="btn-view" onclick="viewDetails('${app.id}')" title="Ko'rish">
                        <i data-lucide="eye" style="width: 16px; height: 16px;"></i>
                    </button>
                    <button class="btn-view" onclick="editPlayer('${app.id}')" title="Tahrirlash" style="color: #3b82f6;">
                        <i data-lucide="edit" style="width: 16px; height: 16px;"></i>
                    </button>
                </td>
            `;
            tableBody.appendChild(tr);
        });
        
        lucide.createIcons();
    }

    function updateStats() {
        let items = [];
        if (currentTab === 'individuals') {
            items = allApplications.filter(a => !a.team_id || (a.comment && a.comment.startsWith('[INDIVIDUAL]')));
        } else {
            items = allTeams;
        }

        const total = items.length;
        const pending = items.filter(i => i.status === 'pending').length;
        const approved = items.filter(i => i.status === 'approved' || i.status === 'partially_approved').length;

        statTotal.textContent = total;
        statPending.textContent = pending;
        statApproved.textContent = approved;
    }

    // Modal & Actions
    window.viewDetails = function(id) {
        const app = allApplications.find(a => a.id === id);
        if (!app) return;

        currentApplicationId = id;
        detailsModal.style.zIndex = '9999';
        
        detailPhoto.src = app.photo_url;
        detailName.textContent = `${app.first_name} ${app.last_name} ${app.father_name}`;
        detailPassport.textContent = (app.passport_series || app.passport_number) ? `${app.passport_series || ''} ${app.passport_number || ''}` : 'Kiritilmagan';
        detailPhone.textContent = app.phone || 'Kiritilmagan';
        document.getElementById('detailBirthDate').textContent = app.birth_date || 'Kiritilmagan';
        document.getElementById('detailPosition').textContent = app.position || 'Kiritilmagan';
        document.getElementById('detailPlayerNumber').textContent = app.player_number || 'Kiritilmagan';
        detailDate.textContent = new Date(app.created_at).toLocaleString('uz-UZ');
        let displayComment = app.comment || '';
        if (displayComment.startsWith('[INDIVIDUAL]')) {
            displayComment = displayComment.substring(12);
        }
        detailComment.textContent = displayComment;

        // Set select value
        const statusSelect = document.getElementById('statusSelect');
        if (statusSelect) {
            statusSelect.value = app.status;
        }

        detailsModal.classList.remove('hidden');
    }

    closeModalBtn.addEventListener('click', () => {
        detailsModal.classList.add('hidden');
    });

    window.deleteApplication = async function(id) {
        if (confirm("Rostdan ham ushbu zayavkani to'liq o'chirib tashlamoqchimisiz? Bu amalni orqaga qaytarib bo'lmaydi!")) {
            try {
                // Find app to get photo url
                const app = allApplications.find(a => a.id === id);
                
                // Delete from applications table
                const { error } = await db
                    .from('applications')
                    .delete()
                    .eq('id', id);

                if (error) throw error;

                // Delete photo from storage if exists
                if (app && app.photo_url) {
                    const fileName = app.photo_url.split('/').pop();
                    if (fileName) {
                        await db.storage.from('player-photos').remove([fileName]);
                    }
                }

                alert("Zayavka muvaffaqiyatli o'chirildi!");
                
                // Refresh list
                allApplications = allApplications.filter(a => a.id !== id);
                detailsModal.classList.add('hidden');
                renderTable();
                updateStats();

            } catch (error) {
                console.error("O'chirishda xatolik:", error);
                alert("O'chirishda xatolik yuz berdi: " + error.message);
            }
        }
    }

    if (modalDeleteBtn) {
        modalDeleteBtn.addEventListener('click', () => {
            if (currentApplicationId) {
                deleteApplication(currentApplicationId);
            }
        });
    }

    async function updateStatus(id, newStatus) {
        try {
            const { error } = await db
                .from('applications')
                .update({ status: newStatus })
                .eq('id', id);

            if (error) throw error;
            
            detailsModal.classList.add('hidden');
            fetchData(); 
            
        } catch (error) {
            console.error('Error updating status:', error);
            alert('Statusni o\'zgartirishda xatolik yuz berdi! Xato: ' + error.message);
        }
    }

    const statusSelect = document.getElementById('statusSelect');
    if (statusSelect) {
        statusSelect.addEventListener('change', (e) => {
            if(currentApplicationId) {
                updateStatus(currentApplicationId, e.target.value);
            }
        });
    }

    // Search and Filter Events
    searchInput.addEventListener('input', () => {
        if (currentTab === 'individuals') renderTable();
        else renderTeamsTable();
    });

    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            if (currentTab === 'individuals') renderTable();
            else renderTeamsTable();
        });
    });

    // --- Tab Switching ---
    if (tabIndividuals && tabTeams) {
        tabIndividuals.addEventListener('click', () => {
            currentTab = 'individuals';
            tabIndividuals.classList.add('active');
            tabIndividuals.style.background = 'var(--bg-sidebar)';
            tabIndividuals.style.color = 'white';
            tabIndividuals.style.border = 'none';

            tabTeams.classList.remove('active');
            tabTeams.style.background = 'var(--bg-card)';
            tabTeams.style.color = 'var(--text-dark)';
            tabTeams.style.border = '1px solid var(--border-color)';

            individualsTableContainer.classList.remove('hidden');
            teamsTableContainer.classList.add('hidden');
            renderTable();
            updateStats();
        });

        tabTeams.addEventListener('click', () => {
            currentTab = 'teams';
            tabTeams.classList.add('active');
            tabTeams.style.background = 'var(--bg-sidebar)';
            tabTeams.style.color = 'white';
            tabTeams.style.border = 'none';

            tabIndividuals.classList.remove('active');
            tabIndividuals.style.background = 'var(--bg-card)';
            tabIndividuals.style.color = 'var(--text-dark)';
            tabIndividuals.style.border = '1px solid var(--border-color)';

            teamsTableContainer.classList.remove('hidden');
            individualsTableContainer.classList.add('hidden');
            renderTeamsTable();
            updateStats();
        });
    }

    // --- Teams Rendering & Logic ---
    function renderTeamsTable() {
        const tableBody = document.getElementById('teamsTableBody');
        if (!tableBody) return;
        const searchTerm = searchInput.value.toLowerCase();
        
        let filteredData = allTeams.filter(team => {
            const matchesSearch = 
                team.name.toLowerCase().includes(searchTerm) || 
                team.captain_phone.includes(searchTerm);
            
            const matchesFilter = currentFilter === 'all' || team.status === currentFilter;
            
            return matchesSearch && matchesFilter;
        });

        tableBody.innerHTML = '';

        if (filteredData.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 30px; color: #64748b;">Hech qanday jamoa topilmadi</td></tr>';
            return;
        }

        filteredData.forEach(team => {
            const dateObj = new Date(team.created_at);
            const dateStr = dateObj.toLocaleDateString('uz-UZ');
            
            const statusClass = `status-${team.status}`;
            let statusText = team.status;
            let statusIcon = 'circle-dashed';
            if (team.status === 'pending') { statusText = 'Kutilmoqda'; statusIcon = 'clock'; }
            if (team.status === 'approved') { statusText = 'Tasdiqlandi'; statusIcon = 'check-circle'; }
            if (team.status === 'rejected') { statusText = 'Rad etildi'; statusIcon = 'x-circle'; }
            if (team.status === 'partially_approved') { statusText = 'Qisman'; statusIcon = 'alert-circle'; }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><img src="${team.logo_url}" alt="Logo" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;"></td>
                <td style="font-weight: 600;">${team.name}</td>
                <td class="hide-mobile">${team.captain_phone}</td>
                <td>${dateStr}</td>
                <td style="text-align: center;"><span class="status-icon-badge ${statusClass}" title="${statusText}"><i data-lucide="${statusIcon}" style="width: 18px; height: 18px;"></i></span></td>
                <td style="text-align: center; white-space: nowrap;">
                    <button class="btn-view" onclick="viewTeamDetails('${team.id}')" title="Ko'rish">
                        <i data-lucide="eye" style="width: 16px; height: 16px;"></i>
                    </button>
                    <button class="btn-view" onclick="editTeam('${team.id}')" title="Tahrirlash" style="color: #3b82f6;">
                        <i data-lucide="edit" style="width: 16px; height: 16px;"></i>
                    </button>
                </td>
            `;
            tableBody.appendChild(tr);
        });
        lucide.createIcons();
    }

    // PDF Export
    const exportBtn = document.getElementById('exportBtn');
    const pdfExportModal = document.getElementById('pdfExportModal');
    const closePdfModalBtn = document.getElementById('closePdfModalBtn');
    const startPdfDownloadBtn = document.getElementById('startPdfDownloadBtn');
    const pdfTeamSelect = document.getElementById('pdfTeamSelect');

    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            if (allApplications.length === 0) return alert("Yuklab olish uchun ma'lumot yo'q");
            
            // Populate teams
            const existingOptions = Array.from(pdfTeamSelect.options).map(o => o.value);
            allTeams.forEach(t => {
                if (!existingOptions.includes(t.id)) {
                    const opt = document.createElement('option');
                    opt.value = t.id;
                    opt.textContent = `Jamoa: ${t.name}`;
                    pdfTeamSelect.appendChild(opt);
                }
            });
            
            pdfExportModal.style.zIndex = '10000';
            pdfExportModal.classList.remove('hidden');
        });
    }

    if (closePdfModalBtn) {
        closePdfModalBtn.addEventListener('click', () => {
            pdfExportModal.classList.add('hidden');
        });
    }

    if (startPdfDownloadBtn) {
        startPdfDownloadBtn.addEventListener('click', async () => {
            const selectedOption = pdfTeamSelect.value;
            pdfExportModal.classList.add('hidden');
            
            exportBtn.innerHTML = '<i data-lucide="loader" class="spin"></i> Yuklanmoqda...';
            lucide.createIcons();
            
            try {
                const { jsPDF } = window.jspdf;
                // Landscape orientation for more columns
                const doc = new jsPDF({ orientation: 'landscape', format: 'a4' });

                // Load Roboto font to fix Cyrillic/Uzbek characters
                let fontLoaded = false;
                try {
                    const fontRes = await fetch('https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/fonts/Roboto/Roboto-Regular.ttf');
                    const fontBlob = await fontRes.blob();
                    const base64Font = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result.split(',')[1]);
                        reader.readAsDataURL(fontBlob);
                    });
                    doc.addFileToVFS('Roboto-Regular.ttf', base64Font);
                    doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
                    doc.setFont('Roboto');
                    fontLoaded = true;
                } catch(e) {
                    console.error("Font yuklanmadi, standart font ishlatiladi", e);
                }
                
                const getBase64ImageFromURL = (url) => {
                    return new Promise((resolve, reject) => {
                      var img = new Image();
                      img.setAttribute("crossOrigin", "anonymous");
                      img.onload = () => {
                        var canvas = document.createElement("canvas");
                        canvas.width = img.width;
                        canvas.height = img.height;
                        var ctx = canvas.getContext("2d");
                        ctx.drawImage(img, 0, 0);
                        var dataURL = canvas.toDataURL("image/jpeg");
                        resolve(dataURL);
                      };
                      img.onerror = error => reject(error);
                      img.src = url;
                    });
                };

                let teamsToProcess = [];

                if (selectedOption === 'all') {
                    teamsToProcess = allTeams;
                } else {
                    const t = allTeams.find(t => t.id === selectedOption);
                    if (t) teamsToProcess.push(t);
                }

                let currentY = 15;

                // Function to draw a table for a set of players
                const drawPlayerTable = async (players, title, logoUrl) => {
                    if (players.length === 0 && !title.includes('Yakkaxon')) return; // Skip empty teams unless it's individuals

                    // Add Page break if not enough space for header
                    if (currentY > 170) {
                        doc.addPage();
                        currentY = 15;
                    }

                    // Draw Header
                    if (logoUrl) {
                        try {
                            const logoB64 = await getBase64ImageFromURL(logoUrl);
                            doc.addImage(logoB64, 'JPEG', 14, currentY, 12, 12);
                            doc.setFontSize(14);
                            doc.text(title, 30, currentY + 8);
                        } catch(e) {
                            doc.setFontSize(14);
                            doc.text(title, 14, currentY + 8);
                        }
                    } else {
                        doc.setFontSize(14);
                        doc.text(title, 14, currentY + 8);
                    }
                    
                    currentY += 15;

                    const tableBody = [];
                    for (let i = 0; i < players.length; i++) {
                        const app = players[i];
                        let imgData = null;
                        if (app.photo_url) {
                            try { imgData = await getBase64ImageFromURL(app.photo_url); } catch(e) {}
                        }
                        
                        let statusTxt = '⏳ Kutilmoqda';
                        if(app.status === 'approved') statusTxt = '✓ Tasdiqlangan';
                        if(app.status === 'rejected') statusTxt = '✗ Rad etilgan';

                        const dateObj = new Date(app.created_at);
                        const dateStr = `${dateObj.getDate().toString().padStart(2, '0')}.${(dateObj.getMonth()+1).toString().padStart(2, '0')}.${dateObj.getFullYear()}`;

                        const pSeries = app.passport_series || '';
                        const pNum = app.passport_number || '';
                        const passStr = (pSeries || pNum) ? `${pSeries}${pNum}` : '-';

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
                            statusTxt
                        ]);
                    }

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
                            lineWidth: 0.1
                        },
                        headStyles: {
                            fillColor: [15, 23, 42],
                            textColor: [255, 255, 255],
                            fontSize: 8,
                            font: fontLoaded ? 'Roboto' : 'helvetica'
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
                            8: { cellWidth: 90 }, // Izoh
                            9: { cellWidth: 20 }
                        },
                        didDrawCell: function(data) {
                            if (data.column.index === 1 && data.cell.section === 'body') {
                                const cellData = data.row.raw[1];
                                if (cellData && cellData.imgData) {
                                    const imgSize = 14;
                                    const xPos = data.cell.x + (data.cell.width - imgSize) / 2;
                                    const yPos = data.cell.y + (data.cell.height - imgSize) / 2;
                                    doc.addImage(cellData.imgData, 'JPEG', xPos, yPos, imgSize, imgSize);
                                }
                            }
                        }
                    });

                    currentY = doc.lastAutoTable.finalY + 15;
                };

                // Generate Teams
                for (let team of teamsToProcess) {
                    const teamPlayers = allApplications.filter(a => a.team_id === team.id);
                    await drawPlayerTable(teamPlayers, `Jamoa: ${team.name}`, team.logo_url);
                }

                doc.save("Futbolchilar_Royxati.pdf");
                
            } catch(err) {
                console.error(err);
                alert("PDF yaratishda xatolik yuz berdi.");
            } finally {
                exportBtn.innerHTML = '<i data-lucide="download"></i> PDF Yuklab olish';
                lucide.createIcons();
            }
        });
    }

    // --- Team Modal Logic ---
    window.viewTeamDetails = async function(id) {
        const team = allTeams.find(t => t.id === id);
        if (!team) return;

        currentTeamId = id;
        
        document.getElementById('teamDetailLogo').src = team.logo_url;
        document.getElementById('teamDetailName').textContent = team.name;
        document.getElementById('teamDetailPhone').innerHTML = `<i data-lucide="phone" style="width: 14px; height: 14px; vertical-align: middle;"></i> ${team.captain_phone}`;
        
        const statusEl = document.getElementById('teamDetailStatus');
        statusEl.className = `status-badge status-${team.status}`;
        statusEl.textContent = team.status === 'pending' ? 'Kutilmoqda' : 
                               team.status === 'approved' ? 'Tasdiqlangan' : 
                               team.status === 'partially_approved' ? 'Qisman' : 'Rad etilgan';

        // Load players for this team
        // Load players for this team
        const players = allApplications.filter(a => a.team_id === id);
        document.getElementById('teamPlayerCount').textContent = players.length;
        
        const listEl = document.getElementById('teamPlayersList');
        listEl.innerHTML = '';
        
        players.forEach(p => {
            const pStatus = p.status === 'pending' ? 'Kutilmoqda' : p.status === 'approved' ? 'Tasdiqlandi' : 'Rad etildi';
            const color = p.status === 'pending' ? 'orange' : p.status === 'approved' ? 'green' : 'red';
            let pStatusIcon = 'circle-dashed';
            if (p.status === 'pending') pStatusIcon = 'clock';
            if (p.status === 'approved') pStatusIcon = 'check-circle';
            if (p.status === 'rejected') pStatusIcon = 'x-circle';
            
            listEl.innerHTML += `
                <div style="display: flex; align-items: center; gap: 15px; background: rgba(255,255,255,0.05); padding: 10px; border-radius: 12px;">
                    <img src="${p.photo_url}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
                    <div style="flex: 1;">
                        <h4 style="margin: 0 0 4px 0; font-size: 14px;">${p.first_name} ${p.last_name}</h4>
                        <div style="font-size: 12px; color: #94a3b8;">${(p.passport_series || p.passport_number) ? (p.passport_series || '') + (p.passport_number || '') : '-'} | ${p.phone || '-'}</div>
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
                        <span title="${pStatus}" style="color: ${color}; display: flex; align-items: center; justify-content: center;"><i data-lucide="${pStatusIcon}" style="width: 16px; height: 16px;"></i></span>
                        <div style="display: flex; gap: 5px;">
                            <button onclick="viewDetails('${p.id}')" title="Ko'rish" style="background: rgba(59, 130, 246, 0.2); color: #3b82f6; border: none; padding: 6px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center;"><i data-lucide="eye" style="width: 14px; height: 14px;"></i></button>
                            <button onclick="editPlayer('${p.id}')" title="Tahrirlash" style="background: rgba(168, 85, 247, 0.2); color: #a855f7; border: none; padding: 6px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center;"><i data-lucide="edit" style="width: 14px; height: 14px;"></i></button>
                            <select onchange="updatePlayerStatus('${p.id}', this.value)" style="padding: 6px; border-radius: 4px; border: 1px solid var(--border-color); font-size: 12px; cursor: pointer; outline: none; background: var(--bg-card); color: var(--text-dark);">
                                <option value="pending" ${p.status === 'pending' ? 'selected' : ''}>⏳ Kutilmoqda</option>
                                <option value="approved" ${p.status === 'approved' ? 'selected' : ''}>✅ Tasdiqlash</option>
                                <option value="rejected" ${p.status === 'rejected' ? 'selected' : ''}>❌ Rad etish</option>
                            </select>
                        </div>
                    </div>
                </div>
            `;
        });
        
        lucide.createIcons();
        teamDetailsModal.classList.remove('hidden');
    }

    if (closeTeamModalBtn) {
        closeTeamModalBtn.addEventListener('click', () => {
            teamDetailsModal.classList.add('hidden');
        });
    }

    window.updatePlayerStatus = async function(playerId, newStatus) {
        try {
            const { error } = await db.from('applications').update({ status: newStatus }).eq('id', playerId);
            if (error) throw error;
            
            // Check overall team status locally
            const tPlayers = allApplications.filter(a => a.team_id === currentTeamId);
            const pIndex = tPlayers.findIndex(a => a.id === playerId);
            if(pIndex !== -1) tPlayers[pIndex].status = newStatus;

            let newTeamStatus = 'pending';
            const allApproved = tPlayers.every(p => p.status === 'approved');
            const allRejected = tPlayers.every(p => p.status === 'rejected');
            const someApproved = tPlayers.some(p => p.status === 'approved');

            if (allApproved) newTeamStatus = 'approved';
            else if (allRejected) newTeamStatus = 'rejected';
            else if (someApproved) newTeamStatus = 'partially_approved';

            // Update team status in DB silently
            await db.from('teams').update({ status: newTeamStatus }).eq('id', currentTeamId);
            
            // Re-fetch to update everything
            fetchData().then(() => {
                if(!teamDetailsModal.classList.contains('hidden')) {
                    viewTeamDetails(currentTeamId); // Refresh modal
                }
            });
        } catch (err) {
            console.error(err);
            alert("Xatolik: " + err.message);
        }
    }

    const teamStatusSelect = document.getElementById('teamStatusSelect');
    if (teamStatusSelect) {
        teamStatusSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            if(confirm(`Jamoaning barcha o'yinchilari holati o'zgartiriladi. Tasdiqlaysizmi?`)) {
                bulkUpdateTeam(val);
            }
            // reset select back to placeholder
            e.target.value = "pending";
        });
    }
    document.getElementById('deleteTeamBtn')?.addEventListener('click', async () => {
        if (confirm("Rostdan ham ushbu jamoani to'liq o'chirmoqchimisiz?")) {
            try {
                // Because of ON DELETE CASCADE on applications(team_id), this deletes players too!
                const { error } = await db.from('teams').delete().eq('id', currentTeamId);
                if (error) throw error;
                teamDetailsModal.classList.add('hidden');
                alert("Jamoa o'chirildi!");
                fetchData();
            } catch (err) {
                alert("Xatolik: " + err.message);
            }
        }
    });

    async function bulkUpdateTeam(newStatus) {
        try {
            const { error: teamErr } = await db.from('teams').update({ status: newStatus }).eq('id', currentTeamId);
            if (teamErr) throw teamErr;

            const { error: appErr } = await db.from('applications').update({ status: newStatus }).eq('team_id', currentTeamId);
            if (appErr) throw appErr;

            teamDetailsModal.classList.add('hidden');
            fetchData();
        } catch (err) {
            alert("Xatolik: " + err.message);
        }
    }
    // --- Image Compressor ---
    async function compressImage(file, maxWidth = 600, maxHeight = 600, quality = 0.6) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    let width = img.width;
                    let height = img.height;
                    if (width > height) {
                        if (width > maxWidth) {
                            height = Math.round((height * maxWidth) / width);
                            width = maxWidth;
                        }
                    } else {
                        if (height > maxHeight) {
                            width = Math.round((width * maxHeight) / height);
                            height = maxHeight;
                        }
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    canvas.toBlob((blob) => {
                        if (!blob) return reject(new Error('Canvas to Blob failed'));
                        const newFileName = file.name.replace(/\.[^/.]+$/, "") + "_compressed.jpg";
                        const compressedFile = new File([blob], newFileName, { type: 'image/jpeg', lastModified: Date.now() });
                        resolve(compressedFile);
                    }, 'image/jpeg', quality);
                };
                img.onerror = (error) => reject(error);
            };
            reader.onerror = (error) => reject(error);
        });
    }

    // --- Edit Modals Logic ---
    const editTeamModal = document.getElementById('editTeamModal');
    const editPlayerModal = document.getElementById('editPlayerModal');
    let editingTeamId = null;
    let editingPlayerId = null;

    document.getElementById('closeEditTeamBtn')?.addEventListener('click', () => editTeamModal.classList.add('hidden'));
    document.getElementById('closeEditPlayerBtn')?.addEventListener('click', () => editPlayerModal.classList.add('hidden'));

    window.editTeam = function(id) {
        const team = allTeams.find(t => t.id === id);
        if(!team) return;
        editingTeamId = id;
        document.getElementById('editTeamCurrentLogo').src = team.logo_url;
        document.getElementById('editTeamName').value = team.name;
        document.getElementById('editTeamPhone').value = team.captain_phone;
        document.getElementById('editTeamLogo').value = ''; // clear previous file
        editTeamModal.style.zIndex = '10000';
        editTeamModal.classList.remove('hidden');
    }

    document.getElementById('editTeamForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById('editTeamSubmitBtn');
        submitBtn.innerHTML = '<i data-lucide="loader" class="spin"></i> <span>Saqlanmoqda...</span>';
        submitBtn.disabled = true;
        lucide.createIcons();

        try {
            const name = document.getElementById('editTeamName').value.trim();
            const phone = document.getElementById('editTeamPhone').value.trim();
            const logoFile = document.getElementById('editTeamLogo').files[0];
            
            let updates = { name, captain_phone: phone };

            if (logoFile) {
                const compressed = await compressImage(logoFile);
                const fileExt = compressed.name.split('.').pop();
                const fileName = `team_${Date.now()}.${fileExt}`;
                const { error: uploadError } = await db.storage.from('player-photos').upload(fileName, compressed);
                if (uploadError) throw uploadError;
                
                const { data: { publicUrl } } = db.storage.from('player-photos').getPublicUrl(fileName);
                updates.logo_url = publicUrl;
            }

            const { error } = await db.from('teams').update(updates).eq('id', editingTeamId);
            if(error) throw error;

            alert('Jamoa muvaffaqiyatli tahrirlandi!');
            editTeamModal.classList.add('hidden');
            if(!teamDetailsModal.classList.contains('hidden') && currentTeamId === editingTeamId) {
                document.getElementById('teamDetailName').textContent = name;
                document.getElementById('teamDetailPhone').innerHTML = `<i data-lucide="phone" style="width: 14px; height: 14px; vertical-align: middle;"></i> ${phone}`;
                if(updates.logo_url) document.getElementById('teamDetailLogo').src = updates.logo_url;
            }
            await fetchData();
        } catch (err) {
            alert("Xatolik: " + err.message);
        } finally {
            submitBtn.innerHTML = '<i data-lucide="save"></i> <span>Saqlash</span>';
            submitBtn.disabled = false;
            lucide.createIcons();
        }
    });

    window.editPlayer = function(id) {
        const app = allApplications.find(a => a.id === id);
        if(!app) return;
        editingPlayerId = id;
        document.getElementById('editPlayerCurrentPhoto').src = app.photo_url;
        document.getElementById('editPlayerFirstName').value = app.first_name;
        document.getElementById('editPlayerLastName').value = app.last_name;
        document.getElementById('editPlayerFatherName').value = app.father_name;
        document.getElementById('editPlayerPassSeries').value = app.passport_series || '';
        document.getElementById('editPlayerPassNumber').value = app.passport_number || '';
        document.getElementById('editPlayerPhone').value = app.phone || '';
        document.getElementById('editPlayerBirthDate').value = app.birth_date || '';
        document.getElementById('editPlayerPosition').value = app.position || '';
        document.getElementById('editPlayerNumber').value = app.player_number || '';
        document.getElementById('editPlayerComment').value = app.comment || '';
        document.getElementById('editPlayerPhoto').value = '';
        
        const teamSelect = document.getElementById('editPlayerTeam');
        teamSelect.innerHTML = '<option value="">Yakkaxon (Jamoasiz)</option>';
        if (allTeams && allTeams.length > 0) {
            allTeams.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = t.name;
                teamSelect.appendChild(opt);
            });
        }
        teamSelect.value = app.team_id || '';
        
        editPlayerModal.style.zIndex = '10000';
        editPlayerModal.classList.remove('hidden');
    }

    document.getElementById('editPlayerForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById('editPlayerSubmitBtn');
        submitBtn.innerHTML = '<i data-lucide="loader" class="spin"></i> <span>Saqlanmoqda...</span>';
        submitBtn.disabled = true;
        lucide.createIcons();

        try {
            const first_name = document.getElementById('editPlayerFirstName').value.trim();
            const last_name = document.getElementById('editPlayerLastName').value.trim();
            const father_name = document.getElementById('editPlayerFatherName').value.trim();
            const passport_series = document.getElementById('editPlayerPassSeries').value.trim().toUpperCase();
            const passport_number = document.getElementById('editPlayerPassNumber').value.trim();
            const phone = document.getElementById('editPlayerPhone').value.trim();
            const birth_date = document.getElementById('editPlayerBirthDate').value.trim();
            const position = document.getElementById('editPlayerPosition').value.trim();
            const player_number = document.getElementById('editPlayerNumber').value.trim();
            const comment = document.getElementById('editPlayerComment').value.trim();
            const team_id = document.getElementById('editPlayerTeam').value || null;
            const photoFile = document.getElementById('editPlayerPhoto').files[0];
            
            let updates = { first_name, last_name, father_name, passport_series, passport_number, phone, birth_date, position, player_number, comment, team_id };

            if (photoFile) {
                const compressed = await compressImage(photoFile);
                const fileExt = compressed.name.split('.').pop();
                const fileName = `player_${Date.now()}.${fileExt}`;
                const { error: uploadError } = await db.storage.from('player-photos').upload(fileName, compressed);
                if (uploadError) throw uploadError;
                
                const { data: { publicUrl } } = db.storage.from('player-photos').getPublicUrl(fileName);
                updates.photo_url = publicUrl;
            }

            const { error } = await db.from('applications').update(updates).eq('id', editingPlayerId);
            if(error) throw error;

            alert('O\'yinchi muvaffaqiyatli tahrirlandi!');
            editPlayerModal.classList.add('hidden');
            
            if(!detailsModal.classList.contains('hidden') && currentApplicationId === editingPlayerId) {
                document.getElementById('detailName').textContent = `${first_name} ${last_name} ${father_name}`;
                document.getElementById('detailPassport').textContent = (passport_series || passport_number) ? `${passport_series || ''} ${passport_number || ''}` : 'Kiritilmagan';
                document.getElementById('detailPhone').textContent = phone || 'Kiritilmagan';
                document.getElementById('detailBirthDate').textContent = birth_date || 'Kiritilmagan';
                document.getElementById('detailPosition').textContent = position || 'Kiritilmagan';
                document.getElementById('detailPlayerNumber').textContent = player_number || 'Kiritilmagan';
                document.getElementById('detailComment').textContent = comment || '';
                if(updates.photo_url) document.getElementById('detailPhoto').src = updates.photo_url;
            }

            await fetchData();

            if(!teamDetailsModal.classList.contains('hidden')) {
                setTimeout(() => { viewTeamDetails(currentTeamId); }, 100);
            }
        } catch (err) {
            alert("Xatolik: " + err.message);
        } finally {
            submitBtn.innerHTML = '<i data-lucide="save"></i> <span>Saqlash</span>';
            submitBtn.disabled = false;
            lucide.createIcons();
        }
    });

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', async () => {
        await db.auth.signOut();
        window.location.href = 'index.html';
    });
});
