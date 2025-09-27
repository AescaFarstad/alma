// Minimal inline tests for try_insert_sorted_inplace
// They print to stdout; no asserts, compact and integer-only values.

#include <cstdio>
#include <initializer_list>
#include <vector>

static bool vec_eq_types(const ModExtended& m, const std::vector<int>& exp) {
  if (m.slots.size() != exp.size()) return false;
  for (size_t i = 0; i < exp.size(); ++i) if ((int)m.slots[i].type != exp[i]) return false;
  return true;
}

static bool vec_eq_ends(const ModExtended& m, const std::vector<int>& exp) {
  if (m.slots.size() != exp.size()) return false;
  for (size_t i = 0; i < exp.size(); ++i) if ((int)m.slots[i].endTime != exp[i]) return false;
  return true;
}


// Unified test case definition supporting both single-step and multi-step cases.
// Field order preserves aggregate init for existing single-step cases.
struct SimpleCase {
  // Initial state
  std::vector<int> types;
  std::vector<int> ends;
  int addType = 0;               // single step; ignored if addTypesSeq is non-empty
  const char* label = "";        // informational
  std::vector<int> exp_types;     // expected for single step
  std::vector<int> exp_ends;      // expected for single step

  // Optional extensions
  std::vector<int> origs;         // optional per-slot originalValue
  std::vector<int> addTypesSeq;   // multi-step sequence of property types to add
  std::vector<std::vector<int>> exp_types_seq; // expected after each step
  std::vector<std::vector<int>> exp_ends_seq;  // expected after each step
  int accel = 7;                  // agent base accel
  bool alignAccelBases = true;    // align existing accel slots' originalValue to base accel
  bool printRet = false;          // print return value line for single-step cases
};

static void print_te_line(const char* tag, const ModExtended& m) {
  std::printf("%s ", tag);
  std::printf("[");
  for (size_t i = 0; i < m.slots.size(); ++i) {
    std::printf("%d%s", (int)m.slots[i].type, (i + 1 < m.slots.size() ? ", " : "] "));
  }
  std::printf("[");
  for (size_t i = 0; i < m.slots.size(); ++i) {
    std::printf("%d%s", (int)m.slots[i].endTime, (i + 1 < m.slots.size() ? ", " : "]\n"));
  }
}

static ModExtended make_from(std::initializer_list<int> types, std::initializer_list<int> ends, std::initializer_list<int> origs = {}) {
  ModExtended m{};
  const size_t n = types.size();
  m.slots.resize(n);
  size_t i = 0;
  auto itT = types.begin();
  auto itE = ends.begin();
  for (; i < n; ++i, ++itT, ++itE) {
    m.slots[i].type = static_cast<int8_t>(*itT);
    m.slots[i].endTime = static_cast<float>(*itE);
    m.slots[i].fadeAt = 9.0f; // integer fade for simplicity
    m.slots[i].op = ModOp_Add;
    m.slots[i].mod = 1.0f; // integer value
    m.slots[i].originalValue = 0.0f;
  }
  // Optional per-slot originalValue overrides
  if (origs.size() == n) {
    size_t j = 0;
    for (auto it = origs.begin(); it != origs.end(); ++it, ++j) {
      m.slots[j].originalValue = static_cast<float>(*it);
    }
  }
  return m;
}

static ModExtended make_from_vectors(const std::vector<int>& types, const std::vector<int>& ends, const std::vector<int>& origs = {}) {
  ModExtended m{};
  const size_t n = types.size();
  m.slots.resize(n);
  for (size_t i = 0; i < n; ++i) {
    m.slots[i].type = static_cast<int8_t>(types[i]);
    m.slots[i].endTime = static_cast<float>(i < ends.size() ? ends[i] : 0);
    m.slots[i].fadeAt = 9.0f;
    m.slots[i].op = ModOp_Add;
    m.slots[i].mod = 1.0f;
    m.slots[i].originalValue = 0.0f;
    if (!origs.empty() && i < origs.size()) m.slots[i].originalValue = static_cast<float>(origs[i]);
  }
  return m;
}

static void align_accel_originals(ModExtended& m, float accel_base) {
  for (size_t i = 0; i < m.slots.size(); ++i) {
    if (m.slots[i].type == ModProp_Accel && m.slots[i].endTime != 0) {
      m.slots[i].originalValue = accel_base;
    }
  }
}

