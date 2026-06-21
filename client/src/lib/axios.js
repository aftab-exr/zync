import axios from 'axios';

// Algorithm: Environment-Aware Routing
// In development, it targets your local port 4000. 
// In production, it targets the unified domain hosting the app.
const baseURL = import.meta.env.VITE_API_BASE_URL || (
  import.meta.env.MODE === "development"
    ? "http://localhost:4000/api/v1"
    : "https://zync-znty.onrender.com/api/v1"
);

export const api = axios.create({
  baseURL,
  withCredentials: true
});