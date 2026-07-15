function D1(n, o) {
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
function N1(n) {
  return n && n.__esModule && Object.prototype.hasOwnProperty.call(n, "default") ? n.default : n;
}
var Cd = { exports: {} }, Wa = {};
var sv;
function j1() {
  if (sv) return Wa;
  sv = 1;
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
  return Wa.Fragment = o, Wa.jsx = a, Wa.jsxs = a, Wa;
}
var cv;
function k1() {
  return cv || (cv = 1, Cd.exports = j1()), Cd.exports;
}
var x = k1(), Od = { exports: {} }, Ge = {};
var uv;
function _1() {
  if (uv) return Ge;
  uv = 1;
  var n = /* @__PURE__ */ Symbol.for("react.transitional.element"), o = /* @__PURE__ */ Symbol.for("react.portal"), a = /* @__PURE__ */ Symbol.for("react.fragment"), i = /* @__PURE__ */ Symbol.for("react.strict_mode"), u = /* @__PURE__ */ Symbol.for("react.profiler"), f = /* @__PURE__ */ Symbol.for("react.consumer"), p = /* @__PURE__ */ Symbol.for("react.context"), g = /* @__PURE__ */ Symbol.for("react.forward_ref"), m = /* @__PURE__ */ Symbol.for("react.suspense"), d = /* @__PURE__ */ Symbol.for("react.memo"), v = /* @__PURE__ */ Symbol.for("react.lazy"), b = /* @__PURE__ */ Symbol.for("react.activity"), S = Symbol.iterator;
  function C(O) {
    return O === null || typeof O != "object" ? null : (O = S && O[S] || O["@@iterator"], typeof O == "function" ? O : null);
  }
  var w = {
    isMounted: function() {
      return !1;
    },
    enqueueForceUpdate: function() {
    },
    enqueueReplaceState: function() {
    },
    enqueueSetState: function() {
    }
  }, A = Object.assign, T = {};
  function z(O, U, ne) {
    this.props = O, this.context = U, this.refs = T, this.updater = ne || w;
  }
  z.prototype.isReactComponent = {}, z.prototype.setState = function(O, U) {
    if (typeof O != "object" && typeof O != "function" && O != null)
      throw Error(
        "takes an object of state variables to update or a function which returns an object of state variables."
      );
    this.updater.enqueueSetState(this, O, U, "setState");
  }, z.prototype.forceUpdate = function(O) {
    this.updater.enqueueForceUpdate(this, O, "forceUpdate");
  };
  function M() {
  }
  M.prototype = z.prototype;
  function D(O, U, ne) {
    this.props = O, this.context = U, this.refs = T, this.updater = ne || w;
  }
  var N = D.prototype = new M();
  N.constructor = D, A(N, z.prototype), N.isPureReactComponent = !0;
  var L = Array.isArray;
  function j() {
  }
  var H = { H: null, A: null, T: null, S: null }, k = Object.prototype.hasOwnProperty;
  function G(O, U, ne) {
    var $ = ne.ref;
    return {
      $$typeof: n,
      type: O,
      key: U,
      ref: $ !== void 0 ? $ : null,
      props: ne
    };
  }
  function E(O, U) {
    return G(O.type, U, O.props);
  }
  function Z(O) {
    return typeof O == "object" && O !== null && O.$$typeof === n;
  }
  function J(O) {
    var U = { "=": "=0", ":": "=2" };
    return "$" + O.replace(/[=:]/g, function(ne) {
      return U[ne];
    });
  }
  var X = /\/+/g;
  function K(O, U) {
    return typeof O == "object" && O !== null && O.key != null ? J("" + O.key) : U.toString(36);
  }
  function q(O) {
    switch (O.status) {
      case "fulfilled":
        return O.value;
      case "rejected":
        throw O.reason;
      default:
        switch (typeof O.status == "string" ? O.then(j, j) : (O.status = "pending", O.then(
          function(U) {
            O.status === "pending" && (O.status = "fulfilled", O.value = U);
          },
          function(U) {
            O.status === "pending" && (O.status = "rejected", O.reason = U);
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
  function _(O, U, ne, $, re) {
    var ie = typeof O;
    (ie === "undefined" || ie === "boolean") && (O = null);
    var oe = !1;
    if (O === null) oe = !0;
    else
      switch (ie) {
        case "bigint":
        case "string":
        case "number":
          oe = !0;
          break;
        case "object":
          switch (O.$$typeof) {
            case n:
            case o:
              oe = !0;
              break;
            case v:
              return oe = O._init, _(
                oe(O._payload),
                U,
                ne,
                $,
                re
              );
          }
      }
    if (oe)
      return re = re(O), oe = $ === "" ? "." + K(O, 0) : $, L(re) ? (ne = "", oe != null && (ne = oe.replace(X, "$&/") + "/"), _(re, U, ne, "", function(je) {
        return je;
      })) : re != null && (Z(re) && (re = E(
        re,
        ne + (re.key == null || O && O.key === re.key ? "" : ("" + re.key).replace(
          X,
          "$&/"
        ) + "/") + oe
      )), U.push(re)), 1;
    oe = 0;
    var se = $ === "" ? "." : $ + ":";
    if (L(O))
      for (var ge = 0; ge < O.length; ge++)
        $ = O[ge], ie = se + K($, ge), oe += _(
          $,
          U,
          ne,
          ie,
          re
        );
    else if (ge = C(O), typeof ge == "function")
      for (O = ge.call(O), ge = 0; !($ = O.next()).done; )
        $ = $.value, ie = se + K($, ge++), oe += _(
          $,
          U,
          ne,
          ie,
          re
        );
    else if (ie === "object") {
      if (typeof O.then == "function")
        return _(
          q(O),
          U,
          ne,
          $,
          re
        );
      throw U = String(O), Error(
        "Objects are not valid as a React child (found: " + (U === "[object Object]" ? "object with keys {" + Object.keys(O).join(", ") + "}" : U) + "). If you meant to render a collection of children, use an array instead."
      );
    }
    return oe;
  }
  function Y(O, U, ne) {
    if (O == null) return O;
    var $ = [], re = 0;
    return _(O, $, "", "", function(ie) {
      return U.call(ne, ie, re++);
    }), $;
  }
  function V(O) {
    if (O._status === -1) {
      var U = O._result;
      U = U(), U.then(
        function(ne) {
          (O._status === 0 || O._status === -1) && (O._status = 1, O._result = ne);
        },
        function(ne) {
          (O._status === 0 || O._status === -1) && (O._status = 2, O._result = ne);
        }
      ), O._status === -1 && (O._status = 0, O._result = U);
    }
    if (O._status === 1) return O._result.default;
    throw O._result;
  }
  var Q = typeof reportError == "function" ? reportError : function(O) {
    if (typeof window == "object" && typeof window.ErrorEvent == "function") {
      var U = new window.ErrorEvent("error", {
        bubbles: !0,
        cancelable: !0,
        message: typeof O == "object" && O !== null && typeof O.message == "string" ? String(O.message) : String(O),
        error: O
      });
      if (!window.dispatchEvent(U)) return;
    } else if (typeof process == "object" && typeof process.emit == "function") {
      process.emit("uncaughtException", O);
      return;
    }
    console.error(O);
  }, B = {
    map: Y,
    forEach: function(O, U, ne) {
      Y(
        O,
        function() {
          U.apply(this, arguments);
        },
        ne
      );
    },
    count: function(O) {
      var U = 0;
      return Y(O, function() {
        U++;
      }), U;
    },
    toArray: function(O) {
      return Y(O, function(U) {
        return U;
      }) || [];
    },
    only: function(O) {
      if (!Z(O))
        throw Error(
          "React.Children.only expected to receive a single React element child."
        );
      return O;
    }
  };
  return Ge.Activity = b, Ge.Children = B, Ge.Component = z, Ge.Fragment = a, Ge.Profiler = u, Ge.PureComponent = D, Ge.StrictMode = i, Ge.Suspense = m, Ge.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = H, Ge.__COMPILER_RUNTIME = {
    __proto__: null,
    c: function(O) {
      return H.H.useMemoCache(O);
    }
  }, Ge.cache = function(O) {
    return function() {
      return O.apply(null, arguments);
    };
  }, Ge.cacheSignal = function() {
    return null;
  }, Ge.cloneElement = function(O, U, ne) {
    if (O == null)
      throw Error(
        "The argument must be a React element, but you passed " + O + "."
      );
    var $ = A({}, O.props), re = O.key;
    if (U != null)
      for (ie in U.key !== void 0 && (re = "" + U.key), U)
        !k.call(U, ie) || ie === "key" || ie === "__self" || ie === "__source" || ie === "ref" && U.ref === void 0 || ($[ie] = U[ie]);
    var ie = arguments.length - 2;
    if (ie === 1) $.children = ne;
    else if (1 < ie) {
      for (var oe = Array(ie), se = 0; se < ie; se++)
        oe[se] = arguments[se + 2];
      $.children = oe;
    }
    return G(O.type, re, $);
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
  }, Ge.createElement = function(O, U, ne) {
    var $, re = {}, ie = null;
    if (U != null)
      for ($ in U.key !== void 0 && (ie = "" + U.key), U)
        k.call(U, $) && $ !== "key" && $ !== "__self" && $ !== "__source" && (re[$] = U[$]);
    var oe = arguments.length - 2;
    if (oe === 1) re.children = ne;
    else if (1 < oe) {
      for (var se = Array(oe), ge = 0; ge < oe; ge++)
        se[ge] = arguments[ge + 2];
      re.children = se;
    }
    if (O && O.defaultProps)
      for ($ in oe = O.defaultProps, oe)
        re[$] === void 0 && (re[$] = oe[$]);
    return G(O, ie, re);
  }, Ge.createRef = function() {
    return { current: null };
  }, Ge.forwardRef = function(O) {
    return { $$typeof: g, render: O };
  }, Ge.isValidElement = Z, Ge.lazy = function(O) {
    return {
      $$typeof: v,
      _payload: { _status: -1, _result: O },
      _init: V
    };
  }, Ge.memo = function(O, U) {
    return {
      $$typeof: d,
      type: O,
      compare: U === void 0 ? null : U
    };
  }, Ge.startTransition = function(O) {
    var U = H.T, ne = {};
    H.T = ne;
    try {
      var $ = O(), re = H.S;
      re !== null && re(ne, $), typeof $ == "object" && $ !== null && typeof $.then == "function" && $.then(j, Q);
    } catch (ie) {
      Q(ie);
    } finally {
      U !== null && ne.types !== null && (U.types = ne.types), H.T = U;
    }
  }, Ge.unstable_useCacheRefresh = function() {
    return H.H.useCacheRefresh();
  }, Ge.use = function(O) {
    return H.H.use(O);
  }, Ge.useActionState = function(O, U, ne) {
    return H.H.useActionState(O, U, ne);
  }, Ge.useCallback = function(O, U) {
    return H.H.useCallback(O, U);
  }, Ge.useContext = function(O) {
    return H.H.useContext(O);
  }, Ge.useDebugValue = function() {
  }, Ge.useDeferredValue = function(O, U) {
    return H.H.useDeferredValue(O, U);
  }, Ge.useEffect = function(O, U) {
    return H.H.useEffect(O, U);
  }, Ge.useEffectEvent = function(O) {
    return H.H.useEffectEvent(O);
  }, Ge.useId = function() {
    return H.H.useId();
  }, Ge.useImperativeHandle = function(O, U, ne) {
    return H.H.useImperativeHandle(O, U, ne);
  }, Ge.useInsertionEffect = function(O, U) {
    return H.H.useInsertionEffect(O, U);
  }, Ge.useLayoutEffect = function(O, U) {
    return H.H.useLayoutEffect(O, U);
  }, Ge.useMemo = function(O, U) {
    return H.H.useMemo(O, U);
  }, Ge.useOptimistic = function(O, U) {
    return H.H.useOptimistic(O, U);
  }, Ge.useReducer = function(O, U, ne) {
    return H.H.useReducer(O, U, ne);
  }, Ge.useRef = function(O) {
    return H.H.useRef(O);
  }, Ge.useState = function(O) {
    return H.H.useState(O);
  }, Ge.useSyncExternalStore = function(O, U, ne) {
    return H.H.useSyncExternalStore(
      O,
      U,
      ne
    );
  }, Ge.useTransition = function() {
    return H.H.useTransition();
  }, Ge.version = "19.2.7", Ge;
}
var fv;
function Ei() {
  return fv || (fv = 1, Od.exports = _1()), Od.exports;
}
var y = Ei();
const Wd = /* @__PURE__ */ N1(y), H1 = /* @__PURE__ */ D1({
  __proto__: null,
  default: Wd
}, [y]);
var Md = { exports: {} }, ei = {}, Ad = { exports: {} }, zd = {};
var dv;
function U1() {
  return dv || (dv = 1, (function(n) {
    function o(_, Y) {
      var V = _.length;
      _.push(Y);
      e: for (; 0 < V; ) {
        var Q = V - 1 >>> 1, B = _[Q];
        if (0 < u(B, Y))
          _[Q] = Y, _[V] = B, V = Q;
        else break e;
      }
    }
    function a(_) {
      return _.length === 0 ? null : _[0];
    }
    function i(_) {
      if (_.length === 0) return null;
      var Y = _[0], V = _.pop();
      if (V !== Y) {
        _[0] = V;
        e: for (var Q = 0, B = _.length, O = B >>> 1; Q < O; ) {
          var U = 2 * (Q + 1) - 1, ne = _[U], $ = U + 1, re = _[$];
          if (0 > u(ne, V))
            $ < B && 0 > u(re, ne) ? (_[Q] = re, _[$] = V, Q = $) : (_[Q] = ne, _[U] = V, Q = U);
          else if ($ < B && 0 > u(re, V))
            _[Q] = re, _[$] = V, Q = $;
          else break e;
        }
      }
      return Y;
    }
    function u(_, Y) {
      var V = _.sortIndex - Y.sortIndex;
      return V !== 0 ? V : _.id - Y.id;
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
    var m = [], d = [], v = 1, b = null, S = 3, C = !1, w = !1, A = !1, T = !1, z = typeof setTimeout == "function" ? setTimeout : null, M = typeof clearTimeout == "function" ? clearTimeout : null, D = typeof setImmediate < "u" ? setImmediate : null;
    function N(_) {
      for (var Y = a(d); Y !== null; ) {
        if (Y.callback === null) i(d);
        else if (Y.startTime <= _)
          i(d), Y.sortIndex = Y.expirationTime, o(m, Y);
        else break;
        Y = a(d);
      }
    }
    function L(_) {
      if (A = !1, N(_), !w)
        if (a(m) !== null)
          w = !0, j || (j = !0, J());
        else {
          var Y = a(d);
          Y !== null && q(L, Y.startTime - _);
        }
    }
    var j = !1, H = -1, k = 5, G = -1;
    function E() {
      return T ? !0 : !(n.unstable_now() - G < k);
    }
    function Z() {
      if (T = !1, j) {
        var _ = n.unstable_now();
        G = _;
        var Y = !0;
        try {
          e: {
            w = !1, A && (A = !1, M(H), H = -1), C = !0;
            var V = S;
            try {
              t: {
                for (N(_), b = a(m); b !== null && !(b.expirationTime > _ && E()); ) {
                  var Q = b.callback;
                  if (typeof Q == "function") {
                    b.callback = null, S = b.priorityLevel;
                    var B = Q(
                      b.expirationTime <= _
                    );
                    if (_ = n.unstable_now(), typeof B == "function") {
                      b.callback = B, N(_), Y = !0;
                      break t;
                    }
                    b === a(m) && i(m), N(_);
                  } else i(m);
                  b = a(m);
                }
                if (b !== null) Y = !0;
                else {
                  var O = a(d);
                  O !== null && q(
                    L,
                    O.startTime - _
                  ), Y = !1;
                }
              }
              break e;
            } finally {
              b = null, S = V, C = !1;
            }
            Y = void 0;
          }
        } finally {
          Y ? J() : j = !1;
        }
      }
    }
    var J;
    if (typeof D == "function")
      J = function() {
        D(Z);
      };
    else if (typeof MessageChannel < "u") {
      var X = new MessageChannel(), K = X.port2;
      X.port1.onmessage = Z, J = function() {
        K.postMessage(null);
      };
    } else
      J = function() {
        z(Z, 0);
      };
    function q(_, Y) {
      H = z(function() {
        _(n.unstable_now());
      }, Y);
    }
    n.unstable_IdlePriority = 5, n.unstable_ImmediatePriority = 1, n.unstable_LowPriority = 4, n.unstable_NormalPriority = 3, n.unstable_Profiling = null, n.unstable_UserBlockingPriority = 2, n.unstable_cancelCallback = function(_) {
      _.callback = null;
    }, n.unstable_forceFrameRate = function(_) {
      0 > _ || 125 < _ ? console.error(
        "forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported"
      ) : k = 0 < _ ? Math.floor(1e3 / _) : 5;
    }, n.unstable_getCurrentPriorityLevel = function() {
      return S;
    }, n.unstable_next = function(_) {
      switch (S) {
        case 1:
        case 2:
        case 3:
          var Y = 3;
          break;
        default:
          Y = S;
      }
      var V = S;
      S = Y;
      try {
        return _();
      } finally {
        S = V;
      }
    }, n.unstable_requestPaint = function() {
      T = !0;
    }, n.unstable_runWithPriority = function(_, Y) {
      switch (_) {
        case 1:
        case 2:
        case 3:
        case 4:
        case 5:
          break;
        default:
          _ = 3;
      }
      var V = S;
      S = _;
      try {
        return Y();
      } finally {
        S = V;
      }
    }, n.unstable_scheduleCallback = function(_, Y, V) {
      var Q = n.unstable_now();
      switch (typeof V == "object" && V !== null ? (V = V.delay, V = typeof V == "number" && 0 < V ? Q + V : Q) : V = Q, _) {
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
      return B = V + B, _ = {
        id: v++,
        callback: Y,
        priorityLevel: _,
        startTime: V,
        expirationTime: B,
        sortIndex: -1
      }, V > Q ? (_.sortIndex = V, o(d, _), a(m) === null && _ === a(d) && (A ? (M(H), H = -1) : A = !0, q(L, V - Q))) : (_.sortIndex = B, o(m, _), w || C || (w = !0, j || (j = !0, J()))), _;
    }, n.unstable_shouldYield = E, n.unstable_wrapCallback = function(_) {
      var Y = S;
      return function() {
        var V = S;
        S = Y;
        try {
          return _.apply(this, arguments);
        } finally {
          S = V;
        }
      };
    };
  })(zd)), zd;
}
var pv;
function L1() {
  return pv || (pv = 1, Ad.exports = U1()), Ad.exports;
}
var Dd = { exports: {} }, hn = {};
var gv;
function I1() {
  if (gv) return hn;
  gv = 1;
  var n = Ei();
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
    var b = 3 < arguments.length && arguments[3] !== void 0 ? arguments[3] : null;
    return {
      $$typeof: u,
      key: b == null ? null : "" + b,
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
      var v = d.as, b = g(v, d.crossOrigin), S = typeof d.integrity == "string" ? d.integrity : void 0, C = typeof d.fetchPriority == "string" ? d.fetchPriority : void 0;
      v === "style" ? i.d.S(
        m,
        typeof d.precedence == "string" ? d.precedence : void 0,
        {
          crossOrigin: b,
          integrity: S,
          fetchPriority: C
        }
      ) : v === "script" && i.d.X(m, {
        crossOrigin: b,
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
      var v = d.as, b = g(v, d.crossOrigin);
      i.d.L(m, v, {
        crossOrigin: b,
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
var mv;
function Ab() {
  if (mv) return Dd.exports;
  mv = 1;
  function n() {
    if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function"))
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(n);
      } catch (o) {
        console.error(o);
      }
  }
  return n(), Dd.exports = I1(), Dd.exports;
}
var hv;
function B1() {
  if (hv) return ei;
  hv = 1;
  var n = L1(), o = Ei(), a = Ab();
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
        for (var h = !1, R = s.child; R; ) {
          if (R === l) {
            h = !0, l = s, r = c;
            break;
          }
          if (R === r) {
            h = !0, r = s, l = c;
            break;
          }
          R = R.sibling;
        }
        if (!h) {
          for (R = c.child; R; ) {
            if (R === l) {
              h = !0, l = c, r = s;
              break;
            }
            if (R === r) {
              h = !0, r = c, l = s;
              break;
            }
            R = R.sibling;
          }
          if (!h) throw Error(i(189));
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
  var b = Object.assign, S = /* @__PURE__ */ Symbol.for("react.element"), C = /* @__PURE__ */ Symbol.for("react.transitional.element"), w = /* @__PURE__ */ Symbol.for("react.portal"), A = /* @__PURE__ */ Symbol.for("react.fragment"), T = /* @__PURE__ */ Symbol.for("react.strict_mode"), z = /* @__PURE__ */ Symbol.for("react.profiler"), M = /* @__PURE__ */ Symbol.for("react.consumer"), D = /* @__PURE__ */ Symbol.for("react.context"), N = /* @__PURE__ */ Symbol.for("react.forward_ref"), L = /* @__PURE__ */ Symbol.for("react.suspense"), j = /* @__PURE__ */ Symbol.for("react.suspense_list"), H = /* @__PURE__ */ Symbol.for("react.memo"), k = /* @__PURE__ */ Symbol.for("react.lazy"), G = /* @__PURE__ */ Symbol.for("react.activity"), E = /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel"), Z = Symbol.iterator;
  function J(e) {
    return e === null || typeof e != "object" ? null : (e = Z && e[Z] || e["@@iterator"], typeof e == "function" ? e : null);
  }
  var X = /* @__PURE__ */ Symbol.for("react.client.reference");
  function K(e) {
    if (e == null) return null;
    if (typeof e == "function")
      return e.$$typeof === X ? null : e.displayName || e.name || null;
    if (typeof e == "string") return e;
    switch (e) {
      case A:
        return "Fragment";
      case z:
        return "Profiler";
      case T:
        return "StrictMode";
      case L:
        return "Suspense";
      case j:
        return "SuspenseList";
      case G:
        return "Activity";
    }
    if (typeof e == "object")
      switch (e.$$typeof) {
        case w:
          return "Portal";
        case D:
          return e.displayName || "Context";
        case M:
          return (e._context.displayName || "Context") + ".Consumer";
        case N:
          var t = e.render;
          return e = e.displayName, e || (e = t.displayName || t.name || "", e = e !== "" ? "ForwardRef(" + e + ")" : "ForwardRef"), e;
        case H:
          return t = e.displayName || null, t !== null ? t : K(e.type) || "Memo";
        case k:
          t = e._payload, e = e._init;
          try {
            return K(e(t));
          } catch {
          }
      }
    return null;
  }
  var q = Array.isArray, _ = o.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, Y = a.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, V = {
    pending: !1,
    data: null,
    method: null,
    action: null
  }, Q = [], B = -1;
  function O(e) {
    return { current: e };
  }
  function U(e) {
    0 > B || (e.current = Q[B], Q[B] = null, B--);
  }
  function ne(e, t) {
    B++, Q[B] = e.current, e.current = t;
  }
  var $ = O(null), re = O(null), ie = O(null), oe = O(null);
  function se(e, t) {
    switch (ne(ie, t), ne(re, e), ne($, null), t.nodeType) {
      case 9:
      case 11:
        e = (e = t.documentElement) && (e = e.namespaceURI) ? Dy(e) : 0;
        break;
      default:
        if (e = t.tagName, t = t.namespaceURI)
          t = Dy(t), e = Ny(t, e);
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
    U($), ne($, e);
  }
  function ge() {
    U($), U(re), U(ie);
  }
  function je(e) {
    e.memoizedState !== null && ne(oe, e);
    var t = $.current, l = Ny(t, e.type);
    t !== l && (ne(re, e), ne($, l));
  }
  function Ee(e) {
    re.current === e && (U($), U(re)), oe.current === e && (U(oe), Qa._currentValue = V);
  }
  var fe, ye;
  function Re(e) {
    if (fe === void 0)
      try {
        throw Error();
      } catch (l) {
        var t = l.stack.trim().match(/\n( *(at )?)/);
        fe = t && t[1] || "", ye = -1 < l.stack.indexOf(`
    at`) ? " (<anonymous>)" : -1 < l.stack.indexOf("@") ? "@unknown:0:0" : "";
      }
    return `
` + fe + e + ye;
  }
  var _e = !1;
  function ke(e, t) {
    if (!e || _e) return "";
    _e = !0;
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
                } catch (le) {
                  var te = le;
                }
                Reflect.construct(e, [], de);
              } else {
                try {
                  de.call();
                } catch (le) {
                  te = le;
                }
                e.call(de.prototype);
              }
            } else {
              try {
                throw Error();
              } catch (le) {
                te = le;
              }
              (de = e()) && typeof de.catch == "function" && de.catch(function() {
              });
            }
          } catch (le) {
            if (le && te && typeof le.stack == "string")
              return [le.stack, te.stack];
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
      var c = r.DetermineComponentFrameRoot(), h = c[0], R = c[1];
      if (h && R) {
        var I = h.split(`
`), ee = R.split(`
`);
        for (s = r = 0; r < I.length && !I[r].includes("DetermineComponentFrameRoot"); )
          r++;
        for (; s < ee.length && !ee[s].includes(
          "DetermineComponentFrameRoot"
        ); )
          s++;
        if (r === I.length || s === ee.length)
          for (r = I.length - 1, s = ee.length - 1; 1 <= r && 0 <= s && I[r] !== ee[s]; )
            s--;
        for (; 1 <= r && 0 <= s; r--, s--)
          if (I[r] !== ee[s]) {
            if (r !== 1 || s !== 1)
              do
                if (r--, s--, 0 > s || I[r] !== ee[s]) {
                  var ce = `
` + I[r].replace(" at new ", " at ");
                  return e.displayName && ce.includes("<anonymous>") && (ce = ce.replace("<anonymous>", e.displayName)), ce;
                }
              while (1 <= r && 0 <= s);
            break;
          }
      }
    } finally {
      _e = !1, Error.prepareStackTrace = l;
    }
    return (l = e ? e.displayName || e.name : "") ? Re(l) : "";
  }
  function we(e, t) {
    switch (e.tag) {
      case 26:
      case 27:
      case 5:
        return Re(e.type);
      case 16:
        return Re("Lazy");
      case 13:
        return e.child !== t && t !== null ? Re("Suspense Fallback") : Re("Suspense");
      case 19:
        return Re("SuspenseList");
      case 0:
      case 15:
        return ke(e.type, !1);
      case 11:
        return ke(e.type.render, !1);
      case 1:
        return ke(e.type, !0);
      case 31:
        return Re("Activity");
      default:
        return "";
    }
  }
  function Ce(e) {
    try {
      var t = "", l = null;
      do
        t += we(e, l), l = e, e = e.return;
      while (e);
      return t;
    } catch (r) {
      return `
Error generating stack: ` + r.message + `
` + r.stack;
    }
  }
  var he = Object.prototype.hasOwnProperty, Se = n.unstable_scheduleCallback, Te = n.unstable_cancelCallback, Oe = n.unstable_shouldYield, He = n.unstable_requestPaint, ae = n.unstable_now, pe = n.unstable_getCurrentPriorityLevel, Ue = n.unstable_ImmediatePriority, ve = n.unstable_UserBlockingPriority, be = n.unstable_NormalPriority, We = n.unstable_LowPriority, rt = n.unstable_IdlePriority, pt = n.log, Nt = n.unstable_setDisableYieldValue, et = null, gt = null;
  function zt(e) {
    if (typeof pt == "function" && Nt(e), gt && typeof gt.setStrictMode == "function")
      try {
        gt.setStrictMode(et, e);
      } catch {
      }
  }
  var yt = Math.clz32 ? Math.clz32 : Qe, Mn = Math.log, An = Math.LN2;
  function Qe(e) {
    return e >>>= 0, e === 0 ? 32 : 31 - (Mn(e) / An | 0) | 0;
  }
  var ft = 256, It = 262144, Ht = 4194304;
  function Ut(e) {
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
    var s = 0, c = e.suspendedLanes, h = e.pingedLanes;
    e = e.warmLanes;
    var R = r & 134217727;
    return R !== 0 ? (r = R & ~c, r !== 0 ? s = Ut(r) : (h &= R, h !== 0 ? s = Ut(h) : l || (l = R & ~e, l !== 0 && (s = Ut(l))))) : (R = r & ~c, R !== 0 ? s = Ut(R) : h !== 0 ? s = Ut(h) : l || (l = r & ~e, l !== 0 && (s = Ut(l)))), s === 0 ? 0 : t !== 0 && t !== s && (t & c) === 0 && (c = s & -s, l = t & -t, c >= l || c === 32 && (l & 4194048) !== 0) ? t : s;
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
  function zn() {
    var e = Ht;
    return Ht <<= 1, (Ht & 62914560) === 0 && (Ht = 4194304), e;
  }
  function Vn(e) {
    for (var t = [], l = 0; 31 > l; l++) t.push(e);
    return t;
  }
  function qt(e, t) {
    e.pendingLanes |= t, t !== 268435456 && (e.suspendedLanes = 0, e.pingedLanes = 0, e.warmLanes = 0);
  }
  function Pn(e, t, l, r, s, c) {
    var h = e.pendingLanes;
    e.pendingLanes = l, e.suspendedLanes = 0, e.pingedLanes = 0, e.warmLanes = 0, e.expiredLanes &= l, e.entangledLanes &= l, e.errorRecoveryDisabledLanes &= l, e.shellSuspendCounter = 0;
    var R = e.entanglements, I = e.expirationTimes, ee = e.hiddenUpdates;
    for (l = h & ~l; 0 < l; ) {
      var ce = 31 - yt(l), de = 1 << ce;
      R[ce] = 0, I[ce] = -1;
      var te = ee[ce];
      if (te !== null)
        for (ee[ce] = null, ce = 0; ce < te.length; ce++) {
          var le = te[ce];
          le !== null && (le.lane &= -536870913);
        }
      l &= ~de;
    }
    r !== 0 && hl(e, r, 0), c !== 0 && s === 0 && e.tag !== 0 && (e.suspendedLanes |= c & ~(h & ~t));
  }
  function hl(e, t, l) {
    e.pendingLanes |= t, e.suspendedLanes &= ~t;
    var r = 31 - yt(t);
    e.entangledLanes |= t, e.entanglements[r] = e.entanglements[r] | 1073741824 | l & 261930;
  }
  function tl(e, t) {
    var l = e.entangledLanes |= t;
    for (e = e.entanglements; l; ) {
      var r = 31 - yt(l), s = 1 << r;
      s & t | e[r] & t && (e[r] |= t), l &= ~s;
    }
  }
  function yl(e, t) {
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
  function St(e) {
    return e &= -e, 2 < e ? 8 < e ? (e & 134217727) !== 0 ? 32 : 268435456 : 8 : 2;
  }
  function Xt() {
    var e = Y.p;
    return e !== 0 ? e : (e = window.event, e === void 0 ? 32 : tv(e.type));
  }
  function ln(e, t) {
    var l = Y.p;
    try {
      return Y.p = e, t();
    } finally {
      Y.p = l;
    }
  }
  var en = Math.random().toString(36).slice(2), Ot = "__reactFiber$" + en, cn = "__reactProps$" + en, rl = "__reactContainer$" + en, ca = "__reactEvents$" + en, Ni = "__reactListeners$" + en, SS = "__reactHandles$" + en, vg = "__reactResources$" + en, ua = "__reactMarker$" + en;
  function yu(e) {
    delete e[Ot], delete e[cn], delete e[ca], delete e[Ni], delete e[SS];
  }
  function dr(e) {
    var t = e[Ot];
    if (t) return t;
    for (var l = e.parentNode; l; ) {
      if (t = l[rl] || l[Ot]) {
        if (l = t.alternate, t.child !== null || l !== null && l.child !== null)
          for (e = Iy(e); e !== null; ) {
            if (l = e[Ot]) return l;
            e = Iy(e);
          }
        return t;
      }
      e = l, l = e.parentNode;
    }
    return null;
  }
  function pr(e) {
    if (e = e[Ot] || e[rl]) {
      var t = e.tag;
      if (t === 5 || t === 6 || t === 13 || t === 31 || t === 26 || t === 27 || t === 3)
        return e;
    }
    return null;
  }
  function fa(e) {
    var t = e.tag;
    if (t === 5 || t === 26 || t === 27 || t === 6) return e.stateNode;
    throw Error(i(33));
  }
  function gr(e) {
    var t = e[vg];
    return t || (t = e[vg] = { hoistableStyles: /* @__PURE__ */ new Map(), hoistableScripts: /* @__PURE__ */ new Map() }), t;
  }
  function on(e) {
    e[ua] = !0;
  }
  var bg = /* @__PURE__ */ new Set(), xg = {};
  function Ho(e, t) {
    mr(e, t), mr(e + "Capture", t);
  }
  function mr(e, t) {
    for (xg[e] = t, e = 0; e < t.length; e++)
      bg.add(t[e]);
  }
  var wS = RegExp(
    "^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"
  ), Sg = {}, wg = {};
  function ES(e) {
    return he.call(wg, e) ? !0 : he.call(Sg, e) ? !1 : wS.test(e) ? wg[e] = !0 : (Sg[e] = !0, !1);
  }
  function ji(e, t, l) {
    if (ES(t))
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
  function ki(e, t, l) {
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
  function vl(e, t, l, r) {
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
  function Yn(e) {
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
  function Eg(e) {
    var t = e.type;
    return (e = e.nodeName) && e.toLowerCase() === "input" && (t === "checkbox" || t === "radio");
  }
  function TS(e, t, l) {
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
        set: function(h) {
          l = "" + h, c.call(this, h);
        }
      }), Object.defineProperty(e, t, {
        enumerable: r.enumerable
      }), {
        getValue: function() {
          return l;
        },
        setValue: function(h) {
          l = "" + h;
        },
        stopTracking: function() {
          e._valueTracker = null, delete e[t];
        }
      };
    }
  }
  function vu(e) {
    if (!e._valueTracker) {
      var t = Eg(e) ? "checked" : "value";
      e._valueTracker = TS(
        e,
        t,
        "" + e[t]
      );
    }
  }
  function Tg(e) {
    if (!e) return !1;
    var t = e._valueTracker;
    if (!t) return !0;
    var l = t.getValue(), r = "";
    return e && (r = Eg(e) ? e.checked ? "true" : "false" : e.value), e = r, e !== l ? (t.setValue(e), !0) : !1;
  }
  function _i(e) {
    if (e = e || (typeof document < "u" ? document : void 0), typeof e > "u") return null;
    try {
      return e.activeElement || e.body;
    } catch {
      return e.body;
    }
  }
  var RS = /[\n"\\]/g;
  function Gn(e) {
    return e.replace(
      RS,
      function(t) {
        return "\\" + t.charCodeAt(0).toString(16) + " ";
      }
    );
  }
  function bu(e, t, l, r, s, c, h, R) {
    e.name = "", h != null && typeof h != "function" && typeof h != "symbol" && typeof h != "boolean" ? e.type = h : e.removeAttribute("type"), t != null ? h === "number" ? (t === 0 && e.value === "" || e.value != t) && (e.value = "" + Yn(t)) : e.value !== "" + Yn(t) && (e.value = "" + Yn(t)) : h !== "submit" && h !== "reset" || e.removeAttribute("value"), t != null ? xu(e, h, Yn(t)) : l != null ? xu(e, h, Yn(l)) : r != null && e.removeAttribute("value"), s == null && c != null && (e.defaultChecked = !!c), s != null && (e.checked = s && typeof s != "function" && typeof s != "symbol"), R != null && typeof R != "function" && typeof R != "symbol" && typeof R != "boolean" ? e.name = "" + Yn(R) : e.removeAttribute("name");
  }
  function Rg(e, t, l, r, s, c, h, R) {
    if (c != null && typeof c != "function" && typeof c != "symbol" && typeof c != "boolean" && (e.type = c), t != null || l != null) {
      if (!(c !== "submit" && c !== "reset" || t != null)) {
        vu(e);
        return;
      }
      l = l != null ? "" + Yn(l) : "", t = t != null ? "" + Yn(t) : l, R || t === e.value || (e.value = t), e.defaultValue = t;
    }
    r = r ?? s, r = typeof r != "function" && typeof r != "symbol" && !!r, e.checked = R ? e.checked : !!r, e.defaultChecked = !!r, h != null && typeof h != "function" && typeof h != "symbol" && typeof h != "boolean" && (e.name = h), vu(e);
  }
  function xu(e, t, l) {
    t === "number" && _i(e.ownerDocument) === e || e.defaultValue === "" + l || (e.defaultValue = "" + l);
  }
  function hr(e, t, l, r) {
    if (e = e.options, t) {
      t = {};
      for (var s = 0; s < l.length; s++)
        t["$" + l[s]] = !0;
      for (l = 0; l < e.length; l++)
        s = t.hasOwnProperty("$" + e[l].value), e[l].selected !== s && (e[l].selected = s), s && r && (e[l].defaultSelected = !0);
    } else {
      for (l = "" + Yn(l), t = null, s = 0; s < e.length; s++) {
        if (e[s].value === l) {
          e[s].selected = !0, r && (e[s].defaultSelected = !0);
          return;
        }
        t !== null || e[s].disabled || (t = e[s]);
      }
      t !== null && (t.selected = !0);
    }
  }
  function Cg(e, t, l) {
    if (t != null && (t = "" + Yn(t), t !== e.value && (e.value = t), l == null)) {
      e.defaultValue !== t && (e.defaultValue = t);
      return;
    }
    e.defaultValue = l != null ? "" + Yn(l) : "";
  }
  function Og(e, t, l, r) {
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
    l = Yn(t), e.defaultValue = l, r = e.textContent, r === l && r !== "" && r !== null && (e.value = r), vu(e);
  }
  function yr(e, t) {
    if (t) {
      var l = e.firstChild;
      if (l && l === e.lastChild && l.nodeType === 3) {
        l.nodeValue = t;
        return;
      }
    }
    e.textContent = t;
  }
  var CS = new Set(
    "animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(
      " "
    )
  );
  function Mg(e, t, l) {
    var r = t.indexOf("--") === 0;
    l == null || typeof l == "boolean" || l === "" ? r ? e.setProperty(t, "") : t === "float" ? e.cssFloat = "" : e[t] = "" : r ? e.setProperty(t, l) : typeof l != "number" || l === 0 || CS.has(t) ? t === "float" ? e.cssFloat = l : e[t] = ("" + l).trim() : e[t] = l + "px";
  }
  function Ag(e, t, l) {
    if (t != null && typeof t != "object")
      throw Error(i(62));
    if (e = e.style, l != null) {
      for (var r in l)
        !l.hasOwnProperty(r) || t != null && t.hasOwnProperty(r) || (r.indexOf("--") === 0 ? e.setProperty(r, "") : r === "float" ? e.cssFloat = "" : e[r] = "");
      for (var s in t)
        r = t[s], t.hasOwnProperty(s) && l[s] !== r && Mg(e, s, r);
    } else
      for (var c in t)
        t.hasOwnProperty(c) && Mg(e, c, t[c]);
  }
  function Su(e) {
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
  var OS = /* @__PURE__ */ new Map([
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
  ]), MS = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
  function Hi(e) {
    return MS.test("" + e) ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')" : e;
  }
  function bl() {
  }
  var wu = null;
  function Eu(e) {
    return e = e.target || e.srcElement || window, e.correspondingUseElement && (e = e.correspondingUseElement), e.nodeType === 3 ? e.parentNode : e;
  }
  var vr = null, br = null;
  function zg(e) {
    var t = pr(e);
    if (t && (e = t.stateNode)) {
      var l = e[cn] || null;
      e: switch (e = t.stateNode, t.type) {
        case "input":
          if (bu(
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
              'input[name="' + Gn(
                "" + t
              ) + '"][type="radio"]'
            ), t = 0; t < l.length; t++) {
              var r = l[t];
              if (r !== e && r.form === e.form) {
                var s = r[cn] || null;
                if (!s) throw Error(i(90));
                bu(
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
              r = l[t], r.form === e.form && Tg(r);
          }
          break e;
        case "textarea":
          Cg(e, l.value, l.defaultValue);
          break e;
        case "select":
          t = l.value, t != null && hr(e, !!l.multiple, t, !1);
      }
    }
  }
  var Tu = !1;
  function Dg(e, t, l) {
    if (Tu) return e(t, l);
    Tu = !0;
    try {
      var r = e(t);
      return r;
    } finally {
      if (Tu = !1, (vr !== null || br !== null) && (Es(), vr && (t = vr, e = br, br = vr = null, zg(t), e)))
        for (t = 0; t < e.length; t++) zg(e[t]);
    }
  }
  function da(e, t) {
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
  var xl = !(typeof window > "u" || typeof window.document > "u" || typeof window.document.createElement > "u"), Ru = !1;
  if (xl)
    try {
      var pa = {};
      Object.defineProperty(pa, "passive", {
        get: function() {
          Ru = !0;
        }
      }), window.addEventListener("test", pa, pa), window.removeEventListener("test", pa, pa);
    } catch {
      Ru = !1;
    }
  var $l = null, Cu = null, Ui = null;
  function Ng() {
    if (Ui) return Ui;
    var e, t = Cu, l = t.length, r, s = "value" in $l ? $l.value : $l.textContent, c = s.length;
    for (e = 0; e < l && t[e] === s[e]; e++) ;
    var h = l - e;
    for (r = 1; r <= h && t[l - r] === s[c - r]; r++) ;
    return Ui = s.slice(e, 1 < r ? 1 - r : void 0);
  }
  function Li(e) {
    var t = e.keyCode;
    return "charCode" in e ? (e = e.charCode, e === 0 && t === 13 && (e = 13)) : e = t, e === 10 && (e = 13), 32 <= e || e === 13 ? e : 0;
  }
  function Ii() {
    return !0;
  }
  function jg() {
    return !1;
  }
  function wn(e) {
    function t(l, r, s, c, h) {
      this._reactName = l, this._targetInst = s, this.type = r, this.nativeEvent = c, this.target = h, this.currentTarget = null;
      for (var R in e)
        e.hasOwnProperty(R) && (l = e[R], this[R] = l ? l(c) : c[R]);
      return this.isDefaultPrevented = (c.defaultPrevented != null ? c.defaultPrevented : c.returnValue === !1) ? Ii : jg, this.isPropagationStopped = jg, this;
    }
    return b(t.prototype, {
      preventDefault: function() {
        this.defaultPrevented = !0;
        var l = this.nativeEvent;
        l && (l.preventDefault ? l.preventDefault() : typeof l.returnValue != "unknown" && (l.returnValue = !1), this.isDefaultPrevented = Ii);
      },
      stopPropagation: function() {
        var l = this.nativeEvent;
        l && (l.stopPropagation ? l.stopPropagation() : typeof l.cancelBubble != "unknown" && (l.cancelBubble = !0), this.isPropagationStopped = Ii);
      },
      persist: function() {
      },
      isPersistent: Ii
    }), t;
  }
  var Uo = {
    eventPhase: 0,
    bubbles: 0,
    cancelable: 0,
    timeStamp: function(e) {
      return e.timeStamp || Date.now();
    },
    defaultPrevented: 0,
    isTrusted: 0
  }, Bi = wn(Uo), ga = b({}, Uo, { view: 0, detail: 0 }), AS = wn(ga), Ou, Mu, ma, Vi = b({}, ga, {
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
    getModifierState: zu,
    button: 0,
    buttons: 0,
    relatedTarget: function(e) {
      return e.relatedTarget === void 0 ? e.fromElement === e.srcElement ? e.toElement : e.fromElement : e.relatedTarget;
    },
    movementX: function(e) {
      return "movementX" in e ? e.movementX : (e !== ma && (ma && e.type === "mousemove" ? (Ou = e.screenX - ma.screenX, Mu = e.screenY - ma.screenY) : Mu = Ou = 0, ma = e), Ou);
    },
    movementY: function(e) {
      return "movementY" in e ? e.movementY : Mu;
    }
  }), kg = wn(Vi), zS = b({}, Vi, { dataTransfer: 0 }), DS = wn(zS), NS = b({}, ga, { relatedTarget: 0 }), Au = wn(NS), jS = b({}, Uo, {
    animationName: 0,
    elapsedTime: 0,
    pseudoElement: 0
  }), kS = wn(jS), _S = b({}, Uo, {
    clipboardData: function(e) {
      return "clipboardData" in e ? e.clipboardData : window.clipboardData;
    }
  }), HS = wn(_S), US = b({}, Uo, { data: 0 }), _g = wn(US), LS = {
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
  }, IS = {
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
  }, BS = {
    Alt: "altKey",
    Control: "ctrlKey",
    Meta: "metaKey",
    Shift: "shiftKey"
  };
  function VS(e) {
    var t = this.nativeEvent;
    return t.getModifierState ? t.getModifierState(e) : (e = BS[e]) ? !!t[e] : !1;
  }
  function zu() {
    return VS;
  }
  var PS = b({}, ga, {
    key: function(e) {
      if (e.key) {
        var t = LS[e.key] || e.key;
        if (t !== "Unidentified") return t;
      }
      return e.type === "keypress" ? (e = Li(e), e === 13 ? "Enter" : String.fromCharCode(e)) : e.type === "keydown" || e.type === "keyup" ? IS[e.keyCode] || "Unidentified" : "";
    },
    code: 0,
    location: 0,
    ctrlKey: 0,
    shiftKey: 0,
    altKey: 0,
    metaKey: 0,
    repeat: 0,
    locale: 0,
    getModifierState: zu,
    charCode: function(e) {
      return e.type === "keypress" ? Li(e) : 0;
    },
    keyCode: function(e) {
      return e.type === "keydown" || e.type === "keyup" ? e.keyCode : 0;
    },
    which: function(e) {
      return e.type === "keypress" ? Li(e) : e.type === "keydown" || e.type === "keyup" ? e.keyCode : 0;
    }
  }), YS = wn(PS), GS = b({}, Vi, {
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
  }), Hg = wn(GS), qS = b({}, ga, {
    touches: 0,
    targetTouches: 0,
    changedTouches: 0,
    altKey: 0,
    metaKey: 0,
    ctrlKey: 0,
    shiftKey: 0,
    getModifierState: zu
  }), XS = wn(qS), FS = b({}, Uo, {
    propertyName: 0,
    elapsedTime: 0,
    pseudoElement: 0
  }), KS = wn(FS), QS = b({}, Vi, {
    deltaX: function(e) {
      return "deltaX" in e ? e.deltaX : "wheelDeltaX" in e ? -e.wheelDeltaX : 0;
    },
    deltaY: function(e) {
      return "deltaY" in e ? e.deltaY : "wheelDeltaY" in e ? -e.wheelDeltaY : "wheelDelta" in e ? -e.wheelDelta : 0;
    },
    deltaZ: 0,
    deltaMode: 0
  }), ZS = wn(QS), JS = b({}, Uo, {
    newState: 0,
    oldState: 0
  }), $S = wn(JS), WS = [9, 13, 27, 32], Du = xl && "CompositionEvent" in window, ha = null;
  xl && "documentMode" in document && (ha = document.documentMode);
  var ew = xl && "TextEvent" in window && !ha, Ug = xl && (!Du || ha && 8 < ha && 11 >= ha), Lg = " ", Ig = !1;
  function Bg(e, t) {
    switch (e) {
      case "keyup":
        return WS.indexOf(t.keyCode) !== -1;
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
  function Vg(e) {
    return e = e.detail, typeof e == "object" && "data" in e ? e.data : null;
  }
  var xr = !1;
  function tw(e, t) {
    switch (e) {
      case "compositionend":
        return Vg(t);
      case "keypress":
        return t.which !== 32 ? null : (Ig = !0, Lg);
      case "textInput":
        return e = t.data, e === Lg && Ig ? null : e;
      default:
        return null;
    }
  }
  function nw(e, t) {
    if (xr)
      return e === "compositionend" || !Du && Bg(e, t) ? (e = Ng(), Ui = Cu = $l = null, xr = !1, e) : null;
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
        return Ug && t.locale !== "ko" ? null : t.data;
      default:
        return null;
    }
  }
  var lw = {
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
  function Pg(e) {
    var t = e && e.nodeName && e.nodeName.toLowerCase();
    return t === "input" ? !!lw[e.type] : t === "textarea";
  }
  function Yg(e, t, l, r) {
    vr ? br ? br.push(r) : br = [r] : vr = r, t = zs(t, "onChange"), 0 < t.length && (l = new Bi(
      "onChange",
      "change",
      null,
      l,
      r
    ), e.push({ event: l, listeners: t }));
  }
  var ya = null, va = null;
  function ow(e) {
    Ry(e, 0);
  }
  function Pi(e) {
    var t = fa(e);
    if (Tg(t)) return e;
  }
  function Gg(e, t) {
    if (e === "change") return t;
  }
  var qg = !1;
  if (xl) {
    var Nu;
    if (xl) {
      var ju = "oninput" in document;
      if (!ju) {
        var Xg = document.createElement("div");
        Xg.setAttribute("oninput", "return;"), ju = typeof Xg.oninput == "function";
      }
      Nu = ju;
    } else Nu = !1;
    qg = Nu && (!document.documentMode || 9 < document.documentMode);
  }
  function Fg() {
    ya && (ya.detachEvent("onpropertychange", Kg), va = ya = null);
  }
  function Kg(e) {
    if (e.propertyName === "value" && Pi(va)) {
      var t = [];
      Yg(
        t,
        va,
        e,
        Eu(e)
      ), Dg(ow, t);
    }
  }
  function rw(e, t, l) {
    e === "focusin" ? (Fg(), ya = t, va = l, ya.attachEvent("onpropertychange", Kg)) : e === "focusout" && Fg();
  }
  function aw(e) {
    if (e === "selectionchange" || e === "keyup" || e === "keydown")
      return Pi(va);
  }
  function iw(e, t) {
    if (e === "click") return Pi(t);
  }
  function sw(e, t) {
    if (e === "input" || e === "change")
      return Pi(t);
  }
  function cw(e, t) {
    return e === t && (e !== 0 || 1 / e === 1 / t) || e !== e && t !== t;
  }
  var Dn = typeof Object.is == "function" ? Object.is : cw;
  function ba(e, t) {
    if (Dn(e, t)) return !0;
    if (typeof e != "object" || e === null || typeof t != "object" || t === null)
      return !1;
    var l = Object.keys(e), r = Object.keys(t);
    if (l.length !== r.length) return !1;
    for (r = 0; r < l.length; r++) {
      var s = l[r];
      if (!he.call(t, s) || !Dn(e[s], t[s]))
        return !1;
    }
    return !0;
  }
  function Qg(e) {
    for (; e && e.firstChild; ) e = e.firstChild;
    return e;
  }
  function Zg(e, t) {
    var l = Qg(e);
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
      l = Qg(l);
    }
  }
  function Jg(e, t) {
    return e && t ? e === t ? !0 : e && e.nodeType === 3 ? !1 : t && t.nodeType === 3 ? Jg(e, t.parentNode) : "contains" in e ? e.contains(t) : e.compareDocumentPosition ? !!(e.compareDocumentPosition(t) & 16) : !1 : !1;
  }
  function $g(e) {
    e = e != null && e.ownerDocument != null && e.ownerDocument.defaultView != null ? e.ownerDocument.defaultView : window;
    for (var t = _i(e.document); t instanceof e.HTMLIFrameElement; ) {
      try {
        var l = typeof t.contentWindow.location.href == "string";
      } catch {
        l = !1;
      }
      if (l) e = t.contentWindow;
      else break;
      t = _i(e.document);
    }
    return t;
  }
  function ku(e) {
    var t = e && e.nodeName && e.nodeName.toLowerCase();
    return t && (t === "input" && (e.type === "text" || e.type === "search" || e.type === "tel" || e.type === "url" || e.type === "password") || t === "textarea" || e.contentEditable === "true");
  }
  var uw = xl && "documentMode" in document && 11 >= document.documentMode, Sr = null, _u = null, xa = null, Hu = !1;
  function Wg(e, t, l) {
    var r = l.window === l ? l.document : l.nodeType === 9 ? l : l.ownerDocument;
    Hu || Sr == null || Sr !== _i(r) || (r = Sr, "selectionStart" in r && ku(r) ? r = { start: r.selectionStart, end: r.selectionEnd } : (r = (r.ownerDocument && r.ownerDocument.defaultView || window).getSelection(), r = {
      anchorNode: r.anchorNode,
      anchorOffset: r.anchorOffset,
      focusNode: r.focusNode,
      focusOffset: r.focusOffset
    }), xa && ba(xa, r) || (xa = r, r = zs(_u, "onSelect"), 0 < r.length && (t = new Bi(
      "onSelect",
      "select",
      null,
      t,
      l
    ), e.push({ event: t, listeners: r }), t.target = Sr)));
  }
  function Lo(e, t) {
    var l = {};
    return l[e.toLowerCase()] = t.toLowerCase(), l["Webkit" + e] = "webkit" + t, l["Moz" + e] = "moz" + t, l;
  }
  var wr = {
    animationend: Lo("Animation", "AnimationEnd"),
    animationiteration: Lo("Animation", "AnimationIteration"),
    animationstart: Lo("Animation", "AnimationStart"),
    transitionrun: Lo("Transition", "TransitionRun"),
    transitionstart: Lo("Transition", "TransitionStart"),
    transitioncancel: Lo("Transition", "TransitionCancel"),
    transitionend: Lo("Transition", "TransitionEnd")
  }, Uu = {}, em = {};
  xl && (em = document.createElement("div").style, "AnimationEvent" in window || (delete wr.animationend.animation, delete wr.animationiteration.animation, delete wr.animationstart.animation), "TransitionEvent" in window || delete wr.transitionend.transition);
  function Io(e) {
    if (Uu[e]) return Uu[e];
    if (!wr[e]) return e;
    var t = wr[e], l;
    for (l in t)
      if (t.hasOwnProperty(l) && l in em)
        return Uu[e] = t[l];
    return e;
  }
  var tm = Io("animationend"), nm = Io("animationiteration"), lm = Io("animationstart"), fw = Io("transitionrun"), dw = Io("transitionstart"), pw = Io("transitioncancel"), om = Io("transitionend"), rm = /* @__PURE__ */ new Map(), Lu = "abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(
    " "
  );
  Lu.push("scrollEnd");
  function nl(e, t) {
    rm.set(e, t), Ho(t, [e]);
  }
  var Yi = typeof reportError == "function" ? reportError : function(e) {
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
  }, qn = [], Er = 0, Iu = 0;
  function Gi() {
    for (var e = Er, t = Iu = Er = 0; t < e; ) {
      var l = qn[t];
      qn[t++] = null;
      var r = qn[t];
      qn[t++] = null;
      var s = qn[t];
      qn[t++] = null;
      var c = qn[t];
      if (qn[t++] = null, r !== null && s !== null) {
        var h = r.pending;
        h === null ? s.next = s : (s.next = h.next, h.next = s), r.pending = s;
      }
      c !== 0 && am(l, s, c);
    }
  }
  function qi(e, t, l, r) {
    qn[Er++] = e, qn[Er++] = t, qn[Er++] = l, qn[Er++] = r, Iu |= r, e.lanes |= r, e = e.alternate, e !== null && (e.lanes |= r);
  }
  function Bu(e, t, l, r) {
    return qi(e, t, l, r), Xi(e);
  }
  function Bo(e, t) {
    return qi(e, null, null, t), Xi(e);
  }
  function am(e, t, l) {
    e.lanes |= l;
    var r = e.alternate;
    r !== null && (r.lanes |= l);
    for (var s = !1, c = e.return; c !== null; )
      c.childLanes |= l, r = c.alternate, r !== null && (r.childLanes |= l), c.tag === 22 && (e = c.stateNode, e === null || e._visibility & 1 || (s = !0)), e = c, c = c.return;
    return e.tag === 3 ? (c = e.stateNode, s && t !== null && (s = 31 - yt(l), e = c.hiddenUpdates, r = e[s], r === null ? e[s] = [t] : r.push(t), t.lane = l | 536870912), c) : null;
  }
  function Xi(e) {
    if (50 < Pa)
      throw Pa = 0, Zf = null, Error(i(185));
    for (var t = e.return; t !== null; )
      e = t, t = e.return;
    return e.tag === 3 ? e.stateNode : null;
  }
  var Tr = {};
  function gw(e, t, l, r) {
    this.tag = e, this.key = l, this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null, this.index = 0, this.refCleanup = this.ref = null, this.pendingProps = t, this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null, this.mode = r, this.subtreeFlags = this.flags = 0, this.deletions = null, this.childLanes = this.lanes = 0, this.alternate = null;
  }
  function Nn(e, t, l, r) {
    return new gw(e, t, l, r);
  }
  function Vu(e) {
    return e = e.prototype, !(!e || !e.isReactComponent);
  }
  function Sl(e, t) {
    var l = e.alternate;
    return l === null ? (l = Nn(
      e.tag,
      t,
      e.key,
      e.mode
    ), l.elementType = e.elementType, l.type = e.type, l.stateNode = e.stateNode, l.alternate = e, e.alternate = l) : (l.pendingProps = t, l.type = e.type, l.flags = 0, l.subtreeFlags = 0, l.deletions = null), l.flags = e.flags & 65011712, l.childLanes = e.childLanes, l.lanes = e.lanes, l.child = e.child, l.memoizedProps = e.memoizedProps, l.memoizedState = e.memoizedState, l.updateQueue = e.updateQueue, t = e.dependencies, l.dependencies = t === null ? null : { lanes: t.lanes, firstContext: t.firstContext }, l.sibling = e.sibling, l.index = e.index, l.ref = e.ref, l.refCleanup = e.refCleanup, l;
  }
  function im(e, t) {
    e.flags &= 65011714;
    var l = e.alternate;
    return l === null ? (e.childLanes = 0, e.lanes = t, e.child = null, e.subtreeFlags = 0, e.memoizedProps = null, e.memoizedState = null, e.updateQueue = null, e.dependencies = null, e.stateNode = null) : (e.childLanes = l.childLanes, e.lanes = l.lanes, e.child = l.child, e.subtreeFlags = 0, e.deletions = null, e.memoizedProps = l.memoizedProps, e.memoizedState = l.memoizedState, e.updateQueue = l.updateQueue, e.type = l.type, t = l.dependencies, e.dependencies = t === null ? null : {
      lanes: t.lanes,
      firstContext: t.firstContext
    }), e;
  }
  function Fi(e, t, l, r, s, c) {
    var h = 0;
    if (r = e, typeof e == "function") Vu(e) && (h = 1);
    else if (typeof e == "string")
      h = b1(
        e,
        l,
        $.current
      ) ? 26 : e === "html" || e === "head" || e === "body" ? 27 : 5;
    else
      e: switch (e) {
        case G:
          return e = Nn(31, l, t, s), e.elementType = G, e.lanes = c, e;
        case A:
          return Vo(l.children, s, c, t);
        case T:
          h = 8, s |= 24;
          break;
        case z:
          return e = Nn(12, l, t, s | 2), e.elementType = z, e.lanes = c, e;
        case L:
          return e = Nn(13, l, t, s), e.elementType = L, e.lanes = c, e;
        case j:
          return e = Nn(19, l, t, s), e.elementType = j, e.lanes = c, e;
        default:
          if (typeof e == "object" && e !== null)
            switch (e.$$typeof) {
              case D:
                h = 10;
                break e;
              case M:
                h = 9;
                break e;
              case N:
                h = 11;
                break e;
              case H:
                h = 14;
                break e;
              case k:
                h = 16, r = null;
                break e;
            }
          h = 29, l = Error(
            i(130, e === null ? "null" : typeof e, "")
          ), r = null;
      }
    return t = Nn(h, l, t, s), t.elementType = e, t.type = r, t.lanes = c, t;
  }
  function Vo(e, t, l, r) {
    return e = Nn(7, e, r, t), e.lanes = l, e;
  }
  function Pu(e, t, l) {
    return e = Nn(6, e, null, t), e.lanes = l, e;
  }
  function sm(e) {
    var t = Nn(18, null, null, 0);
    return t.stateNode = e, t;
  }
  function Yu(e, t, l) {
    return t = Nn(
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
  var cm = /* @__PURE__ */ new WeakMap();
  function Xn(e, t) {
    if (typeof e == "object" && e !== null) {
      var l = cm.get(e);
      return l !== void 0 ? l : (t = {
        value: e,
        source: t,
        stack: Ce(t)
      }, cm.set(e, t), t);
    }
    return {
      value: e,
      source: t,
      stack: Ce(t)
    };
  }
  var Rr = [], Cr = 0, Ki = null, Sa = 0, Fn = [], Kn = 0, Wl = null, al = 1, il = "";
  function wl(e, t) {
    Rr[Cr++] = Sa, Rr[Cr++] = Ki, Ki = e, Sa = t;
  }
  function um(e, t, l) {
    Fn[Kn++] = al, Fn[Kn++] = il, Fn[Kn++] = Wl, Wl = e;
    var r = al;
    e = il;
    var s = 32 - yt(r) - 1;
    r &= ~(1 << s), l += 1;
    var c = 32 - yt(t) + s;
    if (30 < c) {
      var h = s - s % 5;
      c = (r & (1 << h) - 1).toString(32), r >>= h, s -= h, al = 1 << 32 - yt(t) + s | l << s | r, il = c + e;
    } else
      al = 1 << c | l << s | r, il = e;
  }
  function Gu(e) {
    e.return !== null && (wl(e, 1), um(e, 1, 0));
  }
  function qu(e) {
    for (; e === Ki; )
      Ki = Rr[--Cr], Rr[Cr] = null, Sa = Rr[--Cr], Rr[Cr] = null;
    for (; e === Wl; )
      Wl = Fn[--Kn], Fn[Kn] = null, il = Fn[--Kn], Fn[Kn] = null, al = Fn[--Kn], Fn[Kn] = null;
  }
  function fm(e, t) {
    Fn[Kn++] = al, Fn[Kn++] = il, Fn[Kn++] = Wl, al = t.id, il = t.overflow, Wl = e;
  }
  var un = null, kt = null, st = !1, eo = null, Qn = !1, Xu = Error(i(519));
  function to(e) {
    var t = Error(
      i(
        418,
        1 < arguments.length && arguments[1] !== void 0 && arguments[1] ? "text" : "HTML",
        ""
      )
    );
    throw wa(Xn(t, e)), Xu;
  }
  function dm(e) {
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
        for (l = 0; l < Ga.length; l++)
          ot(Ga[l], t);
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
        ot("invalid", t), Rg(
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
        ot("invalid", t), Og(t, r.value, r.defaultValue, r.children);
    }
    l = r.children, typeof l != "string" && typeof l != "number" && typeof l != "bigint" || t.textContent === "" + l || r.suppressHydrationWarning === !0 || Ay(t.textContent, l) ? (r.popover != null && (ot("beforetoggle", t), ot("toggle", t)), r.onScroll != null && ot("scroll", t), r.onScrollEnd != null && ot("scrollend", t), r.onClick != null && (t.onclick = bl), t = !0) : t = !1, t || to(e, !0);
  }
  function pm(e) {
    for (un = e.return; un; )
      switch (un.tag) {
        case 5:
        case 31:
        case 13:
          Qn = !1;
          return;
        case 27:
        case 3:
          Qn = !0;
          return;
        default:
          un = un.return;
      }
  }
  function Or(e) {
    if (e !== un) return !1;
    if (!st) return pm(e), st = !0, !1;
    var t = e.tag, l;
    if ((l = t !== 3 && t !== 27) && ((l = t === 5) && (l = e.type, l = !(l !== "form" && l !== "button") || fd(e.type, e.memoizedProps)), l = !l), l && kt && to(e), pm(e), t === 13) {
      if (e = e.memoizedState, e = e !== null ? e.dehydrated : null, !e) throw Error(i(317));
      kt = Ly(e);
    } else if (t === 31) {
      if (e = e.memoizedState, e = e !== null ? e.dehydrated : null, !e) throw Error(i(317));
      kt = Ly(e);
    } else
      t === 27 ? (t = kt, ho(e.type) ? (e = hd, hd = null, kt = e) : kt = t) : kt = un ? Jn(e.stateNode.nextSibling) : null;
    return !0;
  }
  function Po() {
    kt = un = null, st = !1;
  }
  function Fu() {
    var e = eo;
    return e !== null && (Cn === null ? Cn = e : Cn.push.apply(
      Cn,
      e
    ), eo = null), e;
  }
  function wa(e) {
    eo === null ? eo = [e] : eo.push(e);
  }
  var Ku = O(null), Yo = null, El = null;
  function no(e, t, l) {
    ne(Ku, t._currentValue), t._currentValue = l;
  }
  function Tl(e) {
    e._currentValue = Ku.current, U(Ku);
  }
  function Qu(e, t, l) {
    for (; e !== null; ) {
      var r = e.alternate;
      if ((e.childLanes & t) !== t ? (e.childLanes |= t, r !== null && (r.childLanes |= t)) : r !== null && (r.childLanes & t) !== t && (r.childLanes |= t), e === l) break;
      e = e.return;
    }
  }
  function Zu(e, t, l, r) {
    var s = e.child;
    for (s !== null && (s.return = e); s !== null; ) {
      var c = s.dependencies;
      if (c !== null) {
        var h = s.child;
        c = c.firstContext;
        e: for (; c !== null; ) {
          var R = c;
          c = s;
          for (var I = 0; I < t.length; I++)
            if (R.context === t[I]) {
              c.lanes |= l, R = c.alternate, R !== null && (R.lanes |= l), Qu(
                c.return,
                l,
                e
              ), r || (h = null);
              break e;
            }
          c = R.next;
        }
      } else if (s.tag === 18) {
        if (h = s.return, h === null) throw Error(i(341));
        h.lanes |= l, c = h.alternate, c !== null && (c.lanes |= l), Qu(h, l, e), h = null;
      } else h = s.child;
      if (h !== null) h.return = s;
      else
        for (h = s; h !== null; ) {
          if (h === e) {
            h = null;
            break;
          }
          if (s = h.sibling, s !== null) {
            s.return = h.return, h = s;
            break;
          }
          h = h.return;
        }
      s = h;
    }
  }
  function Mr(e, t, l, r) {
    e = null;
    for (var s = t, c = !1; s !== null; ) {
      if (!c) {
        if ((s.flags & 524288) !== 0) c = !0;
        else if ((s.flags & 262144) !== 0) break;
      }
      if (s.tag === 10) {
        var h = s.alternate;
        if (h === null) throw Error(i(387));
        if (h = h.memoizedProps, h !== null) {
          var R = s.type;
          Dn(s.pendingProps.value, h.value) || (e !== null ? e.push(R) : e = [R]);
        }
      } else if (s === oe.current) {
        if (h = s.alternate, h === null) throw Error(i(387));
        h.memoizedState.memoizedState !== s.memoizedState.memoizedState && (e !== null ? e.push(Qa) : e = [Qa]);
      }
      s = s.return;
    }
    e !== null && Zu(
      t,
      e,
      l,
      r
    ), t.flags |= 262144;
  }
  function Qi(e) {
    for (e = e.firstContext; e !== null; ) {
      if (!Dn(
        e.context._currentValue,
        e.memoizedValue
      ))
        return !0;
      e = e.next;
    }
    return !1;
  }
  function Go(e) {
    Yo = e, El = null, e = e.dependencies, e !== null && (e.firstContext = null);
  }
  function fn(e) {
    return gm(Yo, e);
  }
  function Zi(e, t) {
    return Yo === null && Go(e), gm(e, t);
  }
  function gm(e, t) {
    var l = t._currentValue;
    if (t = { context: t, memoizedValue: l, next: null }, El === null) {
      if (e === null) throw Error(i(308));
      El = t, e.dependencies = { lanes: 0, firstContext: t }, e.flags |= 524288;
    } else El = El.next = t;
    return l;
  }
  var mw = typeof AbortController < "u" ? AbortController : function() {
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
  }, hw = n.unstable_scheduleCallback, yw = n.unstable_NormalPriority, Zt = {
    $$typeof: D,
    Consumer: null,
    Provider: null,
    _currentValue: null,
    _currentValue2: null,
    _threadCount: 0
  };
  function Ju() {
    return {
      controller: new mw(),
      data: /* @__PURE__ */ new Map(),
      refCount: 0
    };
  }
  function Ea(e) {
    e.refCount--, e.refCount === 0 && hw(yw, function() {
      e.controller.abort();
    });
  }
  var Ta = null, $u = 0, Ar = 0, zr = null;
  function vw(e, t) {
    if (Ta === null) {
      var l = Ta = [];
      $u = 0, Ar = nd(), zr = {
        status: "pending",
        value: void 0,
        then: function(r) {
          l.push(r);
        }
      };
    }
    return $u++, t.then(mm, mm), t;
  }
  function mm() {
    if (--$u === 0 && Ta !== null) {
      zr !== null && (zr.status = "fulfilled");
      var e = Ta;
      Ta = null, Ar = 0, zr = null;
      for (var t = 0; t < e.length; t++) (0, e[t])();
    }
  }
  function bw(e, t) {
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
  var hm = _.S;
  _.S = function(e, t) {
    Wh = ae(), typeof t == "object" && t !== null && typeof t.then == "function" && vw(e, t), hm !== null && hm(e, t);
  };
  var qo = O(null);
  function Wu() {
    var e = qo.current;
    return e !== null ? e : Mt.pooledCache;
  }
  function Ji(e, t) {
    t === null ? ne(qo, qo.current) : ne(qo, t.pool);
  }
  function ym() {
    var e = Wu();
    return e === null ? null : { parent: Zt._currentValue, pool: e };
  }
  var Dr = Error(i(460)), ef = Error(i(474)), $i = Error(i(542)), Wi = { then: function() {
  } };
  function vm(e) {
    return e = e.status, e === "fulfilled" || e === "rejected";
  }
  function bm(e, t, l) {
    switch (l = e[l], l === void 0 ? e.push(t) : l !== t && (t.then(bl, bl), t = l), t.status) {
      case "fulfilled":
        return t.value;
      case "rejected":
        throw e = t.reason, Sm(e), e;
      default:
        if (typeof t.status == "string") t.then(bl, bl);
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
            throw e = t.reason, Sm(e), e;
        }
        throw Fo = t, Dr;
    }
  }
  function Xo(e) {
    try {
      var t = e._init;
      return t(e._payload);
    } catch (l) {
      throw l !== null && typeof l == "object" && typeof l.then == "function" ? (Fo = l, Dr) : l;
    }
  }
  var Fo = null;
  function xm() {
    if (Fo === null) throw Error(i(459));
    var e = Fo;
    return Fo = null, e;
  }
  function Sm(e) {
    if (e === Dr || e === $i)
      throw Error(i(483));
  }
  var Nr = null, Ra = 0;
  function es(e) {
    var t = Ra;
    return Ra += 1, Nr === null && (Nr = []), bm(Nr, e, t);
  }
  function Ca(e, t) {
    t = t.props.ref, e.ref = t !== void 0 ? t : null;
  }
  function ts(e, t) {
    throw t.$$typeof === S ? Error(i(525)) : (e = Object.prototype.toString.call(t), Error(
      i(
        31,
        e === "[object Object]" ? "object with keys {" + Object.keys(t).join(", ") + "}" : e
      )
    ));
  }
  function wm(e) {
    function t(F, P) {
      if (e) {
        var W = F.deletions;
        W === null ? (F.deletions = [P], F.flags |= 16) : W.push(P);
      }
    }
    function l(F, P) {
      if (!e) return null;
      for (; P !== null; )
        t(F, P), P = P.sibling;
      return null;
    }
    function r(F) {
      for (var P = /* @__PURE__ */ new Map(); F !== null; )
        F.key !== null ? P.set(F.key, F) : P.set(F.index, F), F = F.sibling;
      return P;
    }
    function s(F, P) {
      return F = Sl(F, P), F.index = 0, F.sibling = null, F;
    }
    function c(F, P, W) {
      return F.index = W, e ? (W = F.alternate, W !== null ? (W = W.index, W < P ? (F.flags |= 67108866, P) : W) : (F.flags |= 67108866, P)) : (F.flags |= 1048576, P);
    }
    function h(F) {
      return e && F.alternate === null && (F.flags |= 67108866), F;
    }
    function R(F, P, W, ue) {
      return P === null || P.tag !== 6 ? (P = Pu(W, F.mode, ue), P.return = F, P) : (P = s(P, W), P.return = F, P);
    }
    function I(F, P, W, ue) {
      var Ie = W.type;
      return Ie === A ? ce(
        F,
        P,
        W.props.children,
        ue,
        W.key
      ) : P !== null && (P.elementType === Ie || typeof Ie == "object" && Ie !== null && Ie.$$typeof === k && Xo(Ie) === P.type) ? (P = s(P, W.props), Ca(P, W), P.return = F, P) : (P = Fi(
        W.type,
        W.key,
        W.props,
        null,
        F.mode,
        ue
      ), Ca(P, W), P.return = F, P);
    }
    function ee(F, P, W, ue) {
      return P === null || P.tag !== 4 || P.stateNode.containerInfo !== W.containerInfo || P.stateNode.implementation !== W.implementation ? (P = Yu(W, F.mode, ue), P.return = F, P) : (P = s(P, W.children || []), P.return = F, P);
    }
    function ce(F, P, W, ue, Ie) {
      return P === null || P.tag !== 7 ? (P = Vo(
        W,
        F.mode,
        ue,
        Ie
      ), P.return = F, P) : (P = s(P, W), P.return = F, P);
    }
    function de(F, P, W) {
      if (typeof P == "string" && P !== "" || typeof P == "number" || typeof P == "bigint")
        return P = Pu(
          "" + P,
          F.mode,
          W
        ), P.return = F, P;
      if (typeof P == "object" && P !== null) {
        switch (P.$$typeof) {
          case C:
            return W = Fi(
              P.type,
              P.key,
              P.props,
              null,
              F.mode,
              W
            ), Ca(W, P), W.return = F, W;
          case w:
            return P = Yu(
              P,
              F.mode,
              W
            ), P.return = F, P;
          case k:
            return P = Xo(P), de(F, P, W);
        }
        if (q(P) || J(P))
          return P = Vo(
            P,
            F.mode,
            W,
            null
          ), P.return = F, P;
        if (typeof P.then == "function")
          return de(F, es(P), W);
        if (P.$$typeof === D)
          return de(
            F,
            Zi(F, P),
            W
          );
        ts(F, P);
      }
      return null;
    }
    function te(F, P, W, ue) {
      var Ie = P !== null ? P.key : null;
      if (typeof W == "string" && W !== "" || typeof W == "number" || typeof W == "bigint")
        return Ie !== null ? null : R(F, P, "" + W, ue);
      if (typeof W == "object" && W !== null) {
        switch (W.$$typeof) {
          case C:
            return W.key === Ie ? I(F, P, W, ue) : null;
          case w:
            return W.key === Ie ? ee(F, P, W, ue) : null;
          case k:
            return W = Xo(W), te(F, P, W, ue);
        }
        if (q(W) || J(W))
          return Ie !== null ? null : ce(F, P, W, ue, null);
        if (typeof W.then == "function")
          return te(
            F,
            P,
            es(W),
            ue
          );
        if (W.$$typeof === D)
          return te(
            F,
            P,
            Zi(F, W),
            ue
          );
        ts(F, W);
      }
      return null;
    }
    function le(F, P, W, ue, Ie) {
      if (typeof ue == "string" && ue !== "" || typeof ue == "number" || typeof ue == "bigint")
        return F = F.get(W) || null, R(P, F, "" + ue, Ie);
      if (typeof ue == "object" && ue !== null) {
        switch (ue.$$typeof) {
          case C:
            return F = F.get(
              ue.key === null ? W : ue.key
            ) || null, I(P, F, ue, Ie);
          case w:
            return F = F.get(
              ue.key === null ? W : ue.key
            ) || null, ee(P, F, ue, Ie);
          case k:
            return ue = Xo(ue), le(
              F,
              P,
              W,
              ue,
              Ie
            );
        }
        if (q(ue) || J(ue))
          return F = F.get(W) || null, ce(P, F, ue, Ie, null);
        if (typeof ue.then == "function")
          return le(
            F,
            P,
            W,
            es(ue),
            Ie
          );
        if (ue.$$typeof === D)
          return le(
            F,
            P,
            W,
            Zi(P, ue),
            Ie
          );
        ts(P, ue);
      }
      return null;
    }
    function De(F, P, W, ue) {
      for (var Ie = null, ct = null, Ne = P, Fe = P = 0, it = null; Ne !== null && Fe < W.length; Fe++) {
        Ne.index > Fe ? (it = Ne, Ne = null) : it = Ne.sibling;
        var ut = te(
          F,
          Ne,
          W[Fe],
          ue
        );
        if (ut === null) {
          Ne === null && (Ne = it);
          break;
        }
        e && Ne && ut.alternate === null && t(F, Ne), P = c(ut, P, Fe), ct === null ? Ie = ut : ct.sibling = ut, ct = ut, Ne = it;
      }
      if (Fe === W.length)
        return l(F, Ne), st && wl(F, Fe), Ie;
      if (Ne === null) {
        for (; Fe < W.length; Fe++)
          Ne = de(F, W[Fe], ue), Ne !== null && (P = c(
            Ne,
            P,
            Fe
          ), ct === null ? Ie = Ne : ct.sibling = Ne, ct = Ne);
        return st && wl(F, Fe), Ie;
      }
      for (Ne = r(Ne); Fe < W.length; Fe++)
        it = le(
          Ne,
          F,
          Fe,
          W[Fe],
          ue
        ), it !== null && (e && it.alternate !== null && Ne.delete(
          it.key === null ? Fe : it.key
        ), P = c(
          it,
          P,
          Fe
        ), ct === null ? Ie = it : ct.sibling = it, ct = it);
      return e && Ne.forEach(function(So) {
        return t(F, So);
      }), st && wl(F, Fe), Ie;
    }
    function Ve(F, P, W, ue) {
      if (W == null) throw Error(i(151));
      for (var Ie = null, ct = null, Ne = P, Fe = P = 0, it = null, ut = W.next(); Ne !== null && !ut.done; Fe++, ut = W.next()) {
        Ne.index > Fe ? (it = Ne, Ne = null) : it = Ne.sibling;
        var So = te(F, Ne, ut.value, ue);
        if (So === null) {
          Ne === null && (Ne = it);
          break;
        }
        e && Ne && So.alternate === null && t(F, Ne), P = c(So, P, Fe), ct === null ? Ie = So : ct.sibling = So, ct = So, Ne = it;
      }
      if (ut.done)
        return l(F, Ne), st && wl(F, Fe), Ie;
      if (Ne === null) {
        for (; !ut.done; Fe++, ut = W.next())
          ut = de(F, ut.value, ue), ut !== null && (P = c(ut, P, Fe), ct === null ? Ie = ut : ct.sibling = ut, ct = ut);
        return st && wl(F, Fe), Ie;
      }
      for (Ne = r(Ne); !ut.done; Fe++, ut = W.next())
        ut = le(Ne, F, Fe, ut.value, ue), ut !== null && (e && ut.alternate !== null && Ne.delete(ut.key === null ? Fe : ut.key), P = c(ut, P, Fe), ct === null ? Ie = ut : ct.sibling = ut, ct = ut);
      return e && Ne.forEach(function(z1) {
        return t(F, z1);
      }), st && wl(F, Fe), Ie;
    }
    function Tt(F, P, W, ue) {
      if (typeof W == "object" && W !== null && W.type === A && W.key === null && (W = W.props.children), typeof W == "object" && W !== null) {
        switch (W.$$typeof) {
          case C:
            e: {
              for (var Ie = W.key; P !== null; ) {
                if (P.key === Ie) {
                  if (Ie = W.type, Ie === A) {
                    if (P.tag === 7) {
                      l(
                        F,
                        P.sibling
                      ), ue = s(
                        P,
                        W.props.children
                      ), ue.return = F, F = ue;
                      break e;
                    }
                  } else if (P.elementType === Ie || typeof Ie == "object" && Ie !== null && Ie.$$typeof === k && Xo(Ie) === P.type) {
                    l(
                      F,
                      P.sibling
                    ), ue = s(P, W.props), Ca(ue, W), ue.return = F, F = ue;
                    break e;
                  }
                  l(F, P);
                  break;
                } else t(F, P);
                P = P.sibling;
              }
              W.type === A ? (ue = Vo(
                W.props.children,
                F.mode,
                ue,
                W.key
              ), ue.return = F, F = ue) : (ue = Fi(
                W.type,
                W.key,
                W.props,
                null,
                F.mode,
                ue
              ), Ca(ue, W), ue.return = F, F = ue);
            }
            return h(F);
          case w:
            e: {
              for (Ie = W.key; P !== null; ) {
                if (P.key === Ie)
                  if (P.tag === 4 && P.stateNode.containerInfo === W.containerInfo && P.stateNode.implementation === W.implementation) {
                    l(
                      F,
                      P.sibling
                    ), ue = s(P, W.children || []), ue.return = F, F = ue;
                    break e;
                  } else {
                    l(F, P);
                    break;
                  }
                else t(F, P);
                P = P.sibling;
              }
              ue = Yu(W, F.mode, ue), ue.return = F, F = ue;
            }
            return h(F);
          case k:
            return W = Xo(W), Tt(
              F,
              P,
              W,
              ue
            );
        }
        if (q(W))
          return De(
            F,
            P,
            W,
            ue
          );
        if (J(W)) {
          if (Ie = J(W), typeof Ie != "function") throw Error(i(150));
          return W = Ie.call(W), Ve(
            F,
            P,
            W,
            ue
          );
        }
        if (typeof W.then == "function")
          return Tt(
            F,
            P,
            es(W),
            ue
          );
        if (W.$$typeof === D)
          return Tt(
            F,
            P,
            Zi(F, W),
            ue
          );
        ts(F, W);
      }
      return typeof W == "string" && W !== "" || typeof W == "number" || typeof W == "bigint" ? (W = "" + W, P !== null && P.tag === 6 ? (l(F, P.sibling), ue = s(P, W), ue.return = F, F = ue) : (l(F, P), ue = Pu(W, F.mode, ue), ue.return = F, F = ue), h(F)) : l(F, P);
    }
    return function(F, P, W, ue) {
      try {
        Ra = 0;
        var Ie = Tt(
          F,
          P,
          W,
          ue
        );
        return Nr = null, Ie;
      } catch (Ne) {
        if (Ne === Dr || Ne === $i) throw Ne;
        var ct = Nn(29, Ne, null, F.mode);
        return ct.lanes = ue, ct.return = F, ct;
      }
    };
  }
  var Ko = wm(!0), Em = wm(!1), lo = !1;
  function tf(e) {
    e.updateQueue = {
      baseState: e.memoizedState,
      firstBaseUpdate: null,
      lastBaseUpdate: null,
      shared: { pending: null, lanes: 0, hiddenCallbacks: null },
      callbacks: null
    };
  }
  function nf(e, t) {
    e = e.updateQueue, t.updateQueue === e && (t.updateQueue = {
      baseState: e.baseState,
      firstBaseUpdate: e.firstBaseUpdate,
      lastBaseUpdate: e.lastBaseUpdate,
      shared: e.shared,
      callbacks: null
    });
  }
  function oo(e) {
    return { lane: e, tag: 0, payload: null, callback: null, next: null };
  }
  function ro(e, t, l) {
    var r = e.updateQueue;
    if (r === null) return null;
    if (r = r.shared, (dt & 2) !== 0) {
      var s = r.pending;
      return s === null ? t.next = t : (t.next = s.next, s.next = t), r.pending = t, t = Xi(e), am(e, null, l), t;
    }
    return qi(e, r, t, l), Xi(e);
  }
  function Oa(e, t, l) {
    if (t = t.updateQueue, t !== null && (t = t.shared, (l & 4194048) !== 0)) {
      var r = t.lanes;
      r &= e.pendingLanes, l |= r, t.lanes = l, tl(e, l);
    }
  }
  function lf(e, t) {
    var l = e.updateQueue, r = e.alternate;
    if (r !== null && (r = r.updateQueue, l === r)) {
      var s = null, c = null;
      if (l = l.firstBaseUpdate, l !== null) {
        do {
          var h = {
            lane: l.lane,
            tag: l.tag,
            payload: l.payload,
            callback: null,
            next: null
          };
          c === null ? s = c = h : c = c.next = h, l = l.next;
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
  var of = !1;
  function Ma() {
    if (of) {
      var e = zr;
      if (e !== null) throw e;
    }
  }
  function Aa(e, t, l, r) {
    of = !1;
    var s = e.updateQueue;
    lo = !1;
    var c = s.firstBaseUpdate, h = s.lastBaseUpdate, R = s.shared.pending;
    if (R !== null) {
      s.shared.pending = null;
      var I = R, ee = I.next;
      I.next = null, h === null ? c = ee : h.next = ee, h = I;
      var ce = e.alternate;
      ce !== null && (ce = ce.updateQueue, R = ce.lastBaseUpdate, R !== h && (R === null ? ce.firstBaseUpdate = ee : R.next = ee, ce.lastBaseUpdate = I));
    }
    if (c !== null) {
      var de = s.baseState;
      h = 0, ce = ee = I = null, R = c;
      do {
        var te = R.lane & -536870913, le = te !== R.lane;
        if (le ? (at & te) === te : (r & te) === te) {
          te !== 0 && te === Ar && (of = !0), ce !== null && (ce = ce.next = {
            lane: 0,
            tag: R.tag,
            payload: R.payload,
            callback: null,
            next: null
          });
          e: {
            var De = e, Ve = R;
            te = t;
            var Tt = l;
            switch (Ve.tag) {
              case 1:
                if (De = Ve.payload, typeof De == "function") {
                  de = De.call(Tt, de, te);
                  break e;
                }
                de = De;
                break e;
              case 3:
                De.flags = De.flags & -65537 | 128;
              case 0:
                if (De = Ve.payload, te = typeof De == "function" ? De.call(Tt, de, te) : De, te == null) break e;
                de = b({}, de, te);
                break e;
              case 2:
                lo = !0;
            }
          }
          te = R.callback, te !== null && (e.flags |= 64, le && (e.flags |= 8192), le = s.callbacks, le === null ? s.callbacks = [te] : le.push(te));
        } else
          le = {
            lane: te,
            tag: R.tag,
            payload: R.payload,
            callback: R.callback,
            next: null
          }, ce === null ? (ee = ce = le, I = de) : ce = ce.next = le, h |= te;
        if (R = R.next, R === null) {
          if (R = s.shared.pending, R === null)
            break;
          le = R, R = le.next, le.next = null, s.lastBaseUpdate = le, s.shared.pending = null;
        }
      } while (!0);
      ce === null && (I = de), s.baseState = I, s.firstBaseUpdate = ee, s.lastBaseUpdate = ce, c === null && (s.shared.lanes = 0), uo |= h, e.lanes = h, e.memoizedState = de;
    }
  }
  function Tm(e, t) {
    if (typeof e != "function")
      throw Error(i(191, e));
    e.call(t);
  }
  function Rm(e, t) {
    var l = e.callbacks;
    if (l !== null)
      for (e.callbacks = null, e = 0; e < l.length; e++)
        Tm(l[e], t);
  }
  var jr = O(null), ns = O(0);
  function Cm(e, t) {
    e = jl, ne(ns, e), ne(jr, t), jl = e | t.baseLanes;
  }
  function rf() {
    ne(ns, jl), ne(jr, jr.current);
  }
  function af() {
    jl = ns.current, U(jr), U(ns);
  }
  var jn = O(null), Zn = null;
  function ao(e) {
    var t = e.alternate;
    ne(Ft, Ft.current & 1), ne(jn, e), Zn === null && (t === null || jr.current !== null || t.memoizedState !== null) && (Zn = e);
  }
  function sf(e) {
    ne(Ft, Ft.current), ne(jn, e), Zn === null && (Zn = e);
  }
  function Om(e) {
    e.tag === 22 ? (ne(Ft, Ft.current), ne(jn, e), Zn === null && (Zn = e)) : io();
  }
  function io() {
    ne(Ft, Ft.current), ne(jn, jn.current);
  }
  function kn(e) {
    U(jn), Zn === e && (Zn = null), U(Ft);
  }
  var Ft = O(0);
  function ls(e) {
    for (var t = e; t !== null; ) {
      if (t.tag === 13) {
        var l = t.memoizedState;
        if (l !== null && (l = l.dehydrated, l === null || gd(l) || md(l)))
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
  var Rl = 0, Xe = null, wt = null, Jt = null, os = !1, kr = !1, Qo = !1, rs = 0, za = 0, _r = null, xw = 0;
  function Bt() {
    throw Error(i(321));
  }
  function cf(e, t) {
    if (t === null) return !1;
    for (var l = 0; l < t.length && l < e.length; l++)
      if (!Dn(e[l], t[l])) return !1;
    return !0;
  }
  function uf(e, t, l, r, s, c) {
    return Rl = c, Xe = t, t.memoizedState = null, t.updateQueue = null, t.lanes = 0, _.H = e === null || e.memoizedState === null ? uh : Rf, Qo = !1, c = l(r, s), Qo = !1, kr && (c = Am(
      t,
      l,
      r,
      s
    )), Mm(e), c;
  }
  function Mm(e) {
    _.H = ja;
    var t = wt !== null && wt.next !== null;
    if (Rl = 0, Jt = wt = Xe = null, os = !1, za = 0, _r = null, t) throw Error(i(300));
    e === null || $t || (e = e.dependencies, e !== null && Qi(e) && ($t = !0));
  }
  function Am(e, t, l, r) {
    Xe = e;
    var s = 0;
    do {
      if (kr && (_r = null), za = 0, kr = !1, 25 <= s) throw Error(i(301));
      if (s += 1, Jt = wt = null, e.updateQueue != null) {
        var c = e.updateQueue;
        c.lastEffect = null, c.events = null, c.stores = null, c.memoCache != null && (c.memoCache.index = 0);
      }
      _.H = fh, c = t(l, r);
    } while (kr);
    return c;
  }
  function Sw() {
    var e = _.H, t = e.useState()[0];
    return t = typeof t.then == "function" ? Da(t) : t, e = e.useState()[0], (wt !== null ? wt.memoizedState : null) !== e && (Xe.flags |= 1024), t;
  }
  function ff() {
    var e = rs !== 0;
    return rs = 0, e;
  }
  function df(e, t, l) {
    t.updateQueue = e.updateQueue, t.flags &= -2053, e.lanes &= ~l;
  }
  function pf(e) {
    if (os) {
      for (e = e.memoizedState; e !== null; ) {
        var t = e.queue;
        t !== null && (t.pending = null), e = e.next;
      }
      os = !1;
    }
    Rl = 0, Jt = wt = Xe = null, kr = !1, za = rs = 0, _r = null;
  }
  function yn() {
    var e = {
      memoizedState: null,
      baseState: null,
      baseQueue: null,
      queue: null,
      next: null
    };
    return Jt === null ? Xe.memoizedState = Jt = e : Jt = Jt.next = e, Jt;
  }
  function Kt() {
    if (wt === null) {
      var e = Xe.alternate;
      e = e !== null ? e.memoizedState : null;
    } else e = wt.next;
    var t = Jt === null ? Xe.memoizedState : Jt.next;
    if (t !== null)
      Jt = t, wt = e;
    else {
      if (e === null)
        throw Xe.alternate === null ? Error(i(467)) : Error(i(310));
      wt = e, e = {
        memoizedState: wt.memoizedState,
        baseState: wt.baseState,
        baseQueue: wt.baseQueue,
        queue: wt.queue,
        next: null
      }, Jt === null ? Xe.memoizedState = Jt = e : Jt = Jt.next = e;
    }
    return Jt;
  }
  function as() {
    return { lastEffect: null, events: null, stores: null, memoCache: null };
  }
  function Da(e) {
    var t = za;
    return za += 1, _r === null && (_r = []), e = bm(_r, e, t), t = Xe, (Jt === null ? t.memoizedState : Jt.next) === null && (t = t.alternate, _.H = t === null || t.memoizedState === null ? uh : Rf), e;
  }
  function is(e) {
    if (e !== null && typeof e == "object") {
      if (typeof e.then == "function") return Da(e);
      if (e.$$typeof === D) return fn(e);
    }
    throw Error(i(438, String(e)));
  }
  function gf(e) {
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
    if (t == null && (t = { data: [], index: 0 }), l === null && (l = as(), Xe.updateQueue = l), l.memoCache = t, l = t.data[t.index], l === void 0)
      for (l = t.data[t.index] = Array(e), r = 0; r < e; r++)
        l[r] = E;
    return t.index++, l;
  }
  function Cl(e, t) {
    return typeof t == "function" ? t(e) : t;
  }
  function ss(e) {
    var t = Kt();
    return mf(t, wt, e);
  }
  function mf(e, t, l) {
    var r = e.queue;
    if (r === null) throw Error(i(311));
    r.lastRenderedReducer = l;
    var s = e.baseQueue, c = r.pending;
    if (c !== null) {
      if (s !== null) {
        var h = s.next;
        s.next = c.next, c.next = h;
      }
      t.baseQueue = s = c, r.pending = null;
    }
    if (c = e.baseState, s === null) e.memoizedState = c;
    else {
      t = s.next;
      var R = h = null, I = null, ee = t, ce = !1;
      do {
        var de = ee.lane & -536870913;
        if (de !== ee.lane ? (at & de) === de : (Rl & de) === de) {
          var te = ee.revertLane;
          if (te === 0)
            I !== null && (I = I.next = {
              lane: 0,
              revertLane: 0,
              gesture: null,
              action: ee.action,
              hasEagerState: ee.hasEagerState,
              eagerState: ee.eagerState,
              next: null
            }), de === Ar && (ce = !0);
          else if ((Rl & te) === te) {
            ee = ee.next, te === Ar && (ce = !0);
            continue;
          } else
            de = {
              lane: 0,
              revertLane: ee.revertLane,
              gesture: null,
              action: ee.action,
              hasEagerState: ee.hasEagerState,
              eagerState: ee.eagerState,
              next: null
            }, I === null ? (R = I = de, h = c) : I = I.next = de, Xe.lanes |= te, uo |= te;
          de = ee.action, Qo && l(c, de), c = ee.hasEagerState ? ee.eagerState : l(c, de);
        } else
          te = {
            lane: de,
            revertLane: ee.revertLane,
            gesture: ee.gesture,
            action: ee.action,
            hasEagerState: ee.hasEagerState,
            eagerState: ee.eagerState,
            next: null
          }, I === null ? (R = I = te, h = c) : I = I.next = te, Xe.lanes |= de, uo |= de;
        ee = ee.next;
      } while (ee !== null && ee !== t);
      if (I === null ? h = c : I.next = R, !Dn(c, e.memoizedState) && ($t = !0, ce && (l = zr, l !== null)))
        throw l;
      e.memoizedState = c, e.baseState = h, e.baseQueue = I, r.lastRenderedState = c;
    }
    return s === null && (r.lanes = 0), [e.memoizedState, r.dispatch];
  }
  function hf(e) {
    var t = Kt(), l = t.queue;
    if (l === null) throw Error(i(311));
    l.lastRenderedReducer = e;
    var r = l.dispatch, s = l.pending, c = t.memoizedState;
    if (s !== null) {
      l.pending = null;
      var h = s = s.next;
      do
        c = e(c, h.action), h = h.next;
      while (h !== s);
      Dn(c, t.memoizedState) || ($t = !0), t.memoizedState = c, t.baseQueue === null && (t.baseState = c), l.lastRenderedState = c;
    }
    return [c, r];
  }
  function zm(e, t, l) {
    var r = Xe, s = Kt(), c = st;
    if (c) {
      if (l === void 0) throw Error(i(407));
      l = l();
    } else l = t();
    var h = !Dn(
      (wt || s).memoizedState,
      l
    );
    if (h && (s.memoizedState = l, $t = !0), s = s.queue, bf(jm.bind(null, r, s, e), [
      e
    ]), s.getSnapshot !== t || h || Jt !== null && Jt.memoizedState.tag & 1) {
      if (r.flags |= 2048, Hr(
        9,
        { destroy: void 0 },
        Nm.bind(
          null,
          r,
          s,
          l,
          t
        ),
        null
      ), Mt === null) throw Error(i(349));
      c || (Rl & 127) !== 0 || Dm(r, t, l);
    }
    return l;
  }
  function Dm(e, t, l) {
    e.flags |= 16384, e = { getSnapshot: t, value: l }, t = Xe.updateQueue, t === null ? (t = as(), Xe.updateQueue = t, t.stores = [e]) : (l = t.stores, l === null ? t.stores = [e] : l.push(e));
  }
  function Nm(e, t, l, r) {
    t.value = l, t.getSnapshot = r, km(t) && _m(e);
  }
  function jm(e, t, l) {
    return l(function() {
      km(t) && _m(e);
    });
  }
  function km(e) {
    var t = e.getSnapshot;
    e = e.value;
    try {
      var l = t();
      return !Dn(e, l);
    } catch {
      return !0;
    }
  }
  function _m(e) {
    var t = Bo(e, 2);
    t !== null && On(t, e, 2);
  }
  function yf(e) {
    var t = yn();
    if (typeof e == "function") {
      var l = e;
      if (e = l(), Qo) {
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
      lastRenderedReducer: Cl,
      lastRenderedState: e
    }, t;
  }
  function Hm(e, t, l, r) {
    return e.baseState = l, mf(
      e,
      wt,
      typeof r == "function" ? r : Cl
    );
  }
  function ww(e, t, l, r, s) {
    if (fs(e)) throw Error(i(485));
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
        then: function(h) {
          c.listeners.push(h);
        }
      };
      _.T !== null ? l(!0) : c.isTransition = !1, r(c), l = t.pending, l === null ? (c.next = t.pending = c, Um(t, c)) : (c.next = l.next, t.pending = l.next = c);
    }
  }
  function Um(e, t) {
    var l = t.action, r = t.payload, s = e.state;
    if (t.isTransition) {
      var c = _.T, h = {};
      _.T = h;
      try {
        var R = l(s, r), I = _.S;
        I !== null && I(h, R), Lm(e, t, R);
      } catch (ee) {
        vf(e, t, ee);
      } finally {
        c !== null && h.types !== null && (c.types = h.types), _.T = c;
      }
    } else
      try {
        c = l(s, r), Lm(e, t, c);
      } catch (ee) {
        vf(e, t, ee);
      }
  }
  function Lm(e, t, l) {
    l !== null && typeof l == "object" && typeof l.then == "function" ? l.then(
      function(r) {
        Im(e, t, r);
      },
      function(r) {
        return vf(e, t, r);
      }
    ) : Im(e, t, l);
  }
  function Im(e, t, l) {
    t.status = "fulfilled", t.value = l, Bm(t), e.state = l, t = e.pending, t !== null && (l = t.next, l === t ? e.pending = null : (l = l.next, t.next = l, Um(e, l)));
  }
  function vf(e, t, l) {
    var r = e.pending;
    if (e.pending = null, r !== null) {
      r = r.next;
      do
        t.status = "rejected", t.reason = l, Bm(t), t = t.next;
      while (t !== r);
    }
    e.action = null;
  }
  function Bm(e) {
    e = e.listeners;
    for (var t = 0; t < e.length; t++) (0, e[t])();
  }
  function Vm(e, t) {
    return t;
  }
  function Pm(e, t) {
    if (st) {
      var l = Mt.formState;
      if (l !== null) {
        e: {
          var r = Xe;
          if (st) {
            if (kt) {
              t: {
                for (var s = kt, c = Qn; s.nodeType !== 8; ) {
                  if (!c) {
                    s = null;
                    break t;
                  }
                  if (s = Jn(
                    s.nextSibling
                  ), s === null) {
                    s = null;
                    break t;
                  }
                }
                c = s.data, s = c === "F!" || c === "F" ? s : null;
              }
              if (s) {
                kt = Jn(
                  s.nextSibling
                ), r = s.data === "F!";
                break e;
              }
            }
            to(r);
          }
          r = !1;
        }
        r && (t = l[0]);
      }
    }
    return l = yn(), l.memoizedState = l.baseState = t, r = {
      pending: null,
      lanes: 0,
      dispatch: null,
      lastRenderedReducer: Vm,
      lastRenderedState: t
    }, l.queue = r, l = ih.bind(
      null,
      Xe,
      r
    ), r.dispatch = l, r = yf(!1), c = Tf.bind(
      null,
      Xe,
      !1,
      r.queue
    ), r = yn(), s = {
      state: t,
      dispatch: null,
      action: e,
      pending: null
    }, r.queue = s, l = ww.bind(
      null,
      Xe,
      s,
      c,
      l
    ), s.dispatch = l, r.memoizedState = e, [t, l, !1];
  }
  function Ym(e) {
    var t = Kt();
    return Gm(t, wt, e);
  }
  function Gm(e, t, l) {
    if (t = mf(
      e,
      t,
      Vm
    )[0], e = ss(Cl)[0], typeof t == "object" && t !== null && typeof t.then == "function")
      try {
        var r = Da(t);
      } catch (h) {
        throw h === Dr ? $i : h;
      }
    else r = t;
    t = Kt();
    var s = t.queue, c = s.dispatch;
    return l !== t.memoizedState && (Xe.flags |= 2048, Hr(
      9,
      { destroy: void 0 },
      Ew.bind(null, s, l),
      null
    )), [r, c, e];
  }
  function Ew(e, t) {
    e.action = t;
  }
  function qm(e) {
    var t = Kt(), l = wt;
    if (l !== null)
      return Gm(t, l, e);
    Kt(), t = t.memoizedState, l = Kt();
    var r = l.queue.dispatch;
    return l.memoizedState = e, [t, r, !1];
  }
  function Hr(e, t, l, r) {
    return e = { tag: e, create: l, deps: r, inst: t, next: null }, t = Xe.updateQueue, t === null && (t = as(), Xe.updateQueue = t), l = t.lastEffect, l === null ? t.lastEffect = e.next = e : (r = l.next, l.next = e, e.next = r, t.lastEffect = e), e;
  }
  function Xm() {
    return Kt().memoizedState;
  }
  function cs(e, t, l, r) {
    var s = yn();
    Xe.flags |= e, s.memoizedState = Hr(
      1 | t,
      { destroy: void 0 },
      l,
      r === void 0 ? null : r
    );
  }
  function us(e, t, l, r) {
    var s = Kt();
    r = r === void 0 ? null : r;
    var c = s.memoizedState.inst;
    wt !== null && r !== null && cf(r, wt.memoizedState.deps) ? s.memoizedState = Hr(t, c, l, r) : (Xe.flags |= e, s.memoizedState = Hr(
      1 | t,
      c,
      l,
      r
    ));
  }
  function Fm(e, t) {
    cs(8390656, 8, e, t);
  }
  function bf(e, t) {
    us(2048, 8, e, t);
  }
  function Tw(e) {
    Xe.flags |= 4;
    var t = Xe.updateQueue;
    if (t === null)
      t = as(), Xe.updateQueue = t, t.events = [e];
    else {
      var l = t.events;
      l === null ? t.events = [e] : l.push(e);
    }
  }
  function Km(e) {
    var t = Kt().memoizedState;
    return Tw({ ref: t, nextImpl: e }), function() {
      if ((dt & 2) !== 0) throw Error(i(440));
      return t.impl.apply(void 0, arguments);
    };
  }
  function Qm(e, t) {
    return us(4, 2, e, t);
  }
  function Zm(e, t) {
    return us(4, 4, e, t);
  }
  function Jm(e, t) {
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
  function $m(e, t, l) {
    l = l != null ? l.concat([e]) : null, us(4, 4, Jm.bind(null, t, e), l);
  }
  function xf() {
  }
  function Wm(e, t) {
    var l = Kt();
    t = t === void 0 ? null : t;
    var r = l.memoizedState;
    return t !== null && cf(t, r[1]) ? r[0] : (l.memoizedState = [e, t], e);
  }
  function eh(e, t) {
    var l = Kt();
    t = t === void 0 ? null : t;
    var r = l.memoizedState;
    if (t !== null && cf(t, r[1]))
      return r[0];
    if (r = e(), Qo) {
      zt(!0);
      try {
        e();
      } finally {
        zt(!1);
      }
    }
    return l.memoizedState = [r, t], r;
  }
  function Sf(e, t, l) {
    return l === void 0 || (Rl & 1073741824) !== 0 && (at & 261930) === 0 ? e.memoizedState = t : (e.memoizedState = l, e = ty(), Xe.lanes |= e, uo |= e, l);
  }
  function th(e, t, l, r) {
    return Dn(l, t) ? l : jr.current !== null ? (e = Sf(e, l, r), Dn(e, t) || ($t = !0), e) : (Rl & 42) === 0 || (Rl & 1073741824) !== 0 && (at & 261930) === 0 ? ($t = !0, e.memoizedState = l) : (e = ty(), Xe.lanes |= e, uo |= e, t);
  }
  function nh(e, t, l, r, s) {
    var c = Y.p;
    Y.p = c !== 0 && 8 > c ? c : 8;
    var h = _.T, R = {};
    _.T = R, Tf(e, !1, t, l);
    try {
      var I = s(), ee = _.S;
      if (ee !== null && ee(R, I), I !== null && typeof I == "object" && typeof I.then == "function") {
        var ce = bw(
          I,
          r
        );
        Na(
          e,
          t,
          ce,
          Un(e)
        );
      } else
        Na(
          e,
          t,
          r,
          Un(e)
        );
    } catch (de) {
      Na(
        e,
        t,
        { then: function() {
        }, status: "rejected", reason: de },
        Un()
      );
    } finally {
      Y.p = c, h !== null && R.types !== null && (h.types = R.types), _.T = h;
    }
  }
  function Rw() {
  }
  function wf(e, t, l, r) {
    if (e.tag !== 5) throw Error(i(476));
    var s = lh(e).queue;
    nh(
      e,
      s,
      t,
      V,
      l === null ? Rw : function() {
        return oh(e), l(r);
      }
    );
  }
  function lh(e) {
    var t = e.memoizedState;
    if (t !== null) return t;
    t = {
      memoizedState: V,
      baseState: V,
      baseQueue: null,
      queue: {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: Cl,
        lastRenderedState: V
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
        lastRenderedReducer: Cl,
        lastRenderedState: l
      },
      next: null
    }, e.memoizedState = t, e = e.alternate, e !== null && (e.memoizedState = t), t;
  }
  function oh(e) {
    var t = lh(e);
    t.next === null && (t = e.alternate.memoizedState), Na(
      e,
      t.next.queue,
      {},
      Un()
    );
  }
  function Ef() {
    return fn(Qa);
  }
  function rh() {
    return Kt().memoizedState;
  }
  function ah() {
    return Kt().memoizedState;
  }
  function Cw(e) {
    for (var t = e.return; t !== null; ) {
      switch (t.tag) {
        case 24:
        case 3:
          var l = Un();
          e = oo(l);
          var r = ro(t, e, l);
          r !== null && (On(r, t, l), Oa(r, t, l)), t = { cache: Ju() }, e.payload = t;
          return;
      }
      t = t.return;
    }
  }
  function Ow(e, t, l) {
    var r = Un();
    l = {
      lane: r,
      revertLane: 0,
      gesture: null,
      action: l,
      hasEagerState: !1,
      eagerState: null,
      next: null
    }, fs(e) ? sh(t, l) : (l = Bu(e, t, l, r), l !== null && (On(l, e, r), ch(l, t, r)));
  }
  function ih(e, t, l) {
    var r = Un();
    Na(e, t, l, r);
  }
  function Na(e, t, l, r) {
    var s = {
      lane: r,
      revertLane: 0,
      gesture: null,
      action: l,
      hasEagerState: !1,
      eagerState: null,
      next: null
    };
    if (fs(e)) sh(t, s);
    else {
      var c = e.alternate;
      if (e.lanes === 0 && (c === null || c.lanes === 0) && (c = t.lastRenderedReducer, c !== null))
        try {
          var h = t.lastRenderedState, R = c(h, l);
          if (s.hasEagerState = !0, s.eagerState = R, Dn(R, h))
            return qi(e, t, s, 0), Mt === null && Gi(), !1;
        } catch {
        }
      if (l = Bu(e, t, s, r), l !== null)
        return On(l, e, r), ch(l, t, r), !0;
    }
    return !1;
  }
  function Tf(e, t, l, r) {
    if (r = {
      lane: 2,
      revertLane: nd(),
      gesture: null,
      action: r,
      hasEagerState: !1,
      eagerState: null,
      next: null
    }, fs(e)) {
      if (t) throw Error(i(479));
    } else
      t = Bu(
        e,
        l,
        r,
        2
      ), t !== null && On(t, e, 2);
  }
  function fs(e) {
    var t = e.alternate;
    return e === Xe || t !== null && t === Xe;
  }
  function sh(e, t) {
    kr = os = !0;
    var l = e.pending;
    l === null ? t.next = t : (t.next = l.next, l.next = t), e.pending = t;
  }
  function ch(e, t, l) {
    if ((l & 4194048) !== 0) {
      var r = t.lanes;
      r &= e.pendingLanes, l |= r, t.lanes = l, tl(e, l);
    }
  }
  var ja = {
    readContext: fn,
    use: is,
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
  ja.useEffectEvent = Bt;
  var uh = {
    readContext: fn,
    use: is,
    useCallback: function(e, t) {
      return yn().memoizedState = [
        e,
        t === void 0 ? null : t
      ], e;
    },
    useContext: fn,
    useEffect: Fm,
    useImperativeHandle: function(e, t, l) {
      l = l != null ? l.concat([e]) : null, cs(
        4194308,
        4,
        Jm.bind(null, t, e),
        l
      );
    },
    useLayoutEffect: function(e, t) {
      return cs(4194308, 4, e, t);
    },
    useInsertionEffect: function(e, t) {
      cs(4, 2, e, t);
    },
    useMemo: function(e, t) {
      var l = yn();
      t = t === void 0 ? null : t;
      var r = e();
      if (Qo) {
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
      var r = yn();
      if (l !== void 0) {
        var s = l(t);
        if (Qo) {
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
      }, r.queue = e, e = e.dispatch = Ow.bind(
        null,
        Xe,
        e
      ), [r.memoizedState, e];
    },
    useRef: function(e) {
      var t = yn();
      return e = { current: e }, t.memoizedState = e;
    },
    useState: function(e) {
      e = yf(e);
      var t = e.queue, l = ih.bind(null, Xe, t);
      return t.dispatch = l, [e.memoizedState, l];
    },
    useDebugValue: xf,
    useDeferredValue: function(e, t) {
      var l = yn();
      return Sf(l, e, t);
    },
    useTransition: function() {
      var e = yf(!1);
      return e = nh.bind(
        null,
        Xe,
        e.queue,
        !0,
        !1
      ), yn().memoizedState = e, [!1, e];
    },
    useSyncExternalStore: function(e, t, l) {
      var r = Xe, s = yn();
      if (st) {
        if (l === void 0)
          throw Error(i(407));
        l = l();
      } else {
        if (l = t(), Mt === null)
          throw Error(i(349));
        (at & 127) !== 0 || Dm(r, t, l);
      }
      s.memoizedState = l;
      var c = { value: l, getSnapshot: t };
      return s.queue = c, Fm(jm.bind(null, r, c, e), [
        e
      ]), r.flags |= 2048, Hr(
        9,
        { destroy: void 0 },
        Nm.bind(
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
      var e = yn(), t = Mt.identifierPrefix;
      if (st) {
        var l = il, r = al;
        l = (r & ~(1 << 32 - yt(r) - 1)).toString(32) + l, t = "_" + t + "R_" + l, l = rs++, 0 < l && (t += "H" + l.toString(32)), t += "_";
      } else
        l = xw++, t = "_" + t + "r_" + l.toString(32) + "_";
      return e.memoizedState = t;
    },
    useHostTransitionStatus: Ef,
    useFormState: Pm,
    useActionState: Pm,
    useOptimistic: function(e) {
      var t = yn();
      t.memoizedState = t.baseState = e;
      var l = {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: null,
        lastRenderedState: null
      };
      return t.queue = l, t = Tf.bind(
        null,
        Xe,
        !0,
        l
      ), l.dispatch = t, [e, t];
    },
    useMemoCache: gf,
    useCacheRefresh: function() {
      return yn().memoizedState = Cw.bind(
        null,
        Xe
      );
    },
    useEffectEvent: function(e) {
      var t = yn(), l = { impl: e };
      return t.memoizedState = l, function() {
        if ((dt & 2) !== 0)
          throw Error(i(440));
        return l.impl.apply(void 0, arguments);
      };
    }
  }, Rf = {
    readContext: fn,
    use: is,
    useCallback: Wm,
    useContext: fn,
    useEffect: bf,
    useImperativeHandle: $m,
    useInsertionEffect: Qm,
    useLayoutEffect: Zm,
    useMemo: eh,
    useReducer: ss,
    useRef: Xm,
    useState: function() {
      return ss(Cl);
    },
    useDebugValue: xf,
    useDeferredValue: function(e, t) {
      var l = Kt();
      return th(
        l,
        wt.memoizedState,
        e,
        t
      );
    },
    useTransition: function() {
      var e = ss(Cl)[0], t = Kt().memoizedState;
      return [
        typeof e == "boolean" ? e : Da(e),
        t
      ];
    },
    useSyncExternalStore: zm,
    useId: rh,
    useHostTransitionStatus: Ef,
    useFormState: Ym,
    useActionState: Ym,
    useOptimistic: function(e, t) {
      var l = Kt();
      return Hm(l, wt, e, t);
    },
    useMemoCache: gf,
    useCacheRefresh: ah
  };
  Rf.useEffectEvent = Km;
  var fh = {
    readContext: fn,
    use: is,
    useCallback: Wm,
    useContext: fn,
    useEffect: bf,
    useImperativeHandle: $m,
    useInsertionEffect: Qm,
    useLayoutEffect: Zm,
    useMemo: eh,
    useReducer: hf,
    useRef: Xm,
    useState: function() {
      return hf(Cl);
    },
    useDebugValue: xf,
    useDeferredValue: function(e, t) {
      var l = Kt();
      return wt === null ? Sf(l, e, t) : th(
        l,
        wt.memoizedState,
        e,
        t
      );
    },
    useTransition: function() {
      var e = hf(Cl)[0], t = Kt().memoizedState;
      return [
        typeof e == "boolean" ? e : Da(e),
        t
      ];
    },
    useSyncExternalStore: zm,
    useId: rh,
    useHostTransitionStatus: Ef,
    useFormState: qm,
    useActionState: qm,
    useOptimistic: function(e, t) {
      var l = Kt();
      return wt !== null ? Hm(l, wt, e, t) : (l.baseState = e, [e, l.queue.dispatch]);
    },
    useMemoCache: gf,
    useCacheRefresh: ah
  };
  fh.useEffectEvent = Km;
  function Cf(e, t, l, r) {
    t = e.memoizedState, l = l(r, t), l = l == null ? t : b({}, t, l), e.memoizedState = l, e.lanes === 0 && (e.updateQueue.baseState = l);
  }
  var Of = {
    enqueueSetState: function(e, t, l) {
      e = e._reactInternals;
      var r = Un(), s = oo(r);
      s.payload = t, l != null && (s.callback = l), t = ro(e, s, r), t !== null && (On(t, e, r), Oa(t, e, r));
    },
    enqueueReplaceState: function(e, t, l) {
      e = e._reactInternals;
      var r = Un(), s = oo(r);
      s.tag = 1, s.payload = t, l != null && (s.callback = l), t = ro(e, s, r), t !== null && (On(t, e, r), Oa(t, e, r));
    },
    enqueueForceUpdate: function(e, t) {
      e = e._reactInternals;
      var l = Un(), r = oo(l);
      r.tag = 2, t != null && (r.callback = t), t = ro(e, r, l), t !== null && (On(t, e, l), Oa(t, e, l));
    }
  };
  function dh(e, t, l, r, s, c, h) {
    return e = e.stateNode, typeof e.shouldComponentUpdate == "function" ? e.shouldComponentUpdate(r, c, h) : t.prototype && t.prototype.isPureReactComponent ? !ba(l, r) || !ba(s, c) : !0;
  }
  function ph(e, t, l, r) {
    e = t.state, typeof t.componentWillReceiveProps == "function" && t.componentWillReceiveProps(l, r), typeof t.UNSAFE_componentWillReceiveProps == "function" && t.UNSAFE_componentWillReceiveProps(l, r), t.state !== e && Of.enqueueReplaceState(t, t.state, null);
  }
  function Zo(e, t) {
    var l = t;
    if ("ref" in t) {
      l = {};
      for (var r in t)
        r !== "ref" && (l[r] = t[r]);
    }
    if (e = e.defaultProps) {
      l === t && (l = b({}, l));
      for (var s in e)
        l[s] === void 0 && (l[s] = e[s]);
    }
    return l;
  }
  function gh(e) {
    Yi(e);
  }
  function mh(e) {
    console.error(e);
  }
  function hh(e) {
    Yi(e);
  }
  function ds(e, t) {
    try {
      var l = e.onUncaughtError;
      l(t.value, { componentStack: t.stack });
    } catch (r) {
      setTimeout(function() {
        throw r;
      });
    }
  }
  function yh(e, t, l) {
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
  function Mf(e, t, l) {
    return l = oo(l), l.tag = 3, l.payload = { element: null }, l.callback = function() {
      ds(e, t);
    }, l;
  }
  function vh(e) {
    return e = oo(e), e.tag = 3, e;
  }
  function bh(e, t, l, r) {
    var s = l.type.getDerivedStateFromError;
    if (typeof s == "function") {
      var c = r.value;
      e.payload = function() {
        return s(c);
      }, e.callback = function() {
        yh(t, l, r);
      };
    }
    var h = l.stateNode;
    h !== null && typeof h.componentDidCatch == "function" && (e.callback = function() {
      yh(t, l, r), typeof s != "function" && (fo === null ? fo = /* @__PURE__ */ new Set([this]) : fo.add(this));
      var R = r.stack;
      this.componentDidCatch(r.value, {
        componentStack: R !== null ? R : ""
      });
    });
  }
  function Mw(e, t, l, r, s) {
    if (l.flags |= 32768, r !== null && typeof r == "object" && typeof r.then == "function") {
      if (t = l.alternate, t !== null && Mr(
        t,
        l,
        s,
        !0
      ), l = jn.current, l !== null) {
        switch (l.tag) {
          case 31:
          case 13:
            return Zn === null ? Ts() : l.alternate === null && Vt === 0 && (Vt = 3), l.flags &= -257, l.flags |= 65536, l.lanes = s, r === Wi ? l.flags |= 16384 : (t = l.updateQueue, t === null ? l.updateQueue = /* @__PURE__ */ new Set([r]) : t.add(r), Wf(e, r, s)), !1;
          case 22:
            return l.flags |= 65536, r === Wi ? l.flags |= 16384 : (t = l.updateQueue, t === null ? (t = {
              transitions: null,
              markerInstances: null,
              retryQueue: /* @__PURE__ */ new Set([r])
            }, l.updateQueue = t) : (l = t.retryQueue, l === null ? t.retryQueue = /* @__PURE__ */ new Set([r]) : l.add(r)), Wf(e, r, s)), !1;
        }
        throw Error(i(435, l.tag));
      }
      return Wf(e, r, s), Ts(), !1;
    }
    if (st)
      return t = jn.current, t !== null ? ((t.flags & 65536) === 0 && (t.flags |= 256), t.flags |= 65536, t.lanes = s, r !== Xu && (e = Error(i(422), { cause: r }), wa(Xn(e, l)))) : (r !== Xu && (t = Error(i(423), {
        cause: r
      }), wa(
        Xn(t, l)
      )), e = e.current.alternate, e.flags |= 65536, s &= -s, e.lanes |= s, r = Xn(r, l), s = Mf(
        e.stateNode,
        r,
        s
      ), lf(e, s), Vt !== 4 && (Vt = 2)), !1;
    var c = Error(i(520), { cause: r });
    if (c = Xn(c, l), Va === null ? Va = [c] : Va.push(c), Vt !== 4 && (Vt = 2), t === null) return !0;
    r = Xn(r, l), l = t;
    do {
      switch (l.tag) {
        case 3:
          return l.flags |= 65536, e = s & -s, l.lanes |= e, e = Mf(l.stateNode, r, e), lf(l, e), !1;
        case 1:
          if (t = l.type, c = l.stateNode, (l.flags & 128) === 0 && (typeof t.getDerivedStateFromError == "function" || c !== null && typeof c.componentDidCatch == "function" && (fo === null || !fo.has(c))))
            return l.flags |= 65536, s &= -s, l.lanes |= s, s = vh(s), bh(
              s,
              e,
              l,
              r
            ), lf(l, s), !1;
      }
      l = l.return;
    } while (l !== null);
    return !1;
  }
  var Af = Error(i(461)), $t = !1;
  function dn(e, t, l, r) {
    t.child = e === null ? Em(t, null, l, r) : Ko(
      t,
      e.child,
      l,
      r
    );
  }
  function xh(e, t, l, r, s) {
    l = l.render;
    var c = t.ref;
    if ("ref" in r) {
      var h = {};
      for (var R in r)
        R !== "ref" && (h[R] = r[R]);
    } else h = r;
    return Go(t), r = uf(
      e,
      t,
      l,
      h,
      c,
      s
    ), R = ff(), e !== null && !$t ? (df(e, t, s), Ol(e, t, s)) : (st && R && Gu(t), t.flags |= 1, dn(e, t, r, s), t.child);
  }
  function Sh(e, t, l, r, s) {
    if (e === null) {
      var c = l.type;
      return typeof c == "function" && !Vu(c) && c.defaultProps === void 0 && l.compare === null ? (t.tag = 15, t.type = c, wh(
        e,
        t,
        c,
        r,
        s
      )) : (e = Fi(
        l.type,
        null,
        r,
        t,
        t.mode,
        s
      ), e.ref = t.ref, e.return = t, t.child = e);
    }
    if (c = e.child, !Uf(e, s)) {
      var h = c.memoizedProps;
      if (l = l.compare, l = l !== null ? l : ba, l(h, r) && e.ref === t.ref)
        return Ol(e, t, s);
    }
    return t.flags |= 1, e = Sl(c, r), e.ref = t.ref, e.return = t, t.child = e;
  }
  function wh(e, t, l, r, s) {
    if (e !== null) {
      var c = e.memoizedProps;
      if (ba(c, r) && e.ref === t.ref)
        if ($t = !1, t.pendingProps = r = c, Uf(e, s))
          (e.flags & 131072) !== 0 && ($t = !0);
        else
          return t.lanes = e.lanes, Ol(e, t, s);
    }
    return zf(
      e,
      t,
      l,
      r,
      s
    );
  }
  function Eh(e, t, l, r) {
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
        return Th(
          e,
          t,
          c,
          l,
          r
        );
      }
      if ((l & 536870912) !== 0)
        t.memoizedState = { baseLanes: 0, cachePool: null }, e !== null && Ji(
          t,
          c !== null ? c.cachePool : null
        ), c !== null ? Cm(t, c) : rf(), Om(t);
      else
        return r = t.lanes = 536870912, Th(
          e,
          t,
          c !== null ? c.baseLanes | l : l,
          l,
          r
        );
    } else
      c !== null ? (Ji(t, c.cachePool), Cm(t, c), io(), t.memoizedState = null) : (e !== null && Ji(t, null), rf(), io());
    return dn(e, t, s, l), t.child;
  }
  function ka(e, t) {
    return e !== null && e.tag === 22 || t.stateNode !== null || (t.stateNode = {
      _visibility: 1,
      _pendingMarkers: null,
      _retryCache: null,
      _transitions: null
    }), t.sibling;
  }
  function Th(e, t, l, r, s) {
    var c = Wu();
    return c = c === null ? null : { parent: Zt._currentValue, pool: c }, t.memoizedState = {
      baseLanes: l,
      cachePool: c
    }, e !== null && Ji(t, null), rf(), Om(t), e !== null && Mr(e, t, r, !0), t.childLanes = s, null;
  }
  function ps(e, t) {
    return t = ms(
      { mode: t.mode, children: t.children },
      e.mode
    ), t.ref = e.ref, e.child = t, t.return = e, t;
  }
  function Rh(e, t, l) {
    return Ko(t, e.child, null, l), e = ps(t, t.pendingProps), e.flags |= 2, kn(t), t.memoizedState = null, e;
  }
  function Aw(e, t, l) {
    var r = t.pendingProps, s = (t.flags & 128) !== 0;
    if (t.flags &= -129, e === null) {
      if (st) {
        if (r.mode === "hidden")
          return e = ps(t, r), t.lanes = 536870912, ka(null, e);
        if (sf(t), (e = kt) ? (e = Uy(
          e,
          Qn
        ), e = e !== null && e.data === "&" ? e : null, e !== null && (t.memoizedState = {
          dehydrated: e,
          treeContext: Wl !== null ? { id: al, overflow: il } : null,
          retryLane: 536870912,
          hydrationErrors: null
        }, l = sm(e), l.return = t, t.child = l, un = t, kt = null)) : e = null, e === null) throw to(t);
        return t.lanes = 536870912, null;
      }
      return ps(t, r);
    }
    var c = e.memoizedState;
    if (c !== null) {
      var h = c.dehydrated;
      if (sf(t), s)
        if (t.flags & 256)
          t.flags &= -257, t = Rh(
            e,
            t,
            l
          );
        else if (t.memoizedState !== null)
          t.child = e.child, t.flags |= 128, t = null;
        else throw Error(i(558));
      else if ($t || Mr(e, t, l, !1), s = (l & e.childLanes) !== 0, $t || s) {
        if (r = Mt, r !== null && (h = yl(r, l), h !== 0 && h !== c.retryLane))
          throw c.retryLane = h, Bo(e, h), On(r, e, h), Af;
        Ts(), t = Rh(
          e,
          t,
          l
        );
      } else
        e = c.treeContext, kt = Jn(h.nextSibling), un = t, st = !0, eo = null, Qn = !1, e !== null && fm(t, e), t = ps(t, r), t.flags |= 4096;
      return t;
    }
    return e = Sl(e.child, {
      mode: r.mode,
      children: r.children
    }), e.ref = t.ref, t.child = e, e.return = t, e;
  }
  function gs(e, t) {
    var l = t.ref;
    if (l === null)
      e !== null && e.ref !== null && (t.flags |= 4194816);
    else {
      if (typeof l != "function" && typeof l != "object")
        throw Error(i(284));
      (e === null || e.ref !== l) && (t.flags |= 4194816);
    }
  }
  function zf(e, t, l, r, s) {
    return Go(t), l = uf(
      e,
      t,
      l,
      r,
      void 0,
      s
    ), r = ff(), e !== null && !$t ? (df(e, t, s), Ol(e, t, s)) : (st && r && Gu(t), t.flags |= 1, dn(e, t, l, s), t.child);
  }
  function Ch(e, t, l, r, s, c) {
    return Go(t), t.updateQueue = null, l = Am(
      t,
      r,
      l,
      s
    ), Mm(e), r = ff(), e !== null && !$t ? (df(e, t, c), Ol(e, t, c)) : (st && r && Gu(t), t.flags |= 1, dn(e, t, l, c), t.child);
  }
  function Oh(e, t, l, r, s) {
    if (Go(t), t.stateNode === null) {
      var c = Tr, h = l.contextType;
      typeof h == "object" && h !== null && (c = fn(h)), c = new l(r, c), t.memoizedState = c.state !== null && c.state !== void 0 ? c.state : null, c.updater = Of, t.stateNode = c, c._reactInternals = t, c = t.stateNode, c.props = r, c.state = t.memoizedState, c.refs = {}, tf(t), h = l.contextType, c.context = typeof h == "object" && h !== null ? fn(h) : Tr, c.state = t.memoizedState, h = l.getDerivedStateFromProps, typeof h == "function" && (Cf(
        t,
        l,
        h,
        r
      ), c.state = t.memoizedState), typeof l.getDerivedStateFromProps == "function" || typeof c.getSnapshotBeforeUpdate == "function" || typeof c.UNSAFE_componentWillMount != "function" && typeof c.componentWillMount != "function" || (h = c.state, typeof c.componentWillMount == "function" && c.componentWillMount(), typeof c.UNSAFE_componentWillMount == "function" && c.UNSAFE_componentWillMount(), h !== c.state && Of.enqueueReplaceState(c, c.state, null), Aa(t, r, c, s), Ma(), c.state = t.memoizedState), typeof c.componentDidMount == "function" && (t.flags |= 4194308), r = !0;
    } else if (e === null) {
      c = t.stateNode;
      var R = t.memoizedProps, I = Zo(l, R);
      c.props = I;
      var ee = c.context, ce = l.contextType;
      h = Tr, typeof ce == "object" && ce !== null && (h = fn(ce));
      var de = l.getDerivedStateFromProps;
      ce = typeof de == "function" || typeof c.getSnapshotBeforeUpdate == "function", R = t.pendingProps !== R, ce || typeof c.UNSAFE_componentWillReceiveProps != "function" && typeof c.componentWillReceiveProps != "function" || (R || ee !== h) && ph(
        t,
        c,
        r,
        h
      ), lo = !1;
      var te = t.memoizedState;
      c.state = te, Aa(t, r, c, s), Ma(), ee = t.memoizedState, R || te !== ee || lo ? (typeof de == "function" && (Cf(
        t,
        l,
        de,
        r
      ), ee = t.memoizedState), (I = lo || dh(
        t,
        l,
        I,
        r,
        te,
        ee,
        h
      )) ? (ce || typeof c.UNSAFE_componentWillMount != "function" && typeof c.componentWillMount != "function" || (typeof c.componentWillMount == "function" && c.componentWillMount(), typeof c.UNSAFE_componentWillMount == "function" && c.UNSAFE_componentWillMount()), typeof c.componentDidMount == "function" && (t.flags |= 4194308)) : (typeof c.componentDidMount == "function" && (t.flags |= 4194308), t.memoizedProps = r, t.memoizedState = ee), c.props = r, c.state = ee, c.context = h, r = I) : (typeof c.componentDidMount == "function" && (t.flags |= 4194308), r = !1);
    } else {
      c = t.stateNode, nf(e, t), h = t.memoizedProps, ce = Zo(l, h), c.props = ce, de = t.pendingProps, te = c.context, ee = l.contextType, I = Tr, typeof ee == "object" && ee !== null && (I = fn(ee)), R = l.getDerivedStateFromProps, (ee = typeof R == "function" || typeof c.getSnapshotBeforeUpdate == "function") || typeof c.UNSAFE_componentWillReceiveProps != "function" && typeof c.componentWillReceiveProps != "function" || (h !== de || te !== I) && ph(
        t,
        c,
        r,
        I
      ), lo = !1, te = t.memoizedState, c.state = te, Aa(t, r, c, s), Ma();
      var le = t.memoizedState;
      h !== de || te !== le || lo || e !== null && e.dependencies !== null && Qi(e.dependencies) ? (typeof R == "function" && (Cf(
        t,
        l,
        R,
        r
      ), le = t.memoizedState), (ce = lo || dh(
        t,
        l,
        ce,
        r,
        te,
        le,
        I
      ) || e !== null && e.dependencies !== null && Qi(e.dependencies)) ? (ee || typeof c.UNSAFE_componentWillUpdate != "function" && typeof c.componentWillUpdate != "function" || (typeof c.componentWillUpdate == "function" && c.componentWillUpdate(r, le, I), typeof c.UNSAFE_componentWillUpdate == "function" && c.UNSAFE_componentWillUpdate(
        r,
        le,
        I
      )), typeof c.componentDidUpdate == "function" && (t.flags |= 4), typeof c.getSnapshotBeforeUpdate == "function" && (t.flags |= 1024)) : (typeof c.componentDidUpdate != "function" || h === e.memoizedProps && te === e.memoizedState || (t.flags |= 4), typeof c.getSnapshotBeforeUpdate != "function" || h === e.memoizedProps && te === e.memoizedState || (t.flags |= 1024), t.memoizedProps = r, t.memoizedState = le), c.props = r, c.state = le, c.context = I, r = ce) : (typeof c.componentDidUpdate != "function" || h === e.memoizedProps && te === e.memoizedState || (t.flags |= 4), typeof c.getSnapshotBeforeUpdate != "function" || h === e.memoizedProps && te === e.memoizedState || (t.flags |= 1024), r = !1);
    }
    return c = r, gs(e, t), r = (t.flags & 128) !== 0, c || r ? (c = t.stateNode, l = r && typeof l.getDerivedStateFromError != "function" ? null : c.render(), t.flags |= 1, e !== null && r ? (t.child = Ko(
      t,
      e.child,
      null,
      s
    ), t.child = Ko(
      t,
      null,
      l,
      s
    )) : dn(e, t, l, s), t.memoizedState = c.state, e = t.child) : e = Ol(
      e,
      t,
      s
    ), e;
  }
  function Mh(e, t, l, r) {
    return Po(), t.flags |= 256, dn(e, t, l, r), t.child;
  }
  var Df = {
    dehydrated: null,
    treeContext: null,
    retryLane: 0,
    hydrationErrors: null
  };
  function Nf(e) {
    return { baseLanes: e, cachePool: ym() };
  }
  function jf(e, t, l) {
    return e = e !== null ? e.childLanes & ~l : 0, t && (e |= Hn), e;
  }
  function Ah(e, t, l) {
    var r = t.pendingProps, s = !1, c = (t.flags & 128) !== 0, h;
    if ((h = c) || (h = e !== null && e.memoizedState === null ? !1 : (Ft.current & 2) !== 0), h && (s = !0, t.flags &= -129), h = (t.flags & 32) !== 0, t.flags &= -33, e === null) {
      if (st) {
        if (s ? ao(t) : io(), (e = kt) ? (e = Uy(
          e,
          Qn
        ), e = e !== null && e.data !== "&" ? e : null, e !== null && (t.memoizedState = {
          dehydrated: e,
          treeContext: Wl !== null ? { id: al, overflow: il } : null,
          retryLane: 536870912,
          hydrationErrors: null
        }, l = sm(e), l.return = t, t.child = l, un = t, kt = null)) : e = null, e === null) throw to(t);
        return md(e) ? t.lanes = 32 : t.lanes = 536870912, null;
      }
      var R = r.children;
      return r = r.fallback, s ? (io(), s = t.mode, R = ms(
        { mode: "hidden", children: R },
        s
      ), r = Vo(
        r,
        s,
        l,
        null
      ), R.return = t, r.return = t, R.sibling = r, t.child = R, r = t.child, r.memoizedState = Nf(l), r.childLanes = jf(
        e,
        h,
        l
      ), t.memoizedState = Df, ka(null, r)) : (ao(t), kf(t, R));
    }
    var I = e.memoizedState;
    if (I !== null && (R = I.dehydrated, R !== null)) {
      if (c)
        t.flags & 256 ? (ao(t), t.flags &= -257, t = _f(
          e,
          t,
          l
        )) : t.memoizedState !== null ? (io(), t.child = e.child, t.flags |= 128, t = null) : (io(), R = r.fallback, s = t.mode, r = ms(
          { mode: "visible", children: r.children },
          s
        ), R = Vo(
          R,
          s,
          l,
          null
        ), R.flags |= 2, r.return = t, R.return = t, r.sibling = R, t.child = r, Ko(
          t,
          e.child,
          null,
          l
        ), r = t.child, r.memoizedState = Nf(l), r.childLanes = jf(
          e,
          h,
          l
        ), t.memoizedState = Df, t = ka(null, r));
      else if (ao(t), md(R)) {
        if (h = R.nextSibling && R.nextSibling.dataset, h) var ee = h.dgst;
        h = ee, r = Error(i(419)), r.stack = "", r.digest = h, wa({ value: r, source: null, stack: null }), t = _f(
          e,
          t,
          l
        );
      } else if ($t || Mr(e, t, l, !1), h = (l & e.childLanes) !== 0, $t || h) {
        if (h = Mt, h !== null && (r = yl(h, l), r !== 0 && r !== I.retryLane))
          throw I.retryLane = r, Bo(e, r), On(h, e, r), Af;
        gd(R) || Ts(), t = _f(
          e,
          t,
          l
        );
      } else
        gd(R) ? (t.flags |= 192, t.child = e.child, t = null) : (e = I.treeContext, kt = Jn(
          R.nextSibling
        ), un = t, st = !0, eo = null, Qn = !1, e !== null && fm(t, e), t = kf(
          t,
          r.children
        ), t.flags |= 4096);
      return t;
    }
    return s ? (io(), R = r.fallback, s = t.mode, I = e.child, ee = I.sibling, r = Sl(I, {
      mode: "hidden",
      children: r.children
    }), r.subtreeFlags = I.subtreeFlags & 65011712, ee !== null ? R = Sl(
      ee,
      R
    ) : (R = Vo(
      R,
      s,
      l,
      null
    ), R.flags |= 2), R.return = t, r.return = t, r.sibling = R, t.child = r, ka(null, r), r = t.child, R = e.child.memoizedState, R === null ? R = Nf(l) : (s = R.cachePool, s !== null ? (I = Zt._currentValue, s = s.parent !== I ? { parent: I, pool: I } : s) : s = ym(), R = {
      baseLanes: R.baseLanes | l,
      cachePool: s
    }), r.memoizedState = R, r.childLanes = jf(
      e,
      h,
      l
    ), t.memoizedState = Df, ka(e.child, r)) : (ao(t), l = e.child, e = l.sibling, l = Sl(l, {
      mode: "visible",
      children: r.children
    }), l.return = t, l.sibling = null, e !== null && (h = t.deletions, h === null ? (t.deletions = [e], t.flags |= 16) : h.push(e)), t.child = l, t.memoizedState = null, l);
  }
  function kf(e, t) {
    return t = ms(
      { mode: "visible", children: t },
      e.mode
    ), t.return = e, e.child = t;
  }
  function ms(e, t) {
    return e = Nn(22, e, null, t), e.lanes = 0, e;
  }
  function _f(e, t, l) {
    return Ko(t, e.child, null, l), e = kf(
      t,
      t.pendingProps.children
    ), e.flags |= 2, t.memoizedState = null, e;
  }
  function zh(e, t, l) {
    e.lanes |= t;
    var r = e.alternate;
    r !== null && (r.lanes |= t), Qu(e.return, t, l);
  }
  function Hf(e, t, l, r, s, c) {
    var h = e.memoizedState;
    h === null ? e.memoizedState = {
      isBackwards: t,
      rendering: null,
      renderingStartTime: 0,
      last: r,
      tail: l,
      tailMode: s,
      treeForkCount: c
    } : (h.isBackwards = t, h.rendering = null, h.renderingStartTime = 0, h.last = r, h.tail = l, h.tailMode = s, h.treeForkCount = c);
  }
  function Dh(e, t, l) {
    var r = t.pendingProps, s = r.revealOrder, c = r.tail;
    r = r.children;
    var h = Ft.current, R = (h & 2) !== 0;
    if (R ? (h = h & 1 | 2, t.flags |= 128) : h &= 1, ne(Ft, h), dn(e, t, r, l), r = st ? Sa : 0, !R && e !== null && (e.flags & 128) !== 0)
      e: for (e = t.child; e !== null; ) {
        if (e.tag === 13)
          e.memoizedState !== null && zh(e, l, t);
        else if (e.tag === 19)
          zh(e, l, t);
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
          e = l.alternate, e !== null && ls(e) === null && (s = l), l = l.sibling;
        l = s, l === null ? (s = t.child, t.child = null) : (s = l.sibling, l.sibling = null), Hf(
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
          if (e = s.alternate, e !== null && ls(e) === null) {
            t.child = s;
            break;
          }
          e = s.sibling, s.sibling = l, l = s, s = e;
        }
        Hf(
          t,
          !0,
          l,
          null,
          c,
          r
        );
        break;
      case "together":
        Hf(
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
  function Ol(e, t, l) {
    if (e !== null && (t.dependencies = e.dependencies), uo |= t.lanes, (l & t.childLanes) === 0)
      if (e !== null) {
        if (Mr(
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
      for (e = t.child, l = Sl(e, e.pendingProps), t.child = l, l.return = t; e.sibling !== null; )
        e = e.sibling, l = l.sibling = Sl(e, e.pendingProps), l.return = t;
      l.sibling = null;
    }
    return t.child;
  }
  function Uf(e, t) {
    return (e.lanes & t) !== 0 ? !0 : (e = e.dependencies, !!(e !== null && Qi(e)));
  }
  function zw(e, t, l) {
    switch (t.tag) {
      case 3:
        se(t, t.stateNode.containerInfo), no(t, Zt, e.memoizedState.cache), Po();
        break;
      case 27:
      case 5:
        je(t);
        break;
      case 4:
        se(t, t.stateNode.containerInfo);
        break;
      case 10:
        no(
          t,
          t.type,
          t.memoizedProps.value
        );
        break;
      case 31:
        if (t.memoizedState !== null)
          return t.flags |= 128, sf(t), null;
        break;
      case 13:
        var r = t.memoizedState;
        if (r !== null)
          return r.dehydrated !== null ? (ao(t), t.flags |= 128, null) : (l & t.child.childLanes) !== 0 ? Ah(e, t, l) : (ao(t), e = Ol(
            e,
            t,
            l
          ), e !== null ? e.sibling : null);
        ao(t);
        break;
      case 19:
        var s = (e.flags & 128) !== 0;
        if (r = (l & t.childLanes) !== 0, r || (Mr(
          e,
          t,
          l,
          !1
        ), r = (l & t.childLanes) !== 0), s) {
          if (r)
            return Dh(
              e,
              t,
              l
            );
          t.flags |= 128;
        }
        if (s = t.memoizedState, s !== null && (s.rendering = null, s.tail = null, s.lastEffect = null), ne(Ft, Ft.current), r) break;
        return null;
      case 22:
        return t.lanes = 0, Eh(
          e,
          t,
          l,
          t.pendingProps
        );
      case 24:
        no(t, Zt, e.memoizedState.cache);
    }
    return Ol(e, t, l);
  }
  function Nh(e, t, l) {
    if (e !== null)
      if (e.memoizedProps !== t.pendingProps)
        $t = !0;
      else {
        if (!Uf(e, l) && (t.flags & 128) === 0)
          return $t = !1, zw(
            e,
            t,
            l
          );
        $t = (e.flags & 131072) !== 0;
      }
    else
      $t = !1, st && (t.flags & 1048576) !== 0 && um(t, Sa, t.index);
    switch (t.lanes = 0, t.tag) {
      case 16:
        e: {
          var r = t.pendingProps;
          if (e = Xo(t.elementType), t.type = e, typeof e == "function")
            Vu(e) ? (r = Zo(e, r), t.tag = 1, t = Oh(
              null,
              t,
              e,
              r,
              l
            )) : (t.tag = 0, t = zf(
              null,
              t,
              e,
              r,
              l
            ));
          else {
            if (e != null) {
              var s = e.$$typeof;
              if (s === N) {
                t.tag = 11, t = xh(
                  null,
                  t,
                  e,
                  r,
                  l
                );
                break e;
              } else if (s === H) {
                t.tag = 14, t = Sh(
                  null,
                  t,
                  e,
                  r,
                  l
                );
                break e;
              }
            }
            throw t = K(e) || e, Error(i(306, t, ""));
          }
        }
        return t;
      case 0:
        return zf(
          e,
          t,
          t.type,
          t.pendingProps,
          l
        );
      case 1:
        return r = t.type, s = Zo(
          r,
          t.pendingProps
        ), Oh(
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
          s = c.element, nf(e, t), Aa(t, r, null, l);
          var h = t.memoizedState;
          if (r = h.cache, no(t, Zt, r), r !== c.cache && Zu(
            t,
            [Zt],
            l,
            !0
          ), Ma(), r = h.element, c.isDehydrated)
            if (c = {
              element: r,
              isDehydrated: !1,
              cache: h.cache
            }, t.updateQueue.baseState = c, t.memoizedState = c, t.flags & 256) {
              t = Mh(
                e,
                t,
                r,
                l
              );
              break e;
            } else if (r !== s) {
              s = Xn(
                Error(i(424)),
                t
              ), wa(s), t = Mh(
                e,
                t,
                r,
                l
              );
              break e;
            } else
              for (e = t.stateNode.containerInfo, e.nodeType === 9 ? e = e.body : e = e.nodeName === "HTML" ? e.ownerDocument.body : e, kt = Jn(e.firstChild), un = t, st = !0, eo = null, Qn = !0, l = Em(
                t,
                null,
                r,
                l
              ), t.child = l; l; )
                l.flags = l.flags & -3 | 4096, l = l.sibling;
          else {
            if (Po(), r === s) {
              t = Ol(
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
        return gs(e, t), e === null ? (l = Yy(
          t.type,
          null,
          t.pendingProps,
          null
        )) ? t.memoizedState = l : st || (l = t.type, e = t.pendingProps, r = Ds(
          ie.current
        ).createElement(l), r[Ot] = t, r[cn] = e, pn(r, l, e), on(r), t.stateNode = r) : t.memoizedState = Yy(
          t.type,
          e.memoizedProps,
          t.pendingProps,
          e.memoizedState
        ), null;
      case 27:
        return je(t), e === null && st && (r = t.stateNode = By(
          t.type,
          t.pendingProps,
          ie.current
        ), un = t, Qn = !0, s = kt, ho(t.type) ? (hd = s, kt = Jn(r.firstChild)) : kt = s), dn(
          e,
          t,
          t.pendingProps.children,
          l
        ), gs(e, t), e === null && (t.flags |= 4194304), t.child;
      case 5:
        return e === null && st && ((s = r = kt) && (r = a1(
          r,
          t.type,
          t.pendingProps,
          Qn
        ), r !== null ? (t.stateNode = r, un = t, kt = Jn(r.firstChild), Qn = !1, s = !0) : s = !1), s || to(t)), je(t), s = t.type, c = t.pendingProps, h = e !== null ? e.memoizedProps : null, r = c.children, fd(s, c) ? r = null : h !== null && fd(s, h) && (t.flags |= 32), t.memoizedState !== null && (s = uf(
          e,
          t,
          Sw,
          null,
          null,
          l
        ), Qa._currentValue = s), gs(e, t), dn(e, t, r, l), t.child;
      case 6:
        return e === null && st && ((e = l = kt) && (l = i1(
          l,
          t.pendingProps,
          Qn
        ), l !== null ? (t.stateNode = l, un = t, kt = null, e = !0) : e = !1), e || to(t)), null;
      case 13:
        return Ah(e, t, l);
      case 4:
        return se(
          t,
          t.stateNode.containerInfo
        ), r = t.pendingProps, e === null ? t.child = Ko(
          t,
          null,
          r,
          l
        ) : dn(e, t, r, l), t.child;
      case 11:
        return xh(
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
        return r = t.pendingProps, no(t, t.type, r.value), dn(e, t, r.children, l), t.child;
      case 9:
        return s = t.type._context, r = t.pendingProps.children, Go(t), s = fn(s), r = r(s), t.flags |= 1, dn(e, t, r, l), t.child;
      case 14:
        return Sh(
          e,
          t,
          t.type,
          t.pendingProps,
          l
        );
      case 15:
        return wh(
          e,
          t,
          t.type,
          t.pendingProps,
          l
        );
      case 19:
        return Dh(e, t, l);
      case 31:
        return Aw(e, t, l);
      case 22:
        return Eh(
          e,
          t,
          l,
          t.pendingProps
        );
      case 24:
        return Go(t), r = fn(Zt), e === null ? (s = Wu(), s === null && (s = Mt, c = Ju(), s.pooledCache = c, c.refCount++, c !== null && (s.pooledCacheLanes |= l), s = c), t.memoizedState = { parent: r, cache: s }, tf(t), no(t, Zt, s)) : ((e.lanes & l) !== 0 && (nf(e, t), Aa(t, null, null, l), Ma()), s = e.memoizedState, c = t.memoizedState, s.parent !== r ? (s = { parent: r, cache: r }, t.memoizedState = s, t.lanes === 0 && (t.memoizedState = t.updateQueue.baseState = s), no(t, Zt, r)) : (r = c.cache, no(t, Zt, r), r !== s.cache && Zu(
          t,
          [Zt],
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
  function Ml(e) {
    e.flags |= 4;
  }
  function Lf(e, t, l, r, s) {
    if ((t = (e.mode & 32) !== 0) && (t = !1), t) {
      if (e.flags |= 16777216, (s & 335544128) === s)
        if (e.stateNode.complete) e.flags |= 8192;
        else if (ry()) e.flags |= 8192;
        else
          throw Fo = Wi, ef;
    } else e.flags &= -16777217;
  }
  function jh(e, t) {
    if (t.type !== "stylesheet" || (t.state.loading & 4) !== 0)
      e.flags &= -16777217;
    else if (e.flags |= 16777216, !Ky(t))
      if (ry()) e.flags |= 8192;
      else
        throw Fo = Wi, ef;
  }
  function hs(e, t) {
    t !== null && (e.flags |= 4), e.flags & 16384 && (t = e.tag !== 22 ? zn() : 536870912, e.lanes |= t, Br |= t);
  }
  function _a(e, t) {
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
  function _t(e) {
    var t = e.alternate !== null && e.alternate.child === e.child, l = 0, r = 0;
    if (t)
      for (var s = e.child; s !== null; )
        l |= s.lanes | s.childLanes, r |= s.subtreeFlags & 65011712, r |= s.flags & 65011712, s.return = e, s = s.sibling;
    else
      for (s = e.child; s !== null; )
        l |= s.lanes | s.childLanes, r |= s.subtreeFlags, r |= s.flags, s.return = e, s = s.sibling;
    return e.subtreeFlags |= r, e.childLanes = l, t;
  }
  function Dw(e, t, l) {
    var r = t.pendingProps;
    switch (qu(t), t.tag) {
      case 16:
      case 15:
      case 0:
      case 11:
      case 7:
      case 8:
      case 12:
      case 9:
      case 14:
        return _t(t), null;
      case 1:
        return _t(t), null;
      case 3:
        return l = t.stateNode, r = null, e !== null && (r = e.memoizedState.cache), t.memoizedState.cache !== r && (t.flags |= 2048), Tl(Zt), ge(), l.pendingContext && (l.context = l.pendingContext, l.pendingContext = null), (e === null || e.child === null) && (Or(t) ? Ml(t) : e === null || e.memoizedState.isDehydrated && (t.flags & 256) === 0 || (t.flags |= 1024, Fu())), _t(t), null;
      case 26:
        var s = t.type, c = t.memoizedState;
        return e === null ? (Ml(t), c !== null ? (_t(t), jh(t, c)) : (_t(t), Lf(
          t,
          s,
          null,
          r,
          l
        ))) : c ? c !== e.memoizedState ? (Ml(t), _t(t), jh(t, c)) : (_t(t), t.flags &= -16777217) : (e = e.memoizedProps, e !== r && Ml(t), _t(t), Lf(
          t,
          s,
          e,
          r,
          l
        )), null;
      case 27:
        if (Ee(t), l = ie.current, s = t.type, e !== null && t.stateNode != null)
          e.memoizedProps !== r && Ml(t);
        else {
          if (!r) {
            if (t.stateNode === null)
              throw Error(i(166));
            return _t(t), null;
          }
          e = $.current, Or(t) ? dm(t) : (e = By(s, r, l), t.stateNode = e, Ml(t));
        }
        return _t(t), null;
      case 5:
        if (Ee(t), s = t.type, e !== null && t.stateNode != null)
          e.memoizedProps !== r && Ml(t);
        else {
          if (!r) {
            if (t.stateNode === null)
              throw Error(i(166));
            return _t(t), null;
          }
          if (c = $.current, Or(t))
            dm(t);
          else {
            var h = Ds(
              ie.current
            );
            switch (c) {
              case 1:
                c = h.createElementNS(
                  "http://www.w3.org/2000/svg",
                  s
                );
                break;
              case 2:
                c = h.createElementNS(
                  "http://www.w3.org/1998/Math/MathML",
                  s
                );
                break;
              default:
                switch (s) {
                  case "svg":
                    c = h.createElementNS(
                      "http://www.w3.org/2000/svg",
                      s
                    );
                    break;
                  case "math":
                    c = h.createElementNS(
                      "http://www.w3.org/1998/Math/MathML",
                      s
                    );
                    break;
                  case "script":
                    c = h.createElement("div"), c.innerHTML = "<script><\/script>", c = c.removeChild(
                      c.firstChild
                    );
                    break;
                  case "select":
                    c = typeof r.is == "string" ? h.createElement("select", {
                      is: r.is
                    }) : h.createElement("select"), r.multiple ? c.multiple = !0 : r.size && (c.size = r.size);
                    break;
                  default:
                    c = typeof r.is == "string" ? h.createElement(s, { is: r.is }) : h.createElement(s);
                }
            }
            c[Ot] = t, c[cn] = r;
            e: for (h = t.child; h !== null; ) {
              if (h.tag === 5 || h.tag === 6)
                c.appendChild(h.stateNode);
              else if (h.tag !== 4 && h.tag !== 27 && h.child !== null) {
                h.child.return = h, h = h.child;
                continue;
              }
              if (h === t) break e;
              for (; h.sibling === null; ) {
                if (h.return === null || h.return === t)
                  break e;
                h = h.return;
              }
              h.sibling.return = h.return, h = h.sibling;
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
            r && Ml(t);
          }
        }
        return _t(t), Lf(
          t,
          t.type,
          e === null ? null : e.memoizedProps,
          t.pendingProps,
          l
        ), null;
      case 6:
        if (e && t.stateNode != null)
          e.memoizedProps !== r && Ml(t);
        else {
          if (typeof r != "string" && t.stateNode === null)
            throw Error(i(166));
          if (e = ie.current, Or(t)) {
            if (e = t.stateNode, l = t.memoizedProps, r = null, s = un, s !== null)
              switch (s.tag) {
                case 27:
                case 5:
                  r = s.memoizedProps;
              }
            e[Ot] = t, e = !!(e.nodeValue === l || r !== null && r.suppressHydrationWarning === !0 || Ay(e.nodeValue, l)), e || to(t, !0);
          } else
            e = Ds(e).createTextNode(
              r
            ), e[Ot] = t, t.stateNode = e;
        }
        return _t(t), null;
      case 31:
        if (l = t.memoizedState, e === null || e.memoizedState !== null) {
          if (r = Or(t), l !== null) {
            if (e === null) {
              if (!r) throw Error(i(318));
              if (e = t.memoizedState, e = e !== null ? e.dehydrated : null, !e) throw Error(i(557));
              e[Ot] = t;
            } else
              Po(), (t.flags & 128) === 0 && (t.memoizedState = null), t.flags |= 4;
            _t(t), e = !1;
          } else
            l = Fu(), e !== null && e.memoizedState !== null && (e.memoizedState.hydrationErrors = l), e = !0;
          if (!e)
            return t.flags & 256 ? (kn(t), t) : (kn(t), null);
          if ((t.flags & 128) !== 0)
            throw Error(i(558));
        }
        return _t(t), null;
      case 13:
        if (r = t.memoizedState, e === null || e.memoizedState !== null && e.memoizedState.dehydrated !== null) {
          if (s = Or(t), r !== null && r.dehydrated !== null) {
            if (e === null) {
              if (!s) throw Error(i(318));
              if (s = t.memoizedState, s = s !== null ? s.dehydrated : null, !s) throw Error(i(317));
              s[Ot] = t;
            } else
              Po(), (t.flags & 128) === 0 && (t.memoizedState = null), t.flags |= 4;
            _t(t), s = !1;
          } else
            s = Fu(), e !== null && e.memoizedState !== null && (e.memoizedState.hydrationErrors = s), s = !0;
          if (!s)
            return t.flags & 256 ? (kn(t), t) : (kn(t), null);
        }
        return kn(t), (t.flags & 128) !== 0 ? (t.lanes = l, t) : (l = r !== null, e = e !== null && e.memoizedState !== null, l && (r = t.child, s = null, r.alternate !== null && r.alternate.memoizedState !== null && r.alternate.memoizedState.cachePool !== null && (s = r.alternate.memoizedState.cachePool.pool), c = null, r.memoizedState !== null && r.memoizedState.cachePool !== null && (c = r.memoizedState.cachePool.pool), c !== s && (r.flags |= 2048)), l !== e && l && (t.child.flags |= 8192), hs(t, t.updateQueue), _t(t), null);
      case 4:
        return ge(), e === null && ad(t.stateNode.containerInfo), _t(t), null;
      case 10:
        return Tl(t.type), _t(t), null;
      case 19:
        if (U(Ft), r = t.memoizedState, r === null) return _t(t), null;
        if (s = (t.flags & 128) !== 0, c = r.rendering, c === null)
          if (s) _a(r, !1);
          else {
            if (Vt !== 0 || e !== null && (e.flags & 128) !== 0)
              for (e = t.child; e !== null; ) {
                if (c = ls(e), c !== null) {
                  for (t.flags |= 128, _a(r, !1), e = c.updateQueue, t.updateQueue = e, hs(t, e), t.subtreeFlags = 0, e = l, l = t.child; l !== null; )
                    im(l, e), l = l.sibling;
                  return ne(
                    Ft,
                    Ft.current & 1 | 2
                  ), st && wl(t, r.treeForkCount), t.child;
                }
                e = e.sibling;
              }
            r.tail !== null && ae() > Ss && (t.flags |= 128, s = !0, _a(r, !1), t.lanes = 4194304);
          }
        else {
          if (!s)
            if (e = ls(c), e !== null) {
              if (t.flags |= 128, s = !0, e = e.updateQueue, t.updateQueue = e, hs(t, e), _a(r, !0), r.tail === null && r.tailMode === "hidden" && !c.alternate && !st)
                return _t(t), null;
            } else
              2 * ae() - r.renderingStartTime > Ss && l !== 536870912 && (t.flags |= 128, s = !0, _a(r, !1), t.lanes = 4194304);
          r.isBackwards ? (c.sibling = t.child, t.child = c) : (e = r.last, e !== null ? e.sibling = c : t.child = c, r.last = c);
        }
        return r.tail !== null ? (e = r.tail, r.rendering = e, r.tail = e.sibling, r.renderingStartTime = ae(), e.sibling = null, l = Ft.current, ne(
          Ft,
          s ? l & 1 | 2 : l & 1
        ), st && wl(t, r.treeForkCount), e) : (_t(t), null);
      case 22:
      case 23:
        return kn(t), af(), r = t.memoizedState !== null, e !== null ? e.memoizedState !== null !== r && (t.flags |= 8192) : r && (t.flags |= 8192), r ? (l & 536870912) !== 0 && (t.flags & 128) === 0 && (_t(t), t.subtreeFlags & 6 && (t.flags |= 8192)) : _t(t), l = t.updateQueue, l !== null && hs(t, l.retryQueue), l = null, e !== null && e.memoizedState !== null && e.memoizedState.cachePool !== null && (l = e.memoizedState.cachePool.pool), r = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (r = t.memoizedState.cachePool.pool), r !== l && (t.flags |= 2048), e !== null && U(qo), null;
      case 24:
        return l = null, e !== null && (l = e.memoizedState.cache), t.memoizedState.cache !== l && (t.flags |= 2048), Tl(Zt), _t(t), null;
      case 25:
        return null;
      case 30:
        return null;
    }
    throw Error(i(156, t.tag));
  }
  function Nw(e, t) {
    switch (qu(t), t.tag) {
      case 1:
        return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
      case 3:
        return Tl(Zt), ge(), e = t.flags, (e & 65536) !== 0 && (e & 128) === 0 ? (t.flags = e & -65537 | 128, t) : null;
      case 26:
      case 27:
      case 5:
        return Ee(t), null;
      case 31:
        if (t.memoizedState !== null) {
          if (kn(t), t.alternate === null)
            throw Error(i(340));
          Po();
        }
        return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
      case 13:
        if (kn(t), e = t.memoizedState, e !== null && e.dehydrated !== null) {
          if (t.alternate === null)
            throw Error(i(340));
          Po();
        }
        return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
      case 19:
        return U(Ft), null;
      case 4:
        return ge(), null;
      case 10:
        return Tl(t.type), null;
      case 22:
      case 23:
        return kn(t), af(), e !== null && U(qo), e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
      case 24:
        return Tl(Zt), null;
      case 25:
        return null;
      default:
        return null;
    }
  }
  function kh(e, t) {
    switch (qu(t), t.tag) {
      case 3:
        Tl(Zt), ge();
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
        t.memoizedState !== null && kn(t);
        break;
      case 13:
        kn(t);
        break;
      case 19:
        U(Ft);
        break;
      case 10:
        Tl(t.type);
        break;
      case 22:
      case 23:
        kn(t), af(), e !== null && U(qo);
        break;
      case 24:
        Tl(Zt);
    }
  }
  function Ha(e, t) {
    try {
      var l = t.updateQueue, r = l !== null ? l.lastEffect : null;
      if (r !== null) {
        var s = r.next;
        l = s;
        do {
          if ((l.tag & e) === e) {
            r = void 0;
            var c = l.create, h = l.inst;
            r = c(), h.destroy = r;
          }
          l = l.next;
        } while (l !== s);
      }
    } catch (R) {
      bt(t, t.return, R);
    }
  }
  function so(e, t, l) {
    try {
      var r = t.updateQueue, s = r !== null ? r.lastEffect : null;
      if (s !== null) {
        var c = s.next;
        r = c;
        do {
          if ((r.tag & e) === e) {
            var h = r.inst, R = h.destroy;
            if (R !== void 0) {
              h.destroy = void 0, s = t;
              var I = l, ee = R;
              try {
                ee();
              } catch (ce) {
                bt(
                  s,
                  I,
                  ce
                );
              }
            }
          }
          r = r.next;
        } while (r !== c);
      }
    } catch (ce) {
      bt(t, t.return, ce);
    }
  }
  function _h(e) {
    var t = e.updateQueue;
    if (t !== null) {
      var l = e.stateNode;
      try {
        Rm(t, l);
      } catch (r) {
        bt(e, e.return, r);
      }
    }
  }
  function Hh(e, t, l) {
    l.props = Zo(
      e.type,
      e.memoizedProps
    ), l.state = e.memoizedState;
    try {
      l.componentWillUnmount();
    } catch (r) {
      bt(e, t, r);
    }
  }
  function Ua(e, t) {
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
      bt(e, t, s);
    }
  }
  function sl(e, t) {
    var l = e.ref, r = e.refCleanup;
    if (l !== null)
      if (typeof r == "function")
        try {
          r();
        } catch (s) {
          bt(e, t, s);
        } finally {
          e.refCleanup = null, e = e.alternate, e != null && (e.refCleanup = null);
        }
      else if (typeof l == "function")
        try {
          l(null);
        } catch (s) {
          bt(e, t, s);
        }
      else l.current = null;
  }
  function Uh(e) {
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
      bt(e, e.return, s);
    }
  }
  function If(e, t, l) {
    try {
      var r = e.stateNode;
      e1(r, e.type, l, t), r[cn] = t;
    } catch (s) {
      bt(e, e.return, s);
    }
  }
  function Lh(e) {
    return e.tag === 5 || e.tag === 3 || e.tag === 26 || e.tag === 27 && ho(e.type) || e.tag === 4;
  }
  function Bf(e) {
    e: for (; ; ) {
      for (; e.sibling === null; ) {
        if (e.return === null || Lh(e.return)) return null;
        e = e.return;
      }
      for (e.sibling.return = e.return, e = e.sibling; e.tag !== 5 && e.tag !== 6 && e.tag !== 18; ) {
        if (e.tag === 27 && ho(e.type) || e.flags & 2 || e.child === null || e.tag === 4) continue e;
        e.child.return = e, e = e.child;
      }
      if (!(e.flags & 2)) return e.stateNode;
    }
  }
  function Vf(e, t, l) {
    var r = e.tag;
    if (r === 5 || r === 6)
      e = e.stateNode, t ? (l.nodeType === 9 ? l.body : l.nodeName === "HTML" ? l.ownerDocument.body : l).insertBefore(e, t) : (t = l.nodeType === 9 ? l.body : l.nodeName === "HTML" ? l.ownerDocument.body : l, t.appendChild(e), l = l._reactRootContainer, l != null || t.onclick !== null || (t.onclick = bl));
    else if (r !== 4 && (r === 27 && ho(e.type) && (l = e.stateNode, t = null), e = e.child, e !== null))
      for (Vf(e, t, l), e = e.sibling; e !== null; )
        Vf(e, t, l), e = e.sibling;
  }
  function ys(e, t, l) {
    var r = e.tag;
    if (r === 5 || r === 6)
      e = e.stateNode, t ? l.insertBefore(e, t) : l.appendChild(e);
    else if (r !== 4 && (r === 27 && ho(e.type) && (l = e.stateNode), e = e.child, e !== null))
      for (ys(e, t, l), e = e.sibling; e !== null; )
        ys(e, t, l), e = e.sibling;
  }
  function Ih(e) {
    var t = e.stateNode, l = e.memoizedProps;
    try {
      for (var r = e.type, s = t.attributes; s.length; )
        t.removeAttributeNode(s[0]);
      pn(t, r, l), t[Ot] = e, t[cn] = l;
    } catch (c) {
      bt(e, e.return, c);
    }
  }
  var Al = !1, Wt = !1, Pf = !1, Bh = typeof WeakSet == "function" ? WeakSet : Set, rn = null;
  function jw(e, t) {
    if (e = e.containerInfo, cd = Ls, e = $g(e), ku(e)) {
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
            var h = 0, R = -1, I = -1, ee = 0, ce = 0, de = e, te = null;
            t: for (; ; ) {
              for (var le; de !== l || s !== 0 && de.nodeType !== 3 || (R = h + s), de !== c || r !== 0 && de.nodeType !== 3 || (I = h + r), de.nodeType === 3 && (h += de.nodeValue.length), (le = de.firstChild) !== null; )
                te = de, de = le;
              for (; ; ) {
                if (de === e) break t;
                if (te === l && ++ee === s && (R = h), te === c && ++ce === r && (I = h), (le = de.nextSibling) !== null) break;
                de = te, te = de.parentNode;
              }
              de = le;
            }
            l = R === -1 || I === -1 ? null : { start: R, end: I };
          } else l = null;
        }
      l = l || { start: 0, end: 0 };
    } else l = null;
    for (ud = { focusedElem: e, selectionRange: l }, Ls = !1, rn = t; rn !== null; )
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
                  var De = Zo(
                    l.type,
                    s
                  );
                  e = r.getSnapshotBeforeUpdate(
                    De,
                    c
                  ), r.__reactInternalSnapshotBeforeUpdate = e;
                } catch (Ve) {
                  bt(
                    l,
                    l.return,
                    Ve
                  );
                }
              }
              break;
            case 3:
              if ((e & 1024) !== 0) {
                if (e = t.stateNode.containerInfo, l = e.nodeType, l === 9)
                  pd(e);
                else if (l === 1)
                  switch (e.nodeName) {
                    case "HEAD":
                    case "HTML":
                    case "BODY":
                      pd(e);
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
  function Vh(e, t, l) {
    var r = l.flags;
    switch (l.tag) {
      case 0:
      case 11:
      case 15:
        Dl(e, l), r & 4 && Ha(5, l);
        break;
      case 1:
        if (Dl(e, l), r & 4)
          if (e = l.stateNode, t === null)
            try {
              e.componentDidMount();
            } catch (h) {
              bt(l, l.return, h);
            }
          else {
            var s = Zo(
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
            } catch (h) {
              bt(
                l,
                l.return,
                h
              );
            }
          }
        r & 64 && _h(l), r & 512 && Ua(l, l.return);
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
            Rm(e, t);
          } catch (h) {
            bt(l, l.return, h);
          }
        }
        break;
      case 27:
        t === null && r & 4 && Ih(l);
      case 26:
      case 5:
        Dl(e, l), t === null && r & 4 && Uh(l), r & 512 && Ua(l, l.return);
        break;
      case 12:
        Dl(e, l);
        break;
      case 31:
        Dl(e, l), r & 4 && Gh(e, l);
        break;
      case 13:
        Dl(e, l), r & 4 && qh(e, l), r & 64 && (e = l.memoizedState, e !== null && (e = e.dehydrated, e !== null && (l = Pw.bind(
          null,
          l
        ), s1(e, l))));
        break;
      case 22:
        if (r = l.memoizedState !== null || Al, !r) {
          t = t !== null && t.memoizedState !== null || Wt, s = Al;
          var c = Wt;
          Al = r, (Wt = t) && !c ? Nl(
            e,
            l,
            (l.subtreeFlags & 8772) !== 0
          ) : Dl(e, l), Al = s, Wt = c;
        }
        break;
      case 30:
        break;
      default:
        Dl(e, l);
    }
  }
  function Ph(e) {
    var t = e.alternate;
    t !== null && (e.alternate = null, Ph(t)), e.child = null, e.deletions = null, e.sibling = null, e.tag === 5 && (t = e.stateNode, t !== null && yu(t)), e.stateNode = null, e.return = null, e.dependencies = null, e.memoizedProps = null, e.memoizedState = null, e.pendingProps = null, e.stateNode = null, e.updateQueue = null;
  }
  var Lt = null, En = !1;
  function zl(e, t, l) {
    for (l = l.child; l !== null; )
      Yh(e, t, l), l = l.sibling;
  }
  function Yh(e, t, l) {
    if (gt && typeof gt.onCommitFiberUnmount == "function")
      try {
        gt.onCommitFiberUnmount(et, l);
      } catch {
      }
    switch (l.tag) {
      case 26:
        Wt || sl(l, t), zl(
          e,
          t,
          l
        ), l.memoizedState ? l.memoizedState.count-- : l.stateNode && (l = l.stateNode, l.parentNode.removeChild(l));
        break;
      case 27:
        Wt || sl(l, t);
        var r = Lt, s = En;
        ho(l.type) && (Lt = l.stateNode, En = !1), zl(
          e,
          t,
          l
        ), Xa(l.stateNode), Lt = r, En = s;
        break;
      case 5:
        Wt || sl(l, t);
      case 6:
        if (r = Lt, s = En, Lt = null, zl(
          e,
          t,
          l
        ), Lt = r, En = s, Lt !== null)
          if (En)
            try {
              (Lt.nodeType === 9 ? Lt.body : Lt.nodeName === "HTML" ? Lt.ownerDocument.body : Lt).removeChild(l.stateNode);
            } catch (c) {
              bt(
                l,
                t,
                c
              );
            }
          else
            try {
              Lt.removeChild(l.stateNode);
            } catch (c) {
              bt(
                l,
                t,
                c
              );
            }
        break;
      case 18:
        Lt !== null && (En ? (e = Lt, _y(
          e.nodeType === 9 ? e.body : e.nodeName === "HTML" ? e.ownerDocument.body : e,
          l.stateNode
        ), Kr(e)) : _y(Lt, l.stateNode));
        break;
      case 4:
        r = Lt, s = En, Lt = l.stateNode.containerInfo, En = !0, zl(
          e,
          t,
          l
        ), Lt = r, En = s;
        break;
      case 0:
      case 11:
      case 14:
      case 15:
        so(2, l, t), Wt || so(4, l, t), zl(
          e,
          t,
          l
        );
        break;
      case 1:
        Wt || (sl(l, t), r = l.stateNode, typeof r.componentWillUnmount == "function" && Hh(
          l,
          t,
          r
        )), zl(
          e,
          t,
          l
        );
        break;
      case 21:
        zl(
          e,
          t,
          l
        );
        break;
      case 22:
        Wt = (r = Wt) || l.memoizedState !== null, zl(
          e,
          t,
          l
        ), Wt = r;
        break;
      default:
        zl(
          e,
          t,
          l
        );
    }
  }
  function Gh(e, t) {
    if (t.memoizedState === null && (e = t.alternate, e !== null && (e = e.memoizedState, e !== null))) {
      e = e.dehydrated;
      try {
        Kr(e);
      } catch (l) {
        bt(t, t.return, l);
      }
    }
  }
  function qh(e, t) {
    if (t.memoizedState === null && (e = t.alternate, e !== null && (e = e.memoizedState, e !== null && (e = e.dehydrated, e !== null))))
      try {
        Kr(e);
      } catch (l) {
        bt(t, t.return, l);
      }
  }
  function kw(e) {
    switch (e.tag) {
      case 31:
      case 13:
      case 19:
        var t = e.stateNode;
        return t === null && (t = e.stateNode = new Bh()), t;
      case 22:
        return e = e.stateNode, t = e._retryCache, t === null && (t = e._retryCache = new Bh()), t;
      default:
        throw Error(i(435, e.tag));
    }
  }
  function vs(e, t) {
    var l = kw(e);
    t.forEach(function(r) {
      if (!l.has(r)) {
        l.add(r);
        var s = Yw.bind(null, e, r);
        r.then(s, s);
      }
    });
  }
  function Tn(e, t) {
    var l = t.deletions;
    if (l !== null)
      for (var r = 0; r < l.length; r++) {
        var s = l[r], c = e, h = t, R = h;
        e: for (; R !== null; ) {
          switch (R.tag) {
            case 27:
              if (ho(R.type)) {
                Lt = R.stateNode, En = !1;
                break e;
              }
              break;
            case 5:
              Lt = R.stateNode, En = !1;
              break e;
            case 3:
            case 4:
              Lt = R.stateNode.containerInfo, En = !0;
              break e;
          }
          R = R.return;
        }
        if (Lt === null) throw Error(i(160));
        Yh(c, h, s), Lt = null, En = !1, c = s.alternate, c !== null && (c.return = null), s.return = null;
      }
    if (t.subtreeFlags & 13886)
      for (t = t.child; t !== null; )
        Xh(t, e), t = t.sibling;
  }
  var ll = null;
  function Xh(e, t) {
    var l = e.alternate, r = e.flags;
    switch (e.tag) {
      case 0:
      case 11:
      case 14:
      case 15:
        Tn(t, e), Rn(e), r & 4 && (so(3, e, e.return), Ha(3, e), so(5, e, e.return));
        break;
      case 1:
        Tn(t, e), Rn(e), r & 512 && (Wt || l === null || sl(l, l.return)), r & 64 && Al && (e = e.updateQueue, e !== null && (r = e.callbacks, r !== null && (l = e.shared.hiddenCallbacks, e.shared.hiddenCallbacks = l === null ? r : l.concat(r))));
        break;
      case 26:
        var s = ll;
        if (Tn(t, e), Rn(e), r & 512 && (Wt || l === null || sl(l, l.return)), r & 4) {
          var c = l !== null ? l.memoizedState : null;
          if (r = e.memoizedState, l === null)
            if (r === null)
              if (e.stateNode === null) {
                e: {
                  r = e.type, l = e.memoizedProps, s = s.ownerDocument || s;
                  t: switch (r) {
                    case "title":
                      c = s.getElementsByTagName("title")[0], (!c || c[ua] || c[Ot] || c.namespaceURI === "http://www.w3.org/2000/svg" || c.hasAttribute("itemprop")) && (c = s.createElement(r), s.head.insertBefore(
                        c,
                        s.querySelector("head > title")
                      )), pn(c, r, l), c[Ot] = e, on(c), r = c;
                      break e;
                    case "link":
                      var h = Xy(
                        "link",
                        "href",
                        s
                      ).get(r + (l.href || ""));
                      if (h) {
                        for (var R = 0; R < h.length; R++)
                          if (c = h[R], c.getAttribute("href") === (l.href == null || l.href === "" ? null : l.href) && c.getAttribute("rel") === (l.rel == null ? null : l.rel) && c.getAttribute("title") === (l.title == null ? null : l.title) && c.getAttribute("crossorigin") === (l.crossOrigin == null ? null : l.crossOrigin)) {
                            h.splice(R, 1);
                            break t;
                          }
                      }
                      c = s.createElement(r), pn(c, r, l), s.head.appendChild(c);
                      break;
                    case "meta":
                      if (h = Xy(
                        "meta",
                        "content",
                        s
                      ).get(r + (l.content || ""))) {
                        for (R = 0; R < h.length; R++)
                          if (c = h[R], c.getAttribute("content") === (l.content == null ? null : "" + l.content) && c.getAttribute("name") === (l.name == null ? null : l.name) && c.getAttribute("property") === (l.property == null ? null : l.property) && c.getAttribute("http-equiv") === (l.httpEquiv == null ? null : l.httpEquiv) && c.getAttribute("charset") === (l.charSet == null ? null : l.charSet)) {
                            h.splice(R, 1);
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
                Fy(
                  s,
                  e.type,
                  e.stateNode
                );
            else
              e.stateNode = qy(
                s,
                r,
                e.memoizedProps
              );
          else
            c !== r ? (c === null ? l.stateNode !== null && (l = l.stateNode, l.parentNode.removeChild(l)) : c.count--, r === null ? Fy(
              s,
              e.type,
              e.stateNode
            ) : qy(
              s,
              r,
              e.memoizedProps
            )) : r === null && e.stateNode !== null && If(
              e,
              e.memoizedProps,
              l.memoizedProps
            );
        }
        break;
      case 27:
        Tn(t, e), Rn(e), r & 512 && (Wt || l === null || sl(l, l.return)), l !== null && r & 4 && If(
          e,
          e.memoizedProps,
          l.memoizedProps
        );
        break;
      case 5:
        if (Tn(t, e), Rn(e), r & 512 && (Wt || l === null || sl(l, l.return)), e.flags & 32) {
          s = e.stateNode;
          try {
            yr(s, "");
          } catch (De) {
            bt(e, e.return, De);
          }
        }
        r & 4 && e.stateNode != null && (s = e.memoizedProps, If(
          e,
          s,
          l !== null ? l.memoizedProps : s
        )), r & 1024 && (Pf = !0);
        break;
      case 6:
        if (Tn(t, e), Rn(e), r & 4) {
          if (e.stateNode === null)
            throw Error(i(162));
          r = e.memoizedProps, l = e.stateNode;
          try {
            l.nodeValue = r;
          } catch (De) {
            bt(e, e.return, De);
          }
        }
        break;
      case 3:
        if (ks = null, s = ll, ll = Ns(t.containerInfo), Tn(t, e), ll = s, Rn(e), r & 4 && l !== null && l.memoizedState.isDehydrated)
          try {
            Kr(t.containerInfo);
          } catch (De) {
            bt(e, e.return, De);
          }
        Pf && (Pf = !1, Fh(e));
        break;
      case 4:
        r = ll, ll = Ns(
          e.stateNode.containerInfo
        ), Tn(t, e), Rn(e), ll = r;
        break;
      case 12:
        Tn(t, e), Rn(e);
        break;
      case 31:
        Tn(t, e), Rn(e), r & 4 && (r = e.updateQueue, r !== null && (e.updateQueue = null, vs(e, r)));
        break;
      case 13:
        Tn(t, e), Rn(e), e.child.flags & 8192 && e.memoizedState !== null != (l !== null && l.memoizedState !== null) && (xs = ae()), r & 4 && (r = e.updateQueue, r !== null && (e.updateQueue = null, vs(e, r)));
        break;
      case 22:
        s = e.memoizedState !== null;
        var I = l !== null && l.memoizedState !== null, ee = Al, ce = Wt;
        if (Al = ee || s, Wt = ce || I, Tn(t, e), Wt = ce, Al = ee, Rn(e), r & 8192)
          e: for (t = e.stateNode, t._visibility = s ? t._visibility & -2 : t._visibility | 1, s && (l === null || I || Al || Wt || Jo(e)), l = null, t = e; ; ) {
            if (t.tag === 5 || t.tag === 26) {
              if (l === null) {
                I = l = t;
                try {
                  if (c = I.stateNode, s)
                    h = c.style, typeof h.setProperty == "function" ? h.setProperty("display", "none", "important") : h.display = "none";
                  else {
                    R = I.stateNode;
                    var de = I.memoizedProps.style, te = de != null && de.hasOwnProperty("display") ? de.display : null;
                    R.style.display = te == null || typeof te == "boolean" ? "" : ("" + te).trim();
                  }
                } catch (De) {
                  bt(I, I.return, De);
                }
              }
            } else if (t.tag === 6) {
              if (l === null) {
                I = t;
                try {
                  I.stateNode.nodeValue = s ? "" : I.memoizedProps;
                } catch (De) {
                  bt(I, I.return, De);
                }
              }
            } else if (t.tag === 18) {
              if (l === null) {
                I = t;
                try {
                  var le = I.stateNode;
                  s ? Hy(le, !0) : Hy(I.stateNode, !1);
                } catch (De) {
                  bt(I, I.return, De);
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
        r & 4 && (r = e.updateQueue, r !== null && (l = r.retryQueue, l !== null && (r.retryQueue = null, vs(e, l))));
        break;
      case 19:
        Tn(t, e), Rn(e), r & 4 && (r = e.updateQueue, r !== null && (e.updateQueue = null, vs(e, r)));
        break;
      case 30:
        break;
      case 21:
        break;
      default:
        Tn(t, e), Rn(e);
    }
  }
  function Rn(e) {
    var t = e.flags;
    if (t & 2) {
      try {
        for (var l, r = e.return; r !== null; ) {
          if (Lh(r)) {
            l = r;
            break;
          }
          r = r.return;
        }
        if (l == null) throw Error(i(160));
        switch (l.tag) {
          case 27:
            var s = l.stateNode, c = Bf(e);
            ys(e, c, s);
            break;
          case 5:
            var h = l.stateNode;
            l.flags & 32 && (yr(h, ""), l.flags &= -33);
            var R = Bf(e);
            ys(e, R, h);
            break;
          case 3:
          case 4:
            var I = l.stateNode.containerInfo, ee = Bf(e);
            Vf(
              e,
              ee,
              I
            );
            break;
          default:
            throw Error(i(161));
        }
      } catch (ce) {
        bt(e, e.return, ce);
      }
      e.flags &= -3;
    }
    t & 4096 && (e.flags &= -4097);
  }
  function Fh(e) {
    if (e.subtreeFlags & 1024)
      for (e = e.child; e !== null; ) {
        var t = e;
        Fh(t), t.tag === 5 && t.flags & 1024 && t.stateNode.reset(), e = e.sibling;
      }
  }
  function Dl(e, t) {
    if (t.subtreeFlags & 8772)
      for (t = t.child; t !== null; )
        Vh(e, t.alternate, t), t = t.sibling;
  }
  function Jo(e) {
    for (e = e.child; e !== null; ) {
      var t = e;
      switch (t.tag) {
        case 0:
        case 11:
        case 14:
        case 15:
          so(4, t, t.return), Jo(t);
          break;
        case 1:
          sl(t, t.return);
          var l = t.stateNode;
          typeof l.componentWillUnmount == "function" && Hh(
            t,
            t.return,
            l
          ), Jo(t);
          break;
        case 27:
          Xa(t.stateNode);
        case 26:
        case 5:
          sl(t, t.return), Jo(t);
          break;
        case 22:
          t.memoizedState === null && Jo(t);
          break;
        case 30:
          Jo(t);
          break;
        default:
          Jo(t);
      }
      e = e.sibling;
    }
  }
  function Nl(e, t, l) {
    for (l = l && (t.subtreeFlags & 8772) !== 0, t = t.child; t !== null; ) {
      var r = t.alternate, s = e, c = t, h = c.flags;
      switch (c.tag) {
        case 0:
        case 11:
        case 15:
          Nl(
            s,
            c,
            l
          ), Ha(4, c);
          break;
        case 1:
          if (Nl(
            s,
            c,
            l
          ), r = c, s = r.stateNode, typeof s.componentDidMount == "function")
            try {
              s.componentDidMount();
            } catch (ee) {
              bt(r, r.return, ee);
            }
          if (r = c, s = r.updateQueue, s !== null) {
            var R = r.stateNode;
            try {
              var I = s.shared.hiddenCallbacks;
              if (I !== null)
                for (s.shared.hiddenCallbacks = null, s = 0; s < I.length; s++)
                  Tm(I[s], R);
            } catch (ee) {
              bt(r, r.return, ee);
            }
          }
          l && h & 64 && _h(c), Ua(c, c.return);
          break;
        case 27:
          Ih(c);
        case 26:
        case 5:
          Nl(
            s,
            c,
            l
          ), l && r === null && h & 4 && Uh(c), Ua(c, c.return);
          break;
        case 12:
          Nl(
            s,
            c,
            l
          );
          break;
        case 31:
          Nl(
            s,
            c,
            l
          ), l && h & 4 && Gh(s, c);
          break;
        case 13:
          Nl(
            s,
            c,
            l
          ), l && h & 4 && qh(s, c);
          break;
        case 22:
          c.memoizedState === null && Nl(
            s,
            c,
            l
          ), Ua(c, c.return);
          break;
        case 30:
          break;
        default:
          Nl(
            s,
            c,
            l
          );
      }
      t = t.sibling;
    }
  }
  function Yf(e, t) {
    var l = null;
    e !== null && e.memoizedState !== null && e.memoizedState.cachePool !== null && (l = e.memoizedState.cachePool.pool), e = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (e = t.memoizedState.cachePool.pool), e !== l && (e != null && e.refCount++, l != null && Ea(l));
  }
  function Gf(e, t) {
    e = null, t.alternate !== null && (e = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== e && (t.refCount++, e != null && Ea(e));
  }
  function ol(e, t, l, r) {
    if (t.subtreeFlags & 10256)
      for (t = t.child; t !== null; )
        Kh(
          e,
          t,
          l,
          r
        ), t = t.sibling;
  }
  function Kh(e, t, l, r) {
    var s = t.flags;
    switch (t.tag) {
      case 0:
      case 11:
      case 15:
        ol(
          e,
          t,
          l,
          r
        ), s & 2048 && Ha(9, t);
        break;
      case 1:
        ol(
          e,
          t,
          l,
          r
        );
        break;
      case 3:
        ol(
          e,
          t,
          l,
          r
        ), s & 2048 && (e = null, t.alternate !== null && (e = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== e && (t.refCount++, e != null && Ea(e)));
        break;
      case 12:
        if (s & 2048) {
          ol(
            e,
            t,
            l,
            r
          ), e = t.stateNode;
          try {
            var c = t.memoizedProps, h = c.id, R = c.onPostCommit;
            typeof R == "function" && R(
              h,
              t.alternate === null ? "mount" : "update",
              e.passiveEffectDuration,
              -0
            );
          } catch (I) {
            bt(t, t.return, I);
          }
        } else
          ol(
            e,
            t,
            l,
            r
          );
        break;
      case 31:
        ol(
          e,
          t,
          l,
          r
        );
        break;
      case 13:
        ol(
          e,
          t,
          l,
          r
        );
        break;
      case 23:
        break;
      case 22:
        c = t.stateNode, h = t.alternate, t.memoizedState !== null ? c._visibility & 2 ? ol(
          e,
          t,
          l,
          r
        ) : La(e, t) : c._visibility & 2 ? ol(
          e,
          t,
          l,
          r
        ) : (c._visibility |= 2, Ur(
          e,
          t,
          l,
          r,
          (t.subtreeFlags & 10256) !== 0 || !1
        )), s & 2048 && Yf(h, t);
        break;
      case 24:
        ol(
          e,
          t,
          l,
          r
        ), s & 2048 && Gf(t.alternate, t);
        break;
      default:
        ol(
          e,
          t,
          l,
          r
        );
    }
  }
  function Ur(e, t, l, r, s) {
    for (s = s && ((t.subtreeFlags & 10256) !== 0 || !1), t = t.child; t !== null; ) {
      var c = e, h = t, R = l, I = r, ee = h.flags;
      switch (h.tag) {
        case 0:
        case 11:
        case 15:
          Ur(
            c,
            h,
            R,
            I,
            s
          ), Ha(8, h);
          break;
        case 23:
          break;
        case 22:
          var ce = h.stateNode;
          h.memoizedState !== null ? ce._visibility & 2 ? Ur(
            c,
            h,
            R,
            I,
            s
          ) : La(
            c,
            h
          ) : (ce._visibility |= 2, Ur(
            c,
            h,
            R,
            I,
            s
          )), s && ee & 2048 && Yf(
            h.alternate,
            h
          );
          break;
        case 24:
          Ur(
            c,
            h,
            R,
            I,
            s
          ), s && ee & 2048 && Gf(h.alternate, h);
          break;
        default:
          Ur(
            c,
            h,
            R,
            I,
            s
          );
      }
      t = t.sibling;
    }
  }
  function La(e, t) {
    if (t.subtreeFlags & 10256)
      for (t = t.child; t !== null; ) {
        var l = e, r = t, s = r.flags;
        switch (r.tag) {
          case 22:
            La(l, r), s & 2048 && Yf(
              r.alternate,
              r
            );
            break;
          case 24:
            La(l, r), s & 2048 && Gf(r.alternate, r);
            break;
          default:
            La(l, r);
        }
        t = t.sibling;
      }
  }
  var Ia = 8192;
  function Lr(e, t, l) {
    if (e.subtreeFlags & Ia)
      for (e = e.child; e !== null; )
        Qh(
          e,
          t,
          l
        ), e = e.sibling;
  }
  function Qh(e, t, l) {
    switch (e.tag) {
      case 26:
        Lr(
          e,
          t,
          l
        ), e.flags & Ia && e.memoizedState !== null && x1(
          l,
          ll,
          e.memoizedState,
          e.memoizedProps
        );
        break;
      case 5:
        Lr(
          e,
          t,
          l
        );
        break;
      case 3:
      case 4:
        var r = ll;
        ll = Ns(e.stateNode.containerInfo), Lr(
          e,
          t,
          l
        ), ll = r;
        break;
      case 22:
        e.memoizedState === null && (r = e.alternate, r !== null && r.memoizedState !== null ? (r = Ia, Ia = 16777216, Lr(
          e,
          t,
          l
        ), Ia = r) : Lr(
          e,
          t,
          l
        ));
        break;
      default:
        Lr(
          e,
          t,
          l
        );
    }
  }
  function Zh(e) {
    var t = e.alternate;
    if (t !== null && (e = t.child, e !== null)) {
      t.child = null;
      do
        t = e.sibling, e.sibling = null, e = t;
      while (e !== null);
    }
  }
  function Ba(e) {
    var t = e.deletions;
    if ((e.flags & 16) !== 0) {
      if (t !== null)
        for (var l = 0; l < t.length; l++) {
          var r = t[l];
          rn = r, $h(
            r,
            e
          );
        }
      Zh(e);
    }
    if (e.subtreeFlags & 10256)
      for (e = e.child; e !== null; )
        Jh(e), e = e.sibling;
  }
  function Jh(e) {
    switch (e.tag) {
      case 0:
      case 11:
      case 15:
        Ba(e), e.flags & 2048 && so(9, e, e.return);
        break;
      case 3:
        Ba(e);
        break;
      case 12:
        Ba(e);
        break;
      case 22:
        var t = e.stateNode;
        e.memoizedState !== null && t._visibility & 2 && (e.return === null || e.return.tag !== 13) ? (t._visibility &= -3, bs(e)) : Ba(e);
        break;
      default:
        Ba(e);
    }
  }
  function bs(e) {
    var t = e.deletions;
    if ((e.flags & 16) !== 0) {
      if (t !== null)
        for (var l = 0; l < t.length; l++) {
          var r = t[l];
          rn = r, $h(
            r,
            e
          );
        }
      Zh(e);
    }
    for (e = e.child; e !== null; ) {
      switch (t = e, t.tag) {
        case 0:
        case 11:
        case 15:
          so(8, t, t.return), bs(t);
          break;
        case 22:
          l = t.stateNode, l._visibility & 2 && (l._visibility &= -3, bs(t));
          break;
        default:
          bs(t);
      }
      e = e.sibling;
    }
  }
  function $h(e, t) {
    for (; rn !== null; ) {
      var l = rn;
      switch (l.tag) {
        case 0:
        case 11:
        case 15:
          so(8, l, t);
          break;
        case 23:
        case 22:
          if (l.memoizedState !== null && l.memoizedState.cachePool !== null) {
            var r = l.memoizedState.cachePool.pool;
            r != null && r.refCount++;
          }
          break;
        case 24:
          Ea(l.memoizedState.cache);
      }
      if (r = l.child, r !== null) r.return = l, rn = r;
      else
        e: for (l = e; rn !== null; ) {
          r = rn;
          var s = r.sibling, c = r.return;
          if (Ph(r), r === l) {
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
  var _w = {
    getCacheForType: function(e) {
      var t = fn(Zt), l = t.data.get(e);
      return l === void 0 && (l = e(), t.data.set(e, l)), l;
    },
    cacheSignal: function() {
      return fn(Zt).controller.signal;
    }
  }, Hw = typeof WeakMap == "function" ? WeakMap : Map, dt = 0, Mt = null, lt = null, at = 0, vt = 0, _n = null, co = !1, Ir = !1, qf = !1, jl = 0, Vt = 0, uo = 0, $o = 0, Xf = 0, Hn = 0, Br = 0, Va = null, Cn = null, Ff = !1, xs = 0, Wh = 0, Ss = 1 / 0, ws = null, fo = null, tn = 0, po = null, Vr = null, kl = 0, Kf = 0, Qf = null, ey = null, Pa = 0, Zf = null;
  function Un() {
    return (dt & 2) !== 0 && at !== 0 ? at & -at : _.T !== null ? nd() : Xt();
  }
  function ty() {
    if (Hn === 0)
      if ((at & 536870912) === 0 || st) {
        var e = It;
        It <<= 1, (It & 3932160) === 0 && (It = 262144), Hn = e;
      } else Hn = 536870912;
    return e = jn.current, e !== null && (e.flags |= 32), Hn;
  }
  function On(e, t, l) {
    (e === Mt && (vt === 2 || vt === 9) || e.cancelPendingCommit !== null) && (Pr(e, 0), go(
      e,
      at,
      Hn,
      !1
    )), qt(e, l), ((dt & 2) === 0 || e !== Mt) && (e === Mt && ((dt & 2) === 0 && ($o |= l), Vt === 4 && go(
      e,
      at,
      Hn,
      !1
    )), cl(e));
  }
  function ny(e, t, l) {
    if ((dt & 6) !== 0) throw Error(i(327));
    var r = !l && (t & 127) === 0 && (t & e.expiredLanes) === 0 || Gt(e, t), s = r ? Iw(e, t) : $f(e, t, !0), c = r;
    do {
      if (s === 0) {
        Ir && !r && go(e, t, 0, !1);
        break;
      } else {
        if (l = e.current.alternate, c && !Uw(l)) {
          s = $f(e, t, !1), c = !1;
          continue;
        }
        if (s === 2) {
          if (c = t, e.errorRecoveryDisabledLanes & c)
            var h = 0;
          else
            h = e.pendingLanes & -536870913, h = h !== 0 ? h : h & 536870912 ? 536870912 : 0;
          if (h !== 0) {
            t = h;
            e: {
              var R = e;
              s = Va;
              var I = R.current.memoizedState.isDehydrated;
              if (I && (Pr(R, h).flags |= 256), h = $f(
                R,
                h,
                !1
              ), h !== 2) {
                if (qf && !I) {
                  R.errorRecoveryDisabledLanes |= c, $o |= c, s = 4;
                  break e;
                }
                c = Cn, Cn = s, c !== null && (Cn === null ? Cn = c : Cn.push.apply(
                  Cn,
                  c
                ));
              }
              s = h;
            }
            if (c = !1, s !== 2) continue;
          }
        }
        if (s === 1) {
          Pr(e, 0), go(e, t, 0, !0);
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
              go(
                r,
                t,
                Hn,
                !co
              );
              break e;
            case 2:
              Cn = null;
              break;
            case 3:
            case 5:
              break;
            default:
              throw Error(i(329));
          }
          if ((t & 62914560) === t && (s = xs + 300 - ae(), 10 < s)) {
            if (go(
              r,
              t,
              Hn,
              !co
            ), jt(r, 0, !0) !== 0) break e;
            kl = t, r.timeoutHandle = jy(
              ly.bind(
                null,
                r,
                l,
                Cn,
                ws,
                Ff,
                t,
                Hn,
                $o,
                Br,
                co,
                c,
                "Throttled",
                -0,
                0
              ),
              s
            );
            break e;
          }
          ly(
            r,
            l,
            Cn,
            ws,
            Ff,
            t,
            Hn,
            $o,
            Br,
            co,
            c,
            null,
            -0,
            0
          );
        }
      }
      break;
    } while (!0);
    cl(e);
  }
  function ly(e, t, l, r, s, c, h, R, I, ee, ce, de, te, le) {
    if (e.timeoutHandle = -1, de = t.subtreeFlags, de & 8192 || (de & 16785408) === 16785408) {
      de = {
        stylesheets: null,
        count: 0,
        imgCount: 0,
        imgBytes: 0,
        suspenseyImages: [],
        waitingForImages: !0,
        waitingForViewTransition: !1,
        unsuspend: bl
      }, Qh(
        t,
        c,
        de
      );
      var De = (c & 62914560) === c ? xs - ae() : (c & 4194048) === c ? Wh - ae() : 0;
      if (De = S1(
        de,
        De
      ), De !== null) {
        kl = c, e.cancelPendingCommit = De(
          fy.bind(
            null,
            e,
            t,
            c,
            l,
            r,
            s,
            h,
            R,
            I,
            ce,
            de,
            null,
            te,
            le
          )
        ), go(e, c, h, !ee);
        return;
      }
    }
    fy(
      e,
      t,
      c,
      l,
      r,
      s,
      h,
      R,
      I
    );
  }
  function Uw(e) {
    for (var t = e; ; ) {
      var l = t.tag;
      if ((l === 0 || l === 11 || l === 15) && t.flags & 16384 && (l = t.updateQueue, l !== null && (l = l.stores, l !== null)))
        for (var r = 0; r < l.length; r++) {
          var s = l[r], c = s.getSnapshot;
          s = s.value;
          try {
            if (!Dn(c(), s)) return !1;
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
  function go(e, t, l, r) {
    t &= ~Xf, t &= ~$o, e.suspendedLanes |= t, e.pingedLanes &= ~t, r && (e.warmLanes |= t), r = e.expirationTimes;
    for (var s = t; 0 < s; ) {
      var c = 31 - yt(s), h = 1 << c;
      r[c] = -1, s &= ~h;
    }
    l !== 0 && hl(e, l, t);
  }
  function Es() {
    return (dt & 6) === 0 ? (Ya(0), !1) : !0;
  }
  function Jf() {
    if (lt !== null) {
      if (vt === 0)
        var e = lt.return;
      else
        e = lt, El = Yo = null, pf(e), Nr = null, Ra = 0, e = lt;
      for (; e !== null; )
        kh(e.alternate, e), e = e.return;
      lt = null;
    }
  }
  function Pr(e, t) {
    var l = e.timeoutHandle;
    l !== -1 && (e.timeoutHandle = -1, l1(l)), l = e.cancelPendingCommit, l !== null && (e.cancelPendingCommit = null, l()), kl = 0, Jf(), Mt = e, lt = l = Sl(e.current, null), at = t, vt = 0, _n = null, co = !1, Ir = Gt(e, t), qf = !1, Br = Hn = Xf = $o = uo = Vt = 0, Cn = Va = null, Ff = !1, (t & 8) !== 0 && (t |= t & 32);
    var r = e.entangledLanes;
    if (r !== 0)
      for (e = e.entanglements, r &= t; 0 < r; ) {
        var s = 31 - yt(r), c = 1 << s;
        t |= e[s], r &= ~c;
      }
    return jl = t, Gi(), l;
  }
  function oy(e, t) {
    Xe = null, _.H = ja, t === Dr || t === $i ? (t = xm(), vt = 3) : t === ef ? (t = xm(), vt = 4) : vt = t === Af ? 8 : t !== null && typeof t == "object" && typeof t.then == "function" ? 6 : 1, _n = t, lt === null && (Vt = 1, ds(
      e,
      Xn(t, e.current)
    ));
  }
  function ry() {
    var e = jn.current;
    return e === null ? !0 : (at & 4194048) === at ? Zn === null : (at & 62914560) === at || (at & 536870912) !== 0 ? e === Zn : !1;
  }
  function ay() {
    var e = _.H;
    return _.H = ja, e === null ? ja : e;
  }
  function iy() {
    var e = _.A;
    return _.A = _w, e;
  }
  function Ts() {
    Vt = 4, co || (at & 4194048) !== at && jn.current !== null || (Ir = !0), (uo & 134217727) === 0 && ($o & 134217727) === 0 || Mt === null || go(
      Mt,
      at,
      Hn,
      !1
    );
  }
  function $f(e, t, l) {
    var r = dt;
    dt |= 2;
    var s = ay(), c = iy();
    (Mt !== e || at !== t) && (ws = null, Pr(e, t)), t = !1;
    var h = Vt;
    e: do
      try {
        if (vt !== 0 && lt !== null) {
          var R = lt, I = _n;
          switch (vt) {
            case 8:
              Jf(), h = 6;
              break e;
            case 3:
            case 2:
            case 9:
            case 6:
              jn.current === null && (t = !0);
              var ee = vt;
              if (vt = 0, _n = null, Yr(e, R, I, ee), l && Ir) {
                h = 0;
                break e;
              }
              break;
            default:
              ee = vt, vt = 0, _n = null, Yr(e, R, I, ee);
          }
        }
        Lw(), h = Vt;
        break;
      } catch (ce) {
        oy(e, ce);
      }
    while (!0);
    return t && e.shellSuspendCounter++, El = Yo = null, dt = r, _.H = s, _.A = c, lt === null && (Mt = null, at = 0, Gi()), h;
  }
  function Lw() {
    for (; lt !== null; ) sy(lt);
  }
  function Iw(e, t) {
    var l = dt;
    dt |= 2;
    var r = ay(), s = iy();
    Mt !== e || at !== t ? (ws = null, Ss = ae() + 500, Pr(e, t)) : Ir = Gt(
      e,
      t
    );
    e: do
      try {
        if (vt !== 0 && lt !== null) {
          t = lt;
          var c = _n;
          t: switch (vt) {
            case 1:
              vt = 0, _n = null, Yr(e, t, c, 1);
              break;
            case 2:
            case 9:
              if (vm(c)) {
                vt = 0, _n = null, cy(t);
                break;
              }
              t = function() {
                vt !== 2 && vt !== 9 || Mt !== e || (vt = 7), cl(e);
              }, c.then(t, t);
              break e;
            case 3:
              vt = 7;
              break e;
            case 4:
              vt = 5;
              break e;
            case 7:
              vm(c) ? (vt = 0, _n = null, cy(t)) : (vt = 0, _n = null, Yr(e, t, c, 7));
              break;
            case 5:
              var h = null;
              switch (lt.tag) {
                case 26:
                  h = lt.memoizedState;
                case 5:
                case 27:
                  var R = lt;
                  if (h ? Ky(h) : R.stateNode.complete) {
                    vt = 0, _n = null;
                    var I = R.sibling;
                    if (I !== null) lt = I;
                    else {
                      var ee = R.return;
                      ee !== null ? (lt = ee, Rs(ee)) : lt = null;
                    }
                    break t;
                  }
              }
              vt = 0, _n = null, Yr(e, t, c, 5);
              break;
            case 6:
              vt = 0, _n = null, Yr(e, t, c, 6);
              break;
            case 8:
              Jf(), Vt = 6;
              break e;
            default:
              throw Error(i(462));
          }
        }
        Bw();
        break;
      } catch (ce) {
        oy(e, ce);
      }
    while (!0);
    return El = Yo = null, _.H = r, _.A = s, dt = l, lt !== null ? 0 : (Mt = null, at = 0, Gi(), Vt);
  }
  function Bw() {
    for (; lt !== null && !Oe(); )
      sy(lt);
  }
  function sy(e) {
    var t = Nh(e.alternate, e, jl);
    e.memoizedProps = e.pendingProps, t === null ? Rs(e) : lt = t;
  }
  function cy(e) {
    var t = e, l = t.alternate;
    switch (t.tag) {
      case 15:
      case 0:
        t = Ch(
          l,
          t,
          t.pendingProps,
          t.type,
          void 0,
          at
        );
        break;
      case 11:
        t = Ch(
          l,
          t,
          t.pendingProps,
          t.type.render,
          t.ref,
          at
        );
        break;
      case 5:
        pf(t);
      default:
        kh(l, t), t = lt = im(t, jl), t = Nh(l, t, jl);
    }
    e.memoizedProps = e.pendingProps, t === null ? Rs(e) : lt = t;
  }
  function Yr(e, t, l, r) {
    El = Yo = null, pf(t), Nr = null, Ra = 0;
    var s = t.return;
    try {
      if (Mw(
        e,
        s,
        t,
        l,
        at
      )) {
        Vt = 1, ds(
          e,
          Xn(l, e.current)
        ), lt = null;
        return;
      }
    } catch (c) {
      if (s !== null) throw lt = s, c;
      Vt = 1, ds(
        e,
        Xn(l, e.current)
      ), lt = null;
      return;
    }
    t.flags & 32768 ? (st || r === 1 ? e = !0 : Ir || (at & 536870912) !== 0 ? e = !1 : (co = e = !0, (r === 2 || r === 9 || r === 3 || r === 6) && (r = jn.current, r !== null && r.tag === 13 && (r.flags |= 16384))), uy(t, e)) : Rs(t);
  }
  function Rs(e) {
    var t = e;
    do {
      if ((t.flags & 32768) !== 0) {
        uy(
          t,
          co
        );
        return;
      }
      e = t.return;
      var l = Dw(
        t.alternate,
        t,
        jl
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
    Vt === 0 && (Vt = 5);
  }
  function uy(e, t) {
    do {
      var l = Nw(e.alternate, e);
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
    Vt = 6, lt = null;
  }
  function fy(e, t, l, r, s, c, h, R, I) {
    e.cancelPendingCommit = null;
    do
      Cs();
    while (tn !== 0);
    if ((dt & 6) !== 0) throw Error(i(327));
    if (t !== null) {
      if (t === e.current) throw Error(i(177));
      if (c = t.lanes | t.childLanes, c |= Iu, Pn(
        e,
        l,
        c,
        h,
        R,
        I
      ), e === Mt && (lt = Mt = null, at = 0), Vr = t, po = e, kl = l, Kf = c, Qf = s, ey = r, (t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0 ? (e.callbackNode = null, e.callbackPriority = 0, Gw(be, function() {
        return hy(), null;
      })) : (e.callbackNode = null, e.callbackPriority = 0), r = (t.flags & 13878) !== 0, (t.subtreeFlags & 13878) !== 0 || r) {
        r = _.T, _.T = null, s = Y.p, Y.p = 2, h = dt, dt |= 4;
        try {
          jw(e, t, l);
        } finally {
          dt = h, Y.p = s, _.T = r;
        }
      }
      tn = 1, dy(), py(), gy();
    }
  }
  function dy() {
    if (tn === 1) {
      tn = 0;
      var e = po, t = Vr, l = (t.flags & 13878) !== 0;
      if ((t.subtreeFlags & 13878) !== 0 || l) {
        l = _.T, _.T = null;
        var r = Y.p;
        Y.p = 2;
        var s = dt;
        dt |= 4;
        try {
          Xh(t, e);
          var c = ud, h = $g(e.containerInfo), R = c.focusedElem, I = c.selectionRange;
          if (h !== R && R && R.ownerDocument && Jg(
            R.ownerDocument.documentElement,
            R
          )) {
            if (I !== null && ku(R)) {
              var ee = I.start, ce = I.end;
              if (ce === void 0 && (ce = ee), "selectionStart" in R)
                R.selectionStart = ee, R.selectionEnd = Math.min(
                  ce,
                  R.value.length
                );
              else {
                var de = R.ownerDocument || document, te = de && de.defaultView || window;
                if (te.getSelection) {
                  var le = te.getSelection(), De = R.textContent.length, Ve = Math.min(I.start, De), Tt = I.end === void 0 ? Ve : Math.min(I.end, De);
                  !le.extend && Ve > Tt && (h = Tt, Tt = Ve, Ve = h);
                  var F = Zg(
                    R,
                    Ve
                  ), P = Zg(
                    R,
                    Tt
                  );
                  if (F && P && (le.rangeCount !== 1 || le.anchorNode !== F.node || le.anchorOffset !== F.offset || le.focusNode !== P.node || le.focusOffset !== P.offset)) {
                    var W = de.createRange();
                    W.setStart(F.node, F.offset), le.removeAllRanges(), Ve > Tt ? (le.addRange(W), le.extend(P.node, P.offset)) : (W.setEnd(P.node, P.offset), le.addRange(W));
                  }
                }
              }
            }
            for (de = [], le = R; le = le.parentNode; )
              le.nodeType === 1 && de.push({
                element: le,
                left: le.scrollLeft,
                top: le.scrollTop
              });
            for (typeof R.focus == "function" && R.focus(), R = 0; R < de.length; R++) {
              var ue = de[R];
              ue.element.scrollLeft = ue.left, ue.element.scrollTop = ue.top;
            }
          }
          Ls = !!cd, ud = cd = null;
        } finally {
          dt = s, Y.p = r, _.T = l;
        }
      }
      e.current = t, tn = 2;
    }
  }
  function py() {
    if (tn === 2) {
      tn = 0;
      var e = po, t = Vr, l = (t.flags & 8772) !== 0;
      if ((t.subtreeFlags & 8772) !== 0 || l) {
        l = _.T, _.T = null;
        var r = Y.p;
        Y.p = 2;
        var s = dt;
        dt |= 4;
        try {
          Vh(e, t.alternate, t);
        } finally {
          dt = s, Y.p = r, _.T = l;
        }
      }
      tn = 3;
    }
  }
  function gy() {
    if (tn === 4 || tn === 3) {
      tn = 0, He();
      var e = po, t = Vr, l = kl, r = ey;
      (t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0 ? tn = 5 : (tn = 0, Vr = po = null, my(e, e.pendingLanes));
      var s = e.pendingLanes;
      if (s === 0 && (fo = null), St(l), t = t.stateNode, gt && typeof gt.onCommitFiberRoot == "function")
        try {
          gt.onCommitFiberRoot(
            et,
            t,
            void 0,
            (t.current.flags & 128) === 128
          );
        } catch {
        }
      if (r !== null) {
        t = _.T, s = Y.p, Y.p = 2, _.T = null;
        try {
          for (var c = e.onRecoverableError, h = 0; h < r.length; h++) {
            var R = r[h];
            c(R.value, {
              componentStack: R.stack
            });
          }
        } finally {
          _.T = t, Y.p = s;
        }
      }
      (kl & 3) !== 0 && Cs(), cl(e), s = e.pendingLanes, (l & 261930) !== 0 && (s & 42) !== 0 ? e === Zf ? Pa++ : (Pa = 0, Zf = e) : Pa = 0, Ya(0);
    }
  }
  function my(e, t) {
    (e.pooledCacheLanes &= t) === 0 && (t = e.pooledCache, t != null && (e.pooledCache = null, Ea(t)));
  }
  function Cs() {
    return dy(), py(), gy(), hy();
  }
  function hy() {
    if (tn !== 5) return !1;
    var e = po, t = Kf;
    Kf = 0;
    var l = St(kl), r = _.T, s = Y.p;
    try {
      Y.p = 32 > l ? 32 : l, _.T = null, l = Qf, Qf = null;
      var c = po, h = kl;
      if (tn = 0, Vr = po = null, kl = 0, (dt & 6) !== 0) throw Error(i(331));
      var R = dt;
      if (dt |= 4, Jh(c.current), Kh(
        c,
        c.current,
        h,
        l
      ), dt = R, Ya(0, !1), gt && typeof gt.onPostCommitFiberRoot == "function")
        try {
          gt.onPostCommitFiberRoot(et, c);
        } catch {
        }
      return !0;
    } finally {
      Y.p = s, _.T = r, my(e, t);
    }
  }
  function yy(e, t, l) {
    t = Xn(l, t), t = Mf(e.stateNode, t, 2), e = ro(e, t, 2), e !== null && (qt(e, 2), cl(e));
  }
  function bt(e, t, l) {
    if (e.tag === 3)
      yy(e, e, l);
    else
      for (; t !== null; ) {
        if (t.tag === 3) {
          yy(
            t,
            e,
            l
          );
          break;
        } else if (t.tag === 1) {
          var r = t.stateNode;
          if (typeof t.type.getDerivedStateFromError == "function" || typeof r.componentDidCatch == "function" && (fo === null || !fo.has(r))) {
            e = Xn(l, e), l = vh(2), r = ro(t, l, 2), r !== null && (bh(
              l,
              r,
              t,
              e
            ), qt(r, 2), cl(r));
            break;
          }
        }
        t = t.return;
      }
  }
  function Wf(e, t, l) {
    var r = e.pingCache;
    if (r === null) {
      r = e.pingCache = new Hw();
      var s = /* @__PURE__ */ new Set();
      r.set(t, s);
    } else
      s = r.get(t), s === void 0 && (s = /* @__PURE__ */ new Set(), r.set(t, s));
    s.has(l) || (qf = !0, s.add(l), e = Vw.bind(null, e, t, l), t.then(e, e));
  }
  function Vw(e, t, l) {
    var r = e.pingCache;
    r !== null && r.delete(t), e.pingedLanes |= e.suspendedLanes & l, e.warmLanes &= ~l, Mt === e && (at & l) === l && (Vt === 4 || Vt === 3 && (at & 62914560) === at && 300 > ae() - xs ? (dt & 2) === 0 && Pr(e, 0) : Xf |= l, Br === at && (Br = 0)), cl(e);
  }
  function vy(e, t) {
    t === 0 && (t = zn()), e = Bo(e, t), e !== null && (qt(e, t), cl(e));
  }
  function Pw(e) {
    var t = e.memoizedState, l = 0;
    t !== null && (l = t.retryLane), vy(e, l);
  }
  function Yw(e, t) {
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
    r !== null && r.delete(t), vy(e, l);
  }
  function Gw(e, t) {
    return Se(e, t);
  }
  var Os = null, Gr = null, ed = !1, Ms = !1, td = !1, mo = 0;
  function cl(e) {
    e !== Gr && e.next === null && (Gr === null ? Os = Gr = e : Gr = Gr.next = e), Ms = !0, ed || (ed = !0, Xw());
  }
  function Ya(e, t) {
    if (!td && Ms) {
      td = !0;
      do
        for (var l = !1, r = Os; r !== null; ) {
          if (e !== 0) {
            var s = r.pendingLanes;
            if (s === 0) var c = 0;
            else {
              var h = r.suspendedLanes, R = r.pingedLanes;
              c = (1 << 31 - yt(42 | e) + 1) - 1, c &= s & ~(h & ~R), c = c & 201326741 ? c & 201326741 | 1 : c ? c | 2 : 0;
            }
            c !== 0 && (l = !0, wy(r, c));
          } else
            c = at, c = jt(
              r,
              r === Mt ? c : 0,
              r.cancelPendingCommit !== null || r.timeoutHandle !== -1
            ), (c & 3) === 0 || Gt(r, c) || (l = !0, wy(r, c));
          r = r.next;
        }
      while (l);
      td = !1;
    }
  }
  function qw() {
    by();
  }
  function by() {
    Ms = ed = !1;
    var e = 0;
    mo !== 0 && n1() && (e = mo);
    for (var t = ae(), l = null, r = Os; r !== null; ) {
      var s = r.next, c = xy(r, t);
      c === 0 ? (r.next = null, l === null ? Os = s : l.next = s, s === null && (Gr = l)) : (l = r, (e !== 0 || (c & 3) !== 0) && (Ms = !0)), r = s;
    }
    tn !== 0 && tn !== 5 || Ya(e), mo !== 0 && (mo = 0);
  }
  function xy(e, t) {
    for (var l = e.suspendedLanes, r = e.pingedLanes, s = e.expirationTimes, c = e.pendingLanes & -62914561; 0 < c; ) {
      var h = 31 - yt(c), R = 1 << h, I = s[h];
      I === -1 ? ((R & l) === 0 || (R & r) !== 0) && (s[h] = Sn(R, t)) : I <= t && (e.expiredLanes |= R), c &= ~R;
    }
    if (t = Mt, l = at, l = jt(
      e,
      e === t ? l : 0,
      e.cancelPendingCommit !== null || e.timeoutHandle !== -1
    ), r = e.callbackNode, l === 0 || e === t && (vt === 2 || vt === 9) || e.cancelPendingCommit !== null)
      return r !== null && r !== null && Te(r), e.callbackNode = null, e.callbackPriority = 0;
    if ((l & 3) === 0 || Gt(e, l)) {
      if (t = l & -l, t === e.callbackPriority) return t;
      switch (r !== null && Te(r), St(l)) {
        case 2:
        case 8:
          l = ve;
          break;
        case 32:
          l = be;
          break;
        case 268435456:
          l = rt;
          break;
        default:
          l = be;
      }
      return r = Sy.bind(null, e), l = Se(l, r), e.callbackPriority = t, e.callbackNode = l, t;
    }
    return r !== null && r !== null && Te(r), e.callbackPriority = 2, e.callbackNode = null, 2;
  }
  function Sy(e, t) {
    if (tn !== 0 && tn !== 5)
      return e.callbackNode = null, e.callbackPriority = 0, null;
    var l = e.callbackNode;
    if (Cs() && e.callbackNode !== l)
      return null;
    var r = at;
    return r = jt(
      e,
      e === Mt ? r : 0,
      e.cancelPendingCommit !== null || e.timeoutHandle !== -1
    ), r === 0 ? null : (ny(e, r, t), xy(e, ae()), e.callbackNode != null && e.callbackNode === l ? Sy.bind(null, e) : null);
  }
  function wy(e, t) {
    if (Cs()) return null;
    ny(e, t, !0);
  }
  function Xw() {
    o1(function() {
      (dt & 6) !== 0 ? Se(
        Ue,
        qw
      ) : by();
    });
  }
  function nd() {
    if (mo === 0) {
      var e = Ar;
      e === 0 && (e = ft, ft <<= 1, (ft & 261888) === 0 && (ft = 256)), mo = e;
    }
    return mo;
  }
  function Ey(e) {
    return e == null || typeof e == "symbol" || typeof e == "boolean" ? null : typeof e == "function" ? e : Hi("" + e);
  }
  function Ty(e, t) {
    var l = t.ownerDocument.createElement("input");
    return l.name = t.name, l.value = t.value, e.id && l.setAttribute("form", e.id), t.parentNode.insertBefore(l, t), e = new FormData(e), l.parentNode.removeChild(l), e;
  }
  function Fw(e, t, l, r, s) {
    if (t === "submit" && l && l.stateNode === s) {
      var c = Ey(
        (s[cn] || null).action
      ), h = r.submitter;
      h && (t = (t = h[cn] || null) ? Ey(t.formAction) : h.getAttribute("formAction"), t !== null && (c = t, h = null));
      var R = new Bi(
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
                if (mo !== 0) {
                  var I = h ? Ty(s, h) : new FormData(s);
                  wf(
                    l,
                    {
                      pending: !0,
                      data: I,
                      method: s.method,
                      action: c
                    },
                    null,
                    I
                  );
                }
              } else
                typeof c == "function" && (R.preventDefault(), I = h ? Ty(s, h) : new FormData(s), wf(
                  l,
                  {
                    pending: !0,
                    data: I,
                    method: s.method,
                    action: c
                  },
                  c,
                  I
                ));
            },
            currentTarget: s
          }
        ]
      });
    }
  }
  for (var ld = 0; ld < Lu.length; ld++) {
    var od = Lu[ld], Kw = od.toLowerCase(), Qw = od[0].toUpperCase() + od.slice(1);
    nl(
      Kw,
      "on" + Qw
    );
  }
  nl(tm, "onAnimationEnd"), nl(nm, "onAnimationIteration"), nl(lm, "onAnimationStart"), nl("dblclick", "onDoubleClick"), nl("focusin", "onFocus"), nl("focusout", "onBlur"), nl(fw, "onTransitionRun"), nl(dw, "onTransitionStart"), nl(pw, "onTransitionCancel"), nl(om, "onTransitionEnd"), mr("onMouseEnter", ["mouseout", "mouseover"]), mr("onMouseLeave", ["mouseout", "mouseover"]), mr("onPointerEnter", ["pointerout", "pointerover"]), mr("onPointerLeave", ["pointerout", "pointerover"]), Ho(
    "onChange",
    "change click focusin focusout input keydown keyup selectionchange".split(" ")
  ), Ho(
    "onSelect",
    "focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(
      " "
    )
  ), Ho("onBeforeInput", [
    "compositionend",
    "keypress",
    "textInput",
    "paste"
  ]), Ho(
    "onCompositionEnd",
    "compositionend focusout keydown keypress keyup mousedown".split(" ")
  ), Ho(
    "onCompositionStart",
    "compositionstart focusout keydown keypress keyup mousedown".split(" ")
  ), Ho(
    "onCompositionUpdate",
    "compositionupdate focusout keydown keypress keyup mousedown".split(" ")
  );
  var Ga = "abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(
    " "
  ), Zw = new Set(
    "beforetoggle cancel close invalid load scroll scrollend toggle".split(" ").concat(Ga)
  );
  function Ry(e, t) {
    t = (t & 4) !== 0;
    for (var l = 0; l < e.length; l++) {
      var r = e[l], s = r.event;
      r = r.listeners;
      e: {
        var c = void 0;
        if (t)
          for (var h = r.length - 1; 0 <= h; h--) {
            var R = r[h], I = R.instance, ee = R.currentTarget;
            if (R = R.listener, I !== c && s.isPropagationStopped())
              break e;
            c = R, s.currentTarget = ee;
            try {
              c(s);
            } catch (ce) {
              Yi(ce);
            }
            s.currentTarget = null, c = I;
          }
        else
          for (h = 0; h < r.length; h++) {
            if (R = r[h], I = R.instance, ee = R.currentTarget, R = R.listener, I !== c && s.isPropagationStopped())
              break e;
            c = R, s.currentTarget = ee;
            try {
              c(s);
            } catch (ce) {
              Yi(ce);
            }
            s.currentTarget = null, c = I;
          }
      }
    }
  }
  function ot(e, t) {
    var l = t[ca];
    l === void 0 && (l = t[ca] = /* @__PURE__ */ new Set());
    var r = e + "__bubble";
    l.has(r) || (Cy(t, e, 2, !1), l.add(r));
  }
  function rd(e, t, l) {
    var r = 0;
    t && (r |= 4), Cy(
      l,
      e,
      r,
      t
    );
  }
  var As = "_reactListening" + Math.random().toString(36).slice(2);
  function ad(e) {
    if (!e[As]) {
      e[As] = !0, bg.forEach(function(l) {
        l !== "selectionchange" && (Zw.has(l) || rd(l, !1, e), rd(l, !0, e));
      });
      var t = e.nodeType === 9 ? e : e.ownerDocument;
      t === null || t[As] || (t[As] = !0, rd("selectionchange", !1, t));
    }
  }
  function Cy(e, t, l, r) {
    switch (tv(t)) {
      case 2:
        var s = T1;
        break;
      case 8:
        s = R1;
        break;
      default:
        s = Sd;
    }
    l = s.bind(
      null,
      t,
      l,
      e
    ), s = void 0, !Ru || t !== "touchstart" && t !== "touchmove" && t !== "wheel" || (s = !0), r ? s !== void 0 ? e.addEventListener(t, l, {
      capture: !0,
      passive: s
    }) : e.addEventListener(t, l, !0) : s !== void 0 ? e.addEventListener(t, l, {
      passive: s
    }) : e.addEventListener(t, l, !1);
  }
  function id(e, t, l, r, s) {
    var c = r;
    if ((t & 1) === 0 && (t & 2) === 0 && r !== null)
      e: for (; ; ) {
        if (r === null) return;
        var h = r.tag;
        if (h === 3 || h === 4) {
          var R = r.stateNode.containerInfo;
          if (R === s) break;
          if (h === 4)
            for (h = r.return; h !== null; ) {
              var I = h.tag;
              if ((I === 3 || I === 4) && h.stateNode.containerInfo === s)
                return;
              h = h.return;
            }
          for (; R !== null; ) {
            if (h = dr(R), h === null) return;
            if (I = h.tag, I === 5 || I === 6 || I === 26 || I === 27) {
              r = c = h;
              continue e;
            }
            R = R.parentNode;
          }
        }
        r = r.return;
      }
    Dg(function() {
      var ee = c, ce = Eu(l), de = [];
      e: {
        var te = rm.get(e);
        if (te !== void 0) {
          var le = Bi, De = e;
          switch (e) {
            case "keypress":
              if (Li(l) === 0) break e;
            case "keydown":
            case "keyup":
              le = YS;
              break;
            case "focusin":
              De = "focus", le = Au;
              break;
            case "focusout":
              De = "blur", le = Au;
              break;
            case "beforeblur":
            case "afterblur":
              le = Au;
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
              le = kg;
              break;
            case "drag":
            case "dragend":
            case "dragenter":
            case "dragexit":
            case "dragleave":
            case "dragover":
            case "dragstart":
            case "drop":
              le = DS;
              break;
            case "touchcancel":
            case "touchend":
            case "touchmove":
            case "touchstart":
              le = XS;
              break;
            case tm:
            case nm:
            case lm:
              le = kS;
              break;
            case om:
              le = KS;
              break;
            case "scroll":
            case "scrollend":
              le = AS;
              break;
            case "wheel":
              le = ZS;
              break;
            case "copy":
            case "cut":
            case "paste":
              le = HS;
              break;
            case "gotpointercapture":
            case "lostpointercapture":
            case "pointercancel":
            case "pointerdown":
            case "pointermove":
            case "pointerout":
            case "pointerover":
            case "pointerup":
              le = Hg;
              break;
            case "toggle":
            case "beforetoggle":
              le = $S;
          }
          var Ve = (t & 4) !== 0, Tt = !Ve && (e === "scroll" || e === "scrollend"), F = Ve ? te !== null ? te + "Capture" : null : te;
          Ve = [];
          for (var P = ee, W; P !== null; ) {
            var ue = P;
            if (W = ue.stateNode, ue = ue.tag, ue !== 5 && ue !== 26 && ue !== 27 || W === null || F === null || (ue = da(P, F), ue != null && Ve.push(
              qa(P, ue, W)
            )), Tt) break;
            P = P.return;
          }
          0 < Ve.length && (te = new le(
            te,
            De,
            null,
            l,
            ce
          ), de.push({ event: te, listeners: Ve }));
        }
      }
      if ((t & 7) === 0) {
        e: {
          if (te = e === "mouseover" || e === "pointerover", le = e === "mouseout" || e === "pointerout", te && l !== wu && (De = l.relatedTarget || l.fromElement) && (dr(De) || De[rl]))
            break e;
          if ((le || te) && (te = ce.window === ce ? ce : (te = ce.ownerDocument) ? te.defaultView || te.parentWindow : window, le ? (De = l.relatedTarget || l.toElement, le = ee, De = De ? dr(De) : null, De !== null && (Tt = f(De), Ve = De.tag, De !== Tt || Ve !== 5 && Ve !== 27 && Ve !== 6) && (De = null)) : (le = null, De = ee), le !== De)) {
            if (Ve = kg, ue = "onMouseLeave", F = "onMouseEnter", P = "mouse", (e === "pointerout" || e === "pointerover") && (Ve = Hg, ue = "onPointerLeave", F = "onPointerEnter", P = "pointer"), Tt = le == null ? te : fa(le), W = De == null ? te : fa(De), te = new Ve(
              ue,
              P + "leave",
              le,
              l,
              ce
            ), te.target = Tt, te.relatedTarget = W, ue = null, dr(ce) === ee && (Ve = new Ve(
              F,
              P + "enter",
              De,
              l,
              ce
            ), Ve.target = W, Ve.relatedTarget = Tt, ue = Ve), Tt = ue, le && De)
              t: {
                for (Ve = Jw, F = le, P = De, W = 0, ue = F; ue; ue = Ve(ue))
                  W++;
                ue = 0;
                for (var Ie = P; Ie; Ie = Ve(Ie))
                  ue++;
                for (; 0 < W - ue; )
                  F = Ve(F), W--;
                for (; 0 < ue - W; )
                  P = Ve(P), ue--;
                for (; W--; ) {
                  if (F === P || P !== null && F === P.alternate) {
                    Ve = F;
                    break t;
                  }
                  F = Ve(F), P = Ve(P);
                }
                Ve = null;
              }
            else Ve = null;
            le !== null && Oy(
              de,
              te,
              le,
              Ve,
              !1
            ), De !== null && Tt !== null && Oy(
              de,
              Tt,
              De,
              Ve,
              !0
            );
          }
        }
        e: {
          if (te = ee ? fa(ee) : window, le = te.nodeName && te.nodeName.toLowerCase(), le === "select" || le === "input" && te.type === "file")
            var ct = Gg;
          else if (Pg(te))
            if (qg)
              ct = sw;
            else {
              ct = aw;
              var Ne = rw;
            }
          else
            le = te.nodeName, !le || le.toLowerCase() !== "input" || te.type !== "checkbox" && te.type !== "radio" ? ee && Su(ee.elementType) && (ct = Gg) : ct = iw;
          if (ct && (ct = ct(e, ee))) {
            Yg(
              de,
              ct,
              l,
              ce
            );
            break e;
          }
          Ne && Ne(e, te, ee), e === "focusout" && ee && te.type === "number" && ee.memoizedProps.value != null && xu(te, "number", te.value);
        }
        switch (Ne = ee ? fa(ee) : window, e) {
          case "focusin":
            (Pg(Ne) || Ne.contentEditable === "true") && (Sr = Ne, _u = ee, xa = null);
            break;
          case "focusout":
            xa = _u = Sr = null;
            break;
          case "mousedown":
            Hu = !0;
            break;
          case "contextmenu":
          case "mouseup":
          case "dragend":
            Hu = !1, Wg(de, l, ce);
            break;
          case "selectionchange":
            if (uw) break;
          case "keydown":
          case "keyup":
            Wg(de, l, ce);
        }
        var Fe;
        if (Du)
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
          xr ? Bg(e, l) && (it = "onCompositionEnd") : e === "keydown" && l.keyCode === 229 && (it = "onCompositionStart");
        it && (Ug && l.locale !== "ko" && (xr || it !== "onCompositionStart" ? it === "onCompositionEnd" && xr && (Fe = Ng()) : ($l = ce, Cu = "value" in $l ? $l.value : $l.textContent, xr = !0)), Ne = zs(ee, it), 0 < Ne.length && (it = new _g(
          it,
          e,
          null,
          l,
          ce
        ), de.push({ event: it, listeners: Ne }), Fe ? it.data = Fe : (Fe = Vg(l), Fe !== null && (it.data = Fe)))), (Fe = ew ? tw(e, l) : nw(e, l)) && (it = zs(ee, "onBeforeInput"), 0 < it.length && (Ne = new _g(
          "onBeforeInput",
          "beforeinput",
          null,
          l,
          ce
        ), de.push({
          event: Ne,
          listeners: it
        }), Ne.data = Fe)), Fw(
          de,
          e,
          ee,
          l,
          ce
        );
      }
      Ry(de, t);
    });
  }
  function qa(e, t, l) {
    return {
      instance: e,
      listener: t,
      currentTarget: l
    };
  }
  function zs(e, t) {
    for (var l = t + "Capture", r = []; e !== null; ) {
      var s = e, c = s.stateNode;
      if (s = s.tag, s !== 5 && s !== 26 && s !== 27 || c === null || (s = da(e, l), s != null && r.unshift(
        qa(e, s, c)
      ), s = da(e, t), s != null && r.push(
        qa(e, s, c)
      )), e.tag === 3) return r;
      e = e.return;
    }
    return [];
  }
  function Jw(e) {
    if (e === null) return null;
    do
      e = e.return;
    while (e && e.tag !== 5 && e.tag !== 27);
    return e || null;
  }
  function Oy(e, t, l, r, s) {
    for (var c = t._reactName, h = []; l !== null && l !== r; ) {
      var R = l, I = R.alternate, ee = R.stateNode;
      if (R = R.tag, I !== null && I === r) break;
      R !== 5 && R !== 26 && R !== 27 || ee === null || (I = ee, s ? (ee = da(l, c), ee != null && h.unshift(
        qa(l, ee, I)
      )) : s || (ee = da(l, c), ee != null && h.push(
        qa(l, ee, I)
      ))), l = l.return;
    }
    h.length !== 0 && e.push({ event: t, listeners: h });
  }
  var $w = /\r\n?/g, Ww = /\u0000|\uFFFD/g;
  function My(e) {
    return (typeof e == "string" ? e : "" + e).replace($w, `
`).replace(Ww, "");
  }
  function Ay(e, t) {
    return t = My(t), My(e) === t;
  }
  function Et(e, t, l, r, s, c) {
    switch (l) {
      case "children":
        typeof r == "string" ? t === "body" || t === "textarea" && r === "" || yr(e, r) : (typeof r == "number" || typeof r == "bigint") && t !== "body" && yr(e, "" + r);
        break;
      case "className":
        ki(e, "class", r);
        break;
      case "tabIndex":
        ki(e, "tabindex", r);
        break;
      case "dir":
      case "role":
      case "viewBox":
      case "width":
      case "height":
        ki(e, l, r);
        break;
      case "style":
        Ag(e, r, c);
        break;
      case "data":
        if (t !== "object") {
          ki(e, "data", r);
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
        r = Hi("" + r), e.setAttribute(l, r);
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
          typeof c == "function" && (l === "formAction" ? (t !== "input" && Et(e, t, "name", s.name, s, null), Et(
            e,
            t,
            "formEncType",
            s.formEncType,
            s,
            null
          ), Et(
            e,
            t,
            "formMethod",
            s.formMethod,
            s,
            null
          ), Et(
            e,
            t,
            "formTarget",
            s.formTarget,
            s,
            null
          )) : (Et(e, t, "encType", s.encType, s, null), Et(e, t, "method", s.method, s, null), Et(e, t, "target", s.target, s, null)));
        if (r == null || typeof r == "symbol" || typeof r == "boolean") {
          e.removeAttribute(l);
          break;
        }
        r = Hi("" + r), e.setAttribute(l, r);
        break;
      case "onClick":
        r != null && (e.onclick = bl);
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
        l = Hi("" + r), e.setAttributeNS(
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
        ot("beforetoggle", e), ot("toggle", e), ji(e, "popover", r);
        break;
      case "xlinkActuate":
        vl(
          e,
          "http://www.w3.org/1999/xlink",
          "xlink:actuate",
          r
        );
        break;
      case "xlinkArcrole":
        vl(
          e,
          "http://www.w3.org/1999/xlink",
          "xlink:arcrole",
          r
        );
        break;
      case "xlinkRole":
        vl(
          e,
          "http://www.w3.org/1999/xlink",
          "xlink:role",
          r
        );
        break;
      case "xlinkShow":
        vl(
          e,
          "http://www.w3.org/1999/xlink",
          "xlink:show",
          r
        );
        break;
      case "xlinkTitle":
        vl(
          e,
          "http://www.w3.org/1999/xlink",
          "xlink:title",
          r
        );
        break;
      case "xlinkType":
        vl(
          e,
          "http://www.w3.org/1999/xlink",
          "xlink:type",
          r
        );
        break;
      case "xmlBase":
        vl(
          e,
          "http://www.w3.org/XML/1998/namespace",
          "xml:base",
          r
        );
        break;
      case "xmlLang":
        vl(
          e,
          "http://www.w3.org/XML/1998/namespace",
          "xml:lang",
          r
        );
        break;
      case "xmlSpace":
        vl(
          e,
          "http://www.w3.org/XML/1998/namespace",
          "xml:space",
          r
        );
        break;
      case "is":
        ji(e, "is", r);
        break;
      case "innerText":
      case "textContent":
        break;
      default:
        (!(2 < l.length) || l[0] !== "o" && l[0] !== "O" || l[1] !== "n" && l[1] !== "N") && (l = OS.get(l) || l, ji(e, l, r));
    }
  }
  function sd(e, t, l, r, s, c) {
    switch (l) {
      case "style":
        Ag(e, r, c);
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
        typeof r == "string" ? yr(e, r) : (typeof r == "number" || typeof r == "bigint") && yr(e, "" + r);
        break;
      case "onScroll":
        r != null && ot("scroll", e);
        break;
      case "onScrollEnd":
        r != null && ot("scrollend", e);
        break;
      case "onClick":
        r != null && (e.onclick = bl);
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
        if (!xg.hasOwnProperty(l))
          e: {
            if (l[0] === "o" && l[1] === "n" && (s = l.endsWith("Capture"), t = l.slice(2, s ? l.length - 7 : void 0), c = e[cn] || null, c = c != null ? c[l] : null, typeof c == "function" && e.removeEventListener(t, c, s), typeof r == "function")) {
              typeof c != "function" && c !== null && (l in e ? e[l] = null : e.hasAttribute(l) && e.removeAttribute(l)), e.addEventListener(t, r, s);
              break e;
            }
            l in e ? e[l] = r : r === !0 ? e.setAttribute(l, "") : ji(e, l, r);
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
            var h = l[c];
            if (h != null)
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
                  Et(e, t, c, h, l, null);
              }
          }
        s && Et(e, t, "srcSet", l.srcSet, l, null), r && Et(e, t, "src", l.src, l, null);
        return;
      case "input":
        ot("invalid", e);
        var R = c = h = s = null, I = null, ee = null;
        for (r in l)
          if (l.hasOwnProperty(r)) {
            var ce = l[r];
            if (ce != null)
              switch (r) {
                case "name":
                  s = ce;
                  break;
                case "type":
                  h = ce;
                  break;
                case "checked":
                  I = ce;
                  break;
                case "defaultChecked":
                  ee = ce;
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
                  Et(e, t, r, ce, l, null);
              }
          }
        Rg(
          e,
          c,
          R,
          I,
          ee,
          h,
          s,
          !1
        );
        return;
      case "select":
        ot("invalid", e), r = h = c = null;
        for (s in l)
          if (l.hasOwnProperty(s) && (R = l[s], R != null))
            switch (s) {
              case "value":
                c = R;
                break;
              case "defaultValue":
                h = R;
                break;
              case "multiple":
                r = R;
              default:
                Et(e, t, s, R, l, null);
            }
        t = c, l = h, e.multiple = !!r, t != null ? hr(e, !!r, t, !1) : l != null && hr(e, !!r, l, !0);
        return;
      case "textarea":
        ot("invalid", e), c = s = r = null;
        for (h in l)
          if (l.hasOwnProperty(h) && (R = l[h], R != null))
            switch (h) {
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
                Et(e, t, h, R, l, null);
            }
        Og(e, r, s, c);
        return;
      case "option":
        for (I in l)
          l.hasOwnProperty(I) && (r = l[I], r != null) && (I === "selected" ? e.selected = r && typeof r != "function" && typeof r != "symbol" : Et(e, t, I, r, l, null));
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
        for (r = 0; r < Ga.length; r++)
          ot(Ga[r], e);
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
        for (ee in l)
          if (l.hasOwnProperty(ee) && (r = l[ee], r != null))
            switch (ee) {
              case "children":
              case "dangerouslySetInnerHTML":
                throw Error(i(137, t));
              default:
                Et(e, t, ee, r, l, null);
            }
        return;
      default:
        if (Su(t)) {
          for (ce in l)
            l.hasOwnProperty(ce) && (r = l[ce], r !== void 0 && sd(
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
      l.hasOwnProperty(R) && (r = l[R], r != null && Et(e, t, R, r, l, null));
  }
  function e1(e, t, l, r) {
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
        var s = null, c = null, h = null, R = null, I = null, ee = null, ce = null;
        for (le in l) {
          var de = l[le];
          if (l.hasOwnProperty(le) && de != null)
            switch (le) {
              case "checked":
                break;
              case "value":
                break;
              case "defaultValue":
                I = de;
              default:
                r.hasOwnProperty(le) || Et(e, t, le, null, r, de);
            }
        }
        for (var te in r) {
          var le = r[te];
          if (de = l[te], r.hasOwnProperty(te) && (le != null || de != null))
            switch (te) {
              case "type":
                c = le;
                break;
              case "name":
                s = le;
                break;
              case "checked":
                ee = le;
                break;
              case "defaultChecked":
                ce = le;
                break;
              case "value":
                h = le;
                break;
              case "defaultValue":
                R = le;
                break;
              case "children":
              case "dangerouslySetInnerHTML":
                if (le != null)
                  throw Error(i(137, t));
                break;
              default:
                le !== de && Et(
                  e,
                  t,
                  te,
                  le,
                  r,
                  de
                );
            }
        }
        bu(
          e,
          h,
          R,
          I,
          ee,
          ce,
          c,
          s
        );
        return;
      case "select":
        le = h = R = te = null;
        for (c in l)
          if (I = l[c], l.hasOwnProperty(c) && I != null)
            switch (c) {
              case "value":
                break;
              case "multiple":
                le = I;
              default:
                r.hasOwnProperty(c) || Et(
                  e,
                  t,
                  c,
                  null,
                  r,
                  I
                );
            }
        for (s in r)
          if (c = r[s], I = l[s], r.hasOwnProperty(s) && (c != null || I != null))
            switch (s) {
              case "value":
                te = c;
                break;
              case "defaultValue":
                R = c;
                break;
              case "multiple":
                h = c;
              default:
                c !== I && Et(
                  e,
                  t,
                  s,
                  c,
                  r,
                  I
                );
            }
        t = R, l = h, r = le, te != null ? hr(e, !!l, te, !1) : !!r != !!l && (t != null ? hr(e, !!l, t, !0) : hr(e, !!l, l ? [] : "", !1));
        return;
      case "textarea":
        le = te = null;
        for (R in l)
          if (s = l[R], l.hasOwnProperty(R) && s != null && !r.hasOwnProperty(R))
            switch (R) {
              case "value":
                break;
              case "children":
                break;
              default:
                Et(e, t, R, null, r, s);
            }
        for (h in r)
          if (s = r[h], c = l[h], r.hasOwnProperty(h) && (s != null || c != null))
            switch (h) {
              case "value":
                te = s;
                break;
              case "defaultValue":
                le = s;
                break;
              case "children":
                break;
              case "dangerouslySetInnerHTML":
                if (s != null) throw Error(i(91));
                break;
              default:
                s !== c && Et(e, t, h, s, r, c);
            }
        Cg(e, te, le);
        return;
      case "option":
        for (var De in l)
          te = l[De], l.hasOwnProperty(De) && te != null && !r.hasOwnProperty(De) && (De === "selected" ? e.selected = !1 : Et(
            e,
            t,
            De,
            null,
            r,
            te
          ));
        for (I in r)
          te = r[I], le = l[I], r.hasOwnProperty(I) && te !== le && (te != null || le != null) && (I === "selected" ? e.selected = te && typeof te != "function" && typeof te != "symbol" : Et(
            e,
            t,
            I,
            te,
            r,
            le
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
        for (var Ve in l)
          te = l[Ve], l.hasOwnProperty(Ve) && te != null && !r.hasOwnProperty(Ve) && Et(e, t, Ve, null, r, te);
        for (ee in r)
          if (te = r[ee], le = l[ee], r.hasOwnProperty(ee) && te !== le && (te != null || le != null))
            switch (ee) {
              case "children":
              case "dangerouslySetInnerHTML":
                if (te != null)
                  throw Error(i(137, t));
                break;
              default:
                Et(
                  e,
                  t,
                  ee,
                  te,
                  r,
                  le
                );
            }
        return;
      default:
        if (Su(t)) {
          for (var Tt in l)
            te = l[Tt], l.hasOwnProperty(Tt) && te !== void 0 && !r.hasOwnProperty(Tt) && sd(
              e,
              t,
              Tt,
              void 0,
              r,
              te
            );
          for (ce in r)
            te = r[ce], le = l[ce], !r.hasOwnProperty(ce) || te === le || te === void 0 && le === void 0 || sd(
              e,
              t,
              ce,
              te,
              r,
              le
            );
          return;
        }
    }
    for (var F in l)
      te = l[F], l.hasOwnProperty(F) && te != null && !r.hasOwnProperty(F) && Et(e, t, F, null, r, te);
    for (de in r)
      te = r[de], le = l[de], !r.hasOwnProperty(de) || te === le || te == null && le == null || Et(e, t, de, te, r, le);
  }
  function zy(e) {
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
  function t1() {
    if (typeof performance.getEntriesByType == "function") {
      for (var e = 0, t = 0, l = performance.getEntriesByType("resource"), r = 0; r < l.length; r++) {
        var s = l[r], c = s.transferSize, h = s.initiatorType, R = s.duration;
        if (c && R && zy(h)) {
          for (h = 0, R = s.responseEnd, r += 1; r < l.length; r++) {
            var I = l[r], ee = I.startTime;
            if (ee > R) break;
            var ce = I.transferSize, de = I.initiatorType;
            ce && zy(de) && (I = I.responseEnd, h += ce * (I < R ? 1 : (R - ee) / (I - ee)));
          }
          if (--r, t += 8 * (c + h) / (s.duration / 1e3), e++, 10 < e) break;
        }
      }
      if (0 < e) return t / e / 1e6;
    }
    return navigator.connection && (e = navigator.connection.downlink, typeof e == "number") ? e : 5;
  }
  var cd = null, ud = null;
  function Ds(e) {
    return e.nodeType === 9 ? e : e.ownerDocument;
  }
  function Dy(e) {
    switch (e) {
      case "http://www.w3.org/2000/svg":
        return 1;
      case "http://www.w3.org/1998/Math/MathML":
        return 2;
      default:
        return 0;
    }
  }
  function Ny(e, t) {
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
  function fd(e, t) {
    return e === "textarea" || e === "noscript" || typeof t.children == "string" || typeof t.children == "number" || typeof t.children == "bigint" || typeof t.dangerouslySetInnerHTML == "object" && t.dangerouslySetInnerHTML !== null && t.dangerouslySetInnerHTML.__html != null;
  }
  var dd = null;
  function n1() {
    var e = window.event;
    return e && e.type === "popstate" ? e === dd ? !1 : (dd = e, !0) : (dd = null, !1);
  }
  var jy = typeof setTimeout == "function" ? setTimeout : void 0, l1 = typeof clearTimeout == "function" ? clearTimeout : void 0, ky = typeof Promise == "function" ? Promise : void 0, o1 = typeof queueMicrotask == "function" ? queueMicrotask : typeof ky < "u" ? function(e) {
    return ky.resolve(null).then(e).catch(r1);
  } : jy;
  function r1(e) {
    setTimeout(function() {
      throw e;
    });
  }
  function ho(e) {
    return e === "head";
  }
  function _y(e, t) {
    var l = t, r = 0;
    do {
      var s = l.nextSibling;
      if (e.removeChild(l), s && s.nodeType === 8)
        if (l = s.data, l === "/$" || l === "/&") {
          if (r === 0) {
            e.removeChild(s), Kr(t);
            return;
          }
          r--;
        } else if (l === "$" || l === "$?" || l === "$~" || l === "$!" || l === "&")
          r++;
        else if (l === "html")
          Xa(e.ownerDocument.documentElement);
        else if (l === "head") {
          l = e.ownerDocument.head, Xa(l);
          for (var c = l.firstChild; c; ) {
            var h = c.nextSibling, R = c.nodeName;
            c[ua] || R === "SCRIPT" || R === "STYLE" || R === "LINK" && c.rel.toLowerCase() === "stylesheet" || l.removeChild(c), c = h;
          }
        } else
          l === "body" && Xa(e.ownerDocument.body);
      l = s;
    } while (l);
    Kr(t);
  }
  function Hy(e, t) {
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
  function pd(e) {
    var t = e.firstChild;
    for (t && t.nodeType === 10 && (t = t.nextSibling); t; ) {
      var l = t;
      switch (t = t.nextSibling, l.nodeName) {
        case "HTML":
        case "HEAD":
        case "BODY":
          pd(l), yu(l);
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
  function a1(e, t, l, r) {
    for (; e.nodeType === 1; ) {
      var s = l;
      if (e.nodeName.toLowerCase() !== t.toLowerCase()) {
        if (!r && (e.nodeName !== "INPUT" || e.type !== "hidden"))
          break;
      } else if (r) {
        if (!e[ua])
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
      if (e = Jn(e.nextSibling), e === null) break;
    }
    return null;
  }
  function i1(e, t, l) {
    if (t === "") return null;
    for (; e.nodeType !== 3; )
      if ((e.nodeType !== 1 || e.nodeName !== "INPUT" || e.type !== "hidden") && !l || (e = Jn(e.nextSibling), e === null)) return null;
    return e;
  }
  function Uy(e, t) {
    for (; e.nodeType !== 8; )
      if ((e.nodeType !== 1 || e.nodeName !== "INPUT" || e.type !== "hidden") && !t || (e = Jn(e.nextSibling), e === null)) return null;
    return e;
  }
  function gd(e) {
    return e.data === "$?" || e.data === "$~";
  }
  function md(e) {
    return e.data === "$!" || e.data === "$?" && e.ownerDocument.readyState !== "loading";
  }
  function s1(e, t) {
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
  function Jn(e) {
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
  var hd = null;
  function Ly(e) {
    e = e.nextSibling;
    for (var t = 0; e; ) {
      if (e.nodeType === 8) {
        var l = e.data;
        if (l === "/$" || l === "/&") {
          if (t === 0)
            return Jn(e.nextSibling);
          t--;
        } else
          l !== "$" && l !== "$!" && l !== "$?" && l !== "$~" && l !== "&" || t++;
      }
      e = e.nextSibling;
    }
    return null;
  }
  function Iy(e) {
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
  function By(e, t, l) {
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
  function Xa(e) {
    for (var t = e.attributes; t.length; )
      e.removeAttributeNode(t[0]);
    yu(e);
  }
  var $n = /* @__PURE__ */ new Map(), Vy = /* @__PURE__ */ new Set();
  function Ns(e) {
    return typeof e.getRootNode == "function" ? e.getRootNode() : e.nodeType === 9 ? e : e.ownerDocument;
  }
  var _l = Y.d;
  Y.d = {
    f: c1,
    r: u1,
    D: f1,
    C: d1,
    L: p1,
    m: g1,
    X: h1,
    S: m1,
    M: y1
  };
  function c1() {
    var e = _l.f(), t = Es();
    return e || t;
  }
  function u1(e) {
    var t = pr(e);
    t !== null && t.tag === 5 && t.type === "form" ? oh(t) : _l.r(e);
  }
  var qr = typeof document > "u" ? null : document;
  function Py(e, t, l) {
    var r = qr;
    if (r && typeof t == "string" && t) {
      var s = Gn(t);
      s = 'link[rel="' + e + '"][href="' + s + '"]', typeof l == "string" && (s += '[crossorigin="' + l + '"]'), Vy.has(s) || (Vy.add(s), e = { rel: e, crossOrigin: l, href: t }, r.querySelector(s) === null && (t = r.createElement("link"), pn(t, "link", e), on(t), r.head.appendChild(t)));
    }
  }
  function f1(e) {
    _l.D(e), Py("dns-prefetch", e, null);
  }
  function d1(e, t) {
    _l.C(e, t), Py("preconnect", e, t);
  }
  function p1(e, t, l) {
    _l.L(e, t, l);
    var r = qr;
    if (r && e && t) {
      var s = 'link[rel="preload"][as="' + Gn(t) + '"]';
      t === "image" && l && l.imageSrcSet ? (s += '[imagesrcset="' + Gn(
        l.imageSrcSet
      ) + '"]', typeof l.imageSizes == "string" && (s += '[imagesizes="' + Gn(
        l.imageSizes
      ) + '"]')) : s += '[href="' + Gn(e) + '"]';
      var c = s;
      switch (t) {
        case "style":
          c = Xr(e);
          break;
        case "script":
          c = Fr(e);
      }
      $n.has(c) || (e = b(
        {
          rel: "preload",
          href: t === "image" && l && l.imageSrcSet ? void 0 : e,
          as: t
        },
        l
      ), $n.set(c, e), r.querySelector(s) !== null || t === "style" && r.querySelector(Fa(c)) || t === "script" && r.querySelector(Ka(c)) || (t = r.createElement("link"), pn(t, "link", e), on(t), r.head.appendChild(t)));
    }
  }
  function g1(e, t) {
    _l.m(e, t);
    var l = qr;
    if (l && e) {
      var r = t && typeof t.as == "string" ? t.as : "script", s = 'link[rel="modulepreload"][as="' + Gn(r) + '"][href="' + Gn(e) + '"]', c = s;
      switch (r) {
        case "audioworklet":
        case "paintworklet":
        case "serviceworker":
        case "sharedworker":
        case "worker":
        case "script":
          c = Fr(e);
      }
      if (!$n.has(c) && (e = b({ rel: "modulepreload", href: e }, t), $n.set(c, e), l.querySelector(s) === null)) {
        switch (r) {
          case "audioworklet":
          case "paintworklet":
          case "serviceworker":
          case "sharedworker":
          case "worker":
          case "script":
            if (l.querySelector(Ka(c)))
              return;
        }
        r = l.createElement("link"), pn(r, "link", e), on(r), l.head.appendChild(r);
      }
    }
  }
  function m1(e, t, l) {
    _l.S(e, t, l);
    var r = qr;
    if (r && e) {
      var s = gr(r).hoistableStyles, c = Xr(e);
      t = t || "default";
      var h = s.get(c);
      if (!h) {
        var R = { loading: 0, preload: null };
        if (h = r.querySelector(
          Fa(c)
        ))
          R.loading = 5;
        else {
          e = b(
            { rel: "stylesheet", href: e, "data-precedence": t },
            l
          ), (l = $n.get(c)) && yd(e, l);
          var I = h = r.createElement("link");
          on(I), pn(I, "link", e), I._p = new Promise(function(ee, ce) {
            I.onload = ee, I.onerror = ce;
          }), I.addEventListener("load", function() {
            R.loading |= 1;
          }), I.addEventListener("error", function() {
            R.loading |= 2;
          }), R.loading |= 4, js(h, t, r);
        }
        h = {
          type: "stylesheet",
          instance: h,
          count: 1,
          state: R
        }, s.set(c, h);
      }
    }
  }
  function h1(e, t) {
    _l.X(e, t);
    var l = qr;
    if (l && e) {
      var r = gr(l).hoistableScripts, s = Fr(e), c = r.get(s);
      c || (c = l.querySelector(Ka(s)), c || (e = b({ src: e, async: !0 }, t), (t = $n.get(s)) && vd(e, t), c = l.createElement("script"), on(c), pn(c, "link", e), l.head.appendChild(c)), c = {
        type: "script",
        instance: c,
        count: 1,
        state: null
      }, r.set(s, c));
    }
  }
  function y1(e, t) {
    _l.M(e, t);
    var l = qr;
    if (l && e) {
      var r = gr(l).hoistableScripts, s = Fr(e), c = r.get(s);
      c || (c = l.querySelector(Ka(s)), c || (e = b({ src: e, async: !0, type: "module" }, t), (t = $n.get(s)) && vd(e, t), c = l.createElement("script"), on(c), pn(c, "link", e), l.head.appendChild(c)), c = {
        type: "script",
        instance: c,
        count: 1,
        state: null
      }, r.set(s, c));
    }
  }
  function Yy(e, t, l, r) {
    var s = (s = ie.current) ? Ns(s) : null;
    if (!s) throw Error(i(446));
    switch (e) {
      case "meta":
      case "title":
        return null;
      case "style":
        return typeof l.precedence == "string" && typeof l.href == "string" ? (t = Xr(l.href), l = gr(
          s
        ).hoistableStyles, r = l.get(t), r || (r = {
          type: "style",
          instance: null,
          count: 0,
          state: null
        }, l.set(t, r)), r) : { type: "void", instance: null, count: 0, state: null };
      case "link":
        if (l.rel === "stylesheet" && typeof l.href == "string" && typeof l.precedence == "string") {
          e = Xr(l.href);
          var c = gr(
            s
          ).hoistableStyles, h = c.get(e);
          if (h || (s = s.ownerDocument || s, h = {
            type: "stylesheet",
            instance: null,
            count: 0,
            state: { loading: 0, preload: null }
          }, c.set(e, h), (c = s.querySelector(
            Fa(e)
          )) && !c._p && (h.instance = c, h.state.loading = 5), $n.has(e) || (l = {
            rel: "preload",
            as: "style",
            href: l.href,
            crossOrigin: l.crossOrigin,
            integrity: l.integrity,
            media: l.media,
            hrefLang: l.hrefLang,
            referrerPolicy: l.referrerPolicy
          }, $n.set(e, l), c || v1(
            s,
            e,
            l,
            h.state
          ))), t && r === null)
            throw Error(i(528, ""));
          return h;
        }
        if (t && r !== null)
          throw Error(i(529, ""));
        return null;
      case "script":
        return t = l.async, l = l.src, typeof l == "string" && t && typeof t != "function" && typeof t != "symbol" ? (t = Fr(l), l = gr(
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
  function Xr(e) {
    return 'href="' + Gn(e) + '"';
  }
  function Fa(e) {
    return 'link[rel="stylesheet"][' + e + "]";
  }
  function Gy(e) {
    return b({}, e, {
      "data-precedence": e.precedence,
      precedence: null
    });
  }
  function v1(e, t, l, r) {
    e.querySelector('link[rel="preload"][as="style"][' + t + "]") ? r.loading = 1 : (t = e.createElement("link"), r.preload = t, t.addEventListener("load", function() {
      return r.loading |= 1;
    }), t.addEventListener("error", function() {
      return r.loading |= 2;
    }), pn(t, "link", l), on(t), e.head.appendChild(t));
  }
  function Fr(e) {
    return '[src="' + Gn(e) + '"]';
  }
  function Ka(e) {
    return "script[async]" + e;
  }
  function qy(e, t, l) {
    if (t.count++, t.instance === null)
      switch (t.type) {
        case "style":
          var r = e.querySelector(
            'style[data-href~="' + Gn(l.href) + '"]'
          );
          if (r)
            return t.instance = r, on(r), r;
          var s = b({}, l, {
            "data-href": l.href,
            "data-precedence": l.precedence,
            href: null,
            precedence: null
          });
          return r = (e.ownerDocument || e).createElement(
            "style"
          ), on(r), pn(r, "style", s), js(r, l.precedence, e), t.instance = r;
        case "stylesheet":
          s = Xr(l.href);
          var c = e.querySelector(
            Fa(s)
          );
          if (c)
            return t.state.loading |= 4, t.instance = c, on(c), c;
          r = Gy(l), (s = $n.get(s)) && yd(r, s), c = (e.ownerDocument || e).createElement("link"), on(c);
          var h = c;
          return h._p = new Promise(function(R, I) {
            h.onload = R, h.onerror = I;
          }), pn(c, "link", r), t.state.loading |= 4, js(c, l.precedence, e), t.instance = c;
        case "script":
          return c = Fr(l.src), (s = e.querySelector(
            Ka(c)
          )) ? (t.instance = s, on(s), s) : (r = l, (s = $n.get(c)) && (r = b({}, l), vd(r, s)), e = e.ownerDocument || e, s = e.createElement("script"), on(s), pn(s, "link", r), e.head.appendChild(s), t.instance = s);
        case "void":
          return null;
        default:
          throw Error(i(443, t.type));
      }
    else
      t.type === "stylesheet" && (t.state.loading & 4) === 0 && (r = t.instance, t.state.loading |= 4, js(r, l.precedence, e));
    return t.instance;
  }
  function js(e, t, l) {
    for (var r = l.querySelectorAll(
      'link[rel="stylesheet"][data-precedence],style[data-precedence]'
    ), s = r.length ? r[r.length - 1] : null, c = s, h = 0; h < r.length; h++) {
      var R = r[h];
      if (R.dataset.precedence === t) c = R;
      else if (c !== s) break;
    }
    c ? c.parentNode.insertBefore(e, c.nextSibling) : (t = l.nodeType === 9 ? l.head : l, t.insertBefore(e, t.firstChild));
  }
  function yd(e, t) {
    e.crossOrigin == null && (e.crossOrigin = t.crossOrigin), e.referrerPolicy == null && (e.referrerPolicy = t.referrerPolicy), e.title == null && (e.title = t.title);
  }
  function vd(e, t) {
    e.crossOrigin == null && (e.crossOrigin = t.crossOrigin), e.referrerPolicy == null && (e.referrerPolicy = t.referrerPolicy), e.integrity == null && (e.integrity = t.integrity);
  }
  var ks = null;
  function Xy(e, t, l) {
    if (ks === null) {
      var r = /* @__PURE__ */ new Map(), s = ks = /* @__PURE__ */ new Map();
      s.set(l, r);
    } else
      s = ks, r = s.get(l), r || (r = /* @__PURE__ */ new Map(), s.set(l, r));
    if (r.has(e)) return r;
    for (r.set(e, null), l = l.getElementsByTagName(e), s = 0; s < l.length; s++) {
      var c = l[s];
      if (!(c[ua] || c[Ot] || e === "link" && c.getAttribute("rel") === "stylesheet") && c.namespaceURI !== "http://www.w3.org/2000/svg") {
        var h = c.getAttribute(t) || "";
        h = e + h;
        var R = r.get(h);
        R ? R.push(c) : r.set(h, [c]);
      }
    }
    return r;
  }
  function Fy(e, t, l) {
    e = e.ownerDocument || e, e.head.insertBefore(
      l,
      t === "title" ? e.querySelector("head > title") : null
    );
  }
  function b1(e, t, l) {
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
  function Ky(e) {
    return !(e.type === "stylesheet" && (e.state.loading & 3) === 0);
  }
  function x1(e, t, l, r) {
    if (l.type === "stylesheet" && (typeof r.media != "string" || matchMedia(r.media).matches !== !1) && (l.state.loading & 4) === 0) {
      if (l.instance === null) {
        var s = Xr(r.href), c = t.querySelector(
          Fa(s)
        );
        if (c) {
          t = c._p, t !== null && typeof t == "object" && typeof t.then == "function" && (e.count++, e = _s.bind(e), t.then(e, e)), l.state.loading |= 4, l.instance = c, on(c);
          return;
        }
        c = t.ownerDocument || t, r = Gy(r), (s = $n.get(s)) && yd(r, s), c = c.createElement("link"), on(c);
        var h = c;
        h._p = new Promise(function(R, I) {
          h.onload = R, h.onerror = I;
        }), pn(c, "link", r), l.instance = c;
      }
      e.stylesheets === null && (e.stylesheets = /* @__PURE__ */ new Map()), e.stylesheets.set(l, t), (t = l.state.preload) && (l.state.loading & 3) === 0 && (e.count++, l = _s.bind(e), t.addEventListener("load", l), t.addEventListener("error", l));
    }
  }
  var bd = 0;
  function S1(e, t) {
    return e.stylesheets && e.count === 0 && Us(e, e.stylesheets), 0 < e.count || 0 < e.imgCount ? function(l) {
      var r = setTimeout(function() {
        if (e.stylesheets && Us(e, e.stylesheets), e.unsuspend) {
          var c = e.unsuspend;
          e.unsuspend = null, c();
        }
      }, 6e4 + t);
      0 < e.imgBytes && bd === 0 && (bd = 62500 * t1());
      var s = setTimeout(
        function() {
          if (e.waitingForImages = !1, e.count === 0 && (e.stylesheets && Us(e, e.stylesheets), e.unsuspend)) {
            var c = e.unsuspend;
            e.unsuspend = null, c();
          }
        },
        (e.imgBytes > bd ? 50 : 800) + t
      );
      return e.unsuspend = l, function() {
        e.unsuspend = null, clearTimeout(r), clearTimeout(s);
      };
    } : null;
  }
  function _s() {
    if (this.count--, this.count === 0 && (this.imgCount === 0 || !this.waitingForImages)) {
      if (this.stylesheets) Us(this, this.stylesheets);
      else if (this.unsuspend) {
        var e = this.unsuspend;
        this.unsuspend = null, e();
      }
    }
  }
  var Hs = null;
  function Us(e, t) {
    e.stylesheets = null, e.unsuspend !== null && (e.count++, Hs = /* @__PURE__ */ new Map(), t.forEach(w1, e), Hs = null, _s.call(e));
  }
  function w1(e, t) {
    if (!(t.state.loading & 4)) {
      var l = Hs.get(e);
      if (l) var r = l.get(null);
      else {
        l = /* @__PURE__ */ new Map(), Hs.set(e, l);
        for (var s = e.querySelectorAll(
          "link[data-precedence],style[data-precedence]"
        ), c = 0; c < s.length; c++) {
          var h = s[c];
          (h.nodeName === "LINK" || h.getAttribute("media") !== "not all") && (l.set(h.dataset.precedence, h), r = h);
        }
        r && l.set(null, r);
      }
      s = t.instance, h = s.getAttribute("data-precedence"), c = l.get(h) || r, c === r && l.set(null, s), l.set(h, s), this.count++, r = _s.bind(this), s.addEventListener("load", r), s.addEventListener("error", r), c ? c.parentNode.insertBefore(s, c.nextSibling) : (e = e.nodeType === 9 ? e.head : e, e.insertBefore(s, e.firstChild)), t.state.loading |= 4;
    }
  }
  var Qa = {
    $$typeof: D,
    Provider: null,
    Consumer: null,
    _currentValue: V,
    _currentValue2: V,
    _threadCount: 0
  };
  function E1(e, t, l, r, s, c, h, R, I) {
    this.tag = 1, this.containerInfo = e, this.pingCache = this.current = this.pendingChildren = null, this.timeoutHandle = -1, this.callbackNode = this.next = this.pendingContext = this.context = this.cancelPendingCommit = null, this.callbackPriority = 0, this.expirationTimes = Vn(-1), this.entangledLanes = this.shellSuspendCounter = this.errorRecoveryDisabledLanes = this.expiredLanes = this.warmLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0, this.entanglements = Vn(0), this.hiddenUpdates = Vn(null), this.identifierPrefix = r, this.onUncaughtError = s, this.onCaughtError = c, this.onRecoverableError = h, this.pooledCache = null, this.pooledCacheLanes = 0, this.formState = I, this.incompleteTransitions = /* @__PURE__ */ new Map();
  }
  function Qy(e, t, l, r, s, c, h, R, I, ee, ce, de) {
    return e = new E1(
      e,
      t,
      l,
      h,
      I,
      ee,
      ce,
      de,
      R
    ), t = 1, c === !0 && (t |= 24), c = Nn(3, null, null, t), e.current = c, c.stateNode = e, t = Ju(), t.refCount++, e.pooledCache = t, t.refCount++, c.memoizedState = {
      element: r,
      isDehydrated: l,
      cache: t
    }, tf(c), e;
  }
  function Zy(e) {
    return e ? (e = Tr, e) : Tr;
  }
  function Jy(e, t, l, r, s, c) {
    s = Zy(s), r.context === null ? r.context = s : r.pendingContext = s, r = oo(t), r.payload = { element: l }, c = c === void 0 ? null : c, c !== null && (r.callback = c), l = ro(e, r, t), l !== null && (On(l, e, t), Oa(l, e, t));
  }
  function $y(e, t) {
    if (e = e.memoizedState, e !== null && e.dehydrated !== null) {
      var l = e.retryLane;
      e.retryLane = l !== 0 && l < t ? l : t;
    }
  }
  function xd(e, t) {
    $y(e, t), (e = e.alternate) && $y(e, t);
  }
  function Wy(e) {
    if (e.tag === 13 || e.tag === 31) {
      var t = Bo(e, 67108864);
      t !== null && On(t, e, 67108864), xd(e, 67108864);
    }
  }
  function ev(e) {
    if (e.tag === 13 || e.tag === 31) {
      var t = Un();
      t = qe(t);
      var l = Bo(e, t);
      l !== null && On(l, e, t), xd(e, t);
    }
  }
  var Ls = !0;
  function T1(e, t, l, r) {
    var s = _.T;
    _.T = null;
    var c = Y.p;
    try {
      Y.p = 2, Sd(e, t, l, r);
    } finally {
      Y.p = c, _.T = s;
    }
  }
  function R1(e, t, l, r) {
    var s = _.T;
    _.T = null;
    var c = Y.p;
    try {
      Y.p = 8, Sd(e, t, l, r);
    } finally {
      Y.p = c, _.T = s;
    }
  }
  function Sd(e, t, l, r) {
    if (Ls) {
      var s = wd(r);
      if (s === null)
        id(
          e,
          t,
          r,
          Is,
          l
        ), nv(e, r);
      else if (O1(
        s,
        e,
        t,
        l,
        r
      ))
        r.stopPropagation();
      else if (nv(e, r), t & 4 && -1 < C1.indexOf(e)) {
        for (; s !== null; ) {
          var c = pr(s);
          if (c !== null)
            switch (c.tag) {
              case 3:
                if (c = c.stateNode, c.current.memoizedState.isDehydrated) {
                  var h = Ut(c.pendingLanes);
                  if (h !== 0) {
                    var R = c;
                    for (R.pendingLanes |= 2, R.entangledLanes |= 2; h; ) {
                      var I = 1 << 31 - yt(h);
                      R.entanglements[1] |= I, h &= ~I;
                    }
                    cl(c), (dt & 6) === 0 && (Ss = ae() + 500, Ya(0));
                  }
                }
                break;
              case 31:
              case 13:
                R = Bo(c, 2), R !== null && On(R, c, 2), Es(), xd(c, 2);
            }
          if (c = wd(r), c === null && id(
            e,
            t,
            r,
            Is,
            l
          ), c === s) break;
          s = c;
        }
        s !== null && r.stopPropagation();
      } else
        id(
          e,
          t,
          r,
          null,
          l
        );
    }
  }
  function wd(e) {
    return e = Eu(e), Ed(e);
  }
  var Is = null;
  function Ed(e) {
    if (Is = null, e = dr(e), e !== null) {
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
    return Is = e, null;
  }
  function tv(e) {
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
          case Ue:
            return 2;
          case ve:
            return 8;
          case be:
          case We:
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
  var Td = !1, yo = null, vo = null, bo = null, Za = /* @__PURE__ */ new Map(), Ja = /* @__PURE__ */ new Map(), xo = [], C1 = "mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset".split(
    " "
  );
  function nv(e, t) {
    switch (e) {
      case "focusin":
      case "focusout":
        yo = null;
        break;
      case "dragenter":
      case "dragleave":
        vo = null;
        break;
      case "mouseover":
      case "mouseout":
        bo = null;
        break;
      case "pointerover":
      case "pointerout":
        Za.delete(t.pointerId);
        break;
      case "gotpointercapture":
      case "lostpointercapture":
        Ja.delete(t.pointerId);
    }
  }
  function $a(e, t, l, r, s, c) {
    return e === null || e.nativeEvent !== c ? (e = {
      blockedOn: t,
      domEventName: l,
      eventSystemFlags: r,
      nativeEvent: c,
      targetContainers: [s]
    }, t !== null && (t = pr(t), t !== null && Wy(t)), e) : (e.eventSystemFlags |= r, t = e.targetContainers, s !== null && t.indexOf(s) === -1 && t.push(s), e);
  }
  function O1(e, t, l, r, s) {
    switch (t) {
      case "focusin":
        return yo = $a(
          yo,
          e,
          t,
          l,
          r,
          s
        ), !0;
      case "dragenter":
        return vo = $a(
          vo,
          e,
          t,
          l,
          r,
          s
        ), !0;
      case "mouseover":
        return bo = $a(
          bo,
          e,
          t,
          l,
          r,
          s
        ), !0;
      case "pointerover":
        var c = s.pointerId;
        return Za.set(
          c,
          $a(
            Za.get(c) || null,
            e,
            t,
            l,
            r,
            s
          )
        ), !0;
      case "gotpointercapture":
        return c = s.pointerId, Ja.set(
          c,
          $a(
            Ja.get(c) || null,
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
  function lv(e) {
    var t = dr(e.target);
    if (t !== null) {
      var l = f(t);
      if (l !== null) {
        if (t = l.tag, t === 13) {
          if (t = p(l), t !== null) {
            e.blockedOn = t, ln(e.priority, function() {
              ev(l);
            });
            return;
          }
        } else if (t === 31) {
          if (t = g(l), t !== null) {
            e.blockedOn = t, ln(e.priority, function() {
              ev(l);
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
  function Bs(e) {
    if (e.blockedOn !== null) return !1;
    for (var t = e.targetContainers; 0 < t.length; ) {
      var l = wd(e.nativeEvent);
      if (l === null) {
        l = e.nativeEvent;
        var r = new l.constructor(
          l.type,
          l
        );
        wu = r, l.target.dispatchEvent(r), wu = null;
      } else
        return t = pr(l), t !== null && Wy(t), e.blockedOn = l, !1;
      t.shift();
    }
    return !0;
  }
  function ov(e, t, l) {
    Bs(e) && l.delete(t);
  }
  function M1() {
    Td = !1, yo !== null && Bs(yo) && (yo = null), vo !== null && Bs(vo) && (vo = null), bo !== null && Bs(bo) && (bo = null), Za.forEach(ov), Ja.forEach(ov);
  }
  function Vs(e, t) {
    e.blockedOn === t && (e.blockedOn = null, Td || (Td = !0, n.unstable_scheduleCallback(
      n.unstable_NormalPriority,
      M1
    )));
  }
  var Ps = null;
  function rv(e) {
    Ps !== e && (Ps = e, n.unstable_scheduleCallback(
      n.unstable_NormalPriority,
      function() {
        Ps === e && (Ps = null);
        for (var t = 0; t < e.length; t += 3) {
          var l = e[t], r = e[t + 1], s = e[t + 2];
          if (typeof r != "function") {
            if (Ed(r || l) === null)
              continue;
            break;
          }
          var c = pr(l);
          c !== null && (e.splice(t, 3), t -= 3, wf(
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
  function Kr(e) {
    function t(I) {
      return Vs(I, e);
    }
    yo !== null && Vs(yo, e), vo !== null && Vs(vo, e), bo !== null && Vs(bo, e), Za.forEach(t), Ja.forEach(t);
    for (var l = 0; l < xo.length; l++) {
      var r = xo[l];
      r.blockedOn === e && (r.blockedOn = null);
    }
    for (; 0 < xo.length && (l = xo[0], l.blockedOn === null); )
      lv(l), l.blockedOn === null && xo.shift();
    if (l = (e.ownerDocument || e).$$reactFormReplay, l != null)
      for (r = 0; r < l.length; r += 3) {
        var s = l[r], c = l[r + 1], h = s[cn] || null;
        if (typeof c == "function")
          h || rv(l);
        else if (h) {
          var R = null;
          if (c && c.hasAttribute("formAction")) {
            if (s = c, h = c[cn] || null)
              R = h.formAction;
            else if (Ed(s) !== null) continue;
          } else R = h.action;
          typeof R == "function" ? l[r + 1] = R : (l.splice(r, 3), r -= 3), rv(l);
        }
      }
  }
  function av() {
    function e(c) {
      c.canIntercept && c.info === "react-transition" && c.intercept({
        handler: function() {
          return new Promise(function(h) {
            return s = h;
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
  function Rd(e) {
    this._internalRoot = e;
  }
  Ys.prototype.render = Rd.prototype.render = function(e) {
    var t = this._internalRoot;
    if (t === null) throw Error(i(409));
    var l = t.current, r = Un();
    Jy(l, r, e, t, null, null);
  }, Ys.prototype.unmount = Rd.prototype.unmount = function() {
    var e = this._internalRoot;
    if (e !== null) {
      this._internalRoot = null;
      var t = e.containerInfo;
      Jy(e.current, 2, null, e, null, null), Es(), t[rl] = null;
    }
  };
  function Ys(e) {
    this._internalRoot = e;
  }
  Ys.prototype.unstable_scheduleHydration = function(e) {
    if (e) {
      var t = Xt();
      e = { blockedOn: null, target: e, priority: t };
      for (var l = 0; l < xo.length && t !== 0 && t < xo[l].priority; l++) ;
      xo.splice(l, 0, e), l === 0 && lv(e);
    }
  };
  var iv = o.version;
  if (iv !== "19.2.7")
    throw Error(
      i(
        527,
        iv,
        "19.2.7"
      )
    );
  Y.findDOMNode = function(e) {
    var t = e._reactInternals;
    if (t === void 0)
      throw typeof e.render == "function" ? Error(i(188)) : (e = Object.keys(e).join(","), Error(i(268, e)));
    return e = d(t), e = e !== null ? v(e) : null, e = e === null ? null : e.stateNode, e;
  };
  var A1 = {
    bundleType: 0,
    version: "19.2.7",
    rendererPackageName: "react-dom",
    currentDispatcherRef: _,
    reconcilerVersion: "19.2.7"
  };
  if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u") {
    var Gs = __REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!Gs.isDisabled && Gs.supportsFiber)
      try {
        et = Gs.inject(
          A1
        ), gt = Gs;
      } catch {
      }
  }
  return ei.createRoot = function(e, t) {
    if (!u(e)) throw Error(i(299));
    var l = !1, r = "", s = gh, c = mh, h = hh;
    return t != null && (t.unstable_strictMode === !0 && (l = !0), t.identifierPrefix !== void 0 && (r = t.identifierPrefix), t.onUncaughtError !== void 0 && (s = t.onUncaughtError), t.onCaughtError !== void 0 && (c = t.onCaughtError), t.onRecoverableError !== void 0 && (h = t.onRecoverableError)), t = Qy(
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
      h,
      av
    ), e[rl] = t.current, ad(e), new Rd(t);
  }, ei.hydrateRoot = function(e, t, l) {
    if (!u(e)) throw Error(i(299));
    var r = !1, s = "", c = gh, h = mh, R = hh, I = null;
    return l != null && (l.unstable_strictMode === !0 && (r = !0), l.identifierPrefix !== void 0 && (s = l.identifierPrefix), l.onUncaughtError !== void 0 && (c = l.onUncaughtError), l.onCaughtError !== void 0 && (h = l.onCaughtError), l.onRecoverableError !== void 0 && (R = l.onRecoverableError), l.formState !== void 0 && (I = l.formState)), t = Qy(
      e,
      1,
      !0,
      t,
      l ?? null,
      r,
      s,
      I,
      c,
      h,
      R,
      av
    ), t.context = Zy(null), l = t.current, r = Un(), r = qe(r), s = oo(r), s.callback = null, ro(l, s, r), l = r, t.current.lanes = l, qt(t, l), cl(t), e[rl] = t.current, ad(e), new Ys(t);
  }, ei.version = "19.2.7", ei;
}
var yv;
function V1() {
  if (yv) return Md.exports;
  yv = 1;
  function n() {
    if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function"))
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(n);
      } catch (o) {
        console.error(o);
      }
  }
  return n(), Md.exports = B1(), Md.exports;
}
var P1 = V1();
const zb = (...n) => n.filter((o, a, i) => !!o && o.trim() !== "" && i.indexOf(o) === a).join(" ").trim();
const Y1 = (n) => n.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
const G1 = (n) => n.replace(
  /^([A-Z])|[\s-_]+(\w)/g,
  (o, a, i) => i ? i.toUpperCase() : a.toLowerCase()
);
const vv = (n) => {
  const o = G1(n);
  return o.charAt(0).toUpperCase() + o.slice(1);
};
var Nd = {
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
const q1 = (n) => {
  for (const o in n)
    if (o.startsWith("aria-") || o === "role" || o === "title")
      return !0;
  return !1;
}, X1 = y.createContext({}), F1 = () => y.useContext(X1), K1 = y.forwardRef(
  ({ color: n, size: o, strokeWidth: a, absoluteStrokeWidth: i, className: u = "", children: f, iconNode: p, ...g }, m) => {
    const {
      size: d = 24,
      strokeWidth: v = 2,
      absoluteStrokeWidth: b = !1,
      color: S = "currentColor",
      className: C = ""
    } = F1() ?? {}, w = i ?? b ? Number(a ?? v) * 24 / Number(o ?? d) : a ?? v;
    return y.createElement(
      "svg",
      {
        ref: m,
        ...Nd,
        width: o ?? d ?? Nd.width,
        height: o ?? d ?? Nd.height,
        stroke: n ?? S,
        strokeWidth: w,
        className: zb("lucide", C, u),
        ...!f && !q1(g) && { "aria-hidden": "true" },
        ...g
      },
      [
        ...p.map(([A, T]) => y.createElement(A, T)),
        ...Array.isArray(f) ? f : [f]
      ]
    );
  }
);
const Qt = (n, o) => {
  const a = y.forwardRef(
    ({ className: i, ...u }, f) => y.createElement(K1, {
      ref: f,
      iconNode: o,
      className: zb(
        `lucide-${Y1(vv(n))}`,
        `lucide-${n}`,
        i
      ),
      ...u
    })
  );
  return a.displayName = vv(n), a;
};
const Q1 = [
  ["path", { d: "m21 16-4 4-4-4", key: "f6ql7i" }],
  ["path", { d: "M17 20V4", key: "1ejh1v" }],
  ["path", { d: "m3 8 4-4 4 4", key: "11wl7u" }],
  ["path", { d: "M7 4v16", key: "1glfcx" }]
], Z1 = Qt("arrow-up-down", Q1);
const J1 = [["path", { d: "M20 6 9 17l-5-5", key: "1gmf2c" }]], gc = Qt("check", J1);
const $1 = [["path", { d: "m6 9 6 6 6-6", key: "qrunsl" }]], mc = Qt("chevron-down", $1);
const W1 = [["path", { d: "m9 18 6-6-6-6", key: "mthhwq" }]], ep = Qt("chevron-right", W1);
const eE = [
  ["circle", { cx: "12", cy: "12", r: "1", key: "41hilf" }],
  ["circle", { cx: "19", cy: "12", r: "1", key: "1wjl8i" }],
  ["circle", { cx: "5", cy: "12", r: "1", key: "1pcz8c" }]
], bv = Qt("ellipsis", eE);
const tE = [
  [
    "path",
    {
      d: "M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528",
      key: "1jaruq"
    }
  ]
], nE = Qt("flag", tE);
const lE = [
  [
    "path",
    {
      d: "m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2",
      key: "usdka0"
    }
  ]
], oE = Qt("folder-open", lE);
const rE = [
  [
    "path",
    {
      d: "M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z",
      key: "sc7q7i"
    }
  ]
], aE = Qt("funnel", rE);
const iE = [
  ["rect", { width: "7", height: "7", x: "3", y: "3", rx: "1", key: "1g98yp" }],
  ["rect", { width: "7", height: "7", x: "14", y: "3", rx: "1", key: "6d4xhi" }],
  ["rect", { width: "7", height: "7", x: "14", y: "14", rx: "1", key: "nxv5o0" }],
  ["rect", { width: "7", height: "7", x: "3", y: "14", rx: "1", key: "1bb6yr" }]
], xv = Qt("layout-grid", iE);
const sE = [
  ["path", { d: "m16 6 4 14", key: "ji33uf" }],
  ["path", { d: "M12 6v14", key: "1n7gus" }],
  ["path", { d: "M8 8v12", key: "1gg7y9" }],
  ["path", { d: "M4 4v16", key: "6qkkli" }]
], cE = Qt("library", sE);
const uE = [["path", { d: "M21 12a9 9 0 1 1-6.219-8.56", key: "13zald" }]], fE = Qt("loader-circle", uE);
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
], pE = Qt("notebook-pen", dE);
const gE = [
  ["path", { d: "M5 12h14", key: "1ays0h" }],
  ["path", { d: "M12 5v14", key: "s699le" }]
], mE = Qt("plus", gE);
const hE = [
  ["path", { d: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8", key: "v9h5vc" }],
  ["path", { d: "M21 3v5h-5", key: "1q7to0" }],
  ["path", { d: "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16", key: "3uifl3" }],
  ["path", { d: "M8 16H3v5", key: "1cv678" }]
], yE = Qt("refresh-cw", hE);
const vE = [
  ["path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", key: "1357e3" }],
  ["path", { d: "M3 3v5h5", key: "1xhq8a" }]
], bE = Qt("rotate-ccw", vE);
const xE = [
  ["path", { d: "m21 21-4.34-4.34", key: "14j7rj" }],
  ["circle", { cx: "11", cy: "11", r: "8", key: "4ej97u" }]
], tp = Qt("search", xE);
const SE = [
  [
    "path",
    {
      d: "M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915",
      key: "1i5ecw"
    }
  ],
  ["circle", { cx: "12", cy: "12", r: "3", key: "1v7zrd" }]
], Db = Qt("settings", SE);
const wE = [
  ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", key: "afitv7" }],
  ["path", { d: "m9 12 2 2 4-4", key: "dzmm74" }]
], EE = Qt("square-check", wE);
const TE = [
  [
    "path",
    {
      d: "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z",
      key: "r04s7s"
    }
  ]
], np = Qt("star", TE);
const RE = [
  ["path", { d: "M10 11v6", key: "nco0om" }],
  ["path", { d: "M14 11v6", key: "outv1u" }],
  ["path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6", key: "miytrc" }],
  ["path", { d: "M3 6h18", key: "d0wm0j" }],
  ["path", { d: "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2", key: "e791ji" }]
], Nb = Qt("trash-2", RE);
const CE = [
  ["path", { d: "M18 6 6 18", key: "1bl5f8" }],
  ["path", { d: "m6 6 12 12", key: "d8bk6v" }]
], di = Qt("x", CE);
function jc() {
  return typeof window < "u";
}
function mn(n) {
  return Tp(n) ? (n.nodeName || "").toLowerCase() : "#document";
}
function Dt(n) {
  var o;
  return (n == null || (o = n.ownerDocument) == null ? void 0 : o.defaultView) || window;
}
function Kl(n) {
  var o;
  return (o = (Tp(n) ? n.ownerDocument : n.document) || window.document) == null ? void 0 : o.documentElement;
}
function Tp(n) {
  return jc() ? n instanceof Node || n instanceof Dt(n).Node : !1;
}
function $e(n) {
  return jc() ? n instanceof Element || n instanceof Dt(n).Element : !1;
}
function Ct(n) {
  return jc() ? n instanceof HTMLElement || n instanceof Dt(n).HTMLElement : !1;
}
function ta(n) {
  return !jc() || typeof ShadowRoot > "u" ? !1 : n instanceof ShadowRoot || n instanceof Dt(n).ShadowRoot;
}
function sr(n) {
  const {
    overflow: o,
    overflowX: a,
    overflowY: i,
    display: u
  } = In(n);
  return /auto|scroll|overlay|hidden|clip/.test(o + i + a) && u !== "inline" && u !== "contents";
}
function OE(n) {
  return /^(table|td|th)$/.test(mn(n));
}
function kc(n) {
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
const ME = /transform|translate|scale|rotate|perspective|filter/, AE = /paint|layout|strict|content/, Wo = (n) => !!n && n !== "none";
let jd;
function Rp(n) {
  const o = $e(n) ? In(n) : n;
  return Wo(o.transform) || Wo(o.translate) || Wo(o.scale) || Wo(o.rotate) || Wo(o.perspective) || !Cp() && (Wo(o.backdropFilter) || Wo(o.filter)) || ME.test(o.willChange || "") || AE.test(o.contain || "");
}
function zE(n) {
  let o = Gl(n);
  for (; Ct(o) && !Vl(o); ) {
    if (Rp(o))
      return o;
    if (kc(o))
      return null;
    o = Gl(o);
  }
  return null;
}
function Cp() {
  return jd == null && (jd = typeof CSS < "u" && CSS.supports && CSS.supports("-webkit-backdrop-filter", "none")), jd;
}
function Vl(n) {
  return /^(html|body|#document)$/.test(mn(n));
}
function In(n) {
  return Dt(n).getComputedStyle(n);
}
function _c(n) {
  return $e(n) ? {
    scrollLeft: n.scrollLeft,
    scrollTop: n.scrollTop
  } : {
    scrollLeft: n.scrollX,
    scrollTop: n.scrollY
  };
}
function Gl(n) {
  if (mn(n) === "html")
    return n;
  const o = (
    // Step into the shadow DOM of the parent of a slotted node.
    n.assignedSlot || // DOM Element detected.
    n.parentNode || // ShadowRoot detected.
    ta(n) && n.host || // Fallback.
    Kl(n)
  );
  return ta(o) ? o.host : o;
}
function jb(n) {
  const o = Gl(n);
  return Vl(o) ? (n.ownerDocument || n).body : Ct(o) && sr(o) ? o : jb(o);
}
function vi(n, o, a) {
  var i;
  o === void 0 && (o = []), a === void 0 && (a = !0);
  const u = jb(n), f = u === ((i = n.ownerDocument) == null ? void 0 : i.body), p = Dt(u);
  if (f) {
    const g = lp(p);
    return o.concat(p, p.visualViewport || [], sr(u) ? u : [], g && a ? vi(g) : []);
  } else
    return o.concat(u, vi(u, [], a));
}
function lp(n) {
  return n.parent && Object.getPrototypeOf(n.parent) ? n.frameElement : null;
}
const Op = {
  ...H1
}, Sv = {};
function xn(n, o) {
  const a = y.useRef(Sv);
  return a.current === Sv && (a.current = n(o)), a;
}
const kd = Op.useInsertionEffect, DE = (
  // React 17 doesn't have useInsertionEffect.
  kd && // Preact replaces useInsertionEffect with useLayoutEffect and fires too late.
  kd !== Op.useLayoutEffect ? kd : (n) => n()
);
function ze(n) {
  const o = xn(NE).current;
  return o.next = n, DE(o.effect), o.trampoline;
}
function NE() {
  const n = {
    next: void 0,
    callback: jE,
    trampoline: (...o) => n.callback?.(...o),
    effect: () => {
      n.callback = n.next;
    }
  };
  return n;
}
function jE() {
}
const kE = () => {
}, xe = typeof document < "u" ? y.useLayoutEffect : kE;
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
const Mp = {};
function bn(n, o, a, i, u) {
  if (!a && !i && !u && !n)
    return hc(o);
  let f = hc(n);
  return o && (f = ii(f, o)), a && (f = ii(f, a)), i && (f = ii(f, i)), u && (f = ii(f, u)), f;
}
function _E(n) {
  if (n.length === 0)
    return Mp;
  if (n.length === 1)
    return hc(n[0]);
  let o = hc(n[0]);
  for (let a = 1; a < n.length; a += 1)
    o = ii(o, n[a]);
  return o;
}
function hc(n) {
  return Ap(n) ? {
    ..._b(n, Mp)
  } : HE(n);
}
function ii(n, o) {
  return Ap(o) ? _b(o, n) : UE(n, o);
}
function HE(n) {
  const o = {
    ...n
  };
  for (const a in o) {
    const i = o[a];
    kb(a, i) && (o[a] = Hb(i));
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
        n[a] = Ub(n.className, i);
        break;
      }
      default:
        kb(a, i) ? n[a] = LE(n[a], i) : n[a] = i;
    }
  }
  return n;
}
function kb(n, o) {
  const a = n.charCodeAt(0), i = n.charCodeAt(1), u = n.charCodeAt(2);
  return a === 111 && i === 110 && u >= 65 && u <= 90 && (typeof o == "function" || typeof o > "u");
}
function Ap(n) {
  return typeof n == "function";
}
function _b(n, o) {
  return Ap(n) ? n(o) : n ?? Mp;
}
function LE(n, o) {
  return o ? n ? (...a) => {
    const i = a[0];
    if (Lb(i)) {
      const f = i;
      yc(f);
      const p = o(...a);
      return f.baseUIHandlerPrevented || n?.(...a), p;
    }
    const u = o(...a);
    return n?.(...a), u;
  } : Hb(o) : n;
}
function Hb(n) {
  return n && ((...o) => {
    const a = o[0];
    return Lb(a) && yc(a), n(...o);
  });
}
function yc(n) {
  return n.preventBaseUIHandler = () => {
    n.baseUIHandlerPrevented = !0;
  }, n;
}
function Ub(n, o) {
  return o ? n ? o + " " + n : o : n;
}
function Lb(n) {
  return n != null && typeof n == "object" && "nativeEvent" in n;
}
function IE(n, o) {
  return function(i, ...u) {
    const f = new URL(n);
    return f.searchParams.set("code", i.toString()), u.forEach((p) => f.searchParams.append("args[]", p)), `${o} error #${i}; visit ${f} for the full message.`;
  };
}
const At = IE("https://base-ui.com/production-error", "Base UI"), Ib = /* @__PURE__ */ y.createContext(void 0);
function zp(n = !1) {
  const o = y.useContext(Ib);
  if (o === void 0 && !n)
    throw new Error(At(16));
  return o;
}
function BE(n) {
  const {
    focusableWhenDisabled: o,
    disabled: a,
    composite: i = !1,
    tabIndex: u = 0,
    isNativeButton: f
  } = n, p = i && o !== !1, g = i && o === !1;
  return {
    props: y.useMemo(() => {
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
function Mo(n = {}) {
  const {
    disabled: o = !1,
    focusableWhenDisabled: a,
    tabIndex: i = 0,
    native: u = !0,
    composite: f
  } = n, p = y.useRef(null), g = zp(!0), m = f ?? g !== void 0, {
    props: d
  } = BE({
    focusableWhenDisabled: a,
    disabled: o,
    composite: m,
    tabIndex: i,
    isNativeButton: u
  }), v = y.useCallback(() => {
    const C = p.current;
    _d(C) && m && o && d.disabled === void 0 && C.disabled && (C.disabled = !1);
  }, [o, d.disabled, m]);
  xe(v, [v]);
  const b = y.useCallback((C = {}) => {
    const {
      onClick: w,
      onMouseDown: A,
      onKeyUp: T,
      onKeyDown: z,
      onPointerDown: M,
      ...D
    } = C;
    return bn({
      onClick(N) {
        if (o) {
          N.preventDefault();
          return;
        }
        w?.(N);
      },
      onMouseDown(N) {
        o || A?.(N);
      },
      onKeyDown(N) {
        if (o || (yc(N), z?.(N), N.baseUIHandlerPrevented))
          return;
        const L = N.target === N.currentTarget, j = N.currentTarget, H = _d(j), k = !u && VE(j), G = L && (u ? H : !k), E = N.key === "Enter", Z = N.key === " ", J = j.getAttribute("role"), X = J?.startsWith("menuitem") || J === "option" || J === "gridcell";
        if (L && m && Z) {
          if (N.defaultPrevented && X)
            return;
          N.preventDefault(), k || u && H ? (j.click(), N.preventBaseUIHandler()) : G && (w?.(N), N.preventBaseUIHandler());
          return;
        }
        G && (!u && (Z || E) && N.preventDefault(), !u && E && w?.(N));
      },
      onKeyUp(N) {
        if (!o) {
          if (yc(N), T?.(N), N.target === N.currentTarget && u && m && _d(N.currentTarget) && N.key === " ") {
            N.preventDefault();
            return;
          }
          N.baseUIHandlerPrevented || N.target === N.currentTarget && !u && !m && N.key === " " && w?.(N);
        }
      },
      onPointerDown(N) {
        if (o) {
          N.preventDefault();
          return;
        }
        M?.(N);
      }
    }, u ? {
      type: "button"
    } : {
      role: "button"
    }, d, D);
  }, [o, d, m, u]), S = ze((C) => {
    p.current = C, v();
  });
  return {
    getButtonProps: b,
    buttonRef: S
  };
}
function _d(n) {
  return Ct(n) && n.tagName === "BUTTON";
}
function VE(n) {
  return !!(n?.tagName === "A" && n?.href);
}
function To(n, o, a, i) {
  const u = xn(Bb).current;
  return YE(u, n, o, a, i) && Vb(u, [n, o, a, i]), u.callback;
}
function PE(n) {
  const o = xn(Bb).current;
  return GE(o, n) && Vb(o, n), o.callback;
}
function Bb() {
  return {
    callback: null,
    cleanup: null,
    refs: []
  };
}
function YE(n, o, a, i, u) {
  return n.refs[0] !== o || n.refs[1] !== a || n.refs[2] !== i || n.refs[3] !== u;
}
function GE(n, o) {
  return n.refs.length !== o.length || n.refs.some((a, i) => a !== o[i]);
}
function Vb(n, o) {
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
const qE = parseInt(y.version, 10);
function Dp(n) {
  return qE >= n;
}
function wv(n) {
  if (!/* @__PURE__ */ y.isValidElement(n))
    return null;
  const o = n, a = o.props;
  return (Dp(19) ? a?.ref : o.ref) ?? null;
}
function an() {
}
const ql = Object.freeze([]), xt = Object.freeze({});
function XE(n, o) {
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
function FE(n, o) {
  return typeof n == "function" ? n(o) : n;
}
function KE(n, o) {
  return typeof n == "function" ? n(o) : n;
}
function nt(n, o, a = {}) {
  const i = o.render, u = QE(o, a);
  if (a.enabled === !1)
    return null;
  const f = a.state ?? xt;
  return $E(n, i, u, f);
}
function QE(n, o = {}) {
  const {
    className: a,
    style: i,
    render: u
  } = n, {
    state: f = xt,
    ref: p,
    props: g,
    stateAttributesMapping: m,
    enabled: d = !0
  } = o, v = d ? FE(a, f) : void 0, b = d ? KE(i, f) : void 0, S = d ? XE(f, m) : xt, C = d && g ? ZE(g) : void 0, w = d ? op(S, C) ?? {} : xt;
  return typeof document < "u" && (d ? Array.isArray(p) ? w.ref = PE([w.ref, wv(u), ...p]) : w.ref = To(w.ref, wv(u), p) : To(null, null)), d ? (v !== void 0 && (w.className = Ub(w.className, v)), b !== void 0 && (w.style = op(w.style, b)), w) : xt;
}
function ZE(n) {
  return Array.isArray(n) ? _E(n) : bn(void 0, n);
}
const JE = /* @__PURE__ */ Symbol.for("react.lazy");
function $E(n, o, a, i) {
  if (o) {
    if (typeof o == "function")
      return o(a, i);
    const u = bn(a, o.props);
    u.ref = a.ref;
    let f = o;
    return f?.$$typeof === JE && (f = y.Children.toArray(o)[0]), /* @__PURE__ */ y.cloneElement(f, u);
  }
  if (n && typeof n == "string")
    return WE(n, a);
  throw new Error(At(8));
}
function WE(n, o) {
  return n === "button" ? /* @__PURE__ */ y.createElement("button", {
    type: "button",
    ...o,
    key: o.key
  }) : n === "img" ? /* @__PURE__ */ y.createElement("img", {
    alt: "",
    ...o,
    key: o.key
  }) : /* @__PURE__ */ y.createElement(n, o);
}
const eT = /* @__PURE__ */ y.forwardRef(function(o, a) {
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
    buttonRef: b
  } = Mo({
    disabled: f,
    focusableWhenDisabled: p,
    native: g
  });
  return nt("button", o, {
    state: {
      disabled: f
    },
    ref: [a, b],
    props: [d, v]
  });
});
function Pb(n) {
  var o, a, i = "";
  if (typeof n == "string" || typeof n == "number") i += n;
  else if (typeof n == "object") if (Array.isArray(n)) {
    var u = n.length;
    for (o = 0; o < u; o++) n[o] && (a = Pb(n[o])) && (i && (i += " "), i += a);
  } else for (a in n) n[a] && (i && (i += " "), i += a);
  return i;
}
function Yb() {
  for (var n, o, a = 0, i = "", u = arguments.length; a < u; a++) (n = arguments[a]) && (o = Pb(n)) && (i && (i += " "), i += o);
  return i;
}
const Ev = (n) => typeof n == "boolean" ? `${n}` : n === 0 ? "0" : n, Tv = Yb, aa = (n, o) => (a) => {
  var i;
  if (o?.variants == null) return Tv(n, a?.class, a?.className);
  const { variants: u, defaultVariants: f } = o, p = Object.keys(u).map((d) => {
    const v = a?.[d], b = f?.[d];
    if (v === null) return null;
    const S = Ev(v) || Ev(b);
    return u[d][S];
  }), g = a && Object.entries(a).reduce((d, v) => {
    let [b, S] = v;
    return S === void 0 || (d[b] = S), d;
  }, {}), m = o == null || (i = o.compoundVariants) === null || i === void 0 ? void 0 : i.reduce((d, v) => {
    let { class: b, className: S, ...C } = v;
    return Object.entries(C).every((w) => {
      let [A, T] = w;
      return Array.isArray(T) ? T.includes({
        ...f,
        ...g
      }[A]) : {
        ...f,
        ...g
      }[A] === T;
    }) ? [
      ...d,
      b,
      S
    ] : d;
  }, []);
  return Tv(n, p, m, a?.class, a?.className);
}, tT = (n, o) => {
  const a = new Array(n.length + o.length);
  for (let i = 0; i < n.length; i++)
    a[i] = n[i];
  for (let i = 0; i < o.length; i++)
    a[n.length + i] = o[i];
  return a;
}, nT = (n, o) => ({
  classGroupId: n,
  validator: o
}), Gb = (n = /* @__PURE__ */ new Map(), o = null, a) => ({
  nextPart: n,
  validators: o,
  classGroupId: a
}), vc = "-", Rv = [], lT = "arbitrary..", oT = (n) => {
  const o = aT(n), {
    conflictingClassGroups: a,
    conflictingClassGroupModifiers: i
  } = n;
  return {
    getClassGroupId: (p) => {
      if (p.startsWith("[") && p.endsWith("]"))
        return rT(p);
      const g = p.split(vc), m = g[0] === "" && g.length > 1 ? 1 : 0;
      return qb(g, m, o);
    },
    getConflictingClassGroupIds: (p, g) => {
      if (g) {
        const m = i[p], d = a[p];
        return m ? d ? tT(d, m) : m : d || Rv;
      }
      return a[p] || Rv;
    }
  };
}, qb = (n, o, a) => {
  if (n.length - o === 0)
    return a.classGroupId;
  const u = n[o], f = a.nextPart.get(u);
  if (f) {
    const d = qb(n, o + 1, f);
    if (d) return d;
  }
  const p = a.validators;
  if (p === null)
    return;
  const g = o === 0 ? n.join(vc) : n.slice(o).join(vc), m = p.length;
  for (let d = 0; d < m; d++) {
    const v = p[d];
    if (v.validator(g))
      return v.classGroupId;
  }
}, rT = (n) => n.slice(1, -1).indexOf(":") === -1 ? void 0 : (() => {
  const o = n.slice(1, -1), a = o.indexOf(":"), i = o.slice(0, a);
  return i ? lT + i : void 0;
})(), aT = (n) => {
  const {
    theme: o,
    classGroups: a
  } = n;
  return iT(a, o);
}, iT = (n, o) => {
  const a = Gb();
  for (const i in n) {
    const u = n[i];
    Np(u, a, i, o);
  }
  return a;
}, Np = (n, o, a, i) => {
  const u = n.length;
  for (let f = 0; f < u; f++) {
    const p = n[f];
    sT(p, o, a, i);
  }
}, sT = (n, o, a, i) => {
  if (typeof n == "string") {
    cT(n, o, a);
    return;
  }
  if (typeof n == "function") {
    uT(n, o, a, i);
    return;
  }
  fT(n, o, a, i);
}, cT = (n, o, a) => {
  const i = n === "" ? o : Xb(o, n);
  i.classGroupId = a;
}, uT = (n, o, a, i) => {
  if (dT(n)) {
    Np(n(i), o, a, i);
    return;
  }
  o.validators === null && (o.validators = []), o.validators.push(nT(a, n));
}, fT = (n, o, a, i) => {
  const u = Object.entries(n), f = u.length;
  for (let p = 0; p < f; p++) {
    const [g, m] = u[p];
    Np(m, Xb(o, g), a, i);
  }
}, Xb = (n, o) => {
  let a = n;
  const i = o.split(vc), u = i.length;
  for (let f = 0; f < u; f++) {
    const p = i[f];
    let g = a.nextPart.get(p);
    g || (g = Gb(), a.nextPart.set(p, g)), a = g;
  }
  return a;
}, dT = (n) => "isThemeGetter" in n && n.isThemeGetter === !0, pT = (n) => {
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
}, rp = "!", Cv = ":", gT = [], Ov = (n, o, a, i, u) => ({
  modifiers: n,
  hasImportantModifier: o,
  baseClassName: a,
  maybePostfixModifierPosition: i,
  isExternal: u
}), mT = (n) => {
  const {
    prefix: o,
    experimentalParseClassName: a
  } = n;
  let i = (u) => {
    const f = [];
    let p = 0, g = 0, m = 0, d;
    const v = u.length;
    for (let A = 0; A < v; A++) {
      const T = u[A];
      if (p === 0 && g === 0) {
        if (T === Cv) {
          f.push(u.slice(m, A)), m = A + 1;
          continue;
        }
        if (T === "/") {
          d = A;
          continue;
        }
      }
      T === "[" ? p++ : T === "]" ? p-- : T === "(" ? g++ : T === ")" && g--;
    }
    const b = f.length === 0 ? u : u.slice(m);
    let S = b, C = !1;
    b.endsWith(rp) ? (S = b.slice(0, -1), C = !0) : (
      /**
       * In Tailwind CSS v3 the important modifier was at the start of the base class name. This is still supported for legacy reasons.
       * @see https://github.com/dcastil/tailwind-merge/issues/513#issuecomment-2614029864
       */
      b.startsWith(rp) && (S = b.slice(1), C = !0)
    );
    const w = d && d > m ? d - m : void 0;
    return Ov(f, C, S, w);
  };
  if (o) {
    const u = o + Cv, f = i;
    i = (p) => p.startsWith(u) ? f(p.slice(u.length)) : Ov(gT, !1, p, void 0, !0);
  }
  if (a) {
    const u = i;
    i = (f) => a({
      className: f,
      parseClassName: u
    });
  }
  return i;
}, hT = (n) => {
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
}, yT = (n) => ({
  cache: pT(n.cacheSize),
  parseClassName: mT(n),
  sortModifiers: hT(n),
  postfixLookupClassGroupIds: vT(n),
  ...oT(n)
}), vT = (n) => {
  const o = /* @__PURE__ */ Object.create(null), a = n.postfixLookupClassGroups;
  if (a)
    for (let i = 0; i < a.length; i++)
      o[a[i]] = !0;
  return o;
}, bT = /\s+/, xT = (n, o) => {
  const {
    parseClassName: a,
    getClassGroupId: i,
    getConflictingClassGroupIds: u,
    sortModifiers: f,
    postfixLookupClassGroupIds: p
  } = o, g = [], m = n.trim().split(bT);
  let d = "";
  for (let v = m.length - 1; v >= 0; v -= 1) {
    const b = m[v], {
      isExternal: S,
      modifiers: C,
      hasImportantModifier: w,
      baseClassName: A,
      maybePostfixModifierPosition: T
    } = a(b);
    if (S) {
      d = b + (d.length > 0 ? " " + d : d);
      continue;
    }
    let z = !!T, M;
    if (z) {
      const H = A.substring(0, T);
      M = i(H);
      const k = M && p[M] ? i(A) : void 0;
      k && k !== M && (M = k, z = !1);
    } else
      M = i(A);
    if (!M) {
      if (!z) {
        d = b + (d.length > 0 ? " " + d : d);
        continue;
      }
      if (M = i(A), !M) {
        d = b + (d.length > 0 ? " " + d : d);
        continue;
      }
      z = !1;
    }
    const D = C.length === 0 ? "" : C.length === 1 ? C[0] : f(C).join(":"), N = w ? D + rp : D, L = N + M;
    if (g.indexOf(L) > -1)
      continue;
    g.push(L);
    const j = u(M, z);
    for (let H = 0; H < j.length; ++H) {
      const k = j[H];
      g.push(N + k);
    }
    d = b + (d.length > 0 ? " " + d : d);
  }
  return d;
}, ST = (...n) => {
  let o = 0, a, i, u = "";
  for (; o < n.length; )
    (a = n[o++]) && (i = Fb(a)) && (u && (u += " "), u += i);
  return u;
}, Fb = (n) => {
  if (typeof n == "string")
    return n;
  let o, a = "";
  for (let i = 0; i < n.length; i++)
    n[i] && (o = Fb(n[i])) && (a && (a += " "), a += o);
  return a;
}, wT = (n, ...o) => {
  let a, i, u, f;
  const p = (m) => {
    const d = o.reduce((v, b) => b(v), n());
    return a = yT(d), i = a.cache.get, u = a.cache.set, f = g, g(m);
  }, g = (m) => {
    const d = i(m);
    if (d)
      return d;
    const v = xT(m, a);
    return u(m, v), v;
  };
  return f = p, (...m) => f(ST(...m));
}, ET = [], nn = (n) => {
  const o = (a) => a[n] || ET;
  return o.isThemeGetter = !0, o;
}, Kb = /^\[(?:(\w[\w-]*):)?(.+)\]$/i, Qb = /^\((?:(\w[\w-]*):)?(.+)\)$/i, TT = /^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/, RT = /^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/, CT = /\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/, OT = /^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix)\(.+\)$/, MT = /^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/, AT = /^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/, wo = (n) => TT.test(n), Ze = (n) => !!n && !Number.isNaN(Number(n)), ul = (n) => !!n && Number.isInteger(Number(n)), Hd = (n) => n.endsWith("%") && Ze(n.slice(0, -1)), Hl = (n) => RT.test(n), Zb = () => !0, zT = (n) => (
  // `colorFunctionRegex` check is necessary because color functions can have percentages in them which which would be incorrectly classified as lengths.
  // For example, `hsl(0 0% 0%)` would be classified as a length without this check.
  // I could also use lookbehind assertion in `lengthUnitRegex` but that isn't supported widely enough.
  CT.test(n) && !OT.test(n)
), jp = () => !1, DT = (n) => MT.test(n), NT = (n) => AT.test(n), jT = (n) => !Me(n) && !Ae(n), kT = (n) => n.startsWith("@container") && (n[10] === "/" && n[11] !== void 0 || n[11] === "s" && n[16] !== void 0 && n.startsWith("-size/", 10) || n[11] === "n" && n[18] !== void 0 && n.startsWith("-normal/", 10)), _T = (n) => Ao(n, Wb, jp), Me = (n) => Kb.test(n), er = (n) => Ao(n, e0, zT), Mv = (n) => Ao(n, YT, Ze), HT = (n) => Ao(n, n0, Zb), UT = (n) => Ao(n, t0, jp), Av = (n) => Ao(n, Jb, jp), LT = (n) => Ao(n, $b, NT), qs = (n) => Ao(n, l0, DT), Ae = (n) => Qb.test(n), ti = (n) => cr(n, e0), IT = (n) => cr(n, t0), zv = (n) => cr(n, Jb), BT = (n) => cr(n, Wb), VT = (n) => cr(n, $b), Xs = (n) => cr(n, l0, !0), PT = (n) => cr(n, n0, !0), Ao = (n, o, a) => {
  const i = Kb.exec(n);
  return i ? i[1] ? o(i[1]) : a(i[2]) : !1;
}, cr = (n, o, a = !1) => {
  const i = Qb.exec(n);
  return i ? i[1] ? o(i[1]) : a : !1;
}, Jb = (n) => n === "position" || n === "percentage", $b = (n) => n === "image" || n === "url", Wb = (n) => n === "length" || n === "size" || n === "bg-size", e0 = (n) => n === "length", YT = (n) => n === "number", t0 = (n) => n === "family-name", n0 = (n) => n === "number" || n === "weight", l0 = (n) => n === "shadow", GT = () => {
  const n = nn("color"), o = nn("font"), a = nn("text"), i = nn("font-weight"), u = nn("tracking"), f = nn("leading"), p = nn("breakpoint"), g = nn("container"), m = nn("spacing"), d = nn("radius"), v = nn("shadow"), b = nn("inset-shadow"), S = nn("text-shadow"), C = nn("drop-shadow"), w = nn("blur"), A = nn("perspective"), T = nn("aspect"), z = nn("ease"), M = nn("animate"), D = () => ["auto", "avoid", "all", "avoid-page", "page", "left", "right", "column"], N = () => [
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
  ], L = () => [...N(), Ae, Me], j = () => ["auto", "hidden", "clip", "visible", "scroll"], H = () => ["auto", "contain", "none"], k = () => [Ae, Me, m], G = () => [wo, "full", "auto", ...k()], E = () => [ul, "none", "subgrid", Ae, Me], Z = () => ["auto", {
    span: ["full", ul, Ae, Me]
  }, ul, Ae, Me], J = () => [ul, "auto", Ae, Me], X = () => ["auto", "min", "max", "fr", Ae, Me], K = () => ["start", "end", "center", "between", "around", "evenly", "stretch", "baseline", "center-safe", "end-safe"], q = () => ["start", "end", "center", "stretch", "center-safe", "end-safe"], _ = () => ["auto", ...k()], Y = () => [wo, "auto", "full", "dvw", "dvh", "lvw", "lvh", "svw", "svh", "min", "max", "fit", ...k()], V = () => [wo, "screen", "full", "dvw", "lvw", "svw", "min", "max", "fit", ...k()], Q = () => [wo, "screen", "full", "lh", "dvh", "lvh", "svh", "min", "max", "fit", ...k()], B = () => [n, Ae, Me], O = () => [...N(), zv, Av, {
    position: [Ae, Me]
  }], U = () => ["no-repeat", {
    repeat: ["", "x", "y", "space", "round"]
  }], ne = () => ["auto", "cover", "contain", BT, _T, {
    size: [Ae, Me]
  }], $ = () => [Hd, ti, er], re = () => [
    // Deprecated since Tailwind CSS v4.0.0
    "",
    "none",
    "full",
    d,
    Ae,
    Me
  ], ie = () => ["", Ze, ti, er], oe = () => ["solid", "dashed", "dotted", "double"], se = () => ["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity"], ge = () => [Ze, Hd, zv, Av], je = () => [
    // Deprecated since Tailwind CSS v4.0.0
    "",
    "none",
    w,
    Ae,
    Me
  ], Ee = () => ["none", Ze, Ae, Me], fe = () => ["none", Ze, Ae, Me], ye = () => [Ze, Ae, Me], Re = () => [wo, "full", ...k()];
  return {
    cacheSize: 500,
    theme: {
      animate: ["spin", "ping", "pulse", "bounce"],
      aspect: ["video"],
      blur: [Hl],
      breakpoint: [Hl],
      color: [Zb],
      container: [Hl],
      "drop-shadow": [Hl],
      ease: ["in", "out", "in-out"],
      font: [jT],
      "font-weight": ["thin", "extralight", "light", "normal", "medium", "semibold", "bold", "extrabold", "black"],
      "inset-shadow": [Hl],
      leading: ["none", "tight", "snug", "normal", "relaxed", "loose"],
      perspective: ["dramatic", "near", "normal", "midrange", "distant", "none"],
      radius: [Hl],
      shadow: [Hl],
      spacing: ["px", Ze],
      text: [Hl],
      "text-shadow": [Hl],
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
        aspect: ["auto", "square", wo, Me, Ae, T]
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
      "container-named": [kT],
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
        "break-after": D()
      }],
      /**
       * Break Before
       * @see https://tailwindcss.com/docs/break-before
       */
      "break-before": [{
        "break-before": D()
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
        overflow: j()
      }],
      /**
       * Overflow X
       * @see https://tailwindcss.com/docs/overflow
       */
      "overflow-x": [{
        "overflow-x": j()
      }],
      /**
       * Overflow Y
       * @see https://tailwindcss.com/docs/overflow
       */
      "overflow-y": [{
        "overflow-y": j()
      }],
      /**
       * Overscroll Behavior
       * @see https://tailwindcss.com/docs/overscroll-behavior
       */
      overscroll: [{
        overscroll: H()
      }],
      /**
       * Overscroll Behavior X
       * @see https://tailwindcss.com/docs/overscroll-behavior
       */
      "overscroll-x": [{
        "overscroll-x": H()
      }],
      /**
       * Overscroll Behavior Y
       * @see https://tailwindcss.com/docs/overscroll-behavior
       */
      "overscroll-y": [{
        "overscroll-y": H()
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
        inset: G()
      }],
      /**
       * Inset Inline
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      "inset-x": [{
        "inset-x": G()
      }],
      /**
       * Inset Block
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      "inset-y": [{
        "inset-y": G()
      }],
      /**
       * Inset Inline Start
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       * @todo class group will be renamed to `inset-s` in next major release
       */
      start: [{
        "inset-s": G(),
        /**
         * @deprecated since Tailwind CSS v4.2.0 in favor of `inset-s-*` utilities.
         * @see https://github.com/tailwindlabs/tailwindcss/pull/19613
         */
        start: G()
      }],
      /**
       * Inset Inline End
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       * @todo class group will be renamed to `inset-e` in next major release
       */
      end: [{
        "inset-e": G(),
        /**
         * @deprecated since Tailwind CSS v4.2.0 in favor of `inset-e-*` utilities.
         * @see https://github.com/tailwindlabs/tailwindcss/pull/19613
         */
        end: G()
      }],
      /**
       * Inset Block Start
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      "inset-bs": [{
        "inset-bs": G()
      }],
      /**
       * Inset Block End
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      "inset-be": [{
        "inset-be": G()
      }],
      /**
       * Top
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      top: [{
        top: G()
      }],
      /**
       * Right
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      right: [{
        right: G()
      }],
      /**
       * Bottom
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      bottom: [{
        bottom: G()
      }],
      /**
       * Left
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      left: [{
        left: G()
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
        z: [ul, "auto", Ae, Me]
      }],
      // ------------------------
      // --- Flexbox and Grid ---
      // ------------------------
      /**
       * Flex Basis
       * @see https://tailwindcss.com/docs/flex-basis
       */
      basis: [{
        basis: [wo, "full", "auto", g, ...k()]
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
        flex: [Ze, wo, "auto", "initial", "none", Me]
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
        order: [ul, "first", "last", "none", Ae, Me]
      }],
      /**
       * Grid Template Columns
       * @see https://tailwindcss.com/docs/grid-template-columns
       */
      "grid-cols": [{
        "grid-cols": E()
      }],
      /**
       * Grid Column Start / End
       * @see https://tailwindcss.com/docs/grid-column
       */
      "col-start-end": [{
        col: Z()
      }],
      /**
       * Grid Column Start
       * @see https://tailwindcss.com/docs/grid-column
       */
      "col-start": [{
        "col-start": J()
      }],
      /**
       * Grid Column End
       * @see https://tailwindcss.com/docs/grid-column
       */
      "col-end": [{
        "col-end": J()
      }],
      /**
       * Grid Template Rows
       * @see https://tailwindcss.com/docs/grid-template-rows
       */
      "grid-rows": [{
        "grid-rows": E()
      }],
      /**
       * Grid Row Start / End
       * @see https://tailwindcss.com/docs/grid-row
       */
      "row-start-end": [{
        row: Z()
      }],
      /**
       * Grid Row Start
       * @see https://tailwindcss.com/docs/grid-row
       */
      "row-start": [{
        "row-start": J()
      }],
      /**
       * Grid Row End
       * @see https://tailwindcss.com/docs/grid-row
       */
      "row-end": [{
        "row-end": J()
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
        "auto-cols": X()
      }],
      /**
       * Grid Auto Rows
       * @see https://tailwindcss.com/docs/grid-auto-rows
       */
      "auto-rows": [{
        "auto-rows": X()
      }],
      /**
       * Gap
       * @see https://tailwindcss.com/docs/gap
       */
      gap: [{
        gap: k()
      }],
      /**
       * Gap X
       * @see https://tailwindcss.com/docs/gap
       */
      "gap-x": [{
        "gap-x": k()
      }],
      /**
       * Gap Y
       * @see https://tailwindcss.com/docs/gap
       */
      "gap-y": [{
        "gap-y": k()
      }],
      /**
       * Justify Content
       * @see https://tailwindcss.com/docs/justify-content
       */
      "justify-content": [{
        justify: [...K(), "normal"]
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
        content: ["normal", ...K()]
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
        "place-content": K()
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
        p: k()
      }],
      /**
       * Padding Inline
       * @see https://tailwindcss.com/docs/padding
       */
      px: [{
        px: k()
      }],
      /**
       * Padding Block
       * @see https://tailwindcss.com/docs/padding
       */
      py: [{
        py: k()
      }],
      /**
       * Padding Inline Start
       * @see https://tailwindcss.com/docs/padding
       */
      ps: [{
        ps: k()
      }],
      /**
       * Padding Inline End
       * @see https://tailwindcss.com/docs/padding
       */
      pe: [{
        pe: k()
      }],
      /**
       * Padding Block Start
       * @see https://tailwindcss.com/docs/padding
       */
      pbs: [{
        pbs: k()
      }],
      /**
       * Padding Block End
       * @see https://tailwindcss.com/docs/padding
       */
      pbe: [{
        pbe: k()
      }],
      /**
       * Padding Top
       * @see https://tailwindcss.com/docs/padding
       */
      pt: [{
        pt: k()
      }],
      /**
       * Padding Right
       * @see https://tailwindcss.com/docs/padding
       */
      pr: [{
        pr: k()
      }],
      /**
       * Padding Bottom
       * @see https://tailwindcss.com/docs/padding
       */
      pb: [{
        pb: k()
      }],
      /**
       * Padding Left
       * @see https://tailwindcss.com/docs/padding
       */
      pl: [{
        pl: k()
      }],
      /**
       * Margin
       * @see https://tailwindcss.com/docs/margin
       */
      m: [{
        m: _()
      }],
      /**
       * Margin Inline
       * @see https://tailwindcss.com/docs/margin
       */
      mx: [{
        mx: _()
      }],
      /**
       * Margin Block
       * @see https://tailwindcss.com/docs/margin
       */
      my: [{
        my: _()
      }],
      /**
       * Margin Inline Start
       * @see https://tailwindcss.com/docs/margin
       */
      ms: [{
        ms: _()
      }],
      /**
       * Margin Inline End
       * @see https://tailwindcss.com/docs/margin
       */
      me: [{
        me: _()
      }],
      /**
       * Margin Block Start
       * @see https://tailwindcss.com/docs/margin
       */
      mbs: [{
        mbs: _()
      }],
      /**
       * Margin Block End
       * @see https://tailwindcss.com/docs/margin
       */
      mbe: [{
        mbe: _()
      }],
      /**
       * Margin Top
       * @see https://tailwindcss.com/docs/margin
       */
      mt: [{
        mt: _()
      }],
      /**
       * Margin Right
       * @see https://tailwindcss.com/docs/margin
       */
      mr: [{
        mr: _()
      }],
      /**
       * Margin Bottom
       * @see https://tailwindcss.com/docs/margin
       */
      mb: [{
        mb: _()
      }],
      /**
       * Margin Left
       * @see https://tailwindcss.com/docs/margin
       */
      ml: [{
        ml: _()
      }],
      /**
       * Space Between X
       * @see https://tailwindcss.com/docs/margin#adding-space-between-children
       */
      "space-x": [{
        "space-x": k()
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
        "space-y": k()
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
        size: Y()
      }],
      /**
       * Inline Size
       * @see https://tailwindcss.com/docs/width
       */
      "inline-size": [{
        inline: ["auto", ...V()]
      }],
      /**
       * Min-Inline Size
       * @see https://tailwindcss.com/docs/min-width
       */
      "min-inline-size": [{
        "min-inline": ["auto", ...V()]
      }],
      /**
       * Max-Inline Size
       * @see https://tailwindcss.com/docs/max-width
       */
      "max-inline-size": [{
        "max-inline": ["none", ...V()]
      }],
      /**
       * Block Size
       * @see https://tailwindcss.com/docs/height
       */
      "block-size": [{
        block: ["auto", ...Q()]
      }],
      /**
       * Min-Block Size
       * @see https://tailwindcss.com/docs/min-height
       */
      "min-block-size": [{
        "min-block": ["auto", ...Q()]
      }],
      /**
       * Max-Block Size
       * @see https://tailwindcss.com/docs/max-height
       */
      "max-block-size": [{
        "max-block": ["none", ...Q()]
      }],
      /**
       * Width
       * @see https://tailwindcss.com/docs/width
       */
      w: [{
        w: [g, "screen", ...Y()]
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
          ...Y()
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
          ...Y()
        ]
      }],
      /**
       * Height
       * @see https://tailwindcss.com/docs/height
       */
      h: [{
        h: ["screen", "lh", ...Y()]
      }],
      /**
       * Min-Height
       * @see https://tailwindcss.com/docs/min-height
       */
      "min-h": [{
        "min-h": ["screen", "lh", "none", ...Y()]
      }],
      /**
       * Max-Height
       * @see https://tailwindcss.com/docs/max-height
       */
      "max-h": [{
        "max-h": ["screen", "lh", ...Y()]
      }],
      // ------------------
      // --- Typography ---
      // ------------------
      /**
       * Font Size
       * @see https://tailwindcss.com/docs/font-size
       */
      "font-size": [{
        text: ["base", a, ti, er]
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
        font: [i, PT, HT]
      }],
      /**
       * Font Stretch
       * @see https://tailwindcss.com/docs/font-stretch
       */
      "font-stretch": [{
        "font-stretch": ["ultra-condensed", "extra-condensed", "condensed", "semi-condensed", "normal", "semi-expanded", "expanded", "extra-expanded", "ultra-expanded", Hd, Me]
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
        "line-clamp": [Ze, "none", Ae, Mv]
      }],
      /**
       * Line Height
       * @see https://tailwindcss.com/docs/line-height
       */
      leading: [{
        leading: [
          /** Deprecated since Tailwind CSS v4.0.0. @see https://github.com/tailwindlabs/tailwindcss.com/issues/2027#issuecomment-2620152757 */
          f,
          ...k()
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
        decoration: [...oe(), "wavy"]
      }],
      /**
       * Text Decoration Thickness
       * @see https://tailwindcss.com/docs/text-decoration-thickness
       */
      "text-decoration-thickness": [{
        decoration: [Ze, "from-font", "auto", Ae, er]
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
        indent: k()
      }],
      /**
       * Tab Size
       * @see https://tailwindcss.com/docs/tab-size
       */
      "tab-size": [{
        tab: [ul, Ae, Me]
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
        bg: U()
      }],
      /**
       * Background Size
       * @see https://tailwindcss.com/docs/background-size
       */
      "bg-size": [{
        bg: ne()
      }],
      /**
       * Background Image
       * @see https://tailwindcss.com/docs/background-image
       */
      "bg-image": [{
        bg: ["none", {
          linear: [{
            to: ["t", "tr", "r", "br", "b", "bl", "l", "tl"]
          }, ul, Ae, Me],
          radial: ["", Ae, Me],
          conic: [ul, Ae, Me]
        }, VT, LT]
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
        from: $()
      }],
      /**
       * Gradient Color Stops Via Position
       * @see https://tailwindcss.com/docs/gradient-color-stops
       */
      "gradient-via-pos": [{
        via: $()
      }],
      /**
       * Gradient Color Stops To Position
       * @see https://tailwindcss.com/docs/gradient-color-stops
       */
      "gradient-to-pos": [{
        to: $()
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
        rounded: re()
      }],
      /**
       * Border Radius Start
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-s": [{
        "rounded-s": re()
      }],
      /**
       * Border Radius End
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-e": [{
        "rounded-e": re()
      }],
      /**
       * Border Radius Top
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-t": [{
        "rounded-t": re()
      }],
      /**
       * Border Radius Right
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-r": [{
        "rounded-r": re()
      }],
      /**
       * Border Radius Bottom
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-b": [{
        "rounded-b": re()
      }],
      /**
       * Border Radius Left
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-l": [{
        "rounded-l": re()
      }],
      /**
       * Border Radius Start Start
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-ss": [{
        "rounded-ss": re()
      }],
      /**
       * Border Radius Start End
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-se": [{
        "rounded-se": re()
      }],
      /**
       * Border Radius End End
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-ee": [{
        "rounded-ee": re()
      }],
      /**
       * Border Radius End Start
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-es": [{
        "rounded-es": re()
      }],
      /**
       * Border Radius Top Left
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-tl": [{
        "rounded-tl": re()
      }],
      /**
       * Border Radius Top Right
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-tr": [{
        "rounded-tr": re()
      }],
      /**
       * Border Radius Bottom Right
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-br": [{
        "rounded-br": re()
      }],
      /**
       * Border Radius Bottom Left
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-bl": [{
        "rounded-bl": re()
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
        border: [...oe(), "hidden", "none"]
      }],
      /**
       * Divide Style
       * @see https://tailwindcss.com/docs/border-style#setting-the-divider-style
       */
      "divide-style": [{
        divide: [...oe(), "hidden", "none"]
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
        outline: [...oe(), "none", "hidden"]
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
        outline: ["", Ze, ti, er]
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
          Xs,
          qs
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
        "inset-shadow": ["none", b, Xs, qs]
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
        "ring-offset": [Ze, er]
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
        "text-shadow": ["none", S, Xs, qs]
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
        "mask-radial-at": N()
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
        mask: U()
      }],
      /**
       * Mask Size
       * @see https://tailwindcss.com/docs/mask-size
       */
      "mask-size": [{
        mask: ne()
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
        blur: je()
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
          Xs,
          qs
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
        "backdrop-blur": je()
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
        "border-spacing": k()
      }],
      /**
       * Border Spacing X
       * @see https://tailwindcss.com/docs/border-spacing
       */
      "border-spacing-x": [{
        "border-spacing-x": k()
      }],
      /**
       * Border Spacing Y
       * @see https://tailwindcss.com/docs/border-spacing
       */
      "border-spacing-y": [{
        "border-spacing-y": k()
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
        animate: ["none", M, Ae, Me]
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
        perspective: [A, Ae, Me]
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
        scale: fe()
      }],
      /**
       * Scale X
       * @see https://tailwindcss.com/docs/scale
       */
      "scale-x": [{
        "scale-x": fe()
      }],
      /**
       * Scale Y
       * @see https://tailwindcss.com/docs/scale
       */
      "scale-y": [{
        "scale-y": fe()
      }],
      /**
       * Scale Z
       * @see https://tailwindcss.com/docs/scale
       */
      "scale-z": [{
        "scale-z": fe()
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
        skew: ye()
      }],
      /**
       * Skew X
       * @see https://tailwindcss.com/docs/skew
       */
      "skew-x": [{
        "skew-x": ye()
      }],
      /**
       * Skew Y
       * @see https://tailwindcss.com/docs/skew
       */
      "skew-y": [{
        "skew-y": ye()
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
        translate: Re()
      }],
      /**
       * Translate X
       * @see https://tailwindcss.com/docs/translate
       */
      "translate-x": [{
        "translate-x": Re()
      }],
      /**
       * Translate Y
       * @see https://tailwindcss.com/docs/translate
       */
      "translate-y": [{
        "translate-y": Re()
      }],
      /**
       * Translate Z
       * @see https://tailwindcss.com/docs/translate
       */
      "translate-z": [{
        "translate-z": Re()
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
        zoom: [ul, Ae, Me]
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
        "scroll-m": k()
      }],
      /**
       * Scroll Margin Inline
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-mx": [{
        "scroll-mx": k()
      }],
      /**
       * Scroll Margin Block
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-my": [{
        "scroll-my": k()
      }],
      /**
       * Scroll Margin Inline Start
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-ms": [{
        "scroll-ms": k()
      }],
      /**
       * Scroll Margin Inline End
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-me": [{
        "scroll-me": k()
      }],
      /**
       * Scroll Margin Block Start
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-mbs": [{
        "scroll-mbs": k()
      }],
      /**
       * Scroll Margin Block End
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-mbe": [{
        "scroll-mbe": k()
      }],
      /**
       * Scroll Margin Top
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-mt": [{
        "scroll-mt": k()
      }],
      /**
       * Scroll Margin Right
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-mr": [{
        "scroll-mr": k()
      }],
      /**
       * Scroll Margin Bottom
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-mb": [{
        "scroll-mb": k()
      }],
      /**
       * Scroll Margin Left
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-ml": [{
        "scroll-ml": k()
      }],
      /**
       * Scroll Padding
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-p": [{
        "scroll-p": k()
      }],
      /**
       * Scroll Padding Inline
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-px": [{
        "scroll-px": k()
      }],
      /**
       * Scroll Padding Block
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-py": [{
        "scroll-py": k()
      }],
      /**
       * Scroll Padding Inline Start
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-ps": [{
        "scroll-ps": k()
      }],
      /**
       * Scroll Padding Inline End
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-pe": [{
        "scroll-pe": k()
      }],
      /**
       * Scroll Padding Block Start
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-pbs": [{
        "scroll-pbs": k()
      }],
      /**
       * Scroll Padding Block End
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-pbe": [{
        "scroll-pbe": k()
      }],
      /**
       * Scroll Padding Top
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-pt": [{
        "scroll-pt": k()
      }],
      /**
       * Scroll Padding Right
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-pr": [{
        "scroll-pr": k()
      }],
      /**
       * Scroll Padding Bottom
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-pb": [{
        "scroll-pb": k()
      }],
      /**
       * Scroll Padding Left
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-pl": [{
        "scroll-pl": k()
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
        stroke: [Ze, ti, er, Mv]
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
}, qT = /* @__PURE__ */ wT(GT);
function Ke(...n) {
  return qT(Yb(n));
}
const XT = aa(
  "tw:group/button tw:inline-flex tw:shrink-0 tw:items-center tw:justify-center tw:rounded-[var(--radius-control)] tw:border tw:border-transparent tw:bg-clip-padding tw:text-[var(--fs-body-s)] tw:font-medium tw:whitespace-nowrap tw:transition-[background-color,color,border-color,opacity,transform] tw:duration-[var(--motion-fast)] tw:ease-[var(--ease-out)] tw:outline-none tw:select-none tw:focus-visible:outline tw:focus-visible:outline-[var(--focus-ring-color)] tw:focus-visible:outline-offset-1 tw:active:not-aria-[haspopup]:scale-[0.98] tw:disabled:pointer-events-none tw:disabled:opacity-50 tw:aria-invalid:border-destructive tw:aria-invalid:outline tw:aria-invalid:outline-[var(--status-error)] tw:[&_svg]:pointer-events-none tw:[&_svg]:shrink-0 tw:[&_svg:not([class*=size-])]:size-4",
  {
    variants: {
      variant: {
        default: "tw:bg-primary tw:text-primary-foreground tw:hover:bg-primary/80",
        outline: "tw:border-border tw:bg-background tw:hover:bg-muted tw:hover:text-foreground tw:aria-expanded:bg-muted tw:aria-expanded:text-foreground",
        secondary: "tw:bg-secondary tw:text-secondary-foreground tw:hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] tw:aria-expanded:bg-secondary tw:aria-expanded:text-secondary-foreground",
        ghost: "tw:hover:bg-muted tw:hover:text-foreground tw:aria-expanded:bg-muted tw:aria-expanded:text-foreground",
        destructive: "tw:bg-destructive/10 tw:text-destructive tw:hover:bg-destructive/20 tw:focus-visible:border-destructive/40",
        link: "tw:text-primary tw:underline-offset-4 tw:hover:underline"
      },
      size: {
        default: "tw:h-8 tw:gap-1.5 tw:px-2.5 tw:has-data-[icon=inline-end]:pr-2 tw:has-data-[icon=inline-start]:pl-2",
        xs: "tw:h-6 tw:gap-1 tw:rounded-[min(var(--radius-md),10px)] tw:px-2 tw:text-xs tw:in-data-[slot=button-group]:rounded-lg tw:has-data-[icon=inline-end]:pr-1.5 tw:has-data-[icon=inline-start]:pl-1.5 tw:[&_svg:not([class*=size-])]:size-3",
        sm: "tw:h-7 tw:gap-1 tw:rounded-[min(var(--radius-md),12px)] tw:px-2.5 tw:text-[0.8rem] tw:in-data-[slot=button-group]:rounded-lg tw:has-data-[icon=inline-end]:pr-1.5 tw:has-data-[icon=inline-start]:pl-1.5 tw:[&_svg:not([class*=size-])]:size-3.5",
        lg: "tw:h-9 tw:gap-1.5 tw:px-2.5 tw:has-data-[icon=inline-end]:pr-2 tw:has-data-[icon=inline-start]:pl-2",
        icon: "tw:size-8",
        "icon-xs": "tw:size-6 tw:rounded-[min(var(--radius-md),10px)] tw:in-data-[slot=button-group]:rounded-lg tw:[&_svg:not([class*=size-])]:size-3",
        "icon-sm": "tw:size-7 tw:rounded-[min(var(--radius-md),12px)] tw:in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "tw:size-9"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);
function ht({
  className: n,
  variant: o = "default",
  size: a = "default",
  ...i
}) {
  return /* @__PURE__ */ x.jsx(
    eT,
    {
      "data-slot": "button",
      className: Ke(XT({ variant: o, size: a, className: n })),
      ...i
    }
  );
}
function kp(n) {
  const o = y.useRef(!0);
  o.current && (o.current = !1, n());
}
function Je(n, o, a, i) {
  return n.addEventListener(o, a, i), () => {
    n.removeEventListener(o, a, i);
  };
}
function FT() {
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
  userAgent: KT,
  platform: QT,
  maxTouchPoints: ZT
} = FT(), Hc = KT.toLowerCase(), bi = QT.toLowerCase(), Uc = /^i(os$|p)/.test(bi) || bi === "macintel" && ZT > 1, Dv = "android", ap = bi === Dv || Hc.includes(Dv), _p = !Uc && bi.startsWith("mac");
bi.startsWith("win");
const JT = _p || Uc, zo = typeof CSS < "u" && !!CSS.supports?.("-webkit-backdrop-filter:none");
!zo && Hc.includes("firefox");
!zo && Hc.includes("chrom");
const $T = JT, Hp = /jsdom|happydom/.test(Hc);
function tt(n) {
  return n?.ownerDocument || document;
}
const WT = [];
function Up(n) {
  y.useEffect(n, WT);
}
const ni = 0;
class el {
  static create() {
    return new el();
  }
  currentId = ni;
  /**
   * Executes `fn` after `delay`, clearing any previously scheduled call.
   */
  start(o, a) {
    this.clear(), this.currentId = setTimeout(() => {
      this.currentId = ni, a();
    }, o);
  }
  isStarted() {
    return this.currentId !== ni;
  }
  clear = () => {
    this.currentId !== ni && (clearTimeout(this.currentId), this.currentId = ni);
  };
  disposeEffect = () => this.clear;
}
function sn() {
  const n = xn(el.create).current;
  return Up(n.disposeEffect), n;
}
const Fs = null;
class eR {
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
const Ks = new eR();
class dl {
  static create() {
    return new dl();
  }
  static request(o) {
    return Ks.request(o);
  }
  static cancel(o) {
    return Ks.cancel(o);
  }
  currentId = Fs;
  /**
   * Executes `fn` after `delay`, clearing any previously scheduled call.
   */
  request(o) {
    this.cancel(), this.currentId = Ks.request(() => {
      this.currentId = Fs, o();
    });
  }
  cancel = () => {
    this.currentId !== Fs && (Ks.cancel(this.currentId), this.currentId = Fs);
  };
  disposeEffect = () => this.cancel;
}
function na() {
  const n = xn(dl.create).current;
  return Up(n.disposeEffect), n;
}
let Nv = {}, jv = {}, kv = "";
function tR(n) {
  if (typeof document > "u")
    return !1;
  const o = tt(n);
  return Dt(o).innerWidth - o.documentElement.clientWidth > 0;
}
function nR(n) {
  if (!(typeof CSS < "u" && CSS.supports && CSS.supports("scrollbar-gutter", "stable")) || typeof document > "u")
    return !1;
  const a = tt(n), i = a.documentElement, u = a.body, f = sr(i) ? i : u, p = f.style.overflowY, g = i.style.scrollbarGutter;
  i.style.scrollbarGutter = "stable", f.style.overflowY = "scroll";
  const m = f.offsetWidth;
  f.style.overflowY = "hidden";
  const d = f.offsetWidth;
  return f.style.overflowY = p, i.style.scrollbarGutter = g, m === d;
}
function lR(n) {
  const o = tt(n), a = o.documentElement, i = o.body, u = sr(a) ? a : i, f = {
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
function oR(n) {
  const o = tt(n), a = o.documentElement, i = o.body, u = Dt(a);
  let f = 0, p = 0, g = !1;
  const m = dl.create();
  if (zo && (u.visualViewport?.scale ?? 1) !== 1)
    return () => {
    };
  function d() {
    const C = u.getComputedStyle(a), w = u.getComputedStyle(i), z = (C.scrollbarGutter || "").includes("both-edges") ? "stable both-edges" : "stable";
    f = a.scrollTop, p = a.scrollLeft, Nv = {
      scrollbarGutter: a.style.scrollbarGutter,
      overflowY: a.style.overflowY,
      overflowX: a.style.overflowX
    }, kv = a.style.scrollBehavior, jv = {
      position: i.style.position,
      height: i.style.height,
      width: i.style.width,
      boxSizing: i.style.boxSizing,
      overflowY: i.style.overflowY,
      overflowX: i.style.overflowX,
      scrollBehavior: i.style.scrollBehavior
    };
    const M = a.scrollHeight > a.clientHeight, D = a.scrollWidth > a.clientWidth, N = C.overflowY === "scroll" || w.overflowY === "scroll", L = C.overflowX === "scroll" || w.overflowX === "scroll", j = Math.max(0, u.innerWidth - i.clientWidth), H = Math.max(0, u.innerHeight - i.clientHeight), k = parseFloat(w.marginTop) + parseFloat(w.marginBottom), G = parseFloat(w.marginLeft) + parseFloat(w.marginRight), E = sr(a) ? a : i;
    if (g = nR(n), g) {
      a.style.scrollbarGutter = z, E.style.overflowY = "hidden", E.style.overflowX = "hidden";
      return;
    }
    Object.assign(a.style, {
      scrollbarGutter: z,
      overflowY: "hidden",
      overflowX: "hidden"
    }), (M || N) && (a.style.overflowY = "scroll"), (D || L) && (a.style.overflowX = "scroll"), Object.assign(i.style, {
      position: "relative",
      height: k || H ? `calc(100dvh - ${k + H}px)` : "100dvh",
      width: G || j ? `calc(100vw - ${G + j}px)` : "100vw",
      boxSizing: "border-box",
      overflow: "hidden",
      scrollBehavior: "unset"
    }), i.scrollTop = f, i.scrollLeft = p, a.setAttribute("data-base-ui-scroll-locked", ""), a.style.scrollBehavior = "unset";
  }
  function v() {
    Object.assign(a.style, Nv), Object.assign(i.style, jv), g || (a.scrollTop = f, a.scrollLeft = p, a.removeAttribute("data-base-ui-scroll-locked"), a.style.scrollBehavior = kv);
  }
  function b() {
    v(), m.request(d);
  }
  d();
  const S = Je(u, "resize", b);
  return () => {
    m.cancel(), v(), typeof u.removeEventListener == "function" && S();
  };
}
class rR {
  lockCount = 0;
  restore = null;
  timeoutLock = el.create();
  timeoutUnlock = el.create();
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
    const i = tt(o).documentElement, u = Dt(i).getComputedStyle(i).overflowY;
    if (u === "hidden" || u === "clip") {
      this.restore = an;
      return;
    }
    const f = Uc || !tR(o);
    this.restore = f ? lR(o) : oR(o);
  }
}
const aR = new rR();
function o0(n = !0, o = null) {
  xe(() => {
    if (n)
      return aR.acquire(o);
  }, [n, o]);
}
function fl(n) {
  n.preventDefault(), n.stopPropagation();
}
function iR(n) {
  return "nativeEvent" in n;
}
function Lp(n) {
  return n.pointerType === "" && n.isTrusted ? !0 : ap && n.pointerType ? n.type === "click" && n.buttons === 1 : n.detail === 0 && !n.pointerType;
}
function r0(n) {
  return Hp ? !1 : !ap && n.width === 0 && n.height === 0 || ap && n.width === 1 && n.height === 1 && n.pressure === 0 && n.detail === 0 && n.pointerType === "mouse" || // iOS VoiceOver returns 0.333• for width/height.
  n.width < 1 && n.height < 1 && n.pressure === 0 && n.detail === 0 && n.pointerType === "touch";
}
function or(n, o) {
  const a = ["mouse", "pen"];
  return o || a.push("", void 0), a.includes(n);
}
function sR(n) {
  const o = n.type;
  return o === "click" || o === "mousedown" || o === "keydown" || o === "keyup";
}
const ip = "data-base-ui-focusable", a0 = "input:not([type='hidden']):not([disabled]),[contenteditable]:not([contenteditable='false']),textarea:not([disabled])", Lc = "ArrowLeft", Ic = "ArrowRight", i0 = "ArrowUp", Ip = "ArrowDown";
function vn(n) {
  let o = n.activeElement;
  for (; o?.shadowRoot?.activeElement != null; )
    o = o.shadowRoot.activeElement;
  return o;
}
function Le(n, o) {
  if (!n || !o)
    return !1;
  const a = o.getRootNode?.();
  if (n.contains(o))
    return !0;
  if (a && ta(a)) {
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
function bc(n, o) {
  if (!$e(n))
    return !1;
  const a = n;
  if (o.hasElement(a))
    return !a.hasAttribute("data-trigger-disabled");
  for (const [, i] of o.entries())
    if (Le(i, a))
      return !i.hasAttribute("data-trigger-disabled");
  return !1;
}
function Ud(n, o) {
  if (o == null)
    return !1;
  if ("composedPath" in n)
    return n.composedPath().includes(o);
  const a = n;
  return a.target != null && o.contains(a.target);
}
function cR(n) {
  return n.matches("html,body");
}
function Bc(n) {
  return Ct(n) && n.matches(a0);
}
function uR(n) {
  return n?.closest(`button,a[href],[role="button"],select,[tabindex]:not([tabindex="-1"]),${a0}`) != null;
}
function sp(n) {
  return n ? n.getAttribute("role") === "combobox" && Bc(n) : !1;
}
function fR(n) {
  if (!n || Hp)
    return !0;
  try {
    return n.matches(":focus-visible");
  } catch {
    return !0;
  }
}
function xc(n) {
  return n ? n.hasAttribute(ip) ? n : n.querySelector(`[${ip}]`) || n : null;
}
function dR(n, o) {
  return o != null && !or(o) ? 0 : typeof n == "function" ? n() : n;
}
function la(n, o, a) {
  const i = dR(n, a);
  return typeof i == "number" ? i : i?.[o];
}
function _v(n) {
  return typeof n == "function" ? n() : n;
}
function s0(n, o) {
  return o || n === "click" || n === "mousedown";
}
function pR(n) {
  return n?.includes("mouse") && n !== "mousedown";
}
const Do = "none", Xl = "trigger-press", Pt = "trigger-hover", Jr = "trigger-focus", Vc = "outside-press", $r = "item-press", c0 = "close-press", Ro = "focus-out", Ti = "escape-key", cp = "list-navigation", u0 = "cancel-open", si = "sibling-open", gR = "disabled", Pc = "imperative-action", mR = "window-resize";
function Ye(n, o, a, i) {
  let u = !1, f = !1;
  const p = i ?? xt;
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
const f0 = /* @__PURE__ */ y.createContext({
  hasProvider: !1,
  timeoutMs: 0,
  delayRef: {
    current: 0
  },
  initialDelayRef: {
    current: 0
  },
  timeout: new el(),
  currentIdRef: {
    current: null
  },
  currentContextRef: {
    current: null
  }
});
function hR(n, o) {
  n.current = o.current;
}
function yR(n) {
  const {
    children: o,
    delay: a,
    timeoutMs: i = 0
  } = n, u = y.useRef(a), f = y.useRef(a), p = y.useRef(null), g = y.useRef(null), m = sn();
  return xe(() => {
    if (f.current = a, !p.current) {
      u.current = a;
      return;
    }
    u.current = {
      open: la(u.current, "open"),
      close: la(a, "close")
    };
  }, [a, p, u, f]), /* @__PURE__ */ x.jsx(f0.Provider, {
    value: y.useMemo(() => ({
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
function vR(n, o = {
  open: !1
}) {
  const {
    open: a
  } = o, i = "rootStore" in n ? n.rootStore : n, u = i.useState("floatingId"), f = y.useContext(f0), {
    currentIdRef: p,
    delayRef: g,
    timeoutMs: m,
    initialDelayRef: d,
    currentContextRef: v,
    hasProvider: b,
    timeout: S
  } = f, [C, w] = y.useState(!1), A = y.useRef(a), T = y.useRef(!1);
  return xe(() => {
    A.current = a;
  }, [a]), xe(() => () => {
    T.current = !0;
  }, []), xe(() => {
    function z() {
      T.current || w(!1), v.current?.setIsInstantPhase(!1), p.current = null, v.current = null, g.current = d.current, S.clear();
    }
    if (p.current && !a && p.current === u) {
      if (w(!1), m) {
        const M = u;
        return S.start(m, () => {
          i.select("open") || p.current && p.current !== M || z();
        }), () => {
          (A.current || p.current !== M) && S.clear();
        };
      }
      z();
    }
  }, [a, u, p, g, m, d, v, S, i]), xe(() => {
    if (!a)
      return;
    const z = v.current, M = p.current;
    S.clear(), v.current = {
      onOpenChange: i.setOpen,
      setIsInstantPhase: w
    }, p.current = u, g.current = {
      open: 0,
      close: la(d.current, "close")
    }, M !== null && M !== u ? (w(!0), z?.setIsInstantPhase(!0), z?.onOpenChange(!1, Ye(Do))) : (w(!1), z?.setIsInstantPhase(!1));
  }, [a, u, i, p, g, d, v, S]), xe(() => () => {
    if (p.current === u) {
      if (v.current = null, !A.current)
        return;
      p.current = null, hR(g, d), S.clear();
    }
  }, [v, p, g, u, d, S]), y.useMemo(() => ({
    hasProvider: b,
    delayRef: g,
    isInstantPhase: C
  }), [b, g, C]);
}
function pl(...n) {
  return () => {
    for (let o = 0; o < n.length; o += 1) {
      const a = n[o];
      a && a();
    }
  };
}
function Yt(n) {
  const o = xn(bR, n).current;
  return o.next = n, xe(o.effect), o;
}
function bR(n) {
  const o = {
    current: n,
    next: n,
    effect: () => {
      o.current = o.next;
    }
  };
  return o;
}
const d0 = {
  clipPath: "inset(50%)",
  overflow: "hidden",
  whiteSpace: "nowrap",
  border: 0,
  padding: 0,
  width: 1,
  height: 1,
  margin: -1
}, p0 = {
  ...d0,
  position: "fixed",
  top: 0,
  left: 0
}, xR = {
  ...d0,
  position: "absolute"
}, Co = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const [i, u] = y.useState();
  xe(() => {
    $T && zo && u("button");
  }, []);
  const f = {
    tabIndex: 0,
    // Role is only for VoiceOver
    role: i
  };
  return /* @__PURE__ */ x.jsx("span", {
    ...o,
    ref: a,
    style: p0,
    "aria-hidden": i ? void 0 : !0,
    ...f,
    "data-base-ui-focus-guard": ""
  });
}), SR = ["top", "right", "bottom", "left"], oa = Math.min, Pl = Math.max, Sc = Math.round, Qs = Math.floor, Yl = (n) => ({
  x: n,
  y: n
}), wR = {
  left: "right",
  right: "left",
  bottom: "top",
  top: "bottom"
};
function g0(n, o, a) {
  return Pl(n, oa(o, a));
}
function Fl(n, o) {
  return typeof n == "function" ? n(o) : n;
}
function Ln(n) {
  return n.split("-")[0];
}
function No(n) {
  return n.split("-")[1];
}
function Bp(n) {
  return n === "x" ? "y" : "x";
}
function Vp(n) {
  return n === "y" ? "height" : "width";
}
function Wn(n) {
  const o = n[0];
  return o === "t" || o === "b" ? "y" : "x";
}
function Pp(n) {
  return Bp(Wn(n));
}
function ER(n, o, a) {
  a === void 0 && (a = !1);
  const i = No(n), u = Pp(n), f = Vp(u);
  let p = u === "x" ? i === (a ? "end" : "start") ? "right" : "left" : i === "start" ? "bottom" : "top";
  return o.reference[f] > o.floating[f] && (p = wc(p)), [p, wc(p)];
}
function TR(n) {
  const o = wc(n);
  return [up(n), o, up(o)];
}
function up(n) {
  return n.includes("start") ? n.replace("start", "end") : n.replace("end", "start");
}
const Hv = ["left", "right"], Uv = ["right", "left"], RR = ["top", "bottom"], CR = ["bottom", "top"];
function OR(n, o, a) {
  switch (n) {
    case "top":
    case "bottom":
      return a ? o ? Uv : Hv : o ? Hv : Uv;
    case "left":
    case "right":
      return o ? RR : CR;
    default:
      return [];
  }
}
function MR(n, o, a, i) {
  const u = No(n);
  let f = OR(Ln(n), a === "start", i);
  return u && (f = f.map((p) => p + "-" + u), o && (f = f.concat(f.map(up)))), f;
}
function wc(n) {
  const o = Ln(n);
  return wR[o] + n.slice(o.length);
}
function AR(n) {
  var o, a, i, u;
  return {
    top: (o = n.top) != null ? o : 0,
    right: (a = n.right) != null ? a : 0,
    bottom: (i = n.bottom) != null ? i : 0,
    left: (u = n.left) != null ? u : 0
  };
}
function m0(n) {
  return typeof n != "number" ? AR(n) : {
    top: n,
    right: n,
    bottom: n,
    left: n
  };
}
function xi(n) {
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
function uc(n, o) {
  return Bl(n.current, {
    disabledIndices: o
  });
}
function fp(n, o) {
  return Bl(n.current, {
    decrement: !0,
    startingIndex: n.current.length,
    disabledIndices: o
  });
}
function Bl(n, {
  startingIndex: o = -1,
  decrement: a = !1,
  disabledIndices: i,
  amount: u = 1
} = {}) {
  let f = o;
  do
    f += a ? -u : u;
  while (f >= 0 && f <= n.length - 1 && Ec(n, f, i));
  return f;
}
function Ec(n, o, a) {
  if (typeof a == "function" ? a(o) : a?.includes(o) ?? !1)
    return !0;
  const u = n[o];
  return u ? Yc(u) ? !a && (u.hasAttribute("disabled") || u.getAttribute("aria-disabled") === "true") : !0 : !1;
}
function zR(n) {
  return n.visibility === "hidden" || n.visibility === "collapse";
}
function Yc(n, o = n ? In(n) : null) {
  return !n || !n.isConnected || !o || zR(o) ? !1 : typeof n.checkVisibility == "function" ? n.checkVisibility() : o.display !== "none" && o.display !== "contents";
}
const DR = 'a[href],button,input,select,textarea,summary,details,iframe,object,embed,[tabindex],[contenteditable]:not([contenteditable="false"]),audio[controls],video[controls]';
function NR(n) {
  const o = n.assignedSlot;
  if (o)
    return o;
  if (n.parentElement)
    return n.parentElement;
  const a = n.getRootNode();
  return ta(a) ? a.host : null;
}
function dp(n) {
  for (const o of Array.from(n.children))
    if (mn(o) === "summary")
      return o;
  return null;
}
function jR(n, o) {
  const a = dp(o);
  return !!a && (n === a || Le(a, n));
}
function h0(n) {
  const o = n ? mn(n) : "";
  return n != null && n.matches(DR) && (o !== "summary" || n.parentElement != null && mn(n.parentElement) === "details" && dp(n.parentElement) === n) && (o !== "details" || dp(n) == null) && (o !== "input" || n.type !== "hidden");
}
function y0(n) {
  if (!h0(n) || !n.isConnected || n.matches(":disabled"))
    return !1;
  for (let o = n; o; o = NR(o)) {
    const a = o !== n, i = mn(o) === "slot";
    if (o.hasAttribute("inert") || a && mn(o) === "details" && !o.open && !jR(n, o) || o.hasAttribute("hidden") || !i && !kR(o, a))
      return !1;
  }
  return !0;
}
function kR(n, o) {
  const a = In(n);
  return o ? a.display !== "none" : Yc(n, a);
}
function v0(n) {
  const o = n.tabIndex;
  if (o < 0) {
    const a = mn(n);
    if (a === "details" || a === "audio" || a === "video" || Ct(n) && n.isContentEditable)
      return 0;
  }
  return o;
}
function Ld(n) {
  if (mn(n) !== "input")
    return null;
  const o = n;
  return o.type === "radio" && o.name !== "" ? o : null;
}
function _R(n, o) {
  const a = Ld(n);
  if (!a)
    return !0;
  const i = o.find((u) => {
    const f = Ld(u);
    return f?.name === a.name && f.form === a.form && f.checked;
  });
  return i ? i === a : o.find((u) => {
    const f = Ld(u);
    return f?.name === a.name && f.form === a.form;
  }) === a;
}
function b0(n) {
  if (Ct(n) && mn(n) === "slot") {
    const o = n.assignedElements({
      flatten: !0
    });
    if (o.length > 0)
      return o;
  }
  return Ct(n) && n.shadowRoot ? Array.from(n.shadowRoot.children) : Array.from(n.children);
}
function x0(n, o) {
  b0(n).forEach((a) => {
    h0(a) && o.push(a), x0(a, o);
  });
}
function S0(n, o, a) {
  b0(n).forEach((i) => {
    Ct(i) && i.matches(o) && a.push(i), S0(i, o, a);
  });
}
function Yp(n) {
  return y0(n) && v0(n) >= 0;
}
function w0(n) {
  const o = [];
  return x0(n, o), o.filter(y0);
}
function Ri(n) {
  const o = w0(n);
  return o.filter((a) => v0(a) >= 0 && _R(a, o));
}
function E0(n, o) {
  const a = Ri(n), i = a.length;
  if (i === 0)
    return;
  const u = vn(tt(n)), f = a.indexOf(u), p = f === -1 ? o === 1 ? 0 : i - 1 : f + o;
  return a[p];
}
function Gp(n) {
  return E0(tt(n).body, 1) || n;
}
function T0(n) {
  return E0(tt(n).body, -1) || n;
}
function R0(n, o) {
  if (!n)
    return null;
  const a = Ri(tt(n).body), i = a.length;
  if (i === 0)
    return null;
  const u = a.indexOf(n);
  if (u === -1)
    return null;
  const f = (u + o + i) % i;
  return a[f];
}
function HR(n) {
  return R0(n, 1);
}
function UR(n) {
  return R0(n, -1);
}
function Wr(n, o) {
  const a = o || n.currentTarget, i = n.relatedTarget;
  return !i || !Le(a, i);
}
function LR(n) {
  Ri(n).forEach((a) => {
    a.dataset.tabindex = a.getAttribute("tabindex") || "", a.setAttribute("tabindex", "-1");
  });
}
function Lv(n) {
  const o = [];
  S0(n, "[data-tabindex]", o), o.forEach((a) => {
    const i = a.dataset.tabindex;
    delete a.dataset.tabindex, i ? a.setAttribute("tabindex", i) : a.removeAttribute("tabindex");
  });
}
function Oo(n, o, a = !0) {
  return n.filter((u) => u.parentId === o).flatMap((u) => [...!a || u.context?.open ? [u] : [], ...Oo(n, u.id, a)]);
}
function Iv(n, o) {
  let a = [], i = n.find((u) => u.id === o)?.parentId;
  for (; i; ) {
    const u = n.find((f) => f.id === i);
    i = u?.parentId, u && (a = a.concat(u));
  }
  return a;
}
function Si(n) {
  return `data-base-ui-${n}`;
}
let Zs = 0;
function fc(n, o = {}) {
  const {
    preventScroll: a = !1,
    sync: i = !1,
    shouldFocus: u
  } = o;
  cancelAnimationFrame(Zs);
  function f() {
    u && !u() || n?.focus({
      preventScroll: a
    });
  }
  if (i)
    return f(), an;
  const p = requestAnimationFrame(f);
  return Zs = p, () => {
    Zs === p && (cancelAnimationFrame(p), Zs = 0);
  };
}
const Id = {
  inert: /* @__PURE__ */ new WeakMap(),
  "aria-hidden": /* @__PURE__ */ new WeakMap()
}, Bv = "data-base-ui-inert", pp = {
  inert: /* @__PURE__ */ new WeakSet(),
  "aria-hidden": /* @__PURE__ */ new WeakSet()
};
let li = /* @__PURE__ */ new WeakMap(), Bd = 0;
function IR(n) {
  return pp[n];
}
function C0(n) {
  return n ? ta(n) ? n.host : C0(n.parentNode) : null;
}
const Vv = (n, o) => o.map((a) => {
  if (n.contains(a))
    return a;
  const i = C0(a);
  return n.contains(i) ? i : null;
}).filter((a) => a != null), Pv = (n) => {
  const o = /* @__PURE__ */ new Set();
  return n.forEach((a) => {
    let i = a;
    for (; i && !o.has(i); )
      o.add(i), i = i.parentNode;
  }), o;
}, Yv = (n, o, a) => {
  const i = [], u = (f) => {
    !f || a.has(f) || Array.from(f.children).forEach((p) => {
      mn(p) !== "script" && (o.has(p) ? u(p) : i.push(p));
    });
  };
  return u(n), i;
};
function BR(n, o, a, i, {
  mark: u = !0
}) {
  let f = null;
  i ? f = "inert" : a && (f = "aria-hidden");
  let p = null, g = null;
  const m = Vv(o, n), d = u ? Yv(o, Pv(m), new Set(m)) : [], v = [], b = [];
  if (f) {
    const S = Id[f], C = IR(f);
    g = C, p = S;
    const w = Vv(o, Array.from(o.querySelectorAll("[aria-live]"))), A = m.concat(w);
    Yv(o, Pv(A), new Set(A)).forEach((z) => {
      const M = z.getAttribute(f), D = M !== null && M !== "false", N = (S.get(z) || 0) + 1;
      S.set(z, N), v.push(z), N === 1 && D && C.add(z), D || z.setAttribute(f, f === "inert" ? "" : "true");
    });
  }
  return u && d.forEach((S) => {
    const C = (li.get(S) || 0) + 1;
    li.set(S, C), b.push(S), C === 1 && S.setAttribute(Bv, "");
  }), Bd += 1, () => {
    p && v.forEach((S) => {
      const w = (p.get(S) || 0) - 1;
      p.set(S, w), w || (!g?.has(S) && f && S.removeAttribute(f), g?.delete(S));
    }), u && b.forEach((S) => {
      const C = (li.get(S) || 0) - 1;
      li.set(S, C), C || S.removeAttribute(Bv);
    }), Bd -= 1, Bd || (Id.inert = /* @__PURE__ */ new WeakMap(), Id["aria-hidden"] = /* @__PURE__ */ new WeakMap(), pp.inert = /* @__PURE__ */ new WeakSet(), pp["aria-hidden"] = /* @__PURE__ */ new WeakSet(), li = /* @__PURE__ */ new WeakMap());
  };
}
function Gv(n, o = {}) {
  const {
    ariaHidden: a = !1,
    inert: i = !1,
    mark: u = !0
  } = o, f = tt(n[0]).body;
  return BR(n, f, a, i, {
    mark: u
  });
}
var gl = Ab();
let qv = 0;
function VR(n, o = "mui") {
  const [a, i] = y.useState(n), u = n || a;
  return y.useEffect(() => {
    a == null && (qv += 1, i(`${o}-${qv}`));
  }, [a, o]), u;
}
const Xv = Op.useId;
function rr(n, o) {
  if (Xv !== void 0) {
    const a = Xv();
    return n ?? (o ? `${o}-${a}` : a);
  }
  return VR(n, o);
}
const PR = 500, O0 = 500, YR = {
  style: {
    transition: "none"
  }
}, M0 = "data-base-ui-click-trigger", A0 = {
  fallbackAxisSide: "none"
}, qp = {
  fallbackAxisSide: "end"
}, GR = {
  clipPath: "inset(50%)",
  position: "fixed",
  top: 0,
  left: 0
}, z0 = /* @__PURE__ */ y.createContext(null), D0 = () => y.useContext(z0), qR = Si("portal");
function N0(n = {}) {
  const {
    ref: o,
    container: a,
    componentProps: i = xt,
    elementProps: u
  } = n, f = rr(), g = D0()?.portalNode, [m, d] = y.useState(null), [v, b] = y.useState(null), S = ze((T) => {
    T !== null && b(T);
  }), C = y.useRef(null);
  xe(() => {
    if (a === null) {
      C.current && (C.current = null, b(null), d(null));
      return;
    }
    if (f == null)
      return;
    const T = (a && (Tp(a) ? a : a.current)) ?? g ?? document.body;
    if (T == null) {
      C.current && (C.current = null, b(null), d(null));
      return;
    }
    C.current !== T && (C.current = T, b(null), d(T));
  }, [a, g, f]);
  const w = nt("div", i, {
    ref: [o, S],
    props: [{
      id: f,
      [qR]: ""
    }, u]
  });
  return {
    portalNode: v,
    portalSubtree: m && w ? /* @__PURE__ */ gl.createPortal(w, m) : null
  };
}
const Gc = /* @__PURE__ */ y.forwardRef(function(o, a) {
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
    portalSubtree: b
  } = N0({
    container: g,
    ref: a,
    componentProps: o,
    elementProps: d
  }), S = y.useRef(null), C = y.useRef(null), w = y.useRef(null), A = y.useRef(null), [T, z] = y.useState(null), M = y.useRef(!1), D = T?.modal, N = T?.open, L = typeof m == "boolean" ? m : !!T && !T.modal && T.open && !!v;
  y.useEffect(() => {
    if (!v || D)
      return;
    function H(k) {
      v && k.relatedTarget && Wr(k) && (k.type === "focusin" ? M.current && (Lv(v), M.current = !1) : (LR(v), M.current = !0));
    }
    return pl(Je(v, "focusin", H, !0), Je(v, "focusout", H, !0));
  }, [v, D]), xe(() => {
    !v || N !== !0 || !M.current || (Lv(v), M.current = !1);
  }, [N, v]);
  const j = y.useMemo(() => ({
    beforeOutsideRef: S,
    afterOutsideRef: C,
    beforeInsideRef: w,
    afterInsideRef: A,
    portalNode: v,
    setFocusManagerState: z
  }), [v]);
  return /* @__PURE__ */ x.jsxs(y.Fragment, {
    children: [b, /* @__PURE__ */ x.jsxs(z0.Provider, {
      value: j,
      children: [L && v && /* @__PURE__ */ x.jsx(Co, {
        "data-type": "outside",
        ref: S,
        onFocus: (H) => {
          if (Wr(H, v))
            w.current?.focus();
          else {
            const k = T ? T.domReference : null;
            T0(k)?.focus();
          }
        }
      }), L && v && /* @__PURE__ */ x.jsx("span", {
        "aria-owns": v.id,
        style: GR
      }), v && /* @__PURE__ */ gl.createPortal(p, v), L && v && /* @__PURE__ */ x.jsx(Co, {
        "data-type": "outside",
        ref: C,
        onFocus: (H) => {
          if (Wr(H, v))
            A.current?.focus();
          else {
            const k = T ? T.domReference : null;
            Gp(k)?.focus(), T?.closeOnFocusOut && T?.onOpenChange(!1, Ye(Ro, H.nativeEvent));
          }
        }
      })]
    })]
  });
});
function j0() {
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
class Xp {
  nodesRef = {
    current: []
  };
  events = j0();
  addNode(o) {
    this.nodesRef.current.push(o);
  }
  removeNode(o) {
    const a = this.nodesRef.current.findIndex((i) => i === o);
    a !== -1 && this.nodesRef.current.splice(a, 1);
  }
}
const k0 = /* @__PURE__ */ y.createContext(null), _0 = /* @__PURE__ */ y.createContext(null), Ql = () => y.useContext(k0)?.id || null, jo = (n) => {
  const o = y.useContext(_0);
  return n ?? o;
};
function Fp(n) {
  const o = rr(), a = jo(n), i = Ql();
  return xe(() => {
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
function H0(n) {
  const {
    children: o,
    id: a
  } = n, i = Ql();
  return /* @__PURE__ */ x.jsx(k0.Provider, {
    value: y.useMemo(() => ({
      id: a,
      parentId: i
    }), [a, i]),
    children: o
  });
}
function U0(n) {
  const {
    children: o,
    externalTree: a
  } = n, i = xn(() => a ?? new Xp()).current;
  return /* @__PURE__ */ x.jsx(_0.Provider, {
    value: i,
    children: o
  });
}
function Ll(n) {
  return n == null ? n : "current" in n ? n.current : n;
}
function XR(n, o) {
  const a = Dt(gn(n));
  return n instanceof a.KeyboardEvent ? "keyboard" : n instanceof a.FocusEvent ? o || "keyboard" : "pointerType" in n ? n.pointerType || "keyboard" : "touches" in n ? "touch" : n instanceof a.MouseEvent ? o || (n.detail === 0 ? "keyboard" : "mouse") : "";
}
const Fv = 20;
let Eo = [];
function Kp() {
  Eo = Eo.filter((n) => n.deref()?.isConnected);
}
function Kv(n) {
  Kp(), n && mn(n) !== "body" && (Eo.push(new WeakRef(n)), Eo.length > Fv && (Eo = Eo.slice(-Fv)));
}
function Qv() {
  return Kp(), Eo[Eo.length - 1]?.deref();
}
function FR(n) {
  return n ? Yp(n) ? n : Ri(n)[0] || n : null;
}
function Zv(n) {
  if (n.hasAttribute("tabindex") && !n.hasAttribute("data-tabindex") || !n.getAttribute("role")?.includes("dialog"))
    return;
  const a = w0(n).filter((u) => {
    const f = u.getAttribute("data-tabindex") || "";
    return Yp(u) || u.hasAttribute("data-tabindex") && !f.startsWith("-");
  }), i = n.getAttribute("tabindex");
  a.length === 0 ? i !== "0" && (n.setAttribute("tabindex", "0"), n.setAttribute("data-tabindex", "0")) : (i !== "-1" || n.hasAttribute("data-tabindex") && n.getAttribute("data-tabindex") !== "-1") && (n.setAttribute("tabindex", "-1"), n.setAttribute("data-tabindex", "-1"));
}
function qc(n) {
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
    previousFocusableElement: b,
    beforeContentFocusGuardRef: S,
    externalTree: C,
    getInsideElements: w
  } = n, A = "rootStore" in o ? o.rootStore : o, T = A.useState("open"), z = A.useState("domReferenceElement"), M = A.useState("floatingElement"), {
    events: D,
    dataRef: N
  } = A.context, L = ze(() => N.current.floatingContext?.nodeId), j = u === !1, H = sp(z) && j, k = Yt(u), G = Yt(f), E = Yt(d), Z = Yt(T), J = jo(C), X = D0(), K = y.useRef(!1), q = y.useRef(!1), _ = y.useRef(!1), Y = y.useRef(null), V = y.useRef(""), Q = y.useRef(""), B = y.useRef(null), O = y.useRef(null), U = To(B, S, X?.beforeInsideRef), ne = To(O, X?.afterInsideRef), $ = sn(), re = sn(), ie = na(), oe = X != null, se = xc(M), ge = ze((fe = se) => fe ? Ri(fe) : []), je = ze(() => w?.().filter((fe) => fe != null) ?? []);
  y.useEffect(() => {
    if (i || !g)
      return;
    function fe(Re) {
      Re.key === "Tab" && Le(se, vn(tt(se))) && ge().length === 0 && !H && fl(Re);
    }
    const ye = tt(se);
    return Je(ye, "keydown", fe);
  }, [i, se, g, H, ge]), y.useEffect(() => {
    if (i || !T)
      return;
    const fe = tt(se);
    function ye() {
      _.current = !1;
    }
    function Re(ke) {
      const we = gn(ke), Ce = je(), he = Le(M, we) || Le(z, we) || Le(X?.portalNode, we) || Ce.some((Se) => Se === we || Le(Se, we));
      _.current = !he, Q.current = ke.pointerType || "keyboard", we?.closest(`[${M0}]`) && (q.current = !0, re.start(0, () => {
        q.current = !1;
      }));
    }
    function _e() {
      Q.current = "keyboard";
    }
    return pl(
      Je(fe, "pointerdown", Re, !0),
      Je(fe, "pointerup", ye, !0),
      Je(fe, "pointercancel", ye, !0),
      Je(fe, "keydown", _e, !0),
      // Avoid a stale `true` leaking into the next open (e.g. keep-mounted popups)
      // if the popup dismissed between pointerdown and pointerup.
      ye
    );
  }, [i, M, z, se, T, X, re, je]), y.useEffect(() => {
    if (i || !m)
      return;
    const fe = tt(se);
    function ye() {
      q.current = !0, re.start(0, () => {
        q.current = !1;
      });
    }
    function Re(Ce) {
      const he = gn(Ce);
      Yp(he) && (Y.current = he);
    }
    function _e(Ce) {
      const he = Ce.relatedTarget, Se = Ce.currentTarget, Te = gn(Ce);
      g && he == null && Te != null && Le(M, Te) && Kv(Te), queueMicrotask(() => {
        const Oe = L(), He = A.context.triggerElements, ae = je(), pe = he?.hasAttribute(Si("focus-guard")) && [B.current, O.current, X?.beforeInsideRef.current, X?.afterInsideRef.current, X?.beforeOutsideRef.current, X?.afterOutsideRef.current, Ll(b), Ll(v)].includes(he), Ue = !(Le(z, he) || Le(M, he) || Le(he, M) || Le(X?.portalNode, he) || ae.some((ve) => ve === he || Le(ve, he)) || he != null && He.hasElement(he) || He.hasMatchingElement((ve) => Le(ve, he)) || pe || J && (Oo(J.nodesRef.current, Oe).find((ve) => Le(ve.context?.elements.floating, he) || Le(ve.context?.elements.domReference, he)) || Iv(J.nodesRef.current, Oe).find((ve) => [ve.context?.elements.floating, xc(ve.context?.elements.floating)].includes(he) || ve.context?.elements.domReference === he)));
        if (Se === z && se && Zv(se), p && Se !== z && !Yc(Te) && vn(fe) === fe.body) {
          if (Ct(se) && (se.focus(), p === "popup")) {
            ie.request(() => {
              se.focus();
            });
            return;
          }
          const ve = ge(), be = Y.current, We = (be && ve.includes(be) ? be : null) || ve[ve.length - 1] || se;
          Ct(We) && We.focus();
        }
        if (N.current.insideReactTree) {
          N.current.insideReactTree = !1;
          return;
        }
        (H || !g) && he && Ue && !q.current && // Fix React 18 Strict Mode returnFocus due to double rendering.
        // For an "untrapped" typeable combobox (input role=combobox with
        // initialFocus=false), re-opening the popup and tabbing out should still close it even
        // when the previously focused element (e.g. the next tabbable outside the popup) is
        // focused again. Otherwise, the popup remains open on the second Tab sequence:
        // click input -> Tab (closes) -> click input -> Tab.
        // Allow closing when `isUntrappedTypeableCombobox` regardless of the previously focused element.
        (H || he !== Qv()) && (K.current = !0, A.setOpen(!1, Ye(Ro, Ce)));
      });
    }
    function ke() {
      _.current || (N.current.insideReactTree = !0, $.start(0, () => {
        N.current.insideReactTree = !1;
      }));
    }
    const we = Ct(z) ? z : null;
    if (!(!M && !we))
      return pl(we && Je(we, "focusout", _e), we && Je(we, "pointerdown", ye), M && Je(M, "focusin", Re), M && Je(M, "focusout", _e), M && X && Je(M, "focusout", ke, !0));
  }, [i, z, M, se, g, J, X, A, m, p, ge, H, L, N, $, re, ie, v, b, je]), y.useEffect(() => {
    if (i || !M || !T)
      return;
    const fe = Array.from(X?.portalNode?.querySelectorAll(`[${Si("portal")}]`) || []), Re = (J ? Iv(J.nodesRef.current, L()) : []).find((Se) => sp(Se.context?.elements.domReference || null))?.context?.elements.domReference, ke = [...[M, ...fe, B.current, O.current, X?.beforeOutsideRef.current, X?.afterOutsideRef.current, ...je()], Re, Ll(b), Ll(v), H ? z : null].filter((Se) => Se != null), we = Gv(ke, {
      ariaHidden: g || H,
      mark: !1
    }), Ce = [M, ...fe].filter((Se) => Se != null), he = Gv(Ce);
    return () => {
      he(), we();
    };
  }, [T, i, z, M, g, X, H, J, L, v, b, je]), xe(() => {
    if (!T || i || !Ct(se))
      return;
    const fe = tt(se), ye = vn(fe);
    queueMicrotask(() => {
      const Re = k.current, _e = typeof Re == "function" ? Re(E.current || "") : Re;
      if (_e === void 0 || _e === !1 || Le(se, ye))
        return;
      let we = null;
      const Ce = () => (we == null && (we = ge(se)), we[0] || se);
      let he;
      _e === !0 || _e === null ? he = Ce() : he = Ll(_e), he = he || Ce();
      const Se = Le(se, vn(fe));
      fc(he, {
        preventScroll: he === se,
        shouldFocus() {
          if (!Z.current)
            return !1;
          if (Se)
            return !0;
          const Te = vn(fe);
          return !(Te !== he && Le(se, Te));
        }
      });
    });
  }, [i, T, se, ge, k, E, Z]), xe(() => {
    if (i || !se)
      return;
    const fe = tt(se), ye = vn(fe), Re = E.current == null;
    Kv(ye);
    function _e(we) {
      if (we.open || (V.current = XR(we.nativeEvent, Q.current)), we.reason === Pt && we.nativeEvent.type === "mouseleave" && (K.current = !0), we.reason === Vc)
        if (we.nested)
          K.current = !1;
        else if (Lp(we.nativeEvent) || r0(we.nativeEvent))
          K.current = !1;
        else {
          let Ce = !1;
          tt(se).createElement("div").focus({
            get preventScroll() {
              return Ce = !0, !1;
            }
          }), Ce ? K.current = !1 : K.current = !0;
        }
    }
    D.on("openchange", _e);
    function ke() {
      const we = G.current;
      let Ce = typeof we == "function" ? we(V.current) : we;
      if (Ce === void 0 || Ce === !1)
        return null;
      Ce === null && (Ce = !0);
      const he = z?.isConnected ? z : null, Se = ye?.isConnected && mn(ye) !== "body" ? ye : null;
      let Te = Re ? Se || he : he || Se;
      return Te || (Te = Qv() || null), typeof Ce == "boolean" ? Te : Ll(Ce) || Te || null;
    }
    return () => {
      D.off("openchange", _e);
      const we = vn(fe), Ce = je(), he = Le(M, we) || Ce.some((Oe) => Oe === we || Le(Oe, we)) || J && Oo(J.nodesRef.current, L(), !1).some((Oe) => Le(Oe.context?.elements.floating, we)), Se = G.current, Te = ke();
      queueMicrotask(() => {
        const Oe = FR(Te), He = typeof Se != "boolean";
        Se && !K.current && Ct(Oe) && // If the focus moved somewhere else after mount, avoid returning focus
        // since it likely entered a different element which should be
        // respected: https://github.com/floating-ui/floating-ui/issues/2607
        (!(!He && Oe !== we && we !== fe.body) || he) && Oe.focus({
          preventScroll: !0
        }), K.current = !1;
      });
    };
  }, [i, M, se, G, E, D, J, z, L, je]), xe(() => {
    if (!zo || T || !M)
      return;
    const fe = vn(tt(M));
    !Ct(fe) || !Bc(fe) || Le(M, fe) && fe.blur();
  }, [T, M]), xe(() => {
    if (!(i || !X))
      return X.setFocusManagerState({
        modal: g,
        closeOnFocusOut: m,
        open: T,
        onOpenChange: A.setOpen,
        domReference: z
      }), () => {
        X.setFocusManagerState(null);
      };
  }, [i, X, g, T, A, m, z]), xe(() => {
    if (!(i || !se))
      return Zv(se), () => {
        queueMicrotask(Kp);
      };
  }, [i, se]);
  const Ee = !i && (g ? !H : !0) && (oe || g);
  return /* @__PURE__ */ x.jsxs(y.Fragment, {
    children: [Ee && /* @__PURE__ */ x.jsx(Co, {
      "data-type": "inside",
      ref: U,
      onFocus: (fe) => {
        if (g) {
          const ye = ge();
          fc(ye[ye.length - 1]);
        } else X?.portalNode && (K.current = !1, Wr(fe, X.portalNode) ? Gp(z)?.focus() : Ll(b ?? X.beforeOutsideRef)?.focus());
      }
    }), a, Ee && /* @__PURE__ */ x.jsx(Co, {
      "data-type": "inside",
      ref: ne,
      onFocus: (fe) => {
        g ? fc(ge()[0]) : X?.portalNode && (m && (K.current = !0), Wr(fe, X.portalNode) ? T0(z)?.focus() : Ll(v ?? X.afterOutsideRef)?.focus());
      }
    })]
  });
}
function Xc(n, o = {}) {
  const {
    enabled: a = !0,
    event: i = "click",
    toggle: u = !0,
    ignoreMouse: f = !1,
    stickIfOpen: p = !0,
    touchOpenDelay: g = 0,
    reason: m = Xl
  } = o, d = "rootStore" in n ? n.rootStore : n, v = d.context.dataRef, b = y.useRef(void 0), S = na(), C = sn(), w = y.useMemo(() => {
    function A(z, M, D, N) {
      const L = Ye(m, M, D);
      z && N === "touch" && g > 0 ? C.start(g, () => {
        d.setOpen(!0, L);
      }) : d.setOpen(z, L);
    }
    function T(z, M, D) {
      const N = v.current.openEvent, L = d.select("domReferenceElement") !== M;
      return z && L || !z || !u ? !0 : N && p ? !D(N.type) : !1;
    }
    return {
      onPointerDown(z) {
        b.current = z.pointerType;
      },
      onMouseDown(z) {
        const M = b.current, D = z.nativeEvent, N = d.select("open");
        if (z.button !== 0 || i === "click" || or(M, !0) && f)
          return;
        const L = T(N, z.currentTarget, (k) => k === "click" || k === "mousedown"), j = gn(D);
        if (Bc(j)) {
          A(L, D, j, M);
          return;
        }
        const H = z.currentTarget;
        S.request(() => {
          A(L, D, H, M);
        });
      },
      onClick(z) {
        if (i === "mousedown-only")
          return;
        const M = b.current;
        if (i === "mousedown" && M) {
          b.current = void 0;
          return;
        }
        if (or(M, !0) && f)
          return;
        const D = d.select("open"), N = T(D, z.currentTarget, (L) => L === "click" || L === "mousedown" || L === "keydown" || L === "keyup");
        A(N, z.nativeEvent, z.currentTarget, M);
      },
      onKeyDown() {
        b.current = void 0;
      }
    };
  }, [v, i, f, m, d, p, u, S, C, g]);
  return y.useMemo(() => a ? {
    reference: w
  } : xt, [a, w]);
}
function KR(n, o) {
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
      let d = f.width, v = f.height, b = f.x, S = f.y;
      return a == null && o.x && p && (a = f.x - o.x), i == null && o.y && g && (i = f.y - o.y), b -= a || 0, S -= i || 0, d = 0, v = 0, !u || m ? (d = o.axis === "y" ? f.width : 0, v = o.axis === "x" ? f.height : 0, b = p && o.x != null ? o.x : b, S = g && o.y != null ? o.y : S) : u && !m && (v = o.axis === "x" ? f.height : v, d = o.axis === "y" ? f.width : d), u = !0, {
        width: d,
        height: v,
        x: b,
        y: S,
        top: S,
        right: b + d,
        bottom: S + v,
        left: b
      };
    }
  };
}
function Jv(n) {
  return n != null && n.clientX != null;
}
function QR(n, o = {}) {
  const {
    enabled: a = !0,
    axis: i = "both"
  } = o, u = "rootStore" in n ? n.rootStore : n, f = u.useState("open"), p = u.useState("floatingElement"), g = u.useState("domReferenceElement"), m = u.context.dataRef, d = y.useRef(!1), v = y.useRef(null), [b, S] = y.useState(), [C, w] = y.useState([]), A = ze((N) => {
    u.set("positionReference", N);
  }), T = ze((N, L, j) => {
    d.current || m.current.openEvent && !Jv(m.current.openEvent) || u.set("positionReference", KR(j ?? g, {
      x: N,
      y: L,
      axis: i,
      dataRef: m,
      pointerType: b
    }));
  }), z = ze((N) => {
    f ? v.current || (T(N.clientX, N.clientY, N.currentTarget), w([])) : T(N.clientX, N.clientY, N.currentTarget);
  }), M = or(b) ? p : f;
  y.useEffect(() => {
    if (!a) {
      A(g);
      return;
    }
    if (!M)
      return;
    function N() {
      v.current?.(), v.current = null;
    }
    const L = Dt(p);
    function j(H) {
      const k = gn(H);
      Le(p, k) ? N() : T(H.clientX, H.clientY);
    }
    return !m.current.openEvent || Jv(m.current.openEvent) ? v.current = Je(L, "mousemove", j) : A(g), N;
  }, [M, a, p, m, g, u, T, A, C]), y.useEffect(() => () => {
    u.set("positionReference", null);
  }, [u]), y.useEffect(() => {
    a && !p && (d.current = !1);
  }, [a, p]), y.useEffect(() => {
    !a && f && (d.current = !0);
  }, [a, f]);
  const D = y.useMemo(() => {
    function N(L) {
      S(L.pointerType);
    }
    return {
      onPointerDown: N,
      onPointerEnter: N,
      onMouseMove: z,
      onMouseEnter: z
    };
  }, [z]);
  return y.useMemo(() => a ? {
    reference: D,
    trigger: D
  } : {}, [a, D]);
}
function ZR() {
  return !1;
}
function JR(n) {
  return {
    escapeKey: typeof n == "boolean" ? n : n?.escapeKey ?? !1,
    outsidePress: typeof n == "boolean" ? n : n?.outsidePress ?? !0
  };
}
function Ci(n, o = {}) {
  const {
    enabled: a = !0,
    escapeKey: i = !0,
    outsidePress: u = !0,
    outsidePressEvent: f = "sloppy",
    referencePress: p = ZR,
    bubbles: g,
    externalTree: m
  } = o, d = "rootStore" in n ? n.rootStore : n, v = d.useState("open"), b = d.useState("floatingElement"), {
    dataRef: S
  } = d.context, C = jo(m), w = ze(typeof u == "function" ? u : () => !1), A = typeof u == "function" ? w : u, T = A !== !1, z = ze(() => f), {
    escapeKey: M,
    outsidePress: D
  } = JR(g), N = y.useRef(!1), L = y.useRef(!1), j = y.useRef(!1), H = y.useRef(!1), k = y.useRef(""), G = y.useRef(null), E = sn(), Z = sn(), J = ze(() => {
    Z.clear(), S.current.insideReactTree = !1;
  }), X = ze((U) => {
    const ne = S.current.floatingContext?.nodeId;
    return (C ? Oo(C.nodesRef.current, ne) : []).some((re) => re.context?.open && !re.context.dataRef.current[U]);
  }), K = ze((U) => Ud(U, d.select("floatingElement")) || Ud(U, d.select("domReferenceElement"))), q = ze((U) => {
    p() && d.setOpen(!1, Ye(Xl, U.nativeEvent));
  }), _ = ze((U) => {
    if (!v || !a || !i || U.key !== "Escape" || H.current || !M && X("__escapeKeyBubbles"))
      return;
    const ne = iR(U) ? U.nativeEvent : U, $ = Ye(Ti, ne);
    d.setOpen(!1, $), $.isCanceled || U.preventDefault(), !M && !$.isPropagationAllowed && U.stopPropagation();
  }), Y = ze(() => {
    S.current.insideReactTree = !0, Z.start(0, J);
  }), V = ze((U) => {
    if (!v || !a || U.button !== 0)
      return;
    const ne = gn(U.nativeEvent);
    Le(d.select("floatingElement"), ne) && (N.current || (N.current = !0, L.current = !1));
  }), Q = ze((U) => {
    !v || !a || (U.defaultPrevented || U.nativeEvent.defaultPrevented) && N.current && (L.current = !0);
  });
  y.useEffect(() => {
    if (!v || !a)
      return;
    S.current.__escapeKeyBubbles = M, S.current.__outsidePressBubbles = D;
    const U = new el(), ne = new el();
    function $() {
      U.clear(), H.current = !0;
    }
    function re() {
      U.start(
        // 0ms or 1ms don't work in Safari. 5ms appears to consistently work.
        // Only apply to WebKit for the test to remain 0ms.
        zo ? 5 : 0,
        () => {
          H.current = !1;
        }
      );
    }
    function ie() {
      j.current = !0, ne.start(0, () => {
        j.current = !1;
      });
    }
    function oe() {
      N.current = !1, L.current = !1;
    }
    function se() {
      const ae = k.current, pe = ae === "pen" || !ae ? "mouse" : ae, Ue = z(), ve = typeof Ue == "function" ? Ue() : Ue;
      return typeof ve == "string" ? ve : ve[pe];
    }
    function ge(ae) {
      const pe = se();
      return pe === "intentional" && ae.type !== "click" || pe === "sloppy" && ae.type === "click";
    }
    function je(ae) {
      const pe = S.current.floatingContext?.nodeId, Ue = C && Oo(C.nodesRef.current, pe).some((ve) => Ud(ae, ve.context?.elements.floating));
      return K(ae) || Ue;
    }
    function Ee(ae) {
      if (ge(ae)) {
        ae.type !== "click" && !K(ae) && (ne.clear(), j.current = !1), J();
        return;
      }
      if (S.current.insideReactTree) {
        J();
        return;
      }
      const pe = gn(ae), Ue = `[${Si("inert")}]`, ve = $e(pe) ? pe.getRootNode() : null, be = Array.from((ta(ve) ? ve : tt(d.select("floatingElement"))).querySelectorAll(Ue)), We = d.context.triggerElements;
      if (pe && (We.hasElement(pe) || We.hasMatchingElement((pt) => Le(pt, pe))))
        return;
      let rt = $e(pe) ? pe : null;
      for (; rt && !Vl(rt); ) {
        const pt = Gl(rt);
        if (Vl(pt) || !$e(pt))
          break;
        rt = pt;
      }
      if (!(be.length && $e(pe) && !cR(pe) && // Clicked on a direct ancestor (e.g. FloatingOverlay).
      !Le(pe, d.select("floatingElement")) && // If the target root element contains none of the markers, then the
      // element was injected after the floating element rendered.
      be.every((pt) => !Le(rt, pt)))) {
        if (Ct(pe) && !("touches" in ae)) {
          const pt = Vl(pe), Nt = In(pe), et = /auto|scroll/, gt = pt || et.test(Nt.overflowX), zt = pt || et.test(Nt.overflowY), yt = gt && pe.clientWidth > 0 && pe.scrollWidth > pe.clientWidth, Mn = zt && pe.clientHeight > 0 && pe.scrollHeight > pe.clientHeight, An = Nt.direction === "rtl", Qe = Mn && (An ? ae.offsetX <= pe.offsetWidth - pe.clientWidth : ae.offsetX > pe.clientWidth), ft = yt && ae.offsetY > pe.clientHeight;
          if (Qe || ft)
            return;
        }
        if (!je(ae)) {
          if (se() === "intentional" && j.current) {
            ne.clear(), j.current = !1;
            return;
          }
          typeof A == "function" && !A(ae) || X("__outsidePressBubbles") || (d.setOpen(!1, Ye(Vc, ae)), J());
        }
      }
    }
    function fe(ae) {
      se() !== "sloppy" || ae.pointerType === "touch" || !d.select("open") || !a || K(ae) || Ee(ae);
    }
    function ye(ae) {
      if (se() !== "sloppy" || !d.select("open") || !a || K(ae))
        return;
      const pe = ae.touches[0];
      pe && (G.current = {
        startTime: Date.now(),
        startX: pe.clientX,
        startY: pe.clientY,
        dismissOnTouchEnd: !1,
        dismissOnMouseDown: !0
      }, E.start(1e3, () => {
        G.current && (G.current.dismissOnTouchEnd = !1, G.current.dismissOnMouseDown = !1);
      }));
    }
    function Re(ae, pe) {
      const Ue = gn(ae);
      if (!Ue)
        return;
      const ve = Je(Ue, ae.type, () => {
        pe(ae), ve();
      });
    }
    function _e(ae) {
      k.current = "touch", Re(ae, ye);
    }
    function ke(ae) {
      E.clear(), ae.type === "pointerdown" && (k.current = ae.pointerType), !(ae.type === "mousedown" && G.current && !G.current.dismissOnMouseDown) && Re(ae, (pe) => {
        pe.type === "pointerdown" ? fe(pe) : Ee(pe);
      });
    }
    function we(ae) {
      if (!N.current)
        return;
      const pe = L.current;
      if (oe(), se() === "intentional") {
        if (ae.type === "pointercancel") {
          pe && ie();
          return;
        }
        if (!je(ae)) {
          if (pe) {
            ie();
            return;
          }
          typeof A == "function" && !A(ae) || (ne.clear(), j.current = !0, J());
        }
      }
    }
    function Ce(ae) {
      if (se() !== "sloppy" || !G.current || K(ae))
        return;
      const pe = ae.touches[0];
      if (!pe)
        return;
      const Ue = Math.abs(pe.clientX - G.current.startX), ve = Math.abs(pe.clientY - G.current.startY), be = Math.sqrt(Ue * Ue + ve * ve);
      be > 5 && (G.current.dismissOnTouchEnd = !0), be > 10 && (Ee(ae), E.clear(), G.current = null);
    }
    function he(ae) {
      Re(ae, Ce);
    }
    function Se(ae) {
      se() !== "sloppy" || !G.current || K(ae) || (G.current.dismissOnTouchEnd && Ee(ae), E.clear(), G.current = null);
    }
    function Te(ae) {
      Re(ae, Se);
    }
    const Oe = tt(b), He = pl(i && pl(Je(Oe, "keydown", _), Je(Oe, "compositionstart", $), Je(Oe, "compositionend", re)), T && pl(Je(Oe, "click", ke, !0), Je(Oe, "pointerdown", ke, !0), Je(Oe, "pointerup", we, !0), Je(Oe, "pointercancel", we, !0), Je(Oe, "mousedown", ke, !0), Je(Oe, "mouseup", we, !0), Je(Oe, "touchstart", _e, !0), Je(Oe, "touchmove", he, !0), Je(Oe, "touchend", Te, !0)));
    return () => {
      He(), U.clear(), ne.clear(), oe(), j.current = !1;
    };
  }, [S, b, i, T, A, v, a, M, D, _, J, z, X, K, C, d, E]), y.useEffect(J, [A, J]);
  const B = y.useMemo(() => ({
    onKeyDown: _,
    onPointerDown: q,
    onClick: q
  }), [_, q]), O = y.useMemo(() => ({
    onKeyDown: _,
    // `onMouseDown` may be blocked if `event.preventDefault()` is called in
    // `onPointerDown`, such as with <NumberField.ScrubArea>.
    // See https://github.com/mui/base-ui/pull/3379
    onPointerDown: Q,
    onMouseDown: Q,
    onClickCapture: Y,
    onMouseDownCapture(U) {
      Y(), V(U);
    },
    onPointerDownCapture(U) {
      Y(), V(U);
    },
    onMouseUpCapture: Y,
    onTouchEndCapture: Y,
    onTouchMoveCapture: Y
  }), [_, Y, V, Q]);
  return y.useMemo(() => a ? {
    reference: B,
    floating: O,
    trigger: B
  } : {}, [a, B, O]);
}
function $v(n, o, a) {
  let {
    reference: i,
    floating: u
  } = n;
  const f = Wn(o), p = Pp(o), g = Vp(p), m = Ln(o), d = f === "y", v = i.x + i.width / 2 - u.width / 2, b = i.y + i.height / 2 - u.height / 2, S = i[g] / 2 - u[g] / 2;
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
        y: b
      };
      break;
    case "left":
      C = {
        x: i.x - u.width,
        y: b
      };
      break;
    default:
      C = {
        x: i.x,
        y: i.y
      };
  }
  const w = No(o);
  return w && (C[p] += S * (w === "end" ? 1 : -1) * (a && d ? -1 : 1)), C;
}
async function $R(n, o) {
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
    elementContext: b = "floating",
    altBoundary: S = !1,
    padding: C = 0
  } = Fl(o, n), w = m0(C), T = g[S ? b === "floating" ? "reference" : "floating" : b], z = xi(await f.getClippingRect({
    element: (a = await (f.isElement == null ? void 0 : f.isElement(T))) == null || a ? T : T.contextElement || await (f.getDocumentElement == null ? void 0 : f.getDocumentElement(g.floating)),
    boundary: d,
    rootBoundary: v,
    strategy: m
  })), M = b === "floating" ? {
    x: i,
    y: u,
    width: p.floating.width,
    height: p.floating.height
  } : p.reference, D = await (f.getOffsetParent == null ? void 0 : f.getOffsetParent(g.floating)), N = await (f.isElement == null ? void 0 : f.isElement(D)) && await (f.getScale == null ? void 0 : f.getScale(D)) || {
    x: 1,
    y: 1
  }, L = xi(f.convertOffsetParentRelativeRectToViewportRelativeRect ? await f.convertOffsetParentRelativeRectToViewportRelativeRect({
    elements: g,
    rect: M,
    offsetParent: D,
    strategy: m
  }) : M);
  return {
    top: (z.top - L.top + w.top) / N.y,
    bottom: (L.bottom - z.bottom + w.bottom) / N.y,
    left: (z.left - L.left + w.left) / N.x,
    right: (L.right - z.right + w.right) / N.x
  };
}
const WR = 50, eC = async (n, o, a) => {
  const {
    placement: i = "bottom",
    strategy: u = "absolute",
    middleware: f = [],
    platform: p
  } = a, g = p.detectOverflow ? p : {
    ...p,
    detectOverflow: $R
  }, m = await (p.isRTL == null ? void 0 : p.isRTL(o));
  let d = await p.getElementRects({
    reference: n,
    floating: o,
    strategy: u
  }), {
    x: v,
    y: b
  } = $v(d, i, m), S = i, C = 0;
  const w = {};
  for (let A = 0; A < f.length; A++) {
    const T = f[A];
    if (!T)
      continue;
    const {
      name: z,
      fn: M
    } = T, {
      x: D,
      y: N,
      data: L,
      reset: j
    } = await M({
      x: v,
      y: b,
      initialPlacement: i,
      placement: S,
      strategy: u,
      middlewareData: w,
      rects: d,
      platform: g,
      elements: {
        reference: n,
        floating: o
      }
    });
    v = D ?? v, b = N ?? b, w[z] = {
      ...w[z],
      ...L
    }, j && C < WR && (C++, typeof j == "object" && (j.placement && (S = j.placement), j.rects && (d = j.rects === !0 ? await p.getElementRects({
      reference: n,
      floating: o,
      strategy: u
    }) : j.rects), {
      x: v,
      y: b
    } = $v(d, S, m)), A = -1);
  }
  return {
    x: v,
    y: b,
    placement: S,
    strategy: u,
    middlewareData: w
  };
}, tC = function(n) {
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
        crossAxis: b = !0,
        fallbackPlacements: S,
        fallbackStrategy: C = "bestFit",
        fallbackAxisSideDirection: w = "none",
        flipAlignment: A = !0,
        ...T
      } = Fl(n, o);
      if ((a = f.arrow) != null && a.alignmentOffset)
        return {};
      const z = Ln(u), M = Wn(g), D = Ln(g) === g, N = await (m.isRTL == null ? void 0 : m.isRTL(d.floating)), L = S || (D || !A ? [wc(g)] : TR(g)), j = w !== "none";
      !S && j && L.push(...MR(g, A, w, N));
      const H = [g, ...L], k = await m.detectOverflow(o, T), G = [];
      let E = ((i = f.flip) == null ? void 0 : i.overflows) || [];
      if (v && G.push(k[z]), b) {
        const K = ER(u, p, N);
        G.push(k[K[0]], k[K[1]]);
      }
      if (E = [...E, {
        placement: u,
        overflows: G
      }], !G.every((K) => K <= 0)) {
        var Z, J;
        const K = (((Z = f.flip) == null ? void 0 : Z.index) || 0) + 1, q = H[K];
        if (q && (!(b === "alignment" ? M !== Wn(q) : !1) || // We leave the current main axis only if every placement on that axis
        // overflows the main axis.
        E.every((V) => Wn(V.placement) === M ? V.overflows[0] > 0 : !0)))
          return {
            data: {
              index: K,
              overflows: E
            },
            reset: {
              placement: q
            }
          };
        let _ = (J = E.filter((Y) => Y.overflows[0] <= 0).sort((Y, V) => Y.overflows[1] - V.overflows[1])[0]) == null ? void 0 : J.placement;
        if (!_)
          switch (C) {
            case "bestFit": {
              var X;
              const Y = (X = E.filter((V) => {
                if (j) {
                  const Q = Wn(V.placement);
                  return Q === M || // Create a bias to the `y` side axis due to horizontal
                  // reading directions favoring greater width.
                  Q === "y";
                }
                return !0;
              }).map((V) => [V.placement, V.overflows.filter((Q) => Q > 0).reduce((Q, B) => Q + B, 0)]).sort((V, Q) => V[1] - Q[1])[0]) == null ? void 0 : X[0];
              Y && (_ = Y);
              break;
            }
            case "initialPlacement":
              _ = g;
              break;
          }
        if (u !== _)
          return {
            reset: {
              placement: _
            }
          };
      }
      return {};
    }
  };
};
function Wv(n, o) {
  return {
    top: n.top - o.height,
    right: n.right - o.width,
    bottom: n.bottom - o.height,
    left: n.left - o.width
  };
}
function eb(n) {
  return SR.some((o) => n[o] >= 0);
}
const nC = function(n) {
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
      } = Fl(n, o);
      switch (u) {
        case "referenceHidden": {
          const p = await i.detectOverflow(o, {
            ...f,
            elementContext: "reference"
          }), g = Wv(p, a.reference);
          return {
            data: {
              referenceHiddenOffsets: g,
              referenceHidden: eb(g)
            }
          };
        }
        case "escaped": {
          const p = await i.detectOverflow(o, {
            ...f,
            altBoundary: !0
          }), g = Wv(p, a.floating);
          return {
            data: {
              escapedOffsets: g,
              escaped: eb(g)
            }
          };
        }
        default:
          return {};
      }
    }
  };
}, L0 = /* @__PURE__ */ new Set(["left", "top"]);
async function lC(n, o) {
  const {
    placement: a,
    platform: i,
    elements: u
  } = n, f = await (i.isRTL == null ? void 0 : i.isRTL(u.floating)), p = Ln(a), g = No(a), m = Wn(a) === "y", d = L0.has(p) ? -1 : 1, v = f && m ? -1 : 1, b = Fl(o, n);
  let {
    mainAxis: S,
    crossAxis: C,
    alignmentAxis: w
  } = typeof b == "number" ? {
    mainAxis: b,
    crossAxis: 0,
    alignmentAxis: null
  } : {
    mainAxis: b.mainAxis || 0,
    crossAxis: b.crossAxis || 0,
    alignmentAxis: b.alignmentAxis
  };
  return g && typeof w == "number" && (C = g === "end" ? w * -1 : w), m ? {
    x: C * v,
    y: S * d
  } : {
    x: S * d,
    y: C * v
  };
}
const oC = function(n) {
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
      } = o, m = await lC(o, n);
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
}, rC = function(n) {
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
          fn: (M) => {
            let {
              x: D,
              y: N
            } = M;
            return {
              x: D,
              y: N
            };
          }
        },
        ...d
      } = Fl(n, o), v = {
        x: a,
        y: i
      }, b = await f.detectOverflow(o, d), S = Wn(u), C = Bp(S);
      let w = v[C], A = v[S];
      const T = (M, D) => g0(D + b[M === "y" ? "top" : "left"], D, D - b[M === "y" ? "bottom" : "right"]);
      p && (w = T(C, w)), g && (A = T(S, A));
      const z = m.fn({
        ...o,
        [C]: w,
        [S]: A
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
}, aC = function(n) {
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
        crossAxis: b = !0
      } = Fl(n, o), S = {
        x: u,
        y: f
      }, C = Wn(p), w = Bp(C);
      let A = S[w], T = S[C];
      const z = Fl(d, o), M = typeof z == "number" ? {
        mainAxis: z,
        crossAxis: 0
      } : {
        mainAxis: (a = z.mainAxis) != null ? a : 0,
        crossAxis: (i = z.crossAxis) != null ? i : 0
      };
      if (v) {
        const L = w === "y" ? "height" : "width", j = g.reference[w] - g.floating[L] + M.mainAxis, H = g.reference[w] + g.reference[L] - M.mainAxis;
        A < j ? A = j : A > H && (A = H);
      }
      if (b) {
        var D, N;
        const L = w === "y" ? "width" : "height", j = L0.has(Ln(p)), H = g.reference[C] - g.floating[L] + (j && ((D = m.offset) == null ? void 0 : D[C]) || 0) + (j ? 0 : M.crossAxis), k = g.reference[C] + g.reference[L] + (j ? 0 : ((N = m.offset) == null ? void 0 : N[C]) || 0) - (j ? M.crossAxis : 0);
        T < H ? T = H : T > k && (T = k);
      }
      return {
        [w]: A,
        [C]: T
      };
    }
  };
}, iC = function(n) {
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
      } = Fl(n, o), m = await u.detectOverflow(o, g), d = Ln(a), v = No(a), b = Wn(a) === "y", {
        width: S,
        height: C
      } = i.floating;
      let w, A;
      d === "top" || d === "bottom" ? (w = d, A = v === (await (u.isRTL == null ? void 0 : u.isRTL(f.floating)) ? "start" : "end") ? "left" : "right") : (A = d, w = v === "end" ? "top" : "bottom");
      const T = C - m.top - m.bottom, z = S - m.left - m.right, M = oa(C - m[w], T), D = oa(S - m[A], z), N = o.middlewareData.shift, L = !N;
      let j = M, H = D;
      N != null && N.enabled.x && (H = z), N != null && N.enabled.y && (j = T), L && !v && (b ? H = S - 2 * Pl(m.left, m.right) : j = C - 2 * Pl(m.top, m.bottom)), await p({
        ...o,
        availableWidth: H,
        availableHeight: j
      });
      const k = await u.getDimensions(f.floating);
      return S !== k.width || C !== k.height ? {
        reset: {
          rects: !0
        }
      } : {};
    }
  };
};
function I0(n) {
  const o = In(n);
  let a = parseFloat(o.width) || 0, i = parseFloat(o.height) || 0;
  const u = Ct(n), f = u ? n.offsetWidth : a, p = u ? n.offsetHeight : i, g = Sc(a) !== f || Sc(i) !== p;
  return g && (a = f, i = p), {
    width: a,
    height: i,
    $: g
  };
}
function Qp(n) {
  return $e(n) ? n : n.contextElement;
}
function ea(n) {
  const o = Qp(n);
  if (!Ct(o))
    return Yl(1);
  const a = o.getBoundingClientRect(), {
    width: i,
    height: u,
    $: f
  } = I0(o);
  let p = (f ? Sc(a.width) : a.width) / i, g = (f ? Sc(a.height) : a.height) / u;
  return (!p || !Number.isFinite(p)) && (p = 1), (!g || !Number.isFinite(g)) && (g = 1), {
    x: p,
    y: g
  };
}
const sC = /* @__PURE__ */ Yl(0);
function B0(n) {
  const o = Dt(n);
  return !Cp() || !o.visualViewport ? sC : {
    x: o.visualViewport.offsetLeft,
    y: o.visualViewport.offsetTop
  };
}
function cC(n, o, a) {
  return o === void 0 && (o = !1), !!a && o && a === Dt(n);
}
function ar(n, o, a, i) {
  o === void 0 && (o = !1), a === void 0 && (a = !1);
  const u = n.getBoundingClientRect(), f = Qp(n);
  let p = Yl(1);
  o && (i ? $e(i) && (p = ea(i)) : p = ea(n));
  const g = cC(f, a, i) ? B0(f) : Yl(0);
  let m = (u.left + g.x) / p.x, d = (u.top + g.y) / p.y, v = u.width / p.x, b = u.height / p.y;
  if (f && i) {
    const S = Dt(f), C = $e(i) ? Dt(i) : i;
    let w = S, A = lp(w);
    for (; A && C !== w; ) {
      const T = ea(A), z = A.getBoundingClientRect(), M = In(A), D = z.left + (A.clientLeft + parseFloat(M.paddingLeft)) * T.x, N = z.top + (A.clientTop + parseFloat(M.paddingTop)) * T.y;
      m *= T.x, d *= T.y, v *= T.x, b *= T.y, m += D, d += N, w = Dt(A), A = lp(w);
    }
  }
  return xi({
    width: v,
    height: b,
    x: m,
    y: d
  });
}
function Fc(n, o) {
  const a = _c(n).scrollLeft;
  return o ? o.left + a : ar(Kl(n)).left + a;
}
function V0(n, o) {
  const a = n.getBoundingClientRect(), i = a.left + o.scrollLeft - Fc(n, a), u = a.top + o.scrollTop;
  return {
    x: i,
    y: u
  };
}
function uC(n) {
  let {
    elements: o,
    rect: a,
    offsetParent: i,
    strategy: u
  } = n;
  const f = u === "fixed", p = Kl(i), g = o ? kc(o.floating) : !1;
  if (i === p || g && f)
    return a;
  let m = {
    scrollLeft: 0,
    scrollTop: 0
  }, d = Yl(1);
  const v = Yl(0), b = Ct(i);
  if ((b || !f) && ((mn(i) !== "body" || sr(p)) && (m = _c(i)), b)) {
    const C = ar(i);
    d = ea(i), v.x = C.x + i.clientLeft, v.y = C.y + i.clientTop;
  }
  const S = p && !b && !f ? V0(p, m) : Yl(0);
  return {
    width: a.width * d.x,
    height: a.height * d.y,
    x: a.x * d.x - m.scrollLeft * d.x + v.x + S.x,
    y: a.y * d.y - m.scrollTop * d.y + v.y + S.y
  };
}
function fC(n) {
  return n.getClientRects ? Array.from(n.getClientRects()) : [];
}
function dC(n) {
  const o = _c(n), a = n.ownerDocument.body, i = Pl(n.scrollWidth, n.clientWidth, a.scrollWidth, a.clientWidth), u = Pl(n.scrollHeight, n.clientHeight, a.scrollHeight, a.clientHeight);
  let f = -o.scrollLeft + Fc(n);
  const p = -o.scrollTop;
  return In(a).direction === "rtl" && (f += Pl(n.clientWidth, a.clientWidth) - i), {
    width: i,
    height: u,
    x: f,
    y: p
  };
}
const pC = 25;
function gC(n, o, a) {
  a === void 0 && (a = "viewport");
  const i = a === "layoutViewport", u = Dt(n), f = Kl(n), p = u.visualViewport;
  let g = f.clientWidth, m = f.clientHeight, d = 0, v = 0;
  if (p) {
    const S = !Cp() || o === "fixed";
    i ? S || (d = -p.offsetLeft, v = -p.offsetTop) : (g = p.width, m = p.height, S && (d = p.offsetLeft, v = p.offsetTop));
  }
  if (Fc(f) <= 0) {
    const S = f.ownerDocument, C = S.body, w = getComputedStyle(C), A = S.compatMode === "CSS1Compat" && parseFloat(w.marginLeft) + parseFloat(w.marginRight) || 0, T = Math.abs(f.clientWidth - C.clientWidth - A), z = getComputedStyle(f).scrollbarGutter === "stable both-edges" ? T / 2 : T;
    z <= pC && (g -= z);
  }
  return {
    width: g,
    height: m,
    x: d,
    y: v
  };
}
function mC(n, o) {
  const a = ar(n, !0, o === "fixed"), i = a.top + n.clientTop, u = a.left + n.clientLeft, f = ea(n), p = n.clientWidth * f.x, g = n.clientHeight * f.y, m = u * f.x, d = i * f.y;
  return {
    width: p,
    height: g,
    x: m,
    y: d
  };
}
function tb(n, o, a) {
  let i;
  if (o === "viewport" || o === "layoutViewport")
    i = gC(n, a, o);
  else if (o === "document")
    i = dC(Kl(n));
  else if ($e(o))
    i = mC(o, a);
  else {
    const u = B0(n);
    i = {
      x: o.x - u.x,
      y: o.y - u.y,
      width: o.width,
      height: o.height
    };
  }
  return xi(i);
}
function hC(n, o) {
  const a = o.get(n);
  if (a)
    return a;
  let i = vi(n, [], !1).filter((g) => $e(g) && mn(g) !== "body"), u = null;
  const f = In(n).position === "fixed";
  let p = f ? Gl(n) : n;
  for (; $e(p) && !Vl(p); ) {
    const g = In(p), m = Rp(p), d = u ? u.position : f ? "fixed" : "";
    !m && (d === "fixed" || d === "absolute" && g.position === "static") ? i = i.filter((b) => b !== p) : u = g, p = Gl(p);
  }
  return o.set(n, i), i;
}
function yC(n) {
  let {
    element: o,
    boundary: a,
    rootBoundary: i,
    strategy: u
  } = n;
  const p = [...a === "clippingAncestors" ? kc(o) ? [] : hC(o, this._c) : [].concat(a), i], g = tb(o, p[0], u);
  let m = g.top, d = g.right, v = g.bottom, b = g.left;
  for (let S = 1; S < p.length; S++) {
    const C = tb(o, p[S], u);
    m = Pl(C.top, m), d = oa(C.right, d), v = oa(C.bottom, v), b = Pl(C.left, b);
  }
  return {
    width: d - b,
    height: v - m,
    x: b,
    y: m
  };
}
function vC(n) {
  const {
    width: o,
    height: a
  } = I0(n);
  return {
    width: o,
    height: a
  };
}
function bC(n, o, a) {
  const i = Ct(o), u = Kl(o), f = a === "fixed", p = ar(n, !0, f, o);
  let g = {
    scrollLeft: 0,
    scrollTop: 0
  };
  const m = Yl(0);
  if ((i || !f) && ((mn(o) !== "body" || sr(u)) && (g = _c(o)), i)) {
    const S = ar(o, !0, f, o);
    m.x = S.x + o.clientLeft, m.y = S.y + o.clientTop;
  }
  !i && u && (m.x = Fc(u));
  const d = u && !i && !f ? V0(u, g) : Yl(0), v = p.left + g.scrollLeft - m.x - d.x, b = p.top + g.scrollTop - m.y - d.y;
  return {
    x: v,
    y: b,
    width: p.width,
    height: p.height
  };
}
function Vd(n) {
  return In(n).position === "static";
}
function nb(n, o) {
  if (!Ct(n) || In(n).position === "fixed")
    return null;
  if (o)
    return o(n);
  let a = n.offsetParent;
  return Kl(n) === a && (a = a.ownerDocument.body), a;
}
function P0(n, o) {
  const a = Dt(n);
  if (kc(n))
    return a;
  if (!Ct(n)) {
    let u = Gl(n);
    for (; u && !Vl(u); ) {
      if ($e(u) && !Vd(u))
        return u;
      u = Gl(u);
    }
    return a;
  }
  let i = nb(n, o);
  for (; i && OE(i) && Vd(i); )
    i = nb(i, o);
  return i && Vl(i) && Vd(i) && !Rp(i) ? a : i || zE(n) || a;
}
const xC = async function(n) {
  const o = this.getOffsetParent || P0, a = this.getDimensions, i = await a(n.floating);
  return {
    reference: bC(n.reference, await o(n.floating), n.strategy),
    floating: {
      x: 0,
      y: 0,
      width: i.width,
      height: i.height
    }
  };
};
function SC(n) {
  return In(n).direction === "rtl";
}
const Y0 = {
  convertOffsetParentRelativeRectToViewportRelativeRect: uC,
  getDocumentElement: Kl,
  getClippingRect: yC,
  getOffsetParent: P0,
  getElementRects: xC,
  getClientRects: fC,
  getDimensions: vC,
  getScale: ea,
  isElement: $e,
  isRTL: SC
};
function G0(n, o) {
  return n.x === o.x && n.y === o.y && n.width === o.width && n.height === o.height;
}
function wC(n, o, a) {
  let i = null, u;
  const f = Kl(n);
  function p() {
    var v;
    clearTimeout(u), (v = i) == null || v.disconnect(), i = null;
  }
  function g(v, b) {
    v === void 0 && (v = !1), b === void 0 && (b = 1), p();
    const S = n.getBoundingClientRect(), {
      left: C,
      top: w,
      width: A,
      height: T
    } = S;
    if (v || o(), !A || !T)
      return;
    const z = Qs(w), M = Qs(f.clientWidth - (C + A)), D = Qs(f.clientHeight - (w + T)), N = Qs(C), j = {
      rootMargin: -z + "px " + -M + "px " + -D + "px " + -N + "px",
      threshold: Pl(0, oa(1, b)) || 1
    };
    let H = !0;
    function k(G) {
      const E = G[0].intersectionRatio;
      if (!G0(S, n.getBoundingClientRect()))
        return g();
      if (E !== b) {
        if (!H)
          return g();
        E ? g(!1, E) : u = setTimeout(() => {
          g(!1, 1e-7);
        }, 1e3);
      }
      H = !1;
    }
    try {
      i = new IntersectionObserver(k, {
        ...j,
        // Handle <iframe>s
        root: f.ownerDocument
      });
    } catch {
      i = new IntersectionObserver(k, j);
    }
    i.observe(n);
  }
  const m = Dt(n), d = () => g(a);
  return m.addEventListener("resize", d), g(!0), () => {
    m.removeEventListener("resize", d), p();
  };
}
function lb(n, o, a, i) {
  i === void 0 && (i = {});
  const {
    ancestorScroll: u = !0,
    ancestorResize: f = !0,
    elementResize: p = typeof ResizeObserver == "function",
    layoutShift: g = typeof IntersectionObserver == "function",
    animationFrame: m = !1
  } = i, d = Qp(n), v = u || f ? [...d ? vi(d) : [], ...o ? vi(o) : []] : [];
  v.forEach((z) => {
    u && z.addEventListener("scroll", a), f && z.addEventListener("resize", a);
  });
  const b = d && g ? wC(d, a, f) : null;
  let S = -1, C = null;
  p && (C = new ResizeObserver((z) => {
    let [M] = z;
    M && M.target === d && C && o && (C.unobserve(o), cancelAnimationFrame(S), S = requestAnimationFrame(() => {
      var D;
      (D = C) == null || D.observe(o);
    })), a();
  }), d && !m && C.observe(d), o && C.observe(o));
  let w, A = m ? ar(n) : null;
  m && T();
  function T() {
    const z = ar(n);
    A && !G0(A, z) && a(), A = z, w = requestAnimationFrame(T);
  }
  return a(), () => {
    var z;
    v.forEach((M) => {
      u && M.removeEventListener("scroll", a), f && M.removeEventListener("resize", a);
    }), b?.(), (z = C) == null || z.disconnect(), C = null, m && cancelAnimationFrame(w);
  };
}
const EC = oC, TC = rC, RC = tC, CC = iC, OC = nC, MC = aC, AC = (n, o, a) => {
  const i = /* @__PURE__ */ new Map(), u = a ?? {}, f = {
    ...Y0,
    ...u.platform,
    _c: i
  };
  return eC(n, o, {
    ...u,
    platform: f
  });
};
var zC = typeof document < "u", DC = function() {
}, dc = zC ? y.useLayoutEffect : DC;
function Tc(n, o) {
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
        if (!Tc(n[i], o[i]))
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
      if (!(f === "_owner" && n.$$typeof) && !Tc(n[f], o[f]))
        return !1;
    }
    return !0;
  }
  return n !== n && o !== o;
}
function q0(n) {
  return typeof window > "u" ? 1 : (n.ownerDocument.defaultView || window).devicePixelRatio || 1;
}
function ob(n, o) {
  const a = q0(n);
  return Math.round(o * a) / a;
}
function Pd(n) {
  const o = y.useRef(n);
  return dc(() => {
    o.current = n;
  }), o;
}
function NC(n) {
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
  } = n, [v, b] = y.useState({
    x: 0,
    y: 0,
    strategy: a,
    placement: o,
    middlewareData: {},
    isPositioned: !1
  }), [S, C] = y.useState(i);
  Tc(S, i) || C(i);
  const [w, A] = y.useState(null), [T, z] = y.useState(null), M = y.useCallback((V) => {
    V !== j.current && (j.current = V, A(V));
  }, []), D = y.useCallback((V) => {
    V !== H.current && (H.current = V, z(V));
  }, []), N = f || w, L = p || T, j = y.useRef(null), H = y.useRef(null), k = y.useRef(v), G = m != null, E = Pd(m), Z = Pd(u), J = Pd(d), X = y.useCallback(() => {
    if (!j.current || !H.current)
      return;
    const V = {
      placement: o,
      strategy: a,
      middleware: S
    };
    Z.current && (V.platform = Z.current), AC(j.current, H.current, V).then((Q) => {
      const B = {
        ...Q,
        // The floating element's position may be recomputed while it's closed
        // but still mounted (such as when transitioning out). To ensure
        // `isPositioned` will be `false` initially on the next open, avoid
        // setting it to `true` when `open === false` (must be specified).
        isPositioned: J.current !== !1
      };
      K.current && !Tc(k.current, B) && (k.current = B, gl.flushSync(() => {
        b(B);
      }));
    });
  }, [S, o, a, Z, J]);
  dc(() => {
    d === !1 && k.current.isPositioned && (k.current.isPositioned = !1, b((V) => ({
      ...V,
      isPositioned: !1
    })));
  }, [d]);
  const K = y.useRef(!1);
  dc(() => (K.current = !0, () => {
    K.current = !1;
  }), []), dc(() => {
    if (N && (j.current = N), L && (H.current = L), N && L) {
      if (E.current)
        return E.current(N, L, X);
      X();
    }
  }, [N, L, X, E, G]);
  const q = y.useMemo(() => ({
    reference: j,
    floating: H,
    setReference: M,
    setFloating: D
  }), [M, D]), _ = y.useMemo(() => ({
    reference: N,
    floating: L
  }), [N, L]), Y = y.useMemo(() => {
    const V = {
      position: a,
      left: 0,
      top: 0
    };
    if (!_.floating)
      return V;
    const Q = ob(_.floating, v.x), B = ob(_.floating, v.y);
    return g ? {
      ...V,
      transform: "translate(" + Q + "px, " + B + "px)",
      ...q0(_.floating) >= 1.5 && {
        willChange: "transform"
      }
    } : {
      position: a,
      left: Q,
      top: B
    };
  }, [a, g, _.floating, v.x, v.y]);
  return y.useMemo(() => ({
    ...v,
    update: X,
    refs: q,
    elements: _,
    floatingStyles: Y
  }), [v, X, q, _, Y]);
}
const jC = (n, o) => {
  const a = EC(n);
  return {
    name: a.name,
    fn: a.fn,
    options: [n, o]
  };
}, kC = (n, o) => {
  const a = TC(n);
  return {
    name: a.name,
    fn: a.fn,
    options: [n, o]
  };
}, _C = (n, o) => ({
  fn: MC(n).fn,
  options: [n, o]
}), HC = (n, o) => {
  const a = RC(n);
  return {
    name: a.name,
    fn: a.fn,
    options: [n, o]
  };
}, UC = (n, o) => {
  const a = CC(n);
  return {
    name: a.name,
    fn: a.fn,
    options: [n, o]
  };
}, LC = (n, o) => {
  const a = OC(n);
  return {
    name: a.name,
    fn: a.fn,
    options: [n, o]
  };
}, me = (n, o, a, i, u, f, ...p) => {
  if (p.length > 0)
    throw new Error(At(1));
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
var Yd = { exports: {} }, Gd = {};
var rb;
function IC() {
  if (rb) return Gd;
  rb = 1;
  var n = Ei();
  function o(b, S) {
    return b === S && (b !== 0 || 1 / b === 1 / S) || b !== b && S !== S;
  }
  var a = typeof Object.is == "function" ? Object.is : o, i = n.useState, u = n.useEffect, f = n.useLayoutEffect, p = n.useDebugValue;
  function g(b, S) {
    var C = S(), w = i({ inst: { value: C, getSnapshot: S } }), A = w[0].inst, T = w[1];
    return f(
      function() {
        A.value = C, A.getSnapshot = S, m(A) && T({ inst: A });
      },
      [b, C, S]
    ), u(
      function() {
        return m(A) && T({ inst: A }), b(function() {
          m(A) && T({ inst: A });
        });
      },
      [b]
    ), p(C), C;
  }
  function m(b) {
    var S = b.getSnapshot;
    b = b.value;
    try {
      var C = S();
      return !a(b, C);
    } catch {
      return !0;
    }
  }
  function d(b, S) {
    return S();
  }
  var v = typeof window > "u" || typeof window.document > "u" || typeof window.document.createElement > "u" ? d : g;
  return Gd.useSyncExternalStore = n.useSyncExternalStore !== void 0 ? n.useSyncExternalStore : v, Gd;
}
var ab;
function X0() {
  return ab || (ab = 1, Yd.exports = IC()), Yd.exports;
}
var F0 = X0(), qd = { exports: {} }, Xd = {};
var ib;
function BC() {
  if (ib) return Xd;
  ib = 1;
  var n = Ei(), o = X0();
  function a(d, v) {
    return d === v && (d !== 0 || 1 / d === 1 / v) || d !== d && v !== v;
  }
  var i = typeof Object.is == "function" ? Object.is : a, u = o.useSyncExternalStore, f = n.useRef, p = n.useEffect, g = n.useMemo, m = n.useDebugValue;
  return Xd.useSyncExternalStoreWithSelector = function(d, v, b, S, C) {
    var w = f(null);
    if (w.current === null) {
      var A = { hasValue: !1, value: null };
      w.current = A;
    } else A = w.current;
    w = g(
      function() {
        function z(j) {
          if (!M) {
            if (M = !0, D = j, j = S(j), C !== void 0 && A.hasValue) {
              var H = A.value;
              if (C(H, j))
                return N = H;
            }
            return N = j;
          }
          if (H = N, i(D, j)) return H;
          var k = S(j);
          return C !== void 0 && C(H, k) ? (D = j, H) : (D = j, N = k);
        }
        var M = !1, D, N, L = b === void 0 ? null : b;
        return [
          function() {
            return z(v());
          },
          L === null ? void 0 : function() {
            return z(L());
          }
        ];
      },
      [v, b, S, C]
    );
    var T = u(d, w[0], w[1]);
    return p(
      function() {
        A.hasValue = !0, A.value = T;
      },
      [T]
    ), m(T), T;
  }, Xd;
}
var sb;
function VC() {
  return sb || (sb = 1, qd.exports = BC()), qd.exports;
}
var PC = VC();
const gp = [];
let mp;
function YC() {
  return mp;
}
function GC(n) {
  gp.push(n);
}
function Zp(n) {
  const o = (a, i) => {
    const u = xn(qC).current;
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
function K0(n) {
  return /* @__PURE__ */ y.forwardRef(Zp(n));
}
function qC() {
  return {
    didInitialize: !1
  };
}
const XC = Dp(19), FC = XC ? QC : ZC;
function Pe(n, o, a, i, u) {
  return FC(n, o, a, i, u);
}
function KC(n, o, a, i, u) {
  const f = y.useCallback(() => o(n.getSnapshot(), a, i, u), [n, o, a, i, u]);
  return F0.useSyncExternalStore(n.subscribe, f, f);
}
GC({
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
    }), F0.useSyncExternalStore(n.subscribe, n.getSnapshot, n.getSnapshot));
  }
});
function QC(n, o, a, i, u) {
  const f = YC();
  if (!f)
    return KC(n, o, a, i, u);
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
function ZC(n, o, a, i, u) {
  return PC.useSyncExternalStoreWithSelector(n.subscribe, n.getSnapshot, n.getSnapshot, (f) => o(f, a, i, u));
}
class Q0 {
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
    return Pe(this, o, a, i, u);
  }
}
class Oi extends Q0 {
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
    y.useDebugValue(o);
    const i = this;
    xe(() => {
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
    xe(() => (i.state[o] !== a && i.set(o, a), () => {
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
    xe(() => {
      a.update(o);
    }, [a, ...i]);
  }
  /**
   * Registers a controllable prop pair (`controlled`, `defaultValue`) for a specific key. If `controlled`
   * is non-undefined, the store's state at `key` is updated to match `controlled`.
   */
  useControlledProp(o, a) {
    y.useDebugValue(o);
    const i = this, u = a !== void 0;
    xe(() => {
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
    return y.useDebugValue(o), Pe(this, this.selectors[o], a, i, u);
  }
  /**
   * Wraps a function with `useStableCallback` to ensure it has a stable reference
   * and assigns it to the context.
   *
   * @param key Key of the event callback. Must be a function in the context.
   * @param fn Function to assign.
   */
  useContextCallback(o, a) {
    y.useDebugValue(o);
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
    const a = y.useRef(void 0);
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
const JC = {
  open: me((n) => n.open),
  transitionStatus: me((n) => n.transitionStatus),
  domReferenceElement: me((n) => n.domReferenceElement),
  referenceElement: me((n) => n.positionReference ?? n.referenceElement),
  floatingElement: me((n) => n.floatingElement),
  floatingId: me((n) => n.floatingId)
};
class Kc extends Oi {
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
      events: j0(),
      nested: i,
      triggerElements: f
    }, JC), this.syncOnly = a;
  }
  /**
   * Syncs the event used by hover logic to distinguish hover-open from click-like interaction.
   */
  syncOpenEvent = (o, a) => {
    (!o || !this.state.open || // Prevent a pending hover-open from overwriting a click-open event, while allowing
    // click events to upgrade a hover-open.
    a != null && sR(a)) && (this.context.dataRef.current.openEvent = o ? a : void 0);
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
function Z0(n) {
  const {
    popupStore: o,
    treatPopupAsFloatingElement: a = !1,
    floatingRootContext: i,
    floatingId: u,
    nested: f,
    onOpenChange: p
  } = n, g = o.useState("open"), m = o.useState("activeTriggerElement"), d = o.useState(a ? "popupElement" : "positionerElement"), v = o.context.triggerElements, b = p, S = y.useRef(null);
  i === void 0 && S.current === null && (S.current = new Kc({
    open: g,
    transitionStatus: void 0,
    referenceElement: m,
    floatingElement: d,
    triggerElements: v,
    onOpenChange: b,
    floatingId: u,
    syncOnly: !0,
    nested: f
  }));
  const C = i ?? S.current;
  return o.useSyncedValue("floatingId", u), xe(() => {
    const w = {
      open: g,
      floatingId: u,
      referenceElement: m,
      floatingElement: d
    };
    $e(m) && (w.domReferenceElement = m), C.state.positionReference === C.state.referenceElement && (w.positionReference = m), C.update(w);
  }, [g, u, m, d, C]), C.context.onOpenChange = b, C.context.nested = f, C;
}
function Qc(n, o = !1, a = !1) {
  const [i, u] = y.useState(n && o ? "idle" : void 0), [f, p] = y.useState(n);
  return n && !f && (p(!0), u("starting")), !n && f && i !== "ending" && !a && u("ending"), !n && !f && i === "ending" && u(void 0), xe(() => {
    if (!n && f && i !== "ending" && a) {
      const g = dl.request(() => {
        u("ending");
      });
      return () => {
        dl.cancel(g);
      };
    }
  }, [n, f, i, a]), xe(() => {
    if (!n || o)
      return;
    const g = dl.request(() => {
      u(void 0);
    });
    return () => {
      dl.cancel(g);
    };
  }, [o, n]), xe(() => {
    if (!n || !o)
      return;
    n && f && i !== "idle" && u("starting");
    const g = dl.request(() => {
      u("idle");
    });
    return () => {
      dl.cancel(g);
    };
  }, [o, n, f, i]), {
    mounted: f,
    setMounted: p,
    transitionStatus: i
  };
}
let wi = /* @__PURE__ */ (function(n) {
  return n.startingStyle = "data-starting-style", n.endingStyle = "data-ending-style", n;
})({});
const $C = {
  [wi.startingStyle]: ""
}, WC = {
  [wi.endingStyle]: ""
}, ko = {
  transitionStatus(n) {
    return n === "starting" ? $C : n === "ending" ? WC : null;
  }
};
function Jp(n, o = !1, a = !0) {
  const i = na();
  return ze((u, f = null) => {
    i.cancel();
    const p = Ll(n);
    if (p == null)
      return;
    const g = p, m = () => {
      gl.flushSync(u);
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
        !f?.aborted && v.length > 0 && v.some((b) => b.pending || b.playState !== "finished") && d();
      });
    }
    if (o) {
      const v = wi.startingStyle;
      if (!g.hasAttribute(v)) {
        i.request(d);
        return;
      }
      const b = new MutationObserver(() => {
        g.hasAttribute(v) || (b.disconnect(), d());
      });
      b.observe(g, {
        attributes: !0,
        attributeFilter: [v]
      }), f?.addEventListener("abort", () => b.disconnect(), {
        once: !0
      });
      return;
    }
    i.request(d);
  });
}
function Zl(n) {
  const {
    enabled: o = !0,
    open: a,
    ref: i,
    onComplete: u
  } = n, f = ze(u), p = Jp(i, a, !1);
  y.useEffect(() => {
    if (!o)
      return;
    const g = new AbortController();
    return p(f, g.signal), () => {
      g.abort();
    };
  }, [o, a, f, p]);
}
const ia = {
  tabIndex: -1,
  [ip]: ""
};
function J0(n) {
  return (o) => o === "touch" ? n.current : !0;
}
function $p(n, o, a = !1) {
  const i = rr(), u = Ql() != null, f = y.useRef(null);
  n === void 0 && f.current === null && (f.current = o(i, u));
  const p = n ?? f.current;
  return Z0({
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
function $0(n, o) {
  const a = y.useRef(null), i = y.useRef(null);
  return y.useCallback((u) => {
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
function Zc(n, o, a, i = !1) {
  o ? n.preventUnmountingOnClose = !1 : i && (n.preventUnmountingOnClose = !0);
  const u = a?.id ?? null;
  (u || o) && (n.activeTriggerId = u, n.activeTriggerElement = a ?? null);
}
function Wp(n) {
  let o = !1;
  return n.preventUnmountOnClose = () => {
    o = !0;
  }, () => o;
}
function eO(n, o, a, i = {}) {
  const u = a.reason, f = u === Pt, p = o && u === Jr, g = !o && (u === Xl || u === Ti), m = Wp(a);
  if (n.context.onOpenChange?.(o, a), a.isCanceled)
    return;
  i.onBeforeDispatch?.(), n.state.floatingRootContext.dispatchOpenChange(o, a);
  const d = () => {
    const v = {
      ...i.extraState,
      open: o
    };
    p ? v.instantType = "focus" : g ? v.instantType = "dismiss" : f && (v.instantType = void 0), Zc(v, o, a.trigger, m()), n.update(v);
  };
  f ? gl.flushSync(d) : d();
}
function eg(n, o, a, i) {
  kp(() => {
    o === void 0 && n.state.open === !1 && a && (n.state = {
      ...n.state,
      open: !0,
      activeTriggerId: i,
      preventUnmountingOnClose: !1
    });
  });
}
function tg(n, o, a, i) {
  const u = a.useState("isMountedByTrigger", n), f = $0(n, a), p = ze((g) => {
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
  return xe(() => {
    u && a.update({
      activeTriggerElement: o.current,
      ...i
    });
  }, [u, a, o, ...Object.values(i)]), {
    registerTrigger: p,
    isMountedByThisTrigger: u
  };
}
function Jc(n, o = {}) {
  const {
    closeOnActiveTriggerUnmount: a = !1
  } = o, i = n.useState("open"), u = n.useState("triggerCount");
  xe(() => {
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
        const [v, b] = d.value;
        p.activeTriggerId = v, p.activeTriggerElement = b;
      }
    }
    (p.triggerCount !== void 0 || p.activeTriggerId !== void 0 || p.activeTriggerElement !== void 0) && n.update(p), m && a && queueMicrotask(() => {
      if (n.select("open") && n.select("activeTriggerId") === m && !n.context.triggerElements.getById(m)) {
        const d = Ye(Do);
        n.setOpen(!1, d), d.isCanceled || n.update({
          activeTriggerId: null,
          activeTriggerElement: null
        });
      }
    });
  }, [i, n, u, a]);
}
function $c(n, o, a) {
  const {
    mounted: i,
    setMounted: u,
    transitionStatus: f
  } = Qc(n), p = o.useState("preventUnmountingOnClose"), g = n ? !1 : p;
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
  return Zl({
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
function Wc(n, o) {
  n.useSyncedValues(o), xe(() => () => {
    n.update({
      activeTriggerProps: xt,
      inactiveTriggerProps: xt,
      popupProps: xt
    });
  }, [n]);
}
function W0(n, o) {
  xe(() => {
    !o && n.state.openMethod !== null && n.set("openMethod", null);
  }, [o, n]), xe(() => () => {
    n.state.openMethod !== null && n.set("openMethod", null);
  }, [n]);
}
class sa {
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
function tO() {
  return new Kc({
    open: !1,
    transitionStatus: void 0,
    floatingElement: null,
    referenceElement: null,
    triggerElements: new sa(),
    floatingId: void 0,
    syncOnly: !1,
    nested: !1,
    onOpenChange: void 0
  });
}
function eu() {
  return {
    open: !1,
    openProp: void 0,
    mounted: !1,
    transitionStatus: void 0,
    floatingRootContext: tO(),
    floatingId: void 0,
    triggerCount: 0,
    preventUnmountingOnClose: !1,
    payload: void 0,
    activeTriggerId: null,
    activeTriggerElement: null,
    triggerIdProp: void 0,
    popupElement: null,
    positionerElement: null,
    activeTriggerProps: xt,
    inactiveTriggerProps: xt,
    popupProps: xt
  };
}
function ng(n, o, a = !1) {
  return new Kc({
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
const gi = me((n) => n.triggerIdProp ?? n.activeTriggerId), lg = me((n) => n.openProp ?? n.open), cb = me((n) => (n.popupElement?.id ?? n.floatingId) || void 0);
function ex(n, o) {
  return o !== void 0 && lg(n) && gi(n) === o;
}
function nO(n, o) {
  return ex(n, o) ? !0 : o !== void 0 && lg(n) && gi(n) == null && n.triggerCount === 1;
}
const tu = {
  open: lg,
  mounted: me((n) => n.mounted),
  transitionStatus: me((n) => n.transitionStatus),
  floatingRootContext: me((n) => n.floatingRootContext),
  triggerCount: me((n) => n.triggerCount),
  preventUnmountingOnClose: me((n) => n.preventUnmountingOnClose),
  payload: me((n) => n.payload),
  activeTriggerId: gi,
  activeTriggerElement: me((n) => n.mounted ? n.activeTriggerElement : null),
  popupId: cb,
  /**
   * Whether the trigger with the given ID was used to open the popup.
   */
  isTriggerActive: me((n, o) => o !== void 0 && gi(n) === o),
  /**
   * Whether the popup is open and was activated by a trigger with the given ID.
   */
  isOpenedByTrigger: me((n, o) => ex(n, o)),
  /**
   * Whether the popup is mounted and was activated by a trigger with the given ID.
   */
  isMountedByTrigger: me((n, o) => o !== void 0 && gi(n) === o && n.mounted),
  triggerProps: me((n, o) => o ? n.activeTriggerProps : n.inactiveTriggerProps),
  /**
   * Popup id for the trigger that currently owns the open popup.
   */
  triggerPopupId: me((n, o) => nO(n, o) ? cb(n) : void 0),
  popupProps: me((n) => n.popupProps),
  popupElement: me((n) => n.popupElement),
  positionerElement: me((n) => n.positionerElement)
};
function tx(n) {
  const {
    open: o = !1,
    onOpenChange: a,
    elements: i = {}
  } = n, u = rr(), f = Ql() != null, p = xn(() => new Kc({
    open: o,
    transitionStatus: void 0,
    onOpenChange: a,
    referenceElement: i.reference ?? null,
    floatingElement: i.floating ?? null,
    triggerElements: new sa(),
    floatingId: u,
    syncOnly: !1,
    nested: f
  })).current;
  return xe(() => {
    const g = {
      open: o,
      floatingId: u
    };
    i.reference !== void 0 && (g.referenceElement = i.reference, g.domReferenceElement = $e(i.reference) ? i.reference : null), i.floating !== void 0 && (g.floatingElement = i.floating), p.update(g);
  }, [o, u, i.reference, i.floating, p]), p.context.onOpenChange = a, p.context.nested = f, p;
}
function lO(n = {}) {
  const {
    nodeId: o,
    externalTree: a
  } = n, i = tx(n), u = n.rootContext || i, f = u.useState("referenceElement"), p = u.useState("floatingElement"), g = u.useState("domReferenceElement"), m = u.useState("open"), d = u.useState("floatingId"), [v, b] = y.useState(null), [S, C] = y.useState(void 0), [w, A] = y.useState(void 0), T = y.useRef(null), z = jo(a), M = y.useMemo(() => ({
    reference: f,
    floating: p,
    domReference: g
  }), [f, p, g]), D = NC({
    ...n,
    elements: {
      ...M,
      ...v && {
        reference: v
      }
    }
  }), N = $e(S) ? S : null, L = w === void 0 ? u.state.floatingElement : w;
  u.useSyncedValue("referenceElement", S ?? null), u.useSyncedValue("domReferenceElement", S === void 0 ? g : N), u.useSyncedValue("floatingElement", L);
  const j = y.useCallback((J) => {
    const X = $e(J) ? {
      getBoundingClientRect: () => J.getBoundingClientRect(),
      getClientRects: () => J.getClientRects(),
      contextElement: J
    } : J;
    b(X), D.refs.setReference(X);
  }, [D.refs]), H = y.useCallback((J) => {
    ($e(J) || J === null) && (T.current = J, C(J)), ($e(D.refs.reference.current) || D.refs.reference.current === null || // Don't allow setting virtual elements using the old technique back to
    // `null` to support `positionReference` + an unstable `reference`
    // callback ref.
    J !== null && !$e(J)) && D.refs.setReference(J);
  }, [D.refs, C]), k = y.useCallback((J) => {
    A(J), D.refs.setFloating(J);
  }, [D.refs]), G = y.useMemo(() => ({
    ...D.refs,
    setReference: H,
    setFloating: k,
    setPositionReference: j,
    domReference: T
  }), [D.refs, H, k, j]), E = y.useMemo(() => ({
    ...D.elements,
    domReference: g
  }), [D.elements, g]), Z = y.useMemo(() => ({
    ...D,
    dataRef: u.context.dataRef,
    open: m,
    onOpenChange: u.setOpen,
    events: u.context.events,
    floatingId: d,
    refs: G,
    elements: E,
    nodeId: o,
    rootStore: u
  }), [D, G, E, o, u, m, d]);
  return xe(() => {
    g && (T.current = g);
  }, [g]), xe(() => {
    u.context.dataRef.current.floatingContext = Z;
    const J = z?.nodesRef.current.find((X) => X.id === o);
    J && (J.context = Z);
  }), y.useMemo(() => ({
    ...D,
    context: Z,
    refs: G,
    elements: E,
    rootStore: u
  }), [D, G, E, Z, u]);
}
const Fd = _p && zo;
function nx(n, o = {}) {
  const {
    enabled: a = !0,
    delay: i
  } = o, u = "rootStore" in n ? n.rootStore : n, {
    events: f,
    dataRef: p
  } = u.context, g = y.useRef(!1), m = y.useRef(null), d = y.useRef(!0), v = sn();
  y.useEffect(() => {
    const S = u.select("domReferenceElement");
    if (!a)
      return;
    const C = Dt(S);
    function w() {
      const z = u.select("domReferenceElement");
      !u.select("open") && Ct(z) && z === vn(tt(z)) && (g.current = !0);
    }
    function A() {
      d.current = !0;
    }
    function T() {
      d.current = !1;
    }
    return pl(Je(C, "blur", w), Fd && Je(C, "keydown", A, !0), Fd && Je(C, "pointerdown", T, !0));
  }, [u, a]), y.useEffect(() => {
    if (!a)
      return;
    function S(C) {
      if (C.reason === Xl || C.reason === Ti) {
        const w = u.select("domReferenceElement");
        $e(w) && (m.current = w, g.current = !0);
      }
    }
    return f.on("openchange", S), () => {
      f.off("openchange", S);
    };
  }, [f, a, u]);
  const b = y.useMemo(() => {
    function S() {
      g.current = !1, m.current = null;
    }
    return {
      onMouseLeave() {
        S();
      },
      onFocus(C) {
        const w = C.currentTarget;
        if (g.current) {
          if (m.current === w)
            return;
          S();
        }
        const A = gn(C.nativeEvent);
        if ($e(A)) {
          if (Fd && !C.relatedTarget) {
            if (!d.current && !Bc(A))
              return;
          } else if (!fR(A))
            return;
        }
        const T = bc(C.relatedTarget, u.context.triggerElements), {
          nativeEvent: z,
          currentTarget: M
        } = C, D = typeof i == "function" ? i() : i;
        if (u.select("open") && T || D === 0 || D === void 0) {
          u.setOpen(!0, Ye(Jr, z, M));
          return;
        }
        v.start(D, () => {
          g.current || u.setOpen(!0, Ye(Jr, z, M));
        });
      },
      onBlur(C) {
        S();
        const w = C.relatedTarget, A = C.nativeEvent, T = $e(w) && w.hasAttribute(Si("focus-guard")) && w.getAttribute("data-type") === "outside";
        v.start(0, () => {
          const z = u.select("domReferenceElement"), M = vn(tt(z));
          !w && M === z || Le(p.current.floatingContext?.refs.floating.current, M) || Le(z, M) || T || bc(w ?? M, u.context.triggerElements) || u.setOpen(!1, Ye(Jr, A));
        });
      }
    };
  }, [p, i, u, v]);
  return y.useMemo(() => a ? {
    reference: b,
    trigger: b
  } : {}, [a, b]);
}
class og {
  constructor() {
    this.pointerType = void 0, this.interactedInside = !1, this.handler = void 0, this.blockMouseMove = !0, this.performedPointerEventsMutation = !1, this.pointerEventsScopeElement = null, this.pointerEventsReferenceElement = null, this.pointerEventsFloatingElement = null, this.restTimeoutPending = !1, this.openChangeTimeout = new el(), this.restTimeout = new el(), this.handleCloseOptions = void 0;
  }
  static create() {
    return new og();
  }
  dispose = () => {
    this.openChangeTimeout.clear(), this.restTimeout.clear();
  };
  disposeEffect = () => this.dispose;
}
const Rc = /* @__PURE__ */ new WeakMap();
function Cc(n) {
  if (!n.performedPointerEventsMutation)
    return;
  const o = n.pointerEventsScopeElement;
  o && Rc.get(o) === n && (n.pointerEventsScopeElement?.style.removeProperty("pointer-events"), n.pointerEventsReferenceElement?.style.removeProperty("pointer-events"), n.pointerEventsFloatingElement?.style.removeProperty("pointer-events"), Rc.delete(o)), n.performedPointerEventsMutation = !1, n.pointerEventsScopeElement = null, n.pointerEventsReferenceElement = null, n.pointerEventsFloatingElement = null;
}
function lx(n, o) {
  const {
    scopeElement: a,
    referenceElement: i,
    floatingElement: u
  } = o, f = Rc.get(a);
  f && f !== n && Cc(f), Cc(n), n.performedPointerEventsMutation = !0, n.pointerEventsScopeElement = a, n.pointerEventsReferenceElement = i, n.pointerEventsFloatingElement = u, Rc.set(a, n), a.style.pointerEvents = "none", i.style.pointerEvents = "auto", u.style.pointerEvents = "auto";
}
function rg(n) {
  const o = n.context.dataRef.current, a = xn(() => o.hoverInteractionState ?? og.create()).current;
  return o.hoverInteractionState || (o.hoverInteractionState = a), Up(o.hoverInteractionState.disposeEffect), o.hoverInteractionState;
}
function ag(n, o = {}) {
  const {
    enabled: a = !0,
    closeDelay: i = 0,
    nodeId: u
  } = o, f = "rootStore" in n ? n.rootStore : n, p = f.useState("open"), g = f.useState("floatingElement"), m = f.useState("domReferenceElement"), {
    dataRef: d
  } = f.context, v = jo(), b = Ql(), S = rg(f), C = sn(), w = ze(() => s0(d.current.openEvent?.type, S.interactedInside)), A = ze(() => pR(d.current.openEvent?.type)), T = ze(() => {
    Cc(S);
  });
  xe(() => {
    p || (S.pointerType = void 0, S.restTimeoutPending = !1, S.interactedInside = !1, T());
  }, [p, S, T]), y.useEffect(() => T, [T]), xe(() => {
    if (a && p && S.handleCloseOptions?.blockPointerEvents && A() && $e(m) && g) {
      const z = m, M = g, D = tt(g), N = v?.nodesRef.current.find((k) => k.id === b)?.context?.elements.floating;
      N && (N.style.pointerEvents = "");
      const L = S.pointerEventsScopeElement !== M ? S.pointerEventsScopeElement : null, j = N !== M ? N : null, H = S.handleCloseOptions?.getScope?.() ?? L ?? j ?? z.closest("[data-rootownerid]") ?? D.body;
      return lx(S, {
        scopeElement: H,
        referenceElement: z,
        floatingElement: M
      }), () => {
        T();
      };
    }
  }, [a, p, m, g, S, A, v, b, T]), y.useEffect(() => {
    if (!a)
      return;
    function z() {
      return !!(v && b && Oo(v.nodesRef.current, b).length > 0);
    }
    function M(k) {
      const G = la(i, "close", S.pointerType), E = () => {
        f.setOpen(!1, Ye(Pt, k)), v?.events.emit("floating.closed", k);
      };
      G ? S.openChangeTimeout.start(G, E) : (S.openChangeTimeout.clear(), E());
    }
    function D(k) {
      const G = gn(k);
      if (!uR(G)) {
        S.interactedInside = !1;
        return;
      }
      S.interactedInside = G?.closest("[aria-haspopup]") != null;
    }
    function N() {
      S.openChangeTimeout.clear(), C.clear(), v?.events.off("floating.closed", j), T();
    }
    function L(k) {
      if (z() && v) {
        v.events.on("floating.closed", j);
        return;
      }
      if (bc(k.relatedTarget, f.context.triggerElements))
        return;
      const G = d.current.floatingContext?.nodeId ?? u, E = k.relatedTarget;
      if (!(v && G && $e(E) && Oo(v.nodesRef.current, G, !1).some((J) => Le(J.context?.elements.floating, E)))) {
        if (S.handler) {
          S.handler(k);
          return;
        }
        T(), A() && !w() && M(k);
      }
    }
    function j(k) {
      !v || !b || z() || C.start(0, () => {
        v.events.off("floating.closed", j), f.setOpen(!1, Ye(Pt, k)), v.events.emit("floating.closed", k);
      });
    }
    const H = g;
    return pl(H && Je(H, "mouseenter", N), H && Je(H, "mouseleave", L), H && Je(H, "pointerdown", D, !0), () => {
      v?.events.off("floating.closed", j);
    });
  }, [a, g, f, d, i, u, A, w, T, S, v, b, C]);
}
const oO = {
  current: null
};
function nu(n, o = {}) {
  const {
    enabled: a = !0,
    delay: i = 0,
    handleClose: u = null,
    mouseOnly: f = !1,
    restMs: p = 0,
    move: g = !0,
    triggerElementRef: m = oO,
    externalTree: d,
    isActiveTrigger: v = !0,
    getHandleCloseContext: b,
    isClosing: S,
    shouldOpen: C
  } = o, w = "rootStore" in n ? n.rootStore : n, {
    dataRef: A,
    events: T
  } = w.context, z = jo(d), M = rg(w), D = y.useRef(!1), N = Yt(u), L = Yt(i), j = Yt(p), H = Yt(a), k = Yt(C), G = Yt(S), E = ze(() => s0(A.current.openEvent?.type, M.interactedInside)), Z = ze(() => k.current?.() !== !1), J = ze((q, _, Y) => {
    const V = w.context.triggerElements;
    if (V.hasElement(_))
      return !q || !Le(q, _);
    if (!$e(Y))
      return !1;
    const Q = Y;
    return V.hasMatchingElement((B) => Le(B, Q)) && (!q || !Le(q, Q));
  }), X = ze(() => {
    if (!M.handler)
      return;
    tt(w.select("domReferenceElement")).removeEventListener("mousemove", M.handler), M.handler = void 0;
  }), K = ze(() => {
    Cc(M);
  });
  return v && (M.handleCloseOptions = N.current?.__options), y.useEffect(() => X, [X]), y.useEffect(() => {
    if (!a)
      return;
    function q(_) {
      _.open ? D.current = !1 : (D.current = _.reason === Pt, X(), M.openChangeTimeout.clear(), M.restTimeout.clear(), M.blockMouseMove = !0, M.restTimeoutPending = !1);
    }
    return T.on("openchange", q), () => {
      T.off("openchange", q);
    };
  }, [a, T, M, X]), y.useEffect(() => {
    if (!a)
      return;
    function q(Q, B = !0) {
      const O = la(L.current, "close", M.pointerType);
      O ? M.openChangeTimeout.start(O, () => {
        w.setOpen(!1, Ye(Pt, Q)), z?.events.emit("floating.closed", Q);
      }) : B && (M.openChangeTimeout.clear(), w.setOpen(!1, Ye(Pt, Q)), z?.events.emit("floating.closed", Q));
    }
    const _ = m.current ?? (v ? w.select("domReferenceElement") : null);
    if (!$e(_))
      return;
    function Y(Q) {
      if (M.openChangeTimeout.clear(), M.blockMouseMove = !1, f && !or(M.pointerType))
        return;
      const B = _v(j.current), O = la(L.current, "open", M.pointerType), U = gn(Q), ne = Q.currentTarget ?? null, $ = w.select("domReferenceElement");
      let re = ne;
      if ($e(U) && !w.context.triggerElements.hasElement(U)) {
        for (const Re of w.context.triggerElements.elements())
          if (Le(Re, U)) {
            re = Re;
            break;
          }
      }
      $e(ne) && $e($) && !w.context.triggerElements.hasElement(ne) && Le(ne, $) && (re = $);
      const ie = re == null ? !1 : J($, re, U), oe = w.select("open"), se = G.current?.() ?? w.select("transitionStatus") === "ending", ge = !oe && se && D.current, je = !ie && $e(re) && $e($) && Le($, re) && ge, Ee = B > 0 && !O, fe = ie && (oe || ge) || je, ye = !oe || ie;
      if (fe) {
        Z() && w.setOpen(!0, Ye(Pt, Q, re));
        return;
      }
      Ee || (O ? M.openChangeTimeout.start(O, () => {
        ye && Z() && w.setOpen(!0, Ye(Pt, Q, re));
      }) : ye && Z() && w.setOpen(!0, Ye(Pt, Q, re)));
    }
    function V(Q) {
      if (E()) {
        K();
        return;
      }
      X();
      const B = w.select("domReferenceElement"), O = tt(B);
      M.restTimeout.clear(), M.restTimeoutPending = !1;
      const U = A.current.floatingContext ?? b?.();
      if (bc(Q.relatedTarget, w.context.triggerElements))
        return;
      if (N.current && U) {
        w.select("open") || M.openChangeTimeout.clear();
        const $ = m.current;
        M.handler = N.current({
          ...U,
          tree: z,
          x: Q.clientX,
          y: Q.clientY,
          onClose() {
            K(), X(), H.current && !E() && $ === w.select("domReferenceElement") && q(Q, !0);
          }
        }), O.addEventListener("mousemove", M.handler), M.handler(Q);
        return;
      }
      (M.pointerType !== "touch" || !Le(w.select("floatingElement"), Q.relatedTarget)) && q(Q);
    }
    return g ? pl(Je(_, "mousemove", Y, {
      once: !0
    }), Je(_, "mouseenter", Y), Je(_, "mouseleave", V)) : pl(Je(_, "mouseenter", Y), Je(_, "mouseleave", V));
  }, [X, K, A, L, w, a, N, M, v, J, E, f, g, j, m, z, H, b, G, Z]), y.useMemo(() => {
    if (!a)
      return;
    function q(_) {
      M.pointerType = _.pointerType;
    }
    return {
      onPointerDown: q,
      onPointerEnter: q,
      onMouseMove(_) {
        const {
          nativeEvent: Y
        } = _, V = _.currentTarget, Q = w.select("domReferenceElement"), B = w.select("open"), O = J(Q, V, _.target);
        if (f && !or(M.pointerType))
          return;
        if (B && O && M.handleCloseOptions?.blockPointerEvents) {
          const $ = w.select("floatingElement");
          if ($) {
            const re = M.handleCloseOptions?.getScope?.() ?? V.ownerDocument.body;
            lx(M, {
              scopeElement: re,
              referenceElement: V,
              floatingElement: $
            });
          }
        }
        const U = _v(j.current);
        if (B && !O || U === 0 || !O && M.restTimeoutPending && _.movementX ** 2 + _.movementY ** 2 < 2)
          return;
        M.restTimeout.clear();
        function ne() {
          if (M.restTimeoutPending = !1, E())
            return;
          const $ = w.select("open");
          !M.blockMouseMove && (!$ || O) && Z() && w.setOpen(!0, Ye(Pt, Y, V));
        }
        M.pointerType === "touch" ? gl.flushSync(() => {
          ne();
        }) : O && B ? ne() : (M.restTimeoutPending = !0, M.restTimeout.start(U, ne));
      }
    };
  }, [a, M, E, J, f, w, j, Z]);
}
const rO = "Escape";
function lu(n, o, a) {
  switch (n) {
    case "vertical":
      return o;
    case "horizontal":
      return a;
    default:
      return o || a;
  }
}
function Js(n, o) {
  return lu(o, n === i0 || n === Ip, n === Lc || n === Ic);
}
function Kd(n, o, a) {
  return lu(o, n === Ip, a ? n === Lc : n === Ic) || n === "Enter" || n === " " || n === "";
}
function aO(n, o, a) {
  return lu(o, a ? n === Lc : n === Ic, n === Ip);
}
function iO(n, o, a, i) {
  const u = a ? n === Ic : n === Lc, f = n === i0;
  return o === "both" || o === "horizontal" && i ? n === rO : lu(o, u, f);
}
function ox(n, o) {
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
    virtual: b = !1,
    focusItemOnOpen: S = "auto",
    focusItemOnHover: C = !0,
    openOnArrowKeyDown: w = !0,
    disabledIndices: A = void 0,
    orientation: T = "vertical",
    parentOrientation: z,
    id: M,
    resetOnPointerLeave: D = !0,
    externalTree: N,
    grid: L
  } = o, j = L != null, H = "rootStore" in n ? n.rootStore : n, k = H.useState("open"), G = H.useState("floatingElement"), E = H.useState("domReferenceElement"), Z = H.context.dataRef, J = xc(G), X = sp(E), K = Yt(J), q = Ql(), _ = jo(N), Y = y.useRef(S), V = y.useRef(p ?? -1), Q = y.useRef(null), B = y.useRef(!0), O = ze((ae) => {
    u(V.current === -1 ? null : V.current, ae);
  }), U = y.useRef(!!G), ne = y.useRef(k), $ = y.useRef(!1), re = y.useRef(!1), ie = y.useRef(null), oe = Yt(A), se = Yt(k), ge = Yt(p), je = Yt(D), Ee = na(), fe = na(), ye = ze(() => {
    function ae(be) {
      b ? _?.events.emit("virtualfocus", be) : ie.current = fc(be, {
        sync: $.current,
        preventScroll: !0
      });
    }
    const pe = a.current[V.current], Ue = re.current;
    pe && ae(pe), ($.current ? (be) => be() : (be) => Ee.request(be))(() => {
      const be = a.current[V.current] || pe;
      if (!be)
        return;
      pe || ae(be), // eslint-disable-next-line @typescript-eslint/no-use-before-define
      he && (Ue || !B.current) && be.scrollIntoView?.({
        block: "nearest",
        inline: "nearest"
      });
    });
  });
  xe(() => {
    Z.current.orientation = T;
  }, [Z, T]), xe(() => {
    f && (k && G ? (V.current = p ?? -1, Y.current && p != null && (re.current = !0, O())) : U.current && (V.current = -1, O()));
  }, [f, k, G, p, O]), xe(() => {
    if (f) {
      if (!k) {
        $.current = !1;
        return;
      }
      if (G)
        if (i == null) {
          if ($.current = !1, ge.current != null)
            return;
          if (U.current && (V.current = -1, ye()), (!ne.current || !U.current) && Y.current && (Q.current != null || Y.current === !0 && Q.current == null)) {
            let ae = 0;
            const pe = () => {
              a.current[0] == null ? (ae < 2 && (ae ? (ve) => fe.request(ve) : queueMicrotask)(pe), ae += 1) : (V.current = Q.current == null || Kd(Q.current, T, v) || d ? uc(a) : fp(a), Q.current = null, O());
            };
            pe();
          }
        } else pi(a.current, i) || (V.current = i, ye(), re.current = !1);
    }
  }, [f, k, G, i, ge, d, a, T, v, O, ye, fe]), xe(() => {
    if (!f || G || !_ || b || !U.current)
      return;
    const ae = _.nodesRef.current, pe = ae.find((be) => be.id === q)?.context?.elements.floating, Ue = vn(tt(E ?? pe ?? null)), ve = ae.some((be) => be.context && Le(be.context.elements.floating, Ue));
    pe && !ve && B.current && pe.focus({
      preventScroll: !0
    });
  }, [f, G, E, _, q, b]), xe(() => {
    ne.current = k, U.current = !!G;
  }), xe(() => {
    k || (Q.current = null, Y.current = S);
  }, [k, S]);
  const Re = i != null, _e = ze((ae) => {
    if (!se.current)
      return;
    const pe = a.current.indexOf(ae.currentTarget);
    pe !== -1 && (V.current !== pe || i !== pe) && (V.current = pe, O(ae));
  }), ke = ze(() => z ?? _?.nodesRef.current.find((ae) => ae.id === q)?.context?.dataRef?.current.orientation), we = ze(() => uc(a, oe.current)), Ce = ze((ae) => {
    if (B.current = !1, $.current = !0, ae.which === 229 || !se.current && ae.currentTarget === K.current)
      return;
    if (d && iO(ae.key, T, v, j)) {
      Js(ae.key, ke()) || fl(ae), H.setOpen(!1, Ye(cp, ae.nativeEvent)), Ct(E) && (b ? _?.events.emit("virtualfocus", E) : E.focus());
      return;
    }
    const pe = V.current, Ue = uc(a, A), ve = fp(a, A);
    if (X || (ae.key === "Home" && (fl(ae), V.current = Ue, O(ae)), ae.key === "End" && (fl(ae), V.current = ve, O(ae))), L != null) {
      const be = L(ae, V.current, a, T, m, v, A, Ue, ve);
      if (be != null && (V.current = be, O(ae)), T === "both")
        return;
    }
    if (Js(ae.key, T)) {
      if (fl(ae), k && !b && vn(ae.currentTarget.ownerDocument) === ae.currentTarget) {
        V.current = Kd(ae.key, T, v) ? Ue : ve, O(ae);
        return;
      }
      Kd(ae.key, T, v) ? m ? pe >= ve ? g && pe !== a.current.length ? V.current = -1 : ($.current = !1, V.current = Ue) : V.current = Bl(a.current, {
        startingIndex: pe,
        disabledIndices: A
      }) : V.current = Math.min(ve, Bl(a.current, {
        startingIndex: pe,
        disabledIndices: A
      })) : m ? pe <= Ue ? g && pe !== -1 ? V.current = a.current.length : ($.current = !1, V.current = ve) : V.current = Bl(a.current, {
        startingIndex: pe,
        decrement: !0,
        disabledIndices: A
      }) : V.current = Math.max(Ue, Bl(a.current, {
        startingIndex: pe,
        decrement: !0,
        disabledIndices: A
      })), pi(a.current, V.current) && (V.current = -1), O(ae);
    }
  }), he = y.useMemo(() => ({
    onFocus(pe) {
      $.current = !0, _e(pe);
    },
    onClick: ({
      currentTarget: pe
    }) => pe.focus({
      preventScroll: !0
    }),
    // Safari
    onMouseMove(pe) {
      $.current = !0, re.current = !1, C && _e(pe);
    },
    onPointerLeave(pe) {
      if (!se.current || !B.current || pe.pointerType === "touch")
        return;
      $.current = !0;
      const Ue = pe.relatedTarget;
      if (!(!C || a.current.includes(Ue)) && je.current && (ie.current?.(), ie.current = null, V.current = -1, O(pe), !b)) {
        const ve = K.current, be = vn(tt(ve));
        ve && Le(ve, be) && ve.focus({
          preventScroll: !0
        });
      }
    }
  }), [_e, se, K, C, a, O, je, b]), Se = y.useMemo(() => b && k && Re && {
    "aria-activedescendant": `${M}-${i}`
  }, [b, k, Re, M, i]), Te = y.useMemo(() => ({
    "aria-orientation": T === "both" ? void 0 : T,
    ...X ? {} : Se,
    onKeyDown(ae) {
      if (ae.key === "Tab" && ae.shiftKey && k && !b) {
        const pe = gn(ae.nativeEvent);
        if (pe && !Le(K.current, pe))
          return;
        fl(ae), H.setOpen(!1, Ye(Ro, ae.nativeEvent)), Ct(E) && E.focus();
        return;
      }
      Ce(ae);
    },
    onPointerMove() {
      B.current = !0;
    }
  }), [Se, Ce, K, T, X, H, k, b, E]), Oe = y.useMemo(() => {
    function ae(ve) {
      H.setOpen(!0, Ye(cp, ve.nativeEvent, ve.currentTarget));
    }
    function pe(ve) {
      S === "auto" && Lp(ve.nativeEvent) && (Y.current = !b);
    }
    function Ue(ve) {
      Y.current = S, S === "auto" && r0(ve.nativeEvent) && (Y.current = !0);
    }
    return {
      onKeyDown(ve) {
        const be = H.select("open");
        B.current = !1;
        const We = ve.key.startsWith("Arrow"), rt = aO(ve.key, ke(), v), pt = Js(ve.key, T), Nt = (d ? rt : pt) || ve.key === "Enter" || ve.key.trim() === "";
        if (b && be)
          return Ce(ve);
        if (!(!be && !w && We)) {
          if (Nt) {
            const et = Js(ve.key, ke());
            Q.current = d && et ? null : ve.key;
          }
          if (d) {
            rt && (fl(ve), be ? (V.current = we(), O(ve)) : ae(ve));
            return;
          }
          pt && (ge.current != null && (V.current = ge.current), fl(ve), !be && w ? ae(ve) : Ce(ve), be && O(ve));
        }
      },
      onFocus(ve) {
        H.select("open") && !b && (V.current = -1, O(ve));
      },
      onPointerDown: Ue,
      onPointerEnter: Ue,
      onMouseDown: pe,
      onClick: pe
    };
  }, [Ce, S, we, d, O, H, w, T, ke, v, ge, b]), He = y.useMemo(() => ({
    ...Se,
    ...Oe
  }), [Se, Oe]);
  return y.useMemo(() => f ? {
    reference: He,
    floating: Te,
    item: he,
    trigger: Oe
  } : {}, [f, He, Te, Oe, he]);
}
function rx(n, o) {
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
  } = o, b = "rootStore" in n ? n.rootStore : n, S = b.useState("open"), C = sn(), w = y.useRef(""), A = y.useRef(v ?? u ?? -1), T = y.useRef(null), z = ze((N) => {
    function L(K) {
      const q = i?.current[K];
      return !q || Yc(q);
    }
    function j(K) {
      return L(K) ? p == null || !Ec(ql, K, p) : !1;
    }
    function H(K, q, _ = 0) {
      if (K.length === 0)
        return -1;
      const Y = (_ % K.length + K.length) % K.length, V = q.toLowerCase();
      for (let Q = 0; Q < K.length; Q += 1) {
        const B = (Y + Q) % K.length;
        if (!(!K[B]?.toLowerCase().startsWith(V) || !j(B)))
          return B;
      }
      return -1;
    }
    const k = a.current;
    if (w.current.length > 0 && N.key === " " && (fl(N), g?.(!0)), w.current.length > 0 && w.current[0] !== " " && H(k, w.current) === -1 && N.key !== " " && g?.(!1), k == null || // Character key.
    N.key.length !== 1 || // Modifier key.
    N.ctrlKey || N.metaKey || N.altKey)
      return;
    S && N.key !== " " && (fl(N), g?.(!0));
    const G = w.current === "";
    G && (A.current = v ?? u ?? -1), k.every((K, q) => K && j(q) ? K[0]?.toLowerCase() !== K[1]?.toLowerCase() : !0) && w.current === N.key && (w.current = "", A.current = T.current), w.current += N.key, C.start(d, () => {
      w.current = "", A.current = T.current, g?.(!1);
    });
    const J = ((G ? v ?? u ?? -1 : A.current) ?? 0) + 1, X = H(k, w.current, J);
    X !== -1 ? (f?.(X), T.current = X) : N.key !== " " && (w.current = "", g?.(!1));
  }), M = ze((N) => {
    const L = N.relatedTarget, j = b.select("domReferenceElement"), H = b.select("floatingElement");
    Le(j, L) || Le(H, L) || (C.clear(), w.current = "", A.current = T.current, g?.(!1));
  });
  xe(() => {
    !S && v !== null || (C.clear(), T.current = null, w.current !== "" && (w.current = ""));
  }, [S, v, C]), xe(() => {
    S && w.current === "" && (A.current = v ?? u ?? -1);
  }, [S, v, u]);
  const D = y.useMemo(() => ({
    onKeyDown: z,
    onBlur: M
  }), [z, M]);
  return y.useMemo(() => m ? {
    reference: D,
    floating: D
  } : {}, [m, D]);
}
const ub = 0.1, sO = ub * ub, Rt = 0.5;
function $s(n, o, a, i, u, f) {
  return i >= o != f >= o && n <= (u - a) * (o - i) / (f - i) + a;
}
function Ws(n, o, a, i, u, f, p, g, m, d) {
  let v = !1;
  return $s(n, o, a, i, u, f) && (v = !v), $s(n, o, u, f, p, g) && (v = !v), $s(n, o, p, g, m, d) && (v = !v), $s(n, o, m, d, a, i) && (v = !v), v;
}
function cO(n, o, a) {
  return n >= a.x && n <= a.x + a.width && o >= a.y && o <= a.y + a.height;
}
function ec(n, o, a, i, u, f) {
  const p = Math.min(a, u), g = Math.max(a, u), m = Math.min(i, f), d = Math.max(i, f);
  return n >= p && n <= g && o >= m && o <= d;
}
function ou(n = {}) {
  const {
    blockPointerEvents: o = !1
  } = n, a = new el(), i = ({
    x: u,
    y: f,
    placement: p,
    elements: g,
    onClose: m,
    nodeId: d,
    tree: v
  }) => {
    const b = p?.split("-")[0];
    let S = !1, C = null, w = null, A = typeof performance < "u" ? performance.now() : 0;
    function T(M, D) {
      const N = performance.now(), L = N - A;
      if (C === null || w === null || L === 0)
        return C = M, w = D, A = N, !1;
      const j = M - C, H = D - w, k = j * j + H * H, G = L * L * sO;
      return C = M, w = D, A = N, k < G;
    }
    function z() {
      a.clear(), m();
    }
    return function(D) {
      a.clear();
      const N = g.domReference, L = g.floating;
      if (!N || !L || b == null || u == null || f == null)
        return;
      const {
        clientX: j,
        clientY: H
      } = D, k = gn(D), G = D.type === "mouseleave", E = Le(L, k), Z = Le(N, k);
      if (E && (S = !0, !G))
        return;
      if (Z && (S = !1, !G)) {
        S = !0;
        return;
      }
      if (G && $e(D.relatedTarget) && Le(L, D.relatedTarget))
        return;
      function J() {
        return !!(v && Oo(v.nodesRef.current, d).length > 0);
      }
      function X() {
        J() || z();
      }
      if (J())
        return;
      const K = N.getBoundingClientRect(), q = L.getBoundingClientRect(), _ = u > q.right - q.width / 2, Y = f > q.bottom - q.height / 2, V = q.width > K.width, Q = q.height > K.height, B = (V ? K : q).left, O = (V ? K : q).right, U = (Q ? K : q).top, ne = (Q ? K : q).bottom;
      if (b === "top" && f >= K.bottom - 1 || b === "bottom" && f <= K.top + 1 || b === "left" && u >= K.right - 1 || b === "right" && u <= K.left + 1) {
        X();
        return;
      }
      let $ = !1;
      switch (b) {
        case "top":
          $ = ec(j, H, B, K.top + 1, O, q.bottom - 1);
          break;
        case "bottom":
          $ = ec(j, H, B, q.top + 1, O, K.bottom - 1);
          break;
        case "left":
          $ = ec(j, H, q.right - 1, ne, K.left + 1, U);
          break;
        case "right":
          $ = ec(j, H, K.right - 1, ne, q.left + 1, U);
          break;
      }
      if ($)
        return;
      if (S && !cO(j, H, K)) {
        X();
        return;
      }
      if (!G && T(j, H)) {
        X();
        return;
      }
      let re = !1;
      switch (b) {
        case "top": {
          const ie = V ? Rt / 2 : Rt * 4, oe = V || _ ? u + ie : u - ie, se = V ? u - ie : _ ? u + ie : u - ie, ge = f + Rt + 1, je = _ || V ? q.bottom - Rt : q.top, Ee = _ ? V ? q.bottom - Rt : q.top : q.bottom - Rt;
          re = Ws(j, H, oe, ge, se, ge, q.left, je, q.right, Ee);
          break;
        }
        case "bottom": {
          const ie = V ? Rt / 2 : Rt * 4, oe = V || _ ? u + ie : u - ie, se = V ? u - ie : _ ? u + ie : u - ie, ge = f - Rt, je = _ || V ? q.top + Rt : q.bottom, Ee = _ ? V ? q.top + Rt : q.bottom : q.top + Rt;
          re = Ws(j, H, oe, ge, se, ge, q.left, je, q.right, Ee);
          break;
        }
        case "left": {
          const ie = Q ? Rt / 2 : Rt * 4, oe = Q || Y ? f + ie : f - ie, se = Q ? f - ie : Y ? f + ie : f - ie, ge = u + Rt + 1, je = Y || Q ? q.right - Rt : q.left, Ee = Y ? Q ? q.right - Rt : q.left : q.right - Rt;
          re = Ws(j, H, je, q.top, Ee, q.bottom, ge, oe, ge, se);
          break;
        }
        case "right": {
          const ie = Q ? Rt / 2 : Rt * 4, oe = Q || Y ? f + ie : f - ie, se = Q ? f - ie : Y ? f + ie : f - ie, ge = u - Rt, je = Y || Q ? q.left + Rt : q.right, Ee = Y ? Q ? q.left + Rt : q.right : q.left + Rt;
          re = Ws(j, H, ge, oe, ge, se, je, q.top, Ee, q.bottom);
          break;
        }
      }
      re ? S || a.start(40, X) : X();
    };
  };
  return i.__options = {
    ...n,
    blockPointerEvents: o
  }, i;
}
function uO(n) {
  const {
    store: o,
    actionsRef: a
  } = n, i = o.useState("open");
  W0(o, i), Jc(o);
  const {
    forceUnmount: u
  } = $c(i, o), f = y.useCallback(() => {
    o.setOpen(!1, Ye(Pc));
  }, [o]);
  y.useImperativeHandle(a, () => ({
    unmount: u,
    close: f
  }), [u, f]);
}
function fO({
  store: n,
  parentContext: o,
  isDrawer: a
}) {
  const i = n.useState("open"), u = n.useState("disablePointerDismissal"), f = n.useState("modal"), p = n.useState("popupElement"), g = n.useState("floatingRootContext"), [m, d] = y.useState(0), [v, b] = y.useState(0), S = m === 0, C = Ci(g, {
    outsidePressEvent() {
      return n.context.internalBackdropRef.current || n.context.backdropRef.current ? "intentional" : {
        mouse: f === "trap-focus" ? "sloppy" : "intentional",
        touch: "sloppy"
      };
    },
    outsidePress(z) {
      if (!n.context.outsidePressEnabledRef.current || "button" in z && z.button !== 0 || "touches" in z && z.touches.length !== 1)
        return !1;
      const M = gn(z);
      return S && !u ? f && (n.context.internalBackdropRef.current || n.context.backdropRef.current) ? n.context.internalBackdropRef.current === M || n.context.backdropRef.current === M || Le(M, p) && !M?.hasAttribute("data-base-ui-portal") : !0 : !1;
    },
    escapeKey: S
  });
  o0(i && f === !0, p), n.useContextCallback("onNestedDialogOpen", (z, M) => {
    d(z), b(M);
  }), n.useContextCallback("onNestedDialogClose", () => {
    d(0), b(0);
  }), y.useEffect(() => (o?.onNestedDialogOpen && i && o.onNestedDialogOpen(m + 1, v + (a ? 1 : 0)), o?.onNestedDialogClose && !i && o.onNestedDialogClose(), () => {
    o?.onNestedDialogClose && i && o.onNestedDialogClose();
  }), [a, i, m, v, o]);
  const w = C.reference ?? xt, A = C.trigger ?? xt, T = C.floating ?? xt;
  return Wc(n, {
    activeTriggerProps: w,
    inactiveTriggerProps: A,
    popupProps: T,
    nestedOpenDialogCount: m,
    nestedOpenDrawerCount: v
  }), null;
}
const ax = /* @__PURE__ */ y.createContext(!1), ix = /* @__PURE__ */ y.createContext(void 0);
function ur(n) {
  const o = y.useContext(ix);
  if (n === !1 && o === void 0)
    throw new Error(At(27));
  return o;
}
const dO = {
  ...tu,
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
class ig extends Oi {
  constructor(o, a, i = !1) {
    const u = new sa(), f = pO(o);
    f.floatingRootContext = ng(u, a, i), super(f, {
      popupRef: /* @__PURE__ */ y.createRef(),
      backdropRef: /* @__PURE__ */ y.createRef(),
      internalBackdropRef: /* @__PURE__ */ y.createRef(),
      outsidePressEnabledRef: {
        current: !0
      },
      triggerElements: u,
      onOpenChange: void 0,
      onOpenChangeComplete: void 0
    }, dO);
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
    Zc(i, o, a.trigger), this.update(i);
  };
  static useStore(o, a) {
    return $p(o, (u, f) => new ig(a, u, f), !0).store;
  }
}
function pO(n = {}) {
  return {
    ...eu(),
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
function sx(n, o = "dialog") {
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
    triggerId: b,
    defaultTriggerId: S = null
  } = n, C = o === "drawer", w = o === "alert-dialog", A = w ? !0 : m, T = w || g, z = w ? "alertdialog" : "dialog", M = ur(!0), N = {
    modal: A,
    disablePointerDismissal: T,
    nested: !!M,
    role: z
  }, L = ig.useStore(v?.store, {
    open: u,
    openProp: i,
    activeTriggerId: S,
    triggerIdProp: b,
    ...N
  });
  kp(() => {
    const Z = i === void 0 && L.state.open === !1 && u === !0 ? {
      open: !0,
      activeTriggerId: S
    } : null;
    w ? L.update(Z ? {
      ...N,
      ...Z
    } : N) : Z && L.update(Z);
  }), L.useControlledProp("openProp", i), L.useControlledProp("triggerIdProp", b), L.useSyncedValues(N), L.useContextCallback("onOpenChange", f), L.useContextCallback("onOpenChangeComplete", p);
  const j = L.useState("open"), H = L.useState("mounted"), k = L.useState("payload");
  uO({
    store: L,
    actionsRef: d
  });
  const G = j || H, E = y.useMemo(() => ({
    store: L
  }), [L]);
  return /* @__PURE__ */ x.jsx(ax.Provider, {
    value: !1,
    children: /* @__PURE__ */ x.jsxs(ix.Provider, {
      value: E,
      children: [G && /* @__PURE__ */ x.jsx(fO, {
        store: L,
        parentContext: M?.store.context,
        isDrawer: C
      }), typeof a == "function" ? a({
        payload: k
      }) : a]
    })
  });
}
function gO(n) {
  return sx(n, "alert-dialog");
}
let lr = (function(n) {
  return n.open = "data-open", n.closed = "data-closed", n[n.startingStyle = wi.startingStyle] = "startingStyle", n[n.endingStyle = wi.endingStyle] = "endingStyle", n.anchorHidden = "data-anchor-hidden", n.side = "data-side", n.align = "data-align", n;
})({}), Oc = /* @__PURE__ */ (function(n) {
  return n.popupOpen = "data-popup-open", n.pressed = "data-pressed", n;
})({});
const mO = {
  [Oc.popupOpen]: ""
}, hO = {
  [Oc.popupOpen]: "",
  [Oc.pressed]: ""
}, yO = {
  [lr.open]: ""
}, vO = {
  [lr.closed]: ""
}, bO = {
  [lr.anchorHidden]: ""
}, ru = {
  open(n) {
    return n ? mO : null;
  }
}, Mc = {
  open(n) {
    return n ? hO : null;
  }
}, _o = {
  open(n) {
    return n ? yO : vO;
  },
  anchorHidden(n) {
    return n ? bO : null;
  }
}, xO = {
  ..._o,
  ...ko
}, cx = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    forceRender: p = !1,
    ...g
  } = o, {
    store: m
  } = ur(), d = m.useState("open"), v = m.useState("nested"), b = m.useState("mounted"), S = m.useState("transitionStatus");
  return nt("div", o, {
    state: {
      open: d,
      transitionStatus: S
    },
    ref: [m.context.backdropRef, a],
    stateAttributesMapping: xO,
    props: [{
      role: "presentation",
      hidden: !b,
      style: {
        userSelect: "none",
        WebkitUserSelect: "none"
      }
    }, g],
    enabled: p || !v
  });
}), ux = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    disabled: p = !1,
    nativeButton: g = !0,
    ...m
  } = o, {
    store: d
  } = ur(), v = d.useState("open"), {
    getButtonProps: b,
    buttonRef: S
  } = Mo({
    disabled: p,
    native: g
  }), C = {
    disabled: p
  };
  function w(A) {
    v && d.setOpen(!1, Ye(c0, A.nativeEvent));
  }
  return nt("button", o, {
    state: C,
    ref: [a, S],
    props: [{
      onClick: w
    }, m, b]
  });
});
function Bn(n) {
  return rr(n, "base-ui");
}
const fx = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    id: p,
    ...g
  } = o, {
    store: m
  } = ur(), d = Bn(p);
  return m.useSyncedValueWithCleanup("descriptionElementId", d), nt("p", o, {
    ref: a,
    props: [{
      id: d
    }, g]
  });
});
let SO = /* @__PURE__ */ (function(n) {
  return n.nestedDialogs = "--nested-dialogs", n;
})({}), wO = (function(n) {
  return n[n.open = lr.open] = "open", n[n.closed = lr.closed] = "closed", n[n.startingStyle = lr.startingStyle] = "startingStyle", n[n.endingStyle = lr.endingStyle] = "endingStyle", n.nested = "data-nested", n.nestedDialogOpen = "data-nested-dialog-open", n;
})({});
const dx = /* @__PURE__ */ y.createContext(void 0);
function EO() {
  const n = y.useContext(dx);
  if (n === void 0)
    throw new Error(At(26));
  return n;
}
const mi = "ArrowUp", hi = "ArrowDown", Ac = "ArrowLeft", zc = "ArrowRight", au = "Home", iu = "End", px = /* @__PURE__ */ new Set([Ac, zc]), TO = /* @__PURE__ */ new Set([Ac, zc, au, iu]), gx = /* @__PURE__ */ new Set([mi, hi]), RO = /* @__PURE__ */ new Set([mi, hi, au, iu]), mx = /* @__PURE__ */ new Set([...px, ...gx]), Mi = /* @__PURE__ */ new Set([...mx, au, iu]), CO = "Shift", OO = "Control", MO = "Alt", AO = "Meta", zO = /* @__PURE__ */ new Set([CO, OO, MO, AO]);
function DO(n) {
  return Ct(n) && n.tagName === "INPUT";
}
function fb(n) {
  return !!(DO(n) && n.selectionStart != null || Ct(n) && n.tagName === "TEXTAREA");
}
function db(n, o, a, i) {
  if (!n || !o || !o.scrollTo)
    return;
  let u = n.scrollLeft, f = n.scrollTop;
  const p = n.clientWidth < n.scrollWidth, g = n.clientHeight < n.scrollHeight;
  if (p && i !== "vertical") {
    const m = pb(n, o, "left"), d = tc(n), v = tc(o);
    a === "ltr" && (m + o.offsetWidth + v.scrollMarginRight > n.scrollLeft + n.clientWidth - d.scrollPaddingRight ? u = m + o.offsetWidth + v.scrollMarginRight - n.clientWidth + d.scrollPaddingRight : m - v.scrollMarginLeft < n.scrollLeft + d.scrollPaddingLeft && (u = m - v.scrollMarginLeft - d.scrollPaddingLeft)), a === "rtl" && (m - v.scrollMarginRight < n.scrollLeft + d.scrollPaddingLeft ? u = m - v.scrollMarginLeft - d.scrollPaddingLeft : m + o.offsetWidth + v.scrollMarginRight > n.scrollLeft + n.clientWidth - d.scrollPaddingRight && (u = m + o.offsetWidth + v.scrollMarginRight - n.clientWidth + d.scrollPaddingRight));
  }
  if (g && i !== "horizontal") {
    const m = pb(n, o, "top"), d = tc(n), v = tc(o);
    m - v.scrollMarginTop < n.scrollTop + d.scrollPaddingTop ? f = m - v.scrollMarginTop - d.scrollPaddingTop : m + o.offsetHeight + v.scrollMarginBottom > n.scrollTop + n.clientHeight - d.scrollPaddingBottom && (f = m + o.offsetHeight + v.scrollMarginBottom - n.clientHeight + d.scrollPaddingBottom);
  }
  n.scrollTo({
    left: u,
    top: f,
    behavior: "auto"
  });
}
function pb(n, o, a) {
  const i = a === "left" ? "offsetLeft" : "offsetTop";
  let u = 0;
  for (; o.offsetParent && (u += o[i], o.offsetParent !== n); )
    o = o.offsetParent;
  return u;
}
function tc(n) {
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
const NO = {
  ..._o,
  ...ko,
  nestedDialogOpen(n) {
    return n ? {
      [wO.nestedDialogOpen]: ""
    } : null;
  }
}, hx = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    finalFocus: p,
    initialFocus: g,
    ...m
  } = o, {
    store: d
  } = ur(), v = d.useState("descriptionElementId"), b = d.useState("disablePointerDismissal"), S = d.useState("floatingRootContext"), C = d.useState("popupProps"), w = d.useState("modal"), A = d.useState("mounted"), T = d.useState("nested"), z = d.useState("nestedOpenDialogCount"), M = d.useState("open"), D = d.useState("openMethod"), N = d.useState("titleElementId"), L = d.useState("transitionStatus"), j = d.useState("role"), H = S.useState("floatingId"), k = m.id ?? H;
  EO(), Zl({
    open: M,
    ref: d.context.popupRef,
    onComplete() {
      M && d.context.onOpenChangeComplete?.(!0);
    }
  });
  const G = g === void 0 ? J0(d.context.popupRef) : g, E = z > 0, Z = d.useStateSetter("popupElement"), X = nt("div", o, {
    state: {
      open: M,
      nested: T,
      transitionStatus: L,
      nestedDialogOpen: E
    },
    props: [C, {
      id: k,
      "aria-labelledby": N ?? void 0,
      "aria-describedby": v ?? void 0,
      role: j,
      ...ia,
      hidden: !A,
      onKeyDown(K) {
        Mi.has(K.key) && K.stopPropagation();
      },
      style: {
        [SO.nestedDialogs]: z
      }
    }, m],
    ref: [a, d.context.popupRef, Z],
    stateAttributesMapping: NO
  });
  return /* @__PURE__ */ x.jsx(qc, {
    context: S,
    openInteractionType: D,
    disabled: !A,
    closeOnFocusOut: !b,
    initialFocus: G,
    returnFocus: p,
    modal: w !== !1,
    restoreFocus: "popup",
    children: X
  });
});
function su(n) {
  return Dp(19) ? n : n ? "true" : void 0;
}
const cu = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    cutout: i,
    ...u
  } = o;
  let f;
  if (i) {
    const p = i.getBoundingClientRect();
    f = `polygon(0% 0%,100% 0%,100% 100%,0% 100%,0% 0%,${p.left}px ${p.top}px,${p.left}px ${p.bottom}px,${p.right}px ${p.bottom}px,${p.right}px ${p.top}px,${p.left}px ${p.top}px)`;
  }
  return /* @__PURE__ */ x.jsx("div", {
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
}), yx = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    keepMounted: i = !1,
    ...u
  } = o, {
    store: f
  } = ur(), p = f.useState("mounted"), g = f.useState("modal"), m = f.useState("open");
  return p || i ? /* @__PURE__ */ x.jsx(dx.Provider, {
    value: i,
    children: /* @__PURE__ */ x.jsxs(Gc, {
      ref: a,
      ...u,
      children: [p && g === !0 && /* @__PURE__ */ x.jsx(cu, {
        ref: f.context.internalBackdropRef,
        inert: su(!m)
      }), o.children]
    })
  }) : null;
}), vx = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    id: p,
    ...g
  } = o, {
    store: m
  } = ur(), d = Bn(p);
  return m.useSyncedValueWithCleanup("titleElementId", d), nt("h2", o, {
    ref: a,
    props: [{
      id: d
    }, g]
  });
});
function jO(n) {
  const o = y.useRef(""), a = y.useCallback((u) => {
    u.defaultPrevented || (o.current = u.pointerType, n(u, u.pointerType));
  }, [n]);
  return {
    onClick: y.useCallback((u) => {
      if (u.detail === 0) {
        n(u, "keyboard");
        return;
      }
      "pointerType" in u ? n(u, u.pointerType) : n(u, o.current), o.current = "";
    }, [n]),
    onPointerDown: a
  };
}
function bx(n, o) {
  const a = y.useRef(n), i = ze(o);
  xe(() => {
    a.current !== n && i(a.current);
  }, [n, i]), xe(() => {
    a.current = n;
  }, [n]);
}
function xx(n, o) {
  const a = ze((f, p) => {
    (typeof n == "function" ? n() : n) || o(p || // On iOS Safari, the hitslop around touch targets means tapping outside an element's
    // bounds does not fire `pointerdown` but does fire `mousedown`. The `interactionType`
    // will be "" in that case.
    (Uc ? "touch" : ""));
  }), {
    onClick: i,
    onPointerDown: u
  } = jO(a);
  return y.useMemo(() => ({
    onClick: i,
    onPointerDown: u
  }), [i, u]);
}
function Sx(n) {
  const [o, a] = y.useState(null), i = xx(n, a);
  return bx(n, (u) => {
    u && !n && a(null);
  }), y.useMemo(() => ({
    openMethod: o,
    triggerProps: i
  }), [o, i]);
}
function kO({ ...n }) {
  return /* @__PURE__ */ x.jsx(gO, { "data-slot": "alert-dialog", ...n });
}
function _O({ ...n }) {
  return /* @__PURE__ */ x.jsx(yx, { "data-slot": "alert-dialog-portal", ...n });
}
function HO({
  className: n,
  ...o
}) {
  return /* @__PURE__ */ x.jsx(
    cx,
    {
      "data-slot": "alert-dialog-overlay",
      className: Ke(
        "tw:fixed tw:inset-0 tw:isolate tw:z-[var(--z-modal)] tw:bg-black/10 tw:duration-[var(--motion-fast)] tw:supports-backdrop-filter:backdrop-blur-xs",
        n
      ),
      ...o
    }
  );
}
function UO({
  className: n,
  size: o = "default",
  ...a
}) {
  return /* @__PURE__ */ x.jsxs(_O, { children: [
    /* @__PURE__ */ x.jsx(HO, {}),
    /* @__PURE__ */ x.jsx(
      hx,
      {
        "data-slot": "alert-dialog-content",
        "data-size": o,
        className: Ke(
          "tw:group/alert-dialog-content tw:fixed tw:top-1/2 tw:left-1/2 tw:z-[var(--z-modal)] tw:grid tw:w-full tw:-translate-x-1/2 tw:-translate-y-1/2 tw:gap-4 tw:rounded-[var(--radius-surface)] tw:bg-popover tw:p-4 tw:text-popover-foreground tw:ring-1 tw:ring-foreground/10 tw:duration-[var(--motion-fast)] tw:outline-none tw:data-[size=default]:max-w-xs tw:data-[size=sm]:max-w-xs tw:data-[size=default]:sm:max-w-sm",
          n
        ),
        ...a
      }
    )
  ] });
}
function LO({
  className: n,
  ...o
}) {
  return /* @__PURE__ */ x.jsx(
    "div",
    {
      "data-slot": "alert-dialog-header",
      className: Ke(
        "tw:grid tw:grid-rows-[auto_1fr] tw:place-items-center tw:gap-1.5 tw:text-center tw:sm:group-data-[size=default]/alert-dialog-content:place-items-start tw:sm:group-data-[size=default]/alert-dialog-content:text-left",
        n
      ),
      ...o
    }
  );
}
const IO = aa(
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
function BO({
  className: n,
  variant: o = "default",
  ...a
}) {
  return /* @__PURE__ */ x.jsx(
    "div",
    {
      "data-slot": "alert-dialog-footer",
      className: Ke(IO({ variant: o }), n),
      ...a
    }
  );
}
const VO = aa(
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
function PO({
  className: n,
  variant: o = "default",
  ...a
}) {
  return /* @__PURE__ */ x.jsx(
    "div",
    {
      "data-slot": "alert-dialog-media",
      className: Ke(VO({ variant: o }), n),
      ...a
    }
  );
}
function YO({
  className: n,
  ...o
}) {
  return /* @__PURE__ */ x.jsx(
    vx,
    {
      "data-slot": "alert-dialog-title",
      className: Ke(
        "tw:text-[var(--fs-title)] tw:font-medium tw:sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2",
        n
      ),
      ...o
    }
  );
}
function GO({
  className: n,
  ...o
}) {
  return /* @__PURE__ */ x.jsx(
    fx,
    {
      "data-slot": "alert-dialog-description",
      className: Ke(
        "tw:text-[var(--fs-body-s)] tw:text-balance tw:text-muted-foreground tw:md:text-pretty tw:*:[a]:underline tw:*:[a]:underline-offset-3 tw:*:[a]:hover:text-foreground",
        n
      ),
      ...o
    }
  );
}
function qO({
  className: n,
  ...o
}) {
  return /* @__PURE__ */ x.jsx(
    ht,
    {
      "data-slot": "alert-dialog-action",
      className: Ke(n),
      ...o
    }
  );
}
function XO({
  className: n,
  variant: o = "outline",
  size: a = "default",
  ...i
}) {
  return /* @__PURE__ */ x.jsx(
    ux,
    {
      "data-slot": "alert-dialog-cancel",
      className: Ke(n),
      render: /* @__PURE__ */ x.jsx(ht, { variant: o, size: a }),
      ...i
    }
  );
}
const wx = /* @__PURE__ */ y.createContext(void 0);
function uu(n) {
  const o = y.useContext(wx);
  if (o === void 0 && !n)
    throw new Error(At(33));
  return o;
}
const Ex = /* @__PURE__ */ y.createContext(void 0);
function ml(n) {
  const o = y.useContext(Ex);
  if (o === void 0 && !n)
    throw new Error(At(36));
  return o;
}
const FO = /* @__PURE__ */ y.createContext(void 0);
function fu(n = !0) {
  const o = y.useContext(FO);
  if (o === void 0 && !n)
    throw new Error(At(25));
  return o;
}
function ra({
  controlled: n,
  default: o,
  name: a,
  state: i = "value"
}) {
  const {
    current: u
  } = y.useRef(n !== void 0), [f, p] = y.useState(o), g = u ? n : f, m = y.useCallback((d) => {
    u || p(d);
  }, []);
  return [g, m];
}
const Tx = /* @__PURE__ */ y.createContext(void 0);
function KO() {
  const n = y.useContext(Tx);
  if (n === void 0)
    throw new Error(At(30));
  return n;
}
function QO(n) {
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
  } = f.useState("floatingTreeRoot"), v = f.useState("open"), b = fu(!0), S = b !== void 0;
  return y.useMemo(() => ({
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
        reason: $r
      });
    },
    onMouseUp(C) {
      if (b) {
        const w = b.initialCursorPointRef.current;
        if (b.initialCursorPointRef.current = null, S && w && Math.abs(C.clientX - w.x) <= 1 && Math.abs(C.clientY - w.y) <= 1 || S && !_p && C.button === 2)
          return;
      }
      g.current && f.context.allowMouseUpTriggerRef.current && (!S || C.button === 2) && (!m || m.type === "regular-item") && g.current.click();
    }
  }), [o, a, i, d, u, v, f, p, g, b, S, m]);
}
const Rx = {
  type: "regular-item"
};
function sg(n) {
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
  } = n, v = f.useState("disabled"), b = a || v, S = y.useRef(null), {
    getButtonProps: C,
    buttonRef: w
  } = Mo({
    disabled: b,
    focusableWhenDisabled: !0,
    native: g,
    composite: !0
  }), A = QO({
    closeOnClick: o,
    highlighted: i,
    id: u,
    nodeId: d,
    store: f,
    typingRef: p,
    itemRef: S,
    itemMetadata: m
  }), T = y.useCallback((M) => bn(A, {
    onMouseEnter() {
      m.type === "submenu-trigger" && m.setActive();
    }
  }, M, C), [A, C, m]), z = To(S, w);
  return y.useMemo(() => ({
    getItemProps: T,
    itemRef: z
  }), [T, z]);
}
const Cx = /* @__PURE__ */ y.createContext({
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
function ZO() {
  return y.useContext(Cx);
}
let Ox = /* @__PURE__ */ (function(n) {
  return n[n.None = 0] = "None", n[n.GuessFromOrder = 1] = "GuessFromOrder", n;
})({});
function Ai(n = {}) {
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
    nextIndexRef: b
  } = ZO(), S = y.useRef(-1), [C, w] = y.useState(f ?? (u === Ox.GuessFromOrder ? () => {
    if (S.current === -1) {
      const z = b.current;
      b.current += 1, S.current = z;
    }
    return S.current;
  } : -1)), A = y.useRef(null), T = y.useCallback((z) => {
    if (A.current = z, C !== -1 && z !== null && (d.current[C] = z, v)) {
      const M = o !== void 0;
      v.current[C] = M ? o : i?.current?.textContent ?? z.textContent;
    }
  }, [C, d, v, o, i]);
  return xe(() => {
    if (f != null)
      return;
    const z = A.current;
    if (z)
      return p(z, a), () => {
        g(z);
      };
  }, [f, p, g, a]), xe(() => {
    if (f == null)
      return m((z) => {
        const M = A.current ? z.get(A.current)?.index : null;
        M != null && w(M);
      });
  }, [f, m, w]), {
    ref: T,
    index: C
  };
}
let gb = /* @__PURE__ */ (function(n) {
  return n.checked = "data-checked", n.unchecked = "data-unchecked", n.disabled = "data-disabled", n.highlighted = "data-highlighted", n;
})({});
const Mx = {
  checked(n) {
    return n ? {
      [gb.checked]: ""
    } : {
      [gb.unchecked]: ""
    };
  },
  ...ko
}, JO = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    id: f,
    label: p,
    nativeButton: g = !1,
    disabled: m = !1,
    closeOnClick: d = !1,
    checked: v,
    defaultChecked: b,
    onCheckedChange: S,
    style: C,
    ...w
  } = o, A = Ai({
    label: p
  }), T = uu(!0), z = Bn(f), {
    store: M
  } = ml(), D = M.useState("isActive", A.index), N = M.useState("itemProps"), [L, j] = ra({
    controlled: v,
    default: b ?? !1,
    name: "MenuCheckboxItem",
    state: "checked"
  }), {
    getItemProps: H,
    itemRef: k
  } = sg({
    closeOnClick: d,
    disabled: m,
    highlighted: D,
    id: z,
    store: M,
    nativeButton: g,
    nodeId: T?.context.nodeId,
    itemMetadata: Rx
  }), G = y.useMemo(() => ({
    disabled: m,
    highlighted: D,
    checked: L
  }), [m, D, L]);
  function E(J) {
    const X = Ye($r, J.nativeEvent, void 0, {
      preventUnmountOnClose() {
      }
    });
    S?.(!L, X), !X.isCanceled && j((K) => !K);
  }
  const Z = nt("div", o, {
    state: G,
    stateAttributesMapping: Mx,
    props: [N, {
      role: "menuitemcheckbox",
      "aria-checked": L,
      onClick: E
    }, w, H],
    ref: [k, a, A.ref]
  });
  return /* @__PURE__ */ x.jsx(Tx.Provider, {
    value: G,
    children: Z
  });
}), $O = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    keepMounted: p = !1,
    ...g
  } = o, m = KO(), d = y.useRef(null), {
    transitionStatus: v,
    setMounted: b
  } = Qc(m.checked);
  Zl({
    open: m.checked,
    ref: d,
    onComplete() {
      m.checked || b(!1);
    }
  });
  const S = {
    checked: m.checked,
    disabled: m.disabled,
    highlighted: m.highlighted,
    transitionStatus: v
  };
  return nt("span", o, {
    state: S,
    ref: [a, d],
    stateAttributesMapping: Mx,
    props: {
      "aria-hidden": !0,
      ...g
    },
    enabled: p || m.checked
  });
}), Ax = /* @__PURE__ */ y.createContext(void 0);
function WO() {
  const n = y.useContext(Ax);
  if (n === void 0)
    throw new Error(At(31));
  return n;
}
const eM = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    ...p
  } = o, [g, m] = y.useState(void 0), d = nt("div", o, {
    ref: a,
    props: {
      role: "group",
      "aria-labelledby": g,
      ...p
    }
  });
  return /* @__PURE__ */ x.jsx(Ax.Provider, {
    value: m,
    children: d
  });
}), tM = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    id: p,
    ...g
  } = o, m = Bn(p), d = WO();
  return xe(() => (d(m), () => {
    d(void 0);
  }), [d, m]), nt("div", o, {
    ref: a,
    props: {
      id: m,
      role: "presentation",
      ...g
    }
  });
}), nM = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    id: f,
    label: p,
    nativeButton: g = !1,
    disabled: m = !1,
    closeOnClick: d = !0,
    style: v,
    ...b
  } = o, S = Ai({
    label: p
  }), C = uu(!0), w = Bn(f), {
    store: A
  } = ml(), T = A.useState("isActive", S.index), z = A.useState("itemProps"), {
    getItemProps: M,
    itemRef: D
  } = sg({
    closeOnClick: d,
    disabled: m,
    highlighted: T,
    id: w,
    store: A,
    nativeButton: g,
    nodeId: C?.context.nodeId,
    itemMetadata: Rx
  });
  return nt("div", o, {
    state: {
      disabled: m,
      highlighted: T
    },
    props: [z, b, M],
    ref: [D, a, S.ref]
  });
}), lM = /* @__PURE__ */ y.createContext(void 0);
function du(n) {
  return y.useContext(lM);
}
function zi(n) {
  return n === "starting" ? YR : xt;
}
const oM = {
  ..._o,
  ...ko
}, rM = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    finalFocus: p,
    ...g
  } = o, {
    store: m
  } = ml(), {
    side: d,
    align: v
  } = uu(), b = du() != null, S = m.useState("open"), C = m.useState("transitionStatus"), w = m.useState("popupProps"), A = m.useState("mounted"), T = m.useState("instantType"), z = m.useState("activeTriggerElement"), M = m.useState("parent"), D = m.useState("lastOpenChangeReason"), N = m.useState("rootId"), L = m.useState("floatingRootContext"), j = m.useState("floatingTreeRoot"), H = m.useState("closeDelay"), k = m.useState("activeTriggerElement"), G = m.useState("hoverEnabled"), E = m.useState("disabled"), Z = m.useState("openMethod"), J = M.type === "context-menu";
  Zl({
    open: S,
    ref: m.context.popupRef,
    onComplete() {
      S && m.context.onOpenChangeComplete?.(!0);
    }
  }), y.useEffect(() => {
    function Y(V) {
      m.setOpen(!1, Ye(V.reason, V.domEvent));
    }
    return j.events.on("close", Y), () => {
      j.events.off("close", Y);
    };
  }, [j.events, m]), ag(L, {
    enabled: G && !E && !J && M.type !== "menubar",
    closeDelay: H
  });
  const X = y.useCallback((Y) => {
    m.set("popupElement", Y);
  }, [m]), K = {
    transitionStatus: C,
    side: d,
    align: v,
    open: S,
    nested: M.type === "menu",
    instant: T
  }, q = nt("div", o, {
    state: K,
    ref: [a, m.context.popupRef, X],
    stateAttributesMapping: oM,
    props: [w, {
      onKeyDown(Y) {
        b && Mi.has(Y.key) && Y.stopPropagation();
      }
    }, zi(C), g, {
      "data-rootownerid": N
    }]
  });
  let _ = M.type === void 0 || J;
  return (z || M.type === "menubar" && D !== Vc) && (_ = !0), /* @__PURE__ */ x.jsx(qc, {
    context: L,
    openInteractionType: Z,
    modal: J,
    disabled: !A,
    returnFocus: p === void 0 ? _ : p,
    initialFocus: M.type !== "menu",
    restoreFocus: !0,
    externalTree: M.type !== "menubar" ? j : void 0,
    previousFocusableElement: k,
    nextFocusableElement: M.type === void 0 ? m.context.triggerFocusTargetRef : void 0,
    beforeContentFocusGuardRef: M.type === void 0 ? m.context.beforeContentFocusGuardRef : void 0,
    children: q
  });
}), zx = /* @__PURE__ */ y.createContext(void 0);
function aM() {
  const n = y.useContext(zx);
  if (n === void 0)
    throw new Error(At(32));
  return n;
}
const iM = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    keepMounted: i = !1,
    ...u
  } = o, {
    store: f
  } = ml();
  return f.useState("mounted") || i ? /* @__PURE__ */ x.jsx(zx.Provider, {
    value: i,
    children: /* @__PURE__ */ x.jsx(Gc, {
      ref: a,
      ...u
    })
  }) : null;
}), sM = /* @__PURE__ */ y.createContext(void 0);
function pu() {
  return y.useContext(sM)?.direction ?? "ltr";
}
const cM = (n) => ({
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
      offsetParent: b = "real"
    } = Fl(n, o) || {};
    if (d == null)
      return {};
    const S = m0(v), C = {
      x: a,
      y: i
    }, w = Pp(u), A = Vp(w), T = await p.getDimensions(d), z = w === "y", M = z ? "top" : "left", D = z ? "bottom" : "right", N = z ? "clientHeight" : "clientWidth", L = f.reference[A] + f.reference[w] - C[w] - f.floating[A], j = C[w] - f.reference[w], H = b === "real" ? await p.getOffsetParent?.(d) : g.floating;
    let k = g.floating[N] || f.floating[A];
    (!k || !await p.isElement?.(H)) && (k = g.floating[N] || f.floating[A]);
    const G = L / 2 - j / 2, E = k / 2 - T[A] / 2 - 1, Z = Math.min(S[M], E), J = Math.min(S[D], E), X = Z, K = k - T[A] - J, q = k / 2 - T[A] / 2 + G, _ = g0(X, q, K), Y = !m.arrow && No(u) != null && q !== _ && f.reference[A] / 2 - (q < X ? Z : J) - T[A] / 2 < 0, V = Y ? q < X ? q - X : q - K : 0;
    return {
      [w]: C[w] + V,
      data: {
        [w]: _,
        centerOffset: q - _ - V,
        ...Y && {
          alignmentOffset: V
        }
      },
      reset: Y
    };
  }
}), uM = (n, o) => ({
  ...cM(n),
  options: [n, o]
}), fM = LC().fn, dM = {
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
        referenceHidden: (await fM(n)).data?.referenceHidden || f
      }
    };
  }
}, pc = {
  sideX: "left",
  sideY: "top"
}, cg = {
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
    } = n, m = Dt(u), d = m.getComputedStyle(u);
    if (!(d.transitionDuration !== "0s" && d.transitionDuration !== ""))
      return {
        x: o,
        y: a,
        data: pc
      };
    const b = await f.getOffsetParent?.(u);
    let S = {
      width: 0,
      height: 0
    };
    if (p === "fixed" && m?.visualViewport)
      S = {
        width: m.visualViewport.width,
        height: m.visualViewport.height
      };
    else if (b === m) {
      const M = tt(u);
      S = {
        width: M.documentElement.clientWidth,
        height: M.documentElement.clientHeight
      };
    } else await f.isElement?.(b) && (S = await f.getDimensions(b));
    const C = Ln(g);
    let w = o, A = a;
    C === "left" && (w = S.width - (o + i.width)), C === "top" && (A = S.height - (a + i.height));
    const T = C === "left" ? "right" : pc.sideX, z = C === "top" ? "bottom" : pc.sideY;
    return {
      x: w,
      y: A,
      data: {
        sideX: T,
        sideY: z
      }
    };
  }
};
function Dx(n, o, a) {
  const i = n === "inline-start" || n === "inline-end";
  return {
    top: "top",
    right: i ? a ? "inline-start" : "inline-end" : "right",
    bottom: "bottom",
    left: i ? a ? "inline-end" : "inline-start" : "left"
  }[o];
}
function mb(n, o, a) {
  const {
    rects: i,
    placement: u
  } = n;
  return {
    side: Dx(o, Ln(u), a),
    align: No(u) || "center",
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
function gu(n) {
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
    disableAnchorTracking: b = !1,
    inline: S,
    // Private parameters
    keepMounted: C = !1,
    floatingRootContext: w,
    mounted: A,
    collisionAvoidance: T,
    shiftCrossAxis: z = !1,
    nodeId: M,
    adaptiveOrigin: D,
    lazyFlip: N = !1,
    externalTree: L
  } = n, [j, H] = y.useState(null);
  !A && j !== null && H(null);
  const k = T.side || "flip", G = T.align || "flip", E = T.fallbackAxisSide || "end", Z = typeof o == "function" ? o : void 0, J = ze(Z), X = Z ? J : o, K = Yt(o), q = Yt(A), Y = pu() === "rtl", V = j || {
    top: "top",
    right: "right",
    bottom: "bottom",
    left: "left",
    "inline-end": Y ? "left" : "right",
    "inline-start": Y ? "right" : "left"
  }[i], Q = f === "center" ? V : `${V}-${f}`;
  let B = m;
  const O = 1, U = i === "bottom" ? O : 0, ne = i === "top" ? O : 0, $ = i === "right" ? O : 0, re = i === "left" ? O : 0;
  typeof B == "number" ? B = {
    top: B + U,
    right: B + re,
    bottom: B + ne,
    left: B + $
  } : B && (B = {
    top: (B.top || 0) + U,
    right: (B.right || 0) + re,
    bottom: (B.bottom || 0) + ne,
    left: (B.left || 0) + $
  });
  const ie = {
    boundary: g === "clipping-ancestors" ? "clippingAncestors" : g,
    padding: B
  }, oe = y.useRef(null), se = Yt(u), ge = Yt(p), je = typeof u != "function" ? u : 0, Ee = typeof p != "function" ? p : 0, fe = [];
  S && fe.push(S), fe.push(jC((Qe) => {
    const ft = mb(Qe, i, Y), It = typeof se.current == "function" ? se.current(ft) : se.current, Ht = typeof ge.current == "function" ? ge.current(ft) : ge.current;
    return {
      mainAxis: It,
      crossAxis: Ht,
      alignmentAxis: Ht
    };
  }, [je, Ee, Y, i]));
  const ye = G === "none" && k !== "shift", Re = !ye && (d || z || k === "shift"), _e = k === "none" ? null : HC({
    ...ie,
    // Ensure the popup flips if it's been limited by its --available-height and it resizes.
    // Since the size() padding is smaller than the flip() padding, flip() will take precedence.
    padding: {
      top: B.top + O,
      right: B.right + O,
      bottom: B.bottom + O,
      left: B.left + O
    },
    mainAxis: !z && k === "flip",
    crossAxis: G === "flip" ? "alignment" : !1,
    fallbackAxisSideDirection: E
  }), ke = ye ? null : kC((Qe) => {
    const ft = tt(Qe.elements.floating).documentElement;
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
      mainAxis: G !== "none",
      crossAxis: Re,
      limiter: d || z ? void 0 : _C((It) => {
        if (!oe.current)
          return {};
        const {
          width: Ht,
          height: Ut
        } = oe.current.getBoundingClientRect(), jt = Wn(Ln(It.placement)), Gt = jt === "y" ? Ht : Ut, Sn = jt === "y" ? B.left + B.right : B.top + B.bottom;
        return {
          offset: Gt / 2 + Sn / 2
        };
      })
    };
  }, [ie, d, z, B, G]);
  k === "shift" || G === "shift" || f === "center" ? fe.push(ke, _e) : fe.push(_e, ke), fe.push(UC({
    ...ie,
    apply({
      elements: {
        floating: Qe
      },
      availableWidth: ft,
      availableHeight: It,
      rects: Ht
    }) {
      if (!q.current)
        return;
      const Ut = Qe.style;
      Ut.setProperty("--available-width", `${ft}px`), Ut.setProperty("--available-height", `${It}px`);
      const jt = Dt(Qe).devicePixelRatio || 1, {
        x: Gt,
        y: Sn,
        width: zn,
        height: Vn
      } = Ht.reference, qt = (Math.round((Gt + zn) * jt) - Math.round(Gt * jt)) / jt, Pn = (Math.round((Sn + Vn) * jt) - Math.round(Sn * jt)) / jt;
      Ut.setProperty("--anchor-width", `${qt}px`), Ut.setProperty("--anchor-height", `${Pn}px`);
    }
  }), uM((Qe) => ({
    // `transform-origin` calculations rely on an element existing. If the arrow hasn't been set,
    // we'll create a fake element.
    element: oe.current || tt(Qe.elements.floating).createElement("div"),
    padding: v,
    offsetParent: "floating"
  }), [v]), {
    name: "transformOrigin",
    fn(Qe) {
      const {
        elements: ft,
        middlewareData: It,
        placement: Ht,
        rects: Ut,
        y: jt
      } = Qe, Gt = Ln(Ht), Sn = Wn(Gt), zn = oe.current, Vn = It.arrow?.x || 0, qt = It.arrow?.y || 0, Pn = zn?.clientWidth || 0, hl = zn?.clientHeight || 0, tl = Vn + Pn / 2, yl = qt + hl / 2, qe = Math.abs(It.shift?.y || 0), St = Ut.reference.height / 2, Xt = typeof u == "function" ? u(mb(Qe, i, Y)) : u, ln = qe > Xt, en = {
        top: `${tl}px calc(100% + ${Xt}px)`,
        bottom: `${tl}px ${-Xt}px`,
        left: `calc(100% + ${Xt}px) ${yl}px`,
        right: `${-Xt}px ${yl}px`
      }[Gt], Ot = `${tl}px ${Ut.reference.y + St - jt}px`;
      return ft.floating.style.setProperty("--transform-origin", Re && Sn === "y" && ln ? Ot : en), {};
    }
  }, dM, D), xe(() => {
    !A && w && w.update({
      referenceElement: null,
      floatingElement: null,
      domReferenceElement: null,
      positionReference: null
    });
  }, [A, w]);
  const we = y.useMemo(() => ({
    elementResize: !b && typeof ResizeObserver < "u",
    layoutShift: !b && typeof IntersectionObserver < "u"
  }), [b]), {
    refs: Ce,
    elements: he,
    x: Se,
    y: Te,
    middlewareData: Oe,
    update: He,
    placement: ae,
    context: pe,
    isPositioned: Ue,
    floatingStyles: ve
  } = lO({
    rootContext: w,
    open: C ? A : void 0,
    placement: Q,
    middleware: fe,
    strategy: a,
    whileElementsMounted: C ? void 0 : (...Qe) => lb(...Qe, we),
    nodeId: M,
    externalTree: L
  }), {
    sideX: be,
    sideY: We
  } = Oe.adaptiveOrigin || pc, rt = Ue ? a : "fixed", pt = y.useMemo(() => {
    const Qe = D ? {
      position: rt,
      [be]: Se,
      [We]: Te
    } : {
      position: rt,
      ...ve
    };
    return Ue || (Qe.opacity = 0), Qe;
  }, [D, rt, be, Se, We, Te, ve, Ue]), Nt = y.useRef(null);
  xe(() => {
    if (!A)
      return;
    const Qe = K.current, ft = typeof Qe == "function" ? Qe() : Qe, Ht = (hb(ft) ? ft.current : ft) || null || null;
    Ht !== Nt.current && (Ce.setPositionReference(Ht), Nt.current = Ht);
  }, [A, Ce, X, K]), y.useEffect(() => {
    if (!A)
      return;
    const Qe = K.current;
    typeof Qe != "function" && hb(Qe) && Qe.current !== Nt.current && (Ce.setPositionReference(Qe.current), Nt.current = Qe.current);
  }, [A, Ce, X, K]), y.useEffect(() => {
    if (C && A && he.reference && he.floating)
      return lb(he.reference, he.floating, He, we);
  }, [C, A, he, He, we]);
  const et = Ln(ae), gt = Dx(i, et, Y), zt = No(ae) || "center", yt = !!Oe.hide?.referenceHidden;
  xe(() => {
    N && A && Ue && H(et);
  }, [N, A, Ue, et]);
  const Mn = y.useMemo(() => ({
    position: "absolute",
    top: Oe.arrow?.y,
    left: Oe.arrow?.x
  }), [Oe.arrow]), An = Oe.arrow?.centerOffset !== 0;
  return y.useMemo(() => ({
    positionerStyles: pt,
    arrowStyles: Mn,
    arrowRef: oe,
    arrowUncentered: An,
    side: gt,
    align: zt,
    physicalSide: et,
    anchorHidden: yt,
    refs: Ce,
    context: pe,
    isPositioned: Ue,
    update: He
  }), [pt, Mn, oe, An, gt, zt, et, yt, Ce, pe, Ue, He]);
}
function hb(n) {
  return n != null && "current" in n;
}
function ug(n) {
  const {
    children: o,
    elementsRef: a,
    labelsRef: i,
    onMapChange: u
  } = n, f = ze(u), p = y.useRef(0), g = xn(gM).current, m = xn(pM).current, [d, v] = y.useState(0), b = y.useRef(d), S = ze((z, M) => {
    m.set(z, M ?? null), b.current += 1, v(b.current);
  }), C = ze((z) => {
    m.delete(z), b.current += 1, v(b.current);
  }), w = y.useMemo(() => {
    const z = /* @__PURE__ */ new Map();
    return Array.from(m.keys()).filter((D) => D.isConnected).sort(mM).forEach((D, N) => {
      const L = m.get(D) ?? {};
      z.set(D, {
        ...L,
        index: N
      });
    }), z;
  }, [m, d]);
  xe(() => {
    if (typeof MutationObserver != "function" || w.size === 0)
      return;
    const z = new MutationObserver((M) => {
      const D = /* @__PURE__ */ new Set(), N = (L) => D.has(L) ? D.delete(L) : D.add(L);
      M.forEach((L) => {
        L.removedNodes.forEach(N), L.addedNodes.forEach(N);
      }), D.size === 0 && (b.current += 1, v(b.current));
    });
    return w.forEach((M, D) => {
      D.parentElement && z.observe(D.parentElement, {
        childList: !0
      });
    }), () => {
      z.disconnect();
    };
  }, [w]), xe(() => {
    b.current === d && (a.current.length !== w.size && (a.current.length = w.size), i && i.current.length !== w.size && (i.current.length = w.size), p.current = w.size), f(w);
  }, [f, w, a, i, d]), xe(() => () => {
    a.current = [];
  }, [a]), xe(() => () => {
    i && (i.current = []);
  }, [i]);
  const A = ze((z) => (g.add(z), () => {
    g.delete(z);
  }));
  xe(() => {
    g.forEach((z) => z(w));
  }, [g, w]);
  const T = y.useMemo(() => ({
    register: S,
    unregister: C,
    subscribeMapChange: A,
    elementsRef: a,
    labelsRef: i,
    nextIndexRef: p
  }), [S, C, A, a, i, p]);
  return /* @__PURE__ */ x.jsx(Cx.Provider, {
    value: T,
    children: o
  });
}
function pM() {
  return /* @__PURE__ */ new Map();
}
function gM() {
  return /* @__PURE__ */ new Set();
}
function mM(n, o) {
  const a = n.compareDocumentPosition(o);
  return a & Node.DOCUMENT_POSITION_FOLLOWING || a & Node.DOCUMENT_POSITION_CONTAINED_BY ? -1 : a & Node.DOCUMENT_POSITION_PRECEDING || a & Node.DOCUMENT_POSITION_CONTAINS ? 1 : 0;
}
function mu(n, o, {
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
  return g && (m.pointerEvents = "none"), nt("div", n, {
    state: o,
    ref: f,
    props: [{
      role: "presentation",
      hidden: p,
      style: m
    }, zi(i), u],
    stateAttributesMapping: _o
  });
}
const hM = 20;
function fg(n, o, a, i) {
  const [u, f] = y.useState(!1);
  xe(() => {
    if (!n || !o || a == null) {
      f(!1);
      return;
    }
    const p = tt(a).documentElement.clientWidth, g = a.offsetWidth;
    f(p > 0 && g > 0 && g >= p - hM);
  }, [n, o, a]), o0(n && (!o || u), i);
}
const yM = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    anchor: i,
    positionMethod: u = "absolute",
    className: f,
    render: p,
    side: g,
    align: m,
    sideOffset: d = 0,
    alignOffset: v = 0,
    collisionBoundary: b = "clipping-ancestors",
    collisionPadding: S = 5,
    arrowPadding: C = 5,
    sticky: w = !1,
    disableAnchorTracking: A = !1,
    collisionAvoidance: T = A0,
    style: z,
    ...M
  } = o, {
    store: D
  } = ml(), N = aM(), L = fu(!0), j = D.useState("parent"), H = D.useState("floatingRootContext"), k = D.useState("floatingTreeRoot"), G = D.useState("mounted"), E = D.useState("open"), Z = D.useState("modal"), J = D.useState("openMethod"), X = D.useState("activeTriggerElement"), K = D.useState("transitionStatus"), q = D.useState("positionerElement"), _ = D.useState("instantType"), Y = D.useState("hasViewport"), V = D.useState("lastOpenChangeReason"), Q = D.useState("floatingNodeId"), B = D.useState("floatingParentNodeId"), O = H.useState("domReferenceElement"), U = y.useRef(null), ne = Jp(q, !1, !1);
  let $ = i, re = d, ie = v, oe = m, se = T;
  j.type === "context-menu" && ($ = i ?? j.context?.anchor, oe = oe ?? "start", !g && oe !== "center" && (ie = o.alignOffset ?? 2, re = o.sideOffset ?? -5));
  let ge = g, je = oe;
  j.type === "menu" ? (ge = ge ?? "inline-end", je = je ?? "start", se = o.collisionAvoidance ?? qp) : j.type === "menubar" && (ge = ge ?? (j.context.orientation === "vertical" ? "inline-end" : "bottom"), je = je ?? "start");
  const Ee = j.type === "context-menu", fe = gu({
    anchor: $,
    floatingRootContext: H,
    positionMethod: L ? "fixed" : u,
    mounted: G,
    side: ge,
    sideOffset: re,
    align: je,
    alignOffset: ie,
    arrowPadding: Ee ? 0 : C,
    collisionBoundary: b,
    collisionPadding: S,
    sticky: w,
    nodeId: Q,
    keepMounted: N,
    disableAnchorTracking: A,
    collisionAvoidance: se,
    shiftCrossAxis: Ee && !("side" in se && se.side === "flip"),
    externalTree: k,
    adaptiveOrigin: Y ? cg : void 0
  });
  y.useEffect(() => {
    function Se(Te) {
      Te.open && (Te.parentNodeId === Q && D.set("hoverEnabled", !1), Te.nodeId !== Q && Te.parentNodeId === D.select("floatingParentNodeId") && D.setOpen(!1, Ye(si)));
    }
    return k.events.on("menuopenchange", Se), () => {
      k.events.off("menuopenchange", Se);
    };
  }, [D, k.events, Q]), y.useEffect(() => {
    if (D.select("floatingParentNodeId") == null)
      return;
    function Se(Te) {
      if (Te.open || Te.nodeId !== D.select("floatingParentNodeId"))
        return;
      const Oe = Te.reason ?? si;
      D.setOpen(!1, Ye(Oe));
    }
    return k.events.on("menuopenchange", Se), () => {
      k.events.off("menuopenchange", Se);
    };
  }, [k.events, D]);
  const ye = sn();
  y.useEffect(() => {
    E || ye.clear();
  }, [E, ye]), y.useEffect(() => {
    function Se(Te) {
      if (!(!E || Te.nodeId !== D.select("floatingParentNodeId")))
        if (Te.target && X && X !== Te.target) {
          const Oe = D.select("closeDelay");
          Oe > 0 ? ye.isStarted() || ye.start(Oe, () => {
            D.setOpen(!1, Ye(si));
          }) : D.setOpen(!1, Ye(si));
        } else
          ye.clear();
    }
    return k.events.on("itemhover", Se), () => {
      k.events.off("itemhover", Se);
    };
  }, [k.events, E, X, D, ye]), y.useEffect(() => {
    const Se = {
      open: E,
      nodeId: Q,
      parentNodeId: B,
      reason: D.select("lastOpenChangeReason")
    };
    k.events.emit("menuopenchange", Se);
  }, [k.events, E, D, Q, B]), xe(() => {
    const Se = O, Te = U.current;
    if (Se && (U.current = Se), Te && Se && Se !== Te) {
      D.set("instantType", void 0);
      const Oe = new AbortController();
      return ne(() => {
        D.set("instantType", "trigger-change");
      }, Oe.signal), () => {
        Oe.abort();
      };
    }
  }, [O, ne, D]);
  const Re = {
    open: E,
    side: fe.side,
    align: fe.align,
    anchorHidden: fe.anchorHidden,
    nested: j.type === "menu",
    instant: _
  }, _e = j.type === "menubar" && j.context.modal;
  fg(E && (_e || Z && V !== Pt), J === "touch", q, X);
  const we = mu(o, Re, {
    styles: fe.positionerStyles,
    transitionStatus: K,
    props: M,
    refs: [a, D.useStateSetter("positionerElement")],
    hidden: !G,
    inert: !E
  }), Ce = G && j.type !== "menu" && (j.type !== "menubar" && Z && V !== Pt || j.type === "menubar" && j.context.modal);
  let he = null;
  return j.type === "menubar" ? he = j.context.contentElement : j.type === void 0 && (he = X), /* @__PURE__ */ x.jsxs(wx.Provider, {
    value: fe,
    children: [Ce && /* @__PURE__ */ x.jsx(cu, {
      ref: j.type === "context-menu" || j.type === "nested-context-menu" ? j.context.internalBackdropRef : null,
      inert: su(!E),
      cutout: he
    }), /* @__PURE__ */ x.jsx(H0, {
      id: Q,
      children: /* @__PURE__ */ x.jsx(ug, {
        elementsRef: D.context.itemDomElements,
        labelsRef: D.context.itemLabels,
        children: we
      })
    })]
  });
}), vM = /* @__PURE__ */ y.createContext(null);
function Nx(n) {
  return y.useContext(vM);
}
const bM = {
  ...tu,
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
class dg extends Oi {
  constructor(o) {
    super({
      ...xM(),
      ...o
    }, {
      positionerRef: /* @__PURE__ */ y.createRef(),
      popupRef: /* @__PURE__ */ y.createRef(),
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
      triggerFocusTargetRef: /* @__PURE__ */ y.createRef(),
      beforeContentFocusGuardRef: /* @__PURE__ */ y.createRef(),
      onOpenChangeComplete: void 0,
      triggerElements: new sa()
    }, bM), this.unsubscribeParentListener = this.observe("parent", (a) => {
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
    const i = xn(() => new dg(a)).current;
    return o ?? i;
  }
  unsubscribeParentListener = null;
}
function xM() {
  return {
    ...eu(),
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
    floatingTreeRoot: new Xp(),
    floatingNodeId: void 0,
    floatingParentNodeId: null,
    itemProps: xt,
    keyboardEventRelay: void 0,
    closeDelay: 0,
    hasViewport: !1
  };
}
const jx = /* @__PURE__ */ y.createContext(void 0);
function kx() {
  return y.useContext(jx);
}
const _x = Zp(function(o) {
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
    actionsRef: b,
    closeParentOnEsc: S = !1,
    handle: C,
    triggerId: w,
    defaultTriggerId: A = null,
    highlightItemOnHover: T = !0
  } = o, z = fu(!0), M = ml(!0), D = Nx(!0), N = kx(), L = y.useMemo(() => N && M ? {
    type: "menu",
    store: M.store
  } : D ? {
    type: "menubar",
    context: D
  } : z && !M ? {
    type: "context-menu",
    context: z
  } : {
    type: void 0
  }, [z, M, D, N]), j = dg.useStore(C?.store, {
    open: p,
    openProp: i,
    activeTriggerId: A,
    triggerIdProp: w,
    parent: L
  });
  eg(j, i, p, A), j.useControlledProp("openProp", i), j.useControlledProp("triggerIdProp", w), j.useContextCallback("onOpenChangeComplete", f);
  const H = rr(), k = rr(), G = j.useState("floatingTreeRoot"), E = Fp(G), Z = Ql(), J = j.useState("open"), X = j.useState("activeTriggerElement"), K = j.useState("positionerElement"), q = j.useState("hoverEnabled"), _ = j.useState("disabled"), Y = j.useState("lastOpenChangeReason"), V = j.useState("parent"), Q = j.useState("activeIndex"), B = j.useState("payload"), O = j.useState("floatingParentNodeId"), U = y.useRef(null), ne = y.useRef(V.type !== "context-menu"), $ = sn(), re = y.useRef(!0), ie = sn(), oe = O != null, {
    openMethod: se,
    triggerProps: ge
  } = Sx(J);
  j.useSyncedValues({
    disabled: g,
    highlightItemOnHover: T,
    modal: V.type === void 0 ? m : void 0,
    openMethod: se,
    rootId: H
  }), Jc(j);
  const {
    forceUnmount: je
  } = $c(J, j, () => {
    j.update({
      allowMouseEnter: !1,
      stickIfOpen: !0
    });
  });
  xe(() => {
    z && !M ? j.update({
      parent: {
        type: "context-menu",
        context: z
      },
      floatingNodeId: E,
      floatingParentNodeId: Z
    }) : M && j.update({
      floatingNodeId: E,
      floatingParentNodeId: Z
    });
  }, [z, M, E, Z, j]), y.useEffect(() => {
    if (J || (U.current = null), V.type === "context-menu") {
      if (!J) {
        $.clear(), ne.current = !1;
        return;
      }
      $.start(500, () => {
        ne.current = !0;
      });
    }
  }, [$, J, V.type]), xe(() => {
    !J && !q && j.set("hoverEnabled", !0);
  }, [J, q, j]);
  const Ee = ze((be, We) => {
    const rt = We.reason;
    if (J === be && We.trigger === X && Y === rt)
      return;
    const pt = Wp(We);
    if (!be && We.trigger == null && (We.trigger = X ?? void 0), u?.(be, We), We.isCanceled)
      return;
    j.state.floatingRootContext.dispatchOpenChange(be, We);
    const Nt = We.event;
    if (be === !1 && Nt?.type === "click" && Nt.pointerType === "touch" && !re.current)
      return;
    be && rt === Jr ? (re.current = !1, ie.start(300, () => {
      re.current = !0;
    })) : (re.current = !0, ie.clear());
    const et = (rt === Xl || rt === $r) && Nt.detail === 0 && Nt?.isTrusted, gt = !be && (rt === Ti || rt == null), zt = {
      open: be,
      openChangeReason: rt
    };
    U.current = We.event ?? null, Zc(zt, be, We.trigger, pt()), j.update(zt), V.type === "menubar" && (rt === Jr || rt === Ro || rt === Pt || rt === cp || rt === si) ? j.set("instantType", "group") : et || gt ? j.set("instantType", et ? "click" : "dismiss") : j.set("instantType", void 0);
  }), fe = Z0({
    popupStore: j,
    floatingId: k,
    nested: Z != null,
    onOpenChange: Ee
  }), ye = fe.context.events;
  y.useEffect(() => {
    const be = ({
      open: We,
      eventDetails: rt
    }) => Ee(We, rt);
    return ye.on("setOpen", be), () => {
      ye?.off("setOpen", be);
    };
  }, [ye, Ee]);
  const Re = y.useCallback(() => {
    j.setOpen(!1, Ye(Pc));
  }, [j]);
  y.useImperativeHandle(b, () => ({
    unmount: je,
    close: Re
  }), [je, Re]);
  let _e;
  V.type === "context-menu" && (_e = V.context), y.useImperativeHandle(_e?.positionerRef, () => K, [K]), y.useImperativeHandle(_e?.actionsRef, () => ({
    setOpen: Ee
  }), [Ee]);
  const ke = Ci(fe, {
    enabled: !_,
    bubbles: {
      escapeKey: S && V.type === "menu"
    },
    outsidePress() {
      return V.type !== "context-menu" || U.current?.type === "contextmenu" ? !0 : ne.current;
    },
    externalTree: oe ? G : void 0
  }), we = pu(), Ce = y.useCallback((be) => {
    j.select("activeIndex") !== be && j.set("activeIndex", be);
  }, [j]), he = ox(fe, {
    enabled: !_,
    listRef: j.context.itemDomElements,
    activeIndex: Q,
    nested: V.type !== void 0,
    loopFocus: d,
    orientation: v,
    parentOrientation: V.type === "menubar" ? V.context.orientation : void 0,
    rtl: we === "rtl",
    disabledIndices: ql,
    onNavigate: Ce,
    openOnArrowKeyDown: V.type !== "context-menu",
    externalTree: oe ? G : void 0,
    focusItemOnHover: T
  }), Se = y.useCallback((be) => {
    j.context.typingRef.current = be;
  }, [j]), Te = rx(fe, {
    enabled: !_,
    listRef: j.context.itemLabels,
    elementsRef: j.context.itemDomElements,
    activeIndex: Q,
    resetMs: PR,
    onMatch: (be) => {
      J && be !== Q && j.set("activeIndex", be);
    },
    onTyping: Se
  }), Oe = y.useMemo(() => {
    const be = bn(Te.reference, he.reference, ke.reference, {
      onMouseMove() {
        j.set("allowMouseEnter", !0);
      }
    }, ge);
    return be["aria-haspopup"] = "menu", be["aria-expanded"] = J, be;
  }, [j, Te.reference, he.reference, ke.reference, ge, J]), He = y.useMemo(() => {
    const be = bn(he.trigger, ke.trigger, ge);
    return be["aria-haspopup"] = "menu", be["aria-expanded"] = !1, be;
  }, [he.trigger, ke.trigger, ge]), ae = y.useMemo(() => bn(ia, {
    id: k,
    role: "menu",
    "aria-labelledby": X?.id,
    onMouseMove() {
      j.set("allowMouseEnter", !0), V.type === "menu" && j.set("hoverEnabled", !1);
    },
    onClick() {
      j.select("hoverEnabled") && j.set("hoverEnabled", !1);
    },
    onKeyDown(be) {
      const We = j.select("keyboardEventRelay");
      We && !be.isPropagationStopped() && We(be);
    }
  }, Te.floating, he.floating, ke.floating), [X, k, V.type, j, Te.floating, he.floating, ke.floating]), pe = he.item ?? xt;
  Wc(j, {
    floatingRootContext: fe,
    activeTriggerProps: Oe,
    inactiveTriggerProps: He,
    popupProps: ae,
    itemProps: pe
  });
  const Ue = y.useMemo(() => ({
    store: j,
    parent: L
  }), [j, L]), ve = /* @__PURE__ */ x.jsx(Ex.Provider, {
    value: Ue,
    children: typeof a == "function" ? a({
      payload: B
    }) : a
  });
  return V.type === void 0 || V.type === "context-menu" ? /* @__PURE__ */ x.jsx(U0, {
    externalTree: G,
    children: ve
  }) : ve;
});
function SM(n) {
  const o = ml().store, a = y.useMemo(() => ({
    parentMenu: o
  }), [o]);
  return /* @__PURE__ */ x.jsx(jx.Provider, {
    value: a,
    children: /* @__PURE__ */ x.jsx(_x, {
      ...n
    })
  });
}
function Hx(n) {
  const o = n.getBoundingClientRect(), a = Dt(n);
  if (Hp)
    return o;
  const i = a.getComputedStyle(n, "::before"), u = a.getComputedStyle(n, "::after");
  if (!(i.content !== "none" || u.content !== "none"))
    return o;
  const p = parseFloat(i.width) || 0, g = parseFloat(i.height) || 0, m = parseFloat(u.width) || 0, d = parseFloat(u.height) || 0, v = Math.max(o.width, p, m), b = Math.max(o.height, g, d), S = v - o.width, C = b - o.height;
  return {
    left: o.left - S / 2,
    right: o.right + S / 2,
    top: o.top - C / 2,
    bottom: o.bottom + C / 2
  };
}
function wM(n = {}) {
  const {
    highlightItemOnHover: o,
    highlightedIndex: a,
    onHighlightedIndexChange: i
  } = zp(), {
    ref: u,
    index: f
  } = Ai(n), p = a === f, g = y.useRef(null), m = To(u, g);
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
        const b = v.hasAttribute("disabled") || v.ariaDisabled === "true";
        !p && !b && v.focus();
      }
    },
    compositeRef: m,
    index: f
  };
}
function Ux(n) {
  const {
    render: o,
    className: a,
    style: i,
    state: u = xt,
    props: f = ql,
    refs: p = ql,
    metadata: g,
    stateAttributesMapping: m,
    tag: d = "div",
    ...v
  } = n, {
    compositeProps: b,
    compositeRef: S
  } = wM({
    metadata: g
  });
  return nt(d, n, {
    state: u,
    ref: [...p, S],
    props: [b, ...f, v],
    stateAttributesMapping: m
  });
}
function Lx(n) {
  if (Ct(n) && n.hasAttribute("data-rootownerid"))
    return n.getAttribute("data-rootownerid") ?? void 0;
  if (!Vl(n))
    return Lx(Gl(n));
}
function Ix(n, o) {
  const a = y.useRef(null);
  function i(f) {
    gl.flushSync(() => {
      n.setOpen(!1, Ye(Ro, f.nativeEvent, f.currentTarget));
    }), UR(a.current)?.focus();
  }
  function u(f) {
    const p = n.select("positionerElement");
    if (p && Wr(f, p))
      n.context.beforeContentFocusGuardRef.current?.focus();
    else {
      gl.flushSync(() => {
        n.setOpen(!1, Ye(Ro, f.nativeEvent, f.currentTarget));
      });
      let g = HR(n.context.triggerFocusTargetRef.current || o.current);
      for (; g !== null && Le(p, g); ) {
        const m = g;
        if (g = Gp(g), g === m)
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
function EM(n) {
  const {
    enabled: o = !0,
    mouseDownAction: a,
    open: i
  } = n, u = y.useRef(!1);
  return y.useMemo(() => o ? {
    onMouseDown: (f) => {
      (a === "open" && !i || a === "close" && i) && (u.current = !0, tt(f.currentTarget).addEventListener("click", () => {
        u.current = !1;
      }, {
        once: !0
      }));
    },
    onClick: (f) => {
      u.current && (u.current = !1, f.preventBaseUIHandler());
    }
  } : xt, [o, a, i]);
}
const nc = 2, TM = K0(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    disabled: p = !1,
    nativeButton: g = !0,
    id: m,
    openOnHover: d,
    delay: v = 100,
    closeDelay: b = 0,
    handle: S,
    payload: C,
    ...w
  } = o, A = ml(!0), T = S?.store ?? A?.store;
  if (!T)
    throw new Error(At(85));
  const z = Bn(m), M = T.useState("isTriggerActive", z), D = T.useState("floatingRootContext"), N = T.useState("isOpenedByTrigger", z), L = T.useState("triggerPopupId", z), j = y.useRef(null), H = CM(), k = zp(!0), G = jo(), E = y.useMemo(() => G ?? new Xp(), [G]), Z = Fp(E), J = Ql(), {
    registerTrigger: X,
    isMountedByThisTrigger: K
  } = tg(z, j, T, {
    payload: C,
    closeDelay: b,
    parent: H,
    floatingTreeRoot: E,
    floatingNodeId: Z,
    floatingParentNodeId: J,
    keyboardEventRelay: k?.relayKeyboardEvent
  }), q = H.type === "menubar", _ = T.useState("disabled"), Y = p || _ || q && H.context.disabled, {
    getButtonProps: V,
    buttonRef: Q
  } = Mo({
    disabled: Y,
    native: g
  });
  y.useEffect(() => {
    !N && H.type === void 0 && (T.context.allowMouseUpTriggerRef.current = !1);
  }, [T, N, H.type]);
  const B = y.useRef(null), O = sn(), U = ze((he) => {
    if (!B.current)
      return;
    O.clear(), T.context.allowMouseUpTriggerRef.current = !1;
    const Se = he.target;
    if (Le(B.current, Se) || Le(T.select("positionerElement"), Se) || Se === B.current || Se != null && Lx(Se) === T.select("rootId"))
      return;
    const Te = Hx(B.current);
    he.clientX >= Te.left - nc && he.clientX <= Te.right + nc && he.clientY >= Te.top - nc && he.clientY <= Te.bottom + nc || E.events.emit("close", {
      domEvent: he,
      reason: u0
    });
  });
  y.useEffect(() => {
    N && T.select("lastOpenChangeReason") === Pt && tt(B.current).addEventListener("mouseup", U, {
      once: !0
    });
  }, [N, U, T]);
  const ne = q && H.context.hasSubmenuOpen, re = nu(D, {
    enabled: (d ?? ne) && !Y && H.type !== "context-menu" && (!q || ne && !K),
    handleClose: ou({
      blockPointerEvents: !q
    }),
    mouseOnly: !0,
    move: !1,
    restMs: H.type === void 0 ? v : void 0,
    delay: {
      close: b
    },
    triggerElementRef: j,
    externalTree: E,
    isActiveTrigger: M,
    isClosing: () => T.select("transitionStatus") === "ending"
  }), ie = RM(N, T.select("lastOpenChangeReason")), oe = Xc(D, {
    enabled: !Y && H.type !== "context-menu",
    event: N && q ? "click" : "mousedown",
    toggle: !0,
    ignoreMouse: !1,
    stickIfOpen: H.type === void 0 ? ie : !1
  }), se = nx(D, {
    enabled: !Y && ne
  }), ge = EM({
    open: N,
    enabled: q,
    mouseDownAction: "open"
  }), je = y.useMemo(() => bn(se.reference, oe.reference), [se.reference, oe.reference]), Ee = T.useState("triggerProps", K), {
    preFocusGuardRef: fe,
    handlePreFocusGuardFocus: ye,
    handleFocusTargetFocus: Re
  } = Ix(T, j), _e = {
    disabled: Y,
    open: N
  }, ke = [B, a, Q, X, j], we = [je, re ?? xt, Ee, {
    "aria-haspopup": "menu",
    "aria-controls": L,
    id: z,
    onMouseDown: (he) => {
      if (T.select("open"))
        return;
      O.start(200, () => {
        T.context.allowMouseUpTriggerRef.current = !0;
      }), tt(he.currentTarget).addEventListener("mouseup", U, {
        once: !0
      });
    }
  }, q ? {
    role: "menuitem"
  } : {}, ge, w, V], Ce = nt("button", o, {
    enabled: !q,
    stateAttributesMapping: Mc,
    state: _e,
    ref: ke,
    props: we
  });
  return q ? /* @__PURE__ */ x.jsx(Ux, {
    tag: "button",
    render: i,
    className: u,
    style: f,
    state: _e,
    refs: ke,
    props: we,
    stateAttributesMapping: Mc
  }) : N ? /* @__PURE__ */ x.jsxs(y.Fragment, {
    children: [/* @__PURE__ */ x.jsx(Co, {
      ref: fe,
      onFocus: ye
    }, `${z}-pre-focus-guard`), /* @__PURE__ */ x.jsx(y.Fragment, {
      children: Ce
    }, z), /* @__PURE__ */ x.jsx(Co, {
      ref: T.context.triggerFocusTargetRef,
      onFocus: Re
    }, `${z}-post-focus-guard`)]
  }) : /* @__PURE__ */ x.jsx(y.Fragment, {
    children: Ce
  }, z);
});
function RM(n, o) {
  const a = sn(), [i, u] = y.useState(!1);
  return xe(() => {
    n && o === "trigger-hover" ? (u(!0), a.start(O0, () => {
      u(!1);
    })) : n || (a.clear(), u(!1));
  }, [n, o, a]), i;
}
function CM() {
  const n = fu(!0), o = ml(!0), a = Nx();
  return y.useMemo(() => a ? {
    type: "menubar",
    context: a
  } : n && !o ? {
    type: "context-menu",
    context: n
  } : {
    type: void 0
  }, [n, o, a]);
}
function OM(n) {
  const [o, a] = y.useState({
    current: n,
    previous: null
  });
  return n !== o.current && a({
    current: n,
    previous: o.current
  }), o.previous;
}
const Bx = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    className: i,
    render: u,
    orientation: f = "horizontal",
    style: p,
    ...g
  } = o;
  return nt("div", o, {
    state: {
      orientation: f
    },
    ref: a,
    props: [{
      role: "separator",
      "aria-orientation": f
    }, g]
  });
});
function Vx(n) {
  return n == null || n.hasAttribute("disabled") || n.getAttribute("aria-disabled") === "true";
}
const MM = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    label: p,
    id: g,
    nativeButton: m = !1,
    openOnHover: d = !0,
    delay: v = 100,
    closeDelay: b = 0,
    disabled: S = !1,
    ...C
  } = o, w = Ai({
    label: p
  }), A = uu(), {
    store: T
  } = ml(), z = Bn(g), M = T.useState("open"), D = T.useState("floatingRootContext"), N = T.useState("floatingTreeRoot"), L = T.useState("triggerPopupId", z), j = $0(z, T), H = y.useCallback((oe) => {
    const se = j(oe);
    return oe !== null && T.select("open") && T.select("activeTriggerId") == null && T.update({
      activeTriggerId: z,
      activeTriggerElement: oe,
      closeDelay: b
    }), se;
  }, [j, b, T, z]), k = y.useRef(null), G = y.useCallback((oe) => {
    k.current = oe, T.set("activeTriggerElement", oe);
  }, [T]), E = kx();
  if (!E?.parentMenu)
    throw new Error(At(37));
  T.useSyncedValue("closeDelay", b);
  const Z = E.parentMenu, J = T.useState("disabled"), X = Z.useState("disabled"), K = S || J || X, q = Z.useState("itemProps"), _ = Z.useState("isActive", w.index), Y = y.useMemo(() => ({
    type: "submenu-trigger",
    setActive() {
      Z.select("highlightItemOnHover") && Z.set("activeIndex", w.index);
    }
  }), [Z, w.index]), {
    getItemProps: V,
    itemRef: Q
  } = sg({
    closeOnClick: !1,
    disabled: K,
    highlighted: _,
    id: z,
    store: T,
    typingRef: Z.context.typingRef,
    nativeButton: m,
    itemMetadata: Y,
    nodeId: A?.context.nodeId
  }), B = T.useState("hoverEnabled"), O = nu(D, {
    enabled: B && d && !K,
    handleClose: ou({
      blockPointerEvents: !0
    }),
    mouseOnly: !0,
    move: !0,
    restMs: v,
    delay: {
      open: v,
      close: b
    },
    shouldOpen: v > 0 ? () => Z.select("allowMouseEnter") : void 0,
    triggerElementRef: k,
    externalTree: N,
    isClosing: () => T.select("transitionStatus") === "ending"
  }), ne = Xc(D, {
    enabled: !K,
    event: "mousedown",
    toggle: !d,
    ignoreMouse: d,
    stickIfOpen: !1
  }).reference ?? xt, $ = T.useState("triggerProps", !0);
  return delete $.id, nt("div", o, {
    state: {
      disabled: K,
      highlighted: _,
      open: M
    },
    stateAttributesMapping: ru,
    props: [ne, O, $, q, {
      "aria-controls": L,
      tabIndex: M || _ ? 0 : -1,
      onBlur() {
        _ && Z.set("activeIndex", null);
      }
    }, C, V],
    ref: [a, w.ref, Q, H, G]
  });
});
function oi({ ...n }) {
  return /* @__PURE__ */ x.jsx(_x, { "data-slot": "dropdown-menu", ...n });
}
function ri({ ...n }) {
  return /* @__PURE__ */ x.jsx(TM, { "data-slot": "dropdown-menu-trigger", ...n });
}
function Qr({
  align: n = "start",
  alignOffset: o = 0,
  side: a = "bottom",
  sideOffset: i = 4,
  className: u,
  ...f
}) {
  return /* @__PURE__ */ x.jsx(iM, { children: /* @__PURE__ */ x.jsx(
    yM,
    {
      className: "tw:isolate tw:z-[var(--z-popover)] tw:outline-none",
      align: n,
      alignOffset: o,
      side: a,
      sideOffset: i,
      children: /* @__PURE__ */ x.jsx(
        rM,
        {
          "data-slot": "dropdown-menu-content",
          className: Ke("tw:max-h-(--available-height) tw:w-(--anchor-width) tw:min-w-32 tw:origin-(--transform-origin) tw:overflow-x-hidden tw:overflow-y-auto tw:rounded-[var(--radius-control)] tw:bg-popover tw:p-1 tw:text-[var(--fs-body-s)] tw:text-popover-foreground tw:shadow-md tw:ring-1 tw:ring-foreground/10 tw:outline-none", u),
          ...f
        }
      )
    }
  ) });
}
function Ul({ ...n }) {
  return /* @__PURE__ */ x.jsx(eM, { "data-slot": "dropdown-menu-group", ...n });
}
function AM({
  className: n,
  inset: o,
  ...a
}) {
  return /* @__PURE__ */ x.jsx(
    tM,
    {
      "data-slot": "dropdown-menu-label",
      "data-inset": o,
      className: Ke(
        "tw:px-1.5 tw:py-1 tw:text-[var(--fs-caption)] tw:font-medium tw:text-muted-foreground tw:data-inset:pl-7",
        n
      ),
      ...a
    }
  );
}
function tr({
  className: n,
  inset: o,
  variant: a = "default",
  ...i
}) {
  return /* @__PURE__ */ x.jsx(
    nM,
    {
      "data-slot": "dropdown-menu-item",
      "data-inset": o,
      "data-variant": a,
      className: Ke(
        "tw:group/dropdown-menu-item tw:relative tw:flex tw:cursor-default tw:items-center tw:gap-1.5 tw:rounded-[var(--radius-control)] tw:px-1.5 tw:py-1 tw:text-[var(--fs-body-s)] tw:outline-hidden tw:select-none tw:focus:bg-accent tw:focus:text-accent-foreground tw:not-data-[variant=destructive]:focus:**:text-accent-foreground tw:data-inset:pl-7 tw:data-[variant=destructive]:text-destructive tw:data-[variant=destructive]:focus:bg-destructive/10 tw:data-[variant=destructive]:focus:text-destructive tw:data-disabled:pointer-events-none tw:data-disabled:opacity-50 tw:[&_svg]:pointer-events-none tw:[&_svg]:shrink-0 tw:[&_svg:not([class*=size-])]:size-4 tw:data-[variant=destructive]:*:[svg]:text-destructive",
        n
      ),
      ...i
    }
  );
}
function zM({ ...n }) {
  return /* @__PURE__ */ x.jsx(SM, { "data-slot": "dropdown-menu-sub", ...n });
}
function DM({
  className: n,
  inset: o,
  children: a,
  ...i
}) {
  return /* @__PURE__ */ x.jsxs(
    MM,
    {
      "data-slot": "dropdown-menu-sub-trigger",
      "data-inset": o,
      className: Ke(
        "tw:flex tw:cursor-default tw:items-center tw:gap-1.5 tw:rounded-[var(--radius-control)] tw:px-1.5 tw:py-1 tw:text-[var(--fs-body-s)] tw:outline-hidden tw:select-none tw:focus:bg-accent tw:focus:text-accent-foreground tw:not-data-[variant=destructive]:focus:**:text-accent-foreground tw:data-inset:pl-7 tw:data-popup-open:bg-accent tw:data-popup-open:text-accent-foreground tw:data-open:bg-accent tw:data-open:text-accent-foreground tw:[&_svg]:pointer-events-none tw:[&_svg]:shrink-0 tw:[&_svg:not([class*=size-])]:size-4",
        n
      ),
      ...i,
      children: [
        a,
        /* @__PURE__ */ x.jsx(ep, { className: "tw:ml-auto" })
      ]
    }
  );
}
function NM({
  align: n = "start",
  alignOffset: o = -3,
  side: a = "right",
  sideOffset: i = 0,
  className: u,
  ...f
}) {
  return /* @__PURE__ */ x.jsx(
    Qr,
    {
      "data-slot": "dropdown-menu-sub-content",
      className: Ke("tw:w-auto tw:min-w-[96px] tw:rounded-[var(--radius-control)] tw:bg-popover tw:p-1 tw:text-popover-foreground tw:shadow-lg tw:ring-1 tw:ring-foreground/10", u),
      align: n,
      alignOffset: o,
      side: a,
      sideOffset: i,
      ...f
    }
  );
}
function lc({
  className: n,
  children: o,
  checked: a,
  inset: i,
  ...u
}) {
  return /* @__PURE__ */ x.jsxs(
    JO,
    {
      "data-slot": "dropdown-menu-checkbox-item",
      "data-inset": i,
      className: Ke(
        "tw:relative tw:flex tw:cursor-default tw:items-center tw:gap-1.5 tw:rounded-[var(--radius-control)] tw:py-1 tw:pr-8 tw:pl-1.5 tw:text-[var(--fs-body-s)] tw:outline-hidden tw:select-none tw:focus:bg-accent tw:focus:text-accent-foreground tw:focus:**:text-accent-foreground tw:data-inset:pl-7 tw:data-disabled:pointer-events-none tw:data-disabled:opacity-50 tw:[&_svg]:pointer-events-none tw:[&_svg]:shrink-0 tw:[&_svg:not([class*=size-])]:size-4",
        n
      ),
      checked: a,
      ...u,
      children: [
        /* @__PURE__ */ x.jsx(
          "span",
          {
            className: "tw:pointer-events-none tw:absolute tw:right-2 tw:flex tw:items-center tw:justify-center",
            "data-slot": "dropdown-menu-checkbox-item-indicator",
            children: /* @__PURE__ */ x.jsx($O, { children: /* @__PURE__ */ x.jsx(
              gc,
              {}
            ) })
          }
        ),
        o
      ]
    }
  );
}
function Qd({
  className: n,
  ...o
}) {
  return /* @__PURE__ */ x.jsx(
    Bx,
    {
      "data-slot": "dropdown-menu-separator",
      className: Ke("tw:-mx-1 tw:my-1 tw:h-px tw:bg-border", n),
      ...o
    }
  );
}
let yb = /* @__PURE__ */ (function(n) {
  return n.disabled = "data-disabled", n.valid = "data-valid", n.invalid = "data-invalid", n.touched = "data-touched", n.dirty = "data-dirty", n.filled = "data-filled", n.focused = "data-focused", n;
})({});
const jM = {
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
}, ci = {
  valid: null,
  touched: !1,
  dirty: !1,
  filled: !1,
  focused: !1
}, kM = {
  disabled: !1,
  ...ci
}, Px = {
  valid(n) {
    return n === null ? null : n ? {
      [yb.valid]: ""
    } : {
      [yb.invalid]: ""
    };
  }
}, _M = {
  invalid: void 0,
  name: void 0,
  validityData: {
    state: jM,
    errors: [],
    error: "",
    value: "",
    initialValue: null
  },
  setValidityData: an,
  disabled: void 0,
  touched: ci.touched,
  setTouched: an,
  dirty: ci.dirty,
  setDirty: an,
  filled: ci.filled,
  setFilled: an,
  focused: ci.focused,
  setFocused: an,
  validate: () => null,
  validationMode: "onSubmit",
  validationDebounceTime: 0,
  shouldValidateOnChange: () => !1,
  state: kM,
  markedDirtyRef: {
    current: !1
  },
  registerFieldControl: an,
  validation: {
    getValidationProps: (n, o = xt) => o,
    inputRef: {
      current: null
    },
    registerInput: an,
    commit: async () => {
    },
    change: an
  }
}, HM = /* @__PURE__ */ y.createContext(_M);
function hu(n = !0) {
  const o = y.useContext(HM);
  if (o.setValidityData === an && !n)
    throw new Error(At(28));
  return o;
}
const UM = /* @__PURE__ */ y.createContext({
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
function Yx() {
  return y.useContext(UM);
}
const LM = /* @__PURE__ */ y.createContext({
  controlId: void 0,
  registerControlId: an,
  labelId: void 0,
  setLabelId: an,
  messageIds: [],
  setMessageIds: an,
  getDescriptionProps: (n) => n
});
function pg() {
  return y.useContext(LM);
}
function gg(n = {}) {
  const {
    id: o,
    implicit: a = !1,
    controlRef: i
  } = n, {
    controlId: u,
    registerControlId: f
  } = pg(), p = Bn(o), g = a ? u : void 0, m = xn(() => /* @__PURE__ */ Symbol("labelable-control")), d = y.useRef(!1), v = y.useRef(o != null), b = ze(() => {
    !d.current || f === an || (d.current = !1, f(m.current, void 0));
  });
  return xe(() => {
    if (f === an)
      return;
    let S;
    if (a) {
      const C = i?.current;
      $e(C) && C.closest("label") != null ? S = o ?? null : S = g ?? p;
    } else if (o != null)
      v.current = !0, S = o;
    else if (v.current)
      S = p;
    else {
      b();
      return;
    }
    if (S === void 0) {
      b();
      return;
    }
    d.current = !0, f(m.current, S);
  }, [o, i, g, f, a, p, m, b]), y.useEffect(() => b, [b]), u ?? p;
}
function Gx(n, o, a, i, u = !0, f) {
  const {
    registerFieldControl: p
  } = hu(), g = y.useRef(null);
  g.current || (g.current = /* @__PURE__ */ Symbol()), xe(() => {
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
const IM = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    id: f,
    name: p,
    value: g,
    disabled: m = !1,
    onValueChange: d,
    defaultValue: v,
    autoFocus: b = !1,
    style: S,
    ...C
  } = o, {
    state: w,
    name: A,
    disabled: T,
    setTouched: z,
    setDirty: M,
    validityData: D,
    setFocused: N,
    setFilled: L,
    validationMode: j,
    validation: H
  } = hu(), {
    clearErrors: k
  } = Yx(), G = T || m, E = A ?? p, Z = {
    ...w,
    disabled: G
  }, {
    labelId: J
  } = pg(), X = gg({
    id: f
  });
  xe(() => {
    const B = g != null;
    H.inputRef.current?.value || B && g !== "" ? L(!0) : B && g === "" && L(!1);
  }, [H.inputRef, L, g]);
  const K = y.useRef(null);
  xe(() => {
    b && K.current === vn(tt(K.current)) && N(!0);
  }, [b, N]);
  const [q] = ra({
    controlled: g,
    default: v,
    name: "FieldControl",
    state: "value"
  }), _ = g !== void 0, Y = _ ? q : void 0, V = ze(() => H.inputRef.current?.value);
  return Gx(H.inputRef, X, Y, V, !G, p), nt("input", o, {
    ref: [a, K],
    state: Z,
    props: [{
      id: X,
      disabled: G,
      name: E,
      ref: H.inputRef,
      "aria-labelledby": J,
      autoFocus: b,
      ..._ ? {
        value: Y
      } : {
        defaultValue: v
      },
      onChange(B) {
        const O = B.currentTarget.value;
        d?.(O, Ye(Do, B.nativeEvent)), M(O !== D.initialValue), L(O !== ""), B.nativeEvent.defaultPrevented || (k(E), H.change(O));
      },
      onFocus() {
        N(!0);
      },
      onBlur(B) {
        z(!0), N(!1), j === "onBlur" && H.commit(B.currentTarget.value);
      },
      onKeyDown(B) {
        B.currentTarget.tagName === "INPUT" && B.key === "Enter" && (z(!0), H.commit(B.currentTarget.value));
      }
    }, C, (B) => H.getValidationProps(G, B)],
    stateAttributesMapping: Px
  });
}), BM = /* @__PURE__ */ y.forwardRef(function(o, a) {
  return /* @__PURE__ */ x.jsx(IM, {
    ref: a,
    ...o
  });
});
function VM({ className: n, type: o, ...a }) {
  return /* @__PURE__ */ x.jsx(
    BM,
    {
      type: o,
      "data-slot": "input",
      className: Ke(
        "tw:h-8 tw:w-full tw:min-w-0 tw:rounded-[var(--radius-control)] tw:border tw:border-input tw:bg-background tw:px-2.5 tw:py-1 tw:text-[var(--fs-body-s)] tw:text-foreground tw:outline-none tw:placeholder:text-muted-foreground tw:focus-visible:border-ring tw:focus-visible:ring-2 tw:focus-visible:ring-ring/40 tw:disabled:pointer-events-none tw:disabled:cursor-not-allowed tw:disabled:opacity-50 tw:aria-invalid:border-destructive tw:aria-invalid:ring-2 tw:aria-invalid:ring-destructive/20",
        n
      ),
      ...a
    }
  );
}
function hp({ className: n, ...o }) {
  return /* @__PURE__ */ x.jsx(
    "div",
    {
      "data-slot": "input-group",
      role: "group",
      className: Ke(
        "tw:group/input-group tw:relative tw:flex tw:h-8 tw:w-full tw:min-w-0 tw:items-center tw:rounded-[var(--radius-control)] tw:border tw:border-input tw:transition-colors tw:duration-[var(--motion-fast)] tw:outline-none tw:in-data-[slot=combobox-content]:focus-within:border-inherit tw:in-data-[slot=combobox-content]:focus-within:ring-0 tw:has-disabled:bg-input/50 tw:has-disabled:opacity-50 tw:has-[[data-slot=input-group-control]:focus-visible]:border-ring tw:has-[[data-slot=input-group-control]:focus-visible]:ring-2 tw:has-[[data-slot=input-group-control]:focus-visible]:ring-ring/40 tw:has-[[data-slot][aria-invalid=true]]:border-destructive tw:has-[[data-slot][aria-invalid=true]]:ring-2 tw:has-[[data-slot][aria-invalid=true]]:ring-destructive/20 tw:has-[>[data-align=block-end]]:h-auto tw:has-[>[data-align=block-end]]:flex-col tw:has-[>[data-align=block-start]]:h-auto tw:has-[>[data-align=block-start]]:flex-col tw:has-[>textarea]:h-auto tw:has-[>[data-align=block-end]]:[&>input]:pt-3 tw:has-[>[data-align=block-start]]:[&>input]:pb-3 tw:has-[>[data-align=inline-end]]:[&>input]:pr-1.5 tw:has-[>[data-align=inline-start]]:[&>input]:pl-1.5",
        n
      ),
      ...o
    }
  );
}
const PM = aa(
  "tw:flex tw:h-auto tw:cursor-text tw:items-center tw:justify-center tw:gap-2 tw:py-1.5 tw:text-[var(--fs-body-s)] tw:font-medium tw:text-muted-foreground tw:select-none tw:group-data-[disabled=true]/input-group:opacity-50 tw:[&>kbd]:rounded-[var(--radius-control)] tw:[&>svg:not([class*=size-])]:size-4",
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
function Dc({
  className: n,
  align: o = "inline-start",
  ...a
}) {
  return /* @__PURE__ */ x.jsx(
    "div",
    {
      role: "group",
      "data-slot": "input-group-addon",
      "data-align": o,
      className: Ke(PM({ align: o }), n),
      onClick: (i) => {
        i.target.closest("button") || i.currentTarget.parentElement?.querySelector("input, textarea")?.focus();
      },
      ...a
    }
  );
}
const YM = aa(
  "tw:flex tw:items-center tw:gap-2 tw:text-[var(--fs-body-s)] tw:shadow-none",
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
function qx({
  className: n,
  type: o = "button",
  variant: a = "ghost",
  size: i = "xs",
  ...u
}) {
  return /* @__PURE__ */ x.jsx(
    ht,
    {
      type: o,
      "data-size": i,
      variant: a,
      className: Ke(YM({ size: i }), n),
      ...u
    }
  );
}
function yp({
  className: n,
  ...o
}) {
  return /* @__PURE__ */ x.jsx(
    VM,
    {
      "data-slot": "input-group-control",
      className: Ke(
        "tw:flex-1 tw:rounded-none tw:border-0 tw:bg-transparent tw:shadow-none tw:ring-0 tw:focus-visible:ring-0 tw:disabled:bg-transparent tw:aria-invalid:ring-0",
        n
      ),
      ...o
    }
  );
}
const Xx = /* @__PURE__ */ y.createContext(void 0);
function fr(n) {
  const o = y.useContext(Xx);
  if (o === void 0 && !n)
    throw new Error(At(47));
  return o;
}
function GM() {
  return {
    ...eu(),
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
const qM = {
  ...tu,
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
class mg extends Oi {
  constructor(o, a, i = !1) {
    const u = {
      ...GM(),
      ...o
    }, f = new sa();
    u.open && o?.mounted === void 0 && (u.mounted = !0), u.floatingRootContext = ng(f, a, i), super(u, {
      popupRef: /* @__PURE__ */ y.createRef(),
      backdropRef: /* @__PURE__ */ y.createRef(),
      internalBackdropRef: /* @__PURE__ */ y.createRef(),
      onOpenChange: void 0,
      onOpenChangeComplete: void 0,
      triggerFocusTargetRef: /* @__PURE__ */ y.createRef(),
      beforeContentFocusGuardRef: /* @__PURE__ */ y.createRef(),
      stickIfOpenTimeout: new el(),
      triggerElements: f
    }, qM);
  }
  setOpen = (o, a) => {
    const i = a.reason === Pt, u = a.reason === Xl && a.event.detail === 0, f = !o && (a.reason === Ti || a.reason == null), p = Wp(a), g = this.select("activeTriggerId");
    if (!o && a.reason === c0 && a.trigger == null && g != null && (a.trigger = this.context.triggerElements.getById(g) ?? this.select("activeTriggerElement") ?? void 0), this.context.onOpenChange?.(o, a), a.isCanceled)
      return;
    this.state.floatingRootContext.dispatchOpenChange(o, a);
    const m = () => {
      const d = {
        open: o,
        openChangeReason: a.reason
      };
      Zc(d, o, a.trigger, p()), this.update(d);
    };
    i ? (this.set("stickIfOpen", !0), this.context.stickIfOpenTimeout.start(O0, () => {
      this.set("stickIfOpen", !1);
    }), gl.flushSync(m)) : m(), u || f ? this.set("instantType", u ? "click" : "dismiss") : a.reason === Ro ? this.set("instantType", "focus") : this.set("instantType", void 0);
  };
  static useStore(o, a) {
    const {
      store: i,
      internalStore: u
    } = $p(o, (f, p) => new mg(a, f, p));
    return y.useEffect(() => u?.disposeEffect(), [u]), i;
  }
  disposeEffect = () => this.context.stickIfOpenTimeout.disposeEffect();
}
function vb({
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
  } = n, v = mg.useStore(g?.store, {
    modal: p,
    open: i,
    openProp: a,
    activeTriggerId: d,
    triggerIdProp: m
  });
  eg(v, a, i, d), v.useControlledProp("openProp", a), v.useControlledProp("triggerIdProp", m);
  const b = v.useState("open"), S = v.useState("mounted"), C = v.useState("payload"), w = Ql() != null;
  v.useContextCallback("onOpenChange", u), v.useContextCallback("onOpenChangeComplete", f), W0(v, b), Jc(v);
  const {
    forceUnmount: A
  } = $c(b, v, () => {
    v.update({
      stickIfOpen: !0,
      openChangeReason: null
    });
  });
  v.useSyncedValues({
    modal: p,
    nested: w
  }), y.useEffect(() => {
    b || v.context.stickIfOpenTimeout.clear();
  }, [v, b]);
  const T = y.useCallback(() => {
    v.setOpen(!1, Ye(Pc));
  }, [v]);
  y.useImperativeHandle(n.actionsRef, () => ({
    unmount: A,
    close: T
  }), [A, T]);
  const z = b || S, M = y.useMemo(() => ({
    store: v
  }), [v]);
  return /* @__PURE__ */ x.jsxs(Xx.Provider, {
    value: M,
    children: [z && /* @__PURE__ */ x.jsx(FM, {
      store: v,
      modal: p
    }), typeof o == "function" ? o({
      payload: C
    }) : o]
  });
}
function XM(n) {
  return fr(!0) ? /* @__PURE__ */ x.jsx(vb, {
    props: n
  }) : /* @__PURE__ */ x.jsx(U0, {
    children: /* @__PURE__ */ x.jsx(vb, {
      props: n
    })
  });
}
function FM({
  store: n,
  modal: o
}) {
  const a = n.useState("floatingRootContext"), i = Ci(a, {
    outsidePressEvent: {
      // Ensure `aria-hidden` on outside elements is removed immediately
      // on outside press when trapping focus.
      mouse: o === "trap-focus" ? "sloppy" : "intentional",
      touch: "sloppy"
    }
  }), u = i.reference ?? xt, f = i.trigger ?? xt, p = y.useMemo(() => bn(ia, i.floating), [i.floating]);
  return Wc(n, {
    activeTriggerProps: u,
    inactiveTriggerProps: f,
    popupProps: p
  }), null;
}
const KM = 300, QM = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    disabled: p = !1,
    nativeButton: g = !0,
    handle: m,
    payload: d,
    openOnHover: v = !1,
    delay: b = KM,
    closeDelay: S = 0,
    id: C,
    ...w
  } = o, A = fr(!0), T = m?.store ?? A?.store;
  if (!T)
    throw new Error(At(74));
  const z = Bn(C), M = T.useState("isTriggerActive", z), D = T.useState("floatingRootContext"), N = T.useState("isOpenedByTrigger", z), L = T.useState("triggerPopupId", z), j = y.useRef(null), {
    registerTrigger: H,
    isMountedByThisTrigger: k
  } = tg(z, j, T, {
    payload: d,
    disabled: p,
    openOnHover: v,
    closeDelay: S
  }), G = T.useState("openChangeReason"), E = T.useState("stickIfOpen"), Z = T.useState("openMethod"), J = T.useState("focusManagerModal"), X = nu(D, {
    enabled: !p && D != null && v && (Z !== "touch" || G !== Xl),
    mouseOnly: !0,
    move: !1,
    handleClose: ou(),
    restMs: b,
    delay: {
      close: S
    },
    triggerElementRef: j,
    isActiveTrigger: M,
    isClosing: () => T.select("transitionStatus") === "ending"
  }), K = Xc(D, {
    enabled: D != null,
    stickIfOpen: E
  }), q = xx(() => T.select("open"), (re) => {
    T.set("openMethod", re);
  }), _ = T.useState("triggerProps", k), {
    getButtonProps: Y,
    buttonRef: V
  } = Mo({
    disabled: p,
    native: g
  }), Q = {
    open(re) {
      return re && G === Xl ? Mc.open(re) : ru.open(re);
    }
  }, {
    preFocusGuardRef: B,
    handlePreFocusGuardFocus: O,
    handleFocusTargetFocus: U
  } = Ix(T, j), $ = nt("button", o, {
    state: {
      disabled: p,
      open: N
    },
    ref: [V, a, H, j],
    props: [K.reference, X, _, q, {
      [M0]: "",
      id: z,
      "aria-haspopup": "dialog",
      "aria-expanded": N,
      "aria-controls": L
    }, w, Y],
    stateAttributesMapping: Q
  });
  return k && !J ? /* @__PURE__ */ x.jsxs(y.Fragment, {
    children: [/* @__PURE__ */ x.jsx(Co, {
      ref: B,
      onFocus: O
    }), /* @__PURE__ */ x.jsx(y.Fragment, {
      children: $
    }, z), /* @__PURE__ */ x.jsx(Co, {
      ref: T.context.triggerFocusTargetRef,
      onFocus: U
    })]
  }) : /* @__PURE__ */ x.jsx(y.Fragment, {
    children: $
  }, z);
}), Fx = /* @__PURE__ */ y.createContext(void 0);
function ZM() {
  const n = y.useContext(Fx);
  if (n === void 0)
    throw new Error(At(45));
  return n;
}
const JM = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    keepMounted: i = !1,
    ...u
  } = o, {
    store: f
  } = fr();
  return f.useState("mounted") || i ? /* @__PURE__ */ x.jsx(Fx.Provider, {
    value: i,
    children: /* @__PURE__ */ x.jsx(Gc, {
      ref: a,
      ...u
    })
  }) : null;
}), Kx = /* @__PURE__ */ y.createContext(void 0);
function $M() {
  const n = y.useContext(Kx);
  if (!n)
    throw new Error(At(46));
  return n;
}
const WM = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    anchor: p,
    positionMethod: g = "absolute",
    side: m = "bottom",
    align: d = "center",
    sideOffset: v = 0,
    alignOffset: b = 0,
    collisionBoundary: S = "clipping-ancestors",
    collisionPadding: C = 5,
    arrowPadding: w = 5,
    sticky: A = !1,
    disableAnchorTracking: T = !1,
    collisionAvoidance: z = qp,
    ...M
  } = o, {
    store: D
  } = fr(), N = ZM(), L = Fp(), j = D.useState("floatingRootContext"), H = D.useState("mounted"), k = D.useState("open"), G = D.useState("openChangeReason"), E = D.useState("activeTriggerElement"), Z = D.useState("modal"), J = D.useState("openMethod"), X = D.useState("positionerElement"), K = D.useState("instantType"), q = D.useState("transitionStatus"), _ = D.useState("hasViewport"), Y = y.useRef(null), V = Jp(X, !1, !1), Q = gu({
    anchor: p,
    floatingRootContext: j,
    positionMethod: g,
    mounted: H,
    side: m,
    sideOffset: v,
    align: d,
    alignOffset: b,
    arrowPadding: w,
    collisionBoundary: S,
    collisionPadding: C,
    sticky: A,
    disableAnchorTracking: T,
    keepMounted: N,
    nodeId: L,
    collisionAvoidance: z,
    adaptiveOrigin: _ ? cg : void 0
  }), B = j.useState("domReferenceElement");
  xe(() => {
    const $ = B, re = Y.current;
    if ($ && (Y.current = $), re && $ && $ !== re) {
      D.set("instantType", void 0);
      const ie = new AbortController();
      return V(() => {
        D.set("instantType", "trigger-change");
      }, ie.signal), () => {
        ie.abort();
      };
    }
  }, [B, V, D]), fg(k && Z === !0 && G !== Pt, J === "touch", X, E);
  const O = y.useCallback(($) => {
    D.set("positionerElement", $);
  }, [D]), U = {
    open: k,
    side: Q.side,
    align: Q.align,
    anchorHidden: Q.anchorHidden,
    instant: K
  }, ne = mu(o, U, {
    styles: Q.positionerStyles,
    transitionStatus: q,
    props: M,
    refs: [a, O],
    hidden: !H,
    inert: !k
  });
  return /* @__PURE__ */ x.jsxs(Kx.Provider, {
    value: Q,
    children: [H && Z === !0 && G !== Pt && /* @__PURE__ */ x.jsx(cu, {
      ref: D.context.internalBackdropRef,
      inert: su(!k),
      cutout: E
    }), /* @__PURE__ */ x.jsx(H0, {
      id: L,
      children: ne
    })]
  });
}), e2 = /* @__PURE__ */ y.createContext(void 0);
function t2() {
  const [n, o] = y.useState(0), a = ze(() => (o((u) => u + 1), () => {
    o((u) => Math.max(0, u - 1));
  }));
  return {
    context: y.useMemo(() => ({
      register: a
    }), [a]),
    hasClosePart: n > 0
  };
}
function n2(n) {
  const {
    value: o,
    children: a
  } = n;
  return /* @__PURE__ */ x.jsx(e2.Provider, {
    value: o,
    children: a
  });
}
const l2 = {
  ..._o,
  ...ko
}, o2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    initialFocus: p,
    finalFocus: g,
    ...m
  } = o, {
    store: d
  } = fr(), v = $M(), b = du() != null, {
    context: S,
    hasClosePart: C
  } = t2(), w = d.useState("open"), A = d.useState("openMethod"), T = d.useState("instantType"), z = d.useState("transitionStatus"), M = d.useState("popupProps"), D = d.useState("titleElementId"), N = d.useState("descriptionElementId"), L = d.useState("modal"), j = d.useState("mounted"), H = d.useState("openChangeReason"), k = d.useState("activeTriggerElement"), G = d.useState("floatingRootContext"), E = G.useState("floatingId"), Z = d.useState("disabled"), J = d.useState("openOnHover"), X = d.useState("closeDelay"), K = m.id ?? E;
  Zl({
    open: w,
    ref: d.context.popupRef,
    onComplete() {
      w && d.context.onOpenChangeComplete?.(!0);
    }
  }), ag(G, {
    enabled: J && !Z,
    closeDelay: X
  });
  const q = p === void 0 ? J0(d.context.popupRef) : p, _ = L !== !1 && C;
  d.useSyncedValue("focusManagerModal", _);
  const Y = y.useCallback((B) => {
    d.set("popupElement", B);
  }, [d]), V = {
    open: w,
    side: v.side,
    align: v.align,
    instant: T,
    transitionStatus: z
  }, Q = nt("div", o, {
    state: V,
    ref: [a, d.context.popupRef, Y],
    props: [M, {
      id: K,
      role: "dialog",
      ...ia,
      "aria-labelledby": D,
      "aria-describedby": N,
      onKeyDown(B) {
        b && Mi.has(B.key) && B.stopPropagation();
      }
    }, zi(z), m],
    stateAttributesMapping: l2
  });
  return /* @__PURE__ */ x.jsx(qc, {
    context: G,
    openInteractionType: A,
    modal: _,
    disabled: !j || H === Pt,
    initialFocus: q,
    returnFocus: g,
    restoreFocus: "popup",
    previousFocusableElement: Ct(k) ? k : void 0,
    nextFocusableElement: d.context.triggerFocusTargetRef,
    beforeContentFocusGuardRef: d.context.beforeContentFocusGuardRef,
    children: /* @__PURE__ */ x.jsx(n2, {
      value: S,
      children: Q
    })
  });
}), r2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    ...p
  } = o, {
    store: g
  } = fr(), m = Bn(p.id);
  return g.useSyncedValueWithCleanup("titleElementId", m), nt("h2", o, {
    ref: a,
    props: [{
      id: m
    }, p]
  });
}), a2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    ...p
  } = o, {
    store: g
  } = fr(), m = Bn(p.id);
  return g.useSyncedValueWithCleanup("descriptionElementId", m), nt("p", o, {
    ref: a,
    props: [{
      id: m
    }, p]
  });
});
function bb({ ...n }) {
  return /* @__PURE__ */ x.jsx(XM, { "data-slot": "popover", ...n });
}
function xb({ ...n }) {
  return /* @__PURE__ */ x.jsx(QM, { "data-slot": "popover-trigger", ...n });
}
function Sb({
  className: n,
  align: o = "center",
  alignOffset: a = 0,
  side: i = "bottom",
  sideOffset: u = 4,
  portalContainer: f,
  positionerClassName: p,
  ...g
}) {
  return /* @__PURE__ */ x.jsx(JM, { container: f, children: /* @__PURE__ */ x.jsx(
    WM,
    {
      align: o,
      alignOffset: a,
      side: i,
      sideOffset: u,
      className: Ke("tw:isolate tw:z-[var(--z-popover)]", p),
      children: /* @__PURE__ */ x.jsx(
        o2,
        {
          "data-slot": "popover-content",
          className: Ke(
            "tw:flex tw:w-72 tw:origin-(--transform-origin) tw:flex-col tw:gap-2.5 tw:rounded-[var(--radius-surface)] tw:bg-popover tw:p-2.5 tw:text-[var(--fs-body-s)] tw:text-popover-foreground tw:shadow-md tw:ring-1 tw:ring-foreground/10 tw:outline-hidden",
            n
          ),
          ...g
        }
      )
    }
  ) });
}
function i2({ className: n, ...o }) {
  return /* @__PURE__ */ x.jsx(
    "div",
    {
      "data-slot": "popover-header",
      className: Ke("tw:flex tw:flex-col tw:gap-0.5 tw:text-[var(--fs-body-s)]", n),
      ...o
    }
  );
}
function vp({ className: n, ...o }) {
  return /* @__PURE__ */ x.jsx(
    r2,
    {
      "data-slot": "popover-title",
      className: Ke("tw:font-medium", n),
      ...o
    }
  );
}
function bp({
  className: n,
  ...o
}) {
  return /* @__PURE__ */ x.jsx(
    a2,
    {
      "data-slot": "popover-description",
      className: Ke("tw:text-muted-foreground", n),
      ...o
    }
  );
}
function ai({
  className: n,
  orientation: o = "horizontal",
  ...a
}) {
  return /* @__PURE__ */ x.jsx(
    Bx,
    {
      "data-slot": "separator",
      orientation: o,
      className: Ke(
        "tw:shrink-0 tw:bg-border tw:data-horizontal:h-px tw:data-horizontal:w-full tw:data-vertical:w-px tw:data-vertical:self-stretch",
        n
      ),
      ...a
    }
  );
}
const Qx = /* @__PURE__ */ y.createContext(null), Zx = /* @__PURE__ */ y.createContext(null);
function Jl() {
  const n = y.useContext(Qx);
  if (n === null)
    throw new Error(At(60));
  return n;
}
function Jx() {
  const n = y.useContext(Zx);
  if (n === null)
    throw new Error(At(61));
  return n;
}
const s2 = (n, o) => Object.is(n, o);
function ir(n, o, a) {
  return n == null || o == null ? Object.is(n, o) : a(n, o);
}
function c2(n, o, a) {
  return !n || n.length === 0 ? !1 : n.some((i) => i === void 0 ? !1 : ir(o, i, a));
}
function yi(n, o, a) {
  return !n || n.length === 0 ? -1 : n.findIndex((i) => i === void 0 ? !1 : ir(i, o, a));
}
function u2(n, o, a) {
  return n.filter((i) => !ir(o, i, a));
}
function xp(n) {
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
function $x(n) {
  return n != null && n.length > 0 && typeof n[0] == "object" && n[0] != null && "items" in n[0];
}
function f2(n) {
  if (!Array.isArray(n))
    return n != null && "null" in n;
  const o = n;
  if ($x(o)) {
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
function Wx(n, o) {
  if (o && n != null)
    return o(n) ?? "";
  if (n && typeof n == "object") {
    if ("label" in n && n.label != null)
      return String(n.label);
    if ("value" in n)
      return String(n.value);
  }
  return xp(n);
}
function nr(n, o) {
  return o && n != null ? o(n) ?? "" : n && typeof n == "object" && "value" in n && "label" in n ? xp(n.value) : xp(n);
}
function eS(n, o, a) {
  function i() {
    return Wx(n, a);
  }
  if (a && n != null)
    return a(n);
  if (n && typeof n == "object" && "label" in n && n.label != null)
    return n.label;
  if (o && !Array.isArray(o))
    return o[n] ?? i();
  if (Array.isArray(o)) {
    const u = o, f = $x(u) ? u.flatMap((p) => p.items) : u;
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
function d2(n, o, a) {
  return n.reduce((i, u, f) => (f > 0 && i.push(", "), i.push(/* @__PURE__ */ x.jsx(y.Fragment, {
    children: eS(u, o, a)
  }, f)), i), []);
}
const Be = {
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
    return o == null ? !1 : a && Array.isArray(o) ? o.length > 0 : nr(o, i) !== "";
  }),
  hasNullItemLabel: me((n, o) => o ? f2(n.items) : !1),
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
    return n.multiple ? Array.isArray(i) && i.some((u) => ir(o, u, a)) : ir(o, i, a);
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
function p2(n, o, a = (i, u) => i === u) {
  return n.length === o.length && n.every((i, u) => a(i, o[u]));
}
function ui(n, o = Number.MIN_SAFE_INTEGER, a = Number.MAX_SAFE_INTEGER) {
  return Math.max(o, Math.min(n, a));
}
const Il = 1;
function tS(n, o) {
  return Math.max(0, n - o);
}
function g2(n, o) {
  if (o <= 0)
    return 0;
  const a = ui(n, 0, o), i = a, u = o - a, f = i <= Il, p = u <= Il;
  return f && p ? i <= u ? 0 : o : f ? 0 : p ? o : a;
}
function m2(n) {
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
    disabled: b = !1,
    readOnly: S = !1,
    required: C = !1,
    modal: w = !0,
    actionsRef: A,
    inputRef: T,
    onOpenChangeComplete: z,
    items: M,
    multiple: D = !1,
    itemToStringLabel: N,
    itemToStringValue: L,
    isItemEqualToValue: j = s2,
    highlightItemOnHover: H = !0,
    children: k
  } = n, {
    clearErrors: G
  } = Yx(), {
    setDirty: E,
    setTouched: Z,
    setFocused: J,
    validityData: X,
    setFilled: K,
    name: q,
    disabled: _,
    validation: Y,
    validationMode: V
  } = hu(), Q = gg({
    id: o
  }), B = _ || b, O = q ?? m, [U, ne] = ra({
    controlled: a,
    default: D ? i ?? ql : i,
    name: "Select",
    state: "value"
  }), [$, re] = ra({
    controlled: f,
    default: p,
    name: "Select",
    state: "open"
  }), ie = y.useRef([]), oe = y.useRef([]), se = y.useRef(null), ge = y.useRef(null), je = y.useRef(0), Ee = y.useRef(null), fe = y.useRef([]), ye = y.useRef(!1), Re = y.useRef(null), _e = y.useRef(null), ke = y.useRef({
    allowSelectedMouseUp: !1,
    allowUnselectedMouseUp: !1,
    dragY: 0
  }), we = y.useRef(!1), {
    mounted: Ce,
    setMounted: he,
    transitionStatus: Se
  } = Qc($), {
    openMethod: Te,
    triggerProps: Oe
  } = Sx($), He = xn(() => new Q0({
    id: Q,
    labelId: void 0,
    modal: w,
    multiple: D,
    itemToStringLabel: N,
    itemToStringValue: L,
    isItemEqualToValue: j,
    value: U,
    open: $,
    mounted: Ce,
    transitionStatus: Se,
    items: M,
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
  })).current, ae = Pe(He, Be.activeIndex), pe = Pe(He, Be.selectedIndex), Ue = Pe(He, Be.triggerElement), ve = Pe(He, Be.positionerElement), be = OM(Te), We = Te ?? be ?? null, rt = y.useMemo(() => D ? "" : nr(U, L), [D, U, L]), pt = y.useMemo(() => D && Array.isArray(U) ? U.map((qe) => nr(qe, L)) : nr(U, L), [D, U, L]), Nt = Yt(He.state.triggerElement), et = ze(() => pt);
  Gx(Nt, Q, U, et, !B, m);
  const gt = y.useRef(U), zt = D ? Array.isArray(U) && U.length > 0 : U != null && nr(U, L) !== "";
  xe(() => {
    U !== gt.current && He.set("forceMount", !0);
  }, [He, U]), xe(() => {
    K(zt);
  }, [zt, K]), xe(function() {
    const St = fe.current;
    let Xt;
    if (D) {
      const ln = Array.isArray(U) ? U : [];
      if (ln.length === 0)
        Xt = null;
      else {
        const en = ln[ln.length - 1], Ot = yi(St, en, j);
        Xt = Ot === -1 ? null : Ot;
      }
    } else {
      const ln = yi(St, U, j);
      Xt = ln === -1 ? null : ln;
    }
    Xt === null && (_e.current = null), !$ && He.set("selectedIndex", Xt);
  }, [zt, D, $, U, fe, j, He, _e]);
  function yt(qe) {
    const St = X.initialValue;
    return Array.isArray(qe) && Array.isArray(St) ? !p2(qe, St, (Xt, ln) => ir(Xt, ln, j)) : qe !== St;
  }
  bx(U, () => {
    G(O), E(yt(U)), Y.change(U);
  });
  const Mn = ze((qe, St) => {
    g?.(qe, St), !St.isCanceled && (re(qe), !qe && (St.reason === Ro || St.reason === Vc) && (Z(!0), J(!1), V === "onBlur" && Y.commit(U)));
  }), An = ze(() => {
    he(!1), He.update({
      activeIndex: null,
      openMethod: null
    }), z?.(!1);
  });
  Zl({
    enabled: !A,
    open: $,
    ref: se,
    onComplete() {
      $ || An();
    }
  }), y.useImperativeHandle(A, () => ({
    unmount: An
  }), [An]);
  const Qe = ze((qe, St) => {
    u?.(qe, St), !St.isCanceled && ne(qe);
  }), ft = ze(() => {
    const qe = He.state.listElement || se.current;
    if (!qe)
      return;
    const St = tS(qe.scrollHeight, qe.clientHeight), Xt = g2(qe.scrollTop, St), ln = Xt > 0, en = Xt < St;
    He.state.scrollUpArrowVisible !== ln && He.set("scrollUpArrowVisible", ln), He.state.scrollDownArrowVisible !== en && He.set("scrollDownArrowVisible", en);
  }), It = tx({
    open: $,
    onOpenChange: Mn,
    elements: {
      reference: Ue,
      floating: ve
    }
  }), Ht = Xc(It, {
    enabled: !S && !B,
    event: "mousedown"
  }), Ut = Ci(It), jt = ox(It, {
    enabled: !S && !B,
    listRef: ie,
    activeIndex: ae,
    selectedIndex: pe,
    disabledIndices: ql,
    onNavigate(qe) {
      qe === null && !$ || He.set("activeIndex", qe);
    },
    focusItemOnHover: H
  }), Gt = rx(It, {
    enabled: !S && !B && ($ || !D),
    listRef: oe,
    activeIndex: ae,
    selectedIndex: pe,
    // Skip disabled items while matching so typeahead advances to the next selectable item
    // (a click can never select a disabled item and native `<select>` skips them too). Resolve
    // the disabled state from the element via the attribute-only `isElementDisabled` so the
    // hidden, force-mounted items used for closed-trigger typeahead aren't dropped by the
    // `elementsRef`/visibility filter that `disabledIndices` deliberately sidesteps.
    disabledIndices: (qe) => Vx(ie.current[qe]),
    onMatch(qe) {
      $ ? He.set("activeIndex", qe) : Qe(fe.current[qe], Ye("none"));
    },
    onTyping(qe) {
      ye.current = qe;
    }
  }), Sn = y.useMemo(() => {
    const qe = bn(Gt.reference, jt.reference, Ut.reference, Ht.reference, Oe);
    return Q && (qe.id = Q), qe;
  }, [Ht.reference, Gt.reference, jt.reference, Ut.reference, Oe, Q]), zn = y.useMemo(() => bn(ia, Gt.floating, jt.floating, Ut.floating), [Gt.floating, jt.floating, Ut.floating]), Vn = jt.item ?? xt;
  kp(() => {
    He.update({
      popupProps: zn,
      triggerProps: Sn
    });
  }), xe(() => {
    He.update({
      id: Q,
      modal: w,
      multiple: D,
      value: U,
      open: $,
      mounted: Ce,
      transitionStatus: Se,
      popupProps: zn,
      triggerProps: Sn,
      items: M,
      itemToStringLabel: N,
      itemToStringValue: L,
      isItemEqualToValue: j,
      openMethod: We
    });
  }, [He, Q, w, D, U, $, Ce, Se, zn, Sn, M, N, L, j, We]);
  const qt = y.useMemo(() => ({
    store: He,
    name: O,
    required: C,
    disabled: B,
    readOnly: S,
    multiple: D,
    highlightItemOnHover: H,
    setValue: Qe,
    setOpen: Mn,
    listRef: ie,
    popupRef: se,
    scrollHandlerRef: ge,
    handleScrollArrowVisibility: ft,
    scrollArrowsMountedCountRef: je,
    itemProps: Vn,
    valueRef: Ee,
    valuesRef: fe,
    labelsRef: oe,
    typingRef: ye,
    selectionRef: ke,
    firstItemTextRef: Re,
    selectedItemTextRef: _e,
    validation: Y,
    onOpenChangeComplete: z,
    alignItemWithTriggerActiveRef: we,
    initialValueRef: gt
  }), [He, O, C, B, S, D, H, Qe, Mn, Vn, Y, z, ft]), Pn = To(T, Y.inputRef), hl = D && Array.isArray(U) && U.length > 0, tl = D ? void 0 : O, yl = y.useMemo(() => !D || !Array.isArray(U) || !O ? null : U.map((qe) => {
    const St = nr(qe, L);
    return /* @__PURE__ */ x.jsx("input", {
      type: "hidden",
      form: d,
      name: O,
      value: St,
      disabled: B
    }, St);
  }), [D, U, d, O, L, B]);
  return /* @__PURE__ */ x.jsx(Qx.Provider, {
    value: qt,
    children: /* @__PURE__ */ x.jsxs(Zx.Provider, {
      value: It,
      children: [k, /* @__PURE__ */ x.jsx("input", {
        ...Y.getValidationProps(B, {
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
            const St = qe.currentTarget.value, Xt = Ye(Do, qe.nativeEvent);
            function ln() {
              if (D)
                return;
              const en = St.toLowerCase();
              let Ot = fe.current.findIndex((rl) => nr(rl, L).toLowerCase() === en || Wx(rl, N).toLowerCase() === en);
              Ot === -1 && (Ot = fe.current.findIndex((rl, ca) => {
                const Ni = oe.current[ca];
                return Ni != null && Ni.toLowerCase() === en;
              }));
              const cn = Ot === -1 ? void 0 : fe.current[Ot];
              cn != null && Qe(cn, Xt);
            }
            He.set("forceMount", !0), queueMicrotask(ln);
          }
        }),
        id: Q && tl == null ? `${Q}-hidden-input` : void 0,
        form: d,
        name: tl,
        autoComplete: v,
        value: rt,
        disabled: B,
        required: C && !hl,
        readOnly: S,
        ref: Pn,
        style: O ? xR : p0,
        tabIndex: -1,
        "aria-hidden": !0,
        suppressHydrationWarning: !0
      }), yl]
    })
  });
}
function h2(n, o) {
  return n ?? o;
}
const oc = 2, y2 = 400, v2 = {
  ...Mc,
  ...Px,
  popupSide: (n) => n ? {
    "data-popup-side": n
  } : null,
  value: () => null
}, b2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
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
    setFocused: b,
    validationMode: S,
    state: C,
    disabled: w
  } = hu(), {
    labelId: A
  } = pg(), {
    store: T,
    setOpen: z,
    selectionRef: M,
    validation: D,
    readOnly: N,
    required: L,
    alignItemWithTriggerActiveRef: j,
    disabled: H
  } = Jl(), k = w || H || p, G = Pe(T, Be.open), E = Pe(T, Be.mounted), Z = Pe(T, Be.value), J = Pe(T, Be.triggerProps), X = Pe(T, Be.positionerElement), K = Pe(T, Be.listElement), q = Pe(T, Be.popupSide), _ = Pe(T, Be.id), Y = Pe(T, Be.labelId), V = Pe(T, Be.hasSelectedValue), Q = E && X ? q : null, B = f ?? _, O = h2(A, Y);
  gg({
    id: B
  });
  const U = Yt(X), ne = y.useRef(null), {
    getButtonProps: $,
    buttonRef: re
  } = Mo({
    disabled: k,
    native: g
  }), ie = ze((ye) => {
    T.set("triggerElement", ye);
  }), oe = sn(), se = sn(), ge = sn();
  y.useEffect(() => {
    if (G)
      return ge.start(y2, () => {
        M.current.allowUnselectedMouseUp = !0, M.current.allowSelectedMouseUp = !0;
      }), () => {
        ge.clear();
      };
    M.current = {
      allowSelectedMouseUp: !1,
      allowUnselectedMouseUp: !1,
      dragY: 0
    }, se.clear();
  }, [G, M, se, ge]);
  const je = bn(J, {
    id: B,
    role: "combobox",
    "aria-expanded": G ? "true" : "false",
    "aria-haspopup": "listbox",
    "aria-controls": G ? K?.id ?? xc(X)?.id : void 0,
    "aria-labelledby": O,
    "aria-readonly": N || void 0,
    "aria-required": L || void 0,
    tabIndex: k ? -1 : 0,
    onFocus(ye) {
      b(!0), G && j.current && z(!1, Ye(Do, ye.nativeEvent)), oe.start(0, () => {
        T.set("forceMount", !0);
      });
    },
    onBlur(ye) {
      Le(X, ye.relatedTarget) || (v(!0), b(!1), S === "onBlur" && D.commit(Z));
    },
    onMouseDown(ye) {
      if (G)
        return;
      const Re = tt(ye.currentTarget);
      function _e(ke) {
        if (!ne.current)
          return;
        const we = ke.target;
        if (Le(ne.current, we) || Le(U.current, we))
          return;
        const Ce = Hx(ne.current);
        ke.clientX >= Ce.left - oc && ke.clientX <= Ce.right + oc && ke.clientY >= Ce.top - oc && ke.clientY <= Ce.bottom + oc || z(!1, Ye(u0, ke));
      }
      se.start(0, () => {
        Re.addEventListener("mouseup", _e, {
          once: !0
        });
      });
    }
  }, d, $), Ee = D.getValidationProps(k, je);
  Ee.role = "combobox";
  const fe = {
    ...C,
    open: G,
    disabled: k,
    value: Z,
    readOnly: N,
    popupSide: Q,
    placeholder: !V
  };
  return nt("button", o, {
    ref: [a, ne, re, ie],
    state: fe,
    stateAttributesMapping: v2,
    props: Ee
  });
}), x2 = {
  value: () => null
}, S2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
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
  } = Jl(), b = Pe(d, Be.value), S = Pe(d, Be.items), C = Pe(d, Be.itemToStringLabel), w = Pe(d, Be.hasSelectedValue), A = !w && p != null && f == null, T = Pe(d, Be.hasNullItemLabel, A), z = {
    value: b,
    placeholder: !w
  };
  let M = null;
  return typeof f == "function" ? M = f(b) : f != null ? M = f : !w && p != null && !T ? M = p : Array.isArray(b) ? M = d2(b, S, C) : M = eS(b, S, C), nt("span", o, {
    state: z,
    ref: [a, v],
    props: [{
      children: M
    }, m],
    stateAttributesMapping: x2
  });
}), w2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    ...p
  } = o, {
    store: g
  } = Jl(), d = {
    open: Pe(g, Be.open)
  };
  return nt("span", o, {
    state: d,
    ref: a,
    props: [{
      "aria-hidden": !0,
      children: "▼"
    }, p],
    stateAttributesMapping: ru
  });
}), E2 = /* @__PURE__ */ y.createContext(void 0), T2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    store: i
  } = Jl(), u = Pe(i, Be.mounted), f = Pe(i, Be.forceMount);
  return u || f ? /* @__PURE__ */ x.jsx(E2.Provider, {
    value: !0,
    children: /* @__PURE__ */ x.jsx(Gc, {
      ref: a,
      ...o
    })
  }) : null;
}), nS = /* @__PURE__ */ y.createContext(void 0);
function lS() {
  const n = y.useContext(nS);
  if (!n)
    throw new Error(At(59));
  return n;
}
function Nc(n, o) {
  n && Object.assign(n.style, o);
}
const oS = {
  position: "relative",
  maxHeight: "100%",
  overflowX: "hidden",
  overflowY: "auto"
}, R2 = {
  position: "fixed"
}, C2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    anchor: i,
    positionMethod: u = "absolute",
    className: f,
    render: p,
    side: g = "bottom",
    align: m = "center",
    sideOffset: d = 0,
    alignOffset: v = 0,
    collisionBoundary: b = "clipping-ancestors",
    collisionPadding: S,
    arrowPadding: C = 5,
    sticky: w = !1,
    disableAnchorTracking: A,
    alignItemWithTrigger: T = !0,
    collisionAvoidance: z = A0,
    style: M,
    ...D
  } = o, {
    store: N,
    listRef: L,
    labelsRef: j,
    alignItemWithTriggerActiveRef: H,
    selectedItemTextRef: k,
    valuesRef: G,
    initialValueRef: E,
    popupRef: Z,
    setValue: J
  } = Jl(), X = Jx(), K = Pe(N, Be.open), q = Pe(N, Be.mounted), _ = Pe(N, Be.modal), Y = Pe(N, Be.value), V = Pe(N, Be.openMethod), Q = Pe(N, Be.positionerElement), B = Pe(N, Be.triggerElement), O = Pe(N, Be.isItemEqualToValue), U = Pe(N, Be.transitionStatus), ne = y.useRef(null), $ = y.useRef(null), [re, ie] = y.useState(T), oe = q && re && V !== "touch";
  !q && re !== T && ie(T), xe(() => {
    q || (Be.scrollUpArrowVisible(N.state) && N.set("scrollUpArrowVisible", !1), Be.scrollDownArrowVisible(N.state) && N.set("scrollDownArrowVisible", !1));
  }, [N, q]), y.useImperativeHandle(H, () => oe), fg((oe || _) && K, V === "touch", Q, B);
  const se = gu({
    anchor: i,
    floatingRootContext: X,
    positionMethod: u,
    mounted: q,
    side: g,
    sideOffset: d,
    align: m,
    alignOffset: v,
    arrowPadding: C,
    collisionBoundary: b,
    collisionPadding: S,
    sticky: w,
    disableAnchorTracking: A ?? oe,
    collisionAvoidance: z,
    keepMounted: !0
  }), ge = oe ? "none" : se.side, je = oe ? R2 : se.positionerStyles, Ee = {
    open: K,
    side: ge,
    align: se.align,
    anchorHidden: se.anchorHidden
  };
  xe(() => {
    N.set("popupSide", se.side);
  }, [N, se.side]);
  const fe = ze((we) => {
    N.set("positionerElement", we);
  }), ye = mu(o, Ee, {
    styles: je,
    transitionStatus: U,
    props: D,
    refs: [a, fe],
    hidden: !q,
    inert: !K
  }), Re = y.useRef(0), _e = ze((we) => {
    if (we.size === 0 && Re.current === 0 || G.current.length === 0)
      return;
    const Ce = Re.current;
    if (Re.current = we.size, we.size === Ce)
      return;
    const he = Ye(Do);
    if (Ce !== 0 && !N.state.multiple && Y !== null && yi(G.current, Y, O) === -1) {
      const Te = E.current, He = Te != null && yi(G.current, Te, O) !== -1 ? Te : null;
      J(He, he), He === null && (N.set("selectedIndex", null), k.current = null);
    }
    if (Ce !== 0 && N.state.multiple && Array.isArray(Y)) {
      const Se = (Oe) => yi(G.current, Oe, O) !== -1, Te = Y.filter((Oe) => Se(Oe));
      (Te.length !== Y.length || Te.some((Oe) => !c2(Y, Oe, O))) && (J(Te, he), Te.length === 0 && (N.set("selectedIndex", null), k.current = null));
    }
    if (K && oe) {
      N.update({
        scrollUpArrowVisible: !1,
        scrollDownArrowVisible: !1
      });
      const Se = {
        height: ""
      };
      Nc(Q, Se), Nc(Z.current, Se);
    }
  }), ke = y.useMemo(() => ({
    ...se,
    side: ge,
    alignItemWithTriggerActive: oe,
    setControlledAlignItemWithTrigger: ie,
    scrollUpArrowRef: ne,
    scrollDownArrowRef: $
  }), [se, ge, oe, ie]);
  return /* @__PURE__ */ x.jsx(ug, {
    elementsRef: L,
    labelsRef: j,
    onMapChange: _e,
    children: /* @__PURE__ */ x.jsxs(nS.Provider, {
      value: ke,
      children: [q && _ && /* @__PURE__ */ x.jsx(cu, {
        inert: su(!K),
        cutout: B
      }), ye]
    })
  });
}), rc = "base-ui-disable-scrollbar", Sp = {
  className: rc,
  getElement(n) {
    return /* @__PURE__ */ x.jsx("style", {
      nonce: n,
      href: rc,
      precedence: "base-ui:low",
      children: `.${rc}{scrollbar-width:none}.${rc}::-webkit-scrollbar{display:none}`
    });
  }
}, O2 = /* @__PURE__ */ y.createContext(void 0), M2 = {
  disableStyleElements: !1
};
function A2() {
  return y.useContext(O2) ?? M2;
}
const z2 = {
  ..._o,
  ...ko
}, D2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
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
    setOpen: b,
    valueRef: S,
    firstItemTextRef: C,
    selectedItemTextRef: w,
    multiple: A,
    handleScrollArrowVisibility: T,
    scrollHandlerRef: z,
    listRef: M,
    highlightItemOnHover: D
  } = Jl(), {
    side: N,
    align: L,
    alignItemWithTriggerActive: j,
    isPositioned: H,
    setControlledAlignItemWithTrigger: k
  } = lS(), G = du() != null, E = Jx(), Z = pu(), {
    nonce: J,
    disableStyleElements: X
  } = A2(), K = Pe(m, Be.id), q = Pe(m, Be.open), _ = Pe(m, Be.openMethod), Y = Pe(m, Be.mounted), V = Pe(m, Be.popupProps), Q = Pe(m, Be.transitionStatus), B = Pe(m, Be.triggerElement), O = Pe(m, Be.positionerElement), U = Pe(m, Be.listElement), ne = y.useRef(!1), $ = y.useRef(!1), re = y.useRef({}), ie = na(), oe = ze((Ee) => {
    if (!O || !d.current || !$.current)
      return;
    if (ne.current || !j) {
      T();
      return;
    }
    const fe = O.style.top === "0px", ye = O.style.bottom === "0px";
    if (!fe && !ye) {
      T();
      return;
    }
    const Re = Eb(O), _e = fi(O.getBoundingClientRect().height, "y", Re), ke = tt(O), we = Dt(O), Ce = we.getComputedStyle(O), he = parseFloat(Ce.marginTop), Se = parseFloat(Ce.marginBottom), Te = wb(we.getComputedStyle(d.current)), Oe = Math.min(ke.documentElement.clientHeight - he - Se, Te), He = Ee.scrollTop, ae = ac(Ee);
    let pe = 0, Ue = null, ve = !1, be = !1;
    const We = (et) => {
      O.style.height = `${et}px`;
    }, rt = (et, gt) => {
      const zt = ui(et, 0, Oe - _e);
      zt > 0 && We(_e + zt), Ee.scrollTop = gt, Oe - (_e + zt) <= Il && (ne.current = !0), T();
    }, pt = fe ? ae - He : He, Nt = Math.min(_e + pt, Oe);
    if (pe = Nt, pt <= Il) {
      rt(pt, fe ? ae : 0);
      return;
    }
    if (Oe - Nt > Il)
      fe ? be = !0 : Ue = 0;
    else if (ve = !0, ye && He < ae) {
      const et = _e + pt - Oe;
      Ue = He - (pt - et);
    }
    if (pe = Math.ceil(pe), pe !== 0 && We(pe), be || Ue != null) {
      const et = ac(Ee), gt = be ? et : ui(Ue, 0, et);
      Math.abs(Ee.scrollTop - gt) > Il && (Ee.scrollTop = gt);
    }
    (ve || pe >= Oe - Il) && (ne.current = !0), T();
  });
  y.useImperativeHandle(z, () => oe, [oe]), Zl({
    open: q,
    ref: d,
    onComplete() {
      q && v?.(!0);
    }
  });
  const se = {
    open: q,
    transitionStatus: Q,
    side: N,
    align: L
  };
  xe(() => {
    !O || !d.current || Object.keys(re.current).length || (re.current = {
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
  }, [d, O]), xe(() => {
    q || j || ($.current = !1, ne.current = !1, Nc(O, re.current));
  }, [q, j, O, d]), xe(() => {
    const Ee = d.current;
    if (!q || !B || !O || !Ee || j && !H || m.state.transitionStatus === "ending")
      return;
    if (!j) {
      $.current = !0, ie.request(T), Ee.style.removeProperty("--transform-origin");
      return;
    }
    const fe = N2(Ee);
    Ee.style.removeProperty("--transform-origin");
    try {
      let ye = w.current;
      ye?.isConnected || (ye = !Be.hasSelectedValue(m.state) && C.current?.isConnected ? C.current : null);
      const Re = S.current, _e = Dt(O), ke = _e.getComputedStyle(O), we = _e.getComputedStyle(Ee), Ce = tt(B), he = Eb(B), Se = ic(B.getBoundingClientRect(), he), Te = ic(O.getBoundingClientRect(), he), Oe = Se.height, He = U || Ee, ae = He.scrollHeight, pe = parseFloat(we.borderBottomWidth), Ue = parseFloat(ke.marginTop) || 10, ve = parseFloat(ke.marginBottom) || 10, be = parseFloat(ke.minHeight) || 100, We = wb(we), rt = 5, pt = 5, Nt = 20, et = Ce.documentElement.clientHeight - Ue - ve, gt = Ce.documentElement.clientWidth, zt = et - Se.bottom + Oe;
      let yt, Mn = Z === "rtl" ? Se.right - Te.width : Se.left, An = 0;
      if (ye && Re) {
        const qt = ic(Re.getBoundingClientRect(), he);
        yt = ic(ye.getBoundingClientRect(), he), Mn = Te.left + (Z === "rtl" ? qt.right - yt.right : qt.left - yt.left);
        const Pn = qt.top - Se.top + qt.height / 2;
        An = yt.top - Te.top + yt.height / 2 - Pn;
      }
      const Qe = zt + An + ve + pe;
      let ft = Math.min(et, Qe);
      const It = et - Ue - ve, Ht = Qe - ft, Ut = gt - pt;
      O.style.left = `${ui(Mn, rt, Ut - Te.width)}px`, O.style.height = `${ft}px`, O.style.maxHeight = "none", O.style.marginTop = `${Ue}px`, O.style.marginBottom = `${ve}px`, Ee.style.height = "100%";
      const jt = ac(He), Gt = Ht >= jt - Il;
      Gt && (ft = Math.min(et, Te.height) - (Ht - jt));
      const Sn = Se.top < Nt || Se.bottom > et - Nt || Math.ceil(ft) + Il < Math.min(ae, be), zn = (_e.visualViewport?.scale ?? 1) !== 1 && zo;
      if (Sn || zn) {
        $.current = !0, Nc(O, re.current), k(!1);
        return;
      }
      const Vn = Math.max(be, ft);
      if (Gt) {
        const qt = Math.max(0, et - Qe);
        O.style.top = Te.height >= It ? "0" : `${qt}px`, O.style.height = `${ft}px`, He.scrollTop = ac(He);
      } else
        O.style.bottom = "0", He.scrollTop = Ht;
      if (yt) {
        const qt = Te.top, Pn = Te.height, hl = yt.top + yt.height / 2, tl = Pn > 0 ? (hl - qt) / Pn * 100 : 50, yl = ui(tl, 0, 100);
        Ee.style.setProperty("--transform-origin", `50% ${yl}%`);
      }
      (Vn === et || ft >= We) && (ne.current = !0), T(), D && m.state.selectedIndex === null && m.state.activeIndex === null && M.current[0] != null && m.set("activeIndex", 0), $.current = !0;
    } finally {
      fe();
    }
  }, [m, q, O, B, S, C, w, d, T, j, k, ie, U, M, D, Z, H]), y.useEffect(() => {
    if (!j || !O || !q)
      return;
    const Ee = Dt(O);
    function fe(ye) {
      b(!1, Ye(mR, ye));
    }
    return Je(Ee, "resize", fe);
  }, [b, j, O, q]);
  const ge = {
    ...U ? {
      role: "presentation",
      "aria-orientation": void 0
    } : {
      role: "listbox",
      "aria-multiselectable": A || void 0,
      id: `${K}-list`
    },
    onKeyDown(Ee) {
      G && Mi.has(Ee.key) && Ee.stopPropagation();
    },
    onScroll(Ee) {
      U || oe(Ee.currentTarget);
    },
    ...j && {
      style: U ? {
        height: "100%"
      } : oS
    }
  }, je = nt("div", o, {
    ref: [a, d],
    state: se,
    stateAttributesMapping: z2,
    props: [V, ge, zi(Q), {
      className: !U && j ? Sp.className : void 0
    }, g]
  });
  return /* @__PURE__ */ x.jsxs(y.Fragment, {
    children: [!X && Sp.getElement(J), /* @__PURE__ */ x.jsx(qc, {
      context: E,
      modal: !1,
      disabled: !Y,
      openInteractionType: _,
      returnFocus: p,
      restoreFocus: !0,
      children: je
    })]
  });
});
function wb(n) {
  const o = n.maxHeight || "";
  return o.endsWith("px") && parseFloat(o) || 1 / 0;
}
function ac(n) {
  return tS(n.scrollHeight, n.clientHeight);
}
function Eb(n) {
  return Y0.getScale(n);
}
function fi(n, o, a) {
  return n / a[o];
}
function ic(n, o) {
  return xi({
    x: fi(n.x, "x", o),
    y: fi(n.y, "y", o),
    width: fi(n.width, "x", o),
    height: fi(n.height, "y", o)
  });
}
const Tb = [["transform", "none"], ["scale", "1"], ["translate", "0 0"]];
function N2(n) {
  const {
    style: o
  } = n, a = {};
  for (const [i, u] of Tb)
    a[i] = o.getPropertyValue(i), o.setProperty(i, u, "important");
  return () => {
    for (const [i] of Tb) {
      const u = a[i];
      u ? o.setProperty(i, u) : o.removeProperty(i);
    }
  };
}
const j2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    ...p
  } = o, {
    store: g,
    scrollHandlerRef: m
  } = Jl(), {
    alignItemWithTriggerActive: d
  } = lS(), v = Pe(g, Be.hasScrollArrows), b = Pe(g, Be.openMethod), S = Pe(g, Be.multiple), w = {
    id: `${Pe(g, Be.id)}-list`,
    role: "listbox",
    "aria-multiselectable": S || void 0,
    onScroll(T) {
      m.current?.(T.currentTarget);
    },
    ...d && {
      style: oS
    },
    className: v && b !== "touch" ? Sp.className : void 0
  }, A = ze((T) => {
    g.set("listElement", T);
  });
  return nt("div", o, {
    ref: [a, A],
    props: [w, p]
  });
}), rS = /* @__PURE__ */ y.createContext(void 0);
function hg() {
  const n = y.useContext(rS);
  if (!n)
    throw new Error(At(57));
  return n;
}
const k2 = /* @__PURE__ */ y.memo(/* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    value: p = null,
    label: g,
    disabled: m = !1,
    nativeButton: d = !1,
    ...v
  } = o, b = y.useRef(null), S = Ai({
    label: g,
    textRef: b,
    indexGuessBehavior: Ox.GuessFromOrder
  }), {
    store: C,
    itemProps: w,
    setOpen: A,
    setValue: T,
    selectionRef: z,
    typingRef: M,
    valuesRef: D,
    multiple: N,
    selectedItemTextRef: L,
    disabled: j,
    readOnly: H
  } = Jl(), k = Pe(C, Be.isActive, S.index), G = Pe(C, Be.open), E = Pe(C, Be.isSelected, p), Z = Pe(C, Be.isSelectedByFocus, S.index), J = Pe(C, Be.isItemEqualToValue), X = S.index, K = X !== -1, q = y.useRef(null);
  xe(() => {
    if (!K)
      return;
    const oe = D.current;
    return oe[X] = p, () => {
      delete oe[X];
    };
  }, [K, X, p, D]), xe(() => {
    if (!K)
      return;
    const oe = C.state.value;
    let se = oe;
    N && Array.isArray(oe) && (se = oe.length > 0 ? oe[oe.length - 1] : void 0), se !== void 0 && ir(p, se, J) && (C.set("selectedIndex", X), b.current && (L.current = b.current));
  }, [K, X, N, J, C, p, L]);
  const _ = y.useRef(null), Y = y.useRef("mouse"), V = y.useRef(!1), {
    getButtonProps: Q,
    buttonRef: B
  } = Mo({
    disabled: m,
    focusableWhenDisabled: !0,
    native: d,
    composite: !0
  }), O = {
    disabled: m,
    selected: E,
    highlighted: k
  };
  function U(oe) {
    if (j || H)
      return;
    const se = C.state.value;
    if (N) {
      const ge = Array.isArray(se) ? se : [], je = E ? u2(ge, p, J) : [...ge, p];
      T(je, Ye($r, oe));
    } else
      T(p, Ye($r, oe)), A(!1, Ye($r, oe));
  }
  function ne() {
    z.current.dragY = 0;
  }
  const $ = {
    role: "option",
    "aria-selected": E,
    tabIndex: G && k ? 0 : -1,
    onKeyDown(oe) {
      _.current = oe.key, C.set("activeIndex", X), oe.key === " " && M.current && oe.preventDefault();
    },
    onClick(oe) {
      const se = oe.type === "click" && Y.current !== "touch", ge = oe.nativeEvent.pointerType, je = se && Lp(oe.nativeEvent) && // Generic no-pointer `detail === 0` clicks stay tied to highlight state. Virtual
      // clicks that carry browser pointer data, including an empty string from assistive
      // technology, can activate unhighlighted items.
      (ge !== void 0 || k), Ee = se && !je && !V.current;
      V.current = !1, !(oe.type === "keydown" && _.current === null) && (m || oe.type === "keydown" && _.current === " " && M.current || Ee || (_.current = null, U(oe.nativeEvent)));
    },
    onPointerEnter(oe) {
      Y.current = oe.pointerType;
    },
    onPointerMove(oe) {
      if (oe.pointerType === "mouse" && oe.buttons === 1) {
        const se = z.current;
        se.dragY += oe.movementY, se.dragY ** 2 >= 64 && (se.allowUnselectedMouseUp = !0);
      }
    },
    onPointerDown(oe) {
      Y.current = oe.pointerType, V.current = !0, ne();
    },
    onMouseUp() {
      if (ne(), m || Y.current === "touch" || V.current)
        return;
      const oe = !z.current.allowSelectedMouseUp && E, se = !z.current.allowUnselectedMouseUp && !E;
      oe || se || (V.current = !0, q.current?.click(), V.current = !1);
    }
  }, re = nt("div", o, {
    ref: [B, a, S.ref, q],
    state: O,
    props: [w, $, v, Q]
  }), ie = y.useMemo(() => ({
    selected: E,
    index: X,
    textRef: b,
    selectedByFocus: Z,
    hasRegistered: K
  }), [E, X, b, Z, K]);
  return /* @__PURE__ */ x.jsx(rS.Provider, {
    value: ie,
    children: re
  });
})), _2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const i = o.keepMounted ?? !1, {
    selected: u
  } = hg();
  return i || u ? /* @__PURE__ */ x.jsx(H2, {
    ...o,
    ref: a
  }) : null;
}), H2 = /* @__PURE__ */ y.memo(/* @__PURE__ */ y.forwardRef((n, o) => {
  const {
    render: a,
    className: i,
    style: u,
    keepMounted: f,
    ...p
  } = n, {
    selected: g
  } = hg(), m = y.useRef(null), {
    transitionStatus: d,
    setMounted: v
  } = Qc(g), S = nt("span", n, {
    ref: [o, m],
    state: {
      selected: g,
      transitionStatus: d
    },
    props: [{
      "aria-hidden": !0,
      children: "✔️"
    }, p],
    stateAttributesMapping: ko
  });
  return Zl({
    open: g,
    ref: m,
    onComplete() {
      g || v(!1);
    }
  }), S;
})), U2 = /* @__PURE__ */ y.memo(/* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    index: i,
    textRef: u,
    selectedByFocus: f,
    hasRegistered: p
  } = hg(), {
    firstItemTextRef: g,
    selectedItemTextRef: m
  } = Jl(), {
    render: d,
    className: v,
    style: b,
    ...S
  } = o, C = y.useCallback((A) => {
    A && (p && i === 0 && (g.current = A), p && f && (m.current = A));
  }, [g, m, i, f, p]);
  return nt("div", o, {
    ref: [C, a, u],
    props: S
  });
})), L2 = /* @__PURE__ */ y.createContext(void 0), I2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    ...p
  } = o, [g, m] = y.useState(), d = y.useMemo(() => ({
    labelId: g,
    setLabelId: m
  }), [g, m]), v = nt("div", o, {
    ref: a,
    props: [{
      role: "group",
      "aria-labelledby": g
    }, p]
  });
  return /* @__PURE__ */ x.jsx(L2.Provider, {
    value: d,
    children: v
  });
});
function aS({ ...n }) {
  return /* @__PURE__ */ x.jsx(m2, { "data-slot": "select", ...n });
}
function iS({ ...n }) {
  return /* @__PURE__ */ x.jsx(I2, { "data-slot": "select-group", ...n });
}
function sS({ ...n }) {
  return /* @__PURE__ */ x.jsx(S2, { "data-slot": "select-value", ...n });
}
function cS({
  className: n,
  size: o = "default",
  children: a,
  ...i
}) {
  return /* @__PURE__ */ x.jsxs(
    b2,
    {
      "data-slot": "select-trigger",
      "data-size": o,
      className: Ke(
        "tw:flex tw:w-full tw:items-center tw:justify-between tw:gap-2 tw:rounded-[var(--radius-control)] tw:border tw:border-input tw:bg-background tw:text-[var(--fs-body-s)] tw:text-foreground tw:whitespace-nowrap tw:outline-none tw:focus-visible:border-ring tw:focus-visible:ring-2 tw:focus-visible:ring-ring/40 tw:disabled:cursor-not-allowed tw:disabled:opacity-50 tw:data-[size=default]:h-8 tw:data-[size=sm]:h-7 tw:data-[size=default]:px-2.5 tw:data-[size=sm]:px-2 tw:data-[placeholder]:text-muted-foreground",
        n
      ),
      ...i,
      children: [
        a,
        /* @__PURE__ */ x.jsx(w2, { "data-icon": "select-chevron", "aria-hidden": "true", children: /* @__PURE__ */ x.jsx(mc, {}) })
      ]
    }
  );
}
function uS({
  className: n,
  children: o,
  portalContainer: a,
  positionerClassName: i,
  ...u
}) {
  return /* @__PURE__ */ x.jsx(T2, { container: a, children: /* @__PURE__ */ x.jsx(
    C2,
    {
      sideOffset: 4,
      className: Ke("tw:z-[var(--z-popover)]", i),
      children: /* @__PURE__ */ x.jsx(
        D2,
        {
          "data-slot": "select-content",
          className: Ke(
            "tw:min-w-(--anchor-width) tw:max-h-(--available-height) tw:origin-(--transform-origin) tw:overflow-x-hidden tw:overflow-y-auto tw:rounded-[var(--radius-control)] tw:border tw:border-border tw:bg-popover tw:p-1 tw:text-[var(--fs-body-s)] tw:text-popover-foreground tw:shadow-md tw:outline-none",
            n
          ),
          ...u,
          children: /* @__PURE__ */ x.jsx(j2, { className: "tw:flex tw:flex-col tw:gap-0.5", children: o })
        }
      )
    }
  ) });
}
function fS({ className: n, children: o, ...a }) {
  return /* @__PURE__ */ x.jsxs(
    k2,
    {
      "data-slot": "select-item",
      className: Ke(
        "tw:relative tw:flex tw:w-full tw:cursor-default tw:items-center tw:gap-2 tw:rounded-[var(--radius-control)] tw:py-1.5 tw:pr-8 tw:pl-2 tw:text-[var(--fs-body-s)] tw:outline-none tw:select-none tw:data-highlighted:bg-accent tw:data-highlighted:text-accent-foreground tw:data-disabled:pointer-events-none tw:data-disabled:opacity-50",
        n
      ),
      ...a,
      children: [
        /* @__PURE__ */ x.jsx("span", { className: "tw:absolute tw:right-2 tw:flex tw:size-3.5 tw:items-center tw:justify-center", "aria-hidden": "true", children: /* @__PURE__ */ x.jsx(_2, { children: /* @__PURE__ */ x.jsx(gc, { "data-icon": "select-check" }) }) }),
        /* @__PURE__ */ x.jsx(U2, { children: o })
      ]
    }
  );
}
function B2(n) {
  const o = y.useContext(ax) ? "drawer" : "dialog";
  return sx(n, o);
}
function V2({ ...n }) {
  return /* @__PURE__ */ x.jsx(B2, { "data-slot": "sheet", ...n });
}
function P2({ ...n }) {
  return /* @__PURE__ */ x.jsx(yx, { "data-slot": "sheet-portal", ...n });
}
function Y2({ className: n, ...o }) {
  return /* @__PURE__ */ x.jsx(
    cx,
    {
      "data-slot": "sheet-overlay",
      className: Ke(
        "tw:fixed tw:inset-0 tw:z-[var(--z-modal)] tw:bg-black/10 tw:duration-[var(--motion-panel)] tw:supports-backdrop-filter:backdrop-blur-xs",
        n
      ),
      ...o
    }
  );
}
function G2({
  className: n,
  children: o,
  side: a = "right",
  layer: i = "modal",
  showCloseButton: u = !0,
  showOverlay: f = !0,
  ...p
}) {
  return /* @__PURE__ */ x.jsxs(P2, { children: [
    f && /* @__PURE__ */ x.jsx(Y2, {}),
    /* @__PURE__ */ x.jsxs(
      hx,
      {
        "data-slot": "sheet-content",
        "data-side": a,
        "data-layer": i,
        className: Ke(
          "tw:fixed tw:flex tw:flex-col tw:gap-4 tw:bg-popover tw:bg-clip-padding tw:text-[var(--fs-body-s)] tw:text-popover-foreground tw:shadow-lg tw:transition-[opacity,transform] tw:duration-[var(--motion-panel)] tw:ease-[var(--ease-out)] tw:data-[layer=panel]:z-[var(--z-sticky)] tw:data-[layer=modal]:z-[var(--z-modal)] tw:data-[side=bottom]:inset-x-0 tw:data-[side=bottom]:bottom-0 tw:data-[side=bottom]:h-auto tw:data-[side=bottom]:border-t tw:data-[side=bottom]:data-ending-style:translate-y-full tw:data-[side=bottom]:data-starting-style:translate-y-full tw:data-[side=left]:inset-y-0 tw:data-[side=left]:left-0 tw:data-[side=left]:h-full tw:data-[side=left]:w-3/4 tw:data-[side=left]:border-r tw:data-[side=left]:data-ending-style:-translate-x-full tw:data-[side=left]:data-starting-style:-translate-x-full tw:data-[side=right]:inset-y-0 tw:data-[side=right]:right-0 tw:data-[side=right]:h-full tw:data-[side=right]:w-3/4 tw:data-[side=right]:border-l tw:data-[side=right]:data-ending-style:translate-x-full tw:data-[side=right]:data-starting-style:translate-x-full tw:data-[side=top]:inset-x-0 tw:data-[side=top]:top-0 tw:data-[side=top]:h-auto tw:data-[side=top]:border-b tw:data-[side=top]:data-ending-style:-translate-y-full tw:data-[side=top]:data-starting-style:-translate-y-full tw:data-[side=left]:sm:max-w-sm tw:data-[side=right]:sm:max-w-sm",
          n
        ),
        ...p,
        children: [
          o,
          u && /* @__PURE__ */ x.jsxs(
            ux,
            {
              "data-slot": "sheet-close",
              render: /* @__PURE__ */ x.jsx(
                ht,
                {
                  variant: "ghost",
                  className: "tw:absolute tw:top-3 tw:right-3",
                  size: "icon-sm"
                }
              ),
              children: [
                /* @__PURE__ */ x.jsx(di, {}),
                /* @__PURE__ */ x.jsx("span", { className: "tw:sr-only", children: "Close" })
              ]
            }
          )
        ]
      }
    )
  ] });
}
function q2({ className: n, ...o }) {
  return /* @__PURE__ */ x.jsx(
    "div",
    {
      "data-slot": "sheet-header",
      className: Ke("tw:flex tw:flex-col tw:gap-0.5 tw:p-4", n),
      ...o
    }
  );
}
function X2({ className: n, ...o }) {
  return /* @__PURE__ */ x.jsx(
    vx,
    {
      "data-slot": "sheet-title",
      className: Ke(
        "tw:text-[var(--fs-title)] tw:font-medium tw:text-foreground",
        n
      ),
      ...o
    }
  );
}
function F2({
  className: n,
  ...o
}) {
  return /* @__PURE__ */ x.jsx(
    fx,
    {
      "data-slot": "sheet-description",
      className: Ke("tw:text-[var(--fs-body-s)] tw:text-muted-foreground", n),
      ...o
    }
  );
}
const dS = /* @__PURE__ */ y.createContext(void 0);
function K2(n = !0) {
  const o = y.useContext(dS);
  if (o === void 0 && !n)
    throw new Error(At(7));
  return o;
}
const Q2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
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
    value: b,
    nativeButton: S = !0,
    style: C,
    ...w
  } = o, A = Bn(b || void 0), T = K2(), z = T?.value ?? [], M = T ? void 0 : u, D = (f || T?.disabled) ?? !1, [N, L] = ra({
    controlled: T ? A !== void 0 && z.indexOf(A) > -1 : m,
    default: M,
    name: "Toggle",
    state: "pressed"
  }), {
    getButtonProps: j,
    buttonRef: H
  } = Mo({
    disabled: D,
    native: S
  }), k = {
    disabled: D,
    pressed: N
  }, G = [H, a], E = [{
    "aria-pressed": N,
    onClick(X) {
      const K = !N, q = Ye(Do, X.nativeEvent);
      g?.(K, q), !q.isCanceled && (A && T?.setGroupValue?.(A, K, q), !q.isCanceled && L(K));
    }
  }, w, j], Z = nt("button", o, {
    enabled: !T,
    state: k,
    ref: G,
    props: E
  }), J = y.useMemo(() => ({
    disabled: D,
    focusableWhenDisabled: !1
  }), [D]);
  return T ? /* @__PURE__ */ x.jsx(Ux, {
    tag: "button",
    render: d,
    className: i,
    style: C,
    metadata: J,
    state: k,
    refs: G,
    props: E
  }) : Z;
}), Z2 = "data-composite-item-active", J2 = [];
function $2(n) {
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
    disabledIndices: b,
    modifierKeys: S = J2
  } = n, [C, w] = y.useState(0), A = i != null, T = y.useRef(null), z = To(T, m), M = y.useRef([]), D = y.useRef(!1), N = p ?? C, L = ze((E, Z = !1) => {
    if ((g ?? w)(E), Z) {
      const J = M.current[E];
      db(T.current, J, f, a);
    }
  }), j = ze((E) => {
    if (E.size === 0 || D.current)
      return;
    D.current = !0;
    const Z = Array.from(E.keys()), J = Z.find((K) => K?.hasAttribute(Z2)) ?? null, X = J ? Z.indexOf(J) : -1;
    if (X !== -1)
      L(X);
    else if (Ec(Z, N, b)) {
      const K = Bl(Z, {
        disabledIndices: b
      });
      pi(Z, K) || L(K);
    }
    db(T.current, J, f, a);
  });
  xe(() => {
    if (b == null || p != null || !D.current)
      return;
    const E = M.current;
    if (Ec(E, N, b)) {
      const Z = Bl(E, {
        disabledIndices: b
      });
      pi(E, Z) || L(Z);
    }
  }, [b, p, N, M, L]);
  const H = ze((E, Z, J) => u ? u(E, Z, J, M) : J), k = ze((E) => {
    const Z = d ? Mi : mx;
    if (!Z.has(E.key) || W2(E, S) || !T.current)
      return;
    const X = f === "rtl", K = X ? Ac : zc, q = {
      horizontal: K,
      vertical: hi,
      both: K
    }[a], _ = X ? zc : Ac, Y = {
      horizontal: _,
      vertical: mi,
      both: _
    }[a], V = gn(E.nativeEvent);
    if (V != null && fb(V) && !Vx(V)) {
      const re = V.selectionStart, ie = V.selectionEnd, oe = V.value ?? "";
      if (re == null || E.shiftKey || re !== ie || E.key !== Y && re < oe.length || E.key !== q && re > 0)
        return;
    }
    let Q = N;
    const B = uc(M, b), O = fp(M, b);
    i != null && (Q = i({
      disabledIndices: b,
      elementsRef: M,
      event: E,
      highlightedIndex: N,
      loopFocus: o,
      maxIndex: O,
      minIndex: B,
      onLoop: H,
      orientation: a,
      rtl: X
    }));
    const U = {
      horizontal: [K],
      vertical: [hi],
      both: [K, hi]
    }[a], ne = {
      horizontal: [_],
      vertical: [mi],
      both: [_, mi]
    }[a], $ = A ? Z : {
      horizontal: d ? TO : px,
      vertical: d ? RO : gx,
      both: Z
    }[a];
    d && (E.key === au ? Q = B : E.key === iu && (Q = O)), Q === N && (U.includes(E.key) || ne.includes(E.key)) && (o && Q === O && U.includes(E.key) ? (Q = B, u && (Q = u(E, N, Q, M))) : o && Q === B && ne.includes(E.key) ? (Q = O, u && (Q = u(E, N, Q, M))) : Q = Bl(M.current, {
      startingIndex: Q,
      decrement: ne.includes(E.key),
      disabledIndices: b
    })), Q !== N && !pi(M.current, Q) && (v && E.stopPropagation(), $.has(E.key) && E.preventDefault(), L(Q, !0), queueMicrotask(() => {
      M.current[Q]?.focus();
    }));
  });
  return {
    props: {
      ref: z,
      onFocus(E) {
        const Z = T.current, J = gn(E.nativeEvent);
        !Z || J == null || !fb(J) || J.setSelectionRange(0, J.value.length ?? 0);
      },
      onKeyDown: k
    },
    highlightedIndex: N,
    onHighlightedIndexChange: L,
    elementsRef: M,
    disabledIndices: b,
    onMapChange: j,
    relayKeyboardEvent: k
  };
}
function W2(n, o) {
  for (const a of zO.values())
    if (!o.includes(a) && n.getModifierState(a))
      return !0;
  return !1;
}
function eA(n) {
  const {
    render: o,
    className: a,
    style: i,
    refs: u = ql,
    props: f = ql,
    state: p = xt,
    stateAttributesMapping: g,
    highlightedIndex: m,
    onHighlightedIndexChange: d,
    orientation: v,
    grid: b,
    loopFocus: S,
    onLoop: C,
    enableHomeAndEndKeys: w,
    onMapChange: A,
    stopEventPropagation: T = !0,
    rootRef: z,
    disabledIndices: M,
    modifierKeys: D,
    highlightItemOnHover: N = !1,
    tag: L = "div",
    ...j
  } = n, H = pu(), {
    props: k,
    highlightedIndex: G,
    onHighlightedIndexChange: E,
    elementsRef: Z,
    onMapChange: J,
    relayKeyboardEvent: X
  } = $2({
    grid: b,
    loopFocus: S,
    onLoop: C,
    orientation: v,
    highlightedIndex: m,
    onHighlightedIndexChange: d,
    rootRef: z,
    stopEventPropagation: T,
    enableHomeAndEndKeys: w,
    direction: H,
    disabledIndices: M,
    modifierKeys: D
  }), K = nt(L, n, {
    state: p,
    ref: u,
    props: [k, ...f, j],
    stateAttributesMapping: g
  }), q = y.useMemo(() => ({
    highlightedIndex: G,
    onHighlightedIndexChange: E,
    highlightItemOnHover: N,
    relayKeyboardEvent: X
  }), [G, E, N, X]);
  return /* @__PURE__ */ x.jsx(Ib.Provider, {
    value: q,
    children: /* @__PURE__ */ x.jsx(ug, {
      elementsRef: Z,
      onMapChange: (_) => {
        A?.(_), J(_);
      },
      children: K
    })
  });
}
const tA = /* @__PURE__ */ y.createContext(void 0);
function nA(n) {
  return y.useContext(tA);
}
let lA = /* @__PURE__ */ (function(n) {
  return n.disabled = "data-disabled", n.orientation = "data-orientation", n.multiple = "data-multiple", n;
})({});
const Rb = {
  multiple(n) {
    return n ? {
      [lA.multiple]: ""
    } : null;
  }
}, oA = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    defaultValue: i,
    disabled: u = !1,
    loopFocus: f = !0,
    onValueChange: p,
    orientation: g = "horizontal",
    multiple: m = !1,
    value: d,
    className: v,
    render: b,
    style: S,
    ...C
  } = o, w = du(), A = nA(), T = y.useMemo(() => d !== void 0 || i !== void 0, [d, i]), z = (w?.disabled ?? !1) || (A?.disabled ?? !1) || u, [M, D] = ra({
    controlled: d,
    default: d === void 0 ? i ?? ql : void 0,
    name: "ToggleGroup",
    state: "value"
  }), N = ze((G, E, Z) => {
    let J;
    m ? (J = M.slice(), E ? J.push(G) : J.splice(M.indexOf(G), 1)) : J = E ? [G] : [], p?.(J, Z), !Z.isCanceled && D(J);
  }), L = {
    disabled: z,
    multiple: m,
    orientation: g
  }, j = y.useMemo(() => ({
    disabled: z,
    orientation: g,
    setGroupValue: N,
    value: M,
    isValueInitialized: T
  }), [z, g, N, M, T]), H = {
    role: "group"
  }, k = nt("div", o, {
    enabled: !!w,
    state: L,
    ref: a,
    props: [H, C],
    stateAttributesMapping: Rb
  });
  return /* @__PURE__ */ x.jsx(dS.Provider, {
    value: j,
    children: w ? k : /* @__PURE__ */ x.jsx(eA, {
      render: b,
      className: v,
      style: S,
      state: L,
      refs: [a],
      props: [H, C],
      stateAttributesMapping: Rb,
      loopFocus: f,
      enableHomeAndEndKeys: !0,
      orientation: g
    })
  });
}), rA = aa(
  "tw:inline-flex tw:items-center tw:justify-center tw:gap-2 tw:rounded-[var(--radius-surface)] tw:text-[var(--fs-body-s)] tw:text-muted-foreground tw:hover:bg-accent tw:hover:text-accent-foreground tw:focus-visible:ring-2 tw:focus-visible:ring-ring/40 tw:data-pressed:bg-accent tw:data-pressed:text-accent-foreground tw:disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "tw:bg-transparent",
        outline: "tw:border tw:border-input tw:bg-background"
      },
      size: {
        default: "tw:h-8 tw:px-2.5",
        sm: "tw:h-7 tw:px-2 tw:text-[var(--fs-caption)]",
        lg: "tw:h-9 tw:px-3"
      }
    },
    defaultVariants: { variant: "default", size: "default" }
  }
);
function Zd({
  className: n,
  ...o
}) {
  return /* @__PURE__ */ x.jsx(
    oA,
    {
      "data-slot": "toggle-group",
      className: Ke("tw:flex tw:w-fit tw:flex-row tw:items-center tw:gap-1", n),
      ...o
    }
  );
}
function Jd({
  className: n,
  variant: o = "default",
  size: a = "default",
  ...i
}) {
  return /* @__PURE__ */ x.jsx(
    Q2,
    {
      type: "button",
      "data-slot": "toggle-group-item",
      className: Ke(rA({ variant: o, size: a }), n),
      ...i
    }
  );
}
function aA({ className: n, ...o }) {
  return /* @__PURE__ */ x.jsx(fE, { "data-slot": "spinner", role: "status", "aria-label": "Loading", className: Ke("tw:size-4 tw:animate-spin", n), ...o });
}
const pS = /* @__PURE__ */ y.createContext(void 0);
function Di(n) {
  const o = y.useContext(pS);
  if (o === void 0 && !n)
    throw new Error(At(72));
  return o;
}
const iA = {
  ...tu,
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
class yg extends Oi {
  constructor(o, a, i = !1) {
    const u = new sa(), f = {
      ...sA(),
      ...o
    };
    f.floatingRootContext = ng(u, a, i), super(f, {
      popupRef: /* @__PURE__ */ y.createRef(),
      onOpenChange: void 0,
      onOpenChangeComplete: void 0,
      triggerElements: u
    }, iA);
  }
  setOpen = (o, a) => {
    eO(this, o, a, {
      extraState: {
        openChangeReason: a.reason
      }
    });
  };
  // Used by trigger clicks to clear a delayed hover open without reporting a public open-state change.
  cancelPendingOpen(o) {
    this.state.floatingRootContext.dispatchOpenChange(!1, Ye(Xl, o));
  }
  static useStore(o, a) {
    return $p(o, (u, f) => new yg(a, u, f)).store;
  }
}
function sA() {
  return {
    ...eu(),
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
const cA = Zp(function(o) {
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
    triggerId: b,
    defaultTriggerId: S = null,
    children: C
  } = o, w = yg.useStore(v?.store, {
    open: i,
    openProp: u,
    activeTriggerId: S,
    triggerIdProp: b
  });
  eg(w, u, i, S), w.useControlledProp("openProp", u), w.useControlledProp("triggerIdProp", b), w.useContextCallback("onOpenChange", m), w.useContextCallback("onOpenChangeComplete", d);
  const A = w.useState("open"), T = !a && A, z = w.useState("activeTriggerId"), M = w.useState("mounted"), D = w.useState("payload");
  w.useSyncedValues({
    trackCursorAxis: p,
    disableHoverablePopup: f
  }), w.useSyncedValue("disabled", a), Jc(w, {
    closeOnActiveTriggerUnmount: !0
  });
  const {
    forceUnmount: N,
    transitionStatus: L
  } = $c(T, w), j = w.useState("isInstantPhase"), H = w.useState("instantType"), k = w.useState("lastOpenChangeReason"), G = y.useRef(null);
  xe(() => {
    A && a && w.setOpen(!1, Ye(gR));
  }, [A, a, w]), xe(() => {
    L === "ending" && k === Do || L !== "ending" && j ? (H !== "delay" && (G.current = H), w.set("instantType", "delay")) : G.current !== null && (w.set("instantType", G.current), G.current = null);
  }, [L, j, k, H, w]), xe(() => {
    T && z == null && w.set("payload", void 0);
  }, [w, z, T]);
  const E = y.useCallback(() => {
    w.setOpen(!1, Ye(Pc));
  }, [w]);
  y.useImperativeHandle(g, () => ({
    unmount: N,
    close: E
  }), [N, E]);
  const Z = T || M || !a && p !== "none";
  return /* @__PURE__ */ x.jsxs(pS.Provider, {
    value: w,
    children: [Z && /* @__PURE__ */ x.jsx(uA, {
      store: w,
      disabled: a,
      trackCursorAxis: p
    }), typeof C == "function" ? C({
      payload: D
    }) : C]
  });
});
function uA({
  store: n,
  disabled: o,
  trackCursorAxis: a
}) {
  const i = n.useState("floatingRootContext"), u = Ci(i, {
    enabled: !o,
    referencePress: () => n.select("closeOnClick")
  }), f = QR(i, {
    enabled: !o && a !== "none",
    axis: a === "none" ? void 0 : a
  }), p = y.useMemo(() => bn(f.reference, u.reference), [f.reference, u.reference]), g = y.useMemo(() => bn(f.trigger, u.trigger), [f.trigger, u.trigger]), m = y.useMemo(() => bn(ia, f.floating, u.floating), [f.floating, u.floating]);
  return Wc(n, {
    activeTriggerProps: p,
    inactiveTriggerProps: g,
    popupProps: m
  }), null;
}
const gS = /* @__PURE__ */ y.createContext(void 0);
function fA() {
  return y.useContext(gS);
}
let dA = (function(n) {
  return n[n.popupOpen = Oc.popupOpen] = "popupOpen", n.triggerDisabled = "data-trigger-disabled", n;
})({});
const pA = 600, mS = "data-base-ui-tooltip-trigger";
function Cb(n) {
  if ("composedPath" in n) {
    const a = n.composedPath();
    for (let i = 0; i < a.length; i += 1) {
      const u = a[i];
      if ($e(u))
        return u;
    }
  }
  const o = n.target;
  return $e(o) ? o : null;
}
function gA(n) {
  let o = n;
  for (; o; ) {
    if (o.hasAttribute(mS))
      return o;
    const a = o.parentElement;
    if (a) {
      o = a;
      continue;
    }
    const i = o.getRootNode();
    o = "host" in i && $e(i.host) ? i.host : null;
  }
  return null;
}
const mA = K0(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    handle: p,
    payload: g,
    disabled: m,
    delay: d,
    closeOnClick: v = !0,
    closeDelay: b,
    id: S,
    ...C
  } = o, w = Di(!0), A = p?.store ?? w;
  if (!A)
    throw new Error(At(82));
  const T = Bn(S), z = A.useState("isTriggerActive", T), M = A.useState("isOpenedByTrigger", T), D = A.useState("floatingRootContext"), N = y.useRef(null), L = d ?? pA, j = b ?? 0, {
    registerTrigger: H,
    isMountedByThisTrigger: k
  } = tg(T, N, A, {
    payload: g,
    closeOnClick: v,
    closeDelay: j
  }), G = fA(), {
    delayRef: E,
    isInstantPhase: Z,
    hasProvider: J
  } = vR(D, {
    open: M
  }), X = rg(D);
  A.useSyncedValue("isInstantPhase", Z);
  const K = A.useState("disabled"), q = m ?? K, _ = Yt(q), Y = A.useState("trackCursorAxis"), V = A.useState("disableHoverablePopup"), Q = y.useRef(!1), B = sn(), O = y.useRef(void 0);
  function U() {
    const fe = G?.delay, ye = typeof E.current == "object" ? E.current.open : void 0;
    let Re = L;
    return J && (ye !== 0 ? Re = d ?? fe ?? L : Re = 0), Re;
  }
  function ne(fe) {
    const ye = N.current;
    if (!ye || !fe)
      return !1;
    const Re = gA(fe);
    return Re !== null && Re !== ye && Le(ye, Re);
  }
  function $(fe) {
    const ye = ne(fe);
    return Q.current = ye, ye && (X.openChangeTimeout.clear(), X.restTimeout.clear(), X.restTimeoutPending = !1, B.clear()), ye;
  }
  const re = nu(D, {
    enabled: !q,
    mouseOnly: !0,
    move: !1,
    handleClose: !V && Y !== "both" ? ou() : null,
    restMs: U,
    delay() {
      const fe = typeof E.current == "object" ? E.current.close : void 0;
      let ye = j;
      return b == null && J && (ye = fe), {
        close: ye
      };
    },
    triggerElementRef: N,
    isActiveTrigger: z,
    isClosing: () => A.select("transitionStatus") === "ending",
    shouldOpen() {
      return !Q.current;
    }
  }), ie = nx(D, {
    enabled: !q
  }).reference, oe = (fe) => {
    const ye = Q.current, Re = Cb(fe), _e = $(Re), ke = N.current, we = ke && Re && Le(ke, Re);
    if (_e && A.select("open") && A.select("lastOpenChangeReason") === Pt) {
      A.setOpen(!1, Ye(Pt, fe));
      return;
    }
    if (ye && !_e && we && !_.current && !A.select("open") && ke && // Match the hover hook's non-strict mouse fallback for mouse-only event sequences.
    or(O.current)) {
      const Ce = () => {
        !Q.current && !_.current && !A.select("open") && A.setOpen(!0, Ye(Pt, fe, ke));
      }, he = U();
      he === 0 ? (B.clear(), Ce()) : B.start(he, Ce);
    }
  }, se = A.useState("triggerProps", k);
  return nt("button", o, {
    state: {
      open: M
    },
    ref: [a, H, N],
    props: [re, ie, k || Y !== "none" ? se : void 0, {
      onMouseOver(fe) {
        oe(fe.nativeEvent);
      },
      onFocus(fe) {
        ne(Cb(fe.nativeEvent)) && fe.preventBaseUIHandler();
      },
      onMouseLeave() {
        Q.current = !1, B.clear(), O.current = void 0;
      },
      onPointerEnter(fe) {
        O.current = fe.pointerType;
      },
      onPointerDown(fe) {
        O.current = fe.pointerType, A.set("closeOnClick", v), v && !A.select("open") && A.cancelPendingOpen(fe.nativeEvent);
      },
      onClick(fe) {
        v && !A.select("open") && A.cancelPendingOpen(fe.nativeEvent);
      },
      id: T,
      [dA.triggerDisabled]: q ? "" : void 0,
      [mS]: q ? void 0 : ""
    }, C],
    stateAttributesMapping: ru
  });
}), hS = /* @__PURE__ */ y.createContext(void 0);
function hA() {
  const n = y.useContext(hS);
  if (n === void 0)
    throw new Error(At(70));
  return n;
}
const yA = /* @__PURE__ */ y.forwardRef(function(o, a) {
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
  } = N0({
    container: u,
    ref: a,
    componentProps: o,
    elementProps: m
  });
  return !v && !d ? null : /* @__PURE__ */ x.jsxs(y.Fragment, {
    children: [v, d && /* @__PURE__ */ gl.createPortal(i, d)]
  });
}), vA = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    keepMounted: i = !1,
    ...u
  } = o;
  return Di().useState("mounted") || i ? /* @__PURE__ */ x.jsx(hS.Provider, {
    value: i,
    children: /* @__PURE__ */ x.jsx(yA, {
      ref: a,
      ...u
    })
  }) : null;
}), yS = /* @__PURE__ */ y.createContext(void 0);
function vS() {
  const n = y.useContext(yS);
  if (n === void 0)
    throw new Error(At(71));
  return n;
}
const bA = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    anchor: f,
    positionMethod: p = "absolute",
    side: g = "top",
    align: m = "center",
    sideOffset: d = 0,
    alignOffset: v = 0,
    collisionBoundary: b = "clipping-ancestors",
    collisionPadding: S = 5,
    arrowPadding: C = 5,
    sticky: w = !1,
    disableAnchorTracking: A = !1,
    collisionAvoidance: T = qp,
    style: z,
    ...M
  } = o, D = Di(), N = hA(), L = D.useState("open"), j = D.useState("mounted"), H = D.useState("trackCursorAxis"), k = D.useState("disableHoverablePopup"), G = D.useState("floatingRootContext"), E = D.useState("instantType"), Z = D.useState("transitionStatus"), J = D.useState("hasViewport"), X = gu({
    anchor: f,
    positionMethod: p,
    floatingRootContext: G,
    mounted: j,
    side: g,
    sideOffset: d,
    align: m,
    alignOffset: v,
    collisionBoundary: b,
    collisionPadding: S,
    sticky: w,
    arrowPadding: C,
    disableAnchorTracking: A,
    keepMounted: N,
    collisionAvoidance: T,
    adaptiveOrigin: J ? cg : void 0
  }), K = y.useMemo(() => ({
    open: L,
    side: X.side,
    align: X.align,
    anchorHidden: X.anchorHidden,
    instant: H !== "none" ? "tracking-cursor" : E
  }), [L, X.side, X.align, X.anchorHidden, H, E]), q = mu(o, K, {
    styles: X.positionerStyles,
    transitionStatus: Z,
    props: M,
    refs: [a, D.useStateSetter("positionerElement")],
    hidden: !j,
    inert: !L || H === "both" || k
  });
  return /* @__PURE__ */ x.jsx(yS.Provider, {
    value: X,
    children: q
  });
}), xA = {
  ..._o,
  ...ko
}, SA = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    ...p
  } = o, g = Di(), {
    side: m,
    align: d
  } = vS(), v = g.useState("open"), b = g.useState("instantType"), S = g.useState("transitionStatus"), C = g.useState("popupProps"), w = g.useState("floatingRootContext"), A = g.useState("disabled"), T = g.useState("closeDelay");
  Zl({
    open: v,
    ref: g.context.popupRef,
    onComplete() {
      v && g.context.onOpenChangeComplete?.(!0);
    }
  }), ag(w, {
    enabled: !A,
    closeDelay: T
  });
  const z = g.useStateSetter("popupElement");
  return nt("div", o, {
    state: {
      open: v,
      side: m,
      align: d,
      instant: b,
      transitionStatus: S
    },
    ref: [a, g.context.popupRef, z],
    props: [C, zi(S), p],
    stateAttributesMapping: xA
  });
}), wA = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    ...p
  } = o, g = Di(), {
    arrowRef: m,
    side: d,
    align: v,
    arrowUncentered: b,
    arrowStyles: S
  } = vS(), C = g.useState("open"), w = g.useState("instantType");
  return nt("div", o, {
    state: {
      open: C,
      side: d,
      align: v,
      uncentered: b,
      instant: w
    },
    ref: [a, m],
    props: [{
      style: S,
      "aria-hidden": !0
    }, p],
    stateAttributesMapping: _o
  });
}), EA = function(o) {
  const {
    delay: a,
    closeDelay: i,
    timeout: u = 400
  } = o, f = y.useMemo(() => ({
    delay: a,
    closeDelay: i
  }), [a, i]), p = y.useMemo(() => ({
    open: a,
    close: i
  }), [a, i]);
  return /* @__PURE__ */ x.jsx(gS.Provider, {
    value: f,
    children: /* @__PURE__ */ x.jsx(yR, {
      delay: p,
      timeoutMs: u,
      children: o.children
    })
  });
};
function TA({
  delay: n = 0,
  ...o
}) {
  return /* @__PURE__ */ x.jsx(
    EA,
    {
      "data-slot": "tooltip-provider",
      delay: n,
      ...o
    }
  );
}
function RA({ ...n }) {
  return /* @__PURE__ */ x.jsx(cA, { "data-slot": "tooltip", ...n });
}
function CA({ ...n }) {
  return /* @__PURE__ */ x.jsx(mA, { "data-slot": "tooltip-trigger", ...n });
}
function OA({
  className: n,
  side: o = "top",
  sideOffset: a = 4,
  align: i = "center",
  alignOffset: u = 0,
  children: f,
  ...p
}) {
  return /* @__PURE__ */ x.jsx(vA, { children: /* @__PURE__ */ x.jsx(
    bA,
    {
      align: i,
      alignOffset: u,
      side: o,
      sideOffset: a,
      className: "tw:isolate tw:z-[var(--z-popover)]",
      children: /* @__PURE__ */ x.jsxs(
        SA,
        {
          "data-slot": "tooltip-content",
          className: Ke(
            "tw:inline-flex tw:w-fit tw:max-w-xs tw:items-center tw:gap-1.5 tw:rounded-[var(--radius-control)] tw:bg-foreground tw:px-3 tw:py-1.5 tw:text-[var(--fs-label)] tw:text-background tw:has-data-[slot=kbd]:pr-1.5 tw:**:data-[slot=kbd]:relative tw:**:data-[slot=kbd]:isolate tw:**:data-[slot=kbd]:rounded-sm",
            n
          ),
          ...p,
          children: [
            f,
            /* @__PURE__ */ x.jsx(wA, { className: "tw:size-2.5 tw:translate-y-[calc(-50%-2px)] tw:rotate-45 tw:rounded-[2px] tw:bg-foreground tw:fill-foreground tw:data-[side=bottom]:top-1 tw:data-[side=inline-end]:top-1/2! tw:data-[side=inline-end]:-left-1 tw:data-[side=inline-end]:-translate-y-1/2 tw:data-[side=inline-start]:top-1/2! tw:data-[side=inline-start]:-right-1 tw:data-[side=inline-start]:-translate-y-1/2 tw:data-[side=left]:top-1/2! tw:data-[side=left]:-right-1 tw:data-[side=left]:-translate-y-1/2 tw:data-[side=right]:top-1/2! tw:data-[side=right]:-left-1 tw:data-[side=right]:-translate-y-1/2 tw:data-[side=top]:-bottom-2.5" })
          ]
        }
      )
    }
  ) });
}
const bS = 420;
function MA(n) {
  const [o, a] = n.split("-");
  return { side: o, align: a ?? "center" };
}
function AA({ children: n }) {
  return /* @__PURE__ */ x.jsx(TA, { delay: bS, closeDelay: 0, children: n });
}
function sc(n) {
  const { label: o, children: a, placement: i = "top" } = n, u = Wd.useId(), [f, p] = Wd.useState(!1);
  return /* @__PURE__ */ x.jsxs(RA, { open: f, onOpenChange: p, children: [
    /* @__PURE__ */ x.jsx(
      CA,
      {
        delay: bS,
        closeDelay: 0,
        "aria-describedby": f ? u : void 0,
        onBlur: () => p(!1),
        onMouseLeave: () => p(!1),
        render: a
      }
    ),
    /* @__PURE__ */ x.jsx(OA, { id: u, role: "tooltip", ...MA(i), className: "ui-tooltip open", children: o })
  ] });
}
const mt = (n) => document.getElementById(n);
function Zr(n) {
  mt(n)?.click();
}
function xS(n) {
  const o = mt(n);
  return o ? [...o.options].map((a) => ({ value: a.value, label: a.text })) : [];
}
function wp(n, o) {
  const a = mt(n);
  a && (a.value = o, a.dispatchEvent(new Event("change", { bubbles: !0 })));
}
function cc(n, o) {
  return [...document.querySelectorAll(`#${n} ${o}`)].map((a, i) => ({
    key: a.dataset.pick ?? a.dataset.wfpick ?? a.dataset.rec ?? a.dataset.cat ?? a.dataset.fmt ?? String(i),
    label: (a instanceof HTMLInputElement ? a.closest("label")?.textContent : a.textContent)?.replace(/\s+/g, " ").trim() || "Option",
    active: a instanceof HTMLInputElement && a.checked || a.classList.contains("on") || a.closest(".mi")?.classList.contains("on") === !0,
    element: a
  }));
}
const Ob = /* @__PURE__ */ new Set(["png", "jpg", "svg", "mp4", "pdf", "html", "docx", "xlsx", "csv", "md"]);
function Ep(n) {
  return n.replace(/\s+\d+$/, "").trim();
}
function $d(n) {
  return {
    mtime: "Modified ↓",
    mtime_asc: "Modified ↑",
    btime: "Created ↓",
    btime_asc: "Created ↑",
    name: "Name A–Z",
    size: "Size ↓",
    rating: "Rating ↓"
  }[n] ?? n;
}
const zA = {
  mtime: "mtime_asc",
  mtime_asc: "mtime",
  btime: "btime_asc",
  btime_asc: "btime"
};
function DA(n) {
  return [...document.querySelectorAll("#activeChips [data-fx]:not([data-fx='fav'])")].map((o) => {
    const a = o.dataset.fx ?? "filter";
    let i = o.parentElement?.textContent?.replace("×", "").trim() || "Filter";
    return a === "fmt" && n?.summary ? i = n.summary : i = i.replace(/^(Formats|Status|Folder|Collection):\s*/, ""), { key: a, label: i, remove: o };
  });
}
function NA({
  state: n,
  folder: o,
  collectionItems: a,
  workflowItems: i
}) {
  const [u, f] = y.useState(""), [p, g] = y.useState(!1), [m, d] = y.useState(!1), [v, b] = y.useState(""), [S, C] = y.useState(!1), [w, A] = y.useState(!1), T = window.__galleryFileTypes, z = n.types.filter((E) => E.active).map((E) => E.key), M = n.pinned.map((E) => n.types.find((Z) => Z.key === E)).filter((E) => !!E), D = M.filter((E) => Ob.has(E.key)), N = M.filter((E) => !Ob.has(E.key)), L = n.types.filter((E) => {
    const Z = u.trim().toLowerCase();
    return !Z || E.key.includes(Z) || E.label.toLowerCase().includes(Z);
  }), j = xS("folder").map((E) => ({
    value: E.value,
    label: E.value ? E.label : "All folders"
  })), H = (E, Z) => {
    const J = new Set(E);
    T?.setActive([...z.filter((X) => !J.has(X)), ...Z]);
  }, k = () => {
    const E = v.trim();
    E && (T?.savePreset(E), b(""), d(!1));
  };
  if (p)
    return /* @__PURE__ */ x.jsxs(x.Fragment, { children: [
      /* @__PURE__ */ x.jsxs(i2, { className: "gallery-filter-panel-head", children: [
        /* @__PURE__ */ x.jsx(vp, { className: "tw:sr-only", children: "File types" }),
        /* @__PURE__ */ x.jsx(bp, { className: "tw:sr-only", children: "Customize quick file types for this project" }),
        /* @__PURE__ */ x.jsxs("div", { children: [
          /* @__PURE__ */ x.jsx("div", { className: "gallery-filter-panel-title", children: "Customize Quick Types" }),
          /* @__PURE__ */ x.jsxs("div", { className: "gallery-filter-helper", children: [
            "Saved for ",
            n.projectName
          ] })
        ] }),
        /* @__PURE__ */ x.jsx(ht, { variant: "ghost", size: "sm", onClick: () => g(!1), children: "Done" })
      ] }),
      /* @__PURE__ */ x.jsx(ai, {}),
      /* @__PURE__ */ x.jsx("div", { className: "gallery-filter-scroll", children: /* @__PURE__ */ x.jsxs("div", { className: "gallery-filter-section", children: [
        /* @__PURE__ */ x.jsx("div", { className: "gallery-filter-section-label", children: "Choose pinned types" }),
        /* @__PURE__ */ x.jsx(
          Zd,
          {
            multiple: !0,
            value: n.pinned,
            onValueChange: (E) => T?.setPinned(E),
            className: "gallery-type-customize-grid",
            "aria-label": "Quick file types for this project",
            children: n.types.map((E) => /* @__PURE__ */ x.jsxs(
              Jd,
              {
                value: E.key,
                variant: "outline",
                size: "sm",
                "data-gallery-customize-type": E.key,
                children: [
                  /* @__PURE__ */ x.jsx(np, { "data-icon": "inline-start" }),
                  E.label
                ]
              },
              E.key
            ))
          }
        )
      ] }) })
    ] });
  const G = (E, Z) => {
    if (!Z.length) return null;
    const J = Z.map((X) => X.key);
    return /* @__PURE__ */ x.jsxs("div", { className: "gallery-type-group", children: [
      /* @__PURE__ */ x.jsx("div", { className: "gallery-filter-sub-label", children: E }),
      /* @__PURE__ */ x.jsx(
        Zd,
        {
          multiple: !0,
          value: z.filter((X) => J.includes(X)),
          onValueChange: (X) => H(J, X),
          className: "gallery-quick-types",
          "aria-label": `${E.toLowerCase()} file types`,
          children: Z.map((X) => /* @__PURE__ */ x.jsxs(
            Jd,
            {
              value: X.key,
              variant: "outline",
              size: "sm",
              "data-gallery-quick-type": X.key,
              children: [
                X.active && /* @__PURE__ */ x.jsx(gc, { "data-icon": "inline-start" }),
                X.label
              ]
            },
            X.key
          ))
        }
      )
    ] });
  };
  return /* @__PURE__ */ x.jsxs(x.Fragment, { children: [
    /* @__PURE__ */ x.jsx(vp, { className: "tw:sr-only", children: "File types" }),
    /* @__PURE__ */ x.jsx(bp, { className: "tw:sr-only", children: "Filter files and customize quick file types for this project" }),
    /* @__PURE__ */ x.jsxs("div", { className: "gallery-filter-scroll", "data-gallery-file-type-panel": !0, children: [
      /* @__PURE__ */ x.jsxs("section", { className: "gallery-filter-section", "aria-labelledby": "quick-types-heading", children: [
        /* @__PURE__ */ x.jsxs("div", { className: "gallery-filter-section-heading", children: [
          /* @__PURE__ */ x.jsxs("div", { children: [
            /* @__PURE__ */ x.jsx("div", { id: "quick-types-heading", className: "gallery-filter-section-label", children: "Quick Types" }),
            /* @__PURE__ */ x.jsx("div", { className: "gallery-filter-helper", children: "Pinned for this project" })
          ] }),
          /* @__PURE__ */ x.jsxs(ht, { variant: "ghost", size: "xs", onClick: () => g(!0), children: [
            /* @__PURE__ */ x.jsx(Db, { "data-icon": "inline-start" }),
            "Customize"
          ] })
        ] }),
        G("Outputs", D),
        G("Sources", N)
      ] }),
      /* @__PURE__ */ x.jsx(ai, {}),
      /* @__PURE__ */ x.jsxs("section", { className: "gallery-filter-section", "aria-labelledby": "project-presets-heading", children: [
        /* @__PURE__ */ x.jsxs("div", { children: [
          /* @__PURE__ */ x.jsx("div", { id: "project-presets-heading", className: "gallery-filter-section-label", children: "Project Presets" }),
          /* @__PURE__ */ x.jsx("div", { className: "gallery-filter-helper", children: "Saved only in this project" })
        ] }),
        /* @__PURE__ */ x.jsxs("div", { className: "gallery-project-presets", children: [
          n.presets.map((E) => /* @__PURE__ */ x.jsxs("div", { className: "gallery-project-preset", children: [
            /* @__PURE__ */ x.jsx(
              ht,
              {
                variant: E.active ? "secondary" : "outline",
                size: "xs",
                "data-gallery-file-preset": E.id,
                onClick: () => T?.applyPreset(E.id),
                children: E.label
              }
            ),
            E.custom && /* @__PURE__ */ x.jsx(
              ht,
              {
                variant: "ghost",
                size: "icon-xs",
                "aria-label": `Delete preset ${E.label}`,
                onClick: () => T?.removePreset(E.id),
                children: /* @__PURE__ */ x.jsx(di, {})
              }
            )
          ] }, E.id)),
          /* @__PURE__ */ x.jsxs(ht, { variant: "outline", size: "xs", "data-gallery-new-preset": !0, onClick: () => d(!0), children: [
            /* @__PURE__ */ x.jsx(mE, { "data-icon": "inline-start" }),
            "New preset"
          ] })
        ] }),
        m && /* @__PURE__ */ x.jsxs(hp, { "data-gallery-preset-form": !0, children: [
          /* @__PURE__ */ x.jsx(
            yp,
            {
              "aria-label": "New preset name",
              placeholder: "Preset name…",
              value: v,
              onChange: (E) => b(E.target.value),
              onKeyDown: (E) => {
                E.key === "Enter" && (E.preventDefault(), k()), E.key === "Escape" && (E.stopPropagation(), d(!1));
              },
              autoFocus: !0
            }
          ),
          /* @__PURE__ */ x.jsx(Dc, { align: "inline-end", children: /* @__PURE__ */ x.jsx(qx, { onClick: k, disabled: !v.trim(), children: "Save" }) })
        ] })
      ] }),
      /* @__PURE__ */ x.jsx(ai, {}),
      /* @__PURE__ */ x.jsxs("section", { "aria-labelledby": "all-file-types-heading", children: [
        /* @__PURE__ */ x.jsxs(
          ht,
          {
            variant: "ghost",
            size: "sm",
            className: "gallery-filter-disclosure",
            "aria-expanded": S,
            onClick: () => C((E) => !E),
            children: [
              /* @__PURE__ */ x.jsx("span", { id: "all-file-types-heading", children: "All file types" }),
              S ? /* @__PURE__ */ x.jsx(mc, { "data-icon": "inline-end" }) : /* @__PURE__ */ x.jsx(ep, { "data-icon": "inline-end" })
            ]
          }
        ),
        S && /* @__PURE__ */ x.jsxs("div", { className: "gallery-filter-collapsible-content", children: [
          /* @__PURE__ */ x.jsxs(hp, { children: [
            /* @__PURE__ */ x.jsx(
              yp,
              {
                "aria-label": "Search file types",
                placeholder: "Search extension or language…",
                value: u,
                onChange: (E) => f(E.target.value)
              }
            ),
            /* @__PURE__ */ x.jsx(Dc, { align: "inline-start", "aria-hidden": "true", children: /* @__PURE__ */ x.jsx(tp, {}) })
          ] }),
          /* @__PURE__ */ x.jsx("div", { className: "gallery-all-types", role: "list", "aria-label": "All file types", children: L.map((E) => /* @__PURE__ */ x.jsxs("div", { className: "gallery-all-type-row", role: "listitem", children: [
            /* @__PURE__ */ x.jsxs(
              ht,
              {
                variant: "ghost",
                size: "sm",
                "data-gallery-file-type": E.key,
                "aria-pressed": E.active,
                onClick: () => H([E.key], E.active ? [] : [E.key]),
                children: [
                  E.active && /* @__PURE__ */ x.jsx(gc, { "data-icon": "inline-start" }),
                  E.label
                ]
              }
            ),
            /* @__PURE__ */ x.jsx(
              ht,
              {
                variant: "ghost",
                size: "icon-sm",
                "aria-label": `${E.pinned ? "Unpin" : "Pin"} ${E.label} for this project`,
                "aria-pressed": E.pinned,
                "data-gallery-pin-type": E.key,
                onClick: () => T?.setPinned(E.pinned ? n.pinned.filter((Z) => Z !== E.key) : [...n.pinned, E.key]),
                children: /* @__PURE__ */ x.jsx(np, {})
              }
            )
          ] }, E.key)) })
        ] })
      ] }),
      /* @__PURE__ */ x.jsx(ai, {}),
      /* @__PURE__ */ x.jsxs("section", { "aria-labelledby": "other-filters-heading", children: [
        /* @__PURE__ */ x.jsxs(
          ht,
          {
            variant: "ghost",
            size: "sm",
            className: "gallery-filter-disclosure",
            "aria-expanded": w,
            onClick: () => A((E) => !E),
            children: [
              /* @__PURE__ */ x.jsx("span", { id: "other-filters-heading", children: "Folders, status & collections" }),
              w ? /* @__PURE__ */ x.jsx(mc, { "data-icon": "inline-end" }) : /* @__PURE__ */ x.jsx(ep, { "data-icon": "inline-end" })
            ]
          }
        ),
        w && /* @__PURE__ */ x.jsxs("div", { className: "gallery-filter-section gallery-other-filters", children: [
          /* @__PURE__ */ x.jsxs("div", { className: "gallery-other-filter-row", children: [
            /* @__PURE__ */ x.jsx(oE, { "aria-hidden": "true" }),
            /* @__PURE__ */ x.jsxs(
              aS,
              {
                items: j,
                modal: !1,
                value: o?.value ?? "",
                onValueChange: (E) => wp("folder", E ?? ""),
                children: [
                  /* @__PURE__ */ x.jsx(cS, { size: "sm", "aria-label": "Filter by folder", children: /* @__PURE__ */ x.jsx(sS, {}) }),
                  /* @__PURE__ */ x.jsx(uS, { children: /* @__PURE__ */ x.jsx(iS, { children: j.map((E) => /* @__PURE__ */ x.jsx(fS, { value: E.value, children: E.label }, E.value || "all")) }) })
                ]
              }
            )
          ] }),
          i.length > 0 && /* @__PURE__ */ x.jsxs("div", { className: "gallery-type-group", children: [
            /* @__PURE__ */ x.jsx("div", { className: "gallery-filter-sub-label", children: "Status" }),
            /* @__PURE__ */ x.jsx(
              Zd,
              {
                value: i.filter((E) => E.active).map((E) => E.key),
                onValueChange: (E) => {
                  const Z = E.at(-1) ?? "";
                  i.find((J) => J.key === Z)?.element.click();
                },
                className: "gallery-workflow-types",
                "aria-label": "Workflow status",
                children: i.filter((E) => E.key).map((E) => /* @__PURE__ */ x.jsx(Jd, { value: E.key, variant: "outline", size: "sm", "data-gallery-status": E.key, children: Ep(E.label) }, E.key))
              }
            )
          ] }),
          a.length > 0 && /* @__PURE__ */ x.jsxs("div", { className: "gallery-type-group", children: [
            /* @__PURE__ */ x.jsx("div", { className: "gallery-filter-sub-label", children: "Collections" }),
            /* @__PURE__ */ x.jsx("div", { className: "gallery-collection-filters", children: a.map((E) => /* @__PURE__ */ x.jsx(ht, { variant: E.active ? "secondary" : "outline", size: "sm", onClick: () => E.element.click(), children: Ep(E.label) }, E.key)) })
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ x.jsx(ai, {}),
    /* @__PURE__ */ x.jsx("div", { className: "gallery-filter-panel-foot", children: /* @__PURE__ */ x.jsxs(ht, { variant: "ghost", size: "sm", onClick: () => T?.resetFilters(), children: [
      /* @__PURE__ */ x.jsx(bE, { "data-icon": "inline-start" }),
      "Reset filters"
    ] }) })
  ] });
}
function jA(n) {
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
function kA() {
  const [, n] = y.useReducer((E) => E + 1, 0), [o, a] = y.useState(!1), [i, u] = y.useState(!1), f = mt("q")?.value ?? "", p = mt("sort"), g = mt("folder"), m = mt("favChip"), d = mt("rescan")?.classList.contains("spinning") === !0, v = mt("densitySeg")?.querySelector("button.on")?.dataset.d ?? "m", b = cc("collMenu", "[data-pick]"), S = cc("wfMenu", "[data-wfpick]"), C = cc("recMenu", "[data-rec]"), w = window.__galleryFileTypes?.getState() ?? {
    projectName: "this project",
    types: cc("fmtMenu", "input[data-fmt]").map((E) => ({
      key: E.key,
      label: Ep(E.label),
      active: E.active,
      pinned: !1
    })),
    pinned: [],
    presets: [],
    summary: "File types"
  }, A = window.__gallerySelection?.getState() ?? { rels: [], imageCount: 0 }, T = DA(w), z = document.querySelectorAll("#activeChips [data-fx]:not([data-fx='fav'])").length, M = m?.classList.contains("on") === !0, D = xS("sort").map((E) => ({ value: E.value, label: $d(E.value) })), N = p?.value ?? "mtime", L = zA[N], j = S.some((E) => E.active && E.key !== ""), H = b.some((E) => E.active), k = () => mt("collMenu")?.querySelector("[data-clear]")?.click();
  y.useEffect(() => {
    const E = () => n(), Z = new MutationObserver(E);
    [
      mt("activeChips"),
      mt("densitySeg"),
      mt("favChip"),
      mt("rescan"),
      mt("fmtMenu"),
      mt("collMenu"),
      mt("wfMenu"),
      mt("recMenu"),
      mt("selBar")
    ].filter((K) => !!K).forEach((K) => Z.observe(K, {
      attributes: !0,
      childList: !0,
      characterData: !0,
      subtree: !0
    }));
    const X = [mt("q"), mt("sort"), mt("folder")].filter((K) => !!K);
    return X.forEach((K) => {
      K.addEventListener("input", E), K.addEventListener("change", E);
    }), window.addEventListener("atelier-gallery-file-types-change", E), window.addEventListener("atelier-gallery-selection-change", E), document.documentElement.classList.add("gallery-react-mounted"), document.documentElement.dataset.galleryUi = "shadcn-react-v1", () => {
      Z.disconnect(), X.forEach((K) => {
        K.removeEventListener("input", E), K.removeEventListener("change", E);
      }), window.removeEventListener("atelier-gallery-file-types-change", E), window.removeEventListener("atelier-gallery-selection-change", E), document.documentElement.classList.remove("gallery-react-mounted");
    };
  }, []), y.useEffect(() => {
    A.rels.length && (a(!1), u(!1));
  }, [A.rels.length]), y.useEffect(() => {
    const E = (Z) => {
      const J = Z.target, X = J?.matches("input, textarea, select") || J?.isContentEditable;
      Z.key !== "/" || Z.metaKey || Z.ctrlKey || Z.altKey || X || (Z.preventDefault(), u(!1), a(!0));
    };
    return document.addEventListener("keydown", E), () => document.removeEventListener("keydown", E);
  }, []);
  const G = (E) => {
    const Z = mt("q");
    Z && (Z.value = E, Z.dispatchEvent(new Event("input", { bubbles: !0 })));
  };
  if (A.rels.length) {
    const E = window.__gallerySelection;
    return /* @__PURE__ */ x.jsxs("div", { className: "gallery-command-bar gallery-selection-command-bar", role: "toolbar", "aria-label": "Selected files actions", "data-gallery-toolbar-state": "selection", children: [
      /* @__PURE__ */ x.jsxs("div", { className: "gallery-selection-count", "aria-live": "polite", children: [
        /* @__PURE__ */ x.jsx(EE, { "aria-hidden": "true" }),
        /* @__PURE__ */ x.jsxs("span", { children: [
          A.rels.length,
          " selected"
        ] })
      ] }),
      /* @__PURE__ */ x.jsx("div", { className: "gallery-command-spacer" }),
      A.rels.length === 1 && /* @__PURE__ */ x.jsx(ht, { variant: "outline", size: "sm", "data-gallery-selection-action": "open", onClick: () => E?.open(), children: "Open" }),
      A.imageCount >= 2 && /* @__PURE__ */ x.jsx(ht, { variant: "outline", size: "sm", "data-gallery-selection-action": "compare", onClick: () => E?.compare(), children: "Compare" }),
      /* @__PURE__ */ x.jsx(ht, { variant: "outline", size: "sm", "data-gallery-selection-action": "collect", onClick: (Z) => {
        Z.stopPropagation(), E?.collect(Z.currentTarget);
      }, children: "Collect" }),
      /* @__PURE__ */ x.jsxs(ht, { variant: "outline", size: "sm", "data-gallery-selection-action": "export", onClick: (Z) => {
        Z.stopPropagation(), E?.export(Z.currentTarget);
      }, children: [
        "Export ",
        /* @__PURE__ */ x.jsx(mc, { "data-icon": "inline-end" })
      ] }),
      /* @__PURE__ */ x.jsxs(oi, { modal: !1, children: [
        /* @__PURE__ */ x.jsx(ri, { render: /* @__PURE__ */ x.jsx(ht, { variant: "ghost", size: "icon-sm", "aria-label": "More selection actions", children: /* @__PURE__ */ x.jsx(bv, {}) }) }),
        /* @__PURE__ */ x.jsxs(Qr, { align: "end", className: "tw:w-48", children: [
          /* @__PURE__ */ x.jsx(Ul, { children: /* @__PURE__ */ x.jsx(tr, { onClick: () => E?.hide(), children: "Hide selected" }) }),
          /* @__PURE__ */ x.jsx(Qd, {}),
          /* @__PURE__ */ x.jsx(Ul, { children: /* @__PURE__ */ x.jsxs(tr, { variant: "destructive", onClick: () => E?.delete(), children: [
            /* @__PURE__ */ x.jsx(Nb, { "data-icon": "inline-start" }),
            " Move to Trash"
          ] }) })
        ] })
      ] }),
      /* @__PURE__ */ x.jsx(sc, { label: "Clear selection (Esc)", children: /* @__PURE__ */ x.jsx(ht, { variant: "ghost", size: "icon-sm", "aria-label": "Clear selection", "data-gallery-selection-action": "clear", onClick: () => E?.clear(), children: /* @__PURE__ */ x.jsx(di, {}) }) })
    ] });
  }
  return /* @__PURE__ */ x.jsxs("div", { className: "gallery-command-bar", role: "toolbar", "aria-label": "Gallery commands", "data-gallery-toolbar-state": "normal", children: [
    /* @__PURE__ */ x.jsxs(bb, { open: o, onOpenChange: (E) => {
      a(E), E && u(!1);
    }, children: [
      /* @__PURE__ */ x.jsx(sc, { label: f ? "Edit search" : "Search files (/)", children: /* @__PURE__ */ x.jsx(
        xb,
        {
          render: /* @__PURE__ */ x.jsx(
            ht,
            {
              variant: f ? "secondary" : "outline",
              size: "icon-sm",
              "aria-label": f ? `Search files: ${f}` : "Search files",
              "aria-pressed": o,
              children: /* @__PURE__ */ x.jsx(tp, {})
            }
          )
        }
      ) }),
      /* @__PURE__ */ x.jsxs(Sb, { align: "start", sideOffset: 6, className: "gallery-search-popover tw:gap-0 tw:p-2", children: [
        /* @__PURE__ */ x.jsx(vp, { className: "tw:sr-only", children: "Search project files" }),
        /* @__PURE__ */ x.jsx(bp, { className: "tw:sr-only", children: "Search by file name or folder" }),
        /* @__PURE__ */ x.jsxs(hp, { "data-gallery-command-group": "search", children: [
          /* @__PURE__ */ x.jsx(
            yp,
            {
              "aria-label": "Search project files",
              "data-gallery-command": "search",
              placeholder: "Search by name or folder…",
              value: f,
              onChange: (E) => G(E.target.value),
              autoFocus: !0
            }
          ),
          /* @__PURE__ */ x.jsx(Dc, { align: "inline-start", "aria-hidden": "true", children: /* @__PURE__ */ x.jsx(tp, {}) }),
          f && /* @__PURE__ */ x.jsx(Dc, { align: "inline-end", children: /* @__PURE__ */ x.jsx(qx, { size: "icon-xs", "aria-label": "Clear search", onClick: () => G(""), children: /* @__PURE__ */ x.jsx(di, {}) }) })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ x.jsxs(bb, { open: i, onOpenChange: (E) => {
      u(E), E && a(!1);
    }, children: [
      /* @__PURE__ */ x.jsx(
        xb,
        {
          render: /* @__PURE__ */ x.jsxs(ht, { variant: z ? "secondary" : "outline", size: "sm", children: [
            /* @__PURE__ */ x.jsx(aE, { "data-icon": "inline-start" }),
            /* @__PURE__ */ x.jsx("span", { "data-gallery-command": "filters", children: "Filters" })
          ] })
        }
      ),
      /* @__PURE__ */ x.jsx(Sb, { align: "start", sideOffset: 6, className: "gallery-filter-popover tw:w-[min(360px,calc(100vw-24px))] tw:gap-0 tw:p-0", children: /* @__PURE__ */ x.jsx(
        NA,
        {
          state: w,
          folder: g,
          collectionItems: b,
          workflowItems: S
        }
      ) })
    ] }),
    /* @__PURE__ */ x.jsxs(
      ht,
      {
        variant: M ? "secondary" : "outline",
        size: "sm",
        "data-gallery-command": "favorites",
        "aria-label": "Favorites",
        "aria-pressed": M,
        onClick: () => Zr("favChip"),
        children: [
          /* @__PURE__ */ x.jsx(np, { "data-icon": "inline-start", fill: M ? "currentColor" : "none" }),
          /* @__PURE__ */ x.jsx("span", { className: "gallery-fav-label", children: "Favorites" })
        ]
      }
    ),
    /* @__PURE__ */ x.jsxs(oi, { modal: !1, children: [
      /* @__PURE__ */ x.jsx(ri, { render: /* @__PURE__ */ x.jsxs(ht, { variant: "outline", size: "sm", "data-gallery-command": "collection", "data-gallery-active": H ? "true" : void 0, "aria-label": "Filter by collection", children: [
        /* @__PURE__ */ x.jsx(cE, { "data-icon": "inline-start" }),
        /* @__PURE__ */ x.jsx("span", { className: "gallery-collection-label", children: "Collection" })
      ] }) }),
      /* @__PURE__ */ x.jsx(Qr, { align: "start", className: "tw:w-52", children: /* @__PURE__ */ x.jsxs(Ul, { children: [
        /* @__PURE__ */ x.jsx(lc, { checked: !H, onClick: k, children: "All collections" }),
        b.map((E) => /* @__PURE__ */ x.jsx(lc, { checked: E.active, onClick: () => E.element.click(), children: E.label }, E.key))
      ] }) })
    ] }),
    /* @__PURE__ */ x.jsxs(oi, { modal: !1, children: [
      /* @__PURE__ */ x.jsx(ri, { render: /* @__PURE__ */ x.jsxs(ht, { variant: "outline", size: "sm", "data-gallery-command": "status", "data-gallery-active": j ? "true" : void 0, "aria-label": "Filter by status", children: [
        /* @__PURE__ */ x.jsx(nE, { "data-icon": "inline-start" }),
        /* @__PURE__ */ x.jsx("span", { className: "gallery-status-label", children: "Status" })
      ] }) }),
      /* @__PURE__ */ x.jsx(Qr, { align: "start", className: "tw:w-48", children: /* @__PURE__ */ x.jsx(Ul, { children: S.map((E) => /* @__PURE__ */ x.jsx(lc, { checked: E.active, onClick: () => E.element.click(), children: E.label }, E.key || "all")) }) })
    ] }),
    /* @__PURE__ */ x.jsxs(aS, { items: D, modal: !1, value: p?.value ?? "mtime", onValueChange: (E) => E && wp("sort", E), children: [
      /* @__PURE__ */ x.jsx(
        cS,
        {
          size: "sm",
          className: "gallery-command-select gallery-command-sort",
          "aria-label": `Sort project files: ${$d(p?.value ?? "mtime")}`,
          children: /* @__PURE__ */ x.jsx(sS, { children: (E) => $d(String(E)) })
        }
      ),
      /* @__PURE__ */ x.jsx(uS, { children: /* @__PURE__ */ x.jsx(iS, { children: D.map((E) => /* @__PURE__ */ x.jsx(fS, { value: E.value, children: E.label }, E.value)) }) })
    ] }),
    /* @__PURE__ */ x.jsx(sc, { label: L ? "Reverse sort direction" : "No reverse for this sort", children: /* @__PURE__ */ x.jsx(
      ht,
      {
        variant: "outline",
        size: "icon-sm",
        "data-gallery-command": "sort-dir",
        "aria-label": "Reverse sort direction",
        disabled: !L,
        onClick: () => L && wp("sort", L),
        children: /* @__PURE__ */ x.jsx(Z1, {})
      }
    ) }),
    /* @__PURE__ */ x.jsxs(oi, { modal: !1, children: [
      /* @__PURE__ */ x.jsx(ri, { render: /* @__PURE__ */ x.jsxs(ht, { variant: "outline", size: "sm", "aria-label": "View options", children: [
        /* @__PURE__ */ x.jsx(xv, { "data-icon": "inline-start" }),
        /* @__PURE__ */ x.jsx("span", { className: "gallery-view-label", children: "View" })
      ] }) }),
      /* @__PURE__ */ x.jsx(Qr, { align: "end", className: "tw:w-44", children: /* @__PURE__ */ x.jsxs(Ul, { children: [
        /* @__PURE__ */ x.jsx(AM, { children: "Card size" }),
        [{ key: "s", label: "Compact" }, { key: "m", label: "Standard" }, { key: "l", label: "Large" }].map((E) => /* @__PURE__ */ x.jsx(
          lc,
          {
            checked: v === E.key,
            "data-gallery-density": E.key,
            onClick: () => mt("densitySeg")?.querySelector(`[data-d="${E.key}"]`)?.click(),
            children: E.label
          },
          E.key
        ))
      ] }) })
    ] }),
    /* @__PURE__ */ x.jsxs(oi, { modal: !1, children: [
      /* @__PURE__ */ x.jsx(sc, { label: "Gallery tools", children: /* @__PURE__ */ x.jsx(ri, { render: /* @__PURE__ */ x.jsx(ht, { variant: "outline", size: "icon-sm", "aria-label": "Gallery tools", children: /* @__PURE__ */ x.jsx(bv, {}) }) }) }),
      /* @__PURE__ */ x.jsxs(Qr, { align: "end", className: "tw:w-48", children: [
        /* @__PURE__ */ x.jsxs(Ul, { children: [
          /* @__PURE__ */ x.jsxs(tr, { "data-gallery-command": "rescan", disabled: d, onClick: () => Zr("rescan"), children: [
            d ? /* @__PURE__ */ x.jsx(aA, { "data-icon": "inline-start" }) : /* @__PURE__ */ x.jsx(yE, { "data-icon": "inline-start" }),
            d ? "Rescanning…" : "Rescan project"
          ] }),
          /* @__PURE__ */ x.jsxs(tr, { onClick: () => Zr("viewChip"), children: [
            /* @__PURE__ */ x.jsx(Db, { "data-icon": "inline-start" }),
            " Gallery settings…"
          ] })
        ] }),
        /* @__PURE__ */ x.jsx(Qd, {}),
        /* @__PURE__ */ x.jsxs(Ul, { children: [
          /* @__PURE__ */ x.jsxs(tr, { onClick: () => Zr("boardChip"), children: [
            /* @__PURE__ */ x.jsx(xv, { "data-icon": "inline-start" }),
            " Board"
          ] }),
          /* @__PURE__ */ x.jsxs(tr, { onClick: () => Zr("notesChip"), children: [
            /* @__PURE__ */ x.jsx(pE, { "data-icon": "inline-start" }),
            " Notes"
          ] })
        ] }),
        C.length > 0 && /* @__PURE__ */ x.jsxs(x.Fragment, { children: [
          /* @__PURE__ */ x.jsx(Qd, {}),
          /* @__PURE__ */ x.jsx(Ul, { children: /* @__PURE__ */ x.jsxs(zM, { children: [
            /* @__PURE__ */ x.jsx(DM, { children: "Recent files" }),
            /* @__PURE__ */ x.jsx(NM, { children: /* @__PURE__ */ x.jsx(Ul, { children: C.map((E) => /* @__PURE__ */ x.jsx(tr, { onClick: () => E.element.click(), children: E.label }, E.key)) }) })
          ] }) })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ x.jsx("div", { className: "gallery-active-filters", "aria-label": "Active filters", children: T.map((E) => /* @__PURE__ */ x.jsxs(
      ht,
      {
        variant: "outline",
        size: "xs",
        className: "gallery-filter-chip",
        "data-gallery-filter-chip": E.key,
        "aria-label": `Remove filter ${E.label}`,
        onClick: () => E.remove.click(),
        children: [
          E.label,
          /* @__PURE__ */ x.jsx(di, { "data-icon": "inline-end" })
        ]
      },
      E.key
    )) })
  ] });
}
function _A() {
  const [n, o] = y.useState(null), a = y.useRef(null), i = y.useCallback((f) => {
    const p = a.current;
    p && (a.current = null, o(null), p.resolve(f));
  }, []);
  y.useEffect(() => (window.__galleryConfirm = (f, p = "Delete") => new Promise((g) => {
    a.current && a.current.resolve(!1);
    const m = { message: f, acceptLabel: p, resolve: g };
    a.current = m, o(m);
  }), () => {
    delete window.__galleryConfirm, a.current && a.current.resolve(!1), a.current = null;
  }), []);
  const u = n ? jA(n) : null;
  return /* @__PURE__ */ x.jsx(kO, { open: !!n, onOpenChange: (f) => {
    f || i(!1);
  }, children: /* @__PURE__ */ x.jsxs(UO, { children: [
    /* @__PURE__ */ x.jsxs(LO, { children: [
      u?.destructive && /* @__PURE__ */ x.jsx(PO, { variant: "destructive", children: /* @__PURE__ */ x.jsx(Nb, {}) }),
      /* @__PURE__ */ x.jsx(YO, { children: u?.title }),
      u?.description && /* @__PURE__ */ x.jsx(GO, { children: u.description })
    ] }),
    /* @__PURE__ */ x.jsxs(BO, { variant: "plain", children: [
      /* @__PURE__ */ x.jsx(XO, { variant: "ghost", onClick: () => i(!1), children: "Cancel" }),
      /* @__PURE__ */ x.jsx(
        qO,
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
function HA() {
  const [n, o] = y.useState(document.body.classList.contains("has-insp")), [a, i] = y.useState(() => window.matchMedia("(max-width: 800px)").matches), [u, f] = y.useState(mt("inspTitle")?.textContent || "Inspector"), p = y.useRef(mt("inspector")), g = y.useCallback((m) => {
    const d = mt("inspBody");
    d && m && m.appendChild(d);
  }, []);
  return y.useLayoutEffect(() => () => {
    const m = mt("inspBody");
    m && p.current && p.current.appendChild(m);
  }, []), y.useEffect(() => {
    const m = () => {
      const b = document.documentElement.classList.contains("emb");
      o(!b && document.body.classList.contains("has-insp")), f(mt("inspTitle")?.textContent || "Inspector");
    }, d = new MutationObserver(m);
    d.observe(document.body, { attributes: !0, attributeFilter: ["class"] });
    const v = mt("inspTitle");
    return v && d.observe(v, { childList: !0, characterData: !0, subtree: !0 }), m(), () => d.disconnect();
  }, []), y.useEffect(() => {
    const m = window.matchMedia("(max-width: 800px)"), d = () => i(m.matches);
    return m.addEventListener("change", d), d(), () => m.removeEventListener("change", d);
  }, []), /* @__PURE__ */ x.jsx(
    V2,
    {
      modal: a,
      open: n,
      onOpenChange: (m, d) => {
        if (!m && d.reason === "escape-key") {
          d.cancel(), d.allowPropagation();
          return;
        }
        !m && document.body.classList.contains("has-insp") && Zr("inspClose");
      },
      children: /* @__PURE__ */ x.jsxs(
        G2,
        {
          side: "right",
          layer: a ? "modal" : "panel",
          keepMounted: !0,
          showOverlay: a,
          className: "tw:gap-0 tw:p-0",
          style: { width: "300px", maxWidth: "calc(100vw - 16px)" },
          children: [
            /* @__PURE__ */ x.jsxs(q2, { className: "tw:border-b tw:border-border tw:pr-12", children: [
              /* @__PURE__ */ x.jsx(X2, { children: u }),
              /* @__PURE__ */ x.jsx(F2, { className: "tw:sr-only", children: "File metadata and gallery actions" })
            ] }),
            /* @__PURE__ */ x.jsx("div", { ref: g, className: "tw:flex tw:min-h-0 tw:flex-1 tw:flex-col" })
          ]
        }
      )
    }
  );
}
const Mb = document.getElementById("gallery-react-toolbar");
Mb && P1.createRoot(Mb).render(
  /* @__PURE__ */ x.jsxs(AA, { children: [
    /* @__PURE__ */ x.jsx(kA, {}),
    /* @__PURE__ */ x.jsx(_A, {}),
    /* @__PURE__ */ x.jsx(HA, {})
  ] })
);
