// layout.js - Dynamically injects Navbar and global layout elements
document.addEventListener('DOMContentLoaded', () => {
    function getUrl(path) {
        if (typeof window.buildOrgUrl === 'function') {
            return window.buildOrgUrl(path);
        }
        const urlParams = new URLSearchParams(window.location.search);
        const orgParam = urlParams.get('org');
        return orgParam ? `${path}?org=${encodeURIComponent(orgParam)}` : path;
    }

    const homeUrl = getUrl('index.html');
    const teamsUrl = getUrl('teams.html');
    const matchesUrl = getUrl('matches.html');
    const standingsUrl = getUrl('standings.html');
    const applyUrl = getUrl('apply.html');

    // Insert Navbar at the top of the body
    const navbarHTML = `
        <nav class="navbar">
            <a href="${homeUrl}" class="nav-logo">
                <img src="images/logo.png" alt="Havas Liga" onerror="this.onerror=null; this.src='https://via.placeholder.com/40x40?text=HL'">
                <h1>Havas Liga</h1>
            </a>
            
            <div class="nav-links" id="navLinks">
                <a href="${homeUrl}" class="${window.location.pathname.endsWith('index.html') || window.location.pathname === '/' ? 'active' : ''}">Bosh Sahifa</a>
                <a href="${teamsUrl}" class="${window.location.pathname.includes('teams') || window.location.pathname.includes('team-details') ? 'active' : ''}">Jamoalar</a>
                <a href="${matchesUrl}" class="${window.location.pathname.includes('matches') || window.location.pathname.includes('match-details') ? 'active' : ''}">O'yinlar</a>
                <a href="${standingsUrl}" class="${window.location.pathname.includes('standings') ? 'active' : ''}">Turnir jadvali</a>
                <a href="${applyUrl}" class="nav-btn">Ro'yxatdan o'tish</a>
            </div>
            
            <button class="mobile-menu-btn" id="mobileMenuBtn">
                <i data-lucide="menu" class="icon-menu"></i>
                <i data-lucide="x" class="icon-x"></i>
            </button>
        </nav>
    `;
    
    document.body.insertAdjacentHTML('afterbegin', navbarHTML);
    
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
    
    // Mobile Menu Toggle
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const navLinks = document.getElementById('navLinks');
    
    if (mobileMenuBtn && navLinks) {
        mobileMenuBtn.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            mobileMenuBtn.classList.toggle('active');
        });

        // Close menu when clicking outside
        document.addEventListener('click', (event) => {
            if (navLinks.classList.contains('active') && 
                !navLinks.contains(event.target) && 
                !mobileMenuBtn.contains(event.target)) {
                navLinks.classList.remove('active');
                mobileMenuBtn.classList.remove('active');
            }
        });
    }
});
