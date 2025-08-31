<template>
  <div class="tooltip-container">
  <div v-if="building" class="tooltip-content">
    <ul>
    <li v-for="(value, key) in building" :key="key">
      {{ key }}:   
      <span v-if="key as any === 'color'" class="color-box-container">
      <span class="color-box" :style="{ backgroundColor: value as any }"></span>
      <strong>    {{ value }}</strong>
      </span>
      <span v-else>
        <strong>    {{ value }}</strong>
      </span>
    </li>
    <li>
      area: 
      <span><strong>{{ area.toFixed(0) }}</strong></span>
    </li>
    </ul>
  </div>
  </div>
</template>

<script setup lang="ts">
import { BuildingProperties } from '../../../types';

const props = defineProps<{
  building: BuildingProperties | null,
  area: number
}>();

</script>

<style scoped>
.tooltip-container {
  position: fixed;
  background: rgba(40, 40, 40, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  padding: 8px;
  color: #f0f0f0;
  font-size: 12px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.3;
  z-index: 10000;
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
