import type { FirestoreDocument } from "../_shared/firestore.ts";
import { loadCanonicalCommunityProgressMembers } from "./communityProgressService.ts";

type UnknownRecord = Record<string, unknown>;

const PREFIX = "projects/fixture/databases/(default)/documents/";

const document = (
  path: string,
  data: UnknownRecord,
): FirestoreDocument<UnknownRecord> => ({
  name: `${PREFIX}${path}`,
  fields: {},
  data,
});

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const assertEquals = (actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
};

Deno.test("canonical community progress overlays roster plan/fixture from root users and drops ghosts", async () => {
  const loadedProfilePaths: string[][] = [];
  const members = await loadCanonicalCommunityProgressMembers(
    { token: "token", projectId: "fixture" },
    "org-1",
    {
      loadPrimaryDocuments: async () => [
        document("users/primary", {
          name: "주 소속",
          password: null,
          churchId: "org-1",
          planId: "1year_new",
          currentDay: 90,
        }),
      ],
      loadRosterDocuments: async () => [
        document("churches/org-1/roster/primary", {
          uid: "primary",
          name: "중복 명부",
          currentDay: 3,
        }),
        document("churches/org-1/roster/external", {
          uid: "external",
          name: "외부 성도",
          planId: "1year_revised",
          fixtureType: null,
          currentDay: 31,
        }),
        document("churches/org-1/roster/missing", {
          uid: "missing",
          name: "루트 없음",
          currentDay: 20,
        }),
        document("churches/org-1/roster/deleted", {
          uid: "deleted",
          name: "삭제됨",
          currentDay: 20,
        }),
        document("churches/org-1/roster/wrong-path", {
          uid: "different-uid",
          name: "잘못된 명부",
          currentDay: 20,
        }),
      ],
      loadUserProfiles: async (_service, paths) => {
        loadedProfilePaths.push(paths);
        return [
          document("users/deleted", {
            planId: "readable_new",
            isDeleted: true,
          }),
          document("users/external", {
            planId: "readable_new",
            fixtureType: "reading-badge-test",
            isDeleted: false,
          }),
          document("users/primary", {
            planId: "1year_revised",
            isDeleted: false,
          }),
        ];
      },
    },
  );

  assertEquals(loadedProfilePaths, [[
    "users/primary",
    "users/external",
    "users/missing",
    "users/deleted",
  ]]);
  assertEquals(members.map(({ uid }) => uid), ["primary", "external"]);
  assert(
    members[0].name === "주 소속" && members[0].currentDay === 90 &&
      members[0].planId === "1year_new",
    "primary projection did not retain precedence",
  );
  assert(
    members[1].planId === "readable_new" &&
      members[1].fixtureType === "reading-badge-test" &&
      members[1].currentDay === 31,
    "external roster did not combine root identity with roster progress",
  );
});

Deno.test("canonical community progress batches large roster profile reads and maps unordered results", async () => {
  const roster = Array.from(
    { length: 205 },
    (_, index) =>
      document(`churches/org-large/roster/u-${index}`, {
        uid: `u-${index}`,
        name: `성도 ${index}`,
        currentDay: index % 60 + 1,
      }),
  );
  const loadedProfilePaths: string[][] = [];
  const members = await loadCanonicalCommunityProgressMembers(
    { token: "token", projectId: "fixture" },
    "org-large",
    {
      loadPrimaryDocuments: async () => [],
      loadRosterDocuments: async () => roster,
      loadUserProfiles: async (_service, paths) => {
        loadedProfilePaths.push(paths);
        return [...paths].reverse().map((path) => {
          const uid = path.slice("users/".length);
          return document(path, {
            planId: Number(uid.slice(2)) % 2 === 0
              ? "readable_revised"
              : "1year_revised",
            isDeleted: false,
          });
        });
      },
    },
  );

  assertEquals(loadedProfilePaths.map(({ length }) => length), [100, 100, 5]);
  assert(members.length === 205, "large roster member was lost");
  assert(
    members.find(({ uid }) => uid === "u-150")?.planId ===
      "readable_revised",
    "unordered batch result was mapped to the wrong uid",
  );
  assert(
    members.find(({ uid }) => uid === "u-151")?.planId ===
      "1year_revised",
    "plan identity changed across a batch boundary",
  );
});
