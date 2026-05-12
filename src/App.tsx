import { useEffect, useState } from 'react';
import { Redirect, Route } from 'react-router-dom';
import { IonApp, IonRouterOutlet, setupIonicReact } from '@ionic/react';
import { IonReactHashRouter } from '@ionic/react-router';
import { User } from '@supabase/supabase-js';
import EditorPage from './pages/EditorPage';
import AuthPage from './pages/AuthPage';
import AuthCallbackPage from './pages/AuthCallbackPage';
import RedirectPage from './pages/RedirectPage';
import TermsPage from './pages/TermsPage';
import SettingsPage from './pages/SettingsPage';
import { getCurrentUser, getProfile, supabase } from './lib/supabaseClient';
import { backfillShortUrlOrigins } from './lib/storage';
import { Profile } from './types';

/* Core CSS required for Ionic components to work properly */
import '@ionic/react/css/core.css';

/* Basic CSS for apps built with Ionic */
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';

/* Optional CSS utils that can be commented out */
import '@ionic/react/css/padding.css';
import '@ionic/react/css/float-elements.css';
import '@ionic/react/css/text-alignment.css';
import '@ionic/react/css/text-transformation.css';
import '@ionic/react/css/flex-utils.css';
import '@ionic/react/css/display.css';

/**
 * Ionic Dark Mode
 * -----------------------------------------------------
 * For more info, please see:
 * https://ionicframework.com/docs/theming/dark-mode
 */

/* import '@ionic/react/css/palettes/dark.always.css'; */
/* import '@ionic/react/css/palettes/dark.class.css'; */

/* Theme variables */
import './theme/variables.css';

setupIonicReact();

const ROUTER_BASENAME = import.meta.env.BASE_URL;

function hasUpgradeSuccessFlag(): boolean {
  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.get("upgrade") === "success") {
    return true;
  }

  const hash = window.location.hash ?? "";
  const queryIndex = hash.indexOf("?");
  if (queryIndex === -1) {
    return false;
  }

  const hashParams = new URLSearchParams(hash.slice(queryIndex + 1));
  return hashParams.get("upgrade") === "success";
}

function clearUpgradeSuccessFlag() {
  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.has("upgrade")) {
    searchParams.delete("upgrade");
    const search = searchParams.toString();
    const next = `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", next);
    return;
  }

  const hash = window.location.hash ?? "";
  const queryIndex = hash.indexOf("?");
  if (queryIndex === -1) {
    return;
  }

  const hashPath = hash.slice(0, queryIndex);
  const hashParams = new URLSearchParams(hash.slice(queryIndex + 1));
  hashParams.delete("upgrade");
  const nextHashQuery = hashParams.toString();
  const nextHash = `${hashPath}${nextHashQuery ? `?${nextHashQuery}` : ""}`;
  const next = `${window.location.pathname}${window.location.search}${nextHash}`;
  window.history.replaceState({}, "", next);
}

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  // Fix any localhost short URLs stored in localStorage
  useEffect(() => { backfillShortUrlOrigins(); }, []);

  useEffect(() => {
    let mounted = true;

    getCurrentUser().then((current) => {
      if (mounted) {
        setUser(current);
        if (current) {
          getProfile(current.id).then((p) => { if (mounted) setProfile(p); });
        }
      }
    });

    if (!supabase) {
      return () => {
        mounted = false;
      };
    }

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      if (nextUser) {
        getProfile(nextUser.id).then((p) => { if (mounted) setProfile(p); });
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user || !hasUpgradeSuccessFlag()) {
      return;
    }

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 15;
    let intervalId: number | undefined;

    const refreshProfile = async () => {
      attempts += 1;
      const next = await getProfile(user.id);
      if (cancelled) {
        return;
      }

      setProfile(next);

      if (next?.plan === "premium" || attempts >= maxAttempts) {
        clearUpgradeSuccessFlag();
        if (intervalId !== undefined) {
          window.clearInterval(intervalId);
        }
      }
    };

    void refreshProfile();
    intervalId = window.setInterval(() => {
      void refreshProfile();
    }, 2000);

    return () => {
      cancelled = true;
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, [user]);

  return (
    <IonApp>
      <IonReactHashRouter basename={ROUTER_BASENAME}>
        <IonRouterOutlet>
          <Route exact path="/editor">
            <EditorPage user={user} profile={profile} />
          </Route>
          <Route exact path="/auth">
            <AuthPage user={user} />
          </Route>
          <Route exact path="/auth/callback">
            <AuthCallbackPage />
          </Route>
          <Route exact path="/s/:code">
            <RedirectPage />
          </Route>
          <Route exact path="/terms">
            <TermsPage />
          </Route>
          <Route exact path="/settings">
            <SettingsPage user={user} profile={profile} />
          </Route>
          <Route exact path="/">
            <Redirect to="/editor" />
          </Route>
        </IonRouterOutlet>
      </IonReactHashRouter>
    </IonApp>
  );
};

export default App;
