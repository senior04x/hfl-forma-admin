import React, { useEffect, useRef } from 'react';
import Cropper from 'cropperjs';
import { Crop, Check, X, ZoomIn, ZoomOut } from 'lucide-react';
import './ImageCropperModal.css';

const ImageCropperModal = ({ 
  isOpen = true, 
  onClose, 
  onCancel,
  onSave, 
  onCropComplete,
  imageSrc: propImageSrc,
  initialImageSrc,
  title = "Rasmni 1:1 Formatda Qirqish" 
}) => {
  const imageRef = useRef(null);
  const cropperRef = useRef(null);

  const handleClose = onClose || onCancel || (() => {});
  const handleSave = onSave || onCropComplete || (() => {});
  const src = propImageSrc || initialImageSrc;

  useEffect(() => {
    if (!isOpen || !src || !imageRef.current) return;

    // Destroy previous instance
    if (cropperRef.current) {
      cropperRef.current.destroy();
      cropperRef.current = null;
    }

    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      if (!imageRef.current) return;
      
      cropperRef.current = new Cropper(imageRef.current, {
        aspectRatio: 1,
        viewMode: 1,
        autoCropArea: 1,
        dragMode: 'move',
        cropBoxMovable: false,
        cropBoxResizable: false,
        toggleDragModeOnDblclick: false,
        guides: true,
        center: true,
        highlight: false,
        background: true,
        movable: true,
        zoomable: true,
        zoomOnWheel: true,
        zoomOnTouch: true,
        scalable: false,
        rotatable: false,
        responsive: true,
        minContainerWidth: 250,
        minContainerHeight: 250,
      });
    }, 100);

    return () => {
      clearTimeout(timer);
      if (cropperRef.current) {
        cropperRef.current.destroy();
        cropperRef.current = null;
      }
    };
  }, [src, isOpen]);

  const handleCropAndSave = () => {
    if (!cropperRef.current) return;
    try {
      const canvas = cropperRef.current.getCroppedCanvas({
        width: 500,
        height: 500,
      });
      if (!canvas) return;
      const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
      handleSave(croppedDataUrl);
    } catch (e) {
      console.error('Crop error:', e);
    }
  };

  const handleZoomIn = () => {
    if (cropperRef.current) {
      try { cropperRef.current.zoom(0.1); } catch(e) {}
    }
  };

  const handleZoomOut = () => {
    if (cropperRef.current) {
      try { cropperRef.current.zoom(-0.1); } catch(e) {}
    }
  };

  if (!isOpen || !src) return null;

  return (
    <div className="cropper-modal-overlay" onClick={handleClose}>
      <div className="cropper-modal" onClick={e => e.stopPropagation()}>
        <div className="cropper-header">
          <div className="cropper-title">
            <Crop size={20} />
            <h2>{title}</h2>
          </div>
          <button type="button" className="cropper-close-btn" onClick={handleClose}>
            <X size={18} />
          </button>
        </div>

        <div className="cropper-body">
          <div className="cropper-image-container">
            <img 
              ref={imageRef} 
              src={src} 
              alt="Crop source"
              style={{ display: 'block', maxWidth: '100%' }}
            />
          </div>

          <div className="cropper-actions-row">
            <button type="button" onClick={handleZoomOut} className="cropper-action-btn">
              <ZoomOut size={16} /> Kichiklashtirish
            </button>
            <button type="button" onClick={handleZoomIn} className="cropper-action-btn">
              <ZoomIn size={16} /> Kattalashtirish
            </button>
          </div>
        </div>

        <div className="cropper-footer">
          <button type="button" className="cropper-cancel-btn" onClick={handleClose}>
            Bekor qilish
          </button>
          <button type="button" className="cropper-save-btn" onClick={handleCropAndSave}>
            <Check size={18} /> Qirqish va Saqlash
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImageCropperModal;
