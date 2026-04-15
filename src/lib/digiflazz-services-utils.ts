"use server";

import {
  fetchDigiflazzProducts,
  type DigiflazzProduct,
} from "@/ai/flows/fetch-digiflazz-products-flow";
import { fetchDigiflazzBalance } from "@/ai/flows/fetch-digiflazz-balance-flow";
import { getAdminSettingsFromDB } from "@/lib/admin-settings-utils";
import { verifyAuth } from "@/app/api/auth/actions";
import {
  DIGIFLAZZ_CREDENTIALS_MISSING_ERROR,
  type DigiflazzCategoryIconKey,
  type DigiflazzCategorySummary,
  type DigiflazzServicesPageData,
} from "@/lib/digiflazz-services-shared";

interface DigiflazzCategoryAccumulator extends DigiflazzCategorySummary {}

async function assertDigiflazzServicesAccess() {
  const { isAuthenticated, user } = await verifyAuth();

  if (!isAuthenticated || !user) {
    throw new Error("Unauthorized");
  }

  const hasAccess =
    user.role === "super_admin" ||
    user.permissions?.includes("all_access") ||
    user.permissions?.includes("layanan_digiflazz");

  if (!hasAccess) {
    throw new Error("Forbidden");
  }
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function getDefaultCategoryIconKey(categoryTitle: string): DigiflazzCategoryIconKey {
  const titleUpper = categoryTitle.toUpperCase();

  if (titleUpper.includes("PULSA")) return "smartphone";
  if (titleUpper.includes("PLN") || titleUpper.includes("TOKEN")) return "zap";
  if (titleUpper.includes("GAME")) return "gamepad2";
  if (titleUpper.includes("PAKET DATA") || titleUpper.includes("DATA")) return "wifi";
  if (titleUpper.includes("E-MONEY")) return "dollar-sign";
  if (titleUpper.includes("TV") || titleUpper.includes("VOUCHER")) return "ticket";

  return "shopping-bag";
}

function getCategorySummarySeed(
  product: DigiflazzProduct
): Omit<DigiflazzCategoryAccumulator, "productCount"> {
  const categoryUpper = product.category.toUpperCase();
  const brandUpper = product.brand.toUpperCase();

  if (brandUpper.includes("PLN") || categoryUpper.includes("TOKEN")) {
    return {
      key: "pln",
      title: "PLN",
      description: "Beli token listrik PLN prabayar dengan mudah.",
      href: "/order/token-listrik",
      iconKey: "zap",
      isPriority: true,
    };
  }

  if (categoryUpper.includes("PULSA")) {
    return {
      key: "pulsa",
      title: "Pulsa",
      description: "Beli pulsa untuk semua operator dengan harga terbaik.",
      href: "/order/pulsa",
      iconKey: "smartphone",
      isPriority: true,
    };
  }

  if (categoryUpper.includes("PAKET DATA") || categoryUpper.includes("DATA")) {
    return {
      key: "paket-data",
      title: "Paket Data",
      description: "Beli paket data internet untuk semua operator.",
      href: "/order/digital-services?category=Paket%20Data",
      iconKey: "wifi",
      isPriority: true,
    };
  }

  if (
    categoryUpper.includes("GAME") ||
    brandUpper.includes("GAME") ||
    categoryUpper.includes("TOPUP") ||
    brandUpper.includes("VOUCHER GAME")
  ) {
    return {
      key: "top-up-games",
      title: "Top Up Games",
      description: "Top up diamond, UC, dan voucher game populer.",
      href: "/order/digital-services?category=Games",
      iconKey: "gamepad2",
      isPriority: true,
    };
  }

  return {
    key: product.category,
    title: product.category,
    description: `Layanan ${product.category} dari Digiflazz.`,
    href: `/order/digital-services?category=${encodeURIComponent(product.category)}`,
    iconKey: getDefaultCategoryIconKey(product.category),
    isPriority: false,
  };
}

function summarizeDigiflazzProducts(products: DigiflazzProduct[]) {
  const activeProducts = products.filter(
    (product) => product.buyer_product_status && product.seller_product_status
  );
  const categories = new Map<string, DigiflazzCategoryAccumulator>();

  for (const product of activeProducts) {
    const summarySeed = getCategorySummarySeed(product);
    const existing = categories.get(summarySeed.key);

    if (existing) {
      existing.productCount += 1;
      continue;
    }

    categories.set(summarySeed.key, {
      ...summarySeed,
      productCount: 1,
    });
  }

  const allCategories = Array.from(categories.values());
  const priorityRank: Record<string, number> = {
    Pulsa: 0,
    PLN: 1,
    "Paket Data": 2,
    "Top Up Games": 3,
  };

  const prioritizedCategories = allCategories
    .filter((category) => category.isPriority)
    .sort((left, right) => {
      const leftRank = priorityRank[left.title] ?? Number.MAX_SAFE_INTEGER;
      const rightRank = priorityRank[right.title] ?? Number.MAX_SAFE_INTEGER;

      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      if (left.productCount !== right.productCount) {
        return right.productCount - left.productCount;
      }

      return left.title.localeCompare(right.title);
    });

  const otherCategories = allCategories
    .filter((category) => !category.isPriority)
    .sort((left, right) => left.title.localeCompare(right.title));

  return {
    prioritizedCategories,
    otherCategories,
    totalCategories: allCategories.length,
    totalActiveProducts: activeProducts.length,
  };
}

async function loadDigiflazzCategoryData(forceRefreshProducts: boolean) {
  try {
    const products = await fetchDigiflazzProducts({
      forceRefresh: forceRefreshProducts,
    });

    return {
      products,
      apiProductsError: null,
      apiProductsWarning: null,
    };
  } catch (error) {
    const refreshErrorMessage = toErrorMessage(
      error,
      "Failed to load product categories from Digiflazz."
    );

    if (!forceRefreshProducts) {
      return {
        products: [] as DigiflazzProduct[],
        apiProductsError: refreshErrorMessage,
        apiProductsWarning: null,
      };
    }

    try {
      const cachedProducts = await fetchDigiflazzProducts({ forceRefresh: false });

      return {
        products: cachedProducts,
        apiProductsError: null,
        apiProductsWarning: `Live refresh failed, showing cached categories. ${refreshErrorMessage}`,
      };
    } catch {
      return {
        products: [] as DigiflazzProduct[],
        apiProductsError: refreshErrorMessage,
        apiProductsWarning: null,
      };
    }
  }
}

export async function getDigiflazzServicesPageData(input?: {
  forceRefreshProducts?: boolean;
}): Promise<DigiflazzServicesPageData> {
  await assertDigiflazzServicesAccess();

  const adminSettings = await getAdminSettingsFromDB();
  const credentialsConfigured = Boolean(
    adminSettings.digiflazzUsername && adminSettings.digiflazzApiKey
  );

  if (!credentialsConfigured) {
    return {
      credentialsConfigured: false,
      balance: null,
      balanceError: DIGIFLAZZ_CREDENTIALS_MISSING_ERROR,
      apiProductsError: DIGIFLAZZ_CREDENTIALS_MISSING_ERROR,
      apiProductsWarning: null,
      prioritizedCategories: [],
      otherCategories: [],
      totalCategories: 0,
      totalActiveProducts: 0,
    };
  }

  const [balanceResult, categoryResult] = await Promise.allSettled([
    fetchDigiflazzBalance(),
    loadDigiflazzCategoryData(Boolean(input?.forceRefreshProducts)),
  ]);

  const balance =
    balanceResult.status === "fulfilled" ? balanceResult.value.balance : null;
  const balanceError =
    balanceResult.status === "fulfilled"
      ? null
      : toErrorMessage(
          balanceResult.reason,
          "Failed to load Digiflazz balance."
        );

  const categoryPayload =
    categoryResult.status === "fulfilled"
      ? categoryResult.value
      : {
          products: [] as DigiflazzProduct[],
          apiProductsError: toErrorMessage(
            categoryResult.reason,
            "Failed to load product categories from Digiflazz."
          ),
          apiProductsWarning: null,
        };

  const summarizedCategories = summarizeDigiflazzProducts(categoryPayload.products);

  return {
    credentialsConfigured: true,
    balance,
    balanceError,
    apiProductsError: categoryPayload.apiProductsError,
    apiProductsWarning: categoryPayload.apiProductsWarning,
    prioritizedCategories: summarizedCategories.prioritizedCategories,
    otherCategories: summarizedCategories.otherCategories,
    totalCategories: summarizedCategories.totalCategories,
    totalActiveProducts: summarizedCategories.totalActiveProducts,
  };
}
