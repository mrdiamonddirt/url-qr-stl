import { useEffect, useMemo, useState } from "react";
import {
  IonBadge,
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonCol,
  IonContent,
  IonGrid,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonPage,
  IonRow,
  IonText,
  IonTitle,
  IonToolbar,
  IonToggle,
  IonSelect,
  IonSelectOption,
} from "@ionic/react";
import { useHistory } from "react-router";
import { customAlphabet } from "nanoid";
import { User } from "@supabase/supabase-js";
import { TEMPLATE_PRESETS } from "../constants/templates";
import ModelPreviewCanvas from "../components/ModelPreviewCanvas";
import { composeTemplatePreview } from "../lib/templatePreview";
import { createTemplateObjBlob, createTemplateStlBlob, downloadStl } from "../lib/stl";
import { ensureHttpUrl, shortUrlForCode } from "../lib/shortener";
import { toQrDataUrl } from "../lib/qr";
import { listShortUrlsByUser, saveShortUrl, saveStlExport } from "../lib/storage";
import { createCheckoutSession, getUserShortUrls, signOut, supabase } from "../lib/supabaseClient";
import { ModelFormat, Profile, ShortUrlRecord, StlParams, SupabaseShortUrlRow } from "../types";
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

const FREE_SCAN_LIMIT = 20;

