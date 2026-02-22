import React, { useEffect, useState } from 'react';
import type { TTSSettings } from '@shared/types';
import { DEFAULT_SETTINGS, SPEED_MIN, SPEED_MAX, SPEED_STEP } from '@shared/constants';
import { loadSettings, saveSettings } from '@shared/storage';
import './options.css';

export function Options() {
  const [settings, setSettings] = useState<TTSSettings>({ ...DEFAULT_SETTINGS });
  const [showApiKey, setShowApiKey] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testError, setTestError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  const handleChange = (field: keyof TTSSettings, value: string | number) => {
    const updated = { ...settings, [field]: value };
    setSettings(updated);
    saveSettings(updated).then(() => {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  };

  const handleTest = async () => {
    setTestStatus('testing');
    setTestError('');

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (settings.apiKey) {
        headers['Authorization'] = `Bearer ${settings.apiKey}`;
      }

      const response = await fetch(`${settings.apiUrl}/v1/audio/speech`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: settings.model,
          input: 'Hello, this is a test of the Immersive Reader.',
          voice: settings.voice,
          speed: settings.speed,
          response_format: 'mp3',
        }),
      });

      if (!response.ok) {
        throw new Error(`API returned ${response.status}: ${response.statusText}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.play();
      audio.addEventListener('ended', () => URL.revokeObjectURL(url));

      setTestStatus('success');
      setTimeout(() => setTestStatus('idle'), 3000);
    } catch (err) {
      setTestStatus('error');
      setTestError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  return (
    <div className="ir-options">
      <div className="ir-options-container">
        <h1>Immersive Reader Settings</h1>

        <section className="ir-section">
          <h2>TTS API Configuration</h2>

          <div className="ir-field">
            <label htmlFor="apiUrl">API Base URL</label>
            <input
              id="apiUrl"
              type="url"
              value={settings.apiUrl}
              onChange={(e) => handleChange('apiUrl', e.target.value)}
              placeholder="http://localhost:5050"
            />
            <span className="ir-hint">
              URL should NOT end with <code>/v1/audio/speech</code> — just the base URL (e.g., <code>http://localhost:5050</code>)
            </span>
          </div>

          <div className="ir-field">
            <label htmlFor="apiKey">API Key</label>
            <div className="ir-input-group">
              <input
                id="apiKey"
                type={showApiKey ? 'text' : 'password'}
                value={settings.apiKey}
                onChange={(e) => handleChange('apiKey', e.target.value)}
                placeholder="Optional"
              />
              <button
                className="ir-toggle-btn"
                onClick={() => setShowApiKey(!showApiKey)}
                type="button"
              >
                {showApiKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div className="ir-field">
            <label htmlFor="model">Model</label>
            <input
              id="model"
              type="text"
              value={settings.model}
              onChange={(e) => handleChange('model', e.target.value)}
              placeholder="tts-1"
            />
          </div>

          <div className="ir-field">
            <label htmlFor="voice">Voice</label>
            <input
              id="voice"
              type="text"
              value={settings.voice}
              onChange={(e) => handleChange('voice', e.target.value)}
              placeholder="en-US-AvaNeural"
            />
            <span className="ir-hint">
              For openai-edge-tts, use Edge TTS voice names like <code>en-US-AvaNeural</code>
            </span>
          </div>

          <div className="ir-field">
            <label htmlFor="speed">Speed: {settings.speed.toFixed(1)}x</label>
            <input
              id="speed"
              type="range"
              className="ir-range"
              min={SPEED_MIN}
              max={SPEED_MAX}
              step={SPEED_STEP}
              value={settings.speed}
              onChange={(e) => handleChange('speed', parseFloat(e.target.value))}
            />
            <div className="ir-range-labels">
              <span>{SPEED_MIN}x</span>
              <span>1.0x</span>
              <span>{SPEED_MAX}x</span>
            </div>
          </div>
        </section>

        <section className="ir-section">
          <h2>Test</h2>
          <button
            className="ir-test-btn"
            onClick={handleTest}
            disabled={testStatus === 'testing'}
          >
            {testStatus === 'testing' ? 'Testing...' : 'Test Voice'}
          </button>
          {testStatus === 'success' && (
            <span className="ir-test-success">Audio playing!</span>
          )}
          {testStatus === 'error' && (
            <span className="ir-test-error">{testError}</span>
          )}
        </section>

        {saved && <div className="ir-saved-toast">Settings saved</div>}
      </div>
    </div>
  );
}
