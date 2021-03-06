// The Module object: Our interface to the outside world. We import
// and export values on it. There are various ways Module can be used:
// 1. Not defined. We create it here
// 2. A function parameter, function(Module) { ..generated code.. }
// 3. pre-run appended it, var Module = {}; ..generated code..
// 4. External script tag defines var Module.
// We need to check if Module already exists (e.g. case 3 above).
// Substitution will be replaced with actual code on later stage of the build,
// this way Closure Compiler will not mangle it (e.g. case 4. above).
// Note that if you want to run closure, and also to use Module
// after the generated code, you will need to define   var Module = {};
// before the code. Then that object will be used in the code, and you
// can continue to use Module afterwards as well.
var Module = typeof Module !== 'undefined' ? Module : {};

// --pre-jses are emitted after the Module integration code, so that they can
// refer to Module (if they choose; they can also define Module)
// {{PRE_JSES}}

// Sometimes an existing Module object exists with properties
// meant to overwrite the default module functionality. Here
// we collect those properties and reapply _after_ we configure
// the current environment's defaults to avoid having to be so
// defensive during initialization.
var moduleOverrides = {};
var key;
for (key in Module) {
  if (Module.hasOwnProperty(key)) {
    moduleOverrides[key] = Module[key];
  }
}

Module['arguments'] = [];
Module['thisProgram'] = './this.program';
Module['quit'] = function(status, toThrow) {
  throw toThrow;
};
Module['preRun'] = [];
Module['postRun'] = [];

// The environment setup code below is customized to use Module.
// *** Environment setup code ***
var ENVIRONMENT_IS_WEB = false;
var ENVIRONMENT_IS_WORKER = false;
var ENVIRONMENT_IS_NODE = false;
var ENVIRONMENT_IS_SHELL = false;

// Three configurations we can be running in:
// 1) We could be the application main() thread running in the main JS UI thread. (ENVIRONMENT_IS_WORKER == false and ENVIRONMENT_IS_PTHREAD == false)
// 2) We could be the application main() thread proxied to worker. (with Emscripten -s PROXY_TO_WORKER=1) (ENVIRONMENT_IS_WORKER == true, ENVIRONMENT_IS_PTHREAD == false)
// 3) We could be an application pthread running in a worker. (ENVIRONMENT_IS_WORKER == true and ENVIRONMENT_IS_PTHREAD == true)

if (Module['ENVIRONMENT']) {
  if (Module['ENVIRONMENT'] === 'WEB') {
    ENVIRONMENT_IS_WEB = true;
  } else if (Module['ENVIRONMENT'] === 'WORKER') {
    ENVIRONMENT_IS_WORKER = true;
  } else if (Module['ENVIRONMENT'] === 'NODE') {
    ENVIRONMENT_IS_NODE = true;
  } else if (Module['ENVIRONMENT'] === 'SHELL') {
    ENVIRONMENT_IS_SHELL = true;
  } else {
    throw new Error('Module[\'ENVIRONMENT\'] value is not valid. must be one of: WEB|WORKER|NODE|SHELL.');
  }
} else {
  ENVIRONMENT_IS_WEB = typeof window === 'object';
  ENVIRONMENT_IS_WORKER = typeof importScripts === 'function';
  ENVIRONMENT_IS_NODE = typeof process === 'object' && typeof require === 'function' && !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_WORKER;
  ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;
}


if (ENVIRONMENT_IS_NODE) {
  // Expose functionality in the same simple way that the shells work
  // Note that we pollute the global namespace here, otherwise we break in node
  var nodeFS;
  var nodePath;

  Module['read'] = function shell_read(filename, binary) {
    var ret;
    ret = tryParseAsDataURI(filename);
    if (!ret) {
      if (!nodeFS) nodeFS = require('fs');
      if (!nodePath) nodePath = require('path');
      filename = nodePath['normalize'](filename);
      ret = nodeFS['readFileSync'](filename);
    }
    return binary ? ret : ret.toString();
  };

  Module['readBinary'] = function readBinary(filename) {
    var ret = Module['read'](filename, true);
    if (!ret.buffer) {
      ret = new Uint8Array(ret);
    }
    assert(ret.buffer);
    return ret;
  };

  if (process['argv'].length > 1) {
    Module['thisProgram'] = process['argv'][1].replace(/\\/g, '/');
  }

  Module['arguments'] = process['argv'].slice(2);

  if (typeof module !== 'undefined') {
    module['exports'] = Module;
  }

  process['on']('uncaughtException', function(ex) {
    // suppress ExitStatus exceptions from showing an error
    if (!(ex instanceof ExitStatus)) {
      throw ex;
    }
  });
  // Currently node will swallow unhandled rejections, but this behavior is
  // deprecated, and in the future it will exit with error status.
  process['on']('unhandledRejection', function(reason, p) {
    process['exit'](1);
  });

  Module['inspect'] = function () { return '[Emscripten Module object]'; };
}
else if (ENVIRONMENT_IS_SHELL) {
  if (typeof read != 'undefined') {
    Module['read'] = function shell_read(f) {
      var data = tryParseAsDataURI(f);
      if (data) {
        return intArrayToString(data);
      }
      return read(f);
    };
  }

  Module['readBinary'] = function readBinary(f) {
    var data;
    data = tryParseAsDataURI(f);
    if (data) {
      return data;
    }
    if (typeof readbuffer === 'function') {
      return new Uint8Array(readbuffer(f));
    }
    data = read(f, 'binary');
    assert(typeof data === 'object');
    return data;
  };

  if (typeof scriptArgs != 'undefined') {
    Module['arguments'] = scriptArgs;
  } else if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

  if (typeof quit === 'function') {
    Module['quit'] = function(status, toThrow) {
      quit(status);
    }
  }
}
else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
  Module['read'] = function shell_read(url) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, false);
      xhr.send(null);
      return xhr.responseText;
    } catch (err) {
      var data = tryParseAsDataURI(url);
      if (data) {
        return intArrayToString(data);
      }
      throw err;
    }
  };

  if (ENVIRONMENT_IS_WORKER) {
    Module['readBinary'] = function readBinary(url) {
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, false);
        xhr.responseType = 'arraybuffer';
        xhr.send(null);
        return new Uint8Array(xhr.response);
      } catch (err) {
        var data = tryParseAsDataURI(url);
        if (data) {
          return data;
        }
        throw err;
      }
    };
  }

  Module['readAsync'] = function readAsync(url, onload, onerror) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function xhr_onload() {
      if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) { // file URLs can return 0
        onload(xhr.response);
        return;
      }
      var data = tryParseAsDataURI(url);
      if (data) {
        onload(data.buffer);
        return;
      }
      onerror();
    };
    xhr.onerror = onerror;
    xhr.send(null);
  };

  if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

  Module['setWindowTitle'] = function(title) { document.title = title };
}

// console.log is checked first, as 'print' on the web will open a print dialogue
// printErr is preferable to console.warn (works better in shells)
// bind(console) is necessary to fix IE/Edge closed dev tools panel behavior.
Module['print'] = typeof console !== 'undefined' ? console.log.bind(console) : (typeof print !== 'undefined' ? print : null);
Module['printErr'] = typeof printErr !== 'undefined' ? printErr : ((typeof console !== 'undefined' && console.warn.bind(console)) || Module['print']);

// *** Environment setup code ***

// Closure helpers
Module.print = Module['print'];
Module.printErr = Module['printErr'];

// Merge back in the overrides
for (key in moduleOverrides) {
  if (moduleOverrides.hasOwnProperty(key)) {
    Module[key] = moduleOverrides[key];
  }
}
// Free the object hierarchy contained in the overrides, this lets the GC
// reclaim data used e.g. in memoryInitializerRequest, which is a large typed array.
moduleOverrides = undefined;



// {{PREAMBLE_ADDITIONS}}

var STACK_ALIGN = 16;


function staticAlloc(size) {
  assert(!staticSealed);
  var ret = STATICTOP;
  STATICTOP = (STATICTOP + size + 15) & -16;
  return ret;
}

function dynamicAlloc(size) {
  assert(DYNAMICTOP_PTR);
  var ret = HEAP32[DYNAMICTOP_PTR>>2];
  var end = (ret + size + 15) & -16;
  HEAP32[DYNAMICTOP_PTR>>2] = end;
  if (end >= TOTAL_MEMORY) {
    var success = enlargeMemory();
    if (!success) {
      HEAP32[DYNAMICTOP_PTR>>2] = ret;
      return 0;
    }
  }
  return ret;
}

function alignMemory(size, factor) {
  if (!factor) factor = STACK_ALIGN; // stack alignment (16-byte) by default
  var ret = size = Math.ceil(size / factor) * factor;
  return ret;
}

function getNativeTypeSize(type) {
  switch (type) {
    case 'i1': case 'i8': return 1;
    case 'i16': return 2;
    case 'i32': return 4;
    case 'i64': return 8;
    case 'float': return 4;
    case 'double': return 8;
    default: {
      if (type[type.length-1] === '*') {
        return 4; // A pointer
      } else if (type[0] === 'i') {
        var bits = parseInt(type.substr(1));
        assert(bits % 8 === 0);
        return bits / 8;
      } else {
        return 0;
      }
    }
  }
}

function warnOnce(text) {
  if (!warnOnce.shown) warnOnce.shown = {};
  if (!warnOnce.shown[text]) {
    warnOnce.shown[text] = 1;
    Module.printErr(text);
  }
}



var jsCallStartIndex = 1;
var functionPointers = new Array(0);

// 'sig' parameter is only used on LLVM wasm backend
function addFunction(func, sig) {
  var base = 0;
  for (var i = base; i < base + 0; i++) {
    if (!functionPointers[i]) {
      functionPointers[i] = func;
      return jsCallStartIndex + i;
    }
  }
  throw 'Finished up all reserved function pointers. Use a higher value for RESERVED_FUNCTION_POINTERS.';
}

function removeFunction(index) {
  functionPointers[index-jsCallStartIndex] = null;
}

var funcWrappers = {};

function getFuncWrapper(func, sig) {
  if (!func) return; // on null pointer, return undefined
  assert(sig);
  if (!funcWrappers[sig]) {
    funcWrappers[sig] = {};
  }
  var sigCache = funcWrappers[sig];
  if (!sigCache[func]) {
    // optimize away arguments usage in common cases
    if (sig.length === 1) {
      sigCache[func] = function dynCall_wrapper() {
        return dynCall(sig, func);
      };
    } else if (sig.length === 2) {
      sigCache[func] = function dynCall_wrapper(arg) {
        return dynCall(sig, func, [arg]);
      };
    } else {
      // general case
      sigCache[func] = function dynCall_wrapper() {
        return dynCall(sig, func, Array.prototype.slice.call(arguments));
      };
    }
  }
  return sigCache[func];
}


function makeBigInt(low, high, unsigned) {
  return unsigned ? ((+((low>>>0)))+((+((high>>>0)))*4294967296.0)) : ((+((low>>>0)))+((+((high|0)))*4294967296.0));
}

function dynCall(sig, ptr, args) {
  if (args && args.length) {
    return Module['dynCall_' + sig].apply(null, [ptr].concat(args));
  } else {
    return Module['dynCall_' + sig].call(null, ptr);
  }
}



var Runtime = {
  // FIXME backwards compatibility layer for ports. Support some Runtime.*
  //       for now, fix it there, then remove it from here. That way we
  //       can minimize any period of breakage.
  dynCall: dynCall, // for SDL2 port
};

// The address globals begin at. Very low in memory, for code size and optimization opportunities.
// Above 0 is static memory, starting with globals.
// Then the stack.
// Then 'dynamic' memory for sbrk.
var GLOBAL_BASE = 8;



// === Preamble library stuff ===

// Documentation for the public APIs defined in this file must be updated in:
//    site/source/docs/api_reference/preamble.js.rst
// A prebuilt local version of the documentation is available at:
//    site/build/text/docs/api_reference/preamble.js.txt
// You can also build docs locally as HTML or other formats in site/
// An online HTML version (which may be of a different version of Emscripten)
//    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html



//========================================
// Runtime essentials
//========================================

var ABORT = 0; // whether we are quitting the application. no code should run after this. set in exit() and abort()
var EXITSTATUS = 0;

/** @type {function(*, string=)} */
function assert(condition, text) {
  if (!condition) {
    abort('Assertion failed: ' + text);
  }
}

var globalScope = this;

// Returns the C function with a specified identifier (for C++, you need to do manual name mangling)
function getCFunc(ident) {
  var func = Module['_' + ident]; // closure exported function
  assert(func, 'Cannot call unknown function ' + ident + ', make sure it is exported');
  return func;
}

var JSfuncs = {
  // Helpers for cwrap -- it can't refer to Runtime directly because it might
  // be renamed by closure, instead it calls JSfuncs['stackSave'].body to find
  // out what the minified function name is.
  'stackSave': function() {
    stackSave()
  },
  'stackRestore': function() {
    stackRestore()
  },
  // type conversion from js to c
  'arrayToC' : function(arr) {
    var ret = stackAlloc(arr.length);
    writeArrayToMemory(arr, ret);
    return ret;
  },
  'stringToC' : function(str) {
    var ret = 0;
    if (str !== null && str !== undefined && str !== 0) { // null string
      // at most 4 bytes per UTF-8 code point, +1 for the trailing '\0'
      var len = (str.length << 2) + 1;
      ret = stackAlloc(len);
      stringToUTF8(str, ret, len);
    }
    return ret;
  }
};
// For fast lookup of conversion functions
var toC = {'string' : JSfuncs['stringToC'], 'array' : JSfuncs['arrayToC']};

// C calling interface.
function ccall (ident, returnType, argTypes, args, opts) {
  var func = getCFunc(ident);
  var cArgs = [];
  var stack = 0;
  if (args) {
    for (var i = 0; i < args.length; i++) {
      var converter = toC[argTypes[i]];
      if (converter) {
        if (stack === 0) stack = stackSave();
        cArgs[i] = converter(args[i]);
      } else {
        cArgs[i] = args[i];
      }
    }
  }
  var ret = func.apply(null, cArgs);
  if (returnType === 'string') ret = Pointer_stringify(ret);
  if (stack !== 0) {
    stackRestore(stack);
  }
  return ret;
}

function cwrap (ident, returnType, argTypes) {
  argTypes = argTypes || [];
  var cfunc = getCFunc(ident);
  // When the function takes numbers and returns a number, we can just return
  // the original function
  var numericArgs = argTypes.every(function(type){ return type === 'number'});
  var numericRet = returnType !== 'string';
  if (numericRet && numericArgs) {
    return cfunc;
  }
  return function() {
    return ccall(ident, returnType, argTypes, arguments);
  }
}

/** @type {function(number, number, string, boolean=)} */
function setValue(ptr, value, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': HEAP8[((ptr)>>0)]=value; break;
      case 'i8': HEAP8[((ptr)>>0)]=value; break;
      case 'i16': HEAP16[((ptr)>>1)]=value; break;
      case 'i32': HEAP32[((ptr)>>2)]=value; break;
      case 'i64': (tempI64 = [value>>>0,(tempDouble=value,(+(Math_abs(tempDouble))) >= (+1) ? (tempDouble > (+0) ? ((Math_min((+(Math_floor((tempDouble)/(+4294967296)))), (+4294967295)))|0)>>>0 : (~~((+(Math_ceil((tempDouble - +(((~~(tempDouble)))>>>0))/(+4294967296))))))>>>0) : 0)],HEAP32[((ptr)>>2)]=tempI64[0],HEAP32[(((ptr)+(4))>>2)]=tempI64[1]); break;
      case 'float': HEAPF32[((ptr)>>2)]=value; break;
      case 'double': HEAPF64[((ptr)>>3)]=value; break;
      default: abort('invalid type for setValue: ' + type);
    }
}

/** @type {function(number, string, boolean=)} */
function getValue(ptr, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': return HEAP8[((ptr)>>0)];
      case 'i8': return HEAP8[((ptr)>>0)];
      case 'i16': return HEAP16[((ptr)>>1)];
      case 'i32': return HEAP32[((ptr)>>2)];
      case 'i64': return HEAP32[((ptr)>>2)];
      case 'float': return HEAPF32[((ptr)>>2)];
      case 'double': return HEAPF64[((ptr)>>3)];
      default: abort('invalid type for getValue: ' + type);
    }
  return null;
}

var ALLOC_NORMAL = 0; // Tries to use _malloc()
var ALLOC_STACK = 1; // Lives for the duration of the current function call
var ALLOC_STATIC = 2; // Cannot be freed
var ALLOC_DYNAMIC = 3; // Cannot be freed except through sbrk
var ALLOC_NONE = 4; // Do not allocate

// allocate(): This is for internal use. You can use it yourself as well, but the interface
//             is a little tricky (see docs right below). The reason is that it is optimized
//             for multiple syntaxes to save space in generated code. So you should
//             normally not use allocate(), and instead allocate memory using _malloc(),
//             initialize it with setValue(), and so forth.
// @slab: An array of data, or a number. If a number, then the size of the block to allocate,
//        in *bytes* (note that this is sometimes confusing: the next parameter does not
//        affect this!)
// @types: Either an array of types, one for each byte (or 0 if no type at that position),
//         or a single type which is used for the entire block. This only matters if there
//         is initial data - if @slab is a number, then this does not matter at all and is
//         ignored.
// @allocator: How to allocate memory, see ALLOC_*
/** @type {function((TypedArray|Array<number>|number), string, number, number=)} */
function allocate(slab, types, allocator, ptr) {
  var zeroinit, size;
  if (typeof slab === 'number') {
    zeroinit = true;
    size = slab;
  } else {
    zeroinit = false;
    size = slab.length;
  }

  var singleType = typeof types === 'string' ? types : null;

  var ret;
  if (allocator == ALLOC_NONE) {
    ret = ptr;
  } else {
    ret = [typeof _malloc === 'function' ? _malloc : staticAlloc, stackAlloc, staticAlloc, dynamicAlloc][allocator === undefined ? ALLOC_STATIC : allocator](Math.max(size, singleType ? 1 : types.length));
  }

  if (zeroinit) {
    var stop;
    ptr = ret;
    assert((ret & 3) == 0);
    stop = ret + (size & ~3);
    for (; ptr < stop; ptr += 4) {
      HEAP32[((ptr)>>2)]=0;
    }
    stop = ret + size;
    while (ptr < stop) {
      HEAP8[((ptr++)>>0)]=0;
    }
    return ret;
  }

  if (singleType === 'i8') {
    if (slab.subarray || slab.slice) {
      HEAPU8.set(/** @type {!Uint8Array} */ (slab), ret);
    } else {
      HEAPU8.set(new Uint8Array(slab), ret);
    }
    return ret;
  }

  var i = 0, type, typeSize, previousType;
  while (i < size) {
    var curr = slab[i];

    type = singleType || types[i];
    if (type === 0) {
      i++;
      continue;
    }

    if (type == 'i64') type = 'i32'; // special case: we have one i32 here, and one i32 later

    setValue(ret+i, curr, type);

    // no need to look up size unless type changes, so cache it
    if (previousType !== type) {
      typeSize = getNativeTypeSize(type);
      previousType = type;
    }
    i += typeSize;
  }

  return ret;
}

// Allocate memory during any stage of startup - static memory early on, dynamic memory later, malloc when ready
function getMemory(size) {
  if (!staticSealed) return staticAlloc(size);
  if (!runtimeInitialized) return dynamicAlloc(size);
  return _malloc(size);
}

/** @type {function(number, number=)} */
function Pointer_stringify(ptr, length) {
  if (length === 0 || !ptr) return '';
  // TODO: use TextDecoder
  // Find the length, and check for UTF while doing so
  var hasUtf = 0;
  var t;
  var i = 0;
  while (1) {
    t = HEAPU8[(((ptr)+(i))>>0)];
    hasUtf |= t;
    if (t == 0 && !length) break;
    i++;
    if (length && i == length) break;
  }
  if (!length) length = i;

  var ret = '';

  if (hasUtf < 128) {
    var MAX_CHUNK = 1024; // split up into chunks, because .apply on a huge string can overflow the stack
    var curr;
    while (length > 0) {
      curr = String.fromCharCode.apply(String, HEAPU8.subarray(ptr, ptr + Math.min(length, MAX_CHUNK)));
      ret = ret ? ret + curr : curr;
      ptr += MAX_CHUNK;
      length -= MAX_CHUNK;
    }
    return ret;
  }
  return UTF8ToString(ptr);
}

// Given a pointer 'ptr' to a null-terminated ASCII-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function AsciiToString(ptr) {
  var str = '';
  while (1) {
    var ch = HEAP8[((ptr++)>>0)];
    if (!ch) return str;
    str += String.fromCharCode(ch);
  }
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in ASCII form. The copy will require at most str.length+1 bytes of space in the HEAP.

function stringToAscii(str, outPtr) {
  return writeAsciiToMemory(str, outPtr, false);
}

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the given array that contains uint8 values, returns
// a copy of that string as a Javascript String object.

var UTF8Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf8') : undefined;
function UTF8ArrayToString(u8Array, idx) {
  var endPtr = idx;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  while (u8Array[endPtr]) ++endPtr;

  if (endPtr - idx > 16 && u8Array.subarray && UTF8Decoder) {
    return UTF8Decoder.decode(u8Array.subarray(idx, endPtr));
  } else {
    var u0, u1, u2, u3, u4, u5;

    var str = '';
    while (1) {
      // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
      u0 = u8Array[idx++];
      if (!u0) return str;
      if (!(u0 & 0x80)) { str += String.fromCharCode(u0); continue; }
      u1 = u8Array[idx++] & 63;
      if ((u0 & 0xE0) == 0xC0) { str += String.fromCharCode(((u0 & 31) << 6) | u1); continue; }
      u2 = u8Array[idx++] & 63;
      if ((u0 & 0xF0) == 0xE0) {
        u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
      } else {
        u3 = u8Array[idx++] & 63;
        if ((u0 & 0xF8) == 0xF0) {
          u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | u3;
        } else {
          u4 = u8Array[idx++] & 63;
          if ((u0 & 0xFC) == 0xF8) {
            u0 = ((u0 & 3) << 24) | (u1 << 18) | (u2 << 12) | (u3 << 6) | u4;
          } else {
            u5 = u8Array[idx++] & 63;
            u0 = ((u0 & 1) << 30) | (u1 << 24) | (u2 << 18) | (u3 << 12) | (u4 << 6) | u5;
          }
        }
      }
      if (u0 < 0x10000) {
        str += String.fromCharCode(u0);
      } else {
        var ch = u0 - 0x10000;
        str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
      }
    }
  }
}

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function UTF8ToString(ptr) {
  return UTF8ArrayToString(HEAPU8,ptr);
}

// Copies the given Javascript String object 'str' to the given byte array at address 'outIdx',
// encoded in UTF8 form and null-terminated. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8 to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outU8Array: the array to copy to. Each index in this array is assumed to be one 8-byte element.
//   outIdx: The starting offset in the array to begin the copying.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=1, only the null terminator will be written and nothing else.
//                    maxBytesToWrite=0 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8Array(str, outU8Array, outIdx, maxBytesToWrite) {
  if (!(maxBytesToWrite > 0)) // Parameter maxBytesToWrite is not optional. Negative values, 0, null, undefined and false each don't write out any bytes.
    return 0;

  var startIdx = outIdx;
  var endIdx = outIdx + maxBytesToWrite - 1; // -1 for string null terminator.
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      if (outIdx >= endIdx) break;
      outU8Array[outIdx++] = u;
    } else if (u <= 0x7FF) {
      if (outIdx + 1 >= endIdx) break;
      outU8Array[outIdx++] = 0xC0 | (u >> 6);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0xFFFF) {
      if (outIdx + 2 >= endIdx) break;
      outU8Array[outIdx++] = 0xE0 | (u >> 12);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x1FFFFF) {
      if (outIdx + 3 >= endIdx) break;
      outU8Array[outIdx++] = 0xF0 | (u >> 18);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x3FFFFFF) {
      if (outIdx + 4 >= endIdx) break;
      outU8Array[outIdx++] = 0xF8 | (u >> 24);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else {
      if (outIdx + 5 >= endIdx) break;
      outU8Array[outIdx++] = 0xFC | (u >> 30);
      outU8Array[outIdx++] = 0x80 | ((u >> 24) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    }
  }
  // Null-terminate the pointer to the buffer.
  outU8Array[outIdx] = 0;
  return outIdx - startIdx;
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF8 form. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8 to compute the exact number of bytes (excluding null terminator) that this function will write.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8(str, outPtr, maxBytesToWrite) {
  return stringToUTF8Array(str, HEAPU8,outPtr, maxBytesToWrite);
}

// Returns the number of bytes the given Javascript string takes if encoded as a UTF8 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF8(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      ++len;
    } else if (u <= 0x7FF) {
      len += 2;
    } else if (u <= 0xFFFF) {
      len += 3;
    } else if (u <= 0x1FFFFF) {
      len += 4;
    } else if (u <= 0x3FFFFFF) {
      len += 5;
    } else {
      len += 6;
    }
  }
  return len;
}

// Given a pointer 'ptr' to a null-terminated UTF16LE-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

var UTF16Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-16le') : undefined;
function UTF16ToString(ptr) {
  var endPtr = ptr;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  var idx = endPtr >> 1;
  while (HEAP16[idx]) ++idx;
  endPtr = idx << 1;

  if (endPtr - ptr > 32 && UTF16Decoder) {
    return UTF16Decoder.decode(HEAPU8.subarray(ptr, endPtr));
  } else {
    var i = 0;

    var str = '';
    while (1) {
      var codeUnit = HEAP16[(((ptr)+(i*2))>>1)];
      if (codeUnit == 0) return str;
      ++i;
      // fromCharCode constructs a character from a UTF-16 code unit, so we can pass the UTF16 string right through.
      str += String.fromCharCode(codeUnit);
    }
  }
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF16 form. The copy will require at most str.length*4+2 bytes of space in the HEAP.
// Use the function lengthBytesUTF16() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=2, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<2 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF16(str, outPtr, maxBytesToWrite) {
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 2) return 0;
  maxBytesToWrite -= 2; // Null terminator.
  var startPtr = outPtr;
  var numCharsToWrite = (maxBytesToWrite < str.length*2) ? (maxBytesToWrite / 2) : str.length;
  for (var i = 0; i < numCharsToWrite; ++i) {
    // charCodeAt returns a UTF-16 encoded code unit, so it can be directly written to the HEAP.
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    HEAP16[((outPtr)>>1)]=codeUnit;
    outPtr += 2;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP16[((outPtr)>>1)]=0;
  return outPtr - startPtr;
}

// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF16(str) {
  return str.length*2;
}

function UTF32ToString(ptr) {
  var i = 0;

  var str = '';
  while (1) {
    var utf32 = HEAP32[(((ptr)+(i*4))>>2)];
    if (utf32 == 0)
      return str;
    ++i;
    // Gotcha: fromCharCode constructs a character from a UTF-16 encoded code (pair), not from a Unicode code point! So encode the code point to UTF-16 for constructing.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    if (utf32 >= 0x10000) {
      var ch = utf32 - 0x10000;
      str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
    } else {
      str += String.fromCharCode(utf32);
    }
  }
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF32 form. The copy will require at most str.length*4+4 bytes of space in the HEAP.
// Use the function lengthBytesUTF32() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=4, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<4 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF32(str, outPtr, maxBytesToWrite) {
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 4) return 0;
  var startPtr = outPtr;
  var endPtr = startPtr + maxBytesToWrite - 4;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) {
      var trailSurrogate = str.charCodeAt(++i);
      codeUnit = 0x10000 + ((codeUnit & 0x3FF) << 10) | (trailSurrogate & 0x3FF);
    }
    HEAP32[((outPtr)>>2)]=codeUnit;
    outPtr += 4;
    if (outPtr + 4 > endPtr) break;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP32[((outPtr)>>2)]=0;
  return outPtr - startPtr;
}

// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF32(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i);
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) ++i; // possibly a lead surrogate, so skip over the tail surrogate.
    len += 4;
  }

  return len;
}

// Allocate heap space for a JS string, and write it there.
// It is the responsibility of the caller to free() that memory.
function allocateUTF8(str) {
  var size = lengthBytesUTF8(str) + 1;
  var ret = _malloc(size);
  if (ret) stringToUTF8Array(str, HEAP8, ret, size);
  return ret;
}

// Allocate stack space for a JS string, and write it there.
function allocateUTF8OnStack(str) {
  var size = lengthBytesUTF8(str) + 1;
  var ret = stackAlloc(size);
  stringToUTF8Array(str, HEAP8, ret, size);
  return ret;
}

function demangle(func) {
  return func;
}

function demangleAll(text) {
  var regex =
    /__Z[\w\d_]+/g;
  return text.replace(regex,
    function(x) {
      var y = demangle(x);
      return x === y ? x : (x + ' [' + y + ']');
    });
}

function jsStackTrace() {
  var err = new Error();
  if (!err.stack) {
    // IE10+ special cases: It does have callstack info, but it is only populated if an Error object is thrown,
    // so try that as a special-case.
    try {
      throw new Error(0);
    } catch(e) {
      err = e;
    }
    if (!err.stack) {
      return '(no stack trace available)';
    }
  }
  return err.stack.toString();
}

function stackTrace() {
  var js = jsStackTrace();
  if (Module['extraStackTrace']) js += '\n' + Module['extraStackTrace']();
  return demangleAll(js);
}

// Memory management

var PAGE_SIZE = 16384;
var WASM_PAGE_SIZE = 65536;
var ASMJS_PAGE_SIZE = 16777216;
var MIN_TOTAL_MEMORY = 16777216;

function alignUp(x, multiple) {
  if (x % multiple > 0) {
    x += multiple - (x % multiple);
  }
  return x;
}

var HEAP,
/** @type {ArrayBuffer} */
  buffer,
/** @type {Int8Array} */
  HEAP8,
/** @type {Uint8Array} */
  HEAPU8,
/** @type {Int16Array} */
  HEAP16,
/** @type {Uint16Array} */
  HEAPU16,
/** @type {Int32Array} */
  HEAP32,
/** @type {Uint32Array} */
  HEAPU32,
/** @type {Float32Array} */
  HEAPF32,
/** @type {Float64Array} */
  HEAPF64;

function updateGlobalBuffer(buf) {
  Module['buffer'] = buffer = buf;
}

function updateGlobalBufferViews() {
  Module['HEAP8'] = HEAP8 = new Int8Array(buffer);
  Module['HEAP16'] = HEAP16 = new Int16Array(buffer);
  Module['HEAP32'] = HEAP32 = new Int32Array(buffer);
  Module['HEAPU8'] = HEAPU8 = new Uint8Array(buffer);
  Module['HEAPU16'] = HEAPU16 = new Uint16Array(buffer);
  Module['HEAPU32'] = HEAPU32 = new Uint32Array(buffer);
  Module['HEAPF32'] = HEAPF32 = new Float32Array(buffer);
  Module['HEAPF64'] = HEAPF64 = new Float64Array(buffer);
}

var STATIC_BASE, STATICTOP, staticSealed; // static area
var STACK_BASE, STACKTOP, STACK_MAX; // stack area
var DYNAMIC_BASE, DYNAMICTOP_PTR; // dynamic area handled by sbrk

  STATIC_BASE = STATICTOP = STACK_BASE = STACKTOP = STACK_MAX = DYNAMIC_BASE = DYNAMICTOP_PTR = 0;
  staticSealed = false;



function abortOnCannotGrowMemory() {
  abort('Cannot enlarge memory arrays. Either (1) compile with  -s TOTAL_MEMORY=X  with X higher than the current value ' + TOTAL_MEMORY + ', (2) compile with  -s ALLOW_MEMORY_GROWTH=1  which allows increasing the size at runtime but prevents some optimizations, (3) set Module.TOTAL_MEMORY to a higher value before the program runs, or (4) if you want malloc to return NULL (0) instead of this abort, compile with  -s ABORTING_MALLOC=0 ');
}


function enlargeMemory() {
  abortOnCannotGrowMemory();
}


var TOTAL_STACK = Module['TOTAL_STACK'] || 5242880;
var TOTAL_MEMORY = Module['TOTAL_MEMORY'] || 16777216;
if (TOTAL_MEMORY < TOTAL_STACK) Module.printErr('TOTAL_MEMORY should be larger than TOTAL_STACK, was ' + TOTAL_MEMORY + '! (TOTAL_STACK=' + TOTAL_STACK + ')');

// Initialize the runtime's memory



// Use a provided buffer, if there is one, or else allocate a new one
if (Module['buffer']) {
  buffer = Module['buffer'];
} else {
  // Use a WebAssembly memory where available
  {
    buffer = new ArrayBuffer(TOTAL_MEMORY);
  }
  Module['buffer'] = buffer;
}
updateGlobalBufferViews();


function getTotalMemory() {
  return TOTAL_MEMORY;
}

// Endianness check (note: assumes compiler arch was little-endian)
  HEAP32[0] = 0x63736d65; /* 'emsc' */
HEAP16[1] = 0x6373;
if (HEAPU8[2] !== 0x73 || HEAPU8[3] !== 0x63) throw 'Runtime error: expected the system to be little-endian!';

function callRuntimeCallbacks(callbacks) {
  while(callbacks.length > 0) {
    var callback = callbacks.shift();
    if (typeof callback == 'function') {
      callback();
      continue;
    }
    var func = callback.func;
    if (typeof func === 'number') {
      if (callback.arg === undefined) {
        Module['dynCall_v'](func);
      } else {
        Module['dynCall_vi'](func, callback.arg);
      }
    } else {
      func(callback.arg === undefined ? null : callback.arg);
    }
  }
}

var __ATPRERUN__  = []; // functions called before the runtime is initialized
var __ATINIT__    = []; // functions called during startup
var __ATMAIN__    = []; // functions called when main() is to be run
var __ATEXIT__    = []; // functions called during shutdown
var __ATPOSTRUN__ = []; // functions called after the runtime has exited

var runtimeInitialized = false;
var runtimeExited = false;


