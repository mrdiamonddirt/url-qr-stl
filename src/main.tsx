import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import {
  buildHashRouteFromPathname,
  buildHashRouteFromSpaRedirect,
  shouldPrioritizePathnameShortLink,
} from './lib/spaRedirect';

const baseUrl = import.meta.env.BASE_URL ?? '/';
const pathnameHashTarget = buildHashRouteFromPathname(window.location.pathname, window.location.search, baseUrl);
const currentHashPath = window.location.hash.startsWith('#')
  ? (window.location.hash.slice(1).split('?')[0] || '/')
  : '/';

// If a public short-link path is present in pathname, always honor it over stale hash routes.
if (shouldPrioritizePathnameShortLink(pathnameHashTarget, currentHashPath)) {
  window.history.replaceState(null, '', pathnameHashTarget);
}

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