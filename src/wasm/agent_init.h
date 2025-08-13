#ifndef AGENT_INIT_H
#define AGENT_INIT_H

#include "data_structures.h"

void initialize_shared_buffer_layout(uint8_t* sharedBuffer, int maxAgents);
void initialize_agent_defaults(int agentIndex, float x, float y);

#endif // AGENT_INIT_H