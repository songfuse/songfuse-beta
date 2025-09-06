# SongFuse Design System & Style Guide

## Table of Contents
1. [Brand Identity](#brand-identity)
2. [Color Palette](#color-palette)
3. [Typography](#typography)
4. [Design Tokens](#design-tokens)
5. [Component Specifications](#component-specifications)
6. [Animations](#animations)
7. [Layout & Spacing](#layout--spacing)
8. [Icons & Imagery](#icons--imagery)
9. [Theme Configuration](#theme-configuration)
10. [Usage Guidelines](#usage-guidelines)

---

## Brand Identity

SongFuse is an AI-powered music discovery platform with a modern, vibrant aesthetic that balances professionalism with creative energy.

### Core Brand Values
- **Innovation**: Cutting-edge AI technology for music curation
- **Accessibility**: Simple, intuitive interface for all users
- **Creativity**: Inspiring musical discovery and playlist creation
- **Community**: Social sharing and music exploration

### Visual Personality
- **Bold & Confident**: Strong typography and vibrant accents
- **Clean & Modern**: Minimalist design with clear hierarchy
- **Music-Focused**: Audio-visual elements and music-themed interactions
- **Tech-Forward**: Subtle gradients and contemporary UI patterns

---

## Color Palette

### Primary Colors
```css
/* Primary Red - Brand Color */
--primary: #d02b31 (HSL: 358 74% 49%)
--primary-rgb: 208, 43, 49
--primary-foreground: #ffffff
```

### Light Theme
```css
/* Backgrounds */
--background: #fafafa (HSL: 0 0% 98%)
--card: #ffffff (HSL: 0 0% 100%)

/* Text */
--foreground: #1a1a1a (HSL: 0 0% 10%)
--muted-foreground: #4d4d4d (HSL: 0 0% 30%)

/* Interactive Elements */
--secondary: #e6e6e6 (HSL: 0 0% 90%)
--accent: #d02b31 (HSL: 358 74% 49%)
--border: #e6e6e6 (HSL: 0 0% 90%)

/* Sidebar */
--sidebar-background: #f5f5f5 (HSL: 0 0% 96%)
--sidebar-border: #d9d9d9 (HSL: 0 0% 85%)
```

### Dark Theme
```css
/* Backgrounds */
--background: #000000 (HSL: 0 0% 0%)
--card: #000000 (HSL: 0 0% 0%)

/* Text */
--foreground: #ffffff (HSL: 0 0% 100%)
--muted-foreground: #b3b3b3 (HSL: 0 0% 70%)

/* Interactive Elements */
--secondary: #545454 (HSL: 0 0% 33%)
--accent: #d02b31 (HSL: 358 74% 49%)
--border: #333333 (HSL: 0 0% 20%)

/* Sidebar */
--sidebar-background: #000000 (HSL: 0 0% 0%)
--sidebar-border: #333333 (HSL: 0 0% 20%)
```

### Chart Colors
```css
--chart-1: #d02b31 (Primary Red)
--chart-2: #8b5cf6 (Purple: HSL 262 83% 58%)
--chart-3: #b3b3b3 (Gray: HSL 0 0% 70%)
--chart-4: #3b82f6 (Blue: HSL 217 91% 60%)
--chart-5: #ec4899 (Pink: HSL 338 85% 43%)
```

### Functional Colors
```css
/* Success */
--success: #10b981
--success-foreground: #ffffff

/* Warning */
--warning: #f59e0b
--warning-foreground: #ffffff

/* Destructive/Error */
--destructive: #ef4444 (HSL: 0 84% 60%)
--destructive-foreground: #ffffff
```

---

## Typography

### Font Family
```css
font-family: 'Work Sans', sans-serif;
```

**Work Sans** is a modern, humanist sans-serif typeface that provides excellent readability across all devices while maintaining a contemporary, approachable personality.

### Font Weights
- **Light**: 300 (`.font-light`)
- **Regular**: 400 (`.font-normal`)
- **Medium**: 500 (`.font-medium`)
- **Semibold**: 600 (`.font-semibold`)
- **Bold**: 700 (`.font-bold`)

### Heading Styles

#### H1 - Primary Headlines
```css
font-size: 2.5rem; /* 40px */
font-weight: 700; /* Bold */
line-height: 1.2;
letter-spacing: -0.02em;
```

#### H2 - Section Headers
```css
font-size: 2rem; /* 32px */
font-weight: 700; /* Bold */
line-height: 1.3;
```

#### H3 - Subsection Headers
```css
font-size: 1.5rem; /* 24px */
font-weight: 700; /* Bold */
line-height: 1.4;
```

#### H4 - Component Titles
```css
font-size: 1.25rem; /* 20px */
font-weight: 600; /* Semibold */
line-height: 1.4;
```

#### H5 - Minor Headers
```css
font-size: 1.125rem; /* 18px */
font-weight: 600; /* Semibold */
line-height: 1.5;
```

#### H6 - Small Headers
```css
font-size: 1rem; /* 16px */
font-weight: 500; /* Medium */
line-height: 1.5;
```

### Text Utilities
```css
/* Brand Text Gradient */
.text-gradient {
  background-image: linear-gradient(90deg, #d02b31, #ff6b6e);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

/* SongFuse Branding */
.songfuse-branding {
  font-weight: 700;
  letter-spacing: -0.02em;
}
```

---

## Design Tokens

### Border Radius
```css
--radius: 0; /* Angular design - no border radius */

/* Component Overrides */
border-radius: 0px;  /* Buttons, cards, inputs */
border-radius: 4px;  /* Scrollbars */
border-radius: 12px; /* Media embeds */
```

### Shadows
```css
/* Subtle shadows for depth */
box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); /* shadow-sm */
box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); /* shadow-lg */
box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1); /* shadow-xl */
```

### Spacing Scale
Based on Tailwind CSS spacing scale (0.25rem = 4px base unit):

```css
/* Common Spacing Values */
0.25rem  /* 1 - 4px */
0.5rem   /* 2 - 8px */
0.75rem  /* 3 - 12px */
1rem     /* 4 - 16px */
1.25rem  /* 5 - 20px */
1.5rem   /* 6 - 24px */
2rem     /* 8 - 32px */
3rem     /* 12 - 48px */
4rem     /* 16 - 64px */
```

### Z-Index Scale
```css
z-index: 10;  /* Dropdowns */
z-index: 20;  /* Sticky elements */
z-index: 30;  /* Fixed headers */
z-index: 40;  /* Overlays */
z-index: 50;  /* Modals */
```

---

## Component Specifications

### Buttons
```css
/* Base Button */
.button-base {
  padding: 0.5rem 1rem; /* py-2 px-4 */
  font-size: 0.875rem; /* text-sm */
  font-weight: 500; /* font-medium */
  border-radius: 0; /* rounded-none */
  transform: skewY(-2deg); /* -skew-y-2 */
  transition: all 0.2s ease;
}

/* Button Variants */
.button-primary {
  background-color: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
}

.button-secondary {
  background-color: hsl(var(--secondary));
  color: hsl(var(--secondary-foreground));
}

.button-outline {
  border: 1px solid hsl(var(--border));
  background-color: transparent;
}
```

### Cards
```css
.card {
  background-color: hsl(var(--card));
  color: hsl(var(--card-foreground));
  border: 1px solid hsl(var(--border));
  border-radius: 0.5rem; /* rounded-lg */
  box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); /* shadow-sm */
}

.card-header {
  padding: 1.5rem; /* p-6 */
  padding-bottom: 0; /* pb-0 */
}

.card-content {
  padding: 1.5rem; /* p-6 */
  padding-top: 0; /* pt-0 */
}
```

### Inputs
```css
.input {
  height: 2.5rem; /* h-10 */
  width: 100%;
  border-radius: 0.375rem; /* rounded-md */
  border: 1px solid hsl(var(--border));
  background-color: hsl(var(--background));
  padding: 0.5rem 0.75rem; /* py-2 px-3 */
  font-size: 0.875rem; /* text-sm */
}

.input:focus {
  outline: none;
  ring: 2px solid hsl(var(--ring));
  ring-offset: 2px;
}
```

---

## Animations

### Keyframes
```css
/* Fade In Animation */
@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Music Visualizer Animations */
@keyframes equalizer {
  0%, 100% { height: 20%; }
  50% { height: 80%; }
}

@keyframes waveform {
  0%, 100% { transform: scaleY(0.5); }
  50% { transform: scaleY(1); }
}

/* Progress Animation */
@keyframes progress-indeterminate {
  0% { width: 0%; left: 0; }
  50% { width: 30%; }
  100% { width: 0%; left: 100%; }
}
```

### Animation Classes
```css
.animate-fade-in { animation: fade-in 0.5s ease-out forwards; }
.animate-equalizer { animation: equalizer 0.8s ease-in-out infinite; }
.animate-waveform { animation: waveform 1.2s ease-in-out infinite; }
.animate-smooth-spin { animation: smooth-spin 1.5s linear infinite; }
```

### Transitions
```css
/* Standard Transitions */
transition: all 0.2s ease; /* Fast interactions */
transition: colors 0.2s ease; /* Color changes */
transition: transform 0.3s ease; /* Movement */
transition: opacity 0.15s ease; /* Fades */
```

---

## Layout & Spacing

### Grid System
Based on CSS Grid and Flexbox:

```css
/* Responsive Grid */
.grid-responsive {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem; /* gap-6 */
}

/* Flex Layouts */
.flex-center {
  display: flex;
  align-items: center;
  justify-content: center;
}

.flex-between {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
```

### Container Sizes
```css
/* Max Widths */
.container-sm { max-width: 640px; }
.container-md { max-width: 768px; }
.container-lg { max-width: 1024px; }
.container-xl { max-width: 1280px; }
.container-2xl { max-width: 1536px; }
```

### Common Patterns
```css
/* Component Spacing */
.component-padding { padding: 1.5rem; } /* p-6 */
.section-spacing { margin-bottom: 3rem; } /* mb-12 */
.element-gap { gap: 1rem; } /* gap-4 */
```

---

## Icons & Imagery

### Icon Library
**Lucide React** - Modern, minimalist icon set

```jsx
// Common Icons
import { 
  Music, Play, Pause, SkipForward, SkipBack,
  Heart, Share, Download, ExternalLink,
  User, Settings, Search, Menu,
  Plus, Minus, X, Check
} from "lucide-react";
```

### Icon Sizing
```css
.icon-xs { width: 0.75rem; height: 0.75rem; } /* 12px */
.icon-sm { width: 1rem; height: 1rem; } /* 16px */
.icon-md { width: 1.25rem; height: 1.25rem; } /* 20px */
.icon-lg { width: 1.5rem; height: 1.5rem; } /* 24px */
.icon-xl { width: 2rem; height: 2rem; } /* 32px */
```

### Cover Images
- **Aspect Ratio**: 1:1 (square)
- **Minimum Size**: 150x150px
- **Optimal Size**: 300x300px
- **Format**: WebP preferred, PNG/JPG fallback
- **Style**: AI-generated, minimalist, brand-neutral

---

## Theme Configuration

### theme.json
```json
{
  "variant": "vibrant",
  "primary": "#d02b31",
  "appearance": "light",
  "radius": 0
}
```

### CSS Variables Structure
```css
:root {
  /* Core Colors */
  --primary: 358 74% 49%;
  --primary-foreground: 0 0% 100%;
  
  /* Layout */
  --radius: 0;
  
  /* Spacing (derived from Tailwind) */
  --spacing-unit: 0.25rem; /* 4px base */
}
```

---

## Usage Guidelines

### Do's ✅
- Use Work Sans font family consistently
- Apply the primary red (#d02b31) for key actions and branding
- Maintain angular design with zero border radius for most elements
- Use subtle shadows for depth and hierarchy
- Implement smooth transitions for interactive elements
- Follow the 4px grid system for spacing
- Use brand-neutral colors for AI-generated content

### Don'ts ❌
- Don't use rounded corners on buttons or cards (radius: 0)
- Don't include platform branding (Spotify, Apple Music logos) in generated content
- Don't use font weights other than specified (300, 400, 500, 600, 700)
- Don't override the angular button styling with rounded variants
- Don't use colors outside the defined palette
- Don't create custom gradients beyond the approved brand gradient

### Responsive Design
```css
/* Mobile First Approach */
@media (min-width: 640px) { /* sm */ }
@media (min-width: 768px) { /* md */ }
@media (min-width: 1024px) { /* lg */ }
@media (min-width: 1280px) { /* xl */ }
@media (min-width: 1536px) { /* 2xl */ }
```

### Accessibility
- Maintain WCAG 2.1 AA contrast ratios
- Use semantic HTML elements
- Provide focus indicators for interactive elements
- Support keyboard navigation
- Include alt text for images

---

## Implementation Notes

### Tailwind CSS Integration
The design system is built on Tailwind CSS with custom configurations in `tailwind.config.ts`. All color values use HSL format for better manipulation.

### Component Library
Uses shadcn/ui components as the foundation, customized with SongFuse branding and angular design principles.

### Build Process
Styles are processed through PostCSS with Tailwind CSS and optimized for production builds via Vite.

---

*This style guide is a living document that evolves with the SongFuse platform. Last updated: January 2025*