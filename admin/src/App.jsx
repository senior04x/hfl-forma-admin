import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Layout from './components/Layout';
import ImageViewer from './components/ImageViewer';

function App() {
  const [viewerUrl, setViewerUrl] = useState(null);

  useEffect(() => {
    // Global function for old-style compatibility inside components
    window.openImageViewer = (url) => {
      setViewerUrl(url);
    };
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={<Login />} />
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/schedule" element={<div style={{padding: 20}}>O'yinlar jadvali (Tez kunda)</div>} />
        </Route>
      </Routes>
      
      {viewerUrl && (
        <ImageViewer url={viewerUrl} onClose={() => setViewerUrl(null)} />
      )}
    </BrowserRouter>
  );
}

export default App;

