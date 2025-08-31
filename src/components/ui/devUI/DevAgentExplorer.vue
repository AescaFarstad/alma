<template>
  <div class="panel">
    <div class="header">
      <div class="title">WAgent</div>
      <div class="actions">
        <button class="btn" @click="handleClick(deselectWAgent)">deselect</button>
        <button class="btn" :disabled="!selectedIdxValid" @click="handleClick(copySelectedState)">copy state</button>
        <button class="btn" :disabled="!selectedIdxValid" @click="handleClick(flyToSelected)">fly</button>
      </div>
    </div>

    <template v-if="selectedIdxValid">
      <div class="grid">
        <div class="cell key">idx</div>
        <div class="cell val">{{ selectedIdx }}</div>
        <div class="cell act">
          <button class="sbtn" @click="handleClick(() => copyText(String(selectedIdx)))">Cpy</button>
        </div>

        <div class="cell key">position</div>
        <div class="cell val">{{ fmtXY(stateObj.position) }}</div>
        <div class="cell act">
          <button class="sbtn" @click="handleClick(() => copyCoord(stateObj.position))">Cpy</button>
          <button class="sbtn" @click="handleClick(() => flyToCoord(stateObj.position))">Fly</button>
          <button class="sbtn" @click="handleClick(() => drawPoint(stateObj.position))">Draw</button>
        </div>

        <div class="cell key">next_corner</div>
        <div class="cell val">{{ fmtXY(stateObj.next_corner) }}</div>
        <div class="cell act">
          <button class="sbtn" @click="handleClick(() => copyCoord(stateObj.next_corner))">Cpy</button>
          <button class="sbtn" @click="handleClick(() => flyToCoord(stateObj.next_corner))">Fly</button>
          <button class="sbtn" @click="handleClick(() => drawPoint(stateObj.next_corner))">Draw</button>
        </div>

        <div class="cell key">next_corner2</div>
        <div class="cell val">{{ fmtXY(stateObj.next_corner2) }}</div>
        <div class="cell act">
          <button class="sbtn" @click="handleClick(() => copyCoord(stateObj.next_corner2))">Cpy</button>
          <button class="sbtn" @click="handleClick(() => flyToCoord(stateObj.next_corner2))">Fly</button>
          <button class="sbtn" @click="handleClick(() => drawPoint(stateObj.next_corner2))">Draw</button>
        </div>

        <div class="cell key">end_target</div>
        <div class="cell val">{{ fmtXY(stateObj.end_target) }}</div>
        <div class="cell act">
          <button class="sbtn" @click="handleClick(() => copyCoord(stateObj.end_target))">Cpy</button>
          <button class="sbtn" @click="handleClick(() => flyToCoord(stateObj.end_target))">Fly</button>
          <button class="sbtn" @click="handleClick(() => drawPoint(stateObj.end_target))">Draw</button>
        </div>

        <div class="cell key">num_valid_corners</div>
        <div class="cell val">{{ stateObj.num_valid_corners }}</div>
        <div class="cell act"></div>

        <div class="cell key">current_tri</div>
        <div class="cell val">{{ stateObj.current_tri }}</div>
        <div class="cell act"></div>

        <div class="cell key">next_corner_tri</div>
        <div class="cell val">{{ stateObj.next_corner_tri }}</div>
        <div class="cell act"></div>

        <div class="cell key">next_corner_tri2</div>
        <div class="cell val">{{ stateObj.next_corner_tri2 }}</div>
        <div class="cell act"></div>

        <div class="cell key">end_target_tri</div>
        <div class="cell val">{{ stateObj.end_target_tri }}</div>
        <div class="cell act"></div>

        <div class="cell key">state</div>
        <div class="cell val">{{ fmtState(stateObj.state) }}</div>
        <div class="cell act"></div>

        <div class="cell key">last_valid_position</div>
        <div class="cell val">{{ fmtXY(stateObj.last_valid_position) }}</div>
        <div class="cell act">
          <button class="sbtn" @click="handleClick(() => copyCoord(stateObj.last_valid_position))">Cpy</button>
          <button class="sbtn" @click="handleClick(() => flyToCoord(stateObj.last_valid_position))">Fly</button>
          <button class="sbtn" @click="handleClick(() => drawPoint(stateObj.last_valid_position))">Draw</button>
        </div>

        <div class="cell key">last_valid_tri</div>
        <div class="cell val">{{ stateObj.last_valid_tri }}</div>
        <div class="cell act"></div>

        <div class="cell key">pre_esc_corner</div>
        <div class="cell val">{{ fmtXY(stateObj.pre_escape_corner) }}</div>
        <div class="cell act">
          <button class="sbtn" @click="handleClick(() => copyCoord(stateObj.pre_escape_corner))">Cpy</button>
          <button class="sbtn" @click="handleClick(() => flyToCoord(stateObj.pre_escape_corner))">Fly</button>
          <button class="sbtn" @click="handleClick(() => drawPoint(stateObj.pre_escape_corner))">Draw</button>
        </div>

        <div class="cell key">pre_esc_corner_tri</div>
        <div class="cell val">{{ stateObj.pre_escape_corner_tri }}</div>
        <div class="cell act"></div>

        <div class="cell key">stuck_rating</div>
        <div class="cell val">({{ STUCK_DANGER_1 }}|{{ STUCK_DANGER_2 }}|{{ STUCK_DANGER_3 }}) {{ fmtNumber(stateObj.stuck_rating) }}</div>
        <div class="cell act">
          <button class="sbtn" @click="handleClick(() => adjustStuck( +1))">+1</button>
          <button class="sbtn" @click="handleClick(() => adjustStuck(-1))">-1</button>
        </div>

        <div class="cell key">sight_rating</div>
        <div class="cell val">{{ fmtNumber(stateObj.sight_rating) }}</div>
        <div class="cell act"></div>

        <div class="cell key">path_frustration</div>
        <div class="cell val">{{ fmtNumber(stateObj.path_frustration) }} / {{ fmtNumber(stateObj.max_frustration) }}</div>
        <div class="cell act">
          <button class="sbtn" @click="handleClick(() => adjustPathFrustration(+1))">+1</button>
          <button class="sbtn" @click="handleClick(() => adjustPathFrustration(-1))">-1</button>
        </div>

        <div class="cell key">predicament_rating</div>
        <div class="cell val">{{ fmtNumber(stateObj.predicament_rating) }}</div>
        <div class="cell act"></div>

        <div class="divider"></div>

        <div class="cell key">accel</div>
        <div class="cell val">{{ fmtNumber(stateObj.accel) }}</div>
        <div class="cell act"></div>

        <div class="cell key">max_speed</div>
        <div class="cell val">{{ fmtNumber(stateObj.max_speed) }}</div>
        <div class="cell act"></div>

        <div class="cell key">resistance</div>
        <div class="cell val">{{ fmtNumber(stateObj.resistance) }}</div>
        <div class="cell act"></div>

        <div class="cell key">intelligence</div>
        <div class="cell val">{{ fmtNumber(stateObj.intelligence) }}</div>
        <div class="cell act"></div>

        <div class="cell key">arr_desired_spd</div>
        <div class="cell val">{{ fmtNumber(stateObj.arrival_desired_speed) }}</div>
        <div class="cell act"></div>

        <div class="cell key">look_speed</div>
        <div class="cell val">{{ fmtNumber(stateObj.look_speed) }}</div>
        <div class="cell act"></div>

        <div class="cell key">arr_threshold_sq</div>
        <div class="cell val">{{ fmtNumber(stateObj.arrival_threshold_sq) }}</div>
        <div class="cell act"></div>

        <div class="cell key">display</div>
        <div class="cell val small-text">{{ stateObj.display }}</div>
        <div class="cell act"></div>

        <div class="cell key">frame_id</div>
        <div class="cell val">{{ stateObj.frame_id }}</div>
        <div class="cell act"></div>

        <div class="cell key">is_alive</div>
        <div class="cell val">{{ stateObj.is_alive }}</div>
        <div class="cell act"></div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, onBeforeUnmount, ref } from 'vue';
