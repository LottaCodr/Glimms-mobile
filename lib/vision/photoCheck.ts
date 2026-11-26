/**
 * Checks a photo before it is uploaded, using only what the camera and photo
 * picker report (pixel size, file size). It catches photos the server would
 * reject or detect poorly, without spending an upload or a scan.
 *
 * Blur and darkness are still judged by the server: reading pixels on the
 * phone needs a native image library, which this app does not include yet.
 */

export type PhotoInfo = {
    width?: number | null;
    height?: number | null;
    fileSize?: number | null;
};

export type PhotoIssue = "too_small" | "low_resolution" | "too_narrow" | "too_large";

export type PhotoCheck = {
    /** `block`: the server would reject it. `warn`: usable, results may be poor. */
    severity: "ok" | "warn" | "block";
    issue: PhotoIssue | null;
    message: string | null;
};

/** The server rejects images whose shorter side is below this (MIN_IMAGE_DIMENSION). */
export const MIN_SIDE_PX = 128;
/** Below this, small items in the photo are too few pixels to recognise well. */
export const RECOMMENDED_SIDE_PX = 480;
/** Longer side ÷ shorter side above this is a panorama or a thin strip. */
export const MAX_ASPECT_RATIO = 3;

const OK: PhotoCheck = { severity: "ok", issue: null, message: null };

export function checkPhoto(photo: PhotoInfo, maxBytes?: number): PhotoCheck {
    if (maxBytes && photo.fileSize && photo.fileSize > maxBytes) {
        return {
            severity: "block",
            issue: "too_large",
            message: `That photo is larger than ${Math.round(maxBytes / (1024 * 1024))} MB. Choose a smaller one.`,
        };
    }

    const { width, height } = photo;
    // Size unknown: let the server decide rather than guess.
    if (!width || !height || width <= 0 || height <= 0) return OK;

    const shorter = Math.min(width, height);
    const longer = Math.max(width, height);

    if (shorter < MIN_SIDE_PX) {
        return {
            severity: "block",
            issue: "too_small",
            message: "That photo is too small to analyse. Use a larger one.",
        };
    }
    if (shorter < RECOMMENDED_SIDE_PX) {
        return {
            severity: "warn",
            issue: "low_resolution",
            message: "This photo is low resolution, so some items may be missed.",
        };
    }
    if (longer / shorter > MAX_ASPECT_RATIO) {
        return {
            severity: "warn",
            issue: "too_narrow",
            message: "This photo is very long and narrow, so some items may be missed.",
        };
    }
    return OK;
}
