export function apiUrl(path: string) {
  return path;
}

export function apiFetch(path: string, init?: RequestInit) {
  return fetch(path, { ...init, credentials: "include" });
}
