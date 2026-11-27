// Google Identity Services config. Unset VITE_GOOGLE_CLIENT_ID hides Google sign-in.
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ""
export const isGoogleSignInEnabled = Boolean(GOOGLE_CLIENT_ID)
