import { useEffect, useState } from "react";
import { IonContent, IonPage, IonSpinner, IonText } from "@ionic/react";
import { useParams } from "react-router";
import { findShortUrlByCode } from "../lib/storage";
import { supabase } from "../lib/supabaseClient";

type RouteParams = {
  code: string;
};

const RedirectPage: React.FC = () => {
  const { code } = useParams<RouteParams>();
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function redirect() {
      const localRecord = findShortUrlByCode(code);
      if (localRecord) {
        window.location.replace(localRecord.originalUrl);
        return;
      }

      if (supabase) {
        const { data, error: dbError } = await supabase
          .from("short_urls")
          .select("original_url")
          .eq("short_code", code)
          .single();

        if (!dbError && data?.original_url) {
          window.location.replace(data.original_url);
          return;
        }
      }

      if (!cancelled) {
        setError("Short link not found.");
      }
    }

    redirect();

    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <IonPage>
      <IonContent className="ion-padding">
        {error ? (
          <IonText color="danger">
            <p>{error}</p>
          </IonText>
        ) : (
          <>
            <IonSpinner />
            <IonText>
              <p>Redirecting...</p>
            </IonText>
          </>
        )}
      </IonContent>
    </IonPage>
  );
};

export default RedirectPage;
