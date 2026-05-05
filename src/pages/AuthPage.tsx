import { FormEvent, useState } from "react";
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonPage,
  IonText,
  IonTitle,
  IonToolbar,
} from "@ionic/react";
import { useHistory } from "react-router";
import { User } from "@supabase/supabase-js";
import { sendMagicLink, supabase } from "../lib/supabaseClient";

type Props = {
  user: User | null;
};

const AuthPage: React.FC<Props> = ({ user }) => {
  const history = useHistory();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  if (user) {
    history.replace("/editor");
    return null;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setStatus("");

    if (!supabase) {
      setError("Supabase is not configured. Add environment keys to enable Magic Link sign-in.");
      return;
    }

    try {
      await sendMagicLink(email.trim());
      setStatus("Check your inbox for the Magic Link.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send Magic Link.");
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
            <IonCardTitle>Magic Link Authentication</IonCardTitle>
          </IonCardHeader>
          <IonCardContent>
            <form onSubmit={handleSubmit}>
              <IonItem>
                <IonLabel position="stacked">Email</IonLabel>
                <IonInput
                  value={email}
                  type="email"
                  autocomplete="email"
                  placeholder="you@company.com"
                  onIonInput={(e) => setEmail((e.detail.value ?? "").toString())}
                />
              </IonItem>
              <IonButton type="submit" expand="block" className="ion-margin-top">
                Send Magic Link
              </IonButton>
              <IonButton type="button" expand="block" fill="clear" onClick={() => history.push("/editor")}>
                Back to Editor
              </IonButton>
            </form>
            {status && <IonText color="success"><p>{status}</p></IonText>}
            {error && <IonText color="danger"><p>{error}</p></IonText>}
          </IonCardContent>
        </IonCard>
      </IonContent>
    </IonPage>
  );
};

export default AuthPage;
