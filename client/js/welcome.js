document.addEventListener('DOMContentLoaded', () => {
    // Check if we already showed the welcome screen in this session
    if (sessionStorage.getItem('hfl_welcome_shown')) {
        const welcomeScreen = document.getElementById('welcome-screen');
        if (welcomeScreen) {
            welcomeScreen.style.display = 'none';
        }
        return;
    }

    const welcomeScreen = document.getElementById('welcome-screen');
    const welcomeTextContainer = document.querySelector('.welcome-text');

    if (welcomeScreen && welcomeTextContainer) {
        // Block body scrolling
        document.body.style.overflow = 'hidden';

        // Split text into spans for letter-by-letter animation
        const text = "HAVAS LIGA";
        welcomeTextContainer.innerHTML = '';
        text.split('').forEach((char, index) => {
            const span = document.createElement('span');
            span.textContent = char === ' ' ? '\u00A0' : char; // Keep space
            span.className = 'welcome-letter';
            span.style.animationDelay = `${index * 0.15}s`; // Stagger effect
            welcomeTextContainer.appendChild(span);
        });

        // The longest animation delay is for the 9th character (index 9) * 0.15s = 1.35s
        // Animation itself takes around 1s. Total ~2.5s.
        // Let's hide the screen at 3.5s.
        setTimeout(() => {
            welcomeScreen.classList.add('hidden');
            
            // Mark as shown for this session
            sessionStorage.setItem('hfl_welcome_shown', 'true');
            
            // Dispatch event to notify that welcome screen is done
            window.dispatchEvent(new Event('welcomeScreenFinished'));
            
            // Restore body scrolling
            document.body.style.overflow = '';
            
            // Remove from DOM entirely after fade out
            setTimeout(() => {
                welcomeScreen.remove();
            }, 800); // Wait for the transition to finish
        }, 3500);
    }
});
