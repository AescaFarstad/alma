#include "fast_priority_queue.h"
#include <utility>

FastPriorityQueue::FastPriorityQueue() : heap_() {}

FastPriorityQueue::FastPriorityQueue(size_t reserveCapacity) : heap_() {
    heap_.reserve(reserveCapacity);
}

bool FastPriorityQueue::empty() const {
    return heap_.empty();
}

void FastPriorityQueue::reserve(size_t capacity) {
    heap_.reserve(capacity);
}

void FastPriorityQueue::clear() {
    heap_.clear();
}

void FastPriorityQueue::put(int item, float priority) {
    heap_.push_back(Entry{item, priority});
    siftUp(heap_.size() - 1);
}

int FastPriorityQueue::get() {
    const int result = heap_.front().item;
    heap_.front() = heap_.back();
    heap_.pop_back();
    if (!heap_.empty()) {
        siftDown(0);
    }
    return result;
}

void FastPriorityQueue::updatePriority(int item, float newPriority) {
    for (size_t i = 0; i < heap_.size(); ++i) {
        if (heap_[i].item == item) {
            float oldPriority = heap_[i].priority;
            heap_[i].priority = newPriority;
            
            // Restore heap property
            if (newPriority < oldPriority) {
                siftUp(i);
            } else if (newPriority > oldPriority) {
                siftDown(i);
            }
            return;
        }
    }
    put(item, newPriority);
}

void FastPriorityQueue::siftUp(size_t idx) {
    while (idx > 0) {
        size_t parent = (idx - 1) >> 1;
        if (!less(heap_[idx], heap_[parent])) break;
        std::swap(heap_[idx], heap_[parent]);
        idx = parent;
    }
}

void FastPriorityQueue::siftDown(size_t idx) {
    const size_t n = heap_.size();
    while (true) {
        size_t left = (idx << 1) + 1;
        if (left >= n) break;
        size_t right = left + 1;
        size_t smallest = left;
        if (right < n && less(heap_[right], heap_[left])) smallest = right;
        if (!less(heap_[smallest], heap_[idx])) break;
        std::swap(heap_[idx], heap_[smallest]);
        idx = smallest;
    }
} 