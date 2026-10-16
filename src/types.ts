export type SearchResultItem = {
  url: string;
  title?: string;
  content?: string;
  time: {
    published?: number;
  };
};

export function parsePublishedTimestamp(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return undefined;
}
