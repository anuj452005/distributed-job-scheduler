import { createBrowserRouter } from 'react-router-dom';
import AppShell from './components/shell/AppShell.tsx';
import SignInPage from './pages/SignInPage.tsx';
import DashboardHomePage from './pages/DashboardHomePage.tsx';
import WorkflowsPage from './pages/workflows/WorkflowsPage.tsx';
import WorkflowCreatePage from './pages/workflows/WorkflowCreatePage.tsx';
import WorkflowDetailPage from './pages/workflows/WorkflowDetailPage.tsx';
import RunsListPage from './pages/runs/RunsListPage.tsx';
import RunDetailPage from './pages/runs/RunDetailPage.tsx';
import NotFoundPage from './pages/NotFoundPage.tsx';

export const router = createBrowserRouter([
  {
    path: '/sign-in',
    element: <SignInPage />,
  },
  {
    path: '/',
    element: <AppShell />,
    errorElement: <NotFoundPage />,
    children: [
      {
        index: true,
        element: <DashboardHomePage />,
      },
      {
        path: 'workflows',
        element: <WorkflowsPage />,
      },
      {
        path: 'workflows/new',
        element: <WorkflowCreatePage />,
      },
      {
        path: 'workflows/:id',
        element: <WorkflowDetailPage />,
      },
      {
        path: 'runs',
        element: <RunsListPage />,
      },
      {
        path: 'runs/:id',
        element: <RunDetailPage />,
      },
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
]);

export default function App() {
  return null;
}