function preRun() {
  // compatibility - merge in anything from Module['preRun'] at this time
  if (Module['preRun']) {
    if (typeof Module['preRun'] == 'function') Module['preRun'] = [Module['preRun']];
    while (Module['preRun'].length) {
      addOnPreRun(Module['preRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPRERUN__);
}

function ensureInitRuntime() {
  if (runtimeInitialized) return;
  runtimeInitialized = true;
  callRuntimeCallbacks(__ATINIT__);
}

function preMain() {
  callRuntimeCallbacks(__ATMAIN__);
}

function exitRuntime() {
  callRuntimeCallbacks(__ATEXIT__);
  runtimeExited = true;
}

function postRun() {
  // compatibility - merge in anything from Module['postRun'] at this time
  if (Module['postRun']) {
    if (typeof Module['postRun'] == 'function') Module['postRun'] = [Module['postRun']];
    while (Module['postRun'].length) {
      addOnPostRun(Module['postRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPOSTRUN__);
}

function addOnPreRun(cb) {
  __ATPRERUN__.unshift(cb);
}

function addOnInit(cb) {
  __ATINIT__.unshift(cb);
}

function addOnPreMain(cb) {
  __ATMAIN__.unshift(cb);
}

function addOnExit(cb) {
  __ATEXIT__.unshift(cb);
}

function addOnPostRun(cb) {
  __ATPOSTRUN__.unshift(cb);
}

// Deprecated: This function should not be called because it is unsafe and does not provide
// a maximum length limit of how many bytes it is allowed to write. Prefer calling the
// function stringToUTF8Array() instead, which takes in a maximum length that can be used
// to be secure from out of bounds writes.
/** @deprecated */
function writeStringToMemory(string, buffer, dontAddNull) {
  warnOnce('writeStringToMemory is deprecated and should not be called! Use stringToUTF8() instead!');

  var /** @type {number} */ lastChar, /** @type {number} */ end;
  if (dontAddNull) {
    // stringToUTF8Array always appends null. If we don't want to do that, remember the
    // character that existed at the location where the null will be placed, and restore
    // that after the write (below).
    end = buffer + lengthBytesUTF8(string);
    lastChar = HEAP8[end];
  }
  stringToUTF8(string, buffer, Infinity);
  if (dontAddNull) HEAP8[end] = lastChar; // Restore the value under the null character.
}

function writeArrayToMemory(array, buffer) {
  HEAP8.set(array, buffer);
}

function writeAsciiToMemory(str, buffer, dontAddNull) {
  for (var i = 0; i < str.length; ++i) {
    HEAP8[((buffer++)>>0)]=str.charCodeAt(i);
  }
  // Null-terminate the pointer to the HEAP.
  if (!dontAddNull) HEAP8[((buffer)>>0)]=0;
}

function unSign(value, bits, ignore) {
  if (value >= 0) {
    return value;
  }
  return bits <= 32 ? 2*Math.abs(1 << (bits-1)) + value // Need some trickery, since if bits == 32, we are right at the limit of the bits JS uses in bitshifts
                    : Math.pow(2, bits)         + value;
}
function reSign(value, bits, ignore) {
  if (value <= 0) {
    return value;
  }
  var half = bits <= 32 ? Math.abs(1 << (bits-1)) // abs is needed if bits == 32
                        : Math.pow(2, bits-1);
  if (value >= half && (bits <= 32 || value > half)) { // for huge values, we can hit the precision limit and always get true here. so don't do that
                                                       // but, in general there is no perfect solution here. With 64-bit ints, we get rounding and errors
                                                       // TODO: In i64 mode 1, resign the two parts separately and safely
    value = -2*half + value; // Cannot bitshift half, as it may be at the limit of the bits JS uses in bitshifts
  }
  return value;
}


var Math_abs = Math.abs;
var Math_cos = Math.cos;
var Math_sin = Math.sin;
var Math_tan = Math.tan;
var Math_acos = Math.acos;
var Math_asin = Math.asin;
var Math_atan = Math.atan;
var Math_atan2 = Math.atan2;
var Math_exp = Math.exp;
var Math_log = Math.log;
var Math_sqrt = Math.sqrt;
var Math_ceil = Math.ceil;
var Math_floor = Math.floor;
var Math_pow = Math.pow;
var Math_imul = Math.imul;
var Math_fround = Math.fround;
var Math_round = Math.round;
var Math_min = Math.min;
var Math_max = Math.max;
var Math_clz32 = Math.clz32;
var Math_trunc = Math.trunc;

// A counter of dependencies for calling run(). If we need to
// do asynchronous work before running, increment this and
// decrement it. Incrementing must happen in a place like
// PRE_RUN_ADDITIONS (used by emcc to add file preloading).
// Note that you can add dependencies in preRun, even though
// it happens right before run - run will be postponed until
// the dependencies are met.
var runDependencies = 0;
var runDependencyWatcher = null;
var dependenciesFulfilled = null; // overridden to take different actions when all run dependencies are fulfilled

function getUniqueRunDependency(id) {
  return id;
}

function addRunDependency(id) {
  runDependencies++;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
}

function removeRunDependency(id) {
  runDependencies--;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (runDependencies == 0) {
    if (runDependencyWatcher !== null) {
      clearInterval(runDependencyWatcher);
      runDependencyWatcher = null;
    }
    if (dependenciesFulfilled) {
      var callback = dependenciesFulfilled;
      dependenciesFulfilled = null;
      callback(); // can add another dependenciesFulfilled
    }
  }
}

Module["preloadedImages"] = {}; // maps url to image data
Module["preloadedAudios"] = {}; // maps url to audio data



var memoryInitializer = null;






// Prefix of data URIs emitted by SINGLE_FILE and related options.
var dataURIPrefix = 'data:application/octet-stream;base64,';

// Indicates whether filename is a base64 data URI.
function isDataURI(filename) {
  return String.prototype.startsWith ?
      filename.startsWith(dataURIPrefix) :
      filename.indexOf(dataURIPrefix) === 0;
}





// === Body ===

var ASM_CONSTS = [];





STATIC_BASE = GLOBAL_BASE;

STATICTOP = STATIC_BASE + 3984;
/* global initializers */  __ATINIT__.push({ func: function() { __GLOBAL__sub_I_stmpct_cpp() } }, { func: function() { __GLOBAL__sub_I_bind_cpp() } });


memoryInitializer = "data:application/octet-stream;base64,GAQAAPsEAABABAAA6AQAAAgAAAAAAAAAGAQAACkFAABABAAAEQUAACAAAAAAAAAAQAQAADQFAAAIAAAAAAAAAEAEAABHBQAAIAAAAAAAAABABAAAXwUAAAgAAAAAAAAAQAQAAHEFAAAgAAAAAAAAAEAEAADMBQAACAAAAAAAAACsBAAApAYAAAAAAAB4AAAArAQAAJUGAAABAAAAeAAAAKwEAACBBgAAAAAAABAAAACsBAAAbAYAAAEAAAAQAAAArAQAAFgGAAAAAAAAOAAAAKwEAABDBgAAAQAAADgAAACsBAAAMAYAAAAAAABYAAAArAQAABwGAAABAAAAWAAAAMgEAAD6CwAAAAAAAAEAAAC4AQAAAAAAAMgEAAC7CwAAAAAAAAEAAAC4AQAAAAAAAMgEAABWCwAAAAAAAAEAAAC4AQAAAAAAABgEAABDCwAAGAQAACQLAAAYBAAABQsAABgEAADmCgAAGAQAAMcKAAAYBAAAqAoAABgEAACJCgAAGAQAAGoKAAAYBAAASwoAABgEAAAsCgAAGAQAAA0KAAAYBAAA7gkAABgEAADPCQAAGAQAAJULAAAYBAAAOQwAAEAEAACZDAAA2AEAAAAAAABABAAARgwAAOgBAAAAAAAAGAQAAGcMAABABAAAdAwAAMgBAAAAAAAAQAQAALsMAADAAQAAAAAAAEAEAADLDAAAAAIAAAAAAABABAAAAA0AANgBAAAAAAAAQAQAANwMAAAgAgAAAAAAAEAEAAAiDQAA2AEAAAAAAACQBAAASg0AAJAEAABMDQAAkAQAAE8NAACQBAAAUQ0AAJAEAABTDQAAkAQAAFUNAACQBAAAVw0AAJAEAABZDQAAkAQAAFsNAACQBAAAXQ0AAJAEAABfDQAAkAQAAGENAACQBAAAYw0AAJAEAABlDQAAQAQAAGcNAADIAQAAAAAAAAAAAAAQAAAAAQAAAAIAAAABAAAAAQAAAAAAAAAoAAAAAwAAAAQAAAABAAAAAQAAAAAAAAAgAAAAAwAAAAUAAAABAAAAAQAAAAAAAAA4AAAABgAAAAcAAAACAAAAAgAAAAAAAABIAAAAAwAAAAgAAAACAAAAAgAAAAAAAABYAAAACQAAAAoAAAADAAAAAwAAAAAAAABoAAAAAwAAAAsAAAADAAAAAwAAAAAAAAB4AAAADAAAAA0AAAAEAAAABAAAAIgAAAC4AgAAUAIAAIgAAAC4AgAAuAIAAIgAAAC4AgAAqAAAALgCAABQAgAAqAAAALgCAAC4AgAAqAAAALgCAADIAAAAuAIAAFACAADIAAAAuAIAALgCAADIAAAAuAIAAOgAAAC4AgAAUAIAAOgAAAC4AgAAuAIAAOgAAAC4AgAAAAAAAMgBAAAOAAAADwAAABAAAAARAAAAAQAAAAEAAAABAAAAAQAAAAAAAADwAQAADgAAABIAAAAQAAAAEQAAAAEAAAACAAAAAgAAAAIAAAAAAAAAAAIAABMAAAAUAAAABAAAAAAAAAAQAgAAEwAAABUAAAAEAAAAAAAAAEACAAAOAAAAFgAAABAAAAARAAAAAgAAAAAAAAAwAgAADgAAABcAAAAQAAAAEQAAAAMAAAAAAAAAwAIAAA4AAAAYAAAAEAAAABEAAAABAAAAAwAAAAMAAAADAAAATjZzdG1wY3Q4Y2ttc19oYnFFAE42c3RtcGN0MTBzdG1wY3RfYWxnRQBONnN0bXBjdDhja21zX2hicTRpbXBsRQA5Y2ttc19pbXBsAE42c3RtcGN0OGNrbXNfbGJxRQBONnN0bXBjdDhja21zX2xicTRpbXBsRQBONnN0bXBjdDdja21zX3VxRQBONnN0bXBjdDdja21zX3VxNGltcGxFAGFsbG9jYXRvcjxUPjo6YWxsb2NhdGUoc2l6ZV90IG4pICduJyBleGNlZWRzIG1heGltdW0gc3VwcG9ydGVkIHNpemUATjZzdG1wY3QyZ2tFAEdLAGlpAHYAdmkAaWlkAGluc2VydAB2aWlkAHF1YW50aWxlAGRpaWQAQ0tNU19IQlEAQ0tNU19MQlEAQ0tNU19VUQBQS042c3RtcGN0N2NrbXNfdXFFAFBONnN0bXBjdDdja21zX3VxRQBQS042c3RtcGN0OGNrbXNfbGJxRQBQTjZzdG1wY3Q4Y2ttc19sYnFFAFBLTjZzdG1wY3Q4Y2ttc19oYnFFAFBONnN0bXBjdDhja21zX2hicUUAUEtONnN0bXBjdDJna0UAUE42c3RtcGN0MmdrRQB2b2lkAGJvb2wAY2hhcgBzaWduZWQgY2hhcgB1bnNpZ25lZCBjaGFyAHNob3J0AHVuc2lnbmVkIHNob3J0AGludAB1bnNpZ25lZCBpbnQAbG9uZwB1bnNpZ25lZCBsb25nAGZsb2F0AGRvdWJsZQBzdGQ6OnN0cmluZwBzdGQ6OmJhc2ljX3N0cmluZzx1bnNpZ25lZCBjaGFyPgBzdGQ6OndzdHJpbmcAZW1zY3JpcHRlbjo6dmFsAGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PGNoYXI+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PHNpZ25lZCBjaGFyPgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzx1bnNpZ25lZCBjaGFyPgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzxzaG9ydD4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8dW5zaWduZWQgc2hvcnQ+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PGludD4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8dW5zaWduZWQgaW50PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzxsb25nPgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzx1bnNpZ25lZCBsb25nPgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzxpbnQ4X3Q+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PHVpbnQ4X3Q+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PGludDE2X3Q+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PHVpbnQxNl90PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzxpbnQzMl90PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzx1aW50MzJfdD4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8ZmxvYXQ+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PGRvdWJsZT4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8bG9uZyBkb3VibGU+AE4xMGVtc2NyaXB0ZW4xMW1lbW9yeV92aWV3SWVFRQBOMTBlbXNjcmlwdGVuMTFtZW1vcnlfdmlld0lkRUUATjEwZW1zY3JpcHRlbjExbWVtb3J5X3ZpZXdJZkVFAE4xMGVtc2NyaXB0ZW4xMW1lbW9yeV92aWV3SW1FRQBOMTBlbXNjcmlwdGVuMTFtZW1vcnlfdmlld0lsRUUATjEwZW1zY3JpcHRlbjExbWVtb3J5X3ZpZXdJakVFAE4xMGVtc2NyaXB0ZW4xMW1lbW9yeV92aWV3SWlFRQBOMTBlbXNjcmlwdGVuMTFtZW1vcnlfdmlld0l0RUUATjEwZW1zY3JpcHRlbjExbWVtb3J5X3ZpZXdJc0VFAE4xMGVtc2NyaXB0ZW4xMW1lbW9yeV92aWV3SWhFRQBOMTBlbXNjcmlwdGVuMTFtZW1vcnlfdmlld0lhRUUATjEwZW1zY3JpcHRlbjExbWVtb3J5X3ZpZXdJY0VFAE4xMGVtc2NyaXB0ZW4zdmFsRQBOU3QzX18yMTJiYXNpY19zdHJpbmdJd05TXzExY2hhcl90cmFpdHNJd0VFTlNfOWFsbG9jYXRvckl3RUVFRQBOU3QzX18yMjFfX2Jhc2ljX3N0cmluZ19jb21tb25JTGIxRUVFAE5TdDNfXzIxMmJhc2ljX3N0cmluZ0loTlNfMTFjaGFyX3RyYWl0c0loRUVOU185YWxsb2NhdG9ySWhFRUVFAE5TdDNfXzIxMmJhc2ljX3N0cmluZ0ljTlNfMTFjaGFyX3RyYWl0c0ljRUVOU185YWxsb2NhdG9ySWNFRUVFAFN0OWV4Y2VwdGlvbgBOMTBfX2N4eGFiaXYxMTZfX3NoaW1fdHlwZV9pbmZvRQBTdDl0eXBlX2luZm8ATjEwX19jeHhhYml2MTIwX19zaV9jbGFzc190eXBlX2luZm9FAE4xMF9fY3h4YWJpdjExN19fY2xhc3NfdHlwZV9pbmZvRQBTdDExbG9naWNfZXJyb3IAU3QxMmxlbmd0aF9lcnJvcgBOMTBfX2N4eGFiaXYxMTlfX3BvaW50ZXJfdHlwZV9pbmZvRQBOMTBfX2N4eGFiaXYxMTdfX3BiYXNlX3R5cGVfaW5mb0UATjEwX19jeHhhYml2MTIzX19mdW5kYW1lbnRhbF90eXBlX2luZm9FAHYARG4AYgBjAGgAYQBzAHQAaQBqAGwAbQBmAGQATjEwX19jeHhhYml2MTIxX192bWlfY2xhc3NfdHlwZV9pbmZvRQ==";





/* no memory initializer */
var tempDoublePtr = STATICTOP; STATICTOP += 16;

function copyTempFloat(ptr) { // functions, because inlining this code increases code size too much

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

}

function copyTempDouble(ptr) {

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

  HEAP8[tempDoublePtr+4] = HEAP8[ptr+4];

  HEAP8[tempDoublePtr+5] = HEAP8[ptr+5];

  HEAP8[tempDoublePtr+6] = HEAP8[ptr+6];

  HEAP8[tempDoublePtr+7] = HEAP8[ptr+7];

}

// {{PRE_LIBRARY}}


  function ___cxa_allocate_exception(size) {
      return _malloc(size);
    }

  function ___cxa_pure_virtual() {
      ABORT = true;
      throw 'Pure virtual function called!';
    }

  
  function __ZSt18uncaught_exceptionv() { // std::uncaught_exception()
      return !!__ZSt18uncaught_exceptionv.uncaught_exception;
    }
  
  
  
  var EXCEPTIONS={last:0,caught:[],infos:{},deAdjust:function (adjusted) {
        if (!adjusted || EXCEPTIONS.infos[adjusted]) return adjusted;
        for (var ptr in EXCEPTIONS.infos) {
          var info = EXCEPTIONS.infos[ptr];
          if (info.adjusted === adjusted) {
            return ptr;
          }
        }
        return adjusted;
      },addRef:function (ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        info.refcount++;
      },decRef:function (ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        assert(info.refcount > 0);
        info.refcount--;
        // A rethrown exception can reach refcount 0; it must not be discarded
        // Its next handler will clear the rethrown flag and addRef it, prior to
        // final decRef and destruction here
        if (info.refcount === 0 && !info.rethrown) {
          if (info.destructor) {
            Module['dynCall_vi'](info.destructor, ptr);
          }
          delete EXCEPTIONS.infos[ptr];
          ___cxa_free_exception(ptr);
        }
      },clearRef:function (ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        info.refcount = 0;
      }};
  function ___resumeException(ptr) {
      if (!EXCEPTIONS.last) { EXCEPTIONS.last = ptr; }
      throw ptr + " - Exception catching is disabled, this exception cannot be caught. Compile with -s DISABLE_EXCEPTION_CATCHING=0 or DISABLE_EXCEPTION_CATCHING=2 to catch.";
    }function ___cxa_find_matching_catch() {
      var thrown = EXCEPTIONS.last;
      if (!thrown) {
        // just pass through the null ptr
        return ((setTempRet0(0),0)|0);
      }
      var info = EXCEPTIONS.infos[thrown];
      var throwntype = info.type;
      if (!throwntype) {
        // just pass through the thrown ptr
        return ((setTempRet0(0),thrown)|0);
      }
      var typeArray = Array.prototype.slice.call(arguments);
  
      var pointer = Module['___cxa_is_pointer_type'](throwntype);
      // can_catch receives a **, add indirection
      if (!___cxa_find_matching_catch.buffer) ___cxa_find_matching_catch.buffer = _malloc(4);
      HEAP32[((___cxa_find_matching_catch.buffer)>>2)]=thrown;
      thrown = ___cxa_find_matching_catch.buffer;
      // The different catch blocks are denoted by different types.
      // Due to inheritance, those types may not precisely match the
      // type of the thrown object. Find one which matches, and
      // return the type of the catch block which should be called.
      for (var i = 0; i < typeArray.length; i++) {
        if (typeArray[i] && Module['___cxa_can_catch'](typeArray[i], throwntype, thrown)) {
          thrown = HEAP32[((thrown)>>2)]; // undo indirection
          info.adjusted = thrown;
          return ((setTempRet0(typeArray[i]),thrown)|0);
        }
      }
      // Shouldn't happen unless we have bogus data in typeArray
      // or encounter a type for which emscripten doesn't have suitable
      // typeinfo defined. Best-efforts match just in case.
      thrown = HEAP32[((thrown)>>2)]; // undo indirection
      return ((setTempRet0(throwntype),thrown)|0);
    }function ___cxa_throw(ptr, type, destructor) {
      EXCEPTIONS.infos[ptr] = {
        ptr: ptr,
        adjusted: ptr,
        type: type,
        destructor: destructor,
        refcount: 0,
        caught: false,
        rethrown: false
      };
      EXCEPTIONS.last = ptr;
      if (!("uncaught_exception" in __ZSt18uncaught_exceptionv)) {
        __ZSt18uncaught_exceptionv.uncaught_exception = 1;
      } else {
        __ZSt18uncaught_exceptionv.uncaught_exception++;
      }
      throw ptr + " - Exception catching is disabled, this exception cannot be caught. Compile with -s DISABLE_EXCEPTION_CATCHING=0 or DISABLE_EXCEPTION_CATCHING=2 to catch.";
    }

  function ___gxx_personality_v0() {
    }

  
  function getShiftFromSize(size) {
      switch (size) {
          case 1: return 0;
          case 2: return 1;
          case 4: return 2;
          case 8: return 3;
          default:
              throw new TypeError('Unknown type size: ' + size);
      }
    }
  
  
  
  function embind_init_charCodes() {
      var codes = new Array(256);
      for (var i = 0; i < 256; ++i) {
          codes[i] = String.fromCharCode(i);
      }
      embind_charCodes = codes;
    }var embind_charCodes=undefined;function readLatin1String(ptr) {
      var ret = "";
      var c = ptr;
      while (HEAPU8[c]) {
          ret += embind_charCodes[HEAPU8[c++]];
      }
      return ret;
    }
  
  
  var awaitingDependencies={};
  
  var registeredTypes={};
  
  var typeDependencies={};
  
  
  
  
  
  
  var char_0=48;
  
  var char_9=57;function makeLegalFunctionName(name) {
      if (undefined === name) {
          return '_unknown';
      }
      name = name.replace(/[^a-zA-Z0-9_]/g, '$');
      var f = name.charCodeAt(0);
      if (f >= char_0 && f <= char_9) {
          return '_' + name;
      } else {
          return name;
      }
    }function createNamedFunction(name, body) {
      name = makeLegalFunctionName(name);
      /*jshint evil:true*/
      return new Function(
          "body",
          "return function " + name + "() {\n" +
          "    \"use strict\";" +
          "    return body.apply(this, arguments);\n" +
          "};\n"
      )(body);
    }function extendError(baseErrorType, errorName) {
      var errorClass = createNamedFunction(errorName, function(message) {
          this.name = errorName;
          this.message = message;
  
          var stack = (new Error(message)).stack;
          if (stack !== undefined) {
              this.stack = this.toString() + '\n' +
                  stack.replace(/^Error(:[^\n]*)?\n/, '');
          }
      });
      errorClass.prototype = Object.create(baseErrorType.prototype);
      errorClass.prototype.constructor = errorClass;
      errorClass.prototype.toString = function() {
          if (this.message === undefined) {
              return this.name;
          } else {
              return this.name + ': ' + this.message;
          }
      };
  
      return errorClass;
    }var BindingError=undefined;function throwBindingError(message) {
      throw new BindingError(message);
    }
  
  
  
  var InternalError=undefined;function throwInternalError(message) {
      throw new InternalError(message);
    }function whenDependentTypesAreResolved(myTypes, dependentTypes, getTypeConverters) {
      myTypes.forEach(function(type) {
          typeDependencies[type] = dependentTypes;
      });
  
      function onComplete(typeConverters) {
          var myTypeConverters = getTypeConverters(typeConverters);
          if (myTypeConverters.length !== myTypes.length) {
              throwInternalError('Mismatched type converter count');
          }
          for (var i = 0; i < myTypes.length; ++i) {
              registerType(myTypes[i], myTypeConverters[i]);
          }
      }
  
      var typeConverters = new Array(dependentTypes.length);
      var unregisteredTypes = [];
      var registered = 0;
      dependentTypes.forEach(function(dt, i) {
          if (registeredTypes.hasOwnProperty(dt)) {
              typeConverters[i] = registeredTypes[dt];
          } else {
              unregisteredTypes.push(dt);
              if (!awaitingDependencies.hasOwnProperty(dt)) {
                  awaitingDependencies[dt] = [];
              }
              awaitingDependencies[dt].push(function() {
                  typeConverters[i] = registeredTypes[dt];
                  ++registered;
                  if (registered === unregisteredTypes.length) {
                      onComplete(typeConverters);
                  }
              });
          }
      });
      if (0 === unregisteredTypes.length) {
          onComplete(typeConverters);
      }
    }function registerType(rawType, registeredInstance, options) {
      options = options || {};
  
      if (!('argPackAdvance' in registeredInstance)) {
          throw new TypeError('registerType registeredInstance requires argPackAdvance');
      }
  
      var name = registeredInstance.name;
      if (!rawType) {
          throwBindingError('type "' + name + '" must have a positive integer typeid pointer');
      }
      if (registeredTypes.hasOwnProperty(rawType)) {
          if (options.ignoreDuplicateRegistrations) {
              return;
          } else {
              throwBindingError("Cannot register type '" + name + "' twice");
          }
      }
  
      registeredTypes[rawType] = registeredInstance;
      delete typeDependencies[rawType];
  
      if (awaitingDependencies.hasOwnProperty(rawType)) {
          var callbacks = awaitingDependencies[rawType];
          delete awaitingDependencies[rawType];
          callbacks.forEach(function(cb) {
              cb();
          });
      }
    }function __embind_register_bool(rawType, name, size, trueValue, falseValue) {
      var shift = getShiftFromSize(size);
  
      name = readLatin1String(name);
      registerType(rawType, {
          name: name,
          'fromWireType': function(wt) {
              // ambiguous emscripten ABI: sometimes return values are
              // true or false, and sometimes integers (0 or 1)
              return !!wt;
          },
          'toWireType': function(destructors, o) {
              return o ? trueValue : falseValue;
          },
          'argPackAdvance': 8,
          'readValueFromPointer': function(pointer) {
              // TODO: if heap is fixed (like in asm.js) this could be executed outside
              var heap;
              if (size === 1) {
                  heap = HEAP8;
              } else if (size === 2) {
                  heap = HEAP16;
              } else if (size === 4) {
                  heap = HEAP32;
              } else {
                  throw new TypeError("Unknown boolean type size: " + name);
              }
              return this['fromWireType'](heap[pointer >> shift]);
          },
          destructorFunction: null, // This type does not need a destructor
      });
    }

  
  
  
  function ClassHandle_isAliasOf(other) {
      if (!(this instanceof ClassHandle)) {
          return false;
      }
      if (!(other instanceof ClassHandle)) {
          return false;
      }
  
      var leftClass = this.$$.ptrType.registeredClass;
      var left = this.$$.ptr;
      var rightClass = other.$$.ptrType.registeredClass;
      var right = other.$$.ptr;
  
      while (leftClass.baseClass) {
          left = leftClass.upcast(left);
          leftClass = leftClass.baseClass;
      }
  
      while (rightClass.baseClass) {
          right = rightClass.upcast(right);
          rightClass = rightClass.baseClass;
      }
  
      return leftClass === rightClass && left === right;
    }
  
  
  function shallowCopyInternalPointer(o) {
      return {
          count: o.count,
          deleteScheduled: o.deleteScheduled,
          preservePointerOnDelete: o.preservePointerOnDelete,
          ptr: o.ptr,
          ptrType: o.ptrType,
          smartPtr: o.smartPtr,
          smartPtrType: o.smartPtrType,
      };
    }
  
  function throwInstanceAlreadyDeleted(obj) {
      function getInstanceTypeName(handle) {
        return handle.$$.ptrType.registeredClass.name;
      }
      throwBindingError(getInstanceTypeName(obj) + ' instance already deleted');
    }function ClassHandle_clone() {
      if (!this.$$.ptr) {
          throwInstanceAlreadyDeleted(this);
      }
  
      if (this.$$.preservePointerOnDelete) {
          this.$$.count.value += 1;
          return this;
      } else {
          var clone = Object.create(Object.getPrototypeOf(this), {
              $$: {
                  value: shallowCopyInternalPointer(this.$$),
              }
          });
  
          clone.$$.count.value += 1;
          clone.$$.deleteScheduled = false;
          return clone;
      }
    }
  
  
  function runDestructor(handle) {
      var $$ = handle.$$;
      if ($$.smartPtr) {
          $$.smartPtrType.rawDestructor($$.smartPtr);
      } else {
          $$.ptrType.registeredClass.rawDestructor($$.ptr);
      }
    }function ClassHandle_delete() {
      if (!this.$$.ptr) {
          throwInstanceAlreadyDeleted(this);
      }
  
      if (this.$$.deleteScheduled && !this.$$.preservePointerOnDelete) {
          throwBindingError('Object already scheduled for deletion');
      }
  
      this.$$.count.value -= 1;
      var toDelete = 0 === this.$$.count.value;
      if (toDelete) {
          runDestructor(this);
      }
      if (!this.$$.preservePointerOnDelete) {
          this.$$.smartPtr = undefined;
          this.$$.ptr = undefined;
      }
    }
  
  function ClassHandle_isDeleted() {
      return !this.$$.ptr;
    }
  
  
  var delayFunction=undefined;
  
  var deletionQueue=[];
  
  function flushPendingDeletes() {
      while (deletionQueue.length) {
          var obj = deletionQueue.pop();
          obj.$$.deleteScheduled = false;
          obj['delete']();
      }
    }function ClassHandle_deleteLater() {
      if (!this.$$.ptr) {
          throwInstanceAlreadyDeleted(this);
      }
      if (this.$$.deleteScheduled && !this.$$.preservePointerOnDelete) {
          throwBindingError('Object already scheduled for deletion');
      }
      deletionQueue.push(this);
      if (deletionQueue.length === 1 && delayFunction) {
          delayFunction(flushPendingDeletes);
      }
      this.$$.deleteScheduled = true;
      return this;
    }function init_ClassHandle() {
      ClassHandle.prototype['isAliasOf'] = ClassHandle_isAliasOf;
      ClassHandle.prototype['clone'] = ClassHandle_clone;
      ClassHandle.prototype['delete'] = ClassHandle_delete;
      ClassHandle.prototype['isDeleted'] = ClassHandle_isDeleted;
      ClassHandle.prototype['deleteLater'] = ClassHandle_deleteLater;
    }function ClassHandle() {
    }
  
  var registeredPointers={};
  
  
  function ensureOverloadTable(proto, methodName, humanName) {
      if (undefined === proto[methodName].overloadTable) {
          var prevFunc = proto[methodName];
          // Inject an overload resolver function that routes to the appropriate overload based on the number of arguments.
          proto[methodName] = function() {
              // TODO This check can be removed in -O3 level "unsafe" optimizations.
              if (!proto[methodName].overloadTable.hasOwnProperty(arguments.length)) {
                  throwBindingError("Function '" + humanName + "' called with an invalid number of arguments (" + arguments.length + ") - expects one of (" + proto[methodName].overloadTable + ")!");
              }
              return proto[methodName].overloadTable[arguments.length].apply(this, arguments);
          };
          // Move the previous function into the overload table.
          proto[methodName].overloadTable = [];
          proto[methodName].overloadTable[prevFunc.argCount] = prevFunc;
      }
    }function exposePublicSymbol(name, value, numArguments) {
      if (Module.hasOwnProperty(name)) {
          if (undefined === numArguments || (undefined !== Module[name].overloadTable && undefined !== Module[name].overloadTable[numArguments])) {
              throwBindingError("Cannot register public name '" + name + "' twice");
          }
  
          // We are exposing a function with the same name as an existing function. Create an overload table and a function selector
          // that routes between the two.
          ensureOverloadTable(Module, name, name);
          if (Module.hasOwnProperty(numArguments)) {
              throwBindingError("Cannot register multiple overloads of a function with the same number of arguments (" + numArguments + ")!");
          }
          // Add the new function into the overload table.
          Module[name].overloadTable[numArguments] = value;
      }
      else {
          Module[name] = value;
          if (undefined !== numArguments) {
              Module[name].numArguments = numArguments;
          }
      }
    }
  
  function RegisteredClass(
      name,
      constructor,
      instancePrototype,
      rawDestructor,
      baseClass,
      getActualType,
      upcast,
      downcast
    ) {
      this.name = name;
      this.constructor = constructor;
      this.instancePrototype = instancePrototype;
      this.rawDestructor = rawDestructor;
      this.baseClass = baseClass;
      this.getActualType = getActualType;
      this.upcast = upcast;
      this.downcast = downcast;
      this.pureVirtualFunctions = [];
    }
  
  
  
  function upcastPointer(ptr, ptrClass, desiredClass) {
      while (ptrClass !== desiredClass) {
          if (!ptrClass.upcast) {
              throwBindingError("Expected null or instance of " + desiredClass.name + ", got an instance of " + ptrClass.name);
          }
          ptr = ptrClass.upcast(ptr);
          ptrClass = ptrClass.baseClass;
      }
      return ptr;
    }function constNoSmartPtrRawPointerToWireType(destructors, handle) {
      if (handle === null) {
          if (this.isReference) {
              throwBindingError('null is not a valid ' + this.name);
          }
          return 0;
      }
  
      if (!handle.$$) {
          throwBindingError('Cannot pass "' + _embind_repr(handle) + '" as a ' + this.name);
      }
      if (!handle.$$.ptr) {
          throwBindingError('Cannot pass deleted object as a pointer of type ' + this.name);
      }
      var handleClass = handle.$$.ptrType.registeredClass;
      var ptr = upcastPointer(handle.$$.ptr, handleClass, this.registeredClass);
      return ptr;
    }
  
  function genericPointerToWireType(destructors, handle) {
      var ptr;
      if (handle === null) {
          if (this.isReference) {
              throwBindingError('null is not a valid ' + this.name);
          }
  
          if (this.isSmartPointer) {
              ptr = this.rawConstructor();
              if (destructors !== null) {
                  destructors.push(this.rawDestructor, ptr);
              }
              return ptr;
          } else {
              return 0;
          }
      }
  
      if (!handle.$$) {
          throwBindingError('Cannot pass "' + _embind_repr(handle) + '" as a ' + this.name);
      }
      if (!handle.$$.ptr) {
          throwBindingError('Cannot pass deleted object as a pointer of type ' + this.name);
      }
      if (!this.isConst && handle.$$.ptrType.isConst) {
          throwBindingError('Cannot convert argument of type ' + (handle.$$.smartPtrType ? handle.$$.smartPtrType.name : handle.$$.ptrType.name) + ' to parameter type ' + this.name);
      }
      var handleClass = handle.$$.ptrType.registeredClass;
      ptr = upcastPointer(handle.$$.ptr, handleClass, this.registeredClass);
  
      if (this.isSmartPointer) {
          // TODO: this is not strictly true
          // We could support BY_EMVAL conversions from raw pointers to smart pointers
          // because the smart pointer can hold a reference to the handle
          if (undefined === handle.$$.smartPtr) {
              throwBindingError('Passing raw pointer to smart pointer is illegal');
          }
  
          switch (this.sharingPolicy) {
              case 0: // NONE
                  // no upcasting
                  if (handle.$$.smartPtrType === this) {
                      ptr = handle.$$.smartPtr;
                  } else {
                      throwBindingError('Cannot convert argument of type ' + (handle.$$.smartPtrType ? handle.$$.smartPtrType.name : handle.$$.ptrType.name) + ' to parameter type ' + this.name);
                  }
                  break;
  
              case 1: // INTRUSIVE
                  ptr = handle.$$.smartPtr;
                  break;
  
              case 2: // BY_EMVAL
                  if (handle.$$.smartPtrType === this) {
                      ptr = handle.$$.smartPtr;
                  } else {
                      var clonedHandle = handle['clone']();
                      ptr = this.rawShare(
                          ptr,
                          __emval_register(function() {
                              clonedHandle['delete']();
                          })
                      );
                      if (destructors !== null) {
                          destructors.push(this.rawDestructor, ptr);
                      }
                  }
                  break;
  
              default:
                  throwBindingError('Unsupporting sharing policy');
          }
      }
      return ptr;
    }
  
  function nonConstNoSmartPtrRawPointerToWireType(destructors, handle) {
      if (handle === null) {
          if (this.isReference) {
              throwBindingError('null is not a valid ' + this.name);
          }
          return 0;
      }
  
      if (!handle.$$) {
          throwBindingError('Cannot pass "' + _embind_repr(handle) + '" as a ' + this.name);
      }
      if (!handle.$$.ptr) {
          throwBindingError('Cannot pass deleted object as a pointer of type ' + this.name);
      }
      if (handle.$$.ptrType.isConst) {
          throwBindingError('Cannot convert argument of type ' + handle.$$.ptrType.name + ' to parameter type ' + this.name);
      }
      var handleClass = handle.$$.ptrType.registeredClass;
      var ptr = upcastPointer(handle.$$.ptr, handleClass, this.registeredClass);
      return ptr;
    }
  
  
  function simpleReadValueFromPointer(pointer) {
      return this['fromWireType'](HEAPU32[pointer >> 2]);
    }
  
  function RegisteredPointer_getPointee(ptr) {
      if (this.rawGetPointee) {
          ptr = this.rawGetPointee(ptr);
      }
      return ptr;
    }
  
  function RegisteredPointer_destructor(ptr) {
      if (this.rawDestructor) {
          this.rawDestructor(ptr);
      }
    }
  
  function RegisteredPointer_deleteObject(handle) {
      if (handle !== null) {
          handle['delete']();
      }
    }
  
  
  function downcastPointer(ptr, ptrClass, desiredClass) {
      if (ptrClass === desiredClass) {
          return ptr;
      }
      if (undefined === desiredClass.baseClass) {
          return null; // no conversion
      }
  
      var rv = downcastPointer(ptr, ptrClass, desiredClass.baseClass);
      if (rv === null) {
          return null;
      }
      return desiredClass.downcast(rv);
    }
  
  
  
  
  function getInheritedInstanceCount() {
      return Object.keys(registeredInstances).length;
    }
  
  function getLiveInheritedInstances() {
      var rv = [];
      for (var k in registeredInstances) {
          if (registeredInstances.hasOwnProperty(k)) {
              rv.push(registeredInstances[k]);
          }
      }
      return rv;
    }
  
  function setDelayFunction(fn) {
      delayFunction = fn;
      if (deletionQueue.length && delayFunction) {
          delayFunction(flushPendingDeletes);
      }
    }function init_embind() {
      Module['getInheritedInstanceCount'] = getInheritedInstanceCount;
      Module['getLiveInheritedInstances'] = getLiveInheritedInstances;
      Module['flushPendingDeletes'] = flushPendingDeletes;
      Module['setDelayFunction'] = setDelayFunction;
    }var registeredInstances={};
  
  function getBasestPointer(class_, ptr) {
      if (ptr === undefined) {
          throwBindingError('ptr should not be undefined');
      }
      while (class_.baseClass) {
          ptr = class_.upcast(ptr);
          class_ = class_.baseClass;
      }
      return ptr;
    }function getInheritedInstance(class_, ptr) {
      ptr = getBasestPointer(class_, ptr);
      return registeredInstances[ptr];
    }
  
  function makeClassHandle(prototype, record) {
      if (!record.ptrType || !record.ptr) {
          throwInternalError('makeClassHandle requires ptr and ptrType');
      }
      var hasSmartPtrType = !!record.smartPtrType;
      var hasSmartPtr = !!record.smartPtr;
      if (hasSmartPtrType !== hasSmartPtr) {
          throwInternalError('Both smartPtrType and smartPtr must be specified');
      }
      record.count = { value: 1 };
      return Object.create(prototype, {
          $$: {
              value: record,
          },
      });
    }function RegisteredPointer_fromWireType(ptr) {
      // ptr is a raw pointer (or a raw smartpointer)
  
      // rawPointer is a maybe-null raw pointer
      var rawPointer = this.getPointee(ptr);
      if (!rawPointer) {
          this.destructor(ptr);
          return null;
      }
  
      var registeredInstance = getInheritedInstance(this.registeredClass, rawPointer);
      if (undefined !== registeredInstance) {
          // JS object has been neutered, time to repopulate it
          if (0 === registeredInstance.$$.count.value) {
              registeredInstance.$$.ptr = rawPointer;
              registeredInstance.$$.smartPtr = ptr;
              return registeredInstance['clone']();
          } else {
              // else, just increment reference count on existing object
              // it already has a reference to the smart pointer
              var rv = registeredInstance['clone']();
              this.destructor(ptr);
              return rv;
          }
      }
  
      function makeDefaultHandle() {
          if (this.isSmartPointer) {
              return makeClassHandle(this.registeredClass.instancePrototype, {
                  ptrType: this.pointeeType,
                  ptr: rawPointer,
                  smartPtrType: this,
                  smartPtr: ptr,
              });
          } else {
              return makeClassHandle(this.registeredClass.instancePrototype, {
                  ptrType: this,
                  ptr: ptr,
              });
          }
      }
  
      var actualType = this.registeredClass.getActualType(rawPointer);
      var registeredPointerRecord = registeredPointers[actualType];
      if (!registeredPointerRecord) {
          return makeDefaultHandle.call(this);
      }
  
      var toType;
      if (this.isConst) {
          toType = registeredPointerRecord.constPointerType;
      } else {
          toType = registeredPointerRecord.pointerType;
      }
      var dp = downcastPointer(
          rawPointer,
          this.registeredClass,
          toType.registeredClass);
      if (dp === null) {
          return makeDefaultHandle.call(this);
      }
      if (this.isSmartPointer) {
          return makeClassHandle(toType.registeredClass.instancePrototype, {
              ptrType: toType,
              ptr: dp,
              smartPtrType: this,
              smartPtr: ptr,
          });
      } else {
          return makeClassHandle(toType.registeredClass.instancePrototype, {
              ptrType: toType,
              ptr: dp,
          });
      }
    }function init_RegisteredPointer() {
      RegisteredPointer.prototype.getPointee = RegisteredPointer_getPointee;
      RegisteredPointer.prototype.destructor = RegisteredPointer_destructor;
      RegisteredPointer.prototype['argPackAdvance'] = 8;
      RegisteredPointer.prototype['readValueFromPointer'] = simpleReadValueFromPointer;
      RegisteredPointer.prototype['deleteObject'] = RegisteredPointer_deleteObject;
      RegisteredPointer.prototype['fromWireType'] = RegisteredPointer_fromWireType;
    }function RegisteredPointer(
      name,
      registeredClass,
      isReference,
      isConst,
  
      // smart pointer properties
      isSmartPointer,
      pointeeType,
      sharingPolicy,
      rawGetPointee,
      rawConstructor,
      rawShare,
      rawDestructor
    ) {
      this.name = name;
      this.registeredClass = registeredClass;
      this.isReference = isReference;
      this.isConst = isConst;
  
      // smart pointer properties
      this.isSmartPointer = isSmartPointer;
      this.pointeeType = pointeeType;
      this.sharingPolicy = sharingPolicy;
      this.rawGetPointee = rawGetPointee;
      this.rawConstructor = rawConstructor;
      this.rawShare = rawShare;
      this.rawDestructor = rawDestructor;
  
      if (!isSmartPointer && registeredClass.baseClass === undefined) {
          if (isConst) {
              this['toWireType'] = constNoSmartPtrRawPointerToWireType;
              this.destructorFunction = null;
          } else {
              this['toWireType'] = nonConstNoSmartPtrRawPointerToWireType;
              this.destructorFunction = null;
          }
      } else {
          this['toWireType'] = genericPointerToWireType;
          // Here we must leave this.destructorFunction undefined, since whether genericPointerToWireType returns
          // a pointer that needs to be freed up is runtime-dependent, and cannot be evaluated at registration time.
          // TODO: Create an alternative mechanism that allows removing the use of var destructors = []; array in
          //       craftInvokerFunction altogether.
      }
    }
  
  function replacePublicSymbol(name, value, numArguments) {
      if (!Module.hasOwnProperty(name)) {
          throwInternalError('Replacing nonexistant public symbol');
      }
      // If there's an overload table for this symbol, replace the symbol in the overload table instead.
      if (undefined !== Module[name].overloadTable && undefined !== numArguments) {
          Module[name].overloadTable[numArguments] = value;
      }
      else {
          Module[name] = value;
          Module[name].argCount = numArguments;
      }
    }
  
  function embind__requireFunction(signature, rawFunction) {
      signature = readLatin1String(signature);
  
      function makeDynCaller(dynCall) {
          var args = [];
          for (var i = 1; i < signature.length; ++i) {
              args.push('a' + i);
          }
  
          var name = 'dynCall_' + signature + '_' + rawFunction;
          var body = 'return function ' + name + '(' + args.join(', ') + ') {\n';
          body    += '    return dynCall(rawFunction' + (args.length ? ', ' : '') + args.join(', ') + ');\n';
          body    += '};\n';
  
          return (new Function('dynCall', 'rawFunction', body))(dynCall, rawFunction);
      }
  
      var fp;
      if (Module['FUNCTION_TABLE_' + signature] !== undefined) {
          fp = Module['FUNCTION_TABLE_' + signature][rawFunction];
      } else if (typeof FUNCTION_TABLE !== "undefined") {
          fp = FUNCTION_TABLE[rawFunction];
      } else {
          // asm.js does not give direct access to the function tables,
          // and thus we must go through the dynCall interface which allows
          // calling into a signature's function table by pointer value.
          //
          // https://github.com/dherman/asm.js/issues/83
          //
          // This has three main penalties:
          // - dynCall is another function call in the path from JavaScript to C++.
          // - JITs may not predict through the function table indirection at runtime.
          var dc = Module["asm"]['dynCall_' + signature];
          if (dc === undefined) {
              // We will always enter this branch if the signature
              // contains 'f' and PRECISE_F32 is not enabled.
              //
              // Try again, replacing 'f' with 'd'.
              dc = Module["asm"]['dynCall_' + signature.replace(/f/g, 'd')];
              if (dc === undefined) {
                  throwBindingError("No dynCall invoker for signature: " + signature);
              }
          }
          fp = makeDynCaller(dc);
      }
  
      if (typeof fp !== "function") {
          throwBindingError("unknown function pointer with signature " + signature + ": " + rawFunction);
      }
      return fp;
    }
  
  
  var UnboundTypeError=undefined;
  
  function getTypeName(type) {
      var ptr = ___getTypeName(type);
      var rv = readLatin1String(ptr);
      _free(ptr);
      return rv;
    }function throwUnboundTypeError(message, types) {
      var unboundTypes = [];
      var seen = {};
      function visit(type) {
          if (seen[type]) {
              return;
          }
          if (registeredTypes[type]) {
              return;
          }
          if (typeDependencies[type]) {
              typeDependencies[type].forEach(visit);
              return;
          }
          unboundTypes.push(type);
          seen[type] = true;
      }
      types.forEach(visit);
  
      throw new UnboundTypeError(message + ': ' + unboundTypes.map(getTypeName).join([', ']));
    }function __embind_register_class(
      rawType,
      rawPointerType,
      rawConstPointerType,
      baseClassRawType,
      getActualTypeSignature,
      getActualType,
      upcastSignature,
      upcast,
      downcastSignature,
      downcast,
      name,
      destructorSignature,
      rawDestructor
    ) {
      name = readLatin1String(name);
      getActualType = embind__requireFunction(getActualTypeSignature, getActualType);
      if (upcast) {
          upcast = embind__requireFunction(upcastSignature, upcast);
      }
      if (downcast) {
          downcast = embind__requireFunction(downcastSignature, downcast);
      }
      rawDestructor = embind__requireFunction(destructorSignature, rawDestructor);
      var legalFunctionName = makeLegalFunctionName(name);
  
      exposePublicSymbol(legalFunctionName, function() {
          // this code cannot run if baseClassRawType is zero
          throwUnboundTypeError('Cannot construct ' + name + ' due to unbound types', [baseClassRawType]);
      });
  
      whenDependentTypesAreResolved(
          [rawType, rawPointerType, rawConstPointerType],
          baseClassRawType ? [baseClassRawType] : [],
          function(base) {
              base = base[0];
  
              var baseClass;
              var basePrototype;
              if (baseClassRawType) {
                  baseClass = base.registeredClass;
                  basePrototype = baseClass.instancePrototype;
              } else {
                  basePrototype = ClassHandle.prototype;
              }
  
              var constructor = createNamedFunction(legalFunctionName, function() {
                  if (Object.getPrototypeOf(this) !== instancePrototype) {
                      throw new BindingError("Use 'new' to construct " + name);
                  }
                  if (undefined === registeredClass.constructor_body) {
                      throw new BindingError(name + " has no accessible constructor");
                  }
                  var body = registeredClass.constructor_body[arguments.length];
                  if (undefined === body) {
                      throw new BindingError("Tried to invoke ctor of " + name + " with invalid number of parameters (" + arguments.length + ") - expected (" + Object.keys(registeredClass.constructor_body).toString() + ") parameters instead!");
                  }
                  return body.apply(this, arguments);
              });
  
              var instancePrototype = Object.create(basePrototype, {
                  constructor: { value: constructor },
              });
  
              constructor.prototype = instancePrototype;
  
              var registeredClass = new RegisteredClass(
                  name,
                  constructor,
                  instancePrototype,
                  rawDestructor,
                  baseClass,
                  getActualType,
                  upcast,
                  downcast);
  
              var referenceConverter = new RegisteredPointer(
                  name,
                  registeredClass,
                  true,
                  false,
                  false);
  
              var pointerConverter = new RegisteredPointer(
                  name + '*',
                  registeredClass,
                  false,
                  false,
                  false);
  
              var constPointerConverter = new RegisteredPointer(
                  name + ' const*',
                  registeredClass,
                  false,
                  true,
                  false);
  
              registeredPointers[rawType] = {
                  pointerType: pointerConverter,
                  constPointerType: constPointerConverter
              };
  
              replacePublicSymbol(legalFunctionName, constructor);
  
              return [referenceConverter, pointerConverter, constPointerConverter];
          }
      );
    }

  
  function heap32VectorToArray(count, firstElement) {
      var array = [];
      for (var i = 0; i < count; i++) {
          array.push(HEAP32[(firstElement >> 2) + i]);
      }
      return array;
    }
  
  function runDestructors(destructors) {
      while (destructors.length) {
          var ptr = destructors.pop();
          var del = destructors.pop();
          del(ptr);
      }
    }function __embind_register_class_constructor(
      rawClassType,
      argCount,
      rawArgTypesAddr,
      invokerSignature,
      invoker,
      rawConstructor
    ) {
      var rawArgTypes = heap32VectorToArray(argCount, rawArgTypesAddr);
      invoker = embind__requireFunction(invokerSignature, invoker);
  
      whenDependentTypesAreResolved([], [rawClassType], function(classType) {
          classType = classType[0];
          var humanName = 'constructor ' + classType.name;
  
          if (undefined === classType.registeredClass.constructor_body) {
              classType.registeredClass.constructor_body = [];
          }
          if (undefined !== classType.registeredClass.constructor_body[argCount - 1]) {
              throw new BindingError("Cannot register multiple constructors with identical number of parameters (" + (argCount-1) + ") for class '" + classType.name + "'! Overload resolution is currently only performed using the parameter count, not actual type info!");
          }
          classType.registeredClass.constructor_body[argCount - 1] = function unboundTypeHandler() {
              throwUnboundTypeError('Cannot construct ' + classType.name + ' due to unbound types', rawArgTypes);
          };
  
          whenDependentTypesAreResolved([], rawArgTypes, function(argTypes) {
              classType.registeredClass.constructor_body[argCount - 1] = function constructor_body() {
                  if (arguments.length !== argCount - 1) {
                      throwBindingError(humanName + ' called with ' + arguments.length + ' arguments, expected ' + (argCount-1));
                  }
                  var destructors = [];
                  var args = new Array(argCount);
                  args[0] = rawConstructor;
                  for (var i = 1; i < argCount; ++i) {
                      args[i] = argTypes[i]['toWireType'](destructors, arguments[i - 1]);
                  }
  
                  var ptr = invoker.apply(null, args);
                  runDestructors(destructors);
  
                  return argTypes[0]['fromWireType'](ptr);
              };
              return [];
          });
          return [];
      });
    }

  
  
  function new_(constructor, argumentList) {
      if (!(constructor instanceof Function)) {
          throw new TypeError('new_ called with constructor type ' + typeof(constructor) + " which is not a function");
      }
  
      /*
       * Previously, the following line was just:
  
       function dummy() {};
  
       * Unfortunately, Chrome was preserving 'dummy' as the object's name, even though at creation, the 'dummy' has the
       * correct constructor name.  Thus, objects created with IMVU.new would show up in the debugger as 'dummy', which
       * isn't very helpful.  Using IMVU.createNamedFunction addresses the issue.  Doublely-unfortunately, there's no way
       * to write a test for this behavior.  -NRD 2013.02.22
       */
      var dummy = createNamedFunction(constructor.name || 'unknownFunctionName', function(){});
      dummy.prototype = constructor.prototype;
      var obj = new dummy;
  
      var r = constructor.apply(obj, argumentList);
      return (r instanceof Object) ? r : obj;
    }function craftInvokerFunction(humanName, argTypes, classType, cppInvokerFunc, cppTargetFunc) {
      // humanName: a human-readable string name for the function to be generated.
      // argTypes: An array that contains the embind type objects for all types in the function signature.
      //    argTypes[0] is the type object for the function return value.
      //    argTypes[1] is the type object for function this object/class type, or null if not crafting an invoker for a class method.
      //    argTypes[2...] are the actual function parameters.
      // classType: The embind type object for the class to be bound, or null if this is not a method of a class.
      // cppInvokerFunc: JS Function object to the C++-side function that interops into C++ code.
      // cppTargetFunc: Function pointer (an integer to FUNCTION_TABLE) to the target C++ function the cppInvokerFunc will end up calling.
      var argCount = argTypes.length;
  
      if (argCount < 2) {
          throwBindingError("argTypes array size mismatch! Must at least get return value and 'this' types!");
      }
  
      var isClassMethodFunc = (argTypes[1] !== null && classType !== null);
  
      // Free functions with signature "void function()" do not need an invoker that marshalls between wire types.
  // TODO: This omits argument count check - enable only at -O3 or similar.
  //    if (ENABLE_UNSAFE_OPTS && argCount == 2 && argTypes[0].name == "void" && !isClassMethodFunc) {
  //       return FUNCTION_TABLE[fn];
  //    }
  
  
      // Determine if we need to use a dynamic stack to store the destructors for the function parameters.
      // TODO: Remove this completely once all function invokers are being dynamically generated.
      var needsDestructorStack = false;
  
      for(var i = 1; i < argTypes.length; ++i) { // Skip return value at index 0 - it's not deleted here.
          if (argTypes[i] !== null && argTypes[i].destructorFunction === undefined) { // The type does not define a destructor function - must use dynamic stack
              needsDestructorStack = true;
              break;
          }
      }
  
      var returns = (argTypes[0].name !== "void");
  
      var argsList = "";
      var argsListWired = "";
      for(var i = 0; i < argCount - 2; ++i) {
          argsList += (i!==0?", ":"")+"arg"+i;
          argsListWired += (i!==0?", ":"")+"arg"+i+"Wired";
      }
  
      var invokerFnBody =
          "return function "+makeLegalFunctionName(humanName)+"("+argsList+") {\n" +
          "if (arguments.length !== "+(argCount - 2)+") {\n" +
              "throwBindingError('function "+humanName+" called with ' + arguments.length + ' arguments, expected "+(argCount - 2)+" args!');\n" +
          "}\n";
  
  
      if (needsDestructorStack) {
          invokerFnBody +=
              "var destructors = [];\n";
      }
  
      var dtorStack = needsDestructorStack ? "destructors" : "null";
      var args1 = ["throwBindingError", "invoker", "fn", "runDestructors", "retType", "classParam"];
      var args2 = [throwBindingError, cppInvokerFunc, cppTargetFunc, runDestructors, argTypes[0], argTypes[1]];
  
  
      if (isClassMethodFunc) {
          invokerFnBody += "var thisWired = classParam.toWireType("+dtorStack+", this);\n";
      }
  
      for(var i = 0; i < argCount - 2; ++i) {
          invokerFnBody += "var arg"+i+"Wired = argType"+i+".toWireType("+dtorStack+", arg"+i+"); // "+argTypes[i+2].name+"\n";
          args1.push("argType"+i);
          args2.push(argTypes[i+2]);
      }
  
      if (isClassMethodFunc) {
          argsListWired = "thisWired" + (argsListWired.length > 0 ? ", " : "") + argsListWired;
      }
  
      invokerFnBody +=
          (returns?"var rv = ":"") + "invoker(fn"+(argsListWired.length>0?", ":"")+argsListWired+");\n";
  
      if (needsDestructorStack) {
          invokerFnBody += "runDestructors(destructors);\n";
      } else {
          for(var i = isClassMethodFunc?1:2; i < argTypes.length; ++i) { // Skip return value at index 0 - it's not deleted here. Also skip class type if not a method.
              var paramName = (i === 1 ? "thisWired" : ("arg"+(i - 2)+"Wired"));
              if (argTypes[i].destructorFunction !== null) {
                  invokerFnBody += paramName+"_dtor("+paramName+"); // "+argTypes[i].name+"\n";
                  args1.push(paramName+"_dtor");
                  args2.push(argTypes[i].destructorFunction);
              }
          }
      }
  
      if (returns) {
          invokerFnBody += "var ret = retType.fromWireType(rv);\n" +
                           "return ret;\n";
      } else {
      }
      invokerFnBody += "}\n";
  
      args1.push(invokerFnBody);
  
      var invokerFunction = new_(Function, args1).apply(null, args2);
      return invokerFunction;
    }function __embind_register_class_function(
      rawClassType,
      methodName,
      argCount,
      rawArgTypesAddr, // [ReturnType, ThisType, Args...]
      invokerSignature,
      rawInvoker,
      context,
      isPureVirtual
    ) {
      var rawArgTypes = heap32VectorToArray(argCount, rawArgTypesAddr);
      methodName = readLatin1String(methodName);
      rawInvoker = embind__requireFunction(invokerSignature, rawInvoker);
  
      whenDependentTypesAreResolved([], [rawClassType], function(classType) {
          classType = classType[0];
          var humanName = classType.name + '.' + methodName;
  
          if (isPureVirtual) {
              classType.registeredClass.pureVirtualFunctions.push(methodName);
          }
  
          function unboundTypesHandler() {
              throwUnboundTypeError('Cannot call ' + humanName + ' due to unbound types', rawArgTypes);
          }
  
          var proto = classType.registeredClass.instancePrototype;
          var method = proto[methodName];
          if (undefined === method || (undefined === method.overloadTable && method.className !== classType.name && method.argCount === argCount - 2)) {
              // This is the first overload to be registered, OR we are replacing a function in the base class with a function in the derived class.
              unboundTypesHandler.argCount = argCount - 2;
              unboundTypesHandler.className = classType.name;
              proto[methodName] = unboundTypesHandler;
          } else {
              // There was an existing function with the same name registered. Set up a function overload routing table.
              ensureOverloadTable(proto, methodName, humanName);
              proto[methodName].overloadTable[argCount - 2] = unboundTypesHandler;
          }
  
          whenDependentTypesAreResolved([], rawArgTypes, function(argTypes) {
  
              var memberFunction = craftInvokerFunction(humanName, argTypes, classType, rawInvoker, context);
  
              // Replace the initial unbound-handler-stub function with the appropriate member function, now that all types
              // are resolved. If multiple overloads are registered for this function, the function goes into an overload table.
              if (undefined === proto[methodName].overloadTable) {
                  // Set argCount in case an overload is registered later
                  memberFunction.argCount = argCount - 2;
                  proto[methodName] = memberFunction;
              } else {
                  proto[methodName].overloadTable[argCount - 2] = memberFunction;
              }
  
              return [];
          });
          return [];
      });
    }

  
  
  var emval_free_list=[];
  
  var emval_handle_array=[{},{value:undefined},{value:null},{value:true},{value:false}];function __emval_decref(handle) {
      if (handle > 4 && 0 === --emval_handle_array[handle].refcount) {
          emval_handle_array[handle] = undefined;
          emval_free_list.push(handle);
      }
    }
  
  
  
  function count_emval_handles() {
      var count = 0;
      for (var i = 5; i < emval_handle_array.length; ++i) {
          if (emval_handle_array[i] !== undefined) {
              ++count;
          }
      }
      return count;
    }
  
  function get_first_emval() {
      for (var i = 5; i < emval_handle_array.length; ++i) {
          if (emval_handle_array[i] !== undefined) {
              return emval_handle_array[i];
          }
      }
      return null;
    }function init_emval() {
      Module['count_emval_handles'] = count_emval_handles;
      Module['get_first_emval'] = get_first_emval;
    }function __emval_register(value) {
  
      switch(value){
        case undefined :{ return 1; }
        case null :{ return 2; }
        case true :{ return 3; }
        case false :{ return 4; }
        default:{
          var handle = emval_free_list.length ?
              emval_free_list.pop() :
              emval_handle_array.length;
  
          emval_handle_array[handle] = {refcount: 1, value: value};
          return handle;
          }
        }
    }function __embind_register_emval(rawType, name) {
      name = readLatin1String(name);
      registerType(rawType, {
          name: name,
          'fromWireType': function(handle) {
              var rv = emval_handle_array[handle].value;
              __emval_decref(handle);
              return rv;
          },
          'toWireType': function(destructors, value) {
              return __emval_register(value);
          },
          'argPackAdvance': 8,
          'readValueFromPointer': simpleReadValueFromPointer,
          destructorFunction: null, // This type does not need a destructor
  
          // TODO: do we need a deleteObject here?  write a test where
          // emval is passed into JS via an interface
      });
    }

  
  function _embind_repr(v) {
      if (v === null) {
          return 'null';
      }
      var t = typeof v;
      if (t === 'object' || t === 'array' || t === 'function') {
          return v.toString();
      } else {
          return '' + v;
      }
    }
  
  function floatReadValueFromPointer(name, shift) {
      switch (shift) {
          case 2: return function(pointer) {
              return this['fromWireType'](HEAPF32[pointer >> 2]);
          };
          case 3: return function(pointer) {
              return this['fromWireType'](HEAPF64[pointer >> 3]);
          };
          default:
              throw new TypeError("Unknown float type: " + name);
      }
    }function __embind_register_float(rawType, name, size) {
      var shift = getShiftFromSize(size);
      name = readLatin1String(name);
      registerType(rawType, {
          name: name,
          'fromWireType': function(value) {
              return value;
          },
          'toWireType': function(destructors, value) {
              // todo: Here we have an opportunity for -O3 level "unsafe" optimizations: we could
              // avoid the following if() and assume value is of proper type.
              if (typeof value !== "number" && typeof value !== "boolean") {
                  throw new TypeError('Cannot convert "' + _embind_repr(value) + '" to ' + this.name);
              }
              return value;
          },
          'argPackAdvance': 8,
          'readValueFromPointer': floatReadValueFromPointer(name, shift),
          destructorFunction: null, // This type does not need a destructor
      });
    }

  
  function integerReadValueFromPointer(name, shift, signed) {
      // integers are quite common, so generate very specialized functions
      switch (shift) {
          case 0: return signed ?
              function readS8FromPointer(pointer) { return HEAP8[pointer]; } :
              function readU8FromPointer(pointer) { return HEAPU8[pointer]; };
          case 1: return signed ?
              function readS16FromPointer(pointer) { return HEAP16[pointer >> 1]; } :
              function readU16FromPointer(pointer) { return HEAPU16[pointer >> 1]; };
          case 2: return signed ?
              function readS32FromPointer(pointer) { return HEAP32[pointer >> 2]; } :
              function readU32FromPointer(pointer) { return HEAPU32[pointer >> 2]; };
          default:
              throw new TypeError("Unknown integer type: " + name);
      }
    }function __embind_register_integer(primitiveType, name, size, minRange, maxRange) {
      name = readLatin1String(name);
      if (maxRange === -1) { // LLVM doesn't have signed and unsigned 32-bit types, so u32 literals come out as 'i32 -1'. Always treat those as max u32.
          maxRange = 4294967295;
      }
  
      var shift = getShiftFromSize(size);
  
      var fromWireType = function(value) {
          return value;
      };
  
      if (minRange === 0) {
          var bitshift = 32 - 8*size;
          fromWireType = function(value) {
              return (value << bitshift) >>> bitshift;
          };
      }
  
      var isUnsignedType = (name.indexOf('unsigned') != -1);
  
      registerType(primitiveType, {
          name: name,
          'fromWireType': fromWireType,
          'toWireType': function(destructors, value) {
              // todo: Here we have an opportunity for -O3 level "unsafe" optimizations: we could
              // avoid the following two if()s and assume value is of proper type.
              if (typeof value !== "number" && typeof value !== "boolean") {
                  throw new TypeError('Cannot convert "' + _embind_repr(value) + '" to ' + this.name);
              }
              if (value < minRange || value > maxRange) {
                  throw new TypeError('Passing a number "' + _embind_repr(value) + '" from JS side to C/C++ side to an argument of type "' + name + '", which is outside the valid range [' + minRange + ', ' + maxRange + ']!');
              }
              return isUnsignedType ? (value >>> 0) : (value | 0);
          },
          'argPackAdvance': 8,
          'readValueFromPointer': integerReadValueFromPointer(name, shift, minRange !== 0),
          destructorFunction: null, // This type does not need a destructor
      });
    }

  function __embind_register_memory_view(rawType, dataTypeIndex, name) {
      var typeMapping = [
          Int8Array,
          Uint8Array,
          Int16Array,
          Uint16Array,
          Int32Array,
          Uint32Array,
          Float32Array,
          Float64Array,
      ];
  
      var TA = typeMapping[dataTypeIndex];
  
      function decodeMemoryView(handle) {
          handle = handle >> 2;
          var heap = HEAPU32;
          var size = heap[handle]; // in elements
          var data = heap[handle + 1]; // byte offset into emscripten heap
          return new TA(heap['buffer'], data, size);
      }
  
      name = readLatin1String(name);
      registerType(rawType, {
          name: name,
          'fromWireType': decodeMemoryView,
          'argPackAdvance': 8,
          'readValueFromPointer': decodeMemoryView,
      }, {
          ignoreDuplicateRegistrations: true,
      });
    }

  function __embind_register_std_string(rawType, name) {
      name = readLatin1String(name);
      registerType(rawType, {
          name: name,
          'fromWireType': function(value) {
              var length = HEAPU32[value >> 2];
              var a = new Array(length);
              for (var i = 0; i < length; ++i) {
                  a[i] = String.fromCharCode(HEAPU8[value + 4 + i]);
              }
              _free(value);
              return a.join('');
          },
          'toWireType': function(destructors, value) {
              if (value instanceof ArrayBuffer) {
                  value = new Uint8Array(value);
              }
  
              function getTAElement(ta, index) {
                  return ta[index];
              }
              function getStringElement(string, index) {
                  return string.charCodeAt(index);
              }
              var getElement;
              if (value instanceof Uint8Array) {
                  getElement = getTAElement;
              } else if (value instanceof Uint8ClampedArray) {
                  getElement = getTAElement;
              } else if (value instanceof Int8Array) {
                  getElement = getTAElement;
              } else if (typeof value === 'string') {
                  getElement = getStringElement;
              } else {
                  throwBindingError('Cannot pass non-string to std::string');
              }
  
              // assumes 4-byte alignment
              var length = value.length;
              var ptr = _malloc(4 + length);
              HEAPU32[ptr >> 2] = length;
              for (var i = 0; i < length; ++i) {
                  var charCode = getElement(value, i);
                  if (charCode > 255) {
                      _free(ptr);
                      throwBindingError('String has UTF-16 code units that do not fit in 8 bits');
                  }
                  HEAPU8[ptr + 4 + i] = charCode;
              }
              if (destructors !== null) {
                  destructors.push(_free, ptr);
              }
              return ptr;
          },
          'argPackAdvance': 8,
          'readValueFromPointer': simpleReadValueFromPointer,
          destructorFunction: function(ptr) { _free(ptr); },
      });
    }

  function __embind_register_std_wstring(rawType, charSize, name) {
      // nb. do not cache HEAPU16 and HEAPU32, they may be destroyed by enlargeMemory().
      name = readLatin1String(name);
      var getHeap, shift;
      if (charSize === 2) {
          getHeap = function() { return HEAPU16; };
          shift = 1;
      } else if (charSize === 4) {
          getHeap = function() { return HEAPU32; };
          shift = 2;
      }
      registerType(rawType, {
          name: name,
          'fromWireType': function(value) {
              var HEAP = getHeap();
              var length = HEAPU32[value >> 2];
              var a = new Array(length);
              var start = (value + 4) >> shift;
              for (var i = 0; i < length; ++i) {
                  a[i] = String.fromCharCode(HEAP[start + i]);
              }
              _free(value);
              return a.join('');
          },
          'toWireType': function(destructors, value) {
              // assumes 4-byte alignment
              var HEAP = getHeap();
              var length = value.length;
              var ptr = _malloc(4 + length * charSize);
              HEAPU32[ptr >> 2] = length;
              var start = (ptr + 4) >> shift;
              for (var i = 0; i < length; ++i) {
                  HEAP[start + i] = value.charCodeAt(i);
              }
              if (destructors !== null) {
                  destructors.push(_free, ptr);
              }
              return ptr;
          },
          'argPackAdvance': 8,
          'readValueFromPointer': simpleReadValueFromPointer,
          destructorFunction: function(ptr) { _free(ptr); },
      });
    }

  function __embind_register_void(rawType, name) {
      name = readLatin1String(name);
      registerType(rawType, {
          isVoid: true, // void return values can be optimized out sometimes
          name: name,
          'argPackAdvance': 0,
          'fromWireType': function() {
              return undefined;
          },
          'toWireType': function(destructors, o) {
              // TODO: assert if anything else is given?
              return undefined;
          },
      });
    }

  function _abort() {
      Module['abort']();
    }

  var _llvm_ceil_f64=Math_ceil;

  var _llvm_floor_f64=Math_floor;

  function _llvm_trap() {
      abort('trap!');
    }

  
  function _emscripten_memcpy_big(dest, src, num) {
      HEAPU8.set(HEAPU8.subarray(src, src+num), dest);
      return dest;
    } 

   

   

  
  function ___setErrNo(value) {
      if (Module['___errno_location']) HEAP32[((Module['___errno_location']())>>2)]=value;
      return value;
    } 
embind_init_charCodes();
BindingError = Module['BindingError'] = extendError(Error, 'BindingError');;
InternalError = Module['InternalError'] = extendError(Error, 'InternalError');;
init_ClassHandle();
init_RegisteredPointer();
init_embind();;
UnboundTypeError = Module['UnboundTypeError'] = extendError(Error, 'UnboundTypeError');;
init_emval();;
DYNAMICTOP_PTR = staticAlloc(4);

STACK_BASE = STACKTOP = alignMemory(STATICTOP);

STACK_MAX = STACK_BASE + TOTAL_STACK;

DYNAMIC_BASE = alignMemory(STACK_MAX);

HEAP32[DYNAMICTOP_PTR>>2] = DYNAMIC_BASE;

staticSealed = true; // seal the static portion of memory

var ASSERTIONS = false;

/** @type {function(string, boolean=, number=)} */
function intArrayFromString(stringy, dontAddNull, length) {
  var len = length > 0 ? length : lengthBytesUTF8(stringy)+1;
  var u8array = new Array(len);
  var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
  if (dontAddNull) u8array.length = numBytesWritten;
  return u8array;
}

function intArrayToString(array) {
  var ret = [];
  for (var i = 0; i < array.length; i++) {
    var chr = array[i];
    if (chr > 0xFF) {
      if (ASSERTIONS) {
        assert(false, 'Character code ' + chr + ' (' + String.fromCharCode(chr) + ')  at offset ' + i + ' not in 0x00-0xFF.');
      }
      chr &= 0xFF;
    }
    ret.push(String.fromCharCode(chr));
  }
  return ret.join('');
}


// Copied from https://github.com/strophe/strophejs/blob/e06d027/src/polyfills.js#L149

// This code was written by Tyler Akins and has been placed in the
// public domain.  It would be nice if you left this header intact.
// Base64 code from Tyler Akins -- http://rumkin.com

/**
 * Decodes a base64 string.
 * @param {String} input The string to decode.
 */
var decodeBase64 = typeof atob === 'function' ? atob : function (input) {
  var keyStr = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

  var output = '';
  var chr1, chr2, chr3;
  var enc1, enc2, enc3, enc4;
  var i = 0;
  // remove all characters that are not A-Z, a-z, 0-9, +, /, or =
  input = input.replace(/[^A-Za-z0-9\+\/\=]/g, '');
  do {
    enc1 = keyStr.indexOf(input.charAt(i++));
    enc2 = keyStr.indexOf(input.charAt(i++));
    enc3 = keyStr.indexOf(input.charAt(i++));
    enc4 = keyStr.indexOf(input.charAt(i++));

    chr1 = (enc1 << 2) | (enc2 >> 4);
    chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    chr3 = ((enc3 & 3) << 6) | enc4;

    output = output + String.fromCharCode(chr1);

    if (enc3 !== 64) {
      output = output + String.fromCharCode(chr2);
    }
    if (enc4 !== 64) {
      output = output + String.fromCharCode(chr3);
    }
  } while (i < input.length);
  return output;
};

// Converts a string of base64 into a byte array.
// Throws error on invalid input.
function intArrayFromBase64(s) {
  if (typeof ENVIRONMENT_IS_NODE === 'boolean' && ENVIRONMENT_IS_NODE) {
    var buf;
    try {
      buf = Buffer.from(s, 'base64');
    } catch (_) {
      buf = new Buffer(s, 'base64');
    }
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  try {
    var decoded = decodeBase64(s);
    var bytes = new Uint8Array(decoded.length);
    for (var i = 0 ; i < decoded.length ; ++i) {
      bytes[i] = decoded.charCodeAt(i);
    }
    return bytes;
  } catch (_) {
    throw new Error('Converting base64 string to bytes failed.');
  }
}

// If filename is a base64 data URI, parses and returns data (Buffer on node,
// Uint8Array otherwise). If filename is not a base64 data URI, returns undefined.
function tryParseAsDataURI(filename) {
  if (!isDataURI(filename)) {
    return;
  }

  return intArrayFromBase64(filename.slice(dataURIPrefix.length));
}



function invoke_did(index,a1,a2) {
  try {
    return Module["dynCall_did"](index,a1,a2);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_didi(index,a1,a2,a3) {
  try {
    return Module["dynCall_didi"](index,a1,a2,a3);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_diid(index,a1,a2,a3) {
  try {
    return Module["dynCall_diid"](index,a1,a2,a3);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_ii(index,a1) {
  try {
    return Module["dynCall_ii"](index,a1);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_iid(index,a1,a2) {
  try {
    return Module["dynCall_iid"](index,a1,a2);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_iiii(index,a1,a2,a3) {
  try {
    return Module["dynCall_iiii"](index,a1,a2,a3);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_v(index) {
  try {
    Module["dynCall_v"](index);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_vi(index,a1) {
  try {
    Module["dynCall_vi"](index,a1);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_vid(index,a1,a2) {
  try {
    Module["dynCall_vid"](index,a1,a2);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_viid(index,a1,a2,a3) {
  try {
    Module["dynCall_viid"](index,a1,a2,a3);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_viiii(index,a1,a2,a3,a4) {
  try {
    Module["dynCall_viiii"](index,a1,a2,a3,a4);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_viiiii(index,a1,a2,a3,a4,a5) {
  try {
    Module["dynCall_viiiii"](index,a1,a2,a3,a4,a5);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_viiiiii(index,a1,a2,a3,a4,a5,a6) {
  try {
    Module["dynCall_viiiiii"](index,a1,a2,a3,a4,a5,a6);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

Module.asmGlobalArg = { "Math": Math, "Int8Array": Int8Array, "Int16Array": Int16Array, "Int32Array": Int32Array, "Uint8Array": Uint8Array, "Uint16Array": Uint16Array, "Uint32Array": Uint32Array, "Float32Array": Float32Array, "Float64Array": Float64Array, "NaN": NaN, "Infinity": Infinity };

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "invoke_did": invoke_did, "invoke_didi": invoke_didi, "invoke_diid": invoke_diid, "invoke_ii": invoke_ii, "invoke_iid": invoke_iid, "invoke_iiii": invoke_iiii, "invoke_v": invoke_v, "invoke_vi": invoke_vi, "invoke_vid": invoke_vid, "invoke_viid": invoke_viid, "invoke_viiii": invoke_viiii, "invoke_viiiii": invoke_viiiii, "invoke_viiiiii": invoke_viiiiii, "ClassHandle": ClassHandle, "ClassHandle_clone": ClassHandle_clone, "ClassHandle_delete": ClassHandle_delete, "ClassHandle_deleteLater": ClassHandle_deleteLater, "ClassHandle_isAliasOf": ClassHandle_isAliasOf, "ClassHandle_isDeleted": ClassHandle_isDeleted, "RegisteredClass": RegisteredClass, "RegisteredPointer": RegisteredPointer, "RegisteredPointer_deleteObject": RegisteredPointer_deleteObject, "RegisteredPointer_destructor": RegisteredPointer_destructor, "RegisteredPointer_fromWireType": RegisteredPointer_fromWireType, "RegisteredPointer_getPointee": RegisteredPointer_getPointee, "__ZSt18uncaught_exceptionv": __ZSt18uncaught_exceptionv, "___cxa_allocate_exception": ___cxa_allocate_exception, "___cxa_find_matching_catch": ___cxa_find_matching_catch, "___cxa_pure_virtual": ___cxa_pure_virtual, "___cxa_throw": ___cxa_throw, "___gxx_personality_v0": ___gxx_personality_v0, "___resumeException": ___resumeException, "___setErrNo": ___setErrNo, "__embind_register_bool": __embind_register_bool, "__embind_register_class": __embind_register_class, "__embind_register_class_constructor": __embind_register_class_constructor, "__embind_register_class_function": __embind_register_class_function, "__embind_register_emval": __embind_register_emval, "__embind_register_float": __embind_register_float, "__embind_register_integer": __embind_register_integer, "__embind_register_memory_view": __embind_register_memory_view, "__embind_register_std_string": __embind_register_std_string, "__embind_register_std_wstring": __embind_register_std_wstring, "__embind_register_void": __embind_register_void, "__emval_decref": __emval_decref, "__emval_register": __emval_register, "_abort": _abort, "_embind_repr": _embind_repr, "_emscripten_memcpy_big": _emscripten_memcpy_big, "_llvm_ceil_f64": _llvm_ceil_f64, "_llvm_floor_f64": _llvm_floor_f64, "_llvm_trap": _llvm_trap, "constNoSmartPtrRawPointerToWireType": constNoSmartPtrRawPointerToWireType, "count_emval_handles": count_emval_handles, "craftInvokerFunction": craftInvokerFunction, "createNamedFunction": createNamedFunction, "downcastPointer": downcastPointer, "embind__requireFunction": embind__requireFunction, "embind_init_charCodes": embind_init_charCodes, "ensureOverloadTable": ensureOverloadTable, "exposePublicSymbol": exposePublicSymbol, "extendError": extendError, "floatReadValueFromPointer": floatReadValueFromPointer, "flushPendingDeletes": flushPendingDeletes, "genericPointerToWireType": genericPointerToWireType, "getBasestPointer": getBasestPointer, "getInheritedInstance": getInheritedInstance, "getInheritedInstanceCount": getInheritedInstanceCount, "getLiveInheritedInstances": getLiveInheritedInstances, "getShiftFromSize": getShiftFromSize, "getTypeName": getTypeName, "get_first_emval": get_first_emval, "heap32VectorToArray": heap32VectorToArray, "init_ClassHandle": init_ClassHandle, "init_RegisteredPointer": init_RegisteredPointer, "init_embind": init_embind, "init_emval": init_emval, "integerReadValueFromPointer": integerReadValueFromPointer, "makeClassHandle": makeClassHandle, "makeLegalFunctionName": makeLegalFunctionName, "new_": new_, "nonConstNoSmartPtrRawPointerToWireType": nonConstNoSmartPtrRawPointerToWireType, "readLatin1String": readLatin1String, "registerType": registerType, "replacePublicSymbol": replacePublicSymbol, "runDestructor": runDestructor, "runDestructors": runDestructors, "setDelayFunction": setDelayFunction, "shallowCopyInternalPointer": shallowCopyInternalPointer, "simpleReadValueFromPointer": simpleReadValueFromPointer, "throwBindingError": throwBindingError, "throwInstanceAlreadyDeleted": throwInstanceAlreadyDeleted, "throwInternalError": throwInternalError, "throwUnboundTypeError": throwUnboundTypeError, "upcastPointer": upcastPointer, "whenDependentTypesAreResolved": whenDependentTypesAreResolved, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX };
// EMSCRIPTEN_START_ASM
var asm = (/** @suppress {uselessCode} */ function(global, env, buffer) {
'use asm';


  var HEAP8 = new global.Int8Array(buffer);
  var HEAP16 = new global.Int16Array(buffer);
  var HEAP32 = new global.Int32Array(buffer);
  var HEAPU8 = new global.Uint8Array(buffer);
  var HEAPU16 = new global.Uint16Array(buffer);
  var HEAPU32 = new global.Uint32Array(buffer);
  var HEAPF32 = new global.Float32Array(buffer);
  var HEAPF64 = new global.Float64Array(buffer);

  var DYNAMICTOP_PTR=env.DYNAMICTOP_PTR|0;
  var tempDoublePtr=env.tempDoublePtr|0;
  var ABORT=env.ABORT|0;
  var STACKTOP=env.STACKTOP|0;
  var STACK_MAX=env.STACK_MAX|0;

  var __THREW__ = 0;
  var threwValue = 0;
  var setjmpId = 0;
  var undef = 0;
  var nan = global.NaN, inf = global.Infinity;
  var tempInt = 0, tempBigInt = 0, tempBigIntS = 0, tempValue = 0, tempDouble = 0.0;
  var tempRet0 = 0;

  var Math_floor=global.Math.floor;
  var Math_abs=global.Math.abs;
  var Math_sqrt=global.Math.sqrt;
  var Math_pow=global.Math.pow;
  var Math_cos=global.Math.cos;
  var Math_sin=global.Math.sin;
  var Math_tan=global.Math.tan;
  var Math_acos=global.Math.acos;
  var Math_asin=global.Math.asin;
  var Math_atan=global.Math.atan;
  var Math_atan2=global.Math.atan2;
  var Math_exp=global.Math.exp;
  var Math_log=global.Math.log;
  var Math_ceil=global.Math.ceil;
  var Math_imul=global.Math.imul;
  var Math_min=global.Math.min;
  var Math_max=global.Math.max;
  var Math_clz32=global.Math.clz32;
  var abort=env.abort;
  var assert=env.assert;
  var enlargeMemory=env.enlargeMemory;
  var getTotalMemory=env.getTotalMemory;
  var abortOnCannotGrowMemory=env.abortOnCannotGrowMemory;
  var invoke_did=env.invoke_did;
  var invoke_didi=env.invoke_didi;
  var invoke_diid=env.invoke_diid;
  var invoke_ii=env.invoke_ii;
  var invoke_iid=env.invoke_iid;
  var invoke_iiii=env.invoke_iiii;
  var invoke_v=env.invoke_v;
  var invoke_vi=env.invoke_vi;
  var invoke_vid=env.invoke_vid;
  var invoke_viid=env.invoke_viid;
  var invoke_viiii=env.invoke_viiii;
  var invoke_viiiii=env.invoke_viiiii;
  var invoke_viiiiii=env.invoke_viiiiii;
  var ClassHandle=env.ClassHandle;
  var ClassHandle_clone=env.ClassHandle_clone;
  var ClassHandle_delete=env.ClassHandle_delete;
  var ClassHandle_deleteLater=env.ClassHandle_deleteLater;
  var ClassHandle_isAliasOf=env.ClassHandle_isAliasOf;
  var ClassHandle_isDeleted=env.ClassHandle_isDeleted;
  var RegisteredClass=env.RegisteredClass;
  var RegisteredPointer=env.RegisteredPointer;
  var RegisteredPointer_deleteObject=env.RegisteredPointer_deleteObject;
  var RegisteredPointer_destructor=env.RegisteredPointer_destructor;
  var RegisteredPointer_fromWireType=env.RegisteredPointer_fromWireType;
  var RegisteredPointer_getPointee=env.RegisteredPointer_getPointee;
  var __ZSt18uncaught_exceptionv=env.__ZSt18uncaught_exceptionv;
  var ___cxa_allocate_exception=env.___cxa_allocate_exception;
  var ___cxa_find_matching_catch=env.___cxa_find_matching_catch;
  var ___cxa_pure_virtual=env.___cxa_pure_virtual;
  var ___cxa_throw=env.___cxa_throw;
  var ___gxx_personality_v0=env.___gxx_personality_v0;
  var ___resumeException=env.___resumeException;
  var ___setErrNo=env.___setErrNo;
  var __embind_register_bool=env.__embind_register_bool;
  var __embind_register_class=env.__embind_register_class;
  var __embind_register_class_constructor=env.__embind_register_class_constructor;
  var __embind_register_class_function=env.__embind_register_class_function;
  var __embind_register_emval=env.__embind_register_emval;
  var __embind_register_float=env.__embind_register_float;
  var __embind_register_integer=env.__embind_register_integer;
  var __embind_register_memory_view=env.__embind_register_memory_view;
  var __embind_register_std_string=env.__embind_register_std_string;
  var __embind_register_std_wstring=env.__embind_register_std_wstring;
  var __embind_register_void=env.__embind_register_void;
  var __emval_decref=env.__emval_decref;
  var __emval_register=env.__emval_register;
  var _abort=env._abort;
  var _embind_repr=env._embind_repr;
  var _emscripten_memcpy_big=env._emscripten_memcpy_big;
  var _llvm_ceil_f64=env._llvm_ceil_f64;
  var _llvm_floor_f64=env._llvm_floor_f64;
  var _llvm_trap=env._llvm_trap;
  var constNoSmartPtrRawPointerToWireType=env.constNoSmartPtrRawPointerToWireType;
  var count_emval_handles=env.count_emval_handles;
  var craftInvokerFunction=env.craftInvokerFunction;
  var createNamedFunction=env.createNamedFunction;
  var downcastPointer=env.downcastPointer;
  var embind__requireFunction=env.embind__requireFunction;
  var embind_init_charCodes=env.embind_init_charCodes;
  var ensureOverloadTable=env.ensureOverloadTable;
  var exposePublicSymbol=env.exposePublicSymbol;
  var extendError=env.extendError;
  var floatReadValueFromPointer=env.floatReadValueFromPointer;
  var flushPendingDeletes=env.flushPendingDeletes;
  var genericPointerToWireType=env.genericPointerToWireType;
  var getBasestPointer=env.getBasestPointer;
  var getInheritedInstance=env.getInheritedInstance;
  var getInheritedInstanceCount=env.getInheritedInstanceCount;
  var getLiveInheritedInstances=env.getLiveInheritedInstances;
  var getShiftFromSize=env.getShiftFromSize;
  var getTypeName=env.getTypeName;
  var get_first_emval=env.get_first_emval;
  var heap32VectorToArray=env.heap32VectorToArray;
  var init_ClassHandle=env.init_ClassHandle;
  var init_RegisteredPointer=env.init_RegisteredPointer;
  var init_embind=env.init_embind;
  var init_emval=env.init_emval;
  var integerReadValueFromPointer=env.integerReadValueFromPointer;
  var makeClassHandle=env.makeClassHandle;
  var makeLegalFunctionName=env.makeLegalFunctionName;
  var new_=env.new_;
  var nonConstNoSmartPtrRawPointerToWireType=env.nonConstNoSmartPtrRawPointerToWireType;
  var readLatin1String=env.readLatin1String;
  var registerType=env.registerType;
  var replacePublicSymbol=env.replacePublicSymbol;
  var runDestructor=env.runDestructor;
  var runDestructors=env.runDestructors;
  var setDelayFunction=env.setDelayFunction;
  var shallowCopyInternalPointer=env.shallowCopyInternalPointer;
  var simpleReadValueFromPointer=env.simpleReadValueFromPointer;
  var throwBindingError=env.throwBindingError;
  var throwInstanceAlreadyDeleted=env.throwInstanceAlreadyDeleted;
  var throwInternalError=env.throwInternalError;
  var throwUnboundTypeError=env.throwUnboundTypeError;
  var upcastPointer=env.upcastPointer;
  var whenDependentTypesAreResolved=env.whenDependentTypesAreResolved;
  var tempFloat = 0.0;

// EMSCRIPTEN_START_FUNCS

function _malloc($0) {
 $0 = $0 | 0;
 var $$$0192$i = 0, $$$0193$i = 0, $$$4351$i = 0, $$$i = 0, $$0 = 0, $$0$i$i = 0, $$0$i$i$i = 0, $$0$i17$i = 0, $$0189$i = 0, $$0192$lcssa$i = 0, $$01926$i = 0, $$0193$lcssa$i = 0, $$01935$i = 0, $$0197 = 0, $$0199 = 0, $$0206$i$i = 0, $$0207$i$i = 0, $$0211$i$i = 0, $$0212$i$i = 0, $$024367$i = 0, $$0287$i$i = 0, $$0288$i$i = 0, $$0289$i$i = 0, $$0295$i$i = 0, $$0296$i$i = 0, $$0342$i = 0, $$0344$i = 0, $$0345$i = 0, $$0347$i = 0, $$0353$i = 0, $$0358$i = 0, $$0359$i = 0, $$0361$i = 0, $$0362$i = 0, $$0368$i = 0, $$1196$i = 0, $$1198$i = 0, $$124466$i = 0, $$1291$i$i = 0, $$1293$i$i = 0, $$1343$i = 0, $$1348$i = 0, $$1363$i = 0, $$1370$i = 0, $$1374$i = 0, $$2234243136$i = 0, $$2247$ph$i = 0, $$2253$ph$i = 0, $$2355$i = 0, $$3$i = 0, $$3$i$i = 0, $$3$i203 = 0, $$3350$i = 0, $$3372$i = 0, $$4$lcssa$i = 0, $$4$ph$i = 0, $$414$i = 0, $$4236$i = 0, $$4351$lcssa$i = 0, $$435113$i = 0, $$4357$$4$i = 0, $$4357$ph$i = 0, $$435712$i = 0, $$723947$i = 0, $$748$i = 0, $$pre$phi$i$iZ2D = 0, $$pre$phi$i19$iZ2D = 0, $$pre$phi$i211Z2D = 0, $$pre$phi$iZ2D = 0, $$pre$phi11$i$iZ2D = 0, $$pre$phiZ2D = 0, $1 = 0, $1004 = 0, $101 = 0, $1010 = 0, $1013 = 0, $1014 = 0, $102 = 0, $1032 = 0, $1034 = 0, $1041 = 0, $1042 = 0, $1043 = 0, $1052 = 0, $1054 = 0, $1055 = 0, $1056 = 0, $108 = 0, $112 = 0, $114 = 0, $115 = 0, $117 = 0, $119 = 0, $121 = 0, $123 = 0, $125 = 0, $127 = 0, $129 = 0, $134 = 0, $138 = 0, $14 = 0, $143 = 0, $146 = 0, $149 = 0, $150 = 0, $157 = 0, $159 = 0, $16 = 0, $162 = 0, $164 = 0, $167 = 0, $169 = 0, $17 = 0, $172 = 0, $175 = 0, $176 = 0, $178 = 0, $179 = 0, $18 = 0, $181 = 0, $182 = 0, $184 = 0, $185 = 0, $19 = 0, $190 = 0, $191 = 0, $20 = 0, $204 = 0, $208 = 0, $214 = 0, $221 = 0, $225 = 0, $234 = 0, $235 = 0, $237 = 0, $238 = 0, $242 = 0, $243 = 0, $251 = 0, $252 = 0, $253 = 0, $255 = 0, $256 = 0, $261 = 0, $262 = 0, $265 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $282 = 0, $292 = 0, $296 = 0, $30 = 0, $302 = 0, $306 = 0, $309 = 0, $313 = 0, $315 = 0, $316 = 0, $318 = 0, $320 = 0, $322 = 0, $324 = 0, $326 = 0, $328 = 0, $330 = 0, $34 = 0, $340 = 0, $341 = 0, $352 = 0, $354 = 0, $357 = 0, $359 = 0, $362 = 0, $364 = 0, $367 = 0, $37 = 0, $370 = 0, $371 = 0, $373 = 0, $374 = 0, $376 = 0, $377 = 0, $379 = 0, $380 = 0, $385 = 0, $386 = 0, $391 = 0, $399 = 0, $403 = 0, $409 = 0, $41 = 0, $416 = 0, $420 = 0, $428 = 0, $431 = 0, $432 = 0, $433 = 0, $437 = 0, $438 = 0, $44 = 0, $444 = 0, $449 = 0, $450 = 0, $453 = 0, $455 = 0, $458 = 0, $463 = 0, $469 = 0, $47 = 0, $471 = 0, $473 = 0, $475 = 0, $49 = 0, $492 = 0, $494 = 0, $50 = 0, $501 = 0, $502 = 0, $503 = 0, $512 = 0, $514 = 0, $515 = 0, $517 = 0, $52 = 0, $526 = 0, $530 = 0, $532 = 0, $533 = 0, $534 = 0, $54 = 0, $545 = 0, $546 = 0, $547 = 0, $548 = 0, $549 = 0, $550 = 0, $552 = 0, $554 = 0, $555 = 0, $56 = 0, $561 = 0, $563 = 0, $565 = 0, $570 = 0, $572 = 0, $574 = 0, $575 = 0, $576 = 0, $58 = 0, $584 = 0, $585 = 0, $588 = 0, $592 = 0, $595 = 0, $597 = 0, $6 = 0, $60 = 0, $603 = 0, $607 = 0, $611 = 0, $62 = 0, $620 = 0, $621 = 0, $627 = 0, $629 = 0, $633 = 0, $636 = 0, $638 = 0, $64 = 0, $642 = 0, $644 = 0, $649 = 0, $650 = 0, $651 = 0, $657 = 0, $658 = 0, $659 = 0, $663 = 0, $67 = 0, $673 = 0, $675 = 0, $680 = 0, $681 = 0, $682 = 0, $688 = 0, $69 = 0, $690 = 0, $694 = 0, $7 = 0, $70 = 0, $700 = 0, $704 = 0, $71 = 0, $710 = 0, $712 = 0, $718 = 0, $72 = 0, $722 = 0, $723 = 0, $728 = 0, $73 = 0, $734 = 0, $739 = 0, $742 = 0, $743 = 0, $746 = 0, $748 = 0, $750 = 0, $752 = 0, $764 = 0, $769 = 0, $77 = 0, $771 = 0, $774 = 0, $776 = 0, $779 = 0, $782 = 0, $783 = 0, $784 = 0, $786 = 0, $788 = 0, $789 = 0, $791 = 0, $792 = 0, $797 = 0, $798 = 0, $8 = 0, $80 = 0, $812 = 0, $815 = 0, $816 = 0, $822 = 0, $83 = 0, $830 = 0, $836 = 0, $839 = 0, $84 = 0, $840 = 0, $841 = 0, $845 = 0, $846 = 0, $852 = 0, $857 = 0, $858 = 0, $861 = 0, $863 = 0, $866 = 0, $87 = 0, $871 = 0, $877 = 0, $879 = 0, $881 = 0, $882 = 0, $9 = 0, $900 = 0, $902 = 0, $909 = 0, $910 = 0, $911 = 0, $919 = 0, $92 = 0, $923 = 0, $927 = 0, $929 = 0, $93 = 0, $935 = 0, $936 = 0, $938 = 0, $939 = 0, $941 = 0, $943 = 0, $948 = 0, $949 = 0, $95 = 0, $950 = 0, $956 = 0, $958 = 0, $96 = 0, $964 = 0, $969 = 0, $972 = 0, $973 = 0, $974 = 0, $978 = 0, $979 = 0, $98 = 0, $985 = 0, $990 = 0, $991 = 0, $994 = 0, $996 = 0, $999 = 0, label = 0, sp = 0, $958$looptemp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16 | 0;
 $1 = sp;
 do if ($0 >>> 0 < 245) {
  $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8;
  $7 = $6 >>> 3;
  $8 = HEAP32[868] | 0;
  $9 = $8 >>> $7;
  if ($9 & 3 | 0) {
   $14 = ($9 & 1 ^ 1) + $7 | 0;
   $16 = 3512 + ($14 << 1 << 2) | 0;
   $17 = $16 + 8 | 0;
   $18 = HEAP32[$17 >> 2] | 0;
   $19 = $18 + 8 | 0;
   $20 = HEAP32[$19 >> 2] | 0;
   do if (($20 | 0) == ($16 | 0)) HEAP32[868] = $8 & ~(1 << $14); else {
    if ((HEAP32[872] | 0) >>> 0 > $20 >>> 0) _abort();
    $27 = $20 + 12 | 0;
    if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
     HEAP32[$27 >> 2] = $16;
     HEAP32[$17 >> 2] = $20;
     break;
    } else _abort();
   } while (0);
   $30 = $14 << 3;
   HEAP32[$18 + 4 >> 2] = $30 | 3;
   $34 = $18 + $30 + 4 | 0;
   HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1;
   $$0 = $19;
   STACKTOP = sp;
   return $$0 | 0;
  }
  $37 = HEAP32[870] | 0;
  if ($6 >>> 0 > $37 >>> 0) {
   if ($9 | 0) {
    $41 = 2 << $7;
    $44 = $9 << $7 & ($41 | 0 - $41);
    $47 = ($44 & 0 - $44) + -1 | 0;
    $49 = $47 >>> 12 & 16;
    $50 = $47 >>> $49;
    $52 = $50 >>> 5 & 8;
    $54 = $50 >>> $52;
    $56 = $54 >>> 2 & 4;
    $58 = $54 >>> $56;
    $60 = $58 >>> 1 & 2;
    $62 = $58 >>> $60;
    $64 = $62 >>> 1 & 1;
    $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0;
    $69 = 3512 + ($67 << 1 << 2) | 0;
    $70 = $69 + 8 | 0;
    $71 = HEAP32[$70 >> 2] | 0;
    $72 = $71 + 8 | 0;
    $73 = HEAP32[$72 >> 2] | 0;
    do if (($73 | 0) == ($69 | 0)) {
     $77 = $8 & ~(1 << $67);
     HEAP32[868] = $77;
     $98 = $77;
    } else {
     if ((HEAP32[872] | 0) >>> 0 > $73 >>> 0) _abort();
     $80 = $73 + 12 | 0;
     if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
      HEAP32[$80 >> 2] = $69;
      HEAP32[$70 >> 2] = $73;
      $98 = $8;
      break;
     } else _abort();
    } while (0);
    $83 = $67 << 3;
    $84 = $83 - $6 | 0;
    HEAP32[$71 + 4 >> 2] = $6 | 3;
    $87 = $71 + $6 | 0;
    HEAP32[$87 + 4 >> 2] = $84 | 1;
    HEAP32[$71 + $83 >> 2] = $84;
    if ($37 | 0) {
     $92 = HEAP32[873] | 0;
     $93 = $37 >>> 3;
     $95 = 3512 + ($93 << 1 << 2) | 0;
     $96 = 1 << $93;
     if (!($98 & $96)) {
      HEAP32[868] = $98 | $96;
      $$0199 = $95;
      $$pre$phiZ2D = $95 + 8 | 0;
     } else {
      $101 = $95 + 8 | 0;
      $102 = HEAP32[$101 >> 2] | 0;
      if ((HEAP32[872] | 0) >>> 0 > $102 >>> 0) _abort(); else {
       $$0199 = $102;
       $$pre$phiZ2D = $101;
      }
     }
     HEAP32[$$pre$phiZ2D >> 2] = $92;
     HEAP32[$$0199 + 12 >> 2] = $92;
     HEAP32[$92 + 8 >> 2] = $$0199;
     HEAP32[$92 + 12 >> 2] = $95;
    }
    HEAP32[870] = $84;
    HEAP32[873] = $87;
    $$0 = $72;
    STACKTOP = sp;
    return $$0 | 0;
   }
   $108 = HEAP32[869] | 0;
   if (!$108) $$0197 = $6; else {
    $112 = ($108 & 0 - $108) + -1 | 0;
    $114 = $112 >>> 12 & 16;
    $115 = $112 >>> $114;
    $117 = $115 >>> 5 & 8;
    $119 = $115 >>> $117;
    $121 = $119 >>> 2 & 4;
    $123 = $119 >>> $121;
    $125 = $123 >>> 1 & 2;
    $127 = $123 >>> $125;
    $129 = $127 >>> 1 & 1;
    $134 = HEAP32[3776 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0;
    $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0;
    $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0;
    if (!$143) {
     $$0192$lcssa$i = $134;
     $$0193$lcssa$i = $138;
    } else {
     $$01926$i = $134;
     $$01935$i = $138;
     $146 = $143;
     while (1) {
      $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0;
      $150 = $149 >>> 0 < $$01935$i >>> 0;
      $$$0193$i = $150 ? $149 : $$01935$i;
      $$$0192$i = $150 ? $146 : $$01926$i;
      $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0;
      if (!$146) {
       $$0192$lcssa$i = $$$0192$i;
       $$0193$lcssa$i = $$$0193$i;
       break;
      } else {
       $$01926$i = $$$0192$i;
       $$01935$i = $$$0193$i;
      }
     }
    }
    $157 = HEAP32[872] | 0;
    if ($157 >>> 0 > $$0192$lcssa$i >>> 0) _abort();
    $159 = $$0192$lcssa$i + $6 | 0;
    if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) _abort();
    $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0;
    $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0;
    do if (($164 | 0) == ($$0192$lcssa$i | 0)) {
     $175 = $$0192$lcssa$i + 20 | 0;
     $176 = HEAP32[$175 >> 2] | 0;
     if (!$176) {
      $178 = $$0192$lcssa$i + 16 | 0;
      $179 = HEAP32[$178 >> 2] | 0;
      if (!$179) {
       $$3$i = 0;
       break;
      } else {
       $$1196$i = $179;
       $$1198$i = $178;
      }
     } else {
      $$1196$i = $176;
      $$1198$i = $175;
     }
     while (1) {
      $181 = $$1196$i + 20 | 0;
      $182 = HEAP32[$181 >> 2] | 0;
      if ($182 | 0) {
       $$1196$i = $182;
       $$1198$i = $181;
       continue;
      }
      $184 = $$1196$i + 16 | 0;
      $185 = HEAP32[$184 >> 2] | 0;
      if (!$185) break; else {
       $$1196$i = $185;
       $$1198$i = $184;
      }
     }
     if ($157 >>> 0 > $$1198$i >>> 0) _abort(); else {
      HEAP32[$$1198$i >> 2] = 0;
      $$3$i = $$1196$i;
      break;
     }
    } else {
     $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0;
     if ($157 >>> 0 > $167 >>> 0) _abort();
     $169 = $167 + 12 | 0;
     if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) _abort();
     $172 = $164 + 8 | 0;
     if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
      HEAP32[$169 >> 2] = $164;
      HEAP32[$172 >> 2] = $167;
      $$3$i = $164;
      break;
     } else _abort();
    } while (0);
    L73 : do if ($162 | 0) {
     $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0;
     $191 = 3776 + ($190 << 2) | 0;
     do if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
      HEAP32[$191 >> 2] = $$3$i;
      if (!$$3$i) {
       HEAP32[869] = $108 & ~(1 << $190);
       break L73;
      }
     } else if ((HEAP32[872] | 0) >>> 0 > $162 >>> 0) _abort(); else {
      HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i;
      if (!$$3$i) break L73; else break;
     } while (0);
     $204 = HEAP32[872] | 0;
     if ($204 >>> 0 > $$3$i >>> 0) _abort();
     HEAP32[$$3$i + 24 >> 2] = $162;
     $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0;
     do if ($208 | 0) if ($204 >>> 0 > $208 >>> 0) _abort(); else {
      HEAP32[$$3$i + 16 >> 2] = $208;
      HEAP32[$208 + 24 >> 2] = $$3$i;
      break;
     } while (0);
     $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0;
     if ($214 | 0) if ((HEAP32[872] | 0) >>> 0 > $214 >>> 0) _abort(); else {
      HEAP32[$$3$i + 20 >> 2] = $214;
      HEAP32[$214 + 24 >> 2] = $$3$i;
      break;
     }
    } while (0);
    if ($$0193$lcssa$i >>> 0 < 16) {
     $221 = $$0193$lcssa$i + $6 | 0;
     HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3;
     $225 = $$0192$lcssa$i + $221 + 4 | 0;
     HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1;
    } else {
     HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3;
     HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1;
     HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i;
     if ($37 | 0) {
      $234 = HEAP32[873] | 0;
      $235 = $37 >>> 3;
      $237 = 3512 + ($235 << 1 << 2) | 0;
      $238 = 1 << $235;
      if (!($8 & $238)) {
       HEAP32[868] = $8 | $238;
       $$0189$i = $237;
       $$pre$phi$iZ2D = $237 + 8 | 0;
      } else {
       $242 = $237 + 8 | 0;
       $243 = HEAP32[$242 >> 2] | 0;
       if ((HEAP32[872] | 0) >>> 0 > $243 >>> 0) _abort(); else {
        $$0189$i = $243;
        $$pre$phi$iZ2D = $242;
       }
      }
      HEAP32[$$pre$phi$iZ2D >> 2] = $234;
      HEAP32[$$0189$i + 12 >> 2] = $234;
      HEAP32[$234 + 8 >> 2] = $$0189$i;
      HEAP32[$234 + 12 >> 2] = $237;
     }
     HEAP32[870] = $$0193$lcssa$i;
     HEAP32[873] = $159;
    }
    $$0 = $$0192$lcssa$i + 8 | 0;
    STACKTOP = sp;
    return $$0 | 0;
   }
  } else $$0197 = $6;
 } else if ($0 >>> 0 > 4294967231) $$0197 = -1; else {
  $251 = $0 + 11 | 0;
  $252 = $251 & -8;
  $253 = HEAP32[869] | 0;
  if (!$253) $$0197 = $252; else {
   $255 = 0 - $252 | 0;
   $256 = $251 >>> 8;
   if (!$256) $$0358$i = 0; else if ($252 >>> 0 > 16777215) $$0358$i = 31; else {
    $261 = ($256 + 1048320 | 0) >>> 16 & 8;
    $262 = $256 << $261;
    $265 = ($262 + 520192 | 0) >>> 16 & 4;
    $267 = $262 << $265;
    $270 = ($267 + 245760 | 0) >>> 16 & 2;
    $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0;
    $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1;
   }
   $282 = HEAP32[3776 + ($$0358$i << 2) >> 2] | 0;
   L117 : do if (!$282) {
    $$2355$i = 0;
    $$3$i203 = 0;
    $$3350$i = $255;
    label = 81;
   } else {
    $$0342$i = 0;
    $$0347$i = $255;
    $$0353$i = $282;
    $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0);
    $$0362$i = 0;
    while (1) {
     $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0;
     if ($292 >>> 0 < $$0347$i >>> 0) if (!$292) {
      $$414$i = $$0353$i;
      $$435113$i = 0;
      $$435712$i = $$0353$i;
      label = 85;
      break L117;
     } else {
      $$1343$i = $$0353$i;
      $$1348$i = $292;
     } else {
      $$1343$i = $$0342$i;
      $$1348$i = $$0347$i;
     }
     $296 = HEAP32[$$0353$i + 20 >> 2] | 0;
     $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0;
     $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296;
     $302 = ($$0353$i | 0) == 0;
     if ($302) {
      $$2355$i = $$1363$i;
      $$3$i203 = $$1343$i;
      $$3350$i = $$1348$i;
      label = 81;
      break;
     } else {
      $$0342$i = $$1343$i;
      $$0347$i = $$1348$i;
      $$0359$i = $$0359$i << (($302 ^ 1) & 1);
      $$0362$i = $$1363$i;
     }
    }
   } while (0);
   if ((label | 0) == 81) {
    if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
     $306 = 2 << $$0358$i;
     $309 = $253 & ($306 | 0 - $306);
     if (!$309) {
      $$0197 = $252;
      break;
     }
     $313 = ($309 & 0 - $309) + -1 | 0;
     $315 = $313 >>> 12 & 16;
     $316 = $313 >>> $315;
     $318 = $316 >>> 5 & 8;
     $320 = $316 >>> $318;
     $322 = $320 >>> 2 & 4;
     $324 = $320 >>> $322;
     $326 = $324 >>> 1 & 2;
     $328 = $324 >>> $326;
     $330 = $328 >>> 1 & 1;
     $$4$ph$i = 0;
     $$4357$ph$i = HEAP32[3776 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0;
    } else {
     $$4$ph$i = $$3$i203;
     $$4357$ph$i = $$2355$i;
    }
    if (!$$4357$ph$i) {
     $$4$lcssa$i = $$4$ph$i;
     $$4351$lcssa$i = $$3350$i;
    } else {
     $$414$i = $$4$ph$i;
     $$435113$i = $$3350$i;
     $$435712$i = $$4357$ph$i;
     label = 85;
    }
   }
   if ((label | 0) == 85) while (1) {
    label = 0;
    $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0;
    $341 = $340 >>> 0 < $$435113$i >>> 0;
    $$$4351$i = $341 ? $340 : $$435113$i;
    $$4357$$4$i = $341 ? $$435712$i : $$414$i;
    $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0;
    if (!$$435712$i) {
     $$4$lcssa$i = $$4357$$4$i;
     $$4351$lcssa$i = $$$4351$i;
     break;
    } else {
     $$414$i = $$4357$$4$i;
     $$435113$i = $$$4351$i;
     label = 85;
    }
   }
   if (!$$4$lcssa$i) $$0197 = $252; else if ($$4351$lcssa$i >>> 0 < ((HEAP32[870] | 0) - $252 | 0) >>> 0) {
    $352 = HEAP32[872] | 0;
    if ($352 >>> 0 > $$4$lcssa$i >>> 0) _abort();
    $354 = $$4$lcssa$i + $252 | 0;
    if ($354 >>> 0 <= $$4$lcssa$i >>> 0) _abort();
    $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0;
    $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0;
    do if (($359 | 0) == ($$4$lcssa$i | 0)) {
     $370 = $$4$lcssa$i + 20 | 0;
     $371 = HEAP32[$370 >> 2] | 0;
     if (!$371) {
      $373 = $$4$lcssa$i + 16 | 0;
      $374 = HEAP32[$373 >> 2] | 0;
      if (!$374) {
       $$3372$i = 0;
       break;
      } else {
       $$1370$i = $374;
       $$1374$i = $373;
      }
     } else {
      $$1370$i = $371;
      $$1374$i = $370;
     }
     while (1) {
      $376 = $$1370$i + 20 | 0;
      $377 = HEAP32[$376 >> 2] | 0;
      if ($377 | 0) {
       $$1370$i = $377;
       $$1374$i = $376;
       continue;
      }
      $379 = $$1370$i + 16 | 0;
      $380 = HEAP32[$379 >> 2] | 0;
      if (!$380) break; else {
       $$1370$i = $380;
       $$1374$i = $379;
      }
     }
     if ($352 >>> 0 > $$1374$i >>> 0) _abort(); else {
      HEAP32[$$1374$i >> 2] = 0;
      $$3372$i = $$1370$i;
      break;
     }
    } else {
     $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0;
     if ($352 >>> 0 > $362 >>> 0) _abort();
     $364 = $362 + 12 | 0;
     if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) _abort();
     $367 = $359 + 8 | 0;
     if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
      HEAP32[$364 >> 2] = $359;
      HEAP32[$367 >> 2] = $362;
      $$3372$i = $359;
      break;
     } else _abort();
    } while (0);
    L164 : do if (!$357) $475 = $253; else {
     $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0;
     $386 = 3776 + ($385 << 2) | 0;
     do if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
      HEAP32[$386 >> 2] = $$3372$i;
      if (!$$3372$i) {
       $391 = $253 & ~(1 << $385);
       HEAP32[869] = $391;
       $475 = $391;
       break L164;
      }
     } else if ((HEAP32[872] | 0) >>> 0 > $357 >>> 0) _abort(); else {
      HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i;
      if (!$$3372$i) {
       $475 = $253;
       break L164;
      } else break;
     } while (0);
     $399 = HEAP32[872] | 0;
     if ($399 >>> 0 > $$3372$i >>> 0) _abort();
     HEAP32[$$3372$i + 24 >> 2] = $357;
     $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0;
     do if ($403 | 0) if ($399 >>> 0 > $403 >>> 0) _abort(); else {
      HEAP32[$$3372$i + 16 >> 2] = $403;
      HEAP32[$403 + 24 >> 2] = $$3372$i;
      break;
     } while (0);
     $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0;
     if (!$409) $475 = $253; else if ((HEAP32[872] | 0) >>> 0 > $409 >>> 0) _abort(); else {
      HEAP32[$$3372$i + 20 >> 2] = $409;
      HEAP32[$409 + 24 >> 2] = $$3372$i;
      $475 = $253;
      break;
     }
    } while (0);
    do if ($$4351$lcssa$i >>> 0 < 16) {
     $416 = $$4351$lcssa$i + $252 | 0;
     HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3;
     $420 = $$4$lcssa$i + $416 + 4 | 0;
     HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1;
    } else {
     HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3;
     HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1;
     HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i;
     $428 = $$4351$lcssa$i >>> 3;
     if ($$4351$lcssa$i >>> 0 < 256) {
      $431 = 3512 + ($428 << 1 << 2) | 0;
      $432 = HEAP32[868] | 0;
      $433 = 1 << $428;
      if (!($432 & $433)) {
       HEAP32[868] = $432 | $433;
       $$0368$i = $431;
       $$pre$phi$i211Z2D = $431 + 8 | 0;
      } else {
       $437 = $431 + 8 | 0;
       $438 = HEAP32[$437 >> 2] | 0;
       if ((HEAP32[872] | 0) >>> 0 > $438 >>> 0) _abort(); else {
        $$0368$i = $438;
        $$pre$phi$i211Z2D = $437;
       }
      }
      HEAP32[$$pre$phi$i211Z2D >> 2] = $354;
      HEAP32[$$0368$i + 12 >> 2] = $354;
      HEAP32[$354 + 8 >> 2] = $$0368$i;
      HEAP32[$354 + 12 >> 2] = $431;
      break;
     }
     $444 = $$4351$lcssa$i >>> 8;
     if (!$444) $$0361$i = 0; else if ($$4351$lcssa$i >>> 0 > 16777215) $$0361$i = 31; else {
      $449 = ($444 + 1048320 | 0) >>> 16 & 8;
      $450 = $444 << $449;
      $453 = ($450 + 520192 | 0) >>> 16 & 4;
      $455 = $450 << $453;
      $458 = ($455 + 245760 | 0) >>> 16 & 2;
      $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0;
      $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1;
     }
     $469 = 3776 + ($$0361$i << 2) | 0;
     HEAP32[$354 + 28 >> 2] = $$0361$i;
     $471 = $354 + 16 | 0;
     HEAP32[$471 + 4 >> 2] = 0;
     HEAP32[$471 >> 2] = 0;
     $473 = 1 << $$0361$i;
     if (!($475 & $473)) {
      HEAP32[869] = $475 | $473;
      HEAP32[$469 >> 2] = $354;
      HEAP32[$354 + 24 >> 2] = $469;
      HEAP32[$354 + 12 >> 2] = $354;
      HEAP32[$354 + 8 >> 2] = $354;
      break;
     }
     $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0);
     $$0345$i = HEAP32[$469 >> 2] | 0;
     while (1) {
      if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
       label = 139;
       break;
      }
      $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0;
      $494 = HEAP32[$492 >> 2] | 0;
      if (!$494) {
       label = 136;
       break;
      } else {
       $$0344$i = $$0344$i << 1;
       $$0345$i = $494;
      }
     }
     if ((label | 0) == 136) if ((HEAP32[872] | 0) >>> 0 > $492 >>> 0) _abort(); else {
      HEAP32[$492 >> 2] = $354;
      HEAP32[$354 + 24 >> 2] = $$0345$i;
      HEAP32[$354 + 12 >> 2] = $354;
      HEAP32[$354 + 8 >> 2] = $354;
      break;
     } else if ((label | 0) == 139) {
      $501 = $$0345$i + 8 | 0;
      $502 = HEAP32[$501 >> 2] | 0;
      $503 = HEAP32[872] | 0;
      if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
       HEAP32[$502 + 12 >> 2] = $354;
       HEAP32[$501 >> 2] = $354;
       HEAP32[$354 + 8 >> 2] = $502;
       HEAP32[$354 + 12 >> 2] = $$0345$i;
       HEAP32[$354 + 24 >> 2] = 0;
       break;
      } else _abort();
     }
    } while (0);
    $$0 = $$4$lcssa$i + 8 | 0;
    STACKTOP = sp;
    return $$0 | 0;
   } else $$0197 = $252;
  }
 } while (0);
 $512 = HEAP32[870] | 0;
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0;
  $515 = HEAP32[873] | 0;
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0;
   HEAP32[873] = $517;
   HEAP32[870] = $514;
   HEAP32[$517 + 4 >> 2] = $514 | 1;
   HEAP32[$515 + $512 >> 2] = $514;
   HEAP32[$515 + 4 >> 2] = $$0197 | 3;
  } else {
   HEAP32[870] = 0;
   HEAP32[873] = 0;
   HEAP32[$515 + 4 >> 2] = $512 | 3;
   $526 = $515 + $512 + 4 | 0;
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1;
  }
  $$0 = $515 + 8 | 0;
  STACKTOP = sp;
  return $$0 | 0;
 }
 $530 = HEAP32[871] | 0;
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0;
  HEAP32[871] = $532;
  $533 = HEAP32[874] | 0;
  $534 = $533 + $$0197 | 0;
  HEAP32[874] = $534;
  HEAP32[$534 + 4 >> 2] = $532 | 1;
  HEAP32[$533 + 4 >> 2] = $$0197 | 3;
  $$0 = $533 + 8 | 0;
  STACKTOP = sp;
  return $$0 | 0;
 }
 if (!(HEAP32[986] | 0)) {
  HEAP32[988] = 4096;
  HEAP32[987] = 4096;
  HEAP32[989] = -1;
  HEAP32[990] = -1;
  HEAP32[991] = 0;
  HEAP32[979] = 0;
  HEAP32[986] = $1 & -16 ^ 1431655768;
  $548 = 4096;
 } else $548 = HEAP32[988] | 0;
 $545 = $$0197 + 48 | 0;
 $546 = $$0197 + 47 | 0;
 $547 = $548 + $546 | 0;
 $549 = 0 - $548 | 0;
 $550 = $547 & $549;
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0;
  STACKTOP = sp;
  return $$0 | 0;
 }
 $552 = HEAP32[978] | 0;
 if ($552 | 0) {
  $554 = HEAP32[976] | 0;
  $555 = $554 + $550 | 0;
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0;
   STACKTOP = sp;
   return $$0 | 0;
  }
 }
 L244 : do if (!(HEAP32[979] & 4)) {
  $561 = HEAP32[874] | 0;
  L246 : do if (!$561) label = 163; else {
   $$0$i$i = 3920;
   while (1) {
    $563 = HEAP32[$$0$i$i >> 2] | 0;
    if ($563 >>> 0 <= $561 >>> 0) {
     $565 = $$0$i$i + 4 | 0;
     if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) break;
    }
    $570 = HEAP32[$$0$i$i + 8 >> 2] | 0;
    if (!$570) {
     label = 163;
     break L246;
    } else $$0$i$i = $570;
   }
   $595 = $547 - $530 & $549;
   if ($595 >>> 0 < 2147483647) {
    $597 = _sbrk($595 | 0) | 0;
    if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) if (($597 | 0) == (-1 | 0)) $$2234243136$i = $595; else {
     $$723947$i = $595;
     $$748$i = $597;
     label = 180;
     break L244;
    } else {
     $$2247$ph$i = $597;
     $$2253$ph$i = $595;
     label = 171;
    }
   } else $$2234243136$i = 0;
  } while (0);
  do if ((label | 0) == 163) {
   $572 = _sbrk(0) | 0;
   if (($572 | 0) == (-1 | 0)) $$2234243136$i = 0; else {
    $574 = $572;
    $575 = HEAP32[987] | 0;
    $576 = $575 + -1 | 0;
    $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0;
    $584 = HEAP32[976] | 0;
    $585 = $$$i + $584 | 0;
    if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
     $588 = HEAP32[978] | 0;
     if ($588 | 0) if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
      $$2234243136$i = 0;
      break;
     }
     $592 = _sbrk($$$i | 0) | 0;
     if (($592 | 0) == ($572 | 0)) {
      $$723947$i = $$$i;
      $$748$i = $572;
      label = 180;
      break L244;
     } else {
      $$2247$ph$i = $592;
      $$2253$ph$i = $$$i;
      label = 171;
     }
    } else $$2234243136$i = 0;
   }
  } while (0);
  do if ((label | 0) == 171) {
   $603 = 0 - $$2253$ph$i | 0;
   if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) if (($$2247$ph$i | 0) == (-1 | 0)) {
    $$2234243136$i = 0;
    break;
   } else {
    $$723947$i = $$2253$ph$i;
    $$748$i = $$2247$ph$i;
    label = 180;
    break L244;
   }
   $607 = HEAP32[988] | 0;
   $611 = $546 - $$2253$ph$i + $607 & 0 - $607;
   if ($611 >>> 0 >= 2147483647) {
    $$723947$i = $$2253$ph$i;
    $$748$i = $$2247$ph$i;
    label = 180;
    break L244;
   }
   if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
    _sbrk($603 | 0) | 0;
    $$2234243136$i = 0;
    break;
   } else {
    $$723947$i = $611 + $$2253$ph$i | 0;
    $$748$i = $$2247$ph$i;
    label = 180;
    break L244;
   }
  } while (0);
  HEAP32[979] = HEAP32[979] | 4;
  $$4236$i = $$2234243136$i;
  label = 178;
 } else {
  $$4236$i = 0;
  label = 178;
 } while (0);
 if ((label | 0) == 178) if ($550 >>> 0 < 2147483647) {
  $620 = _sbrk($550 | 0) | 0;
  $621 = _sbrk(0) | 0;
  $627 = $621 - $620 | 0;
  $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0;
  if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
   $$723947$i = $629 ? $627 : $$4236$i;
   $$748$i = $620;
   label = 180;
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[976] | 0) + $$723947$i | 0;
  HEAP32[976] = $633;
  if ($633 >>> 0 > (HEAP32[977] | 0) >>> 0) HEAP32[977] = $633;
  $636 = HEAP32[874] | 0;
  do if (!$636) {
   $638 = HEAP32[872] | 0;
   if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) HEAP32[872] = $$748$i;
   HEAP32[980] = $$748$i;
   HEAP32[981] = $$723947$i;
   HEAP32[983] = 0;
   HEAP32[877] = HEAP32[986];
   HEAP32[876] = -1;
   HEAP32[881] = 3512;
   HEAP32[880] = 3512;
   HEAP32[883] = 3520;
   HEAP32[882] = 3520;
   HEAP32[885] = 3528;
   HEAP32[884] = 3528;
   HEAP32[887] = 3536;
   HEAP32[886] = 3536;
   HEAP32[889] = 3544;
   HEAP32[888] = 3544;
   HEAP32[891] = 3552;
   HEAP32[890] = 3552;
   HEAP32[893] = 3560;
   HEAP32[892] = 3560;
   HEAP32[895] = 3568;
   HEAP32[894] = 3568;
   HEAP32[897] = 3576;
   HEAP32[896] = 3576;
   HEAP32[899] = 3584;
   HEAP32[898] = 3584;
   HEAP32[901] = 3592;
   HEAP32[900] = 3592;
   HEAP32[903] = 3600;
   HEAP32[902] = 3600;
   HEAP32[905] = 3608;
   HEAP32[904] = 3608;
   HEAP32[907] = 3616;
   HEAP32[906] = 3616;
   HEAP32[909] = 3624;
   HEAP32[908] = 3624;
   HEAP32[911] = 3632;
   HEAP32[910] = 3632;
   HEAP32[913] = 3640;
   HEAP32[912] = 3640;
   HEAP32[915] = 3648;
   HEAP32[914] = 3648;
   HEAP32[917] = 3656;
   HEAP32[916] = 3656;
   HEAP32[919] = 3664;
   HEAP32[918] = 3664;
   HEAP32[921] = 3672;
   HEAP32[920] = 3672;
   HEAP32[923] = 3680;
   HEAP32[922] = 3680;
   HEAP32[925] = 3688;
   HEAP32[924] = 3688;
   HEAP32[927] = 3696;
   HEAP32[926] = 3696;
   HEAP32[929] = 3704;
   HEAP32[928] = 3704;
   HEAP32[931] = 3712;
   HEAP32[930] = 3712;
   HEAP32[933] = 3720;
   HEAP32[932] = 3720;
   HEAP32[935] = 3728;
   HEAP32[934] = 3728;
   HEAP32[937] = 3736;
   HEAP32[936] = 3736;
   HEAP32[939] = 3744;
   HEAP32[938] = 3744;
   HEAP32[941] = 3752;
   HEAP32[940] = 3752;
   HEAP32[943] = 3760;
   HEAP32[942] = 3760;
   $642 = $$723947$i + -40 | 0;
   $644 = $$748$i + 8 | 0;
   $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7;
   $650 = $$748$i + $649 | 0;
   $651 = $642 - $649 | 0;
   HEAP32[874] = $650;
   HEAP32[871] = $651;
   HEAP32[$650 + 4 >> 2] = $651 | 1;
   HEAP32[$$748$i + $642 + 4 >> 2] = 40;
   HEAP32[875] = HEAP32[990];
  } else {
   $$024367$i = 3920;
   while (1) {
    $657 = HEAP32[$$024367$i >> 2] | 0;
    $658 = $$024367$i + 4 | 0;
    $659 = HEAP32[$658 >> 2] | 0;
    if (($$748$i | 0) == ($657 + $659 | 0)) {
     label = 188;
     break;
    }
    $663 = HEAP32[$$024367$i + 8 >> 2] | 0;
    if (!$663) break; else $$024367$i = $663;
   }
   if ((label | 0) == 188) if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
    HEAP32[$658 >> 2] = $659 + $$723947$i;
    $673 = (HEAP32[871] | 0) + $$723947$i | 0;
    $675 = $636 + 8 | 0;
    $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7;
    $681 = $636 + $680 | 0;
    $682 = $673 - $680 | 0;
    HEAP32[874] = $681;
    HEAP32[871] = $682;
    HEAP32[$681 + 4 >> 2] = $682 | 1;
    HEAP32[$636 + $673 + 4 >> 2] = 40;
    HEAP32[875] = HEAP32[990];
    break;
   }
   $688 = HEAP32[872] | 0;
   if ($$748$i >>> 0 < $688 >>> 0) {
    HEAP32[872] = $$748$i;
    $752 = $$748$i;
   } else $752 = $688;
   $690 = $$748$i + $$723947$i | 0;
   $$124466$i = 3920;
   while (1) {
    if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
     label = 196;
     break;
    }
    $694 = HEAP32[$$124466$i + 8 >> 2] | 0;
    if (!$694) {
     $$0$i$i$i = 3920;
     break;
    } else $$124466$i = $694;
   }
   if ((label | 0) == 196) if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
    HEAP32[$$124466$i >> 2] = $$748$i;
    $700 = $$124466$i + 4 | 0;
    HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i;
    $704 = $$748$i + 8 | 0;
    $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0;
    $712 = $690 + 8 | 0;
    $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0;
    $722 = $710 + $$0197 | 0;
    $723 = $718 - $710 - $$0197 | 0;
    HEAP32[$710 + 4 >> 2] = $$0197 | 3;
    do if (($636 | 0) == ($718 | 0)) {
     $728 = (HEAP32[871] | 0) + $723 | 0;
     HEAP32[871] = $728;
     HEAP32[874] = $722;
     HEAP32[$722 + 4 >> 2] = $728 | 1;
    } else {
     if ((HEAP32[873] | 0) == ($718 | 0)) {
      $734 = (HEAP32[870] | 0) + $723 | 0;
      HEAP32[870] = $734;
      HEAP32[873] = $722;
      HEAP32[$722 + 4 >> 2] = $734 | 1;
      HEAP32[$722 + $734 >> 2] = $734;
      break;
     }
     $739 = HEAP32[$718 + 4 >> 2] | 0;
     if (($739 & 3 | 0) == 1) {
      $742 = $739 & -8;
      $743 = $739 >>> 3;
      L311 : do if ($739 >>> 0 < 256) {
       $746 = HEAP32[$718 + 8 >> 2] | 0;
       $748 = HEAP32[$718 + 12 >> 2] | 0;
       $750 = 3512 + ($743 << 1 << 2) | 0;
       do if (($746 | 0) != ($750 | 0)) {
        if ($752 >>> 0 > $746 >>> 0) _abort();
        if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) break;
        _abort();
       } while (0);
       if (($748 | 0) == ($746 | 0)) {
        HEAP32[868] = HEAP32[868] & ~(1 << $743);
        break;
       }
       do if (($748 | 0) == ($750 | 0)) $$pre$phi11$i$iZ2D = $748 + 8 | 0; else {
        if ($752 >>> 0 > $748 >>> 0) _abort();
        $764 = $748 + 8 | 0;
        if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
         $$pre$phi11$i$iZ2D = $764;
         break;
        }
        _abort();
       } while (0);
       HEAP32[$746 + 12 >> 2] = $748;
       HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746;
      } else {
       $769 = HEAP32[$718 + 24 >> 2] | 0;
       $771 = HEAP32[$718 + 12 >> 2] | 0;
       do if (($771 | 0) == ($718 | 0)) {
        $782 = $718 + 16 | 0;
        $783 = $782 + 4 | 0;
        $784 = HEAP32[$783 >> 2] | 0;
        if (!$784) {
         $786 = HEAP32[$782 >> 2] | 0;
         if (!$786) {
          $$3$i$i = 0;
          break;
         } else {
          $$1291$i$i = $786;
          $$1293$i$i = $782;
         }
        } else {
         $$1291$i$i = $784;
         $$1293$i$i = $783;
        }
        while (1) {
         $788 = $$1291$i$i + 20 | 0;
         $789 = HEAP32[$788 >> 2] | 0;
         if ($789 | 0) {
          $$1291$i$i = $789;
          $$1293$i$i = $788;
          continue;
         }
         $791 = $$1291$i$i + 16 | 0;
         $792 = HEAP32[$791 >> 2] | 0;
         if (!$792) break; else {
          $$1291$i$i = $792;
          $$1293$i$i = $791;
         }
        }
        if ($752 >>> 0 > $$1293$i$i >>> 0) _abort(); else {
         HEAP32[$$1293$i$i >> 2] = 0;
         $$3$i$i = $$1291$i$i;
         break;
        }
       } else {
        $774 = HEAP32[$718 + 8 >> 2] | 0;
        if ($752 >>> 0 > $774 >>> 0) _abort();
        $776 = $774 + 12 | 0;
        if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) _abort();
        $779 = $771 + 8 | 0;
        if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
         HEAP32[$776 >> 2] = $771;
         HEAP32[$779 >> 2] = $774;
         $$3$i$i = $771;
         break;
        } else _abort();
       } while (0);
       if (!$769) break;
       $797 = HEAP32[$718 + 28 >> 2] | 0;
       $798 = 3776 + ($797 << 2) | 0;
       do if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
        HEAP32[$798 >> 2] = $$3$i$i;
        if ($$3$i$i | 0) break;
        HEAP32[869] = HEAP32[869] & ~(1 << $797);
        break L311;
       } else if ((HEAP32[872] | 0) >>> 0 > $769 >>> 0) _abort(); else {
        HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i;
        if (!$$3$i$i) break L311; else break;
       } while (0);
       $812 = HEAP32[872] | 0;
       if ($812 >>> 0 > $$3$i$i >>> 0) _abort();
       HEAP32[$$3$i$i + 24 >> 2] = $769;
       $815 = $718 + 16 | 0;
       $816 = HEAP32[$815 >> 2] | 0;
       do if ($816 | 0) if ($812 >>> 0 > $816 >>> 0) _abort(); else {
        HEAP32[$$3$i$i + 16 >> 2] = $816;
        HEAP32[$816 + 24 >> 2] = $$3$i$i;
        break;
       } while (0);
       $822 = HEAP32[$815 + 4 >> 2] | 0;
       if (!$822) break;
       if ((HEAP32[872] | 0) >>> 0 > $822 >>> 0) _abort(); else {
        HEAP32[$$3$i$i + 20 >> 2] = $822;
        HEAP32[$822 + 24 >> 2] = $$3$i$i;
        break;
       }
      } while (0);
      $$0$i17$i = $718 + $742 | 0;
      $$0287$i$i = $742 + $723 | 0;
     } else {
      $$0$i17$i = $718;
      $$0287$i$i = $723;
     }
     $830 = $$0$i17$i + 4 | 0;
     HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2;
     HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1;
     HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i;
     $836 = $$0287$i$i >>> 3;
     if ($$0287$i$i >>> 0 < 256) {
      $839 = 3512 + ($836 << 1 << 2) | 0;
      $840 = HEAP32[868] | 0;
      $841 = 1 << $836;
      do if (!($840 & $841)) {
       HEAP32[868] = $840 | $841;
       $$0295$i$i = $839;
       $$pre$phi$i19$iZ2D = $839 + 8 | 0;
      } else {
       $845 = $839 + 8 | 0;
       $846 = HEAP32[$845 >> 2] | 0;
       if ((HEAP32[872] | 0) >>> 0 <= $846 >>> 0) {
        $$0295$i$i = $846;
        $$pre$phi$i19$iZ2D = $845;
        break;
       }
       _abort();
      } while (0);
      HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722;
      HEAP32[$$0295$i$i + 12 >> 2] = $722;
      HEAP32[$722 + 8 >> 2] = $$0295$i$i;
      HEAP32[$722 + 12 >> 2] = $839;
      break;
     }
     $852 = $$0287$i$i >>> 8;
     do if (!$852) $$0296$i$i = 0; else {
      if ($$0287$i$i >>> 0 > 16777215) {
       $$0296$i$i = 31;
       break;
      }
      $857 = ($852 + 1048320 | 0) >>> 16 & 8;
      $858 = $852 << $857;
      $861 = ($858 + 520192 | 0) >>> 16 & 4;
      $863 = $858 << $861;
      $866 = ($863 + 245760 | 0) >>> 16 & 2;
      $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0;
      $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1;
     } while (0);
     $877 = 3776 + ($$0296$i$i << 2) | 0;
     HEAP32[$722 + 28 >> 2] = $$0296$i$i;
     $879 = $722 + 16 | 0;
     HEAP32[$879 + 4 >> 2] = 0;
     HEAP32[$879 >> 2] = 0;
     $881 = HEAP32[869] | 0;
     $882 = 1 << $$0296$i$i;
     if (!($881 & $882)) {
      HEAP32[869] = $881 | $882;
      HEAP32[$877 >> 2] = $722;
      HEAP32[$722 + 24 >> 2] = $877;
      HEAP32[$722 + 12 >> 2] = $722;
      HEAP32[$722 + 8 >> 2] = $722;
      break;
     }
     $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0);
     $$0289$i$i = HEAP32[$877 >> 2] | 0;
     while (1) {
      if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
       label = 263;
       break;
      }
      $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0;
      $902 = HEAP32[$900 >> 2] | 0;
      if (!$902) {
       label = 260;
       break;
      } else {
       $$0288$i$i = $$0288$i$i << 1;
       $$0289$i$i = $902;
      }
     }
     if ((label | 0) == 260) if ((HEAP32[872] | 0) >>> 0 > $900 >>> 0) _abort(); else {
      HEAP32[$900 >> 2] = $722;
      HEAP32[$722 + 24 >> 2] = $$0289$i$i;
      HEAP32[$722 + 12 >> 2] = $722;
      HEAP32[$722 + 8 >> 2] = $722;
      break;
     } else if ((label | 0) == 263) {
      $909 = $$0289$i$i + 8 | 0;
      $910 = HEAP32[$909 >> 2] | 0;
      $911 = HEAP32[872] | 0;
      if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
       HEAP32[$910 + 12 >> 2] = $722;
       HEAP32[$909 >> 2] = $722;
       HEAP32[$722 + 8 >> 2] = $910;
       HEAP32[$722 + 12 >> 2] = $$0289$i$i;
       HEAP32[$722 + 24 >> 2] = 0;
       break;
      } else _abort();
     }
    } while (0);
    $$0 = $710 + 8 | 0;
    STACKTOP = sp;
    return $$0 | 0;
   } else $$0$i$i$i = 3920;
   while (1) {
    $919 = HEAP32[$$0$i$i$i >> 2] | 0;
    if ($919 >>> 0 <= $636 >>> 0) {
     $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0;
     if ($923 >>> 0 > $636 >>> 0) break;
    }
    $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0;
   }
   $927 = $923 + -47 | 0;
   $929 = $927 + 8 | 0;
   $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0;
   $936 = $636 + 16 | 0;
   $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935;
   $939 = $938 + 8 | 0;
   $941 = $$723947$i + -40 | 0;
   $943 = $$748$i + 8 | 0;
   $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7;
   $949 = $$748$i + $948 | 0;
   $950 = $941 - $948 | 0;
   HEAP32[874] = $949;
   HEAP32[871] = $950;
   HEAP32[$949 + 4 >> 2] = $950 | 1;
   HEAP32[$$748$i + $941 + 4 >> 2] = 40;
   HEAP32[875] = HEAP32[990];
   $956 = $938 + 4 | 0;
   HEAP32[$956 >> 2] = 27;
   HEAP32[$939 >> 2] = HEAP32[980];
   HEAP32[$939 + 4 >> 2] = HEAP32[981];
   HEAP32[$939 + 8 >> 2] = HEAP32[982];
   HEAP32[$939 + 12 >> 2] = HEAP32[983];
   HEAP32[980] = $$748$i;
   HEAP32[981] = $$723947$i;
   HEAP32[983] = 0;
   HEAP32[982] = $939;
   $958 = $938 + 24 | 0;
   do {
    $958$looptemp = $958;
    $958 = $958 + 4 | 0;
    HEAP32[$958 >> 2] = 7;
   } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
   if (($938 | 0) != ($636 | 0)) {
    $964 = $938 - $636 | 0;
    HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2;
    HEAP32[$636 + 4 >> 2] = $964 | 1;
    HEAP32[$938 >> 2] = $964;
    $969 = $964 >>> 3;
    if ($964 >>> 0 < 256) {
     $972 = 3512 + ($969 << 1 << 2) | 0;
     $973 = HEAP32[868] | 0;
     $974 = 1 << $969;
     if (!($973 & $974)) {
      HEAP32[868] = $973 | $974;
      $$0211$i$i = $972;
      $$pre$phi$i$iZ2D = $972 + 8 | 0;
     } else {
      $978 = $972 + 8 | 0;
      $979 = HEAP32[$978 >> 2] | 0;
      if ((HEAP32[872] | 0) >>> 0 > $979 >>> 0) _abort(); else {
       $$0211$i$i = $979;
       $$pre$phi$i$iZ2D = $978;
      }
     }
     HEAP32[$$pre$phi$i$iZ2D >> 2] = $636;
     HEAP32[$$0211$i$i + 12 >> 2] = $636;
     HEAP32[$636 + 8 >> 2] = $$0211$i$i;
     HEAP32[$636 + 12 >> 2] = $972;
     break;
    }
    $985 = $964 >>> 8;
    if (!$985) $$0212$i$i = 0; else if ($964 >>> 0 > 16777215) $$0212$i$i = 31; else {
     $990 = ($985 + 1048320 | 0) >>> 16 & 8;
     $991 = $985 << $990;
     $994 = ($991 + 520192 | 0) >>> 16 & 4;
     $996 = $991 << $994;
     $999 = ($996 + 245760 | 0) >>> 16 & 2;
     $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0;
     $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1;
    }
    $1010 = 3776 + ($$0212$i$i << 2) | 0;
    HEAP32[$636 + 28 >> 2] = $$0212$i$i;
    HEAP32[$636 + 20 >> 2] = 0;
    HEAP32[$936 >> 2] = 0;
    $1013 = HEAP32[869] | 0;
    $1014 = 1 << $$0212$i$i;
    if (!($1013 & $1014)) {
     HEAP32[869] = $1013 | $1014;
     HEAP32[$1010 >> 2] = $636;
     HEAP32[$636 + 24 >> 2] = $1010;
     HEAP32[$636 + 12 >> 2] = $636;
     HEAP32[$636 + 8 >> 2] = $636;
     break;
    }
    $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0);
    $$0207$i$i = HEAP32[$1010 >> 2] | 0;
    while (1) {
     if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
      label = 289;
      break;
     }
     $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0;
     $1034 = HEAP32[$1032 >> 2] | 0;
     if (!$1034) {
      label = 286;
      break;
     } else {
      $$0206$i$i = $$0206$i$i << 1;
      $$0207$i$i = $1034;
     }
    }
    if ((label | 0) == 286) if ((HEAP32[872] | 0) >>> 0 > $1032 >>> 0) _abort(); else {
     HEAP32[$1032 >> 2] = $636;
     HEAP32[$636 + 24 >> 2] = $$0207$i$i;
     HEAP32[$636 + 12 >> 2] = $636;
     HEAP32[$636 + 8 >> 2] = $636;
     break;
    } else if ((label | 0) == 289) {
     $1041 = $$0207$i$i + 8 | 0;
     $1042 = HEAP32[$1041 >> 2] | 0;
     $1043 = HEAP32[872] | 0;
     if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
      HEAP32[$1042 + 12 >> 2] = $636;
      HEAP32[$1041 >> 2] = $636;
      HEAP32[$636 + 8 >> 2] = $1042;
      HEAP32[$636 + 12 >> 2] = $$0207$i$i;
      HEAP32[$636 + 24 >> 2] = 0;
      break;
     } else _abort();
    }
   }
  } while (0);
  $1052 = HEAP32[871] | 0;
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0;
   HEAP32[871] = $1054;
   $1055 = HEAP32[874] | 0;
   $1056 = $1055 + $$0197 | 0;
   HEAP32[874] = $1056;
   HEAP32[$1056 + 4 >> 2] = $1054 | 1;
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3;
   $$0 = $1055 + 8 | 0;
   STACKTOP = sp;
   return $$0 | 0;
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12;
 $$0 = 0;
 STACKTOP = sp;
 return $$0 | 0;
}

