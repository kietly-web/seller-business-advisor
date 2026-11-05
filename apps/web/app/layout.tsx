import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { t } from '../lib/messages';
import { siteUrl } from '../lib/site';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: { default: t.app.title, template: `%s | ${t.app.name}` },
  description: t.app.description,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'vi_VN',
    siteName: t.app.name,
    title: t.app.title,
    description: t.app.description,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
