import Link from 'next/link';

export default function NotFoundPage() {
  return (
    <div className="app-shell auth-only">
      <div className="workspace-frame">
        <main id="main-content" className="main-content" tabIndex={-1}>
          <section className="surface-panel" style={{ maxWidth: '560px', margin: '40px auto', textAlign: 'center' }}>
            <h1 className="page-title">404 - Halaman Tidak Ditemukan</h1>
            <p className="page-subtitle" style={{ margin: '10px auto 20px' }}>
              Alamat halaman yang Anda buka tidak tersedia pada JDIH RS AN-NISA.
            </p>
            <Link href="/dokumen" className="btn btn-primary">Kembali ke Daftar Dokumen</Link>
          </section>
        </main>
      </div>
    </div>
  );
}
