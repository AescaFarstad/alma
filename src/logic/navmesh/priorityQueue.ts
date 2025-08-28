// Binary heap-based priority queue with typed arrays for better performance
export class PriorityQueue {
    public elements: Int32Array;
    public priorities: Float32Array;
    private size = 0;
    private capacity: number;
    
    constructor(initialCapacity = 1024) {
        this.capacity = initialCapacity;
        this.elements = new Int32Array(initialCapacity);
        this.priorities = new Float32Array(initialCapacity);
    }
    
    private resize(): void {
        const newCapacity = this.capacity * 2;
        const newElements = new Int32Array(newCapacity);
        const newPriorities = new Float32Array(newCapacity);
        
        newElements.set(this.elements);
        newPriorities.set(this.priorities);
        
        this.elements = newElements;
        this.priorities = newPriorities;
        this.capacity = newCapacity;
    }
    
    enqueue(element: number, priority: number): void {
        if (this.size >= this.capacity) {
            this.resize();
        }
        
        this.elements[this.size] = element;
        this.priorities[this.size] = priority;
        this.heapifyUp(this.size);
        this.size++;
    }
    
    dequeue(): number {
        if (this.size === 0) return -1;
        
        const result = this.elements[0];
        
        this.size--;
        if (this.size > 0) {
            this.elements[0] = this.elements[this.size];
            this.priorities[0] = this.priorities[this.size];
            this.heapifyDown(0);
        }
        
        return result;
    }
    
    isEmpty(): boolean {
        return this.size === 0;
    }

    getSize(): number {
        return this.size;
    }
    
    clear(): void {
        this.size = 0;
    }
    
    updatePriority(element: number, newPriority: number): void {
        let index = -1;
        for (let i = 0; i < this.size; i++) {
            if (this.elements[i] === element) {
                index = i;
                break;
            }
        }
        if (index !== -1) {
            this.priorities[index] = newPriority;
            this.heapifyUp(index);
        }
        else {
            this.enqueue(element, newPriority);
        }
    }
    
    private heapifyUp(index: number): void {
        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);
            if (this.priorities[index] >= this.priorities[parentIndex]) {
                break;
            }
            this.swap(index, parentIndex);
            index = parentIndex;
        }
    }
    
    private heapifyDown(index: number): void {
        while (true) {
            const leftChild = 2 * index + 1;
            const rightChild = 2 * index + 2;
            let smallest = index;
            
            if (leftChild < this.size && this.priorities[leftChild] < this.priorities[smallest]) {
                smallest = leftChild;
            }
            
            if (rightChild < this.size && this.priorities[rightChild] < this.priorities[smallest]) {
                smallest = rightChild;
            }
            
            if (smallest === index) {
                break;
            }
            
            this.swap(index, smallest);
            index = smallest;
        }
    }
    
    private swap(i: number, j: number): void {
        // Swap elements
        const tempElement = this.elements[i];
        this.elements[i] = this.elements[j];
        this.elements[j] = tempElement;
        
        // Swap priorities
        const tempPriority = this.priorities[i];
        this.priorities[i] = this.priorities[j];
        this.priorities[j] = tempPriority;
    }
}