static void run_simple_case(const SimpleCase& c, float now) {
  // Minimal agent_data setup
  static float s_accels[1] = {0.0f};
  static uint16_t s_generation[1] = {0};
  agent_data.accels = s_accels;
  agent_data.generation = s_generation;
  agent_data.capacity = 1;

  agent_data.accels[0] = static_cast<float>(c.accel);

  ModExtended m = make_from_vectors(c.types, c.ends, c.origs);
  if (c.alignAccelBases) align_accel_originals(m, agent_data.accels[0]);

  // Header
  if (!c.addTypesSeq.empty()) {
    std::printf("accel %d, sequence add types:", (int)agent_data.accels[0]);
    for (size_t i = 0; i < c.addTypesSeq.size(); ++i) {
      std::printf("%s %d", (i == 0 ? "" : ","), c.addTypesSeq[i]);
    }
    std::printf("\n");
  } else {
    std::printf("accel %d, adding type %d\n", (int)agent_data.accels[0], c.addType);
  }

  print_te_line("bef:", m);

  auto check_and_print = [&](int step_index) {
    bool ok = true;
    if (!c.addTypesSeq.empty()) {
      if (step_index < (int)c.exp_types_seq.size() && step_index < (int)c.exp_ends_seq.size()) {
        ok = vec_eq_types(m, c.exp_types_seq[step_index]) && vec_eq_ends(m, c.exp_ends_seq[step_index]);
      } else {
        ok = false; // expectations missing
      }
    } else {
      if (!c.exp_types.empty() && !c.exp_ends.empty()) {
        ok = vec_eq_types(m, c.exp_types) && vec_eq_ends(m, c.exp_ends);
      } else {
        ok = false;
      }
    }
    std::printf("%s\n", ok ? "✅ CORRECT" : "❌ ERROR");
  };

  if (!c.addTypesSeq.empty()) {
    // Sequence mode: run both original and simplified in lockstep on identical starting states
    ModExtended m_orig = m;
    ModExtended m_simp = m;
    float accel_base = agent_data.accels[0];
    for (size_t i = 0; i < c.addTypesSeq.size(); ++i) {
      // Original
      agent_data.accels[0] = accel_base; // ensure identical base between runs
      try_insert_sorted_inplace(m_orig, 0, static_cast<int8_t>(c.addTypesSeq[i]), ModOp_Add, 1.0f, 9.0f, 9.0f, now, true);
      print_te_line("aft:", m_orig);
      check_and_print((int)i);

      // Simplified
      agent_data.accels[0] = accel_base; // reset for second run
      try_insert_sorted_inplace(m_simp, 0, static_cast<int8_t>(c.addTypesSeq[i]), ModOp_Add, 1.0f, 9.0f, 9.0f, now, true);
      print_te_line("af2:", m_simp);

      // Compare original vs simplified
      bool sizes_eq = (m_orig.slots.size() == m_simp.slots.size());
      bool types_eq = sizes_eq;
      bool ends_eq = sizes_eq;
      if (sizes_eq) {
        for (size_t k = 0; k < m_orig.slots.size(); ++k) {
          if (m_orig.slots[k].type != m_simp.slots[k].type) { types_eq = false; break; }
        }
        for (size_t k = 0; k < m_orig.slots.size(); ++k) {
          if (m_orig.slots[k].endTime != m_simp.slots[k].endTime) { ends_eq = false; break; }
        }
      }
      std::printf("cmp: %s\n", (sizes_eq && types_eq && ends_eq) ? "✅ OK" : "❌ DIFF");
    }
  } else {
    // Single-step: run original and simplified on clones, compare, and print ret for original when requested
    ModExtended m_orig = m;
    ModExtended m_simp = m;
    float accel_base = agent_data.accels[0];

    bool ret = try_insert_sorted_inplace(m_orig, 0, static_cast<int8_t>(c.addType), ModOp_Add, 1.0f, 9.0f, 9.0f, now, true);
    print_te_line("aft:", m_orig);
    bool ok = false;
    if (!c.exp_types.empty() && !c.exp_ends.empty()) ok = vec_eq_types(m_orig, c.exp_types) && vec_eq_ends(m_orig, c.exp_ends);
    std::printf("%s\n", ok ? "✅ CORRECT" : "❌ ERROR");
    if (c.printRet) std::printf("ret: %s, accel %d\n", ret ? "true" : "false", (int)agent_data.accels[0]);

    // Reset agent base and run simplified
    agent_data.accels[0] = accel_base;
    bool ret2 = try_insert_sorted_inplace(m_simp, 0, static_cast<int8_t>(c.addType), ModOp_Add, 1.0f, 9.0f, 9.0f, now, true);
    (void)ret2;
    print_te_line("af2:", m_simp);

    bool sizes_eq = (m_orig.slots.size() == m_simp.slots.size());
    bool types_eq = sizes_eq;
    bool ends_eq = sizes_eq;
    if (sizes_eq) {
      for (size_t k = 0; k < m_orig.slots.size(); ++k) {
        if (m_orig.slots[k].type != m_simp.slots[k].type) { types_eq = false; break; }
      }
      for (size_t k = 0; k < m_orig.slots.size(); ++k) {
        if (m_orig.slots[k].endTime != m_simp.slots[k].endTime) { ends_eq = false; break; }
      }
    }
    std::printf("cmp: %s\n", (sizes_eq && types_eq && ends_eq) ? "✅ OK" : "❌ DIFF");
  }
}

