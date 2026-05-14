import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { buildHashRouteFromSpaRedirect } from './lib/spaRedirect';

const pendingRedirect = window.sessionStorage.getItem('spa_redirect');
if (pendingRedirect) {
  const next = buildHashRouteFromSpaRedirect(pendingRedirect, import.meta.env.BASE_URL ?? '/');
  window.sessionStorage.removeItem('spa_redirect');
  if (next) {
    window.history.replaceState(null, '', next);
  }
}

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);