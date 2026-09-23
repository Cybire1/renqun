'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { clock } from '@renqun/client';
import { RenqunMark } from './RenqunMark';

export function Tri({ dir, size = 10, color = 'currentColor' }: { dir: 'up' | 'down'; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden>
      <path d={dir === 'up' ? 'M5 1.5 9 8.5H1Z' : 'M5 8.5 1 1.5h8Z'} fill={color} />
    </svg>
  );
}

type GlyphName = 'plus' | 'close' | 'check' | 'clock' | 'external' | 'copy';

export function Glyph({ name, size = 16, color = 'currentColor', weight = 2 }: { name: GlyphName; size?: number; color?: string; weight?: number }) {
  const p = { stroke: color, strokeWidth: weight, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      {name === 'plus' && <path d="M12 5v14M5 12h14" {...p} />}
      {name === 'close' && <path d="M6 6l12 12M18 6 6 18" {...p} />}
      {name === 'check' && <path d="m5 12.5 4.5 4.5L19 7.5" {...p} />}
      {name === 'clock' && (
        <>
          <circle cx={12} cy={12} r={8.5} {...p} />
          <path d="M12 7.5V12l3 2" {...p} />
        </>
      )}
      {name === 'external' && <path d="M14 5h5v5M19 5l-8 8M17 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4" {...p} />}
      {name === 'copy' && (
        <>
          <rect x={8} y={8} width={11} height={11} rx={2.5} {...p} />
          <path d="M16 8V6.5A1.5 1.5 0 0 0 14.5 5h-8A1.5 1.5 0 0 0 5 6.5v8A1.5 1.5 0 0 0 6.5 16H8" {...p} />
        </>
      )}
    </svg>
  );
}

export function Button({
  children,
  tone = 'red',
  busy = false,
  className = '',
  ...rest
}: {
  children: ReactNode;
  tone?: 'red' | 'soft' | 'white' | 'muted' | 'ink';
  busy?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`btn ${tone} ${className}`} aria-busy={busy || undefined} {...rest}>
      {busy ? <span className="spinner" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function Segmented<K extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: { key: K; label: string; count?: number }[];
  value: K;
  onChange: (k: K) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {items.map((it) => (
        <button key={it.key} type="button" aria-pressed={it.key === value} onClick={() => onChange(it.key)}>
          {it.label}
          {it.count != null ? <span className="count">{it.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Countdown({ msLeft }: { msLeft: number }) {
  return (
    <span className={`countdown ${msLeft < 60_000 ? 'final' : ''}`} aria-label={`${Math.max(0, Math.round(msLeft / 1000))} seconds left`}>
      <Glyph name="clock" size={14} weight={2.2} />
      {clock(msLeft)}
    </span>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-mark">
        <RenqunMark size={34} />
      </span>
      <h2 className="heading">{title}</h2>
      {body ? <p className="body" style={{ maxWidth: 340 }}>{body}</p> : null}
      {action}
    </div>
  );
}

export function Skeleton({ width, height, radius = 10 }: { width: number | string; height: number; radius?: number }) {
  return <span className="skeleton" style={{ width, height, borderRadius: radius }} aria-hidden />;
}

/** A modal sheet on the native <dialog>, so focus, Escape and the backdrop behave. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="sheet-body">
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="close" onClick={onClose} aria-label="Close">
            <Glyph name="close" size={16} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
