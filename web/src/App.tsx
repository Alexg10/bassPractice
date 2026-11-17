import { useEffect, useState } from 'react'
import { Bibliotheque } from './Bibliotheque'
import { Morceau } from './Morceau'

function useRoute() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const maj = () => setHash(location.hash)
    addEventListener('hashchange', maj)
    return () => removeEventListener('hashchange', maj)
  }, [])
  const morceau = hash.match(/^#\/morceau\/([\w-]{11})$/)
  return morceau ? { page: 'morceau' as const, videoId: morceau[1] } : { page: 'bibliotheque' as const }
}

function App() {
  const route = useRoute()
  return (
    <main>
      <h1>
        <a href="#/">bassPractice</a>
      </h1>
      {route.page === 'bibliotheque' ? (
        <Bibliotheque />
      ) : (
        <Morceau videoId={route.videoId} />
      )}
    </main>
  )
}

export default App
