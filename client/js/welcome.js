document.addEventListener('DOMContentLoaded', () => {
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
            
            // Dispatch event to notify that welcome screen is done
            window.dispatchEvent(new Event('welcomeScreenFinished'));
            
            // Restore body scrolling
            document.body.style.overflow = '';
            
            // Remove from DOM entirely after fade out
            setTimeout(() => {
                welcomeScreen.remove();
            }, 1500); // Wait for the transition to finish (1.5s)
        }, 3000); // 3 seconds until fade out begins
    }
});