function _free($0) {
 $0 = $0 | 0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $10 = 0, $105 = 0, $106 = 0, $113 = 0, $115 = 0, $116 = 0, $124 = 0, $13 = 0, $132 = 0, $137 = 0, $138 = 0, $141 = 0, $143 = 0, $145 = 0, $16 = 0, $160 = 0, $165 = 0, $167 = 0, $17 = 0, $170 = 0, $173 = 0, $176 = 0, $179 = 0, $180 = 0, $181 = 0, $183 = 0, $185 = 0, $186 = 0, $188 = 0, $189 = 0, $195 = 0, $196 = 0, $2 = 0, $21 = 0, $210 = 0, $213 = 0, $214 = 0, $220 = 0, $235 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $244 = 0, $245 = 0, $251 = 0, $256 = 0, $257 = 0, $26 = 0, $260 = 0, $262 = 0, $265 = 0, $270 = 0, $276 = 0, $28 = 0, $280 = 0, $281 = 0, $299 = 0, $3 = 0, $301 = 0, $308 = 0, $309 = 0, $310 = 0, $319 = 0, $41 = 0, $46 = 0, $48 = 0, $51 = 0, $53 = 0, $56 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $68 = 0, $69 = 0, $7 = 0, $74 = 0, $75 = 0, $89 = 0, $9 = 0, $92 = 0, $93 = 0, $99 = 0, label = 0;
 if (!$0) return;
 $2 = $0 + -8 | 0;
 $3 = HEAP32[872] | 0;
 if ($2 >>> 0 < $3 >>> 0) _abort();
 $6 = HEAP32[$0 + -4 >> 2] | 0;
 $7 = $6 & 3;
 if (($7 | 0) == 1) _abort();
 $9 = $6 & -8;
 $10 = $2 + $9 | 0;
 L10 : do if (!($6 & 1)) {
  $13 = HEAP32[$2 >> 2] | 0;
  if (!$7) return;
  $16 = $2 + (0 - $13) | 0;
  $17 = $13 + $9 | 0;
  if ($16 >>> 0 < $3 >>> 0) _abort();
  if ((HEAP32[873] | 0) == ($16 | 0)) {
   $105 = $10 + 4 | 0;
   $106 = HEAP32[$105 >> 2] | 0;
   if (($106 & 3 | 0) != 3) {
    $$1 = $16;
    $$1382 = $17;
    $113 = $16;
    break;
   }
   HEAP32[870] = $17;
   HEAP32[$105 >> 2] = $106 & -2;
   HEAP32[$16 + 4 >> 2] = $17 | 1;
   HEAP32[$16 + $17 >> 2] = $17;
   return;
  }
  $21 = $13 >>> 3;
  if ($13 >>> 0 < 256) {
   $24 = HEAP32[$16 + 8 >> 2] | 0;
   $26 = HEAP32[$16 + 12 >> 2] | 0;
   $28 = 3512 + ($21 << 1 << 2) | 0;
   if (($24 | 0) != ($28 | 0)) {
    if ($3 >>> 0 > $24 >>> 0) _abort();
    if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) _abort();
   }
   if (($26 | 0) == ($24 | 0)) {
    HEAP32[868] = HEAP32[868] & ~(1 << $21);
    $$1 = $16;
    $$1382 = $17;
    $113 = $16;
    break;
   }
   if (($26 | 0) == ($28 | 0)) $$pre$phi444Z2D = $26 + 8 | 0; else {
    if ($3 >>> 0 > $26 >>> 0) _abort();
    $41 = $26 + 8 | 0;
    if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) $$pre$phi444Z2D = $41; else _abort();
   }
   HEAP32[$24 + 12 >> 2] = $26;
   HEAP32[$$pre$phi444Z2D >> 2] = $24;
   $$1 = $16;
   $$1382 = $17;
   $113 = $16;
   break;
  }
  $46 = HEAP32[$16 + 24 >> 2] | 0;
  $48 = HEAP32[$16 + 12 >> 2] | 0;
  do if (($48 | 0) == ($16 | 0)) {
   $59 = $16 + 16 | 0;
   $60 = $59 + 4 | 0;
   $61 = HEAP32[$60 >> 2] | 0;
   if (!$61) {
    $63 = HEAP32[$59 >> 2] | 0;
    if (!$63) {
     $$3 = 0;
     break;
    } else {
     $$1387 = $63;
     $$1390 = $59;
    }
   } else {
    $$1387 = $61;
    $$1390 = $60;
   }
   while (1) {
    $65 = $$1387 + 20 | 0;
    $66 = HEAP32[$65 >> 2] | 0;
    if ($66 | 0) {
     $$1387 = $66;
     $$1390 = $65;
     continue;
    }
    $68 = $$1387 + 16 | 0;
    $69 = HEAP32[$68 >> 2] | 0;
    if (!$69) break; else {
     $$1387 = $69;
     $$1390 = $68;
    }
   }
   if ($3 >>> 0 > $$1390 >>> 0) _abort(); else {
    HEAP32[$$1390 >> 2] = 0;
    $$3 = $$1387;
    break;
   }
  } else {
   $51 = HEAP32[$16 + 8 >> 2] | 0;
   if ($3 >>> 0 > $51 >>> 0) _abort();
   $53 = $51 + 12 | 0;
   if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) _abort();
   $56 = $48 + 8 | 0;
   if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
    HEAP32[$53 >> 2] = $48;
    HEAP32[$56 >> 2] = $51;
    $$3 = $48;
    break;
   } else _abort();
  } while (0);
  if (!$46) {
   $$1 = $16;
   $$1382 = $17;
   $113 = $16;
  } else {
   $74 = HEAP32[$16 + 28 >> 2] | 0;
   $75 = 3776 + ($74 << 2) | 0;
   do if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
    HEAP32[$75 >> 2] = $$3;
    if (!$$3) {
     HEAP32[869] = HEAP32[869] & ~(1 << $74);
     $$1 = $16;
     $$1382 = $17;
     $113 = $16;
     break L10;
    }
   } else if ((HEAP32[872] | 0) >>> 0 > $46 >>> 0) _abort(); else {
    HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3;
    if (!$$3) {
     $$1 = $16;
     $$1382 = $17;
     $113 = $16;
     break L10;
    } else break;
   } while (0);
   $89 = HEAP32[872] | 0;
   if ($89 >>> 0 > $$3 >>> 0) _abort();
   HEAP32[$$3 + 24 >> 2] = $46;
   $92 = $16 + 16 | 0;
   $93 = HEAP32[$92 >> 2] | 0;
   do if ($93 | 0) if ($89 >>> 0 > $93 >>> 0) _abort(); else {
    HEAP32[$$3 + 16 >> 2] = $93;
    HEAP32[$93 + 24 >> 2] = $$3;
    break;
   } while (0);
   $99 = HEAP32[$92 + 4 >> 2] | 0;
   if (!$99) {
    $$1 = $16;
    $$1382 = $17;
    $113 = $16;
   } else if ((HEAP32[872] | 0) >>> 0 > $99 >>> 0) _abort(); else {
    HEAP32[$$3 + 20 >> 2] = $99;
    HEAP32[$99 + 24 >> 2] = $$3;
    $$1 = $16;
    $$1382 = $17;
    $113 = $16;
    break;
   }
  }
 } else {
  $$1 = $2;
  $$1382 = $9;
  $113 = $2;
 } while (0);
 if ($113 >>> 0 >= $10 >>> 0) _abort();
 $115 = $10 + 4 | 0;
 $116 = HEAP32[$115 >> 2] | 0;
 if (!($116 & 1)) _abort();
 if (!($116 & 2)) {
  if ((HEAP32[874] | 0) == ($10 | 0)) {
   $124 = (HEAP32[871] | 0) + $$1382 | 0;
   HEAP32[871] = $124;
   HEAP32[874] = $$1;
   HEAP32[$$1 + 4 >> 2] = $124 | 1;
   if (($$1 | 0) != (HEAP32[873] | 0)) return;
   HEAP32[873] = 0;
   HEAP32[870] = 0;
   return;
  }
  if ((HEAP32[873] | 0) == ($10 | 0)) {
   $132 = (HEAP32[870] | 0) + $$1382 | 0;
   HEAP32[870] = $132;
   HEAP32[873] = $113;
   HEAP32[$$1 + 4 >> 2] = $132 | 1;
   HEAP32[$113 + $132 >> 2] = $132;
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0;
  $138 = $116 >>> 3;
  L108 : do if ($116 >>> 0 < 256) {
   $141 = HEAP32[$10 + 8 >> 2] | 0;
   $143 = HEAP32[$10 + 12 >> 2] | 0;
   $145 = 3512 + ($138 << 1 << 2) | 0;
   if (($141 | 0) != ($145 | 0)) {
    if ((HEAP32[872] | 0) >>> 0 > $141 >>> 0) _abort();
    if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) _abort();
   }
   if (($143 | 0) == ($141 | 0)) {
    HEAP32[868] = HEAP32[868] & ~(1 << $138);
    break;
   }
   if (($143 | 0) == ($145 | 0)) $$pre$phi442Z2D = $143 + 8 | 0; else {
    if ((HEAP32[872] | 0) >>> 0 > $143 >>> 0) _abort();
    $160 = $143 + 8 | 0;
    if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) $$pre$phi442Z2D = $160; else _abort();
   }
   HEAP32[$141 + 12 >> 2] = $143;
   HEAP32[$$pre$phi442Z2D >> 2] = $141;
  } else {
   $165 = HEAP32[$10 + 24 >> 2] | 0;
   $167 = HEAP32[$10 + 12 >> 2] | 0;
   do if (($167 | 0) == ($10 | 0)) {
    $179 = $10 + 16 | 0;
    $180 = $179 + 4 | 0;
    $181 = HEAP32[$180 >> 2] | 0;
    if (!$181) {
     $183 = HEAP32[$179 >> 2] | 0;
     if (!$183) {
      $$3400 = 0;
      break;
     } else {
      $$1398 = $183;
      $$1402 = $179;
     }
    } else {
     $$1398 = $181;
     $$1402 = $180;
    }
    while (1) {
     $185 = $$1398 + 20 | 0;
     $186 = HEAP32[$185 >> 2] | 0;
     if ($186 | 0) {
      $$1398 = $186;
      $$1402 = $185;
      continue;
     }
     $188 = $$1398 + 16 | 0;
     $189 = HEAP32[$188 >> 2] | 0;
     if (!$189) break; else {
      $$1398 = $189;
      $$1402 = $188;
     }
    }
    if ((HEAP32[872] | 0) >>> 0 > $$1402 >>> 0) _abort(); else {
     HEAP32[$$1402 >> 2] = 0;
     $$3400 = $$1398;
     break;
    }
   } else {
    $170 = HEAP32[$10 + 8 >> 2] | 0;
    if ((HEAP32[872] | 0) >>> 0 > $170 >>> 0) _abort();
    $173 = $170 + 12 | 0;
    if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) _abort();
    $176 = $167 + 8 | 0;
    if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
     HEAP32[$173 >> 2] = $167;
     HEAP32[$176 >> 2] = $170;
     $$3400 = $167;
     break;
    } else _abort();
   } while (0);
   if ($165 | 0) {
    $195 = HEAP32[$10 + 28 >> 2] | 0;
    $196 = 3776 + ($195 << 2) | 0;
    do if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
     HEAP32[$196 >> 2] = $$3400;
     if (!$$3400) {
      HEAP32[869] = HEAP32[869] & ~(1 << $195);
      break L108;
     }
    } else if ((HEAP32[872] | 0) >>> 0 > $165 >>> 0) _abort(); else {
     HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400;
     if (!$$3400) break L108; else break;
    } while (0);
    $210 = HEAP32[872] | 0;
    if ($210 >>> 0 > $$3400 >>> 0) _abort();
    HEAP32[$$3400 + 24 >> 2] = $165;
    $213 = $10 + 16 | 0;
    $214 = HEAP32[$213 >> 2] | 0;
    do if ($214 | 0) if ($210 >>> 0 > $214 >>> 0) _abort(); else {
     HEAP32[$$3400 + 16 >> 2] = $214;
     HEAP32[$214 + 24 >> 2] = $$3400;
     break;
    } while (0);
    $220 = HEAP32[$213 + 4 >> 2] | 0;
    if ($220 | 0) if ((HEAP32[872] | 0) >>> 0 > $220 >>> 0) _abort(); else {
     HEAP32[$$3400 + 20 >> 2] = $220;
     HEAP32[$220 + 24 >> 2] = $$3400;
     break;
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1;
  HEAP32[$113 + $137 >> 2] = $137;
  if (($$1 | 0) == (HEAP32[873] | 0)) {
   HEAP32[870] = $137;
   return;
  } else $$2 = $137;
 } else {
  HEAP32[$115 >> 2] = $116 & -2;
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1;
  HEAP32[$113 + $$1382 >> 2] = $$1382;
  $$2 = $$1382;
 }
 $235 = $$2 >>> 3;
 if ($$2 >>> 0 < 256) {
  $238 = 3512 + ($235 << 1 << 2) | 0;
  $239 = HEAP32[868] | 0;
  $240 = 1 << $235;
  if (!($239 & $240)) {
   HEAP32[868] = $239 | $240;
   $$0403 = $238;
   $$pre$phiZ2D = $238 + 8 | 0;
  } else {
   $244 = $238 + 8 | 0;
   $245 = HEAP32[$244 >> 2] | 0;
   if ((HEAP32[872] | 0) >>> 0 > $245 >>> 0) _abort(); else {
    $$0403 = $245;
    $$pre$phiZ2D = $244;
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1;
  HEAP32[$$0403 + 12 >> 2] = $$1;
  HEAP32[$$1 + 8 >> 2] = $$0403;
  HEAP32[$$1 + 12 >> 2] = $238;
  return;
 }
 $251 = $$2 >>> 8;
 if (!$251) $$0396 = 0; else if ($$2 >>> 0 > 16777215) $$0396 = 31; else {
  $256 = ($251 + 1048320 | 0) >>> 16 & 8;
  $257 = $251 << $256;
  $260 = ($257 + 520192 | 0) >>> 16 & 4;
  $262 = $257 << $260;
  $265 = ($262 + 245760 | 0) >>> 16 & 2;
  $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0;
  $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1;
 }
 $276 = 3776 + ($$0396 << 2) | 0;
 HEAP32[$$1 + 28 >> 2] = $$0396;
 HEAP32[$$1 + 20 >> 2] = 0;
 HEAP32[$$1 + 16 >> 2] = 0;
 $280 = HEAP32[869] | 0;
 $281 = 1 << $$0396;
 do if (!($280 & $281)) {
  HEAP32[869] = $280 | $281;
  HEAP32[$276 >> 2] = $$1;
  HEAP32[$$1 + 24 >> 2] = $276;
  HEAP32[$$1 + 12 >> 2] = $$1;
  HEAP32[$$1 + 8 >> 2] = $$1;
 } else {
  $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0);
  $$0384 = HEAP32[$276 >> 2] | 0;
  while (1) {
   if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
    label = 124;
    break;
   }
   $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0;
   $301 = HEAP32[$299 >> 2] | 0;
   if (!$301) {
    label = 121;
    break;
   } else {
    $$0383 = $$0383 << 1;
    $$0384 = $301;
   }
  }
  if ((label | 0) == 121) if ((HEAP32[872] | 0) >>> 0 > $299 >>> 0) _abort(); else {
   HEAP32[$299 >> 2] = $$1;
   HEAP32[$$1 + 24 >> 2] = $$0384;
   HEAP32[$$1 + 12 >> 2] = $$1;
   HEAP32[$$1 + 8 >> 2] = $$1;
   break;
  } else if ((label | 0) == 124) {
   $308 = $$0384 + 8 | 0;
   $309 = HEAP32[$308 >> 2] | 0;
   $310 = HEAP32[872] | 0;
   if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
    HEAP32[$309 + 12 >> 2] = $$1;
    HEAP32[$308 >> 2] = $$1;
    HEAP32[$$1 + 8 >> 2] = $309;
    HEAP32[$$1 + 12 >> 2] = $$0384;
    HEAP32[$$1 + 24 >> 2] = 0;
    break;
   } else _abort();
  }
 } while (0);
 $319 = (HEAP32[876] | 0) + -1 | 0;
 HEAP32[876] = $319;
 if (!$319) $$0212$in$i = 3928; else return;
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0;
  if (!$$0212$i) break; else $$0212$in$i = $$0212$i + 8 | 0;
 }
 HEAP32[876] = -1;
 return;
}

