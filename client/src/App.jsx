import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import { Spinner } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Requests from './pages/Requests.jsx';
import NewRequest from './pages/NewRequest.jsx';
import RequestDetail from './pages/RequestDetail.jsx';
import Equipment from './pages/Equipment.jsx';
import EquipmentDetail from './pages/EquipmentDetail.jsx';
import Bookings from './pages/Bookings.jsx';
import Consumables from './pages/Consumables.jsx';
import Cart from './pages/Cart.jsx';
import Notifications from './pages/Notifications.jsx';
import Announcements from './pages/Announcements.jsx';
import Stats from './pages/Stats.jsx';
import Maintenance from './pages/Maintenance.jsx';
import ActivityLog from './pages/ActivityLog.jsx';
import UsersPage from './pages/Users.jsx';
import DbInspector from './pages/DbInspector.jsx';
import Profile from './pages/Profile.jsx';

function Protected({ children, staff }) {
  const { user, isStaff } = useAuth();
  if (user === undefined) return <Spinner className="h-full" />;
  if (!user) return <Navigate to="/login" replace />;
  if (staff && !isStaff) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/" /> : <Login register />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route index element={<Dashboard />} />
        <Route path="requests" element={<Requests />} />
        <Route path="requests/new" element={<NewRequest />} />
        <Route path="requests/:id" element={<RequestDetail />} />
        <Route path="equipment" element={<Equipment />} />
        <Route path="equipment/:id" element={<EquipmentDetail />} />
        <Route path="bookings" element={<Bookings />} />
        <Route path="consumables" element={<Consumables />} />
        <Route path="cart" element={<Cart />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="announcements" element={<Announcements />} />
        <Route path="stats" element={<Stats />} />
        <Route path="profile" element={<Profile />} />
        <Route path="maintenance" element={<Protected staff><Maintenance /></Protected>} />
        <Route path="activity" element={<Protected staff><ActivityLog /></Protected>} />
        <Route path="users" element={<Protected staff><UsersPage /></Protected>} />
        <Route path="db" element={<Protected staff><DbInspector /></Protected>} />
        <Route path="*" element={<Navigate to="/" />} />
      </Route>
    </Routes>
  );
}
