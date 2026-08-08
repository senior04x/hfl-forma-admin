import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useOrg } from '../context/OrgContext';
import { Newspaper, Plus, Trash2, Image, Tag, FileText, CheckCircle2, AlertCircle } from 'lucide-react';

const News = () => {
  const { orgId } = useOrg();
  const [newsList, setNewsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState('Barchasi');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState("O'yinlar");
  const [imageUrl, setImageUrl] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const categories = ['Turnirlar', 'Jamoalar', 'Transferlar', "O'yinlar"];

  useEffect(() => {
    fetchNews();
  }, [orgId]);

  const fetchNews = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('news')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        if (error.code === '42P01') {
          setNewsList([]);
        } else {
          console.warn('News fetch error:', error);
        }
      } else {
        setNewsList(data || []);
      }
    } catch (err) {
      console.error('Error fetching news:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNews = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      alert("Iltimos, yangilik sarlavhasini kiriting!");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        category: category,
        image_url: imageUrl.trim() || 'https://images.unsplash.com/photo-1574629810360-7efbb6b6973f?q=80&w=1000',
        content: content.trim(),
        organization_id: orgId || null,
        views: 0
      };

      const { data, error } = await supabase.from('news').insert([payload]).select();

      if (error) {
        alert("Xatolik: " + error.message);
      } else {
        alert("Yangilik muvaffaqiyatli chop etildi!");
        setIsModalOpen(false);
        setTitle('');
        setCategory("O'yinlar");
        setImageUrl('');
        setContent('');
        fetchNews();
      }
    } catch (err) {
      console.error('Error creating news:', err);
      alert("Yangilik yaratishda xatolik yuz berdi");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteNews = async (id) => {
    if (!window.confirm("Chindan ham ushbu yangilikni o'chirmoqchimisiz?")) return;
    try {
      const { error } = await supabase.from('news').delete().eq('id', id);
      if (error) alert("O'chirishda xatolik: " + error.message);
      else fetchNews();
    } catch (e) {
      console.error('Delete error:', e);
    }
  };

  const filteredList = filterCategory === 'Barchasi'
    ? newsList
    : newsList.filter(n => (n.category || '').toLowerCase().includes(filterCategory.toLowerCase()));

  return (
    <div style={{ padding: '24px', color: '#ffffff' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Newspaper color="#00ff87" size={28} /> YANGILIKLAR BOSHQARUVI
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '13px', margin: '4px 0 0 0' }}>
            Ilova va sayt uchun rasmiy yangiliklarni yaratish va boshqarish
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          style={{
            background: 'linear-gradient(135deg, #00ff87 0%, #60efff 100%)',
            color: '#000000',
            border: 'none',
            padding: '12px 20px',
            borderRadius: '12px',
            fontWeight: '900',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 15px rgba(0, 255, 135, 0.3)'
          }}
        >
          <Plus size={18} /> YANGI YANGILIK QO'SHISH
        </button>
      </div>

      {/* Category Filter */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {['Barchasi', ...categories].map(cat => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            style={{
              padding: '8px 16px',
              borderRadius: '20px',
              border: filterCategory === cat ? '1px solid #00ff87' : '1px solid rgba(255,255,255,0.1)',
              background: filterCategory === cat ? 'rgba(0, 255, 135, 0.2)' : 'rgba(255,255,255,0.04)',
              color: filterCategory === cat ? '#00ff87' : '#94a3b8',
              fontWeight: filterCategory === cat ? '800' : '600',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            {cat.toUpperCase()}
          </button>
        ))}
      </div>

      {/* News Grid */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Yuklanmoqda...</div>
      ) : filteredList.length === 0 ? (
        <div style={{ padding: '60px', textAlign: 'center', background: 'rgba(255,255,255,0.03)', borderRadius: '16px', border: '1px dashed rgba(255,255,255,0.1)' }}>
          <Newspaper size={48} color="#475569" style={{ marginBottom: '12px' }} />
          <h3 style={{ margin: 0, color: '#cbd5e1' }}>Hozircha yangiliklar yo'q</h3>
          <p style={{ color: '#64748b', fontSize: '13px' }}>Tugmani bosib birinchi yangilikni e'lon qiling</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
          {filteredList.map(item => (
            <div
              key={item.id}
              style={{
                background: 'rgba(30, 41, 59, 0.7)',
                borderRadius: '16px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <img
                src={item.image_url || item.imageUrl || 'https://images.unsplash.com/photo-1574629810360-7efbb6b6973f?q=80&w=1000'}
                alt={item.title}
                style={{ width: '100%', height: '160px', objectFit: 'cover' }}
              />
              <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <span
                    style={{
                      background: 'rgba(0, 255, 135, 0.2)',
                      color: '#00ff87',
                      fontSize: '10px',
                      fontWeight: '800',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      display: 'inline-block',
                      marginBottom: '8px'
                    }}
                  >
                    {(item.category || "O'YINLAR").toUpperCase()}
                  </span>
                  <h3 style={{ margin: '0 0 8px 0', fontSize: '15px', fontWeight: '800', color: '#ffffff', lineHeight: 1.4 }}>
                    {item.title}
                  </h3>
                  <p style={{ color: '#94a3b8', fontSize: '12px', margin: 0, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {item.content}
                  </p>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <span style={{ color: '#64748b', fontSize: '11px' }}>
                    {new Date(item.created_at || Date.now()).toLocaleDateString('uz-UZ')}
                  </span>
                  <button
                    onClick={() => handleDeleteNews(item.id)}
                    style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', border: 'none', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add News Modal */}
      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', width: '100%', maxWidth: '520px', borderRadius: '20px', padding: '24px' }}>
            <h2 style={{ margin: '0 0 20px 0', color: '#ffffff', fontSize: '18px', fontWeight: '900' }}>
              YANGI YANGILIK YARATISH
            </h2>

            <form onSubmit={handleCreateNews}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', color: '#cbd5e1', fontSize: '12px', fontWeight: '700', marginBottom: '6px' }}>
                  YANGILIK SARLAVHASI *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Sarlavhani kiriting..."
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  style={{ width: '100%', padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '14px' }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', color: '#cbd5e1', fontSize: '12px', fontWeight: '700', marginBottom: '6px' }}>
                  KATEGORIYA TANLANG *
                </label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {categories.map(cat => (
                    <button
                      type="button"
                      key={cat}
                      onClick={() => setCategory(cat)}
                      style={{
                        padding: '8px 14px',
                        borderRadius: '8px',
                        border: category === cat ? '2px solid #00ff87' : '1px solid rgba(255,255,255,0.1)',
                        background: category === cat ? 'rgba(0, 255, 135, 0.2)' : 'rgba(255,255,255,0.04)',
                        color: category === cat ? '#00ff87' : '#94a3b8',
                        fontWeight: '700',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', color: '#cbd5e1', fontSize: '12px', fontWeight: '700', marginBottom: '6px' }}>
                  RASM HAVOLASI (URL)
                </label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={imageUrl}
                  onChange={e => setImageUrl(e.target.value)}
                  style={{ width: '100%', padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '14px' }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', color: '#cbd5e1', fontSize: '12px', fontWeight: '700', marginBottom: '6px' }}>
                  YANGILIK MATNI
                </label>
                <textarea
                  rows={4}
                  placeholder="Batafsil yangilik matnini kiriting..."
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  style={{ width: '100%', padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '14px', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{ padding: '12px 20px', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', color: '#fff', border: 'none', fontWeight: '700', cursor: 'pointer' }}
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{ padding: '12px 20px', borderRadius: '10px', background: '#00ff87', color: '#000', border: 'none', fontWeight: '900', cursor: 'pointer' }}
                >
                  {submitting ? 'Chop etilmoqda...' : 'Chop etish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default News;
