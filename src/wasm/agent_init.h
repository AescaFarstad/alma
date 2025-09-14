#ifndef AGENT_INIT_H
#define AGENT_INIT_H

#include "data_structures.h"

void initialize_shared_buffer_layout(uint8_t* sharedBuffer, int maxAgents);
// Initialize all agent data with zero/invalid defaults
void initialize_agent_defaults();

#endif // AGENT_INIT_H
