import { DelayedAction, doneLabel, UNDO_MS, withoutIds } from './task-undo';

describe('task undo', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs the delayed delete after 5 s', () => {
    const run = vi.fn();
    const action = new DelayedAction(run);
    vi.advanceTimersByTime(UNDO_MS - 1);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
    expect(action.pending).toBe(false);
  });

  it('undo cancels the delete', () => {
    const run = vi.fn();
    const action = new DelayedAction(run);
    expect(action.cancel()).toBe(true);
    vi.advanceTimersByTime(UNDO_MS * 2);
    expect(run).not.toHaveBeenCalled();
    expect(action.cancel()).toBe(false);
  });

  it('flush runs once immediately', () => {
    const run = vi.fn();
    const action = new DelayedAction(run);
    action.flush();
    action.flush();
    vi.advanceTimersByTime(UNDO_MS);
    expect(run).toHaveBeenCalledTimes(1);
    expect(action.cancel()).toBe(false);
  });

  it('hides tasks waiting for deletion', () => {
    const list = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(withoutIds(list, new Set([2])).map((t) => t.id)).toEqual([1, 3]);
    expect(withoutIds(list, new Set())).toBe(list);
  });

  it('labels mowing tasks', () => {
    expect(doneLabel('Mow the lawn')).toBe('Mowed');
    expect(doneLabel('Prune fruit trees')).toBe('Done');
  });
});
