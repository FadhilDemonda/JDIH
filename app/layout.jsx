import '../mockup/styles.css';
import { JdihProvider } from '@/components/providers/JdihProvider';

export const metadata = {
  title: 'JDIH RS AN-NISA - Jaringan Dokumentasi dan Informasi Hukum',
  description: 'Repositori Regulasi Internal RS AN-NISA Tangerang',
  icons: { icon: '/assets/logo-rs-annisa.png' },
};

export default function RootLayout({ children }) {
  return (
    <html lang="id" data-theme="light" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@600;700&family=Public+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('jdih_theme')==='dark')document.documentElement.setAttribute('data-theme','dark');}catch{}",
          }}
        />
      </head>
      <body>
        <JdihProvider>{children}</JdihProvider>
      </body>
    </html>
  );
}
