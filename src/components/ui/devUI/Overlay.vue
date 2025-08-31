<template>
  <div id="ui-overlay">
    <!-- Top-left stack -->
    <div id="left-panel">
      <DevActionPanel />
      <DevDrawingPanel />
      <DevSelectedBuildings />
      <DevNavExplorer />
      <DevAgentExplorer />
    </div>

    <!-- Top-right stack -->
    <div id="top-right">
      <TimeControls />
      <div id="fps-display" v-if="fpsMetrics">
        {{ fpsMetrics.currentFPS }}|{{ fpsMetrics.averageFPS }}|{{ fpsMetrics.longAverageFPS }}|{{ fpsMetrics.maxFrameTime }}|{{ gameState?.gameTime.toFixed(1) }}
      </div>
      <DevAgents :agent-count="props.agentCount" />
    </div>

    <!-- Bottom-left -->
    <div id="bottom-left">
      <CoordsPanel
        :mouse-coordinates="props.mouseCoordinates"
        :map-bounds="props.mapBounds"
        :zoom-level="props.zoomLevel"
      />
    </div>

    <!-- Bottom-right: SelectedPointMarks (component positions itself) -->
    <SelectedPointMarks />

    <!-- Measurement panel (kept as floating) -->
    <div id="measurement-panel" v-if="props.measurementDistance">
      {{ props.measurementDistance.toFixed(1) }}m
    </div>

    <!-- Optional feature info, keep bottom-right floating -->
    <div id="feature-info-panel" v-if="props.selectedFeatureInfo">
      <h3>Feature Information</h3>
      <pre>{{ props.selectedFeatureInfo }}</pre>
    </div>

    <!-- Dev Context Menu mounted under Overlay -->
    <ContextMenu
      :visible="props.contextMenu?.visible || false"
      :x="props.contextMenu?.x || 0"
      :y="props.contextMenu?.y || 0"
      :coordinate="props.contextMenu?.coordinate || { lng: 0, lat: 0 }"
      @hide="emit('hide-context-menu')"
    />
  </div>
</template>

<script setup lang="ts">
import { defineProps, defineEmits, inject, type PropType } from 'vue';
import type { FPSMetrics } from '../../../logic/FPSCounter';
import DevSelectedBuildings from './DevSelectedBuildings.vue';
import DevNavExplorer from './DevNavExplorer.vue';
import DevAgentExplorer from './DevAgentExplorer.vue';
import DevDrawingPanel from './DevDrawingPanel.vue';
import DevActionPanel from './DevActionPanel.vue';
import DevAgents from './DevAgents.vue';
import SelectedPointMarks from './SelectedPointMarks.vue';
import ContextMenu from './ContextMenu.vue';
import TimeControls from './TimeControls.vue';
import CoordsPanel from './CoordsPanel.vue';
import type { Avatar, GameState } from '../../../logic/GameState';
import { SceneState } from '../../../logic/drawing/SceneState';

// Inject the game state provided in main.ts
const fpsMetrics = inject<FPSMetrics>('fpsMetrics');
const gameState = inject<GameState>('gameState');
const sceneState = inject<SceneState>('sceneState');

const props = defineProps({
  mouseCoordinates: {
  type: Object as PropType<{ lng: number; lat: number } | null>,
  default: null
  },
  mapBounds: {
  type: String,
  default: ''
  },
  mapCenter: {
  type: Object as PropType<{ lng: number, lat: number } | null>,
  default: null
  },
  selectedFeatureInfo: {
  type: Object,
  default: null
  },
  measurementDistance: {
  type: Number as PropType<number | null>,
  default: null
  },
  zoomLevel: {
  type: Number as PropType<number | null>,
  default: null
  },
  avatar: {
  type: Object as PropType<Avatar | null>,
  default: null
  },
  agentCount: {
  type: Number as PropType<number | null>,
  default: null
  },
  contextMenu: {
    type: Object as PropType<{ visible: boolean; x: number; y: number; coordinate: { lng: number; lat: number } | null } | null>,
    default: null
  }
});

const emit = defineEmits(['map-event', 'hide-context-menu']);
</script>

<style>
#ui-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none; /* Let map events pass through */
  color: #f0f0f0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  font-size: 12px;
}

#left-panel {
  position: absolute;
  top: 4px;
  left: 4px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  z-index: 1;
}

#ui-overlay > * {
  pointer-events: auto; /* But allow interaction with UI elements */
}

#top-right {
  position: absolute;
  top: 4px;
  right: 4px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  z-index: 1;
  align-items: flex-end;
}

#fps-display {
  background: rgba(33, 33, 33, 0.9);
  padding: 4px 6px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
  font-family: monospace;
  font-size: 11px;
  letter-spacing: 0.5px;
}

#bottom-left {
  position: absolute;
  bottom: 4px;
  left: 4px;
  z-index: 1;
}

#measurement-panel {
  position: absolute;
  bottom: 4px;
  left: 150px;
  background: rgba(33, 33, 33, 0.9);
  padding: 4px 6px;
  border-radius: 4px;
  z-index: 1;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
  font-family: monospace;
  font-size: 11px;
  line-height: 1.2;
}

#feature-info-panel {
  position: absolute;
  bottom: 10px;
  right: 10px;
  background: rgba(33, 33, 33, 0.9);
  padding: 12px;
  border-radius: 6px;
  z-index: 1;
  max-width: 300px;
  max-height: 200px;
  overflow: auto;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 2px 8px rgba(0,0,0,0.4);
}
</style>
