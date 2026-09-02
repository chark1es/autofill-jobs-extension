export function Icon({
  name,
  size = 16,
}: {
  name:
    | 'fill'
    | 'profile'
    | 'experience'
    | 'resume'
    | 'settings'
    | 'plus'
    | 'trash'
    | 'upload'
    | 'download'
    | 'linkedin'
    | 'check'
    | 'alert'
    | 'spark'
  size?: number
}) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  switch (name) {
    case 'fill':
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="14" rx="1.5" />
          <path d="M7 9h10M7 12h7M7 15h5" />
        </svg>
      )
    case 'profile':
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.25" />
          <path d="M5.5 19c1.2-3 3.3-4.5 6.5-4.5s5.3 1.5 6.5 4.5" />
        </svg>
      )
    case 'experience':
      return (
        <svg {...common}>
          <rect x="3.5" y="7" width="17" height="12" rx="1.5" />
          <path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7" />
        </svg>
      )
    case 'resume':
      return (
        <svg {...common}>
          <path d="M7 3.5h7.5L19 8v12.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5Z" />
          <path d="M14.5 3.5V8H19" />
          <path d="M8.5 12h7M8.5 15.5h5" />
        </svg>
      )
    case 'settings':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 4.5v1.5M12 18v1.5M4.5 12H6M18 12h1.5M6.4 6.4l1.1 1.1M16.5 16.5l1.1 1.1M6.4 17.6l1.1-1.1M16.5 7.5l1.1-1.1" />
          <path d="M12 8.2a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6Z" />
        </svg>
      )
    case 'plus':
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      )
    case 'trash':
      return (
        <svg {...common}>
          <path d="M5 7h14M10 7V5h4v2M8 7v12h8V7" />
        </svg>
      )
    case 'upload':
      return (
        <svg {...common}>
          <path d="M12 16V5M8 9l4-4 4 4M5 19h14" />
        </svg>
      )
    case 'download':
      return (
        <svg {...common}>
          <path d="M12 5v11M8 12l4 4 4-4M5 19h14" />
        </svg>
      )
    case 'linkedin':
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M8 10.5V16M8 8v.01M12 16v-3.5a2 2 0 0 1 4 0V16" />
        </svg>
      )
    case 'check':
      return (
        <svg {...common}>
          <path d="M5 12.5 10 17l9-10" />
        </svg>
      )
    case 'alert':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 8v5M12 16v.01" />
        </svg>
      )
    case 'spark':
      return (
        <svg {...common}>
          <path d="M12 3.5 13.7 9H19l-4.2 3.2L16.5 18 12 14.7 7.5 18l1.7-5.8L5 9h5.3L12 3.5Z" />
        </svg>
      )
  }
}
