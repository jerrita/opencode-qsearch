import { Plugin } from "@opencode/plugin";
import { braveSearch, resolveBraveApiKey } from "./brave.js";
import { parsePluginOptions } from "./options.js";
import { resolveZhipuApiKey, zhipuSearch } from "./zhipu.js";

async function resolveKeyFromIntegrations(
  ctx: Parameters<Parameters<typeof Plugin.define>[0]["setup"]>[0],
  integrationIDs: string[],
): Promise<string | undefined> {
  for (const id of integrationIDs) {
    try {
      const connection = await ctx.integration.connection.active(id);
      if (!connection) continue;
      const credential = await ctx.integration.connection.resolve(connection);
      if (credential?.type === "key" && credential.key) {
        return credential.key;
      }
    } catch {
      // Integration check is best-effort fallback
    }
  }
  return undefined;
}

export default Plugin.define({
  id: "qsearch",
  async setup(ctx) {
    const config = parsePluginOptions(ctx.options);

    await ctx.integration.transform((editor) => {
      editor.update("brave", (integration) => {
        integration.name = "Brave Search";
      });
      editor.method.update({
        integrationID: "brave",
        method: { type: "key", label: "Brave Search API Key" },
      });
      editor.method.update({
        integrationID: "brave",
        method: {
          type: "env",
          names: ["BRAVE_SEARCH_API_KEY", "BRAVE_API_KEY"],
        },
      });
    });

    await ctx.websearch.transform((editor) => {
      editor.add({
        id: "zhipu",
        name: "Zhipu",
        execute: async (input, context) => {
          const apiKey = await resolveZhipuApiKey(config.zhipu.apiKey, () =>
            resolveKeyFromIntegrations(ctx, ["zhipuai", "zai"]),
          );
          return await zhipuSearch(apiKey, input.query, config.zhipu, context.signal);
        },
      });

      editor.add({
        id: "brave",
        name: "Brave Search",
        execute: async (input, context) => {
          const apiKey = await resolveBraveApiKey(config.brave.apiKey, () =>
            resolveKeyFromIntegrations(ctx, ["brave"]),
          );
          return await braveSearch(apiKey, input.query, config.brave, context.signal);
        },
      });

      if (config.provider) {
        editor.default.set(config.provider);
      }
    });
  },
});
