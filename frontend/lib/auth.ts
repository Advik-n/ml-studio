import api from "./api";
import type { User, AuthTokens, LoginRequest, RegisterRequest } from "./types";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export async function login(username: string, password: string): Promise<AuthTokens> {
  const response = await api.post<AuthTokens>("/auth/login", { username, password });

  const tokens = response.data;
  localStorage.setItem("access_token", tokens.access_token);
  // Also set a cookie so middleware can detect the session on the server
  document.cookie = `access_token=${tokens.access_token}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
  return tokens;
}

export async function register(data: RegisterRequest): Promise<User> {
  const response = await api.post<User>("/auth/register", data);
  return response.data;
}

export function logout(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem("access_token");
    // Clear the cookie the middleware reads
    document.cookie = "access_token=; path=/; max-age=0; SameSite=Lax";
    window.location.href = "/login";
  }
}

export async function getCurrentUser(): Promise<User> {
  const response = await api.get<User>("/auth/me");
  return response.data;
}

export async function changePassword(
  current_password: string,
  new_password: string,
  confirm_new_password?: string
): Promise<void> {
  await api.put("/auth/change-password", { current_password, new_password, confirm_new_password: confirm_new_password ?? new_password });
}
