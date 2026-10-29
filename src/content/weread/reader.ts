import { assembleChapter, type WereadCapture, type PositionedRun } from './model';
import { MSG, type WereadCaptureResponse } from '@shared/messages';

export interface WereadChapter {
  text: string;
  runs: PositionedRun[];
  root: HTMLElement;
  canvases: HTMLCanvasElement[];
  title: string;
}

export function isWeread(): boolean {
  return location.hostname === 'weread.qq.com' && location.pathname.startsWith('/web/reader/');
}

export async function extractWeread(): Promise<WereadChapter> {
  const root = document.querySelector<HTMLElement>('.readerChapterContent .renderTargetContainer');
  if (!root) throw new Error('微信读书正文尚未加载，请等待章节显示后重试。');
  const snapshot = await new Promise<WereadCapture>((resolve, reject) => {
    const timeout = setTimeout(() => {
      document.removeEventListener(MSG.WEREAD_CAPTURE_RESPONSE, onResponse);
      reject(new Error('请刷新微信读书页面，再启动 Recito 以捕获章节文字。'));
    }, 2500);
    function onResponse(event: Event) {
      try {
        const detail: unknown = (event as CustomEvent).detail;
        if (typeof detail !== 'string' || detail.length > 16000000) return;
        const response = JSON.parse(detail) as WereadCaptureResponse<WereadCapture>;
        if (response.type !== MSG.WEREAD_CAPTURE_RESPONSE) return;
        const data = response.payload;
        if (typeof data.url !== 'string' || !Array.isArray(data.runs) || data.runs.length > 50000 || !Number.isFinite(data.width)) return;
        clearTimeout(timeout);
        document.removeEventListener(MSG.WEREAD_CAPTURE_RESPONSE, onResponse);
        resolve(data);
      } catch { /* Ignore unrelated or malformed page events. */ }
    }
    document.addEventListener(MSG.WEREAD_CAPTURE_RESPONSE, onResponse);
    document.dispatchEvent(new Event(MSG.WEREAD_CAPTURE_REQUEST));
  });
  if (snapshot.url !== location.href) throw new Error('章节已变化，请等待新章节排版完成后重新朗读。');
  root.dataset.recitoCapture = JSON.stringify({ runs: snapshot.runs.length,
    captureMs: Math.round(snapshot.captureMs * 100) / 100 });
  if (snapshot.truncated) throw new Error('章节超出微信读书原型的文字缓存上限。');
  if (!snapshot.runs.length || snapshot.width <= 0) throw new Error('未捕获到完整排版文字，请刷新微信读书页面后重试。');
  const scale = root.getBoundingClientRect().width / snapshot.width;
  if (Math.abs(scale - 1) > 0.02) throw new Error('章节排版宽度已变化，请刷新页面后重新朗读。');
  const runs = snapshot.runs.filter(run => typeof run.text === 'string' && run.text.length <= 10000
    && [run.x, run.y, run.width, run.height, run.baseline].every(Number.isFinite));
  const chapter = assembleChapter(runs);
  if (!chapter.text.trim() || !root.isConnected) throw new Error('章节尚未加载完成，请稍后重试。');
  root.dataset.recitoCapture = JSON.stringify({ characters: chapter.text.length, runs: chapter.runs.length,
    captureMs: Math.round(snapshot.captureMs * 100) / 100 });
  return { ...chapter, root, canvases: [...root.querySelectorAll<HTMLCanvasElement>('canvas')], title: document.title };
}
