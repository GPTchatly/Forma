/** NEW: The real TypeSafe and OpenRouter System One HTTP adapter, isolated from UI composition.
 * Contracts verified against https://docs.typesafe.ai/api and https://openrouter.ai/~typesafe/jev-latest.
 * Endpoints are fixed: client requests cannot redirect credentials to another host.
 */
import { object, ValidationError } from '../shared/schema.mjs';
export const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export const OPENROUTER_JEV_ENDPOINT = 'https://openrouter.ai/api/v1/systemone';
export const OPENROUTER_DEFAULT_MODEL = '~typesafe/jev-latest';
const MAX_RESPONSE_BYTES = 1500000;
export class ProviderError extends Error {
  constructor(message, status = 502, upstreamStatus) {
    super(message); this.name = 'ProviderError'; this.status = status;
    // Only the fixed adapter supplies this numeric status; never retain the body.
    if (Number.isInteger(upstreamStatus) && upstreamStatus >= 100 && upstreamStatus <= 599) this.upstreamStatus = upstreamStatus;
  }
}
async function readResponse(response, signal) {
  if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) {
    response.body?.cancel().catch(() => {});
    throw new Error('Provider response exceeds the byte limit.');
  }
  if (!response.body) throw new Error('Missing provider response body.');
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  const cancel = () => { reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new Error('Provider response exceeds the byte limit.');
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, size).toString('utf8');
  } finally {
    signal.removeEventListener('abort', cancel);
    cancel();
  }
}
function probability(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) throw new ProviderError(`JEV returned an invalid ${label}. Nothing was applied.`);
  return value;
}
export function resolveJevConfig({ apiKey = '', model = 'jev-1.13.0', provider = '' } = {}) {
  if (provider && !['auto', 'typesafe', 'openrouter'].includes(provider)) throw new ValidationError('Invalid JEV provider.');
  if (typeof model !== 'string' || !/^(?:~?typesafe\/)?jev-[a-zA-Z0-9._-]{1,64}$/.test(model)) throw new ValidationError('Invalid JEV model identifier.');
  if (provider === 'typesafe' && /^~?typesafe\//.test(model)) throw new ValidationError('Invalid JEV model identifier.');
  const trimmedKey = typeof apiKey === 'string' ? apiKey.trim() : '';
  const useOpenRouter = provider === 'openrouter' || (provider !== 'typesafe' && (/^sk-or-/i.test(trimmedKey) || /^~?typesafe\//.test(model)));
  const resolvedModel = useOpenRouter
    ? (model === 'jev-1.13.0' || model === 'jev-latest' ? OPENROUTER_DEFAULT_MODEL : model === 'jev-1.13' ? 'typesafe/jev-1.13' : model === 'jev-router' ? 'typesafe/jev-router' : model)
    : model;
  return {
    provider: useOpenRouter ? 'openrouter' : 'typesafe',
    providerLabel: useOpenRouter ? 'OpenRouter' : 'TypeSafe',
    endpoint: useOpenRouter ? OPENROUTER_JEV_ENDPOINT : JEV_ENDPOINT,
    model: resolvedModel
  };
}
export function validateResponse(raw, questions) {
  let response;
  try { response = object(raw); object(response.answers); } catch { throw new ProviderError('JEV returned an unexpected response structure. Nothing was applied.'); }
  if (typeof response.model !== 'string' || !/^(?:~?typesafe\/)?jev-[a-zA-Z0-9._-]{1,64}$/.test(response.model)) throw new ProviderError('JEV response is missing a valid model identifier.');
  if (Object.keys(response.answers).length !== Object.keys(questions).length || Object.keys(response.answers).some((key) => !Object.hasOwn(questions, key))) throw new ProviderError('JEV returned an unexpected answer set. Nothing was applied.');
  const answers = {};
  for (const [key, question] of Object.entries(questions)) {
    const answer = response.answers[key];
    if (!answer || answer.type !== 'choice' || typeof answer.choice !== 'string' || !Object.hasOwn(question.criteria, answer.choice)) throw new ProviderError(`JEV returned an invalid choice for ${key}. Nothing was applied.`);
    let probs;
    try { probs = object(answer.probabilities); } catch { throw new ProviderError('JEV returned missing probabilities.'); }
    const expected = Object.keys(question.criteria);
    if (Object.keys(probs).length !== expected.length || expected.some((option) => !Object.hasOwn(probs, option))) throw new ProviderError('JEV returned probabilities for an unexpected option set.');
    let sum = 0;
    for (const option of expected) sum += probability(probs[option], 'probability');
    if (Math.abs(sum - 1) > 0.025) throw new ProviderError('JEV probability distribution does not sum to one.');
    answers[key] = { type: 'choice', choice: answer.choice, confidence: probability(answer.confidence, 'confidence'), probabilities: { ...probs } };
  }
  const usage = response.usage;
  if (!usage || !Number.isSafeInteger(usage.input_tokens) || usage.input_tokens < 0 || !Number.isSafeInteger(usage.output_tokens) || usage.output_tokens < 0) throw new ProviderError('JEV returned invalid token usage.');
  return { model: response.model, answers, usage: { input_tokens: usage.input_tokens, output_tokens: usage.output_tokens } };
}
export function createJevEvaluator({ apiKey, model = 'jev-1.13.0', provider = '', fetchImpl = fetch }) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new ProviderError('Connect your TypeSafe or OpenRouter API key in Settings to use live JEV.', 428);
  const config = resolveJevConfig({ apiKey, model, provider });
  return async ({ state, questions, signal }) => {
    const deadline = AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(22000)]);
    let response;
    try {
      response = await fetchImpl(config.endpoint, {
        method: 'POST', redirect: 'error', signal: deadline,
        headers: { 'Authorization': `Bearer ${apiKey.trim()}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ model: config.model, state, questions })
      });
    } catch (error) {
      if (deadline.aborted) throw new ProviderError('JEV request was cancelled or timed out. Your existing site is unchanged.', 504);
      throw new ProviderError(`Could not reach ${config.providerLabel}. Check your internet connection and try again. Your site is unchanged.`);
    }
    // NEW: Never reflect a provider error body: it may contain secrets, prompts or markup.
    if (!response.ok) {
      response.body?.cancel().catch(() => {});
      const messages = { 400: `${config.providerLabel} rejected the question format.`, 401: `${config.providerLabel} did not accept this API key.`, 402: `${config.providerLabel} requires available credits.`, 403: 'This key does not have access to JEV.', 404: 'This JEV model or endpoint is unavailable.', 422: `${config.providerLabel} could not process this request.`, 429: `${config.providerLabel} rate limit reached. Try again shortly.` };
      throw new ProviderError(`${messages[response.status] || `${config.providerLabel} returned HTTP ${response.status}.`} Nothing was applied.`, response.status === 429 ? 429 : 502, response.status);
    }
    let raw;
    try {
      const body = await readResponse(response, deadline);
      raw = JSON.parse(body);
    } catch {
      if (deadline.aborted) throw new ProviderError('JEV request was cancelled or timed out. Your existing site is unchanged.', 504);
      throw new ProviderError(`${config.providerLabel} returned unreadable JSON. Nothing was applied.`);
    }
    return validateResponse(raw, questions);
  };
}
