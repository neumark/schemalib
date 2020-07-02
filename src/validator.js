const Ajv = require('ajv');
const addAJVKeywords = require('ajv-keywords');
const { mergeObjects, dedupe, concat, getIn, isVoid, seq } = require ('./utils');

const VALIDATOR_METADATA = Symbol('VALIDATOR_METADATA');
const MD_VALIDATOR_OPTIONS = "VALIDATOR_OPTIONS";
const MD_CONSTRUCTORS = "CONSTUCTORS";
const MD_TRANSFORMS = "TRANSFORMS";

const getMetadata = (obj, metadataType) => getIn(obj, [VALIDATOR_METADATA, metadataType]);

const setMetadata = (obj, metadataType, value) => {
    if (!isVoid(value)) {
        obj[VALIDATOR_METADATA] = obj[VALIDATOR_METADATA] || {};
        obj[VALIDATOR_METADATA][metadataType] = value;
    }
    return obj;
}

const withValidatorOptions = (schema, validatorOptions) => setMetadata(schema, MD_VALIDATOR_OPTIONS, validatorOptions);

class ValidationError extends Error {
    constructor(errors, ...args) {
        super(...args)
        Error.captureStackTrace(this, ValidationError);
        this.errors = errors;
    }
}

// based on https://github.com/epoberezkin/ajv-keywords/blob/master/keywords/transform.js
const addTransforms = (ajv, transforms = {}, storeTransformResult) => {
    const definition = {        
        errors: 'full',
        modifying: true,
        // valid: true,
        compile: function (schema, parentSchema) {
          
          const additional = getMetadata(parentSchema, MD_TRANSFORMS) || {};          
          return function validationFn (data, dataPath, object, key) {

            let valid = true;
            const error = (message) => {
                valid = false;
                if (!validationFn.errors) {
                    validationFn.errors = [];
                }
                var errObj = {};
                if (typeof message === 'string') {
                    errObj = {message};
                }
                if (typeof message === 'object') {
                    errObj = message;
                }
                validationFn.errors.push(errObj);
            };

            // apply transform in order provided
            for (var j = 0, l = schema.length; j < l; j++) {
                const transformFn = transforms[schema[j]] || additional[schema[j]];
                if (transformFn) {
                  data = transformFn({
                    transformation: schema[j],
                    data,
                    dataPath,
                    key,
                    object,
                    parentSchema,
                    error
                  });
                } else {                
                  error(`no such transform function available: ${schema[j]}`);
                }                             
            }
            if (object) {
              object[key] = data;
            } else {
              storeTransformResult(data);
            }
            return valid;
          };
        },
        metaSchema: {
            type: 'array',
            items: {
                type: 'string'
            }
        }
    };
    ajv.addKeyword('transform', definition);
};

const registerClass = (registry, ...classes) => classes.reduce((acc, c) => {
  acc[c.name] = c;
  return acc;
}, registry); 

// based on: https://github.com/epoberezkin/ajv-keywords/blob/master/keywords/instanceof.js
const constructorRegistry = registerClass({}, 
  Object,
  Array,
  Function,
  Number,
  String,
  Date,
  RegExp,
  Buffer,
  Promise,
  Map,
  Set);

const addInstanceOf = (ajv, classes = []) => {
  const constructors = registerClass(mergeObjects(constructorRegistry), ...classes);
  const getConstructor = (c, additionalRegistry) => {
      var constructor = constructors[c] || additionalRegistry[c];
      if (constructor) return constructor;      
      throw new Error('invalid "instanceOf" keyword value ' + c);
  };

  const definition = {
    compile: function (schema, parentSchema) {
      const additional = getMetadata(parentSchema, MD_CONSTRUCTORS) || {};
      
      if (typeof schema == 'string') {
        var constructor = getConstructor(schema, additional);
        return function (data) {
          return data instanceof constructor;
        };
      }

      var constructors = schema.map(s => getConstructor(schema, additional));
      return function (data) {
        for (var i=0; i<constructors.length; i++)
          if (data instanceof constructors[i]) return true;
        return false;
      };
    },
    metaSchema: {
      anyOf: [
        { type: 'string' },
        {
          type: 'array',
          items: { type: 'string' }
        }
      ]
    }
  };

  ajv.addKeyword('instanceOf', definition);
  return ajv;
};

const mergeValidatorOptions = (paramOpts, schemaOpts) => {
  paramOpts = paramOpts || {};
  schemaOpts = schemaOpts || {};
  return {
    transforms: mergeObjects(schemaOpts.transforms, paramOpts.transforms),
    ajvOptions: mergeObjects(schemaOpts.ajvOptions, paramOpts.ajvOptions),
    ajvKeywords: dedupe(concat(schemaOpts.ajvKeywords, paramOpts.ajvKeywords)),
    classes: dedupe(concat(schemaOpts.classes, paramOpts.classes))
  };    
}

const getValidator = (schema, opts) => {
    const { transforms, ajvOptions, ajvKeywords, classes } = mergeValidatorOptions(opts, getMetadata(schema, MD_VALIDATOR_OPTIONS));
    const ajv = new Ajv(mergeObjects({ verbose: true, allErrors: true }, ajvOptions));
    let transformResult = [];
    addInstanceOf(ajv, seq(classes));
    addAJVKeywords(ajv, dedupe(concat('typeof', ajvKeywords)));
    addTransforms(ajv, transforms, v => transformResult.push(v));
    let validate;
    try {
        validate = ajv.compile(schema);
    } catch (e) {
        console.error(`schema compilation error: ${e.message} ${e.stack} ${JSON.stringify(schema, null, 4)}`);
        throw e;
    }
    return data => {
        transformResult = [];
        const valid = validate(data);
        const dataOut = transformResult.length > 0 ? transformResult[transformResult.length - 1] : data;
        transformResult = [];
        return {valid, errors: validate.errors, data: dataOut};
    };
};

const getAssertingValidator = (schema, errorMsg, opts) => {
    const validate = getValidator(schema, opts);
    return data => {
        const results = validate(data);
        if (!results.valid) {
            throw new ValidationError(results.errors, `${errorMsg || "jsonschema validation failed"}`);
        }
        return results.data;
    };
}

 module.exports = {getValidator, getAssertingValidator, ValidationError, withValidatorOptions, getMetadata, setMetadata, MD_CONSTRUCTORS, MD_TRANSFORMS, constructorRegistry};
