// The Renqun mark. 人 is a person; three of them stacked is 众, a crowd, and stacked they point up.
// The red dot is the head of the one on top. Same geometry as the app icon and the design board
// ("Renqun Logo"), so keep the numbers in step with scripts/renqun-icons.cjs.
import Svg, { Circle, G, Path } from 'react-native-svg';

export const RENQUN_VIEWBOX = '8 4 224 224';
export const RENQUN_PATHS = ['M78 122L120 62L162 122', 'M20 206L62 146L104 206', 'M136 206L178 146L220 206'] as const;
export const RENQUN_HEAD = { cx: 120, cy: 29, r: 14 } as const;
export const RENQUN_STROKE = 22;

export function RenqunMark({
  size = 28,
  ink = '#171717',
  dot = '#FF004D',
}: {
  /** width and height in points (the mark is square) */
  size?: number;
  ink?: string;
  /** the head of the top figure */
  dot?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox={RENQUN_VIEWBOX}>
      <G stroke={ink} strokeWidth={RENQUN_STROKE} strokeLinecap="round" strokeLinejoin="round" fill="none">
        {RENQUN_PATHS.map((d) => (
          <Path key={d} d={d} />
        ))}
      </G>
      <Circle cx={RENQUN_HEAD.cx} cy={RENQUN_HEAD.cy} r={RENQUN_HEAD.r} fill={dot} />
    </Svg>
  );
}
