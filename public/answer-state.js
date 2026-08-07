function timestamp(value) {
  const date = value instanceof Date ? value : new Date(value ?? Date.now());
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

export function touchAnswer(answer, now = Date.now()) {
  if (!answer || typeof answer !== 'object') return answer;
  answer.savedAt = timestamp(now);
  return answer;
}

export function selectChoice(answer, choiceId, now = Date.now()) {
  if (!answer || typeof answer !== 'object' || !choiceId) return answer;
  answer.selected = choiceId;
  answer.submitted = null;
  answer.checked = false;
  answer.result = null;
  return touchAnswer(answer, now);
}

export function submitChoice(answer, correctChoice, now = Date.now()) {
  if (!answer || typeof answer !== 'object' || !answer.selected) return null;
  const submitted = answer.selected;
  answer.submitted = submitted;
  answer.result = submitted === correctChoice;
  answer.checked = true;
  answer.revealed = true;
  answer.deadline = null;
  touchAnswer(answer, now);
  return { submitted, result: answer.result };
}

export function displayedChoice(answer) {
  if (!answer || typeof answer !== 'object') return null;
  return answer.checked && answer.submitted ? answer.submitted : answer.selected || null;
}
