/**
 * Camera sync for the compare page. Loaded by every editor host page (plain script, no build).
 * The compare page opens each editor in its own window, because iD and Rapid read
 * `window.top.location` and refuse to run inside a frame of another origin.
 * The window under the pointer leads: it posts its camera to the compare page, which relays it
 * to the other windows. Uses window.__bench only, so it is the same for every editor.
 */
;(() => {
  const hub = window.opener
  if (!hub) return
  // Only the compare page may drive the camera. It is this window's opener (the page that opened
  // it, so event.source is window.opener; window.parent is this window itself), and it is served
  // from a local host. An opaque or unparsable origin is refused.
  const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]']
  const fromCompare = (event) => {
    if (event.source !== hub) return false
    try {
      return LOCAL_HOSTS.includes(new URL(event.origin).hostname)
    } catch {
      return false
    }
  }
  let leading = false
  let last = ''
  let lastFrame = performance.now()
  let frameTimes = []
  window.addEventListener('pointerenter', () => (leading = true), true)
  window.addEventListener('pointermove', () => (leading = true), true)
  window.addEventListener('pointerleave', () => (leading = false), true)
  window.addEventListener('message', (event) => {
    if (!fromCompare(event)) return
    const bench = window.__bench
    if (!bench || !event.data) return
    try {
      if (event.data.type === 'maid-compare-camera' && !leading) bench.setCamera(event.data.camera)
    } catch {
      // the editor is still starting
    }
    if (event.data.type === 'maid-compare-lead') leading = event.data.editor === bench.editor
  })
  const tick = (now) => {
    frameTimes.push(now - lastFrame)
    lastFrame = now
    const bench = window.__bench
    if (bench) {
      let camera
      try {
        camera = leading ? bench.getCamera() : undefined
      } catch {
        // the editor is still starting
      }
      if (camera) {
        const key = `${camera.lng.toFixed(7)}/${camera.lat.toFixed(7)}/${camera.zoom.toFixed(3)}`
        if (key !== last) {
          last = key
          hub.postMessage({ type: 'maid-compare-camera', editor: bench.editor, camera }, '*')
        }
      }
      if (frameTimes.length >= 30) {
        const worst = Math.max(...frameTimes)
        const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length
        hub.postMessage({ type: 'maid-compare-frames', editor: bench.editor, fps: 1000 / avg, worst }, '*')
        frameTimes = []
      }
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})()
