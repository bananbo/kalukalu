import { useState, useEffect } from "react";
import SoundManager from "../utils/SoundManager";
import "./SoundControl.css";

export default function SoundControl() {
  const soundManager = SoundManager.getInstance();
  const [isEnabled, setIsEnabled] = useState(soundManager.isEnabled());
  const [volume, setVolume] = useState(soundManager.getVolume());
  const [isBGMEnabled, setIsBGMEnabled] = useState(soundManager.isBGMEnabled());
  const [bgmVolume, setBGMVolume] = useState(soundManager.getBGMVolume());
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    soundManager.setEnabled(isEnabled);
  }, [isEnabled, soundManager]);

  useEffect(() => {
    soundManager.setVolume(volume);
  }, [volume, soundManager]);

  useEffect(() => {
    soundManager.setBGMEnabled(isBGMEnabled);
  }, [isBGMEnabled, soundManager]);

  useEffect(() => {
    soundManager.setBGMVolume(bgmVolume);
  }, [bgmVolume, soundManager]);

  const handleToggle = () => {
    setIsEnabled(!isEnabled);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
  };

  const handleBGMToggle = () => {
    setIsBGMEnabled(!isBGMEnabled);
  };

  const handleBGMVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setBGMVolume(newVolume);
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
                <span>SE音量</span>
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

          <div className="sound-option">
            <label>
              <input
                type="checkbox"
                checked={isBGMEnabled}
                onChange={handleBGMToggle}
              />
              <span>BGM を有効化</span>
            </label>
          </div>

          {isBGMEnabled && (
            <div className="sound-option">
              <label>
                <span>BGM音量</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={bgmVolume}
                  onChange={handleBGMVolumeChange}
                  className="volume-slider"
                />
                <span className="volume-value">{Math.round(bgmVolume * 100)}%</span>
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
