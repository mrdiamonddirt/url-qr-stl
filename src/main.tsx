import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { buildHashRouteFromPathname, buildHashRouteFromSpaRedirect } from './lib/spaRedirect';

const baseUrl = import.meta.env.BASE_URL ?? '/';
const pendingRedirect = window.sessionStorage.getItem('spa_redirect');
if (pendingRedirect) {
  const next = buildHashRouteFromSpaRedirect(pendingRedirect, baseUrl);
  window.sessionStorage.removeItem('spa_redirect');
  if (next) {
    window.history.replaceState(null, '', next);
  }
} else if (!window.location.hash.startsWith('#/')) {
  const next = buildHashRouteFromPathname(window.location.pathname, window.location.search, baseUrl);
  if (next && next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
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