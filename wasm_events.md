A system for exchanging complex information with wasm runtime.

A buffer of shared memory is pre-allocated.
When the update switches to and from wasm part, each side reads events, clears the buffer and populates it with its own events.
Clearing means setting the first dword to 0.

Example of events:
Unit collided with a wall
expand unit's corridor
Unid died
Defragmentation changed unit's index

Concrete example:
ts ai module want to set the WAgent's corridor, but corridot is located in wasm hype, unaccessible to ts.
ts simply writes into the buffer: 4, 7789, 5190, 5192
where
4 - is the type of the event. 4 corresponds to CmdAppendCorridor2Values, which has the size of 4 dwords. Depending on this type, the rest of the values are going to be interpreted.
7789 - is teh agent's index
5190, 5192 - are teh corridor values.

Another example:
wasm defragments agents, removing the dead ones from the middle of the array via swapping with the later ones
It writes 1, 3, 542, 134, 578, 135, 610, 190
where 1 is CmdIndexChange
3 is the number of moved agents. at this point the length of the event is known: 2 dwords + 3 * 2
542 - agent's old index
134 - agent's new index
...
