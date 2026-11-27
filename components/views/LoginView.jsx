'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useJdih } from '@/components/providers/JdihProvider';
import { Icon } from '@/components/ui/Icon';
import { api } from '@/lib/api';
import { getCurrentUser } from '@/lib/domain';
import { formatNikInput } from '@/lib/format';

const FLOW_STEPS = [
  { id: 'draft', title: 'Susun', status: 'Draf', caption: 'Koordinator IGD menyusun draf SPO Triase IGD.' },
  { id: 'submit', title: 'Ajukan', status: 'Menunggu verifikasi', caption: 'Draf masuk ke antrean verifikasi Manajer IGD.' },
  { id: 'review', title: 'Verifikasi', status: 'Disetujui', caption: 'Manajer IGD memeriksa dan menyetujui dokumen.' },
  { id: 'publish', title: 'Terbit', status: 'Terbit', caption: 'Staf dapat menemukan SPO Triase IGD di pencarian dokumen.' },
];

export function LoginView() {
  const router = useRouter();
  const { state, loaded, loggedIn, theme, toggleThemeWithMotion, receive } = useJdih();
  const [nik, setNik] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const stageRef = useRef(null);
  const timerRef = useRef(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [playing, setPlaying] = useState(false);

  const user = getCurrentUser(state);

  useEffect(() => {
    if (!loaded || !loggedIn) return;
    router.replace(user?.must_change_password ? '/ganti-password' : '/dokumen');
  }, [loaded, loggedIn, user, router]);

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
    setReducedMotion(reduced);
    if (reduced) {
      setCurrentStep(FLOW_STEPS.length - 1);
      setPlaying(false);
      return undefined;
    }
    const el = stageRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setPlaying(true);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    clearTimeout(timerRef.current);
    if (!playing || reducedMotion) return undefined;
    timerRef.current = setTimeout(() => {
      setCurrentStep((prev) => (prev + 1) % FLOW_STEPS.length);
    }, 2100);
    return () => clearTimeout(timerRef.current);
  }, [playing, currentStep, reducedMotion]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const payload = await api('auth/login', 'POST', { nik: formatNikInput(nik), password });
      if (payload.state) receive(payload.state);
      const nextUser = payload.state?.users?.find((u) => u.id === payload.state?.currentUserId);
      router.replace(nextUser?.must_change_password ? '/ganti-password' : '/dokumen');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const step = FLOW_STEPS[currentStep];
  const lastStep = FLOW_STEPS.length - 1;
  const playAction = playing ? 'Jeda' : currentStep === lastStep ? 'Putar ulang' : 'Putar';

  return (
    <section className="login-portal" aria-label="Portal Masuk JDIH RS AN-NISA">
      <div className="login-form-stage">
        <div className="login-form-top">
          <span className="meta-label-sm" style={{ fontWeight: 500 }}>Akses Internal Pegawai</span>
          <button
            id="login-theme-btn"
            className="icon-btn topbar-action-btn"
            type="button"
            aria-label="Ubah tema tampilan"
            aria-pressed={theme === 'dark'}
            onClick={toggleThemeWithMotion}
          >
            <span className="theme-icon-stage" aria-hidden="true">
              <svg className="theme-svg theme-svg-sun" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="10" cy="10" r="3.5" />
                <path d="M10 2.2v1.6M10 16.2v1.6M2.2 10h1.6M16.2 10h1.6M4.5 4.5l1.1 1.1M14.4 14.4l1.1 1.1M15.5 4.5l-1.1 1.1M5.6 14.4l-1.1 1.1" />
              </svg>
              <svg className="theme-svg theme-svg-moon" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16.8 11.9A6.8 6.8 0 018.1 3.2a7 7 0 108.7 8.7z" />
              </svg>
            </span>
          </button>
        </div>

        <div className="login-form-box">
          <div className="auth-header">
            <div className="auth-crest">
              <img src="/assets/logo-rs-annisa.png" alt="Logo RS An-Nisa Tangerang" width="42" height="56" className="auth-logo" decoding="async" />
            </div>
            <div>
              <h1 className="page-title">Masuk JDIH RS AN-NISA</h1>
              <p className="page-subtitle">Gunakan NIK pegawai format 0000.00.00 dan password akun Anda.</p>
            </div>
          </div>

          <form id="login-form" onSubmit={handleSubmit} noValidate>
            <div className="field-grid">
              <div className="field col-12">
                <label htmlFor="login-nik">NIK Pegawai</label>
                <input
                  id="login-nik"
                  className="input tabular"
                  inputMode="numeric"
                  placeholder="1221.21.23"
                  maxLength={10}
                  autoComplete="username"
                  value={nik}
                  onChange={(e) => setNik(formatNikInput(e.target.value))}
                />
                <p className="field-help">Titik disisipkan otomatis saat mengetik 8 digit angka.</p>
              </div>
              <div className="field col-12">
                <label htmlFor="login-pass">Password</label>
                <div className="pass-input-wrap">
                  <input
                    id="login-pass"
                    type={showPass ? 'text' : 'password'}
                    className="input"
                    placeholder="Masukkan password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    id="login-pass-toggle"
                    className="icon-btn pass-toggle-btn"
                    aria-label={showPass ? 'Sembunyikan password' : 'Tampilkan password'}
                    aria-pressed={showPass}
                    onClick={() => setShowPass((prev) => !prev)}
                  >
                    <Icon name="eye" size={17} />
                  </button>
                </div>
              </div>
              <div className="col-12">
                <p id="login-error" className="field-error" role="alert" hidden={!error}>
                  {error}
                </p>
              </div>
              <div className="col-12">
                <button type="submit" className="btn btn-primary btn-full" disabled={submitting}>
                  Masuk ke Sistem
                </button>
              </div>
            </div>
          </form>
        </div>

        <div className="meta-label-sm" style={{ textAlign: 'center' }}>
          RS AN-NISA Tangerang · Repositori Regulasi Internal
        </div>
      </div>

      <div className="login-brand-stage">
        <div className="login-brand-top">
          <span className="brand-mark">
            <img src="/assets/logo-rs-annisa.png" alt="Logo RS An-Nisa Tangerang" width="32" height="42" className="brand-logo" decoding="async" />
          </span>
          <span className="brand-copy">
            <strong className="brand-title">JDIH RS AN-NISA</strong>
            <span className="brand-sub">Jaringan Dokumentasi dan Informasi Hukum</span>
          </span>
        </div>

        <div className="login-hero-copy">
          <h2 className="login-hero-title">Dari meja unit ke seluruh rumah sakit.</h2>
          <p className="login-hero-sub">Ikuti perjalanan satu SPO, dari draf unit hingga dapat ditemukan oleh staf RS AN-NISA.</p>
        </div>

        <div className="document-story">
          <div ref={stageRef} className="story-stage" data-step={step.id} aria-hidden="true">
            <div className="story-desk">
              <div className="story-folder"><span>IGD</span></div>
              <div className="story-tray"><span>Manajer IGD</span></div>
              <div className="story-search"><Icon name="search" /><span>triase</span></div>
              <div className="story-sheet">
                <div className="story-letterhead"><img src="/assets/logo-rs-annisa.png" alt="" width="22" height="29" /> RS AN-NISA</div>
                <strong className="story-title">SPO Triase IGD</strong>
                <small>RSAN/SPO/5/IGD/011 · Rev 00</small>
                <div className="story-rules"><i /><i /><i /></div>
                <span className="story-status"><span>{step.status}</span></span>
              </div>
            </div>
          </div>
          <p className="story-caption">{step.caption}</p>
          <div className="story-controls" role="group" aria-label="Tahap alur dokumen">
            {FLOW_STEPS.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                className="story-step"
                aria-pressed={idx === currentStep}
                onClick={() => {
                  setPlaying(false);
                  setCurrentStep(idx);
                }}
              >
                {s.title}
              </button>
            ))}
            <button
              type="button"
              className="story-playback"
              hidden={reducedMotion}
              aria-label={`${playAction} animasi alur dokumen`}
              title={playAction}
              onClick={() => {
                if (playing) {
                  setPlaying(false);
                } else {
                  if (currentStep === lastStep) setCurrentStep(0);
                  setPlaying(true);
                }
              }}
            >
              <Icon name={playing ? 'pause' : currentStep === lastStep ? 'undo' : 'play'} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
