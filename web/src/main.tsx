import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { PrefsProvider } from './lib/prefs';
import { LiveProvider } from './lib/live';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <PrefsProvider>
        <LiveProvider><App /></LiveProvider>
      </PrefsProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
