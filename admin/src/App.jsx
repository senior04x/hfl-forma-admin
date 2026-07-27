import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import Schedule from './pages/Schedule';
import Standings from './pages/Standings';
import Sponsors from './pages/Sponsors';
import MatchControl from './pages/MatchControl';
import Transfers from './pages/Transfers';
import Organizations from './pages/Organizations';
import Settings from './pages/Settings';
import ObsScoreboard from './pages/ObsScoreboard';
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
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/transfers" element={<Transfers />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/standings" element={<Standings />} />
          <Route path="/sponsors" element={<Sponsors />} />
          <Route path="/organizations" element={<Organizations />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="/match/:id" element={<MatchControl />} />
        <Route path="/obs/scoreboard/:id" element={<ObsScoreboard />} />
      </Routes>
      
      {viewerUrl && (
        <ImageViewer url={viewerUrl} onClose={() => setViewerUrl(null)} />
      )}
    </BrowserRouter>
  );
}

export default App;

