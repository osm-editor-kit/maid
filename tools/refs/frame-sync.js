/**
 * Camera sync for the compare page. Loaded by every editor host page (plain script, no build).
 * The frame under the pointer leads: it posts its camera to the parent page, which relays it
 * to the other frames. Uses window.__bench only, so it is the same for every editor.
 */
;(() => {
  if (window.parent === window) return
  let leading = false
  let last = ''
  let lastFrame = performance.now()
  let frameTimes = []
  window.addEventListener('pointerenter', () => (leading = true), true)
  window.addEventListener('pointermove', () => (leading = true), true)
  window.addEventListener('pointerleave', () => (leading = false), true)
  window.addEventListener('message', (event) => {
    const bench = window.__bench
    if (!bench || !event.data) return
    if (event.data.type === 'maid-compare-camera' && !leading) bench.setCamera(event.data.camera)
    if (event.data.type === 'maid-compare-lead') leading = event.data.editor === bench.editor
  })
  const tick = (now) => {
    frameTimes.push(now - lastFrame)
    lastFrame = now
    const bench = window.__bench
    if (bench) {
      if (leading) {
        const camera = bench.getCamera()
        const key = `${camera.lng.toFixed(7)}/${camera.lat.toFixed(7)}/${camera.zoom.toFixed(3)}`
        if (key !== last) {
          last = key
          window.parent.postMessage({ type: 'maid-compare-camera', editor: bench.editor, camera }, '*')
        }
      }
      if (frameTimes.length >= 30) {
        const worst = Math.max(...frameTimes)
        const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length
        window.parent.postMessage({ type: 'maid-compare-frames', editor: bench.editor, fps: 1000 / avg, worst }, '*')
        frameTimes = []
      }
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})()
