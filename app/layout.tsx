import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Stereo Voice Translator',
  description: 'แปลภาษาด้วยเสียง แยกหูซ้าย-ขวา',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body style={{ margin: 0, padding: 0, background: '#0a0a0f' }}>
        {children}
      </body>
    </html>
  )
}
