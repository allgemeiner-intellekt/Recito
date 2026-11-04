// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Options } from './Options';
import { DEFAULT_SETTINGS } from '@shared/constants';
import { mimoProvider } from '@providers/mimo';
import { MSG } from '@shared/messages';
import type { ProviderConfig } from '@shared/types';

vi.mock('@shared/useTheme', () => ({ useTheme: vi.fn() }));

let container: HTMLDivElement;
let root: Root;
let data: Record<string, unknown>;
let provider: ProviderConfig;

async function click(text: string) {
  const button = [...container.querySelectorAll('button')].find(
    (element) => element.textContent?.trim() === text,
  );
  expect(button, `button ${text}`).toBeTruthy();
  await act(async () => {
    button!.click();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  provider = {
    id: 'mimo',
    providerId: 'mimo',
    name: 'Saved MiMo',
    apiKey: 'saved-test-key-at-least-16-chars',
  };
  data = {
    'ir-providers': [provider],
    'ir-settings': {
      ...DEFAULT_SETTINGS,
      activeProviderGroup: 'mimo',
      activeVoiceId: 'default_en',
    },
  };
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async (key: string) => structuredClone({ [key]: data[key] })),
        set: vi.fn(async (values: Record<string, unknown>) => {
          Object.assign(data, structuredClone(values));
        }),
      },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    runtime: {
      sendMessage: vi.fn(async (message) => {
        if (message.type === MSG.LIST_VOICES) return mimoProvider.listVoices(provider);
        if (message.type === MSG.GET_PROVIDER_HEALTH) return {};
      }),
    },
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
});

describe('MiMo settings compatibility', () => {
  it.each([undefined, {}, { model: 'mimo-v2-tts', retained: true }, { model: 'mimo-v2.5-tts' }])(
    'edits and saves historical official config %j with only v2.5 available',
    async (extraParams) => {
      data['ir-providers'] = [{ ...provider, extraParams }];
      await act(async () => {
        root.render(React.createElement(Options));
      });
      await click('Providers');
      await click('Edit');
      const model = [...container.querySelectorAll('label')]
        .find((label) => label.textContent?.trim().startsWith('Model'))!
        .querySelector('select')!;
      expect(model.value).toBe('mimo-v2.5-tts');
      expect([...model.options].map((option) => option.value)).toEqual(['mimo-v2.5-tts']);
      await click('Save');
      expect(data['ir-providers']).toEqual([
        {
          ...provider,
          baseUrl: undefined,
          extraParams: { ...extraParams, model: 'mimo-v2.5-tts' },
        },
      ]);
    },
  );

  it('preserves a compatible service model when editing and saving', async () => {
    provider = {
      ...provider,
      baseUrl: 'https://compatible.example/v1',
      extraParams: { model: 'mimo-v2-tts' },
    };
    data['ir-providers'] = [provider];
    await act(async () => {
      root.render(React.createElement(Options));
    });
    await click('Providers');
    await click('Edit');
    expect(container.querySelector<HTMLInputElement>('.modal input[type="url"]')!.value).toBe(
      provider.baseUrl,
    );
    const model = [...container.querySelectorAll('label')]
      .find((label) => label.textContent?.trim().startsWith('Model'))!
      .querySelector('input')!;
    expect(model.value).toBe('mimo-v2-tts');
    await click('Save');
    expect(data['ir-providers']).toEqual([provider]);
  });

  it('offers current voices and clears the reselection notice when a new voice is selected', async () => {
    await act(async () => {
      root.render(React.createElement(Options));
    });
    await click('Voices');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Choose a voice');
    expect(container.textContent).not.toContain('English Female');
    const mia = [...container.querySelectorAll<HTMLElement>('.card[role="button"]')].find(
      (card) => card.querySelector('strong')?.textContent === 'Mia',
    )!;
    await act(async () => {
      mia.click();
    });
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(data['ir-settings']).toMatchObject({ activeVoiceId: 'Mia' });
  });
});
