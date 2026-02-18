// BASE_PATH is '' in dev, '/maf-machine' in production
// Derived from Vite's `base` config via import.meta.env.BASE_URL
export const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, '')
