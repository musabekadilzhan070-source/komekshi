import type { Metadata, Viewport } from 'next';
import { Montserrat } from 'next/font/google';
import './globals.css';
import { ToastProvider } from '@/components/ui/toast';

// cyrillic-ext: Ә Ғ Қ Ң Ө Ұ Ү Һ І әріптері осы жиынтықта
const montserrat = Montserrat({
  subsets: ['latin', 'cyrillic', 'cyrillic-ext'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-montserrat',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'KÓMEKSHI — жеке оқу кеңістігі', template: '%s · KÓMEKSHI' },
  description: 'Оқушы, куратор және ұйымдастырушыға арналған білім беру платформасы.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#082052',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="kk" className={montserrat.variable}>
      <body className="min-h-dvh font-sans">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
