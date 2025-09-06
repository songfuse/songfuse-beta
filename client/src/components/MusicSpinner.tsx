import { CSSProperties } from 'react';

type SpinnerType = 'record' | 'equalizer' | 'note' | 'waveform' | 'vinyl';

interface MusicSpinnerProps {
  type?: SpinnerType;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  color?: string;
}

const MusicSpinner = ({ 
  type = 'record', 
  size = 'md', 
  className = '',
  color
}: MusicSpinnerProps) => {
  
  const sizeMap = {
    xs: { width: '16px', height: '16px' },
    sm: { width: '24px', height: '24px' },
    md: { width: '40px', height: '40px' },
    lg: { width: '64px', height: '64px' },
  };

  const dimensions = sizeMap[size];
  
  // Set color with fallbacks to current color
  const spinnerColor = color || 'currentColor';

  const spinnerStyle: CSSProperties = {
    ...dimensions,
    color: spinnerColor
  };

  const renderSpinner = () => {
    switch (type) {
      case 'record':
        return (
          <div 
            className={`relative animate-spin ${className}`} 
            style={spinnerStyle}
          >
            <div className="absolute inset-0 rounded-full border-2 border-solid border-current opacity-25"></div>
            <div className="absolute inset-2 rounded-full border border-solid border-current"></div>
            <div className="absolute inset-0 m-auto w-[20%] h-[20%] rounded-full bg-current"></div>
            <div className="absolute inset-0 m-auto w-[10%] h-[10%] rounded-full bg-background"></div>
          </div>
        );
        
      case 'equalizer':
        return (
          <div 
            className={`flex items-end justify-center gap-[2px] ${className}`} 
            style={spinnerStyle}
          >
            {[1, 2, 3, 4, 5].map((i) => (
              <div 
                key={i}
                className="bg-current animate-equalizer"
                style={{
                  width: `${100 / 7}%`,
                  height: `${20 + Math.sin(i / 5 * Math.PI) * 80}%`,
                  animationDelay: `${i * 0.1}s`,
                }}
              ></div>
            ))}
          </div>
        );
        
      case 'note':
        return (
          <div 
            className={`relative animate-smooth-spin ${className}`} 
            style={spinnerStyle}
          >
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
              <path 
                d="M9 17.5V5L19 3V15.5" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              />
              <circle cx="6" cy="17.5" r="3" stroke="currentColor" strokeWidth="2" />
              <circle cx="16" cy="15.5" r="3" stroke="currentColor" strokeWidth="2" />
            </svg>
          </div>
        );
        
      case 'waveform':
        return (
          <div 
            className={`flex items-center justify-center ${className}`} 
            style={spinnerStyle}
          >
            {[1, 2, 3, 4, 5, 4, 3, 2, 1].map((height, i) => (
              <div 
                key={i}
                className="mx-[1px] animate-waveform bg-current"
                style={{
                  height: `${height * 15}%`,
                  width: `${100 / 12}%`,
                  animationDelay: `${i * 0.05}s`,
                }}
              ></div>
            ))}
          </div>
        );
        
      case 'vinyl':
        return (
          <div 
            className={`relative animate-spin ${className}`} 
            style={spinnerStyle}
          >
            {/* Vinyl record outer circle */}
            <div className="absolute inset-0 rounded-full bg-gray-900 dark:bg-gray-800"></div>
            {/* Vinyl grooves */}
            <div className="absolute inset-[15%] rounded-full bg-gray-800 dark:bg-gray-700"></div>
            <div className="absolute inset-[30%] rounded-full bg-gray-700 dark:bg-gray-600"></div>
            <div className="absolute inset-[45%] rounded-full bg-gray-800 dark:bg-gray-700"></div>
            {/* Vinyl label */}
            <div className="absolute inset-[60%] rounded-full bg-red-600"></div>
            {/* Center hole */}
            <div className="absolute inset-0 m-auto w-[10%] h-[10%] rounded-full bg-white dark:bg-gray-200"></div>
          </div>
        );
        
      default:
        return (
          <div 
            className={`animate-spin rounded-full border-2 border-solid border-current border-r-transparent ${className}`} 
            style={spinnerStyle}
          ></div>
        );
    }
  };

  return renderSpinner();
};

export default MusicSpinner;