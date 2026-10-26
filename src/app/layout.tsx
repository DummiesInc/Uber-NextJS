import type { Metadata } from 'next';
import { Inter, Poppins } from 'next/font/google';
import 'leaflet/dist/leaflet.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@/app/globals.css';

const inter = Inter({ variable: '--font-inter', subsets: ['latin'] });
const poppins = Poppins({
  variable: '--font-poppins',
  subsets: ['latin'],
  weight: ['400', '600', '700']
});

export const metadata: Metadata = {
  title: 'Mini-Uber · Omaha on H3',
  description: 'Uber-style ride dispatch simulator on the H3 hexagon grid'
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${poppins.variable} font-inter antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
