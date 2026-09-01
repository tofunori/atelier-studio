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
function j1(n) {
  return n && n.__esModule && Object.prototype.hasOwnProperty.call(n, "default") ? n.default : n;
}
var Ad = { exports: {} }, ei = {};
var cv;
function k1() {
  if (cv) return ei;
  cv = 1;
  var n = /* @__PURE__ */ Symbol.for("react.transitional.element"), o = /* @__PURE__ */ Symbol.for("react.fragment");
  function a(i, u, f) {
    var p = null;
    if (f !== void 0 && (p = "" + f), u.key !== void 0 && (p = "" + u.key), "key" in u) {
      f = {};
      for (var m in u)
        m !== "key" && (f[m] = u[m]);
    } else f = u;
    return u = f.ref, {
      $$typeof: n,
      type: i,
      key: p,
      ref: u !== void 0 ? u : null,
      props: f
    };
  }
  return ei.Fragment = o, ei.jsx = a, ei.jsxs = a, ei;
}
var uv;
function _1() {
  return uv || (uv = 1, Ad.exports = k1()), Ad.exports;
}
var b = _1(), zd = { exports: {} }, Ge = {};
var fv;
function H1() {
  if (fv) return Ge;
  fv = 1;
  var n = /* @__PURE__ */ Symbol.for("react.transitional.element"), o = /* @__PURE__ */ Symbol.for("react.portal"), a = /* @__PURE__ */ Symbol.for("react.fragment"), i = /* @__PURE__ */ Symbol.for("react.strict_mode"), u = /* @__PURE__ */ Symbol.for("react.profiler"), f = /* @__PURE__ */ Symbol.for("react.consumer"), p = /* @__PURE__ */ Symbol.for("react.context"), m = /* @__PURE__ */ Symbol.for("react.forward_ref"), g = /* @__PURE__ */ Symbol.for("react.suspense"), d = /* @__PURE__ */ Symbol.for("react.memo"), v = /* @__PURE__ */ Symbol.for("react.lazy"), x = /* @__PURE__ */ Symbol.for("react.activity"), S = Symbol.iterator;
  function C(T) {
    return T === null || typeof T != "object" ? null : (T = S && T[S] || T["@@iterator"], typeof T == "function" ? T : null);
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
  function A(T, B, ne) {
    this.props = T, this.context = B, this.refs = E, this.updater = ne || w;
  }
  A.prototype.isReactComponent = {}, A.prototype.setState = function(T, B) {
    if (typeof T != "object" && typeof T != "function" && T != null)
      throw Error(
        "takes an object of state variables to update or a function which returns an object of state variables."
      );
    this.updater.enqueueSetState(this, T, B, "setState");
  }, A.prototype.forceUpdate = function(T) {
    this.updater.enqueueForceUpdate(this, T, "forceUpdate");
  };
  function O() {
  }
  O.prototype = A.prototype;
  function z(T, B, ne) {
    this.props = T, this.context = B, this.refs = E, this.updater = ne || w;
  }
  var N = z.prototype = new O();
  N.constructor = z, M(N, A.prototype), N.isPureReactComponent = !0;
  var I = Array.isArray;
  function j() {
  }
  var L = { H: null, A: null, T: null, S: null }, _ = Object.prototype.hasOwnProperty;
  function k(T, B, ne) {
    var J = ne.ref;
    return {
      $$typeof: n,
      type: T,
      key: B,
      ref: J !== void 0 ? J : null,
      props: ne
    };
  }
  function Y(T, B) {
    return k(T.type, B, T.props);
  }
  function te(T) {
    return typeof T == "object" && T !== null && T.$$typeof === n;
  }
  function F(T) {
    var B = { "=": "=0", ":": "=2" };
    return "$" + T.replace(/[=:]/g, function(ne) {
      return B[ne];
    });
  }
  var Q = /\/+/g;
  function Z(T, B) {
    return typeof T == "object" && T !== null && T.key != null ? F("" + T.key) : B.toString(36);
  }
  function q(T) {
    switch (T.status) {
      case "fulfilled":
        return T.value;
      case "rejected":
        throw T.reason;
      default:
        switch (typeof T.status == "string" ? T.then(j, j) : (T.status = "pending", T.then(
          function(B) {
            T.status === "pending" && (T.status = "fulfilled", T.value = B);
          },
          function(B) {
            T.status === "pending" && (T.status = "rejected", T.reason = B);
          }
        )), T.status) {
          case "fulfilled":
            return T.value;
          case "rejected":
            throw T.reason;
        }
    }
    throw T;
  }
  function H(T, B, ne, J, re) {
    var ie = typeof T;
    (ie === "undefined" || ie === "boolean") && (T = null);
    var oe = !1;
    if (T === null) oe = !0;
    else
      switch (ie) {
        case "bigint":
        case "string":
        case "number":
          oe = !0;
          break;
        case "object":
          switch (T.$$typeof) {
            case n:
            case o:
              oe = !0;
              break;
            case v:
              return oe = T._init, H(
                oe(T._payload),
                B,
                ne,
                J,
                re
              );
          }
      }
    if (oe)
      return re = re(T), oe = J === "" ? "." + Z(T, 0) : J, I(re) ? (ne = "", oe != null && (ne = oe.replace(Q, "$&/") + "/"), H(re, B, ne, "", function(je) {
        return je;
      })) : re != null && (te(re) && (re = Y(
        re,
        ne + (re.key == null || T && T.key === re.key ? "" : ("" + re.key).replace(
          Q,
          "$&/"
        ) + "/") + oe
      )), B.push(re)), 1;
    oe = 0;
    var se = J === "" ? "." : J + ":";
    if (I(T))
      for (var ge = 0; ge < T.length; ge++)
        J = T[ge], ie = se + Z(J, ge), oe += H(
          J,
          B,
          ne,
          ie,
          re
        );
    else if (ge = C(T), typeof ge == "function")
      for (T = ge.call(T), ge = 0; !(J = T.next()).done; )
        J = J.value, ie = se + Z(J, ge++), oe += H(
          J,
          B,
          ne,
          ie,
          re
        );
    else if (ie === "object") {
      if (typeof T.then == "function")
        return H(
          q(T),
          B,
          ne,
          J,
          re
        );
      throw B = String(T), Error(
        "Objects are not valid as a React child (found: " + (B === "[object Object]" ? "object with keys {" + Object.keys(T).join(", ") + "}" : B) + "). If you meant to render a collection of children, use an array instead."
      );
    }
    return oe;
  }
  function D(T, B, ne) {
    if (T == null) return T;
    var J = [], re = 0;
    return H(T, J, "", "", function(ie) {
      return B.call(ne, ie, re++);
    }), J;
  }
  function U(T) {
    if (T._status === -1) {
      var B = T._result;
      B = B(), B.then(
        function(ne) {
          (T._status === 0 || T._status === -1) && (T._status = 1, T._result = ne);
        },
        function(ne) {
          (T._status === 0 || T._status === -1) && (T._status = 2, T._result = ne);
        }
      ), T._status === -1 && (T._status = 0, T._result = B);
    }
    if (T._status === 1) return T._result.default;
    throw T._result;
  }
  var X = typeof reportError == "function" ? reportError : function(T) {
    if (typeof window == "object" && typeof window.ErrorEvent == "function") {
      var B = new window.ErrorEvent("error", {
        bubbles: !0,
        cancelable: !0,
        message: typeof T == "object" && T !== null && typeof T.message == "string" ? String(T.message) : String(T),
        error: T
      });
      if (!window.dispatchEvent(B)) return;
    } else if (typeof process == "object" && typeof process.emit == "function") {
      process.emit("uncaughtException", T);
      return;
    }
    console.error(T);
  }, P = {
    map: D,
    forEach: function(T, B, ne) {
      D(
        T,
        function() {
          B.apply(this, arguments);
        },
        ne
      );
    },
    count: function(T) {
      var B = 0;
      return D(T, function() {
        B++;
      }), B;
    },
    toArray: function(T) {
      return D(T, function(B) {
        return B;
      }) || [];
    },
    only: function(T) {
      if (!te(T))
        throw Error(
          "React.Children.only expected to receive a single React element child."
        );
      return T;
    }
  };
  return Ge.Activity = x, Ge.Children = P, Ge.Component = A, Ge.Fragment = a, Ge.Profiler = u, Ge.PureComponent = z, Ge.StrictMode = i, Ge.Suspense = g, Ge.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = L, Ge.__COMPILER_RUNTIME = {
    __proto__: null,
    c: function(T) {
      return L.H.useMemoCache(T);
    }
  }, Ge.cache = function(T) {
    return function() {
      return T.apply(null, arguments);
    };
  }, Ge.cacheSignal = function() {
    return null;
  }, Ge.cloneElement = function(T, B, ne) {
    if (T == null)
      throw Error(
        "The argument must be a React element, but you passed " + T + "."
      );
    var J = M({}, T.props), re = T.key;
    if (B != null)
      for (ie in B.key !== void 0 && (re = "" + B.key), B)
        !_.call(B, ie) || ie === "key" || ie === "__self" || ie === "__source" || ie === "ref" && B.ref === void 0 || (J[ie] = B[ie]);
    var ie = arguments.length - 2;
    if (ie === 1) J.children = ne;
    else if (1 < ie) {
      for (var oe = Array(ie), se = 0; se < ie; se++)
        oe[se] = arguments[se + 2];
      J.children = oe;
    }
    return k(T.type, re, J);
  }, Ge.createContext = function(T) {
    return T = {
      $$typeof: p,
      _currentValue: T,
      _currentValue2: T,
      _threadCount: 0,
      Provider: null,
      Consumer: null
    }, T.Provider = T, T.Consumer = {
      $$typeof: f,
      _context: T
    }, T;
  }, Ge.createElement = function(T, B, ne) {
    var J, re = {}, ie = null;
    if (B != null)
      for (J in B.key !== void 0 && (ie = "" + B.key), B)
        _.call(B, J) && J !== "key" && J !== "__self" && J !== "__source" && (re[J] = B[J]);
    var oe = arguments.length - 2;
    if (oe === 1) re.children = ne;
    else if (1 < oe) {
      for (var se = Array(oe), ge = 0; ge < oe; ge++)
        se[ge] = arguments[ge + 2];
      re.children = se;
    }
    if (T && T.defaultProps)
      for (J in oe = T.defaultProps, oe)
        re[J] === void 0 && (re[J] = oe[J]);
    return k(T, ie, re);
  }, Ge.createRef = function() {
    return { current: null };
  }, Ge.forwardRef = function(T) {
    return { $$typeof: m, render: T };
  }, Ge.isValidElement = te, Ge.lazy = function(T) {
    return {
      $$typeof: v,
      _payload: { _status: -1, _result: T },
      _init: U
    };
  }, Ge.memo = function(T, B) {
    return {
      $$typeof: d,
      type: T,
      compare: B === void 0 ? null : B
    };
  }, Ge.startTransition = function(T) {
    var B = L.T, ne = {};
    L.T = ne;
    try {
      var J = T(), re = L.S;
      re !== null && re(ne, J), typeof J == "object" && J !== null && typeof J.then == "function" && J.then(j, X);
    } catch (ie) {
      X(ie);
    } finally {
      B !== null && ne.types !== null && (B.types = ne.types), L.T = B;
    }
  }, Ge.unstable_useCacheRefresh = function() {
    return L.H.useCacheRefresh();
  }, Ge.use = function(T) {
    return L.H.use(T);
  }, Ge.useActionState = function(T, B, ne) {
    return L.H.useActionState(T, B, ne);
  }, Ge.useCallback = function(T, B) {
    return L.H.useCallback(T, B);
  }, Ge.useContext = function(T) {
    return L.H.useContext(T);
  }, Ge.useDebugValue = function() {
  }, Ge.useDeferredValue = function(T, B) {
    return L.H.useDeferredValue(T, B);
  }, Ge.useEffect = function(T, B) {
    return L.H.useEffect(T, B);
  }, Ge.useEffectEvent = function(T) {
    return L.H.useEffectEvent(T);
  }, Ge.useId = function() {
    return L.H.useId();
  }, Ge.useImperativeHandle = function(T, B, ne) {
    return L.H.useImperativeHandle(T, B, ne);
  }, Ge.useInsertionEffect = function(T, B) {
    return L.H.useInsertionEffect(T, B);
  }, Ge.useLayoutEffect = function(T, B) {
    return L.H.useLayoutEffect(T, B);
  }, Ge.useMemo = function(T, B) {
    return L.H.useMemo(T, B);
  }, Ge.useOptimistic = function(T, B) {
    return L.H.useOptimistic(T, B);
  }, Ge.useReducer = function(T, B, ne) {
    return L.H.useReducer(T, B, ne);
  }, Ge.useRef = function(T) {
    return L.H.useRef(T);
  }, Ge.useState = function(T) {
    return L.H.useState(T);
  }, Ge.useSyncExternalStore = function(T, B, ne) {
    return L.H.useSyncExternalStore(
      T,
      B,
      ne
    );
  }, Ge.useTransition = function() {
    return L.H.useTransition();
  }, Ge.version = "19.2.7", Ge;
}
var dv;
function Ti() {
  return dv || (dv = 1, zd.exports = H1()), zd.exports;
}
var y = Ti();
const np = /* @__PURE__ */ j1(y), U1 = /* @__PURE__ */ D1({
  __proto__: null,
  default: np
}, [y]);
var Nd = { exports: {} }, ti = {}, Dd = { exports: {} }, jd = {};
var pv;
function L1() {
  return pv || (pv = 1, (function(n) {
    function o(H, D) {
      var U = H.length;
      H.push(D);
      e: for (; 0 < U; ) {
        var X = U - 1 >>> 1, P = H[X];
        if (0 < u(P, D))
          H[X] = D, H[U] = P, U = X;
        else break e;
      }
    }
    function a(H) {
      return H.length === 0 ? null : H[0];
    }
    function i(H) {
      if (H.length === 0) return null;
      var D = H[0], U = H.pop();
      if (U !== D) {
        H[0] = U;
        e: for (var X = 0, P = H.length, T = P >>> 1; X < T; ) {
          var B = 2 * (X + 1) - 1, ne = H[B], J = B + 1, re = H[J];
          if (0 > u(ne, U))
            J < P && 0 > u(re, ne) ? (H[X] = re, H[J] = U, X = J) : (H[X] = ne, H[B] = U, X = B);
          else if (J < P && 0 > u(re, U))
            H[X] = re, H[J] = U, X = J;
          else break e;
        }
      }
      return D;
    }
    function u(H, D) {
      var U = H.sortIndex - D.sortIndex;
      return U !== 0 ? U : H.id - D.id;
    }
    if (n.unstable_now = void 0, typeof performance == "object" && typeof performance.now == "function") {
      var f = performance;
      n.unstable_now = function() {
        return f.now();
      };
    } else {
      var p = Date, m = p.now();
      n.unstable_now = function() {
        return p.now() - m;
      };
    }
    var g = [], d = [], v = 1, x = null, S = 3, C = !1, w = !1, M = !1, E = !1, A = typeof setTimeout == "function" ? setTimeout : null, O = typeof clearTimeout == "function" ? clearTimeout : null, z = typeof setImmediate < "u" ? setImmediate : null;
    function N(H) {
      for (var D = a(d); D !== null; ) {
        if (D.callback === null) i(d);
        else if (D.startTime <= H)
          i(d), D.sortIndex = D.expirationTime, o(g, D);
        else break;
        D = a(d);
      }
    }
    function I(H) {
      if (M = !1, N(H), !w)
        if (a(g) !== null)
          w = !0, j || (j = !0, F());
        else {
          var D = a(d);
          D !== null && q(I, D.startTime - H);
        }
    }
    var j = !1, L = -1, _ = 5, k = -1;
    function Y() {
      return E ? !0 : !(n.unstable_now() - k < _);
    }
    function te() {
      if (E = !1, j) {
        var H = n.unstable_now();
        k = H;
        var D = !0;
        try {
          e: {
            w = !1, M && (M = !1, O(L), L = -1), C = !0;
            var U = S;
            try {
              t: {
                for (N(H), x = a(g); x !== null && !(x.expirationTime > H && Y()); ) {
                  var X = x.callback;
                  if (typeof X == "function") {
                    x.callback = null, S = x.priorityLevel;
                    var P = X(
                      x.expirationTime <= H
                    );
                    if (H = n.unstable_now(), typeof P == "function") {
                      x.callback = P, N(H), D = !0;
                      break t;
                    }
                    x === a(g) && i(g), N(H);
                  } else i(g);
                  x = a(g);
                }
                if (x !== null) D = !0;
                else {
                  var T = a(d);
                  T !== null && q(
                    I,
                    T.startTime - H
                  ), D = !1;
                }
              }
              break e;
            } finally {
              x = null, S = U, C = !1;
            }
            D = void 0;
          }
        } finally {
          D ? F() : j = !1;
        }
      }
    }
    var F;
    if (typeof z == "function")
      F = function() {
        z(te);
      };
    else if (typeof MessageChannel < "u") {
      var Q = new MessageChannel(), Z = Q.port2;
      Q.port1.onmessage = te, F = function() {
        Z.postMessage(null);
      };
    } else
      F = function() {
        A(te, 0);
      };
    function q(H, D) {
      L = A(function() {
        H(n.unstable_now());
      }, D);
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
          var D = 3;
          break;
        default:
          D = S;
      }
      var U = S;
      S = D;
      try {
        return H();
      } finally {
        S = U;
      }
    }, n.unstable_requestPaint = function() {
      E = !0;
    }, n.unstable_runWithPriority = function(H, D) {
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
      var U = S;
      S = H;
      try {
        return D();
      } finally {
        S = U;
      }
    }, n.unstable_scheduleCallback = function(H, D, U) {
      var X = n.unstable_now();
      switch (typeof U == "object" && U !== null ? (U = U.delay, U = typeof U == "number" && 0 < U ? X + U : X) : U = X, H) {
        case 1:
          var P = -1;
          break;
        case 2:
          P = 250;
          break;
        case 5:
          P = 1073741823;
          break;
        case 4:
          P = 1e4;
          break;
        default:
          P = 5e3;
      }
      return P = U + P, H = {
        id: v++,
        callback: D,
        priorityLevel: H,
        startTime: U,
        expirationTime: P,
        sortIndex: -1
      }, U > X ? (H.sortIndex = U, o(d, H), a(g) === null && H === a(d) && (M ? (O(L), L = -1) : M = !0, q(I, U - X))) : (H.sortIndex = P, o(g, H), w || C || (w = !0, j || (j = !0, F()))), H;
    }, n.unstable_shouldYield = Y, n.unstable_wrapCallback = function(H) {
      var D = S;
      return function() {
        var U = S;
        S = D;
        try {
          return H.apply(this, arguments);
        } finally {
          S = U;
        }
      };
    };
  })(jd)), jd;
}
var gv;
function I1() {
  return gv || (gv = 1, Dd.exports = L1()), Dd.exports;
}
var kd = { exports: {} }, hn = {};
var mv;
function B1() {
  if (mv) return hn;
  mv = 1;
  var n = Ti();
  function o(g) {
    var d = "https://react.dev/errors/" + g;
    if (1 < arguments.length) {
      d += "?args[]=" + encodeURIComponent(arguments[1]);
      for (var v = 2; v < arguments.length; v++)
        d += "&args[]=" + encodeURIComponent(arguments[v]);
    }
    return "Minified React error #" + g + "; visit " + d + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
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
  function f(g, d, v) {
    var x = 3 < arguments.length && arguments[3] !== void 0 ? arguments[3] : null;
    return {
      $$typeof: u,
      key: x == null ? null : "" + x,
      children: g,
      containerInfo: d,
      implementation: v
    };
  }
  var p = n.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  function m(g, d) {
    if (g === "font") return "";
    if (typeof d == "string")
      return d === "use-credentials" ? d : "";
  }
  return hn.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = i, hn.createPortal = function(g, d) {
    var v = 2 < arguments.length && arguments[2] !== void 0 ? arguments[2] : null;
    if (!d || d.nodeType !== 1 && d.nodeType !== 9 && d.nodeType !== 11)
      throw Error(o(299));
    return f(g, d, null, v);
  }, hn.flushSync = function(g) {
    var d = p.T, v = i.p;
    try {
      if (p.T = null, i.p = 2, g) return g();
    } finally {
      p.T = d, i.p = v, i.d.f();
    }
  }, hn.preconnect = function(g, d) {
    typeof g == "string" && (d ? (d = d.crossOrigin, d = typeof d == "string" ? d === "use-credentials" ? d : "" : void 0) : d = null, i.d.C(g, d));
  }, hn.prefetchDNS = function(g) {
    typeof g == "string" && i.d.D(g);
  }, hn.preinit = function(g, d) {
    if (typeof g == "string" && d && typeof d.as == "string") {
      var v = d.as, x = m(v, d.crossOrigin), S = typeof d.integrity == "string" ? d.integrity : void 0, C = typeof d.fetchPriority == "string" ? d.fetchPriority : void 0;
      v === "style" ? i.d.S(
        g,
        typeof d.precedence == "string" ? d.precedence : void 0,
        {
          crossOrigin: x,
          integrity: S,
          fetchPriority: C
        }
      ) : v === "script" && i.d.X(g, {
        crossOrigin: x,
        integrity: S,
        fetchPriority: C,
        nonce: typeof d.nonce == "string" ? d.nonce : void 0
      });
    }
  }, hn.preinitModule = function(g, d) {
    if (typeof g == "string")
      if (typeof d == "object" && d !== null) {
        if (d.as == null || d.as === "script") {
          var v = m(
            d.as,
            d.crossOrigin
          );
          i.d.M(g, {
            crossOrigin: v,
            integrity: typeof d.integrity == "string" ? d.integrity : void 0,
            nonce: typeof d.nonce == "string" ? d.nonce : void 0
          });
        }
      } else d == null && i.d.M(g);
  }, hn.preload = function(g, d) {
    if (typeof g == "string" && typeof d == "object" && d !== null && typeof d.as == "string") {
      var v = d.as, x = m(v, d.crossOrigin);
      i.d.L(g, v, {
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
  }, hn.preloadModule = function(g, d) {
    if (typeof g == "string")
      if (d) {
        var v = m(d.as, d.crossOrigin);
        i.d.m(g, {
          as: typeof d.as == "string" && d.as !== "script" ? d.as : void 0,
          crossOrigin: v,
          integrity: typeof d.integrity == "string" ? d.integrity : void 0
        });
      } else i.d.m(g);
  }, hn.requestFormReset = function(g) {
    i.d.r(g);
  }, hn.unstable_batchedUpdates = function(g, d) {
    return g(d);
  }, hn.useFormState = function(g, d, v) {
    return p.H.useFormState(g, d, v);
  }, hn.useFormStatus = function() {
    return p.H.useHostTransitionStatus();
  }, hn.version = "19.2.7", hn;
}
var hv;
function zb() {
  if (hv) return kd.exports;
  hv = 1;
  function n() {
    if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function"))
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(n);
      } catch (o) {
        console.error(o);
      }
  }
  return n(), kd.exports = B1(), kd.exports;
}
var yv;
function V1() {
  if (yv) return ti;
  yv = 1;
  var n = I1(), o = Ti(), a = zb();
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
  function m(e) {
    if (e.tag === 31) {
      var t = e.memoizedState;
      if (t === null && (e = e.alternate, e !== null && (t = e.memoizedState)), t !== null) return t.dehydrated;
    }
    return null;
  }
  function g(e) {
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
          if (c === l) return g(s), e;
          if (c === r) return g(s), t;
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
  var x = Object.assign, S = /* @__PURE__ */ Symbol.for("react.element"), C = /* @__PURE__ */ Symbol.for("react.transitional.element"), w = /* @__PURE__ */ Symbol.for("react.portal"), M = /* @__PURE__ */ Symbol.for("react.fragment"), E = /* @__PURE__ */ Symbol.for("react.strict_mode"), A = /* @__PURE__ */ Symbol.for("react.profiler"), O = /* @__PURE__ */ Symbol.for("react.consumer"), z = /* @__PURE__ */ Symbol.for("react.context"), N = /* @__PURE__ */ Symbol.for("react.forward_ref"), I = /* @__PURE__ */ Symbol.for("react.suspense"), j = /* @__PURE__ */ Symbol.for("react.suspense_list"), L = /* @__PURE__ */ Symbol.for("react.memo"), _ = /* @__PURE__ */ Symbol.for("react.lazy"), k = /* @__PURE__ */ Symbol.for("react.activity"), Y = /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel"), te = Symbol.iterator;
  function F(e) {
    return e === null || typeof e != "object" ? null : (e = te && e[te] || e["@@iterator"], typeof e == "function" ? e : null);
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
      case A:
        return "Profiler";
      case E:
        return "StrictMode";
      case I:
        return "Suspense";
      case j:
        return "SuspenseList";
      case k:
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
        case N:
          var t = e.render;
          return e = e.displayName, e || (e = t.displayName || t.name || "", e = e !== "" ? "ForwardRef(" + e + ")" : "ForwardRef"), e;
        case L:
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
  var q = Array.isArray, H = o.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, D = a.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, U = {
    pending: !1,
    data: null,
    method: null,
    action: null
  }, X = [], P = -1;
  function T(e) {
    return { current: e };
  }
  function B(e) {
    0 > P || (e.current = X[P], X[P] = null, P--);
  }
  function ne(e, t) {
    P++, X[P] = e.current, e.current = t;
  }
  var J = T(null), re = T(null), ie = T(null), oe = T(null);
  function se(e, t) {
    switch (ne(ie, t), ne(re, e), ne(J, null), t.nodeType) {
      case 9:
      case 11:
        e = (e = t.documentElement) && (e = e.namespaceURI) ? Dy(e) : 0;
        break;
      default:
        if (e = t.tagName, t = t.namespaceURI)
          t = Dy(t), e = jy(t, e);
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
    B(J), ne(J, e);
  }
  function ge() {
    B(J), B(re), B(ie);
  }
  function je(e) {
    e.memoizedState !== null && ne(oe, e);
    var t = J.current, l = jy(t, e.type);
    t !== l && (ne(re, e), ne(J, l));
  }
  function Ee(e) {
    re.current === e && (B(J), B(re)), oe.current === e && (B(oe), Za._currentValue = U);
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
                  var ee = le;
                }
                Reflect.construct(e, [], de);
              } else {
                try {
                  de.call();
                } catch (le) {
                  ee = le;
                }
                e.call(de.prototype);
              }
            } else {
              try {
                throw Error();
              } catch (le) {
                ee = le;
              }
              (de = e()) && typeof de.catch == "function" && de.catch(function() {
              });
            }
          } catch (le) {
            if (le && ee && typeof le.stack == "string")
              return [le.stack, ee.stack];
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
        var V = h.split(`
`), W = R.split(`
`);
        for (s = r = 0; r < V.length && !V[r].includes("DetermineComponentFrameRoot"); )
          r++;
        for (; s < W.length && !W[s].includes(
          "DetermineComponentFrameRoot"
        ); )
          s++;
        if (r === V.length || s === W.length)
          for (r = V.length - 1, s = W.length - 1; 1 <= r && 0 <= s && V[r] !== W[s]; )
            s--;
        for (; 1 <= r && 0 <= s; r--, s--)
          if (V[r] !== W[s]) {
            if (r !== 1 || s !== 1)
              do
                if (r--, s--, 0 > s || V[r] !== W[s]) {
                  var ce = `
` + V[r].replace(" at new ", " at ");
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
  var he = Object.prototype.hasOwnProperty, Se = n.unstable_scheduleCallback, Te = n.unstable_cancelCallback, Oe = n.unstable_shouldYield, He = n.unstable_requestPaint, ae = n.unstable_now, pe = n.unstable_getCurrentPriorityLevel, Ue = n.unstable_ImmediatePriority, ve = n.unstable_UserBlockingPriority, be = n.unstable_NormalPriority, We = n.unstable_LowPriority, rt = n.unstable_IdlePriority, mt = n.log, Dt = n.unstable_setDisableYieldValue, et = null, ht = null;
  function zt(e) {
    if (typeof mt == "function" && Dt(e), ht && typeof ht.setStrictMode == "function")
      try {
        ht.setStrictMode(et, e);
      } catch {
      }
  }
  var yt = Math.clz32 ? Math.clz32 : Qe, Mn = Math.log, An = Math.LN2;
  function Qe(e) {
    return e >>>= 0, e === 0 ? 32 : 31 - (Mn(e) / An | 0) | 0;
  }
  var pt = 256, It = 262144, Ht = 4194304;
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
    var R = e.entanglements, V = e.expirationTimes, W = e.hiddenUpdates;
    for (l = h & ~l; 0 < l; ) {
      var ce = 31 - yt(l), de = 1 << ce;
      R[ce] = 0, V[ce] = -1;
      var ee = W[ce];
      if (ee !== null)
        for (W[ce] = null, ce = 0; ce < ee.length; ce++) {
          var le = ee[ce];
          le !== null && (le.lane &= -536870913);
        }
      l &= ~de;
    }
    r !== 0 && yl(e, r, 0), c !== 0 && s === 0 && e.tag !== 0 && (e.suspendedLanes |= c & ~(h & ~t));
  }
  function yl(e, t, l) {
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
  function vl(e, t) {
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
    var e = D.p;
    return e !== 0 ? e : (e = window.event, e === void 0 ? 32 : nv(e.type));
  }
  function ln(e, t) {
    var l = D.p;
    try {
      return D.p = e, t();
    } finally {
      D.p = l;
    }
  }
  var en = Math.random().toString(36).slice(2), Ot = "__reactFiber$" + en, cn = "__reactProps$" + en, rl = "__reactContainer$" + en, ua = "__reactEvents$" + en, ji = "__reactListeners$" + en, wS = "__reactHandles$" + en, bg = "__reactResources$" + en, fa = "__reactMarker$" + en;
  function xu(e) {
    delete e[Ot], delete e[cn], delete e[ua], delete e[ji], delete e[wS];
  }
  function pr(e) {
    var t = e[Ot];
    if (t) return t;
    for (var l = e.parentNode; l; ) {
      if (t = l[rl] || l[Ot]) {
        if (l = t.alternate, t.child !== null || l !== null && l.child !== null)
          for (e = By(e); e !== null; ) {
            if (l = e[Ot]) return l;
            e = By(e);
          }
        return t;
      }
      e = l, l = e.parentNode;
    }
    return null;
  }
  function gr(e) {
    if (e = e[Ot] || e[rl]) {
      var t = e.tag;
      if (t === 5 || t === 6 || t === 13 || t === 31 || t === 26 || t === 27 || t === 3)
        return e;
    }
    return null;
  }
  function da(e) {
    var t = e.tag;
    if (t === 5 || t === 26 || t === 27 || t === 6) return e.stateNode;
    throw Error(i(33));
  }
  function mr(e) {
    var t = e[bg];
    return t || (t = e[bg] = { hoistableStyles: /* @__PURE__ */ new Map(), hoistableScripts: /* @__PURE__ */ new Map() }), t;
  }
  function on(e) {
    e[fa] = !0;
  }
  var xg = /* @__PURE__ */ new Set(), Sg = {};
  function Uo(e, t) {
    hr(e, t), hr(e + "Capture", t);
  }
  function hr(e, t) {
    for (Sg[e] = t, e = 0; e < t.length; e++)
      xg.add(t[e]);
  }
  var ES = RegExp(
    "^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"
  ), wg = {}, Eg = {};
  function TS(e) {
    return he.call(Eg, e) ? !0 : he.call(wg, e) ? !1 : ES.test(e) ? Eg[e] = !0 : (wg[e] = !0, !1);
  }
  function ki(e, t, l) {
    if (TS(t))
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
  function _i(e, t, l) {
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
  function bl(e, t, l, r) {
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
  function Tg(e) {
    var t = e.type;
    return (e = e.nodeName) && e.toLowerCase() === "input" && (t === "checkbox" || t === "radio");
  }
  function RS(e, t, l) {
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
  function Su(e) {
    if (!e._valueTracker) {
      var t = Tg(e) ? "checked" : "value";
      e._valueTracker = RS(
        e,
        t,
        "" + e[t]
      );
    }
  }
  function Rg(e) {
    if (!e) return !1;
    var t = e._valueTracker;
    if (!t) return !0;
    var l = t.getValue(), r = "";
    return e && (r = Tg(e) ? e.checked ? "true" : "false" : e.value), e = r, e !== l ? (t.setValue(e), !0) : !1;
  }
  function Hi(e) {
    if (e = e || (typeof document < "u" ? document : void 0), typeof e > "u") return null;
    try {
      return e.activeElement || e.body;
    } catch {
      return e.body;
    }
  }
  var CS = /[\n"\\]/g;
  function Gn(e) {
    return e.replace(
      CS,
      function(t) {
        return "\\" + t.charCodeAt(0).toString(16) + " ";
      }
    );
  }
  function wu(e, t, l, r, s, c, h, R) {
    e.name = "", h != null && typeof h != "function" && typeof h != "symbol" && typeof h != "boolean" ? e.type = h : e.removeAttribute("type"), t != null ? h === "number" ? (t === 0 && e.value === "" || e.value != t) && (e.value = "" + Yn(t)) : e.value !== "" + Yn(t) && (e.value = "" + Yn(t)) : h !== "submit" && h !== "reset" || e.removeAttribute("value"), t != null ? Eu(e, h, Yn(t)) : l != null ? Eu(e, h, Yn(l)) : r != null && e.removeAttribute("value"), s == null && c != null && (e.defaultChecked = !!c), s != null && (e.checked = s && typeof s != "function" && typeof s != "symbol"), R != null && typeof R != "function" && typeof R != "symbol" && typeof R != "boolean" ? e.name = "" + Yn(R) : e.removeAttribute("name");
  }
  function Cg(e, t, l, r, s, c, h, R) {
    if (c != null && typeof c != "function" && typeof c != "symbol" && typeof c != "boolean" && (e.type = c), t != null || l != null) {
      if (!(c !== "submit" && c !== "reset" || t != null)) {
        Su(e);
        return;
      }
      l = l != null ? "" + Yn(l) : "", t = t != null ? "" + Yn(t) : l, R || t === e.value || (e.value = t), e.defaultValue = t;
    }
    r = r ?? s, r = typeof r != "function" && typeof r != "symbol" && !!r, e.checked = R ? e.checked : !!r, e.defaultChecked = !!r, h != null && typeof h != "function" && typeof h != "symbol" && typeof h != "boolean" && (e.name = h), Su(e);
  }
  function Eu(e, t, l) {
    t === "number" && Hi(e.ownerDocument) === e || e.defaultValue === "" + l || (e.defaultValue = "" + l);
  }
  function yr(e, t, l, r) {
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
  function Og(e, t, l) {
    if (t != null && (t = "" + Yn(t), t !== e.value && (e.value = t), l == null)) {
      e.defaultValue !== t && (e.defaultValue = t);
      return;
    }
    e.defaultValue = l != null ? "" + Yn(l) : "";
  }
  function Mg(e, t, l, r) {
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
    l = Yn(t), e.defaultValue = l, r = e.textContent, r === l && r !== "" && r !== null && (e.value = r), Su(e);
  }
  function vr(e, t) {
    if (t) {
      var l = e.firstChild;
      if (l && l === e.lastChild && l.nodeType === 3) {
        l.nodeValue = t;
        return;
      }
    }
    e.textContent = t;
  }
  var OS = new Set(
    "animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(
      " "
    )
  );
  function Ag(e, t, l) {
    var r = t.indexOf("--") === 0;
    l == null || typeof l == "boolean" || l === "" ? r ? e.setProperty(t, "") : t === "float" ? e.cssFloat = "" : e[t] = "" : r ? e.setProperty(t, l) : typeof l != "number" || l === 0 || OS.has(t) ? t === "float" ? e.cssFloat = l : e[t] = ("" + l).trim() : e[t] = l + "px";
  }
  function zg(e, t, l) {
    if (t != null && typeof t != "object")
      throw Error(i(62));
    if (e = e.style, l != null) {
      for (var r in l)
        !l.hasOwnProperty(r) || t != null && t.hasOwnProperty(r) || (r.indexOf("--") === 0 ? e.setProperty(r, "") : r === "float" ? e.cssFloat = "" : e[r] = "");
      for (var s in t)
        r = t[s], t.hasOwnProperty(s) && l[s] !== r && Ag(e, s, r);
    } else
      for (var c in t)
        t.hasOwnProperty(c) && Ag(e, c, t[c]);
  }
  function Tu(e) {
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
  var MS = /* @__PURE__ */ new Map([
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
  ]), AS = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
  function Ui(e) {
    return AS.test("" + e) ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')" : e;
  }
  function xl() {
  }
  var Ru = null;
  function Cu(e) {
    return e = e.target || e.srcElement || window, e.correspondingUseElement && (e = e.correspondingUseElement), e.nodeType === 3 ? e.parentNode : e;
  }
  var br = null, xr = null;
  function Ng(e) {
    var t = gr(e);
    if (t && (e = t.stateNode)) {
      var l = e[cn] || null;
      e: switch (e = t.stateNode, t.type) {
        case "input":
          if (wu(
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
                wu(
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
              r = l[t], r.form === e.form && Rg(r);
          }
          break e;
        case "textarea":
          Og(e, l.value, l.defaultValue);
          break e;
        case "select":
          t = l.value, t != null && yr(e, !!l.multiple, t, !1);
      }
    }
  }
  var Ou = !1;
  function Dg(e, t, l) {
    if (Ou) return e(t, l);
    Ou = !0;
    try {
      var r = e(t);
      return r;
    } finally {
      if (Ou = !1, (br !== null || xr !== null) && (Ts(), br && (t = br, e = xr, xr = br = null, Ng(t), e)))
        for (t = 0; t < e.length; t++) Ng(e[t]);
    }
  }
  function pa(e, t) {
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
  var Sl = !(typeof window > "u" || typeof window.document > "u" || typeof window.document.createElement > "u"), Mu = !1;
  if (Sl)
    try {
      var ga = {};
      Object.defineProperty(ga, "passive", {
        get: function() {
          Mu = !0;
        }
      }), window.addEventListener("test", ga, ga), window.removeEventListener("test", ga, ga);
    } catch {
      Mu = !1;
    }
  var Wl = null, Au = null, Li = null;
  function jg() {
    if (Li) return Li;
    var e, t = Au, l = t.length, r, s = "value" in Wl ? Wl.value : Wl.textContent, c = s.length;
    for (e = 0; e < l && t[e] === s[e]; e++) ;
    var h = l - e;
    for (r = 1; r <= h && t[l - r] === s[c - r]; r++) ;
    return Li = s.slice(e, 1 < r ? 1 - r : void 0);
  }
  function Ii(e) {
    var t = e.keyCode;
    return "charCode" in e ? (e = e.charCode, e === 0 && t === 13 && (e = 13)) : e = t, e === 10 && (e = 13), 32 <= e || e === 13 ? e : 0;
  }
  function Bi() {
    return !0;
  }
  function kg() {
    return !1;
  }
  function wn(e) {
    function t(l, r, s, c, h) {
      this._reactName = l, this._targetInst = s, this.type = r, this.nativeEvent = c, this.target = h, this.currentTarget = null;
      for (var R in e)
        e.hasOwnProperty(R) && (l = e[R], this[R] = l ? l(c) : c[R]);
      return this.isDefaultPrevented = (c.defaultPrevented != null ? c.defaultPrevented : c.returnValue === !1) ? Bi : kg, this.isPropagationStopped = kg, this;
    }
    return x(t.prototype, {
      preventDefault: function() {
        this.defaultPrevented = !0;
        var l = this.nativeEvent;
        l && (l.preventDefault ? l.preventDefault() : typeof l.returnValue != "unknown" && (l.returnValue = !1), this.isDefaultPrevented = Bi);
      },
      stopPropagation: function() {
        var l = this.nativeEvent;
        l && (l.stopPropagation ? l.stopPropagation() : typeof l.cancelBubble != "unknown" && (l.cancelBubble = !0), this.isPropagationStopped = Bi);
      },
      persist: function() {
      },
      isPersistent: Bi
    }), t;
  }
  var Lo = {
    eventPhase: 0,
    bubbles: 0,
    cancelable: 0,
    timeStamp: function(e) {
      return e.timeStamp || Date.now();
    },
    defaultPrevented: 0,
    isTrusted: 0
  }, Vi = wn(Lo), ma = x({}, Lo, { view: 0, detail: 0 }), zS = wn(ma), zu, Nu, ha, Pi = x({}, ma, {
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
    getModifierState: ju,
    button: 0,
    buttons: 0,
    relatedTarget: function(e) {
      return e.relatedTarget === void 0 ? e.fromElement === e.srcElement ? e.toElement : e.fromElement : e.relatedTarget;
    },
    movementX: function(e) {
      return "movementX" in e ? e.movementX : (e !== ha && (ha && e.type === "mousemove" ? (zu = e.screenX - ha.screenX, Nu = e.screenY - ha.screenY) : Nu = zu = 0, ha = e), zu);
    },
    movementY: function(e) {
      return "movementY" in e ? e.movementY : Nu;
    }
  }), _g = wn(Pi), NS = x({}, Pi, { dataTransfer: 0 }), DS = wn(NS), jS = x({}, ma, { relatedTarget: 0 }), Du = wn(jS), kS = x({}, Lo, {
    animationName: 0,
    elapsedTime: 0,
    pseudoElement: 0
  }), _S = wn(kS), HS = x({}, Lo, {
    clipboardData: function(e) {
      return "clipboardData" in e ? e.clipboardData : window.clipboardData;
    }
  }), US = wn(HS), LS = x({}, Lo, { data: 0 }), Hg = wn(LS), IS = {
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
  }, BS = {
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
  }, VS = {
    Alt: "altKey",
    Control: "ctrlKey",
    Meta: "metaKey",
    Shift: "shiftKey"
  };
  function PS(e) {
    var t = this.nativeEvent;
    return t.getModifierState ? t.getModifierState(e) : (e = VS[e]) ? !!t[e] : !1;
  }
  function ju() {
    return PS;
  }
  var YS = x({}, ma, {
    key: function(e) {
      if (e.key) {
        var t = IS[e.key] || e.key;
        if (t !== "Unidentified") return t;
      }
      return e.type === "keypress" ? (e = Ii(e), e === 13 ? "Enter" : String.fromCharCode(e)) : e.type === "keydown" || e.type === "keyup" ? BS[e.keyCode] || "Unidentified" : "";
    },
    code: 0,
    location: 0,
    ctrlKey: 0,
    shiftKey: 0,
    altKey: 0,
    metaKey: 0,
    repeat: 0,
    locale: 0,
    getModifierState: ju,
    charCode: function(e) {
      return e.type === "keypress" ? Ii(e) : 0;
    },
    keyCode: function(e) {
      return e.type === "keydown" || e.type === "keyup" ? e.keyCode : 0;
    },
    which: function(e) {
      return e.type === "keypress" ? Ii(e) : e.type === "keydown" || e.type === "keyup" ? e.keyCode : 0;
    }
  }), GS = wn(YS), qS = x({}, Pi, {
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
  }), Ug = wn(qS), XS = x({}, ma, {
    touches: 0,
    targetTouches: 0,
    changedTouches: 0,
    altKey: 0,
    metaKey: 0,
    ctrlKey: 0,
    shiftKey: 0,
    getModifierState: ju
  }), FS = wn(XS), KS = x({}, Lo, {
    propertyName: 0,
    elapsedTime: 0,
    pseudoElement: 0
  }), QS = wn(KS), ZS = x({}, Pi, {
    deltaX: function(e) {
      return "deltaX" in e ? e.deltaX : "wheelDeltaX" in e ? -e.wheelDeltaX : 0;
    },
    deltaY: function(e) {
      return "deltaY" in e ? e.deltaY : "wheelDeltaY" in e ? -e.wheelDeltaY : "wheelDelta" in e ? -e.wheelDelta : 0;
    },
    deltaZ: 0,
    deltaMode: 0
  }), JS = wn(ZS), $S = x({}, Lo, {
    newState: 0,
    oldState: 0
  }), WS = wn($S), ew = [9, 13, 27, 32], ku = Sl && "CompositionEvent" in window, ya = null;
  Sl && "documentMode" in document && (ya = document.documentMode);
  var tw = Sl && "TextEvent" in window && !ya, Lg = Sl && (!ku || ya && 8 < ya && 11 >= ya), Ig = " ", Bg = !1;
  function Vg(e, t) {
    switch (e) {
      case "keyup":
        return ew.indexOf(t.keyCode) !== -1;
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
  function Pg(e) {
    return e = e.detail, typeof e == "object" && "data" in e ? e.data : null;
  }
  var Sr = !1;
  function nw(e, t) {
    switch (e) {
      case "compositionend":
        return Pg(t);
      case "keypress":
        return t.which !== 32 ? null : (Bg = !0, Ig);
      case "textInput":
        return e = t.data, e === Ig && Bg ? null : e;
      default:
        return null;
    }
  }
  function lw(e, t) {
    if (Sr)
      return e === "compositionend" || !ku && Vg(e, t) ? (e = jg(), Li = Au = Wl = null, Sr = !1, e) : null;
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
        return Lg && t.locale !== "ko" ? null : t.data;
      default:
        return null;
    }
  }
  var ow = {
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
  function Yg(e) {
    var t = e && e.nodeName && e.nodeName.toLowerCase();
    return t === "input" ? !!ow[e.type] : t === "textarea";
  }
  function Gg(e, t, l, r) {
    br ? xr ? xr.push(r) : xr = [r] : br = r, t = Ns(t, "onChange"), 0 < t.length && (l = new Vi(
      "onChange",
      "change",
      null,
      l,
      r
    ), e.push({ event: l, listeners: t }));
  }
  var va = null, ba = null;
  function rw(e) {
    Cy(e, 0);
  }
  function Yi(e) {
    var t = da(e);
    if (Rg(t)) return e;
  }
  function qg(e, t) {
    if (e === "change") return t;
  }
  var Xg = !1;
  if (Sl) {
    var _u;
    if (Sl) {
      var Hu = "oninput" in document;
      if (!Hu) {
        var Fg = document.createElement("div");
        Fg.setAttribute("oninput", "return;"), Hu = typeof Fg.oninput == "function";
      }
      _u = Hu;
    } else _u = !1;
    Xg = _u && (!document.documentMode || 9 < document.documentMode);
  }
  function Kg() {
    va && (va.detachEvent("onpropertychange", Qg), ba = va = null);
  }
  function Qg(e) {
    if (e.propertyName === "value" && Yi(ba)) {
      var t = [];
      Gg(
        t,
        ba,
        e,
        Cu(e)
      ), Dg(rw, t);
    }
  }
  function aw(e, t, l) {
    e === "focusin" ? (Kg(), va = t, ba = l, va.attachEvent("onpropertychange", Qg)) : e === "focusout" && Kg();
  }
  function iw(e) {
    if (e === "selectionchange" || e === "keyup" || e === "keydown")
      return Yi(ba);
  }
  function sw(e, t) {
    if (e === "click") return Yi(t);
  }
  function cw(e, t) {
    if (e === "input" || e === "change")
      return Yi(t);
  }
  function uw(e, t) {
    return e === t && (e !== 0 || 1 / e === 1 / t) || e !== e && t !== t;
  }
  var Nn = typeof Object.is == "function" ? Object.is : uw;
  function xa(e, t) {
    if (Nn(e, t)) return !0;
    if (typeof e != "object" || e === null || typeof t != "object" || t === null)
      return !1;
    var l = Object.keys(e), r = Object.keys(t);
    if (l.length !== r.length) return !1;
    for (r = 0; r < l.length; r++) {
      var s = l[r];
      if (!he.call(t, s) || !Nn(e[s], t[s]))
        return !1;
    }
    return !0;
  }
  function Zg(e) {
    for (; e && e.firstChild; ) e = e.firstChild;
    return e;
  }
  function Jg(e, t) {
    var l = Zg(e);
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
      l = Zg(l);
    }
  }
  function $g(e, t) {
    return e && t ? e === t ? !0 : e && e.nodeType === 3 ? !1 : t && t.nodeType === 3 ? $g(e, t.parentNode) : "contains" in e ? e.contains(t) : e.compareDocumentPosition ? !!(e.compareDocumentPosition(t) & 16) : !1 : !1;
  }
  function Wg(e) {
    e = e != null && e.ownerDocument != null && e.ownerDocument.defaultView != null ? e.ownerDocument.defaultView : window;
    for (var t = Hi(e.document); t instanceof e.HTMLIFrameElement; ) {
      try {
        var l = typeof t.contentWindow.location.href == "string";
      } catch {
        l = !1;
      }
      if (l) e = t.contentWindow;
      else break;
      t = Hi(e.document);
    }
    return t;
  }
  function Uu(e) {
    var t = e && e.nodeName && e.nodeName.toLowerCase();
    return t && (t === "input" && (e.type === "text" || e.type === "search" || e.type === "tel" || e.type === "url" || e.type === "password") || t === "textarea" || e.contentEditable === "true");
  }
  var fw = Sl && "documentMode" in document && 11 >= document.documentMode, wr = null, Lu = null, Sa = null, Iu = !1;
  function em(e, t, l) {
    var r = l.window === l ? l.document : l.nodeType === 9 ? l : l.ownerDocument;
    Iu || wr == null || wr !== Hi(r) || (r = wr, "selectionStart" in r && Uu(r) ? r = { start: r.selectionStart, end: r.selectionEnd } : (r = (r.ownerDocument && r.ownerDocument.defaultView || window).getSelection(), r = {
      anchorNode: r.anchorNode,
      anchorOffset: r.anchorOffset,
      focusNode: r.focusNode,
      focusOffset: r.focusOffset
    }), Sa && xa(Sa, r) || (Sa = r, r = Ns(Lu, "onSelect"), 0 < r.length && (t = new Vi(
      "onSelect",
      "select",
      null,
      t,
      l
    ), e.push({ event: t, listeners: r }), t.target = wr)));
  }
  function Io(e, t) {
    var l = {};
    return l[e.toLowerCase()] = t.toLowerCase(), l["Webkit" + e] = "webkit" + t, l["Moz" + e] = "moz" + t, l;
  }
  var Er = {
    animationend: Io("Animation", "AnimationEnd"),
    animationiteration: Io("Animation", "AnimationIteration"),
    animationstart: Io("Animation", "AnimationStart"),
    transitionrun: Io("Transition", "TransitionRun"),
    transitionstart: Io("Transition", "TransitionStart"),
    transitioncancel: Io("Transition", "TransitionCancel"),
    transitionend: Io("Transition", "TransitionEnd")
  }, Bu = {}, tm = {};
  Sl && (tm = document.createElement("div").style, "AnimationEvent" in window || (delete Er.animationend.animation, delete Er.animationiteration.animation, delete Er.animationstart.animation), "TransitionEvent" in window || delete Er.transitionend.transition);
  function Bo(e) {
    if (Bu[e]) return Bu[e];
    if (!Er[e]) return e;
    var t = Er[e], l;
    for (l in t)
      if (t.hasOwnProperty(l) && l in tm)
        return Bu[e] = t[l];
    return e;
  }
  var nm = Bo("animationend"), lm = Bo("animationiteration"), om = Bo("animationstart"), dw = Bo("transitionrun"), pw = Bo("transitionstart"), gw = Bo("transitioncancel"), rm = Bo("transitionend"), am = /* @__PURE__ */ new Map(), Vu = "abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(
    " "
  );
  Vu.push("scrollEnd");
  function nl(e, t) {
    am.set(e, t), Uo(t, [e]);
  }
  var Gi = typeof reportError == "function" ? reportError : function(e) {
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
  }, qn = [], Tr = 0, Pu = 0;
  function qi() {
    for (var e = Tr, t = Pu = Tr = 0; t < e; ) {
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
      c !== 0 && im(l, s, c);
    }
  }
  function Xi(e, t, l, r) {
    qn[Tr++] = e, qn[Tr++] = t, qn[Tr++] = l, qn[Tr++] = r, Pu |= r, e.lanes |= r, e = e.alternate, e !== null && (e.lanes |= r);
  }
  function Yu(e, t, l, r) {
    return Xi(e, t, l, r), Fi(e);
  }
  function Vo(e, t) {
    return Xi(e, null, null, t), Fi(e);
  }
  function im(e, t, l) {
    e.lanes |= l;
    var r = e.alternate;
    r !== null && (r.lanes |= l);
    for (var s = !1, c = e.return; c !== null; )
      c.childLanes |= l, r = c.alternate, r !== null && (r.childLanes |= l), c.tag === 22 && (e = c.stateNode, e === null || e._visibility & 1 || (s = !0)), e = c, c = c.return;
    return e.tag === 3 ? (c = e.stateNode, s && t !== null && (s = 31 - yt(l), e = c.hiddenUpdates, r = e[s], r === null ? e[s] = [t] : r.push(t), t.lane = l | 536870912), c) : null;
  }
  function Fi(e) {
    if (50 < Ya)
      throw Ya = 0, Wf = null, Error(i(185));
    for (var t = e.return; t !== null; )
      e = t, t = e.return;
    return e.tag === 3 ? e.stateNode : null;
  }
  var Rr = {};
  function mw(e, t, l, r) {
    this.tag = e, this.key = l, this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null, this.index = 0, this.refCleanup = this.ref = null, this.pendingProps = t, this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null, this.mode = r, this.subtreeFlags = this.flags = 0, this.deletions = null, this.childLanes = this.lanes = 0, this.alternate = null;
  }
  function Dn(e, t, l, r) {
    return new mw(e, t, l, r);
  }
  function Gu(e) {
    return e = e.prototype, !(!e || !e.isReactComponent);
  }
  function wl(e, t) {
    var l = e.alternate;
    return l === null ? (l = Dn(
      e.tag,
      t,
      e.key,
      e.mode
    ), l.elementType = e.elementType, l.type = e.type, l.stateNode = e.stateNode, l.alternate = e, e.alternate = l) : (l.pendingProps = t, l.type = e.type, l.flags = 0, l.subtreeFlags = 0, l.deletions = null), l.flags = e.flags & 65011712, l.childLanes = e.childLanes, l.lanes = e.lanes, l.child = e.child, l.memoizedProps = e.memoizedProps, l.memoizedState = e.memoizedState, l.updateQueue = e.updateQueue, t = e.dependencies, l.dependencies = t === null ? null : { lanes: t.lanes, firstContext: t.firstContext }, l.sibling = e.sibling, l.index = e.index, l.ref = e.ref, l.refCleanup = e.refCleanup, l;
  }
  function sm(e, t) {
    e.flags &= 65011714;
    var l = e.alternate;
    return l === null ? (e.childLanes = 0, e.lanes = t, e.child = null, e.subtreeFlags = 0, e.memoizedProps = null, e.memoizedState = null, e.updateQueue = null, e.dependencies = null, e.stateNode = null) : (e.childLanes = l.childLanes, e.lanes = l.lanes, e.child = l.child, e.subtreeFlags = 0, e.deletions = null, e.memoizedProps = l.memoizedProps, e.memoizedState = l.memoizedState, e.updateQueue = l.updateQueue, e.type = l.type, t = l.dependencies, e.dependencies = t === null ? null : {
      lanes: t.lanes,
      firstContext: t.firstContext
    }), e;
  }
  function Ki(e, t, l, r, s, c) {
    var h = 0;
    if (r = e, typeof e == "function") Gu(e) && (h = 1);
    else if (typeof e == "string")
      h = x1(
        e,
        l,
        J.current
      ) ? 26 : e === "html" || e === "head" || e === "body" ? 27 : 5;
    else
      e: switch (e) {
        case k:
          return e = Dn(31, l, t, s), e.elementType = k, e.lanes = c, e;
        case M:
          return Po(l.children, s, c, t);
        case E:
          h = 8, s |= 24;
          break;
        case A:
          return e = Dn(12, l, t, s | 2), e.elementType = A, e.lanes = c, e;
        case I:
          return e = Dn(13, l, t, s), e.elementType = I, e.lanes = c, e;
        case j:
          return e = Dn(19, l, t, s), e.elementType = j, e.lanes = c, e;
        default:
          if (typeof e == "object" && e !== null)
            switch (e.$$typeof) {
              case z:
                h = 10;
                break e;
              case O:
                h = 9;
                break e;
              case N:
                h = 11;
                break e;
              case L:
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
    return t = Dn(h, l, t, s), t.elementType = e, t.type = r, t.lanes = c, t;
  }
  function Po(e, t, l, r) {
    return e = Dn(7, e, r, t), e.lanes = l, e;
  }
  function qu(e, t, l) {
    return e = Dn(6, e, null, t), e.lanes = l, e;
  }
  function cm(e) {
    var t = Dn(18, null, null, 0);
    return t.stateNode = e, t;
  }
  function Xu(e, t, l) {
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
  var um = /* @__PURE__ */ new WeakMap();
  function Xn(e, t) {
    if (typeof e == "object" && e !== null) {
      var l = um.get(e);
      return l !== void 0 ? l : (t = {
        value: e,
        source: t,
        stack: Ce(t)
      }, um.set(e, t), t);
    }
    return {
      value: e,
      source: t,
      stack: Ce(t)
    };
  }
  var Cr = [], Or = 0, Qi = null, wa = 0, Fn = [], Kn = 0, eo = null, al = 1, il = "";
  function El(e, t) {
    Cr[Or++] = wa, Cr[Or++] = Qi, Qi = e, wa = t;
  }
  function fm(e, t, l) {
    Fn[Kn++] = al, Fn[Kn++] = il, Fn[Kn++] = eo, eo = e;
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
  function Fu(e) {
    e.return !== null && (El(e, 1), fm(e, 1, 0));
  }
  function Ku(e) {
    for (; e === Qi; )
      Qi = Cr[--Or], Cr[Or] = null, wa = Cr[--Or], Cr[Or] = null;
    for (; e === eo; )
      eo = Fn[--Kn], Fn[Kn] = null, il = Fn[--Kn], Fn[Kn] = null, al = Fn[--Kn], Fn[Kn] = null;
  }
  function dm(e, t) {
    Fn[Kn++] = al, Fn[Kn++] = il, Fn[Kn++] = eo, al = t.id, il = t.overflow, eo = e;
  }
  var un = null, kt = null, st = !1, to = null, Qn = !1, Qu = Error(i(519));
  function no(e) {
    var t = Error(
      i(
        418,
        1 < arguments.length && arguments[1] !== void 0 && arguments[1] ? "text" : "HTML",
        ""
      )
    );
    throw Ea(Xn(t, e)), Qu;
  }
  function pm(e) {
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
        for (l = 0; l < qa.length; l++)
          ot(qa[l], t);
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
        ot("invalid", t), Cg(
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
        ot("invalid", t), Mg(t, r.value, r.defaultValue, r.children);
    }
    l = r.children, typeof l != "string" && typeof l != "number" && typeof l != "bigint" || t.textContent === "" + l || r.suppressHydrationWarning === !0 || zy(t.textContent, l) ? (r.popover != null && (ot("beforetoggle", t), ot("toggle", t)), r.onScroll != null && ot("scroll", t), r.onScrollEnd != null && ot("scrollend", t), r.onClick != null && (t.onclick = xl), t = !0) : t = !1, t || no(e, !0);
  }
  function gm(e) {
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
  function Mr(e) {
    if (e !== un) return !1;
    if (!st) return gm(e), st = !0, !1;
    var t = e.tag, l;
    if ((l = t !== 3 && t !== 27) && ((l = t === 5) && (l = e.type, l = !(l !== "form" && l !== "button") || gd(e.type, e.memoizedProps)), l = !l), l && kt && no(e), gm(e), t === 13) {
      if (e = e.memoizedState, e = e !== null ? e.dehydrated : null, !e) throw Error(i(317));
      kt = Iy(e);
    } else if (t === 31) {
      if (e = e.memoizedState, e = e !== null ? e.dehydrated : null, !e) throw Error(i(317));
      kt = Iy(e);
    } else
      t === 27 ? (t = kt, yo(e.type) ? (e = bd, bd = null, kt = e) : kt = t) : kt = un ? Jn(e.stateNode.nextSibling) : null;
    return !0;
  }
  function Yo() {
    kt = un = null, st = !1;
  }
  function Zu() {
    var e = to;
    return e !== null && (Cn === null ? Cn = e : Cn.push.apply(
      Cn,
      e
    ), to = null), e;
  }
  function Ea(e) {
    to === null ? to = [e] : to.push(e);
  }
  var Ju = T(null), Go = null, Tl = null;
  function lo(e, t, l) {
    ne(Ju, t._currentValue), t._currentValue = l;
  }
  function Rl(e) {
    e._currentValue = Ju.current, B(Ju);
  }
  function $u(e, t, l) {
    for (; e !== null; ) {
      var r = e.alternate;
      if ((e.childLanes & t) !== t ? (e.childLanes |= t, r !== null && (r.childLanes |= t)) : r !== null && (r.childLanes & t) !== t && (r.childLanes |= t), e === l) break;
      e = e.return;
    }
  }
  function Wu(e, t, l, r) {
    var s = e.child;
    for (s !== null && (s.return = e); s !== null; ) {
      var c = s.dependencies;
      if (c !== null) {
        var h = s.child;
        c = c.firstContext;
        e: for (; c !== null; ) {
          var R = c;
          c = s;
          for (var V = 0; V < t.length; V++)
            if (R.context === t[V]) {
              c.lanes |= l, R = c.alternate, R !== null && (R.lanes |= l), $u(
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
        h.lanes |= l, c = h.alternate, c !== null && (c.lanes |= l), $u(h, l, e), h = null;
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
  function Ar(e, t, l, r) {
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
          Nn(s.pendingProps.value, h.value) || (e !== null ? e.push(R) : e = [R]);
        }
      } else if (s === oe.current) {
        if (h = s.alternate, h === null) throw Error(i(387));
        h.memoizedState.memoizedState !== s.memoizedState.memoizedState && (e !== null ? e.push(Za) : e = [Za]);
      }
      s = s.return;
    }
    e !== null && Wu(
      t,
      e,
      l,
      r
    ), t.flags |= 262144;
  }
  function Zi(e) {
    for (e = e.firstContext; e !== null; ) {
      if (!Nn(
        e.context._currentValue,
        e.memoizedValue
      ))
        return !0;
      e = e.next;
    }
    return !1;
  }
  function qo(e) {
    Go = e, Tl = null, e = e.dependencies, e !== null && (e.firstContext = null);
  }
  function fn(e) {
    return mm(Go, e);
  }
  function Ji(e, t) {
    return Go === null && qo(e), mm(e, t);
  }
  function mm(e, t) {
    var l = t._currentValue;
    if (t = { context: t, memoizedValue: l, next: null }, Tl === null) {
      if (e === null) throw Error(i(308));
      Tl = t, e.dependencies = { lanes: 0, firstContext: t }, e.flags |= 524288;
    } else Tl = Tl.next = t;
    return l;
  }
  var hw = typeof AbortController < "u" ? AbortController : function() {
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
  }, yw = n.unstable_scheduleCallback, vw = n.unstable_NormalPriority, Zt = {
    $$typeof: z,
    Consumer: null,
    Provider: null,
    _currentValue: null,
    _currentValue2: null,
    _threadCount: 0
  };
  function ef() {
    return {
      controller: new hw(),
      data: /* @__PURE__ */ new Map(),
      refCount: 0
    };
  }
  function Ta(e) {
    e.refCount--, e.refCount === 0 && yw(vw, function() {
      e.controller.abort();
    });
  }
  var Ra = null, tf = 0, zr = 0, Nr = null;
  function bw(e, t) {
    if (Ra === null) {
      var l = Ra = [];
      tf = 0, zr = rd(), Nr = {
        status: "pending",
        value: void 0,
        then: function(r) {
          l.push(r);
        }
      };
    }
    return tf++, t.then(hm, hm), t;
  }
  function hm() {
    if (--tf === 0 && Ra !== null) {
      Nr !== null && (Nr.status = "fulfilled");
      var e = Ra;
      Ra = null, zr = 0, Nr = null;
      for (var t = 0; t < e.length; t++) (0, e[t])();
    }
  }
  function xw(e, t) {
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
  var ym = H.S;
  H.S = function(e, t) {
    ey = ae(), typeof t == "object" && t !== null && typeof t.then == "function" && bw(e, t), ym !== null && ym(e, t);
  };
  var Xo = T(null);
  function nf() {
    var e = Xo.current;
    return e !== null ? e : Mt.pooledCache;
  }
  function $i(e, t) {
    t === null ? ne(Xo, Xo.current) : ne(Xo, t.pool);
  }
  function vm() {
    var e = nf();
    return e === null ? null : { parent: Zt._currentValue, pool: e };
  }
  var Dr = Error(i(460)), lf = Error(i(474)), Wi = Error(i(542)), es = { then: function() {
  } };
  function bm(e) {
    return e = e.status, e === "fulfilled" || e === "rejected";
  }
  function xm(e, t, l) {
    switch (l = e[l], l === void 0 ? e.push(t) : l !== t && (t.then(xl, xl), t = l), t.status) {
      case "fulfilled":
        return t.value;
      case "rejected":
        throw e = t.reason, wm(e), e;
      default:
        if (typeof t.status == "string") t.then(xl, xl);
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
            throw e = t.reason, wm(e), e;
        }
        throw Ko = t, Dr;
    }
  }
  function Fo(e) {
    try {
      var t = e._init;
      return t(e._payload);
    } catch (l) {
      throw l !== null && typeof l == "object" && typeof l.then == "function" ? (Ko = l, Dr) : l;
    }
  }
  var Ko = null;
  function Sm() {
    if (Ko === null) throw Error(i(459));
    var e = Ko;
    return Ko = null, e;
  }
  function wm(e) {
    if (e === Dr || e === Wi)
      throw Error(i(483));
  }
  var jr = null, Ca = 0;
  function ts(e) {
    var t = Ca;
    return Ca += 1, jr === null && (jr = []), xm(jr, e, t);
  }
  function Oa(e, t) {
    t = t.props.ref, e.ref = t !== void 0 ? t : null;
  }
  function ns(e, t) {
    throw t.$$typeof === S ? Error(i(525)) : (e = Object.prototype.toString.call(t), Error(
      i(
        31,
        e === "[object Object]" ? "object with keys {" + Object.keys(t).join(", ") + "}" : e
      )
    ));
  }
  function Em(e) {
    function t(K, G) {
      if (e) {
        var $ = K.deletions;
        $ === null ? (K.deletions = [G], K.flags |= 16) : $.push(G);
      }
    }
    function l(K, G) {
      if (!e) return null;
      for (; G !== null; )
        t(K, G), G = G.sibling;
      return null;
    }
    function r(K) {
      for (var G = /* @__PURE__ */ new Map(); K !== null; )
        K.key !== null ? G.set(K.key, K) : G.set(K.index, K), K = K.sibling;
      return G;
    }
    function s(K, G) {
      return K = wl(K, G), K.index = 0, K.sibling = null, K;
    }
    function c(K, G, $) {
      return K.index = $, e ? ($ = K.alternate, $ !== null ? ($ = $.index, $ < G ? (K.flags |= 67108866, G) : $) : (K.flags |= 67108866, G)) : (K.flags |= 1048576, G);
    }
    function h(K) {
      return e && K.alternate === null && (K.flags |= 67108866), K;
    }
    function R(K, G, $, ue) {
      return G === null || G.tag !== 6 ? (G = qu($, K.mode, ue), G.return = K, G) : (G = s(G, $), G.return = K, G);
    }
    function V(K, G, $, ue) {
      var Ie = $.type;
      return Ie === M ? ce(
        K,
        G,
        $.props.children,
        ue,
        $.key
      ) : G !== null && (G.elementType === Ie || typeof Ie == "object" && Ie !== null && Ie.$$typeof === _ && Fo(Ie) === G.type) ? (G = s(G, $.props), Oa(G, $), G.return = K, G) : (G = Ki(
        $.type,
        $.key,
        $.props,
        null,
        K.mode,
        ue
      ), Oa(G, $), G.return = K, G);
    }
    function W(K, G, $, ue) {
      return G === null || G.tag !== 4 || G.stateNode.containerInfo !== $.containerInfo || G.stateNode.implementation !== $.implementation ? (G = Xu($, K.mode, ue), G.return = K, G) : (G = s(G, $.children || []), G.return = K, G);
    }
    function ce(K, G, $, ue, Ie) {
      return G === null || G.tag !== 7 ? (G = Po(
        $,
        K.mode,
        ue,
        Ie
      ), G.return = K, G) : (G = s(G, $), G.return = K, G);
    }
    function de(K, G, $) {
      if (typeof G == "string" && G !== "" || typeof G == "number" || typeof G == "bigint")
        return G = qu(
          "" + G,
          K.mode,
          $
        ), G.return = K, G;
      if (typeof G == "object" && G !== null) {
        switch (G.$$typeof) {
          case C:
            return $ = Ki(
              G.type,
              G.key,
              G.props,
              null,
              K.mode,
              $
            ), Oa($, G), $.return = K, $;
          case w:
            return G = Xu(
              G,
              K.mode,
              $
            ), G.return = K, G;
          case _:
            return G = Fo(G), de(K, G, $);
        }
        if (q(G) || F(G))
          return G = Po(
            G,
            K.mode,
            $,
            null
          ), G.return = K, G;
        if (typeof G.then == "function")
          return de(K, ts(G), $);
        if (G.$$typeof === z)
          return de(
            K,
            Ji(K, G),
            $
          );
        ns(K, G);
      }
      return null;
    }
    function ee(K, G, $, ue) {
      var Ie = G !== null ? G.key : null;
      if (typeof $ == "string" && $ !== "" || typeof $ == "number" || typeof $ == "bigint")
        return Ie !== null ? null : R(K, G, "" + $, ue);
      if (typeof $ == "object" && $ !== null) {
        switch ($.$$typeof) {
          case C:
            return $.key === Ie ? V(K, G, $, ue) : null;
          case w:
            return $.key === Ie ? W(K, G, $, ue) : null;
          case _:
            return $ = Fo($), ee(K, G, $, ue);
        }
        if (q($) || F($))
          return Ie !== null ? null : ce(K, G, $, ue, null);
        if (typeof $.then == "function")
          return ee(
            K,
            G,
            ts($),
            ue
          );
        if ($.$$typeof === z)
          return ee(
            K,
            G,
            Ji(K, $),
            ue
          );
        ns(K, $);
      }
      return null;
    }
    function le(K, G, $, ue, Ie) {
      if (typeof ue == "string" && ue !== "" || typeof ue == "number" || typeof ue == "bigint")
        return K = K.get($) || null, R(G, K, "" + ue, Ie);
      if (typeof ue == "object" && ue !== null) {
        switch (ue.$$typeof) {
          case C:
            return K = K.get(
              ue.key === null ? $ : ue.key
            ) || null, V(G, K, ue, Ie);
          case w:
            return K = K.get(
              ue.key === null ? $ : ue.key
            ) || null, W(G, K, ue, Ie);
          case _:
            return ue = Fo(ue), le(
              K,
              G,
              $,
              ue,
              Ie
            );
        }
        if (q(ue) || F(ue))
          return K = K.get($) || null, ce(G, K, ue, Ie, null);
        if (typeof ue.then == "function")
          return le(
            K,
            G,
            $,
            ts(ue),
            Ie
          );
        if (ue.$$typeof === z)
          return le(
            K,
            G,
            $,
            Ji(G, ue),
            Ie
          );
        ns(G, ue);
      }
      return null;
    }
    function Ne(K, G, $, ue) {
      for (var Ie = null, ut = null, De = G, Fe = G = 0, it = null; De !== null && Fe < $.length; Fe++) {
        De.index > Fe ? (it = De, De = null) : it = De.sibling;
        var ft = ee(
          K,
          De,
          $[Fe],
          ue
        );
        if (ft === null) {
          De === null && (De = it);
          break;
        }
        e && De && ft.alternate === null && t(K, De), G = c(ft, G, Fe), ut === null ? Ie = ft : ut.sibling = ft, ut = ft, De = it;
      }
      if (Fe === $.length)
        return l(K, De), st && El(K, Fe), Ie;
      if (De === null) {
        for (; Fe < $.length; Fe++)
          De = de(K, $[Fe], ue), De !== null && (G = c(
            De,
            G,
            Fe
          ), ut === null ? Ie = De : ut.sibling = De, ut = De);
        return st && El(K, Fe), Ie;
      }
      for (De = r(De); Fe < $.length; Fe++)
        it = le(
          De,
          K,
          Fe,
          $[Fe],
          ue
        ), it !== null && (e && it.alternate !== null && De.delete(
          it.key === null ? Fe : it.key
        ), G = c(
          it,
          G,
          Fe
        ), ut === null ? Ie = it : ut.sibling = it, ut = it);
      return e && De.forEach(function(wo) {
        return t(K, wo);
      }), st && El(K, Fe), Ie;
    }
    function Ve(K, G, $, ue) {
      if ($ == null) throw Error(i(151));
      for (var Ie = null, ut = null, De = G, Fe = G = 0, it = null, ft = $.next(); De !== null && !ft.done; Fe++, ft = $.next()) {
        De.index > Fe ? (it = De, De = null) : it = De.sibling;
        var wo = ee(K, De, ft.value, ue);
        if (wo === null) {
          De === null && (De = it);
          break;
        }
        e && De && wo.alternate === null && t(K, De), G = c(wo, G, Fe), ut === null ? Ie = wo : ut.sibling = wo, ut = wo, De = it;
      }
      if (ft.done)
        return l(K, De), st && El(K, Fe), Ie;
      if (De === null) {
        for (; !ft.done; Fe++, ft = $.next())
          ft = de(K, ft.value, ue), ft !== null && (G = c(ft, G, Fe), ut === null ? Ie = ft : ut.sibling = ft, ut = ft);
        return st && El(K, Fe), Ie;
      }
      for (De = r(De); !ft.done; Fe++, ft = $.next())
        ft = le(De, K, Fe, ft.value, ue), ft !== null && (e && ft.alternate !== null && De.delete(ft.key === null ? Fe : ft.key), G = c(ft, G, Fe), ut === null ? Ie = ft : ut.sibling = ft, ut = ft);
      return e && De.forEach(function(N1) {
        return t(K, N1);
      }), st && El(K, Fe), Ie;
    }
    function Tt(K, G, $, ue) {
      if (typeof $ == "object" && $ !== null && $.type === M && $.key === null && ($ = $.props.children), typeof $ == "object" && $ !== null) {
        switch ($.$$typeof) {
          case C:
            e: {
              for (var Ie = $.key; G !== null; ) {
                if (G.key === Ie) {
                  if (Ie = $.type, Ie === M) {
                    if (G.tag === 7) {
                      l(
                        K,
                        G.sibling
                      ), ue = s(
                        G,
                        $.props.children
                      ), ue.return = K, K = ue;
                      break e;
                    }
                  } else if (G.elementType === Ie || typeof Ie == "object" && Ie !== null && Ie.$$typeof === _ && Fo(Ie) === G.type) {
                    l(
                      K,
                      G.sibling
                    ), ue = s(G, $.props), Oa(ue, $), ue.return = K, K = ue;
                    break e;
                  }
                  l(K, G);
                  break;
                } else t(K, G);
                G = G.sibling;
              }
              $.type === M ? (ue = Po(
                $.props.children,
                K.mode,
                ue,
                $.key
              ), ue.return = K, K = ue) : (ue = Ki(
                $.type,
                $.key,
                $.props,
                null,
                K.mode,
                ue
              ), Oa(ue, $), ue.return = K, K = ue);
            }
            return h(K);
          case w:
            e: {
              for (Ie = $.key; G !== null; ) {
                if (G.key === Ie)
                  if (G.tag === 4 && G.stateNode.containerInfo === $.containerInfo && G.stateNode.implementation === $.implementation) {
                    l(
                      K,
                      G.sibling
                    ), ue = s(G, $.children || []), ue.return = K, K = ue;
                    break e;
                  } else {
                    l(K, G);
                    break;
                  }
                else t(K, G);
                G = G.sibling;
              }
              ue = Xu($, K.mode, ue), ue.return = K, K = ue;
            }
            return h(K);
          case _:
            return $ = Fo($), Tt(
              K,
              G,
              $,
              ue
            );
        }
        if (q($))
          return Ne(
            K,
            G,
            $,
            ue
          );
        if (F($)) {
          if (Ie = F($), typeof Ie != "function") throw Error(i(150));
          return $ = Ie.call($), Ve(
            K,
            G,
            $,
            ue
          );
        }
        if (typeof $.then == "function")
          return Tt(
            K,
            G,
            ts($),
            ue
          );
        if ($.$$typeof === z)
          return Tt(
            K,
            G,
            Ji(K, $),
            ue
          );
        ns(K, $);
      }
      return typeof $ == "string" && $ !== "" || typeof $ == "number" || typeof $ == "bigint" ? ($ = "" + $, G !== null && G.tag === 6 ? (l(K, G.sibling), ue = s(G, $), ue.return = K, K = ue) : (l(K, G), ue = qu($, K.mode, ue), ue.return = K, K = ue), h(K)) : l(K, G);
    }
    return function(K, G, $, ue) {
      try {
        Ca = 0;
        var Ie = Tt(
          K,
          G,
          $,
          ue
        );
        return jr = null, Ie;
      } catch (De) {
        if (De === Dr || De === Wi) throw De;
        var ut = Dn(29, De, null, K.mode);
        return ut.lanes = ue, ut.return = K, ut;
      }
    };
  }
  var Qo = Em(!0), Tm = Em(!1), oo = !1;
  function of(e) {
    e.updateQueue = {
      baseState: e.memoizedState,
      firstBaseUpdate: null,
      lastBaseUpdate: null,
      shared: { pending: null, lanes: 0, hiddenCallbacks: null },
      callbacks: null
    };
  }
  function rf(e, t) {
    e = e.updateQueue, t.updateQueue === e && (t.updateQueue = {
      baseState: e.baseState,
      firstBaseUpdate: e.firstBaseUpdate,
      lastBaseUpdate: e.lastBaseUpdate,
      shared: e.shared,
      callbacks: null
    });
  }
  function ro(e) {
    return { lane: e, tag: 0, payload: null, callback: null, next: null };
  }
  function ao(e, t, l) {
    var r = e.updateQueue;
    if (r === null) return null;
    if (r = r.shared, (gt & 2) !== 0) {
      var s = r.pending;
      return s === null ? t.next = t : (t.next = s.next, s.next = t), r.pending = t, t = Fi(e), im(e, null, l), t;
    }
    return Xi(e, r, t, l), Fi(e);
  }
  function Ma(e, t, l) {
    if (t = t.updateQueue, t !== null && (t = t.shared, (l & 4194048) !== 0)) {
      var r = t.lanes;
      r &= e.pendingLanes, l |= r, t.lanes = l, tl(e, l);
    }
  }
  function af(e, t) {
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
  var sf = !1;
  function Aa() {
    if (sf) {
      var e = Nr;
      if (e !== null) throw e;
    }
  }
  function za(e, t, l, r) {
    sf = !1;
    var s = e.updateQueue;
    oo = !1;
    var c = s.firstBaseUpdate, h = s.lastBaseUpdate, R = s.shared.pending;
    if (R !== null) {
      s.shared.pending = null;
      var V = R, W = V.next;
      V.next = null, h === null ? c = W : h.next = W, h = V;
      var ce = e.alternate;
      ce !== null && (ce = ce.updateQueue, R = ce.lastBaseUpdate, R !== h && (R === null ? ce.firstBaseUpdate = W : R.next = W, ce.lastBaseUpdate = V));
    }
    if (c !== null) {
      var de = s.baseState;
      h = 0, ce = W = V = null, R = c;
      do {
        var ee = R.lane & -536870913, le = ee !== R.lane;
        if (le ? (at & ee) === ee : (r & ee) === ee) {
          ee !== 0 && ee === zr && (sf = !0), ce !== null && (ce = ce.next = {
            lane: 0,
            tag: R.tag,
            payload: R.payload,
            callback: null,
            next: null
          });
          e: {
            var Ne = e, Ve = R;
            ee = t;
            var Tt = l;
            switch (Ve.tag) {
              case 1:
                if (Ne = Ve.payload, typeof Ne == "function") {
                  de = Ne.call(Tt, de, ee);
                  break e;
                }
                de = Ne;
                break e;
              case 3:
                Ne.flags = Ne.flags & -65537 | 128;
              case 0:
                if (Ne = Ve.payload, ee = typeof Ne == "function" ? Ne.call(Tt, de, ee) : Ne, ee == null) break e;
                de = x({}, de, ee);
                break e;
              case 2:
                oo = !0;
            }
          }
          ee = R.callback, ee !== null && (e.flags |= 64, le && (e.flags |= 8192), le = s.callbacks, le === null ? s.callbacks = [ee] : le.push(ee));
        } else
          le = {
            lane: ee,
            tag: R.tag,
            payload: R.payload,
            callback: R.callback,
            next: null
          }, ce === null ? (W = ce = le, V = de) : ce = ce.next = le, h |= ee;
        if (R = R.next, R === null) {
          if (R = s.shared.pending, R === null)
            break;
          le = R, R = le.next, le.next = null, s.lastBaseUpdate = le, s.shared.pending = null;
        }
      } while (!0);
      ce === null && (V = de), s.baseState = V, s.firstBaseUpdate = W, s.lastBaseUpdate = ce, c === null && (s.shared.lanes = 0), fo |= h, e.lanes = h, e.memoizedState = de;
    }
  }
  function Rm(e, t) {
    if (typeof e != "function")
      throw Error(i(191, e));
    e.call(t);
  }
  function Cm(e, t) {
    var l = e.callbacks;
    if (l !== null)
      for (e.callbacks = null, e = 0; e < l.length; e++)
        Rm(l[e], t);
  }
  var kr = T(null), ls = T(0);
  function Om(e, t) {
    e = kl, ne(ls, e), ne(kr, t), kl = e | t.baseLanes;
  }
  function cf() {
    ne(ls, kl), ne(kr, kr.current);
  }
  function uf() {
    kl = ls.current, B(kr), B(ls);
  }
  var jn = T(null), Zn = null;
  function io(e) {
    var t = e.alternate;
    ne(Ft, Ft.current & 1), ne(jn, e), Zn === null && (t === null || kr.current !== null || t.memoizedState !== null) && (Zn = e);
  }
  function ff(e) {
    ne(Ft, Ft.current), ne(jn, e), Zn === null && (Zn = e);
  }
  function Mm(e) {
    e.tag === 22 ? (ne(Ft, Ft.current), ne(jn, e), Zn === null && (Zn = e)) : so();
  }
  function so() {
    ne(Ft, Ft.current), ne(jn, jn.current);
  }
  function kn(e) {
    B(jn), Zn === e && (Zn = null), B(Ft);
  }
  var Ft = T(0);
  function os(e) {
    for (var t = e; t !== null; ) {
      if (t.tag === 13) {
        var l = t.memoizedState;
        if (l !== null && (l = l.dehydrated, l === null || yd(l) || vd(l)))
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
  var Cl = 0, Xe = null, wt = null, Jt = null, rs = !1, _r = !1, Zo = !1, as = 0, Na = 0, Hr = null, Sw = 0;
  function Bt() {
    throw Error(i(321));
  }
  function df(e, t) {
    if (t === null) return !1;
    for (var l = 0; l < t.length && l < e.length; l++)
      if (!Nn(e[l], t[l])) return !1;
    return !0;
  }
  function pf(e, t, l, r, s, c) {
    return Cl = c, Xe = t, t.memoizedState = null, t.updateQueue = null, t.lanes = 0, H.H = e === null || e.memoizedState === null ? fh : Mf, Zo = !1, c = l(r, s), Zo = !1, _r && (c = zm(
      t,
      l,
      r,
      s
    )), Am(e), c;
  }
  function Am(e) {
    H.H = ka;
    var t = wt !== null && wt.next !== null;
    if (Cl = 0, Jt = wt = Xe = null, rs = !1, Na = 0, Hr = null, t) throw Error(i(300));
    e === null || $t || (e = e.dependencies, e !== null && Zi(e) && ($t = !0));
  }
  function zm(e, t, l, r) {
    Xe = e;
    var s = 0;
    do {
      if (_r && (Hr = null), Na = 0, _r = !1, 25 <= s) throw Error(i(301));
      if (s += 1, Jt = wt = null, e.updateQueue != null) {
        var c = e.updateQueue;
        c.lastEffect = null, c.events = null, c.stores = null, c.memoCache != null && (c.memoCache.index = 0);
      }
      H.H = dh, c = t(l, r);
    } while (_r);
    return c;
  }
  function ww() {
    var e = H.H, t = e.useState()[0];
    return t = typeof t.then == "function" ? Da(t) : t, e = e.useState()[0], (wt !== null ? wt.memoizedState : null) !== e && (Xe.flags |= 1024), t;
  }
  function gf() {
    var e = as !== 0;
    return as = 0, e;
  }
  function mf(e, t, l) {
    t.updateQueue = e.updateQueue, t.flags &= -2053, e.lanes &= ~l;
  }
  function hf(e) {
    if (rs) {
      for (e = e.memoizedState; e !== null; ) {
        var t = e.queue;
        t !== null && (t.pending = null), e = e.next;
      }
      rs = !1;
    }
    Cl = 0, Jt = wt = Xe = null, _r = !1, Na = as = 0, Hr = null;
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
  function is() {
    return { lastEffect: null, events: null, stores: null, memoCache: null };
  }
  function Da(e) {
    var t = Na;
    return Na += 1, Hr === null && (Hr = []), e = xm(Hr, e, t), t = Xe, (Jt === null ? t.memoizedState : Jt.next) === null && (t = t.alternate, H.H = t === null || t.memoizedState === null ? fh : Mf), e;
  }
  function ss(e) {
    if (e !== null && typeof e == "object") {
      if (typeof e.then == "function") return Da(e);
      if (e.$$typeof === z) return fn(e);
    }
    throw Error(i(438, String(e)));
  }
  function yf(e) {
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
    if (t == null && (t = { data: [], index: 0 }), l === null && (l = is(), Xe.updateQueue = l), l.memoCache = t, l = t.data[t.index], l === void 0)
      for (l = t.data[t.index] = Array(e), r = 0; r < e; r++)
        l[r] = Y;
    return t.index++, l;
  }
  function Ol(e, t) {
    return typeof t == "function" ? t(e) : t;
  }
  function cs(e) {
    var t = Kt();
    return vf(t, wt, e);
  }
  function vf(e, t, l) {
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
      var R = h = null, V = null, W = t, ce = !1;
      do {
        var de = W.lane & -536870913;
        if (de !== W.lane ? (at & de) === de : (Cl & de) === de) {
          var ee = W.revertLane;
          if (ee === 0)
            V !== null && (V = V.next = {
              lane: 0,
              revertLane: 0,
              gesture: null,
              action: W.action,
              hasEagerState: W.hasEagerState,
              eagerState: W.eagerState,
              next: null
            }), de === zr && (ce = !0);
          else if ((Cl & ee) === ee) {
            W = W.next, ee === zr && (ce = !0);
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
            }, V === null ? (R = V = de, h = c) : V = V.next = de, Xe.lanes |= ee, fo |= ee;
          de = W.action, Zo && l(c, de), c = W.hasEagerState ? W.eagerState : l(c, de);
        } else
          ee = {
            lane: de,
            revertLane: W.revertLane,
            gesture: W.gesture,
            action: W.action,
            hasEagerState: W.hasEagerState,
            eagerState: W.eagerState,
            next: null
          }, V === null ? (R = V = ee, h = c) : V = V.next = ee, Xe.lanes |= de, fo |= de;
        W = W.next;
      } while (W !== null && W !== t);
      if (V === null ? h = c : V.next = R, !Nn(c, e.memoizedState) && ($t = !0, ce && (l = Nr, l !== null)))
        throw l;
      e.memoizedState = c, e.baseState = h, e.baseQueue = V, r.lastRenderedState = c;
    }
    return s === null && (r.lanes = 0), [e.memoizedState, r.dispatch];
  }
  function bf(e) {
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
      Nn(c, t.memoizedState) || ($t = !0), t.memoizedState = c, t.baseQueue === null && (t.baseState = c), l.lastRenderedState = c;
    }
    return [c, r];
  }
  function Nm(e, t, l) {
    var r = Xe, s = Kt(), c = st;
    if (c) {
      if (l === void 0) throw Error(i(407));
      l = l();
    } else l = t();
    var h = !Nn(
      (wt || s).memoizedState,
      l
    );
    if (h && (s.memoizedState = l, $t = !0), s = s.queue, wf(km.bind(null, r, s, e), [
      e
    ]), s.getSnapshot !== t || h || Jt !== null && Jt.memoizedState.tag & 1) {
      if (r.flags |= 2048, Ur(
        9,
        { destroy: void 0 },
        jm.bind(
          null,
          r,
          s,
          l,
          t
        ),
        null
      ), Mt === null) throw Error(i(349));
      c || (Cl & 127) !== 0 || Dm(r, t, l);
    }
    return l;
  }
  function Dm(e, t, l) {
    e.flags |= 16384, e = { getSnapshot: t, value: l }, t = Xe.updateQueue, t === null ? (t = is(), Xe.updateQueue = t, t.stores = [e]) : (l = t.stores, l === null ? t.stores = [e] : l.push(e));
  }
  function jm(e, t, l, r) {
    t.value = l, t.getSnapshot = r, _m(t) && Hm(e);
  }
  function km(e, t, l) {
    return l(function() {
      _m(t) && Hm(e);
    });
  }
  function _m(e) {
    var t = e.getSnapshot;
    e = e.value;
    try {
      var l = t();
      return !Nn(e, l);
    } catch {
      return !0;
    }
  }
  function Hm(e) {
    var t = Vo(e, 2);
    t !== null && On(t, e, 2);
  }
  function xf(e) {
    var t = yn();
    if (typeof e == "function") {
      var l = e;
      if (e = l(), Zo) {
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
      lastRenderedReducer: Ol,
      lastRenderedState: e
    }, t;
  }
  function Um(e, t, l, r) {
    return e.baseState = l, vf(
      e,
      wt,
      typeof r == "function" ? r : Ol
    );
  }
  function Ew(e, t, l, r, s) {
    if (ds(e)) throw Error(i(485));
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
      H.T !== null ? l(!0) : c.isTransition = !1, r(c), l = t.pending, l === null ? (c.next = t.pending = c, Lm(t, c)) : (c.next = l.next, t.pending = l.next = c);
    }
  }
  function Lm(e, t) {
    var l = t.action, r = t.payload, s = e.state;
    if (t.isTransition) {
      var c = H.T, h = {};
      H.T = h;
      try {
        var R = l(s, r), V = H.S;
        V !== null && V(h, R), Im(e, t, R);
      } catch (W) {
        Sf(e, t, W);
      } finally {
        c !== null && h.types !== null && (c.types = h.types), H.T = c;
      }
    } else
      try {
        c = l(s, r), Im(e, t, c);
      } catch (W) {
        Sf(e, t, W);
      }
  }
  function Im(e, t, l) {
    l !== null && typeof l == "object" && typeof l.then == "function" ? l.then(
      function(r) {
        Bm(e, t, r);
      },
      function(r) {
        return Sf(e, t, r);
      }
    ) : Bm(e, t, l);
  }
  function Bm(e, t, l) {
    t.status = "fulfilled", t.value = l, Vm(t), e.state = l, t = e.pending, t !== null && (l = t.next, l === t ? e.pending = null : (l = l.next, t.next = l, Lm(e, l)));
  }
  function Sf(e, t, l) {
    var r = e.pending;
    if (e.pending = null, r !== null) {
      r = r.next;
      do
        t.status = "rejected", t.reason = l, Vm(t), t = t.next;
      while (t !== r);
    }
    e.action = null;
  }
  function Vm(e) {
    e = e.listeners;
    for (var t = 0; t < e.length; t++) (0, e[t])();
  }
  function Pm(e, t) {
    return t;
  }
  function Ym(e, t) {
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
            no(r);
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
      lastRenderedReducer: Pm,
      lastRenderedState: t
    }, l.queue = r, l = sh.bind(
      null,
      Xe,
      r
    ), r.dispatch = l, r = xf(!1), c = Of.bind(
      null,
      Xe,
      !1,
      r.queue
    ), r = yn(), s = {
      state: t,
      dispatch: null,
      action: e,
      pending: null
    }, r.queue = s, l = Ew.bind(
      null,
      Xe,
      s,
      c,
      l
    ), s.dispatch = l, r.memoizedState = e, [t, l, !1];
  }
  function Gm(e) {
    var t = Kt();
    return qm(t, wt, e);
  }
  function qm(e, t, l) {
    if (t = vf(
      e,
      t,
      Pm
    )[0], e = cs(Ol)[0], typeof t == "object" && t !== null && typeof t.then == "function")
      try {
        var r = Da(t);
      } catch (h) {
        throw h === Dr ? Wi : h;
      }
    else r = t;
    t = Kt();
    var s = t.queue, c = s.dispatch;
    return l !== t.memoizedState && (Xe.flags |= 2048, Ur(
      9,
      { destroy: void 0 },
      Tw.bind(null, s, l),
      null
    )), [r, c, e];
  }
  function Tw(e, t) {
    e.action = t;
  }
  function Xm(e) {
    var t = Kt(), l = wt;
    if (l !== null)
      return qm(t, l, e);
    Kt(), t = t.memoizedState, l = Kt();
    var r = l.queue.dispatch;
    return l.memoizedState = e, [t, r, !1];
  }
  function Ur(e, t, l, r) {
    return e = { tag: e, create: l, deps: r, inst: t, next: null }, t = Xe.updateQueue, t === null && (t = is(), Xe.updateQueue = t), l = t.lastEffect, l === null ? t.lastEffect = e.next = e : (r = l.next, l.next = e, e.next = r, t.lastEffect = e), e;
  }
  function Fm() {
    return Kt().memoizedState;
  }
  function us(e, t, l, r) {
    var s = yn();
    Xe.flags |= e, s.memoizedState = Ur(
      1 | t,
      { destroy: void 0 },
      l,
      r === void 0 ? null : r
    );
  }
  function fs(e, t, l, r) {
    var s = Kt();
    r = r === void 0 ? null : r;
    var c = s.memoizedState.inst;
    wt !== null && r !== null && df(r, wt.memoizedState.deps) ? s.memoizedState = Ur(t, c, l, r) : (Xe.flags |= e, s.memoizedState = Ur(
      1 | t,
      c,
      l,
      r
    ));
  }
  function Km(e, t) {
    us(8390656, 8, e, t);
  }
  function wf(e, t) {
    fs(2048, 8, e, t);
  }
  function Rw(e) {
    Xe.flags |= 4;
    var t = Xe.updateQueue;
    if (t === null)
      t = is(), Xe.updateQueue = t, t.events = [e];
    else {
      var l = t.events;
      l === null ? t.events = [e] : l.push(e);
    }
  }
  function Qm(e) {
    var t = Kt().memoizedState;
    return Rw({ ref: t, nextImpl: e }), function() {
      if ((gt & 2) !== 0) throw Error(i(440));
      return t.impl.apply(void 0, arguments);
    };
  }
  function Zm(e, t) {
    return fs(4, 2, e, t);
  }
  function Jm(e, t) {
    return fs(4, 4, e, t);
  }
  function $m(e, t) {
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
  function Wm(e, t, l) {
    l = l != null ? l.concat([e]) : null, fs(4, 4, $m.bind(null, t, e), l);
  }
  function Ef() {
  }
  function eh(e, t) {
    var l = Kt();
    t = t === void 0 ? null : t;
    var r = l.memoizedState;
    return t !== null && df(t, r[1]) ? r[0] : (l.memoizedState = [e, t], e);
  }
  function th(e, t) {
    var l = Kt();
    t = t === void 0 ? null : t;
    var r = l.memoizedState;
    if (t !== null && df(t, r[1]))
      return r[0];
    if (r = e(), Zo) {
      zt(!0);
      try {
        e();
      } finally {
        zt(!1);
      }
    }
    return l.memoizedState = [r, t], r;
  }
  function Tf(e, t, l) {
    return l === void 0 || (Cl & 1073741824) !== 0 && (at & 261930) === 0 ? e.memoizedState = t : (e.memoizedState = l, e = ny(), Xe.lanes |= e, fo |= e, l);
  }
  function nh(e, t, l, r) {
    return Nn(l, t) ? l : kr.current !== null ? (e = Tf(e, l, r), Nn(e, t) || ($t = !0), e) : (Cl & 42) === 0 || (Cl & 1073741824) !== 0 && (at & 261930) === 0 ? ($t = !0, e.memoizedState = l) : (e = ny(), Xe.lanes |= e, fo |= e, t);
  }
  function lh(e, t, l, r, s) {
    var c = D.p;
    D.p = c !== 0 && 8 > c ? c : 8;
    var h = H.T, R = {};
    H.T = R, Of(e, !1, t, l);
    try {
      var V = s(), W = H.S;
      if (W !== null && W(R, V), V !== null && typeof V == "object" && typeof V.then == "function") {
        var ce = xw(
          V,
          r
        );
        ja(
          e,
          t,
          ce,
          Un(e)
        );
      } else
        ja(
          e,
          t,
          r,
          Un(e)
        );
    } catch (de) {
      ja(
        e,
        t,
        { then: function() {
        }, status: "rejected", reason: de },
        Un()
      );
    } finally {
      D.p = c, h !== null && R.types !== null && (h.types = R.types), H.T = h;
    }
  }
  function Cw() {
  }
  function Rf(e, t, l, r) {
    if (e.tag !== 5) throw Error(i(476));
    var s = oh(e).queue;
    lh(
      e,
      s,
      t,
      U,
      l === null ? Cw : function() {
        return rh(e), l(r);
      }
    );
  }
  function oh(e) {
    var t = e.memoizedState;
    if (t !== null) return t;
    t = {
      memoizedState: U,
      baseState: U,
      baseQueue: null,
      queue: {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: Ol,
        lastRenderedState: U
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
        lastRenderedReducer: Ol,
        lastRenderedState: l
      },
      next: null
    }, e.memoizedState = t, e = e.alternate, e !== null && (e.memoizedState = t), t;
  }
  function rh(e) {
    var t = oh(e);
    t.next === null && (t = e.alternate.memoizedState), ja(
      e,
      t.next.queue,
      {},
      Un()
    );
  }
  function Cf() {
    return fn(Za);
  }
  function ah() {
    return Kt().memoizedState;
  }
  function ih() {
    return Kt().memoizedState;
  }
  function Ow(e) {
    for (var t = e.return; t !== null; ) {
      switch (t.tag) {
        case 24:
        case 3:
          var l = Un();
          e = ro(l);
          var r = ao(t, e, l);
          r !== null && (On(r, t, l), Ma(r, t, l)), t = { cache: ef() }, e.payload = t;
          return;
      }
      t = t.return;
    }
  }
  function Mw(e, t, l) {
    var r = Un();
    l = {
      lane: r,
      revertLane: 0,
      gesture: null,
      action: l,
      hasEagerState: !1,
      eagerState: null,
      next: null
    }, ds(e) ? ch(t, l) : (l = Yu(e, t, l, r), l !== null && (On(l, e, r), uh(l, t, r)));
  }
  function sh(e, t, l) {
    var r = Un();
    ja(e, t, l, r);
  }
  function ja(e, t, l, r) {
    var s = {
      lane: r,
      revertLane: 0,
      gesture: null,
      action: l,
      hasEagerState: !1,
      eagerState: null,
      next: null
    };
    if (ds(e)) ch(t, s);
    else {
      var c = e.alternate;
      if (e.lanes === 0 && (c === null || c.lanes === 0) && (c = t.lastRenderedReducer, c !== null))
        try {
          var h = t.lastRenderedState, R = c(h, l);
          if (s.hasEagerState = !0, s.eagerState = R, Nn(R, h))
            return Xi(e, t, s, 0), Mt === null && qi(), !1;
        } catch {
        }
      if (l = Yu(e, t, s, r), l !== null)
        return On(l, e, r), uh(l, t, r), !0;
    }
    return !1;
  }
  function Of(e, t, l, r) {
    if (r = {
      lane: 2,
      revertLane: rd(),
      gesture: null,
      action: r,
      hasEagerState: !1,
      eagerState: null,
      next: null
    }, ds(e)) {
      if (t) throw Error(i(479));
    } else
      t = Yu(
        e,
        l,
        r,
        2
      ), t !== null && On(t, e, 2);
  }
  function ds(e) {
    var t = e.alternate;
    return e === Xe || t !== null && t === Xe;
  }
  function ch(e, t) {
    _r = rs = !0;
    var l = e.pending;
    l === null ? t.next = t : (t.next = l.next, l.next = t), e.pending = t;
  }
  function uh(e, t, l) {
    if ((l & 4194048) !== 0) {
      var r = t.lanes;
      r &= e.pendingLanes, l |= r, t.lanes = l, tl(e, l);
    }
  }
  var ka = {
    readContext: fn,
    use: ss,
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
  ka.useEffectEvent = Bt;
  var fh = {
    readContext: fn,
    use: ss,
    useCallback: function(e, t) {
      return yn().memoizedState = [
        e,
        t === void 0 ? null : t
      ], e;
    },
    useContext: fn,
    useEffect: Km,
    useImperativeHandle: function(e, t, l) {
      l = l != null ? l.concat([e]) : null, us(
        4194308,
        4,
        $m.bind(null, t, e),
        l
      );
    },
    useLayoutEffect: function(e, t) {
      return us(4194308, 4, e, t);
    },
    useInsertionEffect: function(e, t) {
      us(4, 2, e, t);
    },
    useMemo: function(e, t) {
      var l = yn();
      t = t === void 0 ? null : t;
      var r = e();
      if (Zo) {
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
        if (Zo) {
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
      }, r.queue = e, e = e.dispatch = Mw.bind(
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
      e = xf(e);
      var t = e.queue, l = sh.bind(null, Xe, t);
      return t.dispatch = l, [e.memoizedState, l];
    },
    useDebugValue: Ef,
    useDeferredValue: function(e, t) {
      var l = yn();
      return Tf(l, e, t);
    },
    useTransition: function() {
      var e = xf(!1);
      return e = lh.bind(
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
      return s.queue = c, Km(km.bind(null, r, c, e), [
        e
      ]), r.flags |= 2048, Ur(
        9,
        { destroy: void 0 },
        jm.bind(
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
        l = (r & ~(1 << 32 - yt(r) - 1)).toString(32) + l, t = "_" + t + "R_" + l, l = as++, 0 < l && (t += "H" + l.toString(32)), t += "_";
      } else
        l = Sw++, t = "_" + t + "r_" + l.toString(32) + "_";
      return e.memoizedState = t;
    },
    useHostTransitionStatus: Cf,
    useFormState: Ym,
    useActionState: Ym,
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
      return t.queue = l, t = Of.bind(
        null,
        Xe,
        !0,
        l
      ), l.dispatch = t, [e, t];
    },
    useMemoCache: yf,
    useCacheRefresh: function() {
      return yn().memoizedState = Ow.bind(
        null,
        Xe
      );
    },
    useEffectEvent: function(e) {
      var t = yn(), l = { impl: e };
      return t.memoizedState = l, function() {
        if ((gt & 2) !== 0)
          throw Error(i(440));
        return l.impl.apply(void 0, arguments);
      };
    }
  }, Mf = {
    readContext: fn,
    use: ss,
    useCallback: eh,
    useContext: fn,
    useEffect: wf,
    useImperativeHandle: Wm,
    useInsertionEffect: Zm,
    useLayoutEffect: Jm,
    useMemo: th,
    useReducer: cs,
    useRef: Fm,
    useState: function() {
      return cs(Ol);
    },
    useDebugValue: Ef,
    useDeferredValue: function(e, t) {
      var l = Kt();
      return nh(
        l,
        wt.memoizedState,
        e,
        t
      );
    },
    useTransition: function() {
      var e = cs(Ol)[0], t = Kt().memoizedState;
      return [
        typeof e == "boolean" ? e : Da(e),
        t
      ];
    },
    useSyncExternalStore: Nm,
    useId: ah,
    useHostTransitionStatus: Cf,
    useFormState: Gm,
    useActionState: Gm,
    useOptimistic: function(e, t) {
      var l = Kt();
      return Um(l, wt, e, t);
    },
    useMemoCache: yf,
    useCacheRefresh: ih
  };
  Mf.useEffectEvent = Qm;
  var dh = {
    readContext: fn,
    use: ss,
    useCallback: eh,
    useContext: fn,
    useEffect: wf,
    useImperativeHandle: Wm,
    useInsertionEffect: Zm,
    useLayoutEffect: Jm,
    useMemo: th,
    useReducer: bf,
    useRef: Fm,
    useState: function() {
      return bf(Ol);
    },
    useDebugValue: Ef,
    useDeferredValue: function(e, t) {
      var l = Kt();
      return wt === null ? Tf(l, e, t) : nh(
        l,
        wt.memoizedState,
        e,
        t
      );
    },
    useTransition: function() {
      var e = bf(Ol)[0], t = Kt().memoizedState;
      return [
        typeof e == "boolean" ? e : Da(e),
        t
      ];
    },
    useSyncExternalStore: Nm,
    useId: ah,
    useHostTransitionStatus: Cf,
    useFormState: Xm,
    useActionState: Xm,
    useOptimistic: function(e, t) {
      var l = Kt();
      return wt !== null ? Um(l, wt, e, t) : (l.baseState = e, [e, l.queue.dispatch]);
    },
    useMemoCache: yf,
    useCacheRefresh: ih
  };
  dh.useEffectEvent = Qm;
  function Af(e, t, l, r) {
    t = e.memoizedState, l = l(r, t), l = l == null ? t : x({}, t, l), e.memoizedState = l, e.lanes === 0 && (e.updateQueue.baseState = l);
  }
  var zf = {
    enqueueSetState: function(e, t, l) {
      e = e._reactInternals;
      var r = Un(), s = ro(r);
      s.payload = t, l != null && (s.callback = l), t = ao(e, s, r), t !== null && (On(t, e, r), Ma(t, e, r));
    },
    enqueueReplaceState: function(e, t, l) {
      e = e._reactInternals;
      var r = Un(), s = ro(r);
      s.tag = 1, s.payload = t, l != null && (s.callback = l), t = ao(e, s, r), t !== null && (On(t, e, r), Ma(t, e, r));
    },
    enqueueForceUpdate: function(e, t) {
      e = e._reactInternals;
      var l = Un(), r = ro(l);
      r.tag = 2, t != null && (r.callback = t), t = ao(e, r, l), t !== null && (On(t, e, l), Ma(t, e, l));
    }
  };
  function ph(e, t, l, r, s, c, h) {
    return e = e.stateNode, typeof e.shouldComponentUpdate == "function" ? e.shouldComponentUpdate(r, c, h) : t.prototype && t.prototype.isPureReactComponent ? !xa(l, r) || !xa(s, c) : !0;
  }
  function gh(e, t, l, r) {
    e = t.state, typeof t.componentWillReceiveProps == "function" && t.componentWillReceiveProps(l, r), typeof t.UNSAFE_componentWillReceiveProps == "function" && t.UNSAFE_componentWillReceiveProps(l, r), t.state !== e && zf.enqueueReplaceState(t, t.state, null);
  }
  function Jo(e, t) {
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
  function mh(e) {
    Gi(e);
  }
  function hh(e) {
    console.error(e);
  }
  function yh(e) {
    Gi(e);
  }
  function ps(e, t) {
    try {
      var l = e.onUncaughtError;
      l(t.value, { componentStack: t.stack });
    } catch (r) {
      setTimeout(function() {
        throw r;
      });
    }
  }
  function vh(e, t, l) {
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
  function Nf(e, t, l) {
    return l = ro(l), l.tag = 3, l.payload = { element: null }, l.callback = function() {
      ps(e, t);
    }, l;
  }
  function bh(e) {
    return e = ro(e), e.tag = 3, e;
  }
  function xh(e, t, l, r) {
    var s = l.type.getDerivedStateFromError;
    if (typeof s == "function") {
      var c = r.value;
      e.payload = function() {
        return s(c);
      }, e.callback = function() {
        vh(t, l, r);
      };
    }
    var h = l.stateNode;
    h !== null && typeof h.componentDidCatch == "function" && (e.callback = function() {
      vh(t, l, r), typeof s != "function" && (po === null ? po = /* @__PURE__ */ new Set([this]) : po.add(this));
      var R = r.stack;
      this.componentDidCatch(r.value, {
        componentStack: R !== null ? R : ""
      });
    });
  }
  function Aw(e, t, l, r, s) {
    if (l.flags |= 32768, r !== null && typeof r == "object" && typeof r.then == "function") {
      if (t = l.alternate, t !== null && Ar(
        t,
        l,
        s,
        !0
      ), l = jn.current, l !== null) {
        switch (l.tag) {
          case 31:
          case 13:
            return Zn === null ? Rs() : l.alternate === null && Vt === 0 && (Vt = 3), l.flags &= -257, l.flags |= 65536, l.lanes = s, r === es ? l.flags |= 16384 : (t = l.updateQueue, t === null ? l.updateQueue = /* @__PURE__ */ new Set([r]) : t.add(r), nd(e, r, s)), !1;
          case 22:
            return l.flags |= 65536, r === es ? l.flags |= 16384 : (t = l.updateQueue, t === null ? (t = {
              transitions: null,
              markerInstances: null,
              retryQueue: /* @__PURE__ */ new Set([r])
            }, l.updateQueue = t) : (l = t.retryQueue, l === null ? t.retryQueue = /* @__PURE__ */ new Set([r]) : l.add(r)), nd(e, r, s)), !1;
        }
        throw Error(i(435, l.tag));
      }
      return nd(e, r, s), Rs(), !1;
    }
    if (st)
      return t = jn.current, t !== null ? ((t.flags & 65536) === 0 && (t.flags |= 256), t.flags |= 65536, t.lanes = s, r !== Qu && (e = Error(i(422), { cause: r }), Ea(Xn(e, l)))) : (r !== Qu && (t = Error(i(423), {
        cause: r
      }), Ea(
        Xn(t, l)
      )), e = e.current.alternate, e.flags |= 65536, s &= -s, e.lanes |= s, r = Xn(r, l), s = Nf(
        e.stateNode,
        r,
        s
      ), af(e, s), Vt !== 4 && (Vt = 2)), !1;
    var c = Error(i(520), { cause: r });
    if (c = Xn(c, l), Pa === null ? Pa = [c] : Pa.push(c), Vt !== 4 && (Vt = 2), t === null) return !0;
    r = Xn(r, l), l = t;
    do {
      switch (l.tag) {
        case 3:
          return l.flags |= 65536, e = s & -s, l.lanes |= e, e = Nf(l.stateNode, r, e), af(l, e), !1;
        case 1:
          if (t = l.type, c = l.stateNode, (l.flags & 128) === 0 && (typeof t.getDerivedStateFromError == "function" || c !== null && typeof c.componentDidCatch == "function" && (po === null || !po.has(c))))
            return l.flags |= 65536, s &= -s, l.lanes |= s, s = bh(s), xh(
              s,
              e,
              l,
              r
            ), af(l, s), !1;
      }
      l = l.return;
    } while (l !== null);
    return !1;
  }
  var Df = Error(i(461)), $t = !1;
  function dn(e, t, l, r) {
    t.child = e === null ? Tm(t, null, l, r) : Qo(
      t,
      e.child,
      l,
      r
    );
  }
  function Sh(e, t, l, r, s) {
    l = l.render;
    var c = t.ref;
    if ("ref" in r) {
      var h = {};
      for (var R in r)
        R !== "ref" && (h[R] = r[R]);
    } else h = r;
    return qo(t), r = pf(
      e,
      t,
      l,
      h,
      c,
      s
    ), R = gf(), e !== null && !$t ? (mf(e, t, s), Ml(e, t, s)) : (st && R && Fu(t), t.flags |= 1, dn(e, t, r, s), t.child);
  }
  function wh(e, t, l, r, s) {
    if (e === null) {
      var c = l.type;
      return typeof c == "function" && !Gu(c) && c.defaultProps === void 0 && l.compare === null ? (t.tag = 15, t.type = c, Eh(
        e,
        t,
        c,
        r,
        s
      )) : (e = Ki(
        l.type,
        null,
        r,
        t,
        t.mode,
        s
      ), e.ref = t.ref, e.return = t, t.child = e);
    }
    if (c = e.child, !Bf(e, s)) {
      var h = c.memoizedProps;
      if (l = l.compare, l = l !== null ? l : xa, l(h, r) && e.ref === t.ref)
        return Ml(e, t, s);
    }
    return t.flags |= 1, e = wl(c, r), e.ref = t.ref, e.return = t, t.child = e;
  }
  function Eh(e, t, l, r, s) {
    if (e !== null) {
      var c = e.memoizedProps;
      if (xa(c, r) && e.ref === t.ref)
        if ($t = !1, t.pendingProps = r = c, Bf(e, s))
          (e.flags & 131072) !== 0 && ($t = !0);
        else
          return t.lanes = e.lanes, Ml(e, t, s);
    }
    return jf(
      e,
      t,
      l,
      r,
      s
    );
  }
  function Th(e, t, l, r) {
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
        return Rh(
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
        ), c !== null ? Om(t, c) : cf(), Mm(t);
      else
        return r = t.lanes = 536870912, Rh(
          e,
          t,
          c !== null ? c.baseLanes | l : l,
          l,
          r
        );
    } else
      c !== null ? ($i(t, c.cachePool), Om(t, c), so(), t.memoizedState = null) : (e !== null && $i(t, null), cf(), so());
    return dn(e, t, s, l), t.child;
  }
  function _a(e, t) {
    return e !== null && e.tag === 22 || t.stateNode !== null || (t.stateNode = {
      _visibility: 1,
      _pendingMarkers: null,
      _retryCache: null,
      _transitions: null
    }), t.sibling;
  }
  function Rh(e, t, l, r, s) {
    var c = nf();
    return c = c === null ? null : { parent: Zt._currentValue, pool: c }, t.memoizedState = {
      baseLanes: l,
      cachePool: c
    }, e !== null && $i(t, null), cf(), Mm(t), e !== null && Ar(e, t, r, !0), t.childLanes = s, null;
  }
  function gs(e, t) {
    return t = hs(
      { mode: t.mode, children: t.children },
      e.mode
    ), t.ref = e.ref, e.child = t, t.return = e, t;
  }
  function Ch(e, t, l) {
    return Qo(t, e.child, null, l), e = gs(t, t.pendingProps), e.flags |= 2, kn(t), t.memoizedState = null, e;
  }
  function zw(e, t, l) {
    var r = t.pendingProps, s = (t.flags & 128) !== 0;
    if (t.flags &= -129, e === null) {
      if (st) {
        if (r.mode === "hidden")
          return e = gs(t, r), t.lanes = 536870912, _a(null, e);
        if (ff(t), (e = kt) ? (e = Ly(
          e,
          Qn
        ), e = e !== null && e.data === "&" ? e : null, e !== null && (t.memoizedState = {
          dehydrated: e,
          treeContext: eo !== null ? { id: al, overflow: il } : null,
          retryLane: 536870912,
          hydrationErrors: null
        }, l = cm(e), l.return = t, t.child = l, un = t, kt = null)) : e = null, e === null) throw no(t);
        return t.lanes = 536870912, null;
      }
      return gs(t, r);
    }
    var c = e.memoizedState;
    if (c !== null) {
      var h = c.dehydrated;
      if (ff(t), s)
        if (t.flags & 256)
          t.flags &= -257, t = Ch(
            e,
            t,
            l
          );
        else if (t.memoizedState !== null)
          t.child = e.child, t.flags |= 128, t = null;
        else throw Error(i(558));
      else if ($t || Ar(e, t, l, !1), s = (l & e.childLanes) !== 0, $t || s) {
        if (r = Mt, r !== null && (h = vl(r, l), h !== 0 && h !== c.retryLane))
          throw c.retryLane = h, Vo(e, h), On(r, e, h), Df;
        Rs(), t = Ch(
          e,
          t,
          l
        );
      } else
        e = c.treeContext, kt = Jn(h.nextSibling), un = t, st = !0, to = null, Qn = !1, e !== null && dm(t, e), t = gs(t, r), t.flags |= 4096;
      return t;
    }
    return e = wl(e.child, {
      mode: r.mode,
      children: r.children
    }), e.ref = t.ref, t.child = e, e.return = t, e;
  }
  function ms(e, t) {
    var l = t.ref;
    if (l === null)
      e !== null && e.ref !== null && (t.flags |= 4194816);
    else {
      if (typeof l != "function" && typeof l != "object")
        throw Error(i(284));
      (e === null || e.ref !== l) && (t.flags |= 4194816);
    }
  }
  function jf(e, t, l, r, s) {
    return qo(t), l = pf(
      e,
      t,
      l,
      r,
      void 0,
      s
    ), r = gf(), e !== null && !$t ? (mf(e, t, s), Ml(e, t, s)) : (st && r && Fu(t), t.flags |= 1, dn(e, t, l, s), t.child);
  }
  function Oh(e, t, l, r, s, c) {
    return qo(t), t.updateQueue = null, l = zm(
      t,
      r,
      l,
      s
    ), Am(e), r = gf(), e !== null && !$t ? (mf(e, t, c), Ml(e, t, c)) : (st && r && Fu(t), t.flags |= 1, dn(e, t, l, c), t.child);
  }
  function Mh(e, t, l, r, s) {
    if (qo(t), t.stateNode === null) {
      var c = Rr, h = l.contextType;
      typeof h == "object" && h !== null && (c = fn(h)), c = new l(r, c), t.memoizedState = c.state !== null && c.state !== void 0 ? c.state : null, c.updater = zf, t.stateNode = c, c._reactInternals = t, c = t.stateNode, c.props = r, c.state = t.memoizedState, c.refs = {}, of(t), h = l.contextType, c.context = typeof h == "object" && h !== null ? fn(h) : Rr, c.state = t.memoizedState, h = l.getDerivedStateFromProps, typeof h == "function" && (Af(
        t,
        l,
        h,
        r
      ), c.state = t.memoizedState), typeof l.getDerivedStateFromProps == "function" || typeof c.getSnapshotBeforeUpdate == "function" || typeof c.UNSAFE_componentWillMount != "function" && typeof c.componentWillMount != "function" || (h = c.state, typeof c.componentWillMount == "function" && c.componentWillMount(), typeof c.UNSAFE_componentWillMount == "function" && c.UNSAFE_componentWillMount(), h !== c.state && zf.enqueueReplaceState(c, c.state, null), za(t, r, c, s), Aa(), c.state = t.memoizedState), typeof c.componentDidMount == "function" && (t.flags |= 4194308), r = !0;
    } else if (e === null) {
      c = t.stateNode;
      var R = t.memoizedProps, V = Jo(l, R);
      c.props = V;
      var W = c.context, ce = l.contextType;
      h = Rr, typeof ce == "object" && ce !== null && (h = fn(ce));
      var de = l.getDerivedStateFromProps;
      ce = typeof de == "function" || typeof c.getSnapshotBeforeUpdate == "function", R = t.pendingProps !== R, ce || typeof c.UNSAFE_componentWillReceiveProps != "function" && typeof c.componentWillReceiveProps != "function" || (R || W !== h) && gh(
        t,
        c,
        r,
        h
      ), oo = !1;
      var ee = t.memoizedState;
      c.state = ee, za(t, r, c, s), Aa(), W = t.memoizedState, R || ee !== W || oo ? (typeof de == "function" && (Af(
        t,
        l,
        de,
        r
      ), W = t.memoizedState), (V = oo || ph(
        t,
        l,
        V,
        r,
        ee,
        W,
        h
      )) ? (ce || typeof c.UNSAFE_componentWillMount != "function" && typeof c.componentWillMount != "function" || (typeof c.componentWillMount == "function" && c.componentWillMount(), typeof c.UNSAFE_componentWillMount == "function" && c.UNSAFE_componentWillMount()), typeof c.componentDidMount == "function" && (t.flags |= 4194308)) : (typeof c.componentDidMount == "function" && (t.flags |= 4194308), t.memoizedProps = r, t.memoizedState = W), c.props = r, c.state = W, c.context = h, r = V) : (typeof c.componentDidMount == "function" && (t.flags |= 4194308), r = !1);
    } else {
      c = t.stateNode, rf(e, t), h = t.memoizedProps, ce = Jo(l, h), c.props = ce, de = t.pendingProps, ee = c.context, W = l.contextType, V = Rr, typeof W == "object" && W !== null && (V = fn(W)), R = l.getDerivedStateFromProps, (W = typeof R == "function" || typeof c.getSnapshotBeforeUpdate == "function") || typeof c.UNSAFE_componentWillReceiveProps != "function" && typeof c.componentWillReceiveProps != "function" || (h !== de || ee !== V) && gh(
        t,
        c,
        r,
        V
      ), oo = !1, ee = t.memoizedState, c.state = ee, za(t, r, c, s), Aa();
      var le = t.memoizedState;
      h !== de || ee !== le || oo || e !== null && e.dependencies !== null && Zi(e.dependencies) ? (typeof R == "function" && (Af(
        t,
        l,
        R,
        r
      ), le = t.memoizedState), (ce = oo || ph(
        t,
        l,
        ce,
        r,
        ee,
        le,
        V
      ) || e !== null && e.dependencies !== null && Zi(e.dependencies)) ? (W || typeof c.UNSAFE_componentWillUpdate != "function" && typeof c.componentWillUpdate != "function" || (typeof c.componentWillUpdate == "function" && c.componentWillUpdate(r, le, V), typeof c.UNSAFE_componentWillUpdate == "function" && c.UNSAFE_componentWillUpdate(
        r,
        le,
        V
      )), typeof c.componentDidUpdate == "function" && (t.flags |= 4), typeof c.getSnapshotBeforeUpdate == "function" && (t.flags |= 1024)) : (typeof c.componentDidUpdate != "function" || h === e.memoizedProps && ee === e.memoizedState || (t.flags |= 4), typeof c.getSnapshotBeforeUpdate != "function" || h === e.memoizedProps && ee === e.memoizedState || (t.flags |= 1024), t.memoizedProps = r, t.memoizedState = le), c.props = r, c.state = le, c.context = V, r = ce) : (typeof c.componentDidUpdate != "function" || h === e.memoizedProps && ee === e.memoizedState || (t.flags |= 4), typeof c.getSnapshotBeforeUpdate != "function" || h === e.memoizedProps && ee === e.memoizedState || (t.flags |= 1024), r = !1);
    }
    return c = r, ms(e, t), r = (t.flags & 128) !== 0, c || r ? (c = t.stateNode, l = r && typeof l.getDerivedStateFromError != "function" ? null : c.render(), t.flags |= 1, e !== null && r ? (t.child = Qo(
      t,
      e.child,
      null,
      s
    ), t.child = Qo(
      t,
      null,
      l,
      s
    )) : dn(e, t, l, s), t.memoizedState = c.state, e = t.child) : e = Ml(
      e,
      t,
      s
    ), e;
  }
  function Ah(e, t, l, r) {
    return Yo(), t.flags |= 256, dn(e, t, l, r), t.child;
  }
  var kf = {
    dehydrated: null,
    treeContext: null,
    retryLane: 0,
    hydrationErrors: null
  };
  function _f(e) {
    return { baseLanes: e, cachePool: vm() };
  }
  function Hf(e, t, l) {
    return e = e !== null ? e.childLanes & ~l : 0, t && (e |= Hn), e;
  }
  function zh(e, t, l) {
    var r = t.pendingProps, s = !1, c = (t.flags & 128) !== 0, h;
    if ((h = c) || (h = e !== null && e.memoizedState === null ? !1 : (Ft.current & 2) !== 0), h && (s = !0, t.flags &= -129), h = (t.flags & 32) !== 0, t.flags &= -33, e === null) {
      if (st) {
        if (s ? io(t) : so(), (e = kt) ? (e = Ly(
          e,
          Qn
        ), e = e !== null && e.data !== "&" ? e : null, e !== null && (t.memoizedState = {
          dehydrated: e,
          treeContext: eo !== null ? { id: al, overflow: il } : null,
          retryLane: 536870912,
          hydrationErrors: null
        }, l = cm(e), l.return = t, t.child = l, un = t, kt = null)) : e = null, e === null) throw no(t);
        return vd(e) ? t.lanes = 32 : t.lanes = 536870912, null;
      }
      var R = r.children;
      return r = r.fallback, s ? (so(), s = t.mode, R = hs(
        { mode: "hidden", children: R },
        s
      ), r = Po(
        r,
        s,
        l,
        null
      ), R.return = t, r.return = t, R.sibling = r, t.child = R, r = t.child, r.memoizedState = _f(l), r.childLanes = Hf(
        e,
        h,
        l
      ), t.memoizedState = kf, _a(null, r)) : (io(t), Uf(t, R));
    }
    var V = e.memoizedState;
    if (V !== null && (R = V.dehydrated, R !== null)) {
      if (c)
        t.flags & 256 ? (io(t), t.flags &= -257, t = Lf(
          e,
          t,
          l
        )) : t.memoizedState !== null ? (so(), t.child = e.child, t.flags |= 128, t = null) : (so(), R = r.fallback, s = t.mode, r = hs(
          { mode: "visible", children: r.children },
          s
        ), R = Po(
          R,
          s,
          l,
          null
        ), R.flags |= 2, r.return = t, R.return = t, r.sibling = R, t.child = r, Qo(
          t,
          e.child,
          null,
          l
        ), r = t.child, r.memoizedState = _f(l), r.childLanes = Hf(
          e,
          h,
          l
        ), t.memoizedState = kf, t = _a(null, r));
      else if (io(t), vd(R)) {
        if (h = R.nextSibling && R.nextSibling.dataset, h) var W = h.dgst;
        h = W, r = Error(i(419)), r.stack = "", r.digest = h, Ea({ value: r, source: null, stack: null }), t = Lf(
          e,
          t,
          l
        );
      } else if ($t || Ar(e, t, l, !1), h = (l & e.childLanes) !== 0, $t || h) {
        if (h = Mt, h !== null && (r = vl(h, l), r !== 0 && r !== V.retryLane))
          throw V.retryLane = r, Vo(e, r), On(h, e, r), Df;
        yd(R) || Rs(), t = Lf(
          e,
          t,
          l
        );
      } else
        yd(R) ? (t.flags |= 192, t.child = e.child, t = null) : (e = V.treeContext, kt = Jn(
          R.nextSibling
        ), un = t, st = !0, to = null, Qn = !1, e !== null && dm(t, e), t = Uf(
          t,
          r.children
        ), t.flags |= 4096);
      return t;
    }
    return s ? (so(), R = r.fallback, s = t.mode, V = e.child, W = V.sibling, r = wl(V, {
      mode: "hidden",
      children: r.children
    }), r.subtreeFlags = V.subtreeFlags & 65011712, W !== null ? R = wl(
      W,
      R
    ) : (R = Po(
      R,
      s,
      l,
      null
    ), R.flags |= 2), R.return = t, r.return = t, r.sibling = R, t.child = r, _a(null, r), r = t.child, R = e.child.memoizedState, R === null ? R = _f(l) : (s = R.cachePool, s !== null ? (V = Zt._currentValue, s = s.parent !== V ? { parent: V, pool: V } : s) : s = vm(), R = {
      baseLanes: R.baseLanes | l,
      cachePool: s
    }), r.memoizedState = R, r.childLanes = Hf(
      e,
      h,
      l
    ), t.memoizedState = kf, _a(e.child, r)) : (io(t), l = e.child, e = l.sibling, l = wl(l, {
      mode: "visible",
      children: r.children
    }), l.return = t, l.sibling = null, e !== null && (h = t.deletions, h === null ? (t.deletions = [e], t.flags |= 16) : h.push(e)), t.child = l, t.memoizedState = null, l);
  }
  function Uf(e, t) {
    return t = hs(
      { mode: "visible", children: t },
      e.mode
    ), t.return = e, e.child = t;
  }
  function hs(e, t) {
    return e = Dn(22, e, null, t), e.lanes = 0, e;
  }
  function Lf(e, t, l) {
    return Qo(t, e.child, null, l), e = Uf(
      t,
      t.pendingProps.children
    ), e.flags |= 2, t.memoizedState = null, e;
  }
  function Nh(e, t, l) {
    e.lanes |= t;
    var r = e.alternate;
    r !== null && (r.lanes |= t), $u(e.return, t, l);
  }
  function If(e, t, l, r, s, c) {
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
    if (R ? (h = h & 1 | 2, t.flags |= 128) : h &= 1, ne(Ft, h), dn(e, t, r, l), r = st ? wa : 0, !R && e !== null && (e.flags & 128) !== 0)
      e: for (e = t.child; e !== null; ) {
        if (e.tag === 13)
          e.memoizedState !== null && Nh(e, l, t);
        else if (e.tag === 19)
          Nh(e, l, t);
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
          e = l.alternate, e !== null && os(e) === null && (s = l), l = l.sibling;
        l = s, l === null ? (s = t.child, t.child = null) : (s = l.sibling, l.sibling = null), If(
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
          if (e = s.alternate, e !== null && os(e) === null) {
            t.child = s;
            break;
          }
          e = s.sibling, s.sibling = l, l = s, s = e;
        }
        If(
          t,
          !0,
          l,
          null,
          c,
          r
        );
        break;
      case "together":
        If(
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
  function Ml(e, t, l) {
    if (e !== null && (t.dependencies = e.dependencies), fo |= t.lanes, (l & t.childLanes) === 0)
      if (e !== null) {
        if (Ar(
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
      for (e = t.child, l = wl(e, e.pendingProps), t.child = l, l.return = t; e.sibling !== null; )
        e = e.sibling, l = l.sibling = wl(e, e.pendingProps), l.return = t;
      l.sibling = null;
    }
    return t.child;
  }
  function Bf(e, t) {
    return (e.lanes & t) !== 0 ? !0 : (e = e.dependencies, !!(e !== null && Zi(e)));
  }
  function Nw(e, t, l) {
    switch (t.tag) {
      case 3:
        se(t, t.stateNode.containerInfo), lo(t, Zt, e.memoizedState.cache), Yo();
        break;
      case 27:
      case 5:
        je(t);
        break;
      case 4:
        se(t, t.stateNode.containerInfo);
        break;
      case 10:
        lo(
          t,
          t.type,
          t.memoizedProps.value
        );
        break;
      case 31:
        if (t.memoizedState !== null)
          return t.flags |= 128, ff(t), null;
        break;
      case 13:
        var r = t.memoizedState;
        if (r !== null)
          return r.dehydrated !== null ? (io(t), t.flags |= 128, null) : (l & t.child.childLanes) !== 0 ? zh(e, t, l) : (io(t), e = Ml(
            e,
            t,
            l
          ), e !== null ? e.sibling : null);
        io(t);
        break;
      case 19:
        var s = (e.flags & 128) !== 0;
        if (r = (l & t.childLanes) !== 0, r || (Ar(
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
        return t.lanes = 0, Th(
          e,
          t,
          l,
          t.pendingProps
        );
      case 24:
        lo(t, Zt, e.memoizedState.cache);
    }
    return Ml(e, t, l);
  }
  function jh(e, t, l) {
    if (e !== null)
      if (e.memoizedProps !== t.pendingProps)
        $t = !0;
      else {
        if (!Bf(e, l) && (t.flags & 128) === 0)
          return $t = !1, Nw(
            e,
            t,
            l
          );
        $t = (e.flags & 131072) !== 0;
      }
    else
      $t = !1, st && (t.flags & 1048576) !== 0 && fm(t, wa, t.index);
    switch (t.lanes = 0, t.tag) {
      case 16:
        e: {
          var r = t.pendingProps;
          if (e = Fo(t.elementType), t.type = e, typeof e == "function")
            Gu(e) ? (r = Jo(e, r), t.tag = 1, t = Mh(
              null,
              t,
              e,
              r,
              l
            )) : (t.tag = 0, t = jf(
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
                t.tag = 11, t = Sh(
                  null,
                  t,
                  e,
                  r,
                  l
                );
                break e;
              } else if (s === L) {
                t.tag = 14, t = wh(
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
        return jf(
          e,
          t,
          t.type,
          t.pendingProps,
          l
        );
      case 1:
        return r = t.type, s = Jo(
          r,
          t.pendingProps
        ), Mh(
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
          s = c.element, rf(e, t), za(t, r, null, l);
          var h = t.memoizedState;
          if (r = h.cache, lo(t, Zt, r), r !== c.cache && Wu(
            t,
            [Zt],
            l,
            !0
          ), Aa(), r = h.element, c.isDehydrated)
            if (c = {
              element: r,
              isDehydrated: !1,
              cache: h.cache
            }, t.updateQueue.baseState = c, t.memoizedState = c, t.flags & 256) {
              t = Ah(
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
              ), Ea(s), t = Ah(
                e,
                t,
                r,
                l
              );
              break e;
            } else
              for (e = t.stateNode.containerInfo, e.nodeType === 9 ? e = e.body : e = e.nodeName === "HTML" ? e.ownerDocument.body : e, kt = Jn(e.firstChild), un = t, st = !0, to = null, Qn = !0, l = Tm(
                t,
                null,
                r,
                l
              ), t.child = l; l; )
                l.flags = l.flags & -3 | 4096, l = l.sibling;
          else {
            if (Yo(), r === s) {
              t = Ml(
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
        return ms(e, t), e === null ? (l = Gy(
          t.type,
          null,
          t.pendingProps,
          null
        )) ? t.memoizedState = l : st || (l = t.type, e = t.pendingProps, r = Ds(
          ie.current
        ).createElement(l), r[Ot] = t, r[cn] = e, pn(r, l, e), on(r), t.stateNode = r) : t.memoizedState = Gy(
          t.type,
          e.memoizedProps,
          t.pendingProps,
          e.memoizedState
        ), null;
      case 27:
        return je(t), e === null && st && (r = t.stateNode = Vy(
          t.type,
          t.pendingProps,
          ie.current
        ), un = t, Qn = !0, s = kt, yo(t.type) ? (bd = s, kt = Jn(r.firstChild)) : kt = s), dn(
          e,
          t,
          t.pendingProps.children,
          l
        ), ms(e, t), e === null && (t.flags |= 4194304), t.child;
      case 5:
        return e === null && st && ((s = r = kt) && (r = i1(
          r,
          t.type,
          t.pendingProps,
          Qn
        ), r !== null ? (t.stateNode = r, un = t, kt = Jn(r.firstChild), Qn = !1, s = !0) : s = !1), s || no(t)), je(t), s = t.type, c = t.pendingProps, h = e !== null ? e.memoizedProps : null, r = c.children, gd(s, c) ? r = null : h !== null && gd(s, h) && (t.flags |= 32), t.memoizedState !== null && (s = pf(
          e,
          t,
          ww,
          null,
          null,
          l
        ), Za._currentValue = s), ms(e, t), dn(e, t, r, l), t.child;
      case 6:
        return e === null && st && ((e = l = kt) && (l = s1(
          l,
          t.pendingProps,
          Qn
        ), l !== null ? (t.stateNode = l, un = t, kt = null, e = !0) : e = !1), e || no(t)), null;
      case 13:
        return zh(e, t, l);
      case 4:
        return se(
          t,
          t.stateNode.containerInfo
        ), r = t.pendingProps, e === null ? t.child = Qo(
          t,
          null,
          r,
          l
        ) : dn(e, t, r, l), t.child;
      case 11:
        return Sh(
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
        return r = t.pendingProps, lo(t, t.type, r.value), dn(e, t, r.children, l), t.child;
      case 9:
        return s = t.type._context, r = t.pendingProps.children, qo(t), s = fn(s), r = r(s), t.flags |= 1, dn(e, t, r, l), t.child;
      case 14:
        return wh(
          e,
          t,
          t.type,
          t.pendingProps,
          l
        );
      case 15:
        return Eh(
          e,
          t,
          t.type,
          t.pendingProps,
          l
        );
      case 19:
        return Dh(e, t, l);
      case 31:
        return zw(e, t, l);
      case 22:
        return Th(
          e,
          t,
          l,
          t.pendingProps
        );
      case 24:
        return qo(t), r = fn(Zt), e === null ? (s = nf(), s === null && (s = Mt, c = ef(), s.pooledCache = c, c.refCount++, c !== null && (s.pooledCacheLanes |= l), s = c), t.memoizedState = { parent: r, cache: s }, of(t), lo(t, Zt, s)) : ((e.lanes & l) !== 0 && (rf(e, t), za(t, null, null, l), Aa()), s = e.memoizedState, c = t.memoizedState, s.parent !== r ? (s = { parent: r, cache: r }, t.memoizedState = s, t.lanes === 0 && (t.memoizedState = t.updateQueue.baseState = s), lo(t, Zt, r)) : (r = c.cache, lo(t, Zt, r), r !== s.cache && Wu(
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
  function Al(e) {
    e.flags |= 4;
  }
  function Vf(e, t, l, r, s) {
    if ((t = (e.mode & 32) !== 0) && (t = !1), t) {
      if (e.flags |= 16777216, (s & 335544128) === s)
        if (e.stateNode.complete) e.flags |= 8192;
        else if (ay()) e.flags |= 8192;
        else
          throw Ko = es, lf;
    } else e.flags &= -16777217;
  }
  function kh(e, t) {
    if (t.type !== "stylesheet" || (t.state.loading & 4) !== 0)
      e.flags &= -16777217;
    else if (e.flags |= 16777216, !Qy(t))
      if (ay()) e.flags |= 8192;
      else
        throw Ko = es, lf;
  }
  function ys(e, t) {
    t !== null && (e.flags |= 4), e.flags & 16384 && (t = e.tag !== 22 ? zn() : 536870912, e.lanes |= t, Vr |= t);
  }
  function Ha(e, t) {
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
    switch (Ku(t), t.tag) {
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
        return l = t.stateNode, r = null, e !== null && (r = e.memoizedState.cache), t.memoizedState.cache !== r && (t.flags |= 2048), Rl(Zt), ge(), l.pendingContext && (l.context = l.pendingContext, l.pendingContext = null), (e === null || e.child === null) && (Mr(t) ? Al(t) : e === null || e.memoizedState.isDehydrated && (t.flags & 256) === 0 || (t.flags |= 1024, Zu())), _t(t), null;
      case 26:
        var s = t.type, c = t.memoizedState;
        return e === null ? (Al(t), c !== null ? (_t(t), kh(t, c)) : (_t(t), Vf(
          t,
          s,
          null,
          r,
          l
        ))) : c ? c !== e.memoizedState ? (Al(t), _t(t), kh(t, c)) : (_t(t), t.flags &= -16777217) : (e = e.memoizedProps, e !== r && Al(t), _t(t), Vf(
          t,
          s,
          e,
          r,
          l
        )), null;
      case 27:
        if (Ee(t), l = ie.current, s = t.type, e !== null && t.stateNode != null)
          e.memoizedProps !== r && Al(t);
        else {
          if (!r) {
            if (t.stateNode === null)
              throw Error(i(166));
            return _t(t), null;
          }
          e = J.current, Mr(t) ? pm(t) : (e = Vy(s, r, l), t.stateNode = e, Al(t));
        }
        return _t(t), null;
      case 5:
        if (Ee(t), s = t.type, e !== null && t.stateNode != null)
          e.memoizedProps !== r && Al(t);
        else {
          if (!r) {
            if (t.stateNode === null)
              throw Error(i(166));
            return _t(t), null;
          }
          if (c = J.current, Mr(t))
            pm(t);
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
            r && Al(t);
          }
        }
        return _t(t), Vf(
          t,
          t.type,
          e === null ? null : e.memoizedProps,
          t.pendingProps,
          l
        ), null;
      case 6:
        if (e && t.stateNode != null)
          e.memoizedProps !== r && Al(t);
        else {
          if (typeof r != "string" && t.stateNode === null)
            throw Error(i(166));
          if (e = ie.current, Mr(t)) {
            if (e = t.stateNode, l = t.memoizedProps, r = null, s = un, s !== null)
              switch (s.tag) {
                case 27:
                case 5:
                  r = s.memoizedProps;
              }
            e[Ot] = t, e = !!(e.nodeValue === l || r !== null && r.suppressHydrationWarning === !0 || zy(e.nodeValue, l)), e || no(t, !0);
          } else
            e = Ds(e).createTextNode(
              r
            ), e[Ot] = t, t.stateNode = e;
        }
        return _t(t), null;
      case 31:
        if (l = t.memoizedState, e === null || e.memoizedState !== null) {
          if (r = Mr(t), l !== null) {
            if (e === null) {
              if (!r) throw Error(i(318));
              if (e = t.memoizedState, e = e !== null ? e.dehydrated : null, !e) throw Error(i(557));
              e[Ot] = t;
            } else
              Yo(), (t.flags & 128) === 0 && (t.memoizedState = null), t.flags |= 4;
            _t(t), e = !1;
          } else
            l = Zu(), e !== null && e.memoizedState !== null && (e.memoizedState.hydrationErrors = l), e = !0;
          if (!e)
            return t.flags & 256 ? (kn(t), t) : (kn(t), null);
          if ((t.flags & 128) !== 0)
            throw Error(i(558));
        }
        return _t(t), null;
      case 13:
        if (r = t.memoizedState, e === null || e.memoizedState !== null && e.memoizedState.dehydrated !== null) {
          if (s = Mr(t), r !== null && r.dehydrated !== null) {
            if (e === null) {
              if (!s) throw Error(i(318));
              if (s = t.memoizedState, s = s !== null ? s.dehydrated : null, !s) throw Error(i(317));
              s[Ot] = t;
            } else
              Yo(), (t.flags & 128) === 0 && (t.memoizedState = null), t.flags |= 4;
            _t(t), s = !1;
          } else
            s = Zu(), e !== null && e.memoizedState !== null && (e.memoizedState.hydrationErrors = s), s = !0;
          if (!s)
            return t.flags & 256 ? (kn(t), t) : (kn(t), null);
        }
        return kn(t), (t.flags & 128) !== 0 ? (t.lanes = l, t) : (l = r !== null, e = e !== null && e.memoizedState !== null, l && (r = t.child, s = null, r.alternate !== null && r.alternate.memoizedState !== null && r.alternate.memoizedState.cachePool !== null && (s = r.alternate.memoizedState.cachePool.pool), c = null, r.memoizedState !== null && r.memoizedState.cachePool !== null && (c = r.memoizedState.cachePool.pool), c !== s && (r.flags |= 2048)), l !== e && l && (t.child.flags |= 8192), ys(t, t.updateQueue), _t(t), null);
      case 4:
        return ge(), e === null && cd(t.stateNode.containerInfo), _t(t), null;
      case 10:
        return Rl(t.type), _t(t), null;
      case 19:
        if (B(Ft), r = t.memoizedState, r === null) return _t(t), null;
        if (s = (t.flags & 128) !== 0, c = r.rendering, c === null)
          if (s) Ha(r, !1);
          else {
            if (Vt !== 0 || e !== null && (e.flags & 128) !== 0)
              for (e = t.child; e !== null; ) {
                if (c = os(e), c !== null) {
                  for (t.flags |= 128, Ha(r, !1), e = c.updateQueue, t.updateQueue = e, ys(t, e), t.subtreeFlags = 0, e = l, l = t.child; l !== null; )
                    sm(l, e), l = l.sibling;
                  return ne(
                    Ft,
                    Ft.current & 1 | 2
                  ), st && El(t, r.treeForkCount), t.child;
                }
                e = e.sibling;
              }
            r.tail !== null && ae() > ws && (t.flags |= 128, s = !0, Ha(r, !1), t.lanes = 4194304);
          }
        else {
          if (!s)
            if (e = os(c), e !== null) {
              if (t.flags |= 128, s = !0, e = e.updateQueue, t.updateQueue = e, ys(t, e), Ha(r, !0), r.tail === null && r.tailMode === "hidden" && !c.alternate && !st)
                return _t(t), null;
            } else
              2 * ae() - r.renderingStartTime > ws && l !== 536870912 && (t.flags |= 128, s = !0, Ha(r, !1), t.lanes = 4194304);
          r.isBackwards ? (c.sibling = t.child, t.child = c) : (e = r.last, e !== null ? e.sibling = c : t.child = c, r.last = c);
        }
        return r.tail !== null ? (e = r.tail, r.rendering = e, r.tail = e.sibling, r.renderingStartTime = ae(), e.sibling = null, l = Ft.current, ne(
          Ft,
          s ? l & 1 | 2 : l & 1
        ), st && El(t, r.treeForkCount), e) : (_t(t), null);
      case 22:
      case 23:
        return kn(t), uf(), r = t.memoizedState !== null, e !== null ? e.memoizedState !== null !== r && (t.flags |= 8192) : r && (t.flags |= 8192), r ? (l & 536870912) !== 0 && (t.flags & 128) === 0 && (_t(t), t.subtreeFlags & 6 && (t.flags |= 8192)) : _t(t), l = t.updateQueue, l !== null && ys(t, l.retryQueue), l = null, e !== null && e.memoizedState !== null && e.memoizedState.cachePool !== null && (l = e.memoizedState.cachePool.pool), r = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (r = t.memoizedState.cachePool.pool), r !== l && (t.flags |= 2048), e !== null && B(Xo), null;
      case 24:
        return l = null, e !== null && (l = e.memoizedState.cache), t.memoizedState.cache !== l && (t.flags |= 2048), Rl(Zt), _t(t), null;
      case 25:
        return null;
      case 30:
        return null;
    }
    throw Error(i(156, t.tag));
  }
  function jw(e, t) {
    switch (Ku(t), t.tag) {
      case 1:
        return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
      case 3:
        return Rl(Zt), ge(), e = t.flags, (e & 65536) !== 0 && (e & 128) === 0 ? (t.flags = e & -65537 | 128, t) : null;
      case 26:
      case 27:
      case 5:
        return Ee(t), null;
      case 31:
        if (t.memoizedState !== null) {
          if (kn(t), t.alternate === null)
            throw Error(i(340));
          Yo();
        }
        return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
      case 13:
        if (kn(t), e = t.memoizedState, e !== null && e.dehydrated !== null) {
          if (t.alternate === null)
            throw Error(i(340));
          Yo();
        }
        return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
      case 19:
        return B(Ft), null;
      case 4:
        return ge(), null;
      case 10:
        return Rl(t.type), null;
      case 22:
      case 23:
        return kn(t), uf(), e !== null && B(Xo), e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
      case 24:
        return Rl(Zt), null;
      case 25:
        return null;
      default:
        return null;
    }
  }
  function _h(e, t) {
    switch (Ku(t), t.tag) {
      case 3:
        Rl(Zt), ge();
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
        B(Ft);
        break;
      case 10:
        Rl(t.type);
        break;
      case 22:
      case 23:
        kn(t), uf(), e !== null && B(Xo);
        break;
      case 24:
        Rl(Zt);
    }
  }
  function Ua(e, t) {
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
  function co(e, t, l) {
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
              var V = l, W = R;
              try {
                W();
              } catch (ce) {
                bt(
                  s,
                  V,
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
  function Hh(e) {
    var t = e.updateQueue;
    if (t !== null) {
      var l = e.stateNode;
      try {
        Cm(t, l);
      } catch (r) {
        bt(e, e.return, r);
      }
    }
  }
  function Uh(e, t, l) {
    l.props = Jo(
      e.type,
      e.memoizedProps
    ), l.state = e.memoizedState;
    try {
      l.componentWillUnmount();
    } catch (r) {
      bt(e, t, r);
    }
  }
  function La(e, t) {
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
  function Lh(e) {
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
  function Pf(e, t, l) {
    try {
      var r = e.stateNode;
      t1(r, e.type, l, t), r[cn] = t;
    } catch (s) {
      bt(e, e.return, s);
    }
  }
  function Ih(e) {
    return e.tag === 5 || e.tag === 3 || e.tag === 26 || e.tag === 27 && yo(e.type) || e.tag === 4;
  }
  function Yf(e) {
    e: for (; ; ) {
      for (; e.sibling === null; ) {
        if (e.return === null || Ih(e.return)) return null;
        e = e.return;
      }
      for (e.sibling.return = e.return, e = e.sibling; e.tag !== 5 && e.tag !== 6 && e.tag !== 18; ) {
        if (e.tag === 27 && yo(e.type) || e.flags & 2 || e.child === null || e.tag === 4) continue e;
        e.child.return = e, e = e.child;
      }
      if (!(e.flags & 2)) return e.stateNode;
    }
  }
  function Gf(e, t, l) {
    var r = e.tag;
    if (r === 5 || r === 6)
      e = e.stateNode, t ? (l.nodeType === 9 ? l.body : l.nodeName === "HTML" ? l.ownerDocument.body : l).insertBefore(e, t) : (t = l.nodeType === 9 ? l.body : l.nodeName === "HTML" ? l.ownerDocument.body : l, t.appendChild(e), l = l._reactRootContainer, l != null || t.onclick !== null || (t.onclick = xl));
    else if (r !== 4 && (r === 27 && yo(e.type) && (l = e.stateNode, t = null), e = e.child, e !== null))
      for (Gf(e, t, l), e = e.sibling; e !== null; )
        Gf(e, t, l), e = e.sibling;
  }
  function vs(e, t, l) {
    var r = e.tag;
    if (r === 5 || r === 6)
      e = e.stateNode, t ? l.insertBefore(e, t) : l.appendChild(e);
    else if (r !== 4 && (r === 27 && yo(e.type) && (l = e.stateNode), e = e.child, e !== null))
      for (vs(e, t, l), e = e.sibling; e !== null; )
        vs(e, t, l), e = e.sibling;
  }
  function Bh(e) {
    var t = e.stateNode, l = e.memoizedProps;
    try {
      for (var r = e.type, s = t.attributes; s.length; )
        t.removeAttributeNode(s[0]);
      pn(t, r, l), t[Ot] = e, t[cn] = l;
    } catch (c) {
      bt(e, e.return, c);
    }
  }
  var zl = !1, Wt = !1, qf = !1, Vh = typeof WeakSet == "function" ? WeakSet : Set, rn = null;
  function kw(e, t) {
    if (e = e.containerInfo, dd = Is, e = Wg(e), Uu(e)) {
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
            var h = 0, R = -1, V = -1, W = 0, ce = 0, de = e, ee = null;
            t: for (; ; ) {
              for (var le; de !== l || s !== 0 && de.nodeType !== 3 || (R = h + s), de !== c || r !== 0 && de.nodeType !== 3 || (V = h + r), de.nodeType === 3 && (h += de.nodeValue.length), (le = de.firstChild) !== null; )
                ee = de, de = le;
              for (; ; ) {
                if (de === e) break t;
                if (ee === l && ++W === s && (R = h), ee === c && ++ce === r && (V = h), (le = de.nextSibling) !== null) break;
                de = ee, ee = de.parentNode;
              }
              de = le;
            }
            l = R === -1 || V === -1 ? null : { start: R, end: V };
          } else l = null;
        }
      l = l || { start: 0, end: 0 };
    } else l = null;
    for (pd = { focusedElem: e, selectionRange: l }, Is = !1, rn = t; rn !== null; )
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
                  var Ne = Jo(
                    l.type,
                    s
                  );
                  e = r.getSnapshotBeforeUpdate(
                    Ne,
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
                  hd(e);
                else if (l === 1)
                  switch (e.nodeName) {
                    case "HEAD":
                    case "HTML":
                    case "BODY":
                      hd(e);
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
  function Ph(e, t, l) {
    var r = l.flags;
    switch (l.tag) {
      case 0:
      case 11:
      case 15:
        Dl(e, l), r & 4 && Ua(5, l);
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
            var s = Jo(
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
        r & 64 && Hh(l), r & 512 && La(l, l.return);
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
            Cm(e, t);
          } catch (h) {
            bt(l, l.return, h);
          }
        }
        break;
      case 27:
        t === null && r & 4 && Bh(l);
      case 26:
      case 5:
        Dl(e, l), t === null && r & 4 && Lh(l), r & 512 && La(l, l.return);
        break;
      case 12:
        Dl(e, l);
        break;
      case 31:
        Dl(e, l), r & 4 && qh(e, l);
        break;
      case 13:
        Dl(e, l), r & 4 && Xh(e, l), r & 64 && (e = l.memoizedState, e !== null && (e = e.dehydrated, e !== null && (l = Yw.bind(
          null,
          l
        ), c1(e, l))));
        break;
      case 22:
        if (r = l.memoizedState !== null || zl, !r) {
          t = t !== null && t.memoizedState !== null || Wt, s = zl;
          var c = Wt;
          zl = r, (Wt = t) && !c ? jl(
            e,
            l,
            (l.subtreeFlags & 8772) !== 0
          ) : Dl(e, l), zl = s, Wt = c;
        }
        break;
      case 30:
        break;
      default:
        Dl(e, l);
    }
  }
  function Yh(e) {
    var t = e.alternate;
    t !== null && (e.alternate = null, Yh(t)), e.child = null, e.deletions = null, e.sibling = null, e.tag === 5 && (t = e.stateNode, t !== null && xu(t)), e.stateNode = null, e.return = null, e.dependencies = null, e.memoizedProps = null, e.memoizedState = null, e.pendingProps = null, e.stateNode = null, e.updateQueue = null;
  }
  var Lt = null, En = !1;
  function Nl(e, t, l) {
    for (l = l.child; l !== null; )
      Gh(e, t, l), l = l.sibling;
  }
  function Gh(e, t, l) {
    if (ht && typeof ht.onCommitFiberUnmount == "function")
      try {
        ht.onCommitFiberUnmount(et, l);
      } catch {
      }
    switch (l.tag) {
      case 26:
        Wt || sl(l, t), Nl(
          e,
          t,
          l
        ), l.memoizedState ? l.memoizedState.count-- : l.stateNode && (l = l.stateNode, l.parentNode.removeChild(l));
        break;
      case 27:
        Wt || sl(l, t);
        var r = Lt, s = En;
        yo(l.type) && (Lt = l.stateNode, En = !1), Nl(
          e,
          t,
          l
        ), Fa(l.stateNode), Lt = r, En = s;
        break;
      case 5:
        Wt || sl(l, t);
      case 6:
        if (r = Lt, s = En, Lt = null, Nl(
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
        Lt !== null && (En ? (e = Lt, Hy(
          e.nodeType === 9 ? e.body : e.nodeName === "HTML" ? e.ownerDocument.body : e,
          l.stateNode
        ), Qr(e)) : Hy(Lt, l.stateNode));
        break;
      case 4:
        r = Lt, s = En, Lt = l.stateNode.containerInfo, En = !0, Nl(
          e,
          t,
          l
        ), Lt = r, En = s;
        break;
      case 0:
      case 11:
      case 14:
      case 15:
        co(2, l, t), Wt || co(4, l, t), Nl(
          e,
          t,
          l
        );
        break;
      case 1:
        Wt || (sl(l, t), r = l.stateNode, typeof r.componentWillUnmount == "function" && Uh(
          l,
          t,
          r
        )), Nl(
          e,
          t,
          l
        );
        break;
      case 21:
        Nl(
          e,
          t,
          l
        );
        break;
      case 22:
        Wt = (r = Wt) || l.memoizedState !== null, Nl(
          e,
          t,
          l
        ), Wt = r;
        break;
      default:
        Nl(
          e,
          t,
          l
        );
    }
  }
  function qh(e, t) {
    if (t.memoizedState === null && (e = t.alternate, e !== null && (e = e.memoizedState, e !== null))) {
      e = e.dehydrated;
      try {
        Qr(e);
      } catch (l) {
        bt(t, t.return, l);
      }
    }
  }
  function Xh(e, t) {
    if (t.memoizedState === null && (e = t.alternate, e !== null && (e = e.memoizedState, e !== null && (e = e.dehydrated, e !== null))))
      try {
        Qr(e);
      } catch (l) {
        bt(t, t.return, l);
      }
  }
  function _w(e) {
    switch (e.tag) {
      case 31:
      case 13:
      case 19:
        var t = e.stateNode;
        return t === null && (t = e.stateNode = new Vh()), t;
      case 22:
        return e = e.stateNode, t = e._retryCache, t === null && (t = e._retryCache = new Vh()), t;
      default:
        throw Error(i(435, e.tag));
    }
  }
  function bs(e, t) {
    var l = _w(e);
    t.forEach(function(r) {
      if (!l.has(r)) {
        l.add(r);
        var s = Gw.bind(null, e, r);
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
              if (yo(R.type)) {
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
        Gh(c, h, s), Lt = null, En = !1, c = s.alternate, c !== null && (c.return = null), s.return = null;
      }
    if (t.subtreeFlags & 13886)
      for (t = t.child; t !== null; )
        Fh(t, e), t = t.sibling;
  }
  var ll = null;
  function Fh(e, t) {
    var l = e.alternate, r = e.flags;
    switch (e.tag) {
      case 0:
      case 11:
      case 14:
      case 15:
        Tn(t, e), Rn(e), r & 4 && (co(3, e, e.return), Ua(3, e), co(5, e, e.return));
        break;
      case 1:
        Tn(t, e), Rn(e), r & 512 && (Wt || l === null || sl(l, l.return)), r & 64 && zl && (e = e.updateQueue, e !== null && (r = e.callbacks, r !== null && (l = e.shared.hiddenCallbacks, e.shared.hiddenCallbacks = l === null ? r : l.concat(r))));
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
                      c = s.getElementsByTagName("title")[0], (!c || c[fa] || c[Ot] || c.namespaceURI === "http://www.w3.org/2000/svg" || c.hasAttribute("itemprop")) && (c = s.createElement(r), s.head.insertBefore(
                        c,
                        s.querySelector("head > title")
                      )), pn(c, r, l), c[Ot] = e, on(c), r = c;
                      break e;
                    case "link":
                      var h = Fy(
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
                      if (h = Fy(
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
                Ky(
                  s,
                  e.type,
                  e.stateNode
                );
            else
              e.stateNode = Xy(
                s,
                r,
                e.memoizedProps
              );
          else
            c !== r ? (c === null ? l.stateNode !== null && (l = l.stateNode, l.parentNode.removeChild(l)) : c.count--, r === null ? Ky(
              s,
              e.type,
              e.stateNode
            ) : Xy(
              s,
              r,
              e.memoizedProps
            )) : r === null && e.stateNode !== null && Pf(
              e,
              e.memoizedProps,
              l.memoizedProps
            );
        }
        break;
      case 27:
        Tn(t, e), Rn(e), r & 512 && (Wt || l === null || sl(l, l.return)), l !== null && r & 4 && Pf(
          e,
          e.memoizedProps,
          l.memoizedProps
        );
        break;
      case 5:
        if (Tn(t, e), Rn(e), r & 512 && (Wt || l === null || sl(l, l.return)), e.flags & 32) {
          s = e.stateNode;
          try {
            vr(s, "");
          } catch (Ne) {
            bt(e, e.return, Ne);
          }
        }
        r & 4 && e.stateNode != null && (s = e.memoizedProps, Pf(
          e,
          s,
          l !== null ? l.memoizedProps : s
        )), r & 1024 && (qf = !0);
        break;
      case 6:
        if (Tn(t, e), Rn(e), r & 4) {
          if (e.stateNode === null)
            throw Error(i(162));
          r = e.memoizedProps, l = e.stateNode;
          try {
            l.nodeValue = r;
          } catch (Ne) {
            bt(e, e.return, Ne);
          }
        }
        break;
      case 3:
        if (_s = null, s = ll, ll = js(t.containerInfo), Tn(t, e), ll = s, Rn(e), r & 4 && l !== null && l.memoizedState.isDehydrated)
          try {
            Qr(t.containerInfo);
          } catch (Ne) {
            bt(e, e.return, Ne);
          }
        qf && (qf = !1, Kh(e));
        break;
      case 4:
        r = ll, ll = js(
          e.stateNode.containerInfo
        ), Tn(t, e), Rn(e), ll = r;
        break;
      case 12:
        Tn(t, e), Rn(e);
        break;
      case 31:
        Tn(t, e), Rn(e), r & 4 && (r = e.updateQueue, r !== null && (e.updateQueue = null, bs(e, r)));
        break;
      case 13:
        Tn(t, e), Rn(e), e.child.flags & 8192 && e.memoizedState !== null != (l !== null && l.memoizedState !== null) && (Ss = ae()), r & 4 && (r = e.updateQueue, r !== null && (e.updateQueue = null, bs(e, r)));
        break;
      case 22:
        s = e.memoizedState !== null;
        var V = l !== null && l.memoizedState !== null, W = zl, ce = Wt;
        if (zl = W || s, Wt = ce || V, Tn(t, e), Wt = ce, zl = W, Rn(e), r & 8192)
          e: for (t = e.stateNode, t._visibility = s ? t._visibility & -2 : t._visibility | 1, s && (l === null || V || zl || Wt || $o(e)), l = null, t = e; ; ) {
            if (t.tag === 5 || t.tag === 26) {
              if (l === null) {
                V = l = t;
                try {
                  if (c = V.stateNode, s)
                    h = c.style, typeof h.setProperty == "function" ? h.setProperty("display", "none", "important") : h.display = "none";
                  else {
                    R = V.stateNode;
                    var de = V.memoizedProps.style, ee = de != null && de.hasOwnProperty("display") ? de.display : null;
                    R.style.display = ee == null || typeof ee == "boolean" ? "" : ("" + ee).trim();
                  }
                } catch (Ne) {
                  bt(V, V.return, Ne);
                }
              }
            } else if (t.tag === 6) {
              if (l === null) {
                V = t;
                try {
                  V.stateNode.nodeValue = s ? "" : V.memoizedProps;
                } catch (Ne) {
                  bt(V, V.return, Ne);
                }
              }
            } else if (t.tag === 18) {
              if (l === null) {
                V = t;
                try {
                  var le = V.stateNode;
                  s ? Uy(le, !0) : Uy(V.stateNode, !1);
                } catch (Ne) {
                  bt(V, V.return, Ne);
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
        r & 4 && (r = e.updateQueue, r !== null && (l = r.retryQueue, l !== null && (r.retryQueue = null, bs(e, l))));
        break;
      case 19:
        Tn(t, e), Rn(e), r & 4 && (r = e.updateQueue, r !== null && (e.updateQueue = null, bs(e, r)));
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
          if (Ih(r)) {
            l = r;
            break;
          }
          r = r.return;
        }
        if (l == null) throw Error(i(160));
        switch (l.tag) {
          case 27:
            var s = l.stateNode, c = Yf(e);
            vs(e, c, s);
            break;
          case 5:
            var h = l.stateNode;
            l.flags & 32 && (vr(h, ""), l.flags &= -33);
            var R = Yf(e);
            vs(e, R, h);
            break;
          case 3:
          case 4:
            var V = l.stateNode.containerInfo, W = Yf(e);
            Gf(
              e,
              W,
              V
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
  function Kh(e) {
    if (e.subtreeFlags & 1024)
      for (e = e.child; e !== null; ) {
        var t = e;
        Kh(t), t.tag === 5 && t.flags & 1024 && t.stateNode.reset(), e = e.sibling;
      }
  }
  function Dl(e, t) {
    if (t.subtreeFlags & 8772)
      for (t = t.child; t !== null; )
        Ph(e, t.alternate, t), t = t.sibling;
  }
  function $o(e) {
    for (e = e.child; e !== null; ) {
      var t = e;
      switch (t.tag) {
        case 0:
        case 11:
        case 14:
        case 15:
          co(4, t, t.return), $o(t);
          break;
        case 1:
          sl(t, t.return);
          var l = t.stateNode;
          typeof l.componentWillUnmount == "function" && Uh(
            t,
            t.return,
            l
          ), $o(t);
          break;
        case 27:
          Fa(t.stateNode);
        case 26:
        case 5:
          sl(t, t.return), $o(t);
          break;
        case 22:
          t.memoizedState === null && $o(t);
          break;
        case 30:
          $o(t);
          break;
        default:
          $o(t);
      }
      e = e.sibling;
    }
  }
  function jl(e, t, l) {
    for (l = l && (t.subtreeFlags & 8772) !== 0, t = t.child; t !== null; ) {
      var r = t.alternate, s = e, c = t, h = c.flags;
      switch (c.tag) {
        case 0:
        case 11:
        case 15:
          jl(
            s,
            c,
            l
          ), Ua(4, c);
          break;
        case 1:
          if (jl(
            s,
            c,
            l
          ), r = c, s = r.stateNode, typeof s.componentDidMount == "function")
            try {
              s.componentDidMount();
            } catch (W) {
              bt(r, r.return, W);
            }
          if (r = c, s = r.updateQueue, s !== null) {
            var R = r.stateNode;
            try {
              var V = s.shared.hiddenCallbacks;
              if (V !== null)
                for (s.shared.hiddenCallbacks = null, s = 0; s < V.length; s++)
                  Rm(V[s], R);
            } catch (W) {
              bt(r, r.return, W);
            }
          }
          l && h & 64 && Hh(c), La(c, c.return);
          break;
        case 27:
          Bh(c);
        case 26:
        case 5:
          jl(
            s,
            c,
            l
          ), l && r === null && h & 4 && Lh(c), La(c, c.return);
          break;
        case 12:
          jl(
            s,
            c,
            l
          );
          break;
        case 31:
          jl(
            s,
            c,
            l
          ), l && h & 4 && qh(s, c);
          break;
        case 13:
          jl(
            s,
            c,
            l
          ), l && h & 4 && Xh(s, c);
          break;
        case 22:
          c.memoizedState === null && jl(
            s,
            c,
            l
          ), La(c, c.return);
          break;
        case 30:
          break;
        default:
          jl(
            s,
            c,
            l
          );
      }
      t = t.sibling;
    }
  }
  function Xf(e, t) {
    var l = null;
    e !== null && e.memoizedState !== null && e.memoizedState.cachePool !== null && (l = e.memoizedState.cachePool.pool), e = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (e = t.memoizedState.cachePool.pool), e !== l && (e != null && e.refCount++, l != null && Ta(l));
  }
  function Ff(e, t) {
    e = null, t.alternate !== null && (e = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== e && (t.refCount++, e != null && Ta(e));
  }
  function ol(e, t, l, r) {
    if (t.subtreeFlags & 10256)
      for (t = t.child; t !== null; )
        Qh(
          e,
          t,
          l,
          r
        ), t = t.sibling;
  }
  function Qh(e, t, l, r) {
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
        ), s & 2048 && Ua(9, t);
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
        ), s & 2048 && (e = null, t.alternate !== null && (e = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== e && (t.refCount++, e != null && Ta(e)));
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
          } catch (V) {
            bt(t, t.return, V);
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
        ) : Ia(e, t) : c._visibility & 2 ? ol(
          e,
          t,
          l,
          r
        ) : (c._visibility |= 2, Lr(
          e,
          t,
          l,
          r,
          (t.subtreeFlags & 10256) !== 0 || !1
        )), s & 2048 && Xf(h, t);
        break;
      case 24:
        ol(
          e,
          t,
          l,
          r
        ), s & 2048 && Ff(t.alternate, t);
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
  function Lr(e, t, l, r, s) {
    for (s = s && ((t.subtreeFlags & 10256) !== 0 || !1), t = t.child; t !== null; ) {
      var c = e, h = t, R = l, V = r, W = h.flags;
      switch (h.tag) {
        case 0:
        case 11:
        case 15:
          Lr(
            c,
            h,
            R,
            V,
            s
          ), Ua(8, h);
          break;
        case 23:
          break;
        case 22:
          var ce = h.stateNode;
          h.memoizedState !== null ? ce._visibility & 2 ? Lr(
            c,
            h,
            R,
            V,
            s
          ) : Ia(
            c,
            h
          ) : (ce._visibility |= 2, Lr(
            c,
            h,
            R,
            V,
            s
          )), s && W & 2048 && Xf(
            h.alternate,
            h
          );
          break;
        case 24:
          Lr(
            c,
            h,
            R,
            V,
            s
          ), s && W & 2048 && Ff(h.alternate, h);
          break;
        default:
          Lr(
            c,
            h,
            R,
            V,
            s
          );
      }
      t = t.sibling;
    }
  }
  function Ia(e, t) {
    if (t.subtreeFlags & 10256)
      for (t = t.child; t !== null; ) {
        var l = e, r = t, s = r.flags;
        switch (r.tag) {
          case 22:
            Ia(l, r), s & 2048 && Xf(
              r.alternate,
              r
            );
            break;
          case 24:
            Ia(l, r), s & 2048 && Ff(r.alternate, r);
            break;
          default:
            Ia(l, r);
        }
        t = t.sibling;
      }
  }
  var Ba = 8192;
  function Ir(e, t, l) {
    if (e.subtreeFlags & Ba)
      for (e = e.child; e !== null; )
        Zh(
          e,
          t,
          l
        ), e = e.sibling;
  }
  function Zh(e, t, l) {
    switch (e.tag) {
      case 26:
        Ir(
          e,
          t,
          l
        ), e.flags & Ba && e.memoizedState !== null && S1(
          l,
          ll,
          e.memoizedState,
          e.memoizedProps
        );
        break;
      case 5:
        Ir(
          e,
          t,
          l
        );
        break;
      case 3:
      case 4:
        var r = ll;
        ll = js(e.stateNode.containerInfo), Ir(
          e,
          t,
          l
        ), ll = r;
        break;
      case 22:
        e.memoizedState === null && (r = e.alternate, r !== null && r.memoizedState !== null ? (r = Ba, Ba = 16777216, Ir(
          e,
          t,
          l
        ), Ba = r) : Ir(
          e,
          t,
          l
        ));
        break;
      default:
        Ir(
          e,
          t,
          l
        );
    }
  }
  function Jh(e) {
    var t = e.alternate;
    if (t !== null && (e = t.child, e !== null)) {
      t.child = null;
      do
        t = e.sibling, e.sibling = null, e = t;
      while (e !== null);
    }
  }
  function Va(e) {
    var t = e.deletions;
    if ((e.flags & 16) !== 0) {
      if (t !== null)
        for (var l = 0; l < t.length; l++) {
          var r = t[l];
          rn = r, Wh(
            r,
            e
          );
        }
      Jh(e);
    }
    if (e.subtreeFlags & 10256)
      for (e = e.child; e !== null; )
        $h(e), e = e.sibling;
  }
  function $h(e) {
    switch (e.tag) {
      case 0:
      case 11:
      case 15:
        Va(e), e.flags & 2048 && co(9, e, e.return);
        break;
      case 3:
        Va(e);
        break;
      case 12:
        Va(e);
        break;
      case 22:
        var t = e.stateNode;
        e.memoizedState !== null && t._visibility & 2 && (e.return === null || e.return.tag !== 13) ? (t._visibility &= -3, xs(e)) : Va(e);
        break;
      default:
        Va(e);
    }
  }
  function xs(e) {
    var t = e.deletions;
    if ((e.flags & 16) !== 0) {
      if (t !== null)
        for (var l = 0; l < t.length; l++) {
          var r = t[l];
          rn = r, Wh(
            r,
            e
          );
        }
      Jh(e);
    }
    for (e = e.child; e !== null; ) {
      switch (t = e, t.tag) {
        case 0:
        case 11:
        case 15:
          co(8, t, t.return), xs(t);
          break;
        case 22:
          l = t.stateNode, l._visibility & 2 && (l._visibility &= -3, xs(t));
          break;
        default:
          xs(t);
      }
      e = e.sibling;
    }
  }
  function Wh(e, t) {
    for (; rn !== null; ) {
      var l = rn;
      switch (l.tag) {
        case 0:
        case 11:
        case 15:
          co(8, l, t);
          break;
        case 23:
        case 22:
          if (l.memoizedState !== null && l.memoizedState.cachePool !== null) {
            var r = l.memoizedState.cachePool.pool;
            r != null && r.refCount++;
          }
          break;
        case 24:
          Ta(l.memoizedState.cache);
      }
      if (r = l.child, r !== null) r.return = l, rn = r;
      else
        e: for (l = e; rn !== null; ) {
          r = rn;
          var s = r.sibling, c = r.return;
          if (Yh(r), r === l) {
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
  var Hw = {
    getCacheForType: function(e) {
      var t = fn(Zt), l = t.data.get(e);
      return l === void 0 && (l = e(), t.data.set(e, l)), l;
    },
    cacheSignal: function() {
      return fn(Zt).controller.signal;
    }
  }, Uw = typeof WeakMap == "function" ? WeakMap : Map, gt = 0, Mt = null, lt = null, at = 0, vt = 0, _n = null, uo = !1, Br = !1, Kf = !1, kl = 0, Vt = 0, fo = 0, Wo = 0, Qf = 0, Hn = 0, Vr = 0, Pa = null, Cn = null, Zf = !1, Ss = 0, ey = 0, ws = 1 / 0, Es = null, po = null, tn = 0, go = null, Pr = null, _l = 0, Jf = 0, $f = null, ty = null, Ya = 0, Wf = null;
  function Un() {
    return (gt & 2) !== 0 && at !== 0 ? at & -at : H.T !== null ? rd() : Xt();
  }
  function ny() {
    if (Hn === 0)
      if ((at & 536870912) === 0 || st) {
        var e = It;
        It <<= 1, (It & 3932160) === 0 && (It = 262144), Hn = e;
      } else Hn = 536870912;
    return e = jn.current, e !== null && (e.flags |= 32), Hn;
  }
  function On(e, t, l) {
    (e === Mt && (vt === 2 || vt === 9) || e.cancelPendingCommit !== null) && (Yr(e, 0), mo(
      e,
      at,
      Hn,
      !1
    )), qt(e, l), ((gt & 2) === 0 || e !== Mt) && (e === Mt && ((gt & 2) === 0 && (Wo |= l), Vt === 4 && mo(
      e,
      at,
      Hn,
      !1
    )), cl(e));
  }
  function ly(e, t, l) {
    if ((gt & 6) !== 0) throw Error(i(327));
    var r = !l && (t & 127) === 0 && (t & e.expiredLanes) === 0 || Gt(e, t), s = r ? Bw(e, t) : td(e, t, !0), c = r;
    do {
      if (s === 0) {
        Br && !r && mo(e, t, 0, !1);
        break;
      } else {
        if (l = e.current.alternate, c && !Lw(l)) {
          s = td(e, t, !1), c = !1;
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
              s = Pa;
              var V = R.current.memoizedState.isDehydrated;
              if (V && (Yr(R, h).flags |= 256), h = td(
                R,
                h,
                !1
              ), h !== 2) {
                if (Kf && !V) {
                  R.errorRecoveryDisabledLanes |= c, Wo |= c, s = 4;
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
          Yr(e, 0), mo(e, t, 0, !0);
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
              mo(
                r,
                t,
                Hn,
                !uo
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
          if ((t & 62914560) === t && (s = Ss + 300 - ae(), 10 < s)) {
            if (mo(
              r,
              t,
              Hn,
              !uo
            ), jt(r, 0, !0) !== 0) break e;
            _l = t, r.timeoutHandle = ky(
              oy.bind(
                null,
                r,
                l,
                Cn,
                Es,
                Zf,
                t,
                Hn,
                Wo,
                Vr,
                uo,
                c,
                "Throttled",
                -0,
                0
              ),
              s
            );
            break e;
          }
          oy(
            r,
            l,
            Cn,
            Es,
            Zf,
            t,
            Hn,
            Wo,
            Vr,
            uo,
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
  function oy(e, t, l, r, s, c, h, R, V, W, ce, de, ee, le) {
    if (e.timeoutHandle = -1, de = t.subtreeFlags, de & 8192 || (de & 16785408) === 16785408) {
      de = {
        stylesheets: null,
        count: 0,
        imgCount: 0,
        imgBytes: 0,
        suspenseyImages: [],
        waitingForImages: !0,
        waitingForViewTransition: !1,
        unsuspend: xl
      }, Zh(
        t,
        c,
        de
      );
      var Ne = (c & 62914560) === c ? Ss - ae() : (c & 4194048) === c ? ey - ae() : 0;
      if (Ne = w1(
        de,
        Ne
      ), Ne !== null) {
        _l = c, e.cancelPendingCommit = Ne(
          dy.bind(
            null,
            e,
            t,
            c,
            l,
            r,
            s,
            h,
            R,
            V,
            ce,
            de,
            null,
            ee,
            le
          )
        ), mo(e, c, h, !W);
        return;
      }
    }
    dy(
      e,
      t,
      c,
      l,
      r,
      s,
      h,
      R,
      V
    );
  }
  function Lw(e) {
    for (var t = e; ; ) {
      var l = t.tag;
      if ((l === 0 || l === 11 || l === 15) && t.flags & 16384 && (l = t.updateQueue, l !== null && (l = l.stores, l !== null)))
        for (var r = 0; r < l.length; r++) {
          var s = l[r], c = s.getSnapshot;
          s = s.value;
          try {
            if (!Nn(c(), s)) return !1;
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
  function mo(e, t, l, r) {
    t &= ~Qf, t &= ~Wo, e.suspendedLanes |= t, e.pingedLanes &= ~t, r && (e.warmLanes |= t), r = e.expirationTimes;
    for (var s = t; 0 < s; ) {
      var c = 31 - yt(s), h = 1 << c;
      r[c] = -1, s &= ~h;
    }
    l !== 0 && yl(e, l, t);
  }
  function Ts() {
    return (gt & 6) === 0 ? (Ga(0), !1) : !0;
  }
  function ed() {
    if (lt !== null) {
      if (vt === 0)
        var e = lt.return;
      else
        e = lt, Tl = Go = null, hf(e), jr = null, Ca = 0, e = lt;
      for (; e !== null; )
        _h(e.alternate, e), e = e.return;
      lt = null;
    }
  }
  function Yr(e, t) {
    var l = e.timeoutHandle;
    l !== -1 && (e.timeoutHandle = -1, o1(l)), l = e.cancelPendingCommit, l !== null && (e.cancelPendingCommit = null, l()), _l = 0, ed(), Mt = e, lt = l = wl(e.current, null), at = t, vt = 0, _n = null, uo = !1, Br = Gt(e, t), Kf = !1, Vr = Hn = Qf = Wo = fo = Vt = 0, Cn = Pa = null, Zf = !1, (t & 8) !== 0 && (t |= t & 32);
    var r = e.entangledLanes;
    if (r !== 0)
      for (e = e.entanglements, r &= t; 0 < r; ) {
        var s = 31 - yt(r), c = 1 << s;
        t |= e[s], r &= ~c;
      }
    return kl = t, qi(), l;
  }
  function ry(e, t) {
    Xe = null, H.H = ka, t === Dr || t === Wi ? (t = Sm(), vt = 3) : t === lf ? (t = Sm(), vt = 4) : vt = t === Df ? 8 : t !== null && typeof t == "object" && typeof t.then == "function" ? 6 : 1, _n = t, lt === null && (Vt = 1, ps(
      e,
      Xn(t, e.current)
    ));
  }
  function ay() {
    var e = jn.current;
    return e === null ? !0 : (at & 4194048) === at ? Zn === null : (at & 62914560) === at || (at & 536870912) !== 0 ? e === Zn : !1;
  }
  function iy() {
    var e = H.H;
    return H.H = ka, e === null ? ka : e;
  }
  function sy() {
    var e = H.A;
    return H.A = Hw, e;
  }
  function Rs() {
    Vt = 4, uo || (at & 4194048) !== at && jn.current !== null || (Br = !0), (fo & 134217727) === 0 && (Wo & 134217727) === 0 || Mt === null || mo(
      Mt,
      at,
      Hn,
      !1
    );
  }
  function td(e, t, l) {
    var r = gt;
    gt |= 2;
    var s = iy(), c = sy();
    (Mt !== e || at !== t) && (Es = null, Yr(e, t)), t = !1;
    var h = Vt;
    e: do
      try {
        if (vt !== 0 && lt !== null) {
          var R = lt, V = _n;
          switch (vt) {
            case 8:
              ed(), h = 6;
              break e;
            case 3:
            case 2:
            case 9:
            case 6:
              jn.current === null && (t = !0);
              var W = vt;
              if (vt = 0, _n = null, Gr(e, R, V, W), l && Br) {
                h = 0;
                break e;
              }
              break;
            default:
              W = vt, vt = 0, _n = null, Gr(e, R, V, W);
          }
        }
        Iw(), h = Vt;
        break;
      } catch (ce) {
        ry(e, ce);
      }
    while (!0);
    return t && e.shellSuspendCounter++, Tl = Go = null, gt = r, H.H = s, H.A = c, lt === null && (Mt = null, at = 0, qi()), h;
  }
  function Iw() {
    for (; lt !== null; ) cy(lt);
  }
  function Bw(e, t) {
    var l = gt;
    gt |= 2;
    var r = iy(), s = sy();
    Mt !== e || at !== t ? (Es = null, ws = ae() + 500, Yr(e, t)) : Br = Gt(
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
              vt = 0, _n = null, Gr(e, t, c, 1);
              break;
            case 2:
            case 9:
              if (bm(c)) {
                vt = 0, _n = null, uy(t);
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
              bm(c) ? (vt = 0, _n = null, uy(t)) : (vt = 0, _n = null, Gr(e, t, c, 7));
              break;
            case 5:
              var h = null;
              switch (lt.tag) {
                case 26:
                  h = lt.memoizedState;
                case 5:
                case 27:
                  var R = lt;
                  if (h ? Qy(h) : R.stateNode.complete) {
                    vt = 0, _n = null;
                    var V = R.sibling;
                    if (V !== null) lt = V;
                    else {
                      var W = R.return;
                      W !== null ? (lt = W, Cs(W)) : lt = null;
                    }
                    break t;
                  }
              }
              vt = 0, _n = null, Gr(e, t, c, 5);
              break;
            case 6:
              vt = 0, _n = null, Gr(e, t, c, 6);
              break;
            case 8:
              ed(), Vt = 6;
              break e;
            default:
              throw Error(i(462));
          }
        }
        Vw();
        break;
      } catch (ce) {
        ry(e, ce);
      }
    while (!0);
    return Tl = Go = null, H.H = r, H.A = s, gt = l, lt !== null ? 0 : (Mt = null, at = 0, qi(), Vt);
  }
  function Vw() {
    for (; lt !== null && !Oe(); )
      cy(lt);
  }
  function cy(e) {
    var t = jh(e.alternate, e, kl);
    e.memoizedProps = e.pendingProps, t === null ? Cs(e) : lt = t;
  }
  function uy(e) {
    var t = e, l = t.alternate;
    switch (t.tag) {
      case 15:
      case 0:
        t = Oh(
          l,
          t,
          t.pendingProps,
          t.type,
          void 0,
          at
        );
        break;
      case 11:
        t = Oh(
          l,
          t,
          t.pendingProps,
          t.type.render,
          t.ref,
          at
        );
        break;
      case 5:
        hf(t);
      default:
        _h(l, t), t = lt = sm(t, kl), t = jh(l, t, kl);
    }
    e.memoizedProps = e.pendingProps, t === null ? Cs(e) : lt = t;
  }
  function Gr(e, t, l, r) {
    Tl = Go = null, hf(t), jr = null, Ca = 0;
    var s = t.return;
    try {
      if (Aw(
        e,
        s,
        t,
        l,
        at
      )) {
        Vt = 1, ps(
          e,
          Xn(l, e.current)
        ), lt = null;
        return;
      }
    } catch (c) {
      if (s !== null) throw lt = s, c;
      Vt = 1, ps(
        e,
        Xn(l, e.current)
      ), lt = null;
      return;
    }
    t.flags & 32768 ? (st || r === 1 ? e = !0 : Br || (at & 536870912) !== 0 ? e = !1 : (uo = e = !0, (r === 2 || r === 9 || r === 3 || r === 6) && (r = jn.current, r !== null && r.tag === 13 && (r.flags |= 16384))), fy(t, e)) : Cs(t);
  }
  function Cs(e) {
    var t = e;
    do {
      if ((t.flags & 32768) !== 0) {
        fy(
          t,
          uo
        );
        return;
      }
      e = t.return;
      var l = Dw(
        t.alternate,
        t,
        kl
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
  function fy(e, t) {
    do {
      var l = jw(e.alternate, e);
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
  function dy(e, t, l, r, s, c, h, R, V) {
    e.cancelPendingCommit = null;
    do
      Os();
    while (tn !== 0);
    if ((gt & 6) !== 0) throw Error(i(327));
    if (t !== null) {
      if (t === e.current) throw Error(i(177));
      if (c = t.lanes | t.childLanes, c |= Pu, Pn(
        e,
        l,
        c,
        h,
        R,
        V
      ), e === Mt && (lt = Mt = null, at = 0), Pr = t, go = e, _l = l, Jf = c, $f = s, ty = r, (t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0 ? (e.callbackNode = null, e.callbackPriority = 0, qw(be, function() {
        return yy(), null;
      })) : (e.callbackNode = null, e.callbackPriority = 0), r = (t.flags & 13878) !== 0, (t.subtreeFlags & 13878) !== 0 || r) {
        r = H.T, H.T = null, s = D.p, D.p = 2, h = gt, gt |= 4;
        try {
          kw(e, t, l);
        } finally {
          gt = h, D.p = s, H.T = r;
        }
      }
      tn = 1, py(), gy(), my();
    }
  }
  function py() {
    if (tn === 1) {
      tn = 0;
      var e = go, t = Pr, l = (t.flags & 13878) !== 0;
      if ((t.subtreeFlags & 13878) !== 0 || l) {
        l = H.T, H.T = null;
        var r = D.p;
        D.p = 2;
        var s = gt;
        gt |= 4;
        try {
          Fh(t, e);
          var c = pd, h = Wg(e.containerInfo), R = c.focusedElem, V = c.selectionRange;
          if (h !== R && R && R.ownerDocument && $g(
            R.ownerDocument.documentElement,
            R
          )) {
            if (V !== null && Uu(R)) {
              var W = V.start, ce = V.end;
              if (ce === void 0 && (ce = W), "selectionStart" in R)
                R.selectionStart = W, R.selectionEnd = Math.min(
                  ce,
                  R.value.length
                );
              else {
                var de = R.ownerDocument || document, ee = de && de.defaultView || window;
                if (ee.getSelection) {
                  var le = ee.getSelection(), Ne = R.textContent.length, Ve = Math.min(V.start, Ne), Tt = V.end === void 0 ? Ve : Math.min(V.end, Ne);
                  !le.extend && Ve > Tt && (h = Tt, Tt = Ve, Ve = h);
                  var K = Jg(
                    R,
                    Ve
                  ), G = Jg(
                    R,
                    Tt
                  );
                  if (K && G && (le.rangeCount !== 1 || le.anchorNode !== K.node || le.anchorOffset !== K.offset || le.focusNode !== G.node || le.focusOffset !== G.offset)) {
                    var $ = de.createRange();
                    $.setStart(K.node, K.offset), le.removeAllRanges(), Ve > Tt ? (le.addRange($), le.extend(G.node, G.offset)) : ($.setEnd(G.node, G.offset), le.addRange($));
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
          Is = !!dd, pd = dd = null;
        } finally {
          gt = s, D.p = r, H.T = l;
        }
      }
      e.current = t, tn = 2;
    }
  }
  function gy() {
    if (tn === 2) {
      tn = 0;
      var e = go, t = Pr, l = (t.flags & 8772) !== 0;
      if ((t.subtreeFlags & 8772) !== 0 || l) {
        l = H.T, H.T = null;
        var r = D.p;
        D.p = 2;
        var s = gt;
        gt |= 4;
        try {
          Ph(e, t.alternate, t);
        } finally {
          gt = s, D.p = r, H.T = l;
        }
      }
      tn = 3;
    }
  }
  function my() {
    if (tn === 4 || tn === 3) {
      tn = 0, He();
      var e = go, t = Pr, l = _l, r = ty;
      (t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0 ? tn = 5 : (tn = 0, Pr = go = null, hy(e, e.pendingLanes));
      var s = e.pendingLanes;
      if (s === 0 && (po = null), St(l), t = t.stateNode, ht && typeof ht.onCommitFiberRoot == "function")
        try {
          ht.onCommitFiberRoot(
            et,
            t,
            void 0,
            (t.current.flags & 128) === 128
          );
        } catch {
        }
      if (r !== null) {
        t = H.T, s = D.p, D.p = 2, H.T = null;
        try {
          for (var c = e.onRecoverableError, h = 0; h < r.length; h++) {
            var R = r[h];
            c(R.value, {
              componentStack: R.stack
            });
          }
        } finally {
          H.T = t, D.p = s;
        }
      }
      (_l & 3) !== 0 && Os(), cl(e), s = e.pendingLanes, (l & 261930) !== 0 && (s & 42) !== 0 ? e === Wf ? Ya++ : (Ya = 0, Wf = e) : Ya = 0, Ga(0);
    }
  }
  function hy(e, t) {
    (e.pooledCacheLanes &= t) === 0 && (t = e.pooledCache, t != null && (e.pooledCache = null, Ta(t)));
  }
  function Os() {
    return py(), gy(), my(), yy();
  }
  function yy() {
    if (tn !== 5) return !1;
    var e = go, t = Jf;
    Jf = 0;
    var l = St(_l), r = H.T, s = D.p;
    try {
      D.p = 32 > l ? 32 : l, H.T = null, l = $f, $f = null;
      var c = go, h = _l;
      if (tn = 0, Pr = go = null, _l = 0, (gt & 6) !== 0) throw Error(i(331));
      var R = gt;
      if (gt |= 4, $h(c.current), Qh(
        c,
        c.current,
        h,
        l
      ), gt = R, Ga(0, !1), ht && typeof ht.onPostCommitFiberRoot == "function")
        try {
          ht.onPostCommitFiberRoot(et, c);
        } catch {
        }
      return !0;
    } finally {
      D.p = s, H.T = r, hy(e, t);
    }
  }
  function vy(e, t, l) {
    t = Xn(l, t), t = Nf(e.stateNode, t, 2), e = ao(e, t, 2), e !== null && (qt(e, 2), cl(e));
  }
  function bt(e, t, l) {
    if (e.tag === 3)
      vy(e, e, l);
    else
      for (; t !== null; ) {
        if (t.tag === 3) {
          vy(
            t,
            e,
            l
          );
          break;
        } else if (t.tag === 1) {
          var r = t.stateNode;
          if (typeof t.type.getDerivedStateFromError == "function" || typeof r.componentDidCatch == "function" && (po === null || !po.has(r))) {
            e = Xn(l, e), l = bh(2), r = ao(t, l, 2), r !== null && (xh(
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
  function nd(e, t, l) {
    var r = e.pingCache;
    if (r === null) {
      r = e.pingCache = new Uw();
      var s = /* @__PURE__ */ new Set();
      r.set(t, s);
    } else
      s = r.get(t), s === void 0 && (s = /* @__PURE__ */ new Set(), r.set(t, s));
    s.has(l) || (Kf = !0, s.add(l), e = Pw.bind(null, e, t, l), t.then(e, e));
  }
  function Pw(e, t, l) {
    var r = e.pingCache;
    r !== null && r.delete(t), e.pingedLanes |= e.suspendedLanes & l, e.warmLanes &= ~l, Mt === e && (at & l) === l && (Vt === 4 || Vt === 3 && (at & 62914560) === at && 300 > ae() - Ss ? (gt & 2) === 0 && Yr(e, 0) : Qf |= l, Vr === at && (Vr = 0)), cl(e);
  }
  function by(e, t) {
    t === 0 && (t = zn()), e = Vo(e, t), e !== null && (qt(e, t), cl(e));
  }
  function Yw(e) {
    var t = e.memoizedState, l = 0;
    t !== null && (l = t.retryLane), by(e, l);
  }
  function Gw(e, t) {
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
    r !== null && r.delete(t), by(e, l);
  }
  function qw(e, t) {
    return Se(e, t);
  }
  var Ms = null, qr = null, ld = !1, As = !1, od = !1, ho = 0;
  function cl(e) {
    e !== qr && e.next === null && (qr === null ? Ms = qr = e : qr = qr.next = e), As = !0, ld || (ld = !0, Fw());
  }
  function Ga(e, t) {
    if (!od && As) {
      od = !0;
      do
        for (var l = !1, r = Ms; r !== null; ) {
          if (e !== 0) {
            var s = r.pendingLanes;
            if (s === 0) var c = 0;
            else {
              var h = r.suspendedLanes, R = r.pingedLanes;
              c = (1 << 31 - yt(42 | e) + 1) - 1, c &= s & ~(h & ~R), c = c & 201326741 ? c & 201326741 | 1 : c ? c | 2 : 0;
            }
            c !== 0 && (l = !0, Ey(r, c));
          } else
            c = at, c = jt(
              r,
              r === Mt ? c : 0,
              r.cancelPendingCommit !== null || r.timeoutHandle !== -1
            ), (c & 3) === 0 || Gt(r, c) || (l = !0, Ey(r, c));
          r = r.next;
        }
      while (l);
      od = !1;
    }
  }
  function Xw() {
    xy();
  }
  function xy() {
    As = ld = !1;
    var e = 0;
    ho !== 0 && l1() && (e = ho);
    for (var t = ae(), l = null, r = Ms; r !== null; ) {
      var s = r.next, c = Sy(r, t);
      c === 0 ? (r.next = null, l === null ? Ms = s : l.next = s, s === null && (qr = l)) : (l = r, (e !== 0 || (c & 3) !== 0) && (As = !0)), r = s;
    }
    tn !== 0 && tn !== 5 || Ga(e), ho !== 0 && (ho = 0);
  }
  function Sy(e, t) {
    for (var l = e.suspendedLanes, r = e.pingedLanes, s = e.expirationTimes, c = e.pendingLanes & -62914561; 0 < c; ) {
      var h = 31 - yt(c), R = 1 << h, V = s[h];
      V === -1 ? ((R & l) === 0 || (R & r) !== 0) && (s[h] = Sn(R, t)) : V <= t && (e.expiredLanes |= R), c &= ~R;
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
      return r = wy.bind(null, e), l = Se(l, r), e.callbackPriority = t, e.callbackNode = l, t;
    }
    return r !== null && r !== null && Te(r), e.callbackPriority = 2, e.callbackNode = null, 2;
  }
  function wy(e, t) {
    if (tn !== 0 && tn !== 5)
      return e.callbackNode = null, e.callbackPriority = 0, null;
    var l = e.callbackNode;
    if (Os() && e.callbackNode !== l)
      return null;
    var r = at;
    return r = jt(
      e,
      e === Mt ? r : 0,
      e.cancelPendingCommit !== null || e.timeoutHandle !== -1
    ), r === 0 ? null : (ly(e, r, t), Sy(e, ae()), e.callbackNode != null && e.callbackNode === l ? wy.bind(null, e) : null);
  }
  function Ey(e, t) {
    if (Os()) return null;
    ly(e, t, !0);
  }
  function Fw() {
    r1(function() {
      (gt & 6) !== 0 ? Se(
        Ue,
        Xw
      ) : xy();
    });
  }
  function rd() {
    if (ho === 0) {
      var e = zr;
      e === 0 && (e = pt, pt <<= 1, (pt & 261888) === 0 && (pt = 256)), ho = e;
    }
    return ho;
  }
  function Ty(e) {
    return e == null || typeof e == "symbol" || typeof e == "boolean" ? null : typeof e == "function" ? e : Ui("" + e);
  }
  function Ry(e, t) {
    var l = t.ownerDocument.createElement("input");
    return l.name = t.name, l.value = t.value, e.id && l.setAttribute("form", e.id), t.parentNode.insertBefore(l, t), e = new FormData(e), l.parentNode.removeChild(l), e;
  }
  function Kw(e, t, l, r, s) {
    if (t === "submit" && l && l.stateNode === s) {
      var c = Ty(
        (s[cn] || null).action
      ), h = r.submitter;
      h && (t = (t = h[cn] || null) ? Ty(t.formAction) : h.getAttribute("formAction"), t !== null && (c = t, h = null));
      var R = new Vi(
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
                if (ho !== 0) {
                  var V = h ? Ry(s, h) : new FormData(s);
                  Rf(
                    l,
                    {
                      pending: !0,
                      data: V,
                      method: s.method,
                      action: c
                    },
                    null,
                    V
                  );
                }
              } else
                typeof c == "function" && (R.preventDefault(), V = h ? Ry(s, h) : new FormData(s), Rf(
                  l,
                  {
                    pending: !0,
                    data: V,
                    method: s.method,
                    action: c
                  },
                  c,
                  V
                ));
            },
            currentTarget: s
          }
        ]
      });
    }
  }
  for (var ad = 0; ad < Vu.length; ad++) {
    var id = Vu[ad], Qw = id.toLowerCase(), Zw = id[0].toUpperCase() + id.slice(1);
    nl(
      Qw,
      "on" + Zw
    );
  }
  nl(nm, "onAnimationEnd"), nl(lm, "onAnimationIteration"), nl(om, "onAnimationStart"), nl("dblclick", "onDoubleClick"), nl("focusin", "onFocus"), nl("focusout", "onBlur"), nl(dw, "onTransitionRun"), nl(pw, "onTransitionStart"), nl(gw, "onTransitionCancel"), nl(rm, "onTransitionEnd"), hr("onMouseEnter", ["mouseout", "mouseover"]), hr("onMouseLeave", ["mouseout", "mouseover"]), hr("onPointerEnter", ["pointerout", "pointerover"]), hr("onPointerLeave", ["pointerout", "pointerover"]), Uo(
    "onChange",
    "change click focusin focusout input keydown keyup selectionchange".split(" ")
  ), Uo(
    "onSelect",
    "focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(
      " "
    )
  ), Uo("onBeforeInput", [
    "compositionend",
    "keypress",
    "textInput",
    "paste"
  ]), Uo(
    "onCompositionEnd",
    "compositionend focusout keydown keypress keyup mousedown".split(" ")
  ), Uo(
    "onCompositionStart",
    "compositionstart focusout keydown keypress keyup mousedown".split(" ")
  ), Uo(
    "onCompositionUpdate",
    "compositionupdate focusout keydown keypress keyup mousedown".split(" ")
  );
  var qa = "abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(
    " "
  ), Jw = new Set(
    "beforetoggle cancel close invalid load scroll scrollend toggle".split(" ").concat(qa)
  );
  function Cy(e, t) {
    t = (t & 4) !== 0;
    for (var l = 0; l < e.length; l++) {
      var r = e[l], s = r.event;
      r = r.listeners;
      e: {
        var c = void 0;
        if (t)
          for (var h = r.length - 1; 0 <= h; h--) {
            var R = r[h], V = R.instance, W = R.currentTarget;
            if (R = R.listener, V !== c && s.isPropagationStopped())
              break e;
            c = R, s.currentTarget = W;
            try {
              c(s);
            } catch (ce) {
              Gi(ce);
            }
            s.currentTarget = null, c = V;
          }
        else
          for (h = 0; h < r.length; h++) {
            if (R = r[h], V = R.instance, W = R.currentTarget, R = R.listener, V !== c && s.isPropagationStopped())
              break e;
            c = R, s.currentTarget = W;
            try {
              c(s);
            } catch (ce) {
              Gi(ce);
            }
            s.currentTarget = null, c = V;
          }
      }
    }
  }
  function ot(e, t) {
    var l = t[ua];
    l === void 0 && (l = t[ua] = /* @__PURE__ */ new Set());
    var r = e + "__bubble";
    l.has(r) || (Oy(t, e, 2, !1), l.add(r));
  }
  function sd(e, t, l) {
    var r = 0;
    t && (r |= 4), Oy(
      l,
      e,
      r,
      t
    );
  }
  var zs = "_reactListening" + Math.random().toString(36).slice(2);
  function cd(e) {
    if (!e[zs]) {
      e[zs] = !0, xg.forEach(function(l) {
        l !== "selectionchange" && (Jw.has(l) || sd(l, !1, e), sd(l, !0, e));
      });
      var t = e.nodeType === 9 ? e : e.ownerDocument;
      t === null || t[zs] || (t[zs] = !0, sd("selectionchange", !1, t));
    }
  }
  function Oy(e, t, l, r) {
    switch (nv(t)) {
      case 2:
        var s = R1;
        break;
      case 8:
        s = C1;
        break;
      default:
        s = Td;
    }
    l = s.bind(
      null,
      t,
      l,
      e
    ), s = void 0, !Mu || t !== "touchstart" && t !== "touchmove" && t !== "wheel" || (s = !0), r ? s !== void 0 ? e.addEventListener(t, l, {
      capture: !0,
      passive: s
    }) : e.addEventListener(t, l, !0) : s !== void 0 ? e.addEventListener(t, l, {
      passive: s
    }) : e.addEventListener(t, l, !1);
  }
  function ud(e, t, l, r, s) {
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
              var V = h.tag;
              if ((V === 3 || V === 4) && h.stateNode.containerInfo === s)
                return;
              h = h.return;
            }
          for (; R !== null; ) {
            if (h = pr(R), h === null) return;
            if (V = h.tag, V === 5 || V === 6 || V === 26 || V === 27) {
              r = c = h;
              continue e;
            }
            R = R.parentNode;
          }
        }
        r = r.return;
      }
    Dg(function() {
      var W = c, ce = Cu(l), de = [];
      e: {
        var ee = am.get(e);
        if (ee !== void 0) {
          var le = Vi, Ne = e;
          switch (e) {
            case "keypress":
              if (Ii(l) === 0) break e;
            case "keydown":
            case "keyup":
              le = GS;
              break;
            case "focusin":
              Ne = "focus", le = Du;
              break;
            case "focusout":
              Ne = "blur", le = Du;
              break;
            case "beforeblur":
            case "afterblur":
              le = Du;
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
              le = _g;
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
              le = FS;
              break;
            case nm:
            case lm:
            case om:
              le = _S;
              break;
            case rm:
              le = QS;
              break;
            case "scroll":
            case "scrollend":
              le = zS;
              break;
            case "wheel":
              le = JS;
              break;
            case "copy":
            case "cut":
            case "paste":
              le = US;
              break;
            case "gotpointercapture":
            case "lostpointercapture":
            case "pointercancel":
            case "pointerdown":
            case "pointermove":
            case "pointerout":
            case "pointerover":
            case "pointerup":
              le = Ug;
              break;
            case "toggle":
            case "beforetoggle":
              le = WS;
          }
          var Ve = (t & 4) !== 0, Tt = !Ve && (e === "scroll" || e === "scrollend"), K = Ve ? ee !== null ? ee + "Capture" : null : ee;
          Ve = [];
          for (var G = W, $; G !== null; ) {
            var ue = G;
            if ($ = ue.stateNode, ue = ue.tag, ue !== 5 && ue !== 26 && ue !== 27 || $ === null || K === null || (ue = pa(G, K), ue != null && Ve.push(
              Xa(G, ue, $)
            )), Tt) break;
            G = G.return;
          }
          0 < Ve.length && (ee = new le(
            ee,
            Ne,
            null,
            l,
            ce
          ), de.push({ event: ee, listeners: Ve }));
        }
      }
      if ((t & 7) === 0) {
        e: {
          if (ee = e === "mouseover" || e === "pointerover", le = e === "mouseout" || e === "pointerout", ee && l !== Ru && (Ne = l.relatedTarget || l.fromElement) && (pr(Ne) || Ne[rl]))
            break e;
          if ((le || ee) && (ee = ce.window === ce ? ce : (ee = ce.ownerDocument) ? ee.defaultView || ee.parentWindow : window, le ? (Ne = l.relatedTarget || l.toElement, le = W, Ne = Ne ? pr(Ne) : null, Ne !== null && (Tt = f(Ne), Ve = Ne.tag, Ne !== Tt || Ve !== 5 && Ve !== 27 && Ve !== 6) && (Ne = null)) : (le = null, Ne = W), le !== Ne)) {
            if (Ve = _g, ue = "onMouseLeave", K = "onMouseEnter", G = "mouse", (e === "pointerout" || e === "pointerover") && (Ve = Ug, ue = "onPointerLeave", K = "onPointerEnter", G = "pointer"), Tt = le == null ? ee : da(le), $ = Ne == null ? ee : da(Ne), ee = new Ve(
              ue,
              G + "leave",
              le,
              l,
              ce
            ), ee.target = Tt, ee.relatedTarget = $, ue = null, pr(ce) === W && (Ve = new Ve(
              K,
              G + "enter",
              Ne,
              l,
              ce
            ), Ve.target = $, Ve.relatedTarget = Tt, ue = Ve), Tt = ue, le && Ne)
              t: {
                for (Ve = $w, K = le, G = Ne, $ = 0, ue = K; ue; ue = Ve(ue))
                  $++;
                ue = 0;
                for (var Ie = G; Ie; Ie = Ve(Ie))
                  ue++;
                for (; 0 < $ - ue; )
                  K = Ve(K), $--;
                for (; 0 < ue - $; )
                  G = Ve(G), ue--;
                for (; $--; ) {
                  if (K === G || G !== null && K === G.alternate) {
                    Ve = K;
                    break t;
                  }
                  K = Ve(K), G = Ve(G);
                }
                Ve = null;
              }
            else Ve = null;
            le !== null && My(
              de,
              ee,
              le,
              Ve,
              !1
            ), Ne !== null && Tt !== null && My(
              de,
              Tt,
              Ne,
              Ve,
              !0
            );
          }
        }
        e: {
          if (ee = W ? da(W) : window, le = ee.nodeName && ee.nodeName.toLowerCase(), le === "select" || le === "input" && ee.type === "file")
            var ut = qg;
          else if (Yg(ee))
            if (Xg)
              ut = cw;
            else {
              ut = iw;
              var De = aw;
            }
          else
            le = ee.nodeName, !le || le.toLowerCase() !== "input" || ee.type !== "checkbox" && ee.type !== "radio" ? W && Tu(W.elementType) && (ut = qg) : ut = sw;
          if (ut && (ut = ut(e, W))) {
            Gg(
              de,
              ut,
              l,
              ce
            );
            break e;
          }
          De && De(e, ee, W), e === "focusout" && W && ee.type === "number" && W.memoizedProps.value != null && Eu(ee, "number", ee.value);
        }
        switch (De = W ? da(W) : window, e) {
          case "focusin":
            (Yg(De) || De.contentEditable === "true") && (wr = De, Lu = W, Sa = null);
            break;
          case "focusout":
            Sa = Lu = wr = null;
            break;
          case "mousedown":
            Iu = !0;
            break;
          case "contextmenu":
          case "mouseup":
          case "dragend":
            Iu = !1, em(de, l, ce);
            break;
          case "selectionchange":
            if (fw) break;
          case "keydown":
          case "keyup":
            em(de, l, ce);
        }
        var Fe;
        if (ku)
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
          Sr ? Vg(e, l) && (it = "onCompositionEnd") : e === "keydown" && l.keyCode === 229 && (it = "onCompositionStart");
        it && (Lg && l.locale !== "ko" && (Sr || it !== "onCompositionStart" ? it === "onCompositionEnd" && Sr && (Fe = jg()) : (Wl = ce, Au = "value" in Wl ? Wl.value : Wl.textContent, Sr = !0)), De = Ns(W, it), 0 < De.length && (it = new Hg(
          it,
          e,
          null,
          l,
          ce
        ), de.push({ event: it, listeners: De }), Fe ? it.data = Fe : (Fe = Pg(l), Fe !== null && (it.data = Fe)))), (Fe = tw ? nw(e, l) : lw(e, l)) && (it = Ns(W, "onBeforeInput"), 0 < it.length && (De = new Hg(
          "onBeforeInput",
          "beforeinput",
          null,
          l,
          ce
        ), de.push({
          event: De,
          listeners: it
        }), De.data = Fe)), Kw(
          de,
          e,
          W,
          l,
          ce
        );
      }
      Cy(de, t);
    });
  }
  function Xa(e, t, l) {
    return {
      instance: e,
      listener: t,
      currentTarget: l
    };
  }
  function Ns(e, t) {
    for (var l = t + "Capture", r = []; e !== null; ) {
      var s = e, c = s.stateNode;
      if (s = s.tag, s !== 5 && s !== 26 && s !== 27 || c === null || (s = pa(e, l), s != null && r.unshift(
        Xa(e, s, c)
      ), s = pa(e, t), s != null && r.push(
        Xa(e, s, c)
      )), e.tag === 3) return r;
      e = e.return;
    }
    return [];
  }
  function $w(e) {
    if (e === null) return null;
    do
      e = e.return;
    while (e && e.tag !== 5 && e.tag !== 27);
    return e || null;
  }
  function My(e, t, l, r, s) {
    for (var c = t._reactName, h = []; l !== null && l !== r; ) {
      var R = l, V = R.alternate, W = R.stateNode;
      if (R = R.tag, V !== null && V === r) break;
      R !== 5 && R !== 26 && R !== 27 || W === null || (V = W, s ? (W = pa(l, c), W != null && h.unshift(
        Xa(l, W, V)
      )) : s || (W = pa(l, c), W != null && h.push(
        Xa(l, W, V)
      ))), l = l.return;
    }
    h.length !== 0 && e.push({ event: t, listeners: h });
  }
  var Ww = /\r\n?/g, e1 = /\u0000|\uFFFD/g;
  function Ay(e) {
    return (typeof e == "string" ? e : "" + e).replace(Ww, `
`).replace(e1, "");
  }
  function zy(e, t) {
    return t = Ay(t), Ay(e) === t;
  }
  function Et(e, t, l, r, s, c) {
    switch (l) {
      case "children":
        typeof r == "string" ? t === "body" || t === "textarea" && r === "" || vr(e, r) : (typeof r == "number" || typeof r == "bigint") && t !== "body" && vr(e, "" + r);
        break;
      case "className":
        _i(e, "class", r);
        break;
      case "tabIndex":
        _i(e, "tabindex", r);
        break;
      case "dir":
      case "role":
      case "viewBox":
      case "width":
      case "height":
        _i(e, l, r);
        break;
      case "style":
        zg(e, r, c);
        break;
      case "data":
        if (t !== "object") {
          _i(e, "data", r);
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
        r = Ui("" + r), e.setAttribute(l, r);
        break;
      case "onClick":
        r != null && (e.onclick = xl);
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
        ot("beforetoggle", e), ot("toggle", e), ki(e, "popover", r);
        break;
      case "xlinkActuate":
        bl(
          e,
          "http://www.w3.org/1999/xlink",
          "xlink:actuate",
          r
        );
        break;
      case "xlinkArcrole":
        bl(
          e,
          "http://www.w3.org/1999/xlink",
          "xlink:arcrole",
          r
        );
        break;
      case "xlinkRole":
        bl(
          e,
          "http://www.w3.org/1999/xlink",
          "xlink:role",
          r
        );
        break;
      case "xlinkShow":
        bl(
          e,
          "http://www.w3.org/1999/xlink",
          "xlink:show",
          r
        );
        break;
      case "xlinkTitle":
        bl(
          e,
          "http://www.w3.org/1999/xlink",
          "xlink:title",
          r
        );
        break;
      case "xlinkType":
        bl(
          e,
          "http://www.w3.org/1999/xlink",
          "xlink:type",
          r
        );
        break;
      case "xmlBase":
        bl(
          e,
          "http://www.w3.org/XML/1998/namespace",
          "xml:base",
          r
        );
        break;
      case "xmlLang":
        bl(
          e,
          "http://www.w3.org/XML/1998/namespace",
          "xml:lang",
          r
        );
        break;
      case "xmlSpace":
        bl(
          e,
          "http://www.w3.org/XML/1998/namespace",
          "xml:space",
          r
        );
        break;
      case "is":
        ki(e, "is", r);
        break;
      case "innerText":
      case "textContent":
        break;
      default:
        (!(2 < l.length) || l[0] !== "o" && l[0] !== "O" || l[1] !== "n" && l[1] !== "N") && (l = MS.get(l) || l, ki(e, l, r));
    }
  }
  function fd(e, t, l, r, s, c) {
    switch (l) {
      case "style":
        zg(e, r, c);
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
        typeof r == "string" ? vr(e, r) : (typeof r == "number" || typeof r == "bigint") && vr(e, "" + r);
        break;
      case "onScroll":
        r != null && ot("scroll", e);
        break;
      case "onScrollEnd":
        r != null && ot("scrollend", e);
        break;
      case "onClick":
        r != null && (e.onclick = xl);
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
        if (!Sg.hasOwnProperty(l))
          e: {
            if (l[0] === "o" && l[1] === "n" && (s = l.endsWith("Capture"), t = l.slice(2, s ? l.length - 7 : void 0), c = e[cn] || null, c = c != null ? c[l] : null, typeof c == "function" && e.removeEventListener(t, c, s), typeof r == "function")) {
              typeof c != "function" && c !== null && (l in e ? e[l] = null : e.hasAttribute(l) && e.removeAttribute(l)), e.addEventListener(t, r, s);
              break e;
            }
            l in e ? e[l] = r : r === !0 ? e.setAttribute(l, "") : ki(e, l, r);
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
        var R = c = h = s = null, V = null, W = null;
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
                  V = ce;
                  break;
                case "defaultChecked":
                  W = ce;
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
        Cg(
          e,
          c,
          R,
          V,
          W,
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
        t = c, l = h, e.multiple = !!r, t != null ? yr(e, !!r, t, !1) : l != null && yr(e, !!r, l, !0);
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
        Mg(e, r, s, c);
        return;
      case "option":
        for (V in l)
          l.hasOwnProperty(V) && (r = l[V], r != null) && (V === "selected" ? e.selected = r && typeof r != "function" && typeof r != "symbol" : Et(e, t, V, r, l, null));
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
        for (r = 0; r < qa.length; r++)
          ot(qa[r], e);
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
                Et(e, t, W, r, l, null);
            }
        return;
      default:
        if (Tu(t)) {
          for (ce in l)
            l.hasOwnProperty(ce) && (r = l[ce], r !== void 0 && fd(
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
  function t1(e, t, l, r) {
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
        var s = null, c = null, h = null, R = null, V = null, W = null, ce = null;
        for (le in l) {
          var de = l[le];
          if (l.hasOwnProperty(le) && de != null)
            switch (le) {
              case "checked":
                break;
              case "value":
                break;
              case "defaultValue":
                V = de;
              default:
                r.hasOwnProperty(le) || Et(e, t, le, null, r, de);
            }
        }
        for (var ee in r) {
          var le = r[ee];
          if (de = l[ee], r.hasOwnProperty(ee) && (le != null || de != null))
            switch (ee) {
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
                  ee,
                  le,
                  r,
                  de
                );
            }
        }
        wu(
          e,
          h,
          R,
          V,
          W,
          ce,
          c,
          s
        );
        return;
      case "select":
        le = h = R = ee = null;
        for (c in l)
          if (V = l[c], l.hasOwnProperty(c) && V != null)
            switch (c) {
              case "value":
                break;
              case "multiple":
                le = V;
              default:
                r.hasOwnProperty(c) || Et(
                  e,
                  t,
                  c,
                  null,
                  r,
                  V
                );
            }
        for (s in r)
          if (c = r[s], V = l[s], r.hasOwnProperty(s) && (c != null || V != null))
            switch (s) {
              case "value":
                ee = c;
                break;
              case "defaultValue":
                R = c;
                break;
              case "multiple":
                h = c;
              default:
                c !== V && Et(
                  e,
                  t,
                  s,
                  c,
                  r,
                  V
                );
            }
        t = R, l = h, r = le, ee != null ? yr(e, !!l, ee, !1) : !!r != !!l && (t != null ? yr(e, !!l, t, !0) : yr(e, !!l, l ? [] : "", !1));
        return;
      case "textarea":
        le = ee = null;
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
                ee = s;
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
        Og(e, ee, le);
        return;
      case "option":
        for (var Ne in l)
          ee = l[Ne], l.hasOwnProperty(Ne) && ee != null && !r.hasOwnProperty(Ne) && (Ne === "selected" ? e.selected = !1 : Et(
            e,
            t,
            Ne,
            null,
            r,
            ee
          ));
        for (V in r)
          ee = r[V], le = l[V], r.hasOwnProperty(V) && ee !== le && (ee != null || le != null) && (V === "selected" ? e.selected = ee && typeof ee != "function" && typeof ee != "symbol" : Et(
            e,
            t,
            V,
            ee,
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
          ee = l[Ve], l.hasOwnProperty(Ve) && ee != null && !r.hasOwnProperty(Ve) && Et(e, t, Ve, null, r, ee);
        for (W in r)
          if (ee = r[W], le = l[W], r.hasOwnProperty(W) && ee !== le && (ee != null || le != null))
            switch (W) {
              case "children":
              case "dangerouslySetInnerHTML":
                if (ee != null)
                  throw Error(i(137, t));
                break;
              default:
                Et(
                  e,
                  t,
                  W,
                  ee,
                  r,
                  le
                );
            }
        return;
      default:
        if (Tu(t)) {
          for (var Tt in l)
            ee = l[Tt], l.hasOwnProperty(Tt) && ee !== void 0 && !r.hasOwnProperty(Tt) && fd(
              e,
              t,
              Tt,
              void 0,
              r,
              ee
            );
          for (ce in r)
            ee = r[ce], le = l[ce], !r.hasOwnProperty(ce) || ee === le || ee === void 0 && le === void 0 || fd(
              e,
              t,
              ce,
              ee,
              r,
              le
            );
          return;
        }
    }
    for (var K in l)
      ee = l[K], l.hasOwnProperty(K) && ee != null && !r.hasOwnProperty(K) && Et(e, t, K, null, r, ee);
    for (de in r)
      ee = r[de], le = l[de], !r.hasOwnProperty(de) || ee === le || ee == null && le == null || Et(e, t, de, ee, r, le);
  }
  function Ny(e) {
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
  function n1() {
    if (typeof performance.getEntriesByType == "function") {
      for (var e = 0, t = 0, l = performance.getEntriesByType("resource"), r = 0; r < l.length; r++) {
        var s = l[r], c = s.transferSize, h = s.initiatorType, R = s.duration;
        if (c && R && Ny(h)) {
          for (h = 0, R = s.responseEnd, r += 1; r < l.length; r++) {
            var V = l[r], W = V.startTime;
            if (W > R) break;
            var ce = V.transferSize, de = V.initiatorType;
            ce && Ny(de) && (V = V.responseEnd, h += ce * (V < R ? 1 : (R - W) / (V - W)));
          }
          if (--r, t += 8 * (c + h) / (s.duration / 1e3), e++, 10 < e) break;
        }
      }
      if (0 < e) return t / e / 1e6;
    }
    return navigator.connection && (e = navigator.connection.downlink, typeof e == "number") ? e : 5;
  }
  var dd = null, pd = null;
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
  function jy(e, t) {
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
  function gd(e, t) {
    return e === "textarea" || e === "noscript" || typeof t.children == "string" || typeof t.children == "number" || typeof t.children == "bigint" || typeof t.dangerouslySetInnerHTML == "object" && t.dangerouslySetInnerHTML !== null && t.dangerouslySetInnerHTML.__html != null;
  }
  var md = null;
  function l1() {
    var e = window.event;
    return e && e.type === "popstate" ? e === md ? !1 : (md = e, !0) : (md = null, !1);
  }
  var ky = typeof setTimeout == "function" ? setTimeout : void 0, o1 = typeof clearTimeout == "function" ? clearTimeout : void 0, _y = typeof Promise == "function" ? Promise : void 0, r1 = typeof queueMicrotask == "function" ? queueMicrotask : typeof _y < "u" ? function(e) {
    return _y.resolve(null).then(e).catch(a1);
  } : ky;
  function a1(e) {
    setTimeout(function() {
      throw e;
    });
  }
  function yo(e) {
    return e === "head";
  }
  function Hy(e, t) {
    var l = t, r = 0;
    do {
      var s = l.nextSibling;
      if (e.removeChild(l), s && s.nodeType === 8)
        if (l = s.data, l === "/$" || l === "/&") {
          if (r === 0) {
            e.removeChild(s), Qr(t);
            return;
          }
          r--;
        } else if (l === "$" || l === "$?" || l === "$~" || l === "$!" || l === "&")
          r++;
        else if (l === "html")
          Fa(e.ownerDocument.documentElement);
        else if (l === "head") {
          l = e.ownerDocument.head, Fa(l);
          for (var c = l.firstChild; c; ) {
            var h = c.nextSibling, R = c.nodeName;
            c[fa] || R === "SCRIPT" || R === "STYLE" || R === "LINK" && c.rel.toLowerCase() === "stylesheet" || l.removeChild(c), c = h;
          }
        } else
          l === "body" && Fa(e.ownerDocument.body);
      l = s;
    } while (l);
    Qr(t);
  }
  function Uy(e, t) {
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
  function hd(e) {
    var t = e.firstChild;
    for (t && t.nodeType === 10 && (t = t.nextSibling); t; ) {
      var l = t;
      switch (t = t.nextSibling, l.nodeName) {
        case "HTML":
        case "HEAD":
        case "BODY":
          hd(l), xu(l);
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
  function i1(e, t, l, r) {
    for (; e.nodeType === 1; ) {
      var s = l;
      if (e.nodeName.toLowerCase() !== t.toLowerCase()) {
        if (!r && (e.nodeName !== "INPUT" || e.type !== "hidden"))
          break;
      } else if (r) {
        if (!e[fa])
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
  function s1(e, t, l) {
    if (t === "") return null;
    for (; e.nodeType !== 3; )
      if ((e.nodeType !== 1 || e.nodeName !== "INPUT" || e.type !== "hidden") && !l || (e = Jn(e.nextSibling), e === null)) return null;
    return e;
  }
  function Ly(e, t) {
    for (; e.nodeType !== 8; )
      if ((e.nodeType !== 1 || e.nodeName !== "INPUT" || e.type !== "hidden") && !t || (e = Jn(e.nextSibling), e === null)) return null;
    return e;
  }
  function yd(e) {
    return e.data === "$?" || e.data === "$~";
  }
  function vd(e) {
    return e.data === "$!" || e.data === "$?" && e.ownerDocument.readyState !== "loading";
  }
  function c1(e, t) {
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
  var bd = null;
  function Iy(e) {
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
  function By(e) {
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
  function Vy(e, t, l) {
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
  function Fa(e) {
    for (var t = e.attributes; t.length; )
      e.removeAttributeNode(t[0]);
    xu(e);
  }
  var $n = /* @__PURE__ */ new Map(), Py = /* @__PURE__ */ new Set();
  function js(e) {
    return typeof e.getRootNode == "function" ? e.getRootNode() : e.nodeType === 9 ? e : e.ownerDocument;
  }
  var Hl = D.d;
  D.d = {
    f: u1,
    r: f1,
    D: d1,
    C: p1,
    L: g1,
    m: m1,
    X: y1,
    S: h1,
    M: v1
  };
  function u1() {
    var e = Hl.f(), t = Ts();
    return e || t;
  }
  function f1(e) {
    var t = gr(e);
    t !== null && t.tag === 5 && t.type === "form" ? rh(t) : Hl.r(e);
  }
  var Xr = typeof document > "u" ? null : document;
  function Yy(e, t, l) {
    var r = Xr;
    if (r && typeof t == "string" && t) {
      var s = Gn(t);
      s = 'link[rel="' + e + '"][href="' + s + '"]', typeof l == "string" && (s += '[crossorigin="' + l + '"]'), Py.has(s) || (Py.add(s), e = { rel: e, crossOrigin: l, href: t }, r.querySelector(s) === null && (t = r.createElement("link"), pn(t, "link", e), on(t), r.head.appendChild(t)));
    }
  }
  function d1(e) {
    Hl.D(e), Yy("dns-prefetch", e, null);
  }
  function p1(e, t) {
    Hl.C(e, t), Yy("preconnect", e, t);
  }
  function g1(e, t, l) {
    Hl.L(e, t, l);
    var r = Xr;
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
          c = Fr(e);
          break;
        case "script":
          c = Kr(e);
      }
      $n.has(c) || (e = x(
        {
          rel: "preload",
          href: t === "image" && l && l.imageSrcSet ? void 0 : e,
          as: t
        },
        l
      ), $n.set(c, e), r.querySelector(s) !== null || t === "style" && r.querySelector(Ka(c)) || t === "script" && r.querySelector(Qa(c)) || (t = r.createElement("link"), pn(t, "link", e), on(t), r.head.appendChild(t)));
    }
  }
  function m1(e, t) {
    Hl.m(e, t);
    var l = Xr;
    if (l && e) {
      var r = t && typeof t.as == "string" ? t.as : "script", s = 'link[rel="modulepreload"][as="' + Gn(r) + '"][href="' + Gn(e) + '"]', c = s;
      switch (r) {
        case "audioworklet":
        case "paintworklet":
        case "serviceworker":
        case "sharedworker":
        case "worker":
        case "script":
          c = Kr(e);
      }
      if (!$n.has(c) && (e = x({ rel: "modulepreload", href: e }, t), $n.set(c, e), l.querySelector(s) === null)) {
        switch (r) {
          case "audioworklet":
          case "paintworklet":
          case "serviceworker":
          case "sharedworker":
          case "worker":
          case "script":
            if (l.querySelector(Qa(c)))
              return;
        }
        r = l.createElement("link"), pn(r, "link", e), on(r), l.head.appendChild(r);
      }
    }
  }
  function h1(e, t, l) {
    Hl.S(e, t, l);
    var r = Xr;
    if (r && e) {
      var s = mr(r).hoistableStyles, c = Fr(e);
      t = t || "default";
      var h = s.get(c);
      if (!h) {
        var R = { loading: 0, preload: null };
        if (h = r.querySelector(
          Ka(c)
        ))
          R.loading = 5;
        else {
          e = x(
            { rel: "stylesheet", href: e, "data-precedence": t },
            l
          ), (l = $n.get(c)) && xd(e, l);
          var V = h = r.createElement("link");
          on(V), pn(V, "link", e), V._p = new Promise(function(W, ce) {
            V.onload = W, V.onerror = ce;
          }), V.addEventListener("load", function() {
            R.loading |= 1;
          }), V.addEventListener("error", function() {
            R.loading |= 2;
          }), R.loading |= 4, ks(h, t, r);
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
  function y1(e, t) {
    Hl.X(e, t);
    var l = Xr;
    if (l && e) {
      var r = mr(l).hoistableScripts, s = Kr(e), c = r.get(s);
      c || (c = l.querySelector(Qa(s)), c || (e = x({ src: e, async: !0 }, t), (t = $n.get(s)) && Sd(e, t), c = l.createElement("script"), on(c), pn(c, "link", e), l.head.appendChild(c)), c = {
        type: "script",
        instance: c,
        count: 1,
        state: null
      }, r.set(s, c));
    }
  }
  function v1(e, t) {
    Hl.M(e, t);
    var l = Xr;
    if (l && e) {
      var r = mr(l).hoistableScripts, s = Kr(e), c = r.get(s);
      c || (c = l.querySelector(Qa(s)), c || (e = x({ src: e, async: !0, type: "module" }, t), (t = $n.get(s)) && Sd(e, t), c = l.createElement("script"), on(c), pn(c, "link", e), l.head.appendChild(c)), c = {
        type: "script",
        instance: c,
        count: 1,
        state: null
      }, r.set(s, c));
    }
  }
  function Gy(e, t, l, r) {
    var s = (s = ie.current) ? js(s) : null;
    if (!s) throw Error(i(446));
    switch (e) {
      case "meta":
      case "title":
        return null;
      case "style":
        return typeof l.precedence == "string" && typeof l.href == "string" ? (t = Fr(l.href), l = mr(
          s
        ).hoistableStyles, r = l.get(t), r || (r = {
          type: "style",
          instance: null,
          count: 0,
          state: null
        }, l.set(t, r)), r) : { type: "void", instance: null, count: 0, state: null };
      case "link":
        if (l.rel === "stylesheet" && typeof l.href == "string" && typeof l.precedence == "string") {
          e = Fr(l.href);
          var c = mr(
            s
          ).hoistableStyles, h = c.get(e);
          if (h || (s = s.ownerDocument || s, h = {
            type: "stylesheet",
            instance: null,
            count: 0,
            state: { loading: 0, preload: null }
          }, c.set(e, h), (c = s.querySelector(
            Ka(e)
          )) && !c._p && (h.instance = c, h.state.loading = 5), $n.has(e) || (l = {
            rel: "preload",
            as: "style",
            href: l.href,
            crossOrigin: l.crossOrigin,
            integrity: l.integrity,
            media: l.media,
            hrefLang: l.hrefLang,
            referrerPolicy: l.referrerPolicy
          }, $n.set(e, l), c || b1(
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
        return t = l.async, l = l.src, typeof l == "string" && t && typeof t != "function" && typeof t != "symbol" ? (t = Kr(l), l = mr(
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
  function Fr(e) {
    return 'href="' + Gn(e) + '"';
  }
  function Ka(e) {
    return 'link[rel="stylesheet"][' + e + "]";
  }
  function qy(e) {
    return x({}, e, {
      "data-precedence": e.precedence,
      precedence: null
    });
  }
  function b1(e, t, l, r) {
    e.querySelector('link[rel="preload"][as="style"][' + t + "]") ? r.loading = 1 : (t = e.createElement("link"), r.preload = t, t.addEventListener("load", function() {
      return r.loading |= 1;
    }), t.addEventListener("error", function() {
      return r.loading |= 2;
    }), pn(t, "link", l), on(t), e.head.appendChild(t));
  }
  function Kr(e) {
    return '[src="' + Gn(e) + '"]';
  }
  function Qa(e) {
    return "script[async]" + e;
  }
  function Xy(e, t, l) {
    if (t.count++, t.instance === null)
      switch (t.type) {
        case "style":
          var r = e.querySelector(
            'style[data-href~="' + Gn(l.href) + '"]'
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
          ), on(r), pn(r, "style", s), ks(r, l.precedence, e), t.instance = r;
        case "stylesheet":
          s = Fr(l.href);
          var c = e.querySelector(
            Ka(s)
          );
          if (c)
            return t.state.loading |= 4, t.instance = c, on(c), c;
          r = qy(l), (s = $n.get(s)) && xd(r, s), c = (e.ownerDocument || e).createElement("link"), on(c);
          var h = c;
          return h._p = new Promise(function(R, V) {
            h.onload = R, h.onerror = V;
          }), pn(c, "link", r), t.state.loading |= 4, ks(c, l.precedence, e), t.instance = c;
        case "script":
          return c = Kr(l.src), (s = e.querySelector(
            Qa(c)
          )) ? (t.instance = s, on(s), s) : (r = l, (s = $n.get(c)) && (r = x({}, l), Sd(r, s)), e = e.ownerDocument || e, s = e.createElement("script"), on(s), pn(s, "link", r), e.head.appendChild(s), t.instance = s);
        case "void":
          return null;
        default:
          throw Error(i(443, t.type));
      }
    else
      t.type === "stylesheet" && (t.state.loading & 4) === 0 && (r = t.instance, t.state.loading |= 4, ks(r, l.precedence, e));
    return t.instance;
  }
  function ks(e, t, l) {
    for (var r = l.querySelectorAll(
      'link[rel="stylesheet"][data-precedence],style[data-precedence]'
    ), s = r.length ? r[r.length - 1] : null, c = s, h = 0; h < r.length; h++) {
      var R = r[h];
      if (R.dataset.precedence === t) c = R;
      else if (c !== s) break;
    }
    c ? c.parentNode.insertBefore(e, c.nextSibling) : (t = l.nodeType === 9 ? l.head : l, t.insertBefore(e, t.firstChild));
  }
  function xd(e, t) {
    e.crossOrigin == null && (e.crossOrigin = t.crossOrigin), e.referrerPolicy == null && (e.referrerPolicy = t.referrerPolicy), e.title == null && (e.title = t.title);
  }
  function Sd(e, t) {
    e.crossOrigin == null && (e.crossOrigin = t.crossOrigin), e.referrerPolicy == null && (e.referrerPolicy = t.referrerPolicy), e.integrity == null && (e.integrity = t.integrity);
  }
  var _s = null;
  function Fy(e, t, l) {
    if (_s === null) {
      var r = /* @__PURE__ */ new Map(), s = _s = /* @__PURE__ */ new Map();
      s.set(l, r);
    } else
      s = _s, r = s.get(l), r || (r = /* @__PURE__ */ new Map(), s.set(l, r));
    if (r.has(e)) return r;
    for (r.set(e, null), l = l.getElementsByTagName(e), s = 0; s < l.length; s++) {
      var c = l[s];
      if (!(c[fa] || c[Ot] || e === "link" && c.getAttribute("rel") === "stylesheet") && c.namespaceURI !== "http://www.w3.org/2000/svg") {
        var h = c.getAttribute(t) || "";
        h = e + h;
        var R = r.get(h);
        R ? R.push(c) : r.set(h, [c]);
      }
    }
    return r;
  }
  function Ky(e, t, l) {
    e = e.ownerDocument || e, e.head.insertBefore(
      l,
      t === "title" ? e.querySelector("head > title") : null
    );
  }
  function x1(e, t, l) {
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
  function Qy(e) {
    return !(e.type === "stylesheet" && (e.state.loading & 3) === 0);
  }
  function S1(e, t, l, r) {
    if (l.type === "stylesheet" && (typeof r.media != "string" || matchMedia(r.media).matches !== !1) && (l.state.loading & 4) === 0) {
      if (l.instance === null) {
        var s = Fr(r.href), c = t.querySelector(
          Ka(s)
        );
        if (c) {
          t = c._p, t !== null && typeof t == "object" && typeof t.then == "function" && (e.count++, e = Hs.bind(e), t.then(e, e)), l.state.loading |= 4, l.instance = c, on(c);
          return;
        }
        c = t.ownerDocument || t, r = qy(r), (s = $n.get(s)) && xd(r, s), c = c.createElement("link"), on(c);
        var h = c;
        h._p = new Promise(function(R, V) {
          h.onload = R, h.onerror = V;
        }), pn(c, "link", r), l.instance = c;
      }
      e.stylesheets === null && (e.stylesheets = /* @__PURE__ */ new Map()), e.stylesheets.set(l, t), (t = l.state.preload) && (l.state.loading & 3) === 0 && (e.count++, l = Hs.bind(e), t.addEventListener("load", l), t.addEventListener("error", l));
    }
  }
  var wd = 0;
  function w1(e, t) {
    return e.stylesheets && e.count === 0 && Ls(e, e.stylesheets), 0 < e.count || 0 < e.imgCount ? function(l) {
      var r = setTimeout(function() {
        if (e.stylesheets && Ls(e, e.stylesheets), e.unsuspend) {
          var c = e.unsuspend;
          e.unsuspend = null, c();
        }
      }, 6e4 + t);
      0 < e.imgBytes && wd === 0 && (wd = 62500 * n1());
      var s = setTimeout(
        function() {
          if (e.waitingForImages = !1, e.count === 0 && (e.stylesheets && Ls(e, e.stylesheets), e.unsuspend)) {
            var c = e.unsuspend;
            e.unsuspend = null, c();
          }
        },
        (e.imgBytes > wd ? 50 : 800) + t
      );
      return e.unsuspend = l, function() {
        e.unsuspend = null, clearTimeout(r), clearTimeout(s);
      };
    } : null;
  }
  function Hs() {
    if (this.count--, this.count === 0 && (this.imgCount === 0 || !this.waitingForImages)) {
      if (this.stylesheets) Ls(this, this.stylesheets);
      else if (this.unsuspend) {
        var e = this.unsuspend;
        this.unsuspend = null, e();
      }
    }
  }
  var Us = null;
  function Ls(e, t) {
    e.stylesheets = null, e.unsuspend !== null && (e.count++, Us = /* @__PURE__ */ new Map(), t.forEach(E1, e), Us = null, Hs.call(e));
  }
  function E1(e, t) {
    if (!(t.state.loading & 4)) {
      var l = Us.get(e);
      if (l) var r = l.get(null);
      else {
        l = /* @__PURE__ */ new Map(), Us.set(e, l);
        for (var s = e.querySelectorAll(
          "link[data-precedence],style[data-precedence]"
        ), c = 0; c < s.length; c++) {
          var h = s[c];
          (h.nodeName === "LINK" || h.getAttribute("media") !== "not all") && (l.set(h.dataset.precedence, h), r = h);
        }
        r && l.set(null, r);
      }
      s = t.instance, h = s.getAttribute("data-precedence"), c = l.get(h) || r, c === r && l.set(null, s), l.set(h, s), this.count++, r = Hs.bind(this), s.addEventListener("load", r), s.addEventListener("error", r), c ? c.parentNode.insertBefore(s, c.nextSibling) : (e = e.nodeType === 9 ? e.head : e, e.insertBefore(s, e.firstChild)), t.state.loading |= 4;
    }
  }
  var Za = {
    $$typeof: z,
    Provider: null,
    Consumer: null,
    _currentValue: U,
    _currentValue2: U,
    _threadCount: 0
  };
  function T1(e, t, l, r, s, c, h, R, V) {
    this.tag = 1, this.containerInfo = e, this.pingCache = this.current = this.pendingChildren = null, this.timeoutHandle = -1, this.callbackNode = this.next = this.pendingContext = this.context = this.cancelPendingCommit = null, this.callbackPriority = 0, this.expirationTimes = Vn(-1), this.entangledLanes = this.shellSuspendCounter = this.errorRecoveryDisabledLanes = this.expiredLanes = this.warmLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0, this.entanglements = Vn(0), this.hiddenUpdates = Vn(null), this.identifierPrefix = r, this.onUncaughtError = s, this.onCaughtError = c, this.onRecoverableError = h, this.pooledCache = null, this.pooledCacheLanes = 0, this.formState = V, this.incompleteTransitions = /* @__PURE__ */ new Map();
  }
  function Zy(e, t, l, r, s, c, h, R, V, W, ce, de) {
    return e = new T1(
      e,
      t,
      l,
      h,
      V,
      W,
      ce,
      de,
      R
    ), t = 1, c === !0 && (t |= 24), c = Dn(3, null, null, t), e.current = c, c.stateNode = e, t = ef(), t.refCount++, e.pooledCache = t, t.refCount++, c.memoizedState = {
      element: r,
      isDehydrated: l,
      cache: t
    }, of(c), e;
  }
  function Jy(e) {
    return e ? (e = Rr, e) : Rr;
  }
  function $y(e, t, l, r, s, c) {
    s = Jy(s), r.context === null ? r.context = s : r.pendingContext = s, r = ro(t), r.payload = { element: l }, c = c === void 0 ? null : c, c !== null && (r.callback = c), l = ao(e, r, t), l !== null && (On(l, e, t), Ma(l, e, t));
  }
  function Wy(e, t) {
    if (e = e.memoizedState, e !== null && e.dehydrated !== null) {
      var l = e.retryLane;
      e.retryLane = l !== 0 && l < t ? l : t;
    }
  }
  function Ed(e, t) {
    Wy(e, t), (e = e.alternate) && Wy(e, t);
  }
  function ev(e) {
    if (e.tag === 13 || e.tag === 31) {
      var t = Vo(e, 67108864);
      t !== null && On(t, e, 67108864), Ed(e, 67108864);
    }
  }
  function tv(e) {
    if (e.tag === 13 || e.tag === 31) {
      var t = Un();
      t = qe(t);
      var l = Vo(e, t);
      l !== null && On(l, e, t), Ed(e, t);
    }
  }
  var Is = !0;
  function R1(e, t, l, r) {
    var s = H.T;
    H.T = null;
    var c = D.p;
    try {
      D.p = 2, Td(e, t, l, r);
    } finally {
      D.p = c, H.T = s;
    }
  }
  function C1(e, t, l, r) {
    var s = H.T;
    H.T = null;
    var c = D.p;
    try {
      D.p = 8, Td(e, t, l, r);
    } finally {
      D.p = c, H.T = s;
    }
  }
  function Td(e, t, l, r) {
    if (Is) {
      var s = Rd(r);
      if (s === null)
        ud(
          e,
          t,
          r,
          Bs,
          l
        ), lv(e, r);
      else if (M1(
        s,
        e,
        t,
        l,
        r
      ))
        r.stopPropagation();
      else if (lv(e, r), t & 4 && -1 < O1.indexOf(e)) {
        for (; s !== null; ) {
          var c = gr(s);
          if (c !== null)
            switch (c.tag) {
              case 3:
                if (c = c.stateNode, c.current.memoizedState.isDehydrated) {
                  var h = Ut(c.pendingLanes);
                  if (h !== 0) {
                    var R = c;
                    for (R.pendingLanes |= 2, R.entangledLanes |= 2; h; ) {
                      var V = 1 << 31 - yt(h);
                      R.entanglements[1] |= V, h &= ~V;
                    }
                    cl(c), (gt & 6) === 0 && (ws = ae() + 500, Ga(0));
                  }
                }
                break;
              case 31:
              case 13:
                R = Vo(c, 2), R !== null && On(R, c, 2), Ts(), Ed(c, 2);
            }
          if (c = Rd(r), c === null && ud(
            e,
            t,
            r,
            Bs,
            l
          ), c === s) break;
          s = c;
        }
        s !== null && r.stopPropagation();
      } else
        ud(
          e,
          t,
          r,
          null,
          l
        );
    }
  }
  function Rd(e) {
    return e = Cu(e), Cd(e);
  }
  var Bs = null;
  function Cd(e) {
    if (Bs = null, e = pr(e), e !== null) {
      var t = f(e);
      if (t === null) e = null;
      else {
        var l = t.tag;
        if (l === 13) {
          if (e = p(t), e !== null) return e;
          e = null;
        } else if (l === 31) {
          if (e = m(t), e !== null) return e;
          e = null;
        } else if (l === 3) {
          if (t.stateNode.current.memoizedState.isDehydrated)
            return t.tag === 3 ? t.stateNode.containerInfo : null;
          e = null;
        } else t !== e && (e = null);
      }
    }
    return Bs = e, null;
  }
  function nv(e) {
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
  var Od = !1, vo = null, bo = null, xo = null, Ja = /* @__PURE__ */ new Map(), $a = /* @__PURE__ */ new Map(), So = [], O1 = "mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset".split(
    " "
  );
  function lv(e, t) {
    switch (e) {
      case "focusin":
      case "focusout":
        vo = null;
        break;
      case "dragenter":
      case "dragleave":
        bo = null;
        break;
      case "mouseover":
      case "mouseout":
        xo = null;
        break;
      case "pointerover":
      case "pointerout":
        Ja.delete(t.pointerId);
        break;
      case "gotpointercapture":
      case "lostpointercapture":
        $a.delete(t.pointerId);
    }
  }
  function Wa(e, t, l, r, s, c) {
    return e === null || e.nativeEvent !== c ? (e = {
      blockedOn: t,
      domEventName: l,
      eventSystemFlags: r,
      nativeEvent: c,
      targetContainers: [s]
    }, t !== null && (t = gr(t), t !== null && ev(t)), e) : (e.eventSystemFlags |= r, t = e.targetContainers, s !== null && t.indexOf(s) === -1 && t.push(s), e);
  }
  function M1(e, t, l, r, s) {
    switch (t) {
      case "focusin":
        return vo = Wa(
          vo,
          e,
          t,
          l,
          r,
          s
        ), !0;
      case "dragenter":
        return bo = Wa(
          bo,
          e,
          t,
          l,
          r,
          s
        ), !0;
      case "mouseover":
        return xo = Wa(
          xo,
          e,
          t,
          l,
          r,
          s
        ), !0;
      case "pointerover":
        var c = s.pointerId;
        return Ja.set(
          c,
          Wa(
            Ja.get(c) || null,
            e,
            t,
            l,
            r,
            s
          )
        ), !0;
      case "gotpointercapture":
        return c = s.pointerId, $a.set(
          c,
          Wa(
            $a.get(c) || null,
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
  function ov(e) {
    var t = pr(e.target);
    if (t !== null) {
      var l = f(t);
      if (l !== null) {
        if (t = l.tag, t === 13) {
          if (t = p(l), t !== null) {
            e.blockedOn = t, ln(e.priority, function() {
              tv(l);
            });
            return;
          }
        } else if (t === 31) {
          if (t = m(l), t !== null) {
            e.blockedOn = t, ln(e.priority, function() {
              tv(l);
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
  function Vs(e) {
    if (e.blockedOn !== null) return !1;
    for (var t = e.targetContainers; 0 < t.length; ) {
      var l = Rd(e.nativeEvent);
      if (l === null) {
        l = e.nativeEvent;
        var r = new l.constructor(
          l.type,
          l
        );
        Ru = r, l.target.dispatchEvent(r), Ru = null;
      } else
        return t = gr(l), t !== null && ev(t), e.blockedOn = l, !1;
      t.shift();
    }
    return !0;
  }
  function rv(e, t, l) {
    Vs(e) && l.delete(t);
  }
  function A1() {
    Od = !1, vo !== null && Vs(vo) && (vo = null), bo !== null && Vs(bo) && (bo = null), xo !== null && Vs(xo) && (xo = null), Ja.forEach(rv), $a.forEach(rv);
  }
  function Ps(e, t) {
    e.blockedOn === t && (e.blockedOn = null, Od || (Od = !0, n.unstable_scheduleCallback(
      n.unstable_NormalPriority,
      A1
    )));
  }
  var Ys = null;
  function av(e) {
    Ys !== e && (Ys = e, n.unstable_scheduleCallback(
      n.unstable_NormalPriority,
      function() {
        Ys === e && (Ys = null);
        for (var t = 0; t < e.length; t += 3) {
          var l = e[t], r = e[t + 1], s = e[t + 2];
          if (typeof r != "function") {
            if (Cd(r || l) === null)
              continue;
            break;
          }
          var c = gr(l);
          c !== null && (e.splice(t, 3), t -= 3, Rf(
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
  function Qr(e) {
    function t(V) {
      return Ps(V, e);
    }
    vo !== null && Ps(vo, e), bo !== null && Ps(bo, e), xo !== null && Ps(xo, e), Ja.forEach(t), $a.forEach(t);
    for (var l = 0; l < So.length; l++) {
      var r = So[l];
      r.blockedOn === e && (r.blockedOn = null);
    }
    for (; 0 < So.length && (l = So[0], l.blockedOn === null); )
      ov(l), l.blockedOn === null && So.shift();
    if (l = (e.ownerDocument || e).$$reactFormReplay, l != null)
      for (r = 0; r < l.length; r += 3) {
        var s = l[r], c = l[r + 1], h = s[cn] || null;
        if (typeof c == "function")
          h || av(l);
        else if (h) {
          var R = null;
          if (c && c.hasAttribute("formAction")) {
            if (s = c, h = c[cn] || null)
              R = h.formAction;
            else if (Cd(s) !== null) continue;
          } else R = h.action;
          typeof R == "function" ? l[r + 1] = R : (l.splice(r, 3), r -= 3), av(l);
        }
      }
  }
  function iv() {
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
  function Md(e) {
    this._internalRoot = e;
  }
  Gs.prototype.render = Md.prototype.render = function(e) {
    var t = this._internalRoot;
    if (t === null) throw Error(i(409));
    var l = t.current, r = Un();
    $y(l, r, e, t, null, null);
  }, Gs.prototype.unmount = Md.prototype.unmount = function() {
    var e = this._internalRoot;
    if (e !== null) {
      this._internalRoot = null;
      var t = e.containerInfo;
      $y(e.current, 2, null, e, null, null), Ts(), t[rl] = null;
    }
  };
  function Gs(e) {
    this._internalRoot = e;
  }
  Gs.prototype.unstable_scheduleHydration = function(e) {
    if (e) {
      var t = Xt();
      e = { blockedOn: null, target: e, priority: t };
      for (var l = 0; l < So.length && t !== 0 && t < So[l].priority; l++) ;
      So.splice(l, 0, e), l === 0 && ov(e);
    }
  };
  var sv = o.version;
  if (sv !== "19.2.7")
    throw Error(
      i(
        527,
        sv,
        "19.2.7"
      )
    );
  D.findDOMNode = function(e) {
    var t = e._reactInternals;
    if (t === void 0)
      throw typeof e.render == "function" ? Error(i(188)) : (e = Object.keys(e).join(","), Error(i(268, e)));
    return e = d(t), e = e !== null ? v(e) : null, e = e === null ? null : e.stateNode, e;
  };
  var z1 = {
    bundleType: 0,
    version: "19.2.7",
    rendererPackageName: "react-dom",
    currentDispatcherRef: H,
    reconcilerVersion: "19.2.7"
  };
  if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u") {
    var qs = __REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!qs.isDisabled && qs.supportsFiber)
      try {
        et = qs.inject(
          z1
        ), ht = qs;
      } catch {
      }
  }
  return ti.createRoot = function(e, t) {
    if (!u(e)) throw Error(i(299));
    var l = !1, r = "", s = mh, c = hh, h = yh;
    return t != null && (t.unstable_strictMode === !0 && (l = !0), t.identifierPrefix !== void 0 && (r = t.identifierPrefix), t.onUncaughtError !== void 0 && (s = t.onUncaughtError), t.onCaughtError !== void 0 && (c = t.onCaughtError), t.onRecoverableError !== void 0 && (h = t.onRecoverableError)), t = Zy(
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
      iv
    ), e[rl] = t.current, cd(e), new Md(t);
  }, ti.hydrateRoot = function(e, t, l) {
    if (!u(e)) throw Error(i(299));
    var r = !1, s = "", c = mh, h = hh, R = yh, V = null;
    return l != null && (l.unstable_strictMode === !0 && (r = !0), l.identifierPrefix !== void 0 && (s = l.identifierPrefix), l.onUncaughtError !== void 0 && (c = l.onUncaughtError), l.onCaughtError !== void 0 && (h = l.onCaughtError), l.onRecoverableError !== void 0 && (R = l.onRecoverableError), l.formState !== void 0 && (V = l.formState)), t = Zy(
      e,
      1,
      !0,
      t,
      l ?? null,
      r,
      s,
      V,
      c,
      h,
      R,
      iv
    ), t.context = Jy(null), l = t.current, r = Un(), r = qe(r), s = ro(r), s.callback = null, ao(l, s, r), l = r, t.current.lanes = l, qt(t, l), cl(t), e[rl] = t.current, cd(e), new Gs(t);
  }, ti.version = "19.2.7", ti;
}
var vv;
function P1() {
  if (vv) return Nd.exports;
  vv = 1;
  function n() {
    if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function"))
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(n);
      } catch (o) {
        console.error(o);
      }
  }
  return n(), Nd.exports = V1(), Nd.exports;
}
var Y1 = P1();
const Nb = (...n) => n.filter((o, a, i) => !!o && o.trim() !== "" && i.indexOf(o) === a).join(" ").trim();
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
}, F1 = y.createContext({}), K1 = () => y.useContext(F1), Q1 = y.forwardRef(
  ({ color: n, size: o, strokeWidth: a, absoluteStrokeWidth: i, className: u = "", children: f, iconNode: p, ...m }, g) => {
    const {
      size: d = 24,
      strokeWidth: v = 2,
      absoluteStrokeWidth: x = !1,
      color: S = "currentColor",
      className: C = ""
    } = K1() ?? {}, w = i ?? x ? Number(a ?? v) * 24 / Number(o ?? d) : a ?? v;
    return y.createElement(
      "svg",
      {
        ref: g,
        ..._d,
        width: o ?? d ?? _d.width,
        height: o ?? d ?? _d.height,
        stroke: n ?? S,
        strokeWidth: w,
        className: Nb("lucide", C, u),
        ...!f && !X1(m) && { "aria-hidden": "true" },
        ...m
      },
      [
        ...p.map(([M, E]) => y.createElement(M, E)),
        ...Array.isArray(f) ? f : [f]
      ]
    );
  }
);
const Qt = (n, o) => {
  const a = y.forwardRef(
    ({ className: i, ...u }, f) => y.createElement(Q1, {
      ref: f,
      iconNode: o,
      className: Nb(
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
  ["path", { d: "m21 16-4 4-4-4", key: "f6ql7i" }],
  ["path", { d: "M17 20V4", key: "1ejh1v" }],
  ["path", { d: "m3 8 4-4 4 4", key: "11wl7u" }],
  ["path", { d: "M7 4v16", key: "1glfcx" }]
], J1 = Qt("arrow-up-down", Z1);
const $1 = [["path", { d: "M20 6 9 17l-5-5", key: "1gmf2c" }]], vi = Qt("check", $1);
const W1 = [["path", { d: "m6 9 6 6 6-6", key: "qrunsl" }]], hc = Qt("chevron-down", W1);
const eE = [["path", { d: "m9 18 6-6-6-6", key: "mthhwq" }]], lp = Qt("chevron-right", eE);
const tE = [
  ["circle", { cx: "12", cy: "12", r: "1", key: "41hilf" }],
  ["circle", { cx: "19", cy: "12", r: "1", key: "1wjl8i" }],
  ["circle", { cx: "5", cy: "12", r: "1", key: "1pcz8c" }]
], xv = Qt("ellipsis", tE);
const nE = [
  [
    "path",
    {
      d: "M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528",
      key: "1jaruq"
    }
  ]
], lE = Qt("flag", nE);
const oE = [
  [
    "path",
    {
      d: "m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2",
      key: "usdka0"
    }
  ]
], rE = Qt("folder-open", oE);
const aE = [
  [
    "path",
    {
      d: "M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z",
      key: "sc7q7i"
    }
  ]
], iE = Qt("funnel", aE);
const sE = [
  ["rect", { width: "7", height: "7", x: "3", y: "3", rx: "1", key: "1g98yp" }],
  ["rect", { width: "7", height: "7", x: "14", y: "3", rx: "1", key: "6d4xhi" }],
  ["rect", { width: "7", height: "7", x: "14", y: "14", rx: "1", key: "nxv5o0" }],
  ["rect", { width: "7", height: "7", x: "3", y: "14", rx: "1", key: "1bb6yr" }]
], Sv = Qt("layout-grid", sE);
const cE = [
  ["path", { d: "m16 6 4 14", key: "ji33uf" }],
  ["path", { d: "M12 6v14", key: "1n7gus" }],
  ["path", { d: "M8 8v12", key: "1gg7y9" }],
  ["path", { d: "M4 4v16", key: "6qkkli" }]
], uE = Qt("library", cE);
const fE = [["path", { d: "M21 12a9 9 0 1 1-6.219-8.56", key: "13zald" }]], dE = Qt("loader-circle", fE);
const pE = [
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
], gE = Qt("notebook-pen", pE);
const mE = [
  ["path", { d: "M5 12h14", key: "1ays0h" }],
  ["path", { d: "M12 5v14", key: "s699le" }]
], Db = Qt("plus", mE);
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
], op = Qt("search", xE);
const SE = [
  [
    "path",
    {
      d: "M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915",
      key: "1i5ecw"
    }
  ],
  ["circle", { cx: "12", cy: "12", r: "3", key: "1v7zrd" }]
], jb = Qt("settings", SE);
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
], rp = Qt("star", TE);
const RE = [
  ["path", { d: "M10 11v6", key: "nco0om" }],
  ["path", { d: "M14 11v6", key: "outv1u" }],
  ["path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6", key: "miytrc" }],
  ["path", { d: "M3 6h18", key: "d0wm0j" }],
  ["path", { d: "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2", key: "e791ji" }]
], kb = Qt("trash-2", RE);
const CE = [
  ["path", { d: "M18 6 6 18", key: "1bl5f8" }],
  ["path", { d: "m6 6 12 12", key: "d8bk6v" }]
], fi = Qt("x", CE);
function Hc() {
  return typeof window < "u";
}
function mn(n) {
  return Rp(n) ? (n.nodeName || "").toLowerCase() : "#document";
}
function Nt(n) {
  var o;
  return (n == null || (o = n.ownerDocument) == null ? void 0 : o.defaultView) || window;
}
function Ql(n) {
  var o;
  return (o = (Rp(n) ? n.ownerDocument : n.document) || window.document) == null ? void 0 : o.documentElement;
}
function Rp(n) {
  return Hc() ? n instanceof Node || n instanceof Nt(n).Node : !1;
}
function $e(n) {
  return Hc() ? n instanceof Element || n instanceof Nt(n).Element : !1;
}
function Ct(n) {
  return Hc() ? n instanceof HTMLElement || n instanceof Nt(n).HTMLElement : !1;
}
function na(n) {
  return !Hc() || typeof ShadowRoot > "u" ? !1 : n instanceof ShadowRoot || n instanceof Nt(n).ShadowRoot;
}
function cr(n) {
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
function Uc(n) {
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
const ME = /transform|translate|scale|rotate|perspective|filter/, AE = /paint|layout|strict|content/, er = (n) => !!n && n !== "none";
let Hd;
function Cp(n) {
  const o = $e(n) ? In(n) : n;
  return er(o.transform) || er(o.translate) || er(o.scale) || er(o.rotate) || er(o.perspective) || !Op() && (er(o.backdropFilter) || er(o.filter)) || ME.test(o.willChange || "") || AE.test(o.contain || "");
}
function zE(n) {
  let o = ql(n);
  for (; Ct(o) && !Pl(o); ) {
    if (Cp(o))
      return o;
    if (Uc(o))
      return null;
    o = ql(o);
  }
  return null;
}
function Op() {
  return Hd == null && (Hd = typeof CSS < "u" && CSS.supports && CSS.supports("-webkit-backdrop-filter", "none")), Hd;
}
function Pl(n) {
  return /^(html|body|#document)$/.test(mn(n));
}
function In(n) {
  return Nt(n).getComputedStyle(n);
}
function Lc(n) {
  return $e(n) ? {
    scrollLeft: n.scrollLeft,
    scrollTop: n.scrollTop
  } : {
    scrollLeft: n.scrollX,
    scrollTop: n.scrollY
  };
}
function ql(n) {
  if (mn(n) === "html")
    return n;
  const o = (
    // Step into the shadow DOM of the parent of a slotted node.
    n.assignedSlot || // DOM Element detected.
    n.parentNode || // ShadowRoot detected.
    na(n) && n.host || // Fallback.
    Ql(n)
  );
  return na(o) ? o.host : o;
}
function _b(n) {
  const o = ql(n);
  return Pl(o) ? (n.ownerDocument || n).body : Ct(o) && cr(o) ? o : _b(o);
}
function bi(n, o, a) {
  var i;
  o === void 0 && (o = []), a === void 0 && (a = !0);
  const u = _b(n), f = u === ((i = n.ownerDocument) == null ? void 0 : i.body), p = Nt(u);
  if (f) {
    const m = ap(p);
    return o.concat(p, p.visualViewport || [], cr(u) ? u : [], m && a ? bi(m) : []);
  } else
    return o.concat(u, bi(u, [], a));
}
function ap(n) {
  return n.parent && Object.getPrototypeOf(n.parent) ? n.frameElement : null;
}
const Mp = {
  ...U1
}, wv = {};
function xn(n, o) {
  const a = y.useRef(wv);
  return a.current === wv && (a.current = n(o)), a;
}
const Ud = Mp.useInsertionEffect, NE = (
  // React 17 doesn't have useInsertionEffect.
  Ud && // Preact replaces useInsertionEffect with useLayoutEffect and fires too late.
  Ud !== Mp.useLayoutEffect ? Ud : (n) => n()
);
function ze(n) {
  const o = xn(DE).current;
  return o.next = n, NE(o.effect), o.trampoline;
}
function DE() {
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
function ip(n, o) {
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
const Ap = {};
function bn(n, o, a, i, u) {
  if (!a && !i && !u && !n)
    return yc(o);
  let f = yc(n);
  return o && (f = ri(f, o)), a && (f = ri(f, a)), i && (f = ri(f, i)), u && (f = ri(f, u)), f;
}
function _E(n) {
  if (n.length === 0)
    return Ap;
  if (n.length === 1)
    return yc(n[0]);
  let o = yc(n[0]);
  for (let a = 1; a < n.length; a += 1)
    o = ri(o, n[a]);
  return o;
}
function yc(n) {
  return zp(n) ? {
    ...Ub(n, Ap)
  } : HE(n);
}
function ri(n, o) {
  return zp(o) ? Ub(o, n) : UE(n, o);
}
function HE(n) {
  const o = {
    ...n
  };
  for (const a in o) {
    const i = o[a];
    Hb(a, i) && (o[a] = Lb(i));
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
        n[a] = ip(n.style, i);
        break;
      }
      case "className": {
        n[a] = Ib(n.className, i);
        break;
      }
      default:
        Hb(a, i) ? n[a] = LE(n[a], i) : n[a] = i;
    }
  }
  return n;
}
function Hb(n, o) {
  const a = n.charCodeAt(0), i = n.charCodeAt(1), u = n.charCodeAt(2);
  return a === 111 && i === 110 && u >= 65 && u <= 90 && (typeof o == "function" || typeof o > "u");
}
function zp(n) {
  return typeof n == "function";
}
function Ub(n, o) {
  return zp(n) ? n(o) : n ?? Ap;
}
function LE(n, o) {
  return o ? n ? (...a) => {
    const i = a[0];
    if (Bb(i)) {
      const f = i;
      vc(f);
      const p = o(...a);
      return f.baseUIHandlerPrevented || n?.(...a), p;
    }
    const u = o(...a);
    return n?.(...a), u;
  } : Lb(o) : n;
}
function Lb(n) {
  return n && ((...o) => {
    const a = o[0];
    return Bb(a) && vc(a), n(...o);
  });
}
function vc(n) {
  return n.preventBaseUIHandler = () => {
    n.baseUIHandlerPrevented = !0;
  }, n;
}
function Ib(n, o) {
  return o ? n ? o + " " + n : o : n;
}
function Bb(n) {
  return n != null && typeof n == "object" && "nativeEvent" in n;
}
function IE(n, o) {
  return function(i, ...u) {
    const f = new URL(n);
    return f.searchParams.set("code", i.toString()), u.forEach((p) => f.searchParams.append("args[]", p)), `${o} error #${i}; visit ${f} for the full message.`;
  };
}
const At = IE("https://base-ui.com/production-error", "Base UI"), Vb = /* @__PURE__ */ y.createContext(void 0);
function Np(n = !1) {
  const o = y.useContext(Vb);
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
  } = n, p = i && o !== !1, m = i && o === !1;
  return {
    props: y.useMemo(() => {
      const d = {
        // allow Tabbing away from focusableWhenDisabled elements
        onKeyDown(v) {
          a && o && v.key !== "Tab" && v.preventDefault();
        }
      };
      return i || (d.tabIndex = u, !f && a && (d.tabIndex = o ? u : -1)), (f && (o || p) || !f && a) && (d["aria-disabled"] = a), f && (!o || m) && (d.disabled = a), d;
    }, [i, a, o, p, m, f, u])
  };
}
function Ao(n = {}) {
  const {
    disabled: o = !1,
    focusableWhenDisabled: a,
    tabIndex: i = 0,
    native: u = !0,
    composite: f
  } = n, p = y.useRef(null), m = Np(!0), g = f ?? m !== void 0, {
    props: d
  } = BE({
    focusableWhenDisabled: a,
    disabled: o,
    composite: g,
    tabIndex: i,
    isNativeButton: u
  }), v = y.useCallback(() => {
    const C = p.current;
    Ld(C) && g && o && d.disabled === void 0 && C.disabled && (C.disabled = !1);
  }, [o, d.disabled, g]);
  xe(v, [v]);
  const x = y.useCallback((C = {}) => {
    const {
      onClick: w,
      onMouseDown: M,
      onKeyUp: E,
      onKeyDown: A,
      onPointerDown: O,
      ...z
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
        o || M?.(N);
      },
      onKeyDown(N) {
        if (o || (vc(N), A?.(N), N.baseUIHandlerPrevented))
          return;
        const I = N.target === N.currentTarget, j = N.currentTarget, L = Ld(j), _ = !u && VE(j), k = I && (u ? L : !_), Y = N.key === "Enter", te = N.key === " ", F = j.getAttribute("role"), Q = F?.startsWith("menuitem") || F === "option" || F === "gridcell";
        if (I && g && te) {
          if (N.defaultPrevented && Q)
            return;
          N.preventDefault(), _ || u && L ? (j.click(), N.preventBaseUIHandler()) : k && (w?.(N), N.preventBaseUIHandler());
          return;
        }
        k && (!u && (te || Y) && N.preventDefault(), !u && Y && w?.(N));
      },
      onKeyUp(N) {
        if (!o) {
          if (vc(N), E?.(N), N.target === N.currentTarget && u && g && Ld(N.currentTarget) && N.key === " ") {
            N.preventDefault();
            return;
          }
          N.baseUIHandlerPrevented || N.target === N.currentTarget && !u && !g && N.key === " " && w?.(N);
        }
      },
      onPointerDown(N) {
        if (o) {
          N.preventDefault();
          return;
        }
        O?.(N);
      }
    }, u ? {
      type: "button"
    } : {
      role: "button"
    }, d, z);
  }, [o, d, g, u]), S = ze((C) => {
    p.current = C, v();
  });
  return {
    getButtonProps: x,
    buttonRef: S
  };
}
function Ld(n) {
  return Ct(n) && n.tagName === "BUTTON";
}
function VE(n) {
  return !!(n?.tagName === "A" && n?.href);
}
function Ro(n, o, a, i) {
  const u = xn(Pb).current;
  return YE(u, n, o, a, i) && Yb(u, [n, o, a, i]), u.callback;
}
function PE(n) {
  const o = xn(Pb).current;
  return GE(o, n) && Yb(o, n), o.callback;
}
function Pb() {
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
function Yb(n, o) {
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
function Ev(n) {
  if (!/* @__PURE__ */ y.isValidElement(n))
    return null;
  const o = n, a = o.props;
  return (Dp(19) ? a?.ref : o.ref) ?? null;
}
function an() {
}
const Xl = Object.freeze([]), xt = Object.freeze({});
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
    props: m,
    stateAttributesMapping: g,
    enabled: d = !0
  } = o, v = d ? FE(a, f) : void 0, x = d ? KE(i, f) : void 0, S = d ? XE(f, g) : xt, C = d && m ? ZE(m) : void 0, w = d ? ip(S, C) ?? {} : xt;
  return typeof document < "u" && (d ? Array.isArray(p) ? w.ref = PE([w.ref, Ev(u), ...p]) : w.ref = Ro(w.ref, Ev(u), p) : Ro(null, null)), d ? (v !== void 0 && (w.className = Ib(w.className, v)), x !== void 0 && (w.style = ip(w.style, x)), w) : xt;
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
    nativeButton: m = !0,
    style: g,
    ...d
  } = o, {
    getButtonProps: v,
    buttonRef: x
  } = Ao({
    disabled: f,
    focusableWhenDisabled: p,
    native: m
  });
  return nt("button", o, {
    state: {
      disabled: f
    },
    ref: [a, x],
    props: [d, v]
  });
});
function Gb(n) {
  var o, a, i = "";
  if (typeof n == "string" || typeof n == "number") i += n;
  else if (typeof n == "object") if (Array.isArray(n)) {
    var u = n.length;
    for (o = 0; o < u; o++) n[o] && (a = Gb(n[o])) && (i && (i += " "), i += a);
  } else for (a in n) n[a] && (i && (i += " "), i += a);
  return i;
}
function qb() {
  for (var n, o, a = 0, i = "", u = arguments.length; a < u; a++) (n = arguments[a]) && (o = Gb(n)) && (i && (i += " "), i += o);
  return i;
}
const Tv = (n) => typeof n == "boolean" ? `${n}` : n === 0 ? "0" : n, Rv = qb, ia = (n, o) => (a) => {
  var i;
  if (o?.variants == null) return Rv(n, a?.class, a?.className);
  const { variants: u, defaultVariants: f } = o, p = Object.keys(u).map((d) => {
    const v = a?.[d], x = f?.[d];
    if (v === null) return null;
    const S = Tv(v) || Tv(x);
    return u[d][S];
  }), m = a && Object.entries(a).reduce((d, v) => {
    let [x, S] = v;
    return S === void 0 || (d[x] = S), d;
  }, {}), g = o == null || (i = o.compoundVariants) === null || i === void 0 ? void 0 : i.reduce((d, v) => {
    let { class: x, className: S, ...C } = v;
    return Object.entries(C).every((w) => {
      let [M, E] = w;
      return Array.isArray(E) ? E.includes({
        ...f,
        ...m
      }[M]) : {
        ...f,
        ...m
      }[M] === E;
    }) ? [
      ...d,
      x,
      S
    ] : d;
  }, []);
  return Rv(n, p, g, a?.class, a?.className);
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
}), Xb = (n = /* @__PURE__ */ new Map(), o = null, a) => ({
  nextPart: n,
  validators: o,
  classGroupId: a
}), bc = "-", Cv = [], lT = "arbitrary..", oT = (n) => {
  const o = aT(n), {
    conflictingClassGroups: a,
    conflictingClassGroupModifiers: i
  } = n;
  return {
    getClassGroupId: (p) => {
      if (p.startsWith("[") && p.endsWith("]"))
        return rT(p);
      const m = p.split(bc), g = m[0] === "" && m.length > 1 ? 1 : 0;
      return Fb(m, g, o);
    },
    getConflictingClassGroupIds: (p, m) => {
      if (m) {
        const g = i[p], d = a[p];
        return g ? d ? tT(d, g) : g : d || Cv;
      }
      return a[p] || Cv;
    }
  };
}, Fb = (n, o, a) => {
  if (n.length - o === 0)
    return a.classGroupId;
  const u = n[o], f = a.nextPart.get(u);
  if (f) {
    const d = Fb(n, o + 1, f);
    if (d) return d;
  }
  const p = a.validators;
  if (p === null)
    return;
  const m = o === 0 ? n.join(bc) : n.slice(o).join(bc), g = p.length;
  for (let d = 0; d < g; d++) {
    const v = p[d];
    if (v.validator(m))
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
  const a = Xb();
  for (const i in n) {
    const u = n[i];
    jp(u, a, i, o);
  }
  return a;
}, jp = (n, o, a, i) => {
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
  const i = n === "" ? o : Kb(o, n);
  i.classGroupId = a;
}, uT = (n, o, a, i) => {
  if (dT(n)) {
    jp(n(i), o, a, i);
    return;
  }
  o.validators === null && (o.validators = []), o.validators.push(nT(a, n));
}, fT = (n, o, a, i) => {
  const u = Object.entries(n), f = u.length;
  for (let p = 0; p < f; p++) {
    const [m, g] = u[p];
    jp(g, Kb(o, m), a, i);
  }
}, Kb = (n, o) => {
  let a = n;
  const i = o.split(bc), u = i.length;
  for (let f = 0; f < u; f++) {
    const p = i[f];
    let m = a.nextPart.get(p);
    m || (m = Xb(), a.nextPart.set(p, m)), a = m;
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
}, sp = "!", Ov = ":", gT = [], Mv = (n, o, a, i, u) => ({
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
    let p = 0, m = 0, g = 0, d;
    const v = u.length;
    for (let M = 0; M < v; M++) {
      const E = u[M];
      if (p === 0 && m === 0) {
        if (E === Ov) {
          f.push(u.slice(g, M)), g = M + 1;
          continue;
        }
        if (E === "/") {
          d = M;
          continue;
        }
      }
      E === "[" ? p++ : E === "]" ? p-- : E === "(" ? m++ : E === ")" && m--;
    }
    const x = f.length === 0 ? u : u.slice(g);
    let S = x, C = !1;
    x.endsWith(sp) ? (S = x.slice(0, -1), C = !0) : (
      /**
       * In Tailwind CSS v3 the important modifier was at the start of the base class name. This is still supported for legacy reasons.
       * @see https://github.com/dcastil/tailwind-merge/issues/513#issuecomment-2614029864
       */
      x.startsWith(sp) && (S = x.slice(1), C = !0)
    );
    const w = d && d > g ? d - g : void 0;
    return Mv(f, C, S, w);
  };
  if (o) {
    const u = o + Ov, f = i;
    i = (p) => p.startsWith(u) ? f(p.slice(u.length)) : Mv(gT, !1, p, void 0, !0);
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
      const p = a[f], m = p[0] === "[", g = o.has(p);
      m || g ? (u.length > 0 && (u.sort(), i.push(...u), u = []), i.push(p)) : u.push(p);
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
  } = o, m = [], g = n.trim().split(bT);
  let d = "";
  for (let v = g.length - 1; v >= 0; v -= 1) {
    const x = g[v], {
      isExternal: S,
      modifiers: C,
      hasImportantModifier: w,
      baseClassName: M,
      maybePostfixModifierPosition: E
    } = a(x);
    if (S) {
      d = x + (d.length > 0 ? " " + d : d);
      continue;
    }
    let A = !!E, O;
    if (A) {
      const L = M.substring(0, E);
      O = i(L);
      const _ = O && p[O] ? i(M) : void 0;
      _ && _ !== O && (O = _, A = !1);
    } else
      O = i(M);
    if (!O) {
      if (!A) {
        d = x + (d.length > 0 ? " " + d : d);
        continue;
      }
      if (O = i(M), !O) {
        d = x + (d.length > 0 ? " " + d : d);
        continue;
      }
      A = !1;
    }
    const z = C.length === 0 ? "" : C.length === 1 ? C[0] : f(C).join(":"), N = w ? z + sp : z, I = N + O;
    if (m.indexOf(I) > -1)
      continue;
    m.push(I);
    const j = u(O, A);
    for (let L = 0; L < j.length; ++L) {
      const _ = j[L];
      m.push(N + _);
    }
    d = x + (d.length > 0 ? " " + d : d);
  }
  return d;
}, ST = (...n) => {
  let o = 0, a, i, u = "";
  for (; o < n.length; )
    (a = n[o++]) && (i = Qb(a)) && (u && (u += " "), u += i);
  return u;
}, Qb = (n) => {
  if (typeof n == "string")
    return n;
  let o, a = "";
  for (let i = 0; i < n.length; i++)
    n[i] && (o = Qb(n[i])) && (a && (a += " "), a += o);
  return a;
}, wT = (n, ...o) => {
  let a, i, u, f;
  const p = (g) => {
    const d = o.reduce((v, x) => x(v), n());
    return a = yT(d), i = a.cache.get, u = a.cache.set, f = m, m(g);
  }, m = (g) => {
    const d = i(g);
    if (d)
      return d;
    const v = xT(g, a);
    return u(g, v), v;
  };
  return f = p, (...g) => f(ST(...g));
}, ET = [], nn = (n) => {
  const o = (a) => a[n] || ET;
  return o.isThemeGetter = !0, o;
}, Zb = /^\[(?:(\w[\w-]*):)?(.+)\]$/i, Jb = /^\((?:(\w[\w-]*):)?(.+)\)$/i, TT = /^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/, RT = /^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/, CT = /\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/, OT = /^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix)\(.+\)$/, MT = /^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/, AT = /^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/, Eo = (n) => TT.test(n), Ze = (n) => !!n && !Number.isNaN(Number(n)), ul = (n) => !!n && Number.isInteger(Number(n)), Id = (n) => n.endsWith("%") && Ze(n.slice(0, -1)), Ul = (n) => RT.test(n), $b = () => !0, zT = (n) => (
  // `colorFunctionRegex` check is necessary because color functions can have percentages in them which which would be incorrectly classified as lengths.
  // For example, `hsl(0 0% 0%)` would be classified as a length without this check.
  // I could also use lookbehind assertion in `lengthUnitRegex` but that isn't supported widely enough.
  CT.test(n) && !OT.test(n)
), kp = () => !1, NT = (n) => MT.test(n), DT = (n) => AT.test(n), jT = (n) => !Me(n) && !Ae(n), kT = (n) => n.startsWith("@container") && (n[10] === "/" && n[11] !== void 0 || n[11] === "s" && n[16] !== void 0 && n.startsWith("-size/", 10) || n[11] === "n" && n[18] !== void 0 && n.startsWith("-normal/", 10)), _T = (n) => zo(n, t0, kp), Me = (n) => Zb.test(n), tr = (n) => zo(n, n0, zT), Av = (n) => zo(n, YT, Ze), HT = (n) => zo(n, o0, $b), UT = (n) => zo(n, l0, kp), zv = (n) => zo(n, Wb, kp), LT = (n) => zo(n, e0, DT), Xs = (n) => zo(n, r0, NT), Ae = (n) => Jb.test(n), ni = (n) => ur(n, n0), IT = (n) => ur(n, l0), Nv = (n) => ur(n, Wb), BT = (n) => ur(n, t0), VT = (n) => ur(n, e0), Fs = (n) => ur(n, r0, !0), PT = (n) => ur(n, o0, !0), zo = (n, o, a) => {
  const i = Zb.exec(n);
  return i ? i[1] ? o(i[1]) : a(i[2]) : !1;
}, ur = (n, o, a = !1) => {
  const i = Jb.exec(n);
  return i ? i[1] ? o(i[1]) : a : !1;
}, Wb = (n) => n === "position" || n === "percentage", e0 = (n) => n === "image" || n === "url", t0 = (n) => n === "length" || n === "size" || n === "bg-size", n0 = (n) => n === "length", YT = (n) => n === "number", l0 = (n) => n === "family-name", o0 = (n) => n === "number" || n === "weight", r0 = (n) => n === "shadow", GT = () => {
  const n = nn("color"), o = nn("font"), a = nn("text"), i = nn("font-weight"), u = nn("tracking"), f = nn("leading"), p = nn("breakpoint"), m = nn("container"), g = nn("spacing"), d = nn("radius"), v = nn("shadow"), x = nn("inset-shadow"), S = nn("text-shadow"), C = nn("drop-shadow"), w = nn("blur"), M = nn("perspective"), E = nn("aspect"), A = nn("ease"), O = nn("animate"), z = () => ["auto", "avoid", "all", "avoid-page", "page", "left", "right", "column"], N = () => [
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
  ], I = () => [...N(), Ae, Me], j = () => ["auto", "hidden", "clip", "visible", "scroll"], L = () => ["auto", "contain", "none"], _ = () => [Ae, Me, g], k = () => [Eo, "full", "auto", ..._()], Y = () => [ul, "none", "subgrid", Ae, Me], te = () => ["auto", {
    span: ["full", ul, Ae, Me]
  }, ul, Ae, Me], F = () => [ul, "auto", Ae, Me], Q = () => ["auto", "min", "max", "fr", Ae, Me], Z = () => ["start", "end", "center", "between", "around", "evenly", "stretch", "baseline", "center-safe", "end-safe"], q = () => ["start", "end", "center", "stretch", "center-safe", "end-safe"], H = () => ["auto", ..._()], D = () => [Eo, "auto", "full", "dvw", "dvh", "lvw", "lvh", "svw", "svh", "min", "max", "fit", ..._()], U = () => [Eo, "screen", "full", "dvw", "lvw", "svw", "min", "max", "fit", ..._()], X = () => [Eo, "screen", "full", "lh", "dvh", "lvh", "svh", "min", "max", "fit", ..._()], P = () => [n, Ae, Me], T = () => [...N(), Nv, zv, {
    position: [Ae, Me]
  }], B = () => ["no-repeat", {
    repeat: ["", "x", "y", "space", "round"]
  }], ne = () => ["auto", "cover", "contain", BT, _T, {
    size: [Ae, Me]
  }], J = () => [Id, ni, tr], re = () => [
    // Deprecated since Tailwind CSS v4.0.0
    "",
    "none",
    "full",
    d,
    Ae,
    Me
  ], ie = () => ["", Ze, ni, tr], oe = () => ["solid", "dashed", "dotted", "double"], se = () => ["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity"], ge = () => [Ze, Id, Nv, zv], je = () => [
    // Deprecated since Tailwind CSS v4.0.0
    "",
    "none",
    w,
    Ae,
    Me
  ], Ee = () => ["none", Ze, Ae, Me], fe = () => ["none", Ze, Ae, Me], ye = () => [Ze, Ae, Me], Re = () => [Eo, "full", ..._()];
  return {
    cacheSize: 500,
    theme: {
      animate: ["spin", "ping", "pulse", "bounce"],
      aspect: ["video"],
      blur: [Ul],
      breakpoint: [Ul],
      color: [$b],
      container: [Ul],
      "drop-shadow": [Ul],
      ease: ["in", "out", "in-out"],
      font: [jT],
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
        aspect: ["auto", "square", Eo, Me, Ae, E]
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
        columns: [Ze, Me, Ae, m]
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
        object: I()
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
        overscroll: L()
      }],
      /**
       * Overscroll Behavior X
       * @see https://tailwindcss.com/docs/overscroll-behavior
       */
      "overscroll-x": [{
        "overscroll-x": L()
      }],
      /**
       * Overscroll Behavior Y
       * @see https://tailwindcss.com/docs/overscroll-behavior
       */
      "overscroll-y": [{
        "overscroll-y": L()
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
        inset: k()
      }],
      /**
       * Inset Inline
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      "inset-x": [{
        "inset-x": k()
      }],
      /**
       * Inset Block
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      "inset-y": [{
        "inset-y": k()
      }],
      /**
       * Inset Inline Start
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       * @todo class group will be renamed to `inset-s` in next major release
       */
      start: [{
        "inset-s": k(),
        /**
         * @deprecated since Tailwind CSS v4.2.0 in favor of `inset-s-*` utilities.
         * @see https://github.com/tailwindlabs/tailwindcss/pull/19613
         */
        start: k()
      }],
      /**
       * Inset Inline End
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       * @todo class group will be renamed to `inset-e` in next major release
       */
      end: [{
        "inset-e": k(),
        /**
         * @deprecated since Tailwind CSS v4.2.0 in favor of `inset-e-*` utilities.
         * @see https://github.com/tailwindlabs/tailwindcss/pull/19613
         */
        end: k()
      }],
      /**
       * Inset Block Start
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      "inset-bs": [{
        "inset-bs": k()
      }],
      /**
       * Inset Block End
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      "inset-be": [{
        "inset-be": k()
      }],
      /**
       * Top
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      top: [{
        top: k()
      }],
      /**
       * Right
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      right: [{
        right: k()
      }],
      /**
       * Bottom
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      bottom: [{
        bottom: k()
      }],
      /**
       * Left
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      left: [{
        left: k()
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
        basis: [Eo, "full", "auto", m, ..._()]
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
        flex: [Ze, Eo, "auto", "initial", "none", Me]
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
        "grid-cols": Y()
      }],
      /**
       * Grid Column Start / End
       * @see https://tailwindcss.com/docs/grid-column
       */
      "col-start-end": [{
        col: te()
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
        "grid-rows": Y()
      }],
      /**
       * Grid Row Start / End
       * @see https://tailwindcss.com/docs/grid-row
       */
      "row-start-end": [{
        row: te()
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
        size: D()
      }],
      /**
       * Inline Size
       * @see https://tailwindcss.com/docs/width
       */
      "inline-size": [{
        inline: ["auto", ...U()]
      }],
      /**
       * Min-Inline Size
       * @see https://tailwindcss.com/docs/min-width
       */
      "min-inline-size": [{
        "min-inline": ["auto", ...U()]
      }],
      /**
       * Max-Inline Size
       * @see https://tailwindcss.com/docs/max-width
       */
      "max-inline-size": [{
        "max-inline": ["none", ...U()]
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
        w: [m, "screen", ...D()]
      }],
      /**
       * Min-Width
       * @see https://tailwindcss.com/docs/min-width
       */
      "min-w": [{
        "min-w": [
          m,
          "screen",
          /** Deprecated. @see https://github.com/tailwindlabs/tailwindcss.com/issues/2027#issuecomment-2620152757 */
          "none",
          ...D()
        ]
      }],
      /**
       * Max-Width
       * @see https://tailwindcss.com/docs/max-width
       */
      "max-w": [{
        "max-w": [
          m,
          "screen",
          "none",
          /** Deprecated since Tailwind CSS v4.0.0. @see https://github.com/tailwindlabs/tailwindcss.com/issues/2027#issuecomment-2620152757 */
          "prose",
          /** Deprecated since Tailwind CSS v4.0.0. @see https://github.com/tailwindlabs/tailwindcss.com/issues/2027#issuecomment-2620152757 */
          {
            screen: [p]
          },
          ...D()
        ]
      }],
      /**
       * Height
       * @see https://tailwindcss.com/docs/height
       */
      h: [{
        h: ["screen", "lh", ...D()]
      }],
      /**
       * Min-Height
       * @see https://tailwindcss.com/docs/min-height
       */
      "min-h": [{
        "min-h": ["screen", "lh", "none", ...D()]
      }],
      /**
       * Max-Height
       * @see https://tailwindcss.com/docs/max-height
       */
      "max-h": [{
        "max-h": ["screen", "lh", ...D()]
      }],
      // ------------------
      // --- Typography ---
      // ------------------
      /**
       * Font Size
       * @see https://tailwindcss.com/docs/font-size
       */
      "font-size": [{
        text: ["base", a, ni, tr]
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
        "font-stretch": ["ultra-condensed", "extra-condensed", "condensed", "semi-condensed", "normal", "semi-expanded", "expanded", "extra-expanded", "ultra-expanded", Id, Me]
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
        placeholder: P()
      }],
      /**
       * Text Color
       * @see https://tailwindcss.com/docs/text-color
       */
      "text-color": [{
        text: P()
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
        decoration: [Ze, "from-font", "auto", Ae, tr]
      }],
      /**
       * Text Decoration Color
       * @see https://tailwindcss.com/docs/text-decoration-color
       */
      "text-decoration-color": [{
        decoration: P()
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
        bg: T()
      }],
      /**
       * Background Repeat
       * @see https://tailwindcss.com/docs/background-repeat
       */
      "bg-repeat": [{
        bg: B()
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
        bg: P()
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
        from: P()
      }],
      /**
       * Gradient Color Stops Via
       * @see https://tailwindcss.com/docs/gradient-color-stops
       */
      "gradient-via": [{
        via: P()
      }],
      /**
       * Gradient Color Stops To
       * @see https://tailwindcss.com/docs/gradient-color-stops
       */
      "gradient-to": [{
        to: P()
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
        border: P()
      }],
      /**
       * Border Color Inline
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-x": [{
        "border-x": P()
      }],
      /**
       * Border Color Block
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-y": [{
        "border-y": P()
      }],
      /**
       * Border Color Inline Start
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-s": [{
        "border-s": P()
      }],
      /**
       * Border Color Inline End
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-e": [{
        "border-e": P()
      }],
      /**
       * Border Color Block Start
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-bs": [{
        "border-bs": P()
      }],
      /**
       * Border Color Block End
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-be": [{
        "border-be": P()
      }],
      /**
       * Border Color Top
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-t": [{
        "border-t": P()
      }],
      /**
       * Border Color Right
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-r": [{
        "border-r": P()
      }],
      /**
       * Border Color Bottom
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-b": [{
        "border-b": P()
      }],
      /**
       * Border Color Left
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-l": [{
        "border-l": P()
      }],
      /**
       * Divide Color
       * @see https://tailwindcss.com/docs/divide-color
       */
      "divide-color": [{
        divide: P()
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
        outline: ["", Ze, ni, tr]
      }],
      /**
       * Outline Color
       * @see https://tailwindcss.com/docs/outline-color
       */
      "outline-color": [{
        outline: P()
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
          Fs,
          Xs
        ]
      }],
      /**
       * Box Shadow Color
       * @see https://tailwindcss.com/docs/box-shadow#setting-the-shadow-color
       */
      "shadow-color": [{
        shadow: P()
      }],
      /**
       * Inset Box Shadow
       * @see https://tailwindcss.com/docs/box-shadow#adding-an-inset-shadow
       */
      "inset-shadow": [{
        "inset-shadow": ["none", x, Fs, Xs]
      }],
      /**
       * Inset Box Shadow Color
       * @see https://tailwindcss.com/docs/box-shadow#setting-the-inset-shadow-color
       */
      "inset-shadow-color": [{
        "inset-shadow": P()
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
        ring: P()
      }],
      /**
       * Ring Offset Width
       * @see https://v3.tailwindcss.com/docs/ring-offset-width
       * @deprecated since Tailwind CSS v4.0.0
       * @see https://github.com/tailwindlabs/tailwindcss/blob/v4.0.0/packages/tailwindcss/src/utilities.ts#L4158
       */
      "ring-offset-w": [{
        "ring-offset": [Ze, tr]
      }],
      /**
       * Ring Offset Color
       * @see https://v3.tailwindcss.com/docs/ring-offset-color
       * @deprecated since Tailwind CSS v4.0.0
       * @see https://github.com/tailwindlabs/tailwindcss/blob/v4.0.0/packages/tailwindcss/src/utilities.ts#L4158
       */
      "ring-offset-color": [{
        "ring-offset": P()
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
        "inset-ring": P()
      }],
      /**
       * Text Shadow
       * @see https://tailwindcss.com/docs/text-shadow
       */
      "text-shadow": [{
        "text-shadow": ["none", S, Fs, Xs]
      }],
      /**
       * Text Shadow Color
       * @see https://tailwindcss.com/docs/text-shadow#setting-the-shadow-color
       */
      "text-shadow-color": [{
        "text-shadow": P()
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
        "mask-linear-from": P()
      }],
      "mask-image-linear-to-color": [{
        "mask-linear-to": P()
      }],
      "mask-image-t-from-pos": [{
        "mask-t-from": ge()
      }],
      "mask-image-t-to-pos": [{
        "mask-t-to": ge()
      }],
      "mask-image-t-from-color": [{
        "mask-t-from": P()
      }],
      "mask-image-t-to-color": [{
        "mask-t-to": P()
      }],
      "mask-image-r-from-pos": [{
        "mask-r-from": ge()
      }],
      "mask-image-r-to-pos": [{
        "mask-r-to": ge()
      }],
      "mask-image-r-from-color": [{
        "mask-r-from": P()
      }],
      "mask-image-r-to-color": [{
        "mask-r-to": P()
      }],
      "mask-image-b-from-pos": [{
        "mask-b-from": ge()
      }],
      "mask-image-b-to-pos": [{
        "mask-b-to": ge()
      }],
      "mask-image-b-from-color": [{
        "mask-b-from": P()
      }],
      "mask-image-b-to-color": [{
        "mask-b-to": P()
      }],
      "mask-image-l-from-pos": [{
        "mask-l-from": ge()
      }],
      "mask-image-l-to-pos": [{
        "mask-l-to": ge()
      }],
      "mask-image-l-from-color": [{
        "mask-l-from": P()
      }],
      "mask-image-l-to-color": [{
        "mask-l-to": P()
      }],
      "mask-image-x-from-pos": [{
        "mask-x-from": ge()
      }],
      "mask-image-x-to-pos": [{
        "mask-x-to": ge()
      }],
      "mask-image-x-from-color": [{
        "mask-x-from": P()
      }],
      "mask-image-x-to-color": [{
        "mask-x-to": P()
      }],
      "mask-image-y-from-pos": [{
        "mask-y-from": ge()
      }],
      "mask-image-y-to-pos": [{
        "mask-y-to": ge()
      }],
      "mask-image-y-from-color": [{
        "mask-y-from": P()
      }],
      "mask-image-y-to-color": [{
        "mask-y-to": P()
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
        "mask-radial-from": P()
      }],
      "mask-image-radial-to-color": [{
        "mask-radial-to": P()
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
        "mask-conic-from": P()
      }],
      "mask-image-conic-to-color": [{
        "mask-conic-to": P()
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
        mask: T()
      }],
      /**
       * Mask Repeat
       * @see https://tailwindcss.com/docs/mask-repeat
       */
      "mask-repeat": [{
        mask: B()
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
          Fs,
          Xs
        ]
      }],
      /**
       * Drop Shadow Color
       * @see https://tailwindcss.com/docs/filter-drop-shadow#setting-the-shadow-color
       */
      "drop-shadow-color": [{
        "drop-shadow": P()
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
        "perspective-origin": I()
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
        origin: I()
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
        accent: P()
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
        caret: P()
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
        "scrollbar-thumb": P()
      }],
      /**
       * Scrollbar Track Color
       * @see https://tailwindcss.com/docs/scrollbar-color
       */
      "scrollbar-track-color": [{
        "scrollbar-track": P()
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
        fill: ["none", ...P()]
      }],
      /**
       * Stroke Width
       * @see https://tailwindcss.com/docs/stroke-width
       */
      "stroke-w": [{
        stroke: [Ze, ni, tr, Av]
      }],
      /**
       * Stroke
       * @see https://tailwindcss.com/docs/stroke
       */
      stroke: [{
        stroke: ["none", ...P()]
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
  return qT(qb(n));
}
const XT = ia(
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
function ct({
  className: n,
  variant: o = "default",
  size: a = "default",
  ...i
}) {
  return /* @__PURE__ */ b.jsx(
    eT,
    {
      "data-slot": "button",
      className: Ke(XT({ variant: o, size: a, className: n })),
      ...i
    }
  );
}
function _p(n) {
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
} = FT(), Ic = KT.toLowerCase(), xi = QT.toLowerCase(), Bc = /^i(os$|p)/.test(xi) || xi === "macintel" && ZT > 1, Dv = "android", cp = xi === Dv || Ic.includes(Dv), Hp = !Bc && xi.startsWith("mac");
xi.startsWith("win");
const JT = Hp || Bc, No = typeof CSS < "u" && !!CSS.supports?.("-webkit-backdrop-filter:none");
!No && Ic.includes("firefox");
!No && Ic.includes("chrom");
const $T = JT, Up = /jsdom|happydom/.test(Ic);
function tt(n) {
  return n?.ownerDocument || document;
}
const WT = [];
function Lp(n) {
  y.useEffect(n, WT);
}
const li = 0;
class el {
  static create() {
    return new el();
  }
  currentId = li;
  /**
   * Executes `fn` after `delay`, clearing any previously scheduled call.
   */
  start(o, a) {
    this.clear(), this.currentId = setTimeout(() => {
      this.currentId = li, a();
    }, o);
  }
  isStarted() {
    return this.currentId !== li;
  }
  clear = () => {
    this.currentId !== li && (clearTimeout(this.currentId), this.currentId = li);
  };
  disposeEffect = () => this.clear;
}
function sn() {
  const n = xn(el.create).current;
  return Lp(n.disposeEffect), n;
}
const Ks = null;
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
const Qs = new eR();
class pl {
  static create() {
    return new pl();
  }
  static request(o) {
    return Qs.request(o);
  }
  static cancel(o) {
    return Qs.cancel(o);
  }
  currentId = Ks;
  /**
   * Executes `fn` after `delay`, clearing any previously scheduled call.
   */
  request(o) {
    this.cancel(), this.currentId = Qs.request(() => {
      this.currentId = Ks, o();
    });
  }
  cancel = () => {
    this.currentId !== Ks && (Qs.cancel(this.currentId), this.currentId = Ks);
  };
  disposeEffect = () => this.cancel;
}
function la() {
  const n = xn(pl.create).current;
  return Lp(n.disposeEffect), n;
}
let jv = {}, kv = {}, _v = "";
function tR(n) {
  if (typeof document > "u")
    return !1;
  const o = tt(n);
  return Nt(o).innerWidth - o.documentElement.clientWidth > 0;
}
function nR(n) {
  if (!(typeof CSS < "u" && CSS.supports && CSS.supports("scrollbar-gutter", "stable")) || typeof document > "u")
    return !1;
  const a = tt(n), i = a.documentElement, u = a.body, f = cr(i) ? i : u, p = f.style.overflowY, m = i.style.scrollbarGutter;
  i.style.scrollbarGutter = "stable", f.style.overflowY = "scroll";
  const g = f.offsetWidth;
  f.style.overflowY = "hidden";
  const d = f.offsetWidth;
  return f.style.overflowY = p, i.style.scrollbarGutter = m, g === d;
}
function lR(n) {
  const o = tt(n), a = o.documentElement, i = o.body, u = cr(a) ? a : i, f = {
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
  const o = tt(n), a = o.documentElement, i = o.body, u = Nt(a);
  let f = 0, p = 0, m = !1;
  const g = pl.create();
  if (No && (u.visualViewport?.scale ?? 1) !== 1)
    return () => {
    };
  function d() {
    const C = u.getComputedStyle(a), w = u.getComputedStyle(i), A = (C.scrollbarGutter || "").includes("both-edges") ? "stable both-edges" : "stable";
    f = a.scrollTop, p = a.scrollLeft, jv = {
      scrollbarGutter: a.style.scrollbarGutter,
      overflowY: a.style.overflowY,
      overflowX: a.style.overflowX
    }, _v = a.style.scrollBehavior, kv = {
      position: i.style.position,
      height: i.style.height,
      width: i.style.width,
      boxSizing: i.style.boxSizing,
      overflowY: i.style.overflowY,
      overflowX: i.style.overflowX,
      scrollBehavior: i.style.scrollBehavior
    };
    const O = a.scrollHeight > a.clientHeight, z = a.scrollWidth > a.clientWidth, N = C.overflowY === "scroll" || w.overflowY === "scroll", I = C.overflowX === "scroll" || w.overflowX === "scroll", j = Math.max(0, u.innerWidth - i.clientWidth), L = Math.max(0, u.innerHeight - i.clientHeight), _ = parseFloat(w.marginTop) + parseFloat(w.marginBottom), k = parseFloat(w.marginLeft) + parseFloat(w.marginRight), Y = cr(a) ? a : i;
    if (m = nR(n), m) {
      a.style.scrollbarGutter = A, Y.style.overflowY = "hidden", Y.style.overflowX = "hidden";
      return;
    }
    Object.assign(a.style, {
      scrollbarGutter: A,
      overflowY: "hidden",
      overflowX: "hidden"
    }), (O || N) && (a.style.overflowY = "scroll"), (z || I) && (a.style.overflowX = "scroll"), Object.assign(i.style, {
      position: "relative",
      height: _ || L ? `calc(100dvh - ${_ + L}px)` : "100dvh",
      width: k || j ? `calc(100vw - ${k + j}px)` : "100vw",
      boxSizing: "border-box",
      overflow: "hidden",
      scrollBehavior: "unset"
    }), i.scrollTop = f, i.scrollLeft = p, a.setAttribute("data-base-ui-scroll-locked", ""), a.style.scrollBehavior = "unset";
  }
  function v() {
    Object.assign(a.style, jv), Object.assign(i.style, kv), m || (a.scrollTop = f, a.scrollLeft = p, a.removeAttribute("data-base-ui-scroll-locked"), a.style.scrollBehavior = _v);
  }
  function x() {
    v(), g.request(d);
  }
  d();
  const S = Je(u, "resize", x);
  return () => {
    g.cancel(), v(), typeof u.removeEventListener == "function" && S();
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
    const i = tt(o).documentElement, u = Nt(i).getComputedStyle(i).overflowY;
    if (u === "hidden" || u === "clip") {
      this.restore = an;
      return;
    }
    const f = Bc || !tR(o);
    this.restore = f ? lR(o) : oR(o);
  }
}
const aR = new rR();
function a0(n = !0, o = null) {
  xe(() => {
    if (n)
      return aR.acquire(o);
  }, [n, o]);
}
function dl(n) {
  n.preventDefault(), n.stopPropagation();
}
function iR(n) {
  return "nativeEvent" in n;
}
function Ip(n) {
  return n.pointerType === "" && n.isTrusted ? !0 : cp && n.pointerType ? n.type === "click" && n.buttons === 1 : n.detail === 0 && !n.pointerType;
}
function i0(n) {
  return Up ? !1 : !cp && n.width === 0 && n.height === 0 || cp && n.width === 1 && n.height === 1 && n.pressure === 0 && n.detail === 0 && n.pointerType === "mouse" || // iOS VoiceOver returns 0.333• for width/height.
  n.width < 1 && n.height < 1 && n.pressure === 0 && n.detail === 0 && n.pointerType === "touch";
}
function rr(n, o) {
  const a = ["mouse", "pen"];
  return o || a.push("", void 0), a.includes(n);
}
function sR(n) {
  const o = n.type;
  return o === "click" || o === "mousedown" || o === "keydown" || o === "keyup";
}
const up = "data-base-ui-focusable", s0 = "input:not([type='hidden']):not([disabled]),[contenteditable]:not([contenteditable='false']),textarea:not([disabled])", Vc = "ArrowLeft", Pc = "ArrowRight", c0 = "ArrowUp", Bp = "ArrowDown";
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
  if (a && na(a)) {
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
function xc(n, o) {
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
function Bd(n, o) {
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
function Yc(n) {
  return Ct(n) && n.matches(s0);
}
function uR(n) {
  return n?.closest(`button,a[href],[role="button"],select,[tabindex]:not([tabindex="-1"]),${s0}`) != null;
}
function fp(n) {
  return n ? n.getAttribute("role") === "combobox" && Yc(n) : !1;
}
function fR(n) {
  if (!n || Up)
    return !0;
  try {
    return n.matches(":focus-visible");
  } catch {
    return !0;
  }
}
function Sc(n) {
  return n ? n.hasAttribute(up) ? n : n.querySelector(`[${up}]`) || n : null;
}
function dR(n, o) {
  return o != null && !rr(o) ? 0 : typeof n == "function" ? n() : n;
}
function oa(n, o, a) {
  const i = dR(n, a);
  return typeof i == "number" ? i : i?.[o];
}
function Hv(n) {
  return typeof n == "function" ? n() : n;
}
function u0(n, o) {
  return o || n === "click" || n === "mousedown";
}
function pR(n) {
  return n?.includes("mouse") && n !== "mousedown";
}
const Do = "none", Fl = "trigger-press", Pt = "trigger-hover", Jr = "trigger-focus", Gc = "outside-press", $r = "item-press", f0 = "close-press", Co = "focus-out", Ri = "escape-key", dp = "list-navigation", d0 = "cancel-open", ai = "sibling-open", gR = "disabled", qc = "imperative-action", mR = "window-resize";
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
const p0 = /* @__PURE__ */ y.createContext({
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
  } = n, u = y.useRef(a), f = y.useRef(a), p = y.useRef(null), m = y.useRef(null), g = sn();
  return xe(() => {
    if (f.current = a, !p.current) {
      u.current = a;
      return;
    }
    u.current = {
      open: oa(u.current, "open"),
      close: oa(a, "close")
    };
  }, [a, p, u, f]), /* @__PURE__ */ b.jsx(p0.Provider, {
    value: y.useMemo(() => ({
      hasProvider: !0,
      delayRef: u,
      initialDelayRef: f,
      currentIdRef: p,
      timeoutMs: i,
      currentContextRef: m,
      timeout: g
    }), [i, g]),
    children: o
  });
}
function vR(n, o = {
  open: !1
}) {
  const {
    open: a
  } = o, i = "rootStore" in n ? n.rootStore : n, u = i.useState("floatingId"), f = y.useContext(p0), {
    currentIdRef: p,
    delayRef: m,
    timeoutMs: g,
    initialDelayRef: d,
    currentContextRef: v,
    hasProvider: x,
    timeout: S
  } = f, [C, w] = y.useState(!1), M = y.useRef(a), E = y.useRef(!1);
  return xe(() => {
    M.current = a;
  }, [a]), xe(() => () => {
    E.current = !0;
  }, []), xe(() => {
    function A() {
      E.current || w(!1), v.current?.setIsInstantPhase(!1), p.current = null, v.current = null, m.current = d.current, S.clear();
    }
    if (p.current && !a && p.current === u) {
      if (w(!1), g) {
        const O = u;
        return S.start(g, () => {
          i.select("open") || p.current && p.current !== O || A();
        }), () => {
          (M.current || p.current !== O) && S.clear();
        };
      }
      A();
    }
  }, [a, u, p, m, g, d, v, S, i]), xe(() => {
    if (!a)
      return;
    const A = v.current, O = p.current;
    S.clear(), v.current = {
      onOpenChange: i.setOpen,
      setIsInstantPhase: w
    }, p.current = u, m.current = {
      open: 0,
      close: oa(d.current, "close")
    }, O !== null && O !== u ? (w(!0), A?.setIsInstantPhase(!0), A?.onOpenChange(!1, Ye(Do))) : (w(!1), A?.setIsInstantPhase(!1));
  }, [a, u, i, p, m, d, v, S]), xe(() => () => {
    if (p.current === u) {
      if (v.current = null, !M.current)
        return;
      p.current = null, hR(m, d), S.clear();
    }
  }, [v, p, m, u, d, S]), y.useMemo(() => ({
    hasProvider: x,
    delayRef: m,
    isInstantPhase: C
  }), [x, m, C]);
}
function gl(...n) {
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
const g0 = {
  clipPath: "inset(50%)",
  overflow: "hidden",
  whiteSpace: "nowrap",
  border: 0,
  padding: 0,
  width: 1,
  height: 1,
  margin: -1
}, m0 = {
  ...g0,
  position: "fixed",
  top: 0,
  left: 0
}, xR = {
  ...g0,
  position: "absolute"
}, Oo = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const [i, u] = y.useState();
  xe(() => {
    $T && No && u("button");
  }, []);
  const f = {
    tabIndex: 0,
    // Role is only for VoiceOver
    role: i
  };
  return /* @__PURE__ */ b.jsx("span", {
    ...o,
    ref: a,
    style: m0,
    "aria-hidden": i ? void 0 : !0,
    ...f,
    "data-base-ui-focus-guard": ""
  });
}), SR = ["top", "right", "bottom", "left"], ra = Math.min, Yl = Math.max, wc = Math.round, Zs = Math.floor, Gl = (n) => ({
  x: n,
  y: n
}), wR = {
  left: "right",
  right: "left",
  bottom: "top",
  top: "bottom"
};
function h0(n, o, a) {
  return Yl(n, ra(o, a));
}
function Kl(n, o) {
  return typeof n == "function" ? n(o) : n;
}
function Ln(n) {
  return n.split("-")[0];
}
function jo(n) {
  return n.split("-")[1];
}
function Vp(n) {
  return n === "x" ? "y" : "x";
}
function Pp(n) {
  return n === "y" ? "height" : "width";
}
function Wn(n) {
  const o = n[0];
  return o === "t" || o === "b" ? "y" : "x";
}
function Yp(n) {
  return Vp(Wn(n));
}
function ER(n, o, a) {
  a === void 0 && (a = !1);
  const i = jo(n), u = Yp(n), f = Pp(u);
  let p = u === "x" ? i === (a ? "end" : "start") ? "right" : "left" : i === "start" ? "bottom" : "top";
  return o.reference[f] > o.floating[f] && (p = Ec(p)), [p, Ec(p)];
}
function TR(n) {
  const o = Ec(n);
  return [pp(n), o, pp(o)];
}
function pp(n) {
  return n.includes("start") ? n.replace("start", "end") : n.replace("end", "start");
}
const Uv = ["left", "right"], Lv = ["right", "left"], RR = ["top", "bottom"], CR = ["bottom", "top"];
function OR(n, o, a) {
  switch (n) {
    case "top":
    case "bottom":
      return a ? o ? Lv : Uv : o ? Uv : Lv;
    case "left":
    case "right":
      return o ? RR : CR;
    default:
      return [];
  }
}
function MR(n, o, a, i) {
  const u = jo(n);
  let f = OR(Ln(n), a === "start", i);
  return u && (f = f.map((p) => p + "-" + u), o && (f = f.concat(f.map(pp)))), f;
}
function Ec(n) {
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
function y0(n) {
  return typeof n != "number" ? AR(n) : {
    top: n,
    right: n,
    bottom: n,
    left: n
  };
}
function Si(n) {
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
function di(n, o) {
  return o < 0 || o >= n.length;
}
function dc(n, o) {
  return Vl(n.current, {
    disabledIndices: o
  });
}
function gp(n, o) {
  return Vl(n.current, {
    decrement: !0,
    startingIndex: n.current.length,
    disabledIndices: o
  });
}
function Vl(n, {
  startingIndex: o = -1,
  decrement: a = !1,
  disabledIndices: i,
  amount: u = 1
} = {}) {
  let f = o;
  do
    f += a ? -u : u;
  while (f >= 0 && f <= n.length - 1 && Tc(n, f, i));
  return f;
}
function Tc(n, o, a) {
  if (typeof a == "function" ? a(o) : a?.includes(o) ?? !1)
    return !0;
  const u = n[o];
  return u ? Xc(u) ? !a && (u.hasAttribute("disabled") || u.getAttribute("aria-disabled") === "true") : !0 : !1;
}
function zR(n) {
  return n.visibility === "hidden" || n.visibility === "collapse";
}
function Xc(n, o = n ? In(n) : null) {
  return !n || !n.isConnected || !o || zR(o) ? !1 : typeof n.checkVisibility == "function" ? n.checkVisibility() : o.display !== "none" && o.display !== "contents";
}
const NR = 'a[href],button,input,select,textarea,summary,details,iframe,object,embed,[tabindex],[contenteditable]:not([contenteditable="false"]),audio[controls],video[controls]';
function DR(n) {
  const o = n.assignedSlot;
  if (o)
    return o;
  if (n.parentElement)
    return n.parentElement;
  const a = n.getRootNode();
  return na(a) ? a.host : null;
}
function mp(n) {
  for (const o of Array.from(n.children))
    if (mn(o) === "summary")
      return o;
  return null;
}
function jR(n, o) {
  const a = mp(o);
  return !!a && (n === a || Le(a, n));
}
function v0(n) {
  const o = n ? mn(n) : "";
  return n != null && n.matches(NR) && (o !== "summary" || n.parentElement != null && mn(n.parentElement) === "details" && mp(n.parentElement) === n) && (o !== "details" || mp(n) == null) && (o !== "input" || n.type !== "hidden");
}
function b0(n) {
  if (!v0(n) || !n.isConnected || n.matches(":disabled"))
    return !1;
  for (let o = n; o; o = DR(o)) {
    const a = o !== n, i = mn(o) === "slot";
    if (o.hasAttribute("inert") || a && mn(o) === "details" && !o.open && !jR(n, o) || o.hasAttribute("hidden") || !i && !kR(o, a))
      return !1;
  }
  return !0;
}
function kR(n, o) {
  const a = In(n);
  return o ? a.display !== "none" : Xc(n, a);
}
function x0(n) {
  const o = n.tabIndex;
  if (o < 0) {
    const a = mn(n);
    if (a === "details" || a === "audio" || a === "video" || Ct(n) && n.isContentEditable)
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
function _R(n, o) {
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
function S0(n) {
  if (Ct(n) && mn(n) === "slot") {
    const o = n.assignedElements({
      flatten: !0
    });
    if (o.length > 0)
      return o;
  }
  return Ct(n) && n.shadowRoot ? Array.from(n.shadowRoot.children) : Array.from(n.children);
}
function w0(n, o) {
  S0(n).forEach((a) => {
    v0(a) && o.push(a), w0(a, o);
  });
}
function E0(n, o, a) {
  S0(n).forEach((i) => {
    Ct(i) && i.matches(o) && a.push(i), E0(i, o, a);
  });
}
function Gp(n) {
  return b0(n) && x0(n) >= 0;
}
function T0(n) {
  const o = [];
  return w0(n, o), o.filter(b0);
}
function Ci(n) {
  const o = T0(n);
  return o.filter((a) => x0(a) >= 0 && _R(a, o));
}
function R0(n, o) {
  const a = Ci(n), i = a.length;
  if (i === 0)
    return;
  const u = vn(tt(n)), f = a.indexOf(u), p = f === -1 ? o === 1 ? 0 : i - 1 : f + o;
  return a[p];
}
function qp(n) {
  return R0(tt(n).body, 1) || n;
}
function C0(n) {
  return R0(tt(n).body, -1) || n;
}
function O0(n, o) {
  if (!n)
    return null;
  const a = Ci(tt(n).body), i = a.length;
  if (i === 0)
    return null;
  const u = a.indexOf(n);
  if (u === -1)
    return null;
  const f = (u + o + i) % i;
  return a[f];
}
function HR(n) {
  return O0(n, 1);
}
function UR(n) {
  return O0(n, -1);
}
function Wr(n, o) {
  const a = o || n.currentTarget, i = n.relatedTarget;
  return !i || !Le(a, i);
}
function LR(n) {
  Ci(n).forEach((a) => {
    a.dataset.tabindex = a.getAttribute("tabindex") || "", a.setAttribute("tabindex", "-1");
  });
}
function Iv(n) {
  const o = [];
  E0(n, "[data-tabindex]", o), o.forEach((a) => {
    const i = a.dataset.tabindex;
    delete a.dataset.tabindex, i ? a.setAttribute("tabindex", i) : a.removeAttribute("tabindex");
  });
}
function Mo(n, o, a = !0) {
  return n.filter((u) => u.parentId === o).flatMap((u) => [...!a || u.context?.open ? [u] : [], ...Mo(n, u.id, a)]);
}
function Bv(n, o) {
  let a = [], i = n.find((u) => u.id === o)?.parentId;
  for (; i; ) {
    const u = n.find((f) => f.id === i);
    i = u?.parentId, u && (a = a.concat(u));
  }
  return a;
}
function wi(n) {
  return `data-base-ui-${n}`;
}
let Js = 0;
function pc(n, o = {}) {
  const {
    preventScroll: a = !1,
    sync: i = !1,
    shouldFocus: u
  } = o;
  cancelAnimationFrame(Js);
  function f() {
    u && !u() || n?.focus({
      preventScroll: a
    });
  }
  if (i)
    return f(), an;
  const p = requestAnimationFrame(f);
  return Js = p, () => {
    Js === p && (cancelAnimationFrame(p), Js = 0);
  };
}
const Pd = {
  inert: /* @__PURE__ */ new WeakMap(),
  "aria-hidden": /* @__PURE__ */ new WeakMap()
}, Vv = "data-base-ui-inert", hp = {
  inert: /* @__PURE__ */ new WeakSet(),
  "aria-hidden": /* @__PURE__ */ new WeakSet()
};
let oi = /* @__PURE__ */ new WeakMap(), Yd = 0;
function IR(n) {
  return hp[n];
}
function M0(n) {
  return n ? na(n) ? n.host : M0(n.parentNode) : null;
}
const Pv = (n, o) => o.map((a) => {
  if (n.contains(a))
    return a;
  const i = M0(a);
  return n.contains(i) ? i : null;
}).filter((a) => a != null), Yv = (n) => {
  const o = /* @__PURE__ */ new Set();
  return n.forEach((a) => {
    let i = a;
    for (; i && !o.has(i); )
      o.add(i), i = i.parentNode;
  }), o;
}, Gv = (n, o, a) => {
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
  let p = null, m = null;
  const g = Pv(o, n), d = u ? Gv(o, Yv(g), new Set(g)) : [], v = [], x = [];
  if (f) {
    const S = Pd[f], C = IR(f);
    m = C, p = S;
    const w = Pv(o, Array.from(o.querySelectorAll("[aria-live]"))), M = g.concat(w);
    Gv(o, Yv(M), new Set(M)).forEach((A) => {
      const O = A.getAttribute(f), z = O !== null && O !== "false", N = (S.get(A) || 0) + 1;
      S.set(A, N), v.push(A), N === 1 && z && C.add(A), z || A.setAttribute(f, f === "inert" ? "" : "true");
    });
  }
  return u && d.forEach((S) => {
    const C = (oi.get(S) || 0) + 1;
    oi.set(S, C), x.push(S), C === 1 && S.setAttribute(Vv, "");
  }), Yd += 1, () => {
    p && v.forEach((S) => {
      const w = (p.get(S) || 0) - 1;
      p.set(S, w), w || (!m?.has(S) && f && S.removeAttribute(f), m?.delete(S));
    }), u && x.forEach((S) => {
      const C = (oi.get(S) || 0) - 1;
      oi.set(S, C), C || S.removeAttribute(Vv);
    }), Yd -= 1, Yd || (Pd.inert = /* @__PURE__ */ new WeakMap(), Pd["aria-hidden"] = /* @__PURE__ */ new WeakMap(), hp.inert = /* @__PURE__ */ new WeakSet(), hp["aria-hidden"] = /* @__PURE__ */ new WeakSet(), oi = /* @__PURE__ */ new WeakMap());
  };
}
function qv(n, o = {}) {
  const {
    ariaHidden: a = !1,
    inert: i = !1,
    mark: u = !0
  } = o, f = tt(n[0]).body;
  return BR(n, f, a, i, {
    mark: u
  });
}
var ml = zb();
let Xv = 0;
function VR(n, o = "mui") {
  const [a, i] = y.useState(n), u = n || a;
  return y.useEffect(() => {
    a == null && (Xv += 1, i(`${o}-${Xv}`));
  }, [a, o]), u;
}
const Fv = Mp.useId;
function ar(n, o) {
  if (Fv !== void 0) {
    const a = Fv();
    return n ?? (o ? `${o}-${a}` : a);
  }
  return VR(n, o);
}
const PR = 500, A0 = 500, YR = {
  style: {
    transition: "none"
  }
}, z0 = "data-base-ui-click-trigger", N0 = {
  fallbackAxisSide: "none"
}, Xp = {
  fallbackAxisSide: "end"
}, GR = {
  clipPath: "inset(50%)",
  position: "fixed",
  top: 0,
  left: 0
}, D0 = /* @__PURE__ */ y.createContext(null), j0 = () => y.useContext(D0), qR = wi("portal");
function k0(n = {}) {
  const {
    ref: o,
    container: a,
    componentProps: i = xt,
    elementProps: u
  } = n, f = ar(), m = j0()?.portalNode, [g, d] = y.useState(null), [v, x] = y.useState(null), S = ze((E) => {
    E !== null && x(E);
  }), C = y.useRef(null);
  xe(() => {
    if (a === null) {
      C.current && (C.current = null, x(null), d(null));
      return;
    }
    if (f == null)
      return;
    const E = (a && (Rp(a) ? a : a.current)) ?? m ?? document.body;
    if (E == null) {
      C.current && (C.current = null, x(null), d(null));
      return;
    }
    C.current !== E && (C.current = E, x(null), d(E));
  }, [a, m, f]);
  const w = nt("div", i, {
    ref: [o, S],
    props: [{
      id: f,
      [qR]: ""
    }, u]
  });
  return {
    portalNode: v,
    portalSubtree: g && w ? /* @__PURE__ */ ml.createPortal(w, g) : null
  };
}
const Fc = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    children: p,
    container: m,
    renderGuards: g,
    ...d
  } = o, {
    portalNode: v,
    portalSubtree: x
  } = k0({
    container: m,
    ref: a,
    componentProps: o,
    elementProps: d
  }), S = y.useRef(null), C = y.useRef(null), w = y.useRef(null), M = y.useRef(null), [E, A] = y.useState(null), O = y.useRef(!1), z = E?.modal, N = E?.open, I = typeof g == "boolean" ? g : !!E && !E.modal && E.open && !!v;
  y.useEffect(() => {
    if (!v || z)
      return;
    function L(_) {
      v && _.relatedTarget && Wr(_) && (_.type === "focusin" ? O.current && (Iv(v), O.current = !1) : (LR(v), O.current = !0));
    }
    return gl(Je(v, "focusin", L, !0), Je(v, "focusout", L, !0));
  }, [v, z]), xe(() => {
    !v || N !== !0 || !O.current || (Iv(v), O.current = !1);
  }, [N, v]);
  const j = y.useMemo(() => ({
    beforeOutsideRef: S,
    afterOutsideRef: C,
    beforeInsideRef: w,
    afterInsideRef: M,
    portalNode: v,
    setFocusManagerState: A
  }), [v]);
  return /* @__PURE__ */ b.jsxs(y.Fragment, {
    children: [x, /* @__PURE__ */ b.jsxs(D0.Provider, {
      value: j,
      children: [I && v && /* @__PURE__ */ b.jsx(Oo, {
        "data-type": "outside",
        ref: S,
        onFocus: (L) => {
          if (Wr(L, v))
            w.current?.focus();
          else {
            const _ = E ? E.domReference : null;
            C0(_)?.focus();
          }
        }
      }), I && v && /* @__PURE__ */ b.jsx("span", {
        "aria-owns": v.id,
        style: GR
      }), v && /* @__PURE__ */ ml.createPortal(p, v), I && v && /* @__PURE__ */ b.jsx(Oo, {
        "data-type": "outside",
        ref: C,
        onFocus: (L) => {
          if (Wr(L, v))
            M.current?.focus();
          else {
            const _ = E ? E.domReference : null;
            qp(_)?.focus(), E?.closeOnFocusOut && E?.onOpenChange(!1, Ye(Co, L.nativeEvent));
          }
        }
      })]
    })]
  });
});
function _0() {
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
class Fp {
  nodesRef = {
    current: []
  };
  events = _0();
  addNode(o) {
    this.nodesRef.current.push(o);
  }
  removeNode(o) {
    const a = this.nodesRef.current.findIndex((i) => i === o);
    a !== -1 && this.nodesRef.current.splice(a, 1);
  }
}
const H0 = /* @__PURE__ */ y.createContext(null), U0 = /* @__PURE__ */ y.createContext(null), Zl = () => y.useContext(H0)?.id || null, ko = (n) => {
  const o = y.useContext(U0);
  return n ?? o;
};
function Kp(n) {
  const o = ar(), a = ko(n), i = Zl();
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
function L0(n) {
  const {
    children: o,
    id: a
  } = n, i = Zl();
  return /* @__PURE__ */ b.jsx(H0.Provider, {
    value: y.useMemo(() => ({
      id: a,
      parentId: i
    }), [a, i]),
    children: o
  });
}
function I0(n) {
  const {
    children: o,
    externalTree: a
  } = n, i = xn(() => a ?? new Fp()).current;
  return /* @__PURE__ */ b.jsx(U0.Provider, {
    value: i,
    children: o
  });
}
function Il(n) {
  return n == null ? n : "current" in n ? n.current : n;
}
function XR(n, o) {
  const a = Nt(gn(n));
  return n instanceof a.KeyboardEvent ? "keyboard" : n instanceof a.FocusEvent ? o || "keyboard" : "pointerType" in n ? n.pointerType || "keyboard" : "touches" in n ? "touch" : n instanceof a.MouseEvent ? o || (n.detail === 0 ? "keyboard" : "mouse") : "";
}
const Kv = 20;
let To = [];
function Qp() {
  To = To.filter((n) => n.deref()?.isConnected);
}
function Qv(n) {
  Qp(), n && mn(n) !== "body" && (To.push(new WeakRef(n)), To.length > Kv && (To = To.slice(-Kv)));
}
function Zv() {
  return Qp(), To[To.length - 1]?.deref();
}
function FR(n) {
  return n ? Gp(n) ? n : Ci(n)[0] || n : null;
}
function Jv(n) {
  if (n.hasAttribute("tabindex") && !n.hasAttribute("data-tabindex") || !n.getAttribute("role")?.includes("dialog"))
    return;
  const a = T0(n).filter((u) => {
    const f = u.getAttribute("data-tabindex") || "";
    return Gp(u) || u.hasAttribute("data-tabindex") && !f.startsWith("-");
  }), i = n.getAttribute("tabindex");
  a.length === 0 ? i !== "0" && (n.setAttribute("tabindex", "0"), n.setAttribute("data-tabindex", "0")) : (i !== "-1" || n.hasAttribute("data-tabindex") && n.getAttribute("data-tabindex") !== "-1") && (n.setAttribute("tabindex", "-1"), n.setAttribute("data-tabindex", "-1"));
}
function Kc(n) {
  const {
    context: o,
    children: a,
    disabled: i = !1,
    initialFocus: u = !0,
    returnFocus: f = !0,
    restoreFocus: p = !1,
    modal: m = !0,
    closeOnFocusOut: g = !0,
    openInteractionType: d = "",
    nextFocusableElement: v,
    previousFocusableElement: x,
    beforeContentFocusGuardRef: S,
    externalTree: C,
    getInsideElements: w
  } = n, M = "rootStore" in o ? o.rootStore : o, E = M.useState("open"), A = M.useState("domReferenceElement"), O = M.useState("floatingElement"), {
    events: z,
    dataRef: N
  } = M.context, I = ze(() => N.current.floatingContext?.nodeId), j = u === !1, L = fp(A) && j, _ = Yt(u), k = Yt(f), Y = Yt(d), te = Yt(E), F = ko(C), Q = j0(), Z = y.useRef(!1), q = y.useRef(!1), H = y.useRef(!1), D = y.useRef(null), U = y.useRef(""), X = y.useRef(""), P = y.useRef(null), T = y.useRef(null), B = Ro(P, S, Q?.beforeInsideRef), ne = Ro(T, Q?.afterInsideRef), J = sn(), re = sn(), ie = la(), oe = Q != null, se = Sc(O), ge = ze((fe = se) => fe ? Ci(fe) : []), je = ze(() => w?.().filter((fe) => fe != null) ?? []);
  y.useEffect(() => {
    if (i || !m)
      return;
    function fe(Re) {
      Re.key === "Tab" && Le(se, vn(tt(se))) && ge().length === 0 && !L && dl(Re);
    }
    const ye = tt(se);
    return Je(ye, "keydown", fe);
  }, [i, se, m, L, ge]), y.useEffect(() => {
    if (i || !E)
      return;
    const fe = tt(se);
    function ye() {
      H.current = !1;
    }
    function Re(ke) {
      const we = gn(ke), Ce = je(), he = Le(O, we) || Le(A, we) || Le(Q?.portalNode, we) || Ce.some((Se) => Se === we || Le(Se, we));
      H.current = !he, X.current = ke.pointerType || "keyboard", we?.closest(`[${z0}]`) && (q.current = !0, re.start(0, () => {
        q.current = !1;
      }));
    }
    function _e() {
      X.current = "keyboard";
    }
    return gl(
      Je(fe, "pointerdown", Re, !0),
      Je(fe, "pointerup", ye, !0),
      Je(fe, "pointercancel", ye, !0),
      Je(fe, "keydown", _e, !0),
      // Avoid a stale `true` leaking into the next open (e.g. keep-mounted popups)
      // if the popup dismissed between pointerdown and pointerup.
      ye
    );
  }, [i, O, A, se, E, Q, re, je]), y.useEffect(() => {
    if (i || !g)
      return;
    const fe = tt(se);
    function ye() {
      q.current = !0, re.start(0, () => {
        q.current = !1;
      });
    }
    function Re(Ce) {
      const he = gn(Ce);
      Gp(he) && (D.current = he);
    }
    function _e(Ce) {
      const he = Ce.relatedTarget, Se = Ce.currentTarget, Te = gn(Ce);
      m && he == null && Te != null && Le(O, Te) && Qv(Te), queueMicrotask(() => {
        const Oe = I(), He = M.context.triggerElements, ae = je(), pe = he?.hasAttribute(wi("focus-guard")) && [P.current, T.current, Q?.beforeInsideRef.current, Q?.afterInsideRef.current, Q?.beforeOutsideRef.current, Q?.afterOutsideRef.current, Il(x), Il(v)].includes(he), Ue = !(Le(A, he) || Le(O, he) || Le(he, O) || Le(Q?.portalNode, he) || ae.some((ve) => ve === he || Le(ve, he)) || he != null && He.hasElement(he) || He.hasMatchingElement((ve) => Le(ve, he)) || pe || F && (Mo(F.nodesRef.current, Oe).find((ve) => Le(ve.context?.elements.floating, he) || Le(ve.context?.elements.domReference, he)) || Bv(F.nodesRef.current, Oe).find((ve) => [ve.context?.elements.floating, Sc(ve.context?.elements.floating)].includes(he) || ve.context?.elements.domReference === he)));
        if (Se === A && se && Jv(se), p && Se !== A && !Xc(Te) && vn(fe) === fe.body) {
          if (Ct(se) && (se.focus(), p === "popup")) {
            ie.request(() => {
              se.focus();
            });
            return;
          }
          const ve = ge(), be = D.current, We = (be && ve.includes(be) ? be : null) || ve[ve.length - 1] || se;
          Ct(We) && We.focus();
        }
        if (N.current.insideReactTree) {
          N.current.insideReactTree = !1;
          return;
        }
        (L || !m) && he && Ue && !q.current && // Fix React 18 Strict Mode returnFocus due to double rendering.
        // For an "untrapped" typeable combobox (input role=combobox with
        // initialFocus=false), re-opening the popup and tabbing out should still close it even
        // when the previously focused element (e.g. the next tabbable outside the popup) is
        // focused again. Otherwise, the popup remains open on the second Tab sequence:
        // click input -> Tab (closes) -> click input -> Tab.
        // Allow closing when `isUntrappedTypeableCombobox` regardless of the previously focused element.
        (L || he !== Zv()) && (Z.current = !0, M.setOpen(!1, Ye(Co, Ce)));
      });
    }
    function ke() {
      H.current || (N.current.insideReactTree = !0, J.start(0, () => {
        N.current.insideReactTree = !1;
      }));
    }
    const we = Ct(A) ? A : null;
    if (!(!O && !we))
      return gl(we && Je(we, "focusout", _e), we && Je(we, "pointerdown", ye), O && Je(O, "focusin", Re), O && Je(O, "focusout", _e), O && Q && Je(O, "focusout", ke, !0));
  }, [i, A, O, se, m, F, Q, M, g, p, ge, L, I, N, J, re, ie, v, x, je]), y.useEffect(() => {
    if (i || !O || !E)
      return;
    const fe = Array.from(Q?.portalNode?.querySelectorAll(`[${wi("portal")}]`) || []), Re = (F ? Bv(F.nodesRef.current, I()) : []).find((Se) => fp(Se.context?.elements.domReference || null))?.context?.elements.domReference, ke = [...[O, ...fe, P.current, T.current, Q?.beforeOutsideRef.current, Q?.afterOutsideRef.current, ...je()], Re, Il(x), Il(v), L ? A : null].filter((Se) => Se != null), we = qv(ke, {
      ariaHidden: m || L,
      mark: !1
    }), Ce = [O, ...fe].filter((Se) => Se != null), he = qv(Ce);
    return () => {
      he(), we();
    };
  }, [E, i, A, O, m, Q, L, F, I, v, x, je]), xe(() => {
    if (!E || i || !Ct(se))
      return;
    const fe = tt(se), ye = vn(fe);
    queueMicrotask(() => {
      const Re = _.current, _e = typeof Re == "function" ? Re(Y.current || "") : Re;
      if (_e === void 0 || _e === !1 || Le(se, ye))
        return;
      let we = null;
      const Ce = () => (we == null && (we = ge(se)), we[0] || se);
      let he;
      _e === !0 || _e === null ? he = Ce() : he = Il(_e), he = he || Ce();
      const Se = Le(se, vn(fe));
      pc(he, {
        preventScroll: he === se,
        shouldFocus() {
          if (!te.current)
            return !1;
          if (Se)
            return !0;
          const Te = vn(fe);
          return !(Te !== he && Le(se, Te));
        }
      });
    });
  }, [i, E, se, ge, _, Y, te]), xe(() => {
    if (i || !se)
      return;
    const fe = tt(se), ye = vn(fe), Re = Y.current == null;
    Qv(ye);
    function _e(we) {
      if (we.open || (U.current = XR(we.nativeEvent, X.current)), we.reason === Pt && we.nativeEvent.type === "mouseleave" && (Z.current = !0), we.reason === Gc)
        if (we.nested)
          Z.current = !1;
        else if (Ip(we.nativeEvent) || i0(we.nativeEvent))
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
      const we = k.current;
      let Ce = typeof we == "function" ? we(U.current) : we;
      if (Ce === void 0 || Ce === !1)
        return null;
      Ce === null && (Ce = !0);
      const he = A?.isConnected ? A : null, Se = ye?.isConnected && mn(ye) !== "body" ? ye : null;
      let Te = Re ? Se || he : he || Se;
      return Te || (Te = Zv() || null), typeof Ce == "boolean" ? Te : Il(Ce) || Te || null;
    }
    return () => {
      z.off("openchange", _e);
      const we = vn(fe), Ce = je(), he = Le(O, we) || Ce.some((Oe) => Oe === we || Le(Oe, we)) || F && Mo(F.nodesRef.current, I(), !1).some((Oe) => Le(Oe.context?.elements.floating, we)), Se = k.current, Te = ke();
      queueMicrotask(() => {
        const Oe = FR(Te), He = typeof Se != "boolean";
        Se && !Z.current && Ct(Oe) && // If the focus moved somewhere else after mount, avoid returning focus
        // since it likely entered a different element which should be
        // respected: https://github.com/floating-ui/floating-ui/issues/2607
        (!(!He && Oe !== we && we !== fe.body) || he) && Oe.focus({
          preventScroll: !0
        }), Z.current = !1;
      });
    };
  }, [i, O, se, k, Y, z, F, A, I, je]), xe(() => {
    if (!No || E || !O)
      return;
    const fe = vn(tt(O));
    !Ct(fe) || !Yc(fe) || Le(O, fe) && fe.blur();
  }, [E, O]), xe(() => {
    if (!(i || !Q))
      return Q.setFocusManagerState({
        modal: m,
        closeOnFocusOut: g,
        open: E,
        onOpenChange: M.setOpen,
        domReference: A
      }), () => {
        Q.setFocusManagerState(null);
      };
  }, [i, Q, m, E, M, g, A]), xe(() => {
    if (!(i || !se))
      return Jv(se), () => {
        queueMicrotask(Qp);
      };
  }, [i, se]);
  const Ee = !i && (m ? !L : !0) && (oe || m);
  return /* @__PURE__ */ b.jsxs(y.Fragment, {
    children: [Ee && /* @__PURE__ */ b.jsx(Oo, {
      "data-type": "inside",
      ref: B,
      onFocus: (fe) => {
        if (m) {
          const ye = ge();
          pc(ye[ye.length - 1]);
        } else Q?.portalNode && (Z.current = !1, Wr(fe, Q.portalNode) ? qp(A)?.focus() : Il(x ?? Q.beforeOutsideRef)?.focus());
      }
    }), a, Ee && /* @__PURE__ */ b.jsx(Oo, {
      "data-type": "inside",
      ref: ne,
      onFocus: (fe) => {
        m ? pc(ge()[0]) : Q?.portalNode && (g && (Z.current = !0), Wr(fe, Q.portalNode) ? C0(A)?.focus() : Il(v ?? Q.afterOutsideRef)?.focus());
      }
    })]
  });
}
function Qc(n, o = {}) {
  const {
    enabled: a = !0,
    event: i = "click",
    toggle: u = !0,
    ignoreMouse: f = !1,
    stickIfOpen: p = !0,
    touchOpenDelay: m = 0,
    reason: g = Fl
  } = o, d = "rootStore" in n ? n.rootStore : n, v = d.context.dataRef, x = y.useRef(void 0), S = la(), C = sn(), w = y.useMemo(() => {
    function M(A, O, z, N) {
      const I = Ye(g, O, z);
      A && N === "touch" && m > 0 ? C.start(m, () => {
        d.setOpen(!0, I);
      }) : d.setOpen(A, I);
    }
    function E(A, O, z) {
      const N = v.current.openEvent, I = d.select("domReferenceElement") !== O;
      return A && I || !A || !u ? !0 : N && p ? !z(N.type) : !1;
    }
    return {
      onPointerDown(A) {
        x.current = A.pointerType;
      },
      onMouseDown(A) {
        const O = x.current, z = A.nativeEvent, N = d.select("open");
        if (A.button !== 0 || i === "click" || rr(O, !0) && f)
          return;
        const I = E(N, A.currentTarget, (_) => _ === "click" || _ === "mousedown"), j = gn(z);
        if (Yc(j)) {
          M(I, z, j, O);
          return;
        }
        const L = A.currentTarget;
        S.request(() => {
          M(I, z, L, O);
        });
      },
      onClick(A) {
        if (i === "mousedown-only")
          return;
        const O = x.current;
        if (i === "mousedown" && O) {
          x.current = void 0;
          return;
        }
        if (rr(O, !0) && f)
          return;
        const z = d.select("open"), N = E(z, A.currentTarget, (I) => I === "click" || I === "mousedown" || I === "keydown" || I === "keyup");
        M(N, A.nativeEvent, A.currentTarget, O);
      },
      onKeyDown() {
        x.current = void 0;
      }
    };
  }, [v, i, f, g, d, p, u, S, C, m]);
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
      }, p = o.axis === "x" || o.axis === "both", m = o.axis === "y" || o.axis === "both", g = ["mouseenter", "mousemove"].includes(o.dataRef.current.openEvent?.type || "") && o.pointerType !== "touch";
      let d = f.width, v = f.height, x = f.x, S = f.y;
      return a == null && o.x && p && (a = f.x - o.x), i == null && o.y && m && (i = f.y - o.y), x -= a || 0, S -= i || 0, d = 0, v = 0, !u || g ? (d = o.axis === "y" ? f.width : 0, v = o.axis === "x" ? f.height : 0, x = p && o.x != null ? o.x : x, S = m && o.y != null ? o.y : S) : u && !g && (v = o.axis === "x" ? f.height : v, d = o.axis === "y" ? f.width : d), u = !0, {
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
function $v(n) {
  return n != null && n.clientX != null;
}
function QR(n, o = {}) {
  const {
    enabled: a = !0,
    axis: i = "both"
  } = o, u = "rootStore" in n ? n.rootStore : n, f = u.useState("open"), p = u.useState("floatingElement"), m = u.useState("domReferenceElement"), g = u.context.dataRef, d = y.useRef(!1), v = y.useRef(null), [x, S] = y.useState(), [C, w] = y.useState([]), M = ze((N) => {
    u.set("positionReference", N);
  }), E = ze((N, I, j) => {
    d.current || g.current.openEvent && !$v(g.current.openEvent) || u.set("positionReference", KR(j ?? m, {
      x: N,
      y: I,
      axis: i,
      dataRef: g,
      pointerType: x
    }));
  }), A = ze((N) => {
    f ? v.current || (E(N.clientX, N.clientY, N.currentTarget), w([])) : E(N.clientX, N.clientY, N.currentTarget);
  }), O = rr(x) ? p : f;
  y.useEffect(() => {
    if (!a) {
      M(m);
      return;
    }
    if (!O)
      return;
    function N() {
      v.current?.(), v.current = null;
    }
    const I = Nt(p);
    function j(L) {
      const _ = gn(L);
      Le(p, _) ? N() : E(L.clientX, L.clientY);
    }
    return !g.current.openEvent || $v(g.current.openEvent) ? v.current = Je(I, "mousemove", j) : M(m), N;
  }, [O, a, p, g, m, u, E, M, C]), y.useEffect(() => () => {
    u.set("positionReference", null);
  }, [u]), y.useEffect(() => {
    a && !p && (d.current = !1);
  }, [a, p]), y.useEffect(() => {
    !a && f && (d.current = !0);
  }, [a, f]);
  const z = y.useMemo(() => {
    function N(I) {
      S(I.pointerType);
    }
    return {
      onPointerDown: N,
      onPointerEnter: N,
      onMouseMove: A,
      onMouseEnter: A
    };
  }, [A]);
  return y.useMemo(() => a ? {
    reference: z,
    trigger: z
  } : {}, [a, z]);
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
function Oi(n, o = {}) {
  const {
    enabled: a = !0,
    escapeKey: i = !0,
    outsidePress: u = !0,
    outsidePressEvent: f = "sloppy",
    referencePress: p = ZR,
    bubbles: m,
    externalTree: g
  } = o, d = "rootStore" in n ? n.rootStore : n, v = d.useState("open"), x = d.useState("floatingElement"), {
    dataRef: S
  } = d.context, C = ko(g), w = ze(typeof u == "function" ? u : () => !1), M = typeof u == "function" ? w : u, E = M !== !1, A = ze(() => f), {
    escapeKey: O,
    outsidePress: z
  } = JR(m), N = y.useRef(!1), I = y.useRef(!1), j = y.useRef(!1), L = y.useRef(!1), _ = y.useRef(""), k = y.useRef(null), Y = sn(), te = sn(), F = ze(() => {
    te.clear(), S.current.insideReactTree = !1;
  }), Q = ze((B) => {
    const ne = S.current.floatingContext?.nodeId;
    return (C ? Mo(C.nodesRef.current, ne) : []).some((re) => re.context?.open && !re.context.dataRef.current[B]);
  }), Z = ze((B) => Bd(B, d.select("floatingElement")) || Bd(B, d.select("domReferenceElement"))), q = ze((B) => {
    p() && d.setOpen(!1, Ye(Fl, B.nativeEvent));
  }), H = ze((B) => {
    if (!v || !a || !i || B.key !== "Escape" || L.current || !O && Q("__escapeKeyBubbles"))
      return;
    const ne = iR(B) ? B.nativeEvent : B, J = Ye(Ri, ne);
    d.setOpen(!1, J), J.isCanceled || B.preventDefault(), !O && !J.isPropagationAllowed && B.stopPropagation();
  }), D = ze(() => {
    S.current.insideReactTree = !0, te.start(0, F);
  }), U = ze((B) => {
    if (!v || !a || B.button !== 0)
      return;
    const ne = gn(B.nativeEvent);
    Le(d.select("floatingElement"), ne) && (N.current || (N.current = !0, I.current = !1));
  }), X = ze((B) => {
    !v || !a || (B.defaultPrevented || B.nativeEvent.defaultPrevented) && N.current && (I.current = !0);
  });
  y.useEffect(() => {
    if (!v || !a)
      return;
    S.current.__escapeKeyBubbles = O, S.current.__outsidePressBubbles = z;
    const B = new el(), ne = new el();
    function J() {
      B.clear(), L.current = !0;
    }
    function re() {
      B.start(
        // 0ms or 1ms don't work in Safari. 5ms appears to consistently work.
        // Only apply to WebKit for the test to remain 0ms.
        No ? 5 : 0,
        () => {
          L.current = !1;
        }
      );
    }
    function ie() {
      j.current = !0, ne.start(0, () => {
        j.current = !1;
      });
    }
    function oe() {
      N.current = !1, I.current = !1;
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
      const pe = S.current.floatingContext?.nodeId, Ue = C && Mo(C.nodesRef.current, pe).some((ve) => Bd(ae, ve.context?.elements.floating));
      return Z(ae) || Ue;
    }
    function Ee(ae) {
      if (ge(ae)) {
        ae.type !== "click" && !Z(ae) && (ne.clear(), j.current = !1), F();
        return;
      }
      if (S.current.insideReactTree) {
        F();
        return;
      }
      const pe = gn(ae), Ue = `[${wi("inert")}]`, ve = $e(pe) ? pe.getRootNode() : null, be = Array.from((na(ve) ? ve : tt(d.select("floatingElement"))).querySelectorAll(Ue)), We = d.context.triggerElements;
      if (pe && (We.hasElement(pe) || We.hasMatchingElement((mt) => Le(mt, pe))))
        return;
      let rt = $e(pe) ? pe : null;
      for (; rt && !Pl(rt); ) {
        const mt = ql(rt);
        if (Pl(mt) || !$e(mt))
          break;
        rt = mt;
      }
      if (!(be.length && $e(pe) && !cR(pe) && // Clicked on a direct ancestor (e.g. FloatingOverlay).
      !Le(pe, d.select("floatingElement")) && // If the target root element contains none of the markers, then the
      // element was injected after the floating element rendered.
      be.every((mt) => !Le(rt, mt)))) {
        if (Ct(pe) && !("touches" in ae)) {
          const mt = Pl(pe), Dt = In(pe), et = /auto|scroll/, ht = mt || et.test(Dt.overflowX), zt = mt || et.test(Dt.overflowY), yt = ht && pe.clientWidth > 0 && pe.scrollWidth > pe.clientWidth, Mn = zt && pe.clientHeight > 0 && pe.scrollHeight > pe.clientHeight, An = Dt.direction === "rtl", Qe = Mn && (An ? ae.offsetX <= pe.offsetWidth - pe.clientWidth : ae.offsetX > pe.clientWidth), pt = yt && ae.offsetY > pe.clientHeight;
          if (Qe || pt)
            return;
        }
        if (!je(ae)) {
          if (se() === "intentional" && j.current) {
            ne.clear(), j.current = !1;
            return;
          }
          typeof M == "function" && !M(ae) || Q("__outsidePressBubbles") || (d.setOpen(!1, Ye(Gc, ae)), F());
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
      pe && (k.current = {
        startTime: Date.now(),
        startX: pe.clientX,
        startY: pe.clientY,
        dismissOnTouchEnd: !1,
        dismissOnMouseDown: !0
      }, Y.start(1e3, () => {
        k.current && (k.current.dismissOnTouchEnd = !1, k.current.dismissOnMouseDown = !1);
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
      Y.clear(), ae.type === "pointerdown" && (_.current = ae.pointerType), !(ae.type === "mousedown" && k.current && !k.current.dismissOnMouseDown) && Re(ae, (pe) => {
        pe.type === "pointerdown" ? fe(pe) : Ee(pe);
      });
    }
    function we(ae) {
      if (!N.current)
        return;
      const pe = I.current;
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
          typeof M == "function" && !M(ae) || (ne.clear(), j.current = !0, F());
        }
      }
    }
    function Ce(ae) {
      if (se() !== "sloppy" || !k.current || Z(ae))
        return;
      const pe = ae.touches[0];
      if (!pe)
        return;
      const Ue = Math.abs(pe.clientX - k.current.startX), ve = Math.abs(pe.clientY - k.current.startY), be = Math.sqrt(Ue * Ue + ve * ve);
      be > 5 && (k.current.dismissOnTouchEnd = !0), be > 10 && (Ee(ae), Y.clear(), k.current = null);
    }
    function he(ae) {
      Re(ae, Ce);
    }
    function Se(ae) {
      se() !== "sloppy" || !k.current || Z(ae) || (k.current.dismissOnTouchEnd && Ee(ae), Y.clear(), k.current = null);
    }
    function Te(ae) {
      Re(ae, Se);
    }
    const Oe = tt(x), He = gl(i && gl(Je(Oe, "keydown", H), Je(Oe, "compositionstart", J), Je(Oe, "compositionend", re)), E && gl(Je(Oe, "click", ke, !0), Je(Oe, "pointerdown", ke, !0), Je(Oe, "pointerup", we, !0), Je(Oe, "pointercancel", we, !0), Je(Oe, "mousedown", ke, !0), Je(Oe, "mouseup", we, !0), Je(Oe, "touchstart", _e, !0), Je(Oe, "touchmove", he, !0), Je(Oe, "touchend", Te, !0)));
    return () => {
      He(), B.clear(), ne.clear(), oe(), j.current = !1;
    };
  }, [S, x, i, E, M, v, a, O, z, H, F, A, Q, Z, C, d, Y]), y.useEffect(F, [M, F]);
  const P = y.useMemo(() => ({
    onKeyDown: H,
    onPointerDown: q,
    onClick: q
  }), [H, q]), T = y.useMemo(() => ({
    onKeyDown: H,
    // `onMouseDown` may be blocked if `event.preventDefault()` is called in
    // `onPointerDown`, such as with <NumberField.ScrubArea>.
    // See https://github.com/mui/base-ui/pull/3379
    onPointerDown: X,
    onMouseDown: X,
    onClickCapture: D,
    onMouseDownCapture(B) {
      D(), U(B);
    },
    onPointerDownCapture(B) {
      D(), U(B);
    },
    onMouseUpCapture: D,
    onTouchEndCapture: D,
    onTouchMoveCapture: D
  }), [H, D, U, X]);
  return y.useMemo(() => a ? {
    reference: P,
    floating: T,
    trigger: P
  } : {}, [a, P, T]);
}
function Wv(n, o, a) {
  let {
    reference: i,
    floating: u
  } = n;
  const f = Wn(o), p = Yp(o), m = Pp(p), g = Ln(o), d = f === "y", v = i.x + i.width / 2 - u.width / 2, x = i.y + i.height / 2 - u.height / 2, S = i[m] / 2 - u[m] / 2;
  let C;
  switch (g) {
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
  const w = jo(o);
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
    elements: m,
    strategy: g
  } = n, {
    boundary: d = "clippingAncestors",
    rootBoundary: v = "viewport",
    elementContext: x = "floating",
    altBoundary: S = !1,
    padding: C = 0
  } = Kl(o, n), w = y0(C), E = m[S ? x === "floating" ? "reference" : "floating" : x], A = Si(await f.getClippingRect({
    element: (a = await (f.isElement == null ? void 0 : f.isElement(E))) == null || a ? E : E.contextElement || await (f.getDocumentElement == null ? void 0 : f.getDocumentElement(m.floating)),
    boundary: d,
    rootBoundary: v,
    strategy: g
  })), O = x === "floating" ? {
    x: i,
    y: u,
    width: p.floating.width,
    height: p.floating.height
  } : p.reference, z = await (f.getOffsetParent == null ? void 0 : f.getOffsetParent(m.floating)), N = await (f.isElement == null ? void 0 : f.isElement(z)) && await (f.getScale == null ? void 0 : f.getScale(z)) || {
    x: 1,
    y: 1
  }, I = Si(f.convertOffsetParentRelativeRectToViewportRelativeRect ? await f.convertOffsetParentRelativeRectToViewportRelativeRect({
    elements: m,
    rect: O,
    offsetParent: z,
    strategy: g
  }) : O);
  return {
    top: (A.top - I.top + w.top) / N.y,
    bottom: (I.bottom - A.bottom + w.bottom) / N.y,
    left: (A.left - I.left + w.left) / N.x,
    right: (I.right - A.right + w.right) / N.x
  };
}
const WR = 50, eC = async (n, o, a) => {
  const {
    placement: i = "bottom",
    strategy: u = "absolute",
    middleware: f = [],
    platform: p
  } = a, m = p.detectOverflow ? p : {
    ...p,
    detectOverflow: $R
  }, g = await (p.isRTL == null ? void 0 : p.isRTL(o));
  let d = await p.getElementRects({
    reference: n,
    floating: o,
    strategy: u
  }), {
    x: v,
    y: x
  } = Wv(d, i, g), S = i, C = 0;
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
      y: N,
      data: I,
      reset: j
    } = await O({
      x: v,
      y: x,
      initialPlacement: i,
      placement: S,
      strategy: u,
      middlewareData: w,
      rects: d,
      platform: m,
      elements: {
        reference: n,
        floating: o
      }
    });
    v = z ?? v, x = N ?? x, w[A] = {
      ...w[A],
      ...I
    }, j && C < WR && (C++, typeof j == "object" && (j.placement && (S = j.placement), j.rects && (d = j.rects === !0 ? await p.getElementRects({
      reference: n,
      floating: o,
      strategy: u
    }) : j.rects), {
      x: v,
      y: x
    } = Wv(d, S, g)), M = -1);
  }
  return {
    x: v,
    y: x,
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
        initialPlacement: m,
        platform: g,
        elements: d
      } = o, {
        mainAxis: v = !0,
        crossAxis: x = !0,
        fallbackPlacements: S,
        fallbackStrategy: C = "bestFit",
        fallbackAxisSideDirection: w = "none",
        flipAlignment: M = !0,
        ...E
      } = Kl(n, o);
      if ((a = f.arrow) != null && a.alignmentOffset)
        return {};
      const A = Ln(u), O = Wn(m), z = Ln(m) === m, N = await (g.isRTL == null ? void 0 : g.isRTL(d.floating)), I = S || (z || !M ? [Ec(m)] : TR(m)), j = w !== "none";
      !S && j && I.push(...MR(m, M, w, N));
      const L = [m, ...I], _ = await g.detectOverflow(o, E), k = [];
      let Y = ((i = f.flip) == null ? void 0 : i.overflows) || [];
      if (v && k.push(_[A]), x) {
        const Z = ER(u, p, N);
        k.push(_[Z[0]], _[Z[1]]);
      }
      if (Y = [...Y, {
        placement: u,
        overflows: k
      }], !k.every((Z) => Z <= 0)) {
        var te, F;
        const Z = (((te = f.flip) == null ? void 0 : te.index) || 0) + 1, q = L[Z];
        if (q && (!(x === "alignment" ? O !== Wn(q) : !1) || // We leave the current main axis only if every placement on that axis
        // overflows the main axis.
        Y.every((U) => Wn(U.placement) === O ? U.overflows[0] > 0 : !0)))
          return {
            data: {
              index: Z,
              overflows: Y
            },
            reset: {
              placement: q
            }
          };
        let H = (F = Y.filter((D) => D.overflows[0] <= 0).sort((D, U) => D.overflows[1] - U.overflows[1])[0]) == null ? void 0 : F.placement;
        if (!H)
          switch (C) {
            case "bestFit": {
              var Q;
              const D = (Q = Y.filter((U) => {
                if (j) {
                  const X = Wn(U.placement);
                  return X === O || // Create a bias to the `y` side axis due to horizontal
                  // reading directions favoring greater width.
                  X === "y";
                }
                return !0;
              }).map((U) => [U.placement, U.overflows.filter((X) => X > 0).reduce((X, P) => X + P, 0)]).sort((U, X) => U[1] - X[1])[0]) == null ? void 0 : Q[0];
              D && (H = D);
              break;
            }
            case "initialPlacement":
              H = m;
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
function eb(n, o) {
  return {
    top: n.top - o.height,
    right: n.right - o.width,
    bottom: n.bottom - o.height,
    left: n.left - o.width
  };
}
function tb(n) {
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
      } = Kl(n, o);
      switch (u) {
        case "referenceHidden": {
          const p = await i.detectOverflow(o, {
            ...f,
            elementContext: "reference"
          }), m = eb(p, a.reference);
          return {
            data: {
              referenceHiddenOffsets: m,
              referenceHidden: tb(m)
            }
          };
        }
        case "escaped": {
          const p = await i.detectOverflow(o, {
            ...f,
            altBoundary: !0
          }), m = eb(p, a.floating);
          return {
            data: {
              escapedOffsets: m,
              escaped: tb(m)
            }
          };
        }
        default:
          return {};
      }
    }
  };
}, B0 = /* @__PURE__ */ new Set(["left", "top"]);
async function lC(n, o) {
  const {
    placement: a,
    platform: i,
    elements: u
  } = n, f = await (i.isRTL == null ? void 0 : i.isRTL(u.floating)), p = Ln(a), m = jo(a), g = Wn(a) === "y", d = B0.has(p) ? -1 : 1, v = f && g ? -1 : 1, x = Kl(o, n);
  let {
    mainAxis: S,
    crossAxis: C,
    alignmentAxis: w
  } = typeof x == "number" ? {
    mainAxis: x,
    crossAxis: 0,
    alignmentAxis: null
  } : {
    mainAxis: x.mainAxis || 0,
    crossAxis: x.crossAxis || 0,
    alignmentAxis: x.alignmentAxis
  };
  return m && typeof w == "number" && (C = m === "end" ? w * -1 : w), g ? {
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
        middlewareData: m
      } = o, g = await lC(o, n);
      return p === ((a = m.offset) == null ? void 0 : a.placement) && (i = m.arrow) != null && i.alignmentOffset ? {} : {
        x: u + g.x,
        y: f + g.y,
        data: {
          ...g,
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
        crossAxis: m = !1,
        limiter: g = {
          fn: (O) => {
            let {
              x: z,
              y: N
            } = O;
            return {
              x: z,
              y: N
            };
          }
        },
        ...d
      } = Kl(n, o), v = {
        x: a,
        y: i
      }, x = await f.detectOverflow(o, d), S = Wn(u), C = Vp(S);
      let w = v[C], M = v[S];
      const E = (O, z) => h0(z + x[O === "y" ? "top" : "left"], z, z - x[O === "y" ? "bottom" : "right"]);
      p && (w = E(C, w)), m && (M = E(S, M));
      const A = g.fn({
        ...o,
        [C]: w,
        [S]: M
      });
      return {
        ...A,
        data: {
          x: A.x - a,
          y: A.y - i,
          enabled: {
            [C]: p,
            [S]: m
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
        rects: m,
        middlewareData: g
      } = o, {
        offset: d = 0,
        mainAxis: v = !0,
        crossAxis: x = !0
      } = Kl(n, o), S = {
        x: u,
        y: f
      }, C = Wn(p), w = Vp(C);
      let M = S[w], E = S[C];
      const A = Kl(d, o), O = typeof A == "number" ? {
        mainAxis: A,
        crossAxis: 0
      } : {
        mainAxis: (a = A.mainAxis) != null ? a : 0,
        crossAxis: (i = A.crossAxis) != null ? i : 0
      };
      if (v) {
        const I = w === "y" ? "height" : "width", j = m.reference[w] - m.floating[I] + O.mainAxis, L = m.reference[w] + m.reference[I] - O.mainAxis;
        M < j ? M = j : M > L && (M = L);
      }
      if (x) {
        var z, N;
        const I = w === "y" ? "width" : "height", j = B0.has(Ln(p)), L = m.reference[C] - m.floating[I] + (j && ((z = g.offset) == null ? void 0 : z[C]) || 0) + (j ? 0 : O.crossAxis), _ = m.reference[C] + m.reference[I] + (j ? 0 : ((N = g.offset) == null ? void 0 : N[C]) || 0) - (j ? O.crossAxis : 0);
        E < L ? E = L : E > _ && (E = _);
      }
      return {
        [w]: M,
        [C]: E
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
        ...m
      } = Kl(n, o), g = await u.detectOverflow(o, m), d = Ln(a), v = jo(a), x = Wn(a) === "y", {
        width: S,
        height: C
      } = i.floating;
      let w, M;
      d === "top" || d === "bottom" ? (w = d, M = v === (await (u.isRTL == null ? void 0 : u.isRTL(f.floating)) ? "start" : "end") ? "left" : "right") : (M = d, w = v === "end" ? "top" : "bottom");
      const E = C - g.top - g.bottom, A = S - g.left - g.right, O = ra(C - g[w], E), z = ra(S - g[M], A), N = o.middlewareData.shift, I = !N;
      let j = O, L = z;
      N != null && N.enabled.x && (L = A), N != null && N.enabled.y && (j = E), I && !v && (x ? L = S - 2 * Yl(g.left, g.right) : j = C - 2 * Yl(g.top, g.bottom)), await p({
        ...o,
        availableWidth: L,
        availableHeight: j
      });
      const _ = await u.getDimensions(f.floating);
      return S !== _.width || C !== _.height ? {
        reset: {
          rects: !0
        }
      } : {};
    }
  };
};
function V0(n) {
  const o = In(n);
  let a = parseFloat(o.width) || 0, i = parseFloat(o.height) || 0;
  const u = Ct(n), f = u ? n.offsetWidth : a, p = u ? n.offsetHeight : i, m = wc(a) !== f || wc(i) !== p;
  return m && (a = f, i = p), {
    width: a,
    height: i,
    $: m
  };
}
function Zp(n) {
  return $e(n) ? n : n.contextElement;
}
function ea(n) {
  const o = Zp(n);
  if (!Ct(o))
    return Gl(1);
  const a = o.getBoundingClientRect(), {
    width: i,
    height: u,
    $: f
  } = V0(o);
  let p = (f ? wc(a.width) : a.width) / i, m = (f ? wc(a.height) : a.height) / u;
  return (!p || !Number.isFinite(p)) && (p = 1), (!m || !Number.isFinite(m)) && (m = 1), {
    x: p,
    y: m
  };
}
const sC = /* @__PURE__ */ Gl(0);
function P0(n) {
  const o = Nt(n);
  return !Op() || !o.visualViewport ? sC : {
    x: o.visualViewport.offsetLeft,
    y: o.visualViewport.offsetTop
  };
}
function cC(n, o, a) {
  return o === void 0 && (o = !1), !!a && o && a === Nt(n);
}
function ir(n, o, a, i) {
  o === void 0 && (o = !1), a === void 0 && (a = !1);
  const u = n.getBoundingClientRect(), f = Zp(n);
  let p = Gl(1);
  o && (i ? $e(i) && (p = ea(i)) : p = ea(n));
  const m = cC(f, a, i) ? P0(f) : Gl(0);
  let g = (u.left + m.x) / p.x, d = (u.top + m.y) / p.y, v = u.width / p.x, x = u.height / p.y;
  if (f && i) {
    const S = Nt(f), C = $e(i) ? Nt(i) : i;
    let w = S, M = ap(w);
    for (; M && C !== w; ) {
      const E = ea(M), A = M.getBoundingClientRect(), O = In(M), z = A.left + (M.clientLeft + parseFloat(O.paddingLeft)) * E.x, N = A.top + (M.clientTop + parseFloat(O.paddingTop)) * E.y;
      g *= E.x, d *= E.y, v *= E.x, x *= E.y, g += z, d += N, w = Nt(M), M = ap(w);
    }
  }
  return Si({
    width: v,
    height: x,
    x: g,
    y: d
  });
}
function Zc(n, o) {
  const a = Lc(n).scrollLeft;
  return o ? o.left + a : ir(Ql(n)).left + a;
}
function Y0(n, o) {
  const a = n.getBoundingClientRect(), i = a.left + o.scrollLeft - Zc(n, a), u = a.top + o.scrollTop;
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
  const f = u === "fixed", p = Ql(i), m = o ? Uc(o.floating) : !1;
  if (i === p || m && f)
    return a;
  let g = {
    scrollLeft: 0,
    scrollTop: 0
  }, d = Gl(1);
  const v = Gl(0), x = Ct(i);
  if ((x || !f) && ((mn(i) !== "body" || cr(p)) && (g = Lc(i)), x)) {
    const C = ir(i);
    d = ea(i), v.x = C.x + i.clientLeft, v.y = C.y + i.clientTop;
  }
  const S = p && !x && !f ? Y0(p, g) : Gl(0);
  return {
    width: a.width * d.x,
    height: a.height * d.y,
    x: a.x * d.x - g.scrollLeft * d.x + v.x + S.x,
    y: a.y * d.y - g.scrollTop * d.y + v.y + S.y
  };
}
function fC(n) {
  return n.getClientRects ? Array.from(n.getClientRects()) : [];
}
function dC(n) {
  const o = Lc(n), a = n.ownerDocument.body, i = Yl(n.scrollWidth, n.clientWidth, a.scrollWidth, a.clientWidth), u = Yl(n.scrollHeight, n.clientHeight, a.scrollHeight, a.clientHeight);
  let f = -o.scrollLeft + Zc(n);
  const p = -o.scrollTop;
  return In(a).direction === "rtl" && (f += Yl(n.clientWidth, a.clientWidth) - i), {
    width: i,
    height: u,
    x: f,
    y: p
  };
}
const pC = 25;
function gC(n, o, a) {
  a === void 0 && (a = "viewport");
  const i = a === "layoutViewport", u = Nt(n), f = Ql(n), p = u.visualViewport;
  let m = f.clientWidth, g = f.clientHeight, d = 0, v = 0;
  if (p) {
    const S = !Op() || o === "fixed";
    i ? S || (d = -p.offsetLeft, v = -p.offsetTop) : (m = p.width, g = p.height, S && (d = p.offsetLeft, v = p.offsetTop));
  }
  if (Zc(f) <= 0) {
    const S = f.ownerDocument, C = S.body, w = getComputedStyle(C), M = S.compatMode === "CSS1Compat" && parseFloat(w.marginLeft) + parseFloat(w.marginRight) || 0, E = Math.abs(f.clientWidth - C.clientWidth - M), A = getComputedStyle(f).scrollbarGutter === "stable both-edges" ? E / 2 : E;
    A <= pC && (m -= A);
  }
  return {
    width: m,
    height: g,
    x: d,
    y: v
  };
}
function mC(n, o) {
  const a = ir(n, !0, o === "fixed"), i = a.top + n.clientTop, u = a.left + n.clientLeft, f = ea(n), p = n.clientWidth * f.x, m = n.clientHeight * f.y, g = u * f.x, d = i * f.y;
  return {
    width: p,
    height: m,
    x: g,
    y: d
  };
}
function nb(n, o, a) {
  let i;
  if (o === "viewport" || o === "layoutViewport")
    i = gC(n, a, o);
  else if (o === "document")
    i = dC(Ql(n));
  else if ($e(o))
    i = mC(o, a);
  else {
    const u = P0(n);
    i = {
      x: o.x - u.x,
      y: o.y - u.y,
      width: o.width,
      height: o.height
    };
  }
  return Si(i);
}
function hC(n, o) {
  const a = o.get(n);
  if (a)
    return a;
  let i = bi(n, [], !1).filter((m) => $e(m) && mn(m) !== "body"), u = null;
  const f = In(n).position === "fixed";
  let p = f ? ql(n) : n;
  for (; $e(p) && !Pl(p); ) {
    const m = In(p), g = Cp(p), d = u ? u.position : f ? "fixed" : "";
    !g && (d === "fixed" || d === "absolute" && m.position === "static") ? i = i.filter((x) => x !== p) : u = m, p = ql(p);
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
  const p = [...a === "clippingAncestors" ? Uc(o) ? [] : hC(o, this._c) : [].concat(a), i], m = nb(o, p[0], u);
  let g = m.top, d = m.right, v = m.bottom, x = m.left;
  for (let S = 1; S < p.length; S++) {
    const C = nb(o, p[S], u);
    g = Yl(C.top, g), d = ra(C.right, d), v = ra(C.bottom, v), x = Yl(C.left, x);
  }
  return {
    width: d - x,
    height: v - g,
    x,
    y: g
  };
}
function vC(n) {
  const {
    width: o,
    height: a
  } = V0(n);
  return {
    width: o,
    height: a
  };
}
function bC(n, o, a) {
  const i = Ct(o), u = Ql(o), f = a === "fixed", p = ir(n, !0, f, o);
  let m = {
    scrollLeft: 0,
    scrollTop: 0
  };
  const g = Gl(0);
  if ((i || !f) && ((mn(o) !== "body" || cr(u)) && (m = Lc(o)), i)) {
    const S = ir(o, !0, f, o);
    g.x = S.x + o.clientLeft, g.y = S.y + o.clientTop;
  }
  !i && u && (g.x = Zc(u));
  const d = u && !i && !f ? Y0(u, m) : Gl(0), v = p.left + m.scrollLeft - g.x - d.x, x = p.top + m.scrollTop - g.y - d.y;
  return {
    x: v,
    y: x,
    width: p.width,
    height: p.height
  };
}
function Gd(n) {
  return In(n).position === "static";
}
function lb(n, o) {
  if (!Ct(n) || In(n).position === "fixed")
    return null;
  if (o)
    return o(n);
  let a = n.offsetParent;
  return Ql(n) === a && (a = a.ownerDocument.body), a;
}
function G0(n, o) {
  const a = Nt(n);
  if (Uc(n))
    return a;
  if (!Ct(n)) {
    let u = ql(n);
    for (; u && !Pl(u); ) {
      if ($e(u) && !Gd(u))
        return u;
      u = ql(u);
    }
    return a;
  }
  let i = lb(n, o);
  for (; i && OE(i) && Gd(i); )
    i = lb(i, o);
  return i && Pl(i) && Gd(i) && !Cp(i) ? a : i || zE(n) || a;
}
const xC = async function(n) {
  const o = this.getOffsetParent || G0, a = this.getDimensions, i = await a(n.floating);
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
const q0 = {
  convertOffsetParentRelativeRectToViewportRelativeRect: uC,
  getDocumentElement: Ql,
  getClippingRect: yC,
  getOffsetParent: G0,
  getElementRects: xC,
  getClientRects: fC,
  getDimensions: vC,
  getScale: ea,
  isElement: $e,
  isRTL: SC
};
function X0(n, o) {
  return n.x === o.x && n.y === o.y && n.width === o.width && n.height === o.height;
}
function wC(n, o, a) {
  let i = null, u;
  const f = Ql(n);
  function p() {
    var v;
    clearTimeout(u), (v = i) == null || v.disconnect(), i = null;
  }
  function m(v, x) {
    v === void 0 && (v = !1), x === void 0 && (x = 1), p();
    const S = n.getBoundingClientRect(), {
      left: C,
      top: w,
      width: M,
      height: E
    } = S;
    if (v || o(), !M || !E)
      return;
    const A = Zs(w), O = Zs(f.clientWidth - (C + M)), z = Zs(f.clientHeight - (w + E)), N = Zs(C), j = {
      rootMargin: -A + "px " + -O + "px " + -z + "px " + -N + "px",
      threshold: Yl(0, ra(1, x)) || 1
    };
    let L = !0;
    function _(k) {
      const Y = k[0].intersectionRatio;
      if (!X0(S, n.getBoundingClientRect()))
        return m();
      if (Y !== x) {
        if (!L)
          return m();
        Y ? m(!1, Y) : u = setTimeout(() => {
          m(!1, 1e-7);
        }, 1e3);
      }
      L = !1;
    }
    try {
      i = new IntersectionObserver(_, {
        ...j,
        // Handle <iframe>s
        root: f.ownerDocument
      });
    } catch {
      i = new IntersectionObserver(_, j);
    }
    i.observe(n);
  }
  const g = Nt(n), d = () => m(a);
  return g.addEventListener("resize", d), m(!0), () => {
    g.removeEventListener("resize", d), p();
  };
}
function ob(n, o, a, i) {
  i === void 0 && (i = {});
  const {
    ancestorScroll: u = !0,
    ancestorResize: f = !0,
    elementResize: p = typeof ResizeObserver == "function",
    layoutShift: m = typeof IntersectionObserver == "function",
    animationFrame: g = !1
  } = i, d = Zp(n), v = u || f ? [...d ? bi(d) : [], ...o ? bi(o) : []] : [];
  v.forEach((A) => {
    u && A.addEventListener("scroll", a), f && A.addEventListener("resize", a);
  });
  const x = d && m ? wC(d, a, f) : null;
  let S = -1, C = null;
  p && (C = new ResizeObserver((A) => {
    let [O] = A;
    O && O.target === d && C && o && (C.unobserve(o), cancelAnimationFrame(S), S = requestAnimationFrame(() => {
      var z;
      (z = C) == null || z.observe(o);
    })), a();
  }), d && !g && C.observe(d), o && C.observe(o));
  let w, M = g ? ir(n) : null;
  g && E();
  function E() {
    const A = ir(n);
    M && !X0(M, A) && a(), M = A, w = requestAnimationFrame(E);
  }
  return a(), () => {
    var A;
    v.forEach((O) => {
      u && O.removeEventListener("scroll", a), f && O.removeEventListener("resize", a);
    }), x?.(), (A = C) == null || A.disconnect(), C = null, g && cancelAnimationFrame(w);
  };
}
const EC = oC, TC = rC, RC = tC, CC = iC, OC = nC, MC = aC, AC = (n, o, a) => {
  const i = /* @__PURE__ */ new Map(), u = a ?? {}, f = {
    ...q0,
    ...u.platform,
    _c: i
  };
  return eC(n, o, {
    ...u,
    platform: f
  });
};
var zC = typeof document < "u", NC = function() {
}, gc = zC ? y.useLayoutEffect : NC;
function Rc(n, o) {
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
        if (!Rc(n[i], o[i]))
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
      if (!(f === "_owner" && n.$$typeof) && !Rc(n[f], o[f]))
        return !1;
    }
    return !0;
  }
  return n !== n && o !== o;
}
function F0(n) {
  return typeof window > "u" ? 1 : (n.ownerDocument.defaultView || window).devicePixelRatio || 1;
}
function rb(n, o) {
  const a = F0(n);
  return Math.round(o * a) / a;
}
function qd(n) {
  const o = y.useRef(n);
  return gc(() => {
    o.current = n;
  }), o;
}
function DC(n) {
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
    transform: m = !0,
    whileElementsMounted: g,
    open: d
  } = n, [v, x] = y.useState({
    x: 0,
    y: 0,
    strategy: a,
    placement: o,
    middlewareData: {},
    isPositioned: !1
  }), [S, C] = y.useState(i);
  Rc(S, i) || C(i);
  const [w, M] = y.useState(null), [E, A] = y.useState(null), O = y.useCallback((U) => {
    U !== j.current && (j.current = U, M(U));
  }, []), z = y.useCallback((U) => {
    U !== L.current && (L.current = U, A(U));
  }, []), N = f || w, I = p || E, j = y.useRef(null), L = y.useRef(null), _ = y.useRef(v), k = g != null, Y = qd(g), te = qd(u), F = qd(d), Q = y.useCallback(() => {
    if (!j.current || !L.current)
      return;
    const U = {
      placement: o,
      strategy: a,
      middleware: S
    };
    te.current && (U.platform = te.current), AC(j.current, L.current, U).then((X) => {
      const P = {
        ...X,
        // The floating element's position may be recomputed while it's closed
        // but still mounted (such as when transitioning out). To ensure
        // `isPositioned` will be `false` initially on the next open, avoid
        // setting it to `true` when `open === false` (must be specified).
        isPositioned: F.current !== !1
      };
      Z.current && !Rc(_.current, P) && (_.current = P, ml.flushSync(() => {
        x(P);
      }));
    });
  }, [S, o, a, te, F]);
  gc(() => {
    d === !1 && _.current.isPositioned && (_.current.isPositioned = !1, x((U) => ({
      ...U,
      isPositioned: !1
    })));
  }, [d]);
  const Z = y.useRef(!1);
  gc(() => (Z.current = !0, () => {
    Z.current = !1;
  }), []), gc(() => {
    if (N && (j.current = N), I && (L.current = I), N && I) {
      if (Y.current)
        return Y.current(N, I, Q);
      Q();
    }
  }, [N, I, Q, Y, k]);
  const q = y.useMemo(() => ({
    reference: j,
    floating: L,
    setReference: O,
    setFloating: z
  }), [O, z]), H = y.useMemo(() => ({
    reference: N,
    floating: I
  }), [N, I]), D = y.useMemo(() => {
    const U = {
      position: a,
      left: 0,
      top: 0
    };
    if (!H.floating)
      return U;
    const X = rb(H.floating, v.x), P = rb(H.floating, v.y);
    return m ? {
      ...U,
      transform: "translate(" + X + "px, " + P + "px)",
      ...F0(H.floating) >= 1.5 && {
        willChange: "transform"
      }
    } : {
      position: a,
      left: X,
      top: P
    };
  }, [a, m, H.floating, v.x, v.y]);
  return y.useMemo(() => ({
    ...v,
    update: Q,
    refs: q,
    elements: H,
    floatingStyles: D
  }), [v, Q, q, H, D]);
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
  let m;
  if (n)
    m = n;
  else
    throw (
      /* minify-error-disabled */
      new Error("Missing arguments")
    );
  return m;
};
var Xd = { exports: {} }, Fd = {};
var ab;
function IC() {
  if (ab) return Fd;
  ab = 1;
  var n = Ti();
  function o(x, S) {
    return x === S && (x !== 0 || 1 / x === 1 / S) || x !== x && S !== S;
  }
  var a = typeof Object.is == "function" ? Object.is : o, i = n.useState, u = n.useEffect, f = n.useLayoutEffect, p = n.useDebugValue;
  function m(x, S) {
    var C = S(), w = i({ inst: { value: C, getSnapshot: S } }), M = w[0].inst, E = w[1];
    return f(
      function() {
        M.value = C, M.getSnapshot = S, g(M) && E({ inst: M });
      },
      [x, C, S]
    ), u(
      function() {
        return g(M) && E({ inst: M }), x(function() {
          g(M) && E({ inst: M });
        });
      },
      [x]
    ), p(C), C;
  }
  function g(x) {
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
  var v = typeof window > "u" || typeof window.document > "u" || typeof window.document.createElement > "u" ? d : m;
  return Fd.useSyncExternalStore = n.useSyncExternalStore !== void 0 ? n.useSyncExternalStore : v, Fd;
}
var ib;
function K0() {
  return ib || (ib = 1, Xd.exports = IC()), Xd.exports;
}
var Q0 = K0(), Kd = { exports: {} }, Qd = {};
var sb;
function BC() {
  if (sb) return Qd;
  sb = 1;
  var n = Ti(), o = K0();
  function a(d, v) {
    return d === v && (d !== 0 || 1 / d === 1 / v) || d !== d && v !== v;
  }
  var i = typeof Object.is == "function" ? Object.is : a, u = o.useSyncExternalStore, f = n.useRef, p = n.useEffect, m = n.useMemo, g = n.useDebugValue;
  return Qd.useSyncExternalStoreWithSelector = function(d, v, x, S, C) {
    var w = f(null);
    if (w.current === null) {
      var M = { hasValue: !1, value: null };
      w.current = M;
    } else M = w.current;
    w = m(
      function() {
        function A(j) {
          if (!O) {
            if (O = !0, z = j, j = S(j), C !== void 0 && M.hasValue) {
              var L = M.value;
              if (C(L, j))
                return N = L;
            }
            return N = j;
          }
          if (L = N, i(z, j)) return L;
          var _ = S(j);
          return C !== void 0 && C(L, _) ? (z = j, L) : (z = j, N = _);
        }
        var O = !1, z, N, I = x === void 0 ? null : x;
        return [
          function() {
            return A(v());
          },
          I === null ? void 0 : function() {
            return A(I());
          }
        ];
      },
      [v, x, S, C]
    );
    var E = u(d, w[0], w[1]);
    return p(
      function() {
        M.hasValue = !0, M.value = E;
      },
      [E]
    ), g(E), E;
  }, Qd;
}
var cb;
function VC() {
  return cb || (cb = 1, Kd.exports = BC()), Kd.exports;
}
var PC = VC();
const yp = [];
let vp;
function YC() {
  return vp;
}
function GC(n) {
  yp.push(n);
}
function Jp(n) {
  const o = (a, i) => {
    const u = xn(qC).current;
    let f;
    try {
      vp = u;
      for (const p of yp)
        p.before(u);
      f = n(a, i);
      for (const p of yp)
        p.after(u);
      u.didInitialize = !0;
    } finally {
      vp = void 0;
    }
    return f;
  };
  return o.displayName = n.displayName || n.name, o;
}
function Z0(n) {
  return /* @__PURE__ */ y.forwardRef(Jp(n));
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
  return Q0.useSyncExternalStore(n.subscribe, f, f);
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
    }), Q0.useSyncExternalStore(n.subscribe, n.getSnapshot, n.getSnapshot));
  }
});
function QC(n, o, a, i, u) {
  const f = YC();
  if (!f)
    return KC(n, o, a, i, u);
  const p = f.syncIndex;
  f.syncIndex += 1;
  let m;
  return f.didInitialize ? (m = f.syncHooks[p], (m.store !== n || m.selector !== o || !Object.is(m.a1, a) || !Object.is(m.a2, i) || !Object.is(m.a3, u)) && (m.store !== n && (f.didChangeStore = !0), m.store = n, m.selector = o, m.a1 = a, m.a2 = i, m.a3 = u, m.value = o(n.getSnapshot(), a, i, u))) : (m = {
    store: n,
    selector: o,
    a1: a,
    a2: i,
    a3: u,
    value: o(n.getSnapshot(), a, i, u)
  }, f.syncHooks.push(m)), m.value;
}
function ZC(n, o, a, i, u) {
  return PC.useSyncExternalStoreWithSelector(n.subscribe, n.getSnapshot, n.getSnapshot, (f) => o(f, a, i, u));
}
class J0 {
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
class Mi extends J0 {
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
        const m = u;
        u = p, a(p, m, this);
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
class Jc extends Mi {
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
      events: _0(),
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
function $0(n) {
  const {
    popupStore: o,
    treatPopupAsFloatingElement: a = !1,
    floatingRootContext: i,
    floatingId: u,
    nested: f,
    onOpenChange: p
  } = n, m = o.useState("open"), g = o.useState("activeTriggerElement"), d = o.useState(a ? "popupElement" : "positionerElement"), v = o.context.triggerElements, x = p, S = y.useRef(null);
  i === void 0 && S.current === null && (S.current = new Jc({
    open: m,
    transitionStatus: void 0,
    referenceElement: g,
    floatingElement: d,
    triggerElements: v,
    onOpenChange: x,
    floatingId: u,
    syncOnly: !0,
    nested: f
  }));
  const C = i ?? S.current;
  return o.useSyncedValue("floatingId", u), xe(() => {
    const w = {
      open: m,
      floatingId: u,
      referenceElement: g,
      floatingElement: d
    };
    $e(g) && (w.domReferenceElement = g), C.state.positionReference === C.state.referenceElement && (w.positionReference = g), C.update(w);
  }, [m, u, g, d, C]), C.context.onOpenChange = x, C.context.nested = f, C;
}
function $c(n, o = !1, a = !1) {
  const [i, u] = y.useState(n && o ? "idle" : void 0), [f, p] = y.useState(n);
  return n && !f && (p(!0), u("starting")), !n && f && i !== "ending" && !a && u("ending"), !n && !f && i === "ending" && u(void 0), xe(() => {
    if (!n && f && i !== "ending" && a) {
      const m = pl.request(() => {
        u("ending");
      });
      return () => {
        pl.cancel(m);
      };
    }
  }, [n, f, i, a]), xe(() => {
    if (!n || o)
      return;
    const m = pl.request(() => {
      u(void 0);
    });
    return () => {
      pl.cancel(m);
    };
  }, [o, n]), xe(() => {
    if (!n || !o)
      return;
    n && f && i !== "idle" && u("starting");
    const m = pl.request(() => {
      u("idle");
    });
    return () => {
      pl.cancel(m);
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
const $C = {
  [Ei.startingStyle]: ""
}, WC = {
  [Ei.endingStyle]: ""
}, _o = {
  transitionStatus(n) {
    return n === "starting" ? $C : n === "ending" ? WC : null;
  }
};
function $p(n, o = !1, a = !0) {
  const i = la();
  return ze((u, f = null) => {
    i.cancel();
    const p = Il(n);
    if (p == null)
      return;
    const m = p, g = () => {
      ml.flushSync(u);
    };
    if (typeof m.getAnimations != "function" || globalThis.BASE_UI_ANIMATIONS_DISABLED) {
      u();
      return;
    }
    function d() {
      Promise.all(m.getAnimations().map((v) => v.finished)).then(() => {
        f?.aborted || g();
      }).catch(() => {
        if (a) {
          f?.aborted || g();
          return;
        }
        const v = m.getAnimations();
        !f?.aborted && v.length > 0 && v.some((x) => x.pending || x.playState !== "finished") && d();
      });
    }
    if (o) {
      const v = Ei.startingStyle;
      if (!m.hasAttribute(v)) {
        i.request(d);
        return;
      }
      const x = new MutationObserver(() => {
        m.hasAttribute(v) || (x.disconnect(), d());
      });
      x.observe(m, {
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
function Jl(n) {
  const {
    enabled: o = !0,
    open: a,
    ref: i,
    onComplete: u
  } = n, f = ze(u), p = $p(i, a, !1);
  y.useEffect(() => {
    if (!o)
      return;
    const m = new AbortController();
    return p(f, m.signal), () => {
      m.abort();
    };
  }, [o, a, f, p]);
}
const sa = {
  tabIndex: -1,
  [up]: ""
};
function W0(n) {
  return (o) => o === "touch" ? n.current : !0;
}
function Wp(n, o, a = !1) {
  const i = ar(), u = Zl() != null, f = y.useRef(null);
  n === void 0 && f.current === null && (f.current = o(i, u));
  const p = n ?? f.current;
  return $0({
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
function ex(n, o) {
  const a = y.useRef(null), i = y.useRef(null);
  return y.useCallback((u) => {
    if (n === void 0)
      return;
    let f = !1;
    if (a.current !== null) {
      const p = a.current, m = i.current, g = o.context.triggerElements.getById(p);
      m && g === m && (o.context.triggerElements.delete(p), f = !0), a.current = null, i.current = null;
    }
    if (u !== null && (a.current = n, i.current = u, o.context.triggerElements.add(n, u), f = !0), f) {
      const p = o.context.triggerElements.size;
      o.select("open") && o.state.triggerCount !== p && o.set("triggerCount", p);
    }
  }, [o, n]);
}
function Wc(n, o, a, i = !1) {
  o ? n.preventUnmountingOnClose = !1 : i && (n.preventUnmountingOnClose = !0);
  const u = a?.id ?? null;
  (u || o) && (n.activeTriggerId = u, n.activeTriggerElement = a ?? null);
}
function eg(n) {
  let o = !1;
  return n.preventUnmountOnClose = () => {
    o = !0;
  }, () => o;
}
function eO(n, o, a, i = {}) {
  const u = a.reason, f = u === Pt, p = o && u === Jr, m = !o && (u === Fl || u === Ri), g = eg(a);
  if (n.context.onOpenChange?.(o, a), a.isCanceled)
    return;
  i.onBeforeDispatch?.(), n.state.floatingRootContext.dispatchOpenChange(o, a);
  const d = () => {
    const v = {
      ...i.extraState,
      open: o
    };
    p ? v.instantType = "focus" : m ? v.instantType = "dismiss" : f && (v.instantType = void 0), Wc(v, o, a.trigger, g()), n.update(v);
  };
  f ? ml.flushSync(d) : d();
}
function tg(n, o, a, i) {
  _p(() => {
    o === void 0 && n.state.open === !1 && a && (n.state = {
      ...n.state,
      open: !0,
      activeTriggerId: i,
      preventUnmountingOnClose: !1
    });
  });
}
function ng(n, o, a, i) {
  const u = a.useState("isMountedByTrigger", n), f = ex(n, a), p = ze((m) => {
    if (f(m), !m)
      return;
    const g = a.select("open"), d = a.select("activeTriggerId");
    if (d === n) {
      a.update({
        activeTriggerElement: m,
        ...g ? i : null
      });
      return;
    }
    d == null && g && a.update({
      activeTriggerId: n,
      activeTriggerElement: m,
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
function eu(n, o = {}) {
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
    const m = n.select("activeTriggerId");
    let g = null;
    if (m) {
      const d = n.context.triggerElements.getById(m);
      d ? d !== n.state.activeTriggerElement && (p.activeTriggerElement = d) : g = m;
    }
    if (!g && !m && f === 1) {
      const d = n.context.triggerElements.entries().next();
      if (!d.done) {
        const [v, x] = d.value;
        p.activeTriggerId = v, p.activeTriggerElement = x;
      }
    }
    (p.triggerCount !== void 0 || p.activeTriggerId !== void 0 || p.activeTriggerElement !== void 0) && n.update(p), g && a && queueMicrotask(() => {
      if (n.select("open") && n.select("activeTriggerId") === g && !n.context.triggerElements.getById(g)) {
        const d = Ye(Do);
        n.setOpen(!1, d), d.isCanceled || n.update({
          activeTriggerId: null,
          activeTriggerElement: null
        });
      }
    });
  }, [i, n, u, a]);
}
function tu(n, o, a) {
  const {
    mounted: i,
    setMounted: u,
    transitionStatus: f
  } = $c(n), p = o.useState("preventUnmountingOnClose"), m = n ? !1 : p;
  o.useSyncedValues({
    mounted: i,
    transitionStatus: f,
    preventUnmountingOnClose: m
  });
  const g = ze(() => {
    u(!1), o.update({
      activeTriggerId: null,
      activeTriggerElement: null,
      mounted: !1,
      preventUnmountingOnClose: !1
    }), a?.(), o.context.onOpenChangeComplete?.(!1);
  });
  return Jl({
    enabled: i && !n && !m,
    open: n,
    ref: o.context.popupRef,
    onComplete() {
      n || g();
    }
  }), {
    forceUnmount: g,
    transitionStatus: f
  };
}
function nu(n, o) {
  n.useSyncedValues(o), xe(() => () => {
    n.update({
      activeTriggerProps: xt,
      inactiveTriggerProps: xt,
      popupProps: xt
    });
  }, [n]);
}
function tx(n, o) {
  xe(() => {
    !o && n.state.openMethod !== null && n.set("openMethod", null);
  }, [o, n]), xe(() => () => {
    n.state.openMethod !== null && n.set("openMethod", null);
  }, [n]);
}
class ca {
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
  return new Jc({
    open: !1,
    transitionStatus: void 0,
    floatingElement: null,
    referenceElement: null,
    triggerElements: new ca(),
    floatingId: void 0,
    syncOnly: !1,
    nested: !1,
    onOpenChange: void 0
  });
}
function lu() {
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
function lg(n, o, a = !1) {
  return new Jc({
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
const pi = me((n) => n.triggerIdProp ?? n.activeTriggerId), og = me((n) => n.openProp ?? n.open), ub = me((n) => (n.popupElement?.id ?? n.floatingId) || void 0);
function nx(n, o) {
  return o !== void 0 && og(n) && pi(n) === o;
}
function nO(n, o) {
  return nx(n, o) ? !0 : o !== void 0 && og(n) && pi(n) == null && n.triggerCount === 1;
}
const ou = {
  open: og,
  mounted: me((n) => n.mounted),
  transitionStatus: me((n) => n.transitionStatus),
  floatingRootContext: me((n) => n.floatingRootContext),
  triggerCount: me((n) => n.triggerCount),
  preventUnmountingOnClose: me((n) => n.preventUnmountingOnClose),
  payload: me((n) => n.payload),
  activeTriggerId: pi,
  activeTriggerElement: me((n) => n.mounted ? n.activeTriggerElement : null),
  popupId: ub,
  /**
   * Whether the trigger with the given ID was used to open the popup.
   */
  isTriggerActive: me((n, o) => o !== void 0 && pi(n) === o),
  /**
   * Whether the popup is open and was activated by a trigger with the given ID.
   */
  isOpenedByTrigger: me((n, o) => nx(n, o)),
  /**
   * Whether the popup is mounted and was activated by a trigger with the given ID.
   */
  isMountedByTrigger: me((n, o) => o !== void 0 && pi(n) === o && n.mounted),
  triggerProps: me((n, o) => o ? n.activeTriggerProps : n.inactiveTriggerProps),
  /**
   * Popup id for the trigger that currently owns the open popup.
   */
  triggerPopupId: me((n, o) => nO(n, o) ? ub(n) : void 0),
  popupProps: me((n) => n.popupProps),
  popupElement: me((n) => n.popupElement),
  positionerElement: me((n) => n.positionerElement)
};
function lx(n) {
  const {
    open: o = !1,
    onOpenChange: a,
    elements: i = {}
  } = n, u = ar(), f = Zl() != null, p = xn(() => new Jc({
    open: o,
    transitionStatus: void 0,
    onOpenChange: a,
    referenceElement: i.reference ?? null,
    floatingElement: i.floating ?? null,
    triggerElements: new ca(),
    floatingId: u,
    syncOnly: !1,
    nested: f
  })).current;
  return xe(() => {
    const m = {
      open: o,
      floatingId: u
    };
    i.reference !== void 0 && (m.referenceElement = i.reference, m.domReferenceElement = $e(i.reference) ? i.reference : null), i.floating !== void 0 && (m.floatingElement = i.floating), p.update(m);
  }, [o, u, i.reference, i.floating, p]), p.context.onOpenChange = a, p.context.nested = f, p;
}
function lO(n = {}) {
  const {
    nodeId: o,
    externalTree: a
  } = n, i = lx(n), u = n.rootContext || i, f = u.useState("referenceElement"), p = u.useState("floatingElement"), m = u.useState("domReferenceElement"), g = u.useState("open"), d = u.useState("floatingId"), [v, x] = y.useState(null), [S, C] = y.useState(void 0), [w, M] = y.useState(void 0), E = y.useRef(null), A = ko(a), O = y.useMemo(() => ({
    reference: f,
    floating: p,
    domReference: m
  }), [f, p, m]), z = DC({
    ...n,
    elements: {
      ...O,
      ...v && {
        reference: v
      }
    }
  }), N = $e(S) ? S : null, I = w === void 0 ? u.state.floatingElement : w;
  u.useSyncedValue("referenceElement", S ?? null), u.useSyncedValue("domReferenceElement", S === void 0 ? m : N), u.useSyncedValue("floatingElement", I);
  const j = y.useCallback((F) => {
    const Q = $e(F) ? {
      getBoundingClientRect: () => F.getBoundingClientRect(),
      getClientRects: () => F.getClientRects(),
      contextElement: F
    } : F;
    x(Q), z.refs.setReference(Q);
  }, [z.refs]), L = y.useCallback((F) => {
    ($e(F) || F === null) && (E.current = F, C(F)), ($e(z.refs.reference.current) || z.refs.reference.current === null || // Don't allow setting virtual elements using the old technique back to
    // `null` to support `positionReference` + an unstable `reference`
    // callback ref.
    F !== null && !$e(F)) && z.refs.setReference(F);
  }, [z.refs, C]), _ = y.useCallback((F) => {
    M(F), z.refs.setFloating(F);
  }, [z.refs]), k = y.useMemo(() => ({
    ...z.refs,
    setReference: L,
    setFloating: _,
    setPositionReference: j,
    domReference: E
  }), [z.refs, L, _, j]), Y = y.useMemo(() => ({
    ...z.elements,
    domReference: m
  }), [z.elements, m]), te = y.useMemo(() => ({
    ...z,
    dataRef: u.context.dataRef,
    open: g,
    onOpenChange: u.setOpen,
    events: u.context.events,
    floatingId: d,
    refs: k,
    elements: Y,
    nodeId: o,
    rootStore: u
  }), [z, k, Y, o, u, g, d]);
  return xe(() => {
    m && (E.current = m);
  }, [m]), xe(() => {
    u.context.dataRef.current.floatingContext = te;
    const F = A?.nodesRef.current.find((Q) => Q.id === o);
    F && (F.context = te);
  }), y.useMemo(() => ({
    ...z,
    context: te,
    refs: k,
    elements: Y,
    rootStore: u
  }), [z, k, Y, te, u]);
}
const Zd = Hp && No;
function ox(n, o = {}) {
  const {
    enabled: a = !0,
    delay: i
  } = o, u = "rootStore" in n ? n.rootStore : n, {
    events: f,
    dataRef: p
  } = u.context, m = y.useRef(!1), g = y.useRef(null), d = y.useRef(!0), v = sn();
  y.useEffect(() => {
    const S = u.select("domReferenceElement");
    if (!a)
      return;
    const C = Nt(S);
    function w() {
      const A = u.select("domReferenceElement");
      !u.select("open") && Ct(A) && A === vn(tt(A)) && (m.current = !0);
    }
    function M() {
      d.current = !0;
    }
    function E() {
      d.current = !1;
    }
    return gl(Je(C, "blur", w), Zd && Je(C, "keydown", M, !0), Zd && Je(C, "pointerdown", E, !0));
  }, [u, a]), y.useEffect(() => {
    if (!a)
      return;
    function S(C) {
      if (C.reason === Fl || C.reason === Ri) {
        const w = u.select("domReferenceElement");
        $e(w) && (g.current = w, m.current = !0);
      }
    }
    return f.on("openchange", S), () => {
      f.off("openchange", S);
    };
  }, [f, a, u]);
  const x = y.useMemo(() => {
    function S() {
      m.current = !1, g.current = null;
    }
    return {
      onMouseLeave() {
        S();
      },
      onFocus(C) {
        const w = C.currentTarget;
        if (m.current) {
          if (g.current === w)
            return;
          S();
        }
        const M = gn(C.nativeEvent);
        if ($e(M)) {
          if (Zd && !C.relatedTarget) {
            if (!d.current && !Yc(M))
              return;
          } else if (!fR(M))
            return;
        }
        const E = xc(C.relatedTarget, u.context.triggerElements), {
          nativeEvent: A,
          currentTarget: O
        } = C, z = typeof i == "function" ? i() : i;
        if (u.select("open") && E || z === 0 || z === void 0) {
          u.setOpen(!0, Ye(Jr, A, O));
          return;
        }
        v.start(z, () => {
          m.current || u.setOpen(!0, Ye(Jr, A, O));
        });
      },
      onBlur(C) {
        S();
        const w = C.relatedTarget, M = C.nativeEvent, E = $e(w) && w.hasAttribute(wi("focus-guard")) && w.getAttribute("data-type") === "outside";
        v.start(0, () => {
          const A = u.select("domReferenceElement"), O = vn(tt(A));
          !w && O === A || Le(p.current.floatingContext?.refs.floating.current, O) || Le(A, O) || E || xc(w ?? O, u.context.triggerElements) || u.setOpen(!1, Ye(Jr, M));
        });
      }
    };
  }, [p, i, u, v]);
  return y.useMemo(() => a ? {
    reference: x,
    trigger: x
  } : {}, [a, x]);
}
class rg {
  constructor() {
    this.pointerType = void 0, this.interactedInside = !1, this.handler = void 0, this.blockMouseMove = !0, this.performedPointerEventsMutation = !1, this.pointerEventsScopeElement = null, this.pointerEventsReferenceElement = null, this.pointerEventsFloatingElement = null, this.restTimeoutPending = !1, this.openChangeTimeout = new el(), this.restTimeout = new el(), this.handleCloseOptions = void 0;
  }
  static create() {
    return new rg();
  }
  dispose = () => {
    this.openChangeTimeout.clear(), this.restTimeout.clear();
  };
  disposeEffect = () => this.dispose;
}
const Cc = /* @__PURE__ */ new WeakMap();
function Oc(n) {
  if (!n.performedPointerEventsMutation)
    return;
  const o = n.pointerEventsScopeElement;
  o && Cc.get(o) === n && (n.pointerEventsScopeElement?.style.removeProperty("pointer-events"), n.pointerEventsReferenceElement?.style.removeProperty("pointer-events"), n.pointerEventsFloatingElement?.style.removeProperty("pointer-events"), Cc.delete(o)), n.performedPointerEventsMutation = !1, n.pointerEventsScopeElement = null, n.pointerEventsReferenceElement = null, n.pointerEventsFloatingElement = null;
}
function rx(n, o) {
  const {
    scopeElement: a,
    referenceElement: i,
    floatingElement: u
  } = o, f = Cc.get(a);
  f && f !== n && Oc(f), Oc(n), n.performedPointerEventsMutation = !0, n.pointerEventsScopeElement = a, n.pointerEventsReferenceElement = i, n.pointerEventsFloatingElement = u, Cc.set(a, n), a.style.pointerEvents = "none", i.style.pointerEvents = "auto", u.style.pointerEvents = "auto";
}
function ag(n) {
  const o = n.context.dataRef.current, a = xn(() => o.hoverInteractionState ?? rg.create()).current;
  return o.hoverInteractionState || (o.hoverInteractionState = a), Lp(o.hoverInteractionState.disposeEffect), o.hoverInteractionState;
}
function ig(n, o = {}) {
  const {
    enabled: a = !0,
    closeDelay: i = 0,
    nodeId: u
  } = o, f = "rootStore" in n ? n.rootStore : n, p = f.useState("open"), m = f.useState("floatingElement"), g = f.useState("domReferenceElement"), {
    dataRef: d
  } = f.context, v = ko(), x = Zl(), S = ag(f), C = sn(), w = ze(() => u0(d.current.openEvent?.type, S.interactedInside)), M = ze(() => pR(d.current.openEvent?.type)), E = ze(() => {
    Oc(S);
  });
  xe(() => {
    p || (S.pointerType = void 0, S.restTimeoutPending = !1, S.interactedInside = !1, E());
  }, [p, S, E]), y.useEffect(() => E, [E]), xe(() => {
    if (a && p && S.handleCloseOptions?.blockPointerEvents && M() && $e(g) && m) {
      const A = g, O = m, z = tt(m), N = v?.nodesRef.current.find((_) => _.id === x)?.context?.elements.floating;
      N && (N.style.pointerEvents = "");
      const I = S.pointerEventsScopeElement !== O ? S.pointerEventsScopeElement : null, j = N !== O ? N : null, L = S.handleCloseOptions?.getScope?.() ?? I ?? j ?? A.closest("[data-rootownerid]") ?? z.body;
      return rx(S, {
        scopeElement: L,
        referenceElement: A,
        floatingElement: O
      }), () => {
        E();
      };
    }
  }, [a, p, g, m, S, M, v, x, E]), y.useEffect(() => {
    if (!a)
      return;
    function A() {
      return !!(v && x && Mo(v.nodesRef.current, x).length > 0);
    }
    function O(_) {
      const k = oa(i, "close", S.pointerType), Y = () => {
        f.setOpen(!1, Ye(Pt, _)), v?.events.emit("floating.closed", _);
      };
      k ? S.openChangeTimeout.start(k, Y) : (S.openChangeTimeout.clear(), Y());
    }
    function z(_) {
      const k = gn(_);
      if (!uR(k)) {
        S.interactedInside = !1;
        return;
      }
      S.interactedInside = k?.closest("[aria-haspopup]") != null;
    }
    function N() {
      S.openChangeTimeout.clear(), C.clear(), v?.events.off("floating.closed", j), E();
    }
    function I(_) {
      if (A() && v) {
        v.events.on("floating.closed", j);
        return;
      }
      if (xc(_.relatedTarget, f.context.triggerElements))
        return;
      const k = d.current.floatingContext?.nodeId ?? u, Y = _.relatedTarget;
      if (!(v && k && $e(Y) && Mo(v.nodesRef.current, k, !1).some((F) => Le(F.context?.elements.floating, Y)))) {
        if (S.handler) {
          S.handler(_);
          return;
        }
        E(), M() && !w() && O(_);
      }
    }
    function j(_) {
      !v || !x || A() || C.start(0, () => {
        v.events.off("floating.closed", j), f.setOpen(!1, Ye(Pt, _)), v.events.emit("floating.closed", _);
      });
    }
    const L = m;
    return gl(L && Je(L, "mouseenter", N), L && Je(L, "mouseleave", I), L && Je(L, "pointerdown", z, !0), () => {
      v?.events.off("floating.closed", j);
    });
  }, [a, m, f, d, i, u, M, w, E, S, v, x, C]);
}
const oO = {
  current: null
};
function ru(n, o = {}) {
  const {
    enabled: a = !0,
    delay: i = 0,
    handleClose: u = null,
    mouseOnly: f = !1,
    restMs: p = 0,
    move: m = !0,
    triggerElementRef: g = oO,
    externalTree: d,
    isActiveTrigger: v = !0,
    getHandleCloseContext: x,
    isClosing: S,
    shouldOpen: C
  } = o, w = "rootStore" in n ? n.rootStore : n, {
    dataRef: M,
    events: E
  } = w.context, A = ko(d), O = ag(w), z = y.useRef(!1), N = Yt(u), I = Yt(i), j = Yt(p), L = Yt(a), _ = Yt(C), k = Yt(S), Y = ze(() => u0(M.current.openEvent?.type, O.interactedInside)), te = ze(() => _.current?.() !== !1), F = ze((q, H, D) => {
    const U = w.context.triggerElements;
    if (U.hasElement(H))
      return !q || !Le(q, H);
    if (!$e(D))
      return !1;
    const X = D;
    return U.hasMatchingElement((P) => Le(P, X)) && (!q || !Le(q, X));
  }), Q = ze(() => {
    if (!O.handler)
      return;
    tt(w.select("domReferenceElement")).removeEventListener("mousemove", O.handler), O.handler = void 0;
  }), Z = ze(() => {
    Oc(O);
  });
  return v && (O.handleCloseOptions = N.current?.__options), y.useEffect(() => Q, [Q]), y.useEffect(() => {
    if (!a)
      return;
    function q(H) {
      H.open ? z.current = !1 : (z.current = H.reason === Pt, Q(), O.openChangeTimeout.clear(), O.restTimeout.clear(), O.blockMouseMove = !0, O.restTimeoutPending = !1);
    }
    return E.on("openchange", q), () => {
      E.off("openchange", q);
    };
  }, [a, E, O, Q]), y.useEffect(() => {
    if (!a)
      return;
    function q(X, P = !0) {
      const T = oa(I.current, "close", O.pointerType);
      T ? O.openChangeTimeout.start(T, () => {
        w.setOpen(!1, Ye(Pt, X)), A?.events.emit("floating.closed", X);
      }) : P && (O.openChangeTimeout.clear(), w.setOpen(!1, Ye(Pt, X)), A?.events.emit("floating.closed", X));
    }
    const H = g.current ?? (v ? w.select("domReferenceElement") : null);
    if (!$e(H))
      return;
    function D(X) {
      if (O.openChangeTimeout.clear(), O.blockMouseMove = !1, f && !rr(O.pointerType))
        return;
      const P = Hv(j.current), T = oa(I.current, "open", O.pointerType), B = gn(X), ne = X.currentTarget ?? null, J = w.select("domReferenceElement");
      let re = ne;
      if ($e(B) && !w.context.triggerElements.hasElement(B)) {
        for (const Re of w.context.triggerElements.elements())
          if (Le(Re, B)) {
            re = Re;
            break;
          }
      }
      $e(ne) && $e(J) && !w.context.triggerElements.hasElement(ne) && Le(ne, J) && (re = J);
      const ie = re == null ? !1 : F(J, re, B), oe = w.select("open"), se = k.current?.() ?? w.select("transitionStatus") === "ending", ge = !oe && se && z.current, je = !ie && $e(re) && $e(J) && Le(J, re) && ge, Ee = P > 0 && !T, fe = ie && (oe || ge) || je, ye = !oe || ie;
      if (fe) {
        te() && w.setOpen(!0, Ye(Pt, X, re));
        return;
      }
      Ee || (T ? O.openChangeTimeout.start(T, () => {
        ye && te() && w.setOpen(!0, Ye(Pt, X, re));
      }) : ye && te() && w.setOpen(!0, Ye(Pt, X, re)));
    }
    function U(X) {
      if (Y()) {
        Z();
        return;
      }
      Q();
      const P = w.select("domReferenceElement"), T = tt(P);
      O.restTimeout.clear(), O.restTimeoutPending = !1;
      const B = M.current.floatingContext ?? x?.();
      if (xc(X.relatedTarget, w.context.triggerElements))
        return;
      if (N.current && B) {
        w.select("open") || O.openChangeTimeout.clear();
        const J = g.current;
        O.handler = N.current({
          ...B,
          tree: A,
          x: X.clientX,
          y: X.clientY,
          onClose() {
            Z(), Q(), L.current && !Y() && J === w.select("domReferenceElement") && q(X, !0);
          }
        }), T.addEventListener("mousemove", O.handler), O.handler(X);
        return;
      }
      (O.pointerType !== "touch" || !Le(w.select("floatingElement"), X.relatedTarget)) && q(X);
    }
    return m ? gl(Je(H, "mousemove", D, {
      once: !0
    }), Je(H, "mouseenter", D), Je(H, "mouseleave", U)) : gl(Je(H, "mouseenter", D), Je(H, "mouseleave", U));
  }, [Q, Z, M, I, w, a, N, O, v, F, Y, f, m, j, g, A, L, x, k, te]), y.useMemo(() => {
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
          nativeEvent: D
        } = H, U = H.currentTarget, X = w.select("domReferenceElement"), P = w.select("open"), T = F(X, U, H.target);
        if (f && !rr(O.pointerType))
          return;
        if (P && T && O.handleCloseOptions?.blockPointerEvents) {
          const J = w.select("floatingElement");
          if (J) {
            const re = O.handleCloseOptions?.getScope?.() ?? U.ownerDocument.body;
            rx(O, {
              scopeElement: re,
              referenceElement: U,
              floatingElement: J
            });
          }
        }
        const B = Hv(j.current);
        if (P && !T || B === 0 || !T && O.restTimeoutPending && H.movementX ** 2 + H.movementY ** 2 < 2)
          return;
        O.restTimeout.clear();
        function ne() {
          if (O.restTimeoutPending = !1, Y())
            return;
          const J = w.select("open");
          !O.blockMouseMove && (!J || T) && te() && w.setOpen(!0, Ye(Pt, D, U));
        }
        O.pointerType === "touch" ? ml.flushSync(() => {
          ne();
        }) : T && P ? ne() : (O.restTimeoutPending = !0, O.restTimeout.start(B, ne));
      }
    };
  }, [a, O, Y, F, f, w, j, te]);
}
const rO = "Escape";
function au(n, o, a) {
  switch (n) {
    case "vertical":
      return o;
    case "horizontal":
      return a;
    default:
      return o || a;
  }
}
function $s(n, o) {
  return au(o, n === c0 || n === Bp, n === Vc || n === Pc);
}
function Jd(n, o, a) {
  return au(o, n === Bp, a ? n === Vc : n === Pc) || n === "Enter" || n === " " || n === "";
}
function aO(n, o, a) {
  return au(o, a ? n === Vc : n === Pc, n === Bp);
}
function iO(n, o, a, i) {
  const u = a ? n === Pc : n === Vc, f = n === c0;
  return o === "both" || o === "horizontal" && i ? n === rO : au(o, u, f);
}
function ax(n, o) {
  const {
    listRef: a,
    activeIndex: i,
    onNavigate: u = () => {
    },
    enabled: f = !0,
    selectedIndex: p = null,
    allowEscape: m = !1,
    loopFocus: g = !1,
    nested: d = !1,
    rtl: v = !1,
    virtual: x = !1,
    focusItemOnOpen: S = "auto",
    focusItemOnHover: C = !0,
    openOnArrowKeyDown: w = !0,
    disabledIndices: M = void 0,
    orientation: E = "vertical",
    parentOrientation: A,
    id: O,
    resetOnPointerLeave: z = !0,
    externalTree: N,
    grid: I
  } = o, j = I != null, L = "rootStore" in n ? n.rootStore : n, _ = L.useState("open"), k = L.useState("floatingElement"), Y = L.useState("domReferenceElement"), te = L.context.dataRef, F = Sc(k), Q = fp(Y), Z = Yt(F), q = Zl(), H = ko(N), D = y.useRef(S), U = y.useRef(p ?? -1), X = y.useRef(null), P = y.useRef(!0), T = ze((ae) => {
    u(U.current === -1 ? null : U.current, ae);
  }), B = y.useRef(!!k), ne = y.useRef(_), J = y.useRef(!1), re = y.useRef(!1), ie = y.useRef(null), oe = Yt(M), se = Yt(_), ge = Yt(p), je = Yt(z), Ee = la(), fe = la(), ye = ze(() => {
    function ae(be) {
      x ? H?.events.emit("virtualfocus", be) : ie.current = pc(be, {
        sync: J.current,
        preventScroll: !0
      });
    }
    const pe = a.current[U.current], Ue = re.current;
    pe && ae(pe), (J.current ? (be) => be() : (be) => Ee.request(be))(() => {
      const be = a.current[U.current] || pe;
      if (!be)
        return;
      pe || ae(be), // eslint-disable-next-line @typescript-eslint/no-use-before-define
      he && (Ue || !P.current) && be.scrollIntoView?.({
        block: "nearest",
        inline: "nearest"
      });
    });
  });
  xe(() => {
    te.current.orientation = E;
  }, [te, E]), xe(() => {
    f && (_ && k ? (U.current = p ?? -1, D.current && p != null && (re.current = !0, T())) : B.current && (U.current = -1, T()));
  }, [f, _, k, p, T]), xe(() => {
    if (f) {
      if (!_) {
        J.current = !1;
        return;
      }
      if (k)
        if (i == null) {
          if (J.current = !1, ge.current != null)
            return;
          if (B.current && (U.current = -1, ye()), (!ne.current || !B.current) && D.current && (X.current != null || D.current === !0 && X.current == null)) {
            let ae = 0;
            const pe = () => {
              a.current[0] == null ? (ae < 2 && (ae ? (ve) => fe.request(ve) : queueMicrotask)(pe), ae += 1) : (U.current = X.current == null || Jd(X.current, E, v) || d ? dc(a) : gp(a), X.current = null, T());
            };
            pe();
          }
        } else di(a.current, i) || (U.current = i, ye(), re.current = !1);
    }
  }, [f, _, k, i, ge, d, a, E, v, T, ye, fe]), xe(() => {
    if (!f || k || !H || x || !B.current)
      return;
    const ae = H.nodesRef.current, pe = ae.find((be) => be.id === q)?.context?.elements.floating, Ue = vn(tt(Y ?? pe ?? null)), ve = ae.some((be) => be.context && Le(be.context.elements.floating, Ue));
    pe && !ve && P.current && pe.focus({
      preventScroll: !0
    });
  }, [f, k, Y, H, q, x]), xe(() => {
    ne.current = _, B.current = !!k;
  }), xe(() => {
    _ || (X.current = null, D.current = S);
  }, [_, S]);
  const Re = i != null, _e = ze((ae) => {
    if (!se.current)
      return;
    const pe = a.current.indexOf(ae.currentTarget);
    pe !== -1 && (U.current !== pe || i !== pe) && (U.current = pe, T(ae));
  }), ke = ze(() => A ?? H?.nodesRef.current.find((ae) => ae.id === q)?.context?.dataRef?.current.orientation), we = ze(() => dc(a, oe.current)), Ce = ze((ae) => {
    if (P.current = !1, J.current = !0, ae.which === 229 || !se.current && ae.currentTarget === Z.current)
      return;
    if (d && iO(ae.key, E, v, j)) {
      $s(ae.key, ke()) || dl(ae), L.setOpen(!1, Ye(dp, ae.nativeEvent)), Ct(Y) && (x ? H?.events.emit("virtualfocus", Y) : Y.focus());
      return;
    }
    const pe = U.current, Ue = dc(a, M), ve = gp(a, M);
    if (Q || (ae.key === "Home" && (dl(ae), U.current = Ue, T(ae)), ae.key === "End" && (dl(ae), U.current = ve, T(ae))), I != null) {
      const be = I(ae, U.current, a, E, g, v, M, Ue, ve);
      if (be != null && (U.current = be, T(ae)), E === "both")
        return;
    }
    if ($s(ae.key, E)) {
      if (dl(ae), _ && !x && vn(ae.currentTarget.ownerDocument) === ae.currentTarget) {
        U.current = Jd(ae.key, E, v) ? Ue : ve, T(ae);
        return;
      }
      Jd(ae.key, E, v) ? g ? pe >= ve ? m && pe !== a.current.length ? U.current = -1 : (J.current = !1, U.current = Ue) : U.current = Vl(a.current, {
        startingIndex: pe,
        disabledIndices: M
      }) : U.current = Math.min(ve, Vl(a.current, {
        startingIndex: pe,
        disabledIndices: M
      })) : g ? pe <= Ue ? m && pe !== -1 ? U.current = a.current.length : (J.current = !1, U.current = ve) : U.current = Vl(a.current, {
        startingIndex: pe,
        decrement: !0,
        disabledIndices: M
      }) : U.current = Math.max(Ue, Vl(a.current, {
        startingIndex: pe,
        decrement: !0,
        disabledIndices: M
      })), di(a.current, U.current) && (U.current = -1), T(ae);
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
      J.current = !0, re.current = !1, C && _e(pe);
    },
    onPointerLeave(pe) {
      if (!se.current || !P.current || pe.pointerType === "touch")
        return;
      J.current = !0;
      const Ue = pe.relatedTarget;
      if (!(!C || a.current.includes(Ue)) && je.current && (ie.current?.(), ie.current = null, U.current = -1, T(pe), !x)) {
        const ve = Z.current, be = vn(tt(ve));
        ve && Le(ve, be) && ve.focus({
          preventScroll: !0
        });
      }
    }
  }), [_e, se, Z, C, a, T, je, x]), Se = y.useMemo(() => x && _ && Re && {
    "aria-activedescendant": `${O}-${i}`
  }, [x, _, Re, O, i]), Te = y.useMemo(() => ({
    "aria-orientation": E === "both" ? void 0 : E,
    ...Q ? {} : Se,
    onKeyDown(ae) {
      if (ae.key === "Tab" && ae.shiftKey && _ && !x) {
        const pe = gn(ae.nativeEvent);
        if (pe && !Le(Z.current, pe))
          return;
        dl(ae), L.setOpen(!1, Ye(Co, ae.nativeEvent)), Ct(Y) && Y.focus();
        return;
      }
      Ce(ae);
    },
    onPointerMove() {
      P.current = !0;
    }
  }), [Se, Ce, Z, E, Q, L, _, x, Y]), Oe = y.useMemo(() => {
    function ae(ve) {
      L.setOpen(!0, Ye(dp, ve.nativeEvent, ve.currentTarget));
    }
    function pe(ve) {
      S === "auto" && Ip(ve.nativeEvent) && (D.current = !x);
    }
    function Ue(ve) {
      D.current = S, S === "auto" && i0(ve.nativeEvent) && (D.current = !0);
    }
    return {
      onKeyDown(ve) {
        const be = L.select("open");
        P.current = !1;
        const We = ve.key.startsWith("Arrow"), rt = aO(ve.key, ke(), v), mt = $s(ve.key, E), Dt = (d ? rt : mt) || ve.key === "Enter" || ve.key.trim() === "";
        if (x && be)
          return Ce(ve);
        if (!(!be && !w && We)) {
          if (Dt) {
            const et = $s(ve.key, ke());
            X.current = d && et ? null : ve.key;
          }
          if (d) {
            rt && (dl(ve), be ? (U.current = we(), T(ve)) : ae(ve));
            return;
          }
          mt && (ge.current != null && (U.current = ge.current), dl(ve), !be && w ? ae(ve) : Ce(ve), be && T(ve));
        }
      },
      onFocus(ve) {
        L.select("open") && !x && (U.current = -1, T(ve));
      },
      onPointerDown: Ue,
      onPointerEnter: Ue,
      onMouseDown: pe,
      onClick: pe
    };
  }, [Ce, S, we, d, T, L, w, E, ke, v, ge, x]), He = y.useMemo(() => ({
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
function ix(n, o) {
  const {
    listRef: a,
    elementsRef: i,
    activeIndex: u,
    onMatch: f,
    disabledIndices: p,
    onTyping: m,
    enabled: g = !0,
    resetMs: d = 750,
    selectedIndex: v = null
  } = o, x = "rootStore" in n ? n.rootStore : n, S = x.useState("open"), C = sn(), w = y.useRef(""), M = y.useRef(v ?? u ?? -1), E = y.useRef(null), A = ze((N) => {
    function I(Z) {
      const q = i?.current[Z];
      return !q || Xc(q);
    }
    function j(Z) {
      return I(Z) ? p == null || !Tc(Xl, Z, p) : !1;
    }
    function L(Z, q, H = 0) {
      if (Z.length === 0)
        return -1;
      const D = (H % Z.length + Z.length) % Z.length, U = q.toLowerCase();
      for (let X = 0; X < Z.length; X += 1) {
        const P = (D + X) % Z.length;
        if (!(!Z[P]?.toLowerCase().startsWith(U) || !j(P)))
          return P;
      }
      return -1;
    }
    const _ = a.current;
    if (w.current.length > 0 && N.key === " " && (dl(N), m?.(!0)), w.current.length > 0 && w.current[0] !== " " && L(_, w.current) === -1 && N.key !== " " && m?.(!1), _ == null || // Character key.
    N.key.length !== 1 || // Modifier key.
    N.ctrlKey || N.metaKey || N.altKey)
      return;
    S && N.key !== " " && (dl(N), m?.(!0));
    const k = w.current === "";
    k && (M.current = v ?? u ?? -1), _.every((Z, q) => Z && j(q) ? Z[0]?.toLowerCase() !== Z[1]?.toLowerCase() : !0) && w.current === N.key && (w.current = "", M.current = E.current), w.current += N.key, C.start(d, () => {
      w.current = "", M.current = E.current, m?.(!1);
    });
    const F = ((k ? v ?? u ?? -1 : M.current) ?? 0) + 1, Q = L(_, w.current, F);
    Q !== -1 ? (f?.(Q), E.current = Q) : N.key !== " " && (w.current = "", m?.(!1));
  }), O = ze((N) => {
    const I = N.relatedTarget, j = x.select("domReferenceElement"), L = x.select("floatingElement");
    Le(j, I) || Le(L, I) || (C.clear(), w.current = "", M.current = E.current, m?.(!1));
  });
  xe(() => {
    !S && v !== null || (C.clear(), E.current = null, w.current !== "" && (w.current = ""));
  }, [S, v, C]), xe(() => {
    S && w.current === "" && (M.current = v ?? u ?? -1);
  }, [S, v, u]);
  const z = y.useMemo(() => ({
    onKeyDown: A,
    onBlur: O
  }), [A, O]);
  return y.useMemo(() => g ? {
    reference: z,
    floating: z
  } : {}, [g, z]);
}
const fb = 0.1, sO = fb * fb, Rt = 0.5;
function Ws(n, o, a, i, u, f) {
  return i >= o != f >= o && n <= (u - a) * (o - i) / (f - i) + a;
}
function ec(n, o, a, i, u, f, p, m, g, d) {
  let v = !1;
  return Ws(n, o, a, i, u, f) && (v = !v), Ws(n, o, u, f, p, m) && (v = !v), Ws(n, o, p, m, g, d) && (v = !v), Ws(n, o, g, d, a, i) && (v = !v), v;
}
function cO(n, o, a) {
  return n >= a.x && n <= a.x + a.width && o >= a.y && o <= a.y + a.height;
}
function tc(n, o, a, i, u, f) {
  const p = Math.min(a, u), m = Math.max(a, u), g = Math.min(i, f), d = Math.max(i, f);
  return n >= p && n <= m && o >= g && o <= d;
}
function iu(n = {}) {
  const {
    blockPointerEvents: o = !1
  } = n, a = new el(), i = ({
    x: u,
    y: f,
    placement: p,
    elements: m,
    onClose: g,
    nodeId: d,
    tree: v
  }) => {
    const x = p?.split("-")[0];
    let S = !1, C = null, w = null, M = typeof performance < "u" ? performance.now() : 0;
    function E(O, z) {
      const N = performance.now(), I = N - M;
      if (C === null || w === null || I === 0)
        return C = O, w = z, M = N, !1;
      const j = O - C, L = z - w, _ = j * j + L * L, k = I * I * sO;
      return C = O, w = z, M = N, _ < k;
    }
    function A() {
      a.clear(), g();
    }
    return function(z) {
      a.clear();
      const N = m.domReference, I = m.floating;
      if (!N || !I || x == null || u == null || f == null)
        return;
      const {
        clientX: j,
        clientY: L
      } = z, _ = gn(z), k = z.type === "mouseleave", Y = Le(I, _), te = Le(N, _);
      if (Y && (S = !0, !k))
        return;
      if (te && (S = !1, !k)) {
        S = !0;
        return;
      }
      if (k && $e(z.relatedTarget) && Le(I, z.relatedTarget))
        return;
      function F() {
        return !!(v && Mo(v.nodesRef.current, d).length > 0);
      }
      function Q() {
        F() || A();
      }
      if (F())
        return;
      const Z = N.getBoundingClientRect(), q = I.getBoundingClientRect(), H = u > q.right - q.width / 2, D = f > q.bottom - q.height / 2, U = q.width > Z.width, X = q.height > Z.height, P = (U ? Z : q).left, T = (U ? Z : q).right, B = (X ? Z : q).top, ne = (X ? Z : q).bottom;
      if (x === "top" && f >= Z.bottom - 1 || x === "bottom" && f <= Z.top + 1 || x === "left" && u >= Z.right - 1 || x === "right" && u <= Z.left + 1) {
        Q();
        return;
      }
      let J = !1;
      switch (x) {
        case "top":
          J = tc(j, L, P, Z.top + 1, T, q.bottom - 1);
          break;
        case "bottom":
          J = tc(j, L, P, q.top + 1, T, Z.bottom - 1);
          break;
        case "left":
          J = tc(j, L, q.right - 1, ne, Z.left + 1, B);
          break;
        case "right":
          J = tc(j, L, Z.right - 1, ne, q.left + 1, B);
          break;
      }
      if (J)
        return;
      if (S && !cO(j, L, Z)) {
        Q();
        return;
      }
      if (!k && E(j, L)) {
        Q();
        return;
      }
      let re = !1;
      switch (x) {
        case "top": {
          const ie = U ? Rt / 2 : Rt * 4, oe = U || H ? u + ie : u - ie, se = U ? u - ie : H ? u + ie : u - ie, ge = f + Rt + 1, je = H || U ? q.bottom - Rt : q.top, Ee = H ? U ? q.bottom - Rt : q.top : q.bottom - Rt;
          re = ec(j, L, oe, ge, se, ge, q.left, je, q.right, Ee);
          break;
        }
        case "bottom": {
          const ie = U ? Rt / 2 : Rt * 4, oe = U || H ? u + ie : u - ie, se = U ? u - ie : H ? u + ie : u - ie, ge = f - Rt, je = H || U ? q.top + Rt : q.bottom, Ee = H ? U ? q.top + Rt : q.bottom : q.top + Rt;
          re = ec(j, L, oe, ge, se, ge, q.left, je, q.right, Ee);
          break;
        }
        case "left": {
          const ie = X ? Rt / 2 : Rt * 4, oe = X || D ? f + ie : f - ie, se = X ? f - ie : D ? f + ie : f - ie, ge = u + Rt + 1, je = D || X ? q.right - Rt : q.left, Ee = D ? X ? q.right - Rt : q.left : q.right - Rt;
          re = ec(j, L, je, q.top, Ee, q.bottom, ge, oe, ge, se);
          break;
        }
        case "right": {
          const ie = X ? Rt / 2 : Rt * 4, oe = X || D ? f + ie : f - ie, se = X ? f - ie : D ? f + ie : f - ie, ge = u - Rt, je = D || X ? q.left + Rt : q.right, Ee = D ? X ? q.left + Rt : q.right : q.left + Rt;
          re = ec(j, L, ge, oe, ge, se, je, q.top, Ee, q.bottom);
          break;
        }
      }
      re ? S || a.start(40, Q) : Q();
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
  tx(o, i), eu(o);
  const {
    forceUnmount: u
  } = tu(i, o), f = y.useCallback(() => {
    o.setOpen(!1, Ye(qc));
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
  const i = n.useState("open"), u = n.useState("disablePointerDismissal"), f = n.useState("modal"), p = n.useState("popupElement"), m = n.useState("floatingRootContext"), [g, d] = y.useState(0), [v, x] = y.useState(0), S = g === 0, C = Oi(m, {
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
  a0(i && f === !0, p), n.useContextCallback("onNestedDialogOpen", (A, O) => {
    d(A), x(O);
  }), n.useContextCallback("onNestedDialogClose", () => {
    d(0), x(0);
  }), y.useEffect(() => (o?.onNestedDialogOpen && i && o.onNestedDialogOpen(g + 1, v + (a ? 1 : 0)), o?.onNestedDialogClose && !i && o.onNestedDialogClose(), () => {
    o?.onNestedDialogClose && i && o.onNestedDialogClose();
  }), [a, i, g, v, o]);
  const w = C.reference ?? xt, M = C.trigger ?? xt, E = C.floating ?? xt;
  return nu(n, {
    activeTriggerProps: w,
    inactiveTriggerProps: M,
    popupProps: E,
    nestedOpenDialogCount: g,
    nestedOpenDrawerCount: v
  }), null;
}
const sx = /* @__PURE__ */ y.createContext(!1), cx = /* @__PURE__ */ y.createContext(void 0);
function fr(n) {
  const o = y.useContext(cx);
  if (n === !1 && o === void 0)
    throw new Error(At(27));
  return o;
}
const dO = {
  ...ou,
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
class sg extends Mi {
  constructor(o, a, i = !1) {
    const u = new ca(), f = pO(o);
    f.floatingRootContext = lg(u, a, i), super(f, {
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
    Wc(i, o, a.trigger), this.update(i);
  };
  static useStore(o, a) {
    return Wp(o, (u, f) => new sg(a, u, f), !0).store;
  }
}
function pO(n = {}) {
  return {
    ...lu(),
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
function ux(n, o = "dialog") {
  const {
    children: a,
    open: i,
    defaultOpen: u = !1,
    onOpenChange: f,
    onOpenChangeComplete: p,
    disablePointerDismissal: m = !1,
    modal: g = !0,
    actionsRef: d,
    handle: v,
    triggerId: x,
    defaultTriggerId: S = null
  } = n, C = o === "drawer", w = o === "alert-dialog", M = w ? !0 : g, E = w || m, A = w ? "alertdialog" : "dialog", O = fr(!0), N = {
    modal: M,
    disablePointerDismissal: E,
    nested: !!O,
    role: A
  }, I = sg.useStore(v?.store, {
    open: u,
    openProp: i,
    activeTriggerId: S,
    triggerIdProp: x,
    ...N
  });
  _p(() => {
    const te = i === void 0 && I.state.open === !1 && u === !0 ? {
      open: !0,
      activeTriggerId: S
    } : null;
    w ? I.update(te ? {
      ...N,
      ...te
    } : N) : te && I.update(te);
  }), I.useControlledProp("openProp", i), I.useControlledProp("triggerIdProp", x), I.useSyncedValues(N), I.useContextCallback("onOpenChange", f), I.useContextCallback("onOpenChangeComplete", p);
  const j = I.useState("open"), L = I.useState("mounted"), _ = I.useState("payload");
  uO({
    store: I,
    actionsRef: d
  });
  const k = j || L, Y = y.useMemo(() => ({
    store: I
  }), [I]);
  return /* @__PURE__ */ b.jsx(sx.Provider, {
    value: !1,
    children: /* @__PURE__ */ b.jsxs(cx.Provider, {
      value: Y,
      children: [k && /* @__PURE__ */ b.jsx(fO, {
        store: I,
        parentContext: O?.store.context,
        isDrawer: C
      }), typeof a == "function" ? a({
        payload: _
      }) : a]
    })
  });
}
function gO(n) {
  return ux(n, "alert-dialog");
}
let or = (function(n) {
  return n.open = "data-open", n.closed = "data-closed", n[n.startingStyle = Ei.startingStyle] = "startingStyle", n[n.endingStyle = Ei.endingStyle] = "endingStyle", n.anchorHidden = "data-anchor-hidden", n.side = "data-side", n.align = "data-align", n;
})({}), Mc = /* @__PURE__ */ (function(n) {
  return n.popupOpen = "data-popup-open", n.pressed = "data-pressed", n;
})({});
const mO = {
  [Mc.popupOpen]: ""
}, hO = {
  [Mc.popupOpen]: "",
  [Mc.pressed]: ""
}, yO = {
  [or.open]: ""
}, vO = {
  [or.closed]: ""
}, bO = {
  [or.anchorHidden]: ""
}, su = {
  open(n) {
    return n ? mO : null;
  }
}, Ac = {
  open(n) {
    return n ? hO : null;
  }
}, Ho = {
  open(n) {
    return n ? yO : vO;
  },
  anchorHidden(n) {
    return n ? bO : null;
  }
}, xO = {
  ...Ho,
  ..._o
}, fx = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    forceRender: p = !1,
    ...m
  } = o, {
    store: g
  } = fr(), d = g.useState("open"), v = g.useState("nested"), x = g.useState("mounted"), S = g.useState("transitionStatus");
  return nt("div", o, {
    state: {
      open: d,
      transitionStatus: S
    },
    ref: [g.context.backdropRef, a],
    stateAttributesMapping: xO,
    props: [{
      role: "presentation",
      hidden: !x,
      style: {
        userSelect: "none",
        WebkitUserSelect: "none"
      }
    }, m],
    enabled: p || !v
  });
}), dx = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    disabled: p = !1,
    nativeButton: m = !0,
    ...g
  } = o, {
    store: d
  } = fr(), v = d.useState("open"), {
    getButtonProps: x,
    buttonRef: S
  } = Ao({
    disabled: p,
    native: m
  }), C = {
    disabled: p
  };
  function w(M) {
    v && d.setOpen(!1, Ye(f0, M.nativeEvent));
  }
  return nt("button", o, {
    state: C,
    ref: [a, S],
    props: [{
      onClick: w
    }, g, x]
  });
});
function Bn(n) {
  return ar(n, "base-ui");
}
const px = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    id: p,
    ...m
  } = o, {
    store: g
  } = fr(), d = Bn(p);
  return g.useSyncedValueWithCleanup("descriptionElementId", d), nt("p", o, {
    ref: a,
    props: [{
      id: d
    }, m]
  });
});
let SO = /* @__PURE__ */ (function(n) {
  return n.nestedDialogs = "--nested-dialogs", n;
})({}), wO = (function(n) {
  return n[n.open = or.open] = "open", n[n.closed = or.closed] = "closed", n[n.startingStyle = or.startingStyle] = "startingStyle", n[n.endingStyle = or.endingStyle] = "endingStyle", n.nested = "data-nested", n.nestedDialogOpen = "data-nested-dialog-open", n;
})({});
const gx = /* @__PURE__ */ y.createContext(void 0);
function EO() {
  const n = y.useContext(gx);
  if (n === void 0)
    throw new Error(At(26));
  return n;
}
const gi = "ArrowUp", mi = "ArrowDown", zc = "ArrowLeft", Nc = "ArrowRight", cu = "Home", uu = "End", mx = /* @__PURE__ */ new Set([zc, Nc]), TO = /* @__PURE__ */ new Set([zc, Nc, cu, uu]), hx = /* @__PURE__ */ new Set([gi, mi]), RO = /* @__PURE__ */ new Set([gi, mi, cu, uu]), yx = /* @__PURE__ */ new Set([...mx, ...hx]), Ai = /* @__PURE__ */ new Set([...yx, cu, uu]), CO = "Shift", OO = "Control", MO = "Alt", AO = "Meta", zO = /* @__PURE__ */ new Set([CO, OO, MO, AO]);
function NO(n) {
  return Ct(n) && n.tagName === "INPUT";
}
function db(n) {
  return !!(NO(n) && n.selectionStart != null || Ct(n) && n.tagName === "TEXTAREA");
}
function pb(n, o, a, i) {
  if (!n || !o || !o.scrollTo)
    return;
  let u = n.scrollLeft, f = n.scrollTop;
  const p = n.clientWidth < n.scrollWidth, m = n.clientHeight < n.scrollHeight;
  if (p && i !== "vertical") {
    const g = gb(n, o, "left"), d = nc(n), v = nc(o);
    a === "ltr" && (g + o.offsetWidth + v.scrollMarginRight > n.scrollLeft + n.clientWidth - d.scrollPaddingRight ? u = g + o.offsetWidth + v.scrollMarginRight - n.clientWidth + d.scrollPaddingRight : g - v.scrollMarginLeft < n.scrollLeft + d.scrollPaddingLeft && (u = g - v.scrollMarginLeft - d.scrollPaddingLeft)), a === "rtl" && (g - v.scrollMarginRight < n.scrollLeft + d.scrollPaddingLeft ? u = g - v.scrollMarginLeft - d.scrollPaddingLeft : g + o.offsetWidth + v.scrollMarginRight > n.scrollLeft + n.clientWidth - d.scrollPaddingRight && (u = g + o.offsetWidth + v.scrollMarginRight - n.clientWidth + d.scrollPaddingRight));
  }
  if (m && i !== "horizontal") {
    const g = gb(n, o, "top"), d = nc(n), v = nc(o);
    g - v.scrollMarginTop < n.scrollTop + d.scrollPaddingTop ? f = g - v.scrollMarginTop - d.scrollPaddingTop : g + o.offsetHeight + v.scrollMarginBottom > n.scrollTop + n.clientHeight - d.scrollPaddingBottom && (f = g + o.offsetHeight + v.scrollMarginBottom - n.clientHeight + d.scrollPaddingBottom);
  }
  n.scrollTo({
    left: u,
    top: f,
    behavior: "auto"
  });
}
function gb(n, o, a) {
  const i = a === "left" ? "offsetLeft" : "offsetTop";
  let u = 0;
  for (; o.offsetParent && (u += o[i], o.offsetParent !== n); )
    o = o.offsetParent;
  return u;
}
function nc(n) {
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
const DO = {
  ...Ho,
  ..._o,
  nestedDialogOpen(n) {
    return n ? {
      [wO.nestedDialogOpen]: ""
    } : null;
  }
}, vx = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    finalFocus: p,
    initialFocus: m,
    ...g
  } = o, {
    store: d
  } = fr(), v = d.useState("descriptionElementId"), x = d.useState("disablePointerDismissal"), S = d.useState("floatingRootContext"), C = d.useState("popupProps"), w = d.useState("modal"), M = d.useState("mounted"), E = d.useState("nested"), A = d.useState("nestedOpenDialogCount"), O = d.useState("open"), z = d.useState("openMethod"), N = d.useState("titleElementId"), I = d.useState("transitionStatus"), j = d.useState("role"), L = S.useState("floatingId"), _ = g.id ?? L;
  EO(), Jl({
    open: O,
    ref: d.context.popupRef,
    onComplete() {
      O && d.context.onOpenChangeComplete?.(!0);
    }
  });
  const k = m === void 0 ? W0(d.context.popupRef) : m, Y = A > 0, te = d.useStateSetter("popupElement"), Q = nt("div", o, {
    state: {
      open: O,
      nested: E,
      transitionStatus: I,
      nestedDialogOpen: Y
    },
    props: [C, {
      id: _,
      "aria-labelledby": N ?? void 0,
      "aria-describedby": v ?? void 0,
      role: j,
      ...sa,
      hidden: !M,
      onKeyDown(Z) {
        Ai.has(Z.key) && Z.stopPropagation();
      },
      style: {
        [SO.nestedDialogs]: A
      }
    }, g],
    ref: [a, d.context.popupRef, te],
    stateAttributesMapping: DO
  });
  return /* @__PURE__ */ b.jsx(Kc, {
    context: S,
    openInteractionType: z,
    disabled: !M,
    closeOnFocusOut: !x,
    initialFocus: k,
    returnFocus: p,
    modal: w !== !1,
    restoreFocus: "popup",
    children: Q
  });
});
function fu(n) {
  return Dp(19) ? n : n ? "true" : void 0;
}
const du = /* @__PURE__ */ y.forwardRef(function(o, a) {
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
}), bx = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    keepMounted: i = !1,
    ...u
  } = o, {
    store: f
  } = fr(), p = f.useState("mounted"), m = f.useState("modal"), g = f.useState("open");
  return p || i ? /* @__PURE__ */ b.jsx(gx.Provider, {
    value: i,
    children: /* @__PURE__ */ b.jsxs(Fc, {
      ref: a,
      ...u,
      children: [p && m === !0 && /* @__PURE__ */ b.jsx(du, {
        ref: f.context.internalBackdropRef,
        inert: fu(!g)
      }), o.children]
    })
  }) : null;
}), xx = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    id: p,
    ...m
  } = o, {
    store: g
  } = fr(), d = Bn(p);
  return g.useSyncedValueWithCleanup("titleElementId", d), nt("h2", o, {
    ref: a,
    props: [{
      id: d
    }, m]
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
function Sx(n, o) {
  const a = y.useRef(n), i = ze(o);
  xe(() => {
    a.current !== n && i(a.current);
  }, [n, i]), xe(() => {
    a.current = n;
  }, [n]);
}
function wx(n, o) {
  const a = ze((f, p) => {
    (typeof n == "function" ? n() : n) || o(p || // On iOS Safari, the hitslop around touch targets means tapping outside an element's
    // bounds does not fire `pointerdown` but does fire `mousedown`. The `interactionType`
    // will be "" in that case.
    (Bc ? "touch" : ""));
  }), {
    onClick: i,
    onPointerDown: u
  } = jO(a);
  return y.useMemo(() => ({
    onClick: i,
    onPointerDown: u
  }), [i, u]);
}
function Ex(n) {
  const [o, a] = y.useState(null), i = wx(n, a);
  return Sx(n, (u) => {
    u && !n && a(null);
  }), y.useMemo(() => ({
    openMethod: o,
    triggerProps: i
  }), [o, i]);
}
function kO({ ...n }) {
  return /* @__PURE__ */ b.jsx(gO, { "data-slot": "alert-dialog", ...n });
}
function _O({ ...n }) {
  return /* @__PURE__ */ b.jsx(bx, { "data-slot": "alert-dialog-portal", ...n });
}
function HO({
  className: n,
  ...o
}) {
  return /* @__PURE__ */ b.jsx(
    fx,
    {
      "data-slot": "alert-dialog-overlay",
      className: Ke(
        "tw:fixed tw:inset-0 tw:isolate tw:z-[var(--z-modal)] tw:bg-[var(--scrim)] tw:duration-[var(--motion-fast)] tw:supports-backdrop-filter:backdrop-blur-xs",
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
  return /* @__PURE__ */ b.jsxs(_O, { children: [
    /* @__PURE__ */ b.jsx(HO, {}),
    /* @__PURE__ */ b.jsx(
      vx,
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
  return /* @__PURE__ */ b.jsx(
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
const IO = ia(
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
  return /* @__PURE__ */ b.jsx(
    "div",
    {
      "data-slot": "alert-dialog-footer",
      className: Ke(IO({ variant: o }), n),
      ...a
    }
  );
}
const VO = ia(
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
  return /* @__PURE__ */ b.jsx(
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
  return /* @__PURE__ */ b.jsx(
    xx,
    {
      "data-slot": "alert-dialog-title",
      className: Ke(
        "tw:text-[length:var(--fs-title)] tw:font-medium tw:sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2",
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
  return /* @__PURE__ */ b.jsx(
    px,
    {
      "data-slot": "alert-dialog-description",
      className: Ke(
        "tw:text-[length:var(--fs-body-s)] tw:text-balance tw:text-muted-foreground tw:md:text-pretty tw:*:[a]:underline tw:*:[a]:underline-offset-3 tw:*:[a]:hover:text-foreground",
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
  return /* @__PURE__ */ b.jsx(
    ct,
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
  return /* @__PURE__ */ b.jsx(
    dx,
    {
      "data-slot": "alert-dialog-cancel",
      className: Ke(n),
      render: /* @__PURE__ */ b.jsx(ct, { variant: o, size: a }),
      ...i
    }
  );
}
const Tx = /* @__PURE__ */ y.createContext(void 0);
function pu(n) {
  const o = y.useContext(Tx);
  if (o === void 0 && !n)
    throw new Error(At(33));
  return o;
}
const Rx = /* @__PURE__ */ y.createContext(void 0);
function hl(n) {
  const o = y.useContext(Rx);
  if (o === void 0 && !n)
    throw new Error(At(36));
  return o;
}
const FO = /* @__PURE__ */ y.createContext(void 0);
function gu(n = !0) {
  const o = y.useContext(FO);
  if (o === void 0 && !n)
    throw new Error(At(25));
  return o;
}
function aa({
  controlled: n,
  default: o,
  name: a,
  state: i = "value"
}) {
  const {
    current: u
  } = y.useRef(n !== void 0), [f, p] = y.useState(o), m = u ? n : f, g = y.useCallback((d) => {
    u || p(d);
  }, []);
  return [m, g];
}
const Cx = /* @__PURE__ */ y.createContext(void 0);
function KO() {
  const n = y.useContext(Cx);
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
    itemRef: m,
    itemMetadata: g
  } = n, {
    events: d
  } = f.useState("floatingTreeRoot"), v = f.useState("open"), x = gu(!0), S = x !== void 0;
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
      if (x) {
        const w = x.initialCursorPointRef.current;
        if (x.initialCursorPointRef.current = null, S && w && Math.abs(C.clientX - w.x) <= 1 && Math.abs(C.clientY - w.y) <= 1 || S && !Hp && C.button === 2)
          return;
      }
      m.current && f.context.allowMouseUpTriggerRef.current && (!S || C.button === 2) && (!g || g.type === "regular-item") && m.current.click();
    }
  }), [o, a, i, d, u, v, f, p, m, x, S, g]);
}
const Ox = {
  type: "regular-item"
};
function cg(n) {
  const {
    closeOnClick: o,
    disabled: a = !1,
    highlighted: i,
    id: u,
    store: f,
    typingRef: p = f.context.typingRef,
    nativeButton: m,
    itemMetadata: g,
    nodeId: d
  } = n, v = f.useState("disabled"), x = a || v, S = y.useRef(null), {
    getButtonProps: C,
    buttonRef: w
  } = Ao({
    disabled: x,
    focusableWhenDisabled: !0,
    native: m,
    composite: !0
  }), M = QO({
    closeOnClick: o,
    highlighted: i,
    id: u,
    nodeId: d,
    store: f,
    typingRef: p,
    itemRef: S,
    itemMetadata: g
  }), E = y.useCallback((O) => bn(M, {
    onMouseEnter() {
      g.type === "submenu-trigger" && g.setActive();
    }
  }, O, C), [M, C, g]), A = Ro(S, w);
  return y.useMemo(() => ({
    getItemProps: E,
    itemRef: A
  }), [E, A]);
}
const Mx = /* @__PURE__ */ y.createContext({
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
  return y.useContext(Mx);
}
let Ax = /* @__PURE__ */ (function(n) {
  return n[n.None = 0] = "None", n[n.GuessFromOrder = 1] = "GuessFromOrder", n;
})({});
function zi(n = {}) {
  const {
    label: o,
    metadata: a,
    textRef: i,
    indexGuessBehavior: u,
    index: f
  } = n, {
    register: p,
    unregister: m,
    subscribeMapChange: g,
    elementsRef: d,
    labelsRef: v,
    nextIndexRef: x
  } = ZO(), S = y.useRef(-1), [C, w] = y.useState(f ?? (u === Ax.GuessFromOrder ? () => {
    if (S.current === -1) {
      const A = x.current;
      x.current += 1, S.current = A;
    }
    return S.current;
  } : -1)), M = y.useRef(null), E = y.useCallback((A) => {
    if (M.current = A, C !== -1 && A !== null && (d.current[C] = A, v)) {
      const O = o !== void 0;
      v.current[C] = O ? o : i?.current?.textContent ?? A.textContent;
    }
  }, [C, d, v, o, i]);
  return xe(() => {
    if (f != null)
      return;
    const A = M.current;
    if (A)
      return p(A, a), () => {
        m(A);
      };
  }, [f, p, m, a]), xe(() => {
    if (f == null)
      return g((A) => {
        const O = M.current ? A.get(M.current)?.index : null;
        O != null && w(O);
      });
  }, [f, g, w]), {
    ref: E,
    index: C
  };
}
let mb = /* @__PURE__ */ (function(n) {
  return n.checked = "data-checked", n.unchecked = "data-unchecked", n.disabled = "data-disabled", n.highlighted = "data-highlighted", n;
})({});
const zx = {
  checked(n) {
    return n ? {
      [mb.checked]: ""
    } : {
      [mb.unchecked]: ""
    };
  },
  ..._o
}, JO = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    id: f,
    label: p,
    nativeButton: m = !1,
    disabled: g = !1,
    closeOnClick: d = !1,
    checked: v,
    defaultChecked: x,
    onCheckedChange: S,
    style: C,
    ...w
  } = o, M = zi({
    label: p
  }), E = pu(!0), A = Bn(f), {
    store: O
  } = hl(), z = O.useState("isActive", M.index), N = O.useState("itemProps"), [I, j] = aa({
    controlled: v,
    default: x ?? !1,
    name: "MenuCheckboxItem",
    state: "checked"
  }), {
    getItemProps: L,
    itemRef: _
  } = cg({
    closeOnClick: d,
    disabled: g,
    highlighted: z,
    id: A,
    store: O,
    nativeButton: m,
    nodeId: E?.context.nodeId,
    itemMetadata: Ox
  }), k = y.useMemo(() => ({
    disabled: g,
    highlighted: z,
    checked: I
  }), [g, z, I]);
  function Y(F) {
    const Q = Ye($r, F.nativeEvent, void 0, {
      preventUnmountOnClose() {
      }
    });
    S?.(!I, Q), !Q.isCanceled && j((Z) => !Z);
  }
  const te = nt("div", o, {
    state: k,
    stateAttributesMapping: zx,
    props: [N, {
      role: "menuitemcheckbox",
      "aria-checked": I,
      onClick: Y
    }, w, L],
    ref: [_, a, M.ref]
  });
  return /* @__PURE__ */ b.jsx(Cx.Provider, {
    value: k,
    children: te
  });
}), $O = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    keepMounted: p = !1,
    ...m
  } = o, g = KO(), d = y.useRef(null), {
    transitionStatus: v,
    setMounted: x
  } = $c(g.checked);
  Jl({
    open: g.checked,
    ref: d,
    onComplete() {
      g.checked || x(!1);
    }
  });
  const S = {
    checked: g.checked,
    disabled: g.disabled,
    highlighted: g.highlighted,
    transitionStatus: v
  };
  return nt("span", o, {
    state: S,
    ref: [a, d],
    stateAttributesMapping: zx,
    props: {
      "aria-hidden": !0,
      ...m
    },
    enabled: p || g.checked
  });
}), Nx = /* @__PURE__ */ y.createContext(void 0);
function WO() {
  const n = y.useContext(Nx);
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
  } = o, [m, g] = y.useState(void 0), d = nt("div", o, {
    ref: a,
    props: {
      role: "group",
      "aria-labelledby": m,
      ...p
    }
  });
  return /* @__PURE__ */ b.jsx(Nx.Provider, {
    value: g,
    children: d
  });
}), tM = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    id: p,
    ...m
  } = o, g = Bn(p), d = WO();
  return xe(() => (d(g), () => {
    d(void 0);
  }), [d, g]), nt("div", o, {
    ref: a,
    props: {
      id: g,
      role: "presentation",
      ...m
    }
  });
}), nM = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    id: f,
    label: p,
    nativeButton: m = !1,
    disabled: g = !1,
    closeOnClick: d = !0,
    style: v,
    ...x
  } = o, S = zi({
    label: p
  }), C = pu(!0), w = Bn(f), {
    store: M
  } = hl(), E = M.useState("isActive", S.index), A = M.useState("itemProps"), {
    getItemProps: O,
    itemRef: z
  } = cg({
    closeOnClick: d,
    disabled: g,
    highlighted: E,
    id: w,
    store: M,
    nativeButton: m,
    nodeId: C?.context.nodeId,
    itemMetadata: Ox
  });
  return nt("div", o, {
    state: {
      disabled: g,
      highlighted: E
    },
    props: [A, x, O],
    ref: [z, a, S.ref]
  });
}), lM = /* @__PURE__ */ y.createContext(void 0);
function mu(n) {
  return y.useContext(lM);
}
function Ni(n) {
  return n === "starting" ? YR : xt;
}
const oM = {
  ...Ho,
  ..._o
}, rM = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    finalFocus: p,
    ...m
  } = o, {
    store: g
  } = hl(), {
    side: d,
    align: v
  } = pu(), x = mu() != null, S = g.useState("open"), C = g.useState("transitionStatus"), w = g.useState("popupProps"), M = g.useState("mounted"), E = g.useState("instantType"), A = g.useState("activeTriggerElement"), O = g.useState("parent"), z = g.useState("lastOpenChangeReason"), N = g.useState("rootId"), I = g.useState("floatingRootContext"), j = g.useState("floatingTreeRoot"), L = g.useState("closeDelay"), _ = g.useState("activeTriggerElement"), k = g.useState("hoverEnabled"), Y = g.useState("disabled"), te = g.useState("openMethod"), F = O.type === "context-menu";
  Jl({
    open: S,
    ref: g.context.popupRef,
    onComplete() {
      S && g.context.onOpenChangeComplete?.(!0);
    }
  }), y.useEffect(() => {
    function D(U) {
      g.setOpen(!1, Ye(U.reason, U.domEvent));
    }
    return j.events.on("close", D), () => {
      j.events.off("close", D);
    };
  }, [j.events, g]), ig(I, {
    enabled: k && !Y && !F && O.type !== "menubar",
    closeDelay: L
  });
  const Q = y.useCallback((D) => {
    g.set("popupElement", D);
  }, [g]), Z = {
    transitionStatus: C,
    side: d,
    align: v,
    open: S,
    nested: O.type === "menu",
    instant: E
  }, q = nt("div", o, {
    state: Z,
    ref: [a, g.context.popupRef, Q],
    stateAttributesMapping: oM,
    props: [w, {
      onKeyDown(D) {
        x && Ai.has(D.key) && D.stopPropagation();
      }
    }, Ni(C), m, {
      "data-rootownerid": N
    }]
  });
  let H = O.type === void 0 || F;
  return (A || O.type === "menubar" && z !== Gc) && (H = !0), /* @__PURE__ */ b.jsx(Kc, {
    context: I,
    openInteractionType: te,
    modal: F,
    disabled: !M,
    returnFocus: p === void 0 ? H : p,
    initialFocus: O.type !== "menu",
    restoreFocus: !0,
    externalTree: O.type !== "menubar" ? j : void 0,
    previousFocusableElement: _,
    nextFocusableElement: O.type === void 0 ? g.context.triggerFocusTargetRef : void 0,
    beforeContentFocusGuardRef: O.type === void 0 ? g.context.beforeContentFocusGuardRef : void 0,
    children: q
  });
}), Dx = /* @__PURE__ */ y.createContext(void 0);
function aM() {
  const n = y.useContext(Dx);
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
  } = hl();
  return f.useState("mounted") || i ? /* @__PURE__ */ b.jsx(Dx.Provider, {
    value: i,
    children: /* @__PURE__ */ b.jsx(Fc, {
      ref: a,
      ...u
    })
  }) : null;
}), sM = /* @__PURE__ */ y.createContext(void 0);
function hu() {
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
      elements: m,
      middlewareData: g
    } = o, {
      element: d,
      padding: v = 0,
      offsetParent: x = "real"
    } = Kl(n, o) || {};
    if (d == null)
      return {};
    const S = y0(v), C = {
      x: a,
      y: i
    }, w = Yp(u), M = Pp(w), E = await p.getDimensions(d), A = w === "y", O = A ? "top" : "left", z = A ? "bottom" : "right", N = A ? "clientHeight" : "clientWidth", I = f.reference[M] + f.reference[w] - C[w] - f.floating[M], j = C[w] - f.reference[w], L = x === "real" ? await p.getOffsetParent?.(d) : m.floating;
    let _ = m.floating[N] || f.floating[M];
    (!_ || !await p.isElement?.(L)) && (_ = m.floating[N] || f.floating[M]);
    const k = I / 2 - j / 2, Y = _ / 2 - E[M] / 2 - 1, te = Math.min(S[O], Y), F = Math.min(S[z], Y), Q = te, Z = _ - E[M] - F, q = _ / 2 - E[M] / 2 + k, H = h0(Q, q, Z), D = !g.arrow && jo(u) != null && q !== H && f.reference[M] / 2 - (q < Q ? te : F) - E[M] / 2 < 0, U = D ? q < Q ? q - Q : q - Z : 0;
    return {
      [w]: C[w] + U,
      data: {
        [w]: H,
        centerOffset: q - H - U,
        ...D && {
          alignmentOffset: U
        }
      },
      reset: D
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
}, mc = {
  sideX: "left",
  sideY: "top"
}, ug = {
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
      placement: m
    } = n, g = Nt(u), d = g.getComputedStyle(u);
    if (!(d.transitionDuration !== "0s" && d.transitionDuration !== ""))
      return {
        x: o,
        y: a,
        data: mc
      };
    const x = await f.getOffsetParent?.(u);
    let S = {
      width: 0,
      height: 0
    };
    if (p === "fixed" && g?.visualViewport)
      S = {
        width: g.visualViewport.width,
        height: g.visualViewport.height
      };
    else if (x === g) {
      const O = tt(u);
      S = {
        width: O.documentElement.clientWidth,
        height: O.documentElement.clientHeight
      };
    } else await f.isElement?.(x) && (S = await f.getDimensions(x));
    const C = Ln(m);
    let w = o, M = a;
    C === "left" && (w = S.width - (o + i.width)), C === "top" && (M = S.height - (a + i.height));
    const E = C === "left" ? "right" : mc.sideX, A = C === "top" ? "bottom" : mc.sideY;
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
function jx(n, o, a) {
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
    side: jx(o, Ln(u), a),
    align: jo(u) || "center",
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
    collisionBoundary: m,
    collisionPadding: g = 5,
    sticky: d = !1,
    arrowPadding: v = 5,
    disableAnchorTracking: x = !1,
    inline: S,
    // Private parameters
    keepMounted: C = !1,
    floatingRootContext: w,
    mounted: M,
    collisionAvoidance: E,
    shiftCrossAxis: A = !1,
    nodeId: O,
    adaptiveOrigin: z,
    lazyFlip: N = !1,
    externalTree: I
  } = n, [j, L] = y.useState(null);
  !M && j !== null && L(null);
  const _ = E.side || "flip", k = E.align || "flip", Y = E.fallbackAxisSide || "end", te = typeof o == "function" ? o : void 0, F = ze(te), Q = te ? F : o, Z = Yt(o), q = Yt(M), D = hu() === "rtl", U = j || {
    top: "top",
    right: "right",
    bottom: "bottom",
    left: "left",
    "inline-end": D ? "left" : "right",
    "inline-start": D ? "right" : "left"
  }[i], X = f === "center" ? U : `${U}-${f}`;
  let P = g;
  const T = 1, B = i === "bottom" ? T : 0, ne = i === "top" ? T : 0, J = i === "right" ? T : 0, re = i === "left" ? T : 0;
  typeof P == "number" ? P = {
    top: P + B,
    right: P + re,
    bottom: P + ne,
    left: P + J
  } : P && (P = {
    top: (P.top || 0) + B,
    right: (P.right || 0) + re,
    bottom: (P.bottom || 0) + ne,
    left: (P.left || 0) + J
  });
  const ie = {
    boundary: m === "clipping-ancestors" ? "clippingAncestors" : m,
    padding: P
  }, oe = y.useRef(null), se = Yt(u), ge = Yt(p), je = typeof u != "function" ? u : 0, Ee = typeof p != "function" ? p : 0, fe = [];
  S && fe.push(S), fe.push(jC((Qe) => {
    const pt = hb(Qe, i, D), It = typeof se.current == "function" ? se.current(pt) : se.current, Ht = typeof ge.current == "function" ? ge.current(pt) : ge.current;
    return {
      mainAxis: It,
      crossAxis: Ht,
      alignmentAxis: Ht
    };
  }, [je, Ee, D, i]));
  const ye = k === "none" && _ !== "shift", Re = !ye && (d || A || _ === "shift"), _e = _ === "none" ? null : HC({
    ...ie,
    // Ensure the popup flips if it's been limited by its --available-height and it resizes.
    // Since the size() padding is smaller than the flip() padding, flip() will take precedence.
    padding: {
      top: P.top + T,
      right: P.right + T,
      bottom: P.bottom + T,
      left: P.left + T
    },
    mainAxis: !A && _ === "flip",
    crossAxis: k === "flip" ? "alignment" : !1,
    fallbackAxisSideDirection: Y
  }), ke = ye ? null : kC((Qe) => {
    const pt = tt(Qe.elements.floating).documentElement;
    return {
      ...ie,
      // Use the Layout Viewport to avoid shifting around when pinch-zooming
      // for context menus.
      rootBoundary: A ? {
        x: 0,
        y: 0,
        width: pt.clientWidth,
        height: pt.clientHeight
      } : void 0,
      mainAxis: k !== "none",
      crossAxis: Re,
      limiter: d || A ? void 0 : _C((It) => {
        if (!oe.current)
          return {};
        const {
          width: Ht,
          height: Ut
        } = oe.current.getBoundingClientRect(), jt = Wn(Ln(It.placement)), Gt = jt === "y" ? Ht : Ut, Sn = jt === "y" ? P.left + P.right : P.top + P.bottom;
        return {
          offset: Gt / 2 + Sn / 2
        };
      })
    };
  }, [ie, d, A, P, k]);
  _ === "shift" || k === "shift" || f === "center" ? fe.push(ke, _e) : fe.push(_e, ke), fe.push(UC({
    ...ie,
    apply({
      elements: {
        floating: Qe
      },
      availableWidth: pt,
      availableHeight: It,
      rects: Ht
    }) {
      if (!q.current)
        return;
      const Ut = Qe.style;
      Ut.setProperty("--available-width", `${pt}px`), Ut.setProperty("--available-height", `${It}px`);
      const jt = Nt(Qe).devicePixelRatio || 1, {
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
        elements: pt,
        middlewareData: It,
        placement: Ht,
        rects: Ut,
        y: jt
      } = Qe, Gt = Ln(Ht), Sn = Wn(Gt), zn = oe.current, Vn = It.arrow?.x || 0, qt = It.arrow?.y || 0, Pn = zn?.clientWidth || 0, yl = zn?.clientHeight || 0, tl = Vn + Pn / 2, vl = qt + yl / 2, qe = Math.abs(It.shift?.y || 0), St = Ut.reference.height / 2, Xt = typeof u == "function" ? u(hb(Qe, i, D)) : u, ln = qe > Xt, en = {
        top: `${tl}px calc(100% + ${Xt}px)`,
        bottom: `${tl}px ${-Xt}px`,
        left: `calc(100% + ${Xt}px) ${vl}px`,
        right: `${-Xt}px ${vl}px`
      }[Gt], Ot = `${tl}px ${Ut.reference.y + St - jt}px`;
      return pt.floating.style.setProperty("--transform-origin", Re && Sn === "y" && ln ? Ot : en), {};
    }
  }, dM, z), xe(() => {
    !M && w && w.update({
      referenceElement: null,
      floatingElement: null,
      domReferenceElement: null,
      positionReference: null
    });
  }, [M, w]);
  const we = y.useMemo(() => ({
    elementResize: !x && typeof ResizeObserver < "u",
    layoutShift: !x && typeof IntersectionObserver < "u"
  }), [x]), {
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
    open: C ? M : void 0,
    placement: X,
    middleware: fe,
    strategy: a,
    whileElementsMounted: C ? void 0 : (...Qe) => ob(...Qe, we),
    nodeId: O,
    externalTree: I
  }), {
    sideX: be,
    sideY: We
  } = Oe.adaptiveOrigin || mc, rt = Ue ? a : "fixed", mt = y.useMemo(() => {
    const Qe = z ? {
      position: rt,
      [be]: Se,
      [We]: Te
    } : {
      position: rt,
      ...ve
    };
    return Ue || (Qe.opacity = 0), Qe;
  }, [z, rt, be, Se, We, Te, ve, Ue]), Dt = y.useRef(null);
  xe(() => {
    if (!M)
      return;
    const Qe = Z.current, pt = typeof Qe == "function" ? Qe() : Qe, Ht = (yb(pt) ? pt.current : pt) || null || null;
    Ht !== Dt.current && (Ce.setPositionReference(Ht), Dt.current = Ht);
  }, [M, Ce, Q, Z]), y.useEffect(() => {
    if (!M)
      return;
    const Qe = Z.current;
    typeof Qe != "function" && yb(Qe) && Qe.current !== Dt.current && (Ce.setPositionReference(Qe.current), Dt.current = Qe.current);
  }, [M, Ce, Q, Z]), y.useEffect(() => {
    if (C && M && he.reference && he.floating)
      return ob(he.reference, he.floating, He, we);
  }, [C, M, he, He, we]);
  const et = Ln(ae), ht = jx(i, et, D), zt = jo(ae) || "center", yt = !!Oe.hide?.referenceHidden;
  xe(() => {
    N && M && Ue && L(et);
  }, [N, M, Ue, et]);
  const Mn = y.useMemo(() => ({
    position: "absolute",
    top: Oe.arrow?.y,
    left: Oe.arrow?.x
  }), [Oe.arrow]), An = Oe.arrow?.centerOffset !== 0;
  return y.useMemo(() => ({
    positionerStyles: mt,
    arrowStyles: Mn,
    arrowRef: oe,
    arrowUncentered: An,
    side: ht,
    align: zt,
    physicalSide: et,
    anchorHidden: yt,
    refs: Ce,
    context: pe,
    isPositioned: Ue,
    update: He
  }), [mt, Mn, oe, An, ht, zt, et, yt, Ce, pe, Ue, He]);
}
function yb(n) {
  return n != null && "current" in n;
}
function fg(n) {
  const {
    children: o,
    elementsRef: a,
    labelsRef: i,
    onMapChange: u
  } = n, f = ze(u), p = y.useRef(0), m = xn(gM).current, g = xn(pM).current, [d, v] = y.useState(0), x = y.useRef(d), S = ze((A, O) => {
    g.set(A, O ?? null), x.current += 1, v(x.current);
  }), C = ze((A) => {
    g.delete(A), x.current += 1, v(x.current);
  }), w = y.useMemo(() => {
    const A = /* @__PURE__ */ new Map();
    return Array.from(g.keys()).filter((z) => z.isConnected).sort(mM).forEach((z, N) => {
      const I = g.get(z) ?? {};
      A.set(z, {
        ...I,
        index: N
      });
    }), A;
  }, [g, d]);
  xe(() => {
    if (typeof MutationObserver != "function" || w.size === 0)
      return;
    const A = new MutationObserver((O) => {
      const z = /* @__PURE__ */ new Set(), N = (I) => z.has(I) ? z.delete(I) : z.add(I);
      O.forEach((I) => {
        I.removedNodes.forEach(N), I.addedNodes.forEach(N);
      }), z.size === 0 && (x.current += 1, v(x.current));
    });
    return w.forEach((O, z) => {
      z.parentElement && A.observe(z.parentElement, {
        childList: !0
      });
    }), () => {
      A.disconnect();
    };
  }, [w]), xe(() => {
    x.current === d && (a.current.length !== w.size && (a.current.length = w.size), i && i.current.length !== w.size && (i.current.length = w.size), p.current = w.size), f(w);
  }, [f, w, a, i, d]), xe(() => () => {
    a.current = [];
  }, [a]), xe(() => () => {
    i && (i.current = []);
  }, [i]);
  const M = ze((A) => (m.add(A), () => {
    m.delete(A);
  }));
  xe(() => {
    m.forEach((A) => A(w));
  }, [m, w]);
  const E = y.useMemo(() => ({
    register: S,
    unregister: C,
    subscribeMapChange: M,
    elementsRef: a,
    labelsRef: i,
    nextIndexRef: p
  }), [S, C, M, a, i, p]);
  return /* @__PURE__ */ b.jsx(Mx.Provider, {
    value: E,
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
function vu(n, o, {
  styles: a,
  transitionStatus: i,
  props: u,
  refs: f,
  hidden: p,
  inert: m = !1
}) {
  const g = {
    ...a
  };
  return m && (g.pointerEvents = "none"), nt("div", n, {
    state: o,
    ref: f,
    props: [{
      role: "presentation",
      hidden: p,
      style: g
    }, Ni(i), u],
    stateAttributesMapping: Ho
  });
}
const hM = 20;
function dg(n, o, a, i) {
  const [u, f] = y.useState(!1);
  xe(() => {
    if (!n || !o || a == null) {
      f(!1);
      return;
    }
    const p = tt(a).documentElement.clientWidth, m = a.offsetWidth;
    f(p > 0 && m > 0 && m >= p - hM);
  }, [n, o, a]), a0(n && (!o || u), i);
}
const yM = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    anchor: i,
    positionMethod: u = "absolute",
    className: f,
    render: p,
    side: m,
    align: g,
    sideOffset: d = 0,
    alignOffset: v = 0,
    collisionBoundary: x = "clipping-ancestors",
    collisionPadding: S = 5,
    arrowPadding: C = 5,
    sticky: w = !1,
    disableAnchorTracking: M = !1,
    collisionAvoidance: E = N0,
    style: A,
    ...O
  } = o, {
    store: z
  } = hl(), N = aM(), I = gu(!0), j = z.useState("parent"), L = z.useState("floatingRootContext"), _ = z.useState("floatingTreeRoot"), k = z.useState("mounted"), Y = z.useState("open"), te = z.useState("modal"), F = z.useState("openMethod"), Q = z.useState("activeTriggerElement"), Z = z.useState("transitionStatus"), q = z.useState("positionerElement"), H = z.useState("instantType"), D = z.useState("hasViewport"), U = z.useState("lastOpenChangeReason"), X = z.useState("floatingNodeId"), P = z.useState("floatingParentNodeId"), T = L.useState("domReferenceElement"), B = y.useRef(null), ne = $p(q, !1, !1);
  let J = i, re = d, ie = v, oe = g, se = E;
  j.type === "context-menu" && (J = i ?? j.context?.anchor, oe = oe ?? "start", !m && oe !== "center" && (ie = o.alignOffset ?? 2, re = o.sideOffset ?? -5));
  let ge = m, je = oe;
  j.type === "menu" ? (ge = ge ?? "inline-end", je = je ?? "start", se = o.collisionAvoidance ?? Xp) : j.type === "menubar" && (ge = ge ?? (j.context.orientation === "vertical" ? "inline-end" : "bottom"), je = je ?? "start");
  const Ee = j.type === "context-menu", fe = yu({
    anchor: J,
    floatingRootContext: L,
    positionMethod: I ? "fixed" : u,
    mounted: k,
    side: ge,
    sideOffset: re,
    align: je,
    alignOffset: ie,
    arrowPadding: Ee ? 0 : C,
    collisionBoundary: x,
    collisionPadding: S,
    sticky: w,
    nodeId: X,
    keepMounted: N,
    disableAnchorTracking: M,
    collisionAvoidance: se,
    shiftCrossAxis: Ee && !("side" in se && se.side === "flip"),
    externalTree: _,
    adaptiveOrigin: D ? ug : void 0
  });
  y.useEffect(() => {
    function Se(Te) {
      Te.open && (Te.parentNodeId === X && z.set("hoverEnabled", !1), Te.nodeId !== X && Te.parentNodeId === z.select("floatingParentNodeId") && z.setOpen(!1, Ye(ai)));
    }
    return _.events.on("menuopenchange", Se), () => {
      _.events.off("menuopenchange", Se);
    };
  }, [z, _.events, X]), y.useEffect(() => {
    if (z.select("floatingParentNodeId") == null)
      return;
    function Se(Te) {
      if (Te.open || Te.nodeId !== z.select("floatingParentNodeId"))
        return;
      const Oe = Te.reason ?? ai;
      z.setOpen(!1, Ye(Oe));
    }
    return _.events.on("menuopenchange", Se), () => {
      _.events.off("menuopenchange", Se);
    };
  }, [_.events, z]);
  const ye = sn();
  y.useEffect(() => {
    Y || ye.clear();
  }, [Y, ye]), y.useEffect(() => {
    function Se(Te) {
      if (!(!Y || Te.nodeId !== z.select("floatingParentNodeId")))
        if (Te.target && Q && Q !== Te.target) {
          const Oe = z.select("closeDelay");
          Oe > 0 ? ye.isStarted() || ye.start(Oe, () => {
            z.setOpen(!1, Ye(ai));
          }) : z.setOpen(!1, Ye(ai));
        } else
          ye.clear();
    }
    return _.events.on("itemhover", Se), () => {
      _.events.off("itemhover", Se);
    };
  }, [_.events, Y, Q, z, ye]), y.useEffect(() => {
    const Se = {
      open: Y,
      nodeId: X,
      parentNodeId: P,
      reason: z.select("lastOpenChangeReason")
    };
    _.events.emit("menuopenchange", Se);
  }, [_.events, Y, z, X, P]), xe(() => {
    const Se = T, Te = B.current;
    if (Se && (B.current = Se), Te && Se && Se !== Te) {
      z.set("instantType", void 0);
      const Oe = new AbortController();
      return ne(() => {
        z.set("instantType", "trigger-change");
      }, Oe.signal), () => {
        Oe.abort();
      };
    }
  }, [T, ne, z]);
  const Re = {
    open: Y,
    side: fe.side,
    align: fe.align,
    anchorHidden: fe.anchorHidden,
    nested: j.type === "menu",
    instant: H
  }, _e = j.type === "menubar" && j.context.modal;
  dg(Y && (_e || te && U !== Pt), F === "touch", q, Q);
  const we = vu(o, Re, {
    styles: fe.positionerStyles,
    transitionStatus: Z,
    props: O,
    refs: [a, z.useStateSetter("positionerElement")],
    hidden: !k,
    inert: !Y
  }), Ce = k && j.type !== "menu" && (j.type !== "menubar" && te && U !== Pt || j.type === "menubar" && j.context.modal);
  let he = null;
  return j.type === "menubar" ? he = j.context.contentElement : j.type === void 0 && (he = Q), /* @__PURE__ */ b.jsxs(Tx.Provider, {
    value: fe,
    children: [Ce && /* @__PURE__ */ b.jsx(du, {
      ref: j.type === "context-menu" || j.type === "nested-context-menu" ? j.context.internalBackdropRef : null,
      inert: fu(!Y),
      cutout: he
    }), /* @__PURE__ */ b.jsx(L0, {
      id: X,
      children: /* @__PURE__ */ b.jsx(fg, {
        elementsRef: z.context.itemDomElements,
        labelsRef: z.context.itemLabels,
        children: we
      })
    })]
  });
}), vM = /* @__PURE__ */ y.createContext(null);
function kx(n) {
  return y.useContext(vM);
}
const bM = {
  ...ou,
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
class pg extends Mi {
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
      triggerElements: new ca()
    }, bM), this.unsubscribeParentListener = this.observe("parent", (a) => {
      if (this.unsubscribeParentListener?.(), a.type === "menu") {
        let i = a.store.select("rootId"), u = a.store.select("floatingTreeRoot"), f = a.store.select("keyboardEventRelay");
        this.unsubscribeParentListener = a.store.subscribe(() => {
          const p = a.store.select("rootId"), m = a.store.select("floatingTreeRoot"), g = a.store.select("keyboardEventRelay");
          i === p && u === m && f === g || (i = p, u = m, f = g, this.notifyAll());
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
    const i = xn(() => new pg(a)).current;
    return o ?? i;
  }
  unsubscribeParentListener = null;
}
function xM() {
  return {
    ...lu(),
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
    floatingTreeRoot: new Fp(),
    floatingNodeId: void 0,
    floatingParentNodeId: null,
    itemProps: xt,
    keyboardEventRelay: void 0,
    closeDelay: 0,
    hasViewport: !1
  };
}
const _x = /* @__PURE__ */ y.createContext(void 0);
function Hx() {
  return y.useContext(_x);
}
const Ux = Jp(function(o) {
  const {
    children: a,
    open: i,
    onOpenChange: u,
    onOpenChangeComplete: f,
    defaultOpen: p = !1,
    disabled: m = !1,
    modal: g,
    loopFocus: d = !0,
    orientation: v = "vertical",
    actionsRef: x,
    closeParentOnEsc: S = !1,
    handle: C,
    triggerId: w,
    defaultTriggerId: M = null,
    highlightItemOnHover: E = !0
  } = o, A = gu(!0), O = hl(!0), z = kx(!0), N = Hx(), I = y.useMemo(() => N && O ? {
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
  }, [A, O, z, N]), j = pg.useStore(C?.store, {
    open: p,
    openProp: i,
    activeTriggerId: M,
    triggerIdProp: w,
    parent: I
  });
  tg(j, i, p, M), j.useControlledProp("openProp", i), j.useControlledProp("triggerIdProp", w), j.useContextCallback("onOpenChangeComplete", f);
  const L = ar(), _ = ar(), k = j.useState("floatingTreeRoot"), Y = Kp(k), te = Zl(), F = j.useState("open"), Q = j.useState("activeTriggerElement"), Z = j.useState("positionerElement"), q = j.useState("hoverEnabled"), H = j.useState("disabled"), D = j.useState("lastOpenChangeReason"), U = j.useState("parent"), X = j.useState("activeIndex"), P = j.useState("payload"), T = j.useState("floatingParentNodeId"), B = y.useRef(null), ne = y.useRef(U.type !== "context-menu"), J = sn(), re = y.useRef(!0), ie = sn(), oe = T != null, {
    openMethod: se,
    triggerProps: ge
  } = Ex(F);
  j.useSyncedValues({
    disabled: m,
    highlightItemOnHover: E,
    modal: U.type === void 0 ? g : void 0,
    openMethod: se,
    rootId: L
  }), eu(j);
  const {
    forceUnmount: je
  } = tu(F, j, () => {
    j.update({
      allowMouseEnter: !1,
      stickIfOpen: !0
    });
  });
  xe(() => {
    A && !O ? j.update({
      parent: {
        type: "context-menu",
        context: A
      },
      floatingNodeId: Y,
      floatingParentNodeId: te
    }) : O && j.update({
      floatingNodeId: Y,
      floatingParentNodeId: te
    });
  }, [A, O, Y, te, j]), y.useEffect(() => {
    if (F || (B.current = null), U.type === "context-menu") {
      if (!F) {
        J.clear(), ne.current = !1;
        return;
      }
      J.start(500, () => {
        ne.current = !0;
      });
    }
  }, [J, F, U.type]), xe(() => {
    !F && !q && j.set("hoverEnabled", !0);
  }, [F, q, j]);
  const Ee = ze((be, We) => {
    const rt = We.reason;
    if (F === be && We.trigger === Q && D === rt)
      return;
    const mt = eg(We);
    if (!be && We.trigger == null && (We.trigger = Q ?? void 0), u?.(be, We), We.isCanceled)
      return;
    j.state.floatingRootContext.dispatchOpenChange(be, We);
    const Dt = We.event;
    if (be === !1 && Dt?.type === "click" && Dt.pointerType === "touch" && !re.current)
      return;
    be && rt === Jr ? (re.current = !1, ie.start(300, () => {
      re.current = !0;
    })) : (re.current = !0, ie.clear());
    const et = (rt === Fl || rt === $r) && Dt.detail === 0 && Dt?.isTrusted, ht = !be && (rt === Ri || rt == null), zt = {
      open: be,
      openChangeReason: rt
    };
    B.current = We.event ?? null, Wc(zt, be, We.trigger, mt()), j.update(zt), U.type === "menubar" && (rt === Jr || rt === Co || rt === Pt || rt === dp || rt === ai) ? j.set("instantType", "group") : et || ht ? j.set("instantType", et ? "click" : "dismiss") : j.set("instantType", void 0);
  }), fe = $0({
    popupStore: j,
    floatingId: _,
    nested: te != null,
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
    j.setOpen(!1, Ye(qc));
  }, [j]);
  y.useImperativeHandle(x, () => ({
    unmount: je,
    close: Re
  }), [je, Re]);
  let _e;
  U.type === "context-menu" && (_e = U.context), y.useImperativeHandle(_e?.positionerRef, () => Z, [Z]), y.useImperativeHandle(_e?.actionsRef, () => ({
    setOpen: Ee
  }), [Ee]);
  const ke = Oi(fe, {
    enabled: !H,
    bubbles: {
      escapeKey: S && U.type === "menu"
    },
    outsidePress() {
      return U.type !== "context-menu" || B.current?.type === "contextmenu" ? !0 : ne.current;
    },
    externalTree: oe ? k : void 0
  }), we = hu(), Ce = y.useCallback((be) => {
    j.select("activeIndex") !== be && j.set("activeIndex", be);
  }, [j]), he = ax(fe, {
    enabled: !H,
    listRef: j.context.itemDomElements,
    activeIndex: X,
    nested: U.type !== void 0,
    loopFocus: d,
    orientation: v,
    parentOrientation: U.type === "menubar" ? U.context.orientation : void 0,
    rtl: we === "rtl",
    disabledIndices: Xl,
    onNavigate: Ce,
    openOnArrowKeyDown: U.type !== "context-menu",
    externalTree: oe ? k : void 0,
    focusItemOnHover: E
  }), Se = y.useCallback((be) => {
    j.context.typingRef.current = be;
  }, [j]), Te = ix(fe, {
    enabled: !H,
    listRef: j.context.itemLabels,
    elementsRef: j.context.itemDomElements,
    activeIndex: X,
    resetMs: PR,
    onMatch: (be) => {
      F && be !== X && j.set("activeIndex", be);
    },
    onTyping: Se
  }), Oe = y.useMemo(() => {
    const be = bn(Te.reference, he.reference, ke.reference, {
      onMouseMove() {
        j.set("allowMouseEnter", !0);
      }
    }, ge);
    return be["aria-haspopup"] = "menu", be["aria-expanded"] = F, be;
  }, [j, Te.reference, he.reference, ke.reference, ge, F]), He = y.useMemo(() => {
    const be = bn(he.trigger, ke.trigger, ge);
    return be["aria-haspopup"] = "menu", be["aria-expanded"] = !1, be;
  }, [he.trigger, ke.trigger, ge]), ae = y.useMemo(() => bn(sa, {
    id: _,
    role: "menu",
    "aria-labelledby": Q?.id,
    onMouseMove() {
      j.set("allowMouseEnter", !0), U.type === "menu" && j.set("hoverEnabled", !1);
    },
    onClick() {
      j.select("hoverEnabled") && j.set("hoverEnabled", !1);
    },
    onKeyDown(be) {
      const We = j.select("keyboardEventRelay");
      We && !be.isPropagationStopped() && We(be);
    }
  }, Te.floating, he.floating, ke.floating), [Q, _, U.type, j, Te.floating, he.floating, ke.floating]), pe = he.item ?? xt;
  nu(j, {
    floatingRootContext: fe,
    activeTriggerProps: Oe,
    inactiveTriggerProps: He,
    popupProps: ae,
    itemProps: pe
  });
  const Ue = y.useMemo(() => ({
    store: j,
    parent: I
  }), [j, I]), ve = /* @__PURE__ */ b.jsx(Rx.Provider, {
    value: Ue,
    children: typeof a == "function" ? a({
      payload: P
    }) : a
  });
  return U.type === void 0 || U.type === "context-menu" ? /* @__PURE__ */ b.jsx(I0, {
    externalTree: k,
    children: ve
  }) : ve;
});
function SM(n) {
  const o = hl().store, a = y.useMemo(() => ({
    parentMenu: o
  }), [o]);
  return /* @__PURE__ */ b.jsx(_x.Provider, {
    value: a,
    children: /* @__PURE__ */ b.jsx(Ux, {
      ...n
    })
  });
}
function Lx(n) {
  const o = n.getBoundingClientRect(), a = Nt(n);
  if (Up)
    return o;
  const i = a.getComputedStyle(n, "::before"), u = a.getComputedStyle(n, "::after");
  if (!(i.content !== "none" || u.content !== "none"))
    return o;
  const p = parseFloat(i.width) || 0, m = parseFloat(i.height) || 0, g = parseFloat(u.width) || 0, d = parseFloat(u.height) || 0, v = Math.max(o.width, p, g), x = Math.max(o.height, m, d), S = v - o.width, C = x - o.height;
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
  } = Np(), {
    ref: u,
    index: f
  } = zi(n), p = a === f, m = y.useRef(null), g = Ro(u, m);
  return {
    compositeProps: {
      tabIndex: p ? 0 : -1,
      onFocus() {
        i(f);
      },
      onMouseMove() {
        const v = m.current;
        if (!o || !v)
          return;
        const x = v.hasAttribute("disabled") || v.ariaDisabled === "true";
        !p && !x && v.focus();
      }
    },
    compositeRef: g,
    index: f
  };
}
function Ix(n) {
  const {
    render: o,
    className: a,
    style: i,
    state: u = xt,
    props: f = Xl,
    refs: p = Xl,
    metadata: m,
    stateAttributesMapping: g,
    tag: d = "div",
    ...v
  } = n, {
    compositeProps: x,
    compositeRef: S
  } = wM({
    metadata: m
  });
  return nt(d, n, {
    state: u,
    ref: [...p, S],
    props: [x, ...f, v],
    stateAttributesMapping: g
  });
}
function Bx(n) {
  if (Ct(n) && n.hasAttribute("data-rootownerid"))
    return n.getAttribute("data-rootownerid") ?? void 0;
  if (!Pl(n))
    return Bx(ql(n));
}
function Vx(n, o) {
  const a = y.useRef(null);
  function i(f) {
    ml.flushSync(() => {
      n.setOpen(!1, Ye(Co, f.nativeEvent, f.currentTarget));
    }), UR(a.current)?.focus();
  }
  function u(f) {
    const p = n.select("positionerElement");
    if (p && Wr(f, p))
      n.context.beforeContentFocusGuardRef.current?.focus();
    else {
      ml.flushSync(() => {
        n.setOpen(!1, Ye(Co, f.nativeEvent, f.currentTarget));
      });
      let m = HR(n.context.triggerFocusTargetRef.current || o.current);
      for (; m !== null && Le(p, m); ) {
        const g = m;
        if (m = qp(m), m === g)
          break;
      }
      m?.focus();
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
const lc = 2, TM = Z0(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    disabled: p = !1,
    nativeButton: m = !0,
    id: g,
    openOnHover: d,
    delay: v = 100,
    closeDelay: x = 0,
    handle: S,
    payload: C,
    ...w
  } = o, M = hl(!0), E = S?.store ?? M?.store;
  if (!E)
    throw new Error(At(85));
  const A = Bn(g), O = E.useState("isTriggerActive", A), z = E.useState("floatingRootContext"), N = E.useState("isOpenedByTrigger", A), I = E.useState("triggerPopupId", A), j = y.useRef(null), L = CM(), _ = Np(!0), k = ko(), Y = y.useMemo(() => k ?? new Fp(), [k]), te = Kp(Y), F = Zl(), {
    registerTrigger: Q,
    isMountedByThisTrigger: Z
  } = ng(A, j, E, {
    payload: C,
    closeDelay: x,
    parent: L,
    floatingTreeRoot: Y,
    floatingNodeId: te,
    floatingParentNodeId: F,
    keyboardEventRelay: _?.relayKeyboardEvent
  }), q = L.type === "menubar", H = E.useState("disabled"), D = p || H || q && L.context.disabled, {
    getButtonProps: U,
    buttonRef: X
  } = Ao({
    disabled: D,
    native: m
  });
  y.useEffect(() => {
    !N && L.type === void 0 && (E.context.allowMouseUpTriggerRef.current = !1);
  }, [E, N, L.type]);
  const P = y.useRef(null), T = sn(), B = ze((he) => {
    if (!P.current)
      return;
    T.clear(), E.context.allowMouseUpTriggerRef.current = !1;
    const Se = he.target;
    if (Le(P.current, Se) || Le(E.select("positionerElement"), Se) || Se === P.current || Se != null && Bx(Se) === E.select("rootId"))
      return;
    const Te = Lx(P.current);
    he.clientX >= Te.left - lc && he.clientX <= Te.right + lc && he.clientY >= Te.top - lc && he.clientY <= Te.bottom + lc || Y.events.emit("close", {
      domEvent: he,
      reason: d0
    });
  });
  y.useEffect(() => {
    N && E.select("lastOpenChangeReason") === Pt && tt(P.current).addEventListener("mouseup", B, {
      once: !0
    });
  }, [N, B, E]);
  const ne = q && L.context.hasSubmenuOpen, re = ru(z, {
    enabled: (d ?? ne) && !D && L.type !== "context-menu" && (!q || ne && !Z),
    handleClose: iu({
      blockPointerEvents: !q
    }),
    mouseOnly: !0,
    move: !1,
    restMs: L.type === void 0 ? v : void 0,
    delay: {
      close: x
    },
    triggerElementRef: j,
    externalTree: Y,
    isActiveTrigger: O,
    isClosing: () => E.select("transitionStatus") === "ending"
  }), ie = RM(N, E.select("lastOpenChangeReason")), oe = Qc(z, {
    enabled: !D && L.type !== "context-menu",
    event: N && q ? "click" : "mousedown",
    toggle: !0,
    ignoreMouse: !1,
    stickIfOpen: L.type === void 0 ? ie : !1
  }), se = ox(z, {
    enabled: !D && ne
  }), ge = EM({
    open: N,
    enabled: q,
    mouseDownAction: "open"
  }), je = y.useMemo(() => bn(se.reference, oe.reference), [se.reference, oe.reference]), Ee = E.useState("triggerProps", Z), {
    preFocusGuardRef: fe,
    handlePreFocusGuardFocus: ye,
    handleFocusTargetFocus: Re
  } = Vx(E, j), _e = {
    disabled: D,
    open: N
  }, ke = [P, a, X, Q, j], we = [je, re ?? xt, Ee, {
    "aria-haspopup": "menu",
    "aria-controls": I,
    id: A,
    onMouseDown: (he) => {
      if (E.select("open"))
        return;
      T.start(200, () => {
        E.context.allowMouseUpTriggerRef.current = !0;
      }), tt(he.currentTarget).addEventListener("mouseup", B, {
        once: !0
      });
    }
  }, q ? {
    role: "menuitem"
  } : {}, ge, w, U], Ce = nt("button", o, {
    enabled: !q,
    stateAttributesMapping: Ac,
    state: _e,
    ref: ke,
    props: we
  });
  return q ? /* @__PURE__ */ b.jsx(Ix, {
    tag: "button",
    render: i,
    className: u,
    style: f,
    state: _e,
    refs: ke,
    props: we,
    stateAttributesMapping: Ac
  }) : N ? /* @__PURE__ */ b.jsxs(y.Fragment, {
    children: [/* @__PURE__ */ b.jsx(Oo, {
      ref: fe,
      onFocus: ye
    }, `${A}-pre-focus-guard`), /* @__PURE__ */ b.jsx(y.Fragment, {
      children: Ce
    }, A), /* @__PURE__ */ b.jsx(Oo, {
      ref: E.context.triggerFocusTargetRef,
      onFocus: Re
    }, `${A}-post-focus-guard`)]
  }) : /* @__PURE__ */ b.jsx(y.Fragment, {
    children: Ce
  }, A);
});
function RM(n, o) {
  const a = sn(), [i, u] = y.useState(!1);
  return xe(() => {
    n && o === "trigger-hover" ? (u(!0), a.start(A0, () => {
      u(!1);
    })) : n || (a.clear(), u(!1));
  }, [n, o, a]), i;
}
function CM() {
  const n = gu(!0), o = hl(!0), a = kx();
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
const Px = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    className: i,
    render: u,
    orientation: f = "horizontal",
    style: p,
    ...m
  } = o;
  return nt("div", o, {
    state: {
      orientation: f
    },
    ref: a,
    props: [{
      role: "separator",
      "aria-orientation": f
    }, m]
  });
});
function Yx(n) {
  return n == null || n.hasAttribute("disabled") || n.getAttribute("aria-disabled") === "true";
}
const MM = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    label: p,
    id: m,
    nativeButton: g = !1,
    openOnHover: d = !0,
    delay: v = 100,
    closeDelay: x = 0,
    disabled: S = !1,
    ...C
  } = o, w = zi({
    label: p
  }), M = pu(), {
    store: E
  } = hl(), A = Bn(m), O = E.useState("open"), z = E.useState("floatingRootContext"), N = E.useState("floatingTreeRoot"), I = E.useState("triggerPopupId", A), j = ex(A, E), L = y.useCallback((oe) => {
    const se = j(oe);
    return oe !== null && E.select("open") && E.select("activeTriggerId") == null && E.update({
      activeTriggerId: A,
      activeTriggerElement: oe,
      closeDelay: x
    }), se;
  }, [j, x, E, A]), _ = y.useRef(null), k = y.useCallback((oe) => {
    _.current = oe, E.set("activeTriggerElement", oe);
  }, [E]), Y = Hx();
  if (!Y?.parentMenu)
    throw new Error(At(37));
  E.useSyncedValue("closeDelay", x);
  const te = Y.parentMenu, F = E.useState("disabled"), Q = te.useState("disabled"), Z = S || F || Q, q = te.useState("itemProps"), H = te.useState("isActive", w.index), D = y.useMemo(() => ({
    type: "submenu-trigger",
    setActive() {
      te.select("highlightItemOnHover") && te.set("activeIndex", w.index);
    }
  }), [te, w.index]), {
    getItemProps: U,
    itemRef: X
  } = cg({
    closeOnClick: !1,
    disabled: Z,
    highlighted: H,
    id: A,
    store: E,
    typingRef: te.context.typingRef,
    nativeButton: g,
    itemMetadata: D,
    nodeId: M?.context.nodeId
  }), P = E.useState("hoverEnabled"), T = ru(z, {
    enabled: P && d && !Z,
    handleClose: iu({
      blockPointerEvents: !0
    }),
    mouseOnly: !0,
    move: !0,
    restMs: v,
    delay: {
      open: v,
      close: x
    },
    shouldOpen: v > 0 ? () => te.select("allowMouseEnter") : void 0,
    triggerElementRef: _,
    externalTree: N,
    isClosing: () => E.select("transitionStatus") === "ending"
  }), ne = Qc(z, {
    enabled: !Z,
    event: "mousedown",
    toggle: !d,
    ignoreMouse: d,
    stickIfOpen: !1
  }).reference ?? xt, J = E.useState("triggerProps", !0);
  return delete J.id, nt("div", o, {
    state: {
      disabled: Z,
      highlighted: H,
      open: O
    },
    stateAttributesMapping: su,
    props: [ne, T, J, q, {
      "aria-controls": I,
      tabIndex: O || H ? 0 : -1,
      onBlur() {
        H && te.set("activeIndex", null);
      }
    }, C, U],
    ref: [a, w.ref, X, L, k]
  });
});
function oc({ ...n }) {
  return /* @__PURE__ */ b.jsx(Ux, { "data-slot": "dropdown-menu", ...n });
}
function rc({ ...n }) {
  return /* @__PURE__ */ b.jsx(TM, { "data-slot": "dropdown-menu-trigger", ...n });
}
function ii({
  align: n = "start",
  alignOffset: o = 0,
  side: a = "bottom",
  sideOffset: i = 4,
  className: u,
  ...f
}) {
  return /* @__PURE__ */ b.jsx(iM, { children: /* @__PURE__ */ b.jsx(
    yM,
    {
      className: "tw:isolate tw:z-[var(--z-popover)] tw:outline-none",
      align: n,
      alignOffset: o,
      side: a,
      sideOffset: i,
      children: /* @__PURE__ */ b.jsx(
        rM,
        {
          "data-slot": "dropdown-menu-content",
          className: Ke("tw:max-h-(--available-height) tw:min-w-32 tw:max-w-72 tw:origin-(--transform-origin) tw:overflow-x-hidden tw:overflow-y-auto tw:rounded-[var(--radius-control)] tw:bg-popover tw:p-1 tw:text-[length:var(--fs-body-s)] tw:text-popover-foreground tw:shadow-[var(--elevation-overlay)] tw:ring-1 tw:ring-foreground/10 tw:outline-none", u),
          ...f
        }
      )
    }
  ) });
}
function Ll({ ...n }) {
  return /* @__PURE__ */ b.jsx(eM, { "data-slot": "dropdown-menu-group", ...n });
}
function AM({
  className: n,
  inset: o,
  ...a
}) {
  return /* @__PURE__ */ b.jsx(
    tM,
    {
      "data-slot": "dropdown-menu-label",
      "data-inset": o,
      className: Ke(
        "tw:px-1.5 tw:py-1 tw:text-[length:var(--fs-caption)] tw:font-medium tw:text-muted-foreground tw:data-inset:pl-7",
        n
      ),
      ...a
    }
  );
}
function fl({
  className: n,
  inset: o,
  variant: a = "default",
  ...i
}) {
  return /* @__PURE__ */ b.jsx(
    nM,
    {
      "data-slot": "dropdown-menu-item",
      "data-inset": o,
      "data-variant": a,
      className: Ke(
        "tw:group/dropdown-menu-item tw:relative tw:flex tw:cursor-default tw:items-center tw:gap-1.5 tw:overflow-hidden tw:rounded-[var(--radius-control)] tw:px-1.5 tw:py-1 tw:text-[length:var(--fs-body-s)] tw:text-ellipsis tw:whitespace-nowrap tw:outline-hidden tw:select-none tw:focus:bg-accent tw:focus:text-accent-foreground tw:not-data-[variant=destructive]:focus:**:text-accent-foreground tw:data-inset:pl-7 tw:data-[variant=destructive]:text-destructive tw:data-[variant=destructive]:focus:bg-destructive/10 tw:data-[variant=destructive]:focus:text-destructive tw:data-disabled:pointer-events-none tw:data-disabled:opacity-50 tw:[&_svg]:pointer-events-none tw:[&_svg]:shrink-0 tw:[&_svg:not([class*=size-])]:size-4 tw:data-[variant=destructive]:*:[svg]:text-destructive",
        n
      ),
      ...i
    }
  );
}
function zM({ ...n }) {
  return /* @__PURE__ */ b.jsx(SM, { "data-slot": "dropdown-menu-sub", ...n });
}
function NM({
  className: n,
  inset: o,
  children: a,
  ...i
}) {
  return /* @__PURE__ */ b.jsxs(
    MM,
    {
      "data-slot": "dropdown-menu-sub-trigger",
      "data-inset": o,
      className: Ke(
        "tw:flex tw:cursor-default tw:items-center tw:gap-1.5 tw:rounded-[var(--radius-control)] tw:px-1.5 tw:py-1 tw:text-[length:var(--fs-body-s)] tw:outline-hidden tw:select-none tw:focus:bg-accent tw:focus:text-accent-foreground tw:not-data-[variant=destructive]:focus:**:text-accent-foreground tw:data-inset:pl-7 tw:data-popup-open:bg-accent tw:data-popup-open:text-accent-foreground tw:data-open:bg-accent tw:data-open:text-accent-foreground tw:[&_svg]:pointer-events-none tw:[&_svg]:shrink-0 tw:[&_svg:not([class*=size-])]:size-4",
        n
      ),
      ...i,
      children: [
        a,
        /* @__PURE__ */ b.jsx(lp, { className: "tw:ml-auto" })
      ]
    }
  );
}
function DM({
  align: n = "start",
  alignOffset: o = -3,
  side: a = "right",
  sideOffset: i = 0,
  className: u,
  ...f
}) {
  return /* @__PURE__ */ b.jsx(
    ii,
    {
      "data-slot": "dropdown-menu-sub-content",
      className: Ke("tw:w-auto tw:min-w-[96px] tw:rounded-[var(--radius-control)] tw:bg-popover tw:p-1 tw:text-popover-foreground tw:shadow-[var(--elevation-overlay)] tw:ring-1 tw:ring-foreground/10", u),
      align: n,
      alignOffset: o,
      side: a,
      sideOffset: i,
      ...f
    }
  );
}
function vb({
  className: n,
  children: o,
  checked: a,
  inset: i,
  ...u
}) {
  return /* @__PURE__ */ b.jsxs(
    JO,
    {
      "data-slot": "dropdown-menu-checkbox-item",
      "data-inset": i,
      className: Ke(
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
            children: /* @__PURE__ */ b.jsx($O, { children: /* @__PURE__ */ b.jsx(
              vi,
              {}
            ) })
          }
        ),
        o
      ]
    }
  );
}
function ac({
  className: n,
  ...o
}) {
  return /* @__PURE__ */ b.jsx(
    Px,
    {
      "data-slot": "dropdown-menu-separator",
      className: Ke("tw:-mx-1 tw:my-1 tw:h-px tw:bg-border", n),
      ...o
    }
  );
}
let bb = /* @__PURE__ */ (function(n) {
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
}, si = {
  valid: null,
  touched: !1,
  dirty: !1,
  filled: !1,
  focused: !1
}, kM = {
  disabled: !1,
  ...si
}, Gx = {
  valid(n) {
    return n === null ? null : n ? {
      [bb.valid]: ""
    } : {
      [bb.invalid]: ""
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
  touched: si.touched,
  setTouched: an,
  dirty: si.dirty,
  setDirty: an,
  filled: si.filled,
  setFilled: an,
  focused: si.focused,
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
function bu(n = !0) {
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
function qx() {
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
function gg() {
  return y.useContext(LM);
}
function mg(n = {}) {
  const {
    id: o,
    implicit: a = !1,
    controlRef: i
  } = n, {
    controlId: u,
    registerControlId: f
  } = gg(), p = Bn(o), m = a ? u : void 0, g = xn(() => /* @__PURE__ */ Symbol("labelable-control")), d = y.useRef(!1), v = y.useRef(o != null), x = ze(() => {
    !d.current || f === an || (d.current = !1, f(g.current, void 0));
  });
  return xe(() => {
    if (f === an)
      return;
    let S;
    if (a) {
      const C = i?.current;
      $e(C) && C.closest("label") != null ? S = o ?? null : S = m ?? p;
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
    d.current = !0, f(g.current, S);
  }, [o, i, m, f, a, p, g, x]), y.useEffect(() => x, [x]), u ?? p;
}
function Xx(n, o, a, i, u = !0, f) {
  const {
    registerFieldControl: p
  } = bu(), m = y.useRef(null);
  m.current || (m.current = /* @__PURE__ */ Symbol()), xe(() => {
    const g = m.current;
    return !g || !u ? void 0 : (p(g, {
      controlRef: n,
      getValue: i,
      id: o,
      name: f,
      value: a
    }), () => {
      p(g, void 0);
    });
  }, [n, u, i, o, f, p, a]);
}
const IM = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    id: f,
    name: p,
    value: m,
    disabled: g = !1,
    onValueChange: d,
    defaultValue: v,
    autoFocus: x = !1,
    style: S,
    ...C
  } = o, {
    state: w,
    name: M,
    disabled: E,
    setTouched: A,
    setDirty: O,
    validityData: z,
    setFocused: N,
    setFilled: I,
    validationMode: j,
    validation: L
  } = bu(), {
    clearErrors: _
  } = qx(), k = E || g, Y = M ?? p, te = {
    ...w,
    disabled: k
  }, {
    labelId: F
  } = gg(), Q = mg({
    id: f
  });
  xe(() => {
    const P = m != null;
    L.inputRef.current?.value || P && m !== "" ? I(!0) : P && m === "" && I(!1);
  }, [L.inputRef, I, m]);
  const Z = y.useRef(null);
  xe(() => {
    x && Z.current === vn(tt(Z.current)) && N(!0);
  }, [x, N]);
  const [q] = aa({
    controlled: m,
    default: v,
    name: "FieldControl",
    state: "value"
  }), H = m !== void 0, D = H ? q : void 0, U = ze(() => L.inputRef.current?.value);
  return Xx(L.inputRef, Q, D, U, !k, p), nt("input", o, {
    ref: [a, Z],
    state: te,
    props: [{
      id: Q,
      disabled: k,
      name: Y,
      ref: L.inputRef,
      "aria-labelledby": F,
      autoFocus: x,
      ...H ? {
        value: D
      } : {
        defaultValue: v
      },
      onChange(P) {
        const T = P.currentTarget.value;
        d?.(T, Ye(Do, P.nativeEvent)), O(T !== z.initialValue), I(T !== ""), P.nativeEvent.defaultPrevented || (_(Y), L.change(T));
      },
      onFocus() {
        N(!0);
      },
      onBlur(P) {
        A(!0), N(!1), j === "onBlur" && L.commit(P.currentTarget.value);
      },
      onKeyDown(P) {
        P.currentTarget.tagName === "INPUT" && P.key === "Enter" && (A(!0), L.commit(P.currentTarget.value));
      }
    }, C, (P) => L.getValidationProps(k, P)],
    stateAttributesMapping: Gx
  });
}), BM = /* @__PURE__ */ y.forwardRef(function(o, a) {
  return /* @__PURE__ */ b.jsx(IM, {
    ref: a,
    ...o
  });
});
function VM({ className: n, type: o, ...a }) {
  return /* @__PURE__ */ b.jsx(
    BM,
    {
      type: o,
      "data-slot": "input",
      className: Ke(
        "tw:h-8 tw:w-full tw:min-w-0 tw:rounded-[var(--radius-control)] tw:border tw:border-input tw:bg-background tw:px-2.5 tw:py-1 tw:text-[length:var(--fs-body-s)] tw:text-foreground tw:outline-none tw:placeholder:text-muted-foreground tw:focus-visible:border-ring tw:focus-visible:ring-2 tw:focus-visible:ring-ring/40 tw:disabled:pointer-events-none tw:disabled:cursor-not-allowed tw:disabled:opacity-50 tw:aria-invalid:border-destructive tw:aria-invalid:ring-2 tw:aria-invalid:ring-destructive/20",
        n
      ),
      ...a
    }
  );
}
function Dc({ className: n, ...o }) {
  return /* @__PURE__ */ b.jsx(
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
const PM = ia(
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
function hi({
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
      className: Ke(PM({ align: o }), n),
      onClick: (i) => {
        i.target.closest("button") || i.currentTarget.parentElement?.querySelector("input, textarea")?.focus();
      },
      ...a
    }
  );
}
const YM = ia(
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
function bp({
  className: n,
  type: o = "button",
  variant: a = "ghost",
  size: i = "xs",
  ...u
}) {
  return /* @__PURE__ */ b.jsx(
    ct,
    {
      type: o,
      "data-size": i,
      variant: a,
      className: Ke(YM({ size: i }), n),
      ...u
    }
  );
}
function jc({
  className: n,
  ...o
}) {
  return /* @__PURE__ */ b.jsx(
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
const Fx = /* @__PURE__ */ y.createContext(void 0);
function dr(n) {
  const o = y.useContext(Fx);
  if (o === void 0 && !n)
    throw new Error(At(47));
  return o;
}
function GM() {
  return {
    ...lu(),
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
  ...ou,
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
class hg extends Mi {
  constructor(o, a, i = !1) {
    const u = {
      ...GM(),
      ...o
    }, f = new ca();
    u.open && o?.mounted === void 0 && (u.mounted = !0), u.floatingRootContext = lg(f, a, i), super(u, {
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
    const i = a.reason === Pt, u = a.reason === Fl && a.event.detail === 0, f = !o && (a.reason === Ri || a.reason == null), p = eg(a), m = this.select("activeTriggerId");
    if (!o && a.reason === f0 && a.trigger == null && m != null && (a.trigger = this.context.triggerElements.getById(m) ?? this.select("activeTriggerElement") ?? void 0), this.context.onOpenChange?.(o, a), a.isCanceled)
      return;
    this.state.floatingRootContext.dispatchOpenChange(o, a);
    const g = () => {
      const d = {
        open: o,
        openChangeReason: a.reason
      };
      Wc(d, o, a.trigger, p()), this.update(d);
    };
    i ? (this.set("stickIfOpen", !0), this.context.stickIfOpenTimeout.start(A0, () => {
      this.set("stickIfOpen", !1);
    }), ml.flushSync(g)) : g(), u || f ? this.set("instantType", u ? "click" : "dismiss") : a.reason === Co ? this.set("instantType", "focus") : this.set("instantType", void 0);
  };
  static useStore(o, a) {
    const {
      store: i,
      internalStore: u
    } = Wp(o, (f, p) => new hg(a, f, p));
    return y.useEffect(() => u?.disposeEffect(), [u]), i;
  }
  disposeEffect = () => this.context.stickIfOpenTimeout.disposeEffect();
}
function xb({
  props: n
}) {
  const {
    children: o,
    open: a,
    defaultOpen: i = !1,
    onOpenChange: u,
    onOpenChangeComplete: f,
    modal: p = !1,
    handle: m,
    triggerId: g,
    defaultTriggerId: d = null
  } = n, v = hg.useStore(m?.store, {
    modal: p,
    open: i,
    openProp: a,
    activeTriggerId: d,
    triggerIdProp: g
  });
  tg(v, a, i, d), v.useControlledProp("openProp", a), v.useControlledProp("triggerIdProp", g);
  const x = v.useState("open"), S = v.useState("mounted"), C = v.useState("payload"), w = Zl() != null;
  v.useContextCallback("onOpenChange", u), v.useContextCallback("onOpenChangeComplete", f), tx(v, x), eu(v);
  const {
    forceUnmount: M
  } = tu(x, v, () => {
    v.update({
      stickIfOpen: !0,
      openChangeReason: null
    });
  });
  v.useSyncedValues({
    modal: p,
    nested: w
  }), y.useEffect(() => {
    x || v.context.stickIfOpenTimeout.clear();
  }, [v, x]);
  const E = y.useCallback(() => {
    v.setOpen(!1, Ye(qc));
  }, [v]);
  y.useImperativeHandle(n.actionsRef, () => ({
    unmount: M,
    close: E
  }), [M, E]);
  const A = x || S, O = y.useMemo(() => ({
    store: v
  }), [v]);
  return /* @__PURE__ */ b.jsxs(Fx.Provider, {
    value: O,
    children: [A && /* @__PURE__ */ b.jsx(FM, {
      store: v,
      modal: p
    }), typeof o == "function" ? o({
      payload: C
    }) : o]
  });
}
function XM(n) {
  return dr(!0) ? /* @__PURE__ */ b.jsx(xb, {
    props: n
  }) : /* @__PURE__ */ b.jsx(I0, {
    children: /* @__PURE__ */ b.jsx(xb, {
      props: n
    })
  });
}
function FM({
  store: n,
  modal: o
}) {
  const a = n.useState("floatingRootContext"), i = Oi(a, {
    outsidePressEvent: {
      // Ensure `aria-hidden` on outside elements is removed immediately
      // on outside press when trapping focus.
      mouse: o === "trap-focus" ? "sloppy" : "intentional",
      touch: "sloppy"
    }
  }), u = i.reference ?? xt, f = i.trigger ?? xt, p = y.useMemo(() => bn(sa, i.floating), [i.floating]);
  return nu(n, {
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
    nativeButton: m = !0,
    handle: g,
    payload: d,
    openOnHover: v = !1,
    delay: x = KM,
    closeDelay: S = 0,
    id: C,
    ...w
  } = o, M = dr(!0), E = g?.store ?? M?.store;
  if (!E)
    throw new Error(At(74));
  const A = Bn(C), O = E.useState("isTriggerActive", A), z = E.useState("floatingRootContext"), N = E.useState("isOpenedByTrigger", A), I = E.useState("triggerPopupId", A), j = y.useRef(null), {
    registerTrigger: L,
    isMountedByThisTrigger: _
  } = ng(A, j, E, {
    payload: d,
    disabled: p,
    openOnHover: v,
    closeDelay: S
  }), k = E.useState("openChangeReason"), Y = E.useState("stickIfOpen"), te = E.useState("openMethod"), F = E.useState("focusManagerModal"), Q = ru(z, {
    enabled: !p && z != null && v && (te !== "touch" || k !== Fl),
    mouseOnly: !0,
    move: !1,
    handleClose: iu(),
    restMs: x,
    delay: {
      close: S
    },
    triggerElementRef: j,
    isActiveTrigger: O,
    isClosing: () => E.select("transitionStatus") === "ending"
  }), Z = Qc(z, {
    enabled: z != null,
    stickIfOpen: Y
  }), q = wx(() => E.select("open"), (re) => {
    E.set("openMethod", re);
  }), H = E.useState("triggerProps", _), {
    getButtonProps: D,
    buttonRef: U
  } = Ao({
    disabled: p,
    native: m
  }), X = {
    open(re) {
      return re && k === Fl ? Ac.open(re) : su.open(re);
    }
  }, {
    preFocusGuardRef: P,
    handlePreFocusGuardFocus: T,
    handleFocusTargetFocus: B
  } = Vx(E, j), J = nt("button", o, {
    state: {
      disabled: p,
      open: N
    },
    ref: [U, a, L, j],
    props: [Z.reference, Q, H, q, {
      [z0]: "",
      id: A,
      "aria-haspopup": "dialog",
      "aria-expanded": N,
      "aria-controls": I
    }, w, D],
    stateAttributesMapping: X
  });
  return _ && !F ? /* @__PURE__ */ b.jsxs(y.Fragment, {
    children: [/* @__PURE__ */ b.jsx(Oo, {
      ref: P,
      onFocus: T
    }), /* @__PURE__ */ b.jsx(y.Fragment, {
      children: J
    }, A), /* @__PURE__ */ b.jsx(Oo, {
      ref: E.context.triggerFocusTargetRef,
      onFocus: B
    })]
  }) : /* @__PURE__ */ b.jsx(y.Fragment, {
    children: J
  }, A);
}), Kx = /* @__PURE__ */ y.createContext(void 0);
function ZM() {
  const n = y.useContext(Kx);
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
  } = dr();
  return f.useState("mounted") || i ? /* @__PURE__ */ b.jsx(Kx.Provider, {
    value: i,
    children: /* @__PURE__ */ b.jsx(Fc, {
      ref: a,
      ...u
    })
  }) : null;
}), Qx = /* @__PURE__ */ y.createContext(void 0);
function $M() {
  const n = y.useContext(Qx);
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
    positionMethod: m = "absolute",
    side: g = "bottom",
    align: d = "center",
    sideOffset: v = 0,
    alignOffset: x = 0,
    collisionBoundary: S = "clipping-ancestors",
    collisionPadding: C = 5,
    arrowPadding: w = 5,
    sticky: M = !1,
    disableAnchorTracking: E = !1,
    collisionAvoidance: A = Xp,
    ...O
  } = o, {
    store: z
  } = dr(), N = ZM(), I = Kp(), j = z.useState("floatingRootContext"), L = z.useState("mounted"), _ = z.useState("open"), k = z.useState("openChangeReason"), Y = z.useState("activeTriggerElement"), te = z.useState("modal"), F = z.useState("openMethod"), Q = z.useState("positionerElement"), Z = z.useState("instantType"), q = z.useState("transitionStatus"), H = z.useState("hasViewport"), D = y.useRef(null), U = $p(Q, !1, !1), X = yu({
    anchor: p,
    floatingRootContext: j,
    positionMethod: m,
    mounted: L,
    side: g,
    sideOffset: v,
    align: d,
    alignOffset: x,
    arrowPadding: w,
    collisionBoundary: S,
    collisionPadding: C,
    sticky: M,
    disableAnchorTracking: E,
    keepMounted: N,
    nodeId: I,
    collisionAvoidance: A,
    adaptiveOrigin: H ? ug : void 0
  }), P = j.useState("domReferenceElement");
  xe(() => {
    const J = P, re = D.current;
    if (J && (D.current = J), re && J && J !== re) {
      z.set("instantType", void 0);
      const ie = new AbortController();
      return U(() => {
        z.set("instantType", "trigger-change");
      }, ie.signal), () => {
        ie.abort();
      };
    }
  }, [P, U, z]), dg(_ && te === !0 && k !== Pt, F === "touch", Q, Y);
  const T = y.useCallback((J) => {
    z.set("positionerElement", J);
  }, [z]), B = {
    open: _,
    side: X.side,
    align: X.align,
    anchorHidden: X.anchorHidden,
    instant: Z
  }, ne = vu(o, B, {
    styles: X.positionerStyles,
    transitionStatus: q,
    props: O,
    refs: [a, T],
    hidden: !L,
    inert: !_
  });
  return /* @__PURE__ */ b.jsxs(Qx.Provider, {
    value: X,
    children: [L && te === !0 && k !== Pt && /* @__PURE__ */ b.jsx(du, {
      ref: z.context.internalBackdropRef,
      inert: fu(!_),
      cutout: Y
    }), /* @__PURE__ */ b.jsx(L0, {
      id: I,
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
  return /* @__PURE__ */ b.jsx(e2.Provider, {
    value: o,
    children: a
  });
}
const l2 = {
  ...Ho,
  ..._o
}, o2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    initialFocus: p,
    finalFocus: m,
    ...g
  } = o, {
    store: d
  } = dr(), v = $M(), x = mu() != null, {
    context: S,
    hasClosePart: C
  } = t2(), w = d.useState("open"), M = d.useState("openMethod"), E = d.useState("instantType"), A = d.useState("transitionStatus"), O = d.useState("popupProps"), z = d.useState("titleElementId"), N = d.useState("descriptionElementId"), I = d.useState("modal"), j = d.useState("mounted"), L = d.useState("openChangeReason"), _ = d.useState("activeTriggerElement"), k = d.useState("floatingRootContext"), Y = k.useState("floatingId"), te = d.useState("disabled"), F = d.useState("openOnHover"), Q = d.useState("closeDelay"), Z = g.id ?? Y;
  Jl({
    open: w,
    ref: d.context.popupRef,
    onComplete() {
      w && d.context.onOpenChangeComplete?.(!0);
    }
  }), ig(k, {
    enabled: F && !te,
    closeDelay: Q
  });
  const q = p === void 0 ? W0(d.context.popupRef) : p, H = I !== !1 && C;
  d.useSyncedValue("focusManagerModal", H);
  const D = y.useCallback((P) => {
    d.set("popupElement", P);
  }, [d]), U = {
    open: w,
    side: v.side,
    align: v.align,
    instant: E,
    transitionStatus: A
  }, X = nt("div", o, {
    state: U,
    ref: [a, d.context.popupRef, D],
    props: [O, {
      id: Z,
      role: "dialog",
      ...sa,
      "aria-labelledby": z,
      "aria-describedby": N,
      onKeyDown(P) {
        x && Ai.has(P.key) && P.stopPropagation();
      }
    }, Ni(A), g],
    stateAttributesMapping: l2
  });
  return /* @__PURE__ */ b.jsx(Kc, {
    context: k,
    openInteractionType: M,
    modal: H,
    disabled: !j || L === Pt,
    initialFocus: q,
    returnFocus: m,
    restoreFocus: "popup",
    previousFocusableElement: Ct(_) ? _ : void 0,
    nextFocusableElement: d.context.triggerFocusTargetRef,
    beforeContentFocusGuardRef: d.context.beforeContentFocusGuardRef,
    children: /* @__PURE__ */ b.jsx(n2, {
      value: S,
      children: X
    })
  });
}), r2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    ...p
  } = o, {
    store: m
  } = dr(), g = Bn(p.id);
  return m.useSyncedValueWithCleanup("titleElementId", g), nt("h2", o, {
    ref: a,
    props: [{
      id: g
    }, p]
  });
}), a2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    ...p
  } = o, {
    store: m
  } = dr(), g = Bn(p.id);
  return m.useSyncedValueWithCleanup("descriptionElementId", g), nt("p", o, {
    ref: a,
    props: [{
      id: g
    }, p]
  });
});
function $d({ ...n }) {
  return /* @__PURE__ */ b.jsx(XM, { "data-slot": "popover", ...n });
}
function Wd({ ...n }) {
  return /* @__PURE__ */ b.jsx(QM, { "data-slot": "popover-trigger", ...n });
}
function ep({
  className: n,
  align: o = "center",
  alignOffset: a = 0,
  side: i = "bottom",
  sideOffset: u = 4,
  anchor: f,
  plain: p = !1,
  portalContainer: m,
  positionerClassName: g,
  ...d
}) {
  return /* @__PURE__ */ b.jsx(JM, { container: m, children: /* @__PURE__ */ b.jsx(
    WM,
    {
      align: o,
      alignOffset: a,
      side: i,
      sideOffset: u,
      anchor: f,
      className: Ke("tw:isolate tw:z-[var(--z-popover)]", g),
      children: /* @__PURE__ */ b.jsx(
        o2,
        {
          "data-slot": "popover-content",
          className: Ke(
            p ? "tw:origin-(--transform-origin) tw:outline-hidden" : "tw:flex tw:w-72 tw:origin-(--transform-origin) tw:flex-col tw:gap-2.5 tw:rounded-[var(--radius-surface)] tw:bg-popover tw:p-2.5 tw:text-[length:var(--fs-body-s)] tw:text-popover-foreground tw:shadow-[var(--elevation-overlay)] tw:ring-1 tw:ring-foreground/10 tw:outline-hidden",
            n
          ),
          ...d
        }
      )
    }
  ) });
}
function i2({ className: n, ...o }) {
  return /* @__PURE__ */ b.jsx(
    "div",
    {
      "data-slot": "popover-header",
      className: Ke("tw:flex tw:flex-col tw:gap-0.5 tw:text-[length:var(--fs-body-s)]", n),
      ...o
    }
  );
}
function kc({ className: n, ...o }) {
  return /* @__PURE__ */ b.jsx(
    r2,
    {
      "data-slot": "popover-title",
      className: Ke("tw:m-0 tw:text-[length:var(--fs-body-s)] tw:font-medium", n),
      ...o
    }
  );
}
function xp({
  className: n,
  ...o
}) {
  return /* @__PURE__ */ b.jsx(
    a2,
    {
      "data-slot": "popover-description",
      className: Ke("tw:m-0 tw:text-muted-foreground", n),
      ...o
    }
  );
}
function ta({
  className: n,
  orientation: o = "horizontal",
  ...a
}) {
  return /* @__PURE__ */ b.jsx(
    Px,
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
const Zx = /* @__PURE__ */ y.createContext(null), Jx = /* @__PURE__ */ y.createContext(null);
function $l() {
  const n = y.useContext(Zx);
  if (n === null)
    throw new Error(At(60));
  return n;
}
function $x() {
  const n = y.useContext(Jx);
  if (n === null)
    throw new Error(At(61));
  return n;
}
const s2 = (n, o) => Object.is(n, o);
function sr(n, o, a) {
  return n == null || o == null ? Object.is(n, o) : a(n, o);
}
function c2(n, o, a) {
  return !n || n.length === 0 ? !1 : n.some((i) => i === void 0 ? !1 : sr(o, i, a));
}
function yi(n, o, a) {
  return !n || n.length === 0 ? -1 : n.findIndex((i) => i === void 0 ? !1 : sr(i, o, a));
}
function u2(n, o, a) {
  return n.filter((i) => !sr(o, i, a));
}
function Sp(n) {
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
function Wx(n) {
  return n != null && n.length > 0 && typeof n[0] == "object" && n[0] != null && "items" in n[0];
}
function f2(n) {
  if (!Array.isArray(n))
    return n != null && "null" in n;
  const o = n;
  if (Wx(o)) {
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
function eS(n, o) {
  if (o && n != null)
    return o(n) ?? "";
  if (n && typeof n == "object") {
    if ("label" in n && n.label != null)
      return String(n.label);
    if ("value" in n)
      return String(n.value);
  }
  return Sp(n);
}
function nr(n, o) {
  return o && n != null ? o(n) ?? "" : n && typeof n == "object" && "value" in n && "label" in n ? Sp(n.value) : Sp(n);
}
function tS(n, o, a) {
  function i() {
    return eS(n, a);
  }
  if (a && n != null)
    return a(n);
  if (n && typeof n == "object" && "label" in n && n.label != null)
    return n.label;
  if (o && !Array.isArray(o))
    return o[n] ?? i();
  if (Array.isArray(o)) {
    const u = o, f = Wx(u) ? u.flatMap((p) => p.items) : u;
    if (n == null || typeof n != "object") {
      const p = f.find((m) => m.value === n);
      return p && p.label != null ? p.label : i();
    }
    if ("value" in n) {
      const p = f.find((m) => m && m.value === n.value);
      if (p && p.label != null)
        return p.label;
    }
  }
  return i();
}
function d2(n, o, a) {
  return n.reduce((i, u, f) => (f > 0 && i.push(", "), i.push(/* @__PURE__ */ b.jsx(y.Fragment, {
    children: tS(u, o, a)
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
    return n.multiple ? Array.isArray(i) && i.some((u) => sr(o, u, a)) : sr(o, i, a);
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
function ci(n, o = Number.MIN_SAFE_INTEGER, a = Number.MAX_SAFE_INTEGER) {
  return Math.max(o, Math.min(n, a));
}
const Bl = 1;
function nS(n, o) {
  return Math.max(0, n - o);
}
function g2(n, o) {
  if (o <= 0)
    return 0;
  const a = ci(n, 0, o), i = a, u = o - a, f = i <= Bl, p = u <= Bl;
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
    onOpenChange: m,
    name: g,
    form: d,
    autoComplete: v,
    disabled: x = !1,
    readOnly: S = !1,
    required: C = !1,
    modal: w = !0,
    actionsRef: M,
    inputRef: E,
    onOpenChangeComplete: A,
    items: O,
    multiple: z = !1,
    itemToStringLabel: N,
    itemToStringValue: I,
    isItemEqualToValue: j = s2,
    highlightItemOnHover: L = !0,
    children: _
  } = n, {
    clearErrors: k
  } = qx(), {
    setDirty: Y,
    setTouched: te,
    setFocused: F,
    validityData: Q,
    setFilled: Z,
    name: q,
    disabled: H,
    validation: D,
    validationMode: U
  } = bu(), X = mg({
    id: o
  }), P = H || x, T = q ?? g, [B, ne] = aa({
    controlled: a,
    default: z ? i ?? Xl : i,
    name: "Select",
    state: "value"
  }), [J, re] = aa({
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
  } = $c(J), {
    openMethod: Te,
    triggerProps: Oe
  } = Ex(J), He = xn(() => new J0({
    id: X,
    labelId: void 0,
    modal: w,
    multiple: z,
    itemToStringLabel: N,
    itemToStringValue: I,
    isItemEqualToValue: j,
    value: B,
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
  })).current, ae = Pe(He, Be.activeIndex), pe = Pe(He, Be.selectedIndex), Ue = Pe(He, Be.triggerElement), ve = Pe(He, Be.positionerElement), be = OM(Te), We = Te ?? be ?? null, rt = y.useMemo(() => z ? "" : nr(B, I), [z, B, I]), mt = y.useMemo(() => z && Array.isArray(B) ? B.map((qe) => nr(qe, I)) : nr(B, I), [z, B, I]), Dt = Yt(He.state.triggerElement), et = ze(() => mt);
  Xx(Dt, X, B, et, !P, g);
  const ht = y.useRef(B), zt = z ? Array.isArray(B) && B.length > 0 : B != null && nr(B, I) !== "";
  xe(() => {
    B !== ht.current && He.set("forceMount", !0);
  }, [He, B]), xe(() => {
    Z(zt);
  }, [zt, Z]), xe(function() {
    const St = fe.current;
    let Xt;
    if (z) {
      const ln = Array.isArray(B) ? B : [];
      if (ln.length === 0)
        Xt = null;
      else {
        const en = ln[ln.length - 1], Ot = yi(St, en, j);
        Xt = Ot === -1 ? null : Ot;
      }
    } else {
      const ln = yi(St, B, j);
      Xt = ln === -1 ? null : ln;
    }
    Xt === null && (_e.current = null), !J && He.set("selectedIndex", Xt);
  }, [zt, z, J, B, fe, j, He, _e]);
  function yt(qe) {
    const St = Q.initialValue;
    return Array.isArray(qe) && Array.isArray(St) ? !p2(qe, St, (Xt, ln) => sr(Xt, ln, j)) : qe !== St;
  }
  Sx(B, () => {
    k(T), Y(yt(B)), D.change(B);
  });
  const Mn = ze((qe, St) => {
    m?.(qe, St), !St.isCanceled && (re(qe), !qe && (St.reason === Co || St.reason === Gc) && (te(!0), F(!1), U === "onBlur" && D.commit(B)));
  }), An = ze(() => {
    he(!1), He.update({
      activeIndex: null,
      openMethod: null
    }), A?.(!1);
  });
  Jl({
    enabled: !M,
    open: J,
    ref: se,
    onComplete() {
      J || An();
    }
  }), y.useImperativeHandle(M, () => ({
    unmount: An
  }), [An]);
  const Qe = ze((qe, St) => {
    u?.(qe, St), !St.isCanceled && ne(qe);
  }), pt = ze(() => {
    const qe = He.state.listElement || se.current;
    if (!qe)
      return;
    const St = nS(qe.scrollHeight, qe.clientHeight), Xt = g2(qe.scrollTop, St), ln = Xt > 0, en = Xt < St;
    He.state.scrollUpArrowVisible !== ln && He.set("scrollUpArrowVisible", ln), He.state.scrollDownArrowVisible !== en && He.set("scrollDownArrowVisible", en);
  }), It = lx({
    open: J,
    onOpenChange: Mn,
    elements: {
      reference: Ue,
      floating: ve
    }
  }), Ht = Qc(It, {
    enabled: !S && !P,
    event: "mousedown"
  }), Ut = Oi(It), jt = ax(It, {
    enabled: !S && !P,
    listRef: ie,
    activeIndex: ae,
    selectedIndex: pe,
    disabledIndices: Xl,
    onNavigate(qe) {
      qe === null && !J || He.set("activeIndex", qe);
    },
    focusItemOnHover: L
  }), Gt = ix(It, {
    enabled: !S && !P && (J || !z),
    listRef: oe,
    activeIndex: ae,
    selectedIndex: pe,
    // Skip disabled items while matching so typeahead advances to the next selectable item
    // (a click can never select a disabled item and native `<select>` skips them too). Resolve
    // the disabled state from the element via the attribute-only `isElementDisabled` so the
    // hidden, force-mounted items used for closed-trigger typeahead aren't dropped by the
    // `elementsRef`/visibility filter that `disabledIndices` deliberately sidesteps.
    disabledIndices: (qe) => Yx(ie.current[qe]),
    onMatch(qe) {
      J ? He.set("activeIndex", qe) : Qe(fe.current[qe], Ye("none"));
    },
    onTyping(qe) {
      ye.current = qe;
    }
  }), Sn = y.useMemo(() => {
    const qe = bn(Gt.reference, jt.reference, Ut.reference, Ht.reference, Oe);
    return X && (qe.id = X), qe;
  }, [Ht.reference, Gt.reference, jt.reference, Ut.reference, Oe, X]), zn = y.useMemo(() => bn(sa, Gt.floating, jt.floating, Ut.floating), [Gt.floating, jt.floating, Ut.floating]), Vn = jt.item ?? xt;
  _p(() => {
    He.update({
      popupProps: zn,
      triggerProps: Sn
    });
  }), xe(() => {
    He.update({
      id: X,
      modal: w,
      multiple: z,
      value: B,
      open: J,
      mounted: Ce,
      transitionStatus: Se,
      popupProps: zn,
      triggerProps: Sn,
      items: O,
      itemToStringLabel: N,
      itemToStringValue: I,
      isItemEqualToValue: j,
      openMethod: We
    });
  }, [He, X, w, z, B, J, Ce, Se, zn, Sn, O, N, I, j, We]);
  const qt = y.useMemo(() => ({
    store: He,
    name: T,
    required: C,
    disabled: P,
    readOnly: S,
    multiple: z,
    highlightItemOnHover: L,
    setValue: Qe,
    setOpen: Mn,
    listRef: ie,
    popupRef: se,
    scrollHandlerRef: ge,
    handleScrollArrowVisibility: pt,
    scrollArrowsMountedCountRef: je,
    itemProps: Vn,
    valueRef: Ee,
    valuesRef: fe,
    labelsRef: oe,
    typingRef: ye,
    selectionRef: ke,
    firstItemTextRef: Re,
    selectedItemTextRef: _e,
    validation: D,
    onOpenChangeComplete: A,
    alignItemWithTriggerActiveRef: we,
    initialValueRef: ht
  }), [He, T, C, P, S, z, L, Qe, Mn, Vn, D, A, pt]), Pn = Ro(E, D.inputRef), yl = z && Array.isArray(B) && B.length > 0, tl = z ? void 0 : T, vl = y.useMemo(() => !z || !Array.isArray(B) || !T ? null : B.map((qe) => {
    const St = nr(qe, I);
    return /* @__PURE__ */ b.jsx("input", {
      type: "hidden",
      form: d,
      name: T,
      value: St,
      disabled: P
    }, St);
  }), [z, B, d, T, I, P]);
  return /* @__PURE__ */ b.jsx(Zx.Provider, {
    value: qt,
    children: /* @__PURE__ */ b.jsxs(Jx.Provider, {
      value: It,
      children: [_, /* @__PURE__ */ b.jsx("input", {
        ...D.getValidationProps(P, {
          onFocus() {
            He.state.triggerElement?.focus({
              // Supported in Chrome from 144 (January 2026)
              focusVisible: !0
            });
          },
          // Handle browser autofill.
          onChange(qe) {
            if (qe.nativeEvent.defaultPrevented || P || S)
              return;
            const St = qe.currentTarget.value, Xt = Ye(Do, qe.nativeEvent);
            function ln() {
              if (z)
                return;
              const en = St.toLowerCase();
              let Ot = fe.current.findIndex((rl) => nr(rl, I).toLowerCase() === en || eS(rl, N).toLowerCase() === en);
              Ot === -1 && (Ot = fe.current.findIndex((rl, ua) => {
                const ji = oe.current[ua];
                return ji != null && ji.toLowerCase() === en;
              }));
              const cn = Ot === -1 ? void 0 : fe.current[Ot];
              cn != null && Qe(cn, Xt);
            }
            He.set("forceMount", !0), queueMicrotask(ln);
          }
        }),
        id: X && tl == null ? `${X}-hidden-input` : void 0,
        form: d,
        name: tl,
        autoComplete: v,
        value: rt,
        disabled: P,
        required: C && !yl,
        readOnly: S,
        ref: Pn,
        style: T ? xR : m0,
        tabIndex: -1,
        "aria-hidden": !0,
        suppressHydrationWarning: !0
      }), vl]
    })
  });
}
function h2(n, o) {
  return n ?? o;
}
const ic = 2, y2 = 400, v2 = {
  ...Ac,
  ...Gx,
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
    nativeButton: m = !0,
    style: g,
    ...d
  } = o, {
    setTouched: v,
    setFocused: x,
    validationMode: S,
    state: C,
    disabled: w
  } = bu(), {
    labelId: M
  } = gg(), {
    store: E,
    setOpen: A,
    selectionRef: O,
    validation: z,
    readOnly: N,
    required: I,
    alignItemWithTriggerActiveRef: j,
    disabled: L
  } = $l(), _ = w || L || p, k = Pe(E, Be.open), Y = Pe(E, Be.mounted), te = Pe(E, Be.value), F = Pe(E, Be.triggerProps), Q = Pe(E, Be.positionerElement), Z = Pe(E, Be.listElement), q = Pe(E, Be.popupSide), H = Pe(E, Be.id), D = Pe(E, Be.labelId), U = Pe(E, Be.hasSelectedValue), X = Y && Q ? q : null, P = f ?? H, T = h2(M, D);
  mg({
    id: P
  });
  const B = Yt(Q), ne = y.useRef(null), {
    getButtonProps: J,
    buttonRef: re
  } = Ao({
    disabled: _,
    native: m
  }), ie = ze((ye) => {
    E.set("triggerElement", ye);
  }), oe = sn(), se = sn(), ge = sn();
  y.useEffect(() => {
    if (k)
      return ge.start(y2, () => {
        O.current.allowUnselectedMouseUp = !0, O.current.allowSelectedMouseUp = !0;
      }), () => {
        ge.clear();
      };
    O.current = {
      allowSelectedMouseUp: !1,
      allowUnselectedMouseUp: !1,
      dragY: 0
    }, se.clear();
  }, [k, O, se, ge]);
  const je = bn(F, {
    id: P,
    role: "combobox",
    "aria-expanded": k ? "true" : "false",
    "aria-haspopup": "listbox",
    "aria-controls": k ? Z?.id ?? Sc(Q)?.id : void 0,
    "aria-labelledby": T,
    "aria-readonly": N || void 0,
    "aria-required": I || void 0,
    tabIndex: _ ? -1 : 0,
    onFocus(ye) {
      x(!0), k && j.current && A(!1, Ye(Do, ye.nativeEvent)), oe.start(0, () => {
        E.set("forceMount", !0);
      });
    },
    onBlur(ye) {
      Le(Q, ye.relatedTarget) || (v(!0), x(!1), S === "onBlur" && z.commit(te));
    },
    onMouseDown(ye) {
      if (k)
        return;
      const Re = tt(ye.currentTarget);
      function _e(ke) {
        if (!ne.current)
          return;
        const we = ke.target;
        if (Le(ne.current, we) || Le(B.current, we))
          return;
        const Ce = Lx(ne.current);
        ke.clientX >= Ce.left - ic && ke.clientX <= Ce.right + ic && ke.clientY >= Ce.top - ic && ke.clientY <= Ce.bottom + ic || A(!1, Ye(d0, ke));
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
    ...C,
    open: k,
    disabled: _,
    value: te,
    readOnly: N,
    popupSide: X,
    placeholder: !U
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
    style: m,
    ...g
  } = o, {
    store: d,
    valueRef: v
  } = $l(), x = Pe(d, Be.value), S = Pe(d, Be.items), C = Pe(d, Be.itemToStringLabel), w = Pe(d, Be.hasSelectedValue), M = !w && p != null && f == null, E = Pe(d, Be.hasNullItemLabel, M), A = {
    value: x,
    placeholder: !w
  };
  let O = null;
  return typeof f == "function" ? O = f(x) : f != null ? O = f : !w && p != null && !E ? O = p : Array.isArray(x) ? O = d2(x, S, C) : O = tS(x, S, C), nt("span", o, {
    state: A,
    ref: [a, v],
    props: [{
      children: O
    }, g],
    stateAttributesMapping: x2
  });
}), w2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    ...p
  } = o, {
    store: m
  } = $l(), d = {
    open: Pe(m, Be.open)
  };
  return nt("span", o, {
    state: d,
    ref: a,
    props: [{
      "aria-hidden": !0,
      children: "▼"
    }, p],
    stateAttributesMapping: su
  });
}), E2 = /* @__PURE__ */ y.createContext(void 0), T2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    store: i
  } = $l(), u = Pe(i, Be.mounted), f = Pe(i, Be.forceMount);
  return u || f ? /* @__PURE__ */ b.jsx(E2.Provider, {
    value: !0,
    children: /* @__PURE__ */ b.jsx(Fc, {
      ref: a,
      ...o
    })
  }) : null;
}), lS = /* @__PURE__ */ y.createContext(void 0);
function oS() {
  const n = y.useContext(lS);
  if (!n)
    throw new Error(At(59));
  return n;
}
function _c(n, o) {
  n && Object.assign(n.style, o);
}
const rS = {
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
    side: m = "bottom",
    align: g = "center",
    sideOffset: d = 0,
    alignOffset: v = 0,
    collisionBoundary: x = "clipping-ancestors",
    collisionPadding: S,
    arrowPadding: C = 5,
    sticky: w = !1,
    disableAnchorTracking: M,
    alignItemWithTrigger: E = !0,
    collisionAvoidance: A = N0,
    style: O,
    ...z
  } = o, {
    store: N,
    listRef: I,
    labelsRef: j,
    alignItemWithTriggerActiveRef: L,
    selectedItemTextRef: _,
    valuesRef: k,
    initialValueRef: Y,
    popupRef: te,
    setValue: F
  } = $l(), Q = $x(), Z = Pe(N, Be.open), q = Pe(N, Be.mounted), H = Pe(N, Be.modal), D = Pe(N, Be.value), U = Pe(N, Be.openMethod), X = Pe(N, Be.positionerElement), P = Pe(N, Be.triggerElement), T = Pe(N, Be.isItemEqualToValue), B = Pe(N, Be.transitionStatus), ne = y.useRef(null), J = y.useRef(null), [re, ie] = y.useState(E), oe = q && re && U !== "touch";
  !q && re !== E && ie(E), xe(() => {
    q || (Be.scrollUpArrowVisible(N.state) && N.set("scrollUpArrowVisible", !1), Be.scrollDownArrowVisible(N.state) && N.set("scrollDownArrowVisible", !1));
  }, [N, q]), y.useImperativeHandle(L, () => oe), dg((oe || H) && Z, U === "touch", X, P);
  const se = yu({
    anchor: i,
    floatingRootContext: Q,
    positionMethod: u,
    mounted: q,
    side: m,
    sideOffset: d,
    align: g,
    alignOffset: v,
    arrowPadding: C,
    collisionBoundary: x,
    collisionPadding: S,
    sticky: w,
    disableAnchorTracking: M ?? oe,
    collisionAvoidance: A,
    keepMounted: !0
  }), ge = oe ? "none" : se.side, je = oe ? R2 : se.positionerStyles, Ee = {
    open: Z,
    side: ge,
    align: se.align,
    anchorHidden: se.anchorHidden
  };
  xe(() => {
    N.set("popupSide", se.side);
  }, [N, se.side]);
  const fe = ze((we) => {
    N.set("positionerElement", we);
  }), ye = vu(o, Ee, {
    styles: je,
    transitionStatus: B,
    props: z,
    refs: [a, fe],
    hidden: !q,
    inert: !Z
  }), Re = y.useRef(0), _e = ze((we) => {
    if (we.size === 0 && Re.current === 0 || k.current.length === 0)
      return;
    const Ce = Re.current;
    if (Re.current = we.size, we.size === Ce)
      return;
    const he = Ye(Do);
    if (Ce !== 0 && !N.state.multiple && D !== null && yi(k.current, D, T) === -1) {
      const Te = Y.current, He = Te != null && yi(k.current, Te, T) !== -1 ? Te : null;
      F(He, he), He === null && (N.set("selectedIndex", null), _.current = null);
    }
    if (Ce !== 0 && N.state.multiple && Array.isArray(D)) {
      const Se = (Oe) => yi(k.current, Oe, T) !== -1, Te = D.filter((Oe) => Se(Oe));
      (Te.length !== D.length || Te.some((Oe) => !c2(D, Oe, T))) && (F(Te, he), Te.length === 0 && (N.set("selectedIndex", null), _.current = null));
    }
    if (Z && oe) {
      N.update({
        scrollUpArrowVisible: !1,
        scrollDownArrowVisible: !1
      });
      const Se = {
        height: ""
      };
      _c(X, Se), _c(te.current, Se);
    }
  }), ke = y.useMemo(() => ({
    ...se,
    side: ge,
    alignItemWithTriggerActive: oe,
    setControlledAlignItemWithTrigger: ie,
    scrollUpArrowRef: ne,
    scrollDownArrowRef: J
  }), [se, ge, oe, ie]);
  return /* @__PURE__ */ b.jsx(fg, {
    elementsRef: I,
    labelsRef: j,
    onMapChange: _e,
    children: /* @__PURE__ */ b.jsxs(lS.Provider, {
      value: ke,
      children: [q && H && /* @__PURE__ */ b.jsx(du, {
        inert: fu(!Z),
        cutout: P
      }), ye]
    })
  });
}), sc = "base-ui-disable-scrollbar", wp = {
  className: sc,
  getElement(n) {
    return /* @__PURE__ */ b.jsx("style", {
      nonce: n,
      href: sc,
      precedence: "base-ui:low",
      children: `.${sc}{scrollbar-width:none}.${sc}::-webkit-scrollbar{display:none}`
    });
  }
}, O2 = /* @__PURE__ */ y.createContext(void 0), M2 = {
  disableStyleElements: !1
};
function A2() {
  return y.useContext(O2) ?? M2;
}
const z2 = {
  ...Ho,
  ..._o
}, N2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    finalFocus: p,
    ...m
  } = o, {
    store: g,
    popupRef: d,
    onOpenChangeComplete: v,
    setOpen: x,
    valueRef: S,
    firstItemTextRef: C,
    selectedItemTextRef: w,
    multiple: M,
    handleScrollArrowVisibility: E,
    scrollHandlerRef: A,
    listRef: O,
    highlightItemOnHover: z
  } = $l(), {
    side: N,
    align: I,
    alignItemWithTriggerActive: j,
    isPositioned: L,
    setControlledAlignItemWithTrigger: _
  } = oS(), k = mu() != null, Y = $x(), te = hu(), {
    nonce: F,
    disableStyleElements: Q
  } = A2(), Z = Pe(g, Be.id), q = Pe(g, Be.open), H = Pe(g, Be.openMethod), D = Pe(g, Be.mounted), U = Pe(g, Be.popupProps), X = Pe(g, Be.transitionStatus), P = Pe(g, Be.triggerElement), T = Pe(g, Be.positionerElement), B = Pe(g, Be.listElement), ne = y.useRef(!1), J = y.useRef(!1), re = y.useRef({}), ie = la(), oe = ze((Ee) => {
    if (!T || !d.current || !J.current)
      return;
    if (ne.current || !j) {
      E();
      return;
    }
    const fe = T.style.top === "0px", ye = T.style.bottom === "0px";
    if (!fe && !ye) {
      E();
      return;
    }
    const Re = wb(T), _e = ui(T.getBoundingClientRect().height, "y", Re), ke = tt(T), we = Nt(T), Ce = we.getComputedStyle(T), he = parseFloat(Ce.marginTop), Se = parseFloat(Ce.marginBottom), Te = Sb(we.getComputedStyle(d.current)), Oe = Math.min(ke.documentElement.clientHeight - he - Se, Te), He = Ee.scrollTop, ae = cc(Ee);
    let pe = 0, Ue = null, ve = !1, be = !1;
    const We = (et) => {
      T.style.height = `${et}px`;
    }, rt = (et, ht) => {
      const zt = ci(et, 0, Oe - _e);
      zt > 0 && We(_e + zt), Ee.scrollTop = ht, Oe - (_e + zt) <= Bl && (ne.current = !0), E();
    }, mt = fe ? ae - He : He, Dt = Math.min(_e + mt, Oe);
    if (pe = Dt, mt <= Bl) {
      rt(mt, fe ? ae : 0);
      return;
    }
    if (Oe - Dt > Bl)
      fe ? be = !0 : Ue = 0;
    else if (ve = !0, ye && He < ae) {
      const et = _e + mt - Oe;
      Ue = He - (mt - et);
    }
    if (pe = Math.ceil(pe), pe !== 0 && We(pe), be || Ue != null) {
      const et = cc(Ee), ht = be ? et : ci(Ue, 0, et);
      Math.abs(Ee.scrollTop - ht) > Bl && (Ee.scrollTop = ht);
    }
    (ve || pe >= Oe - Bl) && (ne.current = !0), E();
  });
  y.useImperativeHandle(A, () => oe, [oe]), Jl({
    open: q,
    ref: d,
    onComplete() {
      q && v?.(!0);
    }
  });
  const se = {
    open: q,
    transitionStatus: X,
    side: N,
    align: I
  };
  xe(() => {
    !T || !d.current || Object.keys(re.current).length || (re.current = {
      top: T.style.top || "0",
      left: T.style.left || "0",
      right: T.style.right,
      height: T.style.height,
      bottom: T.style.bottom,
      minHeight: T.style.minHeight,
      maxHeight: T.style.maxHeight,
      marginTop: T.style.marginTop,
      marginBottom: T.style.marginBottom
    });
  }, [d, T]), xe(() => {
    q || j || (J.current = !1, ne.current = !1, _c(T, re.current));
  }, [q, j, T, d]), xe(() => {
    const Ee = d.current;
    if (!q || !P || !T || !Ee || j && !L || g.state.transitionStatus === "ending")
      return;
    if (!j) {
      J.current = !0, ie.request(E), Ee.style.removeProperty("--transform-origin");
      return;
    }
    const fe = D2(Ee);
    Ee.style.removeProperty("--transform-origin");
    try {
      let ye = w.current;
      ye?.isConnected || (ye = !Be.hasSelectedValue(g.state) && C.current?.isConnected ? C.current : null);
      const Re = S.current, _e = Nt(T), ke = _e.getComputedStyle(T), we = _e.getComputedStyle(Ee), Ce = tt(P), he = wb(P), Se = uc(P.getBoundingClientRect(), he), Te = uc(T.getBoundingClientRect(), he), Oe = Se.height, He = B || Ee, ae = He.scrollHeight, pe = parseFloat(we.borderBottomWidth), Ue = parseFloat(ke.marginTop) || 10, ve = parseFloat(ke.marginBottom) || 10, be = parseFloat(ke.minHeight) || 100, We = Sb(we), rt = 5, mt = 5, Dt = 20, et = Ce.documentElement.clientHeight - Ue - ve, ht = Ce.documentElement.clientWidth, zt = et - Se.bottom + Oe;
      let yt, Mn = te === "rtl" ? Se.right - Te.width : Se.left, An = 0;
      if (ye && Re) {
        const qt = uc(Re.getBoundingClientRect(), he);
        yt = uc(ye.getBoundingClientRect(), he), Mn = Te.left + (te === "rtl" ? qt.right - yt.right : qt.left - yt.left);
        const Pn = qt.top - Se.top + qt.height / 2;
        An = yt.top - Te.top + yt.height / 2 - Pn;
      }
      const Qe = zt + An + ve + pe;
      let pt = Math.min(et, Qe);
      const It = et - Ue - ve, Ht = Qe - pt, Ut = ht - mt;
      T.style.left = `${ci(Mn, rt, Ut - Te.width)}px`, T.style.height = `${pt}px`, T.style.maxHeight = "none", T.style.marginTop = `${Ue}px`, T.style.marginBottom = `${ve}px`, Ee.style.height = "100%";
      const jt = cc(He), Gt = Ht >= jt - Bl;
      Gt && (pt = Math.min(et, Te.height) - (Ht - jt));
      const Sn = Se.top < Dt || Se.bottom > et - Dt || Math.ceil(pt) + Bl < Math.min(ae, be), zn = (_e.visualViewport?.scale ?? 1) !== 1 && No;
      if (Sn || zn) {
        J.current = !0, _c(T, re.current), _(!1);
        return;
      }
      const Vn = Math.max(be, pt);
      if (Gt) {
        const qt = Math.max(0, et - Qe);
        T.style.top = Te.height >= It ? "0" : `${qt}px`, T.style.height = `${pt}px`, He.scrollTop = cc(He);
      } else
        T.style.bottom = "0", He.scrollTop = Ht;
      if (yt) {
        const qt = Te.top, Pn = Te.height, yl = yt.top + yt.height / 2, tl = Pn > 0 ? (yl - qt) / Pn * 100 : 50, vl = ci(tl, 0, 100);
        Ee.style.setProperty("--transform-origin", `50% ${vl}%`);
      }
      (Vn === et || pt >= We) && (ne.current = !0), E(), z && g.state.selectedIndex === null && g.state.activeIndex === null && O.current[0] != null && g.set("activeIndex", 0), J.current = !0;
    } finally {
      fe();
    }
  }, [g, q, T, P, S, C, w, d, E, j, _, ie, B, O, z, te, L]), y.useEffect(() => {
    if (!j || !T || !q)
      return;
    const Ee = Nt(T);
    function fe(ye) {
      x(!1, Ye(mR, ye));
    }
    return Je(Ee, "resize", fe);
  }, [x, j, T, q]);
  const ge = {
    ...B ? {
      role: "presentation",
      "aria-orientation": void 0
    } : {
      role: "listbox",
      "aria-multiselectable": M || void 0,
      id: `${Z}-list`
    },
    onKeyDown(Ee) {
      k && Ai.has(Ee.key) && Ee.stopPropagation();
    },
    onScroll(Ee) {
      B || oe(Ee.currentTarget);
    },
    ...j && {
      style: B ? {
        height: "100%"
      } : rS
    }
  }, je = nt("div", o, {
    ref: [a, d],
    state: se,
    stateAttributesMapping: z2,
    props: [U, ge, Ni(X), {
      className: !B && j ? wp.className : void 0
    }, m]
  });
  return /* @__PURE__ */ b.jsxs(y.Fragment, {
    children: [!Q && wp.getElement(F), /* @__PURE__ */ b.jsx(Kc, {
      context: Y,
      modal: !1,
      disabled: !D,
      openInteractionType: H,
      returnFocus: p,
      restoreFocus: !0,
      children: je
    })]
  });
});
function Sb(n) {
  const o = n.maxHeight || "";
  return o.endsWith("px") && parseFloat(o) || 1 / 0;
}
function cc(n) {
  return nS(n.scrollHeight, n.clientHeight);
}
function wb(n) {
  return q0.getScale(n);
}
function ui(n, o, a) {
  return n / a[o];
}
function uc(n, o) {
  return Si({
    x: ui(n.x, "x", o),
    y: ui(n.y, "y", o),
    width: ui(n.width, "x", o),
    height: ui(n.height, "y", o)
  });
}
const Eb = [["transform", "none"], ["scale", "1"], ["translate", "0 0"]];
function D2(n) {
  const {
    style: o
  } = n, a = {};
  for (const [i, u] of Eb)
    a[i] = o.getPropertyValue(i), o.setProperty(i, u, "important");
  return () => {
    for (const [i] of Eb) {
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
    store: m,
    scrollHandlerRef: g
  } = $l(), {
    alignItemWithTriggerActive: d
  } = oS(), v = Pe(m, Be.hasScrollArrows), x = Pe(m, Be.openMethod), S = Pe(m, Be.multiple), w = {
    id: `${Pe(m, Be.id)}-list`,
    role: "listbox",
    "aria-multiselectable": S || void 0,
    onScroll(E) {
      g.current?.(E.currentTarget);
    },
    ...d && {
      style: rS
    },
    className: v && x !== "touch" ? wp.className : void 0
  }, M = ze((E) => {
    m.set("listElement", E);
  });
  return nt("div", o, {
    ref: [a, M],
    props: [w, p]
  });
}), aS = /* @__PURE__ */ y.createContext(void 0);
function yg() {
  const n = y.useContext(aS);
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
    label: m,
    disabled: g = !1,
    nativeButton: d = !1,
    ...v
  } = o, x = y.useRef(null), S = zi({
    label: m,
    textRef: x,
    indexGuessBehavior: Ax.GuessFromOrder
  }), {
    store: C,
    itemProps: w,
    setOpen: M,
    setValue: E,
    selectionRef: A,
    typingRef: O,
    valuesRef: z,
    multiple: N,
    selectedItemTextRef: I,
    disabled: j,
    readOnly: L
  } = $l(), _ = Pe(C, Be.isActive, S.index), k = Pe(C, Be.open), Y = Pe(C, Be.isSelected, p), te = Pe(C, Be.isSelectedByFocus, S.index), F = Pe(C, Be.isItemEqualToValue), Q = S.index, Z = Q !== -1, q = y.useRef(null);
  xe(() => {
    if (!Z)
      return;
    const oe = z.current;
    return oe[Q] = p, () => {
      delete oe[Q];
    };
  }, [Z, Q, p, z]), xe(() => {
    if (!Z)
      return;
    const oe = C.state.value;
    let se = oe;
    N && Array.isArray(oe) && (se = oe.length > 0 ? oe[oe.length - 1] : void 0), se !== void 0 && sr(p, se, F) && (C.set("selectedIndex", Q), x.current && (I.current = x.current));
  }, [Z, Q, N, F, C, p, I]);
  const H = y.useRef(null), D = y.useRef("mouse"), U = y.useRef(!1), {
    getButtonProps: X,
    buttonRef: P
  } = Ao({
    disabled: g,
    focusableWhenDisabled: !0,
    native: d,
    composite: !0
  }), T = {
    disabled: g,
    selected: Y,
    highlighted: _
  };
  function B(oe) {
    if (j || L)
      return;
    const se = C.state.value;
    if (N) {
      const ge = Array.isArray(se) ? se : [], je = Y ? u2(ge, p, F) : [...ge, p];
      E(je, Ye($r, oe));
    } else
      E(p, Ye($r, oe)), M(!1, Ye($r, oe));
  }
  function ne() {
    A.current.dragY = 0;
  }
  const J = {
    role: "option",
    "aria-selected": Y,
    tabIndex: k && _ ? 0 : -1,
    onKeyDown(oe) {
      H.current = oe.key, C.set("activeIndex", Q), oe.key === " " && O.current && oe.preventDefault();
    },
    onClick(oe) {
      const se = oe.type === "click" && D.current !== "touch", ge = oe.nativeEvent.pointerType, je = se && Ip(oe.nativeEvent) && // Generic no-pointer `detail === 0` clicks stay tied to highlight state. Virtual
      // clicks that carry browser pointer data, including an empty string from assistive
      // technology, can activate unhighlighted items.
      (ge !== void 0 || _), Ee = se && !je && !U.current;
      U.current = !1, !(oe.type === "keydown" && H.current === null) && (g || oe.type === "keydown" && H.current === " " && O.current || Ee || (H.current = null, B(oe.nativeEvent)));
    },
    onPointerEnter(oe) {
      D.current = oe.pointerType;
    },
    onPointerMove(oe) {
      if (oe.pointerType === "mouse" && oe.buttons === 1) {
        const se = A.current;
        se.dragY += oe.movementY, se.dragY ** 2 >= 64 && (se.allowUnselectedMouseUp = !0);
      }
    },
    onPointerDown(oe) {
      D.current = oe.pointerType, U.current = !0, ne();
    },
    onMouseUp() {
      if (ne(), g || D.current === "touch" || U.current)
        return;
      const oe = !A.current.allowSelectedMouseUp && Y, se = !A.current.allowUnselectedMouseUp && !Y;
      oe || se || (U.current = !0, q.current?.click(), U.current = !1);
    }
  }, re = nt("div", o, {
    ref: [P, a, S.ref, q],
    state: T,
    props: [w, J, v, X]
  }), ie = y.useMemo(() => ({
    selected: Y,
    index: Q,
    textRef: x,
    selectedByFocus: te,
    hasRegistered: Z
  }), [Y, Q, x, te, Z]);
  return /* @__PURE__ */ b.jsx(aS.Provider, {
    value: ie,
    children: re
  });
})), _2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const i = o.keepMounted ?? !1, {
    selected: u
  } = yg();
  return i || u ? /* @__PURE__ */ b.jsx(H2, {
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
    selected: m
  } = yg(), g = y.useRef(null), {
    transitionStatus: d,
    setMounted: v
  } = $c(m), S = nt("span", n, {
    ref: [o, g],
    state: {
      selected: m,
      transitionStatus: d
    },
    props: [{
      "aria-hidden": !0,
      children: "✔️"
    }, p],
    stateAttributesMapping: _o
  });
  return Jl({
    open: m,
    ref: g,
    onComplete() {
      m || v(!1);
    }
  }), S;
})), U2 = /* @__PURE__ */ y.memo(/* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    index: i,
    textRef: u,
    selectedByFocus: f,
    hasRegistered: p
  } = yg(), {
    firstItemTextRef: m,
    selectedItemTextRef: g
  } = $l(), {
    render: d,
    className: v,
    style: x,
    ...S
  } = o, C = y.useCallback((M) => {
    M && (p && i === 0 && (m.current = M), p && f && (g.current = M));
  }, [m, g, i, f, p]);
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
  } = o, [m, g] = y.useState(), d = y.useMemo(() => ({
    labelId: m,
    setLabelId: g
  }), [m, g]), v = nt("div", o, {
    ref: a,
    props: [{
      role: "group",
      "aria-labelledby": m
    }, p]
  });
  return /* @__PURE__ */ b.jsx(L2.Provider, {
    value: d,
    children: v
  });
});
function iS({ ...n }) {
  return /* @__PURE__ */ b.jsx(m2, { "data-slot": "select", ...n });
}
function sS({ ...n }) {
  return /* @__PURE__ */ b.jsx(I2, { "data-slot": "select-group", ...n });
}
function cS({ ...n }) {
  return /* @__PURE__ */ b.jsx(S2, { "data-slot": "select-value", ...n });
}
function uS({
  className: n,
  size: o = "default",
  children: a,
  ...i
}) {
  return /* @__PURE__ */ b.jsxs(
    b2,
    {
      "data-slot": "select-trigger",
      "data-size": o,
      className: Ke(
        "tw:flex tw:w-full tw:items-center tw:justify-between tw:gap-2 tw:rounded-[var(--radius-control)] tw:border tw:border-input tw:bg-background tw:text-[length:var(--fs-body-s)] tw:text-foreground tw:whitespace-nowrap tw:outline-none tw:focus-visible:border-ring tw:focus-visible:ring-2 tw:focus-visible:ring-ring/40 tw:disabled:cursor-not-allowed tw:disabled:opacity-50 tw:data-[size=default]:h-8 tw:data-[size=sm]:h-7 tw:data-[size=default]:px-2.5 tw:data-[size=sm]:px-2 tw:data-[placeholder]:text-muted-foreground",
        n
      ),
      ...i,
      children: [
        a,
        /* @__PURE__ */ b.jsx(w2, { "data-icon": "select-chevron", "aria-hidden": "true", children: /* @__PURE__ */ b.jsx(hc, {}) })
      ]
    }
  );
}
function fS({
  className: n,
  children: o,
  portalContainer: a,
  positionerClassName: i,
  side: u,
  align: f,
  alignItemWithTrigger: p,
  sideOffset: m = 4,
  alignOffset: g,
  ...d
}) {
  return /* @__PURE__ */ b.jsx(T2, { container: a, children: /* @__PURE__ */ b.jsx(
    C2,
    {
      side: u,
      align: f,
      alignItemWithTrigger: p,
      sideOffset: m,
      alignOffset: g,
      className: Ke("tw:z-[var(--z-popover)]", i),
      children: /* @__PURE__ */ b.jsx(
        N2,
        {
          "data-slot": "select-content",
          className: Ke(
            "tw:min-w-(--anchor-width) tw:max-h-(--available-height) tw:origin-(--transform-origin) tw:overflow-x-hidden tw:overflow-y-auto tw:rounded-[var(--radius-control)] tw:border tw:border-border tw:bg-popover tw:p-1 tw:text-[length:var(--fs-body-s)] tw:text-popover-foreground tw:shadow-[var(--elevation-overlay)] tw:outline-none",
            n
          ),
          ...d,
          children: /* @__PURE__ */ b.jsx(j2, { className: "tw:flex tw:flex-col tw:gap-0.5", children: o })
        }
      )
    }
  ) });
}
function dS({ className: n, children: o, ...a }) {
  return /* @__PURE__ */ b.jsxs(
    k2,
    {
      "data-slot": "select-item",
      className: Ke(
        "tw:relative tw:flex tw:w-full tw:cursor-default tw:items-center tw:gap-2 tw:rounded-[var(--radius-control)] tw:py-1.5 tw:pr-8 tw:pl-2 tw:text-[length:var(--fs-body-s)] tw:outline-none tw:select-none tw:data-highlighted:bg-accent tw:data-highlighted:text-accent-foreground tw:data-disabled:pointer-events-none tw:data-disabled:opacity-50",
        n
      ),
      ...a,
      children: [
        /* @__PURE__ */ b.jsx("span", { className: "tw:absolute tw:right-2 tw:flex tw:size-3.5 tw:items-center tw:justify-center", "aria-hidden": "true", children: /* @__PURE__ */ b.jsx(_2, { children: /* @__PURE__ */ b.jsx(vi, { "data-icon": "select-check" }) }) }),
        /* @__PURE__ */ b.jsx(U2, { children: o })
      ]
    }
  );
}
function B2(n) {
  const o = y.useContext(sx) ? "drawer" : "dialog";
  return ux(n, o);
}
function V2({ ...n }) {
  return /* @__PURE__ */ b.jsx(B2, { "data-slot": "sheet", ...n });
}
function P2({ ...n }) {
  return /* @__PURE__ */ b.jsx(bx, { "data-slot": "sheet-portal", ...n });
}
function Y2({ className: n, ...o }) {
  return /* @__PURE__ */ b.jsx(
    fx,
    {
      "data-slot": "sheet-overlay",
      className: Ke(
        "tw:fixed tw:inset-0 tw:z-[var(--z-modal)] tw:bg-[var(--scrim)] tw:duration-[var(--motion-panel)] tw:supports-backdrop-filter:backdrop-blur-xs",
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
  return /* @__PURE__ */ b.jsxs(P2, { children: [
    f && /* @__PURE__ */ b.jsx(Y2, {}),
    /* @__PURE__ */ b.jsxs(
      vx,
      {
        "data-slot": "sheet-content",
        "data-side": a,
        "data-layer": i,
        className: Ke(
          "tw:fixed tw:flex tw:flex-col tw:gap-4 tw:bg-popover tw:bg-clip-padding tw:text-[length:var(--fs-body-s)] tw:text-popover-foreground tw:shadow-[var(--elevation-overlay)] tw:transition-[opacity,transform] tw:duration-[var(--motion-panel)] tw:ease-[var(--ease-out)] tw:data-[layer=panel]:z-[var(--z-sticky)] tw:data-[layer=modal]:z-[var(--z-modal)] tw:data-[side=bottom]:inset-x-0 tw:data-[side=bottom]:bottom-0 tw:data-[side=bottom]:h-auto tw:data-[side=bottom]:border-t tw:data-[side=bottom]:data-ending-style:translate-y-full tw:data-[side=bottom]:data-starting-style:translate-y-full tw:data-[side=left]:inset-y-0 tw:data-[side=left]:left-0 tw:data-[side=left]:h-full tw:data-[side=left]:w-3/4 tw:data-[side=left]:border-r tw:data-[side=left]:data-ending-style:-translate-x-full tw:data-[side=left]:data-starting-style:-translate-x-full tw:data-[side=right]:inset-y-0 tw:data-[side=right]:right-0 tw:data-[side=right]:h-full tw:data-[side=right]:w-3/4 tw:data-[side=right]:border-l tw:data-[side=right]:data-ending-style:translate-x-full tw:data-[side=right]:data-starting-style:translate-x-full tw:data-[side=top]:inset-x-0 tw:data-[side=top]:top-0 tw:data-[side=top]:h-auto tw:data-[side=top]:border-b tw:data-[side=top]:data-ending-style:-translate-y-full tw:data-[side=top]:data-starting-style:-translate-y-full tw:data-[side=left]:sm:max-w-sm tw:data-[side=right]:sm:max-w-sm",
          n
        ),
        ...p,
        children: [
          o,
          u && /* @__PURE__ */ b.jsxs(
            dx,
            {
              "data-slot": "sheet-close",
              render: /* @__PURE__ */ b.jsx(
                ct,
                {
                  variant: "ghost",
                  className: "tw:absolute tw:top-3 tw:right-3",
                  size: "icon-sm"
                }
              ),
              children: [
                /* @__PURE__ */ b.jsx(fi, {}),
                /* @__PURE__ */ b.jsx("span", { className: "tw:sr-only", children: "Close" })
              ]
            }
          )
        ]
      }
    )
  ] });
}
function q2({ className: n, ...o }) {
  return /* @__PURE__ */ b.jsx(
    "div",
    {
      "data-slot": "sheet-header",
      className: Ke("tw:flex tw:flex-col tw:gap-0.5 tw:p-4", n),
      ...o
    }
  );
}
function X2({ className: n, ...o }) {
  return /* @__PURE__ */ b.jsx(
    xx,
    {
      "data-slot": "sheet-title",
      className: Ke(
        "tw:text-[length:var(--fs-title)] tw:font-medium tw:text-foreground",
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
  return /* @__PURE__ */ b.jsx(
    px,
    {
      "data-slot": "sheet-description",
      className: Ke("tw:text-[length:var(--fs-body-s)] tw:text-muted-foreground", n),
      ...o
    }
  );
}
const pS = /* @__PURE__ */ y.createContext(void 0);
function K2(n = !0) {
  const o = y.useContext(pS);
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
    onPressedChange: m,
    pressed: g,
    render: d,
    type: v,
    // cannot change button type
    value: x,
    nativeButton: S = !0,
    style: C,
    ...w
  } = o, M = Bn(x || void 0), E = K2(), A = E?.value ?? [], O = E ? void 0 : u, z = (f || E?.disabled) ?? !1, [N, I] = aa({
    controlled: E ? M !== void 0 && A.indexOf(M) > -1 : g,
    default: O,
    name: "Toggle",
    state: "pressed"
  }), {
    getButtonProps: j,
    buttonRef: L
  } = Ao({
    disabled: z,
    native: S
  }), _ = {
    disabled: z,
    pressed: N
  }, k = [L, a], Y = [{
    "aria-pressed": N,
    onClick(Q) {
      const Z = !N, q = Ye(Do, Q.nativeEvent);
      m?.(Z, q), !q.isCanceled && (M && E?.setGroupValue?.(M, Z, q), !q.isCanceled && I(Z));
    }
  }, w, j], te = nt("button", o, {
    enabled: !E,
    state: _,
    ref: k,
    props: Y
  }), F = y.useMemo(() => ({
    disabled: z,
    focusableWhenDisabled: !1
  }), [z]);
  return E ? /* @__PURE__ */ b.jsx(Ix, {
    tag: "button",
    render: d,
    className: i,
    style: C,
    metadata: F,
    state: _,
    refs: k,
    props: Y
  }) : te;
}), Z2 = "data-composite-item-active", J2 = [];
function $2(n) {
  const {
    loopFocus: o = !0,
    orientation: a = "both",
    grid: i,
    onLoop: u,
    direction: f,
    highlightedIndex: p,
    onHighlightedIndexChange: m,
    rootRef: g,
    enableHomeAndEndKeys: d = !1,
    stopEventPropagation: v = !1,
    disabledIndices: x,
    modifierKeys: S = J2
  } = n, [C, w] = y.useState(0), M = i != null, E = y.useRef(null), A = Ro(E, g), O = y.useRef([]), z = y.useRef(!1), N = p ?? C, I = ze((Y, te = !1) => {
    if ((m ?? w)(Y), te) {
      const F = O.current[Y];
      pb(E.current, F, f, a);
    }
  }), j = ze((Y) => {
    if (Y.size === 0 || z.current)
      return;
    z.current = !0;
    const te = Array.from(Y.keys()), F = te.find((Z) => Z?.hasAttribute(Z2)) ?? null, Q = F ? te.indexOf(F) : -1;
    if (Q !== -1)
      I(Q);
    else if (Tc(te, N, x)) {
      const Z = Vl(te, {
        disabledIndices: x
      });
      di(te, Z) || I(Z);
    }
    pb(E.current, F, f, a);
  });
  xe(() => {
    if (x == null || p != null || !z.current)
      return;
    const Y = O.current;
    if (Tc(Y, N, x)) {
      const te = Vl(Y, {
        disabledIndices: x
      });
      di(Y, te) || I(te);
    }
  }, [x, p, N, O, I]);
  const L = ze((Y, te, F) => u ? u(Y, te, F, O) : F), _ = ze((Y) => {
    const te = d ? Ai : yx;
    if (!te.has(Y.key) || W2(Y, S) || !E.current)
      return;
    const Q = f === "rtl", Z = Q ? zc : Nc, q = {
      horizontal: Z,
      vertical: mi,
      both: Z
    }[a], H = Q ? Nc : zc, D = {
      horizontal: H,
      vertical: gi,
      both: H
    }[a], U = gn(Y.nativeEvent);
    if (U != null && db(U) && !Yx(U)) {
      const re = U.selectionStart, ie = U.selectionEnd, oe = U.value ?? "";
      if (re == null || Y.shiftKey || re !== ie || Y.key !== D && re < oe.length || Y.key !== q && re > 0)
        return;
    }
    let X = N;
    const P = dc(O, x), T = gp(O, x);
    i != null && (X = i({
      disabledIndices: x,
      elementsRef: O,
      event: Y,
      highlightedIndex: N,
      loopFocus: o,
      maxIndex: T,
      minIndex: P,
      onLoop: L,
      orientation: a,
      rtl: Q
    }));
    const B = {
      horizontal: [Z],
      vertical: [mi],
      both: [Z, mi]
    }[a], ne = {
      horizontal: [H],
      vertical: [gi],
      both: [H, gi]
    }[a], J = M ? te : {
      horizontal: d ? TO : mx,
      vertical: d ? RO : hx,
      both: te
    }[a];
    d && (Y.key === cu ? X = P : Y.key === uu && (X = T)), X === N && (B.includes(Y.key) || ne.includes(Y.key)) && (o && X === T && B.includes(Y.key) ? (X = P, u && (X = u(Y, N, X, O))) : o && X === P && ne.includes(Y.key) ? (X = T, u && (X = u(Y, N, X, O))) : X = Vl(O.current, {
      startingIndex: X,
      decrement: ne.includes(Y.key),
      disabledIndices: x
    })), X !== N && !di(O.current, X) && (v && Y.stopPropagation(), J.has(Y.key) && Y.preventDefault(), I(X, !0), queueMicrotask(() => {
      O.current[X]?.focus();
    }));
  });
  return {
    props: {
      ref: A,
      onFocus(Y) {
        const te = E.current, F = gn(Y.nativeEvent);
        !te || F == null || !db(F) || F.setSelectionRange(0, F.value.length ?? 0);
      },
      onKeyDown: _
    },
    highlightedIndex: N,
    onHighlightedIndexChange: I,
    elementsRef: O,
    disabledIndices: x,
    onMapChange: j,
    relayKeyboardEvent: _
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
    refs: u = Xl,
    props: f = Xl,
    state: p = xt,
    stateAttributesMapping: m,
    highlightedIndex: g,
    onHighlightedIndexChange: d,
    orientation: v,
    grid: x,
    loopFocus: S,
    onLoop: C,
    enableHomeAndEndKeys: w,
    onMapChange: M,
    stopEventPropagation: E = !0,
    rootRef: A,
    disabledIndices: O,
    modifierKeys: z,
    highlightItemOnHover: N = !1,
    tag: I = "div",
    ...j
  } = n, L = hu(), {
    props: _,
    highlightedIndex: k,
    onHighlightedIndexChange: Y,
    elementsRef: te,
    onMapChange: F,
    relayKeyboardEvent: Q
  } = $2({
    grid: x,
    loopFocus: S,
    onLoop: C,
    orientation: v,
    highlightedIndex: g,
    onHighlightedIndexChange: d,
    rootRef: A,
    stopEventPropagation: E,
    enableHomeAndEndKeys: w,
    direction: L,
    disabledIndices: O,
    modifierKeys: z
  }), Z = nt(I, n, {
    state: p,
    ref: u,
    props: [_, ...f, j],
    stateAttributesMapping: m
  }), q = y.useMemo(() => ({
    highlightedIndex: k,
    onHighlightedIndexChange: Y,
    highlightItemOnHover: N,
    relayKeyboardEvent: Q
  }), [k, Y, N, Q]);
  return /* @__PURE__ */ b.jsx(Vb.Provider, {
    value: q,
    children: /* @__PURE__ */ b.jsx(fg, {
      elementsRef: te,
      onMapChange: (H) => {
        M?.(H), F(H);
      },
      children: Z
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
const Tb = {
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
    orientation: m = "horizontal",
    multiple: g = !1,
    value: d,
    className: v,
    render: x,
    style: S,
    ...C
  } = o, w = mu(), M = nA(), E = y.useMemo(() => d !== void 0 || i !== void 0, [d, i]), A = (w?.disabled ?? !1) || (M?.disabled ?? !1) || u, [O, z] = aa({
    controlled: d,
    default: d === void 0 ? i ?? Xl : void 0,
    name: "ToggleGroup",
    state: "value"
  }), N = ze((k, Y, te) => {
    let F;
    g ? (F = O.slice(), Y ? F.push(k) : F.splice(O.indexOf(k), 1)) : F = Y ? [k] : [], p?.(F, te), !te.isCanceled && z(F);
  }), I = {
    disabled: A,
    multiple: g,
    orientation: m
  }, j = y.useMemo(() => ({
    disabled: A,
    orientation: m,
    setGroupValue: N,
    value: O,
    isValueInitialized: E
  }), [A, m, N, O, E]), L = {
    role: "group"
  }, _ = nt("div", o, {
    enabled: !!w,
    state: I,
    ref: a,
    props: [L, C],
    stateAttributesMapping: Tb
  });
  return /* @__PURE__ */ b.jsx(pS.Provider, {
    value: j,
    children: w ? _ : /* @__PURE__ */ b.jsx(eA, {
      render: x,
      className: v,
      style: S,
      state: I,
      refs: [a],
      props: [L, C],
      stateAttributesMapping: Tb,
      loopFocus: f,
      enableHomeAndEndKeys: !0,
      orientation: m
    })
  });
}), rA = ia(
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
function Rb({
  className: n,
  ...o
}) {
  return /* @__PURE__ */ b.jsx(
    oA,
    {
      "data-slot": "toggle-group",
      className: Ke("tw:flex tw:w-fit tw:flex-row tw:items-center tw:gap-1", n),
      ...o
    }
  );
}
function Cb({
  className: n,
  variant: o = "default",
  size: a = "default",
  ...i
}) {
  return /* @__PURE__ */ b.jsx(
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
  return /* @__PURE__ */ b.jsx(dE, { "data-slot": "spinner", role: "status", "aria-label": "Loading", className: Ke("tw:size-4 tw:animate-spin", n), ...o });
}
const gS = /* @__PURE__ */ y.createContext(void 0);
function Di(n) {
  const o = y.useContext(gS);
  if (o === void 0 && !n)
    throw new Error(At(72));
  return o;
}
const iA = {
  ...ou,
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
class vg extends Mi {
  constructor(o, a, i = !1) {
    const u = new ca(), f = {
      ...sA(),
      ...o
    };
    f.floatingRootContext = lg(u, a, i), super(f, {
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
    this.state.floatingRootContext.dispatchOpenChange(!1, Ye(Fl, o));
  }
  static useStore(o, a) {
    return Wp(o, (u, f) => new vg(a, u, f)).store;
  }
}
function sA() {
  return {
    ...lu(),
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
const cA = Jp(function(o) {
  const {
    disabled: a = !1,
    defaultOpen: i = !1,
    open: u,
    disableHoverablePopup: f = !1,
    trackCursorAxis: p = "none",
    actionsRef: m,
    onOpenChange: g,
    onOpenChangeComplete: d,
    handle: v,
    triggerId: x,
    defaultTriggerId: S = null,
    children: C
  } = o, w = vg.useStore(v?.store, {
    open: i,
    openProp: u,
    activeTriggerId: S,
    triggerIdProp: x
  });
  tg(w, u, i, S), w.useControlledProp("openProp", u), w.useControlledProp("triggerIdProp", x), w.useContextCallback("onOpenChange", g), w.useContextCallback("onOpenChangeComplete", d);
  const M = w.useState("open"), E = !a && M, A = w.useState("activeTriggerId"), O = w.useState("mounted"), z = w.useState("payload");
  w.useSyncedValues({
    trackCursorAxis: p,
    disableHoverablePopup: f
  }), w.useSyncedValue("disabled", a), eu(w, {
    closeOnActiveTriggerUnmount: !0
  });
  const {
    forceUnmount: N,
    transitionStatus: I
  } = tu(E, w), j = w.useState("isInstantPhase"), L = w.useState("instantType"), _ = w.useState("lastOpenChangeReason"), k = y.useRef(null);
  xe(() => {
    M && a && w.setOpen(!1, Ye(gR));
  }, [M, a, w]), xe(() => {
    I === "ending" && _ === Do || I !== "ending" && j ? (L !== "delay" && (k.current = L), w.set("instantType", "delay")) : k.current !== null && (w.set("instantType", k.current), k.current = null);
  }, [I, j, _, L, w]), xe(() => {
    E && A == null && w.set("payload", void 0);
  }, [w, A, E]);
  const Y = y.useCallback(() => {
    w.setOpen(!1, Ye(qc));
  }, [w]);
  y.useImperativeHandle(m, () => ({
    unmount: N,
    close: Y
  }), [N, Y]);
  const te = E || O || !a && p !== "none";
  return /* @__PURE__ */ b.jsxs(gS.Provider, {
    value: w,
    children: [te && /* @__PURE__ */ b.jsx(uA, {
      store: w,
      disabled: a,
      trackCursorAxis: p
    }), typeof C == "function" ? C({
      payload: z
    }) : C]
  });
});
function uA({
  store: n,
  disabled: o,
  trackCursorAxis: a
}) {
  const i = n.useState("floatingRootContext"), u = Oi(i, {
    enabled: !o,
    referencePress: () => n.select("closeOnClick")
  }), f = QR(i, {
    enabled: !o && a !== "none",
    axis: a === "none" ? void 0 : a
  }), p = y.useMemo(() => bn(f.reference, u.reference), [f.reference, u.reference]), m = y.useMemo(() => bn(f.trigger, u.trigger), [f.trigger, u.trigger]), g = y.useMemo(() => bn(sa, f.floating, u.floating), [f.floating, u.floating]);
  return nu(n, {
    activeTriggerProps: p,
    inactiveTriggerProps: m,
    popupProps: g
  }), null;
}
const mS = /* @__PURE__ */ y.createContext(void 0);
function fA() {
  return y.useContext(mS);
}
let dA = (function(n) {
  return n[n.popupOpen = Mc.popupOpen] = "popupOpen", n.triggerDisabled = "data-trigger-disabled", n;
})({});
const pA = 600, hS = "data-base-ui-tooltip-trigger";
function Ob(n) {
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
    if (o.hasAttribute(hS))
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
const mA = Z0(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    handle: p,
    payload: m,
    disabled: g,
    delay: d,
    closeOnClick: v = !0,
    closeDelay: x,
    id: S,
    ...C
  } = o, w = Di(!0), M = p?.store ?? w;
  if (!M)
    throw new Error(At(82));
  const E = Bn(S), A = M.useState("isTriggerActive", E), O = M.useState("isOpenedByTrigger", E), z = M.useState("floatingRootContext"), N = y.useRef(null), I = d ?? pA, j = x ?? 0, {
    registerTrigger: L,
    isMountedByThisTrigger: _
  } = ng(E, N, M, {
    payload: m,
    closeOnClick: v,
    closeDelay: j
  }), k = fA(), {
    delayRef: Y,
    isInstantPhase: te,
    hasProvider: F
  } = vR(z, {
    open: O
  }), Q = ag(z);
  M.useSyncedValue("isInstantPhase", te);
  const Z = M.useState("disabled"), q = g ?? Z, H = Yt(q), D = M.useState("trackCursorAxis"), U = M.useState("disableHoverablePopup"), X = y.useRef(!1), P = sn(), T = y.useRef(void 0);
  function B() {
    const fe = k?.delay, ye = typeof Y.current == "object" ? Y.current.open : void 0;
    let Re = I;
    return F && (ye !== 0 ? Re = d ?? fe ?? I : Re = 0), Re;
  }
  function ne(fe) {
    const ye = N.current;
    if (!ye || !fe)
      return !1;
    const Re = gA(fe);
    return Re !== null && Re !== ye && Le(ye, Re);
  }
  function J(fe) {
    const ye = ne(fe);
    return X.current = ye, ye && (Q.openChangeTimeout.clear(), Q.restTimeout.clear(), Q.restTimeoutPending = !1, P.clear()), ye;
  }
  const re = ru(z, {
    enabled: !q,
    mouseOnly: !0,
    move: !1,
    handleClose: !U && D !== "both" ? iu() : null,
    restMs: B,
    delay() {
      const fe = typeof Y.current == "object" ? Y.current.close : void 0;
      let ye = j;
      return x == null && F && (ye = fe), {
        close: ye
      };
    },
    triggerElementRef: N,
    isActiveTrigger: A,
    isClosing: () => M.select("transitionStatus") === "ending",
    shouldOpen() {
      return !X.current;
    }
  }), ie = ox(z, {
    enabled: !q
  }).reference, oe = (fe) => {
    const ye = X.current, Re = Ob(fe), _e = J(Re), ke = N.current, we = ke && Re && Le(ke, Re);
    if (_e && M.select("open") && M.select("lastOpenChangeReason") === Pt) {
      M.setOpen(!1, Ye(Pt, fe));
      return;
    }
    if (ye && !_e && we && !H.current && !M.select("open") && ke && // Match the hover hook's non-strict mouse fallback for mouse-only event sequences.
    rr(T.current)) {
      const Ce = () => {
        !X.current && !H.current && !M.select("open") && M.setOpen(!0, Ye(Pt, fe, ke));
      }, he = B();
      he === 0 ? (P.clear(), Ce()) : P.start(he, Ce);
    }
  }, se = M.useState("triggerProps", _);
  return nt("button", o, {
    state: {
      open: O
    },
    ref: [a, L, N],
    props: [re, ie, _ || D !== "none" ? se : void 0, {
      onMouseOver(fe) {
        oe(fe.nativeEvent);
      },
      onFocus(fe) {
        ne(Ob(fe.nativeEvent)) && fe.preventBaseUIHandler();
      },
      onMouseLeave() {
        X.current = !1, P.clear(), T.current = void 0;
      },
      onPointerEnter(fe) {
        T.current = fe.pointerType;
      },
      onPointerDown(fe) {
        T.current = fe.pointerType, M.set("closeOnClick", v), v && !M.select("open") && M.cancelPendingOpen(fe.nativeEvent);
      },
      onClick(fe) {
        v && !M.select("open") && M.cancelPendingOpen(fe.nativeEvent);
      },
      id: E,
      [dA.triggerDisabled]: q ? "" : void 0,
      [hS]: q ? void 0 : ""
    }, C],
    stateAttributesMapping: su
  });
}), yS = /* @__PURE__ */ y.createContext(void 0);
function hA() {
  const n = y.useContext(yS);
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
    style: m,
    ...g
  } = o, {
    portalNode: d,
    portalSubtree: v
  } = k0({
    container: u,
    ref: a,
    componentProps: o,
    elementProps: g
  });
  return !v && !d ? null : /* @__PURE__ */ b.jsxs(y.Fragment, {
    children: [v, d && /* @__PURE__ */ ml.createPortal(i, d)]
  });
}), vA = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    keepMounted: i = !1,
    ...u
  } = o;
  return Di().useState("mounted") || i ? /* @__PURE__ */ b.jsx(yS.Provider, {
    value: i,
    children: /* @__PURE__ */ b.jsx(yA, {
      ref: a,
      ...u
    })
  }) : null;
}), vS = /* @__PURE__ */ y.createContext(void 0);
function bS() {
  const n = y.useContext(vS);
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
    side: m = "top",
    align: g = "center",
    sideOffset: d = 0,
    alignOffset: v = 0,
    collisionBoundary: x = "clipping-ancestors",
    collisionPadding: S = 5,
    arrowPadding: C = 5,
    sticky: w = !1,
    disableAnchorTracking: M = !1,
    collisionAvoidance: E = Xp,
    style: A,
    ...O
  } = o, z = Di(), N = hA(), I = z.useState("open"), j = z.useState("mounted"), L = z.useState("trackCursorAxis"), _ = z.useState("disableHoverablePopup"), k = z.useState("floatingRootContext"), Y = z.useState("instantType"), te = z.useState("transitionStatus"), F = z.useState("hasViewport"), Q = yu({
    anchor: f,
    positionMethod: p,
    floatingRootContext: k,
    mounted: j,
    side: m,
    sideOffset: d,
    align: g,
    alignOffset: v,
    collisionBoundary: x,
    collisionPadding: S,
    sticky: w,
    arrowPadding: C,
    disableAnchorTracking: M,
    keepMounted: N,
    collisionAvoidance: E,
    adaptiveOrigin: F ? ug : void 0
  }), Z = y.useMemo(() => ({
    open: I,
    side: Q.side,
    align: Q.align,
    anchorHidden: Q.anchorHidden,
    instant: L !== "none" ? "tracking-cursor" : Y
  }), [I, Q.side, Q.align, Q.anchorHidden, L, Y]), q = vu(o, Z, {
    styles: Q.positionerStyles,
    transitionStatus: te,
    props: O,
    refs: [a, z.useStateSetter("positionerElement")],
    hidden: !j,
    inert: !I || L === "both" || _
  });
  return /* @__PURE__ */ b.jsx(vS.Provider, {
    value: Q,
    children: q
  });
}), xA = {
  ...Ho,
  ..._o
}, SA = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    ...p
  } = o, m = Di(), {
    side: g,
    align: d
  } = bS(), v = m.useState("open"), x = m.useState("instantType"), S = m.useState("transitionStatus"), C = m.useState("popupProps"), w = m.useState("floatingRootContext"), M = m.useState("disabled"), E = m.useState("closeDelay");
  Jl({
    open: v,
    ref: m.context.popupRef,
    onComplete() {
      v && m.context.onOpenChangeComplete?.(!0);
    }
  }), ig(w, {
    enabled: !M,
    closeDelay: E
  });
  const A = m.useStateSetter("popupElement");
  return nt("div", o, {
    state: {
      open: v,
      side: g,
      align: d,
      instant: x,
      transitionStatus: S
    },
    ref: [a, m.context.popupRef, A],
    props: [C, Ni(S), p],
    stateAttributesMapping: xA
  });
}), wA = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    ...p
  } = o, m = Di(), {
    arrowRef: g,
    side: d,
    align: v,
    arrowUncentered: x,
    arrowStyles: S
  } = bS(), C = m.useState("open"), w = m.useState("instantType");
  return nt("div", o, {
    state: {
      open: C,
      side: d,
      align: v,
      uncentered: x,
      instant: w
    },
    ref: [a, g],
    props: [{
      style: S,
      "aria-hidden": !0
    }, p],
    stateAttributesMapping: Ho
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
  return /* @__PURE__ */ b.jsx(mS.Provider, {
    value: f,
    children: /* @__PURE__ */ b.jsx(yR, {
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
  return /* @__PURE__ */ b.jsx(
    EA,
    {
      "data-slot": "tooltip-provider",
      delay: n,
      ...o
    }
  );
}
function RA({ ...n }) {
  return /* @__PURE__ */ b.jsx(cA, { "data-slot": "tooltip", ...n });
}
function CA({ ...n }) {
  return /* @__PURE__ */ b.jsx(mA, { "data-slot": "tooltip-trigger", ...n });
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
  return /* @__PURE__ */ b.jsx(vA, { children: /* @__PURE__ */ b.jsx(
    bA,
    {
      align: i,
      alignOffset: u,
      side: o,
      sideOffset: a,
      className: "tw:isolate tw:z-[var(--z-popover)]",
      children: /* @__PURE__ */ b.jsxs(
        SA,
        {
          "data-slot": "tooltip-content",
          className: Ke(
            "tw:inline-flex tw:w-fit tw:max-w-xs tw:items-center tw:gap-1.5 tw:rounded-[var(--radius-control)] tw:bg-foreground tw:px-3 tw:py-1.5 tw:text-[length:var(--fs-label)] tw:text-background tw:has-data-[slot=kbd]:pr-1.5 tw:**:data-[slot=kbd]:relative tw:**:data-[slot=kbd]:isolate tw:**:data-[slot=kbd]:rounded-sm",
            n
          ),
          ...p,
          children: [
            f,
            /* @__PURE__ */ b.jsx(wA, { className: "tw:size-2.5 tw:translate-y-[calc(-50%-2px)] tw:rotate-45 tw:bg-foreground tw:fill-foreground tw:data-[side=bottom]:top-1 tw:data-[side=inline-end]:top-1/2! tw:data-[side=inline-end]:-left-1 tw:data-[side=inline-end]:-translate-y-1/2 tw:data-[side=inline-start]:top-1/2! tw:data-[side=inline-start]:-right-1 tw:data-[side=inline-start]:-translate-y-1/2 tw:data-[side=left]:top-1/2! tw:data-[side=left]:-right-1 tw:data-[side=left]:-translate-y-1/2 tw:data-[side=right]:top-1/2! tw:data-[side=right]:-left-1 tw:data-[side=right]:-translate-y-1/2 tw:data-[side=top]:-bottom-2.5" })
          ]
        }
      )
    }
  ) });
}
function MA(...n) {
  return n.filter(Boolean).join(" ");
}
const xS = 420;
function AA(n) {
  const [o, a] = n.split("-");
  return { side: o, align: a ?? "center" };
}
function zA({ children: n }) {
  return /* @__PURE__ */ b.jsx(TA, { delay: xS, closeDelay: 0, children: n });
}
function lr(n) {
  const { label: o, children: a, placement: i = "top", contentClassName: u } = n, f = np.useId(), [p, m] = np.useState(!1);
  return /* @__PURE__ */ b.jsxs(RA, { open: p, onOpenChange: m, children: [
    /* @__PURE__ */ b.jsx(
      CA,
      {
        delay: xS,
        closeDelay: 0,
        "aria-describedby": p ? f : void 0,
        onBlur: () => m(!1),
        onMouseLeave: () => m(!1),
        render: a
      }
    ),
    /* @__PURE__ */ b.jsx(OA, { id: f, role: "tooltip", ...AA(i), className: MA("ui-tooltip open", u), children: o })
  ] });
}
const dt = (n) => document.getElementById(n);
function Zr(n) {
  dt(n)?.click();
}
function SS(n) {
  const o = dt(n);
  return o ? [...o.options].map((a) => ({ value: a.value, label: a.text })) : [];
}
function Ep(n, o) {
  const a = dt(n);
  a && (a.value = o, a.dispatchEvent(new Event("change", { bubbles: !0 })));
}
function fc(n, o) {
  return [...document.querySelectorAll(`#${n} ${o}`)].map((a, i) => ({
    key: a.dataset.pick ?? a.dataset.wfpick ?? a.dataset.rec ?? a.dataset.cat ?? a.dataset.fmt ?? String(i),
    label: (a instanceof HTMLInputElement ? a.closest("label")?.textContent : a.textContent)?.replace(/\s+/g, " ").trim() || "Option",
    active: a instanceof HTMLInputElement && a.checked || a.classList.contains("on") || a.closest(".mi")?.classList.contains("on") === !0,
    element: a
  }));
}
const Mb = /* @__PURE__ */ new Set(["png", "jpg", "svg", "mp4", "pdf", "html", "docx", "xlsx", "csv", "md"]);
function Tp(n) {
  return n.replace(/\s+\d+$/, "").trim();
}
function tp(n) {
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
const NA = {
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
function jA({
  state: n,
  folder: o,
  collectionItems: a
}) {
  const [i, u] = y.useState(""), [f, p] = y.useState(!1), [m, g] = y.useState(!1), [d, v] = y.useState(""), [x, S] = y.useState(!1), [C, w] = y.useState(!1), M = window.__galleryFileTypes, E = n.types.filter((k) => k.active).map((k) => k.key), A = n.pinned.map((k) => n.types.find((Y) => Y.key === k)).filter((k) => !!k), O = A.filter((k) => Mb.has(k.key)), z = A.filter((k) => !Mb.has(k.key)), N = n.types.filter((k) => {
    const Y = i.trim().toLowerCase();
    return !Y || k.key.includes(Y) || k.label.toLowerCase().includes(Y);
  }), I = SS("folder").map((k) => ({
    value: k.value,
    label: k.value ? k.label : "All folders"
  })), j = (k, Y) => {
    const te = new Set(k);
    M?.setActive([...E.filter((F) => !te.has(F)), ...Y]);
  }, L = () => {
    const k = d.trim();
    k && (M?.savePreset(k), v(""), g(!1));
  };
  if (f)
    return /* @__PURE__ */ b.jsxs(b.Fragment, { children: [
      /* @__PURE__ */ b.jsxs(i2, { className: "gallery-filter-panel-head", children: [
        /* @__PURE__ */ b.jsx(kc, { className: "tw:sr-only", children: "File types" }),
        /* @__PURE__ */ b.jsx(xp, { className: "tw:sr-only", children: "Customize quick file types for this project" }),
        /* @__PURE__ */ b.jsxs("div", { children: [
          /* @__PURE__ */ b.jsx("div", { className: "gallery-filter-panel-title", children: "Customize Quick Types" }),
          /* @__PURE__ */ b.jsxs("div", { className: "gallery-filter-helper", children: [
            "Saved for ",
            n.projectName
          ] })
        ] }),
        /* @__PURE__ */ b.jsx(ct, { variant: "ghost", size: "sm", onClick: () => p(!1), children: "Done" })
      ] }),
      /* @__PURE__ */ b.jsx(ta, {}),
      /* @__PURE__ */ b.jsx("div", { className: "gallery-filter-scroll", children: /* @__PURE__ */ b.jsxs("div", { className: "gallery-filter-section", children: [
        /* @__PURE__ */ b.jsx("div", { className: "gallery-filter-section-label", children: "Choose pinned types" }),
        /* @__PURE__ */ b.jsx(
          Rb,
          {
            multiple: !0,
            value: n.pinned,
            onValueChange: (k) => M?.setPinned(k),
            className: "gallery-type-customize-grid",
            "aria-label": "Quick file types for this project",
            children: n.types.map((k) => /* @__PURE__ */ b.jsxs(
              Cb,
              {
                value: k.key,
                variant: "outline",
                size: "sm",
                "data-gallery-customize-type": k.key,
                children: [
                  /* @__PURE__ */ b.jsx(rp, { "data-icon": "inline-start" }),
                  k.label
                ]
              },
              k.key
            ))
          }
        )
      ] }) })
    ] });
  const _ = (k, Y) => {
    if (!Y.length) return null;
    const te = Y.map((F) => F.key);
    return /* @__PURE__ */ b.jsxs("div", { className: "gallery-type-group", children: [
      /* @__PURE__ */ b.jsx("div", { className: "gallery-filter-sub-label", children: k }),
      /* @__PURE__ */ b.jsx(
        Rb,
        {
          multiple: !0,
          value: E.filter((F) => te.includes(F)),
          onValueChange: (F) => j(te, F),
          className: "gallery-quick-types",
          "aria-label": `${k.toLowerCase()} file types`,
          children: Y.map((F) => /* @__PURE__ */ b.jsx(
            Cb,
            {
              value: F.key,
              variant: "outline",
              size: "xs",
              "data-gallery-quick-type": F.key,
              "data-gallery-active": F.active ? "true" : void 0,
              children: F.label
            },
            F.key
          ))
        }
      )
    ] });
  };
  return /* @__PURE__ */ b.jsxs(b.Fragment, { children: [
    /* @__PURE__ */ b.jsx(kc, { className: "tw:sr-only", children: "File types" }),
    /* @__PURE__ */ b.jsx(xp, { className: "tw:sr-only", children: "Filter files and customize quick file types for this project" }),
    /* @__PURE__ */ b.jsxs("div", { className: "gallery-filter-scroll", "data-gallery-file-type-panel": !0, children: [
      /* @__PURE__ */ b.jsxs("section", { className: "gallery-filter-section", "aria-labelledby": "quick-types-heading", children: [
        /* @__PURE__ */ b.jsxs("div", { className: "gallery-filter-section-heading", children: [
          /* @__PURE__ */ b.jsxs("div", { children: [
            /* @__PURE__ */ b.jsx("div", { id: "quick-types-heading", className: "gallery-filter-section-label", children: "Quick Types" }),
            /* @__PURE__ */ b.jsx("div", { className: "gallery-filter-helper", children: "Pinned for this project" })
          ] }),
          /* @__PURE__ */ b.jsx(lr, { label: "Customize quick types", children: /* @__PURE__ */ b.jsx(ct, { variant: "ghost", size: "icon-xs", "aria-label": "Customize quick types", onClick: () => p(!0), children: /* @__PURE__ */ b.jsx(jb, {}) }) })
        ] }),
        _("Outputs", O),
        _("Sources", z)
      ] }),
      /* @__PURE__ */ b.jsx(ta, {}),
      /* @__PURE__ */ b.jsxs("section", { className: "gallery-filter-section", "aria-labelledby": "project-presets-heading", children: [
        /* @__PURE__ */ b.jsxs("div", { children: [
          /* @__PURE__ */ b.jsx("div", { id: "project-presets-heading", className: "gallery-filter-section-label", children: "Project Presets" }),
          /* @__PURE__ */ b.jsx("div", { className: "gallery-filter-helper", children: "Saved only in this project" })
        ] }),
        /* @__PURE__ */ b.jsxs("div", { className: "gallery-project-presets", children: [
          n.presets.map((k) => /* @__PURE__ */ b.jsxs("div", { className: "gallery-project-preset", children: [
            /* @__PURE__ */ b.jsx(
              ct,
              {
                variant: k.active ? "secondary" : "outline",
                size: "xs",
                "data-gallery-file-preset": k.id,
                onClick: () => M?.applyPreset(k.id),
                children: k.label
              }
            ),
            k.custom && /* @__PURE__ */ b.jsx(
              ct,
              {
                variant: "ghost",
                size: "icon-xs",
                "aria-label": `Delete preset ${k.label}`,
                onClick: () => M?.removePreset(k.id),
                children: /* @__PURE__ */ b.jsx(fi, {})
              }
            )
          ] }, k.id)),
          /* @__PURE__ */ b.jsx(lr, { label: "New preset", children: /* @__PURE__ */ b.jsx(ct, { variant: "outline", size: "icon-xs", "data-gallery-new-preset": !0, "aria-label": "New preset", onClick: () => g(!0), children: /* @__PURE__ */ b.jsx(Db, {}) }) })
        ] }),
        m && /* @__PURE__ */ b.jsxs(Dc, { "data-gallery-preset-form": !0, children: [
          /* @__PURE__ */ b.jsx(
            jc,
            {
              "aria-label": "New preset name",
              placeholder: "Preset name…",
              value: d,
              onChange: (k) => v(k.target.value),
              onKeyDown: (k) => {
                k.key === "Enter" && (k.preventDefault(), L()), k.key === "Escape" && (k.stopPropagation(), g(!1));
              },
              autoFocus: !0
            }
          ),
          /* @__PURE__ */ b.jsx(hi, { align: "inline-end", children: /* @__PURE__ */ b.jsx(bp, { onClick: L, disabled: !d.trim(), children: "Save" }) })
        ] })
      ] }),
      /* @__PURE__ */ b.jsxs("section", { "aria-labelledby": "all-file-types-heading", children: [
        /* @__PURE__ */ b.jsxs(
          ct,
          {
            variant: "ghost",
            size: "sm",
            className: "gallery-filter-disclosure",
            "aria-expanded": x,
            onClick: () => S((k) => !k),
            children: [
              /* @__PURE__ */ b.jsx("span", { id: "all-file-types-heading", children: "All file types" }),
              x ? /* @__PURE__ */ b.jsx(hc, { "data-icon": "inline-end" }) : /* @__PURE__ */ b.jsx(lp, { "data-icon": "inline-end" })
            ]
          }
        ),
        x && /* @__PURE__ */ b.jsxs("div", { className: "gallery-filter-collapsible-content", children: [
          /* @__PURE__ */ b.jsxs(Dc, { children: [
            /* @__PURE__ */ b.jsx(
              jc,
              {
                "aria-label": "Search file types",
                placeholder: "Search extension or language…",
                value: i,
                onChange: (k) => u(k.target.value)
              }
            ),
            /* @__PURE__ */ b.jsx(hi, { align: "inline-start", "aria-hidden": "true", children: /* @__PURE__ */ b.jsx(op, {}) })
          ] }),
          /* @__PURE__ */ b.jsx("div", { className: "gallery-all-types", role: "list", "aria-label": "All file types", children: N.map((k) => /* @__PURE__ */ b.jsxs("div", { className: "gallery-all-type-row", role: "listitem", children: [
            /* @__PURE__ */ b.jsxs(
              ct,
              {
                variant: "ghost",
                size: "sm",
                "data-gallery-file-type": k.key,
                "aria-pressed": k.active,
                onClick: () => j([k.key], k.active ? [] : [k.key]),
                children: [
                  k.active && /* @__PURE__ */ b.jsx(vi, { "data-icon": "inline-start" }),
                  k.label
                ]
              }
            ),
            /* @__PURE__ */ b.jsx(
              ct,
              {
                variant: "ghost",
                size: "icon-sm",
                "aria-label": `${k.pinned ? "Unpin" : "Pin"} ${k.label} for this project`,
                "aria-pressed": k.pinned,
                "data-gallery-pin-type": k.key,
                onClick: () => M?.setPinned(k.pinned ? n.pinned.filter((Y) => Y !== k.key) : [...n.pinned, k.key]),
                children: /* @__PURE__ */ b.jsx(rp, {})
              }
            )
          ] }, k.key)) })
        ] })
      ] }),
      /* @__PURE__ */ b.jsxs("section", { "aria-labelledby": "other-filters-heading", children: [
        /* @__PURE__ */ b.jsxs(
          ct,
          {
            variant: "ghost",
            size: "sm",
            className: "gallery-filter-disclosure",
            "aria-expanded": C,
            onClick: () => w((k) => !k),
            children: [
              /* @__PURE__ */ b.jsx("span", { id: "other-filters-heading", children: "Folders & collections" }),
              C ? /* @__PURE__ */ b.jsx(hc, { "data-icon": "inline-end" }) : /* @__PURE__ */ b.jsx(lp, { "data-icon": "inline-end" })
            ]
          }
        ),
        C && /* @__PURE__ */ b.jsxs("div", { className: "gallery-filter-section gallery-other-filters", children: [
          /* @__PURE__ */ b.jsxs("div", { className: "gallery-other-filter-row", children: [
            /* @__PURE__ */ b.jsx(rE, { "aria-hidden": "true" }),
            /* @__PURE__ */ b.jsxs(
              iS,
              {
                items: I,
                modal: !1,
                value: o?.value ?? "",
                onValueChange: (k) => Ep("folder", k ?? ""),
                children: [
                  /* @__PURE__ */ b.jsx(uS, { size: "sm", "aria-label": "Filter by folder", children: /* @__PURE__ */ b.jsx(cS, {}) }),
                  /* @__PURE__ */ b.jsx(fS, { children: /* @__PURE__ */ b.jsx(sS, { children: I.map((k) => /* @__PURE__ */ b.jsx(dS, { value: k.value, children: k.label }, k.value || "all")) }) })
                ]
              }
            )
          ] }),
          a.length > 0 && /* @__PURE__ */ b.jsxs("div", { className: "gallery-type-group", children: [
            /* @__PURE__ */ b.jsx("div", { className: "gallery-filter-sub-label", children: "Collections" }),
            /* @__PURE__ */ b.jsx("div", { className: "gallery-collection-filters", children: a.map((k) => /* @__PURE__ */ b.jsx(ct, { variant: k.active ? "secondary" : "outline", size: "sm", onClick: () => k.element.click(), children: Tp(k.label) }, k.key)) })
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ b.jsx(ta, {}),
    /* @__PURE__ */ b.jsx("div", { className: "gallery-filter-panel-foot", children: /* @__PURE__ */ b.jsxs(ct, { variant: "ghost", size: "sm", onClick: () => M?.resetFilters(), children: [
      /* @__PURE__ */ b.jsx(bE, { "data-icon": "inline-start" }),
      "Reset filters"
    ] }) })
  ] });
}
function kA(n) {
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
function _A() {
  const [, n] = y.useReducer((D) => D + 1, 0), o = y.useRef(null), a = y.useRef(null), [i, u] = y.useState(!1), [f, p] = y.useState(!1), [m, g] = y.useState(!1), [d, v] = y.useState(""), x = dt("q")?.value ?? "", S = dt("sort"), C = dt("folder"), w = dt("favChip"), M = dt("rescan")?.classList.contains("spinning") === !0, E = dt("densitySeg")?.querySelector("button.on")?.dataset.d ?? "m", A = fc("collMenu", "[data-pick]"), O = fc("wfMenu", "[data-wfpick]"), z = fc("recMenu", "[data-rec]"), N = window.__galleryFileTypes?.getState() ?? {
    projectName: "this project",
    types: fc("fmtMenu", "input[data-fmt]").map((D) => ({
      key: D.key,
      label: Tp(D.label),
      active: D.active,
      pinned: !1
    })),
    pinned: [],
    presets: [],
    summary: "File types"
  }, I = window.__gallerySelection?.getState() ?? { rels: [], imageCount: 0 }, j = DA(N), L = document.querySelectorAll("#activeChips [data-fx]:not([data-fx='fav'])").length, _ = w?.classList.contains("on") === !0, k = SS("sort").map((D) => ({ value: D.value, label: tp(D.value) })), Y = S?.value ?? "mtime", te = NA[Y], F = O.some((D) => D.active && D.key !== ""), Q = A.some((D) => D.active), Z = () => dt("collMenu")?.querySelector("[data-clear]")?.click(), q = () => {
    const D = d.trim();
    if (!D) return;
    const U = dt("collQuick"), X = dt("collQuickAdd");
    U && X && (U.value = D, X.click()), v("");
  };
  y.useEffect(() => {
    const D = () => n(), U = new MutationObserver(D);
    [
      dt("activeChips"),
      dt("densitySeg"),
      dt("favChip"),
      dt("rescan"),
      dt("fmtMenu"),
      dt("collMenu"),
      dt("wfMenu"),
      dt("recMenu"),
      dt("selBar")
    ].filter((T) => !!T).forEach((T) => U.observe(T, {
      attributes: !0,
      childList: !0,
      characterData: !0,
      subtree: !0
    }));
    const P = [dt("q"), dt("sort"), dt("folder")].filter((T) => !!T);
    return P.forEach((T) => {
      T.addEventListener("input", D), T.addEventListener("change", D);
    }), window.addEventListener("atelier-gallery-file-types-change", D), window.addEventListener("atelier-gallery-selection-change", D), document.documentElement.classList.add("gallery-react-mounted"), document.documentElement.dataset.galleryUi = "shadcn-react-v1", () => {
      U.disconnect(), P.forEach((T) => {
        T.removeEventListener("input", D), T.removeEventListener("change", D);
      }), window.removeEventListener("atelier-gallery-file-types-change", D), window.removeEventListener("atelier-gallery-selection-change", D), document.documentElement.classList.remove("gallery-react-mounted");
    };
  }, []), y.useEffect(() => {
    I.rels.length && (u(!1), p(!1));
  }, [I.rels.length]), y.useEffect(() => {
    if (!f) return;
    const D = (U) => {
      U.key === "Escape" && (U.preventDefault(), U.stopPropagation(), p(!1), requestAnimationFrame(() => o.current?.focus()));
    };
    return window.addEventListener("keydown", D, !0), () => window.removeEventListener("keydown", D, !0);
  }, [f]), y.useEffect(() => {
    const D = (U) => {
      const X = U.target, P = X?.matches("input, textarea, select") || X?.isContentEditable;
      U.key !== "/" || U.metaKey || U.ctrlKey || U.altKey || P || (U.preventDefault(), p(!1), u(!0));
    };
    return document.addEventListener("keydown", D), () => document.removeEventListener("keydown", D);
  }, []);
  const H = (D) => {
    const U = dt("q");
    U && (U.value = D, U.dispatchEvent(new Event("input", { bubbles: !0 })));
  };
  if (I.rels.length) {
    const D = window.__gallerySelection;
    return /* @__PURE__ */ b.jsxs("div", { className: "gallery-command-bar gallery-selection-command-bar", role: "toolbar", "aria-label": "Selected files actions", "data-gallery-toolbar-state": "selection", children: [
      /* @__PURE__ */ b.jsxs("div", { className: "gallery-selection-count", "aria-live": "polite", children: [
        /* @__PURE__ */ b.jsx(EE, { "aria-hidden": "true" }),
        /* @__PURE__ */ b.jsxs("span", { children: [
          I.rels.length,
          /* @__PURE__ */ b.jsx("span", { className: "gallery-selection-word", children: " selected" })
        ] })
      ] }),
      /* @__PURE__ */ b.jsx("div", { className: "gallery-command-spacer" }),
      I.rels.length === 1 && /* @__PURE__ */ b.jsx(ct, { className: "gallery-selection-inline", variant: "outline", size: "sm", "data-gallery-selection-action": "open", onClick: () => D?.open(), children: "Open" }),
      I.imageCount >= 2 && /* @__PURE__ */ b.jsx(ct, { className: "gallery-selection-inline", variant: "outline", size: "sm", "data-gallery-selection-action": "compare", onClick: () => D?.compare(), children: "Compare" }),
      /* @__PURE__ */ b.jsx(ct, { className: "gallery-selection-inline", variant: "outline", size: "sm", "data-gallery-selection-action": "collect", onClick: (U) => {
        U.stopPropagation(), D?.collect(U.currentTarget);
      }, children: "Collect" }),
      /* @__PURE__ */ b.jsxs(ct, { className: "gallery-selection-inline", variant: "outline", size: "sm", "data-gallery-selection-action": "export", onClick: (U) => {
        U.stopPropagation(), D?.export(U.currentTarget);
      }, children: [
        "Export ",
        /* @__PURE__ */ b.jsx(hc, { "data-icon": "inline-end" })
      ] }),
      /* @__PURE__ */ b.jsxs(oc, { modal: !1, children: [
        /* @__PURE__ */ b.jsx(rc, { render: /* @__PURE__ */ b.jsx(ct, { ref: a, variant: "ghost", size: "icon-sm", "aria-label": "More selection actions", children: /* @__PURE__ */ b.jsx(xv, {}) }) }),
        /* @__PURE__ */ b.jsxs(ii, { align: "end", className: "tw:w-48", children: [
          /* @__PURE__ */ b.jsxs(Ll, { className: "gallery-selection-overflow", children: [
            I.rels.length === 1 && /* @__PURE__ */ b.jsx(fl, { onClick: () => D?.open(), children: "Open" }),
            I.imageCount >= 2 && /* @__PURE__ */ b.jsx(fl, { onClick: () => D?.compare(), children: "Compare" }),
            /* @__PURE__ */ b.jsx(fl, { onClick: (U) => {
              U.stopPropagation(), D?.collect(a.current);
            }, children: "Collect" }),
            /* @__PURE__ */ b.jsx(fl, { onClick: (U) => {
              U.stopPropagation(), D?.export(a.current);
            }, children: "Export" })
          ] }),
          /* @__PURE__ */ b.jsx(ac, { className: "gallery-selection-overflow" }),
          /* @__PURE__ */ b.jsx(Ll, { children: /* @__PURE__ */ b.jsx(fl, { onClick: () => D?.hide(), children: "Hide selected" }) }),
          /* @__PURE__ */ b.jsx(ac, {}),
          /* @__PURE__ */ b.jsx(Ll, { children: /* @__PURE__ */ b.jsxs(fl, { variant: "destructive", onClick: () => D?.delete(), children: [
            /* @__PURE__ */ b.jsx(kb, { "data-icon": "inline-start" }),
            " Move to Trash"
          ] }) })
        ] })
      ] }),
      /* @__PURE__ */ b.jsx(lr, { label: "Clear selection (Esc)", children: /* @__PURE__ */ b.jsx(ct, { variant: "ghost", size: "icon-sm", "aria-label": "Clear selection", "data-gallery-selection-action": "clear", onClick: () => D?.clear(), children: /* @__PURE__ */ b.jsx(fi, {}) }) })
    ] });
  }
  return /* @__PURE__ */ b.jsxs("div", { className: "gallery-command-bar", role: "toolbar", "aria-label": "Gallery commands", "data-gallery-toolbar-state": "normal", children: [
    /* @__PURE__ */ b.jsxs("div", { className: "gallery-command-group", "data-gallery-group": "filter", role: "group", "aria-label": "Search and filter gallery", children: [
      /* @__PURE__ */ b.jsxs($d, { open: i, onOpenChange: (D) => {
        u(D), D && p(!1);
      }, children: [
        /* @__PURE__ */ b.jsx(lr, { label: x ? "Edit search" : "Search files (/)", children: /* @__PURE__ */ b.jsx(
          Wd,
          {
            render: /* @__PURE__ */ b.jsx(
              ct,
              {
                variant: "ghost",
                size: "icon-sm",
                "data-gallery-command": "search-trigger",
                "data-gallery-active": x ? "true" : void 0,
                "aria-label": x ? `Search files: ${x}` : "Search files",
                "aria-pressed": i,
                children: /* @__PURE__ */ b.jsx(op, {})
              }
            )
          }
        ) }),
        /* @__PURE__ */ b.jsxs(ep, { align: "start", sideOffset: 6, className: "gallery-search-popover tw:gap-0 tw:p-2", children: [
          /* @__PURE__ */ b.jsx(kc, { className: "tw:sr-only", children: "Search project files" }),
          /* @__PURE__ */ b.jsx(xp, { className: "tw:sr-only", children: "Search by file name or folder" }),
          /* @__PURE__ */ b.jsxs(Dc, { "data-gallery-command-group": "search", children: [
            /* @__PURE__ */ b.jsx(
              jc,
              {
                "aria-label": "Search project files",
                "data-gallery-command": "search",
                placeholder: "Search by name or folder…",
                value: x,
                onChange: (D) => H(D.target.value),
                autoFocus: !0
              }
            ),
            /* @__PURE__ */ b.jsx(hi, { align: "inline-start", "aria-hidden": "true", children: /* @__PURE__ */ b.jsx(op, {}) }),
            x && /* @__PURE__ */ b.jsx(hi, { align: "inline-end", children: /* @__PURE__ */ b.jsx(bp, { size: "icon-xs", "aria-label": "Clear search", onClick: () => H(""), children: /* @__PURE__ */ b.jsx(fi, {}) }) })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ b.jsxs($d, { open: f, onOpenChange: (D) => {
        p(D), D && u(!1);
      }, children: [
        /* @__PURE__ */ b.jsx(
          Wd,
          {
            render: /* @__PURE__ */ b.jsxs(
              ct,
              {
                ref: o,
                variant: "ghost",
                size: "sm",
                "data-gallery-command": "filters",
                "data-gallery-active": L ? "true" : void 0,
                "aria-label": L ? `Filters, ${L} active` : "Filters",
                children: [
                  /* @__PURE__ */ b.jsx(iE, { "data-icon": "inline-start" }),
                  /* @__PURE__ */ b.jsxs("span", { className: "gallery-filter-label", children: [
                    "Filters",
                    L ? ` ${L}` : ""
                  ] })
                ]
              }
            )
          }
        ),
        /* @__PURE__ */ b.jsx(
          ep,
          {
            align: "start",
            sideOffset: 6,
            finalFocus: o,
            className: "gallery-filter-popover tw:w-[min(320px,calc(100vw-24px))] tw:gap-0 tw:p-0",
            children: /* @__PURE__ */ b.jsx(
              jA,
              {
                state: N,
                folder: C,
                collectionItems: A
              }
            )
          }
        )
      ] }),
      /* @__PURE__ */ b.jsxs(
        ct,
        {
          variant: "ghost",
          size: "sm",
          "data-gallery-command": "favorites",
          "aria-label": "Favorites",
          "aria-pressed": _,
          onClick: () => Zr("favChip"),
          children: [
            /* @__PURE__ */ b.jsx(rp, { "data-icon": "inline-start", fill: _ ? "currentColor" : "none" }),
            /* @__PURE__ */ b.jsx("span", { className: "gallery-fav-label", children: "Favorites" })
          ]
        }
      ),
      /* @__PURE__ */ b.jsxs($d, { open: m, onOpenChange: g, children: [
        /* @__PURE__ */ b.jsx(Wd, { render: /* @__PURE__ */ b.jsxs(ct, { variant: "ghost", size: "sm", "data-gallery-command": "collection", "data-gallery-active": Q ? "true" : void 0, "aria-label": "Collections", children: [
          /* @__PURE__ */ b.jsx(uE, { "data-icon": "inline-start" }),
          /* @__PURE__ */ b.jsx("span", { className: "gallery-collection-label", children: "Collection" })
        ] }) }),
        /* @__PURE__ */ b.jsxs(ep, { align: "start", className: "tw:flex tw:flex-col tw:gap-1 tw:w-56 tw:p-1", children: [
          /* @__PURE__ */ b.jsx(kc, { className: "tw:sr-only", children: "Collections" }),
          /* @__PURE__ */ b.jsxs(ct, { variant: "ghost", size: "sm", className: "tw:w-full tw:justify-start", onClick: () => {
            Z(), g(!1);
          }, children: [
            /* @__PURE__ */ b.jsx(vi, { "data-icon": "inline-start", className: Q ? "tw:opacity-0" : "" }),
            "All collections"
          ] }),
          A.map((D) => /* @__PURE__ */ b.jsxs(ct, { variant: "ghost", size: "sm", className: "tw:w-full tw:justify-start", onClick: () => {
            D.element.click(), g(!1);
          }, children: [
            /* @__PURE__ */ b.jsx(vi, { "data-icon": "inline-start", className: D.active ? "" : "tw:opacity-0" }),
            Tp(D.label)
          ] }, D.key)),
          /* @__PURE__ */ b.jsx(ta, { className: "tw:my-1" }),
          /* @__PURE__ */ b.jsxs(Dc, { children: [
            /* @__PURE__ */ b.jsx(
              jc,
              {
                value: d,
                onChange: (D) => v(D.target.value),
                onKeyDown: (D) => {
                  D.key === "Enter" && (D.preventDefault(), q());
                },
                placeholder: "New collection…",
                "aria-label": "New collection name"
              }
            ),
            /* @__PURE__ */ b.jsx(hi, { align: "inline-end", children: /* @__PURE__ */ b.jsx(bp, { size: "icon-xs", "aria-label": "Create collection", disabled: !d.trim(), onClick: q, children: /* @__PURE__ */ b.jsx(Db, {}) }) })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ b.jsxs(oc, { modal: !1, children: [
        /* @__PURE__ */ b.jsx(rc, { render: /* @__PURE__ */ b.jsxs(ct, { variant: "ghost", size: "sm", "data-gallery-command": "status", "data-gallery-active": F ? "true" : void 0, "aria-label": "Filter by status", children: [
          /* @__PURE__ */ b.jsx(lE, { "data-icon": "inline-start" }),
          /* @__PURE__ */ b.jsx("span", { className: "gallery-status-label", children: "Status" })
        ] }) }),
        /* @__PURE__ */ b.jsx(ii, { align: "start", className: "tw:w-48", children: /* @__PURE__ */ b.jsx(Ll, { children: O.map((D) => /* @__PURE__ */ b.jsx(
          vb,
          {
            checked: D.active,
            "data-gallery-status": D.key,
            onClick: () => D.element.click(),
            children: D.label
          },
          D.key || "all"
        )) }) })
      ] })
    ] }),
    /* @__PURE__ */ b.jsx(ta, { orientation: "vertical", className: "gallery-command-sep" }),
    /* @__PURE__ */ b.jsxs("div", { className: "gallery-command-group", "data-gallery-group": "order", role: "group", "aria-label": "Sort gallery", children: [
      /* @__PURE__ */ b.jsxs(iS, { items: k, modal: !1, value: S?.value ?? "mtime", onValueChange: (D) => D && Ep("sort", D), children: [
        /* @__PURE__ */ b.jsx(
          uS,
          {
            size: "sm",
            className: "gallery-command-select gallery-command-sort",
            "aria-label": `Sort project files: ${tp(S?.value ?? "mtime")}`,
            children: /* @__PURE__ */ b.jsx(cS, { children: (D) => tp(String(D)) })
          }
        ),
        /* @__PURE__ */ b.jsx(fS, { children: /* @__PURE__ */ b.jsx(sS, { children: k.map((D) => /* @__PURE__ */ b.jsx(dS, { value: D.value, children: D.label }, D.value)) }) })
      ] }),
      /* @__PURE__ */ b.jsx(lr, { label: te ? "Reverse sort direction" : "No reverse for this sort", children: /* @__PURE__ */ b.jsx(
        ct,
        {
          variant: "ghost",
          size: "icon-sm",
          "data-gallery-command": "sort-dir",
          "aria-label": "Reverse sort direction",
          disabled: !te,
          onClick: () => te && Ep("sort", te),
          children: /* @__PURE__ */ b.jsx(J1, {})
        }
      ) })
    ] }),
    /* @__PURE__ */ b.jsx(ta, { orientation: "vertical", className: "gallery-command-sep" }),
    /* @__PURE__ */ b.jsxs("div", { className: "gallery-command-group", "data-gallery-group": "display", role: "group", "aria-label": "Display and gallery tools", children: [
      /* @__PURE__ */ b.jsxs(oc, { modal: !1, children: [
        /* @__PURE__ */ b.jsx(rc, { render: /* @__PURE__ */ b.jsxs(ct, { variant: "ghost", size: "sm", "data-gallery-command": "view", "aria-label": "View options", children: [
          /* @__PURE__ */ b.jsx(Sv, { "data-icon": "inline-start" }),
          /* @__PURE__ */ b.jsx("span", { className: "gallery-view-label", children: "View" })
        ] }) }),
        /* @__PURE__ */ b.jsx(ii, { align: "end", className: "tw:w-44", children: /* @__PURE__ */ b.jsxs(Ll, { children: [
          /* @__PURE__ */ b.jsx(AM, { children: "Card size" }),
          [{ key: "s", label: "Compact" }, { key: "m", label: "Standard" }, { key: "l", label: "Large" }].map((D) => /* @__PURE__ */ b.jsx(
            vb,
            {
              checked: E === D.key,
              "data-gallery-density": D.key,
              onClick: () => dt("densitySeg")?.querySelector(`[data-d="${D.key}"]`)?.click(),
              children: D.label
            },
            D.key
          ))
        ] }) })
      ] }),
      /* @__PURE__ */ b.jsx(lr, { label: M ? "Rescanning…" : "Rescan project", children: /* @__PURE__ */ b.jsx(
        ct,
        {
          variant: "ghost",
          size: "icon-sm",
          "data-gallery-command": "rescan",
          "aria-label": "Rescan project",
          disabled: M,
          onClick: () => Zr("rescan"),
          children: M ? /* @__PURE__ */ b.jsx(aA, {}) : /* @__PURE__ */ b.jsx(yE, {})
        }
      ) }),
      /* @__PURE__ */ b.jsxs(oc, { modal: !1, children: [
        /* @__PURE__ */ b.jsx(lr, { label: "Gallery tools", children: /* @__PURE__ */ b.jsx(rc, { render: /* @__PURE__ */ b.jsx(ct, { variant: "ghost", size: "icon-sm", "data-gallery-command": "tools", "aria-label": "Gallery tools", children: /* @__PURE__ */ b.jsx(xv, {}) }) }) }),
        /* @__PURE__ */ b.jsxs(ii, { align: "end", className: "tw:w-48", children: [
          /* @__PURE__ */ b.jsx(Ll, { children: /* @__PURE__ */ b.jsxs(fl, { onClick: () => Zr("viewChip"), children: [
            /* @__PURE__ */ b.jsx(jb, { "data-icon": "inline-start" }),
            " Gallery settings…"
          ] }) }),
          /* @__PURE__ */ b.jsx(ac, {}),
          /* @__PURE__ */ b.jsxs(Ll, { children: [
            /* @__PURE__ */ b.jsxs(fl, { onClick: () => Zr("boardChip"), children: [
              /* @__PURE__ */ b.jsx(Sv, { "data-icon": "inline-start" }),
              " Board"
            ] }),
            /* @__PURE__ */ b.jsxs(fl, { onClick: () => Zr("notesChip"), children: [
              /* @__PURE__ */ b.jsx(gE, { "data-icon": "inline-start" }),
              " Notes"
            ] })
          ] }),
          z.length > 0 && /* @__PURE__ */ b.jsxs(b.Fragment, { children: [
            /* @__PURE__ */ b.jsx(ac, {}),
            /* @__PURE__ */ b.jsx(Ll, { children: /* @__PURE__ */ b.jsxs(zM, { children: [
              /* @__PURE__ */ b.jsx(NM, { children: "Recent files" }),
              /* @__PURE__ */ b.jsx(DM, { children: /* @__PURE__ */ b.jsx(Ll, { children: z.map((D) => /* @__PURE__ */ b.jsx(fl, { onClick: () => D.element.click(), children: D.label }, D.key)) }) })
            ] }) })
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ b.jsx("div", { className: "gallery-active-filters", "aria-label": "Active filters", children: j.map((D) => /* @__PURE__ */ b.jsxs(
      ct,
      {
        variant: "outline",
        size: "xs",
        className: "gallery-filter-chip",
        "data-gallery-filter-chip": D.key,
        "aria-label": `Remove filter ${D.label}`,
        onClick: () => D.remove.click(),
        children: [
          D.label,
          /* @__PURE__ */ b.jsx(fi, { "data-icon": "inline-end" })
        ]
      },
      D.key
    )) })
  ] });
}
function HA() {
  const [n, o] = y.useState(null), a = y.useRef(null), i = y.useCallback((f) => {
    const p = a.current;
    p && (a.current = null, o(null), p.resolve(f));
  }, []);
  y.useEffect(() => (window.__galleryConfirm = (f, p = "Delete") => new Promise((m) => {
    a.current && a.current.resolve(!1);
    const g = { message: f, acceptLabel: p, resolve: m };
    a.current = g, o(g);
  }), () => {
    delete window.__galleryConfirm, a.current && a.current.resolve(!1), a.current = null;
  }), []);
  const u = n ? kA(n) : null;
  return /* @__PURE__ */ b.jsx(kO, { open: !!n, onOpenChange: (f) => {
    f || i(!1);
  }, children: /* @__PURE__ */ b.jsxs(UO, { children: [
    /* @__PURE__ */ b.jsxs(LO, { children: [
      u?.destructive && /* @__PURE__ */ b.jsx(PO, { variant: "destructive", children: /* @__PURE__ */ b.jsx(kb, {}) }),
      /* @__PURE__ */ b.jsx(YO, { children: u?.title }),
      u?.description && /* @__PURE__ */ b.jsx(GO, { children: u.description })
    ] }),
    /* @__PURE__ */ b.jsxs(BO, { variant: "plain", children: [
      /* @__PURE__ */ b.jsx(XO, { variant: "ghost", onClick: () => i(!1), children: "Cancel" }),
      /* @__PURE__ */ b.jsx(
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
function UA() {
  const [n, o] = y.useState(document.body.classList.contains("has-insp")), [a, i] = y.useState(() => window.matchMedia("(max-width: 800px)").matches), [u, f] = y.useState(dt("inspTitle")?.textContent || "Inspector"), p = y.useRef(dt("inspector")), m = y.useCallback((g) => {
    const d = dt("inspBody");
    d && g && g.appendChild(d);
  }, []);
  return y.useLayoutEffect(() => () => {
    const g = dt("inspBody");
    g && p.current && p.current.appendChild(g);
  }, []), y.useEffect(() => {
    const g = () => {
      const x = document.documentElement.classList.contains("emb");
      o(!x && document.body.classList.contains("has-insp")), f(dt("inspTitle")?.textContent || "Inspector");
    }, d = new MutationObserver(g);
    d.observe(document.body, { attributes: !0, attributeFilter: ["class"] });
    const v = dt("inspTitle");
    return v && d.observe(v, { childList: !0, characterData: !0, subtree: !0 }), g(), () => d.disconnect();
  }, []), y.useEffect(() => {
    const g = window.matchMedia("(max-width: 800px)"), d = () => i(g.matches);
    return g.addEventListener("change", d), d(), () => g.removeEventListener("change", d);
  }, []), /* @__PURE__ */ b.jsx(
    V2,
    {
      modal: a,
      open: n,
      onOpenChange: (g, d) => {
        if (!g && d.reason === "escape-key") {
          d.cancel(), d.allowPropagation();
          return;
        }
        !g && document.body.classList.contains("has-insp") && Zr("inspClose");
      },
      children: /* @__PURE__ */ b.jsxs(
        G2,
        {
          side: "right",
          layer: a ? "modal" : "panel",
          keepMounted: !0,
          showOverlay: a,
          className: "tw:gap-0 tw:p-0",
          style: { width: "300px", maxWidth: "calc(100vw - 16px)" },
          children: [
            /* @__PURE__ */ b.jsxs(q2, { className: "tw:border-b tw:border-border tw:pr-12", children: [
              /* @__PURE__ */ b.jsx(X2, { children: u }),
              /* @__PURE__ */ b.jsx(F2, { className: "tw:sr-only", children: "File metadata and gallery actions" })
            ] }),
            /* @__PURE__ */ b.jsx("div", { ref: m, className: "tw:flex tw:min-h-0 tw:flex-1 tw:flex-col" })
          ]
        }
      )
    }
  );
}
const Ab = document.getElementById("gallery-react-toolbar");
Ab && Y1.createRoot(Ab).render(
  /* @__PURE__ */ b.jsxs(zA, { children: [
    /* @__PURE__ */ b.jsx(_A, {}),
    /* @__PURE__ */ b.jsx(HA, {}),
    /* @__PURE__ */ b.jsx(UA, {})
  ] })
);
