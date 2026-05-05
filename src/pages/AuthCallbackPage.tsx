import { useEffect } from "react";
import { IonContent, IonPage, IonSpinner, IonText } from "@ionic/react";
import { useHistory } from "react-router";
import { supabase } from "../lib/supabaseClient";

const AuthCallbackPage: React.FC = () => {
  const history = useHistory();

  useEffect(() => {
    let cancelled = false;

    async function resolveSession() {
      if (!supabase) {
        history.replace("/editor");
        return;
      }

      await supabase.auth.getSession();

      if (!cancelled) {
        const returnTo = localStorage.getItem("url-qr-stl.return-to") ?? "/editor";
        localStorage.removeItem("url-qr-stl.return-to");
        history.replace(returnTo);
      }
    }

    resolveSession();

    return () => {
      cancelled = true;
    };
  }, [history]);

  return (
    <IonPage>
      <IonContent className="ion-padding">
        <IonSpinner />
        <IonText>
          <p>Signing you in...</p>
        </IonText>
      </IonContent>
    </IonPage>
  );
};

export default AuthCallbackPage;
