import React, { useEffect, useState } from 'react';
import { MSG } from '@shared/messages';
import { loadSettings } from '@shared/storage';
import type { PageInfo, TTSSettings } from '@shared/types';
import './popup.css';

export function Popup() {
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [settings, setSettings] = useState<TTSSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        const s = await loadSettings();
        setSettings(s);

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          try {
            const info = await chrome.tabs.sendMessage(tab.id, { type: MSG.GET_PAGE_INFO });
            setPageInfo(info);
          } catch {
            setError('Cannot access this page');
          }
        }
      } catch (err) {
        setError('Failed to load');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const handleRead = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.tabs.sendMessage(tab.id, { type: MSG.START_READING });
      window.close();
    }
  };

  const handleOpenSettings = () => {
    chrome.runtime.openOptionsPage();
  };

  const hasApiConfig = settings && settings.apiUrl;

  return (
    <div className="ir-popup">
      <div className="ir-popup-header">
        <h1>Immersive Reader</h1>
      </div>

      {loading && <div className="ir-popup-loading">Loading...</div>}

      {error && <div className="ir-popup-error">{error}</div>}

      {!loading && !error && pageInfo && (
        <div className="ir-popup-content">
          <div className="ir-popup-title" title={pageInfo.title}>
            {pageInfo.title || 'Untitled'}
          </div>

          <div className="ir-popup-stats">
            <span className="ir-popup-word-count">
              {pageInfo.wordCount.toLocaleString()} words
            </span>
            {pageInfo.wordCount > 0 && (
              <span className="ir-popup-reading-time">
                ~{Math.ceil(pageInfo.wordCount / 200)} min read
              </span>
            )}
          </div>

          <button
            className="ir-popup-read-btn"
            onClick={handleRead}
            disabled={!hasApiConfig || pageInfo.wordCount === 0 || pageInfo.isPlaying}
          >
            {pageInfo.isPlaying ? 'Reading...' : 'Read this page'}
          </button>

          {!hasApiConfig && (
            <p className="ir-popup-hint">Configure API settings first</p>
          )}
        </div>
      )}

      <div className="ir-popup-footer">
        <button className="ir-popup-settings-link" onClick={handleOpenSettings}>
          Settings
        </button>
      </div>
    </div>
  );
}
