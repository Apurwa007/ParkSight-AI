import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'ParkSight-AI | Traffic Command Center',
  description: 'Decision Intelligence Platform for Traffic Authorities',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-background text-white min-h-screen">
        {children}
      </body>
    </html>
  )
}
