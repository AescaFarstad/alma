Overlay.vue is the central hub for all dev UI. Removing it from the parent will hide all dev UI.
The panels implement their logic inside themselves as much as they can, without bubbling it up.
It contains various panels which adjust their positions dynamically.
The panels are docked very close to the edges of the screen to save space.
The screen has 4 containers where this panels are positioned:
top left, expanding down based on content
bottom left, expanding up based on content
bottom right, expanding up based on content
top right, expanding down based on content

List of panels:
  top left:
    DevDrawingPanel
    DevActionPanel
    DevSelectedBuildings
    DevNavExplorer
    DevAgentExplorer

  bottom left:
    CoordsPanel

  bottom right:
    SelectedPointMarks

  top right:
    TimeControls
    FPS
    DevAgents

The context menu is also handled by Overlay.

The mentioned panels are what already exists in the code as a component or as a part of Overlay/App. Except for DevAgentExplorer, which is a new, planned thing that should simply be stubbed for now.
DevDrawingPanel contains buttons that draw stuff like navmesh, grid etc
DevActionPanel contains the rest of the buttons

The current compact design should be kept.
