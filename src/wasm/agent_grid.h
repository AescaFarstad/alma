#ifndef AGENT_GRID_H
#define AGENT_GRID_H

#include "data_structures.h"

void initialize_agent_grid(int max_agents);
void clear_and_reindex_grid(int num_agents);
int get_cell_index(Point2 position);

extern AgentGridData agent_grid;

#endif // AGENT_GRID_H 