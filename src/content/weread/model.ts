/** Prototype: chapter geometry captured during WeRead's DOM layout, in CSS pixels. */
export interface CapturedRun {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  baseline: number;
}

export interface WereadCapture {
  runs: CapturedRun[];
  width: number;
  captureMs: number;
  truncated: boolean;
}

export interface PositionedRun extends CapturedRun {
  startOffset: number;
  endOffset: number;
}

/** Reconstruct reading order without inserting spaces between Chinese glyphs. */
export function assembleChapter(input: CapturedRun[]): { text: string; runs: PositionedRun[] } {
  const ordered = input.map(run => ({ ...run, text: run.text.replace(/\u200b/g, '') }))
    .filter(run => run.text.length > 0)
    .sort((a, b) => a.baseline - b.baseline || a.x - b.x);
  const lines: CapturedRun[][] = [];
  for (const run of ordered) {
    const line = lines.at(-1);
    if (line && Math.abs(line[0].baseline - run.baseline) < 3) line.push(run);
    else lines.push([run]);
  }
  const gaps = lines.slice(1).map((line, i) => line[0].baseline - lines[i][0].baseline);
  const normalGap = gaps.length ? [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 3)] : Infinity;
  let text = '';
  const runs: PositionedRun[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].sort((a, b) => a.x - b.x);
    if (i > 0 && gaps[i - 1] > normalGap * 1.35) text += '\n\n';
    else if (i > 0 && /[A-Za-z0-9]$/.test(text) && /^[A-Za-z0-9]/.test(line[0].text)) text += ' ';
    for (let j = 0; j < line.length; j++) {
      const run = line[j];
      const previous = line[j - 1];
      if (previous && run.x - previous.x - previous.width > run.height * 0.2
          && /[A-Za-z0-9]$/.test(text) && /^[A-Za-z0-9]/.test(run.text)) text += ' ';
      const startOffset = text.length;
      text += run.text;
      runs.push({ ...run, startOffset, endOffset: text.length });
    }
  }
  return { text, runs };
}
