export const DIGIFLAZZ_CREDENTIALS_MISSING_ERROR =
  "Digiflazz username or API key is not configured in Admin Settings.";

export type DigiflazzCategoryIconKey =
  | "smartphone"
  | "zap"
  | "gamepad2"
  | "wifi"
  | "shopping-bag"
  | "dollar-sign"
  | "ticket";

export interface DigiflazzCategorySummary {
  key: string;
  title: string;
  description: string;
  href: string;
  iconKey: DigiflazzCategoryIconKey;
  productCount: number;
  isPriority: boolean;
}

export interface DigiflazzServicesPageData {
  credentialsConfigured: boolean;
  balance: number | null;
  balanceError: string | null;
  apiProductsError: string | null;
  apiProductsWarning: string | null;
  prioritizedCategories: DigiflazzCategorySummary[];
  otherCategories: DigiflazzCategorySummary[];
  totalCategories: number;
  totalActiveProducts: number;
}
