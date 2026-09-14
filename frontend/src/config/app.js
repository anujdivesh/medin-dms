const basePath = (import.meta.env.VITE_BASE_PATH || '/').replace(/\/$/, '') + '/'
const apiDefault = (import.meta.env.VITE_API_BASE_URL || `${basePath}api`);



export const appConfig = {
  // App metadata
  title: "GEM Data Management System",
  description: "A comprehensive data management and metadata system",
  version: "1.0.0",
  
  // App branding
  brand: {
    name: "GEM Data Management System",
    fullName: "GEM Data Management System",
      logo: `${basePath}fordarkmodespclogo.png`, 
  },

  // API configuration
  api: {
    baseURL: apiDefault,
  },
}

// Helper function to get app title
export const getAppTitle = (pageTitle = "") => {
  if (pageTitle) {
    return `${pageTitle} - ${appConfig.title}`
  }
  return appConfig.title
}

// Helper function to get brand name
export const getBrandName = (full = false) => {
  return full ? appConfig.brand.fullName : appConfig.brand.name
} 

// Helper function to get brand logo
export const getBrandLogo = () => { 
  return appConfig.brand.logo;
}

// Helper function to get API base URL
export const getApiBaseURL = () => {
  return appConfig.api.baseURL;
}

// Helper: base path for client-side redirects
export const getBasePath = () => basePath
