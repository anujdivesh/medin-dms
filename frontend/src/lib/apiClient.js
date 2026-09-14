// Plain fetch wrapper used by the public request-data flow.
import { getApiBaseURL } from "@/config/app"

export const apiService = {
  baseURL: getApiBaseURL(),

  request: async (url, options = {}) => {
    const isFormData = options.body instanceof FormData
    const headers = {
      ...(!isFormData && { 'Content-Type': 'application/json' }),
      ...options.headers
    }

    return fetch(`${apiService.baseURL}${url}`, {
      ...options,
      headers
    })
  }
}
