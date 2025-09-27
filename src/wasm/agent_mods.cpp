#include "agent_mods.h"
#include "data_structures.h"
#include "wasm_log.h"
#include <algorithm>
#include <limits>
#include <cmath>
#include <sstream>
#include <cstdio>

extern AgentSoA agent_data;

constexpr int MODS_SPLIT_BUCKETS = 8;

std::array<std::vector<Mod>, MODS_SPLIT_BUCKETS> g_mod_buckets;
std::vector<ModExtended> g_mod_ext;
std::vector<uint32_t> g_mod_by_agent;
int g_current_bucket = 0;
int g_schedule_frame = 0;

inline uint32_t pack_index(bool present, bool ext, uint32_t bucket, uint32_t index) {
  if (!present) return 0u;
  uint32_t v = MOD_IDX_PRESENT;
  if (ext) v |= MOD_IDX_EXT;
  v |= ((bucket & 0x0fu) << MOD_IDX_BUCKET_SHIFT);
  v |= (index & MOD_IDX_INDEX_MASK);
  return v;
}

inline bool idx_present(uint32_t v) { return (v & MOD_IDX_PRESENT) != 0; }
inline bool idx_ext(uint32_t v) { return (v & MOD_IDX_EXT) != 0; }
inline uint32_t idx_bucket(uint32_t v) { return (v & MOD_IDX_BUCKET_MASK) >> MOD_IDX_BUCKET_SHIFT; }
inline uint32_t idx_index(uint32_t v) { return (v & MOD_IDX_INDEX_MASK); }

inline int agent_index_from_handle(uint32_t handle) {
  return static_cast<int>(handle & INDEX_MASK);
}

inline uint16_t agent_gen_from_handle(uint32_t handle) {
  return static_cast<uint16_t>((handle >> INDEX_BITS) & GENERATION_MASK);
}

inline float& ref_property_value(int agent_idx, int8_t property_id) {
  switch (property_id) {
    case ModProp_Accel:
      return agent_data.accels[agent_idx];
    default:
      return agent_data.accels[agent_idx];
  }
}

inline void clamp_property_value(float& value, int8_t property_id) {
  switch (property_id) {
    case ModProp_Accel:
      if (value < 0.0f) value = 0.0f;
      break;
    default:
      break;
  }
}

float find_base_value_for_property_ext(int8_t property_id, int agent_idx, const ModExtended& mod) {
  for (size_t i = 0; i < mod.slots.size(); ++i) {
    const auto& e = mod.slots[i];
    if (e.endTime != 0.0f && e.type == property_id) {
      return e.originalValue;
    }
  }
  return ref_property_value(agent_idx, property_id);
}

inline size_t mod_count(const Mod& m) { return MODS_MAX_SLOTS_PER_AGENT; }
inline size_t mod_count(const ModExtended& m) { return m.slots.size(); }

template <typename ModT>
void recompute_for_agent(ModT& m, float now) {
  const size_t n = mod_count(m);

  // Single-pass: iterate once, aggregating contiguous groups by property id,
  // skipping unused slots and clearing expired ones.
  const int idx = agent_index_from_handle(m.agentHandle);

  m.recalcAt = std::numeric_limits<float>::max();

  bool have_prop = false;
  int8_t cur_prop = -1;
  float base = 0.0f;
  float mult = 1.0f;
  float add = 0.0f;

  auto finalize_group = [&]() {
    if (!have_prop) return;
    float new_val = base * mult + add;
    clamp_property_value(new_val, cur_prop);
    ref_property_value(idx, cur_prop) = new_val;
    have_prop = false;
    mult = 1.0f; add = 0.0f;
  };

  for (size_t i = 0; i < n; ++i) {
    auto& e = m.slots[i];
    if (e.endTime == 0.0f) continue; // unused slot

    const int8_t prop = e.type;
    if (prop != cur_prop) {
      if (cur_prop != -1) finalize_group();
      cur_prop = prop;
      base = e.originalValue;
      mult = 1.0f;
      add = 0.0f;
    }

    const float end_time = e.endTime;
    const float fade_time = e.fadeAt;

    if (now >= end_time) { e.endTime = 0.0f; continue; }

    m.recalcAt = std::min(m.recalcAt, fade_time);

    float weight = now >= fade_time ? (now - fade_time) / (end_time - fade_time) : 1.0f;

    if (e.op == ModOp_Multiply)
      mult *= 1.0f + (e.mod - 1.0f) * weight;
    else
      add += e.mod * weight;
  }

  if (cur_prop != -1) finalize_group();
}

