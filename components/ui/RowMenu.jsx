'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

export function RowMenu({ triggerLabel, items }) {
  const triggerRef = useRef(null);
  const popRef = useRef(null);
  const itemRefs = useRef([]);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !popRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const popRect = popRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow < popRect.height + 12 && rect.top > popRect.height + 12
      ? rect.top - popRect.height - 6
      : rect.bottom + 6;
    const left = Math.max(12, Math.min(window.innerWidth - popRect.width - 12, rect.right - popRect.width));
    setPos({ top: Math.round(top), left: Math.round(left) });
    setReady(true);
    const frame = requestAnimationFrame(() => itemRefs.current[0]?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setReady(false);
      return undefined;
    }
    const close = () => setOpen(false);
    const onDocClick = (e) => {
      if (
        popRef.current &&
        !popRef.current.contains(e.target) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target)
      ) {
        close();
      }
    };
    document.addEventListener('click', onDocClick);
    window.addEventListener('scroll', close, { passive: true });
    return () => {
      document.removeEventListener('click', onDocClick);
      window.removeEventListener('scroll', close);
    };
  }, [open]);

  function handleMenuKeyDown(e) {
    const buttons = itemRefs.current.filter(Boolean);
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!buttons.length) return;
      const idx = buttons.indexOf(document.activeElement);
      const next = e.key === 'ArrowDown' ? (idx + 1) % buttons.length : (idx - 1 + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="row-menu-btn"
        aria-label={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
      >
        <Icon name="dots" />
      </button>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={popRef}
              className={`row-menu-popover${ready ? ' open' : ''}`}
              role="menu"
              style={{ top: `${pos.top}px`, left: `${pos.left}px` }}
              onKeyDown={handleMenuKeyDown}
            >
              {items.map((item, idx) => (
                <button
                  key={item.label}
                  ref={(el) => { itemRefs.current[idx] = el; }}
                  type="button"
                  role="menuitem"
                  className={`row-menu-item${item.danger ? ' danger' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                    item.onClick?.();
                  }}
                >
                  {item.icon ? <Icon name={item.icon} /> : null}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
