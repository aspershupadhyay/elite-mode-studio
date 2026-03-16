/**
 * icons-data.js — Curated SVG icon library for the Design Studio
 *
 * Source: Heroicons v2 (MIT License) — https://heroicons.com
 * All paths are 24×24 viewport, outlined style.
 * When placed on canvas, each icon is rendered as a fabric.Path object.
 */

// Each icon: { id, label, path (SVG d attribute or array of d attributes) }
// path can be a string (single <path>) or array of strings (multiple <path>)

export const ICON_CATEGORIES = [
  {
    id: 'social',
    label: 'Social',
    icons: [
      { id: 'globe', label: 'Globe / Web',   path: 'M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 0v20M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z' },
      { id: 'link',   label: 'Link',          path: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' },
      { id: 'share',  label: 'Share',         path: 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13' },
      { id: 'send',   label: 'Send / DM',     path: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z' },
      { id: 'at',     label: '@Mention',      path: 'M16 8a6 6 0 0 1 6 6v1a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-1a6 6 0 0 0-6-6 6 6 0 0 0-6 6v1a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-1a10 10 0 0 1 10-10z' },
      { id: 'hash',   label: 'Hashtag',       path: 'M4 9h16M4 15h16M10 3L8 21M16 3l-2 18' },
      { id: 'rss',    label: 'RSS / Feed',    path: 'M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16M6 19a1 1 0 1 0 0-2 1 1 0 0 0 0 2z' },
    ],
  },
  {
    id: 'media',
    label: 'Media',
    icons: [
      { id: 'play',      label: 'Play',        path: 'M5 3l14 9-14 9V3z' },
      { id: 'pause',     label: 'Pause',       path: 'M6 4h4v16H6zM14 4h4v16h-4z' },
      { id: 'mic',       label: 'Mic',         path: 'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8' },
      { id: 'camera',    label: 'Camera',      path: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
      { id: 'video',     label: 'Video',       path: 'M23 7l-7 5 7 5V7zM1 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V5z' },
      { id: 'music',     label: 'Music',       path: 'M9 18V5l12-2v13M6 18a3 3 0 1 0 6 0 3 3 0 0 0-6 0zM18 16a3 3 0 1 0 6 0 3 3 0 0 0-6 0z' },
      { id: 'headphones',label: 'Headphones',  path: 'M3 18v-6a9 9 0 0 1 18 0v6M3 18a3 3 0 0 0 3 3h1a3 3 0 0 0 3-3v-1a3 3 0 0 0-3-3H3zM21 18a3 3 0 0 1-3 3h-1a3 3 0 0 1-3-3v-1a3 3 0 0 1 3-3h4z' },
      { id: 'volume',    label: 'Volume',      path: 'M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07' },
    ],
  },
  {
    id: 'ui',
    label: 'UI & Actions',
    icons: [
      { id: 'home',      label: 'Home',        path: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 22V12h6v10' },
      { id: 'search',    label: 'Search',      path: 'M11 17a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM21 21l-4.35-4.35' },
      { id: 'bell',      label: 'Bell',        path: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0' },
      { id: 'bookmark',  label: 'Bookmark',    path: 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z' },
      { id: 'heart',     label: 'Heart',       path: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z' },
      { id: 'star',      label: 'Star',        path: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z' },
      { id: 'check',     label: 'Check',       path: 'M20 6L9 17l-5-5' },
      { id: 'check-circle', label: 'Check Circle', path: 'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3' },
      { id: 'x-circle',  label: 'X Circle',   path: 'M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0zM15 9l-6 6M9 9l6 6' },
      { id: 'user',      label: 'User',        path: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
      { id: 'users',     label: 'Users / Team',path: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
      { id: 'settings',  label: 'Settings',    path: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' },
      { id: 'download',  label: 'Download',    path: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3' },
      { id: 'upload',    label: 'Upload',      path: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12' },
    ],
  },
  {
    id: 'arrows',
    label: 'Arrows',
    icons: [
      { id: 'arrow-right', label: 'Arrow Right',  path: 'M5 12h14M12 5l7 7-7 7' },
      { id: 'arrow-left',  label: 'Arrow Left',   path: 'M19 12H5M12 19l-7-7 7-7' },
      { id: 'arrow-up',    label: 'Arrow Up',     path: 'M12 19V5M5 12l7-7 7 7' },
      { id: 'arrow-down',  label: 'Arrow Down',   path: 'M12 5v14M19 12l-7 7-7-7' },
      { id: 'refresh',     label: 'Refresh',      path: 'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15' },
      { id: 'maximize',    label: 'Expand',       path: 'M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3' },
      { id: 'minimize',    label: 'Collapse',     path: 'M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3' },
      { id: 'external',    label: 'External Link', path: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3' },
    ],
  },
  {
    id: 'charts',
    label: 'Data & Charts',
    icons: [
      { id: 'bar-chart',   label: 'Bar Chart',    path: 'M18 20V10M12 20V4M6 20v-6' },
      { id: 'trend-up',    label: 'Trending Up',  path: 'M23 6l-9.5 9.5-5-5L1 18M17 6h6v6' },
      { id: 'trend-down',  label: 'Trending Down',path: 'M23 18l-9.5-9.5-5 5L1 6M17 18h6v-6' },
      { id: 'activity',    label: 'Activity',     path: 'M22 12h-4l-3 9L9 3l-3 9H2' },
      { id: 'pie-chart',   label: 'Pie Chart',    path: 'M21.21 15.89A10 10 0 1 1 8 2.83M22 12A10 10 0 0 0 12 2v10z' },
      { id: 'target',      label: 'Target / Goal',path: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z' },
      { id: 'dollar',      label: 'Dollar',       path: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' },
    ],
  },
  {
    id: 'design',
    label: 'Design & Layout',
    icons: [
      { id: 'layers',    label: 'Layers',       path: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
      { id: 'layout',    label: 'Layout',       path: 'M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM3 9h18M9 21V9' },
      { id: 'grid',      label: 'Grid',         path: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z' },
      { id: 'sliders',   label: 'Sliders',      path: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6' },
      { id: 'image',     label: 'Image',        path: 'M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21' },
      { id: 'crop',      label: 'Crop',         path: 'M6.13 1L6 16a2 2 0 0 0 2 2h15M1 6.13L16 6a2 2 0 0 1 2 2v15' },
      { id: 'framer',    label: 'Frame',        path: 'M4 2v20M20 2v20M2 4h20M2 20h20M2 12h4M18 12h4M12 2v4M12 18v4' },
      { id: 'pen',       label: 'Pen',          path: 'M12 19l7-7 3 3-7 7-3-3zM18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z' },
      { id: 'type',      label: 'Text / Type',  path: 'M4 7V4h16v3M9 20h6M12 4v16' },
    ],
  },
  {
    id: 'misc',
    label: 'Misc & Symbols',
    icons: [
      { id: 'zap',       label: 'Lightning / Zap', path: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z' },
      { id: 'flame',     label: 'Fire / Trending',  path: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z' },
      { id: 'crown',     label: 'Crown',            path: 'M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zM5 20h14' },
      { id: 'award',     label: 'Award / Trophy',   path: 'M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM8.21 13.89L7 23l5-3 5 3-1.21-9.12' },
      { id: 'gift',      label: 'Gift',             path: 'M20 12v10H4V12M22 7H2v5h20V7zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z' },
      { id: 'info',      label: 'Info',             path: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 8v4M12 16h.01' },
      { id: 'lock',      label: 'Lock',             path: 'M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4' },
      { id: 'key',       label: 'Key',              path: 'M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4' },
      { id: 'mail',      label: 'Email / Mail',     path: 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 6l-10 7L2 6' },
      { id: 'calendar',  label: 'Calendar',         path: 'M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM16 2v4M8 2v4M3 10h18' },
      { id: 'map-pin',   label: 'Location Pin',     path: 'M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z' },
      { id: 'check-sq',  label: 'Check Square',     path: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11' },
    ],
  },
  {
    id: 'brand',
    label: 'Brand / Numbers',
    icons: [
      { id: 'num-1', label: '1', path: 'M12 4v16M9 7l3-3 3 3' },
      { id: 'num-2', label: '2', path: 'M8 7a4 4 0 0 1 8 0c0 3-4 5-4 9h0M8 20h8' },
      { id: 'num-3', label: '3', path: 'M8 4h8M12 4v7M8 11h7a3 3 0 0 1 0 6H8' },
      { id: 'hashtag-box', label: '#Tag Box', path: 'M4 9h16M4 15h16M10 3L8 21M16 3l-2 18' },
      { id: 'verified', label: 'Verified', path: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0 1 12 2.944a11.955 11.955 0 0 1-8.618 3.04A12.02 12.02 0 0 0 3 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
      { id: 'news',  label: 'News / Doc', path: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8' },
      { id: 'tag',   label: 'Tag / Label', path: 'M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 7h.01' },
    ],
  },
]

// Flat list for search
export const ALL_ICONS = ICON_CATEGORIES.flatMap(cat =>
  cat.icons.map(icon => ({ ...icon, category: cat.id, categoryLabel: cat.label }))
)
