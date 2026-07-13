import React, { useState, useRef, useEffect, useId } from 'react';
import './SwipeRow.css';

const SwipeRow = ({ children, actions }) => {
  const rowId = useId();
  const [translateX, setTranslateX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const currentTranslateX = useRef(0);
  const isVerticalScroll = useRef(false);
  const isSwipingRef = useRef(false);
  const contentRef = useRef(null);
  const maxSwipe = 120; // 2 buttons * 60px width
  
  useEffect(() => {
    const handleCloseOthers = (e) => {
      if (e.detail.id !== rowId) {
        setTranslateX(0);
        currentTranslateX.current = 0;
      }
    };
    window.addEventListener('swipeRowOpened', handleCloseOthers);
    return () => window.removeEventListener('swipeRowOpened', handleCloseOthers);
  }, [rowId]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const handleTouchStart = (e) => {
      if (window.innerWidth > 768) return;
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
      isVerticalScroll.current = false;
      isSwipingRef.current = true;
      setIsSwiping(true);
    };

    const handleTouchMove = (e) => {
      if (!isSwipingRef.current || touchStartX.current === null) return;
      
      const touchCurrentX = e.touches[0].clientX;
      const touchCurrentY = e.touches[0].clientY;
      
      const diffX = touchCurrentX - touchStartX.current;
      const diffY = touchCurrentY - touchStartY.current;
      
      if (!isVerticalScroll.current && Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 5) {
        isVerticalScroll.current = true;
      }
      
      if (isVerticalScroll.current) return;
      
      if (Math.abs(diffX) > 10) {
        if (e.cancelable) e.preventDefault();
        
        let newTranslate = currentTranslateX.current + diffX;
        if (newTranslate > 0) newTranslate = 0;
        if (newTranslate < -maxSwipe - 50) newTranslate = -maxSwipe - 50; 
        
        setTranslateX(newTranslate);
      }
    };

    const handleTouchEnd = () => {
      isSwipingRef.current = false;
      setIsSwiping(false);
      touchStartX.current = null;
      touchStartY.current = null;
      isVerticalScroll.current = false;
      
      setTranslateX(prev => {
        if (prev < -(maxSwipe / 2)) {
          currentTranslateX.current = -maxSwipe;
          window.dispatchEvent(new CustomEvent('swipeRowOpened', { detail: { id: rowId } }));
          return -maxSwipe;
        } else {
          currentTranslateX.current = 0;
          return 0;
        }
      });
    };

    content.addEventListener('touchstart', handleTouchStart, { passive: false });
    content.addEventListener('touchmove', handleTouchMove, { passive: false });
    content.addEventListener('touchend', handleTouchEnd);

    return () => {
      content.removeEventListener('touchstart', handleTouchStart);
      content.removeEventListener('touchmove', handleTouchMove);
      content.removeEventListener('touchend', handleTouchEnd);
    };
  }, [rowId]);

  return (
    <div className="swipe-row-container">
      <div className="swipe-actions">
        {actions}
      </div>
      <div 
        ref={contentRef}
        className="swipe-content"
        style={{ 
          transform: `translateX(${translateX}px)`,
          transition: isSwiping ? 'none' : 'transform 0.3s cubic-bezier(0.1, 0.7, 0.1, 1)',
          touchAction: 'pan-y'
        }}
      >
        <div className="list-row">
          {children}
        </div>
      </div>
    </div>
  );
};

export default SwipeRow;

