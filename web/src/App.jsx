import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ContractorsList from './pages/ContractorsList.jsx';
import ContractorDetail from './pages/ContractorDetail.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ImportPage from './pages/ImportPage.jsx';
import AuditPage from './pages/AuditPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/contractors" replace />} />
        <Route path="contractors"          element={<ContractorsList />} />
        <Route path="contractors/new"      element={<ContractorDetail mode="new" />} />
        <Route path="contractors/:hrmid"   element={<ContractorDetail mode="edit" />} />
        <Route path="dashboard"            element={<Dashboard />} />
        <Route path="import"               element={<ImportPage />} />
        <Route path="audit/:hrmid"         element={<AuditPage />} />
      </Route>
    </Routes>
  );
}
