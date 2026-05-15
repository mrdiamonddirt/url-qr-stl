import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
  IonSpinner,
  IonText,
  IonToolbar,
  IonToggle,
  IonSelect,
  IonSelectOption,
} from "@ionic/react";
import { useHistory } from "react-router";
import { customAlphabet } from "nanoid";
import { User } from "@supabase/supabase-js";
import {
  addOutline,
  arrowForwardOutline,
  barChartOutline,
  chevronDownOutline,
  closeCircleOutline,
  copyOutline,
  createOutline,
  diamondOutline,
  imageOutline,
  logOutOutline,
  openOutline,
  personCircleOutline,
  prismOutline,
  settingsOutline,
  sparklesOutline,
  statsChartOutline,
  trashOutline,
} from "ionicons/icons";
import { TEMPLATE_PRESETS } from "../constants/templates";
import ModelPreviewCanvas from "../components/ModelPreviewCanvas";
import {
  composeTemplatePreview,
  composeTemplateSelectorPreview,
  resolveTemplateCompositionExtents,
} from "../lib/templatePreview";
import { createTemplateObjBlob, createTemplateStlBlob, downloadStl } from "../lib/stl";
import { ensureHttpUrl, shortUrlForCode } from "../lib/shortener";
import { getQrTypeUnavailableReason, isPremiumQrType, toQrDataUrl } from "../lib/qr";
import { listShortUrlsByUser, saveShortUrl, saveStlExport } from "../lib/storage";
import {
  createCheckoutSession,
  deleteUserLogo,
  getLogoLimit,
  deleteShortUrl,
  getUserShortUrls,
  listUserLogos,
  setDefaultUserLogo,
  signOut,
  supabase,
  uploadUserLogo,
  updateProfileRedirectMode,
} from "../lib/supabaseClient";
import { formatPlanPrice, getAllowedCheckoutTargets, getPlanLabel, getPlanLimits, getUpgradeCreditLabel, isPaidPlan } from "../lib/plans";
import { CheckoutTargetPlan, ModelFormat, ModelPreviewOptions, PreviewMaterialType, Profile, QrCodeType, RedirectMode, ShortUrlRecord, StlParams, SupabaseShortUrlRow, UserLogo } from "../types";
import AppFooter from "../components/AppFooter";
import "./EditorPage.css";

import EmojiPicker from 'emoji-picker-react';

const makeId = customAlphabet("123456789abcdefghijkmnopqrstuvwxyz", 12);
const makeCode = customAlphabet("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz", 7);

const DEFAULT_STL: StlParams = {
  widthMm: 40,
  heightMm: 40,
  depthMm: 2.8,
  baseMm: 1,
  detail: "medium",
  invert: false,
  qrType: "standard",
};

type Props = {
  user: User | null;
  profile: Profile | null;
};

type RailStage = "import" | "compose" | "render" | "export";

type DimensionUnit = "mm" | "cm" | "in";

const FREE_SCAN_LIMIT = 20;
const FREE_TAG_LIMIT = 3;
const DEFAULT_QR_COLOR = "#111111";
const TRANSPARENT_QR_BACKGROUND = "#00000000";
const LOGO_MAX_BYTES = 1_048_576;
const LOGO_MIN_DIM = 64;
const LOGO_MAX_DIM = 1024;
const LOGO_ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const DEFAULT_FRAME_EMOJI = "🌊";
const CTA_SIZE_SCALE = 1;
const PENDING_CHECKOUT_PLAN_KEY = "url-qr-stl.pending-upgrade-plan";
const TEMPLATE_QR_FALLBACK_TARGET = "https://url2stl.com";
const CTA_FONT_OPTIONS: Record<string, string> = {
  default: "Clean Sans",
  impact: "Impact",
  mono: "Monospace",
  serif: "Serif",
  condensed: "Condensed",
};
const PREMIUM_TEMPLATE_LOCK_MESSAGE = "Premium template selected. Upgrade to unlock this style.";
const PREMIUM_TEMPLATE_LOCK_KEY = "premium-template-lock";

const DIMENSION_UNIT_OPTIONS: Array<{ value: DimensionUnit; label: string; mmFactor: number }> = [
  { value: "mm", label: "Millimeters (mm)", mmFactor: 1 },
  { value: "cm", label: "Centimeters (cm)", mmFactor: 10 },
  { value: "in", label: "Inches (in)", mmFactor: 25.4 },
];

function getPlanDisplayName(plan: CheckoutTargetPlan): string {
  return plan === "premium_monthly" ? "Monthly" : plan === "premium_yearly" ? "Yearly" : "Lifetime";
}

function getPlanMeta(plan: CheckoutTargetPlan): string {
  return plan === "premium_monthly" ? "Flexible" : plan === "premium_yearly" ? "Best value" : "One-time";
}

function isCheckoutTargetPlan(value: string): value is CheckoutTargetPlan {
  return value === "premium_monthly" || value === "premium_yearly" || value === "lifetime";
}

function getDimensionUnitFactor(unit: DimensionUnit): number {
  return DIMENSION_UNIT_OPTIONS.find((option) => option.value === unit)?.mmFactor ?? 1;
}

function formatDimensionValue(valueMm: number, unit: DimensionUnit): number {
  const converted = valueMm / getDimensionUnitFactor(unit);
  return Number(converted.toFixed(unit === "in" ? 3 : 2));
}

function parseDimensionInput(rawValue: number, unit: DimensionUnit): number | null {
  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return null;
  }

  const valueMm = rawValue * getDimensionUnitFactor(unit);
  return Number(valueMm.toFixed(3));
}

const QR_TYPE_OPTIONS: Array<{ value: QrCodeType; label: string }> = [
  { value: "standard", label: "Standard QR" },
  { value: "frame", label: "Frame QR" },
];

function buildTemplateDefaults(template: (typeof TEMPLATE_PRESETS)[number]): Record<string, string> {
  const defaults = template.fields.reduce<Record<string, string>>((acc, item) => {
    acc[item.key] = item.defaultValue;
    return acc;
  }, {});

  defaults.template_color = template.accentColor;

  if (template.ctaConfig) {
    defaults[template.ctaConfig.fieldKey] = defaults[template.ctaConfig.fieldKey] ?? template.ctaLabel ?? "";
    defaults[template.ctaConfig.sizeKey] = String(template.ctaConfig.defaultSizePx * CTA_SIZE_SCALE);
    defaults[template.ctaConfig.fontKey] = "default";
    defaults[template.ctaConfig.chipHeightKey] = String(template.ctaConfig.chipHeight);
  }

  if (template.loopConfig) {
    defaults.loop_outer_radius = String(template.loopConfig.outerRadius);
    defaults.loop_stem_width = String(template.loopConfig.stemWidth);
    defaults.loop_thickness = String(template.loopConfig.outerRadius - template.loopConfig.innerRadius);
  }

  if (template.borderStyle !== "none") {
    defaults.border_thickness = template.borderStyle === "fancy" ? "8" : "6";
  }

  return defaults;
}

const RAIL_STAGES: Array<{ key: RailStage; label: string; hint: string }> = [
  { key: "import", label: "Import URL", hint: "Auto-generate short URL + QR" },
  { key: "compose", label: "Template Edit", hint: "Compose printable tag preview" },
  { key: "render", label: "Render", hint: "Generate 3D model preview" },
  { key: "export", label: "Export", hint: "Download print-ready STL or OBJ" },
];

const RAIL_STAGE_INDEX: Record<RailStage, number> = {
  import: 0,
  compose: 1,
  render: 2,
  export: 3,
};

const DEFAULT_TEMPLATE_ID = TEMPLATE_PRESETS[0]?.id ?? "";

