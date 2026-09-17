// The Renqun mark. 人 is a person; three of them stacked is 众, a crowd, and stacked they point up.
// The red dot is the head of the one on top. Same geometry as the app (mobile/components/RenqunMark.tsx).
export function RenqunMark({ size = 28, ink = '#171717', dot = '#FF004D', title }: { size?: number; ink?: string; dot?: string; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="8 4 224 224" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <g stroke={ink} strokeWidth={22} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M78 122L120 62L162 122" />
        <path d="M20 206L62 146L104 206" />
        <path d="M136 206L178 146L220 206" />
      </g>
      <circle cx={120} cy={29} r={14} fill={dot} />
    </svg>
  );
}
