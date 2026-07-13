import React, { useState, useRef } from 'react';
import './SwipeRow.css';

const SwipeRow = ({ children, actions }) => {
  const [translateX, setTranslateX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartX = useRef(null);
  const currentTranslateX = useRef(0);
  const maxSwipe = 150; // max distance to swipe (width of actions)

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    setIsSwiping(true);
  };

  const handleTouchMove = (e) => {
    if (!isSwiping || touchStartX.current === null) return;
    const touchCurrentX = e.touches[0].clientX;
    const diff = touchCurrentX - touchStartX.current;
    
    // If scrolling horizontally
    if (Math.abs(diff) > 10) {
      // Only allow swiping left (negative diff)
      let newTranslate = currentTranslateX.current + diff;
      if (newTranslate > 0) newTranslate = 0;
      if (newTranslate < -maxSwipe - 50) newTranslate = -maxSwipe - 50; // allow some rubber banding
      
      setTranslateX(newTranslate);
    }
  };

  const handleTouchEnd = () => {
    setIsSwiping(false);
    touchStartX.current = null;
    
    // Snap logic
    if (translateX < -(maxSwipe / 2)) {
      setTranslateX(-maxSwipe);
      currentTranslateX.current = -maxSwipe;
    } else {
      setTranslateX(0);
      currentTranslateX.current = 0;
    }
  };

  // Close when clicked elsewhere
  const handleOuterClick = () => {
    if (currentTranslateX.current === -maxSwipe) {
      setTranslateX(0);
      currentTranslateX.current = 0;
    }
  };

  return (
    <div className="swipe-row-container" onClick={handleOuterClick}>
      <div 
        className="swipe-actions"
        style={{ width: maxSwipe }}
      >
        {actions}
      </div>
      
      <div 
        className="swipe-content"
        style={{ 
          transform: `translateX(${translateX}px)`,
          transition: isSwiping ? 'none' : 'transform 0.3s cubic-bezier(0.1, 0.7, 0.1, 1)'
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
};

export default SwipeRow;

