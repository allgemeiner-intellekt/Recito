// Throwaway browser fixture for feature/weread-reader. No TTS calls.
import { installWereadCapture } from '../src/content/weread/capture';
import { extractWeread } from '../src/content/weread/reader';
import { WereadHighlighter } from '../src/content/weread/highlighter';
import { initAutoScroll } from '../src/content/highlighting/auto-scroll';
import { chunkText } from '../src/lib/chunker';

const nativeRect = Element.prototype.getBoundingClientRect;
installWereadCapture();
const root = document.querySelector<HTMLElement>('.renderTargetContainer')!;
const result = document.querySelector<HTMLPreElement>('#result')!;
const paragraphs = Array.from({ length: 80 }, (_, i) => `这是第${i + 1}段原型测试。我们正在验证微信读书章节的朗读与同步高亮功能。文字按照坐标恢复顺序，重复绘制不会重复朗读。每段内容只保存在内存中，播放结束后可以清理高亮。`);
let manager: WereadHighlighter | undefined;
let chunks: ReturnType<typeof chunkText> = [];
let index = 0;
function highlight() {
  const chunk = chunks[index];
  manager?.highlightSentence(chunk.startOffset, chunk.endOffset);
  manager?.highlightWord(chunk.startOffset, Math.min(chunk.startOffset + 2, chunk.endOffset));
  result.textContent += `\n高亮第 ${index + 1}/${chunks.length} 句：${chunk.text}`;
}
document.querySelector<HTMLButtonElement>('#run')!.onclick = async () => {
  manager?.destroy();
  const measured: number[] = [];
  const cached: number[] = [];
  for (let i = 0; i < 7; i++) {
    const temporary = document.createElement('div');
    temporary.id = 'preRenderContainer';
    temporary.style.cssText = 'position:absolute;left:-20000px;top:0;width:798px;font:21px/40px sans-serif';
    for (const text of paragraphs) {
      const p = document.createElement('p'); p.style.margin = '0 0 20px'; p.textContent = text; temporary.appendChild(p);
    }
    document.body.appendChild(temporary);
    const rect = nativeRect.call(temporary); // Force the layout the site already needs.
    let start = performance.now(); temporary.getBoundingClientRect(); measured.push(performance.now() - start);
    start = performance.now(); temporary.getBoundingClientRect(); cached.push(performance.now() - start);
    root.style.height = `${rect.height}px`;
    temporary.remove();
    await new Promise(requestAnimationFrame);
  }
  const start = performance.now();
  const chapter = await extractWeread();
  const extractMs = performance.now() - start;
  chunks = chunkText(chapter.text);
  const contexts: CanvasRenderingContext2D[] = [];
  root.querySelector('.wr_canvasContainer')!.replaceChildren();
  for (let i = 0; i < 2; i++) {
    const canvas = document.createElement('canvas');
    canvas.width = 1596; canvas.height = 4000;
    canvas.style.cssText = `position:absolute;left:0;top:${i * 2000}px;width:798px;height:2000px`;
    root.querySelector('.wr_canvasContainer')!.appendChild(canvas);
    const context = canvas.getContext('2d')!;
    context.scale(2, 2); context.translate(0, -i * 2000);
    context.font = '21px sans-serif'; context.textBaseline = 'middle'; contexts.push(context);
  }
  for (const run of chapter.runs) {
    if (run.y < 4000) contexts[Math.floor(run.y / 2000)].fillText(run.text, run.x, run.y + run.height / 2);
  }
  const tail = chapter.runs.filter(run => run.y >= 4000).reverse();
  document.querySelector('#tail-text')!.replaceChildren(...tail.map(run => {
    const span = document.createElement('span'); span.textContent = run.text; span.className = 'glyph';
    span.style.cssText = `transform:translate(${run.x}px,${run.y}px);width:${run.width}px;height:${run.height}px;line-height:${run.height}px`;
    return span;
  }));
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const expected = paragraphs.join('').replace(/\s/g, '');
  const actual = chapter.text.replace(/\s/g, '');
  result.textContent = JSON.stringify({ correct: actual === expected, expectedCharacters: expected.length,
    extractedCharacters: actual.length, segments: chunks.length, captureMs: +median(measured).toFixed(2),
    cachedMeasurementMs: +median(cached).toFixed(2), extractionMs: +extractMs.toFixed(2),
    diagnostics: JSON.parse(root.dataset.recitoCapture!) }, null, 2);
  manager = new WereadHighlighter(chapter, { wordEnabled: true, sentenceEnabled: true, autoScroll: true,
    wordColor: 'rgba(255,190,0,.35)', sentenceColor: 'rgba(255,190,0,.15)' }, () => { result.textContent += '\n排版失效'; });
  initAutoScroll(); index = 0;
  document.querySelector<HTMLButtonElement>('#next')!.disabled = false;
  document.querySelector<HTMLButtonElement>('#tail')!.disabled = false;
};
document.querySelector<HTMLButtonElement>('#next')!.onclick = () => { highlight(); index = Math.min(index + 1, chunks.length - 1); };
document.querySelector<HTMLButtonElement>('#tail')!.onclick = () => { index = Math.floor(chunks.length * .85); highlight(); };
