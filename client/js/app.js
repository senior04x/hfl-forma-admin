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
    const teamSelect = document.getElementById('teamSelect');

    // Fetch Teams
    async function fetchTeams() {
        if (!teamSelect) return;
        try {
            const { data, error } = await db
                .from('teams')
                .select('id, name')
                .eq('status', 'approved')
                .order('name');
                
            if (error) throw error;
            
            if (data && data.length > 0) {
                data.forEach(team => {
                    const option = document.createElement('option');
                    option.value = team.id;
                    option.textContent = team.name;
                    teamSelect.appendChild(option);
                });
            }
        } catch (err) {
            console.error('Error fetching teams:', err);
        }
    }
    
    fetchTeams();
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
        selectedFile = file;
        const reader = new FileReader();
        reader.onload = (e) => {
            photoPreview.src = e.target.result;
            photoPreview.classList.remove('hidden');
            photoPlaceholder.classList.add('hidden');
        };
        reader.readAsDataURL(file);
    }

    // --- Form Submission ---
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!selectedFile) {
            alert('Iltimos, rasmingizni yuklang.');
            return;
        }

        const phoneVal = phoneInput.value.replace(/\s/g, '');
        if (phoneVal.length !== 9) {
            alert('Telefon raqami noto\'g\'ri kiritildi.');
            return;
        }
        const fullPhone = '+998' + phoneVal;

        const seriesVal = passportSeries.value.toUpperCase();
        const numberVal = passportNumber.value;
        if (seriesVal.length !== 2 || numberVal.length !== 7) {
            alert('Pasport seriyasi yoki raqami to\'liq kiritilmadi.');
            return;
        }

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
                comment: document.getElementById('comment').value.trim(),
                team_id: teamSelect ? (teamSelect.value || null) : null,
                status: 'pending'
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
