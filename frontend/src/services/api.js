
const API_BASE = "http://localhost:8000/api";

// ==========================================
// COMMON HELPERS
// ==========================================

// Read Django CSRF cookie
function getCookie(name) {
  const cookieValue = `; ${document.cookie}`;
  const parts = cookieValue.split(`; ${name}=`);

  if (parts.length === 2) {
    return decodeURIComponent(parts.pop().split(";").shift());
  }

  return "";
}

// Handle API responses
async function handleResponse(response, fallbackMessage) {
  let result;

  try {
    result = await response.json();
  } catch {
    throw new Error(fallbackMessage);
  }

  if (!response.ok) {
    throw new Error(
      result.message ||
      result.error ||
      result.detail ||
      fallbackMessage
    );
  }

  return result;
}

// Common headers for protected POST requests
function getPostHeaders() {
  return {
    "Content-Type": "application/json",
    "X-CSRFToken": getCookie("csrftoken"),
  };
}

// ==========================================
// DATASET OPERATIONS
// ==========================================

// Upload and analyze a dataset
export async function uploadDataset(file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE}/datasets/upload/`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  return handleResponse(response, "Dataset upload failed.");
}

// Retrieve saved dataset history
export async function getDatasetHistory() {
  const response = await fetch(`${API_BASE}/datasets/history/`, {
    method: "GET",
    credentials: "include",
  });

  const result = await handleResponse(
    response,
    "Unable to load dataset history."
  );

  return result.datasets;
}

// Retrieve dashboard statistics
export async function getDashboardStats() {
  const response = await fetch(`${API_BASE}/datasets/stats/`, {
    method: "GET",
    credentials: "include",
  });

  return handleResponse(
    response,
    "Unable to load dashboard statistics."
  );
}

// Retrieve analytics for a selected dataset
export async function getDatasetAnalytics(datasetId) {
  const response = await fetch(
    `${API_BASE}/datasets/analytics/?dataset_id=${encodeURIComponent(datasetId)}`,
    {
      method: "GET",
      credentials: "include",
    }
  );

  return handleResponse(
    response,
    "Unable to load dataset analytics."
  );
}

// Delete a dataset
export async function deleteDataset(datasetId) {
  const response = await fetch(
    `${API_BASE}/datasets/${encodeURIComponent(datasetId)}/delete/`,
    {
      method: "DELETE",
      credentials: "include",
      headers: {
        "X-CSRFToken": getCookie("csrftoken"),
      },
    }
  );

  return handleResponse(response, "Unable to delete dataset.");
}

// ==========================================
// ADMIN USER MANAGEMENT
// ==========================================

// Get all registered users
export async function getAdminUsers() {
  const response = await fetch(
    `${API_BASE}/auth/admin/users/`,
    {
      method: "GET",
      credentials: "include",
    }
  );

  return handleResponse(
    response,
    "Unable to load registered users."
  );
}

// Update a user's role
export async function updateAdminUserRole(userId, role) {
  const response = await fetch(
    `${API_BASE}/auth/admin/users/${encodeURIComponent(userId)}/role/`,
    {
      method: "POST",
      credentials: "include",
      headers: getPostHeaders(),
      body: JSON.stringify({
        role: role,
      }),
    }
  );

  return handleResponse(
    response,
    "Unable to update user role."
  );
}

// Activate or deactivate a user account
export async function updateAdminUserStatus(userId, isActive) {
  const response = await fetch(
    `${API_BASE}/auth/admin/users/${encodeURIComponent(userId)}/status/`,
    {
      method: "POST",
      credentials: "include",
      headers: getPostHeaders(),
      body: JSON.stringify({
        is_active: isActive,
      }),
    }
  );

  return handleResponse(
    response,
    "Unable to update account status."
  );
}

// ==========================================
// AI DATA ANALYST
// ==========================================

export async function askDatasetAI(datasetId, question) {
  const response = await fetch(
    `${API_BASE}/datasets/ai-analyze/`,
    {
      method: "POST",
      credentials: "include",
      headers: getPostHeaders(),
      body: JSON.stringify({
        dataset_id: datasetId,
        question: question,
      }),
    }
  );

  return handleResponse(
    response,
    "AI dataset analysis failed."
  );
}


export async function getCleaningProfile(datasetId) {
  const response = await fetch(
    `${API_BASE}/datasets/cleaning/profile/`,
    {
      method: "POST",
      credentials: "include",
      headers: getPostHeaders(),
      body: JSON.stringify({ dataset_id: datasetId }),
    }
  );

  return handleResponse(response, "Unable to analyze dataset.");
}

export async function previewDatasetCleaning(datasetId, options) {
  const response = await fetch(
    `${API_BASE}/datasets/cleaning/preview/`,
    {
      method: "POST",
      credentials: "include",
      headers: getPostHeaders(),
      body: JSON.stringify({
        dataset_id: datasetId,
        options,
      }),
    }
  );

  return handleResponse(response, "Unable to preview cleaning.");
}

export async function saveCleanedDataset(datasetId, options) {
  const response = await fetch(
    `${API_BASE}/datasets/cleaning/save/`,
    {
      method: "POST",
      credentials: "include",
      headers: getPostHeaders(),
      body: JSON.stringify({
        dataset_id: datasetId,
        options,
      }),
    }
  );

  return handleResponse(response, "Unable to save cleaned dataset.");
}

export async function exportCleanedDataset(datasetId, options, format = "csv") {
  const response = await fetch(
    `${API_BASE}/datasets/cleaning/export/`,
    {
      method: "POST",
      credentials: "include",
      headers: getPostHeaders(),
      body: JSON.stringify({
        dataset_id: datasetId,
        options,
        format,
      }),
    }
  );

  if (!response.ok) {
    return handleResponse(response, "Unable to export cleaned dataset.");
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `cleaned_dataset.${format === "xls" ? "xlsx" : format}`;
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.URL.revokeObjectURL(url);

  return { success: true };
}

export const generateAIReport = async (datasetId) => {
  const response = await fetch(
    `${API_BASE}/datasets/reports/analyze/`,
    {
      method: "POST",
      credentials: "include",
      headers: getPostHeaders(),
      body: JSON.stringify({
        dataset_id: datasetId,
      }),
    }
  );

  return handleResponse(response);
};
// ==========================================
// ADMIN PLATFORM STATISTICS
// ==========================================

export async function getAdminDashboardStats() {
  const response = await fetch(
    `${API_BASE}/datasets/admin/stats/`,
    {
      method: "GET",
      credentials: "include",
    }
  );

  return handleResponse(
    response,
    "Unable to load admin dashboard statistics."
  );
}
