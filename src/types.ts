export type TemplateField = {
  key: string;
  label: string;
  placeholder: string;
  defaultValue: string;
};

export type TemplateBorderStyle = "none" | "simple" | "fancy";

export type TemplateLoopConfig = {
  outerRadius: number;
  innerRadius: number;
  stemWidth: number;
  stemHeight: number;
  lift: number;
};

export type TemplateCtaConfig = {
  fieldKey: string;
  sizeKey: string;
  fontKey: string;
  chipHeightKey: string;
  minSizePx: number;
  maxSizePx: number;
  defaultSizePx: number;
  maxLines: number;
  maxWidth: number;
  chipHeight: number;
  chipBottomInset: number;
  chipRadius: number;
  chipPaddingX: number;
};

export type QrTemplate = {
  id: string;
  name: string;
  description: string;
  premiumOnly?: boolean;
  frameStyle: "rounded" | "sharp" | "circle";
  accentColor: string;
  borderStyle: TemplateBorderStyle;
  loopConfig?: TemplateLoopConfig;
  ctaLabel?: string;
  ctaConfig?: TemplateCtaConfig;
  fields: TemplateField[];
};

export type StlParams = {
  widthMm: number;
  heightMm: number;
  depthMm: number;
  baseMm: number;
  detail: "low" | "medium" | "high";
  invert: boolean;
};

export type ModelFormat = "stl" | "obj";

export type ModelExportParams = StlParams & {
  format?: ModelFormat;
};

export type ShortUrlRecord = {
  id: string;
  code: string;
  originalUrl: string;
  shortUrl: string;
  templateId: string;
  templateValues: Record<string, string>;
  userId?: string;
  createdAt: string;
};

export type StlExportRecord = {
  id: string;
  shortCode: string;
  userId: string;
  params: ModelExportParams;
  exportedAt: string;
};

export type Profile = {
  id: string;
  plan: "free" | "premium";
  redirect_mode?: RedirectMode;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_ends_at: string | null;
  monthly_scans: number;
  monthly_reset_at: string | null;
  created_at: string;
};

export type SupabaseShortUrlRow = {
  id: string;
  short_code: string;
  original_url: string;
  scan_count: number;
  created_at: string;
};

export type RedirectMode = "instant" | "interstitial";

export type RecordScanSuccess = {
  original_url: string;
  scan_count: number;
  monthly_scans?: number;
  owner_plan?: "free" | "premium";
  redirect_mode?: RedirectMode;
};

export type RecordScanResult = RecordScanSuccess | { error: string };

export type PremiumAnalyticsDailyPoint = {
  day: string;
  scans: number;
};

export type PremiumAnalyticsTopTag = {
  short_code: string;
  original_url: string;
  scan_count: number;
};

export type PremiumAnalyticsResult = {
  days: number;
  total_scans_in_window: number;
  daily_scans: PremiumAnalyticsDailyPoint[];
  top_tags: PremiumAnalyticsTopTag[];
} | {
  error: string;
};
