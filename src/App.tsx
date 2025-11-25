import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import PersonsList from './pages/PersonsList';
import ActivitiesList from './pages/ActivitiesList';
import PersonDetail from './pages/PersonDetail';
import Pipelines from './pages/Pipelines';
import Teams from './pages/Teams';
import Deals from './pages/Deals';
import DealDetail from './pages/DealDetail';
import Organizations from './pages/Organizations';
import Users from './pages/Users';
import Login from './pages/Login';
import AppLayout from './components/AppLayout';
import { getStoredToken } from './utils/authToken';
import './App.css';
import AcceptInvitation from './pages/AcceptInvitation';
import ResetPassword from './pages/ResetPassword';
import SalesDashboard from './pages/SalesDashboard';
import CategoryManagerDashboard from './pages/CategoryManagerDashboard';
import PreSalesDashboard from './pages/PreSalesDashboard';
import Targets from './pages/Targets';
import TargetUserDetail from './pages/TargetUserDetail';

function RequireAuth({ children }: { children: JSX.Element }) {
  const location = useLocation();
  const token = getStoredToken();
  
  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children;
}

// Unused components - kept for potential future use
// function RequireGuest({ children }: { children: JSX.Element }) {
//   const token = getStoredToken();
//   if (token) {
//     return <Navigate to="/persons" replace />;
//   }
//   return children;
// }

// function RoleAwareHome() {
//   const storedUser = getStoredUser();
//   const dashboardRoute = resolveRoleDashboardRoute(storedUser?.role);
//   if (dashboardRoute && dashboardRoute !== '/') {
//     return <Navigate to={dashboardRoute} replace />;
//   }
//   return <PersonsList />;
// }

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/accept-invitation" element={<AcceptInvitation />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route
          element={(
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          )}
        >
          {/* Root redirect */}
          <Route path="/" element={<Navigate to="/persons" replace />} />
          
          {/* Individual page routes */}
          <Route path="/persons" element={<PersonsList />} />
          <Route path="/persons/:id" element={<PersonDetail />} />
          <Route path="/activities" element={<ActivitiesList />} />
          <Route path="/pipelines" element={<Pipelines />} />
          <Route path="/teams" element={<Teams />} />
          <Route path="/organizations" element={<Organizations />} />
          <Route path="/deals" element={<Deals />} />
          <Route path="/deals/:id" element={<DealDetail />} />
          <Route path="/users" element={<Users />} />
          <Route path="/targets" element={<Targets />} />
          <Route path="/targets/users/:userId" element={<TargetUserDetail />} />
          
          {/* Catch all for protected routes - redirect to persons if route not found */}
          <Route path="*" element={<Navigate to="/persons" replace />} />
          <Route path="/dashboard/sales" element={<SalesDashboard />} />
          <Route path="/dashboard/category-manager" element={<CategoryManagerDashboard />} />
          <Route path="/dashboard/pre-sales" element={<PreSalesDashboard />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;

