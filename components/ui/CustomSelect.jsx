'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';

export function CustomSelect({
  id,
  ariaLabel,
  ariaLabelledBy,
  value,
  options,
  onChange,
  compact = false,
  disabled = false,
}) {
  const autoId = useId();
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const searchRef = useRef(null);
  const optionRefs = useRef([]);
  const [open, setOpen] = useState(false);
  const [dropup, setDropup] = useState(false);
  const [query, setQuery] = useState('');

  const searchable = options.length > 8;
  const selectedOption = options.find((opt) => opt.value === value) || options[0] || null;

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) => opt.label.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (searchable) {
      const timer = setTimeout(() => searchRef.current?.focus(), 20);
      return () => clearTimeout(timer);
    }
    const activeIdx = filteredOptions.findIndex((opt) => opt.value === value);
    if (activeIdx >= 0) {
      optionRefs.current[activeIdx]?.scrollIntoView({ block: 'nearest' });
    }
    return undefined;
  }, [open, searchable, filteredOptions, value]);

  function handleToggle(e) {
    e.stopPropagation();
    if (disabled) return;
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setDropup(spaceBelow < 240 && rect.top > 240);
      setQuery('');
    }
    setOpen((prev) => !prev);
  }

  function selectValue(nextVal) {
    setOpen(false);
    triggerRef.current?.focus();
    if (nextVal !== value) onChange?.(nextVal);
  }

  function handleKeyDown(e) {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const buttons = optionRefs.current.filter(Boolean);
      if (!buttons.length) return;
      const idx = buttons.indexOf(document.activeElement);
      const next = e.key === 'ArrowDown' ? (idx + 1) % buttons.length : (idx - 1 + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }
  }

  return (
    <div
      ref={wrapRef}
      className={`cselect${compact ? ' is-compact' : ''}${dropup ? ' dropup' : ''}${open ? ' open' : ''}`}
      onKeyDown={handleKeyDown}
    >
      <button
        ref={triggerRef}
        id={id || autoId}
        type="button"
        className="cselect-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        disabled={disabled}
        onClick={handleToggle}
      >
        <span className="cselect-value">{selectedOption ? selectedOption.label : ''}</span>
        <svg
          className="cselect-chevron"
          viewBox="0 0 20 20"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5.5 7.5L10 12l4.5-4.5" />
        </svg>
      </button>

      <div className="cselect-menu">
        {searchable ? (
          <div className="cselect-search-wrap">
            <input
              ref={searchRef}
              type="search"
              className="cselect-search"
              placeholder="Cari opsi..."
              aria-label="Cari opsi dropdown"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        ) : null}

        <div className="cselect-list" role="listbox">
          {filteredOptions.length === 0 ? (
            <div className="cselect-empty">Opsi tidak ditemukan</div>
          ) : (
            filteredOptions.map((opt, idx) => {
              const isSel = opt.value === value;
              return (
                <button
                  key={opt.value}
                  ref={(el) => { optionRefs.current[idx] = el; }}
                  type="button"
                  role="option"
                  className="cselect-option"
                  aria-selected={isSel}
                  onClick={() => selectValue(opt.value)}
                >
                  <span>{opt.label}</span>
                  <svg
                    className="cselect-check"
                    viewBox="0 0 20 20"
                    width="15"
                    height="15"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ opacity: isSel ? 1 : 0 }}
                    aria-hidden="true"
                  >
                    <path d="M16 6l-7.5 8L4.5 10" />
                  </svg>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
