import { useEffect, useState, RefObject } from 'react';

// Custom hook for detecting when an element is in view
export const useScrollAnimation = (
  ref: RefObject<HTMLElement>,
  threshold = 0.1
): boolean => {
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    
    const observer = new IntersectionObserver(
      ([entry]) => {
        // Update our state when observer callback fires
        setIsInView(entry.isIntersecting);
      },
      {
        root: null, // viewport
        rootMargin: '0px',
        threshold, // percentage of visibility to trigger callback
      }
    );

    const currentRef = ref.current;
    observer.observe(currentRef);

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [ref, threshold]);

  return isInView;
};

export default useScrollAnimation;