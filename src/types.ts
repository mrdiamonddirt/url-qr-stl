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

export type QrCodeType = "standard" | "frame" | "micro" | "rmqr" | "iqr" | "sqrc";

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
  qrType: QrCodeType;
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
  qrType?: QrCodeType;
  frameLogoId?: string | null;
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

export type Plan = "free" | "premium" | "premium_monthly" | "premium_yearly" | "lifetime";
export type PaidPlan = Exclude<Plan, "free">;
export type CheckoutTargetPlan = "premium_monthly" | "premium_yearly" | "lifetime";

export type Profile = {
  id: string;
  plan: Plan;
  billing_cycle?: "none" | "monthly" | "yearly" | "lifetime";
  redirect_mode?: RedirectMode;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_ends_at: string | null;
  cancel_at_period_end?: boolean;
  canceled_at?: string | null;
  lifetime_activated_at?: string | null;
  upgrade_credit_source_plan?: string | null;
  upgrade_credit_amount_cents?: number;
  last_checkout_price_id?: string | null;
  monthly_scans: number;
  monthly_reset_at: string | null;
  created_at: string;
};

export type SupabaseShortUrlRow = {
  id: string;
  short_code: string;
  original_url: string;
  template_id: string | null;
  template_payload: Record<string, string> | null;
  qr_type: QrCodeType;
  frame_logo_id: string | null;
  scan_count: number;
  created_at: string;
};

export type UserLogo = {
  id: string;
  user_id: string;
  storage_path: string;
  mime_type: "image/png" | "image/jpeg" | "image/webp";
  file_size_bytes: number;
  width_px: number;
  height_px: number;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  public_url: string;
};

export type RedirectMode = "instant" | "interstitial";

export type RecordScanSuccess = {
  original_url: string;
  scan_count: number;
  monthly_scans?: number;
  owner_plan?: Plan;
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