// --- Insertion helpers (shared for Mod and ModExtended) ---

// Shift a contiguous block [start..end] (inclusive) by +1 (to the right)
template <typename M>
inline void shift_right_by_one(M& m, size_t start, size_t end) {
  // Shift inclusive range [start..end] one position to the right,
  // writing into positions [start+1..end+1].
  for (size_t i = end + 1; i > start; --i) {
    m.slots[i] = m.slots[i - 1];
  }
}

// Shift a contiguous block [start..end] (inclusive) by -1 (to the left)
template <typename M>
inline void shift_left_by_one(M& m, size_t start, size_t end) {
  for (size_t i = start; i < end; ++i) {
    m.slots[i] = m.slots[i + 1];
  }
}

// A simpler, two-pass in-place insertion strategy.
// Pass 1: clear expired to empty and restore base for other properties; capture base for target property.
// Pass 2: scan to locate boundary and nearest hole; shift minimal range and insert.
template <typename M>
bool try_insert_sorted_inplace(
    M& m,
    int agent_idx,
    int8_t property_id,
    int8_t op,
    float mod_value,
    float fade_at,
    float end_time,
    float now,
    bool /*prefer_right_on_tie*/
) {
  const int N = static_cast<int>(mod_count(m));
  if (N == 0) return false;

  // --- Pass 1: clear expired and collect base ---
  bool have_base = false;
  float base_value = 0.0f;

  for (int i = 0; i < N; ++i) {
    auto& e = m.slots[i];

    // Collect base from any live slot of the same property
    if (e.endTime != 0.0f && e.endTime > now && e.type == property_id && !have_base) {
      have_base = true;
      base_value = e.originalValue;
    }

    // Convert expired -> empty and restore base for other properties
    if (e.endTime != 0.0f && e.endTime <= now) { // expired
      if (e.type != property_id) {
        float& agv = ref_property_value(agent_idx, e.type);
        agv = e.originalValue;
        clamp_property_value(agv, e.type);
      } else if (!have_base) {
        have_base = true;
        base_value = e.originalValue;
      }
      e.endTime = 0.0f; // make it an empty slot
    }
  }

  if (!have_base) {
    base_value = ref_property_value(agent_idx, property_id);
    have_base = true;
  }

  // --- Pass 2: locate boundary and hole, shift minimally, and insert ---
  int insert_here = -1;    // last seen index of target property, or first index of > property
  int empty_slot = -1;     // remembered empty slot index (before or after boundary)
  int last_non_empty = -1; // last non-empty seen (for append handling)
  bool seen_equals = false;
  bool seen_greater = false;

  for (int i = 0; i < N; ++i) {
    auto& e = m.slots[i];
    const bool is_empty = (e.endTime == 0.0f);

    if (!is_empty) last_non_empty = i;

    if (!is_empty) {
      const int8_t t = e.type;
      if (t < property_id) {
        // keep scanning
      } else { // t >= property_id
        if (empty_slot != -1) {
          // Bring the hole just before current index by shifting left
          const int start = empty_slot;
          const int end = i - 1;
          if (start <= end) shift_left_by_one(m, static_cast<size_t>(start), static_cast<size_t>(end));
          const int pos = std::max(0, i - 1);

          auto& ne = m.slots[pos];
          ne.mod = mod_value;
          ne.endTime = end_time;
          ne.fadeAt = fade_at;
          ne.type = property_id;
          ne.op = op;
          ne.originalValue = base_value;
          return true;
        } else {
          if (t == property_id) insert_here = i; else if (insert_here == -1) insert_here = i;
        }
        if (t == property_id) seen_equals = true; else if (t > property_id) seen_greater = true;
      }
    } else { // empty
      if (seen_equals && !seen_greater) {
        // We're inside the equals group: insert directly here
        auto& ne = m.slots[i];
        ne.mod = mod_value;
        ne.endTime = end_time;
        ne.fadeAt = fade_at;
        ne.type = property_id;
        ne.op = op;
        ne.originalValue = base_value;
        return true;
      }

      if (insert_here == -1) {
        empty_slot = i; // remember; might be used later
      } else {
        // We already know where to insert; shift right to bring hole at insert_here
        const int start = insert_here;
        const int end = i - 1;
        if (start <= end) shift_right_by_one(m, static_cast<size_t>(start), static_cast<size_t>(end));
        auto& ne = m.slots[insert_here];
        ne.mod = mod_value;
        ne.endTime = end_time;
        ne.fadeAt = fade_at;
        ne.type = property_id;
        ne.op = op;
        ne.originalValue = base_value;
        return true;
      }
    }
  }

  // If we got here, no direct boundary-based insertion happened.
  // Handle append-after-<property_id case using any remembered empty slot.
  if (insert_here == -1) {
    if (empty_slot == -1) return false; // no space at all

    if (last_non_empty >= 0 && empty_slot <= last_non_empty) {
      // Move the hole to the end of non-empty region
      shift_left_by_one(m, static_cast<size_t>(empty_slot), static_cast<size_t>(last_non_empty));
      empty_slot = last_non_empty; // hole moved here
    } else if (last_non_empty >= 0) {
      // Prefer the slot right after the last non-empty if it's empty (it must be)
      empty_slot = std::max(empty_slot, last_non_empty + 1);
    } else {
      // All slots were empty; use the first remembered hole
    }

    auto& ne = m.slots[empty_slot];
    ne.mod = mod_value;
    ne.endTime = end_time;
    ne.fadeAt = fade_at;
    ne.type = property_id;
    ne.op = op;
    ne.originalValue = base_value;
    return true;
  }

  return false; // No empty slot path available
}

