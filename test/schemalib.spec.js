const test = require('ava');
const sl = require('../');
const { mergeObjects } = require('../src/utils');
const { getValidator, getAssertingValidator, ValidationError, withValidatorOptions, getMetadata } = require('../src/validator');

let DEBUG = false;

const printIfDebug = val => {
    if (DEBUG) {
        console.log(val);
    }
    return val;
};

const validate = (schema, data) => printIfDebug(getValidator(schema, { ajvOptions: { verbose: false } })(data));

const isValid = (t, schema, dataIn, dataOut) => t.deepEqual(validate(schema, dataIn), { valid: true, errors: null, data: dataOut || dataIn });

const isInvalid = (t, schema, data, errors) => {
    if (errors) {
        t.deepEqual(validate(schema, data), { valid: false, errors, data });
    } else {
        t.is((validate(schema, data)).valid, false);
    }
}

test('nullable on simple types', t => {
    isValid(t, sl.nullable(sl.type('string')), "asdf");
    isValid(t, sl.nullable(sl.type('string')), null);
    // ajv doesn't treats undefined as null
    isInvalid(t, sl.nullable(sl.type('string')), undefined);
    isValid(t, sl.nullable(), null);
    isValid(t, sl.nullable(), undefined);
    isValid(t, sl.nullable(), 1);
    isValid(t, sl.nullable(), { a: 13 });
});

test('nullable taggedUnions', t => {
    const schema = sl.taggedUnion("type", {
        integer: sl.closedObject({ value: sl.type("integer") }),
        string: sl.closedObject({ value: sl.type("string") })
    })
    isValid(t, schema, { type: 'integer', value: 5 });
    isValid(t, schema, { type: 'string', value: "foo" });
    isInvalid(t, schema, { type: 'boolean', value: true });
    isValid(t, sl.nullable(schema), null);
    t.deepEqual(sl.nullable(schema), sl.nullable(sl.nullable(schema)), "nullable is idempotent for taggedUnions");
});

test('openObject', t => {
    isValid(t,
        sl.openObject({ a: sl.type('number') }),
        { a: 1, b: "asdf" });
    isInvalid(t,
        sl.openObject({ a: sl.type('number') }),
        { a: "asdf" });
});

test('openObject with option properties', t => {

    // optional can be present
    isValid(t,
        sl.openObject({
            a: sl.type('number'),
            b: sl.optional(sl.type('string'))
        }),
        { a: 1, b: "asdf", c: true });

    // or can be absent
    isValid(t,
        sl.openObject({
            a: sl.type('number'),
            b: sl.optional(sl.type('string'))
        }),
        { a: 1 });

    // but it must be valid if present
    isInvalid(t,
        sl.openObject({
            a: sl.type('number'),
            b: sl.optional(sl.type('string'))
        }),
        { a: 1, b: 1, c: true });

});

test('closedObject', t => {
    isValid(t,
        sl.closedObject({
            a: sl.type('number'),
            b: sl.type('string')
        }),
        { a: 1, b: "asdf" });
    isInvalid(t,
        sl.closedObject({ a: sl.type('number') }),
        { a: 1, b: "asdf", c: true });
});

test('removeProperty', t => {
    const objDef = sl.closedObject({
        a: sl.type('number'),
        b: sl.type('string')
    });
    isValid(t, objDef, { a: 1, b: "asdf" });
    isInvalid(t, objDef, { a: 1 });

    const objDef2 = sl.removeProperty(objDef, "b");
    isInvalid(t, objDef2, { a: 1, b: "asdf" });
    isValid(t, objDef2, { a: 1 });
});

test('listOf', t => {
    isValid(t,
        sl.listOf(sl.type('number')),
        [1, 2, 3, 4]);
    isInvalid(t,
        sl.listOf(sl.type('number')),
        [1, 2, 3, true]);
});

test('mapObject', t => {
    isValid(t,
        sl.mapObject(sl.type('number')),
        { a: 1, b: 3 });
    isValid(t,
        sl.mapObject(sl.type('number')),
        {});
    isInvalid(t,
        sl.mapObject(sl.type('number')),
        { e: "adf" });
});

