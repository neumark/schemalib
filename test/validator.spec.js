const test = require('ava');
const sl = require('../src/schemalib');
const { getValidator, getAssertingValidator, ValidationError, withValidatorOptions } = require('../src/validator');
const { mergeObjects } = require ('../src/utils');

test('simple schema', t => {
  const validate = getValidator(mergeObjects(
      sl.baseSchema('example'),
      sl.openObject({
          firstName: sl.type('string'),
          lastName: sl.type('string'),
          age: mergeObjects(
              sl.type('integer'),
              {minimum: 0})
      })
  ));
  const goodData = {
      "firstName": "John",
      "lastName": "Doe",
      "age": 21
    }
  const badData = {
      "firstName": "John",
      "lastName": "Doe",
      "age": false
    }
  t.deepEqual(validate(goodData), {valid: true, errors: null, data:goodData}, "simple schema evaluates with proper data");
  t.deepEqual(validate(badData), {valid: false, data:badData, errors: [{
    data: false,
    dataPath: '.age',
    keyword: 'type',
    message: 'should be integer',
    params: {type: 'integer'},
    parentSchema: {
        minimum: 0,
        type: 'integer'
    },
    schema: 'integer',
    schemaPath: '#/properties/age/type',
  }]}, "simple schema throws errors with faulty data");
});

test('asserting validator', t => {
  const validate = getAssertingValidator(mergeObjects(
      sl.baseSchema('example'),
      sl.openObject({
          firstName: sl.type('string'),
          lastName: sl.type('string'),
          age: mergeObjects(
              sl.type('integer'),
              {minimum: 0})
      })
  ));
  const goodData = {
      "firstName": "John",
      "lastName": "Doe",
      "age": 21
    }
  const badData = {
      "firstName": "John",
      "lastName": "Doe",
      "age": false
    }
  t.deepEqual(validate(goodData), goodData);
  let error = t.throws(() => validate(badData), {instanceOf: ValidationError});
  t.deepEqual(error.errors, [{
    data: false,
    dataPath: '.age',
    keyword: 'type',
    message: 'should be integer',
    params: {type: 'integer'},
    parentSchema: {
        minimum: 0,
        type: 'integer'
    },
    schema: 'integer',
    schemaPath: '#/properties/age/type',
  }]);
});


test('transform applied', t => {
    t.plan(3);
    const validate = getValidator(
        sl.openObject({
            data: mergeObjects(
                sl.type('string'),
                {transform: ['foo']})
        }),
        {
            transforms: {
                foo: ({transformation, data}) => {
                    t.is(transformation, "foo");
                    return data + "foo";
                }
            }
        });
    const data = {data: "asdf"}
    const result = validate(data);
    t.deepEqual(result, {valid: true, data, errors: null}, "complex schema evaluates with proper data");
    t.deepEqual(data, {data: "asdffoo"}, "transform changes object in-place");
});

test('transform validation', t => {
    t.plan(2);
    const validate = getValidator(
        sl.openObject({
            data: mergeObjects(
                sl.type('string'),
                {transform: ['foo']})
        }),
        {
            transforms: {
                foo: ({data, error}) => {
                    error("Gorilla!");
                    return data + "foo";
                }
            }
        });
        const data = {data: "asdf"}
        const result = validate(data);
        t.deepEqual(result, {valid: false, data, errors: [{
            data: 'asdffoo',
            dataPath: '.data',
            message: 'Gorilla!',
            schema: ['foo'],
            schemaPath: '#/properties/data/transform'
        }]}, "complex schema evaluates with proper data");
        t.deepEqual(data, {data: "asdffoo"}, "transform changes object in-place despite validation failure");
});

test('transform coerces validated data into different type', t => {
    const validate = getValidator({
        "type": "object",
        "properties": {
            "data": {
                "type": "integer",
                "transform": ["toString"]
            }
        }
    },
    {
        transforms: {
            toString: ({data}) => {
                return data+"";
            }
        }
    });
    const data = {data: 100}
    const result = validate(data);
    t.deepEqual(result, {valid: true, data, errors: null}, "complex schema evaluates with proper data");
    t.deepEqual(data, {data: "100"}, "transform changes object in-place after validation");
});

