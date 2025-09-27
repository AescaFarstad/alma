#ifndef AGENT_MODS_H
#define AGENT_MODS_H

#include <cstdint>
#include <vector>
#include <array>

constexpr int MODS_MAX_SLOTS_PER_AGENT = 4;

enum ModProperty : int8_t {
  ModProp_Accel = 1,
};

enum ModOp : int8_t {
  ModOp_Multiply = 0,
  ModOp_Add = 1,
};

struct ModEntry {
  float originalValue = 0.0f;
  float mod = 0.0f;
  float endTime = 0.0f;  // 0 means unused slot
  float fadeAt = 0.0f;
  int8_t type = 0;
  int8_t op = 0;
};

struct Mod {
  uint32_t agentHandle = 0;
  float recalcAt = 0.0f;

  ModEntry slots[MODS_MAX_SLOTS_PER_AGENT] = {};
};

struct ModExtended {
  uint32_t agentHandle = 0;
  float recalcAt = 0.0f;

  std::vector<ModEntry> slots;
};

inline constexpr uint32_t MOD_IDX_PRESENT = 0x80000000u;
inline constexpr uint32_t MOD_IDX_EXT = 0x40000000u;
inline constexpr uint32_t MOD_IDX_BUCKET_SHIFT = 26u;
inline constexpr uint32_t MOD_IDX_BUCKET_MASK = 0x0f000000u; // 4 bits
inline constexpr uint32_t MOD_IDX_INDEX_MASK = 0x03ffffffu;  // 26 bits

void initialize_agent_mods(int maxAgents);
void update_agent_mods(float now);
void add_agent_mod(uint32_t agent_handle, int8_t property_id, int8_t op, float mod_value, float fade_at, float end_time, float now);
void run_try_insert_sorted_inplace_tests();

#endif // AGENT_MODS_H
