import {
  IonBadge,
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
import { arrowBackOutline, copyOutline, diamondOutline, openOutline, shieldCheckmarkOutline, sparklesOutline, trashOutline } from "ionicons/icons";
import { useHistory } from "react-router";
import {
  createBillingPortalSession,
  createCheckoutSession,
  deleteUserLogo,
  getLogoLimit,
  getPremiumScanAnalytics,
  getUserShortUrls,
  isOwnerAdminEmail,
  listUserLogos,
  setDefaultUserLogo,
  uploadUserLogo,
} from "../lib/supabaseClient";
import { formatPlanPrice, getAllowedCheckoutTargets, getPlanLabel, getPlanLimits, getUpgradeCreditLabel, isPaidPlan, isSubscriptionPlan } from "../lib/plans";
import { shortUrlForCode } from "../lib/shortener";
import { CheckoutTargetPlan, PremiumAnalyticsResult, Profile, SupabaseShortUrlRow, UserLogo } from "../types";
import "./SettingsPage.css";

type Props = {
  user: User | null;
  profile: Profile | null;
};

const LOGO_MAX_BYTES = 1_048_576;
const LOGO_MIN_DIM = 64;
const LOGO_MAX_DIM = 1024;
const LOGO_ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

async function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to read image dimensions. Use a valid PNG, JPG, or WebP file."));
      img.src = objectUrl;
    });
    return { width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

const SettingsPage: React.FC<Props> = ({ user, profile }) => {
  const history = useHistory();
  const currentPlan = profile?.plan ?? "free";
  const isOwnerAdmin = isOwnerAdminEmail(user?.email);
  const isPaidUser = isPaidPlan(currentPlan);
  const isSubscriptionUser = isSubscriptionPlan(currentPlan);
  const planLimits = getPlanLimits(currentPlan);
  const logoLimit = getLogoLimit(currentPlan);
  const allowedUpgradeTargets = getAllowedCheckoutTargets(currentPlan);
  const [selectedTargetPlan, setSelectedTargetPlan] = useState<CheckoutTargetPlan>(
    allowedUpgradeTargets[0] ?? "premium_monthly"
  );
  const [analytics, setAnalytics] = useState<PremiumAnalyticsResult | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [shortUrls, setShortUrls] = useState<SupabaseShortUrlRow[]>([]);
  const [logos, setLogos] = useState<UserLogo[]>([]);
  const [logosLoading, setLogosLoading] = useState(false);
  const [logoUploadBusy, setLogoUploadBusy] = useState(false);
  const [billingBusy, setBillingBusy] = useState(false);
  const [logoDeleteBusyId, setLogoDeleteBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!allowedUpgradeTargets.includes(selectedTargetPlan)) {
      setSelectedTargetPlan(allowedUpgradeTargets[0] ?? "premium_monthly");
    }
  }, [allowedUpgradeTargets, selectedTargetPlan]);

  useEffect(() => {
    let cancelled = false;

    async function loadAnalytics() {
      if (!user || !isPaidUser) {
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
  }, [isPaidUser, user]);

  useEffect(() => {
    if (!user) {
      setShortUrls([]);
      return;
    }

    getUserShortUrls(user.id)
      .then(setShortUrls)
      .catch(() => setShortUrls([]));
  }, [user]);

  useEffect(() => {
    if (!user || !isPaidUser) {
      setLogos([]);
      return;
    }

    setLogosLoading(true);
    listUserLogos(user.id)
      .then(setLogos)
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load your logos. Check your connection and try again.");
      })
      .finally(() => setLogosLoading(false));
  }, [isPaidUser, user]);

  const peakDailyScans = useMemo(() => {
    if (!analytics || "error" in analytics) {
      return 1;
    }
    return Math.max(1, ...analytics.daily_scans.map((entry) => entry.scans));
  }, [analytics]);

  const logoSlotsRemaining = Math.max(0, logoLimit - logos.length);

  const joinedDate = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : "-";
  const renewalDate = profile?.subscription_ends_at
    ? new Date(profile.subscription_ends_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : currentPlan === "lifetime"
      ? "No renewal (lifetime access)"
      : "-";

  async function handleUpgrade(targetPlan: CheckoutTargetPlan) {
    if (!user) {
      localStorage.setItem("url-qr-stl.return-to", "/settings");
      history.push("/auth");
      return;
    }

    setBillingBusy(true);
    setError("");
    try {
      const origin = window.location.origin;
      const checkoutUrl = await createCheckoutSession(origin, targetPlan);
      window.location.href = checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start checkout. Refresh the page and try again.");
    } finally {
      setBillingBusy(false);
    }
  }

  async function handleManageSubscription() {
    if (!user) return;

    setBillingBusy(true);
    setError("");
    try {
      const origin = window.location.origin;
      const portalUrl = await createBillingPortalSession(origin);
      window.location.href = portalUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open billing portal. Try again or contact support.");
    } finally {
      setBillingBusy(false);
    }
  }

  async function handleUploadLogo(file: File) {
    if (!user || !isPaidUser) {
      setError("Frame logo uploads are premium-only.");
      return;
    }

    if (!LOGO_ALLOWED_TYPES.has(file.type)) {
      setError("Unsupported logo file type. Use PNG, JPG, or WebP.");
      return;
    }

    if (file.size > LOGO_MAX_BYTES) {
      setError("Logo exceeds 1 MB. Please upload a smaller file.");
      return;
    }

    if (logos.length >= logoLimit) {
      setError(`You can store up to ${logoLimit} logos. Remove one to add another.`);
      return;
    }

    setLogoUploadBusy(true);
    setError("");
    try {
      const dimensions = await readImageDimensions(file);
      if (
        dimensions.width < LOGO_MIN_DIM ||
        dimensions.height < LOGO_MIN_DIM ||
        dimensions.width > LOGO_MAX_DIM ||
        dimensions.height > LOGO_MAX_DIM
      ) {
        setError("Logo dimensions must be between 64px and 1024px.");
        return;
      }

      const created = await uploadUserLogo(user.id, file, dimensions, logos.length === 0);
      setLogos((prev) => [created, ...prev]);
      setStatus("Logo uploaded.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to upload your logo. Check the file and try again.";
      if (message.includes("logo_limit_exceeded")) {
        setError(`You can store up to ${logoLimit} logos. Remove one to add another.`);
      } else {
        setError(message);
      }
    } finally {
      setLogoUploadBusy(false);
    }
  }

  async function handleSetDefaultLogo(logoId: string) {
    if (!user) return;

    try {
      await setDefaultUserLogo(user.id, logoId);
      setLogos((prev) => prev.map((logo) => ({ ...logo, is_default: logo.id === logoId })));
      setStatus("Default logo updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set default logo. Please try again.");
    }
  }

  async function handleDeleteLogo(logoId: string) {
    if (!user) return;

    setLogoDeleteBusyId(logoId);
    try {
      await deleteUserLogo(user.id, logoId);
      setLogos((prev) => prev.filter((logo) => logo.id !== logoId));
      setStatus("Logo removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove logo. Please try again.");
    } finally {
      setLogoDeleteBusyId(null);
    }
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
              <p className="settings-kicker">Dashboard</p>
              <h1>Billing, logos, redirect behavior, and premium analytics</h1>
              <p>
                Manage your premium toolkit in one place: frame logos, account defaults, short tags, and analytics trends.
              </p>
              {(status || error) && (
                <IonText color={error ? "danger" : "success"}>
                  <p>{error || status}</p>
                </IonText>
              )}
            </IonCardContent>
          </IonCard>

          {isOwnerAdmin && (
            <IonCard className="settings-card settings-card--admin">
              <IonCardHeader>
                <IonCardTitle>Owner Admin</IonCardTitle>
              </IonCardHeader>
              <IonCardContent>
                <p>Open the owner controls to review all accounts, subscription states, and moderation actions.</p>
                <IonButton onClick={() => history.push("/admin")}> 
                  <IonIcon slot="start" icon={shieldCheckmarkOutline} />
                  Open Admin Panel
                </IonButton>
              </IonCardContent>
            </IonCard>
          )}

          <div className="settings-grid">
            <IonCard className="settings-card">
              <IonCardHeader>
                <IonCardTitle>Plan</IonCardTitle>
              </IonCardHeader>
              <IonCardContent>
                <p><strong>Current:</strong> {getPlanLabel(currentPlan)}</p>
                <p><strong>Member since:</strong> {joinedDate}</p>
                <p><strong>Renewal:</strong> {renewalDate}</p>
                {profile?.cancel_at_period_end && (
                  <p><strong>Cancellation:</strong> Scheduled at period end</p>
                )}
                {isPaidUser ? (
                  <>
                    <p><strong>Redirect mode:</strong> Managed from the editor header toggle</p>
                    <p><strong>Tier:</strong> {getPlanLabel(currentPlan)}</p>
                    <p><strong>Scans this cycle:</strong> {(profile?.monthly_scans ?? 0).toLocaleString()} / {planLimits.monthlyScanLimit.toLocaleString()}</p>
                    <p><strong>Saved logos:</strong> {logos.length} / {logoLimit}</p>
                    <p><strong>Active tags:</strong> {shortUrls.length} / {planLimits.maxActiveTags}</p>
                    {planLimits.prioritySupport && <p><strong>Priority support:</strong> Enabled</p>}
                    {isSubscriptionUser && (
                      <IonButton expand="block" fill="outline" disabled={billingBusy} onClick={() => void handleManageSubscription()}>
                        {billingBusy ? "Opening billing..." : "Manage / Cancel Subscription"}
                      </IonButton>
                    )}
                  </>
                ) : (
                  <>
                    <p><strong>Redirect mode:</strong> Tap-to-continue interstitial</p>
                    <p><strong>Limit:</strong> 20 scans per free link</p>
                  </>
                )}
                {!!allowedUpgradeTargets.length && (
                  <>
                    <p><strong>Upgrade options:</strong></p>
                    <div className="settings-tag-actions">
                      {allowedUpgradeTargets.map((target) => (
                        <IonButton
                          key={target}
                          size="small"
                          fill={selectedTargetPlan === target ? "solid" : "outline"}
                          onClick={() => setSelectedTargetPlan(target)}
                        >
                          {target === "premium_monthly" ? "Monthly" : target === "premium_yearly" ? "Yearly" : "Lifetime"}
                        </IonButton>
                      ))}
                    </div>
                    <p><strong>Selected:</strong> {formatPlanPrice(selectedTargetPlan)}</p>
                    {!!getUpgradeCreditLabel(currentPlan, selectedTargetPlan) && (
                      <p><strong>Credit:</strong> {getUpgradeCreditLabel(currentPlan, selectedTargetPlan)}</p>
                    )}
                    <IonButton expand="block" disabled={billingBusy} onClick={() => void handleUpgrade(selectedTargetPlan)}>
                      {billingBusy ? "Starting checkout..." : "Continue to Checkout"}
                    </IonButton>
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
                    Frame QR logo library (up to {logoLimit} uploads)
                  </li>
                </ul>
              </IonCardContent>
            </IonCard>

            <IonCard className="settings-card settings-card--logos">
              <IonCardHeader>
                <IonCardTitle>Logo Manager</IonCardTitle>
              </IonCardHeader>
              <IonCardContent>
                {!isPaidUser && (
                  <>
                    <p>Frame logo uploads are premium-only.</p>
                    <IonButton onClick={() => void handleUpgrade("premium_monthly")}>Upgrade to unlock logos</IonButton>
                  </>
                )}
                {isPaidUser && (
                  <>
                    <div className="settings-logo-toolbar">
                      <IonBadge color="primary">{logos.length}/{logoLimit} used</IonBadge>
                      <label className="settings-upload-label">
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          hidden
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              void handleUploadLogo(file);
                            }
                            e.currentTarget.value = "";
                          }}
                        />
                        <IonButton size="small" disabled={logoUploadBusy || logos.length >= logoLimit}>
                          {logoUploadBusy ? "Uploading..." : "Upload logo"}
                        </IonButton>
                      </label>
                    </div>
                    <p className="settings-logo-hint">PNG/JPG/WebP only, max 1 MB, dimensions 64px to 1024px. {logoSlotsRemaining} slots remaining.</p>
                    <div className="settings-logo-grid">
                      {logosLoading && <p>Loading logos...</p>}
                      {!logosLoading && !logos.length && <p>No logos yet.</p>}
                      {logos.map((logo) => (
                        <div key={logo.id} className="settings-logo-card">
                          <img src={logo.public_url} alt="Saved logo" />
                          <div className="settings-logo-card__meta">
                            <small>{logo.width_px}x{logo.height_px}px</small>
                            {logo.is_default && <IonBadge color="success">Default</IonBadge>}
                          </div>
                          <div className="settings-logo-card__actions">
                            <IonButton fill="clear" size="small" disabled={logo.is_default} onClick={() => void handleSetDefaultLogo(logo.id)}>
                              Set default
                            </IonButton>
                            <IonButton fill="clear" color="danger" size="small" disabled={logoDeleteBusyId === logo.id} onClick={() => void handleDeleteLogo(logo.id)}>
                              <IonIcon icon={trashOutline} slot="start" />
                              Remove
                            </IonButton>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </IonCardContent>
            </IonCard>

            <IonCard className="settings-card settings-card--tags">
              <IonCardHeader>
                <IonCardTitle>Recent Tags</IonCardTitle>
              </IonCardHeader>
              <IonCardContent>
                {!shortUrls.length && <p>No tags yet.</p>}
                {!!shortUrls.length && (
                  <div className="settings-tag-list">
                    {shortUrls.slice(0, 12).map((row) => {
                      const shortUrl = shortUrlForCode(row.short_code);
                      return (
                        <div key={row.id} className="settings-tag-row">
                          <div>
                            <strong>{row.short_code}</strong>
                            <p>{row.original_url}</p>
                          </div>
                          <div className="settings-tag-actions">
                            <IonButton size="small" fill="clear" onClick={() => history.push("/editor")}>Open editor</IonButton>
                            <IonButton
                              size="small"
                              fill="clear"
                              onClick={() => {
                                void navigator.clipboard.writeText(shortUrl);
                                setStatus("Short URL copied.");
                              }}
                            >
                              <IonIcon icon={copyOutline} slot="start" />
                              Copy
                            </IonButton>
                            <IonButton size="small" fill="clear" onClick={() => window.open(shortUrl, "_blank", "noopener,noreferrer")}>
                              <IonIcon icon={openOutline} slot="start" />
                              Open
                            </IonButton>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </IonCardContent>
            </IonCard>

            {isPaidUser && (
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
