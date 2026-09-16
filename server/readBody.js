export function readRequestBody(req, maxBytes = 256 * 1024) {
  return new Promise((resolve, reject) => {
    let body = ''
    let size = 0

    req.on('data', (chunk) => {
      size += chunk.length
      if (size > maxBytes) {
        reject(new Error('Payload too large'))
        req.destroy()
        return
      }
      body += chunk
    })

    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}