#ifndef MODEL_H
#define MODEL_H

#include <cstdint>

class Model {
public:
    uint64_t rng_seed = 12345;
    float sim_time = 0.0f;

    void update_simulation(float dt, int active_agents);
};

#endif // MODEL_H 