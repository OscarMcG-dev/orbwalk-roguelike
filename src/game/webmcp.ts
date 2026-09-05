import type { Arena } from './arena.ts';

type Tool = {
  name: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean };
  execute: (input: unknown) => unknown;
};

/** Registers WebMCP tools when the browser exposes document.modelContext. No-op otherwise. */
export function registerTrainerTools(game: Arena) {
  const context = (document as Document & { modelContext?: { registerTool: (tool: Tool, options: { signal: AbortSignal }) => void | Promise<void> } }).modelContext;
  const lifecycle = new AbortController();
  if (!context?.registerTool) return () => {};
  const actions = ['start', 'pause', 'resume', 'choose', 'reroll', 'heal', 'shard', 'continue'];
  const tools: Tool[] = [
    {
      name: 'read_session',
      description: 'Read the current Orbwalk Rogue session: status, wave, HP, gold, relics and timing metrics.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: () => game.snapshot(),
    },
    {
      name: 'control_session',
      description: 'Start a run, pause/resume it, or during the intermission: choose (claim the free augment, index 0-3; the screen stays open), shard (buy a Stat Anvil shard, index 0-2), reroll, heal, then continue (depart to the next wave; only after a claim).',
      inputSchema: { type: 'object', properties: { action: { type: 'string', enum: actions }, index: { type: 'integer', minimum: 0, maximum: 3 } }, required: ['action'], additionalProperties: false },
      annotations: { readOnlyHint: false },
      execute: (input: unknown) => {
        const value = input as { action?: unknown; index?: unknown };
        if (!value || typeof value !== 'object' || !actions.includes(String(value.action))) throw new Error(`Expected action: ${actions.join(', ')}.`);
        switch (value.action) {
          case 'start': game.start(); break;
          case 'pause': game.pause(); break;
          case 'resume': if (game.status !== 'paused') throw new Error('The session is not paused.'); game.togglePause(); break;
          case 'choose': game.choose(Number(value.index ?? 0)); break;
          case 'reroll': game.reroll(); break;
          case 'heal': game.buyHeal(); break;
          case 'shard': game.buyShard(Number(value.index ?? 0)); break;
          case 'continue': if (!game.draftClaimed) throw new Error('Claim the free augment before continuing.'); game.continueWave(); break;
        }
        return game.snapshot();
      },
    },
  ];
  for (const tool of tools) {
    try { void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch { /* unsupported */ }
  }
  return () => lifecycle.abort();
}
