export function disableControllerTextSelection(target = document.body) {
  if (!target) {
    return () => {}
  }

  const previousUserSelect = target.style.userSelect
  const previousWebkitUserSelect = target.style.webkitUserSelect
  const previousMsUserSelect = target.style.msUserSelect
  const previousTouchCallout = target.style.webkitTouchCallout

  target.style.userSelect = 'none'
  target.style.webkitUserSelect = 'none'
  target.style.msUserSelect = 'none'
  target.style.webkitTouchCallout = 'none'

  const preventSelection = (event) => {
    event.preventDefault()
  }

  target.addEventListener('selectstart', preventSelection)

  return () => {
    target.removeEventListener('selectstart', preventSelection)
    target.style.userSelect = previousUserSelect
    target.style.webkitUserSelect = previousWebkitUserSelect
    target.style.msUserSelect = previousMsUserSelect
    target.style.webkitTouchCallout = previousTouchCallout
  }
}

export function disableControllerZoom(target = document.body) {
  if (!target) {
    return () => {}
  }

  const previousTouchAction = target.style.touchAction
  target.style.touchAction = 'none'

  const preventDefault = (event) => {
    event.preventDefault()
  }

  const preventCtrlZoom = (event) => {
    if (event.ctrlKey) {
      event.preventDefault()
    }
  }

  // iOS Safari gesture events are needed to reliably block pinch zoom.
  document.addEventListener('gesturestart', preventDefault)
  document.addEventListener('gesturechange', preventDefault)
  document.addEventListener('gestureend', preventDefault)
  document.addEventListener('wheel', preventCtrlZoom, { passive: false })

  return () => {
    document.removeEventListener('gesturestart', preventDefault)
    document.removeEventListener('gesturechange', preventDefault)
    document.removeEventListener('gestureend', preventDefault)
    document.removeEventListener('wheel', preventCtrlZoom)
    target.style.touchAction = previousTouchAction
  }
}
