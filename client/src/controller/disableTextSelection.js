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
