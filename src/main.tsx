import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './ui/App';
import './ui/styles.css';

// Redirect to HTTPS if not on localhost and using HTTP
if (
  window.location.protocol === 'http:' &&
  window.location.hostname !== 'localhost' &&
  window.location.hostname !== '127.0.0.1'
) {
  window.location.href = window.location.href.replace('http:', 'https:');
}

// Keep a lightweight service worker only to remove caches created by older
// releases. Application documents, bundles and API requests use the network.
if ('serviceWorker' in navigator) {
  const isHttpsOrLocalhost =
    window.location.protocol === 'https:' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';

  if (isHttpsOrLocalhost) {
    window.addEventListener('load', () => {
      let reloadingForNewWorker = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloadingForNewWorker) return;
        reloadingForNewWorker = true;
        window.location.reload();
      });

      void navigator.serviceWorker
        .register('/sw.js', { updateViaCache: 'none' })
        .then(async (registration) => {
          await registration.update();
          const worker =
            registration.active ?? navigator.serviceWorker.controller;
          worker?.postMessage({ type: 'CLEAR_JOJ_CACHES' });
        })
        .catch(() => {
          // A service worker is an optional cache-cleanup enhancement.
        });
    });
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
