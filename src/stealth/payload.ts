/**
 * Stealth payload — vendored evasions adapted from puppeteer-extra-plugin-stealth (MIT).
 * Original: https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth
 *
 * This payload is injected into every new document via Page.addScriptToEvaluateOnNewDocument
 * BEFORE any page script runs. Each evasion is annotated with `// @evasion: <name>` so
 * future Chrome-version drift is debuggable.
 *
 * Why vendored, not depended-on: puppeteer-extra-plugin-stealth pulls in puppeteer-extra
 * which pulls in puppeteer (~60 MB). Surfagent is CDP-direct; we want ~400 lines of pure
 * JS we can patch in-place, not a peer-dep tree.
 */

export const STEALTH_PAYLOAD: string = `
(() => {
  'use strict';

  // ---- helpers (shared by evasions) ----------------------------------------
  const utils = {
    // Replace a property with a stealthy getter — Function.prototype.toString is also patched
    // so introspection of the getter looks native.
    replaceProperty(obj, propName, descriptor) {
      try {
        Object.defineProperty(obj, propName, { ...Object.getOwnPropertyDescriptor(obj, propName), ...descriptor });
      } catch (e) { /* ignore — some descriptors are read-only */ }
    },
    // Stash original function so .toString() can still return "[native code]"
    patchToString(fn, originalSource) {
      const originalToString = Function.prototype.toString;
      const proxy = new Proxy(fn, {
        get(target, prop, receiver) {
          if (prop === 'toString') {
            return new Proxy(originalToString, {
              apply(_t, _this, args) {
                if (_this === proxy) return originalSource;
                return originalToString.apply(_this, args);
              }
            });
          }
          return Reflect.get(target, prop, receiver);
        }
      });
      return proxy;
    },
    makeNativeString(name) {
      return \`function \${name || ''}() { [native code] }\`;
    },
    mockGetter(obj, propName, returnValue) {
      const getter = function() { return returnValue; };
      try {
        Object.defineProperty(obj, propName, {
          configurable: true,
          enumerable: true,
          get: getter
        });
      } catch (e) {}
    },
  };

  // @evasion: navigator.webdriver --------------------------------------------
  // Cloudflare Turnstile, DataDome, PerimeterX all check this first.
  // Default for CDP-attached Chrome is \`true\`. Mask back to undefined.
  try {
    if (navigator.webdriver !== undefined) {
      Object.defineProperty(Navigator.prototype, 'webdriver', {
        configurable: true,
        enumerable: true,
        get: function() { return undefined; },
      });
    }
  } catch (e) {}

  // @evasion: chrome.runtime --------------------------------------------------
  // Headless Chrome doesn't populate window.chrome. Realistic shape required —
  // detectors check for the OnInstalledReason / OnRestartRequiredReason enums.
  try {
    if (!window.chrome) {
      Object.defineProperty(window, 'chrome', {
        writable: true,
        enumerable: true,
        configurable: false,
        value: {},
      });
    }
    if (!window.chrome.runtime) {
      const StubError = function() {
        const e = new Error('Could not establish connection. Receiving end does not exist.');
        return e;
      };
      window.chrome.runtime = {
        OnInstalledReason: {
          CHROME_UPDATE: 'chrome_update',
          INSTALL: 'install',
          SHARED_MODULE_UPDATE: 'shared_module_update',
          UPDATE: 'update',
        },
        OnRestartRequiredReason: {
          APP_UPDATE: 'app_update',
          OS_UPDATE: 'os_update',
          PERIODIC: 'periodic',
        },
        PlatformArch: {
          ARM: 'arm', ARM64: 'arm64', MIPS: 'mips', MIPS64: 'mips64',
          X86_32: 'x86-32', X86_64: 'x86-64',
        },
        PlatformNaclArch: { ARM: 'arm', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
        PlatformOs: {
          ANDROID: 'android', CROS: 'cros', LINUX: 'linux', MAC: 'mac',
          OPENBSD: 'openbsd', WIN: 'win', FUCHSIA: 'fuchsia',
        },
        RequestUpdateCheckStatus: {
          NO_UPDATE: 'no_update', THROTTLED: 'throttled', UPDATE_AVAILABLE: 'update_available',
        },
        connect: function() { throw StubError(); },
        sendMessage: function() { throw StubError(); },
        id: undefined,
      };
    }
  } catch (e) {}

  // @evasion: chrome.app, chrome.csi, chrome.loadTimes ------------------------
  // Older but still-checked. Must look like [native code] in toString.
  try {
    if (!window.chrome.app) {
      window.chrome.app = {
        InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
        RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
        getDetails: function getDetails() { return null; },
        getIsInstalled: function getIsInstalled() { return false; },
        isInstalled: false,
        get runningState() { return 'cannot_run'; },
      };
    }
    if (!window.chrome.csi) {
      window.chrome.csi = function csi() {
        return { onloadT: Date.now(), pageT: performance.now(), startE: Date.now() - 1000, tran: 15 };
      };
    }
    if (!window.chrome.loadTimes) {
      window.chrome.loadTimes = function loadTimes() {
        return {
          requestTime: performance.timing.navigationStart / 1000,
          startLoadTime: performance.timing.navigationStart / 1000,
          commitLoadTime: performance.timing.responseStart / 1000,
          finishDocumentLoadTime: performance.timing.domContentLoadedEventEnd / 1000,
          finishLoadTime: performance.timing.loadEventEnd / 1000,
          firstPaintTime: performance.timing.responseStart / 1000,
          firstPaintAfterLoadTime: 0,
          navigationType: 'Other',
          wasFetchedViaSpdy: true,
          wasNpnNegotiated: true,
          npnNegotiatedProtocol: 'h2',
          wasAlternateProtocolAvailable: false,
          connectionInfo: 'h2',
        };
      };
    }
  } catch (e) {}

  // @evasion: navigator.plugins -----------------------------------------------
  // Headless Chrome reports plugins.length === 0. Restore the canonical PDF entries.
  //
  // Critical: borrow the *real* PluginArray / Plugin / MimeTypeArray / MimeType
  // prototypes from the live navigator.plugins / navigator.mimeTypes BEFORE we
  // replace them. Sannysoft (and any detector that walks the prototype chain)
  // checks navigator.plugins instanceof PluginArray — a hand-rolled stand-in
  // with a fake prototype fails that test. By setPrototypeOf-ing the fake
  // objects onto the real DOM prototypes we get instanceof for free without
  // owning the (frozen) PluginArray constructor.
  try {
    const fakePlugins = [
      { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'Microsoft Edge PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'WebKit built-in PDF', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
    ];
    const mimeTypes = [
      { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
      { type: 'text/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
    ];

    // Capture real DOM prototypes BEFORE we replace navigator.plugins / mimeTypes.
    // navigator.plugins exists (PluginArray) even when length === 0, but
    // navigator.plugins[0] (Plugin) only exists if the page already has at least
    // one entry. Same for MimeType.
    const realPluginArrayProto = Object.getPrototypeOf(navigator.plugins);
    const realPluginProto =
      navigator.plugins.length > 0
        ? Object.getPrototypeOf(navigator.plugins[0])
        : null;
    const realMimeTypeArrayProto = Object.getPrototypeOf(navigator.mimeTypes);
    const realMimeTypeProto =
      navigator.mimeTypes.length > 0
        ? Object.getPrototypeOf(navigator.mimeTypes[0])
        : null;

    const pluginArray = [];
    fakePlugins.forEach((p, i) => {
      const plugin = { name: p.name, filename: p.filename, description: p.description, length: 1 };
      if (realPluginProto) {
        try { Object.setPrototypeOf(plugin, realPluginProto); } catch (_) {}
      }
      pluginArray[i] = plugin;
      pluginArray[p.name] = plugin;
    });
    Object.defineProperty(pluginArray, 'length', { value: fakePlugins.length });
    pluginArray.item = function(i) { return this[i] || null; };
    pluginArray.namedItem = function(name) {
      for (const p of this) if (p && p.name === name) return p;
      return null;
    };
    pluginArray.refresh = function() {};
    try { Object.setPrototypeOf(pluginArray, realPluginArrayProto); } catch (_) {}

    Object.defineProperty(Navigator.prototype, 'plugins', {
      configurable: true, enumerable: true,
      get: function() { return pluginArray; },
    });

    const mimeTypeArray = [];
    mimeTypes.forEach((m, i) => {
      const mt = { type: m.type, suffixes: m.suffixes, description: m.description, enabledPlugin: pluginArray[0] };
      if (realMimeTypeProto) {
        try { Object.setPrototypeOf(mt, realMimeTypeProto); } catch (_) {}
      }
      mimeTypeArray[i] = mt;
      mimeTypeArray[m.type] = mt;
    });
    Object.defineProperty(mimeTypeArray, 'length', { value: mimeTypes.length });
    mimeTypeArray.item = function(i) { return this[i] || null; };
    mimeTypeArray.namedItem = function(name) {
      for (const m of this) if (m && m.type === name) return m;
      return null;
    };
    try { Object.setPrototypeOf(mimeTypeArray, realMimeTypeArrayProto); } catch (_) {}

    Object.defineProperty(Navigator.prototype, 'mimeTypes', {
      configurable: true, enumerable: true,
      get: function() { return mimeTypeArray; },
    });
  } catch (e) {}

  // @evasion: navigator.languages ---------------------------------------------
  // Headless leaves this empty; common bot signal.
  try {
    Object.defineProperty(Navigator.prototype, 'languages', {
      configurable: true, enumerable: true,
      get: function() { return ['en-US', 'en']; },
    });
  } catch (e) {}

  // @evasion: navigator.permissions.query -------------------------------------
  // Headless returns {state: 'denied'} for notifications; real Chrome returns 'prompt'.
  try {
    if (navigator.permissions && navigator.permissions.query) {
      const originalQuery = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = function(parameters) {
        if (parameters && parameters.name === 'notifications') {
          return Promise.resolve({
            state: Notification.permission === 'denied' ? 'denied' : 'prompt',
            onchange: null,
          });
        }
        return originalQuery(parameters);
      };
    }
  } catch (e) {}

  // @evasion: navigator.vendor ------------------------------------------------
  try {
    Object.defineProperty(Navigator.prototype, 'vendor', {
      configurable: true, enumerable: true,
      get: function() { return 'Google Inc.'; },
    });
  } catch (e) {}

  // @evasion: navigator.hardwareConcurrency -----------------------------------
  // Randomize to a plausible common value. Variability across the fleet is the goal —
  // identical values across all surfagent instances is itself a signal.
  try {
    const choices = [4, 8, 12, 16];
    const randomConcurrency = choices[Math.floor(Math.random() * choices.length)];
    Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', {
      configurable: true, enumerable: true,
      get: function() { return randomConcurrency; },
    });
  } catch (e) {}

  // @evasion: WebGL vendor/renderer -------------------------------------------
  // RTX 3090 is too distinctive across a fleet. Spoof to a common Intel iGPU.
  try {
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(parameter) {
      // UNMASKED_VENDOR_WEBGL = 37445; UNMASKED_RENDERER_WEBGL = 37446
      if (parameter === 37445) return 'Intel Inc.';
      if (parameter === 37446) return 'Intel Iris OpenGL Engine';
      return getParameter.apply(this, arguments);
    };
    if (typeof WebGL2RenderingContext !== 'undefined') {
      const getParameter2 = WebGL2RenderingContext.prototype.getParameter;
      WebGL2RenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) return 'Intel Inc.';
        if (parameter === 37446) return 'Intel Iris OpenGL Engine';
        return getParameter2.apply(this, arguments);
      };
    }
  } catch (e) {}

  // @evasion: iframe.contentWindow --------------------------------------------
  // Headless drops the Window.prototype.toString lookup. Restore it.
  try {
    const oldCall = Function.prototype.call;
    function call() { return oldCall.apply(this, arguments); }
    Function.prototype.call = call;

    const nativeToStringFunctionString = Error.toString().replace(/Error/g, 'toString');
    const oldToString = Function.prototype.toString;
    function functionToString() {
      if (this === window.navigator.permissions.query) return 'function query() { [native code] }';
      if (this === functionToString) return nativeToStringFunctionString;
      return oldCall.call(oldToString, this);
    }
    Function.prototype.toString = functionToString;
  } catch (e) {}

  // @evasion: media.codecs ----------------------------------------------------
  // Headless reports '' for h264/aac; real Chrome reports 'probably'.
  try {
    const originalCanPlayType = HTMLMediaElement.prototype.canPlayType;
    HTMLMediaElement.prototype.canPlayType = function(type) {
      if (!type) return '';
      const t = type.toLowerCase();
      if (t.includes('video/mp4') || t.includes('avc1') || t.includes('h264')) return 'probably';
      if (t.includes('audio/mp4') || t.includes('mp4a') || t.includes('aac')) return 'probably';
      if (t.includes('audio/ogg') || t.includes('vorbis')) return 'probably';
      if (t.includes('video/webm') || t.includes('vp8') || t.includes('vp9')) return 'probably';
      if (t.includes('audio/webm')) return 'probably';
      return originalCanPlayType.apply(this, [type]);
    };
  } catch (e) {}

  // @evasion: window outer dimensions -----------------------------------------
  // Headless: outerWidth/outerHeight === 0. Real Chrome: innerWidth, innerHeight + chrome.
  try {
    if (window.outerWidth === 0 || window.outerHeight === 0) {
      Object.defineProperty(window, 'outerWidth', {
        configurable: true, enumerable: true,
        get: function() { return window.innerWidth; },
      });
      Object.defineProperty(window, 'outerHeight', {
        configurable: true, enumerable: true,
        get: function() { return window.innerHeight + 85; },
      });
    }
  } catch (e) {}

  // @evasion: navigator.connection --------------------------------------------
  // Some detectors check that connection.rtt > 0 / downlink > 0 — headless can leak 0.
  try {
    if (navigator.connection) {
      const connection = navigator.connection;
      if (connection.rtt === 0) {
        Object.defineProperty(connection, 'rtt', { get: function() { return 50; } });
      }
    }
  } catch (e) {}

  // @evasion: WebGL antialias / extensions ------------------------------------
  // Headless rendering occasionally exposes RGBA8 / unusual extensions list.
  // Light touch: ensure getSupportedExtensions returns a plausible list.
  try {
    const realGetSupportedExtensions = WebGLRenderingContext.prototype.getSupportedExtensions;
    WebGLRenderingContext.prototype.getSupportedExtensions = function() {
      const exts = realGetSupportedExtensions.apply(this, arguments);
      if (!exts || exts.length === 0) {
        return [
          'ANGLE_instanced_arrays', 'EXT_blend_minmax', 'EXT_color_buffer_half_float',
          'EXT_disjoint_timer_query', 'EXT_float_blend', 'EXT_frag_depth',
          'EXT_shader_texture_lod', 'EXT_texture_compression_bptc', 'EXT_texture_compression_rgtc',
          'EXT_texture_filter_anisotropic', 'WEBKIT_EXT_texture_filter_anisotropic',
          'EXT_sRGB', 'OES_element_index_uint', 'OES_fbo_render_mipmap',
          'OES_standard_derivatives', 'OES_texture_float', 'OES_texture_float_linear',
          'OES_texture_half_float', 'OES_texture_half_float_linear', 'OES_vertex_array_object',
          'WEBGL_color_buffer_float', 'WEBGL_compressed_texture_s3tc',
          'WEBGL_compressed_texture_s3tc_srgb', 'WEBGL_debug_renderer_info',
          'WEBGL_debug_shaders', 'WEBGL_depth_texture', 'WEBGL_draw_buffers',
          'WEBGL_lose_context', 'WEBGL_multi_draw',
        ];
      }
      return exts;
    };
  } catch (e) {}

})();
`;
