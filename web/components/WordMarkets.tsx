'use client';
// "Just ask": plain yes/no questions about where Bitcoin will be later today. Each "later today"
// round (it closes at the next pool update) carries several questions at round-number prices near
// spot; Yes pays above the price, No at or below it. Picking a side opens the ticket in a dialog.
import { useEffect, useMemo, useState } from 'react';
import { bettable, clock, pct, questionLines, timeWords, usd0, type Market, type Side } from '@renqun/client';
import { useLineOdds, useOdds } from '@/lib/hooks';
import { Ticket } from './Ticket';
import { Sheet } from './ui';

interface Question {
  market: Market;
  line: { tick: bigint; usd: number };
}

export function WordMarkets({ markets, spotUsd, now, heading = true }: { markets: Market[]; spotUsd: number | null; now: number; heading?: boolean }) {
  const round = useMemo(() => markets.filter((m) => m.cadence === '1d' && bettable(m, now)).sort((a, b) => a.expiry - b.expiry)[0] ?? null, [markets, now]);

  // Keep the same questions while the price wanders near a boundary; move them once it has clearly left.
  const [anchor, setAnchor] = useState<number | null>(null);
  useEffect(() => {
    if (spotUsd != null && (anchor == null || Math.abs(spotUsd - anchor) > 375)) setAnchor(spotUsd);
  }, [spotUsd, anchor]);
  const lines = useMemo(() => (round && anchor != null ? questionLines(round, anchor, 3) : []), [round, anchor]);
  const odds = useLineOdds(round, lines.map((l) => l.tick));

  const [open, setOpen] = useState<{ q: Question; side: Side } | null>(null);

  // Questions priced outside the venue's 1–99% band cannot be bought; leave them out.
  const shown = lines.filter((l) => {
    const yes = odds?.get(l.tick.toString());
    return yes == null || (yes >= 0.01 && yes <= 0.99);
  });

  return (
    <section className={heading ? 'ask' : 'ask embedded'} aria-labelledby={heading ? 'ask-h' : undefined}>
      {/* Embedded in a band, the heading and lede come from the band head instead. */}
      {heading ? (
        <div className="ask-head">
          <h2 className="ask-title" id="ask-h">
            Just ask
          </h2>
          <p className="body">No chart to read. Will Bitcoin be above a price later today? Answer yes or no.</p>
        </div>
      ) : null}

      <div className="ask-sub">
        <h3 className="heading">Later today</h3>
        {round ? <span className="mono small">{shown.length}</span> : null}
      </div>

      {!round ? (
        <div className="card ask-empty">
          <span className="small">New questions open with the next pool update.</span>
        </div>
      ) : (
        <div className="ask-grid">
          {shown.map((l) => {
            const yes = odds?.get(l.tick.toString()) ?? null;
            const q = { market: round, line: l };
            return (
              <article key={l.tick.toString()} className="card ask-card">
                <div className="ask-top">
                  <span className="coin" aria-hidden>
                    ₿
                  </span>
                  <span className="label">Bitcoin</span>
                  <span className="ask-clock mono" aria-label="Time left">
                    {clock(round.expiry - now)}
                  </span>
                </div>
                <h4 className="ask-q">
                  Will Bitcoin be above {usd0(l.usd)} at {timeWords(round.expiry, now)}?
                </h4>
                <div className="lean" role="img" aria-label={yes != null ? `${pct(yes)} chance of yes` : 'Loading odds'}>
                  <span style={{ width: `${Math.round((yes ?? 0) * 100)}%` }} />
                </div>
                <div className="line">
                  <span className="small">Closes {timeWords(round.expiry, now)}</span>
                  {yes != null ? (
                    <span className="small">
                      <b style={{ color: yes >= 0.5 ? 'var(--green-text)' : 'var(--down-text)' }}>{pct(yes >= 0.5 ? yes : 1 - yes)}</b> lean{' '}
                      {yes >= 0.5 ? 'yes' : 'no'}
                    </span>
                  ) : null}
                </div>
                <div className="yesno">
                  <button type="button" className="yes" onClick={() => setOpen({ q, side: 'up' })}>
                    Yes <span className="mono">{yes != null ? `${Math.round(yes * 100)}¢` : '—'}</span>
                  </button>
                  <button type="button" className="no" onClick={() => setOpen({ q, side: 'down' })}>
                    No <span className="mono">{yes != null ? `${Math.round((1 - yes) * 100)}¢` : '—'}</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {open ? <QuestionSheet key={`${open.q.line.tick}`} question={open.q} initialSide={open.side} now={now} onClose={() => setOpen(null)} /> : null}
    </section>
  );
}

function QuestionSheet({ question, initialSide, now, onClose }: { question: Question; initialSide: Side; now: number; onClose: () => void }) {
  const [side, setSide] = useState<Side>(initialSide);
  const odds = useOdds(question.market, question.line.tick);
  return (
    <Sheet open onClose={onClose} title="Your answer">
      <Ticket
        plain
        market={question.market}
        line={question.line}
        side={side}
        onSide={(s) => {
          if (s !== 'range') setSide(s); // a yes/no question has no range
        }}
        odds={odds}
        now={now}
        nextRound={null}
        onPickNext={() => {}}
      />
    </Sheet>
  );
}
