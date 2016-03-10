var util_1 = require('../util');
var Observable_1 = require('rxjs/Observable');
exports.getPlugin = function (pluginRef) {
    return util_1.get(window, pluginRef);
};
exports.isInstalled = function (pluginRef) {
    return !!exports.getPlugin(pluginRef);
};
exports.pluginWarn = function (pluginObj, method) {
    var pluginName = pluginObj.name;
    var plugin = pluginObj.plugin;
    if (method) {
        console.warn('Native: tried calling ' + pluginName + '.' + method + ', but the ' + pluginName + ' plugin is not installed.');
    }
    else {
        console.warn('Native: tried accessing the ' + pluginName + ' plugin but it\'s not installed.');
    }
    console.warn('Install the ' + pluginName + ' plugin: \'cordova plugin add ' + plugin + '\'');
};
exports.cordovaWarn = function (pluginName, method) {
    if (method) {
        console.warn('Native: tried calling ' + pluginName + '.' + method + ', but Cordova is not available. Make sure to include cordova.js or run in a device/simulator');
    }
    else {
        console.warn('Native: tried accessing the ' + pluginName + ' plugin but Cordova is not available. Make sure to include cordova.js or run in a device/simulator');
    }
};
function callCordovaPlugin(pluginObj, methodName, args, opts, resolve, reject) {
    // Try to figure out where the success/error callbacks need to be bound
    // to our promise resolve/reject handlers.
    if (opts === void 0) { opts = {}; }
    // If the plugin method expects myMethod(success, err, options)
    if (opts.callbackOrder == 'reverse') {
        // Get those arguments in the order [resolve, reject, ...restOfArgs]
        args.unshift(reject);
        args.unshift(resolve);
    }
    else if (typeof opts.successIndex !== 'undefined' || typeof opts.errorIndex !== 'undefined') {
        // If we've specified a success/error index
        args.splice(opts.successIndex, 0, resolve);
        args.splice(opts.errorIndex, 0, reject);
    }
    else {
        // Otherwise, let's tack them on to the end of the argument list
        // which is 90% of cases
        args.push(resolve);
        args.push(reject);
    }
    var pluginInstance = exports.getPlugin(pluginObj.pluginRef);
    if (!pluginInstance) {
        // Do this check in here in the case that the Web API for this plugin is available (for example, Geolocation).
        if (!window.cordova) {
            exports.cordovaWarn(pluginObj.name, methodName);
            reject && reject({
                error: 'cordova_not_available'
            });
            return;
        }
        exports.pluginWarn(pluginObj, methodName);
        reject && reject({
            error: 'plugin_not_installed'
        });
        return;
    }
    // console.log('Cordova calling', pluginObj.name, methodName, args);
    // TODO: Illegal invocation needs window context
    return util_1.get(window, pluginObj.pluginRef)[methodName].apply(pluginInstance, args);
}
function getPromise(cb) {
    if (window.Promise) {
        // console.log('Native promises available...');
        return new Promise(function (resolve, reject) {
            cb(resolve, reject);
        });
    }
    else if (window.angular) {
        var $q_1 = window.angular.injector(['ng']).get('$q');
        // console.log('Loaded $q', $q);
        return $q_1(function (resolve, reject) {
            cb(resolve, reject);
        });
    }
    else {
        console.error('No Promise support or polyfill found. To enable Ionic Native support, please add the es6-promise polyfill before this script, or run with a library like Angular 1/2 or on a recent browser.');
    }
}
function wrapPromise(pluginObj, methodName, args, opts) {
    if (opts === void 0) { opts = {}; }
    return getPromise(function (resolve, reject) {
        callCordovaPlugin(pluginObj, methodName, args, opts, resolve, reject);
    });
}
function wrapObservable(pluginObj, methodName, args, opts) {
    if (opts === void 0) { opts = {}; }
    return new Observable_1.Observable(function (observer) {
        var pluginResult = callCordovaPlugin(pluginObj, methodName, args, opts, observer.next.bind(observer), observer.error.bind(observer));
        return function () {
            try {
                if (opts.clearWithArgs) {
                    return util_1.get(window, pluginObj.pluginRef)[opts.clearFunction].apply(pluginObj, args);
                }
                return util_1.get(window, pluginObj.pluginRef)[opts.clearFunction].call(pluginObj, pluginResult);
            }
            catch (e) {
                console.warn('Unable to clear the previous observable watch for', pluginObj.name, methodName);
                console.error(e);
            }
        };
    });
}
exports.wrap = function (pluginObj, methodName, opts) {
    if (opts === void 0) { opts = {}; }
    return function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i - 0] = arguments[_i];
        }
        if (opts.sync) {
            return callCordovaPlugin(pluginObj, methodName, args, opts);
        }
        else if (opts.observable) {
            return wrapObservable(pluginObj, methodName, args, opts);
        }
        else {
            return wrapPromise(pluginObj, methodName, args, opts);
        }
    };
};
/**
 * Class decorator specifying Plugin metadata. Required for all plugins.
 */
function Plugin(config) {
    return function (cls) {
        // Add these fields to the class
        for (var k in config) {
            cls[k] = config[k];
        }
        cls['installed'] = function () {
            return !!exports.getPlugin(config.pluginRef);
        };
        return cls;
    };
}
exports.Plugin = Plugin;
/**
 * Wrap a stub function in a call to a Cordova plugin, checking if both Cordova
 * and the required plugin are installed.
 */
function Cordova(opts) {
    if (opts === void 0) { opts = {}; }
    return function (target, methodName, descriptor) {
        var originalMethod = descriptor.value;
        return {
            value: function () {
                var args = [];
                for (var _i = 0; _i < arguments.length; _i++) {
                    args[_i - 0] = arguments[_i];
                }
                return exports.wrap(this, methodName, opts).apply(this, args);
            }
        };
    };
}
exports.Cordova = Cordova;
/**
 * Before calling the original method, ensure Cordova and the plugin are installed.
 */
function CordovaProperty(target, key, descriptor) {
    var originalMethod = descriptor.get;
    descriptor.get = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i - 0] = arguments[_i];
        }
        // console.log('Calling', this);
        if (!window.cordova) {
            exports.cordovaWarn(this.name, null);
            return {};
        }
        var pluginInstance = exports.getPlugin(this.pluginRef);
        if (!pluginInstance) {
            exports.pluginWarn(this, key);
            return {};
        }
        return originalMethod.apply(this, args);
    };
    return descriptor;
}
exports.CordovaProperty = CordovaProperty;
//# sourceMappingURL=plugin.js.map