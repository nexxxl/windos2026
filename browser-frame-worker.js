/* Browser frame decoder/display worker.
 * JPEG base64 stays off the NexlOS main thread: decode to bytes, createImageBitmap
 * (raster threads), then draw onto the OffscreenCanvas owned by this worker.
 * The main thread only forwards the frame string and never touches pixels.
 */
let canvas = null
let ctx = null

self.onmessage = async (event) => {
  const message = event.data || {}
  if (message.type === 'init') {
    canvas = message.canvas
    ctx = canvas.getContext('2d')
    return
  }
  if (message.type === 'frame' && canvas && ctx) {
    try {
      const binary = atob(message.jpeg)
      const bytes = new Uint8Array(binary.length)
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
      const blob = new Blob([bytes], { type: 'image/jpeg' })
      const url = self.URL.createObjectURL(blob)
      const image = new Image()
      image.onload = () => {
        try {
          if (canvas.width !== image.naturalWidth || canvas.height !== image.naturalHeight) {
            canvas.width = image.naturalWidth
            canvas.height = image.naturalHeight
          }
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
          self.URL.revokeObjectURL(url)
          self.postMessage({ type: 'drawn' })
        } catch (error) {
          self.postMessage({ type: 'error', error: String(error && error.message || error) })
        }
      }
      image.onerror = () => { self.postMessage({ type: 'error', error: 'The source image could not be decoded.' }) }
      image.src = url
    } catch (error) {
      self.postMessage({ type: 'error', error: String(error && error.message || error) })
    }
  }
}
