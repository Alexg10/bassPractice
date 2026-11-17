import { useEffect, useState } from 'react'
import { Bibliotheque } from './Bibliotheque'

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
        <p>
          Morceau {route.videoId} : l'affichage de la tablature arrive avec l'issue #6. <a href="#/">Retour</a>
        </p>
      )}
    </main>
  )
}

export default App
