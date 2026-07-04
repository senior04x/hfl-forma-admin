document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const teamNameInput = document.getElementById('teamName');
    const captainPhoneInput = document.getElementById('captainPhone');
    const teamLogoDropzone = document.getElementById('teamLogoDropzone');
    const teamLogoInput = document.getElementById('teamLogoInput');
    const teamLogoPreview = document.getElementById('teamLogoPreview');
    const teamLogoPlaceholder = document.getElementById('teamLogoPlaceholder');
    
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

    // --- State ---
    let teamLogoBase64 = null;
    let currentPlayerPhotoBase64 = null;
    let players = [];

    // --- Compression Utility (to save space in sessionStorage and fast uploads) ---
    function compressImageToBase64(file, maxWidth, maxHeight, quality) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = function (event) {
                const img = new Image();
                img.src = event.target.result;
                img.onload = function () {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > maxWidth) {
                            height = Math.round((height *= maxWidth / width));
                            width = maxWidth;
                        }
                    } else {
                        if (height > maxHeight) {
                            width = Math.round((width *= maxHeight / height));
                            height = maxHeight;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL(file.type, quality));
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
        sessionStorage.setItem('hfl_team_info', JSON.stringify({
            name: teamNameInput.value,
            phone: captainPhoneInput.value,
            logo: teamLogoBase64
        }));
        sessionStorage.setItem('hfl_team_players', JSON.stringify(players));
    }

    [teamNameInput, captainPhoneInput].forEach(el => {
        el.addEventListener('input', saveDraft);
    });

    // --- Team Logo Handling ---
    teamLogoDropzone.addEventListener('click', () => teamLogoInput.click());
    teamLogoInput.addEventListener('change', async (e) => {
        if (e.target.files && e.target.files[0]) {
            const base64 = await compressImageToBase64(e.target.files[0], 400, 400, 0.7);
            teamLogoBase64 = base64;
            teamLogoPreview.src = base64;
            teamLogoPreview.classList.remove('hidden');
            teamLogoPlaceholder.classList.add('hidden');
            saveDraft();
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
    playerPhotoInput.addEventListener('change', async (e) => {
        if (e.target.files && e.target.files[0]) {
            const base64 = await compressImageToBase64(e.target.files[0], 500, 500, 0.7);
            currentPlayerPhotoBase64 = base64;
            playerPhotoPreview.src = base64;
            playerPhotoPreview.classList.remove('hidden');
            playerPhotoPlaceholder.classList.add('hidden');
        }
    });

    // --- Paste Image Handling for Team and Players ---
    document.addEventListener('paste', async (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (let item of items) {
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (!playerModal.classList.contains('hidden')) {
                    // Paste to player photo
                    const base64 = await compressImageToBase64(file, 500, 500, 0.7);
                    currentPlayerPhotoBase64 = base64;
                    playerPhotoPreview.src = base64;
                    playerPhotoPreview.classList.remove('hidden');
                    playerPhotoPlaceholder.classList.add('hidden');
                } else {
                    // Paste to team logo
                    const base64 = await compressImageToBase64(file, 400, 400, 0.7);
                    teamLogoBase64 = base64;
                    teamLogoPreview.src = base64;
                    teamLogoPreview.classList.remove('hidden');
                    teamLogoPlaceholder.classList.add('hidden');
                    saveDraft();
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
        const teamName = teamNameInput.value.trim();
        const captainPhoneVal = captainPhoneInput.value.replace(/\s/g, '');

        if (!teamName || captainPhoneVal.length !== 9 || !teamLogoBase64) {
            alert("Iltimos, jamoa nomi, sardor telefoni va logotipini to'liq kiriting!");
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

            // 2. Insert Team Record
            const fullCaptainPhone = '+998' + captainPhoneVal;
            const { error: teamInsertError } = await db
                .from('teams')
                .insert([{
                    id: teamId,
                    name: teamName,
                    logo_url: teamLogoUrl,
                    captain_phone: fullCaptainPhone,
                    status: 'pending'
                }]);
            
            if (teamInsertError) throw teamInsertError;

            // 3. Upload Player Photos and Prepare Player Records
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
                
                if (pUploadError) throw pUploadError;

                const { data: { publicUrl: pPhotoUrl } } = db.storage
                    .from('player-photos')
                    .getPublicUrl(pFileName);

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
                    status: 'pending'
                });

                updateProgress();
            }

            // 4. Bulk Insert Players
            const { error: playersInsertError } = await db
                .from('applications')
                .insert(applicationsToInsert);

            if (playersInsertError) throw playersInsertError;

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