const EditorPage: React.FC<Props> = ({ user, profile }) => {
  const history = useHistory();
  const [sourceUrl, setSourceUrl] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState(TEMPLATE_PRESETS[0].id);
  const [templateValues, setTemplateValues] = useState<Record<string, string>>({});
  const [generated, setGenerated] = useState<ShortUrlRecord | null>(null);
  const [recentByUser, setRecentByUser] = useState<ShortUrlRecord[]>([]);
  const [supabaseHistory, setSupabaseHistory] = useState<SupabaseShortUrlRow[]>([]);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [composedPreviewUrl, setComposedPreviewUrl] = useState("");
  const [modelPreviewReady, setModelPreviewReady] = useState(false);
  const [modelFormat, setModelFormat] = useState<ModelFormat>("stl");
  const [stlParams, setStlParams] = useState<StlParams>(DEFAULT_STL);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const selectedTemplate = useMemo(
    () => TEMPLATE_PRESETS.find((preset) => preset.id === selectedTemplateId) ?? TEMPLATE_PRESETS[0],
    [selectedTemplateId]
  );

  useEffect(() => {
    const defaults = selectedTemplate.fields.reduce<Record<string, string>>((acc, item) => {
      acc[item.key] = item.defaultValue;
      return acc;
    }, {});
    setTemplateValues(defaults);
    setComposedPreviewUrl("");
    setModelPreviewReady(false);
  }, [selectedTemplate]);

  useEffect(() => {
    setRecentByUser(listShortUrlsByUser(user?.id));
    if (user) {
      getUserShortUrls(user.id).then(setSupabaseHistory);
    } else {
      setSupabaseHistory([]);
    }
  }, [user]);

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

  async function handleComposePreview() {
    setError("");
    setStatus("");

    if (!generated || !qrDataUrl) {
      setError("Generate a QR code first.");
      return;
    }

    try {
      const image = await composeTemplatePreview({
        template: selectedTemplate,
        values: templateValues,
        qrDataUrl,
        shortUrl: generated.shortUrl,
      });

      setComposedPreviewUrl(image);
      setModelPreviewReady(false);
      setStatus("Step 2 complete. Generate the 3D model preview next.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not compose template preview.");
    }
  }

  function handleGenerateModelPreview() {
    setError("");
    setStatus("");

    if (!generated || !composedPreviewUrl) {
      setError("Complete the template + QR preview first.");
      return;
    }

    setModelPreviewReady(true);
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
    await signOut();
    history.push("/editor");
  }

  async function handleUpgrade() {
    try {
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      const origin = `${window.location.origin}${base}`;
      const url = await createCheckoutSession(origin);
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout.");
    }
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>URL QR STL</IonTitle>
          {user && profile?.plan === "premium" && (
            <IonBadge slot="end" color="warning" style={{ marginRight: 8 }}>Premium</IonBadge>
          )}
          <IonButton slot="end" fill="clear" onClick={user ? handleSignOut : () => history.push("/auth")}>
            {user ? "Sign out" : "Sign in"}
          </IonButton>
        </IonToolbar>
      </IonHeader>
      <IonContent className="editor-shell" fullscreen>
        <IonGrid>
          <IonRow>
            <IonCol size="12" sizeLg="8">
              <IonCard>
                <IonCardHeader>
                  <IonCardTitle>1. Complete the content</IonCardTitle>
                </IonCardHeader>
                <IonCardContent>
                  <IonItem>
                    <IonLabel position="stacked">Enter URL</IonLabel>
                    <IonInput
                      value={sourceUrl}
                      placeholder="https://example.com/page"
                      onIonInput={(e) => setSourceUrl((e.detail.value ?? "").toString())}
                    />
                  </IonItem>
                </IonCardContent>
              </IonCard>

              <IonCard>
                <IonCardHeader>
                  <IonCardTitle>2. Design your QR code</IonCardTitle>
                </IonCardHeader>
                <IonCardContent>
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
                              <div className="template-card-surface">
                                <div className="template-thumb-qr" aria-hidden="true">
                                  <span className="finder finder-a" />
                                  <span className="finder finder-b" />
                                  <span className="finder finder-c" />
                                </div>
                              </div>
                              {preset.ctaLabel ? <span className="template-card-cta">{preset.ctaLabel}</span> : null}
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
                      QR only for now. {selectedTemplate.ctaLabel ? `This version includes a fixed "${selectedTemplate.ctaLabel}" callout.` : "Text stays off unless we add a text-capable layout later."}
                    </small>
                  </div>

                  <IonText color="medium">
                    <p className="template-empty-note">No text fields yet. Pick the border style you want and generate the QR.</p>
                  </IonText>

                  <IonButton className="action-btn" expand="block" onClick={handleGenerateQr}>
                    Generate QR
                  </IonButton>
                </IonCardContent>
              </IonCard>

              <IonCard>
                <IonCardHeader>
                  <IonCardTitle>STL Parameters</IonCardTitle>
                </IonCardHeader>
                <IonCardContent>
                  <div className="stl-grid">
                    <IonItem>
                      <IonLabel position="stacked">Width (mm)</IonLabel>
                      <IonInput
                        type="number"
                        value={stlParams.widthMm}
                        onIonInput={(e) =>
                          setStlParams((prev) => ({ ...prev, widthMm: Number(e.detail.value) || prev.widthMm }))
                        }
                      />
                    </IonItem>
                    <IonItem>
                      <IonLabel position="stacked">Height (mm)</IonLabel>
                      <IonInput
                        type="number"
                        value={stlParams.heightMm}
                        onIonInput={(e) =>
                          setStlParams((prev) => ({ ...prev, heightMm: Number(e.detail.value) || prev.heightMm }))
                        }
                      />
                    </IonItem>
                    <IonItem>
                      <IonLabel position="stacked">Depth (mm)</IonLabel>
                      <IonInput
                        type="number"
                        value={stlParams.depthMm}
                        onIonInput={(e) =>
                          setStlParams((prev) => ({ ...prev, depthMm: Number(e.detail.value) || prev.depthMm }))
                        }
                      />
                    </IonItem>
                    <IonItem>
                      <IonLabel position="stacked">Base (mm)</IonLabel>
                      <IonInput
                        type="number"
                        value={stlParams.baseMm}
                        onIonInput={(e) =>
                          setStlParams((prev) => ({ ...prev, baseMm: Number(e.detail.value) || prev.baseMm }))
                        }
                      />
                    </IonItem>
                    <IonItem>
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
                    <IonItem lines="none">
                      <IonLabel>Invert output</IonLabel>
                      <IonToggle
                        checked={stlParams.invert}
                        onIonChange={(e) => setStlParams((prev) => ({ ...prev, invert: e.detail.checked }))}
                      />
                    </IonItem>
                  </div>

                </IonCardContent>
              </IonCard>

              {status && <IonText color="success"><p className="status-line">{status}</p></IonText>}
              {error && <IonText color="danger"><p className="status-line">{error}</p></IonText>}
            </IonCol>

            <IonCol size="12" sizeLg="4">
              <IonCard>
                <IonCardHeader>
                  <IonCardTitle>3. Preview and Export</IonCardTitle>
                </IonCardHeader>
                <IonCardContent>
                  <p className="stage-label">Step 1: QR code preview</p>
                  <div className="preview-box stage-preview-box">
                    {qrDataUrl ? <img src={qrDataUrl} alt="QR preview" /> : <span>Generate a QR to begin.</span>}
                  </div>

                  <div className="stage-action-row">
                    <IonButton expand="block" fill="outline" disabled={!qrDataUrl} onClick={handleComposePreview}>
                      Preview Selected Tag
                    </IonButton>
                  </div>

                  <p className="stage-label">Step 2: Template + QR preview</p>
                  <div className="preview-box stage-preview-box">
                    {composedPreviewUrl ? (
                      <img src={composedPreviewUrl} alt="Template and QR preview" />
                    ) : (
                      <span>Compose to preview the selected tag layout before the 3D step.</span>
                    )}
                  </div>

                  <div className="stage-action-row">
                    <IonButton
                      expand="block"
                      fill="outline"
                      disabled={!generated || !composedPreviewUrl}
                      onClick={handleGenerateModelPreview}
                    >
                      Generate 3D Model Preview
                    </IonButton>
                  </div>

                  <p className="stage-label">Step 3: 3D model preview</p>
                  <div className="preview-box model-preview-box">
                    {modelPreviewReady && generated ? (
                      <ModelPreviewCanvas imageDataUrl={composedPreviewUrl} params={stlParams} />
                    ) : (
                      <span>Generate model preview to render your 3D tag.</span>
                    )}
                  </div>
                  {modelPreviewReady && (
                    <IonText color="medium">
                      <p className="model-hint">Drag to rotate, scroll/pinch to zoom, and right-drag to pan.</p>
                    </IonText>
                  )}

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

                  <IonText>
                    <p className="short-url-line">{generated?.shortUrl ?? "Generate to create a short URL"}</p>
                  </IonText>
                </IonCardContent>
              </IonCard>

              <IonCard>
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
                          <strong>{row.short_code}</strong>
                          <span>{row.original_url}</span>
                          <IonBadge
                            color={row.scan_count >= FREE_SCAN_LIMIT && profile?.plan !== "premium" ? "danger" : "medium"}
                          >
                            {row.scan_count}/{profile?.plan === "premium" ? "∞" : FREE_SCAN_LIMIT} scans
                          </IonBadge>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <ul className="history-list">
                      {recentByUser.slice(0, 5).map((record) => (
                        <li key={record.id}>
                          <strong>{record.code}</strong>
                          <span>{record.originalUrl}</span>
                        </li>
                      ))}
                      {!recentByUser.length && <li>No tags generated yet.</li>}
                    </ul>
                  )}
                </IonCardContent>
              </IonCard>
            </IonCol>
          </IonRow>
        </IonGrid>
      </IonContent>
    </IonPage>
  );
};

export default EditorPage;
