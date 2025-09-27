This is a design for handling temporary agent parameter modifications.

Each agent has standard parameters: `src/logic/agents/Agents.ts`
Some of them may be temporarily changed: acceleration may be decreased because of an injury or increase because of an adrenalin boost.

The goal is to create a system which will handle this and be as performant as possible, utilize cache locality etc.
It should also be numerically robust - meaning when the temporary changes expire, the properties must return to their exact original value.
We assume that nobody else is going to be changing that value except for the mods system.
I'm going to have MAX_AGENTS_COUNT = 48k agents.
This will be implemented in C++.
TS code will be adding modifiers via the event bus: `src/wasm/event_handler.cpp` `src/logic/agents/EventHandler.ts`

There is going to be a pool of modifier objects:
int MAX_NUM_MODIFIERS = 5
// Implementation detail: the C++ side uses AoS for per-slot data.
struct ModEntry{
  originalValue : float
  mod : float
  endTime : float // 0 means empty
  fadeAt : float
  type : int8
  op : int8
}
struct Mod{
  agentHandle : int32
  recalcAt : float //shortcut to skip if the next change is not soon
  slots[MAX_NUM_MODIFIERS] : ModEntry
}
One Mod contains all effects for a single agent.
endTime == 0 means the slot is empty
recalcAt is always storing the minimum of active endTimes, fadeAt.
When a modifier is added, the agent's property value is recalculated immediately.
if fadeAt is unspecified, it equals endTimes
All multipliers are applied first, then additions.
Depending on the property, the final value may be clamped.

int SPLIT_MODIFIERS = 8
activeModifiers : fixed_array<vector<Mod>, SPLIT_MODIFIERS> //to update one per frame and spread the updates across SPLIT_MODIFIERS frames.
activeModifiers are reserved to MAX_AGENTS_COUNT / SPLIT_MODIFIERS + 1 at the initialization.
if we need to remove Mod from the middle, we simply swap the last one in its place and change length. 
when a new Mod needs to become active, it is chosen based on the size of activeModifiers vectors.
Since agents are stored in SoA, it doesn't make sense to group activeModifiers buckets by agents.

Each frame one of activeModifiers vectors is going to be processed.
If handle has outdated gen or time has passed, the original value is restored
if now < recalcAt we skip this Mod
otherwise for each property if some of it's fadeAt is < now, then a new value is calculated based on the original value, and it is written to the agent's property.
Delayed expiry is acceptable. Exactness is not paramount. Approximations are alright.

When an agent dies (gen no longer matches) all of its Mods are removed.

If a modifier is added but there is no space for it (there is MAX_NUM_MODIFIERS there already) Mod is replaced by ModExtended, which has larger arrays.
There is a separate activeModifiersExtended bucket for these.
If that happens (which may only happen during inserting a new modifier) the old Mod deleted.
Deletion is handled by swaping with the last item and decrimenting length. Vector capacity is preserved.
Function that recalculates values for agent is a template function which handles both Mod and ModExtended, taking MAX_NUM_MODIFIERS parameter.
It uses switch to apply changes to the agent.

There needs to be a quick way to identify if an agent already has modifier for a given property.
To do so there is going to be an index:
modByAgent fixed_array<uint32_t, MAX_AGENTS_COUNT>
uint32_t incorporates the bucket; if we're using activeModifiersExtended; and if the Mod object exists for this agent at all.
modByAgent is updated when a Mod is swapped because of another mod removal.
The expectation is that most of the agents aren't going to be affected by any mods most of the time.


I wonder if there are more optimisations possible. If there is a way to decrease the size of the structs and indexes, optimise iteration etc.

At first only accels property is moddable. It must stay >= 0.
