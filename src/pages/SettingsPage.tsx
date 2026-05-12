import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonIcon,
  IonPage,
  IonText,
} from "@ionic/react";
import { useEffect, useMemo, useState } from "react";
import { User } from "@supabase/supabase-js";
import { arrowBackOutline, diamondOutline, sparklesOutline } from "ionicons/icons";
import { useHistory } from "react-router";
import { createCheckoutSession, getPremiumScanAnalytics } from "../lib/supabaseClient";
import { PremiumAnalyticsResult, Profile } from "../types";
import "./SettingsPage.css";

type Props = {
  user: User | null;
  profile: Profile | null;
};

const PREMIUM_MONTHLY_SCAN_LIMIT = 10_000;

const SettingsPage: React.FC<Props> = ({ user, profile }) => {
  const history = useHistory();
  const isPremiumPlan = profile?.plan === "premium";
  const [analytics, setAnalytics] = useState<PremiumAnalyticsResult | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadAnalytics() {
      if (!user || !isPremiumPlan) {
        setAnalytics(null);
        return;
      }

      setAnalyticsLoading(true);
      const result = await getPremiumScanAnalytics(user.id, 14);
      if (!cancelled) {
        setAnalytics(result);
        setAnalyticsLoading(false);
      }
    }

    void loadAnalytics();
    return () => {
      cancelled = true;
    };
  }, [isPremiumPlan, user]);

  const peakDailyScans = useMemo(() => {
    if (!analytics || "error" in analytics) {
      return 1;
    }
    return Math.max(1, ...analytics.daily_scans.map((entry) => entry.scans));
  }, [analytics]);

  async function handleUpgrade() {
    if (!user) {
      localStorage.setItem("url-qr-stl.return-to", "/settings");
      history.push("/auth");
      return;
    }

    const origin = window.location.origin;
    const checkoutUrl = await createCheckoutSession(origin);
    window.location.href = checkoutUrl;
  }

  return (
    <IonPage>
      <IonContent className="settings-shell">
        <div className="settings-wrap">
          <IonButton fill="clear" onClick={() => history.push("/editor")} className="settings-back-btn">
            <IonIcon icon={arrowBackOutline} slot="start" />
            Back to Editor
          </IonButton>

          <IonCard className="settings-card settings-card--hero">
            <IonCardContent>
              <p className="settings-kicker">Account Settings</p>
              <h1>Billing, redirect behavior, and premium capabilities</h1>
              <p>
                Premium unlocks an instant-redirect toggle, premium templates, branding controls, and advanced analytics visibility.
              </p>
            </IonCardContent>
          </IonCard>

          <div className="settings-grid">
            <IonCard className="settings-card">
              <IonCardHeader>
                <IonCardTitle>Plan</IonCardTitle>
              </IonCardHeader>
              <IonCardContent>
                <p><strong>Current:</strong> {isPremiumPlan ? "Premium" : "Free"}</p>
                {isPremiumPlan ? (
                  <>
                    <p><strong>Redirect mode:</strong> Managed from the editor header toggle (defaults to tap-to-continue)</p>
                    <p><strong>Scans this cycle:</strong> {(profile?.monthly_scans ?? 0).toLocaleString()} / {PREMIUM_MONTHLY_SCAN_LIMIT.toLocaleString()}</p>
                    <IonText color="medium">
                      <p>Need billing portal controls? Add Stripe customer portal as the next step.</p>
                    </IonText>
                  </>
                ) : (
                  <>
                    <p><strong>Redirect mode:</strong> Tap-to-continue interstitial</p>
                    <p><strong>Limit:</strong> 20 scans per free link</p>
                    <IonButton expand="block" onClick={handleUpgrade}>Upgrade to Premium</IonButton>
                  </>
                )}
              </IonCardContent>
            </IonCard>

            <IonCard className="settings-card">
              <IonCardHeader>
                <IonCardTitle>Premium Includes</IonCardTitle>
              </IonCardHeader>
              <IonCardContent>
                <ul className="settings-feature-list">
                  <li>
                    <IonIcon icon={diamondOutline} />
                    Instant redirect links
                  </li>
                  <li>
                    <IonIcon icon={diamondOutline} />
                    Premium-only template catalog
                  </li>
                  <li>
                    <IonIcon icon={diamondOutline} />
                    Branding controls (watermark toggle)
                  </li>
                  <li>
                    <IonIcon icon={sparklesOutline} />
                    Monthly analytics visibility
                  </li>
                </ul>
              </IonCardContent>
            </IonCard>

            {isPremiumPlan && (
              <IonCard className="settings-card settings-card--analytics">
                <IonCardHeader>
                  <IonCardTitle>Premium Analytics Dashboard</IonCardTitle>
                </IonCardHeader>
                <IonCardContent>
                  {analyticsLoading && <p>Loading analytics...</p>}
                  {!analyticsLoading && analytics && "error" in analytics && (
                    <IonText color="warning">
                      <p>Analytics unavailable: {analytics.error}</p>
                    </IonText>
                  )}
                  {!analyticsLoading && analytics && !("error" in analytics) && (
                    <>
                      <p>
                        <strong>Scans in last {analytics.days} days:</strong> {analytics.total_scans_in_window.toLocaleString()}
                      </p>
                      <div className="settings-analytics-bars" aria-label="Daily scan activity">
                        {analytics.daily_scans.map((point) => {
                          const height = Math.max(8, Math.round((point.scans / peakDailyScans) * 74));
                          return (
                            <div className="settings-analytics-bars__item" key={point.day}>
                              <span className="settings-analytics-bars__value">{point.scans}</span>
                              <div className="settings-analytics-bars__bar" style={{ height: `${height}px` }} />
                              <span className="settings-analytics-bars__day">{new Date(point.day).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                            </div>
                          );
                        })}
                      </div>

                      <p className="settings-top-tags__title"><strong>Top Tags</strong></p>
                      {analytics.top_tags.length ? (
                        <ul className="settings-top-tags">
                          {analytics.top_tags.map((tag) => (
                            <li key={tag.short_code}>
                              <span>{tag.short_code}</span>
                              <strong>{tag.scan_count.toLocaleString()} scans</strong>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>No tag scan history yet.</p>
                      )}
                    </>
                  )}
                </IonCardContent>
              </IonCard>
            )}
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default SettingsPage;
