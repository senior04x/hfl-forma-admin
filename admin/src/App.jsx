import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Schedule from './pages/Schedule';
import Standings from './pages/Standings';
import Sponsors from './pages/Sponsors';
import MatchControl from './pages/MatchControl';
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
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/standings" element={<Standings />} />
          <Route path="/sponsors" element={<Sponsors />} />
        </Route>
        <Route path="/match/:id" element={<MatchControl />} />
      </Routes>
      
      {viewerUrl && (
        <ImageViewer url={viewerUrl} onClose={() => setViewerUrl(null)} />
      )}
    </BrowserRouter>
  );
}

export default App;

