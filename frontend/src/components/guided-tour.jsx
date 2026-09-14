import React, {
  useState,
  useEffect,
  useRef,
  createContext,
  useContext,
  useCallback,
  useMemo,
} from 'react';
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'

const useDisableMouseScroll = (isDisabled) => {
  useEffect(() => {
    if (!isDisabled) return

    const preventMouseScroll = (e) => {
      e.preventDefault()
    }

    window.addEventListener('wheel', preventMouseScroll, { passive: false })
    return () => window.removeEventListener('wheel', preventMouseScroll);
  }, [isDisabled])
}

const TourContext = createContext(null);

// eslint-disable-next-line react-refresh/only-export-components
export const useTour = () => {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error('useTour must be used within a TourProvider');
  }
  return context;
};

const TourOverlay = () => {
  const { isActive, currentStepId, currentStepData } = useTour()
  const [highlightStyle, setHighlightStyle] = useState({})
  const rafRef = useRef(undefined)

  useDisableMouseScroll(isActive)

  const updateHighlight = useCallback(() => {
    if (!isActive || !currentStepId) return

    const stepElement = document.querySelector(`[data-tour-step="${currentStepId}"]`)
    if (!stepElement) return

    const rect = stepElement.getBoundingClientRect()
    const padding = 8

    setHighlightStyle({
      transform: `translate(${rect.left - padding}px, ${rect.top - padding}px)`,
      width: rect.width + padding * 2,
      height: rect.height + padding * 2,
      left: rect.left - padding,
      top: rect.top - padding,
    })
  }, [isActive, currentStepId])

  useEffect(() => {
    if (!isActive || !currentStepId) {
      setHighlightStyle({})
      return
    }

    updateHighlight()

    const handleUpdate = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(updateHighlight)
    }

    window.addEventListener('scroll', handleUpdate, { passive: true })
    window.addEventListener('resize', handleUpdate, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleUpdate)
      window.removeEventListener('resize', handleUpdate)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    };
  }, [isActive, currentStepId, updateHighlight])

  if (!isActive) return null

  // If spotlight is disabled for this step, show a uniform blurred overlay
  if (currentStepData?.spotlight === false) {
    return (
      <div className="fixed inset-0 z-[10003] pointer-events-none">
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm transition-all duration-300 ease-out"
          style={{ zIndex: 10003 }}
        />
      </div>
    )
  }

  if (!highlightStyle.width) return null

  // Create mask to cut out the highlighted area
  const maskStyle = highlightStyle.width ? {
    maskImage: `
      radial-gradient(circle at ${highlightStyle.left + highlightStyle.width / 2}px ${highlightStyle.top + highlightStyle.height / 2}px, transparent ${Math.max(highlightStyle.width, highlightStyle.height) / 2 + 20}px, black ${Math.max(highlightStyle.width, highlightStyle.height) / 2 + 25}px)
    `,
    WebkitMaskImage: `
      radial-gradient(circle at ${highlightStyle.left + highlightStyle.width / 2}px ${highlightStyle.top + highlightStyle.height / 2}px, transparent ${Math.max(highlightStyle.width, highlightStyle.height) / 2 + 20}px, black ${Math.max(highlightStyle.width, highlightStyle.height) / 2 + 25}px)
    `,
  } : {};

  return (
    <div className="fixed inset-0 z-[10003] pointer-events-none">
      {/* Background blur overlay with mask cutout */}
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm transition-all duration-300 ease-out"
        style={{
          zIndex: 10003,
          ...maskStyle,
        }}
      />

      {/* Clean blue border with glow effects */}
      {/* <div
        className="absolute rounded-lg pointer-events-none transition-all duration-300 ease-out"
        style={{
          ...highlightStyle,
          border: '3px solid rgba(59, 130, 246, 1)',
          boxShadow: `
            0 0 0 1px rgba(255, 255, 255, 0.8),
            0 0 20px rgba(59, 130, 246, 0.4)
          `,
          background: 'transparent',
          zIndex: 10002,
        }} />
      <div
        className="absolute rounded-lg pointer-events-none transition-all duration-300 ease-out animate-pulse"
        style={{
          ...highlightStyle,
          border: '2px solid rgba(59, 130, 246, 0.6)',
          background: 'transparent',
          zIndex: 10001,
        }} /> */}
    </div>
  );
}

