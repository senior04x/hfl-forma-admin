const SUPABASE_URL = 'https://xzzyhfyazwohdqqbjiiy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6enloZnlhendvaGRxcWJqaWl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxMDM1NTEsImV4cCI6MjA5ODY3OTU1MX0.8KPZxd060ps2pc3oeDzBA9UG3fdHj_lPjnLhq0Q5eaM';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const errorMsg = document.getElementById('errorMsg');
    const loginBtn = document.getElementById('loginBtn');

    // Check if already logged in
    checkSession();

    if(loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            errorMsg.style.display = 'none';
            loginBtn.disabled = true;
            loginBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Kutilmoqda...';
            lucide.createIcons();

            let username = document.getElementById('username').value.trim();
            const password = document.getElementById('password').value.trim();

            // Append domain if it's just a username
            if (!username.includes('@')) {
                username = `${username}@havas.uz`;
            }

            try {
                const { data, error } = await db.auth.signInWithPassword({
                    email: username,
                    password: password,
                });

                if (error) throw error;

                // Success, redirect to dashboard
                window.location.href = 'dashboard.html';
            } catch (error) {
                console.error('Login error:', error);
                errorMsg.textContent = 'Login yoki parol xato!';
                errorMsg.style.display = 'block';
                
                loginBtn.disabled = false;
                loginBtn.innerHTML = '<i data-lucide="log-in" width="20"></i> Tizimga kirish';
                lucide.createIcons();
            }
        });
    }

    async function checkSession() {
        const { data: { session } } = await db.auth.getSession();
        
        const isLoginPage = window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('admin/') || window.location.pathname.endsWith('admin');
        
        if (session) {
            // Logged in
            if (isLoginPage) {
                window.location.href = 'dashboard.html';
            }
        } else {
            // Not logged in
            if (!isLoginPage) {
                window.location.href = 'index.html';
            }
        }
    }
});