// Call this function to run the tests.
void run_try_insert_sorted_inplace_tests() {
  // Prepare minimal agent_data for property access (agent idx 0 only)
  static float s_accels[1] = {0.0f};
  static uint16_t s_generation[1] = {0};
  agent_data.accels = s_accels;
  agent_data.generation = s_generation;
  agent_data.capacity = 1;

  const float now = 2.0f; // fixed per request

  // Build all tests via SimpleCase
  std::vector<SimpleCase> cases_all;

  // Test 1: Insert into empty slots
  cases_all.push_back(SimpleCase{
    /*types*/{0,0,0,0,0,0}, /*ends*/{0,0,0,0,0,0}, /*addType*/1, /*label*/"single_add_accel_empty",
    /*exp_types*/{1,0,0,0,0,0}, /*exp_ends*/{9,0,0,0,0,0},
    /*origs*/{}, /*addTypesSeq*/{}, /*exp_types_seq*/{}, /*exp_ends_seq*/{},
    /*accel*/7, /*alignAccelBases*/false, /*printRet*/true
  });

  // Test 2: Append after equals group; free at the end
  cases_all.push_back(SimpleCase{
    /*types*/{1,1,1,3,4,0}, /*ends*/{9,9,9,9,9,0}, /*addType*/4, /*label*/"single_add_type4_append",
    /*exp_types*/{1,1,1,3,4,4}, /*exp_ends*/{9,9,9,9,9,9},
    /*origs*/{}, /*addTypesSeq*/{}, /*exp_types_seq*/{}, /*exp_ends_seq*/{},
    /*accel*/7, /*alignAccelBases*/true, /*printRet*/true
  });

  // Test 3: Expired non-accel slot chosen as free restores accel base
  cases_all.push_back(SimpleCase{
    /*types*/{1,3,5,0,0,0}, /*ends*/{9,9,1,0,0,0}, /*addType*/4, /*label*/"single_add_type4_insert_right",
    /*exp_types*/{1,3,4,0,0,0}, /*exp_ends*/{9,9,9,0,0,0},
    /*origs*/{7,7,11,0,0,0}, /*addTypesSeq*/{}, /*exp_types_seq*/{}, /*exp_ends_seq*/{},
    /*accel*/7, /*alignAccelBases*/true, /*printRet*/true
  });

  // Test 4: One 'bef', multiple sequential inserts with several 'aft' lines
  cases_all.push_back(SimpleCase{
    /*types*/{1,1,1,2,2,3,0}, /*ends*/{1,0,9,9,9,9,0}, /*addType*/0, /*label*/"seq_1_2_2_2",
    /*exp_types*/{}, /*exp_ends*/{},
    /*origs*/{}, /*addTypesSeq*/{1,2,2,2},
    /*exp_types_seq*/{
      {1,1,1,2,2,3,0},
      {1,1,2,2,2,3,0},
      {1,1,2,2,2,2,3},
      {1,1,2,2,2,2,3},
    },
    /*exp_ends_seq*/{
      {9,0,9,9,9,9,0},
      {9,9,9,9,9,9,0},
      {9,9,9,9,9,9,9},
      {9,9,9,9,9,9,9},
    },
    /*accel*/7, /*alignAccelBases*/true, /*printRet*/false
  });

  // Test 5: Sequence on mixed types with expired and empty slots
  cases_all.push_back(SimpleCase{
    /*types*/{1,1,4,2,2,2,3,3,0,0}, /*ends*/{3,1,0,4,2,6,2,3,0,0}, /*addType*/0, /*label*/"seq_4_3_3_3",
    /*exp_types*/{}, /*exp_ends*/{},
    /*origs*/{}, /*addTypesSeq*/{4,3,3,3},
    /*exp_types_seq*/{
      {1,1,4,2,2,2,3,3,4,0},
      {1,1,4,2,2,2,3,3,4,0},
      {1,1,4,2,2,3,3,3,4,0},
      {1,1,2,2,3,3,3,3,4,0},
    },
    /*exp_ends_seq*/{
      {3,1,0,4,2,6,2,3,9,0},
      {3,1,0,4,2,6,9,3,9,0},
      {3,1,0,4,6,9,9,3,9,0},
      {3,1,4,6,9,9,9,3,9,0},
    },
    /*accel*/7, /*alignAccelBases*/true, /*printRet*/false
  });

  // Test 6: Fill up accel group repeatedly
  cases_all.push_back(SimpleCase{
    /*types*/{1,1,4,2,2,2,3,3,0,0}, /*ends*/{3,1,0,4,2,6,2,3,0,0}, /*addType*/0, /*label*/"seq_1_1_1_1",
    /*exp_types*/{}, /*exp_ends*/{},
    /*origs*/{}, /*addTypesSeq*/{1,1,1,1},
    /*exp_types_seq*/{
      {1,1,4,2,2,2,3,3,0,0},
      {1,1,1,2,2,2,3,3,0,0},
      {1,1,1,1,2,2,3,3,0,0},
      {1,1,1,1,1,2,2,3,0,0},
    },
    /*exp_ends_seq*/{
      {3,9,0,4,2,6,2,3,0,0},
      {3,9,9,4,2,6,2,3,0,0},
      {3,9,9,9,4,6,2,3,0,0},
      {3,9,9,9,9,4,6,3,0,0},
    },
    /*accel*/7, /*alignAccelBases*/true, /*printRet*/false
  });

  // Test 7: Fill type-2 group repeatedly
  cases_all.push_back(SimpleCase{
    /*types*/{1,1,4,2,2,2,3,3,0,0}, /*ends*/{3,1,0,4,2,6,2,3,0,0}, /*addType*/0, /*label*/"seq_2_2_2_2_2",
    /*exp_types*/{}, /*exp_ends*/{},
    /*origs*/{}, /*addTypesSeq*/{2,2,2,2,2},
    /*exp_types_seq*/{
      {1,1,4,2,2,2,3,3,0,0},
      {1,1,2,2,2,2,3,3,0,0},
      {1,2,2,2,2,2,3,3,0,0},
      {1,2,2,2,2,2,2,3,0,0},
      {1,2,2,2,2,2,2,2,3,0},
    },
    /*exp_ends_seq*/{
      {3,1,0,4,9,6,2,3,0,0},
      {3,1,9,4,9,6,2,3,0,0},
      {3,9,9,4,9,6,2,3,0,0},
      {3,9,9,4,9,6,9,3,0,0},
      {3,9,9,4,9,6,9,9,3,0},
    },
    /*accel*/7, /*alignAccelBases*/true, /*printRet*/false
  });

  // Run the refactored cases
  for (const auto& c : cases_all) run_simple_case(c, now);

  // Test 8: Wire in one-step cases from comment sections
  {
    std::vector<SimpleCase> cases;

    // add 1:
    cases.push_back({{1,1,1,0}, {3,4,5,0}, 1, "add 1", {1,1,1,1}, {3,4,5,9}});
    cases.push_back({{1,1,1,0}, {3,4,1,0}, 1, "add 1", {1,1,1,0}, {3,4,9,0}});
    cases.push_back({{1,1,1,4}, {3,4,5,0}, 1, "add 1", {1,1,1,1}, {3,4,5,9}});
    cases.push_back({{1,1,1,0}, {3,1,5,0}, 1, "add 1", {1,1,1,0}, {3,9,5,0}});
    cases.push_back({{4,1,1,0}, {0,1,5,0}, 1, "add 1", {4,1,1,0}, {0,9,5,0}});
    cases.push_back({{1,2,1,0}, {3,0,5,0}, 1, "add 1", {1,1,1,0}, {3,9,5,0}});
    cases.push_back({{2,2,2,0}, {3,0,5,0}, 1, "add 1", {1,2,2,0}, {9,3,5,0}});
    cases.push_back({{2,2,2,0}, {3,2,5,0}, 1, "add 1", {1,2,2,0}, {9,3,5,0}});
    cases.push_back({{2,2,2,0}, {3,4,5,0}, 1, "add 1", {1,2,2,2}, {9,3,4,5}});
    cases.push_back({{2,1,2,0}, {3,0,5,0}, 1, "add 1", {1,2,2,0}, {9,3,5,0}});
    cases.push_back({{1,2,2,0}, {3,0,5,0}, 1, "add 1", {1,1,2,0}, {3,9,5,0}});
    cases.push_back({{1,2,2,0}, {3,2,5,0}, 1, "add 1", {1,1,2,0}, {3,9,5,0}});

    // add 2: first batch
    cases.push_back({{1,1,2,3}, {3,2,5,4}, 2, "add 2", {1,2,2,3}, {3,9,5,4}});
    cases.push_back({{1,1,2,3}, {2,3,5,4}, 2, "add 2", {1,2,2,3}, {3,9,5,4}});
    cases.push_back({{1,1,2,3}, {4,3,5,2}, 2, "add 2", {1,1,2,2}, {4,3,5,9}});
    cases.push_back({{1,2,2,2,3}, {4,3,2,5,6}, 2, "add 2", {1,2,2,2,3}, {4,3,9,5,6}});
    cases.push_back({{1,2,2,2,3}, {4,2,3,5,6}, 2, "add 2", {1,2,2,2,3}, {4,9,3,5,6}});
    cases.push_back({{1,2,2,2,3}, {4,5,3,2,6}, 2, "add 2", {1,2,2,2,3}, {4,5,3,9,6}});
    cases.push_back({{1,2,2,2,3}, {4,3,0,5,6}, 2, "add 2", {1,2,2,2,3}, {4,3,9,5,6}});
    cases.push_back({{1,2,2,2,3}, {4,0,3,5,6}, 2, "add 2", {1,2,2,2,3}, {4,9,3,5,6}});
    cases.push_back({{1,2,2,2,3}, {4,5,3,0,6}, 2, "add 2", {1,2,2,2,3}, {4,5,3,9,6}});
    cases.push_back({{1,2,2,2,3}, {2,5,3,7,6}, 2, "add 2", {2,2,2,2,3}, {9,5,3,7,6}});
    cases.push_back({{1,2,2,2,3}, {0,5,3,7,6}, 2, "add 2", {2,2,2,2,3}, {9,5,3,7,6}});
    cases.push_back({{1,2,2,2,3}, {6,5,3,7,2}, 2, "add 2", {1,2,2,2,2}, {6,5,3,7,9}});
    cases.push_back({{1,2,2,2,3}, {6,5,3,7,0}, 2, "add 2", {1,2,2,2,2}, {6,5,3,7,9}});
    cases.push_back({{1,1,2,2,2,3,3}, {6,2,5,3,7,8,10}, 2, "add 2", {1,2,2,2,2,3,3}, {6,9,5,3,7,8,10}});
    cases.push_back({{1,1,2,2,2,3,3}, {6,0,5,3,7,8,10}, 2, "add 2", {1,2,2,2,2,3,3}, {6,9,5,3,7,8,10}});
    cases.push_back({{1,1,2,2,2,3,3}, {2,6,5,3,7,8,10}, 2, "add 2", {1,2,2,2,2,3,3}, {6,9,5,3,7,8,10}});
    cases.push_back({{1,1,2,2,2,3,3}, {0,6,5,3,7,8,10}, 2, "add 2", {1,2,2,2,2,3,3}, {6,9,5,3,7,8,10}});
    cases.push_back({{1,1,2,2,2,3,3}, {6,4,5,3,2,8,10}, 2, "add 2", {1,1,2,2,2,3,3}, {6,4,5,3,9,8,10}});
    cases.push_back({{1,1,2,2,2,3,3}, {6,4,5,3,0,8,10}, 2, "add 2", {1,1,2,2,2,3,3}, {6,4,5,3,9,8,10}});
    cases.push_back({{1,1,2,2,2,3,3}, {6,4,5,3,7,2,10}, 2, "add 2", {1,1,2,2,2,2,3}, {6,4,5,3,7,9,10}});
    cases.push_back({{1,1,2,2,2,3,3}, {6,4,5,3,7,0,10}, 2, "add 2", {1,1,2,2,2,2,3}, {6,4,5,3,7,9,10}});

    // add 2: second batch
    cases.push_back({{1,1,3,3,3,5,5}, {2,4,5,6,7,8,3}, 2, "add 2", {1,2,3,3,3,5,5}, {4,9,5,6,7,8,3}});
    cases.push_back({{1,1,3,3,3,5,5}, {3,2,5,6,7,8,3}, 2, "add 2", {1,2,3,3,3,5,5}, {3,9,5,6,7,8,3}});
    cases.push_back({{1,1,3,3,3,5,5}, {3,4,2,6,7,8,3}, 2, "add 2", {1,1,2,3,3,5,5}, {3,4,9,6,7,8,3}});
    cases.push_back({{1,1,3,3,3,5,5}, {3,4,5,2,7,8,3}, 2, "add 2", {1,1,2,3,3,5,5}, {3,4,9,5,7,8,3}});
    cases.push_back({{1,1,3,3,3,5,5}, {3,4,5,6,2,8,3}, 2, "add 2", {1,1,2,3,3,5,5}, {3,4,9,5,6,8,3}});
    cases.push_back({{1,1,3,3,3,5,5}, {3,4,5,6,7,2,3}, 2, "add 2", {1,1,2,3,3,3,5}, {3,4,9,5,6,7,3}});
    cases.push_back({{1,1,3,3,3,5,5}, {0,4,5,6,7,8,3}, 2, "add 2", {1,2,3,3,3,5,5}, {4,9,5,6,7,8,3}});
    cases.push_back({{1,1,3,3,3,5,5}, {3,0,5,6,7,8,3}, 2, "add 2", {1,2,3,3,3,5,5}, {3,9,5,6,7,8,3}});
    cases.push_back({{1,1,3,3,3,5,5}, {3,4,0,6,7,8,3}, 2, "add 2", {1,1,2,3,3,5,5}, {3,4,9,6,7,8,3}});
    cases.push_back({{1,1,3,3,3,5,5}, {3,4,5,0,7,8,3}, 2, "add 2", {1,1,2,3,3,5,5}, {3,4,9,5,7,8,3}});
    cases.push_back({{1,1,3,3,3,5,5}, {3,4,5,6,0,8,3}, 2, "add 2", {1,1,2,3,3,5,5}, {3,4,9,5,6,8,3}});
    cases.push_back({{1,1,3,3,3,5,5}, {3,4,5,6,7,0,3}, 2, "add 2", {1,1,2,3,3,3,5}, {3,4,9,5,6,7,3}});

    // [3,4,5] patterns with different ends; add {1,3,4,5,6}
    cases.push_back({{3,4,5}, {3,0,0}, 1, "add 1", {1,3,5}, {9,3,0}});
    cases.push_back({{3,4,5}, {3,0,0}, 3, "add 3", {3,3,5}, {3,9,0}});
    cases.push_back({{3,4,5}, {3,0,0}, 4, "add 4", {3,4,5}, {3,9,0}});
    cases.push_back({{3,4,5}, {3,0,0}, 5, "add 5", {3,5,5}, {3,9,0}});
    cases.push_back({{3,4,5}, {3,0,0}, 6, "add 6", {3,6,5}, {3,9,0}});

    cases.push_back({{3,4,5}, {0,4,0}, 1, "add 1", {1,4,5}, {9,4,0}});
    cases.push_back({{3,4,5}, {0,4,0}, 3, "add 3", {3,4,5}, {9,4,0}});
    cases.push_back({{3,4,5}, {0,4,0}, 4, "add 4", {3,4,4}, {0,4,9}});
    cases.push_back({{3,4,5}, {0,4,0}, 5, "add 5", {3,4,5}, {0,4,9}});
    cases.push_back({{3,4,5}, {0,4,0}, 6, "add 6", {3,4,6}, {0,4,9}});

    cases.push_back({{3,4,5}, {0,0,5}, 1, "add 1", {3,1,5}, {0,9,5}});
    cases.push_back({{3,4,5}, {0,0,5}, 3, "add 3", {3,3,5}, {0,9,5}});
    cases.push_back({{3,4,5}, {0,0,5}, 4, "add 4", {3,4,5}, {0,9,5}});
    cases.push_back({{3,4,5}, {0,0,5}, 5, "add 5", {3,5,5}, {0,9,5}});
    cases.push_back({{3,4,5}, {0,0,5}, 6, "add 6", {3,5,6}, {0,5,9}});

    cases.push_back({{3,4,5}, {0,4,5}, 1, "add 1", {1,4,5}, {9,4,5}});
    cases.push_back({{3,4,5}, {0,4,5}, 3, "add 3", {3,4,5}, {9,4,5}});
    cases.push_back({{3,4,5}, {0,4,5}, 4, "add 4", {4,4,5}, {9,4,5}});
    cases.push_back({{3,4,5}, {0,4,5}, 5, "add 5", {4,5,5}, {4,9,5}});
    cases.push_back({{3,4,5}, {0,4,5}, 6, "add 6", {4,5,6}, {4,5,9}});

    cases.push_back({{3,4,5}, {3,0,5}, 1, "add 1", {1,3,5}, {9,3,5}});
    cases.push_back({{3,4,5}, {3,0,5}, 3, "add 3", {3,3,5}, {3,9,5}});
    cases.push_back({{3,4,5}, {3,0,5}, 4, "add 4", {3,4,5}, {3,9,5}});
    cases.push_back({{3,4,5}, {3,0,5}, 5, "add 5", {3,5,5}, {3,9,5}});
    cases.push_back({{3,4,5}, {3,0,5}, 6, "add 6", {3,5,6}, {3,5,9}});

    cases.push_back({{3,4,5}, {3,4,0}, 1, "add 1", {1,3,4}, {9,3,4}});
    cases.push_back({{3,4,5}, {3,4,0}, 3, "add 3", {3,3,4}, {3,9,4}});
    cases.push_back({{3,4,5}, {3,4,0}, 4, "add 4", {3,4,4}, {3,4,9}});
    cases.push_back({{3,4,5}, {3,4,0}, 5, "add 5", {3,4,5}, {3,4,9}});
    cases.push_back({{3,4,5}, {3,4,0}, 6, "add 6", {3,4,6}, {3,4,9}});

    for (auto& c : cases) { c.printRet = false; c.alignAccelBases = false; }
    for (const auto& c : cases) run_simple_case(c, now);
  }
}