async function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not read image dimensions."));
      img.src = objectUrl;
    });
    return { width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function buildSimplifiedEmojiLogoDataUrl(emoji: string): string {
  try {
    const outputCanvas = document.createElement("canvas");
    const outputSize = 192;
    outputCanvas.width = outputSize;
    outputCanvas.height = outputSize;
    const outputCtx = outputCanvas.getContext("2d");
    if (!outputCtx) {
      return "";
    }

    const supersampleScale = 2;
    const rasterSize = outputSize * supersampleScale;
    const rasterCanvas = document.createElement("canvas");
    rasterCanvas.width = rasterSize;
    rasterCanvas.height = rasterSize;
    const rasterCtx = rasterCanvas.getContext("2d");
    if (!rasterCtx) {
      return "";
    }

    rasterCtx.clearRect(0, 0, rasterSize, rasterSize);
    rasterCtx.textAlign = "center";
    rasterCtx.textBaseline = "middle";
    rasterCtx.font = `${Math.round(rasterSize * 0.7)}px 'Arial', 'Noto Sans', 'sans-serif'`;
    rasterCtx.lineJoin = "round";
    rasterCtx.lineCap = "round";
    rasterCtx.strokeStyle = "black";
    rasterCtx.lineWidth = Math.max(10, Math.round(rasterSize * 0.052));
    rasterCtx.strokeText(emoji, rasterSize / 2, rasterSize / 2);
    rasterCtx.fillStyle = "white";
    rasterCtx.fillText(emoji, rasterSize / 2, rasterSize / 2);

    outputCtx.imageSmoothingEnabled = true;
    outputCtx.imageSmoothingQuality = "high";
    outputCtx.clearRect(0, 0, outputSize, outputSize);
    outputCtx.drawImage(rasterCanvas, 0, 0, outputSize, outputSize);
    return outputCanvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

function extractFirstEmoji(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(/\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*/u);
  return match?.[0] ?? null;
}

function normalizeFrameLogoUrl(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ?? "";
}


const EditorPage: React.FC<Props> = ({ user, profile }) => {
  const history = useHistory();
  const headerRef = useRef<HTMLElement | null>(null);
  const templateValuesOverrideRef = useRef<Record<string, string> | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const emojiInputRef = useRef<HTMLInputElement | null>(null);
  const [accountPanelOpen, setAccountPanelOpen] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState(TEMPLATE_PRESETS[0].id);
  const [templateValues, setTemplateValues] = useState<Record<string, string>>({});
  const [generated, setGenerated] = useState<ShortUrlRecord | null>(null);
  const [recentByUser, setRecentByUser] = useState<ShortUrlRecord[]>([]);
  const [templateSelectorPreviews, setTemplateSelectorPreviews] = useState<Record<string, string>>({});
  const [supabaseHistory, setSupabaseHistory] = useState<SupabaseShortUrlRow[]>([]);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrForegroundColor, setQrForegroundColor] = useState(DEFAULT_QR_COLOR);
  const [composedPreviewUrl, setComposedPreviewUrl] = useState("");
  const [modelSourcePreviewUrl, setModelSourcePreviewUrl] = useState("");
  const [modelPreviewReady, setModelPreviewReady] = useState(false);
  const [modelPreviewLoading, setModelPreviewLoading] = useState(false);
  const [composingPreview, setComposingPreview] = useState(false);
  const [generatingQr, setGeneratingQr] = useState(false);
  const [modelExporting, setModelExporting] = useState(false);
  const [savingPng, setSavingPng] = useState(false);
  const [modelFormat, setModelFormat] = useState<ModelFormat>("stl");
  const [stlParams, setStlParams] = useState<StlParams>(DEFAULT_STL);
  const [previewQrColor, setPreviewQrColor] = useState("#222222");
  const [previewBaseColor, setPreviewBaseColor] = useState("#e8e8e8");
  const [previewQrMaterial, setPreviewQrMaterial] = useState<PreviewMaterialType>("matte");
  const [previewBaseMaterial, setPreviewBaseMaterial] = useState<PreviewMaterialType>("matte");
  const [dimensionUnit, setDimensionUnit] = useState<DimensionUnit>("mm");
  const [activeRailStage, setActiveRailStage] = useState<RailStage>("import");
  const [isUrlEditorOpen, setIsUrlEditorOpen] = useState(true);
  const [savedRedirectMode, setSavedRedirectMode] = useState<RedirectMode>("interstitial");
  const [pendingRedirectMode, setPendingRedirectMode] = useState<RedirectMode>("interstitial");
  const [tagSearch, setTagSearch] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [visibleStatus, setVisibleStatus] = useState("");
  const [visibleError, setVisibleError] = useState("");
  const [userLogos, setUserLogos] = useState<UserLogo[]>([]);
  const [selectedLogoId, setSelectedLogoId] = useState<string | null>(null);
  const [logosLoading, setLogosLoading] = useState(false);
  const [logoUploadBusy, setLogoUploadBusy] = useState(false);
  const [logoDeleteBusyId, setLogoDeleteBusyId] = useState<string | null>(null);
  const [selectedUpgradePlan, setSelectedUpgradePlan] = useState<CheckoutTargetPlan>("premium_monthly");
  const [directUpgradeOverlayOpen, setDirectUpgradeOverlayOpen] = useState(false);
  const [selectedEmoji, setSelectedEmoji] = useState(DEFAULT_FRAME_EMOJI);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const hasHandledPendingCheckoutRef = useRef(false);

  const toggleEmojiPicker = () => {
    setIsEmojiPickerOpen((prev) => !prev);
  };

  const handleEmojiClick = (emojiData: any) => {
    setSelectedEmoji(emojiData.emoji);
    setIsEmojiPickerOpen(false);
  };

  const selectedTemplate = useMemo(
    () => TEMPLATE_PRESETS.find((preset) => preset.id === selectedTemplateId) ?? TEMPLATE_PRESETS[0],
    [selectedTemplateId]
  );
  const compositionExtents = useMemo(
    () => resolveTemplateCompositionExtents(selectedTemplate, templateValues),
    [selectedTemplate, templateValues]
  );

  const templateForegroundColor = (templateValues.template_color ?? selectedTemplate.accentColor).toUpperCase();
  const currentPlan = profile?.plan ?? "free";
  const isPremiumPlan = isPaidPlan(currentPlan);
  const planLimits = getPlanLimits(currentPlan);
  const logoLimit = getLogoLimit(currentPlan);
  const allowedUpgradeTargets = getAllowedCheckoutTargets(currentPlan);
  const canToggleInstantRedirect = Boolean(user && isPremiumPlan);
  const hasPendingRedirectSave = canToggleInstantRedirect && pendingRedirectMode !== savedRedirectMode;
  const tagLimit = isPremiumPlan ? planLimits.maxActiveTags : FREE_TAG_LIMIT;
  const monthlyScans = profile?.monthly_scans ?? 0;
  const monthlyScanPercent = Math.min(100, Math.round((monthlyScans / planLimits.monthlyScanLimit) * 100));
  const premiumTemplatesCount = TEMPLATE_PRESETS.filter((preset) => preset.premiumOnly).length;
  const dimensionUnitLabel = useMemo(
    () => DIMENSION_UNIT_OPTIONS.find((option) => option.value === dimensionUnit)?.label ?? "Millimeters (mm)",
    [dimensionUnit]
  );

  const updateDimensionParam = useCallback((key: keyof Pick<StlParams, "widthMm" | "heightMm" | "depthMm" | "baseMm">, rawValue: number) => {
    const nextValueMm = parseDimensionInput(rawValue, dimensionUnit);
    if (nextValueMm === null) {
      return;
    }

    setStlParams((prev) => ({ ...prev, [key]: nextValueMm }));
  }, [dimensionUnit]);

  const accountEmail = user?.email ?? "Guest";
  const planLabel = getPlanLabel(currentPlan);
  const accountTriggerLabel = user ? (user.email ?? "Account") : "Account";
  const accountInitials = useMemo(() => {
    const source = user?.email?.trim() || "URL 2 STL";
    const segments = source.split(/[@.\s_-]+/).filter(Boolean);
    return segments.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "U2";
  }, [user?.email]);

  const previewOptions: ModelPreviewOptions = useMemo(() => ({
    qrColor: previewQrColor,
    baseColor: previewBaseColor,
    qrMaterial: previewQrMaterial,
    baseMaterial: previewBaseMaterial,
  }), [previewQrColor, previewBaseColor, previewQrMaterial, previewBaseMaterial]);

  const handlePreviewOptionsChange = useCallback((opts: ModelPreviewOptions) => {
    if (opts.qrColor !== undefined) setPreviewQrColor(opts.qrColor);
    if (opts.baseColor !== undefined) setPreviewBaseColor(opts.baseColor);
    if (opts.qrMaterial !== undefined) setPreviewQrMaterial(opts.qrMaterial);
    if (opts.baseMaterial !== undefined) setPreviewBaseMaterial(opts.baseMaterial);
  }, []);

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
    if (!allowedUpgradeTargets.includes(selectedUpgradePlan)) {
      setSelectedUpgradePlan(allowedUpgradeTargets[0] ?? "premium_monthly");
    }
  }, [allowedUpgradeTargets, selectedUpgradePlan]);

  useEffect(() => {
    if (profile?.redirect_mode === "instant" && isPremiumPlan) {
      setSavedRedirectMode("instant");
      setPendingRedirectMode("instant");
      return;
    }
    setSavedRedirectMode("interstitial");
    setPendingRedirectMode("interstitial");
  }, [isPremiumPlan, profile?.redirect_mode]);

  useEffect(() => {
    if (!user || hasHandledPendingCheckoutRef.current) {
      return;
    }

    const pendingPlan = localStorage.getItem(PENDING_CHECKOUT_PLAN_KEY);
    if (!pendingPlan) {
      hasHandledPendingCheckoutRef.current = true;
      return;
    }

    if (!isCheckoutTargetPlan(pendingPlan)) {
      localStorage.removeItem(PENDING_CHECKOUT_PLAN_KEY);
      hasHandledPendingCheckoutRef.current = true;
      return;
    }

    localStorage.removeItem(PENDING_CHECKOUT_PLAN_KEY);
    hasHandledPendingCheckoutRef.current = true;
    setSelectedUpgradePlan(pendingPlan);
    void handleUpgrade(pendingPlan);
  }, [user]);

  const filteredSupabaseHistory = useMemo(() => {
    const query = tagSearch.trim().toLowerCase();
    if (!query) {
      return supabaseHistory;
    }
    return supabaseHistory.filter((row) =>
      row.short_code.toLowerCase().includes(query) || row.original_url.toLowerCase().includes(query)
    );
  }, [supabaseHistory, tagSearch]);

  const filteredRecentByUser = useMemo(() => {
    const query = tagSearch.trim().toLowerCase();
    if (!query) {
      return recentByUser;
    }
    return recentByUser.filter((record) =>
      record.code.toLowerCase().includes(query) || record.originalUrl.toLowerCase().includes(query)
    );
  }, [recentByUser, tagSearch]);

  const isFrameQr = stlParams.qrType === "frame";
  const defaultLogo = useMemo(() => userLogos.find((logo) => logo.is_default) ?? null, [userLogos]);
  const selectedLogo = useMemo(() => userLogos.find((logo) => logo.id === selectedLogoId) ?? null, [selectedLogoId, userLogos]);
  const effectiveLogo = selectedLogo ?? defaultLogo;
  const simplifiedEmojiLogoDataUrl = useMemo(
    () => buildSimplifiedEmojiLogoDataUrl(selectedEmoji || DEFAULT_FRAME_EMOJI),
    [selectedEmoji]
  );
  const logoSlotsRemaining = Math.max(0, logoLimit - userLogos.length);
  const frameLogoPreviewUrl = useMemo(() => {
    if (!isFrameQr) {
      return "";
    }
    const normalizedLogoUrl = normalizeFrameLogoUrl(effectiveLogo?.public_url);
    return normalizedLogoUrl || simplifiedEmojiLogoDataUrl;
  }, [effectiveLogo?.public_url, isFrameQr, simplifiedEmojiLogoDataUrl]);
  const selectedQrTypeUnavailableReason = useMemo(
    () => getQrTypeUnavailableReason(stlParams.qrType),
    [stlParams.qrType]
  );

  const nextRailStage = useMemo(() => {
    const index = RAIL_STAGE_INDEX[activeRailStage];
    if (index >= RAIL_STAGES.length - 1) {
      return null;
    }
    return RAIL_STAGES[index + 1];
  }, [activeRailStage]);

  const getQrTargetUrl = useCallback(
    (record: ShortUrlRecord, mode: RedirectMode = pendingRedirectMode) => {
      return canToggleInstantRedirect && mode === "instant" ? record.originalUrl : record.shortUrl;
    },
    [canToggleInstantRedirect, pendingRedirectMode]
  );

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
    setModelSourcePreviewUrl("");
    setModelPreviewReady(false);
    setModelPreviewLoading(false);
  }, [selectedTemplate]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const nextPreviewEntries = await Promise.all(
        TEMPLATE_PRESETS.map(async (preset) => {
          const nextValues = preset.id === selectedTemplate.id ? templateValues : buildTemplateDefaults(preset);
          const preview = await composeTemplateSelectorPreview(preset, nextValues, qrDataUrl);
          return [preset.id, preview] as const;
        })
      );

      if (cancelled) {
        return;
      }

      setTemplateSelectorPreviews(Object.fromEntries(nextPreviewEntries));
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedTemplate, templateValues, qrDataUrl]);

  useEffect(() => {
    if (isPremiumPlan) {
      return;
    }
    if (selectedTemplate.premiumOnly) {
      const fallbackTemplate = TEMPLATE_PRESETS.find((preset) => !preset.premiumOnly) ?? TEMPLATE_PRESETS[0];
      setSelectedTemplateId(fallbackTemplate.id);
      setError("This template is premium-only. Upgrade to unlock it.");
    }
  }, [isPremiumPlan, selectedTemplate, selectedTemplateId]);

  // Auto-compose preview whenever a QR payload is available (fallback or generated)
  useEffect(() => {
    if (!qrDataUrl) return;
    if (generated) {
      setActiveRailStage("compose");
    }
    setModelPreviewReady(false);
    setModelPreviewLoading(false);
    const timeoutId = window.setTimeout(() => {
      (async () => {
        setComposingPreview(true);
        try {
          const displayImage = await composeTemplatePreview({
            template: selectedTemplate,
            values: templateValues,
            qrDataUrl,
            shortUrl: generated?.shortUrl ?? TEMPLATE_QR_FALLBACK_TARGET,
            renderIntent: "display",
          });
          setComposedPreviewUrl(displayImage);
          setModelSourcePreviewUrl("");
        } catch (err) {
          setComposedPreviewUrl("");
          setModelSourcePreviewUrl("");
          const errorMsg = err instanceof Error ? err.message : "Failed to compose template preview";
          setError(`${errorMsg}. Try refreshing or selecting a different template.`);
        } finally {
          setComposingPreview(false);
        }
      })();
    }, 60);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [generated, qrDataUrl, selectedTemplate, templateValues]);

  async function ensureModelSourcePreview(): Promise<string | null> {
    if (modelSourcePreviewUrl) {
      return modelSourcePreviewUrl;
    }

    if (!generated || !qrDataUrl) {
      return null;
    }

    const modelImage = await composeTemplatePreview({
      template: selectedTemplate,
      values: templateValues,
      qrDataUrl,
      shortUrl: generated.shortUrl,
      renderIntent: "model",
    });
    setModelSourcePreviewUrl(modelImage);
    return modelImage;
  }

  useEffect(() => {
    let cancelled = false;

    setRecentByUser(listShortUrlsByUser(user?.id));
    if (user) {
      getUserShortUrls(user.id)
        .then((urls) => {
          if (!cancelled) {
            setSupabaseHistory(urls);
          }
        })
        .catch((err) => {
          if (!cancelled) {
            console.error("Failed to load short URLs:", err);
            setSupabaseHistory([]);
          }
        });
    } else {
      setSupabaseHistory([]);
    }

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    async function loadLogos() {
      if (!user || !isPremiumPlan) {
        setUserLogos([]);
        setSelectedLogoId(null);
        return;
      }

      setLogosLoading(true);
      try {
        const logos = await listUserLogos(user.id);
        if (!cancelled) {
          setUserLogos(logos);
          if (!logos.some((logo) => logo.id === selectedLogoId)) {
            setSelectedLogoId(null);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError("Failed to load your saved logos. Check your internet connection and try again.");
        }
      } finally {
        if (!cancelled) {
          setLogosLoading(false);
        }
      }
    }

    void loadLogos();
    return () => {
      cancelled = true;
    };
  }, [isPremiumPlan, user]);

  useEffect(() => {
    if (!isFrameQr) {
      return;
    }
    setTemplateValues((prev) => ({
      ...prev,
      frame_logo_url: frameLogoPreviewUrl,
      frame_logo_emoji: selectedEmoji,
    }));
  }, [frameLogoPreviewUrl, isFrameQr, selectedEmoji]);

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

  useEffect(() => {
    if (!status) {
      return;
    }

    setVisibleStatus(status);
    const timeoutId = window.setTimeout(() => {
      setVisibleStatus("");
      setStatus("");
    }, 1800);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [status]);

  useEffect(() => {
    if (!error) {
      return;
    }

    setVisibleError(error);
    const timeoutMs = errorKey === PREMIUM_TEMPLATE_LOCK_KEY ? 2000 : 1900;
    const timeoutId = window.setTimeout(() => {
      setVisibleError("");
      setError("");
      setErrorKey(null);
    }, timeoutMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [error, errorKey]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setGeneratingQr(true);
      try {
        const targetUrl = generated ? getQrTargetUrl(generated) : TEMPLATE_QR_FALLBACK_TARGET;
        const nextQr = await toQrDataUrl(targetUrl, stlParams.qrType, {
          darkColor: qrForegroundColor,
          lightColor: TRANSPARENT_QR_BACKGROUND,
        });
        if (!cancelled) {
          setQrDataUrl(nextQr);
          setComposedPreviewUrl("");
          setModelPreviewReady(false);
          setModelPreviewLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError("Failed to update the QR preview. Check your input and try again.");
        }
      } finally {
        if (!cancelled) {
          setGeneratingQr(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [generated, getQrTargetUrl, qrForegroundColor, stlParams.qrType]);

  async function handleDeleteTag(shortCode: string) {
    if (!user) return;
    await deleteShortUrl(shortCode, user.id);
    setSupabaseHistory((prev) => prev.filter((row) => row.short_code !== shortCode));
  }

  async function handleUploadLogo(file: File) {
    if (!user || !isPremiumPlan) {
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

    if (userLogos.length >= logoLimit) {
      setError(`You can store up to ${logoLimit} logos. Remove one to add another.`);
      return;
    }

    setLogoUploadBusy(true);
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

      const created = await uploadUserLogo(user.id, file, dimensions, userLogos.length === 0);
      const nextLogos = [created, ...userLogos];
      setUserLogos(nextLogos);
      setSelectedLogoId(created.id);
      setStatus("Logo uploaded. It is now available for Frame QR tags.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to upload your logo. Check the file and try again.";
      if (message.includes("logo_limit_exceeded")) {
        setError(`You can store up to ${logoLimit} logos. Remove one to add another.`);
      } else if (message.includes("premium_logo_access_required")) {
        setError("Frame logo uploads are premium-only.");
      } else {
        setError(message);
      }
    } finally {
      setLogoUploadBusy(false);
    }
  }

  async function handleDeleteLogo(logoId: string) {
    if (!user) {
      return;
    }

    setLogoDeleteBusyId(logoId);
    try {
      await deleteUserLogo(user.id, logoId);
      setUserLogos((prev) => prev.filter((logo) => logo.id !== logoId));
      if (selectedLogoId === logoId) {
        setSelectedLogoId(null);
      }
      setStatus("Logo removed from your library.");
    } catch (err) {
      setError("Failed to remove logo. Please try again or check your connection.");
    } finally {
      setLogoDeleteBusyId(null);
    }
  }

  async function handleSetDefaultLogo(logoId: string) {
    if (!user) {
      return;
    }

    try {
      await setDefaultUserLogo(user.id, logoId);
      setUserLogos((prev) => prev.map((logo) => ({ ...logo, is_default: logo.id === logoId })));
      setStatus("Default logo updated.");
    } catch (err) {
      setError("Failed to set default logo. Please try again.");
    }
  }

  function openSystemEmojiPicker() {
    const input = emojiInputRef.current;
    if (!input) {
      return;
    }

    input.type = "text"; // Ensure the input type is compatible
    input.focus();
    input.select();

    if (typeof (input as HTMLInputElement & { showPicker?: () => void }).showPicker === "function") {
      (input as HTMLInputElement & { showPicker: () => void }).showPicker();
    } else {
      alert("Your browser does not support the emoji picker. Please update your browser or use a supported one.");
    }
  }

  function handleEmojiInput(value: string) {
    const extracted = extractFirstEmoji(value);
    if (!extracted) {
      if (!value.trim()) {
        setSelectedEmoji(DEFAULT_FRAME_EMOJI);
      }
      return;
    }

    setSelectedEmoji(extracted);
    setError("");
  }

  async function persistPendingRedirectModeIfNeeded(targetStage: RailStage): Promise<boolean> {
    if (!user || !hasPendingRedirectSave) {
      return true;
    }

    const isForwardMove = RAIL_STAGE_INDEX[targetStage] > RAIL_STAGE_INDEX[activeRailStage];
    if (!isForwardMove) {
      return true;
    }

    try {
      await updateProfileRedirectMode(user.id, pendingRedirectMode);
      setSavedRedirectMode(pendingRedirectMode);
      setStatus(`Redirect mode saved: ${pendingRedirectMode === "instant" ? "Direct Link" : "Tracked Redirect"}.`);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save redirect mode. Check your connection and try again.";

      if (message.toLowerCase().includes("premium")) {
        setSavedRedirectMode("interstitial");
        setPendingRedirectMode("interstitial");
        setError("Direct Link requires an active Premium plan. The toggle was reset.");
      } else {
        setError(message);
      }

      return false;
    }
  }

  async function moveToStage(targetStage: RailStage): Promise<boolean> {
    const ok = await persistPendingRedirectModeIfNeeded(targetStage);
    if (!ok) {
      return false;
    }
    setActiveRailStage(targetStage);
    return true;
  }

  async function handleGenerateQr() {
    setError("");
    setStatus("");

    if (selectedTemplate.premiumOnly && !isPremiumPlan) {
      setError(`"${selectedTemplate.name}" is a premium template. Upgrade to use it.`);
      return;
    }

    if (user && supabaseHistory.length >= tagLimit) {
      setError(
        isPremiumPlan
          ? `You have reached the ${planLimits.maxActiveTags}-tag limit for your plan.`
          : `Free accounts are limited to ${FREE_TAG_LIMIT} active tags. Delete a tag or upgrade for up to ${planLimits.maxActiveTags} tags.`
      );
      return;
    }

    try {
      if (selectedQrTypeUnavailableReason) {
        setError(selectedQrTypeUnavailableReason);
        return;
      }

      if (effectiveLogo && !isFrameQr) {
        setError("Saved logos are only available with Frame QR.");
        return;
      }

      if (effectiveLogo && !isPremiumPlan) {
        setError("Frame logo uploads are premium-only.");
        return;
      }

      if (isPremiumQrType(stlParams.qrType) && !isPremiumPlan) {
        setError("This QR format is a Premium feature. Upgrade to create tags with advanced symbologies and artwork options.");
        return;
      }

      const normalized = ensureHttpUrl(sourceUrl);
      let code = makeCode();
      let shortUrl = shortUrlForCode(code);
      const payloadValues = {
        ...templateValues,
        frame_logo_url: frameLogoPreviewUrl,
        frame_logo_emoji: selectedEmoji,
      };

      // Signed-in users should have a cloud-backed short link before preview/testing.
      if (supabase && user) {
        let inserted = false;

        for (let attempt = 0; attempt < 3; attempt += 1) {
          const { error: insertError } = await supabase.from("short_urls").insert({
            user_id: user.id,
            short_code: code,
            original_url: normalized,
            template_id: selectedTemplate.id,
            template_payload: payloadValues,
            qr_type: stlParams.qrType,
            frame_logo_id: isFrameQr ? effectiveLogo?.id ?? null : null,
          });

          if (!insertError) {
            inserted = true;
            break;
          }

          const isUniqueViolation = (insertError as { code?: string }).code === "23505";
          const insertMessage = (insertError as { message?: string; details?: string }).message ?? "";
          const insertDetails = (insertError as { details?: string }).details ?? "";
          if (insertMessage.includes("premium_template_required") || insertMessage.includes("premium_branding_required")) {
            throw new Error(insertDetails || "This action requires a Premium plan.");
          }
          if (!isUniqueViolation) {
            throw insertError;
          }

          code = makeCode();
          shortUrl = shortUrlForCode(code);
        }

        if (!inserted) {
          throw new Error("Failed to create a short link. Refresh and try generating again.");
        }
      }

      const record: ShortUrlRecord = {
        id: makeId(),
        code,
        originalUrl: normalized,
        shortUrl,
        templateId: selectedTemplate.id,
        templateValues: payloadValues,
        qrType: stlParams.qrType,
        frameLogoId: isFrameQr ? effectiveLogo?.id ?? null : null,
        userId: user?.id,
        createdAt: new Date().toISOString(),
      };

      saveShortUrl(record);
      setGenerated(record);
      setRecentByUser(listShortUrlsByUser(user?.id));
      setQrDataUrl(
        await toQrDataUrl(getQrTargetUrl(record), stlParams.qrType, {
          darkColor: qrForegroundColor,
          lightColor: TRANSPARENT_QR_BACKGROUND,
        })
      );
      setComposedPreviewUrl("");
      setModelPreviewReady(false);
      setIsUrlEditorOpen(false);
      await moveToStage("import");

      if (supabase && user) {
        // Refresh Supabase history to include the new entry
        getUserShortUrls(user.id).then(setSupabaseHistory);
      }

      setStatus("Step 1 complete. Preview your QR code, then compose the template preview.");
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to generate QR code";
      setErrorKey(null);
      setError(`${errorMsg}. Check your URL and try again.`);
    }
  }

  function handleTemplateSelection(templateId: string, premiumOnly?: boolean) {
    if (premiumOnly && !isPremiumPlan) {
      setErrorKey(PREMIUM_TEMPLATE_LOCK_KEY);
      setError(PREMIUM_TEMPLATE_LOCK_MESSAGE);
      return;
    }
    setErrorKey(null);
    setError("");
    setSelectedTemplateId(templateId);
  }

  function handleQrTypeChange(nextType: QrCodeType) {
    const unavailableReason = getQrTypeUnavailableReason(nextType);
    if (unavailableReason) {
      setErrorKey(null);
      setError(unavailableReason);
      return;
    }
    if (isPremiumQrType(nextType) && !isPremiumPlan) {
      const premiumFeatureLabel =
        nextType === "frame"
          ? "Frame QR"
          : nextType === "micro"
            ? "Micro QR"
            : nextType === "rmqr"
              ? "rMQR"
              : "iQR";
                  setErrorKey(null);
      setError(`${premiumFeatureLabel} is a Premium feature. Upgrade to unlock advanced QR formats and artwork options.`);
      if (window.confirm(`${premiumFeatureLabel} is a Premium feature. Upgrade now?`)) {
        if (user) {
          void handleUpgrade();
        } else {
          localStorage.setItem("url-qr-stl.return-to", "/editor");
          history.push("/auth");
        }
      }
      return;
    }
    setError("");
    setStlParams((prev) => ({ ...prev, qrType: nextType }));
  }

  async function restoreFromRecord(record: ShortUrlRecord) {
    setError("");
    setStatus("");

    const template = TEMPLATE_PRESETS.find((preset) => preset.id === record.templateId) ?? TEMPLATE_PRESETS[0];
    const defaults = buildTemplateDefaults(template);

    templateValuesOverrideRef.current = { ...defaults, ...(record.templateValues ?? {}) };
    const restoredEmoji = record.templateValues?.frame_logo_emoji;
    if (restoredEmoji && typeof restoredEmoji === "string") {
      setSelectedEmoji(restoredEmoji);
    } else {
      setSelectedEmoji(DEFAULT_FRAME_EMOJI);
    }

    setSourceUrl(record.originalUrl);
    setGenerated(record);
    if (record.qrType) {
      setStlParams((prev) => ({ ...prev, qrType: record.qrType ?? prev.qrType }));
    }
    setSelectedLogoId(record.frameLogoId ?? null);
    setSelectedTemplateId(template.id);
    setComposedPreviewUrl("");
    setModelPreviewReady(false);
    setIsUrlEditorOpen(false);
    await moveToStage("import");

    try {
      setQrDataUrl(
        await toQrDataUrl(getQrTargetUrl(record), stlParams.qrType, {
          darkColor: qrForegroundColor,
          lightColor: TRANSPARENT_QR_BACKGROUND,
        })
      );
      setStatus(`Loaded tag ${record.code}. You can adjust template settings or export.`);
    } catch (err) {
      setQrDataUrl("");
      setError(err instanceof Error ? err.message : "Failed to load the QR code. Try refreshing or selecting a different tag.");
    }

    if (selectedQrTypeUnavailableReason) {
      setError(selectedQrTypeUnavailableReason);
      return;
    }
  }

  async function handleSelectSupabaseTag(row: SupabaseShortUrlRow) {
    const localRecord = recentByUser.find((record) => record.code === row.short_code);
    if (localRecord) {
      await restoreFromRecord(localRecord);
      return;
    }

    const fallbackTemplate = selectedTemplate;
    const templateFromRow = row.template_id
      ? TEMPLATE_PRESETS.find((preset) => preset.id === row.template_id) ?? fallbackTemplate
      : fallbackTemplate;
    const valuesFromRow = row.template_payload && typeof row.template_payload === "object"
      ? row.template_payload
      : buildTemplateDefaults(templateFromRow);

    const fallbackRecord: ShortUrlRecord = {
      id: `supabase-${row.short_code}`,
      code: row.short_code,
      originalUrl: row.original_url,
      shortUrl: shortUrlForCode(row.short_code),
      templateId: templateFromRow.id,
      templateValues: valuesFromRow,
      qrType: row.qr_type,
      frameLogoId: row.frame_logo_id,
      userId: user?.id,
      createdAt: row.created_at,
    };

    await restoreFromRecord(fallbackRecord);
    setStatus(`Loaded tag ${row.short_code}.`);
  }

  async function handleGenerateModelPreview(): Promise<boolean> {
    setError("");
    setStatus("");

    if (!generated || !composedPreviewUrl) {
      setError("Complete the template + QR preview first.");
      return false;
    }

    try {
      setModelPreviewLoading(true);
      const modelSource = await ensureModelSourcePreview();
      if (!modelSource) {
        setError("Could not prepare the model source image. Compose the preview again.");
        setModelPreviewLoading(false);
        return false;
      }

      setModelPreviewReady(true);
      setStatus("Building 3D preview...");
      return true;
    } catch (err) {
      setModelPreviewReady(false);
      setModelPreviewLoading(false);
      setError(err instanceof Error ? err.message : "Failed to prepare model preview source.");
      return false;
    }
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
      setModelExporting(true);
      const modelSource = await ensureModelSourcePreview();
      if (!modelSource) {
        setError("Could not prepare the model source image. Compose the preview again.");
        return;
      }
      const blob =
        modelFormat === "stl"
          ? await createTemplateStlBlob(modelSource, stlParams, { compositionExtents })
          : await createTemplateObjBlob(modelSource, stlParams, { compositionExtents });
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
      setError(err instanceof Error ? err.message : "Failed to export 3D model. Check your browser settings or try a different format.");
    } finally {
      setModelExporting(false);
    }
  }

  async function handleSaveQrPng() {
    setError("");
    setStatus("");

    if (!generated) {
      setError("Generate a QR code first.");
      return;
    }

    if (!isPremiumPlan) {
      setError("Saving QR PNG is a Premium feature.");
      if (window.confirm("Saving QR PNG is a Premium feature. Upgrade now?")) {
        if (user) {
          await handleUpgrade();
        } else {
          localStorage.setItem("url-qr-stl.return-to", "/editor");
          history.push("/auth");
        }
      }
      return;
    }

    try {
      const pngDataUrl = await toQrDataUrl(getQrTargetUrl(generated), stlParams.qrType, {
        darkColor: qrForegroundColor,
        lightColor: TRANSPARENT_QR_BACKGROUND,
      });
      const link = document.createElement("a");
      link.href = pngDataUrl;
      link.download = `qr-${generated.code}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setStatus("QR PNG saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save QR code image. Check your browser settings or try again.");
    } finally {
      setSavingPng(false);
    }
  }

  async function handleSaveTemplatePng() {
    setError("");
    setStatus("");

    if (!composedPreviewUrl || !generated) {
      setError("Compose the template + QR preview first.");
      return;
    }

    if (!isPremiumPlan) {
      setError("Saving template PNG is a Premium feature.");
      if (window.confirm("Saving template PNG is a Premium feature. Upgrade now?")) {
        if (user) {
          await handleUpgrade();
        } else {
          localStorage.setItem("url-qr-stl.return-to", "/editor");
          history.push("/auth");
        }
      }
      return;
    }

    try {
      const link = document.createElement("a");
      link.href = composedPreviewUrl;
      link.download = `template-${generated.code}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setStatus("Template PNG saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save template image. Check your browser settings or try again.");
    } finally {
      setSavingPng(false);
    }
  }

  async function handleTemplateColorChange(nextColor: string) {
    if (!isPremiumPlan) {
      setError("Custom template color is a Premium feature.");
      if (window.confirm("Custom template color is a Premium feature. Upgrade now?")) {
        if (user) {
          await handleUpgrade();
        } else {
          localStorage.setItem("url-qr-stl.return-to", "/editor");
          history.push("/auth");
        }
      }
      return;
    }

    setTemplateValues((prev) => ({
      ...prev,
      template_color: nextColor,
    }));
  }

  async function handleSignOut() {
    setAccountPanelOpen(false);
    await signOut();
    history.push("/editor");
  }

  async function handleUpgrade(targetPlan: CheckoutTargetPlan = selectedUpgradePlan) {
    try {
      setAccountPanelOpen(false);
      // For Stripe redirect URLs, always use the actual origin (not BASE_URL subpath)
      const origin = window.location.origin;
      
      const url = await createCheckoutSession(origin, targetPlan);
      
      if (!url) {
        setError("Unable to start checkout. Refresh the page and try again.");
        return;
      }
      
      window.location.href = url;
    } catch (err) {
      setError("Unable to start checkout. Please try again or contact support if the problem persists.");
    }
  }

  async function handleDirectUpgradeSelect(targetPlan: CheckoutTargetPlan) {
    setSelectedUpgradePlan(targetPlan);
    setDirectUpgradeOverlayOpen(false);

    if (!user) {
      localStorage.setItem(PENDING_CHECKOUT_PLAN_KEY, targetPlan);
      localStorage.setItem("url-qr-stl.return-to", "/editor");
      history.push("/auth");
      return;
    }

    await handleUpgrade(targetPlan);
  }

  function toggleAccountPanel() {
    setAccountPanelOpen((current) => !current);
  }

  async function handleRedirectModeToggle(checked: boolean) {
    if (!isPremiumPlan) {
      setError("Direct Link is a Premium feature.");
      setDirectUpgradeOverlayOpen(true);
      setPendingRedirectMode("interstitial");
      return;
    }

    if (!user) {
      setError("Sign in to manage redirect mode.");
      localStorage.setItem("url-qr-stl.return-to", "/editor");
      history.push("/auth");
      return;
    }

    const nextMode: RedirectMode = checked ? "instant" : "interstitial";
    setError("");
    setPendingRedirectMode(nextMode);
    setStatus(
      nextMode === "instant"
        ? "Direct Link preview active. This mode is saved when you move to the next step."
        : "Tracked Redirect preview active. This mode is saved when you move to the next step."
    );
  }

  async function handleTimelineStageSelect(stage: RailStage) {
    setError("");

    if (stage === activeRailStage) {
      return;
    }

    if (stage === "compose" && !qrDataUrl) {
      setError("Generate a QR code first.");
      return;
    }

    if (stage === "render" && !composedPreviewUrl) {
      setError("Compose the template + QR preview first.");
      return;
    }

    if ((stage === "render" || stage === "export") && !modelPreviewReady) {
      const previewReady = await handleGenerateModelPreview();
      if (!previewReady) {
        return;
      }
    }

    await moveToStage(stage);
  }

  async function handleNextRailStage() {
    if (!nextRailStage) {
      return;
    }

    if (nextRailStage.key === "compose" && !qrDataUrl) {
      setError("Generate a QR code first.");
      return;
    }

    if (nextRailStage.key === "compose" && activeRailStage === "import" && DEFAULT_TEMPLATE_ID) {
      setSelectedTemplateId(DEFAULT_TEMPLATE_ID);
    }

    if (nextRailStage.key === "render" && !composedPreviewUrl) {
      setError("Compose the template + QR preview first.");
      return;
    }

    if ((nextRailStage.key === "render" || nextRailStage.key === "export") && !modelPreviewReady) {
      const previewReady = await handleGenerateModelPreview();
      if (!previewReady) {
        return;
      }
    }

    await moveToStage(nextRailStage.key);
  }

  useEffect(() => {
    // Automatically open the emoji picker on desktop
    if (window.innerWidth > 768) { // Example condition for desktop
      openSystemEmojiPicker();
    }
  }, []);

  return (
    <IonPage>
      <IonHeader className="editor-header" ref={(node) => { headerRef.current = node as unknown as HTMLElement | null; }}>
        <IonToolbar className="editor-toolbar">
          <div className="editor-toolbar__inner">
            <div className="editor-toolbar__brand">
              <div className="editor-toolbar__mark">U2S</div>
              <div className="editor-toolbar__brand-copy">
                <div className="editor-toolbar__title-row" onClick={() => history.push('/')} style={{ cursor: 'pointer' }}>
                  <IonIcon icon={openOutline} className="editor-toolbar__icon" />
                  <div className="editor-toolbar__title">URL 2 STL</div>
                  {isPremiumPlan && <span className="editor-toolbar__pro-pill">Pro</span>}
                </div>
                <p className="editor-toolbar__subtitle" onClick={() => history.push('/')} style={{ cursor: 'pointer' }}>Premium QR tags and printable 3D exports for physical links.</p>
              </div>
            </div>
            <div className="editor-toolbar__actions">
              <div className="editor-toolbar__chip-list">
                <span className="toolbar-chip">QR Tag Studio</span>
              </div>
              <button
                type="button"
                className="toolbar-dashboard-btn"
                onClick={() => history.push("/settings")}
                aria-label="Open dashboard"
              >
                <IonIcon icon={barChartOutline} />
                <span>Dashboard</span>
              </button>
              <div className={`toolbar-redirect-control ${canToggleInstantRedirect ? "" : "is-locked"}`}>
                <span className="toolbar-redirect-control__label">Direct</span>
                <IonToggle
                  checked={pendingRedirectMode === "instant"}
                  onIonChange={(e) => {
                    void handleRedirectModeToggle(e.detail.checked);
                  }}
                  aria-label="Direct link toggle"
                />
                <span className="toolbar-redirect-control__state" data-testid="instant-redirect-state">
                  {canToggleInstantRedirect
                    ? hasPendingRedirectSave
                      ? `Pending ${pendingRedirectMode === "instant" ? "On" : "Off"}`
                      : pendingRedirectMode === "instant"
                        ? "On"
                        : "Off"
                    : "Locked"}
                </span>
              </div>
              {user && isPremiumPlan && (
                <IonBadge color="warning" className="toolbar-badge">{planLabel}</IonBadge>
              )}
              <button
                type="button"
                className={`account-trigger ${accountPanelOpen ? "is-open" : ""} ${isPremiumPlan ? "is-premium" : ""}`}
                onClick={toggleAccountPanel}
                aria-label="Open account panel"
                aria-expanded={accountPanelOpen}
              >
                <span className="account-trigger__avatar">
                  {accountInitials}
                  {isPremiumPlan && <IonIcon icon={sparklesOutline} className="account-trigger__premium-star" aria-hidden="true" />}
                </span>
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
        {directUpgradeOverlayOpen && (
          <>
            <div
              className="direct-upgrade-overlay-backdrop is-open"
              onClick={() => setDirectUpgradeOverlayOpen(false)}
              aria-hidden="true"
            />
            <section
              className="direct-upgrade-overlay is-open"
              aria-label="Choose a premium plan for Direct Link"
            >
              <div className="direct-upgrade-overlay__header">
                <div>
                  <p className="direct-upgrade-overlay__kicker">Premium unlock</p>
                  <h3>Direct Link requires Premium</h3>
                </div>
                <button
                  type="button"
                  className="direct-upgrade-overlay__close"
                  onClick={() => setDirectUpgradeOverlayOpen(false)}
                  aria-label="Close premium plans"
                >
                  <IonIcon icon={closeCircleOutline} />
                </button>
              </div>
              <p className="direct-upgrade-overlay__copy">
                Pick a plan to unlock Direct Link routing and premium analytics.
              </p>
              {!!allowedUpgradeTargets.length && (
                <div className="editor-plan-card-grid" role="group" aria-label="Choose a premium plan">
                  {allowedUpgradeTargets.map((target) => (
                    <button
                      type="button"
                      key={target}
                      className="editor-plan-card"
                      onClick={() => {
                        void handleDirectUpgradeSelect(target);
                      }}
                    >
                      <span className="editor-plan-card__name">{getPlanDisplayName(target)}</span>
                      <span className="editor-plan-card__price">{formatPlanPrice(target)}</span>
                      <span className="editor-plan-card__meta">{getPlanMeta(target)}</span>
                    </button>
                  ))}
                </div>
              )}
              {!!getUpgradeCreditLabel(currentPlan, selectedUpgradePlan) && (
                <p className="direct-upgrade-overlay__credit">
                  <strong>Credit:</strong> {getUpgradeCreditLabel(currentPlan, selectedUpgradePlan)}
                </p>
              )}
            </section>
          </>
        )}
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
              <div className="account-stat-card">
                <span>Subscription</span>
                <strong>{isPremiumPlan ? `${planLimits.monthlyScanLimit.toLocaleString()} scans / month` : `${FREE_SCAN_LIMIT} scans per free link`}</strong>
              </div>
              <div className="account-stat-card">
                <span>Active tags</span>
                <strong>{supabaseHistory.length} / {tagLimit}</strong>
              </div>
              {isPremiumPlan && (
                <div className="account-stat-card">
                  <span>Scans this month</span>
                  <strong>{monthlyScans.toLocaleString()} / {planLimits.monthlyScanLimit.toLocaleString()} ({monthlyScanPercent}%)</strong>
                </div>
              )}
              <div className="account-stat-card">
                <span>Premium features</span>
                <strong>{isPremiumPlan ? `${premiumTemplatesCount} templates + Frame QR` : `${premiumTemplatesCount} templates locked`}</strong>
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
              <button type="button" className="account-link" onClick={() => history.push("/settings") }>
                <IonIcon icon={barChartOutline} />
                <span>Dashboard and logos</span>
              </button>
              <button type="button" className="account-link" onClick={() => history.push("/terms")}>
                <IonIcon icon={openOutline} />
                <span>Terms and policies</span>
              </button>
              <button type="button" className="account-link" onClick={() => history.push("/settings")}>
                <IonIcon icon={settingsOutline} />
                <span>Settings and billing</span>
              </button>
            </div>

            <div className="account-drawer__section">
              {user ? (
                <>
                  {!!allowedUpgradeTargets.length && (
                    <>
                      <div className="settings-tag-actions">
                        {allowedUpgradeTargets.map((target) => (
                          <IonButton
                            key={target}
                            size="small"
                            fill={selectedUpgradePlan === target ? "solid" : "outline"}
                            onClick={() => setSelectedUpgradePlan(target)}
                          >
                            {target === "premium_monthly" ? "Monthly" : target === "premium_yearly" ? "Yearly" : "Lifetime"}
                          </IonButton>
                        ))}
                      </div>
                      <IonButton expand="block" onClick={() => void handleUpgrade(selectedUpgradePlan)}>
                        Upgrade - {formatPlanPrice(selectedUpgradePlan)}
                      </IonButton>
                    </>
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
        </aside>

        <div className="editor-layout">
          <section className="editor-hero">
            <div className="editor-hero__content">
              <p className="hero-kicker">Free 3D QR Maker</p>
              <div className="hero-heading-group">
                <h1>Auto-convert any URL into a QR-based 3D model for STL or OBJ printing.</h1>
                <p className="hero-subtitle">One free workspace for QR creation, model render preview, and print-ready conversion exports.</p>
              </div>
              <p className="hero-copy">
                Turn a destination link into a finished QR asset, preview the composed design, and export clean STL or OBJ files ready for 3D print workflows.
              </p>
              <div className="hero-link-row" aria-label="Explore SEO guides">
                <a href="/#/features">Compare features</a>
                <a href="/#/faq">Read conversion FAQ</a>
                <a href="/#/guides">Open maker guides</a>
              </div>
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
            </div>
          </section>

          <div className="workspace-shell">
            <IonCard className="editor-card editor-card--recent">
              <IonCardHeader className="editor-card__recent-header">
                <div className="editor-card__recent-header-row">
                  <IonCardTitle>Your recent QR tags</IonCardTitle>
                  <div className="history-toolbar history-toolbar--header">
                    <IonItem className="editor-item history-search-item history-search-item--compact">
                      <IonInput
                        value={tagSearch}
                        aria-label="Search tags"
                        placeholder="Search by code or URL"
                        onIonInput={(e) => setTagSearch((e.detail.value ?? "").toString())}
                      />
                    </IonItem>
                    <span className="history-count">
                      {supabaseHistory.length > 0
                        ? `${filteredSupabaseHistory.length} of ${supabaseHistory.length}`
                        : `${filteredRecentByUser.length} of ${recentByUser.length}`}
                    </span>
                  </div>
                </div>
              </IonCardHeader>
              <IonCardContent>
                {user && !isPremiumPlan && (
                  <IonCard className="recent-upsell-card" style={{ marginBottom: 12 }}>
                    <IonCardContent className="editor-upsell-shell editor-upsell-shell--recent">
                      <p className="editor-upsell-summary">
                        <strong>Free plan:</strong> {supabaseHistory.length} / {FREE_TAG_LIMIT} tags used. Each link allows {FREE_SCAN_LIMIT} scans.
                      </p>
                      <div className="editor-upsell-row">
                        <div className="editor-upsell-controls">
                          {!!allowedUpgradeTargets.length && (
                            <div className="editor-upsell-picker editor-upsell-picker--inline">
                              {allowedUpgradeTargets.map((target) => (
                                <IonButton
                                  key={target}
                                  size="small"
                                  fill={selectedUpgradePlan === target ? "solid" : "outline"}
                                  onClick={() => setSelectedUpgradePlan(target)}
                                >
                                  {target === "premium_monthly" ? "Monthly" : target === "premium_yearly" ? "Yearly" : "Lifetime"}
                                </IonButton>
                              ))}
                            </div>
                          )}
                          {!!getUpgradeCreditLabel(currentPlan, selectedUpgradePlan) && (
                            <p className="editor-upsell-credit">
                              <strong>Credit:</strong> {getUpgradeCreditLabel(currentPlan, selectedUpgradePlan)}
                            </p>
                          )}
                        </div>
                        <IonButton size="small" className="editor-upsell-cta" onClick={() => void handleUpgrade()}>
                          Upgrade - {formatPlanPrice(selectedUpgradePlan)}
                        </IonButton>
                      </div>
                    </IonCardContent>
                  </IonCard>
                )}
                {supabaseHistory.length > 0 ? (
                  <ul className="history-row">
                    {filteredSupabaseHistory.map((row) => (
                      <li key={row.short_code} className="history-card">
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
                            color={row.scan_count >= FREE_SCAN_LIMIT && !isPremiumPlan ? "danger" : "medium"}
                          >
                            {row.scan_count}/{isPremiumPlan ? "∞" : FREE_SCAN_LIMIT} scans
                          </IonBadge>
                        </button>
                        {user && (
                          <button
                            type="button"
                            className="history-delete-btn"
                            aria-label={`Delete tag ${row.short_code}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm(`Delete tag ${row.short_code}? Existing scan links will stop working.`)) {
                                void handleDeleteTag(row.short_code);
                              }
                            }}
                          >
                            <IonIcon icon={trashOutline} />
                          </button>
                        )}
                      </li>
                    ))}
                    {!filteredSupabaseHistory.length && <li className="history-empty">No matching tags found.</li>}
                  </ul>
                ) : (
                  <ul className="history-row">
                    {filteredRecentByUser.slice(0, 10).map((record) => (
                      <li key={record.id} className="history-card">
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
                    {!recentByUser.length && <li className="history-empty">No tags generated yet.</li>}
                    {!filteredRecentByUser.length && recentByUser.length > 0 && (
                      <li className="history-empty">No matching tags found.</li>
                    )}
                  </ul>
                )}
              </IonCardContent>
            </IonCard>

            <main className="workspace-main">
              <IonCard className="editor-card editor-card--intro">
                <IonCardContent>
                  <div className="workflow-banner">
                    <div>
                      <p className="workflow-banner__eyebrow">Production workflow</p>
                      <h2>Follow the sequence to convert, render, and export with confidence.</h2>
                    </div>
                    <div className="workflow-steps" aria-label="Workflow steps">
                      <span>1. Input URL</span>
                      <span>2. Compose preview</span>
                      <span>3. Export 3D</span>
                    </div>
                  </div>
                </IonCardContent>
              </IonCard>

              <IonCard className="editor-card editor-card--stl">
                <IonCardHeader>
                  <IonCardTitle>Parameters</IonCardTitle>
                </IonCardHeader>
                <IonCardContent>
                  <div className="section-heading-row">
                    <div>
                      <p className="section-kicker">Output settings</p>
                      <h3>Tune the geometry for printability and detail.</h3>
                    </div>
                    <span className="section-state">{dimensionUnitLabel}</span>
                  </div>
                  <div className="stl-grid">
                    <IonItem className="editor-item">
                      <IonLabel position="stacked">Units</IonLabel>
                      <IonSelect
                        value={dimensionUnit}
                        onIonChange={(e) => setDimensionUnit(e.detail.value as DimensionUnit)}
                      >
                        {DIMENSION_UNIT_OPTIONS.map((option) => (
                          <IonSelectOption key={option.value} value={option.value}>{option.label}</IonSelectOption>
                        ))}
                      </IonSelect>
                    </IonItem>
                    <IonItem className="editor-item">
                      <IonLabel position="stacked">Width ({dimensionUnit})</IonLabel>
                      <IonInput
                        type="number"
                        value={formatDimensionValue(stlParams.widthMm, dimensionUnit)}
                        onIonInput={(e) => updateDimensionParam("widthMm", Number(e.detail.value))}
                      />
                    </IonItem>
                    <IonItem className="editor-item">
                      <IonLabel position="stacked">Height ({dimensionUnit})</IonLabel>
                      <IonInput
                        type="number"
                        value={formatDimensionValue(stlParams.heightMm, dimensionUnit)}
                        onIonInput={(e) => updateDimensionParam("heightMm", Number(e.detail.value))}
                      />
                    </IonItem>
                    <IonItem className="editor-item">
                      <IonLabel position="stacked">Depth ({dimensionUnit})</IonLabel>
                      <IonInput
                        type="number"
                        value={formatDimensionValue(stlParams.depthMm, dimensionUnit)}
                        onIonInput={(e) => updateDimensionParam("depthMm", Number(e.detail.value))}
                      />
                    </IonItem>
                    <IonItem className="editor-item">
                      <IonLabel position="stacked">Base ({dimensionUnit})</IonLabel>
                      <IonInput
                        type="number"
                        value={formatDimensionValue(stlParams.baseMm, dimensionUnit)}
                        onIonInput={(e) => updateDimensionParam("baseMm", Number(e.detail.value))}
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

              <IonCard className="editor-card editor-card--pricing">
                <IonCardHeader>
                  <IonCardTitle>Premium Features</IonCardTitle>
                </IonCardHeader>
                <IonCardContent>
                  <div className="premium-compare-grid" role="list" aria-label="Free vs premium features">
                    <div className="premium-compare-col" role="listitem">
                      <p className="premium-compare-col__label">Free</p>
                      <strong>Starter limits</strong>
                      <span>{FREE_TAG_LIMIT} active tags</span>
                      <span>{FREE_SCAN_LIMIT} scans per tag</span>
                      <span>Template locks enabled</span>
                      <span>Tracked redirect with auto-open</span>
                    </div>
                    <div className="premium-compare-col premium-compare-col--premium" role="listitem">
                      <p className="premium-compare-col__label">Premium</p>
                      <strong>Production mode</strong>
                      <span>{planLimits.maxActiveTags} active tags</span>
                      <span>{planLimits.monthlyScanLimit.toLocaleString()} monthly scans</span>
                      <span>{premiumTemplatesCount} premium templates unlocked</span>
                      <span>Direct Link toggle + analytics dashboard</span>
                    </div>
                  </div>
                  <div className="premium-analytics-teaser">
                    <IonIcon icon={statsChartOutline} />
                    <div>
                      <strong>{isPremiumPlan ? "Premium analytics live" : "Premium analytics preview"}</strong>
                      <span>
                        {isPremiumPlan
                          ? `Current usage: ${monthlyScans.toLocaleString()} of ${planLimits.monthlyScanLimit.toLocaleString()} scans this cycle.`
                          : "Upgrade to unlock monthly scan tracking, premium template performance, and redirect conversion visibility."}
                      </span>
                    </div>
                  </div>
                  {!isPremiumPlan && (
                    <div className="editor-upsell-shell editor-upsell-shell--pricing">
                      <div className="editor-upsell-row">
                        <div className="editor-upsell-controls">
                          {!!allowedUpgradeTargets.length && (
                            <div className="editor-plan-card-grid" role="group" aria-label="Choose a premium plan">
                              {allowedUpgradeTargets.map((target) => (
                                <button
                                  type="button"
                                  key={target}
                                  className="editor-plan-card"
                                  onClick={() => {
                                    void handleUpgrade(target);
                                  }}
                                >
                                  <span className="editor-plan-card__name">
                                    {getPlanDisplayName(target)}
                                  </span>
                                  <span className="editor-plan-card__price">{formatPlanPrice(target)}</span>
                                  <span className="editor-plan-card__meta">{getPlanMeta(target)}</span>
                                </button>
                              ))}
                            </div>
                          )}
                          {!!getUpgradeCreditLabel(currentPlan, selectedUpgradePlan) && (
                            <p className="editor-upsell-credit"><strong>Credit:</strong> {getUpgradeCreditLabel(currentPlan, selectedUpgradePlan)}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </IonCardContent>
              </IonCard>

            </main>

            <aside className="workspace-rail">
              <IonCard className="editor-card editor-card--rail editor-card--preview-focus">
                <IonCardContent>
                  <div className="section-heading-row section-heading-row--rail section-heading-row--compact">
                    <span className="section-kicker">Preview</span>
                    <span className="section-state section-state--soft">Live</span>
                  </div>
                  <IonItem className="editor-item qr-type-item">
                    <IonLabel>QR type</IonLabel>
                    <IonSelect
                      value={stlParams.qrType}
                      onIonChange={(e) => {
                        const nextType = e.detail.value as QrCodeType;
                        handleQrTypeChange(nextType);
                      }}
                    >
                      {QR_TYPE_OPTIONS.map((option) => {
                        const unavailableReason = getQrTypeUnavailableReason(option.value);
                        const isPremiumLocked = isPremiumQrType(option.value) && !isPremiumPlan;
                        return (
                          <IonSelectOption key={option.value} value={option.value} disabled={Boolean(unavailableReason) || isPremiumLocked}>
                            {option.label}{isPremiumLocked ? " (Premium)" : ""}
                          </IonSelectOption>
                        );
                      })}
                    </IonSelect>
                  </IonItem>

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
                              void handleTimelineStageSelect(stage.key);
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
                    {(visibleStatus || visibleError) && (
                      <div className="status-overlay" aria-live="polite" aria-atomic="true">
                        {visibleStatus && <IonText color="success"><p className="status-line">{visibleStatus}</p></IonText>}
                        {visibleError && <IonText color="danger"><p className="status-line">{visibleError}</p></IonText>}
                      </div>
                    )}

                    {activeRailStage === "import" && (
                      <>
                        <p className="stage-label">Import URL and auto-generate QR</p>
                        <div className="preview-box stage-preview-box preview-box--import">
                          {generatingQr ? (
                            <div className="model-preview-box__overlay" aria-live="polite" aria-busy="true">
                              <IonSpinner name="crescent" className="model-preview-box__spinner" />
                              <span>Generating QR code...</span>
                            </div>
                          ) : qrDataUrl && !isUrlEditorOpen ? (
                            <>
                              <button
                                type="button"
                                className="preview-corner-edit"
                                onClick={() => {
                                  void moveToStage("import");
                                  setIsUrlEditorOpen(true);
                                }}
                              >
                                Edit URL
                              </button>
                              <span className={`preview-redirect-chip ${pendingRedirectMode === "instant" ? "is-instant" : "is-interstitial"}`}>
                                {pendingRedirectMode === "instant" ? "Direct Link" : "Tracked redirect"}
                              </span>
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
                          <div className="import-tools">
                            <label className="import-color-picker" htmlFor="qr-color-input">
                              <span>QR color</span>
                              <input
                                id="qr-color-input"
                                type="color"
                                value={qrForegroundColor}
                                onChange={(e) => setQrForegroundColor(e.target.value)}
                                aria-label="Pick QR color"
                              />
                              <strong>{qrForegroundColor.toUpperCase()}</strong>
                            </label>
                            {qrDataUrl && (
                              <IonButton
                                className="import-save-btn"
                                fill={isPremiumPlan ? "outline" : "clear"}
                                                                disabled={savingPng}
                                onClick={() => void handleSaveQrPng()}
                              >
                                <IonIcon slot="start" icon={imageOutline} />
                                {savingPng ? "Saving..." : (isPremiumPlan ? "Save QR PNG" : "Save QR PNG (Premium)")}
                              </IonButton>
                            )}
                          </div>
                          {nextRailStage && (
                            <IonButton className="stage-next-btn stage-next-btn--floating stage-next-btn--import" onClick={() => void handleNextRailStage()}>
                              Next: {nextRailStage.label}
                            </IonButton>
                          )}
                        </div>
                      </>
                    )}

                    {activeRailStage === "compose" && (
                      <>
                        <p className="stage-label">Compose template and QR</p>
                        <div className="preview-box stage-preview-box loop-preview-box">
                          {composingPreview ? (
                            <div className="model-preview-box__overlay" aria-live="polite" aria-busy="true">
                              <IonSpinner name="crescent" className="model-preview-box__spinner" />
                              <span>Composing preview...</span>
                            </div>
                          ) : composedPreviewUrl ? (
                            <img src={composedPreviewUrl} alt="Template and QR preview" />
                          ) : (
                            <span>Selecting a template auto-composes the preview once a QR is generated.</span>
                          )}
                          {selectedTemplate.loopConfig && composedPreviewUrl && (
                            <div className="loop-controls-overlay">
                              <p className="loop-controls-title">Controls</p>
                              <label className="loop-slider-label">
                                <span>Loop height</span>
                                <span className="loop-slider-value">{templateValues.loop_outer_radius ?? selectedTemplate.loopConfig.outerRadius}</span>
                              </label>
                              <input
                                type="range" min={8} max={40} step={1}
                                value={Number(templateValues.loop_outer_radius) || selectedTemplate.loopConfig.outerRadius}
                                onChange={(e) => setTemplateValues((prev) => ({ ...prev, loop_outer_radius: e.target.value }))}
                              />
                              <label className="loop-slider-label">
                                <span>Loop width</span>
                                <span className="loop-slider-value">{templateValues.loop_stem_width ?? selectedTemplate.loopConfig.stemWidth}</span>
                              </label>
                              <input
                                type="range" min={16} max={80} step={2}
                                value={Number(templateValues.loop_stem_width) || selectedTemplate.loopConfig.stemWidth}
                                onChange={(e) => setTemplateValues((prev) => ({ ...prev, loop_stem_width: e.target.value }))}
                              />
                              <label className="loop-slider-label">
                                <span>Thickness</span>
                                <span className="loop-slider-value">{templateValues.loop_thickness ?? (selectedTemplate.loopConfig.outerRadius - selectedTemplate.loopConfig.innerRadius)}</span>
                              </label>
                              <input
                                type="range" min={3} max={20} step={1}
                                value={Number(templateValues.loop_thickness) || (selectedTemplate.loopConfig.outerRadius - selectedTemplate.loopConfig.innerRadius)}
                                onChange={(e) => setTemplateValues((prev) => ({ ...prev, loop_thickness: e.target.value }))}
                              />
                              {selectedTemplate.borderStyle !== "none" && (
                                <>
                                  <label className="loop-slider-label" style={{ marginTop: 6 }}>
                                    <span>Border</span>
                                    <span className="loop-slider-value">{templateValues.border_thickness ?? (selectedTemplate.borderStyle === "fancy" ? "8" : "6")}</span>
                                  </label>
                                  <input
                                    type="range" min={1} max={20} step={1}
                                    value={Number(templateValues.border_thickness) || (selectedTemplate.borderStyle === "fancy" ? 8 : 6)}
                                    onChange={(e) => setTemplateValues((prev) => ({ ...prev, border_thickness: e.target.value }))}
                                  />
                                </>
                              )}
                            </div>
                          )}
                          {!selectedTemplate.loopConfig && selectedTemplate.borderStyle !== "none" && composedPreviewUrl && (
                            <div className="loop-controls-overlay">
                              <p className="loop-controls-title">Controls</p>
                              <label className="loop-slider-label">
                                <span>Border thickness</span>
                                <span className="loop-slider-value">{templateValues.border_thickness ?? (selectedTemplate.borderStyle === "fancy" ? "8" : "6")}</span>
                              </label>
                              <input
                                type="range" min={1} max={20} step={1}
                                value={Number(templateValues.border_thickness) || (selectedTemplate.borderStyle === "fancy" ? 8 : 6)}
                                onChange={(e) => setTemplateValues((prev) => ({ ...prev, border_thickness: e.target.value }))}
                              />
                            </div>
                          )}
                          {nextRailStage && (
                            <IonButton className="stage-next-btn stage-next-btn--floating stage-next-btn--compose" onClick={() => void handleNextRailStage()}>
                              Next: {nextRailStage.label}
                            </IonButton>
                          )}
                        </div>
                        {composedPreviewUrl && (
                          <IonButton
                            className="import-save-btn"
                            fill={isPremiumPlan ? "outline" : "clear"}
                            disabled={savingPng}
                            onClick={() => void handleSaveTemplatePng()}
                          >
                            <IonIcon slot="start" icon={imageOutline} />
                            {savingPng ? "Saving..." : (isPremiumPlan ? "Save Template PNG" : "Save Template PNG (Premium)")}
                          </IonButton>
                        )}
                      </>
                    )}

                    {activeRailStage === "render" && (
                      <>
                        <p className="stage-label">Render 3D model preview</p>
                        <div className="preview-box model-preview-box">
                          {modelPreviewReady && generated ? (
                            <>
                              <ModelPreviewCanvas
                                imageDataUrl={modelSourcePreviewUrl || composedPreviewUrl}
                                params={stlParams}
                                compositionExtents={compositionExtents}
                                previewOptions={previewOptions}
                                onPreviewOptionsChange={handlePreviewOptionsChange}
                                onLoadingChange={setModelPreviewLoading}
                              />
                              {modelPreviewLoading && (
                                <div className="model-preview-box__overlay" aria-live="polite" aria-busy="true">
                                  <IonSpinner name="crescent" className="model-preview-box__spinner" />
                                  <span>Building 3D preview...</span>
                                </div>
                              )}
                            </>
                          ) : (
                            <span>Generate model preview to render your 3D tag.</span>
                          )}
                          {nextRailStage && (
                            <IonButton className="stage-next-btn stage-next-btn--floating" onClick={() => void handleNextRailStage()}>
                              Next: {nextRailStage.label}
                            </IonButton>
                          )}
                        </div>
                        <IonItem className="format-item">
                          <IonLabel>Download format</IonLabel>
                          <IonSelect value={modelFormat} onIonChange={(e) => setModelFormat(e.detail.value)}>
                            <IonSelectOption value="stl">STL</IonSelectOption>
                            <IonSelectOption value="obj">OBJ</IonSelectOption>
                          </IonSelect>
                        </IonItem>

                      </>
                    )}

                    {activeRailStage === "export" && (
                      <>
                        <p className="stage-label">Export final model</p>
                        <div className="preview-box model-preview-box">
                          {modelPreviewReady && generated ? (
                            <>
                              <ModelPreviewCanvas
                                imageDataUrl={modelSourcePreviewUrl || composedPreviewUrl}
                                params={stlParams}
                                compositionExtents={compositionExtents}
                                previewOptions={previewOptions}
                                onPreviewOptionsChange={handlePreviewOptionsChange}
                                onLoadingChange={setModelPreviewLoading}
                              />
                              {modelPreviewLoading && (
                                <div className="model-preview-box__overlay" aria-live="polite" aria-busy="true">
                                  <IonSpinner name="crescent" className="model-preview-box__spinner" />
                                  <span>Building 3D preview...</span>
                                </div>
                              )}
                            </>
                          ) : (
                            <span>Complete render to unlock exports.</span>
                          )}
                          <IonButton
                            className="model-preview-mobile-export"
                            color="secondary"
                            disabled={!modelPreviewReady || modelExporting}
                            onClick={handleDownloadModel}
                          >
                            {modelExporting && <IonSpinner name="crescent" slot="start" style={{ width: '16px', height: '16px' }} />}
                            {modelExporting ? 'Exporting...' : (user ? `Export ${modelFormat.toUpperCase()}` : "Sign in to export")}
                          </IonButton>
                        </div>
                        <IonItem className="format-item">
                          <IonLabel>Download format</IonLabel>
                          <IonSelect value={modelFormat} onIonChange={(e) => setModelFormat(e.detail.value)}>
                            <IonSelectOption value="stl">STL</IonSelectOption>
                            <IonSelectOption value="obj">OBJ</IonSelectOption>
                          </IonSelect>
                        </IonItem>

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
                        const isLocked = Boolean(preset.premiumOnly && !isPremiumPlan);
                        return (
                          <div key={preset.id} className="template-option" role="listitem">
                            <button
                              type="button"
                              className={`template-button ${isActive ? "is-active" : ""} ${isLocked ? "is-locked" : ""}`}
                              style={{
                                borderColor: isActive ? preset.accentColor : "#c7d1dd",
                                background: isActive ? "#f8fbff" : "#ffffff",
                              }}
                              onClick={() => handleTemplateSelection(preset.id, preset.premiumOnly)}
                              aria-label={`Select template ${preset.name}`}
                            >
                              {preset.premiumOnly && <span className="template-lock-badge">Premium</span>}
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
                          <>
                            <IonItem className="editor-item">
                              <IonLabel position="stacked">Font</IonLabel>
                              <IonSelect
                                value={templateValues[selectedTemplate.ctaConfig.fontKey] ?? "default"}
                                onIonChange={(e) =>
                                  setTemplateValues((prev) => ({
                                    ...prev,
                                    [selectedTemplate.ctaConfig!.fontKey]: String(e.detail.value),
                                  }))
                                }
                              >
                                {Object.entries(CTA_FONT_OPTIONS).map(([key, label]) => (
                                  <IonSelectOption key={key} value={key}>{label}</IonSelectOption>
                                ))}
                              </IonSelect>
                            </IonItem>
                            <IonItem className="editor-item">
                              <IonLabel position="stacked">Text size (px)</IonLabel>
                              <IonInput
                                type="number"
                                min={selectedTemplate.ctaConfig.minSizePx * CTA_SIZE_SCALE}
                                max={selectedTemplate.ctaConfig.maxSizePx * CTA_SIZE_SCALE}
                                value={Math.min(
                                  selectedTemplate.ctaConfig.maxSizePx * CTA_SIZE_SCALE,
                                  Math.max(
                                    selectedTemplate.ctaConfig.minSizePx * CTA_SIZE_SCALE,
                                    Number(templateValues[selectedTemplate.ctaConfig.sizeKey])
                                      || selectedTemplate.ctaConfig.defaultSizePx * CTA_SIZE_SCALE
                                  )
                                )}
                                onIonInput={(e) => {
                                  const raw = Number(e.detail.value);
                                  if (!Number.isFinite(raw)) return;
                                  const clamped = Math.min(
                                    selectedTemplate.ctaConfig!.maxSizePx * CTA_SIZE_SCALE,
                                    Math.max(selectedTemplate.ctaConfig!.minSizePx * CTA_SIZE_SCALE, Math.round(raw))
                                  );
                                  setTemplateValues((prev) => ({
                                    ...prev,
                                    [selectedTemplate.ctaConfig!.sizeKey]: String(clamped),
                                  }));
                                }}
                              />
                            </IonItem>
                            <IonItem className="editor-item" lines="none">
                              <IonLabel position="stacked">Bar height (px)</IonLabel>
                              <IonInput
                                type="number"
                                min={24}
                                max={120}
                                value={Number(templateValues[selectedTemplate.ctaConfig.chipHeightKey]) || selectedTemplate.ctaConfig.chipHeight}
                                onIonInput={(e) => {
                                  const raw = Number(e.detail.value);
                                  if (!Number.isFinite(raw) || raw <= 0) return;
                                  const clamped = Math.min(120, Math.max(24, Math.round(raw)));
                                  setTemplateValues((prev) => ({
                                    ...prev,
                                    [selectedTemplate.ctaConfig!.chipHeightKey]: String(clamped),
                                  }));
                                }}
                              />
                            </IonItem>
                          </>
                        ) : null}
                      </div>
                    ) : (
                      <IonText color="medium">
                        <p className="template-empty-note">No text fields for this template. Pick the border style you want and generate the QR.</p>
                      </IonText>
                    )}

                    <label
                      className={`import-color-picker ${isPremiumPlan ? "" : "import-color-picker--locked"}`}
                      htmlFor="template-color-input"
                      title={isPremiumPlan ? "" : "Premium required to customize template color."}
                    >
                      <span>{isPremiumPlan ? "Template color" : "Template color (Premium)"}</span>
                      <input
                        id="template-color-input"
                        type="color"
                        value={templateValues.template_color ?? selectedTemplate.accentColor}
                        onChange={(e) => {
                          void handleTemplateColorChange(e.target.value);
                        }}
                        aria-label="Pick template color"
                      />
                      <strong>{templateForegroundColor}</strong>
                    </label>
                    {!isPremiumPlan && (
                      <p className="template-color-lock-hint">Upgrade to unlock custom template color controls.</p>
                    )}

                    {isFrameQr && (
                      <div className="frame-logo-panel">
                        <div className="frame-logo-panel__head">
                          <div>
                            <p className="frame-logo-panel__label">Frame QR logo</p>
                            <h4>Default emoji logo with optional premium uploads</h4>
                          </div>
                          <span className="frame-logo-meter">{selectedEmoji}</span>
                        </div>
                        <div className="frame-emoji-row">
                          <div className="frame-emoji-picker" role="group" aria-label="Default emoji logo selection">
                            <p className="frame-emoji-picker__title">Default emoji</p>
                            <p className="frame-emoji-picker__hint">Tap/click the logo preview to open your system emoji picker.</p>
                            <input
                              ref={emojiInputRef}
                              className="frame-emoji-input"
                              type="text"
                              value={selectedEmoji}
                              maxLength={16}
                              autoComplete="off"
                              spellCheck={false}
                              aria-label="Choose default emoji"
                              onInput={(e) => {
                                handleEmojiInput((e.target as HTMLInputElement).value);
                              }}
                            />
                          </div>
                          <button
                            type="button"
                            className="frame-emoji-preview"
                            aria-label="Choose emoji"
                            onClick={toggleEmojiPicker}
                          >
                            {frameLogoPreviewUrl ? <img src={frameLogoPreviewUrl} alt={`Emoji logo ${selectedEmoji}`} /> : <span>{selectedEmoji}</span>}
                            <span className="frame-emoji-preview__edit">
                              <IonIcon icon={createOutline} />
                            </span>
                          </button>
                          {isEmojiPickerOpen && (
                            <div className="emoji-picker-container">
                              <EmojiPicker onEmojiClick={handleEmojiClick} />
                            </div>
                          )}
                        </div>
                        <p className="frame-logo-hint">This emoji is converted into a simplified monochrome logo. Default is 🌊.</p>
                        {!isPremiumPlan ? (
                          <div className="frame-logo-lock">
                            <IonIcon icon={diamondOutline} />
                            <p>Custom uploaded logos are premium-only. Emoji logos work for all Frame QR tags.</p>
                            <IonButton size="small" onClick={() => void handleUpgrade()}>Upgrade</IonButton>
                          </div>
                        ) : (
                          <>
                            <p className="frame-logo-hint">Uploaded logo library: {userLogos.length}/{logoLimit}</p>
                            <div className="frame-logo-actions">
                              <IonButton
                                fill="outline"
                                size="small"
                                disabled={logoUploadBusy || userLogos.length >= logoLimit}
                                onClick={() => logoInputRef.current?.click()}
                              >
                                <IonIcon slot="start" icon={addOutline} />
                                {logoUploadBusy ? "Uploading..." : "Upload logo"}
                              </IonButton>
                              <IonButton
                                fill="clear"
                                size="small"
                                disabled={!selectedLogoId}
                                onClick={() => setSelectedLogoId(null)}
                              >
                                <IonIcon slot="start" icon={closeCircleOutline} />
                                Use default
                              </IonButton>
                            </div>
                            <input
                              ref={logoInputRef}
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              style={{ display: "none" }}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  void handleUploadLogo(file);
                                }
                                e.currentTarget.value = "";
                              }}
                            />
                            <p className="frame-logo-hint">
                              PNG/JPG/WebP only, max 1 MB, dimensions 64px to 1024px. {logoSlotsRemaining} slots remaining.
                            </p>
                            <div className="frame-logo-grid" aria-label="Saved logos">
                              {logosLoading && <span className="frame-logo-empty">Loading logos...</span>}
                              {!logosLoading && !userLogos.length && (
                                <span className="frame-logo-empty">No logos yet. Upload one to start.</span>
                              )}
                              {userLogos.map((logo) => {
                                const isActive = selectedLogoId === logo.id || (!selectedLogoId && logo.is_default);
                                return (
                                  <div key={logo.id} className={`frame-logo-item ${isActive ? "is-active" : ""}`}>
                                    <button
                                      type="button"
                                      className="frame-logo-select"
                                      onClick={() => setSelectedLogoId(logo.id)}
                                      aria-label="Select logo for this tag"
                                    >
                                      <img src={logo.public_url} alt="Saved logo" />
                                    </button>
                                    <div className="frame-logo-item__actions">
                                      <IonButton
                                        fill="clear"
                                        size="small"
                                        disabled={logo.is_default}
                                        onClick={() => void handleSetDefaultLogo(logo.id)}
                                      >
                                        <IonIcon slot="start" icon={imageOutline} />
                                        {logo.is_default ? "Default" : "Set default"}
                                      </IonButton>
                                      <IonButton
                                        fill="clear"
                                        color="danger"
                                        size="small"
                                        disabled={logoDeleteBusyId === logo.id}
                                        onClick={() => void handleDeleteLogo(logo.id)}
                                      >
                                        <IonIcon slot="start" icon={trashOutline} />
                                        Remove
                                      </IonButton>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  <IonText>
                    <p className="short-url-line">
                      {generated?.shortUrl ?? "Generate to create a short URL"}
                      {generated?.shortUrl && (
                        <button
                          type="button"
                          className="short-url-copy-btn"
                          onClick={() => {
                            void navigator.clipboard.writeText(generated.shortUrl);
                            setStatus("Short URL copied.");
                          }}
                        >
                          <IonIcon icon={copyOutline} />
                          Copy
                        </button>
                      )}
                    </p>
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
