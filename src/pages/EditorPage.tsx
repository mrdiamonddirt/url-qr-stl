import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  IonBadge,
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonPage,
  IonText,
  IonToolbar,
  IonToggle,
  IonSelect,
  IonSelectOption,
  IonRange,
} from "@ionic/react";
import { useHistory } from "react-router";
import { customAlphabet } from "nanoid";
import { User } from "@supabase/supabase-js";
import {
  arrowForwardOutline,
  chevronDownOutline,
  diamondOutline,
  logOutOutline,
  openOutline,
  personCircleOutline,
  prismOutline,
  sparklesOutline,
} from "ionicons/icons";
import { TEMPLATE_PRESETS } from "../constants/templates";
import ModelPreviewCanvas from "../components/ModelPreviewCanvas";
import { composeTemplatePreview, composeTemplateSelectorPreview } from "../lib/templatePreview";
import { createTemplateObjBlob, createTemplateStlBlob, downloadStl } from "../lib/stl";
import { ensureHttpUrl, shortUrlForCode } from "../lib/shortener";
import { toQrDataUrl } from "../lib/qr";
import { listShortUrlsByUser, saveShortUrl, saveStlExport } from "../lib/storage";
import { createCheckoutSession, getUserShortUrls, signOut, supabase } from "../lib/supabaseClient";
import { ModelFormat, Profile, ShortUrlRecord, StlParams, SupabaseShortUrlRow } from "../types";
import AppFooter from "../components/AppFooter";
import "./EditorPage.css";

const makeId = customAlphabet("123456789abcdefghijkmnopqrstuvwxyz", 12);
const makeCode = customAlphabet("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz", 7);

const DEFAULT_STL: StlParams = {
  widthMm: 40,
  heightMm: 40,
  depthMm: 2.8,
  baseMm: 1.2,
  detail: "medium",
  invert: false,
};

type Props = {
  user: User | null;
  profile: Profile | null;
};

type RailStage = "import" | "compose" | "render" | "export";

const FREE_SCAN_LIMIT = 20;

function buildTemplateDefaults(template: (typeof TEMPLATE_PRESETS)[number]): Record<string, string> {
  const defaults = template.fields.reduce<Record<string, string>>((acc, item) => {
    acc[item.key] = item.defaultValue;
    return acc;
  }, {});

  if (template.ctaConfig) {
    defaults[template.ctaConfig.fieldKey] = defaults[template.ctaConfig.fieldKey] ?? template.ctaLabel ?? "";
    defaults[template.ctaConfig.sizeKey] = String(template.ctaConfig.defaultSizePx);
  }

  return defaults;
}

const RAIL_STAGES: Array<{ key: RailStage; label: string; hint: string }> = [
  { key: "import", label: "Import URL", hint: "Generate short URL + QR" },
  { key: "compose", label: "Template Edit", hint: "Compose tag preview" },
  { key: "render", label: "Render", hint: "Generate 3D preview" },
  { key: "export", label: "Export", hint: "Download STL or OBJ" },
];