template <typename Container, typename ModT>
void process_mods_container(Container& cont, uint32_t bucket_id, bool is_ext, float now) {
  for (size_t i = 0; i < cont.size(); ++i) {
    ModT& m = cont[i];
    const int agent_idx = agent_index_from_handle(m.agentHandle);
    const uint16_t gen = agent_gen_from_handle(m.agentHandle);

    if (agent_data.generation[agent_idx] != gen) {
      const size_t last = cont.size() - 1;
      if (i != last) {
        cont[i] = std::move(cont[last]);
        const int swapped_idx = agent_index_from_handle(cont[i].agentHandle);
        g_mod_by_agent[swapped_idx] = pack_index(true, is_ext, bucket_id, static_cast<uint32_t>(i));
      }
      cont.pop_back();
      i--;
      g_mod_by_agent[agent_idx] = 0u;
      continue;
    }

    if (now > m.recalcAt) {
      recompute_for_agent(m, now);
    }
  }
}

void copy_mod_to_extended(const Mod& src, ModExtended& dst) {
  for (int i = 0; i < MODS_MAX_SLOTS_PER_AGENT; ++i) {
    const auto& e = src.slots[i];
    if (e.endTime == 0.0f) continue;
    dst.slots.push_back(e);
  }
}

void initialize_agent_mods(int maxAgents) {
  for (auto& v : g_mod_buckets) {
    v.clear();
    v.reserve(std::max(1, maxAgents / MODS_SPLIT_BUCKETS + 1));
  }
  g_mod_ext.clear();
  g_mod_ext.reserve(std::max(1, maxAgents / 128));
  g_mod_by_agent.assign(maxAgents, 0u);
  g_current_bucket = 0;
  g_schedule_frame = 0;
  // run_try_insert_sorted_inplace_tests();
}

void update_agent_mods(float now) {
  if (g_schedule_frame < MODS_SPLIT_BUCKETS) {
    const uint32_t bucket_id_sched = static_cast<uint32_t>(g_schedule_frame);
    auto& bucket = g_mod_buckets[bucket_id_sched];
    process_mods_container<decltype(bucket), Mod>(bucket, bucket_id_sched, false, now);
    g_schedule_frame = g_schedule_frame + 1;
  } else {
    process_mods_container<decltype(g_mod_ext), ModExtended>(g_mod_ext, 0u, true, now);
    g_schedule_frame = 0;
  }
}