function __ZNSt3__26vectorIN6stmpct2gk4impl5tupleENS_9allocatorIS4_EEE6insertENS_11__wrap_iterIPKS4_EERS9_($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$017$i = 0, $$025 = 0, $$in$i32 = 0, $$sroa$22$0 = 0, $$sroa$22$1$in = 0, $$sroa$38$0 = 0, $$sroa$speculated$$i = 0, $$sroa$speculated$i = 0, $10 = 0, $11 = 0, $12 = 0, $14 = 0, $15 = 0, $21 = 0, $22 = 0, $23 = 0, $3 = 0, $38 = 0, $4 = 0, $40 = 0, $43 = 0, $45 = 0, $46 = 0, $49 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $56 = 0, $6 = 0, $61 = 0, $63 = 0, $66 = 0, $68 = 0, $70 = 0, $71 = 0, $73 = 0, $75 = 0, $76 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $82 = 0, $85 = 0, $89 = 0, $9 = 0, $93 = 0;
 $3 = HEAP32[$0 >> 2] | 0;
 $4 = $3;
 $6 = (HEAP32[$1 >> 2] | 0) - $4 | 0;
 $8 = $3 + ($6 >> 4 << 4) | 0;
 $9 = $0 + 4 | 0;
 $10 = HEAP32[$9 >> 2] | 0;
 $11 = $0 + 8 | 0;
 $12 = HEAP32[$11 >> 2] | 0;
 $14 = $10;
 $15 = $12;
 if ($10 >>> 0 < $12 >>> 0) {
  if (($8 | 0) == ($10 | 0)) {
   HEAP32[$8 >> 2] = HEAP32[$2 >> 2];
   HEAP32[$8 + 4 >> 2] = HEAP32[$2 + 4 >> 2];
   HEAP32[$8 + 8 >> 2] = HEAP32[$2 + 8 >> 2];
   HEAP32[$8 + 12 >> 2] = HEAP32[$2 + 12 >> 2];
   HEAP32[$9 >> 2] = (HEAP32[$9 >> 2] | 0) + 16;
   $$0 = $8;
   return $$0 | 0;
  }
  $21 = $14 - ($8 + 16) | 0;
  $22 = $21 >> 4;
  $23 = $8 + ($22 << 4) | 0;
  if ($23 >>> 0 < $10 >>> 0) {
   $$017$i = $23;
   $$in$i32 = $10;
   do {
    HEAP32[$$in$i32 >> 2] = HEAP32[$$017$i >> 2];
    HEAP32[$$in$i32 + 4 >> 2] = HEAP32[$$017$i + 4 >> 2];
    HEAP32[$$in$i32 + 8 >> 2] = HEAP32[$$017$i + 8 >> 2];
    HEAP32[$$in$i32 + 12 >> 2] = HEAP32[$$017$i + 12 >> 2];
    $$017$i = $$017$i + 16 | 0;
    $$in$i32 = (HEAP32[$9 >> 2] | 0) + 16 | 0;
    HEAP32[$9 >> 2] = $$in$i32;
   } while ($$017$i >>> 0 < $10 >>> 0);
  }
  if ($22 | 0) _memmove($10 + (0 - $22 << 4) | 0, $8 | 0, $21 | 0) | 0;
  if ($8 >>> 0 > $2 >>> 0) $$025 = $2; else $$025 = (HEAP32[$9 >> 2] | 0) >>> 0 > $2 >>> 0 ? $2 + 16 | 0 : $2;
  HEAP32[$8 >> 2] = HEAP32[$$025 >> 2];
  HEAP32[$8 + 4 >> 2] = HEAP32[$$025 + 4 >> 2];
  HEAP32[$8 + 8 >> 2] = HEAP32[$$025 + 8 >> 2];
  HEAP32[$8 + 12 >> 2] = HEAP32[$$025 + 12 >> 2];
  $$0 = $8;
  return $$0 | 0;
 }
 $38 = ($14 - $4 >> 4) + 1 | 0;
 if ($38 >>> 0 > 268435455) __ZNKSt3__220__vector_base_commonILb1EE20__throw_length_errorEv($0);
 $40 = $15 - $4 | 0;
 $43 = $40 >> 3;
 $$sroa$speculated$$i = $40 >> 4 >>> 0 < 134217727 ? ($43 >>> 0 < $38 >>> 0 ? $38 : $43) : 268435455;
 $45 = $8;
 $46 = $6 >> 4;
 do if (!$$sroa$speculated$$i) {
  $53 = 0;
  $75 = 0;
 } else if ($$sroa$speculated$$i >>> 0 > 268435455) {
  $49 = ___cxa_allocate_exception(8) | 0;
  __ZNSt11logic_errorC2EPKc($49, 1416);
  HEAP32[$49 >> 2] = 1148;
  ___cxa_throw($49 | 0, 528, 19);
 } else {
  $51 = __Znwj($$sroa$speculated$$i << 4) | 0;
  $53 = $51;
  $75 = $51;
  break;
 } while (0);
 $52 = $53 + ($46 << 4) | 0;
 $54 = $52;
 $56 = $53 + ($$sroa$speculated$$i << 4) | 0;
 do if (($46 | 0) == ($$sroa$speculated$$i | 0)) {
  if (($6 | 0) > 0) {
   $61 = $52 + ((($$sroa$speculated$$i + 1 | 0) / -2 | 0) << 4) | 0;
   $$sroa$22$0 = $61;
   $$sroa$38$0 = $56;
   $76 = $61;
   $80 = $3;
   break;
  }
  $63 = $$sroa$speculated$$i << 4 >> 3;
  $$sroa$speculated$i = ($63 | 0) == 0 ? 1 : $63;
  if ($$sroa$speculated$i >>> 0 > 268435455) {
   $66 = ___cxa_allocate_exception(8) | 0;
   __ZNSt11logic_errorC2EPKc($66, 1416);
   HEAP32[$66 >> 2] = 1148;
   ___cxa_throw($66 | 0, 528, 19);
  }
  $68 = __Znwj($$sroa$speculated$i << 4) | 0;
  $70 = $68 + ($$sroa$speculated$i >>> 2 << 4) | 0;
  $71 = $70;
  $73 = $68 + ($$sroa$speculated$i << 4) | 0;
  if (!$53) {
   $$sroa$22$0 = $71;
   $$sroa$38$0 = $73;
   $76 = $70;
   $80 = $3;
  } else {
   __ZdlPv($75);
   $$sroa$22$0 = $71;
   $$sroa$38$0 = $73;
   $76 = $70;
   $80 = HEAP32[$0 >> 2] | 0;
  }
 } else {
  $$sroa$22$0 = $54;
  $$sroa$38$0 = $56;
  $76 = $52;
  $80 = $3;
 } while (0);
 HEAP32[$76 >> 2] = HEAP32[$2 >> 2];
 HEAP32[$76 + 4 >> 2] = HEAP32[$2 + 4 >> 2];
 HEAP32[$76 + 8 >> 2] = HEAP32[$2 + 8 >> 2];
 HEAP32[$76 + 12 >> 2] = HEAP32[$2 + 12 >> 2];
 $78 = $$sroa$22$0 + 16 | 0;
 $79 = $$sroa$22$0;
 $82 = $45 - $80 | 0;
 $85 = $79 + (0 - ($82 >> 4) << 4) | 0;
 if (($82 | 0) > 0) _memcpy($85 | 0, $80 | 0, $82 | 0) | 0;
 $89 = (HEAP32[$9 >> 2] | 0) - $45 | 0;
 if (($89 | 0) > 0) {
  _memcpy($78 | 0, $8 | 0, $89 | 0) | 0;
  $$sroa$22$1$in = $78 + ($89 >>> 4 << 4) | 0;
 } else $$sroa$22$1$in = $78;
 $93 = HEAP32[$0 >> 2] | 0;
 HEAP32[$0 >> 2] = $85;
 HEAP32[$9 >> 2] = $$sroa$22$1$in;
 HEAP32[$11 >> 2] = $$sroa$38$0;
 if (!$93) {
  $$0 = $79;
  return $$0 | 0;
 }
 __ZdlPv($93);
 $$0 = $79;
 return $$0 | 0;
}

