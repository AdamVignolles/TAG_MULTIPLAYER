import { useMemo, useEffect } from 'react'
import './App.css'
import { ControllerApp } from './controller/ControllerApp'
import { ScreenApp } from './screen/ScreenApp'

type Role = 'screen' | 'controller'

function App() {
  const initialRole = useMemo<Role>(() => {
    const roleParam = new URLSearchParams(window.location.search).get('role')
    if (roleParam === 'controller') return 'controller'
    
    // Fallback: check localStorage pour les PWA lancées depuis écran d'accueil
    const savedRole = localStorage.getItem('selectedRole') as Role | null
    if (savedRole === 'controller') return 'controller'
    
    return 'screen'
  }, [])

  // Sauvegarder le rôle sélectionné pour PWA
  useEffect(() => {
    localStorage.setItem('selectedRole', initialRole)
  }, [initialRole])

  if (initialRole === 'controller') {
    return <ControllerApp />
  }

  return <ScreenApp />
}

export default App
