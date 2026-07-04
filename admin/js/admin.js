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
    const approveBtn = document.getElementById('approveBtn');
    const rejectBtn = document.getElementById('rejectBtn');
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
                <td class="hide-mobile"><span style="font-family: monospace; background: #f1f5f9; padding: 4px 8px; border-radius: 4px;">${app.passport_series}${app.passport_number}</span></td>
                <td class="hide-mobile">${app.phone}</td>
                <td style="color: #64748b; font-size: 12px; text-align: center;">
                    <div style="white-space: nowrap;">${dateStr}</div>
                    <div style="font-size: 11px; opacity: 0.7; margin-top: 2px;">${timeStr}</div>
                </td>
                <td style="text-align: center;"><span class="status-icon-badge ${statusClass}" title="${statusText}"><i data-lucide="${statusIcon}" style="width: 18px; height: 18px;"></i></span></td>
                <td style="text-align: center; white-space: nowrap;">
                    <button class="btn-view" onclick="viewDetails('${app.id}')" title="Ko'rish">
                        <i data-lucide="eye" style="width: 16px; height: 16px;"></i>
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
            items = allApplications.filter(a => !a.team_id);
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
        detailPassport.textContent = `${app.passport_series} ${app.passport_number}`;
        detailPhone.textContent = app.phone;
        detailDate.textContent = new Date(app.created_at).toLocaleString('uz-UZ');
        detailComment.textContent = app.comment;

        // Hide action buttons if not pending
        if (app.status === 'pending') {
            approveBtn.style.display = 'flex';
            rejectBtn.style.display = 'flex';
        } else {
            approveBtn.style.display = 'none';
            rejectBtn.style.display = 'none';
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
            approveBtn.disabled = true;
            rejectBtn.disabled = true;
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
        } finally {
            approveBtn.disabled = false;
            rejectBtn.disabled = false;
        }
    }

    approveBtn.addEventListener('click', () => updateStatus(currentApplicationId, 'approved'));
    rejectBtn.addEventListener('click', () => updateStatus(currentApplicationId, 'rejected'));

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
            tabIndividuals.style.background = 'var(--primary)';
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
            tabTeams.style.background = 'var(--primary)';
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
                </td>
            `;
            tableBody.appendChild(tr);
        });
        lucide.createIcons();
    }

    // PDF Export
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', async () => {
            if (allApplications.length === 0) return alert("Yuklab olish uchun ma'lumot yo'q");
            
            exportBtn.innerHTML = '<i data-lucide="loader" class="spin"></i> Yuklanmoqda...';
            lucide.createIcons();
            
            try {
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF();

                doc.setFontSize(16);
                doc.text("Havas Futbol Ligasi - Zayavkalar", 14, 20);
                
                // Helper to fetch images as base64 to embed in PDF
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

                const tableBody = [];
                for (let i = 0; i < allApplications.length; i++) {
                    const app = allApplications[i];
                    let imgData = null;
                    try {
                        imgData = await getBase64ImageFromURL(app.photo_url);
                    } catch(e) {
                        console.log('Rasm yuklanmadi:', e);
                    }
                    
                    let statusTxt = 'Kutilmoqda';
                    if(app.status === 'approved') statusTxt = 'Tasdiqlangan';
                    if(app.status === 'rejected') statusTxt = 'Rad etilgan';

                    const dateObj = new Date(app.created_at);
                    const dateStr = `${dateObj.getDate().toString().padStart(2, '0')}.${(dateObj.getMonth()+1).toString().padStart(2, '0')}.${dateObj.getFullYear()}`;

                    tableBody.push([
                        i + 1,
                        { content: '', styles: { minCellHeight: 22 }, imgData: imgData }, // Rasm uchun joy
                        `${app.last_name} ${app.first_name}\n${app.father_name || ''}`,
                        `${app.passport_series}${app.passport_number}`,
                        app.phone,
                        app.comment || '-',
                        dateStr,
                        statusTxt
                    ]);
                }

                doc.autoTable({
                    startY: 28,
                    head: [['#', 'Rasm', 'F.I.SH', 'Pasport', 'Telefon', 'Izoh', 'Sana', 'Status']],
                    body: tableBody,
                    rowPageBreak: 'avoid',
                    styles: { 
                        valign: 'middle', 
                        halign: 'center',
                        fontSize: 8, // Kichikroq font
                        cellPadding: 2,
                        lineColor: [200, 200, 200],
                        lineWidth: 0.1
                    },
                    headStyles: {
                        fillColor: [15, 23, 42],
                        textColor: [255, 255, 255],
                        fontSize: 9
                    },
                    columnStyles: {
                        1: { cellWidth: 20 }, // Rasm
                        2: { cellWidth: 35 }, // FISH
                        5: { cellWidth: 40 }  // Izoh
                    },
                    didDrawCell: function(data) {
                        if (data.column.index === 1 && data.cell.section === 'body') {
                            const cellData = data.row.raw[1];
                            if (cellData && cellData.imgData) {
                                // Rasmni cell o'rtasiga joylashtirish (18x18 o'lchamda)
                                const imgSize = 18;
                                const xPos = data.cell.x + (data.cell.width - imgSize) / 2;
                                const yPos = data.cell.y + (data.cell.height - imgSize) / 2;
                                doc.addImage(cellData.imgData, 'JPEG', xPos, yPos, imgSize, imgSize);
                            }
                        }
                    }
                });

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
        const players = allApplications.filter(a => a.team_id === id);
        document.getElementById('teamPlayerCount').textContent = players.length;
        
        const listEl = document.getElementById('teamPlayersList');
        listEl.innerHTML = '';
        
        players.forEach(p => {
            const pStatus = p.status === 'pending' ? 'Kutilmoqda' : p.status === 'approved' ? 'Tasdiqlandi' : 'Rad etildi';
            const color = p.status === 'pending' ? 'orange' : p.status === 'approved' ? 'green' : 'red';
            
            listEl.innerHTML += `
                <div style="display: flex; align-items: center; gap: 15px; background: rgba(255,255,255,0.05); padding: 10px; border-radius: 12px;">
                    <img src="${p.photo_url}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
                    <div style="flex: 1;">
                        <h4 style="margin: 0 0 4px 0; font-size: 14px;">${p.first_name} ${p.last_name}</h4>
                        <div style="font-size: 12px; color: #94a3b8;">${p.passport_series}${p.passport_number} | ${p.phone}</div>
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 5px;">
                        <span style="font-size: 11px; font-weight: bold; color: ${color}">${pStatus}</span>
                        <div style="display: flex; gap: 5px;">
                            <button onclick="viewDetails('${p.id}')" style="background: rgba(59, 130, 246, 0.2); color: #3b82f6; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px;">Ko'rish</button>
                            ${p.status !== 'approved' ? `<button onclick="updatePlayerStatus('${p.id}', 'approved')" style="background: rgba(34, 197, 94, 0.2); color: #22c55e; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px;">Tasdiqlash</button>` : ''}
                            ${p.status !== 'rejected' ? `<button onclick="updatePlayerStatus('${p.id}', 'rejected')" style="background: rgba(239, 68, 68, 0.2); color: #ef4444; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px;">Rad etish</button>` : ''}
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

    document.getElementById('approveTeamBtn')?.addEventListener('click', () => bulkUpdateTeam('approved'));
    document.getElementById('rejectTeamBtn')?.addEventListener('click', () => bulkUpdateTeam('rejected'));
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

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', async () => {
        await db.auth.signOut();
        window.location.href = 'index.html';
    });
});
