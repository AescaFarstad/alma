import { reactive } from "vue";
import { Avatar, LaserBlast } from "../GameState";
import { Agent } from "../agents/Agent";

// This is a POD class. No functions allowed.
export class DynamicScene {
  public laserBlasts: LaserBlast[] = [];
  public avatar: Avatar | null = null;
  public agents: Agent[] = [];
  public selectedWAgentIdx: number | null = null;
  public selectedWAgentCorridor: number[] | null = null;

  public clear() {
    this.laserBlasts = [];
    this.avatar = null;
    this.agents = [];
    this.selectedWAgentIdx = null;
    this.selectedWAgentCorridor = null;
  }
}

export const dynamicScene = reactive(new DynamicScene()); 
