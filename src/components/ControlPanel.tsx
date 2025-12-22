import { useState } from 'react'
import './ControlPanel.css'

interface ControlPanelProps {
  onCreateTest: (comment: string) => void
  onStartYouTube: (videoId: string) => void
  onClearAll: () => void
}

const ControlPanel = ({ onCreateTest, onStartYouTube, onClearAll }: ControlPanelProps) => {
  const [testComment, setTestComment] = useState('')
  const [videoId, setVideoId] = useState('')
  const [aiAuthor, setAiAuthor] = useState('')
  const [aiMessage, setAiMessage] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState<string | null>(null)

  const testComments = [
    '速くて小さい生物',
    '大きくて強い赤い生物',
    '青い翼を持つ賢い生物',
    '緑の触手を持つ群れで行動する生物',
    '夜行性の肉食生物',
  ]

  const handleQuickTest = (comment: string) => {
    setTestComment(comment)
    onCreateTest(comment)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (testComment.trim()) {
      onCreateTest(testComment)
      setTestComment('')
    }
  }

  const handleYouTubeSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (videoId.trim()) {
      onStartYouTube(videoId)
    }
  }

  // AI生成をテスト（プレビューのみ）
  const handleAIPreview = async () => {
    if (!aiMessage.trim()) return
    
    setAiLoading(true)
    setAiResult(null)
    
    try {
      const response = await fetch('http://localhost:3001/api/creature/preview-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: aiAuthor || 'テストユーザー',
          message: aiMessage
        })
      })
      
      const data = await response.json()
      if (data.success) {
        setAiResult(JSON.stringify(data.creature, null, 2))
      } else {
        setAiResult(`エラー: ${data.error}`)
      }
    } catch (error) {
      setAiResult(`エラー: ${(error as Error).message}`)
    } finally {
      setAiLoading(false)
    }
  }

  // AI生成して追加
  const handleAICreate = async () => {
    if (!aiMessage.trim()) return
    
    setAiLoading(true)
    setAiResult(null)
    
    try {
      const response = await fetch('http://localhost:3001/api/creature/create-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: aiAuthor || 'テストユーザー',
          message: aiMessage
        })
      })
      
      const data = await response.json()
      if (data.success) {
        setAiResult(`✅ 生成成功: ${data.creature.name}`)
        setAiMessage('')
      } else {
        setAiResult(`エラー: ${data.error}`)
      }
    } catch (error) {
      setAiResult(`エラー: ${(error as Error).message}`)
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <div className="control-panel">
      <section className="control-section">
        <h3>外来種の侵入</h3>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={testComment}
            onChange={(e) => setTestComment(e.target.value)}
            placeholder="生物の特徴を入力..."
            className="text-input"
          />
          <button type="submit" className="btn btn-primary">
            外来種を投入 (2匹)
          </button>
        </form>

        <div className="quick-tests">
          <p className="section-label">クイックテスト:</p>
          {testComments.map((comment, index) => (
            <button
              key={index}
              onClick={() => handleQuickTest(comment)}
              className="btn btn-small"
            >
              {comment}
            </button>
          ))}
        </div>
      </section>

      <section className="control-section">
        <h3>YouTube配信</h3>
        <form onSubmit={handleYouTubeSubmit}>
          <input
            type="text"
            value={videoId}
            onChange={(e) => setVideoId(e.target.value)}
            placeholder="Video ID"
            className="text-input"
          />
          <button type="submit" className="btn btn-success">
            配信開始
          </button>
        </form>
        <p className="help-text">
          YouTube動画のIDを入力してください
          <br />
          (例: dQw4w9WgXcQ)
        </p>
      </section>

      <section className="control-section">
        <h3>環境制御</h3>
        <button onClick={onClearAll} className="btn btn-danger">
          リセット（初期状態に戻す）
        </button>
      </section>

      <section className="control-section ai-section">
        <h3>🤖 AI生成テスト</h3>
        <div className="ai-inputs">
          <input
            type="text"
            value={aiAuthor}
            onChange={(e) => setAiAuthor(e.target.value)}
            placeholder="投稿者名（オプション）"
            className="text-input"
          />
          <textarea
            value={aiMessage}
            onChange={(e) => setAiMessage(e.target.value)}
            placeholder="生物の説明をAIで解析..."
            className="text-input ai-textarea"
            rows={3}
          />
        </div>
        <div className="ai-buttons">
          <button 
            onClick={handleAIPreview} 
            className="btn btn-secondary"
            disabled={aiLoading || !aiMessage.trim()}
          >
            {aiLoading ? '解析中...' : 'プレビュー'}
          </button>
          <button 
            onClick={handleAICreate} 
            className="btn btn-primary"
            disabled={aiLoading || !aiMessage.trim()}
          >
            {aiLoading ? '生成中...' : 'AI生成して追加'}
          </button>
        </div>
        {aiResult && (
          <div className="ai-result">
            <pre>{aiResult}</pre>
          </div>
        )}
        <p className="help-text">
          Gemini 2.0 Flashが自然言語からパラメータを生成します
        </p>
      </section>
    </div>
  )
}

export default ControlPanel
