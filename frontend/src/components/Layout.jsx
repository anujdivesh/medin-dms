import { useState, useEffect } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { getBrandName, getBasePath } from "@/config/app"
import { useTheme } from "@/components/theme-provider"
import DynamicBreadcrumb from "@/components/DynamicBreadcrumb"
import { ModeToggle } from "@/components/mode-toggle"
import { useTour } from "@/components/guided-tour"
import { GuidedTourContent } from "@/components/GuidedTour"
import QuickSearch from '@/components/QuickSearch'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Home, HelpCircle } from "lucide-react"

function StartTourSidebarButton() {
  const location = useLocation()
  const navigate = useNavigate()
  const { startTour, stopTour } = useTour()

  return (
    <button
      type="button"
      onClick={() => {
        const begin = () => {
          // Ensure we restart from the first step
          stopTour()
          startTour()
        }

        if (location.pathname.toLowerCase() !== '/home') {
          navigate('/Home')
          // Wait for the first Home step to mount before starting
          let attempts = 0
          const maxAttempts = 40
          const poll = () => {
            attempts += 1
            const firstStepEl = document.querySelector('[data-tour-step="home-search-filters"]')
            if (firstStepEl) {
              begin()
            } else if (attempts < maxAttempts) {
              setTimeout(poll, 100)
            } else {
              // Fallback: start anyway
              begin()
            }
          }
          setTimeout(poll, 200)
        } else {
          begin()
        }
      }}
      className="inline-flex items-center gap-1 text-sm text-white hover:text-white px-2 py-1 rounded-md border border-transparent hover:border-border"
      title="Start guided tour"
    >
      <HelpCircle className="h-4 w-4" />
      <span>Tour</span>
    </button>
  )
}

function Layout({ children }) {
  const [isQuickSearchOpen, setIsQuickSearchOpen] = useState(false)
  const location = useLocation()

  const isHome = location.pathname.toLowerCase() === '/home'

  // Global keyboard shortcut: Ctrl+/ to open quick search
  useEffect(() => {
    const onKeyDown = (e) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const mod = isMac ? e.metaKey : e.ctrlKey
      if (mod && e.key === '/') {
        e.preventDefault()
        setIsQuickSearchOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const { theme } = useTheme()

  // Resolve system theme to actual light/dark if needed
  let resolvedTheme = theme
  if (typeof window !== 'undefined' && theme === 'system') {
    resolvedTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  }

  const logoSrc = `${getBasePath()}fordarkmodespclogo.png`

  return (
    <SidebarProvider>
      <GuidedTourContent>
        <div className="min-h-screen flex w-full overflow-x-hidden">
          <Sidebar>
            <SidebarHeader>
              <div className="flex items-center gap-2 px-0" style={{marginTop:-5}}>
                <Link to="/Home" className="flex items-center">
                  <img
                    src={logoSrc}
                    alt={getBrandName(true)}
                    className="h-24 w-auto object-contain"
                  />
                </Link>
                <div className="h-15 border-l border-white opacity-40" />
                <div className="flex flex-col">
                  <span className="text-sm font-semibold leading-tight">{getBrandName(true)}</span>
                </div>
              </div>
            </SidebarHeader>

            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupLabel>Navigation</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={isHome} tooltip="Home">
                        <Link to="/Home">
                          <Home />
                          <span>Home</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>

            <SidebarFooter>
              <SidebarGroup>
                <SidebarGroupContent>
                  <div className="flex justify-between items-center p-2 gap-2">
                    <ModeToggle />
                    <StartTourSidebarButton />
                  </div>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarFooter>
          </Sidebar>

          <SidebarInset>
            {/* Top bar with breadcrumbs only */}
            <div className={isHome ? 'breadcrumb-header' : 'bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60'}>
              <div className="flex items-center justify-between h-16 px-4">
                <div className="flex items-center gap-4">
                  <SidebarTrigger />
                  <DynamicBreadcrumb />
                </div>
              </div>
            </div>

            {/* Main content area */}
            <main className="flex-1 p-2 min-w-0 overflow-x-hidden">
              {children}
              <QuickSearch open={isQuickSearchOpen} onOpenChange={setIsQuickSearchOpen} />
            </main>
          </SidebarInset>
        </div>
      </GuidedTourContent>
    </SidebarProvider>
  )
}

export default Layout
