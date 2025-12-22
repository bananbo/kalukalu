import { Creature } from '../types/creature'
import './CreatureList.css'

interface CreatureListProps {
  creatures: Creature[]
  onRemove: (id: string) => void
}

const CreatureList = ({ creatures, onRemove }: CreatureListProps) => {
  const getDietIcon = (diet: string) => {
    switch (diet) {
      case 'herbivore': return '🌿'
      case 'carnivore': return '🥩'
      case 'omnivore': return '🍽️'
      default: return '❓'
    }
  }

  const getSocialIcon = (social: string) => {
    switch (social) {
      case 'solitary': return '👤'
      case 'pack': return '👥'
      case 'swarm': return '👨‍👩‍👧‍👦'
      default: return '❓'
    }
  }

  return (
    <div className="creature-list">
      <div className="list-header">
        <h3>生物一覧</h3>
        <span className="count">{creatures.length}</span>
      </div>

      <div className="list-content">
        {creatures.length === 0 ? (
          <div className="empty-state">
            <p>まだ生物がいません</p>
            <p className="empty-hint">コメントから生物を作成しましょう</p>
          </div>
        ) : (
          creatures.map((creature) => (
            <div key={creature.id} className="creature-item">
              <div className="creature-header">
                <div className="creature-visual" style={{ backgroundColor: creature.appearance.primaryColor }}>
                  {creature.appearance.bodyType[0].toUpperCase()}
                </div>
                <div className="creature-info">
                  <h4 className="creature-name">{creature.name}</h4>
                  <p className="creature-author">by {creature.author}</p>
                </div>
                <button
                  className="remove-btn"
                  onClick={() => onRemove(creature.id)}
                  title="削除"
                >
                  ×
                </button>
              </div>

              <div className="creature-details">
                <div className="detail-row">
                  <span className="detail-icon">{getDietIcon(creature.behavior.diet)}</span>
                  <span className="detail-icon">{getSocialIcon(creature.behavior.social)}</span>
                  <span className="detail-text">
                    {creature.appearance.hasWings && '🪽'}
                    {creature.appearance.hasTentacles && '🦑'}
                    {creature.appearance.hasEyes && '👁️'}
                  </span>
                </div>

                <div className="stats">
                  <div className="stat-bar">
                    <span className="stat-label">速さ</span>
                    <div className="stat-value">
                      <div className="stat-fill" style={{ width: `${creature.attributes.speed * 10}%` }} />
                    </div>
                  </div>
                  <div className="stat-bar">
                    <span className="stat-label">サイズ</span>
                    <div className="stat-value">
                      <div className="stat-fill" style={{ width: `${creature.attributes.size * 10}%` }} />
                    </div>
                  </div>
                  <div className="stat-bar">
                    <span className="stat-label">力</span>
                    <div className="stat-value">
                      <div className="stat-fill" style={{ width: `${creature.attributes.strength * 10}%` }} />
                    </div>
                  </div>
                </div>

                <div className="traits-section">
                  <div className="trait-group strengths">
                    <div className="trait-header">
                      <span className="trait-icon">✨</span>
                      <span className="trait-title">長所</span>
                    </div>
                    <div className="trait-list">
                      {creature.traits.strengths.map((strength, idx) => (
                        <span key={idx} className="trait-item">{strength}</span>
                      ))}
                    </div>
                  </div>
                  <div className="trait-group weaknesses">
                    <div className="trait-header">
                      <span className="trait-icon">⚠️</span>
                      <span className="trait-title">短所</span>
                    </div>
                    <div className="trait-list">
                      {creature.traits.weaknesses.map((weakness, idx) => (
                        <span key={idx} className="trait-item">{weakness}</span>
                      ))}
                    </div>
                  </div>
                </div>

                <p className="creature-comment">"{creature.comment}"</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default CreatureList
