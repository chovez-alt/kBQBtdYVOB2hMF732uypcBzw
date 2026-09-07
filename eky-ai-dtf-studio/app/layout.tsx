import './globals.css';

export const metadata = {
  title: 'EKY AI DTF Studio',
  description: 'AI-powered DTF artwork creator',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'EKY DTF', statusBarStyle: 'black-translucent' as const },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
