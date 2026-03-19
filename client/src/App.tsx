import { useMemo } from 'react'
import './App.css'
import { ControllerApp } from './controller/ControllerApp'
import { ScreenApp } from './screen/ScreenApp'

type Role = 'screen' | 'controller'

function App() {
  const initialRole = useMemo<Role>(() => {
    const roleParam = new URLSearchParams(window.location.search).get('role')
    if (roleParam === 'controller') return 'controller'
    return 'screen'
  }, [])

  if (initialRole === 'controller') {
    return <ControllerApp />
  }

  return <ScreenApp />
}

export default App