function __ZNSt3__26vectorIN9ckms_impl5tupleENS_9allocatorIS2_EEE6insertENS_11__wrap_iterIPKS2_EERS7_($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$017$i = 0, $$025 = 0, $$in$i32 = 0, $$sroa$22$0 = 0, $$sroa$22$1$in = 0, $$sroa$38$0 = 0, $$sroa$speculated$$i = 0, $$sroa$speculated$i = 0, $10 = 0, $11 = 0, $12 = 0, $14 = 0, $15 = 0, $21 = 0, $22 = 0, $23 = 0, $3 = 0, $38 = 0, $4 = 0, $40 = 0, $43 = 0, $45 = 0, $46 = 0, $49 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $56 = 0, $6 = 0, $61 = 0, $63 = 0, $66 = 0, $68 = 0, $70 = 0, $71 = 0, $73 = 0, $75 = 0, $76 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $82 = 0, $85 = 0, $89 = 0, $9 = 0, $93 = 0;
 $3 = HEAP32[$0 >> 2] | 0;
 $4 = $3;
 $6 = (HEAP32[$1 >> 2] | 0) - $4 | 0;
 $8 = $3 + ($6 >> 4 << 4) | 0;
 $9 = $0 + 4 | 0;
 $10 = HEAP32[$9 >> 2] | 0;
 $11 = $0 + 8 | 0;
 $12 = HEAP32[$11 >> 2] | 0;
 $14 = $10;
 $15 = $12;
 if ($10 >>> 0 < $12 >>> 0) {
  if (($8 | 0) == ($10 | 0)) {
   HEAP32[$8 >> 2] = HEAP32[$2 >> 2];
   HEAP32[$8 + 4 >> 2] = HEAP32[$2 + 4 >> 2];
   HEAP32[$8 + 8 >> 2] = HEAP32[$2 + 8 >> 2];
   HEAP32[$8 + 12 >> 2] = HEAP32[$2 + 12 >> 2];
   HEAP32[$9 >> 2] = (HEAP32[$9 >> 2] | 0) + 16;
   $$0 = $8;
   return $$0 | 0;
  }
  $21 = $14 - ($8 + 16) | 0;
  $22 = $21 >> 4;
  $23 = $8 + ($22 << 4) | 0;
  if ($23 >>> 0 < $10 >>> 0) {
   $$017$i = $23;
   $$in$i32 = $10;
   do {
    HEAP32[$$in$i32 >> 2] = HEAP32[$$017$i >> 2];
    HEAP32[$$in$i32 + 4 >> 2] = HEAP32[$$017$i + 4 >> 2];
    HEAP32[$$in$i32 + 8 >> 2] = HEAP32[$$017$i + 8 >> 2];
    HEAP32[$$in$i32 + 12 >> 2] = HEAP32[$$017$i + 12 >> 2];
    $$017$i = $$017$i + 16 | 0;
    $$in$i32 = (HEAP32[$9 >> 2] | 0) + 16 | 0;
    HEAP32[$9 >> 2] = $$in$i32;
   } while ($$017$i >>> 0 < $10 >>> 0);
  }
  if ($22 | 0) _memmove($10 + (0 - $22 << 4) | 0, $8 | 0, $21 | 0) | 0;
  if ($8 >>> 0 > $2 >>> 0) $$025 = $2; else $$025 = (HEAP32[$9 >> 2] | 0) >>> 0 > $2 >>> 0 ? $2 + 16 | 0 : $2;
  HEAP32[$8 >> 2] = HEAP32[$$025 >> 2];
  HEAP32[$8 + 4 >> 2] = HEAP32[$$025 + 4 >> 2];
  HEAP32[$8 + 8 >> 2] = HEAP32[$$025 + 8 >> 2];
  HEAP32[$8 + 12 >> 2] = HEAP32[$$025 + 12 >> 2];
  $$0 = $8;
  return $$0 | 0;
 }
 $38 = ($14 - $4 >> 4) + 1 | 0;
 if ($38 >>> 0 > 268435455) __ZNKSt3__220__vector_base_commonILb1EE20__throw_length_errorEv($0);
 $40 = $15 - $4 | 0;
 $43 = $40 >> 3;
 $$sroa$speculated$$i = $40 >> 4 >>> 0 < 134217727 ? ($43 >>> 0 < $38 >>> 0 ? $38 : $43) : 268435455;
 $45 = $8;
 $46 = $6 >> 4;
 do if (!$$sroa$speculated$$i) {
  $53 = 0;
  $75 = 0;
 } else if ($$sroa$speculated$$i >>> 0 > 268435455) {
  $49 = ___cxa_allocate_exception(8) | 0;
  __ZNSt11logic_errorC2EPKc($49, 1416);
  HEAP32[$49 >> 2] = 1148;
  ___cxa_throw($49 | 0, 528, 19);
 } else {
  $51 = __Znwj($$sroa$speculated$$i << 4) | 0;
  $53 = $51;
  $75 = $51;
  break;
 } while (0);
 $52 = $53 + ($46 << 4) | 0;
 $54 = $52;
 $56 = $53 + ($$sroa$speculated$$i << 4) | 0;
 do if (($46 | 0) == ($$sroa$speculated$$i | 0)) {
  if (($6 | 0) > 0) {
   $61 = $52 + ((($$sroa$speculated$$i + 1 | 0) / -2 | 0) << 4) | 0;
   $$sroa$22$0 = $61;
   $$sroa$38$0 = $56;
   $76 = $61;
   $80 = $3;
   break;
  }
  $63 = $$sroa$speculated$$i << 4 >> 3;
  $$sroa$speculated$i = ($63 | 0) == 0 ? 1 : $63;
  if ($$sroa$speculated$i >>> 0 > 268435455) {
   $66 = ___cxa_allocate_exception(8) | 0;
   __ZNSt11logic_errorC2EPKc($66, 1416);
   HEAP32[$66 >> 2] = 1148;
   ___cxa_throw($66 | 0, 528, 19);
  }
  $68 = __Znwj($$sroa$speculated$i << 4) | 0;
  $70 = $68 + ($$sroa$speculated$i >>> 2 << 4) | 0;
  $71 = $70;
  $73 = $68 + ($$sroa$speculated$i << 4) | 0;
  if (!$53) {
   $$sroa$22$0 = $71;
   $$sroa$38$0 = $73;
   $76 = $70;
   $80 = $3;
  } else {
   __ZdlPv($75);
   $$sroa$22$0 = $71;
   $$sroa$38$0 = $73;
   $76 = $70;
   $80 = HEAP32[$0 >> 2] | 0;
  }
 } else {
  $$sroa$22$0 = $54;
  $$sroa$38$0 = $56;
  $76 = $52;
  $80 = $3;
 } while (0);
 HEAP32[$76 >> 2] = HEAP32[$2 >> 2];
 HEAP32[$76 + 4 >> 2] = HEAP32[$2 + 4 >> 2];
 HEAP32[$76 + 8 >> 2] = HEAP32[$2 + 8 >> 2];
 HEAP32[$76 + 12 >> 2] = HEAP32[$2 + 12 >> 2];
 $78 = $$sroa$22$0 + 16 | 0;
 $79 = $$sroa$22$0;
 $82 = $45 - $80 | 0;
 $85 = $79 + (0 - ($82 >> 4) << 4) | 0;
 if (($82 | 0) > 0) _memcpy($85 | 0, $80 | 0, $82 | 0) | 0;
 $89 = (HEAP32[$9 >> 2] | 0) - $45 | 0;
 if (($89 | 0) > 0) {
  _memcpy($78 | 0, $8 | 0, $89 | 0) | 0;
  $$sroa$22$1$in = $78 + ($89 >>> 4 << 4) | 0;
 } else $$sroa$22$1$in = $78;
 $93 = HEAP32[$0 >> 2] | 0;
 HEAP32[$0 >> 2] = $85;
 HEAP32[$9 >> 2] = $$sroa$22$1$in;
 HEAP32[$11 >> 2] = $$sroa$38$0;
 if (!$93) {
  $$0 = $79;
  return $$0 | 0;
 }
 __ZdlPv($93);
 $$0 = $79;
 return $$0 | 0;
}

