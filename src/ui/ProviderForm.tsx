import React, { useEffect, useRef, useState } from 'react';
import type { ProviderConfig } from '@shared/types';
import { PROVIDER_LIST } from '@providers/registry';
import { MIMO_MODELS } from '@providers/mimo';
import { isOfficialMimoEndpoint, normalizeMimoConfig, resolveMimoModel } from '@shared/mimo-config';
import {
  generateId,
  saveProvider,
  getProviders,
  getSettings,
  setActiveProviderGroup,
  getProviderGroupKey,
} from '@shared/storage';
import { MSG, sendMessage } from '@shared/messages';
import { Icon } from './Icon';

export function ProviderForm({
  existing,
  onSaved,
  allowSaveAnyway = true,
}: {
  existing?: ProviderConfig;
  onSaved: (config: ProviderConfig) => void;
  allowSaveAnyway?: boolean;
}) {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [configId] = useState(() => existing?.id ?? generateId());
  const [providerId, setProviderId] = useState(existing?.providerId ?? 'openai');
  const [name, setName] = useState(existing?.name ?? '');
  const [key, setKey] = useState(existing?.apiKey ?? '');
  const [baseUrl, setBaseUrl] = useState(existing?.baseUrl ?? '');
  const [model, setModel] = useState(
    existing?.providerId === 'mimo'
      ? resolveMimoModel(existing)
      : ((existing?.extraParams?.model as string) ?? 'tts-1'),
  );
  const [show, setShow] = useState(false);
  const [testing, setTesting] = useState(false);
  const [failure, setFailure] = useState('');
  const [success, setSuccess] = useState(false);
  const meta = PROVIDER_LIST.find((p) => p.id === providerId)!;
  const build = (): ProviderConfig =>
    normalizeMimoConfig({
      ...existing,
      id: configId,
      providerId,
      name: name.trim() || meta.name,
      apiKey: key.trim(),
      baseUrl: baseUrl.trim() || undefined,
      extraParams:
        providerId === 'mimo' || providerId === 'custom'
          ? { ...existing?.extraParams, model }
          : undefined,
    });
  const valid =
    key.trim().length > 0 && (providerId !== 'custom' || /^https?:\/\//.test(baseUrl.trim()));
  const persist = async () => {
    const config = build();
    await saveProvider(config);
    const settings = await getSettings();
    const providers = await getProviders();
    if (
      !settings.activeProviderGroup ||
      !providers.some((p) => getProviderGroupKey(p) === settings.activeProviderGroup)
    ) {
      await setActiveProviderGroup(getProviderGroupKey(config));
    }
    setSuccess(true);
    onSaved(config);
  };
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid || testing) return;
        setTesting(true);
        setFailure('');
        try {
          const result = await sendMessage<{ ok: boolean; error?: string }>({
            type: MSG.TEST_KEY,
            config: build(),
          });
          if (!mounted.current) return;
          if (!result?.ok) {
            setFailure(
              result?.error ??
                'The provider did not accept this key. Check the key, endpoint and account permissions.',
            );
            return;
          }
          await persist();
        } catch (error) {
          setFailure(error instanceof Error ? error.message : String(error));
        } finally {
          setTesting(false);
        }
      }}
      onChange={() => {
        setFailure('');
        setSuccess(false);
      }}
    >
      <fieldset disabled={testing} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <div className="tiles" role="radiogroup" aria-label="Provider">
          {PROVIDER_LIST.map((p) => (
            <label className="tile" key={p.id}>
              <input
                type="radio"
                name="provider"
                value={p.id}
                checked={providerId === p.id}
                onChange={() => {
                  setProviderId(p.id);
                  setBaseUrl('');
                  setModel(p.id === 'mimo' ? MIMO_MODELS[0].modelId : 'tts-1');
                }}
              />
              <b>{p.name}</b>
              <small>{p.description}</small>
            </label>
          ))}
        </div>
        <label className="field">
          <span>Display name</span>
          <input
            className="inp"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={meta.name}
          />
        </label>
        <label className="field">
          <span>API key</span>
          <span className="inp-wrap">
            <input
              className="inp"
              aria-label="API key"
              required
              type={show ? 'text' : 'password'}
              value={key}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setKey(e.target.value)}
            />
            <button
              type="button"
              className="icon-btn"
              aria-label={show ? 'Hide API key' : 'Show API key'}
              onClick={() => setShow(!show)}
            >
              <Icon name="eye" size={18} />
            </button>
          </span>
          <small>
            {meta.website ? (
              <a href={meta.website} target="_blank" rel="noreferrer">
                Create a key at {meta.name}
              </a>
            ) : (
              'Use the API key issued by your compatible service.'
            )}
          </small>
        </label>
        {(providerId === 'mimo' || providerId === 'custom') && (
          <>
            <label className="field">
              <span>{providerId === 'custom' ? 'Base URL' : 'Base URL (optional)'}</span>
              <input
                className="inp"
                type="url"
                required={providerId === 'custom'}
                value={baseUrl}
                placeholder={
                  providerId === 'mimo'
                    ? 'https://api.xiaomimimo.com/v1'
                    : 'https://your-service.example/v1'
                }
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Model</span>
              {providerId === 'mimo' && isOfficialMimoEndpoint(baseUrl) ? (
                <select className="inp" value={model} onChange={(e) => setModel(e.target.value)}>
                  {!MIMO_MODELS.some((m) => m.modelId === model) && <option>{model}</option>}
                  {MIMO_MODELS.map((m) => (
                    <option key={m.modelId} value={m.modelId}>
                      {m.modelId}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="inp"
                  required
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                />
              )}
            </label>
          </>
        )}
        {failure && (
          <div className="callout bad pf-result" role="alert">
            <Icon name="alert" />
            <div>
              <b>Couldn't connect</b>
              <p>{failure}</p>
              {allowSaveAnyway && (
                <button
                  type="button"
                  className="link"
                  onClick={() => persist().catch((e) => setFailure(String(e)))}
                >
                  Save anyway
                </button>
              )}
            </div>
          </div>
        )}
        {success && <p role="status">Connected and saved.</p>}
        <div className="pf-actions">
          <button className="btn primary" type="submit" disabled={!valid || testing}>
            {testing ? (
              <>
                <span className="spin" />
                Testing…
              </>
            ) : (
              'Test and save'
            )}
          </button>
        </div>
        <p className="rp-hint" style={{ marginTop: 14 }}>
          Your key is stored only in this browser and sent only to your provider. Recito has no
          account or server.
        </p>
      </fieldset>
    </form>
  );
}
