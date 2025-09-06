import { Helmet } from 'react-helmet';
import { useEffect } from 'react';

interface MetaTagsProps {
  title?: string;
  description?: string; 
  imageUrl?: string;
  url?: string;
  type?: 'website' | 'music.playlist';
  siteName?: string;
}

/**
 * Component for setting metadata and social sharing tags
 */
const MetaTags = ({
  title = 'SongFuse | AI-Powered Music Playlist Generator',
  description = 'Create personalized playlists with AI-powered recommendations and beautiful cover art tailored to your music taste.',
  imageUrl,
  url,
  type = 'website',
  siteName = 'SongFuse'
}: MetaTagsProps) => {
  // We'll use useEffect to directly manipulate meta tags
  // This avoids issues with react-helmet's Symbol conversion
  useEffect(() => {
    // Set the page title
    document.title = title;

    // Helper function for setting meta tags
    const setMetaTag = (name: string, content: string, isProperty = false) => {
      const attributeName = isProperty ? 'property' : 'name';
      let metaTag = document.querySelector(`meta[${attributeName}="${name}"]`);
      
      if (!metaTag) {
        metaTag = document.createElement('meta');
        metaTag.setAttribute(attributeName, name);
        document.head.appendChild(metaTag);
      }
      
      metaTag.setAttribute('content', content);
    };

    // Format image URL
    let formattedImageUrl = '';
    if (imageUrl && typeof window !== 'undefined') {
      const siteUrl = window.location.origin;
      formattedImageUrl = !imageUrl.startsWith('http') 
        ? `${siteUrl}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}` 
        : imageUrl;
    }

    // Format URL
    const pageUrl = url || (typeof window !== 'undefined' ? window.location.href : '');

    // Set basic meta tags
    setMetaTag('title', title);
    setMetaTag('description', description);

    // Open Graph / Facebook tags
    setMetaTag('og:type', type, true);
    setMetaTag('og:url', pageUrl, true);
    setMetaTag('og:title', title, true);
    setMetaTag('og:description', description, true);
    setMetaTag('og:site_name', siteName, true);
    if (formattedImageUrl) {
      setMetaTag('og:image', formattedImageUrl, true);
    }

    // Twitter tags
    setMetaTag('twitter:card', 'summary_large_image', true);
    setMetaTag('twitter:url', pageUrl, true);
    setMetaTag('twitter:title', title, true);
    setMetaTag('twitter:description', description, true);
    if (formattedImageUrl) {
      setMetaTag('twitter:image', formattedImageUrl, true);
    }

    // Music-specific meta tags for playlists
    if (type === 'music.playlist') {
      setMetaTag('music:creator', siteName, true);
      setMetaTag('music:album', title, true);
      setMetaTag('music:album_type', 'playlist', true);
    }
  }, [title, description, imageUrl, url, type, siteName]);

  // We still return the Helmet component for compatibility,
  // but the actual work is done in the useEffect
  return (
    <Helmet>
      <title>{title}</title>
    </Helmet>
  );
};

export default MetaTags;