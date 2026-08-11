/**
 * Analytics facade — thin wrapper over the backend /api/analytics endpoints.
 * Prefer this over calling the service directly so event names stay centralized.
 */
import { analyticsService } from "@/services/analytics.service";

export const AnalyticsEvents = {
    ScanUploaded: "scan_uploaded",
    DesignSaved: "design_saved",
    CatalogFiltered: "catalog_filtered",
    Login: "login",
    Register: "register",
    PaywallViewed: "paywall_viewed",
} as const;

export function track(event: string, properties?: Record<string, unknown>): void {
    analyticsService.track(event, properties);
}
