import axios from 'axios';

// Resolve base URL from environment or fallback to local backend port 8000
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Response interceptor for consistent error extraction
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const errorDetails = {
      message: error.response?.data?.message || error.message || 'Network request failed',
      status: error.response?.status,
      data: error.response?.data,
    };
    return Promise.reject(errorDetails);
  }
);

/**
 * Health Check API Call
 * Calls GET /api/health
 */
export const getHealthStatus = async () => {
  const response = await apiClient.get('/api/health');
  return response.data;
};

export default apiClient;
