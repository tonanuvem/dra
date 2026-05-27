import type { Metadata } from 'next'
import './globals.css'
import { Sidebar } from '@/components/layout/Sidebar'

export const metadata: Metadata = {
  title: 'Auditoria Endoscopia',
  description: 'Sistema de apoio à decisão para faturamento de endoscopia',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className="h-full">
        <Sidebar />
        <main className="main-content min-h-screen p-6">
          {children}
        </main>
      </body>
    </html>
  )
}
