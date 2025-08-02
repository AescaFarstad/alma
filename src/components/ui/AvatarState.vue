<template>
  <div id="avatar-state-panel" v-if="props.avatar">
    <div class="state-grid">
        <div class="state-item full-width">
            <span>Pos</span>
            <div class="coordinate-pair">
                <span class="coord-value">{{ props.avatar.coordinate.x }}</span>
                <span class="coord-value">{{ props.avatar.coordinate.y }}</span>
            </div>
        </div>
        <div class="state-item full-width">
            <span>Vel</span>
            <div class="coordinate-pair">
                <span class="coord-value">{{ props.avatar.velocity.x }}</span>
                <span class="coord-value">{{ props.avatar.velocity.y }}</span>
            </div>
        </div>
        <div class="state-item">
            <span>Speed</span>
            <span class="value">{{ speed.toFixed(2) }}</span>
        </div>
         <div class="state-item">
            <span>Triangle</span>
            <span class="value">{{ props.avatar.lastTriangle }}</span>
        </div>
        <div class="state-item button-item">
            <button @click="copyState">Copy</button>
        </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineProps, type PropType } from 'vue';
import type { Avatar } from '../../logic/GameState';
import { length } from '../../logic/core/math';

const props = defineProps({
  avatar: {
    type: Object as PropType<Avatar | null>,
    default: null
  }
});

const speed = computed(() => {
    if (!props.avatar) return 0;
    return length(props.avatar.velocity);
});

const copyState = () => {
  if (props.avatar) {
    navigator.clipboard.writeText(JSON.stringify(props.avatar, null, 2));
  }
};
</script>

<style>
#avatar-state-panel {
  position: absolute;
  bottom: 54px; /* Move up to not overlap with info-panel */
  left: 0px;
  background: rgba(25, 25, 25, 0.85);
  padding: 8px;
  border-radius: 6px;
  z-index: 1;
  width: 300px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 2px 8px rgba(0,0,0,0.4);
  color: #f0f0f0;
  font-family: monospace;
  font-size: 11px;
}

.state-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
}

.state-item {
    display: flex;
    justify-content: flex-start;
    background: rgba(0,0,0,0.2);
    padding: 3px 5px;
    border-radius: 3px;
    align-items: center;
    gap: 8px;
}

.state-item.full-width {
    grid-column: span 3;
}

.coordinate-pair {
    display: flex;
    font-family: 'Courier New', monospace;
    flex: 1;
    gap: 8px;
}

.coord-value {
    flex: 1;
    text-align: left;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 10px;
}

.separator {
    margin: 0 2px;
    flex-shrink: 0;
    font-size: 10px;
}

.button-item {
    justify-content: center;
    padding: 3px 5px;
}

.state-item span:first-child {
    font-weight: 500;
    color: #aaa;
    margin-right: 5px;
}

.state-item .value {
    white-space: nowrap;
    text-overflow: ellipsis;
    text-align: left;
    font-family: 'Courier New', monospace;
}

#avatar-state-panel button {
    background-color: #4f4f4f;
    color: #f5f5f5;
    border: none;
    border-radius: 3px;
    padding: 3px 8px;
    cursor: pointer;
    transition: background-color 0.3s ease;
    font-weight: 500;
    font-size: 10px;
    width: 100%;
}

#avatar-state-panel button:hover {
    background-color: #616161;
}

/* Hide unused elements from old style */
#avatar-state-panel h3, #avatar-state-panel pre {
    display: none;
}
</style> 