const reduceWhile = (predicateFn, reducerFn, acc, input) => {
    for(let i = 0; i < input.length; i++) {
        let value = input[i];
        if (!predicateFn(acc, value)) {
            break;
        }
        acc = reducerFn(acc, value);
    }
    return acc;
};

const addIfNotDuplicate = (arr, item) => {
    if (!arr.includes(item)) {
        arr.push(item);
    }
    return arr;
}

const dedupe = (arr) => arr.reduce((uniq, item) => addIfNotDuplicate(uniq,item), []);

const isVoid = val => val === null || val === undefined;

const seq = (c) => {
    if (isVoid(c)) {
        return [];
    }
    if (Array.isArray(c)) {
        return c;
    }
    return [c];
};

const objFilter = (fn, obj) => Object.fromEntries(Object.entries(obj).filter(([k, v]) => fn(k, v)));

const removeProperty = (obj, ...blacklist) => objFilter(key => !blacklist.includes(key), obj);

const trimObject = obj => objFilter((_k, v) => !isVoid(v), obj || {});

const mergeObjects = (...objs) => Object.assign.apply(Object, [{}].concat(objs.map(trimObject)));

const concat = (...arrays) => arrays.reduce((acc, arr) => acc.concat(isVoid(arr) ? [] : arr), []);

const getIn = (obj, path) => reduceWhile(
    acc => !isVoid(acc),
    (acc, key) => acc[key],
    obj,
    path);

module.exports = {
    dedupe,
    addIfNotDuplicate,
    seq,
    trimObject,
    mergeObjects,
    objFilter,
    getIn,
    removeProperty,
    concat,
    isVoid,
    reduceWhile
};
