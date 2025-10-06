export type CardState = {
  interval_days: number;
  ease: number;
  reps: number;
  lapses: number;
  due_at: string; // ISO
};

export function nextReview(state: CardState, grade: 0|1|2|3|4|5, now = new Date()): CardState {
  let { interval_days, ease, reps, lapses } = state;
  // bounds
  ease = Math.max(1.3, Math.min(ease || 2.5, 2.8));
  if (grade < 3) {
    lapses += 1;
    reps = 0;
    interval_days = 1;
    ease = Math.max(1.3, ease - 0.2);
  } else {
    reps += 1;
    if (reps === 1) interval_days = 1;
    else if (reps === 2) interval_days = 6;
    else interval_days = Math.round(interval_days * ease);
    ease = Math.min(2.8, ease + (grade === 5 ? 0.05 : 0));
  }
  const due = new Date(now.getTime() + interval_days * 24 * 60 * 60 * 1000);
  return { interval_days, ease, reps, lapses, due_at: due.toISOString() };
}
