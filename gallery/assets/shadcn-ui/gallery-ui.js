function zE(n, o) {
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
function DE(n) {
  return n && n.__esModule && Object.prototype.hasOwnProperty.call(n, "default") ? n.default : n;
}
var wd = { exports: {} }, $a = {};
var av;
function NE() {
  if (av) return $a;
  av = 1;
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
  return $a.Fragment = o, $a.jsx = a, $a.jsxs = a, $a;
}
var iv;
function jE() {
  return iv || (iv = 1, wd.exports = NE()), wd.exports;
}
var x = jE(), Ed = { exports: {} }, Ge = {};
var sv;
function kE() {
  if (sv) return Ge;
  sv = 1;
  var n = /* @__PURE__ */ Symbol.for("react.transitional.element"), o = /* @__PURE__ */ Symbol.for("react.portal"), a = /* @__PURE__ */ Symbol.for("react.fragment"), i = /* @__PURE__ */ Symbol.for("react.strict_mode"), u = /* @__PURE__ */ Symbol.for("react.profiler"), f = /* @__PURE__ */ Symbol.for("react.consumer"), p = /* @__PURE__ */ Symbol.for("react.context"), g = /* @__PURE__ */ Symbol.for("react.forward_ref"), m = /* @__PURE__ */ Symbol.for("react.suspense"), d = /* @__PURE__ */ Symbol.for("react.memo"), v = /* @__PURE__ */ Symbol.for("react.lazy"), b = /* @__PURE__ */ Symbol.for("react.activity"), S = Symbol.iterator;
  function R(C) {
    return C === null || typeof C != "object" ? null : (C = S && C[S] || C["@@iterator"], typeof C == "function" ? C : null);
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
  }, M = Object.assign, E = {};
  function A(C, L, ne) {
    this.props = C, this.context = L, this.refs = E, this.updater = ne || w;
  }
  A.prototype.isReactComponent = {}, A.prototype.setState = function(C, L) {
    if (typeof C != "object" && typeof C != "function" && C != null)
      throw Error(
        "takes an object of state variables to update or a function which returns an object of state variables."
      );
    this.updater.enqueueSetState(this, C, L, "setState");
  }, A.prototype.forceUpdate = function(C) {
    this.updater.enqueueForceUpdate(this, C, "forceUpdate");
  };
  function O() {
  }
  O.prototype = A.prototype;
  function z(C, L, ne) {
    this.props = C, this.context = L, this.refs = E, this.updater = ne || w;
  }
  var D = z.prototype = new O();
  D.constructor = z, M(D, A.prototype), D.isPureReactComponent = !0;
  var j = Array.isArray;
  function N() {
  }
  var U = { H: null, A: null, T: null, S: null }, _ = Object.prototype.hasOwnProperty;
  function G(C, L, ne) {
    var J = ne.ref;
    return {
      $$typeof: n,
      type: C,
      key: L,
      ref: J !== void 0 ? J : null,
      props: ne
    };
  }
  function k(C, L) {
    return G(C.type, L, C.props);
  }
  function ee(C) {
    return typeof C == "object" && C !== null && C.$$typeof === n;
  }
  function Q(C) {
    var L = { "=": "=0", ":": "=2" };
    return "$" + C.replace(/[=:]/g, function(ne) {
      return L[ne];
    });
  }
  var X = /\/+/g;
  function Z(C, L) {
    return typeof C == "object" && C !== null && C.key != null ? Q("" + C.key) : L.toString(36);
  }
  function q(C) {
    switch (C.status) {
      case "fulfilled":
        return C.value;
      case "rejected":
        throw C.reason;
      default:
        switch (typeof C.status == "string" ? C.then(N, N) : (C.status = "pending", C.then(
          function(L) {
            C.status === "pending" && (C.status = "fulfilled", C.value = L);
          },
          function(L) {
            C.status === "pending" && (C.status = "rejected", C.reason = L);
          }
        )), C.status) {
          case "fulfilled":
            return C.value;
          case "rejected":
            throw C.reason;
        }
    }
    throw C;
  }
  function H(C, L, ne, J, re) {
    var ie = typeof C;
    (ie === "undefined" || ie === "boolean") && (C = null);
    var oe = !1;
    if (C === null) oe = !0;
    else
      switch (ie) {
        case "bigint":
        case "string":
        case "number":
          oe = !0;
          break;
        case "object":
          switch (C.$$typeof) {
            case n:
            case o:
              oe = !0;
              break;
            case v:
              return oe = C._init, H(
                oe(C._payload),
                L,
                ne,
                J,
                re
              );
          }
      }
    if (oe)
      return re = re(C), oe = J === "" ? "." + Z(C, 0) : J, j(re) ? (ne = "", oe != null && (ne = oe.replace(X, "$&/") + "/"), H(re, L, ne, "", function(je) {
        return je;
      })) : re != null && (ee(re) && (re = k(
        re,
        ne + (re.key == null || C && C.key === re.key ? "" : ("" + re.key).replace(
          X,
          "$&/"
        ) + "/") + oe
      )), L.push(re)), 1;
    oe = 0;
    var se = J === "" ? "." : J + ":";
    if (j(C))
      for (var ge = 0; ge < C.length; ge++)
        J = C[ge], ie = se + Z(J, ge), oe += H(
          J,
          L,
          ne,
          ie,
          re
        );
    else if (ge = R(C), typeof ge == "function")
      for (C = ge.call(C), ge = 0; !(J = C.next()).done; )
        J = J.value, ie = se + Z(J, ge++), oe += H(
          J,
          L,
          ne,
          ie,
          re
        );
    else if (ie === "object") {
      if (typeof C.then == "function")
        return H(
          q(C),
          L,
          ne,
          J,
          re
        );
      throw L = String(C), Error(
        "Objects are not valid as a React child (found: " + (L === "[object Object]" ? "object with keys {" + Object.keys(C).join(", ") + "}" : L) + "). If you meant to render a collection of children, use an array instead."
      );
    }
    return oe;
  }
  function Y(C, L, ne) {
    if (C == null) return C;
    var J = [], re = 0;
    return H(C, J, "", "", function(ie) {
      return L.call(ne, ie, re++);
    }), J;
  }
  function V(C) {
    if (C._status === -1) {
      var L = C._result;
      L = L(), L.then(
        function(ne) {
          (C._status === 0 || C._status === -1) && (C._status = 1, C._result = ne);
        },
        function(ne) {
          (C._status === 0 || C._status === -1) && (C._status = 2, C._result = ne);
        }
      ), C._status === -1 && (C._status = 0, C._result = L);
    }
    if (C._status === 1) return C._result.default;
    throw C._result;
  }
  var K = typeof reportError == "function" ? reportError : function(C) {
    if (typeof window == "object" && typeof window.ErrorEvent == "function") {
      var L = new window.ErrorEvent("error", {
        bubbles: !0,
        cancelable: !0,
        message: typeof C == "object" && C !== null && typeof C.message == "string" ? String(C.message) : String(C),
        error: C
      });
      if (!window.dispatchEvent(L)) return;
    } else if (typeof process == "object" && typeof process.emit == "function") {
      process.emit("uncaughtException", C);
      return;
    }
    console.error(C);
  }, B = {
    map: Y,
    forEach: function(C, L, ne) {
      Y(
        C,
        function() {
          L.apply(this, arguments);
        },
        ne
      );
    },
    count: function(C) {
      var L = 0;
      return Y(C, function() {
        L++;
      }), L;
    },
    toArray: function(C) {
      return Y(C, function(L) {
        return L;
      }) || [];
    },
    only: function(C) {
      if (!ee(C))
        throw Error(
          "React.Children.only expected to receive a single React element child."
        );
      return C;
    }
  };
  return Ge.Activity = b, Ge.Children = B, Ge.Component = A, Ge.Fragment = a, Ge.Profiler = u, Ge.PureComponent = z, Ge.StrictMode = i, Ge.Suspense = m, Ge.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = U, Ge.__COMPILER_RUNTIME = {
    __proto__: null,
    c: function(C) {
      return U.H.useMemoCache(C);
    }
  }, Ge.cache = function(C) {
    return function() {
      return C.apply(null, arguments);
    };
  }, Ge.cacheSignal = function() {
    return null;
  }, Ge.cloneElement = function(C, L, ne) {
    if (C == null)
      throw Error(
        "The argument must be a React element, but you passed " + C + "."
      );
    var J = M({}, C.props), re = C.key;
    if (L != null)
      for (ie in L.key !== void 0 && (re = "" + L.key), L)
        !_.call(L, ie) || ie === "key" || ie === "__self" || ie === "__source" || ie === "ref" && L.ref === void 0 || (J[ie] = L[ie]);
    var ie = arguments.length - 2;
    if (ie === 1) J.children = ne;
    else if (1 < ie) {
      for (var oe = Array(ie), se = 0; se < ie; se++)
        oe[se] = arguments[se + 2];
      J.children = oe;
    }
    return G(C.type, re, J);
  }, Ge.createContext = function(C) {
    return C = {
      $$typeof: p,
      _currentValue: C,
      _currentValue2: C,
      _threadCount: 0,
      Provider: null,
      Consumer: null
    }, C.Provider = C, C.Consumer = {
      $$typeof: f,
      _context: C
    }, C;
  }, Ge.createElement = function(C, L, ne) {
    var J, re = {}, ie = null;
    if (L != null)
      for (J in L.key !== void 0 && (ie = "" + L.key), L)
        _.call(L, J) && J !== "key" && J !== "__self" && J !== "__source" && (re[J] = L[J]);
    var oe = arguments.length - 2;
    if (oe === 1) re.children = ne;
    else if (1 < oe) {
      for (var se = Array(oe), ge = 0; ge < oe; ge++)
        se[ge] = arguments[ge + 2];
      re.children = se;
    }
    if (C && C.defaultProps)
      for (J in oe = C.defaultProps, oe)
        re[J] === void 0 && (re[J] = oe[J]);
    return G(C, ie, re);
  }, Ge.createRef = function() {
    return { current: null };
  }, Ge.forwardRef = function(C) {
    return { $$typeof: g, render: C };
  }, Ge.isValidElement = ee, Ge.lazy = function(C) {
    return {
      $$typeof: v,
      _payload: { _status: -1, _result: C },
      _init: V
    };
  }, Ge.memo = function(C, L) {
    return {
      $$typeof: d,
      type: C,
      compare: L === void 0 ? null : L
    };
  }, Ge.startTransition = function(C) {
    var L = U.T, ne = {};
    U.T = ne;
    try {
      var J = C(), re = U.S;
      re !== null && re(ne, J), typeof J == "object" && J !== null && typeof J.then == "function" && J.then(N, K);
    } catch (ie) {
      K(ie);
    } finally {
      L !== null && ne.types !== null && (L.types = ne.types), U.T = L;
    }
  }, Ge.unstable_useCacheRefresh = function() {
    return U.H.useCacheRefresh();
  }, Ge.use = function(C) {
    return U.H.use(C);
  }, Ge.useActionState = function(C, L, ne) {
    return U.H.useActionState(C, L, ne);
  }, Ge.useCallback = function(C, L) {
    return U.H.useCallback(C, L);
  }, Ge.useContext = function(C) {
    return U.H.useContext(C);
  }, Ge.useDebugValue = function() {
  }, Ge.useDeferredValue = function(C, L) {
    return U.H.useDeferredValue(C, L);
  }, Ge.useEffect = function(C, L) {
    return U.H.useEffect(C, L);
  }, Ge.useEffectEvent = function(C) {
    return U.H.useEffectEvent(C);
  }, Ge.useId = function() {
    return U.H.useId();
  }, Ge.useImperativeHandle = function(C, L, ne) {
    return U.H.useImperativeHandle(C, L, ne);
  }, Ge.useInsertionEffect = function(C, L) {
    return U.H.useInsertionEffect(C, L);
  }, Ge.useLayoutEffect = function(C, L) {
    return U.H.useLayoutEffect(C, L);
  }, Ge.useMemo = function(C, L) {
    return U.H.useMemo(C, L);
  }, Ge.useOptimistic = function(C, L) {
    return U.H.useOptimistic(C, L);
  }, Ge.useReducer = function(C, L, ne) {
    return U.H.useReducer(C, L, ne);
  }, Ge.useRef = function(C) {
    return U.H.useRef(C);
  }, Ge.useState = function(C) {
    return U.H.useState(C);
  }, Ge.useSyncExternalStore = function(C, L, ne) {
    return U.H.useSyncExternalStore(
      C,
      L,
      ne
    );
  }, Ge.useTransition = function() {
    return U.H.useTransition();
  }, Ge.version = "19.2.7", Ge;
}
var cv;
function xi() {
  return cv || (cv = 1, Ed.exports = kE()), Ed.exports;
}
var y = xi();
const $d = /* @__PURE__ */ DE(y), _E = /* @__PURE__ */ zE({
  __proto__: null,
  default: $d
}, [y]);
var Td = { exports: {} }, Wa = {}, Rd = { exports: {} }, Cd = {};
var uv;
function HE() {
  return uv || (uv = 1, (function(n) {
    function o(H, Y) {
      var V = H.length;
      H.push(Y);
      e: for (; 0 < V; ) {
        var K = V - 1 >>> 1, B = H[K];
        if (0 < u(B, Y))
          H[K] = Y, H[V] = B, V = K;
        else break e;
      }
    }
    function a(H) {
      return H.length === 0 ? null : H[0];
    }
    function i(H) {
      if (H.length === 0) return null;
      var Y = H[0], V = H.pop();
      if (V !== Y) {
        H[0] = V;
        e: for (var K = 0, B = H.length, C = B >>> 1; K < C; ) {
          var L = 2 * (K + 1) - 1, ne = H[L], J = L + 1, re = H[J];
          if (0 > u(ne, V))
            J < B && 0 > u(re, ne) ? (H[K] = re, H[J] = V, K = J) : (H[K] = ne, H[L] = V, K = L);
          else if (J < B && 0 > u(re, V))
            H[K] = re, H[J] = V, K = J;
          else break e;
        }
      }
      return Y;
    }
    function u(H, Y) {
      var V = H.sortIndex - Y.sortIndex;
      return V !== 0 ? V : H.id - Y.id;
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
    var m = [], d = [], v = 1, b = null, S = 3, R = !1, w = !1, M = !1, E = !1, A = typeof setTimeout == "function" ? setTimeout : null, O = typeof clearTimeout == "function" ? clearTimeout : null, z = typeof setImmediate < "u" ? setImmediate : null;
    function D(H) {
      for (var Y = a(d); Y !== null; ) {
        if (Y.callback === null) i(d);
        else if (Y.startTime <= H)
          i(d), Y.sortIndex = Y.expirationTime, o(m, Y);
        else break;
        Y = a(d);
      }
    }
    function j(H) {
      if (M = !1, D(H), !w)
        if (a(m) !== null)
          w = !0, N || (N = !0, Q());
        else {
          var Y = a(d);
          Y !== null && q(j, Y.startTime - H);
        }
    }
    var N = !1, U = -1, _ = 5, G = -1;
    function k() {
      return E ? !0 : !(n.unstable_now() - G < _);
    }
    function ee() {
      if (E = !1, N) {
        var H = n.unstable_now();
        G = H;
        var Y = !0;
        try {
          e: {
            w = !1, M && (M = !1, O(U), U = -1), R = !0;
            var V = S;
            try {
              t: {
                for (D(H), b = a(m); b !== null && !(b.expirationTime > H && k()); ) {
                  var K = b.callback;
                  if (typeof K == "function") {
                    b.callback = null, S = b.priorityLevel;
                    var B = K(
                      b.expirationTime <= H
                    );
                    if (H = n.unstable_now(), typeof B == "function") {
                      b.callback = B, D(H), Y = !0;
                      break t;
                    }
                    b === a(m) && i(m), D(H);
                  } else i(m);
                  b = a(m);
                }
                if (b !== null) Y = !0;
                else {
                  var C = a(d);
                  C !== null && q(
                    j,
                    C.startTime - H
                  ), Y = !1;
                }
              }
              break e;
            } finally {
              b = null, S = V, R = !1;
            }
            Y = void 0;
          }
        } finally {
          Y ? Q() : N = !1;
        }
      }
    }
    var Q;
    if (typeof z == "function")
      Q = function() {
        z(ee);
      };
    else if (typeof MessageChannel < "u") {
      var X = new MessageChannel(), Z = X.port2;
      X.port1.onmessage = ee, Q = function() {
        Z.postMessage(null);
      };
    } else
      Q = function() {
        A(ee, 0);
      };
    function q(H, Y) {
      U = A(function() {
        H(n.unstable_now());
      }, Y);
    }
    n.unstable_IdlePriority = 5, n.unstable_ImmediatePriority = 1, n.unstable_LowPriority = 4, n.unstable_NormalPriority = 3, n.unstable_Profiling = null, n.unstable_UserBlockingPriority = 2, n.unstable_cancelCallback = function(H) {
      H.callback = null;
    }, n.unstable_forceFrameRate = function(H) {
      0 > H || 125 < H ? console.error(
        "forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported"
      ) : _ = 0 < H ? Math.floor(1e3 / H) : 5;
    }, n.unstable_getCurrentPriorityLevel = function() {
      return S;
    }, n.unstable_next = function(H) {
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
        return H();
      } finally {
        S = V;
      }
    }, n.unstable_requestPaint = function() {
      E = !0;
    }, n.unstable_runWithPriority = function(H, Y) {
      switch (H) {
        case 1:
        case 2:
        case 3:
        case 4:
        case 5:
          break;
        default:
          H = 3;
      }
      var V = S;
      S = H;
      try {
        return Y();
      } finally {
        S = V;
      }
    }, n.unstable_scheduleCallback = function(H, Y, V) {
      var K = n.unstable_now();
      switch (typeof V == "object" && V !== null ? (V = V.delay, V = typeof V == "number" && 0 < V ? K + V : K) : V = K, H) {
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
      return B = V + B, H = {
        id: v++,
        callback: Y,
        priorityLevel: H,
        startTime: V,
        expirationTime: B,
        sortIndex: -1
      }, V > K ? (H.sortIndex = V, o(d, H), a(m) === null && H === a(d) && (M ? (O(U), U = -1) : M = !0, q(j, V - K))) : (H.sortIndex = B, o(m, H), w || R || (w = !0, N || (N = !0, Q()))), H;
    }, n.unstable_shouldYield = k, n.unstable_wrapCallback = function(H) {
      var Y = S;
      return function() {
        var V = S;
        S = Y;
        try {
          return H.apply(this, arguments);
        } finally {
          S = V;
        }
      };
    };
  })(Cd)), Cd;
}
var fv;
function UE() {
  return fv || (fv = 1, Rd.exports = HE()), Rd.exports;
}
var Od = { exports: {} }, hn = {};
var dv;
function LE() {
  if (dv) return hn;
  dv = 1;
  var n = xi();
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
      var v = d.as, b = g(v, d.crossOrigin), S = typeof d.integrity == "string" ? d.integrity : void 0, R = typeof d.fetchPriority == "string" ? d.fetchPriority : void 0;
      v === "style" ? i.d.S(
        m,
        typeof d.precedence == "string" ? d.precedence : void 0,
        {
          crossOrigin: b,
          integrity: S,
          fetchPriority: R
        }
      ) : v === "script" && i.d.X(m, {
        crossOrigin: b,
        integrity: S,
        fetchPriority: R,
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
var pv;
function Ob() {
  if (pv) return Od.exports;
  pv = 1;
  function n() {
    if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function"))
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(n);
      } catch (o) {
        console.error(o);
      }
  }
  return n(), Od.exports = LE(), Od.exports;
}
var gv;
function IE() {
  if (gv) return Wa;
  gv = 1;
  var n = UE(), o = xi(), a = Ob();
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
        for (var h = !1, T = s.child; T; ) {
          if (T === l) {
            h = !0, l = s, r = c;
            break;
          }
          if (T === r) {
            h = !0, r = s, l = c;
            break;
          }
          T = T.sibling;
        }
        if (!h) {
          for (T = c.child; T; ) {
            if (T === l) {
              h = !0, l = c, r = s;
              break;
            }
            if (T === r) {
              h = !0, r = c, l = s;
              break;
            }
            T = T.sibling;
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
  var b = Object.assign, S = /* @__PURE__ */ Symbol.for("react.element"), R = /* @__PURE__ */ Symbol.for("react.transitional.element"), w = /* @__PURE__ */ Symbol.for("react.portal"), M = /* @__PURE__ */ Symbol.for("react.fragment"), E = /* @__PURE__ */ Symbol.for("react.strict_mode"), A = /* @__PURE__ */ Symbol.for("react.profiler"), O = /* @__PURE__ */ Symbol.for("react.consumer"), z = /* @__PURE__ */ Symbol.for("react.context"), D = /* @__PURE__ */ Symbol.for("react.forward_ref"), j = /* @__PURE__ */ Symbol.for("react.suspense"), N = /* @__PURE__ */ Symbol.for("react.suspense_list"), U = /* @__PURE__ */ Symbol.for("react.memo"), _ = /* @__PURE__ */ Symbol.for("react.lazy"), G = /* @__PURE__ */ Symbol.for("react.activity"), k = /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel"), ee = Symbol.iterator;
  function Q(e) {
    return e === null || typeof e != "object" ? null : (e = ee && e[ee] || e["@@iterator"], typeof e == "function" ? e : null);
  }
  var X = /* @__PURE__ */ Symbol.for("react.client.reference");
  function Z(e) {
    if (e == null) return null;
    if (typeof e == "function")
      return e.$$typeof === X ? null : e.displayName || e.name || null;
    if (typeof e == "string") return e;
    switch (e) {
      case M:
        return "Fragment";
      case A:
        return "Profiler";
      case E:
        return "StrictMode";
      case j:
        return "Suspense";
      case N:
        return "SuspenseList";
      case G:
        return "Activity";
    }
    if (typeof e == "object")
      switch (e.$$typeof) {
        case w:
          return "Portal";
        case z:
          return e.displayName || "Context";
        case O:
          return (e._context.displayName || "Context") + ".Consumer";
        case D:
          var t = e.render;
          return e = e.displayName, e || (e = t.displayName || t.name || "", e = e !== "" ? "ForwardRef(" + e + ")" : "ForwardRef"), e;
        case U:
          return t = e.displayName || null, t !== null ? t : Z(e.type) || "Memo";
        case _:
          t = e._payload, e = e._init;
          try {
            return Z(e(t));
          } catch {
          }
      }
    return null;
  }
  var q = Array.isArray, H = o.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, Y = a.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, V = {
    pending: !1,
    data: null,
    method: null,
    action: null
  }, K = [], B = -1;
  function C(e) {
    return { current: e };
  }
  function L(e) {
    0 > B || (e.current = K[B], K[B] = null, B--);
  }
  function ne(e, t) {
    B++, K[B] = e.current, e.current = t;
  }
  var J = C(null), re = C(null), ie = C(null), oe = C(null);
  function se(e, t) {
    switch (ne(ie, t), ne(re, e), ne(J, null), t.nodeType) {
      case 9:
      case 11:
        e = (e = t.documentElement) && (e = e.namespaceURI) ? Ay(e) : 0;
        break;
      default:
        if (e = t.tagName, t = t.namespaceURI)
          t = Ay(t), e = zy(t, e);
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
    L(J), ne(J, e);
  }
  function ge() {
    L(J), L(re), L(ie);
  }
  function je(e) {
    e.memoizedState !== null && ne(oe, e);
    var t = J.current, l = zy(t, e.type);
    t !== l && (ne(re, e), ne(J, l));
  }
  function Ee(e) {
    re.current === e && (L(J), L(re)), oe.current === e && (L(oe), Ka._currentValue = V);
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
      var c = r.DetermineComponentFrameRoot(), h = c[0], T = c[1];
      if (h && T) {
        var I = h.split(`
`), W = T.split(`
`);
        for (s = r = 0; r < I.length && !I[r].includes("DetermineComponentFrameRoot"); )
          r++;
        for (; s < W.length && !W[s].includes(
          "DetermineComponentFrameRoot"
        ); )
          s++;
        if (r === I.length || s === W.length)
          for (r = I.length - 1, s = W.length - 1; 1 <= r && 0 <= s && I[r] !== W[s]; )
            s--;
        for (; 1 <= r && 0 <= s; r--, s--)
          if (I[r] !== W[s]) {
            if (r !== 1 || s !== 1)
              do
                if (r--, s--, 0 > s || I[r] !== W[s]) {
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
  var mt = Math.clz32 ? Math.clz32 : Qe, Mn = Math.log, An = Math.LN2;
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
    var T = r & 134217727;
    return T !== 0 ? (r = T & ~c, r !== 0 ? s = Ut(r) : (h &= T, h !== 0 ? s = Ut(h) : l || (l = T & ~e, l !== 0 && (s = Ut(l))))) : (T = r & ~c, T !== 0 ? s = Ut(T) : h !== 0 ? s = Ut(h) : l || (l = r & ~e, l !== 0 && (s = Ut(l)))), s === 0 ? 0 : t !== 0 && t !== s && (t & c) === 0 && (c = s & -s, l = t & -t, c >= l || c === 32 && (l & 4194048) !== 0) ? t : s;
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
    var T = e.entanglements, I = e.expirationTimes, W = e.hiddenUpdates;
    for (l = h & ~l; 0 < l; ) {
      var ce = 31 - mt(l), de = 1 << ce;
      T[ce] = 0, I[ce] = -1;
      var te = W[ce];
      if (te !== null)
        for (W[ce] = null, ce = 0; ce < te.length; ce++) {
          var le = te[ce];
          le !== null && (le.lane &= -536870913);
        }
      l &= ~de;
    }
    r !== 0 && hl(e, r, 0), c !== 0 && s === 0 && e.tag !== 0 && (e.suspendedLanes |= c & ~(h & ~t));
  }
  function hl(e, t, l) {
    e.pendingLanes |= t, e.suspendedLanes &= ~t;
    var r = 31 - mt(t);
    e.entangledLanes |= t, e.entanglements[r] = e.entanglements[r] | 1073741824 | l & 261930;
  }
  function tl(e, t) {
    var l = e.entangledLanes |= t;
    for (e = e.entanglements; l; ) {
      var r = 31 - mt(l), s = 1 << r;
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
  function xt(e) {
    return e &= -e, 2 < e ? 8 < e ? (e & 134217727) !== 0 ? 32 : 268435456 : 8 : 2;
  }
  function Xt() {
    var e = Y.p;
    return e !== 0 ? e : (e = window.event, e === void 0 ? 32 : Wy(e.type));
  }
  function nn(e, t) {
    var l = Y.p;
    try {
      return Y.p = e, t();
    } finally {
      Y.p = l;
    }
  }
  var Wt = Math.random().toString(36).slice(2), Ct = "__reactFiber$" + Wt, cn = "__reactProps$" + Wt, rl = "__reactContainer$" + Wt, sa = "__reactEvents$" + Wt, Ai = "__reactListeners$" + Wt, xS = "__reactHandles$" + Wt, hg = "__reactResources$" + Wt, ca = "__reactMarker$" + Wt;
  function pu(e) {
    delete e[Ct], delete e[cn], delete e[sa], delete e[Ai], delete e[xS];
  }
  function dr(e) {
    var t = e[Ct];
    if (t) return t;
    for (var l = e.parentNode; l; ) {
      if (t = l[rl] || l[Ct]) {
        if (l = t.alternate, t.child !== null || l !== null && l.child !== null)
          for (e = Uy(e); e !== null; ) {
            if (l = e[Ct]) return l;
            e = Uy(e);
          }
        return t;
      }
      e = l, l = e.parentNode;
    }
    return null;
  }
  function pr(e) {
    if (e = e[Ct] || e[rl]) {
      var t = e.tag;
      if (t === 5 || t === 6 || t === 13 || t === 31 || t === 26 || t === 27 || t === 3)
        return e;
    }
    return null;
  }
  function ua(e) {
    var t = e.tag;
    if (t === 5 || t === 26 || t === 27 || t === 6) return e.stateNode;
    throw Error(i(33));
  }
  function gr(e) {
    var t = e[hg];
    return t || (t = e[hg] = { hoistableStyles: /* @__PURE__ */ new Map(), hoistableScripts: /* @__PURE__ */ new Map() }), t;
  }
  function ln(e) {
    e[ca] = !0;
  }
  var yg = /* @__PURE__ */ new Set(), vg = {};
  function _o(e, t) {
    mr(e, t), mr(e + "Capture", t);
  }
  function mr(e, t) {
    for (vg[e] = t, e = 0; e < t.length; e++)
      yg.add(t[e]);
  }
  var SS = RegExp(
    "^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"
  ), bg = {}, xg = {};
  function wS(e) {
    return he.call(xg, e) ? !0 : he.call(bg, e) ? !1 : SS.test(e) ? xg[e] = !0 : (bg[e] = !0, !1);
  }
  function zi(e, t, l) {
    if (wS(t))
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
  function Di(e, t, l) {
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
  function Sg(e) {
    var t = e.type;
    return (e = e.nodeName) && e.toLowerCase() === "input" && (t === "checkbox" || t === "radio");
  }
  function ES(e, t, l) {
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
  function gu(e) {
    if (!e._valueTracker) {
      var t = Sg(e) ? "checked" : "value";
      e._valueTracker = ES(
        e,
        t,
        "" + e[t]
      );
    }
  }
  function wg(e) {
    if (!e) return !1;
    var t = e._valueTracker;
    if (!t) return !0;
    var l = t.getValue(), r = "";
    return e && (r = Sg(e) ? e.checked ? "true" : "false" : e.value), e = r, e !== l ? (t.setValue(e), !0) : !1;
  }
  function Ni(e) {
    if (e = e || (typeof document < "u" ? document : void 0), typeof e > "u") return null;
    try {
      return e.activeElement || e.body;
    } catch {
      return e.body;
    }
  }
  var TS = /[\n"\\]/g;
  function Gn(e) {
    return e.replace(
      TS,
      function(t) {
        return "\\" + t.charCodeAt(0).toString(16) + " ";
      }
    );
  }
  function mu(e, t, l, r, s, c, h, T) {
    e.name = "", h != null && typeof h != "function" && typeof h != "symbol" && typeof h != "boolean" ? e.type = h : e.removeAttribute("type"), t != null ? h === "number" ? (t === 0 && e.value === "" || e.value != t) && (e.value = "" + Yn(t)) : e.value !== "" + Yn(t) && (e.value = "" + Yn(t)) : h !== "submit" && h !== "reset" || e.removeAttribute("value"), t != null ? hu(e, h, Yn(t)) : l != null ? hu(e, h, Yn(l)) : r != null && e.removeAttribute("value"), s == null && c != null && (e.defaultChecked = !!c), s != null && (e.checked = s && typeof s != "function" && typeof s != "symbol"), T != null && typeof T != "function" && typeof T != "symbol" && typeof T != "boolean" ? e.name = "" + Yn(T) : e.removeAttribute("name");
  }
  function Eg(e, t, l, r, s, c, h, T) {
    if (c != null && typeof c != "function" && typeof c != "symbol" && typeof c != "boolean" && (e.type = c), t != null || l != null) {
      if (!(c !== "submit" && c !== "reset" || t != null)) {
        gu(e);
        return;
      }
      l = l != null ? "" + Yn(l) : "", t = t != null ? "" + Yn(t) : l, T || t === e.value || (e.value = t), e.defaultValue = t;
    }
    r = r ?? s, r = typeof r != "function" && typeof r != "symbol" && !!r, e.checked = T ? e.checked : !!r, e.defaultChecked = !!r, h != null && typeof h != "function" && typeof h != "symbol" && typeof h != "boolean" && (e.name = h), gu(e);
  }
  function hu(e, t, l) {
    t === "number" && Ni(e.ownerDocument) === e || e.defaultValue === "" + l || (e.defaultValue = "" + l);
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
  function Tg(e, t, l) {
    if (t != null && (t = "" + Yn(t), t !== e.value && (e.value = t), l == null)) {
      e.defaultValue !== t && (e.defaultValue = t);
      return;
    }
    e.defaultValue = l != null ? "" + Yn(l) : "";
  }
  function Rg(e, t, l, r) {
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
    l = Yn(t), e.defaultValue = l, r = e.textContent, r === l && r !== "" && r !== null && (e.value = r), gu(e);
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
  var RS = new Set(
    "animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(
      " "
    )
  );
  function Cg(e, t, l) {
    var r = t.indexOf("--") === 0;
    l == null || typeof l == "boolean" || l === "" ? r ? e.setProperty(t, "") : t === "float" ? e.cssFloat = "" : e[t] = "" : r ? e.setProperty(t, l) : typeof l != "number" || l === 0 || RS.has(t) ? t === "float" ? e.cssFloat = l : e[t] = ("" + l).trim() : e[t] = l + "px";
  }
  function Og(e, t, l) {
    if (t != null && typeof t != "object")
      throw Error(i(62));
    if (e = e.style, l != null) {
      for (var r in l)
        !l.hasOwnProperty(r) || t != null && t.hasOwnProperty(r) || (r.indexOf("--") === 0 ? e.setProperty(r, "") : r === "float" ? e.cssFloat = "" : e[r] = "");
      for (var s in t)
        r = t[s], t.hasOwnProperty(s) && l[s] !== r && Cg(e, s, r);
    } else
      for (var c in t)
        t.hasOwnProperty(c) && Cg(e, c, t[c]);
  }
  function yu(e) {
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
  var CS = /* @__PURE__ */ new Map([
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
  ]), OS = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
  function ji(e) {
    return OS.test("" + e) ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')" : e;
  }
  function bl() {
  }
  var vu = null;
  function bu(e) {
    return e = e.target || e.srcElement || window, e.correspondingUseElement && (e = e.correspondingUseElement), e.nodeType === 3 ? e.parentNode : e;
  }
  var vr = null, br = null;
  function Mg(e) {
    var t = pr(e);
    if (t && (e = t.stateNode)) {
      var l = e[cn] || null;
      e: switch (e = t.stateNode, t.type) {
        case "input":
          if (mu(
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
                mu(
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
              r = l[t], r.form === e.form && wg(r);
          }
          break e;
        case "textarea":
          Tg(e, l.value, l.defaultValue);
          break e;
        case "select":
          t = l.value, t != null && hr(e, !!l.multiple, t, !1);
      }
    }
  }
  var xu = !1;
  function Ag(e, t, l) {
    if (xu) return e(t, l);
    xu = !0;
    try {
      var r = e(t);
      return r;
    } finally {
      if (xu = !1, (vr !== null || br !== null) && (xs(), vr && (t = vr, e = br, br = vr = null, Mg(t), e)))
        for (t = 0; t < e.length; t++) Mg(e[t]);
    }
  }
  function fa(e, t) {
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
  var xl = !(typeof window > "u" || typeof window.document > "u" || typeof window.document.createElement > "u"), Su = !1;
  if (xl)
    try {
      var da = {};
      Object.defineProperty(da, "passive", {
        get: function() {
          Su = !0;
        }
      }), window.addEventListener("test", da, da), window.removeEventListener("test", da, da);
    } catch {
      Su = !1;
    }
  var Jl = null, wu = null, ki = null;
  function zg() {
    if (ki) return ki;
    var e, t = wu, l = t.length, r, s = "value" in Jl ? Jl.value : Jl.textContent, c = s.length;
    for (e = 0; e < l && t[e] === s[e]; e++) ;
    var h = l - e;
    for (r = 1; r <= h && t[l - r] === s[c - r]; r++) ;
    return ki = s.slice(e, 1 < r ? 1 - r : void 0);
  }
  function _i(e) {
    var t = e.keyCode;
    return "charCode" in e ? (e = e.charCode, e === 0 && t === 13 && (e = 13)) : e = t, e === 10 && (e = 13), 32 <= e || e === 13 ? e : 0;
  }
  function Hi() {
    return !0;
  }
  function Dg() {
    return !1;
  }
  function wn(e) {
    function t(l, r, s, c, h) {
      this._reactName = l, this._targetInst = s, this.type = r, this.nativeEvent = c, this.target = h, this.currentTarget = null;
      for (var T in e)
        e.hasOwnProperty(T) && (l = e[T], this[T] = l ? l(c) : c[T]);
      return this.isDefaultPrevented = (c.defaultPrevented != null ? c.defaultPrevented : c.returnValue === !1) ? Hi : Dg, this.isPropagationStopped = Dg, this;
    }
    return b(t.prototype, {
      preventDefault: function() {
        this.defaultPrevented = !0;
        var l = this.nativeEvent;
        l && (l.preventDefault ? l.preventDefault() : typeof l.returnValue != "unknown" && (l.returnValue = !1), this.isDefaultPrevented = Hi);
      },
      stopPropagation: function() {
        var l = this.nativeEvent;
        l && (l.stopPropagation ? l.stopPropagation() : typeof l.cancelBubble != "unknown" && (l.cancelBubble = !0), this.isPropagationStopped = Hi);
      },
      persist: function() {
      },
      isPersistent: Hi
    }), t;
  }
  var Ho = {
    eventPhase: 0,
    bubbles: 0,
    cancelable: 0,
    timeStamp: function(e) {
      return e.timeStamp || Date.now();
    },
    defaultPrevented: 0,
    isTrusted: 0
  }, Ui = wn(Ho), pa = b({}, Ho, { view: 0, detail: 0 }), MS = wn(pa), Eu, Tu, ga, Li = b({}, pa, {
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
    getModifierState: Cu,
    button: 0,
    buttons: 0,
    relatedTarget: function(e) {
      return e.relatedTarget === void 0 ? e.fromElement === e.srcElement ? e.toElement : e.fromElement : e.relatedTarget;
    },
    movementX: function(e) {
      return "movementX" in e ? e.movementX : (e !== ga && (ga && e.type === "mousemove" ? (Eu = e.screenX - ga.screenX, Tu = e.screenY - ga.screenY) : Tu = Eu = 0, ga = e), Eu);
    },
    movementY: function(e) {
      return "movementY" in e ? e.movementY : Tu;
    }
  }), Ng = wn(Li), AS = b({}, Li, { dataTransfer: 0 }), zS = wn(AS), DS = b({}, pa, { relatedTarget: 0 }), Ru = wn(DS), NS = b({}, Ho, {
    animationName: 0,
    elapsedTime: 0,
    pseudoElement: 0
  }), jS = wn(NS), kS = b({}, Ho, {
    clipboardData: function(e) {
      return "clipboardData" in e ? e.clipboardData : window.clipboardData;
    }
  }), _S = wn(kS), HS = b({}, Ho, { data: 0 }), jg = wn(HS), US = {
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
  }, LS = {
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
  }, IS = {
    Alt: "altKey",
    Control: "ctrlKey",
    Meta: "metaKey",
    Shift: "shiftKey"
  };
  function BS(e) {
    var t = this.nativeEvent;
    return t.getModifierState ? t.getModifierState(e) : (e = IS[e]) ? !!t[e] : !1;
  }
  function Cu() {
    return BS;
  }
  var VS = b({}, pa, {
    key: function(e) {
      if (e.key) {
        var t = US[e.key] || e.key;
        if (t !== "Unidentified") return t;
      }
      return e.type === "keypress" ? (e = _i(e), e === 13 ? "Enter" : String.fromCharCode(e)) : e.type === "keydown" || e.type === "keyup" ? LS[e.keyCode] || "Unidentified" : "";
    },
    code: 0,
    location: 0,
    ctrlKey: 0,
    shiftKey: 0,
    altKey: 0,
    metaKey: 0,
    repeat: 0,
    locale: 0,
    getModifierState: Cu,
    charCode: function(e) {
      return e.type === "keypress" ? _i(e) : 0;
    },
    keyCode: function(e) {
      return e.type === "keydown" || e.type === "keyup" ? e.keyCode : 0;
    },
    which: function(e) {
      return e.type === "keypress" ? _i(e) : e.type === "keydown" || e.type === "keyup" ? e.keyCode : 0;
    }
  }), PS = wn(VS), YS = b({}, Li, {
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
  }), kg = wn(YS), GS = b({}, pa, {
    touches: 0,
    targetTouches: 0,
    changedTouches: 0,
    altKey: 0,
    metaKey: 0,
    ctrlKey: 0,
    shiftKey: 0,
    getModifierState: Cu
  }), qS = wn(GS), XS = b({}, Ho, {
    propertyName: 0,
    elapsedTime: 0,
    pseudoElement: 0
  }), FS = wn(XS), KS = b({}, Li, {
    deltaX: function(e) {
      return "deltaX" in e ? e.deltaX : "wheelDeltaX" in e ? -e.wheelDeltaX : 0;
    },
    deltaY: function(e) {
      return "deltaY" in e ? e.deltaY : "wheelDeltaY" in e ? -e.wheelDeltaY : "wheelDelta" in e ? -e.wheelDelta : 0;
    },
    deltaZ: 0,
    deltaMode: 0
  }), QS = wn(KS), ZS = b({}, Ho, {
    newState: 0,
    oldState: 0
  }), JS = wn(ZS), $S = [9, 13, 27, 32], Ou = xl && "CompositionEvent" in window, ma = null;
  xl && "documentMode" in document && (ma = document.documentMode);
  var WS = xl && "TextEvent" in window && !ma, _g = xl && (!Ou || ma && 8 < ma && 11 >= ma), Hg = " ", Ug = !1;
  function Lg(e, t) {
    switch (e) {
      case "keyup":
        return $S.indexOf(t.keyCode) !== -1;
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
  function Ig(e) {
    return e = e.detail, typeof e == "object" && "data" in e ? e.data : null;
  }
  var xr = !1;
  function ew(e, t) {
    switch (e) {
      case "compositionend":
        return Ig(t);
      case "keypress":
        return t.which !== 32 ? null : (Ug = !0, Hg);
      case "textInput":
        return e = t.data, e === Hg && Ug ? null : e;
      default:
        return null;
    }
  }
  function tw(e, t) {
    if (xr)
      return e === "compositionend" || !Ou && Lg(e, t) ? (e = zg(), ki = wu = Jl = null, xr = !1, e) : null;
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
        return _g && t.locale !== "ko" ? null : t.data;
      default:
        return null;
    }
  }
  var nw = {
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
  function Bg(e) {
    var t = e && e.nodeName && e.nodeName.toLowerCase();
    return t === "input" ? !!nw[e.type] : t === "textarea";
  }
  function Vg(e, t, l, r) {
    vr ? br ? br.push(r) : br = [r] : vr = r, t = Os(t, "onChange"), 0 < t.length && (l = new Ui(
      "onChange",
      "change",
      null,
      l,
      r
    ), e.push({ event: l, listeners: t }));
  }
  var ha = null, ya = null;
  function lw(e) {
    Ey(e, 0);
  }
  function Ii(e) {
    var t = ua(e);
    if (wg(t)) return e;
  }
  function Pg(e, t) {
    if (e === "change") return t;
  }
  var Yg = !1;
  if (xl) {
    var Mu;
    if (xl) {
      var Au = "oninput" in document;
      if (!Au) {
        var Gg = document.createElement("div");
        Gg.setAttribute("oninput", "return;"), Au = typeof Gg.oninput == "function";
      }
      Mu = Au;
    } else Mu = !1;
    Yg = Mu && (!document.documentMode || 9 < document.documentMode);
  }
  function qg() {
    ha && (ha.detachEvent("onpropertychange", Xg), ya = ha = null);
  }
  function Xg(e) {
    if (e.propertyName === "value" && Ii(ya)) {
      var t = [];
      Vg(
        t,
        ya,
        e,
        bu(e)
      ), Ag(lw, t);
    }
  }
  function ow(e, t, l) {
    e === "focusin" ? (qg(), ha = t, ya = l, ha.attachEvent("onpropertychange", Xg)) : e === "focusout" && qg();
  }
  function rw(e) {
    if (e === "selectionchange" || e === "keyup" || e === "keydown")
      return Ii(ya);
  }
  function aw(e, t) {
    if (e === "click") return Ii(t);
  }
  function iw(e, t) {
    if (e === "input" || e === "change")
      return Ii(t);
  }
  function sw(e, t) {
    return e === t && (e !== 0 || 1 / e === 1 / t) || e !== e && t !== t;
  }
  var Dn = typeof Object.is == "function" ? Object.is : sw;
  function va(e, t) {
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
  function Fg(e) {
    for (; e && e.firstChild; ) e = e.firstChild;
    return e;
  }
  function Kg(e, t) {
    var l = Fg(e);
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
      l = Fg(l);
    }
  }
  function Qg(e, t) {
    return e && t ? e === t ? !0 : e && e.nodeType === 3 ? !1 : t && t.nodeType === 3 ? Qg(e, t.parentNode) : "contains" in e ? e.contains(t) : e.compareDocumentPosition ? !!(e.compareDocumentPosition(t) & 16) : !1 : !1;
  }
  function Zg(e) {
    e = e != null && e.ownerDocument != null && e.ownerDocument.defaultView != null ? e.ownerDocument.defaultView : window;
    for (var t = Ni(e.document); t instanceof e.HTMLIFrameElement; ) {
      try {
        var l = typeof t.contentWindow.location.href == "string";
      } catch {
        l = !1;
      }
      if (l) e = t.contentWindow;
      else break;
      t = Ni(e.document);
    }
    return t;
  }
  function zu(e) {
    var t = e && e.nodeName && e.nodeName.toLowerCase();
    return t && (t === "input" && (e.type === "text" || e.type === "search" || e.type === "tel" || e.type === "url" || e.type === "password") || t === "textarea" || e.contentEditable === "true");
  }
  var cw = xl && "documentMode" in document && 11 >= document.documentMode, Sr = null, Du = null, ba = null, Nu = !1;
  function Jg(e, t, l) {
    var r = l.window === l ? l.document : l.nodeType === 9 ? l : l.ownerDocument;
    Nu || Sr == null || Sr !== Ni(r) || (r = Sr, "selectionStart" in r && zu(r) ? r = { start: r.selectionStart, end: r.selectionEnd } : (r = (r.ownerDocument && r.ownerDocument.defaultView || window).getSelection(), r = {
      anchorNode: r.anchorNode,
      anchorOffset: r.anchorOffset,
      focusNode: r.focusNode,
      focusOffset: r.focusOffset
    }), ba && va(ba, r) || (ba = r, r = Os(Du, "onSelect"), 0 < r.length && (t = new Ui(
      "onSelect",
      "select",
      null,
      t,
      l
    ), e.push({ event: t, listeners: r }), t.target = Sr)));
  }
  function Uo(e, t) {
    var l = {};
    return l[e.toLowerCase()] = t.toLowerCase(), l["Webkit" + e] = "webkit" + t, l["Moz" + e] = "moz" + t, l;
  }
  var wr = {
    animationend: Uo("Animation", "AnimationEnd"),
    animationiteration: Uo("Animation", "AnimationIteration"),
    animationstart: Uo("Animation", "AnimationStart"),
    transitionrun: Uo("Transition", "TransitionRun"),
    transitionstart: Uo("Transition", "TransitionStart"),
    transitioncancel: Uo("Transition", "TransitionCancel"),
    transitionend: Uo("Transition", "TransitionEnd")
  }, ju = {}, $g = {};
  xl && ($g = document.createElement("div").style, "AnimationEvent" in window || (delete wr.animationend.animation, delete wr.animationiteration.animation, delete wr.animationstart.animation), "TransitionEvent" in window || delete wr.transitionend.transition);
  function Lo(e) {
    if (ju[e]) return ju[e];
    if (!wr[e]) return e;
    var t = wr[e], l;
    for (l in t)
      if (t.hasOwnProperty(l) && l in $g)
        return ju[e] = t[l];
    return e;
  }
  var Wg = Lo("animationend"), em = Lo("animationiteration"), tm = Lo("animationstart"), uw = Lo("transitionrun"), fw = Lo("transitionstart"), dw = Lo("transitioncancel"), nm = Lo("transitionend"), lm = /* @__PURE__ */ new Map(), ku = "abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(
    " "
  );
  ku.push("scrollEnd");
  function nl(e, t) {
    lm.set(e, t), _o(t, [e]);
  }
  var Bi = typeof reportError == "function" ? reportError : function(e) {
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
  }, qn = [], Er = 0, _u = 0;
  function Vi() {
    for (var e = Er, t = _u = Er = 0; t < e; ) {
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
      c !== 0 && om(l, s, c);
    }
  }
  function Pi(e, t, l, r) {
    qn[Er++] = e, qn[Er++] = t, qn[Er++] = l, qn[Er++] = r, _u |= r, e.lanes |= r, e = e.alternate, e !== null && (e.lanes |= r);
  }
  function Hu(e, t, l, r) {
    return Pi(e, t, l, r), Yi(e);
  }
  function Io(e, t) {
    return Pi(e, null, null, t), Yi(e);
  }
  function om(e, t, l) {
    e.lanes |= l;
    var r = e.alternate;
    r !== null && (r.lanes |= l);
    for (var s = !1, c = e.return; c !== null; )
      c.childLanes |= l, r = c.alternate, r !== null && (r.childLanes |= l), c.tag === 22 && (e = c.stateNode, e === null || e._visibility & 1 || (s = !0)), e = c, c = c.return;
    return e.tag === 3 ? (c = e.stateNode, s && t !== null && (s = 31 - mt(l), e = c.hiddenUpdates, r = e[s], r === null ? e[s] = [t] : r.push(t), t.lane = l | 536870912), c) : null;
  }
  function Yi(e) {
    if (50 < Va)
      throw Va = 0, Xf = null, Error(i(185));
    for (var t = e.return; t !== null; )
      e = t, t = e.return;
    return e.tag === 3 ? e.stateNode : null;
  }
  var Tr = {};
  function pw(e, t, l, r) {
    this.tag = e, this.key = l, this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null, this.index = 0, this.refCleanup = this.ref = null, this.pendingProps = t, this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null, this.mode = r, this.subtreeFlags = this.flags = 0, this.deletions = null, this.childLanes = this.lanes = 0, this.alternate = null;
  }
  function Nn(e, t, l, r) {
    return new pw(e, t, l, r);
  }
  function Uu(e) {
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
  function rm(e, t) {
    e.flags &= 65011714;
    var l = e.alternate;
    return l === null ? (e.childLanes = 0, e.lanes = t, e.child = null, e.subtreeFlags = 0, e.memoizedProps = null, e.memoizedState = null, e.updateQueue = null, e.dependencies = null, e.stateNode = null) : (e.childLanes = l.childLanes, e.lanes = l.lanes, e.child = l.child, e.subtreeFlags = 0, e.deletions = null, e.memoizedProps = l.memoizedProps, e.memoizedState = l.memoizedState, e.updateQueue = l.updateQueue, e.type = l.type, t = l.dependencies, e.dependencies = t === null ? null : {
      lanes: t.lanes,
      firstContext: t.firstContext
    }), e;
  }
  function Gi(e, t, l, r, s, c) {
    var h = 0;
    if (r = e, typeof e == "function") Uu(e) && (h = 1);
    else if (typeof e == "string")
      h = vE(
        e,
        l,
        J.current
      ) ? 26 : e === "html" || e === "head" || e === "body" ? 27 : 5;
    else
      e: switch (e) {
        case G:
          return e = Nn(31, l, t, s), e.elementType = G, e.lanes = c, e;
        case M:
          return Bo(l.children, s, c, t);
        case E:
          h = 8, s |= 24;
          break;
        case A:
          return e = Nn(12, l, t, s | 2), e.elementType = A, e.lanes = c, e;
        case j:
          return e = Nn(13, l, t, s), e.elementType = j, e.lanes = c, e;
        case N:
          return e = Nn(19, l, t, s), e.elementType = N, e.lanes = c, e;
        default:
          if (typeof e == "object" && e !== null)
            switch (e.$$typeof) {
              case z:
                h = 10;
                break e;
              case O:
                h = 9;
                break e;
              case D:
                h = 11;
                break e;
              case U:
                h = 14;
                break e;
              case _:
                h = 16, r = null;
                break e;
            }
          h = 29, l = Error(
            i(130, e === null ? "null" : typeof e, "")
          ), r = null;
      }
    return t = Nn(h, l, t, s), t.elementType = e, t.type = r, t.lanes = c, t;
  }
  function Bo(e, t, l, r) {
    return e = Nn(7, e, r, t), e.lanes = l, e;
  }
  function Lu(e, t, l) {
    return e = Nn(6, e, null, t), e.lanes = l, e;
  }
  function am(e) {
    var t = Nn(18, null, null, 0);
    return t.stateNode = e, t;
  }
  function Iu(e, t, l) {
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
  var im = /* @__PURE__ */ new WeakMap();
  function Xn(e, t) {
    if (typeof e == "object" && e !== null) {
      var l = im.get(e);
      return l !== void 0 ? l : (t = {
        value: e,
        source: t,
        stack: Ce(t)
      }, im.set(e, t), t);
    }
    return {
      value: e,
      source: t,
      stack: Ce(t)
    };
  }
  var Rr = [], Cr = 0, qi = null, xa = 0, Fn = [], Kn = 0, $l = null, al = 1, il = "";
  function wl(e, t) {
    Rr[Cr++] = xa, Rr[Cr++] = qi, qi = e, xa = t;
  }
  function sm(e, t, l) {
    Fn[Kn++] = al, Fn[Kn++] = il, Fn[Kn++] = $l, $l = e;
    var r = al;
    e = il;
    var s = 32 - mt(r) - 1;
    r &= ~(1 << s), l += 1;
    var c = 32 - mt(t) + s;
    if (30 < c) {
      var h = s - s % 5;
      c = (r & (1 << h) - 1).toString(32), r >>= h, s -= h, al = 1 << 32 - mt(t) + s | l << s | r, il = c + e;
    } else
      al = 1 << c | l << s | r, il = e;
  }
  function Bu(e) {
    e.return !== null && (wl(e, 1), sm(e, 1, 0));
  }
  function Vu(e) {
    for (; e === qi; )
      qi = Rr[--Cr], Rr[Cr] = null, xa = Rr[--Cr], Rr[Cr] = null;
    for (; e === $l; )
      $l = Fn[--Kn], Fn[Kn] = null, il = Fn[--Kn], Fn[Kn] = null, al = Fn[--Kn], Fn[Kn] = null;
  }
  function cm(e, t) {
    Fn[Kn++] = al, Fn[Kn++] = il, Fn[Kn++] = $l, al = t.id, il = t.overflow, $l = e;
  }
  var un = null, kt = null, st = !1, Wl = null, Qn = !1, Pu = Error(i(519));
  function eo(e) {
    var t = Error(
      i(
        418,
        1 < arguments.length && arguments[1] !== void 0 && arguments[1] ? "text" : "HTML",
        ""
      )
    );
    throw Sa(Xn(t, e)), Pu;
  }
  function um(e) {
    var t = e.stateNode, l = e.type, r = e.memoizedProps;
    switch (t[Ct] = e, t[cn] = r, l) {
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
        for (l = 0; l < Ya.length; l++)
          ot(Ya[l], t);
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
        ot("invalid", t), Eg(
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
        ot("invalid", t), Rg(t, r.value, r.defaultValue, r.children);
    }
    l = r.children, typeof l != "string" && typeof l != "number" && typeof l != "bigint" || t.textContent === "" + l || r.suppressHydrationWarning === !0 || Oy(t.textContent, l) ? (r.popover != null && (ot("beforetoggle", t), ot("toggle", t)), r.onScroll != null && ot("scroll", t), r.onScrollEnd != null && ot("scrollend", t), r.onClick != null && (t.onclick = bl), t = !0) : t = !1, t || eo(e, !0);
  }
  function fm(e) {
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
    if (!st) return fm(e), st = !0, !1;
    var t = e.tag, l;
    if ((l = t !== 3 && t !== 27) && ((l = t === 5) && (l = e.type, l = !(l !== "form" && l !== "button") || id(e.type, e.memoizedProps)), l = !l), l && kt && eo(e), fm(e), t === 13) {
      if (e = e.memoizedState, e = e !== null ? e.dehydrated : null, !e) throw Error(i(317));
      kt = Hy(e);
    } else if (t === 31) {
      if (e = e.memoizedState, e = e !== null ? e.dehydrated : null, !e) throw Error(i(317));
      kt = Hy(e);
    } else
      t === 27 ? (t = kt, mo(e.type) ? (e = dd, dd = null, kt = e) : kt = t) : kt = un ? Jn(e.stateNode.nextSibling) : null;
    return !0;
  }
  function Vo() {
    kt = un = null, st = !1;
  }
  function Yu() {
    var e = Wl;
    return e !== null && (Cn === null ? Cn = e : Cn.push.apply(
      Cn,
      e
    ), Wl = null), e;
  }
  function Sa(e) {
    Wl === null ? Wl = [e] : Wl.push(e);
  }
  var Gu = C(null), Po = null, El = null;
  function to(e, t, l) {
    ne(Gu, t._currentValue), t._currentValue = l;
  }
  function Tl(e) {
    e._currentValue = Gu.current, L(Gu);
  }
  function qu(e, t, l) {
    for (; e !== null; ) {
      var r = e.alternate;
      if ((e.childLanes & t) !== t ? (e.childLanes |= t, r !== null && (r.childLanes |= t)) : r !== null && (r.childLanes & t) !== t && (r.childLanes |= t), e === l) break;
      e = e.return;
    }
  }
  function Xu(e, t, l, r) {
    var s = e.child;
    for (s !== null && (s.return = e); s !== null; ) {
      var c = s.dependencies;
      if (c !== null) {
        var h = s.child;
        c = c.firstContext;
        e: for (; c !== null; ) {
          var T = c;
          c = s;
          for (var I = 0; I < t.length; I++)
            if (T.context === t[I]) {
              c.lanes |= l, T = c.alternate, T !== null && (T.lanes |= l), qu(
                c.return,
                l,
                e
              ), r || (h = null);
              break e;
            }
          c = T.next;
        }
      } else if (s.tag === 18) {
        if (h = s.return, h === null) throw Error(i(341));
        h.lanes |= l, c = h.alternate, c !== null && (c.lanes |= l), qu(h, l, e), h = null;
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
          var T = s.type;
          Dn(s.pendingProps.value, h.value) || (e !== null ? e.push(T) : e = [T]);
        }
      } else if (s === oe.current) {
        if (h = s.alternate, h === null) throw Error(i(387));
        h.memoizedState.memoizedState !== s.memoizedState.memoizedState && (e !== null ? e.push(Ka) : e = [Ka]);
      }
      s = s.return;
    }
    e !== null && Xu(
      t,
      e,
      l,
      r
    ), t.flags |= 262144;
  }
  function Xi(e) {
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
  function Yo(e) {
    Po = e, El = null, e = e.dependencies, e !== null && (e.firstContext = null);
  }
  function fn(e) {
    return dm(Po, e);
  }
  function Fi(e, t) {
    return Po === null && Yo(e), dm(e, t);
  }
  function dm(e, t) {
    var l = t._currentValue;
    if (t = { context: t, memoizedValue: l, next: null }, El === null) {
      if (e === null) throw Error(i(308));
      El = t, e.dependencies = { lanes: 0, firstContext: t }, e.flags |= 524288;
    } else El = El.next = t;
    return l;
  }
  var gw = typeof AbortController < "u" ? AbortController : function() {
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
  }, mw = n.unstable_scheduleCallback, hw = n.unstable_NormalPriority, Qt = {
    $$typeof: z,
    Consumer: null,
    Provider: null,
    _currentValue: null,
    _currentValue2: null,
    _threadCount: 0
  };
  function Fu() {
    return {
      controller: new gw(),
      data: /* @__PURE__ */ new Map(),
      refCount: 0
    };
  }
  function wa(e) {
    e.refCount--, e.refCount === 0 && mw(hw, function() {
      e.controller.abort();
    });
  }
  var Ea = null, Ku = 0, Ar = 0, zr = null;
  function yw(e, t) {
    if (Ea === null) {
      var l = Ea = [];
      Ku = 0, Ar = $f(), zr = {
        status: "pending",
        value: void 0,
        then: function(r) {
          l.push(r);
        }
      };
    }
    return Ku++, t.then(pm, pm), t;
  }
  function pm() {
    if (--Ku === 0 && Ea !== null) {
      zr !== null && (zr.status = "fulfilled");
      var e = Ea;
      Ea = null, Ar = 0, zr = null;
      for (var t = 0; t < e.length; t++) (0, e[t])();
    }
  }
  function vw(e, t) {
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
  var gm = H.S;
  H.S = function(e, t) {
    Jh = ae(), typeof t == "object" && t !== null && typeof t.then == "function" && yw(e, t), gm !== null && gm(e, t);
  };
  var Go = C(null);
  function Qu() {
    var e = Go.current;
    return e !== null ? e : Ot.pooledCache;
  }
  function Ki(e, t) {
    t === null ? ne(Go, Go.current) : ne(Go, t.pool);
  }
  function mm() {
    var e = Qu();
    return e === null ? null : { parent: Qt._currentValue, pool: e };
  }
  var Dr = Error(i(460)), Zu = Error(i(474)), Qi = Error(i(542)), Zi = { then: function() {
  } };
  function hm(e) {
    return e = e.status, e === "fulfilled" || e === "rejected";
  }
  function ym(e, t, l) {
    switch (l = e[l], l === void 0 ? e.push(t) : l !== t && (t.then(bl, bl), t = l), t.status) {
      case "fulfilled":
        return t.value;
      case "rejected":
        throw e = t.reason, bm(e), e;
      default:
        if (typeof t.status == "string") t.then(bl, bl);
        else {
          if (e = Ot, e !== null && 100 < e.shellSuspendCounter)
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
            throw e = t.reason, bm(e), e;
        }
        throw Xo = t, Dr;
    }
  }
  function qo(e) {
    try {
      var t = e._init;
      return t(e._payload);
    } catch (l) {
      throw l !== null && typeof l == "object" && typeof l.then == "function" ? (Xo = l, Dr) : l;
    }
  }
  var Xo = null;
  function vm() {
    if (Xo === null) throw Error(i(459));
    var e = Xo;
    return Xo = null, e;
  }
  function bm(e) {
    if (e === Dr || e === Qi)
      throw Error(i(483));
  }
  var Nr = null, Ta = 0;
  function Ji(e) {
    var t = Ta;
    return Ta += 1, Nr === null && (Nr = []), ym(Nr, e, t);
  }
  function Ra(e, t) {
    t = t.props.ref, e.ref = t !== void 0 ? t : null;
  }
  function $i(e, t) {
    throw t.$$typeof === S ? Error(i(525)) : (e = Object.prototype.toString.call(t), Error(
      i(
        31,
        e === "[object Object]" ? "object with keys {" + Object.keys(t).join(", ") + "}" : e
      )
    ));
  }
  function xm(e) {
    function t(F, P) {
      if (e) {
        var $ = F.deletions;
        $ === null ? (F.deletions = [P], F.flags |= 16) : $.push(P);
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
    function c(F, P, $) {
      return F.index = $, e ? ($ = F.alternate, $ !== null ? ($ = $.index, $ < P ? (F.flags |= 67108866, P) : $) : (F.flags |= 67108866, P)) : (F.flags |= 1048576, P);
    }
    function h(F) {
      return e && F.alternate === null && (F.flags |= 67108866), F;
    }
    function T(F, P, $, ue) {
      return P === null || P.tag !== 6 ? (P = Lu($, F.mode, ue), P.return = F, P) : (P = s(P, $), P.return = F, P);
    }
    function I(F, P, $, ue) {
      var Ie = $.type;
      return Ie === M ? ce(
        F,
        P,
        $.props.children,
        ue,
        $.key
      ) : P !== null && (P.elementType === Ie || typeof Ie == "object" && Ie !== null && Ie.$$typeof === _ && qo(Ie) === P.type) ? (P = s(P, $.props), Ra(P, $), P.return = F, P) : (P = Gi(
        $.type,
        $.key,
        $.props,
        null,
        F.mode,
        ue
      ), Ra(P, $), P.return = F, P);
    }
    function W(F, P, $, ue) {
      return P === null || P.tag !== 4 || P.stateNode.containerInfo !== $.containerInfo || P.stateNode.implementation !== $.implementation ? (P = Iu($, F.mode, ue), P.return = F, P) : (P = s(P, $.children || []), P.return = F, P);
    }
    function ce(F, P, $, ue, Ie) {
      return P === null || P.tag !== 7 ? (P = Bo(
        $,
        F.mode,
        ue,
        Ie
      ), P.return = F, P) : (P = s(P, $), P.return = F, P);
    }
    function de(F, P, $) {
      if (typeof P == "string" && P !== "" || typeof P == "number" || typeof P == "bigint")
        return P = Lu(
          "" + P,
          F.mode,
          $
        ), P.return = F, P;
      if (typeof P == "object" && P !== null) {
        switch (P.$$typeof) {
          case R:
            return $ = Gi(
              P.type,
              P.key,
              P.props,
              null,
              F.mode,
              $
            ), Ra($, P), $.return = F, $;
          case w:
            return P = Iu(
              P,
              F.mode,
              $
            ), P.return = F, P;
          case _:
            return P = qo(P), de(F, P, $);
        }
        if (q(P) || Q(P))
          return P = Bo(
            P,
            F.mode,
            $,
            null
          ), P.return = F, P;
        if (typeof P.then == "function")
          return de(F, Ji(P), $);
        if (P.$$typeof === z)
          return de(
            F,
            Fi(F, P),
            $
          );
        $i(F, P);
      }
      return null;
    }
    function te(F, P, $, ue) {
      var Ie = P !== null ? P.key : null;
      if (typeof $ == "string" && $ !== "" || typeof $ == "number" || typeof $ == "bigint")
        return Ie !== null ? null : T(F, P, "" + $, ue);
      if (typeof $ == "object" && $ !== null) {
        switch ($.$$typeof) {
          case R:
            return $.key === Ie ? I(F, P, $, ue) : null;
          case w:
            return $.key === Ie ? W(F, P, $, ue) : null;
          case _:
            return $ = qo($), te(F, P, $, ue);
        }
        if (q($) || Q($))
          return Ie !== null ? null : ce(F, P, $, ue, null);
        if (typeof $.then == "function")
          return te(
            F,
            P,
            Ji($),
            ue
          );
        if ($.$$typeof === z)
          return te(
            F,
            P,
            Fi(F, $),
            ue
          );
        $i(F, $);
      }
      return null;
    }
    function le(F, P, $, ue, Ie) {
      if (typeof ue == "string" && ue !== "" || typeof ue == "number" || typeof ue == "bigint")
        return F = F.get($) || null, T(P, F, "" + ue, Ie);
      if (typeof ue == "object" && ue !== null) {
        switch (ue.$$typeof) {
          case R:
            return F = F.get(
              ue.key === null ? $ : ue.key
            ) || null, I(P, F, ue, Ie);
          case w:
            return F = F.get(
              ue.key === null ? $ : ue.key
            ) || null, W(P, F, ue, Ie);
          case _:
            return ue = qo(ue), le(
              F,
              P,
              $,
              ue,
              Ie
            );
        }
        if (q(ue) || Q(ue))
          return F = F.get($) || null, ce(P, F, ue, Ie, null);
        if (typeof ue.then == "function")
          return le(
            F,
            P,
            $,
            Ji(ue),
            Ie
          );
        if (ue.$$typeof === z)
          return le(
            F,
            P,
            $,
            Fi(P, ue),
            Ie
          );
        $i(P, ue);
      }
      return null;
    }
    function De(F, P, $, ue) {
      for (var Ie = null, ct = null, Ne = P, Fe = P = 0, it = null; Ne !== null && Fe < $.length; Fe++) {
        Ne.index > Fe ? (it = Ne, Ne = null) : it = Ne.sibling;
        var ut = te(
          F,
          Ne,
          $[Fe],
          ue
        );
        if (ut === null) {
          Ne === null && (Ne = it);
          break;
        }
        e && Ne && ut.alternate === null && t(F, Ne), P = c(ut, P, Fe), ct === null ? Ie = ut : ct.sibling = ut, ct = ut, Ne = it;
      }
      if (Fe === $.length)
        return l(F, Ne), st && wl(F, Fe), Ie;
      if (Ne === null) {
        for (; Fe < $.length; Fe++)
          Ne = de(F, $[Fe], ue), Ne !== null && (P = c(
            Ne,
            P,
            Fe
          ), ct === null ? Ie = Ne : ct.sibling = Ne, ct = Ne);
        return st && wl(F, Fe), Ie;
      }
      for (Ne = r(Ne); Fe < $.length; Fe++)
        it = le(
          Ne,
          F,
          Fe,
          $[Fe],
          ue
        ), it !== null && (e && it.alternate !== null && Ne.delete(
          it.key === null ? Fe : it.key
        ), P = c(
          it,
          P,
          Fe
        ), ct === null ? Ie = it : ct.sibling = it, ct = it);
      return e && Ne.forEach(function(xo) {
        return t(F, xo);
      }), st && wl(F, Fe), Ie;
    }
    function Ve(F, P, $, ue) {
      if ($ == null) throw Error(i(151));
      for (var Ie = null, ct = null, Ne = P, Fe = P = 0, it = null, ut = $.next(); Ne !== null && !ut.done; Fe++, ut = $.next()) {
        Ne.index > Fe ? (it = Ne, Ne = null) : it = Ne.sibling;
        var xo = te(F, Ne, ut.value, ue);
        if (xo === null) {
          Ne === null && (Ne = it);
          break;
        }
        e && Ne && xo.alternate === null && t(F, Ne), P = c(xo, P, Fe), ct === null ? Ie = xo : ct.sibling = xo, ct = xo, Ne = it;
      }
      if (ut.done)
        return l(F, Ne), st && wl(F, Fe), Ie;
      if (Ne === null) {
        for (; !ut.done; Fe++, ut = $.next())
          ut = de(F, ut.value, ue), ut !== null && (P = c(ut, P, Fe), ct === null ? Ie = ut : ct.sibling = ut, ct = ut);
        return st && wl(F, Fe), Ie;
      }
      for (Ne = r(Ne); !ut.done; Fe++, ut = $.next())
        ut = le(Ne, F, Fe, ut.value, ue), ut !== null && (e && ut.alternate !== null && Ne.delete(ut.key === null ? Fe : ut.key), P = c(ut, P, Fe), ct === null ? Ie = ut : ct.sibling = ut, ct = ut);
      return e && Ne.forEach(function(AE) {
        return t(F, AE);
      }), st && wl(F, Fe), Ie;
    }
    function Et(F, P, $, ue) {
      if (typeof $ == "object" && $ !== null && $.type === M && $.key === null && ($ = $.props.children), typeof $ == "object" && $ !== null) {
        switch ($.$$typeof) {
          case R:
            e: {
              for (var Ie = $.key; P !== null; ) {
                if (P.key === Ie) {
                  if (Ie = $.type, Ie === M) {
                    if (P.tag === 7) {
                      l(
                        F,
                        P.sibling
                      ), ue = s(
                        P,
                        $.props.children
                      ), ue.return = F, F = ue;
                      break e;
                    }
                  } else if (P.elementType === Ie || typeof Ie == "object" && Ie !== null && Ie.$$typeof === _ && qo(Ie) === P.type) {
                    l(
                      F,
                      P.sibling
                    ), ue = s(P, $.props), Ra(ue, $), ue.return = F, F = ue;
                    break e;
                  }
                  l(F, P);
                  break;
                } else t(F, P);
                P = P.sibling;
              }
              $.type === M ? (ue = Bo(
                $.props.children,
                F.mode,
                ue,
                $.key
              ), ue.return = F, F = ue) : (ue = Gi(
                $.type,
                $.key,
                $.props,
                null,
                F.mode,
                ue
              ), Ra(ue, $), ue.return = F, F = ue);
            }
            return h(F);
          case w:
            e: {
              for (Ie = $.key; P !== null; ) {
                if (P.key === Ie)
                  if (P.tag === 4 && P.stateNode.containerInfo === $.containerInfo && P.stateNode.implementation === $.implementation) {
                    l(
                      F,
                      P.sibling
                    ), ue = s(P, $.children || []), ue.return = F, F = ue;
                    break e;
                  } else {
                    l(F, P);
                    break;
                  }
                else t(F, P);
                P = P.sibling;
              }
              ue = Iu($, F.mode, ue), ue.return = F, F = ue;
            }
            return h(F);
          case _:
            return $ = qo($), Et(
              F,
              P,
              $,
              ue
            );
        }
        if (q($))
          return De(
            F,
            P,
            $,
            ue
          );
        if (Q($)) {
          if (Ie = Q($), typeof Ie != "function") throw Error(i(150));
          return $ = Ie.call($), Ve(
            F,
            P,
            $,
            ue
          );
        }
        if (typeof $.then == "function")
          return Et(
            F,
            P,
            Ji($),
            ue
          );
        if ($.$$typeof === z)
          return Et(
            F,
            P,
            Fi(F, $),
            ue
          );
        $i(F, $);
      }
      return typeof $ == "string" && $ !== "" || typeof $ == "number" || typeof $ == "bigint" ? ($ = "" + $, P !== null && P.tag === 6 ? (l(F, P.sibling), ue = s(P, $), ue.return = F, F = ue) : (l(F, P), ue = Lu($, F.mode, ue), ue.return = F, F = ue), h(F)) : l(F, P);
    }
    return function(F, P, $, ue) {
      try {
        Ta = 0;
        var Ie = Et(
          F,
          P,
          $,
          ue
        );
        return Nr = null, Ie;
      } catch (Ne) {
        if (Ne === Dr || Ne === Qi) throw Ne;
        var ct = Nn(29, Ne, null, F.mode);
        return ct.lanes = ue, ct.return = F, ct;
      }
    };
  }
  var Fo = xm(!0), Sm = xm(!1), no = !1;
  function Ju(e) {
    e.updateQueue = {
      baseState: e.memoizedState,
      firstBaseUpdate: null,
      lastBaseUpdate: null,
      shared: { pending: null, lanes: 0, hiddenCallbacks: null },
      callbacks: null
    };
  }
  function $u(e, t) {
    e = e.updateQueue, t.updateQueue === e && (t.updateQueue = {
      baseState: e.baseState,
      firstBaseUpdate: e.firstBaseUpdate,
      lastBaseUpdate: e.lastBaseUpdate,
      shared: e.shared,
      callbacks: null
    });
  }
  function lo(e) {
    return { lane: e, tag: 0, payload: null, callback: null, next: null };
  }
  function oo(e, t, l) {
    var r = e.updateQueue;
    if (r === null) return null;
    if (r = r.shared, (dt & 2) !== 0) {
      var s = r.pending;
      return s === null ? t.next = t : (t.next = s.next, s.next = t), r.pending = t, t = Yi(e), om(e, null, l), t;
    }
    return Pi(e, r, t, l), Yi(e);
  }
  function Ca(e, t, l) {
    if (t = t.updateQueue, t !== null && (t = t.shared, (l & 4194048) !== 0)) {
      var r = t.lanes;
      r &= e.pendingLanes, l |= r, t.lanes = l, tl(e, l);
    }
  }
  function Wu(e, t) {
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
  var ef = !1;
  function Oa() {
    if (ef) {
      var e = zr;
      if (e !== null) throw e;
    }
  }
  function Ma(e, t, l, r) {
    ef = !1;
    var s = e.updateQueue;
    no = !1;
    var c = s.firstBaseUpdate, h = s.lastBaseUpdate, T = s.shared.pending;
    if (T !== null) {
      s.shared.pending = null;
      var I = T, W = I.next;
      I.next = null, h === null ? c = W : h.next = W, h = I;
      var ce = e.alternate;
      ce !== null && (ce = ce.updateQueue, T = ce.lastBaseUpdate, T !== h && (T === null ? ce.firstBaseUpdate = W : T.next = W, ce.lastBaseUpdate = I));
    }
    if (c !== null) {
      var de = s.baseState;
      h = 0, ce = W = I = null, T = c;
      do {
        var te = T.lane & -536870913, le = te !== T.lane;
        if (le ? (at & te) === te : (r & te) === te) {
          te !== 0 && te === Ar && (ef = !0), ce !== null && (ce = ce.next = {
            lane: 0,
            tag: T.tag,
            payload: T.payload,
            callback: null,
            next: null
          });
          e: {
            var De = e, Ve = T;
            te = t;
            var Et = l;
            switch (Ve.tag) {
              case 1:
                if (De = Ve.payload, typeof De == "function") {
                  de = De.call(Et, de, te);
                  break e;
                }
                de = De;
                break e;
              case 3:
                De.flags = De.flags & -65537 | 128;
              case 0:
                if (De = Ve.payload, te = typeof De == "function" ? De.call(Et, de, te) : De, te == null) break e;
                de = b({}, de, te);
                break e;
              case 2:
                no = !0;
            }
          }
          te = T.callback, te !== null && (e.flags |= 64, le && (e.flags |= 8192), le = s.callbacks, le === null ? s.callbacks = [te] : le.push(te));
        } else
          le = {
            lane: te,
            tag: T.tag,
            payload: T.payload,
            callback: T.callback,
            next: null
          }, ce === null ? (W = ce = le, I = de) : ce = ce.next = le, h |= te;
        if (T = T.next, T === null) {
          if (T = s.shared.pending, T === null)
            break;
          le = T, T = le.next, le.next = null, s.lastBaseUpdate = le, s.shared.pending = null;
        }
      } while (!0);
      ce === null && (I = de), s.baseState = I, s.firstBaseUpdate = W, s.lastBaseUpdate = ce, c === null && (s.shared.lanes = 0), co |= h, e.lanes = h, e.memoizedState = de;
    }
  }
  function wm(e, t) {
    if (typeof e != "function")
      throw Error(i(191, e));
    e.call(t);
  }
  function Em(e, t) {
    var l = e.callbacks;
    if (l !== null)
      for (e.callbacks = null, e = 0; e < l.length; e++)
        wm(l[e], t);
  }
  var jr = C(null), Wi = C(0);
  function Tm(e, t) {
    e = jl, ne(Wi, e), ne(jr, t), jl = e | t.baseLanes;
  }
  function tf() {
    ne(Wi, jl), ne(jr, jr.current);
  }
  function nf() {
    jl = Wi.current, L(jr), L(Wi);
  }
  var jn = C(null), Zn = null;
  function ro(e) {
    var t = e.alternate;
    ne(Ft, Ft.current & 1), ne(jn, e), Zn === null && (t === null || jr.current !== null || t.memoizedState !== null) && (Zn = e);
  }
  function lf(e) {
    ne(Ft, Ft.current), ne(jn, e), Zn === null && (Zn = e);
  }
  function Rm(e) {
    e.tag === 22 ? (ne(Ft, Ft.current), ne(jn, e), Zn === null && (Zn = e)) : ao();
  }
  function ao() {
    ne(Ft, Ft.current), ne(jn, jn.current);
  }
  function kn(e) {
    L(jn), Zn === e && (Zn = null), L(Ft);
  }
  var Ft = C(0);
  function es(e) {
    for (var t = e; t !== null; ) {
      if (t.tag === 13) {
        var l = t.memoizedState;
        if (l !== null && (l = l.dehydrated, l === null || ud(l) || fd(l)))
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
  var Rl = 0, Xe = null, St = null, Zt = null, ts = !1, kr = !1, Ko = !1, ns = 0, Aa = 0, _r = null, bw = 0;
  function Bt() {
    throw Error(i(321));
  }
  function of(e, t) {
    if (t === null) return !1;
    for (var l = 0; l < t.length && l < e.length; l++)
      if (!Dn(e[l], t[l])) return !1;
    return !0;
  }
  function rf(e, t, l, r, s, c) {
    return Rl = c, Xe = t, t.memoizedState = null, t.updateQueue = null, t.lanes = 0, H.H = e === null || e.memoizedState === null ? sh : Sf, Ko = !1, c = l(r, s), Ko = !1, kr && (c = Om(
      t,
      l,
      r,
      s
    )), Cm(e), c;
  }
  function Cm(e) {
    H.H = Na;
    var t = St !== null && St.next !== null;
    if (Rl = 0, Zt = St = Xe = null, ts = !1, Aa = 0, _r = null, t) throw Error(i(300));
    e === null || Jt || (e = e.dependencies, e !== null && Xi(e) && (Jt = !0));
  }
  function Om(e, t, l, r) {
    Xe = e;
    var s = 0;
    do {
      if (kr && (_r = null), Aa = 0, kr = !1, 25 <= s) throw Error(i(301));
      if (s += 1, Zt = St = null, e.updateQueue != null) {
        var c = e.updateQueue;
        c.lastEffect = null, c.events = null, c.stores = null, c.memoCache != null && (c.memoCache.index = 0);
      }
      H.H = ch, c = t(l, r);
    } while (kr);
    return c;
  }
  function xw() {
    var e = H.H, t = e.useState()[0];
    return t = typeof t.then == "function" ? za(t) : t, e = e.useState()[0], (St !== null ? St.memoizedState : null) !== e && (Xe.flags |= 1024), t;
  }
  function af() {
    var e = ns !== 0;
    return ns = 0, e;
  }
  function sf(e, t, l) {
    t.updateQueue = e.updateQueue, t.flags &= -2053, e.lanes &= ~l;
  }
  function cf(e) {
    if (ts) {
      for (e = e.memoizedState; e !== null; ) {
        var t = e.queue;
        t !== null && (t.pending = null), e = e.next;
      }
      ts = !1;
    }
    Rl = 0, Zt = St = Xe = null, kr = !1, Aa = ns = 0, _r = null;
  }
  function yn() {
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
    if (St === null) {
      var e = Xe.alternate;
      e = e !== null ? e.memoizedState : null;
    } else e = St.next;
    var t = Zt === null ? Xe.memoizedState : Zt.next;
    if (t !== null)
      Zt = t, St = e;
    else {
      if (e === null)
        throw Xe.alternate === null ? Error(i(467)) : Error(i(310));
      St = e, e = {
        memoizedState: St.memoizedState,
        baseState: St.baseState,
        baseQueue: St.baseQueue,
        queue: St.queue,
        next: null
      }, Zt === null ? Xe.memoizedState = Zt = e : Zt = Zt.next = e;
    }
    return Zt;
  }
  function ls() {
    return { lastEffect: null, events: null, stores: null, memoCache: null };
  }
  function za(e) {
    var t = Aa;
    return Aa += 1, _r === null && (_r = []), e = ym(_r, e, t), t = Xe, (Zt === null ? t.memoizedState : Zt.next) === null && (t = t.alternate, H.H = t === null || t.memoizedState === null ? sh : Sf), e;
  }
  function os(e) {
    if (e !== null && typeof e == "object") {
      if (typeof e.then == "function") return za(e);
      if (e.$$typeof === z) return fn(e);
    }
    throw Error(i(438, String(e)));
  }
  function uf(e) {
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
    if (t == null && (t = { data: [], index: 0 }), l === null && (l = ls(), Xe.updateQueue = l), l.memoCache = t, l = t.data[t.index], l === void 0)
      for (l = t.data[t.index] = Array(e), r = 0; r < e; r++)
        l[r] = k;
    return t.index++, l;
  }
  function Cl(e, t) {
    return typeof t == "function" ? t(e) : t;
  }
  function rs(e) {
    var t = Kt();
    return ff(t, St, e);
  }
  function ff(e, t, l) {
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
      var T = h = null, I = null, W = t, ce = !1;
      do {
        var de = W.lane & -536870913;
        if (de !== W.lane ? (at & de) === de : (Rl & de) === de) {
          var te = W.revertLane;
          if (te === 0)
            I !== null && (I = I.next = {
              lane: 0,
              revertLane: 0,
              gesture: null,
              action: W.action,
              hasEagerState: W.hasEagerState,
              eagerState: W.eagerState,
              next: null
            }), de === Ar && (ce = !0);
          else if ((Rl & te) === te) {
            W = W.next, te === Ar && (ce = !0);
            continue;
          } else
            de = {
              lane: 0,
              revertLane: W.revertLane,
              gesture: null,
              action: W.action,
              hasEagerState: W.hasEagerState,
              eagerState: W.eagerState,
              next: null
            }, I === null ? (T = I = de, h = c) : I = I.next = de, Xe.lanes |= te, co |= te;
          de = W.action, Ko && l(c, de), c = W.hasEagerState ? W.eagerState : l(c, de);
        } else
          te = {
            lane: de,
            revertLane: W.revertLane,
            gesture: W.gesture,
            action: W.action,
            hasEagerState: W.hasEagerState,
            eagerState: W.eagerState,
            next: null
          }, I === null ? (T = I = te, h = c) : I = I.next = te, Xe.lanes |= de, co |= de;
        W = W.next;
      } while (W !== null && W !== t);
      if (I === null ? h = c : I.next = T, !Dn(c, e.memoizedState) && (Jt = !0, ce && (l = zr, l !== null)))
        throw l;
      e.memoizedState = c, e.baseState = h, e.baseQueue = I, r.lastRenderedState = c;
    }
    return s === null && (r.lanes = 0), [e.memoizedState, r.dispatch];
  }
  function df(e) {
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
      Dn(c, t.memoizedState) || (Jt = !0), t.memoizedState = c, t.baseQueue === null && (t.baseState = c), l.lastRenderedState = c;
    }
    return [c, r];
  }
  function Mm(e, t, l) {
    var r = Xe, s = Kt(), c = st;
    if (c) {
      if (l === void 0) throw Error(i(407));
      l = l();
    } else l = t();
    var h = !Dn(
      (St || s).memoizedState,
      l
    );
    if (h && (s.memoizedState = l, Jt = !0), s = s.queue, mf(Dm.bind(null, r, s, e), [
      e
    ]), s.getSnapshot !== t || h || Zt !== null && Zt.memoizedState.tag & 1) {
      if (r.flags |= 2048, Hr(
        9,
        { destroy: void 0 },
        zm.bind(
          null,
          r,
          s,
          l,
          t
        ),
        null
      ), Ot === null) throw Error(i(349));
      c || (Rl & 127) !== 0 || Am(r, t, l);
    }
    return l;
  }
  function Am(e, t, l) {
    e.flags |= 16384, e = { getSnapshot: t, value: l }, t = Xe.updateQueue, t === null ? (t = ls(), Xe.updateQueue = t, t.stores = [e]) : (l = t.stores, l === null ? t.stores = [e] : l.push(e));
  }
  function zm(e, t, l, r) {
    t.value = l, t.getSnapshot = r, Nm(t) && jm(e);
  }
  function Dm(e, t, l) {
    return l(function() {
      Nm(t) && jm(e);
    });
  }
  function Nm(e) {
    var t = e.getSnapshot;
    e = e.value;
    try {
      var l = t();
      return !Dn(e, l);
    } catch {
      return !0;
    }
  }
  function jm(e) {
    var t = Io(e, 2);
    t !== null && On(t, e, 2);
  }
  function pf(e) {
    var t = yn();
    if (typeof e == "function") {
      var l = e;
      if (e = l(), Ko) {
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
  function km(e, t, l, r) {
    return e.baseState = l, ff(
      e,
      St,
      typeof r == "function" ? r : Cl
    );
  }
  function Sw(e, t, l, r, s) {
    if (ss(e)) throw Error(i(485));
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
      H.T !== null ? l(!0) : c.isTransition = !1, r(c), l = t.pending, l === null ? (c.next = t.pending = c, _m(t, c)) : (c.next = l.next, t.pending = l.next = c);
    }
  }
  function _m(e, t) {
    var l = t.action, r = t.payload, s = e.state;
    if (t.isTransition) {
      var c = H.T, h = {};
      H.T = h;
      try {
        var T = l(s, r), I = H.S;
        I !== null && I(h, T), Hm(e, t, T);
      } catch (W) {
        gf(e, t, W);
      } finally {
        c !== null && h.types !== null && (c.types = h.types), H.T = c;
      }
    } else
      try {
        c = l(s, r), Hm(e, t, c);
      } catch (W) {
        gf(e, t, W);
      }
  }
  function Hm(e, t, l) {
    l !== null && typeof l == "object" && typeof l.then == "function" ? l.then(
      function(r) {
        Um(e, t, r);
      },
      function(r) {
        return gf(e, t, r);
      }
    ) : Um(e, t, l);
  }
  function Um(e, t, l) {
    t.status = "fulfilled", t.value = l, Lm(t), e.state = l, t = e.pending, t !== null && (l = t.next, l === t ? e.pending = null : (l = l.next, t.next = l, _m(e, l)));
  }
  function gf(e, t, l) {
    var r = e.pending;
    if (e.pending = null, r !== null) {
      r = r.next;
      do
        t.status = "rejected", t.reason = l, Lm(t), t = t.next;
      while (t !== r);
    }
    e.action = null;
  }
  function Lm(e) {
    e = e.listeners;
    for (var t = 0; t < e.length; t++) (0, e[t])();
  }
  function Im(e, t) {
    return t;
  }
  function Bm(e, t) {
    if (st) {
      var l = Ot.formState;
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
            eo(r);
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
      lastRenderedReducer: Im,
      lastRenderedState: t
    }, l.queue = r, l = rh.bind(
      null,
      Xe,
      r
    ), r.dispatch = l, r = pf(!1), c = xf.bind(
      null,
      Xe,
      !1,
      r.queue
    ), r = yn(), s = {
      state: t,
      dispatch: null,
      action: e,
      pending: null
    }, r.queue = s, l = Sw.bind(
      null,
      Xe,
      s,
      c,
      l
    ), s.dispatch = l, r.memoizedState = e, [t, l, !1];
  }
  function Vm(e) {
    var t = Kt();
    return Pm(t, St, e);
  }
  function Pm(e, t, l) {
    if (t = ff(
      e,
      t,
      Im
    )[0], e = rs(Cl)[0], typeof t == "object" && t !== null && typeof t.then == "function")
      try {
        var r = za(t);
      } catch (h) {
        throw h === Dr ? Qi : h;
      }
    else r = t;
    t = Kt();
    var s = t.queue, c = s.dispatch;
    return l !== t.memoizedState && (Xe.flags |= 2048, Hr(
      9,
      { destroy: void 0 },
      ww.bind(null, s, l),
      null
    )), [r, c, e];
  }
  function ww(e, t) {
    e.action = t;
  }
  function Ym(e) {
    var t = Kt(), l = St;
    if (l !== null)
      return Pm(t, l, e);
    Kt(), t = t.memoizedState, l = Kt();
    var r = l.queue.dispatch;
    return l.memoizedState = e, [t, r, !1];
  }
  function Hr(e, t, l, r) {
    return e = { tag: e, create: l, deps: r, inst: t, next: null }, t = Xe.updateQueue, t === null && (t = ls(), Xe.updateQueue = t), l = t.lastEffect, l === null ? t.lastEffect = e.next = e : (r = l.next, l.next = e, e.next = r, t.lastEffect = e), e;
  }
  function Gm() {
    return Kt().memoizedState;
  }
  function as(e, t, l, r) {
    var s = yn();
    Xe.flags |= e, s.memoizedState = Hr(
      1 | t,
      { destroy: void 0 },
      l,
      r === void 0 ? null : r
    );
  }
  function is(e, t, l, r) {
    var s = Kt();
    r = r === void 0 ? null : r;
    var c = s.memoizedState.inst;
    St !== null && r !== null && of(r, St.memoizedState.deps) ? s.memoizedState = Hr(t, c, l, r) : (Xe.flags |= e, s.memoizedState = Hr(
      1 | t,
      c,
      l,
      r
    ));
  }
  function qm(e, t) {
    as(8390656, 8, e, t);
  }
  function mf(e, t) {
    is(2048, 8, e, t);
  }
  function Ew(e) {
    Xe.flags |= 4;
    var t = Xe.updateQueue;
    if (t === null)
      t = ls(), Xe.updateQueue = t, t.events = [e];
    else {
      var l = t.events;
      l === null ? t.events = [e] : l.push(e);
    }
  }
  function Xm(e) {
    var t = Kt().memoizedState;
    return Ew({ ref: t, nextImpl: e }), function() {
      if ((dt & 2) !== 0) throw Error(i(440));
      return t.impl.apply(void 0, arguments);
    };
  }
  function Fm(e, t) {
    return is(4, 2, e, t);
  }
  function Km(e, t) {
    return is(4, 4, e, t);
  }
  function Qm(e, t) {
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
  function Zm(e, t, l) {
    l = l != null ? l.concat([e]) : null, is(4, 4, Qm.bind(null, t, e), l);
  }
  function hf() {
  }
  function Jm(e, t) {
    var l = Kt();
    t = t === void 0 ? null : t;
    var r = l.memoizedState;
    return t !== null && of(t, r[1]) ? r[0] : (l.memoizedState = [e, t], e);
  }
  function $m(e, t) {
    var l = Kt();
    t = t === void 0 ? null : t;
    var r = l.memoizedState;
    if (t !== null && of(t, r[1]))
      return r[0];
    if (r = e(), Ko) {
      zt(!0);
      try {
        e();
      } finally {
        zt(!1);
      }
    }
    return l.memoizedState = [r, t], r;
  }
  function yf(e, t, l) {
    return l === void 0 || (Rl & 1073741824) !== 0 && (at & 261930) === 0 ? e.memoizedState = t : (e.memoizedState = l, e = Wh(), Xe.lanes |= e, co |= e, l);
  }
  function Wm(e, t, l, r) {
    return Dn(l, t) ? l : jr.current !== null ? (e = yf(e, l, r), Dn(e, t) || (Jt = !0), e) : (Rl & 42) === 0 || (Rl & 1073741824) !== 0 && (at & 261930) === 0 ? (Jt = !0, e.memoizedState = l) : (e = Wh(), Xe.lanes |= e, co |= e, t);
  }
  function eh(e, t, l, r, s) {
    var c = Y.p;
    Y.p = c !== 0 && 8 > c ? c : 8;
    var h = H.T, T = {};
    H.T = T, xf(e, !1, t, l);
    try {
      var I = s(), W = H.S;
      if (W !== null && W(T, I), I !== null && typeof I == "object" && typeof I.then == "function") {
        var ce = vw(
          I,
          r
        );
        Da(
          e,
          t,
          ce,
          Un(e)
        );
      } else
        Da(
          e,
          t,
          r,
          Un(e)
        );
    } catch (de) {
      Da(
        e,
        t,
        { then: function() {
        }, status: "rejected", reason: de },
        Un()
      );
    } finally {
      Y.p = c, h !== null && T.types !== null && (h.types = T.types), H.T = h;
    }
  }
  function Tw() {
  }
  function vf(e, t, l, r) {
    if (e.tag !== 5) throw Error(i(476));
    var s = th(e).queue;
    eh(
      e,
      s,
      t,
      V,
      l === null ? Tw : function() {
        return nh(e), l(r);
      }
    );
  }
  function th(e) {
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
  function nh(e) {
    var t = th(e);
    t.next === null && (t = e.alternate.memoizedState), Da(
      e,
      t.next.queue,
      {},
      Un()
    );
  }
  function bf() {
    return fn(Ka);
  }
  function lh() {
    return Kt().memoizedState;
  }
  function oh() {
    return Kt().memoizedState;
  }
  function Rw(e) {
    for (var t = e.return; t !== null; ) {
      switch (t.tag) {
        case 24:
        case 3:
          var l = Un();
          e = lo(l);
          var r = oo(t, e, l);
          r !== null && (On(r, t, l), Ca(r, t, l)), t = { cache: Fu() }, e.payload = t;
          return;
      }
      t = t.return;
    }
  }
  function Cw(e, t, l) {
    var r = Un();
    l = {
      lane: r,
      revertLane: 0,
      gesture: null,
      action: l,
      hasEagerState: !1,
      eagerState: null,
      next: null
    }, ss(e) ? ah(t, l) : (l = Hu(e, t, l, r), l !== null && (On(l, e, r), ih(l, t, r)));
  }
  function rh(e, t, l) {
    var r = Un();
    Da(e, t, l, r);
  }
  function Da(e, t, l, r) {
    var s = {
      lane: r,
      revertLane: 0,
      gesture: null,
      action: l,
      hasEagerState: !1,
      eagerState: null,
      next: null
    };
    if (ss(e)) ah(t, s);
    else {
      var c = e.alternate;
      if (e.lanes === 0 && (c === null || c.lanes === 0) && (c = t.lastRenderedReducer, c !== null))
        try {
          var h = t.lastRenderedState, T = c(h, l);
          if (s.hasEagerState = !0, s.eagerState = T, Dn(T, h))
            return Pi(e, t, s, 0), Ot === null && Vi(), !1;
        } catch {
        }
      if (l = Hu(e, t, s, r), l !== null)
        return On(l, e, r), ih(l, t, r), !0;
    }
    return !1;
  }
  function xf(e, t, l, r) {
    if (r = {
      lane: 2,
      revertLane: $f(),
      gesture: null,
      action: r,
      hasEagerState: !1,
      eagerState: null,
      next: null
    }, ss(e)) {
      if (t) throw Error(i(479));
    } else
      t = Hu(
        e,
        l,
        r,
        2
      ), t !== null && On(t, e, 2);
  }
  function ss(e) {
    var t = e.alternate;
    return e === Xe || t !== null && t === Xe;
  }
  function ah(e, t) {
    kr = ts = !0;
    var l = e.pending;
    l === null ? t.next = t : (t.next = l.next, l.next = t), e.pending = t;
  }
  function ih(e, t, l) {
    if ((l & 4194048) !== 0) {
      var r = t.lanes;
      r &= e.pendingLanes, l |= r, t.lanes = l, tl(e, l);
    }
  }
  var Na = {
    readContext: fn,
    use: os,
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
  Na.useEffectEvent = Bt;
  var sh = {
    readContext: fn,
    use: os,
    useCallback: function(e, t) {
      return yn().memoizedState = [
        e,
        t === void 0 ? null : t
      ], e;
    },
    useContext: fn,
    useEffect: qm,
    useImperativeHandle: function(e, t, l) {
      l = l != null ? l.concat([e]) : null, as(
        4194308,
        4,
        Qm.bind(null, t, e),
        l
      );
    },
    useLayoutEffect: function(e, t) {
      return as(4194308, 4, e, t);
    },
    useInsertionEffect: function(e, t) {
      as(4, 2, e, t);
    },
    useMemo: function(e, t) {
      var l = yn();
      t = t === void 0 ? null : t;
      var r = e();
      if (Ko) {
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
        if (Ko) {
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
      }, r.queue = e, e = e.dispatch = Cw.bind(
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
      e = pf(e);
      var t = e.queue, l = rh.bind(null, Xe, t);
      return t.dispatch = l, [e.memoizedState, l];
    },
    useDebugValue: hf,
    useDeferredValue: function(e, t) {
      var l = yn();
      return yf(l, e, t);
    },
    useTransition: function() {
      var e = pf(!1);
      return e = eh.bind(
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
        if (l = t(), Ot === null)
          throw Error(i(349));
        (at & 127) !== 0 || Am(r, t, l);
      }
      s.memoizedState = l;
      var c = { value: l, getSnapshot: t };
      return s.queue = c, qm(Dm.bind(null, r, c, e), [
        e
      ]), r.flags |= 2048, Hr(
        9,
        { destroy: void 0 },
        zm.bind(
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
      var e = yn(), t = Ot.identifierPrefix;
      if (st) {
        var l = il, r = al;
        l = (r & ~(1 << 32 - mt(r) - 1)).toString(32) + l, t = "_" + t + "R_" + l, l = ns++, 0 < l && (t += "H" + l.toString(32)), t += "_";
      } else
        l = bw++, t = "_" + t + "r_" + l.toString(32) + "_";
      return e.memoizedState = t;
    },
    useHostTransitionStatus: bf,
    useFormState: Bm,
    useActionState: Bm,
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
      return t.queue = l, t = xf.bind(
        null,
        Xe,
        !0,
        l
      ), l.dispatch = t, [e, t];
    },
    useMemoCache: uf,
    useCacheRefresh: function() {
      return yn().memoizedState = Rw.bind(
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
  }, Sf = {
    readContext: fn,
    use: os,
    useCallback: Jm,
    useContext: fn,
    useEffect: mf,
    useImperativeHandle: Zm,
    useInsertionEffect: Fm,
    useLayoutEffect: Km,
    useMemo: $m,
    useReducer: rs,
    useRef: Gm,
    useState: function() {
      return rs(Cl);
    },
    useDebugValue: hf,
    useDeferredValue: function(e, t) {
      var l = Kt();
      return Wm(
        l,
        St.memoizedState,
        e,
        t
      );
    },
    useTransition: function() {
      var e = rs(Cl)[0], t = Kt().memoizedState;
      return [
        typeof e == "boolean" ? e : za(e),
        t
      ];
    },
    useSyncExternalStore: Mm,
    useId: lh,
    useHostTransitionStatus: bf,
    useFormState: Vm,
    useActionState: Vm,
    useOptimistic: function(e, t) {
      var l = Kt();
      return km(l, St, e, t);
    },
    useMemoCache: uf,
    useCacheRefresh: oh
  };
  Sf.useEffectEvent = Xm;
  var ch = {
    readContext: fn,
    use: os,
    useCallback: Jm,
    useContext: fn,
    useEffect: mf,
    useImperativeHandle: Zm,
    useInsertionEffect: Fm,
    useLayoutEffect: Km,
    useMemo: $m,
    useReducer: df,
    useRef: Gm,
    useState: function() {
      return df(Cl);
    },
    useDebugValue: hf,
    useDeferredValue: function(e, t) {
      var l = Kt();
      return St === null ? yf(l, e, t) : Wm(
        l,
        St.memoizedState,
        e,
        t
      );
    },
    useTransition: function() {
      var e = df(Cl)[0], t = Kt().memoizedState;
      return [
        typeof e == "boolean" ? e : za(e),
        t
      ];
    },
    useSyncExternalStore: Mm,
    useId: lh,
    useHostTransitionStatus: bf,
    useFormState: Ym,
    useActionState: Ym,
    useOptimistic: function(e, t) {
      var l = Kt();
      return St !== null ? km(l, St, e, t) : (l.baseState = e, [e, l.queue.dispatch]);
    },
    useMemoCache: uf,
    useCacheRefresh: oh
  };
  ch.useEffectEvent = Xm;
  function wf(e, t, l, r) {
    t = e.memoizedState, l = l(r, t), l = l == null ? t : b({}, t, l), e.memoizedState = l, e.lanes === 0 && (e.updateQueue.baseState = l);
  }
  var Ef = {
    enqueueSetState: function(e, t, l) {
      e = e._reactInternals;
      var r = Un(), s = lo(r);
      s.payload = t, l != null && (s.callback = l), t = oo(e, s, r), t !== null && (On(t, e, r), Ca(t, e, r));
    },
    enqueueReplaceState: function(e, t, l) {
      e = e._reactInternals;
      var r = Un(), s = lo(r);
      s.tag = 1, s.payload = t, l != null && (s.callback = l), t = oo(e, s, r), t !== null && (On(t, e, r), Ca(t, e, r));
    },
    enqueueForceUpdate: function(e, t) {
      e = e._reactInternals;
      var l = Un(), r = lo(l);
      r.tag = 2, t != null && (r.callback = t), t = oo(e, r, l), t !== null && (On(t, e, l), Ca(t, e, l));
    }
  };
  function uh(e, t, l, r, s, c, h) {
    return e = e.stateNode, typeof e.shouldComponentUpdate == "function" ? e.shouldComponentUpdate(r, c, h) : t.prototype && t.prototype.isPureReactComponent ? !va(l, r) || !va(s, c) : !0;
  }
  function fh(e, t, l, r) {
    e = t.state, typeof t.componentWillReceiveProps == "function" && t.componentWillReceiveProps(l, r), typeof t.UNSAFE_componentWillReceiveProps == "function" && t.UNSAFE_componentWillReceiveProps(l, r), t.state !== e && Ef.enqueueReplaceState(t, t.state, null);
  }
  function Qo(e, t) {
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
  function dh(e) {
    Bi(e);
  }
  function ph(e) {
    console.error(e);
  }
  function gh(e) {
    Bi(e);
  }
  function cs(e, t) {
    try {
      var l = e.onUncaughtError;
      l(t.value, { componentStack: t.stack });
    } catch (r) {
      setTimeout(function() {
        throw r;
      });
    }
  }
  function mh(e, t, l) {
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
  function Tf(e, t, l) {
    return l = lo(l), l.tag = 3, l.payload = { element: null }, l.callback = function() {
      cs(e, t);
    }, l;
  }
  function hh(e) {
    return e = lo(e), e.tag = 3, e;
  }
  function yh(e, t, l, r) {
    var s = l.type.getDerivedStateFromError;
    if (typeof s == "function") {
      var c = r.value;
      e.payload = function() {
        return s(c);
      }, e.callback = function() {
        mh(t, l, r);
      };
    }
    var h = l.stateNode;
    h !== null && typeof h.componentDidCatch == "function" && (e.callback = function() {
      mh(t, l, r), typeof s != "function" && (uo === null ? uo = /* @__PURE__ */ new Set([this]) : uo.add(this));
      var T = r.stack;
      this.componentDidCatch(r.value, {
        componentStack: T !== null ? T : ""
      });
    });
  }
  function Ow(e, t, l, r, s) {
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
            return Zn === null ? Ss() : l.alternate === null && Vt === 0 && (Vt = 3), l.flags &= -257, l.flags |= 65536, l.lanes = s, r === Zi ? l.flags |= 16384 : (t = l.updateQueue, t === null ? l.updateQueue = /* @__PURE__ */ new Set([r]) : t.add(r), Qf(e, r, s)), !1;
          case 22:
            return l.flags |= 65536, r === Zi ? l.flags |= 16384 : (t = l.updateQueue, t === null ? (t = {
              transitions: null,
              markerInstances: null,
              retryQueue: /* @__PURE__ */ new Set([r])
            }, l.updateQueue = t) : (l = t.retryQueue, l === null ? t.retryQueue = /* @__PURE__ */ new Set([r]) : l.add(r)), Qf(e, r, s)), !1;
        }
        throw Error(i(435, l.tag));
      }
      return Qf(e, r, s), Ss(), !1;
    }
    if (st)
      return t = jn.current, t !== null ? ((t.flags & 65536) === 0 && (t.flags |= 256), t.flags |= 65536, t.lanes = s, r !== Pu && (e = Error(i(422), { cause: r }), Sa(Xn(e, l)))) : (r !== Pu && (t = Error(i(423), {
        cause: r
      }), Sa(
        Xn(t, l)
      )), e = e.current.alternate, e.flags |= 65536, s &= -s, e.lanes |= s, r = Xn(r, l), s = Tf(
        e.stateNode,
        r,
        s
      ), Wu(e, s), Vt !== 4 && (Vt = 2)), !1;
    var c = Error(i(520), { cause: r });
    if (c = Xn(c, l), Ba === null ? Ba = [c] : Ba.push(c), Vt !== 4 && (Vt = 2), t === null) return !0;
    r = Xn(r, l), l = t;
    do {
      switch (l.tag) {
        case 3:
          return l.flags |= 65536, e = s & -s, l.lanes |= e, e = Tf(l.stateNode, r, e), Wu(l, e), !1;
        case 1:
          if (t = l.type, c = l.stateNode, (l.flags & 128) === 0 && (typeof t.getDerivedStateFromError == "function" || c !== null && typeof c.componentDidCatch == "function" && (uo === null || !uo.has(c))))
            return l.flags |= 65536, s &= -s, l.lanes |= s, s = hh(s), yh(
              s,
              e,
              l,
              r
            ), Wu(l, s), !1;
      }
      l = l.return;
    } while (l !== null);
    return !1;
  }
  var Rf = Error(i(461)), Jt = !1;
  function dn(e, t, l, r) {
    t.child = e === null ? Sm(t, null, l, r) : Fo(
      t,
      e.child,
      l,
      r
    );
  }
  function vh(e, t, l, r, s) {
    l = l.render;
    var c = t.ref;
    if ("ref" in r) {
      var h = {};
      for (var T in r)
        T !== "ref" && (h[T] = r[T]);
    } else h = r;
    return Yo(t), r = rf(
      e,
      t,
      l,
      h,
      c,
      s
    ), T = af(), e !== null && !Jt ? (sf(e, t, s), Ol(e, t, s)) : (st && T && Bu(t), t.flags |= 1, dn(e, t, r, s), t.child);
  }
  function bh(e, t, l, r, s) {
    if (e === null) {
      var c = l.type;
      return typeof c == "function" && !Uu(c) && c.defaultProps === void 0 && l.compare === null ? (t.tag = 15, t.type = c, xh(
        e,
        t,
        c,
        r,
        s
      )) : (e = Gi(
        l.type,
        null,
        r,
        t,
        t.mode,
        s
      ), e.ref = t.ref, e.return = t, t.child = e);
    }
    if (c = e.child, !jf(e, s)) {
      var h = c.memoizedProps;
      if (l = l.compare, l = l !== null ? l : va, l(h, r) && e.ref === t.ref)
        return Ol(e, t, s);
    }
    return t.flags |= 1, e = Sl(c, r), e.ref = t.ref, e.return = t, t.child = e;
  }
  function xh(e, t, l, r, s) {
    if (e !== null) {
      var c = e.memoizedProps;
      if (va(c, r) && e.ref === t.ref)
        if (Jt = !1, t.pendingProps = r = c, jf(e, s))
          (e.flags & 131072) !== 0 && (Jt = !0);
        else
          return t.lanes = e.lanes, Ol(e, t, s);
    }
    return Cf(
      e,
      t,
      l,
      r,
      s
    );
  }
  function Sh(e, t, l, r) {
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
        return wh(
          e,
          t,
          c,
          l,
          r
        );
      }
      if ((l & 536870912) !== 0)
        t.memoizedState = { baseLanes: 0, cachePool: null }, e !== null && Ki(
          t,
          c !== null ? c.cachePool : null
        ), c !== null ? Tm(t, c) : tf(), Rm(t);
      else
        return r = t.lanes = 536870912, wh(
          e,
          t,
          c !== null ? c.baseLanes | l : l,
          l,
          r
        );
    } else
      c !== null ? (Ki(t, c.cachePool), Tm(t, c), ao(), t.memoizedState = null) : (e !== null && Ki(t, null), tf(), ao());
    return dn(e, t, s, l), t.child;
  }
  function ja(e, t) {
    return e !== null && e.tag === 22 || t.stateNode !== null || (t.stateNode = {
      _visibility: 1,
      _pendingMarkers: null,
      _retryCache: null,
      _transitions: null
    }), t.sibling;
  }
  function wh(e, t, l, r, s) {
    var c = Qu();
    return c = c === null ? null : { parent: Qt._currentValue, pool: c }, t.memoizedState = {
      baseLanes: l,
      cachePool: c
    }, e !== null && Ki(t, null), tf(), Rm(t), e !== null && Mr(e, t, r, !0), t.childLanes = s, null;
  }
  function us(e, t) {
    return t = ds(
      { mode: t.mode, children: t.children },
      e.mode
    ), t.ref = e.ref, e.child = t, t.return = e, t;
  }
  function Eh(e, t, l) {
    return Fo(t, e.child, null, l), e = us(t, t.pendingProps), e.flags |= 2, kn(t), t.memoizedState = null, e;
  }
  function Mw(e, t, l) {
    var r = t.pendingProps, s = (t.flags & 128) !== 0;
    if (t.flags &= -129, e === null) {
      if (st) {
        if (r.mode === "hidden")
          return e = us(t, r), t.lanes = 536870912, ja(null, e);
        if (lf(t), (e = kt) ? (e = _y(
          e,
          Qn
        ), e = e !== null && e.data === "&" ? e : null, e !== null && (t.memoizedState = {
          dehydrated: e,
          treeContext: $l !== null ? { id: al, overflow: il } : null,
          retryLane: 536870912,
          hydrationErrors: null
        }, l = am(e), l.return = t, t.child = l, un = t, kt = null)) : e = null, e === null) throw eo(t);
        return t.lanes = 536870912, null;
      }
      return us(t, r);
    }
    var c = e.memoizedState;
    if (c !== null) {
      var h = c.dehydrated;
      if (lf(t), s)
        if (t.flags & 256)
          t.flags &= -257, t = Eh(
            e,
            t,
            l
          );
        else if (t.memoizedState !== null)
          t.child = e.child, t.flags |= 128, t = null;
        else throw Error(i(558));
      else if (Jt || Mr(e, t, l, !1), s = (l & e.childLanes) !== 0, Jt || s) {
        if (r = Ot, r !== null && (h = yl(r, l), h !== 0 && h !== c.retryLane))
          throw c.retryLane = h, Io(e, h), On(r, e, h), Rf;
        Ss(), t = Eh(
          e,
          t,
          l
        );
      } else
        e = c.treeContext, kt = Jn(h.nextSibling), un = t, st = !0, Wl = null, Qn = !1, e !== null && cm(t, e), t = us(t, r), t.flags |= 4096;
      return t;
    }
    return e = Sl(e.child, {
      mode: r.mode,
      children: r.children
    }), e.ref = t.ref, t.child = e, e.return = t, e;
  }
  function fs(e, t) {
    var l = t.ref;
    if (l === null)
      e !== null && e.ref !== null && (t.flags |= 4194816);
    else {
      if (typeof l != "function" && typeof l != "object")
        throw Error(i(284));
      (e === null || e.ref !== l) && (t.flags |= 4194816);
    }
  }
  function Cf(e, t, l, r, s) {
    return Yo(t), l = rf(
      e,
      t,
      l,
      r,
      void 0,
      s
    ), r = af(), e !== null && !Jt ? (sf(e, t, s), Ol(e, t, s)) : (st && r && Bu(t), t.flags |= 1, dn(e, t, l, s), t.child);
  }
  function Th(e, t, l, r, s, c) {
    return Yo(t), t.updateQueue = null, l = Om(
      t,
      r,
      l,
      s
    ), Cm(e), r = af(), e !== null && !Jt ? (sf(e, t, c), Ol(e, t, c)) : (st && r && Bu(t), t.flags |= 1, dn(e, t, l, c), t.child);
  }
  function Rh(e, t, l, r, s) {
    if (Yo(t), t.stateNode === null) {
      var c = Tr, h = l.contextType;
      typeof h == "object" && h !== null && (c = fn(h)), c = new l(r, c), t.memoizedState = c.state !== null && c.state !== void 0 ? c.state : null, c.updater = Ef, t.stateNode = c, c._reactInternals = t, c = t.stateNode, c.props = r, c.state = t.memoizedState, c.refs = {}, Ju(t), h = l.contextType, c.context = typeof h == "object" && h !== null ? fn(h) : Tr, c.state = t.memoizedState, h = l.getDerivedStateFromProps, typeof h == "function" && (wf(
        t,
        l,
        h,
        r
      ), c.state = t.memoizedState), typeof l.getDerivedStateFromProps == "function" || typeof c.getSnapshotBeforeUpdate == "function" || typeof c.UNSAFE_componentWillMount != "function" && typeof c.componentWillMount != "function" || (h = c.state, typeof c.componentWillMount == "function" && c.componentWillMount(), typeof c.UNSAFE_componentWillMount == "function" && c.UNSAFE_componentWillMount(), h !== c.state && Ef.enqueueReplaceState(c, c.state, null), Ma(t, r, c, s), Oa(), c.state = t.memoizedState), typeof c.componentDidMount == "function" && (t.flags |= 4194308), r = !0;
    } else if (e === null) {
      c = t.stateNode;
      var T = t.memoizedProps, I = Qo(l, T);
      c.props = I;
      var W = c.context, ce = l.contextType;
      h = Tr, typeof ce == "object" && ce !== null && (h = fn(ce));
      var de = l.getDerivedStateFromProps;
      ce = typeof de == "function" || typeof c.getSnapshotBeforeUpdate == "function", T = t.pendingProps !== T, ce || typeof c.UNSAFE_componentWillReceiveProps != "function" && typeof c.componentWillReceiveProps != "function" || (T || W !== h) && fh(
        t,
        c,
        r,
        h
      ), no = !1;
      var te = t.memoizedState;
      c.state = te, Ma(t, r, c, s), Oa(), W = t.memoizedState, T || te !== W || no ? (typeof de == "function" && (wf(
        t,
        l,
        de,
        r
      ), W = t.memoizedState), (I = no || uh(
        t,
        l,
        I,
        r,
        te,
        W,
        h
      )) ? (ce || typeof c.UNSAFE_componentWillMount != "function" && typeof c.componentWillMount != "function" || (typeof c.componentWillMount == "function" && c.componentWillMount(), typeof c.UNSAFE_componentWillMount == "function" && c.UNSAFE_componentWillMount()), typeof c.componentDidMount == "function" && (t.flags |= 4194308)) : (typeof c.componentDidMount == "function" && (t.flags |= 4194308), t.memoizedProps = r, t.memoizedState = W), c.props = r, c.state = W, c.context = h, r = I) : (typeof c.componentDidMount == "function" && (t.flags |= 4194308), r = !1);
    } else {
      c = t.stateNode, $u(e, t), h = t.memoizedProps, ce = Qo(l, h), c.props = ce, de = t.pendingProps, te = c.context, W = l.contextType, I = Tr, typeof W == "object" && W !== null && (I = fn(W)), T = l.getDerivedStateFromProps, (W = typeof T == "function" || typeof c.getSnapshotBeforeUpdate == "function") || typeof c.UNSAFE_componentWillReceiveProps != "function" && typeof c.componentWillReceiveProps != "function" || (h !== de || te !== I) && fh(
        t,
        c,
        r,
        I
      ), no = !1, te = t.memoizedState, c.state = te, Ma(t, r, c, s), Oa();
      var le = t.memoizedState;
      h !== de || te !== le || no || e !== null && e.dependencies !== null && Xi(e.dependencies) ? (typeof T == "function" && (wf(
        t,
        l,
        T,
        r
      ), le = t.memoizedState), (ce = no || uh(
        t,
        l,
        ce,
        r,
        te,
        le,
        I
      ) || e !== null && e.dependencies !== null && Xi(e.dependencies)) ? (W || typeof c.UNSAFE_componentWillUpdate != "function" && typeof c.componentWillUpdate != "function" || (typeof c.componentWillUpdate == "function" && c.componentWillUpdate(r, le, I), typeof c.UNSAFE_componentWillUpdate == "function" && c.UNSAFE_componentWillUpdate(
        r,
        le,
        I
      )), typeof c.componentDidUpdate == "function" && (t.flags |= 4), typeof c.getSnapshotBeforeUpdate == "function" && (t.flags |= 1024)) : (typeof c.componentDidUpdate != "function" || h === e.memoizedProps && te === e.memoizedState || (t.flags |= 4), typeof c.getSnapshotBeforeUpdate != "function" || h === e.memoizedProps && te === e.memoizedState || (t.flags |= 1024), t.memoizedProps = r, t.memoizedState = le), c.props = r, c.state = le, c.context = I, r = ce) : (typeof c.componentDidUpdate != "function" || h === e.memoizedProps && te === e.memoizedState || (t.flags |= 4), typeof c.getSnapshotBeforeUpdate != "function" || h === e.memoizedProps && te === e.memoizedState || (t.flags |= 1024), r = !1);
    }
    return c = r, fs(e, t), r = (t.flags & 128) !== 0, c || r ? (c = t.stateNode, l = r && typeof l.getDerivedStateFromError != "function" ? null : c.render(), t.flags |= 1, e !== null && r ? (t.child = Fo(
      t,
      e.child,
      null,
      s
    ), t.child = Fo(
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
  function Ch(e, t, l, r) {
    return Vo(), t.flags |= 256, dn(e, t, l, r), t.child;
  }
  var Of = {
    dehydrated: null,
    treeContext: null,
    retryLane: 0,
    hydrationErrors: null
  };
  function Mf(e) {
    return { baseLanes: e, cachePool: mm() };
  }
  function Af(e, t, l) {
    return e = e !== null ? e.childLanes & ~l : 0, t && (e |= Hn), e;
  }
  function Oh(e, t, l) {
    var r = t.pendingProps, s = !1, c = (t.flags & 128) !== 0, h;
    if ((h = c) || (h = e !== null && e.memoizedState === null ? !1 : (Ft.current & 2) !== 0), h && (s = !0, t.flags &= -129), h = (t.flags & 32) !== 0, t.flags &= -33, e === null) {
      if (st) {
        if (s ? ro(t) : ao(), (e = kt) ? (e = _y(
          e,
          Qn
        ), e = e !== null && e.data !== "&" ? e : null, e !== null && (t.memoizedState = {
          dehydrated: e,
          treeContext: $l !== null ? { id: al, overflow: il } : null,
          retryLane: 536870912,
          hydrationErrors: null
        }, l = am(e), l.return = t, t.child = l, un = t, kt = null)) : e = null, e === null) throw eo(t);
        return fd(e) ? t.lanes = 32 : t.lanes = 536870912, null;
      }
      var T = r.children;
      return r = r.fallback, s ? (ao(), s = t.mode, T = ds(
        { mode: "hidden", children: T },
        s
      ), r = Bo(
        r,
        s,
        l,
        null
      ), T.return = t, r.return = t, T.sibling = r, t.child = T, r = t.child, r.memoizedState = Mf(l), r.childLanes = Af(
        e,
        h,
        l
      ), t.memoizedState = Of, ja(null, r)) : (ro(t), zf(t, T));
    }
    var I = e.memoizedState;
    if (I !== null && (T = I.dehydrated, T !== null)) {
      if (c)
        t.flags & 256 ? (ro(t), t.flags &= -257, t = Df(
          e,
          t,
          l
        )) : t.memoizedState !== null ? (ao(), t.child = e.child, t.flags |= 128, t = null) : (ao(), T = r.fallback, s = t.mode, r = ds(
          { mode: "visible", children: r.children },
          s
        ), T = Bo(
          T,
          s,
          l,
          null
        ), T.flags |= 2, r.return = t, T.return = t, r.sibling = T, t.child = r, Fo(
          t,
          e.child,
          null,
          l
        ), r = t.child, r.memoizedState = Mf(l), r.childLanes = Af(
          e,
          h,
          l
        ), t.memoizedState = Of, t = ja(null, r));
      else if (ro(t), fd(T)) {
        if (h = T.nextSibling && T.nextSibling.dataset, h) var W = h.dgst;
        h = W, r = Error(i(419)), r.stack = "", r.digest = h, Sa({ value: r, source: null, stack: null }), t = Df(
          e,
          t,
          l
        );
      } else if (Jt || Mr(e, t, l, !1), h = (l & e.childLanes) !== 0, Jt || h) {
        if (h = Ot, h !== null && (r = yl(h, l), r !== 0 && r !== I.retryLane))
          throw I.retryLane = r, Io(e, r), On(h, e, r), Rf;
        ud(T) || Ss(), t = Df(
          e,
          t,
          l
        );
      } else
        ud(T) ? (t.flags |= 192, t.child = e.child, t = null) : (e = I.treeContext, kt = Jn(
          T.nextSibling
        ), un = t, st = !0, Wl = null, Qn = !1, e !== null && cm(t, e), t = zf(
          t,
          r.children
        ), t.flags |= 4096);
      return t;
    }
    return s ? (ao(), T = r.fallback, s = t.mode, I = e.child, W = I.sibling, r = Sl(I, {
      mode: "hidden",
      children: r.children
    }), r.subtreeFlags = I.subtreeFlags & 65011712, W !== null ? T = Sl(
      W,
      T
    ) : (T = Bo(
      T,
      s,
      l,
      null
    ), T.flags |= 2), T.return = t, r.return = t, r.sibling = T, t.child = r, ja(null, r), r = t.child, T = e.child.memoizedState, T === null ? T = Mf(l) : (s = T.cachePool, s !== null ? (I = Qt._currentValue, s = s.parent !== I ? { parent: I, pool: I } : s) : s = mm(), T = {
      baseLanes: T.baseLanes | l,
      cachePool: s
    }), r.memoizedState = T, r.childLanes = Af(
      e,
      h,
      l
    ), t.memoizedState = Of, ja(e.child, r)) : (ro(t), l = e.child, e = l.sibling, l = Sl(l, {
      mode: "visible",
      children: r.children
    }), l.return = t, l.sibling = null, e !== null && (h = t.deletions, h === null ? (t.deletions = [e], t.flags |= 16) : h.push(e)), t.child = l, t.memoizedState = null, l);
  }
  function zf(e, t) {
    return t = ds(
      { mode: "visible", children: t },
      e.mode
    ), t.return = e, e.child = t;
  }
  function ds(e, t) {
    return e = Nn(22, e, null, t), e.lanes = 0, e;
  }
  function Df(e, t, l) {
    return Fo(t, e.child, null, l), e = zf(
      t,
      t.pendingProps.children
    ), e.flags |= 2, t.memoizedState = null, e;
  }
  function Mh(e, t, l) {
    e.lanes |= t;
    var r = e.alternate;
    r !== null && (r.lanes |= t), qu(e.return, t, l);
  }
  function Nf(e, t, l, r, s, c) {
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
  function Ah(e, t, l) {
    var r = t.pendingProps, s = r.revealOrder, c = r.tail;
    r = r.children;
    var h = Ft.current, T = (h & 2) !== 0;
    if (T ? (h = h & 1 | 2, t.flags |= 128) : h &= 1, ne(Ft, h), dn(e, t, r, l), r = st ? xa : 0, !T && e !== null && (e.flags & 128) !== 0)
      e: for (e = t.child; e !== null; ) {
        if (e.tag === 13)
          e.memoizedState !== null && Mh(e, l, t);
        else if (e.tag === 19)
          Mh(e, l, t);
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
          e = l.alternate, e !== null && es(e) === null && (s = l), l = l.sibling;
        l = s, l === null ? (s = t.child, t.child = null) : (s = l.sibling, l.sibling = null), Nf(
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
          if (e = s.alternate, e !== null && es(e) === null) {
            t.child = s;
            break;
          }
          e = s.sibling, s.sibling = l, l = s, s = e;
        }
        Nf(
          t,
          !0,
          l,
          null,
          c,
          r
        );
        break;
      case "together":
        Nf(
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
    if (e !== null && (t.dependencies = e.dependencies), co |= t.lanes, (l & t.childLanes) === 0)
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
  function jf(e, t) {
    return (e.lanes & t) !== 0 ? !0 : (e = e.dependencies, !!(e !== null && Xi(e)));
  }
  function Aw(e, t, l) {
    switch (t.tag) {
      case 3:
        se(t, t.stateNode.containerInfo), to(t, Qt, e.memoizedState.cache), Vo();
        break;
      case 27:
      case 5:
        je(t);
        break;
      case 4:
        se(t, t.stateNode.containerInfo);
        break;
      case 10:
        to(
          t,
          t.type,
          t.memoizedProps.value
        );
        break;
      case 31:
        if (t.memoizedState !== null)
          return t.flags |= 128, lf(t), null;
        break;
      case 13:
        var r = t.memoizedState;
        if (r !== null)
          return r.dehydrated !== null ? (ro(t), t.flags |= 128, null) : (l & t.child.childLanes) !== 0 ? Oh(e, t, l) : (ro(t), e = Ol(
            e,
            t,
            l
          ), e !== null ? e.sibling : null);
        ro(t);
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
            return Ah(
              e,
              t,
              l
            );
          t.flags |= 128;
        }
        if (s = t.memoizedState, s !== null && (s.rendering = null, s.tail = null, s.lastEffect = null), ne(Ft, Ft.current), r) break;
        return null;
      case 22:
        return t.lanes = 0, Sh(
          e,
          t,
          l,
          t.pendingProps
        );
      case 24:
        to(t, Qt, e.memoizedState.cache);
    }
    return Ol(e, t, l);
  }
  function zh(e, t, l) {
    if (e !== null)
      if (e.memoizedProps !== t.pendingProps)
        Jt = !0;
      else {
        if (!jf(e, l) && (t.flags & 128) === 0)
          return Jt = !1, Aw(
            e,
            t,
            l
          );
        Jt = (e.flags & 131072) !== 0;
      }
    else
      Jt = !1, st && (t.flags & 1048576) !== 0 && sm(t, xa, t.index);
    switch (t.lanes = 0, t.tag) {
      case 16:
        e: {
          var r = t.pendingProps;
          if (e = qo(t.elementType), t.type = e, typeof e == "function")
            Uu(e) ? (r = Qo(e, r), t.tag = 1, t = Rh(
              null,
              t,
              e,
              r,
              l
            )) : (t.tag = 0, t = Cf(
              null,
              t,
              e,
              r,
              l
            ));
          else {
            if (e != null) {
              var s = e.$$typeof;
              if (s === D) {
                t.tag = 11, t = vh(
                  null,
                  t,
                  e,
                  r,
                  l
                );
                break e;
              } else if (s === U) {
                t.tag = 14, t = bh(
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
        return Cf(
          e,
          t,
          t.type,
          t.pendingProps,
          l
        );
      case 1:
        return r = t.type, s = Qo(
          r,
          t.pendingProps
        ), Rh(
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
          s = c.element, $u(e, t), Ma(t, r, null, l);
          var h = t.memoizedState;
          if (r = h.cache, to(t, Qt, r), r !== c.cache && Xu(
            t,
            [Qt],
            l,
            !0
          ), Oa(), r = h.element, c.isDehydrated)
            if (c = {
              element: r,
              isDehydrated: !1,
              cache: h.cache
            }, t.updateQueue.baseState = c, t.memoizedState = c, t.flags & 256) {
              t = Ch(
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
              ), Sa(s), t = Ch(
                e,
                t,
                r,
                l
              );
              break e;
            } else
              for (e = t.stateNode.containerInfo, e.nodeType === 9 ? e = e.body : e = e.nodeName === "HTML" ? e.ownerDocument.body : e, kt = Jn(e.firstChild), un = t, st = !0, Wl = null, Qn = !0, l = Sm(
                t,
                null,
                r,
                l
              ), t.child = l; l; )
                l.flags = l.flags & -3 | 4096, l = l.sibling;
          else {
            if (Vo(), r === s) {
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
        return fs(e, t), e === null ? (l = Vy(
          t.type,
          null,
          t.pendingProps,
          null
        )) ? t.memoizedState = l : st || (l = t.type, e = t.pendingProps, r = Ms(
          ie.current
        ).createElement(l), r[Ct] = t, r[cn] = e, pn(r, l, e), ln(r), t.stateNode = r) : t.memoizedState = Vy(
          t.type,
          e.memoizedProps,
          t.pendingProps,
          e.memoizedState
        ), null;
      case 27:
        return je(t), e === null && st && (r = t.stateNode = Ly(
          t.type,
          t.pendingProps,
          ie.current
        ), un = t, Qn = !0, s = kt, mo(t.type) ? (dd = s, kt = Jn(r.firstChild)) : kt = s), dn(
          e,
          t,
          t.pendingProps.children,
          l
        ), fs(e, t), e === null && (t.flags |= 4194304), t.child;
      case 5:
        return e === null && st && ((s = r = kt) && (r = rE(
          r,
          t.type,
          t.pendingProps,
          Qn
        ), r !== null ? (t.stateNode = r, un = t, kt = Jn(r.firstChild), Qn = !1, s = !0) : s = !1), s || eo(t)), je(t), s = t.type, c = t.pendingProps, h = e !== null ? e.memoizedProps : null, r = c.children, id(s, c) ? r = null : h !== null && id(s, h) && (t.flags |= 32), t.memoizedState !== null && (s = rf(
          e,
          t,
          xw,
          null,
          null,
          l
        ), Ka._currentValue = s), fs(e, t), dn(e, t, r, l), t.child;
      case 6:
        return e === null && st && ((e = l = kt) && (l = aE(
          l,
          t.pendingProps,
          Qn
        ), l !== null ? (t.stateNode = l, un = t, kt = null, e = !0) : e = !1), e || eo(t)), null;
      case 13:
        return Oh(e, t, l);
      case 4:
        return se(
          t,
          t.stateNode.containerInfo
        ), r = t.pendingProps, e === null ? t.child = Fo(
          t,
          null,
          r,
          l
        ) : dn(e, t, r, l), t.child;
      case 11:
        return vh(
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
        return r = t.pendingProps, to(t, t.type, r.value), dn(e, t, r.children, l), t.child;
      case 9:
        return s = t.type._context, r = t.pendingProps.children, Yo(t), s = fn(s), r = r(s), t.flags |= 1, dn(e, t, r, l), t.child;
      case 14:
        return bh(
          e,
          t,
          t.type,
          t.pendingProps,
          l
        );
      case 15:
        return xh(
          e,
          t,
          t.type,
          t.pendingProps,
          l
        );
      case 19:
        return Ah(e, t, l);
      case 31:
        return Mw(e, t, l);
      case 22:
        return Sh(
          e,
          t,
          l,
          t.pendingProps
        );
      case 24:
        return Yo(t), r = fn(Qt), e === null ? (s = Qu(), s === null && (s = Ot, c = Fu(), s.pooledCache = c, c.refCount++, c !== null && (s.pooledCacheLanes |= l), s = c), t.memoizedState = { parent: r, cache: s }, Ju(t), to(t, Qt, s)) : ((e.lanes & l) !== 0 && ($u(e, t), Ma(t, null, null, l), Oa()), s = e.memoizedState, c = t.memoizedState, s.parent !== r ? (s = { parent: r, cache: r }, t.memoizedState = s, t.lanes === 0 && (t.memoizedState = t.updateQueue.baseState = s), to(t, Qt, r)) : (r = c.cache, to(t, Qt, r), r !== s.cache && Xu(
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
  function Ml(e) {
    e.flags |= 4;
  }
  function kf(e, t, l, r, s) {
    if ((t = (e.mode & 32) !== 0) && (t = !1), t) {
      if (e.flags |= 16777216, (s & 335544128) === s)
        if (e.stateNode.complete) e.flags |= 8192;
        else if (ly()) e.flags |= 8192;
        else
          throw Xo = Zi, Zu;
    } else e.flags &= -16777217;
  }
  function Dh(e, t) {
    if (t.type !== "stylesheet" || (t.state.loading & 4) !== 0)
      e.flags &= -16777217;
    else if (e.flags |= 16777216, !Xy(t))
      if (ly()) e.flags |= 8192;
      else
        throw Xo = Zi, Zu;
  }
  function ps(e, t) {
    t !== null && (e.flags |= 4), e.flags & 16384 && (t = e.tag !== 22 ? zn() : 536870912, e.lanes |= t, Br |= t);
  }
  function ka(e, t) {
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
  function zw(e, t, l) {
    var r = t.pendingProps;
    switch (Vu(t), t.tag) {
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
        return l = t.stateNode, r = null, e !== null && (r = e.memoizedState.cache), t.memoizedState.cache !== r && (t.flags |= 2048), Tl(Qt), ge(), l.pendingContext && (l.context = l.pendingContext, l.pendingContext = null), (e === null || e.child === null) && (Or(t) ? Ml(t) : e === null || e.memoizedState.isDehydrated && (t.flags & 256) === 0 || (t.flags |= 1024, Yu())), _t(t), null;
      case 26:
        var s = t.type, c = t.memoizedState;
        return e === null ? (Ml(t), c !== null ? (_t(t), Dh(t, c)) : (_t(t), kf(
          t,
          s,
          null,
          r,
          l
        ))) : c ? c !== e.memoizedState ? (Ml(t), _t(t), Dh(t, c)) : (_t(t), t.flags &= -16777217) : (e = e.memoizedProps, e !== r && Ml(t), _t(t), kf(
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
          e = J.current, Or(t) ? um(t) : (e = Ly(s, r, l), t.stateNode = e, Ml(t));
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
          if (c = J.current, Or(t))
            um(t);
          else {
            var h = Ms(
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
            c[Ct] = t, c[cn] = r;
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
        return _t(t), kf(
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
            e[Ct] = t, e = !!(e.nodeValue === l || r !== null && r.suppressHydrationWarning === !0 || Oy(e.nodeValue, l)), e || eo(t, !0);
          } else
            e = Ms(e).createTextNode(
              r
            ), e[Ct] = t, t.stateNode = e;
        }
        return _t(t), null;
      case 31:
        if (l = t.memoizedState, e === null || e.memoizedState !== null) {
          if (r = Or(t), l !== null) {
            if (e === null) {
              if (!r) throw Error(i(318));
              if (e = t.memoizedState, e = e !== null ? e.dehydrated : null, !e) throw Error(i(557));
              e[Ct] = t;
            } else
              Vo(), (t.flags & 128) === 0 && (t.memoizedState = null), t.flags |= 4;
            _t(t), e = !1;
          } else
            l = Yu(), e !== null && e.memoizedState !== null && (e.memoizedState.hydrationErrors = l), e = !0;
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
              s[Ct] = t;
            } else
              Vo(), (t.flags & 128) === 0 && (t.memoizedState = null), t.flags |= 4;
            _t(t), s = !1;
          } else
            s = Yu(), e !== null && e.memoizedState !== null && (e.memoizedState.hydrationErrors = s), s = !0;
          if (!s)
            return t.flags & 256 ? (kn(t), t) : (kn(t), null);
        }
        return kn(t), (t.flags & 128) !== 0 ? (t.lanes = l, t) : (l = r !== null, e = e !== null && e.memoizedState !== null, l && (r = t.child, s = null, r.alternate !== null && r.alternate.memoizedState !== null && r.alternate.memoizedState.cachePool !== null && (s = r.alternate.memoizedState.cachePool.pool), c = null, r.memoizedState !== null && r.memoizedState.cachePool !== null && (c = r.memoizedState.cachePool.pool), c !== s && (r.flags |= 2048)), l !== e && l && (t.child.flags |= 8192), ps(t, t.updateQueue), _t(t), null);
      case 4:
        return ge(), e === null && nd(t.stateNode.containerInfo), _t(t), null;
      case 10:
        return Tl(t.type), _t(t), null;
      case 19:
        if (L(Ft), r = t.memoizedState, r === null) return _t(t), null;
        if (s = (t.flags & 128) !== 0, c = r.rendering, c === null)
          if (s) ka(r, !1);
          else {
            if (Vt !== 0 || e !== null && (e.flags & 128) !== 0)
              for (e = t.child; e !== null; ) {
                if (c = es(e), c !== null) {
                  for (t.flags |= 128, ka(r, !1), e = c.updateQueue, t.updateQueue = e, ps(t, e), t.subtreeFlags = 0, e = l, l = t.child; l !== null; )
                    rm(l, e), l = l.sibling;
                  return ne(
                    Ft,
                    Ft.current & 1 | 2
                  ), st && wl(t, r.treeForkCount), t.child;
                }
                e = e.sibling;
              }
            r.tail !== null && ae() > vs && (t.flags |= 128, s = !0, ka(r, !1), t.lanes = 4194304);
          }
        else {
          if (!s)
            if (e = es(c), e !== null) {
              if (t.flags |= 128, s = !0, e = e.updateQueue, t.updateQueue = e, ps(t, e), ka(r, !0), r.tail === null && r.tailMode === "hidden" && !c.alternate && !st)
                return _t(t), null;
            } else
              2 * ae() - r.renderingStartTime > vs && l !== 536870912 && (t.flags |= 128, s = !0, ka(r, !1), t.lanes = 4194304);
          r.isBackwards ? (c.sibling = t.child, t.child = c) : (e = r.last, e !== null ? e.sibling = c : t.child = c, r.last = c);
        }
        return r.tail !== null ? (e = r.tail, r.rendering = e, r.tail = e.sibling, r.renderingStartTime = ae(), e.sibling = null, l = Ft.current, ne(
          Ft,
          s ? l & 1 | 2 : l & 1
        ), st && wl(t, r.treeForkCount), e) : (_t(t), null);
      case 22:
      case 23:
        return kn(t), nf(), r = t.memoizedState !== null, e !== null ? e.memoizedState !== null !== r && (t.flags |= 8192) : r && (t.flags |= 8192), r ? (l & 536870912) !== 0 && (t.flags & 128) === 0 && (_t(t), t.subtreeFlags & 6 && (t.flags |= 8192)) : _t(t), l = t.updateQueue, l !== null && ps(t, l.retryQueue), l = null, e !== null && e.memoizedState !== null && e.memoizedState.cachePool !== null && (l = e.memoizedState.cachePool.pool), r = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (r = t.memoizedState.cachePool.pool), r !== l && (t.flags |= 2048), e !== null && L(Go), null;
      case 24:
        return l = null, e !== null && (l = e.memoizedState.cache), t.memoizedState.cache !== l && (t.flags |= 2048), Tl(Qt), _t(t), null;
      case 25:
        return null;
      case 30:
        return null;
    }
    throw Error(i(156, t.tag));
  }
  function Dw(e, t) {
    switch (Vu(t), t.tag) {
      case 1:
        return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
      case 3:
        return Tl(Qt), ge(), e = t.flags, (e & 65536) !== 0 && (e & 128) === 0 ? (t.flags = e & -65537 | 128, t) : null;
      case 26:
      case 27:
      case 5:
        return Ee(t), null;
      case 31:
        if (t.memoizedState !== null) {
          if (kn(t), t.alternate === null)
            throw Error(i(340));
          Vo();
        }
        return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
      case 13:
        if (kn(t), e = t.memoizedState, e !== null && e.dehydrated !== null) {
          if (t.alternate === null)
            throw Error(i(340));
          Vo();
        }
        return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
      case 19:
        return L(Ft), null;
      case 4:
        return ge(), null;
      case 10:
        return Tl(t.type), null;
      case 22:
      case 23:
        return kn(t), nf(), e !== null && L(Go), e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
      case 24:
        return Tl(Qt), null;
      case 25:
        return null;
      default:
        return null;
    }
  }
  function Nh(e, t) {
    switch (Vu(t), t.tag) {
      case 3:
        Tl(Qt), ge();
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
        L(Ft);
        break;
      case 10:
        Tl(t.type);
        break;
      case 22:
      case 23:
        kn(t), nf(), e !== null && L(Go);
        break;
      case 24:
        Tl(Qt);
    }
  }
  function _a(e, t) {
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
    } catch (T) {
      yt(t, t.return, T);
    }
  }
  function io(e, t, l) {
    try {
      var r = t.updateQueue, s = r !== null ? r.lastEffect : null;
      if (s !== null) {
        var c = s.next;
        r = c;
        do {
          if ((r.tag & e) === e) {
            var h = r.inst, T = h.destroy;
            if (T !== void 0) {
              h.destroy = void 0, s = t;
              var I = l, W = T;
              try {
                W();
              } catch (ce) {
                yt(
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
      yt(t, t.return, ce);
    }
  }
  function jh(e) {
    var t = e.updateQueue;
    if (t !== null) {
      var l = e.stateNode;
      try {
        Em(t, l);
      } catch (r) {
        yt(e, e.return, r);
      }
    }
  }
  function kh(e, t, l) {
    l.props = Qo(
      e.type,
      e.memoizedProps
    ), l.state = e.memoizedState;
    try {
      l.componentWillUnmount();
    } catch (r) {
      yt(e, t, r);
    }
  }
  function Ha(e, t) {
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
      yt(e, t, s);
    }
  }
  function sl(e, t) {
    var l = e.ref, r = e.refCleanup;
    if (l !== null)
      if (typeof r == "function")
        try {
          r();
        } catch (s) {
          yt(e, t, s);
        } finally {
          e.refCleanup = null, e = e.alternate, e != null && (e.refCleanup = null);
        }
      else if (typeof l == "function")
        try {
          l(null);
        } catch (s) {
          yt(e, t, s);
        }
      else l.current = null;
  }
  function _h(e) {
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
      yt(e, e.return, s);
    }
  }
  function _f(e, t, l) {
    try {
      var r = e.stateNode;
      Ww(r, e.type, l, t), r[cn] = t;
    } catch (s) {
      yt(e, e.return, s);
    }
  }
  function Hh(e) {
    return e.tag === 5 || e.tag === 3 || e.tag === 26 || e.tag === 27 && mo(e.type) || e.tag === 4;
  }
  function Hf(e) {
    e: for (; ; ) {
      for (; e.sibling === null; ) {
        if (e.return === null || Hh(e.return)) return null;
        e = e.return;
      }
      for (e.sibling.return = e.return, e = e.sibling; e.tag !== 5 && e.tag !== 6 && e.tag !== 18; ) {
        if (e.tag === 27 && mo(e.type) || e.flags & 2 || e.child === null || e.tag === 4) continue e;
        e.child.return = e, e = e.child;
      }
      if (!(e.flags & 2)) return e.stateNode;
    }
  }
  function Uf(e, t, l) {
    var r = e.tag;
    if (r === 5 || r === 6)
      e = e.stateNode, t ? (l.nodeType === 9 ? l.body : l.nodeName === "HTML" ? l.ownerDocument.body : l).insertBefore(e, t) : (t = l.nodeType === 9 ? l.body : l.nodeName === "HTML" ? l.ownerDocument.body : l, t.appendChild(e), l = l._reactRootContainer, l != null || t.onclick !== null || (t.onclick = bl));
    else if (r !== 4 && (r === 27 && mo(e.type) && (l = e.stateNode, t = null), e = e.child, e !== null))
      for (Uf(e, t, l), e = e.sibling; e !== null; )
        Uf(e, t, l), e = e.sibling;
  }
  function gs(e, t, l) {
    var r = e.tag;
    if (r === 5 || r === 6)
      e = e.stateNode, t ? l.insertBefore(e, t) : l.appendChild(e);
    else if (r !== 4 && (r === 27 && mo(e.type) && (l = e.stateNode), e = e.child, e !== null))
      for (gs(e, t, l), e = e.sibling; e !== null; )
        gs(e, t, l), e = e.sibling;
  }
  function Uh(e) {
    var t = e.stateNode, l = e.memoizedProps;
    try {
      for (var r = e.type, s = t.attributes; s.length; )
        t.removeAttributeNode(s[0]);
      pn(t, r, l), t[Ct] = e, t[cn] = l;
    } catch (c) {
      yt(e, e.return, c);
    }
  }
  var Al = !1, $t = !1, Lf = !1, Lh = typeof WeakSet == "function" ? WeakSet : Set, on = null;
  function Nw(e, t) {
    if (e = e.containerInfo, rd = _s, e = Zg(e), zu(e)) {
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
            var h = 0, T = -1, I = -1, W = 0, ce = 0, de = e, te = null;
            t: for (; ; ) {
              for (var le; de !== l || s !== 0 && de.nodeType !== 3 || (T = h + s), de !== c || r !== 0 && de.nodeType !== 3 || (I = h + r), de.nodeType === 3 && (h += de.nodeValue.length), (le = de.firstChild) !== null; )
                te = de, de = le;
              for (; ; ) {
                if (de === e) break t;
                if (te === l && ++W === s && (T = h), te === c && ++ce === r && (I = h), (le = de.nextSibling) !== null) break;
                de = te, te = de.parentNode;
              }
              de = le;
            }
            l = T === -1 || I === -1 ? null : { start: T, end: I };
          } else l = null;
        }
      l = l || { start: 0, end: 0 };
    } else l = null;
    for (ad = { focusedElem: e, selectionRange: l }, _s = !1, on = t; on !== null; )
      if (t = on, e = t.child, (t.subtreeFlags & 1028) !== 0 && e !== null)
        e.return = t, on = e;
      else
        for (; on !== null; ) {
          switch (t = on, c = t.alternate, e = t.flags, t.tag) {
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
                  var De = Qo(
                    l.type,
                    s
                  );
                  e = r.getSnapshotBeforeUpdate(
                    De,
                    c
                  ), r.__reactInternalSnapshotBeforeUpdate = e;
                } catch (Ve) {
                  yt(
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
                  cd(e);
                else if (l === 1)
                  switch (e.nodeName) {
                    case "HEAD":
                    case "HTML":
                    case "BODY":
                      cd(e);
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
            e.return = t.return, on = e;
            break;
          }
          on = t.return;
        }
  }
  function Ih(e, t, l) {
    var r = l.flags;
    switch (l.tag) {
      case 0:
      case 11:
      case 15:
        Dl(e, l), r & 4 && _a(5, l);
        break;
      case 1:
        if (Dl(e, l), r & 4)
          if (e = l.stateNode, t === null)
            try {
              e.componentDidMount();
            } catch (h) {
              yt(l, l.return, h);
            }
          else {
            var s = Qo(
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
              yt(
                l,
                l.return,
                h
              );
            }
          }
        r & 64 && jh(l), r & 512 && Ha(l, l.return);
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
            Em(e, t);
          } catch (h) {
            yt(l, l.return, h);
          }
        }
        break;
      case 27:
        t === null && r & 4 && Uh(l);
      case 26:
      case 5:
        Dl(e, l), t === null && r & 4 && _h(l), r & 512 && Ha(l, l.return);
        break;
      case 12:
        Dl(e, l);
        break;
      case 31:
        Dl(e, l), r & 4 && Ph(e, l);
        break;
      case 13:
        Dl(e, l), r & 4 && Yh(e, l), r & 64 && (e = l.memoizedState, e !== null && (e = e.dehydrated, e !== null && (l = Vw.bind(
          null,
          l
        ), iE(e, l))));
        break;
      case 22:
        if (r = l.memoizedState !== null || Al, !r) {
          t = t !== null && t.memoizedState !== null || $t, s = Al;
          var c = $t;
          Al = r, ($t = t) && !c ? Nl(
            e,
            l,
            (l.subtreeFlags & 8772) !== 0
          ) : Dl(e, l), Al = s, $t = c;
        }
        break;
      case 30:
        break;
      default:
        Dl(e, l);
    }
  }
  function Bh(e) {
    var t = e.alternate;
    t !== null && (e.alternate = null, Bh(t)), e.child = null, e.deletions = null, e.sibling = null, e.tag === 5 && (t = e.stateNode, t !== null && pu(t)), e.stateNode = null, e.return = null, e.dependencies = null, e.memoizedProps = null, e.memoizedState = null, e.pendingProps = null, e.stateNode = null, e.updateQueue = null;
  }
  var Lt = null, En = !1;
  function zl(e, t, l) {
    for (l = l.child; l !== null; )
      Vh(e, t, l), l = l.sibling;
  }
  function Vh(e, t, l) {
    if (gt && typeof gt.onCommitFiberUnmount == "function")
      try {
        gt.onCommitFiberUnmount(et, l);
      } catch {
      }
    switch (l.tag) {
      case 26:
        $t || sl(l, t), zl(
          e,
          t,
          l
        ), l.memoizedState ? l.memoizedState.count-- : l.stateNode && (l = l.stateNode, l.parentNode.removeChild(l));
        break;
      case 27:
        $t || sl(l, t);
        var r = Lt, s = En;
        mo(l.type) && (Lt = l.stateNode, En = !1), zl(
          e,
          t,
          l
        ), qa(l.stateNode), Lt = r, En = s;
        break;
      case 5:
        $t || sl(l, t);
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
              yt(
                l,
                t,
                c
              );
            }
          else
            try {
              Lt.removeChild(l.stateNode);
            } catch (c) {
              yt(
                l,
                t,
                c
              );
            }
        break;
      case 18:
        Lt !== null && (En ? (e = Lt, jy(
          e.nodeType === 9 ? e.body : e.nodeName === "HTML" ? e.ownerDocument.body : e,
          l.stateNode
        ), Kr(e)) : jy(Lt, l.stateNode));
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
        io(2, l, t), $t || io(4, l, t), zl(
          e,
          t,
          l
        );
        break;
      case 1:
        $t || (sl(l, t), r = l.stateNode, typeof r.componentWillUnmount == "function" && kh(
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
        $t = (r = $t) || l.memoizedState !== null, zl(
          e,
          t,
          l
        ), $t = r;
        break;
      default:
        zl(
          e,
          t,
          l
        );
    }
  }
  function Ph(e, t) {
    if (t.memoizedState === null && (e = t.alternate, e !== null && (e = e.memoizedState, e !== null))) {
      e = e.dehydrated;
      try {
        Kr(e);
      } catch (l) {
        yt(t, t.return, l);
      }
    }
  }
  function Yh(e, t) {
    if (t.memoizedState === null && (e = t.alternate, e !== null && (e = e.memoizedState, e !== null && (e = e.dehydrated, e !== null))))
      try {
        Kr(e);
      } catch (l) {
        yt(t, t.return, l);
      }
  }
  function jw(e) {
    switch (e.tag) {
      case 31:
      case 13:
      case 19:
        var t = e.stateNode;
        return t === null && (t = e.stateNode = new Lh()), t;
      case 22:
        return e = e.stateNode, t = e._retryCache, t === null && (t = e._retryCache = new Lh()), t;
      default:
        throw Error(i(435, e.tag));
    }
  }
  function ms(e, t) {
    var l = jw(e);
    t.forEach(function(r) {
      if (!l.has(r)) {
        l.add(r);
        var s = Pw.bind(null, e, r);
        r.then(s, s);
      }
    });
  }
  function Tn(e, t) {
    var l = t.deletions;
    if (l !== null)
      for (var r = 0; r < l.length; r++) {
        var s = l[r], c = e, h = t, T = h;
        e: for (; T !== null; ) {
          switch (T.tag) {
            case 27:
              if (mo(T.type)) {
                Lt = T.stateNode, En = !1;
                break e;
              }
              break;
            case 5:
              Lt = T.stateNode, En = !1;
              break e;
            case 3:
            case 4:
              Lt = T.stateNode.containerInfo, En = !0;
              break e;
          }
          T = T.return;
        }
        if (Lt === null) throw Error(i(160));
        Vh(c, h, s), Lt = null, En = !1, c = s.alternate, c !== null && (c.return = null), s.return = null;
      }
    if (t.subtreeFlags & 13886)
      for (t = t.child; t !== null; )
        Gh(t, e), t = t.sibling;
  }
  var ll = null;
  function Gh(e, t) {
    var l = e.alternate, r = e.flags;
    switch (e.tag) {
      case 0:
      case 11:
      case 14:
      case 15:
        Tn(t, e), Rn(e), r & 4 && (io(3, e, e.return), _a(3, e), io(5, e, e.return));
        break;
      case 1:
        Tn(t, e), Rn(e), r & 512 && ($t || l === null || sl(l, l.return)), r & 64 && Al && (e = e.updateQueue, e !== null && (r = e.callbacks, r !== null && (l = e.shared.hiddenCallbacks, e.shared.hiddenCallbacks = l === null ? r : l.concat(r))));
        break;
      case 26:
        var s = ll;
        if (Tn(t, e), Rn(e), r & 512 && ($t || l === null || sl(l, l.return)), r & 4) {
          var c = l !== null ? l.memoizedState : null;
          if (r = e.memoizedState, l === null)
            if (r === null)
              if (e.stateNode === null) {
                e: {
                  r = e.type, l = e.memoizedProps, s = s.ownerDocument || s;
                  t: switch (r) {
                    case "title":
                      c = s.getElementsByTagName("title")[0], (!c || c[ca] || c[Ct] || c.namespaceURI === "http://www.w3.org/2000/svg" || c.hasAttribute("itemprop")) && (c = s.createElement(r), s.head.insertBefore(
                        c,
                        s.querySelector("head > title")
                      )), pn(c, r, l), c[Ct] = e, ln(c), r = c;
                      break e;
                    case "link":
                      var h = Gy(
                        "link",
                        "href",
                        s
                      ).get(r + (l.href || ""));
                      if (h) {
                        for (var T = 0; T < h.length; T++)
                          if (c = h[T], c.getAttribute("href") === (l.href == null || l.href === "" ? null : l.href) && c.getAttribute("rel") === (l.rel == null ? null : l.rel) && c.getAttribute("title") === (l.title == null ? null : l.title) && c.getAttribute("crossorigin") === (l.crossOrigin == null ? null : l.crossOrigin)) {
                            h.splice(T, 1);
                            break t;
                          }
                      }
                      c = s.createElement(r), pn(c, r, l), s.head.appendChild(c);
                      break;
                    case "meta":
                      if (h = Gy(
                        "meta",
                        "content",
                        s
                      ).get(r + (l.content || ""))) {
                        for (T = 0; T < h.length; T++)
                          if (c = h[T], c.getAttribute("content") === (l.content == null ? null : "" + l.content) && c.getAttribute("name") === (l.name == null ? null : l.name) && c.getAttribute("property") === (l.property == null ? null : l.property) && c.getAttribute("http-equiv") === (l.httpEquiv == null ? null : l.httpEquiv) && c.getAttribute("charset") === (l.charSet == null ? null : l.charSet)) {
                            h.splice(T, 1);
                            break t;
                          }
                      }
                      c = s.createElement(r), pn(c, r, l), s.head.appendChild(c);
                      break;
                    default:
                      throw Error(i(468, r));
                  }
                  c[Ct] = e, ln(c), r = c;
                }
                e.stateNode = r;
              } else
                qy(
                  s,
                  e.type,
                  e.stateNode
                );
            else
              e.stateNode = Yy(
                s,
                r,
                e.memoizedProps
              );
          else
            c !== r ? (c === null ? l.stateNode !== null && (l = l.stateNode, l.parentNode.removeChild(l)) : c.count--, r === null ? qy(
              s,
              e.type,
              e.stateNode
            ) : Yy(
              s,
              r,
              e.memoizedProps
            )) : r === null && e.stateNode !== null && _f(
              e,
              e.memoizedProps,
              l.memoizedProps
            );
        }
        break;
      case 27:
        Tn(t, e), Rn(e), r & 512 && ($t || l === null || sl(l, l.return)), l !== null && r & 4 && _f(
          e,
          e.memoizedProps,
          l.memoizedProps
        );
        break;
      case 5:
        if (Tn(t, e), Rn(e), r & 512 && ($t || l === null || sl(l, l.return)), e.flags & 32) {
          s = e.stateNode;
          try {
            yr(s, "");
          } catch (De) {
            yt(e, e.return, De);
          }
        }
        r & 4 && e.stateNode != null && (s = e.memoizedProps, _f(
          e,
          s,
          l !== null ? l.memoizedProps : s
        )), r & 1024 && (Lf = !0);
        break;
      case 6:
        if (Tn(t, e), Rn(e), r & 4) {
          if (e.stateNode === null)
            throw Error(i(162));
          r = e.memoizedProps, l = e.stateNode;
          try {
            l.nodeValue = r;
          } catch (De) {
            yt(e, e.return, De);
          }
        }
        break;
      case 3:
        if (Ds = null, s = ll, ll = As(t.containerInfo), Tn(t, e), ll = s, Rn(e), r & 4 && l !== null && l.memoizedState.isDehydrated)
          try {
            Kr(t.containerInfo);
          } catch (De) {
            yt(e, e.return, De);
          }
        Lf && (Lf = !1, qh(e));
        break;
      case 4:
        r = ll, ll = As(
          e.stateNode.containerInfo
        ), Tn(t, e), Rn(e), ll = r;
        break;
      case 12:
        Tn(t, e), Rn(e);
        break;
      case 31:
        Tn(t, e), Rn(e), r & 4 && (r = e.updateQueue, r !== null && (e.updateQueue = null, ms(e, r)));
        break;
      case 13:
        Tn(t, e), Rn(e), e.child.flags & 8192 && e.memoizedState !== null != (l !== null && l.memoizedState !== null) && (ys = ae()), r & 4 && (r = e.updateQueue, r !== null && (e.updateQueue = null, ms(e, r)));
        break;
      case 22:
        s = e.memoizedState !== null;
        var I = l !== null && l.memoizedState !== null, W = Al, ce = $t;
        if (Al = W || s, $t = ce || I, Tn(t, e), $t = ce, Al = W, Rn(e), r & 8192)
          e: for (t = e.stateNode, t._visibility = s ? t._visibility & -2 : t._visibility | 1, s && (l === null || I || Al || $t || Zo(e)), l = null, t = e; ; ) {
            if (t.tag === 5 || t.tag === 26) {
              if (l === null) {
                I = l = t;
                try {
                  if (c = I.stateNode, s)
                    h = c.style, typeof h.setProperty == "function" ? h.setProperty("display", "none", "important") : h.display = "none";
                  else {
                    T = I.stateNode;
                    var de = I.memoizedProps.style, te = de != null && de.hasOwnProperty("display") ? de.display : null;
                    T.style.display = te == null || typeof te == "boolean" ? "" : ("" + te).trim();
                  }
                } catch (De) {
                  yt(I, I.return, De);
                }
              }
            } else if (t.tag === 6) {
              if (l === null) {
                I = t;
                try {
                  I.stateNode.nodeValue = s ? "" : I.memoizedProps;
                } catch (De) {
                  yt(I, I.return, De);
                }
              }
            } else if (t.tag === 18) {
              if (l === null) {
                I = t;
                try {
                  var le = I.stateNode;
                  s ? ky(le, !0) : ky(I.stateNode, !1);
                } catch (De) {
                  yt(I, I.return, De);
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
        r & 4 && (r = e.updateQueue, r !== null && (l = r.retryQueue, l !== null && (r.retryQueue = null, ms(e, l))));
        break;
      case 19:
        Tn(t, e), Rn(e), r & 4 && (r = e.updateQueue, r !== null && (e.updateQueue = null, ms(e, r)));
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
          if (Hh(r)) {
            l = r;
            break;
          }
          r = r.return;
        }
        if (l == null) throw Error(i(160));
        switch (l.tag) {
          case 27:
            var s = l.stateNode, c = Hf(e);
            gs(e, c, s);
            break;
          case 5:
            var h = l.stateNode;
            l.flags & 32 && (yr(h, ""), l.flags &= -33);
            var T = Hf(e);
            gs(e, T, h);
            break;
          case 3:
          case 4:
            var I = l.stateNode.containerInfo, W = Hf(e);
            Uf(
              e,
              W,
              I
            );
            break;
          default:
            throw Error(i(161));
        }
      } catch (ce) {
        yt(e, e.return, ce);
      }
      e.flags &= -3;
    }
    t & 4096 && (e.flags &= -4097);
  }
  function qh(e) {
    if (e.subtreeFlags & 1024)
      for (e = e.child; e !== null; ) {
        var t = e;
        qh(t), t.tag === 5 && t.flags & 1024 && t.stateNode.reset(), e = e.sibling;
      }
  }
  function Dl(e, t) {
    if (t.subtreeFlags & 8772)
      for (t = t.child; t !== null; )
        Ih(e, t.alternate, t), t = t.sibling;
  }
  function Zo(e) {
    for (e = e.child; e !== null; ) {
      var t = e;
      switch (t.tag) {
        case 0:
        case 11:
        case 14:
        case 15:
          io(4, t, t.return), Zo(t);
          break;
        case 1:
          sl(t, t.return);
          var l = t.stateNode;
          typeof l.componentWillUnmount == "function" && kh(
            t,
            t.return,
            l
          ), Zo(t);
          break;
        case 27:
          qa(t.stateNode);
        case 26:
        case 5:
          sl(t, t.return), Zo(t);
          break;
        case 22:
          t.memoizedState === null && Zo(t);
          break;
        case 30:
          Zo(t);
          break;
        default:
          Zo(t);
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
          ), _a(4, c);
          break;
        case 1:
          if (Nl(
            s,
            c,
            l
          ), r = c, s = r.stateNode, typeof s.componentDidMount == "function")
            try {
              s.componentDidMount();
            } catch (W) {
              yt(r, r.return, W);
            }
          if (r = c, s = r.updateQueue, s !== null) {
            var T = r.stateNode;
            try {
              var I = s.shared.hiddenCallbacks;
              if (I !== null)
                for (s.shared.hiddenCallbacks = null, s = 0; s < I.length; s++)
                  wm(I[s], T);
            } catch (W) {
              yt(r, r.return, W);
            }
          }
          l && h & 64 && jh(c), Ha(c, c.return);
          break;
        case 27:
          Uh(c);
        case 26:
        case 5:
          Nl(
            s,
            c,
            l
          ), l && r === null && h & 4 && _h(c), Ha(c, c.return);
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
          ), l && h & 4 && Ph(s, c);
          break;
        case 13:
          Nl(
            s,
            c,
            l
          ), l && h & 4 && Yh(s, c);
          break;
        case 22:
          c.memoizedState === null && Nl(
            s,
            c,
            l
          ), Ha(c, c.return);
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
  function If(e, t) {
    var l = null;
    e !== null && e.memoizedState !== null && e.memoizedState.cachePool !== null && (l = e.memoizedState.cachePool.pool), e = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (e = t.memoizedState.cachePool.pool), e !== l && (e != null && e.refCount++, l != null && wa(l));
  }
  function Bf(e, t) {
    e = null, t.alternate !== null && (e = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== e && (t.refCount++, e != null && wa(e));
  }
  function ol(e, t, l, r) {
    if (t.subtreeFlags & 10256)
      for (t = t.child; t !== null; )
        Xh(
          e,
          t,
          l,
          r
        ), t = t.sibling;
  }
  function Xh(e, t, l, r) {
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
        ), s & 2048 && _a(9, t);
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
        ), s & 2048 && (e = null, t.alternate !== null && (e = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== e && (t.refCount++, e != null && wa(e)));
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
            var c = t.memoizedProps, h = c.id, T = c.onPostCommit;
            typeof T == "function" && T(
              h,
              t.alternate === null ? "mount" : "update",
              e.passiveEffectDuration,
              -0
            );
          } catch (I) {
            yt(t, t.return, I);
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
        ) : Ua(e, t) : c._visibility & 2 ? ol(
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
        )), s & 2048 && If(h, t);
        break;
      case 24:
        ol(
          e,
          t,
          l,
          r
        ), s & 2048 && Bf(t.alternate, t);
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
      var c = e, h = t, T = l, I = r, W = h.flags;
      switch (h.tag) {
        case 0:
        case 11:
        case 15:
          Ur(
            c,
            h,
            T,
            I,
            s
          ), _a(8, h);
          break;
        case 23:
          break;
        case 22:
          var ce = h.stateNode;
          h.memoizedState !== null ? ce._visibility & 2 ? Ur(
            c,
            h,
            T,
            I,
            s
          ) : Ua(
            c,
            h
          ) : (ce._visibility |= 2, Ur(
            c,
            h,
            T,
            I,
            s
          )), s && W & 2048 && If(
            h.alternate,
            h
          );
          break;
        case 24:
          Ur(
            c,
            h,
            T,
            I,
            s
          ), s && W & 2048 && Bf(h.alternate, h);
          break;
        default:
          Ur(
            c,
            h,
            T,
            I,
            s
          );
      }
      t = t.sibling;
    }
  }
  function Ua(e, t) {
    if (t.subtreeFlags & 10256)
      for (t = t.child; t !== null; ) {
        var l = e, r = t, s = r.flags;
        switch (r.tag) {
          case 22:
            Ua(l, r), s & 2048 && If(
              r.alternate,
              r
            );
            break;
          case 24:
            Ua(l, r), s & 2048 && Bf(r.alternate, r);
            break;
          default:
            Ua(l, r);
        }
        t = t.sibling;
      }
  }
  var La = 8192;
  function Lr(e, t, l) {
    if (e.subtreeFlags & La)
      for (e = e.child; e !== null; )
        Fh(
          e,
          t,
          l
        ), e = e.sibling;
  }
  function Fh(e, t, l) {
    switch (e.tag) {
      case 26:
        Lr(
          e,
          t,
          l
        ), e.flags & La && e.memoizedState !== null && bE(
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
        ll = As(e.stateNode.containerInfo), Lr(
          e,
          t,
          l
        ), ll = r;
        break;
      case 22:
        e.memoizedState === null && (r = e.alternate, r !== null && r.memoizedState !== null ? (r = La, La = 16777216, Lr(
          e,
          t,
          l
        ), La = r) : Lr(
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
  function Kh(e) {
    var t = e.alternate;
    if (t !== null && (e = t.child, e !== null)) {
      t.child = null;
      do
        t = e.sibling, e.sibling = null, e = t;
      while (e !== null);
    }
  }
  function Ia(e) {
    var t = e.deletions;
    if ((e.flags & 16) !== 0) {
      if (t !== null)
        for (var l = 0; l < t.length; l++) {
          var r = t[l];
          on = r, Zh(
            r,
            e
          );
        }
      Kh(e);
    }
    if (e.subtreeFlags & 10256)
      for (e = e.child; e !== null; )
        Qh(e), e = e.sibling;
  }
  function Qh(e) {
    switch (e.tag) {
      case 0:
      case 11:
      case 15:
        Ia(e), e.flags & 2048 && io(9, e, e.return);
        break;
      case 3:
        Ia(e);
        break;
      case 12:
        Ia(e);
        break;
      case 22:
        var t = e.stateNode;
        e.memoizedState !== null && t._visibility & 2 && (e.return === null || e.return.tag !== 13) ? (t._visibility &= -3, hs(e)) : Ia(e);
        break;
      default:
        Ia(e);
    }
  }
  function hs(e) {
    var t = e.deletions;
    if ((e.flags & 16) !== 0) {
      if (t !== null)
        for (var l = 0; l < t.length; l++) {
          var r = t[l];
          on = r, Zh(
            r,
            e
          );
        }
      Kh(e);
    }
    for (e = e.child; e !== null; ) {
      switch (t = e, t.tag) {
        case 0:
        case 11:
        case 15:
          io(8, t, t.return), hs(t);
          break;
        case 22:
          l = t.stateNode, l._visibility & 2 && (l._visibility &= -3, hs(t));
          break;
        default:
          hs(t);
      }
      e = e.sibling;
    }
  }
  function Zh(e, t) {
    for (; on !== null; ) {
      var l = on;
      switch (l.tag) {
        case 0:
        case 11:
        case 15:
          io(8, l, t);
          break;
        case 23:
        case 22:
          if (l.memoizedState !== null && l.memoizedState.cachePool !== null) {
            var r = l.memoizedState.cachePool.pool;
            r != null && r.refCount++;
          }
          break;
        case 24:
          wa(l.memoizedState.cache);
      }
      if (r = l.child, r !== null) r.return = l, on = r;
      else
        e: for (l = e; on !== null; ) {
          r = on;
          var s = r.sibling, c = r.return;
          if (Bh(r), r === l) {
            on = null;
            break e;
          }
          if (s !== null) {
            s.return = c, on = s;
            break e;
          }
          on = c;
        }
    }
  }
  var kw = {
    getCacheForType: function(e) {
      var t = fn(Qt), l = t.data.get(e);
      return l === void 0 && (l = e(), t.data.set(e, l)), l;
    },
    cacheSignal: function() {
      return fn(Qt).controller.signal;
    }
  }, _w = typeof WeakMap == "function" ? WeakMap : Map, dt = 0, Ot = null, lt = null, at = 0, ht = 0, _n = null, so = !1, Ir = !1, Vf = !1, jl = 0, Vt = 0, co = 0, Jo = 0, Pf = 0, Hn = 0, Br = 0, Ba = null, Cn = null, Yf = !1, ys = 0, Jh = 0, vs = 1 / 0, bs = null, uo = null, en = 0, fo = null, Vr = null, kl = 0, Gf = 0, qf = null, $h = null, Va = 0, Xf = null;
  function Un() {
    return (dt & 2) !== 0 && at !== 0 ? at & -at : H.T !== null ? $f() : Xt();
  }
  function Wh() {
    if (Hn === 0)
      if ((at & 536870912) === 0 || st) {
        var e = It;
        It <<= 1, (It & 3932160) === 0 && (It = 262144), Hn = e;
      } else Hn = 536870912;
    return e = jn.current, e !== null && (e.flags |= 32), Hn;
  }
  function On(e, t, l) {
    (e === Ot && (ht === 2 || ht === 9) || e.cancelPendingCommit !== null) && (Pr(e, 0), po(
      e,
      at,
      Hn,
      !1
    )), qt(e, l), ((dt & 2) === 0 || e !== Ot) && (e === Ot && ((dt & 2) === 0 && (Jo |= l), Vt === 4 && po(
      e,
      at,
      Hn,
      !1
    )), cl(e));
  }
  function ey(e, t, l) {
    if ((dt & 6) !== 0) throw Error(i(327));
    var r = !l && (t & 127) === 0 && (t & e.expiredLanes) === 0 || Gt(e, t), s = r ? Lw(e, t) : Kf(e, t, !0), c = r;
    do {
      if (s === 0) {
        Ir && !r && po(e, t, 0, !1);
        break;
      } else {
        if (l = e.current.alternate, c && !Hw(l)) {
          s = Kf(e, t, !1), c = !1;
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
              var T = e;
              s = Ba;
              var I = T.current.memoizedState.isDehydrated;
              if (I && (Pr(T, h).flags |= 256), h = Kf(
                T,
                h,
                !1
              ), h !== 2) {
                if (Vf && !I) {
                  T.errorRecoveryDisabledLanes |= c, Jo |= c, s = 4;
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
          Pr(e, 0), po(e, t, 0, !0);
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
              po(
                r,
                t,
                Hn,
                !so
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
          if ((t & 62914560) === t && (s = ys + 300 - ae(), 10 < s)) {
            if (po(
              r,
              t,
              Hn,
              !so
            ), jt(r, 0, !0) !== 0) break e;
            kl = t, r.timeoutHandle = Dy(
              ty.bind(
                null,
                r,
                l,
                Cn,
                bs,
                Yf,
                t,
                Hn,
                Jo,
                Br,
                so,
                c,
                "Throttled",
                -0,
                0
              ),
              s
            );
            break e;
          }
          ty(
            r,
            l,
            Cn,
            bs,
            Yf,
            t,
            Hn,
            Jo,
            Br,
            so,
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
  function ty(e, t, l, r, s, c, h, T, I, W, ce, de, te, le) {
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
      }, Fh(
        t,
        c,
        de
      );
      var De = (c & 62914560) === c ? ys - ae() : (c & 4194048) === c ? Jh - ae() : 0;
      if (De = xE(
        de,
        De
      ), De !== null) {
        kl = c, e.cancelPendingCommit = De(
          cy.bind(
            null,
            e,
            t,
            c,
            l,
            r,
            s,
            h,
            T,
            I,
            ce,
            de,
            null,
            te,
            le
          )
        ), po(e, c, h, !W);
        return;
      }
    }
    cy(
      e,
      t,
      c,
      l,
      r,
      s,
      h,
      T,
      I
    );
  }
  function Hw(e) {
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
  function po(e, t, l, r) {
    t &= ~Pf, t &= ~Jo, e.suspendedLanes |= t, e.pingedLanes &= ~t, r && (e.warmLanes |= t), r = e.expirationTimes;
    for (var s = t; 0 < s; ) {
      var c = 31 - mt(s), h = 1 << c;
      r[c] = -1, s &= ~h;
    }
    l !== 0 && hl(e, l, t);
  }
  function xs() {
    return (dt & 6) === 0 ? (Pa(0), !1) : !0;
  }
  function Ff() {
    if (lt !== null) {
      if (ht === 0)
        var e = lt.return;
      else
        e = lt, El = Po = null, cf(e), Nr = null, Ta = 0, e = lt;
      for (; e !== null; )
        Nh(e.alternate, e), e = e.return;
      lt = null;
    }
  }
  function Pr(e, t) {
    var l = e.timeoutHandle;
    l !== -1 && (e.timeoutHandle = -1, nE(l)), l = e.cancelPendingCommit, l !== null && (e.cancelPendingCommit = null, l()), kl = 0, Ff(), Ot = e, lt = l = Sl(e.current, null), at = t, ht = 0, _n = null, so = !1, Ir = Gt(e, t), Vf = !1, Br = Hn = Pf = Jo = co = Vt = 0, Cn = Ba = null, Yf = !1, (t & 8) !== 0 && (t |= t & 32);
    var r = e.entangledLanes;
    if (r !== 0)
      for (e = e.entanglements, r &= t; 0 < r; ) {
        var s = 31 - mt(r), c = 1 << s;
        t |= e[s], r &= ~c;
      }
    return jl = t, Vi(), l;
  }
  function ny(e, t) {
    Xe = null, H.H = Na, t === Dr || t === Qi ? (t = vm(), ht = 3) : t === Zu ? (t = vm(), ht = 4) : ht = t === Rf ? 8 : t !== null && typeof t == "object" && typeof t.then == "function" ? 6 : 1, _n = t, lt === null && (Vt = 1, cs(
      e,
      Xn(t, e.current)
    ));
  }
  function ly() {
    var e = jn.current;
    return e === null ? !0 : (at & 4194048) === at ? Zn === null : (at & 62914560) === at || (at & 536870912) !== 0 ? e === Zn : !1;
  }
  function oy() {
    var e = H.H;
    return H.H = Na, e === null ? Na : e;
  }
  function ry() {
    var e = H.A;
    return H.A = kw, e;
  }
  function Ss() {
    Vt = 4, so || (at & 4194048) !== at && jn.current !== null || (Ir = !0), (co & 134217727) === 0 && (Jo & 134217727) === 0 || Ot === null || po(
      Ot,
      at,
      Hn,
      !1
    );
  }
  function Kf(e, t, l) {
    var r = dt;
    dt |= 2;
    var s = oy(), c = ry();
    (Ot !== e || at !== t) && (bs = null, Pr(e, t)), t = !1;
    var h = Vt;
    e: do
      try {
        if (ht !== 0 && lt !== null) {
          var T = lt, I = _n;
          switch (ht) {
            case 8:
              Ff(), h = 6;
              break e;
            case 3:
            case 2:
            case 9:
            case 6:
              jn.current === null && (t = !0);
              var W = ht;
              if (ht = 0, _n = null, Yr(e, T, I, W), l && Ir) {
                h = 0;
                break e;
              }
              break;
            default:
              W = ht, ht = 0, _n = null, Yr(e, T, I, W);
          }
        }
        Uw(), h = Vt;
        break;
      } catch (ce) {
        ny(e, ce);
      }
    while (!0);
    return t && e.shellSuspendCounter++, El = Po = null, dt = r, H.H = s, H.A = c, lt === null && (Ot = null, at = 0, Vi()), h;
  }
  function Uw() {
    for (; lt !== null; ) ay(lt);
  }
  function Lw(e, t) {
    var l = dt;
    dt |= 2;
    var r = oy(), s = ry();
    Ot !== e || at !== t ? (bs = null, vs = ae() + 500, Pr(e, t)) : Ir = Gt(
      e,
      t
    );
    e: do
      try {
        if (ht !== 0 && lt !== null) {
          t = lt;
          var c = _n;
          t: switch (ht) {
            case 1:
              ht = 0, _n = null, Yr(e, t, c, 1);
              break;
            case 2:
            case 9:
              if (hm(c)) {
                ht = 0, _n = null, iy(t);
                break;
              }
              t = function() {
                ht !== 2 && ht !== 9 || Ot !== e || (ht = 7), cl(e);
              }, c.then(t, t);
              break e;
            case 3:
              ht = 7;
              break e;
            case 4:
              ht = 5;
              break e;
            case 7:
              hm(c) ? (ht = 0, _n = null, iy(t)) : (ht = 0, _n = null, Yr(e, t, c, 7));
              break;
            case 5:
              var h = null;
              switch (lt.tag) {
                case 26:
                  h = lt.memoizedState;
                case 5:
                case 27:
                  var T = lt;
                  if (h ? Xy(h) : T.stateNode.complete) {
                    ht = 0, _n = null;
                    var I = T.sibling;
                    if (I !== null) lt = I;
                    else {
                      var W = T.return;
                      W !== null ? (lt = W, ws(W)) : lt = null;
                    }
                    break t;
                  }
              }
              ht = 0, _n = null, Yr(e, t, c, 5);
              break;
            case 6:
              ht = 0, _n = null, Yr(e, t, c, 6);
              break;
            case 8:
              Ff(), Vt = 6;
              break e;
            default:
              throw Error(i(462));
          }
        }
        Iw();
        break;
      } catch (ce) {
        ny(e, ce);
      }
    while (!0);
    return El = Po = null, H.H = r, H.A = s, dt = l, lt !== null ? 0 : (Ot = null, at = 0, Vi(), Vt);
  }
  function Iw() {
    for (; lt !== null && !Oe(); )
      ay(lt);
  }
  function ay(e) {
    var t = zh(e.alternate, e, jl);
    e.memoizedProps = e.pendingProps, t === null ? ws(e) : lt = t;
  }
  function iy(e) {
    var t = e, l = t.alternate;
    switch (t.tag) {
      case 15:
      case 0:
        t = Th(
          l,
          t,
          t.pendingProps,
          t.type,
          void 0,
          at
        );
        break;
      case 11:
        t = Th(
          l,
          t,
          t.pendingProps,
          t.type.render,
          t.ref,
          at
        );
        break;
      case 5:
        cf(t);
      default:
        Nh(l, t), t = lt = rm(t, jl), t = zh(l, t, jl);
    }
    e.memoizedProps = e.pendingProps, t === null ? ws(e) : lt = t;
  }
  function Yr(e, t, l, r) {
    El = Po = null, cf(t), Nr = null, Ta = 0;
    var s = t.return;
    try {
      if (Ow(
        e,
        s,
        t,
        l,
        at
      )) {
        Vt = 1, cs(
          e,
          Xn(l, e.current)
        ), lt = null;
        return;
      }
    } catch (c) {
      if (s !== null) throw lt = s, c;
      Vt = 1, cs(
        e,
        Xn(l, e.current)
      ), lt = null;
      return;
    }
    t.flags & 32768 ? (st || r === 1 ? e = !0 : Ir || (at & 536870912) !== 0 ? e = !1 : (so = e = !0, (r === 2 || r === 9 || r === 3 || r === 6) && (r = jn.current, r !== null && r.tag === 13 && (r.flags |= 16384))), sy(t, e)) : ws(t);
  }
  function ws(e) {
    var t = e;
    do {
      if ((t.flags & 32768) !== 0) {
        sy(
          t,
          so
        );
        return;
      }
      e = t.return;
      var l = zw(
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
  function sy(e, t) {
    do {
      var l = Dw(e.alternate, e);
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
  function cy(e, t, l, r, s, c, h, T, I) {
    e.cancelPendingCommit = null;
    do
      Es();
    while (en !== 0);
    if ((dt & 6) !== 0) throw Error(i(327));
    if (t !== null) {
      if (t === e.current) throw Error(i(177));
      if (c = t.lanes | t.childLanes, c |= _u, Pn(
        e,
        l,
        c,
        h,
        T,
        I
      ), e === Ot && (lt = Ot = null, at = 0), Vr = t, fo = e, kl = l, Gf = c, qf = s, $h = r, (t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0 ? (e.callbackNode = null, e.callbackPriority = 0, Yw(be, function() {
        return gy(), null;
      })) : (e.callbackNode = null, e.callbackPriority = 0), r = (t.flags & 13878) !== 0, (t.subtreeFlags & 13878) !== 0 || r) {
        r = H.T, H.T = null, s = Y.p, Y.p = 2, h = dt, dt |= 4;
        try {
          Nw(e, t, l);
        } finally {
          dt = h, Y.p = s, H.T = r;
        }
      }
      en = 1, uy(), fy(), dy();
    }
  }
  function uy() {
    if (en === 1) {
      en = 0;
      var e = fo, t = Vr, l = (t.flags & 13878) !== 0;
      if ((t.subtreeFlags & 13878) !== 0 || l) {
        l = H.T, H.T = null;
        var r = Y.p;
        Y.p = 2;
        var s = dt;
        dt |= 4;
        try {
          Gh(t, e);
          var c = ad, h = Zg(e.containerInfo), T = c.focusedElem, I = c.selectionRange;
          if (h !== T && T && T.ownerDocument && Qg(
            T.ownerDocument.documentElement,
            T
          )) {
            if (I !== null && zu(T)) {
              var W = I.start, ce = I.end;
              if (ce === void 0 && (ce = W), "selectionStart" in T)
                T.selectionStart = W, T.selectionEnd = Math.min(
                  ce,
                  T.value.length
                );
              else {
                var de = T.ownerDocument || document, te = de && de.defaultView || window;
                if (te.getSelection) {
                  var le = te.getSelection(), De = T.textContent.length, Ve = Math.min(I.start, De), Et = I.end === void 0 ? Ve : Math.min(I.end, De);
                  !le.extend && Ve > Et && (h = Et, Et = Ve, Ve = h);
                  var F = Kg(
                    T,
                    Ve
                  ), P = Kg(
                    T,
                    Et
                  );
                  if (F && P && (le.rangeCount !== 1 || le.anchorNode !== F.node || le.anchorOffset !== F.offset || le.focusNode !== P.node || le.focusOffset !== P.offset)) {
                    var $ = de.createRange();
                    $.setStart(F.node, F.offset), le.removeAllRanges(), Ve > Et ? (le.addRange($), le.extend(P.node, P.offset)) : ($.setEnd(P.node, P.offset), le.addRange($));
                  }
                }
              }
            }
            for (de = [], le = T; le = le.parentNode; )
              le.nodeType === 1 && de.push({
                element: le,
                left: le.scrollLeft,
                top: le.scrollTop
              });
            for (typeof T.focus == "function" && T.focus(), T = 0; T < de.length; T++) {
              var ue = de[T];
              ue.element.scrollLeft = ue.left, ue.element.scrollTop = ue.top;
            }
          }
          _s = !!rd, ad = rd = null;
        } finally {
          dt = s, Y.p = r, H.T = l;
        }
      }
      e.current = t, en = 2;
    }
  }
  function fy() {
    if (en === 2) {
      en = 0;
      var e = fo, t = Vr, l = (t.flags & 8772) !== 0;
      if ((t.subtreeFlags & 8772) !== 0 || l) {
        l = H.T, H.T = null;
        var r = Y.p;
        Y.p = 2;
        var s = dt;
        dt |= 4;
        try {
          Ih(e, t.alternate, t);
        } finally {
          dt = s, Y.p = r, H.T = l;
        }
      }
      en = 3;
    }
  }
  function dy() {
    if (en === 4 || en === 3) {
      en = 0, He();
      var e = fo, t = Vr, l = kl, r = $h;
      (t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0 ? en = 5 : (en = 0, Vr = fo = null, py(e, e.pendingLanes));
      var s = e.pendingLanes;
      if (s === 0 && (uo = null), xt(l), t = t.stateNode, gt && typeof gt.onCommitFiberRoot == "function")
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
        t = H.T, s = Y.p, Y.p = 2, H.T = null;
        try {
          for (var c = e.onRecoverableError, h = 0; h < r.length; h++) {
            var T = r[h];
            c(T.value, {
              componentStack: T.stack
            });
          }
        } finally {
          H.T = t, Y.p = s;
        }
      }
      (kl & 3) !== 0 && Es(), cl(e), s = e.pendingLanes, (l & 261930) !== 0 && (s & 42) !== 0 ? e === Xf ? Va++ : (Va = 0, Xf = e) : Va = 0, Pa(0);
    }
  }
  function py(e, t) {
    (e.pooledCacheLanes &= t) === 0 && (t = e.pooledCache, t != null && (e.pooledCache = null, wa(t)));
  }
  function Es() {
    return uy(), fy(), dy(), gy();
  }
  function gy() {
    if (en !== 5) return !1;
    var e = fo, t = Gf;
    Gf = 0;
    var l = xt(kl), r = H.T, s = Y.p;
    try {
      Y.p = 32 > l ? 32 : l, H.T = null, l = qf, qf = null;
      var c = fo, h = kl;
      if (en = 0, Vr = fo = null, kl = 0, (dt & 6) !== 0) throw Error(i(331));
      var T = dt;
      if (dt |= 4, Qh(c.current), Xh(
        c,
        c.current,
        h,
        l
      ), dt = T, Pa(0, !1), gt && typeof gt.onPostCommitFiberRoot == "function")
        try {
          gt.onPostCommitFiberRoot(et, c);
        } catch {
        }
      return !0;
    } finally {
      Y.p = s, H.T = r, py(e, t);
    }
  }
  function my(e, t, l) {
    t = Xn(l, t), t = Tf(e.stateNode, t, 2), e = oo(e, t, 2), e !== null && (qt(e, 2), cl(e));
  }
  function yt(e, t, l) {
    if (e.tag === 3)
      my(e, e, l);
    else
      for (; t !== null; ) {
        if (t.tag === 3) {
          my(
            t,
            e,
            l
          );
          break;
        } else if (t.tag === 1) {
          var r = t.stateNode;
          if (typeof t.type.getDerivedStateFromError == "function" || typeof r.componentDidCatch == "function" && (uo === null || !uo.has(r))) {
            e = Xn(l, e), l = hh(2), r = oo(t, l, 2), r !== null && (yh(
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
  function Qf(e, t, l) {
    var r = e.pingCache;
    if (r === null) {
      r = e.pingCache = new _w();
      var s = /* @__PURE__ */ new Set();
      r.set(t, s);
    } else
      s = r.get(t), s === void 0 && (s = /* @__PURE__ */ new Set(), r.set(t, s));
    s.has(l) || (Vf = !0, s.add(l), e = Bw.bind(null, e, t, l), t.then(e, e));
  }
  function Bw(e, t, l) {
    var r = e.pingCache;
    r !== null && r.delete(t), e.pingedLanes |= e.suspendedLanes & l, e.warmLanes &= ~l, Ot === e && (at & l) === l && (Vt === 4 || Vt === 3 && (at & 62914560) === at && 300 > ae() - ys ? (dt & 2) === 0 && Pr(e, 0) : Pf |= l, Br === at && (Br = 0)), cl(e);
  }
  function hy(e, t) {
    t === 0 && (t = zn()), e = Io(e, t), e !== null && (qt(e, t), cl(e));
  }
  function Vw(e) {
    var t = e.memoizedState, l = 0;
    t !== null && (l = t.retryLane), hy(e, l);
  }
  function Pw(e, t) {
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
    r !== null && r.delete(t), hy(e, l);
  }
  function Yw(e, t) {
    return Se(e, t);
  }
  var Ts = null, Gr = null, Zf = !1, Rs = !1, Jf = !1, go = 0;
  function cl(e) {
    e !== Gr && e.next === null && (Gr === null ? Ts = Gr = e : Gr = Gr.next = e), Rs = !0, Zf || (Zf = !0, qw());
  }
  function Pa(e, t) {
    if (!Jf && Rs) {
      Jf = !0;
      do
        for (var l = !1, r = Ts; r !== null; ) {
          if (e !== 0) {
            var s = r.pendingLanes;
            if (s === 0) var c = 0;
            else {
              var h = r.suspendedLanes, T = r.pingedLanes;
              c = (1 << 31 - mt(42 | e) + 1) - 1, c &= s & ~(h & ~T), c = c & 201326741 ? c & 201326741 | 1 : c ? c | 2 : 0;
            }
            c !== 0 && (l = !0, xy(r, c));
          } else
            c = at, c = jt(
              r,
              r === Ot ? c : 0,
              r.cancelPendingCommit !== null || r.timeoutHandle !== -1
            ), (c & 3) === 0 || Gt(r, c) || (l = !0, xy(r, c));
          r = r.next;
        }
      while (l);
      Jf = !1;
    }
  }
  function Gw() {
    yy();
  }
  function yy() {
    Rs = Zf = !1;
    var e = 0;
    go !== 0 && tE() && (e = go);
    for (var t = ae(), l = null, r = Ts; r !== null; ) {
      var s = r.next, c = vy(r, t);
      c === 0 ? (r.next = null, l === null ? Ts = s : l.next = s, s === null && (Gr = l)) : (l = r, (e !== 0 || (c & 3) !== 0) && (Rs = !0)), r = s;
    }
    en !== 0 && en !== 5 || Pa(e), go !== 0 && (go = 0);
  }
  function vy(e, t) {
    for (var l = e.suspendedLanes, r = e.pingedLanes, s = e.expirationTimes, c = e.pendingLanes & -62914561; 0 < c; ) {
      var h = 31 - mt(c), T = 1 << h, I = s[h];
      I === -1 ? ((T & l) === 0 || (T & r) !== 0) && (s[h] = Sn(T, t)) : I <= t && (e.expiredLanes |= T), c &= ~T;
    }
    if (t = Ot, l = at, l = jt(
      e,
      e === t ? l : 0,
      e.cancelPendingCommit !== null || e.timeoutHandle !== -1
    ), r = e.callbackNode, l === 0 || e === t && (ht === 2 || ht === 9) || e.cancelPendingCommit !== null)
      return r !== null && r !== null && Te(r), e.callbackNode = null, e.callbackPriority = 0;
    if ((l & 3) === 0 || Gt(e, l)) {
      if (t = l & -l, t === e.callbackPriority) return t;
      switch (r !== null && Te(r), xt(l)) {
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
      return r = by.bind(null, e), l = Se(l, r), e.callbackPriority = t, e.callbackNode = l, t;
    }
    return r !== null && r !== null && Te(r), e.callbackPriority = 2, e.callbackNode = null, 2;
  }
  function by(e, t) {
    if (en !== 0 && en !== 5)
      return e.callbackNode = null, e.callbackPriority = 0, null;
    var l = e.callbackNode;
    if (Es() && e.callbackNode !== l)
      return null;
    var r = at;
    return r = jt(
      e,
      e === Ot ? r : 0,
      e.cancelPendingCommit !== null || e.timeoutHandle !== -1
    ), r === 0 ? null : (ey(e, r, t), vy(e, ae()), e.callbackNode != null && e.callbackNode === l ? by.bind(null, e) : null);
  }
  function xy(e, t) {
    if (Es()) return null;
    ey(e, t, !0);
  }
  function qw() {
    lE(function() {
      (dt & 6) !== 0 ? Se(
        Ue,
        Gw
      ) : yy();
    });
  }
  function $f() {
    if (go === 0) {
      var e = Ar;
      e === 0 && (e = ft, ft <<= 1, (ft & 261888) === 0 && (ft = 256)), go = e;
    }
    return go;
  }
  function Sy(e) {
    return e == null || typeof e == "symbol" || typeof e == "boolean" ? null : typeof e == "function" ? e : ji("" + e);
  }
  function wy(e, t) {
    var l = t.ownerDocument.createElement("input");
    return l.name = t.name, l.value = t.value, e.id && l.setAttribute("form", e.id), t.parentNode.insertBefore(l, t), e = new FormData(e), l.parentNode.removeChild(l), e;
  }
  function Xw(e, t, l, r, s) {
    if (t === "submit" && l && l.stateNode === s) {
      var c = Sy(
        (s[cn] || null).action
      ), h = r.submitter;
      h && (t = (t = h[cn] || null) ? Sy(t.formAction) : h.getAttribute("formAction"), t !== null && (c = t, h = null));
      var T = new Ui(
        "action",
        "action",
        null,
        r,
        s
      );
      e.push({
        event: T,
        listeners: [
          {
            instance: null,
            listener: function() {
              if (r.defaultPrevented) {
                if (go !== 0) {
                  var I = h ? wy(s, h) : new FormData(s);
                  vf(
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
                typeof c == "function" && (T.preventDefault(), I = h ? wy(s, h) : new FormData(s), vf(
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
  for (var Wf = 0; Wf < ku.length; Wf++) {
    var ed = ku[Wf], Fw = ed.toLowerCase(), Kw = ed[0].toUpperCase() + ed.slice(1);
    nl(
      Fw,
      "on" + Kw
    );
  }
  nl(Wg, "onAnimationEnd"), nl(em, "onAnimationIteration"), nl(tm, "onAnimationStart"), nl("dblclick", "onDoubleClick"), nl("focusin", "onFocus"), nl("focusout", "onBlur"), nl(uw, "onTransitionRun"), nl(fw, "onTransitionStart"), nl(dw, "onTransitionCancel"), nl(nm, "onTransitionEnd"), mr("onMouseEnter", ["mouseout", "mouseover"]), mr("onMouseLeave", ["mouseout", "mouseover"]), mr("onPointerEnter", ["pointerout", "pointerover"]), mr("onPointerLeave", ["pointerout", "pointerover"]), _o(
    "onChange",
    "change click focusin focusout input keydown keyup selectionchange".split(" ")
  ), _o(
    "onSelect",
    "focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(
      " "
    )
  ), _o("onBeforeInput", [
    "compositionend",
    "keypress",
    "textInput",
    "paste"
  ]), _o(
    "onCompositionEnd",
    "compositionend focusout keydown keypress keyup mousedown".split(" ")
  ), _o(
    "onCompositionStart",
    "compositionstart focusout keydown keypress keyup mousedown".split(" ")
  ), _o(
    "onCompositionUpdate",
    "compositionupdate focusout keydown keypress keyup mousedown".split(" ")
  );
  var Ya = "abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(
    " "
  ), Qw = new Set(
    "beforetoggle cancel close invalid load scroll scrollend toggle".split(" ").concat(Ya)
  );
  function Ey(e, t) {
    t = (t & 4) !== 0;
    for (var l = 0; l < e.length; l++) {
      var r = e[l], s = r.event;
      r = r.listeners;
      e: {
        var c = void 0;
        if (t)
          for (var h = r.length - 1; 0 <= h; h--) {
            var T = r[h], I = T.instance, W = T.currentTarget;
            if (T = T.listener, I !== c && s.isPropagationStopped())
              break e;
            c = T, s.currentTarget = W;
            try {
              c(s);
            } catch (ce) {
              Bi(ce);
            }
            s.currentTarget = null, c = I;
          }
        else
          for (h = 0; h < r.length; h++) {
            if (T = r[h], I = T.instance, W = T.currentTarget, T = T.listener, I !== c && s.isPropagationStopped())
              break e;
            c = T, s.currentTarget = W;
            try {
              c(s);
            } catch (ce) {
              Bi(ce);
            }
            s.currentTarget = null, c = I;
          }
      }
    }
  }
  function ot(e, t) {
    var l = t[sa];
    l === void 0 && (l = t[sa] = /* @__PURE__ */ new Set());
    var r = e + "__bubble";
    l.has(r) || (Ty(t, e, 2, !1), l.add(r));
  }
  function td(e, t, l) {
    var r = 0;
    t && (r |= 4), Ty(
      l,
      e,
      r,
      t
    );
  }
  var Cs = "_reactListening" + Math.random().toString(36).slice(2);
  function nd(e) {
    if (!e[Cs]) {
      e[Cs] = !0, yg.forEach(function(l) {
        l !== "selectionchange" && (Qw.has(l) || td(l, !1, e), td(l, !0, e));
      });
      var t = e.nodeType === 9 ? e : e.ownerDocument;
      t === null || t[Cs] || (t[Cs] = !0, td("selectionchange", !1, t));
    }
  }
  function Ty(e, t, l, r) {
    switch (Wy(t)) {
      case 2:
        var s = EE;
        break;
      case 8:
        s = TE;
        break;
      default:
        s = yd;
    }
    l = s.bind(
      null,
      t,
      l,
      e
    ), s = void 0, !Su || t !== "touchstart" && t !== "touchmove" && t !== "wheel" || (s = !0), r ? s !== void 0 ? e.addEventListener(t, l, {
      capture: !0,
      passive: s
    }) : e.addEventListener(t, l, !0) : s !== void 0 ? e.addEventListener(t, l, {
      passive: s
    }) : e.addEventListener(t, l, !1);
  }
  function ld(e, t, l, r, s) {
    var c = r;
    if ((t & 1) === 0 && (t & 2) === 0 && r !== null)
      e: for (; ; ) {
        if (r === null) return;
        var h = r.tag;
        if (h === 3 || h === 4) {
          var T = r.stateNode.containerInfo;
          if (T === s) break;
          if (h === 4)
            for (h = r.return; h !== null; ) {
              var I = h.tag;
              if ((I === 3 || I === 4) && h.stateNode.containerInfo === s)
                return;
              h = h.return;
            }
          for (; T !== null; ) {
            if (h = dr(T), h === null) return;
            if (I = h.tag, I === 5 || I === 6 || I === 26 || I === 27) {
              r = c = h;
              continue e;
            }
            T = T.parentNode;
          }
        }
        r = r.return;
      }
    Ag(function() {
      var W = c, ce = bu(l), de = [];
      e: {
        var te = lm.get(e);
        if (te !== void 0) {
          var le = Ui, De = e;
          switch (e) {
            case "keypress":
              if (_i(l) === 0) break e;
            case "keydown":
            case "keyup":
              le = PS;
              break;
            case "focusin":
              De = "focus", le = Ru;
              break;
            case "focusout":
              De = "blur", le = Ru;
              break;
            case "beforeblur":
            case "afterblur":
              le = Ru;
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
              le = Ng;
              break;
            case "drag":
            case "dragend":
            case "dragenter":
            case "dragexit":
            case "dragleave":
            case "dragover":
            case "dragstart":
            case "drop":
              le = zS;
              break;
            case "touchcancel":
            case "touchend":
            case "touchmove":
            case "touchstart":
              le = qS;
              break;
            case Wg:
            case em:
            case tm:
              le = jS;
              break;
            case nm:
              le = FS;
              break;
            case "scroll":
            case "scrollend":
              le = MS;
              break;
            case "wheel":
              le = QS;
              break;
            case "copy":
            case "cut":
            case "paste":
              le = _S;
              break;
            case "gotpointercapture":
            case "lostpointercapture":
            case "pointercancel":
            case "pointerdown":
            case "pointermove":
            case "pointerout":
            case "pointerover":
            case "pointerup":
              le = kg;
              break;
            case "toggle":
            case "beforetoggle":
              le = JS;
          }
          var Ve = (t & 4) !== 0, Et = !Ve && (e === "scroll" || e === "scrollend"), F = Ve ? te !== null ? te + "Capture" : null : te;
          Ve = [];
          for (var P = W, $; P !== null; ) {
            var ue = P;
            if ($ = ue.stateNode, ue = ue.tag, ue !== 5 && ue !== 26 && ue !== 27 || $ === null || F === null || (ue = fa(P, F), ue != null && Ve.push(
              Ga(P, ue, $)
            )), Et) break;
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
          if (te = e === "mouseover" || e === "pointerover", le = e === "mouseout" || e === "pointerout", te && l !== vu && (De = l.relatedTarget || l.fromElement) && (dr(De) || De[rl]))
            break e;
          if ((le || te) && (te = ce.window === ce ? ce : (te = ce.ownerDocument) ? te.defaultView || te.parentWindow : window, le ? (De = l.relatedTarget || l.toElement, le = W, De = De ? dr(De) : null, De !== null && (Et = f(De), Ve = De.tag, De !== Et || Ve !== 5 && Ve !== 27 && Ve !== 6) && (De = null)) : (le = null, De = W), le !== De)) {
            if (Ve = Ng, ue = "onMouseLeave", F = "onMouseEnter", P = "mouse", (e === "pointerout" || e === "pointerover") && (Ve = kg, ue = "onPointerLeave", F = "onPointerEnter", P = "pointer"), Et = le == null ? te : ua(le), $ = De == null ? te : ua(De), te = new Ve(
              ue,
              P + "leave",
              le,
              l,
              ce
            ), te.target = Et, te.relatedTarget = $, ue = null, dr(ce) === W && (Ve = new Ve(
              F,
              P + "enter",
              De,
              l,
              ce
            ), Ve.target = $, Ve.relatedTarget = Et, ue = Ve), Et = ue, le && De)
              t: {
                for (Ve = Zw, F = le, P = De, $ = 0, ue = F; ue; ue = Ve(ue))
                  $++;
                ue = 0;
                for (var Ie = P; Ie; Ie = Ve(Ie))
                  ue++;
                for (; 0 < $ - ue; )
                  F = Ve(F), $--;
                for (; 0 < ue - $; )
                  P = Ve(P), ue--;
                for (; $--; ) {
                  if (F === P || P !== null && F === P.alternate) {
                    Ve = F;
                    break t;
                  }
                  F = Ve(F), P = Ve(P);
                }
                Ve = null;
              }
            else Ve = null;
            le !== null && Ry(
              de,
              te,
              le,
              Ve,
              !1
            ), De !== null && Et !== null && Ry(
              de,
              Et,
              De,
              Ve,
              !0
            );
          }
        }
        e: {
          if (te = W ? ua(W) : window, le = te.nodeName && te.nodeName.toLowerCase(), le === "select" || le === "input" && te.type === "file")
            var ct = Pg;
          else if (Bg(te))
            if (Yg)
              ct = iw;
            else {
              ct = rw;
              var Ne = ow;
            }
          else
            le = te.nodeName, !le || le.toLowerCase() !== "input" || te.type !== "checkbox" && te.type !== "radio" ? W && yu(W.elementType) && (ct = Pg) : ct = aw;
          if (ct && (ct = ct(e, W))) {
            Vg(
              de,
              ct,
              l,
              ce
            );
            break e;
          }
          Ne && Ne(e, te, W), e === "focusout" && W && te.type === "number" && W.memoizedProps.value != null && hu(te, "number", te.value);
        }
        switch (Ne = W ? ua(W) : window, e) {
          case "focusin":
            (Bg(Ne) || Ne.contentEditable === "true") && (Sr = Ne, Du = W, ba = null);
            break;
          case "focusout":
            ba = Du = Sr = null;
            break;
          case "mousedown":
            Nu = !0;
            break;
          case "contextmenu":
          case "mouseup":
          case "dragend":
            Nu = !1, Jg(de, l, ce);
            break;
          case "selectionchange":
            if (cw) break;
          case "keydown":
          case "keyup":
            Jg(de, l, ce);
        }
        var Fe;
        if (Ou)
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
          xr ? Lg(e, l) && (it = "onCompositionEnd") : e === "keydown" && l.keyCode === 229 && (it = "onCompositionStart");
        it && (_g && l.locale !== "ko" && (xr || it !== "onCompositionStart" ? it === "onCompositionEnd" && xr && (Fe = zg()) : (Jl = ce, wu = "value" in Jl ? Jl.value : Jl.textContent, xr = !0)), Ne = Os(W, it), 0 < Ne.length && (it = new jg(
          it,
          e,
          null,
          l,
          ce
        ), de.push({ event: it, listeners: Ne }), Fe ? it.data = Fe : (Fe = Ig(l), Fe !== null && (it.data = Fe)))), (Fe = WS ? ew(e, l) : tw(e, l)) && (it = Os(W, "onBeforeInput"), 0 < it.length && (Ne = new jg(
          "onBeforeInput",
          "beforeinput",
          null,
          l,
          ce
        ), de.push({
          event: Ne,
          listeners: it
        }), Ne.data = Fe)), Xw(
          de,
          e,
          W,
          l,
          ce
        );
      }
      Ey(de, t);
    });
  }
  function Ga(e, t, l) {
    return {
      instance: e,
      listener: t,
      currentTarget: l
    };
  }
  function Os(e, t) {
    for (var l = t + "Capture", r = []; e !== null; ) {
      var s = e, c = s.stateNode;
      if (s = s.tag, s !== 5 && s !== 26 && s !== 27 || c === null || (s = fa(e, l), s != null && r.unshift(
        Ga(e, s, c)
      ), s = fa(e, t), s != null && r.push(
        Ga(e, s, c)
      )), e.tag === 3) return r;
      e = e.return;
    }
    return [];
  }
  function Zw(e) {
    if (e === null) return null;
    do
      e = e.return;
    while (e && e.tag !== 5 && e.tag !== 27);
    return e || null;
  }
  function Ry(e, t, l, r, s) {
    for (var c = t._reactName, h = []; l !== null && l !== r; ) {
      var T = l, I = T.alternate, W = T.stateNode;
      if (T = T.tag, I !== null && I === r) break;
      T !== 5 && T !== 26 && T !== 27 || W === null || (I = W, s ? (W = fa(l, c), W != null && h.unshift(
        Ga(l, W, I)
      )) : s || (W = fa(l, c), W != null && h.push(
        Ga(l, W, I)
      ))), l = l.return;
    }
    h.length !== 0 && e.push({ event: t, listeners: h });
  }
  var Jw = /\r\n?/g, $w = /\u0000|\uFFFD/g;
  function Cy(e) {
    return (typeof e == "string" ? e : "" + e).replace(Jw, `
`).replace($w, "");
  }
  function Oy(e, t) {
    return t = Cy(t), Cy(e) === t;
  }
  function wt(e, t, l, r, s, c) {
    switch (l) {
      case "children":
        typeof r == "string" ? t === "body" || t === "textarea" && r === "" || yr(e, r) : (typeof r == "number" || typeof r == "bigint") && t !== "body" && yr(e, "" + r);
        break;
      case "className":
        Di(e, "class", r);
        break;
      case "tabIndex":
        Di(e, "tabindex", r);
        break;
      case "dir":
      case "role":
      case "viewBox":
      case "width":
      case "height":
        Di(e, l, r);
        break;
      case "style":
        Og(e, r, c);
        break;
      case "data":
        if (t !== "object") {
          Di(e, "data", r);
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
        r = ji("" + r), e.setAttribute(l, r);
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
          typeof c == "function" && (l === "formAction" ? (t !== "input" && wt(e, t, "name", s.name, s, null), wt(
            e,
            t,
            "formEncType",
            s.formEncType,
            s,
            null
          ), wt(
            e,
            t,
            "formMethod",
            s.formMethod,
            s,
            null
          ), wt(
            e,
            t,
            "formTarget",
            s.formTarget,
            s,
            null
          )) : (wt(e, t, "encType", s.encType, s, null), wt(e, t, "method", s.method, s, null), wt(e, t, "target", s.target, s, null)));
        if (r == null || typeof r == "symbol" || typeof r == "boolean") {
          e.removeAttribute(l);
          break;
        }
        r = ji("" + r), e.setAttribute(l, r);
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
        l = ji("" + r), e.setAttributeNS(
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
        ot("beforetoggle", e), ot("toggle", e), zi(e, "popover", r);
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
        zi(e, "is", r);
        break;
      case "innerText":
      case "textContent":
        break;
      default:
        (!(2 < l.length) || l[0] !== "o" && l[0] !== "O" || l[1] !== "n" && l[1] !== "N") && (l = CS.get(l) || l, zi(e, l, r));
    }
  }
  function od(e, t, l, r, s, c) {
    switch (l) {
      case "style":
        Og(e, r, c);
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
        if (!vg.hasOwnProperty(l))
          e: {
            if (l[0] === "o" && l[1] === "n" && (s = l.endsWith("Capture"), t = l.slice(2, s ? l.length - 7 : void 0), c = e[cn] || null, c = c != null ? c[l] : null, typeof c == "function" && e.removeEventListener(t, c, s), typeof r == "function")) {
              typeof c != "function" && c !== null && (l in e ? e[l] = null : e.hasAttribute(l) && e.removeAttribute(l)), e.addEventListener(t, r, s);
              break e;
            }
            l in e ? e[l] = r : r === !0 ? e.setAttribute(l, "") : zi(e, l, r);
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
                  wt(e, t, c, h, l, null);
              }
          }
        s && wt(e, t, "srcSet", l.srcSet, l, null), r && wt(e, t, "src", l.src, l, null);
        return;
      case "input":
        ot("invalid", e);
        var T = c = h = s = null, I = null, W = null;
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
                  W = ce;
                  break;
                case "value":
                  c = ce;
                  break;
                case "defaultValue":
                  T = ce;
                  break;
                case "children":
                case "dangerouslySetInnerHTML":
                  if (ce != null)
                    throw Error(i(137, t));
                  break;
                default:
                  wt(e, t, r, ce, l, null);
              }
          }
        Eg(
          e,
          c,
          T,
          I,
          W,
          h,
          s,
          !1
        );
        return;
      case "select":
        ot("invalid", e), r = h = c = null;
        for (s in l)
          if (l.hasOwnProperty(s) && (T = l[s], T != null))
            switch (s) {
              case "value":
                c = T;
                break;
              case "defaultValue":
                h = T;
                break;
              case "multiple":
                r = T;
              default:
                wt(e, t, s, T, l, null);
            }
        t = c, l = h, e.multiple = !!r, t != null ? hr(e, !!r, t, !1) : l != null && hr(e, !!r, l, !0);
        return;
      case "textarea":
        ot("invalid", e), c = s = r = null;
        for (h in l)
          if (l.hasOwnProperty(h) && (T = l[h], T != null))
            switch (h) {
              case "value":
                r = T;
                break;
              case "defaultValue":
                s = T;
                break;
              case "children":
                c = T;
                break;
              case "dangerouslySetInnerHTML":
                if (T != null) throw Error(i(91));
                break;
              default:
                wt(e, t, h, T, l, null);
            }
        Rg(e, r, s, c);
        return;
      case "option":
        for (I in l)
          l.hasOwnProperty(I) && (r = l[I], r != null) && (I === "selected" ? e.selected = r && typeof r != "function" && typeof r != "symbol" : wt(e, t, I, r, l, null));
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
        for (r = 0; r < Ya.length; r++)
          ot(Ya[r], e);
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
        for (W in l)
          if (l.hasOwnProperty(W) && (r = l[W], r != null))
            switch (W) {
              case "children":
              case "dangerouslySetInnerHTML":
                throw Error(i(137, t));
              default:
                wt(e, t, W, r, l, null);
            }
        return;
      default:
        if (yu(t)) {
          for (ce in l)
            l.hasOwnProperty(ce) && (r = l[ce], r !== void 0 && od(
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
    for (T in l)
      l.hasOwnProperty(T) && (r = l[T], r != null && wt(e, t, T, r, l, null));
  }
  function Ww(e, t, l, r) {
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
        var s = null, c = null, h = null, T = null, I = null, W = null, ce = null;
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
                r.hasOwnProperty(le) || wt(e, t, le, null, r, de);
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
                W = le;
                break;
              case "defaultChecked":
                ce = le;
                break;
              case "value":
                h = le;
                break;
              case "defaultValue":
                T = le;
                break;
              case "children":
              case "dangerouslySetInnerHTML":
                if (le != null)
                  throw Error(i(137, t));
                break;
              default:
                le !== de && wt(
                  e,
                  t,
                  te,
                  le,
                  r,
                  de
                );
            }
        }
        mu(
          e,
          h,
          T,
          I,
          W,
          ce,
          c,
          s
        );
        return;
      case "select":
        le = h = T = te = null;
        for (c in l)
          if (I = l[c], l.hasOwnProperty(c) && I != null)
            switch (c) {
              case "value":
                break;
              case "multiple":
                le = I;
              default:
                r.hasOwnProperty(c) || wt(
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
                T = c;
                break;
              case "multiple":
                h = c;
              default:
                c !== I && wt(
                  e,
                  t,
                  s,
                  c,
                  r,
                  I
                );
            }
        t = T, l = h, r = le, te != null ? hr(e, !!l, te, !1) : !!r != !!l && (t != null ? hr(e, !!l, t, !0) : hr(e, !!l, l ? [] : "", !1));
        return;
      case "textarea":
        le = te = null;
        for (T in l)
          if (s = l[T], l.hasOwnProperty(T) && s != null && !r.hasOwnProperty(T))
            switch (T) {
              case "value":
                break;
              case "children":
                break;
              default:
                wt(e, t, T, null, r, s);
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
                s !== c && wt(e, t, h, s, r, c);
            }
        Tg(e, te, le);
        return;
      case "option":
        for (var De in l)
          te = l[De], l.hasOwnProperty(De) && te != null && !r.hasOwnProperty(De) && (De === "selected" ? e.selected = !1 : wt(
            e,
            t,
            De,
            null,
            r,
            te
          ));
        for (I in r)
          te = r[I], le = l[I], r.hasOwnProperty(I) && te !== le && (te != null || le != null) && (I === "selected" ? e.selected = te && typeof te != "function" && typeof te != "symbol" : wt(
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
          te = l[Ve], l.hasOwnProperty(Ve) && te != null && !r.hasOwnProperty(Ve) && wt(e, t, Ve, null, r, te);
        for (W in r)
          if (te = r[W], le = l[W], r.hasOwnProperty(W) && te !== le && (te != null || le != null))
            switch (W) {
              case "children":
              case "dangerouslySetInnerHTML":
                if (te != null)
                  throw Error(i(137, t));
                break;
              default:
                wt(
                  e,
                  t,
                  W,
                  te,
                  r,
                  le
                );
            }
        return;
      default:
        if (yu(t)) {
          for (var Et in l)
            te = l[Et], l.hasOwnProperty(Et) && te !== void 0 && !r.hasOwnProperty(Et) && od(
              e,
              t,
              Et,
              void 0,
              r,
              te
            );
          for (ce in r)
            te = r[ce], le = l[ce], !r.hasOwnProperty(ce) || te === le || te === void 0 && le === void 0 || od(
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
      te = l[F], l.hasOwnProperty(F) && te != null && !r.hasOwnProperty(F) && wt(e, t, F, null, r, te);
    for (de in r)
      te = r[de], le = l[de], !r.hasOwnProperty(de) || te === le || te == null && le == null || wt(e, t, de, te, r, le);
  }
  function My(e) {
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
  function eE() {
    if (typeof performance.getEntriesByType == "function") {
      for (var e = 0, t = 0, l = performance.getEntriesByType("resource"), r = 0; r < l.length; r++) {
        var s = l[r], c = s.transferSize, h = s.initiatorType, T = s.duration;
        if (c && T && My(h)) {
          for (h = 0, T = s.responseEnd, r += 1; r < l.length; r++) {
            var I = l[r], W = I.startTime;
            if (W > T) break;
            var ce = I.transferSize, de = I.initiatorType;
            ce && My(de) && (I = I.responseEnd, h += ce * (I < T ? 1 : (T - W) / (I - W)));
          }
          if (--r, t += 8 * (c + h) / (s.duration / 1e3), e++, 10 < e) break;
        }
      }
      if (0 < e) return t / e / 1e6;
    }
    return navigator.connection && (e = navigator.connection.downlink, typeof e == "number") ? e : 5;
  }
  var rd = null, ad = null;
  function Ms(e) {
    return e.nodeType === 9 ? e : e.ownerDocument;
  }
  function Ay(e) {
    switch (e) {
      case "http://www.w3.org/2000/svg":
        return 1;
      case "http://www.w3.org/1998/Math/MathML":
        return 2;
      default:
        return 0;
    }
  }
  function zy(e, t) {
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
  function id(e, t) {
    return e === "textarea" || e === "noscript" || typeof t.children == "string" || typeof t.children == "number" || typeof t.children == "bigint" || typeof t.dangerouslySetInnerHTML == "object" && t.dangerouslySetInnerHTML !== null && t.dangerouslySetInnerHTML.__html != null;
  }
  var sd = null;
  function tE() {
    var e = window.event;
    return e && e.type === "popstate" ? e === sd ? !1 : (sd = e, !0) : (sd = null, !1);
  }
  var Dy = typeof setTimeout == "function" ? setTimeout : void 0, nE = typeof clearTimeout == "function" ? clearTimeout : void 0, Ny = typeof Promise == "function" ? Promise : void 0, lE = typeof queueMicrotask == "function" ? queueMicrotask : typeof Ny < "u" ? function(e) {
    return Ny.resolve(null).then(e).catch(oE);
  } : Dy;
  function oE(e) {
    setTimeout(function() {
      throw e;
    });
  }
  function mo(e) {
    return e === "head";
  }
  function jy(e, t) {
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
          qa(e.ownerDocument.documentElement);
        else if (l === "head") {
          l = e.ownerDocument.head, qa(l);
          for (var c = l.firstChild; c; ) {
            var h = c.nextSibling, T = c.nodeName;
            c[ca] || T === "SCRIPT" || T === "STYLE" || T === "LINK" && c.rel.toLowerCase() === "stylesheet" || l.removeChild(c), c = h;
          }
        } else
          l === "body" && qa(e.ownerDocument.body);
      l = s;
    } while (l);
    Kr(t);
  }
  function ky(e, t) {
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
  function cd(e) {
    var t = e.firstChild;
    for (t && t.nodeType === 10 && (t = t.nextSibling); t; ) {
      var l = t;
      switch (t = t.nextSibling, l.nodeName) {
        case "HTML":
        case "HEAD":
        case "BODY":
          cd(l), pu(l);
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
  function rE(e, t, l, r) {
    for (; e.nodeType === 1; ) {
      var s = l;
      if (e.nodeName.toLowerCase() !== t.toLowerCase()) {
        if (!r && (e.nodeName !== "INPUT" || e.type !== "hidden"))
          break;
      } else if (r) {
        if (!e[ca])
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
  function aE(e, t, l) {
    if (t === "") return null;
    for (; e.nodeType !== 3; )
      if ((e.nodeType !== 1 || e.nodeName !== "INPUT" || e.type !== "hidden") && !l || (e = Jn(e.nextSibling), e === null)) return null;
    return e;
  }
  function _y(e, t) {
    for (; e.nodeType !== 8; )
      if ((e.nodeType !== 1 || e.nodeName !== "INPUT" || e.type !== "hidden") && !t || (e = Jn(e.nextSibling), e === null)) return null;
    return e;
  }
  function ud(e) {
    return e.data === "$?" || e.data === "$~";
  }
  function fd(e) {
    return e.data === "$!" || e.data === "$?" && e.ownerDocument.readyState !== "loading";
  }
  function iE(e, t) {
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
  var dd = null;
  function Hy(e) {
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
  function Uy(e) {
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
  function Ly(e, t, l) {
    switch (t = Ms(l), e) {
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
  function qa(e) {
    for (var t = e.attributes; t.length; )
      e.removeAttributeNode(t[0]);
    pu(e);
  }
  var $n = /* @__PURE__ */ new Map(), Iy = /* @__PURE__ */ new Set();
  function As(e) {
    return typeof e.getRootNode == "function" ? e.getRootNode() : e.nodeType === 9 ? e : e.ownerDocument;
  }
  var _l = Y.d;
  Y.d = {
    f: sE,
    r: cE,
    D: uE,
    C: fE,
    L: dE,
    m: pE,
    X: mE,
    S: gE,
    M: hE
  };
  function sE() {
    var e = _l.f(), t = xs();
    return e || t;
  }
  function cE(e) {
    var t = pr(e);
    t !== null && t.tag === 5 && t.type === "form" ? nh(t) : _l.r(e);
  }
  var qr = typeof document > "u" ? null : document;
  function By(e, t, l) {
    var r = qr;
    if (r && typeof t == "string" && t) {
      var s = Gn(t);
      s = 'link[rel="' + e + '"][href="' + s + '"]', typeof l == "string" && (s += '[crossorigin="' + l + '"]'), Iy.has(s) || (Iy.add(s), e = { rel: e, crossOrigin: l, href: t }, r.querySelector(s) === null && (t = r.createElement("link"), pn(t, "link", e), ln(t), r.head.appendChild(t)));
    }
  }
  function uE(e) {
    _l.D(e), By("dns-prefetch", e, null);
  }
  function fE(e, t) {
    _l.C(e, t), By("preconnect", e, t);
  }
  function dE(e, t, l) {
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
      ), $n.set(c, e), r.querySelector(s) !== null || t === "style" && r.querySelector(Xa(c)) || t === "script" && r.querySelector(Fa(c)) || (t = r.createElement("link"), pn(t, "link", e), ln(t), r.head.appendChild(t)));
    }
  }
  function pE(e, t) {
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
            if (l.querySelector(Fa(c)))
              return;
        }
        r = l.createElement("link"), pn(r, "link", e), ln(r), l.head.appendChild(r);
      }
    }
  }
  function gE(e, t, l) {
    _l.S(e, t, l);
    var r = qr;
    if (r && e) {
      var s = gr(r).hoistableStyles, c = Xr(e);
      t = t || "default";
      var h = s.get(c);
      if (!h) {
        var T = { loading: 0, preload: null };
        if (h = r.querySelector(
          Xa(c)
        ))
          T.loading = 5;
        else {
          e = b(
            { rel: "stylesheet", href: e, "data-precedence": t },
            l
          ), (l = $n.get(c)) && pd(e, l);
          var I = h = r.createElement("link");
          ln(I), pn(I, "link", e), I._p = new Promise(function(W, ce) {
            I.onload = W, I.onerror = ce;
          }), I.addEventListener("load", function() {
            T.loading |= 1;
          }), I.addEventListener("error", function() {
            T.loading |= 2;
          }), T.loading |= 4, zs(h, t, r);
        }
        h = {
          type: "stylesheet",
          instance: h,
          count: 1,
          state: T
        }, s.set(c, h);
      }
    }
  }
  function mE(e, t) {
    _l.X(e, t);
    var l = qr;
    if (l && e) {
      var r = gr(l).hoistableScripts, s = Fr(e), c = r.get(s);
      c || (c = l.querySelector(Fa(s)), c || (e = b({ src: e, async: !0 }, t), (t = $n.get(s)) && gd(e, t), c = l.createElement("script"), ln(c), pn(c, "link", e), l.head.appendChild(c)), c = {
        type: "script",
        instance: c,
        count: 1,
        state: null
      }, r.set(s, c));
    }
  }
  function hE(e, t) {
    _l.M(e, t);
    var l = qr;
    if (l && e) {
      var r = gr(l).hoistableScripts, s = Fr(e), c = r.get(s);
      c || (c = l.querySelector(Fa(s)), c || (e = b({ src: e, async: !0, type: "module" }, t), (t = $n.get(s)) && gd(e, t), c = l.createElement("script"), ln(c), pn(c, "link", e), l.head.appendChild(c)), c = {
        type: "script",
        instance: c,
        count: 1,
        state: null
      }, r.set(s, c));
    }
  }
  function Vy(e, t, l, r) {
    var s = (s = ie.current) ? As(s) : null;
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
            Xa(e)
          )) && !c._p && (h.instance = c, h.state.loading = 5), $n.has(e) || (l = {
            rel: "preload",
            as: "style",
            href: l.href,
            crossOrigin: l.crossOrigin,
            integrity: l.integrity,
            media: l.media,
            hrefLang: l.hrefLang,
            referrerPolicy: l.referrerPolicy
          }, $n.set(e, l), c || yE(
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
  function Xa(e) {
    return 'link[rel="stylesheet"][' + e + "]";
  }
  function Py(e) {
    return b({}, e, {
      "data-precedence": e.precedence,
      precedence: null
    });
  }
  function yE(e, t, l, r) {
    e.querySelector('link[rel="preload"][as="style"][' + t + "]") ? r.loading = 1 : (t = e.createElement("link"), r.preload = t, t.addEventListener("load", function() {
      return r.loading |= 1;
    }), t.addEventListener("error", function() {
      return r.loading |= 2;
    }), pn(t, "link", l), ln(t), e.head.appendChild(t));
  }
  function Fr(e) {
    return '[src="' + Gn(e) + '"]';
  }
  function Fa(e) {
    return "script[async]" + e;
  }
  function Yy(e, t, l) {
    if (t.count++, t.instance === null)
      switch (t.type) {
        case "style":
          var r = e.querySelector(
            'style[data-href~="' + Gn(l.href) + '"]'
          );
          if (r)
            return t.instance = r, ln(r), r;
          var s = b({}, l, {
            "data-href": l.href,
            "data-precedence": l.precedence,
            href: null,
            precedence: null
          });
          return r = (e.ownerDocument || e).createElement(
            "style"
          ), ln(r), pn(r, "style", s), zs(r, l.precedence, e), t.instance = r;
        case "stylesheet":
          s = Xr(l.href);
          var c = e.querySelector(
            Xa(s)
          );
          if (c)
            return t.state.loading |= 4, t.instance = c, ln(c), c;
          r = Py(l), (s = $n.get(s)) && pd(r, s), c = (e.ownerDocument || e).createElement("link"), ln(c);
          var h = c;
          return h._p = new Promise(function(T, I) {
            h.onload = T, h.onerror = I;
          }), pn(c, "link", r), t.state.loading |= 4, zs(c, l.precedence, e), t.instance = c;
        case "script":
          return c = Fr(l.src), (s = e.querySelector(
            Fa(c)
          )) ? (t.instance = s, ln(s), s) : (r = l, (s = $n.get(c)) && (r = b({}, l), gd(r, s)), e = e.ownerDocument || e, s = e.createElement("script"), ln(s), pn(s, "link", r), e.head.appendChild(s), t.instance = s);
        case "void":
          return null;
        default:
          throw Error(i(443, t.type));
      }
    else
      t.type === "stylesheet" && (t.state.loading & 4) === 0 && (r = t.instance, t.state.loading |= 4, zs(r, l.precedence, e));
    return t.instance;
  }
  function zs(e, t, l) {
    for (var r = l.querySelectorAll(
      'link[rel="stylesheet"][data-precedence],style[data-precedence]'
    ), s = r.length ? r[r.length - 1] : null, c = s, h = 0; h < r.length; h++) {
      var T = r[h];
      if (T.dataset.precedence === t) c = T;
      else if (c !== s) break;
    }
    c ? c.parentNode.insertBefore(e, c.nextSibling) : (t = l.nodeType === 9 ? l.head : l, t.insertBefore(e, t.firstChild));
  }
  function pd(e, t) {
    e.crossOrigin == null && (e.crossOrigin = t.crossOrigin), e.referrerPolicy == null && (e.referrerPolicy = t.referrerPolicy), e.title == null && (e.title = t.title);
  }
  function gd(e, t) {
    e.crossOrigin == null && (e.crossOrigin = t.crossOrigin), e.referrerPolicy == null && (e.referrerPolicy = t.referrerPolicy), e.integrity == null && (e.integrity = t.integrity);
  }
  var Ds = null;
  function Gy(e, t, l) {
    if (Ds === null) {
      var r = /* @__PURE__ */ new Map(), s = Ds = /* @__PURE__ */ new Map();
      s.set(l, r);
    } else
      s = Ds, r = s.get(l), r || (r = /* @__PURE__ */ new Map(), s.set(l, r));
    if (r.has(e)) return r;
    for (r.set(e, null), l = l.getElementsByTagName(e), s = 0; s < l.length; s++) {
      var c = l[s];
      if (!(c[ca] || c[Ct] || e === "link" && c.getAttribute("rel") === "stylesheet") && c.namespaceURI !== "http://www.w3.org/2000/svg") {
        var h = c.getAttribute(t) || "";
        h = e + h;
        var T = r.get(h);
        T ? T.push(c) : r.set(h, [c]);
      }
    }
    return r;
  }
  function qy(e, t, l) {
    e = e.ownerDocument || e, e.head.insertBefore(
      l,
      t === "title" ? e.querySelector("head > title") : null
    );
  }
  function vE(e, t, l) {
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
  function Xy(e) {
    return !(e.type === "stylesheet" && (e.state.loading & 3) === 0);
  }
  function bE(e, t, l, r) {
    if (l.type === "stylesheet" && (typeof r.media != "string" || matchMedia(r.media).matches !== !1) && (l.state.loading & 4) === 0) {
      if (l.instance === null) {
        var s = Xr(r.href), c = t.querySelector(
          Xa(s)
        );
        if (c) {
          t = c._p, t !== null && typeof t == "object" && typeof t.then == "function" && (e.count++, e = Ns.bind(e), t.then(e, e)), l.state.loading |= 4, l.instance = c, ln(c);
          return;
        }
        c = t.ownerDocument || t, r = Py(r), (s = $n.get(s)) && pd(r, s), c = c.createElement("link"), ln(c);
        var h = c;
        h._p = new Promise(function(T, I) {
          h.onload = T, h.onerror = I;
        }), pn(c, "link", r), l.instance = c;
      }
      e.stylesheets === null && (e.stylesheets = /* @__PURE__ */ new Map()), e.stylesheets.set(l, t), (t = l.state.preload) && (l.state.loading & 3) === 0 && (e.count++, l = Ns.bind(e), t.addEventListener("load", l), t.addEventListener("error", l));
    }
  }
  var md = 0;
  function xE(e, t) {
    return e.stylesheets && e.count === 0 && ks(e, e.stylesheets), 0 < e.count || 0 < e.imgCount ? function(l) {
      var r = setTimeout(function() {
        if (e.stylesheets && ks(e, e.stylesheets), e.unsuspend) {
          var c = e.unsuspend;
          e.unsuspend = null, c();
        }
      }, 6e4 + t);
      0 < e.imgBytes && md === 0 && (md = 62500 * eE());
      var s = setTimeout(
        function() {
          if (e.waitingForImages = !1, e.count === 0 && (e.stylesheets && ks(e, e.stylesheets), e.unsuspend)) {
            var c = e.unsuspend;
            e.unsuspend = null, c();
          }
        },
        (e.imgBytes > md ? 50 : 800) + t
      );
      return e.unsuspend = l, function() {
        e.unsuspend = null, clearTimeout(r), clearTimeout(s);
      };
    } : null;
  }
  function Ns() {
    if (this.count--, this.count === 0 && (this.imgCount === 0 || !this.waitingForImages)) {
      if (this.stylesheets) ks(this, this.stylesheets);
      else if (this.unsuspend) {
        var e = this.unsuspend;
        this.unsuspend = null, e();
      }
    }
  }
  var js = null;
  function ks(e, t) {
    e.stylesheets = null, e.unsuspend !== null && (e.count++, js = /* @__PURE__ */ new Map(), t.forEach(SE, e), js = null, Ns.call(e));
  }
  function SE(e, t) {
    if (!(t.state.loading & 4)) {
      var l = js.get(e);
      if (l) var r = l.get(null);
      else {
        l = /* @__PURE__ */ new Map(), js.set(e, l);
        for (var s = e.querySelectorAll(
          "link[data-precedence],style[data-precedence]"
        ), c = 0; c < s.length; c++) {
          var h = s[c];
          (h.nodeName === "LINK" || h.getAttribute("media") !== "not all") && (l.set(h.dataset.precedence, h), r = h);
        }
        r && l.set(null, r);
      }
      s = t.instance, h = s.getAttribute("data-precedence"), c = l.get(h) || r, c === r && l.set(null, s), l.set(h, s), this.count++, r = Ns.bind(this), s.addEventListener("load", r), s.addEventListener("error", r), c ? c.parentNode.insertBefore(s, c.nextSibling) : (e = e.nodeType === 9 ? e.head : e, e.insertBefore(s, e.firstChild)), t.state.loading |= 4;
    }
  }
  var Ka = {
    $$typeof: z,
    Provider: null,
    Consumer: null,
    _currentValue: V,
    _currentValue2: V,
    _threadCount: 0
  };
  function wE(e, t, l, r, s, c, h, T, I) {
    this.tag = 1, this.containerInfo = e, this.pingCache = this.current = this.pendingChildren = null, this.timeoutHandle = -1, this.callbackNode = this.next = this.pendingContext = this.context = this.cancelPendingCommit = null, this.callbackPriority = 0, this.expirationTimes = Vn(-1), this.entangledLanes = this.shellSuspendCounter = this.errorRecoveryDisabledLanes = this.expiredLanes = this.warmLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0, this.entanglements = Vn(0), this.hiddenUpdates = Vn(null), this.identifierPrefix = r, this.onUncaughtError = s, this.onCaughtError = c, this.onRecoverableError = h, this.pooledCache = null, this.pooledCacheLanes = 0, this.formState = I, this.incompleteTransitions = /* @__PURE__ */ new Map();
  }
  function Fy(e, t, l, r, s, c, h, T, I, W, ce, de) {
    return e = new wE(
      e,
      t,
      l,
      h,
      I,
      W,
      ce,
      de,
      T
    ), t = 1, c === !0 && (t |= 24), c = Nn(3, null, null, t), e.current = c, c.stateNode = e, t = Fu(), t.refCount++, e.pooledCache = t, t.refCount++, c.memoizedState = {
      element: r,
      isDehydrated: l,
      cache: t
    }, Ju(c), e;
  }
  function Ky(e) {
    return e ? (e = Tr, e) : Tr;
  }
  function Qy(e, t, l, r, s, c) {
    s = Ky(s), r.context === null ? r.context = s : r.pendingContext = s, r = lo(t), r.payload = { element: l }, c = c === void 0 ? null : c, c !== null && (r.callback = c), l = oo(e, r, t), l !== null && (On(l, e, t), Ca(l, e, t));
  }
  function Zy(e, t) {
    if (e = e.memoizedState, e !== null && e.dehydrated !== null) {
      var l = e.retryLane;
      e.retryLane = l !== 0 && l < t ? l : t;
    }
  }
  function hd(e, t) {
    Zy(e, t), (e = e.alternate) && Zy(e, t);
  }
  function Jy(e) {
    if (e.tag === 13 || e.tag === 31) {
      var t = Io(e, 67108864);
      t !== null && On(t, e, 67108864), hd(e, 67108864);
    }
  }
  function $y(e) {
    if (e.tag === 13 || e.tag === 31) {
      var t = Un();
      t = qe(t);
      var l = Io(e, t);
      l !== null && On(l, e, t), hd(e, t);
    }
  }
  var _s = !0;
  function EE(e, t, l, r) {
    var s = H.T;
    H.T = null;
    var c = Y.p;
    try {
      Y.p = 2, yd(e, t, l, r);
    } finally {
      Y.p = c, H.T = s;
    }
  }
  function TE(e, t, l, r) {
    var s = H.T;
    H.T = null;
    var c = Y.p;
    try {
      Y.p = 8, yd(e, t, l, r);
    } finally {
      Y.p = c, H.T = s;
    }
  }
  function yd(e, t, l, r) {
    if (_s) {
      var s = vd(r);
      if (s === null)
        ld(
          e,
          t,
          r,
          Hs,
          l
        ), ev(e, r);
      else if (CE(
        s,
        e,
        t,
        l,
        r
      ))
        r.stopPropagation();
      else if (ev(e, r), t & 4 && -1 < RE.indexOf(e)) {
        for (; s !== null; ) {
          var c = pr(s);
          if (c !== null)
            switch (c.tag) {
              case 3:
                if (c = c.stateNode, c.current.memoizedState.isDehydrated) {
                  var h = Ut(c.pendingLanes);
                  if (h !== 0) {
                    var T = c;
                    for (T.pendingLanes |= 2, T.entangledLanes |= 2; h; ) {
                      var I = 1 << 31 - mt(h);
                      T.entanglements[1] |= I, h &= ~I;
                    }
                    cl(c), (dt & 6) === 0 && (vs = ae() + 500, Pa(0));
                  }
                }
                break;
              case 31:
              case 13:
                T = Io(c, 2), T !== null && On(T, c, 2), xs(), hd(c, 2);
            }
          if (c = vd(r), c === null && ld(
            e,
            t,
            r,
            Hs,
            l
          ), c === s) break;
          s = c;
        }
        s !== null && r.stopPropagation();
      } else
        ld(
          e,
          t,
          r,
          null,
          l
        );
    }
  }
  function vd(e) {
    return e = bu(e), bd(e);
  }
  var Hs = null;
  function bd(e) {
    if (Hs = null, e = dr(e), e !== null) {
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
    return Hs = e, null;
  }
  function Wy(e) {
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
  var xd = !1, ho = null, yo = null, vo = null, Qa = /* @__PURE__ */ new Map(), Za = /* @__PURE__ */ new Map(), bo = [], RE = "mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset".split(
    " "
  );
  function ev(e, t) {
    switch (e) {
      case "focusin":
      case "focusout":
        ho = null;
        break;
      case "dragenter":
      case "dragleave":
        yo = null;
        break;
      case "mouseover":
      case "mouseout":
        vo = null;
        break;
      case "pointerover":
      case "pointerout":
        Qa.delete(t.pointerId);
        break;
      case "gotpointercapture":
      case "lostpointercapture":
        Za.delete(t.pointerId);
    }
  }
  function Ja(e, t, l, r, s, c) {
    return e === null || e.nativeEvent !== c ? (e = {
      blockedOn: t,
      domEventName: l,
      eventSystemFlags: r,
      nativeEvent: c,
      targetContainers: [s]
    }, t !== null && (t = pr(t), t !== null && Jy(t)), e) : (e.eventSystemFlags |= r, t = e.targetContainers, s !== null && t.indexOf(s) === -1 && t.push(s), e);
  }
  function CE(e, t, l, r, s) {
    switch (t) {
      case "focusin":
        return ho = Ja(
          ho,
          e,
          t,
          l,
          r,
          s
        ), !0;
      case "dragenter":
        return yo = Ja(
          yo,
          e,
          t,
          l,
          r,
          s
        ), !0;
      case "mouseover":
        return vo = Ja(
          vo,
          e,
          t,
          l,
          r,
          s
        ), !0;
      case "pointerover":
        var c = s.pointerId;
        return Qa.set(
          c,
          Ja(
            Qa.get(c) || null,
            e,
            t,
            l,
            r,
            s
          )
        ), !0;
      case "gotpointercapture":
        return c = s.pointerId, Za.set(
          c,
          Ja(
            Za.get(c) || null,
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
  function tv(e) {
    var t = dr(e.target);
    if (t !== null) {
      var l = f(t);
      if (l !== null) {
        if (t = l.tag, t === 13) {
          if (t = p(l), t !== null) {
            e.blockedOn = t, nn(e.priority, function() {
              $y(l);
            });
            return;
          }
        } else if (t === 31) {
          if (t = g(l), t !== null) {
            e.blockedOn = t, nn(e.priority, function() {
              $y(l);
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
  function Us(e) {
    if (e.blockedOn !== null) return !1;
    for (var t = e.targetContainers; 0 < t.length; ) {
      var l = vd(e.nativeEvent);
      if (l === null) {
        l = e.nativeEvent;
        var r = new l.constructor(
          l.type,
          l
        );
        vu = r, l.target.dispatchEvent(r), vu = null;
      } else
        return t = pr(l), t !== null && Jy(t), e.blockedOn = l, !1;
      t.shift();
    }
    return !0;
  }
  function nv(e, t, l) {
    Us(e) && l.delete(t);
  }
  function OE() {
    xd = !1, ho !== null && Us(ho) && (ho = null), yo !== null && Us(yo) && (yo = null), vo !== null && Us(vo) && (vo = null), Qa.forEach(nv), Za.forEach(nv);
  }
  function Ls(e, t) {
    e.blockedOn === t && (e.blockedOn = null, xd || (xd = !0, n.unstable_scheduleCallback(
      n.unstable_NormalPriority,
      OE
    )));
  }
  var Is = null;
  function lv(e) {
    Is !== e && (Is = e, n.unstable_scheduleCallback(
      n.unstable_NormalPriority,
      function() {
        Is === e && (Is = null);
        for (var t = 0; t < e.length; t += 3) {
          var l = e[t], r = e[t + 1], s = e[t + 2];
          if (typeof r != "function") {
            if (bd(r || l) === null)
              continue;
            break;
          }
          var c = pr(l);
          c !== null && (e.splice(t, 3), t -= 3, vf(
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
      return Ls(I, e);
    }
    ho !== null && Ls(ho, e), yo !== null && Ls(yo, e), vo !== null && Ls(vo, e), Qa.forEach(t), Za.forEach(t);
    for (var l = 0; l < bo.length; l++) {
      var r = bo[l];
      r.blockedOn === e && (r.blockedOn = null);
    }
    for (; 0 < bo.length && (l = bo[0], l.blockedOn === null); )
      tv(l), l.blockedOn === null && bo.shift();
    if (l = (e.ownerDocument || e).$$reactFormReplay, l != null)
      for (r = 0; r < l.length; r += 3) {
        var s = l[r], c = l[r + 1], h = s[cn] || null;
        if (typeof c == "function")
          h || lv(l);
        else if (h) {
          var T = null;
          if (c && c.hasAttribute("formAction")) {
            if (s = c, h = c[cn] || null)
              T = h.formAction;
            else if (bd(s) !== null) continue;
          } else T = h.action;
          typeof T == "function" ? l[r + 1] = T : (l.splice(r, 3), r -= 3), lv(l);
        }
      }
  }
  function ov() {
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
  function Sd(e) {
    this._internalRoot = e;
  }
  Bs.prototype.render = Sd.prototype.render = function(e) {
    var t = this._internalRoot;
    if (t === null) throw Error(i(409));
    var l = t.current, r = Un();
    Qy(l, r, e, t, null, null);
  }, Bs.prototype.unmount = Sd.prototype.unmount = function() {
    var e = this._internalRoot;
    if (e !== null) {
      this._internalRoot = null;
      var t = e.containerInfo;
      Qy(e.current, 2, null, e, null, null), xs(), t[rl] = null;
    }
  };
  function Bs(e) {
    this._internalRoot = e;
  }
  Bs.prototype.unstable_scheduleHydration = function(e) {
    if (e) {
      var t = Xt();
      e = { blockedOn: null, target: e, priority: t };
      for (var l = 0; l < bo.length && t !== 0 && t < bo[l].priority; l++) ;
      bo.splice(l, 0, e), l === 0 && tv(e);
    }
  };
  var rv = o.version;
  if (rv !== "19.2.7")
    throw Error(
      i(
        527,
        rv,
        "19.2.7"
      )
    );
  Y.findDOMNode = function(e) {
    var t = e._reactInternals;
    if (t === void 0)
      throw typeof e.render == "function" ? Error(i(188)) : (e = Object.keys(e).join(","), Error(i(268, e)));
    return e = d(t), e = e !== null ? v(e) : null, e = e === null ? null : e.stateNode, e;
  };
  var ME = {
    bundleType: 0,
    version: "19.2.7",
    rendererPackageName: "react-dom",
    currentDispatcherRef: H,
    reconcilerVersion: "19.2.7"
  };
  if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u") {
    var Vs = __REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!Vs.isDisabled && Vs.supportsFiber)
      try {
        et = Vs.inject(
          ME
        ), gt = Vs;
      } catch {
      }
  }
  return Wa.createRoot = function(e, t) {
    if (!u(e)) throw Error(i(299));
    var l = !1, r = "", s = dh, c = ph, h = gh;
    return t != null && (t.unstable_strictMode === !0 && (l = !0), t.identifierPrefix !== void 0 && (r = t.identifierPrefix), t.onUncaughtError !== void 0 && (s = t.onUncaughtError), t.onCaughtError !== void 0 && (c = t.onCaughtError), t.onRecoverableError !== void 0 && (h = t.onRecoverableError)), t = Fy(
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
      ov
    ), e[rl] = t.current, nd(e), new Sd(t);
  }, Wa.hydrateRoot = function(e, t, l) {
    if (!u(e)) throw Error(i(299));
    var r = !1, s = "", c = dh, h = ph, T = gh, I = null;
    return l != null && (l.unstable_strictMode === !0 && (r = !0), l.identifierPrefix !== void 0 && (s = l.identifierPrefix), l.onUncaughtError !== void 0 && (c = l.onUncaughtError), l.onCaughtError !== void 0 && (h = l.onCaughtError), l.onRecoverableError !== void 0 && (T = l.onRecoverableError), l.formState !== void 0 && (I = l.formState)), t = Fy(
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
      T,
      ov
    ), t.context = Ky(null), l = t.current, r = Un(), r = qe(r), s = lo(r), s.callback = null, oo(l, s, r), l = r, t.current.lanes = l, qt(t, l), cl(t), e[rl] = t.current, nd(e), new Bs(t);
  }, Wa.version = "19.2.7", Wa;
}
var mv;
function BE() {
  if (mv) return Td.exports;
  mv = 1;
  function n() {
    if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function"))
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(n);
      } catch (o) {
        console.error(o);
      }
  }
  return n(), Td.exports = IE(), Td.exports;
}
var VE = BE();
const Mb = (...n) => n.filter((o, a, i) => !!o && o.trim() !== "" && i.indexOf(o) === a).join(" ").trim();
const PE = (n) => n.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
const YE = (n) => n.replace(
  /^([A-Z])|[\s-_]+(\w)/g,
  (o, a, i) => i ? i.toUpperCase() : a.toLowerCase()
);
const hv = (n) => {
  const o = YE(n);
  return o.charAt(0).toUpperCase() + o.slice(1);
};
var Md = {
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
const GE = (n) => {
  for (const o in n)
    if (o.startsWith("aria-") || o === "role" || o === "title")
      return !0;
  return !1;
}, qE = y.createContext({}), XE = () => y.useContext(qE), FE = y.forwardRef(
  ({ color: n, size: o, strokeWidth: a, absoluteStrokeWidth: i, className: u = "", children: f, iconNode: p, ...g }, m) => {
    const {
      size: d = 24,
      strokeWidth: v = 2,
      absoluteStrokeWidth: b = !1,
      color: S = "currentColor",
      className: R = ""
    } = XE() ?? {}, w = i ?? b ? Number(a ?? v) * 24 / Number(o ?? d) : a ?? v;
    return y.createElement(
      "svg",
      {
        ref: m,
        ...Md,
        width: o ?? d ?? Md.width,
        height: o ?? d ?? Md.height,
        stroke: n ?? S,
        strokeWidth: w,
        className: Mb("lucide", R, u),
        ...!f && !GE(g) && { "aria-hidden": "true" },
        ...g
      },
      [
        ...p.map(([M, E]) => y.createElement(M, E)),
        ...Array.isArray(f) ? f : [f]
      ]
    );
  }
);
const sn = (n, o) => {
  const a = y.forwardRef(
    ({ className: i, ...u }, f) => y.createElement(FE, {
      ref: f,
      iconNode: o,
      className: Mb(
        `lucide-${PE(hv(n))}`,
        `lucide-${n}`,
        i
      ),
      ...u
    })
  );
  return a.displayName = hv(n), a;
};
const KE = [["path", { d: "M20 6 9 17l-5-5", key: "1gmf2c" }]], uc = sn("check", KE);
const QE = [["path", { d: "m6 9 6 6 6-6", key: "qrunsl" }]], fc = sn("chevron-down", QE);
const ZE = [["path", { d: "m9 18 6-6-6-6", key: "mthhwq" }]], Wd = sn("chevron-right", ZE);
const JE = [
  ["circle", { cx: "12", cy: "12", r: "1", key: "41hilf" }],
  ["circle", { cx: "19", cy: "12", r: "1", key: "1wjl8i" }],
  ["circle", { cx: "5", cy: "12", r: "1", key: "1pcz8c" }]
], yv = sn("ellipsis", JE);
const $E = [
  [
    "path",
    {
      d: "m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2",
      key: "usdka0"
    }
  ]
], WE = sn("folder-open", $E);
const e1 = [
  [
    "path",
    {
      d: "M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z",
      key: "sc7q7i"
    }
  ]
], t1 = sn("funnel", e1);
const n1 = [
  ["rect", { width: "7", height: "7", x: "3", y: "3", rx: "1", key: "1g98yp" }],
  ["rect", { width: "7", height: "7", x: "14", y: "3", rx: "1", key: "6d4xhi" }],
  ["rect", { width: "7", height: "7", x: "14", y: "14", rx: "1", key: "nxv5o0" }],
  ["rect", { width: "7", height: "7", x: "3", y: "14", rx: "1", key: "1bb6yr" }]
], vv = sn("layout-grid", n1);
const l1 = [["path", { d: "M21 12a9 9 0 1 1-6.219-8.56", key: "13zald" }]], o1 = sn("loader-circle", l1);
const r1 = [
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
], a1 = sn("notebook-pen", r1);
const i1 = [
  ["path", { d: "M5 12h14", key: "1ays0h" }],
  ["path", { d: "M12 5v14", key: "s699le" }]
], s1 = sn("plus", i1);
const c1 = [
  ["path", { d: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8", key: "v9h5vc" }],
  ["path", { d: "M21 3v5h-5", key: "1q7to0" }],
  ["path", { d: "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16", key: "3uifl3" }],
  ["path", { d: "M8 16H3v5", key: "1cv678" }]
], u1 = sn("refresh-cw", c1);
const f1 = [
  ["path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", key: "1357e3" }],
  ["path", { d: "M3 3v5h5", key: "1xhq8a" }]
], d1 = sn("rotate-ccw", f1);
const p1 = [
  ["path", { d: "m21 21-4.34-4.34", key: "14j7rj" }],
  ["circle", { cx: "11", cy: "11", r: "8", key: "4ej97u" }]
], ep = sn("search", p1);
const g1 = [
  [
    "path",
    {
      d: "M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915",
      key: "1i5ecw"
    }
  ],
  ["circle", { cx: "12", cy: "12", r: "3", key: "1v7zrd" }]
], Ab = sn("settings", g1);
const m1 = [
  ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", key: "afitv7" }],
  ["path", { d: "m9 12 2 2 4-4", key: "dzmm74" }]
], h1 = sn("square-check", m1);
const y1 = [
  [
    "path",
    {
      d: "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z",
      key: "r04s7s"
    }
  ]
], tp = sn("star", y1);
const v1 = [
  ["path", { d: "M10 11v6", key: "nco0om" }],
  ["path", { d: "M14 11v6", key: "outv1u" }],
  ["path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6", key: "miytrc" }],
  ["path", { d: "M3 6h18", key: "d0wm0j" }],
  ["path", { d: "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2", key: "e791ji" }]
], zb = sn("trash-2", v1);
const b1 = [
  ["path", { d: "M18 6 6 18", key: "1bl5f8" }],
  ["path", { d: "m6 6 12 12", key: "d8bk6v" }]
], ci = sn("x", b1);
function Ac() {
  return typeof window < "u";
}
function mn(n) {
  return wp(n) ? (n.nodeName || "").toLowerCase() : "#document";
}
function Dt(n) {
  var o;
  return (n == null || (o = n.ownerDocument) == null ? void 0 : o.defaultView) || window;
}
function Fl(n) {
  var o;
  return (o = (wp(n) ? n.ownerDocument : n.document) || window.document) == null ? void 0 : o.documentElement;
}
function wp(n) {
  return Ac() ? n instanceof Node || n instanceof Dt(n).Node : !1;
}
function $e(n) {
  return Ac() ? n instanceof Element || n instanceof Dt(n).Element : !1;
}
function Rt(n) {
  return Ac() ? n instanceof HTMLElement || n instanceof Dt(n).HTMLElement : !1;
}
function ea(n) {
  return !Ac() || typeof ShadowRoot > "u" ? !1 : n instanceof ShadowRoot || n instanceof Dt(n).ShadowRoot;
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
function x1(n) {
  return /^(table|td|th)$/.test(mn(n));
}
function zc(n) {
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
const S1 = /transform|translate|scale|rotate|perspective|filter/, w1 = /paint|layout|strict|content/, $o = (n) => !!n && n !== "none";
let Ad;
function Ep(n) {
  const o = $e(n) ? In(n) : n;
  return $o(o.transform) || $o(o.translate) || $o(o.scale) || $o(o.rotate) || $o(o.perspective) || !Tp() && ($o(o.backdropFilter) || $o(o.filter)) || S1.test(o.willChange || "") || w1.test(o.contain || "");
}
function E1(n) {
  let o = Yl(n);
  for (; Rt(o) && !Bl(o); ) {
    if (Ep(o))
      return o;
    if (zc(o))
      return null;
    o = Yl(o);
  }
  return null;
}
function Tp() {
  return Ad == null && (Ad = typeof CSS < "u" && CSS.supports && CSS.supports("-webkit-backdrop-filter", "none")), Ad;
}
function Bl(n) {
  return /^(html|body|#document)$/.test(mn(n));
}
function In(n) {
  return Dt(n).getComputedStyle(n);
}
function Dc(n) {
  return $e(n) ? {
    scrollLeft: n.scrollLeft,
    scrollTop: n.scrollTop
  } : {
    scrollLeft: n.scrollX,
    scrollTop: n.scrollY
  };
}
function Yl(n) {
  if (mn(n) === "html")
    return n;
  const o = (
    // Step into the shadow DOM of the parent of a slotted node.
    n.assignedSlot || // DOM Element detected.
    n.parentNode || // ShadowRoot detected.
    ea(n) && n.host || // Fallback.
    Fl(n)
  );
  return ea(o) ? o.host : o;
}
function Db(n) {
  const o = Yl(n);
  return Bl(o) ? (n.ownerDocument || n).body : Rt(o) && sr(o) ? o : Db(o);
}
function mi(n, o, a) {
  var i;
  o === void 0 && (o = []), a === void 0 && (a = !0);
  const u = Db(n), f = u === ((i = n.ownerDocument) == null ? void 0 : i.body), p = Dt(u);
  if (f) {
    const g = np(p);
    return o.concat(p, p.visualViewport || [], sr(u) ? u : [], g && a ? mi(g) : []);
  } else
    return o.concat(u, mi(u, [], a));
}
function np(n) {
  return n.parent && Object.getPrototypeOf(n.parent) ? n.frameElement : null;
}
const Rp = {
  ..._E
}, bv = {};
function xn(n, o) {
  const a = y.useRef(bv);
  return a.current === bv && (a.current = n(o)), a;
}
const zd = Rp.useInsertionEffect, T1 = (
  // React 17 doesn't have useInsertionEffect.
  zd && // Preact replaces useInsertionEffect with useLayoutEffect and fires too late.
  zd !== Rp.useLayoutEffect ? zd : (n) => n()
);
function ze(n) {
  const o = xn(R1).current;
  return o.next = n, T1(o.effect), o.trampoline;
}
function R1() {
  const n = {
    next: void 0,
    callback: C1,
    trampoline: (...o) => n.callback?.(...o),
    effect: () => {
      n.callback = n.next;
    }
  };
  return n;
}
function C1() {
}
const O1 = () => {
}, xe = typeof document < "u" ? y.useLayoutEffect : O1;
function lp(n, o) {
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
const Cp = {};
function bn(n, o, a, i, u) {
  if (!a && !i && !u && !n)
    return dc(o);
  let f = dc(n);
  return o && (f = oi(f, o)), a && (f = oi(f, a)), i && (f = oi(f, i)), u && (f = oi(f, u)), f;
}
function M1(n) {
  if (n.length === 0)
    return Cp;
  if (n.length === 1)
    return dc(n[0]);
  let o = dc(n[0]);
  for (let a = 1; a < n.length; a += 1)
    o = oi(o, n[a]);
  return o;
}
function dc(n) {
  return Op(n) ? {
    ...jb(n, Cp)
  } : A1(n);
}
function oi(n, o) {
  return Op(o) ? jb(o, n) : z1(n, o);
}
function A1(n) {
  const o = {
    ...n
  };
  for (const a in o) {
    const i = o[a];
    Nb(a, i) && (o[a] = kb(i));
  }
  return o;
}
function z1(n, o) {
  if (!o)
    return n;
  for (const a in o) {
    const i = o[a];
    switch (a) {
      case "style": {
        n[a] = lp(n.style, i);
        break;
      }
      case "className": {
        n[a] = _b(n.className, i);
        break;
      }
      default:
        Nb(a, i) ? n[a] = D1(n[a], i) : n[a] = i;
    }
  }
  return n;
}
function Nb(n, o) {
  const a = n.charCodeAt(0), i = n.charCodeAt(1), u = n.charCodeAt(2);
  return a === 111 && i === 110 && u >= 65 && u <= 90 && (typeof o == "function" || typeof o > "u");
}
function Op(n) {
  return typeof n == "function";
}
function jb(n, o) {
  return Op(n) ? n(o) : n ?? Cp;
}
function D1(n, o) {
  return o ? n ? (...a) => {
    const i = a[0];
    if (Hb(i)) {
      const f = i;
      pc(f);
      const p = o(...a);
      return f.baseUIHandlerPrevented || n?.(...a), p;
    }
    const u = o(...a);
    return n?.(...a), u;
  } : kb(o) : n;
}
function kb(n) {
  return n && ((...o) => {
    const a = o[0];
    return Hb(a) && pc(a), n(...o);
  });
}
function pc(n) {
  return n.preventBaseUIHandler = () => {
    n.baseUIHandlerPrevented = !0;
  }, n;
}
function _b(n, o) {
  return o ? n ? o + " " + n : o : n;
}
function Hb(n) {
  return n != null && typeof n == "object" && "nativeEvent" in n;
}
function N1(n, o) {
  return function(i, ...u) {
    const f = new URL(n);
    return f.searchParams.set("code", i.toString()), u.forEach((p) => f.searchParams.append("args[]", p)), `${o} error #${i}; visit ${f} for the full message.`;
  };
}
const At = N1("https://base-ui.com/production-error", "Base UI"), Ub = /* @__PURE__ */ y.createContext(void 0);
function Mp(n = !1) {
  const o = y.useContext(Ub);
  if (o === void 0 && !n)
    throw new Error(At(16));
  return o;
}
function j1(n) {
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
function Oo(n = {}) {
  const {
    disabled: o = !1,
    focusableWhenDisabled: a,
    tabIndex: i = 0,
    native: u = !0,
    composite: f
  } = n, p = y.useRef(null), g = Mp(!0), m = f ?? g !== void 0, {
    props: d
  } = j1({
    focusableWhenDisabled: a,
    disabled: o,
    composite: m,
    tabIndex: i,
    isNativeButton: u
  }), v = y.useCallback(() => {
    const R = p.current;
    Dd(R) && m && o && d.disabled === void 0 && R.disabled && (R.disabled = !1);
  }, [o, d.disabled, m]);
  xe(v, [v]);
  const b = y.useCallback((R = {}) => {
    const {
      onClick: w,
      onMouseDown: M,
      onKeyUp: E,
      onKeyDown: A,
      onPointerDown: O,
      ...z
    } = R;
    return bn({
      onClick(D) {
        if (o) {
          D.preventDefault();
          return;
        }
        w?.(D);
      },
      onMouseDown(D) {
        o || M?.(D);
      },
      onKeyDown(D) {
        if (o || (pc(D), A?.(D), D.baseUIHandlerPrevented))
          return;
        const j = D.target === D.currentTarget, N = D.currentTarget, U = Dd(N), _ = !u && k1(N), G = j && (u ? U : !_), k = D.key === "Enter", ee = D.key === " ", Q = N.getAttribute("role"), X = Q?.startsWith("menuitem") || Q === "option" || Q === "gridcell";
        if (j && m && ee) {
          if (D.defaultPrevented && X)
            return;
          D.preventDefault(), _ || u && U ? (N.click(), D.preventBaseUIHandler()) : G && (w?.(D), D.preventBaseUIHandler());
          return;
        }
        G && (!u && (ee || k) && D.preventDefault(), !u && k && w?.(D));
      },
      onKeyUp(D) {
        if (!o) {
          if (pc(D), E?.(D), D.target === D.currentTarget && u && m && Dd(D.currentTarget) && D.key === " ") {
            D.preventDefault();
            return;
          }
          D.baseUIHandlerPrevented || D.target === D.currentTarget && !u && !m && D.key === " " && w?.(D);
        }
      },
      onPointerDown(D) {
        if (o) {
          D.preventDefault();
          return;
        }
        O?.(D);
      }
    }, u ? {
      type: "button"
    } : {
      role: "button"
    }, d, z);
  }, [o, d, m, u]), S = ze((R) => {
    p.current = R, v();
  });
  return {
    getButtonProps: b,
    buttonRef: S
  };
}
function Dd(n) {
  return Rt(n) && n.tagName === "BUTTON";
}
function k1(n) {
  return !!(n?.tagName === "A" && n?.href);
}
function Eo(n, o, a, i) {
  const u = xn(Lb).current;
  return H1(u, n, o, a, i) && Ib(u, [n, o, a, i]), u.callback;
}
function _1(n) {
  const o = xn(Lb).current;
  return U1(o, n) && Ib(o, n), o.callback;
}
function Lb() {
  return {
    callback: null,
    cleanup: null,
    refs: []
  };
}
function H1(n, o, a, i, u) {
  return n.refs[0] !== o || n.refs[1] !== a || n.refs[2] !== i || n.refs[3] !== u;
}
function U1(n, o) {
  return n.refs.length !== o.length || n.refs.some((a, i) => a !== o[i]);
}
function Ib(n, o) {
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
const L1 = parseInt(y.version, 10);
function Ap(n) {
  return L1 >= n;
}
function xv(n) {
  if (!/* @__PURE__ */ y.isValidElement(n))
    return null;
  const o = n, a = o.props;
  return (Ap(19) ? a?.ref : o.ref) ?? null;
}
function rn() {
}
const Gl = Object.freeze([]), bt = Object.freeze({});
function I1(n, o) {
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
function B1(n, o) {
  return typeof n == "function" ? n(o) : n;
}
function V1(n, o) {
  return typeof n == "function" ? n(o) : n;
}
function nt(n, o, a = {}) {
  const i = o.render, u = P1(o, a);
  if (a.enabled === !1)
    return null;
  const f = a.state ?? bt;
  return q1(n, i, u, f);
}
function P1(n, o = {}) {
  const {
    className: a,
    style: i,
    render: u
  } = n, {
    state: f = bt,
    ref: p,
    props: g,
    stateAttributesMapping: m,
    enabled: d = !0
  } = o, v = d ? B1(a, f) : void 0, b = d ? V1(i, f) : void 0, S = d ? I1(f, m) : bt, R = d && g ? Y1(g) : void 0, w = d ? lp(S, R) ?? {} : bt;
  return typeof document < "u" && (d ? Array.isArray(p) ? w.ref = _1([w.ref, xv(u), ...p]) : w.ref = Eo(w.ref, xv(u), p) : Eo(null, null)), d ? (v !== void 0 && (w.className = _b(w.className, v)), b !== void 0 && (w.style = lp(w.style, b)), w) : bt;
}
function Y1(n) {
  return Array.isArray(n) ? M1(n) : bn(void 0, n);
}
const G1 = /* @__PURE__ */ Symbol.for("react.lazy");
function q1(n, o, a, i) {
  if (o) {
    if (typeof o == "function")
      return o(a, i);
    const u = bn(a, o.props);
    u.ref = a.ref;
    let f = o;
    return f?.$$typeof === G1 && (f = y.Children.toArray(o)[0]), /* @__PURE__ */ y.cloneElement(f, u);
  }
  if (n && typeof n == "string")
    return X1(n, a);
  throw new Error(At(8));
}
function X1(n, o) {
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
const F1 = /* @__PURE__ */ y.forwardRef(function(o, a) {
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
  } = Oo({
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
function Bb(n) {
  var o, a, i = "";
  if (typeof n == "string" || typeof n == "number") i += n;
  else if (typeof n == "object") if (Array.isArray(n)) {
    var u = n.length;
    for (o = 0; o < u; o++) n[o] && (a = Bb(n[o])) && (i && (i += " "), i += a);
  } else for (a in n) n[a] && (i && (i += " "), i += a);
  return i;
}
function Vb() {
  for (var n, o, a = 0, i = "", u = arguments.length; a < u; a++) (n = arguments[a]) && (o = Bb(n)) && (i && (i += " "), i += o);
  return i;
}
const Sv = (n) => typeof n == "boolean" ? `${n}` : n === 0 ? "0" : n, wv = Vb, ra = (n, o) => (a) => {
  var i;
  if (o?.variants == null) return wv(n, a?.class, a?.className);
  const { variants: u, defaultVariants: f } = o, p = Object.keys(u).map((d) => {
    const v = a?.[d], b = f?.[d];
    if (v === null) return null;
    const S = Sv(v) || Sv(b);
    return u[d][S];
  }), g = a && Object.entries(a).reduce((d, v) => {
    let [b, S] = v;
    return S === void 0 || (d[b] = S), d;
  }, {}), m = o == null || (i = o.compoundVariants) === null || i === void 0 ? void 0 : i.reduce((d, v) => {
    let { class: b, className: S, ...R } = v;
    return Object.entries(R).every((w) => {
      let [M, E] = w;
      return Array.isArray(E) ? E.includes({
        ...f,
        ...g
      }[M]) : {
        ...f,
        ...g
      }[M] === E;
    }) ? [
      ...d,
      b,
      S
    ] : d;
  }, []);
  return wv(n, p, m, a?.class, a?.className);
}, K1 = (n, o) => {
  const a = new Array(n.length + o.length);
  for (let i = 0; i < n.length; i++)
    a[i] = n[i];
  for (let i = 0; i < o.length; i++)
    a[n.length + i] = o[i];
  return a;
}, Q1 = (n, o) => ({
  classGroupId: n,
  validator: o
}), Pb = (n = /* @__PURE__ */ new Map(), o = null, a) => ({
  nextPart: n,
  validators: o,
  classGroupId: a
}), gc = "-", Ev = [], Z1 = "arbitrary..", J1 = (n) => {
  const o = W1(n), {
    conflictingClassGroups: a,
    conflictingClassGroupModifiers: i
  } = n;
  return {
    getClassGroupId: (p) => {
      if (p.startsWith("[") && p.endsWith("]"))
        return $1(p);
      const g = p.split(gc), m = g[0] === "" && g.length > 1 ? 1 : 0;
      return Yb(g, m, o);
    },
    getConflictingClassGroupIds: (p, g) => {
      if (g) {
        const m = i[p], d = a[p];
        return m ? d ? K1(d, m) : m : d || Ev;
      }
      return a[p] || Ev;
    }
  };
}, Yb = (n, o, a) => {
  if (n.length - o === 0)
    return a.classGroupId;
  const u = n[o], f = a.nextPart.get(u);
  if (f) {
    const d = Yb(n, o + 1, f);
    if (d) return d;
  }
  const p = a.validators;
  if (p === null)
    return;
  const g = o === 0 ? n.join(gc) : n.slice(o).join(gc), m = p.length;
  for (let d = 0; d < m; d++) {
    const v = p[d];
    if (v.validator(g))
      return v.classGroupId;
  }
}, $1 = (n) => n.slice(1, -1).indexOf(":") === -1 ? void 0 : (() => {
  const o = n.slice(1, -1), a = o.indexOf(":"), i = o.slice(0, a);
  return i ? Z1 + i : void 0;
})(), W1 = (n) => {
  const {
    theme: o,
    classGroups: a
  } = n;
  return eT(a, o);
}, eT = (n, o) => {
  const a = Pb();
  for (const i in n) {
    const u = n[i];
    zp(u, a, i, o);
  }
  return a;
}, zp = (n, o, a, i) => {
  const u = n.length;
  for (let f = 0; f < u; f++) {
    const p = n[f];
    tT(p, o, a, i);
  }
}, tT = (n, o, a, i) => {
  if (typeof n == "string") {
    nT(n, o, a);
    return;
  }
  if (typeof n == "function") {
    lT(n, o, a, i);
    return;
  }
  oT(n, o, a, i);
}, nT = (n, o, a) => {
  const i = n === "" ? o : Gb(o, n);
  i.classGroupId = a;
}, lT = (n, o, a, i) => {
  if (rT(n)) {
    zp(n(i), o, a, i);
    return;
  }
  o.validators === null && (o.validators = []), o.validators.push(Q1(a, n));
}, oT = (n, o, a, i) => {
  const u = Object.entries(n), f = u.length;
  for (let p = 0; p < f; p++) {
    const [g, m] = u[p];
    zp(m, Gb(o, g), a, i);
  }
}, Gb = (n, o) => {
  let a = n;
  const i = o.split(gc), u = i.length;
  for (let f = 0; f < u; f++) {
    const p = i[f];
    let g = a.nextPart.get(p);
    g || (g = Pb(), a.nextPart.set(p, g)), a = g;
  }
  return a;
}, rT = (n) => "isThemeGetter" in n && n.isThemeGetter === !0, aT = (n) => {
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
}, op = "!", Tv = ":", iT = [], Rv = (n, o, a, i, u) => ({
  modifiers: n,
  hasImportantModifier: o,
  baseClassName: a,
  maybePostfixModifierPosition: i,
  isExternal: u
}), sT = (n) => {
  const {
    prefix: o,
    experimentalParseClassName: a
  } = n;
  let i = (u) => {
    const f = [];
    let p = 0, g = 0, m = 0, d;
    const v = u.length;
    for (let M = 0; M < v; M++) {
      const E = u[M];
      if (p === 0 && g === 0) {
        if (E === Tv) {
          f.push(u.slice(m, M)), m = M + 1;
          continue;
        }
        if (E === "/") {
          d = M;
          continue;
        }
      }
      E === "[" ? p++ : E === "]" ? p-- : E === "(" ? g++ : E === ")" && g--;
    }
    const b = f.length === 0 ? u : u.slice(m);
    let S = b, R = !1;
    b.endsWith(op) ? (S = b.slice(0, -1), R = !0) : (
      /**
       * In Tailwind CSS v3 the important modifier was at the start of the base class name. This is still supported for legacy reasons.
       * @see https://github.com/dcastil/tailwind-merge/issues/513#issuecomment-2614029864
       */
      b.startsWith(op) && (S = b.slice(1), R = !0)
    );
    const w = d && d > m ? d - m : void 0;
    return Rv(f, R, S, w);
  };
  if (o) {
    const u = o + Tv, f = i;
    i = (p) => p.startsWith(u) ? f(p.slice(u.length)) : Rv(iT, !1, p, void 0, !0);
  }
  if (a) {
    const u = i;
    i = (f) => a({
      className: f,
      parseClassName: u
    });
  }
  return i;
}, cT = (n) => {
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
}, uT = (n) => ({
  cache: aT(n.cacheSize),
  parseClassName: sT(n),
  sortModifiers: cT(n),
  postfixLookupClassGroupIds: fT(n),
  ...J1(n)
}), fT = (n) => {
  const o = /* @__PURE__ */ Object.create(null), a = n.postfixLookupClassGroups;
  if (a)
    for (let i = 0; i < a.length; i++)
      o[a[i]] = !0;
  return o;
}, dT = /\s+/, pT = (n, o) => {
  const {
    parseClassName: a,
    getClassGroupId: i,
    getConflictingClassGroupIds: u,
    sortModifiers: f,
    postfixLookupClassGroupIds: p
  } = o, g = [], m = n.trim().split(dT);
  let d = "";
  for (let v = m.length - 1; v >= 0; v -= 1) {
    const b = m[v], {
      isExternal: S,
      modifiers: R,
      hasImportantModifier: w,
      baseClassName: M,
      maybePostfixModifierPosition: E
    } = a(b);
    if (S) {
      d = b + (d.length > 0 ? " " + d : d);
      continue;
    }
    let A = !!E, O;
    if (A) {
      const U = M.substring(0, E);
      O = i(U);
      const _ = O && p[O] ? i(M) : void 0;
      _ && _ !== O && (O = _, A = !1);
    } else
      O = i(M);
    if (!O) {
      if (!A) {
        d = b + (d.length > 0 ? " " + d : d);
        continue;
      }
      if (O = i(M), !O) {
        d = b + (d.length > 0 ? " " + d : d);
        continue;
      }
      A = !1;
    }
    const z = R.length === 0 ? "" : R.length === 1 ? R[0] : f(R).join(":"), D = w ? z + op : z, j = D + O;
    if (g.indexOf(j) > -1)
      continue;
    g.push(j);
    const N = u(O, A);
    for (let U = 0; U < N.length; ++U) {
      const _ = N[U];
      g.push(D + _);
    }
    d = b + (d.length > 0 ? " " + d : d);
  }
  return d;
}, gT = (...n) => {
  let o = 0, a, i, u = "";
  for (; o < n.length; )
    (a = n[o++]) && (i = qb(a)) && (u && (u += " "), u += i);
  return u;
}, qb = (n) => {
  if (typeof n == "string")
    return n;
  let o, a = "";
  for (let i = 0; i < n.length; i++)
    n[i] && (o = qb(n[i])) && (a && (a += " "), a += o);
  return a;
}, mT = (n, ...o) => {
  let a, i, u, f;
  const p = (m) => {
    const d = o.reduce((v, b) => b(v), n());
    return a = uT(d), i = a.cache.get, u = a.cache.set, f = g, g(m);
  }, g = (m) => {
    const d = i(m);
    if (d)
      return d;
    const v = pT(m, a);
    return u(m, v), v;
  };
  return f = p, (...m) => f(gT(...m));
}, hT = [], tn = (n) => {
  const o = (a) => a[n] || hT;
  return o.isThemeGetter = !0, o;
}, Xb = /^\[(?:(\w[\w-]*):)?(.+)\]$/i, Fb = /^\((?:(\w[\w-]*):)?(.+)\)$/i, yT = /^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/, vT = /^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/, bT = /\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/, xT = /^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix)\(.+\)$/, ST = /^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/, wT = /^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/, So = (n) => yT.test(n), Ze = (n) => !!n && !Number.isNaN(Number(n)), ul = (n) => !!n && Number.isInteger(Number(n)), Nd = (n) => n.endsWith("%") && Ze(n.slice(0, -1)), Hl = (n) => vT.test(n), Kb = () => !0, ET = (n) => (
  // `colorFunctionRegex` check is necessary because color functions can have percentages in them which which would be incorrectly classified as lengths.
  // For example, `hsl(0 0% 0%)` would be classified as a length without this check.
  // I could also use lookbehind assertion in `lengthUnitRegex` but that isn't supported widely enough.
  bT.test(n) && !xT.test(n)
), Dp = () => !1, TT = (n) => ST.test(n), RT = (n) => wT.test(n), CT = (n) => !Me(n) && !Ae(n), OT = (n) => n.startsWith("@container") && (n[10] === "/" && n[11] !== void 0 || n[11] === "s" && n[16] !== void 0 && n.startsWith("-size/", 10) || n[11] === "n" && n[18] !== void 0 && n.startsWith("-normal/", 10)), MT = (n) => Mo(n, Jb, Dp), Me = (n) => Xb.test(n), Wo = (n) => Mo(n, $b, ET), Cv = (n) => Mo(n, HT, Ze), AT = (n) => Mo(n, e0, Kb), zT = (n) => Mo(n, Wb, Dp), Ov = (n) => Mo(n, Qb, Dp), DT = (n) => Mo(n, Zb, RT), Ps = (n) => Mo(n, t0, TT), Ae = (n) => Fb.test(n), ei = (n) => cr(n, $b), NT = (n) => cr(n, Wb), Mv = (n) => cr(n, Qb), jT = (n) => cr(n, Jb), kT = (n) => cr(n, Zb), Ys = (n) => cr(n, t0, !0), _T = (n) => cr(n, e0, !0), Mo = (n, o, a) => {
  const i = Xb.exec(n);
  return i ? i[1] ? o(i[1]) : a(i[2]) : !1;
}, cr = (n, o, a = !1) => {
  const i = Fb.exec(n);
  return i ? i[1] ? o(i[1]) : a : !1;
}, Qb = (n) => n === "position" || n === "percentage", Zb = (n) => n === "image" || n === "url", Jb = (n) => n === "length" || n === "size" || n === "bg-size", $b = (n) => n === "length", HT = (n) => n === "number", Wb = (n) => n === "family-name", e0 = (n) => n === "number" || n === "weight", t0 = (n) => n === "shadow", UT = () => {
  const n = tn("color"), o = tn("font"), a = tn("text"), i = tn("font-weight"), u = tn("tracking"), f = tn("leading"), p = tn("breakpoint"), g = tn("container"), m = tn("spacing"), d = tn("radius"), v = tn("shadow"), b = tn("inset-shadow"), S = tn("text-shadow"), R = tn("drop-shadow"), w = tn("blur"), M = tn("perspective"), E = tn("aspect"), A = tn("ease"), O = tn("animate"), z = () => ["auto", "avoid", "all", "avoid-page", "page", "left", "right", "column"], D = () => [
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
  ], j = () => [...D(), Ae, Me], N = () => ["auto", "hidden", "clip", "visible", "scroll"], U = () => ["auto", "contain", "none"], _ = () => [Ae, Me, m], G = () => [So, "full", "auto", ..._()], k = () => [ul, "none", "subgrid", Ae, Me], ee = () => ["auto", {
    span: ["full", ul, Ae, Me]
  }, ul, Ae, Me], Q = () => [ul, "auto", Ae, Me], X = () => ["auto", "min", "max", "fr", Ae, Me], Z = () => ["start", "end", "center", "between", "around", "evenly", "stretch", "baseline", "center-safe", "end-safe"], q = () => ["start", "end", "center", "stretch", "center-safe", "end-safe"], H = () => ["auto", ..._()], Y = () => [So, "auto", "full", "dvw", "dvh", "lvw", "lvh", "svw", "svh", "min", "max", "fit", ..._()], V = () => [So, "screen", "full", "dvw", "lvw", "svw", "min", "max", "fit", ..._()], K = () => [So, "screen", "full", "lh", "dvh", "lvh", "svh", "min", "max", "fit", ..._()], B = () => [n, Ae, Me], C = () => [...D(), Mv, Ov, {
    position: [Ae, Me]
  }], L = () => ["no-repeat", {
    repeat: ["", "x", "y", "space", "round"]
  }], ne = () => ["auto", "cover", "contain", jT, MT, {
    size: [Ae, Me]
  }], J = () => [Nd, ei, Wo], re = () => [
    // Deprecated since Tailwind CSS v4.0.0
    "",
    "none",
    "full",
    d,
    Ae,
    Me
  ], ie = () => ["", Ze, ei, Wo], oe = () => ["solid", "dashed", "dotted", "double"], se = () => ["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity"], ge = () => [Ze, Nd, Mv, Ov], je = () => [
    // Deprecated since Tailwind CSS v4.0.0
    "",
    "none",
    w,
    Ae,
    Me
  ], Ee = () => ["none", Ze, Ae, Me], fe = () => ["none", Ze, Ae, Me], ye = () => [Ze, Ae, Me], Re = () => [So, "full", ..._()];
  return {
    cacheSize: 500,
    theme: {
      animate: ["spin", "ping", "pulse", "bounce"],
      aspect: ["video"],
      blur: [Hl],
      breakpoint: [Hl],
      color: [Kb],
      container: [Hl],
      "drop-shadow": [Hl],
      ease: ["in", "out", "in-out"],
      font: [CT],
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
        aspect: ["auto", "square", So, Me, Ae, E]
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
      "container-named": [OT],
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
        "break-after": z()
      }],
      /**
       * Break Before
       * @see https://tailwindcss.com/docs/break-before
       */
      "break-before": [{
        "break-before": z()
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
        object: j()
      }],
      /**
       * Overflow
       * @see https://tailwindcss.com/docs/overflow
       */
      overflow: [{
        overflow: N()
      }],
      /**
       * Overflow X
       * @see https://tailwindcss.com/docs/overflow
       */
      "overflow-x": [{
        "overflow-x": N()
      }],
      /**
       * Overflow Y
       * @see https://tailwindcss.com/docs/overflow
       */
      "overflow-y": [{
        "overflow-y": N()
      }],
      /**
       * Overscroll Behavior
       * @see https://tailwindcss.com/docs/overscroll-behavior
       */
      overscroll: [{
        overscroll: U()
      }],
      /**
       * Overscroll Behavior X
       * @see https://tailwindcss.com/docs/overscroll-behavior
       */
      "overscroll-x": [{
        "overscroll-x": U()
      }],
      /**
       * Overscroll Behavior Y
       * @see https://tailwindcss.com/docs/overscroll-behavior
       */
      "overscroll-y": [{
        "overscroll-y": U()
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
        basis: [So, "full", "auto", g, ..._()]
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
        flex: [Ze, So, "auto", "initial", "none", Me]
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
        "grid-cols": k()
      }],
      /**
       * Grid Column Start / End
       * @see https://tailwindcss.com/docs/grid-column
       */
      "col-start-end": [{
        col: ee()
      }],
      /**
       * Grid Column Start
       * @see https://tailwindcss.com/docs/grid-column
       */
      "col-start": [{
        "col-start": Q()
      }],
      /**
       * Grid Column End
       * @see https://tailwindcss.com/docs/grid-column
       */
      "col-end": [{
        "col-end": Q()
      }],
      /**
       * Grid Template Rows
       * @see https://tailwindcss.com/docs/grid-template-rows
       */
      "grid-rows": [{
        "grid-rows": k()
      }],
      /**
       * Grid Row Start / End
       * @see https://tailwindcss.com/docs/grid-row
       */
      "row-start-end": [{
        row: ee()
      }],
      /**
       * Grid Row Start
       * @see https://tailwindcss.com/docs/grid-row
       */
      "row-start": [{
        "row-start": Q()
      }],
      /**
       * Grid Row End
       * @see https://tailwindcss.com/docs/grid-row
       */
      "row-end": [{
        "row-end": Q()
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
        gap: _()
      }],
      /**
       * Gap X
       * @see https://tailwindcss.com/docs/gap
       */
      "gap-x": [{
        "gap-x": _()
      }],
      /**
       * Gap Y
       * @see https://tailwindcss.com/docs/gap
       */
      "gap-y": [{
        "gap-y": _()
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
        p: _()
      }],
      /**
       * Padding Inline
       * @see https://tailwindcss.com/docs/padding
       */
      px: [{
        px: _()
      }],
      /**
       * Padding Block
       * @see https://tailwindcss.com/docs/padding
       */
      py: [{
        py: _()
      }],
      /**
       * Padding Inline Start
       * @see https://tailwindcss.com/docs/padding
       */
      ps: [{
        ps: _()
      }],
      /**
       * Padding Inline End
       * @see https://tailwindcss.com/docs/padding
       */
      pe: [{
        pe: _()
      }],
      /**
       * Padding Block Start
       * @see https://tailwindcss.com/docs/padding
       */
      pbs: [{
        pbs: _()
      }],
      /**
       * Padding Block End
       * @see https://tailwindcss.com/docs/padding
       */
      pbe: [{
        pbe: _()
      }],
      /**
       * Padding Top
       * @see https://tailwindcss.com/docs/padding
       */
      pt: [{
        pt: _()
      }],
      /**
       * Padding Right
       * @see https://tailwindcss.com/docs/padding
       */
      pr: [{
        pr: _()
      }],
      /**
       * Padding Bottom
       * @see https://tailwindcss.com/docs/padding
       */
      pb: [{
        pb: _()
      }],
      /**
       * Padding Left
       * @see https://tailwindcss.com/docs/padding
       */
      pl: [{
        pl: _()
      }],
      /**
       * Margin
       * @see https://tailwindcss.com/docs/margin
       */
      m: [{
        m: H()
      }],
      /**
       * Margin Inline
       * @see https://tailwindcss.com/docs/margin
       */
      mx: [{
        mx: H()
      }],
      /**
       * Margin Block
       * @see https://tailwindcss.com/docs/margin
       */
      my: [{
        my: H()
      }],
      /**
       * Margin Inline Start
       * @see https://tailwindcss.com/docs/margin
       */
      ms: [{
        ms: H()
      }],
      /**
       * Margin Inline End
       * @see https://tailwindcss.com/docs/margin
       */
      me: [{
        me: H()
      }],
      /**
       * Margin Block Start
       * @see https://tailwindcss.com/docs/margin
       */
      mbs: [{
        mbs: H()
      }],
      /**
       * Margin Block End
       * @see https://tailwindcss.com/docs/margin
       */
      mbe: [{
        mbe: H()
      }],
      /**
       * Margin Top
       * @see https://tailwindcss.com/docs/margin
       */
      mt: [{
        mt: H()
      }],
      /**
       * Margin Right
       * @see https://tailwindcss.com/docs/margin
       */
      mr: [{
        mr: H()
      }],
      /**
       * Margin Bottom
       * @see https://tailwindcss.com/docs/margin
       */
      mb: [{
        mb: H()
      }],
      /**
       * Margin Left
       * @see https://tailwindcss.com/docs/margin
       */
      ml: [{
        ml: H()
      }],
      /**
       * Space Between X
       * @see https://tailwindcss.com/docs/margin#adding-space-between-children
       */
      "space-x": [{
        "space-x": _()
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
        "space-y": _()
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
        block: ["auto", ...K()]
      }],
      /**
       * Min-Block Size
       * @see https://tailwindcss.com/docs/min-height
       */
      "min-block-size": [{
        "min-block": ["auto", ...K()]
      }],
      /**
       * Max-Block Size
       * @see https://tailwindcss.com/docs/max-height
       */
      "max-block-size": [{
        "max-block": ["none", ...K()]
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
        text: ["base", a, ei, Wo]
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
        font: [i, _T, AT]
      }],
      /**
       * Font Stretch
       * @see https://tailwindcss.com/docs/font-stretch
       */
      "font-stretch": [{
        "font-stretch": ["ultra-condensed", "extra-condensed", "condensed", "semi-condensed", "normal", "semi-expanded", "expanded", "extra-expanded", "ultra-expanded", Nd, Me]
      }],
      /**
       * Font Family
       * @see https://tailwindcss.com/docs/font-family
       */
      "font-family": [{
        font: [NT, zT, o]
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
        "line-clamp": [Ze, "none", Ae, Cv]
      }],
      /**
       * Line Height
       * @see https://tailwindcss.com/docs/line-height
       */
      leading: [{
        leading: [
          /** Deprecated since Tailwind CSS v4.0.0. @see https://github.com/tailwindlabs/tailwindcss.com/issues/2027#issuecomment-2620152757 */
          f,
          ..._()
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
        decoration: [Ze, "from-font", "auto", Ae, Wo]
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
        indent: _()
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
        bg: C()
      }],
      /**
       * Background Repeat
       * @see https://tailwindcss.com/docs/background-repeat
       */
      "bg-repeat": [{
        bg: L()
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
        }, kT, DT]
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
        outline: ["", Ze, ei, Wo]
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
          Ys,
          Ps
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
        "inset-shadow": ["none", b, Ys, Ps]
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
        "ring-offset": [Ze, Wo]
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
        "text-shadow": ["none", S, Ys, Ps]
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
        "mask-radial-at": D()
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
        mask: C()
      }],
      /**
       * Mask Repeat
       * @see https://tailwindcss.com/docs/mask-repeat
       */
      "mask-repeat": [{
        mask: L()
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
          R,
          Ys,
          Ps
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
        "border-spacing": _()
      }],
      /**
       * Border Spacing X
       * @see https://tailwindcss.com/docs/border-spacing
       */
      "border-spacing-x": [{
        "border-spacing-x": _()
      }],
      /**
       * Border Spacing Y
       * @see https://tailwindcss.com/docs/border-spacing
       */
      "border-spacing-y": [{
        "border-spacing-y": _()
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
        ease: ["linear", "initial", A, Ae, Me]
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
        animate: ["none", O, Ae, Me]
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
        "perspective-origin": j()
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
        origin: j()
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
        "scroll-m": _()
      }],
      /**
       * Scroll Margin Inline
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-mx": [{
        "scroll-mx": _()
      }],
      /**
       * Scroll Margin Block
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-my": [{
        "scroll-my": _()
      }],
      /**
       * Scroll Margin Inline Start
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-ms": [{
        "scroll-ms": _()
      }],
      /**
       * Scroll Margin Inline End
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-me": [{
        "scroll-me": _()
      }],
      /**
       * Scroll Margin Block Start
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-mbs": [{
        "scroll-mbs": _()
      }],
      /**
       * Scroll Margin Block End
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-mbe": [{
        "scroll-mbe": _()
      }],
      /**
       * Scroll Margin Top
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-mt": [{
        "scroll-mt": _()
      }],
      /**
       * Scroll Margin Right
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-mr": [{
        "scroll-mr": _()
      }],
      /**
       * Scroll Margin Bottom
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-mb": [{
        "scroll-mb": _()
      }],
      /**
       * Scroll Margin Left
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-ml": [{
        "scroll-ml": _()
      }],
      /**
       * Scroll Padding
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-p": [{
        "scroll-p": _()
      }],
      /**
       * Scroll Padding Inline
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-px": [{
        "scroll-px": _()
      }],
      /**
       * Scroll Padding Block
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-py": [{
        "scroll-py": _()
      }],
      /**
       * Scroll Padding Inline Start
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-ps": [{
        "scroll-ps": _()
      }],
      /**
       * Scroll Padding Inline End
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-pe": [{
        "scroll-pe": _()
      }],
      /**
       * Scroll Padding Block Start
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-pbs": [{
        "scroll-pbs": _()
      }],
      /**
       * Scroll Padding Block End
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-pbe": [{
        "scroll-pbe": _()
      }],
      /**
       * Scroll Padding Top
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-pt": [{
        "scroll-pt": _()
      }],
      /**
       * Scroll Padding Right
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-pr": [{
        "scroll-pr": _()
      }],
      /**
       * Scroll Padding Bottom
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-pb": [{
        "scroll-pb": _()
      }],
      /**
       * Scroll Padding Left
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-pl": [{
        "scroll-pl": _()
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
        stroke: [Ze, ei, Wo, Cv]
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
}, LT = /* @__PURE__ */ mT(UT);
function Ke(...n) {
  return LT(Vb(n));
}
const IT = ra(
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
function Mt({
  className: n,
  variant: o = "default",
  size: a = "default",
  ...i
}) {
  return /* @__PURE__ */ x.jsx(
    F1,
    {
      "data-slot": "button",
      className: Ke(IT({ variant: o, size: a, className: n })),
      ...i
    }
  );
}
function Np(n) {
  const o = y.useRef(!0);
  o.current && (o.current = !1, n());
}
function Je(n, o, a, i) {
  return n.addEventListener(o, a, i), () => {
    n.removeEventListener(o, a, i);
  };
}
function BT() {
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
  userAgent: VT,
  platform: PT,
  maxTouchPoints: YT
} = BT(), Nc = VT.toLowerCase(), hi = PT.toLowerCase(), jc = /^i(os$|p)/.test(hi) || hi === "macintel" && YT > 1, Av = "android", rp = hi === Av || Nc.includes(Av), jp = !jc && hi.startsWith("mac");
hi.startsWith("win");
const GT = jp || jc, Ao = typeof CSS < "u" && !!CSS.supports?.("-webkit-backdrop-filter:none");
!Ao && Nc.includes("firefox");
!Ao && Nc.includes("chrom");
const qT = GT, kp = /jsdom|happydom/.test(Nc);
function tt(n) {
  return n?.ownerDocument || document;
}
const XT = [];
function _p(n) {
  y.useEffect(n, XT);
}
const ti = 0;
class el {
  static create() {
    return new el();
  }
  currentId = ti;
  /**
   * Executes `fn` after `delay`, clearing any previously scheduled call.
   */
  start(o, a) {
    this.clear(), this.currentId = setTimeout(() => {
      this.currentId = ti, a();
    }, o);
  }
  isStarted() {
    return this.currentId !== ti;
  }
  clear = () => {
    this.currentId !== ti && (clearTimeout(this.currentId), this.currentId = ti);
  };
  disposeEffect = () => this.clear;
}
function an() {
  const n = xn(el.create).current;
  return _p(n.disposeEffect), n;
}
const Gs = null;
class FT {
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
const qs = new FT();
class dl {
  static create() {
    return new dl();
  }
  static request(o) {
    return qs.request(o);
  }
  static cancel(o) {
    return qs.cancel(o);
  }
  currentId = Gs;
  /**
   * Executes `fn` after `delay`, clearing any previously scheduled call.
   */
  request(o) {
    this.cancel(), this.currentId = qs.request(() => {
      this.currentId = Gs, o();
    });
  }
  cancel = () => {
    this.currentId !== Gs && (qs.cancel(this.currentId), this.currentId = Gs);
  };
  disposeEffect = () => this.cancel;
}
function ta() {
  const n = xn(dl.create).current;
  return _p(n.disposeEffect), n;
}
let zv = {}, Dv = {}, Nv = "";
function KT(n) {
  if (typeof document > "u")
    return !1;
  const o = tt(n);
  return Dt(o).innerWidth - o.documentElement.clientWidth > 0;
}
function QT(n) {
  if (!(typeof CSS < "u" && CSS.supports && CSS.supports("scrollbar-gutter", "stable")) || typeof document > "u")
    return !1;
  const a = tt(n), i = a.documentElement, u = a.body, f = sr(i) ? i : u, p = f.style.overflowY, g = i.style.scrollbarGutter;
  i.style.scrollbarGutter = "stable", f.style.overflowY = "scroll";
  const m = f.offsetWidth;
  f.style.overflowY = "hidden";
  const d = f.offsetWidth;
  return f.style.overflowY = p, i.style.scrollbarGutter = g, m === d;
}
function ZT(n) {
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
function JT(n) {
  const o = tt(n), a = o.documentElement, i = o.body, u = Dt(a);
  let f = 0, p = 0, g = !1;
  const m = dl.create();
  if (Ao && (u.visualViewport?.scale ?? 1) !== 1)
    return () => {
    };
  function d() {
    const R = u.getComputedStyle(a), w = u.getComputedStyle(i), A = (R.scrollbarGutter || "").includes("both-edges") ? "stable both-edges" : "stable";
    f = a.scrollTop, p = a.scrollLeft, zv = {
      scrollbarGutter: a.style.scrollbarGutter,
      overflowY: a.style.overflowY,
      overflowX: a.style.overflowX
    }, Nv = a.style.scrollBehavior, Dv = {
      position: i.style.position,
      height: i.style.height,
      width: i.style.width,
      boxSizing: i.style.boxSizing,
      overflowY: i.style.overflowY,
      overflowX: i.style.overflowX,
      scrollBehavior: i.style.scrollBehavior
    };
    const O = a.scrollHeight > a.clientHeight, z = a.scrollWidth > a.clientWidth, D = R.overflowY === "scroll" || w.overflowY === "scroll", j = R.overflowX === "scroll" || w.overflowX === "scroll", N = Math.max(0, u.innerWidth - i.clientWidth), U = Math.max(0, u.innerHeight - i.clientHeight), _ = parseFloat(w.marginTop) + parseFloat(w.marginBottom), G = parseFloat(w.marginLeft) + parseFloat(w.marginRight), k = sr(a) ? a : i;
    if (g = QT(n), g) {
      a.style.scrollbarGutter = A, k.style.overflowY = "hidden", k.style.overflowX = "hidden";
      return;
    }
    Object.assign(a.style, {
      scrollbarGutter: A,
      overflowY: "hidden",
      overflowX: "hidden"
    }), (O || D) && (a.style.overflowY = "scroll"), (z || j) && (a.style.overflowX = "scroll"), Object.assign(i.style, {
      position: "relative",
      height: _ || U ? `calc(100dvh - ${_ + U}px)` : "100dvh",
      width: G || N ? `calc(100vw - ${G + N}px)` : "100vw",
      boxSizing: "border-box",
      overflow: "hidden",
      scrollBehavior: "unset"
    }), i.scrollTop = f, i.scrollLeft = p, a.setAttribute("data-base-ui-scroll-locked", ""), a.style.scrollBehavior = "unset";
  }
  function v() {
    Object.assign(a.style, zv), Object.assign(i.style, Dv), g || (a.scrollTop = f, a.scrollLeft = p, a.removeAttribute("data-base-ui-scroll-locked"), a.style.scrollBehavior = Nv);
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
class $T {
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
      this.restore = rn;
      return;
    }
    const f = jc || !KT(o);
    this.restore = f ? ZT(o) : JT(o);
  }
}
const WT = new $T();
function n0(n = !0, o = null) {
  xe(() => {
    if (n)
      return WT.acquire(o);
  }, [n, o]);
}
function fl(n) {
  n.preventDefault(), n.stopPropagation();
}
function eR(n) {
  return "nativeEvent" in n;
}
function Hp(n) {
  return n.pointerType === "" && n.isTrusted ? !0 : rp && n.pointerType ? n.type === "click" && n.buttons === 1 : n.detail === 0 && !n.pointerType;
}
function l0(n) {
  return kp ? !1 : !rp && n.width === 0 && n.height === 0 || rp && n.width === 1 && n.height === 1 && n.pressure === 0 && n.detail === 0 && n.pointerType === "mouse" || // iOS VoiceOver returns 0.333• for width/height.
  n.width < 1 && n.height < 1 && n.pressure === 0 && n.detail === 0 && n.pointerType === "touch";
}
function or(n, o) {
  const a = ["mouse", "pen"];
  return o || a.push("", void 0), a.includes(n);
}
function tR(n) {
  const o = n.type;
  return o === "click" || o === "mousedown" || o === "keydown" || o === "keyup";
}
const ap = "data-base-ui-focusable", o0 = "input:not([type='hidden']):not([disabled]),[contenteditable]:not([contenteditable='false']),textarea:not([disabled])", kc = "ArrowLeft", _c = "ArrowRight", r0 = "ArrowUp", Up = "ArrowDown";
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
  if (a && ea(a)) {
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
function mc(n, o) {
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
function jd(n, o) {
  if (o == null)
    return !1;
  if ("composedPath" in n)
    return n.composedPath().includes(o);
  const a = n;
  return a.target != null && o.contains(a.target);
}
function nR(n) {
  return n.matches("html,body");
}
function Hc(n) {
  return Rt(n) && n.matches(o0);
}
function lR(n) {
  return n?.closest(`button,a[href],[role="button"],select,[tabindex]:not([tabindex="-1"]),${o0}`) != null;
}
function ip(n) {
  return n ? n.getAttribute("role") === "combobox" && Hc(n) : !1;
}
function oR(n) {
  if (!n || kp)
    return !0;
  try {
    return n.matches(":focus-visible");
  } catch {
    return !0;
  }
}
function hc(n) {
  return n ? n.hasAttribute(ap) ? n : n.querySelector(`[${ap}]`) || n : null;
}
function rR(n, o) {
  return o != null && !or(o) ? 0 : typeof n == "function" ? n() : n;
}
function na(n, o, a) {
  const i = rR(n, a);
  return typeof i == "number" ? i : i?.[o];
}
function jv(n) {
  return typeof n == "function" ? n() : n;
}
function a0(n, o) {
  return o || n === "click" || n === "mousedown";
}
function aR(n) {
  return n?.includes("mouse") && n !== "mousedown";
}
const zo = "none", ql = "trigger-press", Pt = "trigger-hover", Zr = "trigger-focus", Uc = "outside-press", Jr = "item-press", i0 = "close-press", To = "focus-out", Si = "escape-key", sp = "list-navigation", s0 = "cancel-open", ri = "sibling-open", iR = "disabled", Lc = "imperative-action", sR = "window-resize";
function Ye(n, o, a, i) {
  let u = !1, f = !1;
  const p = i ?? bt;
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
const c0 = /* @__PURE__ */ y.createContext({
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
function cR(n, o) {
  n.current = o.current;
}
function uR(n) {
  const {
    children: o,
    delay: a,
    timeoutMs: i = 0
  } = n, u = y.useRef(a), f = y.useRef(a), p = y.useRef(null), g = y.useRef(null), m = an();
  return xe(() => {
    if (f.current = a, !p.current) {
      u.current = a;
      return;
    }
    u.current = {
      open: na(u.current, "open"),
      close: na(a, "close")
    };
  }, [a, p, u, f]), /* @__PURE__ */ x.jsx(c0.Provider, {
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
function fR(n, o = {
  open: !1
}) {
  const {
    open: a
  } = o, i = "rootStore" in n ? n.rootStore : n, u = i.useState("floatingId"), f = y.useContext(c0), {
    currentIdRef: p,
    delayRef: g,
    timeoutMs: m,
    initialDelayRef: d,
    currentContextRef: v,
    hasProvider: b,
    timeout: S
  } = f, [R, w] = y.useState(!1), M = y.useRef(a), E = y.useRef(!1);
  return xe(() => {
    M.current = a;
  }, [a]), xe(() => () => {
    E.current = !0;
  }, []), xe(() => {
    function A() {
      E.current || w(!1), v.current?.setIsInstantPhase(!1), p.current = null, v.current = null, g.current = d.current, S.clear();
    }
    if (p.current && !a && p.current === u) {
      if (w(!1), m) {
        const O = u;
        return S.start(m, () => {
          i.select("open") || p.current && p.current !== O || A();
        }), () => {
          (M.current || p.current !== O) && S.clear();
        };
      }
      A();
    }
  }, [a, u, p, g, m, d, v, S, i]), xe(() => {
    if (!a)
      return;
    const A = v.current, O = p.current;
    S.clear(), v.current = {
      onOpenChange: i.setOpen,
      setIsInstantPhase: w
    }, p.current = u, g.current = {
      open: 0,
      close: na(d.current, "close")
    }, O !== null && O !== u ? (w(!0), A?.setIsInstantPhase(!0), A?.onOpenChange(!1, Ye(zo))) : (w(!1), A?.setIsInstantPhase(!1));
  }, [a, u, i, p, g, d, v, S]), xe(() => () => {
    if (p.current === u) {
      if (v.current = null, !M.current)
        return;
      p.current = null, cR(g, d), S.clear();
    }
  }, [v, p, g, u, d, S]), y.useMemo(() => ({
    hasProvider: b,
    delayRef: g,
    isInstantPhase: R
  }), [b, g, R]);
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
  const o = xn(dR, n).current;
  return o.next = n, xe(o.effect), o;
}
function dR(n) {
  const o = {
    current: n,
    next: n,
    effect: () => {
      o.current = o.next;
    }
  };
  return o;
}
const u0 = {
  clipPath: "inset(50%)",
  overflow: "hidden",
  whiteSpace: "nowrap",
  border: 0,
  padding: 0,
  width: 1,
  height: 1,
  margin: -1
}, f0 = {
  ...u0,
  position: "fixed",
  top: 0,
  left: 0
}, pR = {
  ...u0,
  position: "absolute"
}, Ro = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const [i, u] = y.useState();
  xe(() => {
    qT && Ao && u("button");
  }, []);
  const f = {
    tabIndex: 0,
    // Role is only for VoiceOver
    role: i
  };
  return /* @__PURE__ */ x.jsx("span", {
    ...o,
    ref: a,
    style: f0,
    "aria-hidden": i ? void 0 : !0,
    ...f,
    "data-base-ui-focus-guard": ""
  });
}), gR = ["top", "right", "bottom", "left"], la = Math.min, Vl = Math.max, yc = Math.round, Xs = Math.floor, Pl = (n) => ({
  x: n,
  y: n
}), mR = {
  left: "right",
  right: "left",
  bottom: "top",
  top: "bottom"
};
function d0(n, o, a) {
  return Vl(n, la(o, a));
}
function Xl(n, o) {
  return typeof n == "function" ? n(o) : n;
}
function Ln(n) {
  return n.split("-")[0];
}
function Do(n) {
  return n.split("-")[1];
}
function Lp(n) {
  return n === "x" ? "y" : "x";
}
function Ip(n) {
  return n === "y" ? "height" : "width";
}
function Wn(n) {
  const o = n[0];
  return o === "t" || o === "b" ? "y" : "x";
}
function Bp(n) {
  return Lp(Wn(n));
}
function hR(n, o, a) {
  a === void 0 && (a = !1);
  const i = Do(n), u = Bp(n), f = Ip(u);
  let p = u === "x" ? i === (a ? "end" : "start") ? "right" : "left" : i === "start" ? "bottom" : "top";
  return o.reference[f] > o.floating[f] && (p = vc(p)), [p, vc(p)];
}
function yR(n) {
  const o = vc(n);
  return [cp(n), o, cp(o)];
}
function cp(n) {
  return n.includes("start") ? n.replace("start", "end") : n.replace("end", "start");
}
const kv = ["left", "right"], _v = ["right", "left"], vR = ["top", "bottom"], bR = ["bottom", "top"];
function xR(n, o, a) {
  switch (n) {
    case "top":
    case "bottom":
      return a ? o ? _v : kv : o ? kv : _v;
    case "left":
    case "right":
      return o ? vR : bR;
    default:
      return [];
  }
}
function SR(n, o, a, i) {
  const u = Do(n);
  let f = xR(Ln(n), a === "start", i);
  return u && (f = f.map((p) => p + "-" + u), o && (f = f.concat(f.map(cp)))), f;
}
function vc(n) {
  const o = Ln(n);
  return mR[o] + n.slice(o.length);
}
function wR(n) {
  var o, a, i, u;
  return {
    top: (o = n.top) != null ? o : 0,
    right: (a = n.right) != null ? a : 0,
    bottom: (i = n.bottom) != null ? i : 0,
    left: (u = n.left) != null ? u : 0
  };
}
function p0(n) {
  return typeof n != "number" ? wR(n) : {
    top: n,
    right: n,
    bottom: n,
    left: n
  };
}
function yi(n) {
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
function ui(n, o) {
  return o < 0 || o >= n.length;
}
function rc(n, o) {
  return Il(n.current, {
    disabledIndices: o
  });
}
function up(n, o) {
  return Il(n.current, {
    decrement: !0,
    startingIndex: n.current.length,
    disabledIndices: o
  });
}
function Il(n, {
  startingIndex: o = -1,
  decrement: a = !1,
  disabledIndices: i,
  amount: u = 1
} = {}) {
  let f = o;
  do
    f += a ? -u : u;
  while (f >= 0 && f <= n.length - 1 && bc(n, f, i));
  return f;
}
function bc(n, o, a) {
  if (typeof a == "function" ? a(o) : a?.includes(o) ?? !1)
    return !0;
  const u = n[o];
  return u ? Ic(u) ? !a && (u.hasAttribute("disabled") || u.getAttribute("aria-disabled") === "true") : !0 : !1;
}
function ER(n) {
  return n.visibility === "hidden" || n.visibility === "collapse";
}
function Ic(n, o = n ? In(n) : null) {
  return !n || !n.isConnected || !o || ER(o) ? !1 : typeof n.checkVisibility == "function" ? n.checkVisibility() : o.display !== "none" && o.display !== "contents";
}
const TR = 'a[href],button,input,select,textarea,summary,details,iframe,object,embed,[tabindex],[contenteditable]:not([contenteditable="false"]),audio[controls],video[controls]';
function RR(n) {
  const o = n.assignedSlot;
  if (o)
    return o;
  if (n.parentElement)
    return n.parentElement;
  const a = n.getRootNode();
  return ea(a) ? a.host : null;
}
function fp(n) {
  for (const o of Array.from(n.children))
    if (mn(o) === "summary")
      return o;
  return null;
}
function CR(n, o) {
  const a = fp(o);
  return !!a && (n === a || Le(a, n));
}
function g0(n) {
  const o = n ? mn(n) : "";
  return n != null && n.matches(TR) && (o !== "summary" || n.parentElement != null && mn(n.parentElement) === "details" && fp(n.parentElement) === n) && (o !== "details" || fp(n) == null) && (o !== "input" || n.type !== "hidden");
}
function m0(n) {
  if (!g0(n) || !n.isConnected || n.matches(":disabled"))
    return !1;
  for (let o = n; o; o = RR(o)) {
    const a = o !== n, i = mn(o) === "slot";
    if (o.hasAttribute("inert") || a && mn(o) === "details" && !o.open && !CR(n, o) || o.hasAttribute("hidden") || !i && !OR(o, a))
      return !1;
  }
  return !0;
}
function OR(n, o) {
  const a = In(n);
  return o ? a.display !== "none" : Ic(n, a);
}
function h0(n) {
  const o = n.tabIndex;
  if (o < 0) {
    const a = mn(n);
    if (a === "details" || a === "audio" || a === "video" || Rt(n) && n.isContentEditable)
      return 0;
  }
  return o;
}
function kd(n) {
  if (mn(n) !== "input")
    return null;
  const o = n;
  return o.type === "radio" && o.name !== "" ? o : null;
}
function MR(n, o) {
  const a = kd(n);
  if (!a)
    return !0;
  const i = o.find((u) => {
    const f = kd(u);
    return f?.name === a.name && f.form === a.form && f.checked;
  });
  return i ? i === a : o.find((u) => {
    const f = kd(u);
    return f?.name === a.name && f.form === a.form;
  }) === a;
}
function y0(n) {
  if (Rt(n) && mn(n) === "slot") {
    const o = n.assignedElements({
      flatten: !0
    });
    if (o.length > 0)
      return o;
  }
  return Rt(n) && n.shadowRoot ? Array.from(n.shadowRoot.children) : Array.from(n.children);
}
function v0(n, o) {
  y0(n).forEach((a) => {
    g0(a) && o.push(a), v0(a, o);
  });
}
function b0(n, o, a) {
  y0(n).forEach((i) => {
    Rt(i) && i.matches(o) && a.push(i), b0(i, o, a);
  });
}
function Vp(n) {
  return m0(n) && h0(n) >= 0;
}
function x0(n) {
  const o = [];
  return v0(n, o), o.filter(m0);
}
function wi(n) {
  const o = x0(n);
  return o.filter((a) => h0(a) >= 0 && MR(a, o));
}
function S0(n, o) {
  const a = wi(n), i = a.length;
  if (i === 0)
    return;
  const u = vn(tt(n)), f = a.indexOf(u), p = f === -1 ? o === 1 ? 0 : i - 1 : f + o;
  return a[p];
}
function Pp(n) {
  return S0(tt(n).body, 1) || n;
}
function w0(n) {
  return S0(tt(n).body, -1) || n;
}
function E0(n, o) {
  if (!n)
    return null;
  const a = wi(tt(n).body), i = a.length;
  if (i === 0)
    return null;
  const u = a.indexOf(n);
  if (u === -1)
    return null;
  const f = (u + o + i) % i;
  return a[f];
}
function AR(n) {
  return E0(n, 1);
}
function zR(n) {
  return E0(n, -1);
}
function $r(n, o) {
  const a = o || n.currentTarget, i = n.relatedTarget;
  return !i || !Le(a, i);
}
function DR(n) {
  wi(n).forEach((a) => {
    a.dataset.tabindex = a.getAttribute("tabindex") || "", a.setAttribute("tabindex", "-1");
  });
}
function Hv(n) {
  const o = [];
  b0(n, "[data-tabindex]", o), o.forEach((a) => {
    const i = a.dataset.tabindex;
    delete a.dataset.tabindex, i ? a.setAttribute("tabindex", i) : a.removeAttribute("tabindex");
  });
}
function Co(n, o, a = !0) {
  return n.filter((u) => u.parentId === o).flatMap((u) => [...!a || u.context?.open ? [u] : [], ...Co(n, u.id, a)]);
}
function Uv(n, o) {
  let a = [], i = n.find((u) => u.id === o)?.parentId;
  for (; i; ) {
    const u = n.find((f) => f.id === i);
    i = u?.parentId, u && (a = a.concat(u));
  }
  return a;
}
function vi(n) {
  return `data-base-ui-${n}`;
}
let Fs = 0;
function ac(n, o = {}) {
  const {
    preventScroll: a = !1,
    sync: i = !1,
    shouldFocus: u
  } = o;
  cancelAnimationFrame(Fs);
  function f() {
    u && !u() || n?.focus({
      preventScroll: a
    });
  }
  if (i)
    return f(), rn;
  const p = requestAnimationFrame(f);
  return Fs = p, () => {
    Fs === p && (cancelAnimationFrame(p), Fs = 0);
  };
}
const _d = {
  inert: /* @__PURE__ */ new WeakMap(),
  "aria-hidden": /* @__PURE__ */ new WeakMap()
}, Lv = "data-base-ui-inert", dp = {
  inert: /* @__PURE__ */ new WeakSet(),
  "aria-hidden": /* @__PURE__ */ new WeakSet()
};
let ni = /* @__PURE__ */ new WeakMap(), Hd = 0;
function NR(n) {
  return dp[n];
}
function T0(n) {
  return n ? ea(n) ? n.host : T0(n.parentNode) : null;
}
const Iv = (n, o) => o.map((a) => {
  if (n.contains(a))
    return a;
  const i = T0(a);
  return n.contains(i) ? i : null;
}).filter((a) => a != null), Bv = (n) => {
  const o = /* @__PURE__ */ new Set();
  return n.forEach((a) => {
    let i = a;
    for (; i && !o.has(i); )
      o.add(i), i = i.parentNode;
  }), o;
}, Vv = (n, o, a) => {
  const i = [], u = (f) => {
    !f || a.has(f) || Array.from(f.children).forEach((p) => {
      mn(p) !== "script" && (o.has(p) ? u(p) : i.push(p));
    });
  };
  return u(n), i;
};
function jR(n, o, a, i, {
  mark: u = !0
}) {
  let f = null;
  i ? f = "inert" : a && (f = "aria-hidden");
  let p = null, g = null;
  const m = Iv(o, n), d = u ? Vv(o, Bv(m), new Set(m)) : [], v = [], b = [];
  if (f) {
    const S = _d[f], R = NR(f);
    g = R, p = S;
    const w = Iv(o, Array.from(o.querySelectorAll("[aria-live]"))), M = m.concat(w);
    Vv(o, Bv(M), new Set(M)).forEach((A) => {
      const O = A.getAttribute(f), z = O !== null && O !== "false", D = (S.get(A) || 0) + 1;
      S.set(A, D), v.push(A), D === 1 && z && R.add(A), z || A.setAttribute(f, f === "inert" ? "" : "true");
    });
  }
  return u && d.forEach((S) => {
    const R = (ni.get(S) || 0) + 1;
    ni.set(S, R), b.push(S), R === 1 && S.setAttribute(Lv, "");
  }), Hd += 1, () => {
    p && v.forEach((S) => {
      const w = (p.get(S) || 0) - 1;
      p.set(S, w), w || (!g?.has(S) && f && S.removeAttribute(f), g?.delete(S));
    }), u && b.forEach((S) => {
      const R = (ni.get(S) || 0) - 1;
      ni.set(S, R), R || S.removeAttribute(Lv);
    }), Hd -= 1, Hd || (_d.inert = /* @__PURE__ */ new WeakMap(), _d["aria-hidden"] = /* @__PURE__ */ new WeakMap(), dp.inert = /* @__PURE__ */ new WeakSet(), dp["aria-hidden"] = /* @__PURE__ */ new WeakSet(), ni = /* @__PURE__ */ new WeakMap());
  };
}
function Pv(n, o = {}) {
  const {
    ariaHidden: a = !1,
    inert: i = !1,
    mark: u = !0
  } = o, f = tt(n[0]).body;
  return jR(n, f, a, i, {
    mark: u
  });
}
var gl = Ob();
let Yv = 0;
function kR(n, o = "mui") {
  const [a, i] = y.useState(n), u = n || a;
  return y.useEffect(() => {
    a == null && (Yv += 1, i(`${o}-${Yv}`));
  }, [a, o]), u;
}
const Gv = Rp.useId;
function rr(n, o) {
  if (Gv !== void 0) {
    const a = Gv();
    return n ?? (o ? `${o}-${a}` : a);
  }
  return kR(n, o);
}
const _R = 500, R0 = 500, HR = {
  style: {
    transition: "none"
  }
}, C0 = "data-base-ui-click-trigger", O0 = {
  fallbackAxisSide: "none"
}, Yp = {
  fallbackAxisSide: "end"
}, UR = {
  clipPath: "inset(50%)",
  position: "fixed",
  top: 0,
  left: 0
}, M0 = /* @__PURE__ */ y.createContext(null), A0 = () => y.useContext(M0), LR = vi("portal");
function z0(n = {}) {
  const {
    ref: o,
    container: a,
    componentProps: i = bt,
    elementProps: u
  } = n, f = rr(), g = A0()?.portalNode, [m, d] = y.useState(null), [v, b] = y.useState(null), S = ze((E) => {
    E !== null && b(E);
  }), R = y.useRef(null);
  xe(() => {
    if (a === null) {
      R.current && (R.current = null, b(null), d(null));
      return;
    }
    if (f == null)
      return;
    const E = (a && (wp(a) ? a : a.current)) ?? g ?? document.body;
    if (E == null) {
      R.current && (R.current = null, b(null), d(null));
      return;
    }
    R.current !== E && (R.current = E, b(null), d(E));
  }, [a, g, f]);
  const w = nt("div", i, {
    ref: [o, S],
    props: [{
      id: f,
      [LR]: ""
    }, u]
  });
  return {
    portalNode: v,
    portalSubtree: m && w ? /* @__PURE__ */ gl.createPortal(w, m) : null
  };
}
const Bc = /* @__PURE__ */ y.forwardRef(function(o, a) {
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
  } = z0({
    container: g,
    ref: a,
    componentProps: o,
    elementProps: d
  }), S = y.useRef(null), R = y.useRef(null), w = y.useRef(null), M = y.useRef(null), [E, A] = y.useState(null), O = y.useRef(!1), z = E?.modal, D = E?.open, j = typeof m == "boolean" ? m : !!E && !E.modal && E.open && !!v;
  y.useEffect(() => {
    if (!v || z)
      return;
    function U(_) {
      v && _.relatedTarget && $r(_) && (_.type === "focusin" ? O.current && (Hv(v), O.current = !1) : (DR(v), O.current = !0));
    }
    return pl(Je(v, "focusin", U, !0), Je(v, "focusout", U, !0));
  }, [v, z]), xe(() => {
    !v || D !== !0 || !O.current || (Hv(v), O.current = !1);
  }, [D, v]);
  const N = y.useMemo(() => ({
    beforeOutsideRef: S,
    afterOutsideRef: R,
    beforeInsideRef: w,
    afterInsideRef: M,
    portalNode: v,
    setFocusManagerState: A
  }), [v]);
  return /* @__PURE__ */ x.jsxs(y.Fragment, {
    children: [b, /* @__PURE__ */ x.jsxs(M0.Provider, {
      value: N,
      children: [j && v && /* @__PURE__ */ x.jsx(Ro, {
        "data-type": "outside",
        ref: S,
        onFocus: (U) => {
          if ($r(U, v))
            w.current?.focus();
          else {
            const _ = E ? E.domReference : null;
            w0(_)?.focus();
          }
        }
      }), j && v && /* @__PURE__ */ x.jsx("span", {
        "aria-owns": v.id,
        style: UR
      }), v && /* @__PURE__ */ gl.createPortal(p, v), j && v && /* @__PURE__ */ x.jsx(Ro, {
        "data-type": "outside",
        ref: R,
        onFocus: (U) => {
          if ($r(U, v))
            M.current?.focus();
          else {
            const _ = E ? E.domReference : null;
            Pp(_)?.focus(), E?.closeOnFocusOut && E?.onOpenChange(!1, Ye(To, U.nativeEvent));
          }
        }
      })]
    })]
  });
});
function D0() {
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
class Gp {
  nodesRef = {
    current: []
  };
  events = D0();
  addNode(o) {
    this.nodesRef.current.push(o);
  }
  removeNode(o) {
    const a = this.nodesRef.current.findIndex((i) => i === o);
    a !== -1 && this.nodesRef.current.splice(a, 1);
  }
}
const N0 = /* @__PURE__ */ y.createContext(null), j0 = /* @__PURE__ */ y.createContext(null), Kl = () => y.useContext(N0)?.id || null, No = (n) => {
  const o = y.useContext(j0);
  return n ?? o;
};
function qp(n) {
  const o = rr(), a = No(n), i = Kl();
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
function k0(n) {
  const {
    children: o,
    id: a
  } = n, i = Kl();
  return /* @__PURE__ */ x.jsx(N0.Provider, {
    value: y.useMemo(() => ({
      id: a,
      parentId: i
    }), [a, i]),
    children: o
  });
}
function _0(n) {
  const {
    children: o,
    externalTree: a
  } = n, i = xn(() => a ?? new Gp()).current;
  return /* @__PURE__ */ x.jsx(j0.Provider, {
    value: i,
    children: o
  });
}
function Ul(n) {
  return n == null ? n : "current" in n ? n.current : n;
}
function IR(n, o) {
  const a = Dt(gn(n));
  return n instanceof a.KeyboardEvent ? "keyboard" : n instanceof a.FocusEvent ? o || "keyboard" : "pointerType" in n ? n.pointerType || "keyboard" : "touches" in n ? "touch" : n instanceof a.MouseEvent ? o || (n.detail === 0 ? "keyboard" : "mouse") : "";
}
const qv = 20;
let wo = [];
function Xp() {
  wo = wo.filter((n) => n.deref()?.isConnected);
}
function Xv(n) {
  Xp(), n && mn(n) !== "body" && (wo.push(new WeakRef(n)), wo.length > qv && (wo = wo.slice(-qv)));
}
function Fv() {
  return Xp(), wo[wo.length - 1]?.deref();
}
function BR(n) {
  return n ? Vp(n) ? n : wi(n)[0] || n : null;
}
function Kv(n) {
  if (n.hasAttribute("tabindex") && !n.hasAttribute("data-tabindex") || !n.getAttribute("role")?.includes("dialog"))
    return;
  const a = x0(n).filter((u) => {
    const f = u.getAttribute("data-tabindex") || "";
    return Vp(u) || u.hasAttribute("data-tabindex") && !f.startsWith("-");
  }), i = n.getAttribute("tabindex");
  a.length === 0 ? i !== "0" && (n.setAttribute("tabindex", "0"), n.setAttribute("data-tabindex", "0")) : (i !== "-1" || n.hasAttribute("data-tabindex") && n.getAttribute("data-tabindex") !== "-1") && (n.setAttribute("tabindex", "-1"), n.setAttribute("data-tabindex", "-1"));
}
function Vc(n) {
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
    externalTree: R,
    getInsideElements: w
  } = n, M = "rootStore" in o ? o.rootStore : o, E = M.useState("open"), A = M.useState("domReferenceElement"), O = M.useState("floatingElement"), {
    events: z,
    dataRef: D
  } = M.context, j = ze(() => D.current.floatingContext?.nodeId), N = u === !1, U = ip(A) && N, _ = Yt(u), G = Yt(f), k = Yt(d), ee = Yt(E), Q = No(R), X = A0(), Z = y.useRef(!1), q = y.useRef(!1), H = y.useRef(!1), Y = y.useRef(null), V = y.useRef(""), K = y.useRef(""), B = y.useRef(null), C = y.useRef(null), L = Eo(B, S, X?.beforeInsideRef), ne = Eo(C, X?.afterInsideRef), J = an(), re = an(), ie = ta(), oe = X != null, se = hc(O), ge = ze((fe = se) => fe ? wi(fe) : []), je = ze(() => w?.().filter((fe) => fe != null) ?? []);
  y.useEffect(() => {
    if (i || !g)
      return;
    function fe(Re) {
      Re.key === "Tab" && Le(se, vn(tt(se))) && ge().length === 0 && !U && fl(Re);
    }
    const ye = tt(se);
    return Je(ye, "keydown", fe);
  }, [i, se, g, U, ge]), y.useEffect(() => {
    if (i || !E)
      return;
    const fe = tt(se);
    function ye() {
      H.current = !1;
    }
    function Re(ke) {
      const we = gn(ke), Ce = je(), he = Le(O, we) || Le(A, we) || Le(X?.portalNode, we) || Ce.some((Se) => Se === we || Le(Se, we));
      H.current = !he, K.current = ke.pointerType || "keyboard", we?.closest(`[${C0}]`) && (q.current = !0, re.start(0, () => {
        q.current = !1;
      }));
    }
    function _e() {
      K.current = "keyboard";
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
  }, [i, O, A, se, E, X, re, je]), y.useEffect(() => {
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
      Vp(he) && (Y.current = he);
    }
    function _e(Ce) {
      const he = Ce.relatedTarget, Se = Ce.currentTarget, Te = gn(Ce);
      g && he == null && Te != null && Le(O, Te) && Xv(Te), queueMicrotask(() => {
        const Oe = j(), He = M.context.triggerElements, ae = je(), pe = he?.hasAttribute(vi("focus-guard")) && [B.current, C.current, X?.beforeInsideRef.current, X?.afterInsideRef.current, X?.beforeOutsideRef.current, X?.afterOutsideRef.current, Ul(b), Ul(v)].includes(he), Ue = !(Le(A, he) || Le(O, he) || Le(he, O) || Le(X?.portalNode, he) || ae.some((ve) => ve === he || Le(ve, he)) || he != null && He.hasElement(he) || He.hasMatchingElement((ve) => Le(ve, he)) || pe || Q && (Co(Q.nodesRef.current, Oe).find((ve) => Le(ve.context?.elements.floating, he) || Le(ve.context?.elements.domReference, he)) || Uv(Q.nodesRef.current, Oe).find((ve) => [ve.context?.elements.floating, hc(ve.context?.elements.floating)].includes(he) || ve.context?.elements.domReference === he)));
        if (Se === A && se && Kv(se), p && Se !== A && !Ic(Te) && vn(fe) === fe.body) {
          if (Rt(se) && (se.focus(), p === "popup")) {
            ie.request(() => {
              se.focus();
            });
            return;
          }
          const ve = ge(), be = Y.current, We = (be && ve.includes(be) ? be : null) || ve[ve.length - 1] || se;
          Rt(We) && We.focus();
        }
        if (D.current.insideReactTree) {
          D.current.insideReactTree = !1;
          return;
        }
        (U || !g) && he && Ue && !q.current && // Fix React 18 Strict Mode returnFocus due to double rendering.
        // For an "untrapped" typeable combobox (input role=combobox with
        // initialFocus=false), re-opening the popup and tabbing out should still close it even
        // when the previously focused element (e.g. the next tabbable outside the popup) is
        // focused again. Otherwise, the popup remains open on the second Tab sequence:
        // click input -> Tab (closes) -> click input -> Tab.
        // Allow closing when `isUntrappedTypeableCombobox` regardless of the previously focused element.
        (U || he !== Fv()) && (Z.current = !0, M.setOpen(!1, Ye(To, Ce)));
      });
    }
    function ke() {
      H.current || (D.current.insideReactTree = !0, J.start(0, () => {
        D.current.insideReactTree = !1;
      }));
    }
    const we = Rt(A) ? A : null;
    if (!(!O && !we))
      return pl(we && Je(we, "focusout", _e), we && Je(we, "pointerdown", ye), O && Je(O, "focusin", Re), O && Je(O, "focusout", _e), O && X && Je(O, "focusout", ke, !0));
  }, [i, A, O, se, g, Q, X, M, m, p, ge, U, j, D, J, re, ie, v, b, je]), y.useEffect(() => {
    if (i || !O || !E)
      return;
    const fe = Array.from(X?.portalNode?.querySelectorAll(`[${vi("portal")}]`) || []), Re = (Q ? Uv(Q.nodesRef.current, j()) : []).find((Se) => ip(Se.context?.elements.domReference || null))?.context?.elements.domReference, ke = [...[O, ...fe, B.current, C.current, X?.beforeOutsideRef.current, X?.afterOutsideRef.current, ...je()], Re, Ul(b), Ul(v), U ? A : null].filter((Se) => Se != null), we = Pv(ke, {
      ariaHidden: g || U,
      mark: !1
    }), Ce = [O, ...fe].filter((Se) => Se != null), he = Pv(Ce);
    return () => {
      he(), we();
    };
  }, [E, i, A, O, g, X, U, Q, j, v, b, je]), xe(() => {
    if (!E || i || !Rt(se))
      return;
    const fe = tt(se), ye = vn(fe);
    queueMicrotask(() => {
      const Re = _.current, _e = typeof Re == "function" ? Re(k.current || "") : Re;
      if (_e === void 0 || _e === !1 || Le(se, ye))
        return;
      let we = null;
      const Ce = () => (we == null && (we = ge(se)), we[0] || se);
      let he;
      _e === !0 || _e === null ? he = Ce() : he = Ul(_e), he = he || Ce();
      const Se = Le(se, vn(fe));
      ac(he, {
        preventScroll: he === se,
        shouldFocus() {
          if (!ee.current)
            return !1;
          if (Se)
            return !0;
          const Te = vn(fe);
          return !(Te !== he && Le(se, Te));
        }
      });
    });
  }, [i, E, se, ge, _, k, ee]), xe(() => {
    if (i || !se)
      return;
    const fe = tt(se), ye = vn(fe), Re = k.current == null;
    Xv(ye);
    function _e(we) {
      if (we.open || (V.current = IR(we.nativeEvent, K.current)), we.reason === Pt && we.nativeEvent.type === "mouseleave" && (Z.current = !0), we.reason === Uc)
        if (we.nested)
          Z.current = !1;
        else if (Hp(we.nativeEvent) || l0(we.nativeEvent))
          Z.current = !1;
        else {
          let Ce = !1;
          tt(se).createElement("div").focus({
            get preventScroll() {
              return Ce = !0, !1;
            }
          }), Ce ? Z.current = !1 : Z.current = !0;
        }
    }
    z.on("openchange", _e);
    function ke() {
      const we = G.current;
      let Ce = typeof we == "function" ? we(V.current) : we;
      if (Ce === void 0 || Ce === !1)
        return null;
      Ce === null && (Ce = !0);
      const he = A?.isConnected ? A : null, Se = ye?.isConnected && mn(ye) !== "body" ? ye : null;
      let Te = Re ? Se || he : he || Se;
      return Te || (Te = Fv() || null), typeof Ce == "boolean" ? Te : Ul(Ce) || Te || null;
    }
    return () => {
      z.off("openchange", _e);
      const we = vn(fe), Ce = je(), he = Le(O, we) || Ce.some((Oe) => Oe === we || Le(Oe, we)) || Q && Co(Q.nodesRef.current, j(), !1).some((Oe) => Le(Oe.context?.elements.floating, we)), Se = G.current, Te = ke();
      queueMicrotask(() => {
        const Oe = BR(Te), He = typeof Se != "boolean";
        Se && !Z.current && Rt(Oe) && // If the focus moved somewhere else after mount, avoid returning focus
        // since it likely entered a different element which should be
        // respected: https://github.com/floating-ui/floating-ui/issues/2607
        (!(!He && Oe !== we && we !== fe.body) || he) && Oe.focus({
          preventScroll: !0
        }), Z.current = !1;
      });
    };
  }, [i, O, se, G, k, z, Q, A, j, je]), xe(() => {
    if (!Ao || E || !O)
      return;
    const fe = vn(tt(O));
    !Rt(fe) || !Hc(fe) || Le(O, fe) && fe.blur();
  }, [E, O]), xe(() => {
    if (!(i || !X))
      return X.setFocusManagerState({
        modal: g,
        closeOnFocusOut: m,
        open: E,
        onOpenChange: M.setOpen,
        domReference: A
      }), () => {
        X.setFocusManagerState(null);
      };
  }, [i, X, g, E, M, m, A]), xe(() => {
    if (!(i || !se))
      return Kv(se), () => {
        queueMicrotask(Xp);
      };
  }, [i, se]);
  const Ee = !i && (g ? !U : !0) && (oe || g);
  return /* @__PURE__ */ x.jsxs(y.Fragment, {
    children: [Ee && /* @__PURE__ */ x.jsx(Ro, {
      "data-type": "inside",
      ref: L,
      onFocus: (fe) => {
        if (g) {
          const ye = ge();
          ac(ye[ye.length - 1]);
        } else X?.portalNode && (Z.current = !1, $r(fe, X.portalNode) ? Pp(A)?.focus() : Ul(b ?? X.beforeOutsideRef)?.focus());
      }
    }), a, Ee && /* @__PURE__ */ x.jsx(Ro, {
      "data-type": "inside",
      ref: ne,
      onFocus: (fe) => {
        g ? ac(ge()[0]) : X?.portalNode && (m && (Z.current = !0), $r(fe, X.portalNode) ? w0(A)?.focus() : Ul(v ?? X.afterOutsideRef)?.focus());
      }
    })]
  });
}
function Pc(n, o = {}) {
  const {
    enabled: a = !0,
    event: i = "click",
    toggle: u = !0,
    ignoreMouse: f = !1,
    stickIfOpen: p = !0,
    touchOpenDelay: g = 0,
    reason: m = ql
  } = o, d = "rootStore" in n ? n.rootStore : n, v = d.context.dataRef, b = y.useRef(void 0), S = ta(), R = an(), w = y.useMemo(() => {
    function M(A, O, z, D) {
      const j = Ye(m, O, z);
      A && D === "touch" && g > 0 ? R.start(g, () => {
        d.setOpen(!0, j);
      }) : d.setOpen(A, j);
    }
    function E(A, O, z) {
      const D = v.current.openEvent, j = d.select("domReferenceElement") !== O;
      return A && j || !A || !u ? !0 : D && p ? !z(D.type) : !1;
    }
    return {
      onPointerDown(A) {
        b.current = A.pointerType;
      },
      onMouseDown(A) {
        const O = b.current, z = A.nativeEvent, D = d.select("open");
        if (A.button !== 0 || i === "click" || or(O, !0) && f)
          return;
        const j = E(D, A.currentTarget, (_) => _ === "click" || _ === "mousedown"), N = gn(z);
        if (Hc(N)) {
          M(j, z, N, O);
          return;
        }
        const U = A.currentTarget;
        S.request(() => {
          M(j, z, U, O);
        });
      },
      onClick(A) {
        if (i === "mousedown-only")
          return;
        const O = b.current;
        if (i === "mousedown" && O) {
          b.current = void 0;
          return;
        }
        if (or(O, !0) && f)
          return;
        const z = d.select("open"), D = E(z, A.currentTarget, (j) => j === "click" || j === "mousedown" || j === "keydown" || j === "keyup");
        M(D, A.nativeEvent, A.currentTarget, O);
      },
      onKeyDown() {
        b.current = void 0;
      }
    };
  }, [v, i, f, m, d, p, u, S, R, g]);
  return y.useMemo(() => a ? {
    reference: w
  } : bt, [a, w]);
}
function VR(n, o) {
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
function Qv(n) {
  return n != null && n.clientX != null;
}
function PR(n, o = {}) {
  const {
    enabled: a = !0,
    axis: i = "both"
  } = o, u = "rootStore" in n ? n.rootStore : n, f = u.useState("open"), p = u.useState("floatingElement"), g = u.useState("domReferenceElement"), m = u.context.dataRef, d = y.useRef(!1), v = y.useRef(null), [b, S] = y.useState(), [R, w] = y.useState([]), M = ze((D) => {
    u.set("positionReference", D);
  }), E = ze((D, j, N) => {
    d.current || m.current.openEvent && !Qv(m.current.openEvent) || u.set("positionReference", VR(N ?? g, {
      x: D,
      y: j,
      axis: i,
      dataRef: m,
      pointerType: b
    }));
  }), A = ze((D) => {
    f ? v.current || (E(D.clientX, D.clientY, D.currentTarget), w([])) : E(D.clientX, D.clientY, D.currentTarget);
  }), O = or(b) ? p : f;
  y.useEffect(() => {
    if (!a) {
      M(g);
      return;
    }
    if (!O)
      return;
    function D() {
      v.current?.(), v.current = null;
    }
    const j = Dt(p);
    function N(U) {
      const _ = gn(U);
      Le(p, _) ? D() : E(U.clientX, U.clientY);
    }
    return !m.current.openEvent || Qv(m.current.openEvent) ? v.current = Je(j, "mousemove", N) : M(g), D;
  }, [O, a, p, m, g, u, E, M, R]), y.useEffect(() => () => {
    u.set("positionReference", null);
  }, [u]), y.useEffect(() => {
    a && !p && (d.current = !1);
  }, [a, p]), y.useEffect(() => {
    !a && f && (d.current = !0);
  }, [a, f]);
  const z = y.useMemo(() => {
    function D(j) {
      S(j.pointerType);
    }
    return {
      onPointerDown: D,
      onPointerEnter: D,
      onMouseMove: A,
      onMouseEnter: A
    };
  }, [A]);
  return y.useMemo(() => a ? {
    reference: z,
    trigger: z
  } : {}, [a, z]);
}
function YR() {
  return !1;
}
function GR(n) {
  return {
    escapeKey: typeof n == "boolean" ? n : n?.escapeKey ?? !1,
    outsidePress: typeof n == "boolean" ? n : n?.outsidePress ?? !0
  };
}
function Ei(n, o = {}) {
  const {
    enabled: a = !0,
    escapeKey: i = !0,
    outsidePress: u = !0,
    outsidePressEvent: f = "sloppy",
    referencePress: p = YR,
    bubbles: g,
    externalTree: m
  } = o, d = "rootStore" in n ? n.rootStore : n, v = d.useState("open"), b = d.useState("floatingElement"), {
    dataRef: S
  } = d.context, R = No(m), w = ze(typeof u == "function" ? u : () => !1), M = typeof u == "function" ? w : u, E = M !== !1, A = ze(() => f), {
    escapeKey: O,
    outsidePress: z
  } = GR(g), D = y.useRef(!1), j = y.useRef(!1), N = y.useRef(!1), U = y.useRef(!1), _ = y.useRef(""), G = y.useRef(null), k = an(), ee = an(), Q = ze(() => {
    ee.clear(), S.current.insideReactTree = !1;
  }), X = ze((L) => {
    const ne = S.current.floatingContext?.nodeId;
    return (R ? Co(R.nodesRef.current, ne) : []).some((re) => re.context?.open && !re.context.dataRef.current[L]);
  }), Z = ze((L) => jd(L, d.select("floatingElement")) || jd(L, d.select("domReferenceElement"))), q = ze((L) => {
    p() && d.setOpen(!1, Ye(ql, L.nativeEvent));
  }), H = ze((L) => {
    if (!v || !a || !i || L.key !== "Escape" || U.current || !O && X("__escapeKeyBubbles"))
      return;
    const ne = eR(L) ? L.nativeEvent : L, J = Ye(Si, ne);
    d.setOpen(!1, J), J.isCanceled || L.preventDefault(), !O && !J.isPropagationAllowed && L.stopPropagation();
  }), Y = ze(() => {
    S.current.insideReactTree = !0, ee.start(0, Q);
  }), V = ze((L) => {
    if (!v || !a || L.button !== 0)
      return;
    const ne = gn(L.nativeEvent);
    Le(d.select("floatingElement"), ne) && (D.current || (D.current = !0, j.current = !1));
  }), K = ze((L) => {
    !v || !a || (L.defaultPrevented || L.nativeEvent.defaultPrevented) && D.current && (j.current = !0);
  });
  y.useEffect(() => {
    if (!v || !a)
      return;
    S.current.__escapeKeyBubbles = O, S.current.__outsidePressBubbles = z;
    const L = new el(), ne = new el();
    function J() {
      L.clear(), U.current = !0;
    }
    function re() {
      L.start(
        // 0ms or 1ms don't work in Safari. 5ms appears to consistently work.
        // Only apply to WebKit for the test to remain 0ms.
        Ao ? 5 : 0,
        () => {
          U.current = !1;
        }
      );
    }
    function ie() {
      N.current = !0, ne.start(0, () => {
        N.current = !1;
      });
    }
    function oe() {
      D.current = !1, j.current = !1;
    }
    function se() {
      const ae = _.current, pe = ae === "pen" || !ae ? "mouse" : ae, Ue = A(), ve = typeof Ue == "function" ? Ue() : Ue;
      return typeof ve == "string" ? ve : ve[pe];
    }
    function ge(ae) {
      const pe = se();
      return pe === "intentional" && ae.type !== "click" || pe === "sloppy" && ae.type === "click";
    }
    function je(ae) {
      const pe = S.current.floatingContext?.nodeId, Ue = R && Co(R.nodesRef.current, pe).some((ve) => jd(ae, ve.context?.elements.floating));
      return Z(ae) || Ue;
    }
    function Ee(ae) {
      if (ge(ae)) {
        ae.type !== "click" && !Z(ae) && (ne.clear(), N.current = !1), Q();
        return;
      }
      if (S.current.insideReactTree) {
        Q();
        return;
      }
      const pe = gn(ae), Ue = `[${vi("inert")}]`, ve = $e(pe) ? pe.getRootNode() : null, be = Array.from((ea(ve) ? ve : tt(d.select("floatingElement"))).querySelectorAll(Ue)), We = d.context.triggerElements;
      if (pe && (We.hasElement(pe) || We.hasMatchingElement((pt) => Le(pt, pe))))
        return;
      let rt = $e(pe) ? pe : null;
      for (; rt && !Bl(rt); ) {
        const pt = Yl(rt);
        if (Bl(pt) || !$e(pt))
          break;
        rt = pt;
      }
      if (!(be.length && $e(pe) && !nR(pe) && // Clicked on a direct ancestor (e.g. FloatingOverlay).
      !Le(pe, d.select("floatingElement")) && // If the target root element contains none of the markers, then the
      // element was injected after the floating element rendered.
      be.every((pt) => !Le(rt, pt)))) {
        if (Rt(pe) && !("touches" in ae)) {
          const pt = Bl(pe), Nt = In(pe), et = /auto|scroll/, gt = pt || et.test(Nt.overflowX), zt = pt || et.test(Nt.overflowY), mt = gt && pe.clientWidth > 0 && pe.scrollWidth > pe.clientWidth, Mn = zt && pe.clientHeight > 0 && pe.scrollHeight > pe.clientHeight, An = Nt.direction === "rtl", Qe = Mn && (An ? ae.offsetX <= pe.offsetWidth - pe.clientWidth : ae.offsetX > pe.clientWidth), ft = mt && ae.offsetY > pe.clientHeight;
          if (Qe || ft)
            return;
        }
        if (!je(ae)) {
          if (se() === "intentional" && N.current) {
            ne.clear(), N.current = !1;
            return;
          }
          typeof M == "function" && !M(ae) || X("__outsidePressBubbles") || (d.setOpen(!1, Ye(Uc, ae)), Q());
        }
      }
    }
    function fe(ae) {
      se() !== "sloppy" || ae.pointerType === "touch" || !d.select("open") || !a || Z(ae) || Ee(ae);
    }
    function ye(ae) {
      if (se() !== "sloppy" || !d.select("open") || !a || Z(ae))
        return;
      const pe = ae.touches[0];
      pe && (G.current = {
        startTime: Date.now(),
        startX: pe.clientX,
        startY: pe.clientY,
        dismissOnTouchEnd: !1,
        dismissOnMouseDown: !0
      }, k.start(1e3, () => {
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
      _.current = "touch", Re(ae, ye);
    }
    function ke(ae) {
      k.clear(), ae.type === "pointerdown" && (_.current = ae.pointerType), !(ae.type === "mousedown" && G.current && !G.current.dismissOnMouseDown) && Re(ae, (pe) => {
        pe.type === "pointerdown" ? fe(pe) : Ee(pe);
      });
    }
    function we(ae) {
      if (!D.current)
        return;
      const pe = j.current;
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
          typeof M == "function" && !M(ae) || (ne.clear(), N.current = !0, Q());
        }
      }
    }
    function Ce(ae) {
      if (se() !== "sloppy" || !G.current || Z(ae))
        return;
      const pe = ae.touches[0];
      if (!pe)
        return;
      const Ue = Math.abs(pe.clientX - G.current.startX), ve = Math.abs(pe.clientY - G.current.startY), be = Math.sqrt(Ue * Ue + ve * ve);
      be > 5 && (G.current.dismissOnTouchEnd = !0), be > 10 && (Ee(ae), k.clear(), G.current = null);
    }
    function he(ae) {
      Re(ae, Ce);
    }
    function Se(ae) {
      se() !== "sloppy" || !G.current || Z(ae) || (G.current.dismissOnTouchEnd && Ee(ae), k.clear(), G.current = null);
    }
    function Te(ae) {
      Re(ae, Se);
    }
    const Oe = tt(b), He = pl(i && pl(Je(Oe, "keydown", H), Je(Oe, "compositionstart", J), Je(Oe, "compositionend", re)), E && pl(Je(Oe, "click", ke, !0), Je(Oe, "pointerdown", ke, !0), Je(Oe, "pointerup", we, !0), Je(Oe, "pointercancel", we, !0), Je(Oe, "mousedown", ke, !0), Je(Oe, "mouseup", we, !0), Je(Oe, "touchstart", _e, !0), Je(Oe, "touchmove", he, !0), Je(Oe, "touchend", Te, !0)));
    return () => {
      He(), L.clear(), ne.clear(), oe(), N.current = !1;
    };
  }, [S, b, i, E, M, v, a, O, z, H, Q, A, X, Z, R, d, k]), y.useEffect(Q, [M, Q]);
  const B = y.useMemo(() => ({
    onKeyDown: H,
    onPointerDown: q,
    onClick: q
  }), [H, q]), C = y.useMemo(() => ({
    onKeyDown: H,
    // `onMouseDown` may be blocked if `event.preventDefault()` is called in
    // `onPointerDown`, such as with <NumberField.ScrubArea>.
    // See https://github.com/mui/base-ui/pull/3379
    onPointerDown: K,
    onMouseDown: K,
    onClickCapture: Y,
    onMouseDownCapture(L) {
      Y(), V(L);
    },
    onPointerDownCapture(L) {
      Y(), V(L);
    },
    onMouseUpCapture: Y,
    onTouchEndCapture: Y,
    onTouchMoveCapture: Y
  }), [H, Y, V, K]);
  return y.useMemo(() => a ? {
    reference: B,
    floating: C,
    trigger: B
  } : {}, [a, B, C]);
}
function Zv(n, o, a) {
  let {
    reference: i,
    floating: u
  } = n;
  const f = Wn(o), p = Bp(o), g = Ip(p), m = Ln(o), d = f === "y", v = i.x + i.width / 2 - u.width / 2, b = i.y + i.height / 2 - u.height / 2, S = i[g] / 2 - u[g] / 2;
  let R;
  switch (m) {
    case "top":
      R = {
        x: v,
        y: i.y - u.height
      };
      break;
    case "bottom":
      R = {
        x: v,
        y: i.y + i.height
      };
      break;
    case "right":
      R = {
        x: i.x + i.width,
        y: b
      };
      break;
    case "left":
      R = {
        x: i.x - u.width,
        y: b
      };
      break;
    default:
      R = {
        x: i.x,
        y: i.y
      };
  }
  const w = Do(o);
  return w && (R[p] += S * (w === "end" ? 1 : -1) * (a && d ? -1 : 1)), R;
}
async function qR(n, o) {
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
    padding: R = 0
  } = Xl(o, n), w = p0(R), E = g[S ? b === "floating" ? "reference" : "floating" : b], A = yi(await f.getClippingRect({
    element: (a = await (f.isElement == null ? void 0 : f.isElement(E))) == null || a ? E : E.contextElement || await (f.getDocumentElement == null ? void 0 : f.getDocumentElement(g.floating)),
    boundary: d,
    rootBoundary: v,
    strategy: m
  })), O = b === "floating" ? {
    x: i,
    y: u,
    width: p.floating.width,
    height: p.floating.height
  } : p.reference, z = await (f.getOffsetParent == null ? void 0 : f.getOffsetParent(g.floating)), D = await (f.isElement == null ? void 0 : f.isElement(z)) && await (f.getScale == null ? void 0 : f.getScale(z)) || {
    x: 1,
    y: 1
  }, j = yi(f.convertOffsetParentRelativeRectToViewportRelativeRect ? await f.convertOffsetParentRelativeRectToViewportRelativeRect({
    elements: g,
    rect: O,
    offsetParent: z,
    strategy: m
  }) : O);
  return {
    top: (A.top - j.top + w.top) / D.y,
    bottom: (j.bottom - A.bottom + w.bottom) / D.y,
    left: (A.left - j.left + w.left) / D.x,
    right: (j.right - A.right + w.right) / D.x
  };
}
const XR = 50, FR = async (n, o, a) => {
  const {
    placement: i = "bottom",
    strategy: u = "absolute",
    middleware: f = [],
    platform: p
  } = a, g = p.detectOverflow ? p : {
    ...p,
    detectOverflow: qR
  }, m = await (p.isRTL == null ? void 0 : p.isRTL(o));
  let d = await p.getElementRects({
    reference: n,
    floating: o,
    strategy: u
  }), {
    x: v,
    y: b
  } = Zv(d, i, m), S = i, R = 0;
  const w = {};
  for (let M = 0; M < f.length; M++) {
    const E = f[M];
    if (!E)
      continue;
    const {
      name: A,
      fn: O
    } = E, {
      x: z,
      y: D,
      data: j,
      reset: N
    } = await O({
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
    v = z ?? v, b = D ?? b, w[A] = {
      ...w[A],
      ...j
    }, N && R < XR && (R++, typeof N == "object" && (N.placement && (S = N.placement), N.rects && (d = N.rects === !0 ? await p.getElementRects({
      reference: n,
      floating: o,
      strategy: u
    }) : N.rects), {
      x: v,
      y: b
    } = Zv(d, S, m)), M = -1);
  }
  return {
    x: v,
    y: b,
    placement: S,
    strategy: u,
    middlewareData: w
  };
}, KR = function(n) {
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
        fallbackStrategy: R = "bestFit",
        fallbackAxisSideDirection: w = "none",
        flipAlignment: M = !0,
        ...E
      } = Xl(n, o);
      if ((a = f.arrow) != null && a.alignmentOffset)
        return {};
      const A = Ln(u), O = Wn(g), z = Ln(g) === g, D = await (m.isRTL == null ? void 0 : m.isRTL(d.floating)), j = S || (z || !M ? [vc(g)] : yR(g)), N = w !== "none";
      !S && N && j.push(...SR(g, M, w, D));
      const U = [g, ...j], _ = await m.detectOverflow(o, E), G = [];
      let k = ((i = f.flip) == null ? void 0 : i.overflows) || [];
      if (v && G.push(_[A]), b) {
        const Z = hR(u, p, D);
        G.push(_[Z[0]], _[Z[1]]);
      }
      if (k = [...k, {
        placement: u,
        overflows: G
      }], !G.every((Z) => Z <= 0)) {
        var ee, Q;
        const Z = (((ee = f.flip) == null ? void 0 : ee.index) || 0) + 1, q = U[Z];
        if (q && (!(b === "alignment" ? O !== Wn(q) : !1) || // We leave the current main axis only if every placement on that axis
        // overflows the main axis.
        k.every((V) => Wn(V.placement) === O ? V.overflows[0] > 0 : !0)))
          return {
            data: {
              index: Z,
              overflows: k
            },
            reset: {
              placement: q
            }
          };
        let H = (Q = k.filter((Y) => Y.overflows[0] <= 0).sort((Y, V) => Y.overflows[1] - V.overflows[1])[0]) == null ? void 0 : Q.placement;
        if (!H)
          switch (R) {
            case "bestFit": {
              var X;
              const Y = (X = k.filter((V) => {
                if (N) {
                  const K = Wn(V.placement);
                  return K === O || // Create a bias to the `y` side axis due to horizontal
                  // reading directions favoring greater width.
                  K === "y";
                }
                return !0;
              }).map((V) => [V.placement, V.overflows.filter((K) => K > 0).reduce((K, B) => K + B, 0)]).sort((V, K) => V[1] - K[1])[0]) == null ? void 0 : X[0];
              Y && (H = Y);
              break;
            }
            case "initialPlacement":
              H = g;
              break;
          }
        if (u !== H)
          return {
            reset: {
              placement: H
            }
          };
      }
      return {};
    }
  };
};
function Jv(n, o) {
  return {
    top: n.top - o.height,
    right: n.right - o.width,
    bottom: n.bottom - o.height,
    left: n.left - o.width
  };
}
function $v(n) {
  return gR.some((o) => n[o] >= 0);
}
const QR = function(n) {
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
      } = Xl(n, o);
      switch (u) {
        case "referenceHidden": {
          const p = await i.detectOverflow(o, {
            ...f,
            elementContext: "reference"
          }), g = Jv(p, a.reference);
          return {
            data: {
              referenceHiddenOffsets: g,
              referenceHidden: $v(g)
            }
          };
        }
        case "escaped": {
          const p = await i.detectOverflow(o, {
            ...f,
            altBoundary: !0
          }), g = Jv(p, a.floating);
          return {
            data: {
              escapedOffsets: g,
              escaped: $v(g)
            }
          };
        }
        default:
          return {};
      }
    }
  };
}, H0 = /* @__PURE__ */ new Set(["left", "top"]);
async function ZR(n, o) {
  const {
    placement: a,
    platform: i,
    elements: u
  } = n, f = await (i.isRTL == null ? void 0 : i.isRTL(u.floating)), p = Ln(a), g = Do(a), m = Wn(a) === "y", d = H0.has(p) ? -1 : 1, v = f && m ? -1 : 1, b = Xl(o, n);
  let {
    mainAxis: S,
    crossAxis: R,
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
  return g && typeof w == "number" && (R = g === "end" ? w * -1 : w), m ? {
    x: R * v,
    y: S * d
  } : {
    x: S * d,
    y: R * v
  };
}
const JR = function(n) {
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
      } = o, m = await ZR(o, n);
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
}, $R = function(n) {
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
          fn: (O) => {
            let {
              x: z,
              y: D
            } = O;
            return {
              x: z,
              y: D
            };
          }
        },
        ...d
      } = Xl(n, o), v = {
        x: a,
        y: i
      }, b = await f.detectOverflow(o, d), S = Wn(u), R = Lp(S);
      let w = v[R], M = v[S];
      const E = (O, z) => d0(z + b[O === "y" ? "top" : "left"], z, z - b[O === "y" ? "bottom" : "right"]);
      p && (w = E(R, w)), g && (M = E(S, M));
      const A = m.fn({
        ...o,
        [R]: w,
        [S]: M
      });
      return {
        ...A,
        data: {
          x: A.x - a,
          y: A.y - i,
          enabled: {
            [R]: p,
            [S]: g
          }
        }
      };
    }
  };
}, WR = function(n) {
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
      } = Xl(n, o), S = {
        x: u,
        y: f
      }, R = Wn(p), w = Lp(R);
      let M = S[w], E = S[R];
      const A = Xl(d, o), O = typeof A == "number" ? {
        mainAxis: A,
        crossAxis: 0
      } : {
        mainAxis: (a = A.mainAxis) != null ? a : 0,
        crossAxis: (i = A.crossAxis) != null ? i : 0
      };
      if (v) {
        const j = w === "y" ? "height" : "width", N = g.reference[w] - g.floating[j] + O.mainAxis, U = g.reference[w] + g.reference[j] - O.mainAxis;
        M < N ? M = N : M > U && (M = U);
      }
      if (b) {
        var z, D;
        const j = w === "y" ? "width" : "height", N = H0.has(Ln(p)), U = g.reference[R] - g.floating[j] + (N && ((z = m.offset) == null ? void 0 : z[R]) || 0) + (N ? 0 : O.crossAxis), _ = g.reference[R] + g.reference[j] + (N ? 0 : ((D = m.offset) == null ? void 0 : D[R]) || 0) - (N ? O.crossAxis : 0);
        E < U ? E = U : E > _ && (E = _);
      }
      return {
        [w]: M,
        [R]: E
      };
    }
  };
}, eC = function(n) {
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
      } = Xl(n, o), m = await u.detectOverflow(o, g), d = Ln(a), v = Do(a), b = Wn(a) === "y", {
        width: S,
        height: R
      } = i.floating;
      let w, M;
      d === "top" || d === "bottom" ? (w = d, M = v === (await (u.isRTL == null ? void 0 : u.isRTL(f.floating)) ? "start" : "end") ? "left" : "right") : (M = d, w = v === "end" ? "top" : "bottom");
      const E = R - m.top - m.bottom, A = S - m.left - m.right, O = la(R - m[w], E), z = la(S - m[M], A), D = o.middlewareData.shift, j = !D;
      let N = O, U = z;
      D != null && D.enabled.x && (U = A), D != null && D.enabled.y && (N = E), j && !v && (b ? U = S - 2 * Vl(m.left, m.right) : N = R - 2 * Vl(m.top, m.bottom)), await p({
        ...o,
        availableWidth: U,
        availableHeight: N
      });
      const _ = await u.getDimensions(f.floating);
      return S !== _.width || R !== _.height ? {
        reset: {
          rects: !0
        }
      } : {};
    }
  };
};
function U0(n) {
  const o = In(n);
  let a = parseFloat(o.width) || 0, i = parseFloat(o.height) || 0;
  const u = Rt(n), f = u ? n.offsetWidth : a, p = u ? n.offsetHeight : i, g = yc(a) !== f || yc(i) !== p;
  return g && (a = f, i = p), {
    width: a,
    height: i,
    $: g
  };
}
function Fp(n) {
  return $e(n) ? n : n.contextElement;
}
function Wr(n) {
  const o = Fp(n);
  if (!Rt(o))
    return Pl(1);
  const a = o.getBoundingClientRect(), {
    width: i,
    height: u,
    $: f
  } = U0(o);
  let p = (f ? yc(a.width) : a.width) / i, g = (f ? yc(a.height) : a.height) / u;
  return (!p || !Number.isFinite(p)) && (p = 1), (!g || !Number.isFinite(g)) && (g = 1), {
    x: p,
    y: g
  };
}
const tC = /* @__PURE__ */ Pl(0);
function L0(n) {
  const o = Dt(n);
  return !Tp() || !o.visualViewport ? tC : {
    x: o.visualViewport.offsetLeft,
    y: o.visualViewport.offsetTop
  };
}
function nC(n, o, a) {
  return o === void 0 && (o = !1), !!a && o && a === Dt(n);
}
function ar(n, o, a, i) {
  o === void 0 && (o = !1), a === void 0 && (a = !1);
  const u = n.getBoundingClientRect(), f = Fp(n);
  let p = Pl(1);
  o && (i ? $e(i) && (p = Wr(i)) : p = Wr(n));
  const g = nC(f, a, i) ? L0(f) : Pl(0);
  let m = (u.left + g.x) / p.x, d = (u.top + g.y) / p.y, v = u.width / p.x, b = u.height / p.y;
  if (f && i) {
    const S = Dt(f), R = $e(i) ? Dt(i) : i;
    let w = S, M = np(w);
    for (; M && R !== w; ) {
      const E = Wr(M), A = M.getBoundingClientRect(), O = In(M), z = A.left + (M.clientLeft + parseFloat(O.paddingLeft)) * E.x, D = A.top + (M.clientTop + parseFloat(O.paddingTop)) * E.y;
      m *= E.x, d *= E.y, v *= E.x, b *= E.y, m += z, d += D, w = Dt(M), M = np(w);
    }
  }
  return yi({
    width: v,
    height: b,
    x: m,
    y: d
  });
}
function Yc(n, o) {
  const a = Dc(n).scrollLeft;
  return o ? o.left + a : ar(Fl(n)).left + a;
}
function I0(n, o) {
  const a = n.getBoundingClientRect(), i = a.left + o.scrollLeft - Yc(n, a), u = a.top + o.scrollTop;
  return {
    x: i,
    y: u
  };
}
function lC(n) {
  let {
    elements: o,
    rect: a,
    offsetParent: i,
    strategy: u
  } = n;
  const f = u === "fixed", p = Fl(i), g = o ? zc(o.floating) : !1;
  if (i === p || g && f)
    return a;
  let m = {
    scrollLeft: 0,
    scrollTop: 0
  }, d = Pl(1);
  const v = Pl(0), b = Rt(i);
  if ((b || !f) && ((mn(i) !== "body" || sr(p)) && (m = Dc(i)), b)) {
    const R = ar(i);
    d = Wr(i), v.x = R.x + i.clientLeft, v.y = R.y + i.clientTop;
  }
  const S = p && !b && !f ? I0(p, m) : Pl(0);
  return {
    width: a.width * d.x,
    height: a.height * d.y,
    x: a.x * d.x - m.scrollLeft * d.x + v.x + S.x,
    y: a.y * d.y - m.scrollTop * d.y + v.y + S.y
  };
}
function oC(n) {
  return n.getClientRects ? Array.from(n.getClientRects()) : [];
}
function rC(n) {
  const o = Dc(n), a = n.ownerDocument.body, i = Vl(n.scrollWidth, n.clientWidth, a.scrollWidth, a.clientWidth), u = Vl(n.scrollHeight, n.clientHeight, a.scrollHeight, a.clientHeight);
  let f = -o.scrollLeft + Yc(n);
  const p = -o.scrollTop;
  return In(a).direction === "rtl" && (f += Vl(n.clientWidth, a.clientWidth) - i), {
    width: i,
    height: u,
    x: f,
    y: p
  };
}
const aC = 25;
function iC(n, o, a) {
  a === void 0 && (a = "viewport");
  const i = a === "layoutViewport", u = Dt(n), f = Fl(n), p = u.visualViewport;
  let g = f.clientWidth, m = f.clientHeight, d = 0, v = 0;
  if (p) {
    const S = !Tp() || o === "fixed";
    i ? S || (d = -p.offsetLeft, v = -p.offsetTop) : (g = p.width, m = p.height, S && (d = p.offsetLeft, v = p.offsetTop));
  }
  if (Yc(f) <= 0) {
    const S = f.ownerDocument, R = S.body, w = getComputedStyle(R), M = S.compatMode === "CSS1Compat" && parseFloat(w.marginLeft) + parseFloat(w.marginRight) || 0, E = Math.abs(f.clientWidth - R.clientWidth - M), A = getComputedStyle(f).scrollbarGutter === "stable both-edges" ? E / 2 : E;
    A <= aC && (g -= A);
  }
  return {
    width: g,
    height: m,
    x: d,
    y: v
  };
}
function sC(n, o) {
  const a = ar(n, !0, o === "fixed"), i = a.top + n.clientTop, u = a.left + n.clientLeft, f = Wr(n), p = n.clientWidth * f.x, g = n.clientHeight * f.y, m = u * f.x, d = i * f.y;
  return {
    width: p,
    height: g,
    x: m,
    y: d
  };
}
function Wv(n, o, a) {
  let i;
  if (o === "viewport" || o === "layoutViewport")
    i = iC(n, a, o);
  else if (o === "document")
    i = rC(Fl(n));
  else if ($e(o))
    i = sC(o, a);
  else {
    const u = L0(n);
    i = {
      x: o.x - u.x,
      y: o.y - u.y,
      width: o.width,
      height: o.height
    };
  }
  return yi(i);
}
function cC(n, o) {
  const a = o.get(n);
  if (a)
    return a;
  let i = mi(n, [], !1).filter((g) => $e(g) && mn(g) !== "body"), u = null;
  const f = In(n).position === "fixed";
  let p = f ? Yl(n) : n;
  for (; $e(p) && !Bl(p); ) {
    const g = In(p), m = Ep(p), d = u ? u.position : f ? "fixed" : "";
    !m && (d === "fixed" || d === "absolute" && g.position === "static") ? i = i.filter((b) => b !== p) : u = g, p = Yl(p);
  }
  return o.set(n, i), i;
}
function uC(n) {
  let {
    element: o,
    boundary: a,
    rootBoundary: i,
    strategy: u
  } = n;
  const p = [...a === "clippingAncestors" ? zc(o) ? [] : cC(o, this._c) : [].concat(a), i], g = Wv(o, p[0], u);
  let m = g.top, d = g.right, v = g.bottom, b = g.left;
  for (let S = 1; S < p.length; S++) {
    const R = Wv(o, p[S], u);
    m = Vl(R.top, m), d = la(R.right, d), v = la(R.bottom, v), b = Vl(R.left, b);
  }
  return {
    width: d - b,
    height: v - m,
    x: b,
    y: m
  };
}
function fC(n) {
  const {
    width: o,
    height: a
  } = U0(n);
  return {
    width: o,
    height: a
  };
}
function dC(n, o, a) {
  const i = Rt(o), u = Fl(o), f = a === "fixed", p = ar(n, !0, f, o);
  let g = {
    scrollLeft: 0,
    scrollTop: 0
  };
  const m = Pl(0);
  if ((i || !f) && ((mn(o) !== "body" || sr(u)) && (g = Dc(o)), i)) {
    const S = ar(o, !0, f, o);
    m.x = S.x + o.clientLeft, m.y = S.y + o.clientTop;
  }
  !i && u && (m.x = Yc(u));
  const d = u && !i && !f ? I0(u, g) : Pl(0), v = p.left + g.scrollLeft - m.x - d.x, b = p.top + g.scrollTop - m.y - d.y;
  return {
    x: v,
    y: b,
    width: p.width,
    height: p.height
  };
}
function Ud(n) {
  return In(n).position === "static";
}
function eb(n, o) {
  if (!Rt(n) || In(n).position === "fixed")
    return null;
  if (o)
    return o(n);
  let a = n.offsetParent;
  return Fl(n) === a && (a = a.ownerDocument.body), a;
}
function B0(n, o) {
  const a = Dt(n);
  if (zc(n))
    return a;
  if (!Rt(n)) {
    let u = Yl(n);
    for (; u && !Bl(u); ) {
      if ($e(u) && !Ud(u))
        return u;
      u = Yl(u);
    }
    return a;
  }
  let i = eb(n, o);
  for (; i && x1(i) && Ud(i); )
    i = eb(i, o);
  return i && Bl(i) && Ud(i) && !Ep(i) ? a : i || E1(n) || a;
}
const pC = async function(n) {
  const o = this.getOffsetParent || B0, a = this.getDimensions, i = await a(n.floating);
  return {
    reference: dC(n.reference, await o(n.floating), n.strategy),
    floating: {
      x: 0,
      y: 0,
      width: i.width,
      height: i.height
    }
  };
};
function gC(n) {
  return In(n).direction === "rtl";
}
const V0 = {
  convertOffsetParentRelativeRectToViewportRelativeRect: lC,
  getDocumentElement: Fl,
  getClippingRect: uC,
  getOffsetParent: B0,
  getElementRects: pC,
  getClientRects: oC,
  getDimensions: fC,
  getScale: Wr,
  isElement: $e,
  isRTL: gC
};
function P0(n, o) {
  return n.x === o.x && n.y === o.y && n.width === o.width && n.height === o.height;
}
function mC(n, o, a) {
  let i = null, u;
  const f = Fl(n);
  function p() {
    var v;
    clearTimeout(u), (v = i) == null || v.disconnect(), i = null;
  }
  function g(v, b) {
    v === void 0 && (v = !1), b === void 0 && (b = 1), p();
    const S = n.getBoundingClientRect(), {
      left: R,
      top: w,
      width: M,
      height: E
    } = S;
    if (v || o(), !M || !E)
      return;
    const A = Xs(w), O = Xs(f.clientWidth - (R + M)), z = Xs(f.clientHeight - (w + E)), D = Xs(R), N = {
      rootMargin: -A + "px " + -O + "px " + -z + "px " + -D + "px",
      threshold: Vl(0, la(1, b)) || 1
    };
    let U = !0;
    function _(G) {
      const k = G[0].intersectionRatio;
      if (!P0(S, n.getBoundingClientRect()))
        return g();
      if (k !== b) {
        if (!U)
          return g();
        k ? g(!1, k) : u = setTimeout(() => {
          g(!1, 1e-7);
        }, 1e3);
      }
      U = !1;
    }
    try {
      i = new IntersectionObserver(_, {
        ...N,
        // Handle <iframe>s
        root: f.ownerDocument
      });
    } catch {
      i = new IntersectionObserver(_, N);
    }
    i.observe(n);
  }
  const m = Dt(n), d = () => g(a);
  return m.addEventListener("resize", d), g(!0), () => {
    m.removeEventListener("resize", d), p();
  };
}
function tb(n, o, a, i) {
  i === void 0 && (i = {});
  const {
    ancestorScroll: u = !0,
    ancestorResize: f = !0,
    elementResize: p = typeof ResizeObserver == "function",
    layoutShift: g = typeof IntersectionObserver == "function",
    animationFrame: m = !1
  } = i, d = Fp(n), v = u || f ? [...d ? mi(d) : [], ...o ? mi(o) : []] : [];
  v.forEach((A) => {
    u && A.addEventListener("scroll", a), f && A.addEventListener("resize", a);
  });
  const b = d && g ? mC(d, a, f) : null;
  let S = -1, R = null;
  p && (R = new ResizeObserver((A) => {
    let [O] = A;
    O && O.target === d && R && o && (R.unobserve(o), cancelAnimationFrame(S), S = requestAnimationFrame(() => {
      var z;
      (z = R) == null || z.observe(o);
    })), a();
  }), d && !m && R.observe(d), o && R.observe(o));
  let w, M = m ? ar(n) : null;
  m && E();
  function E() {
    const A = ar(n);
    M && !P0(M, A) && a(), M = A, w = requestAnimationFrame(E);
  }
  return a(), () => {
    var A;
    v.forEach((O) => {
      u && O.removeEventListener("scroll", a), f && O.removeEventListener("resize", a);
    }), b?.(), (A = R) == null || A.disconnect(), R = null, m && cancelAnimationFrame(w);
  };
}
const hC = JR, yC = $R, vC = KR, bC = eC, xC = QR, SC = WR, wC = (n, o, a) => {
  const i = /* @__PURE__ */ new Map(), u = a ?? {}, f = {
    ...V0,
    ...u.platform,
    _c: i
  };
  return FR(n, o, {
    ...u,
    platform: f
  });
};
var EC = typeof document < "u", TC = function() {
}, ic = EC ? y.useLayoutEffect : TC;
function xc(n, o) {
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
        if (!xc(n[i], o[i]))
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
      if (!(f === "_owner" && n.$$typeof) && !xc(n[f], o[f]))
        return !1;
    }
    return !0;
  }
  return n !== n && o !== o;
}
function Y0(n) {
  return typeof window > "u" ? 1 : (n.ownerDocument.defaultView || window).devicePixelRatio || 1;
}
function nb(n, o) {
  const a = Y0(n);
  return Math.round(o * a) / a;
}
function Ld(n) {
  const o = y.useRef(n);
  return ic(() => {
    o.current = n;
  }), o;
}
function RC(n) {
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
  }), [S, R] = y.useState(i);
  xc(S, i) || R(i);
  const [w, M] = y.useState(null), [E, A] = y.useState(null), O = y.useCallback((V) => {
    V !== N.current && (N.current = V, M(V));
  }, []), z = y.useCallback((V) => {
    V !== U.current && (U.current = V, A(V));
  }, []), D = f || w, j = p || E, N = y.useRef(null), U = y.useRef(null), _ = y.useRef(v), G = m != null, k = Ld(m), ee = Ld(u), Q = Ld(d), X = y.useCallback(() => {
    if (!N.current || !U.current)
      return;
    const V = {
      placement: o,
      strategy: a,
      middleware: S
    };
    ee.current && (V.platform = ee.current), wC(N.current, U.current, V).then((K) => {
      const B = {
        ...K,
        // The floating element's position may be recomputed while it's closed
        // but still mounted (such as when transitioning out). To ensure
        // `isPositioned` will be `false` initially on the next open, avoid
        // setting it to `true` when `open === false` (must be specified).
        isPositioned: Q.current !== !1
      };
      Z.current && !xc(_.current, B) && (_.current = B, gl.flushSync(() => {
        b(B);
      }));
    });
  }, [S, o, a, ee, Q]);
  ic(() => {
    d === !1 && _.current.isPositioned && (_.current.isPositioned = !1, b((V) => ({
      ...V,
      isPositioned: !1
    })));
  }, [d]);
  const Z = y.useRef(!1);
  ic(() => (Z.current = !0, () => {
    Z.current = !1;
  }), []), ic(() => {
    if (D && (N.current = D), j && (U.current = j), D && j) {
      if (k.current)
        return k.current(D, j, X);
      X();
    }
  }, [D, j, X, k, G]);
  const q = y.useMemo(() => ({
    reference: N,
    floating: U,
    setReference: O,
    setFloating: z
  }), [O, z]), H = y.useMemo(() => ({
    reference: D,
    floating: j
  }), [D, j]), Y = y.useMemo(() => {
    const V = {
      position: a,
      left: 0,
      top: 0
    };
    if (!H.floating)
      return V;
    const K = nb(H.floating, v.x), B = nb(H.floating, v.y);
    return g ? {
      ...V,
      transform: "translate(" + K + "px, " + B + "px)",
      ...Y0(H.floating) >= 1.5 && {
        willChange: "transform"
      }
    } : {
      position: a,
      left: K,
      top: B
    };
  }, [a, g, H.floating, v.x, v.y]);
  return y.useMemo(() => ({
    ...v,
    update: X,
    refs: q,
    elements: H,
    floatingStyles: Y
  }), [v, X, q, H, Y]);
}
const CC = (n, o) => {
  const a = hC(n);
  return {
    name: a.name,
    fn: a.fn,
    options: [n, o]
  };
}, OC = (n, o) => {
  const a = yC(n);
  return {
    name: a.name,
    fn: a.fn,
    options: [n, o]
  };
}, MC = (n, o) => ({
  fn: SC(n).fn,
  options: [n, o]
}), AC = (n, o) => {
  const a = vC(n);
  return {
    name: a.name,
    fn: a.fn,
    options: [n, o]
  };
}, zC = (n, o) => {
  const a = bC(n);
  return {
    name: a.name,
    fn: a.fn,
    options: [n, o]
  };
}, DC = (n, o) => {
  const a = xC(n);
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
var Id = { exports: {} }, Bd = {};
var lb;
function NC() {
  if (lb) return Bd;
  lb = 1;
  var n = xi();
  function o(b, S) {
    return b === S && (b !== 0 || 1 / b === 1 / S) || b !== b && S !== S;
  }
  var a = typeof Object.is == "function" ? Object.is : o, i = n.useState, u = n.useEffect, f = n.useLayoutEffect, p = n.useDebugValue;
  function g(b, S) {
    var R = S(), w = i({ inst: { value: R, getSnapshot: S } }), M = w[0].inst, E = w[1];
    return f(
      function() {
        M.value = R, M.getSnapshot = S, m(M) && E({ inst: M });
      },
      [b, R, S]
    ), u(
      function() {
        return m(M) && E({ inst: M }), b(function() {
          m(M) && E({ inst: M });
        });
      },
      [b]
    ), p(R), R;
  }
  function m(b) {
    var S = b.getSnapshot;
    b = b.value;
    try {
      var R = S();
      return !a(b, R);
    } catch {
      return !0;
    }
  }
  function d(b, S) {
    return S();
  }
  var v = typeof window > "u" || typeof window.document > "u" || typeof window.document.createElement > "u" ? d : g;
  return Bd.useSyncExternalStore = n.useSyncExternalStore !== void 0 ? n.useSyncExternalStore : v, Bd;
}
var ob;
function G0() {
  return ob || (ob = 1, Id.exports = NC()), Id.exports;
}
var q0 = G0(), Vd = { exports: {} }, Pd = {};
var rb;
function jC() {
  if (rb) return Pd;
  rb = 1;
  var n = xi(), o = G0();
  function a(d, v) {
    return d === v && (d !== 0 || 1 / d === 1 / v) || d !== d && v !== v;
  }
  var i = typeof Object.is == "function" ? Object.is : a, u = o.useSyncExternalStore, f = n.useRef, p = n.useEffect, g = n.useMemo, m = n.useDebugValue;
  return Pd.useSyncExternalStoreWithSelector = function(d, v, b, S, R) {
    var w = f(null);
    if (w.current === null) {
      var M = { hasValue: !1, value: null };
      w.current = M;
    } else M = w.current;
    w = g(
      function() {
        function A(N) {
          if (!O) {
            if (O = !0, z = N, N = S(N), R !== void 0 && M.hasValue) {
              var U = M.value;
              if (R(U, N))
                return D = U;
            }
            return D = N;
          }
          if (U = D, i(z, N)) return U;
          var _ = S(N);
          return R !== void 0 && R(U, _) ? (z = N, U) : (z = N, D = _);
        }
        var O = !1, z, D, j = b === void 0 ? null : b;
        return [
          function() {
            return A(v());
          },
          j === null ? void 0 : function() {
            return A(j());
          }
        ];
      },
      [v, b, S, R]
    );
    var E = u(d, w[0], w[1]);
    return p(
      function() {
        M.hasValue = !0, M.value = E;
      },
      [E]
    ), m(E), E;
  }, Pd;
}
var ab;
function kC() {
  return ab || (ab = 1, Vd.exports = jC()), Vd.exports;
}
var _C = kC();
const pp = [];
let gp;
function HC() {
  return gp;
}
function UC(n) {
  pp.push(n);
}
function Kp(n) {
  const o = (a, i) => {
    const u = xn(LC).current;
    let f;
    try {
      gp = u;
      for (const p of pp)
        p.before(u);
      f = n(a, i);
      for (const p of pp)
        p.after(u);
      u.didInitialize = !0;
    } finally {
      gp = void 0;
    }
    return f;
  };
  return o.displayName = n.displayName || n.name, o;
}
function X0(n) {
  return /* @__PURE__ */ y.forwardRef(Kp(n));
}
function LC() {
  return {
    didInitialize: !1
  };
}
const IC = Ap(19), BC = IC ? PC : YC;
function Pe(n, o, a, i, u) {
  return BC(n, o, a, i, u);
}
function VC(n, o, a, i, u) {
  const f = y.useCallback(() => o(n.getSnapshot(), a, i, u), [n, o, a, i, u]);
  return q0.useSyncExternalStore(n.subscribe, f, f);
}
UC({
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
    }), q0.useSyncExternalStore(n.subscribe, n.getSnapshot, n.getSnapshot));
  }
});
function PC(n, o, a, i, u) {
  const f = HC();
  if (!f)
    return VC(n, o, a, i, u);
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
function YC(n, o, a, i, u) {
  return _C.useSyncExternalStoreWithSelector(n.subscribe, n.getSnapshot, n.getSnapshot, (f) => o(f, a, i, u));
}
class F0 {
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
class Ti extends F0 {
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
    const i = ze(a ?? rn);
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
const GC = {
  open: me((n) => n.open),
  transitionStatus: me((n) => n.transitionStatus),
  domReferenceElement: me((n) => n.domReferenceElement),
  referenceElement: me((n) => n.positionReference ?? n.referenceElement),
  floatingElement: me((n) => n.floatingElement),
  floatingId: me((n) => n.floatingId)
};
class Gc extends Ti {
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
      events: D0(),
      nested: i,
      triggerElements: f
    }, GC), this.syncOnly = a;
  }
  /**
   * Syncs the event used by hover logic to distinguish hover-open from click-like interaction.
   */
  syncOpenEvent = (o, a) => {
    (!o || !this.state.open || // Prevent a pending hover-open from overwriting a click-open event, while allowing
    // click events to upgrade a hover-open.
    a != null && tR(a)) && (this.context.dataRef.current.openEvent = o ? a : void 0);
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
function K0(n) {
  const {
    popupStore: o,
    treatPopupAsFloatingElement: a = !1,
    floatingRootContext: i,
    floatingId: u,
    nested: f,
    onOpenChange: p
  } = n, g = o.useState("open"), m = o.useState("activeTriggerElement"), d = o.useState(a ? "popupElement" : "positionerElement"), v = o.context.triggerElements, b = p, S = y.useRef(null);
  i === void 0 && S.current === null && (S.current = new Gc({
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
  const R = i ?? S.current;
  return o.useSyncedValue("floatingId", u), xe(() => {
    const w = {
      open: g,
      floatingId: u,
      referenceElement: m,
      floatingElement: d
    };
    $e(m) && (w.domReferenceElement = m), R.state.positionReference === R.state.referenceElement && (w.positionReference = m), R.update(w);
  }, [g, u, m, d, R]), R.context.onOpenChange = b, R.context.nested = f, R;
}
function qc(n, o = !1, a = !1) {
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
let bi = /* @__PURE__ */ (function(n) {
  return n.startingStyle = "data-starting-style", n.endingStyle = "data-ending-style", n;
})({});
const qC = {
  [bi.startingStyle]: ""
}, XC = {
  [bi.endingStyle]: ""
}, jo = {
  transitionStatus(n) {
    return n === "starting" ? qC : n === "ending" ? XC : null;
  }
};
function Qp(n, o = !1, a = !0) {
  const i = ta();
  return ze((u, f = null) => {
    i.cancel();
    const p = Ul(n);
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
      const v = bi.startingStyle;
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
function Ql(n) {
  const {
    enabled: o = !0,
    open: a,
    ref: i,
    onComplete: u
  } = n, f = ze(u), p = Qp(i, a, !1);
  y.useEffect(() => {
    if (!o)
      return;
    const g = new AbortController();
    return p(f, g.signal), () => {
      g.abort();
    };
  }, [o, a, f, p]);
}
const aa = {
  tabIndex: -1,
  [ap]: ""
};
function Q0(n) {
  return (o) => o === "touch" ? n.current : !0;
}
function Zp(n, o, a = !1) {
  const i = rr(), u = Kl() != null, f = y.useRef(null);
  n === void 0 && f.current === null && (f.current = o(i, u));
  const p = n ?? f.current;
  return K0({
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
function Z0(n, o) {
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
function Xc(n, o, a, i = !1) {
  o ? n.preventUnmountingOnClose = !1 : i && (n.preventUnmountingOnClose = !0);
  const u = a?.id ?? null;
  (u || o) && (n.activeTriggerId = u, n.activeTriggerElement = a ?? null);
}
function Jp(n) {
  let o = !1;
  return n.preventUnmountOnClose = () => {
    o = !0;
  }, () => o;
}
function FC(n, o, a, i = {}) {
  const u = a.reason, f = u === Pt, p = o && u === Zr, g = !o && (u === ql || u === Si), m = Jp(a);
  if (n.context.onOpenChange?.(o, a), a.isCanceled)
    return;
  i.onBeforeDispatch?.(), n.state.floatingRootContext.dispatchOpenChange(o, a);
  const d = () => {
    const v = {
      ...i.extraState,
      open: o
    };
    p ? v.instantType = "focus" : g ? v.instantType = "dismiss" : f && (v.instantType = void 0), Xc(v, o, a.trigger, m()), n.update(v);
  };
  f ? gl.flushSync(d) : d();
}
function $p(n, o, a, i) {
  Np(() => {
    o === void 0 && n.state.open === !1 && a && (n.state = {
      ...n.state,
      open: !0,
      activeTriggerId: i,
      preventUnmountingOnClose: !1
    });
  });
}
function Wp(n, o, a, i) {
  const u = a.useState("isMountedByTrigger", n), f = Z0(n, a), p = ze((g) => {
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
function Fc(n, o = {}) {
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
        const d = Ye(zo);
        n.setOpen(!1, d), d.isCanceled || n.update({
          activeTriggerId: null,
          activeTriggerElement: null
        });
      }
    });
  }, [i, n, u, a]);
}
function Kc(n, o, a) {
  const {
    mounted: i,
    setMounted: u,
    transitionStatus: f
  } = qc(n), p = o.useState("preventUnmountingOnClose"), g = n ? !1 : p;
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
  return Ql({
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
function Qc(n, o) {
  n.useSyncedValues(o), xe(() => () => {
    n.update({
      activeTriggerProps: bt,
      inactiveTriggerProps: bt,
      popupProps: bt
    });
  }, [n]);
}
function J0(n, o) {
  xe(() => {
    !o && n.state.openMethod !== null && n.set("openMethod", null);
  }, [o, n]), xe(() => () => {
    n.state.openMethod !== null && n.set("openMethod", null);
  }, [n]);
}
class ia {
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
function KC() {
  return new Gc({
    open: !1,
    transitionStatus: void 0,
    floatingElement: null,
    referenceElement: null,
    triggerElements: new ia(),
    floatingId: void 0,
    syncOnly: !1,
    nested: !1,
    onOpenChange: void 0
  });
}
function Zc() {
  return {
    open: !1,
    openProp: void 0,
    mounted: !1,
    transitionStatus: void 0,
    floatingRootContext: KC(),
    floatingId: void 0,
    triggerCount: 0,
    preventUnmountingOnClose: !1,
    payload: void 0,
    activeTriggerId: null,
    activeTriggerElement: null,
    triggerIdProp: void 0,
    popupElement: null,
    positionerElement: null,
    activeTriggerProps: bt,
    inactiveTriggerProps: bt,
    popupProps: bt
  };
}
function eg(n, o, a = !1) {
  return new Gc({
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
const fi = me((n) => n.triggerIdProp ?? n.activeTriggerId), tg = me((n) => n.openProp ?? n.open), ib = me((n) => (n.popupElement?.id ?? n.floatingId) || void 0);
function $0(n, o) {
  return o !== void 0 && tg(n) && fi(n) === o;
}
function QC(n, o) {
  return $0(n, o) ? !0 : o !== void 0 && tg(n) && fi(n) == null && n.triggerCount === 1;
}
const Jc = {
  open: tg,
  mounted: me((n) => n.mounted),
  transitionStatus: me((n) => n.transitionStatus),
  floatingRootContext: me((n) => n.floatingRootContext),
  triggerCount: me((n) => n.triggerCount),
  preventUnmountingOnClose: me((n) => n.preventUnmountingOnClose),
  payload: me((n) => n.payload),
  activeTriggerId: fi,
  activeTriggerElement: me((n) => n.mounted ? n.activeTriggerElement : null),
  popupId: ib,
  /**
   * Whether the trigger with the given ID was used to open the popup.
   */
  isTriggerActive: me((n, o) => o !== void 0 && fi(n) === o),
  /**
   * Whether the popup is open and was activated by a trigger with the given ID.
   */
  isOpenedByTrigger: me((n, o) => $0(n, o)),
  /**
   * Whether the popup is mounted and was activated by a trigger with the given ID.
   */
  isMountedByTrigger: me((n, o) => o !== void 0 && fi(n) === o && n.mounted),
  triggerProps: me((n, o) => o ? n.activeTriggerProps : n.inactiveTriggerProps),
  /**
   * Popup id for the trigger that currently owns the open popup.
   */
  triggerPopupId: me((n, o) => QC(n, o) ? ib(n) : void 0),
  popupProps: me((n) => n.popupProps),
  popupElement: me((n) => n.popupElement),
  positionerElement: me((n) => n.positionerElement)
};
function W0(n) {
  const {
    open: o = !1,
    onOpenChange: a,
    elements: i = {}
  } = n, u = rr(), f = Kl() != null, p = xn(() => new Gc({
    open: o,
    transitionStatus: void 0,
    onOpenChange: a,
    referenceElement: i.reference ?? null,
    floatingElement: i.floating ?? null,
    triggerElements: new ia(),
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
function ZC(n = {}) {
  const {
    nodeId: o,
    externalTree: a
  } = n, i = W0(n), u = n.rootContext || i, f = u.useState("referenceElement"), p = u.useState("floatingElement"), g = u.useState("domReferenceElement"), m = u.useState("open"), d = u.useState("floatingId"), [v, b] = y.useState(null), [S, R] = y.useState(void 0), [w, M] = y.useState(void 0), E = y.useRef(null), A = No(a), O = y.useMemo(() => ({
    reference: f,
    floating: p,
    domReference: g
  }), [f, p, g]), z = RC({
    ...n,
    elements: {
      ...O,
      ...v && {
        reference: v
      }
    }
  }), D = $e(S) ? S : null, j = w === void 0 ? u.state.floatingElement : w;
  u.useSyncedValue("referenceElement", S ?? null), u.useSyncedValue("domReferenceElement", S === void 0 ? g : D), u.useSyncedValue("floatingElement", j);
  const N = y.useCallback((Q) => {
    const X = $e(Q) ? {
      getBoundingClientRect: () => Q.getBoundingClientRect(),
      getClientRects: () => Q.getClientRects(),
      contextElement: Q
    } : Q;
    b(X), z.refs.setReference(X);
  }, [z.refs]), U = y.useCallback((Q) => {
    ($e(Q) || Q === null) && (E.current = Q, R(Q)), ($e(z.refs.reference.current) || z.refs.reference.current === null || // Don't allow setting virtual elements using the old technique back to
    // `null` to support `positionReference` + an unstable `reference`
    // callback ref.
    Q !== null && !$e(Q)) && z.refs.setReference(Q);
  }, [z.refs, R]), _ = y.useCallback((Q) => {
    M(Q), z.refs.setFloating(Q);
  }, [z.refs]), G = y.useMemo(() => ({
    ...z.refs,
    setReference: U,
    setFloating: _,
    setPositionReference: N,
    domReference: E
  }), [z.refs, U, _, N]), k = y.useMemo(() => ({
    ...z.elements,
    domReference: g
  }), [z.elements, g]), ee = y.useMemo(() => ({
    ...z,
    dataRef: u.context.dataRef,
    open: m,
    onOpenChange: u.setOpen,
    events: u.context.events,
    floatingId: d,
    refs: G,
    elements: k,
    nodeId: o,
    rootStore: u
  }), [z, G, k, o, u, m, d]);
  return xe(() => {
    g && (E.current = g);
  }, [g]), xe(() => {
    u.context.dataRef.current.floatingContext = ee;
    const Q = A?.nodesRef.current.find((X) => X.id === o);
    Q && (Q.context = ee);
  }), y.useMemo(() => ({
    ...z,
    context: ee,
    refs: G,
    elements: k,
    rootStore: u
  }), [z, G, k, ee, u]);
}
const Yd = jp && Ao;
function ex(n, o = {}) {
  const {
    enabled: a = !0,
    delay: i
  } = o, u = "rootStore" in n ? n.rootStore : n, {
    events: f,
    dataRef: p
  } = u.context, g = y.useRef(!1), m = y.useRef(null), d = y.useRef(!0), v = an();
  y.useEffect(() => {
    const S = u.select("domReferenceElement");
    if (!a)
      return;
    const R = Dt(S);
    function w() {
      const A = u.select("domReferenceElement");
      !u.select("open") && Rt(A) && A === vn(tt(A)) && (g.current = !0);
    }
    function M() {
      d.current = !0;
    }
    function E() {
      d.current = !1;
    }
    return pl(Je(R, "blur", w), Yd && Je(R, "keydown", M, !0), Yd && Je(R, "pointerdown", E, !0));
  }, [u, a]), y.useEffect(() => {
    if (!a)
      return;
    function S(R) {
      if (R.reason === ql || R.reason === Si) {
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
      onFocus(R) {
        const w = R.currentTarget;
        if (g.current) {
          if (m.current === w)
            return;
          S();
        }
        const M = gn(R.nativeEvent);
        if ($e(M)) {
          if (Yd && !R.relatedTarget) {
            if (!d.current && !Hc(M))
              return;
          } else if (!oR(M))
            return;
        }
        const E = mc(R.relatedTarget, u.context.triggerElements), {
          nativeEvent: A,
          currentTarget: O
        } = R, z = typeof i == "function" ? i() : i;
        if (u.select("open") && E || z === 0 || z === void 0) {
          u.setOpen(!0, Ye(Zr, A, O));
          return;
        }
        v.start(z, () => {
          g.current || u.setOpen(!0, Ye(Zr, A, O));
        });
      },
      onBlur(R) {
        S();
        const w = R.relatedTarget, M = R.nativeEvent, E = $e(w) && w.hasAttribute(vi("focus-guard")) && w.getAttribute("data-type") === "outside";
        v.start(0, () => {
          const A = u.select("domReferenceElement"), O = vn(tt(A));
          !w && O === A || Le(p.current.floatingContext?.refs.floating.current, O) || Le(A, O) || E || mc(w ?? O, u.context.triggerElements) || u.setOpen(!1, Ye(Zr, M));
        });
      }
    };
  }, [p, i, u, v]);
  return y.useMemo(() => a ? {
    reference: b,
    trigger: b
  } : {}, [a, b]);
}
class ng {
  constructor() {
    this.pointerType = void 0, this.interactedInside = !1, this.handler = void 0, this.blockMouseMove = !0, this.performedPointerEventsMutation = !1, this.pointerEventsScopeElement = null, this.pointerEventsReferenceElement = null, this.pointerEventsFloatingElement = null, this.restTimeoutPending = !1, this.openChangeTimeout = new el(), this.restTimeout = new el(), this.handleCloseOptions = void 0;
  }
  static create() {
    return new ng();
  }
  dispose = () => {
    this.openChangeTimeout.clear(), this.restTimeout.clear();
  };
  disposeEffect = () => this.dispose;
}
const Sc = /* @__PURE__ */ new WeakMap();
function wc(n) {
  if (!n.performedPointerEventsMutation)
    return;
  const o = n.pointerEventsScopeElement;
  o && Sc.get(o) === n && (n.pointerEventsScopeElement?.style.removeProperty("pointer-events"), n.pointerEventsReferenceElement?.style.removeProperty("pointer-events"), n.pointerEventsFloatingElement?.style.removeProperty("pointer-events"), Sc.delete(o)), n.performedPointerEventsMutation = !1, n.pointerEventsScopeElement = null, n.pointerEventsReferenceElement = null, n.pointerEventsFloatingElement = null;
}
function tx(n, o) {
  const {
    scopeElement: a,
    referenceElement: i,
    floatingElement: u
  } = o, f = Sc.get(a);
  f && f !== n && wc(f), wc(n), n.performedPointerEventsMutation = !0, n.pointerEventsScopeElement = a, n.pointerEventsReferenceElement = i, n.pointerEventsFloatingElement = u, Sc.set(a, n), a.style.pointerEvents = "none", i.style.pointerEvents = "auto", u.style.pointerEvents = "auto";
}
function lg(n) {
  const o = n.context.dataRef.current, a = xn(() => o.hoverInteractionState ?? ng.create()).current;
  return o.hoverInteractionState || (o.hoverInteractionState = a), _p(o.hoverInteractionState.disposeEffect), o.hoverInteractionState;
}
function og(n, o = {}) {
  const {
    enabled: a = !0,
    closeDelay: i = 0,
    nodeId: u
  } = o, f = "rootStore" in n ? n.rootStore : n, p = f.useState("open"), g = f.useState("floatingElement"), m = f.useState("domReferenceElement"), {
    dataRef: d
  } = f.context, v = No(), b = Kl(), S = lg(f), R = an(), w = ze(() => a0(d.current.openEvent?.type, S.interactedInside)), M = ze(() => aR(d.current.openEvent?.type)), E = ze(() => {
    wc(S);
  });
  xe(() => {
    p || (S.pointerType = void 0, S.restTimeoutPending = !1, S.interactedInside = !1, E());
  }, [p, S, E]), y.useEffect(() => E, [E]), xe(() => {
    if (a && p && S.handleCloseOptions?.blockPointerEvents && M() && $e(m) && g) {
      const A = m, O = g, z = tt(g), D = v?.nodesRef.current.find((_) => _.id === b)?.context?.elements.floating;
      D && (D.style.pointerEvents = "");
      const j = S.pointerEventsScopeElement !== O ? S.pointerEventsScopeElement : null, N = D !== O ? D : null, U = S.handleCloseOptions?.getScope?.() ?? j ?? N ?? A.closest("[data-rootownerid]") ?? z.body;
      return tx(S, {
        scopeElement: U,
        referenceElement: A,
        floatingElement: O
      }), () => {
        E();
      };
    }
  }, [a, p, m, g, S, M, v, b, E]), y.useEffect(() => {
    if (!a)
      return;
    function A() {
      return !!(v && b && Co(v.nodesRef.current, b).length > 0);
    }
    function O(_) {
      const G = na(i, "close", S.pointerType), k = () => {
        f.setOpen(!1, Ye(Pt, _)), v?.events.emit("floating.closed", _);
      };
      G ? S.openChangeTimeout.start(G, k) : (S.openChangeTimeout.clear(), k());
    }
    function z(_) {
      const G = gn(_);
      if (!lR(G)) {
        S.interactedInside = !1;
        return;
      }
      S.interactedInside = G?.closest("[aria-haspopup]") != null;
    }
    function D() {
      S.openChangeTimeout.clear(), R.clear(), v?.events.off("floating.closed", N), E();
    }
    function j(_) {
      if (A() && v) {
        v.events.on("floating.closed", N);
        return;
      }
      if (mc(_.relatedTarget, f.context.triggerElements))
        return;
      const G = d.current.floatingContext?.nodeId ?? u, k = _.relatedTarget;
      if (!(v && G && $e(k) && Co(v.nodesRef.current, G, !1).some((Q) => Le(Q.context?.elements.floating, k)))) {
        if (S.handler) {
          S.handler(_);
          return;
        }
        E(), M() && !w() && O(_);
      }
    }
    function N(_) {
      !v || !b || A() || R.start(0, () => {
        v.events.off("floating.closed", N), f.setOpen(!1, Ye(Pt, _)), v.events.emit("floating.closed", _);
      });
    }
    const U = g;
    return pl(U && Je(U, "mouseenter", D), U && Je(U, "mouseleave", j), U && Je(U, "pointerdown", z, !0), () => {
      v?.events.off("floating.closed", N);
    });
  }, [a, g, f, d, i, u, M, w, E, S, v, b, R]);
}
const JC = {
  current: null
};
function $c(n, o = {}) {
  const {
    enabled: a = !0,
    delay: i = 0,
    handleClose: u = null,
    mouseOnly: f = !1,
    restMs: p = 0,
    move: g = !0,
    triggerElementRef: m = JC,
    externalTree: d,
    isActiveTrigger: v = !0,
    getHandleCloseContext: b,
    isClosing: S,
    shouldOpen: R
  } = o, w = "rootStore" in n ? n.rootStore : n, {
    dataRef: M,
    events: E
  } = w.context, A = No(d), O = lg(w), z = y.useRef(!1), D = Yt(u), j = Yt(i), N = Yt(p), U = Yt(a), _ = Yt(R), G = Yt(S), k = ze(() => a0(M.current.openEvent?.type, O.interactedInside)), ee = ze(() => _.current?.() !== !1), Q = ze((q, H, Y) => {
    const V = w.context.triggerElements;
    if (V.hasElement(H))
      return !q || !Le(q, H);
    if (!$e(Y))
      return !1;
    const K = Y;
    return V.hasMatchingElement((B) => Le(B, K)) && (!q || !Le(q, K));
  }), X = ze(() => {
    if (!O.handler)
      return;
    tt(w.select("domReferenceElement")).removeEventListener("mousemove", O.handler), O.handler = void 0;
  }), Z = ze(() => {
    wc(O);
  });
  return v && (O.handleCloseOptions = D.current?.__options), y.useEffect(() => X, [X]), y.useEffect(() => {
    if (!a)
      return;
    function q(H) {
      H.open ? z.current = !1 : (z.current = H.reason === Pt, X(), O.openChangeTimeout.clear(), O.restTimeout.clear(), O.blockMouseMove = !0, O.restTimeoutPending = !1);
    }
    return E.on("openchange", q), () => {
      E.off("openchange", q);
    };
  }, [a, E, O, X]), y.useEffect(() => {
    if (!a)
      return;
    function q(K, B = !0) {
      const C = na(j.current, "close", O.pointerType);
      C ? O.openChangeTimeout.start(C, () => {
        w.setOpen(!1, Ye(Pt, K)), A?.events.emit("floating.closed", K);
      }) : B && (O.openChangeTimeout.clear(), w.setOpen(!1, Ye(Pt, K)), A?.events.emit("floating.closed", K));
    }
    const H = m.current ?? (v ? w.select("domReferenceElement") : null);
    if (!$e(H))
      return;
    function Y(K) {
      if (O.openChangeTimeout.clear(), O.blockMouseMove = !1, f && !or(O.pointerType))
        return;
      const B = jv(N.current), C = na(j.current, "open", O.pointerType), L = gn(K), ne = K.currentTarget ?? null, J = w.select("domReferenceElement");
      let re = ne;
      if ($e(L) && !w.context.triggerElements.hasElement(L)) {
        for (const Re of w.context.triggerElements.elements())
          if (Le(Re, L)) {
            re = Re;
            break;
          }
      }
      $e(ne) && $e(J) && !w.context.triggerElements.hasElement(ne) && Le(ne, J) && (re = J);
      const ie = re == null ? !1 : Q(J, re, L), oe = w.select("open"), se = G.current?.() ?? w.select("transitionStatus") === "ending", ge = !oe && se && z.current, je = !ie && $e(re) && $e(J) && Le(J, re) && ge, Ee = B > 0 && !C, fe = ie && (oe || ge) || je, ye = !oe || ie;
      if (fe) {
        ee() && w.setOpen(!0, Ye(Pt, K, re));
        return;
      }
      Ee || (C ? O.openChangeTimeout.start(C, () => {
        ye && ee() && w.setOpen(!0, Ye(Pt, K, re));
      }) : ye && ee() && w.setOpen(!0, Ye(Pt, K, re)));
    }
    function V(K) {
      if (k()) {
        Z();
        return;
      }
      X();
      const B = w.select("domReferenceElement"), C = tt(B);
      O.restTimeout.clear(), O.restTimeoutPending = !1;
      const L = M.current.floatingContext ?? b?.();
      if (mc(K.relatedTarget, w.context.triggerElements))
        return;
      if (D.current && L) {
        w.select("open") || O.openChangeTimeout.clear();
        const J = m.current;
        O.handler = D.current({
          ...L,
          tree: A,
          x: K.clientX,
          y: K.clientY,
          onClose() {
            Z(), X(), U.current && !k() && J === w.select("domReferenceElement") && q(K, !0);
          }
        }), C.addEventListener("mousemove", O.handler), O.handler(K);
        return;
      }
      (O.pointerType !== "touch" || !Le(w.select("floatingElement"), K.relatedTarget)) && q(K);
    }
    return g ? pl(Je(H, "mousemove", Y, {
      once: !0
    }), Je(H, "mouseenter", Y), Je(H, "mouseleave", V)) : pl(Je(H, "mouseenter", Y), Je(H, "mouseleave", V));
  }, [X, Z, M, j, w, a, D, O, v, Q, k, f, g, N, m, A, U, b, G, ee]), y.useMemo(() => {
    if (!a)
      return;
    function q(H) {
      O.pointerType = H.pointerType;
    }
    return {
      onPointerDown: q,
      onPointerEnter: q,
      onMouseMove(H) {
        const {
          nativeEvent: Y
        } = H, V = H.currentTarget, K = w.select("domReferenceElement"), B = w.select("open"), C = Q(K, V, H.target);
        if (f && !or(O.pointerType))
          return;
        if (B && C && O.handleCloseOptions?.blockPointerEvents) {
          const J = w.select("floatingElement");
          if (J) {
            const re = O.handleCloseOptions?.getScope?.() ?? V.ownerDocument.body;
            tx(O, {
              scopeElement: re,
              referenceElement: V,
              floatingElement: J
            });
          }
        }
        const L = jv(N.current);
        if (B && !C || L === 0 || !C && O.restTimeoutPending && H.movementX ** 2 + H.movementY ** 2 < 2)
          return;
        O.restTimeout.clear();
        function ne() {
          if (O.restTimeoutPending = !1, k())
            return;
          const J = w.select("open");
          !O.blockMouseMove && (!J || C) && ee() && w.setOpen(!0, Ye(Pt, Y, V));
        }
        O.pointerType === "touch" ? gl.flushSync(() => {
          ne();
        }) : C && B ? ne() : (O.restTimeoutPending = !0, O.restTimeout.start(L, ne));
      }
    };
  }, [a, O, k, Q, f, w, N, ee]);
}
const $C = "Escape";
function Wc(n, o, a) {
  switch (n) {
    case "vertical":
      return o;
    case "horizontal":
      return a;
    default:
      return o || a;
  }
}
function Ks(n, o) {
  return Wc(o, n === r0 || n === Up, n === kc || n === _c);
}
function Gd(n, o, a) {
  return Wc(o, n === Up, a ? n === kc : n === _c) || n === "Enter" || n === " " || n === "";
}
function WC(n, o, a) {
  return Wc(o, a ? n === kc : n === _c, n === Up);
}
function eO(n, o, a, i) {
  const u = a ? n === _c : n === kc, f = n === r0;
  return o === "both" || o === "horizontal" && i ? n === $C : Wc(o, u, f);
}
function nx(n, o) {
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
    focusItemOnHover: R = !0,
    openOnArrowKeyDown: w = !0,
    disabledIndices: M = void 0,
    orientation: E = "vertical",
    parentOrientation: A,
    id: O,
    resetOnPointerLeave: z = !0,
    externalTree: D,
    grid: j
  } = o, N = j != null, U = "rootStore" in n ? n.rootStore : n, _ = U.useState("open"), G = U.useState("floatingElement"), k = U.useState("domReferenceElement"), ee = U.context.dataRef, Q = hc(G), X = ip(k), Z = Yt(Q), q = Kl(), H = No(D), Y = y.useRef(S), V = y.useRef(p ?? -1), K = y.useRef(null), B = y.useRef(!0), C = ze((ae) => {
    u(V.current === -1 ? null : V.current, ae);
  }), L = y.useRef(!!G), ne = y.useRef(_), J = y.useRef(!1), re = y.useRef(!1), ie = y.useRef(null), oe = Yt(M), se = Yt(_), ge = Yt(p), je = Yt(z), Ee = ta(), fe = ta(), ye = ze(() => {
    function ae(be) {
      b ? H?.events.emit("virtualfocus", be) : ie.current = ac(be, {
        sync: J.current,
        preventScroll: !0
      });
    }
    const pe = a.current[V.current], Ue = re.current;
    pe && ae(pe), (J.current ? (be) => be() : (be) => Ee.request(be))(() => {
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
    ee.current.orientation = E;
  }, [ee, E]), xe(() => {
    f && (_ && G ? (V.current = p ?? -1, Y.current && p != null && (re.current = !0, C())) : L.current && (V.current = -1, C()));
  }, [f, _, G, p, C]), xe(() => {
    if (f) {
      if (!_) {
        J.current = !1;
        return;
      }
      if (G)
        if (i == null) {
          if (J.current = !1, ge.current != null)
            return;
          if (L.current && (V.current = -1, ye()), (!ne.current || !L.current) && Y.current && (K.current != null || Y.current === !0 && K.current == null)) {
            let ae = 0;
            const pe = () => {
              a.current[0] == null ? (ae < 2 && (ae ? (ve) => fe.request(ve) : queueMicrotask)(pe), ae += 1) : (V.current = K.current == null || Gd(K.current, E, v) || d ? rc(a) : up(a), K.current = null, C());
            };
            pe();
          }
        } else ui(a.current, i) || (V.current = i, ye(), re.current = !1);
    }
  }, [f, _, G, i, ge, d, a, E, v, C, ye, fe]), xe(() => {
    if (!f || G || !H || b || !L.current)
      return;
    const ae = H.nodesRef.current, pe = ae.find((be) => be.id === q)?.context?.elements.floating, Ue = vn(tt(k ?? pe ?? null)), ve = ae.some((be) => be.context && Le(be.context.elements.floating, Ue));
    pe && !ve && B.current && pe.focus({
      preventScroll: !0
    });
  }, [f, G, k, H, q, b]), xe(() => {
    ne.current = _, L.current = !!G;
  }), xe(() => {
    _ || (K.current = null, Y.current = S);
  }, [_, S]);
  const Re = i != null, _e = ze((ae) => {
    if (!se.current)
      return;
    const pe = a.current.indexOf(ae.currentTarget);
    pe !== -1 && (V.current !== pe || i !== pe) && (V.current = pe, C(ae));
  }), ke = ze(() => A ?? H?.nodesRef.current.find((ae) => ae.id === q)?.context?.dataRef?.current.orientation), we = ze(() => rc(a, oe.current)), Ce = ze((ae) => {
    if (B.current = !1, J.current = !0, ae.which === 229 || !se.current && ae.currentTarget === Z.current)
      return;
    if (d && eO(ae.key, E, v, N)) {
      Ks(ae.key, ke()) || fl(ae), U.setOpen(!1, Ye(sp, ae.nativeEvent)), Rt(k) && (b ? H?.events.emit("virtualfocus", k) : k.focus());
      return;
    }
    const pe = V.current, Ue = rc(a, M), ve = up(a, M);
    if (X || (ae.key === "Home" && (fl(ae), V.current = Ue, C(ae)), ae.key === "End" && (fl(ae), V.current = ve, C(ae))), j != null) {
      const be = j(ae, V.current, a, E, m, v, M, Ue, ve);
      if (be != null && (V.current = be, C(ae)), E === "both")
        return;
    }
    if (Ks(ae.key, E)) {
      if (fl(ae), _ && !b && vn(ae.currentTarget.ownerDocument) === ae.currentTarget) {
        V.current = Gd(ae.key, E, v) ? Ue : ve, C(ae);
        return;
      }
      Gd(ae.key, E, v) ? m ? pe >= ve ? g && pe !== a.current.length ? V.current = -1 : (J.current = !1, V.current = Ue) : V.current = Il(a.current, {
        startingIndex: pe,
        disabledIndices: M
      }) : V.current = Math.min(ve, Il(a.current, {
        startingIndex: pe,
        disabledIndices: M
      })) : m ? pe <= Ue ? g && pe !== -1 ? V.current = a.current.length : (J.current = !1, V.current = ve) : V.current = Il(a.current, {
        startingIndex: pe,
        decrement: !0,
        disabledIndices: M
      }) : V.current = Math.max(Ue, Il(a.current, {
        startingIndex: pe,
        decrement: !0,
        disabledIndices: M
      })), ui(a.current, V.current) && (V.current = -1), C(ae);
    }
  }), he = y.useMemo(() => ({
    onFocus(pe) {
      J.current = !0, _e(pe);
    },
    onClick: ({
      currentTarget: pe
    }) => pe.focus({
      preventScroll: !0
    }),
    // Safari
    onMouseMove(pe) {
      J.current = !0, re.current = !1, R && _e(pe);
    },
    onPointerLeave(pe) {
      if (!se.current || !B.current || pe.pointerType === "touch")
        return;
      J.current = !0;
      const Ue = pe.relatedTarget;
      if (!(!R || a.current.includes(Ue)) && je.current && (ie.current?.(), ie.current = null, V.current = -1, C(pe), !b)) {
        const ve = Z.current, be = vn(tt(ve));
        ve && Le(ve, be) && ve.focus({
          preventScroll: !0
        });
      }
    }
  }), [_e, se, Z, R, a, C, je, b]), Se = y.useMemo(() => b && _ && Re && {
    "aria-activedescendant": `${O}-${i}`
  }, [b, _, Re, O, i]), Te = y.useMemo(() => ({
    "aria-orientation": E === "both" ? void 0 : E,
    ...X ? {} : Se,
    onKeyDown(ae) {
      if (ae.key === "Tab" && ae.shiftKey && _ && !b) {
        const pe = gn(ae.nativeEvent);
        if (pe && !Le(Z.current, pe))
          return;
        fl(ae), U.setOpen(!1, Ye(To, ae.nativeEvent)), Rt(k) && k.focus();
        return;
      }
      Ce(ae);
    },
    onPointerMove() {
      B.current = !0;
    }
  }), [Se, Ce, Z, E, X, U, _, b, k]), Oe = y.useMemo(() => {
    function ae(ve) {
      U.setOpen(!0, Ye(sp, ve.nativeEvent, ve.currentTarget));
    }
    function pe(ve) {
      S === "auto" && Hp(ve.nativeEvent) && (Y.current = !b);
    }
    function Ue(ve) {
      Y.current = S, S === "auto" && l0(ve.nativeEvent) && (Y.current = !0);
    }
    return {
      onKeyDown(ve) {
        const be = U.select("open");
        B.current = !1;
        const We = ve.key.startsWith("Arrow"), rt = WC(ve.key, ke(), v), pt = Ks(ve.key, E), Nt = (d ? rt : pt) || ve.key === "Enter" || ve.key.trim() === "";
        if (b && be)
          return Ce(ve);
        if (!(!be && !w && We)) {
          if (Nt) {
            const et = Ks(ve.key, ke());
            K.current = d && et ? null : ve.key;
          }
          if (d) {
            rt && (fl(ve), be ? (V.current = we(), C(ve)) : ae(ve));
            return;
          }
          pt && (ge.current != null && (V.current = ge.current), fl(ve), !be && w ? ae(ve) : Ce(ve), be && C(ve));
        }
      },
      onFocus(ve) {
        U.select("open") && !b && (V.current = -1, C(ve));
      },
      onPointerDown: Ue,
      onPointerEnter: Ue,
      onMouseDown: pe,
      onClick: pe
    };
  }, [Ce, S, we, d, C, U, w, E, ke, v, ge, b]), He = y.useMemo(() => ({
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
function lx(n, o) {
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
  } = o, b = "rootStore" in n ? n.rootStore : n, S = b.useState("open"), R = an(), w = y.useRef(""), M = y.useRef(v ?? u ?? -1), E = y.useRef(null), A = ze((D) => {
    function j(Z) {
      const q = i?.current[Z];
      return !q || Ic(q);
    }
    function N(Z) {
      return j(Z) ? p == null || !bc(Gl, Z, p) : !1;
    }
    function U(Z, q, H = 0) {
      if (Z.length === 0)
        return -1;
      const Y = (H % Z.length + Z.length) % Z.length, V = q.toLowerCase();
      for (let K = 0; K < Z.length; K += 1) {
        const B = (Y + K) % Z.length;
        if (!(!Z[B]?.toLowerCase().startsWith(V) || !N(B)))
          return B;
      }
      return -1;
    }
    const _ = a.current;
    if (w.current.length > 0 && D.key === " " && (fl(D), g?.(!0)), w.current.length > 0 && w.current[0] !== " " && U(_, w.current) === -1 && D.key !== " " && g?.(!1), _ == null || // Character key.
    D.key.length !== 1 || // Modifier key.
    D.ctrlKey || D.metaKey || D.altKey)
      return;
    S && D.key !== " " && (fl(D), g?.(!0));
    const G = w.current === "";
    G && (M.current = v ?? u ?? -1), _.every((Z, q) => Z && N(q) ? Z[0]?.toLowerCase() !== Z[1]?.toLowerCase() : !0) && w.current === D.key && (w.current = "", M.current = E.current), w.current += D.key, R.start(d, () => {
      w.current = "", M.current = E.current, g?.(!1);
    });
    const Q = ((G ? v ?? u ?? -1 : M.current) ?? 0) + 1, X = U(_, w.current, Q);
    X !== -1 ? (f?.(X), E.current = X) : D.key !== " " && (w.current = "", g?.(!1));
  }), O = ze((D) => {
    const j = D.relatedTarget, N = b.select("domReferenceElement"), U = b.select("floatingElement");
    Le(N, j) || Le(U, j) || (R.clear(), w.current = "", M.current = E.current, g?.(!1));
  });
  xe(() => {
    !S && v !== null || (R.clear(), E.current = null, w.current !== "" && (w.current = ""));
  }, [S, v, R]), xe(() => {
    S && w.current === "" && (M.current = v ?? u ?? -1);
  }, [S, v, u]);
  const z = y.useMemo(() => ({
    onKeyDown: A,
    onBlur: O
  }), [A, O]);
  return y.useMemo(() => m ? {
    reference: z,
    floating: z
  } : {}, [m, z]);
}
const sb = 0.1, tO = sb * sb, Tt = 0.5;
function Qs(n, o, a, i, u, f) {
  return i >= o != f >= o && n <= (u - a) * (o - i) / (f - i) + a;
}
function Zs(n, o, a, i, u, f, p, g, m, d) {
  let v = !1;
  return Qs(n, o, a, i, u, f) && (v = !v), Qs(n, o, u, f, p, g) && (v = !v), Qs(n, o, p, g, m, d) && (v = !v), Qs(n, o, m, d, a, i) && (v = !v), v;
}
function nO(n, o, a) {
  return n >= a.x && n <= a.x + a.width && o >= a.y && o <= a.y + a.height;
}
function Js(n, o, a, i, u, f) {
  const p = Math.min(a, u), g = Math.max(a, u), m = Math.min(i, f), d = Math.max(i, f);
  return n >= p && n <= g && o >= m && o <= d;
}
function eu(n = {}) {
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
    let S = !1, R = null, w = null, M = typeof performance < "u" ? performance.now() : 0;
    function E(O, z) {
      const D = performance.now(), j = D - M;
      if (R === null || w === null || j === 0)
        return R = O, w = z, M = D, !1;
      const N = O - R, U = z - w, _ = N * N + U * U, G = j * j * tO;
      return R = O, w = z, M = D, _ < G;
    }
    function A() {
      a.clear(), m();
    }
    return function(z) {
      a.clear();
      const D = g.domReference, j = g.floating;
      if (!D || !j || b == null || u == null || f == null)
        return;
      const {
        clientX: N,
        clientY: U
      } = z, _ = gn(z), G = z.type === "mouseleave", k = Le(j, _), ee = Le(D, _);
      if (k && (S = !0, !G))
        return;
      if (ee && (S = !1, !G)) {
        S = !0;
        return;
      }
      if (G && $e(z.relatedTarget) && Le(j, z.relatedTarget))
        return;
      function Q() {
        return !!(v && Co(v.nodesRef.current, d).length > 0);
      }
      function X() {
        Q() || A();
      }
      if (Q())
        return;
      const Z = D.getBoundingClientRect(), q = j.getBoundingClientRect(), H = u > q.right - q.width / 2, Y = f > q.bottom - q.height / 2, V = q.width > Z.width, K = q.height > Z.height, B = (V ? Z : q).left, C = (V ? Z : q).right, L = (K ? Z : q).top, ne = (K ? Z : q).bottom;
      if (b === "top" && f >= Z.bottom - 1 || b === "bottom" && f <= Z.top + 1 || b === "left" && u >= Z.right - 1 || b === "right" && u <= Z.left + 1) {
        X();
        return;
      }
      let J = !1;
      switch (b) {
        case "top":
          J = Js(N, U, B, Z.top + 1, C, q.bottom - 1);
          break;
        case "bottom":
          J = Js(N, U, B, q.top + 1, C, Z.bottom - 1);
          break;
        case "left":
          J = Js(N, U, q.right - 1, ne, Z.left + 1, L);
          break;
        case "right":
          J = Js(N, U, Z.right - 1, ne, q.left + 1, L);
          break;
      }
      if (J)
        return;
      if (S && !nO(N, U, Z)) {
        X();
        return;
      }
      if (!G && E(N, U)) {
        X();
        return;
      }
      let re = !1;
      switch (b) {
        case "top": {
          const ie = V ? Tt / 2 : Tt * 4, oe = V || H ? u + ie : u - ie, se = V ? u - ie : H ? u + ie : u - ie, ge = f + Tt + 1, je = H || V ? q.bottom - Tt : q.top, Ee = H ? V ? q.bottom - Tt : q.top : q.bottom - Tt;
          re = Zs(N, U, oe, ge, se, ge, q.left, je, q.right, Ee);
          break;
        }
        case "bottom": {
          const ie = V ? Tt / 2 : Tt * 4, oe = V || H ? u + ie : u - ie, se = V ? u - ie : H ? u + ie : u - ie, ge = f - Tt, je = H || V ? q.top + Tt : q.bottom, Ee = H ? V ? q.top + Tt : q.bottom : q.top + Tt;
          re = Zs(N, U, oe, ge, se, ge, q.left, je, q.right, Ee);
          break;
        }
        case "left": {
          const ie = K ? Tt / 2 : Tt * 4, oe = K || Y ? f + ie : f - ie, se = K ? f - ie : Y ? f + ie : f - ie, ge = u + Tt + 1, je = Y || K ? q.right - Tt : q.left, Ee = Y ? K ? q.right - Tt : q.left : q.right - Tt;
          re = Zs(N, U, je, q.top, Ee, q.bottom, ge, oe, ge, se);
          break;
        }
        case "right": {
          const ie = K ? Tt / 2 : Tt * 4, oe = K || Y ? f + ie : f - ie, se = K ? f - ie : Y ? f + ie : f - ie, ge = u - Tt, je = Y || K ? q.left + Tt : q.right, Ee = Y ? K ? q.left + Tt : q.right : q.left + Tt;
          re = Zs(N, U, ge, oe, ge, se, je, q.top, Ee, q.bottom);
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
function lO(n) {
  const {
    store: o,
    actionsRef: a
  } = n, i = o.useState("open");
  J0(o, i), Fc(o);
  const {
    forceUnmount: u
  } = Kc(i, o), f = y.useCallback(() => {
    o.setOpen(!1, Ye(Lc));
  }, [o]);
  y.useImperativeHandle(a, () => ({
    unmount: u,
    close: f
  }), [u, f]);
}
function oO({
  store: n,
  parentContext: o,
  isDrawer: a
}) {
  const i = n.useState("open"), u = n.useState("disablePointerDismissal"), f = n.useState("modal"), p = n.useState("popupElement"), g = n.useState("floatingRootContext"), [m, d] = y.useState(0), [v, b] = y.useState(0), S = m === 0, R = Ei(g, {
    outsidePressEvent() {
      return n.context.internalBackdropRef.current || n.context.backdropRef.current ? "intentional" : {
        mouse: f === "trap-focus" ? "sloppy" : "intentional",
        touch: "sloppy"
      };
    },
    outsidePress(A) {
      if (!n.context.outsidePressEnabledRef.current || "button" in A && A.button !== 0 || "touches" in A && A.touches.length !== 1)
        return !1;
      const O = gn(A);
      return S && !u ? f && (n.context.internalBackdropRef.current || n.context.backdropRef.current) ? n.context.internalBackdropRef.current === O || n.context.backdropRef.current === O || Le(O, p) && !O?.hasAttribute("data-base-ui-portal") : !0 : !1;
    },
    escapeKey: S
  });
  n0(i && f === !0, p), n.useContextCallback("onNestedDialogOpen", (A, O) => {
    d(A), b(O);
  }), n.useContextCallback("onNestedDialogClose", () => {
    d(0), b(0);
  }), y.useEffect(() => (o?.onNestedDialogOpen && i && o.onNestedDialogOpen(m + 1, v + (a ? 1 : 0)), o?.onNestedDialogClose && !i && o.onNestedDialogClose(), () => {
    o?.onNestedDialogClose && i && o.onNestedDialogClose();
  }), [a, i, m, v, o]);
  const w = R.reference ?? bt, M = R.trigger ?? bt, E = R.floating ?? bt;
  return Qc(n, {
    activeTriggerProps: w,
    inactiveTriggerProps: M,
    popupProps: E,
    nestedOpenDialogCount: m,
    nestedOpenDrawerCount: v
  }), null;
}
const ox = /* @__PURE__ */ y.createContext(!1), rx = /* @__PURE__ */ y.createContext(void 0);
function ur(n) {
  const o = y.useContext(rx);
  if (n === !1 && o === void 0)
    throw new Error(At(27));
  return o;
}
const rO = {
  ...Jc,
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
class rg extends Ti {
  constructor(o, a, i = !1) {
    const u = new ia(), f = aO(o);
    f.floatingRootContext = eg(u, a, i), super(f, {
      popupRef: /* @__PURE__ */ y.createRef(),
      backdropRef: /* @__PURE__ */ y.createRef(),
      internalBackdropRef: /* @__PURE__ */ y.createRef(),
      outsidePressEnabledRef: {
        current: !0
      },
      triggerElements: u,
      onOpenChange: void 0,
      onOpenChangeComplete: void 0
    }, rO);
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
    Xc(i, o, a.trigger), this.update(i);
  };
  static useStore(o, a) {
    return Zp(o, (u, f) => new rg(a, u, f), !0).store;
  }
}
function aO(n = {}) {
  return {
    ...Zc(),
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
function ax(n, o = "dialog") {
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
  } = n, R = o === "drawer", w = o === "alert-dialog", M = w ? !0 : m, E = w || g, A = w ? "alertdialog" : "dialog", O = ur(!0), D = {
    modal: M,
    disablePointerDismissal: E,
    nested: !!O,
    role: A
  }, j = rg.useStore(v?.store, {
    open: u,
    openProp: i,
    activeTriggerId: S,
    triggerIdProp: b,
    ...D
  });
  Np(() => {
    const ee = i === void 0 && j.state.open === !1 && u === !0 ? {
      open: !0,
      activeTriggerId: S
    } : null;
    w ? j.update(ee ? {
      ...D,
      ...ee
    } : D) : ee && j.update(ee);
  }), j.useControlledProp("openProp", i), j.useControlledProp("triggerIdProp", b), j.useSyncedValues(D), j.useContextCallback("onOpenChange", f), j.useContextCallback("onOpenChangeComplete", p);
  const N = j.useState("open"), U = j.useState("mounted"), _ = j.useState("payload");
  lO({
    store: j,
    actionsRef: d
  });
  const G = N || U, k = y.useMemo(() => ({
    store: j
  }), [j]);
  return /* @__PURE__ */ x.jsx(ox.Provider, {
    value: !1,
    children: /* @__PURE__ */ x.jsxs(rx.Provider, {
      value: k,
      children: [G && /* @__PURE__ */ x.jsx(oO, {
        store: j,
        parentContext: O?.store.context,
        isDrawer: R
      }), typeof a == "function" ? a({
        payload: _
      }) : a]
    })
  });
}
function iO(n) {
  return ax(n, "alert-dialog");
}
let lr = (function(n) {
  return n.open = "data-open", n.closed = "data-closed", n[n.startingStyle = bi.startingStyle] = "startingStyle", n[n.endingStyle = bi.endingStyle] = "endingStyle", n.anchorHidden = "data-anchor-hidden", n.side = "data-side", n.align = "data-align", n;
})({}), Ec = /* @__PURE__ */ (function(n) {
  return n.popupOpen = "data-popup-open", n.pressed = "data-pressed", n;
})({});
const sO = {
  [Ec.popupOpen]: ""
}, cO = {
  [Ec.popupOpen]: "",
  [Ec.pressed]: ""
}, uO = {
  [lr.open]: ""
}, fO = {
  [lr.closed]: ""
}, dO = {
  [lr.anchorHidden]: ""
}, tu = {
  open(n) {
    return n ? sO : null;
  }
}, Tc = {
  open(n) {
    return n ? cO : null;
  }
}, ko = {
  open(n) {
    return n ? uO : fO;
  },
  anchorHidden(n) {
    return n ? dO : null;
  }
}, pO = {
  ...ko,
  ...jo
}, ix = /* @__PURE__ */ y.forwardRef(function(o, a) {
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
    stateAttributesMapping: pO,
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
}), sx = /* @__PURE__ */ y.forwardRef(function(o, a) {
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
  } = Oo({
    disabled: p,
    native: g
  }), R = {
    disabled: p
  };
  function w(M) {
    v && d.setOpen(!1, Ye(i0, M.nativeEvent));
  }
  return nt("button", o, {
    state: R,
    ref: [a, S],
    props: [{
      onClick: w
    }, m, b]
  });
});
function Bn(n) {
  return rr(n, "base-ui");
}
const cx = /* @__PURE__ */ y.forwardRef(function(o, a) {
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
let gO = /* @__PURE__ */ (function(n) {
  return n.nestedDialogs = "--nested-dialogs", n;
})({}), mO = (function(n) {
  return n[n.open = lr.open] = "open", n[n.closed = lr.closed] = "closed", n[n.startingStyle = lr.startingStyle] = "startingStyle", n[n.endingStyle = lr.endingStyle] = "endingStyle", n.nested = "data-nested", n.nestedDialogOpen = "data-nested-dialog-open", n;
})({});
const ux = /* @__PURE__ */ y.createContext(void 0);
function hO() {
  const n = y.useContext(ux);
  if (n === void 0)
    throw new Error(At(26));
  return n;
}
const di = "ArrowUp", pi = "ArrowDown", Rc = "ArrowLeft", Cc = "ArrowRight", nu = "Home", lu = "End", fx = /* @__PURE__ */ new Set([Rc, Cc]), yO = /* @__PURE__ */ new Set([Rc, Cc, nu, lu]), dx = /* @__PURE__ */ new Set([di, pi]), vO = /* @__PURE__ */ new Set([di, pi, nu, lu]), px = /* @__PURE__ */ new Set([...fx, ...dx]), Ri = /* @__PURE__ */ new Set([...px, nu, lu]), bO = "Shift", xO = "Control", SO = "Alt", wO = "Meta", EO = /* @__PURE__ */ new Set([bO, xO, SO, wO]);
function TO(n) {
  return Rt(n) && n.tagName === "INPUT";
}
function cb(n) {
  return !!(TO(n) && n.selectionStart != null || Rt(n) && n.tagName === "TEXTAREA");
}
function ub(n, o, a, i) {
  if (!n || !o || !o.scrollTo)
    return;
  let u = n.scrollLeft, f = n.scrollTop;
  const p = n.clientWidth < n.scrollWidth, g = n.clientHeight < n.scrollHeight;
  if (p && i !== "vertical") {
    const m = fb(n, o, "left"), d = $s(n), v = $s(o);
    a === "ltr" && (m + o.offsetWidth + v.scrollMarginRight > n.scrollLeft + n.clientWidth - d.scrollPaddingRight ? u = m + o.offsetWidth + v.scrollMarginRight - n.clientWidth + d.scrollPaddingRight : m - v.scrollMarginLeft < n.scrollLeft + d.scrollPaddingLeft && (u = m - v.scrollMarginLeft - d.scrollPaddingLeft)), a === "rtl" && (m - v.scrollMarginRight < n.scrollLeft + d.scrollPaddingLeft ? u = m - v.scrollMarginLeft - d.scrollPaddingLeft : m + o.offsetWidth + v.scrollMarginRight > n.scrollLeft + n.clientWidth - d.scrollPaddingRight && (u = m + o.offsetWidth + v.scrollMarginRight - n.clientWidth + d.scrollPaddingRight));
  }
  if (g && i !== "horizontal") {
    const m = fb(n, o, "top"), d = $s(n), v = $s(o);
    m - v.scrollMarginTop < n.scrollTop + d.scrollPaddingTop ? f = m - v.scrollMarginTop - d.scrollPaddingTop : m + o.offsetHeight + v.scrollMarginBottom > n.scrollTop + n.clientHeight - d.scrollPaddingBottom && (f = m + o.offsetHeight + v.scrollMarginBottom - n.clientHeight + d.scrollPaddingBottom);
  }
  n.scrollTo({
    left: u,
    top: f,
    behavior: "auto"
  });
}
function fb(n, o, a) {
  const i = a === "left" ? "offsetLeft" : "offsetTop";
  let u = 0;
  for (; o.offsetParent && (u += o[i], o.offsetParent !== n); )
    o = o.offsetParent;
  return u;
}
function $s(n) {
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
const RO = {
  ...ko,
  ...jo,
  nestedDialogOpen(n) {
    return n ? {
      [mO.nestedDialogOpen]: ""
    } : null;
  }
}, gx = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    finalFocus: p,
    initialFocus: g,
    ...m
  } = o, {
    store: d
  } = ur(), v = d.useState("descriptionElementId"), b = d.useState("disablePointerDismissal"), S = d.useState("floatingRootContext"), R = d.useState("popupProps"), w = d.useState("modal"), M = d.useState("mounted"), E = d.useState("nested"), A = d.useState("nestedOpenDialogCount"), O = d.useState("open"), z = d.useState("openMethod"), D = d.useState("titleElementId"), j = d.useState("transitionStatus"), N = d.useState("role"), U = S.useState("floatingId"), _ = m.id ?? U;
  hO(), Ql({
    open: O,
    ref: d.context.popupRef,
    onComplete() {
      O && d.context.onOpenChangeComplete?.(!0);
    }
  });
  const G = g === void 0 ? Q0(d.context.popupRef) : g, k = A > 0, ee = d.useStateSetter("popupElement"), X = nt("div", o, {
    state: {
      open: O,
      nested: E,
      transitionStatus: j,
      nestedDialogOpen: k
    },
    props: [R, {
      id: _,
      "aria-labelledby": D ?? void 0,
      "aria-describedby": v ?? void 0,
      role: N,
      ...aa,
      hidden: !M,
      onKeyDown(Z) {
        Ri.has(Z.key) && Z.stopPropagation();
      },
      style: {
        [gO.nestedDialogs]: A
      }
    }, m],
    ref: [a, d.context.popupRef, ee],
    stateAttributesMapping: RO
  });
  return /* @__PURE__ */ x.jsx(Vc, {
    context: S,
    openInteractionType: z,
    disabled: !M,
    closeOnFocusOut: !b,
    initialFocus: G,
    returnFocus: p,
    modal: w !== !1,
    restoreFocus: "popup",
    children: X
  });
});
function ou(n) {
  return Ap(19) ? n : n ? "true" : void 0;
}
const ru = /* @__PURE__ */ y.forwardRef(function(o, a) {
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
}), mx = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    keepMounted: i = !1,
    ...u
  } = o, {
    store: f
  } = ur(), p = f.useState("mounted"), g = f.useState("modal"), m = f.useState("open");
  return p || i ? /* @__PURE__ */ x.jsx(ux.Provider, {
    value: i,
    children: /* @__PURE__ */ x.jsxs(Bc, {
      ref: a,
      ...u,
      children: [p && g === !0 && /* @__PURE__ */ x.jsx(ru, {
        ref: f.context.internalBackdropRef,
        inert: ou(!m)
      }), o.children]
    })
  }) : null;
}), hx = /* @__PURE__ */ y.forwardRef(function(o, a) {
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
function CO(n) {
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
function yx(n, o) {
  const a = y.useRef(n), i = ze(o);
  xe(() => {
    a.current !== n && i(a.current);
  }, [n, i]), xe(() => {
    a.current = n;
  }, [n]);
}
function vx(n, o) {
  const a = ze((f, p) => {
    (typeof n == "function" ? n() : n) || o(p || // On iOS Safari, the hitslop around touch targets means tapping outside an element's
    // bounds does not fire `pointerdown` but does fire `mousedown`. The `interactionType`
    // will be "" in that case.
    (jc ? "touch" : ""));
  }), {
    onClick: i,
    onPointerDown: u
  } = CO(a);
  return y.useMemo(() => ({
    onClick: i,
    onPointerDown: u
  }), [i, u]);
}
function bx(n) {
  const [o, a] = y.useState(null), i = vx(n, a);
  return yx(n, (u) => {
    u && !n && a(null);
  }), y.useMemo(() => ({
    openMethod: o,
    triggerProps: i
  }), [o, i]);
}
function OO({ ...n }) {
  return /* @__PURE__ */ x.jsx(iO, { "data-slot": "alert-dialog", ...n });
}
function MO({ ...n }) {
  return /* @__PURE__ */ x.jsx(mx, { "data-slot": "alert-dialog-portal", ...n });
}
function AO({
  className: n,
  ...o
}) {
  return /* @__PURE__ */ x.jsx(
    ix,
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
function zO({
  className: n,
  size: o = "default",
  ...a
}) {
  return /* @__PURE__ */ x.jsxs(MO, { children: [
    /* @__PURE__ */ x.jsx(AO, {}),
    /* @__PURE__ */ x.jsx(
      gx,
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
function DO({
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
const NO = ra(
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
function jO({
  className: n,
  variant: o = "default",
  ...a
}) {
  return /* @__PURE__ */ x.jsx(
    "div",
    {
      "data-slot": "alert-dialog-footer",
      className: Ke(NO({ variant: o }), n),
      ...a
    }
  );
}
const kO = ra(
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
function _O({
  className: n,
  variant: o = "default",
  ...a
}) {
  return /* @__PURE__ */ x.jsx(
    "div",
    {
      "data-slot": "alert-dialog-media",
      className: Ke(kO({ variant: o }), n),
      ...a
    }
  );
}
function HO({
  className: n,
  ...o
}) {
  return /* @__PURE__ */ x.jsx(
    hx,
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
function UO({
  className: n,
  ...o
}) {
  return /* @__PURE__ */ x.jsx(
    cx,
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
function LO({
  className: n,
  ...o
}) {
  return /* @__PURE__ */ x.jsx(
    Mt,
    {
      "data-slot": "alert-dialog-action",
      className: Ke(n),
      ...o
    }
  );
}
function IO({
  className: n,
  variant: o = "outline",
  size: a = "default",
  ...i
}) {
  return /* @__PURE__ */ x.jsx(
    sx,
    {
      "data-slot": "alert-dialog-cancel",
      className: Ke(n),
      render: /* @__PURE__ */ x.jsx(Mt, { variant: o, size: a }),
      ...i
    }
  );
}
const xx = /* @__PURE__ */ y.createContext(void 0);
function au(n) {
  const o = y.useContext(xx);
  if (o === void 0 && !n)
    throw new Error(At(33));
  return o;
}
const Sx = /* @__PURE__ */ y.createContext(void 0);
function ml(n) {
  const o = y.useContext(Sx);
  if (o === void 0 && !n)
    throw new Error(At(36));
  return o;
}
const BO = /* @__PURE__ */ y.createContext(void 0);
function iu(n = !0) {
  const o = y.useContext(BO);
  if (o === void 0 && !n)
    throw new Error(At(25));
  return o;
}
function oa({
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
const wx = /* @__PURE__ */ y.createContext(void 0);
function VO() {
  const n = y.useContext(wx);
  if (n === void 0)
    throw new Error(At(30));
  return n;
}
function PO(n) {
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
  } = f.useState("floatingTreeRoot"), v = f.useState("open"), b = iu(!0), S = b !== void 0;
  return y.useMemo(() => ({
    id: i,
    role: "menuitem",
    tabIndex: v && a ? 0 : -1,
    onKeyDown(R) {
      R.key === " " && p?.current && R.preventDefault();
    },
    onMouseMove(R) {
      u && d.emit("itemhover", {
        nodeId: u,
        target: R.currentTarget
      });
    },
    onClick(R) {
      o && d.emit("close", {
        domEvent: R,
        reason: Jr
      });
    },
    onMouseUp(R) {
      if (b) {
        const w = b.initialCursorPointRef.current;
        if (b.initialCursorPointRef.current = null, S && w && Math.abs(R.clientX - w.x) <= 1 && Math.abs(R.clientY - w.y) <= 1 || S && !jp && R.button === 2)
          return;
      }
      g.current && f.context.allowMouseUpTriggerRef.current && (!S || R.button === 2) && (!m || m.type === "regular-item") && g.current.click();
    }
  }), [o, a, i, d, u, v, f, p, g, b, S, m]);
}
const Ex = {
  type: "regular-item"
};
function ag(n) {
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
    getButtonProps: R,
    buttonRef: w
  } = Oo({
    disabled: b,
    focusableWhenDisabled: !0,
    native: g,
    composite: !0
  }), M = PO({
    closeOnClick: o,
    highlighted: i,
    id: u,
    nodeId: d,
    store: f,
    typingRef: p,
    itemRef: S,
    itemMetadata: m
  }), E = y.useCallback((O) => bn(M, {
    onMouseEnter() {
      m.type === "submenu-trigger" && m.setActive();
    }
  }, O, R), [M, R, m]), A = Eo(S, w);
  return y.useMemo(() => ({
    getItemProps: E,
    itemRef: A
  }), [E, A]);
}
const Tx = /* @__PURE__ */ y.createContext({
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
function YO() {
  return y.useContext(Tx);
}
let Rx = /* @__PURE__ */ (function(n) {
  return n[n.None = 0] = "None", n[n.GuessFromOrder = 1] = "GuessFromOrder", n;
})({});
function Ci(n = {}) {
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
  } = YO(), S = y.useRef(-1), [R, w] = y.useState(f ?? (u === Rx.GuessFromOrder ? () => {
    if (S.current === -1) {
      const A = b.current;
      b.current += 1, S.current = A;
    }
    return S.current;
  } : -1)), M = y.useRef(null), E = y.useCallback((A) => {
    if (M.current = A, R !== -1 && A !== null && (d.current[R] = A, v)) {
      const O = o !== void 0;
      v.current[R] = O ? o : i?.current?.textContent ?? A.textContent;
    }
  }, [R, d, v, o, i]);
  return xe(() => {
    if (f != null)
      return;
    const A = M.current;
    if (A)
      return p(A, a), () => {
        g(A);
      };
  }, [f, p, g, a]), xe(() => {
    if (f == null)
      return m((A) => {
        const O = M.current ? A.get(M.current)?.index : null;
        O != null && w(O);
      });
  }, [f, m, w]), {
    ref: E,
    index: R
  };
}
let db = /* @__PURE__ */ (function(n) {
  return n.checked = "data-checked", n.unchecked = "data-unchecked", n.disabled = "data-disabled", n.highlighted = "data-highlighted", n;
})({});
const Cx = {
  checked(n) {
    return n ? {
      [db.checked]: ""
    } : {
      [db.unchecked]: ""
    };
  },
  ...jo
}, GO = /* @__PURE__ */ y.forwardRef(function(o, a) {
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
    style: R,
    ...w
  } = o, M = Ci({
    label: p
  }), E = au(!0), A = Bn(f), {
    store: O
  } = ml(), z = O.useState("isActive", M.index), D = O.useState("itemProps"), [j, N] = oa({
    controlled: v,
    default: b ?? !1,
    name: "MenuCheckboxItem",
    state: "checked"
  }), {
    getItemProps: U,
    itemRef: _
  } = ag({
    closeOnClick: d,
    disabled: m,
    highlighted: z,
    id: A,
    store: O,
    nativeButton: g,
    nodeId: E?.context.nodeId,
    itemMetadata: Ex
  }), G = y.useMemo(() => ({
    disabled: m,
    highlighted: z,
    checked: j
  }), [m, z, j]);
  function k(Q) {
    const X = Ye(Jr, Q.nativeEvent, void 0, {
      preventUnmountOnClose() {
      }
    });
    S?.(!j, X), !X.isCanceled && N((Z) => !Z);
  }
  const ee = nt("div", o, {
    state: G,
    stateAttributesMapping: Cx,
    props: [D, {
      role: "menuitemcheckbox",
      "aria-checked": j,
      onClick: k
    }, w, U],
    ref: [_, a, M.ref]
  });
  return /* @__PURE__ */ x.jsx(wx.Provider, {
    value: G,
    children: ee
  });
}), qO = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    keepMounted: p = !1,
    ...g
  } = o, m = VO(), d = y.useRef(null), {
    transitionStatus: v,
    setMounted: b
  } = qc(m.checked);
  Ql({
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
    stateAttributesMapping: Cx,
    props: {
      "aria-hidden": !0,
      ...g
    },
    enabled: p || m.checked
  });
}), Ox = /* @__PURE__ */ y.createContext(void 0);
function XO() {
  const n = y.useContext(Ox);
  if (n === void 0)
    throw new Error(At(31));
  return n;
}
const FO = /* @__PURE__ */ y.forwardRef(function(o, a) {
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
  return /* @__PURE__ */ x.jsx(Ox.Provider, {
    value: m,
    children: d
  });
}), KO = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    id: p,
    ...g
  } = o, m = Bn(p), d = XO();
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
}), QO = /* @__PURE__ */ y.forwardRef(function(o, a) {
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
  } = o, S = Ci({
    label: p
  }), R = au(!0), w = Bn(f), {
    store: M
  } = ml(), E = M.useState("isActive", S.index), A = M.useState("itemProps"), {
    getItemProps: O,
    itemRef: z
  } = ag({
    closeOnClick: d,
    disabled: m,
    highlighted: E,
    id: w,
    store: M,
    nativeButton: g,
    nodeId: R?.context.nodeId,
    itemMetadata: Ex
  });
  return nt("div", o, {
    state: {
      disabled: m,
      highlighted: E
    },
    props: [A, b, O],
    ref: [z, a, S.ref]
  });
}), ZO = /* @__PURE__ */ y.createContext(void 0);
function su(n) {
  return y.useContext(ZO);
}
function Oi(n) {
  return n === "starting" ? HR : bt;
}
const JO = {
  ...ko,
  ...jo
}, $O = /* @__PURE__ */ y.forwardRef(function(o, a) {
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
  } = au(), b = su() != null, S = m.useState("open"), R = m.useState("transitionStatus"), w = m.useState("popupProps"), M = m.useState("mounted"), E = m.useState("instantType"), A = m.useState("activeTriggerElement"), O = m.useState("parent"), z = m.useState("lastOpenChangeReason"), D = m.useState("rootId"), j = m.useState("floatingRootContext"), N = m.useState("floatingTreeRoot"), U = m.useState("closeDelay"), _ = m.useState("activeTriggerElement"), G = m.useState("hoverEnabled"), k = m.useState("disabled"), ee = m.useState("openMethod"), Q = O.type === "context-menu";
  Ql({
    open: S,
    ref: m.context.popupRef,
    onComplete() {
      S && m.context.onOpenChangeComplete?.(!0);
    }
  }), y.useEffect(() => {
    function Y(V) {
      m.setOpen(!1, Ye(V.reason, V.domEvent));
    }
    return N.events.on("close", Y), () => {
      N.events.off("close", Y);
    };
  }, [N.events, m]), og(j, {
    enabled: G && !k && !Q && O.type !== "menubar",
    closeDelay: U
  });
  const X = y.useCallback((Y) => {
    m.set("popupElement", Y);
  }, [m]), Z = {
    transitionStatus: R,
    side: d,
    align: v,
    open: S,
    nested: O.type === "menu",
    instant: E
  }, q = nt("div", o, {
    state: Z,
    ref: [a, m.context.popupRef, X],
    stateAttributesMapping: JO,
    props: [w, {
      onKeyDown(Y) {
        b && Ri.has(Y.key) && Y.stopPropagation();
      }
    }, Oi(R), g, {
      "data-rootownerid": D
    }]
  });
  let H = O.type === void 0 || Q;
  return (A || O.type === "menubar" && z !== Uc) && (H = !0), /* @__PURE__ */ x.jsx(Vc, {
    context: j,
    openInteractionType: ee,
    modal: Q,
    disabled: !M,
    returnFocus: p === void 0 ? H : p,
    initialFocus: O.type !== "menu",
    restoreFocus: !0,
    externalTree: O.type !== "menubar" ? N : void 0,
    previousFocusableElement: _,
    nextFocusableElement: O.type === void 0 ? m.context.triggerFocusTargetRef : void 0,
    beforeContentFocusGuardRef: O.type === void 0 ? m.context.beforeContentFocusGuardRef : void 0,
    children: q
  });
}), Mx = /* @__PURE__ */ y.createContext(void 0);
function WO() {
  const n = y.useContext(Mx);
  if (n === void 0)
    throw new Error(At(32));
  return n;
}
const eM = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    keepMounted: i = !1,
    ...u
  } = o, {
    store: f
  } = ml();
  return f.useState("mounted") || i ? /* @__PURE__ */ x.jsx(Mx.Provider, {
    value: i,
    children: /* @__PURE__ */ x.jsx(Bc, {
      ref: a,
      ...u
    })
  }) : null;
}), tM = /* @__PURE__ */ y.createContext(void 0);
function cu() {
  return y.useContext(tM)?.direction ?? "ltr";
}
const nM = (n) => ({
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
    } = Xl(n, o) || {};
    if (d == null)
      return {};
    const S = p0(v), R = {
      x: a,
      y: i
    }, w = Bp(u), M = Ip(w), E = await p.getDimensions(d), A = w === "y", O = A ? "top" : "left", z = A ? "bottom" : "right", D = A ? "clientHeight" : "clientWidth", j = f.reference[M] + f.reference[w] - R[w] - f.floating[M], N = R[w] - f.reference[w], U = b === "real" ? await p.getOffsetParent?.(d) : g.floating;
    let _ = g.floating[D] || f.floating[M];
    (!_ || !await p.isElement?.(U)) && (_ = g.floating[D] || f.floating[M]);
    const G = j / 2 - N / 2, k = _ / 2 - E[M] / 2 - 1, ee = Math.min(S[O], k), Q = Math.min(S[z], k), X = ee, Z = _ - E[M] - Q, q = _ / 2 - E[M] / 2 + G, H = d0(X, q, Z), Y = !m.arrow && Do(u) != null && q !== H && f.reference[M] / 2 - (q < X ? ee : Q) - E[M] / 2 < 0, V = Y ? q < X ? q - X : q - Z : 0;
    return {
      [w]: R[w] + V,
      data: {
        [w]: H,
        centerOffset: q - H - V,
        ...Y && {
          alignmentOffset: V
        }
      },
      reset: Y
    };
  }
}), lM = (n, o) => ({
  ...nM(n),
  options: [n, o]
}), oM = DC().fn, rM = {
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
        referenceHidden: (await oM(n)).data?.referenceHidden || f
      }
    };
  }
}, sc = {
  sideX: "left",
  sideY: "top"
}, ig = {
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
        data: sc
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
      const O = tt(u);
      S = {
        width: O.documentElement.clientWidth,
        height: O.documentElement.clientHeight
      };
    } else await f.isElement?.(b) && (S = await f.getDimensions(b));
    const R = Ln(g);
    let w = o, M = a;
    R === "left" && (w = S.width - (o + i.width)), R === "top" && (M = S.height - (a + i.height));
    const E = R === "left" ? "right" : sc.sideX, A = R === "top" ? "bottom" : sc.sideY;
    return {
      x: w,
      y: M,
      data: {
        sideX: E,
        sideY: A
      }
    };
  }
};
function Ax(n, o, a) {
  const i = n === "inline-start" || n === "inline-end";
  return {
    top: "top",
    right: i ? a ? "inline-start" : "inline-end" : "right",
    bottom: "bottom",
    left: i ? a ? "inline-end" : "inline-start" : "left"
  }[o];
}
function pb(n, o, a) {
  const {
    rects: i,
    placement: u
  } = n;
  return {
    side: Ax(o, Ln(u), a),
    align: Do(u) || "center",
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
function uu(n) {
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
    keepMounted: R = !1,
    floatingRootContext: w,
    mounted: M,
    collisionAvoidance: E,
    shiftCrossAxis: A = !1,
    nodeId: O,
    adaptiveOrigin: z,
    lazyFlip: D = !1,
    externalTree: j
  } = n, [N, U] = y.useState(null);
  !M && N !== null && U(null);
  const _ = E.side || "flip", G = E.align || "flip", k = E.fallbackAxisSide || "end", ee = typeof o == "function" ? o : void 0, Q = ze(ee), X = ee ? Q : o, Z = Yt(o), q = Yt(M), Y = cu() === "rtl", V = N || {
    top: "top",
    right: "right",
    bottom: "bottom",
    left: "left",
    "inline-end": Y ? "left" : "right",
    "inline-start": Y ? "right" : "left"
  }[i], K = f === "center" ? V : `${V}-${f}`;
  let B = m;
  const C = 1, L = i === "bottom" ? C : 0, ne = i === "top" ? C : 0, J = i === "right" ? C : 0, re = i === "left" ? C : 0;
  typeof B == "number" ? B = {
    top: B + L,
    right: B + re,
    bottom: B + ne,
    left: B + J
  } : B && (B = {
    top: (B.top || 0) + L,
    right: (B.right || 0) + re,
    bottom: (B.bottom || 0) + ne,
    left: (B.left || 0) + J
  });
  const ie = {
    boundary: g === "clipping-ancestors" ? "clippingAncestors" : g,
    padding: B
  }, oe = y.useRef(null), se = Yt(u), ge = Yt(p), je = typeof u != "function" ? u : 0, Ee = typeof p != "function" ? p : 0, fe = [];
  S && fe.push(S), fe.push(CC((Qe) => {
    const ft = pb(Qe, i, Y), It = typeof se.current == "function" ? se.current(ft) : se.current, Ht = typeof ge.current == "function" ? ge.current(ft) : ge.current;
    return {
      mainAxis: It,
      crossAxis: Ht,
      alignmentAxis: Ht
    };
  }, [je, Ee, Y, i]));
  const ye = G === "none" && _ !== "shift", Re = !ye && (d || A || _ === "shift"), _e = _ === "none" ? null : AC({
    ...ie,
    // Ensure the popup flips if it's been limited by its --available-height and it resizes.
    // Since the size() padding is smaller than the flip() padding, flip() will take precedence.
    padding: {
      top: B.top + C,
      right: B.right + C,
      bottom: B.bottom + C,
      left: B.left + C
    },
    mainAxis: !A && _ === "flip",
    crossAxis: G === "flip" ? "alignment" : !1,
    fallbackAxisSideDirection: k
  }), ke = ye ? null : OC((Qe) => {
    const ft = tt(Qe.elements.floating).documentElement;
    return {
      ...ie,
      // Use the Layout Viewport to avoid shifting around when pinch-zooming
      // for context menus.
      rootBoundary: A ? {
        x: 0,
        y: 0,
        width: ft.clientWidth,
        height: ft.clientHeight
      } : void 0,
      mainAxis: G !== "none",
      crossAxis: Re,
      limiter: d || A ? void 0 : MC((It) => {
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
  }, [ie, d, A, B, G]);
  _ === "shift" || G === "shift" || f === "center" ? fe.push(ke, _e) : fe.push(_e, ke), fe.push(zC({
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
  }), lM((Qe) => ({
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
      } = Qe, Gt = Ln(Ht), Sn = Wn(Gt), zn = oe.current, Vn = It.arrow?.x || 0, qt = It.arrow?.y || 0, Pn = zn?.clientWidth || 0, hl = zn?.clientHeight || 0, tl = Vn + Pn / 2, yl = qt + hl / 2, qe = Math.abs(It.shift?.y || 0), xt = Ut.reference.height / 2, Xt = typeof u == "function" ? u(pb(Qe, i, Y)) : u, nn = qe > Xt, Wt = {
        top: `${tl}px calc(100% + ${Xt}px)`,
        bottom: `${tl}px ${-Xt}px`,
        left: `calc(100% + ${Xt}px) ${yl}px`,
        right: `${-Xt}px ${yl}px`
      }[Gt], Ct = `${tl}px ${Ut.reference.y + xt - jt}px`;
      return ft.floating.style.setProperty("--transform-origin", Re && Sn === "y" && nn ? Ct : Wt), {};
    }
  }, rM, z), xe(() => {
    !M && w && w.update({
      referenceElement: null,
      floatingElement: null,
      domReferenceElement: null,
      positionReference: null
    });
  }, [M, w]);
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
  } = ZC({
    rootContext: w,
    open: R ? M : void 0,
    placement: K,
    middleware: fe,
    strategy: a,
    whileElementsMounted: R ? void 0 : (...Qe) => tb(...Qe, we),
    nodeId: O,
    externalTree: j
  }), {
    sideX: be,
    sideY: We
  } = Oe.adaptiveOrigin || sc, rt = Ue ? a : "fixed", pt = y.useMemo(() => {
    const Qe = z ? {
      position: rt,
      [be]: Se,
      [We]: Te
    } : {
      position: rt,
      ...ve
    };
    return Ue || (Qe.opacity = 0), Qe;
  }, [z, rt, be, Se, We, Te, ve, Ue]), Nt = y.useRef(null);
  xe(() => {
    if (!M)
      return;
    const Qe = Z.current, ft = typeof Qe == "function" ? Qe() : Qe, Ht = (gb(ft) ? ft.current : ft) || null || null;
    Ht !== Nt.current && (Ce.setPositionReference(Ht), Nt.current = Ht);
  }, [M, Ce, X, Z]), y.useEffect(() => {
    if (!M)
      return;
    const Qe = Z.current;
    typeof Qe != "function" && gb(Qe) && Qe.current !== Nt.current && (Ce.setPositionReference(Qe.current), Nt.current = Qe.current);
  }, [M, Ce, X, Z]), y.useEffect(() => {
    if (R && M && he.reference && he.floating)
      return tb(he.reference, he.floating, He, we);
  }, [R, M, he, He, we]);
  const et = Ln(ae), gt = Ax(i, et, Y), zt = Do(ae) || "center", mt = !!Oe.hide?.referenceHidden;
  xe(() => {
    D && M && Ue && U(et);
  }, [D, M, Ue, et]);
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
    anchorHidden: mt,
    refs: Ce,
    context: pe,
    isPositioned: Ue,
    update: He
  }), [pt, Mn, oe, An, gt, zt, et, mt, Ce, pe, Ue, He]);
}
function gb(n) {
  return n != null && "current" in n;
}
function sg(n) {
  const {
    children: o,
    elementsRef: a,
    labelsRef: i,
    onMapChange: u
  } = n, f = ze(u), p = y.useRef(0), g = xn(iM).current, m = xn(aM).current, [d, v] = y.useState(0), b = y.useRef(d), S = ze((A, O) => {
    m.set(A, O ?? null), b.current += 1, v(b.current);
  }), R = ze((A) => {
    m.delete(A), b.current += 1, v(b.current);
  }), w = y.useMemo(() => {
    const A = /* @__PURE__ */ new Map();
    return Array.from(m.keys()).filter((z) => z.isConnected).sort(sM).forEach((z, D) => {
      const j = m.get(z) ?? {};
      A.set(z, {
        ...j,
        index: D
      });
    }), A;
  }, [m, d]);
  xe(() => {
    if (typeof MutationObserver != "function" || w.size === 0)
      return;
    const A = new MutationObserver((O) => {
      const z = /* @__PURE__ */ new Set(), D = (j) => z.has(j) ? z.delete(j) : z.add(j);
      O.forEach((j) => {
        j.removedNodes.forEach(D), j.addedNodes.forEach(D);
      }), z.size === 0 && (b.current += 1, v(b.current));
    });
    return w.forEach((O, z) => {
      z.parentElement && A.observe(z.parentElement, {
        childList: !0
      });
    }), () => {
      A.disconnect();
    };
  }, [w]), xe(() => {
    b.current === d && (a.current.length !== w.size && (a.current.length = w.size), i && i.current.length !== w.size && (i.current.length = w.size), p.current = w.size), f(w);
  }, [f, w, a, i, d]), xe(() => () => {
    a.current = [];
  }, [a]), xe(() => () => {
    i && (i.current = []);
  }, [i]);
  const M = ze((A) => (g.add(A), () => {
    g.delete(A);
  }));
  xe(() => {
    g.forEach((A) => A(w));
  }, [g, w]);
  const E = y.useMemo(() => ({
    register: S,
    unregister: R,
    subscribeMapChange: M,
    elementsRef: a,
    labelsRef: i,
    nextIndexRef: p
  }), [S, R, M, a, i, p]);
  return /* @__PURE__ */ x.jsx(Tx.Provider, {
    value: E,
    children: o
  });
}
function aM() {
  return /* @__PURE__ */ new Map();
}
function iM() {
  return /* @__PURE__ */ new Set();
}
function sM(n, o) {
  const a = n.compareDocumentPosition(o);
  return a & Node.DOCUMENT_POSITION_FOLLOWING || a & Node.DOCUMENT_POSITION_CONTAINED_BY ? -1 : a & Node.DOCUMENT_POSITION_PRECEDING || a & Node.DOCUMENT_POSITION_CONTAINS ? 1 : 0;
}
function fu(n, o, {
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
    }, Oi(i), u],
    stateAttributesMapping: ko
  });
}
const cM = 20;
function cg(n, o, a, i) {
  const [u, f] = y.useState(!1);
  xe(() => {
    if (!n || !o || a == null) {
      f(!1);
      return;
    }
    const p = tt(a).documentElement.clientWidth, g = a.offsetWidth;
    f(p > 0 && g > 0 && g >= p - cM);
  }, [n, o, a]), n0(n && (!o || u), i);
}
const uM = /* @__PURE__ */ y.forwardRef(function(o, a) {
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
    arrowPadding: R = 5,
    sticky: w = !1,
    disableAnchorTracking: M = !1,
    collisionAvoidance: E = O0,
    style: A,
    ...O
  } = o, {
    store: z
  } = ml(), D = WO(), j = iu(!0), N = z.useState("parent"), U = z.useState("floatingRootContext"), _ = z.useState("floatingTreeRoot"), G = z.useState("mounted"), k = z.useState("open"), ee = z.useState("modal"), Q = z.useState("openMethod"), X = z.useState("activeTriggerElement"), Z = z.useState("transitionStatus"), q = z.useState("positionerElement"), H = z.useState("instantType"), Y = z.useState("hasViewport"), V = z.useState("lastOpenChangeReason"), K = z.useState("floatingNodeId"), B = z.useState("floatingParentNodeId"), C = U.useState("domReferenceElement"), L = y.useRef(null), ne = Qp(q, !1, !1);
  let J = i, re = d, ie = v, oe = m, se = E;
  N.type === "context-menu" && (J = i ?? N.context?.anchor, oe = oe ?? "start", !g && oe !== "center" && (ie = o.alignOffset ?? 2, re = o.sideOffset ?? -5));
  let ge = g, je = oe;
  N.type === "menu" ? (ge = ge ?? "inline-end", je = je ?? "start", se = o.collisionAvoidance ?? Yp) : N.type === "menubar" && (ge = ge ?? (N.context.orientation === "vertical" ? "inline-end" : "bottom"), je = je ?? "start");
  const Ee = N.type === "context-menu", fe = uu({
    anchor: J,
    floatingRootContext: U,
    positionMethod: j ? "fixed" : u,
    mounted: G,
    side: ge,
    sideOffset: re,
    align: je,
    alignOffset: ie,
    arrowPadding: Ee ? 0 : R,
    collisionBoundary: b,
    collisionPadding: S,
    sticky: w,
    nodeId: K,
    keepMounted: D,
    disableAnchorTracking: M,
    collisionAvoidance: se,
    shiftCrossAxis: Ee && !("side" in se && se.side === "flip"),
    externalTree: _,
    adaptiveOrigin: Y ? ig : void 0
  });
  y.useEffect(() => {
    function Se(Te) {
      Te.open && (Te.parentNodeId === K && z.set("hoverEnabled", !1), Te.nodeId !== K && Te.parentNodeId === z.select("floatingParentNodeId") && z.setOpen(!1, Ye(ri)));
    }
    return _.events.on("menuopenchange", Se), () => {
      _.events.off("menuopenchange", Se);
    };
  }, [z, _.events, K]), y.useEffect(() => {
    if (z.select("floatingParentNodeId") == null)
      return;
    function Se(Te) {
      if (Te.open || Te.nodeId !== z.select("floatingParentNodeId"))
        return;
      const Oe = Te.reason ?? ri;
      z.setOpen(!1, Ye(Oe));
    }
    return _.events.on("menuopenchange", Se), () => {
      _.events.off("menuopenchange", Se);
    };
  }, [_.events, z]);
  const ye = an();
  y.useEffect(() => {
    k || ye.clear();
  }, [k, ye]), y.useEffect(() => {
    function Se(Te) {
      if (!(!k || Te.nodeId !== z.select("floatingParentNodeId")))
        if (Te.target && X && X !== Te.target) {
          const Oe = z.select("closeDelay");
          Oe > 0 ? ye.isStarted() || ye.start(Oe, () => {
            z.setOpen(!1, Ye(ri));
          }) : z.setOpen(!1, Ye(ri));
        } else
          ye.clear();
    }
    return _.events.on("itemhover", Se), () => {
      _.events.off("itemhover", Se);
    };
  }, [_.events, k, X, z, ye]), y.useEffect(() => {
    const Se = {
      open: k,
      nodeId: K,
      parentNodeId: B,
      reason: z.select("lastOpenChangeReason")
    };
    _.events.emit("menuopenchange", Se);
  }, [_.events, k, z, K, B]), xe(() => {
    const Se = C, Te = L.current;
    if (Se && (L.current = Se), Te && Se && Se !== Te) {
      z.set("instantType", void 0);
      const Oe = new AbortController();
      return ne(() => {
        z.set("instantType", "trigger-change");
      }, Oe.signal), () => {
        Oe.abort();
      };
    }
  }, [C, ne, z]);
  const Re = {
    open: k,
    side: fe.side,
    align: fe.align,
    anchorHidden: fe.anchorHidden,
    nested: N.type === "menu",
    instant: H
  }, _e = N.type === "menubar" && N.context.modal;
  cg(k && (_e || ee && V !== Pt), Q === "touch", q, X);
  const we = fu(o, Re, {
    styles: fe.positionerStyles,
    transitionStatus: Z,
    props: O,
    refs: [a, z.useStateSetter("positionerElement")],
    hidden: !G,
    inert: !k
  }), Ce = G && N.type !== "menu" && (N.type !== "menubar" && ee && V !== Pt || N.type === "menubar" && N.context.modal);
  let he = null;
  return N.type === "menubar" ? he = N.context.contentElement : N.type === void 0 && (he = X), /* @__PURE__ */ x.jsxs(xx.Provider, {
    value: fe,
    children: [Ce && /* @__PURE__ */ x.jsx(ru, {
      ref: N.type === "context-menu" || N.type === "nested-context-menu" ? N.context.internalBackdropRef : null,
      inert: ou(!k),
      cutout: he
    }), /* @__PURE__ */ x.jsx(k0, {
      id: K,
      children: /* @__PURE__ */ x.jsx(sg, {
        elementsRef: z.context.itemDomElements,
        labelsRef: z.context.itemLabels,
        children: we
      })
    })]
  });
}), fM = /* @__PURE__ */ y.createContext(null);
function zx(n) {
  return y.useContext(fM);
}
const dM = {
  ...Jc,
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
class ug extends Ti {
  constructor(o) {
    super({
      ...pM(),
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
      triggerElements: new ia()
    }, dM), this.unsubscribeParentListener = this.observe("parent", (a) => {
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
    const i = xn(() => new ug(a)).current;
    return o ?? i;
  }
  unsubscribeParentListener = null;
}
function pM() {
  return {
    ...Zc(),
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
    floatingTreeRoot: new Gp(),
    floatingNodeId: void 0,
    floatingParentNodeId: null,
    itemProps: bt,
    keyboardEventRelay: void 0,
    closeDelay: 0,
    hasViewport: !1
  };
}
const Dx = /* @__PURE__ */ y.createContext(void 0);
function Nx() {
  return y.useContext(Dx);
}
const jx = Kp(function(o) {
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
    handle: R,
    triggerId: w,
    defaultTriggerId: M = null,
    highlightItemOnHover: E = !0
  } = o, A = iu(!0), O = ml(!0), z = zx(!0), D = Nx(), j = y.useMemo(() => D && O ? {
    type: "menu",
    store: O.store
  } : z ? {
    type: "menubar",
    context: z
  } : A && !O ? {
    type: "context-menu",
    context: A
  } : {
    type: void 0
  }, [A, O, z, D]), N = ug.useStore(R?.store, {
    open: p,
    openProp: i,
    activeTriggerId: M,
    triggerIdProp: w,
    parent: j
  });
  $p(N, i, p, M), N.useControlledProp("openProp", i), N.useControlledProp("triggerIdProp", w), N.useContextCallback("onOpenChangeComplete", f);
  const U = rr(), _ = rr(), G = N.useState("floatingTreeRoot"), k = qp(G), ee = Kl(), Q = N.useState("open"), X = N.useState("activeTriggerElement"), Z = N.useState("positionerElement"), q = N.useState("hoverEnabled"), H = N.useState("disabled"), Y = N.useState("lastOpenChangeReason"), V = N.useState("parent"), K = N.useState("activeIndex"), B = N.useState("payload"), C = N.useState("floatingParentNodeId"), L = y.useRef(null), ne = y.useRef(V.type !== "context-menu"), J = an(), re = y.useRef(!0), ie = an(), oe = C != null, {
    openMethod: se,
    triggerProps: ge
  } = bx(Q);
  N.useSyncedValues({
    disabled: g,
    highlightItemOnHover: E,
    modal: V.type === void 0 ? m : void 0,
    openMethod: se,
    rootId: U
  }), Fc(N);
  const {
    forceUnmount: je
  } = Kc(Q, N, () => {
    N.update({
      allowMouseEnter: !1,
      stickIfOpen: !0
    });
  });
  xe(() => {
    A && !O ? N.update({
      parent: {
        type: "context-menu",
        context: A
      },
      floatingNodeId: k,
      floatingParentNodeId: ee
    }) : O && N.update({
      floatingNodeId: k,
      floatingParentNodeId: ee
    });
  }, [A, O, k, ee, N]), y.useEffect(() => {
    if (Q || (L.current = null), V.type === "context-menu") {
      if (!Q) {
        J.clear(), ne.current = !1;
        return;
      }
      J.start(500, () => {
        ne.current = !0;
      });
    }
  }, [J, Q, V.type]), xe(() => {
    !Q && !q && N.set("hoverEnabled", !0);
  }, [Q, q, N]);
  const Ee = ze((be, We) => {
    const rt = We.reason;
    if (Q === be && We.trigger === X && Y === rt)
      return;
    const pt = Jp(We);
    if (!be && We.trigger == null && (We.trigger = X ?? void 0), u?.(be, We), We.isCanceled)
      return;
    N.state.floatingRootContext.dispatchOpenChange(be, We);
    const Nt = We.event;
    if (be === !1 && Nt?.type === "click" && Nt.pointerType === "touch" && !re.current)
      return;
    be && rt === Zr ? (re.current = !1, ie.start(300, () => {
      re.current = !0;
    })) : (re.current = !0, ie.clear());
    const et = (rt === ql || rt === Jr) && Nt.detail === 0 && Nt?.isTrusted, gt = !be && (rt === Si || rt == null), zt = {
      open: be,
      openChangeReason: rt
    };
    L.current = We.event ?? null, Xc(zt, be, We.trigger, pt()), N.update(zt), V.type === "menubar" && (rt === Zr || rt === To || rt === Pt || rt === sp || rt === ri) ? N.set("instantType", "group") : et || gt ? N.set("instantType", et ? "click" : "dismiss") : N.set("instantType", void 0);
  }), fe = K0({
    popupStore: N,
    floatingId: _,
    nested: ee != null,
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
    N.setOpen(!1, Ye(Lc));
  }, [N]);
  y.useImperativeHandle(b, () => ({
    unmount: je,
    close: Re
  }), [je, Re]);
  let _e;
  V.type === "context-menu" && (_e = V.context), y.useImperativeHandle(_e?.positionerRef, () => Z, [Z]), y.useImperativeHandle(_e?.actionsRef, () => ({
    setOpen: Ee
  }), [Ee]);
  const ke = Ei(fe, {
    enabled: !H,
    bubbles: {
      escapeKey: S && V.type === "menu"
    },
    outsidePress() {
      return V.type !== "context-menu" || L.current?.type === "contextmenu" ? !0 : ne.current;
    },
    externalTree: oe ? G : void 0
  }), we = cu(), Ce = y.useCallback((be) => {
    N.select("activeIndex") !== be && N.set("activeIndex", be);
  }, [N]), he = nx(fe, {
    enabled: !H,
    listRef: N.context.itemDomElements,
    activeIndex: K,
    nested: V.type !== void 0,
    loopFocus: d,
    orientation: v,
    parentOrientation: V.type === "menubar" ? V.context.orientation : void 0,
    rtl: we === "rtl",
    disabledIndices: Gl,
    onNavigate: Ce,
    openOnArrowKeyDown: V.type !== "context-menu",
    externalTree: oe ? G : void 0,
    focusItemOnHover: E
  }), Se = y.useCallback((be) => {
    N.context.typingRef.current = be;
  }, [N]), Te = lx(fe, {
    enabled: !H,
    listRef: N.context.itemLabels,
    elementsRef: N.context.itemDomElements,
    activeIndex: K,
    resetMs: _R,
    onMatch: (be) => {
      Q && be !== K && N.set("activeIndex", be);
    },
    onTyping: Se
  }), Oe = y.useMemo(() => {
    const be = bn(Te.reference, he.reference, ke.reference, {
      onMouseMove() {
        N.set("allowMouseEnter", !0);
      }
    }, ge);
    return be["aria-haspopup"] = "menu", be["aria-expanded"] = Q, be;
  }, [N, Te.reference, he.reference, ke.reference, ge, Q]), He = y.useMemo(() => {
    const be = bn(he.trigger, ke.trigger, ge);
    return be["aria-haspopup"] = "menu", be["aria-expanded"] = !1, be;
  }, [he.trigger, ke.trigger, ge]), ae = y.useMemo(() => bn(aa, {
    id: _,
    role: "menu",
    "aria-labelledby": X?.id,
    onMouseMove() {
      N.set("allowMouseEnter", !0), V.type === "menu" && N.set("hoverEnabled", !1);
    },
    onClick() {
      N.select("hoverEnabled") && N.set("hoverEnabled", !1);
    },
    onKeyDown(be) {
      const We = N.select("keyboardEventRelay");
      We && !be.isPropagationStopped() && We(be);
    }
  }, Te.floating, he.floating, ke.floating), [X, _, V.type, N, Te.floating, he.floating, ke.floating]), pe = he.item ?? bt;
  Qc(N, {
    floatingRootContext: fe,
    activeTriggerProps: Oe,
    inactiveTriggerProps: He,
    popupProps: ae,
    itemProps: pe
  });
  const Ue = y.useMemo(() => ({
    store: N,
    parent: j
  }), [N, j]), ve = /* @__PURE__ */ x.jsx(Sx.Provider, {
    value: Ue,
    children: typeof a == "function" ? a({
      payload: B
    }) : a
  });
  return V.type === void 0 || V.type === "context-menu" ? /* @__PURE__ */ x.jsx(_0, {
    externalTree: G,
    children: ve
  }) : ve;
});
function gM(n) {
  const o = ml().store, a = y.useMemo(() => ({
    parentMenu: o
  }), [o]);
  return /* @__PURE__ */ x.jsx(Dx.Provider, {
    value: a,
    children: /* @__PURE__ */ x.jsx(jx, {
      ...n
    })
  });
}
function kx(n) {
  const o = n.getBoundingClientRect(), a = Dt(n);
  if (kp)
    return o;
  const i = a.getComputedStyle(n, "::before"), u = a.getComputedStyle(n, "::after");
  if (!(i.content !== "none" || u.content !== "none"))
    return o;
  const p = parseFloat(i.width) || 0, g = parseFloat(i.height) || 0, m = parseFloat(u.width) || 0, d = parseFloat(u.height) || 0, v = Math.max(o.width, p, m), b = Math.max(o.height, g, d), S = v - o.width, R = b - o.height;
  return {
    left: o.left - S / 2,
    right: o.right + S / 2,
    top: o.top - R / 2,
    bottom: o.bottom + R / 2
  };
}
function mM(n = {}) {
  const {
    highlightItemOnHover: o,
    highlightedIndex: a,
    onHighlightedIndexChange: i
  } = Mp(), {
    ref: u,
    index: f
  } = Ci(n), p = a === f, g = y.useRef(null), m = Eo(u, g);
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
function _x(n) {
  const {
    render: o,
    className: a,
    style: i,
    state: u = bt,
    props: f = Gl,
    refs: p = Gl,
    metadata: g,
    stateAttributesMapping: m,
    tag: d = "div",
    ...v
  } = n, {
    compositeProps: b,
    compositeRef: S
  } = mM({
    metadata: g
  });
  return nt(d, n, {
    state: u,
    ref: [...p, S],
    props: [b, ...f, v],
    stateAttributesMapping: m
  });
}
function Hx(n) {
  if (Rt(n) && n.hasAttribute("data-rootownerid"))
    return n.getAttribute("data-rootownerid") ?? void 0;
  if (!Bl(n))
    return Hx(Yl(n));
}
function Ux(n, o) {
  const a = y.useRef(null);
  function i(f) {
    gl.flushSync(() => {
      n.setOpen(!1, Ye(To, f.nativeEvent, f.currentTarget));
    }), zR(a.current)?.focus();
  }
  function u(f) {
    const p = n.select("positionerElement");
    if (p && $r(f, p))
      n.context.beforeContentFocusGuardRef.current?.focus();
    else {
      gl.flushSync(() => {
        n.setOpen(!1, Ye(To, f.nativeEvent, f.currentTarget));
      });
      let g = AR(n.context.triggerFocusTargetRef.current || o.current);
      for (; g !== null && Le(p, g); ) {
        const m = g;
        if (g = Pp(g), g === m)
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
function hM(n) {
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
  } : bt, [o, a, i]);
}
const Ws = 2, yM = X0(function(o, a) {
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
    payload: R,
    ...w
  } = o, M = ml(!0), E = S?.store ?? M?.store;
  if (!E)
    throw new Error(At(85));
  const A = Bn(m), O = E.useState("isTriggerActive", A), z = E.useState("floatingRootContext"), D = E.useState("isOpenedByTrigger", A), j = E.useState("triggerPopupId", A), N = y.useRef(null), U = bM(), _ = Mp(!0), G = No(), k = y.useMemo(() => G ?? new Gp(), [G]), ee = qp(k), Q = Kl(), {
    registerTrigger: X,
    isMountedByThisTrigger: Z
  } = Wp(A, N, E, {
    payload: R,
    closeDelay: b,
    parent: U,
    floatingTreeRoot: k,
    floatingNodeId: ee,
    floatingParentNodeId: Q,
    keyboardEventRelay: _?.relayKeyboardEvent
  }), q = U.type === "menubar", H = E.useState("disabled"), Y = p || H || q && U.context.disabled, {
    getButtonProps: V,
    buttonRef: K
  } = Oo({
    disabled: Y,
    native: g
  });
  y.useEffect(() => {
    !D && U.type === void 0 && (E.context.allowMouseUpTriggerRef.current = !1);
  }, [E, D, U.type]);
  const B = y.useRef(null), C = an(), L = ze((he) => {
    if (!B.current)
      return;
    C.clear(), E.context.allowMouseUpTriggerRef.current = !1;
    const Se = he.target;
    if (Le(B.current, Se) || Le(E.select("positionerElement"), Se) || Se === B.current || Se != null && Hx(Se) === E.select("rootId"))
      return;
    const Te = kx(B.current);
    he.clientX >= Te.left - Ws && he.clientX <= Te.right + Ws && he.clientY >= Te.top - Ws && he.clientY <= Te.bottom + Ws || k.events.emit("close", {
      domEvent: he,
      reason: s0
    });
  });
  y.useEffect(() => {
    D && E.select("lastOpenChangeReason") === Pt && tt(B.current).addEventListener("mouseup", L, {
      once: !0
    });
  }, [D, L, E]);
  const ne = q && U.context.hasSubmenuOpen, re = $c(z, {
    enabled: (d ?? ne) && !Y && U.type !== "context-menu" && (!q || ne && !Z),
    handleClose: eu({
      blockPointerEvents: !q
    }),
    mouseOnly: !0,
    move: !1,
    restMs: U.type === void 0 ? v : void 0,
    delay: {
      close: b
    },
    triggerElementRef: N,
    externalTree: k,
    isActiveTrigger: O,
    isClosing: () => E.select("transitionStatus") === "ending"
  }), ie = vM(D, E.select("lastOpenChangeReason")), oe = Pc(z, {
    enabled: !Y && U.type !== "context-menu",
    event: D && q ? "click" : "mousedown",
    toggle: !0,
    ignoreMouse: !1,
    stickIfOpen: U.type === void 0 ? ie : !1
  }), se = ex(z, {
    enabled: !Y && ne
  }), ge = hM({
    open: D,
    enabled: q,
    mouseDownAction: "open"
  }), je = y.useMemo(() => bn(se.reference, oe.reference), [se.reference, oe.reference]), Ee = E.useState("triggerProps", Z), {
    preFocusGuardRef: fe,
    handlePreFocusGuardFocus: ye,
    handleFocusTargetFocus: Re
  } = Ux(E, N), _e = {
    disabled: Y,
    open: D
  }, ke = [B, a, K, X, N], we = [je, re ?? bt, Ee, {
    "aria-haspopup": "menu",
    "aria-controls": j,
    id: A,
    onMouseDown: (he) => {
      if (E.select("open"))
        return;
      C.start(200, () => {
        E.context.allowMouseUpTriggerRef.current = !0;
      }), tt(he.currentTarget).addEventListener("mouseup", L, {
        once: !0
      });
    }
  }, q ? {
    role: "menuitem"
  } : {}, ge, w, V], Ce = nt("button", o, {
    enabled: !q,
    stateAttributesMapping: Tc,
    state: _e,
    ref: ke,
    props: we
  });
  return q ? /* @__PURE__ */ x.jsx(_x, {
    tag: "button",
    render: i,
    className: u,
    style: f,
    state: _e,
    refs: ke,
    props: we,
    stateAttributesMapping: Tc
  }) : D ? /* @__PURE__ */ x.jsxs(y.Fragment, {
    children: [/* @__PURE__ */ x.jsx(Ro, {
      ref: fe,
      onFocus: ye
    }, `${A}-pre-focus-guard`), /* @__PURE__ */ x.jsx(y.Fragment, {
      children: Ce
    }, A), /* @__PURE__ */ x.jsx(Ro, {
      ref: E.context.triggerFocusTargetRef,
      onFocus: Re
    }, `${A}-post-focus-guard`)]
  }) : /* @__PURE__ */ x.jsx(y.Fragment, {
    children: Ce
  }, A);
});
function vM(n, o) {
  const a = an(), [i, u] = y.useState(!1);
  return xe(() => {
    n && o === "trigger-hover" ? (u(!0), a.start(R0, () => {
      u(!1);
    })) : n || (a.clear(), u(!1));
  }, [n, o, a]), i;
}
function bM() {
  const n = iu(!0), o = ml(!0), a = zx();
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
function xM(n) {
  const [o, a] = y.useState({
    current: n,
    previous: null
  });
  return n !== o.current && a({
    current: n,
    previous: o.current
  }), o.previous;
}
const Lx = /* @__PURE__ */ y.forwardRef(function(o, a) {
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
function Ix(n) {
  return n == null || n.hasAttribute("disabled") || n.getAttribute("aria-disabled") === "true";
}
const SM = /* @__PURE__ */ y.forwardRef(function(o, a) {
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
    ...R
  } = o, w = Ci({
    label: p
  }), M = au(), {
    store: E
  } = ml(), A = Bn(g), O = E.useState("open"), z = E.useState("floatingRootContext"), D = E.useState("floatingTreeRoot"), j = E.useState("triggerPopupId", A), N = Z0(A, E), U = y.useCallback((oe) => {
    const se = N(oe);
    return oe !== null && E.select("open") && E.select("activeTriggerId") == null && E.update({
      activeTriggerId: A,
      activeTriggerElement: oe,
      closeDelay: b
    }), se;
  }, [N, b, E, A]), _ = y.useRef(null), G = y.useCallback((oe) => {
    _.current = oe, E.set("activeTriggerElement", oe);
  }, [E]), k = Nx();
  if (!k?.parentMenu)
    throw new Error(At(37));
  E.useSyncedValue("closeDelay", b);
  const ee = k.parentMenu, Q = E.useState("disabled"), X = ee.useState("disabled"), Z = S || Q || X, q = ee.useState("itemProps"), H = ee.useState("isActive", w.index), Y = y.useMemo(() => ({
    type: "submenu-trigger",
    setActive() {
      ee.select("highlightItemOnHover") && ee.set("activeIndex", w.index);
    }
  }), [ee, w.index]), {
    getItemProps: V,
    itemRef: K
  } = ag({
    closeOnClick: !1,
    disabled: Z,
    highlighted: H,
    id: A,
    store: E,
    typingRef: ee.context.typingRef,
    nativeButton: m,
    itemMetadata: Y,
    nodeId: M?.context.nodeId
  }), B = E.useState("hoverEnabled"), C = $c(z, {
    enabled: B && d && !Z,
    handleClose: eu({
      blockPointerEvents: !0
    }),
    mouseOnly: !0,
    move: !0,
    restMs: v,
    delay: {
      open: v,
      close: b
    },
    shouldOpen: v > 0 ? () => ee.select("allowMouseEnter") : void 0,
    triggerElementRef: _,
    externalTree: D,
    isClosing: () => E.select("transitionStatus") === "ending"
  }), ne = Pc(z, {
    enabled: !Z,
    event: "mousedown",
    toggle: !d,
    ignoreMouse: d,
    stickIfOpen: !1
  }).reference ?? bt, J = E.useState("triggerProps", !0);
  return delete J.id, nt("div", o, {
    state: {
      disabled: Z,
      highlighted: H,
      open: O
    },
    stateAttributesMapping: tu,
    props: [ne, C, J, q, {
      "aria-controls": j,
      tabIndex: O || H ? 0 : -1,
      onBlur() {
        H && ee.set("activeIndex", null);
      }
    }, R, V],
    ref: [a, w.ref, K, U, G]
  });
});
function qd({ ...n }) {
  return /* @__PURE__ */ x.jsx(jx, { "data-slot": "dropdown-menu", ...n });
}
function Xd({ ...n }) {
  return /* @__PURE__ */ x.jsx(yM, { "data-slot": "dropdown-menu-trigger", ...n });
}
function cc({
  align: n = "start",
  alignOffset: o = 0,
  side: a = "bottom",
  sideOffset: i = 4,
  className: u,
  ...f
}) {
  return /* @__PURE__ */ x.jsx(eM, { children: /* @__PURE__ */ x.jsx(
    uM,
    {
      className: "tw:isolate tw:z-[var(--z-popover)] tw:outline-none",
      align: n,
      alignOffset: o,
      side: a,
      sideOffset: i,
      children: /* @__PURE__ */ x.jsx(
        $O,
        {
          "data-slot": "dropdown-menu-content",
          className: Ke("tw:max-h-(--available-height) tw:w-(--anchor-width) tw:min-w-32 tw:origin-(--transform-origin) tw:overflow-x-hidden tw:overflow-y-auto tw:rounded-[var(--radius-control)] tw:bg-popover tw:p-1 tw:text-[var(--fs-body-s)] tw:text-popover-foreground tw:shadow-md tw:ring-1 tw:ring-foreground/10 tw:outline-none", u),
          ...f
        }
      )
    }
  ) });
}
function er({ ...n }) {
  return /* @__PURE__ */ x.jsx(FO, { "data-slot": "dropdown-menu-group", ...n });
}
function wM({
  className: n,
  inset: o,
  ...a
}) {
  return /* @__PURE__ */ x.jsx(
    KO,
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
    QO,
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
function EM({ ...n }) {
  return /* @__PURE__ */ x.jsx(gM, { "data-slot": "dropdown-menu-sub", ...n });
}
function TM({
  className: n,
  inset: o,
  children: a,
  ...i
}) {
  return /* @__PURE__ */ x.jsxs(
    SM,
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
        /* @__PURE__ */ x.jsx(Wd, { className: "tw:ml-auto" })
      ]
    }
  );
}
function RM({
  align: n = "start",
  alignOffset: o = -3,
  side: a = "right",
  sideOffset: i = 0,
  className: u,
  ...f
}) {
  return /* @__PURE__ */ x.jsx(
    cc,
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
function CM({
  className: n,
  children: o,
  checked: a,
  inset: i,
  ...u
}) {
  return /* @__PURE__ */ x.jsxs(
    GO,
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
            children: /* @__PURE__ */ x.jsx(qO, { children: /* @__PURE__ */ x.jsx(
              uc,
              {}
            ) })
          }
        ),
        o
      ]
    }
  );
}
function Fd({
  className: n,
  ...o
}) {
  return /* @__PURE__ */ x.jsx(
    Lx,
    {
      "data-slot": "dropdown-menu-separator",
      className: Ke("tw:-mx-1 tw:my-1 tw:h-px tw:bg-border", n),
      ...o
    }
  );
}
let mb = /* @__PURE__ */ (function(n) {
  return n.disabled = "data-disabled", n.valid = "data-valid", n.invalid = "data-invalid", n.touched = "data-touched", n.dirty = "data-dirty", n.filled = "data-filled", n.focused = "data-focused", n;
})({});
const OM = {
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
}, ai = {
  valid: null,
  touched: !1,
  dirty: !1,
  filled: !1,
  focused: !1
}, MM = {
  disabled: !1,
  ...ai
}, Bx = {
  valid(n) {
    return n === null ? null : n ? {
      [mb.valid]: ""
    } : {
      [mb.invalid]: ""
    };
  }
}, AM = {
  invalid: void 0,
  name: void 0,
  validityData: {
    state: OM,
    errors: [],
    error: "",
    value: "",
    initialValue: null
  },
  setValidityData: rn,
  disabled: void 0,
  touched: ai.touched,
  setTouched: rn,
  dirty: ai.dirty,
  setDirty: rn,
  filled: ai.filled,
  setFilled: rn,
  focused: ai.focused,
  setFocused: rn,
  validate: () => null,
  validationMode: "onSubmit",
  validationDebounceTime: 0,
  shouldValidateOnChange: () => !1,
  state: MM,
  markedDirtyRef: {
    current: !1
  },
  registerFieldControl: rn,
  validation: {
    getValidationProps: (n, o = bt) => o,
    inputRef: {
      current: null
    },
    registerInput: rn,
    commit: async () => {
    },
    change: rn
  }
}, zM = /* @__PURE__ */ y.createContext(AM);
function du(n = !0) {
  const o = y.useContext(zM);
  if (o.setValidityData === rn && !n)
    throw new Error(At(28));
  return o;
}
const DM = /* @__PURE__ */ y.createContext({
  formRef: {
    current: {
      fields: /* @__PURE__ */ new Map()
    }
  },
  errors: {},
  clearErrors: rn,
  validationMode: "onSubmit",
  submitAttemptedRef: {
    current: !1
  }
});
function Vx() {
  return y.useContext(DM);
}
const NM = /* @__PURE__ */ y.createContext({
  controlId: void 0,
  registerControlId: rn,
  labelId: void 0,
  setLabelId: rn,
  messageIds: [],
  setMessageIds: rn,
  getDescriptionProps: (n) => n
});
function fg() {
  return y.useContext(NM);
}
function dg(n = {}) {
  const {
    id: o,
    implicit: a = !1,
    controlRef: i
  } = n, {
    controlId: u,
    registerControlId: f
  } = fg(), p = Bn(o), g = a ? u : void 0, m = xn(() => /* @__PURE__ */ Symbol("labelable-control")), d = y.useRef(!1), v = y.useRef(o != null), b = ze(() => {
    !d.current || f === rn || (d.current = !1, f(m.current, void 0));
  });
  return xe(() => {
    if (f === rn)
      return;
    let S;
    if (a) {
      const R = i?.current;
      $e(R) && R.closest("label") != null ? S = o ?? null : S = g ?? p;
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
function Px(n, o, a, i, u = !0, f) {
  const {
    registerFieldControl: p
  } = du(), g = y.useRef(null);
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
const jM = /* @__PURE__ */ y.forwardRef(function(o, a) {
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
    ...R
  } = o, {
    state: w,
    name: M,
    disabled: E,
    setTouched: A,
    setDirty: O,
    validityData: z,
    setFocused: D,
    setFilled: j,
    validationMode: N,
    validation: U
  } = du(), {
    clearErrors: _
  } = Vx(), G = E || m, k = M ?? p, ee = {
    ...w,
    disabled: G
  }, {
    labelId: Q
  } = fg(), X = dg({
    id: f
  });
  xe(() => {
    const B = g != null;
    U.inputRef.current?.value || B && g !== "" ? j(!0) : B && g === "" && j(!1);
  }, [U.inputRef, j, g]);
  const Z = y.useRef(null);
  xe(() => {
    b && Z.current === vn(tt(Z.current)) && D(!0);
  }, [b, D]);
  const [q] = oa({
    controlled: g,
    default: v,
    name: "FieldControl",
    state: "value"
  }), H = g !== void 0, Y = H ? q : void 0, V = ze(() => U.inputRef.current?.value);
  return Px(U.inputRef, X, Y, V, !G, p), nt("input", o, {
    ref: [a, Z],
    state: ee,
    props: [{
      id: X,
      disabled: G,
      name: k,
      ref: U.inputRef,
      "aria-labelledby": Q,
      autoFocus: b,
      ...H ? {
        value: Y
      } : {
        defaultValue: v
      },
      onChange(B) {
        const C = B.currentTarget.value;
        d?.(C, Ye(zo, B.nativeEvent)), O(C !== z.initialValue), j(C !== ""), B.nativeEvent.defaultPrevented || (_(k), U.change(C));
      },
      onFocus() {
        D(!0);
      },
      onBlur(B) {
        A(!0), D(!1), N === "onBlur" && U.commit(B.currentTarget.value);
      },
      onKeyDown(B) {
        B.currentTarget.tagName === "INPUT" && B.key === "Enter" && (A(!0), U.commit(B.currentTarget.value));
      }
    }, R, (B) => U.getValidationProps(G, B)],
    stateAttributesMapping: Bx
  });
}), kM = /* @__PURE__ */ y.forwardRef(function(o, a) {
  return /* @__PURE__ */ x.jsx(jM, {
    ref: a,
    ...o
  });
});
function _M({ className: n, type: o, ...a }) {
  return /* @__PURE__ */ x.jsx(
    kM,
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
function mp({ className: n, ...o }) {
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
const HM = ra(
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
function Oc({
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
      className: Ke(HM({ align: o }), n),
      onClick: (i) => {
        i.target.closest("button") || i.currentTarget.parentElement?.querySelector("input, textarea")?.focus();
      },
      ...a
    }
  );
}
const UM = ra(
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
function Yx({
  className: n,
  type: o = "button",
  variant: a = "ghost",
  size: i = "xs",
  ...u
}) {
  return /* @__PURE__ */ x.jsx(
    Mt,
    {
      type: o,
      "data-size": i,
      variant: a,
      className: Ke(UM({ size: i }), n),
      ...u
    }
  );
}
function hp({
  className: n,
  ...o
}) {
  return /* @__PURE__ */ x.jsx(
    _M,
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
const Gx = /* @__PURE__ */ y.createContext(void 0);
function fr(n) {
  const o = y.useContext(Gx);
  if (o === void 0 && !n)
    throw new Error(At(47));
  return o;
}
function LM() {
  return {
    ...Zc(),
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
const IM = {
  ...Jc,
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
class pg extends Ti {
  constructor(o, a, i = !1) {
    const u = {
      ...LM(),
      ...o
    }, f = new ia();
    u.open && o?.mounted === void 0 && (u.mounted = !0), u.floatingRootContext = eg(f, a, i), super(u, {
      popupRef: /* @__PURE__ */ y.createRef(),
      backdropRef: /* @__PURE__ */ y.createRef(),
      internalBackdropRef: /* @__PURE__ */ y.createRef(),
      onOpenChange: void 0,
      onOpenChangeComplete: void 0,
      triggerFocusTargetRef: /* @__PURE__ */ y.createRef(),
      beforeContentFocusGuardRef: /* @__PURE__ */ y.createRef(),
      stickIfOpenTimeout: new el(),
      triggerElements: f
    }, IM);
  }
  setOpen = (o, a) => {
    const i = a.reason === Pt, u = a.reason === ql && a.event.detail === 0, f = !o && (a.reason === Si || a.reason == null), p = Jp(a), g = this.select("activeTriggerId");
    if (!o && a.reason === i0 && a.trigger == null && g != null && (a.trigger = this.context.triggerElements.getById(g) ?? this.select("activeTriggerElement") ?? void 0), this.context.onOpenChange?.(o, a), a.isCanceled)
      return;
    this.state.floatingRootContext.dispatchOpenChange(o, a);
    const m = () => {
      const d = {
        open: o,
        openChangeReason: a.reason
      };
      Xc(d, o, a.trigger, p()), this.update(d);
    };
    i ? (this.set("stickIfOpen", !0), this.context.stickIfOpenTimeout.start(R0, () => {
      this.set("stickIfOpen", !1);
    }), gl.flushSync(m)) : m(), u || f ? this.set("instantType", u ? "click" : "dismiss") : a.reason === To ? this.set("instantType", "focus") : this.set("instantType", void 0);
  };
  static useStore(o, a) {
    const {
      store: i,
      internalStore: u
    } = Zp(o, (f, p) => new pg(a, f, p));
    return y.useEffect(() => u?.disposeEffect(), [u]), i;
  }
  disposeEffect = () => this.context.stickIfOpenTimeout.disposeEffect();
}
function hb({
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
  } = n, v = pg.useStore(g?.store, {
    modal: p,
    open: i,
    openProp: a,
    activeTriggerId: d,
    triggerIdProp: m
  });
  $p(v, a, i, d), v.useControlledProp("openProp", a), v.useControlledProp("triggerIdProp", m);
  const b = v.useState("open"), S = v.useState("mounted"), R = v.useState("payload"), w = Kl() != null;
  v.useContextCallback("onOpenChange", u), v.useContextCallback("onOpenChangeComplete", f), J0(v, b), Fc(v);
  const {
    forceUnmount: M
  } = Kc(b, v, () => {
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
  const E = y.useCallback(() => {
    v.setOpen(!1, Ye(Lc));
  }, [v]);
  y.useImperativeHandle(n.actionsRef, () => ({
    unmount: M,
    close: E
  }), [M, E]);
  const A = b || S, O = y.useMemo(() => ({
    store: v
  }), [v]);
  return /* @__PURE__ */ x.jsxs(Gx.Provider, {
    value: O,
    children: [A && /* @__PURE__ */ x.jsx(VM, {
      store: v,
      modal: p
    }), typeof o == "function" ? o({
      payload: R
    }) : o]
  });
}
function BM(n) {
  return fr(!0) ? /* @__PURE__ */ x.jsx(hb, {
    props: n
  }) : /* @__PURE__ */ x.jsx(_0, {
    children: /* @__PURE__ */ x.jsx(hb, {
      props: n
    })
  });
}
function VM({
  store: n,
  modal: o
}) {
  const a = n.useState("floatingRootContext"), i = Ei(a, {
    outsidePressEvent: {
      // Ensure `aria-hidden` on outside elements is removed immediately
      // on outside press when trapping focus.
      mouse: o === "trap-focus" ? "sloppy" : "intentional",
      touch: "sloppy"
    }
  }), u = i.reference ?? bt, f = i.trigger ?? bt, p = y.useMemo(() => bn(aa, i.floating), [i.floating]);
  return Qc(n, {
    activeTriggerProps: u,
    inactiveTriggerProps: f,
    popupProps: p
  }), null;
}
const PM = 300, YM = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    disabled: p = !1,
    nativeButton: g = !0,
    handle: m,
    payload: d,
    openOnHover: v = !1,
    delay: b = PM,
    closeDelay: S = 0,
    id: R,
    ...w
  } = o, M = fr(!0), E = m?.store ?? M?.store;
  if (!E)
    throw new Error(At(74));
  const A = Bn(R), O = E.useState("isTriggerActive", A), z = E.useState("floatingRootContext"), D = E.useState("isOpenedByTrigger", A), j = E.useState("triggerPopupId", A), N = y.useRef(null), {
    registerTrigger: U,
    isMountedByThisTrigger: _
  } = Wp(A, N, E, {
    payload: d,
    disabled: p,
    openOnHover: v,
    closeDelay: S
  }), G = E.useState("openChangeReason"), k = E.useState("stickIfOpen"), ee = E.useState("openMethod"), Q = E.useState("focusManagerModal"), X = $c(z, {
    enabled: !p && z != null && v && (ee !== "touch" || G !== ql),
    mouseOnly: !0,
    move: !1,
    handleClose: eu(),
    restMs: b,
    delay: {
      close: S
    },
    triggerElementRef: N,
    isActiveTrigger: O,
    isClosing: () => E.select("transitionStatus") === "ending"
  }), Z = Pc(z, {
    enabled: z != null,
    stickIfOpen: k
  }), q = vx(() => E.select("open"), (re) => {
    E.set("openMethod", re);
  }), H = E.useState("triggerProps", _), {
    getButtonProps: Y,
    buttonRef: V
  } = Oo({
    disabled: p,
    native: g
  }), K = {
    open(re) {
      return re && G === ql ? Tc.open(re) : tu.open(re);
    }
  }, {
    preFocusGuardRef: B,
    handlePreFocusGuardFocus: C,
    handleFocusTargetFocus: L
  } = Ux(E, N), J = nt("button", o, {
    state: {
      disabled: p,
      open: D
    },
    ref: [V, a, U, N],
    props: [Z.reference, X, H, q, {
      [C0]: "",
      id: A,
      "aria-haspopup": "dialog",
      "aria-expanded": D,
      "aria-controls": j
    }, w, Y],
    stateAttributesMapping: K
  });
  return _ && !Q ? /* @__PURE__ */ x.jsxs(y.Fragment, {
    children: [/* @__PURE__ */ x.jsx(Ro, {
      ref: B,
      onFocus: C
    }), /* @__PURE__ */ x.jsx(y.Fragment, {
      children: J
    }, A), /* @__PURE__ */ x.jsx(Ro, {
      ref: E.context.triggerFocusTargetRef,
      onFocus: L
    })]
  }) : /* @__PURE__ */ x.jsx(y.Fragment, {
    children: J
  }, A);
}), qx = /* @__PURE__ */ y.createContext(void 0);
function GM() {
  const n = y.useContext(qx);
  if (n === void 0)
    throw new Error(At(45));
  return n;
}
const qM = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    keepMounted: i = !1,
    ...u
  } = o, {
    store: f
  } = fr();
  return f.useState("mounted") || i ? /* @__PURE__ */ x.jsx(qx.Provider, {
    value: i,
    children: /* @__PURE__ */ x.jsx(Bc, {
      ref: a,
      ...u
    })
  }) : null;
}), Xx = /* @__PURE__ */ y.createContext(void 0);
function XM() {
  const n = y.useContext(Xx);
  if (!n)
    throw new Error(At(46));
  return n;
}
const FM = /* @__PURE__ */ y.forwardRef(function(o, a) {
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
    collisionPadding: R = 5,
    arrowPadding: w = 5,
    sticky: M = !1,
    disableAnchorTracking: E = !1,
    collisionAvoidance: A = Yp,
    ...O
  } = o, {
    store: z
  } = fr(), D = GM(), j = qp(), N = z.useState("floatingRootContext"), U = z.useState("mounted"), _ = z.useState("open"), G = z.useState("openChangeReason"), k = z.useState("activeTriggerElement"), ee = z.useState("modal"), Q = z.useState("openMethod"), X = z.useState("positionerElement"), Z = z.useState("instantType"), q = z.useState("transitionStatus"), H = z.useState("hasViewport"), Y = y.useRef(null), V = Qp(X, !1, !1), K = uu({
    anchor: p,
    floatingRootContext: N,
    positionMethod: g,
    mounted: U,
    side: m,
    sideOffset: v,
    align: d,
    alignOffset: b,
    arrowPadding: w,
    collisionBoundary: S,
    collisionPadding: R,
    sticky: M,
    disableAnchorTracking: E,
    keepMounted: D,
    nodeId: j,
    collisionAvoidance: A,
    adaptiveOrigin: H ? ig : void 0
  }), B = N.useState("domReferenceElement");
  xe(() => {
    const J = B, re = Y.current;
    if (J && (Y.current = J), re && J && J !== re) {
      z.set("instantType", void 0);
      const ie = new AbortController();
      return V(() => {
        z.set("instantType", "trigger-change");
      }, ie.signal), () => {
        ie.abort();
      };
    }
  }, [B, V, z]), cg(_ && ee === !0 && G !== Pt, Q === "touch", X, k);
  const C = y.useCallback((J) => {
    z.set("positionerElement", J);
  }, [z]), L = {
    open: _,
    side: K.side,
    align: K.align,
    anchorHidden: K.anchorHidden,
    instant: Z
  }, ne = fu(o, L, {
    styles: K.positionerStyles,
    transitionStatus: q,
    props: O,
    refs: [a, C],
    hidden: !U,
    inert: !_
  });
  return /* @__PURE__ */ x.jsxs(Xx.Provider, {
    value: K,
    children: [U && ee === !0 && G !== Pt && /* @__PURE__ */ x.jsx(ru, {
      ref: z.context.internalBackdropRef,
      inert: ou(!_),
      cutout: k
    }), /* @__PURE__ */ x.jsx(k0, {
      id: j,
      children: ne
    })]
  });
}), KM = /* @__PURE__ */ y.createContext(void 0);
function QM() {
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
function ZM(n) {
  const {
    value: o,
    children: a
  } = n;
  return /* @__PURE__ */ x.jsx(KM.Provider, {
    value: o,
    children: a
  });
}
const JM = {
  ...ko,
  ...jo
}, $M = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    initialFocus: p,
    finalFocus: g,
    ...m
  } = o, {
    store: d
  } = fr(), v = XM(), b = su() != null, {
    context: S,
    hasClosePart: R
  } = QM(), w = d.useState("open"), M = d.useState("openMethod"), E = d.useState("instantType"), A = d.useState("transitionStatus"), O = d.useState("popupProps"), z = d.useState("titleElementId"), D = d.useState("descriptionElementId"), j = d.useState("modal"), N = d.useState("mounted"), U = d.useState("openChangeReason"), _ = d.useState("activeTriggerElement"), G = d.useState("floatingRootContext"), k = G.useState("floatingId"), ee = d.useState("disabled"), Q = d.useState("openOnHover"), X = d.useState("closeDelay"), Z = m.id ?? k;
  Ql({
    open: w,
    ref: d.context.popupRef,
    onComplete() {
      w && d.context.onOpenChangeComplete?.(!0);
    }
  }), og(G, {
    enabled: Q && !ee,
    closeDelay: X
  });
  const q = p === void 0 ? Q0(d.context.popupRef) : p, H = j !== !1 && R;
  d.useSyncedValue("focusManagerModal", H);
  const Y = y.useCallback((B) => {
    d.set("popupElement", B);
  }, [d]), V = {
    open: w,
    side: v.side,
    align: v.align,
    instant: E,
    transitionStatus: A
  }, K = nt("div", o, {
    state: V,
    ref: [a, d.context.popupRef, Y],
    props: [O, {
      id: Z,
      role: "dialog",
      ...aa,
      "aria-labelledby": z,
      "aria-describedby": D,
      onKeyDown(B) {
        b && Ri.has(B.key) && B.stopPropagation();
      }
    }, Oi(A), m],
    stateAttributesMapping: JM
  });
  return /* @__PURE__ */ x.jsx(Vc, {
    context: G,
    openInteractionType: M,
    modal: H,
    disabled: !N || U === Pt,
    initialFocus: q,
    returnFocus: g,
    restoreFocus: "popup",
    previousFocusableElement: Rt(_) ? _ : void 0,
    nextFocusableElement: d.context.triggerFocusTargetRef,
    beforeContentFocusGuardRef: d.context.beforeContentFocusGuardRef,
    children: /* @__PURE__ */ x.jsx(ZM, {
      value: S,
      children: K
    })
  });
}), WM = /* @__PURE__ */ y.forwardRef(function(o, a) {
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
}), e2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
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
function yb({ ...n }) {
  return /* @__PURE__ */ x.jsx(BM, { "data-slot": "popover", ...n });
}
function vb({ ...n }) {
  return /* @__PURE__ */ x.jsx(YM, { "data-slot": "popover-trigger", ...n });
}
function bb({
  className: n,
  align: o = "center",
  alignOffset: a = 0,
  side: i = "bottom",
  sideOffset: u = 4,
  portalContainer: f,
  positionerClassName: p,
  ...g
}) {
  return /* @__PURE__ */ x.jsx(qM, { container: f, children: /* @__PURE__ */ x.jsx(
    FM,
    {
      align: o,
      alignOffset: a,
      side: i,
      sideOffset: u,
      className: Ke("tw:isolate tw:z-[var(--z-popover)]", p),
      children: /* @__PURE__ */ x.jsx(
        $M,
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
function t2({ className: n, ...o }) {
  return /* @__PURE__ */ x.jsx(
    "div",
    {
      "data-slot": "popover-header",
      className: Ke("tw:flex tw:flex-col tw:gap-0.5 tw:text-[var(--fs-body-s)]", n),
      ...o
    }
  );
}
function yp({ className: n, ...o }) {
  return /* @__PURE__ */ x.jsx(
    WM,
    {
      "data-slot": "popover-title",
      className: Ke("tw:font-medium", n),
      ...o
    }
  );
}
function vp({
  className: n,
  ...o
}) {
  return /* @__PURE__ */ x.jsx(
    e2,
    {
      "data-slot": "popover-description",
      className: Ke("tw:text-muted-foreground", n),
      ...o
    }
  );
}
function li({
  className: n,
  orientation: o = "horizontal",
  ...a
}) {
  return /* @__PURE__ */ x.jsx(
    Lx,
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
const Fx = /* @__PURE__ */ y.createContext(null), Kx = /* @__PURE__ */ y.createContext(null);
function Zl() {
  const n = y.useContext(Fx);
  if (n === null)
    throw new Error(At(60));
  return n;
}
function Qx() {
  const n = y.useContext(Kx);
  if (n === null)
    throw new Error(At(61));
  return n;
}
const n2 = (n, o) => Object.is(n, o);
function ir(n, o, a) {
  return n == null || o == null ? Object.is(n, o) : a(n, o);
}
function l2(n, o, a) {
  return !n || n.length === 0 ? !1 : n.some((i) => i === void 0 ? !1 : ir(o, i, a));
}
function gi(n, o, a) {
  return !n || n.length === 0 ? -1 : n.findIndex((i) => i === void 0 ? !1 : ir(i, o, a));
}
function o2(n, o, a) {
  return n.filter((i) => !ir(o, i, a));
}
function bp(n) {
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
function Zx(n) {
  return n != null && n.length > 0 && typeof n[0] == "object" && n[0] != null && "items" in n[0];
}
function r2(n) {
  if (!Array.isArray(n))
    return n != null && "null" in n;
  const o = n;
  if (Zx(o)) {
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
function Jx(n, o) {
  if (o && n != null)
    return o(n) ?? "";
  if (n && typeof n == "object") {
    if ("label" in n && n.label != null)
      return String(n.label);
    if ("value" in n)
      return String(n.value);
  }
  return bp(n);
}
function nr(n, o) {
  return o && n != null ? o(n) ?? "" : n && typeof n == "object" && "value" in n && "label" in n ? bp(n.value) : bp(n);
}
function $x(n, o, a) {
  function i() {
    return Jx(n, a);
  }
  if (a && n != null)
    return a(n);
  if (n && typeof n == "object" && "label" in n && n.label != null)
    return n.label;
  if (o && !Array.isArray(o))
    return o[n] ?? i();
  if (Array.isArray(o)) {
    const u = o, f = Zx(u) ? u.flatMap((p) => p.items) : u;
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
function a2(n, o, a) {
  return n.reduce((i, u, f) => (f > 0 && i.push(", "), i.push(/* @__PURE__ */ x.jsx(y.Fragment, {
    children: $x(u, o, a)
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
  hasNullItemLabel: me((n, o) => o ? r2(n.items) : !1),
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
function i2(n, o, a = (i, u) => i === u) {
  return n.length === o.length && n.every((i, u) => a(i, o[u]));
}
function ii(n, o = Number.MIN_SAFE_INTEGER, a = Number.MAX_SAFE_INTEGER) {
  return Math.max(o, Math.min(n, a));
}
const Ll = 1;
function Wx(n, o) {
  return Math.max(0, n - o);
}
function s2(n, o) {
  if (o <= 0)
    return 0;
  const a = ii(n, 0, o), i = a, u = o - a, f = i <= Ll, p = u <= Ll;
  return f && p ? i <= u ? 0 : o : f ? 0 : p ? o : a;
}
function c2(n) {
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
    required: R = !1,
    modal: w = !0,
    actionsRef: M,
    inputRef: E,
    onOpenChangeComplete: A,
    items: O,
    multiple: z = !1,
    itemToStringLabel: D,
    itemToStringValue: j,
    isItemEqualToValue: N = n2,
    highlightItemOnHover: U = !0,
    children: _
  } = n, {
    clearErrors: G
  } = Vx(), {
    setDirty: k,
    setTouched: ee,
    setFocused: Q,
    validityData: X,
    setFilled: Z,
    name: q,
    disabled: H,
    validation: Y,
    validationMode: V
  } = du(), K = dg({
    id: o
  }), B = H || b, C = q ?? m, [L, ne] = oa({
    controlled: a,
    default: z ? i ?? Gl : i,
    name: "Select",
    state: "value"
  }), [J, re] = oa({
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
  } = qc(J), {
    openMethod: Te,
    triggerProps: Oe
  } = bx(J), He = xn(() => new F0({
    id: K,
    labelId: void 0,
    modal: w,
    multiple: z,
    itemToStringLabel: D,
    itemToStringValue: j,
    isItemEqualToValue: N,
    value: L,
    open: J,
    mounted: Ce,
    transitionStatus: Se,
    items: O,
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
  })).current, ae = Pe(He, Be.activeIndex), pe = Pe(He, Be.selectedIndex), Ue = Pe(He, Be.triggerElement), ve = Pe(He, Be.positionerElement), be = xM(Te), We = Te ?? be ?? null, rt = y.useMemo(() => z ? "" : nr(L, j), [z, L, j]), pt = y.useMemo(() => z && Array.isArray(L) ? L.map((qe) => nr(qe, j)) : nr(L, j), [z, L, j]), Nt = Yt(He.state.triggerElement), et = ze(() => pt);
  Px(Nt, K, L, et, !B, m);
  const gt = y.useRef(L), zt = z ? Array.isArray(L) && L.length > 0 : L != null && nr(L, j) !== "";
  xe(() => {
    L !== gt.current && He.set("forceMount", !0);
  }, [He, L]), xe(() => {
    Z(zt);
  }, [zt, Z]), xe(function() {
    const xt = fe.current;
    let Xt;
    if (z) {
      const nn = Array.isArray(L) ? L : [];
      if (nn.length === 0)
        Xt = null;
      else {
        const Wt = nn[nn.length - 1], Ct = gi(xt, Wt, N);
        Xt = Ct === -1 ? null : Ct;
      }
    } else {
      const nn = gi(xt, L, N);
      Xt = nn === -1 ? null : nn;
    }
    Xt === null && (_e.current = null), !J && He.set("selectedIndex", Xt);
  }, [zt, z, J, L, fe, N, He, _e]);
  function mt(qe) {
    const xt = X.initialValue;
    return Array.isArray(qe) && Array.isArray(xt) ? !i2(qe, xt, (Xt, nn) => ir(Xt, nn, N)) : qe !== xt;
  }
  yx(L, () => {
    G(C), k(mt(L)), Y.change(L);
  });
  const Mn = ze((qe, xt) => {
    g?.(qe, xt), !xt.isCanceled && (re(qe), !qe && (xt.reason === To || xt.reason === Uc) && (ee(!0), Q(!1), V === "onBlur" && Y.commit(L)));
  }), An = ze(() => {
    he(!1), He.update({
      activeIndex: null,
      openMethod: null
    }), A?.(!1);
  });
  Ql({
    enabled: !M,
    open: J,
    ref: se,
    onComplete() {
      J || An();
    }
  }), y.useImperativeHandle(M, () => ({
    unmount: An
  }), [An]);
  const Qe = ze((qe, xt) => {
    u?.(qe, xt), !xt.isCanceled && ne(qe);
  }), ft = ze(() => {
    const qe = He.state.listElement || se.current;
    if (!qe)
      return;
    const xt = Wx(qe.scrollHeight, qe.clientHeight), Xt = s2(qe.scrollTop, xt), nn = Xt > 0, Wt = Xt < xt;
    He.state.scrollUpArrowVisible !== nn && He.set("scrollUpArrowVisible", nn), He.state.scrollDownArrowVisible !== Wt && He.set("scrollDownArrowVisible", Wt);
  }), It = W0({
    open: J,
    onOpenChange: Mn,
    elements: {
      reference: Ue,
      floating: ve
    }
  }), Ht = Pc(It, {
    enabled: !S && !B,
    event: "mousedown"
  }), Ut = Ei(It), jt = nx(It, {
    enabled: !S && !B,
    listRef: ie,
    activeIndex: ae,
    selectedIndex: pe,
    disabledIndices: Gl,
    onNavigate(qe) {
      qe === null && !J || He.set("activeIndex", qe);
    },
    focusItemOnHover: U
  }), Gt = lx(It, {
    enabled: !S && !B && (J || !z),
    listRef: oe,
    activeIndex: ae,
    selectedIndex: pe,
    // Skip disabled items while matching so typeahead advances to the next selectable item
    // (a click can never select a disabled item and native `<select>` skips them too). Resolve
    // the disabled state from the element via the attribute-only `isElementDisabled` so the
    // hidden, force-mounted items used for closed-trigger typeahead aren't dropped by the
    // `elementsRef`/visibility filter that `disabledIndices` deliberately sidesteps.
    disabledIndices: (qe) => Ix(ie.current[qe]),
    onMatch(qe) {
      J ? He.set("activeIndex", qe) : Qe(fe.current[qe], Ye("none"));
    },
    onTyping(qe) {
      ye.current = qe;
    }
  }), Sn = y.useMemo(() => {
    const qe = bn(Gt.reference, jt.reference, Ut.reference, Ht.reference, Oe);
    return K && (qe.id = K), qe;
  }, [Ht.reference, Gt.reference, jt.reference, Ut.reference, Oe, K]), zn = y.useMemo(() => bn(aa, Gt.floating, jt.floating, Ut.floating), [Gt.floating, jt.floating, Ut.floating]), Vn = jt.item ?? bt;
  Np(() => {
    He.update({
      popupProps: zn,
      triggerProps: Sn
    });
  }), xe(() => {
    He.update({
      id: K,
      modal: w,
      multiple: z,
      value: L,
      open: J,
      mounted: Ce,
      transitionStatus: Se,
      popupProps: zn,
      triggerProps: Sn,
      items: O,
      itemToStringLabel: D,
      itemToStringValue: j,
      isItemEqualToValue: N,
      openMethod: We
    });
  }, [He, K, w, z, L, J, Ce, Se, zn, Sn, O, D, j, N, We]);
  const qt = y.useMemo(() => ({
    store: He,
    name: C,
    required: R,
    disabled: B,
    readOnly: S,
    multiple: z,
    highlightItemOnHover: U,
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
    onOpenChangeComplete: A,
    alignItemWithTriggerActiveRef: we,
    initialValueRef: gt
  }), [He, C, R, B, S, z, U, Qe, Mn, Vn, Y, A, ft]), Pn = Eo(E, Y.inputRef), hl = z && Array.isArray(L) && L.length > 0, tl = z ? void 0 : C, yl = y.useMemo(() => !z || !Array.isArray(L) || !C ? null : L.map((qe) => {
    const xt = nr(qe, j);
    return /* @__PURE__ */ x.jsx("input", {
      type: "hidden",
      form: d,
      name: C,
      value: xt,
      disabled: B
    }, xt);
  }), [z, L, d, C, j, B]);
  return /* @__PURE__ */ x.jsx(Fx.Provider, {
    value: qt,
    children: /* @__PURE__ */ x.jsxs(Kx.Provider, {
      value: It,
      children: [_, /* @__PURE__ */ x.jsx("input", {
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
            const xt = qe.currentTarget.value, Xt = Ye(zo, qe.nativeEvent);
            function nn() {
              if (z)
                return;
              const Wt = xt.toLowerCase();
              let Ct = fe.current.findIndex((rl) => nr(rl, j).toLowerCase() === Wt || Jx(rl, D).toLowerCase() === Wt);
              Ct === -1 && (Ct = fe.current.findIndex((rl, sa) => {
                const Ai = oe.current[sa];
                return Ai != null && Ai.toLowerCase() === Wt;
              }));
              const cn = Ct === -1 ? void 0 : fe.current[Ct];
              cn != null && Qe(cn, Xt);
            }
            He.set("forceMount", !0), queueMicrotask(nn);
          }
        }),
        id: K && tl == null ? `${K}-hidden-input` : void 0,
        form: d,
        name: tl,
        autoComplete: v,
        value: rt,
        disabled: B,
        required: R && !hl,
        readOnly: S,
        ref: Pn,
        style: C ? pR : f0,
        tabIndex: -1,
        "aria-hidden": !0,
        suppressHydrationWarning: !0
      }), yl]
    })
  });
}
function u2(n, o) {
  return n ?? o;
}
const ec = 2, f2 = 400, d2 = {
  ...Tc,
  ...Bx,
  popupSide: (n) => n ? {
    "data-popup-side": n
  } : null,
  value: () => null
}, p2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
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
    state: R,
    disabled: w
  } = du(), {
    labelId: M
  } = fg(), {
    store: E,
    setOpen: A,
    selectionRef: O,
    validation: z,
    readOnly: D,
    required: j,
    alignItemWithTriggerActiveRef: N,
    disabled: U
  } = Zl(), _ = w || U || p, G = Pe(E, Be.open), k = Pe(E, Be.mounted), ee = Pe(E, Be.value), Q = Pe(E, Be.triggerProps), X = Pe(E, Be.positionerElement), Z = Pe(E, Be.listElement), q = Pe(E, Be.popupSide), H = Pe(E, Be.id), Y = Pe(E, Be.labelId), V = Pe(E, Be.hasSelectedValue), K = k && X ? q : null, B = f ?? H, C = u2(M, Y);
  dg({
    id: B
  });
  const L = Yt(X), ne = y.useRef(null), {
    getButtonProps: J,
    buttonRef: re
  } = Oo({
    disabled: _,
    native: g
  }), ie = ze((ye) => {
    E.set("triggerElement", ye);
  }), oe = an(), se = an(), ge = an();
  y.useEffect(() => {
    if (G)
      return ge.start(f2, () => {
        O.current.allowUnselectedMouseUp = !0, O.current.allowSelectedMouseUp = !0;
      }), () => {
        ge.clear();
      };
    O.current = {
      allowSelectedMouseUp: !1,
      allowUnselectedMouseUp: !1,
      dragY: 0
    }, se.clear();
  }, [G, O, se, ge]);
  const je = bn(Q, {
    id: B,
    role: "combobox",
    "aria-expanded": G ? "true" : "false",
    "aria-haspopup": "listbox",
    "aria-controls": G ? Z?.id ?? hc(X)?.id : void 0,
    "aria-labelledby": C,
    "aria-readonly": D || void 0,
    "aria-required": j || void 0,
    tabIndex: _ ? -1 : 0,
    onFocus(ye) {
      b(!0), G && N.current && A(!1, Ye(zo, ye.nativeEvent)), oe.start(0, () => {
        E.set("forceMount", !0);
      });
    },
    onBlur(ye) {
      Le(X, ye.relatedTarget) || (v(!0), b(!1), S === "onBlur" && z.commit(ee));
    },
    onMouseDown(ye) {
      if (G)
        return;
      const Re = tt(ye.currentTarget);
      function _e(ke) {
        if (!ne.current)
          return;
        const we = ke.target;
        if (Le(ne.current, we) || Le(L.current, we))
          return;
        const Ce = kx(ne.current);
        ke.clientX >= Ce.left - ec && ke.clientX <= Ce.right + ec && ke.clientY >= Ce.top - ec && ke.clientY <= Ce.bottom + ec || A(!1, Ye(s0, ke));
      }
      se.start(0, () => {
        Re.addEventListener("mouseup", _e, {
          once: !0
        });
      });
    }
  }, d, J), Ee = z.getValidationProps(_, je);
  Ee.role = "combobox";
  const fe = {
    ...R,
    open: G,
    disabled: _,
    value: ee,
    readOnly: D,
    popupSide: K,
    placeholder: !V
  };
  return nt("button", o, {
    ref: [a, ne, re, ie],
    state: fe,
    stateAttributesMapping: d2,
    props: Ee
  });
}), g2 = {
  value: () => null
}, m2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
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
  } = Zl(), b = Pe(d, Be.value), S = Pe(d, Be.items), R = Pe(d, Be.itemToStringLabel), w = Pe(d, Be.hasSelectedValue), M = !w && p != null && f == null, E = Pe(d, Be.hasNullItemLabel, M), A = {
    value: b,
    placeholder: !w
  };
  let O = null;
  return typeof f == "function" ? O = f(b) : f != null ? O = f : !w && p != null && !E ? O = p : Array.isArray(b) ? O = a2(b, S, R) : O = $x(b, S, R), nt("span", o, {
    state: A,
    ref: [a, v],
    props: [{
      children: O
    }, m],
    stateAttributesMapping: g2
  });
}), h2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    ...p
  } = o, {
    store: g
  } = Zl(), d = {
    open: Pe(g, Be.open)
  };
  return nt("span", o, {
    state: d,
    ref: a,
    props: [{
      "aria-hidden": !0,
      children: "▼"
    }, p],
    stateAttributesMapping: tu
  });
}), y2 = /* @__PURE__ */ y.createContext(void 0), v2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    store: i
  } = Zl(), u = Pe(i, Be.mounted), f = Pe(i, Be.forceMount);
  return u || f ? /* @__PURE__ */ x.jsx(y2.Provider, {
    value: !0,
    children: /* @__PURE__ */ x.jsx(Bc, {
      ref: a,
      ...o
    })
  }) : null;
}), eS = /* @__PURE__ */ y.createContext(void 0);
function tS() {
  const n = y.useContext(eS);
  if (!n)
    throw new Error(At(59));
  return n;
}
function Mc(n, o) {
  n && Object.assign(n.style, o);
}
const nS = {
  position: "relative",
  maxHeight: "100%",
  overflowX: "hidden",
  overflowY: "auto"
}, b2 = {
  position: "fixed"
}, x2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
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
    arrowPadding: R = 5,
    sticky: w = !1,
    disableAnchorTracking: M,
    alignItemWithTrigger: E = !0,
    collisionAvoidance: A = O0,
    style: O,
    ...z
  } = o, {
    store: D,
    listRef: j,
    labelsRef: N,
    alignItemWithTriggerActiveRef: U,
    selectedItemTextRef: _,
    valuesRef: G,
    initialValueRef: k,
    popupRef: ee,
    setValue: Q
  } = Zl(), X = Qx(), Z = Pe(D, Be.open), q = Pe(D, Be.mounted), H = Pe(D, Be.modal), Y = Pe(D, Be.value), V = Pe(D, Be.openMethod), K = Pe(D, Be.positionerElement), B = Pe(D, Be.triggerElement), C = Pe(D, Be.isItemEqualToValue), L = Pe(D, Be.transitionStatus), ne = y.useRef(null), J = y.useRef(null), [re, ie] = y.useState(E), oe = q && re && V !== "touch";
  !q && re !== E && ie(E), xe(() => {
    q || (Be.scrollUpArrowVisible(D.state) && D.set("scrollUpArrowVisible", !1), Be.scrollDownArrowVisible(D.state) && D.set("scrollDownArrowVisible", !1));
  }, [D, q]), y.useImperativeHandle(U, () => oe), cg((oe || H) && Z, V === "touch", K, B);
  const se = uu({
    anchor: i,
    floatingRootContext: X,
    positionMethod: u,
    mounted: q,
    side: g,
    sideOffset: d,
    align: m,
    alignOffset: v,
    arrowPadding: R,
    collisionBoundary: b,
    collisionPadding: S,
    sticky: w,
    disableAnchorTracking: M ?? oe,
    collisionAvoidance: A,
    keepMounted: !0
  }), ge = oe ? "none" : se.side, je = oe ? b2 : se.positionerStyles, Ee = {
    open: Z,
    side: ge,
    align: se.align,
    anchorHidden: se.anchorHidden
  };
  xe(() => {
    D.set("popupSide", se.side);
  }, [D, se.side]);
  const fe = ze((we) => {
    D.set("positionerElement", we);
  }), ye = fu(o, Ee, {
    styles: je,
    transitionStatus: L,
    props: z,
    refs: [a, fe],
    hidden: !q,
    inert: !Z
  }), Re = y.useRef(0), _e = ze((we) => {
    if (we.size === 0 && Re.current === 0 || G.current.length === 0)
      return;
    const Ce = Re.current;
    if (Re.current = we.size, we.size === Ce)
      return;
    const he = Ye(zo);
    if (Ce !== 0 && !D.state.multiple && Y !== null && gi(G.current, Y, C) === -1) {
      const Te = k.current, He = Te != null && gi(G.current, Te, C) !== -1 ? Te : null;
      Q(He, he), He === null && (D.set("selectedIndex", null), _.current = null);
    }
    if (Ce !== 0 && D.state.multiple && Array.isArray(Y)) {
      const Se = (Oe) => gi(G.current, Oe, C) !== -1, Te = Y.filter((Oe) => Se(Oe));
      (Te.length !== Y.length || Te.some((Oe) => !l2(Y, Oe, C))) && (Q(Te, he), Te.length === 0 && (D.set("selectedIndex", null), _.current = null));
    }
    if (Z && oe) {
      D.update({
        scrollUpArrowVisible: !1,
        scrollDownArrowVisible: !1
      });
      const Se = {
        height: ""
      };
      Mc(K, Se), Mc(ee.current, Se);
    }
  }), ke = y.useMemo(() => ({
    ...se,
    side: ge,
    alignItemWithTriggerActive: oe,
    setControlledAlignItemWithTrigger: ie,
    scrollUpArrowRef: ne,
    scrollDownArrowRef: J
  }), [se, ge, oe, ie]);
  return /* @__PURE__ */ x.jsx(sg, {
    elementsRef: j,
    labelsRef: N,
    onMapChange: _e,
    children: /* @__PURE__ */ x.jsxs(eS.Provider, {
      value: ke,
      children: [q && H && /* @__PURE__ */ x.jsx(ru, {
        inert: ou(!Z),
        cutout: B
      }), ye]
    })
  });
}), tc = "base-ui-disable-scrollbar", xp = {
  className: tc,
  getElement(n) {
    return /* @__PURE__ */ x.jsx("style", {
      nonce: n,
      href: tc,
      precedence: "base-ui:low",
      children: `.${tc}{scrollbar-width:none}.${tc}::-webkit-scrollbar{display:none}`
    });
  }
}, S2 = /* @__PURE__ */ y.createContext(void 0), w2 = {
  disableStyleElements: !1
};
function E2() {
  return y.useContext(S2) ?? w2;
}
const T2 = {
  ...ko,
  ...jo
}, R2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
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
    firstItemTextRef: R,
    selectedItemTextRef: w,
    multiple: M,
    handleScrollArrowVisibility: E,
    scrollHandlerRef: A,
    listRef: O,
    highlightItemOnHover: z
  } = Zl(), {
    side: D,
    align: j,
    alignItemWithTriggerActive: N,
    isPositioned: U,
    setControlledAlignItemWithTrigger: _
  } = tS(), G = su() != null, k = Qx(), ee = cu(), {
    nonce: Q,
    disableStyleElements: X
  } = E2(), Z = Pe(m, Be.id), q = Pe(m, Be.open), H = Pe(m, Be.openMethod), Y = Pe(m, Be.mounted), V = Pe(m, Be.popupProps), K = Pe(m, Be.transitionStatus), B = Pe(m, Be.triggerElement), C = Pe(m, Be.positionerElement), L = Pe(m, Be.listElement), ne = y.useRef(!1), J = y.useRef(!1), re = y.useRef({}), ie = ta(), oe = ze((Ee) => {
    if (!C || !d.current || !J.current)
      return;
    if (ne.current || !N) {
      E();
      return;
    }
    const fe = C.style.top === "0px", ye = C.style.bottom === "0px";
    if (!fe && !ye) {
      E();
      return;
    }
    const Re = Sb(C), _e = si(C.getBoundingClientRect().height, "y", Re), ke = tt(C), we = Dt(C), Ce = we.getComputedStyle(C), he = parseFloat(Ce.marginTop), Se = parseFloat(Ce.marginBottom), Te = xb(we.getComputedStyle(d.current)), Oe = Math.min(ke.documentElement.clientHeight - he - Se, Te), He = Ee.scrollTop, ae = nc(Ee);
    let pe = 0, Ue = null, ve = !1, be = !1;
    const We = (et) => {
      C.style.height = `${et}px`;
    }, rt = (et, gt) => {
      const zt = ii(et, 0, Oe - _e);
      zt > 0 && We(_e + zt), Ee.scrollTop = gt, Oe - (_e + zt) <= Ll && (ne.current = !0), E();
    }, pt = fe ? ae - He : He, Nt = Math.min(_e + pt, Oe);
    if (pe = Nt, pt <= Ll) {
      rt(pt, fe ? ae : 0);
      return;
    }
    if (Oe - Nt > Ll)
      fe ? be = !0 : Ue = 0;
    else if (ve = !0, ye && He < ae) {
      const et = _e + pt - Oe;
      Ue = He - (pt - et);
    }
    if (pe = Math.ceil(pe), pe !== 0 && We(pe), be || Ue != null) {
      const et = nc(Ee), gt = be ? et : ii(Ue, 0, et);
      Math.abs(Ee.scrollTop - gt) > Ll && (Ee.scrollTop = gt);
    }
    (ve || pe >= Oe - Ll) && (ne.current = !0), E();
  });
  y.useImperativeHandle(A, () => oe, [oe]), Ql({
    open: q,
    ref: d,
    onComplete() {
      q && v?.(!0);
    }
  });
  const se = {
    open: q,
    transitionStatus: K,
    side: D,
    align: j
  };
  xe(() => {
    !C || !d.current || Object.keys(re.current).length || (re.current = {
      top: C.style.top || "0",
      left: C.style.left || "0",
      right: C.style.right,
      height: C.style.height,
      bottom: C.style.bottom,
      minHeight: C.style.minHeight,
      maxHeight: C.style.maxHeight,
      marginTop: C.style.marginTop,
      marginBottom: C.style.marginBottom
    });
  }, [d, C]), xe(() => {
    q || N || (J.current = !1, ne.current = !1, Mc(C, re.current));
  }, [q, N, C, d]), xe(() => {
    const Ee = d.current;
    if (!q || !B || !C || !Ee || N && !U || m.state.transitionStatus === "ending")
      return;
    if (!N) {
      J.current = !0, ie.request(E), Ee.style.removeProperty("--transform-origin");
      return;
    }
    const fe = C2(Ee);
    Ee.style.removeProperty("--transform-origin");
    try {
      let ye = w.current;
      ye?.isConnected || (ye = !Be.hasSelectedValue(m.state) && R.current?.isConnected ? R.current : null);
      const Re = S.current, _e = Dt(C), ke = _e.getComputedStyle(C), we = _e.getComputedStyle(Ee), Ce = tt(B), he = Sb(B), Se = lc(B.getBoundingClientRect(), he), Te = lc(C.getBoundingClientRect(), he), Oe = Se.height, He = L || Ee, ae = He.scrollHeight, pe = parseFloat(we.borderBottomWidth), Ue = parseFloat(ke.marginTop) || 10, ve = parseFloat(ke.marginBottom) || 10, be = parseFloat(ke.minHeight) || 100, We = xb(we), rt = 5, pt = 5, Nt = 20, et = Ce.documentElement.clientHeight - Ue - ve, gt = Ce.documentElement.clientWidth, zt = et - Se.bottom + Oe;
      let mt, Mn = ee === "rtl" ? Se.right - Te.width : Se.left, An = 0;
      if (ye && Re) {
        const qt = lc(Re.getBoundingClientRect(), he);
        mt = lc(ye.getBoundingClientRect(), he), Mn = Te.left + (ee === "rtl" ? qt.right - mt.right : qt.left - mt.left);
        const Pn = qt.top - Se.top + qt.height / 2;
        An = mt.top - Te.top + mt.height / 2 - Pn;
      }
      const Qe = zt + An + ve + pe;
      let ft = Math.min(et, Qe);
      const It = et - Ue - ve, Ht = Qe - ft, Ut = gt - pt;
      C.style.left = `${ii(Mn, rt, Ut - Te.width)}px`, C.style.height = `${ft}px`, C.style.maxHeight = "none", C.style.marginTop = `${Ue}px`, C.style.marginBottom = `${ve}px`, Ee.style.height = "100%";
      const jt = nc(He), Gt = Ht >= jt - Ll;
      Gt && (ft = Math.min(et, Te.height) - (Ht - jt));
      const Sn = Se.top < Nt || Se.bottom > et - Nt || Math.ceil(ft) + Ll < Math.min(ae, be), zn = (_e.visualViewport?.scale ?? 1) !== 1 && Ao;
      if (Sn || zn) {
        J.current = !0, Mc(C, re.current), _(!1);
        return;
      }
      const Vn = Math.max(be, ft);
      if (Gt) {
        const qt = Math.max(0, et - Qe);
        C.style.top = Te.height >= It ? "0" : `${qt}px`, C.style.height = `${ft}px`, He.scrollTop = nc(He);
      } else
        C.style.bottom = "0", He.scrollTop = Ht;
      if (mt) {
        const qt = Te.top, Pn = Te.height, hl = mt.top + mt.height / 2, tl = Pn > 0 ? (hl - qt) / Pn * 100 : 50, yl = ii(tl, 0, 100);
        Ee.style.setProperty("--transform-origin", `50% ${yl}%`);
      }
      (Vn === et || ft >= We) && (ne.current = !0), E(), z && m.state.selectedIndex === null && m.state.activeIndex === null && O.current[0] != null && m.set("activeIndex", 0), J.current = !0;
    } finally {
      fe();
    }
  }, [m, q, C, B, S, R, w, d, E, N, _, ie, L, O, z, ee, U]), y.useEffect(() => {
    if (!N || !C || !q)
      return;
    const Ee = Dt(C);
    function fe(ye) {
      b(!1, Ye(sR, ye));
    }
    return Je(Ee, "resize", fe);
  }, [b, N, C, q]);
  const ge = {
    ...L ? {
      role: "presentation",
      "aria-orientation": void 0
    } : {
      role: "listbox",
      "aria-multiselectable": M || void 0,
      id: `${Z}-list`
    },
    onKeyDown(Ee) {
      G && Ri.has(Ee.key) && Ee.stopPropagation();
    },
    onScroll(Ee) {
      L || oe(Ee.currentTarget);
    },
    ...N && {
      style: L ? {
        height: "100%"
      } : nS
    }
  }, je = nt("div", o, {
    ref: [a, d],
    state: se,
    stateAttributesMapping: T2,
    props: [V, ge, Oi(K), {
      className: !L && N ? xp.className : void 0
    }, g]
  });
  return /* @__PURE__ */ x.jsxs(y.Fragment, {
    children: [!X && xp.getElement(Q), /* @__PURE__ */ x.jsx(Vc, {
      context: k,
      modal: !1,
      disabled: !Y,
      openInteractionType: H,
      returnFocus: p,
      restoreFocus: !0,
      children: je
    })]
  });
});
function xb(n) {
  const o = n.maxHeight || "";
  return o.endsWith("px") && parseFloat(o) || 1 / 0;
}
function nc(n) {
  return Wx(n.scrollHeight, n.clientHeight);
}
function Sb(n) {
  return V0.getScale(n);
}
function si(n, o, a) {
  return n / a[o];
}
function lc(n, o) {
  return yi({
    x: si(n.x, "x", o),
    y: si(n.y, "y", o),
    width: si(n.width, "x", o),
    height: si(n.height, "y", o)
  });
}
const wb = [["transform", "none"], ["scale", "1"], ["translate", "0 0"]];
function C2(n) {
  const {
    style: o
  } = n, a = {};
  for (const [i, u] of wb)
    a[i] = o.getPropertyValue(i), o.setProperty(i, u, "important");
  return () => {
    for (const [i] of wb) {
      const u = a[i];
      u ? o.setProperty(i, u) : o.removeProperty(i);
    }
  };
}
const O2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    ...p
  } = o, {
    store: g,
    scrollHandlerRef: m
  } = Zl(), {
    alignItemWithTriggerActive: d
  } = tS(), v = Pe(g, Be.hasScrollArrows), b = Pe(g, Be.openMethod), S = Pe(g, Be.multiple), w = {
    id: `${Pe(g, Be.id)}-list`,
    role: "listbox",
    "aria-multiselectable": S || void 0,
    onScroll(E) {
      m.current?.(E.currentTarget);
    },
    ...d && {
      style: nS
    },
    className: v && b !== "touch" ? xp.className : void 0
  }, M = ze((E) => {
    g.set("listElement", E);
  });
  return nt("div", o, {
    ref: [a, M],
    props: [w, p]
  });
}), lS = /* @__PURE__ */ y.createContext(void 0);
function gg() {
  const n = y.useContext(lS);
  if (!n)
    throw new Error(At(57));
  return n;
}
const M2 = /* @__PURE__ */ y.memo(/* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    value: p = null,
    label: g,
    disabled: m = !1,
    nativeButton: d = !1,
    ...v
  } = o, b = y.useRef(null), S = Ci({
    label: g,
    textRef: b,
    indexGuessBehavior: Rx.GuessFromOrder
  }), {
    store: R,
    itemProps: w,
    setOpen: M,
    setValue: E,
    selectionRef: A,
    typingRef: O,
    valuesRef: z,
    multiple: D,
    selectedItemTextRef: j,
    disabled: N,
    readOnly: U
  } = Zl(), _ = Pe(R, Be.isActive, S.index), G = Pe(R, Be.open), k = Pe(R, Be.isSelected, p), ee = Pe(R, Be.isSelectedByFocus, S.index), Q = Pe(R, Be.isItemEqualToValue), X = S.index, Z = X !== -1, q = y.useRef(null);
  xe(() => {
    if (!Z)
      return;
    const oe = z.current;
    return oe[X] = p, () => {
      delete oe[X];
    };
  }, [Z, X, p, z]), xe(() => {
    if (!Z)
      return;
    const oe = R.state.value;
    let se = oe;
    D && Array.isArray(oe) && (se = oe.length > 0 ? oe[oe.length - 1] : void 0), se !== void 0 && ir(p, se, Q) && (R.set("selectedIndex", X), b.current && (j.current = b.current));
  }, [Z, X, D, Q, R, p, j]);
  const H = y.useRef(null), Y = y.useRef("mouse"), V = y.useRef(!1), {
    getButtonProps: K,
    buttonRef: B
  } = Oo({
    disabled: m,
    focusableWhenDisabled: !0,
    native: d,
    composite: !0
  }), C = {
    disabled: m,
    selected: k,
    highlighted: _
  };
  function L(oe) {
    if (N || U)
      return;
    const se = R.state.value;
    if (D) {
      const ge = Array.isArray(se) ? se : [], je = k ? o2(ge, p, Q) : [...ge, p];
      E(je, Ye(Jr, oe));
    } else
      E(p, Ye(Jr, oe)), M(!1, Ye(Jr, oe));
  }
  function ne() {
    A.current.dragY = 0;
  }
  const J = {
    role: "option",
    "aria-selected": k,
    tabIndex: G && _ ? 0 : -1,
    onKeyDown(oe) {
      H.current = oe.key, R.set("activeIndex", X), oe.key === " " && O.current && oe.preventDefault();
    },
    onClick(oe) {
      const se = oe.type === "click" && Y.current !== "touch", ge = oe.nativeEvent.pointerType, je = se && Hp(oe.nativeEvent) && // Generic no-pointer `detail === 0` clicks stay tied to highlight state. Virtual
      // clicks that carry browser pointer data, including an empty string from assistive
      // technology, can activate unhighlighted items.
      (ge !== void 0 || _), Ee = se && !je && !V.current;
      V.current = !1, !(oe.type === "keydown" && H.current === null) && (m || oe.type === "keydown" && H.current === " " && O.current || Ee || (H.current = null, L(oe.nativeEvent)));
    },
    onPointerEnter(oe) {
      Y.current = oe.pointerType;
    },
    onPointerMove(oe) {
      if (oe.pointerType === "mouse" && oe.buttons === 1) {
        const se = A.current;
        se.dragY += oe.movementY, se.dragY ** 2 >= 64 && (se.allowUnselectedMouseUp = !0);
      }
    },
    onPointerDown(oe) {
      Y.current = oe.pointerType, V.current = !0, ne();
    },
    onMouseUp() {
      if (ne(), m || Y.current === "touch" || V.current)
        return;
      const oe = !A.current.allowSelectedMouseUp && k, se = !A.current.allowUnselectedMouseUp && !k;
      oe || se || (V.current = !0, q.current?.click(), V.current = !1);
    }
  }, re = nt("div", o, {
    ref: [B, a, S.ref, q],
    state: C,
    props: [w, J, v, K]
  }), ie = y.useMemo(() => ({
    selected: k,
    index: X,
    textRef: b,
    selectedByFocus: ee,
    hasRegistered: Z
  }), [k, X, b, ee, Z]);
  return /* @__PURE__ */ x.jsx(lS.Provider, {
    value: ie,
    children: re
  });
})), A2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const i = o.keepMounted ?? !1, {
    selected: u
  } = gg();
  return i || u ? /* @__PURE__ */ x.jsx(z2, {
    ...o,
    ref: a
  }) : null;
}), z2 = /* @__PURE__ */ y.memo(/* @__PURE__ */ y.forwardRef((n, o) => {
  const {
    render: a,
    className: i,
    style: u,
    keepMounted: f,
    ...p
  } = n, {
    selected: g
  } = gg(), m = y.useRef(null), {
    transitionStatus: d,
    setMounted: v
  } = qc(g), S = nt("span", n, {
    ref: [o, m],
    state: {
      selected: g,
      transitionStatus: d
    },
    props: [{
      "aria-hidden": !0,
      children: "✔️"
    }, p],
    stateAttributesMapping: jo
  });
  return Ql({
    open: g,
    ref: m,
    onComplete() {
      g || v(!1);
    }
  }), S;
})), D2 = /* @__PURE__ */ y.memo(/* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    index: i,
    textRef: u,
    selectedByFocus: f,
    hasRegistered: p
  } = gg(), {
    firstItemTextRef: g,
    selectedItemTextRef: m
  } = Zl(), {
    render: d,
    className: v,
    style: b,
    ...S
  } = o, R = y.useCallback((M) => {
    M && (p && i === 0 && (g.current = M), p && f && (m.current = M));
  }, [g, m, i, f, p]);
  return nt("div", o, {
    ref: [R, a, u],
    props: S
  });
})), N2 = /* @__PURE__ */ y.createContext(void 0), j2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
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
  return /* @__PURE__ */ x.jsx(N2.Provider, {
    value: d,
    children: v
  });
});
function oS({ ...n }) {
  return /* @__PURE__ */ x.jsx(c2, { "data-slot": "select", ...n });
}
function rS({ ...n }) {
  return /* @__PURE__ */ x.jsx(j2, { "data-slot": "select-group", ...n });
}
function aS({ ...n }) {
  return /* @__PURE__ */ x.jsx(m2, { "data-slot": "select-value", ...n });
}
function iS({
  className: n,
  size: o = "default",
  children: a,
  ...i
}) {
  return /* @__PURE__ */ x.jsxs(
    p2,
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
        /* @__PURE__ */ x.jsx(h2, { "data-icon": "select-chevron", "aria-hidden": "true", children: /* @__PURE__ */ x.jsx(fc, {}) })
      ]
    }
  );
}
function sS({
  className: n,
  children: o,
  portalContainer: a,
  positionerClassName: i,
  ...u
}) {
  return /* @__PURE__ */ x.jsx(v2, { container: a, children: /* @__PURE__ */ x.jsx(
    x2,
    {
      sideOffset: 4,
      className: Ke("tw:z-[var(--z-popover)]", i),
      children: /* @__PURE__ */ x.jsx(
        R2,
        {
          "data-slot": "select-content",
          className: Ke(
            "tw:min-w-(--anchor-width) tw:max-h-(--available-height) tw:origin-(--transform-origin) tw:overflow-x-hidden tw:overflow-y-auto tw:rounded-[var(--radius-control)] tw:border tw:border-border tw:bg-popover tw:p-1 tw:text-[var(--fs-body-s)] tw:text-popover-foreground tw:shadow-md tw:outline-none",
            n
          ),
          ...u,
          children: /* @__PURE__ */ x.jsx(O2, { className: "tw:flex tw:flex-col tw:gap-0.5", children: o })
        }
      )
    }
  ) });
}
function cS({ className: n, children: o, ...a }) {
  return /* @__PURE__ */ x.jsxs(
    M2,
    {
      "data-slot": "select-item",
      className: Ke(
        "tw:relative tw:flex tw:w-full tw:cursor-default tw:items-center tw:gap-2 tw:rounded-[var(--radius-control)] tw:py-1.5 tw:pr-8 tw:pl-2 tw:text-[var(--fs-body-s)] tw:outline-none tw:select-none tw:data-highlighted:bg-accent tw:data-highlighted:text-accent-foreground tw:data-disabled:pointer-events-none tw:data-disabled:opacity-50",
        n
      ),
      ...a,
      children: [
        /* @__PURE__ */ x.jsx("span", { className: "tw:absolute tw:right-2 tw:flex tw:size-3.5 tw:items-center tw:justify-center", "aria-hidden": "true", children: /* @__PURE__ */ x.jsx(A2, { children: /* @__PURE__ */ x.jsx(uc, { "data-icon": "select-check" }) }) }),
        /* @__PURE__ */ x.jsx(D2, { children: o })
      ]
    }
  );
}
function k2(n) {
  const o = y.useContext(ox) ? "drawer" : "dialog";
  return ax(n, o);
}
function _2({ ...n }) {
  return /* @__PURE__ */ x.jsx(k2, { "data-slot": "sheet", ...n });
}
function H2({ ...n }) {
  return /* @__PURE__ */ x.jsx(mx, { "data-slot": "sheet-portal", ...n });
}
function U2({ className: n, ...o }) {
  return /* @__PURE__ */ x.jsx(
    ix,
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
function L2({
  className: n,
  children: o,
  side: a = "right",
  layer: i = "modal",
  showCloseButton: u = !0,
  showOverlay: f = !0,
  ...p
}) {
  return /* @__PURE__ */ x.jsxs(H2, { children: [
    f && /* @__PURE__ */ x.jsx(U2, {}),
    /* @__PURE__ */ x.jsxs(
      gx,
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
            sx,
            {
              "data-slot": "sheet-close",
              render: /* @__PURE__ */ x.jsx(
                Mt,
                {
                  variant: "ghost",
                  className: "tw:absolute tw:top-3 tw:right-3",
                  size: "icon-sm"
                }
              ),
              children: [
                /* @__PURE__ */ x.jsx(ci, {}),
                /* @__PURE__ */ x.jsx("span", { className: "tw:sr-only", children: "Close" })
              ]
            }
          )
        ]
      }
    )
  ] });
}
function I2({ className: n, ...o }) {
  return /* @__PURE__ */ x.jsx(
    "div",
    {
      "data-slot": "sheet-header",
      className: Ke("tw:flex tw:flex-col tw:gap-0.5 tw:p-4", n),
      ...o
    }
  );
}
function B2({ className: n, ...o }) {
  return /* @__PURE__ */ x.jsx(
    hx,
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
function V2({
  className: n,
  ...o
}) {
  return /* @__PURE__ */ x.jsx(
    cx,
    {
      "data-slot": "sheet-description",
      className: Ke("tw:text-[var(--fs-body-s)] tw:text-muted-foreground", n),
      ...o
    }
  );
}
const uS = /* @__PURE__ */ y.createContext(void 0);
function P2(n = !0) {
  const o = y.useContext(uS);
  if (o === void 0 && !n)
    throw new Error(At(7));
  return o;
}
const Y2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
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
    style: R,
    ...w
  } = o, M = Bn(b || void 0), E = P2(), A = E?.value ?? [], O = E ? void 0 : u, z = (f || E?.disabled) ?? !1, [D, j] = oa({
    controlled: E ? M !== void 0 && A.indexOf(M) > -1 : m,
    default: O,
    name: "Toggle",
    state: "pressed"
  }), {
    getButtonProps: N,
    buttonRef: U
  } = Oo({
    disabled: z,
    native: S
  }), _ = {
    disabled: z,
    pressed: D
  }, G = [U, a], k = [{
    "aria-pressed": D,
    onClick(X) {
      const Z = !D, q = Ye(zo, X.nativeEvent);
      g?.(Z, q), !q.isCanceled && (M && E?.setGroupValue?.(M, Z, q), !q.isCanceled && j(Z));
    }
  }, w, N], ee = nt("button", o, {
    enabled: !E,
    state: _,
    ref: G,
    props: k
  }), Q = y.useMemo(() => ({
    disabled: z,
    focusableWhenDisabled: !1
  }), [z]);
  return E ? /* @__PURE__ */ x.jsx(_x, {
    tag: "button",
    render: d,
    className: i,
    style: R,
    metadata: Q,
    state: _,
    refs: G,
    props: k
  }) : ee;
}), G2 = "data-composite-item-active", q2 = [];
function X2(n) {
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
    modifierKeys: S = q2
  } = n, [R, w] = y.useState(0), M = i != null, E = y.useRef(null), A = Eo(E, m), O = y.useRef([]), z = y.useRef(!1), D = p ?? R, j = ze((k, ee = !1) => {
    if ((g ?? w)(k), ee) {
      const Q = O.current[k];
      ub(E.current, Q, f, a);
    }
  }), N = ze((k) => {
    if (k.size === 0 || z.current)
      return;
    z.current = !0;
    const ee = Array.from(k.keys()), Q = ee.find((Z) => Z?.hasAttribute(G2)) ?? null, X = Q ? ee.indexOf(Q) : -1;
    if (X !== -1)
      j(X);
    else if (bc(ee, D, b)) {
      const Z = Il(ee, {
        disabledIndices: b
      });
      ui(ee, Z) || j(Z);
    }
    ub(E.current, Q, f, a);
  });
  xe(() => {
    if (b == null || p != null || !z.current)
      return;
    const k = O.current;
    if (bc(k, D, b)) {
      const ee = Il(k, {
        disabledIndices: b
      });
      ui(k, ee) || j(ee);
    }
  }, [b, p, D, O, j]);
  const U = ze((k, ee, Q) => u ? u(k, ee, Q, O) : Q), _ = ze((k) => {
    const ee = d ? Ri : px;
    if (!ee.has(k.key) || F2(k, S) || !E.current)
      return;
    const X = f === "rtl", Z = X ? Rc : Cc, q = {
      horizontal: Z,
      vertical: pi,
      both: Z
    }[a], H = X ? Cc : Rc, Y = {
      horizontal: H,
      vertical: di,
      both: H
    }[a], V = gn(k.nativeEvent);
    if (V != null && cb(V) && !Ix(V)) {
      const re = V.selectionStart, ie = V.selectionEnd, oe = V.value ?? "";
      if (re == null || k.shiftKey || re !== ie || k.key !== Y && re < oe.length || k.key !== q && re > 0)
        return;
    }
    let K = D;
    const B = rc(O, b), C = up(O, b);
    i != null && (K = i({
      disabledIndices: b,
      elementsRef: O,
      event: k,
      highlightedIndex: D,
      loopFocus: o,
      maxIndex: C,
      minIndex: B,
      onLoop: U,
      orientation: a,
      rtl: X
    }));
    const L = {
      horizontal: [Z],
      vertical: [pi],
      both: [Z, pi]
    }[a], ne = {
      horizontal: [H],
      vertical: [di],
      both: [H, di]
    }[a], J = M ? ee : {
      horizontal: d ? yO : fx,
      vertical: d ? vO : dx,
      both: ee
    }[a];
    d && (k.key === nu ? K = B : k.key === lu && (K = C)), K === D && (L.includes(k.key) || ne.includes(k.key)) && (o && K === C && L.includes(k.key) ? (K = B, u && (K = u(k, D, K, O))) : o && K === B && ne.includes(k.key) ? (K = C, u && (K = u(k, D, K, O))) : K = Il(O.current, {
      startingIndex: K,
      decrement: ne.includes(k.key),
      disabledIndices: b
    })), K !== D && !ui(O.current, K) && (v && k.stopPropagation(), J.has(k.key) && k.preventDefault(), j(K, !0), queueMicrotask(() => {
      O.current[K]?.focus();
    }));
  });
  return {
    props: {
      ref: A,
      onFocus(k) {
        const ee = E.current, Q = gn(k.nativeEvent);
        !ee || Q == null || !cb(Q) || Q.setSelectionRange(0, Q.value.length ?? 0);
      },
      onKeyDown: _
    },
    highlightedIndex: D,
    onHighlightedIndexChange: j,
    elementsRef: O,
    disabledIndices: b,
    onMapChange: N,
    relayKeyboardEvent: _
  };
}
function F2(n, o) {
  for (const a of EO.values())
    if (!o.includes(a) && n.getModifierState(a))
      return !0;
  return !1;
}
function K2(n) {
  const {
    render: o,
    className: a,
    style: i,
    refs: u = Gl,
    props: f = Gl,
    state: p = bt,
    stateAttributesMapping: g,
    highlightedIndex: m,
    onHighlightedIndexChange: d,
    orientation: v,
    grid: b,
    loopFocus: S,
    onLoop: R,
    enableHomeAndEndKeys: w,
    onMapChange: M,
    stopEventPropagation: E = !0,
    rootRef: A,
    disabledIndices: O,
    modifierKeys: z,
    highlightItemOnHover: D = !1,
    tag: j = "div",
    ...N
  } = n, U = cu(), {
    props: _,
    highlightedIndex: G,
    onHighlightedIndexChange: k,
    elementsRef: ee,
    onMapChange: Q,
    relayKeyboardEvent: X
  } = X2({
    grid: b,
    loopFocus: S,
    onLoop: R,
    orientation: v,
    highlightedIndex: m,
    onHighlightedIndexChange: d,
    rootRef: A,
    stopEventPropagation: E,
    enableHomeAndEndKeys: w,
    direction: U,
    disabledIndices: O,
    modifierKeys: z
  }), Z = nt(j, n, {
    state: p,
    ref: u,
    props: [_, ...f, N],
    stateAttributesMapping: g
  }), q = y.useMemo(() => ({
    highlightedIndex: G,
    onHighlightedIndexChange: k,
    highlightItemOnHover: D,
    relayKeyboardEvent: X
  }), [G, k, D, X]);
  return /* @__PURE__ */ x.jsx(Ub.Provider, {
    value: q,
    children: /* @__PURE__ */ x.jsx(sg, {
      elementsRef: ee,
      onMapChange: (H) => {
        M?.(H), Q(H);
      },
      children: Z
    })
  });
}
const Q2 = /* @__PURE__ */ y.createContext(void 0);
function Z2(n) {
  return y.useContext(Q2);
}
let J2 = /* @__PURE__ */ (function(n) {
  return n.disabled = "data-disabled", n.orientation = "data-orientation", n.multiple = "data-multiple", n;
})({});
const Eb = {
  multiple(n) {
    return n ? {
      [J2.multiple]: ""
    } : null;
  }
}, $2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
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
    ...R
  } = o, w = su(), M = Z2(), E = y.useMemo(() => d !== void 0 || i !== void 0, [d, i]), A = (w?.disabled ?? !1) || (M?.disabled ?? !1) || u, [O, z] = oa({
    controlled: d,
    default: d === void 0 ? i ?? Gl : void 0,
    name: "ToggleGroup",
    state: "value"
  }), D = ze((G, k, ee) => {
    let Q;
    m ? (Q = O.slice(), k ? Q.push(G) : Q.splice(O.indexOf(G), 1)) : Q = k ? [G] : [], p?.(Q, ee), !ee.isCanceled && z(Q);
  }), j = {
    disabled: A,
    multiple: m,
    orientation: g
  }, N = y.useMemo(() => ({
    disabled: A,
    orientation: g,
    setGroupValue: D,
    value: O,
    isValueInitialized: E
  }), [A, g, D, O, E]), U = {
    role: "group"
  }, _ = nt("div", o, {
    enabled: !!w,
    state: j,
    ref: a,
    props: [U, R],
    stateAttributesMapping: Eb
  });
  return /* @__PURE__ */ x.jsx(uS.Provider, {
    value: N,
    children: w ? _ : /* @__PURE__ */ x.jsx(K2, {
      render: b,
      className: v,
      style: S,
      state: j,
      refs: [a],
      props: [U, R],
      stateAttributesMapping: Eb,
      loopFocus: f,
      enableHomeAndEndKeys: !0,
      orientation: g
    })
  });
}), W2 = ra(
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
function Kd({
  className: n,
  ...o
}) {
  return /* @__PURE__ */ x.jsx(
    $2,
    {
      "data-slot": "toggle-group",
      className: Ke("tw:flex tw:w-fit tw:flex-row tw:items-center tw:gap-1", n),
      ...o
    }
  );
}
function Qd({
  className: n,
  variant: o = "default",
  size: a = "default",
  ...i
}) {
  return /* @__PURE__ */ x.jsx(
    Y2,
    {
      type: "button",
      "data-slot": "toggle-group-item",
      className: Ke(W2({ variant: o, size: a }), n),
      ...i
    }
  );
}
function eA({ className: n, ...o }) {
  return /* @__PURE__ */ x.jsx(o1, { "data-slot": "spinner", role: "status", "aria-label": "Loading", className: Ke("tw:size-4 tw:animate-spin", n), ...o });
}
const fS = /* @__PURE__ */ y.createContext(void 0);
function Mi(n) {
  const o = y.useContext(fS);
  if (o === void 0 && !n)
    throw new Error(At(72));
  return o;
}
const tA = {
  ...Jc,
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
class mg extends Ti {
  constructor(o, a, i = !1) {
    const u = new ia(), f = {
      ...nA(),
      ...o
    };
    f.floatingRootContext = eg(u, a, i), super(f, {
      popupRef: /* @__PURE__ */ y.createRef(),
      onOpenChange: void 0,
      onOpenChangeComplete: void 0,
      triggerElements: u
    }, tA);
  }
  setOpen = (o, a) => {
    FC(this, o, a, {
      extraState: {
        openChangeReason: a.reason
      }
    });
  };
  // Used by trigger clicks to clear a delayed hover open without reporting a public open-state change.
  cancelPendingOpen(o) {
    this.state.floatingRootContext.dispatchOpenChange(!1, Ye(ql, o));
  }
  static useStore(o, a) {
    return Zp(o, (u, f) => new mg(a, u, f)).store;
  }
}
function nA() {
  return {
    ...Zc(),
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
const lA = Kp(function(o) {
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
    children: R
  } = o, w = mg.useStore(v?.store, {
    open: i,
    openProp: u,
    activeTriggerId: S,
    triggerIdProp: b
  });
  $p(w, u, i, S), w.useControlledProp("openProp", u), w.useControlledProp("triggerIdProp", b), w.useContextCallback("onOpenChange", m), w.useContextCallback("onOpenChangeComplete", d);
  const M = w.useState("open"), E = !a && M, A = w.useState("activeTriggerId"), O = w.useState("mounted"), z = w.useState("payload");
  w.useSyncedValues({
    trackCursorAxis: p,
    disableHoverablePopup: f
  }), w.useSyncedValue("disabled", a), Fc(w, {
    closeOnActiveTriggerUnmount: !0
  });
  const {
    forceUnmount: D,
    transitionStatus: j
  } = Kc(E, w), N = w.useState("isInstantPhase"), U = w.useState("instantType"), _ = w.useState("lastOpenChangeReason"), G = y.useRef(null);
  xe(() => {
    M && a && w.setOpen(!1, Ye(iR));
  }, [M, a, w]), xe(() => {
    j === "ending" && _ === zo || j !== "ending" && N ? (U !== "delay" && (G.current = U), w.set("instantType", "delay")) : G.current !== null && (w.set("instantType", G.current), G.current = null);
  }, [j, N, _, U, w]), xe(() => {
    E && A == null && w.set("payload", void 0);
  }, [w, A, E]);
  const k = y.useCallback(() => {
    w.setOpen(!1, Ye(Lc));
  }, [w]);
  y.useImperativeHandle(g, () => ({
    unmount: D,
    close: k
  }), [D, k]);
  const ee = E || O || !a && p !== "none";
  return /* @__PURE__ */ x.jsxs(fS.Provider, {
    value: w,
    children: [ee && /* @__PURE__ */ x.jsx(oA, {
      store: w,
      disabled: a,
      trackCursorAxis: p
    }), typeof R == "function" ? R({
      payload: z
    }) : R]
  });
});
function oA({
  store: n,
  disabled: o,
  trackCursorAxis: a
}) {
  const i = n.useState("floatingRootContext"), u = Ei(i, {
    enabled: !o,
    referencePress: () => n.select("closeOnClick")
  }), f = PR(i, {
    enabled: !o && a !== "none",
    axis: a === "none" ? void 0 : a
  }), p = y.useMemo(() => bn(f.reference, u.reference), [f.reference, u.reference]), g = y.useMemo(() => bn(f.trigger, u.trigger), [f.trigger, u.trigger]), m = y.useMemo(() => bn(aa, f.floating, u.floating), [f.floating, u.floating]);
  return Qc(n, {
    activeTriggerProps: p,
    inactiveTriggerProps: g,
    popupProps: m
  }), null;
}
const dS = /* @__PURE__ */ y.createContext(void 0);
function rA() {
  return y.useContext(dS);
}
let aA = (function(n) {
  return n[n.popupOpen = Ec.popupOpen] = "popupOpen", n.triggerDisabled = "data-trigger-disabled", n;
})({});
const iA = 600, pS = "data-base-ui-tooltip-trigger";
function Tb(n) {
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
function sA(n) {
  let o = n;
  for (; o; ) {
    if (o.hasAttribute(pS))
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
const cA = X0(function(o, a) {
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
    ...R
  } = o, w = Mi(!0), M = p?.store ?? w;
  if (!M)
    throw new Error(At(82));
  const E = Bn(S), A = M.useState("isTriggerActive", E), O = M.useState("isOpenedByTrigger", E), z = M.useState("floatingRootContext"), D = y.useRef(null), j = d ?? iA, N = b ?? 0, {
    registerTrigger: U,
    isMountedByThisTrigger: _
  } = Wp(E, D, M, {
    payload: g,
    closeOnClick: v,
    closeDelay: N
  }), G = rA(), {
    delayRef: k,
    isInstantPhase: ee,
    hasProvider: Q
  } = fR(z, {
    open: O
  }), X = lg(z);
  M.useSyncedValue("isInstantPhase", ee);
  const Z = M.useState("disabled"), q = m ?? Z, H = Yt(q), Y = M.useState("trackCursorAxis"), V = M.useState("disableHoverablePopup"), K = y.useRef(!1), B = an(), C = y.useRef(void 0);
  function L() {
    const fe = G?.delay, ye = typeof k.current == "object" ? k.current.open : void 0;
    let Re = j;
    return Q && (ye !== 0 ? Re = d ?? fe ?? j : Re = 0), Re;
  }
  function ne(fe) {
    const ye = D.current;
    if (!ye || !fe)
      return !1;
    const Re = sA(fe);
    return Re !== null && Re !== ye && Le(ye, Re);
  }
  function J(fe) {
    const ye = ne(fe);
    return K.current = ye, ye && (X.openChangeTimeout.clear(), X.restTimeout.clear(), X.restTimeoutPending = !1, B.clear()), ye;
  }
  const re = $c(z, {
    enabled: !q,
    mouseOnly: !0,
    move: !1,
    handleClose: !V && Y !== "both" ? eu() : null,
    restMs: L,
    delay() {
      const fe = typeof k.current == "object" ? k.current.close : void 0;
      let ye = N;
      return b == null && Q && (ye = fe), {
        close: ye
      };
    },
    triggerElementRef: D,
    isActiveTrigger: A,
    isClosing: () => M.select("transitionStatus") === "ending",
    shouldOpen() {
      return !K.current;
    }
  }), ie = ex(z, {
    enabled: !q
  }).reference, oe = (fe) => {
    const ye = K.current, Re = Tb(fe), _e = J(Re), ke = D.current, we = ke && Re && Le(ke, Re);
    if (_e && M.select("open") && M.select("lastOpenChangeReason") === Pt) {
      M.setOpen(!1, Ye(Pt, fe));
      return;
    }
    if (ye && !_e && we && !H.current && !M.select("open") && ke && // Match the hover hook's non-strict mouse fallback for mouse-only event sequences.
    or(C.current)) {
      const Ce = () => {
        !K.current && !H.current && !M.select("open") && M.setOpen(!0, Ye(Pt, fe, ke));
      }, he = L();
      he === 0 ? (B.clear(), Ce()) : B.start(he, Ce);
    }
  }, se = M.useState("triggerProps", _);
  return nt("button", o, {
    state: {
      open: O
    },
    ref: [a, U, D],
    props: [re, ie, _ || Y !== "none" ? se : void 0, {
      onMouseOver(fe) {
        oe(fe.nativeEvent);
      },
      onFocus(fe) {
        ne(Tb(fe.nativeEvent)) && fe.preventBaseUIHandler();
      },
      onMouseLeave() {
        K.current = !1, B.clear(), C.current = void 0;
      },
      onPointerEnter(fe) {
        C.current = fe.pointerType;
      },
      onPointerDown(fe) {
        C.current = fe.pointerType, M.set("closeOnClick", v), v && !M.select("open") && M.cancelPendingOpen(fe.nativeEvent);
      },
      onClick(fe) {
        v && !M.select("open") && M.cancelPendingOpen(fe.nativeEvent);
      },
      id: E,
      [aA.triggerDisabled]: q ? "" : void 0,
      [pS]: q ? void 0 : ""
    }, R],
    stateAttributesMapping: tu
  });
}), gS = /* @__PURE__ */ y.createContext(void 0);
function uA() {
  const n = y.useContext(gS);
  if (n === void 0)
    throw new Error(At(70));
  return n;
}
const fA = /* @__PURE__ */ y.forwardRef(function(o, a) {
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
  } = z0({
    container: u,
    ref: a,
    componentProps: o,
    elementProps: m
  });
  return !v && !d ? null : /* @__PURE__ */ x.jsxs(y.Fragment, {
    children: [v, d && /* @__PURE__ */ gl.createPortal(i, d)]
  });
}), dA = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    keepMounted: i = !1,
    ...u
  } = o;
  return Mi().useState("mounted") || i ? /* @__PURE__ */ x.jsx(gS.Provider, {
    value: i,
    children: /* @__PURE__ */ x.jsx(fA, {
      ref: a,
      ...u
    })
  }) : null;
}), mS = /* @__PURE__ */ y.createContext(void 0);
function hS() {
  const n = y.useContext(mS);
  if (n === void 0)
    throw new Error(At(71));
  return n;
}
const pA = /* @__PURE__ */ y.forwardRef(function(o, a) {
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
    arrowPadding: R = 5,
    sticky: w = !1,
    disableAnchorTracking: M = !1,
    collisionAvoidance: E = Yp,
    style: A,
    ...O
  } = o, z = Mi(), D = uA(), j = z.useState("open"), N = z.useState("mounted"), U = z.useState("trackCursorAxis"), _ = z.useState("disableHoverablePopup"), G = z.useState("floatingRootContext"), k = z.useState("instantType"), ee = z.useState("transitionStatus"), Q = z.useState("hasViewport"), X = uu({
    anchor: f,
    positionMethod: p,
    floatingRootContext: G,
    mounted: N,
    side: g,
    sideOffset: d,
    align: m,
    alignOffset: v,
    collisionBoundary: b,
    collisionPadding: S,
    sticky: w,
    arrowPadding: R,
    disableAnchorTracking: M,
    keepMounted: D,
    collisionAvoidance: E,
    adaptiveOrigin: Q ? ig : void 0
  }), Z = y.useMemo(() => ({
    open: j,
    side: X.side,
    align: X.align,
    anchorHidden: X.anchorHidden,
    instant: U !== "none" ? "tracking-cursor" : k
  }), [j, X.side, X.align, X.anchorHidden, U, k]), q = fu(o, Z, {
    styles: X.positionerStyles,
    transitionStatus: ee,
    props: O,
    refs: [a, z.useStateSetter("positionerElement")],
    hidden: !N,
    inert: !j || U === "both" || _
  });
  return /* @__PURE__ */ x.jsx(mS.Provider, {
    value: X,
    children: q
  });
}), gA = {
  ...ko,
  ...jo
}, mA = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    ...p
  } = o, g = Mi(), {
    side: m,
    align: d
  } = hS(), v = g.useState("open"), b = g.useState("instantType"), S = g.useState("transitionStatus"), R = g.useState("popupProps"), w = g.useState("floatingRootContext"), M = g.useState("disabled"), E = g.useState("closeDelay");
  Ql({
    open: v,
    ref: g.context.popupRef,
    onComplete() {
      v && g.context.onOpenChangeComplete?.(!0);
    }
  }), og(w, {
    enabled: !M,
    closeDelay: E
  });
  const A = g.useStateSetter("popupElement");
  return nt("div", o, {
    state: {
      open: v,
      side: m,
      align: d,
      instant: b,
      transitionStatus: S
    },
    ref: [a, g.context.popupRef, A],
    props: [R, Oi(S), p],
    stateAttributesMapping: gA
  });
}), hA = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    ...p
  } = o, g = Mi(), {
    arrowRef: m,
    side: d,
    align: v,
    arrowUncentered: b,
    arrowStyles: S
  } = hS(), R = g.useState("open"), w = g.useState("instantType");
  return nt("div", o, {
    state: {
      open: R,
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
    stateAttributesMapping: ko
  });
}), yA = function(o) {
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
  return /* @__PURE__ */ x.jsx(dS.Provider, {
    value: f,
    children: /* @__PURE__ */ x.jsx(uR, {
      delay: p,
      timeoutMs: u,
      children: o.children
    })
  });
};
function vA({
  delay: n = 0,
  ...o
}) {
  return /* @__PURE__ */ x.jsx(
    yA,
    {
      "data-slot": "tooltip-provider",
      delay: n,
      ...o
    }
  );
}
function bA({ ...n }) {
  return /* @__PURE__ */ x.jsx(lA, { "data-slot": "tooltip", ...n });
}
function xA({ ...n }) {
  return /* @__PURE__ */ x.jsx(cA, { "data-slot": "tooltip-trigger", ...n });
}
function SA({
  className: n,
  side: o = "top",
  sideOffset: a = 4,
  align: i = "center",
  alignOffset: u = 0,
  children: f,
  ...p
}) {
  return /* @__PURE__ */ x.jsx(dA, { children: /* @__PURE__ */ x.jsx(
    pA,
    {
      align: i,
      alignOffset: u,
      side: o,
      sideOffset: a,
      className: "tw:isolate tw:z-[var(--z-popover)]",
      children: /* @__PURE__ */ x.jsxs(
        mA,
        {
          "data-slot": "tooltip-content",
          className: Ke(
            "tw:inline-flex tw:w-fit tw:max-w-xs tw:items-center tw:gap-1.5 tw:rounded-[var(--radius-control)] tw:bg-foreground tw:px-3 tw:py-1.5 tw:text-[var(--fs-label)] tw:text-background tw:has-data-[slot=kbd]:pr-1.5 tw:**:data-[slot=kbd]:relative tw:**:data-[slot=kbd]:isolate tw:**:data-[slot=kbd]:rounded-sm",
            n
          ),
          ...p,
          children: [
            f,
            /* @__PURE__ */ x.jsx(hA, { className: "tw:size-2.5 tw:translate-y-[calc(-50%-2px)] tw:rotate-45 tw:rounded-[2px] tw:bg-foreground tw:fill-foreground tw:data-[side=bottom]:top-1 tw:data-[side=inline-end]:top-1/2! tw:data-[side=inline-end]:-left-1 tw:data-[side=inline-end]:-translate-y-1/2 tw:data-[side=inline-start]:top-1/2! tw:data-[side=inline-start]:-right-1 tw:data-[side=inline-start]:-translate-y-1/2 tw:data-[side=left]:top-1/2! tw:data-[side=left]:-right-1 tw:data-[side=left]:-translate-y-1/2 tw:data-[side=right]:top-1/2! tw:data-[side=right]:-left-1 tw:data-[side=right]:-translate-y-1/2 tw:data-[side=top]:-bottom-2.5" })
          ]
        }
      )
    }
  ) });
}
const yS = 420;
function wA(n) {
  const [o, a] = n.split("-");
  return { side: o, align: a ?? "center" };
}
function EA({ children: n }) {
  return /* @__PURE__ */ x.jsx(vA, { delay: yS, closeDelay: 0, children: n });
}
function Zd(n) {
  const { label: o, children: a, placement: i = "top" } = n, u = $d.useId(), [f, p] = $d.useState(!1);
  return /* @__PURE__ */ x.jsxs(bA, { open: f, onOpenChange: p, children: [
    /* @__PURE__ */ x.jsx(
      xA,
      {
        delay: yS,
        closeDelay: 0,
        "aria-describedby": f ? u : void 0,
        onBlur: () => p(!1),
        onMouseLeave: () => p(!1),
        render: a
      }
    ),
    /* @__PURE__ */ x.jsx(SA, { id: u, role: "tooltip", ...wA(i), className: "ui-tooltip open", children: o })
  ] });
}
const vt = (n) => document.getElementById(n);
function Qr(n) {
  vt(n)?.click();
}
function vS(n) {
  const o = vt(n);
  return o ? [...o.options].map((a) => ({ value: a.value, label: a.text })) : [];
}
function bS(n, o) {
  const a = vt(n);
  a && (a.value = o, a.dispatchEvent(new Event("change", { bubbles: !0 })));
}
function oc(n, o) {
  return [...document.querySelectorAll(`#${n} ${o}`)].map((a, i) => ({
    key: a.dataset.pick ?? a.dataset.wfpick ?? a.dataset.rec ?? a.dataset.cat ?? a.dataset.fmt ?? String(i),
    label: (a instanceof HTMLInputElement ? a.closest("label")?.textContent : a.textContent)?.replace(/\s+/g, " ").trim() || "Option",
    active: a instanceof HTMLInputElement && a.checked || a.classList.contains("on") || a.closest(".mi")?.classList.contains("on") === !0,
    element: a
  }));
}
const Rb = /* @__PURE__ */ new Set(["png", "jpg", "svg", "mp4", "pdf", "html", "docx", "xlsx", "csv", "md"]);
function Sp(n) {
  return n.replace(/\s+\d+$/, "").trim();
}
function Jd(n) {
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
function TA(n) {
  return [...document.querySelectorAll("#activeChips [data-fx]:not([data-fx='fav'])")].map((o) => {
    const a = o.dataset.fx ?? "filter";
    let i = o.parentElement?.textContent?.replace("×", "").trim() || "Filter";
    return a === "fmt" && n?.summary ? i = n.summary : i = i.replace(/^(Formats|Status|Folder|Collection):\s*/, ""), { key: a, label: i, remove: o };
  });
}
function RA({
  state: n,
  folder: o,
  collectionItems: a,
  workflowItems: i
}) {
  const [u, f] = y.useState(""), [p, g] = y.useState(!1), [m, d] = y.useState(!1), [v, b] = y.useState(""), [S, R] = y.useState(!1), [w, M] = y.useState(!1), E = window.__galleryFileTypes, A = n.types.filter((k) => k.active).map((k) => k.key), O = n.pinned.map((k) => n.types.find((ee) => ee.key === k)).filter((k) => !!k), z = O.filter((k) => Rb.has(k.key)), D = O.filter((k) => !Rb.has(k.key)), j = n.types.filter((k) => {
    const ee = u.trim().toLowerCase();
    return !ee || k.key.includes(ee) || k.label.toLowerCase().includes(ee);
  }), N = vS("folder").map((k) => ({
    value: k.value,
    label: k.value ? k.label : "All folders"
  })), U = (k, ee) => {
    const Q = new Set(k);
    E?.setActive([...A.filter((X) => !Q.has(X)), ...ee]);
  }, _ = () => {
    const k = v.trim();
    k && (E?.savePreset(k), b(""), d(!1));
  };
  if (p)
    return /* @__PURE__ */ x.jsxs(x.Fragment, { children: [
      /* @__PURE__ */ x.jsxs(t2, { className: "gallery-filter-panel-head", children: [
        /* @__PURE__ */ x.jsx(yp, { className: "tw:sr-only", children: "File types" }),
        /* @__PURE__ */ x.jsx(vp, { className: "tw:sr-only", children: "Customize quick file types for this project" }),
        /* @__PURE__ */ x.jsxs("div", { children: [
          /* @__PURE__ */ x.jsx("div", { className: "gallery-filter-panel-title", children: "Customize Quick Types" }),
          /* @__PURE__ */ x.jsxs("div", { className: "gallery-filter-helper", children: [
            "Saved for ",
            n.projectName
          ] })
        ] }),
        /* @__PURE__ */ x.jsx(Mt, { variant: "ghost", size: "sm", onClick: () => g(!1), children: "Done" })
      ] }),
      /* @__PURE__ */ x.jsx(li, {}),
      /* @__PURE__ */ x.jsx("div", { className: "gallery-filter-scroll", children: /* @__PURE__ */ x.jsxs("div", { className: "gallery-filter-section", children: [
        /* @__PURE__ */ x.jsx("div", { className: "gallery-filter-section-label", children: "Choose pinned types" }),
        /* @__PURE__ */ x.jsx(
          Kd,
          {
            multiple: !0,
            value: n.pinned,
            onValueChange: (k) => E?.setPinned(k),
            className: "gallery-type-customize-grid",
            "aria-label": "Quick file types for this project",
            children: n.types.map((k) => /* @__PURE__ */ x.jsxs(
              Qd,
              {
                value: k.key,
                variant: "outline",
                size: "sm",
                "data-gallery-customize-type": k.key,
                children: [
                  /* @__PURE__ */ x.jsx(tp, { "data-icon": "inline-start" }),
                  k.label
                ]
              },
              k.key
            ))
          }
        )
      ] }) })
    ] });
  const G = (k, ee) => {
    if (!ee.length) return null;
    const Q = ee.map((X) => X.key);
    return /* @__PURE__ */ x.jsxs("div", { className: "gallery-type-group", children: [
      /* @__PURE__ */ x.jsx("div", { className: "gallery-filter-sub-label", children: k }),
      /* @__PURE__ */ x.jsx(
        Kd,
        {
          multiple: !0,
          value: A.filter((X) => Q.includes(X)),
          onValueChange: (X) => U(Q, X),
          className: "gallery-quick-types",
          "aria-label": `${k.toLowerCase()} file types`,
          children: ee.map((X) => /* @__PURE__ */ x.jsxs(
            Qd,
            {
              value: X.key,
              variant: "outline",
              size: "sm",
              "data-gallery-quick-type": X.key,
              children: [
                X.active && /* @__PURE__ */ x.jsx(uc, { "data-icon": "inline-start" }),
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
    /* @__PURE__ */ x.jsx(yp, { className: "tw:sr-only", children: "File types" }),
    /* @__PURE__ */ x.jsx(vp, { className: "tw:sr-only", children: "Filter files and customize quick file types for this project" }),
    /* @__PURE__ */ x.jsxs("div", { className: "gallery-filter-scroll", "data-gallery-file-type-panel": !0, children: [
      /* @__PURE__ */ x.jsxs("section", { className: "gallery-filter-section", "aria-labelledby": "quick-types-heading", children: [
        /* @__PURE__ */ x.jsxs("div", { className: "gallery-filter-section-heading", children: [
          /* @__PURE__ */ x.jsxs("div", { children: [
            /* @__PURE__ */ x.jsx("div", { id: "quick-types-heading", className: "gallery-filter-section-label", children: "Quick Types" }),
            /* @__PURE__ */ x.jsx("div", { className: "gallery-filter-helper", children: "Pinned for this project" })
          ] }),
          /* @__PURE__ */ x.jsxs(Mt, { variant: "ghost", size: "xs", onClick: () => g(!0), children: [
            /* @__PURE__ */ x.jsx(Ab, { "data-icon": "inline-start" }),
            "Customize"
          ] })
        ] }),
        G("Outputs", z),
        G("Sources", D)
      ] }),
      /* @__PURE__ */ x.jsx(li, {}),
      /* @__PURE__ */ x.jsxs("section", { className: "gallery-filter-section", "aria-labelledby": "project-presets-heading", children: [
        /* @__PURE__ */ x.jsxs("div", { children: [
          /* @__PURE__ */ x.jsx("div", { id: "project-presets-heading", className: "gallery-filter-section-label", children: "Project Presets" }),
          /* @__PURE__ */ x.jsx("div", { className: "gallery-filter-helper", children: "Saved only in this project" })
        ] }),
        /* @__PURE__ */ x.jsxs("div", { className: "gallery-project-presets", children: [
          n.presets.map((k) => /* @__PURE__ */ x.jsxs("div", { className: "gallery-project-preset", children: [
            /* @__PURE__ */ x.jsx(
              Mt,
              {
                variant: k.active ? "secondary" : "outline",
                size: "xs",
                "data-gallery-file-preset": k.id,
                onClick: () => E?.applyPreset(k.id),
                children: k.label
              }
            ),
            k.custom && /* @__PURE__ */ x.jsx(
              Mt,
              {
                variant: "ghost",
                size: "icon-xs",
                "aria-label": `Delete preset ${k.label}`,
                onClick: () => E?.removePreset(k.id),
                children: /* @__PURE__ */ x.jsx(ci, {})
              }
            )
          ] }, k.id)),
          /* @__PURE__ */ x.jsxs(Mt, { variant: "outline", size: "xs", "data-gallery-new-preset": !0, onClick: () => d(!0), children: [
            /* @__PURE__ */ x.jsx(s1, { "data-icon": "inline-start" }),
            "New preset"
          ] })
        ] }),
        m && /* @__PURE__ */ x.jsxs(mp, { "data-gallery-preset-form": !0, children: [
          /* @__PURE__ */ x.jsx(
            hp,
            {
              "aria-label": "New preset name",
              placeholder: "Preset name…",
              value: v,
              onChange: (k) => b(k.target.value),
              onKeyDown: (k) => {
                k.key === "Enter" && (k.preventDefault(), _()), k.key === "Escape" && (k.stopPropagation(), d(!1));
              },
              autoFocus: !0
            }
          ),
          /* @__PURE__ */ x.jsx(Oc, { align: "inline-end", children: /* @__PURE__ */ x.jsx(Yx, { onClick: _, disabled: !v.trim(), children: "Save" }) })
        ] })
      ] }),
      /* @__PURE__ */ x.jsx(li, {}),
      /* @__PURE__ */ x.jsxs("section", { "aria-labelledby": "all-file-types-heading", children: [
        /* @__PURE__ */ x.jsxs(
          Mt,
          {
            variant: "ghost",
            size: "sm",
            className: "gallery-filter-disclosure",
            "aria-expanded": S,
            onClick: () => R((k) => !k),
            children: [
              /* @__PURE__ */ x.jsx("span", { id: "all-file-types-heading", children: "All file types" }),
              S ? /* @__PURE__ */ x.jsx(fc, { "data-icon": "inline-end" }) : /* @__PURE__ */ x.jsx(Wd, { "data-icon": "inline-end" })
            ]
          }
        ),
        S && /* @__PURE__ */ x.jsxs("div", { className: "gallery-filter-collapsible-content", children: [
          /* @__PURE__ */ x.jsxs(mp, { children: [
            /* @__PURE__ */ x.jsx(
              hp,
              {
                "aria-label": "Search file types",
                placeholder: "Search extension or language…",
                value: u,
                onChange: (k) => f(k.target.value)
              }
            ),
            /* @__PURE__ */ x.jsx(Oc, { align: "inline-start", "aria-hidden": "true", children: /* @__PURE__ */ x.jsx(ep, {}) })
          ] }),
          /* @__PURE__ */ x.jsx("div", { className: "gallery-all-types", role: "list", "aria-label": "All file types", children: j.map((k) => /* @__PURE__ */ x.jsxs("div", { className: "gallery-all-type-row", role: "listitem", children: [
            /* @__PURE__ */ x.jsxs(
              Mt,
              {
                variant: "ghost",
                size: "sm",
                "data-gallery-file-type": k.key,
                "aria-pressed": k.active,
                onClick: () => U([k.key], k.active ? [] : [k.key]),
                children: [
                  k.active && /* @__PURE__ */ x.jsx(uc, { "data-icon": "inline-start" }),
                  k.label
                ]
              }
            ),
            /* @__PURE__ */ x.jsx(
              Mt,
              {
                variant: "ghost",
                size: "icon-sm",
                "aria-label": `${k.pinned ? "Unpin" : "Pin"} ${k.label} for this project`,
                "aria-pressed": k.pinned,
                "data-gallery-pin-type": k.key,
                onClick: () => E?.setPinned(k.pinned ? n.pinned.filter((ee) => ee !== k.key) : [...n.pinned, k.key]),
                children: /* @__PURE__ */ x.jsx(tp, {})
              }
            )
          ] }, k.key)) })
        ] })
      ] }),
      /* @__PURE__ */ x.jsx(li, {}),
      /* @__PURE__ */ x.jsxs("section", { "aria-labelledby": "other-filters-heading", children: [
        /* @__PURE__ */ x.jsxs(
          Mt,
          {
            variant: "ghost",
            size: "sm",
            className: "gallery-filter-disclosure",
            "aria-expanded": w,
            onClick: () => M((k) => !k),
            children: [
              /* @__PURE__ */ x.jsx("span", { id: "other-filters-heading", children: "Folders, status & collections" }),
              w ? /* @__PURE__ */ x.jsx(fc, { "data-icon": "inline-end" }) : /* @__PURE__ */ x.jsx(Wd, { "data-icon": "inline-end" })
            ]
          }
        ),
        w && /* @__PURE__ */ x.jsxs("div", { className: "gallery-filter-section gallery-other-filters", children: [
          /* @__PURE__ */ x.jsxs("div", { className: "gallery-other-filter-row", children: [
            /* @__PURE__ */ x.jsx(WE, { "aria-hidden": "true" }),
            /* @__PURE__ */ x.jsxs(
              oS,
              {
                items: N,
                modal: !1,
                value: o?.value ?? "",
                onValueChange: (k) => bS("folder", k ?? ""),
                children: [
                  /* @__PURE__ */ x.jsx(iS, { size: "sm", "aria-label": "Filter by folder", children: /* @__PURE__ */ x.jsx(aS, {}) }),
                  /* @__PURE__ */ x.jsx(sS, { children: /* @__PURE__ */ x.jsx(rS, { children: N.map((k) => /* @__PURE__ */ x.jsx(cS, { value: k.value, children: k.label }, k.value || "all")) }) })
                ]
              }
            )
          ] }),
          i.length > 0 && /* @__PURE__ */ x.jsxs("div", { className: "gallery-type-group", children: [
            /* @__PURE__ */ x.jsx("div", { className: "gallery-filter-sub-label", children: "Status" }),
            /* @__PURE__ */ x.jsx(
              Kd,
              {
                value: i.filter((k) => k.active).map((k) => k.key),
                onValueChange: (k) => {
                  const ee = k.at(-1) ?? "";
                  i.find((Q) => Q.key === ee)?.element.click();
                },
                className: "gallery-workflow-types",
                "aria-label": "Workflow status",
                children: i.filter((k) => k.key).map((k) => /* @__PURE__ */ x.jsx(Qd, { value: k.key, variant: "outline", size: "sm", "data-gallery-status": k.key, children: Sp(k.label) }, k.key))
              }
            )
          ] }),
          a.length > 0 && /* @__PURE__ */ x.jsxs("div", { className: "gallery-type-group", children: [
            /* @__PURE__ */ x.jsx("div", { className: "gallery-filter-sub-label", children: "Collections" }),
            /* @__PURE__ */ x.jsx("div", { className: "gallery-collection-filters", children: a.map((k) => /* @__PURE__ */ x.jsx(Mt, { variant: k.active ? "secondary" : "outline", size: "sm", onClick: () => k.element.click(), children: Sp(k.label) }, k.key)) })
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ x.jsx(li, {}),
    /* @__PURE__ */ x.jsx("div", { className: "gallery-filter-panel-foot", children: /* @__PURE__ */ x.jsxs(Mt, { variant: "ghost", size: "sm", onClick: () => E?.resetFilters(), children: [
      /* @__PURE__ */ x.jsx(d1, { "data-icon": "inline-start" }),
      "Reset filters"
    ] }) })
  ] });
}
function CA(n) {
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
function OA() {
  const [, n] = y.useReducer((j) => j + 1, 0), [o, a] = y.useState(!1), [i, u] = y.useState(!1), f = vt("q")?.value ?? "", p = vt("sort"), g = vt("folder"), m = vt("favChip"), d = vt("rescan")?.classList.contains("spinning") === !0, v = vt("densitySeg")?.querySelector("button.on")?.dataset.d ?? "m", b = oc("collMenu", "[data-pick]"), S = oc("wfMenu", "[data-wfpick]"), R = oc("recMenu", "[data-rec]"), w = window.__galleryFileTypes?.getState() ?? {
    projectName: "this project",
    types: oc("fmtMenu", "input[data-fmt]").map((j) => ({
      key: j.key,
      label: Sp(j.label),
      active: j.active,
      pinned: !1
    })),
    pinned: [],
    presets: [],
    summary: "File types"
  }, M = window.__gallerySelection?.getState() ?? { rels: [], imageCount: 0 }, E = TA(w), A = document.querySelectorAll("#activeChips [data-fx]:not([data-fx='fav'])").length, O = m?.classList.contains("on") === !0, z = vS("sort").map((j) => ({ value: j.value, label: Jd(j.value) }));
  y.useEffect(() => {
    const j = () => n(), N = new MutationObserver(j);
    [
      vt("activeChips"),
      vt("densitySeg"),
      vt("favChip"),
      vt("rescan"),
      vt("fmtMenu"),
      vt("collMenu"),
      vt("wfMenu"),
      vt("recMenu"),
      vt("selBar")
    ].filter((G) => !!G).forEach((G) => N.observe(G, {
      attributes: !0,
      childList: !0,
      characterData: !0,
      subtree: !0
    }));
    const _ = [vt("q"), vt("sort"), vt("folder")].filter((G) => !!G);
    return _.forEach((G) => {
      G.addEventListener("input", j), G.addEventListener("change", j);
    }), window.addEventListener("atelier-gallery-file-types-change", j), window.addEventListener("atelier-gallery-selection-change", j), document.documentElement.classList.add("gallery-react-mounted"), document.documentElement.dataset.galleryUi = "shadcn-react-v1", () => {
      N.disconnect(), _.forEach((G) => {
        G.removeEventListener("input", j), G.removeEventListener("change", j);
      }), window.removeEventListener("atelier-gallery-file-types-change", j), window.removeEventListener("atelier-gallery-selection-change", j), document.documentElement.classList.remove("gallery-react-mounted");
    };
  }, []), y.useEffect(() => {
    M.rels.length && (a(!1), u(!1));
  }, [M.rels.length]), y.useEffect(() => {
    const j = (N) => {
      const U = N.target, _ = U?.matches("input, textarea, select") || U?.isContentEditable;
      N.key !== "/" || N.metaKey || N.ctrlKey || N.altKey || _ || (N.preventDefault(), u(!1), a(!0));
    };
    return document.addEventListener("keydown", j), () => document.removeEventListener("keydown", j);
  }, []);
  const D = (j) => {
    const N = vt("q");
    N && (N.value = j, N.dispatchEvent(new Event("input", { bubbles: !0 })));
  };
  if (M.rels.length) {
    const j = window.__gallerySelection;
    return /* @__PURE__ */ x.jsxs("div", { className: "gallery-command-bar gallery-selection-command-bar", role: "toolbar", "aria-label": "Selected files actions", "data-gallery-toolbar-state": "selection", children: [
      /* @__PURE__ */ x.jsxs("div", { className: "gallery-selection-count", "aria-live": "polite", children: [
        /* @__PURE__ */ x.jsx(h1, { "aria-hidden": "true" }),
        /* @__PURE__ */ x.jsxs("span", { children: [
          M.rels.length,
          " selected"
        ] })
      ] }),
      /* @__PURE__ */ x.jsx("div", { className: "gallery-command-spacer" }),
      M.rels.length === 1 && /* @__PURE__ */ x.jsx(Mt, { variant: "outline", size: "sm", "data-gallery-selection-action": "open", onClick: () => j?.open(), children: "Open" }),
      M.imageCount >= 2 && /* @__PURE__ */ x.jsx(Mt, { variant: "outline", size: "sm", "data-gallery-selection-action": "compare", onClick: () => j?.compare(), children: "Compare" }),
      /* @__PURE__ */ x.jsx(Mt, { variant: "outline", size: "sm", "data-gallery-selection-action": "collect", onClick: (N) => {
        N.stopPropagation(), j?.collect(N.currentTarget);
      }, children: "Collect" }),
      /* @__PURE__ */ x.jsxs(Mt, { variant: "outline", size: "sm", "data-gallery-selection-action": "export", onClick: (N) => {
        N.stopPropagation(), j?.export(N.currentTarget);
      }, children: [
        "Export ",
        /* @__PURE__ */ x.jsx(fc, { "data-icon": "inline-end" })
      ] }),
      /* @__PURE__ */ x.jsxs(qd, { modal: !1, children: [
        /* @__PURE__ */ x.jsx(Xd, { render: /* @__PURE__ */ x.jsx(Mt, { variant: "ghost", size: "icon-sm", "aria-label": "More selection actions", children: /* @__PURE__ */ x.jsx(yv, {}) }) }),
        /* @__PURE__ */ x.jsxs(cc, { align: "end", className: "tw:w-48", children: [
          /* @__PURE__ */ x.jsx(er, { children: /* @__PURE__ */ x.jsx(tr, { onClick: () => j?.hide(), children: "Hide selected" }) }),
          /* @__PURE__ */ x.jsx(Fd, {}),
          /* @__PURE__ */ x.jsx(er, { children: /* @__PURE__ */ x.jsxs(tr, { variant: "destructive", onClick: () => j?.delete(), children: [
            /* @__PURE__ */ x.jsx(zb, { "data-icon": "inline-start" }),
            " Move to Trash"
          ] }) })
        ] })
      ] }),
      /* @__PURE__ */ x.jsx(Zd, { label: "Clear selection (Esc)", children: /* @__PURE__ */ x.jsx(Mt, { variant: "ghost", size: "icon-sm", "aria-label": "Clear selection", "data-gallery-selection-action": "clear", onClick: () => j?.clear(), children: /* @__PURE__ */ x.jsx(ci, {}) }) })
    ] });
  }
  return /* @__PURE__ */ x.jsxs("div", { className: "gallery-command-bar", role: "toolbar", "aria-label": "Gallery commands", "data-gallery-toolbar-state": "normal", children: [
    /* @__PURE__ */ x.jsxs(yb, { open: o, onOpenChange: (j) => {
      a(j), j && u(!1);
    }, children: [
      /* @__PURE__ */ x.jsx(Zd, { label: f ? "Edit search" : "Search files (/)", children: /* @__PURE__ */ x.jsx(
        vb,
        {
          render: /* @__PURE__ */ x.jsx(
            Mt,
            {
              variant: f ? "secondary" : "outline",
              size: "icon-sm",
              "aria-label": f ? `Search files: ${f}` : "Search files",
              "aria-pressed": o,
              children: /* @__PURE__ */ x.jsx(ep, {})
            }
          )
        }
      ) }),
      /* @__PURE__ */ x.jsxs(bb, { align: "start", sideOffset: 6, className: "gallery-search-popover tw:gap-0 tw:p-2", children: [
        /* @__PURE__ */ x.jsx(yp, { className: "tw:sr-only", children: "Search project files" }),
        /* @__PURE__ */ x.jsx(vp, { className: "tw:sr-only", children: "Search by file name or folder" }),
        /* @__PURE__ */ x.jsxs(mp, { "data-gallery-command-group": "search", children: [
          /* @__PURE__ */ x.jsx(
            hp,
            {
              "aria-label": "Search project files",
              "data-gallery-command": "search",
              placeholder: "Search by name or folder…",
              value: f,
              onChange: (j) => D(j.target.value),
              autoFocus: !0
            }
          ),
          /* @__PURE__ */ x.jsx(Oc, { align: "inline-start", "aria-hidden": "true", children: /* @__PURE__ */ x.jsx(ep, {}) }),
          f && /* @__PURE__ */ x.jsx(Oc, { align: "inline-end", children: /* @__PURE__ */ x.jsx(Yx, { size: "icon-xs", "aria-label": "Clear search", onClick: () => D(""), children: /* @__PURE__ */ x.jsx(ci, {}) }) })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ x.jsxs(yb, { open: i, onOpenChange: (j) => {
      u(j), j && a(!1);
    }, children: [
      /* @__PURE__ */ x.jsx(
        vb,
        {
          render: /* @__PURE__ */ x.jsxs(Mt, { variant: A ? "secondary" : "outline", size: "sm", children: [
            /* @__PURE__ */ x.jsx(t1, { "data-icon": "inline-start" }),
            /* @__PURE__ */ x.jsxs("span", { "data-gallery-command": "filters", children: [
              "Filters",
              A ? ` ${A}` : ""
            ] })
          ] })
        }
      ),
      /* @__PURE__ */ x.jsx(bb, { align: "start", sideOffset: 6, className: "gallery-filter-popover tw:w-[min(360px,calc(100vw-24px))] tw:gap-0 tw:p-0", children: /* @__PURE__ */ x.jsx(
        RA,
        {
          state: w,
          folder: g,
          collectionItems: b,
          workflowItems: S
        }
      ) })
    ] }),
    /* @__PURE__ */ x.jsxs(
      Mt,
      {
        variant: O ? "secondary" : "outline",
        size: "sm",
        "data-gallery-command": "favorites",
        "aria-label": "Favorites",
        "aria-pressed": O,
        onClick: () => Qr("favChip"),
        children: [
          /* @__PURE__ */ x.jsx(tp, { "data-icon": "inline-start" }),
          /* @__PURE__ */ x.jsx("span", { className: "gallery-fav-label", children: "Favorites" })
        ]
      }
    ),
    /* @__PURE__ */ x.jsxs(oS, { items: z, modal: !1, value: p?.value ?? "mtime", onValueChange: (j) => j && bS("sort", j), children: [
      /* @__PURE__ */ x.jsx(
        iS,
        {
          size: "sm",
          className: "gallery-command-select gallery-command-sort",
          "aria-label": `Sort project files: ${Jd(p?.value ?? "mtime")}`,
          children: /* @__PURE__ */ x.jsx(aS, { children: (j) => Jd(String(j)) })
        }
      ),
      /* @__PURE__ */ x.jsx(sS, { children: /* @__PURE__ */ x.jsx(rS, { children: z.map((j) => /* @__PURE__ */ x.jsx(cS, { value: j.value, children: j.label }, j.value)) }) })
    ] }),
    /* @__PURE__ */ x.jsxs(qd, { modal: !1, children: [
      /* @__PURE__ */ x.jsx(Xd, { render: /* @__PURE__ */ x.jsxs(Mt, { variant: "outline", size: "sm", "aria-label": "View options", children: [
        /* @__PURE__ */ x.jsx(vv, { "data-icon": "inline-start" }),
        /* @__PURE__ */ x.jsx("span", { className: "gallery-view-label", children: "View" })
      ] }) }),
      /* @__PURE__ */ x.jsx(cc, { align: "end", className: "tw:w-44", children: /* @__PURE__ */ x.jsxs(er, { children: [
        /* @__PURE__ */ x.jsx(wM, { children: "Card size" }),
        [{ key: "s", label: "Compact" }, { key: "m", label: "Standard" }, { key: "l", label: "Large" }].map((j) => /* @__PURE__ */ x.jsx(
          CM,
          {
            checked: v === j.key,
            "data-gallery-density": j.key,
            onClick: () => vt("densitySeg")?.querySelector(`[data-d="${j.key}"]`)?.click(),
            children: j.label
          },
          j.key
        ))
      ] }) })
    ] }),
    /* @__PURE__ */ x.jsxs(qd, { modal: !1, children: [
      /* @__PURE__ */ x.jsx(Zd, { label: "Gallery tools", children: /* @__PURE__ */ x.jsx(Xd, { render: /* @__PURE__ */ x.jsx(Mt, { variant: "outline", size: "icon-sm", "aria-label": "Gallery tools", children: /* @__PURE__ */ x.jsx(yv, {}) }) }) }),
      /* @__PURE__ */ x.jsxs(cc, { align: "end", className: "tw:w-48", children: [
        /* @__PURE__ */ x.jsxs(er, { children: [
          /* @__PURE__ */ x.jsxs(tr, { "data-gallery-command": "rescan", disabled: d, onClick: () => Qr("rescan"), children: [
            d ? /* @__PURE__ */ x.jsx(eA, { "data-icon": "inline-start" }) : /* @__PURE__ */ x.jsx(u1, { "data-icon": "inline-start" }),
            d ? "Rescanning…" : "Rescan project"
          ] }),
          /* @__PURE__ */ x.jsxs(tr, { onClick: () => Qr("viewChip"), children: [
            /* @__PURE__ */ x.jsx(Ab, { "data-icon": "inline-start" }),
            " Gallery settings…"
          ] })
        ] }),
        /* @__PURE__ */ x.jsx(Fd, {}),
        /* @__PURE__ */ x.jsxs(er, { children: [
          /* @__PURE__ */ x.jsxs(tr, { onClick: () => Qr("boardChip"), children: [
            /* @__PURE__ */ x.jsx(vv, { "data-icon": "inline-start" }),
            " Board"
          ] }),
          /* @__PURE__ */ x.jsxs(tr, { onClick: () => Qr("notesChip"), children: [
            /* @__PURE__ */ x.jsx(a1, { "data-icon": "inline-start" }),
            " Notes"
          ] })
        ] }),
        R.length > 0 && /* @__PURE__ */ x.jsxs(x.Fragment, { children: [
          /* @__PURE__ */ x.jsx(Fd, {}),
          /* @__PURE__ */ x.jsx(er, { children: /* @__PURE__ */ x.jsxs(EM, { children: [
            /* @__PURE__ */ x.jsx(TM, { children: "Recent files" }),
            /* @__PURE__ */ x.jsx(RM, { children: /* @__PURE__ */ x.jsx(er, { children: R.map((j) => /* @__PURE__ */ x.jsx(tr, { onClick: () => j.element.click(), children: j.label }, j.key)) }) })
          ] }) })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ x.jsx("div", { className: "gallery-active-filters", "aria-label": "Active filters", children: E.map((j) => /* @__PURE__ */ x.jsxs(
      Mt,
      {
        variant: "outline",
        size: "xs",
        className: "gallery-filter-chip",
        "data-gallery-filter-chip": j.key,
        "aria-label": `Remove filter ${j.label}`,
        onClick: () => j.remove.click(),
        children: [
          j.label,
          /* @__PURE__ */ x.jsx(ci, { "data-icon": "inline-end" })
        ]
      },
      j.key
    )) })
  ] });
}
function MA() {
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
  const u = n ? CA(n) : null;
  return /* @__PURE__ */ x.jsx(OO, { open: !!n, onOpenChange: (f) => {
    f || i(!1);
  }, children: /* @__PURE__ */ x.jsxs(zO, { children: [
    /* @__PURE__ */ x.jsxs(DO, { children: [
      u?.destructive && /* @__PURE__ */ x.jsx(_O, { variant: "destructive", children: /* @__PURE__ */ x.jsx(zb, {}) }),
      /* @__PURE__ */ x.jsx(HO, { children: u?.title }),
      u?.description && /* @__PURE__ */ x.jsx(UO, { children: u.description })
    ] }),
    /* @__PURE__ */ x.jsxs(jO, { variant: "plain", children: [
      /* @__PURE__ */ x.jsx(IO, { variant: "ghost", onClick: () => i(!1), children: "Cancel" }),
      /* @__PURE__ */ x.jsx(
        LO,
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
function AA() {
  const [n, o] = y.useState(document.body.classList.contains("has-insp")), [a, i] = y.useState(() => window.matchMedia("(max-width: 800px)").matches), [u, f] = y.useState(vt("inspTitle")?.textContent || "Inspector"), p = y.useRef(vt("inspector")), g = y.useCallback((m) => {
    const d = vt("inspBody");
    d && m && m.appendChild(d);
  }, []);
  return y.useLayoutEffect(() => () => {
    const m = vt("inspBody");
    m && p.current && p.current.appendChild(m);
  }, []), y.useEffect(() => {
    const m = () => {
      const b = document.documentElement.classList.contains("emb");
      o(!b && document.body.classList.contains("has-insp")), f(vt("inspTitle")?.textContent || "Inspector");
    }, d = new MutationObserver(m);
    d.observe(document.body, { attributes: !0, attributeFilter: ["class"] });
    const v = vt("inspTitle");
    return v && d.observe(v, { childList: !0, characterData: !0, subtree: !0 }), m(), () => d.disconnect();
  }, []), y.useEffect(() => {
    const m = window.matchMedia("(max-width: 800px)"), d = () => i(m.matches);
    return m.addEventListener("change", d), d(), () => m.removeEventListener("change", d);
  }, []), /* @__PURE__ */ x.jsx(
    _2,
    {
      modal: a,
      open: n,
      onOpenChange: (m, d) => {
        if (!m && d.reason === "escape-key") {
          d.cancel(), d.allowPropagation();
          return;
        }
        !m && document.body.classList.contains("has-insp") && Qr("inspClose");
      },
      children: /* @__PURE__ */ x.jsxs(
        L2,
        {
          side: "right",
          layer: a ? "modal" : "panel",
          keepMounted: !0,
          showOverlay: a,
          className: "tw:gap-0 tw:p-0",
          style: { width: "300px", maxWidth: "calc(100vw - 16px)" },
          children: [
            /* @__PURE__ */ x.jsxs(I2, { className: "tw:border-b tw:border-border tw:pr-12", children: [
              /* @__PURE__ */ x.jsx(B2, { children: u }),
              /* @__PURE__ */ x.jsx(V2, { className: "tw:sr-only", children: "File metadata and gallery actions" })
            ] }),
            /* @__PURE__ */ x.jsx("div", { ref: g, className: "tw:flex tw:min-h-0 tw:flex-1 tw:flex-col" })
          ]
        }
      )
    }
  );
}
const Cb = document.getElementById("gallery-react-toolbar");
Cb && VE.createRoot(Cb).render(
  /* @__PURE__ */ x.jsxs(EA, { children: [
    /* @__PURE__ */ x.jsx(OA, {}),
    /* @__PURE__ */ x.jsx(MA, {}),
    /* @__PURE__ */ x.jsx(AA, {})
  ] })
);
