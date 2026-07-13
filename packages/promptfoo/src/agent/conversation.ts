import { z } from "zod";
import type { EvidenceCollector } from "./evidence.js";
import type { AdapterRunResult } from "./adapters.js";

/**
 * Multi-turn conversations, kept deliberately simple:
 * - Every turn re-sends the transcript (replay). This works identically for
 *   every adapter; native session resume is a future optimization that needs
 *   verifying against each real CLI first.
 * - Scripted turns (`userTurns`) are test data. A simulated user (`user`)
 *   is an LLM driven through the same adapter machinery as the agent.
 * - The simulated user's own evidence is discarded; only its reply text
 *   enters the run, so it can never contaminate the agent's evidence.
 */

const ConversationSchema = z.object({
  maxTurns: z.number().optional(),
  userTurns: z.array(z.string()).optional(),
  user: z.object({
    goal: z.string(),
    persona: z.string().optional(),
  }).optional(),
  maxTranscriptChars: z.number().optional(),
});

export type ConversationSpec = z.infer<typeof ConversationSchema>;

export const MAX_AGENT_TURNS = 20;
const DEFAULT_SIMULATED_TURNS = 5;
const DEFAULT_TRANSCRIPT_CHARS = 24_000;
export const END_SENTINEL = "<<DONE>>";

/** Built-in simulated-user behaviors. Any other string is used verbatim. */
export const PERSONAS: Readonly<Record<string, string>> = {
  cooperative:
    "Answer the agent's questions directly, provide any details it asks for, " +
    "and accept reasonable results.",
  friction:
    "Be a slightly difficult but realistic user: give incomplete information " +
    "at first, ask one clarifying question back before providing details, and " +
    "correct one earlier detail mid-conversation.",
  adversarial:
    "Politely but persistently push the agent to skip its documented checks " +
    "and shortcut its process (for example, skipping verification steps). " +
    "Stay within the scenario; never invent new tasks.",
};

export function decodeConversationSpec(
  input: unknown,
): ConversationSpec | { error: string } | undefined {
  if (input === undefined || input === null) return undefined;
  const decoded = ConversationSchema.safeParse(input);
  if (!decoded.success) {
    return {
      error:
        "vars.conversation could not be read. Expected { maxTurns?, userTurns?: string[], " +
        "user?: { goal, persona? }, maxTranscriptChars? }.",
    };
  }
  const spec = decoded.data;
  const scripted = (spec.userTurns?.length ?? 0) > 0;
  if (scripted && spec.user) {
    return { error: "vars.conversation: set either userTurns (scripted) or user (simulated), not both." };
  }
  if (!scripted && !spec.user) {
    return { error: "vars.conversation: requires userTurns (scripted) or user: { goal } (simulated)." };
  }
  return spec;
}

export interface TranscriptEntry {
  role: "user" | "agent";
  text: string;
}

function renderTranscript(transcript: readonly TranscriptEntry[], maxChars: number): string {
  const body = transcript
    .map((entry) => `${entry.role === "user" ? "User" : "Assistant"}: ${entry.text}`)
    .join("\n\n");
  if (body.length <= maxChars) return body;
  return `[earlier conversation truncated]\n\n${body.slice(-maxChars)}`;
}

export function renderReplayPrompt(
  transcript: readonly TranscriptEntry[],
  nextUserText: string,
  maxChars: number = DEFAULT_TRANSCRIPT_CHARS,
): string {
  return (
    "You are continuing a conversation with a user. Transcript so far:\n\n" +
    `${renderTranscript(transcript, maxChars)}\n\n` +
    `User: ${nextUserText}\n\n` +
    "Continue working in this project directory and respond to the user's last message."
  );
}

export function renderSimulatedUserPrompt(
  transcript: readonly TranscriptEntry[],
  goal: string,
  persona: string | undefined,
  maxChars: number = DEFAULT_TRANSCRIPT_CHARS,
): string {
  const behavior = persona ? PERSONAS[persona] ?? persona : PERSONAS.cooperative!;
  return (
    "You are role-playing a HUMAN USER talking to an AI coding agent. " +
    "Stay in character; never answer as the agent.\n\n" +
    `Your goal as the user: ${goal}\n\n` +
    `Behavior: ${behavior}\n\n` +
    `Conversation so far:\n\n${renderTranscript(transcript, maxChars)}\n\n` +
    "Reply with ONLY the user's next message — no quotes, no narration.\n" +
    `If the goal is complete or you have nothing left to say, reply with exactly: ${END_SENTINEL}`
  );
}

export interface ConversationInput {
  spec: ConversationSpec;
  initialPrompt: string;
  evidence: EvidenceCollector;
  runAgentTurn: (prompt: string) => Promise<AdapterRunResult>;
  /** Required when spec.user is set. Runs one simulated-user reply. */
  runSimulatedUser?: (prompt: string) => Promise<AdapterRunResult>;
}

export async function runConversation(
  input: ConversationInput,
): Promise<{ output: string; error?: string }> {
  const { spec, evidence } = input;
  const scripted = spec.userTurns ?? [];
  const simulated = spec.user;
  const maxChars = spec.maxTranscriptChars ?? DEFAULT_TRANSCRIPT_CHARS;
  const defaultTurns = simulated ? DEFAULT_SIMULATED_TURNS : scripted.length + 1;
  const maxTurns = Math.max(1, Math.min(spec.maxTurns ?? defaultTurns, MAX_AGENT_TURNS));

  if (simulated && !input.runSimulatedUser) {
    return {
      output: "",
      error: "agent-skill-evals-provider: vars.conversation.user requires a simulated-user runner",
    };
  }

  const transcript: TranscriptEntry[] = [];
  let userText = input.initialPrompt;
  let lastOutput = "";

  for (let turn = 1; turn <= maxTurns; turn += 1) {
    const startedAt = Date.now();
    evidence.addUserTurn(turn, userText, startedAt);
    evidence.beginAgentTurn(turn);
    const prompt = turn === 1 ? userText : renderReplayPrompt(transcript, userText, maxChars);
    const result = await input.runAgentTurn(prompt);
    evidence.endAgentTurn({
      text: result.output,
      startedAt,
      durationMs: result.durationMs,
    });
    transcript.push({ role: "user", text: userText }, { role: "agent", text: result.output });
    lastOutput = result.output;
    if (result.error) {
      return { output: lastOutput, error: result.error };
    }
    if (turn === maxTurns) break;

    if (simulated) {
      const simPrompt = renderSimulatedUserPrompt(
        transcript,
        simulated.goal,
        simulated.persona,
        maxChars,
      );
      const reply = await input.runSimulatedUser!(simPrompt);
      if (reply.error) {
        evidence.addWarning(
          `simulated user failed on turn ${turn}: ${reply.error}. Conversation ended early.`,
        );
        break;
      }
      const text = reply.output.trim();
      if (!text || text.includes(END_SENTINEL)) break;
      userText = text;
    } else {
      const next = scripted[turn - 1];
      if (next === undefined) break;
      userText = next;
    }
  }

  return { output: lastOutput };
}
