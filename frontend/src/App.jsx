import { ThemeProvider } from "@/components/theme-provider"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
const baseName = import.meta.env.VITE_BASE_PATH || "/"
import Layout from "@/components/Layout"
import Home from "@/pages/Home"
import { Toaster } from "@/components/ui/sonner"

function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="vite-ui-theme">
      <BrowserRouter basename={baseName === "/" ? undefined : baseName}>
        <Layout>
          <Routes>
            <Route path="/" element={<Navigate to="/Home" replace />} />
            <Route path="/Home" element={<Home />} />
          </Routes>
        </Layout>
      </BrowserRouter>
      <Toaster />
    </ThemeProvider>
  )
}

export default App