/*

add 1:

[1,1,1,0] [3,4,5,0]
[1,1,1,0] [3,4,1,0]
[1,1,1,4] [3,4,5,0]
[1,1,1,0] [3,1,5,0]
[4,1,1,0] [0,1,5,0]
[1,2,1,0] [3,0,5,0]

[2,2,2,0] [3,0,5,0]
[2,2,2,0] [3,2,5,0]
[2,2,2,0] [3,4,5,0]
[2,1,2,0] [3,0,5,0]
[1,2,2,0] [3,0,5,0]
[1,2,2,0] [3,2,5,0]

add 2:
[1,1,2,3] [3,2,5,4]
[1,1,2,3] [2,3,5,4]
[1,1,2,3] [4,3,5,2]
[1,2,2,2,3] [4,3,2,5,6]
[1,2,2,2,3] [4,2,3,5,6]
[1,2,2,2,3] [4,5,3,2,6]
[1,2,2,2,3] [4,3,0,5,6]
[1,2,2,2,3] [4,0,3,5,6]
[1,2,2,2,3] [4,5,3,0,6]
[1,2,2,2,3] [2,5,3,7,6]
[1,2,2,2,3] [0,5,3,7,6]
[1,2,2,2,3] [6,5,3,7,2]
[1,2,2,2,3] [6,5,3,7,0]
[1,1,2,2,2,3,3] [6,2,5,3,7,8]
[1,1,2,2,2,3,3] [6,0,5,3,7,8]
[1,1,2,2,2,3,3] [2,6,5,3,7,8]
[1,1,2,2,2,3,3] [0,6,5,3,7,8]
[1,1,2,2,2,3,3] [6,4,5,3,2,8]
[1,1,2,2,2,3,3] [6,4,5,3,0,8]
[1,1,2,2,2,3,3] [6,4,5,3,7,2]
[1,1,2,2,2,3,3] [6,4,5,3,7,0]

add 2:
[1,1,3,3,3,5,5] [2,4,5,6,7,8]
[1,1,3,3,3,5,5] [3,2,5,6,7,8]
[1,1,3,3,3,5,5] [3,4,2,6,7,8]
[1,1,3,3,3,5,5] [3,4,5,2,7,8]
[1,1,3,3,3,5,5] [3,4,5,6,2,8]
[1,1,3,3,3,5,5] [3,4,5,6,7,2]

[1,1,3,3,3,5,5] [0,4,5,6,7,8]
[1,1,3,3,3,5,5] [3,0,5,6,7,8]
[1,1,3,3,3,5,5] [3,4,0,6,7,8]
[1,1,3,3,3,5,5] [3,4,5,0,7,8]
[1,1,3,3,3,5,5] [3,4,5,6,0,8]
[1,1,3,3,3,5,5] [3,4,5,6,7,0]


[3,4,5][3,0,0] add 1
[3,4,5][3,0,0] add 3
[3,4,5][3,0,0] add 4
[3,4,5][3,0,0] add 5
[3,4,5][3,0,0] add 6

[3,4,5][0,4,0] add 1
[3,4,5][0,4,0] add 3
[3,4,5][0,4,0] add 4
[3,4,5][0,4,0] add 5
[3,4,5][0,4,0] add 6

[3,4,5][0,0,5] add 1
[3,4,5][0,0,5] add 3
[3,4,5][0,0,5] add 4
[3,4,5][0,0,5] add 5
[3,4,5][0,0,5] add 6

[3,4,5][0,4,5] add 1
[3,4,5][0,4,5] add 3
[3,4,5][0,4,5] add 4
[3,4,5][0,4,5] add 5
[3,4,5][0,4,5] add 6

[3,4,5][3,0,5] add 1
[3,4,5][3,0,5] add 3
[3,4,5][3,0,5] add 4
[3,4,5][3,0,5] add 5
[3,4,5][3,0,5] add 6

[3,4,5][3,4,0] add 1
[3,4,5][3,4,0] add 3
[3,4,5][3,4,0] add 4
[3,4,5][3,4,0] add 5
[3,4,5][3,4,0] add 6
*/