test('closedTupleOf', t => {
    isValid(t,
        sl.closedTupleOf(),
        []);
    isValid(t,
        sl.closedTupleOf(sl.type('number'), sl.type('string')),
        [1, "asdf"]);
    isInvalid(t,
        sl.closedTupleOf(sl.type('number'), sl.type('string')),
        [1, "asdf", 1]);
    isInvalid(t,
        sl.closedTupleOf(sl.type('number'), sl.type('string')),
        []);
    isInvalid(t,
        sl.closedTupleOf(sl.type('number'), sl.type('string')),
        ["asdf", 1]);
});

test('openTupleOf', t => {
    isValid(t,
        sl.openTupleOf(),
        []);
    isValid(t,
        sl.openTupleOf(sl.type('number'), sl.type('string')),
        [1, "asdf"]);
    isValid(t,
        sl.openTupleOf(sl.type('number'), sl.type('string')),
        [1, "asdf", 1]);
    isInvalid(t,
        sl.openTupleOf(sl.type('number'), sl.type('string')),
        []);
    isInvalid(t,
        sl.openTupleOf(sl.type('number'), sl.type('string')),
        ["asdf", 1]);
});

test('enumOf', t => {
    isValid(t,
        sl.enumOf("foo", "bar"),
        "foo");
    isValid(t,
        sl.enumOf("foo", "bar"),
        "bar");
    isInvalid(t,
        sl.enumOf("foo", "bar"),
        "asdf");
});

test('jsType', t => {
    isValid(t, sl.jsType("function"), () => 1);
    isInvalid(t, sl.jsType("function"), true);
});

test('transform passed as validator option', t => {
    const data = { a: 63 };
    const schema = sl.closedObject({
        a: sl.transform(
            // note that the schema describes the data _before_ the transformation is applied
            sl.type('integer'),
            "char"
        )
    })
    isValid(t, withValidatorOptions(
        schema,
        {
            transforms: {
                char: ({ data }) => String.fromCharCode(data)
            }
        }), data);
    t.deepEqual(data, { a: "?" });
});

test('transform passed as transform() parameter', t => {
    const data = { a: 63 };
    const schema = sl.closedObject({
        a: sl.transform(
            // note that the schema describes the data _before_ the transformation is applied
            sl.type('integer'),
            function char({ data }) {
                return String.fromCharCode(data);
            }
        )
    });
    isValid(t, schema, data);
    t.deepEqual(data, { a: "?" });
});

test('instanceOf with builtin class', t => {
    isValid(t, sl.instanceOf("Date"), new Date());
    isInvalid(t, sl.instanceOf("Date"), new Map());
    // requires an instance, not the constructor
    isInvalid(t, sl.instanceOf("Date"), Date);
    isInvalid(t, sl.instanceOf("Date"), true);
});


test('instanceOf with custom class passed as validator option', t => {
    class C {
        constructor() { }
    }

    isValid(t, withValidatorOptions(
        sl.instanceOf("C"),
        { classes: [C] }), new C());
});

test('instanceOf with custom class passed to instanceOf', t => {
    class C {
        constructor() {
            this.x = 5;
        }
    }
    const schema = sl.instanceOf(C)
    isValid(t, schema, new C());
    isInvalid(t, schema, { x: 5 });
});

test('instanceOf with nullable', t => {
    isValid(t, sl.nullable(sl.instanceOf("Date")), new Date());
    isValid(t, sl.nullable(sl.instanceOf("Date")), null);
});

test('serializedInstanceOf with date', t => {
    const schema1 = sl.closedObject({
        a: sl.serializedInstanceOf("Date")
    });
    isValid(t, schema1, { a: new Date() });
    let data = { a: '2020-05-27T20:29:05.212Z' };
    isValid(t, schema1, data);
    t.is(data.a.constructor.name, 'Date');
    t.is(data.a.toISOString(), '2020-05-27T20:29:05.212Z');
    isInvalid(t, schema1, { a: 1590611345212 });
    isInvalid(t, schema1, { a: null });
    isInvalid(t, schema1, {});

    const schema2 = sl.closedObject({
        a: sl.serializedInstanceOf("Date", null, 'number')
    });
    data = { a: 1590611345212 };
    isValid(t, schema2, data);
    t.is(data.a.constructor.name, 'Date');
    t.is(data.a.toISOString(), '2020-05-27T20:29:05.212Z');
    isInvalid(t, schema2, { a: '2020-05-27T20:29:05.212Z' });
});