const GlobalTourPopover = () => {
  const {
    isActive,
    currentStepId,
    currentStepIndex,
    totalSteps,
    nextStep,
    prevStep,
    stopTour,
    currentStepData
  } = useTour()
  const [popoverStyle, setPopoverStyle] = useState({})
  const popoverRef = useRef(null)
  const rafRef = useRef(undefined)

  const updatePosition = useCallback(() => {
    if (!isActive || !currentStepId || !popoverRef.current) return

    const stepElement = document.querySelector(`[data-tour-step="${currentStepId}"]`)
    if (!stepElement) return

    const stepData = currentStepData || {}
    const targetRect = stepElement.getBoundingClientRect()
    const popoverRect = popoverRef.current.getBoundingClientRect()

    const margin = 16
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    let top = targetRect.bottom + margin
    let left = targetRect.left + (targetRect.width / 2) - (popoverRect.width / 2)

    if (stepData.position === 'top') {
      top = targetRect.top - popoverRect.height - margin
    } else if (stepData.position === 'left') {
      top = targetRect.top + (targetRect.height / 2) - (popoverRect.height / 2)
      left = targetRect.left - popoverRect.width - margin
    } else if (stepData.position === 'right') {
      top = targetRect.top + (targetRect.height / 2) - (popoverRect.height / 2)
      left = targetRect.right + margin
    }

    // Apply per-step fine-tune offsets if provided
    if (typeof stepData.offsetX === 'number') left += stepData.offsetX
    if (typeof stepData.offsetY === 'number') top += stepData.offsetY

    top = Math.max(margin, Math.min(top, viewportHeight - popoverRect.height - margin))
    left = Math.max(margin, Math.min(left, viewportWidth - popoverRect.width - margin))

    setPopoverStyle({
      position: 'fixed',
      top,
      left,
      zIndex: 10060,
    })
  }, [isActive, currentStepId, currentStepData])

  useEffect(() => {
    if (!isActive || !currentStepId) {
      setPopoverStyle({})
      return
    }

    const stepElement = document.querySelector(`[data-tour-step="${currentStepId}"]`)
    if (!stepElement) return

    stepElement.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest'
    })

    const handleUpdate = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(updatePosition)
    }

    setTimeout(updatePosition, 100)

    window.addEventListener('scroll', handleUpdate, { passive: true })
    window.addEventListener('resize', handleUpdate, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleUpdate)
      window.removeEventListener('resize', handleUpdate)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    };
  }, [isActive, currentStepId, updatePosition])

  if (!currentStepData) return null

  const isLastStep = currentStepIndex === totalSteps - 1
  const isFirstStep = currentStepIndex === 0

  return (
    <div
      ref={popoverRef}
      className="w-80 transition-all duration-300 ease-out"
      style={popoverStyle}>
      <Card className="border-2 border-primary/20 backdrop-blur-xs shadow-2xl">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Step number hidden by request */}
              <CardTitle className="text-lg">{currentStepData.title}</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={stopTour}
              className="h-6 w-6 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="w-full bg-muted rounded-full h-1.5">
            <div
              className="bg-primary h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${((currentStepIndex + 1) / totalSteps) * 100}%` }} />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <CardDescription className="text-sm leading-relaxed mb-4">
            {currentStepData.content}
          </CardDescription>
          <div className="flex items-center justify-between">
            <div className="flex gap-2 ml-auto">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  try {
                    localStorage.setItem('dms-guided-tour-skip-all', 'true')
                  } catch {
                    // ignore
                  }
                  stopTour()
                }}
                className="text-muted-foreground hover:text-foreground">
                Skip tour
                {/* (don’t show again) */}
              </Button>
              {!isFirstStep && (
                <Button variant="outline" size="sm" onClick={prevStep}>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
              )}
              <Button size="sm" onClick={nextStep}>
                {isLastStep ? 'Finish' : 'Next'}
                {!isLastStep && <ChevronRight className="h-4 w-4 ml-1" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export const TourProvider = ({
  children,
  autoStart = false,
  ranOnce = true,
  storageKey = 'rigidui-tour-completed',
  shouldStart = true,
  onTourComplete,
  onTourSkip
}) => {
  const [steps, setSteps] = useState(new Map());
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [activeSteps, setActiveSteps] = useState([]);
  const [hasAutoStarted, setHasAutoStarted] = useState(false);

  const registerStep = useCallback((stepConfig, element) => {
    setSteps(prev => {
      const newSteps = new Map(prev);
      newSteps.set(stepConfig.id, { ...stepConfig, element });
      return newSteps;
    });
  }, []);

  const unregisterStep = useCallback((id) => {
    setSteps(prev => {
      const newSteps = new Map(prev);
      newSteps.delete(id);
      return newSteps;
    });
  }, []);

  useEffect(() => {
    if (autoStart && !hasAutoStarted && steps.size > 0 && shouldStart) {
      const tourCompleted = ranOnce ? localStorage.getItem(storageKey) === 'true' : false;

      if (!tourCompleted) {
        const timer = setTimeout(() => {
          const filteredSteps = Array.from(steps.values())
            .sort((a, b) => a.order - b.order);

          if (filteredSteps.length > 0) {
            setActiveSteps(filteredSteps);
            setCurrentStep(0);
            setIsActive(true);
          }
          setHasAutoStarted(true);
        }, 500);
        return () => clearTimeout(timer);
      } else {
        setHasAutoStarted(true);
      }
    }
  }, [autoStart, hasAutoStarted, steps, ranOnce, storageKey, shouldStart]);

  // Include steps that register after start (e.g., content mounted later like tabs)
  useEffect(() => {
    if (!isActive) return;
    const sorted = Array.from(steps.values()).sort((a, b) => a.order - b.order);
    const changed = sorted.length !== activeSteps.length || sorted.some((s, i) => activeSteps[i]?.id !== s.id);
    if (changed) {
      const currentId = activeSteps[currentStep]?.id || null;
      setActiveSteps(sorted);
      if (currentId) {
        const idx = sorted.findIndex(s => s.id === currentId);
        if (idx >= 0) setCurrentStep(idx);
      }
    }
  }, [steps, isActive, activeSteps, currentStep]);

  const startTour = useCallback(() => {
    const filteredSteps = Array.from(steps.values())
      .sort((a, b) => a.order - b.order)

    if (filteredSteps.length > 0) {
      setActiveSteps(filteredSteps)
      setCurrentStep(0)
      setIsActive(true)
    }
  }, [steps])

  const stopTour = useCallback((completed = false) => {
    const wasActive = isActive

    setIsActive(false)
    setCurrentStep(0)
    setActiveSteps([])

    if (wasActive) {
      if (completed) {
        if (ranOnce) {
          localStorage.setItem(storageKey, 'true')
        }
        onTourComplete?.()
        window.dispatchEvent(new CustomEvent('tourCompleted', { detail: { storageKey } }))
        // Close chatbot if open when finishing the tour
        window.dispatchEvent(new Event('echoDepth:close'))
      } else if (!completed) {
        onTourSkip?.()
      }
    }
  }, [isActive, ranOnce, storageKey, onTourComplete, onTourSkip])

  const nextStep = useCallback(() => {
    const current = activeSteps[currentStep]
    // If leaving the chatbot step, close the chatbot before advancing
    if (current?.id === 'home-chatbot') {
      window.dispatchEvent(new Event('echoDepth:close'))
    }

    if (currentStep < activeSteps.length - 1) {
      setCurrentStep(prev => prev + 1)
    } else {
      stopTour(true)
    }
  }, [currentStep, activeSteps, stopTour])

  const prevStep = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1)
    }
  }, [currentStep])

  const resetTourCompletion = useCallback(() => {
    if (ranOnce) {
      localStorage.removeItem(storageKey)
      setHasAutoStarted(false)
      window.dispatchEvent(new CustomEvent('tourReset', { detail: { storageKey } }))
    }
  }, [ranOnce, storageKey])

  const contextValue = useMemo(() => ({
    registerStep,
    unregisterStep,
    startTour,
    stopTour: () => stopTour(false),
    nextStep,
    prevStep,
    resetTourCompletion,
    isActive,
    currentStepId: activeSteps[currentStep]?.id || null,
    currentStepIndex: currentStep,
    totalSteps: activeSteps.length,
    currentStepData: activeSteps[currentStep] || null
  }), [
    registerStep,
    unregisterStep,
    startTour,
    stopTour,
    nextStep,
    prevStep,
    resetTourCompletion,
    isActive,
    activeSteps,
    currentStep
  ])

  return (
    <TourContext.Provider value={contextValue}>
      {children}
      <TourOverlay />
      <GlobalTourPopover />
    </TourContext.Provider>
  );
}

