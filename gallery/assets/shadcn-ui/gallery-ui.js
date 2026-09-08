function U1(n, o) {
  for (var a = 0; a < o.length; a++) {
    const i = o[a];
    if (typeof i != "string" && !Array.isArray(i)) {
      for (const u in i)
        if (u !== "default" && !(u in n)) {
          const f = Object.getOwnPropertyDescriptor(i, u);
          f && Object.defineProperty(n, u, f.get ? f : {
            enumerable: !0,
            get: () => i[u]
          });
        }
    }
  }
  return Object.freeze(Object.defineProperty(n, Symbol.toStringTag, { value: "Module" }));
}
function B1(n) {
  return n && n.__esModule && Object.prototype.hasOwnProperty.call(n, "default") ? n.default : n;
}
var Dd = { exports: {} }, li = {};
var mv;
function I1() {
  if (mv) return li;
  mv = 1;
  var n = /* @__PURE__ */ Symbol.for("react.transitional.element"), o = /* @__PURE__ */ Symbol.for("react.fragment");
  function a(i, u, f) {
    var p = null;
    if (f !== void 0 && (p = "" + f), u.key !== void 0 && (p = "" + u.key), "key" in u) {
      f = {};
      for (var g in u)
        g !== "key" && (f[g] = u[g]);
    } else f = u;
    return u = f.ref, {
      $$typeof: n,
      type: i,
      key: p,
      ref: u !== void 0 ? u : null,
      props: f
    };
  }
  return li.Fragment = o, li.jsx = a, li.jsxs = a, li;
}
var hv;
function V1() {
  return hv || (hv = 1, Dd.exports = I1()), Dd.exports;
}
var b = V1(), kd = { exports: {} }, Ge = {};
var yv;
function P1() {
  if (yv) return Ge;
  yv = 1;
  var n = /* @__PURE__ */ Symbol.for("react.transitional.element"), o = /* @__PURE__ */ Symbol.for("react.portal"), a = /* @__PURE__ */ Symbol.for("react.fragment"), i = /* @__PURE__ */ Symbol.for("react.strict_mode"), u = /* @__PURE__ */ Symbol.for("react.profiler"), f = /* @__PURE__ */ Symbol.for("react.consumer"), p = /* @__PURE__ */ Symbol.for("react.context"), g = /* @__PURE__ */ Symbol.for("react.forward_ref"), m = /* @__PURE__ */ Symbol.for("react.suspense"), d = /* @__PURE__ */ Symbol.for("react.memo"), v = /* @__PURE__ */ Symbol.for("react.lazy"), x = /* @__PURE__ */ Symbol.for("react.activity"), S = Symbol.iterator;
  function C(O) {
    return O === null || typeof O != "object" ? null : (O = S && O[S] || O["@@iterator"], typeof O == "function" ? O : null);
  }
  var E = {
    isMounted: function() {
      return !1;
    },
    enqueueForceUpdate: function() {
    },
    enqueueReplaceState: function() {
    },
    enqueueSetState: function() {
    }
  }, M = Object.assign, T = {};
  function z(O, H, ee) {
    this.props = O, this.context = H, this.refs = T, this.updater = ee || E;
  }
  z.prototype.isReactComponent = {}, z.prototype.setState = function(O, H) {
    if (typeof O != "object" && typeof O != "function" && O != null)
      throw Error(
        "takes an object of state variables to update or a function which returns an object of state variables."
      );
    this.updater.enqueueSetState(this, O, H, "setState");
  }, z.prototype.forceUpdate = function(O) {
    this.updater.enqueueForceUpdate(this, O, "forceUpdate");
  };
  function w() {
  }
  w.prototype = z.prototype;
  function N(O, H, ee) {
    this.props = O, this.context = H, this.refs = T, this.updater = ee || E;
  }
  var A = N.prototype = new w();
  A.constructor = N, M(A, z.prototype), A.isPureReactComponent = !0;
  var L = Array.isArray;
  function D() {
  }
  var _ = { H: null, A: null, T: null, S: null }, j = Object.prototype.hasOwnProperty;
  function V(O, H, ee) {
    var J = ee.ref;
    return {
      $$typeof: n,
      type: O,
      key: H,
      ref: J !== void 0 ? J : null,
      props: ee
    };
  }
  function G(O, H) {
    return V(O.type, H, O.props);
  }
  function ne(O) {
    return typeof O == "object" && O !== null && O.$$typeof === n;
  }
  function F(O) {
    var H = { "=": "=0", ":": "=2" };
    return "$" + O.replace(/[=:]/g, function(ee) {
      return H[ee];
    });
  }
  var Q = /\/+/g;
  function Z(O, H) {
    return typeof O == "object" && O !== null && O.key != null ? F("" + O.key) : H.toString(36);
  }
  function q(O) {
    switch (O.status) {
      case "fulfilled":
        return O.value;
      case "rejected":
        throw O.reason;
      default:
        switch (typeof O.status == "string" ? O.then(D, D) : (O.status = "pending", O.then(
          function(H) {
            O.status === "pending" && (O.status = "fulfilled", O.value = H);
          },
          function(H) {
            O.status === "pending" && (O.status = "rejected", O.reason = H);
          }
        )), O.status) {
          case "fulfilled":
            return O.value;
          case "rejected":
            throw O.reason;
        }
    }
    throw O;
  }
  function k(O, H, ee, J, le) {
    var ie = typeof O;
    (ie === "undefined" || ie === "boolean") && (O = null);
    var re = !1;
    if (O === null) re = !0;
    else
      switch (ie) {
        case "bigint":
        case "string":
        case "number":
          re = !0;
          break;
        case "object":
          switch (O.$$typeof) {
            case n:
            case o:
              re = !0;
              break;
            case v:
              return re = O._init, k(
                re(O._payload),
                H,
                ee,
                J,
                le
              );
          }
      }
    if (re)
      return le = le(O), re = J === "" ? "." + Z(O, 0) : J, L(le) ? (ee = "", re != null && (ee = re.replace(Q, "$&/") + "/"), k(le, H, ee, "", function(De) {
        return De;
      })) : le != null && (ne(le) && (le = G(
        le,
        ee + (le.key == null || O && O.key === le.key ? "" : ("" + le.key).replace(
          Q,
          "$&/"
        ) + "/") + re
      )), H.push(le)), 1;
    re = 0;
    var se = J === "" ? "." : J + ":";
    if (L(O))
      for (var ge = 0; ge < O.length; ge++)
        J = O[ge], ie = se + Z(J, ge), re += k(
          J,
          H,
          ee,
          ie,
          le
        );
    else if (ge = C(O), typeof ge == "function")
      for (O = ge.call(O), ge = 0; !(J = O.next()).done; )
        J = J.value, ie = se + Z(J, ge++), re += k(
          J,
          H,
          ee,
          ie,
          le
        );
    else if (ie === "object") {
      if (typeof O.then == "function")
        return k(
          q(O),
          H,
          ee,
          J,
          le
        );
      throw H = String(O), Error(
        "Objects are not valid as a React child (found: " + (H === "[object Object]" ? "object with keys {" + Object.keys(O).join(", ") + "}" : H) + "). If you meant to render a collection of children, use an array instead."
      );
    }
    return re;
  }
  function P(O, H, ee) {
    if (O == null) return O;
    var J = [], le = 0;
    return k(O, J, "", "", function(ie) {
      return H.call(ee, ie, le++);
    }), J;
  }
  function I(O) {
    if (O._status === -1) {
      var H = O._result;
      H = H(), H.then(
        function(ee) {
          (O._status === 0 || O._status === -1) && (O._status = 1, O._result = ee);
        },
        function(ee) {
          (O._status === 0 || O._status === -1) && (O._status = 2, O._result = ee);
        }
      ), O._status === -1 && (O._status = 0, O._result = H);
    }
    if (O._status === 1) return O._result.default;
    throw O._result;
  }
  var X = typeof reportError == "function" ? reportError : function(O) {
    if (typeof window == "object" && typeof window.ErrorEvent == "function") {
      var H = new window.ErrorEvent("error", {
        bubbles: !0,
        cancelable: !0,
        message: typeof O == "object" && O !== null && typeof O.message == "string" ? String(O.message) : String(O),
        error: O
      });
      if (!window.dispatchEvent(H)) return;
    } else if (typeof process == "object" && typeof process.emit == "function") {
      process.emit("uncaughtException", O);
      return;
    }
    console.error(O);
  }, B = {
    map: P,
    forEach: function(O, H, ee) {
      P(
        O,
        function() {
          H.apply(this, arguments);
        },
        ee
      );
    },
    count: function(O) {
      var H = 0;
      return P(O, function() {
        H++;
      }), H;
    },
    toArray: function(O) {
      return P(O, function(H) {
        return H;
      }) || [];
    },
    only: function(O) {
      if (!ne(O))
        throw Error(
          "React.Children.only expected to receive a single React element child."
        );
      return O;
    }
  };
  return Ge.Activity = x, Ge.Children = B, Ge.Component = z, Ge.Fragment = a, Ge.Profiler = u, Ge.PureComponent = N, Ge.StrictMode = i, Ge.Suspense = m, Ge.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = _, Ge.__COMPILER_RUNTIME = {
    __proto__: null,
    c: function(O) {
      return _.H.useMemoCache(O);
    }
  }, Ge.cache = function(O) {
    return function() {
      return O.apply(null, arguments);
    };
  }, Ge.cacheSignal = function() {
    return null;
  }, Ge.cloneElement = function(O, H, ee) {
    if (O == null)
      throw Error(
        "The argument must be a React element, but you passed " + O + "."
      );
    var J = M({}, O.props), le = O.key;
    if (H != null)
      for (ie in H.key !== void 0 && (le = "" + H.key), H)
        !j.call(H, ie) || ie === "key" || ie === "__self" || ie === "__source" || ie === "ref" && H.ref === void 0 || (J[ie] = H[ie]);
    var ie = arguments.length - 2;
    if (ie === 1) J.children = ee;
    else if (1 < ie) {
      for (var re = Array(ie), se = 0; se < ie; se++)
        re[se] = arguments[se + 2];
      J.children = re;
    }
    return V(O.type, le, J);
  }, Ge.createContext = function(O) {
    return O = {
      $$typeof: p,
      _currentValue: O,
      _currentValue2: O,
      _threadCount: 0,
      Provider: null,
      Consumer: null
    }, O.Provider = O, O.Consumer = {
      $$typeof: f,
      _context: O
    }, O;
  }, Ge.createElement = function(O, H, ee) {
    var J, le = {}, ie = null;
    if (H != null)
      for (J in H.key !== void 0 && (ie = "" + H.key), H)
        j.call(H, J) && J !== "key" && J !== "__self" && J !== "__source" && (le[J] = H[J]);
    var re = arguments.length - 2;
    if (re === 1) le.children = ee;
    else if (1 < re) {
      for (var se = Array(re), ge = 0; ge < re; ge++)
        se[ge] = arguments[ge + 2];
      le.children = se;
    }
    if (O && O.defaultProps)
      for (J in re = O.defaultProps, re)
        le[J] === void 0 && (le[J] = re[J]);
    return V(O, ie, le);
  }, Ge.createRef = function() {
    return { current: null };
  }, Ge.forwardRef = function(O) {
    return { $$typeof: g, render: O };
  }, Ge.isValidElement = ne, Ge.lazy = function(O) {
    return {
      $$typeof: v,
      _payload: { _status: -1, _result: O },
      _init: I
    };
  }, Ge.memo = function(O, H) {
    return {
      $$typeof: d,
      type: O,
      compare: H === void 0 ? null : H
    };
  }, Ge.startTransition = function(O) {
    var H = _.T, ee = {};
    _.T = ee;
    try {
      var J = O(), le = _.S;
      le !== null && le(ee, J), typeof J == "object" && J !== null && typeof J.then == "function" && J.then(D, X);
    } catch (ie) {
      X(ie);
    } finally {
      H !== null && ee.types !== null && (H.types = ee.types), _.T = H;
    }
  }, Ge.unstable_useCacheRefresh = function() {
    return _.H.useCacheRefresh();
  }, Ge.use = function(O) {
    return _.H.use(O);
  }, Ge.useActionState = function(O, H, ee) {
    return _.H.useActionState(O, H, ee);
  }, Ge.useCallback = function(O, H) {
    return _.H.useCallback(O, H);
  }, Ge.useContext = function(O) {
    return _.H.useContext(O);
  }, Ge.useDebugValue = function() {
  }, Ge.useDeferredValue = function(O, H) {
    return _.H.useDeferredValue(O, H);
  }, Ge.useEffect = function(O, H) {
    return _.H.useEffect(O, H);
  }, Ge.useEffectEvent = function(O) {
    return _.H.useEffectEvent(O);
  }, Ge.useId = function() {
    return _.H.useId();
  }, Ge.useImperativeHandle = function(O, H, ee) {
    return _.H.useImperativeHandle(O, H, ee);
  }, Ge.useInsertionEffect = function(O, H) {
    return _.H.useInsertionEffect(O, H);
  }, Ge.useLayoutEffect = function(O, H) {
    return _.H.useLayoutEffect(O, H);
  }, Ge.useMemo = function(O, H) {
    return _.H.useMemo(O, H);
  }, Ge.useOptimistic = function(O, H) {
    return _.H.useOptimistic(O, H);
  }, Ge.useReducer = function(O, H, ee) {
    return _.H.useReducer(O, H, ee);
  }, Ge.useRef = function(O) {
    return _.H.useRef(O);
  }, Ge.useState = function(O) {
    return _.H.useState(O);
  }, Ge.useSyncExternalStore = function(O, H, ee) {
    return _.H.useSyncExternalStore(
      O,
      H,
      ee
    );
  }, Ge.useTransition = function() {
    return _.H.useTransition();
  }, Ge.version = "19.2.7", Ge;
}
var vv;
function Ti() {
  return vv || (vv = 1, kd.exports = P1()), kd.exports;
}
var h = Ti();
const Ec = /* @__PURE__ */ B1(h), Y1 = /* @__PURE__ */ U1({
  __proto__: null,
  default: Ec
}, [h]);
const _b = (...n) => n.filter((o, a, i) => !!o && o.trim() !== "" && i.indexOf(o) === a).join(" ").trim();
const G1 = (n) => n.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
const q1 = (n) => n.replace(
  /^([A-Z])|[\s-_]+(\w)/g,
  (o, a, i) => i ? i.toUpperCase() : a.toLowerCase()
);
const bv = (n) => {
  const o = q1(n);
  return o.charAt(0).toUpperCase() + o.slice(1);
};
var _d = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round"
};
const X1 = (n) => {
  for (const o in n)
    if (o.startsWith("aria-") || o === "role" || o === "title")
      return !0;
  return !1;
}, F1 = h.createContext({}), K1 = () => h.useContext(F1), Q1 = h.forwardRef(
  ({ color: n, size: o, strokeWidth: a, absoluteStrokeWidth: i, className: u = "", children: f, iconNode: p, ...g }, m) => {
    const {
      size: d = 24,
      strokeWidth: v = 2,
      absoluteStrokeWidth: x = !1,
      color: S = "currentColor",
      className: C = ""
    } = K1() ?? {}, E = i ?? x ? Number(a ?? v) * 24 / Number(o ?? d) : a ?? v;
    return h.createElement(
      "svg",
      {
        ref: m,
        ..._d,
        width: o ?? d ?? _d.width,
        height: o ?? d ?? _d.height,
        stroke: n ?? S,
        strokeWidth: E,
        className: _b("lucide", C, u),
        ...!f && !X1(g) && { "aria-hidden": "true" },
        ...g
      },
      [
        ...p.map(([M, T]) => h.createElement(M, T)),
        ...Array.isArray(f) ? f : [f]
      ]
    );
  }
);
const $t = (n, o) => {
  const a = h.forwardRef(
    ({ className: i, ...u }, f) => h.createElement(Q1, {
      ref: f,
      iconNode: o,
      className: _b(
        `lucide-${G1(bv(n))}`,
        `lucide-${n}`,
        i
      ),
      ...u
    })
  );
  return a.displayName = bv(n), a;
};
const Z1 = [
  ["path", { d: "m3 16 4 4 4-4", key: "1co6wj" }],
  ["path", { d: "M7 20V4", key: "1yoxec" }],
  ["path", { d: "m21 8-4-4-4 4", key: "1c9v7m" }],
  ["path", { d: "M17 4v16", key: "7dpous" }]
], J1 = $t("arrow-down-up", Z1);
const W1 = [["path", { d: "M20 6 9 17l-5-5", key: "1gmf2c" }]], Hb = $t("check", W1);
const $1 = [["path", { d: "m6 9 6 6 6-6", key: "qrunsl" }]], Lb = $t("chevron-down", $1);
const eE = [["path", { d: "m9 18 6-6-6-6", key: "mthhwq" }]], tE = $t("chevron-right", eE);
const nE = [
  ["circle", { cx: "12", cy: "12", r: "1", key: "41hilf" }],
  ["circle", { cx: "19", cy: "12", r: "1", key: "1wjl8i" }],
  ["circle", { cx: "5", cy: "12", r: "1", key: "1pcz8c" }]
], xv = $t("ellipsis", nE);
const lE = [
  [
    "path",
    {
      d: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
      key: "1kt360"
    }
  ]
], oE = $t("folder", lE);
const rE = [
  [
    "path",
    {
      d: "M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z",
      key: "sc7q7i"
    }
  ]
], aE = $t("funnel", rE);
const iE = [
  ["rect", { width: "7", height: "7", x: "3", y: "3", rx: "1", key: "1g98yp" }],
  ["rect", { width: "7", height: "7", x: "14", y: "3", rx: "1", key: "6d4xhi" }],
  ["rect", { width: "7", height: "7", x: "14", y: "14", rx: "1", key: "nxv5o0" }],
  ["rect", { width: "7", height: "7", x: "3", y: "14", rx: "1", key: "1bb6yr" }]
], Ub = $t("layout-grid", iE);
const sE = [
  ["path", { d: "M3 5h.01", key: "18ugdj" }],
  ["path", { d: "M3 12h.01", key: "nlz23k" }],
  ["path", { d: "M3 19h.01", key: "noohij" }],
  ["path", { d: "M8 5h13", key: "1pao27" }],
  ["path", { d: "M8 12h13", key: "1za7za" }],
  ["path", { d: "M8 19h13", key: "m83p4d" }]
], cE = $t("list", sE);
const uE = [["path", { d: "M21 12a9 9 0 1 1-6.219-8.56", key: "13zald" }]], fE = $t("loader-circle", uE);
const dE = [
  ["path", { d: "M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4", key: "re6nr2" }],
  ["path", { d: "M2 6h4", key: "aawbzj" }],
  ["path", { d: "M2 10h4", key: "l0bgd4" }],
  ["path", { d: "M2 14h4", key: "1gsvsf" }],
  ["path", { d: "M2 18h4", key: "1bu2t1" }],
  [
    "path",
    {
      d: "M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z",
      key: "pqwjuv"
    }
  ]
], pE = $t("notebook-pen", dE);
const gE = [
  ["path", { d: "M5 12h14", key: "1ays0h" }],
  ["path", { d: "M12 5v14", key: "s699le" }]
], mE = $t("plus", gE);
const hE = [
  ["path", { d: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8", key: "v9h5vc" }],
  ["path", { d: "M21 3v5h-5", key: "1q7to0" }],
  ["path", { d: "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16", key: "3uifl3" }],
  ["path", { d: "M8 16H3v5", key: "1cv678" }]
], yE = $t("refresh-cw", hE);
const vE = [
  ["path", { d: "m21 21-4.34-4.34", key: "14j7rj" }],
  ["circle", { cx: "11", cy: "11", r: "8", key: "4ej97u" }]
], wv = $t("search", vE);
const bE = [
  [
    "path",
    {
      d: "M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915",
      key: "1i5ecw"
    }
  ],
  ["circle", { cx: "12", cy: "12", r: "3", key: "1v7zrd" }]
], xE = $t("settings", bE);
const wE = [
  ["path", { d: "M10 5H3", key: "1qgfaw" }],
  ["path", { d: "M12 19H3", key: "yhmn1j" }],
  ["path", { d: "M14 3v4", key: "1sua03" }],
  ["path", { d: "M16 17v4", key: "1q0r14" }],
  ["path", { d: "M21 12h-9", key: "1o4lsq" }],
  ["path", { d: "M21 19h-5", key: "1rlt1p" }],
  ["path", { d: "M21 5h-7", key: "1oszz2" }],
  ["path", { d: "M8 10v4", key: "tgpxqk" }],
  ["path", { d: "M8 12H3", key: "a7s4jb" }]
], SE = $t("sliders-horizontal", wE);
const EE = [
  ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", key: "afitv7" }],
  ["path", { d: "m9 12 2 2 4-4", key: "dzmm74" }]
], TE = $t("square-check", EE);
const RE = [
  [
    "path",
    {
      d: "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z",
      key: "r04s7s"
    }
  ]
], Bb = $t("star", RE);
const CE = [
  ["path", { d: "M10 11v6", key: "nco0om" }],
  ["path", { d: "M14 11v6", key: "outv1u" }],
  ["path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6", key: "miytrc" }],
  ["path", { d: "M3 6h18", key: "d0wm0j" }],
  ["path", { d: "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2", key: "e791ji" }]
], Rp = $t("trash-2", CE);
const OE = [
  ["path", { d: "M18 6 6 18", key: "1bl5f8" }],
  ["path", { d: "m6 6 12 12", key: "d8bk6v" }]
], np = $t("x", OE);
function Ic() {
  return typeof window < "u";
}
function mn(n) {
  return Cp(n) ? (n.nodeName || "").toLowerCase() : "#document";
}
function At(n) {
  var o;
  return (n == null || (o = n.ownerDocument) == null ? void 0 : o.defaultView) || window;
}
function Wl(n) {
  var o;
  return (o = (Cp(n) ? n.ownerDocument : n.document) || window.document) == null ? void 0 : o.documentElement;
}
function Cp(n) {
  return Ic() ? n instanceof Node || n instanceof At(n).Node : !1;
}
function We(n) {
  return Ic() ? n instanceof Element || n instanceof At(n).Element : !1;
}
function Rt(n) {
  return Ic() ? n instanceof HTMLElement || n instanceof At(n).HTMLElement : !1;
}
function aa(n) {
  return !Ic() || typeof ShadowRoot > "u" ? !1 : n instanceof ShadowRoot || n instanceof At(n).ShadowRoot;
}
function pr(n) {
  const {
    overflow: o,
    overflowX: a,
    overflowY: i,
    display: u
  } = Vn(n);
  return /auto|scroll|overlay|hidden|clip/.test(o + i + a) && u !== "inline" && u !== "contents";
}
function ME(n) {
  return /^(table|td|th)$/.test(mn(n));
}
function Vc(n) {
  try {
    if (n.matches(":popover-open"))
      return !0;
  } catch {
  }
  try {
    return n.matches(":modal");
  } catch {
    return !1;
  }
}
const AE = /transform|translate|scale|rotate|perspective|filter/, zE = /paint|layout|strict|content/, nr = (n) => !!n && n !== "none";
let Hd;
function Op(n) {
  const o = We(n) ? Vn(n) : n;
  return nr(o.transform) || nr(o.translate) || nr(o.scale) || nr(o.rotate) || nr(o.perspective) || !Mp() && (nr(o.backdropFilter) || nr(o.filter)) || AE.test(o.willChange || "") || zE.test(o.contain || "");
}
function NE(n) {
  let o = Fl(n);
  for (; Rt(o) && !Gl(o); ) {
    if (Op(o))
      return o;
    if (Vc(o))
      return null;
    o = Fl(o);
  }
  return null;
}
function Mp() {
  return Hd == null && (Hd = typeof CSS < "u" && CSS.supports && CSS.supports("-webkit-backdrop-filter", "none")), Hd;
}
function Gl(n) {
  return /^(html|body|#document)$/.test(mn(n));
}
function Vn(n) {
  return At(n).getComputedStyle(n);
}
function Pc(n) {
  return We(n) ? {
    scrollLeft: n.scrollLeft,
    scrollTop: n.scrollTop
  } : {
    scrollLeft: n.scrollX,
    scrollTop: n.scrollY
  };
}
function Fl(n) {
  if (mn(n) === "html")
    return n;
  const o = (
    // Step into the shadow DOM of the parent of a slotted node.
    n.assignedSlot || // DOM Element detected.
    n.parentNode || // ShadowRoot detected.
    aa(n) && n.host || // Fallback.
    Wl(n)
  );
  return aa(o) ? o.host : o;
}
function Ib(n) {
  const o = Fl(n);
  return Gl(o) ? (n.ownerDocument || n).body : Rt(o) && pr(o) ? o : Ib(o);
}
function bi(n, o, a) {
  var i;
  o === void 0 && (o = []), a === void 0 && (a = !0);
  const u = Ib(n), f = u === ((i = n.ownerDocument) == null ? void 0 : i.body), p = At(u);
  if (f) {
    const g = lp(p);
    return o.concat(p, p.visualViewport || [], pr(u) ? u : [], g && a ? bi(g) : []);
  } else
    return o.concat(u, bi(u, [], a));
}
function lp(n) {
  return n.parent && Object.getPrototypeOf(n.parent) ? n.frameElement : null;
}
const Ap = {
  ...Y1
}, Sv = {};
function xn(n, o) {
  const a = h.useRef(Sv);
  return a.current === Sv && (a.current = n(o)), a;
}
const Ld = Ap.useInsertionEffect, jE = (
  // React 17 doesn't have useInsertionEffect.
  Ld && // Preact replaces useInsertionEffect with useLayoutEffect and fires too late.
  Ld !== Ap.useLayoutEffect ? Ld : (n) => n()
);
function ze(n) {
  const o = xn(DE).current;
  return o.next = n, jE(o.effect), o.trampoline;
}
function DE() {
  const n = {
    next: void 0,
    callback: kE,
    trampoline: (...o) => n.callback?.(...o),
    effect: () => {
      n.callback = n.next;
    }
  };
  return n;
}
function kE() {
}
const _E = () => {
}, we = typeof document < "u" ? h.useLayoutEffect : _E;
function op(n, o) {
  if (n && !o)
    return n;
  if (!n && o)
    return o;
  if (n || o)
    return {
      ...n,
      ...o
    };
}
const zp = {};
function yn(n, o, a, i, u) {
  if (!a && !i && !u && !n)
    return Tc(o);
  let f = Tc(n);
  return o && (f = si(f, o)), a && (f = si(f, a)), i && (f = si(f, i)), u && (f = si(f, u)), f;
}
function HE(n) {
  if (n.length === 0)
    return zp;
  if (n.length === 1)
    return Tc(n[0]);
  let o = Tc(n[0]);
  for (let a = 1; a < n.length; a += 1)
    o = si(o, n[a]);
  return o;
}
function Tc(n) {
  return Np(n) ? {
    ...Pb(n, zp)
  } : LE(n);
}
function si(n, o) {
  return Np(o) ? Pb(o, n) : UE(n, o);
}
function LE(n) {
  const o = {
    ...n
  };
  for (const a in o) {
    const i = o[a];
    Vb(a, i) && (o[a] = Yb(i));
  }
  return o;
}
function UE(n, o) {
  if (!o)
    return n;
  for (const a in o) {
    const i = o[a];
    switch (a) {
      case "style": {
        n[a] = op(n.style, i);
        break;
      }
      case "className": {
        n[a] = Gb(n.className, i);
        break;
      }
      default:
        Vb(a, i) ? n[a] = BE(n[a], i) : n[a] = i;
    }
  }
  return n;
}
function Vb(n, o) {
  const a = n.charCodeAt(0), i = n.charCodeAt(1), u = n.charCodeAt(2);
  return a === 111 && i === 110 && u >= 65 && u <= 90 && (typeof o == "function" || typeof o > "u");
}
function Np(n) {
  return typeof n == "function";
}
function Pb(n, o) {
  return Np(n) ? n(o) : n ?? zp;
}
function BE(n, o) {
  return o ? n ? (...a) => {
    const i = a[0];
    if (qb(i)) {
      const f = i;
      Rc(f);
      const p = o(...a);
      return f.baseUIHandlerPrevented || n?.(...a), p;
    }
    const u = o(...a);
    return n?.(...a), u;
  } : Yb(o) : n;
}
function Yb(n) {
  return n && ((...o) => {
    const a = o[0];
    return qb(a) && Rc(a), n(...o);
  });
}
function Rc(n) {
  return n.preventBaseUIHandler = () => {
    n.baseUIHandlerPrevented = !0;
  }, n;
}
function Gb(n, o) {
  return o ? n ? o + " " + n : o : n;
}
function qb(n) {
  return n != null && typeof n == "object" && "nativeEvent" in n;
}
function IE(n, o) {
  return function(i, ...u) {
    const f = new URL(n);
    return f.searchParams.set("code", i.toString()), u.forEach((p) => f.searchParams.append("args[]", p)), `${o} error #${i}; visit ${f} for the full message.`;
  };
}
const Ct = IE("https://base-ui.com/production-error", "Base UI"), Xb = /* @__PURE__ */ h.createContext(void 0);
function jp(n = !1) {
  const o = h.useContext(Xb);
  if (o === void 0 && !n)
    throw new Error(Ct(16));
  return o;
}
function VE(n) {
  const {
    focusableWhenDisabled: o,
    disabled: a,
    composite: i = !1,
    tabIndex: u = 0,
    isNativeButton: f
  } = n, p = i && o !== !1, g = i && o === !1;
  return {
    props: h.useMemo(() => {
      const d = {
        // allow Tabbing away from focusableWhenDisabled elements
        onKeyDown(v) {
          a && o && v.key !== "Tab" && v.preventDefault();
        }
      };
      return i || (d.tabIndex = u, !f && a && (d.tabIndex = o ? u : -1)), (f && (o || p) || !f && a) && (d["aria-disabled"] = a), f && (!o || g) && (d.disabled = a), d;
    }, [i, a, o, p, g, f, u])
  };
}
function $l(n = {}) {
  const {
    disabled: o = !1,
    focusableWhenDisabled: a,
    tabIndex: i = 0,
    native: u = !0,
    composite: f
  } = n, p = h.useRef(null), g = jp(!0), m = f ?? g !== void 0, {
    props: d
  } = VE({
    focusableWhenDisabled: a,
    disabled: o,
    composite: m,
    tabIndex: i,
    isNativeButton: u
  }), v = h.useCallback(() => {
    const C = p.current;
    Ud(C) && m && o && d.disabled === void 0 && C.disabled && (C.disabled = !1);
  }, [o, d.disabled, m]);
  we(v, [v]);
  const x = h.useCallback((C = {}) => {
    const {
      onClick: E,
      onMouseDown: M,
      onKeyUp: T,
      onKeyDown: z,
      onPointerDown: w,
      ...N
    } = C;
    return yn({
      onClick(A) {
        if (o) {
          A.preventDefault();
          return;
        }
        E?.(A);
      },
      onMouseDown(A) {
        o || M?.(A);
      },
      onKeyDown(A) {
        if (o || (Rc(A), z?.(A), A.baseUIHandlerPrevented))
          return;
        const L = A.target === A.currentTarget, D = A.currentTarget, _ = Ud(D), j = !u && PE(D), V = L && (u ? _ : !j), G = A.key === "Enter", ne = A.key === " ", F = D.getAttribute("role"), Q = F?.startsWith("menuitem") || F === "option" || F === "gridcell";
        if (L && m && ne) {
          if (A.defaultPrevented && Q)
            return;
          A.preventDefault(), j || u && _ ? (D.click(), A.preventBaseUIHandler()) : V && (E?.(A), A.preventBaseUIHandler());
          return;
        }
        V && (!u && (ne || G) && A.preventDefault(), !u && G && E?.(A));
      },
      onKeyUp(A) {
        if (!o) {
          if (Rc(A), T?.(A), A.target === A.currentTarget && u && m && Ud(A.currentTarget) && A.key === " ") {
            A.preventDefault();
            return;
          }
          A.baseUIHandlerPrevented || A.target === A.currentTarget && !u && !m && A.key === " " && E?.(A);
        }
      },
      onPointerDown(A) {
        if (o) {
          A.preventDefault();
          return;
        }
        w?.(A);
      }
    }, u ? {
      type: "button"
    } : {
      role: "button"
    }, d, N);
  }, [o, d, m, u]), S = ze((C) => {
    p.current = C, v();
  });
  return {
    getButtonProps: x,
    buttonRef: S
  };
}
function Ud(n) {
  return Rt(n) && n.tagName === "BUTTON";
}
function PE(n) {
  return !!(n?.tagName === "A" && n?.href);
}
function Kl(n, o, a, i) {
  const u = xn(Fb).current;
  return GE(u, n, o, a, i) && Kb(u, [n, o, a, i]), u.callback;
}
function YE(n) {
  const o = xn(Fb).current;
  return qE(o, n) && Kb(o, n), o.callback;
}
function Fb() {
  return {
    callback: null,
    cleanup: null,
    refs: []
  };
}
function GE(n, o, a, i, u) {
  return n.refs[0] !== o || n.refs[1] !== a || n.refs[2] !== i || n.refs[3] !== u;
}
function qE(n, o) {
  return n.refs.length !== o.length || n.refs.some((a, i) => a !== o[i]);
}
function Kb(n, o) {
  if (n.refs = o, o.every((a) => a == null)) {
    n.callback = null;
    return;
  }
  n.callback = (a) => {
    if (n.cleanup && (n.cleanup(), n.cleanup = null), a != null) {
      const i = Array(o.length).fill(null);
      for (let u = 0; u < o.length; u += 1) {
        const f = o[u];
        if (f != null)
          switch (typeof f) {
            case "function": {
              const p = f(a);
              typeof p == "function" && (i[u] = p);
              break;
            }
            case "object": {
              f.current = a;
              break;
            }
          }
      }
      n.cleanup = () => {
        for (let u = 0; u < o.length; u += 1) {
          const f = o[u];
          if (f != null)
            switch (typeof f) {
              case "function": {
                const p = i[u];
                typeof p == "function" ? p() : f(null);
                break;
              }
              case "object": {
                f.current = null;
                break;
              }
            }
        }
      };
    }
  };
}
const XE = parseInt(h.version, 10);
function Dp(n) {
  return XE >= n;
}
function Ev(n) {
  if (!/* @__PURE__ */ h.isValidElement(n))
    return null;
  const o = n, a = o.props;
  return (Dp(19) ? a?.ref : o.ref) ?? null;
}
function an() {
}
const Ql = Object.freeze([]), mt = Object.freeze({});
function FE(n, o) {
  const a = {};
  for (const i in n) {
    const u = n[i];
    if (o?.hasOwnProperty(i)) {
      const f = o[i](u);
      f != null && Object.assign(a, f);
      continue;
    }
    u === !0 ? a[`data-${i.toLowerCase()}`] = "" : u && (a[`data-${i.toLowerCase()}`] = u.toString());
  }
  return a;
}
function KE(n, o) {
  return typeof n == "function" ? n(o) : n;
}
function QE(n, o) {
  return typeof n == "function" ? n(o) : n;
}
function $e(n, o, a = {}) {
  const i = o.render, u = ZE(o, a);
  if (a.enabled === !1)
    return null;
  const f = a.state ?? mt;
  return $E(n, i, u, f);
}
function ZE(n, o = {}) {
  const {
    className: a,
    style: i,
    render: u
  } = n, {
    state: f = mt,
    ref: p,
    props: g,
    stateAttributesMapping: m,
    enabled: d = !0
  } = o, v = d ? KE(a, f) : void 0, x = d ? QE(i, f) : void 0, S = d ? FE(f, m) : mt, C = d && g ? JE(g) : void 0, E = d ? op(S, C) ?? {} : mt;
  return typeof document < "u" && (d ? Array.isArray(p) ? E.ref = YE([E.ref, Ev(u), ...p]) : E.ref = Kl(E.ref, Ev(u), p) : Kl(null, null)), d ? (v !== void 0 && (E.className = Gb(E.className, v)), x !== void 0 && (E.style = op(E.style, x)), E) : mt;
}
function JE(n) {
  return Array.isArray(n) ? HE(n) : yn(void 0, n);
}
const WE = /* @__PURE__ */ Symbol.for("react.lazy");
function $E(n, o, a, i) {
  if (o) {
    if (typeof o == "function")
      return o(a, i);
    const u = yn(a, o.props);
    u.ref = a.ref;
    let f = o;
    return f?.$$typeof === WE && (f = h.Children.toArray(o)[0]), /* @__PURE__ */ h.cloneElement(f, u);
  }
  if (n && typeof n == "string")
    return eT(n, a);
  throw new Error(Ct(8));
}
function eT(n, o) {
  return n === "button" ? /* @__PURE__ */ h.createElement("button", {
    type: "button",
    ...o,
    key: o.key
  }) : n === "img" ? /* @__PURE__ */ h.createElement("img", {
    alt: "",
    ...o,
    key: o.key
  }) : /* @__PURE__ */ h.createElement(n, o);
}
const tT = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    disabled: f = !1,
    focusableWhenDisabled: p = !1,
    nativeButton: g = !0,
    style: m,
    ...d
  } = o, {
    getButtonProps: v,
    buttonRef: x
  } = $l({
    disabled: f,
    focusableWhenDisabled: p,
    native: g
  });
  return $e("button", o, {
    state: {
      disabled: f
    },
    ref: [a, x],
    props: [d, v]
  });
});
function Qb(n) {
  var o, a, i = "";
  if (typeof n == "string" || typeof n == "number") i += n;
  else if (typeof n == "object") if (Array.isArray(n)) {
    var u = n.length;
    for (o = 0; o < u; o++) n[o] && (a = Qb(n[o])) && (i && (i += " "), i += a);
  } else for (a in n) n[a] && (i && (i += " "), i += a);
  return i;
}
function Zb() {
  for (var n, o, a = 0, i = "", u = arguments.length; a < u; a++) (n = arguments[a]) && (o = Qb(n)) && (i && (i += " "), i += o);
  return i;
}
const Tv = (n) => typeof n == "boolean" ? `${n}` : n === 0 ? "0" : n, Rv = Zb, ua = (n, o) => (a) => {
  var i;
  if (o?.variants == null) return Rv(n, a?.class, a?.className);
  const { variants: u, defaultVariants: f } = o, p = Object.keys(u).map((d) => {
    const v = a?.[d], x = f?.[d];
    if (v === null) return null;
    const S = Tv(v) || Tv(x);
    return u[d][S];
  }), g = a && Object.entries(a).reduce((d, v) => {
    let [x, S] = v;
    return S === void 0 || (d[x] = S), d;
  }, {}), m = o == null || (i = o.compoundVariants) === null || i === void 0 ? void 0 : i.reduce((d, v) => {
    let { class: x, className: S, ...C } = v;
    return Object.entries(C).every((E) => {
      let [M, T] = E;
      return Array.isArray(T) ? T.includes({
        ...f,
        ...g
      }[M]) : {
        ...f,
        ...g
      }[M] === T;
    }) ? [
      ...d,
      x,
      S
    ] : d;
  }, []);
  return Rv(n, p, m, a?.class, a?.className);
}, nT = (n, o) => {
  const a = new Array(n.length + o.length);
  for (let i = 0; i < n.length; i++)
    a[i] = n[i];
  for (let i = 0; i < o.length; i++)
    a[n.length + i] = o[i];
  return a;
}, lT = (n, o) => ({
  classGroupId: n,
  validator: o
}), Jb = (n = /* @__PURE__ */ new Map(), o = null, a) => ({
  nextPart: n,
  validators: o,
  classGroupId: a
}), Cc = "-", Cv = [], oT = "arbitrary..", rT = (n) => {
  const o = iT(n), {
    conflictingClassGroups: a,
    conflictingClassGroupModifiers: i
  } = n;
  return {
    getClassGroupId: (p) => {
      if (p.startsWith("[") && p.endsWith("]"))
        return aT(p);
      const g = p.split(Cc), m = g[0] === "" && g.length > 1 ? 1 : 0;
      return Wb(g, m, o);
    },
    getConflictingClassGroupIds: (p, g) => {
      if (g) {
        const m = i[p], d = a[p];
        return m ? d ? nT(d, m) : m : d || Cv;
      }
      return a[p] || Cv;
    }
  };
}, Wb = (n, o, a) => {
  if (n.length - o === 0)
    return a.classGroupId;
  const u = n[o], f = a.nextPart.get(u);
  if (f) {
    const d = Wb(n, o + 1, f);
    if (d) return d;
  }
  const p = a.validators;
  if (p === null)
    return;
  const g = o === 0 ? n.join(Cc) : n.slice(o).join(Cc), m = p.length;
  for (let d = 0; d < m; d++) {
    const v = p[d];
    if (v.validator(g))
      return v.classGroupId;
  }
}, aT = (n) => n.slice(1, -1).indexOf(":") === -1 ? void 0 : (() => {
  const o = n.slice(1, -1), a = o.indexOf(":"), i = o.slice(0, a);
  return i ? oT + i : void 0;
})(), iT = (n) => {
  const {
    theme: o,
    classGroups: a
  } = n;
  return sT(a, o);
}, sT = (n, o) => {
  const a = Jb();
  for (const i in n) {
    const u = n[i];
    kp(u, a, i, o);
  }
  return a;
}, kp = (n, o, a, i) => {
  const u = n.length;
  for (let f = 0; f < u; f++) {
    const p = n[f];
    cT(p, o, a, i);
  }
}, cT = (n, o, a, i) => {
  if (typeof n == "string") {
    uT(n, o, a);
    return;
  }
  if (typeof n == "function") {
    fT(n, o, a, i);
    return;
  }
  dT(n, o, a, i);
}, uT = (n, o, a) => {
  const i = n === "" ? o : $b(o, n);
  i.classGroupId = a;
}, fT = (n, o, a, i) => {
  if (pT(n)) {
    kp(n(i), o, a, i);
    return;
  }
  o.validators === null && (o.validators = []), o.validators.push(lT(a, n));
}, dT = (n, o, a, i) => {
  const u = Object.entries(n), f = u.length;
  for (let p = 0; p < f; p++) {
    const [g, m] = u[p];
    kp(m, $b(o, g), a, i);
  }
}, $b = (n, o) => {
  let a = n;
  const i = o.split(Cc), u = i.length;
  for (let f = 0; f < u; f++) {
    const p = i[f];
    let g = a.nextPart.get(p);
    g || (g = Jb(), a.nextPart.set(p, g)), a = g;
  }
  return a;
}, pT = (n) => "isThemeGetter" in n && n.isThemeGetter === !0, gT = (n) => {
  if (n < 1)
    return {
      get: () => {
      },
      set: () => {
      }
    };
  let o = 0, a = /* @__PURE__ */ Object.create(null), i = /* @__PURE__ */ Object.create(null);
  const u = (f, p) => {
    a[f] = p, o++, o > n && (o = 0, i = a, a = /* @__PURE__ */ Object.create(null));
  };
  return {
    get(f) {
      let p = a[f];
      if (p !== void 0)
        return p;
      if ((p = i[f]) !== void 0)
        return u(f, p), p;
    },
    set(f, p) {
      f in a ? a[f] = p : u(f, p);
    }
  };
}, rp = "!", Ov = ":", mT = [], Mv = (n, o, a, i, u) => ({
  modifiers: n,
  hasImportantModifier: o,
  baseClassName: a,
  maybePostfixModifierPosition: i,
  isExternal: u
}), hT = (n) => {
  const {
    prefix: o,
    experimentalParseClassName: a
  } = n;
  let i = (u) => {
    const f = [];
    let p = 0, g = 0, m = 0, d;
    const v = u.length;
    for (let M = 0; M < v; M++) {
      const T = u[M];
      if (p === 0 && g === 0) {
        if (T === Ov) {
          f.push(u.slice(m, M)), m = M + 1;
          continue;
        }
        if (T === "/") {
          d = M;
          continue;
        }
      }
      T === "[" ? p++ : T === "]" ? p-- : T === "(" ? g++ : T === ")" && g--;
    }
    const x = f.length === 0 ? u : u.slice(m);
    let S = x, C = !1;
    x.endsWith(rp) ? (S = x.slice(0, -1), C = !0) : (
      /**
       * In Tailwind CSS v3 the important modifier was at the start of the base class name. This is still supported for legacy reasons.
       * @see https://github.com/dcastil/tailwind-merge/issues/513#issuecomment-2614029864
       */
      x.startsWith(rp) && (S = x.slice(1), C = !0)
    );
    const E = d && d > m ? d - m : void 0;
    return Mv(f, C, S, E);
  };
  if (o) {
    const u = o + Ov, f = i;
    i = (p) => p.startsWith(u) ? f(p.slice(u.length)) : Mv(mT, !1, p, void 0, !0);
  }
  if (a) {
    const u = i;
    i = (f) => a({
      className: f,
      parseClassName: u
    });
  }
  return i;
}, yT = (n) => {
  const o = /* @__PURE__ */ new Map();
  return n.orderSensitiveModifiers.forEach((a, i) => {
    o.set(a, 1e6 + i);
  }), (a) => {
    const i = [];
    let u = [];
    for (let f = 0; f < a.length; f++) {
      const p = a[f], g = p[0] === "[", m = o.has(p);
      g || m ? (u.length > 0 && (u.sort(), i.push(...u), u = []), i.push(p)) : u.push(p);
    }
    return u.length > 0 && (u.sort(), i.push(...u)), i;
  };
}, vT = (n) => ({
  cache: gT(n.cacheSize),
  parseClassName: hT(n),
  sortModifiers: yT(n),
  postfixLookupClassGroupIds: bT(n),
  ...rT(n)
}), bT = (n) => {
  const o = /* @__PURE__ */ Object.create(null), a = n.postfixLookupClassGroups;
  if (a)
    for (let i = 0; i < a.length; i++)
      o[a[i]] = !0;
  return o;
}, xT = /\s+/, wT = (n, o) => {
  const {
    parseClassName: a,
    getClassGroupId: i,
    getConflictingClassGroupIds: u,
    sortModifiers: f,
    postfixLookupClassGroupIds: p
  } = o, g = [], m = n.trim().split(xT);
  let d = "";
  for (let v = m.length - 1; v >= 0; v -= 1) {
    const x = m[v], {
      isExternal: S,
      modifiers: C,
      hasImportantModifier: E,
      baseClassName: M,
      maybePostfixModifierPosition: T
    } = a(x);
    if (S) {
      d = x + (d.length > 0 ? " " + d : d);
      continue;
    }
    let z = !!T, w;
    if (z) {
      const _ = M.substring(0, T);
      w = i(_);
      const j = w && p[w] ? i(M) : void 0;
      j && j !== w && (w = j, z = !1);
    } else
      w = i(M);
    if (!w) {
      if (!z) {
        d = x + (d.length > 0 ? " " + d : d);
        continue;
      }
      if (w = i(M), !w) {
        d = x + (d.length > 0 ? " " + d : d);
        continue;
      }
      z = !1;
    }
    const N = C.length === 0 ? "" : C.length === 1 ? C[0] : f(C).join(":"), A = E ? N + rp : N, L = A + w;
    if (g.indexOf(L) > -1)
      continue;
    g.push(L);
    const D = u(w, z);
    for (let _ = 0; _ < D.length; ++_) {
      const j = D[_];
      g.push(A + j);
    }
    d = x + (d.length > 0 ? " " + d : d);
  }
  return d;
}, ST = (...n) => {
  let o = 0, a, i, u = "";
  for (; o < n.length; )
    (a = n[o++]) && (i = e0(a)) && (u && (u += " "), u += i);
  return u;
}, e0 = (n) => {
  if (typeof n == "string")
    return n;
  let o, a = "";
  for (let i = 0; i < n.length; i++)
    n[i] && (o = e0(n[i])) && (a && (a += " "), a += o);
  return a;
}, ET = (n, ...o) => {
  let a, i, u, f;
  const p = (m) => {
    const d = o.reduce((v, x) => x(v), n());
    return a = vT(d), i = a.cache.get, u = a.cache.set, f = g, g(m);
  }, g = (m) => {
    const d = i(m);
    if (d)
      return d;
    const v = wT(m, a);
    return u(m, v), v;
  };
  return f = p, (...m) => f(ST(...m));
}, TT = [], nn = (n) => {
  const o = (a) => a[n] || TT;
  return o.isThemeGetter = !0, o;
}, t0 = /^\[(?:(\w[\w-]*):)?(.+)\]$/i, n0 = /^\((?:(\w[\w-]*):)?(.+)\)$/i, RT = /^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/, CT = /^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/, OT = /\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/, MT = /^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix)\(.+\)$/, AT = /^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/, zT = /^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/, Oo = (n) => RT.test(n), Ze = (n) => !!n && !Number.isNaN(Number(n)), dl = (n) => !!n && Number.isInteger(Number(n)), Bd = (n) => n.endsWith("%") && Ze(n.slice(0, -1)), Ul = (n) => CT.test(n), l0 = () => !0, NT = (n) => (
  // `colorFunctionRegex` check is necessary because color functions can have percentages in them which which would be incorrectly classified as lengths.
  // For example, `hsl(0 0% 0%)` would be classified as a length without this check.
  // I could also use lookbehind assertion in `lengthUnitRegex` but that isn't supported widely enough.
  OT.test(n) && !MT.test(n)
), _p = () => !1, jT = (n) => AT.test(n), DT = (n) => zT.test(n), kT = (n) => !Me(n) && !Ae(n), _T = (n) => n.startsWith("@container") && (n[10] === "/" && n[11] !== void 0 || n[11] === "s" && n[16] !== void 0 && n.startsWith("-size/", 10) || n[11] === "n" && n[18] !== void 0 && n.startsWith("-normal/", 10)), HT = (n) => jo(n, a0, _p), Me = (n) => t0.test(n), lr = (n) => jo(n, i0, NT), Av = (n) => jo(n, GT, Ze), LT = (n) => jo(n, c0, l0), UT = (n) => jo(n, s0, _p), zv = (n) => jo(n, o0, _p), BT = (n) => jo(n, r0, DT), Fs = (n) => jo(n, u0, jT), Ae = (n) => n0.test(n), oi = (n) => gr(n, i0), IT = (n) => gr(n, s0), Nv = (n) => gr(n, o0), VT = (n) => gr(n, a0), PT = (n) => gr(n, r0), Ks = (n) => gr(n, u0, !0), YT = (n) => gr(n, c0, !0), jo = (n, o, a) => {
  const i = t0.exec(n);
  return i ? i[1] ? o(i[1]) : a(i[2]) : !1;
}, gr = (n, o, a = !1) => {
  const i = n0.exec(n);
  return i ? i[1] ? o(i[1]) : a : !1;
}, o0 = (n) => n === "position" || n === "percentage", r0 = (n) => n === "image" || n === "url", a0 = (n) => n === "length" || n === "size" || n === "bg-size", i0 = (n) => n === "length", GT = (n) => n === "number", s0 = (n) => n === "family-name", c0 = (n) => n === "number" || n === "weight", u0 = (n) => n === "shadow", qT = () => {
  const n = nn("color"), o = nn("font"), a = nn("text"), i = nn("font-weight"), u = nn("tracking"), f = nn("leading"), p = nn("breakpoint"), g = nn("container"), m = nn("spacing"), d = nn("radius"), v = nn("shadow"), x = nn("inset-shadow"), S = nn("text-shadow"), C = nn("drop-shadow"), E = nn("blur"), M = nn("perspective"), T = nn("aspect"), z = nn("ease"), w = nn("animate"), N = () => ["auto", "avoid", "all", "avoid-page", "page", "left", "right", "column"], A = () => [
    "center",
    "top",
    "bottom",
    "left",
    "right",
    "top-left",
    // Deprecated since Tailwind CSS v4.1.0, see https://github.com/tailwindlabs/tailwindcss/pull/17378
    "left-top",
    "top-right",
    // Deprecated since Tailwind CSS v4.1.0, see https://github.com/tailwindlabs/tailwindcss/pull/17378
    "right-top",
    "bottom-right",
    // Deprecated since Tailwind CSS v4.1.0, see https://github.com/tailwindlabs/tailwindcss/pull/17378
    "right-bottom",
    "bottom-left",
    // Deprecated since Tailwind CSS v4.1.0, see https://github.com/tailwindlabs/tailwindcss/pull/17378
    "left-bottom"
  ], L = () => [...A(), Ae, Me], D = () => ["auto", "hidden", "clip", "visible", "scroll"], _ = () => ["auto", "contain", "none"], j = () => [Ae, Me, m], V = () => [Oo, "full", "auto", ...j()], G = () => [dl, "none", "subgrid", Ae, Me], ne = () => ["auto", {
    span: ["full", dl, Ae, Me]
  }, dl, Ae, Me], F = () => [dl, "auto", Ae, Me], Q = () => ["auto", "min", "max", "fr", Ae, Me], Z = () => ["start", "end", "center", "between", "around", "evenly", "stretch", "baseline", "center-safe", "end-safe"], q = () => ["start", "end", "center", "stretch", "center-safe", "end-safe"], k = () => ["auto", ...j()], P = () => [Oo, "auto", "full", "dvw", "dvh", "lvw", "lvh", "svw", "svh", "min", "max", "fit", ...j()], I = () => [Oo, "screen", "full", "dvw", "lvw", "svw", "min", "max", "fit", ...j()], X = () => [Oo, "screen", "full", "lh", "dvh", "lvh", "svh", "min", "max", "fit", ...j()], B = () => [n, Ae, Me], O = () => [...A(), Nv, zv, {
    position: [Ae, Me]
  }], H = () => ["no-repeat", {
    repeat: ["", "x", "y", "space", "round"]
  }], ee = () => ["auto", "cover", "contain", VT, HT, {
    size: [Ae, Me]
  }], J = () => [Bd, oi, lr], le = () => [
    // Deprecated since Tailwind CSS v4.0.0
    "",
    "none",
    "full",
    d,
    Ae,
    Me
  ], ie = () => ["", Ze, oi, lr], re = () => ["solid", "dashed", "dotted", "double"], se = () => ["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity"], ge = () => [Ze, Bd, Nv, zv], De = () => [
    // Deprecated since Tailwind CSS v4.0.0
    "",
    "none",
    E,
    Ae,
    Me
  ], Ee = () => ["none", Ze, Ae, Me], ue = () => ["none", Ze, Ae, Me], he = () => [Ze, Ae, Me], ye = () => [Oo, "full", ...j()];
  return {
    cacheSize: 500,
    theme: {
      animate: ["spin", "ping", "pulse", "bounce"],
      aspect: ["video"],
      blur: [Ul],
      breakpoint: [Ul],
      color: [l0],
      container: [Ul],
      "drop-shadow": [Ul],
      ease: ["in", "out", "in-out"],
      font: [kT],
      "font-weight": ["thin", "extralight", "light", "normal", "medium", "semibold", "bold", "extrabold", "black"],
      "inset-shadow": [Ul],
      leading: ["none", "tight", "snug", "normal", "relaxed", "loose"],
      perspective: ["dramatic", "near", "normal", "midrange", "distant", "none"],
      radius: [Ul],
      shadow: [Ul],
      spacing: ["px", Ze],
      text: [Ul],
      "text-shadow": [Ul],
      tracking: ["tighter", "tight", "normal", "wide", "wider", "widest"]
    },
    classGroups: {
      // --------------
      // --- Layout ---
      // --------------
      /**
       * Aspect Ratio
       * @see https://tailwindcss.com/docs/aspect-ratio
       */
      aspect: [{
        aspect: ["auto", "square", Oo, Me, Ae, T]
      }],
      /**
       * Container
       * @see https://tailwindcss.com/docs/container
       * @deprecated since Tailwind CSS v4.0.0
       */
      container: ["container"],
      /**
       * Container Type
       * @see https://tailwindcss.com/docs/responsive-design#container-queries
       */
      "container-type": [{
        "@container": ["", "normal", "size", Ae, Me]
      }],
      /**
       * Container Name
       * @see https://tailwindcss.com/docs/responsive-design#named-containers
       */
      "container-named": [_T],
      /**
       * Columns
       * @see https://tailwindcss.com/docs/columns
       */
      columns: [{
        columns: [Ze, Me, Ae, g]
      }],
      /**
       * Break After
       * @see https://tailwindcss.com/docs/break-after
       */
      "break-after": [{
        "break-after": N()
      }],
      /**
       * Break Before
       * @see https://tailwindcss.com/docs/break-before
       */
      "break-before": [{
        "break-before": N()
      }],
      /**
       * Break Inside
       * @see https://tailwindcss.com/docs/break-inside
       */
      "break-inside": [{
        "break-inside": ["auto", "avoid", "avoid-page", "avoid-column"]
      }],
      /**
       * Box Decoration Break
       * @see https://tailwindcss.com/docs/box-decoration-break
       */
      "box-decoration": [{
        "box-decoration": ["slice", "clone"]
      }],
      /**
       * Box Sizing
       * @see https://tailwindcss.com/docs/box-sizing
       */
      box: [{
        box: ["border", "content"]
      }],
      /**
       * Display
       * @see https://tailwindcss.com/docs/display
       */
      display: ["block", "inline-block", "inline", "flex", "inline-flex", "table", "inline-table", "table-caption", "table-cell", "table-column", "table-column-group", "table-footer-group", "table-header-group", "table-row-group", "table-row", "flow-root", "grid", "inline-grid", "contents", "list-item", "hidden"],
      /**
       * Screen Reader Only
       * @see https://tailwindcss.com/docs/display#screen-reader-only
       */
      sr: ["sr-only", "not-sr-only"],
      /**
       * Floats
       * @see https://tailwindcss.com/docs/float
       */
      float: [{
        float: ["right", "left", "none", "start", "end"]
      }],
      /**
       * Clear
       * @see https://tailwindcss.com/docs/clear
       */
      clear: [{
        clear: ["left", "right", "both", "none", "start", "end"]
      }],
      /**
       * Isolation
       * @see https://tailwindcss.com/docs/isolation
       */
      isolation: ["isolate", "isolation-auto"],
      /**
       * Object Fit
       * @see https://tailwindcss.com/docs/object-fit
       */
      "object-fit": [{
        object: ["contain", "cover", "fill", "none", "scale-down"]
      }],
      /**
       * Object Position
       * @see https://tailwindcss.com/docs/object-position
       */
      "object-position": [{
        object: L()
      }],
      /**
       * Overflow
       * @see https://tailwindcss.com/docs/overflow
       */
      overflow: [{
        overflow: D()
      }],
      /**
       * Overflow X
       * @see https://tailwindcss.com/docs/overflow
       */
      "overflow-x": [{
        "overflow-x": D()
      }],
      /**
       * Overflow Y
       * @see https://tailwindcss.com/docs/overflow
       */
      "overflow-y": [{
        "overflow-y": D()
      }],
      /**
       * Overscroll Behavior
       * @see https://tailwindcss.com/docs/overscroll-behavior
       */
      overscroll: [{
        overscroll: _()
      }],
      /**
       * Overscroll Behavior X
       * @see https://tailwindcss.com/docs/overscroll-behavior
       */
      "overscroll-x": [{
        "overscroll-x": _()
      }],
      /**
       * Overscroll Behavior Y
       * @see https://tailwindcss.com/docs/overscroll-behavior
       */
      "overscroll-y": [{
        "overscroll-y": _()
      }],
      /**
       * Position
       * @see https://tailwindcss.com/docs/position
       */
      position: ["static", "fixed", "absolute", "relative", "sticky"],
      /**
       * Inset
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      inset: [{
        inset: V()
      }],
      /**
       * Inset Inline
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      "inset-x": [{
        "inset-x": V()
      }],
      /**
       * Inset Block
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      "inset-y": [{
        "inset-y": V()
      }],
      /**
       * Inset Inline Start
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       * @todo class group will be renamed to `inset-s` in next major release
       */
      start: [{
        "inset-s": V(),
        /**
         * @deprecated since Tailwind CSS v4.2.0 in favor of `inset-s-*` utilities.
         * @see https://github.com/tailwindlabs/tailwindcss/pull/19613
         */
        start: V()
      }],
      /**
       * Inset Inline End
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       * @todo class group will be renamed to `inset-e` in next major release
       */
      end: [{
        "inset-e": V(),
        /**
         * @deprecated since Tailwind CSS v4.2.0 in favor of `inset-e-*` utilities.
         * @see https://github.com/tailwindlabs/tailwindcss/pull/19613
         */
        end: V()
      }],
      /**
       * Inset Block Start
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      "inset-bs": [{
        "inset-bs": V()
      }],
      /**
       * Inset Block End
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      "inset-be": [{
        "inset-be": V()
      }],
      /**
       * Top
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      top: [{
        top: V()
      }],
      /**
       * Right
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      right: [{
        right: V()
      }],
      /**
       * Bottom
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      bottom: [{
        bottom: V()
      }],
      /**
       * Left
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      left: [{
        left: V()
      }],
      /**
       * Visibility
       * @see https://tailwindcss.com/docs/visibility
       */
      visibility: ["visible", "invisible", "collapse"],
      /**
       * Z-Index
       * @see https://tailwindcss.com/docs/z-index
       */
      z: [{
        z: [dl, "auto", Ae, Me]
      }],
      // ------------------------
      // --- Flexbox and Grid ---
      // ------------------------
      /**
       * Flex Basis
       * @see https://tailwindcss.com/docs/flex-basis
       */
      basis: [{
        basis: [Oo, "full", "auto", g, ...j()]
      }],
      /**
       * Flex Direction
       * @see https://tailwindcss.com/docs/flex-direction
       */
      "flex-direction": [{
        flex: ["row", "row-reverse", "col", "col-reverse"]
      }],
      /**
       * Flex Wrap
       * @see https://tailwindcss.com/docs/flex-wrap
       */
      "flex-wrap": [{
        flex: ["nowrap", "wrap", "wrap-reverse"]
      }],
      /**
       * Flex
       * @see https://tailwindcss.com/docs/flex
       */
      flex: [{
        flex: [Ze, Oo, "auto", "initial", "none", Me]
      }],
      /**
       * Flex Grow
       * @see https://tailwindcss.com/docs/flex-grow
       */
      grow: [{
        grow: ["", Ze, Ae, Me]
      }],
      /**
       * Flex Shrink
       * @see https://tailwindcss.com/docs/flex-shrink
       */
      shrink: [{
        shrink: ["", Ze, Ae, Me]
      }],
      /**
       * Order
       * @see https://tailwindcss.com/docs/order
       */
      order: [{
        order: [dl, "first", "last", "none", Ae, Me]
      }],
      /**
       * Grid Template Columns
       * @see https://tailwindcss.com/docs/grid-template-columns
       */
      "grid-cols": [{
        "grid-cols": G()
      }],
      /**
       * Grid Column Start / End
       * @see https://tailwindcss.com/docs/grid-column
       */
      "col-start-end": [{
        col: ne()
      }],
      /**
       * Grid Column Start
       * @see https://tailwindcss.com/docs/grid-column
       */
      "col-start": [{
        "col-start": F()
      }],
      /**
       * Grid Column End
       * @see https://tailwindcss.com/docs/grid-column
       */
      "col-end": [{
        "col-end": F()
      }],
      /**
       * Grid Template Rows
       * @see https://tailwindcss.com/docs/grid-template-rows
       */
      "grid-rows": [{
        "grid-rows": G()
      }],
      /**
       * Grid Row Start / End
       * @see https://tailwindcss.com/docs/grid-row
       */
      "row-start-end": [{
        row: ne()
      }],
      /**
       * Grid Row Start
       * @see https://tailwindcss.com/docs/grid-row
       */
      "row-start": [{
        "row-start": F()
      }],
      /**
       * Grid Row End
       * @see https://tailwindcss.com/docs/grid-row
       */
      "row-end": [{
        "row-end": F()
      }],
      /**
       * Grid Auto Flow
       * @see https://tailwindcss.com/docs/grid-auto-flow
       */
      "grid-flow": [{
        "grid-flow": ["row", "col", "dense", "row-dense", "col-dense"]
      }],
      /**
       * Grid Auto Columns
       * @see https://tailwindcss.com/docs/grid-auto-columns
       */
      "auto-cols": [{
        "auto-cols": Q()
      }],
      /**
       * Grid Auto Rows
       * @see https://tailwindcss.com/docs/grid-auto-rows
       */
      "auto-rows": [{
        "auto-rows": Q()
      }],
      /**
       * Gap
       * @see https://tailwindcss.com/docs/gap
       */
      gap: [{
        gap: j()
      }],
      /**
       * Gap X
       * @see https://tailwindcss.com/docs/gap
       */
      "gap-x": [{
        "gap-x": j()
      }],
      /**
       * Gap Y
       * @see https://tailwindcss.com/docs/gap
       */
      "gap-y": [{
        "gap-y": j()
      }],
      /**
       * Justify Content
       * @see https://tailwindcss.com/docs/justify-content
       */
      "justify-content": [{
        justify: [...Z(), "normal"]
      }],
      /**
       * Justify Items
       * @see https://tailwindcss.com/docs/justify-items
       */
      "justify-items": [{
        "justify-items": [...q(), "normal"]
      }],
      /**
       * Justify Self
       * @see https://tailwindcss.com/docs/justify-self
       */
      "justify-self": [{
        "justify-self": ["auto", ...q()]
      }],
      /**
       * Align Content
       * @see https://tailwindcss.com/docs/align-content
       */
      "align-content": [{
        content: ["normal", ...Z()]
      }],
      /**
       * Align Items
       * @see https://tailwindcss.com/docs/align-items
       */
      "align-items": [{
        items: [...q(), {
          baseline: ["", "last"]
        }]
      }],
      /**
       * Align Self
       * @see https://tailwindcss.com/docs/align-self
       */
      "align-self": [{
        self: ["auto", ...q(), {
          baseline: ["", "last"]
        }]
      }],
      /**
       * Place Content
       * @see https://tailwindcss.com/docs/place-content
       */
      "place-content": [{
        "place-content": Z()
      }],
      /**
       * Place Items
       * @see https://tailwindcss.com/docs/place-items
       */
      "place-items": [{
        "place-items": [...q(), "baseline"]
      }],
      /**
       * Place Self
       * @see https://tailwindcss.com/docs/place-self
       */
      "place-self": [{
        "place-self": ["auto", ...q()]
      }],
      // Spacing
      /**
       * Padding
       * @see https://tailwindcss.com/docs/padding
       */
      p: [{
        p: j()
      }],
      /**
       * Padding Inline
       * @see https://tailwindcss.com/docs/padding
       */
      px: [{
        px: j()
      }],
      /**
       * Padding Block
       * @see https://tailwindcss.com/docs/padding
       */
      py: [{
        py: j()
      }],
      /**
       * Padding Inline Start
       * @see https://tailwindcss.com/docs/padding
       */
      ps: [{
        ps: j()
      }],
      /**
       * Padding Inline End
       * @see https://tailwindcss.com/docs/padding
       */
      pe: [{
        pe: j()
      }],
      /**
       * Padding Block Start
       * @see https://tailwindcss.com/docs/padding
       */
      pbs: [{
        pbs: j()
      }],
      /**
       * Padding Block End
       * @see https://tailwindcss.com/docs/padding
       */
      pbe: [{
        pbe: j()
      }],
      /**
       * Padding Top
       * @see https://tailwindcss.com/docs/padding
       */
      pt: [{
        pt: j()
      }],
      /**
       * Padding Right
       * @see https://tailwindcss.com/docs/padding
       */
      pr: [{
        pr: j()
      }],
      /**
       * Padding Bottom
       * @see https://tailwindcss.com/docs/padding
       */
      pb: [{
        pb: j()
      }],
      /**
       * Padding Left
       * @see https://tailwindcss.com/docs/padding
       */
      pl: [{
        pl: j()
      }],
      /**
       * Margin
       * @see https://tailwindcss.com/docs/margin
       */
      m: [{
        m: k()
      }],
      /**
       * Margin Inline
       * @see https://tailwindcss.com/docs/margin
       */
      mx: [{
        mx: k()
      }],
      /**
       * Margin Block
       * @see https://tailwindcss.com/docs/margin
       */
      my: [{
        my: k()
      }],
      /**
       * Margin Inline Start
       * @see https://tailwindcss.com/docs/margin
       */
      ms: [{
        ms: k()
      }],
      /**
       * Margin Inline End
       * @see https://tailwindcss.com/docs/margin
       */
      me: [{
        me: k()
      }],
      /**
       * Margin Block Start
       * @see https://tailwindcss.com/docs/margin
       */
      mbs: [{
        mbs: k()
      }],
      /**
       * Margin Block End
       * @see https://tailwindcss.com/docs/margin
       */
      mbe: [{
        mbe: k()
      }],
      /**
       * Margin Top
       * @see https://tailwindcss.com/docs/margin
       */
      mt: [{
        mt: k()
      }],
      /**
       * Margin Right
       * @see https://tailwindcss.com/docs/margin
       */
      mr: [{
        mr: k()
      }],
      /**
       * Margin Bottom
       * @see https://tailwindcss.com/docs/margin
       */
      mb: [{
        mb: k()
      }],
      /**
       * Margin Left
       * @see https://tailwindcss.com/docs/margin
       */
      ml: [{
        ml: k()
      }],
      /**
       * Space Between X
       * @see https://tailwindcss.com/docs/margin#adding-space-between-children
       */
      "space-x": [{
        "space-x": j()
      }],
      /**
       * Space Between X Reverse
       * @see https://tailwindcss.com/docs/margin#adding-space-between-children
       */
      "space-x-reverse": ["space-x-reverse"],
      /**
       * Space Between Y
       * @see https://tailwindcss.com/docs/margin#adding-space-between-children
       */
      "space-y": [{
        "space-y": j()
      }],
      /**
       * Space Between Y Reverse
       * @see https://tailwindcss.com/docs/margin#adding-space-between-children
       */
      "space-y-reverse": ["space-y-reverse"],
      // --------------
      // --- Sizing ---
      // --------------
      /**
       * Size
       * @see https://tailwindcss.com/docs/width#setting-both-width-and-height
       */
      size: [{
        size: P()
      }],
      /**
       * Inline Size
       * @see https://tailwindcss.com/docs/width
       */
      "inline-size": [{
        inline: ["auto", ...I()]
      }],
      /**
       * Min-Inline Size
       * @see https://tailwindcss.com/docs/min-width
       */
      "min-inline-size": [{
        "min-inline": ["auto", ...I()]
      }],
      /**
       * Max-Inline Size
       * @see https://tailwindcss.com/docs/max-width
       */
      "max-inline-size": [{
        "max-inline": ["none", ...I()]
      }],
      /**
       * Block Size
       * @see https://tailwindcss.com/docs/height
       */
      "block-size": [{
        block: ["auto", ...X()]
      }],
      /**
       * Min-Block Size
       * @see https://tailwindcss.com/docs/min-height
       */
      "min-block-size": [{
        "min-block": ["auto", ...X()]
      }],
      /**
       * Max-Block Size
       * @see https://tailwindcss.com/docs/max-height
       */
      "max-block-size": [{
        "max-block": ["none", ...X()]
      }],
      /**
       * Width
       * @see https://tailwindcss.com/docs/width
       */
      w: [{
        w: [g, "screen", ...P()]
      }],
      /**
       * Min-Width
       * @see https://tailwindcss.com/docs/min-width
       */
      "min-w": [{
        "min-w": [
          g,
          "screen",
          /** Deprecated. @see https://github.com/tailwindlabs/tailwindcss.com/issues/2027#issuecomment-2620152757 */
          "none",
          ...P()
        ]
      }],
      /**
       * Max-Width
       * @see https://tailwindcss.com/docs/max-width
       */
      "max-w": [{
        "max-w": [
          g,
          "screen",
          "none",
          /** Deprecated since Tailwind CSS v4.0.0. @see https://github.com/tailwindlabs/tailwindcss.com/issues/2027#issuecomment-2620152757 */
          "prose",
          /** Deprecated since Tailwind CSS v4.0.0. @see https://github.com/tailwindlabs/tailwindcss.com/issues/2027#issuecomment-2620152757 */
          {
            screen: [p]
          },
          ...P()
        ]
      }],
      /**
       * Height
       * @see https://tailwindcss.com/docs/height
       */
      h: [{
        h: ["screen", "lh", ...P()]
      }],
      /**
       * Min-Height
       * @see https://tailwindcss.com/docs/min-height
       */
      "min-h": [{
        "min-h": ["screen", "lh", "none", ...P()]
      }],
      /**
       * Max-Height
       * @see https://tailwindcss.com/docs/max-height
       */
      "max-h": [{
        "max-h": ["screen", "lh", ...P()]
      }],
      // ------------------
      // --- Typography ---
      // ------------------
      /**
       * Font Size
       * @see https://tailwindcss.com/docs/font-size
       */
      "font-size": [{
        text: ["base", a, oi, lr]
      }],
      /**
       * Font Smoothing
       * @see https://tailwindcss.com/docs/font-smoothing
       */
      "font-smoothing": ["antialiased", "subpixel-antialiased"],
      /**
       * Font Style
       * @see https://tailwindcss.com/docs/font-style
       */
      "font-style": ["italic", "not-italic"],
      /**
       * Font Weight
       * @see https://tailwindcss.com/docs/font-weight
       */
      "font-weight": [{
        font: [i, YT, LT]
      }],
      /**
       * Font Stretch
       * @see https://tailwindcss.com/docs/font-stretch
       */
      "font-stretch": [{
        "font-stretch": ["ultra-condensed", "extra-condensed", "condensed", "semi-condensed", "normal", "semi-expanded", "expanded", "extra-expanded", "ultra-expanded", Bd, Me]
      }],
      /**
       * Font Family
       * @see https://tailwindcss.com/docs/font-family
       */
      "font-family": [{
        font: [IT, UT, o]
      }],
      /**
       * Font Feature Settings
       * @see https://tailwindcss.com/docs/font-feature-settings
       */
      "font-features": [{
        "font-features": [Me]
      }],
      /**
       * Font Variant Numeric
       * @see https://tailwindcss.com/docs/font-variant-numeric
       */
      "fvn-normal": ["normal-nums"],
      /**
       * Font Variant Numeric
       * @see https://tailwindcss.com/docs/font-variant-numeric
       */
      "fvn-ordinal": ["ordinal"],
      /**
       * Font Variant Numeric
       * @see https://tailwindcss.com/docs/font-variant-numeric
       */
      "fvn-slashed-zero": ["slashed-zero"],
      /**
       * Font Variant Numeric
       * @see https://tailwindcss.com/docs/font-variant-numeric
       */
      "fvn-figure": ["lining-nums", "oldstyle-nums"],
      /**
       * Font Variant Numeric
       * @see https://tailwindcss.com/docs/font-variant-numeric
       */
      "fvn-spacing": ["proportional-nums", "tabular-nums"],
      /**
       * Font Variant Numeric
       * @see https://tailwindcss.com/docs/font-variant-numeric
       */
      "fvn-fraction": ["diagonal-fractions", "stacked-fractions"],
      /**
       * Letter Spacing
       * @see https://tailwindcss.com/docs/letter-spacing
       */
      tracking: [{
        tracking: [u, Ae, Me]
      }],
      /**
       * Line Clamp
       * @see https://tailwindcss.com/docs/line-clamp
       */
      "line-clamp": [{
        "line-clamp": [Ze, "none", Ae, Av]
      }],
      /**
       * Line Height
       * @see https://tailwindcss.com/docs/line-height
       */
      leading: [{
        leading: [
          /** Deprecated since Tailwind CSS v4.0.0. @see https://github.com/tailwindlabs/tailwindcss.com/issues/2027#issuecomment-2620152757 */
          f,
          ...j()
        ]
      }],
      /**
       * List Style Image
       * @see https://tailwindcss.com/docs/list-style-image
       */
      "list-image": [{
        "list-image": ["none", Ae, Me]
      }],
      /**
       * List Style Position
       * @see https://tailwindcss.com/docs/list-style-position
       */
      "list-style-position": [{
        list: ["inside", "outside"]
      }],
      /**
       * List Style Type
       * @see https://tailwindcss.com/docs/list-style-type
       */
      "list-style-type": [{
        list: ["disc", "decimal", "none", Ae, Me]
      }],
      /**
       * Text Alignment
       * @see https://tailwindcss.com/docs/text-align
       */
      "text-alignment": [{
        text: ["left", "center", "right", "justify", "start", "end"]
      }],
      /**
       * Placeholder Color
       * @deprecated since Tailwind CSS v3.0.0
       * @see https://v3.tailwindcss.com/docs/placeholder-color
       */
      "placeholder-color": [{
        placeholder: B()
      }],
      /**
       * Text Color
       * @see https://tailwindcss.com/docs/text-color
       */
      "text-color": [{
        text: B()
      }],
      /**
       * Text Decoration
       * @see https://tailwindcss.com/docs/text-decoration
       */
      "text-decoration": ["underline", "overline", "line-through", "no-underline"],
      /**
       * Text Decoration Style
       * @see https://tailwindcss.com/docs/text-decoration-style
       */
      "text-decoration-style": [{
        decoration: [...re(), "wavy"]
      }],
      /**
       * Text Decoration Thickness
       * @see https://tailwindcss.com/docs/text-decoration-thickness
       */
      "text-decoration-thickness": [{
        decoration: [Ze, "from-font", "auto", Ae, lr]
      }],
      /**
       * Text Decoration Color
       * @see https://tailwindcss.com/docs/text-decoration-color
       */
      "text-decoration-color": [{
        decoration: B()
      }],
      /**
       * Text Underline Offset
       * @see https://tailwindcss.com/docs/text-underline-offset
       */
      "underline-offset": [{
        "underline-offset": [Ze, "auto", Ae, Me]
      }],
      /**
       * Text Transform
       * @see https://tailwindcss.com/docs/text-transform
       */
      "text-transform": ["uppercase", "lowercase", "capitalize", "normal-case"],
      /**
       * Text Overflow
       * @see https://tailwindcss.com/docs/text-overflow
       */
      "text-overflow": ["truncate", "text-ellipsis", "text-clip"],
      /**
       * Text Wrap
       * @see https://tailwindcss.com/docs/text-wrap
       */
      "text-wrap": [{
        text: ["wrap", "nowrap", "balance", "pretty"]
      }],
      /**
       * Text Indent
       * @see https://tailwindcss.com/docs/text-indent
       */
      indent: [{
        indent: j()
      }],
      /**
       * Tab Size
       * @see https://tailwindcss.com/docs/tab-size
       */
      "tab-size": [{
        tab: [dl, Ae, Me]
      }],
      /**
       * Vertical Alignment
       * @see https://tailwindcss.com/docs/vertical-align
       */
      "vertical-align": [{
        align: ["baseline", "top", "middle", "bottom", "text-top", "text-bottom", "sub", "super", Ae, Me]
      }],
      /**
       * Whitespace
       * @see https://tailwindcss.com/docs/whitespace
       */
      whitespace: [{
        whitespace: ["normal", "nowrap", "pre", "pre-line", "pre-wrap", "break-spaces"]
      }],
      /**
       * Word Break
       * @see https://tailwindcss.com/docs/word-break
       */
      break: [{
        break: ["normal", "words", "all", "keep"]
      }],
      /**
       * Overflow Wrap
       * @see https://tailwindcss.com/docs/overflow-wrap
       */
      wrap: [{
        wrap: ["break-word", "anywhere", "normal"]
      }],
      /**
       * Hyphens
       * @see https://tailwindcss.com/docs/hyphens
       */
      hyphens: [{
        hyphens: ["none", "manual", "auto"]
      }],
      /**
       * Content
       * @see https://tailwindcss.com/docs/content
       */
      content: [{
        content: ["none", Ae, Me]
      }],
      // -------------------
      // --- Backgrounds ---
      // -------------------
      /**
       * Background Attachment
       * @see https://tailwindcss.com/docs/background-attachment
       */
      "bg-attachment": [{
        bg: ["fixed", "local", "scroll"]
      }],
      /**
       * Background Clip
       * @see https://tailwindcss.com/docs/background-clip
       */
      "bg-clip": [{
        "bg-clip": ["border", "padding", "content", "text"]
      }],
      /**
       * Background Origin
       * @see https://tailwindcss.com/docs/background-origin
       */
      "bg-origin": [{
        "bg-origin": ["border", "padding", "content"]
      }],
      /**
       * Background Position
       * @see https://tailwindcss.com/docs/background-position
       */
      "bg-position": [{
        bg: O()
      }],
      /**
       * Background Repeat
       * @see https://tailwindcss.com/docs/background-repeat
       */
      "bg-repeat": [{
        bg: H()
      }],
      /**
       * Background Size
       * @see https://tailwindcss.com/docs/background-size
       */
      "bg-size": [{
        bg: ee()
      }],
      /**
       * Background Image
       * @see https://tailwindcss.com/docs/background-image
       */
      "bg-image": [{
        bg: ["none", {
          linear: [{
            to: ["t", "tr", "r", "br", "b", "bl", "l", "tl"]
          }, dl, Ae, Me],
          radial: ["", Ae, Me],
          conic: [dl, Ae, Me]
        }, PT, BT]
      }],
      /**
       * Background Color
       * @see https://tailwindcss.com/docs/background-color
       */
      "bg-color": [{
        bg: B()
      }],
      /**
       * Gradient Color Stops From Position
       * @see https://tailwindcss.com/docs/gradient-color-stops
       */
      "gradient-from-pos": [{
        from: J()
      }],
      /**
       * Gradient Color Stops Via Position
       * @see https://tailwindcss.com/docs/gradient-color-stops
       */
      "gradient-via-pos": [{
        via: J()
      }],
      /**
       * Gradient Color Stops To Position
       * @see https://tailwindcss.com/docs/gradient-color-stops
       */
      "gradient-to-pos": [{
        to: J()
      }],
      /**
       * Gradient Color Stops From
       * @see https://tailwindcss.com/docs/gradient-color-stops
       */
      "gradient-from": [{
        from: B()
      }],
      /**
       * Gradient Color Stops Via
       * @see https://tailwindcss.com/docs/gradient-color-stops
       */
      "gradient-via": [{
        via: B()
      }],
      /**
       * Gradient Color Stops To
       * @see https://tailwindcss.com/docs/gradient-color-stops
       */
      "gradient-to": [{
        to: B()
      }],
      // ---------------
      // --- Borders ---
      // ---------------
      /**
       * Border Radius
       * @see https://tailwindcss.com/docs/border-radius
       */
      rounded: [{
        rounded: le()
      }],
      /**
       * Border Radius Start
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-s": [{
        "rounded-s": le()
      }],
      /**
       * Border Radius End
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-e": [{
        "rounded-e": le()
      }],
      /**
       * Border Radius Top
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-t": [{
        "rounded-t": le()
      }],
      /**
       * Border Radius Right
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-r": [{
        "rounded-r": le()
      }],
      /**
       * Border Radius Bottom
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-b": [{
        "rounded-b": le()
      }],
      /**
       * Border Radius Left
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-l": [{
        "rounded-l": le()
      }],
      /**
       * Border Radius Start Start
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-ss": [{
        "rounded-ss": le()
      }],
      /**
       * Border Radius Start End
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-se": [{
        "rounded-se": le()
      }],
      /**
       * Border Radius End End
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-ee": [{
        "rounded-ee": le()
      }],
      /**
       * Border Radius End Start
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-es": [{
        "rounded-es": le()
      }],
      /**
       * Border Radius Top Left
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-tl": [{
        "rounded-tl": le()
      }],
      /**
       * Border Radius Top Right
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-tr": [{
        "rounded-tr": le()
      }],
      /**
       * Border Radius Bottom Right
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-br": [{
        "rounded-br": le()
      }],
      /**
       * Border Radius Bottom Left
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-bl": [{
        "rounded-bl": le()
      }],
      /**
       * Border Width
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w": [{
        border: ie()
      }],
      /**
       * Border Width Inline
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-x": [{
        "border-x": ie()
      }],
      /**
       * Border Width Block
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-y": [{
        "border-y": ie()
      }],
      /**
       * Border Width Inline Start
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-s": [{
        "border-s": ie()
      }],
      /**
       * Border Width Inline End
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-e": [{
        "border-e": ie()
      }],
      /**
       * Border Width Block Start
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-bs": [{
        "border-bs": ie()
      }],
      /**
       * Border Width Block End
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-be": [{
        "border-be": ie()
      }],
      /**
       * Border Width Top
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-t": [{
        "border-t": ie()
      }],
      /**
       * Border Width Right
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-r": [{
        "border-r": ie()
      }],
      /**
       * Border Width Bottom
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-b": [{
        "border-b": ie()
      }],
      /**
       * Border Width Left
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-l": [{
        "border-l": ie()
      }],
      /**
       * Divide Width X
       * @see https://tailwindcss.com/docs/border-width#between-children
       */
      "divide-x": [{
        "divide-x": ie()
      }],
      /**
       * Divide Width X Reverse
       * @see https://tailwindcss.com/docs/border-width#between-children
       */
      "divide-x-reverse": ["divide-x-reverse"],
      /**
       * Divide Width Y
       * @see https://tailwindcss.com/docs/border-width#between-children
       */
      "divide-y": [{
        "divide-y": ie()
      }],
      /**
       * Divide Width Y Reverse
       * @see https://tailwindcss.com/docs/border-width#between-children
       */
      "divide-y-reverse": ["divide-y-reverse"],
      /**
       * Border Style
       * @see https://tailwindcss.com/docs/border-style
       */
      "border-style": [{
        border: [...re(), "hidden", "none"]
      }],
      /**
       * Divide Style
       * @see https://tailwindcss.com/docs/border-style#setting-the-divider-style
       */
      "divide-style": [{
        divide: [...re(), "hidden", "none"]
      }],
      /**
       * Border Color
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color": [{
        border: B()
      }],
      /**
       * Border Color Inline
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-x": [{
        "border-x": B()
      }],
      /**
       * Border Color Block
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-y": [{
        "border-y": B()
      }],
      /**
       * Border Color Inline Start
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-s": [{
        "border-s": B()
      }],
      /**
       * Border Color Inline End
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-e": [{
        "border-e": B()
      }],
      /**
       * Border Color Block Start
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-bs": [{
        "border-bs": B()
      }],
      /**
       * Border Color Block End
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-be": [{
        "border-be": B()
      }],
      /**
       * Border Color Top
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-t": [{
        "border-t": B()
      }],
      /**
       * Border Color Right
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-r": [{
        "border-r": B()
      }],
      /**
       * Border Color Bottom
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-b": [{
        "border-b": B()
      }],
      /**
       * Border Color Left
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-l": [{
        "border-l": B()
      }],
      /**
       * Divide Color
       * @see https://tailwindcss.com/docs/divide-color
       */
      "divide-color": [{
        divide: B()
      }],
      /**
       * Outline Style
       * @see https://tailwindcss.com/docs/outline-style
       */
      "outline-style": [{
        outline: [...re(), "none", "hidden"]
      }],
      /**
       * Outline Offset
       * @see https://tailwindcss.com/docs/outline-offset
       */
      "outline-offset": [{
        "outline-offset": [Ze, Ae, Me]
      }],
      /**
       * Outline Width
       * @see https://tailwindcss.com/docs/outline-width
       */
      "outline-w": [{
        outline: ["", Ze, oi, lr]
      }],
      /**
       * Outline Color
       * @see https://tailwindcss.com/docs/outline-color
       */
      "outline-color": [{
        outline: B()
      }],
      // ---------------
      // --- Effects ---
      // ---------------
      /**
       * Box Shadow
       * @see https://tailwindcss.com/docs/box-shadow
       */
      shadow: [{
        shadow: [
          // Deprecated since Tailwind CSS v4.0.0
          "",
          "none",
          v,
          Ks,
          Fs
        ]
      }],
      /**
       * Box Shadow Color
       * @see https://tailwindcss.com/docs/box-shadow#setting-the-shadow-color
       */
      "shadow-color": [{
        shadow: B()
      }],
      /**
       * Inset Box Shadow
       * @see https://tailwindcss.com/docs/box-shadow#adding-an-inset-shadow
       */
      "inset-shadow": [{
        "inset-shadow": ["none", x, Ks, Fs]
      }],
      /**
       * Inset Box Shadow Color
       * @see https://tailwindcss.com/docs/box-shadow#setting-the-inset-shadow-color
       */
      "inset-shadow-color": [{
        "inset-shadow": B()
      }],
      /**
       * Ring Width
       * @see https://tailwindcss.com/docs/box-shadow#adding-a-ring
       */
      "ring-w": [{
        ring: ie()
      }],
      /**
       * Ring Width Inset
       * @see https://v3.tailwindcss.com/docs/ring-width#inset-rings
       * @deprecated since Tailwind CSS v4.0.0
       * @see https://github.com/tailwindlabs/tailwindcss/blob/v4.0.0/packages/tailwindcss/src/utilities.ts#L4158
       */
      "ring-w-inset": ["ring-inset"],
      /**
       * Ring Color
       * @see https://tailwindcss.com/docs/box-shadow#setting-the-ring-color
       */
      "ring-color": [{
        ring: B()
      }],
      /**
       * Ring Offset Width
       * @see https://v3.tailwindcss.com/docs/ring-offset-width
       * @deprecated since Tailwind CSS v4.0.0
       * @see https://github.com/tailwindlabs/tailwindcss/blob/v4.0.0/packages/tailwindcss/src/utilities.ts#L4158
       */
      "ring-offset-w": [{
        "ring-offset": [Ze, lr]
      }],
      /**
       * Ring Offset Color
       * @see https://v3.tailwindcss.com/docs/ring-offset-color
       * @deprecated since Tailwind CSS v4.0.0
       * @see https://github.com/tailwindlabs/tailwindcss/blob/v4.0.0/packages/tailwindcss/src/utilities.ts#L4158
       */
      "ring-offset-color": [{
        "ring-offset": B()
      }],
      /**
       * Inset Ring Width
       * @see https://tailwindcss.com/docs/box-shadow#adding-an-inset-ring
       */
      "inset-ring-w": [{
        "inset-ring": ie()
      }],
      /**
       * Inset Ring Color
       * @see https://tailwindcss.com/docs/box-shadow#setting-the-inset-ring-color
       */
      "inset-ring-color": [{
        "inset-ring": B()
      }],
      /**
       * Text Shadow
       * @see https://tailwindcss.com/docs/text-shadow
       */
      "text-shadow": [{
        "text-shadow": ["none", S, Ks, Fs]
      }],
      /**
       * Text Shadow Color
       * @see https://tailwindcss.com/docs/text-shadow#setting-the-shadow-color
       */
      "text-shadow-color": [{
        "text-shadow": B()
      }],
      /**
       * Opacity
       * @see https://tailwindcss.com/docs/opacity
       */
      opacity: [{
        opacity: [Ze, Ae, Me]
      }],
      /**
       * Mix Blend Mode
       * @see https://tailwindcss.com/docs/mix-blend-mode
       */
      "mix-blend": [{
        "mix-blend": [...se(), "plus-darker", "plus-lighter"]
      }],
      /**
       * Background Blend Mode
       * @see https://tailwindcss.com/docs/background-blend-mode
       */
      "bg-blend": [{
        "bg-blend": se()
      }],
      /**
       * Mask Clip
       * @see https://tailwindcss.com/docs/mask-clip
       */
      "mask-clip": [{
        "mask-clip": ["border", "padding", "content", "fill", "stroke", "view"]
      }, "mask-no-clip"],
      /**
       * Mask Composite
       * @see https://tailwindcss.com/docs/mask-composite
       */
      "mask-composite": [{
        mask: ["add", "subtract", "intersect", "exclude"]
      }],
      /**
       * Mask Image
       * @see https://tailwindcss.com/docs/mask-image
       */
      "mask-image-linear-pos": [{
        "mask-linear": [Ze]
      }],
      "mask-image-linear-from-pos": [{
        "mask-linear-from": ge()
      }],
      "mask-image-linear-to-pos": [{
        "mask-linear-to": ge()
      }],
      "mask-image-linear-from-color": [{
        "mask-linear-from": B()
      }],
      "mask-image-linear-to-color": [{
        "mask-linear-to": B()
      }],
      "mask-image-t-from-pos": [{
        "mask-t-from": ge()
      }],
      "mask-image-t-to-pos": [{
        "mask-t-to": ge()
      }],
      "mask-image-t-from-color": [{
        "mask-t-from": B()
      }],
      "mask-image-t-to-color": [{
        "mask-t-to": B()
      }],
      "mask-image-r-from-pos": [{
        "mask-r-from": ge()
      }],
      "mask-image-r-to-pos": [{
        "mask-r-to": ge()
      }],
      "mask-image-r-from-color": [{
        "mask-r-from": B()
      }],
      "mask-image-r-to-color": [{
        "mask-r-to": B()
      }],
      "mask-image-b-from-pos": [{
        "mask-b-from": ge()
      }],
      "mask-image-b-to-pos": [{
        "mask-b-to": ge()
      }],
      "mask-image-b-from-color": [{
        "mask-b-from": B()
      }],
      "mask-image-b-to-color": [{
        "mask-b-to": B()
      }],
      "mask-image-l-from-pos": [{
        "mask-l-from": ge()
      }],
      "mask-image-l-to-pos": [{
        "mask-l-to": ge()
      }],
      "mask-image-l-from-color": [{
        "mask-l-from": B()
      }],
      "mask-image-l-to-color": [{
        "mask-l-to": B()
      }],
      "mask-image-x-from-pos": [{
        "mask-x-from": ge()
      }],
      "mask-image-x-to-pos": [{
        "mask-x-to": ge()
      }],
      "mask-image-x-from-color": [{
        "mask-x-from": B()
      }],
      "mask-image-x-to-color": [{
        "mask-x-to": B()
      }],
      "mask-image-y-from-pos": [{
        "mask-y-from": ge()
      }],
      "mask-image-y-to-pos": [{
        "mask-y-to": ge()
      }],
      "mask-image-y-from-color": [{
        "mask-y-from": B()
      }],
      "mask-image-y-to-color": [{
        "mask-y-to": B()
      }],
      "mask-image-radial": [{
        "mask-radial": [Ae, Me]
      }],
      "mask-image-radial-from-pos": [{
        "mask-radial-from": ge()
      }],
      "mask-image-radial-to-pos": [{
        "mask-radial-to": ge()
      }],
      "mask-image-radial-from-color": [{
        "mask-radial-from": B()
      }],
      "mask-image-radial-to-color": [{
        "mask-radial-to": B()
      }],
      "mask-image-radial-shape": [{
        "mask-radial": ["circle", "ellipse"]
      }],
      "mask-image-radial-size": [{
        "mask-radial": [{
          closest: ["side", "corner"],
          farthest: ["side", "corner"]
        }]
      }],
      "mask-image-radial-pos": [{
        "mask-radial-at": A()
      }],
      "mask-image-conic-pos": [{
        "mask-conic": [Ze]
      }],
      "mask-image-conic-from-pos": [{
        "mask-conic-from": ge()
      }],
      "mask-image-conic-to-pos": [{
        "mask-conic-to": ge()
      }],
      "mask-image-conic-from-color": [{
        "mask-conic-from": B()
      }],
      "mask-image-conic-to-color": [{
        "mask-conic-to": B()
      }],
      /**
       * Mask Mode
       * @see https://tailwindcss.com/docs/mask-mode
       */
      "mask-mode": [{
        mask: ["alpha", "luminance", "match"]
      }],
      /**
       * Mask Origin
       * @see https://tailwindcss.com/docs/mask-origin
       */
      "mask-origin": [{
        "mask-origin": ["border", "padding", "content", "fill", "stroke", "view"]
      }],
      /**
       * Mask Position
       * @see https://tailwindcss.com/docs/mask-position
       */
      "mask-position": [{
        mask: O()
      }],
      /**
       * Mask Repeat
       * @see https://tailwindcss.com/docs/mask-repeat
       */
      "mask-repeat": [{
        mask: H()
      }],
      /**
       * Mask Size
       * @see https://tailwindcss.com/docs/mask-size
       */
      "mask-size": [{
        mask: ee()
      }],
      /**
       * Mask Type
       * @see https://tailwindcss.com/docs/mask-type
       */
      "mask-type": [{
        "mask-type": ["alpha", "luminance"]
      }],
      /**
       * Mask Image
       * @see https://tailwindcss.com/docs/mask-image
       */
      "mask-image": [{
        mask: ["none", Ae, Me]
      }],
      // ---------------
      // --- Filters ---
      // ---------------
      /**
       * Filter
       * @see https://tailwindcss.com/docs/filter
       */
      filter: [{
        filter: [
          // Deprecated since Tailwind CSS v3.0.0
          "",
          "none",
          Ae,
          Me
        ]
      }],
      /**
       * Blur
       * @see https://tailwindcss.com/docs/blur
       */
      blur: [{
        blur: De()
      }],
      /**
       * Brightness
       * @see https://tailwindcss.com/docs/brightness
       */
      brightness: [{
        brightness: [Ze, Ae, Me]
      }],
      /**
       * Contrast
       * @see https://tailwindcss.com/docs/contrast
       */
      contrast: [{
        contrast: [Ze, Ae, Me]
      }],
      /**
       * Drop Shadow
       * @see https://tailwindcss.com/docs/drop-shadow
       */
      "drop-shadow": [{
        "drop-shadow": [
          // Deprecated since Tailwind CSS v4.0.0
          "",
          "none",
          C,
          Ks,
          Fs
        ]
      }],
      /**
       * Drop Shadow Color
       * @see https://tailwindcss.com/docs/filter-drop-shadow#setting-the-shadow-color
       */
      "drop-shadow-color": [{
        "drop-shadow": B()
      }],
      /**
       * Grayscale
       * @see https://tailwindcss.com/docs/grayscale
       */
      grayscale: [{
        grayscale: ["", Ze, Ae, Me]
      }],
      /**
       * Hue Rotate
       * @see https://tailwindcss.com/docs/hue-rotate
       */
      "hue-rotate": [{
        "hue-rotate": [Ze, Ae, Me]
      }],
      /**
       * Invert
       * @see https://tailwindcss.com/docs/invert
       */
      invert: [{
        invert: ["", Ze, Ae, Me]
      }],
      /**
       * Saturate
       * @see https://tailwindcss.com/docs/saturate
       */
      saturate: [{
        saturate: [Ze, Ae, Me]
      }],
      /**
       * Sepia
       * @see https://tailwindcss.com/docs/sepia
       */
      sepia: [{
        sepia: ["", Ze, Ae, Me]
      }],
      /**
       * Backdrop Filter
       * @see https://tailwindcss.com/docs/backdrop-filter
       */
      "backdrop-filter": [{
        "backdrop-filter": [
          // Deprecated since Tailwind CSS v3.0.0
          "",
          "none",
          Ae,
          Me
        ]
      }],
      /**
       * Backdrop Blur
       * @see https://tailwindcss.com/docs/backdrop-blur
       */
      "backdrop-blur": [{
        "backdrop-blur": De()
      }],
      /**
       * Backdrop Brightness
       * @see https://tailwindcss.com/docs/backdrop-brightness
       */
      "backdrop-brightness": [{
        "backdrop-brightness": [Ze, Ae, Me]
      }],
      /**
       * Backdrop Contrast
       * @see https://tailwindcss.com/docs/backdrop-contrast
       */
      "backdrop-contrast": [{
        "backdrop-contrast": [Ze, Ae, Me]
      }],
      /**
       * Backdrop Grayscale
       * @see https://tailwindcss.com/docs/backdrop-grayscale
       */
      "backdrop-grayscale": [{
        "backdrop-grayscale": ["", Ze, Ae, Me]
      }],
      /**
       * Backdrop Hue Rotate
       * @see https://tailwindcss.com/docs/backdrop-hue-rotate
       */
      "backdrop-hue-rotate": [{
        "backdrop-hue-rotate": [Ze, Ae, Me]
      }],
      /**
       * Backdrop Invert
       * @see https://tailwindcss.com/docs/backdrop-invert
       */
      "backdrop-invert": [{
        "backdrop-invert": ["", Ze, Ae, Me]
      }],
      /**
       * Backdrop Opacity
       * @see https://tailwindcss.com/docs/backdrop-opacity
       */
      "backdrop-opacity": [{
        "backdrop-opacity": [Ze, Ae, Me]
      }],
      /**
       * Backdrop Saturate
       * @see https://tailwindcss.com/docs/backdrop-saturate
       */
      "backdrop-saturate": [{
        "backdrop-saturate": [Ze, Ae, Me]
      }],
      /**
       * Backdrop Sepia
       * @see https://tailwindcss.com/docs/backdrop-sepia
       */
      "backdrop-sepia": [{
        "backdrop-sepia": ["", Ze, Ae, Me]
      }],
      // --------------
      // --- Tables ---
      // --------------
      /**
       * Border Collapse
       * @see https://tailwindcss.com/docs/border-collapse
       */
      "border-collapse": [{
        border: ["collapse", "separate"]
      }],
      /**
       * Border Spacing
       * @see https://tailwindcss.com/docs/border-spacing
       */
      "border-spacing": [{
        "border-spacing": j()
      }],
      /**
       * Border Spacing X
       * @see https://tailwindcss.com/docs/border-spacing
       */
      "border-spacing-x": [{
        "border-spacing-x": j()
      }],
      /**
       * Border Spacing Y
       * @see https://tailwindcss.com/docs/border-spacing
       */
      "border-spacing-y": [{
        "border-spacing-y": j()
      }],
      /**
       * Table Layout
       * @see https://tailwindcss.com/docs/table-layout
       */
      "table-layout": [{
        table: ["auto", "fixed"]
      }],
      /**
       * Caption Side
       * @see https://tailwindcss.com/docs/caption-side
       */
      caption: [{
        caption: ["top", "bottom"]
      }],
      // ---------------------------------
      // --- Transitions and Animation ---
      // ---------------------------------
      /**
       * Transition Property
       * @see https://tailwindcss.com/docs/transition-property
       */
      transition: [{
        transition: ["", "all", "colors", "opacity", "shadow", "transform", "none", Ae, Me]
      }],
      /**
       * Transition Behavior
       * @see https://tailwindcss.com/docs/transition-behavior
       */
      "transition-behavior": [{
        transition: ["normal", "discrete"]
      }],
      /**
       * Transition Duration
       * @see https://tailwindcss.com/docs/transition-duration
       */
      duration: [{
        duration: [Ze, "initial", Ae, Me]
      }],
      /**
       * Transition Timing Function
       * @see https://tailwindcss.com/docs/transition-timing-function
       */
      ease: [{
        ease: ["linear", "initial", z, Ae, Me]
      }],
      /**
       * Transition Delay
       * @see https://tailwindcss.com/docs/transition-delay
       */
      delay: [{
        delay: [Ze, Ae, Me]
      }],
      /**
       * Animation
       * @see https://tailwindcss.com/docs/animation
       */
      animate: [{
        animate: ["none", w, Ae, Me]
      }],
      // ------------------
      // --- Transforms ---
      // ------------------
      /**
       * Backface Visibility
       * @see https://tailwindcss.com/docs/backface-visibility
       */
      backface: [{
        backface: ["hidden", "visible"]
      }],
      /**
       * Perspective
       * @see https://tailwindcss.com/docs/perspective
       */
      perspective: [{
        perspective: [M, Ae, Me]
      }],
      /**
       * Perspective Origin
       * @see https://tailwindcss.com/docs/perspective-origin
       */
      "perspective-origin": [{
        "perspective-origin": L()
      }],
      /**
       * Rotate
       * @see https://tailwindcss.com/docs/rotate
       */
      rotate: [{
        rotate: Ee()
      }],
      /**
       * Rotate X
       * @see https://tailwindcss.com/docs/rotate
       */
      "rotate-x": [{
        "rotate-x": Ee()
      }],
      /**
       * Rotate Y
       * @see https://tailwindcss.com/docs/rotate
       */
      "rotate-y": [{
        "rotate-y": Ee()
      }],
      /**
       * Rotate Z
       * @see https://tailwindcss.com/docs/rotate
       */
      "rotate-z": [{
        "rotate-z": Ee()
      }],
      /**
       * Scale
       * @see https://tailwindcss.com/docs/scale
       */
      scale: [{
        scale: ue()
      }],
      /**
       * Scale X
       * @see https://tailwindcss.com/docs/scale
       */
      "scale-x": [{
        "scale-x": ue()
      }],
      /**
       * Scale Y
       * @see https://tailwindcss.com/docs/scale
       */
      "scale-y": [{
        "scale-y": ue()
      }],
      /**
       * Scale Z
       * @see https://tailwindcss.com/docs/scale
       */
      "scale-z": [{
        "scale-z": ue()
      }],
      /**
       * Scale 3D
       * @see https://tailwindcss.com/docs/scale
       */
      "scale-3d": ["scale-3d"],
      /**
       * Skew
       * @see https://tailwindcss.com/docs/skew
       */
      skew: [{
        skew: he()
      }],
      /**
       * Skew X
       * @see https://tailwindcss.com/docs/skew
       */
      "skew-x": [{
        "skew-x": he()
      }],
      /**
       * Skew Y
       * @see https://tailwindcss.com/docs/skew
       */
      "skew-y": [{
        "skew-y": he()
      }],
      /**
       * Transform
       * @see https://tailwindcss.com/docs/transform
       */
      transform: [{
        transform: [Ae, Me, "", "none", "gpu", "cpu"]
      }],
      /**
       * Transform Origin
       * @see https://tailwindcss.com/docs/transform-origin
       */
      "transform-origin": [{
        origin: L()
      }],
      /**
       * Transform Style
       * @see https://tailwindcss.com/docs/transform-style
       */
      "transform-style": [{
        transform: ["3d", "flat"]
      }],
      /**
       * Translate
       * @see https://tailwindcss.com/docs/translate
       */
      translate: [{
        translate: ye()
      }],
      /**
       * Translate X
       * @see https://tailwindcss.com/docs/translate
       */
      "translate-x": [{
        "translate-x": ye()
      }],
      /**
       * Translate Y
       * @see https://tailwindcss.com/docs/translate
       */
      "translate-y": [{
        "translate-y": ye()
      }],
      /**
       * Translate Z
       * @see https://tailwindcss.com/docs/translate
       */
      "translate-z": [{
        "translate-z": ye()
      }],
      /**
       * Translate None
       * @see https://tailwindcss.com/docs/translate
       */
      "translate-none": ["translate-none"],
      /**
       * Zoom
       * @see https://tailwindcss.com/docs/zoom
       */
      zoom: [{
        zoom: [dl, Ae, Me]
      }],
      // ---------------------
      // --- Interactivity ---
      // ---------------------
      /**
       * Accent Color
       * @see https://tailwindcss.com/docs/accent-color
       */
      accent: [{
        accent: B()
      }],
      /**
       * Appearance
       * @see https://tailwindcss.com/docs/appearance
       */
      appearance: [{
        appearance: ["none", "auto"]
      }],
      /**
       * Caret Color
       * @see https://tailwindcss.com/docs/just-in-time-mode#caret-color-utilities
       */
      "caret-color": [{
        caret: B()
      }],
      /**
       * Color Scheme
       * @see https://tailwindcss.com/docs/color-scheme
       */
      "color-scheme": [{
        scheme: ["normal", "dark", "light", "light-dark", "only-dark", "only-light"]
      }],
      /**
       * Cursor
       * @see https://tailwindcss.com/docs/cursor
       */
      cursor: [{
        cursor: ["auto", "default", "pointer", "wait", "text", "move", "help", "not-allowed", "none", "context-menu", "progress", "cell", "crosshair", "vertical-text", "alias", "copy", "no-drop", "grab", "grabbing", "all-scroll", "col-resize", "row-resize", "n-resize", "e-resize", "s-resize", "w-resize", "ne-resize", "nw-resize", "se-resize", "sw-resize", "ew-resize", "ns-resize", "nesw-resize", "nwse-resize", "zoom-in", "zoom-out", Ae, Me]
      }],
      /**
       * Field Sizing
       * @see https://tailwindcss.com/docs/field-sizing
       */
      "field-sizing": [{
        "field-sizing": ["fixed", "content"]
      }],
      /**
       * Pointer Events
       * @see https://tailwindcss.com/docs/pointer-events
       */
      "pointer-events": [{
        "pointer-events": ["auto", "none"]
      }],
      /**
       * Resize
       * @see https://tailwindcss.com/docs/resize
       */
      resize: [{
        resize: ["none", "", "y", "x"]
      }],
      /**
       * Scroll Behavior
       * @see https://tailwindcss.com/docs/scroll-behavior
       */
      "scroll-behavior": [{
        scroll: ["auto", "smooth"]
      }],
      /**
       * Scrollbar Thumb Color
       * @see https://tailwindcss.com/docs/scrollbar-color
       */
      "scrollbar-thumb-color": [{
        "scrollbar-thumb": B()
      }],
      /**
       * Scrollbar Track Color
       * @see https://tailwindcss.com/docs/scrollbar-color
       */
      "scrollbar-track-color": [{
        "scrollbar-track": B()
      }],
      /**
       * Scrollbar Gutter
       * @see https://tailwindcss.com/docs/scrollbar-gutter
       */
      "scrollbar-gutter": [{
        "scrollbar-gutter": ["auto", "stable", "both"]
      }],
      /**
       * Scrollbar Width
       * @see https://tailwindcss.com/docs/scrollbar-width
       */
      "scrollbar-w": [{
        scrollbar: ["auto", "thin", "none"]
      }],
      /**
       * Scroll Margin
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-m": [{
        "scroll-m": j()
      }],
      /**
       * Scroll Margin Inline
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-mx": [{
        "scroll-mx": j()
      }],
      /**
       * Scroll Margin Block
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-my": [{
        "scroll-my": j()
      }],
      /**
       * Scroll Margin Inline Start
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-ms": [{
        "scroll-ms": j()
      }],
      /**
       * Scroll Margin Inline End
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-me": [{
        "scroll-me": j()
      }],
      /**
       * Scroll Margin Block Start
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-mbs": [{
        "scroll-mbs": j()
      }],
      /**
       * Scroll Margin Block End
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-mbe": [{
        "scroll-mbe": j()
      }],
      /**
       * Scroll Margin Top
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-mt": [{
        "scroll-mt": j()
      }],
      /**
       * Scroll Margin Right
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-mr": [{
        "scroll-mr": j()
      }],
      /**
       * Scroll Margin Bottom
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-mb": [{
        "scroll-mb": j()
      }],
      /**
       * Scroll Margin Left
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-ml": [{
        "scroll-ml": j()
      }],
      /**
       * Scroll Padding
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-p": [{
        "scroll-p": j()
      }],
      /**
       * Scroll Padding Inline
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-px": [{
        "scroll-px": j()
      }],
      /**
       * Scroll Padding Block
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-py": [{
        "scroll-py": j()
      }],
      /**
       * Scroll Padding Inline Start
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-ps": [{
        "scroll-ps": j()
      }],
      /**
       * Scroll Padding Inline End
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-pe": [{
        "scroll-pe": j()
      }],
      /**
       * Scroll Padding Block Start
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-pbs": [{
        "scroll-pbs": j()
      }],
      /**
       * Scroll Padding Block End
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-pbe": [{
        "scroll-pbe": j()
      }],
      /**
       * Scroll Padding Top
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-pt": [{
        "scroll-pt": j()
      }],
      /**
       * Scroll Padding Right
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-pr": [{
        "scroll-pr": j()
      }],
      /**
       * Scroll Padding Bottom
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-pb": [{
        "scroll-pb": j()
      }],
      /**
       * Scroll Padding Left
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-pl": [{
        "scroll-pl": j()
      }],
      /**
       * Scroll Snap Align
       * @see https://tailwindcss.com/docs/scroll-snap-align
       */
      "snap-align": [{
        snap: ["start", "end", "center", "align-none"]
      }],
      /**
       * Scroll Snap Stop
       * @see https://tailwindcss.com/docs/scroll-snap-stop
       */
      "snap-stop": [{
        snap: ["normal", "always"]
      }],
      /**
       * Scroll Snap Type
       * @see https://tailwindcss.com/docs/scroll-snap-type
       */
      "snap-type": [{
        snap: ["none", "x", "y", "both"]
      }],
      /**
       * Scroll Snap Type Strictness
       * @see https://tailwindcss.com/docs/scroll-snap-type
       */
      "snap-strictness": [{
        snap: ["mandatory", "proximity"]
      }],
      /**
       * Touch Action
       * @see https://tailwindcss.com/docs/touch-action
       */
      touch: [{
        touch: ["auto", "none", "manipulation"]
      }],
      /**
       * Touch Action X
       * @see https://tailwindcss.com/docs/touch-action
       */
      "touch-x": [{
        "touch-pan": ["x", "left", "right"]
      }],
      /**
       * Touch Action Y
       * @see https://tailwindcss.com/docs/touch-action
       */
      "touch-y": [{
        "touch-pan": ["y", "up", "down"]
      }],
      /**
       * Touch Action Pinch Zoom
       * @see https://tailwindcss.com/docs/touch-action
       */
      "touch-pz": ["touch-pinch-zoom"],
      /**
       * User Select
       * @see https://tailwindcss.com/docs/user-select
       */
      select: [{
        select: ["none", "text", "all", "auto"]
      }],
      /**
       * Will Change
       * @see https://tailwindcss.com/docs/will-change
       */
      "will-change": [{
        "will-change": ["auto", "scroll", "contents", "transform", Ae, Me]
      }],
      // -----------
      // --- SVG ---
      // -----------
      /**
       * Fill
       * @see https://tailwindcss.com/docs/fill
       */
      fill: [{
        fill: ["none", ...B()]
      }],
      /**
       * Stroke Width
       * @see https://tailwindcss.com/docs/stroke-width
       */
      "stroke-w": [{
        stroke: [Ze, oi, lr, Av]
      }],
      /**
       * Stroke
       * @see https://tailwindcss.com/docs/stroke
       */
      stroke: [{
        stroke: ["none", ...B()]
      }],
      // ---------------------
      // --- Accessibility ---
      // ---------------------
      /**
       * Forced Color Adjust
       * @see https://tailwindcss.com/docs/forced-color-adjust
       */
      "forced-color-adjust": [{
        "forced-color-adjust": ["auto", "none"]
      }]
    },
    conflictingClassGroups: {
      "container-named": ["container-type"],
      overflow: ["overflow-x", "overflow-y"],
      overscroll: ["overscroll-x", "overscroll-y"],
      inset: ["inset-x", "inset-y", "inset-bs", "inset-be", "start", "end", "top", "right", "bottom", "left"],
      "inset-x": ["right", "left"],
      "inset-y": ["top", "bottom"],
      flex: ["basis", "grow", "shrink"],
      gap: ["gap-x", "gap-y"],
      p: ["px", "py", "ps", "pe", "pbs", "pbe", "pt", "pr", "pb", "pl"],
      px: ["pr", "pl"],
      py: ["pt", "pb"],
      m: ["mx", "my", "ms", "me", "mbs", "mbe", "mt", "mr", "mb", "ml"],
      mx: ["mr", "ml"],
      my: ["mt", "mb"],
      size: ["w", "h"],
      "font-size": ["leading"],
      "fvn-normal": ["fvn-ordinal", "fvn-slashed-zero", "fvn-figure", "fvn-spacing", "fvn-fraction"],
      "fvn-ordinal": ["fvn-normal"],
      "fvn-slashed-zero": ["fvn-normal"],
      "fvn-figure": ["fvn-normal"],
      "fvn-spacing": ["fvn-normal"],
      "fvn-fraction": ["fvn-normal"],
      "line-clamp": ["display", "overflow"],
      rounded: ["rounded-s", "rounded-e", "rounded-t", "rounded-r", "rounded-b", "rounded-l", "rounded-ss", "rounded-se", "rounded-ee", "rounded-es", "rounded-tl", "rounded-tr", "rounded-br", "rounded-bl"],
      "rounded-s": ["rounded-ss", "rounded-es"],
      "rounded-e": ["rounded-se", "rounded-ee"],
      "rounded-t": ["rounded-tl", "rounded-tr"],
      "rounded-r": ["rounded-tr", "rounded-br"],
      "rounded-b": ["rounded-br", "rounded-bl"],
      "rounded-l": ["rounded-tl", "rounded-bl"],
      "border-spacing": ["border-spacing-x", "border-spacing-y"],
      "border-w": ["border-w-x", "border-w-y", "border-w-s", "border-w-e", "border-w-bs", "border-w-be", "border-w-t", "border-w-r", "border-w-b", "border-w-l"],
      "border-w-x": ["border-w-r", "border-w-l"],
      "border-w-y": ["border-w-t", "border-w-b"],
      "border-color": ["border-color-x", "border-color-y", "border-color-s", "border-color-e", "border-color-bs", "border-color-be", "border-color-t", "border-color-r", "border-color-b", "border-color-l"],
      "border-color-x": ["border-color-r", "border-color-l"],
      "border-color-y": ["border-color-t", "border-color-b"],
      translate: ["translate-x", "translate-y", "translate-none"],
      "translate-none": ["translate", "translate-x", "translate-y", "translate-z"],
      "scroll-m": ["scroll-mx", "scroll-my", "scroll-ms", "scroll-me", "scroll-mbs", "scroll-mbe", "scroll-mt", "scroll-mr", "scroll-mb", "scroll-ml"],
      "scroll-mx": ["scroll-mr", "scroll-ml"],
      "scroll-my": ["scroll-mt", "scroll-mb"],
      "scroll-p": ["scroll-px", "scroll-py", "scroll-ps", "scroll-pe", "scroll-pbs", "scroll-pbe", "scroll-pt", "scroll-pr", "scroll-pb", "scroll-pl"],
      "scroll-px": ["scroll-pr", "scroll-pl"],
      "scroll-py": ["scroll-pt", "scroll-pb"],
      touch: ["touch-x", "touch-y", "touch-pz"],
      "touch-x": ["touch"],
      "touch-y": ["touch"],
      "touch-pz": ["touch"]
    },
    conflictingClassGroupModifiers: {
      "font-size": ["leading"]
    },
    postfixLookupClassGroups: ["container-type"],
    orderSensitiveModifiers: ["*", "**", "after", "backdrop", "before", "details-content", "file", "first-letter", "first-line", "marker", "placeholder", "selection"]
  };
}, XT = /* @__PURE__ */ ET(qT);
function Fe(...n) {
  return XT(Zb(n));
}
const FT = ua(
  "tw:group/button tw:inline-flex tw:shrink-0 tw:items-center tw:justify-center tw:rounded-[var(--radius-control)] tw:border tw:border-transparent tw:bg-clip-padding tw:text-[length:var(--fs-body-s)] tw:text-foreground tw:font-medium tw:whitespace-nowrap tw:transition-[background-color,color,border-color,opacity,transform] tw:duration-[var(--motion-fast)] tw:ease-[var(--ease-out)] tw:outline-none tw:select-none tw:focus-visible:outline tw:focus-visible:outline-[var(--focus-ring-color)] tw:focus-visible:outline-offset-1 tw:active:not-aria-[haspopup]:scale-[0.98] tw:disabled:pointer-events-none tw:disabled:opacity-50 tw:aria-invalid:border-destructive tw:aria-invalid:outline tw:aria-invalid:outline-[var(--status-error)] tw:[&_svg]:pointer-events-none tw:[&_svg]:shrink-0 tw:[&_svg:not([class*=size-])]:size-4",
  {
    variants: {
      variant: {
        default: "tw:bg-primary tw:text-primary-foreground tw:hover:bg-primary/80",
        outline: "tw:border-border tw:bg-background tw:hover:bg-muted tw:hover:text-foreground tw:aria-expanded:bg-muted tw:aria-expanded:text-foreground",
        secondary: "tw:bg-secondary tw:text-secondary-foreground tw:hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] tw:aria-expanded:bg-secondary tw:aria-expanded:text-secondary-foreground",
        ghost: "tw:bg-transparent tw:hover:bg-muted tw:hover:text-foreground tw:aria-expanded:bg-muted tw:aria-expanded:text-foreground",
        destructive: "tw:bg-destructive/10 tw:text-destructive tw:hover:bg-destructive/20 tw:focus-visible:border-destructive/40",
        link: "tw:bg-transparent tw:text-primary tw:underline-offset-4 tw:hover:underline"
      },
      size: {
        default: "tw:h-8 tw:gap-1.5 tw:px-2.5 tw:has-data-[icon=inline-end]:pr-2 tw:has-data-[icon=inline-start]:pl-2",
        xs: "tw:h-6 tw:gap-1 tw:px-2 tw:text-xs tw:in-data-[slot=button-group]:rounded-lg tw:has-data-[icon=inline-end]:pr-1.5 tw:has-data-[icon=inline-start]:pl-1.5 tw:[&_svg:not([class*=size-])]:size-3",
        sm: "tw:h-7 tw:gap-1 tw:px-2.5 tw:text-xs tw:in-data-[slot=button-group]:rounded-lg tw:has-data-[icon=inline-end]:pr-1.5 tw:has-data-[icon=inline-start]:pl-1.5 tw:[&_svg:not([class*=size-])]:size-3.5",
        lg: "tw:h-9 tw:gap-1.5 tw:px-2.5 tw:has-data-[icon=inline-end]:pr-2 tw:has-data-[icon=inline-start]:pl-2",
        icon: "tw:size-8",
        "icon-xs": "tw:size-6 tw:in-data-[slot=button-group]:rounded-lg tw:[&_svg:not([class*=size-])]:size-3",
        "icon-sm": "tw:size-7 tw:in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "tw:size-9"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);
function Vt({
  className: n,
  variant: o = "default",
  size: a = "default",
  ...i
}) {
  return /* @__PURE__ */ b.jsx(
    tT,
    {
      "data-slot": "button",
      className: Fe(FT({ variant: o, size: a, className: n })),
      ...i
    }
  );
}
function sr({
  controlled: n,
  default: o,
  name: a,
  state: i = "value"
}) {
  const {
    current: u
  } = h.useRef(n !== void 0), [f, p] = h.useState(o), g = u ? n : f, m = h.useCallback((d) => {
    u || p(d);
  }, []);
  return [g, m];
}
let jv = 0;
function KT(n, o = "mui") {
  const [a, i] = h.useState(n), u = n || a;
  return h.useEffect(() => {
    a == null && (jv += 1, i(`${o}-${jv}`));
  }, [a, o]), u;
}
const Dv = Ap.useId;
function cr(n, o) {
  if (Dv !== void 0) {
    const a = Dv();
    return n ?? (o ? `${o}-${a}` : a);
  }
  return KT(n, o);
}
function wn(n) {
  return cr(n, "base-ui");
}
const f0 = /* @__PURE__ */ h.createContext(void 0);
function QT(n = !0) {
  const o = h.useContext(f0);
  if (o === void 0 && !n)
    throw new Error(Ct(7));
  return o;
}
const d0 = /* @__PURE__ */ h.createContext({
  register: () => {
  },
  unregister: () => {
  },
  subscribeMapChange: () => () => {
  },
  elementsRef: {
    current: []
  },
  nextIndexRef: {
    current: 0
  }
});
function ZT() {
  return h.useContext(d0);
}
let p0 = /* @__PURE__ */ (function(n) {
  return n[n.None = 0] = "None", n[n.GuessFromOrder = 1] = "GuessFromOrder", n;
})({});
function Ri(n = {}) {
  const {
    label: o,
    metadata: a,
    textRef: i,
    indexGuessBehavior: u,
    index: f
  } = n, {
    register: p,
    unregister: g,
    subscribeMapChange: m,
    elementsRef: d,
    labelsRef: v,
    nextIndexRef: x
  } = ZT(), S = h.useRef(-1), [C, E] = h.useState(f ?? (u === p0.GuessFromOrder ? () => {
    if (S.current === -1) {
      const z = x.current;
      x.current += 1, S.current = z;
    }
    return S.current;
  } : -1)), M = h.useRef(null), T = h.useCallback((z) => {
    if (M.current = z, C !== -1 && z !== null && (d.current[C] = z, v)) {
      const w = o !== void 0;
      v.current[C] = w ? o : i?.current?.textContent ?? z.textContent;
    }
  }, [C, d, v, o, i]);
  return we(() => {
    if (f != null)
      return;
    const z = M.current;
    if (z)
      return p(z, a), () => {
        g(z);
      };
  }, [f, p, g, a]), we(() => {
    if (f == null)
      return m((z) => {
        const w = M.current ? z.get(M.current)?.index : null;
        w != null && E(w);
      });
  }, [f, m, E]), {
    ref: T,
    index: C
  };
}
function JT(n = {}) {
  const {
    highlightItemOnHover: o,
    highlightedIndex: a,
    onHighlightedIndexChange: i
  } = jp(), {
    ref: u,
    index: f
  } = Ri(n), p = a === f, g = h.useRef(null), m = Kl(u, g);
  return {
    compositeProps: {
      tabIndex: p ? 0 : -1,
      onFocus() {
        i(f);
      },
      onMouseMove() {
        const v = g.current;
        if (!o || !v)
          return;
        const x = v.hasAttribute("disabled") || v.ariaDisabled === "true";
        !p && !x && v.focus();
      }
    },
    compositeRef: m,
    index: f
  };
}
function g0(n) {
  const {
    render: o,
    className: a,
    style: i,
    state: u = mt,
    props: f = Ql,
    refs: p = Ql,
    metadata: g,
    stateAttributesMapping: m,
    tag: d = "div",
    ...v
  } = n, {
    compositeProps: x,
    compositeRef: S
  } = JT({
    metadata: g
  });
  return $e(d, n, {
    state: u,
    ref: [...p, S],
    props: [x, ...f, v],
    stateAttributesMapping: m
  });
}
const eo = "none", Zl = "trigger-press", Pt = "trigger-hover", ta = "trigger-focus", Yc = "outside-press", na = "item-press", m0 = "close-press", Ao = "focus-out", Ci = "escape-key", ap = "list-navigation", h0 = "cancel-open", ci = "sibling-open", WT = "disabled", Gc = "imperative-action", $T = "window-resize";
function Pe(n, o, a, i) {
  let u = !1, f = !1;
  const p = i ?? mt;
  return {
    reason: n,
    event: o ?? new Event("base-ui"),
    cancel() {
      u = !0;
    },
    allowPropagation() {
      f = !0;
    },
    get isCanceled() {
      return u;
    },
    get isPropagationAllowed() {
      return f;
    },
    trigger: a,
    ...p
  };
}
const eR = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    className: i,
    defaultPressed: u = !1,
    disabled: f = !1,
    form: p,
    // never participates in form validation
    onPressedChange: g,
    pressed: m,
    render: d,
    type: v,
    // cannot change button type
    value: x,
    nativeButton: S = !0,
    style: C,
    ...E
  } = o, M = wn(x || void 0), T = QT(), z = T?.value ?? [], w = T ? void 0 : u, N = (f || T?.disabled) ?? !1, [A, L] = sr({
    controlled: T ? M !== void 0 && z.indexOf(M) > -1 : m,
    default: w,
    name: "Toggle",
    state: "pressed"
  }), {
    getButtonProps: D,
    buttonRef: _
  } = $l({
    disabled: N,
    native: S
  }), j = {
    disabled: N,
    pressed: A
  }, V = [_, a], G = [{
    "aria-pressed": A,
    onClick(Q) {
      const Z = !A, q = Pe(eo, Q.nativeEvent);
      g?.(Z, q), !q.isCanceled && (M && T?.setGroupValue?.(M, Z, q), !q.isCanceled && L(Z));
    }
  }, E, D], ne = $e("button", o, {
    enabled: !T,
    state: j,
    ref: V,
    props: G
  }), F = h.useMemo(() => ({
    disabled: N,
    focusableWhenDisabled: !1
  }), [N]);
  return T ? /* @__PURE__ */ b.jsx(g0, {
    tag: "button",
    render: d,
    className: i,
    style: C,
    metadata: F,
    state: j,
    refs: V,
    props: G
  }) : ne;
});
function Hp(n) {
  const {
    children: o,
    elementsRef: a,
    labelsRef: i,
    onMapChange: u
  } = n, f = ze(u), p = h.useRef(0), g = xn(nR).current, m = xn(tR).current, [d, v] = h.useState(0), x = h.useRef(d), S = ze((z, w) => {
    m.set(z, w ?? null), x.current += 1, v(x.current);
  }), C = ze((z) => {
    m.delete(z), x.current += 1, v(x.current);
  }), E = h.useMemo(() => {
    const z = /* @__PURE__ */ new Map();
    return Array.from(m.keys()).filter((N) => N.isConnected).sort(lR).forEach((N, A) => {
      const L = m.get(N) ?? {};
      z.set(N, {
        ...L,
        index: A
      });
    }), z;
  }, [m, d]);
  we(() => {
    if (typeof MutationObserver != "function" || E.size === 0)
      return;
    const z = new MutationObserver((w) => {
      const N = /* @__PURE__ */ new Set(), A = (L) => N.has(L) ? N.delete(L) : N.add(L);
      w.forEach((L) => {
        L.removedNodes.forEach(A), L.addedNodes.forEach(A);
      }), N.size === 0 && (x.current += 1, v(x.current));
    });
    return E.forEach((w, N) => {
      N.parentElement && z.observe(N.parentElement, {
        childList: !0
      });
    }), () => {
      z.disconnect();
    };
  }, [E]), we(() => {
    x.current === d && (a.current.length !== E.size && (a.current.length = E.size), i && i.current.length !== E.size && (i.current.length = E.size), p.current = E.size), f(E);
  }, [f, E, a, i, d]), we(() => () => {
    a.current = [];
  }, [a]), we(() => () => {
    i && (i.current = []);
  }, [i]);
  const M = ze((z) => (g.add(z), () => {
    g.delete(z);
  }));
  we(() => {
    g.forEach((z) => z(E));
  }, [g, E]);
  const T = h.useMemo(() => ({
    register: S,
    unregister: C,
    subscribeMapChange: M,
    elementsRef: a,
    labelsRef: i,
    nextIndexRef: p
  }), [S, C, M, a, i, p]);
  return /* @__PURE__ */ b.jsx(d0.Provider, {
    value: T,
    children: o
  });
}
function tR() {
  return /* @__PURE__ */ new Map();
}
function nR() {
  return /* @__PURE__ */ new Set();
}
function lR(n, o) {
  const a = n.compareDocumentPosition(o);
  return a & Node.DOCUMENT_POSITION_FOLLOWING || a & Node.DOCUMENT_POSITION_CONTAINED_BY ? -1 : a & Node.DOCUMENT_POSITION_PRECEDING || a & Node.DOCUMENT_POSITION_CONTAINS ? 1 : 0;
}
function y0(n) {
  return n == null || n.hasAttribute("disabled") || n.getAttribute("aria-disabled") === "true";
}
function oR() {
  return typeof navigator > "u" ? {
    userAgent: "",
    platform: "",
    maxTouchPoints: 0
  } : {
    userAgent: navigator.userAgent,
    platform: navigator.platform ?? "",
    maxTouchPoints: navigator.maxTouchPoints ?? 0
  };
}
const {
  userAgent: rR,
  platform: aR,
  maxTouchPoints: iR
} = oR(), qc = rR.toLowerCase(), xi = aR.toLowerCase(), Xc = /^i(os$|p)/.test(xi) || xi === "macintel" && iR > 1, kv = "android", ip = xi === kv || qc.includes(kv), Lp = !Xc && xi.startsWith("mac");
xi.startsWith("win");
const sR = Lp || Xc, Do = typeof CSS < "u" && !!CSS.supports?.("-webkit-backdrop-filter:none");
!Do && qc.includes("firefox");
!Do && qc.includes("chrom");
const cR = sR, Up = /jsdom|happydom/.test(qc), sp = "data-base-ui-focusable", v0 = "input:not([type='hidden']):not([disabled]),[contenteditable]:not([contenteditable='false']),textarea:not([disabled])", Fc = "ArrowLeft", Kc = "ArrowRight", b0 = "ArrowUp", Bp = "ArrowDown";
function bn(n) {
  let o = n.activeElement;
  for (; o?.shadowRoot?.activeElement != null; )
    o = o.shadowRoot.activeElement;
  return o;
}
function Ue(n, o) {
  if (!n || !o)
    return !1;
  const a = o.getRootNode?.();
  if (n.contains(o))
    return !0;
  if (a && aa(a)) {
    let i = o;
    for (; i; ) {
      if (n === i)
        return !0;
      i = i.parentNode || i.host;
    }
  }
  return !1;
}
function gn(n) {
  return "composedPath" in n ? n.composedPath()[0] : n.target;
}
function Oc(n, o) {
  if (!We(n))
    return !1;
  const a = n;
  if (o.hasElement(a))
    return !a.hasAttribute("data-trigger-disabled");
  for (const [, i] of o.entries())
    if (Ue(i, a))
      return !i.hasAttribute("data-trigger-disabled");
  return !1;
}
function Id(n, o) {
  if (o == null)
    return !1;
  if ("composedPath" in n)
    return n.composedPath().includes(o);
  const a = n;
  return a.target != null && o.contains(a.target);
}
function uR(n) {
  return n.matches("html,body");
}
function Qc(n) {
  return Rt(n) && n.matches(v0);
}
function fR(n) {
  return n?.closest(`button,a[href],[role="button"],select,[tabindex]:not([tabindex="-1"]),${v0}`) != null;
}
function cp(n) {
  return n ? n.getAttribute("role") === "combobox" && Qc(n) : !1;
}
function dR(n) {
  if (!n || Up)
    return !0;
  try {
    return n.matches(":focus-visible");
  } catch {
    return !0;
  }
}
function Mc(n) {
  return n ? n.hasAttribute(sp) ? n : n.querySelector(`[${sp}]`) || n : null;
}
function zo(n, o, a = !0) {
  return n.filter((u) => u.parentId === o).flatMap((u) => [...!a || u.context?.open ? [u] : [], ...zo(n, u.id, a)]);
}
function _v(n, o) {
  let a = [], i = n.find((u) => u.id === o)?.parentId;
  for (; i; ) {
    const u = n.find((f) => f.id === i);
    i = u?.parentId, u && (a = a.concat(u));
  }
  return a;
}
function pl(n) {
  n.preventDefault(), n.stopPropagation();
}
function pR(n) {
  return "nativeEvent" in n;
}
function Ip(n) {
  return n.pointerType === "" && n.isTrusted ? !0 : ip && n.pointerType ? n.type === "click" && n.buttons === 1 : n.detail === 0 && !n.pointerType;
}
function x0(n) {
  return Up ? !1 : !ip && n.width === 0 && n.height === 0 || ip && n.width === 1 && n.height === 1 && n.pressure === 0 && n.detail === 0 && n.pointerType === "mouse" || // iOS VoiceOver returns 0.333• for width/height.
  n.width < 1 && n.height < 1 && n.pressure === 0 && n.detail === 0 && n.pointerType === "touch";
}
function ur(n, o) {
  const a = ["mouse", "pen"];
  return o || a.push("", void 0), a.includes(n);
}
function gR(n) {
  const o = n.type;
  return o === "click" || o === "mousedown" || o === "keydown" || o === "keyup";
}
const mR = ["top", "right", "bottom", "left"], ia = Math.min, ql = Math.max, Ac = Math.round, Qs = Math.floor, Xl = (n) => ({
  x: n,
  y: n
}), hR = {
  left: "right",
  right: "left",
  bottom: "top",
  top: "bottom"
};
function w0(n, o, a) {
  return ql(n, ia(o, a));
}
function Jl(n, o) {
  return typeof n == "function" ? n(o) : n;
}
function In(n) {
  return n.split("-")[0];
}
function ko(n) {
  return n.split("-")[1];
}
function Vp(n) {
  return n === "x" ? "y" : "x";
}
function Pp(n) {
  return n === "y" ? "height" : "width";
}
function el(n) {
  const o = n[0];
  return o === "t" || o === "b" ? "y" : "x";
}
function Yp(n) {
  return Vp(el(n));
}
function yR(n, o, a) {
  a === void 0 && (a = !1);
  const i = ko(n), u = Yp(n), f = Pp(u);
  let p = u === "x" ? i === (a ? "end" : "start") ? "right" : "left" : i === "start" ? "bottom" : "top";
  return o.reference[f] > o.floating[f] && (p = zc(p)), [p, zc(p)];
}
function vR(n) {
  const o = zc(n);
  return [up(n), o, up(o)];
}
function up(n) {
  return n.includes("start") ? n.replace("start", "end") : n.replace("end", "start");
}
const Hv = ["left", "right"], Lv = ["right", "left"], bR = ["top", "bottom"], xR = ["bottom", "top"];
function wR(n, o, a) {
  switch (n) {
    case "top":
    case "bottom":
      return a ? o ? Lv : Hv : o ? Hv : Lv;
    case "left":
    case "right":
      return o ? bR : xR;
    default:
      return [];
  }
}
function SR(n, o, a, i) {
  const u = ko(n);
  let f = wR(In(n), a === "start", i);
  return u && (f = f.map((p) => p + "-" + u), o && (f = f.concat(f.map(up)))), f;
}
function zc(n) {
  const o = In(n);
  return hR[o] + n.slice(o.length);
}
function ER(n) {
  var o, a, i, u;
  return {
    top: (o = n.top) != null ? o : 0,
    right: (a = n.right) != null ? a : 0,
    bottom: (i = n.bottom) != null ? i : 0,
    left: (u = n.left) != null ? u : 0
  };
}
function S0(n) {
  return typeof n != "number" ? ER(n) : {
    top: n,
    right: n,
    bottom: n,
    left: n
  };
}
function wi(n) {
  const {
    x: o,
    y: a,
    width: i,
    height: u
  } = n;
  return {
    width: i,
    height: u,
    top: a,
    left: o,
    right: o + i,
    bottom: a + u,
    x: o,
    y: a
  };
}
function pi(n, o) {
  return o < 0 || o >= n.length;
}
function gc(n, o) {
  return Yl(n.current, {
    disabledIndices: o
  });
}
function fp(n, o) {
  return Yl(n.current, {
    decrement: !0,
    startingIndex: n.current.length,
    disabledIndices: o
  });
}
function Yl(n, {
  startingIndex: o = -1,
  decrement: a = !1,
  disabledIndices: i,
  amount: u = 1
} = {}) {
  let f = o;
  do
    f += a ? -u : u;
  while (f >= 0 && f <= n.length - 1 && Nc(n, f, i));
  return f;
}
function Nc(n, o, a) {
  if (typeof a == "function" ? a(o) : a?.includes(o) ?? !1)
    return !0;
  const u = n[o];
  return u ? Zc(u) ? !a && (u.hasAttribute("disabled") || u.getAttribute("aria-disabled") === "true") : !0 : !1;
}
function TR(n) {
  return n.visibility === "hidden" || n.visibility === "collapse";
}
function Zc(n, o = n ? Vn(n) : null) {
  return !n || !n.isConnected || !o || TR(o) ? !1 : typeof n.checkVisibility == "function" ? n.checkVisibility() : o.display !== "none" && o.display !== "contents";
}
function nt(n) {
  return n?.ownerDocument || document;
}
const RR = 'a[href],button,input,select,textarea,summary,details,iframe,object,embed,[tabindex],[contenteditable]:not([contenteditable="false"]),audio[controls],video[controls]';
function CR(n) {
  const o = n.assignedSlot;
  if (o)
    return o;
  if (n.parentElement)
    return n.parentElement;
  const a = n.getRootNode();
  return aa(a) ? a.host : null;
}
function dp(n) {
  for (const o of Array.from(n.children))
    if (mn(o) === "summary")
      return o;
  return null;
}
function OR(n, o) {
  const a = dp(o);
  return !!a && (n === a || Ue(a, n));
}
function E0(n) {
  const o = n ? mn(n) : "";
  return n != null && n.matches(RR) && (o !== "summary" || n.parentElement != null && mn(n.parentElement) === "details" && dp(n.parentElement) === n) && (o !== "details" || dp(n) == null) && (o !== "input" || n.type !== "hidden");
}
function T0(n) {
  if (!E0(n) || !n.isConnected || n.matches(":disabled"))
    return !1;
  for (let o = n; o; o = CR(o)) {
    const a = o !== n, i = mn(o) === "slot";
    if (o.hasAttribute("inert") || a && mn(o) === "details" && !o.open && !OR(n, o) || o.hasAttribute("hidden") || !i && !MR(o, a))
      return !1;
  }
  return !0;
}
function MR(n, o) {
  const a = Vn(n);
  return o ? a.display !== "none" : Zc(n, a);
}
function R0(n) {
  const o = n.tabIndex;
  if (o < 0) {
    const a = mn(n);
    if (a === "details" || a === "audio" || a === "video" || Rt(n) && n.isContentEditable)
      return 0;
  }
  return o;
}
function Vd(n) {
  if (mn(n) !== "input")
    return null;
  const o = n;
  return o.type === "radio" && o.name !== "" ? o : null;
}
function AR(n, o) {
  const a = Vd(n);
  if (!a)
    return !0;
  const i = o.find((u) => {
    const f = Vd(u);
    return f?.name === a.name && f.form === a.form && f.checked;
  });
  return i ? i === a : o.find((u) => {
    const f = Vd(u);
    return f?.name === a.name && f.form === a.form;
  }) === a;
}
function C0(n) {
  if (Rt(n) && mn(n) === "slot") {
    const o = n.assignedElements({
      flatten: !0
    });
    if (o.length > 0)
      return o;
  }
  return Rt(n) && n.shadowRoot ? Array.from(n.shadowRoot.children) : Array.from(n.children);
}
function O0(n, o) {
  C0(n).forEach((a) => {
    E0(a) && o.push(a), O0(a, o);
  });
}
function M0(n, o, a) {
  C0(n).forEach((i) => {
    Rt(i) && i.matches(o) && a.push(i), M0(i, o, a);
  });
}
function Gp(n) {
  return T0(n) && R0(n) >= 0;
}
function A0(n) {
  const o = [];
  return O0(n, o), o.filter(T0);
}
function Oi(n) {
  const o = A0(n);
  return o.filter((a) => R0(a) >= 0 && AR(a, o));
}
function z0(n, o) {
  const a = Oi(n), i = a.length;
  if (i === 0)
    return;
  const u = bn(nt(n)), f = a.indexOf(u), p = f === -1 ? o === 1 ? 0 : i - 1 : f + o;
  return a[p];
}
function qp(n) {
  return z0(nt(n).body, 1) || n;
}
function N0(n) {
  return z0(nt(n).body, -1) || n;
}
function j0(n, o) {
  if (!n)
    return null;
  const a = Oi(nt(n).body), i = a.length;
  if (i === 0)
    return null;
  const u = a.indexOf(n);
  if (u === -1)
    return null;
  const f = (u + o + i) % i;
  return a[f];
}
function zR(n) {
  return j0(n, 1);
}
function NR(n) {
  return j0(n, -1);
}
function la(n, o) {
  const a = o || n.currentTarget, i = n.relatedTarget;
  return !i || !Ue(a, i);
}
function jR(n) {
  Oi(n).forEach((a) => {
    a.dataset.tabindex = a.getAttribute("tabindex") || "", a.setAttribute("tabindex", "-1");
  });
}
function Uv(n) {
  const o = [];
  M0(n, "[data-tabindex]", o), o.forEach((a) => {
    const i = a.dataset.tabindex;
    delete a.dataset.tabindex, i ? a.setAttribute("tabindex", i) : a.removeAttribute("tabindex");
  });
}
const gi = "ArrowUp", mi = "ArrowDown", jc = "ArrowLeft", Dc = "ArrowRight", Jc = "Home", Wc = "End", D0 = /* @__PURE__ */ new Set([jc, Dc]), DR = /* @__PURE__ */ new Set([jc, Dc, Jc, Wc]), k0 = /* @__PURE__ */ new Set([gi, mi]), kR = /* @__PURE__ */ new Set([gi, mi, Jc, Wc]), _0 = /* @__PURE__ */ new Set([...D0, ...k0]), Mi = /* @__PURE__ */ new Set([..._0, Jc, Wc]), _R = "Shift", HR = "Control", LR = "Alt", UR = "Meta", BR = /* @__PURE__ */ new Set([_R, HR, LR, UR]);
function IR(n) {
  return Rt(n) && n.tagName === "INPUT";
}
function Bv(n) {
  return !!(IR(n) && n.selectionStart != null || Rt(n) && n.tagName === "TEXTAREA");
}
function Iv(n, o, a, i) {
  if (!n || !o || !o.scrollTo)
    return;
  let u = n.scrollLeft, f = n.scrollTop;
  const p = n.clientWidth < n.scrollWidth, g = n.clientHeight < n.scrollHeight;
  if (p && i !== "vertical") {
    const m = Vv(n, o, "left"), d = Zs(n), v = Zs(o);
    a === "ltr" && (m + o.offsetWidth + v.scrollMarginRight > n.scrollLeft + n.clientWidth - d.scrollPaddingRight ? u = m + o.offsetWidth + v.scrollMarginRight - n.clientWidth + d.scrollPaddingRight : m - v.scrollMarginLeft < n.scrollLeft + d.scrollPaddingLeft && (u = m - v.scrollMarginLeft - d.scrollPaddingLeft)), a === "rtl" && (m - v.scrollMarginRight < n.scrollLeft + d.scrollPaddingLeft ? u = m - v.scrollMarginLeft - d.scrollPaddingLeft : m + o.offsetWidth + v.scrollMarginRight > n.scrollLeft + n.clientWidth - d.scrollPaddingRight && (u = m + o.offsetWidth + v.scrollMarginRight - n.clientWidth + d.scrollPaddingRight));
  }
  if (g && i !== "horizontal") {
    const m = Vv(n, o, "top"), d = Zs(n), v = Zs(o);
    m - v.scrollMarginTop < n.scrollTop + d.scrollPaddingTop ? f = m - v.scrollMarginTop - d.scrollPaddingTop : m + o.offsetHeight + v.scrollMarginBottom > n.scrollTop + n.clientHeight - d.scrollPaddingBottom && (f = m + o.offsetHeight + v.scrollMarginBottom - n.clientHeight + d.scrollPaddingBottom);
  }
  n.scrollTo({
    left: u,
    top: f,
    behavior: "auto"
  });
}
function Vv(n, o, a) {
  const i = a === "left" ? "offsetLeft" : "offsetTop";
  let u = 0;
  for (; o.offsetParent && (u += o[i], o.offsetParent !== n); )
    o = o.offsetParent;
  return u;
}
function Zs(n) {
  const o = getComputedStyle(n);
  return {
    scrollMarginTop: parseFloat(o.scrollMarginTop) || 0,
    scrollMarginRight: parseFloat(o.scrollMarginRight) || 0,
    scrollMarginBottom: parseFloat(o.scrollMarginBottom) || 0,
    scrollMarginLeft: parseFloat(o.scrollMarginLeft) || 0,
    scrollPaddingTop: parseFloat(o.scrollPaddingTop) || 0,
    scrollPaddingRight: parseFloat(o.scrollPaddingRight) || 0,
    scrollPaddingBottom: parseFloat(o.scrollPaddingBottom) || 0,
    scrollPaddingLeft: parseFloat(o.scrollPaddingLeft) || 0
  };
}
const VR = "data-composite-item-active", PR = [];
function YR(n) {
  const {
    loopFocus: o = !0,
    orientation: a = "both",
    grid: i,
    onLoop: u,
    direction: f,
    highlightedIndex: p,
    onHighlightedIndexChange: g,
    rootRef: m,
    enableHomeAndEndKeys: d = !1,
    stopEventPropagation: v = !1,
    disabledIndices: x,
    modifierKeys: S = PR
  } = n, [C, E] = h.useState(0), M = i != null, T = h.useRef(null), z = Kl(T, m), w = h.useRef([]), N = h.useRef(!1), A = p ?? C, L = ze((G, ne = !1) => {
    if ((g ?? E)(G), ne) {
      const F = w.current[G];
      Iv(T.current, F, f, a);
    }
  }), D = ze((G) => {
    if (G.size === 0 || N.current)
      return;
    N.current = !0;
    const ne = Array.from(G.keys()), F = ne.find((Z) => Z?.hasAttribute(VR)) ?? null, Q = F ? ne.indexOf(F) : -1;
    if (Q !== -1)
      L(Q);
    else if (Nc(ne, A, x)) {
      const Z = Yl(ne, {
        disabledIndices: x
      });
      pi(ne, Z) || L(Z);
    }
    Iv(T.current, F, f, a);
  });
  we(() => {
    if (x == null || p != null || !N.current)
      return;
    const G = w.current;
    if (Nc(G, A, x)) {
      const ne = Yl(G, {
        disabledIndices: x
      });
      pi(G, ne) || L(ne);
    }
  }, [x, p, A, w, L]);
  const _ = ze((G, ne, F) => u ? u(G, ne, F, w) : F), j = ze((G) => {
    const ne = d ? Mi : _0;
    if (!ne.has(G.key) || GR(G, S) || !T.current)
      return;
    const Q = f === "rtl", Z = Q ? jc : Dc, q = {
      horizontal: Z,
      vertical: mi,
      both: Z
    }[a], k = Q ? Dc : jc, P = {
      horizontal: k,
      vertical: gi,
      both: k
    }[a], I = gn(G.nativeEvent);
    if (I != null && Bv(I) && !y0(I)) {
      const le = I.selectionStart, ie = I.selectionEnd, re = I.value ?? "";
      if (le == null || G.shiftKey || le !== ie || G.key !== P && le < re.length || G.key !== q && le > 0)
        return;
    }
    let X = A;
    const B = gc(w, x), O = fp(w, x);
    i != null && (X = i({
      disabledIndices: x,
      elementsRef: w,
      event: G,
      highlightedIndex: A,
      loopFocus: o,
      maxIndex: O,
      minIndex: B,
      onLoop: _,
      orientation: a,
      rtl: Q
    }));
    const H = {
      horizontal: [Z],
      vertical: [mi],
      both: [Z, mi]
    }[a], ee = {
      horizontal: [k],
      vertical: [gi],
      both: [k, gi]
    }[a], J = M ? ne : {
      horizontal: d ? DR : D0,
      vertical: d ? kR : k0,
      both: ne
    }[a];
    d && (G.key === Jc ? X = B : G.key === Wc && (X = O)), X === A && (H.includes(G.key) || ee.includes(G.key)) && (o && X === O && H.includes(G.key) ? (X = B, u && (X = u(G, A, X, w))) : o && X === B && ee.includes(G.key) ? (X = O, u && (X = u(G, A, X, w))) : X = Yl(w.current, {
      startingIndex: X,
      decrement: ee.includes(G.key),
      disabledIndices: x
    })), X !== A && !pi(w.current, X) && (v && G.stopPropagation(), J.has(G.key) && G.preventDefault(), L(X, !0), queueMicrotask(() => {
      w.current[X]?.focus();
    }));
  });
  return {
    props: {
      ref: z,
      onFocus(G) {
        const ne = T.current, F = gn(G.nativeEvent);
        !ne || F == null || !Bv(F) || F.setSelectionRange(0, F.value.length ?? 0);
      },
      onKeyDown: j
    },
    highlightedIndex: A,
    onHighlightedIndexChange: L,
    elementsRef: w,
    disabledIndices: x,
    onMapChange: D,
    relayKeyboardEvent: j
  };
}
function GR(n, o) {
  for (const a of BR.values())
    if (!o.includes(a) && n.getModifierState(a))
      return !0;
  return !1;
}
const qR = /* @__PURE__ */ h.createContext(void 0);
function $c() {
  return h.useContext(qR)?.direction ?? "ltr";
}
function XR(n) {
  const {
    render: o,
    className: a,
    style: i,
    refs: u = Ql,
    props: f = Ql,
    state: p = mt,
    stateAttributesMapping: g,
    highlightedIndex: m,
    onHighlightedIndexChange: d,
    orientation: v,
    grid: x,
    loopFocus: S,
    onLoop: C,
    enableHomeAndEndKeys: E,
    onMapChange: M,
    stopEventPropagation: T = !0,
    rootRef: z,
    disabledIndices: w,
    modifierKeys: N,
    highlightItemOnHover: A = !1,
    tag: L = "div",
    ...D
  } = n, _ = $c(), {
    props: j,
    highlightedIndex: V,
    onHighlightedIndexChange: G,
    elementsRef: ne,
    onMapChange: F,
    relayKeyboardEvent: Q
  } = YR({
    grid: x,
    loopFocus: S,
    onLoop: C,
    orientation: v,
    highlightedIndex: m,
    onHighlightedIndexChange: d,
    rootRef: z,
    stopEventPropagation: T,
    enableHomeAndEndKeys: E,
    direction: _,
    disabledIndices: w,
    modifierKeys: N
  }), Z = $e(L, n, {
    state: p,
    ref: u,
    props: [j, ...f, D],
    stateAttributesMapping: g
  }), q = h.useMemo(() => ({
    highlightedIndex: V,
    onHighlightedIndexChange: G,
    highlightItemOnHover: A,
    relayKeyboardEvent: Q
  }), [V, G, A, Q]);
  return /* @__PURE__ */ b.jsx(Xb.Provider, {
    value: q,
    children: /* @__PURE__ */ b.jsx(Hp, {
      elementsRef: ne,
      onMapChange: (k) => {
        M?.(k), F(k);
      },
      children: Z
    })
  });
}
const FR = /* @__PURE__ */ h.createContext(void 0);
function eu(n) {
  return h.useContext(FR);
}
const KR = /* @__PURE__ */ h.createContext(void 0);
function QR(n) {
  return h.useContext(KR);
}
let ZR = /* @__PURE__ */ (function(n) {
  return n.disabled = "data-disabled", n.orientation = "data-orientation", n.multiple = "data-multiple", n;
})({});
const Pv = {
  multiple(n) {
    return n ? {
      [ZR.multiple]: ""
    } : null;
  }
}, JR = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    defaultValue: i,
    disabled: u = !1,
    loopFocus: f = !0,
    onValueChange: p,
    orientation: g = "horizontal",
    multiple: m = !1,
    value: d,
    className: v,
    render: x,
    style: S,
    ...C
  } = o, E = eu(), M = QR(), T = h.useMemo(() => d !== void 0 || i !== void 0, [d, i]), z = (E?.disabled ?? !1) || (M?.disabled ?? !1) || u, [w, N] = sr({
    controlled: d,
    default: d === void 0 ? i ?? Ql : void 0,
    name: "ToggleGroup",
    state: "value"
  }), A = ze((V, G, ne) => {
    let F;
    m ? (F = w.slice(), G ? F.push(V) : F.splice(w.indexOf(V), 1)) : F = G ? [V] : [], p?.(F, ne), !ne.isCanceled && N(F);
  }), L = {
    disabled: z,
    multiple: m,
    orientation: g
  }, D = h.useMemo(() => ({
    disabled: z,
    orientation: g,
    setGroupValue: A,
    value: w,
    isValueInitialized: T
  }), [z, g, A, w, T]), _ = {
    role: "group"
  }, j = $e("div", o, {
    enabled: !!E,
    state: L,
    ref: a,
    props: [_, C],
    stateAttributesMapping: Pv
  });
  return /* @__PURE__ */ b.jsx(f0.Provider, {
    value: D,
    children: E ? j : /* @__PURE__ */ b.jsx(XR, {
      render: x,
      className: v,
      style: S,
      state: L,
      refs: [a],
      props: [_, C],
      stateAttributesMapping: Pv,
      loopFocus: f,
      enableHomeAndEndKeys: !0,
      orientation: g
    })
  });
}), WR = ua(
  "tw:inline-flex tw:items-center tw:justify-center tw:gap-1.5 tw:rounded-[var(--radius-surface)] tw:text-[length:var(--fs-body-s)] tw:text-muted-foreground tw:hover:bg-accent tw:hover:text-accent-foreground tw:focus-visible:ring-2 tw:focus-visible:ring-ring/40 tw:data-pressed:bg-accent tw:data-pressed:text-accent-foreground tw:disabled:opacity-50 tw:[&_svg]:pointer-events-none tw:[&_svg]:shrink-0 tw:[&_svg:not([class*=size-])]:size-3.5",
  {
    variants: {
      variant: {
        default: "tw:bg-transparent",
        outline: "tw:border tw:border-input tw:bg-background"
      },
      size: {
        default: "tw:h-8 tw:px-2.5",
        xs: "tw:h-6 tw:gap-1 tw:px-2 tw:text-[length:var(--fs-caption)] tw:[&_svg:not([class*=size-])]:size-3",
        sm: "tw:h-7 tw:px-2 tw:text-[length:var(--fs-caption)]",
        lg: "tw:h-9 tw:px-3"
      }
    },
    defaultVariants: { variant: "default", size: "default" }
  }
);
function oa({
  className: n,
  ...o
}) {
  return /* @__PURE__ */ b.jsx(
    JR,
    {
      "data-slot": "toggle-group",
      className: Fe("tw:flex tw:w-fit tw:flex-row tw:items-center tw:gap-1", n),
      ...o
    }
  );
}
function Pl({
  className: n,
  variant: o = "default",
  size: a = "default",
  ...i
}) {
  return /* @__PURE__ */ b.jsx(
    eR,
    {
      type: "button",
      "data-slot": "toggle-group-item",
      className: Fe(WR({ variant: o, size: a }), n),
      ...i
    }
  );
}
const $R = [];
function Xp(n) {
  h.useEffect(n, $R);
}
const ri = 0;
class tl {
  static create() {
    return new tl();
  }
  currentId = ri;
  /**
   * Executes `fn` after `delay`, clearing any previously scheduled call.
   */
  start(o, a) {
    this.clear(), this.currentId = setTimeout(() => {
      this.currentId = ri, a();
    }, o);
  }
  isStarted() {
    return this.currentId !== ri;
  }
  clear = () => {
    this.currentId !== ri && (clearTimeout(this.currentId), this.currentId = ri);
  };
  disposeEffect = () => this.clear;
}
function sn() {
  const n = xn(tl.create).current;
  return Xp(n.disposeEffect), n;
}
function eC(n, o) {
  return o != null && !ur(o) ? 0 : typeof n == "function" ? n() : n;
}
function sa(n, o, a) {
  const i = eC(n, a);
  return typeof i == "number" ? i : i?.[o];
}
function Yv(n) {
  return typeof n == "function" ? n() : n;
}
function H0(n, o) {
  return o || n === "click" || n === "mousedown";
}
function tC(n) {
  return n?.includes("mouse") && n !== "mousedown";
}
const L0 = /* @__PURE__ */ h.createContext({
  hasProvider: !1,
  timeoutMs: 0,
  delayRef: {
    current: 0
  },
  initialDelayRef: {
    current: 0
  },
  timeout: new tl(),
  currentIdRef: {
    current: null
  },
  currentContextRef: {
    current: null
  }
});
function nC(n, o) {
  n.current = o.current;
}
function lC(n) {
  const {
    children: o,
    delay: a,
    timeoutMs: i = 0
  } = n, u = h.useRef(a), f = h.useRef(a), p = h.useRef(null), g = h.useRef(null), m = sn();
  return we(() => {
    if (f.current = a, !p.current) {
      u.current = a;
      return;
    }
    u.current = {
      open: sa(u.current, "open"),
      close: sa(a, "close")
    };
  }, [a, p, u, f]), /* @__PURE__ */ b.jsx(L0.Provider, {
    value: h.useMemo(() => ({
      hasProvider: !0,
      delayRef: u,
      initialDelayRef: f,
      currentIdRef: p,
      timeoutMs: i,
      currentContextRef: g,
      timeout: m
    }), [i, m]),
    children: o
  });
}
function oC(n, o = {
  open: !1
}) {
  const {
    open: a
  } = o, i = "rootStore" in n ? n.rootStore : n, u = i.useState("floatingId"), f = h.useContext(L0), {
    currentIdRef: p,
    delayRef: g,
    timeoutMs: m,
    initialDelayRef: d,
    currentContextRef: v,
    hasProvider: x,
    timeout: S
  } = f, [C, E] = h.useState(!1), M = h.useRef(a), T = h.useRef(!1);
  return we(() => {
    M.current = a;
  }, [a]), we(() => () => {
    T.current = !0;
  }, []), we(() => {
    function z() {
      T.current || E(!1), v.current?.setIsInstantPhase(!1), p.current = null, v.current = null, g.current = d.current, S.clear();
    }
    if (p.current && !a && p.current === u) {
      if (E(!1), m) {
        const w = u;
        return S.start(m, () => {
          i.select("open") || p.current && p.current !== w || z();
        }), () => {
          (M.current || p.current !== w) && S.clear();
        };
      }
      z();
    }
  }, [a, u, p, g, m, d, v, S, i]), we(() => {
    if (!a)
      return;
    const z = v.current, w = p.current;
    S.clear(), v.current = {
      onOpenChange: i.setOpen,
      setIsInstantPhase: E
    }, p.current = u, g.current = {
      open: 0,
      close: sa(d.current, "close")
    }, w !== null && w !== u ? (E(!0), z?.setIsInstantPhase(!0), z?.onOpenChange(!1, Pe(eo))) : (E(!1), z?.setIsInstantPhase(!1));
  }, [a, u, i, p, g, d, v, S]), we(() => () => {
    if (p.current === u) {
      if (v.current = null, !M.current)
        return;
      p.current = null, nC(g, d), S.clear();
    }
  }, [v, p, g, u, d, S]), h.useMemo(() => ({
    hasProvider: x,
    delayRef: g,
    isInstantPhase: C
  }), [x, g, C]);
}
function Je(n, o, a, i) {
  return n.addEventListener(o, a, i), () => {
    n.removeEventListener(o, a, i);
  };
}
function ml(...n) {
  return () => {
    for (let o = 0; o < n.length; o += 1) {
      const a = n[o];
      a && a();
    }
  };
}
function Yt(n) {
  const o = xn(rC, n).current;
  return o.next = n, we(o.effect), o;
}
function rC(n) {
  const o = {
    current: n,
    next: n,
    effect: () => {
      o.current = o.next;
    }
  };
  return o;
}
const Js = null;
class aC {
  /* This implementation uses an array as a backing data-structure for frame callbacks.
   * It allows `O(1)` callback cancelling by inserting a `null` in the array, though it
   * never calls the native `cancelAnimationFrame` if there are no frames left. This can
   * be much more efficient if there is a call pattern that alterns as
   * "request-cancel-request-cancel-…".
   * But in the case of "request-request-…-cancel-cancel-…", it leaves the final animation
   * frame to run anyway. We turn that frame into a `O(1)` no-op via `callbacksCount`. */
  callbacks = [];
  callbacksCount = 0;
  nextId = 1;
  startId = 1;
  isScheduled = !1;
  tick = (o) => {
    this.isScheduled = !1;
    const a = this.callbacks, i = this.callbacksCount;
    if (this.callbacks = [], this.callbacksCount = 0, this.startId = this.nextId, i > 0)
      for (let u = 0; u < a.length; u += 1)
        a[u]?.(o);
  };
  request(o) {
    const a = this.nextId;
    return this.nextId += 1, this.callbacks.push(o), this.callbacksCount += 1, !this.isScheduled && (requestAnimationFrame(this.tick), this.isScheduled = !0), a;
  }
  cancel(o) {
    const a = o - this.startId;
    a < 0 || a >= this.callbacks.length || (this.callbacks[a] = null, this.callbacksCount -= 1);
  }
}
const Ws = new aC();
class gl {
  static create() {
    return new gl();
  }
  static request(o) {
    return Ws.request(o);
  }
  static cancel(o) {
    return Ws.cancel(o);
  }
  currentId = Js;
  /**
   * Executes `fn` after `delay`, clearing any previously scheduled call.
   */
  request(o) {
    this.cancel(), this.currentId = Ws.request(() => {
      this.currentId = Js, o();
    });
  }
  cancel = () => {
    this.currentId !== Js && (Ws.cancel(this.currentId), this.currentId = Js);
  };
  disposeEffect = () => this.cancel;
}
function ca() {
  const n = xn(gl.create).current;
  return Xp(n.disposeEffect), n;
}
const U0 = {
  clipPath: "inset(50%)",
  overflow: "hidden",
  whiteSpace: "nowrap",
  border: 0,
  padding: 0,
  width: 1,
  height: 1,
  margin: -1
}, Fp = {
  ...U0,
  position: "fixed",
  top: 0,
  left: 0
}, B0 = {
  ...U0,
  position: "absolute"
}, No = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const [i, u] = h.useState();
  we(() => {
    cR && Do && u("button");
  }, []);
  const f = {
    tabIndex: 0,
    // Role is only for VoiceOver
    role: i
  };
  return /* @__PURE__ */ b.jsx("span", {
    ...o,
    ref: a,
    style: Fp,
    "aria-hidden": i ? void 0 : !0,
    ...f,
    "data-base-ui-focus-guard": ""
  });
});
function Si(n) {
  return `data-base-ui-${n}`;
}
let $s = 0;
function mc(n, o = {}) {
  const {
    preventScroll: a = !1,
    sync: i = !1,
    shouldFocus: u
  } = o;
  cancelAnimationFrame($s);
  function f() {
    u && !u() || n?.focus({
      preventScroll: a
    });
  }
  if (i)
    return f(), an;
  const p = requestAnimationFrame(f);
  return $s = p, () => {
    $s === p && (cancelAnimationFrame(p), $s = 0);
  };
}
const Pd = {
  inert: /* @__PURE__ */ new WeakMap(),
  "aria-hidden": /* @__PURE__ */ new WeakMap()
}, Gv = "data-base-ui-inert", pp = {
  inert: /* @__PURE__ */ new WeakSet(),
  "aria-hidden": /* @__PURE__ */ new WeakSet()
};
let ai = /* @__PURE__ */ new WeakMap(), Yd = 0;
function iC(n) {
  return pp[n];
}
function I0(n) {
  return n ? aa(n) ? n.host : I0(n.parentNode) : null;
}
const qv = (n, o) => o.map((a) => {
  if (n.contains(a))
    return a;
  const i = I0(a);
  return n.contains(i) ? i : null;
}).filter((a) => a != null), Xv = (n) => {
  const o = /* @__PURE__ */ new Set();
  return n.forEach((a) => {
    let i = a;
    for (; i && !o.has(i); )
      o.add(i), i = i.parentNode;
  }), o;
}, Fv = (n, o, a) => {
  const i = [], u = (f) => {
    !f || a.has(f) || Array.from(f.children).forEach((p) => {
      mn(p) !== "script" && (o.has(p) ? u(p) : i.push(p));
    });
  };
  return u(n), i;
};
function sC(n, o, a, i, {
  mark: u = !0
}) {
  let f = null;
  i ? f = "inert" : a && (f = "aria-hidden");
  let p = null, g = null;
  const m = qv(o, n), d = u ? Fv(o, Xv(m), new Set(m)) : [], v = [], x = [];
  if (f) {
    const S = Pd[f], C = iC(f);
    g = C, p = S;
    const E = qv(o, Array.from(o.querySelectorAll("[aria-live]"))), M = m.concat(E);
    Fv(o, Xv(M), new Set(M)).forEach((z) => {
      const w = z.getAttribute(f), N = w !== null && w !== "false", A = (S.get(z) || 0) + 1;
      S.set(z, A), v.push(z), A === 1 && N && C.add(z), N || z.setAttribute(f, f === "inert" ? "" : "true");
    });
  }
  return u && d.forEach((S) => {
    const C = (ai.get(S) || 0) + 1;
    ai.set(S, C), x.push(S), C === 1 && S.setAttribute(Gv, "");
  }), Yd += 1, () => {
    p && v.forEach((S) => {
      const E = (p.get(S) || 0) - 1;
      p.set(S, E), E || (!g?.has(S) && f && S.removeAttribute(f), g?.delete(S));
    }), u && x.forEach((S) => {
      const C = (ai.get(S) || 0) - 1;
      ai.set(S, C), C || S.removeAttribute(Gv);
    }), Yd -= 1, Yd || (Pd.inert = /* @__PURE__ */ new WeakMap(), Pd["aria-hidden"] = /* @__PURE__ */ new WeakMap(), pp.inert = /* @__PURE__ */ new WeakSet(), pp["aria-hidden"] = /* @__PURE__ */ new WeakSet(), ai = /* @__PURE__ */ new WeakMap());
  };
}
function Kv(n, o = {}) {
  const {
    ariaHidden: a = !1,
    inert: i = !1,
    mark: u = !0
  } = o, f = nt(n[0]).body;
  return sC(n, f, a, i, {
    mark: u
  });
}
var Gd = { exports: {} }, hn = {};
var Qv;
function cC() {
  if (Qv) return hn;
  Qv = 1;
  var n = Ti();
  function o(m) {
    var d = "https://react.dev/errors/" + m;
    if (1 < arguments.length) {
      d += "?args[]=" + encodeURIComponent(arguments[1]);
      for (var v = 2; v < arguments.length; v++)
        d += "&args[]=" + encodeURIComponent(arguments[v]);
    }
    return "Minified React error #" + m + "; visit " + d + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
  }
  function a() {
  }
  var i = {
    d: {
      f: a,
      r: function() {
        throw Error(o(522));
      },
      D: a,
      C: a,
      L: a,
      m: a,
      X: a,
      S: a,
      M: a
    },
    p: 0,
    findDOMNode: null
  }, u = /* @__PURE__ */ Symbol.for("react.portal");
  function f(m, d, v) {
    var x = 3 < arguments.length && arguments[3] !== void 0 ? arguments[3] : null;
    return {
      $$typeof: u,
      key: x == null ? null : "" + x,
      children: m,
      containerInfo: d,
      implementation: v
    };
  }
  var p = n.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  function g(m, d) {
    if (m === "font") return "";
    if (typeof d == "string")
      return d === "use-credentials" ? d : "";
  }
  return hn.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = i, hn.createPortal = function(m, d) {
    var v = 2 < arguments.length && arguments[2] !== void 0 ? arguments[2] : null;
    if (!d || d.nodeType !== 1 && d.nodeType !== 9 && d.nodeType !== 11)
      throw Error(o(299));
    return f(m, d, null, v);
  }, hn.flushSync = function(m) {
    var d = p.T, v = i.p;
    try {
      if (p.T = null, i.p = 2, m) return m();
    } finally {
      p.T = d, i.p = v, i.d.f();
    }
  }, hn.preconnect = function(m, d) {
    typeof m == "string" && (d ? (d = d.crossOrigin, d = typeof d == "string" ? d === "use-credentials" ? d : "" : void 0) : d = null, i.d.C(m, d));
  }, hn.prefetchDNS = function(m) {
    typeof m == "string" && i.d.D(m);
  }, hn.preinit = function(m, d) {
    if (typeof m == "string" && d && typeof d.as == "string") {
      var v = d.as, x = g(v, d.crossOrigin), S = typeof d.integrity == "string" ? d.integrity : void 0, C = typeof d.fetchPriority == "string" ? d.fetchPriority : void 0;
      v === "style" ? i.d.S(
        m,
        typeof d.precedence == "string" ? d.precedence : void 0,
        {
          crossOrigin: x,
          integrity: S,
          fetchPriority: C
        }
      ) : v === "script" && i.d.X(m, {
        crossOrigin: x,
        integrity: S,
        fetchPriority: C,
        nonce: typeof d.nonce == "string" ? d.nonce : void 0
      });
    }
  }, hn.preinitModule = function(m, d) {
    if (typeof m == "string")
      if (typeof d == "object" && d !== null) {
        if (d.as == null || d.as === "script") {
          var v = g(
            d.as,
            d.crossOrigin
          );
          i.d.M(m, {
            crossOrigin: v,
            integrity: typeof d.integrity == "string" ? d.integrity : void 0,
            nonce: typeof d.nonce == "string" ? d.nonce : void 0
          });
        }
      } else d == null && i.d.M(m);
  }, hn.preload = function(m, d) {
    if (typeof m == "string" && typeof d == "object" && d !== null && typeof d.as == "string") {
      var v = d.as, x = g(v, d.crossOrigin);
      i.d.L(m, v, {
        crossOrigin: x,
        integrity: typeof d.integrity == "string" ? d.integrity : void 0,
        nonce: typeof d.nonce == "string" ? d.nonce : void 0,
        type: typeof d.type == "string" ? d.type : void 0,
        fetchPriority: typeof d.fetchPriority == "string" ? d.fetchPriority : void 0,
        referrerPolicy: typeof d.referrerPolicy == "string" ? d.referrerPolicy : void 0,
        imageSrcSet: typeof d.imageSrcSet == "string" ? d.imageSrcSet : void 0,
        imageSizes: typeof d.imageSizes == "string" ? d.imageSizes : void 0,
        media: typeof d.media == "string" ? d.media : void 0
      });
    }
  }, hn.preloadModule = function(m, d) {
    if (typeof m == "string")
      if (d) {
        var v = g(d.as, d.crossOrigin);
        i.d.m(m, {
          as: typeof d.as == "string" && d.as !== "script" ? d.as : void 0,
          crossOrigin: v,
          integrity: typeof d.integrity == "string" ? d.integrity : void 0
        });
      } else i.d.m(m);
  }, hn.requestFormReset = function(m) {
    i.d.r(m);
  }, hn.unstable_batchedUpdates = function(m, d) {
    return m(d);
  }, hn.useFormState = function(m, d, v) {
    return p.H.useFormState(m, d, v);
  }, hn.useFormStatus = function() {
    return p.H.useHostTransitionStatus();
  }, hn.version = "19.2.7", hn;
}
var Zv;
function V0() {
  if (Zv) return Gd.exports;
  Zv = 1;
  function n() {
    if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function"))
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(n);
      } catch (o) {
        console.error(o);
      }
  }
  return n(), Gd.exports = cC(), Gd.exports;
}
var hl = V0();
const uC = 500, P0 = 500, fC = {
  style: {
    transition: "none"
  }
}, Y0 = "data-base-ui-click-trigger", G0 = {
  fallbackAxisSide: "none"
}, Kp = {
  fallbackAxisSide: "end"
}, dC = {
  clipPath: "inset(50%)",
  position: "fixed",
  top: 0,
  left: 0
}, q0 = /* @__PURE__ */ h.createContext(null), X0 = () => h.useContext(q0), pC = Si("portal");
function F0(n = {}) {
  const {
    ref: o,
    container: a,
    componentProps: i = mt,
    elementProps: u
  } = n, f = cr(), g = X0()?.portalNode, [m, d] = h.useState(null), [v, x] = h.useState(null), S = ze((T) => {
    T !== null && x(T);
  }), C = h.useRef(null);
  we(() => {
    if (a === null) {
      C.current && (C.current = null, x(null), d(null));
      return;
    }
    if (f == null)
      return;
    const T = (a && (Cp(a) ? a : a.current)) ?? g ?? document.body;
    if (T == null) {
      C.current && (C.current = null, x(null), d(null));
      return;
    }
    C.current !== T && (C.current = T, x(null), d(T));
  }, [a, g, f]);
  const E = $e("div", i, {
    ref: [o, S],
    props: [{
      id: f,
      [pC]: ""
    }, u]
  });
  return {
    portalNode: v,
    portalSubtree: m && E ? /* @__PURE__ */ hl.createPortal(E, m) : null
  };
}
const tu = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    children: p,
    container: g,
    renderGuards: m,
    ...d
  } = o, {
    portalNode: v,
    portalSubtree: x
  } = F0({
    container: g,
    ref: a,
    componentProps: o,
    elementProps: d
  }), S = h.useRef(null), C = h.useRef(null), E = h.useRef(null), M = h.useRef(null), [T, z] = h.useState(null), w = h.useRef(!1), N = T?.modal, A = T?.open, L = typeof m == "boolean" ? m : !!T && !T.modal && T.open && !!v;
  h.useEffect(() => {
    if (!v || N)
      return;
    function _(j) {
      v && j.relatedTarget && la(j) && (j.type === "focusin" ? w.current && (Uv(v), w.current = !1) : (jR(v), w.current = !0));
    }
    return ml(Je(v, "focusin", _, !0), Je(v, "focusout", _, !0));
  }, [v, N]), we(() => {
    !v || A !== !0 || !w.current || (Uv(v), w.current = !1);
  }, [A, v]);
  const D = h.useMemo(() => ({
    beforeOutsideRef: S,
    afterOutsideRef: C,
    beforeInsideRef: E,
    afterInsideRef: M,
    portalNode: v,
    setFocusManagerState: z
  }), [v]);
  return /* @__PURE__ */ b.jsxs(h.Fragment, {
    children: [x, /* @__PURE__ */ b.jsxs(q0.Provider, {
      value: D,
      children: [L && v && /* @__PURE__ */ b.jsx(No, {
        "data-type": "outside",
        ref: S,
        onFocus: (_) => {
          if (la(_, v))
            E.current?.focus();
          else {
            const j = T ? T.domReference : null;
            N0(j)?.focus();
          }
        }
      }), L && v && /* @__PURE__ */ b.jsx("span", {
        "aria-owns": v.id,
        style: dC
      }), v && /* @__PURE__ */ hl.createPortal(p, v), L && v && /* @__PURE__ */ b.jsx(No, {
        "data-type": "outside",
        ref: C,
        onFocus: (_) => {
          if (la(_, v))
            M.current?.focus();
          else {
            const j = T ? T.domReference : null;
            qp(j)?.focus(), T?.closeOnFocusOut && T?.onOpenChange(!1, Pe(Ao, _.nativeEvent));
          }
        }
      })]
    })]
  });
});
function K0() {
  const n = /* @__PURE__ */ new Map();
  return {
    emit(o, a) {
      n.get(o)?.forEach((i) => i(a));
    },
    on(o, a) {
      n.has(o) || n.set(o, /* @__PURE__ */ new Set()), n.get(o).add(a);
    },
    off(o, a) {
      n.get(o)?.delete(a);
    }
  };
}
class Qp {
  nodesRef = {
    current: []
  };
  events = K0();
  addNode(o) {
    this.nodesRef.current.push(o);
  }
  removeNode(o) {
    const a = this.nodesRef.current.findIndex((i) => i === o);
    a !== -1 && this.nodesRef.current.splice(a, 1);
  }
}
const Q0 = /* @__PURE__ */ h.createContext(null), Z0 = /* @__PURE__ */ h.createContext(null), to = () => h.useContext(Q0)?.id || null, _o = (n) => {
  const o = h.useContext(Z0);
  return n ?? o;
};
function Zp(n) {
  const o = cr(), a = _o(n), i = to();
  return we(() => {
    if (!o)
      return;
    const u = {
      id: o,
      parentId: i
    };
    return a?.addNode(u), () => {
      a?.removeNode(u);
    };
  }, [a, o, i]), o;
}
function J0(n) {
  const {
    children: o,
    id: a
  } = n, i = to();
  return /* @__PURE__ */ b.jsx(Q0.Provider, {
    value: h.useMemo(() => ({
      id: a,
      parentId: i
    }), [a, i]),
    children: o
  });
}
function W0(n) {
  const {
    children: o,
    externalTree: a
  } = n, i = xn(() => a ?? new Qp()).current;
  return /* @__PURE__ */ b.jsx(Z0.Provider, {
    value: i,
    children: o
  });
}
function Bl(n) {
  return n == null ? n : "current" in n ? n.current : n;
}
function gC(n, o) {
  const a = At(gn(n));
  return n instanceof a.KeyboardEvent ? "keyboard" : n instanceof a.FocusEvent ? o || "keyboard" : "pointerType" in n ? n.pointerType || "keyboard" : "touches" in n ? "touch" : n instanceof a.MouseEvent ? o || (n.detail === 0 ? "keyboard" : "mouse") : "";
}
const Jv = 20;
let Mo = [];
function Jp() {
  Mo = Mo.filter((n) => n.deref()?.isConnected);
}
function Wv(n) {
  Jp(), n && mn(n) !== "body" && (Mo.push(new WeakRef(n)), Mo.length > Jv && (Mo = Mo.slice(-Jv)));
}
function $v() {
  return Jp(), Mo[Mo.length - 1]?.deref();
}
function mC(n) {
  return n ? Gp(n) ? n : Oi(n)[0] || n : null;
}
function eb(n) {
  if (n.hasAttribute("tabindex") && !n.hasAttribute("data-tabindex") || !n.getAttribute("role")?.includes("dialog"))
    return;
  const a = A0(n).filter((u) => {
    const f = u.getAttribute("data-tabindex") || "";
    return Gp(u) || u.hasAttribute("data-tabindex") && !f.startsWith("-");
  }), i = n.getAttribute("tabindex");
  a.length === 0 ? i !== "0" && (n.setAttribute("tabindex", "0"), n.setAttribute("data-tabindex", "0")) : (i !== "-1" || n.hasAttribute("data-tabindex") && n.getAttribute("data-tabindex") !== "-1") && (n.setAttribute("tabindex", "-1"), n.setAttribute("data-tabindex", "-1"));
}
function nu(n) {
  const {
    context: o,
    children: a,
    disabled: i = !1,
    initialFocus: u = !0,
    returnFocus: f = !0,
    restoreFocus: p = !1,
    modal: g = !0,
    closeOnFocusOut: m = !0,
    openInteractionType: d = "",
    nextFocusableElement: v,
    previousFocusableElement: x,
    beforeContentFocusGuardRef: S,
    externalTree: C,
    getInsideElements: E
  } = n, M = "rootStore" in o ? o.rootStore : o, T = M.useState("open"), z = M.useState("domReferenceElement"), w = M.useState("floatingElement"), {
    events: N,
    dataRef: A
  } = M.context, L = ze(() => A.current.floatingContext?.nodeId), D = u === !1, _ = cp(z) && D, j = Yt(u), V = Yt(f), G = Yt(d), ne = Yt(T), F = _o(C), Q = X0(), Z = h.useRef(!1), q = h.useRef(!1), k = h.useRef(!1), P = h.useRef(null), I = h.useRef(""), X = h.useRef(""), B = h.useRef(null), O = h.useRef(null), H = Kl(B, S, Q?.beforeInsideRef), ee = Kl(O, Q?.afterInsideRef), J = sn(), le = sn(), ie = ca(), re = Q != null, se = Mc(w), ge = ze((ue = se) => ue ? Oi(ue) : []), De = ze(() => E?.().filter((ue) => ue != null) ?? []);
  h.useEffect(() => {
    if (i || !g)
      return;
    function ue(ye) {
      ye.key === "Tab" && Ue(se, bn(nt(se))) && ge().length === 0 && !_ && pl(ye);
    }
    const he = nt(se);
    return Je(he, "keydown", ue);
  }, [i, se, g, _, ge]), h.useEffect(() => {
    if (i || !T)
      return;
    const ue = nt(se);
    function he() {
      k.current = !1;
    }
    function ye(ke) {
      const Te = gn(ke), Ce = De(), ve = Ue(w, Te) || Ue(z, Te) || Ue(Q?.portalNode, Te) || Ce.some((Se) => Se === Te || Ue(Se, Te));
      k.current = !ve, X.current = ke.pointerType || "keyboard", Te?.closest(`[${Y0}]`) && (q.current = !0, le.start(0, () => {
        q.current = !1;
      }));
    }
    function je() {
      X.current = "keyboard";
    }
    return ml(
      Je(ue, "pointerdown", ye, !0),
      Je(ue, "pointerup", he, !0),
      Je(ue, "pointercancel", he, !0),
      Je(ue, "keydown", je, !0),
      // Avoid a stale `true` leaking into the next open (e.g. keep-mounted popups)
      // if the popup dismissed between pointerdown and pointerup.
      he
    );
  }, [i, w, z, se, T, Q, le, De]), h.useEffect(() => {
    if (i || !m)
      return;
    const ue = nt(se);
    function he() {
      q.current = !0, le.start(0, () => {
        q.current = !1;
      });
    }
    function ye(Ce) {
      const ve = gn(Ce);
      Gp(ve) && (P.current = ve);
    }
    function je(Ce) {
      const ve = Ce.relatedTarget, Se = Ce.currentTarget, Re = gn(Ce);
      g && ve == null && Re != null && Ue(w, Re) && Wv(Re), queueMicrotask(() => {
        const Oe = L(), He = M.context.triggerElements, ae = De(), pe = ve?.hasAttribute(Si("focus-guard")) && [B.current, O.current, Q?.beforeInsideRef.current, Q?.afterInsideRef.current, Q?.beforeOutsideRef.current, Q?.afterOutsideRef.current, Bl(x), Bl(v)].includes(ve), Le = !(Ue(z, ve) || Ue(w, ve) || Ue(ve, w) || Ue(Q?.portalNode, ve) || ae.some((be) => be === ve || Ue(be, ve)) || ve != null && He.hasElement(ve) || He.hasMatchingElement((be) => Ue(be, ve)) || pe || F && (zo(F.nodesRef.current, Oe).find((be) => Ue(be.context?.elements.floating, ve) || Ue(be.context?.elements.domReference, ve)) || _v(F.nodesRef.current, Oe).find((be) => [be.context?.elements.floating, Mc(be.context?.elements.floating)].includes(ve) || be.context?.elements.domReference === ve)));
        if (Se === z && se && eb(se), p && Se !== z && !Zc(Re) && bn(ue) === ue.body) {
          if (Rt(se) && (se.focus(), p === "popup")) {
            ie.request(() => {
              se.focus();
            });
            return;
          }
          const be = ge(), xe = P.current, et = (xe && be.includes(xe) ? xe : null) || be[be.length - 1] || se;
          Rt(et) && et.focus();
        }
        if (A.current.insideReactTree) {
          A.current.insideReactTree = !1;
          return;
        }
        (_ || !g) && ve && Le && !q.current && // Fix React 18 Strict Mode returnFocus due to double rendering.
        // For an "untrapped" typeable combobox (input role=combobox with
        // initialFocus=false), re-opening the popup and tabbing out should still close it even
        // when the previously focused element (e.g. the next tabbable outside the popup) is
        // focused again. Otherwise, the popup remains open on the second Tab sequence:
        // click input -> Tab (closes) -> click input -> Tab.
        // Allow closing when `isUntrappedTypeableCombobox` regardless of the previously focused element.
        (_ || ve !== $v()) && (Z.current = !0, M.setOpen(!1, Pe(Ao, Ce)));
      });
    }
    function ke() {
      k.current || (A.current.insideReactTree = !0, J.start(0, () => {
        A.current.insideReactTree = !1;
      }));
    }
    const Te = Rt(z) ? z : null;
    if (!(!w && !Te))
      return ml(Te && Je(Te, "focusout", je), Te && Je(Te, "pointerdown", he), w && Je(w, "focusin", ye), w && Je(w, "focusout", je), w && Q && Je(w, "focusout", ke, !0));
  }, [i, z, w, se, g, F, Q, M, m, p, ge, _, L, A, J, le, ie, v, x, De]), h.useEffect(() => {
    if (i || !w || !T)
      return;
    const ue = Array.from(Q?.portalNode?.querySelectorAll(`[${Si("portal")}]`) || []), ye = (F ? _v(F.nodesRef.current, L()) : []).find((Se) => cp(Se.context?.elements.domReference || null))?.context?.elements.domReference, ke = [...[w, ...ue, B.current, O.current, Q?.beforeOutsideRef.current, Q?.afterOutsideRef.current, ...De()], ye, Bl(x), Bl(v), _ ? z : null].filter((Se) => Se != null), Te = Kv(ke, {
      ariaHidden: g || _,
      mark: !1
    }), Ce = [w, ...ue].filter((Se) => Se != null), ve = Kv(Ce);
    return () => {
      ve(), Te();
    };
  }, [T, i, z, w, g, Q, _, F, L, v, x, De]), we(() => {
    if (!T || i || !Rt(se))
      return;
    const ue = nt(se), he = bn(ue);
    queueMicrotask(() => {
      const ye = j.current, je = typeof ye == "function" ? ye(G.current || "") : ye;
      if (je === void 0 || je === !1 || Ue(se, he))
        return;
      let Te = null;
      const Ce = () => (Te == null && (Te = ge(se)), Te[0] || se);
      let ve;
      je === !0 || je === null ? ve = Ce() : ve = Bl(je), ve = ve || Ce();
      const Se = Ue(se, bn(ue));
      mc(ve, {
        preventScroll: ve === se,
        shouldFocus() {
          if (!ne.current)
            return !1;
          if (Se)
            return !0;
          const Re = bn(ue);
          return !(Re !== ve && Ue(se, Re));
        }
      });
    });
  }, [i, T, se, ge, j, G, ne]), we(() => {
    if (i || !se)
      return;
    const ue = nt(se), he = bn(ue), ye = G.current == null;
    Wv(he);
    function je(Te) {
      if (Te.open || (I.current = gC(Te.nativeEvent, X.current)), Te.reason === Pt && Te.nativeEvent.type === "mouseleave" && (Z.current = !0), Te.reason === Yc)
        if (Te.nested)
          Z.current = !1;
        else if (Ip(Te.nativeEvent) || x0(Te.nativeEvent))
          Z.current = !1;
        else {
          let Ce = !1;
          nt(se).createElement("div").focus({
            get preventScroll() {
              return Ce = !0, !1;
            }
          }), Ce ? Z.current = !1 : Z.current = !0;
        }
    }
    N.on("openchange", je);
    function ke() {
      const Te = V.current;
      let Ce = typeof Te == "function" ? Te(I.current) : Te;
      if (Ce === void 0 || Ce === !1)
        return null;
      Ce === null && (Ce = !0);
      const ve = z?.isConnected ? z : null, Se = he?.isConnected && mn(he) !== "body" ? he : null;
      let Re = ye ? Se || ve : ve || Se;
      return Re || (Re = $v() || null), typeof Ce == "boolean" ? Re : Bl(Ce) || Re || null;
    }
    return () => {
      N.off("openchange", je);
      const Te = bn(ue), Ce = De(), ve = Ue(w, Te) || Ce.some((Oe) => Oe === Te || Ue(Oe, Te)) || F && zo(F.nodesRef.current, L(), !1).some((Oe) => Ue(Oe.context?.elements.floating, Te)), Se = V.current, Re = ke();
      queueMicrotask(() => {
        const Oe = mC(Re), He = typeof Se != "boolean";
        Se && !Z.current && Rt(Oe) && // If the focus moved somewhere else after mount, avoid returning focus
        // since it likely entered a different element which should be
        // respected: https://github.com/floating-ui/floating-ui/issues/2607
        (!(!He && Oe !== Te && Te !== ue.body) || ve) && Oe.focus({
          preventScroll: !0
        }), Z.current = !1;
      });
    };
  }, [i, w, se, V, G, N, F, z, L, De]), we(() => {
    if (!Do || T || !w)
      return;
    const ue = bn(nt(w));
    !Rt(ue) || !Qc(ue) || Ue(w, ue) && ue.blur();
  }, [T, w]), we(() => {
    if (!(i || !Q))
      return Q.setFocusManagerState({
        modal: g,
        closeOnFocusOut: m,
        open: T,
        onOpenChange: M.setOpen,
        domReference: z
      }), () => {
        Q.setFocusManagerState(null);
      };
  }, [i, Q, g, T, M, m, z]), we(() => {
    if (!(i || !se))
      return eb(se), () => {
        queueMicrotask(Jp);
      };
  }, [i, se]);
  const Ee = !i && (g ? !_ : !0) && (re || g);
  return /* @__PURE__ */ b.jsxs(h.Fragment, {
    children: [Ee && /* @__PURE__ */ b.jsx(No, {
      "data-type": "inside",
      ref: H,
      onFocus: (ue) => {
        if (g) {
          const he = ge();
          mc(he[he.length - 1]);
        } else Q?.portalNode && (Z.current = !1, la(ue, Q.portalNode) ? qp(z)?.focus() : Bl(x ?? Q.beforeOutsideRef)?.focus());
      }
    }), a, Ee && /* @__PURE__ */ b.jsx(No, {
      "data-type": "inside",
      ref: ee,
      onFocus: (ue) => {
        g ? mc(ge()[0]) : Q?.portalNode && (m && (Z.current = !0), la(ue, Q.portalNode) ? N0(z)?.focus() : Bl(v ?? Q.afterOutsideRef)?.focus());
      }
    })]
  });
}
function lu(n, o = {}) {
  const {
    enabled: a = !0,
    event: i = "click",
    toggle: u = !0,
    ignoreMouse: f = !1,
    stickIfOpen: p = !0,
    touchOpenDelay: g = 0,
    reason: m = Zl
  } = o, d = "rootStore" in n ? n.rootStore : n, v = d.context.dataRef, x = h.useRef(void 0), S = ca(), C = sn(), E = h.useMemo(() => {
    function M(z, w, N, A) {
      const L = Pe(m, w, N);
      z && A === "touch" && g > 0 ? C.start(g, () => {
        d.setOpen(!0, L);
      }) : d.setOpen(z, L);
    }
    function T(z, w, N) {
      const A = v.current.openEvent, L = d.select("domReferenceElement") !== w;
      return z && L || !z || !u ? !0 : A && p ? !N(A.type) : !1;
    }
    return {
      onPointerDown(z) {
        x.current = z.pointerType;
      },
      onMouseDown(z) {
        const w = x.current, N = z.nativeEvent, A = d.select("open");
        if (z.button !== 0 || i === "click" || ur(w, !0) && f)
          return;
        const L = T(A, z.currentTarget, (j) => j === "click" || j === "mousedown"), D = gn(N);
        if (Qc(D)) {
          M(L, N, D, w);
          return;
        }
        const _ = z.currentTarget;
        S.request(() => {
          M(L, N, _, w);
        });
      },
      onClick(z) {
        if (i === "mousedown-only")
          return;
        const w = x.current;
        if (i === "mousedown" && w) {
          x.current = void 0;
          return;
        }
        if (ur(w, !0) && f)
          return;
        const N = d.select("open"), A = T(N, z.currentTarget, (L) => L === "click" || L === "mousedown" || L === "keydown" || L === "keyup");
        M(A, z.nativeEvent, z.currentTarget, w);
      },
      onKeyDown() {
        x.current = void 0;
      }
    };
  }, [v, i, f, m, d, p, u, S, C, g]);
  return h.useMemo(() => a ? {
    reference: E
  } : mt, [a, E]);
}
function hC(n, o) {
  let a = null, i = null, u = !1;
  return {
    contextElement: n || void 0,
    getBoundingClientRect() {
      const f = n?.getBoundingClientRect() || {
        width: 0,
        height: 0,
        x: 0,
        y: 0
      }, p = o.axis === "x" || o.axis === "both", g = o.axis === "y" || o.axis === "both", m = ["mouseenter", "mousemove"].includes(o.dataRef.current.openEvent?.type || "") && o.pointerType !== "touch";
      let d = f.width, v = f.height, x = f.x, S = f.y;
      return a == null && o.x && p && (a = f.x - o.x), i == null && o.y && g && (i = f.y - o.y), x -= a || 0, S -= i || 0, d = 0, v = 0, !u || m ? (d = o.axis === "y" ? f.width : 0, v = o.axis === "x" ? f.height : 0, x = p && o.x != null ? o.x : x, S = g && o.y != null ? o.y : S) : u && !m && (v = o.axis === "x" ? f.height : v, d = o.axis === "y" ? f.width : d), u = !0, {
        width: d,
        height: v,
        x,
        y: S,
        top: S,
        right: x + d,
        bottom: S + v,
        left: x
      };
    }
  };
}
function tb(n) {
  return n != null && n.clientX != null;
}
function yC(n, o = {}) {
  const {
    enabled: a = !0,
    axis: i = "both"
  } = o, u = "rootStore" in n ? n.rootStore : n, f = u.useState("open"), p = u.useState("floatingElement"), g = u.useState("domReferenceElement"), m = u.context.dataRef, d = h.useRef(!1), v = h.useRef(null), [x, S] = h.useState(), [C, E] = h.useState([]), M = ze((A) => {
    u.set("positionReference", A);
  }), T = ze((A, L, D) => {
    d.current || m.current.openEvent && !tb(m.current.openEvent) || u.set("positionReference", hC(D ?? g, {
      x: A,
      y: L,
      axis: i,
      dataRef: m,
      pointerType: x
    }));
  }), z = ze((A) => {
    f ? v.current || (T(A.clientX, A.clientY, A.currentTarget), E([])) : T(A.clientX, A.clientY, A.currentTarget);
  }), w = ur(x) ? p : f;
  h.useEffect(() => {
    if (!a) {
      M(g);
      return;
    }
    if (!w)
      return;
    function A() {
      v.current?.(), v.current = null;
    }
    const L = At(p);
    function D(_) {
      const j = gn(_);
      Ue(p, j) ? A() : T(_.clientX, _.clientY);
    }
    return !m.current.openEvent || tb(m.current.openEvent) ? v.current = Je(L, "mousemove", D) : M(g), A;
  }, [w, a, p, m, g, u, T, M, C]), h.useEffect(() => () => {
    u.set("positionReference", null);
  }, [u]), h.useEffect(() => {
    a && !p && (d.current = !1);
  }, [a, p]), h.useEffect(() => {
    !a && f && (d.current = !0);
  }, [a, f]);
  const N = h.useMemo(() => {
    function A(L) {
      S(L.pointerType);
    }
    return {
      onPointerDown: A,
      onPointerEnter: A,
      onMouseMove: z,
      onMouseEnter: z
    };
  }, [z]);
  return h.useMemo(() => a ? {
    reference: N,
    trigger: N
  } : {}, [a, N]);
}
function vC() {
  return !1;
}
function bC(n) {
  return {
    escapeKey: typeof n == "boolean" ? n : n?.escapeKey ?? !1,
    outsidePress: typeof n == "boolean" ? n : n?.outsidePress ?? !0
  };
}
function Ai(n, o = {}) {
  const {
    enabled: a = !0,
    escapeKey: i = !0,
    outsidePress: u = !0,
    outsidePressEvent: f = "sloppy",
    referencePress: p = vC,
    bubbles: g,
    externalTree: m
  } = o, d = "rootStore" in n ? n.rootStore : n, v = d.useState("open"), x = d.useState("floatingElement"), {
    dataRef: S
  } = d.context, C = _o(m), E = ze(typeof u == "function" ? u : () => !1), M = typeof u == "function" ? E : u, T = M !== !1, z = ze(() => f), {
    escapeKey: w,
    outsidePress: N
  } = bC(g), A = h.useRef(!1), L = h.useRef(!1), D = h.useRef(!1), _ = h.useRef(!1), j = h.useRef(""), V = h.useRef(null), G = sn(), ne = sn(), F = ze(() => {
    ne.clear(), S.current.insideReactTree = !1;
  }), Q = ze((H) => {
    const ee = S.current.floatingContext?.nodeId;
    return (C ? zo(C.nodesRef.current, ee) : []).some((le) => le.context?.open && !le.context.dataRef.current[H]);
  }), Z = ze((H) => Id(H, d.select("floatingElement")) || Id(H, d.select("domReferenceElement"))), q = ze((H) => {
    p() && d.setOpen(!1, Pe(Zl, H.nativeEvent));
  }), k = ze((H) => {
    if (!v || !a || !i || H.key !== "Escape" || _.current || !w && Q("__escapeKeyBubbles"))
      return;
    const ee = pR(H) ? H.nativeEvent : H, J = Pe(Ci, ee);
    d.setOpen(!1, J), J.isCanceled || H.preventDefault(), !w && !J.isPropagationAllowed && H.stopPropagation();
  }), P = ze(() => {
    S.current.insideReactTree = !0, ne.start(0, F);
  }), I = ze((H) => {
    if (!v || !a || H.button !== 0)
      return;
    const ee = gn(H.nativeEvent);
    Ue(d.select("floatingElement"), ee) && (A.current || (A.current = !0, L.current = !1));
  }), X = ze((H) => {
    !v || !a || (H.defaultPrevented || H.nativeEvent.defaultPrevented) && A.current && (L.current = !0);
  });
  h.useEffect(() => {
    if (!v || !a)
      return;
    S.current.__escapeKeyBubbles = w, S.current.__outsidePressBubbles = N;
    const H = new tl(), ee = new tl();
    function J() {
      H.clear(), _.current = !0;
    }
    function le() {
      H.start(
        // 0ms or 1ms don't work in Safari. 5ms appears to consistently work.
        // Only apply to WebKit for the test to remain 0ms.
        Do ? 5 : 0,
        () => {
          _.current = !1;
        }
      );
    }
    function ie() {
      D.current = !0, ee.start(0, () => {
        D.current = !1;
      });
    }
    function re() {
      A.current = !1, L.current = !1;
    }
    function se() {
      const ae = j.current, pe = ae === "pen" || !ae ? "mouse" : ae, Le = z(), be = typeof Le == "function" ? Le() : Le;
      return typeof be == "string" ? be : be[pe];
    }
    function ge(ae) {
      const pe = se();
      return pe === "intentional" && ae.type !== "click" || pe === "sloppy" && ae.type === "click";
    }
    function De(ae) {
      const pe = S.current.floatingContext?.nodeId, Le = C && zo(C.nodesRef.current, pe).some((be) => Id(ae, be.context?.elements.floating));
      return Z(ae) || Le;
    }
    function Ee(ae) {
      if (ge(ae)) {
        ae.type !== "click" && !Z(ae) && (ee.clear(), D.current = !1), F();
        return;
      }
      if (S.current.insideReactTree) {
        F();
        return;
      }
      const pe = gn(ae), Le = `[${Si("inert")}]`, be = We(pe) ? pe.getRootNode() : null, xe = Array.from((aa(be) ? be : nt(d.select("floatingElement"))).querySelectorAll(Le)), et = d.context.triggerElements;
      if (pe && (et.hasElement(pe) || et.hasMatchingElement((pt) => Ue(pt, pe))))
        return;
      let rt = We(pe) ? pe : null;
      for (; rt && !Gl(rt); ) {
        const pt = Fl(rt);
        if (Gl(pt) || !We(pt))
          break;
        rt = pt;
      }
      if (!(xe.length && We(pe) && !uR(pe) && // Clicked on a direct ancestor (e.g. FloatingOverlay).
      !Ue(pe, d.select("floatingElement")) && // If the target root element contains none of the markers, then the
      // element was injected after the floating element rendered.
      xe.every((pt) => !Ue(rt, pt)))) {
        if (Rt(pe) && !("touches" in ae)) {
          const pt = Gl(pe), Nt = Vn(pe), tt = /auto|scroll/, gt = pt || tt.test(Nt.overflowX), zt = pt || tt.test(Nt.overflowY), ht = gt && pe.clientWidth > 0 && pe.scrollWidth > pe.clientWidth, An = zt && pe.clientHeight > 0 && pe.scrollHeight > pe.clientHeight, zn = Nt.direction === "rtl", Qe = An && (zn ? ae.offsetX <= pe.offsetWidth - pe.clientWidth : ae.offsetX > pe.clientWidth), ft = ht && ae.offsetY > pe.clientHeight;
          if (Qe || ft)
            return;
        }
        if (!De(ae)) {
          if (se() === "intentional" && D.current) {
            ee.clear(), D.current = !1;
            return;
          }
          typeof M == "function" && !M(ae) || Q("__outsidePressBubbles") || (d.setOpen(!1, Pe(Yc, ae)), F());
        }
      }
    }
    function ue(ae) {
      se() !== "sloppy" || ae.pointerType === "touch" || !d.select("open") || !a || Z(ae) || Ee(ae);
    }
    function he(ae) {
      if (se() !== "sloppy" || !d.select("open") || !a || Z(ae))
        return;
      const pe = ae.touches[0];
      pe && (V.current = {
        startTime: Date.now(),
        startX: pe.clientX,
        startY: pe.clientY,
        dismissOnTouchEnd: !1,
        dismissOnMouseDown: !0
      }, G.start(1e3, () => {
        V.current && (V.current.dismissOnTouchEnd = !1, V.current.dismissOnMouseDown = !1);
      }));
    }
    function ye(ae, pe) {
      const Le = gn(ae);
      if (!Le)
        return;
      const be = Je(Le, ae.type, () => {
        pe(ae), be();
      });
    }
    function je(ae) {
      j.current = "touch", ye(ae, he);
    }
    function ke(ae) {
      G.clear(), ae.type === "pointerdown" && (j.current = ae.pointerType), !(ae.type === "mousedown" && V.current && !V.current.dismissOnMouseDown) && ye(ae, (pe) => {
        pe.type === "pointerdown" ? ue(pe) : Ee(pe);
      });
    }
    function Te(ae) {
      if (!A.current)
        return;
      const pe = L.current;
      if (re(), se() === "intentional") {
        if (ae.type === "pointercancel") {
          pe && ie();
          return;
        }
        if (!De(ae)) {
          if (pe) {
            ie();
            return;
          }
          typeof M == "function" && !M(ae) || (ee.clear(), D.current = !0, F());
        }
      }
    }
    function Ce(ae) {
      if (se() !== "sloppy" || !V.current || Z(ae))
        return;
      const pe = ae.touches[0];
      if (!pe)
        return;
      const Le = Math.abs(pe.clientX - V.current.startX), be = Math.abs(pe.clientY - V.current.startY), xe = Math.sqrt(Le * Le + be * be);
      xe > 5 && (V.current.dismissOnTouchEnd = !0), xe > 10 && (Ee(ae), G.clear(), V.current = null);
    }
    function ve(ae) {
      ye(ae, Ce);
    }
    function Se(ae) {
      se() !== "sloppy" || !V.current || Z(ae) || (V.current.dismissOnTouchEnd && Ee(ae), G.clear(), V.current = null);
    }
    function Re(ae) {
      ye(ae, Se);
    }
    const Oe = nt(x), He = ml(i && ml(Je(Oe, "keydown", k), Je(Oe, "compositionstart", J), Je(Oe, "compositionend", le)), T && ml(Je(Oe, "click", ke, !0), Je(Oe, "pointerdown", ke, !0), Je(Oe, "pointerup", Te, !0), Je(Oe, "pointercancel", Te, !0), Je(Oe, "mousedown", ke, !0), Je(Oe, "mouseup", Te, !0), Je(Oe, "touchstart", je, !0), Je(Oe, "touchmove", ve, !0), Je(Oe, "touchend", Re, !0)));
    return () => {
      He(), H.clear(), ee.clear(), re(), D.current = !1;
    };
  }, [S, x, i, T, M, v, a, w, N, k, F, z, Q, Z, C, d, G]), h.useEffect(F, [M, F]);
  const B = h.useMemo(() => ({
    onKeyDown: k,
    onPointerDown: q,
    onClick: q
  }), [k, q]), O = h.useMemo(() => ({
    onKeyDown: k,
    // `onMouseDown` may be blocked if `event.preventDefault()` is called in
    // `onPointerDown`, such as with <NumberField.ScrubArea>.
    // See https://github.com/mui/base-ui/pull/3379
    onPointerDown: X,
    onMouseDown: X,
    onClickCapture: P,
    onMouseDownCapture(H) {
      P(), I(H);
    },
    onPointerDownCapture(H) {
      P(), I(H);
    },
    onMouseUpCapture: P,
    onTouchEndCapture: P,
    onTouchMoveCapture: P
  }), [k, P, I, X]);
  return h.useMemo(() => a ? {
    reference: B,
    floating: O,
    trigger: B
  } : {}, [a, B, O]);
}
function nb(n, o, a) {
  let {
    reference: i,
    floating: u
  } = n;
  const f = el(o), p = Yp(o), g = Pp(p), m = In(o), d = f === "y", v = i.x + i.width / 2 - u.width / 2, x = i.y + i.height / 2 - u.height / 2, S = i[g] / 2 - u[g] / 2;
  let C;
  switch (m) {
    case "top":
      C = {
        x: v,
        y: i.y - u.height
      };
      break;
    case "bottom":
      C = {
        x: v,
        y: i.y + i.height
      };
      break;
    case "right":
      C = {
        x: i.x + i.width,
        y: x
      };
      break;
    case "left":
      C = {
        x: i.x - u.width,
        y: x
      };
      break;
    default:
      C = {
        x: i.x,
        y: i.y
      };
  }
  const E = ko(o);
  return E && (C[p] += S * (E === "end" ? 1 : -1) * (a && d ? -1 : 1)), C;
}
async function xC(n, o) {
  var a;
  o === void 0 && (o = {});
  const {
    x: i,
    y: u,
    platform: f,
    rects: p,
    elements: g,
    strategy: m
  } = n, {
    boundary: d = "clippingAncestors",
    rootBoundary: v = "viewport",
    elementContext: x = "floating",
    altBoundary: S = !1,
    padding: C = 0
  } = Jl(o, n), E = S0(C), T = g[S ? x === "floating" ? "reference" : "floating" : x], z = wi(await f.getClippingRect({
    element: (a = await (f.isElement == null ? void 0 : f.isElement(T))) == null || a ? T : T.contextElement || await (f.getDocumentElement == null ? void 0 : f.getDocumentElement(g.floating)),
    boundary: d,
    rootBoundary: v,
    strategy: m
  })), w = x === "floating" ? {
    x: i,
    y: u,
    width: p.floating.width,
    height: p.floating.height
  } : p.reference, N = await (f.getOffsetParent == null ? void 0 : f.getOffsetParent(g.floating)), A = await (f.isElement == null ? void 0 : f.isElement(N)) && await (f.getScale == null ? void 0 : f.getScale(N)) || {
    x: 1,
    y: 1
  }, L = wi(f.convertOffsetParentRelativeRectToViewportRelativeRect ? await f.convertOffsetParentRelativeRectToViewportRelativeRect({
    elements: g,
    rect: w,
    offsetParent: N,
    strategy: m
  }) : w);
  return {
    top: (z.top - L.top + E.top) / A.y,
    bottom: (L.bottom - z.bottom + E.bottom) / A.y,
    left: (z.left - L.left + E.left) / A.x,
    right: (L.right - z.right + E.right) / A.x
  };
}
const wC = 50, SC = async (n, o, a) => {
  const {
    placement: i = "bottom",
    strategy: u = "absolute",
    middleware: f = [],
    platform: p
  } = a, g = p.detectOverflow ? p : {
    ...p,
    detectOverflow: xC
  }, m = await (p.isRTL == null ? void 0 : p.isRTL(o));
  let d = await p.getElementRects({
    reference: n,
    floating: o,
    strategy: u
  }), {
    x: v,
    y: x
  } = nb(d, i, m), S = i, C = 0;
  const E = {};
  for (let M = 0; M < f.length; M++) {
    const T = f[M];
    if (!T)
      continue;
    const {
      name: z,
      fn: w
    } = T, {
      x: N,
      y: A,
      data: L,
      reset: D
    } = await w({
      x: v,
      y: x,
      initialPlacement: i,
      placement: S,
      strategy: u,
      middlewareData: E,
      rects: d,
      platform: g,
      elements: {
        reference: n,
        floating: o
      }
    });
    v = N ?? v, x = A ?? x, E[z] = {
      ...E[z],
      ...L
    }, D && C < wC && (C++, typeof D == "object" && (D.placement && (S = D.placement), D.rects && (d = D.rects === !0 ? await p.getElementRects({
      reference: n,
      floating: o,
      strategy: u
    }) : D.rects), {
      x: v,
      y: x
    } = nb(d, S, m)), M = -1);
  }
  return {
    x: v,
    y: x,
    placement: S,
    strategy: u,
    middlewareData: E
  };
}, EC = function(n) {
  return n === void 0 && (n = {}), {
    name: "flip",
    options: n,
    async fn(o) {
      var a, i;
      const {
        placement: u,
        middlewareData: f,
        rects: p,
        initialPlacement: g,
        platform: m,
        elements: d
      } = o, {
        mainAxis: v = !0,
        crossAxis: x = !0,
        fallbackPlacements: S,
        fallbackStrategy: C = "bestFit",
        fallbackAxisSideDirection: E = "none",
        flipAlignment: M = !0,
        ...T
      } = Jl(n, o);
      if ((a = f.arrow) != null && a.alignmentOffset)
        return {};
      const z = In(u), w = el(g), N = In(g) === g, A = await (m.isRTL == null ? void 0 : m.isRTL(d.floating)), L = S || (N || !M ? [zc(g)] : vR(g)), D = E !== "none";
      !S && D && L.push(...SR(g, M, E, A));
      const _ = [g, ...L], j = await m.detectOverflow(o, T), V = [];
      let G = ((i = f.flip) == null ? void 0 : i.overflows) || [];
      if (v && V.push(j[z]), x) {
        const Z = yR(u, p, A);
        V.push(j[Z[0]], j[Z[1]]);
      }
      if (G = [...G, {
        placement: u,
        overflows: V
      }], !V.every((Z) => Z <= 0)) {
        var ne, F;
        const Z = (((ne = f.flip) == null ? void 0 : ne.index) || 0) + 1, q = _[Z];
        if (q && (!(x === "alignment" ? w !== el(q) : !1) || // We leave the current main axis only if every placement on that axis
        // overflows the main axis.
        G.every((I) => el(I.placement) === w ? I.overflows[0] > 0 : !0)))
          return {
            data: {
              index: Z,
              overflows: G
            },
            reset: {
              placement: q
            }
          };
        let k = (F = G.filter((P) => P.overflows[0] <= 0).sort((P, I) => P.overflows[1] - I.overflows[1])[0]) == null ? void 0 : F.placement;
        if (!k)
          switch (C) {
            case "bestFit": {
              var Q;
              const P = (Q = G.filter((I) => {
                if (D) {
                  const X = el(I.placement);
                  return X === w || // Create a bias to the `y` side axis due to horizontal
                  // reading directions favoring greater width.
                  X === "y";
                }
                return !0;
              }).map((I) => [I.placement, I.overflows.filter((X) => X > 0).reduce((X, B) => X + B, 0)]).sort((I, X) => I[1] - X[1])[0]) == null ? void 0 : Q[0];
              P && (k = P);
              break;
            }
            case "initialPlacement":
              k = g;
              break;
          }
        if (u !== k)
          return {
            reset: {
              placement: k
            }
          };
      }
      return {};
    }
  };
};
function lb(n, o) {
  return {
    top: n.top - o.height,
    right: n.right - o.width,
    bottom: n.bottom - o.height,
    left: n.left - o.width
  };
}
function ob(n) {
  return mR.some((o) => n[o] >= 0);
}
const TC = function(n) {
  return n === void 0 && (n = {}), {
    name: "hide",
    options: n,
    async fn(o) {
      const {
        rects: a,
        platform: i
      } = o, {
        strategy: u = "referenceHidden",
        ...f
      } = Jl(n, o);
      switch (u) {
        case "referenceHidden": {
          const p = await i.detectOverflow(o, {
            ...f,
            elementContext: "reference"
          }), g = lb(p, a.reference);
          return {
            data: {
              referenceHiddenOffsets: g,
              referenceHidden: ob(g)
            }
          };
        }
        case "escaped": {
          const p = await i.detectOverflow(o, {
            ...f,
            altBoundary: !0
          }), g = lb(p, a.floating);
          return {
            data: {
              escapedOffsets: g,
              escaped: ob(g)
            }
          };
        }
        default:
          return {};
      }
    }
  };
}, $0 = /* @__PURE__ */ new Set(["left", "top"]);
async function RC(n, o) {
  const {
    placement: a,
    platform: i,
    elements: u
  } = n, f = await (i.isRTL == null ? void 0 : i.isRTL(u.floating)), p = In(a), g = ko(a), m = el(a) === "y", d = $0.has(p) ? -1 : 1, v = f && m ? -1 : 1, x = Jl(o, n);
  let {
    mainAxis: S,
    crossAxis: C,
    alignmentAxis: E
  } = typeof x == "number" ? {
    mainAxis: x,
    crossAxis: 0,
    alignmentAxis: null
  } : {
    mainAxis: x.mainAxis || 0,
    crossAxis: x.crossAxis || 0,
    alignmentAxis: x.alignmentAxis
  };
  return g && typeof E == "number" && (C = g === "end" ? E * -1 : E), m ? {
    x: C * v,
    y: S * d
  } : {
    x: S * d,
    y: C * v
  };
}
const CC = function(n) {
  return n === void 0 && (n = 0), {
    name: "offset",
    options: n,
    async fn(o) {
      var a, i;
      const {
        x: u,
        y: f,
        placement: p,
        middlewareData: g
      } = o, m = await RC(o, n);
      return p === ((a = g.offset) == null ? void 0 : a.placement) && (i = g.arrow) != null && i.alignmentOffset ? {} : {
        x: u + m.x,
        y: f + m.y,
        data: {
          ...m,
          placement: p
        }
      };
    }
  };
}, OC = function(n) {
  return n === void 0 && (n = {}), {
    name: "shift",
    options: n,
    async fn(o) {
      const {
        x: a,
        y: i,
        placement: u,
        platform: f
      } = o, {
        mainAxis: p = !0,
        crossAxis: g = !1,
        limiter: m = {
          fn: (w) => {
            let {
              x: N,
              y: A
            } = w;
            return {
              x: N,
              y: A
            };
          }
        },
        ...d
      } = Jl(n, o), v = {
        x: a,
        y: i
      }, x = await f.detectOverflow(o, d), S = el(u), C = Vp(S);
      let E = v[C], M = v[S];
      const T = (w, N) => w0(N + x[w === "y" ? "top" : "left"], N, N - x[w === "y" ? "bottom" : "right"]);
      p && (E = T(C, E)), g && (M = T(S, M));
      const z = m.fn({
        ...o,
        [C]: E,
        [S]: M
      });
      return {
        ...z,
        data: {
          x: z.x - a,
          y: z.y - i,
          enabled: {
            [C]: p,
            [S]: g
          }
        }
      };
    }
  };
}, MC = function(n) {
  return n === void 0 && (n = {}), {
    options: n,
    fn(o) {
      var a, i;
      const {
        x: u,
        y: f,
        placement: p,
        rects: g,
        middlewareData: m
      } = o, {
        offset: d = 0,
        mainAxis: v = !0,
        crossAxis: x = !0
      } = Jl(n, o), S = {
        x: u,
        y: f
      }, C = el(p), E = Vp(C);
      let M = S[E], T = S[C];
      const z = Jl(d, o), w = typeof z == "number" ? {
        mainAxis: z,
        crossAxis: 0
      } : {
        mainAxis: (a = z.mainAxis) != null ? a : 0,
        crossAxis: (i = z.crossAxis) != null ? i : 0
      };
      if (v) {
        const L = E === "y" ? "height" : "width", D = g.reference[E] - g.floating[L] + w.mainAxis, _ = g.reference[E] + g.reference[L] - w.mainAxis;
        M < D ? M = D : M > _ && (M = _);
      }
      if (x) {
        var N, A;
        const L = E === "y" ? "width" : "height", D = $0.has(In(p)), _ = g.reference[C] - g.floating[L] + (D && ((N = m.offset) == null ? void 0 : N[C]) || 0) + (D ? 0 : w.crossAxis), j = g.reference[C] + g.reference[L] + (D ? 0 : ((A = m.offset) == null ? void 0 : A[C]) || 0) - (D ? w.crossAxis : 0);
        T < _ ? T = _ : T > j && (T = j);
      }
      return {
        [E]: M,
        [C]: T
      };
    }
  };
}, AC = function(n) {
  return n === void 0 && (n = {}), {
    name: "size",
    options: n,
    async fn(o) {
      const {
        placement: a,
        rects: i,
        platform: u,
        elements: f
      } = o, {
        apply: p = () => {
        },
        ...g
      } = Jl(n, o), m = await u.detectOverflow(o, g), d = In(a), v = ko(a), x = el(a) === "y", {
        width: S,
        height: C
      } = i.floating;
      let E, M;
      d === "top" || d === "bottom" ? (E = d, M = v === (await (u.isRTL == null ? void 0 : u.isRTL(f.floating)) ? "start" : "end") ? "left" : "right") : (M = d, E = v === "end" ? "top" : "bottom");
      const T = C - m.top - m.bottom, z = S - m.left - m.right, w = ia(C - m[E], T), N = ia(S - m[M], z), A = o.middlewareData.shift, L = !A;
      let D = w, _ = N;
      A != null && A.enabled.x && (_ = z), A != null && A.enabled.y && (D = T), L && !v && (x ? _ = S - 2 * ql(m.left, m.right) : D = C - 2 * ql(m.top, m.bottom)), await p({
        ...o,
        availableWidth: _,
        availableHeight: D
      });
      const j = await u.getDimensions(f.floating);
      return S !== j.width || C !== j.height ? {
        reset: {
          rects: !0
        }
      } : {};
    }
  };
};
function ex(n) {
  const o = Vn(n);
  let a = parseFloat(o.width) || 0, i = parseFloat(o.height) || 0;
  const u = Rt(n), f = u ? n.offsetWidth : a, p = u ? n.offsetHeight : i, g = Ac(a) !== f || Ac(i) !== p;
  return g && (a = f, i = p), {
    width: a,
    height: i,
    $: g
  };
}
function Wp(n) {
  return We(n) ? n : n.contextElement;
}
function ra(n) {
  const o = Wp(n);
  if (!Rt(o))
    return Xl(1);
  const a = o.getBoundingClientRect(), {
    width: i,
    height: u,
    $: f
  } = ex(o);
  let p = (f ? Ac(a.width) : a.width) / i, g = (f ? Ac(a.height) : a.height) / u;
  return (!p || !Number.isFinite(p)) && (p = 1), (!g || !Number.isFinite(g)) && (g = 1), {
    x: p,
    y: g
  };
}
const zC = /* @__PURE__ */ Xl(0);
function tx(n) {
  const o = At(n);
  return !Mp() || !o.visualViewport ? zC : {
    x: o.visualViewport.offsetLeft,
    y: o.visualViewport.offsetTop
  };
}
function NC(n, o, a) {
  return o === void 0 && (o = !1), !!a && o && a === At(n);
}
function fr(n, o, a, i) {
  o === void 0 && (o = !1), a === void 0 && (a = !1);
  const u = n.getBoundingClientRect(), f = Wp(n);
  let p = Xl(1);
  o && (i ? We(i) && (p = ra(i)) : p = ra(n));
  const g = NC(f, a, i) ? tx(f) : Xl(0);
  let m = (u.left + g.x) / p.x, d = (u.top + g.y) / p.y, v = u.width / p.x, x = u.height / p.y;
  if (f && i) {
    const S = At(f), C = We(i) ? At(i) : i;
    let E = S, M = lp(E);
    for (; M && C !== E; ) {
      const T = ra(M), z = M.getBoundingClientRect(), w = Vn(M), N = z.left + (M.clientLeft + parseFloat(w.paddingLeft)) * T.x, A = z.top + (M.clientTop + parseFloat(w.paddingTop)) * T.y;
      m *= T.x, d *= T.y, v *= T.x, x *= T.y, m += N, d += A, E = At(M), M = lp(E);
    }
  }
  return wi({
    width: v,
    height: x,
    x: m,
    y: d
  });
}
function ou(n, o) {
  const a = Pc(n).scrollLeft;
  return o ? o.left + a : fr(Wl(n)).left + a;
}
function nx(n, o) {
  const a = n.getBoundingClientRect(), i = a.left + o.scrollLeft - ou(n, a), u = a.top + o.scrollTop;
  return {
    x: i,
    y: u
  };
}
function jC(n) {
  let {
    elements: o,
    rect: a,
    offsetParent: i,
    strategy: u
  } = n;
  const f = u === "fixed", p = Wl(i), g = o ? Vc(o.floating) : !1;
  if (i === p || g && f)
    return a;
  let m = {
    scrollLeft: 0,
    scrollTop: 0
  }, d = Xl(1);
  const v = Xl(0), x = Rt(i);
  if ((x || !f) && ((mn(i) !== "body" || pr(p)) && (m = Pc(i)), x)) {
    const C = fr(i);
    d = ra(i), v.x = C.x + i.clientLeft, v.y = C.y + i.clientTop;
  }
  const S = p && !x && !f ? nx(p, m) : Xl(0);
  return {
    width: a.width * d.x,
    height: a.height * d.y,
    x: a.x * d.x - m.scrollLeft * d.x + v.x + S.x,
    y: a.y * d.y - m.scrollTop * d.y + v.y + S.y
  };
}
function DC(n) {
  return n.getClientRects ? Array.from(n.getClientRects()) : [];
}
function kC(n) {
  const o = Pc(n), a = n.ownerDocument.body, i = ql(n.scrollWidth, n.clientWidth, a.scrollWidth, a.clientWidth), u = ql(n.scrollHeight, n.clientHeight, a.scrollHeight, a.clientHeight);
  let f = -o.scrollLeft + ou(n);
  const p = -o.scrollTop;
  return Vn(a).direction === "rtl" && (f += ql(n.clientWidth, a.clientWidth) - i), {
    width: i,
    height: u,
    x: f,
    y: p
  };
}
const _C = 25;
function HC(n, o, a) {
  a === void 0 && (a = "viewport");
  const i = a === "layoutViewport", u = At(n), f = Wl(n), p = u.visualViewport;
  let g = f.clientWidth, m = f.clientHeight, d = 0, v = 0;
  if (p) {
    const S = !Mp() || o === "fixed";
    i ? S || (d = -p.offsetLeft, v = -p.offsetTop) : (g = p.width, m = p.height, S && (d = p.offsetLeft, v = p.offsetTop));
  }
  if (ou(f) <= 0) {
    const S = f.ownerDocument, C = S.body, E = getComputedStyle(C), M = S.compatMode === "CSS1Compat" && parseFloat(E.marginLeft) + parseFloat(E.marginRight) || 0, T = Math.abs(f.clientWidth - C.clientWidth - M), z = getComputedStyle(f).scrollbarGutter === "stable both-edges" ? T / 2 : T;
    z <= _C && (g -= z);
  }
  return {
    width: g,
    height: m,
    x: d,
    y: v
  };
}
function LC(n, o) {
  const a = fr(n, !0, o === "fixed"), i = a.top + n.clientTop, u = a.left + n.clientLeft, f = ra(n), p = n.clientWidth * f.x, g = n.clientHeight * f.y, m = u * f.x, d = i * f.y;
  return {
    width: p,
    height: g,
    x: m,
    y: d
  };
}
function rb(n, o, a) {
  let i;
  if (o === "viewport" || o === "layoutViewport")
    i = HC(n, a, o);
  else if (o === "document")
    i = kC(Wl(n));
  else if (We(o))
    i = LC(o, a);
  else {
    const u = tx(n);
    i = {
      x: o.x - u.x,
      y: o.y - u.y,
      width: o.width,
      height: o.height
    };
  }
  return wi(i);
}
function UC(n, o) {
  const a = o.get(n);
  if (a)
    return a;
  let i = bi(n, [], !1).filter((g) => We(g) && mn(g) !== "body"), u = null;
  const f = Vn(n).position === "fixed";
  let p = f ? Fl(n) : n;
  for (; We(p) && !Gl(p); ) {
    const g = Vn(p), m = Op(p), d = u ? u.position : f ? "fixed" : "";
    !m && (d === "fixed" || d === "absolute" && g.position === "static") ? i = i.filter((x) => x !== p) : u = g, p = Fl(p);
  }
  return o.set(n, i), i;
}
function BC(n) {
  let {
    element: o,
    boundary: a,
    rootBoundary: i,
    strategy: u
  } = n;
  const p = [...a === "clippingAncestors" ? Vc(o) ? [] : UC(o, this._c) : [].concat(a), i], g = rb(o, p[0], u);
  let m = g.top, d = g.right, v = g.bottom, x = g.left;
  for (let S = 1; S < p.length; S++) {
    const C = rb(o, p[S], u);
    m = ql(C.top, m), d = ia(C.right, d), v = ia(C.bottom, v), x = ql(C.left, x);
  }
  return {
    width: d - x,
    height: v - m,
    x,
    y: m
  };
}
function IC(n) {
  const {
    width: o,
    height: a
  } = ex(n);
  return {
    width: o,
    height: a
  };
}
function VC(n, o, a) {
  const i = Rt(o), u = Wl(o), f = a === "fixed", p = fr(n, !0, f, o);
  let g = {
    scrollLeft: 0,
    scrollTop: 0
  };
  const m = Xl(0);
  if ((i || !f) && ((mn(o) !== "body" || pr(u)) && (g = Pc(o)), i)) {
    const S = fr(o, !0, f, o);
    m.x = S.x + o.clientLeft, m.y = S.y + o.clientTop;
  }
  !i && u && (m.x = ou(u));
  const d = u && !i && !f ? nx(u, g) : Xl(0), v = p.left + g.scrollLeft - m.x - d.x, x = p.top + g.scrollTop - m.y - d.y;
  return {
    x: v,
    y: x,
    width: p.width,
    height: p.height
  };
}
function qd(n) {
  return Vn(n).position === "static";
}
function ab(n, o) {
  if (!Rt(n) || Vn(n).position === "fixed")
    return null;
  if (o)
    return o(n);
  let a = n.offsetParent;
  return Wl(n) === a && (a = a.ownerDocument.body), a;
}
function lx(n, o) {
  const a = At(n);
  if (Vc(n))
    return a;
  if (!Rt(n)) {
    let u = Fl(n);
    for (; u && !Gl(u); ) {
      if (We(u) && !qd(u))
        return u;
      u = Fl(u);
    }
    return a;
  }
  let i = ab(n, o);
  for (; i && ME(i) && qd(i); )
    i = ab(i, o);
  return i && Gl(i) && qd(i) && !Op(i) ? a : i || NE(n) || a;
}
const PC = async function(n) {
  const o = this.getOffsetParent || lx, a = this.getDimensions, i = await a(n.floating);
  return {
    reference: VC(n.reference, await o(n.floating), n.strategy),
    floating: {
      x: 0,
      y: 0,
      width: i.width,
      height: i.height
    }
  };
};
function YC(n) {
  return Vn(n).direction === "rtl";
}
const ox = {
  convertOffsetParentRelativeRectToViewportRelativeRect: jC,
  getDocumentElement: Wl,
  getClippingRect: BC,
  getOffsetParent: lx,
  getElementRects: PC,
  getClientRects: DC,
  getDimensions: IC,
  getScale: ra,
  isElement: We,
  isRTL: YC
};
function rx(n, o) {
  return n.x === o.x && n.y === o.y && n.width === o.width && n.height === o.height;
}
function GC(n, o, a) {
  let i = null, u;
  const f = Wl(n);
  function p() {
    var v;
    clearTimeout(u), (v = i) == null || v.disconnect(), i = null;
  }
  function g(v, x) {
    v === void 0 && (v = !1), x === void 0 && (x = 1), p();
    const S = n.getBoundingClientRect(), {
      left: C,
      top: E,
      width: M,
      height: T
    } = S;
    if (v || o(), !M || !T)
      return;
    const z = Qs(E), w = Qs(f.clientWidth - (C + M)), N = Qs(f.clientHeight - (E + T)), A = Qs(C), D = {
      rootMargin: -z + "px " + -w + "px " + -N + "px " + -A + "px",
      threshold: ql(0, ia(1, x)) || 1
    };
    let _ = !0;
    function j(V) {
      const G = V[0].intersectionRatio;
      if (!rx(S, n.getBoundingClientRect()))
        return g();
      if (G !== x) {
        if (!_)
          return g();
        G ? g(!1, G) : u = setTimeout(() => {
          g(!1, 1e-7);
        }, 1e3);
      }
      _ = !1;
    }
    try {
      i = new IntersectionObserver(j, {
        ...D,
        // Handle <iframe>s
        root: f.ownerDocument
      });
    } catch {
      i = new IntersectionObserver(j, D);
    }
    i.observe(n);
  }
  const m = At(n), d = () => g(a);
  return m.addEventListener("resize", d), g(!0), () => {
    m.removeEventListener("resize", d), p();
  };
}
function ib(n, o, a, i) {
  i === void 0 && (i = {});
  const {
    ancestorScroll: u = !0,
    ancestorResize: f = !0,
    elementResize: p = typeof ResizeObserver == "function",
    layoutShift: g = typeof IntersectionObserver == "function",
    animationFrame: m = !1
  } = i, d = Wp(n), v = u || f ? [...d ? bi(d) : [], ...o ? bi(o) : []] : [];
  v.forEach((z) => {
    u && z.addEventListener("scroll", a), f && z.addEventListener("resize", a);
  });
  const x = d && g ? GC(d, a, f) : null;
  let S = -1, C = null;
  p && (C = new ResizeObserver((z) => {
    let [w] = z;
    w && w.target === d && C && o && (C.unobserve(o), cancelAnimationFrame(S), S = requestAnimationFrame(() => {
      var N;
      (N = C) == null || N.observe(o);
    })), a();
  }), d && !m && C.observe(d), o && C.observe(o));
  let E, M = m ? fr(n) : null;
  m && T();
  function T() {
    const z = fr(n);
    M && !rx(M, z) && a(), M = z, E = requestAnimationFrame(T);
  }
  return a(), () => {
    var z;
    v.forEach((w) => {
      u && w.removeEventListener("scroll", a), f && w.removeEventListener("resize", a);
    }), x?.(), (z = C) == null || z.disconnect(), C = null, m && cancelAnimationFrame(E);
  };
}
const qC = CC, XC = OC, FC = EC, KC = AC, QC = TC, ZC = MC, JC = (n, o, a) => {
  const i = /* @__PURE__ */ new Map(), u = a ?? {}, f = {
    ...ox,
    ...u.platform,
    _c: i
  };
  return SC(n, o, {
    ...u,
    platform: f
  });
};
var WC = typeof document < "u", $C = function() {
}, hc = WC ? h.useLayoutEffect : $C;
function kc(n, o) {
  if (n === o)
    return !0;
  if (typeof n != typeof o)
    return !1;
  if (typeof n == "function" && n.toString() === o.toString())
    return !0;
  let a, i, u;
  if (n && o && typeof n == "object") {
    if (Array.isArray(n)) {
      if (a = n.length, a !== o.length) return !1;
      for (i = a; i-- !== 0; )
        if (!kc(n[i], o[i]))
          return !1;
      return !0;
    }
    if (u = Object.keys(n), a = u.length, a !== Object.keys(o).length)
      return !1;
    for (i = a; i-- !== 0; )
      if (!{}.hasOwnProperty.call(o, u[i]))
        return !1;
    for (i = a; i-- !== 0; ) {
      const f = u[i];
      if (!(f === "_owner" && n.$$typeof) && !kc(n[f], o[f]))
        return !1;
    }
    return !0;
  }
  return n !== n && o !== o;
}
function ax(n) {
  return typeof window > "u" ? 1 : (n.ownerDocument.defaultView || window).devicePixelRatio || 1;
}
function sb(n, o) {
  const a = ax(n);
  return Math.round(o * a) / a;
}
function Xd(n) {
  const o = h.useRef(n);
  return hc(() => {
    o.current = n;
  }), o;
}
function eO(n) {
  n === void 0 && (n = {});
  const {
    placement: o = "bottom",
    strategy: a = "absolute",
    middleware: i = [],
    platform: u,
    elements: {
      reference: f,
      floating: p
    } = {},
    transform: g = !0,
    whileElementsMounted: m,
    open: d
  } = n, [v, x] = h.useState({
    x: 0,
    y: 0,
    strategy: a,
    placement: o,
    middlewareData: {},
    isPositioned: !1
  }), [S, C] = h.useState(i);
  kc(S, i) || C(i);
  const [E, M] = h.useState(null), [T, z] = h.useState(null), w = h.useCallback((I) => {
    I !== D.current && (D.current = I, M(I));
  }, []), N = h.useCallback((I) => {
    I !== _.current && (_.current = I, z(I));
  }, []), A = f || E, L = p || T, D = h.useRef(null), _ = h.useRef(null), j = h.useRef(v), V = m != null, G = Xd(m), ne = Xd(u), F = Xd(d), Q = h.useCallback(() => {
    if (!D.current || !_.current)
      return;
    const I = {
      placement: o,
      strategy: a,
      middleware: S
    };
    ne.current && (I.platform = ne.current), JC(D.current, _.current, I).then((X) => {
      const B = {
        ...X,
        // The floating element's position may be recomputed while it's closed
        // but still mounted (such as when transitioning out). To ensure
        // `isPositioned` will be `false` initially on the next open, avoid
        // setting it to `true` when `open === false` (must be specified).
        isPositioned: F.current !== !1
      };
      Z.current && !kc(j.current, B) && (j.current = B, hl.flushSync(() => {
        x(B);
      }));
    });
  }, [S, o, a, ne, F]);
  hc(() => {
    d === !1 && j.current.isPositioned && (j.current.isPositioned = !1, x((I) => ({
      ...I,
      isPositioned: !1
    })));
  }, [d]);
  const Z = h.useRef(!1);
  hc(() => (Z.current = !0, () => {
    Z.current = !1;
  }), []), hc(() => {
    if (A && (D.current = A), L && (_.current = L), A && L) {
      if (G.current)
        return G.current(A, L, Q);
      Q();
    }
  }, [A, L, Q, G, V]);
  const q = h.useMemo(() => ({
    reference: D,
    floating: _,
    setReference: w,
    setFloating: N
  }), [w, N]), k = h.useMemo(() => ({
    reference: A,
    floating: L
  }), [A, L]), P = h.useMemo(() => {
    const I = {
      position: a,
      left: 0,
      top: 0
    };
    if (!k.floating)
      return I;
    const X = sb(k.floating, v.x), B = sb(k.floating, v.y);
    return g ? {
      ...I,
      transform: "translate(" + X + "px, " + B + "px)",
      ...ax(k.floating) >= 1.5 && {
        willChange: "transform"
      }
    } : {
      position: a,
      left: X,
      top: B
    };
  }, [a, g, k.floating, v.x, v.y]);
  return h.useMemo(() => ({
    ...v,
    update: Q,
    refs: q,
    elements: k,
    floatingStyles: P
  }), [v, Q, q, k, P]);
}
const tO = (n, o) => {
  const a = qC(n);
  return {
    name: a.name,
    fn: a.fn,
    options: [n, o]
  };
}, nO = (n, o) => {
  const a = XC(n);
  return {
    name: a.name,
    fn: a.fn,
    options: [n, o]
  };
}, lO = (n, o) => ({
  fn: ZC(n).fn,
  options: [n, o]
}), oO = (n, o) => {
  const a = FC(n);
  return {
    name: a.name,
    fn: a.fn,
    options: [n, o]
  };
}, rO = (n, o) => {
  const a = KC(n);
  return {
    name: a.name,
    fn: a.fn,
    options: [n, o]
  };
}, aO = (n, o) => {
  const a = QC(n);
  return {
    name: a.name,
    fn: a.fn,
    options: [n, o]
  };
};
function $p(n) {
  const o = h.useRef(!0);
  o.current && (o.current = !1, n());
}
const me = (n, o, a, i, u, f, ...p) => {
  if (p.length > 0)
    throw new Error(Ct(1));
  let g;
  if (n)
    g = n;
  else
    throw (
      /* minify-error-disabled */
      new Error("Missing arguments")
    );
  return g;
};
var Fd = { exports: {} }, Kd = {};
var cb;
function iO() {
  if (cb) return Kd;
  cb = 1;
  var n = Ti();
  function o(x, S) {
    return x === S && (x !== 0 || 1 / x === 1 / S) || x !== x && S !== S;
  }
  var a = typeof Object.is == "function" ? Object.is : o, i = n.useState, u = n.useEffect, f = n.useLayoutEffect, p = n.useDebugValue;
  function g(x, S) {
    var C = S(), E = i({ inst: { value: C, getSnapshot: S } }), M = E[0].inst, T = E[1];
    return f(
      function() {
        M.value = C, M.getSnapshot = S, m(M) && T({ inst: M });
      },
      [x, C, S]
    ), u(
      function() {
        return m(M) && T({ inst: M }), x(function() {
          m(M) && T({ inst: M });
        });
      },
      [x]
    ), p(C), C;
  }
  function m(x) {
    var S = x.getSnapshot;
    x = x.value;
    try {
      var C = S();
      return !a(x, C);
    } catch {
      return !0;
    }
  }
  function d(x, S) {
    return S();
  }
  var v = typeof window > "u" || typeof window.document > "u" || typeof window.document.createElement > "u" ? d : g;
  return Kd.useSyncExternalStore = n.useSyncExternalStore !== void 0 ? n.useSyncExternalStore : v, Kd;
}
var ub;
function ix() {
  return ub || (ub = 1, Fd.exports = iO()), Fd.exports;
}
var sx = ix(), Qd = { exports: {} }, Zd = {};
var fb;
function sO() {
  if (fb) return Zd;
  fb = 1;
  var n = Ti(), o = ix();
  function a(d, v) {
    return d === v && (d !== 0 || 1 / d === 1 / v) || d !== d && v !== v;
  }
  var i = typeof Object.is == "function" ? Object.is : a, u = o.useSyncExternalStore, f = n.useRef, p = n.useEffect, g = n.useMemo, m = n.useDebugValue;
  return Zd.useSyncExternalStoreWithSelector = function(d, v, x, S, C) {
    var E = f(null);
    if (E.current === null) {
      var M = { hasValue: !1, value: null };
      E.current = M;
    } else M = E.current;
    E = g(
      function() {
        function z(D) {
          if (!w) {
            if (w = !0, N = D, D = S(D), C !== void 0 && M.hasValue) {
              var _ = M.value;
              if (C(_, D))
                return A = _;
            }
            return A = D;
          }
          if (_ = A, i(N, D)) return _;
          var j = S(D);
          return C !== void 0 && C(_, j) ? (N = D, _) : (N = D, A = j);
        }
        var w = !1, N, A, L = x === void 0 ? null : x;
        return [
          function() {
            return z(v());
          },
          L === null ? void 0 : function() {
            return z(L());
          }
        ];
      },
      [v, x, S, C]
    );
    var T = u(d, E[0], E[1]);
    return p(
      function() {
        M.hasValue = !0, M.value = T;
      },
      [T]
    ), m(T), T;
  }, Zd;
}
var db;
function cO() {
  return db || (db = 1, Qd.exports = sO()), Qd.exports;
}
var uO = cO();
const gp = [];
let mp;
function fO() {
  return mp;
}
function dO(n) {
  gp.push(n);
}
function eg(n) {
  const o = (a, i) => {
    const u = xn(pO).current;
    let f;
    try {
      mp = u;
      for (const p of gp)
        p.before(u);
      f = n(a, i);
      for (const p of gp)
        p.after(u);
      u.didInitialize = !0;
    } finally {
      mp = void 0;
    }
    return f;
  };
  return o.displayName = n.displayName || n.name, o;
}
function cx(n) {
  return /* @__PURE__ */ h.forwardRef(eg(n));
}
function pO() {
  return {
    didInitialize: !1
  };
}
const gO = Dp(19), mO = gO ? yO : vO;
function Ye(n, o, a, i, u) {
  return mO(n, o, a, i, u);
}
function hO(n, o, a, i, u) {
  const f = h.useCallback(() => o(n.getSnapshot(), a, i, u), [n, o, a, i, u]);
  return sx.useSyncExternalStore(n.subscribe, f, f);
}
dO({
  before(n) {
    n.syncIndex = 0, n.didInitialize || (n.syncTick = 1, n.syncHooks = [], n.didChangeStore = !0, n.getSnapshot = () => {
      let o = !1;
      for (let a = 0; a < n.syncHooks.length; a += 1) {
        const i = n.syncHooks[a], u = i.selector(i.store.state, i.a1, i.a2, i.a3);
        Object.is(i.value, u) || (o = !0, i.value = u);
      }
      return o && (n.syncTick += 1), n.syncTick;
    });
  },
  after(n) {
    n.syncHooks.length > 0 && (n.didChangeStore && (n.didChangeStore = !1, n.subscribe = (o) => {
      const a = /* @__PURE__ */ new Set();
      for (const u of n.syncHooks)
        a.add(u.store);
      const i = [];
      for (const u of a)
        i.push(u.subscribe(o));
      return () => {
        for (const u of i)
          u();
      };
    }), sx.useSyncExternalStore(n.subscribe, n.getSnapshot, n.getSnapshot));
  }
});
function yO(n, o, a, i, u) {
  const f = fO();
  if (!f)
    return hO(n, o, a, i, u);
  const p = f.syncIndex;
  f.syncIndex += 1;
  let g;
  return f.didInitialize ? (g = f.syncHooks[p], (g.store !== n || g.selector !== o || !Object.is(g.a1, a) || !Object.is(g.a2, i) || !Object.is(g.a3, u)) && (g.store !== n && (f.didChangeStore = !0), g.store = n, g.selector = o, g.a1 = a, g.a2 = i, g.a3 = u, g.value = o(n.getSnapshot(), a, i, u))) : (g = {
    store: n,
    selector: o,
    a1: a,
    a2: i,
    a3: u,
    value: o(n.getSnapshot(), a, i, u)
  }, f.syncHooks.push(g)), g.value;
}
function vO(n, o, a, i, u) {
  return uO.useSyncExternalStoreWithSelector(n.subscribe, n.getSnapshot, n.getSnapshot, (f) => o(f, a, i, u));
}
class ux {
  /**
   * The current state of the store.
   * This property is updated immediately when the state changes as a result of calling {@link setState}, {@link update}, or {@link set}.
   * To subscribe to state changes, use the {@link useState} method. The value returned by {@link useState} is updated after the component renders (similarly to React's useState).
   * The values can be used directly (to avoid subscribing to the store) in effects or event handlers.
   *
   * Do not modify properties in state directly. Instead, use the provided methods to ensure proper state management and listener notification.
   */
  // Internal state to handle recursive `setState()` calls
  constructor(o) {
    this.state = o, this.listeners = /* @__PURE__ */ new Set(), this.updateTick = 0;
  }
  /**
   * Registers a listener that will be called whenever the store's state changes.
   *
   * @param fn The listener function to be called on state changes.
   * @returns A function to unsubscribe the listener.
   */
  subscribe = (o) => (this.listeners.add(o), () => {
    this.listeners.delete(o);
  });
  /**
   * Returns the current state of the store.
   */
  getSnapshot = () => this.state;
  /**
   * Updates the entire store's state and notifies all registered listeners.
   *
   * @param newState The new state to set for the store.
   */
  setState(o) {
    if (this.state === o)
      return;
    this.state = o, this.updateTick += 1;
    const a = this.updateTick;
    for (const i of this.listeners) {
      if (a !== this.updateTick)
        return;
      i(o);
    }
  }
  /**
   * Merges the provided changes into the current state and notifies listeners if there are changes.
   *
   * @param changes An object containing the changes to apply to the current state.
   */
  update(o) {
    for (const a in o)
      if (!Object.is(this.state[a], o[a])) {
        this.setState({
          ...this.state,
          ...o
        });
        return;
      }
  }
  /**
   * Sets a specific key in the store's state to a new value and notifies listeners if the value has changed.
   *
   * @param key The key in the store's state to update.
   * @param value The new value to set for the specified key.
   */
  set(o, a) {
    Object.is(this.state[o], a) || this.setState({
      ...this.state,
      [o]: a
    });
  }
  /**
   * Gives the state a new reference and updates all registered listeners.
   */
  notifyAll() {
    const o = {
      ...this.state
    };
    this.setState(o);
  }
  use(o, a, i, u) {
    return Ye(this, o, a, i, u);
  }
}
class zi extends ux {
  /**
   * Creates a new ReactStore instance.
   *
   * @param state Initial state of the store.
   * @param context Non-reactive context values.
   * @param selectors Optional selectors for use with `useState`.
   */
  constructor(o, a = {}, i) {
    super(o), this.context = a, this.selectors = i;
  }
  /**
   * Non-reactive values such as refs, callbacks, etc.
   */
  /**
   * Synchronizes a single external value into the store.
   *
   * Note that the while the value in `state` is updated immediately, the value returned
   * by `useState` is updated before the next render (similarly to React's `useState`).
   */
  useSyncedValue(o, a) {
    h.useDebugValue(o);
    const i = this;
    we(() => {
      i.state[o] !== a && i.set(o, a);
    }, [i, o, a]);
  }
  /**
   * Synchronizes a single external value into the store and
   * cleans it up (sets to `undefined`) on unmount.
   *
   * Note that the while the value in `state` is updated immediately, the value returned
   * by `useState` is updated before the next render (similarly to React's `useState`).
   */
  useSyncedValueWithCleanup(o, a) {
    const i = this;
    we(() => (i.state[o] !== a && i.set(o, a), () => {
      i.set(o, void 0);
    }), [i, o, a]);
  }
  /**
   * Synchronizes multiple external values into the store.
   *
   * Note that the while the values in `state` are updated immediately, the values returned
   * by `useState` are updated before the next render (similarly to React's `useState`).
   */
  useSyncedValues(o) {
    const a = this, i = Object.values(o);
    we(() => {
      a.update(o);
    }, [a, ...i]);
  }
  /**
   * Registers a controllable prop pair (`controlled`, `defaultValue`) for a specific key. If `controlled`
   * is non-undefined, the store's state at `key` is updated to match `controlled`.
   */
  useControlledProp(o, a) {
    h.useDebugValue(o);
    const i = this, u = a !== void 0;
    we(() => {
      u && !Object.is(i.state[o], a) && i.setState({
        ...i.state,
        [o]: a
      });
    }, [i, o, a, u]);
  }
  /** Gets the current value from the store using a selector with the provided key.
   *
   * @param key Key of the selector to use.
   */
  select(o, a, i, u) {
    const f = this.selectors[o];
    return f(this.state, a, i, u);
  }
  /**
   * Returns a value from the store's state using a selector function.
   * Used to subscribe to specific parts of the state.
   * This methods causes a rerender whenever the selected state changes.
   *
   * @param key Key of the selector to use.
   */
  useState(o, a, i, u) {
    return h.useDebugValue(o), Ye(this, this.selectors[o], a, i, u);
  }
  /**
   * Wraps a function with `useStableCallback` to ensure it has a stable reference
   * and assigns it to the context.
   *
   * @param key Key of the event callback. Must be a function in the context.
   * @param fn Function to assign.
   */
  useContextCallback(o, a) {
    h.useDebugValue(o);
    const i = ze(a ?? an);
    this.context[o] = i;
  }
  /**
   * Returns a stable setter function for a specific key in the store's state.
   * It's commonly used to pass as a ref callback to React elements.
   *
   * @param key Key of the state to set.
   */
  useStateSetter(o) {
    const a = h.useRef(void 0);
    return a.current === void 0 && (a.current = (i) => {
      this.set(o, i);
    }), a.current;
  }
  /**
   * Observes changes derived from the store's selectors and calls the listener when the selected value changes.
   *
   * @param key Key of the selector to observe.
   * @param listener Listener function called when the selector result changes.
   */
  observe(o, a) {
    let i;
    typeof o == "function" ? i = o : i = this.selectors[o];
    let u = i(this.state);
    return a(u, u, this), this.subscribe((f) => {
      const p = i(f);
      if (!Object.is(u, p)) {
        const g = u;
        u = p, a(p, g, this);
      }
    });
  }
}
const bO = {
  open: me((n) => n.open),
  transitionStatus: me((n) => n.transitionStatus),
  domReferenceElement: me((n) => n.domReferenceElement),
  referenceElement: me((n) => n.positionReference ?? n.referenceElement),
  floatingElement: me((n) => n.floatingElement),
  floatingId: me((n) => n.floatingId)
};
class ru extends zi {
  constructor(o) {
    const {
      syncOnly: a,
      nested: i,
      onOpenChange: u,
      triggerElements: f,
      ...p
    } = o;
    super({
      ...p,
      positionReference: p.referenceElement,
      domReferenceElement: p.referenceElement
    }, {
      onOpenChange: u,
      dataRef: {
        current: {}
      },
      events: K0(),
      nested: i,
      triggerElements: f
    }, bO), this.syncOnly = a;
  }
  /**
   * Syncs the event used by hover logic to distinguish hover-open from click-like interaction.
   */
  syncOpenEvent = (o, a) => {
    (!o || !this.state.open || // Prevent a pending hover-open from overwriting a click-open event, while allowing
    // click events to upgrade a hover-open.
    a != null && gR(a)) && (this.context.dataRef.current.openEvent = o ? a : void 0);
  };
  /**
   * Runs the root-owned side effects for an open state change.
   */
  dispatchOpenChange = (o, a) => {
    this.syncOpenEvent(o, a.event);
    const i = {
      open: o,
      reason: a.reason,
      nativeEvent: a.event,
      nested: this.context.nested,
      triggerElement: a.trigger
    };
    this.context.events.emit("openchange", i);
  };
  /**
   * Emits the `openchange` event through the internal event emitter and calls the `onOpenChange` handler with the provided arguments.
   *
   * @param newOpen The new open state.
   * @param eventDetails Details about the event that triggered the open state change.
   */
  setOpen = (o, a) => {
    if (this.syncOnly) {
      this.context.onOpenChange?.(o, a);
      return;
    }
    this.dispatchOpenChange(o, a), this.context.onOpenChange?.(o, a);
  };
}
function fx(n) {
  const {
    popupStore: o,
    treatPopupAsFloatingElement: a = !1,
    floatingRootContext: i,
    floatingId: u,
    nested: f,
    onOpenChange: p
  } = n, g = o.useState("open"), m = o.useState("activeTriggerElement"), d = o.useState(a ? "popupElement" : "positionerElement"), v = o.context.triggerElements, x = p, S = h.useRef(null);
  i === void 0 && S.current === null && (S.current = new ru({
    open: g,
    transitionStatus: void 0,
    referenceElement: m,
    floatingElement: d,
    triggerElements: v,
    onOpenChange: x,
    floatingId: u,
    syncOnly: !0,
    nested: f
  }));
  const C = i ?? S.current;
  return o.useSyncedValue("floatingId", u), we(() => {
    const E = {
      open: g,
      floatingId: u,
      referenceElement: m,
      floatingElement: d
    };
    We(m) && (E.domReferenceElement = m), C.state.positionReference === C.state.referenceElement && (E.positionReference = m), C.update(E);
  }, [g, u, m, d, C]), C.context.onOpenChange = x, C.context.nested = f, C;
}
function au(n, o = !1, a = !1) {
  const [i, u] = h.useState(n && o ? "idle" : void 0), [f, p] = h.useState(n);
  return n && !f && (p(!0), u("starting")), !n && f && i !== "ending" && !a && u("ending"), !n && !f && i === "ending" && u(void 0), we(() => {
    if (!n && f && i !== "ending" && a) {
      const g = gl.request(() => {
        u("ending");
      });
      return () => {
        gl.cancel(g);
      };
    }
  }, [n, f, i, a]), we(() => {
    if (!n || o)
      return;
    const g = gl.request(() => {
      u(void 0);
    });
    return () => {
      gl.cancel(g);
    };
  }, [o, n]), we(() => {
    if (!n || !o)
      return;
    n && f && i !== "idle" && u("starting");
    const g = gl.request(() => {
      u("idle");
    });
    return () => {
      gl.cancel(g);
    };
  }, [o, n, f, i]), {
    mounted: f,
    setMounted: p,
    transitionStatus: i
  };
}
let Ei = /* @__PURE__ */ (function(n) {
  return n.startingStyle = "data-starting-style", n.endingStyle = "data-ending-style", n;
})({});
const xO = {
  [Ei.startingStyle]: ""
}, wO = {
  [Ei.endingStyle]: ""
}, Ho = {
  transitionStatus(n) {
    return n === "starting" ? xO : n === "ending" ? wO : null;
  }
};
function tg(n, o = !1, a = !0) {
  const i = ca();
  return ze((u, f = null) => {
    i.cancel();
    const p = Bl(n);
    if (p == null)
      return;
    const g = p, m = () => {
      hl.flushSync(u);
    };
    if (typeof g.getAnimations != "function" || globalThis.BASE_UI_ANIMATIONS_DISABLED) {
      u();
      return;
    }
    function d() {
      Promise.all(g.getAnimations().map((v) => v.finished)).then(() => {
        f?.aborted || m();
      }).catch(() => {
        if (a) {
          f?.aborted || m();
          return;
        }
        const v = g.getAnimations();
        !f?.aborted && v.length > 0 && v.some((x) => x.pending || x.playState !== "finished") && d();
      });
    }
    if (o) {
      const v = Ei.startingStyle;
      if (!g.hasAttribute(v)) {
        i.request(d);
        return;
      }
      const x = new MutationObserver(() => {
        g.hasAttribute(v) || (x.disconnect(), d());
      });
      x.observe(g, {
        attributes: !0,
        attributeFilter: [v]
      }), f?.addEventListener("abort", () => x.disconnect(), {
        once: !0
      });
      return;
    }
    i.request(d);
  });
}
function no(n) {
  const {
    enabled: o = !0,
    open: a,
    ref: i,
    onComplete: u
  } = n, f = ze(u), p = tg(i, a, !1);
  h.useEffect(() => {
    if (!o)
      return;
    const g = new AbortController();
    return p(f, g.signal), () => {
      g.abort();
    };
  }, [o, a, f, p]);
}
const fa = {
  tabIndex: -1,
  [sp]: ""
};
function dx(n) {
  return (o) => o === "touch" ? n.current : !0;
}
function ng(n, o, a = !1) {
  const i = cr(), u = to() != null, f = h.useRef(null);
  n === void 0 && f.current === null && (f.current = o(i, u));
  const p = n ?? f.current;
  return fx({
    popupStore: p,
    treatPopupAsFloatingElement: a,
    floatingRootContext: p.state.floatingRootContext,
    floatingId: i,
    nested: u,
    onOpenChange: p.setOpen
  }), {
    store: p,
    internalStore: f.current
  };
}
function px(n, o) {
  const a = h.useRef(null), i = h.useRef(null);
  return h.useCallback((u) => {
    if (n === void 0)
      return;
    let f = !1;
    if (a.current !== null) {
      const p = a.current, g = i.current, m = o.context.triggerElements.getById(p);
      g && m === g && (o.context.triggerElements.delete(p), f = !0), a.current = null, i.current = null;
    }
    if (u !== null && (a.current = n, i.current = u, o.context.triggerElements.add(n, u), f = !0), f) {
      const p = o.context.triggerElements.size;
      o.select("open") && o.state.triggerCount !== p && o.set("triggerCount", p);
    }
  }, [o, n]);
}
function iu(n, o, a, i = !1) {
  o ? n.preventUnmountingOnClose = !1 : i && (n.preventUnmountingOnClose = !0);
  const u = a?.id ?? null;
  (u || o) && (n.activeTriggerId = u, n.activeTriggerElement = a ?? null);
}
function lg(n) {
  let o = !1;
  return n.preventUnmountOnClose = () => {
    o = !0;
  }, () => o;
}
function SO(n, o, a, i = {}) {
  const u = a.reason, f = u === Pt, p = o && u === ta, g = !o && (u === Zl || u === Ci), m = lg(a);
  if (n.context.onOpenChange?.(o, a), a.isCanceled)
    return;
  i.onBeforeDispatch?.(), n.state.floatingRootContext.dispatchOpenChange(o, a);
  const d = () => {
    const v = {
      ...i.extraState,
      open: o
    };
    p ? v.instantType = "focus" : g ? v.instantType = "dismiss" : f && (v.instantType = void 0), iu(v, o, a.trigger, m()), n.update(v);
  };
  f ? hl.flushSync(d) : d();
}
function og(n, o, a, i) {
  $p(() => {
    o === void 0 && n.state.open === !1 && a && (n.state = {
      ...n.state,
      open: !0,
      activeTriggerId: i,
      preventUnmountingOnClose: !1
    });
  });
}
function rg(n, o, a, i) {
  const u = a.useState("isMountedByTrigger", n), f = px(n, a), p = ze((g) => {
    if (f(g), !g)
      return;
    const m = a.select("open"), d = a.select("activeTriggerId");
    if (d === n) {
      a.update({
        activeTriggerElement: g,
        ...m ? i : null
      });
      return;
    }
    d == null && m && a.update({
      activeTriggerId: n,
      activeTriggerElement: g,
      ...i
    });
  });
  return we(() => {
    u && a.update({
      activeTriggerElement: o.current,
      ...i
    });
  }, [u, a, o, ...Object.values(i)]), {
    registerTrigger: p,
    isMountedByThisTrigger: u
  };
}
function su(n, o = {}) {
  const {
    closeOnActiveTriggerUnmount: a = !1
  } = o, i = n.useState("open"), u = n.useState("triggerCount");
  we(() => {
    if (!i) {
      n.state.triggerCount !== 0 && n.set("triggerCount", 0);
      return;
    }
    const f = n.context.triggerElements.size, p = {};
    n.state.triggerCount !== f && (p.triggerCount = f);
    const g = n.select("activeTriggerId");
    let m = null;
    if (g) {
      const d = n.context.triggerElements.getById(g);
      d ? d !== n.state.activeTriggerElement && (p.activeTriggerElement = d) : m = g;
    }
    if (!m && !g && f === 1) {
      const d = n.context.triggerElements.entries().next();
      if (!d.done) {
        const [v, x] = d.value;
        p.activeTriggerId = v, p.activeTriggerElement = x;
      }
    }
    (p.triggerCount !== void 0 || p.activeTriggerId !== void 0 || p.activeTriggerElement !== void 0) && n.update(p), m && a && queueMicrotask(() => {
      if (n.select("open") && n.select("activeTriggerId") === m && !n.context.triggerElements.getById(m)) {
        const d = Pe(eo);
        n.setOpen(!1, d), d.isCanceled || n.update({
          activeTriggerId: null,
          activeTriggerElement: null
        });
      }
    });
  }, [i, n, u, a]);
}
function cu(n, o, a) {
  const {
    mounted: i,
    setMounted: u,
    transitionStatus: f
  } = au(n), p = o.useState("preventUnmountingOnClose"), g = n ? !1 : p;
  o.useSyncedValues({
    mounted: i,
    transitionStatus: f,
    preventUnmountingOnClose: g
  });
  const m = ze(() => {
    u(!1), o.update({
      activeTriggerId: null,
      activeTriggerElement: null,
      mounted: !1,
      preventUnmountingOnClose: !1
    }), a?.(), o.context.onOpenChangeComplete?.(!1);
  });
  return no({
    enabled: i && !n && !g,
    open: n,
    ref: o.context.popupRef,
    onComplete() {
      n || m();
    }
  }), {
    forceUnmount: m,
    transitionStatus: f
  };
}
function uu(n, o) {
  n.useSyncedValues(o), we(() => () => {
    n.update({
      activeTriggerProps: mt,
      inactiveTriggerProps: mt,
      popupProps: mt
    });
  }, [n]);
}
function gx(n, o) {
  we(() => {
    !o && n.state.openMethod !== null && n.set("openMethod", null);
  }, [o, n]), we(() => () => {
    n.state.openMethod !== null && n.set("openMethod", null);
  }, [n]);
}
class da {
  constructor() {
    this.elementsSet = /* @__PURE__ */ new Set(), this.idMap = /* @__PURE__ */ new Map();
  }
  /**
   * Adds a trigger element with the given ID.
   *
   * Note: The provided element is assumed to not be registered under multiple IDs.
   */
  add(o, a) {
    const i = this.idMap.get(o);
    i !== a && (i !== void 0 && this.elementsSet.delete(i), this.elementsSet.add(a), this.idMap.set(o, a));
  }
  /**
   * Removes the trigger element with the given ID.
   */
  delete(o) {
    const a = this.idMap.get(o);
    a && (this.elementsSet.delete(a), this.idMap.delete(o));
  }
  /**
   * Whether the given element is registered as a trigger.
   */
  hasElement(o) {
    return this.elementsSet.has(o);
  }
  /**
   * Whether there is a registered trigger element matching the given predicate.
   */
  hasMatchingElement(o) {
    for (const a of this.elementsSet)
      if (o(a))
        return !0;
    return !1;
  }
  /**
   * Returns the trigger element associated with the given ID, or undefined if no such element exists.
   */
  getById(o) {
    return this.idMap.get(o);
  }
  /**
   * Returns an iterable of all registered trigger entries, where each entry is a tuple of [id, element].
   */
  entries() {
    return this.idMap.entries();
  }
  /**
   * Returns an iterable of all registered trigger elements.
   */
  elements() {
    return this.elementsSet.values();
  }
  /**
   * Returns the number of registered trigger elements.
   */
  get size() {
    return this.idMap.size;
  }
}
function EO() {
  return new ru({
    open: !1,
    transitionStatus: void 0,
    floatingElement: null,
    referenceElement: null,
    triggerElements: new da(),
    floatingId: void 0,
    syncOnly: !1,
    nested: !1,
    onOpenChange: void 0
  });
}
function fu() {
  return {
    open: !1,
    openProp: void 0,
    mounted: !1,
    transitionStatus: void 0,
    floatingRootContext: EO(),
    floatingId: void 0,
    triggerCount: 0,
    preventUnmountingOnClose: !1,
    payload: void 0,
    activeTriggerId: null,
    activeTriggerElement: null,
    triggerIdProp: void 0,
    popupElement: null,
    positionerElement: null,
    activeTriggerProps: mt,
    inactiveTriggerProps: mt,
    popupProps: mt
  };
}
function ag(n, o, a = !1) {
  return new ru({
    open: !1,
    transitionStatus: void 0,
    floatingElement: null,
    referenceElement: null,
    triggerElements: n,
    floatingId: o,
    syncOnly: !0,
    nested: a,
    onOpenChange: void 0
  });
}
const hi = me((n) => n.triggerIdProp ?? n.activeTriggerId), ig = me((n) => n.openProp ?? n.open), pb = me((n) => (n.popupElement?.id ?? n.floatingId) || void 0);
function mx(n, o) {
  return o !== void 0 && ig(n) && hi(n) === o;
}
function TO(n, o) {
  return mx(n, o) ? !0 : o !== void 0 && ig(n) && hi(n) == null && n.triggerCount === 1;
}
const du = {
  open: ig,
  mounted: me((n) => n.mounted),
  transitionStatus: me((n) => n.transitionStatus),
  floatingRootContext: me((n) => n.floatingRootContext),
  triggerCount: me((n) => n.triggerCount),
  preventUnmountingOnClose: me((n) => n.preventUnmountingOnClose),
  payload: me((n) => n.payload),
  activeTriggerId: hi,
  activeTriggerElement: me((n) => n.mounted ? n.activeTriggerElement : null),
  popupId: pb,
  /**
   * Whether the trigger with the given ID was used to open the popup.
   */
  isTriggerActive: me((n, o) => o !== void 0 && hi(n) === o),
  /**
   * Whether the popup is open and was activated by a trigger with the given ID.
   */
  isOpenedByTrigger: me((n, o) => mx(n, o)),
  /**
   * Whether the popup is mounted and was activated by a trigger with the given ID.
   */
  isMountedByTrigger: me((n, o) => o !== void 0 && hi(n) === o && n.mounted),
  triggerProps: me((n, o) => o ? n.activeTriggerProps : n.inactiveTriggerProps),
  /**
   * Popup id for the trigger that currently owns the open popup.
   */
  triggerPopupId: me((n, o) => TO(n, o) ? pb(n) : void 0),
  popupProps: me((n) => n.popupProps),
  popupElement: me((n) => n.popupElement),
  positionerElement: me((n) => n.positionerElement)
};
function hx(n) {
  const {
    open: o = !1,
    onOpenChange: a,
    elements: i = {}
  } = n, u = cr(), f = to() != null, p = xn(() => new ru({
    open: o,
    transitionStatus: void 0,
    onOpenChange: a,
    referenceElement: i.reference ?? null,
    floatingElement: i.floating ?? null,
    triggerElements: new da(),
    floatingId: u,
    syncOnly: !1,
    nested: f
  })).current;
  return we(() => {
    const g = {
      open: o,
      floatingId: u
    };
    i.reference !== void 0 && (g.referenceElement = i.reference, g.domReferenceElement = We(i.reference) ? i.reference : null), i.floating !== void 0 && (g.floatingElement = i.floating), p.update(g);
  }, [o, u, i.reference, i.floating, p]), p.context.onOpenChange = a, p.context.nested = f, p;
}
function RO(n = {}) {
  const {
    nodeId: o,
    externalTree: a
  } = n, i = hx(n), u = n.rootContext || i, f = u.useState("referenceElement"), p = u.useState("floatingElement"), g = u.useState("domReferenceElement"), m = u.useState("open"), d = u.useState("floatingId"), [v, x] = h.useState(null), [S, C] = h.useState(void 0), [E, M] = h.useState(void 0), T = h.useRef(null), z = _o(a), w = h.useMemo(() => ({
    reference: f,
    floating: p,
    domReference: g
  }), [f, p, g]), N = eO({
    ...n,
    elements: {
      ...w,
      ...v && {
        reference: v
      }
    }
  }), A = We(S) ? S : null, L = E === void 0 ? u.state.floatingElement : E;
  u.useSyncedValue("referenceElement", S ?? null), u.useSyncedValue("domReferenceElement", S === void 0 ? g : A), u.useSyncedValue("floatingElement", L);
  const D = h.useCallback((F) => {
    const Q = We(F) ? {
      getBoundingClientRect: () => F.getBoundingClientRect(),
      getClientRects: () => F.getClientRects(),
      contextElement: F
    } : F;
    x(Q), N.refs.setReference(Q);
  }, [N.refs]), _ = h.useCallback((F) => {
    (We(F) || F === null) && (T.current = F, C(F)), (We(N.refs.reference.current) || N.refs.reference.current === null || // Don't allow setting virtual elements using the old technique back to
    // `null` to support `positionReference` + an unstable `reference`
    // callback ref.
    F !== null && !We(F)) && N.refs.setReference(F);
  }, [N.refs, C]), j = h.useCallback((F) => {
    M(F), N.refs.setFloating(F);
  }, [N.refs]), V = h.useMemo(() => ({
    ...N.refs,
    setReference: _,
    setFloating: j,
    setPositionReference: D,
    domReference: T
  }), [N.refs, _, j, D]), G = h.useMemo(() => ({
    ...N.elements,
    domReference: g
  }), [N.elements, g]), ne = h.useMemo(() => ({
    ...N,
    dataRef: u.context.dataRef,
    open: m,
    onOpenChange: u.setOpen,
    events: u.context.events,
    floatingId: d,
    refs: V,
    elements: G,
    nodeId: o,
    rootStore: u
  }), [N, V, G, o, u, m, d]);
  return we(() => {
    g && (T.current = g);
  }, [g]), we(() => {
    u.context.dataRef.current.floatingContext = ne;
    const F = z?.nodesRef.current.find((Q) => Q.id === o);
    F && (F.context = ne);
  }), h.useMemo(() => ({
    ...N,
    context: ne,
    refs: V,
    elements: G,
    rootStore: u
  }), [N, V, G, ne, u]);
}
const Jd = Lp && Do;
function yx(n, o = {}) {
  const {
    enabled: a = !0,
    delay: i
  } = o, u = "rootStore" in n ? n.rootStore : n, {
    events: f,
    dataRef: p
  } = u.context, g = h.useRef(!1), m = h.useRef(null), d = h.useRef(!0), v = sn();
  h.useEffect(() => {
    const S = u.select("domReferenceElement");
    if (!a)
      return;
    const C = At(S);
    function E() {
      const z = u.select("domReferenceElement");
      !u.select("open") && Rt(z) && z === bn(nt(z)) && (g.current = !0);
    }
    function M() {
      d.current = !0;
    }
    function T() {
      d.current = !1;
    }
    return ml(Je(C, "blur", E), Jd && Je(C, "keydown", M, !0), Jd && Je(C, "pointerdown", T, !0));
  }, [u, a]), h.useEffect(() => {
    if (!a)
      return;
    function S(C) {
      if (C.reason === Zl || C.reason === Ci) {
        const E = u.select("domReferenceElement");
        We(E) && (m.current = E, g.current = !0);
      }
    }
    return f.on("openchange", S), () => {
      f.off("openchange", S);
    };
  }, [f, a, u]);
  const x = h.useMemo(() => {
    function S() {
      g.current = !1, m.current = null;
    }
    return {
      onMouseLeave() {
        S();
      },
      onFocus(C) {
        const E = C.currentTarget;
        if (g.current) {
          if (m.current === E)
            return;
          S();
        }
        const M = gn(C.nativeEvent);
        if (We(M)) {
          if (Jd && !C.relatedTarget) {
            if (!d.current && !Qc(M))
              return;
          } else if (!dR(M))
            return;
        }
        const T = Oc(C.relatedTarget, u.context.triggerElements), {
          nativeEvent: z,
          currentTarget: w
        } = C, N = typeof i == "function" ? i() : i;
        if (u.select("open") && T || N === 0 || N === void 0) {
          u.setOpen(!0, Pe(ta, z, w));
          return;
        }
        v.start(N, () => {
          g.current || u.setOpen(!0, Pe(ta, z, w));
        });
      },
      onBlur(C) {
        S();
        const E = C.relatedTarget, M = C.nativeEvent, T = We(E) && E.hasAttribute(Si("focus-guard")) && E.getAttribute("data-type") === "outside";
        v.start(0, () => {
          const z = u.select("domReferenceElement"), w = bn(nt(z));
          !E && w === z || Ue(p.current.floatingContext?.refs.floating.current, w) || Ue(z, w) || T || Oc(E ?? w, u.context.triggerElements) || u.setOpen(!1, Pe(ta, M));
        });
      }
    };
  }, [p, i, u, v]);
  return h.useMemo(() => a ? {
    reference: x,
    trigger: x
  } : {}, [a, x]);
}
class sg {
  constructor() {
    this.pointerType = void 0, this.interactedInside = !1, this.handler = void 0, this.blockMouseMove = !0, this.performedPointerEventsMutation = !1, this.pointerEventsScopeElement = null, this.pointerEventsReferenceElement = null, this.pointerEventsFloatingElement = null, this.restTimeoutPending = !1, this.openChangeTimeout = new tl(), this.restTimeout = new tl(), this.handleCloseOptions = void 0;
  }
  static create() {
    return new sg();
  }
  dispose = () => {
    this.openChangeTimeout.clear(), this.restTimeout.clear();
  };
  disposeEffect = () => this.dispose;
}
const _c = /* @__PURE__ */ new WeakMap();
function Hc(n) {
  if (!n.performedPointerEventsMutation)
    return;
  const o = n.pointerEventsScopeElement;
  o && _c.get(o) === n && (n.pointerEventsScopeElement?.style.removeProperty("pointer-events"), n.pointerEventsReferenceElement?.style.removeProperty("pointer-events"), n.pointerEventsFloatingElement?.style.removeProperty("pointer-events"), _c.delete(o)), n.performedPointerEventsMutation = !1, n.pointerEventsScopeElement = null, n.pointerEventsReferenceElement = null, n.pointerEventsFloatingElement = null;
}
function vx(n, o) {
  const {
    scopeElement: a,
    referenceElement: i,
    floatingElement: u
  } = o, f = _c.get(a);
  f && f !== n && Hc(f), Hc(n), n.performedPointerEventsMutation = !0, n.pointerEventsScopeElement = a, n.pointerEventsReferenceElement = i, n.pointerEventsFloatingElement = u, _c.set(a, n), a.style.pointerEvents = "none", i.style.pointerEvents = "auto", u.style.pointerEvents = "auto";
}
function cg(n) {
  const o = n.context.dataRef.current, a = xn(() => o.hoverInteractionState ?? sg.create()).current;
  return o.hoverInteractionState || (o.hoverInteractionState = a), Xp(o.hoverInteractionState.disposeEffect), o.hoverInteractionState;
}
function ug(n, o = {}) {
  const {
    enabled: a = !0,
    closeDelay: i = 0,
    nodeId: u
  } = o, f = "rootStore" in n ? n.rootStore : n, p = f.useState("open"), g = f.useState("floatingElement"), m = f.useState("domReferenceElement"), {
    dataRef: d
  } = f.context, v = _o(), x = to(), S = cg(f), C = sn(), E = ze(() => H0(d.current.openEvent?.type, S.interactedInside)), M = ze(() => tC(d.current.openEvent?.type)), T = ze(() => {
    Hc(S);
  });
  we(() => {
    p || (S.pointerType = void 0, S.restTimeoutPending = !1, S.interactedInside = !1, T());
  }, [p, S, T]), h.useEffect(() => T, [T]), we(() => {
    if (a && p && S.handleCloseOptions?.blockPointerEvents && M() && We(m) && g) {
      const z = m, w = g, N = nt(g), A = v?.nodesRef.current.find((j) => j.id === x)?.context?.elements.floating;
      A && (A.style.pointerEvents = "");
      const L = S.pointerEventsScopeElement !== w ? S.pointerEventsScopeElement : null, D = A !== w ? A : null, _ = S.handleCloseOptions?.getScope?.() ?? L ?? D ?? z.closest("[data-rootownerid]") ?? N.body;
      return vx(S, {
        scopeElement: _,
        referenceElement: z,
        floatingElement: w
      }), () => {
        T();
      };
    }
  }, [a, p, m, g, S, M, v, x, T]), h.useEffect(() => {
    if (!a)
      return;
    function z() {
      return !!(v && x && zo(v.nodesRef.current, x).length > 0);
    }
    function w(j) {
      const V = sa(i, "close", S.pointerType), G = () => {
        f.setOpen(!1, Pe(Pt, j)), v?.events.emit("floating.closed", j);
      };
      V ? S.openChangeTimeout.start(V, G) : (S.openChangeTimeout.clear(), G());
    }
    function N(j) {
      const V = gn(j);
      if (!fR(V)) {
        S.interactedInside = !1;
        return;
      }
      S.interactedInside = V?.closest("[aria-haspopup]") != null;
    }
    function A() {
      S.openChangeTimeout.clear(), C.clear(), v?.events.off("floating.closed", D), T();
    }
    function L(j) {
      if (z() && v) {
        v.events.on("floating.closed", D);
        return;
      }
      if (Oc(j.relatedTarget, f.context.triggerElements))
        return;
      const V = d.current.floatingContext?.nodeId ?? u, G = j.relatedTarget;
      if (!(v && V && We(G) && zo(v.nodesRef.current, V, !1).some((F) => Ue(F.context?.elements.floating, G)))) {
        if (S.handler) {
          S.handler(j);
          return;
        }
        T(), M() && !E() && w(j);
      }
    }
    function D(j) {
      !v || !x || z() || C.start(0, () => {
        v.events.off("floating.closed", D), f.setOpen(!1, Pe(Pt, j)), v.events.emit("floating.closed", j);
      });
    }
    const _ = g;
    return ml(_ && Je(_, "mouseenter", A), _ && Je(_, "mouseleave", L), _ && Je(_, "pointerdown", N, !0), () => {
      v?.events.off("floating.closed", D);
    });
  }, [a, g, f, d, i, u, M, E, T, S, v, x, C]);
}
const CO = {
  current: null
};
function pu(n, o = {}) {
  const {
    enabled: a = !0,
    delay: i = 0,
    handleClose: u = null,
    mouseOnly: f = !1,
    restMs: p = 0,
    move: g = !0,
    triggerElementRef: m = CO,
    externalTree: d,
    isActiveTrigger: v = !0,
    getHandleCloseContext: x,
    isClosing: S,
    shouldOpen: C
  } = o, E = "rootStore" in n ? n.rootStore : n, {
    dataRef: M,
    events: T
  } = E.context, z = _o(d), w = cg(E), N = h.useRef(!1), A = Yt(u), L = Yt(i), D = Yt(p), _ = Yt(a), j = Yt(C), V = Yt(S), G = ze(() => H0(M.current.openEvent?.type, w.interactedInside)), ne = ze(() => j.current?.() !== !1), F = ze((q, k, P) => {
    const I = E.context.triggerElements;
    if (I.hasElement(k))
      return !q || !Ue(q, k);
    if (!We(P))
      return !1;
    const X = P;
    return I.hasMatchingElement((B) => Ue(B, X)) && (!q || !Ue(q, X));
  }), Q = ze(() => {
    if (!w.handler)
      return;
    nt(E.select("domReferenceElement")).removeEventListener("mousemove", w.handler), w.handler = void 0;
  }), Z = ze(() => {
    Hc(w);
  });
  return v && (w.handleCloseOptions = A.current?.__options), h.useEffect(() => Q, [Q]), h.useEffect(() => {
    if (!a)
      return;
    function q(k) {
      k.open ? N.current = !1 : (N.current = k.reason === Pt, Q(), w.openChangeTimeout.clear(), w.restTimeout.clear(), w.blockMouseMove = !0, w.restTimeoutPending = !1);
    }
    return T.on("openchange", q), () => {
      T.off("openchange", q);
    };
  }, [a, T, w, Q]), h.useEffect(() => {
    if (!a)
      return;
    function q(X, B = !0) {
      const O = sa(L.current, "close", w.pointerType);
      O ? w.openChangeTimeout.start(O, () => {
        E.setOpen(!1, Pe(Pt, X)), z?.events.emit("floating.closed", X);
      }) : B && (w.openChangeTimeout.clear(), E.setOpen(!1, Pe(Pt, X)), z?.events.emit("floating.closed", X));
    }
    const k = m.current ?? (v ? E.select("domReferenceElement") : null);
    if (!We(k))
      return;
    function P(X) {
      if (w.openChangeTimeout.clear(), w.blockMouseMove = !1, f && !ur(w.pointerType))
        return;
      const B = Yv(D.current), O = sa(L.current, "open", w.pointerType), H = gn(X), ee = X.currentTarget ?? null, J = E.select("domReferenceElement");
      let le = ee;
      if (We(H) && !E.context.triggerElements.hasElement(H)) {
        for (const ye of E.context.triggerElements.elements())
          if (Ue(ye, H)) {
            le = ye;
            break;
          }
      }
      We(ee) && We(J) && !E.context.triggerElements.hasElement(ee) && Ue(ee, J) && (le = J);
      const ie = le == null ? !1 : F(J, le, H), re = E.select("open"), se = V.current?.() ?? E.select("transitionStatus") === "ending", ge = !re && se && N.current, De = !ie && We(le) && We(J) && Ue(J, le) && ge, Ee = B > 0 && !O, ue = ie && (re || ge) || De, he = !re || ie;
      if (ue) {
        ne() && E.setOpen(!0, Pe(Pt, X, le));
        return;
      }
      Ee || (O ? w.openChangeTimeout.start(O, () => {
        he && ne() && E.setOpen(!0, Pe(Pt, X, le));
      }) : he && ne() && E.setOpen(!0, Pe(Pt, X, le)));
    }
    function I(X) {
      if (G()) {
        Z();
        return;
      }
      Q();
      const B = E.select("domReferenceElement"), O = nt(B);
      w.restTimeout.clear(), w.restTimeoutPending = !1;
      const H = M.current.floatingContext ?? x?.();
      if (Oc(X.relatedTarget, E.context.triggerElements))
        return;
      if (A.current && H) {
        E.select("open") || w.openChangeTimeout.clear();
        const J = m.current;
        w.handler = A.current({
          ...H,
          tree: z,
          x: X.clientX,
          y: X.clientY,
          onClose() {
            Z(), Q(), _.current && !G() && J === E.select("domReferenceElement") && q(X, !0);
          }
        }), O.addEventListener("mousemove", w.handler), w.handler(X);
        return;
      }
      (w.pointerType !== "touch" || !Ue(E.select("floatingElement"), X.relatedTarget)) && q(X);
    }
    return g ? ml(Je(k, "mousemove", P, {
      once: !0
    }), Je(k, "mouseenter", P), Je(k, "mouseleave", I)) : ml(Je(k, "mouseenter", P), Je(k, "mouseleave", I));
  }, [Q, Z, M, L, E, a, A, w, v, F, G, f, g, D, m, z, _, x, V, ne]), h.useMemo(() => {
    if (!a)
      return;
    function q(k) {
      w.pointerType = k.pointerType;
    }
    return {
      onPointerDown: q,
      onPointerEnter: q,
      onMouseMove(k) {
        const {
          nativeEvent: P
        } = k, I = k.currentTarget, X = E.select("domReferenceElement"), B = E.select("open"), O = F(X, I, k.target);
        if (f && !ur(w.pointerType))
          return;
        if (B && O && w.handleCloseOptions?.blockPointerEvents) {
          const J = E.select("floatingElement");
          if (J) {
            const le = w.handleCloseOptions?.getScope?.() ?? I.ownerDocument.body;
            vx(w, {
              scopeElement: le,
              referenceElement: I,
              floatingElement: J
            });
          }
        }
        const H = Yv(D.current);
        if (B && !O || H === 0 || !O && w.restTimeoutPending && k.movementX ** 2 + k.movementY ** 2 < 2)
          return;
        w.restTimeout.clear();
        function ee() {
          if (w.restTimeoutPending = !1, G())
            return;
          const J = E.select("open");
          !w.blockMouseMove && (!J || O) && ne() && E.setOpen(!0, Pe(Pt, P, I));
        }
        w.pointerType === "touch" ? hl.flushSync(() => {
          ee();
        }) : O && B ? ee() : (w.restTimeoutPending = !0, w.restTimeout.start(H, ee));
      }
    };
  }, [a, w, G, F, f, E, D, ne]);
}
const OO = "Escape";
function gu(n, o, a) {
  switch (n) {
    case "vertical":
      return o;
    case "horizontal":
      return a;
    default:
      return o || a;
  }
}
function ec(n, o) {
  return gu(o, n === b0 || n === Bp, n === Fc || n === Kc);
}
function Wd(n, o, a) {
  return gu(o, n === Bp, a ? n === Fc : n === Kc) || n === "Enter" || n === " " || n === "";
}
function MO(n, o, a) {
  return gu(o, a ? n === Fc : n === Kc, n === Bp);
}
function AO(n, o, a, i) {
  const u = a ? n === Kc : n === Fc, f = n === b0;
  return o === "both" || o === "horizontal" && i ? n === OO : gu(o, u, f);
}
function bx(n, o) {
  const {
    listRef: a,
    activeIndex: i,
    onNavigate: u = () => {
    },
    enabled: f = !0,
    selectedIndex: p = null,
    allowEscape: g = !1,
    loopFocus: m = !1,
    nested: d = !1,
    rtl: v = !1,
    virtual: x = !1,
    focusItemOnOpen: S = "auto",
    focusItemOnHover: C = !0,
    openOnArrowKeyDown: E = !0,
    disabledIndices: M = void 0,
    orientation: T = "vertical",
    parentOrientation: z,
    id: w,
    resetOnPointerLeave: N = !0,
    externalTree: A,
    grid: L
  } = o, D = L != null, _ = "rootStore" in n ? n.rootStore : n, j = _.useState("open"), V = _.useState("floatingElement"), G = _.useState("domReferenceElement"), ne = _.context.dataRef, F = Mc(V), Q = cp(G), Z = Yt(F), q = to(), k = _o(A), P = h.useRef(S), I = h.useRef(p ?? -1), X = h.useRef(null), B = h.useRef(!0), O = ze((ae) => {
    u(I.current === -1 ? null : I.current, ae);
  }), H = h.useRef(!!V), ee = h.useRef(j), J = h.useRef(!1), le = h.useRef(!1), ie = h.useRef(null), re = Yt(M), se = Yt(j), ge = Yt(p), De = Yt(N), Ee = ca(), ue = ca(), he = ze(() => {
    function ae(xe) {
      x ? k?.events.emit("virtualfocus", xe) : ie.current = mc(xe, {
        sync: J.current,
        preventScroll: !0
      });
    }
    const pe = a.current[I.current], Le = le.current;
    pe && ae(pe), (J.current ? (xe) => xe() : (xe) => Ee.request(xe))(() => {
      const xe = a.current[I.current] || pe;
      if (!xe)
        return;
      pe || ae(xe), // eslint-disable-next-line @typescript-eslint/no-use-before-define
      ve && (Le || !B.current) && xe.scrollIntoView?.({
        block: "nearest",
        inline: "nearest"
      });
    });
  });
  we(() => {
    ne.current.orientation = T;
  }, [ne, T]), we(() => {
    f && (j && V ? (I.current = p ?? -1, P.current && p != null && (le.current = !0, O())) : H.current && (I.current = -1, O()));
  }, [f, j, V, p, O]), we(() => {
    if (f) {
      if (!j) {
        J.current = !1;
        return;
      }
      if (V)
        if (i == null) {
          if (J.current = !1, ge.current != null)
            return;
          if (H.current && (I.current = -1, he()), (!ee.current || !H.current) && P.current && (X.current != null || P.current === !0 && X.current == null)) {
            let ae = 0;
            const pe = () => {
              a.current[0] == null ? (ae < 2 && (ae ? (be) => ue.request(be) : queueMicrotask)(pe), ae += 1) : (I.current = X.current == null || Wd(X.current, T, v) || d ? gc(a) : fp(a), X.current = null, O());
            };
            pe();
          }
        } else pi(a.current, i) || (I.current = i, he(), le.current = !1);
    }
  }, [f, j, V, i, ge, d, a, T, v, O, he, ue]), we(() => {
    if (!f || V || !k || x || !H.current)
      return;
    const ae = k.nodesRef.current, pe = ae.find((xe) => xe.id === q)?.context?.elements.floating, Le = bn(nt(G ?? pe ?? null)), be = ae.some((xe) => xe.context && Ue(xe.context.elements.floating, Le));
    pe && !be && B.current && pe.focus({
      preventScroll: !0
    });
  }, [f, V, G, k, q, x]), we(() => {
    ee.current = j, H.current = !!V;
  }), we(() => {
    j || (X.current = null, P.current = S);
  }, [j, S]);
  const ye = i != null, je = ze((ae) => {
    if (!se.current)
      return;
    const pe = a.current.indexOf(ae.currentTarget);
    pe !== -1 && (I.current !== pe || i !== pe) && (I.current = pe, O(ae));
  }), ke = ze(() => z ?? k?.nodesRef.current.find((ae) => ae.id === q)?.context?.dataRef?.current.orientation), Te = ze(() => gc(a, re.current)), Ce = ze((ae) => {
    if (B.current = !1, J.current = !0, ae.which === 229 || !se.current && ae.currentTarget === Z.current)
      return;
    if (d && AO(ae.key, T, v, D)) {
      ec(ae.key, ke()) || pl(ae), _.setOpen(!1, Pe(ap, ae.nativeEvent)), Rt(G) && (x ? k?.events.emit("virtualfocus", G) : G.focus());
      return;
    }
    const pe = I.current, Le = gc(a, M), be = fp(a, M);
    if (Q || (ae.key === "Home" && (pl(ae), I.current = Le, O(ae)), ae.key === "End" && (pl(ae), I.current = be, O(ae))), L != null) {
      const xe = L(ae, I.current, a, T, m, v, M, Le, be);
      if (xe != null && (I.current = xe, O(ae)), T === "both")
        return;
    }
    if (ec(ae.key, T)) {
      if (pl(ae), j && !x && bn(ae.currentTarget.ownerDocument) === ae.currentTarget) {
        I.current = Wd(ae.key, T, v) ? Le : be, O(ae);
        return;
      }
      Wd(ae.key, T, v) ? m ? pe >= be ? g && pe !== a.current.length ? I.current = -1 : (J.current = !1, I.current = Le) : I.current = Yl(a.current, {
        startingIndex: pe,
        disabledIndices: M
      }) : I.current = Math.min(be, Yl(a.current, {
        startingIndex: pe,
        disabledIndices: M
      })) : m ? pe <= Le ? g && pe !== -1 ? I.current = a.current.length : (J.current = !1, I.current = be) : I.current = Yl(a.current, {
        startingIndex: pe,
        decrement: !0,
        disabledIndices: M
      }) : I.current = Math.max(Le, Yl(a.current, {
        startingIndex: pe,
        decrement: !0,
        disabledIndices: M
      })), pi(a.current, I.current) && (I.current = -1), O(ae);
    }
  }), ve = h.useMemo(() => ({
    onFocus(pe) {
      J.current = !0, je(pe);
    },
    onClick: ({
      currentTarget: pe
    }) => pe.focus({
      preventScroll: !0
    }),
    // Safari
    onMouseMove(pe) {
      J.current = !0, le.current = !1, C && je(pe);
    },
    onPointerLeave(pe) {
      if (!se.current || !B.current || pe.pointerType === "touch")
        return;
      J.current = !0;
      const Le = pe.relatedTarget;
      if (!(!C || a.current.includes(Le)) && De.current && (ie.current?.(), ie.current = null, I.current = -1, O(pe), !x)) {
        const be = Z.current, xe = bn(nt(be));
        be && Ue(be, xe) && be.focus({
          preventScroll: !0
        });
      }
    }
  }), [je, se, Z, C, a, O, De, x]), Se = h.useMemo(() => x && j && ye && {
    "aria-activedescendant": `${w}-${i}`
  }, [x, j, ye, w, i]), Re = h.useMemo(() => ({
    "aria-orientation": T === "both" ? void 0 : T,
    ...Q ? {} : Se,
    onKeyDown(ae) {
      if (ae.key === "Tab" && ae.shiftKey && j && !x) {
        const pe = gn(ae.nativeEvent);
        if (pe && !Ue(Z.current, pe))
          return;
        pl(ae), _.setOpen(!1, Pe(Ao, ae.nativeEvent)), Rt(G) && G.focus();
        return;
      }
      Ce(ae);
    },
    onPointerMove() {
      B.current = !0;
    }
  }), [Se, Ce, Z, T, Q, _, j, x, G]), Oe = h.useMemo(() => {
    function ae(be) {
      _.setOpen(!0, Pe(ap, be.nativeEvent, be.currentTarget));
    }
    function pe(be) {
      S === "auto" && Ip(be.nativeEvent) && (P.current = !x);
    }
    function Le(be) {
      P.current = S, S === "auto" && x0(be.nativeEvent) && (P.current = !0);
    }
    return {
      onKeyDown(be) {
        const xe = _.select("open");
        B.current = !1;
        const et = be.key.startsWith("Arrow"), rt = MO(be.key, ke(), v), pt = ec(be.key, T), Nt = (d ? rt : pt) || be.key === "Enter" || be.key.trim() === "";
        if (x && xe)
          return Ce(be);
        if (!(!xe && !E && et)) {
          if (Nt) {
            const tt = ec(be.key, ke());
            X.current = d && tt ? null : be.key;
          }
          if (d) {
            rt && (pl(be), xe ? (I.current = Te(), O(be)) : ae(be));
            return;
          }
          pt && (ge.current != null && (I.current = ge.current), pl(be), !xe && E ? ae(be) : Ce(be), xe && O(be));
        }
      },
      onFocus(be) {
        _.select("open") && !x && (I.current = -1, O(be));
      },
      onPointerDown: Le,
      onPointerEnter: Le,
      onMouseDown: pe,
      onClick: pe
    };
  }, [Ce, S, Te, d, O, _, E, T, ke, v, ge, x]), He = h.useMemo(() => ({
    ...Se,
    ...Oe
  }), [Se, Oe]);
  return h.useMemo(() => f ? {
    reference: He,
    floating: Re,
    item: ve,
    trigger: Oe
  } : {}, [f, He, Re, Oe, ve]);
}
function xx(n, o) {
  const {
    listRef: a,
    elementsRef: i,
    activeIndex: u,
    onMatch: f,
    disabledIndices: p,
    onTyping: g,
    enabled: m = !0,
    resetMs: d = 750,
    selectedIndex: v = null
  } = o, x = "rootStore" in n ? n.rootStore : n, S = x.useState("open"), C = sn(), E = h.useRef(""), M = h.useRef(v ?? u ?? -1), T = h.useRef(null), z = ze((A) => {
    function L(Z) {
      const q = i?.current[Z];
      return !q || Zc(q);
    }
    function D(Z) {
      return L(Z) ? p == null || !Nc(Ql, Z, p) : !1;
    }
    function _(Z, q, k = 0) {
      if (Z.length === 0)
        return -1;
      const P = (k % Z.length + Z.length) % Z.length, I = q.toLowerCase();
      for (let X = 0; X < Z.length; X += 1) {
        const B = (P + X) % Z.length;
        if (!(!Z[B]?.toLowerCase().startsWith(I) || !D(B)))
          return B;
      }
      return -1;
    }
    const j = a.current;
    if (E.current.length > 0 && A.key === " " && (pl(A), g?.(!0)), E.current.length > 0 && E.current[0] !== " " && _(j, E.current) === -1 && A.key !== " " && g?.(!1), j == null || // Character key.
    A.key.length !== 1 || // Modifier key.
    A.ctrlKey || A.metaKey || A.altKey)
      return;
    S && A.key !== " " && (pl(A), g?.(!0));
    const V = E.current === "";
    V && (M.current = v ?? u ?? -1), j.every((Z, q) => Z && D(q) ? Z[0]?.toLowerCase() !== Z[1]?.toLowerCase() : !0) && E.current === A.key && (E.current = "", M.current = T.current), E.current += A.key, C.start(d, () => {
      E.current = "", M.current = T.current, g?.(!1);
    });
    const F = ((V ? v ?? u ?? -1 : M.current) ?? 0) + 1, Q = _(j, E.current, F);
    Q !== -1 ? (f?.(Q), T.current = Q) : A.key !== " " && (E.current = "", g?.(!1));
  }), w = ze((A) => {
    const L = A.relatedTarget, D = x.select("domReferenceElement"), _ = x.select("floatingElement");
    Ue(D, L) || Ue(_, L) || (C.clear(), E.current = "", M.current = T.current, g?.(!1));
  });
  we(() => {
    !S && v !== null || (C.clear(), T.current = null, E.current !== "" && (E.current = ""));
  }, [S, v, C]), we(() => {
    S && E.current === "" && (M.current = v ?? u ?? -1);
  }, [S, v, u]);
  const N = h.useMemo(() => ({
    onKeyDown: z,
    onBlur: w
  }), [z, w]);
  return h.useMemo(() => m ? {
    reference: N,
    floating: N
  } : {}, [m, N]);
}
const gb = 0.1, zO = gb * gb, Tt = 0.5;
function tc(n, o, a, i, u, f) {
  return i >= o != f >= o && n <= (u - a) * (o - i) / (f - i) + a;
}
function nc(n, o, a, i, u, f, p, g, m, d) {
  let v = !1;
  return tc(n, o, a, i, u, f) && (v = !v), tc(n, o, u, f, p, g) && (v = !v), tc(n, o, p, g, m, d) && (v = !v), tc(n, o, m, d, a, i) && (v = !v), v;
}
function NO(n, o, a) {
  return n >= a.x && n <= a.x + a.width && o >= a.y && o <= a.y + a.height;
}
function lc(n, o, a, i, u, f) {
  const p = Math.min(a, u), g = Math.max(a, u), m = Math.min(i, f), d = Math.max(i, f);
  return n >= p && n <= g && o >= m && o <= d;
}
function mu(n = {}) {
  const {
    blockPointerEvents: o = !1
  } = n, a = new tl(), i = ({
    x: u,
    y: f,
    placement: p,
    elements: g,
    onClose: m,
    nodeId: d,
    tree: v
  }) => {
    const x = p?.split("-")[0];
    let S = !1, C = null, E = null, M = typeof performance < "u" ? performance.now() : 0;
    function T(w, N) {
      const A = performance.now(), L = A - M;
      if (C === null || E === null || L === 0)
        return C = w, E = N, M = A, !1;
      const D = w - C, _ = N - E, j = D * D + _ * _, V = L * L * zO;
      return C = w, E = N, M = A, j < V;
    }
    function z() {
      a.clear(), m();
    }
    return function(N) {
      a.clear();
      const A = g.domReference, L = g.floating;
      if (!A || !L || x == null || u == null || f == null)
        return;
      const {
        clientX: D,
        clientY: _
      } = N, j = gn(N), V = N.type === "mouseleave", G = Ue(L, j), ne = Ue(A, j);
      if (G && (S = !0, !V))
        return;
      if (ne && (S = !1, !V)) {
        S = !0;
        return;
      }
      if (V && We(N.relatedTarget) && Ue(L, N.relatedTarget))
        return;
      function F() {
        return !!(v && zo(v.nodesRef.current, d).length > 0);
      }
      function Q() {
        F() || z();
      }
      if (F())
        return;
      const Z = A.getBoundingClientRect(), q = L.getBoundingClientRect(), k = u > q.right - q.width / 2, P = f > q.bottom - q.height / 2, I = q.width > Z.width, X = q.height > Z.height, B = (I ? Z : q).left, O = (I ? Z : q).right, H = (X ? Z : q).top, ee = (X ? Z : q).bottom;
      if (x === "top" && f >= Z.bottom - 1 || x === "bottom" && f <= Z.top + 1 || x === "left" && u >= Z.right - 1 || x === "right" && u <= Z.left + 1) {
        Q();
        return;
      }
      let J = !1;
      switch (x) {
        case "top":
          J = lc(D, _, B, Z.top + 1, O, q.bottom - 1);
          break;
        case "bottom":
          J = lc(D, _, B, q.top + 1, O, Z.bottom - 1);
          break;
        case "left":
          J = lc(D, _, q.right - 1, ee, Z.left + 1, H);
          break;
        case "right":
          J = lc(D, _, Z.right - 1, ee, q.left + 1, H);
          break;
      }
      if (J)
        return;
      if (S && !NO(D, _, Z)) {
        Q();
        return;
      }
      if (!V && T(D, _)) {
        Q();
        return;
      }
      let le = !1;
      switch (x) {
        case "top": {
          const ie = I ? Tt / 2 : Tt * 4, re = I || k ? u + ie : u - ie, se = I ? u - ie : k ? u + ie : u - ie, ge = f + Tt + 1, De = k || I ? q.bottom - Tt : q.top, Ee = k ? I ? q.bottom - Tt : q.top : q.bottom - Tt;
          le = nc(D, _, re, ge, se, ge, q.left, De, q.right, Ee);
          break;
        }
        case "bottom": {
          const ie = I ? Tt / 2 : Tt * 4, re = I || k ? u + ie : u - ie, se = I ? u - ie : k ? u + ie : u - ie, ge = f - Tt, De = k || I ? q.top + Tt : q.bottom, Ee = k ? I ? q.top + Tt : q.bottom : q.top + Tt;
          le = nc(D, _, re, ge, se, ge, q.left, De, q.right, Ee);
          break;
        }
        case "left": {
          const ie = X ? Tt / 2 : Tt * 4, re = X || P ? f + ie : f - ie, se = X ? f - ie : P ? f + ie : f - ie, ge = u + Tt + 1, De = P || X ? q.right - Tt : q.left, Ee = P ? X ? q.right - Tt : q.left : q.right - Tt;
          le = nc(D, _, De, q.top, Ee, q.bottom, ge, re, ge, se);
          break;
        }
        case "right": {
          const ie = X ? Tt / 2 : Tt * 4, re = X || P ? f + ie : f - ie, se = X ? f - ie : P ? f + ie : f - ie, ge = u - Tt, De = P || X ? q.left + Tt : q.right, Ee = P ? X ? q.left + Tt : q.right : q.left + Tt;
          le = nc(D, _, ge, re, ge, se, De, q.top, Ee, q.bottom);
          break;
        }
      }
      le ? S || a.start(40, Q) : Q();
    };
  };
  return i.__options = {
    ...n,
    blockPointerEvents: o
  }, i;
}
const wx = /* @__PURE__ */ h.createContext(void 0);
function mr(n) {
  const o = h.useContext(wx);
  if (o === void 0 && !n)
    throw new Error(Ct(47));
  return o;
}
function jO() {
  return {
    ...fu(),
    disabled: !1,
    modal: !1,
    focusManagerModal: !1,
    instantType: void 0,
    openMethod: null,
    openChangeReason: null,
    titleElementId: void 0,
    descriptionElementId: void 0,
    stickIfOpen: !0,
    nested: !1,
    openOnHover: !1,
    closeDelay: 0,
    hasViewport: !1
  };
}
const DO = {
  ...du,
  disabled: me((n) => n.disabled),
  instantType: me((n) => n.instantType),
  openMethod: me((n) => n.openMethod),
  openChangeReason: me((n) => n.openChangeReason),
  modal: me((n) => n.modal),
  focusManagerModal: me((n) => n.focusManagerModal),
  stickIfOpen: me((n) => n.stickIfOpen),
  titleElementId: me((n) => n.titleElementId),
  descriptionElementId: me((n) => n.descriptionElementId),
  openOnHover: me((n) => n.openOnHover),
  closeDelay: me((n) => n.closeDelay),
  hasViewport: me((n) => n.hasViewport)
};
class fg extends zi {
  constructor(o, a, i = !1) {
    const u = {
      ...jO(),
      ...o
    }, f = new da();
    u.open && o?.mounted === void 0 && (u.mounted = !0), u.floatingRootContext = ag(f, a, i), super(u, {
      popupRef: /* @__PURE__ */ h.createRef(),
      backdropRef: /* @__PURE__ */ h.createRef(),
      internalBackdropRef: /* @__PURE__ */ h.createRef(),
      onOpenChange: void 0,
      onOpenChangeComplete: void 0,
      triggerFocusTargetRef: /* @__PURE__ */ h.createRef(),
      beforeContentFocusGuardRef: /* @__PURE__ */ h.createRef(),
      stickIfOpenTimeout: new tl(),
      triggerElements: f
    }, DO);
  }
  setOpen = (o, a) => {
    const i = a.reason === Pt, u = a.reason === Zl && a.event.detail === 0, f = !o && (a.reason === Ci || a.reason == null), p = lg(a), g = this.select("activeTriggerId");
    if (!o && a.reason === m0 && a.trigger == null && g != null && (a.trigger = this.context.triggerElements.getById(g) ?? this.select("activeTriggerElement") ?? void 0), this.context.onOpenChange?.(o, a), a.isCanceled)
      return;
    this.state.floatingRootContext.dispatchOpenChange(o, a);
    const m = () => {
      const d = {
        open: o,
        openChangeReason: a.reason
      };
      iu(d, o, a.trigger, p()), this.update(d);
    };
    i ? (this.set("stickIfOpen", !0), this.context.stickIfOpenTimeout.start(P0, () => {
      this.set("stickIfOpen", !1);
    }), hl.flushSync(m)) : m(), u || f ? this.set("instantType", u ? "click" : "dismiss") : a.reason === Ao ? this.set("instantType", "focus") : this.set("instantType", void 0);
  };
  static useStore(o, a) {
    const {
      store: i,
      internalStore: u
    } = ng(o, (f, p) => new fg(a, f, p));
    return h.useEffect(() => u?.disposeEffect(), [u]), i;
  }
  disposeEffect = () => this.context.stickIfOpenTimeout.disposeEffect();
}
function mb({
  props: n
}) {
  const {
    children: o,
    open: a,
    defaultOpen: i = !1,
    onOpenChange: u,
    onOpenChangeComplete: f,
    modal: p = !1,
    handle: g,
    triggerId: m,
    defaultTriggerId: d = null
  } = n, v = fg.useStore(g?.store, {
    modal: p,
    open: i,
    openProp: a,
    activeTriggerId: d,
    triggerIdProp: m
  });
  og(v, a, i, d), v.useControlledProp("openProp", a), v.useControlledProp("triggerIdProp", m);
  const x = v.useState("open"), S = v.useState("mounted"), C = v.useState("payload"), E = to() != null;
  v.useContextCallback("onOpenChange", u), v.useContextCallback("onOpenChangeComplete", f), gx(v, x), su(v);
  const {
    forceUnmount: M
  } = cu(x, v, () => {
    v.update({
      stickIfOpen: !0,
      openChangeReason: null
    });
  });
  v.useSyncedValues({
    modal: p,
    nested: E
  }), h.useEffect(() => {
    x || v.context.stickIfOpenTimeout.clear();
  }, [v, x]);
  const T = h.useCallback(() => {
    v.setOpen(!1, Pe(Gc));
  }, [v]);
  h.useImperativeHandle(n.actionsRef, () => ({
    unmount: M,
    close: T
  }), [M, T]);
  const z = x || S, w = h.useMemo(() => ({
    store: v
  }), [v]);
  return /* @__PURE__ */ b.jsxs(wx.Provider, {
    value: w,
    children: [z && /* @__PURE__ */ b.jsx(_O, {
      store: v,
      modal: p
    }), typeof o == "function" ? o({
      payload: C
    }) : o]
  });
}
function kO(n) {
  return mr(!0) ? /* @__PURE__ */ b.jsx(mb, {
    props: n
  }) : /* @__PURE__ */ b.jsx(W0, {
    children: /* @__PURE__ */ b.jsx(mb, {
      props: n
    })
  });
}
function _O({
  store: n,
  modal: o
}) {
  const a = n.useState("floatingRootContext"), i = Ai(a, {
    outsidePressEvent: {
      // Ensure `aria-hidden` on outside elements is removed immediately
      // on outside press when trapping focus.
      mouse: o === "trap-focus" ? "sloppy" : "intentional",
      touch: "sloppy"
    }
  }), u = i.reference ?? mt, f = i.trigger ?? mt, p = h.useMemo(() => yn(fa, i.floating), [i.floating]);
  return uu(n, {
    activeTriggerProps: u,
    inactiveTriggerProps: f,
    popupProps: p
  }), null;
}
let ir = (function(n) {
  return n.open = "data-open", n.closed = "data-closed", n[n.startingStyle = Ei.startingStyle] = "startingStyle", n[n.endingStyle = Ei.endingStyle] = "endingStyle", n.anchorHidden = "data-anchor-hidden", n.side = "data-side", n.align = "data-align", n;
})({}), Lc = /* @__PURE__ */ (function(n) {
  return n.popupOpen = "data-popup-open", n.pressed = "data-pressed", n;
})({});
const HO = {
  [Lc.popupOpen]: ""
}, LO = {
  [Lc.popupOpen]: "",
  [Lc.pressed]: ""
}, UO = {
  [ir.open]: ""
}, BO = {
  [ir.closed]: ""
}, IO = {
  [ir.anchorHidden]: ""
}, dg = {
  open(n) {
    return n ? HO : null;
  }
}, Uc = {
  open(n) {
    return n ? LO : null;
  }
}, Lo = {
  open(n) {
    return n ? UO : BO;
  },
  anchorHidden(n) {
    return n ? IO : null;
  }
}, VO = 300;
function Sx(n, o) {
  const a = h.useRef(null);
  function i(f) {
    hl.flushSync(() => {
      n.setOpen(!1, Pe(Ao, f.nativeEvent, f.currentTarget));
    }), NR(a.current)?.focus();
  }
  function u(f) {
    const p = n.select("positionerElement");
    if (p && la(f, p))
      n.context.beforeContentFocusGuardRef.current?.focus();
    else {
      hl.flushSync(() => {
        n.setOpen(!1, Pe(Ao, f.nativeEvent, f.currentTarget));
      });
      let g = zR(n.context.triggerFocusTargetRef.current || o.current);
      for (; g !== null && Ue(p, g); ) {
        const m = g;
        if (g = qp(g), g === m)
          break;
      }
      g?.focus();
    }
  }
  return {
    preFocusGuardRef: a,
    handlePreFocusGuardFocus: i,
    handleFocusTargetFocus: u
  };
}
function PO(n) {
  const o = h.useRef(""), a = h.useCallback((u) => {
    u.defaultPrevented || (o.current = u.pointerType, n(u, u.pointerType));
  }, [n]);
  return {
    onClick: h.useCallback((u) => {
      if (u.detail === 0) {
        n(u, "keyboard");
        return;
      }
      "pointerType" in u ? n(u, u.pointerType) : n(u, o.current), o.current = "";
    }, [n]),
    onPointerDown: a
  };
}
function pg(n, o) {
  const a = h.useRef(n), i = ze(o);
  we(() => {
    a.current !== n && i(a.current);
  }, [n, i]), we(() => {
    a.current = n;
  }, [n]);
}
function Ex(n, o) {
  const a = ze((f, p) => {
    (typeof n == "function" ? n() : n) || o(p || // On iOS Safari, the hitslop around touch targets means tapping outside an element's
    // bounds does not fire `pointerdown` but does fire `mousedown`. The `interactionType`
    // will be "" in that case.
    (Xc ? "touch" : ""));
  }), {
    onClick: i,
    onPointerDown: u
  } = PO(a);
  return h.useMemo(() => ({
    onClick: i,
    onPointerDown: u
  }), [i, u]);
}
function Tx(n) {
  const [o, a] = h.useState(null), i = Ex(n, a);
  return pg(n, (u) => {
    u && !n && a(null);
  }), h.useMemo(() => ({
    openMethod: o,
    triggerProps: i
  }), [o, i]);
}
const YO = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    disabled: p = !1,
    nativeButton: g = !0,
    handle: m,
    payload: d,
    openOnHover: v = !1,
    delay: x = VO,
    closeDelay: S = 0,
    id: C,
    ...E
  } = o, M = mr(!0), T = m?.store ?? M?.store;
  if (!T)
    throw new Error(Ct(74));
  const z = wn(C), w = T.useState("isTriggerActive", z), N = T.useState("floatingRootContext"), A = T.useState("isOpenedByTrigger", z), L = T.useState("triggerPopupId", z), D = h.useRef(null), {
    registerTrigger: _,
    isMountedByThisTrigger: j
  } = rg(z, D, T, {
    payload: d,
    disabled: p,
    openOnHover: v,
    closeDelay: S
  }), V = T.useState("openChangeReason"), G = T.useState("stickIfOpen"), ne = T.useState("openMethod"), F = T.useState("focusManagerModal"), Q = pu(N, {
    enabled: !p && N != null && v && (ne !== "touch" || V !== Zl),
    mouseOnly: !0,
    move: !1,
    handleClose: mu(),
    restMs: x,
    delay: {
      close: S
    },
    triggerElementRef: D,
    isActiveTrigger: w,
    isClosing: () => T.select("transitionStatus") === "ending"
  }), Z = lu(N, {
    enabled: N != null,
    stickIfOpen: G
  }), q = Ex(() => T.select("open"), (le) => {
    T.set("openMethod", le);
  }), k = T.useState("triggerProps", j), {
    getButtonProps: P,
    buttonRef: I
  } = $l({
    disabled: p,
    native: g
  }), X = {
    open(le) {
      return le && V === Zl ? Uc.open(le) : dg.open(le);
    }
  }, {
    preFocusGuardRef: B,
    handlePreFocusGuardFocus: O,
    handleFocusTargetFocus: H
  } = Sx(T, D), J = $e("button", o, {
    state: {
      disabled: p,
      open: A
    },
    ref: [I, a, _, D],
    props: [Z.reference, Q, k, q, {
      [Y0]: "",
      id: z,
      "aria-haspopup": "dialog",
      "aria-expanded": A,
      "aria-controls": L
    }, E, P],
    stateAttributesMapping: X
  });
  return j && !F ? /* @__PURE__ */ b.jsxs(h.Fragment, {
    children: [/* @__PURE__ */ b.jsx(No, {
      ref: B,
      onFocus: O
    }), /* @__PURE__ */ b.jsx(h.Fragment, {
      children: J
    }, z), /* @__PURE__ */ b.jsx(No, {
      ref: T.context.triggerFocusTargetRef,
      onFocus: H
    })]
  }) : /* @__PURE__ */ b.jsx(h.Fragment, {
    children: J
  }, z);
}), Rx = /* @__PURE__ */ h.createContext(void 0);
function GO() {
  const n = h.useContext(Rx);
  if (n === void 0)
    throw new Error(Ct(45));
  return n;
}
const qO = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    keepMounted: i = !1,
    ...u
  } = o, {
    store: f
  } = mr();
  return f.useState("mounted") || i ? /* @__PURE__ */ b.jsx(Rx.Provider, {
    value: i,
    children: /* @__PURE__ */ b.jsx(tu, {
      ref: a,
      ...u
    })
  }) : null;
});
function hu(n) {
  return Dp(19) ? n : n ? "true" : void 0;
}
const Cx = /* @__PURE__ */ h.createContext(void 0);
function XO() {
  const n = h.useContext(Cx);
  if (!n)
    throw new Error(Ct(46));
  return n;
}
const FO = (n) => ({
  name: "arrow",
  options: n,
  async fn(o) {
    const {
      x: a,
      y: i,
      placement: u,
      rects: f,
      platform: p,
      elements: g,
      middlewareData: m
    } = o, {
      element: d,
      padding: v = 0,
      offsetParent: x = "real"
    } = Jl(n, o) || {};
    if (d == null)
      return {};
    const S = S0(v), C = {
      x: a,
      y: i
    }, E = Yp(u), M = Pp(E), T = await p.getDimensions(d), z = E === "y", w = z ? "top" : "left", N = z ? "bottom" : "right", A = z ? "clientHeight" : "clientWidth", L = f.reference[M] + f.reference[E] - C[E] - f.floating[M], D = C[E] - f.reference[E], _ = x === "real" ? await p.getOffsetParent?.(d) : g.floating;
    let j = g.floating[A] || f.floating[M];
    (!j || !await p.isElement?.(_)) && (j = g.floating[A] || f.floating[M]);
    const V = L / 2 - D / 2, G = j / 2 - T[M] / 2 - 1, ne = Math.min(S[w], G), F = Math.min(S[N], G), Q = ne, Z = j - T[M] - F, q = j / 2 - T[M] / 2 + V, k = w0(Q, q, Z), P = !m.arrow && ko(u) != null && q !== k && f.reference[M] / 2 - (q < Q ? ne : F) - T[M] / 2 < 0, I = P ? q < Q ? q - Q : q - Z : 0;
    return {
      [E]: C[E] + I,
      data: {
        [E]: k,
        centerOffset: q - k - I,
        ...P && {
          alignmentOffset: I
        }
      },
      reset: P
    };
  }
}), KO = (n, o) => ({
  ...FO(n),
  options: [n, o]
}), QO = aO().fn, ZO = {
  name: "hide",
  async fn(n) {
    const {
      width: o,
      height: a,
      x: i,
      y: u
    } = n.rects.reference, f = o === 0 && a === 0 && i === 0 && u === 0;
    return {
      data: {
        referenceHidden: (await QO(n)).data?.referenceHidden || f
      }
    };
  }
}, yc = {
  sideX: "left",
  sideY: "top"
}, gg = {
  name: "adaptiveOrigin",
  async fn(n) {
    const {
      x: o,
      y: a,
      rects: {
        floating: i
      },
      elements: {
        floating: u
      },
      platform: f,
      strategy: p,
      placement: g
    } = n, m = At(u), d = m.getComputedStyle(u);
    if (!(d.transitionDuration !== "0s" && d.transitionDuration !== ""))
      return {
        x: o,
        y: a,
        data: yc
      };
    const x = await f.getOffsetParent?.(u);
    let S = {
      width: 0,
      height: 0
    };
    if (p === "fixed" && m?.visualViewport)
      S = {
        width: m.visualViewport.width,
        height: m.visualViewport.height
      };
    else if (x === m) {
      const w = nt(u);
      S = {
        width: w.documentElement.clientWidth,
        height: w.documentElement.clientHeight
      };
    } else await f.isElement?.(x) && (S = await f.getDimensions(x));
    const C = In(g);
    let E = o, M = a;
    C === "left" && (E = S.width - (o + i.width)), C === "top" && (M = S.height - (a + i.height));
    const T = C === "left" ? "right" : yc.sideX, z = C === "top" ? "bottom" : yc.sideY;
    return {
      x: E,
      y: M,
      data: {
        sideX: T,
        sideY: z
      }
    };
  }
};
function Ox(n, o, a) {
  const i = n === "inline-start" || n === "inline-end";
  return {
    top: "top",
    right: i ? a ? "inline-start" : "inline-end" : "right",
    bottom: "bottom",
    left: i ? a ? "inline-end" : "inline-start" : "left"
  }[o];
}
function hb(n, o, a) {
  const {
    rects: i,
    placement: u
  } = n;
  return {
    side: Ox(o, In(u), a),
    align: ko(u) || "center",
    anchor: {
      width: i.reference.width,
      height: i.reference.height
    },
    positioner: {
      width: i.floating.width,
      height: i.floating.height
    }
  };
}
function yu(n) {
  const {
    // Public parameters
    anchor: o,
    positionMethod: a = "absolute",
    side: i = "bottom",
    sideOffset: u = 0,
    align: f = "center",
    alignOffset: p = 0,
    collisionBoundary: g,
    collisionPadding: m = 5,
    sticky: d = !1,
    arrowPadding: v = 5,
    disableAnchorTracking: x = !1,
    inline: S,
    // Private parameters
    keepMounted: C = !1,
    floatingRootContext: E,
    mounted: M,
    collisionAvoidance: T,
    shiftCrossAxis: z = !1,
    nodeId: w,
    adaptiveOrigin: N,
    lazyFlip: A = !1,
    externalTree: L
  } = n, [D, _] = h.useState(null);
  !M && D !== null && _(null);
  const j = T.side || "flip", V = T.align || "flip", G = T.fallbackAxisSide || "end", ne = typeof o == "function" ? o : void 0, F = ze(ne), Q = ne ? F : o, Z = Yt(o), q = Yt(M), P = $c() === "rtl", I = D || {
    top: "top",
    right: "right",
    bottom: "bottom",
    left: "left",
    "inline-end": P ? "left" : "right",
    "inline-start": P ? "right" : "left"
  }[i], X = f === "center" ? I : `${I}-${f}`;
  let B = m;
  const O = 1, H = i === "bottom" ? O : 0, ee = i === "top" ? O : 0, J = i === "right" ? O : 0, le = i === "left" ? O : 0;
  typeof B == "number" ? B = {
    top: B + H,
    right: B + le,
    bottom: B + ee,
    left: B + J
  } : B && (B = {
    top: (B.top || 0) + H,
    right: (B.right || 0) + le,
    bottom: (B.bottom || 0) + ee,
    left: (B.left || 0) + J
  });
  const ie = {
    boundary: g === "clipping-ancestors" ? "clippingAncestors" : g,
    padding: B
  }, re = h.useRef(null), se = Yt(u), ge = Yt(p), De = typeof u != "function" ? u : 0, Ee = typeof p != "function" ? p : 0, ue = [];
  S && ue.push(S), ue.push(tO((Qe) => {
    const ft = hb(Qe, i, P), Ut = typeof se.current == "function" ? se.current(ft) : se.current, _t = typeof ge.current == "function" ? ge.current(ft) : ge.current;
    return {
      mainAxis: Ut,
      crossAxis: _t,
      alignmentAxis: _t
    };
  }, [De, Ee, P, i]));
  const he = V === "none" && j !== "shift", ye = !he && (d || z || j === "shift"), je = j === "none" ? null : oO({
    ...ie,
    // Ensure the popup flips if it's been limited by its --available-height and it resizes.
    // Since the size() padding is smaller than the flip() padding, flip() will take precedence.
    padding: {
      top: B.top + O,
      right: B.right + O,
      bottom: B.bottom + O,
      left: B.left + O
    },
    mainAxis: !z && j === "flip",
    crossAxis: V === "flip" ? "alignment" : !1,
    fallbackAxisSideDirection: G
  }), ke = he ? null : nO((Qe) => {
    const ft = nt(Qe.elements.floating).documentElement;
    return {
      ...ie,
      // Use the Layout Viewport to avoid shifting around when pinch-zooming
      // for context menus.
      rootBoundary: z ? {
        x: 0,
        y: 0,
        width: ft.clientWidth,
        height: ft.clientHeight
      } : void 0,
      mainAxis: V !== "none",
      crossAxis: ye,
      limiter: d || z ? void 0 : lO((Ut) => {
        if (!re.current)
          return {};
        const {
          width: _t,
          height: Ht
        } = re.current.getBoundingClientRect(), jt = el(In(Ut.placement)), Gt = jt === "y" ? _t : Ht, Sn = jt === "y" ? B.left + B.right : B.top + B.bottom;
        return {
          offset: Gt / 2 + Sn / 2
        };
      })
    };
  }, [ie, d, z, B, V]);
  j === "shift" || V === "shift" || f === "center" ? ue.push(ke, je) : ue.push(je, ke), ue.push(rO({
    ...ie,
    apply({
      elements: {
        floating: Qe
      },
      availableWidth: ft,
      availableHeight: Ut,
      rects: _t
    }) {
      if (!q.current)
        return;
      const Ht = Qe.style;
      Ht.setProperty("--available-width", `${ft}px`), Ht.setProperty("--available-height", `${Ut}px`);
      const jt = At(Qe).devicePixelRatio || 1, {
        x: Gt,
        y: Sn,
        width: Nn,
        height: Pn
      } = _t.reference, qt = (Math.round((Gt + Nn) * jt) - Math.round(Gt * jt)) / jt, Yn = (Math.round((Sn + Pn) * jt) - Math.round(Sn * jt)) / jt;
      Ht.setProperty("--anchor-width", `${qt}px`), Ht.setProperty("--anchor-height", `${Yn}px`);
    }
  }), KO((Qe) => ({
    // `transform-origin` calculations rely on an element existing. If the arrow hasn't been set,
    // we'll create a fake element.
    element: re.current || nt(Qe.elements.floating).createElement("div"),
    padding: v,
    offsetParent: "floating"
  }), [v]), {
    name: "transformOrigin",
    fn(Qe) {
      const {
        elements: ft,
        middlewareData: Ut,
        placement: _t,
        rects: Ht,
        y: jt
      } = Qe, Gt = In(_t), Sn = el(Gt), Nn = re.current, Pn = Ut.arrow?.x || 0, qt = Ut.arrow?.y || 0, Yn = Nn?.clientWidth || 0, vl = Nn?.clientHeight || 0, nl = Pn + Yn / 2, bl = qt + vl / 2, qe = Math.abs(Ut.shift?.y || 0), xt = Ht.reference.height / 2, Xt = typeof u == "function" ? u(hb(Qe, i, P)) : u, ln = qe > Xt, en = {
        top: `${nl}px calc(100% + ${Xt}px)`,
        bottom: `${nl}px ${-Xt}px`,
        left: `calc(100% + ${Xt}px) ${bl}px`,
        right: `${-Xt}px ${bl}px`
      }[Gt], Ot = `${nl}px ${Ht.reference.y + xt - jt}px`;
      return ft.floating.style.setProperty("--transform-origin", ye && Sn === "y" && ln ? Ot : en), {};
    }
  }, ZO, N), we(() => {
    !M && E && E.update({
      referenceElement: null,
      floatingElement: null,
      domReferenceElement: null,
      positionReference: null
    });
  }, [M, E]);
  const Te = h.useMemo(() => ({
    elementResize: !x && typeof ResizeObserver < "u",
    layoutShift: !x && typeof IntersectionObserver < "u"
  }), [x]), {
    refs: Ce,
    elements: ve,
    x: Se,
    y: Re,
    middlewareData: Oe,
    update: He,
    placement: ae,
    context: pe,
    isPositioned: Le,
    floatingStyles: be
  } = RO({
    rootContext: E,
    open: C ? M : void 0,
    placement: X,
    middleware: ue,
    strategy: a,
    whileElementsMounted: C ? void 0 : (...Qe) => ib(...Qe, Te),
    nodeId: w,
    externalTree: L
  }), {
    sideX: xe,
    sideY: et
  } = Oe.adaptiveOrigin || yc, rt = Le ? a : "fixed", pt = h.useMemo(() => {
    const Qe = N ? {
      position: rt,
      [xe]: Se,
      [et]: Re
    } : {
      position: rt,
      ...be
    };
    return Le || (Qe.opacity = 0), Qe;
  }, [N, rt, xe, Se, et, Re, be, Le]), Nt = h.useRef(null);
  we(() => {
    if (!M)
      return;
    const Qe = Z.current, ft = typeof Qe == "function" ? Qe() : Qe, _t = (yb(ft) ? ft.current : ft) || null || null;
    _t !== Nt.current && (Ce.setPositionReference(_t), Nt.current = _t);
  }, [M, Ce, Q, Z]), h.useEffect(() => {
    if (!M)
      return;
    const Qe = Z.current;
    typeof Qe != "function" && yb(Qe) && Qe.current !== Nt.current && (Ce.setPositionReference(Qe.current), Nt.current = Qe.current);
  }, [M, Ce, Q, Z]), h.useEffect(() => {
    if (C && M && ve.reference && ve.floating)
      return ib(ve.reference, ve.floating, He, Te);
  }, [C, M, ve, He, Te]);
  const tt = In(ae), gt = Ox(i, tt, P), zt = ko(ae) || "center", ht = !!Oe.hide?.referenceHidden;
  we(() => {
    A && M && Le && _(tt);
  }, [A, M, Le, tt]);
  const An = h.useMemo(() => ({
    position: "absolute",
    top: Oe.arrow?.y,
    left: Oe.arrow?.x
  }), [Oe.arrow]), zn = Oe.arrow?.centerOffset !== 0;
  return h.useMemo(() => ({
    positionerStyles: pt,
    arrowStyles: An,
    arrowRef: re,
    arrowUncentered: zn,
    side: gt,
    align: zt,
    physicalSide: tt,
    anchorHidden: ht,
    refs: Ce,
    context: pe,
    isPositioned: Le,
    update: He
  }), [pt, An, re, zn, gt, zt, tt, ht, Ce, pe, Le, He]);
}
function yb(n) {
  return n != null && "current" in n;
}
const vu = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    cutout: i,
    ...u
  } = o;
  let f;
  if (i) {
    const p = i.getBoundingClientRect();
    f = `polygon(0% 0%,100% 0%,100% 100%,0% 100%,0% 0%,${p.left}px ${p.top}px,${p.left}px ${p.bottom}px,${p.right}px ${p.bottom}px,${p.right}px ${p.top}px,${p.left}px ${p.top}px)`;
  }
  return /* @__PURE__ */ b.jsx("div", {
    ref: a,
    role: "presentation",
    "data-base-ui-inert": "",
    ...u,
    style: {
      position: "fixed",
      inset: 0,
      userSelect: "none",
      WebkitUserSelect: "none",
      clipPath: f
    }
  });
});
function Ni(n) {
  return n === "starting" ? fC : mt;
}
function bu(n, o, {
  styles: a,
  transitionStatus: i,
  props: u,
  refs: f,
  hidden: p,
  inert: g = !1
}) {
  const m = {
    ...a
  };
  return g && (m.pointerEvents = "none"), $e("div", n, {
    state: o,
    ref: f,
    props: [{
      role: "presentation",
      hidden: p,
      style: m
    }, Ni(i), u],
    stateAttributesMapping: Lo
  });
}
let vb = {}, bb = {}, xb = "";
function JO(n) {
  if (typeof document > "u")
    return !1;
  const o = nt(n);
  return At(o).innerWidth - o.documentElement.clientWidth > 0;
}
function WO(n) {
  if (!(typeof CSS < "u" && CSS.supports && CSS.supports("scrollbar-gutter", "stable")) || typeof document > "u")
    return !1;
  const a = nt(n), i = a.documentElement, u = a.body, f = pr(i) ? i : u, p = f.style.overflowY, g = i.style.scrollbarGutter;
  i.style.scrollbarGutter = "stable", f.style.overflowY = "scroll";
  const m = f.offsetWidth;
  f.style.overflowY = "hidden";
  const d = f.offsetWidth;
  return f.style.overflowY = p, i.style.scrollbarGutter = g, m === d;
}
function $O(n) {
  const o = nt(n), a = o.documentElement, i = o.body, u = pr(a) ? a : i, f = {
    overflowY: u.style.overflowY,
    overflowX: u.style.overflowX
  };
  return Object.assign(u.style, {
    overflowY: "hidden",
    overflowX: "hidden"
  }), () => {
    Object.assign(u.style, f);
  };
}
function eM(n) {
  const o = nt(n), a = o.documentElement, i = o.body, u = At(a);
  let f = 0, p = 0, g = !1;
  const m = gl.create();
  if (Do && (u.visualViewport?.scale ?? 1) !== 1)
    return () => {
    };
  function d() {
    const C = u.getComputedStyle(a), E = u.getComputedStyle(i), z = (C.scrollbarGutter || "").includes("both-edges") ? "stable both-edges" : "stable";
    f = a.scrollTop, p = a.scrollLeft, vb = {
      scrollbarGutter: a.style.scrollbarGutter,
      overflowY: a.style.overflowY,
      overflowX: a.style.overflowX
    }, xb = a.style.scrollBehavior, bb = {
      position: i.style.position,
      height: i.style.height,
      width: i.style.width,
      boxSizing: i.style.boxSizing,
      overflowY: i.style.overflowY,
      overflowX: i.style.overflowX,
      scrollBehavior: i.style.scrollBehavior
    };
    const w = a.scrollHeight > a.clientHeight, N = a.scrollWidth > a.clientWidth, A = C.overflowY === "scroll" || E.overflowY === "scroll", L = C.overflowX === "scroll" || E.overflowX === "scroll", D = Math.max(0, u.innerWidth - i.clientWidth), _ = Math.max(0, u.innerHeight - i.clientHeight), j = parseFloat(E.marginTop) + parseFloat(E.marginBottom), V = parseFloat(E.marginLeft) + parseFloat(E.marginRight), G = pr(a) ? a : i;
    if (g = WO(n), g) {
      a.style.scrollbarGutter = z, G.style.overflowY = "hidden", G.style.overflowX = "hidden";
      return;
    }
    Object.assign(a.style, {
      scrollbarGutter: z,
      overflowY: "hidden",
      overflowX: "hidden"
    }), (w || A) && (a.style.overflowY = "scroll"), (N || L) && (a.style.overflowX = "scroll"), Object.assign(i.style, {
      position: "relative",
      height: j || _ ? `calc(100dvh - ${j + _}px)` : "100dvh",
      width: V || D ? `calc(100vw - ${V + D}px)` : "100vw",
      boxSizing: "border-box",
      overflow: "hidden",
      scrollBehavior: "unset"
    }), i.scrollTop = f, i.scrollLeft = p, a.setAttribute("data-base-ui-scroll-locked", ""), a.style.scrollBehavior = "unset";
  }
  function v() {
    Object.assign(a.style, vb), Object.assign(i.style, bb), g || (a.scrollTop = f, a.scrollLeft = p, a.removeAttribute("data-base-ui-scroll-locked"), a.style.scrollBehavior = xb);
  }
  function x() {
    v(), m.request(d);
  }
  d();
  const S = Je(u, "resize", x);
  return () => {
    m.cancel(), v(), typeof u.removeEventListener == "function" && S();
  };
}
class tM {
  lockCount = 0;
  restore = null;
  timeoutLock = tl.create();
  timeoutUnlock = tl.create();
  acquire(o) {
    return this.lockCount += 1, this.lockCount === 1 && this.restore === null && this.timeoutLock.start(0, () => this.lock(o)), this.release;
  }
  release = () => {
    this.lockCount -= 1, this.lockCount === 0 && this.restore && this.timeoutUnlock.start(0, this.unlock);
  };
  unlock = () => {
    this.lockCount === 0 && this.restore && (this.restore?.(), this.restore = null);
  };
  lock(o) {
    if (this.lockCount === 0 || this.restore !== null)
      return;
    const i = nt(o).documentElement, u = At(i).getComputedStyle(i).overflowY;
    if (u === "hidden" || u === "clip") {
      this.restore = an;
      return;
    }
    const f = Xc || !JO(o);
    this.restore = f ? $O(o) : eM(o);
  }
}
const nM = new tM();
function Mx(n = !0, o = null) {
  we(() => {
    if (n)
      return nM.acquire(o);
  }, [n, o]);
}
const lM = 20;
function mg(n, o, a, i) {
  const [u, f] = h.useState(!1);
  we(() => {
    if (!n || !o || a == null) {
      f(!1);
      return;
    }
    const p = nt(a).documentElement.clientWidth, g = a.offsetWidth;
    f(p > 0 && g > 0 && g >= p - lM);
  }, [n, o, a]), Mx(n && (!o || u), i);
}
const oM = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    anchor: p,
    positionMethod: g = "absolute",
    side: m = "bottom",
    align: d = "center",
    sideOffset: v = 0,
    alignOffset: x = 0,
    collisionBoundary: S = "clipping-ancestors",
    collisionPadding: C = 5,
    arrowPadding: E = 5,
    sticky: M = !1,
    disableAnchorTracking: T = !1,
    collisionAvoidance: z = Kp,
    ...w
  } = o, {
    store: N
  } = mr(), A = GO(), L = Zp(), D = N.useState("floatingRootContext"), _ = N.useState("mounted"), j = N.useState("open"), V = N.useState("openChangeReason"), G = N.useState("activeTriggerElement"), ne = N.useState("modal"), F = N.useState("openMethod"), Q = N.useState("positionerElement"), Z = N.useState("instantType"), q = N.useState("transitionStatus"), k = N.useState("hasViewport"), P = h.useRef(null), I = tg(Q, !1, !1), X = yu({
    anchor: p,
    floatingRootContext: D,
    positionMethod: g,
    mounted: _,
    side: m,
    sideOffset: v,
    align: d,
    alignOffset: x,
    arrowPadding: E,
    collisionBoundary: S,
    collisionPadding: C,
    sticky: M,
    disableAnchorTracking: T,
    keepMounted: A,
    nodeId: L,
    collisionAvoidance: z,
    adaptiveOrigin: k ? gg : void 0
  }), B = D.useState("domReferenceElement");
  we(() => {
    const J = B, le = P.current;
    if (J && (P.current = J), le && J && J !== le) {
      N.set("instantType", void 0);
      const ie = new AbortController();
      return I(() => {
        N.set("instantType", "trigger-change");
      }, ie.signal), () => {
        ie.abort();
      };
    }
  }, [B, I, N]), mg(j && ne === !0 && V !== Pt, F === "touch", Q, G);
  const O = h.useCallback((J) => {
    N.set("positionerElement", J);
  }, [N]), H = {
    open: j,
    side: X.side,
    align: X.align,
    anchorHidden: X.anchorHidden,
    instant: Z
  }, ee = bu(o, H, {
    styles: X.positionerStyles,
    transitionStatus: q,
    props: w,
    refs: [a, O],
    hidden: !_,
    inert: !j
  });
  return /* @__PURE__ */ b.jsxs(Cx.Provider, {
    value: X,
    children: [_ && ne === !0 && V !== Pt && /* @__PURE__ */ b.jsx(vu, {
      ref: N.context.internalBackdropRef,
      inert: hu(!j),
      cutout: G
    }), /* @__PURE__ */ b.jsx(J0, {
      id: L,
      children: ee
    })]
  });
}), rM = /* @__PURE__ */ h.createContext(void 0);
function aM() {
  const [n, o] = h.useState(0), a = ze(() => (o((u) => u + 1), () => {
    o((u) => Math.max(0, u - 1));
  }));
  return {
    context: h.useMemo(() => ({
      register: a
    }), [a]),
    hasClosePart: n > 0
  };
}
function iM(n) {
  const {
    value: o,
    children: a
  } = n;
  return /* @__PURE__ */ b.jsx(rM.Provider, {
    value: o,
    children: a
  });
}
const sM = {
  ...Lo,
  ...Ho
}, cM = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    initialFocus: p,
    finalFocus: g,
    ...m
  } = o, {
    store: d
  } = mr(), v = XO(), x = eu() != null, {
    context: S,
    hasClosePart: C
  } = aM(), E = d.useState("open"), M = d.useState("openMethod"), T = d.useState("instantType"), z = d.useState("transitionStatus"), w = d.useState("popupProps"), N = d.useState("titleElementId"), A = d.useState("descriptionElementId"), L = d.useState("modal"), D = d.useState("mounted"), _ = d.useState("openChangeReason"), j = d.useState("activeTriggerElement"), V = d.useState("floatingRootContext"), G = V.useState("floatingId"), ne = d.useState("disabled"), F = d.useState("openOnHover"), Q = d.useState("closeDelay"), Z = m.id ?? G;
  no({
    open: E,
    ref: d.context.popupRef,
    onComplete() {
      E && d.context.onOpenChangeComplete?.(!0);
    }
  }), ug(V, {
    enabled: F && !ne,
    closeDelay: Q
  });
  const q = p === void 0 ? dx(d.context.popupRef) : p, k = L !== !1 && C;
  d.useSyncedValue("focusManagerModal", k);
  const P = h.useCallback((B) => {
    d.set("popupElement", B);
  }, [d]), I = {
    open: E,
    side: v.side,
    align: v.align,
    instant: T,
    transitionStatus: z
  }, X = $e("div", o, {
    state: I,
    ref: [a, d.context.popupRef, P],
    props: [w, {
      id: Z,
      role: "dialog",
      ...fa,
      "aria-labelledby": N,
      "aria-describedby": A,
      onKeyDown(B) {
        x && Mi.has(B.key) && B.stopPropagation();
      }
    }, Ni(z), m],
    stateAttributesMapping: sM
  });
  return /* @__PURE__ */ b.jsx(nu, {
    context: V,
    openInteractionType: M,
    modal: k,
    disabled: !D || _ === Pt,
    initialFocus: q,
    returnFocus: g,
    restoreFocus: "popup",
    previousFocusableElement: Rt(j) ? j : void 0,
    nextFocusableElement: d.context.triggerFocusTargetRef,
    beforeContentFocusGuardRef: d.context.beforeContentFocusGuardRef,
    children: /* @__PURE__ */ b.jsx(iM, {
      value: S,
      children: X
    })
  });
}), uM = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    ...p
  } = o, {
    store: g
  } = mr(), m = wn(p.id);
  return g.useSyncedValueWithCleanup("titleElementId", m), $e("h2", o, {
    ref: a,
    props: [{
      id: m
    }, p]
  });
}), fM = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    ...p
  } = o, {
    store: g
  } = mr(), m = wn(p.id);
  return g.useSyncedValueWithCleanup("descriptionElementId", m), $e("p", o, {
    ref: a,
    props: [{
      id: m
    }, p]
  });
});
function dM(n) {
  const [o, a] = h.useState({
    current: n,
    previous: null
  });
  return n !== o.current && a({
    current: n,
    previous: o.current
  }), o.previous;
}
function hp({ ...n }) {
  return /* @__PURE__ */ b.jsx(kO, { "data-slot": "popover", ...n });
}
function yp({ ...n }) {
  return /* @__PURE__ */ b.jsx(YO, { "data-slot": "popover-trigger", ...n });
}
function vp({
  className: n,
  align: o = "center",
  alignOffset: a = 0,
  side: i = "bottom",
  sideOffset: u = 4,
  anchor: f,
  plain: p = !1,
  portalContainer: g,
  positionerClassName: m,
  ...d
}) {
  return /* @__PURE__ */ b.jsx(qO, { container: g, children: /* @__PURE__ */ b.jsx(
    oM,
    {
      align: o,
      alignOffset: a,
      side: i,
      sideOffset: u,
      anchor: f,
      className: Fe("tw:isolate tw:z-[var(--z-popover)]", m),
      children: /* @__PURE__ */ b.jsx(
        cM,
        {
          "data-slot": "popover-content",
          className: Fe(
            p ? "tw:origin-(--transform-origin) tw:outline-hidden" : "tw:flex tw:w-72 tw:origin-(--transform-origin) tw:flex-col tw:gap-2.5 tw:rounded-[var(--radius-surface)] tw:bg-popover tw:p-2.5 tw:text-[length:var(--fs-body-s)] tw:text-popover-foreground tw:shadow-[var(--elevation-overlay)] tw:ring-1 tw:ring-foreground/10 tw:outline-hidden",
            n
          ),
          ...d
        }
      )
    }
  ) });
}
function pM({ className: n, ...o }) {
  return /* @__PURE__ */ b.jsx(
    "div",
    {
      "data-slot": "popover-header",
      className: Fe("tw:flex tw:flex-col tw:gap-0.5 tw:text-[length:var(--fs-body-s)]", n),
      ...o
    }
  );
}
function hg({ className: n, ...o }) {
  return /* @__PURE__ */ b.jsx(
    uM,
    {
      "data-slot": "popover-title",
      className: Fe("tw:m-0 tw:text-[length:var(--fs-body-s)] tw:font-medium", n),
      ...o
    }
  );
}
function Ax({
  className: n,
  ...o
}) {
  return /* @__PURE__ */ b.jsx(
    fM,
    {
      "data-slot": "popover-description",
      className: Fe("tw:m-0 tw:text-muted-foreground", n),
      ...o
    }
  );
}
const zx = /* @__PURE__ */ h.createContext(void 0);
function ji(n) {
  const o = h.useContext(zx);
  if (o === void 0 && !n)
    throw new Error(Ct(72));
  return o;
}
const gM = {
  ...du,
  disabled: me((n) => n.disabled),
  instantType: me((n) => n.instantType),
  isInstantPhase: me((n) => n.isInstantPhase),
  trackCursorAxis: me((n) => n.trackCursorAxis),
  disableHoverablePopup: me((n) => n.disableHoverablePopup),
  lastOpenChangeReason: me((n) => n.openChangeReason),
  closeOnClick: me((n) => n.closeOnClick),
  closeDelay: me((n) => n.closeDelay),
  hasViewport: me((n) => n.hasViewport)
};
class yg extends zi {
  constructor(o, a, i = !1) {
    const u = new da(), f = {
      ...mM(),
      ...o
    };
    f.floatingRootContext = ag(u, a, i), super(f, {
      popupRef: /* @__PURE__ */ h.createRef(),
      onOpenChange: void 0,
      onOpenChangeComplete: void 0,
      triggerElements: u
    }, gM);
  }
  setOpen = (o, a) => {
    SO(this, o, a, {
      extraState: {
        openChangeReason: a.reason
      }
    });
  };
  // Used by trigger clicks to clear a delayed hover open without reporting a public open-state change.
  cancelPendingOpen(o) {
    this.state.floatingRootContext.dispatchOpenChange(!1, Pe(Zl, o));
  }
  static useStore(o, a) {
    return ng(o, (u, f) => new yg(a, u, f)).store;
  }
}
function mM() {
  return {
    ...fu(),
    disabled: !1,
    instantType: void 0,
    isInstantPhase: !1,
    trackCursorAxis: "none",
    disableHoverablePopup: !1,
    openChangeReason: null,
    closeOnClick: !0,
    closeDelay: 0,
    hasViewport: !1
  };
}
const hM = eg(function(o) {
  const {
    disabled: a = !1,
    defaultOpen: i = !1,
    open: u,
    disableHoverablePopup: f = !1,
    trackCursorAxis: p = "none",
    actionsRef: g,
    onOpenChange: m,
    onOpenChangeComplete: d,
    handle: v,
    triggerId: x,
    defaultTriggerId: S = null,
    children: C
  } = o, E = yg.useStore(v?.store, {
    open: i,
    openProp: u,
    activeTriggerId: S,
    triggerIdProp: x
  });
  og(E, u, i, S), E.useControlledProp("openProp", u), E.useControlledProp("triggerIdProp", x), E.useContextCallback("onOpenChange", m), E.useContextCallback("onOpenChangeComplete", d);
  const M = E.useState("open"), T = !a && M, z = E.useState("activeTriggerId"), w = E.useState("mounted"), N = E.useState("payload");
  E.useSyncedValues({
    trackCursorAxis: p,
    disableHoverablePopup: f
  }), E.useSyncedValue("disabled", a), su(E, {
    closeOnActiveTriggerUnmount: !0
  });
  const {
    forceUnmount: A,
    transitionStatus: L
  } = cu(T, E), D = E.useState("isInstantPhase"), _ = E.useState("instantType"), j = E.useState("lastOpenChangeReason"), V = h.useRef(null);
  we(() => {
    M && a && E.setOpen(!1, Pe(WT));
  }, [M, a, E]), we(() => {
    L === "ending" && j === eo || L !== "ending" && D ? (_ !== "delay" && (V.current = _), E.set("instantType", "delay")) : V.current !== null && (E.set("instantType", V.current), V.current = null);
  }, [L, D, j, _, E]), we(() => {
    T && z == null && E.set("payload", void 0);
  }, [E, z, T]);
  const G = h.useCallback(() => {
    E.setOpen(!1, Pe(Gc));
  }, [E]);
  h.useImperativeHandle(g, () => ({
    unmount: A,
    close: G
  }), [A, G]);
  const ne = T || w || !a && p !== "none";
  return /* @__PURE__ */ b.jsxs(zx.Provider, {
    value: E,
    children: [ne && /* @__PURE__ */ b.jsx(yM, {
      store: E,
      disabled: a,
      trackCursorAxis: p
    }), typeof C == "function" ? C({
      payload: N
    }) : C]
  });
});
function yM({
  store: n,
  disabled: o,
  trackCursorAxis: a
}) {
  const i = n.useState("floatingRootContext"), u = Ai(i, {
    enabled: !o,
    referencePress: () => n.select("closeOnClick")
  }), f = yC(i, {
    enabled: !o && a !== "none",
    axis: a === "none" ? void 0 : a
  }), p = h.useMemo(() => yn(f.reference, u.reference), [f.reference, u.reference]), g = h.useMemo(() => yn(f.trigger, u.trigger), [f.trigger, u.trigger]), m = h.useMemo(() => yn(fa, f.floating, u.floating), [f.floating, u.floating]);
  return uu(n, {
    activeTriggerProps: p,
    inactiveTriggerProps: g,
    popupProps: m
  }), null;
}
const Nx = /* @__PURE__ */ h.createContext(void 0);
function vM() {
  return h.useContext(Nx);
}
let bM = (function(n) {
  return n[n.popupOpen = Lc.popupOpen] = "popupOpen", n.triggerDisabled = "data-trigger-disabled", n;
})({});
const xM = 600, jx = "data-base-ui-tooltip-trigger";
function wb(n) {
  if ("composedPath" in n) {
    const a = n.composedPath();
    for (let i = 0; i < a.length; i += 1) {
      const u = a[i];
      if (We(u))
        return u;
    }
  }
  const o = n.target;
  return We(o) ? o : null;
}
function wM(n) {
  let o = n;
  for (; o; ) {
    if (o.hasAttribute(jx))
      return o;
    const a = o.parentElement;
    if (a) {
      o = a;
      continue;
    }
    const i = o.getRootNode();
    o = "host" in i && We(i.host) ? i.host : null;
  }
  return null;
}
const SM = cx(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    handle: p,
    payload: g,
    disabled: m,
    delay: d,
    closeOnClick: v = !0,
    closeDelay: x,
    id: S,
    ...C
  } = o, E = ji(!0), M = p?.store ?? E;
  if (!M)
    throw new Error(Ct(82));
  const T = wn(S), z = M.useState("isTriggerActive", T), w = M.useState("isOpenedByTrigger", T), N = M.useState("floatingRootContext"), A = h.useRef(null), L = d ?? xM, D = x ?? 0, {
    registerTrigger: _,
    isMountedByThisTrigger: j
  } = rg(T, A, M, {
    payload: g,
    closeOnClick: v,
    closeDelay: D
  }), V = vM(), {
    delayRef: G,
    isInstantPhase: ne,
    hasProvider: F
  } = oC(N, {
    open: w
  }), Q = cg(N);
  M.useSyncedValue("isInstantPhase", ne);
  const Z = M.useState("disabled"), q = m ?? Z, k = Yt(q), P = M.useState("trackCursorAxis"), I = M.useState("disableHoverablePopup"), X = h.useRef(!1), B = sn(), O = h.useRef(void 0);
  function H() {
    const ue = V?.delay, he = typeof G.current == "object" ? G.current.open : void 0;
    let ye = L;
    return F && (he !== 0 ? ye = d ?? ue ?? L : ye = 0), ye;
  }
  function ee(ue) {
    const he = A.current;
    if (!he || !ue)
      return !1;
    const ye = wM(ue);
    return ye !== null && ye !== he && Ue(he, ye);
  }
  function J(ue) {
    const he = ee(ue);
    return X.current = he, he && (Q.openChangeTimeout.clear(), Q.restTimeout.clear(), Q.restTimeoutPending = !1, B.clear()), he;
  }
  const le = pu(N, {
    enabled: !q,
    mouseOnly: !0,
    move: !1,
    handleClose: !I && P !== "both" ? mu() : null,
    restMs: H,
    delay() {
      const ue = typeof G.current == "object" ? G.current.close : void 0;
      let he = D;
      return x == null && F && (he = ue), {
        close: he
      };
    },
    triggerElementRef: A,
    isActiveTrigger: z,
    isClosing: () => M.select("transitionStatus") === "ending",
    shouldOpen() {
      return !X.current;
    }
  }), ie = yx(N, {
    enabled: !q
  }).reference, re = (ue) => {
    const he = X.current, ye = wb(ue), je = J(ye), ke = A.current, Te = ke && ye && Ue(ke, ye);
    if (je && M.select("open") && M.select("lastOpenChangeReason") === Pt) {
      M.setOpen(!1, Pe(Pt, ue));
      return;
    }
    if (he && !je && Te && !k.current && !M.select("open") && ke && // Match the hover hook's non-strict mouse fallback for mouse-only event sequences.
    ur(O.current)) {
      const Ce = () => {
        !X.current && !k.current && !M.select("open") && M.setOpen(!0, Pe(Pt, ue, ke));
      }, ve = H();
      ve === 0 ? (B.clear(), Ce()) : B.start(ve, Ce);
    }
  }, se = M.useState("triggerProps", j);
  return $e("button", o, {
    state: {
      open: w
    },
    ref: [a, _, A],
    props: [le, ie, j || P !== "none" ? se : void 0, {
      onMouseOver(ue) {
        re(ue.nativeEvent);
      },
      onFocus(ue) {
        ee(wb(ue.nativeEvent)) && ue.preventBaseUIHandler();
      },
      onMouseLeave() {
        X.current = !1, B.clear(), O.current = void 0;
      },
      onPointerEnter(ue) {
        O.current = ue.pointerType;
      },
      onPointerDown(ue) {
        O.current = ue.pointerType, M.set("closeOnClick", v), v && !M.select("open") && M.cancelPendingOpen(ue.nativeEvent);
      },
      onClick(ue) {
        v && !M.select("open") && M.cancelPendingOpen(ue.nativeEvent);
      },
      id: T,
      [bM.triggerDisabled]: q ? "" : void 0,
      [jx]: q ? void 0 : ""
    }, C],
    stateAttributesMapping: dg
  });
}), Dx = /* @__PURE__ */ h.createContext(void 0);
function EM() {
  const n = h.useContext(Dx);
  if (n === void 0)
    throw new Error(Ct(70));
  return n;
}
const TM = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    children: i,
    container: u,
    className: f,
    render: p,
    style: g,
    ...m
  } = o, {
    portalNode: d,
    portalSubtree: v
  } = F0({
    container: u,
    ref: a,
    componentProps: o,
    elementProps: m
  });
  return !v && !d ? null : /* @__PURE__ */ b.jsxs(h.Fragment, {
    children: [v, d && /* @__PURE__ */ hl.createPortal(i, d)]
  });
}), RM = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    keepMounted: i = !1,
    ...u
  } = o;
  return ji().useState("mounted") || i ? /* @__PURE__ */ b.jsx(Dx.Provider, {
    value: i,
    children: /* @__PURE__ */ b.jsx(TM, {
      ref: a,
      ...u
    })
  }) : null;
}), kx = /* @__PURE__ */ h.createContext(void 0);
function _x() {
  const n = h.useContext(kx);
  if (n === void 0)
    throw new Error(Ct(71));
  return n;
}
const CM = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    anchor: f,
    positionMethod: p = "absolute",
    side: g = "top",
    align: m = "center",
    sideOffset: d = 0,
    alignOffset: v = 0,
    collisionBoundary: x = "clipping-ancestors",
    collisionPadding: S = 5,
    arrowPadding: C = 5,
    sticky: E = !1,
    disableAnchorTracking: M = !1,
    collisionAvoidance: T = Kp,
    style: z,
    ...w
  } = o, N = ji(), A = EM(), L = N.useState("open"), D = N.useState("mounted"), _ = N.useState("trackCursorAxis"), j = N.useState("disableHoverablePopup"), V = N.useState("floatingRootContext"), G = N.useState("instantType"), ne = N.useState("transitionStatus"), F = N.useState("hasViewport"), Q = yu({
    anchor: f,
    positionMethod: p,
    floatingRootContext: V,
    mounted: D,
    side: g,
    sideOffset: d,
    align: m,
    alignOffset: v,
    collisionBoundary: x,
    collisionPadding: S,
    sticky: E,
    arrowPadding: C,
    disableAnchorTracking: M,
    keepMounted: A,
    collisionAvoidance: T,
    adaptiveOrigin: F ? gg : void 0
  }), Z = h.useMemo(() => ({
    open: L,
    side: Q.side,
    align: Q.align,
    anchorHidden: Q.anchorHidden,
    instant: _ !== "none" ? "tracking-cursor" : G
  }), [L, Q.side, Q.align, Q.anchorHidden, _, G]), q = bu(o, Z, {
    styles: Q.positionerStyles,
    transitionStatus: ne,
    props: w,
    refs: [a, N.useStateSetter("positionerElement")],
    hidden: !D,
    inert: !L || _ === "both" || j
  });
  return /* @__PURE__ */ b.jsx(kx.Provider, {
    value: Q,
    children: q
  });
}), OM = {
  ...Lo,
  ...Ho
}, MM = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    ...p
  } = o, g = ji(), {
    side: m,
    align: d
  } = _x(), v = g.useState("open"), x = g.useState("instantType"), S = g.useState("transitionStatus"), C = g.useState("popupProps"), E = g.useState("floatingRootContext"), M = g.useState("disabled"), T = g.useState("closeDelay");
  no({
    open: v,
    ref: g.context.popupRef,
    onComplete() {
      v && g.context.onOpenChangeComplete?.(!0);
    }
  }), ug(E, {
    enabled: !M,
    closeDelay: T
  });
  const z = g.useStateSetter("popupElement");
  return $e("div", o, {
    state: {
      open: v,
      side: m,
      align: d,
      instant: x,
      transitionStatus: S
    },
    ref: [a, g.context.popupRef, z],
    props: [C, Ni(S), p],
    stateAttributesMapping: OM
  });
}), AM = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    ...p
  } = o, g = ji(), {
    arrowRef: m,
    side: d,
    align: v,
    arrowUncentered: x,
    arrowStyles: S
  } = _x(), C = g.useState("open"), E = g.useState("instantType");
  return $e("div", o, {
    state: {
      open: C,
      side: d,
      align: v,
      uncentered: x,
      instant: E
    },
    ref: [a, m],
    props: [{
      style: S,
      "aria-hidden": !0
    }, p],
    stateAttributesMapping: Lo
  });
}), zM = function(o) {
  const {
    delay: a,
    closeDelay: i,
    timeout: u = 400
  } = o, f = h.useMemo(() => ({
    delay: a,
    closeDelay: i
  }), [a, i]), p = h.useMemo(() => ({
    open: a,
    close: i
  }), [a, i]);
  return /* @__PURE__ */ b.jsx(Nx.Provider, {
    value: f,
    children: /* @__PURE__ */ b.jsx(lC, {
      delay: p,
      timeoutMs: u,
      children: o.children
    })
  });
};
function NM({
  delay: n = 0,
  ...o
}) {
  return /* @__PURE__ */ b.jsx(
    zM,
    {
      "data-slot": "tooltip-provider",
      delay: n,
      ...o
    }
  );
}
function jM({ ...n }) {
  return /* @__PURE__ */ b.jsx(hM, { "data-slot": "tooltip", ...n });
}
function DM({ ...n }) {
  return /* @__PURE__ */ b.jsx(SM, { "data-slot": "tooltip-trigger", ...n });
}
function kM({
  className: n,
  side: o = "top",
  sideOffset: a = 4,
  align: i = "center",
  alignOffset: u = 0,
  children: f,
  ...p
}) {
  return /* @__PURE__ */ b.jsx(RM, { children: /* @__PURE__ */ b.jsx(
    CM,
    {
      align: i,
      alignOffset: u,
      side: o,
      sideOffset: a,
      className: "tw:isolate tw:z-[var(--z-popover)]",
      children: /* @__PURE__ */ b.jsxs(
        MM,
        {
          "data-slot": "tooltip-content",
          className: Fe(
            "tw:inline-flex tw:w-fit tw:max-w-xs tw:items-center tw:gap-1.5 tw:rounded-[var(--radius-control)] tw:bg-foreground tw:px-3 tw:py-1.5 tw:text-[length:var(--fs-label)] tw:text-background tw:has-data-[slot=kbd]:pr-1.5 tw:**:data-[slot=kbd]:relative tw:**:data-[slot=kbd]:isolate tw:**:data-[slot=kbd]:rounded-sm",
            n
          ),
          ...p,
          children: [
            f,
            /* @__PURE__ */ b.jsx(AM, { className: "tw:size-2.5 tw:translate-y-[calc(-50%-2px)] tw:rotate-45 tw:bg-foreground tw:fill-foreground tw:data-[side=bottom]:top-1 tw:data-[side=inline-end]:top-1/2! tw:data-[side=inline-end]:-left-1 tw:data-[side=inline-end]:-translate-y-1/2 tw:data-[side=inline-start]:top-1/2! tw:data-[side=inline-start]:-right-1 tw:data-[side=inline-start]:-translate-y-1/2 tw:data-[side=left]:top-1/2! tw:data-[side=left]:-right-1 tw:data-[side=left]:-translate-y-1/2 tw:data-[side=right]:top-1/2! tw:data-[side=right]:-left-1 tw:data-[side=right]:-translate-y-1/2 tw:data-[side=top]:-bottom-2.5" })
          ]
        }
      )
    }
  ) });
}
function Hx(...n) {
  return n.filter(Boolean).join(" ");
}
const Lx = 420;
function _M(n) {
  const [o, a] = n.split("-");
  return { side: o, align: a ?? "center" };
}
function HM({ children: n }) {
  return /* @__PURE__ */ b.jsx(NM, { delay: Lx, closeDelay: 0, children: n });
}
function Vl(n) {
  const { label: o, children: a, placement: i = "top", contentClassName: u } = n, f = Ec.useId(), [p, g] = Ec.useState(!1);
  return /* @__PURE__ */ b.jsxs(jM, { open: p, onOpenChange: g, children: [
    /* @__PURE__ */ b.jsx(
      DM,
      {
        delay: Lx,
        closeDelay: 0,
        "aria-describedby": p ? f : void 0,
        onBlur: () => g(!1),
        onMouseLeave: () => g(!1),
        render: a
      }
    ),
    /* @__PURE__ */ b.jsx(kM, { id: f, role: "tooltip", ..._M(i), className: Hx("ui-tooltip open", u), children: o })
  ] });
}
function Ux() {
  const [n, o] = h.useState(() => window.__galleryPresentation?.getState() ?? { mode: "grid", size: 185, rows: "comfortable" });
  return h.useEffect(() => {
    const a = () => {
      const i = window.__galleryPresentation?.getState();
      i && o(i);
    };
    return a(), window.addEventListener("atelier-gallery-presentation-change", a), () => window.removeEventListener("atelier-gallery-presentation-change", a);
  }, []), { state: n, set: (a) => window.__galleryPresentation?.set(a) };
}
function Sb() {
  const { state: n, set: o } = Ux();
  return /* @__PURE__ */ b.jsxs(oa, { value: [n.mode], onValueChange: (a) => {
    a[0] && o({ mode: a[0] });
  }, className: "gallery-view-switch", "aria-label": "Mode d’affichage", children: [
    /* @__PURE__ */ b.jsx(Vl, { label: "Grille", children: /* @__PURE__ */ b.jsx(Pl, { value: "grid", "aria-label": "Grille", "data-gallery-command": "grid", children: /* @__PURE__ */ b.jsx(Ub, {}) }) }),
    /* @__PURE__ */ b.jsx(Vl, { label: "Liste détaillée", children: /* @__PURE__ */ b.jsx(Pl, { value: "list", "aria-label": "Liste détaillée", "data-gallery-command": "list", children: /* @__PURE__ */ b.jsx(cE, {}) }) })
  ] });
}
function LM() {
  const { state: n, set: o } = Ux();
  return /* @__PURE__ */ b.jsxs(hp, { children: [
    /* @__PURE__ */ b.jsx(Vl, { label: "Présentation", children: /* @__PURE__ */ b.jsx(yp, { render: /* @__PURE__ */ b.jsx(Vt, { variant: "ghost", size: "icon-sm", "data-gallery-command": "view", "aria-label": "Présentation", children: /* @__PURE__ */ b.jsx(SE, {}) }) }) }),
    /* @__PURE__ */ b.jsxs(vp, { align: "end", className: "gallery-presentation-popover", children: [
      /* @__PURE__ */ b.jsx(hg, { children: "Présentation" }),
      /* @__PURE__ */ b.jsxs(oa, { value: [n.mode], onValueChange: (a) => {
        a[0] && o({ mode: a[0] });
      }, className: "gallery-visual-choices", "aria-label": "Présentation des fichiers", children: [
        /* @__PURE__ */ b.jsxs(Pl, { value: "grid", className: "gallery-visual-choice", children: [
          /* @__PURE__ */ b.jsx("span", { className: "gallery-mini-grid", "aria-hidden": "true", children: Array.from({ length: 6 }, (a, i) => /* @__PURE__ */ b.jsx("b", {}, i)) }),
          /* @__PURE__ */ b.jsx("span", { children: "Grille" })
        ] }),
        /* @__PURE__ */ b.jsxs(Pl, { value: "list", className: "gallery-visual-choice", children: [
          /* @__PURE__ */ b.jsx("span", { className: "gallery-mini-list", "aria-hidden": "true", children: Array.from({ length: 3 }, (a, i) => /* @__PURE__ */ b.jsx("b", {}, i)) }),
          /* @__PURE__ */ b.jsx("span", { children: "Liste détaillée" })
        ] })
      ] }),
      n.mode === "grid" ? /* @__PURE__ */ b.jsxs(b.Fragment, { children: [
        /* @__PURE__ */ b.jsx("span", { className: "gallery-presentation-label", children: "Taille des vignettes" }),
        /* @__PURE__ */ b.jsx(oa, { value: [String(n.size < 205 ? 160 : n.size < 275 ? 240 : 320)], onValueChange: (a) => {
          a[0] && o({ size: Number(a[0]) });
        }, className: "gallery-visual-choices gallery-size-choices", "aria-label": "Taille des vignettes", children: [{ size: 160, label: "Petites", columns: 4 }, { size: 240, label: "Standard", columns: 3 }, { size: 320, label: "Grandes", columns: 2 }].map((a) => /* @__PURE__ */ b.jsxs(Pl, { value: String(a.size), className: "gallery-visual-choice", children: [
          /* @__PURE__ */ b.jsx("span", { className: "gallery-mini-grid", style: { gridTemplateColumns: `repeat(${a.columns}, 1fr)` }, "aria-hidden": "true", children: Array.from({ length: a.columns * 2 }, (i, u) => /* @__PURE__ */ b.jsx("b", {}, u)) }),
          a.label
        ] }, a.size)) })
      ] }) : /* @__PURE__ */ b.jsxs(b.Fragment, { children: [
        /* @__PURE__ */ b.jsx("span", { className: "gallery-presentation-label", children: "Hauteur des lignes" }),
        /* @__PURE__ */ b.jsxs(oa, { value: [n.rows], onValueChange: (a) => {
          a[0] && o({ rows: a[0] });
        }, className: "gallery-visual-choices", "aria-label": "Hauteur des lignes", children: [
          /* @__PURE__ */ b.jsxs(Pl, { value: "compact", className: "gallery-visual-choice", children: [
            /* @__PURE__ */ b.jsxs("span", { className: "gallery-density-lines", "aria-hidden": "true", children: [
              /* @__PURE__ */ b.jsx("i", {}),
              /* @__PURE__ */ b.jsx("i", {}),
              /* @__PURE__ */ b.jsx("i", {})
            ] }),
            "Compacte"
          ] }),
          /* @__PURE__ */ b.jsxs(Pl, { value: "comfortable", className: "gallery-visual-choice", children: [
            /* @__PURE__ */ b.jsxs("span", { className: "gallery-density-lines roomy", "aria-hidden": "true", children: [
              /* @__PURE__ */ b.jsx("i", {}),
              /* @__PURE__ */ b.jsx("i", {}),
              /* @__PURE__ */ b.jsx("i", {})
            ] }),
            "Aérée"
          ] })
        ] })
      ] })
    ] })
  ] });
}
function Bx({ className: n, ...o }) {
  return /* @__PURE__ */ b.jsx(fE, { "data-slot": "spinner", role: "status", "aria-label": "Loading", className: Fe("tw:size-4 tw:animate-spin", n), ...o });
}
const UM = Ec.forwardRef(function(o, a) {
  const {
    variant: i = "secondary",
    type: u = "button",
    disabled: f,
    loading: p,
    "aria-busy": g,
    className: m,
    children: d,
    ...v
  } = o, x = i === "primary" ? "default" : i === "danger" ? "destructive" : i;
  return /* @__PURE__ */ b.jsxs(
    Vt,
    {
      ...v,
      ref: a,
      type: u,
      variant: x,
      className: Hx("ui-btn", `ui-btn--${i}`, p && "ui-btn--loading", m),
      disabled: f || p,
      "aria-busy": p || g || void 0,
      children: [
        d != null && /* @__PURE__ */ b.jsx("span", { className: "ui-btn-label", children: d }),
        p && /* @__PURE__ */ b.jsx("span", { className: "ui-btn-spin", "aria-hidden": "true", children: /* @__PURE__ */ b.jsx(Bx, { className: "ui-spin", "aria-hidden": "true" }) })
      ]
    }
  );
}), Ix = /* @__PURE__ */ h.createContext(void 0);
function xu(n) {
  const o = h.useContext(Ix);
  if (o === void 0 && !n)
    throw new Error(Ct(33));
  return o;
}
const Vx = /* @__PURE__ */ h.createContext(void 0);
function yl(n) {
  const o = h.useContext(Vx);
  if (o === void 0 && !n)
    throw new Error(Ct(36));
  return o;
}
const BM = /* @__PURE__ */ h.createContext(void 0);
function wu(n = !0) {
  const o = h.useContext(BM);
  if (o === void 0 && !n)
    throw new Error(Ct(25));
  return o;
}
const Px = /* @__PURE__ */ h.createContext(void 0);
function IM() {
  const n = h.useContext(Px);
  if (n === void 0)
    throw new Error(Ct(30));
  return n;
}
function VM(n) {
  const {
    closeOnClick: o,
    highlighted: a,
    id: i,
    nodeId: u,
    store: f,
    typingRef: p,
    itemRef: g,
    itemMetadata: m
  } = n, {
    events: d
  } = f.useState("floatingTreeRoot"), v = f.useState("open"), x = wu(!0), S = x !== void 0;
  return h.useMemo(() => ({
    id: i,
    role: "menuitem",
    tabIndex: v && a ? 0 : -1,
    onKeyDown(C) {
      C.key === " " && p?.current && C.preventDefault();
    },
    onMouseMove(C) {
      u && d.emit("itemhover", {
        nodeId: u,
        target: C.currentTarget
      });
    },
    onClick(C) {
      o && d.emit("close", {
        domEvent: C,
        reason: na
      });
    },
    onMouseUp(C) {
      if (x) {
        const E = x.initialCursorPointRef.current;
        if (x.initialCursorPointRef.current = null, S && E && Math.abs(C.clientX - E.x) <= 1 && Math.abs(C.clientY - E.y) <= 1 || S && !Lp && C.button === 2)
          return;
      }
      g.current && f.context.allowMouseUpTriggerRef.current && (!S || C.button === 2) && (!m || m.type === "regular-item") && g.current.click();
    }
  }), [o, a, i, d, u, v, f, p, g, x, S, m]);
}
const Yx = {
  type: "regular-item"
};
function vg(n) {
  const {
    closeOnClick: o,
    disabled: a = !1,
    highlighted: i,
    id: u,
    store: f,
    typingRef: p = f.context.typingRef,
    nativeButton: g,
    itemMetadata: m,
    nodeId: d
  } = n, v = f.useState("disabled"), x = a || v, S = h.useRef(null), {
    getButtonProps: C,
    buttonRef: E
  } = $l({
    disabled: x,
    focusableWhenDisabled: !0,
    native: g,
    composite: !0
  }), M = VM({
    closeOnClick: o,
    highlighted: i,
    id: u,
    nodeId: d,
    store: f,
    typingRef: p,
    itemRef: S,
    itemMetadata: m
  }), T = h.useCallback((w) => yn(M, {
    onMouseEnter() {
      m.type === "submenu-trigger" && m.setActive();
    }
  }, w, C), [M, C, m]), z = Kl(S, E);
  return h.useMemo(() => ({
    getItemProps: T,
    itemRef: z
  }), [T, z]);
}
let Eb = /* @__PURE__ */ (function(n) {
  return n.checked = "data-checked", n.unchecked = "data-unchecked", n.disabled = "data-disabled", n.highlighted = "data-highlighted", n;
})({});
const Gx = {
  checked(n) {
    return n ? {
      [Eb.checked]: ""
    } : {
      [Eb.unchecked]: ""
    };
  },
  ...Ho
}, PM = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    id: f,
    label: p,
    nativeButton: g = !1,
    disabled: m = !1,
    closeOnClick: d = !1,
    checked: v,
    defaultChecked: x,
    onCheckedChange: S,
    style: C,
    ...E
  } = o, M = Ri({
    label: p
  }), T = xu(!0), z = wn(f), {
    store: w
  } = yl(), N = w.useState("isActive", M.index), A = w.useState("itemProps"), [L, D] = sr({
    controlled: v,
    default: x ?? !1,
    name: "MenuCheckboxItem",
    state: "checked"
  }), {
    getItemProps: _,
    itemRef: j
  } = vg({
    closeOnClick: d,
    disabled: m,
    highlighted: N,
    id: z,
    store: w,
    nativeButton: g,
    nodeId: T?.context.nodeId,
    itemMetadata: Yx
  }), V = h.useMemo(() => ({
    disabled: m,
    highlighted: N,
    checked: L
  }), [m, N, L]);
  function G(F) {
    const Q = Pe(na, F.nativeEvent, void 0, {
      preventUnmountOnClose() {
      }
    });
    S?.(!L, Q), !Q.isCanceled && D((Z) => !Z);
  }
  const ne = $e("div", o, {
    state: V,
    stateAttributesMapping: Gx,
    props: [A, {
      role: "menuitemcheckbox",
      "aria-checked": L,
      onClick: G
    }, E, _],
    ref: [j, a, M.ref]
  });
  return /* @__PURE__ */ b.jsx(Px.Provider, {
    value: V,
    children: ne
  });
}), YM = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    keepMounted: p = !1,
    ...g
  } = o, m = IM(), d = h.useRef(null), {
    transitionStatus: v,
    setMounted: x
  } = au(m.checked);
  no({
    open: m.checked,
    ref: d,
    onComplete() {
      m.checked || x(!1);
    }
  });
  const S = {
    checked: m.checked,
    disabled: m.disabled,
    highlighted: m.highlighted,
    transitionStatus: v
  };
  return $e("span", o, {
    state: S,
    ref: [a, d],
    stateAttributesMapping: Gx,
    props: {
      "aria-hidden": !0,
      ...g
    },
    enabled: p || m.checked
  });
}), qx = /* @__PURE__ */ h.createContext(void 0);
function GM() {
  const n = h.useContext(qx);
  if (n === void 0)
    throw new Error(Ct(31));
  return n;
}
const qM = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    ...p
  } = o, [g, m] = h.useState(void 0), d = $e("div", o, {
    ref: a,
    props: {
      role: "group",
      "aria-labelledby": g,
      ...p
    }
  });
  return /* @__PURE__ */ b.jsx(qx.Provider, {
    value: m,
    children: d
  });
}), XM = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    id: p,
    ...g
  } = o, m = wn(p), d = GM();
  return we(() => (d(m), () => {
    d(void 0);
  }), [d, m]), $e("div", o, {
    ref: a,
    props: {
      id: m,
      role: "presentation",
      ...g
    }
  });
}), FM = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    id: f,
    label: p,
    nativeButton: g = !1,
    disabled: m = !1,
    closeOnClick: d = !0,
    style: v,
    ...x
  } = o, S = Ri({
    label: p
  }), C = xu(!0), E = wn(f), {
    store: M
  } = yl(), T = M.useState("isActive", S.index), z = M.useState("itemProps"), {
    getItemProps: w,
    itemRef: N
  } = vg({
    closeOnClick: d,
    disabled: m,
    highlighted: T,
    id: E,
    store: M,
    nativeButton: g,
    nodeId: C?.context.nodeId,
    itemMetadata: Yx
  });
  return $e("div", o, {
    state: {
      disabled: m,
      highlighted: T
    },
    props: [z, x, w],
    ref: [N, a, S.ref]
  });
}), KM = {
  ...Lo,
  ...Ho
}, QM = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    finalFocus: p,
    ...g
  } = o, {
    store: m
  } = yl(), {
    side: d,
    align: v
  } = xu(), x = eu() != null, S = m.useState("open"), C = m.useState("transitionStatus"), E = m.useState("popupProps"), M = m.useState("mounted"), T = m.useState("instantType"), z = m.useState("activeTriggerElement"), w = m.useState("parent"), N = m.useState("lastOpenChangeReason"), A = m.useState("rootId"), L = m.useState("floatingRootContext"), D = m.useState("floatingTreeRoot"), _ = m.useState("closeDelay"), j = m.useState("activeTriggerElement"), V = m.useState("hoverEnabled"), G = m.useState("disabled"), ne = m.useState("openMethod"), F = w.type === "context-menu";
  no({
    open: S,
    ref: m.context.popupRef,
    onComplete() {
      S && m.context.onOpenChangeComplete?.(!0);
    }
  }), h.useEffect(() => {
    function P(I) {
      m.setOpen(!1, Pe(I.reason, I.domEvent));
    }
    return D.events.on("close", P), () => {
      D.events.off("close", P);
    };
  }, [D.events, m]), ug(L, {
    enabled: V && !G && !F && w.type !== "menubar",
    closeDelay: _
  });
  const Q = h.useCallback((P) => {
    m.set("popupElement", P);
  }, [m]), Z = {
    transitionStatus: C,
    side: d,
    align: v,
    open: S,
    nested: w.type === "menu",
    instant: T
  }, q = $e("div", o, {
    state: Z,
    ref: [a, m.context.popupRef, Q],
    stateAttributesMapping: KM,
    props: [E, {
      onKeyDown(P) {
        x && Mi.has(P.key) && P.stopPropagation();
      }
    }, Ni(C), g, {
      "data-rootownerid": A
    }]
  });
  let k = w.type === void 0 || F;
  return (z || w.type === "menubar" && N !== Yc) && (k = !0), /* @__PURE__ */ b.jsx(nu, {
    context: L,
    openInteractionType: ne,
    modal: F,
    disabled: !M,
    returnFocus: p === void 0 ? k : p,
    initialFocus: w.type !== "menu",
    restoreFocus: !0,
    externalTree: w.type !== "menubar" ? D : void 0,
    previousFocusableElement: j,
    nextFocusableElement: w.type === void 0 ? m.context.triggerFocusTargetRef : void 0,
    beforeContentFocusGuardRef: w.type === void 0 ? m.context.beforeContentFocusGuardRef : void 0,
    children: q
  });
}), Xx = /* @__PURE__ */ h.createContext(void 0);
function ZM() {
  const n = h.useContext(Xx);
  if (n === void 0)
    throw new Error(Ct(32));
  return n;
}
const JM = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    keepMounted: i = !1,
    ...u
  } = o, {
    store: f
  } = yl();
  return f.useState("mounted") || i ? /* @__PURE__ */ b.jsx(Xx.Provider, {
    value: i,
    children: /* @__PURE__ */ b.jsx(tu, {
      ref: a,
      ...u
    })
  }) : null;
}), WM = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    anchor: i,
    positionMethod: u = "absolute",
    className: f,
    render: p,
    side: g,
    align: m,
    sideOffset: d = 0,
    alignOffset: v = 0,
    collisionBoundary: x = "clipping-ancestors",
    collisionPadding: S = 5,
    arrowPadding: C = 5,
    sticky: E = !1,
    disableAnchorTracking: M = !1,
    collisionAvoidance: T = G0,
    style: z,
    ...w
  } = o, {
    store: N
  } = yl(), A = ZM(), L = wu(!0), D = N.useState("parent"), _ = N.useState("floatingRootContext"), j = N.useState("floatingTreeRoot"), V = N.useState("mounted"), G = N.useState("open"), ne = N.useState("modal"), F = N.useState("openMethod"), Q = N.useState("activeTriggerElement"), Z = N.useState("transitionStatus"), q = N.useState("positionerElement"), k = N.useState("instantType"), P = N.useState("hasViewport"), I = N.useState("lastOpenChangeReason"), X = N.useState("floatingNodeId"), B = N.useState("floatingParentNodeId"), O = _.useState("domReferenceElement"), H = h.useRef(null), ee = tg(q, !1, !1);
  let J = i, le = d, ie = v, re = m, se = T;
  D.type === "context-menu" && (J = i ?? D.context?.anchor, re = re ?? "start", !g && re !== "center" && (ie = o.alignOffset ?? 2, le = o.sideOffset ?? -5));
  let ge = g, De = re;
  D.type === "menu" ? (ge = ge ?? "inline-end", De = De ?? "start", se = o.collisionAvoidance ?? Kp) : D.type === "menubar" && (ge = ge ?? (D.context.orientation === "vertical" ? "inline-end" : "bottom"), De = De ?? "start");
  const Ee = D.type === "context-menu", ue = yu({
    anchor: J,
    floatingRootContext: _,
    positionMethod: L ? "fixed" : u,
    mounted: V,
    side: ge,
    sideOffset: le,
    align: De,
    alignOffset: ie,
    arrowPadding: Ee ? 0 : C,
    collisionBoundary: x,
    collisionPadding: S,
    sticky: E,
    nodeId: X,
    keepMounted: A,
    disableAnchorTracking: M,
    collisionAvoidance: se,
    shiftCrossAxis: Ee && !("side" in se && se.side === "flip"),
    externalTree: j,
    adaptiveOrigin: P ? gg : void 0
  });
  h.useEffect(() => {
    function Se(Re) {
      Re.open && (Re.parentNodeId === X && N.set("hoverEnabled", !1), Re.nodeId !== X && Re.parentNodeId === N.select("floatingParentNodeId") && N.setOpen(!1, Pe(ci)));
    }
    return j.events.on("menuopenchange", Se), () => {
      j.events.off("menuopenchange", Se);
    };
  }, [N, j.events, X]), h.useEffect(() => {
    if (N.select("floatingParentNodeId") == null)
      return;
    function Se(Re) {
      if (Re.open || Re.nodeId !== N.select("floatingParentNodeId"))
        return;
      const Oe = Re.reason ?? ci;
      N.setOpen(!1, Pe(Oe));
    }
    return j.events.on("menuopenchange", Se), () => {
      j.events.off("menuopenchange", Se);
    };
  }, [j.events, N]);
  const he = sn();
  h.useEffect(() => {
    G || he.clear();
  }, [G, he]), h.useEffect(() => {
    function Se(Re) {
      if (!(!G || Re.nodeId !== N.select("floatingParentNodeId")))
        if (Re.target && Q && Q !== Re.target) {
          const Oe = N.select("closeDelay");
          Oe > 0 ? he.isStarted() || he.start(Oe, () => {
            N.setOpen(!1, Pe(ci));
          }) : N.setOpen(!1, Pe(ci));
        } else
          he.clear();
    }
    return j.events.on("itemhover", Se), () => {
      j.events.off("itemhover", Se);
    };
  }, [j.events, G, Q, N, he]), h.useEffect(() => {
    const Se = {
      open: G,
      nodeId: X,
      parentNodeId: B,
      reason: N.select("lastOpenChangeReason")
    };
    j.events.emit("menuopenchange", Se);
  }, [j.events, G, N, X, B]), we(() => {
    const Se = O, Re = H.current;
    if (Se && (H.current = Se), Re && Se && Se !== Re) {
      N.set("instantType", void 0);
      const Oe = new AbortController();
      return ee(() => {
        N.set("instantType", "trigger-change");
      }, Oe.signal), () => {
        Oe.abort();
      };
    }
  }, [O, ee, N]);
  const ye = {
    open: G,
    side: ue.side,
    align: ue.align,
    anchorHidden: ue.anchorHidden,
    nested: D.type === "menu",
    instant: k
  }, je = D.type === "menubar" && D.context.modal;
  mg(G && (je || ne && I !== Pt), F === "touch", q, Q);
  const Te = bu(o, ye, {
    styles: ue.positionerStyles,
    transitionStatus: Z,
    props: w,
    refs: [a, N.useStateSetter("positionerElement")],
    hidden: !V,
    inert: !G
  }), Ce = V && D.type !== "menu" && (D.type !== "menubar" && ne && I !== Pt || D.type === "menubar" && D.context.modal);
  let ve = null;
  return D.type === "menubar" ? ve = D.context.contentElement : D.type === void 0 && (ve = Q), /* @__PURE__ */ b.jsxs(Ix.Provider, {
    value: ue,
    children: [Ce && /* @__PURE__ */ b.jsx(vu, {
      ref: D.type === "context-menu" || D.type === "nested-context-menu" ? D.context.internalBackdropRef : null,
      inert: hu(!G),
      cutout: ve
    }), /* @__PURE__ */ b.jsx(J0, {
      id: X,
      children: /* @__PURE__ */ b.jsx(Hp, {
        elementsRef: N.context.itemDomElements,
        labelsRef: N.context.itemLabels,
        children: Te
      })
    })]
  });
}), $M = /* @__PURE__ */ h.createContext(null);
function Fx(n) {
  return h.useContext($M);
}
const e2 = {
  ...du,
  disabled: me((n) => n.parent.type === "menubar" && n.parent.context.disabled || n.disabled),
  modal: me((n) => (n.parent.type === void 0 || n.parent.type === "context-menu") && (n.modal ?? !0)),
  openMethod: me((n) => n.openMethod),
  allowMouseEnter: me((n) => n.allowMouseEnter),
  highlightItemOnHover: me((n) => n.highlightItemOnHover),
  stickIfOpen: me((n) => n.stickIfOpen),
  parent: me((n) => n.parent),
  rootId: me((n) => n.parent.type === "menu" ? n.parent.store.select("rootId") : n.parent.type !== void 0 ? n.parent.context.rootId : n.rootId),
  activeIndex: me((n) => n.activeIndex),
  isActive: me((n, o) => n.activeIndex === o),
  hoverEnabled: me((n) => n.hoverEnabled),
  instantType: me((n) => n.instantType),
  lastOpenChangeReason: me((n) => n.openChangeReason),
  floatingTreeRoot: me((n) => n.parent.type === "menu" ? n.parent.store.select("floatingTreeRoot") : n.floatingTreeRoot),
  floatingNodeId: me((n) => n.floatingNodeId),
  floatingParentNodeId: me((n) => n.floatingParentNodeId),
  itemProps: me((n) => n.itemProps),
  closeDelay: me((n) => n.closeDelay),
  hasViewport: me((n) => n.hasViewport),
  keyboardEventRelay: me((n) => {
    if (n.keyboardEventRelay)
      return n.keyboardEventRelay;
    if (n.parent.type === "menu")
      return n.parent.store.select("keyboardEventRelay");
  })
};
class bg extends zi {
  constructor(o) {
    super({
      ...t2(),
      ...o
    }, {
      positionerRef: /* @__PURE__ */ h.createRef(),
      popupRef: /* @__PURE__ */ h.createRef(),
      typingRef: {
        current: !1
      },
      itemDomElements: {
        current: []
      },
      itemLabels: {
        current: []
      },
      allowMouseUpTriggerRef: {
        current: !1
      },
      triggerFocusTargetRef: /* @__PURE__ */ h.createRef(),
      beforeContentFocusGuardRef: /* @__PURE__ */ h.createRef(),
      onOpenChangeComplete: void 0,
      triggerElements: new da()
    }, e2), this.unsubscribeParentListener = this.observe("parent", (a) => {
      if (this.unsubscribeParentListener?.(), a.type === "menu") {
        let i = a.store.select("rootId"), u = a.store.select("floatingTreeRoot"), f = a.store.select("keyboardEventRelay");
        this.unsubscribeParentListener = a.store.subscribe(() => {
          const p = a.store.select("rootId"), g = a.store.select("floatingTreeRoot"), m = a.store.select("keyboardEventRelay");
          i === p && u === g && f === m || (i = p, u = g, f = m, this.notifyAll());
        }), this.context.allowMouseUpTriggerRef = a.store.context.allowMouseUpTriggerRef;
        return;
      }
      a.type !== void 0 && (this.context.allowMouseUpTriggerRef = a.context.allowMouseUpTriggerRef), this.unsubscribeParentListener = null;
    });
  }
  setOpen(o, a) {
    this.state.floatingRootContext.context.events.emit("setOpen", {
      open: o,
      eventDetails: a
    });
  }
  static useStore(o, a) {
    const i = xn(() => new bg(a)).current;
    return o ?? i;
  }
  unsubscribeParentListener = null;
}
function t2() {
  return {
    ...fu(),
    disabled: !1,
    modal: !0,
    openMethod: null,
    allowMouseEnter: !1,
    highlightItemOnHover: !0,
    stickIfOpen: !0,
    parent: {
      type: void 0
    },
    rootId: void 0,
    activeIndex: null,
    hoverEnabled: !0,
    instantType: void 0,
    openChangeReason: null,
    floatingTreeRoot: new Qp(),
    floatingNodeId: void 0,
    floatingParentNodeId: null,
    itemProps: mt,
    keyboardEventRelay: void 0,
    closeDelay: 0,
    hasViewport: !1
  };
}
const Kx = /* @__PURE__ */ h.createContext(void 0);
function Qx() {
  return h.useContext(Kx);
}
const Zx = eg(function(o) {
  const {
    children: a,
    open: i,
    onOpenChange: u,
    onOpenChangeComplete: f,
    defaultOpen: p = !1,
    disabled: g = !1,
    modal: m,
    loopFocus: d = !0,
    orientation: v = "vertical",
    actionsRef: x,
    closeParentOnEsc: S = !1,
    handle: C,
    triggerId: E,
    defaultTriggerId: M = null,
    highlightItemOnHover: T = !0
  } = o, z = wu(!0), w = yl(!0), N = Fx(!0), A = Qx(), L = h.useMemo(() => A && w ? {
    type: "menu",
    store: w.store
  } : N ? {
    type: "menubar",
    context: N
  } : z && !w ? {
    type: "context-menu",
    context: z
  } : {
    type: void 0
  }, [z, w, N, A]), D = bg.useStore(C?.store, {
    open: p,
    openProp: i,
    activeTriggerId: M,
    triggerIdProp: E,
    parent: L
  });
  og(D, i, p, M), D.useControlledProp("openProp", i), D.useControlledProp("triggerIdProp", E), D.useContextCallback("onOpenChangeComplete", f);
  const _ = cr(), j = cr(), V = D.useState("floatingTreeRoot"), G = Zp(V), ne = to(), F = D.useState("open"), Q = D.useState("activeTriggerElement"), Z = D.useState("positionerElement"), q = D.useState("hoverEnabled"), k = D.useState("disabled"), P = D.useState("lastOpenChangeReason"), I = D.useState("parent"), X = D.useState("activeIndex"), B = D.useState("payload"), O = D.useState("floatingParentNodeId"), H = h.useRef(null), ee = h.useRef(I.type !== "context-menu"), J = sn(), le = h.useRef(!0), ie = sn(), re = O != null, {
    openMethod: se,
    triggerProps: ge
  } = Tx(F);
  D.useSyncedValues({
    disabled: g,
    highlightItemOnHover: T,
    modal: I.type === void 0 ? m : void 0,
    openMethod: se,
    rootId: _
  }), su(D);
  const {
    forceUnmount: De
  } = cu(F, D, () => {
    D.update({
      allowMouseEnter: !1,
      stickIfOpen: !0
    });
  });
  we(() => {
    z && !w ? D.update({
      parent: {
        type: "context-menu",
        context: z
      },
      floatingNodeId: G,
      floatingParentNodeId: ne
    }) : w && D.update({
      floatingNodeId: G,
      floatingParentNodeId: ne
    });
  }, [z, w, G, ne, D]), h.useEffect(() => {
    if (F || (H.current = null), I.type === "context-menu") {
      if (!F) {
        J.clear(), ee.current = !1;
        return;
      }
      J.start(500, () => {
        ee.current = !0;
      });
    }
  }, [J, F, I.type]), we(() => {
    !F && !q && D.set("hoverEnabled", !0);
  }, [F, q, D]);
  const Ee = ze((xe, et) => {
    const rt = et.reason;
    if (F === xe && et.trigger === Q && P === rt)
      return;
    const pt = lg(et);
    if (!xe && et.trigger == null && (et.trigger = Q ?? void 0), u?.(xe, et), et.isCanceled)
      return;
    D.state.floatingRootContext.dispatchOpenChange(xe, et);
    const Nt = et.event;
    if (xe === !1 && Nt?.type === "click" && Nt.pointerType === "touch" && !le.current)
      return;
    xe && rt === ta ? (le.current = !1, ie.start(300, () => {
      le.current = !0;
    })) : (le.current = !0, ie.clear());
    const tt = (rt === Zl || rt === na) && Nt.detail === 0 && Nt?.isTrusted, gt = !xe && (rt === Ci || rt == null), zt = {
      open: xe,
      openChangeReason: rt
    };
    H.current = et.event ?? null, iu(zt, xe, et.trigger, pt()), D.update(zt), I.type === "menubar" && (rt === ta || rt === Ao || rt === Pt || rt === ap || rt === ci) ? D.set("instantType", "group") : tt || gt ? D.set("instantType", tt ? "click" : "dismiss") : D.set("instantType", void 0);
  }), ue = fx({
    popupStore: D,
    floatingId: j,
    nested: ne != null,
    onOpenChange: Ee
  }), he = ue.context.events;
  h.useEffect(() => {
    const xe = ({
      open: et,
      eventDetails: rt
    }) => Ee(et, rt);
    return he.on("setOpen", xe), () => {
      he?.off("setOpen", xe);
    };
  }, [he, Ee]);
  const ye = h.useCallback(() => {
    D.setOpen(!1, Pe(Gc));
  }, [D]);
  h.useImperativeHandle(x, () => ({
    unmount: De,
    close: ye
  }), [De, ye]);
  let je;
  I.type === "context-menu" && (je = I.context), h.useImperativeHandle(je?.positionerRef, () => Z, [Z]), h.useImperativeHandle(je?.actionsRef, () => ({
    setOpen: Ee
  }), [Ee]);
  const ke = Ai(ue, {
    enabled: !k,
    bubbles: {
      escapeKey: S && I.type === "menu"
    },
    outsidePress() {
      return I.type !== "context-menu" || H.current?.type === "contextmenu" ? !0 : ee.current;
    },
    externalTree: re ? V : void 0
  }), Te = $c(), Ce = h.useCallback((xe) => {
    D.select("activeIndex") !== xe && D.set("activeIndex", xe);
  }, [D]), ve = bx(ue, {
    enabled: !k,
    listRef: D.context.itemDomElements,
    activeIndex: X,
    nested: I.type !== void 0,
    loopFocus: d,
    orientation: v,
    parentOrientation: I.type === "menubar" ? I.context.orientation : void 0,
    rtl: Te === "rtl",
    disabledIndices: Ql,
    onNavigate: Ce,
    openOnArrowKeyDown: I.type !== "context-menu",
    externalTree: re ? V : void 0,
    focusItemOnHover: T
  }), Se = h.useCallback((xe) => {
    D.context.typingRef.current = xe;
  }, [D]), Re = xx(ue, {
    enabled: !k,
    listRef: D.context.itemLabels,
    elementsRef: D.context.itemDomElements,
    activeIndex: X,
    resetMs: uC,
    onMatch: (xe) => {
      F && xe !== X && D.set("activeIndex", xe);
    },
    onTyping: Se
  }), Oe = h.useMemo(() => {
    const xe = yn(Re.reference, ve.reference, ke.reference, {
      onMouseMove() {
        D.set("allowMouseEnter", !0);
      }
    }, ge);
    return xe["aria-haspopup"] = "menu", xe["aria-expanded"] = F, xe;
  }, [D, Re.reference, ve.reference, ke.reference, ge, F]), He = h.useMemo(() => {
    const xe = yn(ve.trigger, ke.trigger, ge);
    return xe["aria-haspopup"] = "menu", xe["aria-expanded"] = !1, xe;
  }, [ve.trigger, ke.trigger, ge]), ae = h.useMemo(() => yn(fa, {
    id: j,
    role: "menu",
    "aria-labelledby": Q?.id,
    onMouseMove() {
      D.set("allowMouseEnter", !0), I.type === "menu" && D.set("hoverEnabled", !1);
    },
    onClick() {
      D.select("hoverEnabled") && D.set("hoverEnabled", !1);
    },
    onKeyDown(xe) {
      const et = D.select("keyboardEventRelay");
      et && !xe.isPropagationStopped() && et(xe);
    }
  }, Re.floating, ve.floating, ke.floating), [Q, j, I.type, D, Re.floating, ve.floating, ke.floating]), pe = ve.item ?? mt;
  uu(D, {
    floatingRootContext: ue,
    activeTriggerProps: Oe,
    inactiveTriggerProps: He,
    popupProps: ae,
    itemProps: pe
  });
  const Le = h.useMemo(() => ({
    store: D,
    parent: L
  }), [D, L]), be = /* @__PURE__ */ b.jsx(Vx.Provider, {
    value: Le,
    children: typeof a == "function" ? a({
      payload: B
    }) : a
  });
  return I.type === void 0 || I.type === "context-menu" ? /* @__PURE__ */ b.jsx(W0, {
    externalTree: V,
    children: be
  }) : be;
});
function n2(n) {
  const o = yl().store, a = h.useMemo(() => ({
    parentMenu: o
  }), [o]);
  return /* @__PURE__ */ b.jsx(Kx.Provider, {
    value: a,
    children: /* @__PURE__ */ b.jsx(Zx, {
      ...n
    })
  });
}
function Jx(n) {
  const o = n.getBoundingClientRect(), a = At(n);
  if (Up)
    return o;
  const i = a.getComputedStyle(n, "::before"), u = a.getComputedStyle(n, "::after");
  if (!(i.content !== "none" || u.content !== "none"))
    return o;
  const p = parseFloat(i.width) || 0, g = parseFloat(i.height) || 0, m = parseFloat(u.width) || 0, d = parseFloat(u.height) || 0, v = Math.max(o.width, p, m), x = Math.max(o.height, g, d), S = v - o.width, C = x - o.height;
  return {
    left: o.left - S / 2,
    right: o.right + S / 2,
    top: o.top - C / 2,
    bottom: o.bottom + C / 2
  };
}
function Wx(n) {
  if (Rt(n) && n.hasAttribute("data-rootownerid"))
    return n.getAttribute("data-rootownerid") ?? void 0;
  if (!Gl(n))
    return Wx(Fl(n));
}
function l2(n) {
  const {
    enabled: o = !0,
    mouseDownAction: a,
    open: i
  } = n, u = h.useRef(!1);
  return h.useMemo(() => o ? {
    onMouseDown: (f) => {
      (a === "open" && !i || a === "close" && i) && (u.current = !0, nt(f.currentTarget).addEventListener("click", () => {
        u.current = !1;
      }, {
        once: !0
      }));
    },
    onClick: (f) => {
      u.current && (u.current = !1, f.preventBaseUIHandler());
    }
  } : mt, [o, a, i]);
}
const oc = 2, o2 = cx(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    disabled: p = !1,
    nativeButton: g = !0,
    id: m,
    openOnHover: d,
    delay: v = 100,
    closeDelay: x = 0,
    handle: S,
    payload: C,
    ...E
  } = o, M = yl(!0), T = S?.store ?? M?.store;
  if (!T)
    throw new Error(Ct(85));
  const z = wn(m), w = T.useState("isTriggerActive", z), N = T.useState("floatingRootContext"), A = T.useState("isOpenedByTrigger", z), L = T.useState("triggerPopupId", z), D = h.useRef(null), _ = a2(), j = jp(!0), V = _o(), G = h.useMemo(() => V ?? new Qp(), [V]), ne = Zp(G), F = to(), {
    registerTrigger: Q,
    isMountedByThisTrigger: Z
  } = rg(z, D, T, {
    payload: C,
    closeDelay: x,
    parent: _,
    floatingTreeRoot: G,
    floatingNodeId: ne,
    floatingParentNodeId: F,
    keyboardEventRelay: j?.relayKeyboardEvent
  }), q = _.type === "menubar", k = T.useState("disabled"), P = p || k || q && _.context.disabled, {
    getButtonProps: I,
    buttonRef: X
  } = $l({
    disabled: P,
    native: g
  });
  h.useEffect(() => {
    !A && _.type === void 0 && (T.context.allowMouseUpTriggerRef.current = !1);
  }, [T, A, _.type]);
  const B = h.useRef(null), O = sn(), H = ze((ve) => {
    if (!B.current)
      return;
    O.clear(), T.context.allowMouseUpTriggerRef.current = !1;
    const Se = ve.target;
    if (Ue(B.current, Se) || Ue(T.select("positionerElement"), Se) || Se === B.current || Se != null && Wx(Se) === T.select("rootId"))
      return;
    const Re = Jx(B.current);
    ve.clientX >= Re.left - oc && ve.clientX <= Re.right + oc && ve.clientY >= Re.top - oc && ve.clientY <= Re.bottom + oc || G.events.emit("close", {
      domEvent: ve,
      reason: h0
    });
  });
  h.useEffect(() => {
    A && T.select("lastOpenChangeReason") === Pt && nt(B.current).addEventListener("mouseup", H, {
      once: !0
    });
  }, [A, H, T]);
  const ee = q && _.context.hasSubmenuOpen, le = pu(N, {
    enabled: (d ?? ee) && !P && _.type !== "context-menu" && (!q || ee && !Z),
    handleClose: mu({
      blockPointerEvents: !q
    }),
    mouseOnly: !0,
    move: !1,
    restMs: _.type === void 0 ? v : void 0,
    delay: {
      close: x
    },
    triggerElementRef: D,
    externalTree: G,
    isActiveTrigger: w,
    isClosing: () => T.select("transitionStatus") === "ending"
  }), ie = r2(A, T.select("lastOpenChangeReason")), re = lu(N, {
    enabled: !P && _.type !== "context-menu",
    event: A && q ? "click" : "mousedown",
    toggle: !0,
    ignoreMouse: !1,
    stickIfOpen: _.type === void 0 ? ie : !1
  }), se = yx(N, {
    enabled: !P && ee
  }), ge = l2({
    open: A,
    enabled: q,
    mouseDownAction: "open"
  }), De = h.useMemo(() => yn(se.reference, re.reference), [se.reference, re.reference]), Ee = T.useState("triggerProps", Z), {
    preFocusGuardRef: ue,
    handlePreFocusGuardFocus: he,
    handleFocusTargetFocus: ye
  } = Sx(T, D), je = {
    disabled: P,
    open: A
  }, ke = [B, a, X, Q, D], Te = [De, le ?? mt, Ee, {
    "aria-haspopup": "menu",
    "aria-controls": L,
    id: z,
    onMouseDown: (ve) => {
      if (T.select("open"))
        return;
      O.start(200, () => {
        T.context.allowMouseUpTriggerRef.current = !0;
      }), nt(ve.currentTarget).addEventListener("mouseup", H, {
        once: !0
      });
    }
  }, q ? {
    role: "menuitem"
  } : {}, ge, E, I], Ce = $e("button", o, {
    enabled: !q,
    stateAttributesMapping: Uc,
    state: je,
    ref: ke,
    props: Te
  });
  return q ? /* @__PURE__ */ b.jsx(g0, {
    tag: "button",
    render: i,
    className: u,
    style: f,
    state: je,
    refs: ke,
    props: Te,
    stateAttributesMapping: Uc
  }) : A ? /* @__PURE__ */ b.jsxs(h.Fragment, {
    children: [/* @__PURE__ */ b.jsx(No, {
      ref: ue,
      onFocus: he
    }, `${z}-pre-focus-guard`), /* @__PURE__ */ b.jsx(h.Fragment, {
      children: Ce
    }, z), /* @__PURE__ */ b.jsx(No, {
      ref: T.context.triggerFocusTargetRef,
      onFocus: ye
    }, `${z}-post-focus-guard`)]
  }) : /* @__PURE__ */ b.jsx(h.Fragment, {
    children: Ce
  }, z);
});
function r2(n, o) {
  const a = sn(), [i, u] = h.useState(!1);
  return we(() => {
    n && o === "trigger-hover" ? (u(!0), a.start(P0, () => {
      u(!1);
    })) : n || (a.clear(), u(!1));
  }, [n, o, a]), i;
}
function a2() {
  const n = wu(!0), o = yl(!0), a = Fx();
  return h.useMemo(() => a ? {
    type: "menubar",
    context: a
  } : n && !o ? {
    type: "context-menu",
    context: n
  } : {
    type: void 0
  }, [n, o, a]);
}
const $x = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    className: i,
    render: u,
    orientation: f = "horizontal",
    style: p,
    ...g
  } = o;
  return $e("div", o, {
    state: {
      orientation: f
    },
    ref: a,
    props: [{
      role: "separator",
      "aria-orientation": f
    }, g]
  });
}), i2 = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    label: p,
    id: g,
    nativeButton: m = !1,
    openOnHover: d = !0,
    delay: v = 100,
    closeDelay: x = 0,
    disabled: S = !1,
    ...C
  } = o, E = Ri({
    label: p
  }), M = xu(), {
    store: T
  } = yl(), z = wn(g), w = T.useState("open"), N = T.useState("floatingRootContext"), A = T.useState("floatingTreeRoot"), L = T.useState("triggerPopupId", z), D = px(z, T), _ = h.useCallback((re) => {
    const se = D(re);
    return re !== null && T.select("open") && T.select("activeTriggerId") == null && T.update({
      activeTriggerId: z,
      activeTriggerElement: re,
      closeDelay: x
    }), se;
  }, [D, x, T, z]), j = h.useRef(null), V = h.useCallback((re) => {
    j.current = re, T.set("activeTriggerElement", re);
  }, [T]), G = Qx();
  if (!G?.parentMenu)
    throw new Error(Ct(37));
  T.useSyncedValue("closeDelay", x);
  const ne = G.parentMenu, F = T.useState("disabled"), Q = ne.useState("disabled"), Z = S || F || Q, q = ne.useState("itemProps"), k = ne.useState("isActive", E.index), P = h.useMemo(() => ({
    type: "submenu-trigger",
    setActive() {
      ne.select("highlightItemOnHover") && ne.set("activeIndex", E.index);
    }
  }), [ne, E.index]), {
    getItemProps: I,
    itemRef: X
  } = vg({
    closeOnClick: !1,
    disabled: Z,
    highlighted: k,
    id: z,
    store: T,
    typingRef: ne.context.typingRef,
    nativeButton: m,
    itemMetadata: P,
    nodeId: M?.context.nodeId
  }), B = T.useState("hoverEnabled"), O = pu(N, {
    enabled: B && d && !Z,
    handleClose: mu({
      blockPointerEvents: !0
    }),
    mouseOnly: !0,
    move: !0,
    restMs: v,
    delay: {
      open: v,
      close: x
    },
    shouldOpen: v > 0 ? () => ne.select("allowMouseEnter") : void 0,
    triggerElementRef: j,
    externalTree: A,
    isClosing: () => T.select("transitionStatus") === "ending"
  }), ee = lu(N, {
    enabled: !Z,
    event: "mousedown",
    toggle: !d,
    ignoreMouse: d,
    stickIfOpen: !1
  }).reference ?? mt, J = T.useState("triggerProps", !0);
  return delete J.id, $e("div", o, {
    state: {
      disabled: Z,
      highlighted: k,
      open: w
    },
    stateAttributesMapping: dg,
    props: [ee, O, J, q, {
      "aria-controls": L,
      tabIndex: w || k ? 0 : -1,
      onBlur() {
        k && ne.set("activeIndex", null);
      }
    }, C, I],
    ref: [a, E.ref, X, _, V]
  });
});
function vc({ ...n }) {
  return /* @__PURE__ */ b.jsx(Zx, { "data-slot": "dropdown-menu", ...n });
}
function bc({ ...n }) {
  return /* @__PURE__ */ b.jsx(o2, { "data-slot": "dropdown-menu-trigger", ...n });
}
function yi({
  align: n = "start",
  alignOffset: o = 0,
  side: a = "bottom",
  sideOffset: i = 4,
  className: u,
  ...f
}) {
  return /* @__PURE__ */ b.jsx(JM, { children: /* @__PURE__ */ b.jsx(
    WM,
    {
      className: "tw:isolate tw:z-[var(--z-popover)] tw:outline-none",
      align: n,
      alignOffset: o,
      side: a,
      sideOffset: i,
      children: /* @__PURE__ */ b.jsx(
        QM,
        {
          "data-slot": "dropdown-menu-content",
          className: Fe("tw:max-h-(--available-height) tw:min-w-32 tw:max-w-72 tw:origin-(--transform-origin) tw:overflow-x-hidden tw:overflow-y-auto tw:rounded-[var(--radius-surface)] tw:bg-popover tw:p-1 tw:text-[length:var(--fs-body-s)] tw:text-popover-foreground tw:shadow-[var(--elevation-overlay)] tw:ring-1 tw:ring-foreground/10 tw:outline-none", u),
          ...f
        }
      )
    }
  ) });
}
function Bn({ ...n }) {
  return /* @__PURE__ */ b.jsx(qM, { "data-slot": "dropdown-menu-group", ...n });
}
function bp({
  className: n,
  inset: o,
  ...a
}) {
  return /* @__PURE__ */ b.jsx(
    XM,
    {
      "data-slot": "dropdown-menu-label",
      "data-inset": o,
      className: Fe(
        "tw:px-1.5 tw:py-1 tw:text-[length:var(--fs-caption)] tw:font-medium tw:text-muted-foreground tw:data-inset:pl-7",
        n
      ),
      ...a
    }
  );
}
function al({
  className: n,
  inset: o,
  variant: a = "default",
  ...i
}) {
  return /* @__PURE__ */ b.jsx(
    FM,
    {
      "data-slot": "dropdown-menu-item",
      "data-inset": o,
      "data-variant": a,
      className: Fe(
        "tw:group/dropdown-menu-item tw:relative tw:flex tw:cursor-default tw:items-center tw:gap-1.5 tw:overflow-hidden tw:rounded-[var(--radius-control)] tw:px-1.5 tw:py-1 tw:text-[length:var(--fs-body-s)] tw:text-ellipsis tw:whitespace-nowrap tw:outline-hidden tw:select-none tw:focus:bg-accent tw:focus:text-accent-foreground tw:not-data-[variant=destructive]:focus:**:text-accent-foreground tw:data-inset:pl-7 tw:data-[variant=destructive]:text-destructive tw:data-[variant=destructive]:focus:bg-destructive/10 tw:data-[variant=destructive]:focus:text-destructive tw:data-disabled:pointer-events-none tw:data-disabled:opacity-50 tw:[&_svg]:pointer-events-none tw:[&_svg]:shrink-0 tw:[&_svg:not([class*=size-])]:size-4 tw:data-[variant=destructive]:*:[svg]:text-destructive",
        n
      ),
      ...i
    }
  );
}
function ew({ ...n }) {
  return /* @__PURE__ */ b.jsx(n2, { "data-slot": "dropdown-menu-sub", ...n });
}
function tw({
  className: n,
  inset: o,
  children: a,
  ...i
}) {
  return /* @__PURE__ */ b.jsxs(
    i2,
    {
      "data-slot": "dropdown-menu-sub-trigger",
      "data-inset": o,
      className: Fe(
        "tw:flex tw:cursor-default tw:items-center tw:gap-1.5 tw:rounded-[var(--radius-control)] tw:px-1.5 tw:py-1 tw:text-[length:var(--fs-body-s)] tw:outline-hidden tw:select-none tw:focus:bg-accent tw:focus:text-accent-foreground tw:not-data-[variant=destructive]:focus:**:text-accent-foreground tw:data-inset:pl-7 tw:data-popup-open:bg-accent tw:data-popup-open:text-accent-foreground tw:data-open:bg-accent tw:data-open:text-accent-foreground tw:[&_svg]:pointer-events-none tw:[&_svg]:shrink-0 tw:[&_svg:not([class*=size-])]:size-4",
        n
      ),
      ...i,
      children: [
        a,
        /* @__PURE__ */ b.jsx(tE, { className: "tw:ml-auto" })
      ]
    }
  );
}
function nw({
  align: n = "start",
  alignOffset: o = -3,
  side: a = "right",
  sideOffset: i = 0,
  className: u,
  ...f
}) {
  return /* @__PURE__ */ b.jsx(
    yi,
    {
      "data-slot": "dropdown-menu-sub-content",
      className: Fe("tw:w-auto tw:min-w-[96px] tw:rounded-[var(--radius-surface)] tw:bg-popover tw:p-1 tw:text-popover-foreground tw:shadow-[var(--elevation-overlay)] tw:ring-1 tw:ring-foreground/10", u),
      align: n,
      alignOffset: o,
      side: a,
      sideOffset: i,
      ...f
    }
  );
}
function xc({
  className: n,
  children: o,
  checked: a,
  inset: i,
  ...u
}) {
  return /* @__PURE__ */ b.jsxs(
    PM,
    {
      "data-slot": "dropdown-menu-checkbox-item",
      "data-inset": i,
      className: Fe(
        "tw:relative tw:flex tw:cursor-default tw:items-center tw:gap-1.5 tw:rounded-[var(--radius-control)] tw:py-1 tw:pr-8 tw:pl-1.5 tw:text-[length:var(--fs-body-s)] tw:outline-hidden tw:select-none tw:focus:bg-accent tw:focus:text-accent-foreground tw:focus:**:text-accent-foreground tw:data-inset:pl-7 tw:data-disabled:pointer-events-none tw:data-disabled:opacity-50 tw:[&_svg]:pointer-events-none tw:[&_svg]:shrink-0 tw:[&_svg:not([class*=size-])]:size-4",
        n
      ),
      checked: a,
      ...u,
      children: [
        /* @__PURE__ */ b.jsx(
          "span",
          {
            className: "tw:pointer-events-none tw:absolute tw:right-2 tw:flex tw:items-center tw:justify-center",
            "data-slot": "dropdown-menu-checkbox-item-indicator",
            children: /* @__PURE__ */ b.jsx(YM, { children: /* @__PURE__ */ b.jsx(
              Hb,
              {}
            ) })
          }
        ),
        o
      ]
    }
  );
}
function rr({
  className: n,
  ...o
}) {
  return /* @__PURE__ */ b.jsx(
    $x,
    {
      "data-slot": "dropdown-menu-separator",
      className: Fe("tw:-mx-1 tw:my-1 tw:h-px tw:bg-border", n),
      ...o
    }
  );
}
function s2(n) {
  const o = (a) => /* @__PURE__ */ b.jsxs(h.Fragment, { children: [
    a.separatorBefore && /* @__PURE__ */ b.jsx(rr, {}),
    a.children?.length ? /* @__PURE__ */ b.jsxs(ew, { children: [
      /* @__PURE__ */ b.jsx(tw, { disabled: a.disabled, className: a.className, children: a.label }),
      /* @__PURE__ */ b.jsx(nw, { children: /* @__PURE__ */ b.jsx(Bn, { children: a.children.map(o) }) })
    ] }) : a.checked !== void 0 ? /* @__PURE__ */ b.jsx(
      xc,
      {
        checked: a.checked,
        closeOnClick: a.keepOpen === !1,
        disabled: a.disabled,
        className: a.className,
        onCheckedChange: a.onSelect,
        children: a.label
      }
    ) : /* @__PURE__ */ b.jsx(
      al,
      {
        variant: a.destructive ? "destructive" : "default",
        closeOnClick: a.keepOpen !== !0,
        disabled: a.disabled,
        className: a.className,
        onClick: a.onSelect,
        children: a.label
      }
    )
  ] }, a.key);
  return /* @__PURE__ */ b.jsxs(vc, { open: n.open, onOpenChange: n.onOpenChange, children: [
    /* @__PURE__ */ b.jsx(bc, { ref: n.triggerRef, render: n.trigger }),
    /* @__PURE__ */ b.jsxs(
      yi,
      {
        align: n.align,
        side: n.side,
        sideOffset: n.sideOffset ?? 4,
        "aria-label": n.label,
        className: n.className,
        children: [
          n.header && /* @__PURE__ */ b.jsx(Bn, { children: /* @__PURE__ */ b.jsx(bp, { children: n.header }) }),
          n.groups?.length ? n.groups.map((a) => /* @__PURE__ */ b.jsxs(h.Fragment, { children: [
            a.separatorBefore && /* @__PURE__ */ b.jsx(rr, {}),
            /* @__PURE__ */ b.jsxs(Bn, { children: [
              a.label && /* @__PURE__ */ b.jsx(bp, { children: a.label }),
              a.items.map(o)
            ] })
          ] }, a.key)) : /* @__PURE__ */ b.jsx(Bn, { children: (n.items ?? []).map(o) }),
          n.footer && /* @__PURE__ */ b.jsx("div", { className: "dropdown-surface-footer", children: n.footer })
        ]
      }
    )
  ] });
}
function c2({ state: n, onSelect: o, onManage: a }) {
  const [i, u] = h.useState(!1);
  return /* @__PURE__ */ b.jsx(
    s2,
    {
      open: i,
      onOpenChange: u,
      align: "start",
      className: "project-folder-menu",
      label: n.label,
      trigger: /* @__PURE__ */ b.jsxs(
        UM,
        {
          variant: "ghost",
          size: "sm",
          "data-project-folder-menu": !0,
          "aria-label": n.label,
          title: n.folders.find((f) => f.path === n.selected)?.name || n.label,
          style: { maxWidth: 180, minWidth: 0 },
          children: [
            /* @__PURE__ */ b.jsx(oE, { "aria-hidden": "true" }),
            /* @__PURE__ */ b.jsx(Lb, { "aria-hidden": "true", size: 12 })
          ]
        }
      ),
      items: [
        ...n.folders.map((f) => ({
          key: f.path,
          label: f.name,
          checked: n.selected === f.path,
          onSelect: () => {
            u(!1), o(f.path);
          }
        })),
        {
          key: "manage",
          separatorBefore: !0,
          label: `${n.manageLabel}…`,
          onSelect: () => {
            u(!1), requestAnimationFrame(a);
          }
        }
      ]
    }
  );
}
var $d = { exports: {} }, ii = {}, ep = { exports: {} }, tp = {};
var Tb;
function u2() {
  return Tb || (Tb = 1, (function(n) {
    function o(k, P) {
      var I = k.length;
      k.push(P);
      e: for (; 0 < I; ) {
        var X = I - 1 >>> 1, B = k[X];
        if (0 < u(B, P))
          k[X] = P, k[I] = B, I = X;
        else break e;
      }
    }
    function a(k) {
      return k.length === 0 ? null : k[0];
    }
    function i(k) {
      if (k.length === 0) return null;
      var P = k[0], I = k.pop();
      if (I !== P) {
        k[0] = I;
        e: for (var X = 0, B = k.length, O = B >>> 1; X < O; ) {
          var H = 2 * (X + 1) - 1, ee = k[H], J = H + 1, le = k[J];
          if (0 > u(ee, I))
            J < B && 0 > u(le, ee) ? (k[X] = le, k[J] = I, X = J) : (k[X] = ee, k[H] = I, X = H);
          else if (J < B && 0 > u(le, I))
            k[X] = le, k[J] = I, X = J;
          else break e;
        }
      }
      return P;
    }
    function u(k, P) {
      var I = k.sortIndex - P.sortIndex;
      return I !== 0 ? I : k.id - P.id;
    }
    if (n.unstable_now = void 0, typeof performance == "object" && typeof performance.now == "function") {
      var f = performance;
      n.unstable_now = function() {
        return f.now();
      };
    } else {
      var p = Date, g = p.now();
      n.unstable_now = function() {
        return p.now() - g;
      };
    }
    var m = [], d = [], v = 1, x = null, S = 3, C = !1, E = !1, M = !1, T = !1, z = typeof setTimeout == "function" ? setTimeout : null, w = typeof clearTimeout == "function" ? clearTimeout : null, N = typeof setImmediate < "u" ? setImmediate : null;
    function A(k) {
      for (var P = a(d); P !== null; ) {
        if (P.callback === null) i(d);
        else if (P.startTime <= k)
          i(d), P.sortIndex = P.expirationTime, o(m, P);
        else break;
        P = a(d);
      }
    }
    function L(k) {
      if (M = !1, A(k), !E)
        if (a(m) !== null)
          E = !0, D || (D = !0, F());
        else {
          var P = a(d);
          P !== null && q(L, P.startTime - k);
        }
    }
    var D = !1, _ = -1, j = 5, V = -1;
    function G() {
      return T ? !0 : !(n.unstable_now() - V < j);
    }
    function ne() {
      if (T = !1, D) {
        var k = n.unstable_now();
        V = k;
        var P = !0;
        try {
          e: {
            E = !1, M && (M = !1, w(_), _ = -1), C = !0;
            var I = S;
            try {
              t: {
                for (A(k), x = a(m); x !== null && !(x.expirationTime > k && G()); ) {
                  var X = x.callback;
                  if (typeof X == "function") {
                    x.callback = null, S = x.priorityLevel;
                    var B = X(
                      x.expirationTime <= k
                    );
                    if (k = n.unstable_now(), typeof B == "function") {
                      x.callback = B, A(k), P = !0;
                      break t;
                    }
                    x === a(m) && i(m), A(k);
                  } else i(m);
                  x = a(m);
                }
                if (x !== null) P = !0;
                else {
                  var O = a(d);
                  O !== null && q(
                    L,
                    O.startTime - k
                  ), P = !1;
                }
              }
              break e;
            } finally {
              x = null, S = I, C = !1;
            }
            P = void 0;
          }
        } finally {
          P ? F() : D = !1;
        }
      }
    }
    var F;
    if (typeof N == "function")
      F = function() {
        N(ne);
      };
    else if (typeof MessageChannel < "u") {
      var Q = new MessageChannel(), Z = Q.port2;
      Q.port1.onmessage = ne, F = function() {
        Z.postMessage(null);
      };
    } else
      F = function() {
        z(ne, 0);
      };
    function q(k, P) {
      _ = z(function() {
        k(n.unstable_now());
      }, P);
    }
    n.unstable_IdlePriority = 5, n.unstable_ImmediatePriority = 1, n.unstable_LowPriority = 4, n.unstable_NormalPriority = 3, n.unstable_Profiling = null, n.unstable_UserBlockingPriority = 2, n.unstable_cancelCallback = function(k) {
      k.callback = null;
    }, n.unstable_forceFrameRate = function(k) {
      0 > k || 125 < k ? console.error(
        "forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported"
      ) : j = 0 < k ? Math.floor(1e3 / k) : 5;
    }, n.unstable_getCurrentPriorityLevel = function() {
      return S;
    }, n.unstable_next = function(k) {
      switch (S) {
        case 1:
        case 2:
        case 3:
          var P = 3;
          break;
        default:
          P = S;
      }
      var I = S;
      S = P;
      try {
        return k();
      } finally {
        S = I;
      }
    }, n.unstable_requestPaint = function() {
      T = !0;
    }, n.unstable_runWithPriority = function(k, P) {
      switch (k) {
        case 1:
        case 2:
        case 3:
        case 4:
        case 5:
          break;
        default:
          k = 3;
      }
      var I = S;
      S = k;
      try {
        return P();
      } finally {
        S = I;
      }
    }, n.unstable_scheduleCallback = function(k, P, I) {
      var X = n.unstable_now();
      switch (typeof I == "object" && I !== null ? (I = I.delay, I = typeof I == "number" && 0 < I ? X + I : X) : I = X, k) {
        case 1:
          var B = -1;
          break;
        case 2:
          B = 250;
          break;
        case 5:
          B = 1073741823;
          break;
        case 4:
          B = 1e4;
          break;
        default:
          B = 5e3;
      }
      return B = I + B, k = {
        id: v++,
        callback: P,
        priorityLevel: k,
        startTime: I,
        expirationTime: B,
        sortIndex: -1
      }, I > X ? (k.sortIndex = I, o(d, k), a(m) === null && k === a(d) && (M ? (w(_), _ = -1) : M = !0, q(L, I - X))) : (k.sortIndex = B, o(m, k), E || C || (E = !0, D || (D = !0, F()))), k;
    }, n.unstable_shouldYield = G, n.unstable_wrapCallback = function(k) {
      var P = S;
      return function() {
        var I = S;
        S = P;
        try {
          return k.apply(this, arguments);
        } finally {
          S = I;
        }
      };
    };
  })(tp)), tp;
}
var Rb;
function f2() {
  return Rb || (Rb = 1, ep.exports = u2()), ep.exports;
}
var Cb;
function d2() {
  if (Cb) return ii;
  Cb = 1;
  var n = f2(), o = Ti(), a = V0();
  function i(e) {
    var t = "https://react.dev/errors/" + e;
    if (1 < arguments.length) {
      t += "?args[]=" + encodeURIComponent(arguments[1]);
      for (var l = 2; l < arguments.length; l++)
        t += "&args[]=" + encodeURIComponent(arguments[l]);
    }
    return "Minified React error #" + e + "; visit " + t + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
  }
  function u(e) {
    return !(!e || e.nodeType !== 1 && e.nodeType !== 9 && e.nodeType !== 11);
  }
  function f(e) {
    var t = e, l = e;
    if (e.alternate) for (; t.return; ) t = t.return;
    else {
      e = t;
      do
        t = e, (t.flags & 4098) !== 0 && (l = t.return), e = t.return;
      while (e);
    }
    return t.tag === 3 ? l : null;
  }
  function p(e) {
    if (e.tag === 13) {
      var t = e.memoizedState;
      if (t === null && (e = e.alternate, e !== null && (t = e.memoizedState)), t !== null) return t.dehydrated;
    }
    return null;
  }
  function g(e) {
    if (e.tag === 31) {
      var t = e.memoizedState;
      if (t === null && (e = e.alternate, e !== null && (t = e.memoizedState)), t !== null) return t.dehydrated;
    }
    return null;
  }
  function m(e) {
    if (f(e) !== e)
      throw Error(i(188));
  }
  function d(e) {
    var t = e.alternate;
    if (!t) {
      if (t = f(e), t === null) throw Error(i(188));
      return t !== e ? null : e;
    }
    for (var l = e, r = t; ; ) {
      var s = l.return;
      if (s === null) break;
      var c = s.alternate;
      if (c === null) {
        if (r = s.return, r !== null) {
          l = r;
          continue;
        }
        break;
      }
      if (s.child === c.child) {
        for (c = s.child; c; ) {
          if (c === l) return m(s), e;
          if (c === r) return m(s), t;
          c = c.sibling;
        }
        throw Error(i(188));
      }
      if (l.return !== r.return) l = s, r = c;
      else {
        for (var y = !1, R = s.child; R; ) {
          if (R === l) {
            y = !0, l = s, r = c;
            break;
          }
          if (R === r) {
            y = !0, r = s, l = c;
            break;
          }
          R = R.sibling;
        }
        if (!y) {
          for (R = c.child; R; ) {
            if (R === l) {
              y = !0, l = c, r = s;
              break;
            }
            if (R === r) {
              y = !0, r = c, l = s;
              break;
            }
            R = R.sibling;
          }
          if (!y) throw Error(i(189));
        }
      }
      if (l.alternate !== r) throw Error(i(190));
    }
    if (l.tag !== 3) throw Error(i(188));
    return l.stateNode.current === l ? e : t;
  }
  function v(e) {
    var t = e.tag;
    if (t === 5 || t === 26 || t === 27 || t === 6) return e;
    for (e = e.child; e !== null; ) {
      if (t = v(e), t !== null) return t;
      e = e.sibling;
    }
    return null;
  }
  var x = Object.assign, S = /* @__PURE__ */ Symbol.for("react.element"), C = /* @__PURE__ */ Symbol.for("react.transitional.element"), E = /* @__PURE__ */ Symbol.for("react.portal"), M = /* @__PURE__ */ Symbol.for("react.fragment"), T = /* @__PURE__ */ Symbol.for("react.strict_mode"), z = /* @__PURE__ */ Symbol.for("react.profiler"), w = /* @__PURE__ */ Symbol.for("react.consumer"), N = /* @__PURE__ */ Symbol.for("react.context"), A = /* @__PURE__ */ Symbol.for("react.forward_ref"), L = /* @__PURE__ */ Symbol.for("react.suspense"), D = /* @__PURE__ */ Symbol.for("react.suspense_list"), _ = /* @__PURE__ */ Symbol.for("react.memo"), j = /* @__PURE__ */ Symbol.for("react.lazy"), V = /* @__PURE__ */ Symbol.for("react.activity"), G = /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel"), ne = Symbol.iterator;
  function F(e) {
    return e === null || typeof e != "object" ? null : (e = ne && e[ne] || e["@@iterator"], typeof e == "function" ? e : null);
  }
  var Q = /* @__PURE__ */ Symbol.for("react.client.reference");
  function Z(e) {
    if (e == null) return null;
    if (typeof e == "function")
      return e.$$typeof === Q ? null : e.displayName || e.name || null;
    if (typeof e == "string") return e;
    switch (e) {
      case M:
        return "Fragment";
      case z:
        return "Profiler";
      case T:
        return "StrictMode";
      case L:
        return "Suspense";
      case D:
        return "SuspenseList";
      case V:
        return "Activity";
    }
    if (typeof e == "object")
      switch (e.$$typeof) {
        case E:
          return "Portal";
        case N:
          return e.displayName || "Context";
        case w:
          return (e._context.displayName || "Context") + ".Consumer";
        case A:
          var t = e.render;
          return e = e.displayName, e || (e = t.displayName || t.name || "", e = e !== "" ? "ForwardRef(" + e + ")" : "ForwardRef"), e;
        case _:
          return t = e.displayName || null, t !== null ? t : Z(e.type) || "Memo";
        case j:
          t = e._payload, e = e._init;
          try {
            return Z(e(t));
          } catch {
          }
      }
    return null;
  }
  var q = Array.isArray, k = o.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, P = a.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, I = {
    pending: !1,
    data: null,
    method: null,
    action: null
  }, X = [], B = -1;
  function O(e) {
    return { current: e };
  }
  function H(e) {
    0 > B || (e.current = X[B], X[B] = null, B--);
  }
  function ee(e, t) {
    B++, X[B] = e.current, e.current = t;
  }
  var J = O(null), le = O(null), ie = O(null), re = O(null);
  function se(e, t) {
    switch (ee(ie, t), ee(le, e), ee(J, null), t.nodeType) {
      case 9:
      case 11:
        e = (e = t.documentElement) && (e = e.namespaceURI) ? Uy(e) : 0;
        break;
      default:
        if (e = t.tagName, t = t.namespaceURI)
          t = Uy(t), e = By(t, e);
        else
          switch (e) {
            case "svg":
              e = 1;
              break;
            case "math":
              e = 2;
              break;
            default:
              e = 0;
          }
    }
    H(J), ee(J, e);
  }
  function ge() {
    H(J), H(le), H(ie);
  }
  function De(e) {
    e.memoizedState !== null && ee(re, e);
    var t = J.current, l = By(t, e.type);
    t !== l && (ee(le, e), ee(J, l));
  }
  function Ee(e) {
    le.current === e && (H(J), H(le)), re.current === e && (H(re), $a._currentValue = I);
  }
  var ue, he;
  function ye(e) {
    if (ue === void 0)
      try {
        throw Error();
      } catch (l) {
        var t = l.stack.trim().match(/\n( *(at )?)/);
        ue = t && t[1] || "", he = -1 < l.stack.indexOf(`
    at`) ? " (<anonymous>)" : -1 < l.stack.indexOf("@") ? "@unknown:0:0" : "";
      }
    return `
` + ue + e + he;
  }
  var je = !1;
  function ke(e, t) {
    if (!e || je) return "";
    je = !0;
    var l = Error.prepareStackTrace;
    Error.prepareStackTrace = void 0;
    try {
      var r = {
        DetermineComponentFrameRoot: function() {
          try {
            if (t) {
              var de = function() {
                throw Error();
              };
              if (Object.defineProperty(de.prototype, "props", {
                set: function() {
                  throw Error();
                }
              }), typeof Reflect == "object" && Reflect.construct) {
                try {
                  Reflect.construct(de, []);
                } catch (oe) {
                  var te = oe;
                }
                Reflect.construct(e, [], de);
              } else {
                try {
                  de.call();
                } catch (oe) {
                  te = oe;
                }
                e.call(de.prototype);
              }
            } else {
              try {
                throw Error();
              } catch (oe) {
                te = oe;
              }
              (de = e()) && typeof de.catch == "function" && de.catch(function() {
              });
            }
          } catch (oe) {
            if (oe && te && typeof oe.stack == "string")
              return [oe.stack, te.stack];
          }
          return [null, null];
        }
      };
      r.DetermineComponentFrameRoot.displayName = "DetermineComponentFrameRoot";
      var s = Object.getOwnPropertyDescriptor(
        r.DetermineComponentFrameRoot,
        "name"
      );
      s && s.configurable && Object.defineProperty(
        r.DetermineComponentFrameRoot,
        "name",
        { value: "DetermineComponentFrameRoot" }
      );
      var c = r.DetermineComponentFrameRoot(), y = c[0], R = c[1];
      if (y && R) {
        var U = y.split(`
`), $ = R.split(`
`);
        for (s = r = 0; r < U.length && !U[r].includes("DetermineComponentFrameRoot"); )
          r++;
        for (; s < $.length && !$[s].includes(
          "DetermineComponentFrameRoot"
        ); )
          s++;
        if (r === U.length || s === $.length)
          for (r = U.length - 1, s = $.length - 1; 1 <= r && 0 <= s && U[r] !== $[s]; )
            s--;
        for (; 1 <= r && 0 <= s; r--, s--)
          if (U[r] !== $[s]) {
            if (r !== 1 || s !== 1)
              do
                if (r--, s--, 0 > s || U[r] !== $[s]) {
                  var ce = `
` + U[r].replace(" at new ", " at ");
                  return e.displayName && ce.includes("<anonymous>") && (ce = ce.replace("<anonymous>", e.displayName)), ce;
                }
              while (1 <= r && 0 <= s);
            break;
          }
      }
    } finally {
      je = !1, Error.prepareStackTrace = l;
    }
    return (l = e ? e.displayName || e.name : "") ? ye(l) : "";
  }
  function Te(e, t) {
    switch (e.tag) {
      case 26:
      case 27:
      case 5:
        return ye(e.type);
      case 16:
        return ye("Lazy");
      case 13:
        return e.child !== t && t !== null ? ye("Suspense Fallback") : ye("Suspense");
      case 19:
        return ye("SuspenseList");
      case 0:
      case 15:
        return ke(e.type, !1);
      case 11:
        return ke(e.type.render, !1);
      case 1:
        return ke(e.type, !0);
      case 31:
        return ye("Activity");
      default:
        return "";
    }
  }
  function Ce(e) {
    try {
      var t = "", l = null;
      do
        t += Te(e, l), l = e, e = e.return;
      while (e);
      return t;
    } catch (r) {
      return `
Error generating stack: ` + r.message + `
` + r.stack;
    }
  }
  var ve = Object.prototype.hasOwnProperty, Se = n.unstable_scheduleCallback, Re = n.unstable_cancelCallback, Oe = n.unstable_shouldYield, He = n.unstable_requestPaint, ae = n.unstable_now, pe = n.unstable_getCurrentPriorityLevel, Le = n.unstable_ImmediatePriority, be = n.unstable_UserBlockingPriority, xe = n.unstable_NormalPriority, et = n.unstable_LowPriority, rt = n.unstable_IdlePriority, pt = n.log, Nt = n.unstable_setDisableYieldValue, tt = null, gt = null;
  function zt(e) {
    if (typeof pt == "function" && Nt(e), gt && typeof gt.setStrictMode == "function")
      try {
        gt.setStrictMode(tt, e);
      } catch {
      }
  }
  var ht = Math.clz32 ? Math.clz32 : Qe, An = Math.log, zn = Math.LN2;
  function Qe(e) {
    return e >>>= 0, e === 0 ? 32 : 31 - (An(e) / zn | 0) | 0;
  }
  var ft = 256, Ut = 262144, _t = 4194304;
  function Ht(e) {
    var t = e & 42;
    if (t !== 0) return t;
    switch (e & -e) {
      case 1:
        return 1;
      case 2:
        return 2;
      case 4:
        return 4;
      case 8:
        return 8;
      case 16:
        return 16;
      case 32:
        return 32;
      case 64:
        return 64;
      case 128:
        return 128;
      case 256:
      case 512:
      case 1024:
      case 2048:
      case 4096:
      case 8192:
      case 16384:
      case 32768:
      case 65536:
      case 131072:
        return e & 261888;
      case 262144:
      case 524288:
      case 1048576:
      case 2097152:
        return e & 3932160;
      case 4194304:
      case 8388608:
      case 16777216:
      case 33554432:
        return e & 62914560;
      case 67108864:
        return 67108864;
      case 134217728:
        return 134217728;
      case 268435456:
        return 268435456;
      case 536870912:
        return 536870912;
      case 1073741824:
        return 0;
      default:
        return e;
    }
  }
  function jt(e, t, l) {
    var r = e.pendingLanes;
    if (r === 0) return 0;
    var s = 0, c = e.suspendedLanes, y = e.pingedLanes;
    e = e.warmLanes;
    var R = r & 134217727;
    return R !== 0 ? (r = R & ~c, r !== 0 ? s = Ht(r) : (y &= R, y !== 0 ? s = Ht(y) : l || (l = R & ~e, l !== 0 && (s = Ht(l))))) : (R = r & ~c, R !== 0 ? s = Ht(R) : y !== 0 ? s = Ht(y) : l || (l = r & ~e, l !== 0 && (s = Ht(l)))), s === 0 ? 0 : t !== 0 && t !== s && (t & c) === 0 && (c = s & -s, l = t & -t, c >= l || c === 32 && (l & 4194048) !== 0) ? t : s;
  }
  function Gt(e, t) {
    return (e.pendingLanes & ~(e.suspendedLanes & ~e.pingedLanes) & t) === 0;
  }
  function Sn(e, t) {
    switch (e) {
      case 1:
      case 2:
      case 4:
      case 8:
      case 64:
        return t + 250;
      case 16:
      case 32:
      case 128:
      case 256:
      case 512:
      case 1024:
      case 2048:
      case 4096:
      case 8192:
      case 16384:
      case 32768:
      case 65536:
      case 131072:
      case 262144:
      case 524288:
      case 1048576:
      case 2097152:
        return t + 5e3;
      case 4194304:
      case 8388608:
      case 16777216:
      case 33554432:
        return -1;
      case 67108864:
      case 134217728:
      case 268435456:
      case 536870912:
      case 1073741824:
        return -1;
      default:
        return -1;
    }
  }
  function Nn() {
    var e = _t;
    return _t <<= 1, (_t & 62914560) === 0 && (_t = 4194304), e;
  }
  function Pn(e) {
    for (var t = [], l = 0; 31 > l; l++) t.push(e);
    return t;
  }
  function qt(e, t) {
    e.pendingLanes |= t, t !== 268435456 && (e.suspendedLanes = 0, e.pingedLanes = 0, e.warmLanes = 0);
  }
  function Yn(e, t, l, r, s, c) {
    var y = e.pendingLanes;
    e.pendingLanes = l, e.suspendedLanes = 0, e.pingedLanes = 0, e.warmLanes = 0, e.expiredLanes &= l, e.entangledLanes &= l, e.errorRecoveryDisabledLanes &= l, e.shellSuspendCounter = 0;
    var R = e.entanglements, U = e.expirationTimes, $ = e.hiddenUpdates;
    for (l = y & ~l; 0 < l; ) {
      var ce = 31 - ht(l), de = 1 << ce;
      R[ce] = 0, U[ce] = -1;
      var te = $[ce];
      if (te !== null)
        for ($[ce] = null, ce = 0; ce < te.length; ce++) {
          var oe = te[ce];
          oe !== null && (oe.lane &= -536870913);
        }
      l &= ~de;
    }
    r !== 0 && vl(e, r, 0), c !== 0 && s === 0 && e.tag !== 0 && (e.suspendedLanes |= c & ~(y & ~t));
  }
  function vl(e, t, l) {
    e.pendingLanes |= t, e.suspendedLanes &= ~t;
    var r = 31 - ht(t);
    e.entangledLanes |= t, e.entanglements[r] = e.entanglements[r] | 1073741824 | l & 261930;
  }
  function nl(e, t) {
    var l = e.entangledLanes |= t;
    for (e = e.entanglements; l; ) {
      var r = 31 - ht(l), s = 1 << r;
      s & t | e[r] & t && (e[r] |= t), l &= ~s;
    }
  }
  function bl(e, t) {
    var l = t & -t;
    return l = (l & 42) !== 0 ? 1 : qe(l), (l & (e.suspendedLanes | t)) !== 0 ? 0 : l;
  }
  function qe(e) {
    switch (e) {
      case 2:
        e = 1;
        break;
      case 8:
        e = 4;
        break;
      case 32:
        e = 16;
        break;
      case 256:
      case 512:
      case 1024:
      case 2048:
      case 4096:
      case 8192:
      case 16384:
      case 32768:
      case 65536:
      case 131072:
      case 262144:
      case 524288:
      case 1048576:
      case 2097152:
      case 4194304:
      case 8388608:
      case 16777216:
      case 33554432:
        e = 128;
        break;
      case 268435456:
        e = 134217728;
        break;
      default:
        e = 0;
    }
    return e;
  }
  function xt(e) {
    return e &= -e, 2 < e ? 8 < e ? (e & 134217727) !== 0 ? 32 : 268435456 : 8 : 2;
  }
  function Xt() {
    var e = P.p;
    return e !== 0 ? e : (e = window.event, e === void 0 ? 32 : sv(e.type));
  }
  function ln(e, t) {
    var l = P.p;
    try {
      return P.p = e, t();
    } finally {
      P.p = l;
    }
  }
  var en = Math.random().toString(36).slice(2), Ot = "__reactFiber$" + en, cn = "__reactProps$" + en, il = "__reactContainer$" + en, pa = "__reactEvents$" + en, ki = "__reactListeners$" + en, Mw = "__reactHandles$" + en, Rg = "__reactResources$" + en, ga = "__reactMarker$" + en;
  function Tu(e) {
    delete e[Ot], delete e[cn], delete e[pa], delete e[ki], delete e[Mw];
  }
  function yr(e) {
    var t = e[Ot];
    if (t) return t;
    for (var l = e.parentNode; l; ) {
      if (t = l[il] || l[Ot]) {
        if (l = t.alternate, t.child !== null || l !== null && l.child !== null)
          for (e = Xy(e); e !== null; ) {
            if (l = e[Ot]) return l;
            e = Xy(e);
          }
        return t;
      }
      e = l, l = e.parentNode;
    }
    return null;
  }
  function vr(e) {
    if (e = e[Ot] || e[il]) {
      var t = e.tag;
      if (t === 5 || t === 6 || t === 13 || t === 31 || t === 26 || t === 27 || t === 3)
        return e;
    }
    return null;
  }
  function ma(e) {
    var t = e.tag;
    if (t === 5 || t === 26 || t === 27 || t === 6) return e.stateNode;
    throw Error(i(33));
  }
  function br(e) {
    var t = e[Rg];
    return t || (t = e[Rg] = { hoistableStyles: /* @__PURE__ */ new Map(), hoistableScripts: /* @__PURE__ */ new Map() }), t;
  }
  function on(e) {
    e[ga] = !0;
  }
  var Cg = /* @__PURE__ */ new Set(), Og = {};
  function Bo(e, t) {
    xr(e, t), xr(e + "Capture", t);
  }
  function xr(e, t) {
    for (Og[e] = t, e = 0; e < t.length; e++)
      Cg.add(t[e]);
  }
  var Aw = RegExp(
    "^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"
  ), Mg = {}, Ag = {};
  function zw(e) {
    return ve.call(Ag, e) ? !0 : ve.call(Mg, e) ? !1 : Aw.test(e) ? Ag[e] = !0 : (Mg[e] = !0, !1);
  }
  function _i(e, t, l) {
    if (zw(t))
      if (l === null) e.removeAttribute(t);
      else {
        switch (typeof l) {
          case "undefined":
          case "function":
          case "symbol":
            e.removeAttribute(t);
            return;
          case "boolean":
            var r = t.toLowerCase().slice(0, 5);
            if (r !== "data-" && r !== "aria-") {
              e.removeAttribute(t);
              return;
            }
        }
        e.setAttribute(t, "" + l);
      }
  }
  function Hi(e, t, l) {
    if (l === null) e.removeAttribute(t);
    else {
      switch (typeof l) {
        case "undefined":
        case "function":
        case "symbol":
        case "boolean":
          e.removeAttribute(t);
          return;
      }
      e.setAttribute(t, "" + l);
    }
  }
  function xl(e, t, l, r) {
    if (r === null) e.removeAttribute(l);
    else {
      switch (typeof r) {
        case "undefined":
        case "function":
        case "symbol":
        case "boolean":
          e.removeAttribute(l);
          return;
      }
      e.setAttributeNS(t, l, "" + r);
    }
  }
  function Gn(e) {
    switch (typeof e) {
      case "bigint":
      case "boolean":
      case "number":
      case "string":
      case "undefined":
        return e;
      case "object":
        return e;
      default:
        return "";
    }
  }
  function zg(e) {
    var t = e.type;
    return (e = e.nodeName) && e.toLowerCase() === "input" && (t === "checkbox" || t === "radio");
  }
  function Nw(e, t, l) {
    var r = Object.getOwnPropertyDescriptor(
      e.constructor.prototype,
      t
    );
    if (!e.hasOwnProperty(t) && typeof r < "u" && typeof r.get == "function" && typeof r.set == "function") {
      var s = r.get, c = r.set;
      return Object.defineProperty(e, t, {
        configurable: !0,
        get: function() {
          return s.call(this);
        },
        set: function(y) {
          l = "" + y, c.call(this, y);
        }
      }), Object.defineProperty(e, t, {
        enumerable: r.enumerable
      }), {
        getValue: function() {
          return l;
        },
        setValue: function(y) {
          l = "" + y;
        },
        stopTracking: function() {
          e._valueTracker = null, delete e[t];
        }
      };
    }
  }
  function Ru(e) {
    if (!e._valueTracker) {
      var t = zg(e) ? "checked" : "value";
      e._valueTracker = Nw(
        e,
        t,
        "" + e[t]
      );
    }
  }
  function Ng(e) {
    if (!e) return !1;
    var t = e._valueTracker;
    if (!t) return !0;
    var l = t.getValue(), r = "";
    return e && (r = zg(e) ? e.checked ? "true" : "false" : e.value), e = r, e !== l ? (t.setValue(e), !0) : !1;
  }
  function Li(e) {
    if (e = e || (typeof document < "u" ? document : void 0), typeof e > "u") return null;
    try {
      return e.activeElement || e.body;
    } catch {
      return e.body;
    }
  }
  var jw = /[\n"\\]/g;
  function qn(e) {
    return e.replace(
      jw,
      function(t) {
        return "\\" + t.charCodeAt(0).toString(16) + " ";
      }
    );
  }
  function Cu(e, t, l, r, s, c, y, R) {
    e.name = "", y != null && typeof y != "function" && typeof y != "symbol" && typeof y != "boolean" ? e.type = y : e.removeAttribute("type"), t != null ? y === "number" ? (t === 0 && e.value === "" || e.value != t) && (e.value = "" + Gn(t)) : e.value !== "" + Gn(t) && (e.value = "" + Gn(t)) : y !== "submit" && y !== "reset" || e.removeAttribute("value"), t != null ? Ou(e, y, Gn(t)) : l != null ? Ou(e, y, Gn(l)) : r != null && e.removeAttribute("value"), s == null && c != null && (e.defaultChecked = !!c), s != null && (e.checked = s && typeof s != "function" && typeof s != "symbol"), R != null && typeof R != "function" && typeof R != "symbol" && typeof R != "boolean" ? e.name = "" + Gn(R) : e.removeAttribute("name");
  }
  function jg(e, t, l, r, s, c, y, R) {
    if (c != null && typeof c != "function" && typeof c != "symbol" && typeof c != "boolean" && (e.type = c), t != null || l != null) {
      if (!(c !== "submit" && c !== "reset" || t != null)) {
        Ru(e);
        return;
      }
      l = l != null ? "" + Gn(l) : "", t = t != null ? "" + Gn(t) : l, R || t === e.value || (e.value = t), e.defaultValue = t;
    }
    r = r ?? s, r = typeof r != "function" && typeof r != "symbol" && !!r, e.checked = R ? e.checked : !!r, e.defaultChecked = !!r, y != null && typeof y != "function" && typeof y != "symbol" && typeof y != "boolean" && (e.name = y), Ru(e);
  }
  function Ou(e, t, l) {
    t === "number" && Li(e.ownerDocument) === e || e.defaultValue === "" + l || (e.defaultValue = "" + l);
  }
  function wr(e, t, l, r) {
    if (e = e.options, t) {
      t = {};
      for (var s = 0; s < l.length; s++)
        t["$" + l[s]] = !0;
      for (l = 0; l < e.length; l++)
        s = t.hasOwnProperty("$" + e[l].value), e[l].selected !== s && (e[l].selected = s), s && r && (e[l].defaultSelected = !0);
    } else {
      for (l = "" + Gn(l), t = null, s = 0; s < e.length; s++) {
        if (e[s].value === l) {
          e[s].selected = !0, r && (e[s].defaultSelected = !0);
          return;
        }
        t !== null || e[s].disabled || (t = e[s]);
      }
      t !== null && (t.selected = !0);
    }
  }
  function Dg(e, t, l) {
    if (t != null && (t = "" + Gn(t), t !== e.value && (e.value = t), l == null)) {
      e.defaultValue !== t && (e.defaultValue = t);
      return;
    }
    e.defaultValue = l != null ? "" + Gn(l) : "";
  }
  function kg(e, t, l, r) {
    if (t == null) {
      if (r != null) {
        if (l != null) throw Error(i(92));
        if (q(r)) {
          if (1 < r.length) throw Error(i(93));
          r = r[0];
        }
        l = r;
      }
      l == null && (l = ""), t = l;
    }
    l = Gn(t), e.defaultValue = l, r = e.textContent, r === l && r !== "" && r !== null && (e.value = r), Ru(e);
  }
  function Sr(e, t) {
    if (t) {
      var l = e.firstChild;
      if (l && l === e.lastChild && l.nodeType === 3) {
        l.nodeValue = t;
        return;
      }
    }
    e.textContent = t;
  }
  var Dw = new Set(
    "animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(
      " "
    )
  );
  function _g(e, t, l) {
    var r = t.indexOf("--") === 0;
    l == null || typeof l == "boolean" || l === "" ? r ? e.setProperty(t, "") : t === "float" ? e.cssFloat = "" : e[t] = "" : r ? e.setProperty(t, l) : typeof l != "number" || l === 0 || Dw.has(t) ? t === "float" ? e.cssFloat = l : e[t] = ("" + l).trim() : e[t] = l + "px";
  }
  function Hg(e, t, l) {
    if (t != null && typeof t != "object")
      throw Error(i(62));
    if (e = e.style, l != null) {
      for (var r in l)
        !l.hasOwnProperty(r) || t != null && t.hasOwnProperty(r) || (r.indexOf("--") === 0 ? e.setProperty(r, "") : r === "float" ? e.cssFloat = "" : e[r] = "");
      for (var s in t)
        r = t[s], t.hasOwnProperty(s) && l[s] !== r && _g(e, s, r);
    } else
      for (var c in t)
        t.hasOwnProperty(c) && _g(e, c, t[c]);
  }
  function Mu(e) {
    if (e.indexOf("-") === -1) return !1;
    switch (e) {
      case "annotation-xml":
      case "color-profile":
      case "font-face":
      case "font-face-src":
      case "font-face-uri":
      case "font-face-format":
      case "font-face-name":
      case "missing-glyph":
        return !1;
      default:
        return !0;
    }
  }
  var kw = /* @__PURE__ */ new Map([
    ["acceptCharset", "accept-charset"],
    ["htmlFor", "for"],
    ["httpEquiv", "http-equiv"],
    ["crossOrigin", "crossorigin"],
    ["accentHeight", "accent-height"],
    ["alignmentBaseline", "alignment-baseline"],
    ["arabicForm", "arabic-form"],
    ["baselineShift", "baseline-shift"],
    ["capHeight", "cap-height"],
    ["clipPath", "clip-path"],
    ["clipRule", "clip-rule"],
    ["colorInterpolation", "color-interpolation"],
    ["colorInterpolationFilters", "color-interpolation-filters"],
    ["colorProfile", "color-profile"],
    ["colorRendering", "color-rendering"],
    ["dominantBaseline", "dominant-baseline"],
    ["enableBackground", "enable-background"],
    ["fillOpacity", "fill-opacity"],
    ["fillRule", "fill-rule"],
    ["floodColor", "flood-color"],
    ["floodOpacity", "flood-opacity"],
    ["fontFamily", "font-family"],
    ["fontSize", "font-size"],
    ["fontSizeAdjust", "font-size-adjust"],
    ["fontStretch", "font-stretch"],
    ["fontStyle", "font-style"],
    ["fontVariant", "font-variant"],
    ["fontWeight", "font-weight"],
    ["glyphName", "glyph-name"],
    ["glyphOrientationHorizontal", "glyph-orientation-horizontal"],
    ["glyphOrientationVertical", "glyph-orientation-vertical"],
    ["horizAdvX", "horiz-adv-x"],
    ["horizOriginX", "horiz-origin-x"],
    ["imageRendering", "image-rendering"],
    ["letterSpacing", "letter-spacing"],
    ["lightingColor", "lighting-color"],
    ["markerEnd", "marker-end"],
    ["markerMid", "marker-mid"],
    ["markerStart", "marker-start"],
    ["overlinePosition", "overline-position"],
    ["overlineThickness", "overline-thickness"],
    ["paintOrder", "paint-order"],
    ["panose-1", "panose-1"],
    ["pointerEvents", "pointer-events"],
    ["renderingIntent", "rendering-intent"],
    ["shapeRendering", "shape-rendering"],
    ["stopColor", "stop-color"],
    ["stopOpacity", "stop-opacity"],
    ["strikethroughPosition", "strikethrough-position"],
    ["strikethroughThickness", "strikethrough-thickness"],
    ["strokeDasharray", "stroke-dasharray"],
    ["strokeDashoffset", "stroke-dashoffset"],
    ["strokeLinecap", "stroke-linecap"],
    ["strokeLinejoin", "stroke-linejoin"],
    ["strokeMiterlimit", "stroke-miterlimit"],
    ["strokeOpacity", "stroke-opacity"],
    ["strokeWidth", "stroke-width"],
    ["textAnchor", "text-anchor"],
    ["textDecoration", "text-decoration"],
    ["textRendering", "text-rendering"],
    ["transformOrigin", "transform-origin"],
    ["underlinePosition", "underline-position"],
    ["underlineThickness", "underline-thickness"],
    ["unicodeBidi", "unicode-bidi"],
    ["unicodeRange", "unicode-range"],
    ["unitsPerEm", "units-per-em"],
    ["vAlphabetic", "v-alphabetic"],
    ["vHanging", "v-hanging"],
    ["vIdeographic", "v-ideographic"],
    ["vMathematical", "v-mathematical"],
    ["vectorEffect", "vector-effect"],
    ["vertAdvY", "vert-adv-y"],
    ["vertOriginX", "vert-origin-x"],
    ["vertOriginY", "vert-origin-y"],
    ["wordSpacing", "word-spacing"],
    ["writingMode", "writing-mode"],
    ["xmlnsXlink", "xmlns:xlink"],
    ["xHeight", "x-height"]
  ]), _w = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
  function Ui(e) {
    return _w.test("" + e) ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')" : e;
  }
  function wl() {
  }
  var Au = null;
  function zu(e) {
    return e = e.target || e.srcElement || window, e.correspondingUseElement && (e = e.correspondingUseElement), e.nodeType === 3 ? e.parentNode : e;
  }
  var Er = null, Tr = null;
  function Lg(e) {
    var t = vr(e);
    if (t && (e = t.stateNode)) {
      var l = e[cn] || null;
      e: switch (e = t.stateNode, t.type) {
        case "input":
          if (Cu(
            e,
            l.value,
            l.defaultValue,
            l.defaultValue,
            l.checked,
            l.defaultChecked,
            l.type,
            l.name
          ), t = l.name, l.type === "radio" && t != null) {
            for (l = e; l.parentNode; ) l = l.parentNode;
            for (l = l.querySelectorAll(
              'input[name="' + qn(
                "" + t
              ) + '"][type="radio"]'
            ), t = 0; t < l.length; t++) {
              var r = l[t];
              if (r !== e && r.form === e.form) {
                var s = r[cn] || null;
                if (!s) throw Error(i(90));
                Cu(
                  r,
                  s.value,
                  s.defaultValue,
                  s.defaultValue,
                  s.checked,
                  s.defaultChecked,
                  s.type,
                  s.name
                );
              }
            }
            for (t = 0; t < l.length; t++)
              r = l[t], r.form === e.form && Ng(r);
          }
          break e;
        case "textarea":
          Dg(e, l.value, l.defaultValue);
          break e;
        case "select":
          t = l.value, t != null && wr(e, !!l.multiple, t, !1);
      }
    }
  }
  var Nu = !1;
  function Ug(e, t, l) {
    if (Nu) return e(t, l);
    Nu = !0;
    try {
      var r = e(t);
      return r;
    } finally {
      if (Nu = !1, (Er !== null || Tr !== null) && (Rs(), Er && (t = Er, e = Tr, Tr = Er = null, Lg(t), e)))
        for (t = 0; t < e.length; t++) Lg(e[t]);
    }
  }
  function ha(e, t) {
    var l = e.stateNode;
    if (l === null) return null;
    var r = l[cn] || null;
    if (r === null) return null;
    l = r[t];
    e: switch (t) {
      case "onClick":
      case "onClickCapture":
      case "onDoubleClick":
      case "onDoubleClickCapture":
      case "onMouseDown":
      case "onMouseDownCapture":
      case "onMouseMove":
      case "onMouseMoveCapture":
      case "onMouseUp":
      case "onMouseUpCapture":
      case "onMouseEnter":
        (r = !r.disabled) || (e = e.type, r = !(e === "button" || e === "input" || e === "select" || e === "textarea")), e = !r;
        break e;
      default:
        e = !1;
    }
    if (e) return null;
    if (l && typeof l != "function")
      throw Error(
        i(231, t, typeof l)
      );
    return l;
  }
  var Sl = !(typeof window > "u" || typeof window.document > "u" || typeof window.document.createElement > "u"), ju = !1;
  if (Sl)
    try {
      var ya = {};
      Object.defineProperty(ya, "passive", {
        get: function() {
          ju = !0;
        }
      }), window.addEventListener("test", ya, ya), window.removeEventListener("test", ya, ya);
    } catch {
      ju = !1;
    }
  var lo = null, Du = null, Bi = null;
  function Bg() {
    if (Bi) return Bi;
    var e, t = Du, l = t.length, r, s = "value" in lo ? lo.value : lo.textContent, c = s.length;
    for (e = 0; e < l && t[e] === s[e]; e++) ;
    var y = l - e;
    for (r = 1; r <= y && t[l - r] === s[c - r]; r++) ;
    return Bi = s.slice(e, 1 < r ? 1 - r : void 0);
  }
  function Ii(e) {
    var t = e.keyCode;
    return "charCode" in e ? (e = e.charCode, e === 0 && t === 13 && (e = 13)) : e = t, e === 10 && (e = 13), 32 <= e || e === 13 ? e : 0;
  }
  function Vi() {
    return !0;
  }
  function Ig() {
    return !1;
  }
  function En(e) {
    function t(l, r, s, c, y) {
      this._reactName = l, this._targetInst = s, this.type = r, this.nativeEvent = c, this.target = y, this.currentTarget = null;
      for (var R in e)
        e.hasOwnProperty(R) && (l = e[R], this[R] = l ? l(c) : c[R]);
      return this.isDefaultPrevented = (c.defaultPrevented != null ? c.defaultPrevented : c.returnValue === !1) ? Vi : Ig, this.isPropagationStopped = Ig, this;
    }
    return x(t.prototype, {
      preventDefault: function() {
        this.defaultPrevented = !0;
        var l = this.nativeEvent;
        l && (l.preventDefault ? l.preventDefault() : typeof l.returnValue != "unknown" && (l.returnValue = !1), this.isDefaultPrevented = Vi);
      },
      stopPropagation: function() {
        var l = this.nativeEvent;
        l && (l.stopPropagation ? l.stopPropagation() : typeof l.cancelBubble != "unknown" && (l.cancelBubble = !0), this.isPropagationStopped = Vi);
      },
      persist: function() {
      },
      isPersistent: Vi
    }), t;
  }
  var Io = {
    eventPhase: 0,
    bubbles: 0,
    cancelable: 0,
    timeStamp: function(e) {
      return e.timeStamp || Date.now();
    },
    defaultPrevented: 0,
    isTrusted: 0
  }, Pi = En(Io), va = x({}, Io, { view: 0, detail: 0 }), Hw = En(va), ku, _u, ba, Yi = x({}, va, {
    screenX: 0,
    screenY: 0,
    clientX: 0,
    clientY: 0,
    pageX: 0,
    pageY: 0,
    ctrlKey: 0,
    shiftKey: 0,
    altKey: 0,
    metaKey: 0,
    getModifierState: Lu,
    button: 0,
    buttons: 0,
    relatedTarget: function(e) {
      return e.relatedTarget === void 0 ? e.fromElement === e.srcElement ? e.toElement : e.fromElement : e.relatedTarget;
    },
    movementX: function(e) {
      return "movementX" in e ? e.movementX : (e !== ba && (ba && e.type === "mousemove" ? (ku = e.screenX - ba.screenX, _u = e.screenY - ba.screenY) : _u = ku = 0, ba = e), ku);
    },
    movementY: function(e) {
      return "movementY" in e ? e.movementY : _u;
    }
  }), Vg = En(Yi), Lw = x({}, Yi, { dataTransfer: 0 }), Uw = En(Lw), Bw = x({}, va, { relatedTarget: 0 }), Hu = En(Bw), Iw = x({}, Io, {
    animationName: 0,
    elapsedTime: 0,
    pseudoElement: 0
  }), Vw = En(Iw), Pw = x({}, Io, {
    clipboardData: function(e) {
      return "clipboardData" in e ? e.clipboardData : window.clipboardData;
    }
  }), Yw = En(Pw), Gw = x({}, Io, { data: 0 }), Pg = En(Gw), qw = {
    Esc: "Escape",
    Spacebar: " ",
    Left: "ArrowLeft",
    Up: "ArrowUp",
    Right: "ArrowRight",
    Down: "ArrowDown",
    Del: "Delete",
    Win: "OS",
    Menu: "ContextMenu",
    Apps: "ContextMenu",
    Scroll: "ScrollLock",
    MozPrintableKey: "Unidentified"
  }, Xw = {
    8: "Backspace",
    9: "Tab",
    12: "Clear",
    13: "Enter",
    16: "Shift",
    17: "Control",
    18: "Alt",
    19: "Pause",
    20: "CapsLock",
    27: "Escape",
    32: " ",
    33: "PageUp",
    34: "PageDown",
    35: "End",
    36: "Home",
    37: "ArrowLeft",
    38: "ArrowUp",
    39: "ArrowRight",
    40: "ArrowDown",
    45: "Insert",
    46: "Delete",
    112: "F1",
    113: "F2",
    114: "F3",
    115: "F4",
    116: "F5",
    117: "F6",
    118: "F7",
    119: "F8",
    120: "F9",
    121: "F10",
    122: "F11",
    123: "F12",
    144: "NumLock",
    145: "ScrollLock",
    224: "Meta"
  }, Fw = {
    Alt: "altKey",
    Control: "ctrlKey",
    Meta: "metaKey",
    Shift: "shiftKey"
  };
  function Kw(e) {
    var t = this.nativeEvent;
    return t.getModifierState ? t.getModifierState(e) : (e = Fw[e]) ? !!t[e] : !1;
  }
  function Lu() {
    return Kw;
  }
  var Qw = x({}, va, {
    key: function(e) {
      if (e.key) {
        var t = qw[e.key] || e.key;
        if (t !== "Unidentified") return t;
      }
      return e.type === "keypress" ? (e = Ii(e), e === 13 ? "Enter" : String.fromCharCode(e)) : e.type === "keydown" || e.type === "keyup" ? Xw[e.keyCode] || "Unidentified" : "";
    },
    code: 0,
    location: 0,
    ctrlKey: 0,
    shiftKey: 0,
    altKey: 0,
    metaKey: 0,
    repeat: 0,
    locale: 0,
    getModifierState: Lu,
    charCode: function(e) {
      return e.type === "keypress" ? Ii(e) : 0;
    },
    keyCode: function(e) {
      return e.type === "keydown" || e.type === "keyup" ? e.keyCode : 0;
    },
    which: function(e) {
      return e.type === "keypress" ? Ii(e) : e.type === "keydown" || e.type === "keyup" ? e.keyCode : 0;
    }
  }), Zw = En(Qw), Jw = x({}, Yi, {
    pointerId: 0,
    width: 0,
    height: 0,
    pressure: 0,
    tangentialPressure: 0,
    tiltX: 0,
    tiltY: 0,
    twist: 0,
    pointerType: 0,
    isPrimary: 0
  }), Yg = En(Jw), Ww = x({}, va, {
    touches: 0,
    targetTouches: 0,
    changedTouches: 0,
    altKey: 0,
    metaKey: 0,
    ctrlKey: 0,
    shiftKey: 0,
    getModifierState: Lu
  }), $w = En(Ww), eS = x({}, Io, {
    propertyName: 0,
    elapsedTime: 0,
    pseudoElement: 0
  }), tS = En(eS), nS = x({}, Yi, {
    deltaX: function(e) {
      return "deltaX" in e ? e.deltaX : "wheelDeltaX" in e ? -e.wheelDeltaX : 0;
    },
    deltaY: function(e) {
      return "deltaY" in e ? e.deltaY : "wheelDeltaY" in e ? -e.wheelDeltaY : "wheelDelta" in e ? -e.wheelDelta : 0;
    },
    deltaZ: 0,
    deltaMode: 0
  }), lS = En(nS), oS = x({}, Io, {
    newState: 0,
    oldState: 0
  }), rS = En(oS), aS = [9, 13, 27, 32], Uu = Sl && "CompositionEvent" in window, xa = null;
  Sl && "documentMode" in document && (xa = document.documentMode);
  var iS = Sl && "TextEvent" in window && !xa, Gg = Sl && (!Uu || xa && 8 < xa && 11 >= xa), qg = " ", Xg = !1;
  function Fg(e, t) {
    switch (e) {
      case "keyup":
        return aS.indexOf(t.keyCode) !== -1;
      case "keydown":
        return t.keyCode !== 229;
      case "keypress":
      case "mousedown":
      case "focusout":
        return !0;
      default:
        return !1;
    }
  }
  function Kg(e) {
    return e = e.detail, typeof e == "object" && "data" in e ? e.data : null;
  }
  var Rr = !1;
  function sS(e, t) {
    switch (e) {
      case "compositionend":
        return Kg(t);
      case "keypress":
        return t.which !== 32 ? null : (Xg = !0, qg);
      case "textInput":
        return e = t.data, e === qg && Xg ? null : e;
      default:
        return null;
    }
  }
  function cS(e, t) {
    if (Rr)
      return e === "compositionend" || !Uu && Fg(e, t) ? (e = Bg(), Bi = Du = lo = null, Rr = !1, e) : null;
    switch (e) {
      case "paste":
        return null;
      case "keypress":
        if (!(t.ctrlKey || t.altKey || t.metaKey) || t.ctrlKey && t.altKey) {
          if (t.char && 1 < t.char.length)
            return t.char;
          if (t.which) return String.fromCharCode(t.which);
        }
        return null;
      case "compositionend":
        return Gg && t.locale !== "ko" ? null : t.data;
      default:
        return null;
    }
  }
  var uS = {
    color: !0,
    date: !0,
    datetime: !0,
    "datetime-local": !0,
    email: !0,
    month: !0,
    number: !0,
    password: !0,
    range: !0,
    search: !0,
    tel: !0,
    text: !0,
    time: !0,
    url: !0,
    week: !0
  };
  function Qg(e) {
    var t = e && e.nodeName && e.nodeName.toLowerCase();
    return t === "input" ? !!uS[e.type] : t === "textarea";
  }
  function Zg(e, t, l, r) {
    Er ? Tr ? Tr.push(r) : Tr = [r] : Er = r, t = js(t, "onChange"), 0 < t.length && (l = new Pi(
      "onChange",
      "change",
      null,
      l,
      r
    ), e.push({ event: l, listeners: t }));
  }
  var wa = null, Sa = null;
  function fS(e) {
    jy(e, 0);
  }
  function Gi(e) {
    var t = ma(e);
    if (Ng(t)) return e;
  }
  function Jg(e, t) {
    if (e === "change") return t;
  }
  var Wg = !1;
  if (Sl) {
    var Bu;
    if (Sl) {
      var Iu = "oninput" in document;
      if (!Iu) {
        var $g = document.createElement("div");
        $g.setAttribute("oninput", "return;"), Iu = typeof $g.oninput == "function";
      }
      Bu = Iu;
    } else Bu = !1;
    Wg = Bu && (!document.documentMode || 9 < document.documentMode);
  }
  function em() {
    wa && (wa.detachEvent("onpropertychange", tm), Sa = wa = null);
  }
  function tm(e) {
    if (e.propertyName === "value" && Gi(Sa)) {
      var t = [];
      Zg(
        t,
        Sa,
        e,
        zu(e)
      ), Ug(fS, t);
    }
  }
  function dS(e, t, l) {
    e === "focusin" ? (em(), wa = t, Sa = l, wa.attachEvent("onpropertychange", tm)) : e === "focusout" && em();
  }
  function pS(e) {
    if (e === "selectionchange" || e === "keyup" || e === "keydown")
      return Gi(Sa);
  }
  function gS(e, t) {
    if (e === "click") return Gi(t);
  }
  function mS(e, t) {
    if (e === "input" || e === "change")
      return Gi(t);
  }
  function hS(e, t) {
    return e === t && (e !== 0 || 1 / e === 1 / t) || e !== e && t !== t;
  }
  var jn = typeof Object.is == "function" ? Object.is : hS;
  function Ea(e, t) {
    if (jn(e, t)) return !0;
    if (typeof e != "object" || e === null || typeof t != "object" || t === null)
      return !1;
    var l = Object.keys(e), r = Object.keys(t);
    if (l.length !== r.length) return !1;
    for (r = 0; r < l.length; r++) {
      var s = l[r];
      if (!ve.call(t, s) || !jn(e[s], t[s]))
        return !1;
    }
    return !0;
  }
  function nm(e) {
    for (; e && e.firstChild; ) e = e.firstChild;
    return e;
  }
  function lm(e, t) {
    var l = nm(e);
    e = 0;
    for (var r; l; ) {
      if (l.nodeType === 3) {
        if (r = e + l.textContent.length, e <= t && r >= t)
          return { node: l, offset: t - e };
        e = r;
      }
      e: {
        for (; l; ) {
          if (l.nextSibling) {
            l = l.nextSibling;
            break e;
          }
          l = l.parentNode;
        }
        l = void 0;
      }
      l = nm(l);
    }
  }
  function om(e, t) {
    return e && t ? e === t ? !0 : e && e.nodeType === 3 ? !1 : t && t.nodeType === 3 ? om(e, t.parentNode) : "contains" in e ? e.contains(t) : e.compareDocumentPosition ? !!(e.compareDocumentPosition(t) & 16) : !1 : !1;
  }
  function rm(e) {
    e = e != null && e.ownerDocument != null && e.ownerDocument.defaultView != null ? e.ownerDocument.defaultView : window;
    for (var t = Li(e.document); t instanceof e.HTMLIFrameElement; ) {
      try {
        var l = typeof t.contentWindow.location.href == "string";
      } catch {
        l = !1;
      }
      if (l) e = t.contentWindow;
      else break;
      t = Li(e.document);
    }
    return t;
  }
  function Vu(e) {
    var t = e && e.nodeName && e.nodeName.toLowerCase();
    return t && (t === "input" && (e.type === "text" || e.type === "search" || e.type === "tel" || e.type === "url" || e.type === "password") || t === "textarea" || e.contentEditable === "true");
  }
  var yS = Sl && "documentMode" in document && 11 >= document.documentMode, Cr = null, Pu = null, Ta = null, Yu = !1;
  function am(e, t, l) {
    var r = l.window === l ? l.document : l.nodeType === 9 ? l : l.ownerDocument;
    Yu || Cr == null || Cr !== Li(r) || (r = Cr, "selectionStart" in r && Vu(r) ? r = { start: r.selectionStart, end: r.selectionEnd } : (r = (r.ownerDocument && r.ownerDocument.defaultView || window).getSelection(), r = {
      anchorNode: r.anchorNode,
      anchorOffset: r.anchorOffset,
      focusNode: r.focusNode,
      focusOffset: r.focusOffset
    }), Ta && Ea(Ta, r) || (Ta = r, r = js(Pu, "onSelect"), 0 < r.length && (t = new Pi(
      "onSelect",
      "select",
      null,
      t,
      l
    ), e.push({ event: t, listeners: r }), t.target = Cr)));
  }
  function Vo(e, t) {
    var l = {};
    return l[e.toLowerCase()] = t.toLowerCase(), l["Webkit" + e] = "webkit" + t, l["Moz" + e] = "moz" + t, l;
  }
  var Or = {
    animationend: Vo("Animation", "AnimationEnd"),
    animationiteration: Vo("Animation", "AnimationIteration"),
    animationstart: Vo("Animation", "AnimationStart"),
    transitionrun: Vo("Transition", "TransitionRun"),
    transitionstart: Vo("Transition", "TransitionStart"),
    transitioncancel: Vo("Transition", "TransitionCancel"),
    transitionend: Vo("Transition", "TransitionEnd")
  }, Gu = {}, im = {};
  Sl && (im = document.createElement("div").style, "AnimationEvent" in window || (delete Or.animationend.animation, delete Or.animationiteration.animation, delete Or.animationstart.animation), "TransitionEvent" in window || delete Or.transitionend.transition);
  function Po(e) {
    if (Gu[e]) return Gu[e];
    if (!Or[e]) return e;
    var t = Or[e], l;
    for (l in t)
      if (t.hasOwnProperty(l) && l in im)
        return Gu[e] = t[l];
    return e;
  }
  var sm = Po("animationend"), cm = Po("animationiteration"), um = Po("animationstart"), vS = Po("transitionrun"), bS = Po("transitionstart"), xS = Po("transitioncancel"), fm = Po("transitionend"), dm = /* @__PURE__ */ new Map(), qu = "abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(
    " "
  );
  qu.push("scrollEnd");
  function ll(e, t) {
    dm.set(e, t), Bo(t, [e]);
  }
  var qi = typeof reportError == "function" ? reportError : function(e) {
    if (typeof window == "object" && typeof window.ErrorEvent == "function") {
      var t = new window.ErrorEvent("error", {
        bubbles: !0,
        cancelable: !0,
        message: typeof e == "object" && e !== null && typeof e.message == "string" ? String(e.message) : String(e),
        error: e
      });
      if (!window.dispatchEvent(t)) return;
    } else if (typeof process == "object" && typeof process.emit == "function") {
      process.emit("uncaughtException", e);
      return;
    }
    console.error(e);
  }, Xn = [], Mr = 0, Xu = 0;
  function Xi() {
    for (var e = Mr, t = Xu = Mr = 0; t < e; ) {
      var l = Xn[t];
      Xn[t++] = null;
      var r = Xn[t];
      Xn[t++] = null;
      var s = Xn[t];
      Xn[t++] = null;
      var c = Xn[t];
      if (Xn[t++] = null, r !== null && s !== null) {
        var y = r.pending;
        y === null ? s.next = s : (s.next = y.next, y.next = s), r.pending = s;
      }
      c !== 0 && pm(l, s, c);
    }
  }
  function Fi(e, t, l, r) {
    Xn[Mr++] = e, Xn[Mr++] = t, Xn[Mr++] = l, Xn[Mr++] = r, Xu |= r, e.lanes |= r, e = e.alternate, e !== null && (e.lanes |= r);
  }
  function Fu(e, t, l, r) {
    return Fi(e, t, l, r), Ki(e);
  }
  function Yo(e, t) {
    return Fi(e, null, null, t), Ki(e);
  }
  function pm(e, t, l) {
    e.lanes |= l;
    var r = e.alternate;
    r !== null && (r.lanes |= l);
    for (var s = !1, c = e.return; c !== null; )
      c.childLanes |= l, r = c.alternate, r !== null && (r.childLanes |= l), c.tag === 22 && (e = c.stateNode, e === null || e._visibility & 1 || (s = !0)), e = c, c = c.return;
    return e.tag === 3 ? (c = e.stateNode, s && t !== null && (s = 31 - ht(l), e = c.hiddenUpdates, r = e[s], r === null ? e[s] = [t] : r.push(t), t.lane = l | 536870912), c) : null;
  }
  function Ki(e) {
    if (50 < Xa)
      throw Xa = 0, ld = null, Error(i(185));
    for (var t = e.return; t !== null; )
      e = t, t = e.return;
    return e.tag === 3 ? e.stateNode : null;
  }
  var Ar = {};
  function wS(e, t, l, r) {
    this.tag = e, this.key = l, this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null, this.index = 0, this.refCleanup = this.ref = null, this.pendingProps = t, this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null, this.mode = r, this.subtreeFlags = this.flags = 0, this.deletions = null, this.childLanes = this.lanes = 0, this.alternate = null;
  }
  function Dn(e, t, l, r) {
    return new wS(e, t, l, r);
  }
  function Ku(e) {
    return e = e.prototype, !(!e || !e.isReactComponent);
  }
  function El(e, t) {
    var l = e.alternate;
    return l === null ? (l = Dn(
      e.tag,
      t,
      e.key,
      e.mode
    ), l.elementType = e.elementType, l.type = e.type, l.stateNode = e.stateNode, l.alternate = e, e.alternate = l) : (l.pendingProps = t, l.type = e.type, l.flags = 0, l.subtreeFlags = 0, l.deletions = null), l.flags = e.flags & 65011712, l.childLanes = e.childLanes, l.lanes = e.lanes, l.child = e.child, l.memoizedProps = e.memoizedProps, l.memoizedState = e.memoizedState, l.updateQueue = e.updateQueue, t = e.dependencies, l.dependencies = t === null ? null : { lanes: t.lanes, firstContext: t.firstContext }, l.sibling = e.sibling, l.index = e.index, l.ref = e.ref, l.refCleanup = e.refCleanup, l;
  }
  function gm(e, t) {
    e.flags &= 65011714;
    var l = e.alternate;
    return l === null ? (e.childLanes = 0, e.lanes = t, e.child = null, e.subtreeFlags = 0, e.memoizedProps = null, e.memoizedState = null, e.updateQueue = null, e.dependencies = null, e.stateNode = null) : (e.childLanes = l.childLanes, e.lanes = l.lanes, e.child = l.child, e.subtreeFlags = 0, e.deletions = null, e.memoizedProps = l.memoizedProps, e.memoizedState = l.memoizedState, e.updateQueue = l.updateQueue, e.type = l.type, t = l.dependencies, e.dependencies = t === null ? null : {
      lanes: t.lanes,
      firstContext: t.firstContext
    }), e;
  }
  function Qi(e, t, l, r, s, c) {
    var y = 0;
    if (r = e, typeof e == "function") Ku(e) && (y = 1);
    else if (typeof e == "string")
      y = C1(
        e,
        l,
        J.current
      ) ? 26 : e === "html" || e === "head" || e === "body" ? 27 : 5;
    else
      e: switch (e) {
        case V:
          return e = Dn(31, l, t, s), e.elementType = V, e.lanes = c, e;
        case M:
          return Go(l.children, s, c, t);
        case T:
          y = 8, s |= 24;
          break;
        case z:
          return e = Dn(12, l, t, s | 2), e.elementType = z, e.lanes = c, e;
        case L:
          return e = Dn(13, l, t, s), e.elementType = L, e.lanes = c, e;
        case D:
          return e = Dn(19, l, t, s), e.elementType = D, e.lanes = c, e;
        default:
          if (typeof e == "object" && e !== null)
            switch (e.$$typeof) {
              case N:
                y = 10;
                break e;
              case w:
                y = 9;
                break e;
              case A:
                y = 11;
                break e;
              case _:
                y = 14;
                break e;
              case j:
                y = 16, r = null;
                break e;
            }
          y = 29, l = Error(
            i(130, e === null ? "null" : typeof e, "")
          ), r = null;
      }
    return t = Dn(y, l, t, s), t.elementType = e, t.type = r, t.lanes = c, t;
  }
  function Go(e, t, l, r) {
    return e = Dn(7, e, r, t), e.lanes = l, e;
  }
  function Qu(e, t, l) {
    return e = Dn(6, e, null, t), e.lanes = l, e;
  }
  function mm(e) {
    var t = Dn(18, null, null, 0);
    return t.stateNode = e, t;
  }
  function Zu(e, t, l) {
    return t = Dn(
      4,
      e.children !== null ? e.children : [],
      e.key,
      t
    ), t.lanes = l, t.stateNode = {
      containerInfo: e.containerInfo,
      pendingChildren: null,
      implementation: e.implementation
    }, t;
  }
  var hm = /* @__PURE__ */ new WeakMap();
  function Fn(e, t) {
    if (typeof e == "object" && e !== null) {
      var l = hm.get(e);
      return l !== void 0 ? l : (t = {
        value: e,
        source: t,
        stack: Ce(t)
      }, hm.set(e, t), t);
    }
    return {
      value: e,
      source: t,
      stack: Ce(t)
    };
  }
  var zr = [], Nr = 0, Zi = null, Ra = 0, Kn = [], Qn = 0, oo = null, sl = 1, cl = "";
  function Tl(e, t) {
    zr[Nr++] = Ra, zr[Nr++] = Zi, Zi = e, Ra = t;
  }
  function ym(e, t, l) {
    Kn[Qn++] = sl, Kn[Qn++] = cl, Kn[Qn++] = oo, oo = e;
    var r = sl;
    e = cl;
    var s = 32 - ht(r) - 1;
    r &= ~(1 << s), l += 1;
    var c = 32 - ht(t) + s;
    if (30 < c) {
      var y = s - s % 5;
      c = (r & (1 << y) - 1).toString(32), r >>= y, s -= y, sl = 1 << 32 - ht(t) + s | l << s | r, cl = c + e;
    } else
      sl = 1 << c | l << s | r, cl = e;
  }
  function Ju(e) {
    e.return !== null && (Tl(e, 1), ym(e, 1, 0));
  }
  function Wu(e) {
    for (; e === Zi; )
      Zi = zr[--Nr], zr[Nr] = null, Ra = zr[--Nr], zr[Nr] = null;
    for (; e === oo; )
      oo = Kn[--Qn], Kn[Qn] = null, cl = Kn[--Qn], Kn[Qn] = null, sl = Kn[--Qn], Kn[Qn] = null;
  }
  function vm(e, t) {
    Kn[Qn++] = sl, Kn[Qn++] = cl, Kn[Qn++] = oo, sl = t.id, cl = t.overflow, oo = e;
  }
  var un = null, Dt = null, st = !1, ro = null, Zn = !1, $u = Error(i(519));
  function ao(e) {
    var t = Error(
      i(
        418,
        1 < arguments.length && arguments[1] !== void 0 && arguments[1] ? "text" : "HTML",
        ""
      )
    );
    throw Ca(Fn(t, e)), $u;
  }
  function bm(e) {
    var t = e.stateNode, l = e.type, r = e.memoizedProps;
    switch (t[Ot] = e, t[cn] = r, l) {
      case "dialog":
        ot("cancel", t), ot("close", t);
        break;
      case "iframe":
      case "object":
      case "embed":
        ot("load", t);
        break;
      case "video":
      case "audio":
        for (l = 0; l < Ka.length; l++)
          ot(Ka[l], t);
        break;
      case "source":
        ot("error", t);
        break;
      case "img":
      case "image":
      case "link":
        ot("error", t), ot("load", t);
        break;
      case "details":
        ot("toggle", t);
        break;
      case "input":
        ot("invalid", t), jg(
          t,
          r.value,
          r.defaultValue,
          r.checked,
          r.defaultChecked,
          r.type,
          r.name,
          !0
        );
        break;
      case "select":
        ot("invalid", t);
        break;
      case "textarea":
        ot("invalid", t), kg(t, r.value, r.defaultValue, r.children);
    }
    l = r.children, typeof l != "string" && typeof l != "number" && typeof l != "bigint" || t.textContent === "" + l || r.suppressHydrationWarning === !0 || Hy(t.textContent, l) ? (r.popover != null && (ot("beforetoggle", t), ot("toggle", t)), r.onScroll != null && ot("scroll", t), r.onScrollEnd != null && ot("scrollend", t), r.onClick != null && (t.onclick = wl), t = !0) : t = !1, t || ao(e, !0);
  }
  function xm(e) {
    for (un = e.return; un; )
      switch (un.tag) {
        case 5:
        case 31:
        case 13:
          Zn = !1;
          return;
        case 27:
        case 3:
          Zn = !0;
          return;
        default:
          un = un.return;
      }
  }
  function jr(e) {
    if (e !== un) return !1;
    if (!st) return xm(e), st = !0, !1;
    var t = e.tag, l;
    if ((l = t !== 3 && t !== 27) && ((l = t === 5) && (l = e.type, l = !(l !== "form" && l !== "button") || vd(e.type, e.memoizedProps)), l = !l), l && Dt && ao(e), xm(e), t === 13) {
      if (e = e.memoizedState, e = e !== null ? e.dehydrated : null, !e) throw Error(i(317));
      Dt = qy(e);
    } else if (t === 31) {
      if (e = e.memoizedState, e = e !== null ? e.dehydrated : null, !e) throw Error(i(317));
      Dt = qy(e);
    } else
      t === 27 ? (t = Dt, wo(e.type) ? (e = Ed, Ed = null, Dt = e) : Dt = t) : Dt = un ? Wn(e.stateNode.nextSibling) : null;
    return !0;
  }
  function qo() {
    Dt = un = null, st = !1;
  }
  function ef() {
    var e = ro;
    return e !== null && (On === null ? On = e : On.push.apply(
      On,
      e
    ), ro = null), e;
  }
  function Ca(e) {
    ro === null ? ro = [e] : ro.push(e);
  }
  var tf = O(null), Xo = null, Rl = null;
  function io(e, t, l) {
    ee(tf, t._currentValue), t._currentValue = l;
  }
  function Cl(e) {
    e._currentValue = tf.current, H(tf);
  }
  function nf(e, t, l) {
    for (; e !== null; ) {
      var r = e.alternate;
      if ((e.childLanes & t) !== t ? (e.childLanes |= t, r !== null && (r.childLanes |= t)) : r !== null && (r.childLanes & t) !== t && (r.childLanes |= t), e === l) break;
      e = e.return;
    }
  }
  function lf(e, t, l, r) {
    var s = e.child;
    for (s !== null && (s.return = e); s !== null; ) {
      var c = s.dependencies;
      if (c !== null) {
        var y = s.child;
        c = c.firstContext;
        e: for (; c !== null; ) {
          var R = c;
          c = s;
          for (var U = 0; U < t.length; U++)
            if (R.context === t[U]) {
              c.lanes |= l, R = c.alternate, R !== null && (R.lanes |= l), nf(
                c.return,
                l,
                e
              ), r || (y = null);
              break e;
            }
          c = R.next;
        }
      } else if (s.tag === 18) {
        if (y = s.return, y === null) throw Error(i(341));
        y.lanes |= l, c = y.alternate, c !== null && (c.lanes |= l), nf(y, l, e), y = null;
      } else y = s.child;
      if (y !== null) y.return = s;
      else
        for (y = s; y !== null; ) {
          if (y === e) {
            y = null;
            break;
          }
          if (s = y.sibling, s !== null) {
            s.return = y.return, y = s;
            break;
          }
          y = y.return;
        }
      s = y;
    }
  }
  function Dr(e, t, l, r) {
    e = null;
    for (var s = t, c = !1; s !== null; ) {
      if (!c) {
        if ((s.flags & 524288) !== 0) c = !0;
        else if ((s.flags & 262144) !== 0) break;
      }
      if (s.tag === 10) {
        var y = s.alternate;
        if (y === null) throw Error(i(387));
        if (y = y.memoizedProps, y !== null) {
          var R = s.type;
          jn(s.pendingProps.value, y.value) || (e !== null ? e.push(R) : e = [R]);
        }
      } else if (s === re.current) {
        if (y = s.alternate, y === null) throw Error(i(387));
        y.memoizedState.memoizedState !== s.memoizedState.memoizedState && (e !== null ? e.push($a) : e = [$a]);
      }
      s = s.return;
    }
    e !== null && lf(
      t,
      e,
      l,
      r
    ), t.flags |= 262144;
  }
  function Ji(e) {
    for (e = e.firstContext; e !== null; ) {
      if (!jn(
        e.context._currentValue,
        e.memoizedValue
      ))
        return !0;
      e = e.next;
    }
    return !1;
  }
  function Fo(e) {
    Xo = e, Rl = null, e = e.dependencies, e !== null && (e.firstContext = null);
  }
  function fn(e) {
    return wm(Xo, e);
  }
  function Wi(e, t) {
    return Xo === null && Fo(e), wm(e, t);
  }
  function wm(e, t) {
    var l = t._currentValue;
    if (t = { context: t, memoizedValue: l, next: null }, Rl === null) {
      if (e === null) throw Error(i(308));
      Rl = t, e.dependencies = { lanes: 0, firstContext: t }, e.flags |= 524288;
    } else Rl = Rl.next = t;
    return l;
  }
  var SS = typeof AbortController < "u" ? AbortController : function() {
    var e = [], t = this.signal = {
      aborted: !1,
      addEventListener: function(l, r) {
        e.push(r);
      }
    };
    this.abort = function() {
      t.aborted = !0, e.forEach(function(l) {
        return l();
      });
    };
  }, ES = n.unstable_scheduleCallback, TS = n.unstable_NormalPriority, Qt = {
    $$typeof: N,
    Consumer: null,
    Provider: null,
    _currentValue: null,
    _currentValue2: null,
    _threadCount: 0
  };
  function of() {
    return {
      controller: new SS(),
      data: /* @__PURE__ */ new Map(),
      refCount: 0
    };
  }
  function Oa(e) {
    e.refCount--, e.refCount === 0 && ES(TS, function() {
      e.controller.abort();
    });
  }
  var Ma = null, rf = 0, kr = 0, _r = null;
  function RS(e, t) {
    if (Ma === null) {
      var l = Ma = [];
      rf = 0, kr = cd(), _r = {
        status: "pending",
        value: void 0,
        then: function(r) {
          l.push(r);
        }
      };
    }
    return rf++, t.then(Sm, Sm), t;
  }
  function Sm() {
    if (--rf === 0 && Ma !== null) {
      _r !== null && (_r.status = "fulfilled");
      var e = Ma;
      Ma = null, kr = 0, _r = null;
      for (var t = 0; t < e.length; t++) (0, e[t])();
    }
  }
  function CS(e, t) {
    var l = [], r = {
      status: "pending",
      value: null,
      reason: null,
      then: function(s) {
        l.push(s);
      }
    };
    return e.then(
      function() {
        r.status = "fulfilled", r.value = t;
        for (var s = 0; s < l.length; s++) (0, l[s])(t);
      },
      function(s) {
        for (r.status = "rejected", r.reason = s, s = 0; s < l.length; s++)
          (0, l[s])(void 0);
      }
    ), r;
  }
  var Em = k.S;
  k.S = function(e, t) {
    ay = ae(), typeof t == "object" && t !== null && typeof t.then == "function" && RS(e, t), Em !== null && Em(e, t);
  };
  var Ko = O(null);
  function af() {
    var e = Ko.current;
    return e !== null ? e : Mt.pooledCache;
  }
  function $i(e, t) {
    t === null ? ee(Ko, Ko.current) : ee(Ko, t.pool);
  }
  function Tm() {
    var e = af();
    return e === null ? null : { parent: Qt._currentValue, pool: e };
  }
  var Hr = Error(i(460)), sf = Error(i(474)), es = Error(i(542)), ts = { then: function() {
  } };
  function Rm(e) {
    return e = e.status, e === "fulfilled" || e === "rejected";
  }
  function Cm(e, t, l) {
    switch (l = e[l], l === void 0 ? e.push(t) : l !== t && (t.then(wl, wl), t = l), t.status) {
      case "fulfilled":
        return t.value;
      case "rejected":
        throw e = t.reason, Mm(e), e;
      default:
        if (typeof t.status == "string") t.then(wl, wl);
        else {
          if (e = Mt, e !== null && 100 < e.shellSuspendCounter)
            throw Error(i(482));
          e = t, e.status = "pending", e.then(
            function(r) {
              if (t.status === "pending") {
                var s = t;
                s.status = "fulfilled", s.value = r;
              }
            },
            function(r) {
              if (t.status === "pending") {
                var s = t;
                s.status = "rejected", s.reason = r;
              }
            }
          );
        }
        switch (t.status) {
          case "fulfilled":
            return t.value;
          case "rejected":
            throw e = t.reason, Mm(e), e;
        }
        throw Zo = t, Hr;
    }
  }
  function Qo(e) {
    try {
      var t = e._init;
      return t(e._payload);
    } catch (l) {
      throw l !== null && typeof l == "object" && typeof l.then == "function" ? (Zo = l, Hr) : l;
    }
  }
  var Zo = null;
  function Om() {
    if (Zo === null) throw Error(i(459));
    var e = Zo;
    return Zo = null, e;
  }
  function Mm(e) {
    if (e === Hr || e === es)
      throw Error(i(483));
  }
  var Lr = null, Aa = 0;
  function ns(e) {
    var t = Aa;
    return Aa += 1, Lr === null && (Lr = []), Cm(Lr, e, t);
  }
  function za(e, t) {
    t = t.props.ref, e.ref = t !== void 0 ? t : null;
  }
  function ls(e, t) {
    throw t.$$typeof === S ? Error(i(525)) : (e = Object.prototype.toString.call(t), Error(
      i(
        31,
        e === "[object Object]" ? "object with keys {" + Object.keys(t).join(", ") + "}" : e
      )
    ));
  }
  function Am(e) {
    function t(K, Y) {
      if (e) {
        var W = K.deletions;
        W === null ? (K.deletions = [Y], K.flags |= 16) : W.push(Y);
      }
    }
    function l(K, Y) {
      if (!e) return null;
      for (; Y !== null; )
        t(K, Y), Y = Y.sibling;
      return null;
    }
    function r(K) {
      for (var Y = /* @__PURE__ */ new Map(); K !== null; )
        K.key !== null ? Y.set(K.key, K) : Y.set(K.index, K), K = K.sibling;
      return Y;
    }
    function s(K, Y) {
      return K = El(K, Y), K.index = 0, K.sibling = null, K;
    }
    function c(K, Y, W) {
      return K.index = W, e ? (W = K.alternate, W !== null ? (W = W.index, W < Y ? (K.flags |= 67108866, Y) : W) : (K.flags |= 67108866, Y)) : (K.flags |= 1048576, Y);
    }
    function y(K) {
      return e && K.alternate === null && (K.flags |= 67108866), K;
    }
    function R(K, Y, W, fe) {
      return Y === null || Y.tag !== 6 ? (Y = Qu(W, K.mode, fe), Y.return = K, Y) : (Y = s(Y, W), Y.return = K, Y);
    }
    function U(K, Y, W, fe) {
      var Be = W.type;
      return Be === M ? ce(
        K,
        Y,
        W.props.children,
        fe,
        W.key
      ) : Y !== null && (Y.elementType === Be || typeof Be == "object" && Be !== null && Be.$$typeof === j && Qo(Be) === Y.type) ? (Y = s(Y, W.props), za(Y, W), Y.return = K, Y) : (Y = Qi(
        W.type,
        W.key,
        W.props,
        null,
        K.mode,
        fe
      ), za(Y, W), Y.return = K, Y);
    }
    function $(K, Y, W, fe) {
      return Y === null || Y.tag !== 4 || Y.stateNode.containerInfo !== W.containerInfo || Y.stateNode.implementation !== W.implementation ? (Y = Zu(W, K.mode, fe), Y.return = K, Y) : (Y = s(Y, W.children || []), Y.return = K, Y);
    }
    function ce(K, Y, W, fe, Be) {
      return Y === null || Y.tag !== 7 ? (Y = Go(
        W,
        K.mode,
        fe,
        Be
      ), Y.return = K, Y) : (Y = s(Y, W), Y.return = K, Y);
    }
    function de(K, Y, W) {
      if (typeof Y == "string" && Y !== "" || typeof Y == "number" || typeof Y == "bigint")
        return Y = Qu(
          "" + Y,
          K.mode,
          W
        ), Y.return = K, Y;
      if (typeof Y == "object" && Y !== null) {
        switch (Y.$$typeof) {
          case C:
            return W = Qi(
              Y.type,
              Y.key,
              Y.props,
              null,
              K.mode,
              W
            ), za(W, Y), W.return = K, W;
          case E:
            return Y = Zu(
              Y,
              K.mode,
              W
            ), Y.return = K, Y;
          case j:
            return Y = Qo(Y), de(K, Y, W);
        }
        if (q(Y) || F(Y))
          return Y = Go(
            Y,
            K.mode,
            W,
            null
          ), Y.return = K, Y;
        if (typeof Y.then == "function")
          return de(K, ns(Y), W);
        if (Y.$$typeof === N)
          return de(
            K,
            Wi(K, Y),
            W
          );
        ls(K, Y);
      }
      return null;
    }
    function te(K, Y, W, fe) {
      var Be = Y !== null ? Y.key : null;
      if (typeof W == "string" && W !== "" || typeof W == "number" || typeof W == "bigint")
        return Be !== null ? null : R(K, Y, "" + W, fe);
      if (typeof W == "object" && W !== null) {
        switch (W.$$typeof) {
          case C:
            return W.key === Be ? U(K, Y, W, fe) : null;
          case E:
            return W.key === Be ? $(K, Y, W, fe) : null;
          case j:
            return W = Qo(W), te(K, Y, W, fe);
        }
        if (q(W) || F(W))
          return Be !== null ? null : ce(K, Y, W, fe, null);
        if (typeof W.then == "function")
          return te(
            K,
            Y,
            ns(W),
            fe
          );
        if (W.$$typeof === N)
          return te(
            K,
            Y,
            Wi(K, W),
            fe
          );
        ls(K, W);
      }
      return null;
    }
    function oe(K, Y, W, fe, Be) {
      if (typeof fe == "string" && fe !== "" || typeof fe == "number" || typeof fe == "bigint")
        return K = K.get(W) || null, R(Y, K, "" + fe, Be);
      if (typeof fe == "object" && fe !== null) {
        switch (fe.$$typeof) {
          case C:
            return K = K.get(
              fe.key === null ? W : fe.key
            ) || null, U(Y, K, fe, Be);
          case E:
            return K = K.get(
              fe.key === null ? W : fe.key
            ) || null, $(Y, K, fe, Be);
          case j:
            return fe = Qo(fe), oe(
              K,
              Y,
              W,
              fe,
              Be
            );
        }
        if (q(fe) || F(fe))
          return K = K.get(W) || null, ce(Y, K, fe, Be, null);
        if (typeof fe.then == "function")
          return oe(
            K,
            Y,
            W,
            ns(fe),
            Be
          );
        if (fe.$$typeof === N)
          return oe(
            K,
            Y,
            W,
            Wi(Y, fe),
            Be
          );
        ls(Y, fe);
      }
      return null;
    }
    function Ne(K, Y, W, fe) {
      for (var Be = null, ct = null, _e = Y, Ke = Y = 0, it = null; _e !== null && Ke < W.length; Ke++) {
        _e.index > Ke ? (it = _e, _e = null) : it = _e.sibling;
        var ut = te(
          K,
          _e,
          W[Ke],
          fe
        );
        if (ut === null) {
          _e === null && (_e = it);
          break;
        }
        e && _e && ut.alternate === null && t(K, _e), Y = c(ut, Y, Ke), ct === null ? Be = ut : ct.sibling = ut, ct = ut, _e = it;
      }
      if (Ke === W.length)
        return l(K, _e), st && Tl(K, Ke), Be;
      if (_e === null) {
        for (; Ke < W.length; Ke++)
          _e = de(K, W[Ke], fe), _e !== null && (Y = c(
            _e,
            Y,
            Ke
          ), ct === null ? Be = _e : ct.sibling = _e, ct = _e);
        return st && Tl(K, Ke), Be;
      }
      for (_e = r(_e); Ke < W.length; Ke++)
        it = oe(
          _e,
          K,
          Ke,
          W[Ke],
          fe
        ), it !== null && (e && it.alternate !== null && _e.delete(
          it.key === null ? Ke : it.key
        ), Y = c(
          it,
          Y,
          Ke
        ), ct === null ? Be = it : ct.sibling = it, ct = it);
      return e && _e.forEach(function(Co) {
        return t(K, Co);
      }), st && Tl(K, Ke), Be;
    }
    function Ie(K, Y, W, fe) {
      if (W == null) throw Error(i(151));
      for (var Be = null, ct = null, _e = Y, Ke = Y = 0, it = null, ut = W.next(); _e !== null && !ut.done; Ke++, ut = W.next()) {
        _e.index > Ke ? (it = _e, _e = null) : it = _e.sibling;
        var Co = te(K, _e, ut.value, fe);
        if (Co === null) {
          _e === null && (_e = it);
          break;
        }
        e && _e && Co.alternate === null && t(K, _e), Y = c(Co, Y, Ke), ct === null ? Be = Co : ct.sibling = Co, ct = Co, _e = it;
      }
      if (ut.done)
        return l(K, _e), st && Tl(K, Ke), Be;
      if (_e === null) {
        for (; !ut.done; Ke++, ut = W.next())
          ut = de(K, ut.value, fe), ut !== null && (Y = c(ut, Y, Ke), ct === null ? Be = ut : ct.sibling = ut, ct = ut);
        return st && Tl(K, Ke), Be;
      }
      for (_e = r(_e); !ut.done; Ke++, ut = W.next())
        ut = oe(_e, K, Ke, ut.value, fe), ut !== null && (e && ut.alternate !== null && _e.delete(ut.key === null ? Ke : ut.key), Y = c(ut, Y, Ke), ct === null ? Be = ut : ct.sibling = ut, ct = ut);
      return e && _e.forEach(function(L1) {
        return t(K, L1);
      }), st && Tl(K, Ke), Be;
    }
    function Et(K, Y, W, fe) {
      if (typeof W == "object" && W !== null && W.type === M && W.key === null && (W = W.props.children), typeof W == "object" && W !== null) {
        switch (W.$$typeof) {
          case C:
            e: {
              for (var Be = W.key; Y !== null; ) {
                if (Y.key === Be) {
                  if (Be = W.type, Be === M) {
                    if (Y.tag === 7) {
                      l(
                        K,
                        Y.sibling
                      ), fe = s(
                        Y,
                        W.props.children
                      ), fe.return = K, K = fe;
                      break e;
                    }
                  } else if (Y.elementType === Be || typeof Be == "object" && Be !== null && Be.$$typeof === j && Qo(Be) === Y.type) {
                    l(
                      K,
                      Y.sibling
                    ), fe = s(Y, W.props), za(fe, W), fe.return = K, K = fe;
                    break e;
                  }
                  l(K, Y);
                  break;
                } else t(K, Y);
                Y = Y.sibling;
              }
              W.type === M ? (fe = Go(
                W.props.children,
                K.mode,
                fe,
                W.key
              ), fe.return = K, K = fe) : (fe = Qi(
                W.type,
                W.key,
                W.props,
                null,
                K.mode,
                fe
              ), za(fe, W), fe.return = K, K = fe);
            }
            return y(K);
          case E:
            e: {
              for (Be = W.key; Y !== null; ) {
                if (Y.key === Be)
                  if (Y.tag === 4 && Y.stateNode.containerInfo === W.containerInfo && Y.stateNode.implementation === W.implementation) {
                    l(
                      K,
                      Y.sibling
                    ), fe = s(Y, W.children || []), fe.return = K, K = fe;
                    break e;
                  } else {
                    l(K, Y);
                    break;
                  }
                else t(K, Y);
                Y = Y.sibling;
              }
              fe = Zu(W, K.mode, fe), fe.return = K, K = fe;
            }
            return y(K);
          case j:
            return W = Qo(W), Et(
              K,
              Y,
              W,
              fe
            );
        }
        if (q(W))
          return Ne(
            K,
            Y,
            W,
            fe
          );
        if (F(W)) {
          if (Be = F(W), typeof Be != "function") throw Error(i(150));
          return W = Be.call(W), Ie(
            K,
            Y,
            W,
            fe
          );
        }
        if (typeof W.then == "function")
          return Et(
            K,
            Y,
            ns(W),
            fe
          );
        if (W.$$typeof === N)
          return Et(
            K,
            Y,
            Wi(K, W),
            fe
          );
        ls(K, W);
      }
      return typeof W == "string" && W !== "" || typeof W == "number" || typeof W == "bigint" ? (W = "" + W, Y !== null && Y.tag === 6 ? (l(K, Y.sibling), fe = s(Y, W), fe.return = K, K = fe) : (l(K, Y), fe = Qu(W, K.mode, fe), fe.return = K, K = fe), y(K)) : l(K, Y);
    }
    return function(K, Y, W, fe) {
      try {
        Aa = 0;
        var Be = Et(
          K,
          Y,
          W,
          fe
        );
        return Lr = null, Be;
      } catch (_e) {
        if (_e === Hr || _e === es) throw _e;
        var ct = Dn(29, _e, null, K.mode);
        return ct.lanes = fe, ct.return = K, ct;
      }
    };
  }
  var Jo = Am(!0), zm = Am(!1), so = !1;
  function cf(e) {
    e.updateQueue = {
      baseState: e.memoizedState,
      firstBaseUpdate: null,
      lastBaseUpdate: null,
      shared: { pending: null, lanes: 0, hiddenCallbacks: null },
      callbacks: null
    };
  }
  function uf(e, t) {
    e = e.updateQueue, t.updateQueue === e && (t.updateQueue = {
      baseState: e.baseState,
      firstBaseUpdate: e.firstBaseUpdate,
      lastBaseUpdate: e.lastBaseUpdate,
      shared: e.shared,
      callbacks: null
    });
  }
  function co(e) {
    return { lane: e, tag: 0, payload: null, callback: null, next: null };
  }
  function uo(e, t, l) {
    var r = e.updateQueue;
    if (r === null) return null;
    if (r = r.shared, (dt & 2) !== 0) {
      var s = r.pending;
      return s === null ? t.next = t : (t.next = s.next, s.next = t), r.pending = t, t = Ki(e), pm(e, null, l), t;
    }
    return Fi(e, r, t, l), Ki(e);
  }
  function Na(e, t, l) {
    if (t = t.updateQueue, t !== null && (t = t.shared, (l & 4194048) !== 0)) {
      var r = t.lanes;
      r &= e.pendingLanes, l |= r, t.lanes = l, nl(e, l);
    }
  }
  function ff(e, t) {
    var l = e.updateQueue, r = e.alternate;
    if (r !== null && (r = r.updateQueue, l === r)) {
      var s = null, c = null;
      if (l = l.firstBaseUpdate, l !== null) {
        do {
          var y = {
            lane: l.lane,
            tag: l.tag,
            payload: l.payload,
            callback: null,
            next: null
          };
          c === null ? s = c = y : c = c.next = y, l = l.next;
        } while (l !== null);
        c === null ? s = c = t : c = c.next = t;
      } else s = c = t;
      l = {
        baseState: r.baseState,
        firstBaseUpdate: s,
        lastBaseUpdate: c,
        shared: r.shared,
        callbacks: r.callbacks
      }, e.updateQueue = l;
      return;
    }
    e = l.lastBaseUpdate, e === null ? l.firstBaseUpdate = t : e.next = t, l.lastBaseUpdate = t;
  }
  var df = !1;
  function ja() {
    if (df) {
      var e = _r;
      if (e !== null) throw e;
    }
  }
  function Da(e, t, l, r) {
    df = !1;
    var s = e.updateQueue;
    so = !1;
    var c = s.firstBaseUpdate, y = s.lastBaseUpdate, R = s.shared.pending;
    if (R !== null) {
      s.shared.pending = null;
      var U = R, $ = U.next;
      U.next = null, y === null ? c = $ : y.next = $, y = U;
      var ce = e.alternate;
      ce !== null && (ce = ce.updateQueue, R = ce.lastBaseUpdate, R !== y && (R === null ? ce.firstBaseUpdate = $ : R.next = $, ce.lastBaseUpdate = U));
    }
    if (c !== null) {
      var de = s.baseState;
      y = 0, ce = $ = U = null, R = c;
      do {
        var te = R.lane & -536870913, oe = te !== R.lane;
        if (oe ? (at & te) === te : (r & te) === te) {
          te !== 0 && te === kr && (df = !0), ce !== null && (ce = ce.next = {
            lane: 0,
            tag: R.tag,
            payload: R.payload,
            callback: null,
            next: null
          });
          e: {
            var Ne = e, Ie = R;
            te = t;
            var Et = l;
            switch (Ie.tag) {
              case 1:
                if (Ne = Ie.payload, typeof Ne == "function") {
                  de = Ne.call(Et, de, te);
                  break e;
                }
                de = Ne;
                break e;
              case 3:
                Ne.flags = Ne.flags & -65537 | 128;
              case 0:
                if (Ne = Ie.payload, te = typeof Ne == "function" ? Ne.call(Et, de, te) : Ne, te == null) break e;
                de = x({}, de, te);
                break e;
              case 2:
                so = !0;
            }
          }
          te = R.callback, te !== null && (e.flags |= 64, oe && (e.flags |= 8192), oe = s.callbacks, oe === null ? s.callbacks = [te] : oe.push(te));
        } else
          oe = {
            lane: te,
            tag: R.tag,
            payload: R.payload,
            callback: R.callback,
            next: null
          }, ce === null ? ($ = ce = oe, U = de) : ce = ce.next = oe, y |= te;
        if (R = R.next, R === null) {
          if (R = s.shared.pending, R === null)
            break;
          oe = R, R = oe.next, oe.next = null, s.lastBaseUpdate = oe, s.shared.pending = null;
        }
      } while (!0);
      ce === null && (U = de), s.baseState = U, s.firstBaseUpdate = $, s.lastBaseUpdate = ce, c === null && (s.shared.lanes = 0), ho |= y, e.lanes = y, e.memoizedState = de;
    }
  }
  function Nm(e, t) {
    if (typeof e != "function")
      throw Error(i(191, e));
    e.call(t);
  }
  function jm(e, t) {
    var l = e.callbacks;
    if (l !== null)
      for (e.callbacks = null, e = 0; e < l.length; e++)
        Nm(l[e], t);
  }
  var Ur = O(null), os = O(0);
  function Dm(e, t) {
    e = _l, ee(os, e), ee(Ur, t), _l = e | t.baseLanes;
  }
  function pf() {
    ee(os, _l), ee(Ur, Ur.current);
  }
  function gf() {
    _l = os.current, H(Ur), H(os);
  }
  var kn = O(null), Jn = null;
  function fo(e) {
    var t = e.alternate;
    ee(Ft, Ft.current & 1), ee(kn, e), Jn === null && (t === null || Ur.current !== null || t.memoizedState !== null) && (Jn = e);
  }
  function mf(e) {
    ee(Ft, Ft.current), ee(kn, e), Jn === null && (Jn = e);
  }
  function km(e) {
    e.tag === 22 ? (ee(Ft, Ft.current), ee(kn, e), Jn === null && (Jn = e)) : po();
  }
  function po() {
    ee(Ft, Ft.current), ee(kn, kn.current);
  }
  function _n(e) {
    H(kn), Jn === e && (Jn = null), H(Ft);
  }
  var Ft = O(0);
  function rs(e) {
    for (var t = e; t !== null; ) {
      if (t.tag === 13) {
        var l = t.memoizedState;
        if (l !== null && (l = l.dehydrated, l === null || wd(l) || Sd(l)))
          return t;
      } else if (t.tag === 19 && (t.memoizedProps.revealOrder === "forwards" || t.memoizedProps.revealOrder === "backwards" || t.memoizedProps.revealOrder === "unstable_legacy-backwards" || t.memoizedProps.revealOrder === "together")) {
        if ((t.flags & 128) !== 0) return t;
      } else if (t.child !== null) {
        t.child.return = t, t = t.child;
        continue;
      }
      if (t === e) break;
      for (; t.sibling === null; ) {
        if (t.return === null || t.return === e) return null;
        t = t.return;
      }
      t.sibling.return = t.return, t = t.sibling;
    }
    return null;
  }
  var Ol = 0, Xe = null, wt = null, Zt = null, as = !1, Br = !1, Wo = !1, is = 0, ka = 0, Ir = null, OS = 0;
  function Bt() {
    throw Error(i(321));
  }
  function hf(e, t) {
    if (t === null) return !1;
    for (var l = 0; l < t.length && l < e.length; l++)
      if (!jn(e[l], t[l])) return !1;
    return !0;
  }
  function yf(e, t, l, r, s, c) {
    return Ol = c, Xe = t, t.memoizedState = null, t.updateQueue = null, t.lanes = 0, k.H = e === null || e.memoizedState === null ? yh : jf, Wo = !1, c = l(r, s), Wo = !1, Br && (c = Hm(
      t,
      l,
      r,
      s
    )), _m(e), c;
  }
  function _m(e) {
    k.H = La;
    var t = wt !== null && wt.next !== null;
    if (Ol = 0, Zt = wt = Xe = null, as = !1, ka = 0, Ir = null, t) throw Error(i(300));
    e === null || Jt || (e = e.dependencies, e !== null && Ji(e) && (Jt = !0));
  }
  function Hm(e, t, l, r) {
    Xe = e;
    var s = 0;
    do {
      if (Br && (Ir = null), ka = 0, Br = !1, 25 <= s) throw Error(i(301));
      if (s += 1, Zt = wt = null, e.updateQueue != null) {
        var c = e.updateQueue;
        c.lastEffect = null, c.events = null, c.stores = null, c.memoCache != null && (c.memoCache.index = 0);
      }
      k.H = vh, c = t(l, r);
    } while (Br);
    return c;
  }
  function MS() {
    var e = k.H, t = e.useState()[0];
    return t = typeof t.then == "function" ? _a(t) : t, e = e.useState()[0], (wt !== null ? wt.memoizedState : null) !== e && (Xe.flags |= 1024), t;
  }
  function vf() {
    var e = is !== 0;
    return is = 0, e;
  }
  function bf(e, t, l) {
    t.updateQueue = e.updateQueue, t.flags &= -2053, e.lanes &= ~l;
  }
  function xf(e) {
    if (as) {
      for (e = e.memoizedState; e !== null; ) {
        var t = e.queue;
        t !== null && (t.pending = null), e = e.next;
      }
      as = !1;
    }
    Ol = 0, Zt = wt = Xe = null, Br = !1, ka = is = 0, Ir = null;
  }
  function vn() {
    var e = {
      memoizedState: null,
      baseState: null,
      baseQueue: null,
      queue: null,
      next: null
    };
    return Zt === null ? Xe.memoizedState = Zt = e : Zt = Zt.next = e, Zt;
  }
  function Kt() {
    if (wt === null) {
      var e = Xe.alternate;
      e = e !== null ? e.memoizedState : null;
    } else e = wt.next;
    var t = Zt === null ? Xe.memoizedState : Zt.next;
    if (t !== null)
      Zt = t, wt = e;
    else {
      if (e === null)
        throw Xe.alternate === null ? Error(i(467)) : Error(i(310));
      wt = e, e = {
        memoizedState: wt.memoizedState,
        baseState: wt.baseState,
        baseQueue: wt.baseQueue,
        queue: wt.queue,
        next: null
      }, Zt === null ? Xe.memoizedState = Zt = e : Zt = Zt.next = e;
    }
    return Zt;
  }
  function ss() {
    return { lastEffect: null, events: null, stores: null, memoCache: null };
  }
  function _a(e) {
    var t = ka;
    return ka += 1, Ir === null && (Ir = []), e = Cm(Ir, e, t), t = Xe, (Zt === null ? t.memoizedState : Zt.next) === null && (t = t.alternate, k.H = t === null || t.memoizedState === null ? yh : jf), e;
  }
  function cs(e) {
    if (e !== null && typeof e == "object") {
      if (typeof e.then == "function") return _a(e);
      if (e.$$typeof === N) return fn(e);
    }
    throw Error(i(438, String(e)));
  }
  function wf(e) {
    var t = null, l = Xe.updateQueue;
    if (l !== null && (t = l.memoCache), t == null) {
      var r = Xe.alternate;
      r !== null && (r = r.updateQueue, r !== null && (r = r.memoCache, r != null && (t = {
        data: r.data.map(function(s) {
          return s.slice();
        }),
        index: 0
      })));
    }
    if (t == null && (t = { data: [], index: 0 }), l === null && (l = ss(), Xe.updateQueue = l), l.memoCache = t, l = t.data[t.index], l === void 0)
      for (l = t.data[t.index] = Array(e), r = 0; r < e; r++)
        l[r] = G;
    return t.index++, l;
  }
  function Ml(e, t) {
    return typeof t == "function" ? t(e) : t;
  }
  function us(e) {
    var t = Kt();
    return Sf(t, wt, e);
  }
  function Sf(e, t, l) {
    var r = e.queue;
    if (r === null) throw Error(i(311));
    r.lastRenderedReducer = l;
    var s = e.baseQueue, c = r.pending;
    if (c !== null) {
      if (s !== null) {
        var y = s.next;
        s.next = c.next, c.next = y;
      }
      t.baseQueue = s = c, r.pending = null;
    }
    if (c = e.baseState, s === null) e.memoizedState = c;
    else {
      t = s.next;
      var R = y = null, U = null, $ = t, ce = !1;
      do {
        var de = $.lane & -536870913;
        if (de !== $.lane ? (at & de) === de : (Ol & de) === de) {
          var te = $.revertLane;
          if (te === 0)
            U !== null && (U = U.next = {
              lane: 0,
              revertLane: 0,
              gesture: null,
              action: $.action,
              hasEagerState: $.hasEagerState,
              eagerState: $.eagerState,
              next: null
            }), de === kr && (ce = !0);
          else if ((Ol & te) === te) {
            $ = $.next, te === kr && (ce = !0);
            continue;
          } else
            de = {
              lane: 0,
              revertLane: $.revertLane,
              gesture: null,
              action: $.action,
              hasEagerState: $.hasEagerState,
              eagerState: $.eagerState,
              next: null
            }, U === null ? (R = U = de, y = c) : U = U.next = de, Xe.lanes |= te, ho |= te;
          de = $.action, Wo && l(c, de), c = $.hasEagerState ? $.eagerState : l(c, de);
        } else
          te = {
            lane: de,
            revertLane: $.revertLane,
            gesture: $.gesture,
            action: $.action,
            hasEagerState: $.hasEagerState,
            eagerState: $.eagerState,
            next: null
          }, U === null ? (R = U = te, y = c) : U = U.next = te, Xe.lanes |= de, ho |= de;
        $ = $.next;
      } while ($ !== null && $ !== t);
      if (U === null ? y = c : U.next = R, !jn(c, e.memoizedState) && (Jt = !0, ce && (l = _r, l !== null)))
        throw l;
      e.memoizedState = c, e.baseState = y, e.baseQueue = U, r.lastRenderedState = c;
    }
    return s === null && (r.lanes = 0), [e.memoizedState, r.dispatch];
  }
  function Ef(e) {
    var t = Kt(), l = t.queue;
    if (l === null) throw Error(i(311));
    l.lastRenderedReducer = e;
    var r = l.dispatch, s = l.pending, c = t.memoizedState;
    if (s !== null) {
      l.pending = null;
      var y = s = s.next;
      do
        c = e(c, y.action), y = y.next;
      while (y !== s);
      jn(c, t.memoizedState) || (Jt = !0), t.memoizedState = c, t.baseQueue === null && (t.baseState = c), l.lastRenderedState = c;
    }
    return [c, r];
  }
  function Lm(e, t, l) {
    var r = Xe, s = Kt(), c = st;
    if (c) {
      if (l === void 0) throw Error(i(407));
      l = l();
    } else l = t();
    var y = !jn(
      (wt || s).memoizedState,
      l
    );
    if (y && (s.memoizedState = l, Jt = !0), s = s.queue, Cf(Im.bind(null, r, s, e), [
      e
    ]), s.getSnapshot !== t || y || Zt !== null && Zt.memoizedState.tag & 1) {
      if (r.flags |= 2048, Vr(
        9,
        { destroy: void 0 },
        Bm.bind(
          null,
          r,
          s,
          l,
          t
        ),
        null
      ), Mt === null) throw Error(i(349));
      c || (Ol & 127) !== 0 || Um(r, t, l);
    }
    return l;
  }
  function Um(e, t, l) {
    e.flags |= 16384, e = { getSnapshot: t, value: l }, t = Xe.updateQueue, t === null ? (t = ss(), Xe.updateQueue = t, t.stores = [e]) : (l = t.stores, l === null ? t.stores = [e] : l.push(e));
  }
  function Bm(e, t, l, r) {
    t.value = l, t.getSnapshot = r, Vm(t) && Pm(e);
  }
  function Im(e, t, l) {
    return l(function() {
      Vm(t) && Pm(e);
    });
  }
  function Vm(e) {
    var t = e.getSnapshot;
    e = e.value;
    try {
      var l = t();
      return !jn(e, l);
    } catch {
      return !0;
    }
  }
  function Pm(e) {
    var t = Yo(e, 2);
    t !== null && Mn(t, e, 2);
  }
  function Tf(e) {
    var t = vn();
    if (typeof e == "function") {
      var l = e;
      if (e = l(), Wo) {
        zt(!0);
        try {
          l();
        } finally {
          zt(!1);
        }
      }
    }
    return t.memoizedState = t.baseState = e, t.queue = {
      pending: null,
      lanes: 0,
      dispatch: null,
      lastRenderedReducer: Ml,
      lastRenderedState: e
    }, t;
  }
  function Ym(e, t, l, r) {
    return e.baseState = l, Sf(
      e,
      wt,
      typeof r == "function" ? r : Ml
    );
  }
  function AS(e, t, l, r, s) {
    if (ps(e)) throw Error(i(485));
    if (e = t.action, e !== null) {
      var c = {
        payload: s,
        action: e,
        next: null,
        isTransition: !0,
        status: "pending",
        value: null,
        reason: null,
        listeners: [],
        then: function(y) {
          c.listeners.push(y);
        }
      };
      k.T !== null ? l(!0) : c.isTransition = !1, r(c), l = t.pending, l === null ? (c.next = t.pending = c, Gm(t, c)) : (c.next = l.next, t.pending = l.next = c);
    }
  }
  function Gm(e, t) {
    var l = t.action, r = t.payload, s = e.state;
    if (t.isTransition) {
      var c = k.T, y = {};
      k.T = y;
      try {
        var R = l(s, r), U = k.S;
        U !== null && U(y, R), qm(e, t, R);
      } catch ($) {
        Rf(e, t, $);
      } finally {
        c !== null && y.types !== null && (c.types = y.types), k.T = c;
      }
    } else
      try {
        c = l(s, r), qm(e, t, c);
      } catch ($) {
        Rf(e, t, $);
      }
  }
  function qm(e, t, l) {
    l !== null && typeof l == "object" && typeof l.then == "function" ? l.then(
      function(r) {
        Xm(e, t, r);
      },
      function(r) {
        return Rf(e, t, r);
      }
    ) : Xm(e, t, l);
  }
  function Xm(e, t, l) {
    t.status = "fulfilled", t.value = l, Fm(t), e.state = l, t = e.pending, t !== null && (l = t.next, l === t ? e.pending = null : (l = l.next, t.next = l, Gm(e, l)));
  }
  function Rf(e, t, l) {
    var r = e.pending;
    if (e.pending = null, r !== null) {
      r = r.next;
      do
        t.status = "rejected", t.reason = l, Fm(t), t = t.next;
      while (t !== r);
    }
    e.action = null;
  }
  function Fm(e) {
    e = e.listeners;
    for (var t = 0; t < e.length; t++) (0, e[t])();
  }
  function Km(e, t) {
    return t;
  }
  function Qm(e, t) {
    if (st) {
      var l = Mt.formState;
      if (l !== null) {
        e: {
          var r = Xe;
          if (st) {
            if (Dt) {
              t: {
                for (var s = Dt, c = Zn; s.nodeType !== 8; ) {
                  if (!c) {
                    s = null;
                    break t;
                  }
                  if (s = Wn(
                    s.nextSibling
                  ), s === null) {
                    s = null;
                    break t;
                  }
                }
                c = s.data, s = c === "F!" || c === "F" ? s : null;
              }
              if (s) {
                Dt = Wn(
                  s.nextSibling
                ), r = s.data === "F!";
                break e;
              }
            }
            ao(r);
          }
          r = !1;
        }
        r && (t = l[0]);
      }
    }
    return l = vn(), l.memoizedState = l.baseState = t, r = {
      pending: null,
      lanes: 0,
      dispatch: null,
      lastRenderedReducer: Km,
      lastRenderedState: t
    }, l.queue = r, l = gh.bind(
      null,
      Xe,
      r
    ), r.dispatch = l, r = Tf(!1), c = Nf.bind(
      null,
      Xe,
      !1,
      r.queue
    ), r = vn(), s = {
      state: t,
      dispatch: null,
      action: e,
      pending: null
    }, r.queue = s, l = AS.bind(
      null,
      Xe,
      s,
      c,
      l
    ), s.dispatch = l, r.memoizedState = e, [t, l, !1];
  }
  function Zm(e) {
    var t = Kt();
    return Jm(t, wt, e);
  }
  function Jm(e, t, l) {
    if (t = Sf(
      e,
      t,
      Km
    )[0], e = us(Ml)[0], typeof t == "object" && t !== null && typeof t.then == "function")
      try {
        var r = _a(t);
      } catch (y) {
        throw y === Hr ? es : y;
      }
    else r = t;
    t = Kt();
    var s = t.queue, c = s.dispatch;
    return l !== t.memoizedState && (Xe.flags |= 2048, Vr(
      9,
      { destroy: void 0 },
      zS.bind(null, s, l),
      null
    )), [r, c, e];
  }
  function zS(e, t) {
    e.action = t;
  }
  function Wm(e) {
    var t = Kt(), l = wt;
    if (l !== null)
      return Jm(t, l, e);
    Kt(), t = t.memoizedState, l = Kt();
    var r = l.queue.dispatch;
    return l.memoizedState = e, [t, r, !1];
  }
  function Vr(e, t, l, r) {
    return e = { tag: e, create: l, deps: r, inst: t, next: null }, t = Xe.updateQueue, t === null && (t = ss(), Xe.updateQueue = t), l = t.lastEffect, l === null ? t.lastEffect = e.next = e : (r = l.next, l.next = e, e.next = r, t.lastEffect = e), e;
  }
  function $m() {
    return Kt().memoizedState;
  }
  function fs(e, t, l, r) {
    var s = vn();
    Xe.flags |= e, s.memoizedState = Vr(
      1 | t,
      { destroy: void 0 },
      l,
      r === void 0 ? null : r
    );
  }
  function ds(e, t, l, r) {
    var s = Kt();
    r = r === void 0 ? null : r;
    var c = s.memoizedState.inst;
    wt !== null && r !== null && hf(r, wt.memoizedState.deps) ? s.memoizedState = Vr(t, c, l, r) : (Xe.flags |= e, s.memoizedState = Vr(
      1 | t,
      c,
      l,
      r
    ));
  }
  function eh(e, t) {
    fs(8390656, 8, e, t);
  }
  function Cf(e, t) {
    ds(2048, 8, e, t);
  }
  function NS(e) {
    Xe.flags |= 4;
    var t = Xe.updateQueue;
    if (t === null)
      t = ss(), Xe.updateQueue = t, t.events = [e];
    else {
      var l = t.events;
      l === null ? t.events = [e] : l.push(e);
    }
  }
  function th(e) {
    var t = Kt().memoizedState;
    return NS({ ref: t, nextImpl: e }), function() {
      if ((dt & 2) !== 0) throw Error(i(440));
      return t.impl.apply(void 0, arguments);
    };
  }
  function nh(e, t) {
    return ds(4, 2, e, t);
  }
  function lh(e, t) {
    return ds(4, 4, e, t);
  }
  function oh(e, t) {
    if (typeof t == "function") {
      e = e();
      var l = t(e);
      return function() {
        typeof l == "function" ? l() : t(null);
      };
    }
    if (t != null)
      return e = e(), t.current = e, function() {
        t.current = null;
      };
  }
  function rh(e, t, l) {
    l = l != null ? l.concat([e]) : null, ds(4, 4, oh.bind(null, t, e), l);
  }
  function Of() {
  }
  function ah(e, t) {
    var l = Kt();
    t = t === void 0 ? null : t;
    var r = l.memoizedState;
    return t !== null && hf(t, r[1]) ? r[0] : (l.memoizedState = [e, t], e);
  }
  function ih(e, t) {
    var l = Kt();
    t = t === void 0 ? null : t;
    var r = l.memoizedState;
    if (t !== null && hf(t, r[1]))
      return r[0];
    if (r = e(), Wo) {
      zt(!0);
      try {
        e();
      } finally {
        zt(!1);
      }
    }
    return l.memoizedState = [r, t], r;
  }
  function Mf(e, t, l) {
    return l === void 0 || (Ol & 1073741824) !== 0 && (at & 261930) === 0 ? e.memoizedState = t : (e.memoizedState = l, e = sy(), Xe.lanes |= e, ho |= e, l);
  }
  function sh(e, t, l, r) {
    return jn(l, t) ? l : Ur.current !== null ? (e = Mf(e, l, r), jn(e, t) || (Jt = !0), e) : (Ol & 42) === 0 || (Ol & 1073741824) !== 0 && (at & 261930) === 0 ? (Jt = !0, e.memoizedState = l) : (e = sy(), Xe.lanes |= e, ho |= e, t);
  }
  function ch(e, t, l, r, s) {
    var c = P.p;
    P.p = c !== 0 && 8 > c ? c : 8;
    var y = k.T, R = {};
    k.T = R, Nf(e, !1, t, l);
    try {
      var U = s(), $ = k.S;
      if ($ !== null && $(R, U), U !== null && typeof U == "object" && typeof U.then == "function") {
        var ce = CS(
          U,
          r
        );
        Ha(
          e,
          t,
          ce,
          Un(e)
        );
      } else
        Ha(
          e,
          t,
          r,
          Un(e)
        );
    } catch (de) {
      Ha(
        e,
        t,
        { then: function() {
        }, status: "rejected", reason: de },
        Un()
      );
    } finally {
      P.p = c, y !== null && R.types !== null && (y.types = R.types), k.T = y;
    }
  }
  function jS() {
  }
  function Af(e, t, l, r) {
    if (e.tag !== 5) throw Error(i(476));
    var s = uh(e).queue;
    ch(
      e,
      s,
      t,
      I,
      l === null ? jS : function() {
        return fh(e), l(r);
      }
    );
  }
  function uh(e) {
    var t = e.memoizedState;
    if (t !== null) return t;
    t = {
      memoizedState: I,
      baseState: I,
      baseQueue: null,
      queue: {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: Ml,
        lastRenderedState: I
      },
      next: null
    };
    var l = {};
    return t.next = {
      memoizedState: l,
      baseState: l,
      baseQueue: null,
      queue: {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: Ml,
        lastRenderedState: l
      },
      next: null
    }, e.memoizedState = t, e = e.alternate, e !== null && (e.memoizedState = t), t;
  }
  function fh(e) {
    var t = uh(e);
    t.next === null && (t = e.alternate.memoizedState), Ha(
      e,
      t.next.queue,
      {},
      Un()
    );
  }
  function zf() {
    return fn($a);
  }
  function dh() {
    return Kt().memoizedState;
  }
  function ph() {
    return Kt().memoizedState;
  }
  function DS(e) {
    for (var t = e.return; t !== null; ) {
      switch (t.tag) {
        case 24:
        case 3:
          var l = Un();
          e = co(l);
          var r = uo(t, e, l);
          r !== null && (Mn(r, t, l), Na(r, t, l)), t = { cache: of() }, e.payload = t;
          return;
      }
      t = t.return;
    }
  }
  function kS(e, t, l) {
    var r = Un();
    l = {
      lane: r,
      revertLane: 0,
      gesture: null,
      action: l,
      hasEagerState: !1,
      eagerState: null,
      next: null
    }, ps(e) ? mh(t, l) : (l = Fu(e, t, l, r), l !== null && (Mn(l, e, r), hh(l, t, r)));
  }
  function gh(e, t, l) {
    var r = Un();
    Ha(e, t, l, r);
  }
  function Ha(e, t, l, r) {
    var s = {
      lane: r,
      revertLane: 0,
      gesture: null,
      action: l,
      hasEagerState: !1,
      eagerState: null,
      next: null
    };
    if (ps(e)) mh(t, s);
    else {
      var c = e.alternate;
      if (e.lanes === 0 && (c === null || c.lanes === 0) && (c = t.lastRenderedReducer, c !== null))
        try {
          var y = t.lastRenderedState, R = c(y, l);
          if (s.hasEagerState = !0, s.eagerState = R, jn(R, y))
            return Fi(e, t, s, 0), Mt === null && Xi(), !1;
        } catch {
        }
      if (l = Fu(e, t, s, r), l !== null)
        return Mn(l, e, r), hh(l, t, r), !0;
    }
    return !1;
  }
  function Nf(e, t, l, r) {
    if (r = {
      lane: 2,
      revertLane: cd(),
      gesture: null,
      action: r,
      hasEagerState: !1,
      eagerState: null,
      next: null
    }, ps(e)) {
      if (t) throw Error(i(479));
    } else
      t = Fu(
        e,
        l,
        r,
        2
      ), t !== null && Mn(t, e, 2);
  }
  function ps(e) {
    var t = e.alternate;
    return e === Xe || t !== null && t === Xe;
  }
  function mh(e, t) {
    Br = as = !0;
    var l = e.pending;
    l === null ? t.next = t : (t.next = l.next, l.next = t), e.pending = t;
  }
  function hh(e, t, l) {
    if ((l & 4194048) !== 0) {
      var r = t.lanes;
      r &= e.pendingLanes, l |= r, t.lanes = l, nl(e, l);
    }
  }
  var La = {
    readContext: fn,
    use: cs,
    useCallback: Bt,
    useContext: Bt,
    useEffect: Bt,
    useImperativeHandle: Bt,
    useLayoutEffect: Bt,
    useInsertionEffect: Bt,
    useMemo: Bt,
    useReducer: Bt,
    useRef: Bt,
    useState: Bt,
    useDebugValue: Bt,
    useDeferredValue: Bt,
    useTransition: Bt,
    useSyncExternalStore: Bt,
    useId: Bt,
    useHostTransitionStatus: Bt,
    useFormState: Bt,
    useActionState: Bt,
    useOptimistic: Bt,
    useMemoCache: Bt,
    useCacheRefresh: Bt
  };
  La.useEffectEvent = Bt;
  var yh = {
    readContext: fn,
    use: cs,
    useCallback: function(e, t) {
      return vn().memoizedState = [
        e,
        t === void 0 ? null : t
      ], e;
    },
    useContext: fn,
    useEffect: eh,
    useImperativeHandle: function(e, t, l) {
      l = l != null ? l.concat([e]) : null, fs(
        4194308,
        4,
        oh.bind(null, t, e),
        l
      );
    },
    useLayoutEffect: function(e, t) {
      return fs(4194308, 4, e, t);
    },
    useInsertionEffect: function(e, t) {
      fs(4, 2, e, t);
    },
    useMemo: function(e, t) {
      var l = vn();
      t = t === void 0 ? null : t;
      var r = e();
      if (Wo) {
        zt(!0);
        try {
          e();
        } finally {
          zt(!1);
        }
      }
      return l.memoizedState = [r, t], r;
    },
    useReducer: function(e, t, l) {
      var r = vn();
      if (l !== void 0) {
        var s = l(t);
        if (Wo) {
          zt(!0);
          try {
            l(t);
          } finally {
            zt(!1);
          }
        }
      } else s = t;
      return r.memoizedState = r.baseState = s, e = {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: e,
        lastRenderedState: s
      }, r.queue = e, e = e.dispatch = kS.bind(
        null,
        Xe,
        e
      ), [r.memoizedState, e];
    },
    useRef: function(e) {
      var t = vn();
      return e = { current: e }, t.memoizedState = e;
    },
    useState: function(e) {
      e = Tf(e);
      var t = e.queue, l = gh.bind(null, Xe, t);
      return t.dispatch = l, [e.memoizedState, l];
    },
    useDebugValue: Of,
    useDeferredValue: function(e, t) {
      var l = vn();
      return Mf(l, e, t);
    },
    useTransition: function() {
      var e = Tf(!1);
      return e = ch.bind(
        null,
        Xe,
        e.queue,
        !0,
        !1
      ), vn().memoizedState = e, [!1, e];
    },
    useSyncExternalStore: function(e, t, l) {
      var r = Xe, s = vn();
      if (st) {
        if (l === void 0)
          throw Error(i(407));
        l = l();
      } else {
        if (l = t(), Mt === null)
          throw Error(i(349));
        (at & 127) !== 0 || Um(r, t, l);
      }
      s.memoizedState = l;
      var c = { value: l, getSnapshot: t };
      return s.queue = c, eh(Im.bind(null, r, c, e), [
        e
      ]), r.flags |= 2048, Vr(
        9,
        { destroy: void 0 },
        Bm.bind(
          null,
          r,
          c,
          l,
          t
        ),
        null
      ), l;
    },
    useId: function() {
      var e = vn(), t = Mt.identifierPrefix;
      if (st) {
        var l = cl, r = sl;
        l = (r & ~(1 << 32 - ht(r) - 1)).toString(32) + l, t = "_" + t + "R_" + l, l = is++, 0 < l && (t += "H" + l.toString(32)), t += "_";
      } else
        l = OS++, t = "_" + t + "r_" + l.toString(32) + "_";
      return e.memoizedState = t;
    },
    useHostTransitionStatus: zf,
    useFormState: Qm,
    useActionState: Qm,
    useOptimistic: function(e) {
      var t = vn();
      t.memoizedState = t.baseState = e;
      var l = {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: null,
        lastRenderedState: null
      };
      return t.queue = l, t = Nf.bind(
        null,
        Xe,
        !0,
        l
      ), l.dispatch = t, [e, t];
    },
    useMemoCache: wf,
    useCacheRefresh: function() {
      return vn().memoizedState = DS.bind(
        null,
        Xe
      );
    },
    useEffectEvent: function(e) {
      var t = vn(), l = { impl: e };
      return t.memoizedState = l, function() {
        if ((dt & 2) !== 0)
          throw Error(i(440));
        return l.impl.apply(void 0, arguments);
      };
    }
  }, jf = {
    readContext: fn,
    use: cs,
    useCallback: ah,
    useContext: fn,
    useEffect: Cf,
    useImperativeHandle: rh,
    useInsertionEffect: nh,
    useLayoutEffect: lh,
    useMemo: ih,
    useReducer: us,
    useRef: $m,
    useState: function() {
      return us(Ml);
    },
    useDebugValue: Of,
    useDeferredValue: function(e, t) {
      var l = Kt();
      return sh(
        l,
        wt.memoizedState,
        e,
        t
      );
    },
    useTransition: function() {
      var e = us(Ml)[0], t = Kt().memoizedState;
      return [
        typeof e == "boolean" ? e : _a(e),
        t
      ];
    },
    useSyncExternalStore: Lm,
    useId: dh,
    useHostTransitionStatus: zf,
    useFormState: Zm,
    useActionState: Zm,
    useOptimistic: function(e, t) {
      var l = Kt();
      return Ym(l, wt, e, t);
    },
    useMemoCache: wf,
    useCacheRefresh: ph
  };
  jf.useEffectEvent = th;
  var vh = {
    readContext: fn,
    use: cs,
    useCallback: ah,
    useContext: fn,
    useEffect: Cf,
    useImperativeHandle: rh,
    useInsertionEffect: nh,
    useLayoutEffect: lh,
    useMemo: ih,
    useReducer: Ef,
    useRef: $m,
    useState: function() {
      return Ef(Ml);
    },
    useDebugValue: Of,
    useDeferredValue: function(e, t) {
      var l = Kt();
      return wt === null ? Mf(l, e, t) : sh(
        l,
        wt.memoizedState,
        e,
        t
      );
    },
    useTransition: function() {
      var e = Ef(Ml)[0], t = Kt().memoizedState;
      return [
        typeof e == "boolean" ? e : _a(e),
        t
      ];
    },
    useSyncExternalStore: Lm,
    useId: dh,
    useHostTransitionStatus: zf,
    useFormState: Wm,
    useActionState: Wm,
    useOptimistic: function(e, t) {
      var l = Kt();
      return wt !== null ? Ym(l, wt, e, t) : (l.baseState = e, [e, l.queue.dispatch]);
    },
    useMemoCache: wf,
    useCacheRefresh: ph
  };
  vh.useEffectEvent = th;
  function Df(e, t, l, r) {
    t = e.memoizedState, l = l(r, t), l = l == null ? t : x({}, t, l), e.memoizedState = l, e.lanes === 0 && (e.updateQueue.baseState = l);
  }
  var kf = {
    enqueueSetState: function(e, t, l) {
      e = e._reactInternals;
      var r = Un(), s = co(r);
      s.payload = t, l != null && (s.callback = l), t = uo(e, s, r), t !== null && (Mn(t, e, r), Na(t, e, r));
    },
    enqueueReplaceState: function(e, t, l) {
      e = e._reactInternals;
      var r = Un(), s = co(r);
      s.tag = 1, s.payload = t, l != null && (s.callback = l), t = uo(e, s, r), t !== null && (Mn(t, e, r), Na(t, e, r));
    },
    enqueueForceUpdate: function(e, t) {
      e = e._reactInternals;
      var l = Un(), r = co(l);
      r.tag = 2, t != null && (r.callback = t), t = uo(e, r, l), t !== null && (Mn(t, e, l), Na(t, e, l));
    }
  };
  function bh(e, t, l, r, s, c, y) {
    return e = e.stateNode, typeof e.shouldComponentUpdate == "function" ? e.shouldComponentUpdate(r, c, y) : t.prototype && t.prototype.isPureReactComponent ? !Ea(l, r) || !Ea(s, c) : !0;
  }
  function xh(e, t, l, r) {
    e = t.state, typeof t.componentWillReceiveProps == "function" && t.componentWillReceiveProps(l, r), typeof t.UNSAFE_componentWillReceiveProps == "function" && t.UNSAFE_componentWillReceiveProps(l, r), t.state !== e && kf.enqueueReplaceState(t, t.state, null);
  }
  function $o(e, t) {
    var l = t;
    if ("ref" in t) {
      l = {};
      for (var r in t)
        r !== "ref" && (l[r] = t[r]);
    }
    if (e = e.defaultProps) {
      l === t && (l = x({}, l));
      for (var s in e)
        l[s] === void 0 && (l[s] = e[s]);
    }
    return l;
  }
  function wh(e) {
    qi(e);
  }
  function Sh(e) {
    console.error(e);
  }
  function Eh(e) {
    qi(e);
  }
  function gs(e, t) {
    try {
      var l = e.onUncaughtError;
      l(t.value, { componentStack: t.stack });
    } catch (r) {
      setTimeout(function() {
        throw r;
      });
    }
  }
  function Th(e, t, l) {
    try {
      var r = e.onCaughtError;
      r(l.value, {
        componentStack: l.stack,
        errorBoundary: t.tag === 1 ? t.stateNode : null
      });
    } catch (s) {
      setTimeout(function() {
        throw s;
      });
    }
  }
  function _f(e, t, l) {
    return l = co(l), l.tag = 3, l.payload = { element: null }, l.callback = function() {
      gs(e, t);
    }, l;
  }
  function Rh(e) {
    return e = co(e), e.tag = 3, e;
  }
  function Ch(e, t, l, r) {
    var s = l.type.getDerivedStateFromError;
    if (typeof s == "function") {
      var c = r.value;
      e.payload = function() {
        return s(c);
      }, e.callback = function() {
        Th(t, l, r);
      };
    }
    var y = l.stateNode;
    y !== null && typeof y.componentDidCatch == "function" && (e.callback = function() {
      Th(t, l, r), typeof s != "function" && (yo === null ? yo = /* @__PURE__ */ new Set([this]) : yo.add(this));
      var R = r.stack;
      this.componentDidCatch(r.value, {
        componentStack: R !== null ? R : ""
      });
    });
  }
  function _S(e, t, l, r, s) {
    if (l.flags |= 32768, r !== null && typeof r == "object" && typeof r.then == "function") {
      if (t = l.alternate, t !== null && Dr(
        t,
        l,
        s,
        !0
      ), l = kn.current, l !== null) {
        switch (l.tag) {
          case 31:
          case 13:
            return Jn === null ? Cs() : l.alternate === null && It === 0 && (It = 3), l.flags &= -257, l.flags |= 65536, l.lanes = s, r === ts ? l.flags |= 16384 : (t = l.updateQueue, t === null ? l.updateQueue = /* @__PURE__ */ new Set([r]) : t.add(r), ad(e, r, s)), !1;
          case 22:
            return l.flags |= 65536, r === ts ? l.flags |= 16384 : (t = l.updateQueue, t === null ? (t = {
              transitions: null,
              markerInstances: null,
              retryQueue: /* @__PURE__ */ new Set([r])
            }, l.updateQueue = t) : (l = t.retryQueue, l === null ? t.retryQueue = /* @__PURE__ */ new Set([r]) : l.add(r)), ad(e, r, s)), !1;
        }
        throw Error(i(435, l.tag));
      }
      return ad(e, r, s), Cs(), !1;
    }
    if (st)
      return t = kn.current, t !== null ? ((t.flags & 65536) === 0 && (t.flags |= 256), t.flags |= 65536, t.lanes = s, r !== $u && (e = Error(i(422), { cause: r }), Ca(Fn(e, l)))) : (r !== $u && (t = Error(i(423), {
        cause: r
      }), Ca(
        Fn(t, l)
      )), e = e.current.alternate, e.flags |= 65536, s &= -s, e.lanes |= s, r = Fn(r, l), s = _f(
        e.stateNode,
        r,
        s
      ), ff(e, s), It !== 4 && (It = 2)), !1;
    var c = Error(i(520), { cause: r });
    if (c = Fn(c, l), qa === null ? qa = [c] : qa.push(c), It !== 4 && (It = 2), t === null) return !0;
    r = Fn(r, l), l = t;
    do {
      switch (l.tag) {
        case 3:
          return l.flags |= 65536, e = s & -s, l.lanes |= e, e = _f(l.stateNode, r, e), ff(l, e), !1;
        case 1:
          if (t = l.type, c = l.stateNode, (l.flags & 128) === 0 && (typeof t.getDerivedStateFromError == "function" || c !== null && typeof c.componentDidCatch == "function" && (yo === null || !yo.has(c))))
            return l.flags |= 65536, s &= -s, l.lanes |= s, s = Rh(s), Ch(
              s,
              e,
              l,
              r
            ), ff(l, s), !1;
      }
      l = l.return;
    } while (l !== null);
    return !1;
  }
  var Hf = Error(i(461)), Jt = !1;
  function dn(e, t, l, r) {
    t.child = e === null ? zm(t, null, l, r) : Jo(
      t,
      e.child,
      l,
      r
    );
  }
  function Oh(e, t, l, r, s) {
    l = l.render;
    var c = t.ref;
    if ("ref" in r) {
      var y = {};
      for (var R in r)
        R !== "ref" && (y[R] = r[R]);
    } else y = r;
    return Fo(t), r = yf(
      e,
      t,
      l,
      y,
      c,
      s
    ), R = vf(), e !== null && !Jt ? (bf(e, t, s), Al(e, t, s)) : (st && R && Ju(t), t.flags |= 1, dn(e, t, r, s), t.child);
  }
  function Mh(e, t, l, r, s) {
    if (e === null) {
      var c = l.type;
      return typeof c == "function" && !Ku(c) && c.defaultProps === void 0 && l.compare === null ? (t.tag = 15, t.type = c, Ah(
        e,
        t,
        c,
        r,
        s
      )) : (e = Qi(
        l.type,
        null,
        r,
        t,
        t.mode,
        s
      ), e.ref = t.ref, e.return = t, t.child = e);
    }
    if (c = e.child, !Gf(e, s)) {
      var y = c.memoizedProps;
      if (l = l.compare, l = l !== null ? l : Ea, l(y, r) && e.ref === t.ref)
        return Al(e, t, s);
    }
    return t.flags |= 1, e = El(c, r), e.ref = t.ref, e.return = t, t.child = e;
  }
  function Ah(e, t, l, r, s) {
    if (e !== null) {
      var c = e.memoizedProps;
      if (Ea(c, r) && e.ref === t.ref)
        if (Jt = !1, t.pendingProps = r = c, Gf(e, s))
          (e.flags & 131072) !== 0 && (Jt = !0);
        else
          return t.lanes = e.lanes, Al(e, t, s);
    }
    return Lf(
      e,
      t,
      l,
      r,
      s
    );
  }
  function zh(e, t, l, r) {
    var s = r.children, c = e !== null ? e.memoizedState : null;
    if (e === null && t.stateNode === null && (t.stateNode = {
      _visibility: 1,
      _pendingMarkers: null,
      _retryCache: null,
      _transitions: null
    }), r.mode === "hidden") {
      if ((t.flags & 128) !== 0) {
        if (c = c !== null ? c.baseLanes | l : l, e !== null) {
          for (r = t.child = e.child, s = 0; r !== null; )
            s = s | r.lanes | r.childLanes, r = r.sibling;
          r = s & ~c;
        } else r = 0, t.child = null;
        return Nh(
          e,
          t,
          c,
          l,
          r
        );
      }
      if ((l & 536870912) !== 0)
        t.memoizedState = { baseLanes: 0, cachePool: null }, e !== null && $i(
          t,
          c !== null ? c.cachePool : null
        ), c !== null ? Dm(t, c) : pf(), km(t);
      else
        return r = t.lanes = 536870912, Nh(
          e,
          t,
          c !== null ? c.baseLanes | l : l,
          l,
          r
        );
    } else
      c !== null ? ($i(t, c.cachePool), Dm(t, c), po(), t.memoizedState = null) : (e !== null && $i(t, null), pf(), po());
    return dn(e, t, s, l), t.child;
  }
  function Ua(e, t) {
    return e !== null && e.tag === 22 || t.stateNode !== null || (t.stateNode = {
      _visibility: 1,
      _pendingMarkers: null,
      _retryCache: null,
      _transitions: null
    }), t.sibling;
  }
  function Nh(e, t, l, r, s) {
    var c = af();
    return c = c === null ? null : { parent: Qt._currentValue, pool: c }, t.memoizedState = {
      baseLanes: l,
      cachePool: c
    }, e !== null && $i(t, null), pf(), km(t), e !== null && Dr(e, t, r, !0), t.childLanes = s, null;
  }
  function ms(e, t) {
    return t = ys(
      { mode: t.mode, children: t.children },
      e.mode
    ), t.ref = e.ref, e.child = t, t.return = e, t;
  }
  function jh(e, t, l) {
    return Jo(t, e.child, null, l), e = ms(t, t.pendingProps), e.flags |= 2, _n(t), t.memoizedState = null, e;
  }
  function HS(e, t, l) {
    var r = t.pendingProps, s = (t.flags & 128) !== 0;
    if (t.flags &= -129, e === null) {
      if (st) {
        if (r.mode === "hidden")
          return e = ms(t, r), t.lanes = 536870912, Ua(null, e);
        if (mf(t), (e = Dt) ? (e = Gy(
          e,
          Zn
        ), e = e !== null && e.data === "&" ? e : null, e !== null && (t.memoizedState = {
          dehydrated: e,
          treeContext: oo !== null ? { id: sl, overflow: cl } : null,
          retryLane: 536870912,
          hydrationErrors: null
        }, l = mm(e), l.return = t, t.child = l, un = t, Dt = null)) : e = null, e === null) throw ao(t);
        return t.lanes = 536870912, null;
      }
      return ms(t, r);
    }
    var c = e.memoizedState;
    if (c !== null) {
      var y = c.dehydrated;
      if (mf(t), s)
        if (t.flags & 256)
          t.flags &= -257, t = jh(
            e,
            t,
            l
          );
        else if (t.memoizedState !== null)
          t.child = e.child, t.flags |= 128, t = null;
        else throw Error(i(558));
      else if (Jt || Dr(e, t, l, !1), s = (l & e.childLanes) !== 0, Jt || s) {
        if (r = Mt, r !== null && (y = bl(r, l), y !== 0 && y !== c.retryLane))
          throw c.retryLane = y, Yo(e, y), Mn(r, e, y), Hf;
        Cs(), t = jh(
          e,
          t,
          l
        );
      } else
        e = c.treeContext, Dt = Wn(y.nextSibling), un = t, st = !0, ro = null, Zn = !1, e !== null && vm(t, e), t = ms(t, r), t.flags |= 4096;
      return t;
    }
    return e = El(e.child, {
      mode: r.mode,
      children: r.children
    }), e.ref = t.ref, t.child = e, e.return = t, e;
  }
  function hs(e, t) {
    var l = t.ref;
    if (l === null)
      e !== null && e.ref !== null && (t.flags |= 4194816);
    else {
      if (typeof l != "function" && typeof l != "object")
        throw Error(i(284));
      (e === null || e.ref !== l) && (t.flags |= 4194816);
    }
  }
  function Lf(e, t, l, r, s) {
    return Fo(t), l = yf(
      e,
      t,
      l,
      r,
      void 0,
      s
    ), r = vf(), e !== null && !Jt ? (bf(e, t, s), Al(e, t, s)) : (st && r && Ju(t), t.flags |= 1, dn(e, t, l, s), t.child);
  }
  function Dh(e, t, l, r, s, c) {
    return Fo(t), t.updateQueue = null, l = Hm(
      t,
      r,
      l,
      s
    ), _m(e), r = vf(), e !== null && !Jt ? (bf(e, t, c), Al(e, t, c)) : (st && r && Ju(t), t.flags |= 1, dn(e, t, l, c), t.child);
  }
  function kh(e, t, l, r, s) {
    if (Fo(t), t.stateNode === null) {
      var c = Ar, y = l.contextType;
      typeof y == "object" && y !== null && (c = fn(y)), c = new l(r, c), t.memoizedState = c.state !== null && c.state !== void 0 ? c.state : null, c.updater = kf, t.stateNode = c, c._reactInternals = t, c = t.stateNode, c.props = r, c.state = t.memoizedState, c.refs = {}, cf(t), y = l.contextType, c.context = typeof y == "object" && y !== null ? fn(y) : Ar, c.state = t.memoizedState, y = l.getDerivedStateFromProps, typeof y == "function" && (Df(
        t,
        l,
        y,
        r
      ), c.state = t.memoizedState), typeof l.getDerivedStateFromProps == "function" || typeof c.getSnapshotBeforeUpdate == "function" || typeof c.UNSAFE_componentWillMount != "function" && typeof c.componentWillMount != "function" || (y = c.state, typeof c.componentWillMount == "function" && c.componentWillMount(), typeof c.UNSAFE_componentWillMount == "function" && c.UNSAFE_componentWillMount(), y !== c.state && kf.enqueueReplaceState(c, c.state, null), Da(t, r, c, s), ja(), c.state = t.memoizedState), typeof c.componentDidMount == "function" && (t.flags |= 4194308), r = !0;
    } else if (e === null) {
      c = t.stateNode;
      var R = t.memoizedProps, U = $o(l, R);
      c.props = U;
      var $ = c.context, ce = l.contextType;
      y = Ar, typeof ce == "object" && ce !== null && (y = fn(ce));
      var de = l.getDerivedStateFromProps;
      ce = typeof de == "function" || typeof c.getSnapshotBeforeUpdate == "function", R = t.pendingProps !== R, ce || typeof c.UNSAFE_componentWillReceiveProps != "function" && typeof c.componentWillReceiveProps != "function" || (R || $ !== y) && xh(
        t,
        c,
        r,
        y
      ), so = !1;
      var te = t.memoizedState;
      c.state = te, Da(t, r, c, s), ja(), $ = t.memoizedState, R || te !== $ || so ? (typeof de == "function" && (Df(
        t,
        l,
        de,
        r
      ), $ = t.memoizedState), (U = so || bh(
        t,
        l,
        U,
        r,
        te,
        $,
        y
      )) ? (ce || typeof c.UNSAFE_componentWillMount != "function" && typeof c.componentWillMount != "function" || (typeof c.componentWillMount == "function" && c.componentWillMount(), typeof c.UNSAFE_componentWillMount == "function" && c.UNSAFE_componentWillMount()), typeof c.componentDidMount == "function" && (t.flags |= 4194308)) : (typeof c.componentDidMount == "function" && (t.flags |= 4194308), t.memoizedProps = r, t.memoizedState = $), c.props = r, c.state = $, c.context = y, r = U) : (typeof c.componentDidMount == "function" && (t.flags |= 4194308), r = !1);
    } else {
      c = t.stateNode, uf(e, t), y = t.memoizedProps, ce = $o(l, y), c.props = ce, de = t.pendingProps, te = c.context, $ = l.contextType, U = Ar, typeof $ == "object" && $ !== null && (U = fn($)), R = l.getDerivedStateFromProps, ($ = typeof R == "function" || typeof c.getSnapshotBeforeUpdate == "function") || typeof c.UNSAFE_componentWillReceiveProps != "function" && typeof c.componentWillReceiveProps != "function" || (y !== de || te !== U) && xh(
        t,
        c,
        r,
        U
      ), so = !1, te = t.memoizedState, c.state = te, Da(t, r, c, s), ja();
      var oe = t.memoizedState;
      y !== de || te !== oe || so || e !== null && e.dependencies !== null && Ji(e.dependencies) ? (typeof R == "function" && (Df(
        t,
        l,
        R,
        r
      ), oe = t.memoizedState), (ce = so || bh(
        t,
        l,
        ce,
        r,
        te,
        oe,
        U
      ) || e !== null && e.dependencies !== null && Ji(e.dependencies)) ? ($ || typeof c.UNSAFE_componentWillUpdate != "function" && typeof c.componentWillUpdate != "function" || (typeof c.componentWillUpdate == "function" && c.componentWillUpdate(r, oe, U), typeof c.UNSAFE_componentWillUpdate == "function" && c.UNSAFE_componentWillUpdate(
        r,
        oe,
        U
      )), typeof c.componentDidUpdate == "function" && (t.flags |= 4), typeof c.getSnapshotBeforeUpdate == "function" && (t.flags |= 1024)) : (typeof c.componentDidUpdate != "function" || y === e.memoizedProps && te === e.memoizedState || (t.flags |= 4), typeof c.getSnapshotBeforeUpdate != "function" || y === e.memoizedProps && te === e.memoizedState || (t.flags |= 1024), t.memoizedProps = r, t.memoizedState = oe), c.props = r, c.state = oe, c.context = U, r = ce) : (typeof c.componentDidUpdate != "function" || y === e.memoizedProps && te === e.memoizedState || (t.flags |= 4), typeof c.getSnapshotBeforeUpdate != "function" || y === e.memoizedProps && te === e.memoizedState || (t.flags |= 1024), r = !1);
    }
    return c = r, hs(e, t), r = (t.flags & 128) !== 0, c || r ? (c = t.stateNode, l = r && typeof l.getDerivedStateFromError != "function" ? null : c.render(), t.flags |= 1, e !== null && r ? (t.child = Jo(
      t,
      e.child,
      null,
      s
    ), t.child = Jo(
      t,
      null,
      l,
      s
    )) : dn(e, t, l, s), t.memoizedState = c.state, e = t.child) : e = Al(
      e,
      t,
      s
    ), e;
  }
  function _h(e, t, l, r) {
    return qo(), t.flags |= 256, dn(e, t, l, r), t.child;
  }
  var Uf = {
    dehydrated: null,
    treeContext: null,
    retryLane: 0,
    hydrationErrors: null
  };
  function Bf(e) {
    return { baseLanes: e, cachePool: Tm() };
  }
  function If(e, t, l) {
    return e = e !== null ? e.childLanes & ~l : 0, t && (e |= Ln), e;
  }
  function Hh(e, t, l) {
    var r = t.pendingProps, s = !1, c = (t.flags & 128) !== 0, y;
    if ((y = c) || (y = e !== null && e.memoizedState === null ? !1 : (Ft.current & 2) !== 0), y && (s = !0, t.flags &= -129), y = (t.flags & 32) !== 0, t.flags &= -33, e === null) {
      if (st) {
        if (s ? fo(t) : po(), (e = Dt) ? (e = Gy(
          e,
          Zn
        ), e = e !== null && e.data !== "&" ? e : null, e !== null && (t.memoizedState = {
          dehydrated: e,
          treeContext: oo !== null ? { id: sl, overflow: cl } : null,
          retryLane: 536870912,
          hydrationErrors: null
        }, l = mm(e), l.return = t, t.child = l, un = t, Dt = null)) : e = null, e === null) throw ao(t);
        return Sd(e) ? t.lanes = 32 : t.lanes = 536870912, null;
      }
      var R = r.children;
      return r = r.fallback, s ? (po(), s = t.mode, R = ys(
        { mode: "hidden", children: R },
        s
      ), r = Go(
        r,
        s,
        l,
        null
      ), R.return = t, r.return = t, R.sibling = r, t.child = R, r = t.child, r.memoizedState = Bf(l), r.childLanes = If(
        e,
        y,
        l
      ), t.memoizedState = Uf, Ua(null, r)) : (fo(t), Vf(t, R));
    }
    var U = e.memoizedState;
    if (U !== null && (R = U.dehydrated, R !== null)) {
      if (c)
        t.flags & 256 ? (fo(t), t.flags &= -257, t = Pf(
          e,
          t,
          l
        )) : t.memoizedState !== null ? (po(), t.child = e.child, t.flags |= 128, t = null) : (po(), R = r.fallback, s = t.mode, r = ys(
          { mode: "visible", children: r.children },
          s
        ), R = Go(
          R,
          s,
          l,
          null
        ), R.flags |= 2, r.return = t, R.return = t, r.sibling = R, t.child = r, Jo(
          t,
          e.child,
          null,
          l
        ), r = t.child, r.memoizedState = Bf(l), r.childLanes = If(
          e,
          y,
          l
        ), t.memoizedState = Uf, t = Ua(null, r));
      else if (fo(t), Sd(R)) {
        if (y = R.nextSibling && R.nextSibling.dataset, y) var $ = y.dgst;
        y = $, r = Error(i(419)), r.stack = "", r.digest = y, Ca({ value: r, source: null, stack: null }), t = Pf(
          e,
          t,
          l
        );
      } else if (Jt || Dr(e, t, l, !1), y = (l & e.childLanes) !== 0, Jt || y) {
        if (y = Mt, y !== null && (r = bl(y, l), r !== 0 && r !== U.retryLane))
          throw U.retryLane = r, Yo(e, r), Mn(y, e, r), Hf;
        wd(R) || Cs(), t = Pf(
          e,
          t,
          l
        );
      } else
        wd(R) ? (t.flags |= 192, t.child = e.child, t = null) : (e = U.treeContext, Dt = Wn(
          R.nextSibling
        ), un = t, st = !0, ro = null, Zn = !1, e !== null && vm(t, e), t = Vf(
          t,
          r.children
        ), t.flags |= 4096);
      return t;
    }
    return s ? (po(), R = r.fallback, s = t.mode, U = e.child, $ = U.sibling, r = El(U, {
      mode: "hidden",
      children: r.children
    }), r.subtreeFlags = U.subtreeFlags & 65011712, $ !== null ? R = El(
      $,
      R
    ) : (R = Go(
      R,
      s,
      l,
      null
    ), R.flags |= 2), R.return = t, r.return = t, r.sibling = R, t.child = r, Ua(null, r), r = t.child, R = e.child.memoizedState, R === null ? R = Bf(l) : (s = R.cachePool, s !== null ? (U = Qt._currentValue, s = s.parent !== U ? { parent: U, pool: U } : s) : s = Tm(), R = {
      baseLanes: R.baseLanes | l,
      cachePool: s
    }), r.memoizedState = R, r.childLanes = If(
      e,
      y,
      l
    ), t.memoizedState = Uf, Ua(e.child, r)) : (fo(t), l = e.child, e = l.sibling, l = El(l, {
      mode: "visible",
      children: r.children
    }), l.return = t, l.sibling = null, e !== null && (y = t.deletions, y === null ? (t.deletions = [e], t.flags |= 16) : y.push(e)), t.child = l, t.memoizedState = null, l);
  }
  function Vf(e, t) {
    return t = ys(
      { mode: "visible", children: t },
      e.mode
    ), t.return = e, e.child = t;
  }
  function ys(e, t) {
    return e = Dn(22, e, null, t), e.lanes = 0, e;
  }
  function Pf(e, t, l) {
    return Jo(t, e.child, null, l), e = Vf(
      t,
      t.pendingProps.children
    ), e.flags |= 2, t.memoizedState = null, e;
  }
  function Lh(e, t, l) {
    e.lanes |= t;
    var r = e.alternate;
    r !== null && (r.lanes |= t), nf(e.return, t, l);
  }
  function Yf(e, t, l, r, s, c) {
    var y = e.memoizedState;
    y === null ? e.memoizedState = {
      isBackwards: t,
      rendering: null,
      renderingStartTime: 0,
      last: r,
      tail: l,
      tailMode: s,
      treeForkCount: c
    } : (y.isBackwards = t, y.rendering = null, y.renderingStartTime = 0, y.last = r, y.tail = l, y.tailMode = s, y.treeForkCount = c);
  }
  function Uh(e, t, l) {
    var r = t.pendingProps, s = r.revealOrder, c = r.tail;
    r = r.children;
    var y = Ft.current, R = (y & 2) !== 0;
    if (R ? (y = y & 1 | 2, t.flags |= 128) : y &= 1, ee(Ft, y), dn(e, t, r, l), r = st ? Ra : 0, !R && e !== null && (e.flags & 128) !== 0)
      e: for (e = t.child; e !== null; ) {
        if (e.tag === 13)
          e.memoizedState !== null && Lh(e, l, t);
        else if (e.tag === 19)
          Lh(e, l, t);
        else if (e.child !== null) {
          e.child.return = e, e = e.child;
          continue;
        }
        if (e === t) break e;
        for (; e.sibling === null; ) {
          if (e.return === null || e.return === t)
            break e;
          e = e.return;
        }
        e.sibling.return = e.return, e = e.sibling;
      }
    switch (s) {
      case "forwards":
        for (l = t.child, s = null; l !== null; )
          e = l.alternate, e !== null && rs(e) === null && (s = l), l = l.sibling;
        l = s, l === null ? (s = t.child, t.child = null) : (s = l.sibling, l.sibling = null), Yf(
          t,
          !1,
          s,
          l,
          c,
          r
        );
        break;
      case "backwards":
      case "unstable_legacy-backwards":
        for (l = null, s = t.child, t.child = null; s !== null; ) {
          if (e = s.alternate, e !== null && rs(e) === null) {
            t.child = s;
            break;
          }
          e = s.sibling, s.sibling = l, l = s, s = e;
        }
        Yf(
          t,
          !0,
          l,
          null,
          c,
          r
        );
        break;
      case "together":
        Yf(
          t,
          !1,
          null,
          null,
          void 0,
          r
        );
        break;
      default:
        t.memoizedState = null;
    }
    return t.child;
  }
  function Al(e, t, l) {
    if (e !== null && (t.dependencies = e.dependencies), ho |= t.lanes, (l & t.childLanes) === 0)
      if (e !== null) {
        if (Dr(
          e,
          t,
          l,
          !1
        ), (l & t.childLanes) === 0)
          return null;
      } else return null;
    if (e !== null && t.child !== e.child)
      throw Error(i(153));
    if (t.child !== null) {
      for (e = t.child, l = El(e, e.pendingProps), t.child = l, l.return = t; e.sibling !== null; )
        e = e.sibling, l = l.sibling = El(e, e.pendingProps), l.return = t;
      l.sibling = null;
    }
    return t.child;
  }
  function Gf(e, t) {
    return (e.lanes & t) !== 0 ? !0 : (e = e.dependencies, !!(e !== null && Ji(e)));
  }
  function LS(e, t, l) {
    switch (t.tag) {
      case 3:
        se(t, t.stateNode.containerInfo), io(t, Qt, e.memoizedState.cache), qo();
        break;
      case 27:
      case 5:
        De(t);
        break;
      case 4:
        se(t, t.stateNode.containerInfo);
        break;
      case 10:
        io(
          t,
          t.type,
          t.memoizedProps.value
        );
        break;
      case 31:
        if (t.memoizedState !== null)
          return t.flags |= 128, mf(t), null;
        break;
      case 13:
        var r = t.memoizedState;
        if (r !== null)
          return r.dehydrated !== null ? (fo(t), t.flags |= 128, null) : (l & t.child.childLanes) !== 0 ? Hh(e, t, l) : (fo(t), e = Al(
            e,
            t,
            l
          ), e !== null ? e.sibling : null);
        fo(t);
        break;
      case 19:
        var s = (e.flags & 128) !== 0;
        if (r = (l & t.childLanes) !== 0, r || (Dr(
          e,
          t,
          l,
          !1
        ), r = (l & t.childLanes) !== 0), s) {
          if (r)
            return Uh(
              e,
              t,
              l
            );
          t.flags |= 128;
        }
        if (s = t.memoizedState, s !== null && (s.rendering = null, s.tail = null, s.lastEffect = null), ee(Ft, Ft.current), r) break;
        return null;
      case 22:
        return t.lanes = 0, zh(
          e,
          t,
          l,
          t.pendingProps
        );
      case 24:
        io(t, Qt, e.memoizedState.cache);
    }
    return Al(e, t, l);
  }
  function Bh(e, t, l) {
    if (e !== null)
      if (e.memoizedProps !== t.pendingProps)
        Jt = !0;
      else {
        if (!Gf(e, l) && (t.flags & 128) === 0)
          return Jt = !1, LS(
            e,
            t,
            l
          );
        Jt = (e.flags & 131072) !== 0;
      }
    else
      Jt = !1, st && (t.flags & 1048576) !== 0 && ym(t, Ra, t.index);
    switch (t.lanes = 0, t.tag) {
      case 16:
        e: {
          var r = t.pendingProps;
          if (e = Qo(t.elementType), t.type = e, typeof e == "function")
            Ku(e) ? (r = $o(e, r), t.tag = 1, t = kh(
              null,
              t,
              e,
              r,
              l
            )) : (t.tag = 0, t = Lf(
              null,
              t,
              e,
              r,
              l
            ));
          else {
            if (e != null) {
              var s = e.$$typeof;
              if (s === A) {
                t.tag = 11, t = Oh(
                  null,
                  t,
                  e,
                  r,
                  l
                );
                break e;
              } else if (s === _) {
                t.tag = 14, t = Mh(
                  null,
                  t,
                  e,
                  r,
                  l
                );
                break e;
              }
            }
            throw t = Z(e) || e, Error(i(306, t, ""));
          }
        }
        return t;
      case 0:
        return Lf(
          e,
          t,
          t.type,
          t.pendingProps,
          l
        );
      case 1:
        return r = t.type, s = $o(
          r,
          t.pendingProps
        ), kh(
          e,
          t,
          r,
          s,
          l
        );
      case 3:
        e: {
          if (se(
            t,
            t.stateNode.containerInfo
          ), e === null) throw Error(i(387));
          r = t.pendingProps;
          var c = t.memoizedState;
          s = c.element, uf(e, t), Da(t, r, null, l);
          var y = t.memoizedState;
          if (r = y.cache, io(t, Qt, r), r !== c.cache && lf(
            t,
            [Qt],
            l,
            !0
          ), ja(), r = y.element, c.isDehydrated)
            if (c = {
              element: r,
              isDehydrated: !1,
              cache: y.cache
            }, t.updateQueue.baseState = c, t.memoizedState = c, t.flags & 256) {
              t = _h(
                e,
                t,
                r,
                l
              );
              break e;
            } else if (r !== s) {
              s = Fn(
                Error(i(424)),
                t
              ), Ca(s), t = _h(
                e,
                t,
                r,
                l
              );
              break e;
            } else
              for (e = t.stateNode.containerInfo, e.nodeType === 9 ? e = e.body : e = e.nodeName === "HTML" ? e.ownerDocument.body : e, Dt = Wn(e.firstChild), un = t, st = !0, ro = null, Zn = !0, l = zm(
                t,
                null,
                r,
                l
              ), t.child = l; l; )
                l.flags = l.flags & -3 | 4096, l = l.sibling;
          else {
            if (qo(), r === s) {
              t = Al(
                e,
                t,
                l
              );
              break e;
            }
            dn(e, t, r, l);
          }
          t = t.child;
        }
        return t;
      case 26:
        return hs(e, t), e === null ? (l = Zy(
          t.type,
          null,
          t.pendingProps,
          null
        )) ? t.memoizedState = l : st || (l = t.type, e = t.pendingProps, r = Ds(
          ie.current
        ).createElement(l), r[Ot] = t, r[cn] = e, pn(r, l, e), on(r), t.stateNode = r) : t.memoizedState = Zy(
          t.type,
          e.memoizedProps,
          t.pendingProps,
          e.memoizedState
        ), null;
      case 27:
        return De(t), e === null && st && (r = t.stateNode = Fy(
          t.type,
          t.pendingProps,
          ie.current
        ), un = t, Zn = !0, s = Dt, wo(t.type) ? (Ed = s, Dt = Wn(r.firstChild)) : Dt = s), dn(
          e,
          t,
          t.pendingProps.children,
          l
        ), hs(e, t), e === null && (t.flags |= 4194304), t.child;
      case 5:
        return e === null && st && ((s = r = Dt) && (r = p1(
          r,
          t.type,
          t.pendingProps,
          Zn
        ), r !== null ? (t.stateNode = r, un = t, Dt = Wn(r.firstChild), Zn = !1, s = !0) : s = !1), s || ao(t)), De(t), s = t.type, c = t.pendingProps, y = e !== null ? e.memoizedProps : null, r = c.children, vd(s, c) ? r = null : y !== null && vd(s, y) && (t.flags |= 32), t.memoizedState !== null && (s = yf(
          e,
          t,
          MS,
          null,
          null,
          l
        ), $a._currentValue = s), hs(e, t), dn(e, t, r, l), t.child;
      case 6:
        return e === null && st && ((e = l = Dt) && (l = g1(
          l,
          t.pendingProps,
          Zn
        ), l !== null ? (t.stateNode = l, un = t, Dt = null, e = !0) : e = !1), e || ao(t)), null;
      case 13:
        return Hh(e, t, l);
      case 4:
        return se(
          t,
          t.stateNode.containerInfo
        ), r = t.pendingProps, e === null ? t.child = Jo(
          t,
          null,
          r,
          l
        ) : dn(e, t, r, l), t.child;
      case 11:
        return Oh(
          e,
          t,
          t.type,
          t.pendingProps,
          l
        );
      case 7:
        return dn(
          e,
          t,
          t.pendingProps,
          l
        ), t.child;
      case 8:
        return dn(
          e,
          t,
          t.pendingProps.children,
          l
        ), t.child;
      case 12:
        return dn(
          e,
          t,
          t.pendingProps.children,
          l
        ), t.child;
      case 10:
        return r = t.pendingProps, io(t, t.type, r.value), dn(e, t, r.children, l), t.child;
      case 9:
        return s = t.type._context, r = t.pendingProps.children, Fo(t), s = fn(s), r = r(s), t.flags |= 1, dn(e, t, r, l), t.child;
      case 14:
        return Mh(
          e,
          t,
          t.type,
          t.pendingProps,
          l
        );
      case 15:
        return Ah(
          e,
          t,
          t.type,
          t.pendingProps,
          l
        );
      case 19:
        return Uh(e, t, l);
      case 31:
        return HS(e, t, l);
      case 22:
        return zh(
          e,
          t,
          l,
          t.pendingProps
        );
      case 24:
        return Fo(t), r = fn(Qt), e === null ? (s = af(), s === null && (s = Mt, c = of(), s.pooledCache = c, c.refCount++, c !== null && (s.pooledCacheLanes |= l), s = c), t.memoizedState = { parent: r, cache: s }, cf(t), io(t, Qt, s)) : ((e.lanes & l) !== 0 && (uf(e, t), Da(t, null, null, l), ja()), s = e.memoizedState, c = t.memoizedState, s.parent !== r ? (s = { parent: r, cache: r }, t.memoizedState = s, t.lanes === 0 && (t.memoizedState = t.updateQueue.baseState = s), io(t, Qt, r)) : (r = c.cache, io(t, Qt, r), r !== s.cache && lf(
          t,
          [Qt],
          l,
          !0
        ))), dn(
          e,
          t,
          t.pendingProps.children,
          l
        ), t.child;
      case 29:
        throw t.pendingProps;
    }
    throw Error(i(156, t.tag));
  }
  function zl(e) {
    e.flags |= 4;
  }
  function qf(e, t, l, r, s) {
    if ((t = (e.mode & 32) !== 0) && (t = !1), t) {
      if (e.flags |= 16777216, (s & 335544128) === s)
        if (e.stateNode.complete) e.flags |= 8192;
        else if (dy()) e.flags |= 8192;
        else
          throw Zo = ts, sf;
    } else e.flags &= -16777217;
  }
  function Ih(e, t) {
    if (t.type !== "stylesheet" || (t.state.loading & 4) !== 0)
      e.flags &= -16777217;
    else if (e.flags |= 16777216, !tv(t))
      if (dy()) e.flags |= 8192;
      else
        throw Zo = ts, sf;
  }
  function vs(e, t) {
    t !== null && (e.flags |= 4), e.flags & 16384 && (t = e.tag !== 22 ? Nn() : 536870912, e.lanes |= t, qr |= t);
  }
  function Ba(e, t) {
    if (!st)
      switch (e.tailMode) {
        case "hidden":
          t = e.tail;
          for (var l = null; t !== null; )
            t.alternate !== null && (l = t), t = t.sibling;
          l === null ? e.tail = null : l.sibling = null;
          break;
        case "collapsed":
          l = e.tail;
          for (var r = null; l !== null; )
            l.alternate !== null && (r = l), l = l.sibling;
          r === null ? t || e.tail === null ? e.tail = null : e.tail.sibling = null : r.sibling = null;
      }
  }
  function kt(e) {
    var t = e.alternate !== null && e.alternate.child === e.child, l = 0, r = 0;
    if (t)
      for (var s = e.child; s !== null; )
        l |= s.lanes | s.childLanes, r |= s.subtreeFlags & 65011712, r |= s.flags & 65011712, s.return = e, s = s.sibling;
    else
      for (s = e.child; s !== null; )
        l |= s.lanes | s.childLanes, r |= s.subtreeFlags, r |= s.flags, s.return = e, s = s.sibling;
    return e.subtreeFlags |= r, e.childLanes = l, t;
  }
  function US(e, t, l) {
    var r = t.pendingProps;
    switch (Wu(t), t.tag) {
      case 16:
      case 15:
      case 0:
      case 11:
      case 7:
      case 8:
      case 12:
      case 9:
      case 14:
        return kt(t), null;
      case 1:
        return kt(t), null;
      case 3:
        return l = t.stateNode, r = null, e !== null && (r = e.memoizedState.cache), t.memoizedState.cache !== r && (t.flags |= 2048), Cl(Qt), ge(), l.pendingContext && (l.context = l.pendingContext, l.pendingContext = null), (e === null || e.child === null) && (jr(t) ? zl(t) : e === null || e.memoizedState.isDehydrated && (t.flags & 256) === 0 || (t.flags |= 1024, ef())), kt(t), null;
      case 26:
        var s = t.type, c = t.memoizedState;
        return e === null ? (zl(t), c !== null ? (kt(t), Ih(t, c)) : (kt(t), qf(
          t,
          s,
          null,
          r,
          l
        ))) : c ? c !== e.memoizedState ? (zl(t), kt(t), Ih(t, c)) : (kt(t), t.flags &= -16777217) : (e = e.memoizedProps, e !== r && zl(t), kt(t), qf(
          t,
          s,
          e,
          r,
          l
        )), null;
      case 27:
        if (Ee(t), l = ie.current, s = t.type, e !== null && t.stateNode != null)
          e.memoizedProps !== r && zl(t);
        else {
          if (!r) {
            if (t.stateNode === null)
              throw Error(i(166));
            return kt(t), null;
          }
          e = J.current, jr(t) ? bm(t) : (e = Fy(s, r, l), t.stateNode = e, zl(t));
        }
        return kt(t), null;
      case 5:
        if (Ee(t), s = t.type, e !== null && t.stateNode != null)
          e.memoizedProps !== r && zl(t);
        else {
          if (!r) {
            if (t.stateNode === null)
              throw Error(i(166));
            return kt(t), null;
          }
          if (c = J.current, jr(t))
            bm(t);
          else {
            var y = Ds(
              ie.current
            );
            switch (c) {
              case 1:
                c = y.createElementNS(
                  "http://www.w3.org/2000/svg",
                  s
                );
                break;
              case 2:
                c = y.createElementNS(
                  "http://www.w3.org/1998/Math/MathML",
                  s
                );
                break;
              default:
                switch (s) {
                  case "svg":
                    c = y.createElementNS(
                      "http://www.w3.org/2000/svg",
                      s
                    );
                    break;
                  case "math":
                    c = y.createElementNS(
                      "http://www.w3.org/1998/Math/MathML",
                      s
                    );
                    break;
                  case "script":
                    c = y.createElement("div"), c.innerHTML = "<script><\/script>", c = c.removeChild(
                      c.firstChild
                    );
                    break;
                  case "select":
                    c = typeof r.is == "string" ? y.createElement("select", {
                      is: r.is
                    }) : y.createElement("select"), r.multiple ? c.multiple = !0 : r.size && (c.size = r.size);
                    break;
                  default:
                    c = typeof r.is == "string" ? y.createElement(s, { is: r.is }) : y.createElement(s);
                }
            }
            c[Ot] = t, c[cn] = r;
            e: for (y = t.child; y !== null; ) {
              if (y.tag === 5 || y.tag === 6)
                c.appendChild(y.stateNode);
              else if (y.tag !== 4 && y.tag !== 27 && y.child !== null) {
                y.child.return = y, y = y.child;
                continue;
              }
              if (y === t) break e;
              for (; y.sibling === null; ) {
                if (y.return === null || y.return === t)
                  break e;
                y = y.return;
              }
              y.sibling.return = y.return, y = y.sibling;
            }
            t.stateNode = c;
            e: switch (pn(c, s, r), s) {
              case "button":
              case "input":
              case "select":
              case "textarea":
                r = !!r.autoFocus;
                break e;
              case "img":
                r = !0;
                break e;
              default:
                r = !1;
            }
            r && zl(t);
          }
        }
        return kt(t), qf(
          t,
          t.type,
          e === null ? null : e.memoizedProps,
          t.pendingProps,
          l
        ), null;
      case 6:
        if (e && t.stateNode != null)
          e.memoizedProps !== r && zl(t);
        else {
          if (typeof r != "string" && t.stateNode === null)
            throw Error(i(166));
          if (e = ie.current, jr(t)) {
            if (e = t.stateNode, l = t.memoizedProps, r = null, s = un, s !== null)
              switch (s.tag) {
                case 27:
                case 5:
                  r = s.memoizedProps;
              }
            e[Ot] = t, e = !!(e.nodeValue === l || r !== null && r.suppressHydrationWarning === !0 || Hy(e.nodeValue, l)), e || ao(t, !0);
          } else
            e = Ds(e).createTextNode(
              r
            ), e[Ot] = t, t.stateNode = e;
        }
        return kt(t), null;
      case 31:
        if (l = t.memoizedState, e === null || e.memoizedState !== null) {
          if (r = jr(t), l !== null) {
            if (e === null) {
              if (!r) throw Error(i(318));
              if (e = t.memoizedState, e = e !== null ? e.dehydrated : null, !e) throw Error(i(557));
              e[Ot] = t;
            } else
              qo(), (t.flags & 128) === 0 && (t.memoizedState = null), t.flags |= 4;
            kt(t), e = !1;
          } else
            l = ef(), e !== null && e.memoizedState !== null && (e.memoizedState.hydrationErrors = l), e = !0;
          if (!e)
            return t.flags & 256 ? (_n(t), t) : (_n(t), null);
          if ((t.flags & 128) !== 0)
            throw Error(i(558));
        }
        return kt(t), null;
      case 13:
        if (r = t.memoizedState, e === null || e.memoizedState !== null && e.memoizedState.dehydrated !== null) {
          if (s = jr(t), r !== null && r.dehydrated !== null) {
            if (e === null) {
              if (!s) throw Error(i(318));
              if (s = t.memoizedState, s = s !== null ? s.dehydrated : null, !s) throw Error(i(317));
              s[Ot] = t;
            } else
              qo(), (t.flags & 128) === 0 && (t.memoizedState = null), t.flags |= 4;
            kt(t), s = !1;
          } else
            s = ef(), e !== null && e.memoizedState !== null && (e.memoizedState.hydrationErrors = s), s = !0;
          if (!s)
            return t.flags & 256 ? (_n(t), t) : (_n(t), null);
        }
        return _n(t), (t.flags & 128) !== 0 ? (t.lanes = l, t) : (l = r !== null, e = e !== null && e.memoizedState !== null, l && (r = t.child, s = null, r.alternate !== null && r.alternate.memoizedState !== null && r.alternate.memoizedState.cachePool !== null && (s = r.alternate.memoizedState.cachePool.pool), c = null, r.memoizedState !== null && r.memoizedState.cachePool !== null && (c = r.memoizedState.cachePool.pool), c !== s && (r.flags |= 2048)), l !== e && l && (t.child.flags |= 8192), vs(t, t.updateQueue), kt(t), null);
      case 4:
        return ge(), e === null && pd(t.stateNode.containerInfo), kt(t), null;
      case 10:
        return Cl(t.type), kt(t), null;
      case 19:
        if (H(Ft), r = t.memoizedState, r === null) return kt(t), null;
        if (s = (t.flags & 128) !== 0, c = r.rendering, c === null)
          if (s) Ba(r, !1);
          else {
            if (It !== 0 || e !== null && (e.flags & 128) !== 0)
              for (e = t.child; e !== null; ) {
                if (c = rs(e), c !== null) {
                  for (t.flags |= 128, Ba(r, !1), e = c.updateQueue, t.updateQueue = e, vs(t, e), t.subtreeFlags = 0, e = l, l = t.child; l !== null; )
                    gm(l, e), l = l.sibling;
                  return ee(
                    Ft,
                    Ft.current & 1 | 2
                  ), st && Tl(t, r.treeForkCount), t.child;
                }
                e = e.sibling;
              }
            r.tail !== null && ae() > Es && (t.flags |= 128, s = !0, Ba(r, !1), t.lanes = 4194304);
          }
        else {
          if (!s)
            if (e = rs(c), e !== null) {
              if (t.flags |= 128, s = !0, e = e.updateQueue, t.updateQueue = e, vs(t, e), Ba(r, !0), r.tail === null && r.tailMode === "hidden" && !c.alternate && !st)
                return kt(t), null;
            } else
              2 * ae() - r.renderingStartTime > Es && l !== 536870912 && (t.flags |= 128, s = !0, Ba(r, !1), t.lanes = 4194304);
          r.isBackwards ? (c.sibling = t.child, t.child = c) : (e = r.last, e !== null ? e.sibling = c : t.child = c, r.last = c);
        }
        return r.tail !== null ? (e = r.tail, r.rendering = e, r.tail = e.sibling, r.renderingStartTime = ae(), e.sibling = null, l = Ft.current, ee(
          Ft,
          s ? l & 1 | 2 : l & 1
        ), st && Tl(t, r.treeForkCount), e) : (kt(t), null);
      case 22:
      case 23:
        return _n(t), gf(), r = t.memoizedState !== null, e !== null ? e.memoizedState !== null !== r && (t.flags |= 8192) : r && (t.flags |= 8192), r ? (l & 536870912) !== 0 && (t.flags & 128) === 0 && (kt(t), t.subtreeFlags & 6 && (t.flags |= 8192)) : kt(t), l = t.updateQueue, l !== null && vs(t, l.retryQueue), l = null, e !== null && e.memoizedState !== null && e.memoizedState.cachePool !== null && (l = e.memoizedState.cachePool.pool), r = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (r = t.memoizedState.cachePool.pool), r !== l && (t.flags |= 2048), e !== null && H(Ko), null;
      case 24:
        return l = null, e !== null && (l = e.memoizedState.cache), t.memoizedState.cache !== l && (t.flags |= 2048), Cl(Qt), kt(t), null;
      case 25:
        return null;
      case 30:
        return null;
    }
    throw Error(i(156, t.tag));
  }
  function BS(e, t) {
    switch (Wu(t), t.tag) {
      case 1:
        return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
      case 3:
        return Cl(Qt), ge(), e = t.flags, (e & 65536) !== 0 && (e & 128) === 0 ? (t.flags = e & -65537 | 128, t) : null;
      case 26:
      case 27:
      case 5:
        return Ee(t), null;
      case 31:
        if (t.memoizedState !== null) {
          if (_n(t), t.alternate === null)
            throw Error(i(340));
          qo();
        }
        return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
      case 13:
        if (_n(t), e = t.memoizedState, e !== null && e.dehydrated !== null) {
          if (t.alternate === null)
            throw Error(i(340));
          qo();
        }
        return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
      case 19:
        return H(Ft), null;
      case 4:
        return ge(), null;
      case 10:
        return Cl(t.type), null;
      case 22:
      case 23:
        return _n(t), gf(), e !== null && H(Ko), e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
      case 24:
        return Cl(Qt), null;
      case 25:
        return null;
      default:
        return null;
    }
  }
  function Vh(e, t) {
    switch (Wu(t), t.tag) {
      case 3:
        Cl(Qt), ge();
        break;
      case 26:
      case 27:
      case 5:
        Ee(t);
        break;
      case 4:
        ge();
        break;
      case 31:
        t.memoizedState !== null && _n(t);
        break;
      case 13:
        _n(t);
        break;
      case 19:
        H(Ft);
        break;
      case 10:
        Cl(t.type);
        break;
      case 22:
      case 23:
        _n(t), gf(), e !== null && H(Ko);
        break;
      case 24:
        Cl(Qt);
    }
  }
  function Ia(e, t) {
    try {
      var l = t.updateQueue, r = l !== null ? l.lastEffect : null;
      if (r !== null) {
        var s = r.next;
        l = s;
        do {
          if ((l.tag & e) === e) {
            r = void 0;
            var c = l.create, y = l.inst;
            r = c(), y.destroy = r;
          }
          l = l.next;
        } while (l !== s);
      }
    } catch (R) {
      vt(t, t.return, R);
    }
  }
  function go(e, t, l) {
    try {
      var r = t.updateQueue, s = r !== null ? r.lastEffect : null;
      if (s !== null) {
        var c = s.next;
        r = c;
        do {
          if ((r.tag & e) === e) {
            var y = r.inst, R = y.destroy;
            if (R !== void 0) {
              y.destroy = void 0, s = t;
              var U = l, $ = R;
              try {
                $();
              } catch (ce) {
                vt(
                  s,
                  U,
                  ce
                );
              }
            }
          }
          r = r.next;
        } while (r !== c);
      }
    } catch (ce) {
      vt(t, t.return, ce);
    }
  }
  function Ph(e) {
    var t = e.updateQueue;
    if (t !== null) {
      var l = e.stateNode;
      try {
        jm(t, l);
      } catch (r) {
        vt(e, e.return, r);
      }
    }
  }
  function Yh(e, t, l) {
    l.props = $o(
      e.type,
      e.memoizedProps
    ), l.state = e.memoizedState;
    try {
      l.componentWillUnmount();
    } catch (r) {
      vt(e, t, r);
    }
  }
  function Va(e, t) {
    try {
      var l = e.ref;
      if (l !== null) {
        switch (e.tag) {
          case 26:
          case 27:
          case 5:
            var r = e.stateNode;
            break;
          case 30:
            r = e.stateNode;
            break;
          default:
            r = e.stateNode;
        }
        typeof l == "function" ? e.refCleanup = l(r) : l.current = r;
      }
    } catch (s) {
      vt(e, t, s);
    }
  }
  function ul(e, t) {
    var l = e.ref, r = e.refCleanup;
    if (l !== null)
      if (typeof r == "function")
        try {
          r();
        } catch (s) {
          vt(e, t, s);
        } finally {
          e.refCleanup = null, e = e.alternate, e != null && (e.refCleanup = null);
        }
      else if (typeof l == "function")
        try {
          l(null);
        } catch (s) {
          vt(e, t, s);
        }
      else l.current = null;
  }
  function Gh(e) {
    var t = e.type, l = e.memoizedProps, r = e.stateNode;
    try {
      e: switch (t) {
        case "button":
        case "input":
        case "select":
        case "textarea":
          l.autoFocus && r.focus();
          break e;
        case "img":
          l.src ? r.src = l.src : l.srcSet && (r.srcset = l.srcSet);
      }
    } catch (s) {
      vt(e, e.return, s);
    }
  }
  function Xf(e, t, l) {
    try {
      var r = e.stateNode;
      i1(r, e.type, l, t), r[cn] = t;
    } catch (s) {
      vt(e, e.return, s);
    }
  }
  function qh(e) {
    return e.tag === 5 || e.tag === 3 || e.tag === 26 || e.tag === 27 && wo(e.type) || e.tag === 4;
  }
  function Ff(e) {
    e: for (; ; ) {
      for (; e.sibling === null; ) {
        if (e.return === null || qh(e.return)) return null;
        e = e.return;
      }
      for (e.sibling.return = e.return, e = e.sibling; e.tag !== 5 && e.tag !== 6 && e.tag !== 18; ) {
        if (e.tag === 27 && wo(e.type) || e.flags & 2 || e.child === null || e.tag === 4) continue e;
        e.child.return = e, e = e.child;
      }
      if (!(e.flags & 2)) return e.stateNode;
    }
  }
  function Kf(e, t, l) {
    var r = e.tag;
    if (r === 5 || r === 6)
      e = e.stateNode, t ? (l.nodeType === 9 ? l.body : l.nodeName === "HTML" ? l.ownerDocument.body : l).insertBefore(e, t) : (t = l.nodeType === 9 ? l.body : l.nodeName === "HTML" ? l.ownerDocument.body : l, t.appendChild(e), l = l._reactRootContainer, l != null || t.onclick !== null || (t.onclick = wl));
    else if (r !== 4 && (r === 27 && wo(e.type) && (l = e.stateNode, t = null), e = e.child, e !== null))
      for (Kf(e, t, l), e = e.sibling; e !== null; )
        Kf(e, t, l), e = e.sibling;
  }
  function bs(e, t, l) {
    var r = e.tag;
    if (r === 5 || r === 6)
      e = e.stateNode, t ? l.insertBefore(e, t) : l.appendChild(e);
    else if (r !== 4 && (r === 27 && wo(e.type) && (l = e.stateNode), e = e.child, e !== null))
      for (bs(e, t, l), e = e.sibling; e !== null; )
        bs(e, t, l), e = e.sibling;
  }
  function Xh(e) {
    var t = e.stateNode, l = e.memoizedProps;
    try {
      for (var r = e.type, s = t.attributes; s.length; )
        t.removeAttributeNode(s[0]);
      pn(t, r, l), t[Ot] = e, t[cn] = l;
    } catch (c) {
      vt(e, e.return, c);
    }
  }
  var Nl = !1, Wt = !1, Qf = !1, Fh = typeof WeakSet == "function" ? WeakSet : Set, rn = null;
  function IS(e, t) {
    if (e = e.containerInfo, hd = Is, e = rm(e), Vu(e)) {
      if ("selectionStart" in e)
        var l = {
          start: e.selectionStart,
          end: e.selectionEnd
        };
      else
        e: {
          l = (l = e.ownerDocument) && l.defaultView || window;
          var r = l.getSelection && l.getSelection();
          if (r && r.rangeCount !== 0) {
            l = r.anchorNode;
            var s = r.anchorOffset, c = r.focusNode;
            r = r.focusOffset;
            try {
              l.nodeType, c.nodeType;
            } catch {
              l = null;
              break e;
            }
            var y = 0, R = -1, U = -1, $ = 0, ce = 0, de = e, te = null;
            t: for (; ; ) {
              for (var oe; de !== l || s !== 0 && de.nodeType !== 3 || (R = y + s), de !== c || r !== 0 && de.nodeType !== 3 || (U = y + r), de.nodeType === 3 && (y += de.nodeValue.length), (oe = de.firstChild) !== null; )
                te = de, de = oe;
              for (; ; ) {
                if (de === e) break t;
                if (te === l && ++$ === s && (R = y), te === c && ++ce === r && (U = y), (oe = de.nextSibling) !== null) break;
                de = te, te = de.parentNode;
              }
              de = oe;
            }
            l = R === -1 || U === -1 ? null : { start: R, end: U };
          } else l = null;
        }
      l = l || { start: 0, end: 0 };
    } else l = null;
    for (yd = { focusedElem: e, selectionRange: l }, Is = !1, rn = t; rn !== null; )
      if (t = rn, e = t.child, (t.subtreeFlags & 1028) !== 0 && e !== null)
        e.return = t, rn = e;
      else
        for (; rn !== null; ) {
          switch (t = rn, c = t.alternate, e = t.flags, t.tag) {
            case 0:
              if ((e & 4) !== 0 && (e = t.updateQueue, e = e !== null ? e.events : null, e !== null))
                for (l = 0; l < e.length; l++)
                  s = e[l], s.ref.impl = s.nextImpl;
              break;
            case 11:
            case 15:
              break;
            case 1:
              if ((e & 1024) !== 0 && c !== null) {
                e = void 0, l = t, s = c.memoizedProps, c = c.memoizedState, r = l.stateNode;
                try {
                  var Ne = $o(
                    l.type,
                    s
                  );
                  e = r.getSnapshotBeforeUpdate(
                    Ne,
                    c
                  ), r.__reactInternalSnapshotBeforeUpdate = e;
                } catch (Ie) {
                  vt(
                    l,
                    l.return,
                    Ie
                  );
                }
              }
              break;
            case 3:
              if ((e & 1024) !== 0) {
                if (e = t.stateNode.containerInfo, l = e.nodeType, l === 9)
                  xd(e);
                else if (l === 1)
                  switch (e.nodeName) {
                    case "HEAD":
                    case "HTML":
                    case "BODY":
                      xd(e);
                      break;
                    default:
                      e.textContent = "";
                  }
              }
              break;
            case 5:
            case 26:
            case 27:
            case 6:
            case 4:
            case 17:
              break;
            default:
              if ((e & 1024) !== 0) throw Error(i(163));
          }
          if (e = t.sibling, e !== null) {
            e.return = t.return, rn = e;
            break;
          }
          rn = t.return;
        }
  }
  function Kh(e, t, l) {
    var r = l.flags;
    switch (l.tag) {
      case 0:
      case 11:
      case 15:
        Dl(e, l), r & 4 && Ia(5, l);
        break;
      case 1:
        if (Dl(e, l), r & 4)
          if (e = l.stateNode, t === null)
            try {
              e.componentDidMount();
            } catch (y) {
              vt(l, l.return, y);
            }
          else {
            var s = $o(
              l.type,
              t.memoizedProps
            );
            t = t.memoizedState;
            try {
              e.componentDidUpdate(
                s,
                t,
                e.__reactInternalSnapshotBeforeUpdate
              );
            } catch (y) {
              vt(
                l,
                l.return,
                y
              );
            }
          }
        r & 64 && Ph(l), r & 512 && Va(l, l.return);
        break;
      case 3:
        if (Dl(e, l), r & 64 && (e = l.updateQueue, e !== null)) {
          if (t = null, l.child !== null)
            switch (l.child.tag) {
              case 27:
              case 5:
                t = l.child.stateNode;
                break;
              case 1:
                t = l.child.stateNode;
            }
          try {
            jm(e, t);
          } catch (y) {
            vt(l, l.return, y);
          }
        }
        break;
      case 27:
        t === null && r & 4 && Xh(l);
      case 26:
      case 5:
        Dl(e, l), t === null && r & 4 && Gh(l), r & 512 && Va(l, l.return);
        break;
      case 12:
        Dl(e, l);
        break;
      case 31:
        Dl(e, l), r & 4 && Jh(e, l);
        break;
      case 13:
        Dl(e, l), r & 4 && Wh(e, l), r & 64 && (e = l.memoizedState, e !== null && (e = e.dehydrated, e !== null && (l = QS.bind(
          null,
          l
        ), m1(e, l))));
        break;
      case 22:
        if (r = l.memoizedState !== null || Nl, !r) {
          t = t !== null && t.memoizedState !== null || Wt, s = Nl;
          var c = Wt;
          Nl = r, (Wt = t) && !c ? kl(
            e,
            l,
            (l.subtreeFlags & 8772) !== 0
          ) : Dl(e, l), Nl = s, Wt = c;
        }
        break;
      case 30:
        break;
      default:
        Dl(e, l);
    }
  }
  function Qh(e) {
    var t = e.alternate;
    t !== null && (e.alternate = null, Qh(t)), e.child = null, e.deletions = null, e.sibling = null, e.tag === 5 && (t = e.stateNode, t !== null && Tu(t)), e.stateNode = null, e.return = null, e.dependencies = null, e.memoizedProps = null, e.memoizedState = null, e.pendingProps = null, e.stateNode = null, e.updateQueue = null;
  }
  var Lt = null, Tn = !1;
  function jl(e, t, l) {
    for (l = l.child; l !== null; )
      Zh(e, t, l), l = l.sibling;
  }
  function Zh(e, t, l) {
    if (gt && typeof gt.onCommitFiberUnmount == "function")
      try {
        gt.onCommitFiberUnmount(tt, l);
      } catch {
      }
    switch (l.tag) {
      case 26:
        Wt || ul(l, t), jl(
          e,
          t,
          l
        ), l.memoizedState ? l.memoizedState.count-- : l.stateNode && (l = l.stateNode, l.parentNode.removeChild(l));
        break;
      case 27:
        Wt || ul(l, t);
        var r = Lt, s = Tn;
        wo(l.type) && (Lt = l.stateNode, Tn = !1), jl(
          e,
          t,
          l
        ), Za(l.stateNode), Lt = r, Tn = s;
        break;
      case 5:
        Wt || ul(l, t);
      case 6:
        if (r = Lt, s = Tn, Lt = null, jl(
          e,
          t,
          l
        ), Lt = r, Tn = s, Lt !== null)
          if (Tn)
            try {
              (Lt.nodeType === 9 ? Lt.body : Lt.nodeName === "HTML" ? Lt.ownerDocument.body : Lt).removeChild(l.stateNode);
            } catch (c) {
              vt(
                l,
                t,
                c
              );
            }
          else
            try {
              Lt.removeChild(l.stateNode);
            } catch (c) {
              vt(
                l,
                t,
                c
              );
            }
        break;
      case 18:
        Lt !== null && (Tn ? (e = Lt, Py(
          e.nodeType === 9 ? e.body : e.nodeName === "HTML" ? e.ownerDocument.body : e,
          l.stateNode
        ), $r(e)) : Py(Lt, l.stateNode));
        break;
      case 4:
        r = Lt, s = Tn, Lt = l.stateNode.containerInfo, Tn = !0, jl(
          e,
          t,
          l
        ), Lt = r, Tn = s;
        break;
      case 0:
      case 11:
      case 14:
      case 15:
        go(2, l, t), Wt || go(4, l, t), jl(
          e,
          t,
          l
        );
        break;
      case 1:
        Wt || (ul(l, t), r = l.stateNode, typeof r.componentWillUnmount == "function" && Yh(
          l,
          t,
          r
        )), jl(
          e,
          t,
          l
        );
        break;
      case 21:
        jl(
          e,
          t,
          l
        );
        break;
      case 22:
        Wt = (r = Wt) || l.memoizedState !== null, jl(
          e,
          t,
          l
        ), Wt = r;
        break;
      default:
        jl(
          e,
          t,
          l
        );
    }
  }
  function Jh(e, t) {
    if (t.memoizedState === null && (e = t.alternate, e !== null && (e = e.memoizedState, e !== null))) {
      e = e.dehydrated;
      try {
        $r(e);
      } catch (l) {
        vt(t, t.return, l);
      }
    }
  }
  function Wh(e, t) {
    if (t.memoizedState === null && (e = t.alternate, e !== null && (e = e.memoizedState, e !== null && (e = e.dehydrated, e !== null))))
      try {
        $r(e);
      } catch (l) {
        vt(t, t.return, l);
      }
  }
  function VS(e) {
    switch (e.tag) {
      case 31:
      case 13:
      case 19:
        var t = e.stateNode;
        return t === null && (t = e.stateNode = new Fh()), t;
      case 22:
        return e = e.stateNode, t = e._retryCache, t === null && (t = e._retryCache = new Fh()), t;
      default:
        throw Error(i(435, e.tag));
    }
  }
  function xs(e, t) {
    var l = VS(e);
    t.forEach(function(r) {
      if (!l.has(r)) {
        l.add(r);
        var s = ZS.bind(null, e, r);
        r.then(s, s);
      }
    });
  }
  function Rn(e, t) {
    var l = t.deletions;
    if (l !== null)
      for (var r = 0; r < l.length; r++) {
        var s = l[r], c = e, y = t, R = y;
        e: for (; R !== null; ) {
          switch (R.tag) {
            case 27:
              if (wo(R.type)) {
                Lt = R.stateNode, Tn = !1;
                break e;
              }
              break;
            case 5:
              Lt = R.stateNode, Tn = !1;
              break e;
            case 3:
            case 4:
              Lt = R.stateNode.containerInfo, Tn = !0;
              break e;
          }
          R = R.return;
        }
        if (Lt === null) throw Error(i(160));
        Zh(c, y, s), Lt = null, Tn = !1, c = s.alternate, c !== null && (c.return = null), s.return = null;
      }
    if (t.subtreeFlags & 13886)
      for (t = t.child; t !== null; )
        $h(t, e), t = t.sibling;
  }
  var ol = null;
  function $h(e, t) {
    var l = e.alternate, r = e.flags;
    switch (e.tag) {
      case 0:
      case 11:
      case 14:
      case 15:
        Rn(t, e), Cn(e), r & 4 && (go(3, e, e.return), Ia(3, e), go(5, e, e.return));
        break;
      case 1:
        Rn(t, e), Cn(e), r & 512 && (Wt || l === null || ul(l, l.return)), r & 64 && Nl && (e = e.updateQueue, e !== null && (r = e.callbacks, r !== null && (l = e.shared.hiddenCallbacks, e.shared.hiddenCallbacks = l === null ? r : l.concat(r))));
        break;
      case 26:
        var s = ol;
        if (Rn(t, e), Cn(e), r & 512 && (Wt || l === null || ul(l, l.return)), r & 4) {
          var c = l !== null ? l.memoizedState : null;
          if (r = e.memoizedState, l === null)
            if (r === null)
              if (e.stateNode === null) {
                e: {
                  r = e.type, l = e.memoizedProps, s = s.ownerDocument || s;
                  t: switch (r) {
                    case "title":
                      c = s.getElementsByTagName("title")[0], (!c || c[ga] || c[Ot] || c.namespaceURI === "http://www.w3.org/2000/svg" || c.hasAttribute("itemprop")) && (c = s.createElement(r), s.head.insertBefore(
                        c,
                        s.querySelector("head > title")
                      )), pn(c, r, l), c[Ot] = e, on(c), r = c;
                      break e;
                    case "link":
                      var y = $y(
                        "link",
                        "href",
                        s
                      ).get(r + (l.href || ""));
                      if (y) {
                        for (var R = 0; R < y.length; R++)
                          if (c = y[R], c.getAttribute("href") === (l.href == null || l.href === "" ? null : l.href) && c.getAttribute("rel") === (l.rel == null ? null : l.rel) && c.getAttribute("title") === (l.title == null ? null : l.title) && c.getAttribute("crossorigin") === (l.crossOrigin == null ? null : l.crossOrigin)) {
                            y.splice(R, 1);
                            break t;
                          }
                      }
                      c = s.createElement(r), pn(c, r, l), s.head.appendChild(c);
                      break;
                    case "meta":
                      if (y = $y(
                        "meta",
                        "content",
                        s
                      ).get(r + (l.content || ""))) {
                        for (R = 0; R < y.length; R++)
                          if (c = y[R], c.getAttribute("content") === (l.content == null ? null : "" + l.content) && c.getAttribute("name") === (l.name == null ? null : l.name) && c.getAttribute("property") === (l.property == null ? null : l.property) && c.getAttribute("http-equiv") === (l.httpEquiv == null ? null : l.httpEquiv) && c.getAttribute("charset") === (l.charSet == null ? null : l.charSet)) {
                            y.splice(R, 1);
                            break t;
                          }
                      }
                      c = s.createElement(r), pn(c, r, l), s.head.appendChild(c);
                      break;
                    default:
                      throw Error(i(468, r));
                  }
                  c[Ot] = e, on(c), r = c;
                }
                e.stateNode = r;
              } else
                ev(
                  s,
                  e.type,
                  e.stateNode
                );
            else
              e.stateNode = Wy(
                s,
                r,
                e.memoizedProps
              );
          else
            c !== r ? (c === null ? l.stateNode !== null && (l = l.stateNode, l.parentNode.removeChild(l)) : c.count--, r === null ? ev(
              s,
              e.type,
              e.stateNode
            ) : Wy(
              s,
              r,
              e.memoizedProps
            )) : r === null && e.stateNode !== null && Xf(
              e,
              e.memoizedProps,
              l.memoizedProps
            );
        }
        break;
      case 27:
        Rn(t, e), Cn(e), r & 512 && (Wt || l === null || ul(l, l.return)), l !== null && r & 4 && Xf(
          e,
          e.memoizedProps,
          l.memoizedProps
        );
        break;
      case 5:
        if (Rn(t, e), Cn(e), r & 512 && (Wt || l === null || ul(l, l.return)), e.flags & 32) {
          s = e.stateNode;
          try {
            Sr(s, "");
          } catch (Ne) {
            vt(e, e.return, Ne);
          }
        }
        r & 4 && e.stateNode != null && (s = e.memoizedProps, Xf(
          e,
          s,
          l !== null ? l.memoizedProps : s
        )), r & 1024 && (Qf = !0);
        break;
      case 6:
        if (Rn(t, e), Cn(e), r & 4) {
          if (e.stateNode === null)
            throw Error(i(162));
          r = e.memoizedProps, l = e.stateNode;
          try {
            l.nodeValue = r;
          } catch (Ne) {
            vt(e, e.return, Ne);
          }
        }
        break;
      case 3:
        if (Hs = null, s = ol, ol = ks(t.containerInfo), Rn(t, e), ol = s, Cn(e), r & 4 && l !== null && l.memoizedState.isDehydrated)
          try {
            $r(t.containerInfo);
          } catch (Ne) {
            vt(e, e.return, Ne);
          }
        Qf && (Qf = !1, ey(e));
        break;
      case 4:
        r = ol, ol = ks(
          e.stateNode.containerInfo
        ), Rn(t, e), Cn(e), ol = r;
        break;
      case 12:
        Rn(t, e), Cn(e);
        break;
      case 31:
        Rn(t, e), Cn(e), r & 4 && (r = e.updateQueue, r !== null && (e.updateQueue = null, xs(e, r)));
        break;
      case 13:
        Rn(t, e), Cn(e), e.child.flags & 8192 && e.memoizedState !== null != (l !== null && l.memoizedState !== null) && (Ss = ae()), r & 4 && (r = e.updateQueue, r !== null && (e.updateQueue = null, xs(e, r)));
        break;
      case 22:
        s = e.memoizedState !== null;
        var U = l !== null && l.memoizedState !== null, $ = Nl, ce = Wt;
        if (Nl = $ || s, Wt = ce || U, Rn(t, e), Wt = ce, Nl = $, Cn(e), r & 8192)
          e: for (t = e.stateNode, t._visibility = s ? t._visibility & -2 : t._visibility | 1, s && (l === null || U || Nl || Wt || er(e)), l = null, t = e; ; ) {
            if (t.tag === 5 || t.tag === 26) {
              if (l === null) {
                U = l = t;
                try {
                  if (c = U.stateNode, s)
                    y = c.style, typeof y.setProperty == "function" ? y.setProperty("display", "none", "important") : y.display = "none";
                  else {
                    R = U.stateNode;
                    var de = U.memoizedProps.style, te = de != null && de.hasOwnProperty("display") ? de.display : null;
                    R.style.display = te == null || typeof te == "boolean" ? "" : ("" + te).trim();
                  }
                } catch (Ne) {
                  vt(U, U.return, Ne);
                }
              }
            } else if (t.tag === 6) {
              if (l === null) {
                U = t;
                try {
                  U.stateNode.nodeValue = s ? "" : U.memoizedProps;
                } catch (Ne) {
                  vt(U, U.return, Ne);
                }
              }
            } else if (t.tag === 18) {
              if (l === null) {
                U = t;
                try {
                  var oe = U.stateNode;
                  s ? Yy(oe, !0) : Yy(U.stateNode, !1);
                } catch (Ne) {
                  vt(U, U.return, Ne);
                }
              }
            } else if ((t.tag !== 22 && t.tag !== 23 || t.memoizedState === null || t === e) && t.child !== null) {
              t.child.return = t, t = t.child;
              continue;
            }
            if (t === e) break e;
            for (; t.sibling === null; ) {
              if (t.return === null || t.return === e) break e;
              l === t && (l = null), t = t.return;
            }
            l === t && (l = null), t.sibling.return = t.return, t = t.sibling;
          }
        r & 4 && (r = e.updateQueue, r !== null && (l = r.retryQueue, l !== null && (r.retryQueue = null, xs(e, l))));
        break;
      case 19:
        Rn(t, e), Cn(e), r & 4 && (r = e.updateQueue, r !== null && (e.updateQueue = null, xs(e, r)));
        break;
      case 30:
        break;
      case 21:
        break;
      default:
        Rn(t, e), Cn(e);
    }
  }
  function Cn(e) {
    var t = e.flags;
    if (t & 2) {
      try {
        for (var l, r = e.return; r !== null; ) {
          if (qh(r)) {
            l = r;
            break;
          }
          r = r.return;
        }
        if (l == null) throw Error(i(160));
        switch (l.tag) {
          case 27:
            var s = l.stateNode, c = Ff(e);
            bs(e, c, s);
            break;
          case 5:
            var y = l.stateNode;
            l.flags & 32 && (Sr(y, ""), l.flags &= -33);
            var R = Ff(e);
            bs(e, R, y);
            break;
          case 3:
          case 4:
            var U = l.stateNode.containerInfo, $ = Ff(e);
            Kf(
              e,
              $,
              U
            );
            break;
          default:
            throw Error(i(161));
        }
      } catch (ce) {
        vt(e, e.return, ce);
      }
      e.flags &= -3;
    }
    t & 4096 && (e.flags &= -4097);
  }
  function ey(e) {
    if (e.subtreeFlags & 1024)
      for (e = e.child; e !== null; ) {
        var t = e;
        ey(t), t.tag === 5 && t.flags & 1024 && t.stateNode.reset(), e = e.sibling;
      }
  }
  function Dl(e, t) {
    if (t.subtreeFlags & 8772)
      for (t = t.child; t !== null; )
        Kh(e, t.alternate, t), t = t.sibling;
  }
  function er(e) {
    for (e = e.child; e !== null; ) {
      var t = e;
      switch (t.tag) {
        case 0:
        case 11:
        case 14:
        case 15:
          go(4, t, t.return), er(t);
          break;
        case 1:
          ul(t, t.return);
          var l = t.stateNode;
          typeof l.componentWillUnmount == "function" && Yh(
            t,
            t.return,
            l
          ), er(t);
          break;
        case 27:
          Za(t.stateNode);
        case 26:
        case 5:
          ul(t, t.return), er(t);
          break;
        case 22:
          t.memoizedState === null && er(t);
          break;
        case 30:
          er(t);
          break;
        default:
          er(t);
      }
      e = e.sibling;
    }
  }
  function kl(e, t, l) {
    for (l = l && (t.subtreeFlags & 8772) !== 0, t = t.child; t !== null; ) {
      var r = t.alternate, s = e, c = t, y = c.flags;
      switch (c.tag) {
        case 0:
        case 11:
        case 15:
          kl(
            s,
            c,
            l
          ), Ia(4, c);
          break;
        case 1:
          if (kl(
            s,
            c,
            l
          ), r = c, s = r.stateNode, typeof s.componentDidMount == "function")
            try {
              s.componentDidMount();
            } catch ($) {
              vt(r, r.return, $);
            }
          if (r = c, s = r.updateQueue, s !== null) {
            var R = r.stateNode;
            try {
              var U = s.shared.hiddenCallbacks;
              if (U !== null)
                for (s.shared.hiddenCallbacks = null, s = 0; s < U.length; s++)
                  Nm(U[s], R);
            } catch ($) {
              vt(r, r.return, $);
            }
          }
          l && y & 64 && Ph(c), Va(c, c.return);
          break;
        case 27:
          Xh(c);
        case 26:
        case 5:
          kl(
            s,
            c,
            l
          ), l && r === null && y & 4 && Gh(c), Va(c, c.return);
          break;
        case 12:
          kl(
            s,
            c,
            l
          );
          break;
        case 31:
          kl(
            s,
            c,
            l
          ), l && y & 4 && Jh(s, c);
          break;
        case 13:
          kl(
            s,
            c,
            l
          ), l && y & 4 && Wh(s, c);
          break;
        case 22:
          c.memoizedState === null && kl(
            s,
            c,
            l
          ), Va(c, c.return);
          break;
        case 30:
          break;
        default:
          kl(
            s,
            c,
            l
          );
      }
      t = t.sibling;
    }
  }
  function Zf(e, t) {
    var l = null;
    e !== null && e.memoizedState !== null && e.memoizedState.cachePool !== null && (l = e.memoizedState.cachePool.pool), e = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (e = t.memoizedState.cachePool.pool), e !== l && (e != null && e.refCount++, l != null && Oa(l));
  }
  function Jf(e, t) {
    e = null, t.alternate !== null && (e = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== e && (t.refCount++, e != null && Oa(e));
  }
  function rl(e, t, l, r) {
    if (t.subtreeFlags & 10256)
      for (t = t.child; t !== null; )
        ty(
          e,
          t,
          l,
          r
        ), t = t.sibling;
  }
  function ty(e, t, l, r) {
    var s = t.flags;
    switch (t.tag) {
      case 0:
      case 11:
      case 15:
        rl(
          e,
          t,
          l,
          r
        ), s & 2048 && Ia(9, t);
        break;
      case 1:
        rl(
          e,
          t,
          l,
          r
        );
        break;
      case 3:
        rl(
          e,
          t,
          l,
          r
        ), s & 2048 && (e = null, t.alternate !== null && (e = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== e && (t.refCount++, e != null && Oa(e)));
        break;
      case 12:
        if (s & 2048) {
          rl(
            e,
            t,
            l,
            r
          ), e = t.stateNode;
          try {
            var c = t.memoizedProps, y = c.id, R = c.onPostCommit;
            typeof R == "function" && R(
              y,
              t.alternate === null ? "mount" : "update",
              e.passiveEffectDuration,
              -0
            );
          } catch (U) {
            vt(t, t.return, U);
          }
        } else
          rl(
            e,
            t,
            l,
            r
          );
        break;
      case 31:
        rl(
          e,
          t,
          l,
          r
        );
        break;
      case 13:
        rl(
          e,
          t,
          l,
          r
        );
        break;
      case 23:
        break;
      case 22:
        c = t.stateNode, y = t.alternate, t.memoizedState !== null ? c._visibility & 2 ? rl(
          e,
          t,
          l,
          r
        ) : Pa(e, t) : c._visibility & 2 ? rl(
          e,
          t,
          l,
          r
        ) : (c._visibility |= 2, Pr(
          e,
          t,
          l,
          r,
          (t.subtreeFlags & 10256) !== 0 || !1
        )), s & 2048 && Zf(y, t);
        break;
      case 24:
        rl(
          e,
          t,
          l,
          r
        ), s & 2048 && Jf(t.alternate, t);
        break;
      default:
        rl(
          e,
          t,
          l,
          r
        );
    }
  }
  function Pr(e, t, l, r, s) {
    for (s = s && ((t.subtreeFlags & 10256) !== 0 || !1), t = t.child; t !== null; ) {
      var c = e, y = t, R = l, U = r, $ = y.flags;
      switch (y.tag) {
        case 0:
        case 11:
        case 15:
          Pr(
            c,
            y,
            R,
            U,
            s
          ), Ia(8, y);
          break;
        case 23:
          break;
        case 22:
          var ce = y.stateNode;
          y.memoizedState !== null ? ce._visibility & 2 ? Pr(
            c,
            y,
            R,
            U,
            s
          ) : Pa(
            c,
            y
          ) : (ce._visibility |= 2, Pr(
            c,
            y,
            R,
            U,
            s
          )), s && $ & 2048 && Zf(
            y.alternate,
            y
          );
          break;
        case 24:
          Pr(
            c,
            y,
            R,
            U,
            s
          ), s && $ & 2048 && Jf(y.alternate, y);
          break;
        default:
          Pr(
            c,
            y,
            R,
            U,
            s
          );
      }
      t = t.sibling;
    }
  }
  function Pa(e, t) {
    if (t.subtreeFlags & 10256)
      for (t = t.child; t !== null; ) {
        var l = e, r = t, s = r.flags;
        switch (r.tag) {
          case 22:
            Pa(l, r), s & 2048 && Zf(
              r.alternate,
              r
            );
            break;
          case 24:
            Pa(l, r), s & 2048 && Jf(r.alternate, r);
            break;
          default:
            Pa(l, r);
        }
        t = t.sibling;
      }
  }
  var Ya = 8192;
  function Yr(e, t, l) {
    if (e.subtreeFlags & Ya)
      for (e = e.child; e !== null; )
        ny(
          e,
          t,
          l
        ), e = e.sibling;
  }
  function ny(e, t, l) {
    switch (e.tag) {
      case 26:
        Yr(
          e,
          t,
          l
        ), e.flags & Ya && e.memoizedState !== null && O1(
          l,
          ol,
          e.memoizedState,
          e.memoizedProps
        );
        break;
      case 5:
        Yr(
          e,
          t,
          l
        );
        break;
      case 3:
      case 4:
        var r = ol;
        ol = ks(e.stateNode.containerInfo), Yr(
          e,
          t,
          l
        ), ol = r;
        break;
      case 22:
        e.memoizedState === null && (r = e.alternate, r !== null && r.memoizedState !== null ? (r = Ya, Ya = 16777216, Yr(
          e,
          t,
          l
        ), Ya = r) : Yr(
          e,
          t,
          l
        ));
        break;
      default:
        Yr(
          e,
          t,
          l
        );
    }
  }
  function ly(e) {
    var t = e.alternate;
    if (t !== null && (e = t.child, e !== null)) {
      t.child = null;
      do
        t = e.sibling, e.sibling = null, e = t;
      while (e !== null);
    }
  }
  function Ga(e) {
    var t = e.deletions;
    if ((e.flags & 16) !== 0) {
      if (t !== null)
        for (var l = 0; l < t.length; l++) {
          var r = t[l];
          rn = r, ry(
            r,
            e
          );
        }
      ly(e);
    }
    if (e.subtreeFlags & 10256)
      for (e = e.child; e !== null; )
        oy(e), e = e.sibling;
  }
  function oy(e) {
    switch (e.tag) {
      case 0:
      case 11:
      case 15:
        Ga(e), e.flags & 2048 && go(9, e, e.return);
        break;
      case 3:
        Ga(e);
        break;
      case 12:
        Ga(e);
        break;
      case 22:
        var t = e.stateNode;
        e.memoizedState !== null && t._visibility & 2 && (e.return === null || e.return.tag !== 13) ? (t._visibility &= -3, ws(e)) : Ga(e);
        break;
      default:
        Ga(e);
    }
  }
  function ws(e) {
    var t = e.deletions;
    if ((e.flags & 16) !== 0) {
      if (t !== null)
        for (var l = 0; l < t.length; l++) {
          var r = t[l];
          rn = r, ry(
            r,
            e
          );
        }
      ly(e);
    }
    for (e = e.child; e !== null; ) {
      switch (t = e, t.tag) {
        case 0:
        case 11:
        case 15:
          go(8, t, t.return), ws(t);
          break;
        case 22:
          l = t.stateNode, l._visibility & 2 && (l._visibility &= -3, ws(t));
          break;
        default:
          ws(t);
      }
      e = e.sibling;
    }
  }
  function ry(e, t) {
    for (; rn !== null; ) {
      var l = rn;
      switch (l.tag) {
        case 0:
        case 11:
        case 15:
          go(8, l, t);
          break;
        case 23:
        case 22:
          if (l.memoizedState !== null && l.memoizedState.cachePool !== null) {
            var r = l.memoizedState.cachePool.pool;
            r != null && r.refCount++;
          }
          break;
        case 24:
          Oa(l.memoizedState.cache);
      }
      if (r = l.child, r !== null) r.return = l, rn = r;
      else
        e: for (l = e; rn !== null; ) {
          r = rn;
          var s = r.sibling, c = r.return;
          if (Qh(r), r === l) {
            rn = null;
            break e;
          }
          if (s !== null) {
            s.return = c, rn = s;
            break e;
          }
          rn = c;
        }
    }
  }
  var PS = {
    getCacheForType: function(e) {
      var t = fn(Qt), l = t.data.get(e);
      return l === void 0 && (l = e(), t.data.set(e, l)), l;
    },
    cacheSignal: function() {
      return fn(Qt).controller.signal;
    }
  }, YS = typeof WeakMap == "function" ? WeakMap : Map, dt = 0, Mt = null, lt = null, at = 0, yt = 0, Hn = null, mo = !1, Gr = !1, Wf = !1, _l = 0, It = 0, ho = 0, tr = 0, $f = 0, Ln = 0, qr = 0, qa = null, On = null, ed = !1, Ss = 0, ay = 0, Es = 1 / 0, Ts = null, yo = null, tn = 0, vo = null, Xr = null, Hl = 0, td = 0, nd = null, iy = null, Xa = 0, ld = null;
  function Un() {
    return (dt & 2) !== 0 && at !== 0 ? at & -at : k.T !== null ? cd() : Xt();
  }
  function sy() {
    if (Ln === 0)
      if ((at & 536870912) === 0 || st) {
        var e = Ut;
        Ut <<= 1, (Ut & 3932160) === 0 && (Ut = 262144), Ln = e;
      } else Ln = 536870912;
    return e = kn.current, e !== null && (e.flags |= 32), Ln;
  }
  function Mn(e, t, l) {
    (e === Mt && (yt === 2 || yt === 9) || e.cancelPendingCommit !== null) && (Fr(e, 0), bo(
      e,
      at,
      Ln,
      !1
    )), qt(e, l), ((dt & 2) === 0 || e !== Mt) && (e === Mt && ((dt & 2) === 0 && (tr |= l), It === 4 && bo(
      e,
      at,
      Ln,
      !1
    )), fl(e));
  }
  function cy(e, t, l) {
    if ((dt & 6) !== 0) throw Error(i(327));
    var r = !l && (t & 127) === 0 && (t & e.expiredLanes) === 0 || Gt(e, t), s = r ? XS(e, t) : rd(e, t, !0), c = r;
    do {
      if (s === 0) {
        Gr && !r && bo(e, t, 0, !1);
        break;
      } else {
        if (l = e.current.alternate, c && !GS(l)) {
          s = rd(e, t, !1), c = !1;
          continue;
        }
        if (s === 2) {
          if (c = t, e.errorRecoveryDisabledLanes & c)
            var y = 0;
          else
            y = e.pendingLanes & -536870913, y = y !== 0 ? y : y & 536870912 ? 536870912 : 0;
          if (y !== 0) {
            t = y;
            e: {
              var R = e;
              s = qa;
              var U = R.current.memoizedState.isDehydrated;
              if (U && (Fr(R, y).flags |= 256), y = rd(
                R,
                y,
                !1
              ), y !== 2) {
                if (Wf && !U) {
                  R.errorRecoveryDisabledLanes |= c, tr |= c, s = 4;
                  break e;
                }
                c = On, On = s, c !== null && (On === null ? On = c : On.push.apply(
                  On,
                  c
                ));
              }
              s = y;
            }
            if (c = !1, s !== 2) continue;
          }
        }
        if (s === 1) {
          Fr(e, 0), bo(e, t, 0, !0);
          break;
        }
        e: {
          switch (r = e, c = s, c) {
            case 0:
            case 1:
              throw Error(i(345));
            case 4:
              if ((t & 4194048) !== t) break;
            case 6:
              bo(
                r,
                t,
                Ln,
                !mo
              );
              break e;
            case 2:
              On = null;
              break;
            case 3:
            case 5:
              break;
            default:
              throw Error(i(329));
          }
          if ((t & 62914560) === t && (s = Ss + 300 - ae(), 10 < s)) {
            if (bo(
              r,
              t,
              Ln,
              !mo
            ), jt(r, 0, !0) !== 0) break e;
            Hl = t, r.timeoutHandle = Iy(
              uy.bind(
                null,
                r,
                l,
                On,
                Ts,
                ed,
                t,
                Ln,
                tr,
                qr,
                mo,
                c,
                "Throttled",
                -0,
                0
              ),
              s
            );
            break e;
          }
          uy(
            r,
            l,
            On,
            Ts,
            ed,
            t,
            Ln,
            tr,
            qr,
            mo,
            c,
            null,
            -0,
            0
          );
        }
      }
      break;
    } while (!0);
    fl(e);
  }
  function uy(e, t, l, r, s, c, y, R, U, $, ce, de, te, oe) {
    if (e.timeoutHandle = -1, de = t.subtreeFlags, de & 8192 || (de & 16785408) === 16785408) {
      de = {
        stylesheets: null,
        count: 0,
        imgCount: 0,
        imgBytes: 0,
        suspenseyImages: [],
        waitingForImages: !0,
        waitingForViewTransition: !1,
        unsuspend: wl
      }, ny(
        t,
        c,
        de
      );
      var Ne = (c & 62914560) === c ? Ss - ae() : (c & 4194048) === c ? ay - ae() : 0;
      if (Ne = M1(
        de,
        Ne
      ), Ne !== null) {
        Hl = c, e.cancelPendingCommit = Ne(
          vy.bind(
            null,
            e,
            t,
            c,
            l,
            r,
            s,
            y,
            R,
            U,
            ce,
            de,
            null,
            te,
            oe
          )
        ), bo(e, c, y, !$);
        return;
      }
    }
    vy(
      e,
      t,
      c,
      l,
      r,
      s,
      y,
      R,
      U
    );
  }
  function GS(e) {
    for (var t = e; ; ) {
      var l = t.tag;
      if ((l === 0 || l === 11 || l === 15) && t.flags & 16384 && (l = t.updateQueue, l !== null && (l = l.stores, l !== null)))
        for (var r = 0; r < l.length; r++) {
          var s = l[r], c = s.getSnapshot;
          s = s.value;
          try {
            if (!jn(c(), s)) return !1;
          } catch {
            return !1;
          }
        }
      if (l = t.child, t.subtreeFlags & 16384 && l !== null)
        l.return = t, t = l;
      else {
        if (t === e) break;
        for (; t.sibling === null; ) {
          if (t.return === null || t.return === e) return !0;
          t = t.return;
        }
        t.sibling.return = t.return, t = t.sibling;
      }
    }
    return !0;
  }
  function bo(e, t, l, r) {
    t &= ~$f, t &= ~tr, e.suspendedLanes |= t, e.pingedLanes &= ~t, r && (e.warmLanes |= t), r = e.expirationTimes;
    for (var s = t; 0 < s; ) {
      var c = 31 - ht(s), y = 1 << c;
      r[c] = -1, s &= ~y;
    }
    l !== 0 && vl(e, l, t);
  }
  function Rs() {
    return (dt & 6) === 0 ? (Fa(0), !1) : !0;
  }
  function od() {
    if (lt !== null) {
      if (yt === 0)
        var e = lt.return;
      else
        e = lt, Rl = Xo = null, xf(e), Lr = null, Aa = 0, e = lt;
      for (; e !== null; )
        Vh(e.alternate, e), e = e.return;
      lt = null;
    }
  }
  function Fr(e, t) {
    var l = e.timeoutHandle;
    l !== -1 && (e.timeoutHandle = -1, u1(l)), l = e.cancelPendingCommit, l !== null && (e.cancelPendingCommit = null, l()), Hl = 0, od(), Mt = e, lt = l = El(e.current, null), at = t, yt = 0, Hn = null, mo = !1, Gr = Gt(e, t), Wf = !1, qr = Ln = $f = tr = ho = It = 0, On = qa = null, ed = !1, (t & 8) !== 0 && (t |= t & 32);
    var r = e.entangledLanes;
    if (r !== 0)
      for (e = e.entanglements, r &= t; 0 < r; ) {
        var s = 31 - ht(r), c = 1 << s;
        t |= e[s], r &= ~c;
      }
    return _l = t, Xi(), l;
  }
  function fy(e, t) {
    Xe = null, k.H = La, t === Hr || t === es ? (t = Om(), yt = 3) : t === sf ? (t = Om(), yt = 4) : yt = t === Hf ? 8 : t !== null && typeof t == "object" && typeof t.then == "function" ? 6 : 1, Hn = t, lt === null && (It = 1, gs(
      e,
      Fn(t, e.current)
    ));
  }
  function dy() {
    var e = kn.current;
    return e === null ? !0 : (at & 4194048) === at ? Jn === null : (at & 62914560) === at || (at & 536870912) !== 0 ? e === Jn : !1;
  }
  function py() {
    var e = k.H;
    return k.H = La, e === null ? La : e;
  }
  function gy() {
    var e = k.A;
    return k.A = PS, e;
  }
  function Cs() {
    It = 4, mo || (at & 4194048) !== at && kn.current !== null || (Gr = !0), (ho & 134217727) === 0 && (tr & 134217727) === 0 || Mt === null || bo(
      Mt,
      at,
      Ln,
      !1
    );
  }
  function rd(e, t, l) {
    var r = dt;
    dt |= 2;
    var s = py(), c = gy();
    (Mt !== e || at !== t) && (Ts = null, Fr(e, t)), t = !1;
    var y = It;
    e: do
      try {
        if (yt !== 0 && lt !== null) {
          var R = lt, U = Hn;
          switch (yt) {
            case 8:
              od(), y = 6;
              break e;
            case 3:
            case 2:
            case 9:
            case 6:
              kn.current === null && (t = !0);
              var $ = yt;
              if (yt = 0, Hn = null, Kr(e, R, U, $), l && Gr) {
                y = 0;
                break e;
              }
              break;
            default:
              $ = yt, yt = 0, Hn = null, Kr(e, R, U, $);
          }
        }
        qS(), y = It;
        break;
      } catch (ce) {
        fy(e, ce);
      }
    while (!0);
    return t && e.shellSuspendCounter++, Rl = Xo = null, dt = r, k.H = s, k.A = c, lt === null && (Mt = null, at = 0, Xi()), y;
  }
  function qS() {
    for (; lt !== null; ) my(lt);
  }
  function XS(e, t) {
    var l = dt;
    dt |= 2;
    var r = py(), s = gy();
    Mt !== e || at !== t ? (Ts = null, Es = ae() + 500, Fr(e, t)) : Gr = Gt(
      e,
      t
    );
    e: do
      try {
        if (yt !== 0 && lt !== null) {
          t = lt;
          var c = Hn;
          t: switch (yt) {
            case 1:
              yt = 0, Hn = null, Kr(e, t, c, 1);
              break;
            case 2:
            case 9:
              if (Rm(c)) {
                yt = 0, Hn = null, hy(t);
                break;
              }
              t = function() {
                yt !== 2 && yt !== 9 || Mt !== e || (yt = 7), fl(e);
              }, c.then(t, t);
              break e;
            case 3:
              yt = 7;
              break e;
            case 4:
              yt = 5;
              break e;
            case 7:
              Rm(c) ? (yt = 0, Hn = null, hy(t)) : (yt = 0, Hn = null, Kr(e, t, c, 7));
              break;
            case 5:
              var y = null;
              switch (lt.tag) {
                case 26:
                  y = lt.memoizedState;
                case 5:
                case 27:
                  var R = lt;
                  if (y ? tv(y) : R.stateNode.complete) {
                    yt = 0, Hn = null;
                    var U = R.sibling;
                    if (U !== null) lt = U;
                    else {
                      var $ = R.return;
                      $ !== null ? (lt = $, Os($)) : lt = null;
                    }
                    break t;
                  }
              }
              yt = 0, Hn = null, Kr(e, t, c, 5);
              break;
            case 6:
              yt = 0, Hn = null, Kr(e, t, c, 6);
              break;
            case 8:
              od(), It = 6;
              break e;
            default:
              throw Error(i(462));
          }
        }
        FS();
        break;
      } catch (ce) {
        fy(e, ce);
      }
    while (!0);
    return Rl = Xo = null, k.H = r, k.A = s, dt = l, lt !== null ? 0 : (Mt = null, at = 0, Xi(), It);
  }
  function FS() {
    for (; lt !== null && !Oe(); )
      my(lt);
  }
  function my(e) {
    var t = Bh(e.alternate, e, _l);
    e.memoizedProps = e.pendingProps, t === null ? Os(e) : lt = t;
  }
  function hy(e) {
    var t = e, l = t.alternate;
    switch (t.tag) {
      case 15:
      case 0:
        t = Dh(
          l,
          t,
          t.pendingProps,
          t.type,
          void 0,
          at
        );
        break;
      case 11:
        t = Dh(
          l,
          t,
          t.pendingProps,
          t.type.render,
          t.ref,
          at
        );
        break;
      case 5:
        xf(t);
      default:
        Vh(l, t), t = lt = gm(t, _l), t = Bh(l, t, _l);
    }
    e.memoizedProps = e.pendingProps, t === null ? Os(e) : lt = t;
  }
  function Kr(e, t, l, r) {
    Rl = Xo = null, xf(t), Lr = null, Aa = 0;
    var s = t.return;
    try {
      if (_S(
        e,
        s,
        t,
        l,
        at
      )) {
        It = 1, gs(
          e,
          Fn(l, e.current)
        ), lt = null;
        return;
      }
    } catch (c) {
      if (s !== null) throw lt = s, c;
      It = 1, gs(
        e,
        Fn(l, e.current)
      ), lt = null;
      return;
    }
    t.flags & 32768 ? (st || r === 1 ? e = !0 : Gr || (at & 536870912) !== 0 ? e = !1 : (mo = e = !0, (r === 2 || r === 9 || r === 3 || r === 6) && (r = kn.current, r !== null && r.tag === 13 && (r.flags |= 16384))), yy(t, e)) : Os(t);
  }
  function Os(e) {
    var t = e;
    do {
      if ((t.flags & 32768) !== 0) {
        yy(
          t,
          mo
        );
        return;
      }
      e = t.return;
      var l = US(
        t.alternate,
        t,
        _l
      );
      if (l !== null) {
        lt = l;
        return;
      }
      if (t = t.sibling, t !== null) {
        lt = t;
        return;
      }
      lt = t = e;
    } while (t !== null);
    It === 0 && (It = 5);
  }
  function yy(e, t) {
    do {
      var l = BS(e.alternate, e);
      if (l !== null) {
        l.flags &= 32767, lt = l;
        return;
      }
      if (l = e.return, l !== null && (l.flags |= 32768, l.subtreeFlags = 0, l.deletions = null), !t && (e = e.sibling, e !== null)) {
        lt = e;
        return;
      }
      lt = e = l;
    } while (e !== null);
    It = 6, lt = null;
  }
  function vy(e, t, l, r, s, c, y, R, U) {
    e.cancelPendingCommit = null;
    do
      Ms();
    while (tn !== 0);
    if ((dt & 6) !== 0) throw Error(i(327));
    if (t !== null) {
      if (t === e.current) throw Error(i(177));
      if (c = t.lanes | t.childLanes, c |= Xu, Yn(
        e,
        l,
        c,
        y,
        R,
        U
      ), e === Mt && (lt = Mt = null, at = 0), Xr = t, vo = e, Hl = l, td = c, nd = s, iy = r, (t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0 ? (e.callbackNode = null, e.callbackPriority = 0, JS(xe, function() {
        return Ey(), null;
      })) : (e.callbackNode = null, e.callbackPriority = 0), r = (t.flags & 13878) !== 0, (t.subtreeFlags & 13878) !== 0 || r) {
        r = k.T, k.T = null, s = P.p, P.p = 2, y = dt, dt |= 4;
        try {
          IS(e, t, l);
        } finally {
          dt = y, P.p = s, k.T = r;
        }
      }
      tn = 1, by(), xy(), wy();
    }
  }
  function by() {
    if (tn === 1) {
      tn = 0;
      var e = vo, t = Xr, l = (t.flags & 13878) !== 0;
      if ((t.subtreeFlags & 13878) !== 0 || l) {
        l = k.T, k.T = null;
        var r = P.p;
        P.p = 2;
        var s = dt;
        dt |= 4;
        try {
          $h(t, e);
          var c = yd, y = rm(e.containerInfo), R = c.focusedElem, U = c.selectionRange;
          if (y !== R && R && R.ownerDocument && om(
            R.ownerDocument.documentElement,
            R
          )) {
            if (U !== null && Vu(R)) {
              var $ = U.start, ce = U.end;
              if (ce === void 0 && (ce = $), "selectionStart" in R)
                R.selectionStart = $, R.selectionEnd = Math.min(
                  ce,
                  R.value.length
                );
              else {
                var de = R.ownerDocument || document, te = de && de.defaultView || window;
                if (te.getSelection) {
                  var oe = te.getSelection(), Ne = R.textContent.length, Ie = Math.min(U.start, Ne), Et = U.end === void 0 ? Ie : Math.min(U.end, Ne);
                  !oe.extend && Ie > Et && (y = Et, Et = Ie, Ie = y);
                  var K = lm(
                    R,
                    Ie
                  ), Y = lm(
                    R,
                    Et
                  );
                  if (K && Y && (oe.rangeCount !== 1 || oe.anchorNode !== K.node || oe.anchorOffset !== K.offset || oe.focusNode !== Y.node || oe.focusOffset !== Y.offset)) {
                    var W = de.createRange();
                    W.setStart(K.node, K.offset), oe.removeAllRanges(), Ie > Et ? (oe.addRange(W), oe.extend(Y.node, Y.offset)) : (W.setEnd(Y.node, Y.offset), oe.addRange(W));
                  }
                }
              }
            }
            for (de = [], oe = R; oe = oe.parentNode; )
              oe.nodeType === 1 && de.push({
                element: oe,
                left: oe.scrollLeft,
                top: oe.scrollTop
              });
            for (typeof R.focus == "function" && R.focus(), R = 0; R < de.length; R++) {
              var fe = de[R];
              fe.element.scrollLeft = fe.left, fe.element.scrollTop = fe.top;
            }
          }
          Is = !!hd, yd = hd = null;
        } finally {
          dt = s, P.p = r, k.T = l;
        }
      }
      e.current = t, tn = 2;
    }
  }
  function xy() {
    if (tn === 2) {
      tn = 0;
      var e = vo, t = Xr, l = (t.flags & 8772) !== 0;
      if ((t.subtreeFlags & 8772) !== 0 || l) {
        l = k.T, k.T = null;
        var r = P.p;
        P.p = 2;
        var s = dt;
        dt |= 4;
        try {
          Kh(e, t.alternate, t);
        } finally {
          dt = s, P.p = r, k.T = l;
        }
      }
      tn = 3;
    }
  }
  function wy() {
    if (tn === 4 || tn === 3) {
      tn = 0, He();
      var e = vo, t = Xr, l = Hl, r = iy;
      (t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0 ? tn = 5 : (tn = 0, Xr = vo = null, Sy(e, e.pendingLanes));
      var s = e.pendingLanes;
      if (s === 0 && (yo = null), xt(l), t = t.stateNode, gt && typeof gt.onCommitFiberRoot == "function")
        try {
          gt.onCommitFiberRoot(
            tt,
            t,
            void 0,
            (t.current.flags & 128) === 128
          );
        } catch {
        }
      if (r !== null) {
        t = k.T, s = P.p, P.p = 2, k.T = null;
        try {
          for (var c = e.onRecoverableError, y = 0; y < r.length; y++) {
            var R = r[y];
            c(R.value, {
              componentStack: R.stack
            });
          }
        } finally {
          k.T = t, P.p = s;
        }
      }
      (Hl & 3) !== 0 && Ms(), fl(e), s = e.pendingLanes, (l & 261930) !== 0 && (s & 42) !== 0 ? e === ld ? Xa++ : (Xa = 0, ld = e) : Xa = 0, Fa(0);
    }
  }
  function Sy(e, t) {
    (e.pooledCacheLanes &= t) === 0 && (t = e.pooledCache, t != null && (e.pooledCache = null, Oa(t)));
  }
  function Ms() {
    return by(), xy(), wy(), Ey();
  }
  function Ey() {
    if (tn !== 5) return !1;
    var e = vo, t = td;
    td = 0;
    var l = xt(Hl), r = k.T, s = P.p;
    try {
      P.p = 32 > l ? 32 : l, k.T = null, l = nd, nd = null;
      var c = vo, y = Hl;
      if (tn = 0, Xr = vo = null, Hl = 0, (dt & 6) !== 0) throw Error(i(331));
      var R = dt;
      if (dt |= 4, oy(c.current), ty(
        c,
        c.current,
        y,
        l
      ), dt = R, Fa(0, !1), gt && typeof gt.onPostCommitFiberRoot == "function")
        try {
          gt.onPostCommitFiberRoot(tt, c);
        } catch {
        }
      return !0;
    } finally {
      P.p = s, k.T = r, Sy(e, t);
    }
  }
  function Ty(e, t, l) {
    t = Fn(l, t), t = _f(e.stateNode, t, 2), e = uo(e, t, 2), e !== null && (qt(e, 2), fl(e));
  }
  function vt(e, t, l) {
    if (e.tag === 3)
      Ty(e, e, l);
    else
      for (; t !== null; ) {
        if (t.tag === 3) {
          Ty(
            t,
            e,
            l
          );
          break;
        } else if (t.tag === 1) {
          var r = t.stateNode;
          if (typeof t.type.getDerivedStateFromError == "function" || typeof r.componentDidCatch == "function" && (yo === null || !yo.has(r))) {
            e = Fn(l, e), l = Rh(2), r = uo(t, l, 2), r !== null && (Ch(
              l,
              r,
              t,
              e
            ), qt(r, 2), fl(r));
            break;
          }
        }
        t = t.return;
      }
  }
  function ad(e, t, l) {
    var r = e.pingCache;
    if (r === null) {
      r = e.pingCache = new YS();
      var s = /* @__PURE__ */ new Set();
      r.set(t, s);
    } else
      s = r.get(t), s === void 0 && (s = /* @__PURE__ */ new Set(), r.set(t, s));
    s.has(l) || (Wf = !0, s.add(l), e = KS.bind(null, e, t, l), t.then(e, e));
  }
  function KS(e, t, l) {
    var r = e.pingCache;
    r !== null && r.delete(t), e.pingedLanes |= e.suspendedLanes & l, e.warmLanes &= ~l, Mt === e && (at & l) === l && (It === 4 || It === 3 && (at & 62914560) === at && 300 > ae() - Ss ? (dt & 2) === 0 && Fr(e, 0) : $f |= l, qr === at && (qr = 0)), fl(e);
  }
  function Ry(e, t) {
    t === 0 && (t = Nn()), e = Yo(e, t), e !== null && (qt(e, t), fl(e));
  }
  function QS(e) {
    var t = e.memoizedState, l = 0;
    t !== null && (l = t.retryLane), Ry(e, l);
  }
  function ZS(e, t) {
    var l = 0;
    switch (e.tag) {
      case 31:
      case 13:
        var r = e.stateNode, s = e.memoizedState;
        s !== null && (l = s.retryLane);
        break;
      case 19:
        r = e.stateNode;
        break;
      case 22:
        r = e.stateNode._retryCache;
        break;
      default:
        throw Error(i(314));
    }
    r !== null && r.delete(t), Ry(e, l);
  }
  function JS(e, t) {
    return Se(e, t);
  }
  var As = null, Qr = null, id = !1, zs = !1, sd = !1, xo = 0;
  function fl(e) {
    e !== Qr && e.next === null && (Qr === null ? As = Qr = e : Qr = Qr.next = e), zs = !0, id || (id = !0, $S());
  }
  function Fa(e, t) {
    if (!sd && zs) {
      sd = !0;
      do
        for (var l = !1, r = As; r !== null; ) {
          if (e !== 0) {
            var s = r.pendingLanes;
            if (s === 0) var c = 0;
            else {
              var y = r.suspendedLanes, R = r.pingedLanes;
              c = (1 << 31 - ht(42 | e) + 1) - 1, c &= s & ~(y & ~R), c = c & 201326741 ? c & 201326741 | 1 : c ? c | 2 : 0;
            }
            c !== 0 && (l = !0, Ay(r, c));
          } else
            c = at, c = jt(
              r,
              r === Mt ? c : 0,
              r.cancelPendingCommit !== null || r.timeoutHandle !== -1
            ), (c & 3) === 0 || Gt(r, c) || (l = !0, Ay(r, c));
          r = r.next;
        }
      while (l);
      sd = !1;
    }
  }
  function WS() {
    Cy();
  }
  function Cy() {
    zs = id = !1;
    var e = 0;
    xo !== 0 && c1() && (e = xo);
    for (var t = ae(), l = null, r = As; r !== null; ) {
      var s = r.next, c = Oy(r, t);
      c === 0 ? (r.next = null, l === null ? As = s : l.next = s, s === null && (Qr = l)) : (l = r, (e !== 0 || (c & 3) !== 0) && (zs = !0)), r = s;
    }
    tn !== 0 && tn !== 5 || Fa(e), xo !== 0 && (xo = 0);
  }
  function Oy(e, t) {
    for (var l = e.suspendedLanes, r = e.pingedLanes, s = e.expirationTimes, c = e.pendingLanes & -62914561; 0 < c; ) {
      var y = 31 - ht(c), R = 1 << y, U = s[y];
      U === -1 ? ((R & l) === 0 || (R & r) !== 0) && (s[y] = Sn(R, t)) : U <= t && (e.expiredLanes |= R), c &= ~R;
    }
    if (t = Mt, l = at, l = jt(
      e,
      e === t ? l : 0,
      e.cancelPendingCommit !== null || e.timeoutHandle !== -1
    ), r = e.callbackNode, l === 0 || e === t && (yt === 2 || yt === 9) || e.cancelPendingCommit !== null)
      return r !== null && r !== null && Re(r), e.callbackNode = null, e.callbackPriority = 0;
    if ((l & 3) === 0 || Gt(e, l)) {
      if (t = l & -l, t === e.callbackPriority) return t;
      switch (r !== null && Re(r), xt(l)) {
        case 2:
        case 8:
          l = be;
          break;
        case 32:
          l = xe;
          break;
        case 268435456:
          l = rt;
          break;
        default:
          l = xe;
      }
      return r = My.bind(null, e), l = Se(l, r), e.callbackPriority = t, e.callbackNode = l, t;
    }
    return r !== null && r !== null && Re(r), e.callbackPriority = 2, e.callbackNode = null, 2;
  }
  function My(e, t) {
    if (tn !== 0 && tn !== 5)
      return e.callbackNode = null, e.callbackPriority = 0, null;
    var l = e.callbackNode;
    if (Ms() && e.callbackNode !== l)
      return null;
    var r = at;
    return r = jt(
      e,
      e === Mt ? r : 0,
      e.cancelPendingCommit !== null || e.timeoutHandle !== -1
    ), r === 0 ? null : (cy(e, r, t), Oy(e, ae()), e.callbackNode != null && e.callbackNode === l ? My.bind(null, e) : null);
  }
  function Ay(e, t) {
    if (Ms()) return null;
    cy(e, t, !0);
  }
  function $S() {
    f1(function() {
      (dt & 6) !== 0 ? Se(
        Le,
        WS
      ) : Cy();
    });
  }
  function cd() {
    if (xo === 0) {
      var e = kr;
      e === 0 && (e = ft, ft <<= 1, (ft & 261888) === 0 && (ft = 256)), xo = e;
    }
    return xo;
  }
  function zy(e) {
    return e == null || typeof e == "symbol" || typeof e == "boolean" ? null : typeof e == "function" ? e : Ui("" + e);
  }
  function Ny(e, t) {
    var l = t.ownerDocument.createElement("input");
    return l.name = t.name, l.value = t.value, e.id && l.setAttribute("form", e.id), t.parentNode.insertBefore(l, t), e = new FormData(e), l.parentNode.removeChild(l), e;
  }
  function e1(e, t, l, r, s) {
    if (t === "submit" && l && l.stateNode === s) {
      var c = zy(
        (s[cn] || null).action
      ), y = r.submitter;
      y && (t = (t = y[cn] || null) ? zy(t.formAction) : y.getAttribute("formAction"), t !== null && (c = t, y = null));
      var R = new Pi(
        "action",
        "action",
        null,
        r,
        s
      );
      e.push({
        event: R,
        listeners: [
          {
            instance: null,
            listener: function() {
              if (r.defaultPrevented) {
                if (xo !== 0) {
                  var U = y ? Ny(s, y) : new FormData(s);
                  Af(
                    l,
                    {
                      pending: !0,
                      data: U,
                      method: s.method,
                      action: c
                    },
                    null,
                    U
                  );
                }
              } else
                typeof c == "function" && (R.preventDefault(), U = y ? Ny(s, y) : new FormData(s), Af(
                  l,
                  {
                    pending: !0,
                    data: U,
                    method: s.method,
                    action: c
                  },
                  c,
                  U
                ));
            },
            currentTarget: s
          }
        ]
      });
    }
  }
  for (var ud = 0; ud < qu.length; ud++) {
    var fd = qu[ud], t1 = fd.toLowerCase(), n1 = fd[0].toUpperCase() + fd.slice(1);
    ll(
      t1,
      "on" + n1
    );
  }
  ll(sm, "onAnimationEnd"), ll(cm, "onAnimationIteration"), ll(um, "onAnimationStart"), ll("dblclick", "onDoubleClick"), ll("focusin", "onFocus"), ll("focusout", "onBlur"), ll(vS, "onTransitionRun"), ll(bS, "onTransitionStart"), ll(xS, "onTransitionCancel"), ll(fm, "onTransitionEnd"), xr("onMouseEnter", ["mouseout", "mouseover"]), xr("onMouseLeave", ["mouseout", "mouseover"]), xr("onPointerEnter", ["pointerout", "pointerover"]), xr("onPointerLeave", ["pointerout", "pointerover"]), Bo(
    "onChange",
    "change click focusin focusout input keydown keyup selectionchange".split(" ")
  ), Bo(
    "onSelect",
    "focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(
      " "
    )
  ), Bo("onBeforeInput", [
    "compositionend",
    "keypress",
    "textInput",
    "paste"
  ]), Bo(
    "onCompositionEnd",
    "compositionend focusout keydown keypress keyup mousedown".split(" ")
  ), Bo(
    "onCompositionStart",
    "compositionstart focusout keydown keypress keyup mousedown".split(" ")
  ), Bo(
    "onCompositionUpdate",
    "compositionupdate focusout keydown keypress keyup mousedown".split(" ")
  );
  var Ka = "abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(
    " "
  ), l1 = new Set(
    "beforetoggle cancel close invalid load scroll scrollend toggle".split(" ").concat(Ka)
  );
  function jy(e, t) {
    t = (t & 4) !== 0;
    for (var l = 0; l < e.length; l++) {
      var r = e[l], s = r.event;
      r = r.listeners;
      e: {
        var c = void 0;
        if (t)
          for (var y = r.length - 1; 0 <= y; y--) {
            var R = r[y], U = R.instance, $ = R.currentTarget;
            if (R = R.listener, U !== c && s.isPropagationStopped())
              break e;
            c = R, s.currentTarget = $;
            try {
              c(s);
            } catch (ce) {
              qi(ce);
            }
            s.currentTarget = null, c = U;
          }
        else
          for (y = 0; y < r.length; y++) {
            if (R = r[y], U = R.instance, $ = R.currentTarget, R = R.listener, U !== c && s.isPropagationStopped())
              break e;
            c = R, s.currentTarget = $;
            try {
              c(s);
            } catch (ce) {
              qi(ce);
            }
            s.currentTarget = null, c = U;
          }
      }
    }
  }
  function ot(e, t) {
    var l = t[pa];
    l === void 0 && (l = t[pa] = /* @__PURE__ */ new Set());
    var r = e + "__bubble";
    l.has(r) || (Dy(t, e, 2, !1), l.add(r));
  }
  function dd(e, t, l) {
    var r = 0;
    t && (r |= 4), Dy(
      l,
      e,
      r,
      t
    );
  }
  var Ns = "_reactListening" + Math.random().toString(36).slice(2);
  function pd(e) {
    if (!e[Ns]) {
      e[Ns] = !0, Cg.forEach(function(l) {
        l !== "selectionchange" && (l1.has(l) || dd(l, !1, e), dd(l, !0, e));
      });
      var t = e.nodeType === 9 ? e : e.ownerDocument;
      t === null || t[Ns] || (t[Ns] = !0, dd("selectionchange", !1, t));
    }
  }
  function Dy(e, t, l, r) {
    switch (sv(t)) {
      case 2:
        var s = N1;
        break;
      case 8:
        s = j1;
        break;
      default:
        s = Md;
    }
    l = s.bind(
      null,
      t,
      l,
      e
    ), s = void 0, !ju || t !== "touchstart" && t !== "touchmove" && t !== "wheel" || (s = !0), r ? s !== void 0 ? e.addEventListener(t, l, {
      capture: !0,
      passive: s
    }) : e.addEventListener(t, l, !0) : s !== void 0 ? e.addEventListener(t, l, {
      passive: s
    }) : e.addEventListener(t, l, !1);
  }
  function gd(e, t, l, r, s) {
    var c = r;
    if ((t & 1) === 0 && (t & 2) === 0 && r !== null)
      e: for (; ; ) {
        if (r === null) return;
        var y = r.tag;
        if (y === 3 || y === 4) {
          var R = r.stateNode.containerInfo;
          if (R === s) break;
          if (y === 4)
            for (y = r.return; y !== null; ) {
              var U = y.tag;
              if ((U === 3 || U === 4) && y.stateNode.containerInfo === s)
                return;
              y = y.return;
            }
          for (; R !== null; ) {
            if (y = yr(R), y === null) return;
            if (U = y.tag, U === 5 || U === 6 || U === 26 || U === 27) {
              r = c = y;
              continue e;
            }
            R = R.parentNode;
          }
        }
        r = r.return;
      }
    Ug(function() {
      var $ = c, ce = zu(l), de = [];
      e: {
        var te = dm.get(e);
        if (te !== void 0) {
          var oe = Pi, Ne = e;
          switch (e) {
            case "keypress":
              if (Ii(l) === 0) break e;
            case "keydown":
            case "keyup":
              oe = Zw;
              break;
            case "focusin":
              Ne = "focus", oe = Hu;
              break;
            case "focusout":
              Ne = "blur", oe = Hu;
              break;
            case "beforeblur":
            case "afterblur":
              oe = Hu;
              break;
            case "click":
              if (l.button === 2) break e;
            case "auxclick":
            case "dblclick":
            case "mousedown":
            case "mousemove":
            case "mouseup":
            case "mouseout":
            case "mouseover":
            case "contextmenu":
              oe = Vg;
              break;
            case "drag":
            case "dragend":
            case "dragenter":
            case "dragexit":
            case "dragleave":
            case "dragover":
            case "dragstart":
            case "drop":
              oe = Uw;
              break;
            case "touchcancel":
            case "touchend":
            case "touchmove":
            case "touchstart":
              oe = $w;
              break;
            case sm:
            case cm:
            case um:
              oe = Vw;
              break;
            case fm:
              oe = tS;
              break;
            case "scroll":
            case "scrollend":
              oe = Hw;
              break;
            case "wheel":
              oe = lS;
              break;
            case "copy":
            case "cut":
            case "paste":
              oe = Yw;
              break;
            case "gotpointercapture":
            case "lostpointercapture":
            case "pointercancel":
            case "pointerdown":
            case "pointermove":
            case "pointerout":
            case "pointerover":
            case "pointerup":
              oe = Yg;
              break;
            case "toggle":
            case "beforetoggle":
              oe = rS;
          }
          var Ie = (t & 4) !== 0, Et = !Ie && (e === "scroll" || e === "scrollend"), K = Ie ? te !== null ? te + "Capture" : null : te;
          Ie = [];
          for (var Y = $, W; Y !== null; ) {
            var fe = Y;
            if (W = fe.stateNode, fe = fe.tag, fe !== 5 && fe !== 26 && fe !== 27 || W === null || K === null || (fe = ha(Y, K), fe != null && Ie.push(
              Qa(Y, fe, W)
            )), Et) break;
            Y = Y.return;
          }
          0 < Ie.length && (te = new oe(
            te,
            Ne,
            null,
            l,
            ce
          ), de.push({ event: te, listeners: Ie }));
        }
      }
      if ((t & 7) === 0) {
        e: {
          if (te = e === "mouseover" || e === "pointerover", oe = e === "mouseout" || e === "pointerout", te && l !== Au && (Ne = l.relatedTarget || l.fromElement) && (yr(Ne) || Ne[il]))
            break e;
          if ((oe || te) && (te = ce.window === ce ? ce : (te = ce.ownerDocument) ? te.defaultView || te.parentWindow : window, oe ? (Ne = l.relatedTarget || l.toElement, oe = $, Ne = Ne ? yr(Ne) : null, Ne !== null && (Et = f(Ne), Ie = Ne.tag, Ne !== Et || Ie !== 5 && Ie !== 27 && Ie !== 6) && (Ne = null)) : (oe = null, Ne = $), oe !== Ne)) {
            if (Ie = Vg, fe = "onMouseLeave", K = "onMouseEnter", Y = "mouse", (e === "pointerout" || e === "pointerover") && (Ie = Yg, fe = "onPointerLeave", K = "onPointerEnter", Y = "pointer"), Et = oe == null ? te : ma(oe), W = Ne == null ? te : ma(Ne), te = new Ie(
              fe,
              Y + "leave",
              oe,
              l,
              ce
            ), te.target = Et, te.relatedTarget = W, fe = null, yr(ce) === $ && (Ie = new Ie(
              K,
              Y + "enter",
              Ne,
              l,
              ce
            ), Ie.target = W, Ie.relatedTarget = Et, fe = Ie), Et = fe, oe && Ne)
              t: {
                for (Ie = o1, K = oe, Y = Ne, W = 0, fe = K; fe; fe = Ie(fe))
                  W++;
                fe = 0;
                for (var Be = Y; Be; Be = Ie(Be))
                  fe++;
                for (; 0 < W - fe; )
                  K = Ie(K), W--;
                for (; 0 < fe - W; )
                  Y = Ie(Y), fe--;
                for (; W--; ) {
                  if (K === Y || Y !== null && K === Y.alternate) {
                    Ie = K;
                    break t;
                  }
                  K = Ie(K), Y = Ie(Y);
                }
                Ie = null;
              }
            else Ie = null;
            oe !== null && ky(
              de,
              te,
              oe,
              Ie,
              !1
            ), Ne !== null && Et !== null && ky(
              de,
              Et,
              Ne,
              Ie,
              !0
            );
          }
        }
        e: {
          if (te = $ ? ma($) : window, oe = te.nodeName && te.nodeName.toLowerCase(), oe === "select" || oe === "input" && te.type === "file")
            var ct = Jg;
          else if (Qg(te))
            if (Wg)
              ct = mS;
            else {
              ct = pS;
              var _e = dS;
            }
          else
            oe = te.nodeName, !oe || oe.toLowerCase() !== "input" || te.type !== "checkbox" && te.type !== "radio" ? $ && Mu($.elementType) && (ct = Jg) : ct = gS;
          if (ct && (ct = ct(e, $))) {
            Zg(
              de,
              ct,
              l,
              ce
            );
            break e;
          }
          _e && _e(e, te, $), e === "focusout" && $ && te.type === "number" && $.memoizedProps.value != null && Ou(te, "number", te.value);
        }
        switch (_e = $ ? ma($) : window, e) {
          case "focusin":
            (Qg(_e) || _e.contentEditable === "true") && (Cr = _e, Pu = $, Ta = null);
            break;
          case "focusout":
            Ta = Pu = Cr = null;
            break;
          case "mousedown":
            Yu = !0;
            break;
          case "contextmenu":
          case "mouseup":
          case "dragend":
            Yu = !1, am(de, l, ce);
            break;
          case "selectionchange":
            if (yS) break;
          case "keydown":
          case "keyup":
            am(de, l, ce);
        }
        var Ke;
        if (Uu)
          e: {
            switch (e) {
              case "compositionstart":
                var it = "onCompositionStart";
                break e;
              case "compositionend":
                it = "onCompositionEnd";
                break e;
              case "compositionupdate":
                it = "onCompositionUpdate";
                break e;
            }
            it = void 0;
          }
        else
          Rr ? Fg(e, l) && (it = "onCompositionEnd") : e === "keydown" && l.keyCode === 229 && (it = "onCompositionStart");
        it && (Gg && l.locale !== "ko" && (Rr || it !== "onCompositionStart" ? it === "onCompositionEnd" && Rr && (Ke = Bg()) : (lo = ce, Du = "value" in lo ? lo.value : lo.textContent, Rr = !0)), _e = js($, it), 0 < _e.length && (it = new Pg(
          it,
          e,
          null,
          l,
          ce
        ), de.push({ event: it, listeners: _e }), Ke ? it.data = Ke : (Ke = Kg(l), Ke !== null && (it.data = Ke)))), (Ke = iS ? sS(e, l) : cS(e, l)) && (it = js($, "onBeforeInput"), 0 < it.length && (_e = new Pg(
          "onBeforeInput",
          "beforeinput",
          null,
          l,
          ce
        ), de.push({
          event: _e,
          listeners: it
        }), _e.data = Ke)), e1(
          de,
          e,
          $,
          l,
          ce
        );
      }
      jy(de, t);
    });
  }
  function Qa(e, t, l) {
    return {
      instance: e,
      listener: t,
      currentTarget: l
    };
  }
  function js(e, t) {
    for (var l = t + "Capture", r = []; e !== null; ) {
      var s = e, c = s.stateNode;
      if (s = s.tag, s !== 5 && s !== 26 && s !== 27 || c === null || (s = ha(e, l), s != null && r.unshift(
        Qa(e, s, c)
      ), s = ha(e, t), s != null && r.push(
        Qa(e, s, c)
      )), e.tag === 3) return r;
      e = e.return;
    }
    return [];
  }
  function o1(e) {
    if (e === null) return null;
    do
      e = e.return;
    while (e && e.tag !== 5 && e.tag !== 27);
    return e || null;
  }
  function ky(e, t, l, r, s) {
    for (var c = t._reactName, y = []; l !== null && l !== r; ) {
      var R = l, U = R.alternate, $ = R.stateNode;
      if (R = R.tag, U !== null && U === r) break;
      R !== 5 && R !== 26 && R !== 27 || $ === null || (U = $, s ? ($ = ha(l, c), $ != null && y.unshift(
        Qa(l, $, U)
      )) : s || ($ = ha(l, c), $ != null && y.push(
        Qa(l, $, U)
      ))), l = l.return;
    }
    y.length !== 0 && e.push({ event: t, listeners: y });
  }
  var r1 = /\r\n?/g, a1 = /\u0000|\uFFFD/g;
  function _y(e) {
    return (typeof e == "string" ? e : "" + e).replace(r1, `
`).replace(a1, "");
  }
  function Hy(e, t) {
    return t = _y(t), _y(e) === t;
  }
  function St(e, t, l, r, s, c) {
    switch (l) {
      case "children":
        typeof r == "string" ? t === "body" || t === "textarea" && r === "" || Sr(e, r) : (typeof r == "number" || typeof r == "bigint") && t !== "body" && Sr(e, "" + r);
        break;
      case "className":
        Hi(e, "class", r);
        break;
      case "tabIndex":
        Hi(e, "tabindex", r);
        break;
      case "dir":
      case "role":
      case "viewBox":
      case "width":
      case "height":
        Hi(e, l, r);
        break;
      case "style":
        Hg(e, r, c);
        break;
      case "data":
        if (t !== "object") {
          Hi(e, "data", r);
          break;
        }
      case "src":
      case "href":
        if (r === "" && (t !== "a" || l !== "href")) {
          e.removeAttribute(l);
          break;
        }
        if (r == null || typeof r == "function" || typeof r == "symbol" || typeof r == "boolean") {
          e.removeAttribute(l);
          break;
        }
        r = Ui("" + r), e.setAttribute(l, r);
        break;
      case "action":
      case "formAction":
        if (typeof r == "function") {
          e.setAttribute(
            l,
            "javascript:throw new Error('A React form was unexpectedly submitted. If you called form.submit() manually, consider using form.requestSubmit() instead. If you\\'re trying to use event.stopPropagation() in a submit event handler, consider also calling event.preventDefault().')"
          );
          break;
        } else
          typeof c == "function" && (l === "formAction" ? (t !== "input" && St(e, t, "name", s.name, s, null), St(
            e,
            t,
            "formEncType",
            s.formEncType,
            s,
            null
          ), St(
            e,
            t,
            "formMethod",
            s.formMethod,
            s,
            null
          ), St(
            e,
            t,
            "formTarget",
            s.formTarget,
            s,
            null
          )) : (St(e, t, "encType", s.encType, s, null), St(e, t, "method", s.method, s, null), St(e, t, "target", s.target, s, null)));
        if (r == null || typeof r == "symbol" || typeof r == "boolean") {
          e.removeAttribute(l);
          break;
        }
        r = Ui("" + r), e.setAttribute(l, r);
        break;
      case "onClick":
        r != null && (e.onclick = wl);
        break;
      case "onScroll":
        r != null && ot("scroll", e);
        break;
      case "onScrollEnd":
        r != null && ot("scrollend", e);
        break;
      case "dangerouslySetInnerHTML":
        if (r != null) {
          if (typeof r != "object" || !("__html" in r))
            throw Error(i(61));
          if (l = r.__html, l != null) {
            if (s.children != null) throw Error(i(60));
            e.innerHTML = l;
          }
        }
        break;
      case "multiple":
        e.multiple = r && typeof r != "function" && typeof r != "symbol";
        break;
      case "muted":
        e.muted = r && typeof r != "function" && typeof r != "symbol";
        break;
      case "suppressContentEditableWarning":
      case "suppressHydrationWarning":
      case "defaultValue":
      case "defaultChecked":
      case "innerHTML":
      case "ref":
        break;
      case "autoFocus":
        break;
      case "xlinkHref":
        if (r == null || typeof r == "function" || typeof r == "boolean" || typeof r == "symbol") {
          e.removeAttribute("xlink:href");
          break;
        }
        l = Ui("" + r), e.setAttributeNS(
          "http://www.w3.org/1999/xlink",
          "xlink:href",
          l
        );
        break;
      case "contentEditable":
      case "spellCheck":
      case "draggable":
      case "value":
      case "autoReverse":
      case "externalResourcesRequired":
      case "focusable":
      case "preserveAlpha":
        r != null && typeof r != "function" && typeof r != "symbol" ? e.setAttribute(l, "" + r) : e.removeAttribute(l);
        break;
      case "inert":
      case "allowFullScreen":
      case "async":
      case "autoPlay":
      case "controls":
      case "default":
      case "defer":
      case "disabled":
      case "disablePictureInPicture":
      case "disableRemotePlayback":
      case "formNoValidate":
      case "hidden":
      case "loop":
      case "noModule":
      case "noValidate":
      case "open":
      case "playsInline":
      case "readOnly":
      case "required":
      case "reversed":
      case "scoped":
      case "seamless":
      case "itemScope":
        r && typeof r != "function" && typeof r != "symbol" ? e.setAttribute(l, "") : e.removeAttribute(l);
        break;
      case "capture":
      case "download":
        r === !0 ? e.setAttribute(l, "") : r !== !1 && r != null && typeof r != "function" && typeof r != "symbol" ? e.setAttribute(l, r) : e.removeAttribute(l);
        break;
      case "cols":
      case "rows":
      case "size":
      case "span":
        r != null && typeof r != "function" && typeof r != "symbol" && !isNaN(r) && 1 <= r ? e.setAttribute(l, r) : e.removeAttribute(l);
        break;
      case "rowSpan":
      case "start":
        r == null || typeof r == "function" || typeof r == "symbol" || isNaN(r) ? e.removeAttribute(l) : e.setAttribute(l, r);
        break;
      case "popover":
        ot("beforetoggle", e), ot("toggle", e), _i(e, "popover", r);
        break;
      case "xlinkActuate":
        xl(
          e,
          "http://www.w3.org/1999/xlink",
          "xlink:actuate",
          r
        );
        break;
      case "xlinkArcrole":
        xl(
          e,
          "http://www.w3.org/1999/xlink",
          "xlink:arcrole",
          r
        );
        break;
      case "xlinkRole":
        xl(
          e,
          "http://www.w3.org/1999/xlink",
          "xlink:role",
          r
        );
        break;
      case "xlinkShow":
        xl(
          e,
          "http://www.w3.org/1999/xlink",
          "xlink:show",
          r
        );
        break;
      case "xlinkTitle":
        xl(
          e,
          "http://www.w3.org/1999/xlink",
          "xlink:title",
          r
        );
        break;
      case "xlinkType":
        xl(
          e,
          "http://www.w3.org/1999/xlink",
          "xlink:type",
          r
        );
        break;
      case "xmlBase":
        xl(
          e,
          "http://www.w3.org/XML/1998/namespace",
          "xml:base",
          r
        );
        break;
      case "xmlLang":
        xl(
          e,
          "http://www.w3.org/XML/1998/namespace",
          "xml:lang",
          r
        );
        break;
      case "xmlSpace":
        xl(
          e,
          "http://www.w3.org/XML/1998/namespace",
          "xml:space",
          r
        );
        break;
      case "is":
        _i(e, "is", r);
        break;
      case "innerText":
      case "textContent":
        break;
      default:
        (!(2 < l.length) || l[0] !== "o" && l[0] !== "O" || l[1] !== "n" && l[1] !== "N") && (l = kw.get(l) || l, _i(e, l, r));
    }
  }
  function md(e, t, l, r, s, c) {
    switch (l) {
      case "style":
        Hg(e, r, c);
        break;
      case "dangerouslySetInnerHTML":
        if (r != null) {
          if (typeof r != "object" || !("__html" in r))
            throw Error(i(61));
          if (l = r.__html, l != null) {
            if (s.children != null) throw Error(i(60));
            e.innerHTML = l;
          }
        }
        break;
      case "children":
        typeof r == "string" ? Sr(e, r) : (typeof r == "number" || typeof r == "bigint") && Sr(e, "" + r);
        break;
      case "onScroll":
        r != null && ot("scroll", e);
        break;
      case "onScrollEnd":
        r != null && ot("scrollend", e);
        break;
      case "onClick":
        r != null && (e.onclick = wl);
        break;
      case "suppressContentEditableWarning":
      case "suppressHydrationWarning":
      case "innerHTML":
      case "ref":
        break;
      case "innerText":
      case "textContent":
        break;
      default:
        if (!Og.hasOwnProperty(l))
          e: {
            if (l[0] === "o" && l[1] === "n" && (s = l.endsWith("Capture"), t = l.slice(2, s ? l.length - 7 : void 0), c = e[cn] || null, c = c != null ? c[l] : null, typeof c == "function" && e.removeEventListener(t, c, s), typeof r == "function")) {
              typeof c != "function" && c !== null && (l in e ? e[l] = null : e.hasAttribute(l) && e.removeAttribute(l)), e.addEventListener(t, r, s);
              break e;
            }
            l in e ? e[l] = r : r === !0 ? e.setAttribute(l, "") : _i(e, l, r);
          }
    }
  }
  function pn(e, t, l) {
    switch (t) {
      case "div":
      case "span":
      case "svg":
      case "path":
      case "a":
      case "g":
      case "p":
      case "li":
        break;
      case "img":
        ot("error", e), ot("load", e);
        var r = !1, s = !1, c;
        for (c in l)
          if (l.hasOwnProperty(c)) {
            var y = l[c];
            if (y != null)
              switch (c) {
                case "src":
                  r = !0;
                  break;
                case "srcSet":
                  s = !0;
                  break;
                case "children":
                case "dangerouslySetInnerHTML":
                  throw Error(i(137, t));
                default:
                  St(e, t, c, y, l, null);
              }
          }
        s && St(e, t, "srcSet", l.srcSet, l, null), r && St(e, t, "src", l.src, l, null);
        return;
      case "input":
        ot("invalid", e);
        var R = c = y = s = null, U = null, $ = null;
        for (r in l)
          if (l.hasOwnProperty(r)) {
            var ce = l[r];
            if (ce != null)
              switch (r) {
                case "name":
                  s = ce;
                  break;
                case "type":
                  y = ce;
                  break;
                case "checked":
                  U = ce;
                  break;
                case "defaultChecked":
                  $ = ce;
                  break;
                case "value":
                  c = ce;
                  break;
                case "defaultValue":
                  R = ce;
                  break;
                case "children":
                case "dangerouslySetInnerHTML":
                  if (ce != null)
                    throw Error(i(137, t));
                  break;
                default:
                  St(e, t, r, ce, l, null);
              }
          }
        jg(
          e,
          c,
          R,
          U,
          $,
          y,
          s,
          !1
        );
        return;
      case "select":
        ot("invalid", e), r = y = c = null;
        for (s in l)
          if (l.hasOwnProperty(s) && (R = l[s], R != null))
            switch (s) {
              case "value":
                c = R;
                break;
              case "defaultValue":
                y = R;
                break;
              case "multiple":
                r = R;
              default:
                St(e, t, s, R, l, null);
            }
        t = c, l = y, e.multiple = !!r, t != null ? wr(e, !!r, t, !1) : l != null && wr(e, !!r, l, !0);
        return;
      case "textarea":
        ot("invalid", e), c = s = r = null;
        for (y in l)
          if (l.hasOwnProperty(y) && (R = l[y], R != null))
            switch (y) {
              case "value":
                r = R;
                break;
              case "defaultValue":
                s = R;
                break;
              case "children":
                c = R;
                break;
              case "dangerouslySetInnerHTML":
                if (R != null) throw Error(i(91));
                break;
              default:
                St(e, t, y, R, l, null);
            }
        kg(e, r, s, c);
        return;
      case "option":
        for (U in l)
          l.hasOwnProperty(U) && (r = l[U], r != null) && (U === "selected" ? e.selected = r && typeof r != "function" && typeof r != "symbol" : St(e, t, U, r, l, null));
        return;
      case "dialog":
        ot("beforetoggle", e), ot("toggle", e), ot("cancel", e), ot("close", e);
        break;
      case "iframe":
      case "object":
        ot("load", e);
        break;
      case "video":
      case "audio":
        for (r = 0; r < Ka.length; r++)
          ot(Ka[r], e);
        break;
      case "image":
        ot("error", e), ot("load", e);
        break;
      case "details":
        ot("toggle", e);
        break;
      case "embed":
      case "source":
      case "link":
        ot("error", e), ot("load", e);
      case "area":
      case "base":
      case "br":
      case "col":
      case "hr":
      case "keygen":
      case "meta":
      case "param":
      case "track":
      case "wbr":
      case "menuitem":
        for ($ in l)
          if (l.hasOwnProperty($) && (r = l[$], r != null))
            switch ($) {
              case "children":
              case "dangerouslySetInnerHTML":
                throw Error(i(137, t));
              default:
                St(e, t, $, r, l, null);
            }
        return;
      default:
        if (Mu(t)) {
          for (ce in l)
            l.hasOwnProperty(ce) && (r = l[ce], r !== void 0 && md(
              e,
              t,
              ce,
              r,
              l,
              void 0
            ));
          return;
        }
    }
    for (R in l)
      l.hasOwnProperty(R) && (r = l[R], r != null && St(e, t, R, r, l, null));
  }
  function i1(e, t, l, r) {
    switch (t) {
      case "div":
      case "span":
      case "svg":
      case "path":
      case "a":
      case "g":
      case "p":
      case "li":
        break;
      case "input":
        var s = null, c = null, y = null, R = null, U = null, $ = null, ce = null;
        for (oe in l) {
          var de = l[oe];
          if (l.hasOwnProperty(oe) && de != null)
            switch (oe) {
              case "checked":
                break;
              case "value":
                break;
              case "defaultValue":
                U = de;
              default:
                r.hasOwnProperty(oe) || St(e, t, oe, null, r, de);
            }
        }
        for (var te in r) {
          var oe = r[te];
          if (de = l[te], r.hasOwnProperty(te) && (oe != null || de != null))
            switch (te) {
              case "type":
                c = oe;
                break;
              case "name":
                s = oe;
                break;
              case "checked":
                $ = oe;
                break;
              case "defaultChecked":
                ce = oe;
                break;
              case "value":
                y = oe;
                break;
              case "defaultValue":
                R = oe;
                break;
              case "children":
              case "dangerouslySetInnerHTML":
                if (oe != null)
                  throw Error(i(137, t));
                break;
              default:
                oe !== de && St(
                  e,
                  t,
                  te,
                  oe,
                  r,
                  de
                );
            }
        }
        Cu(
          e,
          y,
          R,
          U,
          $,
          ce,
          c,
          s
        );
        return;
      case "select":
        oe = y = R = te = null;
        for (c in l)
          if (U = l[c], l.hasOwnProperty(c) && U != null)
            switch (c) {
              case "value":
                break;
              case "multiple":
                oe = U;
              default:
                r.hasOwnProperty(c) || St(
                  e,
                  t,
                  c,
                  null,
                  r,
                  U
                );
            }
        for (s in r)
          if (c = r[s], U = l[s], r.hasOwnProperty(s) && (c != null || U != null))
            switch (s) {
              case "value":
                te = c;
                break;
              case "defaultValue":
                R = c;
                break;
              case "multiple":
                y = c;
              default:
                c !== U && St(
                  e,
                  t,
                  s,
                  c,
                  r,
                  U
                );
            }
        t = R, l = y, r = oe, te != null ? wr(e, !!l, te, !1) : !!r != !!l && (t != null ? wr(e, !!l, t, !0) : wr(e, !!l, l ? [] : "", !1));
        return;
      case "textarea":
        oe = te = null;
        for (R in l)
          if (s = l[R], l.hasOwnProperty(R) && s != null && !r.hasOwnProperty(R))
            switch (R) {
              case "value":
                break;
              case "children":
                break;
              default:
                St(e, t, R, null, r, s);
            }
        for (y in r)
          if (s = r[y], c = l[y], r.hasOwnProperty(y) && (s != null || c != null))
            switch (y) {
              case "value":
                te = s;
                break;
              case "defaultValue":
                oe = s;
                break;
              case "children":
                break;
              case "dangerouslySetInnerHTML":
                if (s != null) throw Error(i(91));
                break;
              default:
                s !== c && St(e, t, y, s, r, c);
            }
        Dg(e, te, oe);
        return;
      case "option":
        for (var Ne in l)
          te = l[Ne], l.hasOwnProperty(Ne) && te != null && !r.hasOwnProperty(Ne) && (Ne === "selected" ? e.selected = !1 : St(
            e,
            t,
            Ne,
            null,
            r,
            te
          ));
        for (U in r)
          te = r[U], oe = l[U], r.hasOwnProperty(U) && te !== oe && (te != null || oe != null) && (U === "selected" ? e.selected = te && typeof te != "function" && typeof te != "symbol" : St(
            e,
            t,
            U,
            te,
            r,
            oe
          ));
        return;
      case "img":
      case "link":
      case "area":
      case "base":
      case "br":
      case "col":
      case "embed":
      case "hr":
      case "keygen":
      case "meta":
      case "param":
      case "source":
      case "track":
      case "wbr":
      case "menuitem":
        for (var Ie in l)
          te = l[Ie], l.hasOwnProperty(Ie) && te != null && !r.hasOwnProperty(Ie) && St(e, t, Ie, null, r, te);
        for ($ in r)
          if (te = r[$], oe = l[$], r.hasOwnProperty($) && te !== oe && (te != null || oe != null))
            switch ($) {
              case "children":
              case "dangerouslySetInnerHTML":
                if (te != null)
                  throw Error(i(137, t));
                break;
              default:
                St(
                  e,
                  t,
                  $,
                  te,
                  r,
                  oe
                );
            }
        return;
      default:
        if (Mu(t)) {
          for (var Et in l)
            te = l[Et], l.hasOwnProperty(Et) && te !== void 0 && !r.hasOwnProperty(Et) && md(
              e,
              t,
              Et,
              void 0,
              r,
              te
            );
          for (ce in r)
            te = r[ce], oe = l[ce], !r.hasOwnProperty(ce) || te === oe || te === void 0 && oe === void 0 || md(
              e,
              t,
              ce,
              te,
              r,
              oe
            );
          return;
        }
    }
    for (var K in l)
      te = l[K], l.hasOwnProperty(K) && te != null && !r.hasOwnProperty(K) && St(e, t, K, null, r, te);
    for (de in r)
      te = r[de], oe = l[de], !r.hasOwnProperty(de) || te === oe || te == null && oe == null || St(e, t, de, te, r, oe);
  }
  function Ly(e) {
    switch (e) {
      case "css":
      case "script":
      case "font":
      case "img":
      case "image":
      case "input":
      case "link":
        return !0;
      default:
        return !1;
    }
  }
  function s1() {
    if (typeof performance.getEntriesByType == "function") {
      for (var e = 0, t = 0, l = performance.getEntriesByType("resource"), r = 0; r < l.length; r++) {
        var s = l[r], c = s.transferSize, y = s.initiatorType, R = s.duration;
        if (c && R && Ly(y)) {
          for (y = 0, R = s.responseEnd, r += 1; r < l.length; r++) {
            var U = l[r], $ = U.startTime;
            if ($ > R) break;
            var ce = U.transferSize, de = U.initiatorType;
            ce && Ly(de) && (U = U.responseEnd, y += ce * (U < R ? 1 : (R - $) / (U - $)));
          }
          if (--r, t += 8 * (c + y) / (s.duration / 1e3), e++, 10 < e) break;
        }
      }
      if (0 < e) return t / e / 1e6;
    }
    return navigator.connection && (e = navigator.connection.downlink, typeof e == "number") ? e : 5;
  }
  var hd = null, yd = null;
  function Ds(e) {
    return e.nodeType === 9 ? e : e.ownerDocument;
  }
  function Uy(e) {
    switch (e) {
      case "http://www.w3.org/2000/svg":
        return 1;
      case "http://www.w3.org/1998/Math/MathML":
        return 2;
      default:
        return 0;
    }
  }
  function By(e, t) {
    if (e === 0)
      switch (t) {
        case "svg":
          return 1;
        case "math":
          return 2;
        default:
          return 0;
      }
    return e === 1 && t === "foreignObject" ? 0 : e;
  }
  function vd(e, t) {
    return e === "textarea" || e === "noscript" || typeof t.children == "string" || typeof t.children == "number" || typeof t.children == "bigint" || typeof t.dangerouslySetInnerHTML == "object" && t.dangerouslySetInnerHTML !== null && t.dangerouslySetInnerHTML.__html != null;
  }
  var bd = null;
  function c1() {
    var e = window.event;
    return e && e.type === "popstate" ? e === bd ? !1 : (bd = e, !0) : (bd = null, !1);
  }
  var Iy = typeof setTimeout == "function" ? setTimeout : void 0, u1 = typeof clearTimeout == "function" ? clearTimeout : void 0, Vy = typeof Promise == "function" ? Promise : void 0, f1 = typeof queueMicrotask == "function" ? queueMicrotask : typeof Vy < "u" ? function(e) {
    return Vy.resolve(null).then(e).catch(d1);
  } : Iy;
  function d1(e) {
    setTimeout(function() {
      throw e;
    });
  }
  function wo(e) {
    return e === "head";
  }
  function Py(e, t) {
    var l = t, r = 0;
    do {
      var s = l.nextSibling;
      if (e.removeChild(l), s && s.nodeType === 8)
        if (l = s.data, l === "/$" || l === "/&") {
          if (r === 0) {
            e.removeChild(s), $r(t);
            return;
          }
          r--;
        } else if (l === "$" || l === "$?" || l === "$~" || l === "$!" || l === "&")
          r++;
        else if (l === "html")
          Za(e.ownerDocument.documentElement);
        else if (l === "head") {
          l = e.ownerDocument.head, Za(l);
          for (var c = l.firstChild; c; ) {
            var y = c.nextSibling, R = c.nodeName;
            c[ga] || R === "SCRIPT" || R === "STYLE" || R === "LINK" && c.rel.toLowerCase() === "stylesheet" || l.removeChild(c), c = y;
          }
        } else
          l === "body" && Za(e.ownerDocument.body);
      l = s;
    } while (l);
    $r(t);
  }
  function Yy(e, t) {
    var l = e;
    e = 0;
    do {
      var r = l.nextSibling;
      if (l.nodeType === 1 ? t ? (l._stashedDisplay = l.style.display, l.style.display = "none") : (l.style.display = l._stashedDisplay || "", l.getAttribute("style") === "" && l.removeAttribute("style")) : l.nodeType === 3 && (t ? (l._stashedText = l.nodeValue, l.nodeValue = "") : l.nodeValue = l._stashedText || ""), r && r.nodeType === 8)
        if (l = r.data, l === "/$") {
          if (e === 0) break;
          e--;
        } else
          l !== "$" && l !== "$?" && l !== "$~" && l !== "$!" || e++;
      l = r;
    } while (l);
  }
  function xd(e) {
    var t = e.firstChild;
    for (t && t.nodeType === 10 && (t = t.nextSibling); t; ) {
      var l = t;
      switch (t = t.nextSibling, l.nodeName) {
        case "HTML":
        case "HEAD":
        case "BODY":
          xd(l), Tu(l);
          continue;
        case "SCRIPT":
        case "STYLE":
          continue;
        case "LINK":
          if (l.rel.toLowerCase() === "stylesheet") continue;
      }
      e.removeChild(l);
    }
  }
  function p1(e, t, l, r) {
    for (; e.nodeType === 1; ) {
      var s = l;
      if (e.nodeName.toLowerCase() !== t.toLowerCase()) {
        if (!r && (e.nodeName !== "INPUT" || e.type !== "hidden"))
          break;
      } else if (r) {
        if (!e[ga])
          switch (t) {
            case "meta":
              if (!e.hasAttribute("itemprop")) break;
              return e;
            case "link":
              if (c = e.getAttribute("rel"), c === "stylesheet" && e.hasAttribute("data-precedence"))
                break;
              if (c !== s.rel || e.getAttribute("href") !== (s.href == null || s.href === "" ? null : s.href) || e.getAttribute("crossorigin") !== (s.crossOrigin == null ? null : s.crossOrigin) || e.getAttribute("title") !== (s.title == null ? null : s.title))
                break;
              return e;
            case "style":
              if (e.hasAttribute("data-precedence")) break;
              return e;
            case "script":
              if (c = e.getAttribute("src"), (c !== (s.src == null ? null : s.src) || e.getAttribute("type") !== (s.type == null ? null : s.type) || e.getAttribute("crossorigin") !== (s.crossOrigin == null ? null : s.crossOrigin)) && c && e.hasAttribute("async") && !e.hasAttribute("itemprop"))
                break;
              return e;
            default:
              return e;
          }
      } else if (t === "input" && e.type === "hidden") {
        var c = s.name == null ? null : "" + s.name;
        if (s.type === "hidden" && e.getAttribute("name") === c)
          return e;
      } else return e;
      if (e = Wn(e.nextSibling), e === null) break;
    }
    return null;
  }
  function g1(e, t, l) {
    if (t === "") return null;
    for (; e.nodeType !== 3; )
      if ((e.nodeType !== 1 || e.nodeName !== "INPUT" || e.type !== "hidden") && !l || (e = Wn(e.nextSibling), e === null)) return null;
    return e;
  }
  function Gy(e, t) {
    for (; e.nodeType !== 8; )
      if ((e.nodeType !== 1 || e.nodeName !== "INPUT" || e.type !== "hidden") && !t || (e = Wn(e.nextSibling), e === null)) return null;
    return e;
  }
  function wd(e) {
    return e.data === "$?" || e.data === "$~";
  }
  function Sd(e) {
    return e.data === "$!" || e.data === "$?" && e.ownerDocument.readyState !== "loading";
  }
  function m1(e, t) {
    var l = e.ownerDocument;
    if (e.data === "$~") e._reactRetry = t;
    else if (e.data !== "$?" || l.readyState !== "loading")
      t();
    else {
      var r = function() {
        t(), l.removeEventListener("DOMContentLoaded", r);
      };
      l.addEventListener("DOMContentLoaded", r), e._reactRetry = r;
    }
  }
  function Wn(e) {
    for (; e != null; e = e.nextSibling) {
      var t = e.nodeType;
      if (t === 1 || t === 3) break;
      if (t === 8) {
        if (t = e.data, t === "$" || t === "$!" || t === "$?" || t === "$~" || t === "&" || t === "F!" || t === "F")
          break;
        if (t === "/$" || t === "/&") return null;
      }
    }
    return e;
  }
  var Ed = null;
  function qy(e) {
    e = e.nextSibling;
    for (var t = 0; e; ) {
      if (e.nodeType === 8) {
        var l = e.data;
        if (l === "/$" || l === "/&") {
          if (t === 0)
            return Wn(e.nextSibling);
          t--;
        } else
          l !== "$" && l !== "$!" && l !== "$?" && l !== "$~" && l !== "&" || t++;
      }
      e = e.nextSibling;
    }
    return null;
  }
  function Xy(e) {
    e = e.previousSibling;
    for (var t = 0; e; ) {
      if (e.nodeType === 8) {
        var l = e.data;
        if (l === "$" || l === "$!" || l === "$?" || l === "$~" || l === "&") {
          if (t === 0) return e;
          t--;
        } else l !== "/$" && l !== "/&" || t++;
      }
      e = e.previousSibling;
    }
    return null;
  }
  function Fy(e, t, l) {
    switch (t = Ds(l), e) {
      case "html":
        if (e = t.documentElement, !e) throw Error(i(452));
        return e;
      case "head":
        if (e = t.head, !e) throw Error(i(453));
        return e;
      case "body":
        if (e = t.body, !e) throw Error(i(454));
        return e;
      default:
        throw Error(i(451));
    }
  }
  function Za(e) {
    for (var t = e.attributes; t.length; )
      e.removeAttributeNode(t[0]);
    Tu(e);
  }
  var $n = /* @__PURE__ */ new Map(), Ky = /* @__PURE__ */ new Set();
  function ks(e) {
    return typeof e.getRootNode == "function" ? e.getRootNode() : e.nodeType === 9 ? e : e.ownerDocument;
  }
  var Ll = P.d;
  P.d = {
    f: h1,
    r: y1,
    D: v1,
    C: b1,
    L: x1,
    m: w1,
    X: E1,
    S: S1,
    M: T1
  };
  function h1() {
    var e = Ll.f(), t = Rs();
    return e || t;
  }
  function y1(e) {
    var t = vr(e);
    t !== null && t.tag === 5 && t.type === "form" ? fh(t) : Ll.r(e);
  }
  var Zr = typeof document > "u" ? null : document;
  function Qy(e, t, l) {
    var r = Zr;
    if (r && typeof t == "string" && t) {
      var s = qn(t);
      s = 'link[rel="' + e + '"][href="' + s + '"]', typeof l == "string" && (s += '[crossorigin="' + l + '"]'), Ky.has(s) || (Ky.add(s), e = { rel: e, crossOrigin: l, href: t }, r.querySelector(s) === null && (t = r.createElement("link"), pn(t, "link", e), on(t), r.head.appendChild(t)));
    }
  }
  function v1(e) {
    Ll.D(e), Qy("dns-prefetch", e, null);
  }
  function b1(e, t) {
    Ll.C(e, t), Qy("preconnect", e, t);
  }
  function x1(e, t, l) {
    Ll.L(e, t, l);
    var r = Zr;
    if (r && e && t) {
      var s = 'link[rel="preload"][as="' + qn(t) + '"]';
      t === "image" && l && l.imageSrcSet ? (s += '[imagesrcset="' + qn(
        l.imageSrcSet
      ) + '"]', typeof l.imageSizes == "string" && (s += '[imagesizes="' + qn(
        l.imageSizes
      ) + '"]')) : s += '[href="' + qn(e) + '"]';
      var c = s;
      switch (t) {
        case "style":
          c = Jr(e);
          break;
        case "script":
          c = Wr(e);
      }
      $n.has(c) || (e = x(
        {
          rel: "preload",
          href: t === "image" && l && l.imageSrcSet ? void 0 : e,
          as: t
        },
        l
      ), $n.set(c, e), r.querySelector(s) !== null || t === "style" && r.querySelector(Ja(c)) || t === "script" && r.querySelector(Wa(c)) || (t = r.createElement("link"), pn(t, "link", e), on(t), r.head.appendChild(t)));
    }
  }
  function w1(e, t) {
    Ll.m(e, t);
    var l = Zr;
    if (l && e) {
      var r = t && typeof t.as == "string" ? t.as : "script", s = 'link[rel="modulepreload"][as="' + qn(r) + '"][href="' + qn(e) + '"]', c = s;
      switch (r) {
        case "audioworklet":
        case "paintworklet":
        case "serviceworker":
        case "sharedworker":
        case "worker":
        case "script":
          c = Wr(e);
      }
      if (!$n.has(c) && (e = x({ rel: "modulepreload", href: e }, t), $n.set(c, e), l.querySelector(s) === null)) {
        switch (r) {
          case "audioworklet":
          case "paintworklet":
          case "serviceworker":
          case "sharedworker":
          case "worker":
          case "script":
            if (l.querySelector(Wa(c)))
              return;
        }
        r = l.createElement("link"), pn(r, "link", e), on(r), l.head.appendChild(r);
      }
    }
  }
  function S1(e, t, l) {
    Ll.S(e, t, l);
    var r = Zr;
    if (r && e) {
      var s = br(r).hoistableStyles, c = Jr(e);
      t = t || "default";
      var y = s.get(c);
      if (!y) {
        var R = { loading: 0, preload: null };
        if (y = r.querySelector(
          Ja(c)
        ))
          R.loading = 5;
        else {
          e = x(
            { rel: "stylesheet", href: e, "data-precedence": t },
            l
          ), (l = $n.get(c)) && Td(e, l);
          var U = y = r.createElement("link");
          on(U), pn(U, "link", e), U._p = new Promise(function($, ce) {
            U.onload = $, U.onerror = ce;
          }), U.addEventListener("load", function() {
            R.loading |= 1;
          }), U.addEventListener("error", function() {
            R.loading |= 2;
          }), R.loading |= 4, _s(y, t, r);
        }
        y = {
          type: "stylesheet",
          instance: y,
          count: 1,
          state: R
        }, s.set(c, y);
      }
    }
  }
  function E1(e, t) {
    Ll.X(e, t);
    var l = Zr;
    if (l && e) {
      var r = br(l).hoistableScripts, s = Wr(e), c = r.get(s);
      c || (c = l.querySelector(Wa(s)), c || (e = x({ src: e, async: !0 }, t), (t = $n.get(s)) && Rd(e, t), c = l.createElement("script"), on(c), pn(c, "link", e), l.head.appendChild(c)), c = {
        type: "script",
        instance: c,
        count: 1,
        state: null
      }, r.set(s, c));
    }
  }
  function T1(e, t) {
    Ll.M(e, t);
    var l = Zr;
    if (l && e) {
      var r = br(l).hoistableScripts, s = Wr(e), c = r.get(s);
      c || (c = l.querySelector(Wa(s)), c || (e = x({ src: e, async: !0, type: "module" }, t), (t = $n.get(s)) && Rd(e, t), c = l.createElement("script"), on(c), pn(c, "link", e), l.head.appendChild(c)), c = {
        type: "script",
        instance: c,
        count: 1,
        state: null
      }, r.set(s, c));
    }
  }
  function Zy(e, t, l, r) {
    var s = (s = ie.current) ? ks(s) : null;
    if (!s) throw Error(i(446));
    switch (e) {
      case "meta":
      case "title":
        return null;
      case "style":
        return typeof l.precedence == "string" && typeof l.href == "string" ? (t = Jr(l.href), l = br(
          s
        ).hoistableStyles, r = l.get(t), r || (r = {
          type: "style",
          instance: null,
          count: 0,
          state: null
        }, l.set(t, r)), r) : { type: "void", instance: null, count: 0, state: null };
      case "link":
        if (l.rel === "stylesheet" && typeof l.href == "string" && typeof l.precedence == "string") {
          e = Jr(l.href);
          var c = br(
            s
          ).hoistableStyles, y = c.get(e);
          if (y || (s = s.ownerDocument || s, y = {
            type: "stylesheet",
            instance: null,
            count: 0,
            state: { loading: 0, preload: null }
          }, c.set(e, y), (c = s.querySelector(
            Ja(e)
          )) && !c._p && (y.instance = c, y.state.loading = 5), $n.has(e) || (l = {
            rel: "preload",
            as: "style",
            href: l.href,
            crossOrigin: l.crossOrigin,
            integrity: l.integrity,
            media: l.media,
            hrefLang: l.hrefLang,
            referrerPolicy: l.referrerPolicy
          }, $n.set(e, l), c || R1(
            s,
            e,
            l,
            y.state
          ))), t && r === null)
            throw Error(i(528, ""));
          return y;
        }
        if (t && r !== null)
          throw Error(i(529, ""));
        return null;
      case "script":
        return t = l.async, l = l.src, typeof l == "string" && t && typeof t != "function" && typeof t != "symbol" ? (t = Wr(l), l = br(
          s
        ).hoistableScripts, r = l.get(t), r || (r = {
          type: "script",
          instance: null,
          count: 0,
          state: null
        }, l.set(t, r)), r) : { type: "void", instance: null, count: 0, state: null };
      default:
        throw Error(i(444, e));
    }
  }
  function Jr(e) {
    return 'href="' + qn(e) + '"';
  }
  function Ja(e) {
    return 'link[rel="stylesheet"][' + e + "]";
  }
  function Jy(e) {
    return x({}, e, {
      "data-precedence": e.precedence,
      precedence: null
    });
  }
  function R1(e, t, l, r) {
    e.querySelector('link[rel="preload"][as="style"][' + t + "]") ? r.loading = 1 : (t = e.createElement("link"), r.preload = t, t.addEventListener("load", function() {
      return r.loading |= 1;
    }), t.addEventListener("error", function() {
      return r.loading |= 2;
    }), pn(t, "link", l), on(t), e.head.appendChild(t));
  }
  function Wr(e) {
    return '[src="' + qn(e) + '"]';
  }
  function Wa(e) {
    return "script[async]" + e;
  }
  function Wy(e, t, l) {
    if (t.count++, t.instance === null)
      switch (t.type) {
        case "style":
          var r = e.querySelector(
            'style[data-href~="' + qn(l.href) + '"]'
          );
          if (r)
            return t.instance = r, on(r), r;
          var s = x({}, l, {
            "data-href": l.href,
            "data-precedence": l.precedence,
            href: null,
            precedence: null
          });
          return r = (e.ownerDocument || e).createElement(
            "style"
          ), on(r), pn(r, "style", s), _s(r, l.precedence, e), t.instance = r;
        case "stylesheet":
          s = Jr(l.href);
          var c = e.querySelector(
            Ja(s)
          );
          if (c)
            return t.state.loading |= 4, t.instance = c, on(c), c;
          r = Jy(l), (s = $n.get(s)) && Td(r, s), c = (e.ownerDocument || e).createElement("link"), on(c);
          var y = c;
          return y._p = new Promise(function(R, U) {
            y.onload = R, y.onerror = U;
          }), pn(c, "link", r), t.state.loading |= 4, _s(c, l.precedence, e), t.instance = c;
        case "script":
          return c = Wr(l.src), (s = e.querySelector(
            Wa(c)
          )) ? (t.instance = s, on(s), s) : (r = l, (s = $n.get(c)) && (r = x({}, l), Rd(r, s)), e = e.ownerDocument || e, s = e.createElement("script"), on(s), pn(s, "link", r), e.head.appendChild(s), t.instance = s);
        case "void":
          return null;
        default:
          throw Error(i(443, t.type));
      }
    else
      t.type === "stylesheet" && (t.state.loading & 4) === 0 && (r = t.instance, t.state.loading |= 4, _s(r, l.precedence, e));
    return t.instance;
  }
  function _s(e, t, l) {
    for (var r = l.querySelectorAll(
      'link[rel="stylesheet"][data-precedence],style[data-precedence]'
    ), s = r.length ? r[r.length - 1] : null, c = s, y = 0; y < r.length; y++) {
      var R = r[y];
      if (R.dataset.precedence === t) c = R;
      else if (c !== s) break;
    }
    c ? c.parentNode.insertBefore(e, c.nextSibling) : (t = l.nodeType === 9 ? l.head : l, t.insertBefore(e, t.firstChild));
  }
  function Td(e, t) {
    e.crossOrigin == null && (e.crossOrigin = t.crossOrigin), e.referrerPolicy == null && (e.referrerPolicy = t.referrerPolicy), e.title == null && (e.title = t.title);
  }
  function Rd(e, t) {
    e.crossOrigin == null && (e.crossOrigin = t.crossOrigin), e.referrerPolicy == null && (e.referrerPolicy = t.referrerPolicy), e.integrity == null && (e.integrity = t.integrity);
  }
  var Hs = null;
  function $y(e, t, l) {
    if (Hs === null) {
      var r = /* @__PURE__ */ new Map(), s = Hs = /* @__PURE__ */ new Map();
      s.set(l, r);
    } else
      s = Hs, r = s.get(l), r || (r = /* @__PURE__ */ new Map(), s.set(l, r));
    if (r.has(e)) return r;
    for (r.set(e, null), l = l.getElementsByTagName(e), s = 0; s < l.length; s++) {
      var c = l[s];
      if (!(c[ga] || c[Ot] || e === "link" && c.getAttribute("rel") === "stylesheet") && c.namespaceURI !== "http://www.w3.org/2000/svg") {
        var y = c.getAttribute(t) || "";
        y = e + y;
        var R = r.get(y);
        R ? R.push(c) : r.set(y, [c]);
      }
    }
    return r;
  }
  function ev(e, t, l) {
    e = e.ownerDocument || e, e.head.insertBefore(
      l,
      t === "title" ? e.querySelector("head > title") : null
    );
  }
  function C1(e, t, l) {
    if (l === 1 || t.itemProp != null) return !1;
    switch (e) {
      case "meta":
      case "title":
        return !0;
      case "style":
        if (typeof t.precedence != "string" || typeof t.href != "string" || t.href === "")
          break;
        return !0;
      case "link":
        if (typeof t.rel != "string" || typeof t.href != "string" || t.href === "" || t.onLoad || t.onError)
          break;
        return t.rel === "stylesheet" ? (e = t.disabled, typeof t.precedence == "string" && e == null) : !0;
      case "script":
        if (t.async && typeof t.async != "function" && typeof t.async != "symbol" && !t.onLoad && !t.onError && t.src && typeof t.src == "string")
          return !0;
    }
    return !1;
  }
  function tv(e) {
    return !(e.type === "stylesheet" && (e.state.loading & 3) === 0);
  }
  function O1(e, t, l, r) {
    if (l.type === "stylesheet" && (typeof r.media != "string" || matchMedia(r.media).matches !== !1) && (l.state.loading & 4) === 0) {
      if (l.instance === null) {
        var s = Jr(r.href), c = t.querySelector(
          Ja(s)
        );
        if (c) {
          t = c._p, t !== null && typeof t == "object" && typeof t.then == "function" && (e.count++, e = Ls.bind(e), t.then(e, e)), l.state.loading |= 4, l.instance = c, on(c);
          return;
        }
        c = t.ownerDocument || t, r = Jy(r), (s = $n.get(s)) && Td(r, s), c = c.createElement("link"), on(c);
        var y = c;
        y._p = new Promise(function(R, U) {
          y.onload = R, y.onerror = U;
        }), pn(c, "link", r), l.instance = c;
      }
      e.stylesheets === null && (e.stylesheets = /* @__PURE__ */ new Map()), e.stylesheets.set(l, t), (t = l.state.preload) && (l.state.loading & 3) === 0 && (e.count++, l = Ls.bind(e), t.addEventListener("load", l), t.addEventListener("error", l));
    }
  }
  var Cd = 0;
  function M1(e, t) {
    return e.stylesheets && e.count === 0 && Bs(e, e.stylesheets), 0 < e.count || 0 < e.imgCount ? function(l) {
      var r = setTimeout(function() {
        if (e.stylesheets && Bs(e, e.stylesheets), e.unsuspend) {
          var c = e.unsuspend;
          e.unsuspend = null, c();
        }
      }, 6e4 + t);
      0 < e.imgBytes && Cd === 0 && (Cd = 62500 * s1());
      var s = setTimeout(
        function() {
          if (e.waitingForImages = !1, e.count === 0 && (e.stylesheets && Bs(e, e.stylesheets), e.unsuspend)) {
            var c = e.unsuspend;
            e.unsuspend = null, c();
          }
        },
        (e.imgBytes > Cd ? 50 : 800) + t
      );
      return e.unsuspend = l, function() {
        e.unsuspend = null, clearTimeout(r), clearTimeout(s);
      };
    } : null;
  }
  function Ls() {
    if (this.count--, this.count === 0 && (this.imgCount === 0 || !this.waitingForImages)) {
      if (this.stylesheets) Bs(this, this.stylesheets);
      else if (this.unsuspend) {
        var e = this.unsuspend;
        this.unsuspend = null, e();
      }
    }
  }
  var Us = null;
  function Bs(e, t) {
    e.stylesheets = null, e.unsuspend !== null && (e.count++, Us = /* @__PURE__ */ new Map(), t.forEach(A1, e), Us = null, Ls.call(e));
  }
  function A1(e, t) {
    if (!(t.state.loading & 4)) {
      var l = Us.get(e);
      if (l) var r = l.get(null);
      else {
        l = /* @__PURE__ */ new Map(), Us.set(e, l);
        for (var s = e.querySelectorAll(
          "link[data-precedence],style[data-precedence]"
        ), c = 0; c < s.length; c++) {
          var y = s[c];
          (y.nodeName === "LINK" || y.getAttribute("media") !== "not all") && (l.set(y.dataset.precedence, y), r = y);
        }
        r && l.set(null, r);
      }
      s = t.instance, y = s.getAttribute("data-precedence"), c = l.get(y) || r, c === r && l.set(null, s), l.set(y, s), this.count++, r = Ls.bind(this), s.addEventListener("load", r), s.addEventListener("error", r), c ? c.parentNode.insertBefore(s, c.nextSibling) : (e = e.nodeType === 9 ? e.head : e, e.insertBefore(s, e.firstChild)), t.state.loading |= 4;
    }
  }
  var $a = {
    $$typeof: N,
    Provider: null,
    Consumer: null,
    _currentValue: I,
    _currentValue2: I,
    _threadCount: 0
  };
  function z1(e, t, l, r, s, c, y, R, U) {
    this.tag = 1, this.containerInfo = e, this.pingCache = this.current = this.pendingChildren = null, this.timeoutHandle = -1, this.callbackNode = this.next = this.pendingContext = this.context = this.cancelPendingCommit = null, this.callbackPriority = 0, this.expirationTimes = Pn(-1), this.entangledLanes = this.shellSuspendCounter = this.errorRecoveryDisabledLanes = this.expiredLanes = this.warmLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0, this.entanglements = Pn(0), this.hiddenUpdates = Pn(null), this.identifierPrefix = r, this.onUncaughtError = s, this.onCaughtError = c, this.onRecoverableError = y, this.pooledCache = null, this.pooledCacheLanes = 0, this.formState = U, this.incompleteTransitions = /* @__PURE__ */ new Map();
  }
  function nv(e, t, l, r, s, c, y, R, U, $, ce, de) {
    return e = new z1(
      e,
      t,
      l,
      y,
      U,
      $,
      ce,
      de,
      R
    ), t = 1, c === !0 && (t |= 24), c = Dn(3, null, null, t), e.current = c, c.stateNode = e, t = of(), t.refCount++, e.pooledCache = t, t.refCount++, c.memoizedState = {
      element: r,
      isDehydrated: l,
      cache: t
    }, cf(c), e;
  }
  function lv(e) {
    return e ? (e = Ar, e) : Ar;
  }
  function ov(e, t, l, r, s, c) {
    s = lv(s), r.context === null ? r.context = s : r.pendingContext = s, r = co(t), r.payload = { element: l }, c = c === void 0 ? null : c, c !== null && (r.callback = c), l = uo(e, r, t), l !== null && (Mn(l, e, t), Na(l, e, t));
  }
  function rv(e, t) {
    if (e = e.memoizedState, e !== null && e.dehydrated !== null) {
      var l = e.retryLane;
      e.retryLane = l !== 0 && l < t ? l : t;
    }
  }
  function Od(e, t) {
    rv(e, t), (e = e.alternate) && rv(e, t);
  }
  function av(e) {
    if (e.tag === 13 || e.tag === 31) {
      var t = Yo(e, 67108864);
      t !== null && Mn(t, e, 67108864), Od(e, 67108864);
    }
  }
  function iv(e) {
    if (e.tag === 13 || e.tag === 31) {
      var t = Un();
      t = qe(t);
      var l = Yo(e, t);
      l !== null && Mn(l, e, t), Od(e, t);
    }
  }
  var Is = !0;
  function N1(e, t, l, r) {
    var s = k.T;
    k.T = null;
    var c = P.p;
    try {
      P.p = 2, Md(e, t, l, r);
    } finally {
      P.p = c, k.T = s;
    }
  }
  function j1(e, t, l, r) {
    var s = k.T;
    k.T = null;
    var c = P.p;
    try {
      P.p = 8, Md(e, t, l, r);
    } finally {
      P.p = c, k.T = s;
    }
  }
  function Md(e, t, l, r) {
    if (Is) {
      var s = Ad(r);
      if (s === null)
        gd(
          e,
          t,
          r,
          Vs,
          l
        ), cv(e, r);
      else if (k1(
        s,
        e,
        t,
        l,
        r
      ))
        r.stopPropagation();
      else if (cv(e, r), t & 4 && -1 < D1.indexOf(e)) {
        for (; s !== null; ) {
          var c = vr(s);
          if (c !== null)
            switch (c.tag) {
              case 3:
                if (c = c.stateNode, c.current.memoizedState.isDehydrated) {
                  var y = Ht(c.pendingLanes);
                  if (y !== 0) {
                    var R = c;
                    for (R.pendingLanes |= 2, R.entangledLanes |= 2; y; ) {
                      var U = 1 << 31 - ht(y);
                      R.entanglements[1] |= U, y &= ~U;
                    }
                    fl(c), (dt & 6) === 0 && (Es = ae() + 500, Fa(0));
                  }
                }
                break;
              case 31:
              case 13:
                R = Yo(c, 2), R !== null && Mn(R, c, 2), Rs(), Od(c, 2);
            }
          if (c = Ad(r), c === null && gd(
            e,
            t,
            r,
            Vs,
            l
          ), c === s) break;
          s = c;
        }
        s !== null && r.stopPropagation();
      } else
        gd(
          e,
          t,
          r,
          null,
          l
        );
    }
  }
  function Ad(e) {
    return e = zu(e), zd(e);
  }
  var Vs = null;
  function zd(e) {
    if (Vs = null, e = yr(e), e !== null) {
      var t = f(e);
      if (t === null) e = null;
      else {
        var l = t.tag;
        if (l === 13) {
          if (e = p(t), e !== null) return e;
          e = null;
        } else if (l === 31) {
          if (e = g(t), e !== null) return e;
          e = null;
        } else if (l === 3) {
          if (t.stateNode.current.memoizedState.isDehydrated)
            return t.tag === 3 ? t.stateNode.containerInfo : null;
          e = null;
        } else t !== e && (e = null);
      }
    }
    return Vs = e, null;
  }
  function sv(e) {
    switch (e) {
      case "beforetoggle":
      case "cancel":
      case "click":
      case "close":
      case "contextmenu":
      case "copy":
      case "cut":
      case "auxclick":
      case "dblclick":
      case "dragend":
      case "dragstart":
      case "drop":
      case "focusin":
      case "focusout":
      case "input":
      case "invalid":
      case "keydown":
      case "keypress":
      case "keyup":
      case "mousedown":
      case "mouseup":
      case "paste":
      case "pause":
      case "play":
      case "pointercancel":
      case "pointerdown":
      case "pointerup":
      case "ratechange":
      case "reset":
      case "resize":
      case "seeked":
      case "submit":
      case "toggle":
      case "touchcancel":
      case "touchend":
      case "touchstart":
      case "volumechange":
      case "change":
      case "selectionchange":
      case "textInput":
      case "compositionstart":
      case "compositionend":
      case "compositionupdate":
      case "beforeblur":
      case "afterblur":
      case "beforeinput":
      case "blur":
      case "fullscreenchange":
      case "focus":
      case "hashchange":
      case "popstate":
      case "select":
      case "selectstart":
        return 2;
      case "drag":
      case "dragenter":
      case "dragexit":
      case "dragleave":
      case "dragover":
      case "mousemove":
      case "mouseout":
      case "mouseover":
      case "pointermove":
      case "pointerout":
      case "pointerover":
      case "scroll":
      case "touchmove":
      case "wheel":
      case "mouseenter":
      case "mouseleave":
      case "pointerenter":
      case "pointerleave":
        return 8;
      case "message":
        switch (pe()) {
          case Le:
            return 2;
          case be:
            return 8;
          case xe:
          case et:
            return 32;
          case rt:
            return 268435456;
          default:
            return 32;
        }
      default:
        return 32;
    }
  }
  var Nd = !1, So = null, Eo = null, To = null, ei = /* @__PURE__ */ new Map(), ti = /* @__PURE__ */ new Map(), Ro = [], D1 = "mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset".split(
    " "
  );
  function cv(e, t) {
    switch (e) {
      case "focusin":
      case "focusout":
        So = null;
        break;
      case "dragenter":
      case "dragleave":
        Eo = null;
        break;
      case "mouseover":
      case "mouseout":
        To = null;
        break;
      case "pointerover":
      case "pointerout":
        ei.delete(t.pointerId);
        break;
      case "gotpointercapture":
      case "lostpointercapture":
        ti.delete(t.pointerId);
    }
  }
  function ni(e, t, l, r, s, c) {
    return e === null || e.nativeEvent !== c ? (e = {
      blockedOn: t,
      domEventName: l,
      eventSystemFlags: r,
      nativeEvent: c,
      targetContainers: [s]
    }, t !== null && (t = vr(t), t !== null && av(t)), e) : (e.eventSystemFlags |= r, t = e.targetContainers, s !== null && t.indexOf(s) === -1 && t.push(s), e);
  }
  function k1(e, t, l, r, s) {
    switch (t) {
      case "focusin":
        return So = ni(
          So,
          e,
          t,
          l,
          r,
          s
        ), !0;
      case "dragenter":
        return Eo = ni(
          Eo,
          e,
          t,
          l,
          r,
          s
        ), !0;
      case "mouseover":
        return To = ni(
          To,
          e,
          t,
          l,
          r,
          s
        ), !0;
      case "pointerover":
        var c = s.pointerId;
        return ei.set(
          c,
          ni(
            ei.get(c) || null,
            e,
            t,
            l,
            r,
            s
          )
        ), !0;
      case "gotpointercapture":
        return c = s.pointerId, ti.set(
          c,
          ni(
            ti.get(c) || null,
            e,
            t,
            l,
            r,
            s
          )
        ), !0;
    }
    return !1;
  }
  function uv(e) {
    var t = yr(e.target);
    if (t !== null) {
      var l = f(t);
      if (l !== null) {
        if (t = l.tag, t === 13) {
          if (t = p(l), t !== null) {
            e.blockedOn = t, ln(e.priority, function() {
              iv(l);
            });
            return;
          }
        } else if (t === 31) {
          if (t = g(l), t !== null) {
            e.blockedOn = t, ln(e.priority, function() {
              iv(l);
            });
            return;
          }
        } else if (t === 3 && l.stateNode.current.memoizedState.isDehydrated) {
          e.blockedOn = l.tag === 3 ? l.stateNode.containerInfo : null;
          return;
        }
      }
    }
    e.blockedOn = null;
  }
  function Ps(e) {
    if (e.blockedOn !== null) return !1;
    for (var t = e.targetContainers; 0 < t.length; ) {
      var l = Ad(e.nativeEvent);
      if (l === null) {
        l = e.nativeEvent;
        var r = new l.constructor(
          l.type,
          l
        );
        Au = r, l.target.dispatchEvent(r), Au = null;
      } else
        return t = vr(l), t !== null && av(t), e.blockedOn = l, !1;
      t.shift();
    }
    return !0;
  }
  function fv(e, t, l) {
    Ps(e) && l.delete(t);
  }
  function _1() {
    Nd = !1, So !== null && Ps(So) && (So = null), Eo !== null && Ps(Eo) && (Eo = null), To !== null && Ps(To) && (To = null), ei.forEach(fv), ti.forEach(fv);
  }
  function Ys(e, t) {
    e.blockedOn === t && (e.blockedOn = null, Nd || (Nd = !0, n.unstable_scheduleCallback(
      n.unstable_NormalPriority,
      _1
    )));
  }
  var Gs = null;
  function dv(e) {
    Gs !== e && (Gs = e, n.unstable_scheduleCallback(
      n.unstable_NormalPriority,
      function() {
        Gs === e && (Gs = null);
        for (var t = 0; t < e.length; t += 3) {
          var l = e[t], r = e[t + 1], s = e[t + 2];
          if (typeof r != "function") {
            if (zd(r || l) === null)
              continue;
            break;
          }
          var c = vr(l);
          c !== null && (e.splice(t, 3), t -= 3, Af(
            c,
            {
              pending: !0,
              data: s,
              method: l.method,
              action: r
            },
            r,
            s
          ));
        }
      }
    ));
  }
  function $r(e) {
    function t(U) {
      return Ys(U, e);
    }
    So !== null && Ys(So, e), Eo !== null && Ys(Eo, e), To !== null && Ys(To, e), ei.forEach(t), ti.forEach(t);
    for (var l = 0; l < Ro.length; l++) {
      var r = Ro[l];
      r.blockedOn === e && (r.blockedOn = null);
    }
    for (; 0 < Ro.length && (l = Ro[0], l.blockedOn === null); )
      uv(l), l.blockedOn === null && Ro.shift();
    if (l = (e.ownerDocument || e).$$reactFormReplay, l != null)
      for (r = 0; r < l.length; r += 3) {
        var s = l[r], c = l[r + 1], y = s[cn] || null;
        if (typeof c == "function")
          y || dv(l);
        else if (y) {
          var R = null;
          if (c && c.hasAttribute("formAction")) {
            if (s = c, y = c[cn] || null)
              R = y.formAction;
            else if (zd(s) !== null) continue;
          } else R = y.action;
          typeof R == "function" ? l[r + 1] = R : (l.splice(r, 3), r -= 3), dv(l);
        }
      }
  }
  function pv() {
    function e(c) {
      c.canIntercept && c.info === "react-transition" && c.intercept({
        handler: function() {
          return new Promise(function(y) {
            return s = y;
          });
        },
        focusReset: "manual",
        scroll: "manual"
      });
    }
    function t() {
      s !== null && (s(), s = null), r || setTimeout(l, 20);
    }
    function l() {
      if (!r && !navigation.transition) {
        var c = navigation.currentEntry;
        c && c.url != null && navigation.navigate(c.url, {
          state: c.getState(),
          info: "react-transition",
          history: "replace"
        });
      }
    }
    if (typeof navigation == "object") {
      var r = !1, s = null;
      return navigation.addEventListener("navigate", e), navigation.addEventListener("navigatesuccess", t), navigation.addEventListener("navigateerror", t), setTimeout(l, 100), function() {
        r = !0, navigation.removeEventListener("navigate", e), navigation.removeEventListener("navigatesuccess", t), navigation.removeEventListener("navigateerror", t), s !== null && (s(), s = null);
      };
    }
  }
  function jd(e) {
    this._internalRoot = e;
  }
  qs.prototype.render = jd.prototype.render = function(e) {
    var t = this._internalRoot;
    if (t === null) throw Error(i(409));
    var l = t.current, r = Un();
    ov(l, r, e, t, null, null);
  }, qs.prototype.unmount = jd.prototype.unmount = function() {
    var e = this._internalRoot;
    if (e !== null) {
      this._internalRoot = null;
      var t = e.containerInfo;
      ov(e.current, 2, null, e, null, null), Rs(), t[il] = null;
    }
  };
  function qs(e) {
    this._internalRoot = e;
  }
  qs.prototype.unstable_scheduleHydration = function(e) {
    if (e) {
      var t = Xt();
      e = { blockedOn: null, target: e, priority: t };
      for (var l = 0; l < Ro.length && t !== 0 && t < Ro[l].priority; l++) ;
      Ro.splice(l, 0, e), l === 0 && uv(e);
    }
  };
  var gv = o.version;
  if (gv !== "19.2.7")
    throw Error(
      i(
        527,
        gv,
        "19.2.7"
      )
    );
  P.findDOMNode = function(e) {
    var t = e._reactInternals;
    if (t === void 0)
      throw typeof e.render == "function" ? Error(i(188)) : (e = Object.keys(e).join(","), Error(i(268, e)));
    return e = d(t), e = e !== null ? v(e) : null, e = e === null ? null : e.stateNode, e;
  };
  var H1 = {
    bundleType: 0,
    version: "19.2.7",
    rendererPackageName: "react-dom",
    currentDispatcherRef: k,
    reconcilerVersion: "19.2.7"
  };
  if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u") {
    var Xs = __REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!Xs.isDisabled && Xs.supportsFiber)
      try {
        tt = Xs.inject(
          H1
        ), gt = Xs;
      } catch {
      }
  }
  return ii.createRoot = function(e, t) {
    if (!u(e)) throw Error(i(299));
    var l = !1, r = "", s = wh, c = Sh, y = Eh;
    return t != null && (t.unstable_strictMode === !0 && (l = !0), t.identifierPrefix !== void 0 && (r = t.identifierPrefix), t.onUncaughtError !== void 0 && (s = t.onUncaughtError), t.onCaughtError !== void 0 && (c = t.onCaughtError), t.onRecoverableError !== void 0 && (y = t.onRecoverableError)), t = nv(
      e,
      1,
      !1,
      null,
      null,
      l,
      r,
      null,
      s,
      c,
      y,
      pv
    ), e[il] = t.current, pd(e), new jd(t);
  }, ii.hydrateRoot = function(e, t, l) {
    if (!u(e)) throw Error(i(299));
    var r = !1, s = "", c = wh, y = Sh, R = Eh, U = null;
    return l != null && (l.unstable_strictMode === !0 && (r = !0), l.identifierPrefix !== void 0 && (s = l.identifierPrefix), l.onUncaughtError !== void 0 && (c = l.onUncaughtError), l.onCaughtError !== void 0 && (y = l.onCaughtError), l.onRecoverableError !== void 0 && (R = l.onRecoverableError), l.formState !== void 0 && (U = l.formState)), t = nv(
      e,
      1,
      !0,
      t,
      l ?? null,
      r,
      s,
      U,
      c,
      y,
      R,
      pv
    ), t.context = lv(null), l = t.current, r = Un(), r = qe(r), s = co(r), s.callback = null, uo(l, s, r), l = r, t.current.lanes = l, qt(t, l), fl(t), e[il] = t.current, pd(e), new qs(t);
  }, ii.version = "19.2.7", ii;
}
var Ob;
function p2() {
  if (Ob) return $d.exports;
  Ob = 1;
  function n() {
    if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function"))
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(n);
      } catch (o) {
        console.error(o);
      }
  }
  return n(), $d.exports = d2(), $d.exports;
}
var g2 = p2();
function m2(n) {
  const {
    store: o,
    actionsRef: a
  } = n, i = o.useState("open");
  gx(o, i), su(o);
  const {
    forceUnmount: u
  } = cu(i, o), f = h.useCallback(() => {
    o.setOpen(!1, Pe(Gc));
  }, [o]);
  h.useImperativeHandle(a, () => ({
    unmount: u,
    close: f
  }), [u, f]);
}
function h2({
  store: n,
  parentContext: o,
  isDrawer: a
}) {
  const i = n.useState("open"), u = n.useState("disablePointerDismissal"), f = n.useState("modal"), p = n.useState("popupElement"), g = n.useState("floatingRootContext"), [m, d] = h.useState(0), [v, x] = h.useState(0), S = m === 0, C = Ai(g, {
    outsidePressEvent() {
      return n.context.internalBackdropRef.current || n.context.backdropRef.current ? "intentional" : {
        mouse: f === "trap-focus" ? "sloppy" : "intentional",
        touch: "sloppy"
      };
    },
    outsidePress(z) {
      if (!n.context.outsidePressEnabledRef.current || "button" in z && z.button !== 0 || "touches" in z && z.touches.length !== 1)
        return !1;
      const w = gn(z);
      return S && !u ? f && (n.context.internalBackdropRef.current || n.context.backdropRef.current) ? n.context.internalBackdropRef.current === w || n.context.backdropRef.current === w || Ue(w, p) && !w?.hasAttribute("data-base-ui-portal") : !0 : !1;
    },
    escapeKey: S
  });
  Mx(i && f === !0, p), n.useContextCallback("onNestedDialogOpen", (z, w) => {
    d(z), x(w);
  }), n.useContextCallback("onNestedDialogClose", () => {
    d(0), x(0);
  }), h.useEffect(() => (o?.onNestedDialogOpen && i && o.onNestedDialogOpen(m + 1, v + (a ? 1 : 0)), o?.onNestedDialogClose && !i && o.onNestedDialogClose(), () => {
    o?.onNestedDialogClose && i && o.onNestedDialogClose();
  }), [a, i, m, v, o]);
  const E = C.reference ?? mt, M = C.trigger ?? mt, T = C.floating ?? mt;
  return uu(n, {
    activeTriggerProps: E,
    inactiveTriggerProps: M,
    popupProps: T,
    nestedOpenDialogCount: m,
    nestedOpenDrawerCount: v
  }), null;
}
const lw = /* @__PURE__ */ h.createContext(!1), ow = /* @__PURE__ */ h.createContext(void 0);
function hr(n) {
  const o = h.useContext(ow);
  if (n === !1 && o === void 0)
    throw new Error(Ct(27));
  return o;
}
const y2 = {
  ...du,
  modal: me((n) => n.modal),
  nested: me((n) => n.nested),
  nestedOpenDialogCount: me((n) => n.nestedOpenDialogCount),
  nestedOpenDrawerCount: me((n) => n.nestedOpenDrawerCount),
  disablePointerDismissal: me((n) => n.disablePointerDismissal),
  openMethod: me((n) => n.openMethod),
  descriptionElementId: me((n) => n.descriptionElementId),
  titleElementId: me((n) => n.titleElementId),
  viewportElement: me((n) => n.viewportElement),
  role: me((n) => n.role)
};
class xg extends zi {
  constructor(o, a, i = !1) {
    const u = new da(), f = v2(o);
    f.floatingRootContext = ag(u, a, i), super(f, {
      popupRef: /* @__PURE__ */ h.createRef(),
      backdropRef: /* @__PURE__ */ h.createRef(),
      internalBackdropRef: /* @__PURE__ */ h.createRef(),
      outsidePressEnabledRef: {
        current: !0
      },
      triggerElements: u,
      onOpenChange: void 0,
      onOpenChangeComplete: void 0
    }, y2);
  }
  setOpen = (o, a) => {
    if (a.preventUnmountOnClose = () => {
      this.set("preventUnmountingOnClose", !0);
    }, !o && a.trigger == null && this.state.activeTriggerId != null && (a.trigger = this.state.activeTriggerElement ?? void 0), this.context.onOpenChange?.(o, a), a.isCanceled)
      return;
    this.state.floatingRootContext.dispatchOpenChange(o, a);
    const i = {
      open: o
    };
    iu(i, o, a.trigger), this.update(i);
  };
  static useStore(o, a) {
    return ng(o, (u, f) => new xg(a, u, f), !0).store;
  }
}
function v2(n = {}) {
  return {
    ...fu(),
    modal: !0,
    disablePointerDismissal: !1,
    popupElement: null,
    viewportElement: null,
    descriptionElementId: void 0,
    titleElementId: void 0,
    openMethod: null,
    nested: !1,
    nestedOpenDialogCount: 0,
    nestedOpenDrawerCount: 0,
    role: "dialog",
    ...n
  };
}
function rw(n, o = "dialog") {
  const {
    children: a,
    open: i,
    defaultOpen: u = !1,
    onOpenChange: f,
    onOpenChangeComplete: p,
    disablePointerDismissal: g = !1,
    modal: m = !0,
    actionsRef: d,
    handle: v,
    triggerId: x,
    defaultTriggerId: S = null
  } = n, C = o === "drawer", E = o === "alert-dialog", M = E ? !0 : m, T = E || g, z = E ? "alertdialog" : "dialog", w = hr(!0), A = {
    modal: M,
    disablePointerDismissal: T,
    nested: !!w,
    role: z
  }, L = xg.useStore(v?.store, {
    open: u,
    openProp: i,
    activeTriggerId: S,
    triggerIdProp: x,
    ...A
  });
  $p(() => {
    const ne = i === void 0 && L.state.open === !1 && u === !0 ? {
      open: !0,
      activeTriggerId: S
    } : null;
    E ? L.update(ne ? {
      ...A,
      ...ne
    } : A) : ne && L.update(ne);
  }), L.useControlledProp("openProp", i), L.useControlledProp("triggerIdProp", x), L.useSyncedValues(A), L.useContextCallback("onOpenChange", f), L.useContextCallback("onOpenChangeComplete", p);
  const D = L.useState("open"), _ = L.useState("mounted"), j = L.useState("payload");
  m2({
    store: L,
    actionsRef: d
  });
  const V = D || _, G = h.useMemo(() => ({
    store: L
  }), [L]);
  return /* @__PURE__ */ b.jsx(lw.Provider, {
    value: !1,
    children: /* @__PURE__ */ b.jsxs(ow.Provider, {
      value: G,
      children: [V && /* @__PURE__ */ b.jsx(h2, {
        store: L,
        parentContext: w?.store.context,
        isDrawer: C
      }), typeof a == "function" ? a({
        payload: j
      }) : a]
    })
  });
}
function b2(n) {
  return rw(n, "alert-dialog");
}
const x2 = {
  ...Lo,
  ...Ho
}, aw = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    forceRender: p = !1,
    ...g
  } = o, {
    store: m
  } = hr(), d = m.useState("open"), v = m.useState("nested"), x = m.useState("mounted"), S = m.useState("transitionStatus");
  return $e("div", o, {
    state: {
      open: d,
      transitionStatus: S
    },
    ref: [m.context.backdropRef, a],
    stateAttributesMapping: x2,
    props: [{
      role: "presentation",
      hidden: !x,
      style: {
        userSelect: "none",
        WebkitUserSelect: "none"
      }
    }, g],
    enabled: p || !v
  });
}), iw = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    disabled: p = !1,
    nativeButton: g = !0,
    ...m
  } = o, {
    store: d
  } = hr(), v = d.useState("open"), {
    getButtonProps: x,
    buttonRef: S
  } = $l({
    disabled: p,
    native: g
  }), C = {
    disabled: p
  };
  function E(M) {
    v && d.setOpen(!1, Pe(m0, M.nativeEvent));
  }
  return $e("button", o, {
    state: C,
    ref: [a, S],
    props: [{
      onClick: E
    }, m, x]
  });
}), sw = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    id: p,
    ...g
  } = o, {
    store: m
  } = hr(), d = wn(p);
  return m.useSyncedValueWithCleanup("descriptionElementId", d), $e("p", o, {
    ref: a,
    props: [{
      id: d
    }, g]
  });
});
let w2 = /* @__PURE__ */ (function(n) {
  return n.nestedDialogs = "--nested-dialogs", n;
})({}), S2 = (function(n) {
  return n[n.open = ir.open] = "open", n[n.closed = ir.closed] = "closed", n[n.startingStyle = ir.startingStyle] = "startingStyle", n[n.endingStyle = ir.endingStyle] = "endingStyle", n.nested = "data-nested", n.nestedDialogOpen = "data-nested-dialog-open", n;
})({});
const cw = /* @__PURE__ */ h.createContext(void 0);
function E2() {
  const n = h.useContext(cw);
  if (n === void 0)
    throw new Error(Ct(26));
  return n;
}
const T2 = {
  ...Lo,
  ...Ho,
  nestedDialogOpen(n) {
    return n ? {
      [S2.nestedDialogOpen]: ""
    } : null;
  }
}, uw = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    finalFocus: p,
    initialFocus: g,
    ...m
  } = o, {
    store: d
  } = hr(), v = d.useState("descriptionElementId"), x = d.useState("disablePointerDismissal"), S = d.useState("floatingRootContext"), C = d.useState("popupProps"), E = d.useState("modal"), M = d.useState("mounted"), T = d.useState("nested"), z = d.useState("nestedOpenDialogCount"), w = d.useState("open"), N = d.useState("openMethod"), A = d.useState("titleElementId"), L = d.useState("transitionStatus"), D = d.useState("role"), _ = S.useState("floatingId"), j = m.id ?? _;
  E2(), no({
    open: w,
    ref: d.context.popupRef,
    onComplete() {
      w && d.context.onOpenChangeComplete?.(!0);
    }
  });
  const V = g === void 0 ? dx(d.context.popupRef) : g, G = z > 0, ne = d.useStateSetter("popupElement"), Q = $e("div", o, {
    state: {
      open: w,
      nested: T,
      transitionStatus: L,
      nestedDialogOpen: G
    },
    props: [C, {
      id: j,
      "aria-labelledby": A ?? void 0,
      "aria-describedby": v ?? void 0,
      role: D,
      ...fa,
      hidden: !M,
      onKeyDown(Z) {
        Mi.has(Z.key) && Z.stopPropagation();
      },
      style: {
        [w2.nestedDialogs]: z
      }
    }, m],
    ref: [a, d.context.popupRef, ne],
    stateAttributesMapping: T2
  });
  return /* @__PURE__ */ b.jsx(nu, {
    context: S,
    openInteractionType: N,
    disabled: !M,
    closeOnFocusOut: !x,
    initialFocus: V,
    returnFocus: p,
    modal: E !== !1,
    restoreFocus: "popup",
    children: Q
  });
}), fw = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    keepMounted: i = !1,
    ...u
  } = o, {
    store: f
  } = hr(), p = f.useState("mounted"), g = f.useState("modal"), m = f.useState("open");
  return p || i ? /* @__PURE__ */ b.jsx(cw.Provider, {
    value: i,
    children: /* @__PURE__ */ b.jsxs(tu, {
      ref: a,
      ...u,
      children: [p && g === !0 && /* @__PURE__ */ b.jsx(vu, {
        ref: f.context.internalBackdropRef,
        inert: hu(!m)
      }), o.children]
    })
  }) : null;
}), dw = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    id: p,
    ...g
  } = o, {
    store: m
  } = hr(), d = wn(p);
  return m.useSyncedValueWithCleanup("titleElementId", d), $e("h2", o, {
    ref: a,
    props: [{
      id: d
    }, g]
  });
});
function R2({ ...n }) {
  return /* @__PURE__ */ b.jsx(b2, { "data-slot": "alert-dialog", ...n });
}
function C2({ ...n }) {
  return /* @__PURE__ */ b.jsx(fw, { "data-slot": "alert-dialog-portal", ...n });
}
function O2({
  className: n,
  ...o
}) {
  return /* @__PURE__ */ b.jsx(
    aw,
    {
      "data-slot": "alert-dialog-overlay",
      className: Fe(
        "tw:fixed tw:inset-0 tw:isolate tw:z-[var(--z-modal)] tw:bg-[var(--scrim)] tw:duration-[var(--motion-fast)] tw:supports-backdrop-filter:backdrop-blur-xs",
        n
      ),
      ...o
    }
  );
}
function M2({
  className: n,
  size: o = "default",
  ...a
}) {
  return /* @__PURE__ */ b.jsxs(C2, { children: [
    /* @__PURE__ */ b.jsx(O2, {}),
    /* @__PURE__ */ b.jsx(
      uw,
      {
        "data-slot": "alert-dialog-content",
        "data-size": o,
        className: Fe(
          "tw:group/alert-dialog-content tw:fixed tw:top-1/2 tw:left-1/2 tw:z-[var(--z-modal)] tw:grid tw:w-full tw:-translate-x-1/2 tw:-translate-y-1/2 tw:gap-4 tw:rounded-[var(--radius-surface)] tw:bg-popover tw:p-4 tw:text-popover-foreground tw:ring-1 tw:ring-foreground/10 tw:duration-[var(--motion-fast)] tw:outline-none tw:data-[size=default]:max-w-xs tw:data-[size=sm]:max-w-xs tw:data-[size=default]:sm:max-w-sm",
          n
        ),
        ...a
      }
    )
  ] });
}
function A2({
  className: n,
  ...o
}) {
  return /* @__PURE__ */ b.jsx(
    "div",
    {
      "data-slot": "alert-dialog-header",
      className: Fe(
        "tw:grid tw:grid-rows-[auto_1fr] tw:place-items-center tw:gap-1.5 tw:text-center tw:sm:group-data-[size=default]/alert-dialog-content:place-items-start tw:sm:group-data-[size=default]/alert-dialog-content:text-left",
        n
      ),
      ...o
    }
  );
}
const z2 = ua(
  "tw:flex tw:flex-col-reverse tw:gap-2 tw:sm:flex-row tw:sm:justify-end",
  {
    variants: {
      variant: {
        default: "tw:-mx-4 tw:-mb-4 tw:rounded-b-[var(--radius-surface)] tw:border-t tw:bg-muted/50 tw:p-4",
        plain: "tw:pt-1"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);
function N2({
  className: n,
  variant: o = "default",
  ...a
}) {
  return /* @__PURE__ */ b.jsx(
    "div",
    {
      "data-slot": "alert-dialog-footer",
      className: Fe(z2({ variant: o }), n),
      ...a
    }
  );
}
const j2 = ua(
  "tw:mb-2 tw:inline-flex tw:size-10 tw:items-center tw:justify-center tw:rounded-[var(--radius-control)] tw:sm:group-data-[size=default]/alert-dialog-content:row-span-2 tw:*:[svg:not([class*=size-])]:size-6",
  {
    variants: {
      variant: {
        default: "tw:bg-muted",
        destructive: "tw:bg-destructive/10 tw:text-destructive"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);
function D2({
  className: n,
  variant: o = "default",
  ...a
}) {
  return /* @__PURE__ */ b.jsx(
    "div",
    {
      "data-slot": "alert-dialog-media",
      className: Fe(j2({ variant: o }), n),
      ...a
    }
  );
}
function k2({
  className: n,
  ...o
}) {
  return /* @__PURE__ */ b.jsx(
    dw,
    {
      "data-slot": "alert-dialog-title",
      className: Fe(
        "tw:text-[length:var(--fs-title)] tw:font-medium tw:sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2",
        n
      ),
      ...o
    }
  );
}
function _2({
  className: n,
  ...o
}) {
  return /* @__PURE__ */ b.jsx(
    sw,
    {
      "data-slot": "alert-dialog-description",
      className: Fe(
        "tw:text-[length:var(--fs-body-s)] tw:text-balance tw:text-muted-foreground tw:md:text-pretty tw:*:[a]:underline tw:*:[a]:underline-offset-3 tw:*:[a]:hover:text-foreground",
        n
      ),
      ...o
    }
  );
}
function H2({
  className: n,
  ...o
}) {
  return /* @__PURE__ */ b.jsx(
    Vt,
    {
      "data-slot": "alert-dialog-action",
      className: Fe(n),
      ...o
    }
  );
}
function L2({
  className: n,
  variant: o = "outline",
  size: a = "default",
  ...i
}) {
  return /* @__PURE__ */ b.jsx(
    iw,
    {
      "data-slot": "alert-dialog-cancel",
      className: Fe(n),
      render: /* @__PURE__ */ b.jsx(Vt, { variant: o, size: a }),
      ...i
    }
  );
}
let Mb = /* @__PURE__ */ (function(n) {
  return n.disabled = "data-disabled", n.valid = "data-valid", n.invalid = "data-invalid", n.touched = "data-touched", n.dirty = "data-dirty", n.filled = "data-filled", n.focused = "data-focused", n;
})({});
const U2 = {
  badInput: !1,
  customError: !1,
  patternMismatch: !1,
  rangeOverflow: !1,
  rangeUnderflow: !1,
  stepMismatch: !1,
  tooLong: !1,
  tooShort: !1,
  typeMismatch: !1,
  valid: null,
  valueMissing: !1
}, ui = {
  valid: null,
  touched: !1,
  dirty: !1,
  filled: !1,
  focused: !1
}, B2 = {
  disabled: !1,
  ...ui
}, wg = {
  valid(n) {
    return n === null ? null : n ? {
      [Mb.valid]: ""
    } : {
      [Mb.invalid]: ""
    };
  }
}, I2 = {
  invalid: void 0,
  name: void 0,
  validityData: {
    state: U2,
    errors: [],
    error: "",
    value: "",
    initialValue: null
  },
  setValidityData: an,
  disabled: void 0,
  touched: ui.touched,
  setTouched: an,
  dirty: ui.dirty,
  setDirty: an,
  filled: ui.filled,
  setFilled: an,
  focused: ui.focused,
  setFocused: an,
  validate: () => null,
  validationMode: "onSubmit",
  validationDebounceTime: 0,
  shouldValidateOnChange: () => !1,
  state: B2,
  markedDirtyRef: {
    current: !1
  },
  registerFieldControl: an,
  validation: {
    getValidationProps: (n, o = mt) => o,
    inputRef: {
      current: null
    },
    registerInput: an,
    commit: async () => {
    },
    change: an
  }
}, V2 = /* @__PURE__ */ h.createContext(I2);
function Di(n = !0) {
  const o = h.useContext(V2);
  if (o.setValidityData === an && !n)
    throw new Error(Ct(28));
  return o;
}
const P2 = /* @__PURE__ */ h.createContext({
  formRef: {
    current: {
      fields: /* @__PURE__ */ new Map()
    }
  },
  errors: {},
  clearErrors: an,
  validationMode: "onSubmit",
  submitAttemptedRef: {
    current: !1
  }
});
function Sg() {
  return h.useContext(P2);
}
const Y2 = /* @__PURE__ */ h.createContext({
  controlId: void 0,
  registerControlId: an,
  labelId: void 0,
  setLabelId: an,
  messageIds: [],
  setMessageIds: an,
  getDescriptionProps: (n) => n
});
function Su() {
  return h.useContext(Y2);
}
function G2(n, o, a, i = !0, u) {
  const [f, p] = h.useState(), g = wn(u ? `${u}-label` : void 0), m = n ?? o ?? f;
  return we(() => {
    const d = n || o || !i ? void 0 : q2(a.current, g);
    f !== d && p(d);
  }), m;
}
function q2(n, o) {
  const a = X2(n);
  if (a)
    return !a.id && o && (a.id = o), a.id || void 0;
}
function X2(n) {
  if (!n)
    return;
  const o = n.parentElement;
  if (o && o.tagName === "LABEL")
    return o;
  const a = n.id;
  if (a) {
    const u = n.nextElementSibling;
    if (u && u.htmlFor === a)
      return u;
  }
  const i = n.labels;
  return i && i[0];
}
function Eu(n = {}) {
  const {
    id: o,
    implicit: a = !1,
    controlRef: i
  } = n, {
    controlId: u,
    registerControlId: f
  } = Su(), p = wn(o), g = a ? u : void 0, m = xn(() => /* @__PURE__ */ Symbol("labelable-control")), d = h.useRef(!1), v = h.useRef(o != null), x = ze(() => {
    !d.current || f === an || (d.current = !1, f(m.current, void 0));
  });
  return we(() => {
    if (f === an)
      return;
    let S;
    if (a) {
      const C = i?.current;
      We(C) && C.closest("label") != null ? S = o ?? null : S = g ?? p;
    } else if (o != null)
      v.current = !0, S = o;
    else if (v.current)
      S = p;
    else {
      x();
      return;
    }
    if (S === void 0) {
      x();
      return;
    }
    d.current = !0, f(m.current, S);
  }, [o, i, g, f, a, p, m, x]), h.useEffect(() => x, [x]), u ?? p;
}
function Eg(n, o, a, i, u = !0, f) {
  const {
    registerFieldControl: p
  } = Di(), g = h.useRef(null);
  g.current || (g.current = /* @__PURE__ */ Symbol()), we(() => {
    const m = g.current;
    return !m || !u ? void 0 : (p(m, {
      controlRef: n,
      getValue: i,
      id: o,
      name: f,
      value: a
    }), () => {
      p(m, void 0);
    });
  }, [n, u, i, o, f, p, a]);
}
const F2 = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    id: f,
    name: p,
    value: g,
    disabled: m = !1,
    onValueChange: d,
    defaultValue: v,
    autoFocus: x = !1,
    style: S,
    ...C
  } = o, {
    state: E,
    name: M,
    disabled: T,
    setTouched: z,
    setDirty: w,
    validityData: N,
    setFocused: A,
    setFilled: L,
    validationMode: D,
    validation: _
  } = Di(), {
    clearErrors: j
  } = Sg(), V = T || m, G = M ?? p, ne = {
    ...E,
    disabled: V
  }, {
    labelId: F
  } = Su(), Q = Eu({
    id: f
  });
  we(() => {
    const B = g != null;
    _.inputRef.current?.value || B && g !== "" ? L(!0) : B && g === "" && L(!1);
  }, [_.inputRef, L, g]);
  const Z = h.useRef(null);
  we(() => {
    x && Z.current === bn(nt(Z.current)) && A(!0);
  }, [x, A]);
  const [q] = sr({
    controlled: g,
    default: v,
    name: "FieldControl",
    state: "value"
  }), k = g !== void 0, P = k ? q : void 0, I = ze(() => _.inputRef.current?.value);
  return Eg(_.inputRef, Q, P, I, !V, p), $e("input", o, {
    ref: [a, Z],
    state: ne,
    props: [{
      id: Q,
      disabled: V,
      name: G,
      ref: _.inputRef,
      "aria-labelledby": F,
      autoFocus: x,
      ...k ? {
        value: P
      } : {
        defaultValue: v
      },
      onChange(B) {
        const O = B.currentTarget.value;
        d?.(O, Pe(eo, B.nativeEvent)), w(O !== N.initialValue), L(O !== ""), B.nativeEvent.defaultPrevented || (j(G), _.change(O));
      },
      onFocus() {
        A(!0);
      },
      onBlur(B) {
        z(!0), A(!1), D === "onBlur" && _.commit(B.currentTarget.value);
      },
      onKeyDown(B) {
        B.currentTarget.tagName === "INPUT" && B.key === "Enter" && (z(!0), _.commit(B.currentTarget.value));
      }
    }, C, (B) => _.getValidationProps(V, B)],
    stateAttributesMapping: wg
  });
}), K2 = /* @__PURE__ */ h.forwardRef(function(o, a) {
  return /* @__PURE__ */ b.jsx(F2, {
    ref: a,
    ...o
  });
});
function Q2({ className: n, type: o, ...a }) {
  return /* @__PURE__ */ b.jsx(
    K2,
    {
      type: o,
      "data-slot": "input",
      className: Fe(
        "tw:h-8 tw:w-full tw:min-w-0 tw:rounded-[var(--radius-control)] tw:border tw:border-input tw:bg-background tw:px-2.5 tw:py-1 tw:text-[length:var(--fs-body-s)] tw:text-foreground tw:outline-none tw:placeholder:text-muted-foreground tw:focus-visible:border-ring tw:focus-visible:ring-2 tw:focus-visible:ring-ring/40 tw:disabled:pointer-events-none tw:disabled:cursor-not-allowed tw:disabled:opacity-50 tw:aria-invalid:border-destructive tw:aria-invalid:ring-2 tw:aria-invalid:ring-destructive/20",
        n
      ),
      ...a
    }
  );
}
function xp({ className: n, ...o }) {
  return /* @__PURE__ */ b.jsx(
    "div",
    {
      "data-slot": "input-group",
      role: "group",
      className: Fe(
        "tw:group/input-group tw:relative tw:flex tw:h-8 tw:w-full tw:min-w-0 tw:items-center tw:rounded-[var(--radius-control)] tw:border tw:border-input tw:transition-colors tw:duration-[var(--motion-fast)] tw:outline-none tw:in-data-[slot=combobox-content]:focus-within:border-inherit tw:in-data-[slot=combobox-content]:focus-within:ring-0 tw:has-disabled:bg-input/50 tw:has-disabled:opacity-50 tw:has-[[data-slot=input-group-control]:focus-visible]:border-ring tw:has-[[data-slot=input-group-control]:focus-visible]:ring-2 tw:has-[[data-slot=input-group-control]:focus-visible]:ring-ring/40 tw:has-[[data-slot][aria-invalid=true]]:border-destructive tw:has-[[data-slot][aria-invalid=true]]:ring-2 tw:has-[[data-slot][aria-invalid=true]]:ring-destructive/20 tw:has-[>[data-align=block-end]]:h-auto tw:has-[>[data-align=block-end]]:flex-col tw:has-[>[data-align=block-start]]:h-auto tw:has-[>[data-align=block-start]]:flex-col tw:has-[>textarea]:h-auto tw:has-[>[data-align=block-end]]:[&>input]:pt-3 tw:has-[>[data-align=block-start]]:[&>input]:pb-3 tw:has-[>[data-align=inline-end]]:[&>input]:pr-1.5 tw:has-[>[data-align=inline-start]]:[&>input]:pl-1.5",
        n
      ),
      ...o
    }
  );
}
const Z2 = ua(
  "tw:flex tw:h-auto tw:cursor-text tw:items-center tw:justify-center tw:gap-2 tw:py-1.5 tw:text-[length:var(--fs-body-s)] tw:font-medium tw:text-muted-foreground tw:select-none tw:group-data-[disabled=true]/input-group:opacity-50 tw:[&>kbd]:rounded-[var(--radius-control)] tw:[&>svg:not([class*=size-])]:size-4",
  {
    variants: {
      align: {
        "inline-start": "tw:order-first tw:pl-2 tw:has-[>button]:ml-[-0.3rem] tw:has-[>kbd]:ml-[-0.15rem]",
        "inline-end": "tw:order-last tw:pr-2 tw:has-[>button]:mr-[-0.3rem] tw:has-[>kbd]:mr-[-0.15rem]",
        "block-start": "tw:order-first tw:w-full tw:justify-start tw:px-2.5 tw:pt-2 tw:group-has-[>input]/input-group:pt-2 tw:[.border-b]:pb-2",
        "block-end": "tw:order-last tw:w-full tw:justify-start tw:px-2.5 tw:pb-2 tw:group-has-[>input]/input-group:pb-2 tw:[.border-t]:pt-2"
      }
    },
    defaultVariants: {
      align: "inline-start"
    }
  }
);
function wp({
  className: n,
  align: o = "inline-start",
  ...a
}) {
  return /* @__PURE__ */ b.jsx(
    "div",
    {
      role: "group",
      "data-slot": "input-group-addon",
      "data-align": o,
      className: Fe(Z2({ align: o }), n),
      onClick: (i) => {
        i.target.closest("button") || i.currentTarget.parentElement?.querySelector("input, textarea")?.focus();
      },
      ...a
    }
  );
}
const J2 = ua(
  "tw:flex tw:items-center tw:gap-2 tw:text-[length:var(--fs-body-s)] tw:shadow-none",
  {
    variants: {
      size: {
        xs: "tw:h-6 tw:gap-1 tw:rounded-[var(--radius-control)] tw:px-1.5 tw:[&>svg:not([class*=size-])]:size-3.5",
        sm: "",
        "icon-xs": "tw:size-6 tw:rounded-[var(--radius-control)] tw:p-0 tw:has-[>svg]:p-0",
        "icon-sm": "tw:size-8 tw:p-0 tw:has-[>svg]:p-0"
      }
    },
    defaultVariants: {
      size: "xs"
    }
  }
);
function pw({
  className: n,
  type: o = "button",
  variant: a = "ghost",
  size: i = "xs",
  ...u
}) {
  return /* @__PURE__ */ b.jsx(
    Vt,
    {
      type: o,
      "data-size": i,
      variant: a,
      className: Fe(J2({ size: i }), n),
      ...u
    }
  );
}
function Sp({
  className: n,
  ...o
}) {
  return /* @__PURE__ */ b.jsx(
    Q2,
    {
      "data-slot": "input-group-control",
      className: Fe(
        "tw:flex-1 tw:rounded-none tw:border-0 tw:bg-transparent tw:shadow-none tw:ring-0 tw:focus-visible:ring-0 tw:disabled:bg-transparent tw:aria-invalid:ring-0",
        n
      ),
      ...o
    }
  );
}
const gw = /* @__PURE__ */ h.createContext(void 0);
function W2() {
  const n = h.useContext(gw);
  if (n === void 0)
    throw new Error(Ct(63));
  return n;
}
let Ab = /* @__PURE__ */ (function(n) {
  return n.checked = "data-checked", n.unchecked = "data-unchecked", n.disabled = "data-disabled", n.readonly = "data-readonly", n.required = "data-required", n.valid = "data-valid", n.invalid = "data-invalid", n.touched = "data-touched", n.dirty = "data-dirty", n.filled = "data-filled", n.focused = "data-focused", n;
})({});
const mw = {
  ...wg,
  checked(n) {
    return n ? {
      [Ab.checked]: ""
    } : {
      [Ab.unchecked]: ""
    };
  }
}, $2 = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    checked: i,
    className: u,
    defaultChecked: f,
    "aria-labelledby": p,
    form: g,
    id: m,
    inputRef: d,
    name: v,
    nativeButton: x = !1,
    onCheckedChange: S,
    readOnly: C = !1,
    required: E = !1,
    disabled: M = !1,
    render: T,
    uncheckedValue: z,
    value: w,
    style: N,
    ...A
  } = o, {
    clearErrors: L
  } = Sg(), {
    state: D,
    setTouched: _,
    setDirty: j,
    validityData: V,
    setFilled: G,
    setFocused: ne,
    validationMode: F,
    disabled: Q,
    name: Z,
    validation: q
  } = Di(), {
    labelId: k
  } = Su(), P = Q || M, I = Z ?? v, X = h.useRef(null), B = Kl(X, d, q.inputRef), O = h.useRef(null), H = wn(), ee = Eu({
    id: m,
    implicit: !1,
    controlRef: O
  }), J = x ? void 0 : ee, [le, ie] = sr({
    controlled: i,
    default: !!f,
    name: "Switch",
    state: "checked"
  });
  Eg(O, H, le, void 0, !P, v), we(() => {
    X.current && G(X.current.checked);
  }, [X, G]), pg(le, () => {
    L(I), j(le !== V.initialValue), G(le), q.change(le);
  });
  const {
    getButtonProps: re,
    buttonRef: se
  } = $l({
    disabled: P,
    native: x
  }), ge = G2(p, k, X, !x, J), De = {
    id: x ? ee : H,
    role: "switch",
    "aria-checked": le,
    "aria-readonly": C || void 0,
    "aria-required": E || void 0,
    "aria-labelledby": ge,
    onFocus() {
      P || ne(!0);
    },
    onBlur() {
      const ye = X.current;
      !ye || P || (_(!0), ne(!1), F === "onBlur" && q.commit(ye.checked));
    },
    onClick(ye) {
      if (C || P)
        return;
      ye.preventDefault();
      const je = X.current;
      je && je.dispatchEvent(new (At(je)).PointerEvent("click", {
        bubbles: !0,
        shiftKey: ye.shiftKey,
        ctrlKey: ye.ctrlKey,
        altKey: ye.altKey,
        metaKey: ye.metaKey
      }));
    }
  }, Ee = yn(
    {
      checked: le,
      disabled: P,
      form: g,
      id: J,
      name: I,
      required: E,
      style: I ? B0 : Fp,
      tabIndex: -1,
      type: "checkbox",
      "aria-hidden": !0,
      ref: B,
      onChange(ye) {
        if (ye.nativeEvent.defaultPrevented)
          return;
        if (C) {
          ye.preventDefault();
          return;
        }
        const je = ye.currentTarget.checked, ke = Pe(eo, ye.nativeEvent);
        S?.(je, ke), !ke.isCanceled && ie(je);
      },
      onFocus() {
        O.current?.focus();
      }
    },
    (ye) => q.getValidationProps(P, ye),
    // React <19 sets an empty value if `undefined` is passed explicitly
    // To avoid this, we only set the value if it's defined
    w !== void 0 ? {
      value: w
    } : mt
  ), ue = h.useMemo(() => ({
    ...D,
    checked: le,
    disabled: P,
    readOnly: C,
    required: E
  }), [D, le, P, C, E]), he = $e("span", o, {
    state: ue,
    ref: [a, O, se],
    props: [De, A, re, (ye) => q.getValidationProps(P, ye)],
    stateAttributesMapping: mw
  });
  return /* @__PURE__ */ b.jsxs(gw.Provider, {
    value: ue,
    children: [he, !le && I && z !== void 0 && /* @__PURE__ */ b.jsx("input", {
      type: "hidden",
      form: g,
      name: I,
      value: z,
      disabled: P
    }), /* @__PURE__ */ b.jsx("input", {
      ...Ee,
      suppressHydrationWarning: !0
    })]
  });
}), eA = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    ...p
  } = o, g = W2();
  return $e("span", o, {
    state: g,
    ref: a,
    stateAttributesMapping: mw,
    props: p
  });
});
function tA({ className: n, ...o }) {
  return /* @__PURE__ */ b.jsx(
    $2,
    {
      nativeButton: !0,
      render: /* @__PURE__ */ b.jsx("button", { type: "button" }),
      "data-slot": "switch",
      className: Fe(
        "tw:relative tw:inline-flex tw:h-[22px] tw:w-[38px] tw:shrink-0 tw:items-center tw:rounded-full tw:border tw:border-input tw:bg-background tw:p-0 tw:align-middle tw:transition-[background-color,border-color] tw:duration-[var(--motion-standard)] tw:ease-[var(--ease-out)] tw:data-checked:border-primary tw:data-checked:bg-primary tw:focus-visible:outline tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-ring tw:disabled:pointer-events-none tw:disabled:opacity-50",
        n
      ),
      ...o,
      children: /* @__PURE__ */ b.jsx(
        eA,
        {
          "data-slot": "switch-thumb",
          className: "tw:absolute tw:left-0.5 tw:size-4 tw:rounded-full tw:bg-muted-foreground tw:transition-[transform,background-color] tw:duration-[var(--motion-standard)] tw:ease-[var(--ease-out)] tw:data-checked:translate-x-4 tw:data-checked:bg-primary-foreground"
        }
      )
    }
  );
}
function nA({
  className: n,
  orientation: o = "horizontal",
  ...a
}) {
  return /* @__PURE__ */ b.jsx(
    $x,
    {
      "data-slot": "separator",
      orientation: o,
      className: Fe(
        "tw:shrink-0 tw:bg-border tw:data-horizontal:h-px tw:data-horizontal:w-full tw:data-vertical:w-px tw:data-vertical:self-stretch",
        n
      ),
      ...a
    }
  );
}
const hw = /* @__PURE__ */ h.createContext(null), yw = /* @__PURE__ */ h.createContext(null);
function Uo() {
  const n = h.useContext(hw);
  if (n === null)
    throw new Error(Ct(60));
  return n;
}
function vw() {
  const n = h.useContext(yw);
  if (n === null)
    throw new Error(Ct(61));
  return n;
}
const lA = (n, o) => Object.is(n, o);
function dr(n, o, a) {
  return n == null || o == null ? Object.is(n, o) : a(n, o);
}
function oA(n, o, a) {
  return !n || n.length === 0 ? !1 : n.some((i) => i === void 0 ? !1 : dr(o, i, a));
}
function vi(n, o, a) {
  return !n || n.length === 0 ? -1 : n.findIndex((i) => i === void 0 ? !1 : dr(i, o, a));
}
function rA(n, o, a) {
  return n.filter((i) => !dr(o, i, a));
}
function Ep(n) {
  if (n == null)
    return "";
  if (typeof n == "string")
    return n;
  try {
    return JSON.stringify(n);
  } catch {
    return String(n);
  }
}
function bw(n) {
  return n != null && n.length > 0 && typeof n[0] == "object" && n[0] != null && "items" in n[0];
}
function aA(n) {
  if (!Array.isArray(n))
    return n != null && "null" in n;
  const o = n;
  if (bw(o)) {
    for (const a of o)
      for (const i of a.items)
        if (i && i.value == null && i.label != null)
          return !0;
    return !1;
  }
  for (const a of o)
    if (a && a.value == null && a.label != null)
      return !0;
  return !1;
}
function xw(n, o) {
  if (o && n != null)
    return o(n) ?? "";
  if (n && typeof n == "object") {
    if ("label" in n && n.label != null)
      return String(n.label);
    if ("value" in n)
      return String(n.value);
  }
  return Ep(n);
}
function or(n, o) {
  return o && n != null ? o(n) ?? "" : n && typeof n == "object" && "value" in n && "label" in n ? Ep(n.value) : Ep(n);
}
function ww(n, o, a) {
  function i() {
    return xw(n, a);
  }
  if (a && n != null)
    return a(n);
  if (n && typeof n == "object" && "label" in n && n.label != null)
    return n.label;
  if (o && !Array.isArray(o))
    return o[n] ?? i();
  if (Array.isArray(o)) {
    const u = o, f = bw(u) ? u.flatMap((p) => p.items) : u;
    if (n == null || typeof n != "object") {
      const p = f.find((g) => g.value === n);
      return p && p.label != null ? p.label : i();
    }
    if ("value" in n) {
      const p = f.find((g) => g && g.value === n.value);
      if (p && p.label != null)
        return p.label;
    }
  }
  return i();
}
function iA(n, o, a) {
  return n.reduce((i, u, f) => (f > 0 && i.push(", "), i.push(/* @__PURE__ */ b.jsx(h.Fragment, {
    children: ww(u, o, a)
  }, f)), i), []);
}
const Ve = {
  id: me((n) => n.id),
  labelId: me((n) => n.labelId),
  modal: me((n) => n.modal),
  multiple: me((n) => n.multiple),
  items: me((n) => n.items),
  itemToStringLabel: me((n) => n.itemToStringLabel),
  itemToStringValue: me((n) => n.itemToStringValue),
  isItemEqualToValue: me((n) => n.isItemEqualToValue),
  value: me((n) => n.value),
  hasSelectedValue: me((n) => {
    const {
      value: o,
      multiple: a,
      itemToStringValue: i
    } = n;
    return o == null ? !1 : a && Array.isArray(o) ? o.length > 0 : or(o, i) !== "";
  }),
  hasNullItemLabel: me((n, o) => o ? aA(n.items) : !1),
  open: me((n) => n.open),
  mounted: me((n) => n.mounted),
  forceMount: me((n) => n.forceMount),
  transitionStatus: me((n) => n.transitionStatus),
  openMethod: me((n) => n.openMethod),
  activeIndex: me((n) => n.activeIndex),
  selectedIndex: me((n) => n.selectedIndex),
  isActive: me((n, o) => n.activeIndex === o),
  isSelected: me((n, o) => {
    const a = n.isItemEqualToValue, i = n.value;
    return n.multiple ? Array.isArray(i) && i.some((u) => dr(o, u, a)) : dr(o, i, a);
  }),
  isSelectedByFocus: me((n, o) => n.selectedIndex === o),
  popupProps: me((n) => n.popupProps),
  triggerProps: me((n) => n.triggerProps),
  triggerElement: me((n) => n.triggerElement),
  positionerElement: me((n) => n.positionerElement),
  listElement: me((n) => n.listElement),
  popupSide: me((n) => n.popupSide),
  scrollUpArrowVisible: me((n) => n.scrollUpArrowVisible),
  scrollDownArrowVisible: me((n) => n.scrollDownArrowVisible),
  hasScrollArrows: me((n) => n.hasScrollArrows)
};
function sA(n, o, a = (i, u) => i === u) {
  return n.length === o.length && n.every((i, u) => a(i, o[u]));
}
function fi(n, o = Number.MIN_SAFE_INTEGER, a = Number.MAX_SAFE_INTEGER) {
  return Math.max(o, Math.min(n, a));
}
const Il = 1;
function Sw(n, o) {
  return Math.max(0, n - o);
}
function cA(n, o) {
  if (o <= 0)
    return 0;
  const a = fi(n, 0, o), i = a, u = o - a, f = i <= Il, p = u <= Il;
  return f && p ? i <= u ? 0 : o : f ? 0 : p ? o : a;
}
function uA(n) {
  const {
    id: o,
    value: a,
    defaultValue: i = null,
    onValueChange: u,
    open: f,
    defaultOpen: p = !1,
    onOpenChange: g,
    name: m,
    form: d,
    autoComplete: v,
    disabled: x = !1,
    readOnly: S = !1,
    required: C = !1,
    modal: E = !0,
    actionsRef: M,
    inputRef: T,
    onOpenChangeComplete: z,
    items: w,
    multiple: N = !1,
    itemToStringLabel: A,
    itemToStringValue: L,
    isItemEqualToValue: D = lA,
    highlightItemOnHover: _ = !0,
    children: j
  } = n, {
    clearErrors: V
  } = Sg(), {
    setDirty: G,
    setTouched: ne,
    setFocused: F,
    validityData: Q,
    setFilled: Z,
    name: q,
    disabled: k,
    validation: P,
    validationMode: I
  } = Di(), X = Eu({
    id: o
  }), B = k || x, O = q ?? m, [H, ee] = sr({
    controlled: a,
    default: N ? i ?? Ql : i,
    name: "Select",
    state: "value"
  }), [J, le] = sr({
    controlled: f,
    default: p,
    name: "Select",
    state: "open"
  }), ie = h.useRef([]), re = h.useRef([]), se = h.useRef(null), ge = h.useRef(null), De = h.useRef(0), Ee = h.useRef(null), ue = h.useRef([]), he = h.useRef(!1), ye = h.useRef(null), je = h.useRef(null), ke = h.useRef({
    allowSelectedMouseUp: !1,
    allowUnselectedMouseUp: !1,
    dragY: 0
  }), Te = h.useRef(!1), {
    mounted: Ce,
    setMounted: ve,
    transitionStatus: Se
  } = au(J), {
    openMethod: Re,
    triggerProps: Oe
  } = Tx(J), He = xn(() => new ux({
    id: X,
    labelId: void 0,
    modal: E,
    multiple: N,
    itemToStringLabel: A,
    itemToStringValue: L,
    isItemEqualToValue: D,
    value: H,
    open: J,
    mounted: Ce,
    transitionStatus: Se,
    items: w,
    forceMount: !1,
    openMethod: null,
    activeIndex: null,
    selectedIndex: null,
    popupProps: {},
    triggerProps: {},
    triggerElement: null,
    positionerElement: null,
    listElement: null,
    popupSide: null,
    scrollUpArrowVisible: !1,
    scrollDownArrowVisible: !1,
    hasScrollArrows: !1
  })).current, ae = Ye(He, Ve.activeIndex), pe = Ye(He, Ve.selectedIndex), Le = Ye(He, Ve.triggerElement), be = Ye(He, Ve.positionerElement), xe = dM(Re), et = Re ?? xe ?? null, rt = h.useMemo(() => N ? "" : or(H, L), [N, H, L]), pt = h.useMemo(() => N && Array.isArray(H) ? H.map((qe) => or(qe, L)) : or(H, L), [N, H, L]), Nt = Yt(He.state.triggerElement), tt = ze(() => pt);
  Eg(Nt, X, H, tt, !B, m);
  const gt = h.useRef(H), zt = N ? Array.isArray(H) && H.length > 0 : H != null && or(H, L) !== "";
  we(() => {
    H !== gt.current && He.set("forceMount", !0);
  }, [He, H]), we(() => {
    Z(zt);
  }, [zt, Z]), we(function() {
    const xt = ue.current;
    let Xt;
    if (N) {
      const ln = Array.isArray(H) ? H : [];
      if (ln.length === 0)
        Xt = null;
      else {
        const en = ln[ln.length - 1], Ot = vi(xt, en, D);
        Xt = Ot === -1 ? null : Ot;
      }
    } else {
      const ln = vi(xt, H, D);
      Xt = ln === -1 ? null : ln;
    }
    Xt === null && (je.current = null), !J && He.set("selectedIndex", Xt);
  }, [zt, N, J, H, ue, D, He, je]);
  function ht(qe) {
    const xt = Q.initialValue;
    return Array.isArray(qe) && Array.isArray(xt) ? !sA(qe, xt, (Xt, ln) => dr(Xt, ln, D)) : qe !== xt;
  }
  pg(H, () => {
    V(O), G(ht(H)), P.change(H);
  });
  const An = ze((qe, xt) => {
    g?.(qe, xt), !xt.isCanceled && (le(qe), !qe && (xt.reason === Ao || xt.reason === Yc) && (ne(!0), F(!1), I === "onBlur" && P.commit(H)));
  }), zn = ze(() => {
    ve(!1), He.update({
      activeIndex: null,
      openMethod: null
    }), z?.(!1);
  });
  no({
    enabled: !M,
    open: J,
    ref: se,
    onComplete() {
      J || zn();
    }
  }), h.useImperativeHandle(M, () => ({
    unmount: zn
  }), [zn]);
  const Qe = ze((qe, xt) => {
    u?.(qe, xt), !xt.isCanceled && ee(qe);
  }), ft = ze(() => {
    const qe = He.state.listElement || se.current;
    if (!qe)
      return;
    const xt = Sw(qe.scrollHeight, qe.clientHeight), Xt = cA(qe.scrollTop, xt), ln = Xt > 0, en = Xt < xt;
    He.state.scrollUpArrowVisible !== ln && He.set("scrollUpArrowVisible", ln), He.state.scrollDownArrowVisible !== en && He.set("scrollDownArrowVisible", en);
  }), Ut = hx({
    open: J,
    onOpenChange: An,
    elements: {
      reference: Le,
      floating: be
    }
  }), _t = lu(Ut, {
    enabled: !S && !B,
    event: "mousedown"
  }), Ht = Ai(Ut), jt = bx(Ut, {
    enabled: !S && !B,
    listRef: ie,
    activeIndex: ae,
    selectedIndex: pe,
    disabledIndices: Ql,
    onNavigate(qe) {
      qe === null && !J || He.set("activeIndex", qe);
    },
    focusItemOnHover: _
  }), Gt = xx(Ut, {
    enabled: !S && !B && (J || !N),
    listRef: re,
    activeIndex: ae,
    selectedIndex: pe,
    // Skip disabled items while matching so typeahead advances to the next selectable item
    // (a click can never select a disabled item and native `<select>` skips them too). Resolve
    // the disabled state from the element via the attribute-only `isElementDisabled` so the
    // hidden, force-mounted items used for closed-trigger typeahead aren't dropped by the
    // `elementsRef`/visibility filter that `disabledIndices` deliberately sidesteps.
    disabledIndices: (qe) => y0(ie.current[qe]),
    onMatch(qe) {
      J ? He.set("activeIndex", qe) : Qe(ue.current[qe], Pe("none"));
    },
    onTyping(qe) {
      he.current = qe;
    }
  }), Sn = h.useMemo(() => {
    const qe = yn(Gt.reference, jt.reference, Ht.reference, _t.reference, Oe);
    return X && (qe.id = X), qe;
  }, [_t.reference, Gt.reference, jt.reference, Ht.reference, Oe, X]), Nn = h.useMemo(() => yn(fa, Gt.floating, jt.floating, Ht.floating), [Gt.floating, jt.floating, Ht.floating]), Pn = jt.item ?? mt;
  $p(() => {
    He.update({
      popupProps: Nn,
      triggerProps: Sn
    });
  }), we(() => {
    He.update({
      id: X,
      modal: E,
      multiple: N,
      value: H,
      open: J,
      mounted: Ce,
      transitionStatus: Se,
      popupProps: Nn,
      triggerProps: Sn,
      items: w,
      itemToStringLabel: A,
      itemToStringValue: L,
      isItemEqualToValue: D,
      openMethod: et
    });
  }, [He, X, E, N, H, J, Ce, Se, Nn, Sn, w, A, L, D, et]);
  const qt = h.useMemo(() => ({
    store: He,
    name: O,
    required: C,
    disabled: B,
    readOnly: S,
    multiple: N,
    highlightItemOnHover: _,
    setValue: Qe,
    setOpen: An,
    listRef: ie,
    popupRef: se,
    scrollHandlerRef: ge,
    handleScrollArrowVisibility: ft,
    scrollArrowsMountedCountRef: De,
    itemProps: Pn,
    valueRef: Ee,
    valuesRef: ue,
    labelsRef: re,
    typingRef: he,
    selectionRef: ke,
    firstItemTextRef: ye,
    selectedItemTextRef: je,
    validation: P,
    onOpenChangeComplete: z,
    alignItemWithTriggerActiveRef: Te,
    initialValueRef: gt
  }), [He, O, C, B, S, N, _, Qe, An, Pn, P, z, ft]), Yn = Kl(T, P.inputRef), vl = N && Array.isArray(H) && H.length > 0, nl = N ? void 0 : O, bl = h.useMemo(() => !N || !Array.isArray(H) || !O ? null : H.map((qe) => {
    const xt = or(qe, L);
    return /* @__PURE__ */ b.jsx("input", {
      type: "hidden",
      form: d,
      name: O,
      value: xt,
      disabled: B
    }, xt);
  }), [N, H, d, O, L, B]);
  return /* @__PURE__ */ b.jsx(hw.Provider, {
    value: qt,
    children: /* @__PURE__ */ b.jsxs(yw.Provider, {
      value: Ut,
      children: [j, /* @__PURE__ */ b.jsx("input", {
        ...P.getValidationProps(B, {
          onFocus() {
            He.state.triggerElement?.focus({
              // Supported in Chrome from 144 (January 2026)
              focusVisible: !0
            });
          },
          // Handle browser autofill.
          onChange(qe) {
            if (qe.nativeEvent.defaultPrevented || B || S)
              return;
            const xt = qe.currentTarget.value, Xt = Pe(eo, qe.nativeEvent);
            function ln() {
              if (N)
                return;
              const en = xt.toLowerCase();
              let Ot = ue.current.findIndex((il) => or(il, L).toLowerCase() === en || xw(il, A).toLowerCase() === en);
              Ot === -1 && (Ot = ue.current.findIndex((il, pa) => {
                const ki = re.current[pa];
                return ki != null && ki.toLowerCase() === en;
              }));
              const cn = Ot === -1 ? void 0 : ue.current[Ot];
              cn != null && Qe(cn, Xt);
            }
            He.set("forceMount", !0), queueMicrotask(ln);
          }
        }),
        id: X && nl == null ? `${X}-hidden-input` : void 0,
        form: d,
        name: nl,
        autoComplete: v,
        value: rt,
        disabled: B,
        required: C && !vl,
        readOnly: S,
        ref: Yn,
        style: O ? B0 : Fp,
        tabIndex: -1,
        "aria-hidden": !0,
        suppressHydrationWarning: !0
      }), bl]
    })
  });
}
function fA(n, o) {
  return n ?? o;
}
const rc = 2, dA = 400, pA = {
  ...Uc,
  ...wg,
  popupSide: (n) => n ? {
    "data-popup-side": n
  } : null,
  value: () => null
}, gA = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    id: f,
    disabled: p = !1,
    nativeButton: g = !0,
    style: m,
    ...d
  } = o, {
    setTouched: v,
    setFocused: x,
    validationMode: S,
    state: C,
    disabled: E
  } = Di(), {
    labelId: M
  } = Su(), {
    store: T,
    setOpen: z,
    selectionRef: w,
    validation: N,
    readOnly: A,
    required: L,
    alignItemWithTriggerActiveRef: D,
    disabled: _
  } = Uo(), j = E || _ || p, V = Ye(T, Ve.open), G = Ye(T, Ve.mounted), ne = Ye(T, Ve.value), F = Ye(T, Ve.triggerProps), Q = Ye(T, Ve.positionerElement), Z = Ye(T, Ve.listElement), q = Ye(T, Ve.popupSide), k = Ye(T, Ve.id), P = Ye(T, Ve.labelId), I = Ye(T, Ve.hasSelectedValue), X = G && Q ? q : null, B = f ?? k, O = fA(M, P);
  Eu({
    id: B
  });
  const H = Yt(Q), ee = h.useRef(null), {
    getButtonProps: J,
    buttonRef: le
  } = $l({
    disabled: j,
    native: g
  }), ie = ze((he) => {
    T.set("triggerElement", he);
  }), re = sn(), se = sn(), ge = sn();
  h.useEffect(() => {
    if (V)
      return ge.start(dA, () => {
        w.current.allowUnselectedMouseUp = !0, w.current.allowSelectedMouseUp = !0;
      }), () => {
        ge.clear();
      };
    w.current = {
      allowSelectedMouseUp: !1,
      allowUnselectedMouseUp: !1,
      dragY: 0
    }, se.clear();
  }, [V, w, se, ge]);
  const De = yn(F, {
    id: B,
    role: "combobox",
    "aria-expanded": V ? "true" : "false",
    "aria-haspopup": "listbox",
    "aria-controls": V ? Z?.id ?? Mc(Q)?.id : void 0,
    "aria-labelledby": O,
    "aria-readonly": A || void 0,
    "aria-required": L || void 0,
    tabIndex: j ? -1 : 0,
    onFocus(he) {
      x(!0), V && D.current && z(!1, Pe(eo, he.nativeEvent)), re.start(0, () => {
        T.set("forceMount", !0);
      });
    },
    onBlur(he) {
      Ue(Q, he.relatedTarget) || (v(!0), x(!1), S === "onBlur" && N.commit(ne));
    },
    onMouseDown(he) {
      if (V)
        return;
      const ye = nt(he.currentTarget);
      function je(ke) {
        if (!ee.current)
          return;
        const Te = ke.target;
        if (Ue(ee.current, Te) || Ue(H.current, Te))
          return;
        const Ce = Jx(ee.current);
        ke.clientX >= Ce.left - rc && ke.clientX <= Ce.right + rc && ke.clientY >= Ce.top - rc && ke.clientY <= Ce.bottom + rc || z(!1, Pe(h0, ke));
      }
      se.start(0, () => {
        ye.addEventListener("mouseup", je, {
          once: !0
        });
      });
    }
  }, d, J), Ee = N.getValidationProps(j, De);
  Ee.role = "combobox";
  const ue = {
    ...C,
    open: V,
    disabled: j,
    value: ne,
    readOnly: A,
    popupSide: X,
    placeholder: !I
  };
  return $e("button", o, {
    ref: [a, ee, le, ie],
    state: ue,
    stateAttributesMapping: pA,
    props: Ee
  });
}), mA = {
  value: () => null
}, hA = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    className: i,
    render: u,
    children: f,
    placeholder: p,
    style: g,
    ...m
  } = o, {
    store: d,
    valueRef: v
  } = Uo(), x = Ye(d, Ve.value), S = Ye(d, Ve.items), C = Ye(d, Ve.itemToStringLabel), E = Ye(d, Ve.hasSelectedValue), M = !E && p != null && f == null, T = Ye(d, Ve.hasNullItemLabel, M), z = {
    value: x,
    placeholder: !E
  };
  let w = null;
  return typeof f == "function" ? w = f(x) : f != null ? w = f : !E && p != null && !T ? w = p : Array.isArray(x) ? w = iA(x, S, C) : w = ww(x, S, C), $e("span", o, {
    state: z,
    ref: [a, v],
    props: [{
      children: w
    }, m],
    stateAttributesMapping: mA
  });
}), yA = /* @__PURE__ */ h.createContext(void 0), vA = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    store: i
  } = Uo(), u = Ye(i, Ve.mounted), f = Ye(i, Ve.forceMount);
  return u || f ? /* @__PURE__ */ b.jsx(yA.Provider, {
    value: !0,
    children: /* @__PURE__ */ b.jsx(tu, {
      ref: a,
      ...o
    })
  }) : null;
}), Ew = /* @__PURE__ */ h.createContext(void 0);
function Tw() {
  const n = h.useContext(Ew);
  if (!n)
    throw new Error(Ct(59));
  return n;
}
function Bc(n, o) {
  n && Object.assign(n.style, o);
}
const Rw = {
  position: "relative",
  maxHeight: "100%",
  overflowX: "hidden",
  overflowY: "auto"
}, bA = {
  position: "fixed"
}, xA = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    anchor: i,
    positionMethod: u = "absolute",
    className: f,
    render: p,
    side: g = "bottom",
    align: m = "center",
    sideOffset: d = 0,
    alignOffset: v = 0,
    collisionBoundary: x = "clipping-ancestors",
    collisionPadding: S,
    arrowPadding: C = 5,
    sticky: E = !1,
    disableAnchorTracking: M,
    alignItemWithTrigger: T = !0,
    collisionAvoidance: z = G0,
    style: w,
    ...N
  } = o, {
    store: A,
    listRef: L,
    labelsRef: D,
    alignItemWithTriggerActiveRef: _,
    selectedItemTextRef: j,
    valuesRef: V,
    initialValueRef: G,
    popupRef: ne,
    setValue: F
  } = Uo(), Q = vw(), Z = Ye(A, Ve.open), q = Ye(A, Ve.mounted), k = Ye(A, Ve.modal), P = Ye(A, Ve.value), I = Ye(A, Ve.openMethod), X = Ye(A, Ve.positionerElement), B = Ye(A, Ve.triggerElement), O = Ye(A, Ve.isItemEqualToValue), H = Ye(A, Ve.transitionStatus), ee = h.useRef(null), J = h.useRef(null), [le, ie] = h.useState(T), re = q && le && I !== "touch";
  !q && le !== T && ie(T), we(() => {
    q || (Ve.scrollUpArrowVisible(A.state) && A.set("scrollUpArrowVisible", !1), Ve.scrollDownArrowVisible(A.state) && A.set("scrollDownArrowVisible", !1));
  }, [A, q]), h.useImperativeHandle(_, () => re), mg((re || k) && Z, I === "touch", X, B);
  const se = yu({
    anchor: i,
    floatingRootContext: Q,
    positionMethod: u,
    mounted: q,
    side: g,
    sideOffset: d,
    align: m,
    alignOffset: v,
    arrowPadding: C,
    collisionBoundary: x,
    collisionPadding: S,
    sticky: E,
    disableAnchorTracking: M ?? re,
    collisionAvoidance: z,
    keepMounted: !0
  }), ge = re ? "none" : se.side, De = re ? bA : se.positionerStyles, Ee = {
    open: Z,
    side: ge,
    align: se.align,
    anchorHidden: se.anchorHidden
  };
  we(() => {
    A.set("popupSide", se.side);
  }, [A, se.side]);
  const ue = ze((Te) => {
    A.set("positionerElement", Te);
  }), he = bu(o, Ee, {
    styles: De,
    transitionStatus: H,
    props: N,
    refs: [a, ue],
    hidden: !q,
    inert: !Z
  }), ye = h.useRef(0), je = ze((Te) => {
    if (Te.size === 0 && ye.current === 0 || V.current.length === 0)
      return;
    const Ce = ye.current;
    if (ye.current = Te.size, Te.size === Ce)
      return;
    const ve = Pe(eo);
    if (Ce !== 0 && !A.state.multiple && P !== null && vi(V.current, P, O) === -1) {
      const Re = G.current, He = Re != null && vi(V.current, Re, O) !== -1 ? Re : null;
      F(He, ve), He === null && (A.set("selectedIndex", null), j.current = null);
    }
    if (Ce !== 0 && A.state.multiple && Array.isArray(P)) {
      const Se = (Oe) => vi(V.current, Oe, O) !== -1, Re = P.filter((Oe) => Se(Oe));
      (Re.length !== P.length || Re.some((Oe) => !oA(P, Oe, O))) && (F(Re, ve), Re.length === 0 && (A.set("selectedIndex", null), j.current = null));
    }
    if (Z && re) {
      A.update({
        scrollUpArrowVisible: !1,
        scrollDownArrowVisible: !1
      });
      const Se = {
        height: ""
      };
      Bc(X, Se), Bc(ne.current, Se);
    }
  }), ke = h.useMemo(() => ({
    ...se,
    side: ge,
    alignItemWithTriggerActive: re,
    setControlledAlignItemWithTrigger: ie,
    scrollUpArrowRef: ee,
    scrollDownArrowRef: J
  }), [se, ge, re, ie]);
  return /* @__PURE__ */ b.jsx(Hp, {
    elementsRef: L,
    labelsRef: D,
    onMapChange: je,
    children: /* @__PURE__ */ b.jsxs(Ew.Provider, {
      value: ke,
      children: [q && k && /* @__PURE__ */ b.jsx(vu, {
        inert: hu(!Z),
        cutout: B
      }), he]
    })
  });
}), ac = "base-ui-disable-scrollbar", Tp = {
  className: ac,
  getElement(n) {
    return /* @__PURE__ */ b.jsx("style", {
      nonce: n,
      href: ac,
      precedence: "base-ui:low",
      children: `.${ac}{scrollbar-width:none}.${ac}::-webkit-scrollbar{display:none}`
    });
  }
}, wA = /* @__PURE__ */ h.createContext(void 0), SA = {
  disableStyleElements: !1
};
function EA() {
  return h.useContext(wA) ?? SA;
}
const TA = {
  ...Lo,
  ...Ho
}, RA = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    finalFocus: p,
    ...g
  } = o, {
    store: m,
    popupRef: d,
    onOpenChangeComplete: v,
    setOpen: x,
    valueRef: S,
    firstItemTextRef: C,
    selectedItemTextRef: E,
    multiple: M,
    handleScrollArrowVisibility: T,
    scrollHandlerRef: z,
    listRef: w,
    highlightItemOnHover: N
  } = Uo(), {
    side: A,
    align: L,
    alignItemWithTriggerActive: D,
    isPositioned: _,
    setControlledAlignItemWithTrigger: j
  } = Tw(), V = eu() != null, G = vw(), ne = $c(), {
    nonce: F,
    disableStyleElements: Q
  } = EA(), Z = Ye(m, Ve.id), q = Ye(m, Ve.open), k = Ye(m, Ve.openMethod), P = Ye(m, Ve.mounted), I = Ye(m, Ve.popupProps), X = Ye(m, Ve.transitionStatus), B = Ye(m, Ve.triggerElement), O = Ye(m, Ve.positionerElement), H = Ye(m, Ve.listElement), ee = h.useRef(!1), J = h.useRef(!1), le = h.useRef({}), ie = ca(), re = ze((Ee) => {
    if (!O || !d.current || !J.current)
      return;
    if (ee.current || !D) {
      T();
      return;
    }
    const ue = O.style.top === "0px", he = O.style.bottom === "0px";
    if (!ue && !he) {
      T();
      return;
    }
    const ye = Nb(O), je = di(O.getBoundingClientRect().height, "y", ye), ke = nt(O), Te = At(O), Ce = Te.getComputedStyle(O), ve = parseFloat(Ce.marginTop), Se = parseFloat(Ce.marginBottom), Re = zb(Te.getComputedStyle(d.current)), Oe = Math.min(ke.documentElement.clientHeight - ve - Se, Re), He = Ee.scrollTop, ae = ic(Ee);
    let pe = 0, Le = null, be = !1, xe = !1;
    const et = (tt) => {
      O.style.height = `${tt}px`;
    }, rt = (tt, gt) => {
      const zt = fi(tt, 0, Oe - je);
      zt > 0 && et(je + zt), Ee.scrollTop = gt, Oe - (je + zt) <= Il && (ee.current = !0), T();
    }, pt = ue ? ae - He : He, Nt = Math.min(je + pt, Oe);
    if (pe = Nt, pt <= Il) {
      rt(pt, ue ? ae : 0);
      return;
    }
    if (Oe - Nt > Il)
      ue ? xe = !0 : Le = 0;
    else if (be = !0, he && He < ae) {
      const tt = je + pt - Oe;
      Le = He - (pt - tt);
    }
    if (pe = Math.ceil(pe), pe !== 0 && et(pe), xe || Le != null) {
      const tt = ic(Ee), gt = xe ? tt : fi(Le, 0, tt);
      Math.abs(Ee.scrollTop - gt) > Il && (Ee.scrollTop = gt);
    }
    (be || pe >= Oe - Il) && (ee.current = !0), T();
  });
  h.useImperativeHandle(z, () => re, [re]), no({
    open: q,
    ref: d,
    onComplete() {
      q && v?.(!0);
    }
  });
  const se = {
    open: q,
    transitionStatus: X,
    side: A,
    align: L
  };
  we(() => {
    !O || !d.current || Object.keys(le.current).length || (le.current = {
      top: O.style.top || "0",
      left: O.style.left || "0",
      right: O.style.right,
      height: O.style.height,
      bottom: O.style.bottom,
      minHeight: O.style.minHeight,
      maxHeight: O.style.maxHeight,
      marginTop: O.style.marginTop,
      marginBottom: O.style.marginBottom
    });
  }, [d, O]), we(() => {
    q || D || (J.current = !1, ee.current = !1, Bc(O, le.current));
  }, [q, D, O, d]), we(() => {
    const Ee = d.current;
    if (!q || !B || !O || !Ee || D && !_ || m.state.transitionStatus === "ending")
      return;
    if (!D) {
      J.current = !0, ie.request(T), Ee.style.removeProperty("--transform-origin");
      return;
    }
    const ue = CA(Ee);
    Ee.style.removeProperty("--transform-origin");
    try {
      let he = E.current;
      he?.isConnected || (he = !Ve.hasSelectedValue(m.state) && C.current?.isConnected ? C.current : null);
      const ye = S.current, je = At(O), ke = je.getComputedStyle(O), Te = je.getComputedStyle(Ee), Ce = nt(B), ve = Nb(B), Se = sc(B.getBoundingClientRect(), ve), Re = sc(O.getBoundingClientRect(), ve), Oe = Se.height, He = H || Ee, ae = He.scrollHeight, pe = parseFloat(Te.borderBottomWidth), Le = parseFloat(ke.marginTop) || 10, be = parseFloat(ke.marginBottom) || 10, xe = parseFloat(ke.minHeight) || 100, et = zb(Te), rt = 5, pt = 5, Nt = 20, tt = Ce.documentElement.clientHeight - Le - be, gt = Ce.documentElement.clientWidth, zt = tt - Se.bottom + Oe;
      let ht, An = ne === "rtl" ? Se.right - Re.width : Se.left, zn = 0;
      if (he && ye) {
        const qt = sc(ye.getBoundingClientRect(), ve);
        ht = sc(he.getBoundingClientRect(), ve), An = Re.left + (ne === "rtl" ? qt.right - ht.right : qt.left - ht.left);
        const Yn = qt.top - Se.top + qt.height / 2;
        zn = ht.top - Re.top + ht.height / 2 - Yn;
      }
      const Qe = zt + zn + be + pe;
      let ft = Math.min(tt, Qe);
      const Ut = tt - Le - be, _t = Qe - ft, Ht = gt - pt;
      O.style.left = `${fi(An, rt, Ht - Re.width)}px`, O.style.height = `${ft}px`, O.style.maxHeight = "none", O.style.marginTop = `${Le}px`, O.style.marginBottom = `${be}px`, Ee.style.height = "100%";
      const jt = ic(He), Gt = _t >= jt - Il;
      Gt && (ft = Math.min(tt, Re.height) - (_t - jt));
      const Sn = Se.top < Nt || Se.bottom > tt - Nt || Math.ceil(ft) + Il < Math.min(ae, xe), Nn = (je.visualViewport?.scale ?? 1) !== 1 && Do;
      if (Sn || Nn) {
        J.current = !0, Bc(O, le.current), j(!1);
        return;
      }
      const Pn = Math.max(xe, ft);
      if (Gt) {
        const qt = Math.max(0, tt - Qe);
        O.style.top = Re.height >= Ut ? "0" : `${qt}px`, O.style.height = `${ft}px`, He.scrollTop = ic(He);
      } else
        O.style.bottom = "0", He.scrollTop = _t;
      if (ht) {
        const qt = Re.top, Yn = Re.height, vl = ht.top + ht.height / 2, nl = Yn > 0 ? (vl - qt) / Yn * 100 : 50, bl = fi(nl, 0, 100);
        Ee.style.setProperty("--transform-origin", `50% ${bl}%`);
      }
      (Pn === tt || ft >= et) && (ee.current = !0), T(), N && m.state.selectedIndex === null && m.state.activeIndex === null && w.current[0] != null && m.set("activeIndex", 0), J.current = !0;
    } finally {
      ue();
    }
  }, [m, q, O, B, S, C, E, d, T, D, j, ie, H, w, N, ne, _]), h.useEffect(() => {
    if (!D || !O || !q)
      return;
    const Ee = At(O);
    function ue(he) {
      x(!1, Pe($T, he));
    }
    return Je(Ee, "resize", ue);
  }, [x, D, O, q]);
  const ge = {
    ...H ? {
      role: "presentation",
      "aria-orientation": void 0
    } : {
      role: "listbox",
      "aria-multiselectable": M || void 0,
      id: `${Z}-list`
    },
    onKeyDown(Ee) {
      V && Mi.has(Ee.key) && Ee.stopPropagation();
    },
    onScroll(Ee) {
      H || re(Ee.currentTarget);
    },
    ...D && {
      style: H ? {
        height: "100%"
      } : Rw
    }
  }, De = $e("div", o, {
    ref: [a, d],
    state: se,
    stateAttributesMapping: TA,
    props: [I, ge, Ni(X), {
      className: !H && D ? Tp.className : void 0
    }, g]
  });
  return /* @__PURE__ */ b.jsxs(h.Fragment, {
    children: [!Q && Tp.getElement(F), /* @__PURE__ */ b.jsx(nu, {
      context: G,
      modal: !1,
      disabled: !P,
      openInteractionType: k,
      returnFocus: p,
      restoreFocus: !0,
      children: De
    })]
  });
});
function zb(n) {
  const o = n.maxHeight || "";
  return o.endsWith("px") && parseFloat(o) || 1 / 0;
}
function ic(n) {
  return Sw(n.scrollHeight, n.clientHeight);
}
function Nb(n) {
  return ox.getScale(n);
}
function di(n, o, a) {
  return n / a[o];
}
function sc(n, o) {
  return wi({
    x: di(n.x, "x", o),
    y: di(n.y, "y", o),
    width: di(n.width, "x", o),
    height: di(n.height, "y", o)
  });
}
const jb = [["transform", "none"], ["scale", "1"], ["translate", "0 0"]];
function CA(n) {
  const {
    style: o
  } = n, a = {};
  for (const [i, u] of jb)
    a[i] = o.getPropertyValue(i), o.setProperty(i, u, "important");
  return () => {
    for (const [i] of jb) {
      const u = a[i];
      u ? o.setProperty(i, u) : o.removeProperty(i);
    }
  };
}
const OA = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    ...p
  } = o, {
    store: g,
    scrollHandlerRef: m
  } = Uo(), {
    alignItemWithTriggerActive: d
  } = Tw(), v = Ye(g, Ve.hasScrollArrows), x = Ye(g, Ve.openMethod), S = Ye(g, Ve.multiple), E = {
    id: `${Ye(g, Ve.id)}-list`,
    role: "listbox",
    "aria-multiselectable": S || void 0,
    onScroll(T) {
      m.current?.(T.currentTarget);
    },
    ...d && {
      style: Rw
    },
    className: v && x !== "touch" ? Tp.className : void 0
  }, M = ze((T) => {
    g.set("listElement", T);
  });
  return $e("div", o, {
    ref: [a, M],
    props: [E, p]
  });
}), Cw = /* @__PURE__ */ h.createContext(void 0);
function Tg() {
  const n = h.useContext(Cw);
  if (!n)
    throw new Error(Ct(57));
  return n;
}
const MA = /* @__PURE__ */ h.memo(/* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    value: p = null,
    label: g,
    disabled: m = !1,
    nativeButton: d = !1,
    ...v
  } = o, x = h.useRef(null), S = Ri({
    label: g,
    textRef: x,
    indexGuessBehavior: p0.GuessFromOrder
  }), {
    store: C,
    itemProps: E,
    setOpen: M,
    setValue: T,
    selectionRef: z,
    typingRef: w,
    valuesRef: N,
    multiple: A,
    selectedItemTextRef: L,
    disabled: D,
    readOnly: _
  } = Uo(), j = Ye(C, Ve.isActive, S.index), V = Ye(C, Ve.open), G = Ye(C, Ve.isSelected, p), ne = Ye(C, Ve.isSelectedByFocus, S.index), F = Ye(C, Ve.isItemEqualToValue), Q = S.index, Z = Q !== -1, q = h.useRef(null);
  we(() => {
    if (!Z)
      return;
    const re = N.current;
    return re[Q] = p, () => {
      delete re[Q];
    };
  }, [Z, Q, p, N]), we(() => {
    if (!Z)
      return;
    const re = C.state.value;
    let se = re;
    A && Array.isArray(re) && (se = re.length > 0 ? re[re.length - 1] : void 0), se !== void 0 && dr(p, se, F) && (C.set("selectedIndex", Q), x.current && (L.current = x.current));
  }, [Z, Q, A, F, C, p, L]);
  const k = h.useRef(null), P = h.useRef("mouse"), I = h.useRef(!1), {
    getButtonProps: X,
    buttonRef: B
  } = $l({
    disabled: m,
    focusableWhenDisabled: !0,
    native: d,
    composite: !0
  }), O = {
    disabled: m,
    selected: G,
    highlighted: j
  };
  function H(re) {
    if (D || _)
      return;
    const se = C.state.value;
    if (A) {
      const ge = Array.isArray(se) ? se : [], De = G ? rA(ge, p, F) : [...ge, p];
      T(De, Pe(na, re));
    } else
      T(p, Pe(na, re)), M(!1, Pe(na, re));
  }
  function ee() {
    z.current.dragY = 0;
  }
  const J = {
    role: "option",
    "aria-selected": G,
    tabIndex: V && j ? 0 : -1,
    onKeyDown(re) {
      k.current = re.key, C.set("activeIndex", Q), re.key === " " && w.current && re.preventDefault();
    },
    onClick(re) {
      const se = re.type === "click" && P.current !== "touch", ge = re.nativeEvent.pointerType, De = se && Ip(re.nativeEvent) && // Generic no-pointer `detail === 0` clicks stay tied to highlight state. Virtual
      // clicks that carry browser pointer data, including an empty string from assistive
      // technology, can activate unhighlighted items.
      (ge !== void 0 || j), Ee = se && !De && !I.current;
      I.current = !1, !(re.type === "keydown" && k.current === null) && (m || re.type === "keydown" && k.current === " " && w.current || Ee || (k.current = null, H(re.nativeEvent)));
    },
    onPointerEnter(re) {
      P.current = re.pointerType;
    },
    onPointerMove(re) {
      if (re.pointerType === "mouse" && re.buttons === 1) {
        const se = z.current;
        se.dragY += re.movementY, se.dragY ** 2 >= 64 && (se.allowUnselectedMouseUp = !0);
      }
    },
    onPointerDown(re) {
      P.current = re.pointerType, I.current = !0, ee();
    },
    onMouseUp() {
      if (ee(), m || P.current === "touch" || I.current)
        return;
      const re = !z.current.allowSelectedMouseUp && G, se = !z.current.allowUnselectedMouseUp && !G;
      re || se || (I.current = !0, q.current?.click(), I.current = !1);
    }
  }, le = $e("div", o, {
    ref: [B, a, S.ref, q],
    state: O,
    props: [E, J, v, X]
  }), ie = h.useMemo(() => ({
    selected: G,
    index: Q,
    textRef: x,
    selectedByFocus: ne,
    hasRegistered: Z
  }), [G, Q, x, ne, Z]);
  return /* @__PURE__ */ b.jsx(Cw.Provider, {
    value: ie,
    children: le
  });
})), AA = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const i = o.keepMounted ?? !1, {
    selected: u
  } = Tg();
  return i || u ? /* @__PURE__ */ b.jsx(zA, {
    ...o,
    ref: a
  }) : null;
}), zA = /* @__PURE__ */ h.memo(/* @__PURE__ */ h.forwardRef((n, o) => {
  const {
    render: a,
    className: i,
    style: u,
    keepMounted: f,
    ...p
  } = n, {
    selected: g
  } = Tg(), m = h.useRef(null), {
    transitionStatus: d,
    setMounted: v
  } = au(g), S = $e("span", n, {
    ref: [o, m],
    state: {
      selected: g,
      transitionStatus: d
    },
    props: [{
      "aria-hidden": !0,
      children: "✔️"
    }, p],
    stateAttributesMapping: Ho
  });
  return no({
    open: g,
    ref: m,
    onComplete() {
      g || v(!1);
    }
  }), S;
})), NA = /* @__PURE__ */ h.memo(/* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    index: i,
    textRef: u,
    selectedByFocus: f,
    hasRegistered: p
  } = Tg(), {
    firstItemTextRef: g,
    selectedItemTextRef: m
  } = Uo(), {
    render: d,
    className: v,
    style: x,
    ...S
  } = o, C = h.useCallback((M) => {
    M && (p && i === 0 && (g.current = M), p && f && (m.current = M));
  }, [g, m, i, f, p]);
  return $e("div", o, {
    ref: [C, a, u],
    props: S
  });
})), jA = /* @__PURE__ */ h.createContext(void 0), DA = /* @__PURE__ */ h.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    ...p
  } = o, [g, m] = h.useState(), d = h.useMemo(() => ({
    labelId: g,
    setLabelId: m
  }), [g, m]), v = $e("div", o, {
    ref: a,
    props: [{
      role: "group",
      "aria-labelledby": g
    }, p]
  });
  return /* @__PURE__ */ b.jsx(jA.Provider, {
    value: d,
    children: v
  });
});
function cc({ ...n }) {
  return /* @__PURE__ */ b.jsx(uA, { "data-slot": "select", ...n });
}
function uc({ ...n }) {
  return /* @__PURE__ */ b.jsx(DA, { "data-slot": "select-group", ...n });
}
function fc({ ...n }) {
  return /* @__PURE__ */ b.jsx(hA, { "data-slot": "select-value", ...n });
}
function dc({
  className: n,
  size: o = "default",
  children: a,
  ...i
}) {
  return /* @__PURE__ */ b.jsx(
    gA,
    {
      "data-slot": "select-trigger",
      "data-size": o,
      className: Fe(
        "tw:flex tw:w-full tw:items-center tw:justify-between tw:gap-2 tw:rounded-[var(--radius-control)] tw:border tw:border-input tw:bg-background tw:text-[length:var(--fs-body-s)] tw:text-foreground tw:whitespace-nowrap tw:outline-none tw:focus-visible:border-ring tw:focus-visible:ring-2 tw:focus-visible:ring-ring/40 tw:disabled:cursor-not-allowed tw:disabled:opacity-50 tw:data-[size=default]:h-8 tw:data-[size=sm]:h-7 tw:data-[size=default]:px-2.5 tw:data-[size=sm]:px-2 tw:data-[placeholder]:text-muted-foreground",
        n
      ),
      ...i,
      children: a
    }
  );
}
function pc({
  className: n,
  children: o,
  portalContainer: a,
  positionerClassName: i,
  side: u,
  align: f,
  alignItemWithTrigger: p,
  sideOffset: g = 4,
  alignOffset: m,
  ...d
}) {
  return /* @__PURE__ */ b.jsx(vA, { container: a, children: /* @__PURE__ */ b.jsx(
    xA,
    {
      side: u,
      align: f,
      alignItemWithTrigger: p,
      sideOffset: g,
      alignOffset: m,
      className: Fe("tw:z-[var(--z-popover)]", i),
      children: /* @__PURE__ */ b.jsx(
        RA,
        {
          "data-slot": "select-content",
          className: Fe(
            "tw:min-w-(--anchor-width) tw:max-h-(--available-height) tw:origin-(--transform-origin) tw:overflow-x-hidden tw:overflow-y-auto tw:rounded-[var(--radius-control)] tw:border tw:border-border tw:bg-popover tw:p-1 tw:text-[length:var(--fs-body-s)] tw:text-popover-foreground tw:shadow-[var(--elevation-overlay)] tw:outline-none",
            n
          ),
          ...d,
          children: /* @__PURE__ */ b.jsx(OA, { className: "tw:flex tw:flex-col tw:gap-0.5", children: o })
        }
      )
    }
  ) });
}
function ea({ className: n, children: o, ...a }) {
  return /* @__PURE__ */ b.jsxs(
    MA,
    {
      "data-slot": "select-item",
      className: Fe(
        "tw:relative tw:flex tw:w-full tw:cursor-default tw:items-center tw:gap-2 tw:rounded-[var(--radius-control)] tw:py-1.5 tw:pr-8 tw:pl-2 tw:text-[length:var(--fs-body-s)] tw:outline-none tw:select-none tw:data-highlighted:bg-accent tw:data-highlighted:text-accent-foreground tw:data-disabled:pointer-events-none tw:data-disabled:opacity-50",
        n
      ),
      ...a,
      children: [
        /* @__PURE__ */ b.jsx("span", { className: "tw:absolute tw:right-2 tw:flex tw:size-3.5 tw:items-center tw:justify-center", "aria-hidden": "true", children: /* @__PURE__ */ b.jsx(AA, { children: /* @__PURE__ */ b.jsx(Hb, { "data-icon": "select-check" }) }) }),
        /* @__PURE__ */ b.jsx(NA, { "data-slot": "select-item-text", children: o })
      ]
    }
  );
}
function kA(n) {
  const o = h.useContext(lw) ? "drawer" : "dialog";
  return rw(n, o);
}
function _A({ ...n }) {
  return /* @__PURE__ */ b.jsx(kA, { "data-slot": "sheet", ...n });
}
function HA({ ...n }) {
  return /* @__PURE__ */ b.jsx(fw, { "data-slot": "sheet-portal", ...n });
}
function LA({ className: n, ...o }) {
  return /* @__PURE__ */ b.jsx(
    aw,
    {
      "data-slot": "sheet-overlay",
      className: Fe(
        "tw:fixed tw:inset-0 tw:z-[var(--z-modal)] tw:bg-[var(--scrim)] tw:duration-[var(--motion-panel)] tw:supports-backdrop-filter:backdrop-blur-xs",
        n
      ),
      ...o
    }
  );
}
function UA({
  className: n,
  children: o,
  side: a = "right",
  layer: i = "modal",
  showCloseButton: u = !0,
  showOverlay: f = !0,
  ...p
}) {
  return /* @__PURE__ */ b.jsxs(HA, { children: [
    f && /* @__PURE__ */ b.jsx(LA, {}),
    /* @__PURE__ */ b.jsxs(
      uw,
      {
        "data-slot": "sheet-content",
        "data-side": a,
        "data-layer": i,
        className: Fe(
          "tw:fixed tw:flex tw:flex-col tw:gap-4 tw:bg-popover tw:bg-clip-padding tw:text-[length:var(--fs-body-s)] tw:text-popover-foreground tw:shadow-[var(--elevation-overlay)] tw:transition-[opacity,transform] tw:duration-[var(--motion-panel)] tw:ease-[var(--ease-out)] tw:data-[layer=panel]:z-[var(--z-sticky)] tw:data-[layer=modal]:z-[var(--z-modal)] tw:data-[side=bottom]:inset-x-0 tw:data-[side=bottom]:bottom-0 tw:data-[side=bottom]:h-auto tw:data-[side=bottom]:border-t tw:data-[side=bottom]:data-ending-style:translate-y-full tw:data-[side=bottom]:data-starting-style:translate-y-full tw:data-[side=left]:inset-y-0 tw:data-[side=left]:left-0 tw:data-[side=left]:h-full tw:data-[side=left]:w-3/4 tw:data-[side=left]:border-r tw:data-[side=left]:data-ending-style:-translate-x-full tw:data-[side=left]:data-starting-style:-translate-x-full tw:data-[side=right]:inset-y-0 tw:data-[side=right]:right-0 tw:data-[side=right]:h-full tw:data-[side=right]:w-3/4 tw:data-[side=right]:border-l tw:data-[side=right]:data-ending-style:translate-x-full tw:data-[side=right]:data-starting-style:translate-x-full tw:data-[side=top]:inset-x-0 tw:data-[side=top]:top-0 tw:data-[side=top]:h-auto tw:data-[side=top]:border-b tw:data-[side=top]:data-ending-style:-translate-y-full tw:data-[side=top]:data-starting-style:-translate-y-full tw:data-[side=left]:sm:max-w-sm tw:data-[side=right]:sm:max-w-sm",
          n
        ),
        ...p,
        children: [
          o,
          u && /* @__PURE__ */ b.jsxs(
            iw,
            {
              "data-slot": "sheet-close",
              render: /* @__PURE__ */ b.jsx(
                Vt,
                {
                  variant: "ghost",
                  className: "tw:absolute tw:top-3 tw:right-3",
                  size: "icon-sm"
                }
              ),
              children: [
                /* @__PURE__ */ b.jsx(np, {}),
                /* @__PURE__ */ b.jsx("span", { className: "tw:sr-only", children: "Close" })
              ]
            }
          )
        ]
      }
    )
  ] });
}
function BA({ className: n, ...o }) {
  return /* @__PURE__ */ b.jsx(
    "div",
    {
      "data-slot": "sheet-header",
      className: Fe("tw:flex tw:flex-col tw:gap-0.5 tw:p-4", n),
      ...o
    }
  );
}
function IA({ className: n, ...o }) {
  return /* @__PURE__ */ b.jsx(
    dw,
    {
      "data-slot": "sheet-title",
      className: Fe(
        "tw:text-[length:var(--fs-title)] tw:font-medium tw:text-foreground",
        n
      ),
      ...o
    }
  );
}
function VA({
  className: n,
  ...o
}) {
  return /* @__PURE__ */ b.jsx(
    sw,
    {
      "data-slot": "sheet-description",
      className: Fe("tw:text-[length:var(--fs-body-s)] tw:text-muted-foreground", n),
      ...o
    }
  );
}
const bt = (n) => document.getElementById(n);
function Db() {
  const [n, o] = h.useState(null), a = h.useRef(null);
  if (h.useEffect(() => {
    if (window.parent === window) return;
    const u = (f) => {
      if (f.source !== window.parent || f.data?.type !== "atelier-folder-state" || a.current !== null && f.origin !== a.current) return;
      const p = f.data.state;
      !p || !Array.isArray(p.folders) || typeof p.selected != "string" || typeof p.label != "string" || typeof p.manageLabel != "string" || !p.folders.every((g) => g && typeof g.path == "string" && typeof g.name == "string") || (a.current = f.origin, o(p));
    };
    return window.addEventListener("message", u), window.parent.postMessage({ type: "atelier-folder-ready" }, "*"), () => window.removeEventListener("message", u);
  }, []), !n) return null;
  const i = (u) => {
    a.current && window.parent.postMessage(u, a.current === "null" ? "*" : a.current);
  };
  return /* @__PURE__ */ b.jsx(c2, { state: n, onSelect: (u) => i({ type: "atelier-folder-select", path: u }), onManage: () => i({ type: "atelier-folder-manage" }) });
}
function ar(n) {
  bt(n)?.click();
}
function PA(n) {
  const o = bt(n);
  return o ? [...o.options].map((a) => ({ value: a.value, label: a.text })) : [];
}
function Ow(n, o) {
  const a = bt(n);
  a && (a.value = o, a.dispatchEvent(new Event("change", { bubbles: !0 })));
}
function wc(n, o) {
  return [...document.querySelectorAll(`#${n} ${o}`)].map((a, i) => ({
    key: a.dataset.pick ?? a.dataset.wfpick ?? a.dataset.rec ?? a.dataset.cat ?? a.dataset.fmt ?? String(i),
    label: (a instanceof HTMLInputElement ? a.closest("label")?.textContent : a.textContent)?.replace(/\s+/g, " ").trim() || "Option",
    active: a instanceof HTMLInputElement && a.checked || a.classList.contains("on") || a.closest(".mi")?.classList.contains("on") === !0,
    element: a
  }));
}
function Sc(n) {
  return n.replace(/\s+\d+$/, "").trim();
}
function YA({ state: n, folder: o, collectionItems: a }) {
  const [i, u] = h.useState(!1), [f, p] = h.useState(""), [g, m] = h.useState(!1), [d, v] = h.useState(""), x = window.__galleryFileTypes, S = n.types.filter((w) => w.active).map((w) => w.key), C = { "": "Tous", draft: "Brouillon", candidate: "Candidat", final: "Final", rejected: "Rejeté" }, E = wc("wfMenu", "[data-wfpick]").map((w) => ({ ...w, label: C[w.key] ?? Sc(w.label) })), M = PA("folder"), T = n.presets.find((w) => w.active && w.custom) ?? n.presets.find((w) => w.active), z = () => {
    d.trim() && (x?.savePreset(d.trim()), m(!1), v(""));
  };
  return /* @__PURE__ */ b.jsxs(b.Fragment, { children: [
    /* @__PURE__ */ b.jsxs(pM, { className: "gallery-filter-panel-head", children: [
      /* @__PURE__ */ b.jsx(hg, { children: "Filtres" }),
      /* @__PURE__ */ b.jsx(Vt, { variant: "ghost", size: "xs", onClick: () => x?.resetFilters(), children: "Réinitialiser" })
    ] }),
    /* @__PURE__ */ b.jsx(Ax, { className: "tw:sr-only", children: "Formats, collections et statut des fichiers" }),
    /* @__PURE__ */ b.jsxs("div", { className: "gallery-filter-scroll gallery-compact-filters", "data-gallery-file-type-panel": !0, children: [
      /* @__PURE__ */ b.jsxs("div", { className: "gallery-filter-field", children: [
        /* @__PURE__ */ b.jsx("span", { children: "Vue enregistrée" }),
        /* @__PURE__ */ b.jsxs(cc, { modal: !1, value: T?.id ?? "custom", onValueChange: (w) => {
          typeof w == "string" && w !== "custom" && x?.applyPreset(w);
        }, children: [
          /* @__PURE__ */ b.jsx(dc, { size: "sm", "aria-label": "Vue enregistrée", children: /* @__PURE__ */ b.jsx(fc, { children: T?.label || "Personnalisée" }) }),
          /* @__PURE__ */ b.jsx(pc, { className: "gallery-filter-select", align: "end", alignItemWithTrigger: !1, sideOffset: 5, children: /* @__PURE__ */ b.jsxs(uc, { children: [
            /* @__PURE__ */ b.jsx(ea, { value: "custom", children: "Personnalisée" }),
            n.presets.map((w) => /* @__PURE__ */ b.jsx(ea, { value: w.id, children: w.label }, w.id))
          ] }) })
        ] })
      ] }),
      /* @__PURE__ */ b.jsxs("div", { className: "gallery-format-heading", children: [
        /* @__PURE__ */ b.jsx("span", { children: "Formats" }),
        /* @__PURE__ */ b.jsx(Vt, { variant: "ghost", size: "xs", "aria-expanded": i, onClick: () => u(!i), children: i ? "Moins" : "Plus…" })
      ] }),
      /* @__PURE__ */ b.jsx(oa, { multiple: !0, value: S, onValueChange: (w) => {
        const N = n.types.filter((A) => i || n.pinned.includes(A.key)).map((A) => A.key);
        x?.setActive([...S.filter((A) => !N.includes(A)), ...w.filter((A) => N.includes(A))]);
      }, className: "gallery-format-chips", "aria-label": "Formats de fichiers", children: n.types.filter((w) => (i || n.pinned.includes(w.key)) && (!f || w.label.toLowerCase().includes(f.toLowerCase()))).map((w) => /* @__PURE__ */ b.jsx(Pl, { value: w.key, size: "sm", "data-gallery-quick-type": w.key, "data-gallery-file-type": w.key, children: w.label }, w.key)) }),
      i && /* @__PURE__ */ b.jsxs(b.Fragment, { children: [
        /* @__PURE__ */ b.jsx(xp, { children: /* @__PURE__ */ b.jsx(Sp, { "aria-label": "Rechercher un format", placeholder: "Rechercher un format…", value: f, onChange: (w) => p(w.target.value) }) }),
        /* @__PURE__ */ b.jsxs("details", { className: "gallery-pin-types", children: [
          /* @__PURE__ */ b.jsx("summary", { children: "Formats épinglés" }),
          /* @__PURE__ */ b.jsx(oa, { multiple: !0, value: n.pinned, onValueChange: (w) => x?.setPinned(w), className: "gallery-format-chips", "aria-label": "Formats épinglés", children: n.types.map((w) => /* @__PURE__ */ b.jsxs(Pl, { value: w.key, size: "xs", children: [
            /* @__PURE__ */ b.jsx(Bb, {}),
            w.label
          ] }, w.key)) })
        ] })
      ] }),
      /* @__PURE__ */ b.jsxs("div", { className: "gallery-filter-field", children: [
        /* @__PURE__ */ b.jsx("span", { children: "Favoris seulement" }),
        /* @__PURE__ */ b.jsx(tA, { "aria-label": "Favoris seulement", checked: bt("favChip")?.classList.contains("on") === !0, onCheckedChange: () => ar("favChip") })
      ] }),
      /* @__PURE__ */ b.jsxs("div", { className: "gallery-filter-field", children: [
        /* @__PURE__ */ b.jsx("span", { children: "Statut" }),
        /* @__PURE__ */ b.jsxs(cc, { modal: !1, value: E.find((w) => w.active)?.key || "", onValueChange: (w) => E.find((N) => N.key === w)?.element.click(), children: [
          /* @__PURE__ */ b.jsx(dc, { size: "sm", "aria-label": "Filtrer par statut", children: /* @__PURE__ */ b.jsx(fc, { children: E.find((w) => w.active)?.label || "Tous" }) }),
          /* @__PURE__ */ b.jsx(pc, { className: "gallery-filter-select", align: "end", alignItemWithTrigger: !1, sideOffset: 5, children: /* @__PURE__ */ b.jsx(uc, { children: E.map((w) => /* @__PURE__ */ b.jsx(ea, { value: w.key, children: w.label }, w.key)) }) })
        ] })
      ] }),
      /* @__PURE__ */ b.jsxs("div", { className: "gallery-filter-field", children: [
        /* @__PURE__ */ b.jsx("span", { children: "Collection" }),
        /* @__PURE__ */ b.jsxs(cc, { modal: !1, value: a.find((w) => w.active)?.key || "", onValueChange: (w) => {
          w ? a.find((N) => N.key === w)?.element.click() : bt("collMenu")?.querySelector("[data-clear]")?.click();
        }, children: [
          /* @__PURE__ */ b.jsx(dc, { size: "sm", "aria-label": "Filtrer par collection", children: /* @__PURE__ */ b.jsx(fc, { children: Sc(a.find((w) => w.active)?.label || "Toutes") }) }),
          /* @__PURE__ */ b.jsx(pc, { className: "gallery-filter-select", align: "end", alignItemWithTrigger: !1, sideOffset: 5, children: /* @__PURE__ */ b.jsxs(uc, { children: [
            /* @__PURE__ */ b.jsx(ea, { value: "", children: "Toutes" }),
            a.map((w) => /* @__PURE__ */ b.jsx(ea, { value: w.key, children: Sc(w.label) }, w.key))
          ] }) })
        ] })
      ] }),
      M.length > 1 && /* @__PURE__ */ b.jsxs("div", { className: "gallery-filter-field", children: [
        /* @__PURE__ */ b.jsx("span", { children: "Sous-dossier" }),
        /* @__PURE__ */ b.jsxs(cc, { modal: !1, value: o?.value || "", onValueChange: (w) => Ow("folder", typeof w == "string" ? w : ""), children: [
          /* @__PURE__ */ b.jsx(dc, { size: "sm", "aria-label": "Filtrer par sous-dossier", children: /* @__PURE__ */ b.jsx(fc, { children: o?.value || "Tous" }) }),
          /* @__PURE__ */ b.jsx(pc, { className: "gallery-filter-select", align: "end", alignItemWithTrigger: !1, sideOffset: 5, children: /* @__PURE__ */ b.jsx(uc, { children: M.map((w) => /* @__PURE__ */ b.jsx(ea, { value: w.value, children: w.value ? w.label : "Tous" }, w.value)) }) })
        ] })
      ] }),
      /* @__PURE__ */ b.jsx(nA, {}),
      g ? /* @__PURE__ */ b.jsxs(xp, { children: [
        /* @__PURE__ */ b.jsx(Sp, { "aria-label": "Nom de la vue", placeholder: "Nom de la vue…", value: d, onChange: (w) => v(w.target.value), onKeyDown: (w) => {
          w.key === "Enter" && z(), w.key === "Escape" && (w.stopPropagation(), m(!1));
        }, autoFocus: !0 }),
        /* @__PURE__ */ b.jsx(wp, { align: "inline-end", children: /* @__PURE__ */ b.jsx(pw, { disabled: !d.trim(), onClick: z, children: "Enregistrer" }) })
      ] }) : /* @__PURE__ */ b.jsxs(Vt, { variant: "ghost", size: "sm", className: "tw:justify-start", "data-gallery-new-preset": !0, onClick: () => m(!0), children: [
        /* @__PURE__ */ b.jsx(mE, {}),
        "Enregistrer cette vue…"
      ] }),
      T?.custom && /* @__PURE__ */ b.jsxs(Vt, { variant: "ghost", size: "xs", onClick: () => x?.removePreset(T.id), children: [
        /* @__PURE__ */ b.jsx(Rp, {}),
        "Supprimer cette vue"
      ] })
    ] })
  ] });
}
function GA(n) {
  const o = n.message.match(/^Move to Trash\?\s+(.+)$/);
  if (o) {
    const i = o[1], u = i.split("/"), f = u.pop() || i, p = u.join("/");
    return {
      title: `Move “${f}” to Trash?`,
      description: p ? `This removes it from ${p}. You can recover it from Trash.` : "This removes it from the project. You can recover it from Trash.",
      acceptLabel: "Move to Trash",
      destructive: !0
    };
  }
  const a = n.message.match(/^(\d+) file\(s\) → trash\?$/);
  if (a) {
    const i = Number(a[1]);
    return {
      title: `Move ${i} ${i === 1 ? "file" : "files"} to Trash?`,
      description: `${i === 1 ? "This file" : "These files"} will be removed from the project. You can recover ${i === 1 ? "it" : "them"} from Trash.`,
      acceptLabel: "Move to Trash",
      destructive: !0
    };
  }
  return {
    title: n.message,
    acceptLabel: n.acceptLabel,
    destructive: ["Delete", "Discard", "Supprimer"].includes(n.acceptLabel)
  };
}
function qA() {
  const [, n] = h.useReducer((j) => j + 1, 0), o = h.useRef(!1), a = h.useRef(null), i = h.useRef(null), [u, f] = h.useState(!1), [p, g] = h.useState(!1), m = bt("q")?.value ?? "", d = bt("sort"), v = bt("folder"), x = bt("favChip"), S = bt("rescan")?.classList.contains("spinning") === !0, C = wc("collMenu", "[data-pick]"), E = wc("recMenu", "[data-rec]"), M = window.__galleryFileTypes?.getState() ?? {
    projectName: "this project",
    types: wc("fmtMenu", "input[data-fmt]").map((j) => ({
      key: j.key,
      label: Sc(j.label),
      active: j.active,
      pinned: !1
    })),
    pinned: [],
    presets: [],
    summary: "File types"
  }, T = window.__gallerySelection?.getState() ?? { rels: [], imageCount: 0 }, z = document.querySelectorAll("#activeChips [data-fx]").length, w = x?.classList.contains("on") === !0, N = d?.value ?? "mtime", A = N.replace(/_(asc|desc)$/, ""), L = N.endsWith("_desc") || ["size", "mtime", "btime", "rating"].includes(A) && !N.endsWith("_asc"), D = (j, V) => Ow("sort", ["size", "mtime", "btime", "rating"].includes(j) ? j + (V ? "" : "_asc") : j + (V ? "_desc" : ""));
  h.useEffect(() => {
    const j = () => n(), V = new MutationObserver(j);
    [
      bt("activeChips"),
      bt("densitySeg"),
      bt("favChip"),
      bt("rescan"),
      bt("fmtMenu"),
      bt("collMenu"),
      bt("wfMenu"),
      bt("recMenu"),
      bt("selBar")
    ].filter((F) => !!F).forEach((F) => V.observe(F, {
      attributes: !0,
      childList: !0,
      characterData: !0,
      subtree: !0
    }));
    const ne = [bt("q"), bt("sort"), bt("folder")].filter((F) => !!F);
    return ne.forEach((F) => {
      F.addEventListener("input", j), F.addEventListener("change", j);
    }), window.addEventListener("atelier-gallery-file-types-change", j), window.addEventListener("atelier-gallery-selection-change", j), document.documentElement.classList.add("gallery-react-mounted"), document.documentElement.dataset.galleryUi = "shadcn-react-v1", () => {
      V.disconnect(), ne.forEach((F) => {
        F.removeEventListener("input", j), F.removeEventListener("change", j);
      }), window.removeEventListener("atelier-gallery-file-types-change", j), window.removeEventListener("atelier-gallery-selection-change", j), document.documentElement.classList.remove("gallery-react-mounted");
    };
  }, []), h.useEffect(() => {
    T.rels.length && (f(!1), g(!1));
  }, [T.rels.length]), h.useEffect(() => {
    if (!p) return;
    const j = (V) => {
      if (V.key !== "Escape") {
        o.current = !1;
        return;
      }
      if ([...document.querySelectorAll('[role="menu"], [role="listbox"]:not(#grid)')].some((G) => G.getClientRects().length > 0)) {
        o.current = !0;
        return;
      }
      o.current = !1, V.preventDefault(), V.stopPropagation(), g(!1), requestAnimationFrame(() => a.current?.focus());
    };
    return window.addEventListener("keydown", j, !0), () => window.removeEventListener("keydown", j, !0);
  }, [p]), h.useEffect(() => {
    const j = (V) => {
      const G = V.target, ne = G?.matches("input, textarea, select") || G?.isContentEditable;
      V.key !== "/" || V.metaKey || V.ctrlKey || V.altKey || ne || (V.preventDefault(), g(!1), f(!0));
    };
    return document.addEventListener("keydown", j), () => document.removeEventListener("keydown", j);
  }, []);
  const _ = (j) => {
    const V = bt("q");
    V && (V.value = j, V.dispatchEvent(new Event("input", { bubbles: !0 })));
  };
  if (T.rels.length) {
    const j = window.__gallerySelection;
    return /* @__PURE__ */ b.jsxs("div", { className: "gallery-command-bar gallery-selection-command-bar", role: "toolbar", "aria-label": "Selected files actions", "data-gallery-toolbar-state": "selection", children: [
      /* @__PURE__ */ b.jsx(Db, {}),
      /* @__PURE__ */ b.jsxs("div", { className: "gallery-selection-count", "aria-live": "polite", children: [
        /* @__PURE__ */ b.jsx(TE, { "aria-hidden": "true" }),
        /* @__PURE__ */ b.jsxs("span", { children: [
          T.rels.length,
          /* @__PURE__ */ b.jsx("span", { className: "gallery-selection-word", children: " selected" })
        ] })
      ] }),
      /* @__PURE__ */ b.jsx("div", { className: "gallery-command-spacer" }),
      /* @__PURE__ */ b.jsx(Sb, {}),
      T.rels.length === 1 && /* @__PURE__ */ b.jsx(Vt, { className: "gallery-selection-inline", variant: "outline", size: "sm", "data-gallery-selection-action": "open", onClick: () => j?.open(), children: "Open" }),
      T.imageCount >= 2 && /* @__PURE__ */ b.jsx(Vt, { className: "gallery-selection-inline", variant: "outline", size: "sm", "data-gallery-selection-action": "compare", onClick: () => j?.compare(), children: "Compare" }),
      /* @__PURE__ */ b.jsx(Vt, { className: "gallery-selection-inline", variant: "outline", size: "sm", "data-gallery-selection-action": "collect", onClick: (V) => {
        V.stopPropagation(), j?.collect(V.currentTarget);
      }, children: "Collect" }),
      /* @__PURE__ */ b.jsxs(Vt, { className: "gallery-selection-inline", variant: "outline", size: "sm", "data-gallery-selection-action": "export", onClick: (V) => {
        V.stopPropagation(), j?.export(V.currentTarget);
      }, children: [
        "Export ",
        /* @__PURE__ */ b.jsx(Lb, { "data-icon": "inline-end" })
      ] }),
      /* @__PURE__ */ b.jsxs(vc, { modal: !1, children: [
        /* @__PURE__ */ b.jsx(bc, { render: /* @__PURE__ */ b.jsx(Vt, { ref: i, variant: "ghost", size: "icon-sm", "aria-label": "More selection actions", children: /* @__PURE__ */ b.jsx(xv, {}) }) }),
        /* @__PURE__ */ b.jsxs(yi, { align: "end", className: "tw:w-48", children: [
          /* @__PURE__ */ b.jsxs(Bn, { className: "gallery-selection-overflow", children: [
            T.rels.length === 1 && /* @__PURE__ */ b.jsx(al, { onClick: () => j?.open(), children: "Open" }),
            T.imageCount >= 2 && /* @__PURE__ */ b.jsx(al, { onClick: () => j?.compare(), children: "Compare" }),
            /* @__PURE__ */ b.jsx(al, { onClick: (V) => {
              V.stopPropagation(), i.current && j?.collect(i.current);
            }, children: "Collect" }),
            /* @__PURE__ */ b.jsx(al, { onClick: (V) => {
              V.stopPropagation(), i.current && j?.export(i.current);
            }, children: "Export" })
          ] }),
          /* @__PURE__ */ b.jsx(rr, { className: "gallery-selection-overflow" }),
          /* @__PURE__ */ b.jsx(Bn, { children: /* @__PURE__ */ b.jsx(al, { onClick: () => j?.hide(), children: "Hide selected" }) }),
          /* @__PURE__ */ b.jsx(rr, {}),
          /* @__PURE__ */ b.jsx(Bn, { children: /* @__PURE__ */ b.jsxs(al, { variant: "destructive", onClick: () => j?.delete(), children: [
            /* @__PURE__ */ b.jsx(Rp, { "data-icon": "inline-start" }),
            " Move to Trash"
          ] }) })
        ] })
      ] }),
      /* @__PURE__ */ b.jsx(Vl, { label: "Clear selection (Esc)", children: /* @__PURE__ */ b.jsx(Vt, { variant: "ghost", size: "icon-sm", "aria-label": "Clear selection", "data-gallery-selection-action": "clear", onClick: () => j?.clear(), children: /* @__PURE__ */ b.jsx(np, {}) }) })
    ] });
  }
  return /* @__PURE__ */ b.jsxs("div", { className: "gallery-command-bar", role: "toolbar", "aria-label": "Gallery commands", "data-gallery-toolbar-state": "normal", children: [
    /* @__PURE__ */ b.jsx(Db, {}),
    /* @__PURE__ */ b.jsxs("div", { className: "gallery-command-group", "data-gallery-group": "filter", role: "group", "aria-label": "Search and filter gallery", children: [
      /* @__PURE__ */ b.jsxs(hp, { open: u, onOpenChange: (j) => {
        f(j), j && g(!1);
      }, children: [
        /* @__PURE__ */ b.jsx(Vl, { label: m ? "Modifier la recherche" : "Rechercher (/)", children: /* @__PURE__ */ b.jsx(
          yp,
          {
            render: /* @__PURE__ */ b.jsx(
              Vt,
              {
                variant: "ghost",
                size: "icon-sm",
                "data-gallery-command": "search-trigger",
                "data-gallery-active": m ? "true" : void 0,
                "aria-label": m ? `Rechercher: ${m}` : "Rechercher",
                "aria-pressed": u,
                children: /* @__PURE__ */ b.jsx(wv, {})
              }
            )
          }
        ) }),
        /* @__PURE__ */ b.jsxs(vp, { align: "start", sideOffset: 6, className: "gallery-search-popover tw:gap-0 tw:p-2", children: [
          /* @__PURE__ */ b.jsx(hg, { className: "tw:sr-only", children: "Rechercher des fichiers" }),
          /* @__PURE__ */ b.jsx(Ax, { className: "tw:sr-only", children: "Search by file name or folder" }),
          /* @__PURE__ */ b.jsxs(xp, { "data-gallery-command-group": "search", children: [
            /* @__PURE__ */ b.jsx(
              Sp,
              {
                "aria-label": "Rechercher des fichiers",
                "data-gallery-command": "search",
                placeholder: "Nom ou dossier…",
                value: m,
                onChange: (j) => _(j.target.value),
                autoFocus: !0
              }
            ),
            /* @__PURE__ */ b.jsx(wp, { align: "inline-start", "aria-hidden": "true", children: /* @__PURE__ */ b.jsx(wv, {}) }),
            m && /* @__PURE__ */ b.jsx(wp, { align: "inline-end", children: /* @__PURE__ */ b.jsx(pw, { size: "icon-xs", "aria-label": "Effacer la recherche", onClick: () => _(""), children: /* @__PURE__ */ b.jsx(np, {}) }) })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ b.jsx(Vl, { label: "Favoris", children: /* @__PURE__ */ b.jsx(Vt, { variant: "ghost", size: "icon-sm", "data-gallery-command": "favorites", "aria-label": "Favoris", "aria-pressed": w, "data-gallery-active": w ? "true" : void 0, onClick: () => ar("favChip"), children: /* @__PURE__ */ b.jsx(Bb, { fill: w ? "currentColor" : "none" }) }) }),
      /* @__PURE__ */ b.jsxs(hp, { open: p, onOpenChange: (j, V) => {
        !j && V.reason === "escape-key" && o.current || (g(j), j && f(!1));
      }, children: [
        /* @__PURE__ */ b.jsx(
          yp,
          {
            render: /* @__PURE__ */ b.jsxs(
              Vt,
              {
                ref: a,
                variant: "ghost",
                size: "sm",
                "data-gallery-command": "filters",
                "data-gallery-active": z ? "true" : void 0,
                "aria-label": z ? `Filtres, ${z} actifs` : "Filtres",
                children: [
                  /* @__PURE__ */ b.jsx(aE, { "data-icon": "inline-start" }),
                  z > 0 && /* @__PURE__ */ b.jsx("span", { className: "gallery-filter-count", children: z })
                ]
              }
            )
          }
        ),
        /* @__PURE__ */ b.jsx(
          vp,
          {
            align: "start",
            sideOffset: 6,
            finalFocus: a,
            className: "gallery-filter-popover tw:w-[min(320px,calc(100vw-24px))] tw:gap-0 tw:p-0",
            children: /* @__PURE__ */ b.jsx(
              YA,
              {
                state: M,
                folder: v,
                collectionItems: C
              }
            )
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ b.jsx("div", { className: "gallery-command-spacer" }),
    /* @__PURE__ */ b.jsxs("div", { className: "gallery-command-group", "data-gallery-group": "display", role: "group", "aria-label": "Affichage et outils", children: [
      /* @__PURE__ */ b.jsx(Sb, {}),
      /* @__PURE__ */ b.jsx(LM, {}),
      /* @__PURE__ */ b.jsxs(vc, { modal: !1, children: [
        /* @__PURE__ */ b.jsx(Vl, { label: "Trier", children: /* @__PURE__ */ b.jsx(bc, { render: /* @__PURE__ */ b.jsx(Vt, { variant: "ghost", size: "icon-sm", "data-gallery-command": "sort", "aria-label": "Trier", children: /* @__PURE__ */ b.jsx(J1, {}) }) }) }),
        /* @__PURE__ */ b.jsxs(yi, { align: "end", className: "gallery-refined-menu tw:w-48", children: [
          /* @__PURE__ */ b.jsxs(Bn, { children: [
            /* @__PURE__ */ b.jsx(bp, { children: "Trier par" }),
            [{ value: "name", label: "Nom" }, { value: "type", label: "Type" }, { value: "mtime", label: "Modification" }, { value: "btime", label: "Création" }, { value: "size", label: "Taille" }, { value: "status", label: "Statut" }, { value: "rating", label: "Note" }].map((j) => /* @__PURE__ */ b.jsx(xc, { checked: A === j.value, onClick: () => D(j.value, L), children: j.label }, j.value))
          ] }),
          /* @__PURE__ */ b.jsx(rr, {}),
          /* @__PURE__ */ b.jsxs(Bn, { children: [
            /* @__PURE__ */ b.jsx(xc, { checked: !L, onClick: () => D(A, !1), children: "Ordre croissant" }),
            /* @__PURE__ */ b.jsx(xc, { checked: L, onClick: () => D(A, !0), children: "Ordre décroissant" })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ b.jsx(Vl, { label: S ? "Actualisation…" : "Rescanner la galerie", children: /* @__PURE__ */ b.jsx(Vt, { variant: "ghost", size: "icon-sm", disabled: S, onClick: () => ar("rescan"), "data-gallery-command": "rescan", "aria-label": "Rescanner la galerie", children: S ? /* @__PURE__ */ b.jsx(Bx, {}) : /* @__PURE__ */ b.jsx(yE, {}) }) }),
      /* @__PURE__ */ b.jsxs(vc, { modal: !1, children: [
        /* @__PURE__ */ b.jsx(Vl, { label: "Autres actions", children: /* @__PURE__ */ b.jsx(bc, { render: /* @__PURE__ */ b.jsx(Vt, { variant: "ghost", size: "icon-sm", "data-gallery-command": "tools", "aria-label": "Autres actions", children: /* @__PURE__ */ b.jsx(xv, {}) }) }) }),
        /* @__PURE__ */ b.jsxs(yi, { align: "end", className: "gallery-refined-menu tw:w-48", children: [
          /* @__PURE__ */ b.jsx(Bn, { children: /* @__PURE__ */ b.jsxs(al, { onClick: () => ar("viewChip"), children: [
            /* @__PURE__ */ b.jsx(xE, { "data-icon": "inline-start" }),
            " Réglages de la galerie…"
          ] }) }),
          /* @__PURE__ */ b.jsx(rr, {}),
          /* @__PURE__ */ b.jsxs(Bn, { children: [
            /* @__PURE__ */ b.jsxs(al, { onClick: () => ar("boardChip"), children: [
              /* @__PURE__ */ b.jsx(Ub, { "data-icon": "inline-start" }),
              " Board"
            ] }),
            /* @__PURE__ */ b.jsxs(al, { onClick: () => ar("notesChip"), children: [
              /* @__PURE__ */ b.jsx(pE, { "data-icon": "inline-start" }),
              " Notes"
            ] })
          ] }),
          E.length > 0 && /* @__PURE__ */ b.jsxs(b.Fragment, { children: [
            /* @__PURE__ */ b.jsx(rr, {}),
            /* @__PURE__ */ b.jsx(Bn, { children: /* @__PURE__ */ b.jsxs(ew, { children: [
              /* @__PURE__ */ b.jsx(tw, { children: "Fichiers récents" }),
              /* @__PURE__ */ b.jsx(nw, { children: /* @__PURE__ */ b.jsx(Bn, { children: E.map((j) => /* @__PURE__ */ b.jsx(al, { onClick: () => j.element.click(), children: j.label }, j.key)) }) })
            ] }) })
          ] })
        ] })
      ] })
    ] })
  ] });
}
function XA() {
  const [n, o] = h.useState(null), a = h.useRef(null), i = h.useCallback((f) => {
    const p = a.current;
    p && (a.current = null, o(null), p.resolve(f));
  }, []);
  h.useEffect(() => (window.__galleryConfirm = (f, p = "Delete") => new Promise((g) => {
    a.current && a.current.resolve(!1);
    const m = { message: f, acceptLabel: p, resolve: g };
    a.current = m, o(m);
  }), () => {
    delete window.__galleryConfirm, a.current && a.current.resolve(!1), a.current = null;
  }), []);
  const u = n ? GA(n) : null;
  return /* @__PURE__ */ b.jsx(R2, { open: !!n, onOpenChange: (f) => {
    f || i(!1);
  }, children: /* @__PURE__ */ b.jsxs(M2, { children: [
    /* @__PURE__ */ b.jsxs(A2, { children: [
      u?.destructive && /* @__PURE__ */ b.jsx(D2, { variant: "destructive", children: /* @__PURE__ */ b.jsx(Rp, {}) }),
      /* @__PURE__ */ b.jsx(k2, { children: u?.title }),
      u?.description && /* @__PURE__ */ b.jsx(_2, { children: u.description })
    ] }),
    /* @__PURE__ */ b.jsxs(N2, { variant: "plain", children: [
      /* @__PURE__ */ b.jsx(L2, { variant: "ghost", onClick: () => i(!1), children: "Cancel" }),
      /* @__PURE__ */ b.jsx(
        H2,
        {
          variant: u?.destructive ? "destructive" : "default",
          "data-gallery-confirm": "accept",
          onClick: () => i(!0),
          children: u?.acceptLabel || "Delete"
        }
      )
    ] })
  ] }) });
}
function FA() {
  const [n, o] = h.useState(document.body.classList.contains("has-insp")), [a, i] = h.useState(() => window.matchMedia("(max-width: 800px)").matches), [u, f] = h.useState(bt("inspTitle")?.textContent || "Inspector"), p = h.useRef(bt("inspector")), g = h.useCallback((m) => {
    const d = bt("inspBody");
    d && m && m.appendChild(d);
  }, []);
  return h.useLayoutEffect(() => () => {
    const m = bt("inspBody");
    m && p.current && p.current.appendChild(m);
  }, []), h.useEffect(() => {
    const m = () => {
      const x = document.documentElement.classList.contains("emb");
      o(!x && document.body.classList.contains("has-insp")), f(bt("inspTitle")?.textContent || "Inspector");
    }, d = new MutationObserver(m);
    d.observe(document.body, { attributes: !0, attributeFilter: ["class"] });
    const v = bt("inspTitle");
    return v && d.observe(v, { childList: !0, characterData: !0, subtree: !0 }), m(), () => d.disconnect();
  }, []), h.useEffect(() => {
    const m = window.matchMedia("(max-width: 800px)"), d = () => i(m.matches);
    return m.addEventListener("change", d), d(), () => m.removeEventListener("change", d);
  }, []), /* @__PURE__ */ b.jsx(
    _A,
    {
      modal: a,
      open: n,
      onOpenChange: (m, d) => {
        if (!m && d.reason === "escape-key") {
          d.cancel(), d.allowPropagation();
          return;
        }
        !m && document.body.classList.contains("has-insp") && ar("inspClose");
      },
      children: /* @__PURE__ */ b.jsxs(
        UA,
        {
          side: "right",
          layer: a ? "modal" : "panel",
          showOverlay: a,
          className: "tw:gap-0 tw:p-0",
          style: { width: "300px", maxWidth: "calc(100vw - 16px)" },
          children: [
            /* @__PURE__ */ b.jsxs(BA, { className: "tw:border-b tw:border-border tw:pr-12", children: [
              /* @__PURE__ */ b.jsx(IA, { children: u }),
              /* @__PURE__ */ b.jsx(VA, { className: "tw:sr-only", children: "File metadata and gallery actions" })
            ] }),
            /* @__PURE__ */ b.jsx("div", { ref: g, className: "tw:flex tw:min-h-0 tw:flex-1 tw:flex-col" })
          ]
        }
      )
    }
  );
}
const kb = document.getElementById("gallery-react-toolbar");
kb && g2.createRoot(kb).render(
  /* @__PURE__ */ b.jsxs(HM, { children: [
    /* @__PURE__ */ b.jsx(qA, {}),
    /* @__PURE__ */ b.jsx(XA, {}),
    /* @__PURE__ */ b.jsx(FA, {})
  ] })
);
