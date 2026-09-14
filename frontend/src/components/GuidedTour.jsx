import React from 'react'
import { TourProvider, TourStep, TourTrigger } from './guided-tour'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Play, HelpCircle } from 'lucide-react'

const GuidedTourContent = ({ children }) => {
  const currentPage = 'home'
  const storageKey = `dms-guided-tour-${currentPage}`
  const isHomeFirstVisit = currentPage === 'home' && localStorage.getItem(storageKey) !== 'true'
  const skipAllTours = localStorage.getItem('dms-guided-tour-skip-all') === 'true'

  return (
    <TourProvider
      autoStart={true}
      ranOnce={true}
      storageKey={storageKey}
      shouldStart={!skipAllTours}
      onTourComplete={() => {}}
      onTourSkip={() => {
        localStorage.setItem('dms-guided-tour-skip-all', 'true')
      }}
    >
      {children}
    </TourProvider>
  )
}

const GuidedTourButton = () => {
  return (
    <TourTrigger className="w-full">
      <Button variant="outline" className="w-full justify-start gap-2">
        <HelpCircle className="h-4 w-4" />
        Start Guided Tour
      </Button>
    </TourTrigger>
  )
}

export { GuidedTourContent, GuidedTourButton }
