/**
 * @license r.js 2.3.6 Copyright jQuery Foundation and other contributors.
 * Released under MIT license, http://github.com/requirejs/r.js/LICENSE
 */

/*
 * This is a bootstrap script to allow running RequireJS in the command line
 * in either a Java/Rhino or Node environment. It is modified by the top-level
 * dist.js file to inject other files to completely enable this file. It is
 * the shell of the r.js file.
 */

/*jslint evil: true, nomen: true, sloppy: true */
/*global readFile: true, process: false, Packages: false, print: false,
console: false, java: false, module: false, requirejsVars, navigator,
document, importScripts, self, location, Components, FileUtils */

var requirejs, require, define, xpcUtil;
(function (console, args, readFileFunc) {
    var fileName, env, fs, vm, path, exec, rhinoContext, dir, nodeRequire,
        nodeDefine, exists, reqMain, loadedOptimizedLib, existsForNode, Cc, Ci,
        version = '2.3.6',
        jsSuffixRegExp = /\.js$/,
        commandOption = '',
        useLibLoaded = {},
        //Used by jslib/rhino/args.js
        rhinoArgs = args,
        //Used by jslib/xpconnect/args.js
        xpconnectArgs = args,
        readFile = typeof readFileFunc !== 'undefined' ? readFileFunc : null;

    function showHelp() {
        console.log('See https://github.com/requirejs/r.js for usage.');
    }

    if (typeof process !== 'undefined' && process.versions && !!process.versions.node) {
        env = 'node';

        //Get the fs module via Node's require before it
        //gets replaced. Used in require/node.js
        fs = require('fs');
        vm = require('vm');
        path = require('path');
        //In Node 0.7+ existsSync is on fs.
        existsForNode = fs.existsSync || path.existsSync;

        nodeRequire = require;
        nodeDefine = define;
        reqMain = require.main;

        //Temporarily hide require and define to allow require.js to define
        //them.
        require = undefined;
        define = undefined;

        readFile = function (path) {
            return fs.readFileSync(path, 'utf8');
        };

        exec = function (string, name) {
            return vm.runInThisContext(this.requirejsVars.require.makeNodeWrapper(string),
                                       name ? fs.realpathSync(name) : '');
        };

        exists = function (fileName) {
            return existsForNode(fileName);
        };


        fileName = process.argv[2];

        if (fileName && fileName.indexOf('-') === 0) {
            commandOption = fileName.substring(1);
            fileName = process.argv[3];
        }
    } else if (typeof Packages !== 'undefined') {
        env = 'rhino';

        fileName = args[0];

        if (fileName && fileName.indexOf('-') === 0) {
            commandOption = fileName.substring(1);
            fileName = args[1];
        }

        //Exec/readFile differs between Rhino and Nashorn. Rhino has an
        //importPackage where Nashorn does not, so branch on that. This is a
        //coarser check -- detecting readFile existence might also be enough for
        //this spot. However, sticking with importPackage to keep it the same
        //as other Rhino/Nashorn detection branches.
        if (typeof importPackage !== 'undefined') {
            rhinoContext = Packages.org.mozilla.javascript.ContextFactory.getGlobal().enterContext();

            exec = function (string, name) {
                return rhinoContext.evaluateString(this, string, name, 0, null);
            };
        } else {
            exec = function (string, name) {
                load({ script: string, name: name});
            };
            readFile = readFully;
        }

        exists = function (fileName) {
            return (new java.io.File(fileName)).exists();
        };

        //Define a console.log for easier logging. Don't
        //get fancy though.
        if (typeof console === 'undefined') {
            console = {
                log: function () {
                    print.apply(undefined, arguments);
                }
            };
        }
    } else if ((typeof navigator !== 'undefined' && typeof document !== 'undefined') ||
            (typeof importScripts !== 'undefined' && typeof self !== 'undefined')) {
        env = 'browser';

        readFile = function (path) {
            return fs.readFileSync(path, 'utf8');
        };

        exec = function (string) {
            return eval(string);
        };

        exists = function () {
            console.log('x.js exists not applicable in browser env');
            return false;
        };

    } else if (typeof Components !== 'undefined' && Components.classes && Components.interfaces) {
        env = 'xpconnect';

        Components.utils['import']('resource://gre/modules/FileUtils.jsm');
        Cc = Components.classes;
        Ci = Components.interfaces;

        fileName = args[0];

        if (fileName && fileName.indexOf('-') === 0) {
            commandOption = fileName.substring(1);
            fileName = args[1];
        }

        xpcUtil = {
            isWindows: ('@mozilla.org/windows-registry-key;1' in Cc),
            cwd: function () {
                return FileUtils.getFile("CurWorkD", []).path;
            },

            //Remove . and .. from paths, normalize on front slashes
            normalize: function (path) {
                //There has to be an easier way to do this.
                var i, part, ary,
                    firstChar = path.charAt(0);

                if (firstChar !== '/' &&
                        firstChar !== '\\' &&
                        path.indexOf(':') === -1) {
                    //A relative path. Use the current working directory.
                    path = xpcUtil.cwd() + '/' + path;
                }

                ary = path.replace(/\\/g, '/').split('/');

                for (i = 0; i < ary.length; i += 1) {
                    part = ary[i];
                    if (part === '.') {
                        ary.splice(i, 1);
                        i -= 1;
                    } else if (part === '..') {
                        ary.splice(i - 1, 2);
                        i -= 2;
                    }
                }
                return ary.join('/');
            },

            xpfile: function (path) {
                var fullPath;
                try {
                    fullPath = xpcUtil.normalize(path);
                    if (xpcUtil.isWindows) {
                        fullPath = fullPath.replace(/\//g, '\\');
                    }
                    return new FileUtils.File(fullPath);
                } catch (e) {
                    throw new Error((fullPath || path) + ' failed: ' + e);
                }
            },

            readFile: function (/*String*/path, /*String?*/encoding) {
                //A file read function that can deal with BOMs
                encoding = encoding || "utf-8";

                var inStream, convertStream,
                    readData = {},
                    fileObj = xpcUtil.xpfile(path);

                //XPCOM, you so crazy
                try {
                    inStream = Cc['@mozilla.org/network/file-input-stream;1']
                               .createInstance(Ci.nsIFileInputStream);
                    inStream.init(fileObj, 1, 0, false);

                    convertStream = Cc['@mozilla.org/intl/converter-input-stream;1']
                                    .createInstance(Ci.nsIConverterInputStream);
                    convertStream.init(inStream, encoding, inStream.available(),
                    Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);

                    convertStream.readString(inStream.available(), readData);
                    return readData.value;
                } catch (e) {
                    throw new Error((fileObj && fileObj.path || '') + ': ' + e);
                } finally {
                    if (convertStream) {
                        convertStream.close();
                    }
                    if (inStream) {
                        inStream.close();
                    }
                }
            }
        };

        readFile = xpcUtil.readFile;

        exec = function (string) {
            return eval(string);
        };

        exists = function (fileName) {
            return xpcUtil.xpfile(fileName).exists();
        };

        //Define a console.log for easier logging. Don't
        //get fancy though.
        if (typeof console === 'undefined') {
            console = {
                log: function () {
                    print.apply(undefined, arguments);
                }
            };
        }
    }

    /** vim: et:ts=4:sw=4:sts=4
 * @license RequireJS 2.3.6 Copyright jQuery Foundation and other contributors.
 * Released under MIT license, https://github.com/requirejs/requirejs/blob/master/LICENSE
 */
//Not using strict: uneven strict support in browsers, #392, and causes
//problems with requirejs.exec()/transpiler plugins that may not be strict.
/*jslint regexp: true, nomen: true, sloppy: true */
/*global window, navigator, document, importScripts, setTimeout, opera */


(function (global, setTimeout) {
    var req, s, head, baseElement, dataMain, src,
        interactiveScript, currentlyAddingScript, mainScript, subPath,
        version = '2.3.6',
        commentRegExp = /\/\*[\s\S]*?\*\/|([^:"'=]|^)\/\/.*$/mg,
        cjsRequireRegExp = /[^.]\s*require\s*\(\s*["']([^'"\s]+)["']\s*\)/g,
        jsSuffixRegExp = /\.js$/,
        currDirRegExp = /^\.\//,
        op = Object.prototype,
        ostring = op.toString,
        hasOwn = op.hasOwnProperty,
        isBrowser = !!(typeof window !== 'undefined' && typeof navigator !== 'undefined' && window.document),
        isWebWorker = !isBrowser && typeof importScripts !== 'undefined',
        //PS3 indicates loaded and complete, but need to wait for complete
        //specifically. Sequence is 'loading', 'loaded', execution,
        // then 'complete'. The UA check is unfortunate, but not sure how
        //to feature test w/o causing perf issues.
        readyRegExp = isBrowser && navigator.platform === 'PLAYSTATION 3' ?
                      /^complete$/ : /^(complete|loaded)$/,
        defContextName = '_',
        //Oh the tragedy, detecting opera. See the usage of isOpera for reason.
        isOpera = typeof opera !== 'undefined' && opera.toString() === '[object Opera]',
        contexts = {},
        cfg = {},
        globalDefQueue = [],
        useInteractive = false;

    //Could match something like ')//comment', do not lose the prefix to comment.
    function commentReplace(match, singlePrefix) {
        return singlePrefix || '';
    }

    function isFunction(it) {
        return ostring.call(it) === '[object Function]';
    }

    function isArray(it) {
        return ostring.call(it) === '[object Array]';
    }

    /**
     * Helper function for iterating over an array. If the func returns
     * a true value, it will break out of the loop.
     */
    function each(ary, func) {
        if (ary) {
            var i;
            for (i = 0; i < ary.length; i += 1) {
                if (ary[i] && func(ary[i], i, ary)) {
                    break;
                }
            }
        }
    }

    /**
     * Helper function for iterating over an array backwards. If the func
     * returns a true value, it will break out of the loop.
     */
    function eachReverse(ary, func) {
        if (ary) {
            var i;
            for (i = ary.length - 1; i > -1; i -= 1) {
                if (ary[i] && func(ary[i], i, ary)) {
                    break;
                }
            }
        }
    }

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    function getOwn(obj, prop) {
        return hasProp(obj, prop) && obj[prop];
    }

    /**
     * Cycles over properties in an object and calls a function for each
     * property value. If the function returns a truthy value, then the
     * iteration is stopped.
     */
    function eachProp(obj, func) {
        var prop;
        for (prop in obj) {
            if (hasProp(obj, prop)) {
                if (func(obj[prop], prop)) {
                    break;
                }
            }
        }
    }

    /**
     * Simple function to mix in properties from source into target,
     * but only if target does not already have a property of the same name.
     */
    function mixin(target, source, force, deepStringMixin) {
        if (source) {
            eachProp(source, function (value, prop) {
                if (force || !hasProp(target, prop)) {
                    if (deepStringMixin && typeof value === 'object' && value &&
                        !isArray(value) && !isFunction(value) &&
                        !(value instanceof RegExp)) {

                        if (!target[prop]) {
                            target[prop] = {};
                        }
                        mixin(target[prop], value, force, deepStringMixin);
                    } else {
                        target[prop] = value;
                    }
                }
            });
        }
        return target;
    }

    //Similar to Function.prototype.bind, but the 'this' object is specified
    //first, since it is easier to read/figure out what 'this' will be.
    function bind(obj, fn) {
        return function () {
            return fn.apply(obj, arguments);
        };
    }

    function scripts() {
        return document.getElementsByTagName('script');
    }

    function defaultOnError(err) {
        throw err;
    }

    //Allow getting a global that is expressed in
    //dot notation, like 'a.b.c'.
    function getGlobal(value) {
        if (!value) {
            return value;
        }
        var g = global;
        each(value.split('.'), function (part) {
            g = g[part];
        });
        return g;
    }

    /**
     * Constructs an error with a pointer to an URL with more information.
     * @param {String} id the error ID that maps to an ID on a web page.
     * @param {String} message human readable error.
     * @param {Error} [err] the original error, if there is one.
     *
     * @returns {Error}
     */
    function makeError(id, msg, err, requireModules) {
        var e = new Error(msg + '\nhttps://requirejs.org/docs/errors.html#' + id);
        e.requireType = id;
        e.requireModules = requireModules;
        if (err) {
            e.originalError = err;
        }
        return e;
    }

    if (typeof define !== 'undefined') {
        //If a define is already in play via another AMD loader,
        //do not overwrite.
        return;
    }

    if (typeof requirejs !== 'undefined') {
        if (isFunction(requirejs)) {
            //Do not overwrite an existing requirejs instance.
            return;
        }
        cfg = requirejs;
        requirejs = undefined;
    }

    //Allow for a require config object
    if (typeof require !== 'undefined' && !isFunction(require)) {
        //assume it is a config object.
        cfg = require;
        require = undefined;
    }

    function newContext(contextName) {
        var inCheckLoaded, Module, context, handlers,
            checkLoadedTimeoutId,
            config = {
                //Defaults. Do not set a default for map
                //config to speed up normalize(), which
                //will run faster if there is no default.
                waitSeconds: 7,
                baseUrl: './',
                paths: {},
                bundles: {},
                pkgs: {},
                shim: {},
                config: {}
            },
            registry = {},
            //registry of just enabled modules, to speed
            //cycle breaking code when lots of modules
            //are registered, but not activated.
            enabledRegistry = {},
            undefEvents = {},
            defQueue = [],
            defined = {},
            urlFetched = {},
            bundlesMap = {},
            requireCounter = 1,
            unnormalizedCounter = 1;

        /**
         * Trims the . and .. from an array of path segments.
         * It will keep a leading path segment if a .. will become
         * the first path segment, to help with module name lookups,
         * which act like paths, but can be remapped. But the end result,
         * all paths that use this function should look normalized.
         * NOTE: this method MODIFIES the input array.
         * @param {Array} ary the array of path segments.
         */
        function trimDots(ary) {
            var i, part;
            for (i = 0; i < ary.length; i++) {
                part = ary[i];
                if (part === '.') {
                    ary.splice(i, 1);
                    i -= 1;
                } else if (part === '..') {
                    // If at the start, or previous value is still ..,
                    // keep them so that when converted to a path it may
                    // still work when converted to a path, even though
                    // as an ID it is less than ideal. In larger point
                    // releases, may be better to just kick out an error.
                    if (i === 0 || (i === 1 && ary[2] === '..') || ary[i - 1] === '..') {
                        continue;
                    } else if (i > 0) {
                        ary.splice(i - 1, 2);
                        i -= 2;
                    }
                }
            }
        }

        /**
         * Given a relative module name, like ./something, normalize it to
         * a real name that can be mapped to a path.
         * @param {String} name the relative name
         * @param {String} baseName a real name that the name arg is relative
         * to.
         * @param {Boolean} applyMap apply the map config to the value. Should
         * only be done if this normalization is for a dependency ID.
         * @returns {String} normalized name
         */
        function normalize(name, baseName, applyMap) {
            var pkgMain, mapValue, nameParts, i, j, nameSegment, lastIndex,
                foundMap, foundI, foundStarMap, starI, normalizedBaseParts,
                baseParts = (baseName && baseName.split('/')),
                map = config.map,
                starMap = map && map['*'];

            //Adjust any relative paths.
            if (name) {
                name = name.split('/');
                lastIndex = name.length - 1;

                // If wanting node ID compatibility, strip .js from end
                // of IDs. Have to do this here, and not in nameToUrl
                // because node allows either .js or non .js to map
                // to same file.
                if (config.nodeIdCompat && jsSuffixRegExp.test(name[lastIndex])) {
                    name[lastIndex] = name[lastIndex].replace(jsSuffixRegExp, '');
                }

                // Starts with a '.' so need the baseName
                if (name[0].charAt(0) === '.' && baseParts) {
                    //Convert baseName to array, and lop off the last part,
                    //so that . matches that 'directory' and not name of the baseName's
                    //module. For instance, baseName of 'one/two/three', maps to
                    //'one/two/three.js', but we want the directory, 'one/two' for
                    //this normalization.
                    normalizedBaseParts = baseParts.slice(0, baseParts.length - 1);
                    name = normalizedBaseParts.concat(name);
                }

                trimDots(name);
                name = name.join('/');
            }

            //Apply map config if available.
            if (applyMap && map && (baseParts || starMap)) {
                nameParts = name.split('/');

                outerLoop: for (i = nameParts.length; i > 0; i -= 1) {
                    nameSegment = nameParts.slice(0, i).join('/');

                    if (baseParts) {
                        //Find the longest baseName segment match in the config.
                        //So, do joins on the biggest to smallest lengths of baseParts.
                        for (j = baseParts.length; j > 0; j -= 1) {
                            mapValue = getOwn(map, baseParts.slice(0, j).join('/'));

                            //baseName segment has config, find if it has one for
                            //this name.
                            if (mapValue) {
                                mapValue = getOwn(mapValue, nameSegment);
                                if (mapValue) {
                                    //Match, update name to the new value.
                                    foundMap = mapValue;
                                    foundI = i;
                                    break outerLoop;
                                }
                            }
                        }
                    }

                    //Check for a star map match, but just hold on to it,
                    //if there is a shorter segment match later in a matching
                    //config, then favor over this star map.
                    if (!foundStarMap && starMap && getOwn(starMap, nameSegment)) {
                        foundStarMap = getOwn(starMap, nameSegment);
                        starI = i;
                    }
                }

                if (!foundMap && foundStarMap) {
                    foundMap = foundStarMap;
                    foundI = starI;
                }

                if (foundMap) {
                    nameParts.splice(0, foundI, foundMap);
                    name = nameParts.join('/');
                }
            }

            // If the name points to a package's name, use
            // the package main instead.
            pkgMain = getOwn(config.pkgs, name);

            return pkgMain ? pkgMain : name;
        }

        function removeScript(name) {
            if (isBrowser) {
                each(scripts(), function (scriptNode) {
                    if (scriptNode.getAttribute('data-requiremodule') === name &&
                            scriptNode.getAttribute('data-requirecontext') === context.contextName) {
                        scriptNode.parentNode.removeChild(scriptNode);
                        return true;
                    }
                });
            }
        }

        function hasPathFallback(id) {
            var pathConfig = getOwn(config.paths, id);
            if (pathConfig && isArray(pathConfig) && pathConfig.length > 1) {
                //Pop off the first array value, since it failed, and
                //retry
                pathConfig.shift();
                context.require.undef(id);

                //Custom require that does not do map translation, since
                //ID is "absolute", already mapped/resolved.
                context.makeRequire(null, {
                    skipMap: true
                })([id]);

                return true;
            }
        }

        //Turns a plugin!resource to [plugin, resource]
        //with the plugin being undefined if the name
        //did not have a plugin prefix.
        function splitPrefix(name) {
            var prefix,
                index = name ? name.indexOf('!') : -1;
            if (index > -1) {
                prefix = name.substring(0, index);
                name = name.substring(index + 1, name.length);
            }
            return [prefix, name];
        }

        /**
         * Creates a module mapping that includes plugin prefix, module
         * name, and path. If parentModuleMap is provided it will
         * also normalize the name via require.normalize()
         *
         * @param {String} name the module name
         * @param {String} [parentModuleMap] parent module map
         * for the module name, used to resolve relative names.
         * @param {Boolean} isNormalized: is the ID already normalized.
         * This is true if this call is done for a define() module ID.
         * @param {Boolean} applyMap: apply the map config to the ID.
         * Should only be true if this map is for a dependency.
         *
         * @returns {Object}
         */
        function makeModuleMap(name, parentModuleMap, isNormalized, applyMap) {
            var url, pluginModule, suffix, nameParts,
                prefix = null,
                parentName = parentModuleMap ? parentModuleMap.name : null,
                originalName = name,
                isDefine = true,
                normalizedName = '';

            //If no name, then it means it is a require call, generate an
            //internal name.
            if (!name) {
                isDefine = false;
                name = '_@r' + (requireCounter += 1);
            }

            nameParts = splitPrefix(name);
            prefix = nameParts[0];
            name = nameParts[1];

            if (prefix) {
                prefix = normalize(prefix, parentName, applyMap);
                pluginModule = getOwn(defined, prefix);
            }

            //Account for relative paths if there is a base name.
            if (name) {
                if (prefix) {
                    if (isNormalized) {
                        normalizedName = name;
                    } else if (pluginModule && pluginModule.normalize) {
                        //Plugin is loaded, use its normalize method.
                        normalizedName = pluginModule.normalize(name, function (name) {
                            return normalize(name, parentName, applyMap);
                        });
                    } else {
                        // If nested plugin references, then do not try to
                        // normalize, as it will not normalize correctly. This
                        // places a restriction on resourceIds, and the longer
                        // term solution is not to normalize until plugins are
                        // loaded and all normalizations to allow for async
                        // loading of a loader plugin. But for now, fixes the
                        // common uses. Details in #1131
                        normalizedName = name.indexOf('!') === -1 ?
                                         normalize(name, parentName, applyMap) :
                                         name;
                    }
                } else {
                    //A regular module.
                    normalizedName = normalize(name, parentName, applyMap);

                    //Normalized name may be a plugin ID due to map config
                    //application in normalize. The map config values must
                    //already be normalized, so do not need to redo that part.
                    nameParts = splitPrefix(normalizedName);
                    prefix = nameParts[0];
                    normalizedName = nameParts[1];
                    isNormalized = true;

                    url = context.nameToUrl(normalizedName);
                }
            }

            //If the id is a plugin id that cannot be determined if it needs
            //normalization, stamp it with a unique ID so two matching relative
            //ids that may conflict can be separate.
            suffix = prefix && !pluginModule && !isNormalized ?
                     '_unnormalized' + (unnormalizedCounter += 1) :
                     '';

            return {
                prefix: prefix,
                name: normalizedName,
                parentMap: parentModuleMap,
                unnormalized: !!suffix,
                url: url,
                originalName: originalName,
                isDefine: isDefine,
                id: (prefix ?
                        prefix + '!' + normalizedName :
                        normalizedName) + suffix
            };
        }

        function getModule(depMap) {
            var id = depMap.id,
                mod = getOwn(registry, id);

            if (!mod) {
                mod = registry[id] = new context.Module(depMap);
            }

            return mod;
        }

        function on(depMap, name, fn) {
            var id = depMap.id,
                mod = getOwn(registry, id);

            if (hasProp(defined, id) &&
                    (!mod || mod.defineEmitComplete)) {
                if (name === 'defined') {
                    fn(defined[id]);
                }
            } else {
                mod = getModule(depMap);
                if (mod.error && name === 'error') {
                    fn(mod.error);
                } else {
                    mod.on(name, fn);
                }
            }
        }

        function onError(err, errback) {
            var ids = err.requireModules,
                notified = false;

            if (errback) {
                errback(err);
            } else {
                each(ids, function (id) {
                    var mod = getOwn(registry, id);
                    if (mod) {
                        //Set error on module, so it skips timeout checks.
                        mod.error = err;
                        if (mod.events.error) {
                            notified = true;
                            mod.emit('error', err);
                        }
                    }
                });

                if (!notified) {
                    req.onError(err);
                }
            }
        }

        /**
         * Internal method to transfer globalQueue items to this context's
         * defQueue.
         */
        function takeGlobalQueue() {
            //Push all the globalDefQueue items into the context's defQueue
            if (globalDefQueue.length) {
                each(globalDefQueue, function(queueItem) {
                    var id = queueItem[0];
                    if (typeof id === 'string') {
                        context.defQueueMap[id] = true;
                    }
                    defQueue.push(queueItem);
                });
                globalDefQueue = [];
            }
        }

        handlers = {
            'require': function (mod) {
                if (mod.require) {
                    return mod.require;
                } else {
                    return (mod.require = context.makeRequire(mod.map));
                }
            },
            'exports': function (mod) {
                mod.usingExports = true;
                if (mod.map.isDefine) {
                    if (mod.exports) {
                        return (defined[mod.map.id] = mod.exports);
                    } else {
                        return (mod.exports = defined[mod.map.id] = {});
                    }
                }
            },
            'module': function (mod) {
                if (mod.module) {
                    return mod.module;
                } else {
                    return (mod.module = {
                        id: mod.map.id,
                        uri: mod.map.url,
                        config: function () {
                            return getOwn(config.config, mod.map.id) || {};
                        },
                        exports: mod.exports || (mod.exports = {})
                    });
                }
            }
        };

        function cleanRegistry(id) {
            //Clean up machinery used for waiting modules.
            delete registry[id];
            delete enabledRegistry[id];
        }

        function breakCycle(mod, traced, processed) {
            var id = mod.map.id;

            if (mod.error) {
                mod.emit('error', mod.error);
            } else {
                traced[id] = true;
                each(mod.depMaps, function (depMap, i) {
                    var depId = depMap.id,
                        dep = getOwn(registry, depId);

                    //Only force things that have not completed
                    //being defined, so still in the registry,
                    //and only if it has not been matched up
                    //in the module already.
                    if (dep && !mod.depMatched[i] && !processed[depId]) {
                        if (getOwn(traced, depId)) {
                            mod.defineDep(i, defined[depId]);
                            mod.check(); //pass false?
                        } else {
                            breakCycle(dep, traced, processed);
                        }
                    }
                });
                processed[id] = true;
            }
        }

        function checkLoaded() {
            var err, usingPathFallback,
                waitInterval = config.waitSeconds * 1000,
                //It is possible to disable the wait interval by using waitSeconds of 0.
                expired = waitInterval && (context.startTime + waitInterval) < new Date().getTime(),
                noLoads = [],
                reqCalls = [],
                stillLoading = false,
                needCycleCheck = true;

            //Do not bother if this call was a result of a cycle break.
            if (inCheckLoaded) {
                return;
            }

            inCheckLoaded = true;

            //Figure out the state of all the modules.
            eachProp(enabledRegistry, function (mod) {
                var map = mod.map,
                    modId = map.id;

                //Skip things that are not enabled or in error state.
                if (!mod.enabled) {
                    return;
                }

                if (!map.isDefine) {
                    reqCalls.push(mod);
                }

                if (!mod.error) {
                    //If the module should be executed, and it has not
                    //been inited and time is up, remember it.
                    if (!mod.inited && expired) {
                        if (hasPathFallback(modId)) {
                            usingPathFallback = true;
                            stillLoading = true;
                        } else {
                            noLoads.push(modId);
                            removeScript(modId);
                        }
                    } else if (!mod.inited && mod.fetched && map.isDefine) {
                        stillLoading = true;
                        if (!map.prefix) {
                            //No reason to keep looking for unfinished
                            //loading. If the only stillLoading is a
                            //plugin resource though, keep going,
                            //because it may be that a plugin resource
                            //is waiting on a non-plugin cycle.
                            return (needCycleCheck = false);
                        }
                    }
                }
            });

            if (expired && noLoads.length) {
                //If wait time expired, throw error of unloaded modules.
                err = makeError('timeout', 'Load timeout for modules: ' + noLoads, null, noLoads);
                err.contextName = context.contextName;
                return onError(err);
            }

            //Not expired, check for a cycle.
            if (needCycleCheck) {
                each(reqCalls, function (mod) {
                    breakCycle(mod, {}, {});
                });
            }

            //If still waiting on loads, and the waiting load is something
            //other than a plugin resource, or there are still outstanding
            //scripts, then just try back later.
            if ((!expired || usingPathFallback) && stillLoading) {
                //Something is still waiting to load. Wait for it, but only
                //if a timeout is not already in effect.
                if ((isBrowser || isWebWorker) && !checkLoadedTimeoutId) {
                    checkLoadedTimeoutId = setTimeout(function () {
                        checkLoadedTimeoutId = 0;
                        checkLoaded();
                    }, 50);
                }
            }

            inCheckLoaded = false;
        }

        Module = function (map) {
            this.events = getOwn(undefEvents, map.id) || {};
            this.map = map;
            this.shim = getOwn(config.shim, map.id);
            this.depExports = [];
            this.depMaps = [];
            this.depMatched = [];
            this.pluginMaps = {};
            this.depCount = 0;

            /* this.exports this.factory
               this.depMaps = [],
               this.enabled, this.fetched
            */
        };

        Module.prototype = {
            init: function (depMaps, factory, errback, options) {
                options = options || {};

                //Do not do more inits if already done. Can happen if there
                //are multiple define calls for the same module. That is not
                //a normal, common case, but it is also not unexpected.
                if (this.inited) {
                    return;
                }

                this.factory = factory;

                if (errback) {
                    //Register for errors on this module.
                    this.on('error', errback);
                } else if (this.events.error) {
                    //If no errback already, but there are error listeners
                    //on this module, set up an errback to pass to the deps.
                    errback = bind(this, function (err) {
                        this.emit('error', err);
                    });
                }

                //Do a copy of the dependency array, so that
                //source inputs are not modified. For example
                //"shim" deps are passed in here directly, and
                //doing a direct modification of the depMaps array
                //would affect that config.
                this.depMaps = depMaps && depMaps.slice(0);

                this.errback = errback;

                //Indicate this module has be initialized
                this.inited = true;

                this.ignore = options.ignore;

                //Could have option to init this module in enabled mode,
                //or could have been previously marked as enabled. However,
                //the dependencies are not known until init is called. So
                //if enabled previously, now trigger dependencies as enabled.
                if (options.enabled || this.enabled) {
                    //Enable this module and dependencies.
                    //Will call this.check()
                    this.enable();
                } else {
                    this.check();
                }
            },

            defineDep: function (i, depExports) {
                //Because of cycles, defined callback for a given
                //export can be called more than once.
                if (!this.depMatched[i]) {
                    this.depMatched[i] = true;
                    this.depCount -= 1;
                    this.depExports[i] = depExports;
                }
            },

            fetch: function () {
                if (this.fetched) {
                    return;
                }
                this.fetched = true;

                context.startTime = (new Date()).getTime();

                var map = this.map;

                //If the manager is for a plugin managed resource,
                //ask the plugin to load it now.
                if (this.shim) {
                    context.makeRequire(this.map, {
                        enableBuildCallback: true
                    })(this.shim.deps || [], bind(this, function () {
                        return map.prefix ? this.callPlugin() : this.load();
                    }));
                } else {
                    //Regular dependency.
                    return map.prefix ? this.callPlugin() : this.load();
                }
            },

            load: function () {
                var url = this.map.url;

                //Regular dependency.
                if (!urlFetched[url]) {
                    urlFetched[url] = true;
                    context.load(this.map.id, url);
                }
            },

            /**
             * Checks if the module is ready to define itself, and if so,
             * define it.
             */
            check: function () {
                if (!this.enabled || this.enabling) {
                    return;
                }

                var err, cjsModule,
                    id = this.map.id,
                    depExports = this.depExports,
                    exports = this.exports,
                    factory = this.factory;

                if (!this.inited) {
                    // Only fetch if not already in the defQueue.
                    if (!hasProp(context.defQueueMap, id)) {
                        this.fetch();
                    }
                } else if (this.error) {
                    this.emit('error', this.error);
                } else if (!this.defining) {
                    //The factory could trigger another require call
                    //that would result in checking this module to
                    //define itself again. If already in the process
                    //of doing that, skip this work.
                    this.defining = true;

                    if (this.depCount < 1 && !this.defined) {
                        if (isFunction(factory)) {
                            //If there is an error listener, favor passing
                            //to that instead of throwing an error. However,
                            //only do it for define()'d  modules. require
                            //errbacks should not be called for failures in
                            //their callbacks (#699). However if a global
                            //onError is set, use that.
                            if ((this.events.error && this.map.isDefine) ||
                                req.onError !== defaultOnError) {
                                try {
                                    exports = context.execCb(id, factory, depExports, exports);
                                } catch (e) {
                                    err = e;
                                }
                            } else {
                                exports = context.execCb(id, factory, depExports, exports);
                            }

                            // Favor return value over exports. If node/cjs in play,
                            // then will not have a return value anyway. Favor
                            // module.exports assignment over exports object.
                            if (this.map.isDefine && exports === undefined) {
                                cjsModule = this.module;
                                if (cjsModule) {
                                    exports = cjsModule.exports;
                                } else if (this.usingExports) {
                                    //exports already set the defined value.
                                    exports = this.exports;
                                }
                            }

                            if (err) {
                                err.requireMap = this.map;
                                err.requireModules = this.map.isDefine ? [this.map.id] : null;
                                err.requireType = this.map.isDefine ? 'define' : 'require';
                                return onError((this.error = err));
                            }

                        } else {
                            //Just a literal value
                            exports = factory;
                        }

                        this.exports = exports;

                        if (this.map.isDefine && !this.ignore) {
                            defined[id] = exports;

                            if (req.onResourceLoad) {
                                var resLoadMaps = [];
                                each(this.depMaps, function (depMap) {
                                    resLoadMaps.push(depMap.normalizedMap || depMap);
                                });
                                req.onResourceLoad(context, this.map, resLoadMaps);
                            }
                        }

                        //Clean up
                        cleanRegistry(id);

                        this.defined = true;
                    }

                    //Finished the define stage. Allow calling check again
                    //to allow define notifications below in the case of a
                    //cycle.
                    this.defining = false;

                    if (this.defined && !this.defineEmitted) {
                        this.defineEmitted = true;
                        this.emit('defined', this.exports);
                        this.defineEmitComplete = true;
                    }

                }
            },

            callPlugin: function () {
                var map = this.map,
                    id = map.id,
                    //Map already normalized the prefix.
                    pluginMap = makeModuleMap(map.prefix);

                //Mark this as a dependency for this plugin, so it
                //can be traced for cycles.
                this.depMaps.push(pluginMap);

                on(pluginMap, 'defined', bind(this, function (plugin) {
                    var load, normalizedMap, normalizedMod,
                        bundleId = getOwn(bundlesMap, this.map.id),
                        name = this.map.name,
                        parentName = this.map.parentMap ? this.map.parentMap.name : null,
                        localRequire = context.makeRequire(map.parentMap, {
                            enableBuildCallback: true
                        });

                    //If current map is not normalized, wait for that
                    //normalized name to load instead of continuing.
                    if (this.map.unnormalized) {
                        //Normalize the ID if the plugin allows it.
                        if (plugin.normalize) {
                            name = plugin.normalize(name, function (name) {
                                return normalize(name, parentName, true);
                            }) || '';
                        }

                        //prefix and name should already be normalized, no need
                        //for applying map config again either.
                        normalizedMap = makeModuleMap(map.prefix + '!' + name,
                                                      this.map.parentMap,
                                                      true);
                        on(normalizedMap,
                            'defined', bind(this, function (value) {
                                this.map.normalizedMap = normalizedMap;
                                this.init([], function () { return value; }, null, {
                                    enabled: true,
                                    ignore: true
                                });
                            }));

                        normalizedMod = getOwn(registry, normalizedMap.id);
                        if (normalizedMod) {
                            //Mark this as a dependency for this plugin, so it
                            //can be traced for cycles.
                            this.depMaps.push(normalizedMap);

                            if (this.events.error) {
                                normalizedMod.on('error', bind(this, function (err) {
                                    this.emit('error', err);
                                }));
                            }
                            normalizedMod.enable();
                        }

                        return;
                    }

                    //If a paths config, then just load that file instead to
                    //resolve the plugin, as it is built into that paths layer.
                    if (bundleId) {
                        this.map.url = context.nameToUrl(bundleId);
                        this.load();
                        return;
                    }

                    load = bind(this, function (value) {
                        this.init([], function () { return value; }, null, {
                            enabled: true
                        });
                    });

                    load.error = bind(this, function (err) {
                        this.inited = true;
                        this.error = err;
                        err.requireModules = [id];

                        //Remove temp unnormalized modules for this module,
                        //since they will never be resolved otherwise now.
                        eachProp(registry, function (mod) {
                            if (mod.map.id.indexOf(id + '_unnormalized') === 0) {
                                cleanRegistry(mod.map.id);
                            }
                        });

                        onError(err);
                    });

                    //Allow plugins to load other code without having to know the
                    //context or how to 'complete' the load.
                    load.fromText = bind(this, function (text, textAlt) {
                        /*jslint evil: true */
                        var moduleName = map.name,
                            moduleMap = makeModuleMap(moduleName),
                            hasInteractive = useInteractive;

                        //As of 2.1.0, support just passing the text, to reinforce
                        //fromText only being called once per resource. Still
                        //support old style of passing moduleName but discard
                        //that moduleName in favor of the internal ref.
                        if (textAlt) {
                            text = textAlt;
                        }

                        //Turn off interactive script matching for IE for any define
                        //calls in the text, then turn it back on at the end.
                        if (hasInteractive) {
                            useInteractive = false;
                        }

                        //Prime the system by creating a module instance for
                        //it.
                        getModule(moduleMap);

                        //Transfer any config to this other module.
                        if (hasProp(config.config, id)) {
                            config.config[moduleName] = config.config[id];
                        }

                        try {
                            req.exec(text);
                        } catch (e) {
                            return onError(makeError('fromtexteval',
                                             'fromText eval for ' + id +
                                            ' failed: ' + e,
                                             e,
                                             [id]));
                        }

                        if (hasInteractive) {
                            useInteractive = true;
                        }

                        //Mark this as a dependency for the plugin
                        //resource
                        this.depMaps.push(moduleMap);

                        //Support anonymous modules.
                        context.completeLoad(moduleName);

                        //Bind the value of that module to the value for this
                        //resource ID.
                        localRequire([moduleName], load);
                    });

                    //Use parentName here since the plugin's name is not reliable,
                    //could be some weird string with no path that actually wants to
                    //reference the parentName's path.
                    plugin.load(map.name, localRequire, load, config);
                }));

                context.enable(pluginMap, this);
                this.pluginMaps[pluginMap.id] = pluginMap;
            },

            enable: function () {
                enabledRegistry[this.map.id] = this;
                this.enabled = true;

                //Set flag mentioning that the module is enabling,
                //so that immediate calls to the defined callbacks
                //for dependencies do not trigger inadvertent load
                //with the depCount still being zero.
                this.enabling = true;

                //Enable each dependency
                each(this.depMaps, bind(this, function (depMap, i) {
                    var id, mod, handler;

                    if (typeof depMap === 'string') {
                        //Dependency needs to be converted to a depMap
                        //and wired up to this module.
                        depMap = makeModuleMap(depMap,
                                               (this.map.isDefine ? this.map : this.map.parentMap),
                                               false,
                                               !this.skipMap);
                        this.depMaps[i] = depMap;

                        handler = getOwn(handlers, depMap.id);

                        if (handler) {
                            this.depExports[i] = handler(this);
                            return;
                        }

                        this.depCount += 1;

                        on(depMap, 'defined', bind(this, function (depExports) {
                            if (this.undefed) {
                                return;
                            }
                            this.defineDep(i, depExports);
                            this.check();
                        }));

                        if (this.errback) {
                            on(depMap, 'error', bind(this, this.errback));
                        } else if (this.events.error) {
                            // No direct errback on this module, but something
                            // else is listening for errors, so be sure to
                            // propagate the error correctly.
                            on(depMap, 'error', bind(this, function(err) {
                                this.emit('error', err);
                            }));
                        }
                    }

                    id = depMap.id;
                    mod = registry[id];

                    //Skip special modules like 'require', 'exports', 'module'
                    //Also, don't call enable if it is already enabled,
                    //important in circular dependency cases.
                    if (!hasProp(handlers, id) && mod && !mod.enabled) {
                        context.enable(depMap, this);
                    }
                }));

                //Enable each plugin that is used in
                //a dependency
                eachProp(this.pluginMaps, bind(this, function (pluginMap) {
                    var mod = getOwn(registry, pluginMap.id);
                    if (mod && !mod.enabled) {
                        context.enable(pluginMap, this);
                    }
                }));

                this.enabling = false;

                this.check();
            },

            on: function (name, cb) {
                var cbs = this.events[name];
                if (!cbs) {
                    cbs = this.events[name] = [];
                }
                cbs.push(cb);
            },

            emit: function (name, evt) {
                each(this.events[name], function (cb) {
                    cb(evt);
                });
                if (name === 'error') {
                    //Now that the error handler was triggered, remove
                    //the listeners, since this broken Module instance
                    //can stay around for a while in the registry.
                    delete this.events[name];
                }
            }
        };

        function callGetModule(args) {
            //Skip modules already defined.
            if (!hasProp(defined, args[0])) {
                getModule(makeModuleMap(args[0], null, true)).init(args[1], args[2]);
            }
        }

        function removeListener(node, func, name, ieName) {
            //Favor detachEvent because of IE9
            //issue, see attachEvent/addEventListener comment elsewhere
            //in this file.
            if (node.detachEvent && !isOpera) {
                //Probably IE. If not it will throw an error, which will be
                //useful to know.
                if (ieName) {
                    node.detachEvent(ieName, func);
                }
            } else {
                node.removeEventListener(name, func, false);
            }
        }

        /**
         * Given an event from a script node, get the requirejs info from it,
         * and then removes the event listeners on the node.
         * @param {Event} evt
         * @returns {Object}
         */
        function getScriptData(evt) {
            //Using currentTarget instead of target for Firefox 2.0's sake. Not
            //all old browsers will be supported, but this one was easy enough
            //to support and still makes sense.
            var node = evt.currentTarget || evt.srcElement;

            //Remove the listeners once here.
            removeListener(node, context.onScriptLoad, 'load', 'onreadystatechange');
            removeListener(node, context.onScriptError, 'error');

            return {
                node: node,
                id: node && node.getAttribute('data-requiremodule')
            };
        }

        function intakeDefines() {
            var args;

            //Any defined modules in the global queue, intake them now.
            takeGlobalQueue();

            //Make sure any remaining defQueue items get properly processed.
            while (defQueue.length) {
                args = defQueue.shift();
                if (args[0] === null) {
                    return onError(makeError('mismatch', 'Mismatched anonymous define() module: ' +
                        args[args.length - 1]));
                } else {
                    //args are id, deps, factory. Should be normalized by the
                    //define() function.
                    callGetModule(args);
                }
            }
            context.defQueueMap = {};
        }

        context = {
            config: config,
            contextName: contextName,
            registry: registry,
            defined: defined,
            urlFetched: urlFetched,
            defQueue: defQueue,
            defQueueMap: {},
            Module: Module,
            makeModuleMap: makeModuleMap,
            nextTick: req.nextTick,
            onError: onError,

            /**
             * Set a configuration for the context.
             * @param {Object} cfg config object to integrate.
             */
            configure: function (cfg) {
                //Make sure the baseUrl ends in a slash.
                if (cfg.baseUrl) {
                    if (cfg.baseUrl.charAt(cfg.baseUrl.length - 1) !== '/') {
                        cfg.baseUrl += '/';
                    }
                }

                // Convert old style urlArgs string to a function.
                if (typeof cfg.urlArgs === 'string') {
                    var urlArgs = cfg.urlArgs;
                    cfg.urlArgs = function(id, url) {
                        return (url.indexOf('?') === -1 ? '?' : '&') + urlArgs;
                    };
                }

                //Save off the paths since they require special processing,
                //they are additive.
                var shim = config.shim,
                    objs = {
                        paths: true,
                        bundles: true,
                        config: true,
                        map: true
                    };

                eachProp(cfg, function (value, prop) {
                    if (objs[prop]) {
                        if (!config[prop]) {
                            config[prop] = {};
                        }
                        mixin(config[prop], value, true, true);
                    } else {
                        config[prop] = value;
                    }
                });

                //Reverse map the bundles
                if (cfg.bundles) {
                    eachProp(cfg.bundles, function (value, prop) {
                        each(value, function (v) {
                            if (v !== prop) {
                                bundlesMap[v] = prop;
                            }
                        });
                    });
                }

                //Merge shim
                if (cfg.shim) {
                    eachProp(cfg.shim, function (value, id) {
                        //Normalize the structure
                        if (isArray(value)) {
                            value = {
                                deps: value
                            };
                        }
                        if ((value.exports || value.init) && !value.exportsFn) {
                            value.exportsFn = context.makeShimExports(value);
                        }
                        shim[id] = value;
                    });
                    config.shim = shim;
                }

                //Adjust packages if necessary.
                if (cfg.packages) {
                    each(cfg.packages, function (pkgObj) {
                        var location, name;

                        pkgObj = typeof pkgObj === 'string' ? {name: pkgObj} : pkgObj;

                        name = pkgObj.name;
                        location = pkgObj.location;
                        if (location) {
                            config.paths[name] = pkgObj.location;
                        }

                        //Save pointer to main module ID for pkg name.
                        //Remove leading dot in main, so main paths are normalized,
                        //and remove any trailing .js, since different package
                        //envs have different conventions: some use a module name,
                        //some use a file name.
                        config.pkgs[name] = pkgObj.name + '/' + (pkgObj.main || 'main')
                                     .replace(currDirRegExp, '')
                                     .replace(jsSuffixRegExp, '');
                    });
                }

                //If there are any "waiting to execute" modules in the registry,
                //update the maps for them, since their info, like URLs to load,
                //may have changed.
                eachProp(registry, function (mod, id) {
                    //If module already has init called, since it is too
                    //late to modify them, and ignore unnormalized ones
                    //since they are transient.
                    if (!mod.inited && !mod.map.unnormalized) {
                        mod.map = makeModuleMap(id, null, true);
                    }
                });

                //If a deps array or a config callback is specified, then call
                //require with those args. This is useful when require is defined as a
                //config object before require.js is loaded.
                if (cfg.deps || cfg.callback) {
                    context.require(cfg.deps || [], cfg.callback);
                }
            },

            makeShimExports: function (value) {
                function fn() {
                    var ret;
                    if (value.init) {
                        ret = value.init.apply(global, arguments);
                    }
                    return ret || (value.exports && getGlobal(value.exports));
                }
                return fn;
            },

            makeRequire: function (relMap, options) {
                options = options || {};

                function localRequire(deps, callback, errback) {
                    var id, map, requireMod;

                    if (options.enableBuildCallback && callback && isFunction(callback)) {
                        callback.__requireJsBuild = true;
                    }

                    if (typeof deps === 'string') {
                        if (isFunction(callback)) {
                            //Invalid call
                            return onError(makeError('requireargs', 'Invalid require call'), errback);
                        }

                        //If require|exports|module are requested, get the
                        //value for them from the special handlers. Caveat:
                        //this only works while module is being defined.
                        if (relMap && hasProp(handlers, deps)) {
                            return handlers[deps](registry[relMap.id]);
                        }

                        //Synchronous access to one module. If require.get is
                        //available (as in the Node adapter), prefer that.
                        if (req.get) {
                            return req.get(context, deps, relMap, localRequire);
                        }

                        //Normalize module name, if it contains . or ..
                        map = makeModuleMap(deps, relMap, false, true);
                        id = map.id;

                        if (!hasProp(defined, id)) {
                            return onError(makeError('notloaded', 'Module name "' +
                                        id +
                                        '" has not been loaded yet for context: ' +
                                        contextName +
                                        (relMap ? '' : '. Use require([])')));
                        }
                        return defined[id];
                    }

                    //Grab defines waiting in the global queue.
                    intakeDefines();

                    //Mark all the dependencies as needing to be loaded.
                    context.nextTick(function () {
                        //Some defines could have been added since the
                        //require call, collect them.
                        intakeDefines();

                        requireMod = getModule(makeModuleMap(null, relMap));

                        //Store if map config should be applied to this require
                        //call for dependencies.
                        requireMod.skipMap = options.skipMap;

                        requireMod.init(deps, callback, errback, {
                            enabled: true
                        });

                        checkLoaded();
                    });

                    return localRequire;
                }

                mixin(localRequire, {
                    isBrowser: isBrowser,

                    /**
                     * Converts a module name + .extension into an URL path.
                     * *Requires* the use of a module name. It does not support using
                     * plain URLs like nameToUrl.
                     */
                    toUrl: function (moduleNamePlusExt) {
                        var ext,
                            index = moduleNamePlusExt.lastIndexOf('.'),
                            segment = moduleNamePlusExt.split('/')[0],
                            isRelative = segment === '.' || segment === '..';

                        //Have a file extension alias, and it is not the
                        //dots from a relative path.
                        if (index !== -1 && (!isRelative || index > 1)) {
                            ext = moduleNamePlusExt.substring(index, moduleNamePlusExt.length);
                            moduleNamePlusExt = moduleNamePlusExt.substring(0, index);
                        }

                        return context.nameToUrl(normalize(moduleNamePlusExt,
                                                relMap && relMap.id, true), ext,  true);
                    },

                    defined: function (id) {
                        return hasProp(defined, makeModuleMap(id, relMap, false, true).id);
                    },

                    specified: function (id) {
                        id = makeModuleMap(id, relMap, false, true).id;
                        return hasProp(defined, id) || hasProp(registry, id);
                    }
                });

                //Only allow undef on top level require calls
                if (!relMap) {
                    localRequire.undef = function (id) {
                        //Bind any waiting define() calls to this context,
                        //fix for #408
                        takeGlobalQueue();

                        var map = makeModuleMap(id, relMap, true),
                            mod = getOwn(registry, id);

                        mod.undefed = true;
                        removeScript(id);

                        delete defined[id];
                        delete urlFetched[map.url];
                        delete undefEvents[id];

                        //Clean queued defines too. Go backwards
                        //in array so that the splices do not
                        //mess up the iteration.
                        eachReverse(defQueue, function(args, i) {
                            if (args[0] === id) {
                                defQueue.splice(i, 1);
                            }
                        });
                        delete context.defQueueMap[id];

                        if (mod) {
                            //Hold on to listeners in case the
                            //module will be attempted to be reloaded
                            //using a different config.
                            if (mod.events.defined) {
                                undefEvents[id] = mod.events;
                            }

                            cleanRegistry(id);
                        }
                    };
                }

                return localRequire;
            },

            /**
             * Called to enable a module if it is still in the registry
             * awaiting enablement. A second arg, parent, the parent module,
             * is passed in for context, when this method is overridden by
             * the optimizer. Not shown here to keep code compact.
             */
            enable: function (depMap) {
                var mod = getOwn(registry, depMap.id);
                if (mod) {
                    getModule(depMap).enable();
                }
            },

            /**
             * Internal method used by environment adapters to complete a load event.
             * A load event could be a script load or just a load pass from a synchronous
             * load call.
             * @param {String} moduleName the name of the module to potentially complete.
             */
            completeLoad: function (moduleName) {
                var found, args, mod,
                    shim = getOwn(config.shim, moduleName) || {},
                    shExports = shim.exports;

                takeGlobalQueue();

                while (defQueue.length) {
                    args = defQueue.shift();
                    if (args[0] === null) {
                        args[0] = moduleName;
                        //If already found an anonymous module and bound it
                        //to this name, then this is some other anon module
                        //waiting for its completeLoad to fire.
                        if (found) {
                            break;
                        }
                        found = true;
                    } else if (args[0] === moduleName) {
                        //Found matching define call for this script!
                        found = true;
                    }

                    callGetModule(args);
                }
                context.defQueueMap = {};

                //Do this after the cycle of callGetModule in case the result
                //of those calls/init calls changes the registry.
                mod = getOwn(registry, moduleName);

                if (!found && !hasProp(defined, moduleName) && mod && !mod.inited) {
                    if (config.enforceDefine && (!shExports || !getGlobal(shExports))) {
                        if (hasPathFallback(moduleName)) {
                            return;
                        } else {
                            return onError(makeError('nodefine',
                                             'No define call for ' + moduleName,
                                             null,
                                             [moduleName]));
                        }
                    } else {
                        //A script that does not call define(), so just simulate
                        //the call for it.
                        callGetModule([moduleName, (shim.deps || []), shim.exportsFn]);
                    }
                }

                checkLoaded();
            },

            /**
             * Converts a module name to a file path. Supports cases where
             * moduleName may actually be just an URL.
             * Note that it **does not** call normalize on the moduleName,
             * it is assumed to have already been normalized. This is an
             * internal API, not a public one. Use toUrl for the public API.
             */
            nameToUrl: function (moduleName, ext, skipExt) {
                var paths, syms, i, parentModule, url,
                    parentPath, bundleId,
                    pkgMain = getOwn(config.pkgs, moduleName);

                if (pkgMain) {
                    moduleName = pkgMain;
                }

                bundleId = getOwn(bundlesMap, moduleName);

                if (bundleId) {
                    return context.nameToUrl(bundleId, ext, skipExt);
                }

                //If a colon is in the URL, it indicates a protocol is used and it is just
                //an URL to a file, or if it starts with a slash, contains a query arg (i.e. ?)
                //or ends with .js, then assume the user meant to use an url and not a module id.
                //The slash is important for protocol-less URLs as well as full paths.
                if (req.jsExtRegExp.test(moduleName)) {
                    //Just a plain path, not module name lookup, so just return it.
                    //Add extension if it is included. This is a bit wonky, only non-.js things pass
                    //an extension, this method probably needs to be reworked.
                    url = moduleName + (ext || '');
                } else {
                    //A module that needs to be converted to a path.
                    paths = config.paths;

                    syms = moduleName.split('/');
                    //For each module name segment, see if there is a path
                    //registered for it. Start with most specific name
                    //and work up from it.
                    for (i = syms.length; i > 0; i -= 1) {
                        parentModule = syms.slice(0, i).join('/');

                        parentPath = getOwn(paths, parentModule);
                        if (parentPath) {
                            //If an array, it means there are a few choices,
                            //Choose the one that is desired
                            if (isArray(parentPath)) {
                                parentPath = parentPath[0];
                            }
                            syms.splice(0, i, parentPath);
                            break;
                        }
                    }

                    //Join the path parts together, then figure out if baseUrl is needed.
                    url = syms.join('/');
                    url += (ext || (/^data\:|^blob\:|\?/.test(url) || skipExt ? '' : '.js'));
                    url = (url.charAt(0) === '/' || url.match(/^[\w\+\.\-]+:/) ? '' : config.baseUrl) + url;
                }

                return config.urlArgs && !/^blob\:/.test(url) ?
                       url + config.urlArgs(moduleName, url) : url;
            },

            //Delegates to req.load. Broken out as a separate function to
            //allow overriding in the optimizer.
            load: function (id, url) {
                req.load(context, id, url);
            },

            /**
             * Executes a module callback function. Broken out as a separate function
             * solely to allow the build system to sequence the files in the built
             * layer in the right sequence.
             *
             * @private
             */
            execCb: function (name, callback, args, exports) {
                return callback.apply(exports, args);
            },

            /**
             * callback for script loads, used to check status of loading.
             *
             * @param {Event} evt the event from the browser for the script
             * that was loaded.
             */
            onScriptLoad: function (evt) {
                //Using currentTarget instead of target for Firefox 2.0's sake. Not
                //all old browsers will be supported, but this one was easy enough
                //to support and still makes sense.
                if (evt.type === 'load' ||
                        (readyRegExp.test((evt.currentTarget || evt.srcElement).readyState))) {
                    //Reset interactive script so a script node is not held onto for
                    //to long.
                    interactiveScript = null;

                    //Pull out the name of the module and the context.
                    var data = getScriptData(evt);
                    context.completeLoad(data.id);
                }
            },

            /**
             * Callback for script errors.
             */
            onScriptError: function (evt) {
                var data = getScriptData(evt);
                if (!hasPathFallback(data.id)) {
                    var parents = [];
                    eachProp(registry, function(value, key) {
                        if (key.indexOf('_@r') !== 0) {
                            each(value.depMaps, function(depMap) {
                                if (depMap.id === data.id) {
                                    parents.push(key);
                                    return true;
                                }
                            });
                        }
                    });
                    return onError(makeError('scripterror', 'Script error for "' + data.id +
                                             (parents.length ?
                                             '", needed by: ' + parents.join(', ') :
                                             '"'), evt, [data.id]));
                }
            }
        };

        context.require = context.makeRequire();
        return context;
    }

    /**
     * Main entry point.
     *
     * If the only argument to require is a string, then the module that
     * is represented by that string is fetched for the appropriate context.
     *
     * If the first argument is an array, then it will be treated as an array
     * of dependency string names to fetch. An optional function callback can
     * be specified to execute when all of those dependencies are available.
     *
     * Make a local req variable to help Caja compliance (it assumes things
     * on a require that are not standardized), and to give a short
     * name for minification/local scope use.
     */
    req = requirejs = function (deps, callback, errback, optional) {

        //Find the right context, use default
        var context, config,
            contextName = defContextName;

        // Determine if have config object in the call.
        if (!isArray(deps) && typeof deps !== 'string') {
            // deps is a config object
            config = deps;
            if (isArray(callback)) {
                // Adjust args if there are dependencies
                deps = callback;
                callback = errback;
                errback = optional;
            } else {
                deps = [];
            }
        }

        if (config && config.context) {
            contextName = config.context;
        }

        context = getOwn(contexts, contextName);
        if (!context) {
            context = contexts[contextName] = req.s.newContext(contextName);
        }

        if (config) {
            context.configure(config);
        }

        return context.require(deps, callback, errback);
    };

    /**
     * Support require.config() to make it easier to cooperate with other
     * AMD loaders on globally agreed names.
     */
    req.config = function (config) {
        return req(config);
    };

    /**
     * Execute something after the current tick
     * of the event loop. Override for other envs
     * that have a better solution than setTimeout.
     * @param  {Function} fn function to execute later.
     */
    req.nextTick = typeof setTimeout !== 'undefined' ? function (fn) {
        setTimeout(fn, 4);
    } : function (fn) { fn(); };

    /**
     * Export require as a global, but only if it does not already exist.
     */
    if (!require) {
        require = req;
    }

    req.version = version;

    //Used to filter out dependencies that are already paths.
    req.jsExtRegExp = /^\/|:|\?|\.js$/;
    req.isBrowser = isBrowser;
    s = req.s = {
        contexts: contexts,
        newContext: newContext
    };

    //Create default context.
    req({});

    //Exports some context-sensitive methods on global require.
    each([
        'toUrl',
        'undef',
        'defined',
        'specified'
    ], function (prop) {
        //Reference from contexts instead of early binding to default context,
        //so that during builds, the latest instance of the default context
        //with its config gets used.
        req[prop] = function () {
            var ctx = contexts[defContextName];
            return ctx.require[prop].apply(ctx, arguments);
        };
    });

    if (isBrowser) {
        head = s.head = document.getElementsByTagName('head')[0];
        //If BASE tag is in play, using appendChild is a problem for IE6.
        //When that browser dies, this can be removed. Details in this jQuery bug:
        //http://dev.jquery.com/ticket/2709
        baseElement = document.getElementsByTagName('base')[0];
        if (baseElement) {
            head = s.head = baseElement.parentNode;
        }
    }

    /**
     * Any errors that require explicitly generates will be passed to this
     * function. Intercept/override it if you want custom error handling.
     * @param {Error} err the error object.
     */
    req.onError = defaultOnError;

    /**
     * Creates the node for the load command. Only used in browser envs.
     */
    req.createNode = function (config, moduleName, url) {
        var node = config.xhtml ?
                document.createElementNS('http://www.w3.org/1999/xhtml', 'html:script') :
                document.createElement('script');
        node.type = config.scriptType || 'text/javascript';
        node.charset = 'utf-8';
        node.async = true;
        return node;
    };

    /**
     * Does the request to load a module for the browser case.
     * Make this a separate function to allow other environments
     * to override it.
     *
     * @param {Object} context the require context to find state.
     * @param {String} moduleName the name of the module.
     * @param {Object} url the URL to the module.
     */
    req.load = function (context, moduleName, url) {
        var config = (context && context.config) || {},
            node;
        if (isBrowser) {
            //In the browser so use a script tag
            node = req.createNode(config, moduleName, url);

            node.setAttribute('data-requirecontext', context.contextName);
            node.setAttribute('data-requiremodule', moduleName);

            //Set up load listener. Test attachEvent first because IE9 has
            //a subtle issue in its addEventListener and script onload firings
            //that do not match the behavior of all other browsers with
            //addEventListener support, which fire the onload event for a
            //script right after the script execution. See:
            //https://connect.microsoft.com/IE/feedback/details/648057/script-onload-event-is-not-fired-immediately-after-script-execution
            //UNFORTUNATELY Opera implements attachEvent but does not follow the script
            //script execution mode.
            if (node.attachEvent &&
                    //Check if node.attachEvent is artificially added by custom script or
                    //natively supported by browser
                    //read https://github.com/requirejs/requirejs/issues/187
                    //if we can NOT find [native code] then it must NOT natively supported.
                    //in IE8, node.attachEvent does not have toString()
                    //Note the test for "[native code" with no closing brace, see:
                    //https://github.com/requirejs/requirejs/issues/273
                    !(node.attachEvent.toString && node.attachEvent.toString().indexOf('[native code') < 0) &&
                    !isOpera) {
                //Probably IE. IE (at least 6-8) do not fire
                //script onload right after executing the script, so
                //we cannot tie the anonymous define call to a name.
                //However, IE reports the script as being in 'interactive'
                //readyState at the time of the define call.
                useInteractive = true;

                node.attachEvent('onreadystatechange', context.onScriptLoad);
                //It would be great to add an error handler here to catch
                //404s in IE9+. However, onreadystatechange will fire before
                //the error handler, so that does not help. If addEventListener
                //is used, then IE will fire error before load, but we cannot
                //use that pathway given the connect.microsoft.com issue
                //mentioned above about not doing the 'script execute,
                //then fire the script load event listener before execute
                //next script' that other browsers do.
                //Best hope: IE10 fixes the issues,
                //and then destroys all installs of IE 6-9.
                //node.attachEvent('onerror', context.onScriptError);
            } else {
                node.addEventListener('load', context.onScriptLoad, false);
                node.addEventListener('error', context.onScriptError, false);
            }
            node.src = url;

            //Calling onNodeCreated after all properties on the node have been
            //set, but before it is placed in the DOM.
            if (config.onNodeCreated) {
                config.onNodeCreated(node, config, moduleName, url);
            }

            //For some cache cases in IE 6-8, the script executes before the end
            //of the appendChild execution, so to tie an anonymous define
            //call to the module name (which is stored on the node), hold on
            //to a reference to this node, but clear after the DOM insertion.
            currentlyAddingScript = node;
            if (baseElement) {
                head.insertBefore(node, baseElement);
            } else {
                head.appendChild(node);
            }
            currentlyAddingScript = null;

            return node;
        } else if (isWebWorker) {
            try {
                //In a web worker, use importScripts. This is not a very
                //efficient use of importScripts, importScripts will block until
                //its script is downloaded and evaluated. However, if web workers
                //are in play, the expectation is that a build has been done so
                //that only one script needs to be loaded anyway. This may need
                //to be reevaluated if other use cases become common.

                // Post a task to the event loop to work around a bug in WebKit
                // where the worker gets garbage-collected after calling
                // importScripts(): https://webkit.org/b/153317
                setTimeout(function() {}, 0);
                importScripts(url);

                //Account for anonymous modules
                context.completeLoad(moduleName);
            } catch (e) {
                context.onError(makeError('importscripts',
                                'importScripts failed for ' +
                                    moduleName + ' at ' + url,
                                e,
                                [moduleName]));
            }
        }
    };

    function getInteractiveScript() {
        if (interactiveScript && interactiveScript.readyState === 'interactive') {
            return interactiveScript;
        }

        eachReverse(scripts(), function (script) {
            if (script.readyState === 'interactive') {
                return (interactiveScript = script);
            }
        });
        return interactiveScript;
    }

    //Look for a data-main script attribute, which could also adjust the baseUrl.
    if (isBrowser && !cfg.skipDataMain) {
        //Figure out baseUrl. Get it from the script tag with require.js in it.
        eachReverse(scripts(), function (script) {
            //Set the 'head' where we can append children by
            //using the script's parent.
            if (!head) {
                head = script.parentNode;
            }

            //Look for a data-main attribute to set main script for the page
            //to load. If it is there, the path to data main becomes the
            //baseUrl, if it is not already set.
            dataMain = script.getAttribute('data-main');
            if (dataMain) {
                //Preserve dataMain in case it is a path (i.e. contains '?')
                mainScript = dataMain;

                //Set final baseUrl if there is not already an explicit one,
                //but only do so if the data-main value is not a loader plugin
                //module ID.
                if (!cfg.baseUrl && mainScript.indexOf('!') === -1) {
                    //Pull off the directory of data-main for use as the
                    //baseUrl.
                    src = mainScript.split('/');
                    mainScript = src.pop();
                    subPath = src.length ? src.join('/')  + '/' : './';

                    cfg.baseUrl = subPath;
                }

                //Strip off any trailing .js since mainScript is now
                //like a module name.
                mainScript = mainScript.replace(jsSuffixRegExp, '');

                //If mainScript is still a path, fall back to dataMain
                if (req.jsExtRegExp.test(mainScript)) {
                    mainScript = dataMain;
                }

                //Put the data-main script in the files to load.
                cfg.deps = cfg.deps ? cfg.deps.concat(mainScript) : [mainScript];

                return true;
            }
        });
    }

    /**
     * The function that handles definitions of modules. Differs from
     * require() in that a string for the module should be the first argument,
     * and the function to execute after dependencies are loaded should
     * return a value to define the module corresponding to the first argument's
     * name.
     */
    define = function (name, deps, callback) {
        var node, context;

        //Allow for anonymous modules
        if (typeof name !== 'string') {
            //Adjust args appropriately
            callback = deps;
            deps = name;
            name = null;
        }

        //This module may not have dependencies
        if (!isArray(deps)) {
            callback = deps;
            deps = null;
        }

        //If no name, and callback is a function, then figure out if it a
        //CommonJS thing with dependencies.
        if (!deps && isFunction(callback)) {
            deps = [];
            //Remove comments from the callback string,
            //look for require calls, and pull them into the dependencies,
            //but only if there are function args.
            if (callback.length) {
                callback
                    .toString()
                    .replace(commentRegExp, commentReplace)
                    .replace(cjsRequireRegExp, function (match, dep) {
                        deps.push(dep);
                    });

                //May be a CommonJS thing even without require calls, but still
                //could use exports, and module. Avoid doing exports and module
                //work though if it just needs require.
                //REQUIRES the function to expect the CommonJS variables in the
                //order listed below.
                deps = (callback.length === 1 ? ['require'] : ['require', 'exports', 'module']).concat(deps);
            }
        }

        //If in IE 6-8 and hit an anonymous define() call, do the interactive
        //work.
        if (useInteractive) {
            node = currentlyAddingScript || getInteractiveScript();
            if (node) {
                if (!name) {
                    name = node.getAttribute('data-requiremodule');
                }
                context = contexts[node.getAttribute('data-requirecontext')];
            }
        }

        //Always save off evaluating the def call until the script onload handler.
        //This allows multiple modules to be in a file without prematurely
        //tracing dependencies, and allows for anonymous module support,
        //where the module name is not known until the script onload event
        //occurs. If no context, use the global queue, and get it processed
        //in the onscript load callback.
        if (context) {
            context.defQueue.push([name, deps, callback]);
            context.defQueueMap[name] = true;
        } else {
            globalDefQueue.push([name, deps, callback]);
        }
    };

    define.amd = {
        jQuery: true
    };

    /**
     * Executes the text. Normally just uses eval, but can be modified
     * to use a better, environment-specific call. Only used for transpiling
     * loader plugins, not for plain JS modules.
     * @param {String} text the text to execute/evaluate.
     */
    req.exec = function (text) {
        /*jslint evil: true */
        return eval(text);
    };

    //Set up with config info.
    req(cfg);
}(this, (typeof setTimeout === 'undefined' ? undefined : setTimeout)));



    this.requirejsVars = {
        require: require,
        requirejs: require,
        define: define
    };

    if (env === 'browser') {
        //sloppy since eval enclosed with use strict causes problems if the source
//text is not strict-compliant.
/*jslint sloppy: true, evil: true */
/*global require, XMLHttpRequest */

(function () {
    // Separate function to avoid eval pollution, same with arguments use.
    function exec() {
        eval(arguments[0]);
    }

    require.load = function (context, moduleName, url) {
        var xhr = new XMLHttpRequest();

        xhr.open('GET', url, true);
        xhr.send();

        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                exec(xhr.responseText);

                //Support anonymous modules.
                context.completeLoad(moduleName);
            }
        };
    };
}());
    } else if (env === 'rhino') {
        /*global require: false, java: false, load: false */

(function () {
    'use strict';
    require.load = function (context, moduleName, url) {

        load(url);

        //Support anonymous modules.
        context.completeLoad(moduleName);
    };

}());
    } else if (env === 'node') {
        this.requirejsVars.nodeRequire = nodeRequire;
        require.nodeRequire = nodeRequire;

        //Explicity not strict since this file contains an eval call, and do not want
//to enforce strict on code evaluated that way. See
//https://github.com/requirejs/r.js/issues/774
/*jslint regexp: false, sloppy: true*/
/*global require: false, define: false, requirejsVars: false, process: false */

/**
 * This adapter assumes that x.js has loaded it and set up
 * some variables. This adapter just allows limited RequireJS
 * usage from within the requirejs directory. The general
 * node adapater is r.js.
 */

(function () {
    var nodeReq = requirejsVars.nodeRequire,
        req = requirejsVars.require,
        def = requirejsVars.define,
        fs = nodeReq('fs'),
        path = nodeReq('path'),
        vm = nodeReq('vm'),
        //In Node 0.7+ existsSync is on fs.
        exists = fs.existsSync || path.existsSync,
        hasOwn = Object.prototype.hasOwnProperty;

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    function syncTick(fn) {
        fn();
    }

    function makeError(message, moduleName) {
        var err = new Error(message);
        err.requireModules = [moduleName];
        return err;
    }

    //Supply an implementation that allows synchronous get of a module.
    req.get = function (context, moduleName, relModuleMap, localRequire) {
        if (moduleName === "require" || moduleName === "exports" || moduleName === "module") {
            context.onError(makeError("Explicit require of " + moduleName + " is not allowed.", moduleName));
        }

        var ret, oldTick,
            moduleMap = context.makeModuleMap(moduleName, relModuleMap, false, true);

        //Normalize module name, if it contains . or ..
        moduleName = moduleMap.id;

        if (hasProp(context.defined, moduleName)) {
            ret = context.defined[moduleName];
        } else {
            if (ret === undefined) {
                //Make sure nextTick for this type of call is sync-based.
                oldTick = context.nextTick;
                context.nextTick = syncTick;
                try {
                    if (moduleMap.prefix) {
                        //A plugin, call requirejs to handle it. Now that
                        //nextTick is syncTick, the require will complete
                        //synchronously.
                        localRequire([moduleMap.originalName]);

                        //Now that plugin is loaded, can regenerate the moduleMap
                        //to get the final, normalized ID.
                        moduleMap = context.makeModuleMap(moduleMap.originalName, relModuleMap, false, true);
                        moduleName = moduleMap.id;
                    } else {
                        //Try to dynamically fetch it.
                        req.load(context, moduleName, moduleMap.url);

                        //Enable the module
                        context.enable(moduleMap, relModuleMap);
                    }

                    //Break any cycles by requiring it normally, but this will
                    //finish synchronously
                    context.require([moduleName]);

                    //The above calls are sync, so can do the next thing safely.
                    ret = context.defined[moduleName];
                } finally {
                    context.nextTick = oldTick;
                }
            }
        }

        return ret;
    };

    req.nextTick = function (fn) {
        process.nextTick(fn);
    };

    //Add wrapper around the code so that it gets the requirejs
    //API instead of the Node API, and it is done lexically so
    //that it survives later execution.
    req.makeNodeWrapper = function (contents) {
        return '(function (require, requirejs, define) { ' +
                contents +
                '\n}(requirejsVars.require, requirejsVars.requirejs, requirejsVars.define));';
    };

    req.load = function (context, moduleName, url) {
        var contents, err,
            config = context.config;

        if (config.shim[moduleName] && (!config.suppress || !config.suppress.nodeShim)) {
            console.warn('Shim config not supported in Node, may or may not work. Detected ' +
                            'for module: ' + moduleName);
        }

        if (exists(url)) {
            contents = fs.readFileSync(url, 'utf8');

            contents = req.makeNodeWrapper(contents);
            try {
                vm.runInThisContext(contents, fs.realpathSync(url));
            } catch (e) {
                err = new Error('Evaluating ' + url + ' as module "' +
                                moduleName + '" failed with error: ' + e);
                err.originalError = e;
                err.moduleName = moduleName;
                err.requireModules = [moduleName];
                err.fileName = url;
                return context.onError(err);
            }
        } else {
            def(moduleName, function () {
                //Get the original name, since relative requires may be
                //resolved differently in node (issue #202). Also, if relative,
                //make it relative to the URL of the item requesting it
                //(issue #393)
                var dirName,
                    map = hasProp(context.registry, moduleName) &&
                            context.registry[moduleName].map,
                    parentMap = map && map.parentMap,
                    originalName = map && map.originalName;

                if (originalName.charAt(0) === '.' && parentMap) {
                    dirName = parentMap.url.split('/');
                    dirName.pop();
                    originalName = dirName.join('/') + '/' + originalName;
                }

                try {
                    return (context.config.nodeRequire || req.nodeRequire)(originalName);
                } catch (e) {
                    err = new Error('Tried loading "' + moduleName + '" at ' +
                                     url + ' then tried node\'s require("' +
                                        originalName + '") and it failed ' +
                                     'with error: ' + e);
                    err.originalError = e;
                    err.moduleName = originalName;
                    err.requireModules = [moduleName];
                    throw err;
                }
            });
        }

        //Support anonymous modules.
        context.completeLoad(moduleName);
    };

    //Override to provide the function wrapper for define/require.
    req.exec = function (text) {
        /*jslint evil: true */
        text = req.makeNodeWrapper(text);
        return eval(text);
    };
}());

    } else if (env === 'xpconnect') {
        /*jslint */
/*global require, load */

(function () {
    'use strict';
    require.load = function (context, moduleName, url) {

        load(url);

        //Support anonymous modules.
        context.completeLoad(moduleName);
    };

}());

    }

    //Support a default file name to execute. Useful for hosted envs
    //like Joyent where it defaults to a server.js as the only executed
    //script. But only do it if this is not an optimization run.
    if (commandOption !== 'o' && (!fileName || !jsSuffixRegExp.test(fileName))) {
        fileName = 'main.js';
    }

    /**
     * Loads the library files that can be used for the optimizer, or for other
     * tasks.
     */
    function loadLib() {
        /*jslint strict: false */
/*global Packages: false, process: false, window: false, navigator: false,
  document: false, define: false */

/**
 * A plugin that modifies any /env/ path to be the right path based on
 * the host environment. Right now only works for Node, Rhino and browser.
 */
(function () {
    var pathRegExp = /(\/|^)env\/|\{env\}/,
        env = 'unknown';

    if (typeof process !== 'undefined' && process.versions && !!process.versions.node) {
        env = 'node';
    } else if (typeof Packages !== 'undefined') {
        env = 'rhino';
    } else if ((typeof navigator !== 'undefined' && typeof document !== 'undefined') ||
            (typeof importScripts !== 'undefined' && typeof self !== 'undefined')) {
        env = 'browser';
    } else if (typeof Components !== 'undefined' && Components.classes && Components.interfaces) {
        env = 'xpconnect';
    }

    define('env', {
        get: function () {
            return env;
        },

        load: function (name, req, load, config) {
            //Allow override in the config.
            if (config.env) {
                env = config.env;
            }

            name = name.replace(pathRegExp, function (match, prefix) {
                if (match.indexOf('{') === -1) {
                    return prefix + env + '/';
                } else {
                    return env;
                }
            });

            req([name], function (mod) {
                load(mod);
            });
        }
    });
}());
/*jslint plusplus: true */
/*global define, java */

define('lang', function () {
    'use strict';

    var lang, isJavaObj,
        hasOwn = Object.prototype.hasOwnProperty;

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    isJavaObj = function () {
        return false;
    };

    //Rhino, but not Nashorn (detected by importPackage not existing)
    //Can have some strange foreign objects.
    if (typeof java !== 'undefined' && java.lang && java.lang.Object && typeof importPackage !== 'undefined') {
        isJavaObj = function (obj) {
            return obj instanceof java.lang.Object;
        };
    }

    lang = {
        backSlashRegExp: /\\/g,
        ostring: Object.prototype.toString,

        isArray: Array.isArray || function (it) {
            return lang.ostring.call(it) === "[object Array]";
        },

        isFunction: function(it) {
            return lang.ostring.call(it) === "[object Function]";
        },

        isRegExp: function(it) {
            return it && it instanceof RegExp;
        },

        hasProp: hasProp,

        //returns true if the object does not have an own property prop,
        //or if it does, it is a falsy value.
        falseProp: function (obj, prop) {
            return !hasProp(obj, prop) || !obj[prop];
        },

        //gets own property value for given prop on object
        getOwn: function (obj, prop) {
            return hasProp(obj, prop) && obj[prop];
        },

        _mixin: function(dest, source, override){
            var name;
            for (name in source) {
                if(source.hasOwnProperty(name) &&
                    (override || !dest.hasOwnProperty(name))) {
                    dest[name] = source[name];
                }
            }

            return dest; // Object
        },

        /**
         * mixin({}, obj1, obj2) is allowed. If the last argument is a boolean,
         * then the source objects properties are force copied over to dest.
         */
        mixin: function(dest){
            var parameters = Array.prototype.slice.call(arguments),
                override, i, l;

            if (!dest) { dest = {}; }

            if (parameters.length > 2 && typeof arguments[parameters.length-1] === 'boolean') {
                override = parameters.pop();
            }

            for (i = 1, l = parameters.length; i < l; i++) {
                lang._mixin(dest, parameters[i], override);
            }
            return dest; // Object
        },

        /**
         * Does a deep mix of source into dest, where source values override
         * dest values if a winner is needed.
         * @param  {Object} dest destination object that receives the mixed
         * values.
         * @param  {Object} source source object contributing properties to mix
         * in.
         * @return {[Object]} returns dest object with the modification.
         */
        deepMix: function(dest, source) {
            lang.eachProp(source, function (value, prop) {
                if (typeof value === 'object' && value &&
                    !lang.isArray(value) && !lang.isFunction(value) &&
                    !(value instanceof RegExp)) {

                    if (!dest[prop]) {
                        dest[prop] = {};
                    }
                    lang.deepMix(dest[prop], value);
                } else {
                    dest[prop] = value;
                }
            });
            return dest;
        },

        /**
         * Does a type of deep copy. Do not give it anything fancy, best
         * for basic object copies of objects that also work well as
         * JSON-serialized things, or has properties pointing to functions.
         * For non-array/object values, just returns the same object.
         * @param  {Object} obj      copy properties from this object
         * @param  {Object} [ignoredProps] optional object whose own properties
         * are keys that should be ignored.
         * @return {Object}
         */
        deeplikeCopy: function (obj, ignoredProps) {
            var type, result;

            if (lang.isArray(obj)) {
                result = [];
                obj.forEach(function(value) {
                    result.push(lang.deeplikeCopy(value, ignoredProps));
                });
                return result;
            }

            type = typeof obj;
            if (obj === null || obj === undefined || type === 'boolean' ||
                type === 'string' || type === 'number' || lang.isFunction(obj) ||
                lang.isRegExp(obj)|| isJavaObj(obj)) {
                return obj;
            }

            //Anything else is an object, hopefully.
            result = {};
            lang.eachProp(obj, function(value, key) {
                if (!ignoredProps || !hasProp(ignoredProps, key)) {
                    result[key] = lang.deeplikeCopy(value, ignoredProps);
                }
            });
            return result;
        },

        delegate: (function () {
            // boodman/crockford delegation w/ cornford optimization
            function TMP() {}
            return function (obj, props) {
                TMP.prototype = obj;
                var tmp = new TMP();
                TMP.prototype = null;
                if (props) {
                    lang.mixin(tmp, props);
                }
                return tmp; // Object
            };
        }()),

        /**
         * Helper function for iterating over an array. If the func returns
         * a true value, it will break out of the loop.
         */
        each: function each(ary, func) {
            if (ary) {
                var i;
                for (i = 0; i < ary.length; i += 1) {
                    if (func(ary[i], i, ary)) {
                        break;
                    }
                }
            }
        },

        /**
         * Cycles over properties in an object and calls a function for each
         * property value. If the function returns a truthy value, then the
         * iteration is stopped.
         */
        eachProp: function eachProp(obj, func) {
            var prop;
            for (prop in obj) {
                if (hasProp(obj, prop)) {
                    if (func(obj[prop], prop)) {
                        break;
                    }
                }
            }
        },

        //Similar to Function.prototype.bind, but the "this" object is specified
        //first, since it is easier to read/figure out what "this" will be.
        bind: function bind(obj, fn) {
            return function () {
                return fn.apply(obj, arguments);
            };
        },

        //Escapes a content string to be be a string that has characters escaped
        //for inclusion as part of a JS string.
        jsEscape: function (content) {
            return content.replace(/(["'\\])/g, '\\$1')
                .replace(/[\f]/g, "\\f")
                .replace(/[\b]/g, "\\b")
                .replace(/[\n]/g, "\\n")
                .replace(/[\t]/g, "\\t")
                .replace(/[\r]/g, "\\r");
        }
    };
    return lang;
});
/**
 * prim 0.0.1 Copyright (c) 2012-2014, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/requirejs/prim for details
 */

/*global setImmediate, process, setTimeout, define, module */

//Set prime.hideResolutionConflict = true to allow "resolution-races"
//in promise-tests to pass.
//Since the goal of prim is to be a small impl for trusted code, it is
//more important to normally throw in this case so that we can find
//logic errors quicker.

var prim;
(function () {
    'use strict';
    var op = Object.prototype,
        hasOwn = op.hasOwnProperty;

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    /**
     * Helper function for iterating over an array. If the func returns
     * a true value, it will break out of the loop.
     */
    function each(ary, func) {
        if (ary) {
            var i;
            for (i = 0; i < ary.length; i += 1) {
                if (ary[i]) {
                    func(ary[i], i, ary);
                }
            }
        }
    }

    function check(p) {
        if (hasProp(p, 'e') || hasProp(p, 'v')) {
            if (!prim.hideResolutionConflict) {
                throw new Error('Prim promise already resolved: ' +
                                JSON.stringify(p));
            }
            return false;
        }
        return true;
    }

    function notify(ary, value) {
        prim.nextTick(function () {
            each(ary, function (item) {
                item(value);
            });
        });
    }

    prim = function prim() {
        var p,
            ok = [],
            fail = [];

        return (p = {
            callback: function (yes, no) {
                if (no) {
                    p.errback(no);
                }

                if (hasProp(p, 'v')) {
                    prim.nextTick(function () {
                        yes(p.v);
                    });
                } else {
                    ok.push(yes);
                }
            },

            errback: function (no) {
                if (hasProp(p, 'e')) {
                    prim.nextTick(function () {
                        no(p.e);
                    });
                } else {
                    fail.push(no);
                }
            },

            finished: function () {
                return hasProp(p, 'e') || hasProp(p, 'v');
            },

            rejected: function () {
                return hasProp(p, 'e');
            },

            resolve: function (v) {
                if (check(p)) {
                    p.v = v;
                    notify(ok, v);
                }
                return p;
            },
            reject: function (e) {
                if (check(p)) {
                    p.e = e;
                    notify(fail, e);
                }
                return p;
            },

            start: function (fn) {
                p.resolve();
                return p.promise.then(fn);
            },

            promise: {
                then: function (yes, no) {
                    var next = prim();

                    p.callback(function (v) {
                        try {
                            if (yes && typeof yes === 'function') {
                                v = yes(v);
                            }

                            if (v && v.then) {
                                v.then(next.resolve, next.reject);
                            } else {
                                next.resolve(v);
                            }
                        } catch (e) {
                            next.reject(e);
                        }
                    }, function (e) {
                        var err;

                        try {
                            if (!no || typeof no !== 'function') {
                                next.reject(e);
                            } else {
                                err = no(e);

                                if (err && err.then) {
                                    err.then(next.resolve, next.reject);
                                } else {
                                    next.resolve(err);
                                }
                            }
                        } catch (e2) {
                            next.reject(e2);
                        }
                    });

                    return next.promise;
                },

                fail: function (no) {
                    return p.promise.then(null, no);
                },

                end: function () {
                    p.errback(function (e) {
                        throw e;
                    });
                }
            }
        });
    };

    prim.serial = function (ary) {
        var result = prim().resolve().promise;
        each(ary, function (item) {
            result = result.then(function () {
                return item();
            });
        });
        return result;
    };

    prim.nextTick = typeof setImmediate === 'function' ? setImmediate :
        (typeof process !== 'undefined' && process.nextTick ?
            process.nextTick : (typeof setTimeout !== 'undefined' ?
                function (fn) {
                setTimeout(fn, 0);
            } : function (fn) {
        fn();
    }));

    if (typeof define === 'function' && define.amd) {
        define('prim', function () { return prim; });
    } else if (typeof module !== 'undefined' && module.exports) {
        module.exports = prim;
    }
}());
if(env === 'browser') {
/*jslint strict: false */
/*global define: false, load: false */

//Just a stub for use with uglify's consolidator.js
define('browser/assert', function () {
    return {};
});

}

if(env === 'node') {
/*jslint strict: false */
/*global define: false, load: false */

//Needed so that rhino/assert can return a stub for uglify's consolidator.js
define('node/assert', ['assert'], function (assert) {
    return assert;
});

}

if(env === 'rhino') {
/*jslint strict: false */
/*global define: false, load: false */

//Just a stub for use with uglify's consolidator.js
define('rhino/assert', function () {
    return {};
});

}

if(env === 'xpconnect') {
/*jslint strict: false */
/*global define: false, load: false */

//Just a stub for use with uglify's consolidator.js
define('xpconnect/assert', function () {
    return {};
});

}

if(env === 'browser') {
/*jslint strict: false */
/*global define: false, process: false */

define('browser/args', function () {
    //Always expect config via an API call
    return [];
});

}

if(env === 'node') {
/*jslint strict: false */
/*global define: false, process: false */

define('node/args', function () {
    //Do not return the "node" or "r.js" arguments
    var args = process.argv.slice(2);

    //Ignore any command option used for main x.js branching
    if (args[0] && args[0].indexOf('-') === 0) {
        args = args.slice(1);
    }

    return args;
});

}

if(env === 'rhino') {
/*jslint strict: false */
/*global define: false, process: false */

var jsLibRhinoArgs = (typeof rhinoArgs !== 'undefined' && rhinoArgs) || [].concat(Array.prototype.slice.call(arguments, 0));

define('rhino/args', function () {
    var args = jsLibRhinoArgs;

    //Ignore any command option used for main x.js branching
    if (args[0] && args[0].indexOf('-') === 0) {
        args = args.slice(1);
    }

    return args;
});

}

if(env === 'xpconnect') {
/*jslint strict: false */
/*global define, xpconnectArgs */

var jsLibXpConnectArgs = (typeof xpconnectArgs !== 'undefined' && xpconnectArgs) || [].concat(Array.prototype.slice.call(arguments, 0));

define('xpconnect/args', function () {
    var args = jsLibXpConnectArgs;

    //Ignore any command option used for main x.js branching
    if (args[0] && args[0].indexOf('-') === 0) {
        args = args.slice(1);
    }

    return args;
});

}

if(env === 'browser') {
/*jslint strict: false */
/*global define: false, console: false */

define('browser/load', ['./file'], function (file) {
    function load(fileName) {
        eval(file.readFile(fileName));
    }

    return load;
});

}

if(env === 'node') {
/*jslint strict: false */
/*global define: false, console: false */

define('node/load', ['fs'], function (fs) {
    function load(fileName) {
        var contents = fs.readFileSync(fileName, 'utf8');
        process.compile(contents, fileName);
    }

    return load;
});

}

if(env === 'rhino') {
/*jslint strict: false */
/*global define: false, load: false */

define('rhino/load', function () {
    return load;
});

}

if(env === 'xpconnect') {
/*jslint strict: false */
/*global define: false, load: false */

define('xpconnect/load', function () {
    return load;
});

}

if(env === 'browser') {
/*jslint sloppy: true, nomen: true */
/*global require, define, console, XMLHttpRequest, requirejs, location */

define('browser/file', ['prim'], function (prim) {

    var file,
        currDirRegExp = /^\.(\/|$)/;

    function frontSlash(path) {
        return path.replace(/\\/g, '/');
    }

    function exists(path) {
        var status, xhr = new XMLHttpRequest();

        //Oh yeah, that is right SYNC IO. Behold its glory
        //and horrible blocking behavior.
        xhr.open('HEAD', path, false);
        xhr.send();
        status = xhr.status;

        return status === 200 || status === 304;
    }

    function mkDir(dir) {
        console.log('mkDir is no-op in browser');
    }

    function mkFullDir(dir) {
        console.log('mkFullDir is no-op in browser');
    }

    file = {
        backSlashRegExp: /\\/g,
        exclusionRegExp: /^\./,
        getLineSeparator: function () {
            return '/';
        },

        exists: function (fileName) {
            return exists(fileName);
        },

        parent: function (fileName) {
            var parts = fileName.split('/');
            parts.pop();
            return parts.join('/');
        },

        /**
         * Gets the absolute file path as a string, normalized
         * to using front slashes for path separators.
         * @param {String} fileName
         */
        absPath: function (fileName) {
            var dir;
            if (currDirRegExp.test(fileName)) {
                dir = frontSlash(location.href);
                if (dir.indexOf('/') !== -1) {
                    dir = dir.split('/');

                    //Pull off protocol and host, just want
                    //to allow paths (other build parts, like
                    //require._isSupportedBuildUrl do not support
                    //full URLs), but a full path from
                    //the root.
                    dir.splice(0, 3);

                    dir.pop();
                    dir = '/' + dir.join('/');
                }

                fileName = dir + fileName.substring(1);
            }

            return fileName;
        },

        normalize: function (fileName) {
            return fileName;
        },

        isFile: function (path) {
            return true;
        },

        isDirectory: function (path) {
            return false;
        },

        getFilteredFileList: function (startDir, regExpFilters, makeUnixPaths) {
            console.log('file.getFilteredFileList is no-op in browser');
        },

        copyDir: function (srcDir, destDir, regExpFilter, onlyCopyNew) {
            console.log('file.copyDir is no-op in browser');

        },

        copyFile: function (srcFileName, destFileName, onlyCopyNew) {
            console.log('file.copyFile is no-op in browser');
        },

        /**
         * Renames a file. May fail if "to" already exists or is on another drive.
         */
        renameFile: function (from, to) {
            console.log('file.renameFile is no-op in browser');
        },

        /**
         * Reads a *text* file.
         */
        readFile: function (path, encoding) {
            var xhr = new XMLHttpRequest();

            //Oh yeah, that is right SYNC IO. Behold its glory
            //and horrible blocking behavior.
            xhr.open('GET', path, false);
            xhr.send();

            return xhr.responseText;
        },

        readFileAsync: function (path, encoding) {
            var xhr = new XMLHttpRequest(),
                d = prim();

            xhr.open('GET', path, true);
            xhr.send();

            xhr.onreadystatechange = function () {
                if (xhr.readyState === 4) {
                    if (xhr.status > 400) {
                        d.reject(new Error('Status: ' + xhr.status + ': ' + xhr.statusText));
                    } else {
                        d.resolve(xhr.responseText);
                    }
                }
            };

            return d.promise;
        },

        saveUtf8File: function (fileName, fileContents) {
            //summary: saves a *text* file using UTF-8 encoding.
            file.saveFile(fileName, fileContents, "utf8");
        },

        saveFile: function (fileName, fileContents, encoding) {
            requirejs.browser.saveFile(fileName, fileContents, encoding);
        },

        deleteFile: function (fileName) {
            console.log('file.deleteFile is no-op in browser');
        },

        /**
         * Deletes any empty directories under the given directory.
         */
        deleteEmptyDirs: function (startDir) {
            console.log('file.deleteEmptyDirs is no-op in browser');
        }
    };

    return file;

});

}

if(env === 'node') {
/*jslint plusplus: false, octal:false, strict: false */
/*global define: false, process: false */

define('node/file', ['fs', 'path', 'prim'], function (fs, path, prim) {

    var isWindows = process.platform === 'win32',
        windowsDriveRegExp = /^[a-zA-Z]\:\/$/,
        file;

    function frontSlash(path) {
        return path.replace(/\\/g, '/');
    }

    function exists(path) {
        if (isWindows && path.charAt(path.length - 1) === '/' &&
            path.charAt(path.length - 2) !== ':') {
            path = path.substring(0, path.length - 1);
        }

        try {
            fs.statSync(path);
            return true;
        } catch (e) {
            return false;
        }
    }

    function mkDir(dir) {
        if (!exists(dir) && (!isWindows || !windowsDriveRegExp.test(dir))) {
            fs.mkdirSync(dir, 511);
        }
    }

    function mkFullDir(dir) {
        var parts = dir.split('/'),
            currDir = '',
            first = true;

        parts.forEach(function (part) {
            //First part may be empty string if path starts with a slash.
            currDir += part + '/';
            first = false;

            if (part) {
                mkDir(currDir);
            }
        });
    }

    file = {
        backSlashRegExp: /\\/g,
        exclusionRegExp: /^\./,
        getLineSeparator: function () {
            return '/';
        },

        exists: function (fileName) {
            return exists(fileName);
        },

        parent: function (fileName) {
            var parts = fileName.split('/');
            parts.pop();
            return parts.join('/');
        },

        /**
         * Gets the absolute file path as a string, normalized
         * to using front slashes for path separators.
         * @param {String} fileName
         */
        absPath: function (fileName) {
            return frontSlash(path.normalize(frontSlash(fs.realpathSync(fileName))));
        },

        normalize: function (fileName) {
            return frontSlash(path.normalize(fileName));
        },

        isFile: function (path) {
            return fs.statSync(path).isFile();
        },

        isDirectory: function (path) {
            return fs.statSync(path).isDirectory();
        },

        getFilteredFileList: function (/*String*/startDir, /*RegExp*/regExpFilters, /*boolean?*/makeUnixPaths) {
            //summary: Recurses startDir and finds matches to the files that match regExpFilters.include
            //and do not match regExpFilters.exclude. Or just one regexp can be passed in for regExpFilters,
            //and it will be treated as the "include" case.
            //Ignores files/directories that start with a period (.) unless exclusionRegExp
            //is set to another value.
            var files = [], topDir, regExpInclude, regExpExclude, dirFileArray,
                i, stat, filePath, ok, dirFiles, fileName;

            topDir = startDir;

            regExpInclude = regExpFilters.include || regExpFilters;
            regExpExclude = regExpFilters.exclude || null;

            if (file.exists(topDir)) {
                dirFileArray = fs.readdirSync(topDir);
                for (i = 0; i < dirFileArray.length; i++) {
                    fileName = dirFileArray[i];
                    filePath = path.join(topDir, fileName);
                    stat = fs.statSync(filePath);
                    if (stat.isFile()) {
                        if (makeUnixPaths) {
                            //Make sure we have a JS string.
                            if (filePath.indexOf("/") === -1) {
                                filePath = frontSlash(filePath);
                            }
                        }

                        ok = true;
                        if (regExpInclude) {
                            ok = filePath.match(regExpInclude);
                        }
                        if (ok && regExpExclude) {
                            ok = !filePath.match(regExpExclude);
                        }

                        if (ok && (!file.exclusionRegExp ||
                            !file.exclusionRegExp.test(fileName))) {
                            files.push(filePath);
                        }
                    } else if (stat.isDirectory() &&
                              (!file.exclusionRegExp || !file.exclusionRegExp.test(fileName))) {
                        dirFiles = this.getFilteredFileList(filePath, regExpFilters, makeUnixPaths);
                        //Do not use push.apply for dir listings, can hit limit of max number
                        //of arguments to a function call, #921.
                        dirFiles.forEach(function (dirFile) {
                            files.push(dirFile);
                        });
                    }
                }
            }

            return files; //Array
        },

        copyDir: function (/*String*/srcDir, /*String*/destDir, /*RegExp?*/regExpFilter, /*boolean?*/onlyCopyNew) {
            //summary: copies files from srcDir to destDir using the regExpFilter to determine if the
            //file should be copied. Returns a list file name strings of the destinations that were copied.
            regExpFilter = regExpFilter || /\w/;

            //Normalize th directory names, but keep front slashes.
            //path module on windows now returns backslashed paths.
            srcDir = frontSlash(path.normalize(srcDir));
            destDir = frontSlash(path.normalize(destDir));

            var fileNames = file.getFilteredFileList(srcDir, regExpFilter, true),
            copiedFiles = [], i, srcFileName, destFileName;

            for (i = 0; i < fileNames.length; i++) {
                srcFileName = fileNames[i];
                destFileName = srcFileName.replace(srcDir, destDir);

                if (file.copyFile(srcFileName, destFileName, onlyCopyNew)) {
                    copiedFiles.push(destFileName);
                }
            }

            return copiedFiles.length ? copiedFiles : null; //Array or null
        },

        copyFile: function (/*String*/srcFileName, /*String*/destFileName, /*boolean?*/onlyCopyNew) {
            //summary: copies srcFileName to destFileName. If onlyCopyNew is set, it only copies the file if
            //srcFileName is newer than destFileName. Returns a boolean indicating if the copy occurred.
            var parentDir;

            //logger.trace("Src filename: " + srcFileName);
            //logger.trace("Dest filename: " + destFileName);

            //If onlyCopyNew is true, then compare dates and only copy if the src is newer
            //than dest.
            if (onlyCopyNew) {
                if (file.exists(destFileName) && fs.statSync(destFileName).mtime.getTime() >= fs.statSync(srcFileName).mtime.getTime()) {
                    return false; //Boolean
                }
            }

            //Make sure destination dir exists.
            parentDir = path.dirname(destFileName);
            if (!file.exists(parentDir)) {
                mkFullDir(parentDir);
            }

            fs.writeFileSync(destFileName, fs.readFileSync(srcFileName, 'binary'), 'binary');

            return true; //Boolean
        },

        /**
         * Renames a file. May fail if "to" already exists or is on another drive.
         */
        renameFile: function (from, to) {
            return fs.renameSync(from, to);
        },

        /**
         * Reads a *text* file.
         */
        readFile: function (/*String*/path, /*String?*/encoding) {
            if (encoding === 'utf-8') {
                encoding = 'utf8';
            }
            if (!encoding) {
                encoding = 'utf8';
            }

            var text = fs.readFileSync(path, encoding);

            //Hmm, would not expect to get A BOM, but it seems to happen,
            //remove it just in case.
            if (text.indexOf('\uFEFF') === 0) {
                text = text.substring(1, text.length);
            }

            return text;
        },

        readFileAsync: function (path, encoding) {
            var d = prim();
            try {
                d.resolve(file.readFile(path, encoding));
            } catch (e) {
                d.reject(e);
            }
            return d.promise;
        },

        saveUtf8File: function (/*String*/fileName, /*String*/fileContents) {
            //summary: saves a *text* file using UTF-8 encoding.
            file.saveFile(fileName, fileContents, "utf8");
        },

        saveFile: function (/*String*/fileName, /*String*/fileContents, /*String?*/encoding) {
            //summary: saves a *text* file.
            var parentDir;

            if (encoding === 'utf-8') {
                encoding = 'utf8';
            }
            if (!encoding) {
                encoding = 'utf8';
            }

            //Make sure destination directories exist.
            parentDir = path.dirname(fileName);
            if (!file.exists(parentDir)) {
                mkFullDir(parentDir);
            }

            fs.writeFileSync(fileName, fileContents, encoding);
        },

        deleteFile: function (/*String*/fileName) {
            //summary: deletes a file or directory if it exists.
            var files, i, stat;
            if (file.exists(fileName)) {
                stat = fs.lstatSync(fileName);
                if (stat.isDirectory()) {
                    files = fs.readdirSync(fileName);
                    for (i = 0; i < files.length; i++) {
                        this.deleteFile(path.join(fileName, files[i]));
                    }
                    fs.rmdirSync(fileName);
                } else {
                    fs.unlinkSync(fileName);
                }
            }
        },


        /**
         * Deletes any empty directories under the given directory.
         */
        deleteEmptyDirs: function (startDir) {
            var dirFileArray, i, fileName, filePath, stat;

            if (file.exists(startDir)) {
                dirFileArray = fs.readdirSync(startDir);
                for (i = 0; i < dirFileArray.length; i++) {
                    fileName = dirFileArray[i];
                    filePath = path.join(startDir, fileName);
                    stat = fs.lstatSync(filePath);
                    if (stat.isDirectory()) {
                        file.deleteEmptyDirs(filePath);
                    }
                }

                //If directory is now empty, remove it.
                if (fs.readdirSync(startDir).length ===  0) {
                    file.deleteFile(startDir);
                }
            }
        }
    };

    return file;

});

}

if(env === 'rhino') {
//Helper functions to deal with file I/O.

/*jslint plusplus: false */
/*global java: false, define: false */

define('rhino/file', ['prim'], function (prim) {
    var file = {
        backSlashRegExp: /\\/g,

        exclusionRegExp: /^\./,

        getLineSeparator: function () {
            return file.lineSeparator;
        },

        lineSeparator: java.lang.System.getProperty("line.separator"), //Java String

        exists: function (fileName) {
            return (new java.io.File(fileName)).exists();
        },

        parent: function (fileName) {
            return file.absPath((new java.io.File(fileName)).getParentFile());
        },

        normalize: function (fileName) {
            return file.absPath(fileName);
        },

        isFile: function (path) {
            return (new java.io.File(path)).isFile();
        },

        isDirectory: function (path) {
            return (new java.io.File(path)).isDirectory();
        },

        /**
         * Gets the absolute file path as a string, normalized
         * to using front slashes for path separators.
         * @param {java.io.File||String} file
         */
        absPath: function (fileObj) {
            if (typeof fileObj === "string") {
                fileObj = new java.io.File(fileObj);
            }
            return (fileObj.getCanonicalPath() + "").replace(file.backSlashRegExp, "/");
        },

        getFilteredFileList: function (/*String*/startDir, /*RegExp*/regExpFilters, /*boolean?*/makeUnixPaths, /*boolean?*/startDirIsJavaObject) {
            //summary: Recurses startDir and finds matches to the files that match regExpFilters.include
            //and do not match regExpFilters.exclude. Or just one regexp can be passed in for regExpFilters,
            //and it will be treated as the "include" case.
            //Ignores files/directories that start with a period (.) unless exclusionRegExp
            //is set to another value.
            var files = [], topDir, regExpInclude, regExpExclude, dirFileArray,
                i, fileObj, filePath, ok, dirFiles;

            topDir = startDir;
            if (!startDirIsJavaObject) {
                topDir = new java.io.File(startDir);
            }

            regExpInclude = regExpFilters.include || regExpFilters;
            regExpExclude = regExpFilters.exclude || null;

            if (topDir.exists()) {
                dirFileArray = topDir.listFiles();
                for (i = 0; i < dirFileArray.length; i++) {
                    fileObj = dirFileArray[i];
                    if (fileObj.isFile()) {
                        filePath = fileObj.getPath();
                        if (makeUnixPaths) {
                            //Make sure we have a JS string.
                            filePath = String(filePath);
                            if (filePath.indexOf("/") === -1) {
                                filePath = filePath.replace(/\\/g, "/");
                            }
                        }

                        ok = true;
                        if (regExpInclude) {
                            ok = filePath.match(regExpInclude);
                        }
                        if (ok && regExpExclude) {
                            ok = !filePath.match(regExpExclude);
                        }

                        if (ok && (!file.exclusionRegExp ||
                            !file.exclusionRegExp.test(fileObj.getName()))) {
                            files.push(filePath);
                        }
                    } else if (fileObj.isDirectory() &&
                              (!file.exclusionRegExp || !file.exclusionRegExp.test(fileObj.getName()))) {
                        dirFiles = this.getFilteredFileList(fileObj, regExpFilters, makeUnixPaths, true);
                        //Do not use push.apply for dir listings, can hit limit of max number
                        //of arguments to a function call, #921.
                        dirFiles.forEach(function (dirFile) {
                            files.push(dirFile);
                        });
                    }
                }
            }

            return files; //Array
        },

        copyDir: function (/*String*/srcDir, /*String*/destDir, /*RegExp?*/regExpFilter, /*boolean?*/onlyCopyNew) {
            //summary: copies files from srcDir to destDir using the regExpFilter to determine if the
            //file should be copied. Returns a list file name strings of the destinations that were copied.
            regExpFilter = regExpFilter || /\w/;

            var fileNames = file.getFilteredFileList(srcDir, regExpFilter, true),
            copiedFiles = [], i, srcFileName, destFileName;

            for (i = 0; i < fileNames.length; i++) {
                srcFileName = fileNames[i];
                destFileName = srcFileName.replace(srcDir, destDir);

                if (file.copyFile(srcFileName, destFileName, onlyCopyNew)) {
                    copiedFiles.push(destFileName);
                }
            }

            return copiedFiles.length ? copiedFiles : null; //Array or null
        },

        copyFile: function (/*String*/srcFileName, /*String*/destFileName, /*boolean?*/onlyCopyNew) {
            //summary: copies srcFileName to destFileName. If onlyCopyNew is set, it only copies the file if
            //srcFileName is newer than destFileName. Returns a boolean indicating if the copy occurred.
            var destFile = new java.io.File(destFileName), srcFile, parentDir,
            srcChannel, destChannel;

            //logger.trace("Src filename: " + srcFileName);
            //logger.trace("Dest filename: " + destFileName);

            //If onlyCopyNew is true, then compare dates and only copy if the src is newer
            //than dest.
            if (onlyCopyNew) {
                srcFile = new java.io.File(srcFileName);
                if (destFile.exists() && destFile.lastModified() >= srcFile.lastModified()) {
                    return false; //Boolean
                }
            }

            //Make sure destination dir exists.
            parentDir = destFile.getParentFile();
            if (!parentDir.exists()) {
                if (!parentDir.mkdirs()) {
                    throw "Could not create directory: " + parentDir.getCanonicalPath();
                }
            }

            //Java's version of copy file.
            srcChannel = new java.io.FileInputStream(srcFileName).getChannel();
            destChannel = new java.io.FileOutputStream(destFileName).getChannel();
            destChannel.transferFrom(srcChannel, 0, srcChannel.size());
            srcChannel.close();
            destChannel.close();

            return true; //Boolean
        },

        /**
         * Renames a file. May fail if "to" already exists or is on another drive.
         */
        renameFile: function (from, to) {
            return (new java.io.File(from)).renameTo((new java.io.File(to)));
        },

        readFile: function (/*String*/path, /*String?*/encoding) {
            //A file read function that can deal with BOMs
            encoding = encoding || "utf-8";
            var fileObj = new java.io.File(path),
                    input = new java.io.BufferedReader(new java.io.InputStreamReader(new java.io.FileInputStream(fileObj), encoding)),
                    stringBuffer, line;
            try {
                stringBuffer = new java.lang.StringBuffer();
                line = input.readLine();

                // Byte Order Mark (BOM) - The Unicode Standard, version 3.0, page 324
                // http://www.unicode.org/faq/utf_bom.html

                // Note that when we use utf-8, the BOM should appear as "EF BB BF", but it doesn't due to this bug in the JDK:
                // http://bugs.sun.com/bugdatabase/view_bug.do?bug_id=4508058
                if (line && line.length() && line.charAt(0) === 0xfeff) {
                    // Eat the BOM, since we've already found the encoding on this file,
                    // and we plan to concatenating this buffer with others; the BOM should
                    // only appear at the top of a file.
                    line = line.substring(1);
                }
                while (line !== null) {
                    stringBuffer.append(line);
                    stringBuffer.append(file.lineSeparator);
                    line = input.readLine();
                }
                //Make sure we return a JavaScript string and not a Java string.
                return String(stringBuffer.toString()); //String
            } finally {
                input.close();
            }
        },

        readFileAsync: function (path, encoding) {
            var d = prim();
            try {
                d.resolve(file.readFile(path, encoding));
            } catch (e) {
                d.reject(e);
            }
            return d.promise;
        },

        saveUtf8File: function (/*String*/fileName, /*String*/fileContents) {
            //summary: saves a file using UTF-8 encoding.
            file.saveFile(fileName, fileContents, "utf-8");
        },

        saveFile: function (/*String*/fileName, /*String*/fileContents, /*String?*/encoding) {
            //summary: saves a file.
            var outFile = new java.io.File(fileName), outWriter, parentDir, os;

            parentDir = outFile.getAbsoluteFile().getParentFile();
            if (!parentDir.exists()) {
                if (!parentDir.mkdirs()) {
                    throw "Could not create directory: " + parentDir.getAbsolutePath();
                }
            }

            if (encoding) {
                outWriter = new java.io.OutputStreamWriter(new java.io.FileOutputStream(outFile), encoding);
            } else {
                outWriter = new java.io.OutputStreamWriter(new java.io.FileOutputStream(outFile));
            }

            os = new java.io.BufferedWriter(outWriter);
            try {
                //If in Nashorn, need to coerce the JS string to a Java string so that
                //writer.write method dispatch correctly detects the type.
                if (typeof importPackage !== 'undefined') {
                    os.write(fileContents);
                } else {
                    os.write(new java.lang.String(fileContents));
                }
            } finally {
                os.close();
            }
        },

        deleteFile: function (/*String*/fileName) {
            //summary: deletes a file or directory if it exists.
            var fileObj = new java.io.File(fileName), files, i;
            if (fileObj.exists()) {
                if (fileObj.isDirectory()) {
                    files = fileObj.listFiles();
                    for (i = 0; i < files.length; i++) {
                        this.deleteFile(files[i]);
                    }
                }
                fileObj["delete"]();
            }
        },

        /**
         * Deletes any empty directories under the given directory.
         * The startDirIsJavaObject is private to this implementation's
         * recursion needs.
         */
        deleteEmptyDirs: function (startDir, startDirIsJavaObject) {
            var topDir = startDir,
                dirFileArray, i, fileObj;

            if (!startDirIsJavaObject) {
                topDir = new java.io.File(startDir);
            }

            if (topDir.exists()) {
                dirFileArray = topDir.listFiles();
                for (i = 0; i < dirFileArray.length; i++) {
                    fileObj = dirFileArray[i];
                    if (fileObj.isDirectory()) {
                        file.deleteEmptyDirs(fileObj, true);
                    }
                }

                //If the directory is empty now, delete it.
                if (topDir.listFiles().length === 0) {
                    file.deleteFile(String(topDir.getPath()));
                }
            }
        }
    };

    return file;
});

}

if(env === 'xpconnect') {
//Helper functions to deal with file I/O.

/*jslint plusplus: false */
/*global define, Components, xpcUtil */

define('xpconnect/file', ['prim'], function (prim) {
    var file,
        Cc = Components.classes,
        Ci = Components.interfaces,
        //Depends on xpcUtil which is set up in x.js
        xpfile = xpcUtil.xpfile;

    function mkFullDir(dirObj) {
        //1 is DIRECTORY_TYPE, 511 is 0777 permissions
        if (!dirObj.exists()) {
            dirObj.create(1, 511);
        }
    }

    file = {
        backSlashRegExp: /\\/g,

        exclusionRegExp: /^\./,

        getLineSeparator: function () {
            return file.lineSeparator;
        },

        lineSeparator: ('@mozilla.org/windows-registry-key;1' in Cc) ?
                        '\r\n' : '\n',

        exists: function (fileName) {
            return xpfile(fileName).exists();
        },

        parent: function (fileName) {
            return xpfile(fileName).parent;
        },

        normalize: function (fileName) {
            return file.absPath(fileName);
        },

        isFile: function (path) {
            return xpfile(path).isFile();
        },

        isDirectory: function (path) {
            return xpfile(path).isDirectory();
        },

        /**
         * Gets the absolute file path as a string, normalized
         * to using front slashes for path separators.
         * @param {java.io.File||String} file
         */
        absPath: function (fileObj) {
            if (typeof fileObj === "string") {
                fileObj = xpfile(fileObj);
            }
            return fileObj.path;
        },

        getFilteredFileList: function (/*String*/startDir, /*RegExp*/regExpFilters, /*boolean?*/makeUnixPaths, /*boolean?*/startDirIsObject) {
            //summary: Recurses startDir and finds matches to the files that match regExpFilters.include
            //and do not match regExpFilters.exclude. Or just one regexp can be passed in for regExpFilters,
            //and it will be treated as the "include" case.
            //Ignores files/directories that start with a period (.) unless exclusionRegExp
            //is set to another value.
            var files = [], topDir, regExpInclude, regExpExclude, dirFileArray,
                fileObj, filePath, ok, dirFiles;

            topDir = startDir;
            if (!startDirIsObject) {
                topDir = xpfile(startDir);
            }

            regExpInclude = regExpFilters.include || regExpFilters;
            regExpExclude = regExpFilters.exclude || null;

            if (topDir.exists()) {
                dirFileArray = topDir.directoryEntries;
                while (dirFileArray.hasMoreElements()) {
                    fileObj = dirFileArray.getNext().QueryInterface(Ci.nsILocalFile);
                    if (fileObj.isFile()) {
                        filePath = fileObj.path;
                        if (makeUnixPaths) {
                            if (filePath.indexOf("/") === -1) {
                                filePath = filePath.replace(/\\/g, "/");
                            }
                        }

                        ok = true;
                        if (regExpInclude) {
                            ok = filePath.match(regExpInclude);
                        }
                        if (ok && regExpExclude) {
                            ok = !filePath.match(regExpExclude);
                        }

                        if (ok && (!file.exclusionRegExp ||
                            !file.exclusionRegExp.test(fileObj.leafName))) {
                            files.push(filePath);
                        }
                    } else if (fileObj.isDirectory() &&
                              (!file.exclusionRegExp || !file.exclusionRegExp.test(fileObj.leafName))) {
                        dirFiles = this.getFilteredFileList(fileObj, regExpFilters, makeUnixPaths, true);
                        //Do not use push.apply for dir listings, can hit limit of max number
                        //of arguments to a function call, #921.
                        dirFiles.forEach(function (dirFile) {
                            files.push(dirFile);
                        });
                    }
                }
            }

            return files; //Array
        },

        copyDir: function (/*String*/srcDir, /*String*/destDir, /*RegExp?*/regExpFilter, /*boolean?*/onlyCopyNew) {
            //summary: copies files from srcDir to destDir using the regExpFilter to determine if the
            //file should be copied. Returns a list file name strings of the destinations that were copied.
            regExpFilter = regExpFilter || /\w/;

            var fileNames = file.getFilteredFileList(srcDir, regExpFilter, true),
            copiedFiles = [], i, srcFileName, destFileName;

            for (i = 0; i < fileNames.length; i += 1) {
                srcFileName = fileNames[i];
                destFileName = srcFileName.replace(srcDir, destDir);

                if (file.copyFile(srcFileName, destFileName, onlyCopyNew)) {
                    copiedFiles.push(destFileName);
                }
            }

            return copiedFiles.length ? copiedFiles : null; //Array or null
        },

        copyFile: function (/*String*/srcFileName, /*String*/destFileName, /*boolean?*/onlyCopyNew) {
            //summary: copies srcFileName to destFileName. If onlyCopyNew is set, it only copies the file if
            //srcFileName is newer than destFileName. Returns a boolean indicating if the copy occurred.
            var destFile = xpfile(destFileName),
            srcFile = xpfile(srcFileName);

            //logger.trace("Src filename: " + srcFileName);
            //logger.trace("Dest filename: " + destFileName);

            //If onlyCopyNew is true, then compare dates and only copy if the src is newer
            //than dest.
            if (onlyCopyNew) {
                if (destFile.exists() && destFile.lastModifiedTime >= srcFile.lastModifiedTime) {
                    return false; //Boolean
                }
            }

            srcFile.copyTo(destFile.parent, destFile.leafName);

            return true; //Boolean
        },

        /**
         * Renames a file. May fail if "to" already exists or is on another drive.
         */
        renameFile: function (from, to) {
            var toFile = xpfile(to);
            return xpfile(from).moveTo(toFile.parent, toFile.leafName);
        },

        readFile: xpcUtil.readFile,

        readFileAsync: function (path, encoding) {
            var d = prim();
            try {
                d.resolve(file.readFile(path, encoding));
            } catch (e) {
                d.reject(e);
            }
            return d.promise;
        },

        saveUtf8File: function (/*String*/fileName, /*String*/fileContents) {
            //summary: saves a file using UTF-8 encoding.
            file.saveFile(fileName, fileContents, "utf-8");
        },

        saveFile: function (/*String*/fileName, /*String*/fileContents, /*String?*/encoding) {
            var outStream, convertStream,
                fileObj = xpfile(fileName);

            mkFullDir(fileObj.parent);

            try {
                outStream = Cc['@mozilla.org/network/file-output-stream;1']
                             .createInstance(Ci.nsIFileOutputStream);
                //438 is decimal for 0777
                outStream.init(fileObj, 0x02 | 0x08 | 0x20, 511, 0);

                convertStream = Cc['@mozilla.org/intl/converter-output-stream;1']
                                  .createInstance(Ci.nsIConverterOutputStream);

                convertStream.init(outStream, encoding, 0, 0);
                convertStream.writeString(fileContents);
            } catch (e) {
                throw new Error((fileObj && fileObj.path || '') + ': ' + e);
            } finally {
                if (convertStream) {
                    convertStream.close();
                }
                if (outStream) {
                    outStream.close();
                }
            }
        },

        deleteFile: function (/*String*/fileName) {
            //summary: deletes a file or directory if it exists.
            var fileObj = xpfile(fileName);
            if (fileObj.exists()) {
                fileObj.remove(true);
            }
        },

        /**
         * Deletes any empty directories under the given directory.
         * The startDirIsJavaObject is private to this implementation's
         * recursion needs.
         */
        deleteEmptyDirs: function (startDir, startDirIsObject) {
            var topDir = startDir,
                dirFileArray, fileObj;

            if (!startDirIsObject) {
                topDir = xpfile(startDir);
            }

            if (topDir.exists()) {
                dirFileArray = topDir.directoryEntries;
                while (dirFileArray.hasMoreElements()) {
                    fileObj = dirFileArray.getNext().QueryInterface(Ci.nsILocalFile);

                    if (fileObj.isDirectory()) {
                        file.deleteEmptyDirs(fileObj, true);
                    }
                }

                //If the directory is empty now, delete it.
                dirFileArray = topDir.directoryEntries;
                if (!dirFileArray.hasMoreElements()) {
                    file.deleteFile(topDir.path);
                }
            }
        }
    };

    return file;
});

}

if(env === 'browser') {
/*global process */
define('browser/quit', function () {
    'use strict';
    return function (code) {
    };
});
}

if(env === 'node') {
/*global process */
define('node/quit', function () {
    'use strict';
    return function (code) {
        var draining = 0;
        var exit = function () {
            if (draining === 0) {
                process.exit(code);
            } else {
                draining -= 1;
            }
        };
        if (process.stdout.bufferSize) {
            draining += 1;
            process.stdout.once('drain', exit);
        }
        if (process.stderr.bufferSize) {
            draining += 1;
            process.stderr.once('drain', exit);
        }
        exit();
    };
});

}

if(env === 'rhino') {
/*global quit */
define('rhino/quit', function () {
    'use strict';
    return function (code) {
        return quit(code);
    };
});

}

if(env === 'xpconnect') {
/*global quit */
define('xpconnect/quit', function () {
    'use strict';
    return function (code) {
        return quit(code);
    };
});

}

if(env === 'browser') {
/*jslint strict: false */
/*global define: false, console: false */

define('browser/print', function () {
    function print(msg) {
        console.log(msg);
    }

    return print;
});

}

if(env === 'node') {
/*jslint strict: false */
/*global define: false, console: false */

define('node/print', function () {
    function print(msg) {
        console.log(msg);
    }

    return print;
});

}

if(env === 'rhino') {
/*jslint strict: false */
/*global define: false, print: false */

define('rhino/print', function () {
    return print;
});

}

if(env === 'xpconnect') {
/*jslint strict: false */
/*global define: false, print: false */

define('xpconnect/print', function () {
    return print;
});

}
/*jslint nomen: false, strict: false */
/*global define: false */

define('logger', ['env!env/print'], function (print) {
    var logger = {
        TRACE: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3,
        SILENT: 4,
        level: 0,
        logPrefix: "",

        logLevel: function( level ) {
            this.level = level;
        },

        trace: function (message) {
            if (this.level <= this.TRACE) {
                this._print(message);
            }
        },

        info: function (message) {
            if (this.level <= this.INFO) {
                this._print(message);
            }
        },

        warn: function (message) {
            if (this.level <= this.WARN) {
                this._print(message);
            }
        },

        error: function (message) {
            if (this.level <= this.ERROR) {
                this._print(message);
            }
        },

        _print: function (message) {
            this._sysPrint((this.logPrefix ? (this.logPrefix + " ") : "") + message);
        },

        _sysPrint: function (message) {
            print(message);
        }
    };

    return logger;
});
//Just a blank file to use when building the optimizer with the optimizer,
//so that the build does not attempt to inline some env modules,
//like Node's fs and path.

(function webpackUniversalModuleDefinition(root, factory) {
/* istanbul ignore next */
	if(typeof define === 'function' && define.amd)
		define('esprima', [], factory);
	else if(typeof exports === 'object' && typeof module === 'object')
			module.exports = factory();
/* istanbul ignore next */
	else if(typeof exports === 'object')
		exports["esprima"] = factory();
	else
		root["esprima"] = factory();
})(this, function() {
return /******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};

/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {

/******/ 		// Check if module is in cache
/* istanbul ignore if */
/******/ 		if(installedModules[moduleId])
/******/ 			return installedModules[moduleId].exports;

/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			exports: {},
/******/ 			id: moduleId,
/******/ 			loaded: false
/******/ 		};

/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);

/******/ 		// Flag the module as loaded
/******/ 		module.loaded = true;

/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}


/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;

/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;

/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";

/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(0);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	/*
	  Copyright JS Foundation and other contributors, https://js.foundation/

	  Redistribution and use in source and binary forms, with or without
	  modification, are permitted provided that the following conditions are met:

	    * Redistributions of source code must retain the above copyright
	      notice, this list of conditions and the following disclaimer.
	    * Redistributions in binary form must reproduce the above copyright
	      notice, this list of conditions and the following disclaimer in the
	      documentation and/or other materials provided with the distribution.

	  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
	  AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
	  IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
	  ARE DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
	  DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
	  (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
	  LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
	  ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
	  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
	  THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
	*/
	Object.defineProperty(exports, "__esModule", { value: true });
	var comment_handler_1 = __webpack_require__(1);
	var jsx_parser_1 = __webpack_require__(3);
	var parser_1 = __webpack_require__(8);
	var tokenizer_1 = __webpack_require__(15);
	function parse(code, options, delegate) {
	    var commentHandler = null;
	    var proxyDelegate = function (node, metadata) {
	        if (delegate) {
	            delegate(node, metadata);
	        }
	        if (commentHandler) {
	            commentHandler.visit(node, metadata);
	        }
	    };
	    var parserDelegate = (typeof delegate === 'function') ? proxyDelegate : null;
	    var collectComment = false;
	    if (options) {
	        collectComment = (typeof options.comment === 'boolean' && options.comment);
	        var attachComment = (typeof options.attachComment === 'boolean' && options.attachComment);
	        if (collectComment || attachComment) {
	            commentHandler = new comment_handler_1.CommentHandler();
	            commentHandler.attach = attachComment;
	            options.comment = true;
	            parserDelegate = proxyDelegate;
	        }
	    }
	    var isModule = false;
	    if (options && typeof options.sourceType === 'string') {
	        isModule = (options.sourceType === 'module');
	    }
	    var parser;
	    if (options && typeof options.jsx === 'boolean' && options.jsx) {
	        parser = new jsx_parser_1.JSXParser(code, options, parserDelegate);
	    }
	    else {
	        parser = new parser_1.Parser(code, options, parserDelegate);
	    }
	    var program = isModule ? parser.parseModule() : parser.parseScript();
	    var ast = program;
	    if (collectComment && commentHandler) {
	        ast.comments = commentHandler.comments;
	    }
	    if (parser.config.tokens) {
	        ast.tokens = parser.tokens;
	    }
	    if (parser.config.tolerant) {
	        ast.errors = parser.errorHandler.errors;
	    }
	    return ast;
	}
	exports.parse = parse;
	function parseModule(code, options, delegate) {
	    var parsingOptions = options || {};
	    parsingOptions.sourceType = 'module';
	    return parse(code, parsingOptions, delegate);
	}
	exports.parseModule = parseModule;
	function parseScript(code, options, delegate) {
	    var parsingOptions = options || {};
	    parsingOptions.sourceType = 'script';
	    return parse(code, parsingOptions, delegate);
	}
	exports.parseScript = parseScript;
	function tokenize(code, options, delegate) {
	    var tokenizer = new tokenizer_1.Tokenizer(code, options);
	    var tokens;
	    tokens = [];
	    try {
	        while (true) {
	            var token = tokenizer.getNextToken();
	            if (!token) {
	                break;
	            }
	            if (delegate) {
	                token = delegate(token);
	            }
	            tokens.push(token);
	        }
	    }
	    catch (e) {
	        tokenizer.errorHandler.tolerate(e);
	    }
	    if (tokenizer.errorHandler.tolerant) {
	        tokens.errors = tokenizer.errors();
	    }
	    return tokens;
	}
	exports.tokenize = tokenize;
	var syntax_1 = __webpack_require__(2);
	exports.Syntax = syntax_1.Syntax;
	// Sync with *.json manifests.
	exports.version = '4.0.1';


/***/ },
/* 1 */
/***/ function(module, exports, __webpack_require__) {

	"use strict";
	Object.defineProperty(exports, "__esModule", { value: true });
	var syntax_1 = __webpack_require__(2);
	var CommentHandler = (function () {
	    function CommentHandler() {
	        this.attach = false;
	        this.comments = [];
	        this.stack = [];
	        this.leading = [];
	        this.trailing = [];
	    }
	    CommentHandler.prototype.insertInnerComments = function (node, metadata) {
	        //  innnerComments for properties empty block
	        //  `function a() {/** comments **\/}`
	        if (node.type === syntax_1.Syntax.BlockStatement && node.body.length === 0) {
	            var innerComments = [];
	            for (var i = this.leading.length - 1; i >= 0; --i) {
	                var entry = this.leading[i];
	                if (metadata.end.offset >= entry.start) {
	                    innerComments.unshift(entry.comment);
	                    this.leading.splice(i, 1);
	                    this.trailing.splice(i, 1);
	                }
	            }
	            if (innerComments.length) {
	                node.innerComments = innerComments;
	            }
	        }
	    };
	    CommentHandler.prototype.findTrailingComments = function (metadata) {
	        var trailingComments = [];
	        if (this.trailing.length > 0) {
	            for (var i = this.trailing.length - 1; i >= 0; --i) {
	                var entry_1 = this.trailing[i];
	                if (entry_1.start >= metadata.end.offset) {
	                    trailingComments.unshift(entry_1.comment);
	                }
	            }
	            this.trailing.length = 0;
	            return trailingComments;
	        }
	        var entry = this.stack[this.stack.length - 1];
	        if (entry && entry.node.trailingComments) {
	            var firstComment = entry.node.trailingComments[0];
	            if (firstComment && firstComment.range[0] >= metadata.end.offset) {
	                trailingComments = entry.node.trailingComments;
	                delete entry.node.trailingComments;
	            }
	        }
	        return trailingComments;
	    };
	    CommentHandler.prototype.findLeadingComments = function (metadata) {
	        var leadingComments = [];
	        var target;
	        while (this.stack.length > 0) {
	            var entry = this.stack[this.stack.length - 1];
	            if (entry && entry.start >= metadata.start.offset) {
	                target = entry.node;
	                this.stack.pop();
	            }
	            else {
	                break;
	            }
	        }
	        if (target) {
	            var count = target.leadingComments ? target.leadingComments.length : 0;
	            for (var i = count - 1; i >= 0; --i) {
	                var comment = target.leadingComments[i];
	                if (comment.range[1] <= metadata.start.offset) {
	                    leadingComments.unshift(comment);
	                    target.leadingComments.splice(i, 1);
	                }
	            }
	            if (target.leadingComments && target.leadingComments.length === 0) {
	                delete target.leadingComments;
	            }
	            return leadingComments;
	        }
	        for (var i = this.leading.length - 1; i >= 0; --i) {
	            var entry = this.leading[i];
	            if (entry.start <= metadata.start.offset) {
	                leadingComments.unshift(entry.comment);
	                this.leading.splice(i, 1);
	            }
	        }
	        return leadingComments;
	    };
	    CommentHandler.prototype.visitNode = function (node, metadata) {
	        if (node.type === syntax_1.Syntax.Program && node.body.length > 0) {
	            return;
	        }
	        this.insertInnerComments(node, metadata);
	        var trailingComments = this.findTrailingComments(metadata);
	        var leadingComments = this.findLeadingComments(metadata);
	        if (leadingComments.length > 0) {
	            node.leadingComments = leadingComments;
	        }
	        if (trailingComments.length > 0) {
	            node.trailingComments = trailingComments;
	        }
	        this.stack.push({
	            node: node,
	            start: metadata.start.offset
	        });
	    };
	    CommentHandler.prototype.visitComment = function (node, metadata) {
	        var type = (node.type[0] === 'L') ? 'Line' : 'Block';
	        var comment = {
	            type: type,
	            value: node.value
	        };
	        if (node.range) {
	            comment.range = node.range;
	        }
	        if (node.loc) {
	            comment.loc = node.loc;
	        }
	        this.comments.push(comment);
	        if (this.attach) {
	            var entry = {
	                comment: {
	                    type: type,
	                    value: node.value,
	                    range: [metadata.start.offset, metadata.end.offset]
	                },
	                start: metadata.start.offset
	            };
	            if (node.loc) {
	                entry.comment.loc = node.loc;
	            }
	            node.type = type;
	            this.leading.push(entry);
	            this.trailing.push(entry);
	        }
	    };
	    CommentHandler.prototype.visit = function (node, metadata) {
	        if (node.type === 'LineComment') {
	            this.visitComment(node, metadata);
	        }
	        else if (node.type === 'BlockComment') {
	            this.visitComment(node, metadata);
	        }
	        else if (this.attach) {
	            this.visitNode(node, metadata);
	        }
	    };
	    return CommentHandler;
	}());
	exports.CommentHandler = CommentHandler;


/***/ },
/* 2 */
/***/ function(module, exports) {

	"use strict";
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.Syntax = {
	    AssignmentExpression: 'AssignmentExpression',
	    AssignmentPattern: 'AssignmentPattern',
	    ArrayExpression: 'ArrayExpression',
	    ArrayPattern: 'ArrayPattern',
	    ArrowFunctionExpression: 'ArrowFunctionExpression',
	    AwaitExpression: 'AwaitExpression',
	    BlockStatement: 'BlockStatement',
	    BinaryExpression: 'BinaryExpression',
	    BreakStatement: 'BreakStatement',
	    CallExpression: 'CallExpression',
	    CatchClause: 'CatchClause',
	    ClassBody: 'ClassBody',
	    ClassDeclaration: 'ClassDeclaration',
	    ClassExpression: 'ClassExpression',
	    ConditionalExpression: 'ConditionalExpression',
	    ContinueStatement: 'ContinueStatement',
	    DoWhileStatement: 'DoWhileStatement',
	    DebuggerStatement: 'DebuggerStatement',
	    EmptyStatement: 'EmptyStatement',
	    ExportAllDeclaration: 'ExportAllDeclaration',
	    ExportDefaultDeclaration: 'ExportDefaultDeclaration',
	    ExportNamedDeclaration: 'ExportNamedDeclaration',
	    ExportSpecifier: 'ExportSpecifier',
	    ExpressionStatement: 'ExpressionStatement',
	    ForStatement: 'ForStatement',
	    ForOfStatement: 'ForOfStatement',
	    ForInStatement: 'ForInStatement',
	    FunctionDeclaration: 'FunctionDeclaration',
	    FunctionExpression: 'FunctionExpression',
	    Identifier: 'Identifier',
	    IfStatement: 'IfStatement',
	    ImportDeclaration: 'ImportDeclaration',
	    ImportDefaultSpecifier: 'ImportDefaultSpecifier',
	    ImportNamespaceSpecifier: 'ImportNamespaceSpecifier',
	    ImportSpecifier: 'ImportSpecifier',
	    Literal: 'Literal',
	    LabeledStatement: 'LabeledStatement',
	    LogicalExpression: 'LogicalExpression',
	    MemberExpression: 'MemberExpression',
	    MetaProperty: 'MetaProperty',
	    MethodDefinition: 'MethodDefinition',
	    NewExpression: 'NewExpression',
	    ObjectExpression: 'ObjectExpression',
	    ObjectPattern: 'ObjectPattern',
	    Program: 'Program',
	    Property: 'Property',
	    RestElement: 'RestElement',
	    ReturnStatement: 'ReturnStatement',
	    SequenceExpression: 'SequenceExpression',
	    SpreadElement: 'SpreadElement',
	    Super: 'Super',
	    SwitchCase: 'SwitchCase',
	    SwitchStatement: 'SwitchStatement',
	    TaggedTemplateExpression: 'TaggedTemplateExpression',
	    TemplateElement: 'TemplateElement',
	    TemplateLiteral: 'TemplateLiteral',
	    ThisExpression: 'ThisExpression',
	    ThrowStatement: 'ThrowStatement',
	    TryStatement: 'TryStatement',
	    UnaryExpression: 'UnaryExpression',
	    UpdateExpression: 'UpdateExpression',
	    VariableDeclaration: 'VariableDeclaration',
	    VariableDeclarator: 'VariableDeclarator',
	    WhileStatement: 'WhileStatement',
	    WithStatement: 'WithStatement',
	    YieldExpression: 'YieldExpression'
	};


/***/ },
/* 3 */
/***/ function(module, exports, __webpack_require__) {

	"use strict";
/* istanbul ignore next */
	var __extends = (this && this.__extends) || (function () {
	    var extendStatics = Object.setPrototypeOf ||
	        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
	        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
	    return function (d, b) {
	        extendStatics(d, b);
	        function __() { this.constructor = d; }
	        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
	    };
	})();
	Object.defineProperty(exports, "__esModule", { value: true });
	var character_1 = __webpack_require__(4);
	var JSXNode = __webpack_require__(5);
	var jsx_syntax_1 = __webpack_require__(6);
	var Node = __webpack_require__(7);
	var parser_1 = __webpack_require__(8);
	var token_1 = __webpack_require__(13);
	var xhtml_entities_1 = __webpack_require__(14);
	token_1.TokenName[100 /* Identifier */] = 'JSXIdentifier';
	token_1.TokenName[101 /* Text */] = 'JSXText';
	// Fully qualified element name, e.g. <svg:path> returns "svg:path"
	function getQualifiedElementName(elementName) {
	    var qualifiedName;
	    switch (elementName.type) {
	        case jsx_syntax_1.JSXSyntax.JSXIdentifier:
	            var id = elementName;
	            qualifiedName = id.name;
	            break;
	        case jsx_syntax_1.JSXSyntax.JSXNamespacedName:
	            var ns = elementName;
	            qualifiedName = getQualifiedElementName(ns.namespace) + ':' +
	                getQualifiedElementName(ns.name);
	            break;
	        case jsx_syntax_1.JSXSyntax.JSXMemberExpression:
	            var expr = elementName;
	            qualifiedName = getQualifiedElementName(expr.object) + '.' +
	                getQualifiedElementName(expr.property);
	            break;
	        /* istanbul ignore next */
	        default:
	            break;
	    }
	    return qualifiedName;
	}
	var JSXParser = (function (_super) {
	    __extends(JSXParser, _super);
	    function JSXParser(code, options, delegate) {
	        return _super.call(this, code, options, delegate) || this;
	    }
	    JSXParser.prototype.parsePrimaryExpression = function () {
	        return this.match('<') ? this.parseJSXRoot() : _super.prototype.parsePrimaryExpression.call(this);
	    };
	    JSXParser.prototype.startJSX = function () {
	        // Unwind the scanner before the lookahead token.
	        this.scanner.index = this.startMarker.index;
	        this.scanner.lineNumber = this.startMarker.line;
	        this.scanner.lineStart = this.startMarker.index - this.startMarker.column;
	    };
	    JSXParser.prototype.finishJSX = function () {
	        // Prime the next lookahead.
	        this.nextToken();
	    };
	    JSXParser.prototype.reenterJSX = function () {
	        this.startJSX();
	        this.expectJSX('}');
	        // Pop the closing '}' added from the lookahead.
	        if (this.config.tokens) {
	            this.tokens.pop();
	        }
	    };
	    JSXParser.prototype.createJSXNode = function () {
	        this.collectComments();
	        return {
	            index: this.scanner.index,
	            line: this.scanner.lineNumber,
	            column: this.scanner.index - this.scanner.lineStart
	        };
	    };
	    JSXParser.prototype.createJSXChildNode = function () {
	        return {
	            index: this.scanner.index,
	            line: this.scanner.lineNumber,
	            column: this.scanner.index - this.scanner.lineStart
	        };
	    };
	    JSXParser.prototype.scanXHTMLEntity = function (quote) {
	        var result = '&';
	        var valid = true;
	        var terminated = false;
	        var numeric = false;
	        var hex = false;
	        while (!this.scanner.eof() && valid && !terminated) {
	            var ch = this.scanner.source[this.scanner.index];
	            if (ch === quote) {
	                break;
	            }
	            terminated = (ch === ';');
	            result += ch;
	            ++this.scanner.index;
	            if (!terminated) {
	                switch (result.length) {
	                    case 2:
	                        // e.g. '&#123;'
	                        numeric = (ch === '#');
	                        break;
	                    case 3:
	                        if (numeric) {
	                            // e.g. '&#x41;'
	                            hex = (ch === 'x');
	                            valid = hex || character_1.Character.isDecimalDigit(ch.charCodeAt(0));
	                            numeric = numeric && !hex;
	                        }
	                        break;
	                    default:
	                        valid = valid && !(numeric && !character_1.Character.isDecimalDigit(ch.charCodeAt(0)));
	                        valid = valid && !(hex && !character_1.Character.isHexDigit(ch.charCodeAt(0)));
	                        break;
	                }
	            }
	        }
	        if (valid && terminated && result.length > 2) {
	            // e.g. '&#x41;' becomes just '#x41'
	            var str = result.substr(1, result.length - 2);
	            if (numeric && str.length > 1) {
	                result = String.fromCharCode(parseInt(str.substr(1), 10));
	            }
	            else if (hex && str.length > 2) {
	                result = String.fromCharCode(parseInt('0' + str.substr(1), 16));
	            }
	            else if (!numeric && !hex && xhtml_entities_1.XHTMLEntities[str]) {
	                result = xhtml_entities_1.XHTMLEntities[str];
	            }
	        }
	        return result;
	    };
	    // Scan the next JSX token. This replaces Scanner#lex when in JSX mode.
	    JSXParser.prototype.lexJSX = function () {
	        var cp = this.scanner.source.charCodeAt(this.scanner.index);
	        // < > / : = { }
	        if (cp === 60 || cp === 62 || cp === 47 || cp === 58 || cp === 61 || cp === 123 || cp === 125) {
	            var value = this.scanner.source[this.scanner.index++];
	            return {
	                type: 7 /* Punctuator */,
	                value: value,
	                lineNumber: this.scanner.lineNumber,
	                lineStart: this.scanner.lineStart,
	                start: this.scanner.index - 1,
	                end: this.scanner.index
	            };
	        }
	        // " '
	        if (cp === 34 || cp === 39) {
	            var start = this.scanner.index;
	            var quote = this.scanner.source[this.scanner.index++];
	            var str = '';
	            while (!this.scanner.eof()) {
	                var ch = this.scanner.source[this.scanner.index++];
	                if (ch === quote) {
	                    break;
	                }
	                else if (ch === '&') {
	                    str += this.scanXHTMLEntity(quote);
	                }
	                else {
	                    str += ch;
	                }
	            }
	            return {
	                type: 8 /* StringLiteral */,
	                value: str,
	                lineNumber: this.scanner.lineNumber,
	                lineStart: this.scanner.lineStart,
	                start: start,
	                end: this.scanner.index
	            };
	        }
	        // ... or .
	        if (cp === 46) {
	            var n1 = this.scanner.source.charCodeAt(this.scanner.index + 1);
	            var n2 = this.scanner.source.charCodeAt(this.scanner.index + 2);
	            var value = (n1 === 46 && n2 === 46) ? '...' : '.';
	            var start = this.scanner.index;
	            this.scanner.index += value.length;
	            return {
	                type: 7 /* Punctuator */,
	                value: value,
	                lineNumber: this.scanner.lineNumber,
	                lineStart: this.scanner.lineStart,
	                start: start,
	                end: this.scanner.index
	            };
	        }
	        // `
	        if (cp === 96) {
	            // Only placeholder, since it will be rescanned as a real assignment expression.
	            return {
	                type: 10 /* Template */,
	                value: '',
	                lineNumber: this.scanner.lineNumber,
	                lineStart: this.scanner.lineStart,
	                start: this.scanner.index,
	                end: this.scanner.index
	            };
	        }
	        // Identifer can not contain backslash (char code 92).
	        if (character_1.Character.isIdentifierStart(cp) && (cp !== 92)) {
	            var start = this.scanner.index;
	            ++this.scanner.index;
	            while (!this.scanner.eof()) {
	                var ch = this.scanner.source.charCodeAt(this.scanner.index);
	                if (character_1.Character.isIdentifierPart(ch) && (ch !== 92)) {
	                    ++this.scanner.index;
	                }
	                else if (ch === 45) {
	                    // Hyphen (char code 45) can be part of an identifier.
	                    ++this.scanner.index;
	                }
	                else {
	                    break;
	                }
	            }
	            var id = this.scanner.source.slice(start, this.scanner.index);
	            return {
	                type: 100 /* Identifier */,
	                value: id,
	                lineNumber: this.scanner.lineNumber,
	                lineStart: this.scanner.lineStart,
	                start: start,
	                end: this.scanner.index
	            };
	        }
	        return this.scanner.lex();
	    };
	    JSXParser.prototype.nextJSXToken = function () {
	        this.collectComments();
	        this.startMarker.index = this.scanner.index;
	        this.startMarker.line = this.scanner.lineNumber;
	        this.startMarker.column = this.scanner.index - this.scanner.lineStart;
	        var token = this.lexJSX();
	        this.lastMarker.index = this.scanner.index;
	        this.lastMarker.line = this.scanner.lineNumber;
	        this.lastMarker.column = this.scanner.index - this.scanner.lineStart;
	        if (this.config.tokens) {
	            this.tokens.push(this.convertToken(token));
	        }
	        return token;
	    };
	    JSXParser.prototype.nextJSXText = function () {
	        this.startMarker.index = this.scanner.index;
	        this.startMarker.line = this.scanner.lineNumber;
	        this.startMarker.column = this.scanner.index - this.scanner.lineStart;
	        var start = this.scanner.index;
	        var text = '';
	        while (!this.scanner.eof()) {
	            var ch = this.scanner.source[this.scanner.index];
	            if (ch === '{' || ch === '<') {
	                break;
	            }
	            ++this.scanner.index;
	            text += ch;
	            if (character_1.Character.isLineTerminator(ch.charCodeAt(0))) {
	                ++this.scanner.lineNumber;
	                if (ch === '\r' && this.scanner.source[this.scanner.index] === '\n') {
	                    ++this.scanner.index;
	                }
	                this.scanner.lineStart = this.scanner.index;
	            }
	        }
	        this.lastMarker.index = this.scanner.index;
	        this.lastMarker.line = this.scanner.lineNumber;
	        this.lastMarker.column = this.scanner.index - this.scanner.lineStart;
	        var token = {
	            type: 101 /* Text */,
	            value: text,
	            lineNumber: this.scanner.lineNumber,
	            lineStart: this.scanner.lineStart,
	            start: start,
	            end: this.scanner.index
	        };
	        if ((text.length > 0) && this.config.tokens) {
	            this.tokens.push(this.convertToken(token));
	        }
	        return token;
	    };
	    JSXParser.prototype.peekJSXToken = function () {
	        var state = this.scanner.saveState();
	        this.scanner.scanComments();
	        var next = this.lexJSX();
	        this.scanner.restoreState(state);
	        return next;
	    };
	    // Expect the next JSX token to match the specified punctuator.
	    // If not, an exception will be thrown.
	    JSXParser.prototype.expectJSX = function (value) {
	        var token = this.nextJSXToken();
	        if (token.type !== 7 /* Punctuator */ || token.value !== value) {
	            this.throwUnexpectedToken(token);
	        }
	    };
	    // Return true if the next JSX token matches the specified punctuator.
	    JSXParser.prototype.matchJSX = function (value) {
	        var next = this.peekJSXToken();
	        return next.type === 7 /* Punctuator */ && next.value === value;
	    };
	    JSXParser.prototype.parseJSXIdentifier = function () {
	        var node = this.createJSXNode();
	        var token = this.nextJSXToken();
	        if (token.type !== 100 /* Identifier */) {
	            this.throwUnexpectedToken(token);
	        }
	        return this.finalize(node, new JSXNode.JSXIdentifier(token.value));
	    };
	    JSXParser.prototype.parseJSXElementName = function () {
	        var node = this.createJSXNode();
	        var elementName = this.parseJSXIdentifier();
	        if (this.matchJSX(':')) {
	            var namespace = elementName;
	            this.expectJSX(':');
	            var name_1 = this.parseJSXIdentifier();
	            elementName = this.finalize(node, new JSXNode.JSXNamespacedName(namespace, name_1));
	        }
	        else if (this.matchJSX('.')) {
	            while (this.matchJSX('.')) {
	                var object = elementName;
	                this.expectJSX('.');
	                var property = this.parseJSXIdentifier();
	                elementName = this.finalize(node, new JSXNode.JSXMemberExpression(object, property));
	            }
	        }
	        return elementName;
	    };
	    JSXParser.prototype.parseJSXAttributeName = function () {
	        var node = this.createJSXNode();
	        var attributeName;
	        var identifier = this.parseJSXIdentifier();
	        if (this.matchJSX(':')) {
	            var namespace = identifier;
	            this.expectJSX(':');
	            var name_2 = this.parseJSXIdentifier();
	            attributeName = this.finalize(node, new JSXNode.JSXNamespacedName(namespace, name_2));
	        }
	        else {
	            attributeName = identifier;
	        }
	        return attributeName;
	    };
	    JSXParser.prototype.parseJSXStringLiteralAttribute = function () {
	        var node = this.createJSXNode();
	        var token = this.nextJSXToken();
	        if (token.type !== 8 /* StringLiteral */) {
	            this.throwUnexpectedToken(token);
	        }
	        var raw = this.getTokenRaw(token);
	        return this.finalize(node, new Node.Literal(token.value, raw));
	    };
	    JSXParser.prototype.parseJSXExpressionAttribute = function () {
	        var node = this.createJSXNode();
	        this.expectJSX('{');
	        this.finishJSX();
	        if (this.match('}')) {
	            this.tolerateError('JSX attributes must only be assigned a non-empty expression');
	        }
	        var expression = this.parseAssignmentExpression();
	        this.reenterJSX();
	        return this.finalize(node, new JSXNode.JSXExpressionContainer(expression));
	    };
	    JSXParser.prototype.parseJSXAttributeValue = function () {
	        return this.matchJSX('{') ? this.parseJSXExpressionAttribute() :
	            this.matchJSX('<') ? this.parseJSXElement() : this.parseJSXStringLiteralAttribute();
	    };
	    JSXParser.prototype.parseJSXNameValueAttribute = function () {
	        var node = this.createJSXNode();
	        var name = this.parseJSXAttributeName();
	        var value = null;
	        if (this.matchJSX('=')) {
	            this.expectJSX('=');
	            value = this.parseJSXAttributeValue();
	        }
	        return this.finalize(node, new JSXNode.JSXAttribute(name, value));
	    };
	    JSXParser.prototype.parseJSXSpreadAttribute = function () {
	        var node = this.createJSXNode();
	        this.expectJSX('{');
	        this.expectJSX('...');
	        this.finishJSX();
	        var argument = this.parseAssignmentExpression();
	        this.reenterJSX();
	        return this.finalize(node, new JSXNode.JSXSpreadAttribute(argument));
	    };
	    JSXParser.prototype.parseJSXAttributes = function () {
	        var attributes = [];
	        while (!this.matchJSX('/') && !this.matchJSX('>')) {
	            var attribute = this.matchJSX('{') ? this.parseJSXSpreadAttribute() :
	                this.parseJSXNameValueAttribute();
	            attributes.push(attribute);
	        }
	        return attributes;
	    };
	    JSXParser.prototype.parseJSXOpeningElement = function () {
	        var node = this.createJSXNode();
	        this.expectJSX('<');
	        var name = this.parseJSXElementName();
	        var attributes = this.parseJSXAttributes();
	        var selfClosing = this.matchJSX('/');
	        if (selfClosing) {
	            this.expectJSX('/');
	        }
	        this.expectJSX('>');
	        return this.finalize(node, new JSXNode.JSXOpeningElement(name, selfClosing, attributes));
	    };
	    JSXParser.prototype.parseJSXBoundaryElement = function () {
	        var node = this.createJSXNode();
	        this.expectJSX('<');
	        if (this.matchJSX('/')) {
	            this.expectJSX('/');
	            var name_3 = this.parseJSXElementName();
	            this.expectJSX('>');
	            return this.finalize(node, new JSXNode.JSXClosingElement(name_3));
	        }
	        var name = this.parseJSXElementName();
	        var attributes = this.parseJSXAttributes();
	        var selfClosing = this.matchJSX('/');
	        if (selfClosing) {
	            this.expectJSX('/');
	        }
	        this.expectJSX('>');
	        return this.finalize(node, new JSXNode.JSXOpeningElement(name, selfClosing, attributes));
	    };
	    JSXParser.prototype.parseJSXEmptyExpression = function () {
	        var node = this.createJSXChildNode();
	        this.collectComments();
	        this.lastMarker.index = this.scanner.index;
	        this.lastMarker.line = this.scanner.lineNumber;
	        this.lastMarker.column = this.scanner.index - this.scanner.lineStart;
	        return this.finalize(node, new JSXNode.JSXEmptyExpression());
	    };
	    JSXParser.prototype.parseJSXExpressionContainer = function () {
	        var node = this.createJSXNode();
	        this.expectJSX('{');
	        var expression;
	        if (this.matchJSX('}')) {
	            expression = this.parseJSXEmptyExpression();
	            this.expectJSX('}');
	        }
	        else {
	            this.finishJSX();
	            expression = this.parseAssignmentExpression();
	            this.reenterJSX();
	        }
	        return this.finalize(node, new JSXNode.JSXExpressionContainer(expression));
	    };
	    JSXParser.prototype.parseJSXChildren = function () {
	        var children = [];
	        while (!this.scanner.eof()) {
	            var node = this.createJSXChildNode();
	            var token = this.nextJSXText();
	            if (token.start < token.end) {
	                var raw = this.getTokenRaw(token);
	                var child = this.finalize(node, new JSXNode.JSXText(token.value, raw));
	                children.push(child);
	            }
	            if (this.scanner.source[this.scanner.index] === '{') {
	                var container = this.parseJSXExpressionContainer();
	                children.push(container);
	            }
	            else {
	                break;
	            }
	        }
	        return children;
	    };
	    JSXParser.prototype.parseComplexJSXElement = function (el) {
	        var stack = [];
	        while (!this.scanner.eof()) {
	            el.children = el.children.concat(this.parseJSXChildren());
	            var node = this.createJSXChildNode();
	            var element = this.parseJSXBoundaryElement();
	            if (element.type === jsx_syntax_1.JSXSyntax.JSXOpeningElement) {
	                var opening = element;
	                if (opening.selfClosing) {
	                    var child = this.finalize(node, new JSXNode.JSXElement(opening, [], null));
	                    el.children.push(child);
	                }
	                else {
	                    stack.push(el);
	                    el = { node: node, opening: opening, closing: null, children: [] };
	                }
	            }
	            if (element.type === jsx_syntax_1.JSXSyntax.JSXClosingElement) {
	                el.closing = element;
	                var open_1 = getQualifiedElementName(el.opening.name);
	                var close_1 = getQualifiedElementName(el.closing.name);
	                if (open_1 !== close_1) {
	                    this.tolerateError('Expected corresponding JSX closing tag for %0', open_1);
	                }
	                if (stack.length > 0) {
	                    var child = this.finalize(el.node, new JSXNode.JSXElement(el.opening, el.children, el.closing));
	                    el = stack[stack.length - 1];
	                    el.children.push(child);
	                    stack.pop();
	                }
	                else {
	                    break;
	                }
	            }
	        }
	        return el;
	    };
	    JSXParser.prototype.parseJSXElement = function () {
	        var node = this.createJSXNode();
	        var opening = this.parseJSXOpeningElement();
	        var children = [];
	        var closing = null;
	        if (!opening.selfClosing) {
	            var el = this.parseComplexJSXElement({ node: node, opening: opening, closing: closing, children: children });
	            children = el.children;
	            closing = el.closing;
	        }
	        return this.finalize(node, new JSXNode.JSXElement(opening, children, closing));
	    };
	    JSXParser.prototype.parseJSXRoot = function () {
	        // Pop the opening '<' added from the lookahead.
	        if (this.config.tokens) {
	            this.tokens.pop();
	        }
	        this.startJSX();
	        var element = this.parseJSXElement();
	        this.finishJSX();
	        return element;
	    };
	    JSXParser.prototype.isStartOfExpression = function () {
	        return _super.prototype.isStartOfExpression.call(this) || this.match('<');
	    };
	    return JSXParser;
	}(parser_1.Parser));
	exports.JSXParser = JSXParser;


/***/ },
/* 4 */
/***/ function(module, exports) {

	"use strict";
	Object.defineProperty(exports, "__esModule", { value: true });
	// See also tools/generate-unicode-regex.js.
	var Regex = {
	    // Unicode v8.0.0 NonAsciiIdentifierStart:
	    NonAsciiIdentifierStart: /[\xAA\x