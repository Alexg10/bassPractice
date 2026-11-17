import { useEffect, useState } from 'react'

type ServerStatus = 'checking' | 'ok' | 'unreachable'

function App() {
  const [status, setStatus] = useState<ServerStatus>('checking')

  useEffect(() => {
    fetch('/api/health')
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((body: { status: string }) =>
        setStatus(body.status === 'ok' ? 'ok' : 'unreachable'),
      )
      .catch(() => setStatus('unreachable'))
  }, [])

  return (
    <main>
      <h1>bassPractice</h1>
      <p>
        Serveur :{' '}
        {status === 'checking' ? 'vérification…' : status === 'ok' ? 'OK' : 'injoignable'}
      </p>
    </main>
  )
}

export default App
