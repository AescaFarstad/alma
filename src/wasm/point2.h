#ifndef POINT2_H
#define POINT2_H

#include <cstdint>
#include <cmath>

struct Point2 {
  float x, y;
  Point2() : x(0.0f), y(0.0f) {}
  Point2(float x, float y) : x(x), y(y) {}
  Point2(const float* arr) : x(arr[0]), y(arr[1]) {}

  Point2 operator+(const Point2& other) const {
    return Point2(x + other.x, y + other.y);
  }

  Point2 operator-(const Point2& other) const {
    return Point2(x - other.x, y - other.y);
  }

  Point2 operator*(float scalar) const {
    return Point2(x * scalar, y * scalar);
  }

  Point2 operator/(float scalar) const {
    return Point2(x / scalar, y / scalar);
  }

  Point2& operator+=(const Point2& other) {
    x += other.x;
    y += other.y;
    return *this;
  }

  Point2& operator-=(const Point2& other) {
    x -= other.x;
    y -= other.y;
    return *this;
  }

  Point2& operator*=(float scalar) {
    x *= scalar;
    y *= scalar;
    return *this;
  }

  Point2& operator/=(float scalar) {
    x /= scalar;
    y /= scalar;
    return *this;
  }
};

#endif // POINT2_H 