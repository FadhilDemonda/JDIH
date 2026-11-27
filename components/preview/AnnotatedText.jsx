'use client';

export function AnnotatedText({ text, field, index = null, annotations = [] }) {
  if (!text) return null;
  const spans = annotations.flatMap((annotation, number) => {
    if (annotation.field !== field || annotation.index !== index) return [];
    const { start, end, quote } = annotation;
    if (text.slice(start, end) === quote) return [{ start, end, number }];
    const found = text.indexOf(quote);
    return found !== -1 && text.indexOf(quote, found + 1) === -1
      ? [{ start: found, end: found + quote.length, number }]
      : [];
  });

  const breaks = [...new Set([0, text.length, ...spans.flatMap(({ start, end }) => [start, end])])].sort((a, b) => a - b);

  return (
    <span className="review-text" data-review-field={field} data-review-index={index ?? ''}>
      {breaks.slice(0, -1).map((start, i) => {
        const end = breaks[i + 1];
        const value = text.slice(start, end);
        const active = spans.filter((span) => span.start <= start && span.end > start);
        if (!active.length) return <span key={start}>{value}</span>;
        return (
          <mark
            key={start}
            className="review-marker"
            data-review-marks={active.map(({ number }) => number).join(' ')}
            title={active.map(({ number }) => annotations[number].note).join('\n')}
          >
            {value}
          </mark>
        );
      })}
    </span>
  );
}