test('transform works on array elements', t => {
    const validate = getValidator(
        sl.listOf(mergeObjects(sl.type('string'), { transform: ["asdf"]})),
        {
            transforms: {
                asdf: ({data}) => data.toUpperCase()
            }
        });
    const data = ["a", "b", "c"];
    const result = validate(data);
    t.deepEqual(result, {valid: true, data, errors: null}, "complex schema evaluates with proper data");
    t.deepEqual(data, ["A", "B", "C"], "transform changes object in-place after validation");
});

test('transform works on arrays', t => {
    const validate = getValidator(
        mergeObjects(
            sl.listOf(sl.type('string')),
            { transform: ["asdf"]}
        ),
        {
            transforms: {
                asdf: ({data}) => {
                    data.push("bar");
                    return data;
                    // return value ignored because this is an array
                }
            }
        });
    const data = ["foo"];
    const result = validate(data);
    t.deepEqual(result, {valid: true, data, errors: null}, "complex schema evaluates with proper data");
    t.deepEqual(data, ["foo", "bar"], "transform changes object in-place after validation");
});

test('transform works on primitive types', t => {
    const validate = getValidator(
        sl.transform(sl.type('number'), function inc({data}) {return data+1;})
    );
    const dataIn = 5;
    const result = validate(dataIn);
    t.deepEqual(result, {valid: true, data: 6, errors: null});    
});

test('AJV keywords: instanceOf', t => {
    // example from: https://github.com/epoberezkin/ajv-keywords
    t.deepEqual(
        getValidator({instanceOf: 'RegExp'})(/.*/),
        {valid: true, data: /.*/, errors: null});

    t.deepEqual(
        getValidator({instanceOf: 'RegExp'})(".*"),
        {valid: false, data: ".*", errors: [
            {
                data: '.*',
                dataPath: '',
                keyword: 'instanceOf',
                message: 'should pass "instanceOf" keyword validation',
                params: {keyword: 'instanceOf'},
                parentSchema: {instanceOf: 'RegExp'},
                schema: 'RegExp',
                schemaPath: '#/instanceOf',
            }]});
});

test('AJV keywords: typeof', t => {
    // example from: https://github.com/epoberezkin/ajv-keywords
    const fn = (x) => x+1;
    t.deepEqual(
        getValidator(
           sl.jsType('function'),
           {ajvKeywords: ['typeof']})(fn),
        {valid: true, data: fn, errors: null});

    t.deepEqual(
        getValidator(
           sl.jsType('function'),
           {ajvKeywords: ['typeof']})({}),
        {valid: false, data: {}, errors: [
            {
                data: {},
                dataPath: '',
                keyword: 'typeof',
                message: 'should pass "typeof" keyword validation',
                params: {keyword: 'typeof'},
                parentSchema: {typeof: 'function'},
                schema: 'function',
                schemaPath: '#/typeof',
            }]});
});

test('Validator options can live in schema', t => {
    // example from: https://github.com/epoberezkin/ajv-keywords

    const data = {
            a: 1,
            b: 2 };
    t.deepEqual(
        getValidator(
            withValidatorOptions(
                sl.closedObject({
                    a: sl.type("integer")
                })),
            {ajvOptions: {removeAdditional: true}})(data),
        {valid: true, data, errors: null});
    t.deepEqual(data, {a: 1});
});



test('AJV keywords: instanceOf with custom class', t => {

    class C {
        fn1() {
            console.log(1);
        }
    };

    class D extends C {};

    class E {
        fn2() {
            console.log(2);
        }
    };

    const c = new C();
    t.deepEqual(
        getValidator(
           sl.instanceOf('C'),
           {classes: [C]})(c),
        {valid: true, data: c, errors: null});

    const d = new D();
    t.deepEqual(
        getValidator(
           sl.instanceOf('C'),
           {classes: [C]})(d),
        {valid: true, data: d, errors: null});

    const e = new E();
    t.deepEqual(
        getValidator(
           sl.instanceOf('C'),
           {classes: [C]})(e),
        {valid: false, data: e, errors: [
            {
                data: new E(),
                dataPath: '',
                keyword: 'instanceOf',
                message: 'should pass "instanceOf" keyword validation',
                params: {keyword: 'instanceOf'},
                parentSchema: {
                    instanceOf: 'C',
                    properties: {},
                    type: 'object'
                },
                schema: 'C',
                schemaPath: '#/instanceOf',
            }]});
});