test('serializedInstanceOf with nullable', t => {
    const schema = sl.closedObject({
        a: sl.nullable(
            sl.serializedInstanceOf("Date"))
    });
    isValid(t, schema, { a: new Date() });
    let data = { a: '2020-05-27T20:29:05.212Z' };
    isValid(t, schema, data);
    t.is(data.a.constructor.name, 'Date');
    t.is(data.a.toISOString(), '2020-05-27T20:29:05.212Z');    
    isValid(t, schema, { a: null });
    // a can be null, but it has to be present
    isInvalid(t, schema, {});
});

test('serializedInstanceOf with custom obj', t => {
    class Point3D {
        constructor(...args) {
            let coords = args;
            if (args.length == 1 && (typeof args[0] === 'string')) {
                coords = args[0].split(':').map(n => {
                    const parsed = parseInt(n, 10);
                    if (typeof parsed !== 'number' || Number.isNaN(parsed)) {
                        throw new Error("could not parse input");
                    }
                    return parsed;
                });
            }
            [this.x, this.y, this.z] = coords;
        }
        toJSON() {
            return `${x}:${y}:${z}`;
        }
        length() {
            return Math.round(Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z));
        }
    }

    const schema = sl.closedObject({
        a: sl.serializedInstanceOf(Point3D)
    });
    isValid(t, schema, { a: new Point3D(1, 2, 3) });
    let data = { a: '1:2:3' };
    isValid(t, schema, data);
    t.is(data.a.constructor.name, 'Point3D');
    t.is(data.a.length(), 4);
    isInvalid(t, schema, { a: 1590611345212 });
    isInvalid(t, schema, { a: null });
    isInvalid(t, schema, {});
    // exception in constructor    
    t.throws(() => validate(schema, { a: '' }), { message: "could not parse input" });
});

test('serializedInstanceOf with custom obj and alternativeConstructor', t => {
    t.plan(9)
    class Point3D {
        constructor(x, y, z) {
            [this.x, this.y, this.z] = [x, y, z];
        }
        toJSON() {
            return `${x}:${y}:${z}`;
        }
        length() {
            return Math.round(Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z));
        }
    }


    // does not check type of str
    const deserialize = str => 
         new Point3D(...(
            str.split(':').map(n => {
                const parsed = parseInt(n, 10);
                if (typeof parsed !== 'number' || Number.isNaN(parsed)) {
                    throw new Error("could not parse input");
                }
                return parsed;
            })));
    

    const schema = sl.closedObject({
        a: sl.serializedInstanceOf(Point3D, deserialize)
    });

    isValid(t, schema, { a: new Point3D(1, 2, 3) });
    let data = { a: '1:2:3' };
    isValid(t, schema, data);
    t.is(data.a.constructor.name, 'Point3D');
    t.is(data.a.length(), 4);
    isInvalid(t, schema, { a: null });
    isInvalid(t, schema, { a: 1590611345212 });    
    isInvalid(t, schema, {});
    // exception in constructor    
    t.throws(() => validate(schema, { a: '' }), { message: "could not parse input" });
    // if the type of data doesn't match, the deserializer is never called
    isInvalid(t, schema, { a: 15 });
});

test('anyOf', t => {
    isValid(t, sl.anyOf(sl.type('string'), sl.type('integer')), 'foo');
    isValid(t, sl.anyOf(sl.type('string'), sl.type('integer')), 1);
    isInvalid(t, sl.anyOf(sl.type('string'), sl.type('integer')), true);
    // nullables
    isValid(t, sl.anyOf(sl.type('string'), sl.type('null')), "a");
    isValid(t, sl.anyOf(sl.type('string'), sl.type('null')), null);
    isValid(t, sl.anyOf(sl.nullable(sl.type('string'))), null);
    // objects
    isValid(t, sl.anyOf(
        sl.closedObject({ a: sl.type('string') }),
        sl.closedObject({ b: sl.type('integer') })), { a: "s" });
    isValid(t, sl.anyOf(
        sl.closedObject({ a: sl.type('string') }),
        sl.closedObject({ b: sl.type('integer') })), { b: 1 });
    isInvalid(t, sl.anyOf(
        sl.closedObject({ a: sl.type('string') }),
        sl.closedObject({ b: sl.type('integer') })), {});
    isInvalid(t, sl.anyOf(
        sl.closedObject({ a: sl.type('string') }),
        sl.closedObject({ b: sl.type('integer') })), null);
    isInvalid(t, sl.anyOf(
        sl.closedObject({ a: sl.type('string') }),
        sl.closedObject({ b: sl.type('integer') })), { a: true });
});

