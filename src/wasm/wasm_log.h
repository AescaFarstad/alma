#pragma once

#include <string>
#include <sstream>
#include <iostream>
#include <iomanip>
#include "point2.h"
#include "data_structures.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

inline void wasm_console_error(const std::string& message) {
#ifdef __EMSCRIPTEN__
  EM_ASM({ console.error(UTF8ToString($0)); }, message.c_str());
#else
  std::cerr << message << std::endl;
#endif
}

inline void wasm_console_error(const std::string& message, int value) {
#ifdef __EMSCRIPTEN__
  EM_ASM({ console.error(UTF8ToString($0), $1); }, message.c_str(), value);
#else
  std::cerr << message << " " << value << std::endl;
#endif
}

inline void wasm_console_error(const std::string& message, float value) {
#ifdef __EMSCRIPTEN__
  EM_ASM({ console.error(UTF8ToString($0), $1); }, message.c_str(), (double)value);
#else
  std::cerr << message << " " << value << std::endl;
#endif
}

inline void wasm_console_error(const std::string& message, Point2 value) {
#ifdef __EMSCRIPTEN__
  EM_ASM({ console.error(UTF8ToString($0), $1, $2); }, message.c_str(), (double)value.x, (double)value.y);
#else
  std::cerr << message << " (" << value.x << ", " << value.y << ")" << std::endl;
#endif
}

inline void wasm_console_warn(const std::string& message) {
#ifdef __EMSCRIPTEN__
  EM_ASM({ console.warn(UTF8ToString($0)); }, message.c_str());
#else
  std::cerr << message << std::endl;
#endif
}

inline void wasm_console_log(const std::string& message) {
#ifdef __EMSCRIPTEN__
  EM_ASM({ console.log(UTF8ToString($0)); }, message.c_str());
#else
  std::cout << message << std::endl;
#endif
}

// [MDB] Dump a single agent's full state for debugging
inline void wasm_log_agent_state(int idx) {
  if (idx < 0 || idx >= agent_data.capacity) {
    std::ostringstream _oss; _oss << "[MDB] Agent dump: invalid idx=" << idx
      << " capacity=" << agent_data.capacity;
    wasm_console_error(_oss.str());
    return;
  }

  std::ostringstream os; os.setf(std::ios::fixed); os << std::setprecision(3);
  const Point2& pos = agent_data.positions[idx];
  const Point2& last = agent_data.last_coordinates[idx];
  const Point2& vel = agent_data.velocities[idx];
  const Point2& look = agent_data.looks[idx];
  const uint8_t state = static_cast<uint8_t>(agent_data.states[idx]);
  const bool alive = agent_data.is_alive[idx];

  os << "[MDB] Agent dump idx=" << idx << "\n";
  // core
  os << "core.pos.x=" << pos.x << "\n";
  os << "core.pos.y=" << pos.y << "\n";
  os << "core.last.x=" << last.x << "\n";
  os << "core.last.y=" << last.y << "\n";
  os << "core.vel.x=" << vel.x << "\n";
  os << "core.vel.y=" << vel.y << "\n";
  os << "core.look.x=" << look.x << "\n";
  os << "core.look.y=" << look.y << "\n";
  // flags
  os << "flags.state=" << (int)state << "\n";
  os << "flags.alive=" << (alive ? 1 : 0) << "\n";
  // nav
  os << "nav.current_tri=" << agent_data.current_tris[idx] << "\n";
  os << "nav.next_corner.x=" << agent_data.next_corners[idx].x << "\n";
  os << "nav.next_corner.y=" << agent_data.next_corners[idx].y << "\n";
  os << "nav.next_corner_tri=" << agent_data.next_corner_tris[idx] << "\n";
  os << "nav.next_corner2.x=" << agent_data.next_corners2[idx].x << "\n";
  os << "nav.next_corner2.y=" << agent_data.next_corners2[idx].y << "\n";
  os << "nav.next_corner_tri2=" << agent_data.next_corner_tris2[idx] << "\n";
  os << "nav.num_valid_corners=" << (int)agent_data.num_valid_corners[idx] << "\n";
  os << "nav.pre_escape_corner.x=" << agent_data.pre_escape_corners[idx].x << "\n";
  os << "nav.pre_escape_corner.y=" << agent_data.pre_escape_corners[idx].y << "\n";
  os << "nav.pre_escape_corner_tri=" << agent_data.pre_escape_corner_tris[idx] << "\n";
  os << "nav.end_target.x=" << agent_data.end_targets[idx].x << "\n";
  os << "nav.end_target.y=" << agent_data.end_targets[idx].y << "\n";
  os << "nav.end_target_tri=" << agent_data.end_target_tris[idx] << "\n";
  os << "nav.last_valid_pos.x=" << agent_data.last_valid_positions[idx].x << "\n";
  os << "nav.last_valid_pos.y=" << agent_data.last_valid_positions[idx].y << "\n";
  os << "nav.last_valid_tri=" << agent_data.last_valid_tris[idx] << "\n";
  os << "nav.alien_poly=" << agent_data.alien_polys[idx] << "\n";
  os << "nav.last_visible_for_next_corner.x=" << agent_data.last_visible_points_for_next_corner[idx].x << "\n";
  os << "nav.last_visible_for_next_corner.y=" << agent_data.last_visible_points_for_next_corner[idx].y << "\n";
  // stats
  os << "stats.last_end_target.x=" << agent_data.last_end_targets[idx].x << "\n";
  os << "stats.last_end_target.y=" << agent_data.last_end_targets[idx].y << "\n";
  os << "stats.min_corridor_len=" << agent_data.min_corridor_lengths[idx] << "\n";
  os << "stats.last_dst_to_next_corner=" << agent_data.last_distances_to_next_corner[idx] << "\n";
  os << "stats.sight_rating=" << agent_data.sight_ratings[idx] << "\n";
  os << "stats.last_next_corner_tri=" << agent_data.last_next_corner_tris[idx] << "\n";
  os << "stats.stuck_rating=" << agent_data.stuck_ratings[idx] << "\n";
  os << "stats.path_frustration=" << agent_data.path_frustrations[idx] << "\n";
  // params
  os << "params.max_speed=" << agent_data.max_speeds[idx] << "\n";
  os << "params.accel=" << agent_data.accels[idx] << "\n";
  os << "params.resistance=" << agent_data.resistances[idx] << "\n";
  os << "params.intelligence=" << agent_data.intelligences[idx] << "\n";
  os << "params.look_speed=" << agent_data.look_speeds[idx] << "\n";
  os << "params.max_frustration=" << agent_data.max_frustrations[idx] << "\n";
  os << "params.arrival_desired_speed=" << agent_data.arrival_desired_speeds[idx] << "\n";
  os << "params.arrival_threshold_sq=" << agent_data.arrival_threshold_sqs[idx] << "\n";
  os << "params.predicament_rating=" << agent_data.predicament_ratings[idx] << "\n";
  os << "params.frame_id=" << agent_data.frame_ids[idx] << "\n";
  // corridor
  size_t corr_len = agent_data.corridors ? agent_data.corridors[idx].size() : 0;
  os << "corridor.length=" << corr_len << "\n";
  if (corr_len > 0) {
    const auto &corr = agent_data.corridors[idx];
    const int n = static_cast<int>(corr_len);
    for (int i = std::max(0, n - 8); i < n; ++i) {
      os << "corridor.tail[" << i << "]=" << corr[i] << "\n";
    }
  }
  wasm_console_log(os.str());
}
