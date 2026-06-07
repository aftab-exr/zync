import axios from 'axios';

// Algorithm: Environment-Aware Routing
// In development, it targets your local port 4000. 
// In production, it targets the unified domain hosting the app.
export const api = axios.create({
  baseURL: import.meta.env.MODE === "development" ? "http://localhost:4000/api/v1" : "/api/v1",
  withCredentials: true
});