import { useEffect, useState } from "react";
import { IonButton, IonContent, IonPage, IonSpinner, IonText } from "@ionic/react";
import { useParams } from "react-router";
import { findShortUrlByCode } from "../lib/storage";
import { recordScan } from "../lib/supabaseClient";

const SCAN_LIMIT = 20;

type RouteParams = { code: string };

const RedirectPage: React.FC = () => {
  const { code } = useParams<RouteParams>();
  const [error, setError] = useState<"not_found" | "limit_reached" | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function redirect() {
      // Try Supabase record_scan first (tracks counts + enforces limit)
      const result = await recordScan(code);

      if (cancelled) return;

      if (!("error" in result)) {
        window.location.replace(result.original_url);
        return;
      }

      if (result.error === "limit_reached") {
        setError("limit_reached");
        return;
      }

      // not_found or client unavailable — fall back to localStorage
      const local = findShortUrlByCode(code);
      if (local) {
        window.location.replace(local.originalUrl);
      } else {
        setError("not_found");
      }
    }

    redirect();
    return () => { cancelled = true; };
  }, [code]);

  if (error === "limit_reached") {
    return (
      <IonPage>
        <IonContent className="ion-padding">
          <IonText>
            <h2>Tag deactivated</h2>
            <p>
              This QR tag has used all {SCAN_LIMIT} free scans. The owner needs to upgrade
              to a Premium account to reactivate this link and unlock 10,000 monthly scans.
            </p>
          </IonText>
          <IonButton href={`${window.location.origin.replace(/\/s\/.*$/, "")}/editor`} fill="solid">
            Upgrade to Premium
          </IonButton>
          <IonButton href="https://mrdiamonddirt.github.io/url-qr-stl/" fill="outline" style={{ marginTop: 8 }}>
            Learn more
          </IonButton>
        </IonContent>
      </IonPage>
    );
  }

  if (error === "not_found") {
    return (
      <IonPage>
        <IonContent className="ion-padding">
          <IonText color="danger"><p>Short link not found.</p></IonText>
        </IonContent>
      </IonPage>
    );
  }

  return (
    <IonPage>
      <IonContent className="ion-padding">
        <IonSpinner />
        <IonText><p>Redirecting...</p></IonText>
      </IonContent>
    </IonPage>
  );
};

export default RedirectPage;
