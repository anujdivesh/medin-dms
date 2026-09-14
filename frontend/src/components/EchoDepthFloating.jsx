import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { X, Fish as FishSymbol } from 'lucide-react'
import OllamaQuickTest from '@/components/OllamaQuickTest'

function EchoDepthFloating() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handleOpen = () => setOpen(true)
    const handleClose = () => setOpen(false)
    window.addEventListener('echoDepth:open', handleOpen)
    window.addEventListener('echoDepth:close', handleClose)
    return () => {
      window.removeEventListener('echoDepth:open', handleOpen)
      window.removeEventListener('echoDepth:close', handleClose)
    }
  }, [])

  return createPortal(
    <>
      {/* <Button
        variant="outline"
        size="icon"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-2 right-4 z-[100000] rounded-full shadow-md h-12 w-12 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 border"
        aria-label={open ? 'Close EchoDepth' : 'Open EchoDepth'}
      >
        <FishSymbol className="h-6 w-6" />
      </Button>

      <div
        className={
          "fixed bottom-20 right-4 z-[100000] w-[min(92vw,480px)] h-[70vh] origin-bottom-right bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border rounded-lg shadow-xl overflow-hidden flex flex-col transition-all duration-150 " +
          (open ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-95 pointer-events-none")
        }
        role="dialog"
        aria-label="EchoDepth"
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="text-sm font-medium">EchoDepth (Experimental)</div>
          <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-hidden relative">
          <OllamaQuickTest />
        </div>
      </div> */}
    </>,
    document.body
  )
}

export default EchoDepthFloating


