import React, { useState, useCallback, useEffect } from 'react';
import Cropper from 'react-easy-crop';
import { Crop, Check, X, ZoomIn, ZoomOut } from 'lucide-react';
import './ImageCropperModal.css';

// Rasmni canvas orqali qirqish
async function getCroppedImg(imageSrc, pixelCrop) {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  const ctx = canvas.getContext('2d');

  // Clear background so transparent PNG images maintain transparency
  ctx.clearRect(0, 0, pixelCrop.width, pixelCrop.height);

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  return canvas.toDataURL('image/png');
}

function createImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (url && !url.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = (err) => {
      console.error('Image load error in cropper:', err);
      reject(err);
    };
    img.src = url;
  });
}

const ImageCropperModal = ({
  isOpen = true,
  onClose,
  onCancel,
  onSave,
  onCropComplete,
  imageSrc: propImageSrc,
  initialImageSrc,
  title = "Rasmni Qirqish",
  aspect: propAspect = 1,
  showAspectSelector = false
}) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [aspect, setAspect] = useState(propAspect);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  useEffect(() => {
    setAspect(propAspect);
  }, [propAspect]);

  const handleClose = onClose || onCancel || (() => {});
  const handleSave = onSave || onCropComplete || (() => {});
  const src = propImageSrc || initialImageSrc;

  const onCropCompleteHandler = useCallback((_, croppedPixels) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleCropAndSave = async () => {
    if (!croppedAreaPixels || !src) return;
    try {
      const croppedDataUrl = await getCroppedImg(src, croppedAreaPixels);
      handleSave(croppedDataUrl);
    } catch (e) {
      console.error('Crop error:', e);
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
          {showAspectSelector && (
            <div className="cropper-aspect-row">
              <button 
                type="button" 
                className={`aspect-btn ${aspect === 16 / 9 ? 'active' : ''}`}
                onClick={() => setAspect(16 / 9)}
              >
                16:9 (Uzun)
              </button>
              <button 
                type="button" 
                className={`aspect-btn ${aspect === 1 ? 'active' : ''}`}
                onClick={() => setAspect(1)}
              >
                1:1 (Kvadrat)
              </button>
              <button 
                type="button" 
                className={`aspect-btn ${aspect === null || aspect === undefined ? 'active' : ''}`}
                onClick={() => setAspect(undefined)}
              >
                Erkin (Free)
              </button>
            </div>
          )}

          <div className="cropper-image-container">
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropCompleteHandler}
              cropShape="rect"
              showGrid={true}
              style={{
                containerStyle: { width: '100%', height: '100%', borderRadius: '10px' },
                cropAreaStyle: { border: '2.5px solid #00aaff' },
              }}
            />
          </div>

          <div className="cropper-actions-row">
            <button type="button" onClick={() => setZoom(z => Math.max(1, z - 0.2))} className="cropper-action-btn">
              <ZoomOut size={16} /> Kichiklashtirish
            </button>
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={e => setZoom(Number(e.target.value))}
              className="cropper-zoom-slider"
            />
            <button type="button" onClick={() => setZoom(z => Math.min(3, z + 0.2))} className="cropper-action-btn">
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
