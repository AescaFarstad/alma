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
    std::ostringstream _oss; _oss << "[MDB] Agent dump: invalid idx= " << idx
      << " capacity= " << agent_data.capacity;
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

  os << "[MDB] Agent dump idx= " << idx << "\n";
  // core
  os << "pos= " << pos.x << ", " << pos.y << "\n";
  os << "last= " << last.x << ", " << last.y << "\n";
  os << "vel= " << vel.x << ", " << vel.y << "\n";
  os << "look= " << look.x << ", " << look.y << "\n";
  // flags
  os << "state= " << (int)state << "\n";
  os << "alive= " << (alive ? 1 : 0) << "\n";
  // nav
  os << "current_tri= " << agent_data.current_tris[idx] << "\n";
  os << "next_corner= " << agent_data.next_corners[idx].x << ", " << agent_data.next_corners[idx].y << "\n";
  os << "next_corner_tri= " << agent_data.next_corner_tris[idx] << "\n";
  os << "next_corner2= " << agent_data.next_corners2[idx].x << ", " << agent_data.next_corners2[idx].y << "\n";
  os << "next_corner_tri2= " << agent_data.next_corner_tris2[idx] << "\n";
  os << "num_valid_corners= " << (int)agent_data.num_valid_corners[idx] << "\n";
  os << "pre_escape_corner= " << agent_data.pre_escape_corners[idx].x << ", " << agent_data.pre_escape_corners[idx].y << "\n";
  os << "pre_escape_corner_tri= " << agent_data.pre_escape_corner_tris[idx] << "\n";
  os << "end_target= " << agent_data.end_targets[idx].x << ", " << agent_data.end_targets[idx].y << "\n";
  os << "end_target_tri= " << agent_data.end_target_tris[idx] << "\n";
  os << "last_valid_pos= " << agent_data.last_valid_positions[idx].x << ", " << agent_data.last_valid_positions[idx].y << "\n";
  os << "last_valid_tri= " << agent_data.last_valid_tris[idx] << "\n";
  os << "alien_poly= " << agent_data.alien_polys[idx] << "\n";
  os << "last_visible_for_next_corner= " << agent_data.last_visible_points_for_next_corner[idx].x << ", " << agent_data.last_visible_points_for_next_corner[idx].y << "\n";
  // stats
  os << "last_end_target= " << agent_data.last_end_targets[idx].x << ", " << agent_data.last_end_targets[idx].y << "\n";
  os << "min_corridor_len= " << agent_data.min_corridor_lengths[idx] << "\n";
  os << "last_dst_to_next_corner= " << agent_data.last_distances_to_next_corner[idx] << "\n";
  os << "sight_rating= " << agent_data.sight_ratings[idx] << "\n";
  os << "last_next_corner_tri= " << agent_data.last_next_corner_tris[idx] << "\n";
  os << "stuck_rating= " << agent_data.stuck_ratings[idx] << "\n";
  os << "path_frustration= " << agent_data.path_frustrations[idx] << "\n";
  // params
  os << "max_speed= " << agent_data.max_speeds[idx] << "\n";
  os << "accel= " << agent_data.accels[idx] << "\n";
  os << "resistance= " << agent_data.resistances[idx] << "\n";
  os << "intelligence= " << agent_data.intelligences[idx] << "\n";
  os << "look_speed= " << agent_data.look_speeds[idx] << "\n";
  os << "max_frustration= " << agent_data.max_frustrations[idx] << "\n";
  os << "arrival_desired_speed= " << agent_data.arrival_desired_speeds[idx] << "\n";
  os << "arrival_threshold_sq= " << agent_data.arrival_threshold_sqs[idx] << "\n";
  os << "predicament_rating= " << agent_data.predicament_ratings[idx] << "\n";
  os << "frame_id= " << agent_data.frame_ids[idx] << "\n";
  os << "generation= " << (agent_data.generation ? agent_data.generation[idx] : 0) << "\n";
  // corridor
  size_t corr_len = agent_data.corridors ? agent_data.corridors[idx].size() : 0;
  if (corr_len > 0) {
    const auto &corr = agent_data.corridors[idx];
    os << "corridor=[";
    for (size_t i = 0; i < corr_len; ++i) {
      if (i > 0) os << ", ";
      os << corr[i];
    }
    os << "]\n";
  } else {
    os << "corridor=[]\n";
  }
  wasm_console_log(os.str());
}
