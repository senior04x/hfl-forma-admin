// layout.js - Dynamically injects Navbar and global layout elements
document.addEventListener('DOMContentLoaded', () => {
    // Insert Navbar at the top of the body
    const navbarHTML = `
        <nav class="navbar">
            <a href="index.html" class="nav-logo">
                <img src="images/logo.png" alt="Havas Liga" onerror="this.src='https://via.placeholder.com/40x40?text=HL'">
                <h1>Havas Liga</h1>
            </a>
            
            <div class="nav-links" id="navLinks">
                <a href="index.html" class="${window.location.pathname.endsWith('index.html') || window.location.pathname === '/' ? 'active' : ''}">Bosh Sahifa</a>
                <a href="teams.html" class="${window.location.pathname.endsWith('teams.html') || window.location.pathname.endsWith('team-details.html') ? 'active' : ''}">Jamoalar</a>
                <a href="apply.html" class="nav-btn">Ro'yxatdan o'tish</a>
            </div>
            
            <button class="mobile-menu-btn" id="mobileMenuBtn">
                <i data-lucide="menu"></i>
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
        });
    }
});
