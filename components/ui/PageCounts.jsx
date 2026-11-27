'use client';

import { Icon } from './Icon';

export function PageCounts({ label, counts, cards = false }) {
  return (
    <dl className={`page-counts ${cards ? 'page-counts-cards' : 'page-counts-inline'}`} aria-label={label}>
      {counts.map((item) => (
        <div key={item.label} data-tone={item.tone || 'neutral'}>
          <dt>
            {item.label}
            {item.icon ? (
              <span className="page-count-icon" aria-hidden="true">
                <Icon name={item.icon} />
              </span>
            ) : null}
          </dt>
          <dd className="tabular">{item.count}</dd>
        </div>
      ))}
    </dl>
  );
}
