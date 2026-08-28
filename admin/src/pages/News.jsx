import React, { useState, useEffect, useRef } from 'react';
import { supabase as supabase } from '../supabaseClient';
import { useOrg } from '../context/OrgContext';
import { Newspaper, Plus, Trash2, Image, Upload, X } from 'lucide-react';

const News = () => {
  const { orgId } = useOrg();
  const [newsList, setNewsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState('Barchasi');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState("O'yinlar");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef(null);

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
        if (error.code === '42P01' || error.code === 'PGRST205') {
          console.warn('News table not found. Please create it in Supabase Dashboard.');
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

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert("Faqat rasm fayllari ruxsat etilgan!");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert("Rasm hajmi 5MB dan oshmasligi kerak!");
      return;
    }

    setImageFile(file);
    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target.result);
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploadImage = async (file) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
    const filePath = `news/${fileName}`;

    const { data, error } = await supabase.storage
      .from('news-images')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      throw new Error('Rasm yuklashda xatolik: ' + error.message);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('news-images')
      .getPublicUrl(filePath);

    return urlData.publicUrl;
  };

  const handleCreateNews = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      alert("Iltimos, yangilik sarlavhasini kiriting!");
      return;
    }

    setSubmitting(true);
    try {
      let finalImageUrl = '';

      // Upload image if selected
      if (imageFile) {
        finalImageUrl = await uploadImage(imageFile);
      }

      const payload = {
        title: title.trim(),
        category: category,
        image_url: finalImageUrl,
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
        setImageFile(null);
        setImagePreview(null);
        setContent('');
        if (fileInputRef.current) fileInputRef.current.value = '';
        fetchNews();
      }
    } catch (err) {
      console.error('Error creating news:', err);
      alert(err.message || "Yangilik yaratishda xatolik yuz berdi");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteNews = async (id, imageUrl) => {
    if (!window.confirm("Chindan ham ushbu yangilikni o'chirmoqchimisiz?")) return;
    try {
      // Delete image from storage if exists
      if (imageUrl && imageUrl.includes('news-images')) {
        const path = imageUrl.split('/news-images/')[1];
        if (path) {
          await supabase.storage.from('news-images').remove([path]);
        }
      }

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
    <div style={{ padding: '16px', color: '#ffffff', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Newspaper color="#00ff87" size={24} /> YANGILIKLAR BOSHQARUVI
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '12px', margin: '4px 0 0 0' }}>
            Ilova uchun rasmiy yangiliklarni yaratish va boshqarish
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          style={{
            background: 'linear-gradient(135deg, #00ff87 0%, #60efff 100%)',
            color: '#000000',
            border: 'none',
            padding: '10px 16px',
            borderRadius: '12px',
            fontWeight: '900',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
            boxShadow: '0 4px 15px rgba(0, 255, 135, 0.3)',
            width: 'auto'
          }}
        >
          <Plus size={18} /> YANGI YANGILIK QO'SHISH
        </button>
      </div>

      {/* Category Filter */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '20px',
          overflowX: 'auto',
          paddingBottom: '8px',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none'
        }}
      >
        {['Barchasi', ...categories].map(cat => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            style={{
              padding: '8px 16px',
              borderRadius: '20px',
              border: filterCategory === cat ? '1.5px solid #00ff87' : '1px solid rgba(255,255,255,0.1)',
              background: filterCategory === cat ? 'rgba(0, 255, 135, 0.25)' : 'rgba(255,255,255,0.04)',
              color: filterCategory === cat ? '#00ff87' : '#94a3b8',
              fontWeight: filterCategory === cat ? '800' : '600',
              cursor: 'pointer',
              fontSize: '12px',
              whiteSpace: 'nowrap',
              flexShrink: 0
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
        <div style={{ padding: '50px 20px', textAlign: 'center', background: 'rgba(255,255,255,0.03)', borderRadius: '16px', border: '1px dashed rgba(255,255,255,0.1)' }}>
          <Newspaper size={44} color="#475569" style={{ marginBottom: '12px' }} />
          <h3 style={{ margin: 0, color: '#cbd5e1', fontSize: '16px' }}>Hozircha yangiliklar yo'q</h3>
          <p style={{ color: '#64748b', fontSize: '12px', marginTop: '4px' }}>Tugmani bosib birinchi yangilikni e'lon qiling</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
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
              {item.image_url ? (
                <img
                  src={item.image_url}
                  alt={item.title}
                  style={{ width: '100%', height: '160px', objectFit: 'cover' }}
                />
              ) : (
                <div style={{ width: '100%', height: '160px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Image size={40} color="#475569" />
                </div>
              )}
              <div style={{ padding: '14px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
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
                  <h3 style={{ margin: '0 0 6px 0', fontSize: '14px', fontWeight: '800', color: '#ffffff', lineHeight: 1.4 }}>
                    {item.title}
                  </h3>
                  <p style={{ color: '#94a3b8', fontSize: '12px', margin: 0, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {item.content}
                  </p>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <span style={{ color: '#64748b', fontSize: '11px' }}>
                    {new Date(item.created_at || Date.now()).toLocaleDateString('uz-UZ')}
                  </span>
                  <button
                    onClick={() => handleDeleteNews(item.id, item.image_url)}
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '12px' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', width: '100%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto', borderRadius: '20px', padding: '20px', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, color: '#ffffff', fontSize: '17px', fontWeight: '900' }}>
                YANGI YANGILIK YARATISH
              </h2>
              <button
                onClick={() => { setIsModalOpen(false); removeImage(); }}
                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '10px', padding: '6px', cursor: 'pointer', color: '#fff' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateNews}>
              {/* Title */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', color: '#cbd5e1', fontSize: '11px', fontWeight: '800', marginBottom: '6px' }}>
                  YANGILIK SARLAVHASI *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Sarlavhani kiriting..."
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  style={{ width: '100%', padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>

              {/* Category */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', color: '#cbd5e1', fontSize: '11px', fontWeight: '800', marginBottom: '6px' }}>
                  KATEGORIYA TANLANG *
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                  {categories.map(cat => (
                    <button
                      type="button"
                      key={cat}
                      onClick={() => setCategory(cat)}
                      style={{
                        padding: '10px',
                        borderRadius: '10px',
                        border: category === cat ? '2px solid #00ff87' : '1px solid rgba(255,255,255,0.1)',
                        background: category === cat ? 'rgba(0, 255, 135, 0.25)' : 'rgba(255,255,255,0.04)',
                        color: category === cat ? '#00ff87' : '#cbd5e1',
                        fontWeight: category === cat ? '900' : '600',
                        cursor: 'pointer',
                        fontSize: '12px',
                        textAlign: 'center'
                      }}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Image Upload */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', color: '#cbd5e1', fontSize: '11px', fontWeight: '800', marginBottom: '6px' }}>
                  RASM YUKLASH
                </label>

                {imagePreview ? (
                  <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', border: '2px solid rgba(0, 255, 135, 0.3)' }}>
                    <img
                      src={imagePreview}
                      alt="Preview"
                      style={{ width: '100%', height: '180px', objectFit: 'cover', display: 'block' }}
                    />
                    <button
                      type="button"
                      onClick={removeImage}
                      style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        background: 'rgba(239, 68, 68, 0.9)',
                        border: 'none',
                        borderRadius: '50%',
                        width: '28px',
                        height: '28px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        color: '#fff'
                      }}
                    >
                      <X size={14} />
                    </button>
                    <div style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
                      padding: '8px 12px',
                      fontSize: '11px',
                      color: '#00ff87',
                      fontWeight: '700'
                    }}>
                      ✓ {imageFile?.name}
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      width: '100%',
                      height: '140px',
                      borderRadius: '12px',
                      border: '2px dashed rgba(255,255,255,0.15)',
                      background: 'rgba(255,255,255,0.03)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      boxSizing: 'border-box'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(0, 255, 135, 0.4)';
                      e.currentTarget.style.background = 'rgba(0, 255, 135, 0.05)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
                      e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                    }}
                  >
                    <Upload size={28} color="#64748b" style={{ marginBottom: '8px' }} />
                    <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: '700' }}>
                      Rasm tanlash uchun bosing
                    </span>
                    <span style={{ color: '#475569', fontSize: '10px', marginTop: '4px' }}>
                      PNG, JPG, GIF, WEBP • Max 5MB
                    </span>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
              </div>

              {/* Content */}
              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', color: '#cbd5e1', fontSize: '11px', fontWeight: '800', marginBottom: '6px' }}>
                  YANGILIK MATNI
                </label>
                <textarea
                  rows={4}
                  placeholder="Batafsil yangilik matnini kiriting..."
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  style={{ width: '100%', padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: '14px', resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => { setIsModalOpen(false); removeImage(); }}
                  style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', color: '#fff', border: 'none', fontWeight: '700', cursor: 'pointer' }}
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '10px',
                    background: submitting ? '#555' : '#00ff87',
                    color: '#000',
                    border: 'none',
                    fontWeight: '900',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  {submitting ? (
                    <>
                      <span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#000', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      Yuklanmoqda...
                    </>
                  ) : 'Chop etish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Spinner animation */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default News;
