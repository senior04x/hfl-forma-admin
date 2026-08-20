import React, { useState, useEffect } from 'react';
import { Archive, X } from 'lucide-react';
import './DeleteConfirmModal.css';

const DeleteConfirmModal = ({ 
  isOpen, 
  title = "Arxivlashni tasdiqlang", 
  message = "Ushbu ma'lumot arxivga o'tkaziladi va asosiy ro'yxatdan yashiriladi.", 
  onConfirm, 
  onClose 
}) => {
  const [countdown, setCountdown] = useState(3);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setCountdown(3);
    setLoading(false);

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (countdown > 0 || loading) return;
    setLoading(true);
    try {
      await onConfirm();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="delete-modal-overlay">
      <div className="delete-modal-card">
        <button className="delete-modal-close" onClick={onClose} disabled={loading}>
          <X size={20} />
        </button>

        <div className="delete-modal-icon-wrapper">
          <Archive size={32} className="delete-warning-icon" />
        </div>

        <h3 className="delete-modal-title">{title}</h3>
        <p className="delete-modal-message">{message}</p>

        <div className="delete-modal-notice">
          <p>📦 Barcha o'yin ma'lumotlari saqlanadi. Uni istalgan vaqtda <b>Arxiv</b> bo'limidan qaytarishingiz mumkin.</p>
        </div>

        <div className="delete-modal-actions">
          <button className="btn-delete-cancel" onClick={onClose} disabled={loading}>
            Bekor qilish
          </button>
          
          <button 
            className={`btn-delete-confirm ${countdown > 0 ? 'disabled' : 'ready'}`}
            onClick={handleConfirm}
            disabled={countdown > 0 || loading}
          >
            <Archive size={18} />
            {loading ? "Arxivlanmoqda..." : countdown > 0 ? `Arxivlash (${countdown}s)` : "Arxivlash"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmModal;
