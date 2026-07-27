import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useOrg } from '../context/OrgContext';
import { Check, X, User, Shield, Phone, AlertCircle, RefreshCw, Layers } from 'lucide-react';

export default function ProfileUpdates() {
  const { orgId } = useOrg();
  const [activeTab, setActiveTab] = useState('players');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  useEffect(() => {
    fetchProfileUpdateRequests();
  }, [orgId]);

  const fetchProfileUpdateRequests = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('applications')
        .select('*')
        .ilike('comment', '%[PROFILE_UPDATE]%')
        .order('created_at', { ascending: false });

      if (orgId) {
        query = query.eq('organization_id', orgId);
      }

      const { data, error } = await query;
      if (error) console.error('Error fetching profile update requests:', error);

      const parsedList = (data || []).map(item => {
        let parsedPayload = null;
        try {
          const jsonStr = item.comment.replace('[PROFILE_UPDATE]', '').trim();
          parsedPayload = JSON.parse(jsonStr);
        } catch (e) {
          console.warn('Failed to parse profile update payload:', e);
        }

        return {
          ...item,
          payload: parsedPayload
        };
      });

      setRequests(parsedList);
    } catch (err) {
      console.error('Error loading requests:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (reqItem) => {
    setProcessingId(reqItem.id);
    try {
      const targetPlayerId = reqItem.payload?.playerId;
      const newData = reqItem.payload?.newData || {};

      // 1. Update target player record if exists
      if (targetPlayerId) {
        const updatePayload = {
          first_name: newData.firstName || reqItem.first_name,
          last_name: newData.lastName || reqItem.last_name,
          father_name: newData.fatherName || reqItem.father_name,
          phone: newData.phone || reqItem.phone,
          position: newData.position || reqItem.position,
          player_number: newData.playerNumber ? Number(newData.playerNumber) : reqItem.player_number,
          photo_url: newData.photoUrl || reqItem.photo_url
        };

        await supabase.from('applications').update(updatePayload).eq('id', targetPlayerId);
      }

      // 2. Mark update request as approved
      await supabase.from('applications').update({ status: 'approved' }).eq('id', reqItem.id);

      fetchProfileUpdateRequests();
    } catch (err) {
      console.error('Error approving request:', err);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (reqItem) => {
    setProcessingId(reqItem.id);
    try {
      await supabase.from('applications').update({ status: 'rejected' }).eq('id', reqItem.id);
      fetchProfileUpdateRequests();
    } catch (err) {
      console.error('Error rejecting request:', err);
    } finally {
      setProcessingId(null);
    }
  };

  const filteredRequests = requests.filter(r => {
    if (activeTab === 'players') return !r.team_id || r.type !== 'team';
    return r.team_id || r.type === 'team';
  });

  return (
    <div style={{ padding: '24px', color: '#ffffff' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Ma'lumotlar Almashinuvi Bo'yicha Arizalar
          </h1>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', marginTop: '4px' }}>
            O'yinchilar va jamoalarning ma'lumotlarini qayta ko'rib chiqish hamda yangilash arizalari
          </p>
        </div>

        <button
          onClick={fetchProfileUpdateRequests}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            background: 'rgba(0, 255, 102, 0.1)',
            border: '1px solid rgba(0, 255, 102, 0.3)',
            color: '#00ff66',
            borderRadius: '12px',
            fontWeight: '700',
            cursor: 'pointer'
          }}
        >
          <RefreshCw size={16} /> Qayta Yangilash
        </button>
      </div>

      {/* TABS */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '12px' }}>
        <button
          onClick={() => setActiveTab('players')}
          style={{
            padding: '10px 20px',
            borderRadius: '12px',
            fontWeight: '800',
            fontSize: '13px',
            textTransform: 'uppercase',
            border: 'none',
            cursor: 'pointer',
            background: activeTab === 'players' ? '#00ff66' : 'rgba(255,255,255,0.05)',
            color: activeTab === 'players' ? '#000000' : '#ffffff'
          }}
        >
          O'yinchilar Arizalari
        </button>
        <button
          onClick={() => setActiveTab('teams')}
          style={{
            padding: '10px 20px',
            borderRadius: '12px',
            fontWeight: '800',
            fontSize: '13px',
            textTransform: 'uppercase',
            border: 'none',
            cursor: 'pointer',
            background: activeTab === 'teams' ? '#00ff66' : 'rgba(255,255,255,0.05)',
            color: activeTab === 'teams' ? '#000000' : '#ffffff'
          }}
        >
          Jamoalar Arizalari
        </button>
      </div>

      {/* LIST */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
          Arizalar yuklanmoqda...
        </div>
      ) : filteredRequests.length === 0 ? (
        <div style={{ padding: '60px', textAlign: 'center', background: '#0b0f19', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)' }}>
          <AlertCircle size={40} style={{ color: 'rgba(255,255,255,0.3)', marginBottom: '12px' }} />
          <h3 style={{ fontSize: '16px', fontWeight: '800' }}>Hozircha arizalar mavjud emas</h3>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginTop: '4px' }}>
            O'yinchilar yoki jamoalar tomonidan yuborilgan yangilash arizalari ushbu bo'limda ko'rinadi.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '20px' }}>
          {filteredRequests.map(req => {
            const oldData = req.payload?.oldData || {};
            const newData = req.payload?.newData || {};
            const isPending = req.status === 'pending' || !req.status;

            return (
              <div
                key={req.id}
                style={{
                  background: '#0b0f19',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '20px',
                  padding: '20px',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.4)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '12px', fontWeight: '900', color: '#00ff66', background: 'rgba(0,255,102,0.1)', padding: '4px 10px', borderRadius: '8px' }}>
                      # {req.id}
                    </span>
                    <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
                      {new Date(req.created_at).toLocaleString('uz-UZ')}
                    </span>
                  </div>

                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: '800',
                      textTransform: 'uppercase',
                      padding: '4px 12px',
                      borderRadius: '8px',
                      background: req.status === 'approved' ? 'rgba(16, 185, 129, 0.2)' : req.status === 'rejected' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                      color: req.status === 'approved' ? '#10B981' : req.status === 'rejected' ? '#EF4444' : '#F59E0B'
                    }}
                  >
                    {req.status === 'approved' ? 'Tasdiqlangan' : req.status === 'rejected' ? 'Rad Etilgan' : 'Kutilmoqda'}
                  </span>
                </div>

                {/* SIDE BY SIDE COMPARISON */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                  {/* ESKI MA'LUMOT */}
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <h4 style={{ fontSize: '12px', fontWeight: '900', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', marginBottom: '12px' }}>
                      🔴 ESKI MA'LUMOTLAR
                    </h4>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                      <div><span style={{ color: 'rgba(255,255,255,0.5)' }}>Ism-Familiya:</span> {oldData.firstName || req.first_name} {oldData.lastName || req.last_name}</div>
                      <div><span style={{ color: 'rgba(255,255,255,0.5)' }}>Otasining ismi:</span> {oldData.fatherName || req.father_name || '—'}</div>
                      <div><span style={{ color: 'rgba(255,255,255,0.5)' }}>Telefon:</span> {oldData.phone || req.phone || '—'}</div>
                      <div><span style={{ color: 'rgba(255,255,255,0.5)' }}>Pozitsiya:</span> {oldData.position || req.position || '—'}</div>
                      <div><span style={{ color: 'rgba(255,255,255,0.5)' }}>Forma Nomer:</span> #{oldData.playerNumber || req.player_number || '0'}</div>
                    </div>
                  </div>

                  {/* YANGI MA'LUMOT */}
                  <div style={{ background: 'rgba(0,255,102,0.05)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(0,255,102,0.2)' }}>
                    <h4 style={{ fontSize: '12px', fontWeight: '900', color: '#00ff66', textTransform: 'uppercase', marginBottom: '12px' }}>
                      🟢 YANGI MA'LUMOTLAR (ARIZA)
                    </h4>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                      <div><span style={{ color: 'rgba(255,255,255,0.5)' }}>Ism-Familiya:</span> <strong style={{ color: '#00ff66' }}>{newData.firstName || req.first_name} {newData.lastName || req.last_name}</strong></div>
                      <div><span style={{ color: 'rgba(255,255,255,0.5)' }}>Otasining ismi:</span> <strong style={{ color: '#00ff66' }}>{newData.fatherName || req.father_name || '—'}</strong></div>
                      <div><span style={{ color: 'rgba(255,255,255,0.5)' }}>Telefon:</span> <strong style={{ color: '#00ff66' }}>{newData.phone || req.phone || '—'}</strong></div>
                      <div><span style={{ color: 'rgba(255,255,255,0.5)' }}>Pozitsiya:</span> <strong style={{ color: '#00ff66' }}>{newData.position || req.position || '—'}</strong></div>
                      <div><span style={{ color: 'rgba(255,255,255,0.5)' }}>Forma Nomer:</span> <strong style={{ color: '#00ff66' }}>#{newData.playerNumber || req.player_number || '0'}</strong></div>
                    </div>
                  </div>
                </div>

                {/* ACTION BUTTONS */}
                {isPending && (
                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => handleReject(req)}
                      disabled={processingId === req.id}
                      style={{
                        padding: '10px 20px',
                        background: 'rgba(239, 68, 68, 0.15)',
                        border: '1px solid rgba(239, 68, 68, 0.4)',
                        color: '#EF4444',
                        borderRadius: '12px',
                        fontWeight: '800',
                        fontSize: '13px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <X size={16} /> Rad Etish
                    </button>

                    <button
                      onClick={() => handleApprove(req)}
                      disabled={processingId === req.id}
                      style={{
                        padding: '10px 24px',
                        background: '#00ff66',
                        border: 'none',
                        color: '#000000',
                        borderRadius: '12px',
                        fontWeight: '900',
                        fontSize: '13px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Check size={16} /> Tasdiqlash va Yangilash
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
