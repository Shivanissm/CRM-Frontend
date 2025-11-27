import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Users from './pages/Users'
import Goals from './pages/Goals'
import Deals from './pages/Deals'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="users" element={<Users />} />
          <Route path="pipeline" element={<Dashboard />} />
          <Route path="person" element={<Dashboard />} />
          <Route path="activities" element={<Dashboard />} />
          <Route path="goals" element={<Goals />} />
          <Route path="deals" element={<Deals />} />
          <Route path="calendar" element={<Dashboard />} />
          <Route path="settings" element={<Dashboard />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App

