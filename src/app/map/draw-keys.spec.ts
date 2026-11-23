import type { Draw } from 'ol/interaction';
import { handleDrawKeys } from './draw-keys';

function fakeDraw(active = true) {
  const calls: string[] = [];
  const draw = {
    getActive: () => active,
    finishDrawing: () => calls.push('finish'),
    removeLastPoint: () => calls.push('undo'),
    abortDrawing: () => calls.push('abort'),
  } as unknown as Draw;
  return { draw, calls };
}

describe('handleDrawKeys', () => {
  it('Enter finishes, Backspace undoes, Esc cancels', () => {
    const { draw, calls } = fakeDraw();
    expect(handleDrawKeys(new KeyboardEvent('keydown', { key: 'Enter' }), [draw])).toBe(false);
    expect(handleDrawKeys(new KeyboardEvent('keydown', { key: 'Backspace' }), [draw])).toBe(false);
    expect(handleDrawKeys(new KeyboardEvent('keydown', { key: 'Escape' }), [draw])).toBe(true);
    expect(calls).toEqual(['finish', 'undo', 'abort']);
  });

  it('ignores inactive draws for Finish', () => {
    const { draw, calls } = fakeDraw(false);
    handleDrawKeys(new KeyboardEvent('keydown', { key: 'Enter' }), [draw]);
    expect(calls).toEqual([]);
  });
});
