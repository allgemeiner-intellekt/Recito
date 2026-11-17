import React, { useState } from 'react';
import { useTheme } from '@shared/useTheme';
import { getSettings, saveSettings } from '@shared/storage';
import { ProviderForm } from '../ui/ProviderForm';
import { VoiceGrid, useVoiceSample, SAMPLE_TEXT } from '../ui/VoiceGrid';
import { usePreferences, useVoices } from '../ui/usePreferences';
import { Icon } from '../ui/Icon';

export function Onboarding() {
  useTheme();
  const [step, setStep] = useState(0);
  const [complete, setComplete] = useState(false);
  const { active, settings, update, refresh } = usePreferences();
  const { voices } = useVoices(active);
  const sample = useVoiceSample();
  const finish = async () => {
    const current = await getSettings();
    await saveSettings({ ...current, onboardingComplete: true });
    setComplete(true);
  };
  return (
    <div className="setup">
      <div className="setup-in">
        <span className="wm" style={{ fontSize: 24 }}>
          Recito
        </span>
        <ol className="steps" aria-label="Setup progress">
          {['Connect a provider', 'Pick a voice', 'Listen'].map((title, i) => (
            <li
              key={title}
              className={step > i ? 'done' : ''}
              aria-current={step === i ? 'step' : undefined}
            >
              {i + 1} · {title}
            </li>
          ))}
        </ol>
        {complete ? (
          <>
            <h1>You're ready to read</h1>
            <p className="lede">Open an article and press the Recito icon to listen.</p>
            <Tips />
            <button className="btn primary" onClick={() => window.close()}>
              Done
            </button>
          </>
        ) : step === 0 ? (
          <>
            <h1>A voice for your reading</h1>
            <p className="lede">Connect your own provider. Your key stays in this browser.</p>
            <ProviderForm
              allowSaveAnyway={false}
              onSaved={async () => {
                await refresh();
                setStep(1);
              }}
            />
            <div className="setup-foot">
              <button className="link" onClick={finish}>
                Skip for now
              </button>
            </div>
          </>
        ) : step === 1 ? (
          <>
            <h1>Pick a voice</h1>
            <p className="lede">Try a few. You can change this any time.</p>
            <div className="card">
              <VoiceGrid
                config={active}
                selected={settings.activeVoiceId}
                onSelect={(id) => update({ activeVoiceId: id })}
              />
            </div>
            <div className="setup-foot">
              <button className="btn" onClick={() => setStep(0)}>
                Back
              </button>
              <button
                className="btn primary"
                disabled={
                  !active ||
                  !voices.length ||
                  (!!settings.activeVoiceId && !voices.some((v) => v.id === settings.activeVoiceId))
                }
                onClick={() => setStep(2)}
              >
                Continue
              </button>
              <button className="link" onClick={finish}>
                Skip for now
              </button>
            </div>
          </>
        ) : (
          <>
            <h1>Hear it for yourself</h1>
            <p className="lede">Listen while your eyes follow the words.</p>
            <div className={`sample ${sample.playing ? 'live' : ''}`}>
              {SAMPLE_TEXT.split(/\s+/).map((word, i) => (
                <React.Fragment key={i}>
                  <span className={sample.word === i ? 'on' : ''}>{word}</span>{' '}
                </React.Fragment>
              ))}
            </div>
            {sample.error && (
              <p role="alert" className="error-text">
                {sample.error}
              </p>
            )}
            <div className="setup-foot">
              <button
                className="btn"
                onClick={() => {
                  sample.stop();
                  setStep(1);
                }}
              >
                Back
              </button>
              <button
                className="btn primary"
                disabled={sample.busy || !active || !voices.length}
                onClick={() => {
                  if (sample.playing) sample.stop();
                  else if (active)
                    void sample.play(
                      active,
                      voices.find((v) => v.id === settings.activeVoiceId) ?? voices[0],
                    );
                }}
              >
                <Icon name={sample.playing ? 'pause' : 'play'} size={18} />
                {sample.busy
                  ? 'Preparing your voice…'
                  : sample.playing
                    ? 'Stop sample'
                    : 'Listen to a sample'}
              </button>
              <button
                className="btn"
                disabled={!sample.heard}
                onClick={() => {
                  sample.stop();
                  void finish();
                }}
              >
                Finish setup
              </button>
              <button
                className="link"
                onClick={() => {
                  sample.stop();
                  void finish();
                }}
              >
                Skip for now
              </button>
            </div>
            {sample.heard && <Tips />}
          </>
        )}
      </div>
    </div>
  );
}
function Tips() {
  return (
    <ul className="tips">
      <li>
        <span>Start or pause from any page</span>
        <kbd>Alt Shift Space</kbd>
      </li>
      <li>Click text while reading to jump there.</li>
      <li>Pin Recito in Chrome's extensions menu to keep the icon close.</li>
    </ul>
  );
}
