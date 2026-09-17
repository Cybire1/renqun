// THE BELL icon system — duotone editorial vectors.
//
// Every glyph is drawn on a 24-unit grid as a real SVG: a crisp 1.9-weight line with
// round joins, a soft brand-tinted fill underneath (the "duotone" depth), and one solid
// accent shape that carries the eye. It reskins automatically from the passed `color`:
//   • color = vermilion  → vermilion line + vermilion-tint fill   (cool tiles, dark bg)
//   • color = white       → white line + white-tint fill           (hot tiles on vermilion)
//   • color = muted/paper → tab-bar inactive / active
// No gradients per-icon (they'd fight the contextual color); the duotone fill is what reads
// as modern. Keeps the exact same API the app already calls: <Icon name color size />.
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

export type IconName =
  | 'markets'
  | 'portfolio'
  | 'wallet'
  | 'more'
  | 'earn'
  | 'strategy'
  | 'leverage'
  | 'x'
  | 'link'
  | 'shield'
  | 'bell'
  | 'bolt'
  | 'gear'
  | 'ticket'
  | 'sun'
  | 'moon'
  | 'sensei'
  | 'bitcoin'
  | 'clock'
  | 'target'
  | 'droplet'
  | 'whale'
  | 'crown';

const SW = 1.9; // stroke weight on the 24-grid
const SOFT = 0.15; // duotone fill opacity

