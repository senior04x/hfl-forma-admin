import React, { useState, useRef, useEffect } from 'react';
import { Crop, ZoomIn, ZoomOut, Check, X, Upload } from 'lucide-react';
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
  const [imageSrc, setImageSrc] = useState(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const canvasRef = useRef(null);
  const imageRef = useRef(null);

  const handleClose = onClose || onCancel || (() => {});
  const handleSave = onSave || onCropComplete || (() => {});

  const activeSrc = propImageSrc || initialImageSrc;

  useEffect(() => {
    if (activeSrc) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        imageRef.current = img;
        setImageSrc(activeSrc);
        setScale(1);
        setOffset({ x: 0, y: 0 });
      };
      img.src = activeSrc;
    } else if (!isOpen) {
      setImageSrc(null);
      setScale(1);
      setOffset({ x: 0, y: 0 });
    }
  }, [activeSrc, isOpen]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        imageRef.current = img;
        setImageSrc(reader.result);
        setScale(1);
        setOffset({ x: 0, y: 0 });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleUrlInput = (url) => {
    if (!url) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageRef.current = img;
      setImageSrc(url);
      setScale(1);
      setOffset({ x: 0, y: 0 });
    };
    img.onerror = () => {
      alert("Rasm havolasini yuklashda xatolik yuz berdi!");
    };
    img.src = url;
  };

  // Draw crop preview onto Canvas
  useEffect(() => {
    if (!imageSrc || !canvasRef.current || !imageRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = imageRef.current;

    const size = 600; // 1:1 Canvas size
    canvas.width = size;
    canvas.height = size;

    ctx.clearRect(0, 0, size, size);

    // Draw background
    ctx.fillStyle = '#0a0d12';
    ctx.fillRect(0, 0, size, size);

    // Calculate image dimensions with scale
    const aspect = img.width / img.height;
    let drawWidth = size * scale;
    let drawHeight = (size / aspect) * scale;

    const posX = (size - drawWidth) / 2 + offset.x;
    const posY = (size - drawHeight) / 2 + offset.y;

    ctx.drawImage(img, posX, posY, drawWidth, drawHeight);
  }, [imageSrc, scale, offset]);

  // Dragging handlers
  const handleMouseDown = (e) => {
    if (!imageSrc) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleCropAndSave = () => {
    if (!canvasRef.current || !imageSrc) {
      alert("Iltimos avval rasm yuklang.");
      return;
    }
    const canvas = canvasRef.current;

    // Output optimized 500x500 cropped image for fast network loading & storage
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = 500;
    outputCanvas.height = 500;
    const ctx = outputCanvas.getContext('2d');
    ctx.drawImage(canvas, 0, 0, 500, 500);

    const croppedDataUrl = outputCanvas.toDataURL('image/jpeg', 0.82);
    handleSave(croppedDataUrl);
  };

  if (!isOpen) return null;

  return (
    <div className="cropper-modal-overlay" onClick={handleClose}>
      <div className="cropper-modal" onClick={e => e.stopPropagation()}>
        <div className="cropper-header">
          <div className="cropper-title">
            <Crop size={20} />
            <h2>{title}</h2>
          </div>
          <button className="cropper-close-btn" onClick={handleClose}><X size={18} /></button>
        </div>

        <div className="cropper-body">
          {!imageSrc ? (
            <div className="cropper-upload-box">
              <Upload size={40} className="upload-icon" />
              <h3>Fon rasmini tanlang</h3>
              <p>1:1 kvadrat formatda chiroyli qirqiladi</p>

              <label className="cropper-file-label">
                <input type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
                <span>Qurilmadan rasm tanlash</span>
              </label>

              <div className="cropper-divider">yoki URL havolasini kiriting</div>

              <input
                type="text"
                className="cropper-url-input"
                placeholder="https://example.com/background.jpg"
                onKeyDown={e => e.key === 'Enter' && handleUrlInput(e.target.value)}
                onBlur={e => e.target.value && handleUrlInput(e.target.value)}
              />
            </div>
          ) : (
            <div className="cropper-editor-area">
              <div 
                className="cropper-canvas-wrapper"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <canvas ref={canvasRef} className="cropper-canvas" />
                <div className="cropper-grid-overlay">
                  <div className="grid-line horizontal h1"></div>
                  <div className="grid-line horizontal h2"></div>
                  <div className="grid-line vertical v1"></div>
                  <div className="grid-line vertical v2"></div>
                </div>
              </div>

              {/* Controls */}
              <div className="cropper-controls">
                <div className="zoom-controls">
                  <button className="ctrl-btn" onClick={() => setScale(prev => Math.max(0.5, prev - 0.1))}>
                    <ZoomOut size={16} />
                  </button>
                  <input
                    type="range"
                    min="0.5"
                    max="3"
                    step="0.05"
                    value={scale}
                    onChange={e => setScale(parseFloat(e.target.value))}
                    className="zoom-range"
                  />
                  <button className="ctrl-btn" onClick={() => setScale(prev => Math.min(3, prev + 0.1))}>
                    <ZoomIn size={16} />
                  </button>
                </div>
                <button className="reupload-btn" onClick={() => setImageSrc(null)}>Boshqa rasm</button>
              </div>
            </div>
          )}
        </div>

        <div className="cropper-footer">
          <button className="cropper-cancel-btn" onClick={onClose}>Bekor qilish</button>
          <button 
            className="cropper-save-btn" 
            onClick={handleCropAndSave}
            disabled={!imageSrc}
          >
            <Check size={16} />
            <span>Qirqib Saqlash</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImageCropperModal;
