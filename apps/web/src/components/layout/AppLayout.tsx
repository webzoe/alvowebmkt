import { type ReactNode } from 'react';
import { Sidebar } from './Sidebar';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div data-app-layout="root" className="flex h-screen overflow-hidden bg-canvas">
      <Sidebar />
      <main
        data-app-layout="main"
        className="flex-1 overflow-y-auto focus-visible:outline-none"
        tabIndex={-1}
      >
        {children}
      </main>
    </div>
  );
}
