#ifndef RANGE_VIEW_H
#define RANGE_VIEW_H

#include <cstdint>
#include <cstddef>

class RangeView {
public:
  int32_t* ptr;
  uint32_t count;
  bool owner;

  RangeView() : ptr(nullptr), count(0), owner(false) {}
  RangeView(int32_t* p, uint32_t c, bool o) : ptr(p), count(c), owner(o) {}

  // Delete copy to avoid double-free; allow move
  RangeView(const RangeView&) = delete;
  RangeView& operator=(const RangeView&) = delete;

  RangeView(RangeView&& other) noexcept : ptr(other.ptr), count(other.count), owner(other.owner) {
    other.ptr = nullptr;
    other.count = 0;
    other.owner = false;
  }

  RangeView& operator=(RangeView&& other) noexcept {
    if (this != &other) {
      cleanup();
      ptr = other.ptr;
      count = other.count;
      owner = other.owner;
      other.ptr = nullptr;
      other.count = 0;
      other.owner = false;
    }
    return *this;
  }

  ~RangeView();

  const int32_t* begin() const { return ptr; }
  const int32_t* end() const { return ptr ? (ptr + count) : nullptr; }

  bool empty() const { return count == 0; }

private:
  void cleanup();
};

#endif // RANGE_VIEW_H