/*
for future reference:

// Try an in-place sorted insertion using an empty or expired slot and minimal shifting.
// Returns true if successful, false if no suitable slot exists (caller may spill or vector-insert).
template <typename M>
bool try_insert_sorted_inplace(M& m, int agent_idx, int8_t property_id, int8_t op, float mod_value, float fade_at, float end_time, float now, bool prefer_right_on_tie) {
  const int N = mod_count(m);
  if (N == 0) return false;

  // Minimal tracking
  int insert_pos = -1;        // first non-empty with type > property_id
  int last_non_empty = -1;    // last non-empty index
  int less_end = 0;           // after last < property_id
  bool eq_started = false;    // saw at least one == property_id (to classify frees as inside equals)
  int free_lt = -1;           // right-most free in < segment
  int free_right = -1;        // first free at/after insert_pos

  bool have_base_same = false;
  float base_same = 0.0f;

  // Single pass: collect boundaries and nearest free slots
  for (int i = 0; i < N; ++i) {
    const auto& e = m.slots[i];

    const bool is_free = (e.endTime <= now);
    const bool is_non_empty = (e.endTime != 0.0f);

    // Update boundaries first using non-empty entries
    if (is_non_empty) {
      last_non_empty = i;
      const int8_t t = e.type;
      if (t < property_id) {
        less_end = i + 1;
      } else if (t == property_id) {
        eq_started = true;
        if (!have_base_same) { have_base_same = true; base_same = e.originalValue; }
      } else { // t > property_id
        if (insert_pos == -1) insert_pos = i;
      }
    }

    // Classify free slots after boundaries are known
    if (is_free) {
      if (insert_pos != -1) {
        if (free_right == -1) free_right = i;
      } else if (eq_started) {
        // Free inside established equals segment: use it immediately
        // Prepare base restore if this was an expired slot
        int chosen_free = i;
        int used_free_idx = i;
        const auto& ce = m.slots[used_free_idx];
        if (ce.endTime != 0.0f && ce.endTime <= now) {
          const int8_t free_prop = ce.type;
          if (free_prop != property_id) {
            float& agv = ref_property_value(agent_idx, free_prop);
            agv = ce.originalValue;
            clamp_property_value(agv, free_prop);
          } else {
            have_base_same = true;
            base_same = ce.originalValue;
          }
        }
        // Write new entry and return
        auto& ne = m.slots[chosen_free];
        ne.mod = mod_value;
        ne.endTime = end_time;
        ne.fadeAt = fade_at;
        ne.type = property_id;
        ne.op = op;
        ne.originalValue = have_base_same ? base_same : ref_property_value(agent_idx, property_id);
        return true;
      } else {
        // still in < segment (or at the equals boundary before seeing a live equal): track the right-most free
        free_lt = i;
      }
    }
  }

  int chosen_free = -1;      // final hole to write into
  int used_free_idx = -1;    // which free we consumed (for base-restore)

  if (insert_pos == -1) {
    // Append within or after equals
    if (last_non_empty + 1 < N) {
      chosen_free = last_non_empty + 1; // direct append
      used_free_idx = chosen_free;
    } else if (free_lt != -1 && less_end > 0) {
      // Consume left free before equals by moving only the < group left
      used_free_idx = free_lt;
      const int start = free_lt;
      const int end = less_end - 1;
      if (start <= end) {
        shift_left_by_one(m, static_cast<size_t>(start), static_cast<size_t>(end));
        chosen_free = end; // becomes the hole after shift
      } else {
        // Free is already adjacent to equals; just use it directly
        chosen_free = start;
      }
    } else if (free_lt != -1) {
      // No non-empty '<' segment tracked (e.g., only expired entries before '='),
      // but we still have a left-side free slot we can use directly.
      chosen_free = free_lt;
      used_free_idx = free_lt;
    } else {
      return false;
    }
  } else {
    // Insert before first greater
    if (free_lt != -1) {
      // If the free is at/after the <->= boundary, use it directly; otherwise shift the < block left to the boundary
      if (free_lt >= less_end) {
        chosen_free = free_lt;
        used_free_idx = free_lt;
      } else {
        used_free_idx = free_lt;
        const int lstart = free_lt;
        const int lend = less_end - 1;
        if (lstart <= lend) shift_left_by_one(m, static_cast<size_t>(lstart), static_cast<size_t>(lend));
        chosen_free = lend; // just before equals after shift
      }
    } else if (free_right != -1) {
      // Shift only the greater-than block right
      used_free_idx = free_right;
      shift_right_by_one(m, static_cast<size_t>(insert_pos), static_cast<size_t>(free_right - 1));
      chosen_free = insert_pos;
    } else if (free_lt != -1 && less_end > 0) {
      // Move only the less-than block to bring hole just before equals
      used_free_idx = free_lt;
      const int start = free_lt;
      const int end = less_end - 1;
      if (start <= end) {
        shift_left_by_one(m, static_cast<size_t>(start), static_cast<size_t>(end));
        chosen_free = end; // just before equals after shift
      } else {
        // Free is already just before equals; use it directly
        chosen_free = start;
      }
    } else {
      return false;
    }
  }

  // Restore base if we consumed an expired slot
  if (used_free_idx != -1) {
    const auto& ce = m.slots[used_free_idx];
    if (ce.endTime != 0.0f && ce.endTime <= now) {
      const int8_t free_prop = ce.type;
      if (free_prop != property_id) {
        float& agv = ref_property_value(agent_idx, free_prop);
        agv = ce.originalValue;
        clamp_property_value(agv, free_prop);
      } else {
        have_base_same = true;
        base_same = ce.originalValue;
      }
    }
  }

  // Write new entry into the chosen hole
  auto& e = m.slots[chosen_free];
  e.mod = mod_value;
  e.endTime = end_time;
  e.fadeAt = fade_at;
  e.type = property_id;
  e.op = op;

  if (have_base_same) {
    e.originalValue = base_same;
  } else {
    e.originalValue = ref_property_value(agent_idx, property_id);
  }

  // Inserted entry; recomputation will adjust agent values as needed.

  return true;
}
  */