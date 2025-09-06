/**
 * Script to generate OG image for social media sharing
 * This creates a high-quality PNG image optimized for social platforms
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create canvas HTML to generate the image
const createOGImageHTML = () => {
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
      background: linear-gradient(135deg, #000000 0%, #1a1a1a 50%, #000000 100%);
      width: 1200px;
      height: 630px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      overflow: hidden;
    }
    
    .background-dots {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }
    
    .dot {
      position: absolute;
      border-radius: 50%;
      background: #d02b31;
    }
    
    .dot1 { top: 100px; left: 100px; width: 4px; height: 4px; opacity: 0.3; }
    .dot2 { top: 150px; right: 100px; width: 6px; height: 6px; opacity: 0.2; }
    .dot3 { bottom: 130px; left: 200px; width: 3px; height: 3px; opacity: 0.4; }
    .dot4 { bottom: 150px; right: 200px; width: 5px; height: 5px; opacity: 0.3; }
    
    .container {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 90%;
      max-width: 1000px;
      z-index: 1;
    }
    
    .content {
      flex: 1;
      padding-right: 60px;
    }
    
    .logo {
      width: 80px;
      height: 80px;
      background: #d02b31;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 30px;
      position: relative;
    }
    
    .logo::before {
      content: '';
      width: 50px;
      height: 50px;
      background: white;
      border-radius: 8px;
      position: absolute;
    }
    
    .logo::after {
      content: '';
      width: 20px;
      height: 4px;
      background: #d02b31;
      position: absolute;
      z-index: 1;
    }
    
    .title {
      font-size: 84px;
      font-weight: 900;
      color: white;
      margin: 0;
      margin-bottom: 20px;
      letter-spacing: -2px;
      line-height: 1.1;
    }
    
    .subtitle {
      font-size: 32px;
      font-weight: 600;
      color: #d02b31;
      margin: 0;
      margin-bottom: 25px;
      letter-spacing: -0.5px;
    }
    
    .description {
      font-size: 20px;
      color: #cccccc;
      margin: 0;
      margin-bottom: 35px;
      line-height: 1.4;
      max-width: 600px;
    }
    
    .features {
      display: flex;
      gap: 30px;
      flex-wrap: wrap;
      margin-bottom: 40px;
    }
    
    .feature {
      font-size: 16px;
      color: #ffffff;
      opacity: 0.9;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .feature-icon {
      width: 16px;
      height: 16px;
      background: #d02b31;
      border-radius: 50%;
      display: inline-block;
    }
    
    .cta {
      background: linear-gradient(90deg, #d02b31 0%, #ff4444 100%);
      color: white;
      padding: 18px 36px;
      border-radius: 50px;
      font-size: 18px;
      font-weight: 700;
      border: none;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 12px;
      box-shadow: 0 8px 32px rgba(208, 43, 49, 0.3);
    }
    
    .showcase {
      flex: 0 0 300px;
      height: 400px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 20px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(10px);
      padding: 30px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
    }
    
    .showcase-title {
      font-size: 20px;
      font-weight: 600;
      color: white;
      margin-bottom: 20px;
      text-align: center;
    }
    
    .playlist-item {
      width: 100%;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 15px;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    .playlist-cover {
      width: 40px;
      height: 40px;
      background: linear-gradient(45deg, #d02b31, #ff4444);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      font-size: 16px;
    }
    
    .playlist-info {
      flex: 1;
    }
    
    .playlist-title {
      font-size: 14px;
      font-weight: 600;
      color: white;
      margin: 0;
      margin-bottom: 4px;
    }
    
    .playlist-desc {
      font-size: 12px;
      color: #cccccc;
      margin: 0;
      opacity: 0.8;
    }
    
    .url {
      position: absolute;
      bottom: 30px;
      right: 30px;
      font-size: 16px;
      color: #888888;
      font-weight: 500;
    }
  </style>
</head>
<body>
  <div class="background-dots">
    <div class="dot dot1"></div>
    <div class="dot dot2"></div>
    <div class="dot dot3"></div>
    <div class="dot dot4"></div>
  </div>
  
  <div class="container">
    <div class="content">
      <div class="logo"></div>
      <h1 class="title">SongFuse</h1>
      <h2 class="subtitle">AI-Powered Music Discovery</h2>
      <p class="description">
        Create personalized playlists with AI that understands your music taste and generates stunning covers ready to share.
      </p>
      <div class="features">
        <div class="feature">
          <span class="feature-icon"></span>
          AI-Generated Playlists
        </div>
        <div class="feature">
          <span class="feature-icon"></span>
          Smart Music Matching
        </div>
        <div class="feature">
          <span class="feature-icon"></span>
          Social Sharing
        </div>
      </div>
      <button class="cta">Start Creating →</button>
    </div>
    
    <div class="showcase">
      <div class="showcase-title">Live Playlists</div>
      <div class="playlist-item">
        <div class="playlist-cover">🎵</div>
        <div class="playlist-info">
          <div class="playlist-title">Chill Vibes</div>
          <div class="playlist-desc">18 tracks • AI curated</div>
        </div>
      </div>
      <div class="playlist-item">
        <div class="playlist-cover">🎸</div>
        <div class="playlist-info">
          <div class="playlist-title">Rock Essentials</div>
          <div class="playlist-desc">24 tracks • AI curated</div>
        </div>
      </div>
      <div class="playlist-item">
        <div class="playlist-cover">🎤</div>
        <div class="playlist-info">
          <div class="playlist-title">Pop Hits</div>
          <div class="playlist-desc">20 tracks • AI curated</div>
        </div>
      </div>
    </div>
  </div>
  
  <div class="url">songfuse.app</div>
</body>
</html>
  `;
};

// Write the HTML file
const htmlContent = createOGImageHTML();
fs.writeFileSync(path.join(__dirname, '../public/og-image.html'), htmlContent);

console.log('OG image HTML generated at public/og-image.html');
console.log('To create a PNG version, open this file in a browser and take a screenshot, or use a tool like Puppeteer.');