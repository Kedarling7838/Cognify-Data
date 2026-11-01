
const API_BASE = `${window.location.protocol}//${window.location.hostname}:8000/api/auth`;

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return await response.json();
  }

  throw new Error(
    `Server returned a non-JSON response (${response.status}).`
  );
}

// Get CSRF token
async function getCsrfToken() {
  const response = await fetch(`${API_BASE}/csrf/`, {
    method: "GET",
    credentials: "include",
  });

  const data = await parseResponse(response);

  if (!response.ok || !data.csrfToken) {
    throw new Error("Unable to initialize CSRF authentication.");
  }

  return data.csrfToken;
}

// Common authentication request
async function authRequest(endpoint, payload = null) {
  const csrfToken = await getCsrfToken();

  const response = await fetch(`${API_BASE}/${endpoint}/`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": csrfToken,
    },
    body: JSON.stringify(payload || {}),
  });

  const data = await parseResponse(response);

  if (!response.ok) {
    throw new Error(
      data.message || data.error || "Authentication request failed."
    );
  }

  return data;
}

// Register
export async function registerUser(userData) {
  return authRequest("register", userData);
}

// Login
export async function loginUser(credentials) {
  const result = await authRequest("login", credentials);

  // Verify that Django created a usable session.
  const user = await getCurrentUser();

  if (!user) {
    throw new Error(
      "Login succeeded, but the Django session was not retained. Please check session cookies."
    );
  }

  return {
    ...result,
    user,
  };
}

// Logout
export async function logoutUser() {
  return authRequest("logout");
}

// Get current authenticated user
export async function getCurrentUser() {
  const response = await fetch(`${API_BASE}/me/`, {
    method: "GET",
    credentials: "include",
  });

  if (response.status === 401) {
    return null;
  }

  const data = await parseResponse(response);

  if (!response.ok) {
    throw new Error(
      data.message || "Unable to retrieve user."
    );
  }

  return data.user;
}