function __ZN6stmpct2gk4impl8compressEv($0) {
 $0 = $0 | 0;
 var $$$i = 0, $$012$lcssa = 0, $$012100 = 0, $$03338$i = 0, $$037$in$i = 0, $$in = 0, $$lcssa = 0, $$sink97107 = 0, $$sroa$050$0$lcssa = 0, $$sroa$050$099 = 0, $$sroa$071$2 = 0, $1 = 0, $104 = 0, $106 = 0, $112 = 0, $13 = 0, $14 = 0, $15 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $25 = 0.0, $28 = 0, $29 = 0, $3 = 0, $32 = 0, $36 = 0, $4 = 0, $43 = 0, $46 = 0, $48 = 0, $5 = 0, $50 = 0, $53 = 0, $58 = 0, $59 = 0, $60 = 0, $63 = 0, $65 = 0, $71 = 0, $74 = 0, $78 = 0, $82 = 0, $83 = 0, $86 = 0, $87 = 0, $88 = 0, $91 = 0, $92 = 0, label = 0, sp = 0, $65$looptemp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16 | 0;
 $1 = sp;
 $2 = $0 + 16 | 0;
 $3 = HEAP32[$2 >> 2] | 0;
 $4 = $0 + 20 | 0;
 $5 = HEAP32[$4 >> 2] | 0;
 if (($3 | 0) == ($5 | 0)) {
  STACKTOP = sp;
  return;
 }
 $13 = ~~(+HEAPF64[$0 >> 3] * 2.0 * +(HEAP32[$0 + 12 >> 2] | 0));
 $14 = $13 + 1 | 0;
 HEAP32[$1 >> 2] = 0;
 $15 = $1 + 4 | 0;
 HEAP32[$15 >> 2] = 0;
 HEAP32[$1 + 8 >> 2] = 0;
 if ($14 >>> 0 > 1073741823) __ZNKSt3__220__vector_base_commonILb1EE20__throw_length_errorEv($1);
 $18 = $14 << 2;
 $19 = __Znwj($18) | 0;
 HEAP32[$1 >> 2] = $19;
 $20 = $19 + ($14 << 2) | 0;
 HEAP32[$1 + 8 >> 2] = $20;
 _memset($19 | 0, 0, $18 | 0) | 0;
 HEAP32[$15 >> 2] = $20;
 HEAP32[$19 >> 2] = 999999;
 HEAP32[$19 + ($13 << 2) >> 2] = 0;
 $25 = +Math_ceil(+(+_log2(+($13 | 0))));
 if ($25 >= 1.0) {
  $$03338$i = 1;
  do {
   $28 = 1 << $$03338$i + -1;
   $29 = $28 << 1;
   $32 = $13 - $29 - (($13 | 0) % ($29 | 0) | 0) | 0;
   $$$i = ($32 | 0) > 0 ? $32 : 0;
   $36 = $13 - $28 - (($13 | 0) % ($28 | 0) | 0) | 0;
   if (($$$i | 0) < ($36 | 0)) {
    $$037$in$i = $$$i;
    do {
     $$037$in$i = $$037$in$i + 1 | 0;
     HEAP32[$19 + ($$037$in$i << 2) >> 2] = $$03338$i;
    } while (($$037$in$i | 0) < ($36 | 0));
   }
   $$03338$i = $$03338$i + 1 | 0;
  } while ($25 >= +($$03338$i | 0));
 }
 $43 = $5 + -32 | 0;
 if (($43 | 0) == ($3 | 0)) {
  $106 = $19;
  $112 = $19;
  label = 23;
 } else {
  $$in = $43;
  $$sink97107 = $5 + -16 | 0;
  $50 = $19;
  $60 = $3;
  do {
   $46 = $$in;
   $48 = HEAP32[$$sink97107 + -4 >> 2] | 0;
   $53 = HEAP32[$$sink97107 + 12 >> 2] | 0;
   if ((HEAP32[$50 + ($48 << 2) >> 2] | 0) > (HEAP32[$50 + ($53 << 2) >> 2] | 0)) $$sroa$071$2 = $46; else {
    $58 = HEAP32[$$sink97107 + -8 >> 2] | 0;
    $59 = $60 + 16 | 0;
    L21 : do if (($59 | 0) == ($$in | 0)) {
     $$012$lcssa = $58;
     $$lcssa = $$in;
     $$sroa$050$0$lcssa = $46;
    } else {
     $63 = HEAP32[$50 + ($48 << 2) >> 2] | 0;
     $$012100 = $58;
     $$sroa$050$099 = $46;
     $65 = $$in;
     while (1) {
      if ((HEAP32[$50 + (HEAP32[$65 + -4 >> 2] << 2) >> 2] | 0) >= ($63 | 0)) {
       $$012$lcssa = $$012100;
       $$lcssa = $65;
       $$sroa$050$0$lcssa = $$sroa$050$099;
       break L21;
      }
      $65$looptemp = $65;
      $65 = $65 + -16 | 0;
      $71 = $65;
      $74 = (HEAP32[$65$looptemp + -8 >> 2] | 0) + $$012100 | 0;
      if (($59 | 0) == ($65 | 0)) {
       $$012$lcssa = $74;
       $$lcssa = $59;
       $$sroa$050$0$lcssa = $71;
       break;
      } else {
       $$012100 = $74;
       $$sroa$050$099 = $71;
      }
     }
    } while (0);
    $78 = (HEAP32[$$sink97107 + 8 >> 2] | 0) + $$012$lcssa | 0;
    if (($78 + $53 | 0) < ($13 | 0)) {
     HEAPF64[$$lcssa >> 3] = +HEAPF64[$$sink97107 >> 3];
     HEAP32[$$lcssa + 8 >> 2] = $78;
     HEAP32[$$lcssa + 12 >> 2] = $53;
     $82 = $$lcssa + 16 | 0;
     $83 = $$sink97107 + 16 | 0;
     if (($$sink97107 | 0) == ($$lcssa | 0)) $$sroa$071$2 = $$sroa$050$0$lcssa; else {
      $86 = HEAP32[$4 >> 2] | 0;
      $87 = $86 - $83 | 0;
      $88 = $87 >> 4;
      if (!$88) $92 = $86; else {
       _memmove($82 | 0, $83 | 0, $87 | 0) | 0;
       $92 = HEAP32[$4 >> 2] | 0;
      }
      $91 = $82 + ($88 << 4) | 0;
      if (($92 | 0) == ($91 | 0)) $$sroa$071$2 = $$sroa$050$0$lcssa; else {
       HEAP32[$4 >> 2] = $92 + (~(($92 + -16 - $91 | 0) >>> 4) << 4);
       $$sroa$071$2 = $$sroa$050$0$lcssa;
      }
     }
    } else $$sroa$071$2 = $46;
   }
   $$sink97107 = $$sroa$071$2;
   $$in = $$sink97107 + -16 | 0;
   $60 = HEAP32[$2 >> 2] | 0;
   $50 = HEAP32[$1 >> 2] | 0;
  } while (($$in | 0) != ($60 | 0));
  if ($50 | 0) {
   $106 = $50;
   $112 = $50;
   label = 23;
  }
 }
 if ((label | 0) == 23) {
  $104 = HEAP32[$15 >> 2] | 0;
  if (($104 | 0) != ($106 | 0)) HEAP32[$15 >> 2] = $104 + (~(($104 + -4 - $106 | 0) >>> 2) << 2);
  __ZdlPv($112);
 }
 STACKTOP = sp;
 return;
}

function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $$081$off0 = 0, $$084 = 0, $$085$off0 = 0, $$1 = 0, $$182$off0 = 0, $$186$off0 = 0, $$2 = 0, $$283$off0 = 0, $13 = 0, $19 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $47 = 0, $55 = 0, $58 = 0, $59 = 0, $60 = 0, $63 = 0, $66 = 0, $69 = 0, $76 = 0, $77 = 0, $78 = 0, label = 0;
 L1 : do if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); else {
  if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
   $58 = HEAP32[$0 + 12 >> 2] | 0;
   $59 = $0 + 16 + ($58 << 3) | 0;
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0 + 16 | 0, $1, $2, $3, $4);
   $60 = $0 + 24 | 0;
   if (($58 | 0) <= 1) break;
   $63 = HEAP32[$0 + 8 >> 2] | 0;
   if (!($63 & 2)) {
    $66 = $1 + 36 | 0;
    if ((HEAP32[$66 >> 2] | 0) != 1) {
     if (!($63 & 1)) {
      $78 = $1 + 54 | 0;
      $$2 = $60;
      while (1) {
       if (HEAP8[$78 >> 0] | 0) break L1;
       if ((HEAP32[$66 >> 2] | 0) == 1) break L1;
       __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$2, $1, $2, $3, $4);
       $$2 = $$2 + 8 | 0;
       if ($$2 >>> 0 >= $59 >>> 0) break L1;
      }
     }
     $76 = $1 + 24 | 0;
     $77 = $1 + 54 | 0;
     $$1 = $60;
     while (1) {
      if (HEAP8[$77 >> 0] | 0) break L1;
      if ((HEAP32[$66 >> 2] | 0) == 1) if ((HEAP32[$76 >> 2] | 0) == 1) break L1;
      __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$1, $1, $2, $3, $4);
      $$1 = $$1 + 8 | 0;
      if ($$1 >>> 0 >= $59 >>> 0) break L1;
     }
    }
   }
   $69 = $1 + 54 | 0;
   $$0 = $60;
   while (1) {
    if (HEAP8[$69 >> 0] | 0) break L1;
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$0, $1, $2, $3, $4);
    $$0 = $$0 + 8 | 0;
    if ($$0 >>> 0 >= $59 >>> 0) break L1;
   }
  }
  if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
   $13 = $1 + 20 | 0;
   if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
    HEAP32[$1 + 32 >> 2] = $3;
    $19 = $1 + 44 | 0;
    if ((HEAP32[$19 >> 2] | 0) == 4) break;
    $25 = $0 + 16 + (HEAP32[$0 + 12 >> 2] << 3) | 0;
    $26 = $1 + 52 | 0;
    $27 = $1 + 53 | 0;
    $28 = $1 + 54 | 0;
    $29 = $0 + 8 | 0;
    $30 = $1 + 24 | 0;
    $$081$off0 = 0;
    $$084 = $0 + 16 | 0;
    $$085$off0 = 0;
    L32 : while (1) {
     if ($$084 >>> 0 >= $25 >>> 0) {
      $$283$off0 = $$081$off0;
      label = 18;
      break;
     }
     HEAP8[$26 >> 0] = 0;
     HEAP8[$27 >> 0] = 0;
     __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$084, $1, $2, $2, 1, $4);
     if (HEAP8[$28 >> 0] | 0) {
      $$283$off0 = $$081$off0;
      label = 18;
      break;
     }
     do if (!(HEAP8[$27 >> 0] | 0)) {
      $$182$off0 = $$081$off0;
      $$186$off0 = $$085$off0;
     } else {
      if (!(HEAP8[$26 >> 0] | 0)) if (!(HEAP32[$29 >> 2] & 1)) {
       $$283$off0 = 1;
       label = 18;
       break L32;
      } else {
       $$182$off0 = 1;
       $$186$off0 = $$085$off0;
       break;
      }
      if ((HEAP32[$30 >> 2] | 0) == 1) {
       label = 23;
       break L32;
      }
      if (!(HEAP32[$29 >> 2] & 2)) {
       label = 23;
       break L32;
      } else {
       $$182$off0 = 1;
       $$186$off0 = 1;
      }
     } while (0);
     $$081$off0 = $$182$off0;
     $$084 = $$084 + 8 | 0;
     $$085$off0 = $$186$off0;
    }
    do if ((label | 0) == 18) {
     if (!$$085$off0) {
      HEAP32[$13 >> 2] = $2;
      $47 = $1 + 40 | 0;
      HEAP32[$47 >> 2] = (HEAP32[$47 >> 2] | 0) + 1;
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) if ((HEAP32[$30 >> 2] | 0) == 2) {
       HEAP8[$28 >> 0] = 1;
       if ($$283$off0) {
        label = 23;
        break;
       } else {
        $55 = 4;
        break;
       }
      }
     }
     if ($$283$off0) label = 23; else $55 = 4;
    } while (0);
    if ((label | 0) == 23) $55 = 3;
    HEAP32[$19 >> 2] = $55;
    break;
   }
  }
  if (($3 | 0) == 1) HEAP32[$1 + 32 >> 2] = 1;
 } while (0);
 return;
}

function runPostSets() {}
function _memcpy(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0, aligned_dest_end = 0, block_aligned_dest_end = 0, dest_end = 0;
 if ((num | 0) >= 8192) return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0;
 ret = dest | 0;
 dest_end = dest + num | 0;
 if ((dest & 3) == (src & 3)) {
  while (dest & 3) {
   if (!num) return ret | 0;
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0;
   dest = dest + 1 | 0;
   src = src + 1 | 0;
   num = num - 1 | 0;
  }
  aligned_dest_end = dest_end & -4 | 0;
  block_aligned_dest_end = aligned_dest_end - 64 | 0;
  while ((dest | 0) <= (block_aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2];
   HEAP32[dest + 4 >> 2] = HEAP32[src + 4 >> 2];
   HEAP32[dest + 8 >> 2] = HEAP32[src + 8 >> 2];
   HEAP32[dest + 12 >> 2] = HEAP32[src + 12 >> 2];
   HEAP32[dest + 16 >> 2] = HEAP32[src + 16 >> 2];
   HEAP32[dest + 20 >> 2] = HEAP32[src + 20 >> 2];
   HEAP32[dest + 24 >> 2] = HEAP32[src + 24 >> 2];
   HEAP32[dest + 28 >> 2] = HEAP32[src + 28 >> 2];
   HEAP32[dest + 32 >> 2] = HEAP32[src + 32 >> 2];
   HEAP32[dest + 36 >> 2] = HEAP32[src + 36 >> 2];
   HEAP32[dest + 40 >> 2] = HEAP32[src + 40 >> 2];
   HEAP32[dest + 44 >> 2] = HEAP32[src + 44 >> 2];
   HEAP32[dest + 48 >> 2] = HEAP32[src + 48 >> 2];
   HEAP32[dest + 52 >> 2] = HEAP32[src + 52 >> 2];
   HEAP32[dest + 56 >> 2] = HEAP32[src + 56 >> 2];
   HEAP32[dest + 60 >> 2] = HEAP32[src + 60 >> 2];
   dest = dest + 64 | 0;
   src = src + 64 | 0;
  }
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2];
   dest = dest + 4 | 0;
   src = src + 4 | 0;
  }
 } else {
  aligned_dest_end = dest_end - 4 | 0;
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0;
   HEAP8[dest + 1 >> 0] = HEAP8[src + 1 >> 0] | 0;
   HEAP8[dest + 2 >> 0] = HEAP8[src + 2 >> 0] | 0;
   HEAP8[dest + 3 >> 0] = HEAP8[src + 3 >> 0] | 0;
   dest = dest + 4 | 0;
   src = src + 4 | 0;
  }
 }
 while ((dest | 0) < (dest_end | 0)) {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0;
  dest = dest + 1 | 0;
  src = src + 1 | 0;
 }
 return ret | 0;
}

function _log2($0) {
 $0 = +$0;
 var $$0 = 0, $$096 = 0, $$097 = 0.0, $1 = 0, $15 = 0, $2 = 0, $21 = 0, $27 = 0, $28 = 0.0, $30 = 0.0, $32 = 0.0, $33 = 0.0, $34 = 0.0, $4 = 0, $50 = 0, $51 = 0.0, $56 = 0.0, $57 = 0.0, $62 = 0.0, $63 = 0.0, $68 = 0, label = 0;
 HEAPF64[tempDoublePtr >> 3] = $0;
 $1 = HEAP32[tempDoublePtr >> 2] | 0;
 $2 = HEAP32[tempDoublePtr + 4 >> 2] | 0;
 $4 = ($2 | 0) < 0;
 do if ($4 | $2 >>> 0 < 1048576) {
  if (($1 | 0) == 0 & ($2 & 2147483647 | 0) == 0) {
   $$097 = -1.0 / ($0 * $0);
   break;
  }
  if ($4) {
   $$097 = ($0 - $0) / 0.0;
   break;
  } else {
   HEAPF64[tempDoublePtr >> 3] = $0 * 18014398509481984.0;
   $15 = HEAP32[tempDoublePtr + 4 >> 2] | 0;
   $$0 = -1077;
   $$096 = $15;
   $27 = HEAP32[tempDoublePtr >> 2] | 0;
   $68 = $15;
   label = 9;
   break;
  }
 } else if ($2 >>> 0 > 2146435071) $$097 = $0; else if (($1 | 0) == 0 & 0 == 0 & ($2 | 0) == 1072693248) $$097 = 0.0; else {
  $$0 = -1023;
  $$096 = $2;
  $27 = $1;
  $68 = $2;
  label = 9;
 } while (0);
 if ((label | 0) == 9) {
  $21 = $$096 + 614242 | 0;
  HEAP32[tempDoublePtr >> 2] = $27;
  HEAP32[tempDoublePtr + 4 >> 2] = ($21 & 1048575) + 1072079006;
  $28 = +HEAPF64[tempDoublePtr >> 3] + -1.0;
  $30 = $28 * ($28 * .5);
  $32 = $28 / ($28 + 2.0);
  $33 = $32 * $32;
  $34 = $33 * $33;
  HEAPF64[tempDoublePtr >> 3] = $28 - $30;
  $50 = HEAP32[tempDoublePtr + 4 >> 2] | 0;
  HEAP32[tempDoublePtr >> 2] = 0;
  HEAP32[tempDoublePtr + 4 >> 2] = $50;
  $51 = +HEAPF64[tempDoublePtr >> 3];
  $56 = $28 - $51 - $30 + $32 * ($30 + ($34 * ($34 * ($34 * .15313837699209373 + .22222198432149784) + .3999999999940942) + $33 * ($34 * ($34 * ($34 * .14798198605116586 + .1818357216161805) + .2857142874366239) + .6666666666666735)));
  $57 = $51 * 1.4426950407214463;
  $62 = +($$0 + ($21 >>> 20) | 0);
  $63 = $57 + $62;
  $$097 = $63 + ($57 + ($62 - $63) + ($56 * 1.4426950407214463 + ($56 + $51) * 1.6751713164886512e-10));
 }
 return +$$097;
}

function __ZN50EmscriptenBindingInitializer_streaming_percentilesC2Ev($0) {
 $0 = $0 | 0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 __embind_register_class(120, 136, 152, 0, 1500, 5, 1503, 0, 1503, 0, 1497, 1505, 25);
 __embind_register_class_constructor(120, 2, 912, 1508, 1, 6);
 $1 = __Znwj(8) | 0;
 HEAP32[$1 >> 2] = 8;
 HEAP32[$1 + 4 >> 2] = 1;
 __embind_register_class_function(120, 1512, 3, 920, 1519, 1, $1 | 0, 0);
 $2 = __Znwj(8) | 0;
 HEAP32[$2 >> 2] = 12;
 HEAP32[$2 + 4 >> 2] = 1;
 __embind_register_class_function(120, 1524, 3, 932, 1533, 1, $2 | 0, 0);
 __embind_register_class(16, 168, 184, 0, 1500, 7, 1503, 0, 1503, 0, 1538, 1505, 26);
 __embind_register_class_constructor(16, 2, 944, 1508, 2, 8);
 $3 = __Znwj(8) | 0;
 HEAP32[$3 >> 2] = 8;
 HEAP32[$3 + 4 >> 2] = 1;
 __embind_register_class_function(16, 1512, 3, 952, 1519, 2, $3 | 0, 0);
 $4 = __Znwj(8) | 0;
 HEAP32[$4 >> 2] = 12;
 HEAP32[$4 + 4 >> 2] = 1;
 __embind_register_class_function(16, 1524, 3, 964, 1533, 2, $4 | 0, 0);
 __embind_register_class(56, 200, 216, 0, 1500, 9, 1503, 0, 1503, 0, 1547, 1505, 27);
 __embind_register_class_constructor(56, 2, 976, 1508, 3, 10);
 $5 = __Znwj(8) | 0;
 HEAP32[$5 >> 2] = 8;
 HEAP32[$5 + 4 >> 2] = 1;
 __embind_register_class_function(56, 1512, 3, 984, 1519, 3, $5 | 0, 0);
 $6 = __Znwj(8) | 0;
 HEAP32[$6 >> 2] = 12;
 HEAP32[$6 + 4 >> 2] = 1;
 __embind_register_class_function(56, 1524, 3, 996, 1533, 3, $6 | 0, 0);
 __embind_register_class(88, 232, 248, 0, 1500, 11, 1503, 0, 1503, 0, 1556, 1505, 28);
 __embind_register_class_constructor(88, 2, 1008, 1508, 4, 12);
 $7 = __Znwj(8) | 0;
 HEAP32[$7 >> 2] = 8;
 HEAP32[$7 + 4 >> 2] = 1;
 __embind_register_class_function(88, 1512, 3, 1016, 1519, 4, $7 | 0, 0);
 $8 = __Znwj(8) | 0;
 HEAP32[$8 >> 2] = 12;
 HEAP32[$8 + 4 >> 2] = 1;
 __embind_register_class_function(88, 1524, 3, 1028, 1533, 4, $8 | 0, 0);
 return;
}

function __ZN9ckms_impl8compressEv($0) {
 $0 = $0 | 0;
 var $$039 = 0, $$137 = 0, $$sink3536 = 0, $$sink3536$phi = 0, $$sink38 = 0, $1 = 0, $10 = 0, $18 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $24 = 0, $27 = 0, $3 = 0, $30 = 0.0, $39 = 0, $4 = 0, $45 = 0, $46 = 0, $48 = 0, $49 = 0, $52 = 0, $53 = 0, $60 = 0, $9 = 0;
 $1 = $0 + 8 | 0;
 $2 = HEAP32[$1 >> 2] | 0;
 $3 = $0 + 12 | 0;
 $4 = HEAP32[$3 >> 2] | 0;
 if (($2 | 0) == ($4 | 0)) return;
 $9 = ($4 + -16 - $2 | 0) >>> 4;
 $10 = $9 + 1 | 0;
 $$039 = 0;
 $$sink38 = $2;
 do {
  $$039 = (HEAP32[$$sink38 + 8 >> 2] | 0) + $$039 | 0;
  $$sink38 = $$sink38 + 16 | 0;
 } while (($$sink38 | 0) != ($4 | 0));
 if (!$9) return;
 $18 = $2 + ($10 << 4) + -32 | 0;
 if (($18 | 0) == ($2 | 0)) return;
 $20 = $0 + 4 | 0;
 $$137 = $$039;
 $$sink3536 = $2 + ($9 << 4) | 0;
 $39 = $18;
 while (1) {
  $21 = $$sink3536 + -8 | 0;
  $22 = HEAP32[$21 >> 2] | 0;
  $$137 = $$137 - $22 | 0;
  $24 = $$sink3536 + 8 | 0;
  $27 = $$sink3536 + 12 | 0;
  $30 = +((HEAP32[$24 >> 2] | 0) + $22 + (HEAP32[$27 >> 2] | 0) | 0);
  if (+FUNCTION_TABLE_didi[HEAP32[(HEAP32[$0 >> 2] | 0) + 12 >> 2] & 3]($0, +($$137 | 0), HEAP32[$20 >> 2] | 0) >= $30) {
   HEAPF64[$39 >> 3] = +HEAPF64[$$sink3536 >> 3];
   HEAP32[$21 >> 2] = (HEAP32[$24 >> 2] | 0) + (HEAP32[$21 >> 2] | 0);
   HEAP32[$$sink3536 + -4 >> 2] = HEAP32[$27 >> 2];
   $45 = $$sink3536 + 16 | 0;
   $46 = HEAP32[$3 >> 2] | 0;
   $48 = $46 - $45 | 0;
   $49 = $48 >> 4;
   if (!$49) $53 = $46; else {
    _memmove($$sink3536 | 0, $45 | 0, $48 | 0) | 0;
    $53 = HEAP32[$3 >> 2] | 0;
   }
   $52 = $$sink3536 + ($49 << 4) | 0;
   if (($53 | 0) != ($52 | 0)) HEAP32[$3 >> 2] = $53 + (~(($53 + -16 - $52 | 0) >>> 4) << 4);
  }
  $60 = $39 + -16 | 0;
  if (($60 | 0) == (HEAP32[$1 >> 2] | 0)) break; else {
   $$sink3536$phi = $39;
   $39 = $60;
   $$sink3536 = $$sink3536$phi;
  }
 }
 return;
}

function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $13 = 0, $19 = 0, $22 = 0, $23 = 0, $25 = 0, $33 = 0, $44 = 0, label = 0;
 do if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); else {
  if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
   $44 = HEAP32[$0 + 8 >> 2] | 0;
   FUNCTION_TABLE_viiiii[HEAP32[(HEAP32[$44 >> 2] | 0) + 24 >> 2] & 3]($44, $1, $2, $3, $4);
   break;
  }
  if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
   $13 = $1 + 20 | 0;
   if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
    HEAP32[$1 + 32 >> 2] = $3;
    $19 = $1 + 44 | 0;
    if ((HEAP32[$19 >> 2] | 0) == 4) break;
    $22 = $1 + 52 | 0;
    HEAP8[$22 >> 0] = 0;
    $23 = $1 + 53 | 0;
    HEAP8[$23 >> 0] = 0;
    $25 = HEAP32[$0 + 8 >> 2] | 0;
    FUNCTION_TABLE_viiiiii[HEAP32[(HEAP32[$25 >> 2] | 0) + 20 >> 2] & 3]($25, $1, $2, $2, 1, $4);
    if (!(HEAP8[$23 >> 0] | 0)) {
     $$037$off038 = 4;
     label = 11;
    } else if (!(HEAP8[$22 >> 0] | 0)) {
     $$037$off038 = 3;
     label = 11;
    } else $$037$off039 = 3;
    if ((label | 0) == 11) {
     HEAP32[$13 >> 2] = $2;
     $33 = $1 + 40 | 0;
     HEAP32[$33 >> 2] = (HEAP32[$33 >> 2] | 0) + 1;
     if ((HEAP32[$1 + 36 >> 2] | 0) == 1) if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
      HEAP8[$1 + 54 >> 0] = 1;
      $$037$off039 = $$037$off038;
     } else $$037$off039 = $$037$off038; else $$037$off039 = $$037$off038;
    }
    HEAP32[$19 >> 2] = $$037$off039;
    break;
   }
  }
  if (($3 | 0) == 1) HEAP32[$1 + 32 >> 2] = 1;
 } while (0);
 return;
}

function __ZNK10__cxxabiv119__pointer_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$4 = 0, $17 = 0, $19 = 0, $24 = 0, $26 = 0, $28 = 0, $3 = 0, $30 = 0, $8 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64 | 0;
 $3 = sp;
 HEAP32[$2 >> 2] = HEAP32[HEAP32[$2 >> 2] >> 2];
 if (__ZNK10__cxxabiv117__pbase_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, 0) | 0) $$4 = 1; else if (!$1) $$4 = 0; else {
  $8 = ___dynamic_cast($1, 472, 560, 0) | 0;
  if (!$8) $$4 = 0; else if (!(HEAP32[$8 + 8 >> 2] & ~HEAP32[$0 + 8 >> 2])) {
   $17 = $0 + 12 | 0;
   $19 = $8 + 12 | 0;
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b(HEAP32[$17 >> 2] | 0, HEAP32[$19 >> 2] | 0, 0) | 0) $$4 = 1; else if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b(HEAP32[$17 >> 2] | 0, 592, 0) | 0) $$4 = 1; else {
    $24 = HEAP32[$17 >> 2] | 0;
    if (!$24) $$4 = 0; else {
     $26 = ___dynamic_cast($24, 472, 456, 0) | 0;
     if (!$26) $$4 = 0; else {
      $28 = HEAP32[$19 >> 2] | 0;
      if (!$28) $$4 = 0; else {
       $30 = ___dynamic_cast($28, 472, 456, 0) | 0;
       if (!$30) $$4 = 0; else {
        dest = $3 + 4 | 0;
        stop = dest + 52 | 0;
        do {
         HEAP32[dest >> 2] = 0;
         dest = dest + 4 | 0;
        } while ((dest | 0) < (stop | 0));
        HEAP32[$3 >> 2] = $30;
        HEAP32[$3 + 8 >> 2] = $26;
        HEAP32[$3 + 12 >> 2] = -1;
        HEAP32[$3 + 48 >> 2] = 1;
        FUNCTION_TABLE_viiii[HEAP32[(HEAP32[$30 >> 2] | 0) + 28 >> 2] & 3]($30, $3, HEAP32[$2 >> 2] | 0, 1);
        if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
         HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2];
         $$0 = 1;
        } else $$0 = 0;
        $$4 = $$0;
       }
      }
     }
    }
   }
  } else $$4 = 0;
 }
 STACKTOP = sp;
 return $$4 | 0;
}

