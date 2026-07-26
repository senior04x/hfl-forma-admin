// layout.js - Dynamically injects Navbar and global layout elements
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const orgParam = urlParams.get('org');
    const orgQuery = orgParam ? `?org=${encodeURIComponent(orgParam)}` : '';

    // Insert Navbar at the top of the body
    const navbarHTML = `
        <nav class="navbar">
            <a href="index.html${orgQuery}" class="nav-logo">
                <img src="images/logo.png" alt="Havas Liga" onerror="this.onerror=null; this.src='https://via.placeholder.com/40x40?text=HL'">
                <h1>Havas Liga</h1>
            </a>
            
            <div class="nav-links" id="navLinks">
                <a href="index.html${orgQuery}" class="${window.location.pathname.endsWith('index.html') || window.location.pathname === '/' ? 'active' : ''}">Bosh Sahifa</a>
                <a href="teams.html${orgQuery}" class="${window.location.pathname.endsWith('teams.html') || window.location.pathname.endsWith('team-details.html') ? 'active' : ''}">Jamoalar</a>
                <a href="matches.html${orgQuery}" class="${window.location.pathname.endsWith('matches.html') ? 'active' : ''}">O'yinlar</a>
                <a href="standings.html${orgQuery}" class="${window.location.pathname.endsWith('standings.html') ? 'active' : ''}">Turnir jadvali</a>
                <a href="apply.html${orgQuery}" class="nav-btn">Ro'yxatdan o'tish</a>
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
