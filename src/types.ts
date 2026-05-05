export type TemplateField = {
  key: string;
  label: string;
  placeholder: string;
  defaultValue: string;
};

export type QrTemplate = {
  id: string;
  name: string;
  description: string;
  frameStyle: "rounded" | "sharp" | "circle";
  accentColor: string;
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
