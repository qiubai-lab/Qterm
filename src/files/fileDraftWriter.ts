interface Draft { key: string; value: unknown; signature: string }

/** Coalesce edits while a pane write is in flight; explicit flush retries a failed draft. */
export function createFileDraftWriter(write: (key: string, value: unknown) => Promise<unknown>) {
  let saved = "null";
  let pending: Draft | undefined;
  let writing: Promise<void> | undefined;
  async function drain() {
    try {
      while (pending) {
        const next = pending;
        pending = undefined;
        if (saved !== next.signature) {
          try { await write(next.key, next.value); }
          catch (error) { if (pending) continue; throw error; }
          saved = next.signature;
        }
      }
    } finally { writing = undefined; }
  }
  return {
    restore(value: unknown) { saved = JSON.stringify(value); },
    synced(value: unknown) { return !writing && !pending && saved === JSON.stringify(value); },
    save(key: string, value: unknown) {
      pending = { key, value, signature: JSON.stringify(value) };
      writing ??= Promise.resolve().then(drain);
      return writing;
    },
  };
}
