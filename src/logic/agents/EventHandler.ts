import { EventBuffer } from "../EventBuffer";
import { GameState } from "../GameState";


export enum AgentEventType {
  NONE = 0,
  CMD_SET_CORRIDOR = 1,
}

export enum CorridorAction {
  SET_ONLY = 1,
  SET_AND_STRAIGHT_CORNER = 2,
  SET_AND_RECALC_CORNERS = 3,
}

export function handleEvents(gs: GameState) {
  const events = gs.wasm_agents.events;
  while (events.u32[events.cursor] != 0) {
    const header = events.u32[events.cursor];
    const type = header & 0xffff;
    const size = (header >> 16) & 0xffff;
    switch (type) {
      // case AgentEventType.NONE:
      //   break;
      default:
        // Unknown events from WASM -> skip them safely
        // console.warn(`Unknown event type from WASM: ${type}`);
        break;
    }
    events.cursor += size;
  }
}

export function cmdSetCorridor(buf: EventBuffer, agent_index: number, corridor1: number[], action: CorridorAction) {
  const sizeWords = 3 + corridor1.length; // header + agent + action + N polys
  buf.writeHeader(AgentEventType.CMD_SET_CORRIDOR, sizeWords);
  const base = buf.cursor + 1; // payload starts after header
  buf.u32[base] = agent_index >>> 0;
  buf.u32[base + 1] = action >>> 0;
  for (let i = 0; i < corridor1.length; i++) {
    buf.u32[base + 2 + i] = corridor1[i] >>> 0;
  }
  buf.cursor += sizeWords;
}
