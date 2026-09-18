const configuredApi = (import.meta.env.VITE_API_URL || "/api").replace(/\/+$/, "")

export const API_URL = configuredApi.endsWith("/api")
  ? configuredApi
  : `${configuredApi}/api`

export const ASSET_URL = API_URL.replace(/\/api$/, "")

export function expireAuthentication() {
  try {
    localStorage.removeItem("user")
  } catch {
    // Authentication relies on the server session, not browser storage.
  }

  window.dispatchEvent(new Event("auth-expired"))
}

async function responseError(response) {
  const data = await response.clone().json().catch(() => null)
  const error = new Error(data?.error || `Request failed (${response.status}).`)

  error.status = response.status

  if (response.status === 401) {
    expireAuthentication()
  }

  return error
}

export async function readSession(options = {}) {
  const response = await fetch(`${API_URL}/auth/session`, {
    signal: options.signal,
    credentials: "include",
    cache: "no-store",
  })

  if (!response.ok) {
    throw await responseError(response)
  }

  const data = await response.json()

  if (!data || typeof data !== "object") {
    throw new Error("Invalid session response.")
  }

  return data
}

// Returns a Response like fetch, but includes the session cookie.
// Mutations also obtain the server's current CSRF token.
export async function apiFetch(url, options = {}) {
  const method = (options.method || "GET").toUpperCase()
  const headers = new Headers(options.headers)

  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const session = await readSession({ signal: options.signal })

    if (!session.user) {
      expireAuthentication()

      const error = new Error("Your session expired. Please log in again.")
      error.status = 401

      throw error
    }

    if (typeof session.csrfToken !== "string" || !session.csrfToken) {
      throw new Error("Unable to verify this request. Refresh and try again.")
    }

    headers.set("X-CSRF-Token", session.csrfToken)
  }

  // Let the browser supply the multipart boundary for image uploads.
  if (options.body instanceof FormData) {
    headers.delete("Content-Type")
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: "include",
    cache: "no-store",
  })

  if (!response.ok) {
    throw await responseError(response)
  }

  return response
}