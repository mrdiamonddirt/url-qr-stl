import { useState } from "react";
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonPage,
  IonText,
  IonTitle,
  IonToolbar,
} from "@ionic/react";
import { useHistory } from "react-router";
import { User } from "@supabase/supabase-js";
import { signInWithGoogle, supabase } from "../lib/supabaseClient";

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
        <IonToolbar>
          <IonTitle>Sign in</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen>
        <IonCard className="auth-card">
          <IonCardHeader>
            <IonCardTitle>Sign in</IonCardTitle>
          </IonCardHeader>
          <IonCardContent>
            <IonButton expand="block" onClick={handleGoogleSignIn}>
              Sign in with Google
            </IonButton>
            <IonButton expand="block" fill="clear" onClick={() => history.push("/editor")}>
              Back to Editor
            </IonButton>
            {error && <IonText color="danger"><p>{error}</p></IonText>}
          </IonCardContent>
        </IonCard>
      </IonContent>
    </IonPage>
  );
};

export default AuthPage;
