import React, { useState } from 'react'
import { useModalCleanup } from '@/hooks/useModalCleanup'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog'
import { Button } from './button'
import { Maximize2, Minimize2, X } from 'lucide-react'

export function ExpandableModal({
  trigger,
  title,
  description,
  children,
  className,
  size = "default"
}) {
  const [open, setOpen] = useState(false)
  
  // Use the modal cleanup hook to fix body style issues
  useModalCleanup(open)

  const sizeClasses = {
    sm: "max-w-md",
    default: "max-w-4xl",
    lg: "max-w-6xl",
    xl: "max-w-7xl",
    full: "max-w-[95vw]"
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger}
      </DialogTrigger>
      <DialogContent className={`${sizeClasses[size]} max-h-[90vh] overflow-hidden`} showCloseButton={false}>
        <DialogHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <DialogTitle className="text-xl font-semibold">{title}</DialogTitle>
            {description && (
              <DialogDescription className="text-sm text-muted-foreground">
                {description}
              </DialogDescription>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>
        <div className="h-[calc(90vh-120px)] overflow-hidden">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function ExpandableCard({
  title,
  description,
  children,
  className,
  expandable = true,
  expandedContent
}) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (!expandable) {
    return (
      <div className={className}>
        {children}
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="relative">
        {children}
        <Button
          variant="outline"
          size="sm"
          className="absolute top-2 left-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => setIsExpanded(true)}
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>
      
      <ExpandableModal
        trigger={
          <Button
            variant="outline"
            size="sm"
            className="mt-2 w-full"
          >
            <Maximize2 className="h-4 w-4 mr-2" />
            Expand View
          </Button>
        }
        title={title}
        description={description}
        size="xl"
      >
        {expandedContent || children}
      </ExpandableModal>
    </div>
  )
}