test('ref', t => {
    const schema = mergeObjects(
        sl.baseSchema('classroom', {
            person: sl.openObject({
                name: sl.type('string'),
                age: sl.type('number')
            })
        }),
        sl.listOf(sl.ref('person'))
    );
    isValid(t, schema, [{ name: "bob", age: 71 }]);
    isValid(t, schema, []);
    isValid(t, schema, [{ name: "sue", age: 65 }]);
    isInvalid(t, schema, [{ name: "bob" }]);
    isInvalid(t, schema, true);
});

test('extending single object', t => {
    const parent = sl.openObject({
        foo: sl.type('string')
    });
    const schema = sl.extending(
        sl.closedObject({
            baz: sl.type('number')
        }, "child object"), parent);
    t.is(schema.description, "child object");
    // original object will be extended with new properties
    isValid(t, schema, { foo: 'b', baz: 2 });
    // test required properties 
    isInvalid(t, schema, { baz: 2 });
    // child object is closed, therefore additional properties are invalid
    isInvalid(t, schema, { foo: 'b', baz: 2, bar: true }, [
        {
            dataPath: '',
            keyword: 'additionalProperties',
            message: 'should NOT have additional properties',
            params: {
                additionalProperty: 'bar',
            },
            schemaPath: '#/additionalProperties',
        }]
    );
    const openSchema = sl.extending(
        sl.openObject({
            baz: sl.type('number')
        }), parent);
    // child open is closed, therefore additional properties are valid
    isValid(t, openSchema, { foo: 'b', baz: 2, bar: true });
});

test('extending (multiple open objects)', t => {
    const parent = sl.openObject({
        subject: sl.type('string'),
        room: sl.type('number'),
        id: sl.type('number')
    });
    const grandParent = sl.openObject({
        name: sl.type('string'),
        age: sl.type('number'),
        id: sl.type('string')
    });
    const schema = sl.extending(
        sl.closedObject({
            is_substitute: sl.type('boolean')
        }),
        grandParent,
        parent);
    // parent's id field overrides grandparent's id field
    isValid(t, schema, { id: 1, name: 'Miss Barnes', age: 40, subject: "math", room: 203, is_substitute: false });
    isInvalid(t, schema, { id: "f-1", name: 'Miss Barnes', age: 40, subject: "math", room: 203, is_substitute: false });
    // properties of child class are required (if required in base definition) - is_substitute missing below
    isInvalid(t, schema, { name: 'Miss Barnes', age: 40, subject: "math", room: 203 });
    // properties of base classes are required (if required in base definition)
    isInvalid(t, schema, { age: 40, subject: "math", room: 203, is_substitute: false }); // name missing
    isInvalid(t, schema, { name: 'Miss Barnes', age: 40, subject: "math", is_substitute: false }); // room missing
    // extending object is allowed because child disallows it
    isInvalid(t, schema, { name: 'Miss Barnes', age: 40, subject: "math", room: 203, is_substitute: false, favorite_color: "blue" });
});

test('extending (overriding parent properites)', t => {
    const keyOnlyCredentials = sl.closedObject({
        apikey: sl.type("string")
    });

    const keyAndSecretCredentials = sl.extending(
        sl.closedObject({
            secret: sl.type("string")
        }),
        keyOnlyCredentials
    );

    const serviceAccountBase = sl.openObject({
        credentials: keyAndSecretCredentials,
    });

    const myServiceAccount = sl.extending(sl.closedObject({
        credentials: keyOnlyCredentials
    }), serviceAccountBase)

    isValid(t, serviceAccountBase, { credentials: { apikey: "key", secret: "secret" } });
    isInvalid(t, serviceAccountBase, { credentials: { apikey: "key" } });
    isValid(t, myServiceAccount, { credentials: { apikey: "key" } });
    isInvalid(t, myServiceAccount, { credentials: { apikey: "key", secret: "secret" } });

});


