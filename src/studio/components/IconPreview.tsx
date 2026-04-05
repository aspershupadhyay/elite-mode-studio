/**
 * IconPreview.tsx
 * Renders a single icon's SVG path(s) from the icons-data library.
 * Accepts a single path string or an array of path strings.
 */

interface IconData {
  path: string | string[]
}

interface IconPreviewProps {
  icon: IconData
  size?: number
  color?: string
  strokeWidth?: number
}

export default function IconPreview({ icon, size = 20, color = 'currentColor', strokeWidth = 1.6 }: IconPreviewProps): JSX.Element {
  const paths = Array.isArray(icon.path) ? icon.path : [icon.path]
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block', flexShrink: 0 }}
    >
      {paths.map((d, i) => <path key={i} d={d}/>)}
    </svg>
  )
}
