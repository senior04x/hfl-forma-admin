import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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
  title = "Rasmni Qirqish (1:1)"
}) => {
  const handleClose = onClose || onCancel || (() => {});
  const handleSave = onSave || onCropComplete || (() => {});
  const src = propImageSrc || initialImageSrc;

  const canvasRef = useRef(null);
  const [imageObj, setImageObj] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Load image
  useEffect(() => {
    if (!src) return;
    const img = new Image();
    if (!src.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => {
      setImageObj(img);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    img.onerror = (err) => {
      console.error("Cropper image load error:", err);
    };
    img.src = src;
  }, [src]);

  // Draw image on preview canvas
  useEffect(() => {
    if (!imageObj || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const size = 320; // viewport square size

    canvas.width = size;
    canvas.height = size;

    ctx.fillStyle = '#0b1221';
    ctx.fillRect(0, 0, size, size);

    // Calculate scaling to cover 320x320
    const minDim = Math.min(imageObj.width, imageObj.height);
    const baseScale = size / minDim;
    const currentScale = baseScale * zoom;

    const drawW = imageObj.width * currentScale;
    const drawH = imageObj.height * currentScale;

    const drawX = (size - drawW) / 2 + offset.x;
    const drawY = (size - drawH) / 2 + offset.y;

    ctx.drawImage(imageObj, drawX, drawY, drawW, drawH);
  }, [imageObj, zoom, offset]);

  // Mouse Drag handlers
  const handleMouseDown = (e) => {
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

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch Drag handlers
  const handleTouchStart = (e) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({ x: e.touches[0].clientX - offset.x, y: e.touches[0].clientY - offset.y });
    }
  };

  const handleTouchMove = (e) => {
    if (!isDragging || e.touches.length !== 1) return;
    setOffset({
      x: e.touches[0].clientX - dragStart.x,
      y: e.touches[0].clientY - dragStart.y
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const handleCropAndSave = () => {
    if (!imageObj) return;

    // Create high-res 500x500 cropped output canvas
    const exportSize = 500;
    const outCanvas = document.createElement('canvas');
    outCanvas.width = exportSize;
    outCanvas.height = exportSize;
    const ctx = outCanvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, exportSize, exportSize);

    const size = 320;
    const minDim = Math.min(imageObj.width, imageObj.height);
    const baseScale = size / minDim;
    const currentScale = baseScale * zoom;

    const drawW = imageObj.width * currentScale;
    const drawH = imageObj.height * currentScale;
    const drawX = (size - drawW) / 2 + offset.x;
    const drawY = (size - drawH) / 2 + offset.y;

    const scaleFactor = exportSize / size;
    ctx.drawImage(
      imageObj,
      drawX * scaleFactor,
      drawY * scaleFactor,
      drawW * scaleFactor,
      drawH * scaleFactor
    );

    const croppedBase64 = outCanvas.toDataURL('image/jpeg', 0.9);
    handleSave(croppedBase64);
  };

  if (!isOpen || !src) return null;

  return createPortal(
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
          <div 
            className="cropper-canvas-wrapper"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          >
            <canvas ref={canvasRef} className="cropper-canvas" />
            <div className="cropper-grid-overlay">
              <div className="grid-line horizontal h1"></div>
              <div className="grid-line horizontal h2"></div>
              <div className="grid-line vertical v1"></div>
              <div className="grid-line vertical v2"></div>
            </div>
          </div>

          <div className="cropper-actions-row">
            <button type="button" onClick={() => setZoom(z => Math.max(0.8, z - 0.15))} className="cropper-action-btn">
              <ZoomOut size={16} /> Kichiklashtirish
            </button>
            <input
              type="range"
              min={0.8}
              max={3}
              step={0.05}
              value={zoom}
              onChange={e => setZoom(Number(e.target.value))}
              className="cropper-zoom-slider"
            />
            <button type="button" onClick={() => setZoom(z => Math.min(3, z + 0.15))} className="cropper-action-btn">
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
    </div>,
    document.body
  );
};

export default ImageCropperModal;
