import React, { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';
import { exportTeamsToPDF, exportPlayersByLeagueToPDF } from '../utils/pdfExport';
import './Modal.css';

const PDFExportModal = ({ isOpen, teams, applications, activeLeagues, onClose }) => {
  const [exportMode, setExportMode] = useState('teams'); // 'teams' or 'league'
  const [selectedTeam, setSelectedTeam] = useState('all');
  const [selectedLeague, setSelectedLeague] = useState('all');
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleExport = async () => {
    setIsExporting(true);
    setError(null);

    try {
      if (exportMode === 'teams') {
        await exportTeamsToPDF(teams, applications, selectedTeam);
      } else {
        await exportPlayersByLeagueToPDF(applications, teams, selectedLeague);
      }
      onClose();
    } catch (err) {
      console.error('Export error:', err);
      setError('PDF yaratishda xatolik yuz berdi. Iltimos qaytadan urinib ko\'ring.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>PDF Yuklab Olish</h2>
          <button className="close-btn" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <div className="modal-body" style={{ padding: '24px' }}>
          {/* Export Mode Selection */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', marginBottom: '12px', fontWeight: '600', fontSize: '14px' }}>
              Nima export qilmoqchisiz?
            </label>
            <div style={{ display: 'flex', gap: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="exportMode"
                  value="teams"
                  checked={exportMode === 'teams'}
                  onChange={(e) => {
                    setExportMode(e.target.value);
                    setSelectedTeam('all');
                  }}
                  style={{ cursor: 'pointer' }}
                />
                <span>Jamoalar</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="exportMode"
                  value="league"
                  checked={exportMode === 'league'}
                  onChange={(e) => {
                    setExportMode(e.target.value);
                    setSelectedLeague('all');
                  }}
                  style={{ cursor: 'pointer' }}
                />
                <span>Ligalar bo'yicha</span>
              </label>
            </div>
          </div>

          {/* Teams Selection */}
          {exportMode === 'teams' && (
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px' }}>
                Jamoa tanlang:
              </label>
              <select
                value={selectedTeam}
                onChange={(e) => setSelectedTeam(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '14px',
                  backgroundColor: '#f8fafc',
                  cursor: 'pointer',
                }}
              >
                <option value="all">Barcha Jamoalar</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* League Selection */}
          {exportMode === 'league' && (
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px' }}>
                Liga tanlang:
              </label>
              <select
                value={selectedLeague}
                onChange={(e) => setSelectedLeague(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '14px',
                  backgroundColor: '#f8fafc',
                  cursor: 'pointer',
                }}
              >
                <option value="all">Barcha Ligalar</option>
                {activeLeagues.map((league) => (
                  <option key={league.name} value={league.name}>
                    {league.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div
              style={{
                marginBottom: '16px',
                padding: '12px',
                backgroundColor: '#fee2e2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                color: '#dc2626',
                fontSize: '14px',
              }}
            >
              {error}
            </div>
          )}

          {/* Info Message */}
          <div
            style={{
              marginBottom: '20px',
              padding: '12px',
              backgroundColor: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: '8px',
              color: '#1e40af',
              fontSize: '13px',
              lineHeight: '1.5',
            }}
          >
            📄 PDF fayli o'yinchilarning rasmlari, isimlari, jismoniy ma'lumotlari va hokazo bilan birga yaratiladi.
          </div>
        </div>

        <div className="modal-footer" style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0' }}>
          <button
            onClick={onClose}
            disabled={isExporting}
            style={{
              padding: '10px 20px',
              backgroundColor: '#f1f5f9',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              cursor: isExporting ? 'not-allowed' : 'pointer',
              color: '#1e293b',
              fontWeight: '500',
              opacity: isExporting ? 0.6 : 1,
            }}
          >
            Bekor qilish
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting}
            style={{
              padding: '10px 20px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: isExporting ? 'not-allowed' : 'pointer',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              opacity: isExporting ? 0.6 : 1,
            }}
          >
            {isExporting ? (
              <>
                <div style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite', display: 'inline-block' }}>
                  ⟳
                </div>
                Yuklanmoqda...
              </>
            ) : (
              <>
                <Download size={18} />
                PDF Yuklab Olish
              </>
            )}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default PDFExportModal;
