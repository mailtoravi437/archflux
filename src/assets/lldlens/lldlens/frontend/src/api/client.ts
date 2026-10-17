import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

// Attach the JWT to every outgoing request. Token is stored in memory + localStorage
// on login (see features/auth). Never store it in a cookie without HttpOnly/Secure
// flags set server-side if you switch away from the Authorization-header approach.
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("lldlens_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Centralized 401 handling: token expired or invalid -> force re-login rather
// than letting every screen handle this individually.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("lldlens_token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);