const TourStepComponent = ({ children, id, title, content, order, position, className = '', autoClick = false, autoClickDelayMs = 400, spotlight = true, offsetX = 0, offsetY = 0, emphasize = true, highlightRing = false }) => {
  const { registerStep, unregisterStep, isActive, currentStepId } = useTour()
  const elementRef = useRef(null)

  // Memoize a stable config that excludes changing React nodes to avoid effect loops
  const baseConfig = useMemo(
    () => ({ id, title, order, position, spotlight, offsetX, offsetY, emphasize, highlightRing }),
    [id, title, order, position, spotlight, offsetX, offsetY, emphasize, highlightRing]
  )

  useEffect(() => {
    if (elementRef.current) {
      // Register once with current content; omit content from deps to prevent render loops
      registerStep({ ...baseConfig, content }, elementRef.current)
    }
    return () => unregisterStep(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseConfig, registerStep, unregisterStep, id])

  const isCurrentStep = isActive && currentStepId === id

  useEffect(() => {
    if (!isCurrentStep || !autoClick) return
    const timer = setTimeout(() => {
      // Special case: open chatbot if this is the chatbot step
      if (id === 'home-chatbot') {
        window.dispatchEvent(new Event('echoDepth:open'))
        return
      }
      const clickable = elementRef.current?.querySelector('a,button,[role="button"],*[data-clickable="true"]') || elementRef.current
      clickable?.click?.()
    }, autoClickDelayMs)
    return () => clearTimeout(timer)
  }, [isCurrentStep, autoClick, autoClickDelayMs, id])

  return (
    <div
      ref={elementRef}
      data-tour-step={id}
      className={
        (isCurrentStep ? "relative z-[10060] transition-all duration-300 " : "relative transition-all duration-300 ") +
        (isCurrentStep && highlightRing ? " ring-2 ring-primary ring-offset-2 " : " ") +
        className
      }
      style={{
        transform: isCurrentStep && emphasize ? 'translateZ(60px) scale(1.05)' : 'translateZ(0) scale(1)',
        transformStyle: 'preserve-3d',
        boxShadow: isCurrentStep && emphasize ? '0 10px 30px rgba(0, 0, 0, 0.3), 0 5px 15px rgba(0, 0, 0, 0.2)' : 'none',
      }}
    >
      {children}
    </div>
  );
}

export const TourStep = React.memo(TourStepComponent)

export const TourTrigger = ({ children, className, hideAfterComplete = false, storageKey = 'rigidui-tour-completed' }) => {
  const { startTour } = useTour()
  const [tourCompleted, setTourCompleted] = useState(() =>
    hideAfterComplete ? localStorage.getItem(storageKey) === 'true' : false)

  useEffect(() => {
    if (!hideAfterComplete) return

    const handleTourComplete = (event) => {
      const customEvent = event
      const eventStorageKey = customEvent.detail?.storageKey || 'rigidui-tour-completed'
      if (eventStorageKey === storageKey) {
        localStorage.setItem(storageKey, 'true')
        setTourCompleted(true)
      }
    }

    const handleTourReset = (event) => {
      const customEvent = event
      const eventStorageKey = customEvent.detail?.storageKey || 'rigidui-tour-completed'
      if (eventStorageKey === storageKey) {
        setTourCompleted(false)
      }
    }

    window.addEventListener('tourCompleted', handleTourComplete)
    window.addEventListener('tourReset', handleTourReset)

    return () => {
      window.removeEventListener('tourCompleted', handleTourComplete)
      window.removeEventListener('tourReset', handleTourReset)
    };
  }, [hideAfterComplete, storageKey])

  const handleClick = useCallback((e) => {
    e.preventDefault()
    startTour()
  }, [startTour])

  if (hideAfterComplete && tourCompleted) return null

  return (
    <div onClick={handleClick} className={className}>
      {children}
    </div>
  );
}

export default TourProvider;