const EditorPage: React.FC<Props> = ({ user, profile }) => {
  const history = useHistory();
  const headerRef = useRef<HTMLElement | null>(null);
  const templateValuesOverrideRef = useRef<Record<string, string> | null>(null);
  const [accountPanelOpen, setAccountPanelOpen] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState(TEMPLATE_PRESETS[0].id);
  const [templateValues, setTemplateValues] = useState<Record<string, string>>({});
  const [generated, setGenerated] = useState<ShortUrlRecord | null>(null);
  const [recentByUser, setRecentByUser] = useState<ShortUrlRecord[]>([]);
  const [templateSelectorPreviews, setTemplateSelectorPreviews] = useState<Record<string, string>>({});
  const [supabaseHistory, setSupabaseHistory] = useState<SupabaseShortUrlRow[]>([]);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [composedPreviewUrl, setComposedPreviewUrl] = useState("");
  const [modelPreviewReady, setModelPreviewReady] = useState(false);
  const [modelFormat, setModelFormat] = useState<ModelFormat>("stl");
  const [stlParams, setStlParams] = useState<StlParams>(DEFAULT_STL);
  const [activeRailStage, setActiveRailStage] = useState<RailStage>("import");
  const [isUrlEditorOpen, setIsUrlEditorOpen] = useState(true);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const selectedTemplate = useMemo(
    () => TEMPLATE_PRESETS.find((preset) => preset.id === selectedTemplateId) ?? TEMPLATE_PRESETS[0],
    [selectedTemplateId]
  );

  const accountEmail = user?.email ?? "Guest";
  const planLabel = profile?.plan === "premium" ? "Premium" : "Free";
  const accountTriggerLabel = user ? (user.email ?? "Account") : "Account";
  const accountInitials = useMemo(() => {
    const source = user?.email?.trim() || "URL 2 SQL";
    const segments = source.split(/[@.\s_-]+/).filter(Boolean);
    return segments.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "U2";
  }, [user?.email]);

  const railStageProgress = useMemo(() => {
    if (modelPreviewReady) {
      return 100;
    }
    if (composedPreviewUrl) {
      return 67;
    }
    if (qrDataUrl) {
      return 34;
    }
    return 10;
  }, [composedPreviewUrl, modelPreviewReady, qrDataUrl]);

  useEffect(() => {
    const defaults = buildTemplateDefaults(selectedTemplate);
    if (templateValuesOverrideRef.current) {
      const override = templateValuesOverrideRef.current;
      templateValuesOverrideRef.current = null;
      setTemplateValues({ ...defaults, ...override });
    } else {
      setTemplateValues(defaults);
    }
    setComposedPreviewUrl("");
    setModelPreviewReady(false);
  }, [selectedTemplate]);

  useEffect(() => {
    const nextPreviews = TEMPLATE_PRESETS.reduce<Record<string, string>>((acc, preset) => {
      const nextValues = preset.id === selectedTemplate.id ? templateValues : buildTemplateDefaults(preset);
      acc[preset.id] = composeTemplateSelectorPreview(preset, nextValues);
      return acc;
    }, {});
    setTemplateSelectorPreviews(nextPreviews);
  }, [selectedTemplate, templateValues]);

  // Auto-compose preview when template or text settings change (if QR is already generated)
  useEffect(() => {
    if (!qrDataUrl || !generated) return;
    setActiveRailStage("compose");
    setModelPreviewReady(false);
    const timeoutId = window.setTimeout(() => {
      (async () => {
        try {
          const image = await composeTemplatePreview({
            template: selectedTemplate,
            values: templateValues,
            qrDataUrl,
            shortUrl: generated.shortUrl,
          });
          setComposedPreviewUrl(image);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not compose template preview.");
        }
      })();
    }, 60);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [generated, qrDataUrl, selectedTemplate, templateValues]);

  useEffect(() => {
    setRecentByUser(listShortUrlsByUser(user?.id));
    if (user) {
      getUserShortUrls(user.id).then(setSupabaseHistory);
    } else {
      setSupabaseHistory([]);
    }
  }, [user]);

  useEffect(() => {
    const headerEl = headerRef.current;
    if (!headerEl) {
      return;
    }

    const applyHeaderHeight = () => {
      const measured = Math.round(headerEl.getBoundingClientRect().height);
      const safeHeight = Number.isFinite(measured) && measured > 0 ? measured : 88;
      document.documentElement.style.setProperty("--editor-header-height", `${safeHeight}px`);
    };

    applyHeaderHeight();

    const observer = new ResizeObserver(() => {
      applyHeaderHeight();
    });
    observer.observe(headerEl);

    window.addEventListener("resize", applyHeaderHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", applyHeaderHeight);
    };
  }, []);

  async function handleGenerateQr() {
    setError("");
    setStatus("");

    try {
      const normalized = ensureHttpUrl(sourceUrl);
      const code = makeCode();
      const shortUrl = shortUrlForCode(code);

      const record: ShortUrlRecord = {
        id: makeId(),
        code,
        originalUrl: normalized,
        shortUrl,
        templateId: selectedTemplate.id,
        templateValues,
        userId: user?.id,
        createdAt: new Date().toISOString(),
      };

      saveShortUrl(record);
      setGenerated(record);
      setRecentByUser(listShortUrlsByUser(user?.id));
      setQrDataUrl(await toQrDataUrl(shortUrl));
      setComposedPreviewUrl("");
      setModelPreviewReady(false);
      setIsUrlEditorOpen(false);
      setActiveRailStage("compose");

      if (supabase && user) {
        await supabase.from("short_urls").insert({
          user_id: user.id,
          short_code: code,
          original_url: normalized,
          template_id: selectedTemplate.id,
          template_payload: templateValues,
        });
        // Refresh Supabase history to include the new entry
        getUserShortUrls(user.id).then(setSupabaseHistory);
      }

      setStatus("Step 1 complete. Preview your QR code, then compose the template preview.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate QR.");
    }
  }

  async function restoreFromRecord(record: ShortUrlRecord) {
    setError("");
    setStatus("");

    const template = TEMPLATE_PRESETS.find((preset) => preset.id === record.templateId) ?? TEMPLATE_PRESETS[0];
    const defaults = buildTemplateDefaults(template);

    templateValuesOverrideRef.current = { ...defaults, ...(record.templateValues ?? {}) };

    setSourceUrl(record.originalUrl);
    setGenerated(record);
    setSelectedTemplateId(template.id);
    setComposedPreviewUrl("");
    setModelPreviewReady(false);
    setIsUrlEditorOpen(false);
    setActiveRailStage("compose");

    try {
      setQrDataUrl(await toQrDataUrl(record.shortUrl));
      setStatus(`Loaded tag ${record.code}. You can adjust template settings or export.`);
    } catch (err) {
      setQrDataUrl("");
      setError(err instanceof Error ? err.message : "Could not restore QR preview.");
    }
  }

  async function handleSelectSupabaseTag(row: SupabaseShortUrlRow) {
    const localRecord = recentByUser.find((record) => record.code === row.short_code);
    if (localRecord) {
      await restoreFromRecord(localRecord);
      return;
    }

    const fallbackTemplate = selectedTemplate;
    const fallbackRecord: ShortUrlRecord = {
      id: `supabase-${row.short_code}`,
      code: row.short_code,
      originalUrl: row.original_url,
      shortUrl: shortUrlForCode(row.short_code),
      templateId: fallbackTemplate.id,
      templateValues: buildTemplateDefaults(fallbackTemplate),
      userId: user?.id,
      createdAt: row.created_at,
    };

    await restoreFromRecord(fallbackRecord);
    setStatus(`Loaded tag ${row.short_code}. Template details were not available, so current template settings were used.`);
  }

  function handleGenerateModelPreview() {
    setError("");
    setStatus("");

    if (!generated || !composedPreviewUrl) {
      setError("Complete the template + QR preview first.");
      return;
    }

    setModelPreviewReady(true);
    setActiveRailStage("export");
    setStatus("Step 3 ready. Rotate preview loaded.");
  }

  async function handleDownloadModel() {
    setError("");
    setStatus("");

    if (!generated) {
      setError("Generate a QR code first.");
      return;
    }

    if (!composedPreviewUrl) {
      setError("Compose the template + QR preview first.");
      return;
    }

    if (!modelPreviewReady) {
      setError("Generate the 3D model preview first.");
      return;
    }

    if (!user) {
      localStorage.setItem("url-qr-stl.return-to", "/editor");
      history.push("/auth");
      return;
    }

    try {
      const blob =
        modelFormat === "stl"
          ? await createTemplateStlBlob(composedPreviewUrl, stlParams)
          : await createTemplateObjBlob(composedPreviewUrl, stlParams);
      const extension = modelFormat === "stl" ? "stl" : "obj";
      downloadStl(blob, `qr-tag-${generated.code}.${extension}`);

      saveStlExport({
        id: makeId(),
        shortCode: generated.code,
        userId: user.id,
        params: { ...stlParams, format: modelFormat },
        exportedAt: new Date().toISOString(),
      });

      if (supabase) {
        await supabase.from("stl_exports").insert({
          user_id: user.id,
          short_code: generated.code,
          params: { ...stlParams, format: modelFormat },
          exported_at: new Date().toISOString(),
        });
      }

      setStatus(`${modelFormat.toUpperCase()} downloaded.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Model export failed.");
    }
  }

  async function handleSignOut() {
    setAccountPanelOpen(false);
    await signOut();
    history.push("/editor");
  }

  async function handleUpgrade() {
    try {
      setAccountPanelOpen(false);
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      const origin = `${window.location.origin}${base}`;
      const url = await createCheckoutSession(origin);
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout.");
    }
  }

  function toggleAccountPanel() {
    setAccountPanelOpen((current) => !current);
  }

  return (
    <IonPage>
      <IonHeader className="editor-header" ref={(node) => { headerRef.current = node as unknown as HTMLElement | null; }}>
        <IonToolbar className="editor-toolbar">
          <div className="editor-toolbar__inner">
            <div className="editor-toolbar__brand">
              <div className="editor-toolbar__mark">U2S</div>
              <div className="editor-toolbar__brand-copy">
                <div className="editor-toolbar__title">URL 2 SQL</div>
                <p className="editor-toolbar__subtitle">Premium QR tags and printable 3D exports for physical links.</p>
              </div>
            </div>
            <div className="editor-toolbar__actions">
              <div className="editor-toolbar__chip-list">
                <span className="toolbar-chip">QR Tag Studio</span>
              </div>
              {user && profile?.plan === "premium" && (
                <IonBadge color="warning" className="toolbar-badge">Premium</IonBadge>
              )}
              <button
                type="button"
                className={`account-trigger ${accountPanelOpen ? "is-open" : ""}`}
                onClick={toggleAccountPanel}
                aria-label="Open account panel"
                aria-expanded={accountPanelOpen}
              >
                <span className="account-trigger__avatar">{accountInitials}</span>
                <span className="account-trigger__copy">
                  <strong>{accountTriggerLabel}</strong>
                  <span>{planLabel} plan</span>
                </span>
                <IonIcon icon={chevronDownOutline} />
              </button>
            </div>
          </div>
        </IonToolbar>
      </IonHeader>
      <IonContent className="editor-shell">
        <div className={`account-drawer-backdrop ${accountPanelOpen ? "is-open" : ""}`} onClick={() => setAccountPanelOpen(false)} />
        <aside className={`account-drawer ${accountPanelOpen ? "is-open" : ""}`} aria-hidden={!accountPanelOpen}>
          <div className="account-drawer__header">
            <div className="account-drawer__avatar">{accountInitials}</div>
            <div>
              <p className="account-drawer__eyebrow">Account</p>
              <h2>{accountEmail}</h2>
              <p className="account-drawer__plan">{planLabel} plan</p>
            </div>
          </div>
          <div className="account-drawer__scroll-shell">
            <div className="account-drawer__body">
              <div className="account-drawer__section">
                <div className="account-stat-card">
                  <span>Subscription</span>
                  <strong>{profile?.plan === "premium" ? "Unlimited scans and exports" : `${FREE_SCAN_LIMIT} scans per free link`}</strong>
                </div>
                <div className="account-stat-card">
                  <span>Status</span>
                  <strong>{user ? "Signed in and ready to export" : "Sign in to download and sync"}</strong>
                </div>
              </div>

              <div className="account-drawer__section account-drawer__links">
                <button type="button" className="account-link" onClick={() => setAccountPanelOpen(false)}>
                  <IonIcon icon={personCircleOutline} />
                  <span>Workspace overview</span>
                </button>
                <button type="button" className="account-link" onClick={() => history.push("/terms")}>
                  <IonIcon icon={openOutline} />
                  <span>Terms and policies</span>
                </button>
              </div>

              <div className="account-drawer__section">
                {user ? (
                  <>
                    {profile?.plan !== "premium" && (
                      <IonButton expand="block" onClick={handleUpgrade}>
                        Upgrade to Premium
                      </IonButton>
                    )}
                    <IonButton expand="block" fill="outline" onClick={handleSignOut}>
                      <IonIcon slot="start" icon={logOutOutline} />
                      Sign out
                    </IonButton>
                  </>
                ) : (
                  <IonButton expand="block" onClick={() => history.push("/auth")}>
                    Sign in to your account
                  </IonButton>
                )}
                <IonButton expand="block" fill="clear" onClick={() => setAccountPanelOpen(false)}>
                  Close panel
                </IonButton>
              </div>
            </div>
          </div>
        </aside>

        <div className="editor-layout">
          <section className="editor-hero">
            <div className="editor-hero__content">
              <p className="hero-kicker">URL 2 SQL Studio</p>
              <div className="hero-heading-group">
                <h1>Create polished QR tags for print, product packaging, and 3D output.</h1>
                <p className="hero-subtitle">One workspace for short links, branded QR layouts, and export-ready geometry.</p>
              </div>
              <p className="hero-copy">
                Turn a destination URL into a finished QR asset, review the composed tag before export, and generate a clean STL or OBJ without breaking the workflow.
              </p>
              <div className="hero-metrics">
                <div className="hero-metric">
                  <IonIcon icon={sparklesOutline} />
                  <div>
                    <strong>Premium presentation</strong>
                    <span>Clear hierarchy for operators, clients, and internal teams.</span>
                  </div>
                </div>
                <div className="hero-metric">
                  <IonIcon icon={prismOutline} />
                  <div>
                    <strong>3-step production flow</strong>
                    <span>Generate, preview, and export without leaving the page.</span>
                  </div>
                </div>
                <div className="hero-metric">
                  <IonIcon icon={diamondOutline} />
                  <div>
                    <strong>Production-ready exports</strong>
                    <span>Dial in geometry settings before you commit to print or fabrication.</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="editor-hero__rail">
              <div className="hero-spotlight-card">
                <p className="hero-spotlight-card__label">Current workspace</p>
                <strong>{generated?.code ? `Tag ${generated.code}` : "New tag draft"}</strong>
                <span>{generated?.shortUrl ?? "No short link generated yet"}</span>
                <div className="hero-spotlight-card__footer">
                  <span>{selectedTemplate.name}</span>
                  <span>{modelFormat.toUpperCase()} export</span>
                </div>
              </div>

              <div className="sponsor-slot sponsor-slot--hero">
                <p className="sponsor-slot__label">Studio spotlight</p>
                <strong>Featured space</strong>
                <span>Use this rail for launches, seasonal collections, partner highlights, or product updates.</span>
              </div>
            </div>
          </section>

          <div className="workspace-shell">
            <main className="workspace-main">
              <IonCard className="editor-card editor-card--intro">
                <IonCardContent>
                  <div className="workflow-banner">
                    <div>
                      <p className="workflow-banner__eyebrow">Production workflow</p>
                      <h2>Build the tag in sequence, then export with confidence.</h2>
                    </div>
                    <div className="workflow-steps" aria-label="Workflow steps">
                      <span>1. Input URL</span>
                      <span>2. Compose preview</span>
                      <span>3. Export 3D</span>
                    </div>
                  </div>
                </IonCardContent>
              </IonCard>

              <IonCard className="editor-card">
                <IonCardHeader>
                  <IonCardTitle>STL Parameters</IonCardTitle>
                </IonCardHeader>
                <IonCardContent>
                  <div className="section-heading-row">
                    <div>
                      <p className="section-kicker">Output settings</p>
                      <h3>Tune the geometry for printability and detail.</h3>
                    </div>
                    <span className="section-state">{stlParams.detail}</span>
                  </div>
                  <div className="stl-grid">
                    <IonItem className="editor-item">
                      <IonLabel position="stacked">Width (mm)</IonLabel>
                      <IonInput
                        type="number"
                        value={stlParams.widthMm}
                        onIonInput={(e) =>
                          setStlParams((prev) => ({ ...prev, widthMm: Number(e.detail.value) || prev.widthMm }))
                        }
                      />
                    </IonItem>
                    <IonItem className="editor-item">
                      <IonLabel position="stacked">Height (mm)</IonLabel>
                      <IonInput
                        type="number"
                        value={stlParams.heightMm}
                        onIonInput={(e) =>
                          setStlParams((prev) => ({ ...prev, heightMm: Number(e.detail.value) || prev.heightMm }))
                        }
                      />
                    </IonItem>
                    <IonItem className="editor-item">
                      <IonLabel position="stacked">Depth (mm)</IonLabel>
                      <IonInput
                        type="number"
                        value={stlParams.depthMm}
                        onIonInput={(e) =>
                          setStlParams((prev) => ({ ...prev, depthMm: Number(e.detail.value) || prev.depthMm }))
                        }
                      />
                    </IonItem>
                    <IonItem className="editor-item">
                      <IonLabel position="stacked">Base (mm)</IonLabel>
                      <IonInput
                        type="number"
                        value={stlParams.baseMm}
                        onIonInput={(e) =>
                          setStlParams((prev) => ({ ...prev, baseMm: Number(e.detail.value) || prev.baseMm }))
                        }
                      />
                    </IonItem>
                    <IonItem className="editor-item">
                      <IonLabel>Detail</IonLabel>
                      <IonSelect
                        value={stlParams.detail}
                        onIonChange={(e) => setStlParams((prev) => ({ ...prev, detail: e.detail.value }))}
                      >
                        <IonSelectOption value="low">Low</IonSelectOption>
                        <IonSelectOption value="medium">Medium</IonSelectOption>
                        <IonSelectOption value="high">High</IonSelectOption>
                      </IonSelect>
                    </IonItem>
                    <IonItem className="editor-item" lines="none">
                      <IonLabel>Invert output</IonLabel>
                      <IonToggle
                        checked={stlParams.invert}
                        onIonChange={(e) => setStlParams((prev) => ({ ...prev, invert: e.detail.checked }))}
                      />
                    </IonItem>
                  </div>

                </IonCardContent>
              </IonCard>

              <div className="sponsor-slot sponsor-slot--rail">
                <p className="sponsor-slot__label">Featured panel</p>
                <strong>Flexible content block</strong>
                <span>Keep this area free for announcements, seasonal promotions, or partner-led storytelling.</span>
              </div>

              <IonCard className="editor-card editor-card--rail">
                <IonCardHeader>
                  <IonCardTitle>Your recent QR tags</IonCardTitle>
                </IonCardHeader>
                <IonCardContent>
                  {user && profile?.plan === "free" && (
                    <IonCard color="warning" style={{ marginBottom: 12 }}>
                      <IonCardContent>
                        <strong>Free plan:</strong> each link allows {FREE_SCAN_LIMIT} scans.
                        {" "}
                        <IonButton size="small" onClick={handleUpgrade}>
                          Upgrade to Premium – £3.99/mo
                        </IonButton>
                      </IonCardContent>
                    </IonCard>
                  )}
                  {supabaseHistory.length > 0 ? (
                    <ul className="history-list">
                      {supabaseHistory.map((row) => (
                        <li key={row.short_code}>
                          <button
                            type="button"
                            className="history-select-btn"
                            onClick={() => {
                              void handleSelectSupabaseTag(row);
                            }}
                            aria-label={`Load previous tag ${row.short_code}`}
                          >
                            <strong>{row.short_code}</strong>
                            <span>{row.original_url}</span>
                            <IonBadge
                              color={row.scan_count >= FREE_SCAN_LIMIT && profile?.plan !== "premium" ? "danger" : "medium"}
                            >
                              {row.scan_count}/{profile?.plan === "premium" ? "∞" : FREE_SCAN_LIMIT} scans
                            </IonBadge>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <ul className="history-list">
                      {recentByUser.slice(0, 5).map((record) => (
                        <li key={record.id}>
                          <button
                            type="button"
                            className="history-select-btn"
                            onClick={() => {
                              void restoreFromRecord(record);
                            }}
                            aria-label={`Load previous tag ${record.code}`}
                          >
                            <strong>{record.code}</strong>
                            <span>{record.originalUrl}</span>
                          </button>
                        </li>
                      ))}
                      {!recentByUser.length && <li>No tags generated yet.</li>}
                    </ul>
                  )}
                </IonCardContent>
              </IonCard>

              <div className="inline-promo-strip">
                <div>
                  <p className="inline-promo-strip__label">Studio update</p>
                  <strong>Space for announcements and featured campaigns</strong>
                  <span>Keep this module available for launches, premium messaging, or curated partner content.</span>
                </div>
                <IonButton fill="outline" onClick={user ? handleUpgrade : () => history.push("/auth")}>
                  {user ? "See premium options" : "Sign in for sync"}
                </IonButton>
              </div>

              {status && <IonText color="success"><p className="status-line">{status}</p></IonText>}
              {error && <IonText color="danger"><p className="status-line">{error}</p></IonText>}
            </main>

            <aside className="workspace-rail">
              <IonCard className="editor-card editor-card--rail editor-card--preview-focus">
                <IonCardContent>
                  <div className="section-heading-row section-heading-row--rail section-heading-row--compact">
                    <span className="section-kicker">Preview</span>
                    <span className="section-state section-state--soft">Live</span>
                  </div>

                  <div className="timeline-rail" aria-label="Preview timeline">
                    <div className="timeline-rail__track" style={{ "--timeline-progress": `${railStageProgress}%` } as CSSProperties} />
                    <div className="timeline-rail__tabs" role="tablist" aria-label="Preview stages">
                      {RAIL_STAGES.map((stage, index) => {
                        const isActive = activeRailStage === stage.key;
                        return (
                          <button
                            key={stage.key}
                            type="button"
                            role="tab"
                            aria-selected={isActive}
                            className={`timeline-tab ${isActive ? "is-active" : ""}`}
                            onClick={() => {
                              setActiveRailStage(stage.key);
                              if (stage.key === "render" && composedPreviewUrl && generated) {
                                handleGenerateModelPreview();
                              }
                            }}
                          >
                            <span className="timeline-tab__index">{index + 1}</span>
                            <span className="timeline-tab__copy">
                              <strong>{stage.label}</strong>
                              <small>{stage.hint}</small>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="timeline-stage-shell" role="tabpanel">
                    {activeRailStage === "import" && (
                      <>
                        <p className="stage-label">Import URL and generate QR</p>
                        <div className="preview-box stage-preview-box preview-box--import">
                          {qrDataUrl && !isUrlEditorOpen ? (
                            <>
                              <button
                                type="button"
                                className="preview-corner-edit"
                                onClick={() => {
                                  setActiveRailStage("import");
                                  setIsUrlEditorOpen(true);
                                }}
                              >
                                Edit URL
                              </button>
                              <img src={qrDataUrl} alt="QR preview" />
                            </>
                          ) : (
                            <div className="preview-url-editor">
                              <IonItem className="editor-item preview-url-editor__item">
                                <IonLabel position="stacked">Enter URL</IonLabel>
                                <IonInput
                                  value={sourceUrl}
                                  placeholder="https://example.com/page"
                                  onIonInput={(e) => setSourceUrl((e.detail.value ?? "").toString())}
                                />
                              </IonItem>
                              <IonButton expand="block" fill="outline" onClick={handleGenerateQr}>
                                <IonIcon slot="start" icon={arrowForwardOutline} />
                                {qrDataUrl ? "Re-render QR" : "Generate QR"}
                              </IonButton>
                              {qrDataUrl && (
                                <IonButton
                                  expand="block"
                                  fill="clear"
                                  onClick={() => setIsUrlEditorOpen(false)}
                                >
                                  Cancel edit
                                </IonButton>
                              )}
                              <p className="section-helper preview-url-editor__helper">
                                The app normalizes your link and regenerates the QR in this panel.
                              </p>
                            </div>
                          )}
                        </div>
                      </>
                    )}

                    {activeRailStage === "compose" && (
                      <>
                        <p className="stage-label">Compose template and QR</p>
                        <div className="preview-box stage-preview-box">
                          {composedPreviewUrl ? (
                            <img src={composedPreviewUrl} alt="Template and QR preview" />
                          ) : (
                            <span>Selecting a template auto-composes the preview once a QR is generated.</span>
                          )}
                        </div>

                      </>
                    )}

                    {activeRailStage === "render" && (
                      <>
                        <p className="stage-label">Render 3D model preview</p>
                        <div className="preview-box model-preview-box">
                          {modelPreviewReady && generated ? (
                            <ModelPreviewCanvas imageDataUrl={composedPreviewUrl} params={stlParams} />
                          ) : (
                            <span>Generate model preview to render your 3D tag.</span>
                          )}
                        </div>
                        {modelPreviewReady && (
                          <IonText color="medium">
                            <p className="model-hint">Drag to rotate, use controls to pan and zoom, or tap Home to reset the view.</p>
                          </IonText>
                        )}
                      </>
                    )}

                    {activeRailStage === "export" && (
                      <>
                        <p className="stage-label">Export final model</p>
                        <div className="preview-box model-preview-box">
                          {modelPreviewReady && generated ? (
                            <ModelPreviewCanvas imageDataUrl={composedPreviewUrl} params={stlParams} />
                          ) : (
                            <span>Complete render to unlock exports.</span>
                          )}
                        </div>
                        <IonItem className="format-item">
                          <IonLabel>Download format</IonLabel>
                          <IonSelect value={modelFormat} onIonChange={(e) => setModelFormat(e.detail.value)}>
                            <IonSelectOption value="stl">STL</IonSelectOption>
                            <IonSelectOption value="obj">OBJ</IonSelectOption>
                          </IonSelect>
                        </IonItem>

                        <IonButton
                          className="action-btn"
                          expand="block"
                          color="secondary"
                          disabled={!modelPreviewReady}
                          onClick={handleDownloadModel}
                        >
                          {user ? `Download ${modelFormat.toUpperCase()}` : "Sign in to download model"}
                        </IonButton>
                      </>
                    )}
                  </div>

                  <div className="preview-template-section">
                    <div className="section-heading-row section-heading-row--rail section-heading-row--compact">
                      <div>
                        <p className="section-kicker">Template options</p>
                        <h3>Place your tag style beneath the live preview.</h3>
                      </div>
                      <span className="section-state section-state--soft">{selectedTemplate.name}</span>
                    </div>
                    <p className="template-picker-title">Template</p>
                    <div className="template-scroll-row" role="list" aria-label="Template options">
                      {TEMPLATE_PRESETS.map((preset) => {
                        const isActive = preset.id === selectedTemplateId;
                        return (
                          <div key={preset.id} className="template-option" role="listitem">
                            <button
                              type="button"
                              className={`template-button ${isActive ? "is-active" : ""}`}
                              style={{
                                borderColor: isActive ? preset.accentColor : "#c7d1dd",
                                background: isActive ? "#f8fbff" : "#ffffff",
                              }}
                              onClick={() => setSelectedTemplateId(preset.id)}
                              aria-label={`Select template ${preset.name}`}
                            >
                              <div
                                className={`template-card-preview template-card-preview--${preset.borderStyle} template-card-preview--${preset.frameStyle}`}
                                style={{ borderColor: preset.accentColor, color: preset.accentColor }}
                              >
                                {templateSelectorPreviews[preset.id] ? (
                                  <img
                                    className="template-card-image"
                                    src={templateSelectorPreviews[preset.id]}
                                    alt=""
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <div className="template-card-fallback" aria-hidden="true" />
                                )}
                              </div>
                              <span className="template-button-label">{preset.name}</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    <div className="template-selection-note">
                      <strong>{selectedTemplate.name}</strong>
                      <span>{selectedTemplate.description}</span>
                      <small>
                        {selectedTemplate.ctaConfig
                          ? "Customize the tag label and text size, then compose preview to apply it."
                          : selectedTemplate.ctaLabel
                            ? `This version keeps a fixed "${selectedTemplate.ctaLabel}" callout.`
                            : "No text callout for this template."}
                      </small>
                    </div>

                    {selectedTemplate.fields.length > 0 ? (
                      <div className="template-fields-shell">
                        {selectedTemplate.fields.map((field) => (
                          <IonItem key={field.key} className="editor-item">
                            <IonLabel position="stacked">{field.label}</IonLabel>
                            <IonInput
                              value={templateValues[field.key] ?? field.defaultValue}
                              placeholder={field.placeholder}
                              onIonInput={(e) => {
                                const nextValue = (e.detail.value ?? "").toString();
                                setTemplateValues((prev) => ({ ...prev, [field.key]: nextValue }));
                              }}
                            />
                          </IonItem>
                        ))}

                        {selectedTemplate.ctaConfig ? (
                          <IonItem className="editor-item" lines="none">
                            <IonLabel position="stacked">
                              Text size ({Math.round(
                                Math.min(
                                  selectedTemplate.ctaConfig.maxSizePx,
                                  Math.max(
                                    selectedTemplate.ctaConfig.minSizePx,
                                    Number(templateValues[selectedTemplate.ctaConfig.sizeKey]) || selectedTemplate.ctaConfig.defaultSizePx
                                  )
                                )
                              )} px)
                            </IonLabel>
                            <IonRange
                              min={selectedTemplate.ctaConfig.minSizePx}
                              max={selectedTemplate.ctaConfig.maxSizePx}
                              step={1}
                              snaps
                              pin
                              value={Math.min(
                                selectedTemplate.ctaConfig.maxSizePx,
                                Math.max(
                                  selectedTemplate.ctaConfig.minSizePx,
                                  Number(templateValues[selectedTemplate.ctaConfig.sizeKey]) || selectedTemplate.ctaConfig.defaultSizePx
                                )
                              )}
                              onIonChange={(e) => {
                                const raw = Number(e.detail.value);
                                if (!Number.isFinite(raw)) return;
                                const clamped = Math.min(
                                  selectedTemplate.ctaConfig!.maxSizePx,
                                  Math.max(selectedTemplate.ctaConfig!.minSizePx, Math.round(raw))
                                );
                                setTemplateValues((prev) => ({
                                  ...prev,
                                  [selectedTemplate.ctaConfig!.sizeKey]: String(clamped),
                                }));
                              }}
                            />
                          </IonItem>
                        ) : null}
                      </div>
                    ) : (
                      <IonText color="medium">
                        <p className="template-empty-note">No text fields for this template. Pick the border style you want and generate the QR.</p>
                      </IonText>
                    )}
                  </div>

                  <IonText>
                    <p className="short-url-line">{generated?.shortUrl ?? "Generate to create a short URL"}</p>
                  </IonText>
                </IonCardContent>
              </IonCard>
            </aside>
          </div>
        </div>
        <AppFooter />
      </IonContent>
    </IonPage>
  );
};

export default EditorPage;
