export type AnalyticsEvent =
  | "pdf_upload"
  | "pdf_delete_pages"
  | "pdf_rotate_pages"
  | "pdf_reorder_pages"
  | "pdf_extract_pages"
  | "pdf_merge"
  | "pdf_split"
  | "pdf_download";

export interface EventPayload {
  pageCount?: number;
  fileSize?: number;
  selectedCount?: number;
}

/**
 * Tracks PDF tool usage events. In development logs to console; in production no-op.
 * Replace the body to connect GA4, PostHog, or Umami.
 */
export function trackEvent(event: AnalyticsEvent, payload?: EventPayload): void {
  if (process.env.NODE_ENV === "development") {
    console.log("[analytics]", event, payload ?? {});
  }
}
