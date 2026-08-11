// Custom fetch implementation for API calls

import { ENV } from "@/config/env";

const BASE_URL = ENV.API_URL;

export async function customFetch(
    url: string,
    options: RequestInit = {}
): Promise<any> {
    // Prepend the given url with the base API URL if it is a relative path
    const fullUrl = url.startsWith("http")
        ? url
        : `${BASE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
    try {
        const res = await fetch(fullUrl, options);
        if (!res.ok) {
            const error = await res.json().catch(() => ({}));
            throw { status: res.status, ...error };
        }
        return await res.json();
    } catch (err) {
        // Log error to console for debugging
        console.error("API customFetch error:", err);
        throw err;
    }
}

export async function uploadImages(payload: any) {
    return customFetch(`/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
}

export async function generateStyle(payload: any) {
    return customFetch(`/generate-style`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
}
