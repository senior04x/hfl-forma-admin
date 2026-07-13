import React, { useState, useRef } from 'react';
import './SwipeRow.css';

const SwipeRow = ({ children, actions }) => {
  const [translateX, setTranslateX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const currentTranslateX = useRef(0);
  const isVerticalScroll = useRef(false);
  const maxSwipe = 120; // 2 buttons * 60px width
  
  const handleTouchStart = (e) => {
    if (window.innerWidth > 768) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isVerticalScroll.current = false;
    setIsSwiping(true);
  };

  const handleTouchMove = (e) => {
    if (!isSwiping || touchStartX.current === null) return;
    
    const touchCurrentX = e.touches[0].clientX;
    const touchCurrentY = e.touches[0].clientY;
    
    const diffX = touchCurrentX - touchStartX.current;
    const diffY = touchCurrentY - touchStartY.current;
    
    // Determine if user is scrolling vertically
    if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 5) {
      isVerticalScroll.current = true;
    }
    
    // If vertical scroll detected, ignore horizontal swipe
    if (isVerticalScroll.current) return;
    
    // If scrolling horizontally
    if (Math.abs(diffX) > 10) {
      // Prevent vertical scrolling while swiping horizontally
      if (e.cancelable) e.preventDefault();
      
      let newTranslate = currentTranslateX.current + diffX;
      if (newTranslate > 0) newTranslate = 0;
      if (newTranslate < -maxSwipe - 50) newTranslate = -maxSwipe - 50; 
      
      setTranslateX(newTranslate);
    }
  };

  const handleTouchEnd = () => {
    setIsSwiping(false);
    touchStartX.current = null;
    touchStartY.current = null;
    isVerticalScroll.current = false;
    
    // Snap logic
    if (translateX < -(maxSwipe / 2)) {
      setTranslateX(-maxSwipe);
      currentTranslateX.current = -maxSwipe;
    } else {
      setTranslateX(0);
      currentTranslateX.current = 0;
    }
  };

  return (
    <div className="swipe-row-container">
      <div className="swipe-actions">
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
        <div className="list-row">
          {children}
        </div>
      </div>
    </div>
  );
};

export default SwipeRow;