function __ZN53EmscriptenBindingInitializer_native_and_builtin_typesC2Ev($0) {
 $0 = $0 | 0;
 __embind_register_void(592, 1714);
 __embind_register_bool(608, 1719, 1, 1, 0);
 __embind_register_integer(616, 1724, 1, -128, 127);
 __embind_register_integer(632, 1729, 1, -128, 127);
 __embind_register_integer(624, 1741, 1, 0, 255);
 __embind_register_integer(640, 1755, 2, -32768, 32767);
 __embind_register_integer(648, 1761, 2, 0, 65535);
 __embind_register_integer(656, 1776, 4, -2147483648, 2147483647);
 __embind_register_integer(664, 1780, 4, 0, -1);
 __embind_register_integer(672, 1793, 4, -2147483648, 2147483647);
 __embind_register_integer(680, 1798, 4, 0, -1);
 __embind_register_float(688, 1812, 4);
 __embind_register_float(696, 1818, 8);
 __embind_register_std_string(264, 1825);
 __embind_register_std_string(288, 1837);
 __embind_register_std_wstring(312, 4, 1870);
 __embind_register_emval(336, 1883);
 __embind_register_memory_view(344, 0, 1899);
 __embind_register_memory_view(352, 0, 1929);
 __embind_register_memory_view(360, 1, 1966);
 __embind_register_memory_view(368, 2, 2005);
 __embind_register_memory_view(376, 3, 2036);
 __embind_register_memory_view(384, 4, 2076);
 __embind_register_memory_view(392, 5, 2105);
 __embind_register_memory_view(400, 4, 2143);
 __embind_register_memory_view(408, 5, 2173);
 __embind_register_memory_view(352, 0, 2212);
 __embind_register_memory_view(360, 1, 2244);
 __embind_register_memory_view(368, 2, 2277);
 __embind_register_memory_view(376, 3, 2310);
 __embind_register_memory_view(384, 4, 2344);
 __embind_register_memory_view(392, 5, 2377);
 __embind_register_memory_view(416, 6, 2411);
 __embind_register_memory_view(424, 7, 2442);
 __embind_register_memory_view(432, 7, 2474);
 return;
}

function __ZN9ckms_impl6insertEd($0, $1) {
 $0 = $0 | 0;
 $1 = +$1;
 var $$0$lcssa$i = 0, $$017$i = 0, $$byval_copy = 0, $$lcssa$i = 0, $$sink16$i = 0, $14 = 0, $16 = 0, $2 = 0, $22 = 0, $27 = 0, $3 = 0, $37 = 0, $4 = 0, $5 = 0, $6 = 0, $8 = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32 | 0;
 $$byval_copy = sp + 20 | 0;
 $2 = sp;
 $3 = sp + 16 | 0;
 $4 = $0 + 8 | 0;
 $5 = HEAP32[$4 >> 2] | 0;
 $6 = $5;
 $8 = HEAP32[$0 + 12 >> 2] | 0;
 L1 : do if (($5 | 0) == ($8 | 0)) {
  $$0$lcssa$i = 0;
  $$lcssa$i = $6;
 } else {
  $$017$i = 0;
  $$sink16$i = $5;
  $37 = $6;
  while (1) {
   if (!(+HEAPF64[$$sink16$i >> 3] <= $1)) {
    $$0$lcssa$i = $$017$i;
    $$lcssa$i = $37;
    break L1;
   }
   $14 = (HEAP32[$$sink16$i + 8 >> 2] | 0) + $$017$i | 0;
   $$sink16$i = $$sink16$i + 16 | 0;
   $16 = $$sink16$i;
   if (($$sink16$i | 0) == ($8 | 0)) {
    $$0$lcssa$i = $14;
    $$lcssa$i = $16;
    break;
   } else {
    $$017$i = $14;
    $37 = $16;
   }
  }
 } while (0);
 $22 = $0 + 4 | 0;
 $27 = ~~+Math_floor(+(+FUNCTION_TABLE_didi[HEAP32[(HEAP32[$0 >> 2] | 0) + 12 >> 2] & 3]($0, +($$0$lcssa$i | 0), HEAP32[$22 >> 2] | 0))) + -1 | 0;
 HEAPF64[$2 >> 3] = $1;
 HEAP32[$2 + 8 >> 2] = 1;
 HEAP32[$2 + 12 >> 2] = ($27 | 0) > 0 ? $27 : 0;
 HEAP32[$3 >> 2] = $$lcssa$i;
 HEAP32[$$byval_copy >> 2] = HEAP32[$3 >> 2];
 __ZNSt3__26vectorIN9ckms_impl5tupleENS_9allocatorIS2_EEE6insertENS_11__wrap_iterIPKS2_EERS7_($4, $$byval_copy, $2) | 0;
 HEAP32[$22 >> 2] = (HEAP32[$22 >> 2] | 0) + 1;
 if (!(FUNCTION_TABLE_ii[HEAP32[(HEAP32[$0 >> 2] | 0) + 8 >> 2] & 15]($0) | 0)) {
  STACKTOP = sp;
  return;
 }
 __ZN9ckms_impl8compressEv($0);
 STACKTOP = sp;
 return;
}

function ___dynamic_cast($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $4 = 0, $5 = 0, $8 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64 | 0;
 $4 = sp;
 $5 = HEAP32[$0 >> 2] | 0;
 $8 = $0 + (HEAP32[$5 + -8 >> 2] | 0) | 0;
 $10 = HEAP32[$5 + -4 >> 2] | 0;
 HEAP32[$4 >> 2] = $2;
 HEAP32[$4 + 4 >> 2] = $0;
 HEAP32[$4 + 8 >> 2] = $1;
 HEAP32[$4 + 12 >> 2] = $3;
 $14 = $4 + 16 | 0;
 $15 = $4 + 20 | 0;
 $16 = $4 + 24 | 0;
 $17 = $4 + 28 | 0;
 $18 = $4 + 32 | 0;
 $19 = $4 + 40 | 0;
 dest = $14;
 stop = dest + 36 | 0;
 do {
  HEAP32[dest >> 2] = 0;
  dest = dest + 4 | 0;
 } while ((dest | 0) < (stop | 0));
 HEAP16[$14 + 36 >> 1] = 0;
 HEAP8[$14 + 38 >> 0] = 0;
 L1 : do if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10, $2, 0) | 0) {
  HEAP32[$4 + 48 >> 2] = 1;
  FUNCTION_TABLE_viiiiii[HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] & 3]($10, $4, $8, $8, 1, 0);
  $$0 = (HEAP32[$16 >> 2] | 0) == 1 ? $8 : 0;
 } else {
  FUNCTION_TABLE_viiiii[HEAP32[(HEAP32[$10 >> 2] | 0) + 24 >> 2] & 3]($10, $4, $8, 1, 0);
  switch (HEAP32[$4 + 36 >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$19 >> 2] | 0) == 1 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1 ? HEAP32[$15 >> 2] | 0 : 0;
    break L1;
    break;
   }
  case 1:
   break;
  default:
   {
    $$0 = 0;
    break L1;
   }
  }
  if ((HEAP32[$16 >> 2] | 0) != 1) if (!((HEAP32[$19 >> 2] | 0) == 0 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1)) {
   $$0 = 0;
   break;
  }
  $$0 = HEAP32[$14 >> 2] | 0;
 } while (0);
 STACKTOP = sp;
 return $$0 | 0;
}

function __ZN6stmpct2gk6insertEd($0, $1) {
 $0 = $0 | 0;
 $1 = +$1;
 var $$0$i$i$i = 0, $$byval_copy = 0, $$sroa$04$0$lcssa$i$i$i = 0, $$sroa$04$08$i$i$i = 0, $13 = 0, $15 = 0, $2 = 0, $22 = 0, $3 = 0, $5 = 0, $6 = 0, $8 = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32 | 0;
 $$byval_copy = sp + 20 | 0;
 $2 = sp;
 $3 = sp + 16 | 0;
 $5 = HEAP32[$0 + 4 >> 2] | 0;
 $6 = $5 + 12 | 0;
 $8 = $5 + 8 | 0;
 if (!((HEAP32[$6 >> 2] | 0) % (HEAP32[$8 >> 2] | 0) | 0)) __ZN6stmpct2gk4impl8compressEv($5);
 $13 = HEAP32[$5 + 16 >> 2] | 0;
 $15 = HEAP32[$5 + 20 >> 2] | 0;
 L4 : do if (($13 | 0) == ($15 | 0)) $$sroa$04$0$lcssa$i$i$i = $13; else {
  $$sroa$04$08$i$i$i = $13;
  while (1) {
   if (!(+HEAPF64[$$sroa$04$08$i$i$i >> 3] <= $1)) {
    $$sroa$04$0$lcssa$i$i$i = $$sroa$04$08$i$i$i;
    break L4;
   }
   $$sroa$04$08$i$i$i = $$sroa$04$08$i$i$i + 16 | 0;
   if (($$sroa$04$08$i$i$i | 0) == ($15 | 0)) {
    $$sroa$04$0$lcssa$i$i$i = $15;
    break;
   }
  }
 } while (0);
 $22 = HEAP32[$6 >> 2] | 0;
 if (($$sroa$04$0$lcssa$i$i$i | 0) == ($15 | 0) | (($$sroa$04$0$lcssa$i$i$i | 0) == ($13 | 0) ? 1 : ($22 | 0) <= (HEAP32[$8 >> 2] | 0))) $$0$i$i$i = 0; else $$0$i$i$i = ~~+Math_floor(+(+HEAPF64[$5 >> 3] * 2.0 * +($22 | 0))) + -1 | 0;
 HEAPF64[$2 >> 3] = $1;
 HEAP32[$2 + 8 >> 2] = 1;
 HEAP32[$2 + 12 >> 2] = $$0$i$i$i;
 HEAP32[$3 >> 2] = $$sroa$04$0$lcssa$i$i$i;
 HEAP32[$$byval_copy >> 2] = HEAP32[$3 >> 2];
 __ZNSt3__26vectorIN6stmpct2gk4impl5tupleENS_9allocatorIS4_EEE6insertENS_11__wrap_iterIPKS4_EERS9_($5 + 16 | 0, $$byval_copy, $2) | 0;
 HEAP32[$6 >> 2] = (HEAP32[$6 >> 2] | 0) + 1;
 STACKTOP = sp;
 return;
}

function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $15 = 0, $16 = 0, $19 = 0, $20 = 0, $21 = 0, $9 = 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); else {
  $9 = $1 + 52 | 0;
  $10 = HEAP8[$9 >> 0] | 0;
  $11 = $1 + 53 | 0;
  $12 = HEAP8[$11 >> 0] | 0;
  $15 = HEAP32[$0 + 12 >> 2] | 0;
  $16 = $0 + 16 + ($15 << 3) | 0;
  HEAP8[$9 >> 0] = 0;
  HEAP8[$11 >> 0] = 0;
  __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0 + 16 | 0, $1, $2, $3, $4, $5);
  L4 : do if (($15 | 0) > 1) {
   $19 = $1 + 24 | 0;
   $20 = $0 + 8 | 0;
   $21 = $1 + 54 | 0;
   $$0 = $0 + 24 | 0;
   do {
    if (HEAP8[$21 >> 0] | 0) break L4;
    if (!(HEAP8[$9 >> 0] | 0)) {
     if (HEAP8[$11 >> 0] | 0) if (!(HEAP32[$20 >> 2] & 1)) break L4;
    } else {
     if ((HEAP32[$19 >> 2] | 0) == 1) break L4;
     if (!(HEAP32[$20 >> 2] & 2)) break L4;
    }
    HEAP8[$9 >> 0] = 0;
    HEAP8[$11 >> 0] = 0;
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$0, $1, $2, $3, $4, $5);
    $$0 = $$0 + 8 | 0;
   } while ($$0 >>> 0 < $16 >>> 0);
  } while (0);
  HEAP8[$9 >> 0] = $10;
  HEAP8[$11 >> 0] = $12;
 }
 return;
}

function __ZN9ckms_impl8quantileEd($0, $1) {
 $0 = $0 | 0;
 $1 = +$1;
 var $$027 = 0, $$1 = 0.0, $$sroa$014$0$in$lcssa = 0, $$sroa$014$0$in25 = 0, $$sroa$018$024 = 0, $$sroa$018$028 = 0, $11 = 0.0, $17 = 0.0, $18 = 0, $19 = 0, $2 = 0, $32 = 0, $4 = 0, $9 = 0;
 $2 = $0 + 8 | 0;
 $4 = $0 + 12 | 0;
 if ((HEAP32[$2 >> 2] | 0) == (HEAP32[$4 >> 2] | 0)) {
  $$1 = +_nan(3976);
  return +$$1;
 }
 $9 = HEAP32[$0 + 4 >> 2] | 0;
 $11 = +($9 | 0) * $1;
 $17 = $11 + +FUNCTION_TABLE_didi[HEAP32[(HEAP32[$0 >> 2] | 0) + 12 >> 2] & 3]($0, $11, $9) * .5;
 $18 = HEAP32[$2 >> 2] | 0;
 $$sroa$018$024 = $18 + 16 | 0;
 $19 = HEAP32[$4 >> 2] | 0;
 L5 : do if (($$sroa$018$024 | 0) == ($19 | 0)) $$sroa$014$0$in$lcssa = $18; else {
  $$027 = 0;
  $$sroa$014$0$in25 = $18;
  $$sroa$018$028 = $$sroa$018$024;
  while (1) {
   $$027 = (HEAP32[$$sroa$014$0$in25 + 8 >> 2] | 0) + $$027 | 0;
   if ($17 < +($$027 + (HEAP32[$$sroa$014$0$in25 + 24 >> 2] | 0) + (HEAP32[$$sroa$014$0$in25 + 28 >> 2] | 0) | 0)) {
    $$sroa$014$0$in$lcssa = $$sroa$014$0$in25;
    break L5;
   }
   $32 = $$sroa$014$0$in25 + 16 | 0;
   $$sroa$018$028 = $$sroa$018$028 + 16 | 0;
   if (($$sroa$018$028 | 0) == ($19 | 0)) {
    $$sroa$014$0$in$lcssa = $32;
    break;
   } else $$sroa$014$0$in25 = $32;
  }
 } while (0);
 $$1 = +HEAPF64[$$sroa$014$0$in$lcssa >> 3];
 return +$$1;
}

function _memset(ptr, value, num) {
 ptr = ptr | 0;
 value = value | 0;
 num = num | 0;
 var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
 end = ptr + num | 0;
 value = value & 255;
 if ((num | 0) >= 67) {
  while (ptr & 3) {
   HEAP8[ptr >> 0] = value;
   ptr = ptr + 1 | 0;
  }
  aligned_end = end & -4 | 0;
  block_aligned_end = aligned_end - 64 | 0;
  value4 = value | value << 8 | value << 16 | value << 24;
  while ((ptr | 0) <= (block_aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4;
   HEAP32[ptr + 4 >> 2] = value4;
   HEAP32[ptr + 8 >> 2] = value4;
   HEAP32[ptr + 12 >> 2] = value4;
   HEAP32[ptr + 16 >> 2] = value4;
   HEAP32[ptr + 20 >> 2] = value4;
   HEAP32[ptr + 24 >> 2] = value4;
   HEAP32[ptr + 28 >> 2] = value4;
   HEAP32[ptr + 32 >> 2] = value4;
   HEAP32[ptr + 36 >> 2] = value4;
   HEAP32[ptr + 40 >> 2] = value4;
   HEAP32[ptr + 44 >> 2] = value4;
   HEAP32[ptr + 48 >> 2] = value4;
   HEAP32[ptr + 52 >> 2] = value4;
   HEAP32[ptr + 56 >> 2] = value4;
   HEAP32[ptr + 60 >> 2] = value4;
   ptr = ptr + 64 | 0;
  }
  while ((ptr | 0) < (aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4;
   ptr = ptr + 4 | 0;
  }
 }
 while ((ptr | 0) < (end | 0)) {
  HEAP8[ptr >> 0] = value;
  ptr = ptr + 1 | 0;
 }
 return end - num | 0;
}

function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $10 = 0, $11 = 0, $21 = 0, $22 = 0, $27 = 0, $30 = 0;
 HEAP8[$1 + 53 >> 0] = 1;
 do if ((HEAP32[$1 + 4 >> 2] | 0) == ($3 | 0)) {
  HEAP8[$1 + 52 >> 0] = 1;
  $10 = $1 + 16 | 0;
  $11 = HEAP32[$10 >> 2] | 0;
  if (!$11) {
   HEAP32[$10 >> 2] = $2;
   HEAP32[$1 + 24 >> 2] = $4;
   HEAP32[$1 + 36 >> 2] = 1;
   if (!(($4 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0)) break;
   HEAP8[$1 + 54 >> 0] = 1;
   break;
  }
  if (($11 | 0) != ($2 | 0)) {
   $30 = $1 + 36 | 0;
   HEAP32[$30 >> 2] = (HEAP32[$30 >> 2] | 0) + 1;
   HEAP8[$1 + 54 >> 0] = 1;
   break;
  }
  $21 = $1 + 24 | 0;
  $22 = HEAP32[$21 >> 2] | 0;
  if (($22 | 0) == 2) {
   HEAP32[$21 >> 2] = $4;
   $27 = $4;
  } else $27 = $22;
  if (($27 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0) HEAP8[$1 + 54 >> 0] = 1;
 } while (0);
 return;
}

function __ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $13 = 0, $19 = 0;
 do if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); else if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
  if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
   $13 = $1 + 20 | 0;
   if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
    HEAP32[$1 + 32 >> 2] = $3;
    HEAP32[$13 >> 2] = $2;
    $19 = $1 + 40 | 0;
    HEAP32[$19 >> 2] = (HEAP32[$19 >> 2] | 0) + 1;
    if ((HEAP32[$1 + 36 >> 2] | 0) == 1) if ((HEAP32[$1 + 24 >> 2] | 0) == 2) HEAP8[$1 + 54 >> 0] = 1;
    HEAP32[$1 + 44 >> 2] = 4;
    break;
   }
  }
  if (($3 | 0) == 1) HEAP32[$1 + 32 >> 2] = 1;
 } while (0);
 return;
}

function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$2 = 0, $3 = 0, $6 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64 | 0;
 $3 = sp;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) $$2 = 1; else if (!$1) $$2 = 0; else {
  $6 = ___dynamic_cast($1, 472, 456, 0) | 0;
  if (!$6) $$2 = 0; else {
   dest = $3 + 4 | 0;
   stop = dest + 52 | 0;
   do {
    HEAP32[dest >> 2] = 0;
    dest = dest + 4 | 0;
   } while ((dest | 0) < (stop | 0));
   HEAP32[$3 >> 2] = $6;
   HEAP32[$3 + 8 >> 2] = $0;
   HEAP32[$3 + 12 >> 2] = -1;
   HEAP32[$3 + 48 >> 2] = 1;
   FUNCTION_TABLE_viiii[HEAP32[(HEAP32[$6 >> 2] | 0) + 28 >> 2] & 3]($6, $3, HEAP32[$2 >> 2] | 0, 1);
   if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
    HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2];
    $$0 = 1;
   } else $$0 = 0;
   $$2 = $$0;
  }
 }
 STACKTOP = sp;
 return $$2 | 0;
}

function _strlen($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$015$lcssa = 0, $$01519 = 0, $$1$lcssa = 0, $$pn = 0, $$sink = 0, $1 = 0, $10 = 0, $19 = 0, $23 = 0, $6 = 0, label = 0;
 $1 = $0;
 L1 : do if (!($1 & 3)) {
  $$015$lcssa = $0;
  label = 4;
 } else {
  $$01519 = $0;
  $23 = $1;
  while (1) {
   if (!(HEAP8[$$01519 >> 0] | 0)) {
    $$sink = $23;
    break L1;
   }
   $6 = $$01519 + 1 | 0;
   $23 = $6;
   if (!($23 & 3)) {
    $$015$lcssa = $6;
    label = 4;
    break;
   } else $$01519 = $6;
  }
 } while (0);
 if ((label | 0) == 4) {
  $$0 = $$015$lcssa;
  while (1) {
   $10 = HEAP32[$$0 >> 2] | 0;
   if (!(($10 & -2139062144 ^ -2139062144) & $10 + -16843009)) $$0 = $$0 + 4 | 0; else break;
  }
  if (!(($10 & 255) << 24 >> 24)) $$1$lcssa = $$0; else {
   $$pn = $$0;
   while (1) {
    $19 = $$pn + 1 | 0;
    if (!(HEAP8[$19 >> 0] | 0)) {
     $$1$lcssa = $19;
     break;
    } else $$pn = $19;
   }
  }
  $$sink = $$1$lcssa;
 }
 return $$sink - $1 | 0;
}

function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $13 = 0, $9 = 0;
 L1 : do if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); else {
  $9 = HEAP32[$0 + 12 >> 2] | 0;
  $10 = $0 + 16 + ($9 << 3) | 0;
  __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0 + 16 | 0, $1, $2, $3);
  if (($9 | 0) > 1) {
   $13 = $1 + 54 | 0;
   $$0 = $0 + 24 | 0;
   do {
    __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($$0, $1, $2, $3);
    if (HEAP8[$13 >> 0] | 0) break L1;
    $$0 = $$0 + 8 | 0;
   } while ($$0 >>> 0 < $10 >>> 0);
  }
 } while (0);
 return;
}

function __ZN6stmpct2gk8quantileEd($0, $1) {
 $0 = $0 | 0;
 $1 = +$1;
 var $$02235$i = 0.0, $$3$i = 0.0, $$sroa$024$034$i = 0, $10 = 0, $12 = 0, $17 = 0.0, $3 = 0, $30 = 0, $7 = 0.0, $8 = 0.0;
 $3 = HEAP32[$0 + 4 >> 2] | 0;
 $7 = +(HEAP32[$3 + 12 >> 2] | 0);
 $8 = +HEAPF64[$3 >> 3] * $7;
 $10 = HEAP32[$3 + 16 >> 2] | 0;
 $12 = HEAP32[$3 + 20 >> 2] | 0;
 L1 : do if (($10 | 0) != ($12 | 0)) {
  $17 = +(~~+Math_ceil(+($7 * $1)) | 0);
  $$02235$i = 0.0;
  $$sroa$024$034$i = $10;
  while (1) {
   $$02235$i = $$02235$i + +(HEAP32[$$sroa$024$034$i + 8 >> 2] | 0);
   if ($17 - $$02235$i <= $8) if ($$02235$i + +(HEAP32[$$sroa$024$034$i + 12 >> 2] | 0) - $17 <= $8) break;
   $30 = $$sroa$024$034$i + 16 | 0;
   if (($30 | 0) == ($12 | 0)) break L1; else $$sroa$024$034$i = $30;
  }
  $$3$i = +HEAPF64[$$sroa$024$034$i >> 3];
  return +$$3$i;
 } while (0);
 $$3$i = +_nan(3976);
 return +$$3$i;
}

function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $5 = 0;
 $4 = $1 + 16 | 0;
 $5 = HEAP32[$4 >> 2] | 0;
 do if (!$5) {
  HEAP32[$4 >> 2] = $2;
  HEAP32[$1 + 24 >> 2] = $3;
  HEAP32[$1 + 36 >> 2] = 1;
 } else {
  if (($5 | 0) != ($2 | 0)) {
   $13 = $1 + 36 | 0;
   HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + 1;
   HEAP32[$1 + 24 >> 2] = 2;
   HEAP8[$1 + 54 >> 0] = 1;
   break;
  }
  $10 = $1 + 24 | 0;
  if ((HEAP32[$10 >> 2] | 0) == 2) HEAP32[$10 >> 2] = $3;
 } while (0);
 return;
}

function _sbrk(increment) {
 increment = increment | 0;
 var oldDynamicTop = 0, newDynamicTop = 0;
 oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0;
 newDynamicTop = oldDynamicTop + increment | 0;
 if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
  abortOnCannotGrowMemory() | 0;
  ___setErrNo(12);
  return -1;
 }
 HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop;
 if ((newDynamicTop | 0) > (getTotalMemory() | 0)) if (!(enlargeMemory() | 0)) {
  HEAP32[DYNAMICTOP_PTR >> 2] = oldDynamicTop;
  ___setErrNo(12);
  return -1;
 }
 return oldDynamicTop | 0;
}

function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $10 = 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); else {
  $10 = HEAP32[$0 + 8 >> 2] | 0;
  FUNCTION_TABLE_viiiiii[HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] & 3]($10, $1, $2, $3, $4, $5);
 }
 return;
}

function __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$0 = 0, $14 = 0, $7 = 0, $8 = 0;
 $7 = HEAP32[$0 + 4 >> 2] | 0;
 $8 = $7 >> 8;
 if (!($7 & 1)) $$0 = $8; else $$0 = HEAP32[(HEAP32[$3 >> 2] | 0) + $8 >> 2] | 0;
 $14 = HEAP32[$0 >> 2] | 0;
 FUNCTION_TABLE_viiiiii[HEAP32[(HEAP32[$14 >> 2] | 0) + 20 >> 2] & 3]($14, $1, $2, $3 + $$0 | 0, $7 & 2 | 0 ? $4 : 2, $5);
 return;
}

function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $8 = 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); else {
  $8 = HEAP32[$0 + 8 >> 2] | 0;
  FUNCTION_TABLE_viiii[HEAP32[(HEAP32[$8 >> 2] | 0) + 28 >> 2] & 3]($8, $1, $2, $3);
 }
 return;
}

function __ZN10emscripten8internal13MethodInvokerIMN6stmpct8ckms_lbqEFvdEvPS3_JdEE6invokeERKS5_S6_d($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = +$2;
 var $$unpack = 0, $$unpack4 = 0, $11 = 0, $4 = 0;
 $$unpack = HEAP32[$0 >> 2] | 0;
 $$unpack4 = HEAP32[$0 + 4 >> 2] | 0;
 $4 = $1 + ($$unpack4 >> 1) | 0;
 if (!($$unpack4 & 1)) {
  $11 = $$unpack;
  FUNCTION_TABLE_vid[$11 & 7]($4, $2);
  return;
 } else {
  $11 = HEAP32[(HEAP32[$4 >> 2] | 0) + $$unpack >> 2] | 0;
  FUNCTION_TABLE_vid[$11 & 7]($4, $2);
  return;
 }
}

function __ZN10emscripten8internal13MethodInvokerIMN6stmpct8ckms_hbqEFvdEvPS3_JdEE6invokeERKS5_S6_d($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = +$2;
 var $$unpack = 0, $$unpack4 = 0, $11 = 0, $4 = 0;
 $$unpack = HEAP32[$0 >> 2] | 0;
 $$unpack4 = HEAP32[$0 + 4 >> 2] | 0;
 $4 = $1 + ($$unpack4 >> 1) | 0;
 if (!($$unpack4 & 1)) {
  $11 = $$unpack;
  FUNCTION_TABLE_vid[$11 & 7]($4, $2);
  return;
 } else {
  $11 = HEAP32[(HEAP32[$4 >> 2] | 0) + $$unpack >> 2] | 0;
  FUNCTION_TABLE_vid[$11 & 7]($4, $2);
  return;
 }
}

function __ZN10emscripten8internal13MethodInvokerIMN6stmpct7ckms_uqEFvdEvPS3_JdEE6invokeERKS5_S6_d($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = +$2;
 var $$unpack = 0, $$unpack4 = 0, $11 = 0, $4 = 0;
 $$unpack = HEAP32[$0 >> 2] | 0;
 $$unpack4 = HEAP32[$0 + 4 >> 2] | 0;
 $4 = $1 + ($$unpack4 >> 1) | 0;
 if (!($$unpack4 & 1)) {
  $11 = $$unpack;
  FUNCTION_TABLE_vid[$11 & 7]($4, $2);
  return;
 } else {
  $11 = HEAP32[(HEAP32[$4 >> 2] | 0) + $$unpack >> 2] | 0;
  FUNCTION_TABLE_vid[$11 & 7]($4, $2);
  return;
 }
}

function __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $13 = 0, $6 = 0, $7 = 0;
 $6 = HEAP32[$0 + 4 >> 2] | 0;
 $7 = $6 >> 8;
 if (!($6 & 1)) $$0 = $7; else $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $7 >> 2] | 0;
 $13 = HEAP32[$0 >> 2] | 0;
 FUNCTION_TABLE_viiiii[HEAP32[(HEAP32[$13 >> 2] | 0) + 24 >> 2] & 3]($13, $1, $2 + $$0 | 0, $6 & 2 | 0 ? $3 : 2, $4);
 return;
}

function __ZN10emscripten8internal13MethodInvokerIMN6stmpct2gkEFvdEvPS3_JdEE6invokeERKS5_S6_d($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = +$2;
 var $$unpack = 0, $$unpack4 = 0, $11 = 0, $4 = 0;
 $$unpack = HEAP32[$0 >> 2] | 0;
 $$unpack4 = HEAP32[$0 + 4 >> 2] | 0;
 $4 = $1 + ($$unpack4 >> 1) | 0;
 if (!($$unpack4 & 1)) {
  $11 = $$unpack;
  FUNCTION_TABLE_vid[$11 & 7]($4, $2);
  return;
 } else {
  $11 = HEAP32[(HEAP32[$4 >> 2] | 0) + $$unpack >> 2] | 0;
  FUNCTION_TABLE_vid[$11 & 7]($4, $2);
  return;
 }
}

function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $12 = 0, $5 = 0, $6 = 0;
 $5 = HEAP32[$0 + 4 >> 2] | 0;
 $6 = $5 >> 8;
 if (!($5 & 1)) $$0 = $6; else $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $6 >> 2] | 0;
 $12 = HEAP32[$0 >> 2] | 0;
 FUNCTION_TABLE_viiii[HEAP32[(HEAP32[$12 >> 2] | 0) + 28 >> 2] & 3]($12, $1, $2 + $$0 | 0, $5 & 2 | 0 ? $3 : 2);
 return;
}

function __ZN10emscripten8internal13MethodInvokerIMN6stmpct8ckms_lbqEFddEdPS3_JdEE6invokeERKS5_S6_d($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = +$2;
 var $$unpack = 0, $$unpack4 = 0, $11 = 0, $4 = 0;
 $$unpack = HEAP32[$0 >> 2] | 0;
 $$unpack4 = HEAP32[$0 + 4 >> 2] | 0;
 $4 = $1 + ($$unpack4 >> 1) | 0;
 if (!($$unpack4 & 1)) $11 = $$unpack; else $11 = HEAP32[(HEAP32[$4 >> 2] | 0) + $$unpack >> 2] | 0;
 return +(+FUNCTION_TABLE_did[$11 & 7]($4, $2));
}

function __ZN10emscripten8internal13MethodInvokerIMN6stmpct8ckms_hbqEFddEdPS3_JdEE6invokeERKS5_S6_d($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = +$2;
 var $$unpack = 0, $$unpack4 = 0, $11 = 0, $4 = 0;
 $$unpack = HEAP32[$0 >> 2] | 0;
 $$unpack4 = HEAP32[$0 + 4 >> 2] | 0;
 $4 = $1 + ($$unpack4 >> 1) | 0;
 if (!($$unpack4 & 1)) $11 = $$unpack; else $11 = HEAP32[(HEAP32[$4 >> 2] | 0) + $$unpack >> 2] | 0;
 return +(+FUNCTION_TABLE_did[$11 & 7]($4, $2));
}

function __ZN10emscripten8internal13MethodInvokerIMN6stmpct7ckms_uqEFddEdPS3_JdEE6invokeERKS5_S6_d($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = +$2;
 var $$unpack = 0, $$unpack4 = 0, $11 = 0, $4 = 0;
 $$unpack = HEAP32[$0 >> 2] | 0;
 $$unpack4 = HEAP32[$0 + 4 >> 2] | 0;
 $4 = $1 + ($$unpack4 >> 1) | 0;
 if (!($$unpack4 & 1)) $11 = $$unpack; else $11 = HEAP32[(HEAP32[$4 >> 2] | 0) + $$unpack >> 2] | 0;
 return +(+FUNCTION_TABLE_did[$11 & 7]($4, $2));
}

function __ZN10emscripten8internal13MethodInvokerIMN6stmpct2gkEFddEdPS3_JdEE6invokeERKS5_S6_d($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = +$2;
 var $$unpack = 0, $$unpack4 = 0, $11 = 0, $4 = 0;
 $$unpack = HEAP32[$0 >> 2] | 0;
 $$unpack4 = HEAP32[$0 + 4 >> 2] | 0;
 $4 = $1 + ($$unpack4 >> 1) | 0;
 if (!($$unpack4 & 1)) $11 = $$unpack; else $11 = HEAP32[(HEAP32[$4 >> 2] | 0) + $$unpack >> 2] | 0;
 return +(+FUNCTION_TABLE_did[$11 & 7]($4, $2));
}

function _memmove(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0;
 if ((src | 0) < (dest | 0) & (dest | 0) < (src + num | 0)) {
  ret = dest;
  src = src + num | 0;
  dest = dest + num | 0;
  while ((num | 0) > 0) {
   dest = dest - 1 | 0;
   src = src - 1 | 0;
   num = num - 1 | 0;
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0;
  }
  dest = ret;
 } else _memcpy(dest, src, num) | 0;
 return dest | 0;
}

function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4);
 return;
}

function __ZN6stmpct2gkD0Ev($0) {
 $0 = $0 | 0;
 var $2 = 0, $5 = 0, $7 = 0, $8 = 0;
 HEAP32[$0 >> 2] = 896;
 $2 = HEAP32[$0 + 4 >> 2] | 0;
 if (!$2) {
  __ZdlPv($0);
  return;
 }
 $5 = HEAP32[$2 + 16 >> 2] | 0;
 if ($5 | 0) {
  $7 = $2 + 20 | 0;
  $8 = HEAP32[$7 >> 2] | 0;
  if (($8 | 0) != ($5 | 0)) HEAP32[$7 >> 2] = $8 + (~(($8 + -16 - $5 | 0) >>> 4) << 4);
  __ZdlPv($5);
 }
 __ZdlPv($2);
 __ZdlPv($0);
 return;
}

function __ZNSt3__218__libcpp_refstringC2EPKc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $4 = 0, $7 = 0;
 $2 = _strlen($1) | 0;
 $4 = __Znwj($2 + 13 | 0) | 0;
 HEAP32[$4 >> 2] = $2;
 HEAP32[$4 + 4 >> 2] = $2;
 HEAP32[$4 + 8 >> 2] = 0;
 $7 = __ZNSt3__215__refstring_imp12_GLOBAL__N_113data_from_repEPNS1_9_Rep_baseE($4) | 0;
 _memcpy($7 | 0, $1 | 0, $2 + 1 | 0) | 0;
 HEAP32[$0 >> 2] = $7;
 return;
}

function __ZN6stmpct8ckms_lbqC2Ed($0, $1) {
 $0 = $0 | 0;
 $1 = +$1;
 var $2 = 0, $4 = 0;
 HEAP32[$0 >> 2] = 800;
 $2 = __Znwj(40) | 0;
 $4 = $2 + 4 | 0;
 HEAP32[$4 >> 2] = 0;
 HEAP32[$4 + 4 >> 2] = 0;
 HEAP32[$4 + 8 >> 2] = 0;
 HEAP32[$4 + 12 >> 2] = 0;
 HEAP32[$2 >> 2] = 824;
 HEAPF64[$2 + 24 >> 3] = $1;
 HEAP32[$2 + 32 >> 2] = ~~(1.0 / ($1 * 2.0));
 HEAP32[$0 + 4 >> 2] = $2;
 return;
}

function __ZN6stmpct8ckms_hbqC2Ed($0, $1) {
 $0 = $0 | 0;
 $1 = +$1;
 var $2 = 0, $4 = 0;
 HEAP32[$0 >> 2] = 728;
 $2 = __Znwj(40) | 0;
 $4 = $2 + 4 | 0;
 HEAP32[$4 >> 2] = 0;
 HEAP32[$4 + 4 >> 2] = 0;
 HEAP32[$4 + 8 >> 2] = 0;
 HEAP32[$4 + 12 >> 2] = 0;
 HEAP32[$2 >> 2] = 752;
 HEAPF64[$2 + 24 >> 3] = $1;
 HEAP32[$2 + 32 >> 2] = ~~(1.0 / ($1 * 2.0));
 HEAP32[$0 + 4 >> 2] = $2;
 return;
}

function __ZN6stmpct7ckms_uqC2Ed($0, $1) {
 $0 = $0 | 0;
 $1 = +$1;
 var $2 = 0, $4 = 0;
 HEAP32[$0 >> 2] = 848;
 $2 = __Znwj(40) | 0;
 $4 = $2 + 4 | 0;
 HEAP32[$4 >> 2] = 0;
 HEAP32[$4 + 4 >> 2] = 0;
 HEAP32[$4 + 8 >> 2] = 0;
 HEAP32[$4 + 12 >> 2] = 0;
 HEAP32[$2 >> 2] = 872;
 HEAPF64[$2 + 24 >> 3] = $1;
 HEAP32[$2 + 32 >> 2] = ~~(1.0 / ($1 * 2.0));
 HEAP32[$0 + 4 >> 2] = $2;
 return;
}

function __ZNSt3__218__libcpp_refstringD2Ev($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $5 = 0;
 if (__ZNKSt3__218__libcpp_refstring15__uses_refcountEv($0) | 0) {
  $3 = __ZNSt3__215__refstring_imp12_GLOBAL__N_113rep_from_dataEPKc_292(HEAP32[$0 >> 2] | 0) | 0;
  $4 = $3 + 8 | 0;
  $5 = HEAP32[$4 >> 2] | 0;
  HEAP32[$4 >> 2] = $5 + -1;
  if (($5 + -1 | 0) < 0) __ZdlPv($3);
 }
 return;
}

function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3);
 return;
}

function __ZN6stmpct2gkD2Ev($0) {
 $0 = $0 | 0;
 var $2 = 0, $5 = 0, $7 = 0, $8 = 0;
 HEAP32[$0 >> 2] = 896;
 $2 = HEAP32[$0 + 4 >> 2] | 0;
 if (!$2) return;
 $5 = HEAP32[$2 + 16 >> 2] | 0;
 if ($5 | 0) {
  $7 = $2 + 20 | 0;
  $8 = HEAP32[$7 >> 2] | 0;
  if (($8 | 0) != ($5 | 0)) HEAP32[$7 >> 2] = $8 + (~(($8 + -16 - $5 | 0) >>> 4) << 4);
  __ZdlPv($5);
 }
 __ZdlPv($2);
 return;
}

