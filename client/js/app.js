document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const form = document.getElementById('registrationForm');
    const photoDropzone = document.getElementById('photoDropzone');
    const photoInput = document.getElementById('photoInput');
    const photoPreview = document.getElementById('photoPreview');
    const photoPlaceholder = document.getElementById('photoPlaceholder');
    const phoneInput = document.getElementById('phone');
    const passportSeries = document.getElementById('passportSeries');
    const passportNumber = document.getElementById('passportNumber');
    const submitBtn = document.getElementById('submitBtn');
    const btnText = submitBtn.querySelector('.btn-text');
    const loader = submitBtn.querySelector('.loader');
    const successModal = document.getElementById('successModal');
    const telegramBotBtn = document.getElementById('telegramBotBtn');

    // State
    let selectedFile = null;
    const BOT_USERNAME = 'havasmedialiga_bot'; 
    const tournamentSelect = document.getElementById('tournamentSelect');
    const teamSelect = document.getElementById('teamSelect');
    const viewTeamBtn = document.getElementById('viewTeamBtn');
    let allTeams = [];

    // Fetch Teams & Initialize Org Leagues
    async function initApp() {
        if (typeof window.resolveOrg === 'function') {
            await window.resolveOrg();
        }
        await fetchTeams();
        populateLeagues();
    }

    function populateLeagues() {
        if (!tournamentSelect) return;
        tournamentSelect.innerHTML = '<option value="" disabled selected>Turnirni tanlang</option>';

        let leagueNames = [];
        if (window.orgLeagues && window.orgLeagues.length > 0) {
            leagueNames = window.orgLeagues.map(l => l.name);
        } else if (allTeams && allTeams.length > 0) {
            leagueNames = Array.from(new Set(
                allTeams.flatMap(t => t.league ? t.league.split(',').map(s => s.trim()) : []).filter(Boolean)
            )).sort();
        } else {
            leagueNames = ['Super liga', 'Pro liga', '3-liga', '7x7 liga'];
        }

        leagueNames.forEach(lName => {
            const opt = document.createElement('option');
            opt.value = lName;
            opt.textContent = lName;
            tournamentSelect.appendChild(opt);
        });
    }

    async function fetchTeams() {
        if (!teamSelect) return;
        try {
            const currentOrgId = (window.currentOrg && window.currentOrg.id) ? window.currentOrg.id : 1;
            const { data, error } = await db
                .from('teams')
                .select('id, name, league, organization_id')
                .eq('organization_id', currentOrgId)
                .in('status', ['approved', 'partially_approved'])
                .order('name');
                
            if (error) throw error;
            
            if (data) {
                allTeams = data;
            }
        } catch (err) {
            console.error('Error fetching teams:', err);
        }
    }
    
    initApp();

    // Cascading dropdown logic
    if (tournamentSelect && teamSelect) {
        tournamentSelect.addEventListener('change', () => {
            const selectedLeague = tournamentSelect.value;
            teamSelect.innerHTML = '<option value="" disabled selected>Jamoani tanlang</option>';
            
            const filteredTeams = allTeams.filter(t => t.league && t.league.split(',').map(s => s.trim()).includes(selectedLeague));
            
            if (filteredTeams.length > 0) {
                filteredTeams.forEach(team => {
                    const option = document.createElement('option');
                    option.value = team.id;
                    option.textContent = team.name;
                    teamSelect.appendChild(option);
                });
                teamSelect.disabled = false;
            } else {
                teamSelect.innerHTML = '<option value="" disabled selected>Bu turnirda tasdiqlangan jamoalar yo\'q</option>';
                teamSelect.disabled = true;
            }
            
            if (viewTeamBtn) viewTeamBtn.style.display = 'none';
        });
        
        teamSelect.addEventListener('change', () => {
            if (teamSelect.value && viewTeamBtn) {
                viewTeamBtn.style.display = 'flex';
            } else if (viewTeamBtn) {
                viewTeamBtn.style.display = 'none';
            }
        });
        
        if (viewTeamBtn) {
            viewTeamBtn.addEventListener('click', () => {
                if (teamSelect.value) {
                    const teamUrl = window.getUrl ? window.getUrl(`team-details.html?id=${teamSelect.value}&from=individual`) : `team-details.html?id=${teamSelect.value}&from=individual`;
                    window.location.href = teamUrl;
                }
            });
        }
    }
    // --- Phone Number Formatting ---
    phoneInput.addEventListener('input', function (e) {
        let x = e.target.value.replace(/\D/g, '').match(/(\d{0,2})(\d{0,3})(\d{0,2})(\d{0,2})/);
        if (!x) return;
        e.target.value = !x[2] ? x[1] : x[1] + ' ' + x[2] + (x[3] ? ' ' + x[3] : '') + (x[4] ? ' ' + x[4] : '');
    });

    // --- Passport Input Validation & Auto-Focus ---
    passportSeries.addEventListener('input', function(e) {
        let val = e.target.value.toUpperCase().replace(/[^A-Z]/g, '');
        e.target.value = val;
        
        // Auto-focus to number input when 2 letters are typed
        if (val.length === 2) {
            passportNumber.focus();
        }
    });

    passportNumber.addEventListener('input', function(e) {
        let val = e.target.value.replace(/[^0-9]/g, '');
        e.target.value = val;
        
        // Backspace auto-focus back to series if empty
        if (val.length === 0 && e.inputType === 'deleteContentBackward') {
            passportSeries.focus();
        }
    });

    // --- Photo Upload Handling ---
    photoDropzone.addEventListener('click', () => photoInput.click());
    
    photoDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        photoDropzone.classList.add('dragover');
    });

    photoDropzone.addEventListener('dragleave', () => {
        photoDropzone.classList.remove('dragover');
    });

    photoDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        photoDropzone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    });

    photoInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            handleFileSelect(e.target.files[0]);
        }
    });

    function handleFileSelect(file) {
        if (!file.type.startsWith('image/')) {
            alert('Iltimos, faqat rasm yuklang (JPEG, PNG).');
            return;
        }
        
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

    // --- Cropper Buttons ---
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
                maxWidth: 600,
                maxHeight: 600
            });
            
            if (canvas) {
                canvas.toBlob((blob) => {
                    selectedFile = new File([blob], "cropped_image.webp", { type: 'image/webp', lastModified: Date.now() });
                    
                    photoPreview.src = canvas.toDataURL('image/webp', 0.8);
                    photoPreview.classList.remove('hidden');
                    photoPlaceholder.classList.add('hidden');
                    
                    document.getElementById('cropperModal').classList.add('hidden');
                    window.cropper.destroy();
                }, 'image/webp', 0.8);
            }
        });
    }
    // --- Paste Image Handling ---
    document.addEventListener('paste', (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (let item of items) {
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                const file = item.getAsFile();
                handleFileSelect(file);
                break;
            }
        }
    });

    // --- Form Submission ---
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!selectedFile) {
            alert('Iltimos, rasmingizni yuklang.');
            return;
        }

        const phoneVal = phoneInput.value.replace(/\s/g, '');
        if (phoneVal.length > 0 && phoneVal.length !== 9) {
            alert('Telefon raqami noto\'g\'ri kiritildi.');
            return;
        }
        const fullPhone = phoneVal.length === 9 ? '+998' + phoneVal : '';

        const seriesVal = passportSeries.value.toUpperCase();
        const numberVal = passportNumber.value;
        if ((seriesVal.length > 0 || numberVal.length > 0) && (seriesVal.length !== 2 || numberVal.length !== 7)) {
            alert('Pasport seriyasi yoki raqami to\'liq kiritilmadi.');
            return;
        }

        const birthDateVal = document.getElementById('birthDate') ? document.getElementById('birthDate').value.trim() : '';
        const positionVal = document.getElementById('playerPosition') ? document.getElementById('playerPosition').value : '';
        const numberInputVal = document.getElementById('playerNumber') ? document.getElementById('playerNumber').value : '';

        setLoading(true);

        try {
            // 1. Compress Image
            const compressedImage = await compressImage(selectedFile, 600, 600, 0.6);
            
            // 2. Upload to Supabase Storage
            const fileExt = compressedImage.name.split('.').pop();
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
            const filePath = `${fileName}`;

            const { data: uploadData, error: uploadError } = await db.storage
                .from('player-photos')
                .upload(filePath, compressedImage);

            if (uploadError) throw uploadError;

            // Get Public URL
            const { data: { publicUrl } } = db.storage
                .from('player-photos')
                .getPublicUrl(filePath);

            const currentOrgId = (window.currentOrg && window.currentOrg.id) ? window.currentOrg.id : 1;
            const applicationId = crypto.randomUUID();
            const applicationData = {
                id: applicationId,
                photo_url: publicUrl,
                first_name: document.getElementById('firstName').value.trim(),
                last_name: document.getElementById('lastName').value.trim(),
                father_name: document.getElementById('fatherName').value.trim(),
                passport_series: seriesVal,
                passport_number: numberVal,
                phone: fullPhone,
                birth_date: birthDateVal,
                position: positionVal,
                player_number: numberInputVal,
                comment: '[INDIVIDUAL]' + document.getElementById('comment').value.trim(),
                team_id: teamSelect ? (teamSelect.value || null) : null,
                status: 'pending',
                organization_id: currentOrgId
            };

            const { error: insertError } = await db
                .from('applications')
                .insert([applicationData]);

            if (insertError) throw insertError;
            
            // 4. Show Success & Setup Deep Link
            telegramBotBtn.href = `https://t.me/${BOT_USERNAME}?start=app_${applicationId}`;
            successModal.classList.remove('hidden');

            createConfetti();

        } catch (error) {
            console.error('Submission error:', error);
            alert('Xatolik yuz berdi. Iltimos qayta urinib ko\'ring.\n' + error.message);
        } finally {
            setLoading(false);
        }
    });

    function setLoading(isLoading) {
        submitBtn.disabled = isLoading;
        if (isLoading) {
            btnText.classList.add('hidden');
            loader.classList.remove('hidden');
        } else {
            btnText.classList.remove('hidden');
            loader.classList.add('hidden');
        }
    }

    // --- Premium Confetti Effect ---
    function createConfetti() {
        const colors = ['#f0d060', '#c9a84c', '#ffffff', '#10b981'];
        for (let i = 0; i < 70; i++) {
            const confetti = document.createElement('div');
            confetti.style.position = 'fixed';
            confetti.style.width = Math.random() > 0.5 ? '10px' : '6px';
            confetti.style.height = Math.random() > 0.5 ? '15px' : '6px';
            confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.top = '-20px';
            confetti.style.left = Math.random() * 100 + 'vw';
            confetti.style.zIndex = '9999';
            confetti.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
            confetti.style.transform = `rotate(${Math.random() * 360}deg)`;
            
            document.body.appendChild(confetti);

            const animationDuration = Math.random() * 2 + 1.5;
            confetti.animate([
                { transform: `translateY(0) rotate(0) scale(1)`, opacity: 1 },
                { transform: `translateY(110vh) rotate(${Math.random() * 720}deg) scale(0.5)`, opacity: 0 }
            ], {
                duration: animationDuration * 1000,
                easing: 'cubic-bezier(.37,0,.63,1)',
                fill: 'forwards'
            });

            setTimeout(() => {
                confetti.remove();
            }, animationDuration * 1000);
        }
    }
});
