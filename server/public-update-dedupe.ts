export type DedupePublicUpdate = {
  id: string;
};

function publicUpdateDedupeKey(update: DedupePublicUpdate): string | null {
  const storedMerge = update.id.match(/^gitlab:merge:(\d+):(\d+)$/);
  if (storedMerge) {
    return `gitlab:merge:${storedMerge[1]}:${storedMerge[2]}`;
  }

  const polledMerge = update.id.match(/^gitlab-(\d+)-(\d+)$/);
  if (polledMerge) {
    return `gitlab:merge:${polledMerge[1]}:${polledMerge[2]}`;
  }

  return null;
}

export function dedupePublicUpdates<T extends DedupePublicUpdate>(updates: T[]): T[] {
  const seen = new Set<string>();
  return updates.filter((update) => {
    const key = publicUpdateDedupeKey(update);
    if (!key) {
      return true;
    }

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
