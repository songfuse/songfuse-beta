import { useState, useEffect } from 'react';
import lightLogo from '../assets/songfuse-brand-light.svg';
import darkLogo from '../assets/songfuse-brand-dark.svg';

// Custom hook that works with our ThemeToggle implementation
function useThemedLogo() {
  const [logoSrc, setLogoSrc] = useState(lightLogo);
  
  useEffect(() => {
    // Check for the theme class on document.documentElement
    const checkTheme = () => {
      const isDarkMode = document.documentElement.classList.contains('dark');
      console.log('Using theme:', isDarkMode ? 'dark' : 'light');
      setLogoSrc(isDarkMode ? darkLogo : lightLogo);
    };
    
    // Initial check
    checkTheme();
    
    // Set up a mutation observer to detect theme changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === 'attributes' && 
          mutation.attributeName === 'class'
        ) {
          checkTheme();
        }
      });
    });
    
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });
    
    // Clean up the observer on unmount
    return () => observer.disconnect();
  }, []);
  
  return logoSrc;
}

export default useThemedLogo;