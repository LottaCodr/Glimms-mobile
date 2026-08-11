
import { customFetch } from "./api";

export async function register(payload: { email: string; password: string; }) {
    return customFetch("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
}

export async function login(payload: { email: string; password: string }) {
    return customFetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
}
