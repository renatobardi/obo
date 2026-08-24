interface OboMarkProps {
  /** Lado do SVG em px. 22 na sidebar, 40 na tela de login. */
  size?: number
  className?: string
}

export function OboMark({ size = 22, className }: OboMarkProps) {
  const petal =
    'M50,50 C38,43 33,27 39,15 C42,8 47,10 50,17 C53,10 58,8 61,15 C67,27 62,43 50,50 Z'
  const arms = [0, 1, 2, 3, 4]

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      className={className}
      aria-hidden="true"
      style={{ display: 'block', flexShrink: 0 }}
    >
      {arms.map((i) => (
        <path
          key={`p${i}`}
          d={petal}
          transform={`rotate(${i * 72} 50 50)`}
          fill="var(--sakura-petal)"
          stroke="var(--sakura-ink)"
          strokeWidth={6}
          strokeLinejoin="round"
        />
      ))}
      {arms.map((i) => (
        <line
          key={`l${i}`}
          x1="50"
          y1="50"
          x2="50"
          y2="34"
          transform={`rotate(${i * 72 + 36} 50 50)`}
          stroke="var(--sakura-ink)"
          strokeWidth={3.3}
          strokeLinecap="round"
        />
      ))}
      {arms.map((i) => (
        <circle
          key={`c${i}`}
          cx="50"
          cy="33"
          r={3}
          transform={`rotate(${i * 72 + 36} 50 50)`}
          fill="var(--sakura-ink)"
        />
      ))}
      <circle cx="50" cy="50" r={5.4} fill="var(--sakura-ink)" />
    </svg>
  )
}
