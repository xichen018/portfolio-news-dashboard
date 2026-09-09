import { Routes, Route } from 'react-router'
import Home from './pages/Home'
import AuthGate from './components/AuthGate'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AuthGate>{(user,logout)=><Home user={user} onLogout={logout}/>}</AuthGate>} />
    </Routes>
  )
}
