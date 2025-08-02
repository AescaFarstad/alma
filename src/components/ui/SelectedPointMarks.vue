<template>
  <div v-if="selectedPointMarks.length > 0" class="selected-point-marks-container">
    <div class="info-box">
      <h4>Selected Point Marks</h4>
      <ul>
        <li v-for="markId in selectedPointMarks" :key="markId">
          Point Mark #{{ markId }}
        </li>
      </ul>
      <button @click="deleteSelectedPointMarks">Delete Selected</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineProps, defineEmits } from 'vue';

const props = defineProps({
  selectedPointMarks: {
    type: Array as () => number[],
    required: true,
  },
});

const emit = defineEmits(['delete-selected-point-marks']);

const deleteSelectedPointMarks = () => {
  emit('delete-selected-point-marks', props.selectedPointMarks);
};
</script>

<style scoped>
.selected-point-marks-container {
  position: absolute;
  bottom: 20px;
  right: 20px;
  z-index: 10;
  background: rgba(33, 33, 33, 0.9);
  padding: 8px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
  color: #f0f0f0;
  font-size: 11px;
}

.info-box {
  background: transparent;
  padding: 0;
  box-shadow: none;
}

ul {
  list-style-type: none;
  padding: 0;
  margin: 0 0 10px 0;
}

li {
  padding: 2px 0;
}

button {
  background-color: #4f4f4f;
  color: #f5f5f5;
  border: none;
  border-radius: 3px;
  padding: 4px 8px;
  cursor: pointer;
  transition: background-color 0.3s ease;
  font-weight: 500;
  font-size: 11px;
  width: 100%;
}

button:hover {
  background-color: #616161;
}
</style> 