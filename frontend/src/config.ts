export const API_URL = import.meta.env.VITE_API_URL || '/api'
export const API_KEY = import.meta.env.VITE_API_KEY || 'dev-key'
export const WS_URL = import.meta.env.VITE_WS_URL || `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`
