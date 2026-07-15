import { t } from "../lib/i18n";
import { Skeleton } from "./shadcn/skeleton";

const CARDS = ["one", "two", "three", "four", "five", "six"] as const;

/** Loading silhouette for the embedded gallery. Keep it structural: the real
 * gallery remains responsible for its content once the iframe is ready. */
export function GallerySkeleton() {
  return (
    <div
      className="atelier-skeleton"
      data-testid="gallery-skeleton"
      role="status"
      aria-live="polite"
      aria-label={t("atelier.loading")}
    >
      <div className="gallery-skeleton-toolbar" aria-hidden="true">
        <Skeleton className="gallery-skeleton-brand" />
        <div className="gallery-skeleton-actions">
          <Skeleton className="gallery-skeleton-search" />
          <Skeleton className="gallery-skeleton-action" />
          <Skeleton className="gallery-skeleton-action gallery-skeleton-action-short" />
        </div>
      </div>

      <div className="gallery-skeleton-subbar" aria-hidden="true">
        <Skeleton className="gallery-skeleton-tab gallery-skeleton-tab-active" />
        <Skeleton className="gallery-skeleton-tab" />
        <Skeleton className="gallery-skeleton-tab gallery-skeleton-tab-short" />
        <span className="gallery-skeleton-spacer" />
        <Skeleton className="gallery-skeleton-filter" />
        <Skeleton className="gallery-skeleton-filter gallery-skeleton-filter-short" />
      </div>

      <div className="gallery-skeleton-content" aria-hidden="true">
        <div className="gallery-skeleton-heading">
          <Skeleton className="gallery-skeleton-title" />
          <Skeleton className="gallery-skeleton-count" />
        </div>
        <div className="gallery-skeleton-grid">
          {CARDS.map((card) => (
            <Skeleton key={card} className="gallery-skeleton-card" />
          ))}
        </div>
      </div>

      <div className="atelier-skeleton-text">{t("atelier.loading")}</div>
    </div>
  );
}
