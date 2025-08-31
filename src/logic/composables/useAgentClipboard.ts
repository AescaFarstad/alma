import type { GameState } from "../GameState";
import type { WAgent } from "../WAgent";
import { serialize_wagent } from "../WAgent";
import { WasmFacade } from "../WasmFacade";

function customStringify(obj: any): string {
  const seen = new WeakSet();
  const replacer = (key: string, value: any) => {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) {
        return "[Circular Reference]";
      }
      seen.add(value);
    }
    if (typeof value === "string" && value.length > 10000) {
      return value.substring(0, 10000) + "... (truncated)";
    }
    return value;
  };

  const json = JSON.stringify(obj, replacer, 2);
  // Inline simple arrays
  const inlineSimpleArrays = json.replace(/(\[\s+)([\s\S]+?)(\s+\])/g, (match, open, content, close) => {
    const flattened = content.trim().replace(/\s*\n\s*/g, ' ');
    if (/^(\d+(,\s*)?)+$/.test(flattened) || /^(".*?"(,\s*)?)+$/.test(flattened)) {
      return `[ ${flattened} ]`;
    }
    return match;
  });
  // Inline { x, y }
  const inlineCoords = inlineSimpleArrays.replace(
    /\{\s+"x": ([^,]+),\s+"y": ([^}]+)\s+\}/g,
    (match, x, y) => `{ "x": ${x.trim()}, "y": ${y.trim()} }`
  );
  return inlineCoords;
}

function findNearestWAgent(gameState: GameState, x: number, y: number): WAgent | null {
  const wasm_agents = gameState.wasm_agents;
  if (!wasm_agents.positions) return null;
  let nearest: WAgent | null = null;
  let minDist = Infinity;
  for (const agent of gameState.wagents) {
    const idx = agent.idx;
    const ax = wasm_agents.positions[idx * 2];
    const ay = wasm_agents.positions[idx * 2 + 1];
    const dx = ax - x;
    const dy = ay - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < minDist) {
      minDist = d2;
      nearest = agent;
    }
  }
  return nearest;
}

function findNearestJsAgent(gameState: GameState, x: number, y: number) {
  let nearest: any = null;
  let minDist = Infinity;
  for (const agent of gameState.agents) {
    const dx = agent.coordinate.x - x;
    const dy = agent.coordinate.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < minDist) {
      minDist = d2;
      nearest = agent;
    }
  }
  return nearest;
}

export function useAgentClipboard(gameState: GameState) {
  const copyAgentStateAtCoordinate = (x: number, y: number) => {
    const nearest = findNearestJsAgent(gameState, x, y);
    if (!nearest) return;
    try {
      const completeState = JSON.parse(JSON.stringify(nearest));
      const text = customStringify(completeState);
      navigator.clipboard.writeText(text);
    } catch (e) {
      const fallback = `Agent ID: ${nearest.id}, Position: (${nearest.coordinate.x}, ${nearest.coordinate.y}), NextCorner: (${nearest.nextCorner.x}, ${nearest.nextCorner.y}), NextCornerTri: ${nearest.nextCornerTri}`;
      navigator.clipboard.writeText(fallback);
    }
  };

  const copyWAgentStateAtCoordinate = (x: number, y: number) => {
    const nearest = findNearestWAgent(gameState, x, y);
    if (!nearest) return;
    const state = serialize_wagent(gameState, nearest.idx);
    if (state) {
      // Augment with synchronous corridor via WASM API
      const corridor = WasmFacade.getAgentCorridorByIndex?.(nearest.idx) ?? [];
      (state as any).corridor = corridor;
      const text = customStringify(state);
      navigator.clipboard.writeText(text);
    }
  };

  const copyWAgentStateByIdx = (idx: number) => {
    const state = serialize_wagent(gameState, idx);
    if (state) {
      const corridor = WasmFacade.getAgentCorridorByIndex?.(idx) ?? [];
      (state as any).corridor = corridor;
      const text = customStringify(state);
      navigator.clipboard.writeText(text);
    }
  };

  return { customStringify, copyAgentStateAtCoordinate, copyWAgentStateAtCoordinate, copyWAgentStateByIdx };
}

export { customStringify };
