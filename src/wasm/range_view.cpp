#include "range_view.h"
#include <cstdlib>

void RangeView::cleanup() {
  if (owner && ptr) {
    delete[] ptr;
    ptr = nullptr;
    count = 0;
    owner = false;
  }
}

RangeView::~RangeView() {
  cleanup();
}

