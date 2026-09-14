import { useEffect } from 'react'

/**
 * Custom hook to fix Radix UI Dialog body style issues
 * Prevents the page from becoming unresponsive after modal operations
 * 
 * @param {boolean} open - Whether the modal is open
 */
export function useModalCleanup(open) {
  useEffect(() => {
    if (!open) {
      // Reset body styles that might be blocking interaction
      document.body.style.pointerEvents = 'auto';
      document.body.style.overflow = 'auto';
      document.body.style.position = 'static';
      
      // Use requestAnimationFrame to ensure this runs after Radix UI's cleanup
      requestAnimationFrame(() => {
        document.body.style.pointerEvents = 'auto';
        document.body.style.overflow = 'auto';
        document.body.style.position = 'static';
      });
      
      // Additional cleanup with longer delay to ensure Radix UI cleanup is complete
      setTimeout(() => {
        document.body.style.pointerEvents = 'auto';
        document.body.style.overflow = 'auto';
        document.body.style.position = 'static';
      }, 200);
    }
  }, [open]);

  // Add MutationObserver to watch for body style changes and fix them
  useEffect(() => {
    if (!open) {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
            const target = mutation.target;
            if (target === document.body) {
              const currentStyle = target.getAttribute('style') || '';
              if (currentStyle.includes('pointer-events: none')) {
                // Immediately fix the pointer-events issue
                target.style.pointerEvents = 'auto';
                target.style.overflow = 'auto';
                target.style.position = 'static';
              }
            }
          }
        });
      });

      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ['style']
      });

      // Clean up observer after 1 second
      const cleanupTimer = setTimeout(() => {
        observer.disconnect();
      }, 1000);

      return () => {
        observer.disconnect();
        clearTimeout(cleanupTimer);
      };
    }
  }, [open]);
}
