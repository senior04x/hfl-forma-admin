import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useOrg } from '../context/OrgContext';
import { Check, X, ArrowRight, RefreshCw, AlertCircle, Phone, User, Shield, Trash2 } from 'lucide-react';

const getInstaUser = (val) => {
  if (!val) return '';
  if (typeof val === 'string') {
    const match = val.match(/instagram\.com\/([^\/\]]+)/);
    if (match?.[1]) return match[1].replace(/^@/, '').trim();
    return val.replace(/^@/, '').trim();
  }
  return '';
};

const extractInstaFromComment = (comment) => {
  if (!comment) return '';
  const match = comment.match(/\[INSTAGRAM:([^\]]+)\]/);
  if (match?.[1]) {
    return getInstaUser(match[1]);
  }
  return '';
};

const extractMetaFromComment = (comment) => {
  if (!comment) return {};
  const metaMatch = comment.match(/\[METADATA:({[^\]]+})\]/);
  if (metaMatch?.[1]) {
    try {
      return JSON.parse(metaMatch[1]);
    } catch (e) {}
  }
  return {};
};

export default function ProfileUpdates() {
  const { orgId } = useOrg();
  const [activeTab, setActiveTab] = useState('players');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [showOnlyChanged, setShowOnlyChanged] = useState(false);

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
          if (item.comment && item.comment.includes('[PROFILE_UPDATE]')) {
            const parts = item.comment.split('[PROFILE_UPDATE]');
            let jsonStr = parts[1] || '';
            // Strip trailing tags like [INSTAGRAM:...] or [METADATA:...]
            jsonStr = jsonStr
              .replace(/\[INSTAGRAM:[^\]]+\]/g, '')
              .replace(/\[METADATA:[^\]]+\]/g, '')
              .trim();

            parsedPayload = JSON.parse(jsonStr);
          }
        } catch (e) {
          console.warn('Failed to parse profile update payload:', e, item.comment);
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

  const updateTicketStatus = async (id, statusVal) => {
    let { error } = await supabase.from('applications').update({ status: statusVal }).eq('id', id);
    if (error && (error.message.includes('valid_status') || error.code === '23514')) {
      const upperVal = statusVal.toUpperCase();
      const retryRes = await supabase.from('applications').update({ status: upperVal }).eq('id', id);
      error = retryRes.error;
    }
    return error;
  };

  // Approve Request: Update existing player ONLY & mark request as processed
  const handleApprove = async (reqItem) => {
    setProcessingId(reqItem.id);
    try {
      const targetPlayerId = reqItem.payload?.playerId || reqItem.player_id;
      const newData = reqItem.payload?.newData || {};

      if (targetPlayerId) {
        const metaObj = {
          citizenship: newData.citizenship || '',
          height: newData.height || '',
          weight: newData.weight || ''
        };

        const cleanInsta = (newData.instagramUsername || '').trim().replace(/^@/, '');
        const instaUrl = newData.instagramUrl || (cleanInsta ? `https://www.instagram.com/${cleanInsta}/` : '');

        // Fetch existing comment of target player to preserve other data
        const { data: targetPlayer } = await supabase.from('applications').select('comment').eq('id', targetPlayerId).maybeSingle();
        const currentComment = targetPlayer?.comment || reqItem.comment || '';

        const cleanComment = currentComment
          .replace(/\[PROFILE_UPDATE\][\s\S]*/g, '')
          .replace(/\[METADATA:[^\]]+\]/g, '')
          .replace(/\[INSTAGRAM:[^\]]+\]/g, '')
          .trim();

        let updatedComment = cleanComment;
        if (metaObj.citizenship || metaObj.height || metaObj.weight) {
          updatedComment += ` [METADATA:${JSON.stringify(metaObj)}]`;
        }
        if (instaUrl) {
          updatedComment += ` [INSTAGRAM:${instaUrl}]`;
        }

        const updatePayload = {
          first_name: newData.firstName || reqItem.first_name,
          last_name: newData.lastName || reqItem.last_name,
          father_name: newData.fatherName || reqItem.father_name,
          phone: newData.phone || reqItem.phone,
          position: newData.position || reqItem.position,
          player_number: newData.playerNumber ? Number(newData.playerNumber) : reqItem.player_number,
          photo_url: newData.photoUrl || reqItem.photo_url,
          passport_series: newData.passportSeries || undefined,
          passport_number: newData.passportNumber || undefined,
          birth_date: newData.birthDate || undefined,
          comment: updatedComment.trim()
        };

        Object.keys(updatePayload).forEach(key => updatePayload[key] === undefined && delete updatePayload[key]);

        const { error: playerErr } = await supabase.from('applications').update(updatePayload).eq('id', targetPlayerId);
        if (playerErr) {
          console.error('Error updating player record:', playerErr);
          alert('O\'yinchi ma\'lumotlarini yangilashda xatolik: ' + playerErr.message);
          return;
        }
      }

      const ticketErr = await updateTicketStatus(reqItem.id, 'approved');
      if (ticketErr) {
        console.error('Error approving request:', ticketErr);
        alert('Arizani tasdiqlashda xatolik: ' + ticketErr.message);
        return;
      }

      alert('Ariza muvaffaqiyatli tasdiqlandi va o\'yinchi ma\'lumotlari bazada yangilandi!');
      fetchProfileUpdateRequests();
    } catch (err) {
      console.error('Error approving request:', err);
      alert('Xatolik yuz berdi: ' + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (reqItem) => {
    setProcessingId(reqItem.id);
    try {
      const error = await updateTicketStatus(reqItem.id, 'rejected');
      if (error) {
        alert('Arizani rad etishda xatolik: ' + error.message);
        return;
      }
      alert('Ariza rad etildi!');
      fetchProfileUpdateRequests();
    } catch (err) {
      console.error('Error rejecting request:', err);
      alert('Xatolik yuz berdi: ' + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleDelete = async (reqItem) => {
    if (!window.confirm("Ushbu arizani rostdan ham o'chirib tashlamoqchimisiz?")) return;
    setProcessingId(reqItem.id);
    try {
      const { error } = await supabase.from('applications').delete().eq('id', reqItem.id);
      if (error) {
        alert("Arizani o'chirishda xatolik: " + error.message);
        return;
      }
      alert("Ariza muvaffaqiyatli o'chirildi!");
      fetchProfileUpdateRequests();
    } catch (err) {
      console.error("Error deleting request:", err);
      alert("Xatolik yuz berdi: " + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const filteredRequests = requests.filter(r => {
    if (activeTab === 'players') return !r.team_id || r.type !== 'team';
    return r.team_id || r.type === 'team';
  });

  return (
    <div style={{ padding: '16px', color: '#ffffff', maxWidth: '1000px', margin: '0 auto' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Ma'lumotlar Almashinuvi Arizalari
          </h1>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginTop: '4px' }}>
            O'yinchilarning ma'lumotlarini tahrirlash so'rovlari
          </p>
        </div>

        <button
          onClick={fetchProfileUpdateRequests}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            background: 'rgba(0, 255, 102, 0.1)',
            border: '1px solid rgba(0, 255, 102, 0.3)',
            color: '#00ff66',
            borderRadius: '10px',
            fontWeight: '700',
            fontSize: '12px',
            cursor: 'pointer'
          }}
        >
          <RefreshCw size={14} /> Qayta Yangilash
        </button>
      </div>

      {/* TABS & FILTER */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '10px', flex: 1, minWidth: '240px' }}>
          <button
            onClick={() => setActiveTab('players')}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: '12px',
              fontWeight: '800',
              fontSize: '12px',
              textTransform: 'uppercase',
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'players' ? '#00ff66' : 'rgba(255,255,255,0.06)',
              color: activeTab === 'players' ? '#000000' : '#ffffff'
            }}
          >
            O'yinchilar Arizalari
          </button>
          <button
            onClick={() => setActiveTab('teams')}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: '12px',
              fontWeight: '800',
              fontSize: '12px',
              textTransform: 'uppercase',
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'teams' ? '#00ff66' : 'rgba(255,255,255,0.06)',
              color: activeTab === 'teams' ? '#000000' : '#ffffff'
            }}
          >
            Jamoalar Arizalari
          </button>
        </div>

        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: '700',
          color: showOnlyChanged ? '#00ff66' : 'rgba(255,255,255,0.7)',
          background: showOnlyChanged ? 'rgba(0, 255, 102, 0.1)' : 'rgba(255, 255, 255, 0.05)',
          padding: '9px 14px',
          borderRadius: '12px',
          border: showOnlyChanged ? '1px solid rgba(0, 255, 102, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)',
          userSelect: 'none'
        }}>
          <input
            type="checkbox"
            checked={showOnlyChanged}
            onChange={(e) => setShowOnlyChanged(e.target.checked)}
            style={{ accentColor: '#00ff66', cursor: 'pointer', width: '15px', height: '15px' }}
          />
          Faqat O'zgargan Ma'lumotlarni Ko'rsatish
        </label>
      </div>

      {/* LIST */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}>
          Arizalar yuklanmoqda...
        </div>
      ) : filteredRequests.length === 0 ? (
        <div style={{ padding: '40px 20px', textAlign: 'center', background: '#0c101c', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)' }}>
          <AlertCircle size={36} style={{ color: 'rgba(255,255,255,0.3)', marginBottom: '10px' }} />
          <h3 style={{ fontSize: '14px', fontWeight: '800' }}>Arizalar topilmadi</h3>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginTop: '4px' }}>
            Hozircha ma'lumotlarni almashtirish bo'yicha arizalar mavjud emas.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {filteredRequests.map(req => {
            const oldData = req.payload?.oldData || {};
            const newData = req.payload?.newData || {};
            const isPending = req.status === 'pending' || !req.status;
            const isApproved = req.status === 'approved' || req.status === 'approved_update';
            const isRejected = req.status === 'rejected' || req.status === 'rejected_update';

            const oldPhoto = oldData.photoUrl || req.photo_url || '';
            const newPhoto = newData.photoUrl || oldPhoto;

            const commentMeta = extractMetaFromComment(req.comment);

            const oldFirstName = oldData.firstName || oldData.first_name || '';
            const oldLastName = oldData.lastName || oldData.last_name || '';
            const oldName = `${oldFirstName} ${oldLastName}`.trim() || '—';

            const newFirstName = newData.firstName || req.first_name || '';
            const newLastName = newData.lastName || req.last_name || '';
            const newName = `${newFirstName} ${newLastName}`.trim() || '—';

            const oldFatherName = oldData.fatherName || oldData.father_name || '—';
            const newFatherName = newData.fatherName || req.father_name || '—';

            const oldPhone = oldData.phone || '—';
            const newPhone = newData.phone || req.phone || '—';

            const oldPassport = `${oldData.passportSeries || oldData.passport_series || ''} ${oldData.passportNumber || oldData.passport_number || ''}`.trim() || '—';
            const newPassport = `${newData.passportSeries || req.passport_series || ''} ${newData.passportNumber || req.passport_number || ''}`.trim() || '—';

            const oldPosition = oldData.position || '—';
            const newPosition = newData.position || req.position || '—';

            const oldPlayerNumber = oldData.playerNumber ? `#${oldData.playerNumber}` : (oldData.player_number ? `#${oldData.player_number}` : '—');
            const newPlayerNumber = newData.playerNumber ? `#${newData.playerNumber}` : (req.player_number ? `#${req.player_number}` : '—');

            const oldCitizenship = oldData.citizenship || commentMeta.citizenship || '—';
            const newCitizenship = newData.citizenship || oldCitizenship;

            const oldHeight = oldData.height || commentMeta.height || '';
            const oldWeight = oldData.weight || commentMeta.weight || '';
            const oldHW = (oldHeight || oldWeight) ? `${oldHeight ? `${oldHeight} SM` : '—'} / ${oldWeight ? `${oldWeight} KG` : '—'}` : '— / —';

            const newHeight = newData.height || oldHeight;
            const newWeight = newData.weight || oldWeight;
            const newHW = (newHeight || newWeight) ? `${newHeight ? `${newHeight} SM` : '—'} / ${newWeight ? `${newWeight} KG` : '—'}` : '— / —';

            const oldBirthDate = oldData.birthDate || oldData.birth_date || '—';
            const newBirthDate = newData.birthDate || req.birth_date || '—';

            const oldInsta = getInstaUser(oldData.instagramUsername) || getInstaUser(oldData.instagram_username) || getInstaUser(oldData.instagramUrl) || extractInstaFromComment(req.comment) || '—';
            const newInsta = getInstaUser(newData.instagramUsername) || getInstaUser(newData.instagram_username) || getInstaUser(newData.instagramUrl) || extractInstaFromComment(req.comment) || '—';

            return (
              <div
                key={req.id}
                style={{
                  background: '#0c101c',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '16px',
                  padding: '16px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
                }}
              >
                {/* CARD TOP INFO */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
                    {new Date(req.created_at).toLocaleString('uz-UZ')}
                  </span>

                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: '800',
                      textTransform: 'uppercase',
                      padding: '3px 10px',
                      borderRadius: '6px',
                      background: isApproved ? 'rgba(16, 185, 129, 0.2)' : isRejected ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                      color: isApproved ? '#10B981' : isRejected ? '#EF4444' : '#F59E0B'
                    }}
                  >
                    {isApproved ? 'Tasdiqlangan' : isRejected ? 'Rad Etilgan' : 'Kutilmoqda'}
                  </span>
                </div>

                {/* ROW BY ROW PARALLEL COMPARISON (DESKTOP & MOBILE RESPONSIVE) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  
                  {/* PHOTO COMPARISON ROW */}
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 12px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {oldPhoto ? (
                        <img src={oldPhoto} alt="Eski" style={{ width: '48px', height: '48px', borderRadius: '10px', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.2)' }} />
                      ) : (
                        <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>Yo'q</div>
                      )}
                      <div>
                        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', display: 'block', fontWeight: '800' }}>ESKI RASM</span>
                      </div>
                    </div>

                    <ArrowRight size={18} color="#00ff66" />

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div>
                        <span style={{ fontSize: '10px', color: '#00ff66', display: 'block', fontWeight: '800', textAlign: 'right' }}>YANGI RASM</span>
                      </div>
                      {newPhoto ? (
                        <img src={newPhoto} alt="Yangi" style={{ width: '48px', height: '48px', borderRadius: '10px', objectFit: 'cover', border: '2px solid #00ff66' }} />
                      ) : (
                        <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: 'rgba(0,255,102,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#00ff66' }}>Bir xil</div>
                      )}
                    </div>
                  </div>

                  {/* FIELD COMPARISONS */}
                  <DiffRow label="Ism-Familiya" oldVal={oldName} newVal={newName} showOnlyChanged={showOnlyChanged} />
                  <DiffRow label="Otasining Ismi" oldVal={oldFatherName} newVal={newFatherName} showOnlyChanged={showOnlyChanged} />
                  <DiffRow label="Telefon Raqami" oldVal={oldPhone} newVal={newPhone} showOnlyChanged={showOnlyChanged} />
                  <DiffRow label="Pasport Seriya / Raqam" oldVal={oldPassport} newVal={newPassport} showOnlyChanged={showOnlyChanged} />
                  <DiffRow label="Pozitsiya" oldVal={oldPosition} newVal={newPosition} showOnlyChanged={showOnlyChanged} />
                  <DiffRow label="Forma Raqami" oldVal={oldPlayerNumber} newVal={newPlayerNumber} showOnlyChanged={showOnlyChanged} />
                  <DiffRow label="Millati" oldVal={oldCitizenship} newVal={newCitizenship} showOnlyChanged={showOnlyChanged} />
                  <DiffRow label="Bo'yi / Vazni" oldVal={oldHW} newVal={newHW} showOnlyChanged={showOnlyChanged} />
                  <DiffRow label="Tug'ilgan Sana" oldVal={oldBirthDate} newVal={newBirthDate} showOnlyChanged={showOnlyChanged} />
                  <DiffRow label="Instagram Username" oldVal={oldInsta !== '—' ? `@${oldInsta}` : '—'} newVal={newInsta !== '—' ? `@${newInsta}` : '—'} showOnlyChanged={showOnlyChanged} />

                </div>

                {/* ACTION BUTTONS: 3 ICON BUTTONS (Rad etish, O'chirish in middle, Qabul qilish) */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginTop: '16px' }}>
                  {isPending && (
                    <button
                      type="button"
                      title="Rad Etish"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleReject(req);
                      }}
                      disabled={processingId === req.id}
                      style={{
                        flex: 1,
                        padding: '12px',
                        background: 'rgba(239, 68, 68, 0.15)',
                        border: '1px solid rgba(239, 68, 68, 0.4)',
                        color: '#EF4444',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <X size={20} />
                    </button>
                  )}

                  <button
                    type="button"
                    title="Arizani O'chirish"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDelete(req);
                    }}
                    disabled={processingId === req.id}
                    style={{
                      flex: 1,
                      padding: '12px',
                      background: 'rgba(239, 68, 68, 0.25)',
                      border: '1px solid rgba(239, 68, 68, 0.5)',
                      color: '#ff4d4d',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <Trash2 size={20} />
                  </button>

                  {isPending && (
                    <button
                      type="button"
                      title="Tasdiqlash va Yangilash"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleApprove(req);
                      }}
                      disabled={processingId === req.id}
                      style={{
                        flex: 1,
                        padding: '12px',
                        background: '#00ff66',
                        border: 'none',
                        color: '#000000',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <Check size={20} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Clean horizontal row-by-row diff comparison with O'ZGARGAN badges
function DiffRow({ label, oldVal, newVal, showOnlyChanged }) {
  const cleanOld = String(oldVal || '').trim();
  const cleanNew = String(newVal || '').trim();

  const isChanged = cleanOld !== cleanNew && cleanOld !== '' && cleanNew !== '' && cleanOld !== '—' && cleanNew !== '—';

  if (showOnlyChanged && !isChanged) return null;

  return (
    <div style={{
      background: isChanged ? 'rgba(0, 255, 102, 0.08)' : 'rgba(255, 255, 255, 0.02)',
      border: isChanged ? '1px solid rgba(0, 255, 102, 0.3)' : '1px solid rgba(255, 255, 255, 0.04)',
      padding: '8px 12px',
      borderRadius: '10px',
      fontSize: '12px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <span style={{ fontSize: '10px', fontWeight: '800', color: isChanged ? '#00ff66' : 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
          {label}
        </span>
        {isChanged ? (
          <span style={{ fontSize: '9px', fontWeight: '900', color: '#00ff66', background: 'rgba(0,255,102,0.15)', padding: '1px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>
            O'ZGARGAN
          </span>
        ) : (
          <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>
            Bir xil
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ flex: 1, color: isChanged ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.5)', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {oldVal || '—'}
        </div>

        <ArrowRight size={14} color={isChanged ? '#00ff66' : 'rgba(255,255,255,0.2)'} style={{ flexShrink: 0 }} />

        <div style={{ flex: 1, textAlign: 'right', color: isChanged ? '#00ff66' : 'rgba(255,255,255,0.7)', fontWeight: isChanged ? '900' : '400', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {newVal || '—'}
        </div>
      </div>
    </div>
  );
}
