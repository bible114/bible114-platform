import {
  SelfSubgroupMembershipError,
  updateSelfSubgroupMembership,
} from "./selfSubgroupMembershipCore.ts";

const church = {
  departments: [{
    id: "young",
    name: "청년부",
    subgroups: [{ id: "cell-1", name: "1구역" }, {
      id: "cell-2",
      name: "2구역",
    }],
  }],
};

const member = {
  departmentId: "young",
  subgroupId: "cell-1",
  extraMemberships: [],
};

Deno.test("본인이 같은 교회 추가 소그룹에 가입하고 탈퇴할 수 있다", () => {
  const added = updateSelfSubgroupMembership({
    operation: "add",
    departmentId: "young",
    subgroupId: "cell-2",
    church,
    membershipDocument: member,
  });
  if (
    added.status !== "added" ||
    added.extraMemberships[0]?.subgroupName !== "2구역"
  ) {
    throw new Error("추가 소그룹 가입 결과가 올바르지 않습니다.");
  }
  const removed = updateSelfSubgroupMembership({
    operation: "remove",
    departmentId: "young",
    subgroupId: "cell-2",
    church,
    membershipDocument: { ...member, extraMemberships: added.extraMemberships },
  });
  if (removed.status !== "removed" || removed.extraMemberships.length !== 0) {
    throw new Error("추가 소그룹 탈퇴 결과가 올바르지 않습니다.");
  }
});

Deno.test("주 소속은 추가 소속으로 변경하거나 탈퇴할 수 없다", () => {
  for (const operation of ["add", "remove"] as const) {
    let code = "";
    try {
      updateSelfSubgroupMembership({
        operation,
        departmentId: "young",
        subgroupId: "cell-1",
        church,
        membershipDocument: member,
      });
    } catch (error) {
      code = error instanceof SelfSubgroupMembershipError ? error.code : "";
    }
    if (code !== "PRIMARY_MEMBERSHIP") {
      throw new Error("주 소속 보호가 필요합니다.");
    }
  }
});

Deno.test("추가 소속은 최대 세 개로 제한한다", () => {
  let code = "";
  try {
    updateSelfSubgroupMembership({
      operation: "add",
      departmentId: "young",
      subgroupId: "cell-2",
      church,
      membershipDocument: {
        ...member,
        extraMemberships: [
          {
            departmentId: "a",
            departmentName: "a",
            subgroupId: "a",
            subgroupName: "a",
          },
          {
            departmentId: "b",
            departmentName: "b",
            subgroupId: "b",
            subgroupName: "b",
          },
          {
            departmentId: "c",
            departmentName: "c",
            subgroupId: "c",
            subgroupName: "c",
          },
        ],
      },
    });
  } catch (error) {
    code = error instanceof SelfSubgroupMembershipError ? error.code : "";
  }
  if (code !== "TOO_MANY_MEMBERSHIPS") {
    throw new Error("최대 세 개 제한이 필요합니다.");
  }
});

Deno.test("교회에 없는 소그룹은 서버에서 거부한다", () => {
  let code = "";
  try {
    updateSelfSubgroupMembership({
      operation: "add",
      departmentId: "young",
      subgroupId: "forged",
      church,
      membershipDocument: member,
    });
  } catch (error) {
    code = error instanceof SelfSubgroupMembershipError ? error.code : "";
  }
  if (code !== "INVALID_MEMBERSHIP") {
    throw new Error("서버 조직 검증이 필요합니다.");
  }
});