void add_agent_mod(uint32_t agent_handle, int8_t property_id, int8_t op, float mod_value, float fade_at, float end_time, float now) {
  const int agent_idx = agent_index_from_handle(agent_handle);
  const uint16_t handle_gen = agent_gen_from_handle(agent_handle);
  if (agent_data.generation[agent_idx] != handle_gen) return;

  // Skip immediately expired mods
  if (end_time <= now) return;

  if (fade_at <= 0.0f) fade_at = end_time;

  // Determine if agent already has a Mod entry
  uint32_t packed = g_mod_by_agent[agent_idx];
  if (!idx_present(packed)) {
    // Choose the least-populated bucket
    uint32_t best_bucket = 0u;
    size_t best_size = g_mod_buckets[0].size();
    for (uint32_t b = 1; b < MODS_SPLIT_BUCKETS; ++b) {
      if (g_mod_buckets[b].size() < best_size) { best_size = g_mod_buckets[b].size(); best_bucket = b; }
    }
    Mod m{};
    m.agentHandle = agent_handle;
    m.recalcAt = 0.0f;
    const size_t idx_in_bucket = g_mod_buckets[best_bucket].size();
    g_mod_buckets[best_bucket].push_back(m);
    g_mod_by_agent[agent_idx] = pack_index(true, false, best_bucket, static_cast<uint32_t>(idx_in_bucket));
    packed = g_mod_by_agent[agent_idx];
  }

  const bool is_ext = idx_ext(packed);
  if (!is_ext) {
    const uint32_t bucket_id = idx_bucket(packed);
    const uint32_t index = idx_index(packed);
    Mod& m = g_mod_buckets[bucket_id][index];
    // Try fast in-place insertion
    bool inserted = try_insert_sorted_inplace(m, agent_idx, property_id, op, mod_value, fade_at, end_time, now, /*prefer_right_on_tie*/true);
    if (inserted) {
      recompute_for_agent(m, now);
      return;
    }

    // Spill to extended
    ModExtended ext{};
    ext.agentHandle = m.agentHandle;
    ext.recalcAt = m.recalcAt;
    copy_mod_to_extended(m, ext);

    // Insert into extended in-place if possible; else use vector insert (prefer later)
    bool ext_inserted = try_insert_sorted_inplace(ext, agent_idx, property_id, op, mod_value, fade_at, end_time, now, /*prefer_right_on_tie*/true);
    if (!ext_inserted) {
      float base_val = find_base_value_for_property_ext(property_id, agent_idx, ext);
      size_t pos = 0;
      while (pos < ext.slots.size() && ext.slots[pos].type <= property_id) ++pos; // after equals
      ModEntry ne;
      ne.originalValue = base_val;
      ne.mod = mod_value;
      ne.endTime = end_time;
      ne.fadeAt = fade_at;
      ne.type = property_id;
      ne.op = op;
      ext.slots.insert(ext.slots.begin() + pos, ne);
    }

    const size_t new_index = g_mod_ext.size();
    g_mod_ext.push_back(std::move(ext));

    // Remove from small bucket by swapping
    auto& bucket = g_mod_buckets[bucket_id];
    const size_t last = bucket.size() - 1;
    if (index != last) {
      Mod& swapped = bucket[last];
      bucket[index] = swapped;
      const int swapped_idx = agent_index_from_handle(swapped.agentHandle);
      g_mod_by_agent[swapped_idx] = pack_index(true, false, bucket_id, static_cast<uint32_t>(index));
    }
    bucket.pop_back();

    g_mod_by_agent[agent_idx] = pack_index(true, true, 0u, static_cast<uint32_t>(new_index));

    ModExtended& ext_ref = g_mod_ext[g_mod_ext.size() - 1];
    recompute_for_agent(ext_ref, now);
    return;
  } else {
    const uint32_t index = idx_index(packed);
    if (index >= g_mod_ext.size()) return;
    ModExtended& m = g_mod_ext[index];

    bool inserted = try_insert_sorted_inplace(m, agent_idx, property_id, op, mod_value, fade_at, end_time, now, /*prefer_right_on_tie*/true);
    if (!inserted) {
      // Fallback to vector insert; prefer after equals to move fewer elements
      float base_val = find_base_value_for_property_ext(property_id, agent_idx, m);
      size_t pos = 0;
      while (pos < m.slots.size() && m.slots[pos].type <= property_id) ++pos;
      ModEntry ne;
      ne.originalValue = base_val;
      ne.mod = mod_value;
      ne.endTime = end_time;
      ne.fadeAt = fade_at;
      ne.type = property_id;
      ne.op = op;
      m.slots.insert(m.slots.begin() + pos, ne);
    }

    recompute_for_agent(m, now);
  }
}

// Inline tests for try_insert_sorted_inplace live in a separate include
#include "agent_mods_test.cpp.inl"