import type { GameState } from '../../../logic/GameState';
import { SceneState, ACINDIGO } from '../../../logic/drawing/SceneState';
import { serialize_wagent } from '../../../logic/WAgent';
import { STUCK_DANGER_1, STUCK_DANGER_2, STUCK_DANGER_3, AgentState } from '../../../logic/agents/Agent';
import { mapInstance } from '../../../map_instance';
import { useAgentClipboard } from '../../../logic/composables/useAgentClipboard';
import { subscribeFrameUpdate } from '../../../logic/FrameUpdate';

const gameState = inject<GameState>('gameState')!;
const sceneState = inject<SceneState>('sceneState')!;
const dynamicScene = inject<any>('dynamicScene')!; // DynamicScene is POD; using any avoids circular import here
import { WasmFacade } from '../../../logic/WasmFacade';
const { copyWAgentStateByIdx } = useAgentClipboard(gameState);

const selectedIdx = computed(() => dynamicScene?.selectedWAgentIdx ?? null);
const selectedIdxValid = computed(() => typeof selectedIdx.value === 'number' && selectedIdx.value !== null);

// Local frame tick to force recomputation each frame for non-reactive WASM arrays
const uiFrame = ref(0);
let unsubscribe: null | (() => void) = null;

onMounted(() => {
  unsubscribe = subscribeFrameUpdate(() => {
    uiFrame.value++;
  });
});

