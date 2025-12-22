import { useState, useEffect, useCallback } from 'react'
import { Creature } from './types/creature'
import EcosystemCanvas from './components/EcosystemCanvas'
import ControlPanel from './components/ControlPanel'
import CreatureList from './components/CreatureList'
import './App.css'

function App() {
  const [creatures, setCreatures] = useState<Creature[]>([])
  const [ws, setWs] = useState<WebSocket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // 初期種族をロード
  useEffect(() => {
    const loadInitialSpecies = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/initial-species')
        const data = await response.json()

        if (data.success) {
          setCreatures(data.creatures)
        }
      } catch (error) {
        console.error('Error loading initial species:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadInitialSpecies()
  }, [])

  // WebSocket接続
  useEffect(() => {
    const websocket = new WebSocket(`ws://localhost:3001/ws`)

    websocket.onopen = () => {
      console.log('WebSocket connected')
      setIsConnected(true)
    }

    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data)

      if (data.type === 'newCreature') {
        setCreatures(prev => [...prev, data.creature])
      } else if (data.type === 'newCreatures') {
        // 複数の生物を追加
        setCreatures(prev => [...prev, ...data.creatures])
      }
    }

    websocket.onclose = () => {
      console.log('WebSocket disconnected')
      setIsConnected(false)
    }

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error)
    }

    setWs(websocket)

    return () => {
      websocket.close()
    }
  }, [])

  // デバッグ用: 手動で生物を作成
  const createTestCreature = useCallback(async (comment: string) => {
    try {
      const response = await fetch('http://localhost:3001/api/creature/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          comment: {
            author: 'テストユーザー',
            message: comment,
            timestamp: new Date()
          }
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to create creature')
      }
    } catch (error) {
      console.error('Error creating creature:', error)
    }
  }, [])

  // YouTube配信開始
  const startYouTubeLive = useCallback(async (videoId: string) => {
    try {
      const response = await fetch('http://localhost:3001/api/youtube/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ videoId }),
      })

      if (!response.ok) {
        throw new Error('Failed to start YouTube Live Chat')
      }
    } catch (error) {
      console.error('Error starting YouTube Live Chat:', error)
    }
  }, [])

  // 生物の削除
  const removeCreature = useCallback((id: string) => {
    setCreatures(prev => prev.filter(c => c.id !== id))
  }, [])

  // 全生物をクリアして初期種族をリロード
  const clearAllCreatures = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:3001/api/initial-species')
      const data = await response.json()

      if (data.success) {
        setCreatures(data.creatures)
      }
    } catch (error) {
      console.error('Error reloading initial species:', error)
      setCreatures([])
    }
  }, [])

  if (isLoading) {
    return (
      <div className="app loading">
        <div className="loading-content">
          <h2>生態系を準備中...</h2>
          <div className="loading-spinner"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Kalukalu - 生態系シミュレーション</h1>
        <div className="connection-status">
          <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`} />
          {isConnected ? '接続中' : '未接続'}
        </div>
      </header>

      <div className="app-content">
        <div className="main-area">
          <EcosystemCanvas
            creatures={creatures}
            onCreatureUpdate={setCreatures}
          />
        </div>

        <aside className="sidebar">
          <ControlPanel
            onCreateTest={createTestCreature}
            onStartYouTube={startYouTubeLive}
            onClearAll={clearAllCreatures}
          />
          <CreatureList
            creatures={creatures}
            onRemove={removeCreature}
          />
        </aside>
      </div>
    </div>
  )
}

export default App
