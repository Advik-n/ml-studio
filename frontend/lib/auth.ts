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
  const formData = new URLSearchParams();
  formData.append("username", username);
  formData.append("password", password);

  const response = await api.post<AuthTokens>("/auth/token", formData, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  const tokens = response.data;
  localStorage.setItem("access_token", tokens.access_token);
  return tokens;
}

export async function register(data: RegisterRequest): Promise<User> {
  const response = await api.post<User>("/auth/register", data);
  return response.data;
}

export async function verifyEmail(email: string, code: string): Promise<void> {
  await api.post("/auth/verify-email", { email, code });
}

export function logout(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem("access_token");
    window.location.href = "/login";
  }
}

export async function getCurrentUser(): Promise<User> {
  const response = await api.get<User>("/auth/me");
  return response.data;
}

export async function changePassword(
  current_password: string,
  new_password: string
): Promise<void> {
  await api.post("/auth/change-password", { current_password, new_password });
}
