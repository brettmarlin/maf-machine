/**
 * coachingEngine.ts — Claude API integration for post-run coaching,
 * weekly summaries, and conversational chat.
 */

import type { CoachingPayload, WeeklySummaryPayload } from './coachingPayload';

// --- Response Interfaces ---

export interface CoachingAssessment {
  headline: string;
  assessment: string;
  highlight: string;
  focus_next_run: string;
  xp_note: string | null;
  generated_at: string;
}

export interface WeeklySummary {
  summary: string;
  generated_at: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ChatState {
  messages: ChatMessage[];
  last_activity_id: number | null;
  updated_at: string;
}

// --- System Prompts ---

const POST_RUN_SYSTEM_PROMPT = `You are the MAF Coach inside MAF Machine, a running app built on Dr. Phil Maffetone's Maximum Aerobic Function method.

Your job: analyze this runner's latest run in the context of their training history, then give them a coaching assessment that is specific, honest, and encouraging.

METHODOLOGY RULES (never contradict these):
- The 180-Formula sets the target HR. It is not negotiable.
- If hills, heat, or fatigue spike HR: slow down or walk. Do not adjust the target.
- First 10-15 minutes should be a gradual warm-up, HR at least 10 bpm below MAF max.
- Put speedwork on hold until base is built (3-6 months of steady improvement).
- Cardiac drift < 5% indicates good aerobic fitness. < 3% is excellent.
- Aerobic decoupling < 5% means the aerobic system is handling the load well.
- Cadence target: 170+ spm. Higher cadence = lighter steps = less injury risk.
- Consistency beats intensity. 3-4 runs per week in zone trumps 1 hard run.
- Progress is measured in pace at the same HR over months, not days.
- Nutrition, sleep, and stress directly affect aerobic performance.
- Patience is the hardest part. Reframe slow as "building" not "failing."

VOICE:
- Talk like a knowledgeable running coach who genuinely cares.
- Be specific — reference actual numbers from this run.
- Celebrate micro-progress that the runner might miss.
- Be honest about problems but always pair with actionable advice.
- Never patronize. Never use toxic positivity. Never lecture.
- Keep it conversational. 3-4 short paragraphs max.
- Reference their streak, XP, or upcoming milestone when motivating.

STRUCTURE your response as JSON:
{
  "headline": "Short punchy title (5-8 words)",
  "assessment": "2-4 paragraphs of coaching. Reference specific numbers. Compare to recent runs. Highlight what improved, what to work on, and what's next.",
  "highlight": "One specific thing they did well this run (1 sentence)",
  "focus_next_run": "One specific thing to focus on next run (1 sentence)",
  "xp_note": "Brief note contextualizing their XP/level/streak (1 sentence, optional — null if nothing notable)"
}

Respond ONLY with valid JSON. No markdown fences. No extra text.`;

const WEEKLY_SUMMARY_SYSTEM_PROMPT = `You are the MAF Coach inside MAF Machine, a running app built on Dr. Phil Maffetone's Maximum Aerobic Function method.

Generate a weekly training summary. Cover:
- Total zone minutes vs target
- Streak status
- Best run of the week and why
- Comparison to same metrics from the prior week
- What to focus on this coming week
- Any milestone they're approaching

Keep it warm, specific, and forward-looking. 3-4 paragraphs.

Respond with plain text (no JSON, no markdown fences). This will be displayed directly to the user.`;

const CHAT_SYSTEM_PROMPT = `You are the MAF Coach inside MAF Machine, a running app built on Dr. Phil Maffetone's Maximum Aerobic Function method.

You are now in a conversation with the runner. They've read your assessment and have follow-up questions.

METHODOLOGY RULES (never contradict these):
- The 180-Formula sets the target HR. It is not negotiable.
- If hills, heat, or fatigue spike HR: slow down or walk. Do not adjust the target.
- First 10-15 minutes should be a gradual warm-up, HR at least 10 bpm below MAF max.
- Put speedwork on hold until base is built (3-6 months of steady improvement).
- Cardiac drift < 5% indicates good aerobic fitness. < 3% is excellent.
- Aerobic decoupling < 5% means the aerobic system is handling the load well.
- Cadence target: 170+ spm. Higher cadence = lighter steps = less injury risk.
- Consistency beats intensity. 3-4 runs per week in zone trumps 1 hard run.
- Progress is measured in pace at the same HR over months, not days.

RULES:
- Stay grounded in their actual data. Don't speculate beyond what the numbers show.
- For nutrition, sleep, and stress questions: give MAF-methodology-aligned advice but note you're an AI coach, not a doctor.
- If they ask about injuries or pain: do not diagnose. Recommend they see a professional. You can discuss how to modify training around recovery.
- If they express frustration about being slow: this is the #1 coaching moment. Reframe it. Reference their actual progress. Point to specific numbers improving. Remind them that every elite MAF runner went through this phase.
- Keep responses concise — 1-3 paragraphs. This is a chat, not an essay.
- You can reference their XP, level, streak, and upcoming milestones to motivate.
- If asked something outside running/MAF (politics, coding, etc.): gently redirect. "I'm your MAF coach — I'm best at helping with your aerobic training. What's on your mind about your running?"

Respond with plain text. No JSON. No markdown fences.`;

// --- Claude API Caller ---

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ClaudeResponse {
  content: Array<{ type: string; text: string }>;
  usage?: { input_tokens: number; output_tokens: number };
}

async function callClaude(
  apiKey: string,
  systemPrompt: string,
  messages: ClaudeMessage[],
  maxTokens: number = 1024
): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error ${response.status}: ${errorText}`);
  }

  const data: ClaudeResponse = await response.json();

  if (data.usage) {
    console.log(`[coaching] Claude usage: ${data.usage.input_tokens} in / ${data.usage.output_tokens} out`);
  }

  const textBlock = data.content.find((c) => c.type === 'text');
  if (!textBlock) {
    throw new Error('Claude API returned no text content');
  }

  return textBlock.text;
}

// --- Response Parsing ---

function parseCoachingJSON(raw: string): CoachingAssessment {
  // Strip markdown fences if present
  let cleaned = raw.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      headline: parsed.headline || 'Run Complete',
      assessment: parsed.assessment || '',
      highlight: parsed.highlight || '',
      focus_next_run: parsed.focus_next_run || '',
      xp_note: parsed.xp_note || null,
      generated_at: new Date().toISOString(),
    };
  } catch (e) {
    // If JSON parsing fails, treat entire response as assessment text
    console.error('[coaching] Failed to parse coaching JSON, using raw text:', e);
    return {
      headline: 'Run Complete',
      assessment: raw,
      highlight: '',
      focus_next_run: '',
      xp_note: null,
      generated_at: new Date().toISOString(),
    };
  }
}

// --- Public Functions ---

/**
 * Generate a post-run coaching assessment via Claude API.
 */
export async function generatePostRunCoaching(
  apiKey: string,
  payload: CoachingPayload
): Promise<CoachingAssessment> {
  const userMessage = `Here is the runner's data for their latest run:\n\n${JSON.stringify(payload, null, 2)}`;

