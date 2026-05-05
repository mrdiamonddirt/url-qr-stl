import { useState } from "react";
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonIcon,
  IonPage,
  IonText,
  IonTitle,
  IonToolbar,
} from "@ionic/react";
import { useHistory } from "react-router";
import { User } from "@supabase/supabase-js";
import { logoGoogle, arrowBackOutline, lockClosedOutline } from "ionicons/icons";
import { signInWithGoogle, supabase } from "../lib/supabaseClient";
import "./AuthPage.css";

type Props = {
  user: User | null;
};

const AuthPage: React.FC<Props> = ({ user }) => {
  const history = useHistory();
  const [error, setError] = useState("");

  if (user) {
    history.replace("/editor");
    return null;
  }

  async function handleGoogleSignIn() {
    setError("");

    if (!supabase) {
      setError("Supabase is not configured. Add environment keys to enable Google sign-in.");
      return;
    }

    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in with Google.");
    }
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar className="auth-toolbar">
          <IonTitle className="premium-toolbar-title">URL 2 STL</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="auth-shell" fullscreen>
        <div className="auth-layout">
          <section className="auth-hero">
            <p className="auth-kicker">Account access</p>
            <h1>Sign in to sync exports, manage plan status, and unlock downloads.</h1>
            <p>
              URL 2 STL keeps the editor open to everyone, then adds account-backed history, export access, and premium controls when you authenticate.
            </p>
            <div className="auth-feature-list">
              <div>
                <IonIcon icon={lockClosedOutline} />
                <span>Google sign-in with Supabase-backed account state.</span>
              </div>
              <div>
                <IonIcon icon={arrowBackOutline} />
                <span>Return straight to the editor flow after authentication.</span>
              </div>
            </div>
          </section>

          <IonCard className="auth-card auth-card--polished">
            <IonCardHeader>
              <IonCardTitle>Continue to URL 2 STL</IonCardTitle>
            </IonCardHeader>
            <IonCardContent>
              <p className="auth-card__copy">Use Google to access saved history, premium plan controls, and model downloads.</p>
              <IonButton expand="block" onClick={handleGoogleSignIn}>
                <IonIcon slot="start" icon={logoGoogle} />
                Sign in with Google
              </IonButton>
              <IonButton expand="block" fill="clear" onClick={() => history.push("/editor")}>
                <IonIcon slot="start" icon={arrowBackOutline} />
                Back to Editor
              </IonButton>
              {error && <IonText color="danger"><p>{error}</p></IonText>}
            </IonCardContent>
          </IonCard>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default AuthPage;
