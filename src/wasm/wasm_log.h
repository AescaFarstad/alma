#pragma once

#include <string>
#include <sstream>
#include <iostream>
#include "point2.h"

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
