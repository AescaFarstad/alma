import { reactive } from "vue";
import { Avatar, LaserBlast } from "../GameState";
import { Agent } from "../agents/Agent";

// This is a POD class. No functions allowed.
export class DynamicScene {
    public laserBlasts: LaserBlast[] = [];
    public avatar: Avatar | null = null;
    public agents: Agent[] = [];

    public clear() {
        this.laserBlasts = [];
        this.avatar = null;
        this.agents = [];
    }
}

export const dynamicScene = reactive(new DynamicScene()); 