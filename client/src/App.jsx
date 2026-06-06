import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import SetupProfile from './pages/SetupProfile';
import Inbox from './pages/Inbox';
import AuthGuard from './components/AuthGuard';
import GuestGuard from './components/GuestGuard';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Redirect root to login */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        
        {/* 🛡️ GUEST ROUTES: Only accessible if NOT fully logged in */}
        <Route element={<GuestGuard />}>
          <Route path="/login" element={<Login />} />
          <Route path="/setup-profile" element={<SetupProfile />} />
        </Route>
        
        {/* 🛡️ PROTECTED ROUTES: Only accessible if authenticated AND profile complete */}
        <Route element={<AuthGuard />}>
          <Route path="/inbox" element={<Inbox />} />
          {/* Future V2 routes like /groups and /settings will go inside this block */}
        </Route>
        
      </Routes>
    </BrowserRouter>
  );
}

export default App;