onBeforeUnmount(() => {
  unsubscribe?.();
  unsubscribe = null;
});

const stateObj = computed(() => {
  // Depend on local uiFrame to update per frame
  void uiFrame.value;
  if (!selectedIdxValid.value) return null as any;
  const obj = serialize_wagent(gameState, selectedIdx.value as number);
  return (obj || {}) as any;
});

const fmtNumber = (n: number | undefined | null) => n === undefined || n === null ? '' : Number(n).toFixed(2).replace(/\.00$/, '');
const fmtXY = (p?: { x: number, y: number } | null) => p ? `${fmtNumber(p.x)}, ${fmtNumber(p.y)}` : '';
const fmtState = (s: number) => AgentState[s] ?? String(s);

const copyText = (t: string) => navigator.clipboard.writeText(t);
const copyCoord = (p: { x: number, y: number }) => navigator.clipboard.writeText(`${p.x}, ${p.y}`);

const flyToCoord = (p: { x: number, y: number }) => {
  if (!mapInstance.map) return;
  const view = mapInstance.map.getView();
  view.setCenter([p.x, p.y]);
  view.setZoom(9);
};

const drawPoint = (p: { x: number, y: number }) => {
  sceneState.addDebugPoint(p, ACINDIGO);
};

const copySelectedState = () => {
  if (!selectedIdxValid.value) return;
  copyWAgentStateByIdx(selectedIdx.value as number);
};

const flyToSelected = () => {
  if (!selectedIdxValid.value || !stateObj.value) return;
  flyToCoord(stateObj.value.position);
};

const deselectWAgent = () => {
  dynamicScene.selectedWAgentIdx = null;
  dynamicScene.selectedWAgentCorridor = null;
  WasmFacade.setSelectedWAgentIdx?.(null);
};

const adjustPathFrustration = (delta: number) => {
  if (!selectedIdxValid.value) return;
  const idx = selectedIdx.value as number;
  const agents = gameState.wasm_agents;
  const max = agents.max_frustrations[idx];
  const cur = agents.path_frustrations[idx];
  const next = Math.max(0, Math.min(max, cur + delta));
  agents.path_frustrations[idx] = next;
};

const adjustStuck = (delta: number) => {
  if (!selectedIdxValid.value) return;
  const idx = selectedIdx.value as number;
  const agents = gameState.wasm_agents;
  agents.stuck_ratings[idx] = agents.stuck_ratings[idx] + delta;
};

const handleClick = (fn: () => void) => {
  try { fn(); } catch (e) { console.error(e); }
};
</script>

<style scoped>
.panel {
  background: rgba(33, 33, 33, 0.9);
  padding: 6px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 2px 6px rgba(0,0,0,0.5);
  color: #f0f0f0;
  font-size: 12px;
  min-width: 320px;
}
.header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.title { font-weight: 600; }
.actions { display: flex; gap: 4px; }
.btn { background-color: #4f4f4f; color: #f5f5f5; border: none; border-radius: 3px; padding: 3px 8px; cursor: pointer; }
.btn:disabled { opacity: 0.5; cursor: default; }
.sbtn { background-color: #616161; color: #f5f5f5; border: none; border-radius: 3px; padding: 2px 6px; cursor: pointer; margin-right: 3px; }
.empty { color: #aaa; font-size: 11px; }
.small-text { font-size: 8px; }

.grid { display: grid; grid-template-columns: 110px 1fr 120px; gap: 3px 6px; align-items: center; }
.cell.key { color: #cfd8dc; }
.cell.val { font-family: monospace; }
.cell.act { display: flex; gap: 4px; }
.divider { grid-column: 1 / -1; height: 1px; background: rgba(255,255,255,0.12); margin: 4px 0; }
</style>
