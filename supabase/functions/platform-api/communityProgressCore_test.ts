import {
  calendarDatesForYear,
  communityProgressShard,
  legacyCommunityProgressMember,
  legacyDateToIso,
  mergeCommunityProgressMembers,
  projectCommunityProgressMember,
  projectRosterCommunityProgressMember,
  splitCommunityProgressMembers,
} from "./communityProgressCore.ts";

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

Deno.test("공동체 진행판은 화면에 필요한 최소 필드만 투영한다", () => {
  const member = projectCommunityProgressMember("uid-1", {
    name: "성도",
    planId: "readable_new",
    fixtureType: "reading-badge-test",
    email: "hidden@example.com",
    password: "1234",
    memos: { secret: "hidden" },
    currentDay: 23,
    readCount: 2,
    score: 41,
    streak: 7,
    departmentId: "senior",
    subgroupId: "group-a",
    extraMemberships: [{
      departmentId: "youth",
      subgroupId: "group-b",
      talent: 999,
    }],
  });
  assert(
    member?.uid === "uid-1" && member.currentDay === 23 &&
      member.planId === "readable_new" &&
      member.fixtureType === "reading-badge-test",
    "projection failed",
  );
  const serialized = JSON.stringify(member);
  assert(!serialized.includes("hidden@example.com"), "email leaked");
  assert(!serialized.includes("1234"), "password leaked");
  assert(!serialized.includes("secret"), "memo leaked");
  assert(!serialized.includes("talent"), "talent leaked");
  const legacy = legacyCommunityProgressMember(member!);
  assert(
    !("planId" in legacy) && !("fixtureType" in legacy),
    "legacy projection contract changed",
  );
});

Deno.test("외부 공동체 roster는 루트 사용자의 플랜과 fixture 상태를 권위값으로 쓴다", () => {
  const member = projectRosterCommunityProgressMember(
    "uid-external",
    {
      uid: "uid-external",
      name: "외부 성도",
      planId: "1year_revised",
      fixtureType: null,
      currentDay: 31,
    },
    {
      planId: "readable_new",
      fixtureType: "reading-badge-test",
      isDeleted: false,
    },
  );
  assert(member?.planId === "readable_new", "root plan was not authoritative");
  assert(
    member?.fixtureType === "reading-badge-test",
    "root fixture marker was not authoritative",
  );
  assert(member?.currentDay === 31, "roster progress was not preserved");
});

Deno.test("루트 사용자가 없거나 삭제되면 오래된 roster를 진행판에서 제외한다", () => {
  const roster = { name: "유령 성도", currentDay: 12 };
  assert(
    projectRosterCommunityProgressMember("missing", roster, null) === null,
    "missing root user remained",
  );
  assert(
    projectRosterCommunityProgressMember("deleted", roster, {
      isDeleted: true,
      planId: "readable_new",
    }) === null,
    "deleted root user remained",
  );
});

Deno.test("진행판 currentDay는 정규화된 plan의 60일·365일 주기로 보정한다", () => {
  assert(
    projectCommunityProgressMember("readable", {
      planId: "readable_new",
      currentDay: 61,
    })?.currentDay === 1,
    "readable day did not wrap at 60",
  );
  assert(
    projectCommunityProgressMember("annual", {
      planId: "1year_new",
      currentDay: 366,
    })?.currentDay === 1,
    "annual day did not wrap at 365",
  );
  assert(
    projectCommunityProgressMember("legacy", {
      planId: "unsupported",
      currentDay: 61,
    })?.currentDay === 61,
    "fallback annual plan used the wrong cycle",
  );
});

Deno.test("주 소속 자료가 roster 중복보다 우선한다", () => {
  const primary = projectCommunityProgressMember("same", {
    name: "주 소속",
    currentDay: 50,
  })!;
  const roster = projectCommunityProgressMember("same", {
    name: "명부",
    currentDay: 10,
  })!;
  const merged = mergeCommunityProgressMembers([primary], [roster]);
  assert(merged.length === 1, "duplicate member remained");
  assert(
    merged[0].name === "주 소속" && merged[0].currentDay === 50,
    "precedence changed",
  );
});

Deno.test("진행판 shard는 결정적이고 모든 회원을 한 번만 포함한다", () => {
  const members = Array.from(
    { length: 100 },
    (_, index) =>
      projectCommunityProgressMember(`uid-${index}`, {
        name: `성도 ${index}`,
        currentDay: index + 1,
      })!,
  );
  const shards = splitCommunityProgressMembers(members);
  const flattened = shards.flat();
  assert(flattened.length === members.length, "member lost");
  assert(
    new Set(flattened.map((member) => member.uid)).size === members.length,
    "duplicate member",
  );
  for (const member of members) {
    assert(
      shards[communityProgressShard(member.uid)].some((row) =>
        row.uid === member.uid
      ),
      "member placed in wrong shard",
    );
  }
});

Deno.test("읽기 달력은 같은 날 여러 완료를 하루로 계산한다", () => {
  assert(
    legacyDateToIso("Thu Jul 23 2026") === "2026-07-23",
    "legacy conversion",
  );
  const dates = calendarDatesForYear([
    { date: "Thu Jul 23 2026" },
    { date: "Thu Jul 23 2026" },
    { date: "Fri Jul 24 2026" },
    { date: "Wed Jul 23 2025" },
    { date: "garbage" },
  ], 2026);
  assert(
    JSON.stringify(dates) === JSON.stringify(["2026-07-23", "2026-07-24"]),
    "calendar did not deduplicate days",
  );
});
