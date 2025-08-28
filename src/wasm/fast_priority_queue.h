#ifndef FAST_PRIORITY_QUEUE_H
#define FAST_PRIORITY_QUEUE_H

#include <vector>
#include <cstddef>

// A minimal binary min-heap optimized for (int item, float priority)
class FastPriorityQueue {
public:
    FastPriorityQueue();
    explicit FastPriorityQueue(size_t reserveCapacity);

    bool empty() const;
    void reserve(size_t capacity);
    void clear();

    void put(int item, float priority);
    int get(); // pops and returns the item with the smallest priority
    void updatePriority(int item, float newPriority); // updates priority of existing item

private:
    struct Entry {
        int item;
        float priority;
    };

    std::vector<Entry> heap_; // 0-based binary heap storing min at index 0

    static inline bool less(const Entry& a, const Entry& b) { return a.priority < b.priority; }
    void siftUp(size_t idx);
    void siftDown(size_t idx);
};

#endif // FAST_PRIORITY_QUEUE_H 