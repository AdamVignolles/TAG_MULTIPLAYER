import { useMemo } from 'react'
import './App.css'
import { ControllerApp } from './controller/ControllerApp'
import { ScreenApp } from './screen/ScreenApp'

type Role = 'screen' | 'controller'

function App() {
  const initialRole = useMemo<Role>(() => {
    const path = window.location.pathname

    if (path === '/' || path === '/controller') return 'controller'
    if (path === '/game' || path === '/home' || path === '/map') return 'screen'

    return 'controller'
  }, [])

  if (initialRole === 'controller') {
    return <ControllerApp />
  }

  return <ScreenApp />
}

export default App
