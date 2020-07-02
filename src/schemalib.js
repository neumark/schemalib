const { mergeObjects, dedupe, seq, getIn, removeProperty: utilsRemoveProperty, isVoid, concat, objFilter } = require('./utils');
const { getMetadata, setMetadata, MD_CONSTRUCTORS, MD_TRANSFORMS, constructorRegistry} = require('./validator');
const assert = require('assert').strict;

const MD_TAGGED_UNION = "TAGGED_UNION";
const MD_OPTIONAL = "OPTIONAL";

// sets function name, important for stacktraces
const setName = (fn, name) => {
    Object.defineProperty(fn, 'name', {value: name});
    return fn;
};

const schemaSchema = Object.freeze({
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object"
});

const baseSchema = (schemaName, definitions) => mergeObjects(
    schemaSchema,
    {
        "$id": `https://jetfabric.com/schema/${schemaName}.schema.json`,
        "title": schemaName,
        "definitions": definitions || {}
    }
);

const optional = obj => setMetadata(obj, MD_OPTIONAL, true);

const isObject = o => o.type === 'object' && !isVoid(o.properties);

// checking for the presence of the tag property is too tedious, this is close enough
const isTaggedUnion = o => !isVoid(getMetadata(MD_TAGGED_UNION)) || (Array.isArray(o.anyOf) && o.anyOf.every(isObject));

const anyOf = (...types) => ({ anyOf: types });

const type = t => {
    if (typeof t === 'string' || Array.isArray(t)) {
        return { type: t };
    }
    return t;
};

const nullable = (obj = {}) => {
    if (obj.anyOf) {
        if (obj.anyOf.some(t => seq(t.type).includes("null"))) {
            // obj is already nullable
            return obj;
        }
        return mergeObjects(obj, { anyOf: concat(obj.anyOf, type('null')) });
    }
    return anyOf(obj, type("null"));
};

const nullIfEmpty = o => {
    if (typeof o === 'object' && Object.keys(o).length == 0) {
        return null;
    }
    if (Array.isArray(o) && o.length == 0) {
        return null;
    }
    return o;
}

const object = (props = {}, description) => {
    const schema = {
        "type": "object",
        "properties": props
    };
    if (description) {
        schema.description = description;
    }
    return schema;
};

// open for extension: requires all declared properties not declared optional to be present,
// but allows additional properties.
const openObject = (props, description) => mergeObjects(
    object(props, description),
    {
        "required": nullIfEmpty(
            Object.keys(
                objFilter(
                    (_k, v) => getMetadata(v, MD_OPTIONAL) !== true,
                    props || {})))
    });

// closed for extension (no additional properties)
const closedObject = (props, description) => mergeObjects(
    openObject(props, description),
    { "additionalProperties": false });

// closed for extension (no additional properties)
const mapObject = type => mergeObjects(
    openObject(),
    { "additionalProperties": type || true });

const ref = type => ({ "$ref": `#/definitions/${type}` });

const extending = (objDefinition, ...baseObjects) => mergeObjects(
    objDefinition,
    // compute combined required and properties objects
    baseObjects.reverse().reduce(
        (acc, objDef) => ({
            required: dedupe((acc.required || []).concat(objDef.required || [])),
            properties: mergeObjects(objDef.properties, acc.properties)
        }),
        objDefinition));

const removeProperty = (objDefinition, ...toRemove) => mergeObjects(
    objDefinition,
    {
        required: objDefinition.required.filter(r => !toRemove.includes(r)),
        properties: utilsRemoveProperty(objDefinition.properties, ...toRemove)
    });

const taggedUnion = (tagPropertyName, types, tagPropertyDescription = { type: 'string' }) => setMetadata(
    anyOf(
        ...Object.entries(types).map(
            ([tagValue, objDesc]) => {
                assert.equal(isObject(objDesc), true, 'taggedUnion members must be objects');
                const extendedDesc = mergeObjects(
                    objDesc,
                    {
                        properties: mergeObjects(
                            objDesc.properties,
                            Object.fromEntries([[
                                tagPropertyName,
                                mergeObjects(
                                    tagPropertyDescription,
                                    { "const": tagValue })]]))
                    });
                extendedDesc.required = dedupe(concat(extendedDesc.required, tagPropertyName));
                return extendedDesc;
            }
        )),
    MD_TAGGED_UNION, { tagPropertyName, tagPropertyDescription });

