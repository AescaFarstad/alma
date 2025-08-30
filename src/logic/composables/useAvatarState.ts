import { ref, onMounted, onUnmounted, inject } from 'vue';
import type { GameState, Avatar } from '../GameState';

export function useAvatarState() {
  const gameState = inject<GameState>('gameState');
  const avatar = ref<Avatar | null>(null);
  let intervalId: number | null = null;

  const updateAvatar = () => {
  if (gameState?.avatar) {
    // Create a deep copy of the avatar to ensure reactivity
    avatar.value = {
    coordinate: { ...gameState.avatar.coordinate },
    velocity: { ...gameState.avatar.velocity },
    look: { ...gameState.avatar.look },
    lookSpeed: gameState.avatar.lookSpeed,
    lookTarget: { ...gameState.avatar.lookTarget },
    maxSpeed: gameState.avatar.maxSpeed,
    accel: gameState.avatar.accel,
    resistance: gameState.avatar.resistance,
    wallResistance: gameState.avatar.wallResistance,
    movement: { ...gameState.avatar.movement },
    lastTriangle: gameState.avatar.lastTriangle,
    wallContact: gameState.avatar.wallContact,
    isOutsideNavmesh: gameState.avatar.isOutsideNavmesh,
    };
  }
  };

  onMounted(() => {
  // Update immediately
  updateAvatar();
  // Update at 60 FPS (16.67ms intervals)
  intervalId = window.setInterval(updateAvatar, 16);
  });

  onUnmounted(() => {
  if (intervalId !== null) {
    clearInterval(intervalId);
  }
  });

  return { avatar };
} 