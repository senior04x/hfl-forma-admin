import React from 'react';
import { AlertTriangle, Lock, X } from 'lucide-react';
import './TransferClosedModal.css';

const TransferClosedModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="transfer-closed-modal-overlay" onClick={onClose}>
      <div className="transfer-closed-modal-card" onClick={e => e.stopPropagation()}>
        <button className="transfer-closed-modal-close" onClick={onClose} aria-label="Yopish">
          <X size={20} />
        </button>

        <div className="transfer-closed-icon-wrapper">
          <AlertTriangle size={38} className="transfer-closed-warning-icon" />
        </div>

        <div className="transfer-closed-badge">
          <Lock size={13} />
          <span>Transfer oynasi yopiq</span>
        </div>

        <h3 className="transfer-closed-title">Tahrirlash Cheklangan</h3>

        <p className="transfer-closed-message">
          O'yinchilarni tahrirlashda muammo yuzaga keldi server nosozligi iltimos transferlar ochilgan vaqti qaytadan urunib ko'ring
        </p>

        <div className="transfer-closed-actions">
          <button className="btn-transfer-closed-ok" onClick={onClose}>
            Tushundim
          </button>
        </div>
      </div>
    </div>
  );
};

export default TransferClosedModal;
