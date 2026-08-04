import React, { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';
import { exportTeamsToPDF, exportPlayersByLeagueToPDF } from '../utils/pdfExport';
import './Modal.css';

const PDFExportModal = ({ isOpen, teams, applications, activeLeagues, onClose }) => {
  const [mode, setMode] = useState(null); // 'all' | 'team' | 'league' | null
  const [selectedTeam, setSelectedTeam] = useState('all');
  const [selectedLeague, setSelectedLeague] = useState('all');
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) {
      setMode(null);
      setSelectedTeam('all');
      setSelectedLeague('all');
      setIsExporting(false);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const runExportAll = async () => {
    setIsExporting(true);
    setError(null);
    try {
      await exportTeamsToPDF(teams, applications, 'all');
      onClose();
    } catch (err) {
      console.error('Export all error:', err);
      setError('Barchasini yuklashda xatolik yuz berdi. Iltimos qaytadan urinib ko\'ring.');
    } finally {
      setIsExporting(false);
    }
  };

  const runExportTeam = async () => {
    if (!selectedTeam || selectedTeam === 'all') return setError('Iltimos, jamoa tanlang');
    setIsExporting(true);
    setError(null);
    try {
      await exportTeamsToPDF(teams, applications, selectedTeam);
      onClose();
    } catch (err) {
      console.error('Export team error:', err);
      setError('Jamoani yuklashda xatolik yuz berdi. Iltimos qaytadan urinib ko\'ring.');
    } finally {
      setIsExporting(false);
    }
  };

  const runExportLeague = async () => {
    if (!selectedLeague || selectedLeague === 'all') return setError('Iltimos, liga tanlang');
    setIsExporting(true);
    setError(null);
    try {
      await exportPlayersByLeagueToPDF(applications, teams, selectedLeague);
      onClose();
    } catch (err) {
      console.error('Export league error:', err);
      setError('Liga bo\'yicha yuklashda xatolik yuz berdi. Iltimos qaytadan urinib ko\'ring.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '560px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>PDF Yuklab Olish</h2>
          <button className="close-btn" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <div className="modal-body" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '18px' }}>
            <button
              onClick={() => setMode('league')}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '8px',
                border: mode === 'league' ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                background: mode === 'league' ? '#eff6ff' : '#fff',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Liga bo'yicha
            </button>

            <button
              onClick={() => setMode('team')}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '8px',
                border: mode === 'team' ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                background: mode === 'team' ? '#eff6ff' : '#fff',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Bitta jamoa
            </button>

            <button
              onClick={() => setMode('all')}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                background: '#10b981',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              Barchasini yuklash
            </button>
          </div>

          {/* Mode: Team */}
          {mode === 'team' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>Jamoa tanlang:</label>
              <select
                value={selectedTeam}
                onChange={(e) => setSelectedTeam(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}
              >
                <option value="">-- Jamoani tanlang --</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>

              <div style={{ marginTop: '12px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={() => setMode(null)} disabled={isExporting} style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff' }}>Ortga</button>
                <button onClick={runExportTeam} disabled={isExporting} style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', background: '#3b82f6', color: '#fff' }}>
                  {isExporting ? 'Yuklanmoqda...' : (<><Download size={14} /> &nbsp; Yuklab olish</>)}
                </button>
              </div>
            </div>
          )}

          {/* Mode: League */}
          {mode === 'league' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>Liga tanlang:</label>
              <select
                value={selectedLeague}
                onChange={(e) => setSelectedLeague(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}
              >
                <option value="">-- Ligani tanlang --</option>
                {activeLeagues.map((l) => (
                  <option key={l.name} value={l.name}>{l.name}</option>
                ))}
              </select>

              <div style={{ marginTop: '12px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={() => setMode(null)} disabled={isExporting} style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff' }}>Ortga</button>
                <button onClick={runExportLeague} disabled={isExporting} style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', background: '#3b82f6', color: '#fff' }}>
                  {isExporting ? 'Yuklanmoqda...' : (<><Download size={14} /> &nbsp; Yuklab olish</>)}
                </button>
              </div>
            </div>
          )}

          {/* Mode: All */}
          {mode === 'all' && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ padding: '12px', background: '#ecfdf5', border: '1px solid #d1fae5', borderRadius: '8px', color: '#065f46' }}>
                Siz barcha jamoalar va ularning o'yinchilarini PDF ga yuklab olasiz.
              </div>

              <div style={{ marginTop: '12px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={() => setMode(null)} disabled={isExporting} style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff' }}>Ortga</button>
                <button onClick={runExportAll} disabled={isExporting} style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', background: '#10b981', color: '#fff' }}>
                  {isExporting ? 'Yuklanmoqda...' : (<><Download size={14} /> &nbsp; Barchasini yuklash</>)}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div style={{ marginTop: '12px', padding: '10px', backgroundColor: '#fee2e2', borderRadius: '8px', color: '#b91c1c' }}>
              {error}
            </div>
          )}

          <div style={{ marginTop: '14px', padding: '10px', background: '#f1f5f9', borderRadius: '8px', color: '#0f172a' }}>
            📄 PDF fayli o'yinchilarning rasmlari, isimlari, jismoniy ma'lumotlari va boshqa ma'lumotlar bilan birga yaratiladi.
          </div>
        </div>

        <div className="modal-footer" style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0' }}>
          <button onClick={onClose} disabled={isExporting} style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff' }}>Yopish</button>
        </div>
      </div>
    </div>
  );
};

export default PDFExportModal;
