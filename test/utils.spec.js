const test = require('ava');
const {
    getIn,
    seq,
    replace,
    dedupe,
    trimObject,
    mergeObjects,
    objFilter,
    reduceWhile,
    removeProperty,
    concat
} = require('../src/utils');

test('seq', t => {
  t.deepEqual(seq(1), [1], "numbers");
  t.deepEqual(seq(true), [true], "booleans");
  t.deepEqual(seq([1,2,3]), [1,2,3], "Arrays");
  t.deepEqual(seq({a:1}), [{a:1}], "objects");
  t.deepEqual(seq("asdf"), ["asdf"], "seqings");
  t.deepEqual(seq(null), [], "null");
  t.deepEqual(seq(undefined), [], "undefined");
});

test('dedupe', t => {
  t.deepEqual(dedupe([]), [], "empty");
  t.deepEqual(dedupe([1,1,2,3,1]), [1,2,3], "numbers");
  t.deepEqual(dedupe(["a", "b", "a", "c", "d"]), ["a","b","c","d"], "strings");
});

test('trimObject', t => {
  t.deepEqual(trimObject(), {}, "undefined object");
  t.deepEqual(trimObject({a: 1}), {a: 1}, "normal object attributes");
  t.deepEqual(trimObject({a: 1, b: null}), {a: 1}, "null values removed");
  t.deepEqual(trimObject({a: 1, b: undefined}), {a: 1}, "undefined values removed");
});

test('mergeObjects', t => {
  t.deepEqual(mergeObjects(), {}, "empty");
  t.deepEqual(mergeObjects({a: 1}, {b: 2}, {c: 3}), {a: 1, b: 2, c: 3}, "normal attributes");
  t.deepEqual(mergeObjects({a: 1}, {a: 2}, {a: 3}), {a: 3}, "overrides based on order");
  t.deepEqual(mergeObjects({a: 1}, {b: null}, {a: null}), {a: 1}, "null values discarded");
  t.deepEqual(mergeObjects({a: 1}, {b: undefined}, {a: undefined}), {a: 1}, "undefined values discarded");
  t.deepEqual(mergeObjects(null, {a: 1}, undefined, {a: undefined}), {a: 1}, "missing objects are ignored");
});

test('objFilter', t => {
  const input = {A: 1, b: 2};
  const valueIsEven = (k, v) => v % 2 === 0;
  const keyIsUpper = (k, v) => k.toUpperCase() === k;
  t.deepEqual(objFilter(valueIsEven, input), {b: 2});
  t.deepEqual(objFilter(keyIsUpper, input), {A: 1});
});

test('removeProperty', t => {
  const input = {A: 1, b: 2};
  t.deepEqual(removeProperty(input), input);
  t.deepEqual(removeProperty(input, 'C'), input);
  t.deepEqual(removeProperty(input, 'A'), {b: 2});
});

test('getIn', t => {
  t.is(getIn({a: 2, b: 3}, ["a"]), 2);
  t.is(getIn({a: 2, b: 3}, ["c"]), undefined);
  t.is(getIn({a: {b: 1}}, ["a", "b"]), 1);
  t.is(getIn({a: {b: 1}}, ["c"]), undefined);
  t.is(getIn(null, ["c"]), null);
  t.deepEqual(getIn({a: 1}, []), {a: 1});
  t.deepEqual(getIn([0, {a: 1}], [1]), {a: 1});
  t.deepEqual(getIn({a: {b: 1}}, ["a"]), {b: 1});
  const sym = Symbol('foo');
  t.deepEqual(getIn({a: {[sym]: 1}}, ["a", sym]), 1);
});

test('concat', t => {
  t.deepEqual(concat(), []);
  t.deepEqual(concat(1), [1]);
  t.deepEqual(concat([1]), [1]);
  t.deepEqual(concat([1], null), [1]);
  t.deepEqual(concat([1], undefined), [1]);
  t.deepEqual(concat([1], []), [1]);
  t.deepEqual(concat([1], 2), [1, 2]);
  t.deepEqual(concat(1, 2), [1, 2]);
  t.deepEqual(concat([1], [2]), [1, 2]);
});


test('reduceWhile', t => {
  const input = [1,2,3,4,5,6,7,8];
  t.is(
      reduceWhile(
          (acc, val) => val < 4,
          (acc, val) => acc + val,
          0,
          input),
      6,
      "correctly reduces subset of input"
  );
});

