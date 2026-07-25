import React, { useEffect, useRef } from 'react';
import Cropper from 'cropperjs';
import 'cropperjs/dist/cropper.css';
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
  const cropperInstanceRef = useRef(null);

  const handleClose = onClose || onCancel || (() => {});
  const handleSave = onSave || onCropComplete || (() => {});
  const src = propImageSrc || initialImageSrc;

  useEffect(() => {
    if (!isOpen || !src || !imageRef.current) return;

    if (cropperInstanceRef.current) {
      cropperInstanceRef.current.destroy();
      cropperInstanceRef.current = null;
    }

    const cropper = new Cropper(imageRef.current, {
      aspectRatio: 1,
      viewMode: 2,
      autoCropArea: 1,
      movable: true,
      zoomable: true,
      scalable: false,
      rotatable: false,
      background: false,
      dragMode: 'move',
      cropBoxMovable: false,
      cropBoxResizable: false,
      responsive: true,
      guides: true,
      center: true,
      highlight: false,
      toggleDragModeOnDblclick: false,
      minContainerWidth: 280,
      minContainerHeight: 280
    });

    cropperInstanceRef.current = cropper;

    return () => {
      if (cropperInstanceRef.current) {
        cropperInstanceRef.current.destroy();
        cropperInstanceRef.current = null;
      }
    };
  }, [src, isOpen]);

  const handleCropAndSave = () => {
    if (!cropperInstanceRef.current) return;
    const canvas = cropperInstanceRef.current.getCroppedCanvas({
      width: 500,
      height: 500
    });
    if (!canvas) return;
    const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
    handleSave(croppedDataUrl);
  };

  const handleZoomIn = () => {
    if (cropperInstanceRef.current) cropperInstanceRef.current.zoom(0.1);
  };

  const handleZoomOut = () => {
    if (cropperInstanceRef.current) cropperInstanceRef.current.zoom(-0.1);
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
          <button type="button" className="cropper-close-btn" onClick={handleClose}><X size={18} /></button>
        </div>

        <div className="cropper-body">
          <div className="cropper-img-wrapper" style={{ maxHeight: '400px', width: '100%', background: '#000', overflow: 'hidden', borderRadius: '12px' }}>
            <img ref={imageRef} src={src} alt="Source for crop" style={{ maxWidth: '100%', display: 'block' }} />
          </div>

          <div className="cropper-zoom-controls" style={{ display: 'flex', justifyContent: 'center', gap: '15px', marginTop: '14px' }}>
            <button type="button" onClick={handleZoomOut} className="cropper-zoom-btn" title="Kichiklashtirish" style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ZoomOut size={16} /> Kichiklashtirish
            </button>
            <button type="button" onClick={handleZoomIn} className="cropper-zoom-btn" title="Kattalashtirish" style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ZoomIn size={16} /> Kattalashtirish
            </button>
          </div>
        </div>

        <div className="cropper-footer">
          <button type="button" className="cropper-cancel-btn" onClick={handleClose}>Bekor qilish</button>
          <button type="button" className="cropper-save-btn" onClick={handleCropAndSave}>
            <Check size={18} /> Qirqish va Saqlash
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImageCropperModal;