export function Icon({ name, color = '#FAFAFA', size = 24 }: { name: IconName; color?: string; size?: number }) {
  // Stroke props only — no `fill` here, so duotone shapes keep their own fill while
  // line-only paths inherit `fill="none"` from the <Svg> root.
  const stroke = {
    stroke: color,
    strokeWidth: SW,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {name === 'markets' && (
        <>
          <Path d="M3 14.6 8.6 9 12.6 12.6 17 6 21 9.6 21 19.6 3 19.6Z" fill={color} fillOpacity={SOFT} />
          <Path d="M3 14.6 8.6 9 12.6 12.6 17 6 21 9.6" {...stroke} />
          <Circle cx={17} cy={6} r={1.8} fill={color} />
        </>
      )}

      {name === 'portfolio' && (
        <>
          <Circle cx={12} cy={12} r={8} fill={color} fillOpacity={SOFT} />
          <Path d="M12 12 12 4A8 8 0 0 1 18.93 16Z" fill={color} />
          <Circle cx={12} cy={12} r={8} {...stroke} />
        </>
      )}

      {name === 'wallet' && (
        <>
          <Rect x={3} y={6} width={18} height={13} rx={4} fill={color} fillOpacity={SOFT} />
          <Rect x={3} y={6} width={18} height={13} rx={4} {...stroke} />
          <Rect x={14} y={10} width={7} height={5} rx={2.5} fill={color} />
        </>
      )}

      {name === 'more' && (
        <>
          <Rect x={4} y={4} width={7} height={7} rx={2.2} fill={color} fillOpacity={SOFT} {...stroke} />
          <Rect x={13} y={4} width={7} height={7} rx={2.2} fill={color} />
          <Rect x={4} y={13} width={7} height={7} rx={2.2} fill={color} fillOpacity={SOFT} {...stroke} />
          <Rect x={13} y={13} width={7} height={7} rx={2.2} fill={color} fillOpacity={SOFT} {...stroke} />
        </>
      )}

      {name === 'earn' && (
        <>
          <Ellipse cx={12} cy={8} rx={7.3} ry={2.7} fill={color} fillOpacity={0.18} {...stroke} />
          <Path d="M4.7 8V15.3" {...stroke} />
          <Path d="M19.3 8V15.3" {...stroke} />
          <Path d="M4.7 11.6A7.3 2.7 0 0 0 19.3 11.6" {...stroke} />
          <Path d="M4.7 15.3A7.3 2.7 0 0 0 19.3 15.3" {...stroke} />
        </>
      )}

      {name === 'strategy' && (
        <>
          <Path d="M7.6 8.6 16 7.5" {...stroke} />
          <Path d="M8 9.9 10.6 14" {...stroke} />
          <Path d="M16 8.9 12 14" {...stroke} />
          <Circle cx={6.4} cy={8} r={2.4} fill={color} fillOpacity={0.16} {...stroke} />
          <Circle cx={17} cy={7} r={2.2} fill={color} fillOpacity={0.16} {...stroke} />
          <Circle cx={11} cy={16} r={2.7} fill={color} />
        </>
      )}

      {name === 'shield' && (
        <>
          <Path
            d="M12 3 19 5.8V11C19 15.6 16 19.3 12 21 8 19.3 5 15.6 5 11V5.8Z"
            fill={color}
            fillOpacity={SOFT}
            {...stroke}
          />
          <Circle cx={12} cy={10.4} r={1.9} fill={color} />
          <Path d="M12 10.4V14.6" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
        </>
      )}

      {name === 'leverage' && (
        <>
          <Path d="M5 18 12 12 19 18" {...stroke} strokeOpacity={0.5} />
          <Path d="M5 13 12 7 19 13" {...stroke} strokeWidth={2} />
        </>
      )}

      {name === 'x' && (
        <Path
          d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
          fill={color}
        />
      )}

      {name === 'link' && (
        <>
          <Path d="M9.4 14.6 14.6 9.4" {...stroke} />
          <Path d="M7.2 16.8 5.8 18.2A3.5 3.5 0 0 1 .8 13.2L4 10A3.5 3.5 0 0 1 9 10" {...stroke} />
          <Path d="M16.8 7.2 18.2 5.8A3.5 3.5 0 0 1 23.2 10.8L20 14A3.5 3.5 0 0 1 15 14" {...stroke} />
          <Circle cx={12} cy={12} r={2.1} fill={color} fillOpacity={SOFT} />
        </>
      )}

      {name === 'bell' && (
        <>
          <Path
            d="M12 4C8.7 4 8 6.6 8 9.6 8 13 6.6 14 6.6 16.6L17.4 16.6C17.4 14 16 13 16 9.6 16 6.6 15.3 4 12 4Z"
            fill={color}
            fillOpacity={SOFT}
            {...stroke}
          />
          <Path d="M4.8 16.6H19.2" {...stroke} />
          <Path d="M12 2.6V4" {...stroke} />
          <Path d="M10.2 19A1.8 1.8 0 0 0 13.8 19" {...stroke} />
        </>
      )}

      {name === 'bolt' && (
        <Path
          d="M13 2 3 14 12 14 11 22 21 10 12 10Z"
          fill={color}
          fillOpacity={SOFT}
          {...stroke}
        />
      )}

      {name === 'gear' && (
        <>
          {/* duotone cog: soft filled ring + eight teeth + a solid centre */}
          <Circle cx={12} cy={12} r={7.4} fill={color} fillOpacity={SOFT} {...stroke} />
          <Circle cx={12} cy={12} r={2.5} fill={color} />
          <Path d="M12 2.6V5" {...stroke} />
          <Path d="M12 19V21.4" {...stroke} />
          <Path d="M2.6 12H5" {...stroke} />
          <Path d="M19 12H21.4" {...stroke} />
          <Path d="M5.4 5.4 7.1 7.1" {...stroke} />
          <Path d="M16.9 16.9 18.6 18.6" {...stroke} />
          <Path d="M18.6 5.4 16.9 7.1" {...stroke} />
          <Path d="M7.1 16.9 5.4 18.6" {...stroke} />
        </>
      )}

      {name === 'ticket' && (
        <>
          <Rect x={3} y={7} width={18} height={10} rx={2.6} fill={color} fillOpacity={SOFT} {...stroke} />
          <Path d="M14 7.4V16.6" {...stroke} strokeDasharray="2 2.2" />
        </>
      )}

      {name === 'sun' && (
        <>
          {/* duotone core + solid center accent, eight round-capped rays */}
          <Circle cx={12} cy={12} r={4} fill={color} fillOpacity={SOFT} {...stroke} />
          <Circle cx={12} cy={12} r={1.5} fill={color} />
          <Path d="M12 2.2V4.2" {...stroke} />
          <Path d="M12 19.8V21.8" {...stroke} />
          <Path d="M2.2 12H4.2" {...stroke} />
          <Path d="M19.8 12H21.8" {...stroke} />
          <Path d="M5.1 5.1 6.5 6.5" {...stroke} />
          <Path d="M17.5 17.5 18.9 18.9" {...stroke} />
          <Path d="M18.9 5.1 17.5 6.5" {...stroke} />
          <Path d="M6.5 17.5 5.1 18.9" {...stroke} />
        </>
      )}

      {name === 'moon' && (
        <>
          {/* crescent (duotone fill + stroke) with one floating solid star */}
          <Path d="M12 3A6 6 0 0 0 21 12 9 9 0 1 1 12 3Z" fill={color} fillOpacity={SOFT} {...stroke} />
          <Circle cx={18} cy={5} r={0.95} fill={color} />
        </>
      )}

      {name === 'sensei' && (
        <>
          {/* voice soundwave — the "talk to your companion" mark: a symmetric five-bar wave */}
          <Path d="M5.5 9.6V14.4" {...stroke} strokeWidth={2.3} />
          <Path d="M9 6.6V17.4" {...stroke} strokeWidth={2.3} />
          <Path d="M12 4V20" {...stroke} strokeWidth={2.3} />
          <Path d="M15 6.6V17.4" {...stroke} strokeWidth={2.3} />
          <Path d="M18.5 9.6V14.4" {...stroke} strokeWidth={2.3} />
        </>
      )}

      {name === 'bitcoin' && (
        <>
          {/* duotone coin + a drawn ₿ (stem, two lobes, top and bottom ticks) */}
          <Circle cx={12} cy={12} r={9} fill={color} fillOpacity={SOFT} {...stroke} />
          <Path d="M10.2 7.6V16.4M11.9 6.1V7.6M11.9 16.4V17.9" {...stroke} />
          <Path d="M10.2 7.6H13A2.1 2.1 0 0 1 13 11.8H10.2M10.2 11.8H13.4A2.3 2.3 0 0 1 13.4 16.4H10.2" {...stroke} />
        </>
      )}

      {name === 'clock' && (
        <>
          <Circle cx={12} cy={12} r={8.5} fill={color} fillOpacity={SOFT} {...stroke} />
          <Path d="M12 7.6V12L15 13.7" {...stroke} />
        </>
      )}

      {name === 'target' && (
        <>
          <Circle cx={12} cy={12} r={8.5} fill={color} fillOpacity={SOFT} {...stroke} />
          <Circle cx={12} cy={12} r={4.6} {...stroke} />
          <Circle cx={12} cy={12} r={1.7} fill={color} />
        </>
      )}

      {name === 'droplet' && (
        <Path
          d="M12 3.2C12 3.2 5.6 10 5.6 14.2A6.4 6.4 0 0 0 18.4 14.2C18.4 10 12 3.2 12 3.2Z"
          fill={color}
          fillOpacity={SOFT}
          {...stroke}
        />
      )}

      {name === 'whale' && (
        <>
          <Path
            d="M3.8 13.4A5.4 5 0 0 1 14.6 11.9L18.2 10.4 17.1 13.3 19.6 15.6 16.4 15.6A5.4 5 0 0 1 3.8 13.4Z"
            fill={color}
            fillOpacity={SOFT}
            {...stroke}
          />
          <Circle cx={8} cy={12.6} r={0.95} fill={color} />
          <Path d="M10.2 8.4C10.6 6.9 11.8 6.3 12.8 6.4" {...stroke} />
        </>
      )}

      {name === 'crown' && (
        <>
          <Path d="M4 8.6 7.6 12.2 12 6.6 16.4 12.2 20 8.6 18.4 17 5.6 17Z" fill={color} fillOpacity={SOFT} {...stroke} />
          <Path d="M5.6 17H18.4" {...stroke} />
          <Circle cx={4} cy={8.6} r={1.15} fill={color} />
          <Circle cx={20} cy={8.6} r={1.15} fill={color} />
          <Circle cx={12} cy={6.6} r={1.15} fill={color} />
        </>
      )}
    </Svg>
  );
}
