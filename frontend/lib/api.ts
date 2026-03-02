import axios, { AxiosRequestConfig, AxiosResponse } from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// --- In-memory GET cache with TTL ---
const _cache = new Map<string, { data: AxiosResponse; ts: number }>();
const _inflight = new Map<string, Promise<AxiosResponse>>();
const CACHE_TTL = 15_000; // 15s default

function _cacheKey(config: AxiosRequestConfig): string | null {
  if (config.method && config.method.toLowerCase() !== "get") return null;
  return `${config.baseURL || ""}${config.url}${JSON.stringify(config.params || {})}`;
}

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
  timeout: 30_000,
});

api.interceptors.request.use(
  (config) => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("access_token");
      if (token) config.headers.Authorization = `Bearer ${token}`;
    }
    if (config.data instanceof FormData) delete config.headers["Content-Type"];
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    // Retry once on 5xx (not on auth errors)
    if (error.response?.status >= 500 && !config._retried) {
      config._retried = true;
      await new Promise((r) => setTimeout(r, 1000));
      return api(config);
    }
    if (error.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("access_token");
      document.cookie = "access_token=; path=/; max-age=0; SameSite=Lax";
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

// Wrap api.get with caching & request deduplication
const _originalGet = api.get.bind(api);
api.get = function cachedGet<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
  const key = `${API_URL}${url}${JSON.stringify(config?.params || {})}`;
  // Skip cache for blob downloads
  if (config?.responseType === "blob") return _originalGet<T>(url, config);
  // Return cached if fresh
  const cached = _cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return Promise.resolve(cached.data as AxiosResponse<T>);
  // Deduplicate in-flight identical requests
  const existing = _inflight.get(key);
  if (existing) return existing as Promise<AxiosResponse<T>>;
  const promise = _originalGet<T>(url, config).then((res) => {
    _cache.set(key, { data: res, ts: Date.now() });
    _inflight.delete(key);
    // Evict old entries if cache grows too large
    if (_cache.size > 200) {
      const now = Date.now();
      for (const [k, v] of _cache) { if (now - v.ts > CACHE_TTL) _cache.delete(k); }
    }
    return res;
  }).catch((err) => { _inflight.delete(key); throw err; });
  _inflight.set(key, promise);
  return promise;
} as typeof api.get;

/** Invalidate cache entries matching a URL prefix */
export function invalidateCache(urlPrefix?: string) {
  if (!urlPrefix) { _cache.clear(); return; }
  for (const key of _cache.keys()) {
    if (key.includes(urlPrefix)) _cache.delete(key);
  }
}

export default api;
