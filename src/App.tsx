import { useEffect, useState } from 'react';
import { Redirect, Route } from 'react-router-dom';
import { IonApp, IonRouterOutlet, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { User } from '@supabase/supabase-js';
import EditorPage from './pages/EditorPage';
import AuthPage from './pages/AuthPage';
import AuthCallbackPage from './pages/AuthCallbackPage';
import RedirectPage from './pages/RedirectPage';
import TermsPage from './pages/TermsPage';
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

  return (
    <IonApp>
      <IonReactRouter basename={ROUTER_BASENAME}>
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
          <Route exact path="/">
            <Redirect to="/editor" />
          </Route>
        </IonRouterOutlet>
      </IonReactRouter>
    </IonApp>
  );
};

export default App;
