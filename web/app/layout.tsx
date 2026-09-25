import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://beautyflow-crm.example.com'),
  title: 'BeautyFlow CRM | SaaS UI, CRM и суперадмин',
  description: 'Премиальный фронтенд BeautyFlow CRM: лендинг, онлайн-запись, календарь, биллинг владельца, суперадмин, аналитика и Cloudflare/DDoS.',
  keywords: ['BeautyFlow CRM', 'CRM для салона красоты', 'онлайн-запись', 'календарь салона', 'SaaS billing', 'multi-tenant CRM'],
  applicationName: 'BeautyFlow CRM',
  authors: [{ name: 'BeautyFlow CRM' }],
  creator: 'BeautyFlow CRM',
  publisher: 'BeautyFlow CRM',
  robots: { index: true, follow: true },
  alternates: { canonical: '/' },
  openGraph: {
    title: 'BeautyFlow CRM | Премиальная CRM для салонов красоты',
    description: 'Лендинг, онлайн-запись, календарь мастеров, биллинг владельца, суперадмин и Cloudflare/DDoS контуры в одном Next.js интерфейсе.',
    url: '/',
    siteName: 'BeautyFlow CRM',
    locale: 'ru_RU',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BeautyFlow CRM | SaaS для салонов красоты',
    description: 'Демо CRM: маркетинг, запись клиентов, календарь, биллинг, суперадмин и security posture.',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
