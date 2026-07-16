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
    const welcomeText = document.querySelector('.welcome-text');
    const welcomeLogo = document.querySelector('.welcome-logo');

    if (welcomeScreen && welcomeText && welcomeLogo) {
        // Block body scrolling
        document.body.style.overflow = 'hidden';

        // Start text animation slightly after load
        setTimeout(() => {
            welcomeText.classList.add('animate');
        }, 300);

        // The text animation takes 2 seconds.
        // It drops down at the end (from 60% to 100% of the 2s, so around 1.2s to 2.0s).
        // Let's fade in the logo right as the text starts dropping (e.g. at 1.5s).
        setTimeout(() => {
            welcomeLogo.classList.add('show');
        }, 1500);

        // Hide the whole screen after everything is done + a little reading time
        // 2000ms text animation + 1000ms pause = 3000ms
        setTimeout(() => {
            welcomeScreen.classList.add('hidden');
            
            // Mark as shown for this session
            sessionStorage.setItem('hfl_welcome_shown', 'true');
            
            // Restore body scrolling
            document.body.style.overflow = '';
            
            // Remove from DOM entirely after fade out
            setTimeout(() => {
                welcomeScreen.remove();
            }, 800); // Wait for the transition to finish
        }, 3500);
    }
});
