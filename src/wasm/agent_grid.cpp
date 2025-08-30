#include "agent_grid.h"
#include "data_structures.h"
#include <cmath>
#include <vector>

const float CELL_SIZE = 256.0f;
const float WORLD_MIN_X = -10000.0f;
const float WORLD_MIN_Y = -10000.0f;
const float WORLD_MAX_X = 10000.0f;
const float WORLD_MAX_Y = 10000.0f;
const int GRID_WIDTH = static_cast<int>(ceil((WORLD_MAX_X - WORLD_MIN_X) / CELL_SIZE));
const int GRID_HEIGHT = static_cast<int>(ceil((WORLD_MAX_Y - WORLD_MIN_Y) / CELL_SIZE));
const int MAX_AGENTS_PER_CELL = 256;
const int TOTAL_CELLS = GRID_WIDTH * GRID_HEIGHT;

AgentGridData agent_grid;
Point2 halton_offset = {0.0f, 0.0f};
int frame_counter = 0;

extern AgentSoA agent_data;

// Halton sequence generator
float halton(int index, int base) {
  float result = 0.0f;
  float f = 1.0f / base;
  int i = index;
  while (i > 0) {
    result += f * (i % base);
    i = floor(i / base);
    f /= base;
  }
  return result;
}

void generate_halton_offset() {
  const float halfCell = CELL_SIZE * 0.5f;
  halton_offset.x = halton(frame_counter, 2) * CELL_SIZE - halfCell;
  halton_offset.y = halton(frame_counter, 3) * CELL_SIZE - halfCell;
}

void initialize_agent_grid(int max_agents) {
  agent_grid.cell_data.resize(TOTAL_CELLS * MAX_AGENTS_PER_CELL);
  agent_grid.cell_offsets.resize(TOTAL_CELLS);
  agent_grid.cell_counts.resize(TOTAL_CELLS);

  for (int i = 0; i < TOTAL_CELLS; i++) {
    agent_grid.cell_offsets[i] = i * MAX_AGENTS_PER_CELL;
  }
}

void clear_and_reindex_grid(int num_agents) {
  std::fill(agent_grid.cell_counts.begin(), agent_grid.cell_counts.end(), 0);

  generate_halton_offset();

  for (int i = 0; i < num_agents; i++) {
    if (!agent_data.is_alive[i]) continue;
    
    Point2 pos = agent_data.positions[i];
    int cell_index = get_cell_index(pos);

    if (cell_index >= 0 && cell_index < TOTAL_CELLS) {
      int count = agent_grid.cell_counts[cell_index];
      if (count < MAX_AGENTS_PER_CELL) {
        int offset = agent_grid.cell_offsets[cell_index] + count;
        agent_grid.cell_data[offset] = i;
        agent_grid.cell_counts[cell_index]++;
      }
    }
  }

  frame_counter++;
}

int get_cell_index(Point2 position) {
  float offset_x = position.x + halton_offset.x;
  float offset_y = position.y + halton_offset.y;

  int grid_x = static_cast<int>(floor((offset_x - WORLD_MIN_X) / CELL_SIZE));
  int grid_y = static_cast<int>(floor((offset_y - WORLD_MIN_Y) / CELL_SIZE));

  if (grid_x < 0 || grid_x >= GRID_WIDTH || grid_y < 0 || grid_y >= GRID_HEIGHT) {
    return -1;
  }

  return grid_y * GRID_WIDTH + grid_x;
} 