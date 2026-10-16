import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SearchError } from "./errors.js";
import { type SearchResultItem, parsePublishedTimestamp } from "./types.js";

export const ZHIPU_SEARCH_MCP_URL = "https://open.bigmodel.cn/api/mcp/web_search_prime/mcp";
const SEARCH_TIMEOUT_MS = 60_000;
const CLEANUP_TIMEOUT_MS = 1_500;

function parseResults(content: unknown, count: number): SearchResultItem[] {
  if (!Array.isArray(content)) {
    throw new SearchError("Zhipu Search MCP returned no search text.");
  }
  const blocks = content.filter(
    (block) => block?.type === "text" && typeof block.text === "string",
  );
  if (!blocks.length) throw new SearchError("Zhipu Search MCP returned no search text.");

  const results: SearchResultItem[] = [];
  for (const block of blocks) {
    let value: unknown = block.text;
    try {
      for (let layer = 0; layer < 2 && typeof value === "string"; layer++) {
        value = JSON.parse(value);
      }
    } catch {
      throw new SearchError("Zhipu Search MCP returned invalid search JSON.");
    }
    if (!Array.isArray(value)) {
      throw new SearchError("Zhipu Search MCP returned an invalid result list.");
    }

    for (const item of value) {
      if (!item || typeof item !== "object" || typeof item.link !== "string") continue;
      let url: URL;
      try {
        url = new URL(item.link);
      } catch {
        continue;
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      const published = parsePublishedTimestamp(
        typeof item.publish_date === "string" ? item.publish_date : undefined,
      );
      results.push({
        url: item.link,
        ...(typeof item.title === "string" && item.title ? { title: item.title } : {}),
        ...(typeof item.content === "string" && item.content ? { content: item.content } : {}),
        time: { ...(published !== undefined ? { published } : {}) },
      });
    }
  }
  return results.slice(0, count);
}

export async function zhipuMcpSearch(
  apiKey: string,
  query: string,
  count: number,
  signal?: AbortSignal,
): Promise<readonly SearchResultItem[]> {
  signal?.throwIfAborted();
  const timeout = AbortSignal.timeout(SEARCH_TIMEOUT_MS);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let failureStatus: number | undefined;
  const transport = new StreamableHTTPClientTransport(new URL(ZHIPU_SEARCH_MCP_URL), {
    requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
    fetch: async (url, init) => {
      if (String(url) !== ZHIPU_SEARCH_MCP_URL) {
        throw new SearchError("Zhipu Search MCP endpoint changed unexpectedly.");
      }
      const cleanup = init?.method === "DELETE";
      const deadline = cleanup ? AbortSignal.timeout(CLEANUP_TIMEOUT_MS) : requestSignal;
      const response = await fetch(url, {
        ...init,
        redirect: "error",
        signal: init?.signal ? AbortSignal.any([init.signal, deadline]) : deadline,
      });
      if (!response.ok && !cleanup && init?.method !== "GET") failureStatus = response.status;
      return response;
    },
    reconnectionOptions: {
      maxRetries: 0,
      initialReconnectionDelay: 1_000,
      maxReconnectionDelay: 1_000,
      reconnectionDelayGrowFactor: 1,
    },
  });
  const client = new Client({ name: "opencode-qsearch", version: "1.0.0" });
  const options = { signal: requestSignal, timeout: SEARCH_TIMEOUT_MS };
  try {
    await client.connect(transport, options);
    let cursor: string | undefined;
    let toolName: string | undefined;
    const cursors = new Set<string>();
    do {
      const page = await client.listTools(cursor ? { cursor } : undefined, options);
      toolName = page.tools.find(
        (tool) => tool.name === "web_search_prime" || tool.name === "webSearchPrime",
      )?.name;
      if (toolName) break;
      cursor = page.nextCursor;
      if (cursor && cursors.has(cursor)) {
        throw new SearchError("Zhipu Search MCP returned a repeated tool cursor.");
      }
      if (cursor) cursors.add(cursor);
    } while (cursor);
    if (!toolName) throw new SearchError("Zhipu Search MCP search tool not found.");

    const result = await client.callTool(
      { name: toolName, arguments: { search_query: query } },
      undefined,
      options,
    );
    if (result.isError) throw new SearchError("Zhipu Search MCP search tool returned an error.");
    return parseResults(result.content, count);
  } catch (error) {
    signal?.throwIfAborted();
    if (timeout.aborted) throw new SearchError("Zhipu Search MCP timed out after 60 seconds.");
    if (error instanceof SearchError) throw error;
    if (failureStatus) {
      throw new SearchError(
        `Zhipu Search MCP HTTP ${failureStatus} request failed.`,
        failureStatus,
        failureStatus === 401 || failureStatus === 403
          ? "Check zhipu.apiKey or ZHIPU_API_KEY and use a BigModel Coding Plan key."
          : failureStatus === 429
            ? "Check your Coding Plan quota and rate limit."
            : undefined,
      );
    }
    // SDK errors can include remote response bodies; keep credentials out of tool output.
    throw new SearchError(
      "Zhipu Search MCP request failed. Check your connection and Coding Plan key.",
    );
  } finally {
    try {
      await transport.terminateSession();
    } catch {
      // Session termination is best-effort and must not replace the search outcome.
    }
    await client.close();
  }
}
