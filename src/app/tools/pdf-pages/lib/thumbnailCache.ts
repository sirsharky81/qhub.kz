/** Page-id keyed thumbnail store — survives pdfBytes updates and React re-renders. */
const store = new Map<string, string>();

export const ThumbnailCache = {
  get(id: string): string | undefined {
    return store.get(id);
  },

  set(id: string, dataUrl: string): void {
    store.set(id, dataUrl);
  },

  has(id: string): boolean {
    return store.has(id);
  },

  delete(id: string): void {
    store.delete(id);
  },

  clear(): void {
    store.clear();
  },

  size(): number {
    return store.size;
  },
};
