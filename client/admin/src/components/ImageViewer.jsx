import React from 'react';

const ImageViewer = ({ url, onClose }) => {
  return (
    <div 
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.9)'
      }}
      onClick={onClose}
    >
      <span 
        style={{
          position: 'absolute',
          top: '20px',
          right: '30px',
          color: 'white',
          fontSize: '40px',
          fontWeight: 'bold',
          cursor: 'pointer'
        }}
        onClick={onClose}
      >
        &times;
      </span>
      <img 
        src={url} 
        alt="Full screen" 
        style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain', borderRadius: '8px' }}
        onClick={(e) => e.stopPropagation()} 
      />
    </div>
  );
};

export default ImageViewer;

