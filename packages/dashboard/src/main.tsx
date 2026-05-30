import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/react'
import { RouterProvider } from 'react-router-dom'
import { router } from './App.tsx'
import './styles/globals.css'

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!publishableKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY environment variable")
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider publishableKey={publishableKey}>
      <RouterProvider router={router} />
    </ClerkProvider>
  </StrictMode>,
)
