import { z } from "zod";

const zhipuOptionsSchema = z
  .object({
    apiKey: z.string().min(1).optional(),
    searchEngine: z
      .enum(["search_std", "search_pro", "search_pro_sogou", "search_pro_quark"])
      .optional(),
    count: z.number().int().min(1).max(50).optional(),
    coding: z.boolean().optional(),
  })
  .strict();

const braveOptionsSchema = z
  .object({
    apiKey: z.string().min(1).optional(),
    count: z.number().int().min(1).max(20).optional(),
    country: z.string().min(2).max(5).optional(),
    searchLang: z.string().min(2).max(10).optional(),
    safesearch: z.enum(["off", "moderate", "strict"]).optional(),
    freshness: z.string().min(1).optional(),
  })
  .strict();

export const pluginOptionsSchema = z
  .object({
    provider: z.enum(["zhipu", "brave"]).optional(),
    zhipu: zhipuOptionsSchema.optional(),
    brave: braveOptionsSchema.optional(),
  })
  .strict();

export type PluginConfig = {
  provider?: "zhipu" | "brave";
  zhipu: {
    apiKey?: string;
    searchEngine: "search_std" | "search_pro" | "search_pro_sogou" | "search_pro_quark";
    count?: number;
    coding: boolean;
  };
  brave: {
    apiKey?: string;
    count?: number;
    country?: string;
    searchLang?: string;
    safesearch?: "off" | "moderate" | "strict";
    freshness?: string;
  };
};

export function parsePluginOptions(options: unknown): PluginConfig {
  const parsed = pluginOptionsSchema.parse(options ?? {});
  return {
    provider: parsed.provider,
    zhipu: {
      apiKey: parsed.zhipu?.apiKey,
      searchEngine: parsed.zhipu?.searchEngine ?? "search_std",
      count: parsed.zhipu?.count,
      coding: parsed.zhipu?.coding ?? false,
    },
    brave: {
      apiKey: parsed.brave?.apiKey,
      count: parsed.brave?.count,
      country: parsed.brave?.country,
      searchLang: parsed.brave?.searchLang,
      safesearch: parsed.brave?.safesearch,
      freshness: parsed.brave?.freshness,
    },
  };
}

export function resolveEnvTemplate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = value.match(/^\{env:([A-Za-z_][A-Za-z0-9_]*)\}$/);
  if (!match) return value;
  return process.env[match[1]];
}
