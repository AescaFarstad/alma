import { EventBuffer } from "../EventBuffer";
import { GameState } from "../GameState";
import { dynamicScene } from "../drawing/DynamicScene";


export enum AgentEventType {
  NONE = 0,
  CMD_SET_CORRIDOR = 1,
  EVT_SELECTED_CORRIDOR = 2,
  CMD_NAVIGATE_TO_NEARBY_TARGET = 3,
  CMD_ADD_AGENT_MOD = 4,
}

export enum CorridorAction {
  SET_ONLY = 1,
  SET_AND_STRAIGHT_CORNER = 2,
  SET_AND_RECALC_CORNERS = 3,
}

export function handleEvents(gs: GameState) {
  const events = gs.wasm_agents.events;
  events.cursor = 0;
  while (events.u32[events.cursor] != 0) {
    const header = events.u32[events.cursor];
    const type = header & 0xffff;
    const size = (header >> 16) & 0xffff;
    if (size <= 0 || (events.cursor + size) > events.capWords) {
      console.error(`[EVT] Malformed header at ${events.cursor} type:${type} size:${size} cap:${events.capWords}`);
      events.cursor = events.capWords;
      break;
    }
    switch (type) {
      case AgentEventType.EVT_SELECTED_CORRIDOR: {
        const agentIdx = events.u32[events.cursor + 1] | 0;
        const count = size - 2;
        const corridor: number[] = new Array(count);
        for (let i = 0; i < count; i++) {
          corridor[i] = events.u32[events.cursor + 2 + i] | 0;
        }
        if (dynamicScene.selectedWAgentIdx === agentIdx) {
          dynamicScene.selectedWAgentCorridor = corridor;
        }
        break;
      }
      default:
        break;
    }
    events.cursor += size;
  }
}

export function cmdSetCorridor(buf: EventBuffer, agent_index: number, corridor1: number[], action: CorridorAction) {
  const sizeWords = 3 + corridor1.length;
  buf.writeHeader(AgentEventType.CMD_SET_CORRIDOR, sizeWords);
  const base = buf.cursor + 1;
  buf.u32[base] = agent_index >>> 0;
  buf.u32[base + 1] = action >>> 0;
  for (let i = 0; i < corridor1.length; i++) {
    buf.u32[base + 2 + i] = corridor1[i] >>> 0;
  }
  buf.cursor += sizeWords;
}

export function cmdNavigateToNearbyTarget(buf: EventBuffer, agent_index: number) {
  const sizeWords = 2;
  buf.writeHeader(AgentEventType.CMD_NAVIGATE_TO_NEARBY_TARGET, sizeWords);
  const base = buf.cursor + 1;
  buf.u32[base] = agent_index >>> 0;
  buf.cursor += sizeWords;
}

// Mod helpers (TS side must mirror C++ ids in agent_mods.h)
export enum ModProperty { Accel = 1 }

export enum ModOp { Multiply = 0, Add = 1 }

import { Agents, INDEX_BITS } from "./Agents";

export function cmdAddAgentMod(
  buf: EventBuffer,
  agents: Agents,
  agentIndex: number,
  property: ModProperty,
  op: ModOp,
  modValue: number,
  endTime: number,
  fadeAt: number = -1,
) {
  const sizeWords = 6;
  buf.writeHeader(AgentEventType.CMD_ADD_AGENT_MOD, sizeWords);
  const base = buf.cursor + 1;

  const gen = agents.generation[agentIndex] >>> 0;
  const handle = ((gen << INDEX_BITS) | (agentIndex & 0xffff)) >>> 0;
  const packed = (((op & 0xff) << 8) | (property & 0xff)) >>> 0;

  buf.u32[base + 0] = handle;
  buf.u32[base + 1] = packed;
  buf.f32[base + 2] = modValue;
  buf.f32[base + 3] = endTime;
  buf.f32[base + 4] = fadeAt;
  buf.cursor += sizeWords;
}