function __ZN6stmpct2gkC2Ed($0, $1) {
 $0 = $0 | 0;
 $1 = +$1;
 var $2 = 0, $8 = 0;
 HEAP32[$0 >> 2] = 896;
 $2 = __Znwj(32) | 0;
 HEAPF64[$2 >> 3] = $1;
 HEAP32[$2 + 8 >> 2] = ~~(1.0 / ($1 * 2.0));
 $8 = $2 + 12 | 0;
 HEAP32[$8 >> 2] = 0;
 HEAP32[$8 + 4 >> 2] = 0;
 HEAP32[$8 + 8 >> 2] = 0;
 HEAP32[$8 + 12 >> 2] = 0;
 HEAP32[$0 + 4 >> 2] = $2;
 return;
}

function __ZN6stmpct8ckms_lbq4implD0Ev($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0;
 HEAP32[$0 >> 2] = 776;
 $2 = HEAP32[$0 + 8 >> 2] | 0;
 if (!$2) {
  __ZdlPv($0);
  return;
 }
 $4 = $0 + 12 | 0;
 $5 = HEAP32[$4 >> 2] | 0;
 if (($5 | 0) != ($2 | 0)) HEAP32[$4 >> 2] = $5 + (~(($5 + -16 - $2 | 0) >>> 4) << 4);
 __ZdlPv($2);
 __ZdlPv($0);
 return;
}

function __ZN6stmpct8ckms_hbq4implD0Ev($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0;
 HEAP32[$0 >> 2] = 776;
 $2 = HEAP32[$0 + 8 >> 2] | 0;
 if (!$2) {
  __ZdlPv($0);
  return;
 }
 $4 = $0 + 12 | 0;
 $5 = HEAP32[$4 >> 2] | 0;
 if (($5 | 0) != ($2 | 0)) HEAP32[$4 >> 2] = $5 + (~(($5 + -16 - $2 | 0) >>> 4) << 4);
 __ZdlPv($2);
 __ZdlPv($0);
 return;
}

function __ZN6stmpct7ckms_uq4implD0Ev($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0;
 HEAP32[$0 >> 2] = 776;
 $2 = HEAP32[$0 + 8 >> 2] | 0;
 if (!$2) {
  __ZdlPv($0);
  return;
 }
 $4 = $0 + 12 | 0;
 $5 = HEAP32[$4 >> 2] | 0;
 if (($5 | 0) != ($2 | 0)) HEAP32[$4 >> 2] = $5 + (~(($5 + -16 - $2 | 0) >>> 4) << 4);
 __ZdlPv($2);
 __ZdlPv($0);
 return;
}

function __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $7 = 0;
 if ((HEAP32[$1 + 4 >> 2] | 0) == ($2 | 0)) {
  $7 = $1 + 28 | 0;
  if ((HEAP32[$7 >> 2] | 0) != 1) HEAP32[$7 >> 2] = $3;
 }
 return;
}

function __Znwj($0) {
 $0 = $0 | 0;
 var $$ = 0, $$lcssa = 0, $2 = 0, $4 = 0;
 $$ = ($0 | 0) == 0 ? 1 : $0;
 while (1) {
  $2 = _malloc($$) | 0;
  if ($2 | 0) {
   $$lcssa = $2;
   break;
  }
  $4 = __ZSt15get_new_handlerv() | 0;
  if (!$4) {
   $$lcssa = 0;
   break;
  }
  FUNCTION_TABLE_v[$4 & 1]();
 }
 return $$lcssa | 0;
}

function __ZNK10__cxxabiv117__pbase_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) $$0 = 1; else $$0 = __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($1, 600, 0) | 0;
 return $$0 | 0;
}

function __ZN9ckms_implD2Ev($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0;
 HEAP32[$0 >> 2] = 776;
 $2 = HEAP32[$0 + 8 >> 2] | 0;
 if (!$2) return;
 $4 = $0 + 12 | 0;
 $5 = HEAP32[$4 >> 2] | 0;
 if (($5 | 0) != ($2 | 0)) HEAP32[$4 >> 2] = $5 + (~(($5 + -16 - $2 | 0) >>> 4) << 4);
 __ZdlPv($2);
 return;
}

function __ZN10emscripten8internal7InvokerIPN6stmpct8ckms_lbqEJOdEE6invokeEPFS4_S5_Ed($0, $1) {
 $0 = $0 | 0;
 $1 = +$1;
 var $2 = 0, $3 = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16 | 0;
 $2 = sp;
 HEAPF64[$2 >> 3] = $1;
 $3 = FUNCTION_TABLE_ii[$0 & 15]($2) | 0;
 STACKTOP = sp;
 return $3 | 0;
}

function __ZN10emscripten8internal7InvokerIPN6stmpct8ckms_hbqEJOdEE6invokeEPFS4_S5_Ed($0, $1) {
 $0 = $0 | 0;
 $1 = +$1;
 var $2 = 0, $3 = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16 | 0;
 $2 = sp;
 HEAPF64[$2 >> 3] = $1;
 $3 = FUNCTION_TABLE_ii[$0 & 15]($2) | 0;
 STACKTOP = sp;
 return $3 | 0;
}

function __ZN10emscripten8internal7InvokerIPN6stmpct7ckms_uqEJOdEE6invokeEPFS4_S5_Ed($0, $1) {
 $0 = $0 | 0;
 $1 = +$1;
 var $2 = 0, $3 = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16 | 0;
 $2 = sp;
 HEAPF64[$2 >> 3] = $1;
 $3 = FUNCTION_TABLE_ii[$0 & 15]($2) | 0;
 STACKTOP = sp;
 return $3 | 0;
}

function __ZN10emscripten8internal7InvokerIPN6stmpct2gkEJOdEE6invokeEPFS4_S5_Ed($0, $1) {
 $0 = $0 | 0;
 $1 = +$1;
 var $2 = 0, $3 = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16 | 0;
 $2 = sp;
 HEAPF64[$2 >> 3] = $1;
 $3 = FUNCTION_TABLE_ii[$0 & 15]($2) | 0;
 STACKTOP = sp;
 return $3 | 0;
}

function __ZN6stmpct8ckms_lbqD0Ev($0) {
 $0 = $0 | 0;
 var $2 = 0;
 HEAP32[$0 >> 2] = 800;
 $2 = HEAP32[$0 + 4 >> 2] | 0;
 if (!$2) {
  __ZdlPv($0);
  return;
 }
 FUNCTION_TABLE_vi[HEAP32[(HEAP32[$2 >> 2] | 0) + 4 >> 2] & 31]($2);
 __ZdlPv($0);
 return;
}

function __ZN6stmpct8ckms_hbqD0Ev($0) {
 $0 = $0 | 0;
 var $2 = 0;
 HEAP32[$0 >> 2] = 728;
 $2 = HEAP32[$0 + 4 >> 2] | 0;
 if (!$2) {
  __ZdlPv($0);
  return;
 }
 FUNCTION_TABLE_vi[HEAP32[(HEAP32[$2 >> 2] | 0) + 4 >> 2] & 31]($2);
 __ZdlPv($0);
 return;
}

function __ZN6stmpct7ckms_uqD0Ev($0) {
 $0 = $0 | 0;
 var $2 = 0;
 HEAP32[$0 >> 2] = 848;
 $2 = HEAP32[$0 + 4 >> 2] | 0;
 if (!$2) {
  __ZdlPv($0);
  return;
 }
 FUNCTION_TABLE_vi[HEAP32[(HEAP32[$2 >> 2] | 0) + 4 >> 2] & 31]($2);
 __ZdlPv($0);
 return;
}

function dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 a6 = a6 | 0;
 FUNCTION_TABLE_viiiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0);
}

function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 FUNCTION_TABLE_viiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0);
}

function __ZN6stmpct8ckms_lbqD2Ev($0) {
 $0 = $0 | 0;
 var $2 = 0;
 HEAP32[$0 >> 2] = 800;
 $2 = HEAP32[$0 + 4 >> 2] | 0;
 if (!$2) return;
 FUNCTION_TABLE_vi[HEAP32[(HEAP32[$2 >> 2] | 0) + 4 >> 2] & 31]($2);
 return;
}

function __ZN6stmpct8ckms_hbqD2Ev($0) {
 $0 = $0 | 0;
 var $2 = 0;
 HEAP32[$0 >> 2] = 728;
 $2 = HEAP32[$0 + 4 >> 2] | 0;
 if (!$2) return;
 FUNCTION_TABLE_vi[HEAP32[(HEAP32[$2 >> 2] | 0) + 4 >> 2] & 31]($2);
 return;
}

function __ZN6stmpct7ckms_uqD2Ev($0) {
 $0 = $0 | 0;
 var $2 = 0;
 HEAP32[$0 >> 2] = 848;
 $2 = HEAP32[$0 + 4 >> 2] | 0;
 if (!$2) return;
 FUNCTION_TABLE_vi[HEAP32[(HEAP32[$2 >> 2] | 0) + 4 >> 2] & 31]($2);
 return;
}

function __ZNK10__cxxabiv123__fundamental_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0;
}

function ___strdup($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0, $3 = 0;
 $2 = (_strlen($0) | 0) + 1 | 0;
 $3 = _malloc($2) | 0;
 if (!$3) $$0 = 0; else $$0 = _memcpy($3 | 0, $0 | 0, $2 | 0) | 0;
 return $$0 | 0;
}

function __ZN10emscripten8internal12operator_newIN6stmpct8ckms_lbqEJdEEEPT_DpOT0_($0) {
 $0 = $0 | 0;
 var $1 = 0;
 $1 = __Znwj(8) | 0;
 __ZN6stmpct8ckms_lbqC2Ed($1, +HEAPF64[$0 >> 3]);
 return $1 | 0;
}

function __ZN10emscripten8internal12operator_newIN6stmpct8ckms_hbqEJdEEEPT_DpOT0_($0) {
 $0 = $0 | 0;
 var $1 = 0;
 $1 = __Znwj(8) | 0;
 __ZN6stmpct8ckms_hbqC2Ed($1, +HEAPF64[$0 >> 3]);
 return $1 | 0;
}

function __ZN10emscripten8internal12operator_newIN6stmpct7ckms_uqEJdEEEPT_DpOT0_($0) {
 $0 = $0 | 0;
 var $1 = 0;
 $1 = __Znwj(8) | 0;
 __ZN6stmpct7ckms_uqC2Ed($1, +HEAPF64[$0 >> 3]);
 return $1 | 0;
}

function __ZN10emscripten8internal14raw_destructorIN6stmpct8ckms_lbqEEEvPT_($0) {
 $0 = $0 | 0;
 if (!$0) return;
 FUNCTION_TABLE_vi[HEAP32[(HEAP32[$0 >> 2] | 0) + 4 >> 2] & 31]($0);
 return;
}

function __ZN10emscripten8internal14raw_destructorIN6stmpct8ckms_hbqEEEvPT_($0) {
 $0 = $0 | 0;
 if (!$0) return;
 FUNCTION_TABLE_vi[HEAP32[(HEAP32[$0 >> 2] | 0) + 4 >> 2] & 31]($0);
 return;
}

function __ZN10emscripten8internal14raw_destructorIN6stmpct7ckms_uqEEEvPT_($0) {
 $0 = $0 | 0;
 if (!$0) return;
 FUNCTION_TABLE_vi[HEAP32[(HEAP32[$0 >> 2] | 0) + 4 >> 2] & 31]($0);
 return;
}

function dynCall_viiii(index, a1, a2, a3, a4) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 FUNCTION_TABLE_viiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0);
}

function __ZN10emscripten8internal12operator_newIN6stmpct2gkEJdEEEPT_DpOT0_($0) {
 $0 = $0 | 0;
 var $1 = 0;
 $1 = __Znwj(8) | 0;
 __ZN6stmpct2gkC2Ed($1, +HEAPF64[$0 >> 3]);
 return $1 | 0;
}

function __ZN10emscripten8internal14raw_destructorIN6stmpct2gkEEEvPT_($0) {
 $0 = $0 | 0;
 if (!$0) return;
 FUNCTION_TABLE_vi[HEAP32[(HEAP32[$0 >> 2] | 0) + 4 >> 2] & 31]($0);
 return;
}

function dynCall_iiii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 return FUNCTION_TABLE_iiii[index & 3](a1 | 0, a2 | 0, a3 | 0) | 0;
}

function dynCall_diid(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = +a3;
 return +FUNCTION_TABLE_diid[index & 7](a1 | 0, a2 | 0, +a3);
}

function dynCall_didi(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = +a2;
 a3 = a3 | 0;
 return +FUNCTION_TABLE_didi[index & 3](a1 | 0, +a2, a3 | 0);
}

function __ZNSt11logic_errorC2EPKc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = 1128;
 __ZNSt3__218__libcpp_refstringC2EPKc($0 + 4 | 0, $1);
 return;
}

function __ZNK6stmpct8ckms_lbq4impl18compress_conditionEv($0) {
 $0 = $0 | 0;
 return ((HEAP32[$0 + 4 >> 2] | 0) % (HEAP32[$0 + 32 >> 2] | 0) | 0 | 0) == 0 | 0;
}

function __ZNK6stmpct8ckms_hbq4impl18compress_conditionEv($0) {
 $0 = $0 | 0;
 return ((HEAP32[$0 + 4 >> 2] | 0) % (HEAP32[$0 + 32 >> 2] | 0) | 0 | 0) == 0 | 0;
}

function __ZNK6stmpct7ckms_uq4impl18compress_conditionEv($0) {
 $0 = $0 | 0;
 return ((HEAP32[$0 + 4 >> 2] | 0) % (HEAP32[$0 + 32 >> 2] | 0) | 0 | 0) == 0 | 0;
}
function stackAlloc(size) {
 size = size | 0;
 var ret = 0;
 ret = STACKTOP;
 STACKTOP = STACKTOP + size | 0;
 STACKTOP = STACKTOP + 15 & -16;
 return ret | 0;
}

function dynCall_viid(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = +a3;
 FUNCTION_TABLE_viid[index & 7](a1 | 0, a2 | 0, +a3);
}

function __ZNK6stmpct8ckms_hbq4impl1fEdi($0, $1, $2) {
 $0 = $0 | 0;
 $1 = +$1;
 $2 = $2 | 0;
 return +((+($2 | 0) - $1) * (+HEAPF64[$0 + 24 >> 3] * 2.0));
}

function establishStackSpace(stackBase, stackMax) {
 stackBase = stackBase | 0;
 stackMax = stackMax | 0;
 STACKTOP = stackBase;
 STACK_MAX = stackMax;
}

function __ZN10emscripten8internal13getActualTypeIN6stmpct8ckms_lbqEEEPKvPT_($0) {
 $0 = $0 | 0;
 return HEAP32[(HEAP32[$0 >> 2] | 0) + -4 >> 2] | 0;
}

function __ZN10emscripten8internal13getActualTypeIN6stmpct8ckms_hbqEEEPKvPT_($0) {
 $0 = $0 | 0;
 return HEAP32[(HEAP32[$0 >> 2] | 0) + -4 >> 2] | 0;
}

function __ZN10emscripten8internal13getActualTypeIN6stmpct7ckms_uqEEEPKvPT_($0) {
 $0 = $0 | 0;
 return HEAP32[(HEAP32[$0 >> 2] | 0) + -4 >> 2] | 0;
}

function __ZNK6stmpct7ckms_uq4impl1fEdi($0, $1, $2) {
 $0 = $0 | 0;
 $1 = +$1;
 $2 = $2 | 0;
 return +(+HEAPF64[$0 + 24 >> 3] * 2.0 * +($2 | 0));
}

function __ZN6stmpct8ckms_lbq8quantileEd($0, $1) {
 $0 = $0 | 0;
 $1 = +$1;
 return +(+__ZN9ckms_impl8quantileEd(HEAP32[$0 + 4 >> 2] | 0, $1));
}

function __ZN6stmpct8ckms_hbq8quantileEd($0, $1) {
 $0 = $0 | 0;
 $1 = +$1;
 return +(+__ZN9ckms_impl8quantileEd(HEAP32[$0 + 4 >> 2] | 0, $1));
}

function __ZN10emscripten8internal13getActualTypeIN6stmpct2gkEEEPKvPT_($0) {
 $0 = $0 | 0;
 return HEAP32[(HEAP32[$0 >> 2] | 0) + -4 >> 2] | 0;
}

function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return ($0 | 0) == ($1 | 0) | 0;
}

function __ZN6stmpct7ckms_uq8quantileEd($0, $1) {
 $0 = $0 | 0;
 $1 = +$1;
 return +(+__ZN9ckms_impl8quantileEd(HEAP32[$0 + 4 >> 2] | 0, $1));
}

function __ZN10__cxxabiv123__fundamental_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0);
 __ZdlPv($0);
 return;
}

function __ZN10__cxxabiv121__vmi_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0);
 __ZdlPv($0);
 return;
}

function __ZNK6stmpct8ckms_lbq4impl1fEdi($0, $1, $2) {
 $0 = $0 | 0;
 $1 = +$1;
 $2 = $2 | 0;
 return +(+HEAPF64[$0 + 24 >> 3] * 2.0 * $1);
}

function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0);
 __ZdlPv($0);
 return;
}

function setThrew(threw, value) {
 threw = threw | 0;
 value = value | 0;
 if (!__THREW__) {
  __THREW__ = threw;
  threwValue = value;
 }
}

function dynCall_iid(index, a1, a2) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = +a2;
 return FUNCTION_TABLE_iid[index & 7](a1 | 0, +a2) | 0;
}

function __ZN10__cxxabiv119__pointer_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0);
 __ZdlPv($0);
 return;
}

function __ZN6stmpct8ckms_lbq6insertEd($0, $1) {
 $0 = $0 | 0;
 $1 = +$1;
 __ZN9ckms_impl6insertEd(HEAP32[$0 + 4 >> 2] | 0, $1);
 return;
}

function __ZN6stmpct8ckms_hbq6insertEd($0, $1) {
 $0 = $0 | 0;
 $1 = +$1;
 __ZN9ckms_impl6insertEd(HEAP32[$0 + 4 >> 2] | 0, $1);
 return;
}

function __ZN6stmpct7ckms_uq6insertEd($0, $1) {
 $0 = $0 | 0;
 $1 = +$1;
 __ZN9ckms_impl6insertEd(HEAP32[$0 + 4 >> 2] | 0, $1);
 return;
}

function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0);
 __ZdlPv($0);
 return;
}

function dynCall_did(index, a1, a2) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = +a2;
 return +FUNCTION_TABLE_did[index & 7](a1 | 0, +a2);
}

function __ZNSt11logic_errorD2Ev($0) {
 $0 = $0 | 0;
 HEAP32[$0 >> 2] = 1128;
 __ZNSt3__218__libcpp_refstringD2Ev($0 + 4 | 0);
 return;
}

function b12(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 abort(12);
}

function dynCall_vid(index, a1, a2) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = +a2;
 FUNCTION_TABLE_vid[index & 7](a1 | 0, +a2);
}

function __ZNSt3__215__refstring_imp12_GLOBAL__N_113data_from_repEPNS1_9_Rep_baseE($0) {
 $0 = $0 | 0;
 return $0 + 12 | 0;
}

function __ZNKSt11logic_error4whatEv($0) {
 $0 = $0 | 0;
 return __ZNKSt3__218__libcpp_refstring5c_strEv($0 + 4 | 0) | 0;
}

function dynCall_ii(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 return FUNCTION_TABLE_ii[index & 15](a1 | 0) | 0;
}

function b11(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 abort(11);
}

function __ZNSt3__215__refstring_imp12_GLOBAL__N_113rep_from_dataEPKc_292($0) {
 $0 = $0 | 0;
 return $0 + -12 | 0;
}

function __GLOBAL__sub_I_bind_cpp() {
 __ZN53EmscriptenBindingInitializer_native_and_builtin_typesC2Ev(0);
 return;
}

function __GLOBAL__sub_I_stmpct_cpp() {
 __ZN50EmscriptenBindingInitializer_streaming_percentilesC2Ev(0);
 return;
}

function __ZSt15get_new_handlerv() {
 var $0 = 0;
 $0 = HEAP32[993] | 0;
 HEAP32[993] = $0 + 0;
 return $0 | 0;
}

function dynCall_vi(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 FUNCTION_TABLE_vi[index & 31](a1 | 0);
}

function __ZNSt12length_errorD0Ev($0) {
 $0 = $0 | 0;
 __ZNSt11logic_errorD2Ev($0);
 __ZdlPv($0);
 return;
}

function __ZNSt11logic_errorD0Ev($0) {
 $0 = $0 | 0;
 __ZNSt11logic_errorD2Ev($0);
 __ZdlPv($0);
 return;
}

function __ZNKSt3__220__vector_base_commonILb1EE20__throw_length_errorEv($0) {
 $0 = $0 | 0;
 _abort();
}

function b10(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 abort(10);
}

function __ZNKSt3__218__libcpp_refstring5c_strEv($0) {
 $0 = $0 | 0;
 return HEAP32[$0 >> 2] | 0;
}

function ___getTypeName($0) {
 $0 = $0 | 0;
 return ___strdup(HEAP32[$0 + 4 >> 2] | 0) | 0;
}

function __ZNKSt3__218__libcpp_refstring15__uses_refcountEv($0) {
 $0 = $0 | 0;
 return 1;
}

function b5(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 abort(5);
 return 0;
}

function b2(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = +p2;
 abort(2);
 return 0.0;
}

function b1(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = +p1;
 p2 = p2 | 0;
 abort(1);
 return 0.0;
}

function __ZNK10__cxxabiv116__shim_type_info5noop2Ev($0) {
 $0 = $0 | 0;
 return;
}

function __ZNK10__cxxabiv116__shim_type_info5noop1Ev($0) {
 $0 = $0 | 0;
 return;
}

function dynCall_v(index) {
 index = index | 0;
 FUNCTION_TABLE_v[index & 1]();
}

function __ZN10__cxxabiv116__shim_type_infoD2Ev($0) {
 $0 = $0 | 0;
 return;
}

function b9(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = +p2;
 abort(9);
}

function b0(p0, p1) {
 p0 = p0 | 0;
 p1 = +p1;
 abort(0);
 return 0.0;
}

function setTempRet0(value) {
 value = value | 0;
 tempRet0 = value;
}

function b4(p0, p1) {
 p0 = p0 | 0;
 p1 = +p1;
 abort(4);
 return 0;
}

function ___cxa_pure_virtual__wrapper() {
 ___cxa_pure_virtual();
}

function __ZN9ckms_implD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap();
}

function stackRestore(top) {
 top = top | 0;
 STACKTOP = top;
}

function __ZNSt9type_infoD2Ev($0) {
 $0 = $0 | 0;
 return;
}

function __ZNSt9exceptionD2Ev($0) {
 $0 = $0 | 0;
 return;
}

function b8(p0, p1) {
 p0 = p0 | 0;
 p1 = +p1;
 abort(8);
}

function __ZdlPv($0) {
 $0 = $0 | 0;
 _free($0);
 return;
}

function b3(p0) {
 p0 = p0 | 0;
 abort(3);
 return 0;
}

function _nan($0) {
 $0 = $0 | 0;
 return +nan;
}

function getTempRet0() {
 return tempRet0 | 0;
}

function stackSave() {
 return STACKTOP | 0;
}

function ___errno_location() {
 return 3968;
}

function b7(p0) {
 p0 = p0 | 0;
 abort(7);
}

function b6() {
 abort(6);
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_did = [b0,__ZN6stmpct8ckms_hbq8quantileEd,__ZN6stmpct8ckms_lbq8quantileEd,__ZN6stmpct7ckms_uq8quantileEd,__ZN6stmpct2gk8quantileEd,b0,b0,b0];
var FUNCTION_TABLE_didi = [b1,__ZNK6stmpct8ckms_hbq4impl1fEdi,__ZNK6stmpct8ckms_lbq4impl1fEdi,__ZNK6stmpct7ckms_uq4impl1fEdi];
var FUNCTION_TABLE_diid = [b2,__ZN10emscripten8internal13MethodInvokerIMN6stmpct2gkEFddEdPS3_JdEE6invokeERKS5_S6_d,__ZN10emscripten8internal13MethodInvokerIMN6stmpct8ckms_hbqEFddEdPS3_JdEE6invokeERKS5_S6_d,__ZN10emscripten8internal13MethodInvokerIMN6stmpct8ckms_lbqEFddEdPS3_JdEE6invokeERKS5_S6_d,__ZN10emscripten8internal13MethodInvokerIMN6stmpct7ckms_uqEFddEdPS3_JdEE6invokeERKS5_S6_d,b2,b2,b2];
var FUNCTION_TABLE_ii = [b3,__ZNK6stmpct8ckms_hbq4impl18compress_conditionEv,__ZNK6stmpct8ckms_lbq4impl18compress_conditionEv,__ZNK6stmpct7ckms_uq4impl18compress_conditionEv,__ZNKSt11logic_error4whatEv,__ZN10emscripten8internal13getActualTypeIN6stmpct2gkEEEPKvPT_,__ZN10emscripten8internal12operator_newIN6stmpct2gkEJdEEEPT_DpOT0_,__ZN10emscripten8internal13getActualTypeIN6stmpct8ckms_hbqEEEPKvPT_,__ZN10emscripten8internal12operator_newIN6stmpct8ckms_hbqEJdEEEPT_DpOT0_,__ZN10emscripten8internal13getActualTypeIN6stmpct8ckms_lbqEEEPKvPT_,__ZN10emscripten8internal12operator_newIN6stmpct8ckms_lbqEJdEEEPT_DpOT0_,__ZN10emscripten8internal13getActualTypeIN6stmpct7ckms_uqEEEPKvPT_,__ZN10emscripten8internal12operator_newIN6stmpct7ckms_uqEJdEEEPT_DpOT0_,b3,b3,b3];
var FUNCTION_TABLE_iid = [b4,__ZN10emscripten8internal7InvokerIPN6stmpct2gkEJOdEE6invokeEPFS4_S5_Ed,__ZN10emscripten8internal7InvokerIPN6stmpct8ckms_hbqEJOdEE6invokeEPFS4_S5_Ed,__ZN10emscripten8internal7InvokerIPN6stmpct8ckms_lbqEJOdEE6invokeEPFS4_S5_Ed,__ZN10emscripten8internal7InvokerIPN6stmpct7ckms_uqEJOdEE6invokeEPFS4_S5_Ed,b4,b4,b4];
var FUNCTION_TABLE_iiii = [b5,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,__ZNK10__cxxabiv123__fundamental_type_info9can_catchEPKNS_16__shim_type_infoERPv,__ZNK10__cxxabiv119__pointer_type_info9can_catchEPKNS_16__shim_type_infoERPv];
var FUNCTION_TABLE_v = [b6,___cxa_pure_virtual__wrapper];
var FUNCTION_TABLE_vi = [b7,__ZN6stmpct8ckms_hbqD2Ev,__ZN6stmpct8ckms_hbqD0Ev,__ZN9ckms_implD2Ev,__ZN6stmpct8ckms_hbq4implD0Ev,__ZN9ckms_implD0Ev,__ZN6stmpct8ckms_lbqD2Ev,__ZN6stmpct8ckms_lbqD0Ev,__ZN6stmpct8ckms_lbq4implD0Ev,__ZN6stmpct7ckms_uqD2Ev,__ZN6stmpct7ckms_uqD0Ev,__ZN6stmpct7ckms_uq4implD0Ev,__ZN6stmpct2gkD2Ev,__ZN6stmpct2gkD0Ev,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,__ZNSt11logic_errorD2Ev,__ZNSt11logic_errorD0Ev,__ZNSt12length_errorD0Ev,__ZN10__cxxabiv123__fundamental_type_infoD0Ev,__ZN10__cxxabiv119__pointer_type_infoD0Ev,__ZN10__cxxabiv121__vmi_class_type_infoD0Ev,__ZN10emscripten8internal14raw_destructorIN6stmpct2gkEEEvPT_,__ZN10emscripten8internal14raw_destructorIN6stmpct8ckms_hbqEEEvPT_,__ZN10emscripten8internal14raw_destructorIN6stmpct8ckms_lbqEEEvPT_,__ZN10emscripten8internal14raw_destructorIN6stmpct7ckms_uqEEEvPT_
,b7,b7,b7];
var FUNCTION_TABLE_vid = [b8,__ZN6stmpct8ckms_hbq6insertEd,__ZN6stmpct8ckms_lbq6insertEd,__ZN6stmpct7ckms_uq6insertEd,__ZN6stmpct2gk6insertEd,b8,b8,b8];
var FUNCTION_TABLE_viid = [b9,__ZN10emscripten8internal13MethodInvokerIMN6stmpct2gkEFvdEvPS3_JdEE6invokeERKS5_S6_d,__ZN10emscripten8internal13MethodInvokerIMN6stmpct8ckms_hbqEFvdEvPS3_JdEE6invokeERKS5_S6_d,__ZN10emscripten8internal13MethodInvokerIMN6stmpct8ckms_lbqEFvdEvPS3_JdEE6invokeERKS5_S6_d,__ZN10emscripten8internal13MethodInvokerIMN6stmpct7ckms_uqEFvdEvPS3_JdEE6invokeERKS5_S6_d,b9,b9,b9];
var FUNCTION_TABLE_viiii = [b10,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi];
var FUNCTION_TABLE_viiiii = [b11,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib];
var FUNCTION_TABLE_viiiiii = [b12,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib];

  return { __GLOBAL__sub_I_bind_cpp: __GLOBAL__sub_I_bind_cpp, __GLOBAL__sub_I_stmpct_cpp: __GLOBAL__sub_I_stmpct_cpp, ___errno_location: ___errno_location, ___getTypeName: ___getTypeName, _free: _free, _malloc: _malloc, _memcpy: _memcpy, _memmove: _memmove, _memset: _memset, _sbrk: _sbrk, dynCall_did: dynCall_did, dynCall_didi: dynCall_didi, dynCall_diid: dynCall_diid, dynCall_ii: dynCall_ii, dynCall_iid: dynCall_iid, dynCall_iiii: dynCall_iiii, dynCall_v: dynCall_v, dynCall_vi: dynCall_vi, dynCall_vid: dynCall_vid, dynCall_viid: dynCall_viid, dynCall_viiii: dynCall_viiii, dynCall_viiiii: dynCall_viiiii, dynCall_viiiiii: dynCall_viiiiii, establishStackSpace: establishStackSpace, getTempRet0: getTempRet0, runPostSets: runPostSets, setTempRet0: setTempRet0, setThrew: setThrew, stackAlloc: stackAlloc, stackRestore: stackRestore, stackSave: stackSave };
})
// EMSCRIPTEN_END_ASM
(Module.asmGlobalArg, Module.asmLibraryArg, buffer);

var __GLOBAL__sub_I_bind_cpp = Module["__GLOBAL__sub_I_bind_cpp"] = asm["__GLOBAL__sub_I_bind_cpp"];
var __GLOBAL__sub_I_stmpct_cpp = Module["__GLOBAL__sub_I_stmpct_cpp"] = asm["__GLOBAL__sub_I_stmpct_cpp"];
var ___errno_location = Module["___errno_location"] = asm["___errno_location"];
var ___getTypeName = Module["___getTypeName"] = asm["___getTypeName"];
var _free = Module["_free"] = asm["_free"];
var _malloc = Module["_malloc"] = asm["_malloc"];
var _memcpy = Module["_memcpy"] = asm["_memcpy"];
var _memmove = Module["_memmove"] = asm["_memmove"];
var _memset = Module["_memset"] = asm["_memset"];
var _sbrk = Module["_sbrk"] = asm["_sbrk"];
var establishStackSpace = Module["establishStackSpace"] = asm["establishStackSpace"];
var getTempRet0 = Module["getTempRet0"] = asm["getTempRet0"];
var runPostSets = Module["runPostSets"] = asm["runPostSets"];
var setTempRet0 = Module["setTempRet0"] = asm["setTempRet0"];
var setThrew = Module["setThrew"] = asm["setThrew"];
var stackAlloc = Module["stackAlloc"] = asm["stackAlloc"];
var stackRestore = Module["stackRestore"] = asm["stackRestore"];
var stackSave = Module["stackSave"] = asm["stackSave"];
var dynCall_did = Module["dynCall_did"] = asm["dynCall_did"];
var dynCall_didi = Module["dynCall_didi"] = asm["dynCall_didi"];
var dynCall_diid = Module["dynCall_diid"] = asm["dynCall_diid"];
var dynCall_ii = Module["dynCall_ii"] = asm["dynCall_ii"];
var dynCall_iid = Module["dynCall_iid"] = asm["dynCall_iid"];
var dynCall_iiii = Module["dynCall_iiii"] = asm["dynCall_iiii"];
var dynCall_v = Module["dynCall_v"] = asm["dynCall_v"];
var dynCall_vi = Module["dynCall_vi"] = asm["dynCall_vi"];
var dynCall_vid = Module["dynCall_vid"] = asm["dynCall_vid"];
var dynCall_viid = Module["dynCall_viid"] = asm["dynCall_viid"];
var dynCall_viiii = Module["dynCall_viiii"] = asm["dynCall_viiii"];
var dynCall_viiiii = Module["dynCall_viiiii"] = asm["dynCall_viiiii"];
var dynCall_viiiiii = Module["dynCall_viiiiii"] = asm["dynCall_viiiiii"];
;



// === Auto-generated postamble setup entry stuff ===

Module['asm'] = asm;




































































if (memoryInitializer) {
  if (!isDataURI(memoryInitializer)) {
    if (typeof Module['locateFile'] === 'function') {
      memoryInitializer = Module['locateFile'](memoryInitializer);
    } else if (Module['memoryInitializerPrefixURL']) {
      memoryInitializer = Module['memoryInitializerPrefixURL'] + memoryInitializer;
    }
  }
  if (ENVIRONMENT_IS_NODE || ENVIRONMENT_IS_SHELL) {
    var data = Module['readBinary'](memoryInitializer);
    HEAPU8.set(data, GLOBAL_BASE);
  } else {
    addRunDependency('memory initializer');
    var applyMemoryInitializer = function(data) {
      if (data.byteLength) data = new Uint8Array(data);
      HEAPU8.set(data, GLOBAL_BASE);
      // Delete the typed array that contains the large blob of the memory initializer request response so that
      // we won't keep unnecessary memory lying around. However, keep the XHR object itself alive so that e.g.
      // its .status field can still be accessed later.
      if (Module['memoryInitializerRequest']) delete Module['memoryInitializerRequest'].response;
      removeRunDependency('memory initializer');
    }
    function doBrowserLoad() {
      Module['readAsync'](memoryInitializer, applyMemoryInitializer, function() {
        throw 'could not load memory initializer ' + memoryInitializer;
      });
    }
    var memoryInitializerBytes = tryParseAsDataURI(memoryInitializer);
    if (memoryInitializerBytes) {
      applyMemoryInitializer(memoryInitializerBytes.buffer);
    } else
    if (Module['memoryInitializerRequest']) {
      // a network request has already been created, just use that
      function useRequest() {
        var request = Module['memoryInitializerRequest'];
        var response = request.response;
        if (request.status !== 200 && request.status !== 0) {
          var data = tryParseAsDataURI(Module['memoryInitializerRequestURL']);
          if (data) {
            response = data.buffer;
          } else {
            // If you see this warning, the issue may be that you are using locateFile or memoryInitializerPrefixURL, and defining them in JS. That
            // means that the HTML file doesn't know about them, and when it tries to create the mem init request early, does it to the wrong place.
            // Look in your browser's devtools network console to see what's going on.
            console.warn('a problem seems to have happened with Module.memoryInitializerRequest, status: ' + request.status + ', retrying ' + memoryInitializer);
            doBrowserLoad();
            return;
          }
        }
        applyMemoryInitializer(response);
      }
      if (Module['memoryInitializerRequest'].response) {
        setTimeout(useRequest, 0); // it's already here; but, apply it asynchronously
      } else {
        Module['memoryInitializerRequest'].addEventListener('load', useRequest); // wait for it
      }
    } else {
      // fetch it from the network ourselves
      doBrowserLoad();
    }
  }
}



/**
 * @constructor
 * @extends {Error}
 * @this {ExitStatus}
 */
function ExitStatus(status) {
  this.name = "ExitStatus";
  this.message = "Program terminated with exit(" + status + ")";
  this.status = status;
};
ExitStatus.prototype = new Error();
ExitStatus.prototype.constructor = ExitStatus;

var initialStackTop;
var calledMain = false;

dependenciesFulfilled = function runCaller() {
  // If run has never been called, and we should call run (INVOKE_RUN is true, and Module.noInitialRun is not false)
  if (!Module['calledRun']) run();
  if (!Module['calledRun']) dependenciesFulfilled = runCaller; // try this again later, after new deps are fulfilled
}





/** @type {function(Array=)} */
function run(args) {
  args = args || Module['arguments'];

  if (runDependencies > 0) {
    return;
  }


  preRun();

  if (runDependencies > 0) return; // a preRun added a dependency, run will be called later
  if (Module['calledRun']) return; // run may have just been called through dependencies being fulfilled just in this very frame

  function doRun() {
    if (Module['calledRun']) return; // run may have just been called while the async setStatus time below was happening
    Module['calledRun'] = true;

    if (ABORT) return;

    ensureInitRuntime();

    preMain();

    if (Module['onRuntimeInitialized']) Module['onRuntimeInitialized']();


    postRun();
  }

  if (Module['setStatus']) {
    Module['setStatus']('Running...');
    setTimeout(function() {
      setTimeout(function() {
        Module['setStatus']('');
      }, 1);
      doRun();
    }, 1);
  } else {
    doRun();
  }
}
Module['run'] = run;


function exit(status, implicit) {

  // if this is just main exit-ing implicitly, and the status is 0, then we
  // don't need to do anything here and can just leave. if the status is
  // non-zero, though, then we need to report it.
  // (we may have warned about this earlier, if a situation justifies doing so)
  if (implicit && Module['noExitRuntime'] && status === 0) {
    return;
  }

  if (Module['noExitRuntime']) {
  } else {

    ABORT = true;
    EXITSTATUS = status;
    STACKTOP = initialStackTop;

    exitRuntime();

    if (Module['onExit']) Module['onExit'](status);
  }

  if (ENVIRONMENT_IS_NODE) {
    process['exit'](status);
  }
  Module['quit'](status, new ExitStatus(status));
}
Module['exit'] = exit;

var abortDecorators = [];

function abort(what) {
  if (Module['onAbort']) {
    Module['onAbort'](what);
  }

  if (what !== undefined) {
    Module.print(what);
    Module.printErr(what);
    what = JSON.stringify(what)
  } else {
    what = '';
  }

  ABORT = true;
  EXITSTATUS = 1;

  throw 'abort(' + what + '). Build with -s ASSERTIONS=1 for more info.';
}
Module['abort'] = abort;

// {{PRE_RUN_ADDITIONS}}

if (Module['preInit']) {
  if (typeof Module['preInit'] == 'function') Module['preInit'] = [Module['preInit']];
  while (Module['preInit'].length > 0) {
    Module['preInit'].pop()();
  }
}


Module["noExitRuntime"] = true;

run();

// {{POST_RUN_ADDITIONS}}





// {{MODULE_ADDITIONS}}






