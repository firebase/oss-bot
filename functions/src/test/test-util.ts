import * as assert from "assert";
import * as types from "../types";

export function actionsEqual(a: types.Action, b: types.Action) {
  const aClone = Object.assign({}, a) as types.Action;
  const bClone = Object.assign({}, b) as types.Action;

  aClone.reason = "";
  bClone.reason = "";

  assert.deepEqual(aClone, bClone);
}

export function actionsListEqual(a: types.Action[], b: types.Action[]) {
  assert.equal(a.length, b.length, "Action arrays have same length");

  for (let i = 0; i < a.length; i++) {
    actionsEqual(a[0], b[0]);
  }
}
