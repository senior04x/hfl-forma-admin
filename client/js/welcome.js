document.addEventListener('DOMContentLoaded', () => {
    // Check if we already showed the welcome screen in this session
    if (sessionStorage.getItem('hfl_welcome_shown')) {
        const welcomeScreen = document.getElementById('welcome-screen');
        if (welcomeScreen) {
            welcomeScreen.style.display = 'none';
        }
        // Tell the rest of the app (like 3D models) to proceed immediately
        window.dispatchEvent(new Event('welcomeScreenFinished'));
        return;
    }

    const welcomeScreen = document.getElementById('welcome-screen');
    const welcomeTextContainer = document.querySelector('.welcome-text');

    if (welcomeScreen && welcomeTextContainer) {
        // Block body scrolling
        document.body.style.overflow = 'hidden';
        
        // Mark as shown for this session so it won't show if they return to home page
        sessionStorage.setItem('hfl_welcome_shown', 'true');

        // Split text into spans for letter-by-letter animation
        const text = "HAVAS LIGA";
        welcomeTextContainer.innerHTML = '';
        text.split('').forEach((char, index) => {
            const span = document.createElement('span');
            span.textContent = char === ' ' ? '\u00A0' : char; // Keep space
            span.className = 'welcome-letter';
            span.style.animationDelay = `${index * 0.08}s`; // Faster stagger effect
            welcomeTextContainer.appendChild(span);
        });

        // Hide the screen at 1.5s total time (animation finishes around 1.1s)
        setTimeout(() => {
            welcomeScreen.classList.add('hidden');
            
            // Dispatch event to notify that welcome screen is done
            window.dispatchEvent(new Event('welcomeScreenFinished'));
            
            // Restore body scrolling
            document.body.style.overflow = '';
            
            // Remove from DOM entirely after fade out
            setTimeout(() => {
                welcomeScreen.remove();
            }, 500); // Wait for the transition to finish (0.5s)
        }, 1500); // 1.5 seconds until fade out begins
    }
});
