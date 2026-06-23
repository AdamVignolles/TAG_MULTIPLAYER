import { useMemo } from 'react'
import './App.css'
import { ControllerApp } from './controller/ControllerApp'
import { ScreenApp } from './screen/ScreenApp'

type Role = 'screen' | 'controller'

function App() {
  const initialRole = useMemo<Role>(() => {
    const path = window.location.pathname

    if (path === '/game' || path === '/home' || path === '/map') return 'screen'
    // Any other path is a controller (could be / or /XXXX room code)
    return 'controller'
  }, [])

  if (initialRole === 'controller') {
    return <ControllerApp />
  }

  return <ScreenApp />
}

export default App
