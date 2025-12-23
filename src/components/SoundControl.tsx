import { useState, useEffect } from "react";
import SoundManager from "../utils/SoundManager";
import "./SoundControl.css";

export default function SoundControl() {
  const soundManager = SoundManager.getInstance();
  const [isEnabled, setIsEnabled] = useState(soundManager.isEnabled());
  const [volume, setVolume] = useState(soundManager.getVolume());
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    soundManager.setEnabled(isEnabled);
  }, [isEnabled, soundManager]);

  useEffect(() => {
    soundManager.setVolume(volume);
  }, [volume, soundManager]);

  const handleToggle = () => {
    setIsEnabled(!isEnabled);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
  };

  return (
    <div className="sound-control">
      <button
        className="sound-toggle-btn"
        onClick={() => setIsOpen(!isOpen)}
        title="サウンド設定"
      >
        <span className={`icon ${isEnabled ? "icon-energy" : "icon-shield"}`}></span>
      </button>

      {isOpen && (
        <div className="sound-dropdown">
          <div className="sound-option">
            <label>
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={handleToggle}
              />
              <span>SE を有効化</span>
            </label>
          </div>

          {isEnabled && (
            <div className="sound-option">
              <label>
                <span>音量</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={volume}
                  onChange={handleVolumeChange}
                  className="volume-slider"
                />
                <span className="volume-value">{Math.round(volume * 100)}%</span>
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
