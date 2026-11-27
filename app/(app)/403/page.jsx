import Link from 'next/link';

export default function ForbiddenPage() {
  return (
    <section className="surface-panel" style={{ maxWidth: '560px', margin: '40px auto', textAlign: 'center' }}>
      <h1 className="page-title">403 - Akses Ditolak</h1>
      <p className="page-subtitle" style={{ margin: '10px auto 20px' }}>
        Peran atau penugasan unit Anda tidak memiliki izin untuk membuka halaman atau berkas ini.
      </p>
      <Link href="/dokumen" className="btn btn-primary">Kembali ke Daftar Dokumen</Link>
    </section>
  );
}
