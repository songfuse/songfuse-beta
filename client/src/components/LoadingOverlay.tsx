import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import MusicSpinner from './MusicSpinner';

interface LoadingOverlayProps {
  isVisible: boolean;
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ isVisible }) => {
  const [currentQuoteIndex, setCurrentQuoteIndex] = useState(0);
  
  const funnyQuotes = [
    'Bob Dylan once said: "Money does not talk, it swears", well... We swear you gonna love this playlist...',
    'The intern went to heat up the cannelloni and will be back in a moment to finish your playlist...',
    'This playlist is vegan, we are making sure that no animals have been harmed in the creation of this playlist....',
    'Sorry, Sir Paul McCartney is giving the final touches to the amazing image cover of your playlist...',
    'This playlist is taking longer to load than a dial-up connection in the 90s. Hang tight to your playlist...',
    'Our hamsters are powering the playlist creation with their tiny wheels. It is a slow process, but adorable!'
  ];

  useEffect(() => {
    if (isVisible) {
      const interval = setInterval(() => {
        setCurrentQuoteIndex(prevIndex => (prevIndex + 1) % funnyQuotes.length);
      }, 5000); // Change quote every 5 seconds
      
      return () => clearInterval(interval);
    }
  }, [isVisible, funnyQuotes.length]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"
        >
          <div className="bg-card border border-border rounded-lg p-8 max-w-md w-full mx-4 shadow-lg">
            <div className="flex flex-col">
              <div className="flex items-center mb-6">
                <MusicSpinner type="equalizer" size="lg" color="#d02b31" className="mr-4" />
                <h3 className="text-xl font-bold text-foreground">Creating Your Playlist</h3>
              </div>
              
              <div className="h-20 flex items-center">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={currentQuoteIndex}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.5 }}
                    className="text-muted-foreground text-sm italic"
                  >
                    {funnyQuotes[currentQuoteIndex]}
                  </motion.p>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default LoadingOverlay;