test('taggedUnion', t => {
    const schema = sl.taggedUnion("shape", {
        rectangle: sl.closedObject({
            height: sl.type('number'),
            width: sl.type('number')
        }),
        circle: sl.closedObject({
            center: sl.closedObject({
                x: sl.type('number'),
                y: sl.type('number')
            }),
            radius: sl.type('number')
        })
    })

    isValid(t, schema, { shape: 'rectangle', height: 10, width: 12 });
    isValid(t, schema, { shape: 'circle', center: { x: 0.1, y: 0.9 }, radius: 5.2 });
    // no tag
    isInvalid(t, schema, { center: { x: 0.1, y: 0.9 }, radius: 5.2 });
    isInvalid(t, schema, { sides: [3, 2, 3] });
    // uknown tag
    isInvalid(t, schema, { shape: 'triangle', sides: [3, 2, 3] });
    // invalid values
    isInvalid(t, schema, { shape: 'rectangle' });
    isInvalid(t, schema, { shape: 'rectangle', height: 10, width: 12, color: 'red' });

});

test('partial for taggedUnion', t => {
    const schema = sl.taggedUnion("shape", {
        rectangle: sl.closedObject({
            height: sl.type('number'),
            width: sl.type('number')
        }),
        circle: sl.closedObject({
            center: sl.closedObject({
                x: sl.type('number'),
                y: sl.type('number')
            }),
            radius: sl.type('number')
        })
    })

    // tag remains required
    isValid(t, sl.partial(schema), { shape: 'rectangle', height: 10, width: 12 });
    isValid(t, sl.partial(schema), { shape: 'rectangle', height: 10 });
    isValid(t, sl.partial(schema), { shape: 'rectangle' });
    isInvalid(t, sl.partial(schema), {});
    isValid(t, sl.partial(schema), { shape: 'circle' });
    isInvalid(t, sl.partial(schema), { shape: true });

    // required properties...
    isValid(t, sl.partial(schema, ['height']), { shape: 'rectangle', height: 10, width: 12 });
    isValid(t, sl.partial(schema, ['height']), { shape: 'rectangle', height: 10 });
    isInvalid(t, sl.partial(schema, ['height']), { shape: 'rectangle', width: 10 });
    // ... unless that member of the union has no such property
    isValid(t, sl.partial(schema, ['height']), { shape: 'circle' });

    t.deepEqual(sl.partial(schema), sl.partial(sl.partial(schema)), "partial is idempotent");
    t.deepEqual(sl.partial(schema, ['height']), sl.partial(sl.partial(schema, ['height']), ['height']), "partial is idempotent");
});

test('partial for objects', t => {
    // by default all properties become optional
    const openSchema = sl.openObject({
        a: sl.type('integer'),
        b: sl.type('string'),
        c: sl.type('boolean')
    });
    const closedSchema = sl.extending(sl.closedObject(), openSchema);

    isValid(t, openSchema, { a: 1, b: "asdf", c: true });
    isValid(t, openSchema, { a: 1, b: "asdf", c: true, d: 2 });
    isInvalid(t, openSchema, { a: 1, b: "asdf" });

    isValid(t, closedSchema, { a: 1, b: "asdf", c: true });
    isInvalid(t, closedSchema, { a: 1, b: "asdf", c: true, d: 2 });
    isInvalid(t, openSchema, { a: 1, b: "asdf" });

    // by default, all properties become optional
    isValid(t, sl.partial(openSchema), { a: 1, b: "asdf" });
    isValid(t, sl.partial(openSchema), {});
    isValid(t, sl.partial(openSchema), { foo: 'bar' });
    // but even optional properties must have the correct type if present
    isInvalid(t, sl.partial(openSchema), { a: "do" });

    // closed schema still doesn't allow additional properties
    isValid(t, sl.partial(closedSchema), { a: 1, b: "asdf" });
    isValid(t, sl.partial(closedSchema), {});
    isInvalid(t, sl.partial(closedSchema), { foo: 'bar' });

    // some fields can be ke kept required:
    isValid(t, sl.partial(openSchema, ['a']), { a: 1, b: "asdf", c: true });
    isInvalid(t, sl.partial(openSchema, ['a']), { b: "asdf" });

    t.deepEqual(sl.partial(openSchema), sl.partial(sl.partial(openSchema)), "partial is idempotent");
    t.deepEqual(sl.partial(openSchema, ['a']), sl.partial(sl.partial(openSchema, ['a']), ['a']), "partial is idempotent");
});

