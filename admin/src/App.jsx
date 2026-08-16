import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import Schedule from './pages/Schedule';
import Standings from './pages/Standings';
import Cards from './pages/Cards';
import Sponsors from './pages/Sponsors';
import MatchControl from './pages/MatchControl';
import Transfers from './pages/Transfers';
import ProfileUpdates from './pages/ProfileUpdates';
import Settings from './pages/Settings';
import News from './pages/News';
import ObsScoreboard from './pages/ObsScoreboard';
import Archive from './pages/Archive';
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
          <Route path="/profile-updates" element={<ProfileUpdates />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/standings" element={<Standings />} />
          <Route path="/cards" element={<Cards />} />
          <Route path="/sponsors" element={<Sponsors />} />
          <Route path="/news" element={<News />} />
          <Route path="/archive" element={<Archive />} />
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

