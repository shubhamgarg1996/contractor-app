import { Routes, Route, Navigate } from 'react-router-dom';
import Layout            from './components/Layout.jsx';
import Login             from './pages/Login.jsx';
import ChangePassword    from './pages/ChangePassword.jsx';
import ContractorsList   from './pages/ContractorsList.jsx';
import ContractorDetail  from './pages/ContractorDetail.jsx';
import Dashboard         from './pages/Dashboard.jsx';
import ImportPage        from './pages/ImportPage.jsx';
import AuditPage         from './pages/AuditPage.jsx';
import UsersPage         from './pages/UsersPage.jsx';
import MastersPage       from './pages/MastersPage.jsx';

export default function App() {
  return (
    <Routes>
      {/* Public — no sidebar */}
      <Route path="/login"           element={<Login />} />
      <Route path="/change-password" element={<ChangePassword />} />

      {/* Authenticated — wrapped in Layout (sidebar + topbar) */}
      <Route path="/" element={<Layout />}>
        <Route index                        element={<Navigate to="/contractors" replace />} />
        <Route path="contractors"           element={<ContractorsList />} />
        <Route path="contractors/new"       element={<ContractorDetail mode="new" />} />
        <Route path="contractors/:hrmid"    element={<ContractorDetail mode="edit" />} />
        <Route path="dashboard"             element={<Dashboard />} />
        <Route path="import"                element={<ImportPage />} />
        <Route path="audit/:hrmid"          element={<AuditPage />} />
        <Route path="users"                 element={<UsersPage />} />
        <Route path="masters"               element={<MastersPage />} />
      </Route>
    </Routes>
  );
}
