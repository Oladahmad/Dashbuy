import type { PlatformFoodCategory } from "./constants";

export type UploadKind = "image" | "pdf" | "docx";

export type SourcePageImage = {
  filename: string;
  mimeType: string;
  buffer: Buffer;
};

export type IngestedMenuUpload = {
  kind: UploadKind;
  originalFilename: string;
  mimeType: string;
  size: number;
  extractedText: string;
  pageImages: SourcePageImage[];
  processingNotes: string[];
};

export type MenuImportWarning = {
  code: string;
  message: string;
  severity: "low" | "medium" | "high";
};

export type MenuImportVariantDraft = {
  id: string;
  name: string;
  size: string | null;
  price: number;
  notes: string | null;
};

export type MenuImportItemDraft = {
  id: string;
  name: string;
  description: string;
  notes: string;
  categoryName: string;
  platformCategory: PlatformFoodCategory;
  foodType: "single" | "combo";
  pricingType: "fixed" | "per_scoop" | "per_unit" | "variant";
  price: number | null;
  unitLabel: string | null;
  variants: MenuImportVariantDraft[];
  comboParts: string[];
  addOns: string[];
  imageUrl: string;
  imageSource: "search" | "generated" | "none";
  sourceConfidence: number;
  duplicateKey: string;
  lowConfidence: boolean;
};

export type MenuImportCategoryDraft = {
  id: string;
  name: string;
  inferred: boolean;
  items: MenuImportItemDraft[];
};

export type MenuImportDraft = {
  sessionId?: string;
  sourceSummary: string;
  categories: MenuImportCategoryDraft[];
  warnings: MenuImportWarning[];
};

export type ParsedMenuItem = {
  name: string;
  description: string;
  notes: string;
  categoryName: string;
  platformCategory: PlatformFoodCategory | null;
  foodType: "single" | "combo";
  pricingType: "fixed" | "per_scoop" | "per_unit" | "variant";
  price: number | null;
  unitLabel: string | null;
  variants: Array<{
    name: string;
    size: string | null;
    price: number;
    notes: string | null;
  }>;
  comboParts: string[];
  addOns: string[];
  sourceConfidence: number;
};

export type ParsedMenuResult = {
  sourceSummary: string;
  items: ParsedMenuItem[];
  warnings: MenuImportWarning[];
};

export type ImageCandidateResult = {
  imageUrl: string;
  source: "search" | "generated";
};
