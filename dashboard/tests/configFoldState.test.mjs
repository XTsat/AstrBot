import assert from "node:assert/strict";
import test from "node:test";

import {
  FOLD_STATE_PREFIX,
  clearFoldState,
  readFoldState,
  writeFoldState,
} from "../src/utils/configFoldState.mjs";

test("an untouched group has no remembered fold state", () => {
  clearFoldState();

  assert.equal(readFoldState(`${FOLD_STATE_PREFIX}demo:advanced`), null);
});

test("remembered fold state is per group and keeps booleans", () => {
  clearFoldState();

  writeFoldState(`${FOLD_STATE_PREFIX}demo:advanced`, true);
  writeFoldState(`${FOLD_STATE_PREFIX}demo:basic`, false);

  assert.equal(readFoldState(`${FOLD_STATE_PREFIX}demo:advanced`), true);
  assert.equal(readFoldState(`${FOLD_STATE_PREFIX}demo:basic`), false);
  assert.equal(readFoldState(`${FOLD_STATE_PREFIX}demo:other`), null);
});

test("writeFoldState normalises truthy values to a boolean", () => {
  clearFoldState();

  writeFoldState(`${FOLD_STATE_PREFIX}demo:advanced`, 1);

  assert.equal(readFoldState(`${FOLD_STATE_PREFIX}demo:advanced`), true);
});

test("clearFoldState drops every remembered group", () => {
  writeFoldState(`${FOLD_STATE_PREFIX}demo:advanced`, true);
  clearFoldState();

  assert.equal(readFoldState(`${FOLD_STATE_PREFIX}demo:advanced`), null);
});
