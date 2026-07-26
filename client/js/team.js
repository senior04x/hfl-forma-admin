document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const teamNameInput = document.getElementById('teamName');
    const captainPhoneInput = document.getElementById('captainPhone');
    const teamLogoDropzone = document.getElementById('teamLogoDropzone');
    const teamLogoInput = document.getElementById('teamLogoInput');
    const teamLogoPreview = document.getElementById('teamLogoPreview');
    const teamLogoPlaceholder = document.getElementById('teamLogoPlaceholder');
    const validationStatus = document.getElementById('validationStatus');
    const playersSection = document.getElementById('playersSection');
    
    const playerListEl = document.getElementById('playerList');
    const playerCountEl = document.getElementById('playerCount');
    const openPlayerModalBtn = document.getElementById('openPlayerModalBtn');
    
    const playerModal = document.getElementById('playerModal');
    const closePlayerModalBtn = document.getElementById('closePlayerModalBtn');
    const playerForm = document.getElementById('playerForm');
    
    const playerPhotoDropzone = document.getElementById('playerPhotoDropzone');
    const playerPhotoInput = document.getElementById('playerPhotoInput');
    const playerPhotoPreview = document.getElementById('playerPhotoPreview');
    const playerPhotoPlaceholder = document.getElementById('playerPhotoPlaceholder');
    
    const playerFirstName = document.getElementById('playerFirstName');
    const playerLastName = document.getElementById('playerLastName');
    const playerFatherName = document.getElementById('playerFatherName');
    const playerPassportSeries = document.getElementById('playerPassportSeries');
    const playerPassportNumber = document.getElementById('playerPassportNumber');
    const playerPhone = document.getElementById('playerPhone');
    const playerComment = document.getElementById('playerComment');
    
    const submitTeamBtn = document.getElementById('submitTeamBtn');
    const submitBtnText = submitTeamBtn.querySelector('.btn-text');
    const submitLoader = submitTeamBtn.querySelector('.loader');
    
    const progressModal = document.getElementById('progressModal');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');

    // --- Org Resolver & Dynamic League Select ---
    async function initOrgAndLeagues() {
        const teamLeagueSelect = document.getElementById('teamLeague');
        if (typeof window.resolveOrg === 'function') {
            await window.resolveOrg();
        }
        if (teamLeagueSelect) {
            teamLeagueSelect.innerHTML = '<option value="" disabled selected>Turnirni tanlang</option>';
            const leagues = (window.orgLeagues && window.orgLeagues.length > 0)
                ? window.orgLeagues.map(l => l.name)
                : ['Super liga', 'Pro liga', '3-liga', '7x7 liga'];
            
            leagues.forEach(lName => {
                const opt = document.createElement('option');
                opt.value = lName;
                opt.textContent = lName;
                teamLeagueSelect.appendChild(opt);
            });
        }
    }
    initOrgAndLeagues();

    // --- State ---
    let teamLogoBase64 = null;
    let currentPlayerPhotoBase64 = null;
    let players = [];
    let currentCropTarget = null; // 'team' or 'player'

    // --- Compression Utility (to save space in sessionStorage and fast uploads) ---
    function compressImageToBase64(file, maxWidth, maxHeight, quality) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = function (event) {
                const img = new Image();
                img.src = event.target.result;
                img.onload = function () {
                    // 1x1 Center Crop Logic
                    const minDim = Math.min(img.width, img.height);
                    const sx = (img.width - minDim) / 2;
                    const sy = (img.height - minDim) / 2;

                    // Max target size based on parameters
                    const targetSize = Math.min(minDim, Math.max(maxWidth, maxHeight));

                    const canvas = document.createElement('canvas');
                    canvas.width = targetSize;
                    canvas.height = targetSize;
                    const ctx = canvas.getContext('2d');
                    
                    // Draw center cropped image to canvas
                    ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, targetSize, targetSize);
                    resolve(canvas.toDataURL('image/webp', 0.8));
                };
            };
        });
    }

    // Convert Base64 back to Blob for uploading
    function dataURLtoBlob(dataurl) {
        let arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
            bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
        while(n--){
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new Blob([u8arr], {type:mime});
    }

    // --- Load Draft from SessionStorage ---
    function loadDraft() {
        const savedInfo = sessionStorage.getItem('hfl_team_info');
        if (savedInfo) {
            const info = JSON.parse(savedInfo);
            teamNameInput.value = info.name || '';
            captainPhoneInput.value = info.phone || '';
            if (info.logo) {
                teamLogoBase64 = info.logo;
                teamLogoPreview.src = info.logo;
                teamLogoPreview.classList.remove('hidden');
                teamLogoPlaceholder.classList.add('hidden');
            }
        }

        const savedPlayers = sessionStorage.getItem('hfl_team_players');
        if (savedPlayers) {
            players = JSON.parse(savedPlayers);
            renderPlayers();
        }
    }

    function saveDraft() {
        try {
            sessionStorage.setItem('hfl_team_info', JSON.stringify({
                name: teamNameInput.value,
                captainPhone: captainPhoneInput.value,
                logo: teamLogoBase64
            }));
            sessionStorage.setItem('hfl_team_players', JSON.stringify(players));
        } catch (e) {
            console.error("Storage error:", e);
            if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
                alert("Diqqat! Brauzeringiz vaqtinchalik xotirasi (Session Storage) to'lib qoldi. Bunga sabab juda ko'p yoki hajmi katta rasmlar yuklaganingizdir. Iltimos, arizani hozir yuboring yoki bazi rasmlarni qayta kichik hajmda yuklang!");
            }
        }
    }

    [teamNameInput, captainPhoneInput].forEach(el => {
        el.addEventListener('input', () => {
            saveDraft();
            debouncedCheckTeam();
        });
    });

    // --- Validation Logic ---
    let checkTimeout;
    function debouncedCheckTeam() {
        clearTimeout(checkTimeout);
        checkTimeout = setTimeout(checkTeamExists, 500);
    }

    async function checkTeamExists() {
        const teamName = teamNameInput.value.trim();
        let phoneVal = captainPhoneInput.value.replace(/\D/g, ''); // just digits

        // Reset visibility
        playersSection.style.display = 'none';
        playersSection.style.opacity = '0';
        submitTeamBtn.style.display = 'none';
        submitTeamBtn.style.opacity = '0';
        validationStatus.innerHTML = '';

        if (teamName.length < 2 || phoneVal.length !== 9) {
            return; // Not enough info to check yet
        }

        // Show loading
        validationStatus.innerHTML = `<span style="color: #94a3b8; display: flex; align-items: center; gap: 8px;"><i data-lucide="loader" class="spin" style="width: 16px; height: 16px;"></i> Ma'lumotlaringizni tekshiryapmiz...</span>`;
        if (window.lucide) lucide.createIcons();

        try {
            // Check db
            const { data, error } = await db
                .from('teams')
                .select('id, name, captain_phone')
                .or(`name.ilike.${teamName},captain_phone.eq.${phoneVal}`);

            if (error) throw error;

            if (data && data.length > 0) {
                // Duplicate found
                validationStatus.innerHTML = `<span style="color: #ef4444; background: rgba(239, 68, 68, 0.1); padding: 10px 15px; border-radius: 8px; display: flex; align-items: center; gap: 8px;"><i data-lucide="alert-circle" style="width: 18px; height: 18px;"></i> Kechirasiz, bu jamoa nomi yoki telefon raqami allaqachon ro'yxatdan o'tgan!</span>`;
                if (window.lucide) lucide.createIcons();
            } else {
                // Success
                validationStatus.innerHTML = `<span style="color: #10b981; display: flex; align-items: center; gap: 8px;"><i data-lucide="check-circle" style="width: 18px; height: 18px;"></i> Davom etishingiz mumkin</span>`;
                if (window.lucide) lucide.createIcons();
                
                // Show players section
                playersSection.style.display = 'block';
                submitTeamBtn.style.display = 'block';
                // slight delay for animation
                setTimeout(() => {
                    playersSection.style.opacity = '1';
                    submitTeamBtn.style.opacity = '1';
                }, 50);
            }
        } catch (err) {
            console.error('Validation error:', err);
            validationStatus.innerHTML = `<span style="color: #ef4444;">Xatolik yuz berdi. Iltimos qayta urinib ko'ring.</span>`;
        }
    }

    // Call check on load in case draft was loaded
    setTimeout(debouncedCheckTeam, 500);

    // --- Cropper Handler ---
    function openCropper(file, target) {
        if (!file.type.startsWith('image/')) {
            alert('Iltimos, faqat rasm yuklang (JPEG, PNG).');
            return;
        }
        currentCropTarget = target;
        const reader = new FileReader();
        reader.onload = (e) => {
            const cropperModal = document.getElementById('cropperModal');
            const cropperImage = document.getElementById('cropperImage');
            
            cropperImage.src = e.target.result;
            cropperModal.classList.remove('hidden');
            
            if (window.cropper) {
                window.cropper.destroy();
            }
            
            window.cropper = new Cropper(cropperImage, {
                aspectRatio: 1,
                viewMode: 1,
                autoCropArea: 1,
            });
        };
        reader.readAsDataURL(file);
    }

    const cancelCropBtn = document.getElementById('cancelCropBtn');
    const confirmCropBtn = document.getElementById('confirmCropBtn');

    if (cancelCropBtn) {
        cancelCropBtn.addEventListener('click', () => {
            document.getElementById('cropperModal').classList.add('hidden');
            if (window.cropper) window.cropper.destroy();
        });
    }

    if (confirmCropBtn) {
        confirmCropBtn.addEventListener('click', () => {
            if (!window.cropper) return;
            
            const canvas = window.cropper.getCroppedCanvas({
                maxWidth: 500,
                maxHeight: 500
            });
            
            if (canvas) {
                const base64 = canvas.toDataURL('image/webp', 0.8);
                
                if (currentCropTarget === 'team') {
                    teamLogoBase64 = base64;
                    teamLogoPreview.src = base64;
                    teamLogoPreview.classList.remove('hidden');
                    teamLogoPlaceholder.classList.add('hidden');
                    saveDraft();
                } else if (currentCropTarget === 'player') {
                    currentPlayerPhotoBase64 = base64;
                    playerPhotoPreview.src = base64;
                    playerPhotoPreview.classList.remove('hidden');
                    playerPhotoPlaceholder.classList.add('hidden');
                }
                
                document.getElementById('cropperModal').classList.add('hidden');
                window.cropper.destroy();
            }
        });
    }

    // --- Team Logo Handling ---
    teamLogoDropzone.addEventListener('click', () => teamLogoInput.click());
    teamLogoInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            openCropper(e.target.files[0], 'team');
        }
    });

    // --- Phone Format ---
    function formatPhoneInput(e) {
        let x = e.target.value.replace(/\D/g, '').match(/(\d{0,2})(\d{0,3})(\d{0,2})(\d{0,2})/);
        if (!x) return;
        e.target.value = !x[2] ? x[1] : x[1] + ' ' + x[2] + (x[3] ? ' ' + x[3] : '') + (x[4] ? ' ' + x[4] : '');
    }
    captainPhoneInput.addEventListener('input', formatPhoneInput);
    playerPhone.addEventListener('input', formatPhoneInput);

    // --- Passport Split Auto-Focus ---
    playerPassportSeries.addEventListener('input', function(e) {
        let val = e.target.value.toUpperCase().replace(/[^A-Z]/g, '');
        e.target.value = val;
        if (val.length === 2) playerPassportNumber.focus();
    });
    playerPassportNumber.addEventListener('input', function(e) {
        let val = e.target.value.replace(/[^0-9]/g, '');
        e.target.value = val;
        if (val.length === 0 && e.inputType === 'deleteContentBackward') {
            playerPassportSeries.focus();
        }
    });

    // --- Player Modal ---
    openPlayerModalBtn.addEventListener('click', () => {
        playerModal.classList.remove('hidden');
    });
    closePlayerModalBtn.addEventListener('click', () => {
        playerModal.classList.add('hidden');
    });

    // --- Player Photo Handling ---
    playerPhotoDropzone.addEventListener('click', () => playerPhotoInput.click());
    playerPhotoInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            openCropper(e.target.files[0], 'player');
        }
    });

    // --- Paste Image Handling for Team and Players ---
    document.addEventListener('paste', (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (let item of items) {
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (!playerModal.classList.contains('hidden')) {
                    // Paste to player photo
                    openCropper(file, 'player');
                } else {
                    // Paste to team logo
                    openCropper(file, 'team');
                }
                break;
            }
        }
    });

    // --- Add Player Form Submit ---
    playerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const submitBtn = playerForm.querySelector('button[type="submit"]');
        
        if (submitBtn.disabled) return; // Prevent double clicking
        
        if (!currentPlayerPhotoBase64) {
            alert('Iltimos, o\'yinchi rasmini yuklang!');
            return;
        }

        const phoneVal = playerPhone.value.replace(/\s/g, '');
        if (phoneVal.length > 0 && phoneVal.length !== 9) {
            alert('Telefon raqami noto\'g\'ri kiritildi.');
            return;
        }
        const fullPhone = phoneVal.length === 9 ? '+998' + phoneVal : '';

        const seriesVal = playerPassportSeries.value.toUpperCase();
        const numberVal = playerPassportNumber.value;
        if ((seriesVal.length > 0 || numberVal.length > 0) && (seriesVal.length !== 2 || numberVal.length !== 7)) {
            alert('Pasport seriyasi yoki raqami to\'liq kiritilmadi.');
            return;
        }

        const birthDateVal = document.getElementById('playerBirthDate') ? document.getElementById('playerBirthDate').value.trim() : '';
        const positionVal = document.getElementById('playerPosition') ? document.getElementById('playerPosition').value : '';
        const numberInputVal = document.getElementById('playerNumber') ? document.getElementById('playerNumber').value : '';

        // UI ni qotib qolmasligi uchun loading holatiga o'tkazish
        const originalBtnText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i data-lucide="loader" class="spin" style="width: 18px; height: 18px; margin-right: 5px; vertical-align: middle;"></i> Qo\'shilmoqda...';
        submitBtn.disabled = true;
        lucide.createIcons();

        // Brauzer ekranni chizib olishi uchun kutish (sun'iy pauza emas, faqat UI render uchun)
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        try {
            const newPlayer = {
                id: crypto.randomUUID(),
                photo: currentPlayerPhotoBase64,
                first_name: playerFirstName.value.trim(),
                last_name: playerLastName.value.trim(),
                father_name: playerFatherName.value.trim(),
                passport_series: seriesVal,
                passport_number: numberVal,
                phone: fullPhone,
                birth_date: birthDateVal,
                position: positionVal,
                player_number: numberInputVal,
                comment: playerComment.value.trim()
            };

            players.push(newPlayer);
            saveDraft();
            renderPlayers();

            // Reset form
            playerForm.reset();
            currentPlayerPhotoBase64 = null;
            playerPhotoPreview.classList.add('hidden');
            playerPhotoPreview.src = "";
            playerPhotoPlaceholder.classList.remove('hidden');
            playerModal.classList.add('hidden');
        } catch (err) {
            console.error("Xatolik:", err);
            alert("Xatolik yuz berdi");
        } finally {
            submitBtn.innerHTML = originalBtnText;
            submitBtn.disabled = false;
        }
    });

    window.removePlayer = function(id) {
        players = players.filter(p => p.id !== id);
        saveDraft();
        renderPlayers();
    };

    function renderPlayers() {
        playerCountEl.textContent = `${players.length} ta`;
        playerCountEl.style.background = players.length >= 8 ? 'var(--success)' : 'var(--primary)';
        
        playerListEl.innerHTML = '';
        players.forEach(p => {
            playerListEl.innerHTML += `
                <div class="player-card">
                    <img src="${p.photo}" alt="${p.first_name}">
                    <div class="player-card-info">
                        <h4>${p.first_name} ${p.last_name}</h4>
                        <p>${p.passport_series}${p.passport_number}</p>
                    </div>
                    <button type="button" class="remove-player" onclick="removePlayer('${p.id}')">
                        <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                    </button>
                </div>
            `;
        });
        lucide.createIcons();
    }

    // --- Submit Full Team ---
    submitTeamBtn.addEventListener('click', async () => {
        const teamLeagueInput = document.getElementById('teamLeague');
        const teamLeague = teamLeagueInput ? teamLeagueInput.value : '';
        const teamName = teamNameInput.value.trim();
        const captainPhoneVal = captainPhoneInput.value.replace(/\s/g, '');

        if (!teamLeague || !teamName || captainPhoneVal.length !== 9 || !teamLogoBase64) {
            alert("Iltimos, turnir, jamoa nomi, sardor telefoni va logotipini to'liq kiriting!");
            return;
        }

        if (players.length === 0) {
            alert("Jamoaga kamida 1 nafar o'yinchi qo'shishingiz kerak!");
            return;
        }

        submitTeamBtn.disabled = true;
        progressModal.classList.remove('hidden');
        
        try {
            const totalUploads = 1 + players.length; // 1 logo + players
            let completedUploads = 0;

            function updateProgress() {
                completedUploads++;
                const percentage = Math.round((completedUploads / totalUploads) * 100);
                progressBar.style.width = `${percentage}%`;
                progressText.textContent = `${percentage}% (${completedUploads}/${totalUploads} ta rasm)`;
            }

            // 1. Upload Team Logo
            const teamId = crypto.randomUUID();
            const logoBlob = dataURLtoBlob(teamLogoBase64);
            const logoExt = logoBlob.type.split('/')[1];
            const logoFileName = `team_${teamId}_logo.${logoExt}`;

            const { error: logoError } = await db.storage
                .from('player-photos')
                .upload(logoFileName, logoBlob);
            if (logoError) throw logoError;
            
            const { data: { publicUrl: teamLogoUrl } } = db.storage
                .from('player-photos')
                .getPublicUrl(logoFileName);
            
            updateProgress();

            // Track uploaded files for rollback in case of error
            let uploadedFiles = [logoFileName];
            
            // 2. Upload Player Photos and Prepare Player Records
            // Using a loop to not overwhelm the network and to track progress smoothly
            const applicationsToInsert = [];
            
            for (let i = 0; i < players.length; i++) {
                const p = players[i];
                const playerBlob = dataURLtoBlob(p.photo);
                const pExt = playerBlob.type.split('/')[1];
                const pFileName = `team_${teamId}_player_${p.id}.${pExt}`;

                const { error: pUploadError } = await db.storage
                    .from('player-photos')
                    .upload(pFileName, playerBlob);
                
                if (pUploadError) {
                    // Rollback all uploaded files so far
                    await db.storage.from('player-photos').remove(uploadedFiles);
                    throw pUploadError;
                }
                
                uploadedFiles.push(pFileName);

                const { data: { publicUrl: pPhotoUrl } } = db.storage
                    .from('player-photos')
                    .getPublicUrl(pFileName);

                const currentOrgId = (window.currentOrg && window.currentOrg.id) ? window.currentOrg.id : 1;

                applicationsToInsert.push({
                    id: p.id,
                    team_id: teamId,
                    photo_url: pPhotoUrl,
                    first_name: p.first_name,
                    last_name: p.last_name,
                    father_name: p.father_name,
                    passport_series: p.passport_series,
                    passport_number: p.passport_number,
                    phone: p.phone,
                    birth_date: p.birth_date,
                    position: p.position,
                    player_number: p.player_number,
                    comment: p.comment,
                    status: 'pending',
                    organization_id: currentOrgId
                });

                updateProgress();
            }

            // 3. Insert Team Record (ONLY after all photos succeeded)
            const fullCaptainPhone = '+998' + captainPhoneVal;
            const currentOrgId = (window.currentOrg && window.currentOrg.id) ? window.currentOrg.id : 1;
            const { error: teamInsertError } = await db
                .from('teams')
                .insert([{
                    id: teamId,
                    name: teamName,
                    league: teamLeague,
                    logo_url: teamLogoUrl,
                    captain_phone: fullCaptainPhone,
                    status: 'pending',
                    organization_id: currentOrgId
                }]);
            
            if (teamInsertError) {
                await db.storage.from('player-photos').remove(uploadedFiles);
                throw teamInsertError;
            }

            // 4. Bulk Insert Players
            const { error: playersInsertError } = await db
                .from('applications')
                .insert(applicationsToInsert);

            if (playersInsertError) {
                // We could delete the team record here too, but at least clean storage
                await db.from('teams').delete().eq('id', teamId);
                await db.storage.from('player-photos').remove(uploadedFiles);
                throw playersInsertError;
            }

            // Done!
            sessionStorage.removeItem('hfl_team_info');
            sessionStorage.removeItem('hfl_team_players');
            
            progressModal.classList.add('hidden');
            
            // Show Success Modal
            const botUsername = 'havasmedialiga_bot';
            const successModal = document.getElementById('successModal');
            const telegramBotBtn = document.getElementById('telegramBotBtn');
            if (successModal && telegramBotBtn) {
                telegramBotBtn.href = `https://t.me/${botUsername}?start=team_${teamId}`;
                successModal.classList.remove('hidden');
            } else {
                setTimeout(() => {
                    window.location.href = `https://t.me/${botUsername}?start=team_${teamId}`;
                }, 3000);
            }

        } catch (err) {
            console.error("Yuborishda xatolik:", err);
            alert("Xatolik yuz berdi: " + err.message);
            progressModal.classList.add('hidden');
            const submitTeamBtn = document.getElementById('submitTeamBtn');
            if (submitTeamBtn) submitTeamBtn.disabled = false;
        }
    });

    // Init
    loadDraft();
});
