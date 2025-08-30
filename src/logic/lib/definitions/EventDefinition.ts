import { GameState } from '../../GameState';

/**
 * Represents an effect that modifies the game state when an event triggers.
 * Specific effect types will implement this interface.
 */
export interface Effect {
  /** A key identifying the type of effect (e.g., 'giveResource', 'modifyStat', 'addFact'). */
  key: string;
  /** Additional parameters needed to apply the effect. */
  params: Record<string, any>;

  apply?(state: GameState): void;
}

/**
 * Represents the definition of a game event, typically loaded from the Lib.
 */
export interface EventDefinition {
  id: string;
  effects: Effect[];
  params?: Record<string, any>;
}

export type EventID = string; 