const listOf = t => mergeObjects(
    type("array"),
    { items: type(t) });

const openTupleOf = (...types) => mergeObjects(
    type("array"),
    types.length > 0 ? { items: types.map(type) } : null,
    {
        minItems: types.length
    });

const closedTupleOf = (...types) => mergeObjects(
    openTupleOf(...types),
    {
        additionalItems: false,
        maxItems: types.length
    });

const enumOf = (...values) => mergeObjects(
    type('string'),
    { "enum": values });

const any = Object.freeze({});

const jsType = t => ({ "typeof": t });

const transform = (obj, ...fnOrNames) => {
    const { names, fns } = fnOrNames.reduce(
        ({ names, fns }, fnOrName) => {
            switch (typeof fnOrName) {
                case 'function':
                    assert.ok(fnOrName.name, "instanceOf can only use a function that has a name");
                    names.push(fnOrName.name);
                    fns[fnOrName.name] = fnOrName;
                    break;
                case 'string':
                    names.push(fnOrName);
                    break;
                default:
                    assert.fail(`transform() argument cannot be of type ${typeof fnOrName}`);
            }
            return { names, fns };
        }, { names: [], fns: {} });    ;        
    return setMetadata(
        mergeObjects(obj, { transform: names }),
        MD_TRANSFORMS,
        nullIfEmpty(fns));
}

const instanceOf = clsOrName => {
    const mkObj = name => mergeObjects(openObject(), { "instanceOf": name });
    switch (typeof clsOrName) {
        case 'function':
            assert.ok(clsOrName.name, "instanceOf can only use a class that has a name");
            return setMetadata(
                mkObj(clsOrName.name),
                MD_CONSTRUCTORS,
                { [clsOrName.name]: clsOrName });
        case 'string':
            return mkObj(clsOrName);
        default:
            assert.fail(`instanceOf() argument cannot be of type ${typeof clsOrName}`);
    }
};

const serializedInstanceOf = (clsOrName, alternativeConstructor, serializedJsType = 'string') => {
    // constructors must be called with 'new'
    const instance = instanceOf(clsOrName);
    const callConstructor = (constructor, data) => new constructor(data);
    const wrap = (fn, action=callConstructor) => {
        if (typeof fn === 'function') {
            const clsName = instance.instanceOf;
            return setName(({data}) => {
                if (typeof data !== serializedJsType) {
                    return data;
                }
                return action(fn, data);
            }, clsName);
        }
        return null;
    };
    let constructor = wrap(alternativeConstructor, (fn, data) => fn(data));
    constructor = constructor || wrap(clsOrName);
    constructor = constructor || wrap(constructorRegistry[clsOrName]);
    constructor = constructor || wrap(getMetadata(instance, MD_CONSTRUCTORS)[instance.instanceof]);
    const serialized = transform(type(serializedJsType), constructor);
    return anyOf(instance, serialized);
};

const partial = (objDef, keepRequired = []) => {
    // objDef must be either an object or a taggedUnion
    // for tagged unions, add tag field to required if known
    const gotObject = isObject(objDef);
    const gotTaggedUnion = isTaggedUnion(objDef);
    const requiredWhitelist = concat(keepRequired, getIn(getMetadata(objDef, MD_TAGGED_UNION), ['tagPropertyName']));
    assert.ok(gotObject || gotTaggedUnion, "partial() can accept only objects or tagged unions.");
    if (gotObject) {
        return mergeObjects(objDef, { required: seq(objDef.required).filter(r => requiredWhitelist.includes(r)) });
    }
    // got tagged union
    return setMetadata(
        anyOf(...objDef.anyOf.map(o => partial(o, requiredWhitelist))),
        MD_TAGGED_UNION,
        getMetadata(objDef, MD_TAGGED_UNION));
}

module.exports = {
    any,
    baseSchema,
    openObject,
    closedObject,
    extending,
    ref,
    type,
    listOf,
    openTupleOf,
    closedTupleOf,
    enumOf,
    jsType,
    taggedUnion,
    optional,
    instanceOf,
    schemaSchema,
    nullable,
    anyOf,
    removeProperty,
    mapObject,
    partial,
    transform,
    serializedInstanceOf
};