  const raw = await callClaude(apiKey, POST_RUN_SYSTEM_PROMPT, [
    { role: 'user', content: userMessage },
  ]);

  return parseCoachingJSON(raw);
}

/**
 * Generate a weekly training summary via Claude API.
 */
export async function generateWeeklySummary(
  apiKey: string,
  payload: WeeklySummaryPayload
): Promise<WeeklySummary> {
  const userMessage = `Here is the runner's weekly training data:\n\n${JSON.stringify(payload, null, 2)}`;

  const raw = await callClaude(apiKey, WEEKLY_SUMMARY_SYSTEM_PROMPT, [
    { role: 'user', content: userMessage },
  ]);

  return {
    summary: raw.trim(),
    generated_at: new Date().toISOString(),
  };
}

/**
 * Handle a conversational chat message.
 * Loads chat history, appends user message, calls Claude, returns response.
 */
export async function handleChatMessage(
  apiKey: string,
  userMessage: string,
  chatState: ChatState,
  contextSummary: string
): Promise<{ response: string; updatedChat: ChatState }> {
  // Build messages array: context as first user message, then conversation history
  const messages: ClaudeMessage[] = [];

  // Inject context as a system-level user message
  messages.push({
    role: 'user',
    content: `[CONTEXT — do not repeat this to the runner]\n${contextSummary}\n\n[END CONTEXT]\n\nThe runner wants to chat. Their first message follows.`,
  });
  messages.push({
    role: 'assistant',
    content: 'Ready to help. What\'s on your mind?',
  });

  // Add conversation history (last 10 messages)
  const recentMessages = chatState.messages.slice(-10);
  for (const msg of recentMessages) {
    messages.push({ role: msg.role, content: msg.content });
  }

  // Add the new user message
  messages.push({ role: 'user', content: userMessage });

  const raw = await callClaude(apiKey, CHAT_SYSTEM_PROMPT, messages, 512);
  const responseText = raw.trim();

  // Update chat state
  const now = new Date().toISOString();
  const updatedChat: ChatState = {
    ...chatState,
    messages: [
      ...chatState.messages,
      { role: 'user', content: userMessage, timestamp: now },
      { role: 'assistant', content: responseText, timestamp: now },
    ],
    updated_at: now,
  };

  // Keep only last 20 messages (10 pairs)
  if (updatedChat.messages.length > 20) {
    updatedChat.messages = updatedChat.messages.slice(-20);
  }

  return { response: responseText, updatedChat };
}

// --- KV Cache Helpers ---

export async function getCachedCoaching(
  kv: KVNamespace,
  athleteId: string,
  activityId: number
): Promise<CoachingAssessment | null> {
  const raw = await kv.get(`${athleteId}:coaching:${activityId}`);
  if (!raw) return null;
  return JSON.parse(raw);
}

export async function cacheCoaching(
  kv: KVNamespace,
  athleteId: string,
  activityId: number,
  coaching: CoachingAssessment
): Promise<void> {
  await kv.put(
    `${athleteId}:coaching:${activityId}`,
    JSON.stringify(coaching)
  );
}

export async function getCachedWeeklySummary(
  kv: KVNamespace,
  athleteId: string,
  week: string
): Promise<WeeklySummary | null> {
  const raw = await kv.get(`${athleteId}:coaching:weekly:${week}`);
  if (!raw) return null;
  return JSON.parse(raw);
}

export async function cacheWeeklySummary(
  kv: KVNamespace,
  athleteId: string,
  week: string,
  summary: WeeklySummary
): Promise<void> {
  await kv.put(
    `${athleteId}:coaching:weekly:${week}`,
    JSON.stringify(summary)
  );
}

export async function loadChatState(
  kv: KVNamespace,
  athleteId: string
): Promise<ChatState> {
  const raw = await kv.get(`${athleteId}:chat`);
  if (!raw) {
    return {
      messages: [],
      last_activity_id: null,
      updated_at: new Date().toISOString(),
    };
  }
  return JSON.parse(raw);
}

export async function saveChatState(
  kv: KVNamespace,
  athleteId: string,
  state: ChatState
): Promise<void> {
  await kv.put(`${athleteId}:chat`, JSON.stringify(state));
}
