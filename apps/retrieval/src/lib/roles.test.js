import { describe, it, expect } from "vitest";
import { roleOf, isStudent, isTeacher, isHoD, isModerator, canAdmin, canViewDepartment, roleLabel } from "./roles";

const as = (role) => ({ profile: { role } });

describe("roleOf", () => {
  it("reads profile.role first, then user_metadata, then a raw {role}, defaulting to student", () => {
    expect(roleOf({ profile: { role: "hod" } })).toBe("hod");
    expect(roleOf({ user_metadata: { role: "teacher" } })).toBe("teacher");
    expect(roleOf({ role: "moderator" })).toBe("moderator"); // raw profile row (admin list)
    expect(roleOf(null)).toBe("student");
    expect(roleOf({})).toBe("student");
  });
});

describe("role predicates", () => {
  it("classifies students", () => {
    expect(isStudent(as("student"))).toBe(true);
    expect(isTeacher(as("student"))).toBe(false);
  });
  it("treats teacher, hod and moderator as teacher-side", () => {
    for (const r of ["teacher", "hod", "moderator"]) expect(isTeacher(as(r))).toBe(true);
  });
  it("keeps hod and moderator distinct (the bug: a moderator is not a HoD)", () => {
    expect(isHoD(as("moderator"))).toBe(false);
    expect(isModerator(as("hod"))).toBe(false);
    expect(canViewDepartment(as("moderator"))).toBe(false); // mod uses Admin, not the dept view
    expect(canViewDepartment(as("hod"))).toBe(true);
    expect(canAdmin(as("moderator"))).toBe(true);
    expect(canAdmin(as("hod"))).toBe(false);
  });
});

describe("roleLabel", () => {
  it("maps each role to its display label", () => {
    expect(roleLabel(as("moderator"))).toBe("Moderator");
    expect(roleLabel(as("hod"))).toBe("Head of Department");
    expect(roleLabel(as("teacher"))).toBe("Teacher");
    expect(roleLabel(as("student"))).toBe("Student");
  });
});
