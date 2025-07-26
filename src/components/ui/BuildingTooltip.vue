<template>
  <div class="tooltip-container">
    <div v-if="building" class="tooltip-content">
      <h4>Building Properties</h4>
      <ul>
        <li v-for="(value, key) in building.stats" :key="key">
          <strong>{{ key }}:</strong>
          <span v-if="key as any === 'color'" class="color-box-container">
            <span class="color-box" :style="{ backgroundColor: value }"></span>
            {{ value }}
          </span>
          <span v-else>
            {{ value }}
          </span>
        </li>
        <li>
          <strong>area:</strong>
          <span>{{ buildingArea }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Building {
  id: string;
  stats: any;
  geometry: any;
}

const props = defineProps<{
  building: Building | null
}>();

const getVertexRingFromBuilding = (building: Building): number[][] | null => {
    const geom = building.geometry;
    if (!geom) return null;

    if (Array.isArray(geom) && Array.isArray(geom[0]) && Array.isArray(geom[0][0])) {
        return geom[0];
    }
    if (Array.isArray(geom) && Array.isArray(geom[0]) && typeof geom[0][0] === 'number') {
        const coords = geom as number[][];
        if (coords.length > 2 && 
            Math.sqrt(Math.pow(coords[0][0] - coords[coords.length - 1][0], 2) + Math.pow(coords[0][1] - coords[coords.length - 1][1], 2)) < 1e-9) {
            return coords;
        }
    }
    return null;
}

const getBuildingArea = (building: Building) => {
    const ring = getVertexRingFromBuilding(building);
    let area = 0;
    if (!ring || ring.length < 3) return 0;
    for (let i = 0; i < ring.length - 1; i++) {
        area += ring[i][0] * ring[i+1][1] - ring[i+1][0] * ring[i][1];
    }
    return Math.abs(area / 2);
}

const buildingArea = computed(() => {
  if (props.building) {
    return getBuildingArea(props.building).toFixed(2);
  }
  return 0;
});
</script>

<style scoped>
.tooltip-container {
  position: absolute;
  background: rgba(40, 40, 40, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  padding: 8px;
  color: #f0f0f0;
  font-size: 12px;
  z-index: 10;
  pointer-events: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  min-width: 200px;
}

.tooltip-content h4 {
  margin: 0 0 5px 0;
  font-size: 13px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 4px;
}

.tooltip-content ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.tooltip-content li {
  margin-bottom: 4px;
}

.tooltip-content li:last-child {
  margin-bottom: 0;
}

.color-box-container {
  display: inline-flex;
  align-items: center;
}

.color-box {
  width: 12px;
  height: 12px;
  border: 1px solid #fff;
  margin-right: 5px;
  display: inline-block;
}
</style>
