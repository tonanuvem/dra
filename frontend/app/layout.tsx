import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'
import { AuthGuard }    from '@/components/auth/AuthGuard'
import { ClientLayout } from '@/components/layout/ClientLayout'

export const metadata: Metadata = {
  title: 'Auditoria Endoscopia',
  description: 'Sistema de apoio à decisão para faturamento de endoscopia',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className="h-full">
        <AuthProvider>
          <AuthGuard>
            <ClientLayout>
              {children}
            </ClientLayout>
          </AuthGuard>
        </AuthProvider>
      </body>
    </html>
  )
}
