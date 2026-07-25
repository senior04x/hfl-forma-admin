import React, { useState, useEffect } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import './DeleteConfirmModal.css';

const DeleteConfirmModal = ({ isOpen, title = "O'chirishni tasdiqlang", message = "O'chirsangiz barcha ma'lumotlar o'chib ketadi!", onConfirm, onClose }) => {
  const [countdown, setCountdown] = useState(5);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setCountdown(5);
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
          <AlertTriangle size={36} className="delete-warning-icon" />
        </div>

        <h3 className="delete-modal-title">{title}</h3>
        <p className="delete-modal-message">{message}</p>

        <div className="delete-modal-notice">
          <p>⚠️ Ushbu harakatni ortga qaytarib bo'lmaydi!</p>
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
            <Trash2 size={18} />
            {loading ? "O'chirilmoqda..." : countdown > 0 ? `O'chirish (${countdown}s)` : "O'chirish"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmModal;
