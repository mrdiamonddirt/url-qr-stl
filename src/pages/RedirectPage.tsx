import { useEffect, useState } from "react";
import { IonButton, IonContent, IonPage, IonSpinner, IonText } from "@ionic/react";
import { useParams } from "react-router";
import { findShortUrlByCode } from "../lib/storage";
import { recordScan } from "../lib/supabaseClient";
import "./RedirectPage.css";

const SCAN_LIMIT = 20;

type RouteParams = { code: string };

const RedirectPage: React.FC = () => {
  const { code } = useParams<RouteParams>();
  const [error, setError] = useState<"not_found" | "limit_reached" | null>(null);
  const [interstitialUrl, setInterstitialUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function redirect() {
      // Try Supabase record_scan first (tracks counts + enforces limit)
      const result = await recordScan(code);

      if (cancelled) return;

      if (!("error" in result)) {
        const redirectMode = result.redirect_mode ?? "instant";
        if (redirectMode === "instant") {
          window.location.replace(result.original_url);
          return;
        }

        setInterstitialUrl(result.original_url);
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
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    const editorHref = `${window.location.origin}${base}/editor`;

    return (
      <IonPage>
        <IonContent className="redirect-not-found">
          <div className="redirect-not-found__backdrop" />
          <section className="redirect-not-found__panel ion-padding">
            <p className="redirect-not-found__eyebrow">Scan Limit Reached</p>
            <h1>Tag deactivated after {SCAN_LIMIT} free scans.</h1>
            <p>
              This QR tag has used all free scans. The owner needs to upgrade to a Premium
              account to reactivate this link and unlock 10,000 monthly scans.
            </p>
            <div className="redirect-not-found__actions">
              <IonButton href={editorHref} expand="block" fill="solid">
                Upgrade to Premium
              </IonButton>
              <IonButton href="https://mrdiamonddirt.github.io/url-qr-stl/" expand="block" fill="outline">
                Learn More
              </IonButton>
            </div>
          </section>
        </IonContent>
      </IonPage>
    );
  }

  if (error === "not_found") {
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    const appHomeHref = `${window.location.origin}${base}/editor`;

    return (
      <IonPage>
        <IonContent className="redirect-not-found">
          <div className="redirect-not-found__backdrop" />
          <section className="redirect-not-found__panel ion-padding">
            <p className="redirect-not-found__eyebrow">Short Link Missing</p>
            <h1>Sign in to generate and manage short links.</h1>
            <p>
              This short link could not be found. To create working links that can be tested
              from any device, sign in and generate your QR tag from the editor.
            </p>
            <div className="redirect-not-found__actions">
              <IonButton expand="block" routerLink="/auth">
                Sign In Now
              </IonButton>
              <IonButton expand="block" fill="outline" href={appHomeHref}>
                Back to URL 2 STL
              </IonButton>
            </div>
          </section>
        </IonContent>
      </IonPage>
    );
  }

  if (interstitialUrl) {
    return (
      <IonPage>
        <IonContent className="redirect-not-found">
          <div className="redirect-not-found__backdrop" />
          <section className="redirect-not-found__panel ion-padding">
            <p className="redirect-not-found__eyebrow">Scan Confirmed</p>
            <h1>This free QR tag opens after one tap.</h1>
            <p>
              Instant redirect can be enabled on Premium from the editor toggle. Continue to open the destination link now.
            </p>
            <div className="redirect-not-found__actions">
              <IonButton
                expand="block"
                fill="solid"
                onClick={() => window.location.replace(interstitialUrl)}
              >
                Continue to Website
              </IonButton>
            </div>
          </section>
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
