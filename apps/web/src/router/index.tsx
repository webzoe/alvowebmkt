import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { useAuth } from '../hooks/useAuth';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { LoginPage } from '../pages/auth/LoginPage';
import { DashboardPage } from '../pages/dashboard/DashboardPage';
import { ClientsPage } from '../pages/clients/ClientsPage';
import { ServersPage } from '../pages/servers/ServersPage';
import { SendTestPage } from '../pages/servers/SendTestPage';
import { ListsPage } from '../pages/lists/ListsPage';
import { ListDetailPage } from '../pages/lists/ListDetailPage';
import { ContactsPage } from '../pages/contacts/ContactsPage';
import { SuppressionsPage } from '../pages/suppressions/SuppressionsPage';
import { ImportsPage } from '../pages/imports/ImportsPage';
import { NewImportPage } from '../pages/imports/NewImportPage';
import { CampaignsPage } from '../pages/campaigns/CampaignsPage';
import { CampaignFormPage } from '../pages/campaigns/CampaignFormPage';
import { CampaignDetailPage } from '../pages/campaigns/CampaignDetailPage';
import { CampaignRecipientsPage } from '../pages/campaigns/CampaignRecipientsPage';
import { CampaignEventsPage } from '../pages/campaigns/CampaignEventsPage';
import { CampaignLinksPage } from '../pages/campaigns/CampaignLinksPage';
import { CampaignReportPage } from '../pages/campaigns/CampaignReportPage';
import { CalendarPage } from '../pages/calendar/CalendarPage';
import { SettingsPage } from '../pages/settings/SettingsPage';

function ProtectedLayout() {
  const { session, loading } = useAuth();
  if (loading) return <LoadingSpinner className="h-screen" />;
  if (!session) return <Navigate to="/login" replace />;
  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}

function PublicRoute() {
  const { session, loading } = useAuth();
  if (loading) return <LoadingSpinner className="h-screen" />;
  if (session) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

export const router = createBrowserRouter([
  {
    element: <PublicRoute />,
    children: [{ path: '/login', element: <LoginPage /> }],
  },
  {
    element: <ProtectedLayout />,
    children: [
      { path: '/dashboard', element: <DashboardPage /> },
      { path: '/clients', element: <ClientsPage /> },
      { path: '/servers', element: <ServersPage /> },
      { path: '/servers/:serverId/test', element: <SendTestPage /> },
      { path: '/lists', element: <ListsPage /> },
      { path: '/lists/:id', element: <ListDetailPage /> },
      { path: '/contacts', element: <ContactsPage /> },
      { path: '/suppressions', element: <SuppressionsPage /> },
      { path: '/imports', element: <ImportsPage /> },
      { path: '/imports/new', element: <NewImportPage /> },
      { path: '/campaigns', element: <CampaignsPage /> },
      { path: '/campaigns/new', element: <CampaignFormPage mode="create" /> },
      { path: '/campaigns/:id/edit', element: <CampaignFormPage mode="edit" /> },
      { path: '/campaigns/:id', element: <CampaignDetailPage /> },
      { path: '/campaigns/:id/recipients', element: <CampaignRecipientsPage /> },
      { path: '/campaigns/:id/events', element: <CampaignEventsPage /> },
      { path: '/campaigns/:id/links', element: <CampaignLinksPage /> },
      { path: '/campaigns/:id/report', element: <CampaignReportPage /> },
      { path: '/calendar', element: <CalendarPage /> },
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
  { path: '/', element: <Navigate to="/dashboard" replace /> },
  { path: '*', element: <Navigate to="/dashboard" replace /> },
]);
